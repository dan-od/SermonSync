//! One ingestion boundary for videos used by the media gallery and template canvas.
//! The caller never receives a path until a managed MP4 has passed validation.
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{BufRead, BufReader, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
    time::Duration,
};

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

const MAX_SOURCE_BYTES: u64 = 200 * 1024 * 1024;
const PROFILE: &str = "sermonsync-playback-v1";
const EVENT: &str = "media-import://progress";
static WORKER: Mutex<()> = Mutex::new(());
static COMMIT: Mutex<()> = Mutex::new(());
static CANCELLATIONS: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoAsset {
    pub id: String,
    pub path: String,
    pub poster_path: String,
    pub duration_ms: u64,
    pub source_sha256: String,
    pub profile: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailure {
    pub code: &'static str,
    pub message: String,
}

impl ImportFailure {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

type ImportResult<T> = Result<T, ImportFailure>;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    request_id: &'a str,
    state: &'a str,
    percent: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    asset_id: Option<&'a str>,
}

fn progress(app: &AppHandle, request_id: &str, state: &str, percent: Option<u8>) {
    progress_with_asset(app, request_id, state, percent, None);
}

fn progress_with_asset(
    app: &AppHandle,
    request_id: &str,
    state: &str,
    percent: Option<u8>,
    asset_id: Option<&str>,
) {
    let _ = app.emit(
        EVENT,
        Progress {
            request_id,
            state,
            percent,
            asset_id,
        },
    );
}

fn cancelled(flag: &AtomicBool) -> ImportResult<()> {
    if flag.load(Ordering::Relaxed) {
        Err(ImportFailure::new(
            "IMPORT_CANCELLED",
            "Video import was cancelled.",
        ))
    } else {
        Ok(())
    }
}

fn executable(app: &AppHandle, name: &str) -> ImportResult<PathBuf> {
    let filename = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    let bundled = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("media-engine").join(&filename));
    if let Some(path) = bundled.filter(|path| path.is_file()) {
        return Ok(path);
    }
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(filename));
    }
    Err(ImportFailure::new(
        "MEDIA_ENGINE_MISSING",
        format!("SermonSync's bundled {name} is missing."),
    ))
}

pub(crate) fn engine_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    executable(app, name).map_err(|error| error.message)
}

fn repository(app: &AppHandle) -> ImportResult<PathBuf> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| ImportFailure::new("STORAGE_UNAVAILABLE", error.to_string()))?
        .join("media")
        .join("videos");
    fs::create_dir_all(path.join("temp"))
        .map_err(|error| ImportFailure::new("STORAGE_UNAVAILABLE", error.to_string()))?;
    fs::create_dir_all(path.join("assets"))
        .map_err(|error| ImportFailure::new("STORAGE_UNAVAILABLE", error.to_string()))?;
    Ok(path)
}

pub(crate) fn clean_interrupted_jobs(app: &AppHandle) -> Result<(), String> {
    let temp = repository(app).map_err(|error| error.message)?.join("temp");
    for entry in fs::read_dir(&temp).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry.path().is_dir() {
            fs::remove_dir_all(entry.path()).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn probe(app: &AppHandle, file: &Path) -> ImportResult<Value> {
    let result = Command::new(executable(app, "ffprobe")?)
        .args([
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
        ])
        .arg(file)
        .output()
        .map_err(|error| {
            ImportFailure::new(
                "PROBE_FAILED",
                format!("Could not inspect the video: {error}"),
            )
        })?;
    if !result.status.success() {
        return Err(ImportFailure::new(
            "PROBE_FAILED",
            "The selected video could not be read. It may be damaged or use an unsupported format.",
        ));
    }
    serde_json::from_slice(&result.stdout)
        .map_err(|_| ImportFailure::new("PROBE_FAILED", "The video inspection result was invalid."))
}

fn streams<'a>(descriptor: &'a Value, codec_type: &str) -> Vec<&'a Value> {
    descriptor["streams"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|entry| entry["codec_type"].as_str() == Some(codec_type))
        .collect()
}

