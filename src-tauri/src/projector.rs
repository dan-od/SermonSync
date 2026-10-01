//! SS-036: congregation output on a second display.
//!
//! The same frontend bundle runs in two webviews. `main` is the operator app
//! and owns all state; `projector` renders only the LIVE stage and mirrors the
//! state `main` pushes to it over Tauri events. This module only manages the
//! projector window itself: which monitors exist, where the window goes, and
//! telling `main` when the window disappears.

use std::time::Duration;

use serde::Serialize;
use tauri::{
    window::Color, AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

pub const PROJECTOR_LABEL: &str = "projector";
const MAIN_LABEL: &str = "main";
/// Emitted to `main` whenever the projector window is destroyed, whoever closed it.
const PROJECTOR_CLOSED_EVENT: &str = "projector://closed";
/// Logical size of the windowed test mode.
const TEST_WINDOW_WIDTH: f64 = 960.0;
const TEST_WINDOW_HEIGHT: f64 = 540.0;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfo {
    /// `name@x,y`, so two monitors of the same model are told apart.
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale_factor: f64,
    pub is_primary: bool,
    /// The monitor the operator window is currently on.
    pub is_operator_display: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectorWindowState {
    pub open: bool,
    pub windowed: bool,
    pub display: Option<DisplayInfo>,
}

fn monitor_name(monitor: &Monitor) -> String {
    monitor
        .name()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Display".to_string())
}

fn monitor_id(monitor: &Monitor) -> String {
    let position = monitor.position();
    format!("{}@{},{}", monitor_name(monitor), position.x, position.y)
}

/// The display name encoded in an id (`name@x,y`). Names may contain `@`.
fn name_from_id(id: &str) -> &str {
    id.rsplit_once('@').map(|(name, _)| name).unwrap_or(id)
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(MAIN_LABEL)
        .ok_or_else(|| "The operator window is not available".to_string())
}

fn describe_displays(main: &WebviewWindow) -> Result<Vec<(Monitor, DisplayInfo)>, String> {
    let monitors = main.available_monitors().map_err(|error| error.to_string())?;
    let primary_id = main.primary_monitor().ok().flatten().map(|m| monitor_id(&m));
    let operator_id = main.current_monitor().ok().flatten().map(|m| monitor_id(&m));

    Ok(monitors
        .into_iter()
        .map(|monitor| {
            let id = monitor_id(&monitor);
            let info = DisplayInfo {
                name: monitor_name(&monitor),
                width: monitor.size().width,
                height: monitor.size().height,
                x: monitor.position().x,
                y: monitor.position().y,
                scale_factor: monitor.scale_factor(),
                is_primary: primary_id.as_deref() == Some(id.as_str()),
                is_operator_display: operator_id.as_deref() == Some(id.as_str()),
                id,
            };
            (monitor, info)
        })
        .collect())
}

/// Exact id first. If the display came back at different coordinates, accept a
/// unique name match, but never the operator's own screen: with two identical
/// monitors, a name match after unplugging the projector would otherwise put
/// the congregation output on top of the operator app.
fn resolve_display(
    displays: Vec<(Monitor, DisplayInfo)>,
    display_id: &str,
) -> Option<(Monitor, DisplayInfo)> {
    if let Some(index) = displays.iter().position(|(_, info)| info.id == display_id) {
        return displays.into_iter().nth(index);
    }
    let wanted = name_from_id(display_id);
    let mut matches: Vec<_> = displays
        .into_iter()
        .filter(|(_, info)| info.name == wanted && !info.is_operator_display)
        .collect();
    if matches.len() == 1 {
        matches.pop()
    } else {
        None
    }
}

#[tauri::command]
pub fn list_displays(app: AppHandle) -> Result<Vec<DisplayInfo>, String> {
    let main = main_window(&app)?;
    Ok(describe_displays(&main)?
        .into_iter()
        .map(|(_, info)| info)
        .collect())
}

fn build_projector_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let window = WebviewWindowBuilder::new(app, PROJECTOR_LABEL, WebviewUrl::App("index.html".into()))
        .title("SermonSync Output")
        .visible(false)
        .focused(false)
        .decorations(false)
        .skip_taskbar(true)
        .resizable(true)
        .background_color(Color(0, 0, 0, 255))
        .inner_size(TEST_WINDOW_WIDTH, TEST_WINDOW_HEIGHT)
        .build()
        .map_err(|error| format!("Could not create the projector window: {error}"))?;

    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let _ = handle.emit_to(MAIN_LABEL, PROJECTOR_CLOSED_EVENT, ());
        }
    });
    Ok(window)
}

