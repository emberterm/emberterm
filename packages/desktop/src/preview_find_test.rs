use std::ffi::OsStr;
use std::fs;

use super::*;

fn touch(root: &tempfile::TempDir, rel: &str) {
    let p = root.path().join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, b"# x").unwrap();
}

#[test]
fn finds_a_file_in_a_subfolder() {
    let d = tempfile::tempdir().unwrap();
    touch(&d, "docs/taproom-spec.md");
    let got = find_below(d.path(), OsStr::new("taproom-spec.md")).unwrap();
    assert_eq!(got, d.path().join("docs").join("taproom-spec.md"));
}

#[test]
fn the_shallowest_match_wins() {
    let d = tempfile::tempdir().unwrap();
    touch(&d, "a/b/c/x.md");
    touch(&d, "docs/x.md");
    let got = find_below(d.path(), OsStr::new("x.md")).unwrap();
    assert_eq!(got, d.path().join("docs").join("x.md"));
}

#[test]
fn two_matches_at_one_depth_are_ambiguous() {
    let d = tempfile::tempdir().unwrap();
    touch(&d, "docs/x.md");
    touch(&d, "notes/x.md");
    assert_eq!(find_below(d.path(), OsStr::new("x.md")), None);
}

#[test]
fn matches_the_name_ignoring_case() {
    let d = tempfile::tempdir().unwrap();
    touch(&d, "docs/Spec.MD");
    assert!(find_below(d.path(), OsStr::new("spec.md")).is_some());
}

#[test]
fn does_not_look_inside_hidden_or_dependency_folders() {
    let d = tempfile::tempdir().unwrap();
    touch(&d, ".git/x.md");
    touch(&d, "node_modules/pkg/x.md");
    touch(&d, "target/x.md");
    assert_eq!(find_below(d.path(), OsStr::new("x.md")), None);
}

#[test]
fn stops_below_the_depth_limit() {
    let d = tempfile::tempdir().unwrap();
    touch(&d, "a/b/c/d/x.md");
    assert_eq!(find_below(d.path(), OsStr::new("x.md")), None);
}

#[test]
fn a_missing_folder_finds_nothing() {
    let d = tempfile::tempdir().unwrap();
    let gone = d.path().join("gone");
    assert_eq!(find_below(&gone, OsStr::new("x.md")), None);
}