fn frame_rate(stream: &Value, key: &str) -> f64 {
    let ratio = stream[key].as_str().unwrap_or("0/1");
    let (numerator, denominator) = ratio.split_once('/').unwrap_or((ratio, "1"));
    let n = numerator.parse::<f64>().unwrap_or(0.0);
    let d = denominator.parse::<f64>().unwrap_or(1.0);
    if d <= 0.0 {
        0.0
    } else {
        n / d
    }
}

fn duration_ms(descriptor: &Value) -> u64 {
    descriptor["format"]["duration"]
        .as_str()
        .or_else(|| {
            streams(descriptor, "video")
                .first()
                .and_then(|entry| entry["duration"].as_str())
        })
        .and_then(|value| value.parse::<f64>().ok())
        .map(|seconds| (seconds.max(0.0) * 1000.0) as u64)
        .unwrap_or(0)
}

fn is_hdr(video: &Value) -> bool {
    matches!(
        video["color_transfer"].as_str(),
        Some("smpte2084" | "arib-std-b67")
    ) || video["color_primaries"].as_str() == Some("bt2020")
}

fn video_is_profile_safe(video: &Value) -> bool {
    let width = video["width"].as_u64().unwrap_or(0);
    let height = video["height"].as_u64().unwrap_or(0);
    video["codec_name"].as_str() == Some("h264")
        && video["pix_fmt"].as_str() == Some("yuv420p")
        && width > 0
        && width <= 1920
        && height > 0
        && height <= 1080
        && frame_rate(video, "avg_frame_rate") > 0.0
        && frame_rate(video, "avg_frame_rate") <= 30.01
        && frame_rate(video, "r_frame_rate") <= 30.01
        && !is_hdr(video)
}

fn audio_is_profile_safe(audio: Option<&Value>) -> bool {
    audio.is_none_or(|audio| {
        audio["codec_name"].as_str() == Some("aac")
            && (1..=2).contains(&audio["channels"].as_u64().unwrap_or(0))
            && audio["sample_rate"].as_str() == Some("48000")
            && audio["profile"]
                .as_str()
                .is_none_or(|profile| profile == "LC")
    })
}

fn is_mp4_container(descriptor: &Value) -> bool {
    descriptor["format"]["format_name"]
        .as_str()
        .is_some_and(|name| {
            name.split(',')
                .any(|format| format == "mp4" || format == "mov")
        })
}

fn has_faststart(path: &Path) -> bool {
    let Ok(mut file) = File::open(path) else {
        return false;
    };
    let Ok(length) = file.metadata().map(|value| value.len()) else {
        return false;
    };
    let mut offset = 0_u64;
    while offset + 8 <= length && offset < 16 * 1024 * 1024 {
        if file.seek(SeekFrom::Start(offset)).is_err() {
            return false;
        }
        let mut header = [0_u8; 8];
        if file.read_exact(&mut header).is_err() {
            return false;
        }
        let kind = &header[4..8];
        if kind == b"moov" {
            return true;
        }
        if kind == b"mdat" {
            return false;
        }
        let size = u32::from_be_bytes(header[0..4].try_into().unwrap()) as u64;
        let atom_size = if size == 1 {
            let mut extended = [0_u8; 8];
            if file.read_exact(&mut extended).is_err() {
                return false;
            }
            u64::from_be_bytes(extended)
        } else {
            size
        };
        if atom_size < 8 {
            return false;
        }
        offset = match offset.checked_add(atom_size) {
            Some(value) => value,
            None => return false,
        };
    }
    false
}

#[derive(PartialEq)]
enum Route {
    Direct,
    Remux,
    AudioTranscode,
    Transcode,
}

