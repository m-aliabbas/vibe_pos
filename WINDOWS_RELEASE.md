# Building and Publishing VibePOS for Windows

The Windows installer is built on a temporary GitHub-hosted Windows machine. Version tags publish customer downloads to the public `m-aliabbas/vibepos-releases` repository; customers never receive this source repository.

## One-time GitHub setup

1. Confirm the GitHub repository is **Private** under **Settings → General → Change repository visibility**.
2. Encode `backend/.env` without printing it to the terminal:

   ```bash
   base64 < backend/.env | tr -d '\n' | pbcopy
   ```

3. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**.
4. Name the secret `TAURI_ENV_FILE_BASE64` and paste the clipboard value.
5. Add a fine-grained GitHub token as `RELEASE_REPO_TOKEN`. Give it access only to `m-aliabbas/vibepos-releases` with **Contents: Read and write** permission. This secret lets the private source workflow publish assets to the public release-only repository.

The workflow recreates `frontend/src-tauri/bin/.env` only inside the temporary Windows runner. The value is not committed or uploaded as a separate artifact.

The packaged backend stores runtime state under `%LOCALAPPDATA%\VibePOS\data`, outside the installation directory, so installing a newer version cannot replace customer data. On the first upgraded launch, an existing legacy bundled database is copied forward automatically. The `bin/data/` directory is retained only as an optional seed/migration source. If a specific initial data payload is required, zip the **contents** of that directory, Base64-encode the ZIP, and save it as the optional `TAURI_DATA_ARCHIVE_BASE64` Actions secret. Do not put a real customer's database or WhatsApp session in this payload.

## Make a test build

1. Push these files to the private repository.
2. Open the repository's **Actions** tab.
3. Select **Windows Release**.
4. Choose **Run workflow**.
5. When it finishes, download `VibePOS-Windows-...` from the workflow's **Artifacts** section.

A manual run never publishes a release. It creates an installer artifact retained for 90 days, including a preview of `latest.json`.

## Make a versioned release

The current application version is `1.0.16`. Set the next version with one command; it updates the frontend, both Tauri configurations, and both Rust lock files:

```bash
cd frontend
npm run set:version -- 1.0.17
cd ..
git add frontend/package.json frontend/package-lock.json frontend/src-tauri
git commit -m "release: v1.0.17"
```

After updating and committing the version, create and push a matching tag:

```bash
git tag v1.0.17
git push origin v1.0.17
```

The workflow builds the installer and automatically publishes the release to `m-aliabbas/vibepos-releases`. The in-app **Application Updates** page discovers it through the permanent URL:

```text
https://github.com/m-aliabbas/vibepos-releases/releases/latest/download/latest.json
```

Only push a version tag after the corresponding commit has passed release testing. Re-running the tagged workflow replaces the assets for that same release.

## Files saved with every build

- Windows NSIS setup executable
- `latest.json` consumed by the in-app update checker
- `SHA256SUMS.txt`
- `build-manifest.json` with the commit, tool versions, lock-file hashes, and installer hash
- `python-packages.txt` with the installed Python package versions

The workflow currently produces an unsigned installer and publishes its SHA-256 checksum. Windows Authenticode signing should be added after obtaining a certificate; the certificate and password must be stored only as GitHub Actions secrets.

## Updating Python packages deliberately

Normal releases install `backend/requirements-windows.lock`, so package versions cannot change during a build. When intentionally upgrading a direct dependency, update `backend/win_requirements.txt`, regenerate the lock, test it, and commit both files together:

```bash
python -m pip install uv==0.8.22
uv pip compile backend/win_requirements.txt \
  --python-version 3.12 \
  --python-platform x86_64-pc-windows-msvc \
  --output-file backend/requirements-windows.lock
```
