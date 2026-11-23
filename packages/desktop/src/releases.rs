use std::time::Duration;

use serde::{Deserialize, Serialize};

const RELEASES_URL: &str = "https://api.github.com/repos/emberterm/emberterm/releases?per_page=30";
const REPO_TAGS_URL: &str = "https://github.com/emberterm/emberterm/releases/tag";
const TIMEOUT: Duration = Duration::from_secs(8);
const KEEP: usize = 30;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ReleaseNote {
    pub tag: String,
    /// The tag without its `v`.
    pub version: String,
    pub published_at: Option<String>,
    pub body: String,
    pub url: String,
}

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ReleasesError {
    #[error("could not reach GitHub")]
    Network,
    #[error("GitHub is limiting requests")]
    RateLimited,
    #[error("GitHub answered {http}")]
    Status { http: u16 },
    #[error("unexpected answer from GitHub")]
    Parse,
}

#[derive(Deserialize)]
struct RawRelease {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    body: Option<String>,
    published_at: Option<String>,
    html_url: Option<String>,
}

/// `v1.10.2` as numbers; anything else (a suffix, two parts, no `v`) is not a stable release tag.
fn parse_tag(tag: &str) -> Option<(u32, u32, u32)> {
    let mut parts = tag.strip_prefix('v')?.split('.');
    let mut next = || parts.next()?.parse::<u32>().ok();
    let version = (next()?, next()?, next()?);
    parts.next().is_none().then_some(version)
}

/// Stable, published releases only, newest first by version number, at most 30. An entry that is
/// not a release object is skipped; an answer that is not a list is an error.
pub fn parse_releases(json: &str) -> Result<Vec<ReleaseNote>, ReleasesError> {
    let entries: Vec<serde_json::Value> =
        serde_json::from_str(json).map_err(|_| ReleasesError::Parse)?;
    let mut found: Vec<((u32, u32, u32), ReleaseNote)> = entries
        .into_iter()
        .filter_map(|v| serde_json::from_value::<RawRelease>(v).ok())
        .filter(|r| !r.draft && !r.prerelease)
        .filter_map(|r| {
            let key = parse_tag(&r.tag_name)?;
            let note = ReleaseNote {
                version: r.tag_name.trim_start_matches('v').to_string(),
                body: r.body.unwrap_or_default(),
                published_at: r.published_at,
                url: r
                    .html_url
                    .unwrap_or_else(|| format!("{REPO_TAGS_URL}/{}", r.tag_name)),
                tag: r.tag_name,
            };
            Some((key, note))
        })
        .collect();
    found.sort_by_key(|(key, _)| std::cmp::Reverse(*key));
    found.truncate(KEEP);
    Ok(found.into_iter().map(|(_, note)| note).collect())
}

/// GitHub says "rate limited" with a 429, or a 403 whose remaining-requests header is 0.
pub fn classify_status(status: u16, rate_remaining: Option<&str>) -> Option<ReleasesError> {
    match status {
        200..=299 => None,
        429 => Some(ReleasesError::RateLimited),
        403 if rate_remaining == Some("0") => Some(ReleasesError::RateLimited),
        http => Some(ReleasesError::Status { http }),
    }
}

/// The releases list for the in-between notes of an update. Anonymous, with a generic User-Agent.
#[tauri::command]
#[tracing::instrument(skip_all)]
pub async fn releases_fetch() -> Result<Vec<ReleaseNote>, ReleasesError> {
    let network = |e: reqwest::Error| {
        tracing::warn!(error = %e, "releases request failed");
        ReleasesError::Network
    };
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!("EmberTerm/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(network)?;
    let response = client
        .get(RELEASES_URL)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(network)?;
    let remaining = response
        .headers()
        .get("x-ratelimit-remaining")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    if let Some(err) = classify_status(response.status().as_u16(), remaining.as_deref()) {
        return Err(err);
    }
    let text = response.text().await.map_err(network)?;
    parse_releases(&text)
}

#[cfg(test)]
#[path = "releases_test.rs"]
mod tests;
