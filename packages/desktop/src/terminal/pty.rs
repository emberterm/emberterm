use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter};

use super::events::SessionExitPayload;
use super::flow::FlowControl;
use super::output::OutputPipe;
use super::session::{Session, SessionId};
use super::shell_hooks;

/// Spawns a PTY session using `profile` (or the platform default shell when
/// `None`) and starts the threads that read its output and send it to the
/// webview over `on_output`.
pub fn spawn_session(
    session_id: SessionId,
    profile: Option<&crate::profile::Profile>,
    restore_cwd: Option<&str>,
    restore_history: &[String],
    on_output: Channel,
    app: AppHandle,
) -> Result<Session> {
    let pty_system = native_pty_system();

    let pty_pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .context("failed to open PTY")?;

    let shell = profile
        .map(|p| p.shell.clone())
        .unwrap_or_else(super::which::default_shell);

    let profile_args = profile
        .map(|p| p.args.clone())
        .unwrap_or_else(super::which::default_args);
    let profile_cwd = profile
        .map(|p| p.resolved_cwd())
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")));
    let wslenv = std::env::var("WSLENV").ok();
    let plan = shell_hooks::prepare(&shell_hooks::HookInput {
        kind: shell_hooks::shell_kind(&shell),
        profile_args: &profile_args,
        profile_cwd,
        restore_cwd,
        restore_history,
        inherited_prompt_command: std::env::var_os("PROMPT_COMMAND").is_some(),
        inherited_ps0: std::env::var_os("PS0").is_some(),
        inherited_wslenv: wslenv.as_deref(),
        dir_exists: &|p: &std::path::Path| p.is_dir(),
    });

    let mut cmd = CommandBuilder::new(&shell);
    cmd.args(&plan.args);
    cmd.cwd(&plan.cwd);
    if let Some(p) = profile {
        for (k, v) in &p.env {
            cmd.env(k, v);
        }
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }
    for (k, v) in &plan.env {
        cmd.env(k, v);
    }

    let mut child = pty_pair
        .slave
        .spawn_command(cmd)
        .context("failed to spawn shell")?;

    let mut reader = pty_pair
        .master
        .try_clone_reader()
        .context("failed to clone PTY reader")?;

    let writer: Arc<Mutex<Box<dyn std::io::Write + Send>>> = Arc::new(Mutex::new(
        pty_pair
            .master
            .take_writer()
            .context("failed to take PTY writer")?,
    ));

    let app_clone = app.clone();
    let sid = session_id.clone();
    let pid = child.process_id();
    let exit_once = Arc::new(ExitOnce::default());

    // On Windows ConPTY the reader gets no EOF when the shell exits, so wait on the process itself.
    let (wait_app, wait_sid, wait_once) = (app.clone(), session_id.clone(), exit_once.clone());
    std::thread::Builder::new()
        .name(format!("pty-wait-{wait_sid}"))
        .spawn(move || {
            let code = child
                .wait()
                .map(|s| i32::try_from(s.exit_code()).unwrap_or(-1))
                .unwrap_or(-1);
            emit_exit(&wait_app, &wait_sid, code, &wait_once);
        })
        .context("failed to spawn PTY wait thread")?;

    // Reading and sending are decoupled: one IPC send per ConPTY chunk is what made floods slow.
    let pipe = Arc::new(OutputPipe::default());
    let flow = Arc::new(FlowControl::default());
    let sender_flow = flow.clone();
    let reader_pipe = pipe.clone();
    std::thread::Builder::new()
        .name(format!("pty-reader-{sid}"))
        .spawn(move || {
            let _close = OnDrop(|| reader_pipe.close());
            let mut buf = vec![0u8; 8192];
            while let Ok(n @ 1..) = reader.read(&mut buf) {
                if !reader_pipe.push(&buf[..n]) {
                    break;
                }
            }
        })
        .context("failed to spawn PTY reader thread")?;

    std::thread::Builder::new()
        .name(format!("pty-sender-{sid}"))
        .spawn(move || {
            // Reports the exit after the last output is sent, also when this thread panics.
            let _exit_guard = OnDrop(|| {
                pipe.close();
                emit_exit(&app_clone, &sid, 0, &exit_once);
            });
            // Waiting before taking a batch leaves output in the pipe, so a webview that falls
            // behind stalls the reader (and the shell) instead of growing a queue anywhere.
            while sender_flow.wait_for_room() {
                let Some(bytes) = pipe.next_batch() else { break };
                sender_flow.sent(bytes.len());
                if let Err(e) = on_output.send(InvokeResponseBody::Raw(bytes)) {
                    tracing::debug!(session_id = %sid, error = %e, "output channel closed; stopping sender");
                    break;
                }
            }
        })
        .context("failed to spawn PTY sender thread")?;

    Ok(Session {
        master: pty_pair.master,
        writer,
        pid,
        flow,
    })
}

/// The wait thread and the reader thread both notice a shell exiting; only the first reports it.
#[derive(Default)]
pub(crate) struct ExitOnce(AtomicBool);

impl ExitOnce {
    fn first(&self) -> bool {
        !self.0.swap(true, Ordering::SeqCst)
    }
}

fn emit_exit(app: &AppHandle, session_id: &str, code: i32, once: &ExitOnce) {
    if !once.first() {
        return;
    }
    let _ = app.emit(
        "terminal:exit",
        SessionExitPayload {
            session_id: session_id.to_string(),
            code,
        },
    );
}

/// Runs a closure on drop — including during a panic unwind — so the
/// frontend always learns that a pane's reader thread has stopped.
pub(crate) struct OnDrop<F: FnMut()>(pub F);

impl<F: FnMut()> Drop for OnDrop<F> {
    fn drop(&mut self) {
        (self.0)();
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn on_drop_runs_during_panic() {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;
        let ran = Arc::new(AtomicBool::new(false));
        let flag = ran.clone();
        let result = std::panic::catch_unwind(move || {
            let _g = super::OnDrop(move || flag.store(true, Ordering::SeqCst));
            panic!("boom");
        });
        assert!(result.is_err());
        assert!(ran.load(Ordering::SeqCst));
    }

    #[test]
    fn exit_is_reported_once_whichever_thread_gets_there_first() {
        let once = super::ExitOnce::default();
        assert!(once.first());
        assert!(!once.first());
    }
}
