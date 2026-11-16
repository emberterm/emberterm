use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::fsutil::{load_user_file, write_atomic, StartupWarning};

pub const SESSION_VERSION: u32 = 1;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SavedPane {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    /// Last commands typed in this pane (newest last), replayed into the new shell's history.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub history: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SavedSplit {
    pub direction: String,
    pub pane: SavedPane,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SavedTab {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub custom_title: bool,
    pub pane: SavedPane,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split: Option<SavedSplit>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SavedSession {
    pub version: u32,
    pub active_tab: usize,
    pub tabs: Vec<SavedTab>,
}

/// `session.json` lives next to `config.toml`.
pub fn session_path() -> Option<PathBuf> {
    crate::config::config_path()?
        .parent()
        .map(|d| d.join("session.json"))
}

pub fn load_from(path: &Path) -> (Option<SavedSession>, Option<StartupWarning>) {
    load_user_file(path, true, |text| {
        let session: SavedSession = serde_json::from_str(text).map_err(|e| e.to_string())?;
        if session.version != SESSION_VERSION {
            return Err(format!("unsupported session version {}", session.version));
        }
        Ok(Some(session))
    })
}

pub fn save_to(path: &Path, session: &SavedSession) -> Result<()> {
    anyhow::ensure!(
        session.version == SESSION_VERSION,
        "unsupported session version {}",
        session.version
    );
    write_atomic(path, &serde_json::to_vec_pretty(session)?)?;
    Ok(())
}

#[cfg(test)]
#[path = "session_store_test.rs"]
mod tests;
