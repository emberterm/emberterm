use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::fsutil::{load_user_file, write_atomic, StartupWarning};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub appearance: AppearanceConfig,
    pub behavior: BehaviorConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppearanceConfig {
    pub theme: String,
    /// VS Code theme JSON the user imported, kept verbatim so it can be re-imported at startup.
    pub custom_themes: Vec<String>,
    pub font_family: String,
    pub font_size: u32,
    pub line_height: f32,
    pub window_padding: u32,
    /// Cursor shape: "block" | "bar" | "underline"
    pub cursor_style: String,
    pub cursor_blink: bool,
    /// Draw bold ANSI text using the bright color variant
    pub bold_in_bright: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct BehaviorConfig {
    pub default_profile: String,
    pub confirm_close_running: bool,
    /// Play a sound when a program rings the terminal bell (BEL).
    pub bell_sound: bool,
    /// Let a program set the clipboard with OSC 52. Off by default: any terminal output,
    /// including a file shown with `cat`, could otherwise swap in a command to be pasted.
    pub osc52_clipboard: bool,
    pub scrollback_lines: usize,
    /// Open a Markdown file in the preview panel when a command like `cat README.md` has run.
    pub preview_on_cat: bool,
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            theme: "ember-dark".into(),
            custom_themes: Vec::new(),
            font_family: "JetBrains Mono, Cascadia Code, Fira Code, monospace".into(),
            font_size: 13,
            line_height: 1.2,
            window_padding: 8,
            cursor_style: "block".into(),
            cursor_blink: true,
            bold_in_bright: true,
        }
    }
}

impl Default for BehaviorConfig {
    fn default() -> Self {
        Self {
            default_profile: "default".into(),
            confirm_close_running: true,
            bell_sound: true,
            osc52_clipboard: false,
            scrollback_lines: 10000,
            preview_on_cat: false,
        }
    }
}

impl Config {
    pub fn load(quarantine_broken: bool) -> (Self, Option<StartupWarning>) {
        match config_path() {
            Some(path) => Self::load_from(&path, quarantine_broken),
            None => (Self::default(), None),
        }
    }

    pub fn load_from(path: &Path, quarantine_broken: bool) -> (Self, Option<StartupWarning>) {
        load_user_file(path, quarantine_broken, |text| {
            toml::from_str(text).map_err(|e| e.to_string())
        })
    }

    pub fn save(&self) -> Result<()> {
        let path = config_path().ok_or_else(|| anyhow::anyhow!("no config directory"))?;
        self.save_to(&path)
    }

    /// Refuses to overwrite a config.toml the user is part-way through editing.
    pub fn save_to(&self, path: &Path) -> Result<()> {
        match std::fs::read_to_string(path) {
            Ok(text) => {
                if let Err(e) = toml::from_str::<Config>(&text) {
                    anyhow::bail!("config.toml has an error; fix it before changing settings: {e}");
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            // Unreadable or not UTF-8: it may be the user's file in another encoding.
            Err(e) => anyhow::bail!(
                "config.toml could not be read ({e}); fix it before changing settings"
            ),
        }
        write_atomic(path, toml::to_string_pretty(self)?.as_bytes())?;
        Ok(())
    }
}

/// A first run has neither a config.toml nor one set aside as `config.toml.broken-*`;
/// a broken config must not send the user back through the welcome wizard.
pub fn is_first_run_in(dir: &Path) -> bool {
    if dir.join("config.toml").exists() {
        return false;
    }
    let quarantined = std::fs::read_dir(dir).is_ok_and(|entries| {
        entries.flatten().any(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("config.toml.broken-")
        })
    });
    !quarantined
}

pub fn config_path() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("ember").join("config.toml"))
}

#[cfg(test)]
#[path = "config_test.rs"]
mod tests;
