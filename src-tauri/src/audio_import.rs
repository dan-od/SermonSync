use std::{
    collections::HashMap,
    fs,
    io::{BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex, OnceLock},
    time::UNIX_EPOCH,
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::media_import::engine_path;

const PROFILE: &str = "sermonsync-audio-v1";
static IMPORT_LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
const WAVEFORM_CACHE_VERSION: &str = "signed-waveform-v2";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioAsset {
    id: String,
    path: String,
}

#[derive(Deserialize, Serialize)]
pub struct AudioWaveform {
    peaks: Vec<f32>,
    #[serde(rename = "minPeaks")]
    min_peaks: Vec<f32>,
    #[serde(rename = "maxPeaks")]
    max_peaks: Vec<f32>,
    duration: f64,
}

fn asset_import_lock(id: &str) -> Result<Arc<Mutex<()>>, String> {
    let locks = IMPORT_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut locks = locks.lock().map_err(|_| "Audio import lock failed")?;
    locks.retain(|_, lock| Arc::strong_count(lock) > 1);
    Ok(Arc::clone(
        locks
            .entry(id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(()))),
    ))
}

fn ready_file(path: &Path) -> bool {
    fs::metadata(path).is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0)
}

fn waveform_cache_path(app: &AppHandle, source: &Path, metadata: &fs::Metadata) -> Option<PathBuf> {
    let modified = metadata
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_nanos();
    let mut hasher = Sha256::new();
    hasher.update(WAVEFORM_CACHE_VERSION.as_bytes());
    hasher.update(source.to_string_lossy().as_bytes());
    hasher.update(metadata.len().to_le_bytes());
    hasher.update(modified.to_le_bytes());
    Some(
        app.path()
            .app_data_dir()
            .ok()?
            .join("media/audio/waveforms")
            .join(format!("{:x}.json", hasher.finalize())),
    )
}

fn read_cached_waveform(path: &Path) -> Option<AudioWaveform> {
    let cached: AudioWaveform = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    (cached.duration.is_finite()
        && cached.duration > 0.0
        && cached.peaks.len() == 512
        && !cached.min_peaks.is_empty()
        && cached.min_peaks.len() == cached.max_peaks.len()
        && cached.min_peaks.len() <= 24_000)
        .then_some(cached)
}

fn cache_waveform(path: &Path, waveform: &AudioWaveform) {
    let Some(parent) = path.parent() else { return };
    let Ok(bytes) = serde_json::to_vec(waveform) else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    let nonce = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |time| time.as_nanos());
    let temporary = path.with_extension(format!("{nonce}.tmp"));
    if fs::write(&temporary, bytes)
        .and_then(|_| fs::rename(&temporary, path))
        .is_err()
    {
        let _ = fs::remove_file(&temporary);
        return;
    }
    if let Ok(entries) = fs::read_dir(parent) {
        let mut cached: Vec<_> = entries
            .flatten()
            .filter(|entry| {
                entry
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "json")
            })
            .filter_map(|entry| Some((entry.path(), entry.metadata().ok()?.modified().ok()?)))
            .collect();
        if cached.len() > 128 {
            cached.sort_by_key(|(_, modified)| *modified);
            let excess = cached.len() - 128;
            for (old, _) in cached.into_iter().take(excess) {
                let _ = fs::remove_file(old);
            }
        }
    }
}

fn assets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("media/audio/assets"))
        .map_err(|error| error.to_string())
}

fn managed_audio(path: &Path, assets: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(assets) else {
        return false;
    };
    let mut parts = relative.components();
    let Some(std::path::Component::Normal(id)) = parts.next() else {
        return false;
    };
    let Some(std::path::Component::Normal(file)) = parts.next() else {
        return false;
    };
    parts.next().is_none()
        && file == "playback.mp3"
        && id.to_str().is_some_and(|value| {
            value.len() == 64 + 1 + PROFILE.len()
                && value.ends_with(&format!("-{PROFILE}"))
                && value[..64].bytes().all(|byte| byte.is_ascii_hexdigit())
        })
}

fn import(app: &AppHandle, path: &str) -> Result<AudioAsset, String> {
    let source =
        fs::canonicalize(path).map_err(|error| format!("Audio file is unavailable: {error}"))?;
    let metadata = fs::metadata(&source).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("Audio source is not a file".into());
    }
    let assets = assets_dir(app)?;
    if managed_audio(&source, &assets) {
        let id = source
            .parent()
            .and_then(|dir| dir.file_name())
            .unwrap()
            .to_string_lossy()
            .into_owned();
        return Ok(AudioAsset {
            id,
            path: source.to_string_lossy().into_owned(),
        });
    }
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|time| time.as_nanos())
        .unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(source.to_string_lossy().as_bytes());
    hasher.update(metadata.len().to_le_bytes());
    hasher.update(modified.to_le_bytes());
    let id = format!("{:x}-{PROFILE}", hasher.finalize());
    let directory = assets.join(&id);
    let target = directory.join("playback.mp3");
    if !ready_file(&target) {
        let lock = asset_import_lock(&id)?;
        let _guard = lock.lock().map_err(|_| "Audio import lock failed")?;
        if ready_file(&target) {
            return Ok(AudioAsset {
                id,
                path: target.to_string_lossy().into_owned(),
            });
        }
        let is_mp3 = source
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("mp3"));
        // FFmpeg validates other formats during conversion; only a direct MP3
        // copy needs a separate probe.
        if is_mp3 {
            probe_duration(app, &source)
                .map_err(|error| format!("Could not inspect audio: {error}"))?;
        }
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Could not prepare audio storage: {error}"))?;
        let temporary = directory.join(format!("playback-{}.tmp", std::process::id()));
        let result = if is_mp3 {
            fs::copy(&source, &temporary)
                .map(|_| ())
                .map_err(|error| error.to_string())
        } else {
            let output = Command::new(engine_path(app, "ffmpeg")?)
                .args(["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i"])
                .arg(&source)
                .args([
                    "-map",
                    "0:a:0",
                    "-vn",
                    "-codec:a",
                    "libmp3lame",
                    "-q:a",
                    "2",
                    "-f",
                    "mp3",
                ])
                .arg(&temporary)
                .output()
                .map_err(|error| error.to_string())?;
            if output.status.success() {
                Ok(())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
            }
        };
        if let Err(error) = result {
            let _ = fs::remove_file(&temporary);
            return Err(format!("Could not import audio: {error}"));
        }
        if !ready_file(&temporary) {
            let _ = fs::remove_file(&temporary);
            return Err("Audio import produced an empty file".into());
        }
        fs::rename(&temporary, &target).map_err(|error| error.to_string())?;
    }
    Ok(AudioAsset {
        id,
        path: target.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn import_audio_asset(app: AppHandle, path: String) -> Result<AudioAsset, String> {
    tauri::async_runtime::spawn_blocking(move || import(&app, &path))
        .await
        .map_err(|error| error.to_string())?
}

fn probe_duration(app: &AppHandle, path: &Path) -> Result<f64, String> {
    let output = Command::new(engine_path(app, "ffprobe")?)
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
        ])
        .arg(path)
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let duration: f64 = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .map_err(|_| "Could not determine audio duration")?;
    if !duration.is_finite() || duration <= 0.0 {
        return Err("Invalid audio duration".into());
    }
    Ok(duration)
}

