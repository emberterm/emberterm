use std::ffi::OsStr;
use std::path::{Path, PathBuf};

const MAX_DEPTH: usize = 3;
/// Bounds the walk: the folder may be a large repo, or WSL's slow share.
const MAX_DIRS: usize = 400;
const SKIPPED: [&str; 3] = ["node_modules", "target", "vendor"];

/// Where a bare file name printed in a pane probably lives when it is not in the pane's folder:
/// `ls docs/` prints `spec.md`, and the output does not say it came from `docs`. Looks below `dir`
/// breadth first and answers only when the shallowest level has exactly one match.
pub(crate) fn find_below(dir: &Path, name: &OsStr) -> Option<PathBuf> {
    let mut level = vec![dir.to_path_buf()];
    let mut visited = 0;
    for _ in 0..MAX_DEPTH {
        let mut next = Vec::new();
        let mut hits = Vec::new();
        for parent in &level {
            visited += 1;
            if visited > MAX_DIRS {
                return None;
            }
            let Ok(entries) = std::fs::read_dir(parent) else {
                continue;
            };
            for entry in entries.flatten() {
                // `file_type` does not follow links, so a link cannot lead out of the folder.
                let Ok(kind) = entry.file_type() else {
                    continue;
                };
                let file_name = entry.file_name();
                if kind.is_dir() && !is_skipped(&file_name) {
                    next.push(entry.path());
                } else if kind.is_file() && same_name(&file_name, name) {
                    hits.push(entry.path());
                }
            }
        }
        match hits.len() {
            0 => level = next,
            1 => return hits.pop(),
            _ => return None,
        }
    }
    None
}

fn is_skipped(name: &OsStr) -> bool {
    let n = name.to_string_lossy();
    n.starts_with('.') || SKIPPED.iter().any(|s| n.eq_ignore_ascii_case(s))
}

fn same_name(a: &OsStr, b: &OsStr) -> bool {
    a.to_string_lossy()
        .eq_ignore_ascii_case(&b.to_string_lossy())
}

#[cfg(test)]
#[path = "preview_find_test.rs"]
mod tests;