fn classify(descriptor: &Value, original: &Path) -> ImportResult<Route> {
    let videos = streams(descriptor, "video");
    let audios = streams(descriptor, "audio");
    let video = videos.first().ok_or_else(|| {
        ImportFailure::new("NOT_A_VIDEO", "The selected file has no video track.")
    })?;
    if !video_is_profile_safe(video) {
        return Ok(Route::Transcode);
    }
    if !audio_is_profile_safe(audios.first().copied()) {
        return Ok(Route::AudioTranscode);
    }
    let container_is_mp4 = original
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("mp4"));
    let only_playback_streams = descriptor["streams"].as_array().is_some_and(|entries| {
        entries.len() == videos.len() + audios.len() && videos.len() == 1 && audios.len() <= 1
    });
    if container_is_mp4
        && is_mp4_container(descriptor)
        && only_playback_streams
        && has_faststart(original)
    {
        Ok(Route::Direct)
    } else {
        Ok(Route::Remux)
    }
}

fn copy_and_hash(
    source: &Path,
    destination: &Path,
    flag: &AtomicBool,
    max_bytes: Option<u64>,
) -> ImportResult<String> {
    let mut input = File::open(source).map_err(|error| {
        ImportFailure::new(
            "FILE_NOT_FOUND",
            format!("Could not open the selected video: {error}"),
        )
    })?;
    let mut output = File::create(destination).map_err(|error| {
        ImportFailure::new(
            "STORAGE_UNAVAILABLE",
            format!("Could not stage the video: {error}"),
        )
    })?;
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    let mut copied = 0_u64;
    loop {
        cancelled(flag)?;
        let read = input
            .read(&mut buffer)
            .map_err(|error| ImportFailure::new("READ_FAILED", error.to_string()))?;
        if read == 0 {
            break;
        }
        copied += read as u64;
        if max_bytes.is_some_and(|limit| copied > limit) {
            let limit_mib = max_bytes.unwrap_or(0) / (1024 * 1024);
            return Err(ImportFailure::new(
                "FILE_TOO_LARGE",
                format!("Videos must be {limit_mib} MiB or smaller."),
            ));
        }
        hash.update(&buffer[..read]);
        output.write_all(&buffer[..read]).map_err(|error| {
            ImportFailure::new("DISK_FULL", format!("Could not store the video: {error}"))
        })?;
    }
    output
        .sync_all()
        .map_err(|error| ImportFailure::new("DISK_FULL", error.to_string()))?;
    Ok(format!("{:x}", hash.finalize()))
}

fn run_ffmpeg(
    app: &AppHandle,
    args: &[String],
    flag: &AtomicBool,
    request_id: &str,
    total_ms: u64,
) -> ImportResult<()> {
    let binary = executable(app, "ffmpeg")?;
    #[cfg(unix)]
    let mut command = {
        let mut command = Command::new("nice");
        command.arg("-n").arg("15").arg(binary);
        command
    };
    #[cfg(not(unix))]
    let mut command = Command::new(binary);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0000_4000); // BELOW_NORMAL_PRIORITY_CLASS
    }
    let mut child = command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|error| {
            ImportFailure::new(
                "TRANSCODE_FAILED",
                format!("Could not start the media engine: {error}"),
            )
        })?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let app_for_progress = app.clone();
    let id_for_progress = request_id.to_string();
    let progress_reader = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(value) = line.strip_prefix("out_time_us=") {
                if let Ok(micros) = value.parse::<u64>() {
                    if total_ms > 0 {
                        let percent =
                            ((micros / 1000).saturating_mul(100) / total_ms).min(99) as u8;
                        progress(
                            &app_for_progress,
                            &id_for_progress,
                            "processing",
                            Some(percent),
                        );
                    }
                }
            }
        }
    });
    let errors = std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut tail = Vec::new();
        let mut chunk = [0_u8; 4096];
        while let Ok(count) = reader.read(&mut chunk) {
            if count == 0 {
                break;
            }
            tail.extend_from_slice(&chunk[..count]);
            if tail.len() > 64 * 1024 {
                tail.drain(..tail.len() - 64 * 1024);
            }
        }
        String::from_utf8_lossy(&tail).into_owned()
    });
    let status = loop {
        if flag.load(Ordering::Relaxed) {
            let _ = child.kill();
            break child.wait();
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = progress_reader.join();
                let _ = errors.join();
                return Err(ImportFailure::new("TRANSCODE_FAILED", error.to_string()));
            }
        }
    };
    let _ = progress_reader.join();
    let details = errors.join().unwrap_or_default();
    cancelled(flag)?;
    if !status
        .map_err(|error| ImportFailure::new("TRANSCODE_FAILED", error.to_string()))?
        .success()
    {
        eprintln!("[media-import] FFmpeg failed: {}", details.trim());
        if details.contains("No space left on device") {
            return Err(ImportFailure::new(
                "DISK_FULL",
                "There is not enough free space to prepare this video.",
            ));
        }
        return Err(ImportFailure::new("TRANSCODE_FAILED",
            "This video could not be converted. It may be damaged, protected, or use an unsupported format."));
    }
    Ok(())
}

