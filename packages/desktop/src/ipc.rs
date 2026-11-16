use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use crate::config::Config;
use crate::fsutil::StartupWarning;
use crate::profile::Profile;
use crate::session_store::SavedSession;
use crate::state::{lock_or_recover, AppState};
use crate::terminal::pty;
use crate::terminal::session::SessionId;

// ── Session commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn session_create(
    profile_id: Option<String>,
    cwd: Option<String>,
    history: Option<Vec<String>>,
    on_output: Channel,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SessionId, String> {
    let session_id = state.next_session_id();

    // Resolve which profile to use:
    //   1. The explicitly requested profile_id, if provided.
    //   2. The config's default_profile setting.
    //   3. The first profile in the list.
    //   4. An inline default (no-clone fallback).
    let profile: Option<crate::profile::Profile> = {
        let profiles = lock_or_recover(&state.profiles);
        let cfg = lock_or_recover(&state.config);
        if let Some(ref id) = profile_id {
            profiles.iter().find(|p| p.id == *id).cloned()
        } else {
            let default_id = cfg.behavior.default_profile.clone();
            profiles
                .iter()
                .find(|p| p.id == default_id)
                .or_else(|| profiles.first())
                .cloned()
        }
    };

    let session = pty::spawn_session(
        session_id.clone(),
        profile.as_ref(),
        cwd.as_deref(),
        &history.unwrap_or_default(),
        on_output,
        app,
    )
    .map_err(|e| e.to_string())?;
    lock_or_recover(&state.sessions).insert(session_id.clone(), session);
    tracing::info!(
        session_id = %session_id,
        profile = profile.as_ref().map(|p| p.id.as_str()).unwrap_or("default"),
        "session created"
    );
    Ok(session_id)
}

