//! Media normalization commands (FFmpeg video transcoding).

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

/// Normalize arbitrary video input to the H.264/AAC profile supported by the
/// WebKitGTK media backend. FFmpeg is intentionally invoked through PATH in
/// development; packaged builds should ship the same executable as a sidecar.
#[tauri::command]
pub async fn normalize_video_data_url(data_url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let comma = data_url
            .find(',')
            .ok_or_else(|| "invalid video data URL".to_string())?;
        let header = &data_url[5..comma];
        if !header.to_ascii_lowercase().ends_with(";base64") {
            return Err("video data URL is not base64 encoded".to_string());
        }
        let input_bytes = BASE64
            .decode(&data_url[comma + 1..])
            .map_err(|error| format!("invalid video data: {error}"))?;
        let temp_dir = std::env::temp_dir().join(format!("sermonsync-video-{}", std::process::id()));
        std::fs::create_dir_all(&temp_dir)
            .map_err(|error| format!("failed to create video temp directory: {error}"))?;
        let input_path = temp_dir.join("input.bin");
        let output_path = temp_dir.join("normalized.mp4");
        std::fs::write(&input_path, input_bytes)
            .map_err(|error| format!("failed to write video temp file: {error}"))?;

        let result = std::process::Command::new("ffmpeg")
            .args([
                "-hide_banner", "-loglevel", "error", "-y", "-i",
                input_path.to_string_lossy().as_ref(), "-c:v", "libx264", "-profile:v", "high",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
                output_path.to_string_lossy().as_ref(),
            ])
            .output();

        let normalized = match result {
            Ok(output) if output.status.success() => std::fs::read(&output_path)
                .map_err(|error| format!("failed to read normalized video: {error}"))?,
            Ok(output) => {
                let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Err(if detail.is_empty() { "FFmpeg could not decode this video".to_string() } else { detail });
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Err("FFmpeg is not installed or bundled with SermonSync".to_string());
            }
            Err(error) => return Err(format!("failed to run FFmpeg: {error}")),
        };
        let _ = std::fs::remove_dir_all(&temp_dir);
        Ok(format!("data:video/mp4;base64,{}", BASE64.encode(normalized)))
    })
    .await
    .map_err(|error| format!("video normalization task failed: {error}"))?
}