fn validate(descriptor: &Value) -> ImportResult<()> {
    let videos = streams(descriptor, "video");
    let audios = streams(descriptor, "audio");
    if videos.len() != 1
        || audios.len() > 1
        || !video_is_profile_safe(videos[0])
        || !audio_is_profile_safe(audios.first().copied())
        || !is_mp4_container(descriptor)
        || duration_ms(descriptor) == 0
    {
        return Err(ImportFailure::new(
            "OUTPUT_VALIDATION_FAILED",
            "The prepared video did not meet SermonSync's playback requirements.",
        ));
    }
    Ok(())
}

fn do_import(
    app: &AppHandle,
    path: &str,
    request_id: &str,
    legacy: bool,
    max_source_bytes: Option<u64>,
    flag: &AtomicBool,
) -> ImportResult<VideoAsset> {
    progress(app, request_id, "precheck", None);
    let source = Path::new(path);
    let metadata = fs::metadata(source).map_err(|error| {
        ImportFailure::new(
            "FILE_NOT_FOUND",
            format!("The selected video is unavailable: {error}"),
        )
    })?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err(ImportFailure::new(
            "NOT_A_VIDEO",
            "Choose a nonempty local video file.",
        ));
    }
    let source_limit = if legacy { None } else { Some(max_source_bytes.unwrap_or(MAX_SOURCE_BYTES)) };
    if source_limit.is_some_and(|limit| metadata.len() > limit) {
        let limit_mib = source_limit.unwrap_or(0) / (1024 * 1024);
        return Err(ImportFailure::new(
            "FILE_TOO_LARGE",
            format!("Videos must be {limit_mib} MiB or smaller."),
        ));
    }
    let repo = repository(app)?;
    let job_dir = repo.join("temp").join(request_id);
    if job_dir.exists() {
        return Err(ImportFailure::new(
            "IMPORT_CONFLICT",
            "This video import is already running.",
        ));
    }
    fs::create_dir(&job_dir)
        .map_err(|error| ImportFailure::new("STORAGE_UNAVAILABLE", error.to_string()))?;
    let result = (|| {
        let staged = job_dir.join("source.bin");
        let source_hash = copy_and_hash(
            source,
            &staged,
            flag,
            source_limit,
        )?;
        cancelled(flag)?;
        let asset_id = format!("{source_hash}-{PROFILE}");
        let final_dir = repo.join("assets").join(&asset_id);
        let asset = |descriptor: &Value| VideoAsset {
            id: asset_id.clone(),
            path: final_dir
                .join("playback.mp4")
                .to_string_lossy()
                .into_owned(),
            poster_path: final_dir.join("poster.jpg").to_string_lossy().into_owned(),
            duration_ms: duration_ms(descriptor),
            source_sha256: source_hash.clone(),
            profile: PROFILE,
        };
        if final_dir.join("playback.mp4").is_file() && final_dir.join("poster.jpg").is_file() {
            if let Ok(ready) = probe(app, &final_dir.join("playback.mp4")) {
                if validate(&ready).is_ok() && has_faststart(&final_dir.join("playback.mp4")) {
                    progress(app, request_id, "ready", Some(100));
                    return Ok(asset(&ready));
                }
            }
        }
        progress_with_asset(app, request_id, "probing", None, Some(&asset_id));
        let original = probe(app, &staged)?;
        if duration_ms(&original) == 0 {
            return Err(ImportFailure::new(
                "CORRUPT_MEDIA",
                "The video duration could not be determined.",
            ));
        }
        let route = classify(&original, source)?;
        cancelled(flag)?;
        progress(app, request_id, "processing", Some(0));
        let _conversion_guard = if route == Route::Direct {
            None
        } else {
            Some(WORKER.lock().map_err(|_| {
                ImportFailure::new("IMPORT_CONFLICT", "Import queue is unavailable.")
            })?)
        };
        let playback = job_dir.join("playback.mp4");
        match route {
            Route::Direct => {
                fs::rename(&staged, &playback).map_err(|error| {
                    ImportFailure::new("STORAGE_UNAVAILABLE", error.to_string())
                })?;
            }
            Route::Remux | Route::AudioTranscode | Route::Transcode => {
                let mut args = vec![
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-nostdin",
                    "-y",
                    "-filter_threads",
                    "2",
                    "-protocol_whitelist",
                    "file,pipe",
                    "-threads",
                    "2",
                    "-i",
                ]
                .into_iter()
                .map(str::to_string)
                .collect::<Vec<_>>();
                args.push(staged.to_string_lossy().into_owned());
                args.extend(
                    [
                        "-map",
                        "0:v:0",
                        "-map",
                        "0:a:0?",
                        "-sn",
                        "-dn",
                        "-map_metadata",
                        "-1",
                    ]
                    .into_iter()
                    .map(str::to_string),
                );
                if route == Route::Remux {
                    args.extend(["-c", "copy"].into_iter().map(str::to_string));
                } else if route == Route::AudioTranscode {
                    args.extend(
                        [
                            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar",
                            "48000",
                        ]
                        .into_iter()
                        .map(str::to_string),
                    );
                } else {
                    let video = streams(&original, "video")[0];
                    let scale = "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2";
                    let filter = if is_hdr(video) {
                        format!("zscale=t=linear:npl=100,format=gbrpf32le,tonemap=mobius,zscale=t=bt709:m=bt709:p=bt709,{scale},format=yuv420p")
                    } else {
                        format!("{scale},format=yuv420p")
                    };
                    let source_fps = frame_rate(video, "avg_frame_rate");
                    let source_fps = if source_fps > 0.0 {
                        source_fps
                    } else {
                        frame_rate(video, "r_frame_rate")
                    };
                    let fps = if source_fps > 0.0 {
                        source_fps.clamp(1.0, 30.0)
                    } else {
                        30.0
                    };
                    args.extend([
                        "-vf".to_string(),
                        filter,
                        "-r".to_string(),
                        format!("{fps:.3}"),
                        "-c:v".to_string(),
                        "libopenh264".to_string(),
                        "-threads:v".to_string(),
                        "2".to_string(),
                        "-b:v".to_string(),
                        "4000k".to_string(),
                        "-maxrate".to_string(),
                        "5000k".to_string(),
                        "-bufsize".to_string(),
                        "10000k".to_string(),
                        "-pix_fmt".to_string(),
                        "yuv420p".to_string(),
                        "-c:a".to_string(),
                        "aac".to_string(),
                        "-b:a".to_string(),
                        "128k".to_string(),
                        "-ac".to_string(),
                        "2".to_string(),
                        "-ar".to_string(),
                        "48000".to_string(),
                    ]);
                }
                args.extend(
                    [
                        "-movflags",
                        "+faststart",
                        "-progress",
                        "pipe:1",
                        "-f",
                        "mp4",
                    ]
                    .into_iter()
                    .map(str::to_string),
                );
                args.push(playback.to_string_lossy().into_owned());
                run_ffmpeg(app, &args, flag, request_id, duration_ms(&original))?;
            }
        }
        cancelled(flag)?;
        progress(app, request_id, "validating", None);
        let output = probe(app, &playback)?;
        validate(&output)?;
        if !has_faststart(&playback) {
            return Err(ImportFailure::new(
                "OUTPUT_VALIDATION_FAILED",
                "The prepared video is missing fast-start metadata.",
            ));
        }
        let poster = job_dir.join("poster.jpg");
        let poster_time = (duration_ms(&output) / 2).min(500) as f64 / 1000.0;
        let args = vec![
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
            "-nostdin".to_string(),
            "-y".to_string(),
            "-ss".to_string(),
            format!("{poster_time:.3}"),
            "-i".to_string(),
            playback.to_string_lossy().into_owned(),
            "-vf".to_string(),
            "scale=640:360:force_original_aspect_ratio=increase,crop=640:360".to_string(),
            "-frames:v".to_string(),
            "1".to_string(),
            "-update".to_string(),
            "1".to_string(),
            poster.to_string_lossy().into_owned(),
        ];
        run_ffmpeg(app, &args, flag, request_id, duration_ms(&output))?;
        if !poster.is_file() {
            return Err(ImportFailure::new(
                "OUTPUT_VALIDATION_FAILED",
                "Could not decode the video preview frame.",
            ));
        }
        fs::write(
            job_dir.join("metadata.json"),
            serde_json::to_vec_pretty(&asset(&output))
                .map_err(|error| ImportFailure::new("STORAGE_UNAVAILABLE", error.to_string()))?,
        )
        .map_err(|error| ImportFailure::new("DISK_FULL", error.to_string()))?;
        let _ = fs::remove_file(&staged);
        cancelled(flag)?;
        progress(app, request_id, "committing", None);
        let _commit_guard = COMMIT.lock().map_err(|_| {
            ImportFailure::new("IMPORT_CONFLICT", "Media repository is unavailable.")
        })?;
        cancelled(flag)?;
        if final_dir.join("playback.mp4").is_file() && final_dir.join("poster.jpg").is_file() {
            if let Ok(existing) = probe(app, &final_dir.join("playback.mp4")) {
                if validate(&existing).is_ok() && has_faststart(&final_dir.join("playback.mp4")) {
                    progress(app, request_id, "ready", Some(100));
                    return Ok(asset(&existing));
                }
            }
        }
        if final_dir.exists() {
            fs::remove_dir_all(&final_dir)
                .map_err(|error| ImportFailure::new("STORAGE_UNAVAILABLE", error.to_string()))?;
        }
        fs::rename(&job_dir, &final_dir)
            .map_err(|error| ImportFailure::new("STORAGE_UNAVAILABLE", error.to_string()))?;
        progress(app, request_id, "ready", Some(100));
        Ok(asset(&output))
    })();
    if job_dir.exists() {
        let _ = fs::remove_dir_all(&job_dir);
    }
    result
}

