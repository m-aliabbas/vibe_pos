import json
import os
import sys
import threading
import webbrowser
from pathlib import Path
from typing import Any

from app.core.config import settings
from cryptography.fernet import Fernet, InvalidToken
from oauth2client.tools import ClientRedirectHandler, ClientRedirectServer
from pydrive2.auth import GoogleAuth
from pydrive2.drive import GoogleDrive

DEFAULT_CLIENT_CONFIG_FILENAME = "g1.json.enc"
DEFAULT_SESSION_FILENAME = "google_drive_session.enc"
DRIVE_FOLDER_NAME = "VibePOS Backups"
DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
LOGIN_TIMEOUT_SECONDS = 120
MAX_DRIVE_BACKUP_BYTES = 1024 * 1024 * 1024
SUPPORTED_BACKUP_SUFFIXES = {".db", ".dump", ".sql"}
_auth_lock = threading.Lock()


class GoogleDriveBackupError(RuntimeError):
    pass


def _project_root_dir() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_resource_path(path_or_name: str | None) -> tuple[Path, list[Path]]:
    candidates: list[Path] = []
    raw = (path_or_name or "").strip()
    filename = Path(raw).name if raw else DEFAULT_CLIENT_CONFIG_FILENAME

    if raw:
        configured_path = Path(raw)
        if configured_path.is_absolute():
            candidates.append(configured_path)

    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent / filename)
        pyinstaller_dir = getattr(sys, "_MEIPASS", None)
        if pyinstaller_dir:
            candidates.append(Path(pyinstaller_dir) / filename)

    candidates.extend((_project_root_dir() / filename, Path.cwd() / filename))
    for candidate in candidates:
        try:
            if candidate.is_file():
                return candidate, candidates
        except OSError:
            continue
    return Path(filename), candidates