/// Leaving native fullscreen is animated on macOS; moving the window before
/// the animation settles leaves it on the old display.
async fn leave_fullscreen(window: &WebviewWindow) -> Result<(), String> {
    if window.is_fullscreen().unwrap_or(false) {
        window.set_fullscreen(false).map_err(|error| error.to_string())?;
        let settle = if cfg!(target_os = "macos") { 700 } else { 150 };
        tokio::time::sleep(Duration::from_millis(settle)).await;
    }
    Ok(())
}

/// Must stay async: creating a window from a synchronous command runs on the
/// main thread and deadlocks on Windows.
#[tauri::command]
pub async fn open_projector_window(
    app: AppHandle,
    display_id: Option<String>,
    windowed: bool,
) -> Result<ProjectorWindowState, String> {
    let main = main_window(&app)?;
    let displays = describe_displays(&main)?;

    let target = match display_id.as_deref() {
        Some(id) => resolve_display(displays, id),
        None => None,
    };
    if !windowed && target.is_none() {
        return Err(match display_id {
            Some(_) => "The selected display is not connected".to_string(),
            None => "Choose a display for the congregation output".to_string(),
        });
    }

    let existing = app.get_webview_window(PROJECTOR_LABEL);
    let fail = |error: tauri::Error| error.to_string();

    // Already full screen on the right display (operator window reloaded, or
    // the same display re-selected): touching it would flash the congregation.
    if let (Some(window), Some((_, info)), false) = (existing.as_ref(), target.as_ref(), windowed) {
        let on_target = window
            .current_monitor()
            .ok()
            .flatten()
            .map(|monitor| monitor_id(&monitor) == info.id)
            .unwrap_or(false);
        if on_target && window.is_fullscreen().unwrap_or(false) {
            window.show().map_err(fail)?;
            let _ = main.set_focus();
            return Ok(ProjectorWindowState {
                open: true,
                windowed: false,
                display: target.map(|(_, info)| info),
            });
        }
    }

    let window = match existing {
        Some(window) => window,
        None => build_projector_window(&app)?,
    };

    leave_fullscreen(&window).await?;

    if windowed {
        window.set_decorations(true).map_err(fail)?;
        window.set_skip_taskbar(false).map_err(fail)?;
        window.set_resizable(true).map_err(fail)?;

        let operator = main
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| main.primary_monitor().ok().flatten());
        if let Some(monitor) = operator {
            let scale = monitor.scale_factor();
            let width = (TEST_WINDOW_WIDTH * scale).round() as u32;
            let height = (TEST_WINDOW_HEIGHT * scale).round() as u32;
            let x = monitor.position().x + (monitor.size().width.saturating_sub(width) / 2) as i32;
            let y = monitor.position().y + (monitor.size().height.saturating_sub(height) / 2) as i32;
            window.set_size(PhysicalSize::new(width, height)).map_err(fail)?;
            window.set_position(PhysicalPosition::new(x, y)).map_err(fail)?;
        } else {
            window.center().map_err(fail)?;
        }
        window.show().map_err(fail)?;
    } else if let Some((monitor, _)) = target.as_ref() {
        window.set_decorations(false).map_err(fail)?;
        window.set_skip_taskbar(true).map_err(fail)?;
        window.set_position(*monitor.position()).map_err(fail)?;
        window.set_size(*monitor.size()).map_err(fail)?;
        window.show().map_err(fail)?;
        window.set_fullscreen(true).map_err(fail)?;
    }

    // Keep keyboard focus on the operator app so live shortcuts keep working.
    let _ = main.set_focus();

    Ok(ProjectorWindowState {
        open: true,
        windowed,
        display: target.map(|(_, info)| info),
    })
}

#[tauri::command]
pub fn close_projector_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(PROJECTOR_LABEL) {
        window.destroy().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::name_from_id;

    #[test]
    fn name_from_id_strips_position() {
        assert_eq!(name_from_id("DELL U2720Q@1920,0"), "DELL U2720Q");
        assert_eq!(name_from_id("Room@TV@-1920,0"), "Room@TV");
        assert_eq!(name_from_id("no-position"), "no-position");
    }
}
