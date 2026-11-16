use std::path::{Path, PathBuf};

use super::*;

fn input<'a>(
    kind: ShellKind,
    args: &'a [String],
    restore: Option<&'a str>,
    exists: &'a dyn Fn(&Path) -> bool,
) -> HookInput<'a> {
    HookInput {
        kind,
        profile_args: args,
        profile_cwd: PathBuf::from("C:/Users/me"),
        restore_cwd: restore,
        restore_history: &[],
        nonce: None,
        inherited_prompt_command: false,
        inherited_ps0: false,
        inherited_wslenv: None,
        dir_exists: exists,
    }
}

fn env<'a>(plan: &'a SpawnPlan, key: &str) -> Option<&'a str> {
    plan.env
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.as_str())
}

#[test]
fn detects_kinds() {
    assert_eq!(
        shell_kind(r"C:\Program Files\Git\bin\bash.exe"),
        ShellKind::Bash
    );
    assert_eq!(shell_kind("wsl.exe"), ShellKind::Wsl);
    assert_eq!(shell_kind("PWSH.EXE"), ShellKind::Pwsh);
    assert_eq!(shell_kind("powershell.exe"), ShellKind::Pwsh);
    assert_eq!(shell_kind("cmd.exe"), ShellKind::Other);
}

#[test]
fn msys_paths_convert_to_windows() {
    assert_eq!(
        msys_to_windows("/d/code/api").as_deref(),
        Some("D:/code/api")
    );
    assert_eq!(msys_to_windows("/c").as_deref(), Some("C:/"));
    assert_eq!(msys_to_windows("/tmp/x"), None);
    assert_eq!(msys_to_windows("D:/x"), None);
}

#[test]
fn bash_gets_osc7_hook_and_restored_dir() {
    let yes = |_: &Path| true;
    let plan = prepare(&input(ShellKind::Bash, &[], Some("/d/code/api"), &yes));
    assert!(env(&plan, "PROMPT_COMMAND")
        .unwrap()
        .contains("]7;file://localhost%s"));
    if cfg!(windows) {
        assert_eq!(plan.cwd, PathBuf::from("D:/code/api"));
    }
}

#[test]
fn bash_respects_inherited_prompt_command() {
    let yes = |_: &Path| true;
    let mut i = input(ShellKind::Bash, &[], None, &yes);
    i.inherited_prompt_command = true;
    assert!(env(&prepare(&i), "PROMPT_COMMAND").is_none());
}

#[test]
fn missing_restore_dir_falls_back_to_profile_cwd() {
    let no = |_: &Path| false;
    let plan = prepare(&input(ShellKind::Pwsh, &[], Some("D:/gone"), &no));
    assert_eq!(plan.cwd, PathBuf::from("C:/Users/me"));
}

#[test]
fn wsl_forwards_hook_and_restore_dir_via_wslenv() {
    let yes = |_: &Path| true;
    let mut i = input(ShellKind::Wsl, &[], Some("/home/me/api"), &yes);
    i.inherited_wslenv = Some("USERPROFILE/p");
    let plan = prepare(&i);
    assert_eq!(env(&plan, "EMBER_CWD"), Some("/home/me/api"));
    let pc = env(&plan, "PROMPT_COMMAND").unwrap();
    assert!(pc.starts_with("[ -n \"$EMBER_CWD\" ]"));
    assert!(pc.contains("]7;file://localhost%s"));
    assert_eq!(
        env(&plan, "WSLENV"),
        Some("USERPROFILE/p:PROMPT_COMMAND/u:PS0/u:EMBER_CWD/u")
    );
    assert_eq!(plan.cwd, PathBuf::from("C:/Users/me"));
}

#[test]
fn wsl_without_restore_sets_no_ember_cwd() {
    let yes = |_: &Path| true;
    let plan = prepare(&input(ShellKind::Wsl, &[], None, &yes));
    assert!(env(&plan, "EMBER_CWD").is_none());
}

#[test]
fn merge_wslenv_does_not_duplicate() {
    assert_eq!(
        merge_wslenv(
            Some("PROMPT_COMMAND/u"),
            &["PROMPT_COMMAND/u", "EMBER_CWD/u"]
        ),
        "PROMPT_COMMAND/u:EMBER_CWD/u"
    );
    assert_eq!(merge_wslenv(None, &["A/u"]), "A/u");
    assert_eq!(merge_wslenv(Some(""), &["A/u"]), "A/u");
}

