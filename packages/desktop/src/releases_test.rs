use serde_json::json;

use super::*;

fn release(tag: &str) -> serde_json::Value {
    json!({
        "tag_name": tag,
        "draft": false,
        "prerelease": false,
        "body": format!("## {tag}"),
        "published_at": "2026-11-24T10:00:00Z",
        "html_url": format!("https://github.com/emberterm/emberterm/releases/tag/{tag}"),
    })
}

fn parse(v: serde_json::Value) -> Vec<ReleaseNote> {
    parse_releases(&v.to_string()).unwrap()
}

fn versions(notes: &[ReleaseNote]) -> Vec<&str> {
    notes.iter().map(|n| n.version.as_str()).collect()
}

#[test]
fn keeps_stable_releases_and_maps_the_fields() {
    let notes = parse(json!([release("v1.3.0"), release("v1.2.0")]));
    assert_eq!(versions(&notes), ["1.3.0", "1.2.0"]);
    assert_eq!(notes[0].tag, "v1.3.0");
    assert_eq!(notes[0].body, "## v1.3.0");
    assert_eq!(
        notes[0].published_at.as_deref(),
        Some("2026-11-24T10:00:00Z")
    );
    assert_eq!(
        notes[0].url,
        "https://github.com/emberterm/emberterm/releases/tag/v1.3.0"
    );
}

#[test]
fn drops_drafts_prereleases_and_odd_tags() {
    let mut draft = release("v1.5.0");
    draft["draft"] = json!(true);
    let mut pre = release("v1.4.0");
    pre["prerelease"] = json!(true);
    let notes = parse(json!([
        draft,
        pre,
        release("nightly"),
        release("v1.3.0-rc.1"),
        release("1.3.0"),
        release("v1.3"),
        release("v1.2.0"),
    ]));
    assert_eq!(versions(&notes), ["1.2.0"]);
}

#[test]
fn orders_by_version_number_not_by_text() {
    let notes = parse(json!([
        release("v1.2.0"),
        release("v1.10.0"),
        release("v1.9.0")
    ]));
    assert_eq!(versions(&notes), ["1.10.0", "1.9.0", "1.2.0"]);
}

#[test]
fn tolerates_missing_and_null_fields() {
    let notes = parse(json!([
        { "tag_name": "v1.1.0", "body": null, "draft": false, "prerelease": false },
        { "tag_name": "v1.0.0" },
    ]));
    assert_eq!(notes[0].body, "");
    assert_eq!(notes[0].published_at, None);
    assert_eq!(
        notes[0].url,
        "https://github.com/emberterm/emberterm/releases/tag/v1.1.0"
    );
    assert_eq!(versions(&notes), ["1.1.0", "1.0.0"]);
}

#[test]
fn skips_an_entry_that_is_not_a_release() {
    let notes = parse(json!([42, {}, release("v1.0.0")]));
    assert_eq!(versions(&notes), ["1.0.0"]);
}

#[test]
fn keeps_at_most_thirty() {
    let many: Vec<_> = (1..=40).map(|i| release(&format!("v1.{i}.0"))).collect();
    let notes = parse(json!(many));
    assert_eq!(notes.len(), 30);
    assert_eq!(notes[0].version, "1.40.0");
}

#[test]
fn an_empty_list_is_fine_and_anything_else_is_a_parse_error() {
    assert!(parse_releases("[]").unwrap().is_empty());
    for bad in ["{", "{}", "[{", "null", ""] {
        assert!(
            matches!(parse_releases(bad), Err(ReleasesError::Parse)),
            "{bad:?}"
        );
    }
}

#[test]
fn classifies_the_http_status() {
    assert!(classify_status(200, None).is_none());
    assert!(classify_status(204, None).is_none());
    assert!(matches!(
        classify_status(403, Some("0")),
        Some(ReleasesError::RateLimited)
    ));
    assert!(matches!(
        classify_status(429, None),
        Some(ReleasesError::RateLimited)
    ));
    assert!(matches!(
        classify_status(403, None),
        Some(ReleasesError::Status { http: 403 })
    ));
    assert!(matches!(
        classify_status(403, Some("12")),
        Some(ReleasesError::Status { http: 403 })
    ));
    assert!(matches!(
        classify_status(500, None),
        Some(ReleasesError::Status { http: 500 })
    ));
}

#[test]
fn errors_serialize_with_a_code() {
    assert_eq!(
        serde_json::to_value(ReleasesError::RateLimited).unwrap(),
        json!({ "code": "rate_limited" })
    );
    assert_eq!(
        serde_json::to_value(ReleasesError::Status { http: 500 }).unwrap(),
        json!({ "code": "status", "http": 500 })
    );
    assert_eq!(
        serde_json::to_value(ReleasesError::Network).unwrap(),
        json!({ "code": "network" })
    );
}
