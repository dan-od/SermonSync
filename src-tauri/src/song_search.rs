use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct SongSearchRegistry(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchResult {
    id: String,
    provider: String,
    title: String,
    artist: String,
    source_name: String,
    source_url: String,
    content_type: String,
    text: Option<String>,
    snippet: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderDone {
    search_id: String,
    provider: String,
    error: Option<String>,
    skipped: bool,
}

#[tauri::command]
pub async fn start_song_search(
    app: AppHandle,
    search_id: String,
    query: String,
    artist: String,
    filter: String,
) -> Result<(), String> {
    let cancellation = Arc::new(AtomicBool::new(false));
    app.state::<SongSearchRegistry>()
        .0
        .lock()
        .map_err(|_| "search registry unavailable".to_string())?
        .insert(search_id.clone(), cancellation.clone());
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let hymn_query = format!("{} {}", query, artist).trim().to_string();
        let run_hymnary = filter != "songs";
        let run_songs = filter != "hymns";
        let mut tasks = Vec::new();
        if run_hymnary {
            let app = app_handle.clone();
            let id = search_id.clone();
            let cancel = cancellation.clone();
            let q = hymn_query.clone();
            tasks.push(tauri::async_runtime::spawn(async move {
                hymnary_search(app, id, q, cancel).await
            }));
        } else {
            emit_done(&app_handle, &search_id, "hymnary", None, true);
        }
        if run_songs {
            for provider in ["brave", "musixmatch"] {
                let app = app_handle.clone();
                let id = search_id.clone();
                let cancel = cancellation.clone();
                let q = query.clone();
                let a = artist.clone();
                tasks.push(tauri::async_runtime::spawn(async move {
                    keyed_search(app, id, q, a, provider, cancel).await
                }));
            }
        } else {
            emit_done(&app_handle, &search_id, "brave", None, true);
            emit_done(&app_handle, &search_id, "musixmatch", None, true);
        }
        for task in tasks {
            let _ = task.await;
        }
        if let Ok(mut registry) = app_handle.state::<SongSearchRegistry>().0.lock() {
            registry.remove(&search_id);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_song_search(app: AppHandle, search_id: String) {
    if let Ok(registry) = app.state::<SongSearchRegistry>().0.lock() {
        if let Some(flag) = registry.get(&search_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
}

async fn hymnary_search(
    app: AppHandle,
    search_id: String,
    query: String,
    cancelled: Arc<AtomicBool>,
) {
    let result = async {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(12))
            .build()
            .map_err(|e| e.to_string())?;
        let response = client
            .get("https://hymnary.org/search")
            .query(&[("qu", query.as_str()), ("export", "csv")])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Hymnary returned HTTP {}", response.status()));
        }
        let csv = response.text().await.map_err(|e| e.to_string())?;
        let rows = csv.lines().take(11).collect::<Vec<_>>();
        if rows.len() > 1 {
            let headers = parse_csv(rows[0]);
            for row in rows.iter().skip(1) {
                if cancelled.load(Ordering::Relaxed) {
                    break;
                }
                let cols = parse_csv(row);
                if cols.is_empty() {
                    continue;
                }
                let field = |names: &[&str]| -> String {
                    names
                        .iter()
                        .find_map(|name| {
                            headers
                                .iter()
                                .position(|h| h.to_lowercase().contains(name))
                                .and_then(|i| cols.get(i))
                                .filter(|v| !v.trim().is_empty())
                                .cloned()
                        })
                        .unwrap_or_default()
                };
                let title = field(&["title", "name"]);
                if title.is_empty() {
                    continue;
                }
                let author = field(&["author", "composer", "person"]);
                let url = field(&["url", "link"]);
                let identifier = field(&["id", "identifier"]);
                let source_url = if url.starts_with("http") {
                    url
                } else if !identifier.is_empty() {
                    format!("https://hymnary.org/text/{identifier}")
                } else {
                    "https://hymnary.org".to_string()
                };
                emit_result(
                    &app,
                    &search_id,
                    SearchResult {
                        id: format!("hymnary:{}", identifier_or_url(&identifier, &source_url)),
                        provider: "hymnary".into(),
                        title,
                        artist: author,
                        source_name: "Hymnary.org".into(),
                        source_url,
                        content_type: "source".into(),
                        text: None,
                        snippet: None,
                    },
                );
            }
        }
        Ok::<(), String>(())
    }
    .await;
    emit_done(&app, &search_id, "hymnary", result.err(), false);
}

async fn keyed_search(
    app: AppHandle,
    search_id: String,
    query: String,
    artist: String,
    provider: &str,
    cancelled: Arc<AtomicBool>,
) {
    let key = match crate::commands::keyring::load_provider_key(provider.to_string()) {
        Ok(Some(value)) => value,
        Ok(None) => {
            emit_done(&app, &search_id, provider, None, true);
            return;
        }
        Err(error) => {
            emit_done(&app, &search_id, provider, Some(error), false);
            return;
        }
    };
    let result = if provider == "brave" {
        match tokio::time::timeout(
            Duration::from_secs(25),
            brave_search(&app, &search_id, &query, &artist, &key, &cancelled),
        )
        .await
        {
            Ok(result) => result,
            Err(_) => Err("brave search timed out".to_string()),
        }
    } else {
        match tokio::time::timeout(
            Duration::from_secs(25),
            musixmatch_search(&app, &search_id, &query, &artist, &key, &cancelled),
        )
        .await
        {
            Ok(result) => result,
            Err(_) => Err("musixmatch search timed out".to_string()),
        }
    };
    emit_done(&app, &search_id, provider, result.err(), false);
}

async fn brave_search(
    app: &AppHandle,
    search_id: &str,
    query: &str,
    artist: &str,
    key: &str,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;
    let q = format!("{} {} song lyrics", query, artist)
        .trim()
        .to_string();
    let response = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("X-Subscription-Token", key)
        .query(&[("q", q.as_str()), ("count", "10")])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Brave returned HTTP {}", response.status()));
    }
    let json: Value = response.json().await.map_err(|e| e.to_string())?;
    for item in json
        .pointer("/web/results")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(10)
    {
        if cancelled.load(Ordering::Relaxed) {
            break;
        }
        let title = item["title"].as_str().unwrap_or_default().to_string();
        let url = item["url"].as_str().unwrap_or_default().to_string();
        if title.is_empty() || url.is_empty() {
            continue;
        }
        let domain = reqwest::Url::parse(&url)
            .ok()
            .and_then(|u| u.host_str().map(str::to_string))
            .unwrap_or_else(|| "Web".into());
        let snippet = item["description"].as_str().map(str::to_string);
        emit_result(
            app,
            search_id,
            SearchResult {
                id: format!("brave:{url}"),
                provider: "brave".into(),
                title: clean_title(&title),
                artist: artist.to_string(),
                source_name: domain,
                source_url: url,
                content_type: "source".into(),
                text: None,
                snippet,
            },
        );
    }
    Ok(())
}

async fn musixmatch_search(
    app: &AppHandle,
    search_id: &str,
    query: &str,
    artist: &str,
    key: &str,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get("https://api.musixmatch.com/ws/1.1/track.search")
        .query(&[
            ("apikey", key),
            ("q_track", query),
            ("q_artist", artist),
            ("page_size", "10"),
            ("s_track_rating", "desc"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Musixmatch returned HTTP {}", response.status()));
    }
    let json: Value = response.json().await.map_err(|e| e.to_string())?;
    let tracks = json
        .pointer("/message/body/track_list")
        .and_then(Value::as_array)
        .ok_or_else(|| "Musixmatch response contained no track list".to_string())?;
    for entry in tracks.iter().take(10) {
        if cancelled.load(Ordering::Relaxed) {
            break;
        }
        let track = &entry["track"];
        let title = track["track_name"].as_str().unwrap_or_default().to_string();
        if title.is_empty() {
            continue;
        }
        let artist_name = track["artist_name"].as_str().unwrap_or(artist).to_string();
        let url = track["track_share_url"]
            .as_str()
            .unwrap_or("https://www.musixmatch.com")
            .to_string();
        let track_id = track["track_id"].as_i64();
        let mut lyrics = None;
        if let Some(track_id) = track_id {
            if let Ok(response) = client
                .get("https://api.musixmatch.com/ws/1.1/track.lyrics.get")
                .query(&[("apikey", key), ("track_id", &track_id.to_string())])
                .send()
                .await
            {
                if let Ok(value) = response.json::<Value>().await {
                    lyrics = value
                        .pointer("/message/body/lyrics/lyrics_body")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                }
            }
        }
        let usable = lyrics.filter(|text| {
            !text.trim().is_empty()
                && !text.contains("******* This Lyrics is NOT for Commercial use *******")
        });
        emit_result(
            app,
            search_id,
            SearchResult {
                id: format!("musixmatch:{}", track_id.unwrap_or_default()),
                provider: "musixmatch".into(),
                title,
                artist: artist_name,
                source_name: "Musixmatch".into(),
                source_url: url,
                content_type: if usable.is_some() { "lyrics" } else { "source" }.into(),
                text: usable,
                snippet: None,
            },
        );
    }
    Ok(())
}

fn emit_result(app: &AppHandle, search_id: &str, result: SearchResult) {
    let _ = app.emit(
        "song-search-result",
        serde_json::json!({"searchId": search_id, "result": result}),
    );
}
fn emit_done(
    app: &AppHandle,
    search_id: &str,
    provider: &str,
    error: Option<String>,
    skipped: bool,
) {
    let _ = app.emit(
        "song-search-provider-done",
        ProviderDone {
            search_id: search_id.into(),
            provider: provider.into(),
            error,
            skipped,
        },
    );
}
fn identifier_or_url(id: &str, url: &str) -> String {
    if id.is_empty() {
        url.to_string()
    } else {
        id.to_string()
    }
}
fn clean_title(title: &str) -> String {
    title
        .split(" - ")
        .next()
        .unwrap_or(title)
        .trim()
        .to_string()
}
fn parse_csv(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut value = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '"' if quoted && chars.peek() == Some(&'"') => {
                value.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => {
                out.push(std::mem::take(&mut value));
            }
            _ => value.push(ch),
        }
    }
    out.push(value);
    out
}
