use std::path::{Path, PathBuf};

use base64::Engine;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellKind {
    Bash,
    Wsl,
    Pwsh,
    Other,
}

pub fn shell_kind(shell: &str) -> ShellKind {
    let name = shell
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(shell)
        .to_lowercase();
    match name.trim_end_matches(".exe") {
        "bash" | "sh" | "zsh" => ShellKind::Bash,
        "wsl" => ShellKind::Wsl,
        "pwsh" | "powershell" => ShellKind::Pwsh,
        _ => ShellKind::Other,
    }
}

pub struct HookInput<'a> {
    pub kind: ShellKind,
    pub profile_args: &'a [String],
    pub profile_cwd: PathBuf,
    /// Last folder this pane reported via OSC 7, in the shell's own format.
    pub restore_cwd: Option<&'a str>,
    /// Last commands of this pane, oldest first; loaded into the new shell's history.
    pub restore_history: &'a [String],
    pub inherited_prompt_command: bool,
    pub inherited_ps0: bool,
    pub inherited_wslenv: Option<&'a str>,
    pub dir_exists: &'a dyn Fn(&Path) -> bool,
}

pub struct SpawnPlan {
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub cwd: PathBuf,
}

/// Emits OSC 7 for `$PWD`; avoids `pwd -W`, whose fork is slow under MSYS. `%`, ESC and
/// BEL are percent-encoded so a folder name cannot end the sequence early or be
/// mis-decoded, and `$?` is preserved for anything the user appends to PROMPT_COMMAND.
///
/// It also reports each new command as OSC 133;E (percent-encoded so `;`, ESC, BEL and newlines
/// cannot end the sequence). The first prompt only seeds history from `EMBER_HIST` and records the
/// current history number, so restored or inherited entries are not reported as new commands.
const BASH_OSC7: &str = r#"__ember_osc7() { local s=$? p=${PWD//%/%25} h l; p=${p//$'\e'/%1B}; p=${p//$'\a'/%07}; printf '\033]7;file://localhost%s\033\\\033]133;A\033\\' "$p"; if [ -z "${__ember_hn+x}" ]; then if [ -n "${EMBER_HIST+x}" ]; then while IFS= read -r l; do history -s -- "$l"; done <<< "$EMBER_HIST"; unset EMBER_HIST; fi; __ember_hn=$HISTCMD; elif [[ $HISTCMD != "$__ember_hn" ]]; then __ember_hn=$HISTCMD; h=$(HISTTIMEFORMAT= history 1); h=${h#"${h%%[![:space:]]*}"}; h=${h#[0-9]*[[:space:]]}; h=${h#"${h%%[![:space:]]*}"}; h=${h//%/%25}; h=${h//$'\e'/%1B}; h=${h//$'\a'/%07}; h=${h//;/%3B}; h=${h//$'\r'/%0D}; h=${h//$'\n'/%0A}; printf '\033]133;E;%s\033\\' "$h"; fi; return $s; }; __ember_osc7"#;
/// Printed by bash right before each command runs (bash >= 4.4): OSC 133;C, "a program started".
/// With the prompt hook's 133;A this tells the app whether something is running in the tab,
/// which the process tree cannot show for MSYS (its fork helper exits, orphaning the child).
const BASH_PS0: &str = r"\e]133;C\e\\";
/// Runs once before the first WSL prompt; a missing folder is a silent no-op.
const WSL_RESTORE: &str =
    r#"[ -n "$EMBER_CWD" ] && { cd -- "$EMBER_CWD" 2>/dev/null; unset EMBER_CWD; }"#;
