import json
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from app.api import deps
from app.core.config import settings
from app.core.timezone import now_pkt
from app.db.integrity import assert_journals_balanced
from app.db.session import engine, provider
from app.services import backup_scheduler, google_drive_backup
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

router = APIRouter(dependencies=[Depends(deps.get_current_active_admin)])
MAX_BACKUP_UPLOAD_BYTES = 1024 * 1024 * 1024
PROVIDER_BACKUP_SUFFIXES = {
    "sqlite": ".db",
    "postgresql": ".dump",
    "mysql": ".sql",
}


class BackupInfo(BaseModel):
    timestamp: str
    files: List[str]
    total_size: int


class GoogleDriveAccount(BaseModel):
    display_name: Optional[str] = None
    email: Optional[str] = None


class GoogleDriveStatus(BaseModel):
    configured: bool
    connected: bool
    account: Optional[GoogleDriveAccount] = None
    folder_name: str


class GoogleDriveUploadResponse(BaseModel):
    success: bool
    message: str
    filename: str
    folder_name: str
    account: Optional[GoogleDriveAccount] = None


class GoogleDriveBackupFile(BaseModel):
    file_id: str
    filename: str
    created: Optional[str] = None
    size: int
    size_mb: float


def get_data_dir() -> Path:
    """Return the configured writable application data directory."""
    return Path(settings.DATA_DIR).resolve()


def get_backup_dir() -> Path:
    backup_dir = get_data_dir().parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def _provider_backup_suffix() -> str:
    return PROVIDER_BACKUP_SUFFIXES[provider.name]


def _create_manual_backup() -> Path:
    return provider.create_backup(engine, get_backup_dir(), "pos_backup")


def _upload_if_connected(backup_path: Path) -> tuple[bool, str | None]:
    if not google_drive_backup.get_status()["connected"]:
        return False, "Connect Google Drive to enable automatic cloud backups."
    try:
        google_drive_backup.upload_backup(backup_path)
        return True, None
    except google_drive_backup.GoogleDriveBackupError as exc:
        return False, str(exc)


def _restore_database(source_path: Path) -> str:
    """Restore a native provider backup and roll back if validation fails."""
    safety_backup = provider.create_backup(
        engine, get_backup_dir(), "pos_backup_pre_restore"
    )
    try:
        engine.dispose()
        provider.restore_backup(engine, source_path)
        engine.dispose()
        provider.health_check(engine)
        assert_journals_balanced(engine)
    except Exception:
        engine.dispose()
        provider.restore_backup(engine, safety_backup)
        engine.dispose()
        provider.health_check(engine)
        assert_journals_balanced(engine)
        raise
    return safety_backup.name


def _require_maintenance_mode() -> None:
    if not settings.DATABASE_MAINTENANCE_MODE:
        raise HTTPException(
            status_code=409,
            detail=(
                "Restore requires DATABASE_MAINTENANCE_MODE=true and all other "
                "application processes stopped"
            ),
        )


def _extract_legacy_sqlite_backup(archive_path: Path) -> Path:
    """Extract pos.db from the ZIP format emitted by older VibePOS builds."""
    extracted_path = archive_path.with_suffix(".legacy.db")
    try:
        with zipfile.ZipFile(archive_path, "r") as archive:
            if "backup_info.json" not in archive.namelist():
                raise ValueError("invalid legacy backup metadata")
            metadata = json.loads(archive.read("backup_info.json"))
            for file_info in metadata.get("files", []):
                relative = Path(file_info.get("path", ""))
                if relative.is_absolute() or ".." in relative.parts:
                    raise ValueError("unsafe legacy backup path")
                if relative.name == "pos.db" and relative.suffix.lower() == ".db":
                    extracted_path.write_bytes(archive.read(relative.as_posix()))
                    return extracted_path
    except (KeyError, TypeError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
        raise ValueError("invalid legacy backup archive") from exc
    raise ValueError("legacy backup does not contain pos.db")


@router.get("/list-files")
def list_database_files():
    """Describe the provider-owned database included in a backup."""
    if provider.name == "sqlite":
        database_path = provider.database_path
        size = database_path.stat().st_size if database_path.exists() else 0
        path = database_path.name
    else:
        size = 0
        path = f"{provider.name}:{provider.url.database or 'database'}"
    return {
        "success": True,
        "provider": provider.name,
        "backup_suffix": _provider_backup_suffix(),
        "files": [
            {
                "path": path,
                "size": size,
                "size_mb": round(size / (1024 * 1024), 2),
            }
        ],
        "total_files": 1,
        "total_size": size,
        "total_size_mb": round(size / (1024 * 1024), 2),
    }


@router.get("/scheduler/status")
def get_scheduler_status():
    return {"success": True, "scheduler": backup_scheduler.get_scheduler_status()}


@router.post("/test-automatic")
async def test_automatic_backup(background_tasks: BackgroundTasks):
    background_tasks.add_task(backup_scheduler.create_automatic_backup)
    return {
        "success": True,
        "message": (
            f"Automatic {provider.name} backup started. It will upload to Drive "
            "when connected."
        ),
    }


@router.post("/create")
async def create_backup():
    """Create a native provider backup and copy it to Drive when connected."""
    try:
        backup_path = await run_in_threadpool(_create_manual_backup)
        drive_uploaded, drive_error = await run_in_threadpool(
            _upload_if_connected, backup_path
        )
        return {
            "success": True,
            "message": f"{provider.name} backup created successfully",
            "backup_filename": backup_path.name,
            "backup_info": BackupInfo(
                timestamp=now_pkt().isoformat(),
                files=[backup_path.name],
                total_size=backup_path.stat().st_size,
            ),
            "drive_uploaded": drive_uploaded,
            "drive_error": drive_error,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}") from exc


@router.get("/google-drive/status", response_model=GoogleDriveStatus)
def get_google_drive_status():
    return google_drive_backup.get_status()


@router.post("/google-drive/connect", response_model=GoogleDriveStatus)
async def connect_google_drive():
    try:
        return await run_in_threadpool(google_drive_backup.connect)
    except google_drive_backup.GoogleDriveBackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/google-drive/disconnect", response_model=GoogleDriveStatus)
def disconnect_google_drive():
    try:
        return google_drive_backup.disconnect()
    except google_drive_backup.GoogleDriveBackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/google-drive/upload", response_model=GoogleDriveUploadResponse)
async def upload_backup_to_google_drive():
    backup_path: Path | None = None
    try:
        backup_path = await run_in_threadpool(_create_manual_backup)
        uploaded = await run_in_threadpool(
            google_drive_backup.upload_backup, backup_path
        )
        return {
            "success": True,
            "message": f"{provider.name} backup uploaded to Google Drive successfully.",
            "filename": backup_path.name,
            "folder_name": uploaded["folder_name"],
            "account": uploaded.get("account"),
        }
    except google_drive_backup.GoogleDriveBackupError as exc:
        local_copy = f" A local copy was saved as {backup_path.name}." if backup_path else ""
        raise HTTPException(status_code=400, detail=f"{exc}{local_copy}") from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="The backup could not be prepared for Google Drive.",
        ) from exc


