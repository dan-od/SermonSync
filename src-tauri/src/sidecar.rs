#[cfg(debug_assertions)]
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use serde::Serialize;
#[cfg(debug_assertions)]
use std::io::{BufRead, BufReader};
#[cfg(debug_assertions)]
use std::process::{Child as SidecarChild, Stdio};
use tauri::{Emitter, Manager};
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::{
    process::{CommandChild as SidecarChild, CommandEvent},
    ShellExt,
};

/// Event name the frontend listens to for real-time sidecar stdout/stderr
/// lines, surfaced independent of the HTTP `/api/logs` poll so startup
/// failures (crash, missing deps, port conflicts) are visible immediately
/// instead of manifesting only as a generic `fetch()` failure.
const SIDECAR_LOG_EVENT: &str = "sidecar://log";
/// Emitted once if the child process exits (crashes) unexpectedly.
const SIDECAR_EXIT_EVENT: &str = "sidecar://exit";
/// Emitted once if the child process could not even be spawned.
const SIDECAR_SPAWN_ERROR_EVENT: &str = "sidecar://spawn-error";

#[derive(Clone, Serialize)]
struct SidecarLogPayload {
    stream: &'static str, // "stdout" | "stderr"
    line: String,
}

#[derive(Clone, Serialize)]
struct SidecarExitPayload {
    code: Option<i32>,
}

#[derive(Clone, Serialize)]
struct SidecarSpawnErrorPayload {
    message: String,
}

static FORWARD_SIDECAR_STARTUP_LOGS: AtomicBool = AtomicBool::new(true);

pub(crate) struct SidecarState(pub(crate) Mutex<Option<SidecarChild>>);

#[cfg(all(debug_assertions, target_os = "linux"))]
fn clear_stale_dev_sidecar(sidecar_dir: &std::path::Path) -> Result<(), String> {
    use nix::sys::signal::{kill, Signal};
    use nix::unistd::Pid;

    let port_available = || std::net::TcpListener::bind(("127.0.0.1", 8000)).is_ok();
    if port_available() { return Ok(()); }

    let expected_dir = std::fs::canonicalize(sidecar_dir)
        .map_err(|error| format!("failed to identify sidecar directory: {error}"))?;
    let output = std::process::Command::new("fuser")
        .arg("8000/tcp")
        .output()
        .map_err(|error| format!("port 8000 is occupied and its owner could not be identified: {error}"))?;
    let owners = String::from_utf8_lossy(&output.stdout);
    let mut stale_pids = Vec::new();
    for pid in owners.split_whitespace().filter_map(|value| value.parse::<i32>().ok()) {
        let cwd = std::fs::read_link(format!("/proc/{pid}/cwd")).ok();
        let command = std::fs::read(format!("/proc/{pid}/cmdline")).ok();
        let runs_main = command.as_deref().is_some_and(|bytes| {
            bytes.split(|byte| *byte == 0).any(|argument| argument == b"main.py")
        });
        if cwd.as_deref() == Some(expected_dir.as_path()) && runs_main {
            stale_pids.push(pid);
        }
    }
    if stale_pids.is_empty() {
        return Err("port 8000 is occupied by another service; SermonSync will not stop it".to_string());
    }
    for pid in &stale_pids {
        let _ = kill(Pid::from_raw(*pid), Signal::SIGTERM);
    }
    for _ in 0..20 {
        if port_available() { return Ok(()); }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    for pid in &stale_pids {
        let _ = kill(Pid::from_raw(*pid), Signal::SIGKILL);
    }
    for _ in 0..10 {
        if port_available() { return Ok(()); }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    Err("the stale SermonSync sidecar did not release port 8000".to_string())
}

#[cfg(all(debug_assertions, not(target_os = "linux")))]
fn clear_stale_dev_sidecar(_sidecar_dir: &std::path::Path) -> Result<(), String> {
    Ok(())
}

#[cfg(debug_assertions)]
pub(crate) fn stop_sidecar(state: &SidecarState) {
    if let Ok(mut child) = state.0.lock() {
        if let Some(child) = child.take() {
            // Child::kill() is unreliable here: on Ctrl+C the parent can exit
            // before the SIGKILL lands / the zombie is reaped, orphaning
            // uvicorn on port 8000. Send the SIGKILL directly by PID instead.
            #[cfg(unix)]
            {
                use nix::sys::signal::{Signal, kill};
                use nix::unistd::Pid;
                let _ = kill(Pid::from_raw(child.id() as i32), Signal::SIGKILL);
            }
            #[cfg(not(unix))]
            {
                let _ = child.kill();
            }
        }
    }
}

#[cfg(not(debug_assertions))]
pub(crate) fn stop_sidecar(state: &SidecarState) {
    if let Ok(mut child) = state.0.lock() {
        if let Some(child) = child.take() {
            let _ = child.kill();
        }
    }
}

/// Background health probe — poll /health until the sidecar is responsive
/// or we time out (60 × 500 ms = 30 s). This runs alongside the raw
/// stdout/stderr forwarding above; the two are complementary: this confirms
/// the HTTP server actually bound its port, while the log forwarding shows
/// *why* it didn't if it never does.
fn spawn_health_probe(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        for attempt in 1u8..=60 {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            if let Ok(resp) = reqwest::get("http://127.0.0.1:8000/health").await {
                if resp.status().is_success() {
                    println!("[sidecar] health ok (attempt {attempt})");
                    // The HTTP log endpoint is authoritative after startup.
                    // Stop broadcasting every process line to webview event
                    // callbacks, which may belong to a pre-reload context.
                    FORWARD_SIDECAR_STARTUP_LOGS.store(false, Ordering::Relaxed);
                    return;
                }
            }
        }
        eprintln!(
            "[sidecar] did not respond within 30 s — \
             if running in dev mode, start it manually: \
             cd python-sidecar && python main.py"
        );
        let _ = app_handle.emit(
            SIDECAR_SPAWN_ERROR_EVENT,
            SidecarSpawnErrorPayload {
                message: "Sidecar did not respond within 30s".to_string(),
            },
        );
    });
}

