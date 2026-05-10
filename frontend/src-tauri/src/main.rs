// // Prevents additional console window on Windows in release, DO NOT REMOVE!!
// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// use tauri::Manager;
// use tauri_plugin_shell::ShellExt;
// use tauri_plugin_shell::process::CommandEvent;
// use std::time::Duration;
// use std::path::PathBuf;

// #[cfg(target_os = "windows")]
// use std::os::windows::process::CommandExt;

// #[derive(Clone, serde::Serialize)]
// struct Payload {
//   message: String,
// }

// // Tauri commands for backup/restore operations
// #[tauri::command]
// async fn save_backup_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
//   use tauri_plugin_dialog::{DialogExt, FilePath};

//   let file_path = app.dialog()
//     .file()
//     .add_filter("ZIP Archive", &["zip"])
//     .set_file_name(&format!("pos_backup_{}.zip", chrono::Local::now().format("%Y%m%d_%H%M%S")))
//     .blocking_save_file();

//   match file_path {
//     Some(FilePath::Path(path)) => Ok(Some(path.to_string_lossy().to_string())),
//     Some(FilePath::Url(_)) => Err("URL paths not supported".to_string()),
//     None => Ok(None),
//   }
// }

// #[tauri::command]
// async fn open_backup_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
//   use tauri_plugin_dialog::{DialogExt, FilePath};

//   let file_path = app.dialog()
//     .file()
//     .add_filter("ZIP Archive", &["zip"])
//     .blocking_pick_file();

//   match file_path {
//     Some(FilePath::Path(path)) => Ok(Some(path.to_string_lossy().to_string())),
//     Some(FilePath::Url(_)) => Err("URL paths not supported".to_string()),
//     None => Ok(None),
//   }
// }

// #[cfg(target_os = "windows")]
// fn pick_existing(candidates: &[PathBuf]) -> Option<PathBuf> {
//   for p in candidates {
//     if p.exists() {
//       return Some(p.clone());
//     }
//   }
//   None
// }

// fn main() {
//   tauri::Builder::default()
//     .plugin(tauri_plugin_shell::init())
//     .plugin(tauri_plugin_dialog::init())
//     .plugin(tauri_plugin_http::init())
//     .invoke_handler(tauri::generate_handler![save_backup_dialog, open_backup_dialog])
//     .setup(|app| {
//       let window = app.get_webview_window("main").unwrap();

//       // Only spawn sidecar in production (when not in debug mode)
//       #[cfg(not(debug_assertions))]
//       {
//         // Find a free port
//         let port = {
//           let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
//           listener.local_addr().unwrap().port()
//         };

//         println!("Selected port for Next.js server: {}", port);

//         // Resolve path to the standalone server script in resources
//         // Note: Tauri bundles ".." resources into "_up_" directory
//         let resource_path = app.path().resource_dir()
//           .expect("Failed to get resource dir")
//           .join("_up_/.next/standalone/server.js");

//         let script_path = resource_path.to_string_lossy().to_string();
//         println!("Server script path: {}", script_path);

//         let sidecar_command = app.shell().sidecar("next-server").unwrap()
//           .args([script_path])
//           .env("PORT", port.to_string())
//           .env("HOSTNAME", "127.0.0.1");

//         let (mut rx, _child) = sidecar_command.spawn().expect("Failed to spawn sidecar");

//         // Log Next.js sidecar output
//         tauri::async_runtime::spawn(async move {
//           while let Some(event) = rx.recv().await {
//             if let CommandEvent::Stdout(line) = &event {
//               println!("NEXT SERVER: {}", String::from_utf8_lossy(line));
//             } else if let CommandEvent::Stderr(line) = &event {
//               println!("NEXT SERVER ERROR: {}", String::from_utf8_lossy(line));
//             }
//           }
//         });

//         // Launch Backend

//         #[cfg(target_os = "macos")]
//         {
//           let current_exe = std::env::current_exe().unwrap();
//           let bin_dir = current_exe.parent().unwrap();

//           let backend_name = if cfg!(debug_assertions) {
//             "backend-server-aarch64-apple-darwin"
//           } else {
//             "backend-server"
//           };

//           let backend_path = bin_dir.join(backend_name);

//           println!("Launching backend from: {:?}", backend_path);

//           std::process::Command::new("open")
//             .arg("-a")
//             .arg("Terminal")
//             .arg(backend_path)
//             .spawn()
//             .expect("Failed to launch backend terminal");
//         }

//         #[cfg(target_os = "windows")]
//         {
//           const CREATE_NEW_CONSOLE: u32 = 0x00000010;

//           let current_exe = std::env::current_exe().unwrap();
//           let exe_dir = current_exe.parent().unwrap().to_path_buf();