@router.get("/google-drive/list", response_model=list[GoogleDriveBackupFile])
async def list_google_drive_backups():
    try:
        backups = await run_in_threadpool(google_drive_backup.list_backups)
        suffix = _provider_backup_suffix()
        return [item for item in backups if item["filename"].lower().endswith(suffix)]
    except google_drive_backup.GoogleDriveBackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/google-drive/restore/{file_id}")
async def restore_google_drive_backup(file_id: str):
    _require_maintenance_mode()
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix="drive_restore_",
            suffix=_provider_backup_suffix(),
            dir=get_data_dir().parent,
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)

        metadata = await run_in_threadpool(
            google_drive_backup.download_backup,
            file_id,
            temporary_path,
            {_provider_backup_suffix()},
        )
        safety_backup = await run_in_threadpool(_restore_database, temporary_path)
        return {
            "success": True,
            "message": (
                f"{provider.name} backup restored from Google Drive successfully. "
                "Restart VibePOS before continuing."
            ),
            "restored_file": metadata["filename"],
            "source_filename": metadata["filename"],
            "safety_backup": safety_backup,
        }
    except google_drive_backup.GoogleDriveBackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid backup: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Restore failed: {exc}") from exc
    finally:
        if temporary_path:
            temporary_path.unlink(missing_ok=True)


@router.get("/download/{filename}")
def download_backup(filename: str):
    backup_dir = get_backup_dir().resolve()
    backup_path = (backup_dir / Path(filename).name).resolve()
    if (
        Path(filename).name != filename
        or backup_dir not in backup_path.parents
        or backup_path.suffix.lower() != _provider_backup_suffix()
    ):
        raise HTTPException(status_code=400, detail="Invalid backup filename")
    if not backup_path.is_file():
        raise HTTPException(status_code=404, detail="Backup file not found")
    return FileResponse(
        path=backup_path,
        filename=filename,
        media_type="application/octet-stream",
    )


@router.post("/restore")
async def restore_backup(file: UploadFile = File(...)):
    """Restore a native provider backup while maintenance mode is enabled."""
    _require_maintenance_mode()
    temporary_path: Path | None = None
    extracted_legacy_path: Path | None = None
    try:
        suffix = Path(file.filename or "").suffix.lower()
        allowed_suffixes = {_provider_backup_suffix()}
        if provider.name == "sqlite":
            allowed_suffixes.add(".zip")
        if suffix not in allowed_suffixes:
            expected = ", ".join(sorted(allowed_suffixes))
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type for {provider.name}. Select one of: {expected}",
            )

        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix="local_restore_",
            suffix=suffix,
            dir=get_data_dir().parent,
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            uploaded_size = 0
            while chunk := await file.read(1024 * 1024):
                uploaded_size += len(chunk)
                if uploaded_size > MAX_BACKUP_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Backup file is too large")
                temporary_file.write(chunk)

        restore_path = temporary_path
        if suffix == ".zip":
            extracted_legacy_path = await run_in_threadpool(
                _extract_legacy_sqlite_backup, temporary_path
            )
            restore_path = extracted_legacy_path

        safety_backup = await run_in_threadpool(_restore_database, restore_path)
        return {
            "success": True,
            "message": "Backup restored successfully. Restart VibePOS before continuing.",
            "restored_file": file.filename,
            "safety_backup": safety_backup,
            "backup_timestamp": now_pkt().isoformat(),
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid backup: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Restore failed: {exc}") from exc
    finally:
        await file.close()
        if temporary_path:
            temporary_path.unlink(missing_ok=True)
        if extracted_legacy_path:
            extracted_legacy_path.unlink(missing_ok=True)


@router.get("/list")
def list_backups():
    backups = []
    suffix = _provider_backup_suffix()
    for backup_file in get_backup_dir().glob("pos_backup_*"):
        if backup_file.is_file() and backup_file.suffix.lower() == suffix:
            backups.append(
                {
                    "filename": backup_file.name,
                    "size": backup_file.stat().st_size,
                    "size_mb": round(backup_file.stat().st_size / (1024 * 1024), 2),
                    "created": datetime.fromtimestamp(
                        backup_file.stat().st_mtime
                    ).isoformat(),
                }
            )
    backups.sort(key=lambda item: item["created"], reverse=True)
    return {"success": True, "backups": backups, "total_backups": len(backups)}
