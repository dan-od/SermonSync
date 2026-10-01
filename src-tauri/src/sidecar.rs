//! Python AI sidecar process management: spawn (dev: local Python source;
//! release: bundled sidecar), stdout/stderr forwarding to the frontend, exit
//! polling, health probe, and stop on app exit.

use std::sync::Mutex;

use serde::Serialize;
#[cfg(debug_assertions)]
use std::io::{BufRead, BufReader};
#[cfg(debug_assertions)]
use std::path::PathBuf;
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

pub struct SidecarState(pub Mutex<Option<SidecarChild>>);

#[cfg(debug_assertions)]
pub fn stop_sidecar(state: &SidecarState) {
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
pub fn stop_sidecar(state: &SidecarState) {
    if let Ok(mut child) = state.0.lock() {
        if let Some(child) = child.take() {
            let _ = child.kill();
        }
    }
}

/// Verify the Python AI sidecar is up by hitting its /health endpoint.
/// Returns the parsed JSON body (e.g. {"status": "ok"}) to the frontend,
/// or an error string the UI can surface in the SYS status display.
#[tauri::command]
pub async fn check_sidecar_health() -> Result<serde_json::Value, String> {
    let resp = reqwest::get("http://127.0.0.1:8000/health")
        .await
        .map_err(|e| format!("failed to reach sidecar: {e}"))?;
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("invalid response from sidecar: {e}"))
}

/// Spawn the sidecar at app setup and wire up log forwarding, exit polling
/// and the health probe.
pub fn launch_sidecar(app: &tauri::App) {
    #[cfg(debug_assertions)]
    let sidecar_result = {
        let sidecar_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../python-sidecar");
        let venv_python = sidecar_dir.parent().unwrap_or(&sidecar_dir).join(".venv/bin/python");
        let python = if venv_python.exists() { venv_python } else { PathBuf::from("python3") };
        std::process::Command::new(python)
            .arg("main.py")
            .current_dir(sidecar_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| error.to_string())
    };

    #[cfg(not(debug_assertions))]
    let sidecar_result = app
        .shell()
        .sidecar("python-sidecar")
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
                        let _ = handle.emit(
                            SIDECAR_LOG_EVENT,
                            SidecarLogPayload { stream: "stdout", line },
                        );
                    }
                });
            }
            if let Some(stderr) = child.stderr.take() {
                let handle = app_handle.clone();
                std::thread::spawn(move || {
                    for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                        eprintln!("[sidecar:stderr] {line}");
                        let _ = handle.emit(
                            SIDECAR_LOG_EVENT,
                            SidecarLogPayload { stream: "stderr", line },
                        );
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
                            Some(child) => child.try_wait().ok().flatten(),
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
                            let _ = app_handle.emit(
                                SIDECAR_LOG_EVENT,
                                SidecarLogPayload { stream: "stdout", line },
                            );
                        }
                        CommandEvent::Stderr(bytes) => {
                            let line = String::from_utf8_lossy(&bytes).trim_end().to_string();
                            eprintln!("[sidecar:stderr] {line}");
                            let _ = app_handle.emit(
                                SIDECAR_LOG_EVENT,
                                SidecarLogPayload { stream: "stderr", line },
                            );
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
            eprintln!(
                "[sidecar] not bundled yet: {e}; run `cd python-sidecar && python main.py` in dev"
            );
            let _ = app.handle().emit(
                SIDECAR_SPAWN_ERROR_EVENT,
                SidecarSpawnErrorPayload { message: e },
            );
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