//           // your dev path fallback (you provided)
//           let dev_backend = PathBuf::from(r"C:\Users\anwaa\POS\frontend\src-tauri\bin\backend-server.exe");

//           // if you rename correctly for externalBin bundling, this is what Tauri expects in src-tauri/bin:
//           // backend-server-x86_64-pc-windows-msvc.exe
//           // but in the installed app it may be beside the main exe or in resources; so we try multiple places.
//           let triple_guess = "x86_64-pc-windows-msvc";
//           let triple_name = format!("backend-server-{}.exe", triple_guess);

//           let res_dir = app.path().resource_dir().ok();

//           let mut candidates: Vec<PathBuf> = vec![
//             exe_dir.join("backend-server.exe"),
//             exe_dir.join(&triple_name),
//           ];

//           if let Some(rd) = &res_dir {
//             candidates.push(rd.join("backend-server.exe"));
//             candidates.push(rd.join(&triple_name));
//             candidates.push(rd.join("bin").join("backend-server.exe"));
//             candidates.push(rd.join("bin").join(&triple_name));
//           }

//           candidates.push(dev_backend.clone());

//           let backend_path = pick_existing(&candidates).unwrap_or(dev_backend);

//           println!("Launching backend from: {:?}", backend_path);

//           // Set working dir to bundled bin/ (because your resources include bin/.env + bin/data/**/*)
//           // If it doesn't exist, fallback to exe_dir
//           let workdir = res_dir
//             .map(|rd| rd.join("bin"))
//             .filter(|p| p.exists())
//             .unwrap_or(exe_dir);

//           println!("Backend working dir: {:?}", workdir);

//           if backend_path.exists() {
//             std::process::Command::new(&backend_path)
//               .current_dir(workdir)
//               .creation_flags(CREATE_NEW_CONSOLE)
//               .spawn()
//               .expect("Failed to launch backend in new console");
//           } else {
//             eprintln!("Backend exe not found at: {:?}", backend_path);
//           }
//         }

//         #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
//         {
//           let _ = app.shell().sidecar("backend-server").unwrap().spawn();
//         }

//         // Navigate after a short delay
//         let window_clone = window.clone();
//         tauri::async_runtime::spawn(async move {
//           tokio::time::sleep(Duration::from_secs(3)).await;
//           let url = format!("http://localhost:{}", port);
//           println!("Navigating to {}", url);
//           window_clone.eval(&format!("window.location.replace('{}')", url)).unwrap();
//         });
//       }

//       Ok(())
//     })
//     .run(tauri::generate_context!())
//     .expect("error while running tauri application");
// }
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// --------------------- dialogs ---------------------

#[tauri::command]
async fn save_backup_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};

    let file_path = app
        .dialog()
        .file()
        .add_filter("ZIP Archive", &["zip"])
        .set_file_name(&format!(
            "pos_backup_{}.zip",
            chrono::Local::now().format("%Y%m%d_%H%M%S")
        ))
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

    let file_path = app
        .dialog()
        .file()
        .add_filter("ZIP Archive", &["zip"])
        .blocking_pick_file();

    match file_path {
        Some(FilePath::Path(path)) => Ok(Some(path.to_string_lossy().to_string())),
        Some(FilePath::Url(_)) => Err("URL paths not supported".to_string()),
        None => Ok(None),
    }
}

// --------------------- backend discovery ---------------------

fn get_local_ip() -> Option<String> {
    use std::net::UdpSocket;
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip().to_string())
}

#[tauri::command]
async fn discover_backend(port: u16) -> Result<Option<String>, String> {
    use tokio::net::TcpStream;
    use tokio::time::timeout;

    let local_ip = get_local_ip().ok_or("Could not determine local IP")?;
    let parts: Vec<&str> = local_ip.split('.').collect();
    if parts.len() != 4 {
        return Err("Invalid local IP format".to_string());
    }
    let prefix = format!("{}.{}.{}", parts[0], parts[1], parts[2]);

    let mut set = tokio::task::JoinSet::new();
    for i in 1u8..=254 {
        let ip = format!("{}.{}", prefix, i);
        set.spawn(async move {
            let addr = format!("{}:{}", ip, port);
            match timeout(Duration::from_millis(500), TcpStream::connect(&addr)).await {
                Ok(Ok(_)) => Some(ip),
                _ => None,
            }
        });
    }

    while let Some(res) = set.join_next().await {
        if let Ok(Some(ip)) = res {
            set.abort_all();
            return Ok(Some(ip));
        }
    }

    Ok(None)
}

// --------------------- helpers ---------------------

fn log_path_fallback(_app: &tauri::App) -> PathBuf {
    // best effort: LOCALAPPDATA\com.pos.desktop\startup.log
    let base = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    base.join("com.pos.desktop").join("startup.log")
}

