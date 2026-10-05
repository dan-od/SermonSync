fn main() {
    // Release packaging fills this directory with the pinned media engine.
    // Dev builds use FFmpeg from PATH, but Tauri still resolves bundle resources.
    std::fs::create_dir_all("resources/media-engine")
        .expect("could not create the media-engine resource directory");
    tauri_build::build()
}
