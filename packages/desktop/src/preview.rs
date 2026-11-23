use std::io::ErrorKind;
use std::path::Path;
use std::sync::OnceLock;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::State;

use crate::preview_path::{parse_wsl_list, resolve_preview_path, wsl_distro_from_args, PathError};
use crate::profile::Profile;
use crate::state::{lock_or_recover, AppState};
use crate::terminal::shell_hooks::{shell_kind, ShellKind};

pub const MAX_MD_BYTES: u64 = 1_048_576;
pub const MAX_IMAGE_BYTES: u64 = 5 * 1_048_576;
const MARKDOWN_EXTS: [&str; 2] = ["md", "markdown"];
const IMAGE_EXTS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum PreviewError {
    #[error("file not found")]
    NotFound,
    #[error("file is over {limit} bytes")]
    TooLarge { limit: u64 },
    #[error("only Markdown files can be previewed")]
    NotMarkdown,
    #[error("not a supported image")]
    NotAnImage,
    #[error("not a regular file")]
    NotAFile,
    #[error("{reason}")]
    Unresolvable { reason: String },
    #[error("{message}")]
    Io { message: String },
}

impl From<PathError> for PreviewError {
    fn from(e: PathError) -> Self {
        PreviewError::Unresolvable {
            reason: e.to_string(),
        }
    }
}

fn io_error(e: std::io::Error) -> PreviewError {
    match e.kind() {
        ErrorKind::NotFound => PreviewError::NotFound,
        _ => PreviewError::Io {
            message: e.to_string(),
        },
    }
}

#[derive(Debug, Serialize)]
pub struct FilePreview {
    pub path: String,
    pub text: String,
    pub size: u64,
    pub mtime_ms: u64,
}

fn has_ext(path: &Path, allowed: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| allowed.iter().any(|a| e.eq_ignore_ascii_case(a)))
}

/// Terminal output can forge a path, and reading a network share makes Windows start SMB auth, so
/// only local paths and WSL's own share are read. Relative paths are the frontend's mistake.
fn ensure_local(path: &Path) -> Result<(), PreviewError> {
    let s = path.to_string_lossy().replace('/', "\\").to_lowercase();
    let wsl = s.starts_with("\\\\wsl.localhost\\") || s.starts_with("\\\\wsl$\\");
    if s.starts_with("\\\\") && !wsl {
        return Err(PreviewError::Unresolvable {
            reason: "network paths are not previewed".into(),
        });
    }
    if !path.is_absolute() {
        return Err(PreviewError::Unresolvable {
            reason: "path must be absolute".into(),
        });
    }
    Ok(())
}

/// Regular files only, at most `limit` bytes.
fn checked_metadata(path: &Path, limit: u64) -> Result<std::fs::Metadata, PreviewError> {
    let meta = std::fs::metadata(path).map_err(io_error)?;
    if !meta.is_file() {
        return Err(PreviewError::NotAFile);
    }
    if meta.len() > limit {
        return Err(PreviewError::TooLarge { limit });
    }
    Ok(meta)
}

fn modified_ms(meta: &std::fs::Metadata) -> Result<u64, PreviewError> {
    let t = meta.modified().map_err(io_error)?;
    let d = t.duration_since(UNIX_EPOCH).unwrap_or_default();
    Ok(u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
}

pub fn read_markdown(path: &Path) -> Result<FilePreview, PreviewError> {
    ensure_local(path)?;
    if !has_ext(path, &MARKDOWN_EXTS) {
        return Err(PreviewError::NotMarkdown);
    }
    let meta = checked_metadata(path, MAX_MD_BYTES)?;
    let bytes = std::fs::read(path).map_err(io_error)?;
    let decoded = String::from_utf8_lossy(&bytes);
    let text = decoded
        .strip_prefix('\u{feff}')
        .unwrap_or(&decoded)
        .to_string();
    Ok(FilePreview {
        path: path.to_string_lossy().into_owned(),
        text,
        size: meta.len(),
        mtime_ms: modified_ms(&meta)?,
    })
}

pub fn read_image(path: &Path) -> Result<Vec<u8>, PreviewError> {
    ensure_local(path)?;
    if !has_ext(path, &IMAGE_EXTS) {
        return Err(PreviewError::NotAnImage);
    }
    checked_metadata(path, MAX_IMAGE_BYTES)?;
    std::fs::read(path).map_err(io_error)
}

pub fn mtime_ms(path: &Path) -> Result<u64, PreviewError> {
    ensure_local(path)?;
    modified_ms(&std::fs::metadata(path).map_err(io_error)?)
}

/// File IO may sit behind a slow share (WSL), so it never runs on the async executor.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, PreviewError> + Send + 'static,
) -> Result<T, PreviewError> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| PreviewError::Io {
            message: e.to_string(),
        })?
}

#[tauri::command]
#[tracing::instrument(skip_all)]
pub async fn file_preview(path: String) -> Result<FilePreview, PreviewError> {
    blocking(move || read_markdown(Path::new(&path))).await
}

#[tauri::command]
#[tracing::instrument(skip_all)]
pub async fn file_preview_image(path: String) -> Result<tauri::ipc::Response, PreviewError> {
    blocking(move || read_image(Path::new(&path)))
        .await
        .map(tauri::ipc::Response::new)
}

#[tauri::command]
#[tracing::instrument(skip_all)]
pub async fn file_preview_stat(path: String) -> Result<u64, PreviewError> {
    blocking(move || mtime_ms(Path::new(&path))).await
}

/// Same choice `session_create` makes: the requested profile, else the default, else the first.
fn profile_for(state: &AppState, id: Option<&str>) -> Profile {
    let profiles = lock_or_recover(&state.profiles);
    let cfg = lock_or_recover(&state.config);
    let found = match id {
        Some(id) => profiles.iter().find(|p| p.id == id),
        None => profiles
            .iter()
            .find(|p| p.id == cfg.behavior.default_profile)
            .or_else(|| profiles.first()),
    };
    found.cloned().unwrap_or_default()
}

/// First line of `wsl.exe -l -q`, looked up once: profiles without `-d` use the default distro.
fn default_wsl_distro() -> Option<String> {
    static DEFAULT: OnceLock<Option<String>> = OnceLock::new();
    DEFAULT
        .get_or_init(|| {
            let mut cmd = std::process::Command::new("wsl.exe");
            cmd.args(["-l", "-q"]);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            cmd.output().ok().and_then(|o| parse_wsl_list(&o.stdout))
        })
        .clone()
}

/// Turns a path typed or printed in a pane into a Windows path for the preview commands.
#[tauri::command]
#[tracing::instrument(skip_all)]
pub async fn preview_resolve(
    profile_id: Option<String>,
    cwd: String,
    raw: String,
    state: State<'_, AppState>,
) -> Result<String, PreviewError> {
    let profile = profile_for(&state, profile_id.as_deref());
    let kind = shell_kind(&profile.shell);
    let args = profile.args;
    tokio::task::spawn_blocking(move || {
        let distro = (kind == ShellKind::Wsl)
            .then(|| wsl_distro_from_args(&args).or_else(default_wsl_distro))
            .flatten();
        resolve_preview_path(kind, distro.as_deref(), &cwd, &raw)
            .map(|p| p.to_string_lossy().into_owned())
            .map_err(PreviewError::from)
    })
    .await
    .map_err(|e| PreviewError::Io {
        message: e.to_string(),
    })?
}

#[cfg(test)]
#[path = "preview_test.rs"]
mod tests;