/// Runs after $PROFILE so prompt themes (oh-my-posh, starship) are wrapped, not replaced.
/// `[char]27` instead of `` `e `` keeps Windows PowerShell 5.1 working. The original prompt runs
/// first so `$?` is still the user's last command status, and the path is percent-encoded so the
/// OSC stays ASCII whatever the console code page is.
const PWSH_HOOK: &str = r#"$global:__ember_prompt = $function:prompt
function global:prompt {
  $o = & $global:__ember_prompt
  $p = $executionContext.SessionState.Path.CurrentFileSystemLocation.ProviderPath
  $e = ($p -split '\\' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
  [Console]::Write("$([char]27)]7;file://localhost/$e$([char]27)\")
  $h = Get-History -Count 1
  $id = if ($h) { $h.Id } else { 0 }
  if ($null -eq $global:__ember_hid) {
    foreach ($l in ($env:EMBER_HIST -split "`n")) {
      if ($l) { try { [Microsoft.PowerShell.PSConsoleReadLine]::AddToHistory($l) } catch {} }
    }
    Remove-Item Env:EMBER_HIST -ErrorAction SilentlyContinue
    $global:__ember_hid = $id
  } elseif ($id -ne $global:__ember_hid) {
    $global:__ember_hid = $id
    [Console]::Write("$([char]27)]133;E;$([uri]::EscapeDataString($h.CommandLine))$([char]27)\")
  }
  $o
}"#;

pub fn prepare(input: &HookInput) -> SpawnPlan {
    let mut plan = SpawnPlan {
        args: input.profile_args.to_vec(),
        env: Vec::new(),
        cwd: input.profile_cwd.clone(),
    };
    let history = history_env(input.restore_history);
    match input.kind {
        ShellKind::Bash => {
            if let Some(h) = &history {
                plan.env.push(("EMBER_HIST".into(), h.clone()));
            }
            if !input.inherited_prompt_command {
                plan.env.push(("PROMPT_COMMAND".into(), BASH_OSC7.into()));
            }
            if !input.inherited_ps0 {
                plan.env.push(("PS0".into(), BASH_PS0.into()));
            }
            let dir = input.restore_cwd.and_then(|raw| {
                if cfg!(windows) {
                    msys_to_windows(raw)
                } else {
                    Some(raw.to_string())
                }
            });
            apply_restore_dir(&mut plan, dir, input.dir_exists);
        }
        ShellKind::Wsl => {
            plan.env.push((
                "PROMPT_COMMAND".into(),
                format!("{WSL_RESTORE}; {BASH_OSC7}"),
            ));
            plan.env.push(("PS0".into(), BASH_PS0.into()));
            let mut forwarded = vec!["PROMPT_COMMAND/u", "PS0/u"];
            if let Some(h) = history {
                plan.env.push(("EMBER_HIST".into(), h));
                forwarded.push("EMBER_HIST/u");
            }
            if let Some(dir) = input.restore_cwd {
                plan.env.push(("EMBER_CWD".into(), dir.into()));
                forwarded.push("EMBER_CWD/u");
            }
            plan.env.push((
                "WSLENV".into(),
                merge_wslenv(input.inherited_wslenv, &forwarded),
            ));
        }
        ShellKind::Pwsh => {
            if let Some(h) = history {
                plan.env.push(("EMBER_HIST".into(), h));
            }
            if !has_any_arg(
                &plan.args,
                &[
                    "-command",
                    "-c",
                    "-file",
                    "-f",
                    "-encodedcommand",
                    "-e",
                    "-ec",
                ],
            ) {
                if !has_any_arg(&plan.args, &["-noexit"]) {
                    plan.args.push("-NoExit".into());
                }
                plan.args.push("-EncodedCommand".into());
                plan.args.push(encode_pwsh(PWSH_HOOK));
            }
            apply_restore_dir(
                &mut plan,
                input.restore_cwd.map(str::to_string),
                input.dir_exists,
            );
        }
        ShellKind::Other => {}
    }
    plan
}

/// `EMBER_HIST` value: one command per line. A line break inside a command would split it into
/// two entries, so those are dropped (the app never records them).
fn history_env(history: &[String]) -> Option<String> {
    let lines: Vec<&str> = history
        .iter()
        .map(String::as_str)
        .filter(|l| !l.is_empty() && !l.contains(['\n', '\r']))
        .collect();
    (!lines.is_empty()).then(|| lines.join("\n"))
}

fn apply_restore_dir(
    plan: &mut SpawnPlan,
    dir: Option<String>,
    dir_exists: &dyn Fn(&Path) -> bool,
) {
    if let Some(dir) = dir.map(PathBuf::from) {
        if dir_exists(&dir) {
            plan.cwd = dir;
        } else {
            tracing::warn!(dir = %dir.display(), "saved folder no longer exists; using profile folder");
        }
    }
}

fn has_any_arg(args: &[String], names: &[&str]) -> bool {
    args.iter()
        .any(|a| names.iter().any(|n| a.eq_ignore_ascii_case(n)))
}

fn encode_pwsh(script: &str) -> String {
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// `/d/code` → `D:/code`. Paths outside a drive mount (e.g. `/tmp`) can't be restored.
pub fn msys_to_windows(path: &str) -> Option<String> {
    let rest = path.strip_prefix('/')?;
    let mut chars = rest.chars();
    let drive = chars.next().filter(char::is_ascii_alphabetic)?;
    let tail = chars.as_str();
    if !(tail.is_empty() || tail.starts_with('/')) {
        return None;
    }
    let tail = tail.strip_prefix('/').unwrap_or("");
    Some(format!("{}:/{}", drive.to_ascii_uppercase(), tail))
}

/// Appends entries to WSLENV without dropping or duplicating existing ones.
pub fn merge_wslenv(existing: Option<&str>, add: &[&str]) -> String {
    let mut entries: Vec<String> = existing
        .unwrap_or("")
        .split(':')
        .filter(|e| !e.is_empty())
        .map(str::to_string)
        .collect();
    for entry in add {
        let name = entry.split('/').next().unwrap_or(entry);
        if !entries.iter().any(|e| e.split('/').next() == Some(name)) {
            entries.push((*entry).to_string());
        }
    }
    entries.join(":")
}

#[cfg(test)]
#[path = "shell_hooks_test.rs"]
mod tests;
