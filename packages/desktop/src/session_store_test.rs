use super::*;

fn sample() -> SavedSession {
    SavedSession {
        version: SESSION_VERSION,
        active_tab: 1,
        tabs: vec![
            SavedTab {
                title: Some("api".into()),
                custom_title: true,
                pane: SavedPane {
                    profile_id: Some("git-bash".into()),
                    cwd: Some("/d/code/api".into()),
                    history: vec!["ls".into(), "git status".into()],
                },
                split: Some(SavedSplit {
                    direction: "vertical".into(),
                    pane: SavedPane {
                        profile_id: Some("wsl".into()),
                        cwd: Some("/home/me".into()),
                        history: vec![],
                    },
                }),
            },
            SavedTab::default(),
        ],
    }
}

#[test]
fn round_trips() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("session.json");
    save_to(&path, &sample()).unwrap();
    let (loaded, warning) = load_from(&path);
    assert!(warning.is_none());
    assert_eq!(loaded, Some(sample()));
}

#[test]
fn missing_file_is_none_without_warning() {
    let dir = tempfile::tempdir().unwrap();
    let (loaded, warning) = load_from(&dir.path().join("session.json"));
    assert!(loaded.is_none());
    assert!(warning.is_none());
}

#[test]
fn broken_json_is_quarantined() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("session.json");
    std::fs::write(&path, "{ \"version\": 1, \"tabs\": [").unwrap();
    let (loaded, warning) = load_from(&path);
    assert!(loaded.is_none());
    assert!(warning.unwrap().backup.is_some());
    assert!(!path.exists());
}

#[test]
fn unknown_version_is_treated_as_broken() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("session.json");
    std::fs::write(&path, r#"{ "version": 99, "active_tab": 0, "tabs": [] }"#).unwrap();
    let (loaded, warning) = load_from(&path);
    assert!(loaded.is_none());
    assert!(warning.unwrap().message.contains("99"));
}

#[test]
fn save_rejects_wrong_version() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = sample();
    s.version = 2;
    assert!(save_to(&dir.path().join("session.json"), &s).is_err());
}

#[test]
fn none_fields_are_omitted_from_json() {
    let json = serde_json::to_string(&SavedTab::default()).unwrap();
    assert!(!json.contains("null"), "{json}");
}

#[test]
fn history_round_trips() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("session.json");
    save_to(&path, &sample()).unwrap();
    let (loaded, _) = load_from(&path);
    assert_eq!(
        loaded.unwrap().tabs[0].pane.history,
        vec!["ls".to_string(), "git status".to_string()]
    );
}

#[test]
fn old_file_without_history_loads() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("session.json");
    std::fs::write(
        &path,
        r#"{"version":1,"active_tab":0,"tabs":[{"custom_title":false,"pane":{"profile_id":"pwsh","cwd":"D:/x"}}]}"#,
    )
    .unwrap();
    let (loaded, warning) = load_from(&path);
    assert!(warning.is_none());
    assert!(loaded.unwrap().tabs[0].pane.history.is_empty());
}

#[test]
fn empty_history_is_not_serialized() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("session.json");
    let mut s = sample();
    s.tabs[0].pane.history.clear();
    save_to(&path, &s).unwrap();
    assert!(!std::fs::read_to_string(&path).unwrap().contains("history"));
}