#[test]
fn pwsh_gets_encoded_hook() {
    let yes = |_: &Path| true;
    let args = vec!["-NoLogo".to_string()];
    let plan = prepare(&input(ShellKind::Pwsh, &args, Some("D:/code"), &yes));
    assert_eq!(&plan.args[..3], &["-NoLogo", "-NoExit", "-EncodedCommand"]);
    let decoded = decode_utf16le_base64(&plan.args[3]);
    assert!(decoded.contains("]7;file://localhost/"));
    assert!(decoded.contains("$global:__ember_prompt"));
    assert_eq!(plan.cwd, PathBuf::from("D:/code"));
}

#[test]
fn pwsh_hook_skipped_when_profile_has_command() {
    let yes = |_: &Path| true;
    let args = vec!["-Command".to_string(), "Get-Date".to_string()];
    let plan = prepare(&input(ShellKind::Pwsh, &args, None, &yes));
    assert_eq!(plan.args, args);
}

#[test]
fn pwsh_does_not_duplicate_noexit() {
    let yes = |_: &Path| true;
    let args = vec!["-NoExit".to_string()];
    let plan = prepare(&input(ShellKind::Pwsh, &args, None, &yes));
    assert_eq!(
        plan.args
            .iter()
            .filter(|a| a.eq_ignore_ascii_case("-noexit"))
            .count(),
        1
    );
}

#[test]
fn other_shells_get_nothing() {
    let yes = |_: &Path| true;
    let plan = prepare(&input(ShellKind::Other, &[], Some("D:/x"), &yes));
    assert!(plan.env.is_empty());
    assert_eq!(plan.cwd, PathBuf::from("C:/Users/me"));
}

#[test]
fn bash_hook_escapes_percent_and_control_chars_and_keeps_status() {
    let yes = |_: &Path| true;
    let plan = prepare(&input(ShellKind::Bash, &[], None, &yes));
    let pc = env(&plan, "PROMPT_COMMAND").unwrap();
    // `%` must be encoded so a folder literally named "a%20b" round-trips,
    // ESC/BEL must not be able to end the OSC early, and `$?` must survive
    // for whatever the user appends after the hook.
    assert!(pc.contains("${PWD//%/%25}"), "{pc}");
    assert!(pc.contains("%1B") && pc.contains("%07"), "{pc}");
    assert!(
        pc.contains("local s=$?") && pc.contains("return $s"),
        "{pc}"
    );
}

#[test]
fn pwsh_hook_percent_encodes_the_path_as_ascii() {
    let yes = |_: &Path| true;
    let plan = prepare(&input(ShellKind::Pwsh, &[], None, &yes));
    let decoded = decode_utf16le_base64(&plan.args[2]);
    assert!(decoded.contains("EscapeDataString"), "{decoded}");
}

#[test]
fn pwsh_hook_runs_the_original_prompt_before_touching_status() {
    let yes = |_: &Path| true;
    let plan = prepare(&input(ShellKind::Pwsh, &[], None, &yes));
    let decoded = decode_utf16le_base64(&plan.args[2]);
    let original = decoded
        .find("$o = & $global:__ember_prompt")
        .expect("calls original first");
    let write = decoded.find("[Console]::Write").unwrap();
    assert!(original < write, "{decoded}");
}

