use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::io::AsyncWriteExt;

const ALLOWED_DOWNLOAD_HOSTS: &[&str] = &[
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];

fn validate_download_url(url: &reqwest::Url) -> Result<(), String> {
    if url.scheme() != "https"
        || !url
            .host_str()
            .is_some_and(|host| ALLOWED_DOWNLOAD_HOSTS.contains(&host))
    {
        return Err("The update download is not hosted by the official GitHub release service."
            .to_string());
    }
    Ok(())
}

fn validate_file_name(file_name: &str) -> Result<String, String> {
    let path = Path::new(file_name);
    if path.file_name().and_then(|value| value.to_str()) != Some(file_name) {
        return Err("The update has an invalid installer name.".to_string());
    }

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "exe" | "msi" | "dmg" | "pkg") {
        return Err("The update does not contain a supported installer.".to_string());
    }
    Ok(extension)
}

fn partial_path(destination: &Path) -> PathBuf {
    let mut partial = destination.as_os_str().to_os_string();
    partial.push(".download");
    PathBuf::from(partial)
}

#[tauri::command]
pub async fn download_update(
    app: tauri::AppHandle,
    url: String,
    expected_sha256: String,
    file_name: String,
) -> Result<Option<String>, String> {
    let parsed_url = reqwest::Url::parse(&url)
        .map_err(|_| "The update has an invalid download address.".to_string())?;
    validate_download_url(&parsed_url)?;

    let expected_sha256 = expected_sha256.to_ascii_lowercase();
    if expected_sha256.len() != 64
        || !expected_sha256.chars().all(|character| character.is_ascii_hexdigit())
    {
        return Err("The update has an invalid checksum.".to_string());
    }

    let extension = validate_file_name(&file_name)?;
    let destination = app
        .dialog()
        .file()
        .add_filter("VibePOS Installer", &[extension.as_str()])
        .set_file_name(&file_name)
        .blocking_save_file();
    let destination = match destination {
        Some(FilePath::Path(path)) => path,
        Some(FilePath::Url(_)) => {
            return Err("The installer must be saved to a local file.".to_string())
        }
        None => return Ok(None),
    };

    let client = reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|_| "The secure update client could not be started.".to_string())?;
    let response = client
        .get(parsed_url)
        .header(reqwest::header::ACCEPT, "application/octet-stream")
        .send()
        .await
        .map_err(|_| "The installer could not be downloaded from GitHub.".to_string())?;
    validate_download_url(response.url())?;
    if !response.status().is_success() {
        return Err(format!(
            "GitHub returned HTTP {} while downloading the installer.",
            response.status()
        ));
    }

    let partial = partial_path(&destination);
    let download_result = async {
        let mut output = tokio::fs::File::create(&partial)
            .await
            .map_err(|_| "The installer file could not be created.".to_string())?;
        let mut checksum = Sha256::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk
                .map_err(|_| "The installer download was interrupted.".to_string())?;
            checksum.update(&chunk);
            output
                .write_all(&chunk)
                .await
                .map_err(|_| "The installer could not be written to disk.".to_string())?;
        }
        output
            .flush()
            .await
            .map_err(|_| "The installer could not be written to disk.".to_string())?;
        drop(output);

        let actual_sha256 = format!("{:x}", checksum.finalize());
        if actual_sha256 != expected_sha256 {
            return Err(
                "The downloaded installer failed its security checksum and was removed."
                    .to_string(),
            );
        }

        if destination.exists() {
            tokio::fs::remove_file(&destination)
                .await
                .map_err(|_| "The existing installer could not be replaced.".to_string())?;
        }
        tokio::fs::rename(&partial, &destination)
            .await
            .map_err(|_| "The completed installer could not be saved.".to_string())?;
        Ok(destination.to_string_lossy().to_string())
    }
    .await;

    if download_result.is_err() {
        let _ = tokio::fs::remove_file(&partial).await;
    }
    download_result.map(Some)
}