def _fernet() -> Fernet:
    key = (settings.FIREBASE_CREDENTIALS_KEY or "").strip()
    if not key:
        raise GoogleDriveBackupError(
            "The shared encrypted-credentials key is not configured."
        )
    try:
        return Fernet(key.encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise GoogleDriveBackupError(
            "The shared encrypted-credentials key is invalid."
        ) from exc


def _client_config_path() -> tuple[Path, list[Path]]:
    configured = (settings.GOOGLE_DRIVE_CLIENT_CONFIG_ENC_PATH or "").strip()
    return _resolve_resource_path(configured or DEFAULT_CLIENT_CONFIG_FILENAME)


def _session_path() -> Path:
    return Path(settings.DATA_DIR) / DEFAULT_SESSION_FILENAME


def _load_client_config() -> dict[str, Any]:
    encrypted_path, _candidates = _client_config_path()
    try:
        encrypted = encrypted_path.read_bytes()
    except FileNotFoundError as exc:
        raise GoogleDriveBackupError(
            "Google Drive sign-in is not configured in this build."
        ) from exc
    except OSError as exc:
        raise GoogleDriveBackupError(
            "The Google Drive sign-in configuration could not be read."
        ) from exc

    try:
        payload = json.loads(_fernet().decrypt(encrypted).decode("utf-8"))
    except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise GoogleDriveBackupError(
            "The Google Drive sign-in configuration could not be decrypted."
        ) from exc

    if not isinstance(payload, dict):
        raise GoogleDriveBackupError(
            "The Google Drive sign-in configuration is invalid."
        )

    client = payload.get("installed") or payload.get("web")
    if not isinstance(client, dict):
        raise GoogleDriveBackupError(
            "The Google Drive sign-in configuration is invalid."
        )

    required = ("client_id", "client_secret", "auth_uri", "token_uri")
    if any(not client.get(field) for field in required):
        raise GoogleDriveBackupError(
            "The Google Drive sign-in configuration is incomplete."
        )
    return client


def _load_session() -> dict[str, Any] | None:
    path = _session_path()
    if not path.is_file():
        return None
    try:
        payload = json.loads(_fernet().decrypt(path.read_bytes()).decode("utf-8"))
    except (OSError, InvalidToken, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get("credentials"), str):
        return None
    return payload


def _save_session(credentials_json: str, account: dict[str, str | None]) -> None:
    path = _session_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(
        {"credentials": credentials_json, "account": account},
        separators=(",", ":"),
    ).encode("utf-8")
    temporary_path = path.with_suffix(f"{path.suffix}.tmp")
    temporary_path.write_bytes(_fernet().encrypt(payload))
    temporary_path.replace(path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def _auth_settings(
    client: dict[str, Any], credential_store: dict[str, str]
) -> dict[str, Any]:
    redirect_uris = client.get("redirect_uris")
    redirect_uri = (
        redirect_uris[0]
        if isinstance(redirect_uris, list) and redirect_uris
        else "http://localhost:8080/"
    )
    return {
        "client_config_backend": "settings",
        "client_config": {
            "client_id": client["client_id"],
            "client_secret": client["client_secret"],
            "auth_uri": client["auth_uri"],
            "token_uri": client["token_uri"],
            "redirect_uri": redirect_uri,
            "revoke_uri": client.get("revoke_uri"),
        },
        "save_credentials": True,
        "save_credentials_backend": "dictionary",
        "save_credentials_dict": credential_store,
        "save_credentials_key": "credentials",
        "get_refresh_token": True,
        "oauth_scope": [DRIVE_FILE_SCOPE],
    }


def _build_auth(
    credentials_json: str | None = None,
) -> tuple[GoogleAuth, dict[str, str]]:
    store: dict[str, str] = {}
    if credentials_json:
        store["credentials"] = credentials_json
    auth = GoogleAuth(
        settings=_auth_settings(_load_client_config(), store),
        http_timeout=LOGIN_TIMEOUT_SECONDS,
    )
    return auth, store


def _account_from_about(about: dict[str, Any]) -> dict[str, str | None]:
    user = about.get("user") if isinstance(about, dict) else None
    user = user if isinstance(user, dict) else {}
    return {
        "display_name": user.get("displayName"),
        "email": user.get("emailAddress"),
    }


def _credentials_json(auth: GoogleAuth) -> str:
    if auth.credentials is None:
        raise GoogleDriveBackupError("Google Drive did not return login credentials.")
    return auth.credentials.to_json()


def get_status() -> dict[str, Any]:
    config_path, _candidates = _client_config_path()
    configured = config_path.is_file() and bool(
        (settings.FIREBASE_CREDENTIALS_KEY or "").strip()
    )
    if configured:
        try:
            _fernet()
        except GoogleDriveBackupError:
            configured = False
    session = _load_session() if configured else None
    account = session.get("account") if session else None
    return {
        "configured": configured,
        "connected": session is not None,
        "account": account if isinstance(account, dict) else None,
        "folder_name": DRIVE_FOLDER_NAME,
    }


def _authorize_in_browser(auth: GoogleAuth) -> None:
    redirect_server = None
    port_number = None
    for port in (8080, 8090):
        try:
            redirect_server = ClientRedirectServer(
                ("127.0.0.1", port), ClientRedirectHandler
            )
            port_number = port
            break
        except OSError:
            continue

    if redirect_server is None or port_number is None:
        raise GoogleDriveBackupError(
            "Google sign-in could not start because local ports 8080 and 8090 are busy."
        )

    try:
        auth.GetFlow()
        auth.flow.redirect_uri = f"http://localhost:{port_number}/"
        authorization_url = auth.GetAuthUrl()
        if not webbrowser.open(authorization_url, new=1, autoraise=True):
            raise GoogleDriveBackupError(
                "The Google sign-in browser could not be opened."
            )

        redirect_server.timeout = LOGIN_TIMEOUT_SECONDS
        redirect_server.handle_request()
        query_params = getattr(redirect_server, "query_params", {})
        if "error" in query_params:
            raise GoogleDriveBackupError("Google Drive access was not approved.")
        authorization_code = query_params.get("code")
        if not authorization_code:
            raise GoogleDriveBackupError(
                "Google sign-in timed out before approval was completed."
            )
        auth.Auth(authorization_code)
    finally:
        redirect_server.server_close()


def connect() -> dict[str, Any]:
    with _auth_lock:
        try:
            auth, _store = _build_auth()
            _authorize_in_browser(auth)
            drive = GoogleDrive(auth)
            account = _account_from_about(drive.GetAbout())
            _save_session(_credentials_json(auth), account)
            return {**get_status(), "account": account}
        except GoogleDriveBackupError:
            raise
        except Exception as exc:
            raise GoogleDriveBackupError(
                "Google Drive sign-in did not complete. Please try again."
            ) from exc


def disconnect() -> dict[str, Any]:
    with _auth_lock:
        try:
            _session_path().unlink(missing_ok=True)
        except OSError as exc:
            raise GoogleDriveBackupError(
                "The saved Google Drive login could not be removed."
            ) from exc
        return get_status()


def _authorized_drive() -> tuple[GoogleDrive, GoogleAuth, dict[str, Any]]:
    session = _load_session()
    if session is None:
        raise GoogleDriveBackupError(
            "Connect a Google account before uploading a backup."
        )

    try:
        auth, _store = _build_auth(session["credentials"])
        auth.LoadCredentials()
        if auth.credentials is None:
            raise GoogleDriveBackupError("The saved Google Drive login is unavailable.")
        if auth.access_token_expired:
            auth.Refresh()
        auth.Authorize()
        account = session.get("account")
        account = account if isinstance(account, dict) else {}
        _save_session(_credentials_json(auth), account)
        return GoogleDrive(auth), auth, account
    except GoogleDriveBackupError:
        raise
    except Exception as exc:
        raise GoogleDriveBackupError(
            "The Google Drive login has expired. Disconnect it and sign in again."
        ) from exc


def _get_or_create_folder(drive: GoogleDrive) -> str:
    escaped_name = DRIVE_FOLDER_NAME.replace("'", "\\'")
    folders = drive.ListFile(
        {
            "q": (
                f"title='{escaped_name}' and "
                "mimeType='application/vnd.google-apps.folder' and trashed=false"
            )
        }
    ).GetList()
    if folders:
        return folders[0]["id"]

    folder = drive.CreateFile(
        {
            "title": DRIVE_FOLDER_NAME,
            "mimeType": "application/vnd.google-apps.folder",
        }
    )
    folder.Upload()
    return folder["id"]


def upload_backup(backup_path: Path) -> dict[str, Any]:
    if not backup_path.is_file():
        raise GoogleDriveBackupError("The database backup could not be found.")
    if backup_path.suffix.lower() not in SUPPORTED_BACKUP_SUFFIXES:
        raise GoogleDriveBackupError("The database backup format is not supported.")

    with _auth_lock:
        try:
            drive, _auth, account = _authorized_drive()
            folder_id = _get_or_create_folder(drive)
            drive_file = drive.CreateFile(
                {
                    "title": backup_path.name,
                    "mimeType": "application/octet-stream",
                    "parents": [{"id": folder_id}],
                }
            )
            drive_file.SetContentFile(str(backup_path))
            drive_file.Upload()
            return {
                "filename": backup_path.name,
                "file_id": drive_file.get("id"),
                "folder_name": DRIVE_FOLDER_NAME,
                "account": account,
            }
        except GoogleDriveBackupError:
            raise
        except Exception as exc:
            raise GoogleDriveBackupError(
                "The backup could not be uploaded to Google Drive."
            ) from exc


def list_backups() -> list[dict[str, Any]]:
    """List VibePOS database snapshots created inside the app's Drive folder."""
    with _auth_lock:
        try:
            drive, _auth, _account = _authorized_drive()
            folder_id = _get_or_create_folder(drive)
            files = drive.ListFile(
                {
                    "q": f"'{folder_id}' in parents and trashed=false",
                    "orderBy": "createdDate desc",
                }
            ).GetList()
            return [
                {
                    "file_id": drive_file.get("id"),
                    "filename": drive_file.get("title"),
                    "created": drive_file.get("createdDate"),
                    "size": int(drive_file.get("fileSize") or 0),
                    "size_mb": round(
                        int(drive_file.get("fileSize") or 0) / (1024 * 1024), 2
                    ),
                }
                for drive_file in files
                if isinstance(drive_file.get("id"), str)
                if isinstance(drive_file.get("title"), str)
                and Path(drive_file["title"]).suffix.lower()
                in SUPPORTED_BACKUP_SUFFIXES
            ]
        except GoogleDriveBackupError:
            raise
        except Exception as exc:
            raise GoogleDriveBackupError(
                "Google Drive backups could not be loaded."
            ) from exc


def download_backup(
    file_id: str,
    destination_path: Path,
    allowed_suffixes: set[str] | None = None,
) -> dict[str, Any]:
    """Download one database snapshot after confirming it belongs to our folder."""
    with _auth_lock:
        try:
            drive, _auth, _account = _authorized_drive()
            folder_id = _get_or_create_folder(drive)
            drive_file = drive.CreateFile({"id": file_id})
            drive_file.FetchMetadata(
                fields="id,title,parents,fileSize,createdDate,labels"
            )

            title = drive_file.get("title")
            labels = drive_file.get("labels")
            labels = labels if isinstance(labels, dict) else {}
            file_size = int(drive_file.get("fileSize") or 0)
            parent_ids = {
                parent.get("id")
                for parent in (drive_file.get("parents") or [])
                if isinstance(parent, dict)
            }
            permitted_suffixes = allowed_suffixes or SUPPORTED_BACKUP_SUFFIXES
            if (
                labels.get("trashed")
                or not isinstance(title, str)
                or Path(title).suffix.lower() not in permitted_suffixes
                or folder_id not in parent_ids
            ):
                raise GoogleDriveBackupError("The selected Drive backup is invalid.")
            if file_size <= 0 or file_size > MAX_DRIVE_BACKUP_BYTES:
                raise GoogleDriveBackupError(
                    "The selected Drive backup has an invalid file size."
                )

            destination_path.parent.mkdir(parents=True, exist_ok=True)
            drive_file.GetContentFile(str(destination_path))
            if destination_path.stat().st_size != file_size:
                destination_path.unlink(missing_ok=True)
                raise GoogleDriveBackupError(
                    "The Google Drive backup download was incomplete."
                )
            return {
                "file_id": file_id,
                "filename": title,
                "created": drive_file.get("createdDate"),
            }
        except GoogleDriveBackupError:
            raise
        except Exception as exc:
            raise GoogleDriveBackupError(
                "The selected Google Drive backup could not be downloaded."
            ) from exc