#[tauri::command]
pub async fn session_write(
    id: SessionId,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Clone Arc while holding sessions lock, then release before locking writer.
    let writer_arc = {
        let sessions = lock_or_recover(&state.sessions);
        sessions
            .get(&id)
            .ok_or_else(|| format!("session {id} not found"))?
            .writer
            .clone()
    };
    let mut writer = lock_or_recover(&writer_arc);
    use std::io::Write;
    writer.write_all(&data).map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn session_resize(
    id: SessionId,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let sessions = lock_or_recover(&state.sessions);
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("session {id} not found"))?;
    session
        .master
        .resize(portable_pty::PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// True while a program is still running inside the session's shell (not just an idle prompt).
#[tauri::command]
pub async fn session_busy(id: SessionId, state: State<'_, AppState>) -> Result<bool, String> {
    let pid = lock_or_recover(&state.sessions)
        .get(&id)
        .ok_or_else(|| format!("session {id} not found"))?
        .pid;
    let Some(pid) = pid else { return Ok(false) };
    tokio::task::spawn_blocking(move || {
        crate::terminal::busy::has_busy_child(pid, &crate::terminal::busy::snapshot())
    })
    .await
    .map_err(|e| e.to_string())
}

/// The webview parsed `bytes` more of this session's output; lets a waiting sender go on.
#[tauri::command]
pub async fn session_ack(
    id: SessionId,
    bytes: usize,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // An ack racing a tab close is normal: there is no sender left to release.
    if let Some(session) = lock_or_recover(&state.sessions).get(&id) {
        session.flow.ack(bytes);
    }
    Ok(())
}

#[tauri::command]
pub async fn session_close(id: SessionId, state: State<'_, AppState>) -> Result<(), String> {
    lock_or_recover(&state.sessions).remove(&id);
    tracing::info!(session_id = %id, "session closed");
    Ok(())
}

/// Warnings collected while loading config and profiles at startup. Drained on read.
#[tauri::command]
pub async fn startup_warnings(state: State<'_, AppState>) -> Result<Vec<StartupWarning>, String> {
    Ok(std::mem::take(&mut *lock_or_recover(&state.warnings)))
}

#[derive(serde::Serialize)]
pub struct SessionLoad {
    pub session: Option<SavedSession>,
    pub warning: Option<StartupWarning>,
}

#[tauri::command]
pub async fn session_load() -> SessionLoad {
    match crate::session_store::session_path() {
        Some(path) => {
            let (session, warning) = crate::session_store::load_from(&path);
            SessionLoad { session, warning }
        }
        None => SessionLoad {
            session: None,
            warning: None,
        },
    }
}

#[tauri::command]
pub async fn session_save(session: SavedSession) -> Result<(), String> {
    let path = crate::session_store::session_path().ok_or("no config directory")?;
    crate::session_store::save_to(&path, &session).map_err(|e| e.to_string())
}

// ── Config commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn config_get(state: State<'_, AppState>) -> Result<Config, String> {
    Ok(lock_or_recover(&state.config).clone())
}

#[tauri::command]
pub async fn config_update(
    patch: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<Config, String> {
    let mut cfg = lock_or_recover(&state.config);
    let mut current = serde_json::to_value(cfg.clone()).map_err(|e| e.to_string())?;
    json_merge(&mut current, patch);
    let updated: Config = serde_json::from_value(current).map_err(|e| e.to_string())?;
    // Save first: if the file on disk is broken, memory must not drift from it.
    updated.save().map_err(|e| e.to_string())?;
    *cfg = updated;
    Ok(cfg.clone())
}

// ── Profile commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn profile_list(state: State<'_, AppState>) -> Result<Vec<Profile>, String> {
    Ok(lock_or_recover(&state.profiles).clone())
}

#[tauri::command]
pub async fn profile_upsert(profile: Profile, state: State<'_, AppState>) -> Result<(), String> {
    crate::profile::save_profile(&profile).map_err(|e| e.to_string())?;
    let mut profiles = lock_or_recover(&state.profiles);
    match profiles.iter_mut().find(|p| p.id == profile.id) {
        Some(existing) => *existing = profile,
        None => profiles.push(profile),
    }
    Ok(())
}

#[tauri::command]
pub async fn profile_delete(id: String, state: State<'_, AppState>) -> Result<(), String> {
    crate::profile::delete_profile(&id).map_err(|e| e.to_string())?;
    let mut profiles = lock_or_recover(&state.profiles);
    profiles.retain(|p| p.id != id);
    Ok(())
}

/// Richer git status for the status bar: branch, dirty flag, and line diff counts.
#[derive(serde::Serialize, Clone)]
pub struct GitStatus {
    pub branch: Option<String>,
    pub dirty: bool,
    pub insertions: u32,
    pub deletions: u32,
}

#[tauri::command]
pub async fn git_status(cwd: String) -> Result<GitStatus, String> {
    tokio::task::spawn_blocking(move || {
        // Normalise MINGW/Cygwin paths (/d/foo → D:/foo) so Windows git can
        // resolve the directory regardless of which shell reported the cwd.
        let cwd = normalise_cwd(&cwd);
        let no_repo = GitStatus {
            branch: None,
            dirty: false,
            insertions: 0,
            deletions: 0,
        };
        let Some(cwd) = crate::git::safe_cwd(&cwd) else {
            return no_repo;
        };

        // Branch name
        let branch = git_run(cwd, &["rev-parse", "--abbrev-ref", "HEAD"])
            .filter(|b| !b.is_empty() && b != "HEAD");

        if branch.is_none() {
            return no_repo;
        }

        // Any uncommitted changes (staged or unstaged)?
        let dirty = crate::git::command(cwd)
            .args(["status", "--porcelain"])
            .output()
            .map(|o| o.status.success() && !o.stdout.is_empty())
            .unwrap_or(false);

        // Line counts vs HEAD (staged + unstaged)
        let (insertions, deletions) = git_run(cwd, &["diff", "HEAD", "--shortstat"])
            .map(|s| parse_shortstat(&s))
            .unwrap_or((0, 0));

        GitStatus {
            branch,
            dirty,
            insertions,
            deletions,
        }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Convert MINGW/Cygwin-style Unix paths to Windows paths so Rust's
/// `Command::current_dir` and git can resolve them.
/// `/d/foo/bar` → `D:/foo/bar`   (any single-letter drive prefix)
/// All other paths are returned unchanged.
fn normalise_cwd(cwd: &str) -> String {
    // Detect /X/... where X is a single ASCII letter (MINGW drive letter)
    if let Some(rest) = cwd.strip_prefix('/') {
        let mut chars = rest.chars();
        if let Some(drive) = chars.next() {
            if drive.is_ascii_alphabetic() {
                let after = chars.as_str();
                if after.is_empty() || after.starts_with('/') {
                    return format!("{}:{}", drive.to_ascii_uppercase(), after);
                }
            }
        }
    }
    cwd.to_string()
}

fn git_run(cwd: &str, args: &[&str]) -> Option<String> {
    let out = crate::git::command(cwd).args(args).output().ok()?;
    if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        None
    }
}

/// Parse `git diff --shortstat` output: " 3 files changed, 12 insertions(+), 7 deletions(-)"
fn parse_shortstat(s: &str) -> (u32, u32) {
    fn extract(s: &str, marker: &str) -> u32 {
        s.find(marker)
            .and_then(|pos| s[..pos].trim_end().rsplit_once(' ').map(|(_, n)| n))
            .and_then(|n| n.trim_end_matches(',').parse().ok())
            .unwrap_or(0)
    }
    (extract(s, "insertion"), extract(s, "deletion"))
}

/// Returns true when no `config.toml` exists yet — used to show the welcome screen.
#[tauri::command]
pub async fn config_is_first_run() -> bool {
    match crate::config::config_path().and_then(|p| p.parent().map(std::path::Path::to_path_buf)) {
        Some(dir) => crate::config::is_first_run_in(&dir),
        None => false,
    }
}

// ── Built-in profile detection ───────────────────────────────────────────────

/// A shell candidate that EmberTerm knows about but hasn't been saved by the user yet.
#[derive(serde::Serialize, Clone)]
pub struct BuiltinProfileSpec {
    pub id: String,
    pub name: String,
    pub shell: String,
    pub args: Vec<String>,
    pub description: String,
}

/// Return `true` when `name` is found on PATH (scans PATH directly; no process spawn).
fn probe(name: &str) -> bool {
    crate::terminal::which::on_path(name)
}

/// Scan the system for well-known shells and return those that are available.
/// The list is ordered: most-common first. Already-saved user profiles are
/// filtered out on the frontend by comparing shell paths.
#[tauri::command]
pub async fn detect_builtin_profiles() -> Vec<BuiltinProfileSpec> {
    tokio::task::spawn_blocking(|| {
        let mut specs: Vec<BuiltinProfileSpec> = Vec::new();

        #[cfg(windows)]
        {
            // cmd.exe — always present
            if std::path::Path::new("C:/Windows/System32/cmd.exe").exists() {
                specs.push(BuiltinProfileSpec {
                    id: "builtin-cmd".into(),
                    name: "Command Prompt".into(),
                    shell: "cmd.exe".into(),
                    args: vec![],
                    description: "Windows Command Prompt".into(),
                });
            }

            // Windows PowerShell 5 — ships with every Windows 10/11
            if std::path::Path::new("C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe")
                .exists()
                || probe("powershell.exe")
            {
                specs.push(BuiltinProfileSpec {
                    id: "builtin-powershell5".into(),
                    name: "Windows PowerShell".into(),
                    shell: "powershell.exe".into(),
                    args: vec!["-NoLogo".into()],
                    description: "PowerShell 5 (built into Windows)".into(),
                });
            }

            // PowerShell 7+ (pwsh)
            if probe("pwsh.exe") {
                specs.push(BuiltinProfileSpec {
                    id: "builtin-pwsh".into(),
                    name: "PowerShell".into(),
                    shell: "pwsh.exe".into(),
                    args: vec!["-NoLogo".into()],
                    description: "PowerShell 7+".into(),
                });
            }

            // Git Bash — check standard installation paths
            let local_app = std::env::var("LOCALAPPDATA").unwrap_or_default();
            let local_git = format!("{}/Programs/Git/bin/bash.exe", local_app.replace('\\', "/"));
            let git_bash_candidates = [
                "C:/Program Files/Git/bin/bash.exe",
                "C:/Program Files (x86)/Git/bin/bash.exe",
                local_git.as_str(),
            ];
            if let Some(path) = git_bash_candidates
                .iter()
                .find(|p| std::path::Path::new(p).exists())
            {
                specs.push(BuiltinProfileSpec {
                    id: "builtin-gitbash".into(),
                    name: "Git Bash".into(),
                    shell: path.to_string(),
                    args: vec!["--login".into(), "-i".into()],
                    description: "Git for Windows Bash shell".into(),
                });
            }

            // WSL — wsl.exe lives in System32 on supported Windows builds
            if std::path::Path::new("C:/Windows/System32/wsl.exe").exists() || probe("wsl.exe") {
                specs.push(BuiltinProfileSpec {
                    id: "builtin-wsl".into(),
                    name: "WSL".into(),
                    shell: "wsl.exe".into(),
                    args: vec![],
                    description: "Windows Subsystem for Linux".into(),
                });
            }

            // Docker
            if probe("docker.exe") || probe("docker") {
                specs.push(BuiltinProfileSpec {
                    id: "builtin-docker".into(),
                    name: "Docker".into(),
                    shell: "docker".into(),
                    args: vec![
                        "run".into(),
                        "-it".into(),
                        "--rm".into(),
                        "ubuntu".into(),
                        "/bin/bash".into(),
                    ],
                    description: "Docker container (ubuntu)".into(),
                });
            }
        }

        #[cfg(not(windows))]
        {
            // (path, name, id, args, description)
            type ShellCandidate = (
                &'static str,
                &'static str,
                &'static str,
                &'static [&'static str],
                &'static str,
            );
            let shell_candidates: &[ShellCandidate] = &[
                ("/bin/zsh", "Zsh", "builtin-zsh", &[], "Z Shell"),
                (
                    "/bin/bash",
                    "Bash",
                    "builtin-bash",
                    &[],
                    "Bourne Again Shell",
                ),
                (
                    "/usr/bin/fish",
                    "Fish",
                    "builtin-fish",
                    &[],
                    "Friendly Interactive Shell",
                ),
                (
                    "/usr/local/bin/fish",
                    "Fish",
                    "builtin-fish",
                    &[],
                    "Friendly Interactive Shell",
                ),
                ("/bin/sh", "sh", "builtin-sh", &[], "POSIX Shell"),
            ];
            let mut seen_fish = false;
            for (path, name, id, args, desc) in shell_candidates {
                if *id == "builtin-fish" {
                    if seen_fish {
                        continue;
                    }
                    seen_fish = true;
                }
                if std::path::Path::new(path).exists() {
                    specs.push(BuiltinProfileSpec {
                        id: id.to_string(),
                        name: name.to_string(),
                        shell: path.to_string(),
                        args: args.iter().map(|s| s.to_string()).collect(),
                        description: desc.to_string(),
                    });
                }
            }
            if probe("docker") {
                specs.push(BuiltinProfileSpec {
                    id: "builtin-docker".into(),
                    name: "Docker".into(),
                    shell: "docker".into(),
                    args: vec![
                        "run".into(),
                        "-it".into(),
                        "--rm".into(),
                        "ubuntu".into(),
                        "/bin/bash".into(),
                    ],
                    description: "Docker container (ubuntu)".into(),
                });
            }
        }

        specs
    })
    .await
    .unwrap_or_default()
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn json_merge(base: &mut serde_json::Value, patch: serde_json::Value) {
    match (base, patch) {
        (serde_json::Value::Object(b), serde_json::Value::Object(p)) => {
            for (k, v) in p {
                json_merge(b.entry(k).or_insert(serde_json::Value::Null), v);
            }
        }
        (base, patch) => *base = patch,
    }
}
