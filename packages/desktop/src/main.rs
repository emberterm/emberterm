#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod fonts;
mod fsutil;
mod git;
mod ipc;
mod preview_path;
mod profile;
mod session_store;
mod state;
mod terminal;
mod watcher;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("emberterm=debug")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        // Size, position and maximized state only: visibility is ours to manage.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .manage(state::AppState::new())
        .setup(|app| {
            if let Err(e) = watcher::setup(app) {
                tracing::warn!("file watcher setup failed: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::session_create,
            ipc::session_write,
            ipc::session_resize,
            ipc::session_close,
            ipc::session_busy,
            ipc::session_ack,
            fonts::font_list,
            ipc::startup_warnings,
            ipc::session_load,
            ipc::session_save,
            ipc::config_get,
            ipc::config_update,
            ipc::profile_list,
            ipc::profile_upsert,
            ipc::profile_delete,
            ipc::git_status,
            ipc::config_is_first_run,
            ipc::detect_builtin_profiles,
        ])
        .run(tauri::generate_context!())
        .expect("error while running EmberTerm");
}