fn waveform(app: &AppHandle, path: &str) -> Result<AudioWaveform, String> {
    let source =
        fs::canonicalize(path).map_err(|error| format!("Audio file is unavailable: {error}"))?;
    let metadata = fs::metadata(&source).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("Audio source is not a file".into());
    }
    let cache_path = waveform_cache_path(app, &source, &metadata);
    if let Some(cached) = cache_path.as_deref().and_then(read_cached_waveform) {
        return Ok(cached);
    }
    let duration = probe_duration(app, &source)?;
    const SAMPLE_RATE: f64 = 2000.0;
    const BUCKETS: usize = 512;
    // At most 20 signed envelopes per second, capped for long recordings.
    const MAX_DETAIL_BUCKETS: usize = 24_000;
    let detail_buckets = ((duration * 20.0).ceil() as usize).clamp(BUCKETS, MAX_DETAIL_BUCKETS);
    let mut child = Command::new(engine_path(app, "ffmpeg")?)
        .args(["-hide_banner", "-loglevel", "error", "-nostdin", "-i"])
        .arg(&source)
        .args([
            "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "2000", "-f", "f32le", "pipe:1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or("FFmpeg did not provide audio samples")?;
    let mut reader = BufReader::new(stdout);
    let mut peaks = vec![0.0_f32; BUCKETS];
    let mut min_peaks = vec![0.0_f32; detail_buckets];
    let mut max_peaks = vec![0.0_f32; detail_buckets];
    let mut bytes = [0_u8; 8192];
    let mut pending = [0_u8; 4];
    let mut pending_len = 0_usize;
    let mut sample_index = 0_u64;
    loop {
        let count = reader.read(&mut bytes).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        for byte in &bytes[..count] {
            pending[pending_len] = *byte;
            pending_len += 1;
            if pending_len == 4 {
                let sample = f32::from_le_bytes(pending);
                let bucket =
                    ((sample_index as f64 / (duration * SAMPLE_RATE)) * BUCKETS as f64) as usize;
                let bucket = bucket.min(BUCKETS - 1);
                if sample.is_finite() {
                    let sample = sample.clamp(-1.0, 1.0);
                    peaks[bucket] = peaks[bucket].max(sample.abs());
                    let detail_bucket = ((sample_index as f64 / (duration * SAMPLE_RATE))
                        * detail_buckets as f64) as usize;
                    let detail_bucket = detail_bucket.min(detail_buckets - 1);
                    min_peaks[detail_bucket] = min_peaks[detail_bucket].min(sample);
                    max_peaks[detail_bucket] = max_peaks[detail_bucket].max(sample);
                }
                sample_index += 1;
                pending_len = 0;
            }
        }
    }
    if !child.wait().map_err(|error| error.to_string())?.success() {
        return Err("FFmpeg could not decode audio".into());
    }
    let result = AudioWaveform {
        peaks,
        min_peaks,
        max_peaks,
        duration,
    };
    if let Some(path) = cache_path.as_deref() {
        cache_waveform(path, &result);
    }
    Ok(result)
}

#[tauri::command]
pub async fn get_audio_waveform(app: AppHandle, path: String) -> Result<AudioWaveform, String> {
    tauri::async_runtime::spawn_blocking(move || waveform(&app, &path))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{cache_waveform, read_cached_waveform, AudioWaveform};
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn cached_signed_waveform_survives_restart_and_ignores_corruption() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("sermonsync-waveform-{nonce}"));
        let path = directory.join("track.json");
        let waveform = AudioWaveform {
            peaks: vec![0.7; 512],
            min_peaks: vec![-0.6, -0.2],
            max_peaks: vec![0.7, 0.3],
            duration: 12.0,
        };
        cache_waveform(&path, &waveform);
        let cached = read_cached_waveform(&path).expect("cached waveform is readable");
        assert_eq!(cached.min_peaks, waveform.min_peaks);
        assert_eq!(cached.max_peaks, waveform.max_peaks);
        fs::write(&path, b"partial waveform").unwrap();
        assert!(read_cached_waveform(&path).is_none());
        fs::remove_dir_all(directory).unwrap();
    }
}
