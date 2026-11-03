use std::path::PathBuf;
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use sha2::{Digest, Sha256};
use tauri::Manager;

static MEDIA_THUMBNAIL_LOCK: Mutex<()> = Mutex::new(());

/// Normalize arbitrary video input to the H.264/AAC profile supported by the
/// WebKitGTK media backend. FFmpeg is intentionally invoked through PATH in
/// development; packaged builds should ship the same executable as a sidecar.
fn template_video_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_config_dir()
        .map_err(|error| format!("failed to resolve video cache directory: {error}"))?
        .join("video-cache");
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("failed to create video cache directory: {error}"))?;
    Ok(directory)
}

fn decode_template_video(data_url: &str) -> Result<Vec<u8>, String> {
    let comma = data_url.find(',').ok_or_else(|| "invalid video data URL".to_string())?;
    if !data_url.starts_with("data:") || !data_url[5..comma].to_ascii_lowercase().ends_with(";base64") {
        return Err("video data URL is not base64 encoded".to_string());
    }
    BASE64.decode(&data_url[comma + 1..])
        .map_err(|error| format!("invalid video data: {error}"))
}

fn template_video_hash(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    })
}

#[tauri::command]
pub async fn read_template_image_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = std::path::Path::new(&path);
        let extension = file.extension().and_then(|value| value.to_str())
            .unwrap_or("").to_ascii_lowercase();
        let mime = match extension.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "webp" => "image/webp",
            "gif" => "image/gif",
            "bmp" => "image/bmp",
            "avif" => "image/avif",
            "svg" => "image/svg+xml",
            _ => return Err("Choose an image or video file.".to_string()),
        };
        let size = std::fs::metadata(file)
            .map_err(|error| format!("failed to inspect selected image: {error}"))?.len();
        if size > 32 * 1024 * 1024 {
            return Err("This image is too large for a template background (32 MB maximum).".to_string());
        }
        let bytes = std::fs::read(file)
            .map_err(|error| format!("failed to read selected image: {error}"))?;
        Ok(format!("data:{mime};base64,{}", BASE64.encode(bytes)))
    }).await.map_err(|error| format!("image import task failed: {error}"))?
}

#[tauri::command]
pub async fn import_overlay_png(app: tauri::AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = std::path::Path::new(&path);
        if !file.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("png")) {
            return Err("Choose a .png image for the watermark.".to_string());
        }
        let size = std::fs::metadata(file)
            .map_err(|error| format!("failed to inspect watermark: {error}"))?.len();
        if size > 32 * 1024 * 1024 {
            return Err("Watermark PNG exceeds the 32 MB limit.".to_string());
        }
        let bytes = std::fs::read(file)
            .map_err(|error| format!("failed to read watermark: {error}"))?;
        if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Err("The selected file is not a valid PNG image.".to_string());
        }
        let directory = app.path().app_config_dir()
            .map_err(|error| format!("failed to locate overlay storage: {error}"))?
            .join("overlay-assets");
        std::fs::create_dir_all(&directory)
            .map_err(|error| format!("failed to create overlay storage: {error}"))?;
        let target = directory.join(format!("{:x}.png", Sha256::digest(&bytes)));
        if !target.exists() {
            std::fs::write(&target, bytes)
                .map_err(|error| format!("failed to save watermark: {error}"))?;
        }
        Ok(target.to_string_lossy().into_owned())
    }).await.map_err(|error| format!("watermark import task failed: {error}"))?
}

#[tauri::command]
pub async fn stage_template_video(app: tauri::AppHandle, data_url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let input = decode_template_video(&data_url)?;
        let hash = template_video_hash(&input);
        let cache = template_video_cache_dir(&app)?;
        let prepared = cache.join(format!("{hash:016x}.mp4"));
        if prepared.is_file() { return Ok(prepared.to_string_lossy().into_owned()); }
        let staged = cache.join(format!("{hash:016x}-source.bin"));
        if std::fs::metadata(&staged).map(|metadata| metadata.len()).ok() != Some(input.len() as u64) {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|error| format!("failed to create video staging name: {error}"))?
                .as_nanos();
            let temporary = cache.join(format!("{hash:016x}-{nonce}-staging.tmp"));
            std::fs::write(&temporary, input)
                .map_err(|error| format!("failed to stage template video: {error}"))?;
            std::fs::rename(&temporary, &staged)
                .map_err(|error| format!("failed to finalize staged video: {error}"))?;
        }
        Ok(staged.to_string_lossy().into_owned())
    }).await.map_err(|error| format!("video staging task failed: {error}"))?
}

#[tauri::command]
pub async fn create_media_thumbnail(app: tauri::AppHandle, path: String, category: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let extension = match category.as_str() {
            "audio" | "images" | "videos" => "jpg",
            _ => return Err("unsupported media category".to_string()),
        };
        let source = PathBuf::from(&path);
        let metadata = std::fs::metadata(&source)
            .map_err(|error| format!("failed to read media file: {error}"))?;
        if !metadata.is_file() { return Err("media path is not a file".to_string()); }
        let modified = metadata.modified().ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let identity = format!("{category}:{path}:{}:{modified}", metadata.len());
        let hash = template_video_hash(identity.as_bytes());
        let directory = app.path().app_config_dir()
            .map_err(|error| format!("failed to resolve thumbnail cache: {error}"))?
            .join("media-thumbnails");
        std::fs::create_dir_all(&directory)
            .map_err(|error| format!("failed to create thumbnail cache: {error}"))?;
        let output_path = directory.join(format!("{hash:016x}.{extension}"));
        let _guard = MEDIA_THUMBNAIL_LOCK.lock()
            .map_err(|_| "media thumbnail lock failed".to_string())?;
        if output_path.exists() { return Ok(output_path.to_string_lossy().into_owned()); }
        let temporary_path = directory.join(format!("{hash:016x}.tmp.{extension}"));
        let mut command = std::process::Command::new(crate::media_import::engine_path(&app, "ffmpeg")?);
        command.args(["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", "2"]);
        if category == "videos" { command.args(["-ss", "0.5"]); }
        command.arg("-i").arg(&source);
        if category == "audio" {
            command.args(["-map", "0:v:0?", "-vf", "scale=640:360:force_original_aspect_ratio=increase,crop=640:360"]);
        } else {
            command.args(["-vf", "scale=640:360:force_original_aspect_ratio=increase,crop=640:360"]);
        }
        command.args(["-frames:v", "1", "-update", "1"]);
        if category != "audio" { command.args(["-q:v", "3"]); }
        let result = command.arg(&temporary_path).output();
        match result {
            Ok(output) if output.status.success() && temporary_path.exists() => {
                std::fs::rename(&temporary_path, &output_path)
                    .map_err(|error| format!("failed to cache thumbnail: {error}"))?;
                Ok(output_path.to_string_lossy().into_owned())
            }
            Ok(output) => {
                let _ = std::fs::remove_file(&temporary_path);
                let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
                Err(if detail.is_empty() { "could not create media thumbnail".to_string() } else { detail })
            }
            Err(error) => Err(format!("could not run FFmpeg for media thumbnail: {error}")),
        }
    }).await.map_err(|error| format!("thumbnail task failed: {error}"))?
}