/// Launches the Python sidecar and wires its output, exit and health reporting.
pub(crate) fn spawn_sidecar(
    app: &mut tauri::App,
    video_cache_dir: &str,
    managed_video_dir: &str,
    managed_audio_dir: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // SS-066: read whisper.model from the sidecar config file and pass
    // it as WHISPER_MODEL env so the sidecar knows which model to load
    // before it can reach its own settings DB.
    #[cfg(debug_assertions)]
    let whisper_model = {
        let config_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../python-sidecar/data/whisper_config.json");
        std::fs::read_to_string(&config_path)
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v.get("model").and_then(|m| m.as_str()).map(str::to_owned))
    };

    #[cfg(debug_assertions)]
    let sidecar_result = {
        let sidecar_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../python-sidecar");
        let venv_python = sidecar_dir.parent().unwrap_or(&sidecar_dir).join(".venv/bin/python");
        let python = if venv_python.exists() { venv_python } else { PathBuf::from("python3") };
        clear_stale_dev_sidecar(&sidecar_dir).and_then(|()| {
            let mut cmd = std::process::Command::new(python);
            cmd.arg("main.py")
                .env("SERMONSYNC_VIDEO_CACHE_DIR", &video_cache_dir)
                .env("SERMONSYNC_MANAGED_VIDEO_DIR", &managed_video_dir)
                .env("SERMONSYNC_MANAGED_AUDIO_DIR", &managed_audio_dir)
                .current_dir(&sidecar_dir)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            if let Some(ref model) = whisper_model {
                cmd.env("WHISPER_MODEL", model);
            }
            cmd.spawn().map_err(|error| error.to_string())
        })
    };

    // Linux ships the sidecar as an unpacked onedir resource (no
    // per-launch extraction); other platforms use the externalBin.
    #[cfg(all(not(debug_assertions), target_os = "linux"))]
    let sidecar_result = {
        let data_dir = app.path().app_data_dir()?.join("sidecar-data");
        let resources = app.path().resource_dir()?;
        let exe = resources.join("sidecar").join("python-sidecar");
        app.shell()
            .command(exe)
            .env("SERMONSYNC_VIDEO_CACHE_DIR", &video_cache_dir)
            .env("SERMONSYNC_MANAGED_VIDEO_DIR", &managed_video_dir)
            .env("SERMONSYNC_MANAGED_AUDIO_DIR", &managed_audio_dir)
            .env("SERMONSYNC_DATA_DIR", data_dir.to_string_lossy().into_owned())
            .env("SERMONSYNC_WHISPER_DIR", resources.join("whisper").to_string_lossy().into_owned())
            .spawn()
            .map_err(|error| error.to_string())
    };

    #[cfg(all(not(debug_assertions), not(target_os = "linux")))]
    let sidecar_result = app
        .shell()
        .sidecar("python-sidecar")
        .map(|command| command.env("SERMONSYNC_VIDEO_CACHE_DIR", &video_cache_dir)
            .env("SERMONSYNC_MANAGED_VIDEO_DIR", &managed_video_dir)
            .env("SERMONSYNC_MANAGED_AUDIO_DIR", &managed_audio_dir))
        .and_then(|command| command.spawn())
        .map_err(|error| error.to_string());

    // Development runs use the current Python source so audio fixes
    // are exercised immediately; release builds use the bundled sidecar.
    match sidecar_result {
        #[cfg(debug_assertions)]
        Ok(mut child) => {
            let app_handle = app.handle().clone();
            // Forward stdout/stderr line-by-line to the frontend as they
            // arrive, so a crash/traceback/missing-dependency error is
            // visible immediately instead of just a generic fetch failure.
            if let Some(stdout) = child.stdout.take() {
                let handle = app_handle.clone();
                std::thread::spawn(move || {
                    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                        println!("[sidecar:stdout] {line}");
                        if FORWARD_SIDECAR_STARTUP_LOGS.load(Ordering::Relaxed) {
                            let _ = handle.emit(
                                SIDECAR_LOG_EVENT,
                                SidecarLogPayload { stream: "stdout", line },
                            );
                        }
                    }
                });
            }
            if let Some(stderr) = child.stderr.take() {
                let handle = app_handle.clone();
                std::thread::spawn(move || {
                    for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                        eprintln!("[sidecar:stderr] {line}");
                        if FORWARD_SIDECAR_STARTUP_LOGS.load(Ordering::Relaxed) {
                            let _ = handle.emit(
                                SIDECAR_LOG_EVENT,
                                SidecarLogPayload { stream: "stderr", line },
                            );
                        }
                    }
                });
            }

            if let Ok(mut sidecar) = app.state::<SidecarState>().0.lock() {
                *sidecar = Some(child);
            }
            println!("[sidecar] launched python-sidecar");

            // Poll for the child's exit (crash) without holding the lock
            // for the process's whole lifetime, so `stop_sidecar` can
            // still take it on app exit.
            let exit_handle = app_handle.clone();
            let state_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    let state = state_handle.state::<SidecarState>();
                    let status = {
                        let mut guard = match state.0.lock() {
                            Ok(guard) => guard,
                            Err(_) => break,
                        };
                        match guard.as_mut() {
                            Some(child) => {
                                let result = child.try_wait().ok().flatten();
                                if result.is_some() { guard.take(); }
                                result
                            }
                            None => break, // already stopped/taken elsewhere
                        }
                    };
                    if let Some(status) = status {
                        eprintln!("[sidecar] process exited unexpectedly: {status}");
                        let _ = exit_handle.emit(
                            SIDECAR_EXIT_EVENT,
                            SidecarExitPayload { code: status.code() },
                        );
                        break;
                    }
                }
            });

            spawn_health_probe(app.handle().clone());
        }
        #[cfg(not(debug_assertions))]
        Ok((mut rx, child)) => {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            let line = String::from_utf8_lossy(&bytes).trim_end().to_string();
                            println!("[sidecar:stdout] {line}");
                            if FORWARD_SIDECAR_STARTUP_LOGS.load(Ordering::Relaxed) {
                                let _ = app_handle.emit(
                                    SIDECAR_LOG_EVENT,
                                    SidecarLogPayload { stream: "stdout", line },
                                );
                            }
                        }
                        CommandEvent::Stderr(bytes) => {
                            let line = String::from_utf8_lossy(&bytes).trim_end().to_string();
                            eprintln!("[sidecar:stderr] {line}");
                            if FORWARD_SIDECAR_STARTUP_LOGS.load(Ordering::Relaxed) {
                                let _ = app_handle.emit(
                                    SIDECAR_LOG_EVENT,
                                    SidecarLogPayload { stream: "stderr", line },
                                );
                            }
                        }
                        CommandEvent::Error(message) => {
                            eprintln!("[sidecar] error: {message}");
                            let _ = app_handle.emit(
                                SIDECAR_SPAWN_ERROR_EVENT,
                                SidecarSpawnErrorPayload { message },
                            );
                        }
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[sidecar] process exited unexpectedly: {payload:?}");
                            let _ = app_handle.emit(
                                SIDECAR_EXIT_EVENT,
                                SidecarExitPayload { code: payload.code },
                            );
                            break;
                        }
                        _ => {}
                    }
                }
            });

            if let Ok(mut sidecar) = app.state::<SidecarState>().0.lock() {
                *sidecar = Some(child);
            }
            println!("[sidecar] launched python-sidecar");
            spawn_health_probe(app.handle().clone());
        }
        Err(e) => {
            eprintln!("[sidecar] could not start: {e}");
            let _ = app.handle().emit(
                SIDECAR_SPAWN_ERROR_EVENT,
                SidecarSpawnErrorPayload { message: e },
            );
        }
    }
    Ok(())
}