fn lookup_ready_video_asset(app: &AppHandle, asset_id: String) -> ImportResult<Option<VideoAsset>> {
    let Some(source_hash) = asset_id.strip_suffix(&format!("-{PROFILE}")) else {
        return Err(ImportFailure::new(
            "IMPORT_CONFLICT",
            "Invalid video asset identifier.",
        ));
    };
    if source_hash.len() != 64 || !source_hash.bytes().all(|value| value.is_ascii_hexdigit()) {
        return Err(ImportFailure::new(
            "IMPORT_CONFLICT",
            "Invalid video asset identifier.",
        ));
    }
    let source_hash = source_hash.to_string();
    let final_dir = repository(app)?.join("assets").join(&asset_id);
    let playback = final_dir.join("playback.mp4");
    let poster = final_dir.join("poster.jpg");
    if !playback.is_file() || !poster.is_file() {
        return Ok(None);
    }
    let descriptor = probe(app, &playback)?;
    validate(&descriptor)?;
    if !has_faststart(&playback) {
        return Ok(None);
    }
    Ok(Some(VideoAsset {
        id: asset_id,
        path: playback.to_string_lossy().into_owned(),
        poster_path: poster.to_string_lossy().into_owned(),
        duration_ms: duration_ms(&descriptor),
        source_sha256: source_hash,
        profile: PROFILE,
    }))
}

