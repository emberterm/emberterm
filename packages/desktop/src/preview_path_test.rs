use super::*;

fn ok(kind: ShellKind, distro: Option<&str>, cwd: &str, raw: &str) -> String {
    resolve_preview_path(kind, distro, cwd, raw)
        .unwrap_or_else(|e| panic!("{raw:?} in {cwd:?}: {e}"))
        .to_string_lossy()
        .into_owned()
}

fn err(kind: ShellKind, distro: Option<&str>, cwd: &str, raw: &str) -> PathError {
    resolve_preview_path(kind, distro, cwd, raw).unwrap_err()
}

#[test]
fn git_bash_paths() {
    let b = ShellKind::Bash;
    let cwd = "/d/code/api";
    assert_eq!(ok(b, None, cwd, "README.md"), "D:/code/api/README.md");
    assert_eq!(ok(b, None, cwd, "./docs/a.md"), "D:/code/api/docs/a.md");
    assert_eq!(ok(b, None, cwd, "../b.md"), "D:/code/b.md");
    assert_eq!(ok(b, None, cwd, "/d/x/y.md"), "D:/x/y.md");
    assert_eq!(
        ok(b, None, cwd, "\"my notes.md\""),
        "D:/code/api/my notes.md"
    );
    assert_eq!(ok(b, None, cwd, r"C:\x\y.md"), "C:/x/y.md");
    assert!(matches!(
        err(b, None, cwd, "/tmp/a.md"),
        PathError::Unresolvable(_)
    ));
}

#[test]
fn wsl_paths() {
    let w = ShellKind::Wsl;
    let cwd = "/home/u/api";
    assert_eq!(
        ok(w, Some("Ubuntu"), cwd, "a.md"),
        r"\\wsl.localhost\Ubuntu\home\u\api\a.md"
    );
    assert_eq!(ok(w, Some("Ubuntu"), cwd, "/mnt/d/x/a.md"), "D:/x/a.md");
    assert!(matches!(
        err(w, None, cwd, "a.md"),
        PathError::Unresolvable(_)
    ));
    assert!(matches!(
        err(w, Some("Ubuntu"), cwd, "~/a.md"),
        PathError::Unresolvable(_)
    ));
}

#[test]
fn pwsh_paths() {
    let p = ShellKind::Pwsh;
    let cwd = "D:/code/api";
    assert_eq!(ok(p, None, cwd, r".\docs\a.md"), "D:/code/api/docs/a.md");
    let home = dirs::home_dir()
        .unwrap()
        .to_string_lossy()
        .replace('\\', "/");
    assert_eq!(
        ok(p, None, cwd, "~/n.md").to_lowercase(),
        format!("{home}/n.md").to_lowercase()
    );
    assert_eq!(ok(p, None, cwd, "/x/a.md"), "D:/x/a.md");
}

#[test]
fn dotdot_clamps_at_the_root() {
    assert_eq!(
        ok(ShellKind::Pwsh, None, "D:/code", "../../../x.md"),
        "D:/x.md"
    );
}

#[test]
fn empty_input_is_rejected() {
    assert_eq!(err(ShellKind::Bash, None, "/d/x", ""), PathError::Empty);
    assert_eq!(
        err(ShellKind::Bash, None, "/d/x", "  \"\" "),
        PathError::Empty
    );
}

#[test]
fn only_wsl_network_paths_resolve() {
    let p = ShellKind::Pwsh;
    assert_eq!(
        ok(p, None, "D:/x", r"\\wsl.localhost\Ubuntu\home\u\a.md"),
        r"\\wsl.localhost\Ubuntu\home\u\a.md"
    );
    assert!(matches!(
        err(p, None, "D:/x", r"\\srv\share\a.md"),
        PathError::Unresolvable(_)
    ));
    assert!(matches!(
        err(p, None, "D:/x", "//attacker/share/a.md"),
        PathError::Unresolvable(_)
    ));
    // A forged OSC 7 folder must not turn a relative name into a network path.
    assert!(matches!(
        err(p, None, "//attacker/share", "a.md"),
        PathError::Unresolvable(_)
    ));
    assert!(matches!(
        err(p, None, r"\\?\UNC\srv\s", "a.md"),
        PathError::Unresolvable(_)
    ));
}

#[test]
fn wsl_distro_comes_from_args() {
    let a = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    assert_eq!(
        wsl_distro_from_args(&a(&["-d", "Ubuntu"])).as_deref(),
        Some("Ubuntu")
    );
    assert_eq!(
        wsl_distro_from_args(&a(&["--distribution", "Debian"])).as_deref(),
        Some("Debian")
    );
    assert_eq!(
        wsl_distro_from_args(&a(&["--distribution=Arch"])).as_deref(),
        Some("Arch")
    );
    assert_eq!(wsl_distro_from_args(&a(&[])), None);
    assert_eq!(wsl_distro_from_args(&a(&["-d"])), None);
}

#[test]
fn wsl_list_output_is_utf16() {
    let utf16 = |s: &str| {
        s.encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<u8>>()
    };
    assert_eq!(
        parse_wsl_list(&utf16("Ubuntu\r\nDebian\r\n")).as_deref(),
        Some("Ubuntu")
    );
    assert_eq!(
        parse_wsl_list(&utf16("\u{feff}\r\nUbuntu-22.04\r\n")).as_deref(),
        Some("Ubuntu-22.04")
    );
    assert_eq!(parse_wsl_list(&[]), None);
}
