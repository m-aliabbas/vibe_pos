// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use std::time::Duration;

#[derive(Clone, serde::Serialize)]
struct Payload {
    message: String,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            // Only spawn sidecar in production (when not in debug mode)
            #[cfg(not(debug_assertions))]
            {
                // Find a free port
                // For simplicity, we'll try a fixed range or let OS pick (but we need to know it)
                // Let's use port 0 trick to find a free port
                let port = {
                    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
                    listener.local_addr().unwrap().port()
                };

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
                    .env("HOSTNAME", "127.0.0.1");

                let (mut rx, _child) = sidecar_command.spawn().expect("Failed to spawn sidecar");

                // Spawn a thread to log sidecar output
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        if let CommandEvent::Stdout(line) = &event {
                            println!("SERVER: {}", String::from_utf8_lossy(line));
                        } else if let CommandEvent::Stderr(line) = &event {
                            println!("SERVER ERROR: {}", String::from_utf8_lossy(line));
                        }
                    }
                });

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
