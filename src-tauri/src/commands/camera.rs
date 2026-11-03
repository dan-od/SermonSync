/// WebKitGTK denies `getUserMedia`/`enumerateDevices` by default, so wired/USB
/// cameras (including v4l2loopback devices like the DroidCam/OBS virtual cam)
/// never show up in the frontend's camera picker unless the embedding app
/// explicitly enables media capture and auto-grants the permission request.
pub(crate) fn allow_camera_permission<R: tauri::Runtime>(webview: &tauri::Webview<R>) {
    use glib::object::Cast;
    use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};

    let _ = webview.with_webview(|webview| {
        let webview = webview.inner();
        if let Some(settings) = WebViewExt::settings(&webview) {
            settings.set_enable_media_stream(true);
            settings.set_enable_mediasource(true);
        }
        webview.connect_permission_request(|_webview, request| {
            if let Some(media_request) = request.downcast_ref::<webkit2gtk::UserMediaPermissionRequest>() {
                media_request.allow();
                true
            } else {
                false
            }
        });
    });
}
