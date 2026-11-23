use std::path::PathBuf;

use crate::terminal::shell_hooks::{msys_to_windows, ShellKind};

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum PathError {
    #[error("empty path")]
    Empty,
    #[error("{0}")]
    Unresolvable(String),
}

fn unresolvable(msg: &str) -> PathError {
    PathError::Unresolvable(msg.to_string())
}

enum Root {
    Drive(char),
    Posix,
    /// `//host/share/...`: the first two segments belong to the root.
    Unc,
}

struct Abs {
    root: Root,
    segs: Vec<String>,
}

/// Forward slashes only; `.` and empty parts dropped. `..` pops, but never past the root.
fn normalise(parts: &str, keep: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for part in parts.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if out.len() > keep {
                    out.pop();
                }
            }
            p => out.push(p.to_string()),
        }
    }
    out
}

/// `None` for a relative path.
fn parse(p: &str) -> Option<Abs> {
    let b = p.as_bytes();
    if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b.len() == 2 || b[2] == b'/')
    {
        let drive = (b[0] as char).to_ascii_uppercase();
        return Some(Abs {
            root: Root::Drive(drive),
            segs: normalise(&p[2..], 0),
        });
    }
    if p.starts_with("//") {
        return Some(Abs {
            root: Root::Unc,
            segs: normalise(p, 2),
        });
    }
    if p.starts_with('/') {
        return Some(Abs {
            root: Root::Posix,
            segs: normalise(p, 0),
        });
    }
    None
}

fn strip_quotes(s: &str) -> &str {
    let s = s.trim();
    for q in ['"', '\''] {
        if let Some(inner) = s.strip_prefix(q).and_then(|r| r.strip_suffix(q)) {
            return inner;
        }
    }
    s
}

fn expand_home(kind: ShellKind, home: Option<&str>, p: &str) -> Result<String, PathError> {
    let rest = if p == "~" {
        ""
    } else if let Some(r) = p.strip_prefix("~/").or_else(|| p.strip_prefix("~\\")) {
        r
    } else {
        return Ok(p.to_string());
    };
    if kind == ShellKind::Wsl {
        return Err(unresolvable("~ is not supported in WSL, use a full path"));
    }
    let home = home.ok_or_else(|| unresolvable("home folder not found"))?;
    Ok(format!("{home}/{rest}"))
}

fn drive_path(drive: char, segs: &[String]) -> String {
    format!("{drive}:/{}", segs.join("/"))
}

fn wsl_unc(distro: &str, segs: &[String]) -> String {
    format!("\\\\wsl.localhost\\{distro}\\{}", segs.join("\\"))
}

/// Maps a shell-side path to a Windows one. A network path other than WSL's own would make Windows
/// start SMB auth, and terminal output (the folder, a path) can be forged, so those never resolve.
fn to_windows(
    kind: ShellKind,
    distro: Option<&str>,
    abs: &Abs,
    cwd_drive: Option<char>,
) -> Result<String, PathError> {
    match abs.root {
        Root::Drive(d) => Ok(drive_path(d, &abs.segs)),
        Root::Unc => {
            let host = abs.segs.first().map(|h| h.to_lowercase());
            let wsl = matches!(host.as_deref(), Some("wsl.localhost") | Some("wsl$"));
            if wsl && abs.segs.len() > 2 {
                Ok(format!("\\\\{}", abs.segs.join("\\")))
            } else {
                Err(unresolvable("network paths are not previewed"))
            }
        }
        Root::Posix => match kind {
            ShellKind::Bash => msys_to_windows(&format!("/{}", abs.segs.join("/")))
                .ok_or_else(|| unresolvable("this path is outside the Windows drives")),
            ShellKind::Wsl => wsl_posix(distro, &abs.segs),
            _ => cwd_drive
                .map(|d| drive_path(d, &abs.segs))
                .ok_or_else(|| unresolvable("working folder unknown")),
        },
    }
}

