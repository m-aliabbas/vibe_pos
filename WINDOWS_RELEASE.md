# Building VibePOS for Windows

The Windows installer is built on a temporary GitHub-hosted Windows machine. Customers receive the installer; they do not receive this repository.

## One-time GitHub setup

1. Confirm the GitHub repository is **Private** under **Settings → General → Change repository visibility**.
2. Encode `backend/.env` without printing it to the terminal:

   ```bash
   base64 < backend/.env | tr -d '\n' | pbcopy
   ```

3. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**.
4. Name the secret `TAURI_ENV_FILE_BASE64` and paste the clipboard value.

The workflow recreates `frontend/src-tauri/bin/.env` only inside the temporary Windows runner. The value is not committed or uploaded as a separate artifact.

The `bin/data/` directory is always retained in the bundle. The existing backend creates and seeds its database there on first run. If a specific initial data payload is required, zip the **contents** of that data directory, Base64-encode the ZIP, and save it as the optional `TAURI_DATA_ARCHIVE_BASE64` Actions secret. Do not put a real customer's database or WhatsApp session in this payload.

## Make a test build

1. Push these files to the private repository.
2. Open the repository's **Actions** tab.
3. Select **Windows Release**.
4. Choose **Run workflow**.
5. When it finishes, download `VibePOS-Windows-...` from the workflow's **Artifacts** section.

A manual run never publishes a release. It creates an installer artifact retained for 90 days.

## Make a versioned release

The current application version is `0.1.0`. Set a new version with one command; it updates the frontend, both Tauri configurations, and both Rust lock files:

```bash
cd frontend
npm run set:version -- 0.2.0
cd ..
git add frontend/package.json frontend/package-lock.json frontend/src-tauri
git commit -m "release: v0.2.0"
```

After updating and committing the version, create and push a matching tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The workflow builds the installer and creates a **draft** GitHub release. Inspect the draft and its checksum before publishing it for customers.

## Files saved with every build

- Windows NSIS setup executable
- `SHA256SUMS.txt`
- `build-manifest.json` with the commit, tool versions, lock-file hashes, and installer hash
- `python-packages.txt` with the installed Python package versions

The first workflow produces an unsigned installer. Windows code signing should be added after obtaining a certificate; the certificate and password must be stored only as GitHub Actions secrets.

## Updating Python packages deliberately

Normal releases install `backend/requirements-windows.lock`, so package versions cannot change during a build. When intentionally upgrading a direct dependency, update `backend/win_requirements.txt`, regenerate the lock, test it, and commit both files together:

```bash
python -m pip install uv==0.8.22
uv pip compile backend/win_requirements.txt \
  --python-version 3.12 \
  --python-platform x86_64-pc-windows-msvc \
  --output-file backend/requirements-windows.lock
```
