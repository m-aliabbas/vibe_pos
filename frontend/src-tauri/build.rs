fn main() {
    println!("cargo:rerun-if-env-changed=VIBE_APPLICATION_ID");
    tauri_build::build()
}
