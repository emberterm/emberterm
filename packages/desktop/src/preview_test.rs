use std::fs;
use std::time::{Duration, SystemTime};

use super::*;

fn dir() -> tempfile::TempDir {
    tempfile::tempdir().unwrap()
}

fn write(dir: &tempfile::TempDir, name: &str, bytes: &[u8]) -> std::path::PathBuf {
    let p = dir.path().join(name);
    fs::write(&p, bytes).unwrap();
    p
}

#[test]
fn reads_markdown_with_size_and_mtime() {
    let d = dir();
    let p = write(&d, "README.md", b"# Hi\n");
    let got = read_markdown(&p).unwrap();
    assert_eq!(got.text, "# Hi\n");
    assert_eq!(got.size, 5);
    assert!(got.mtime_ms > 0);
    assert_eq!(got.path, p.to_string_lossy());
}

#[test]
fn strips_a_utf8_bom() {
    let d = dir();
    let p = write(&d, "a.md", b"\xEF\xBB\xBF# Hi");
    assert_eq!(read_markdown(&p).unwrap().text, "# Hi");
}

#[test]
fn invalid_utf8_decodes_lossy() {
    let d = dir();
    let p = write(&d, "a.md", b"ok \xFF\xFE end");
    let text = read_markdown(&p).unwrap().text;
    assert!(text.contains('\u{FFFD}'));
    assert!(text.starts_with("ok "));
}

#[test]
fn markdown_over_one_mb_is_too_large() {
    let d = dir();
    let p = write(&d, "big.md", &vec![b'a'; 1_048_577]);
    assert!(matches!(
        read_markdown(&p),
        Err(PreviewError::TooLarge { limit: 1_048_576 })
    ));
}

#[test]
fn exactly_one_mb_is_allowed() {
    let d = dir();
    let p = write(&d, "edge.markdown", &vec![b'a'; 1_048_576]);
    assert_eq!(read_markdown(&p).unwrap().size, 1_048_576);
}

#[test]
fn only_markdown_extensions_are_documents() {
    let d = dir();
    let txt = write(&d, "a.txt", b"x");
    assert!(matches!(
        read_markdown(&txt),
        Err(PreviewError::NotMarkdown)
    ));
    let upper = write(&d, "B.MD", b"x");
    assert!(read_markdown(&upper).is_ok());
}

#[test]
fn missing_file_is_not_found() {
    let d = dir();
    assert!(matches!(
        read_markdown(&d.path().join("nope.md")),
        Err(PreviewError::NotFound)
    ));
}

#[test]
fn a_folder_named_like_markdown_is_not_a_file() {
    let d = dir();
    fs::create_dir(d.path().join("x.md")).unwrap();
    assert!(matches!(
        read_markdown(&d.path().join("x.md")),
        Err(PreviewError::NotAFile)
    ));
}

#[test]
fn network_paths_are_refused_before_any_io() {
    for p in [
        r"\\srv\share\a.md",
        "//srv/share/a.md",
        r"\\?\UNC\srv\s\a.md",
    ] {
        assert!(matches!(
            read_markdown(Path::new(p)),
            Err(PreviewError::Unresolvable { .. })
        ));
    }
    assert!(matches!(
        read_image(Path::new(r"\\srv\share\a.png")),
        Err(PreviewError::Unresolvable { .. })
    ));
}

#[test]
fn relative_paths_are_refused() {
    assert!(matches!(
        read_markdown(Path::new("a.md")),
        Err(PreviewError::Unresolvable { .. })
    ));
}

#[test]
fn images_follow_the_extension_allowlist_and_cap() {
    let d = dir();
    let png = write(&d, "a.PNG", b"\x89PNG");
    assert_eq!(read_image(&png).unwrap(), b"\x89PNG");
    let big = write(&d, "big.png", &vec![0u8; 5 * 1_048_576 + 1]);
    assert!(matches!(
        read_image(&big),
        Err(PreviewError::TooLarge { limit: 5_242_880 })
    ));
    let md = write(&d, "a.md", b"x");
    assert!(matches!(read_image(&md), Err(PreviewError::NotAnImage)));
    let exe = write(&d, "a.exe", b"x");
    assert!(matches!(read_image(&exe), Err(PreviewError::NotAnImage)));
}

#[test]
fn mtime_changes_when_the_file_changes() {
    let d = dir();
    let p = write(&d, "a.md", b"1");
    let before = mtime_ms(&p).unwrap();
    let f = fs::OpenOptions::new().write(true).open(&p).unwrap();
    f.set_modified(SystemTime::now() + Duration::from_secs(5))
        .unwrap();
    assert!(mtime_ms(&p).unwrap() > before);
}

#[test]
fn errors_serialize_with_a_code() {
    let v = serde_json::to_value(PreviewError::TooLarge { limit: 7 }).unwrap();
    assert_eq!(v, serde_json::json!({ "code": "too_large", "limit": 7 }));
    let v = serde_json::to_value(PreviewError::NotFound).unwrap();
    assert_eq!(v, serde_json::json!({ "code": "not_found" }));
}