fn append_log(log_path: &PathBuf, msg: &str) {
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let line = format!("{}\r\n", msg);
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
}

fn find_next_standalone_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let res = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir error: {e}"))?;

    // The standalone build often mirrors the full path: .next/standalone/POS/frontend/server.js
    // We try multiple candidates.
    let candidates = [
        res.join("_up_").join(".next").join("standalone").join("POS").join("frontend"),
        res.join(".next").join("standalone").join("POS").join("frontend"),
        res.join("_up_").join(".next").join("standalone"),
        res.join(".next").join("standalone"),
    ];

    for d in &candidates {
        if d.join("server.js").exists() {
            return Ok(d.clone());
        }
    }

    Err(format!(
        "Next standalone not found. Looked in resource_dir: {}\nChecked candidates:\n- {}\n- {}\n- {}\n- {}",
        res.display(),
        candidates[0].display(),
        candidates[1].display(),
        candidates[2].display(),
        candidates[3].display(),
    ))
}

fn pick_existing(cands: &[PathBuf]) -> Option<PathBuf> {
    for p in cands {
        if p.exists() {
            return Some(p.clone());
        }
    }
    None
}

async fn wait_for_port_127(port: u16, timeout: Duration, log_path: PathBuf) -> bool {
    let start = Instant::now();
    let mut last_log = Instant::now();
    
    // log initial attempt
    append_log(&log_path, &format!("next: waiting for port {}...", port));

    while start.elapsed() < timeout {
        match TcpStream::connect(("127.0.0.1", port)) {
            Ok(_) => {
                append_log(&log_path, &format!("next: port {} is open!", port));
                return true;
            }
            Err(e) => {
                // Log only every 2 seconds to avoid spam
                if last_log.elapsed().as_secs() >= 2 {
                    append_log(&log_path, &format!("next: port check failed: {}", e));
                    last_log = Instant::now();
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    
    append_log(&log_path, &format!("next: timed out waiting for port {}", port));
    false
}

#[cfg(target_os = "windows")]
#[cfg(target_os = "windows")]
fn start_backend_visible(app: &tauri::AppHandle, log_path: &PathBuf) {
    // When running as a portable exe (or strict release), the exe dir is often where we start looking.
    let exe_dir = match std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())) {
        Some(d) => d,
        None => {
            append_log(log_path, "backend: failed to resolve current exe dir");
            return;
        }
    };

    let res_dir = app.path().resource_dir().ok();

    // backend exe candidates
    // 1. In the same folder as the main exe (common for portable)
    // 2. In resources (common for installer-based)
    // 3. In resources/bin
    let mut candidates: Vec<PathBuf> = vec![
        exe_dir.join("backend-server.exe"),
        exe_dir.join("backend-server-x86_64-pc-windows-msvc.exe"),
    ];

    if let Some(rd) = &res_dir {
        candidates.push(rd.join("backend-server.exe"));
        candidates.push(rd.join("backend-server-x86_64-pc-windows-msvc.exe"));
        candidates.push(rd.join("bin").join("backend-server.exe"));
        candidates.push(rd.join("bin").join("backend-server-x86_64-pc-windows-msvc.exe"));
    }

    // Dev fallback
    candidates.push(PathBuf::from(r"C:\Users\anwaa\POS\frontend\src-tauri\bin\backend-server.exe"));
    candidates.push(PathBuf::from(r"C:\Users\anwaa\POS\frontend\src-tauri\bin\backend-server-x86_64-pc-windows-msvc.exe"));

    let backend_exe = match pick_existing(&candidates) {
        Some(p) => p,
        None => {
            append_log(log_path, "backend: backend exe not found in candidates");
            return;
        }
    };

    // Working dir logic:
    // Ideally we want the folder that contains 'bin/data' or similar if that's how your backend works.
    let mut workdir = exe_dir.clone();
    
    // Check near the found backend exe
    if let Some(parent) = backend_exe.parent() {
         if parent.join("data").exists() {
             workdir = parent.to_path_buf();
         } else if parent.join("bin").join("data").exists() {
             workdir = parent.join("bin");
         } else if parent.join(".env").exists() {
             workdir = parent.to_path_buf();
         }
    }
    
    // Check resources dir
    if let Some(rd) = &res_dir {
        if rd.join("bin").exists() {
            workdir = rd.join("bin");
        }
    }

    append_log(
        log_path,
        &format!(
            "backend: start => exe={} workdir={}",
            backend_exe.display(),
            workdir.display()
        ),
    );

    // Launch using native CreateProcess with CREATE_NEW_CONSOLE to ensure visibility
    // This avoids 'cmd start' quoting issues.
    #[cfg(target_os = "windows")]
    const CREATE_NEW_CONSOLE: u32 = 0x00000010;

    // Use native spawning
    let spawned = std::process::Command::new(&backend_exe)
        .current_dir(&workdir)
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn();

    if let Err(e) = spawned {
        append_log(log_path, &format!("backend: spawn failed: {e}"));
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![save_backup_dialog, open_backup_dialog, discover_backend])
        .setup(|app| {
            // create log file path early (best-effort)
            let log_path = log_path_fallback(app);
            append_log(&log_path, "=== APP START ===");

            let window = match app.get_webview_window("main") {
                Some(w) => w,
                None => {
                    append_log(&log_path, "setup: main window not found (app will still continue)");
                    return Ok(());
                }
            };

            // IMPORTANT: Never return Err here, otherwise app closes instantly.
            #[cfg(not(debug_assertions))]
            {
                append_log(&log_path, "mode: release");

                // 1) Start backend FIRST (so it starts even if Next fails)
                #[cfg(target_os = "windows")]
                start_backend_visible(&app.handle(), &log_path);

                // 2) Next server
                let port: u16 = match std::net::TcpListener::bind("127.0.0.1:0")
                    .and_then(|l| l.local_addr())
                    .map(|a| a.port())
                {
                    Ok(p) => p,
                    Err(e) => {
                        append_log(&log_path, &format!("next: failed to pick free port: {e}"));
                        let _ = window.eval("document.body.innerHTML='<h3>Failed to pick a port</h3>';"); 
                        return Ok(());
                    }
                };

                append_log(&log_path, &format!("next: chosen port={port}"));

                let standalone_dir = match find_next_standalone_dir(&app.handle()) {
                    Ok(d) => d,
                    Err(e) => {
                        append_log(&log_path, &format!("next: {e}"));
                        let _ = window.eval("document.body.innerHTML='<h3>Next resources not found</h3><p>Check startup.log</p>';"); 
                        return Ok(());
                    }
                };

                append_log(
                    &log_path,
                    &format!("next: standalone_dir={}", standalone_dir.display()),
                );

                let cmd = app
                    .shell()
                    .sidecar("next-server")
                    .map_err(|e| {
                        append_log(&log_path, &format!("next: sidecar resolve failed: {e}"));
                        e
                    });

                let cmd = match cmd {
                    Ok(c) => c,
                    Err(_) => {
                        let _ = window.eval("document.body.innerHTML='<h3>next-server sidecar missing</h3><p>Check startup.log</p>';"); 
                        return Ok(());
                    }
                };

                let (mut rx, _child) = match cmd
                    .current_dir(&standalone_dir) // CRITICAL
                    .args(["server.js"])
                    .env("PORT", port.to_string())
                    .env("HOSTNAME", "127.0.0.1")
                    .env("NODE_ENV", "production")
                    .env("NEXT_TELEMETRY_DISABLED", "1")
                    .spawn()
                {
                    Ok(v) => v,
                    Err(e) => {
                        append_log(&log_path, &format!("next: spawn failed: {e}"));
                        let _ = window.eval("document.body.innerHTML='<h3>Next failed to start</h3><p>Check startup.log</p>';"); 
                        return Ok(());
                    }
                };

                // log Next stdout/stderr + termination
                let log_path_clone = log_path.clone();
                tauri::async_runtime::spawn(async move {
                    append_log(&log_path_clone, "next: process spawned");
                    while let Some(ev) = rx.recv().await {
                        match ev {
                            CommandEvent::Stdout(b) => {
                                append_log(&log_path_clone, &format!("NEXT_STDOUT: {}", String::from_utf8_lossy(&b)));
                            }
                            CommandEvent::Stderr(b) => {
                                append_log(&log_path_clone, &format!("NEXT_STDERR: {}", String::from_utf8_lossy(&b)));
                            }
                            CommandEvent::Terminated(p) => {
                                append_log(&log_path_clone, &format!("NEXT_EXIT: code={:?}", p.code));
                            }
                            CommandEvent::Error(e) => {
                                append_log(&log_path_clone, &format!("NEXT_EVENT_ERROR: {e}"));
                            }
                            _ => {}
                        }
                    }
                    append_log(&log_path_clone, "next: rx ended");
                });

                // 3) Navigate only when port is alive (and use 127.0.0.1, not localhost)
                let window_clone = window.clone();
                let log_path_clone = log_path.clone(); // Clone for the closure
                
                tauri::async_runtime::spawn(async move {
                    // Pass log_path_clone to the updated function
                    let ok = wait_for_port_127(port, Duration::from_secs(45), log_path_clone).await;
                    if ok {
                        let url = format!("http://127.0.0.1:{port}");
                        let _ = window_clone.eval(&format!("window.location.replace('{url}')"));
                    } else {
                        let _ = window_clone.eval(
                            "document.body.innerHTML='<h2>Next server did not come up</h2><p>Open startup.log</p>';"
                        );
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
