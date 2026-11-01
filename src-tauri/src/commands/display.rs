use display_info::DisplayInfo;
use serde::Serialize;
use tauri::Manager;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDisplayInfo {
    native_id: u32,
    name: String,
    friendly_name: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    logical_x: i32,
    logical_y: i32,
    logical_width: u32,
    logical_height: u32,
    scale_factor: f32,
    refresh_hz: Option<u32>,
    is_primary: bool,
}

/// Returns platform-native display metadata, including the active refresh rate.
/// Tauri's JavaScript monitor API intentionally omits refresh frequency.
#[tauri::command]
pub fn list_display_info() -> Result<Vec<NativeDisplayInfo>, String> {
    DisplayInfo::all()
        .map(|displays| {
            displays
                .into_iter()
                .map(|display| NativeDisplayInfo {
                    native_id: display.id,
                    name: display.name,
                    friendly_name: display.friendly_name,
                    // display-info reports logical bounds on Linux. Expose
                    // physical bounds for the selector while retaining the
                    // logical bounds used by GTK monitor matching.
                    x: if cfg!(target_os = "linux") {
                        (display.x as f32 * display.scale_factor.max(1.0)).round() as i32
                    } else {
                        display.x
                    },
                    y: if cfg!(target_os = "linux") {
                        (display.y as f32 * display.scale_factor.max(1.0)).round() as i32
                    } else {
                        display.y
                    },
                    width: if cfg!(target_os = "linux") {
                        (display.width as f32 * display.scale_factor.max(1.0)).round() as u32
                    } else {
                        display.width
                    },
                    height: if cfg!(target_os = "linux") {
                        (display.height as f32 * display.scale_factor.max(1.0)).round() as u32
                    } else {
                        display.height
                    },
                    logical_x: display.x,
                    logical_y: display.y,
                    logical_width: display.width,
                    logical_height: display.height,
                    scale_factor: display.scale_factor,
                    refresh_hz: (display.frequency > 0.0)
                        .then_some(display.frequency.round() as u32),
                    is_primary: display.is_primary,
                })
                .collect()
        })
        .map_err(|error| format!("failed to enumerate display modes: {error}"))
}

/// Place the projector window on the requested monitor.
///
/// On Linux/Wayland, a client cannot reliably place a top-level window with
/// x/y coordinates. GTK's monitor-targeted fullscreen request is the native
/// compositor-supported way to select the output. Other platforms retain the
/// normal Tauri position/size path in the frontend.
#[tauri::command]
pub fn place_projector_window(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
    native_x: Option<i32>,
    native_y: Option<i32>,
    native_width: Option<u32>,
    native_height: Option<u32>,
) -> Result<bool, String> {
    let window = app
        .get_webview_window("projector-output")
        .ok_or_else(|| "projector output window is not available".to_string())?;

    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::*;

        let gtk_window = window
            .gtk_window()
            .map_err(|error| format!("failed to access projector GTK window: {error}"))?;
        let screen = gtk::prelude::GtkWindowExt::screen(&gtk_window)
            .ok_or_else(|| "projector GTK window has no display screen".to_string())?;
        let display = screen.display();

        let scale = scale_factor.max(1.0);
        let mut requested = vec![
            (x, y, width as i32, height as i32),
            (
                (x as f64 / scale).round() as i32,
                (y as f64 / scale).round() as i32,
                (width as f64 / scale).round() as i32,
                (height as f64 / scale).round() as i32,
            ),
        ];
        if let (Some(native_x), Some(native_y), Some(native_width), Some(native_height)) =
            (native_x, native_y, native_width, native_height)
        {
            requested.insert(0, (native_x, native_y, native_width as i32, native_height as i32));
        }

        let mut best_monitor = None;
        let mut best_score = i64::MAX;
        for monitor_index in 0..display.n_monitors() {
            let Some(monitor) = display.monitor(monitor_index) else {
                continue;
            };
            let geometry = monitor.geometry();
            let score = requested
                .iter()
                .map(|(target_x, target_y, target_width, target_height)| {
                    i64::from((geometry.x() - target_x).abs())
                        + i64::from((geometry.y() - target_y).abs())
                        + i64::from((geometry.width() - target_width).abs())
                        + i64::from((geometry.height() - target_height).abs())
                })
                .min()
                .unwrap_or(i64::MAX);
            if score < best_score {
                best_score = score;
                best_monitor = Some(monitor_index);
            }
        }

        if let Some(monitor_index) = best_monitor {
            // Map the window before requesting fullscreen. This prevents
            // XWayland/GTK from applying the request to the compositor's
            // current monitor when the window was created hidden.
            gtk::prelude::WidgetExt::show(&gtk_window);
            gtk_window.fullscreen_on_monitor(&screen, monitor_index);
            gtk_window.present();
            return Ok(true);
        }

        return Err("could not match projector output to a connected GTK monitor".to_string());
    }

    #[cfg(not(target_os = "linux"))]
    {
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|error| format!("failed to position projector output: {error}"))?;
    window
        .set_size(tauri::PhysicalSize::new(width, height))
        .map_err(|error| format!("failed to size projector output: {error}"))?;
    Ok(false)
    }
}