#[tauri::command]
pub async fn get_ready_video_asset(
    app: AppHandle,
    asset_id: String,
) -> ImportResult<Option<VideoAsset>> {
    tauri::async_runtime::spawn_blocking(move || lookup_ready_video_asset(&app, asset_id))
        .await
        .map_err(|error| ImportFailure::new("IMPORT_FAILED", error.to_string()))?
}

#[tauri::command]
pub async fn import_video_asset(
    app: AppHandle,
    path: String,
    request_id: String,
    legacy: bool,
    max_source_bytes: Option<u64>,
) -> ImportResult<VideoAsset> {
    if request_id.is_empty()
        || !request_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '-')
    {
        return Err(ImportFailure::new(
            "IMPORT_CONFLICT",
            "Invalid import request.",
        ));
    }
    let flag = {
        let mut requests = CANCELLATIONS
            .lock()
            .map_err(|_| ImportFailure::new("IMPORT_CONFLICT", "Import queue is unavailable."))?;
        requests
            .entry(request_id.clone())
            .or_insert_with(|| Arc::new(AtomicBool::new(false)))
            .clone()
    };
    let id = request_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        progress(&app, &id, "queued", None);
        cancelled(&flag)?;
        do_import(&app, &path, &id, legacy, max_source_bytes, &flag)
    })
    .await;
    if let Ok(mut requests) = CANCELLATIONS.lock() {
        requests.remove(&request_id);
    }
    result.map_err(|error| ImportFailure::new("IMPORT_FAILED", error.to_string()))?
}