fn decode_utf16le_base64(s: &str) -> String {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(s).unwrap();
    let units: Vec<u16> = bytes
        .chunks(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16(&units).unwrap()
}

#[test]
fn bash_announces_command_start_and_prompt_for_busy_detection() {
    let yes = |_: &Path| true;
    let plan = prepare(&input(ShellKind::Bash, &[], None, &yes));
    // PS0 is printed right before each command runs; the prompt hook runs when it returns.
    assert!(env(&plan, "PS0").unwrap().contains("133;C"));
    assert!(env(&plan, "PROMPT_COMMAND").unwrap().contains("133;A"));
}

#[test]
fn bash_keeps_a_ps0_the_user_already_has() {
    let yes = |_: &Path| true;
    let mut i = input(ShellKind::Bash, &[], None, &yes);
    i.inherited_ps0 = true;
    assert!(env(&prepare(&i), "PS0").is_none());
}

#[test]
fn wsl_forwards_ps0_too() {
    let yes = |_: &Path| true;
    let plan = prepare(&input(ShellKind::Wsl, &[], None, &yes));
    assert!(env(&plan, "PS0").unwrap().contains("133;C"));
    assert!(env(&plan, "WSLENV").unwrap().contains("PS0/u"));
}

fn hist(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}

#[test]
fn bash_sets_ember_hist_joined_by_newline() {
    let yes = |_: &Path| true;
    let h = hist(&["ls", "git status"]);
    let mut i = input(ShellKind::Bash, &[], None, &yes);
    i.restore_history = &h;
    assert_eq!(env(&prepare(&i), "EMBER_HIST"), Some("ls\ngit status"));
}

#[test]
fn empty_history_sets_no_env() {
    let yes = |_: &Path| true;
    for kind in [ShellKind::Bash, ShellKind::Wsl, ShellKind::Pwsh] {
        assert!(env(&prepare(&input(kind, &[], None, &yes)), "EMBER_HIST").is_none());
    }
}

#[test]
fn history_lines_with_newlines_are_dropped() {
    let yes = |_: &Path| true;
    let h = hist(&["a\nb", "", "c\rd", "ok"]);
    let mut i = input(ShellKind::Bash, &[], None, &yes);
    i.restore_history = &h;
    assert_eq!(env(&prepare(&i), "EMBER_HIST"), Some("ok"));
}

#[test]
fn wsl_forwards_ember_hist() {
    let yes = |_: &Path| true;
    let h = hist(&["ls"]);
    let mut i = input(ShellKind::Wsl, &[], None, &yes);
    i.restore_history = &h;
    let plan = prepare(&i);
    assert_eq!(env(&plan, "EMBER_HIST"), Some("ls"));
    assert!(env(&plan, "WSLENV").unwrap().contains("EMBER_HIST/u"));
}

#[test]
fn pwsh_sets_ember_hist() {
    let yes = |_: &Path| true;
    let h = hist(&["ls"]);
    let mut i = input(ShellKind::Pwsh, &[], None, &yes);
    i.restore_history = &h;
    assert_eq!(env(&prepare(&i), "EMBER_HIST"), Some("ls"));
}

#[test]
fn other_shell_sets_no_ember_hist() {
    let yes = |_: &Path| true;
    let h = hist(&["ls"]);
    let mut i = input(ShellKind::Other, &[], None, &yes);
    i.restore_history = &h;
    assert!(env(&prepare(&i), "EMBER_HIST").is_none());
}

#[test]
fn hooks_emit_command_marks() {
    let yes = |_: &Path| true;
    let bash = prepare(&input(ShellKind::Bash, &[], None, &yes));
    assert!(env(&bash, "PROMPT_COMMAND").unwrap().contains("133;E;"));
    let pwsh = prepare(&input(ShellKind::Pwsh, &[], None, &yes));
    assert!(decode_utf16le_base64(&pwsh.args[2]).contains("133;E;"));
}

/// A token made at run time, like the real one (random per session), not a literal in the source.
fn test_nonce() -> String {
    format!("n{}", std::process::id())
}

fn with_nonce<'a>(mut i: HookInput<'a>, nonce: &'a str, hist: &'a [String]) -> HookInput<'a> {
    i.nonce = Some(nonce);
    i.restore_history = hist;
    i
}

#[test]
fn nonce_and_history_are_set_where_the_hook_is_installed() {
    let yes = |_: &Path| true;
    let h = hist(&["ls"]);
    let tok = test_nonce();
    for kind in [ShellKind::Bash, ShellKind::Wsl, ShellKind::Pwsh] {
        let plan = prepare(&with_nonce(input(kind, &[], None, &yes), &tok, &h));
        assert_eq!(env(&plan, "EMBER_NONCE"), Some(tok.as_str()), "{kind:?}");
        assert_eq!(env(&plan, "EMBER_HIST"), Some("ls"), "{kind:?}");
    }
    let wsl = prepare(&with_nonce(
        input(ShellKind::Wsl, &[], None, &yes),
        &tok,
        &h,
    ));
    assert!(env(&wsl, "WSLENV").unwrap().contains("EMBER_NONCE/u"));
}

#[test]
fn invalid_or_missing_nonce_sets_no_env() {
    let yes = |_: &Path| true;
    let none = prepare(&input(ShellKind::Bash, &[], None, &yes));
    assert!(env(&none, "EMBER_NONCE").is_none());
    for bad in ["", "a;b", "x y", &"a".repeat(65)] {
        let plan = prepare(&with_nonce(
            input(ShellKind::Bash, &[], None, &yes),
            bad,
            &[],
        ));
        assert!(env(&plan, "EMBER_NONCE").is_none(), "{bad:?}");
    }
}

