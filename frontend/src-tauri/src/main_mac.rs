// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use std::time::Duration;
use std::path::PathBuf;

const APPLICATION_ID: &str = match option_env!("VIBE_APPLICATION_ID") {
    Some(application_id) => application_id,
    None => "retail",
};

#[derive(Clone, serde::Serialize)]
struct Payload {
    message: String,
}

// Tauri commands for backup/restore operations
#[tauri::command]
async fn save_backup_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    
    let file_path = app.dialog()
        .file()
        .add_filter("VibePOS Database Backup", &["db", "dump", "sql", "zip"])
        .set_file_name(&format!("pos_backup_{}.db", chrono::Local::now().format("%Y%m%d_%H%M%S")))
        .blocking_save_file();
    
    match file_path {
        Some(FilePath::Path(path)) => Ok(Some(path.to_string_lossy().to_string())),
        Some(FilePath::Url(_)) => Err("URL paths not supported".to_string()),
        None => Ok(None),
    }
}

#[tauri::command]
async fn open_backup_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    
    let file_path = app.dialog()
        .file()
        .add_filter("VibePOS Database Backup", &["db", "dump", "sql", "zip"])
        .blocking_pick_file();
    
    match file_path {
        Some(FilePath::Path(path)) => Ok(Some(path.to_string_lossy().to_string())),
        Some(FilePath::Url(_)) => Err("URL paths not supported".to_string()),
        None => Ok(None),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![save_backup_dialog, open_backup_dialog])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            // Only spawn sidecar in production (when not in debug mode)
            #[cfg(not(debug_assertions))]
            {
                // The LAN clients need a stable, documented port.
                let port: u16 = 4321;

                println!("Selected port for Next.js server: {}", port);

                // Resolve path to the standalone server script in resources
                // Note: Tauri bundles ".." resources into "_up_" directory
                let resource_path = app.path().resource_dir()
                    .expect("Failed to get resource dir")
                    .join("_up_/.next/standalone/server.js");
                
                let script_path = resource_path.to_string_lossy().to_string();
                println!("Server script path: {}", script_path);

                let sidecar_command = app.shell().sidecar("next-server").unwrap()
                    .args([script_path])
                    .env("PORT", port.to_string())
                    .env("HOSTNAME", "0.0.0.0")
                    .env("BACKEND_PORT", "8000");

                let (mut rx, _child) = sidecar_command.spawn().expect("Failed to spawn sidecar");

                // Spawn a thread to log Next.js sidecar output
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        if let CommandEvent::Stdout(line) = &event {
                            println!("NEXT SERVER: {}", String::from_utf8_lossy(line));
                        } else if let CommandEvent::Stderr(line) = &event {
                            println!("NEXT SERVER ERROR: {}", String::from_utf8_lossy(line));
                        }
                    }
                });

                // Launch the app-specific backend sidecar with its isolated data root.
                #[cfg(target_os = "macos")]
                {
                    let backend_command = app.shell().sidecar("backend-server").unwrap()
                        .env("APPLICATION_ID", APPLICATION_ID)
                        .env("DATA_DIR", "data")
                        .env("AP_HOST", "0.0.0.0")
                        .env("AP_PORT", "8000");
                    let (mut backend_events, _backend_child) = backend_command.spawn()
                        .expect("Failed to launch backend sidecar");
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = backend_events.recv().await {
                            match event {
                                CommandEvent::Stdout(line) => println!("BACKEND: {}", String::from_utf8_lossy(&line)),
                                CommandEvent::Stderr(line) => println!("BACKEND ERROR: {}", String::from_utf8_lossy(&line)),
                                _ => {}
                            }
                        }
                    });
                }
                 #[cfg(not(target_os = "macos"))]
                {
                   // Fallback for non-macOS (e.g. standard sidecar) or Windows (cmd /c start ...)
                   // For now, focusing on the macOS requirement.
                   let _ = app.shell().sidecar("backend-server").unwrap()
                       .env("APPLICATION_ID", APPLICATION_ID)
                       .env("DATA_DIR", "data")
                       .env("AP_HOST", "0.0.0.0")
                       .env("AP_PORT", "8000")
                       .spawn();
                }

                // Perform navigation in a separate thread to not block main thread
                let window_clone = window.clone();
                tauri::async_runtime::spawn(async move {
                    // Wait for server to start - crude check, better to poll the port
                    // Read stdout to see when "Ready"
                    
                    // Give it a few seconds to start
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    
                    let url = format!("http://localhost:{}", port);
                    println!("Navigating to {}", url);
                    
                    // Navigate
                    window_clone.eval(&format!("window.location.replace('{}')", url)).unwrap();
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