#[tauri::command]
pub fn cancel_video_import(request_id: String) {
    if let Ok(mut requests) = CANCELLATIONS.lock() {
        requests
            .entry(request_id)
            .or_insert_with(|| Arc::new(AtomicBool::new(true)))
            .store(true, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn descriptor() -> Value {
        json!({
            "format": { "format_name": "mov,mp4,m4a,3gp,3g2,mj2", "duration": "2.0" },
            "streams": [
                { "codec_type": "video", "codec_name": "h264", "pix_fmt": "yuv420p",
                  "width": 1280, "height": 720, "avg_frame_rate": "30/1", "r_frame_rate": "30/1" },
                { "codec_type": "audio", "codec_name": "aac", "profile": "LC", "channels": 2, "sample_rate": "48000" }
            ]
        })
    }

    #[test]
    fn classifies_copy_remux_and_transcode_from_streams() {
        let source =
            std::env::temp_dir().join(format!("sermonsync-profile-{}.mp4", std::process::id()));
        fs::write(
            &source,
            [
                0, 0, 0, 8, b'f', b't', b'y', b'p', 0, 0, 0, 8, b'm', b'o', b'o', b'v', 0, 0, 0, 8,
                b'm', b'd', b'a', b't',
            ],
        )
        .unwrap();
        assert!(classify(&descriptor(), &source).is_ok_and(|route| route == Route::Direct));
        let mut high_rate = descriptor();
        high_rate["streams"][0]["avg_frame_rate"] = json!("60/1");
        assert!(classify(&high_rate, &source).is_ok_and(|route| route == Route::Transcode));
        let mut audio_needs_work = descriptor();
        audio_needs_work["streams"][1]["sample_rate"] = json!("44100");
        assert!(
            classify(&audio_needs_work, &source).is_ok_and(|route| route == Route::AudioTranscode)
        );
        let mut mkv = descriptor();
        mkv["format"]["format_name"] = json!("matroska,webm");
        assert!(classify(&mkv, &source).is_ok_and(|route| route == Route::Remux));
        let _ = fs::remove_file(source);
    }

    #[test]
    fn output_validation_rejects_missing_or_oversized_video() {
        let mut missing = descriptor();
        missing["streams"] = json!([]);
        assert!(validate(&missing).is_err());
        let mut oversized = descriptor();
        oversized["streams"][0]["width"] = json!(3840);
        assert!(validate(&oversized).is_err());
        assert!(validate(&descriptor()).is_ok());
    }
}