#[test]
fn bash_with_inherited_prompt_command_gets_no_hook_env() {
    let yes = |_: &Path| true;
    let h = hist(&["ls"]);
    let tok = test_nonce();
    let mut i = with_nonce(input(ShellKind::Bash, &[], None, &yes), &tok, &h);
    i.inherited_prompt_command = true;
    let plan = prepare(&i);
    // Nothing would unset these, so they must not leak into every child process.
    assert!(env(&plan, "EMBER_HIST").is_none());
    assert!(env(&plan, "EMBER_NONCE").is_none());
}

#[test]
fn pwsh_running_a_command_or_file_gets_no_hook_env() {
    let yes = |_: &Path| true;
    let h = hist(&["ls"]);
    let args = vec!["-Command".to_string(), "x".to_string()];
    let tok = test_nonce();
    let plan = prepare(&with_nonce(
        input(ShellKind::Pwsh, &args, None, &yes),
        &tok,
        &h,
    ));
    assert!(env(&plan, "EMBER_HIST").is_none());
    assert!(env(&plan, "EMBER_NONCE").is_none());
}

#[test]
fn restored_history_keeps_only_the_newest_ten_short_lines() {
    let yes = |_: &Path| true;
    let many: Vec<String> = (0..15).map(|n| format!("c{n}")).collect();
    let mut i = input(ShellKind::Bash, &[], None, &yes);
    i.restore_history = &many;
    let value = env(&prepare(&i), "EMBER_HIST").unwrap().to_string();
    assert_eq!(value.lines().count(), 10);
    assert!(value.starts_with("c5\n") && value.ends_with("c14"));

    let long = vec!["x".repeat(1001), "ok".to_string()];
    i.restore_history = &long;
    assert_eq!(env(&prepare(&i), "EMBER_HIST"), Some("ok"));
}

/// A real bash for the end-to-end test. On Windows `bash` on PATH is usually the WSL launcher, which
/// is not the shell this hook runs in, so only Git Bash is used there.
fn test_bash() -> Option<std::path::PathBuf> {
    let path = if cfg!(windows) {
        std::path::PathBuf::from(r"C:\Program Files\Git\bin\bash.exe")
    } else {
        std::path::PathBuf::from("bash")
    };
    std::process::Command::new(&path)
        .arg("--version")
        .output()
        .is_ok()
        .then_some(path)
}

/// Runs the real bash hook in an interactive bash; skipped where bash is not installed.
#[test]
fn bash_hook_end_to_end() {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let Some(bash) = test_bash() else { return };
    let dir = tempfile::tempdir().unwrap();
    let hist_file = dir.path().join("hist");
    let tok = test_nonce();
    let mut child = Command::new(bash)
        .args(["--norc", "--noprofile", "-i"])
        .env("PROMPT_COMMAND", BASH_OSC7)
        .env("EMBER_HIST", "-n x\necho $HOME `id`")
        .env("EMBER_NONCE", &tok)
        .env("HISTFILE", hist_file.to_string_lossy().replace('\\', "/"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"history\n hidden\necho 'a;b%c'\n\necho x\nexit\n")
        .unwrap();
    let out = String::from_utf8_lossy(&child.wait_with_output().unwrap().stdout).into_owned();

    // Seeded lines are literal history entries, never executed or expanded.
    assert!(
        out.contains("-n x") && out.contains("echo $HOME `id`"),
        "{out}"
    );
    // The command is encoded and carries the nonce; a leading space survives so the app can drop it.
    assert!(
        out.contains(&format!("133;E;{tok};echo 'a%3Bb%25c'")),
        "{out}"
    );
    assert!(out.contains(&format!("133;E;{tok}; hidden")), "{out}");
    // history, hidden, echo a;b, echo x: not the seeds, not an empty Enter.
    assert_eq!(out.matches("133;E;").count(), 4, "{out}");
    // Seeds stay in memory but are not appended to the user's history file on exit.
    let saved = std::fs::read_to_string(&hist_file).unwrap_or_default();
    assert!(
        saved.contains("echo x"),
        "bash did not save history: {saved:?}"
    );
    assert!(!saved.contains("echo $HOME"), "{saved:?}");
}