/// On macOS and Linux a path is already a path: there are no drives or WSL to map to. A
/// `//host/share` path is refused as on Windows, since terminal output can forge it.
fn to_unix(abs: &Abs) -> Result<String, PathError> {
    match abs.root {
        Root::Posix => Ok(format!("/{}", abs.segs.join("/"))),
        Root::Drive(_) => Err(unresolvable("drive letters do not exist on this computer")),
        Root::Unc => Err(unresolvable("network paths are not previewed")),
    }
}

fn wsl_posix(distro: Option<&str>, segs: &[String]) -> Result<String, PathError> {
    if segs.first().map(String::as_str) == Some("mnt") {
        let letter = segs
            .get(1)
            .filter(|s| s.len() == 1)
            .and_then(|s| s.chars().next());
        if let Some(d) = letter.filter(char::is_ascii_alphabetic) {
            return Ok(drive_path(d.to_ascii_uppercase(), &segs[2..]));
        }
    }
    match distro {
        Some(d) if !d.is_empty() && !d.contains(['/', '\\']) => Ok(wsl_unc(d, segs)),
        _ => Err(unresolvable("WSL distribution unknown")),
    }
}

/// The computer EmberTerm runs on. Paths a shell prints are Windows-flavoured on Windows (Git Bash
/// `/d/x`, WSL `/mnt/d/x`, drive letters) and plain POSIX paths on macOS and Linux.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Host {
    Windows,
    Unix,
}

impl Host {
    fn current() -> Self {
        if cfg!(windows) {
            Host::Windows
        } else {
            Host::Unix
        }
    }
}

pub fn resolve_preview_path(
    kind: ShellKind,
    distro: Option<&str>,
    cwd: &str,
    raw: &str,
) -> Result<PathBuf, PathError> {
    let home = dirs::home_dir().map(|h| h.to_string_lossy().into_owned());
    resolve_with(Host::current(), home.as_deref(), kind, distro, cwd, raw)
}

/// `resolve_preview_path` with the host and home folder given, so both hosts can be tested anywhere.
pub(crate) fn resolve_with(
    host: Host,
    home: Option<&str>,
    kind: ShellKind,
    distro: Option<&str>,
    cwd: &str,
    raw: &str,
) -> Result<PathBuf, PathError> {
    let raw = strip_quotes(raw);
    if raw.is_empty() {
        return Err(PathError::Empty);
    }
    let p = expand_home(kind, home, raw)?.replace('\\', "/");
    let cwd_norm = cwd.replace('\\', "/");
    let cwd_drive = match parse(&cwd_norm) {
        Some(Abs {
            root: Root::Drive(d),
            ..
        }) => Some(d),
        _ => None,
    };
    let abs = match parse(&p) {
        Some(abs) => abs,
        // No folder reported yet: joining to nothing would resolve against the root.
        None if cwd_norm.trim().is_empty() => return Err(unresolvable("working folder unknown")),
        None => parse(&format!("{cwd_norm}/{p}"))
            .ok_or_else(|| unresolvable("working folder unknown"))?,
    };
    match host {
        Host::Windows => to_windows(kind, distro, &abs, cwd_drive),
        Host::Unix => to_unix(&abs),
    }
    .map(PathBuf::from)
}

pub fn wsl_distro_from_args(args: &[String]) -> Option<String> {
    let mut it = args.iter();
    while let Some(a) = it.next() {
        if a == "-d" || a == "--distribution" {
            return it.next().filter(|s| !s.is_empty()).cloned();
        }
        if let Some(v) = a.strip_prefix("--distribution=") {
            return Some(v.to_string()).filter(|s| !s.is_empty());
        }
    }
    None
}

/// First distribution in the UTF-16LE output of `wsl.exe -l -q` (the default one is listed first).
pub fn parse_wsl_list(raw: &[u8]) -> Option<String> {
    let units: Vec<u16> = raw
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16_lossy(&units)
        .lines()
        .map(|l| l.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}' || c == '\0'))
        .find(|l| !l.is_empty())
        .map(String::from)
}

#[cfg(test)]
#[path = "preview_path_test.rs"]
mod tests;
