use super::*;

const WIN_HOME: &str = r"C:\Users\test";
const MAC_HOME: &str = "/Users/me";

fn ok_on(
    host: Host,
    home: &str,
    kind: ShellKind,
    distro: Option<&str>,
    cwd: &str,
    raw: &str,
) -> String {
    resolve_with(host, Some(home), kind, distro, cwd, raw)
        .unwrap_or_else(|e| panic!("{raw:?} in {cwd:?}: {e}"))
        .to_string_lossy()
        .into_owned()
}

fn err_on(host: Host, kind: ShellKind, distro: Option<&str>, cwd: &str, raw: &str) -> PathError {
    resolve_with(host, Some(MAC_HOME), kind, distro, cwd, raw).unwrap_err()
}

// The tests below pin the Windows host, whatever machine runs them.
fn ok(kind: ShellKind, distro: Option<&str>, cwd: &str, raw: &str) -> String {
    ok_on(Host::Windows, WIN_HOME, kind, distro, cwd, raw)
}

fn err(kind: ShellKind, distro: Option<&str>, cwd: &str, raw: &str) -> PathError {
    err_on(Host::Windows, kind, distro, cwd, raw)
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
    assert_eq!(ok(p, None, cwd, "~/n.md"), "C:/Users/test/n.md");
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

// On macOS and Linux the shell prints plain POSIX paths and there are no drives to map to.
fn unix(kind: ShellKind, cwd: &str, raw: &str) -> String {
    ok_on(Host::Unix, MAC_HOME, kind, None, cwd, raw)
}

#[test]
fn unix_host_keeps_paths_as_they_are() {
    let cwd = "/Users/me/api";
    for kind in [ShellKind::Bash, ShellKind::Pwsh, ShellKind::Other] {
        assert_eq!(unix(kind, cwd, "README.md"), "/Users/me/api/README.md");
        assert_eq!(unix(kind, cwd, "./docs/a.md"), "/Users/me/api/docs/a.md");
        assert_eq!(unix(kind, cwd, "../b.md"), "/Users/me/b.md");
        assert_eq!(unix(kind, cwd, "/tmp/a.md"), "/tmp/a.md");
        assert_eq!(
            unix(kind, cwd, "\"my notes.md\""),
            "/Users/me/api/my notes.md"
        );
    }
}

#[test]
fn unix_host_expands_the_home_folder() {
    assert_eq!(
        unix(ShellKind::Bash, "/Users/me/api", "~/n.md"),
        "/Users/me/n.md"
    );
    assert_eq!(
        unix(ShellKind::Pwsh, "/Users/me/api", "~/docs/n.md"),
        "/Users/me/docs/n.md"
    );
}

#[test]
fn unix_host_clamps_dotdot_at_the_root() {
    assert_eq!(
        unix(ShellKind::Bash, "/Users/me", "../../../../x.md"),
        "/x.md"
    );
}

#[test]
fn unix_host_has_no_drives_and_no_network_paths() {
    let e = |raw: &str| err_on(Host::Unix, ShellKind::Bash, None, "/Users/me", raw);
    assert!(matches!(e(r"C:\x\a.md"), PathError::Unresolvable(_)));
    assert!(matches!(e("//srv/share/a.md"), PathError::Unresolvable(_)));
    assert!(matches!(
        e("//attacker/share/a.md"),
        PathError::Unresolvable(_)
    ));
    assert!(matches!(
        err_on(
            Host::Unix,
            ShellKind::Bash,
            None,
            "//attacker/share",
            "a.md"
        ),
        PathError::Unresolvable(_)
    ));
}

#[test]
fn unix_host_has_no_wsl() {
    // WSL only exists on Windows; a "wsl" profile name on another host is just a shell.
    let w = err_on(
        Host::Unix,
        ShellKind::Wsl,
        Some("Ubuntu"),
        "/home/u",
        "~/a.md",
    );
    assert!(matches!(w, PathError::Unresolvable(_)));
    assert_eq!(unix(ShellKind::Wsl, "/home/u", "a.md"), "/home/u/a.md");
}

#[test]
fn unix_host_needs_a_folder_for_a_relative_path() {
    assert!(matches!(
        err_on(Host::Unix, ShellKind::Bash, None, "", "a.md"),
        PathError::Unresolvable(_)
    ));
}
