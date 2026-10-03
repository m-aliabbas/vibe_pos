import tempfile
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from app.api import deps
from app.core.config import settings
from app.db.session import engine
from app.services import backup_scheduler, google_drive_backup
from app.services.backup_archive import (
    DatabaseBackup,
    POS_DATABASE_FILENAME,
    create_database_backup,
    get_pos_database,
    restore_pos_database,
)
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

router = APIRouter(dependencies=[Depends(deps.get_current_active_admin)])
MAX_BACKUP_UPLOAD_BYTES = 1024 * 1024 * 1024


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
    return Path(settings.DATA_DIR)


def get_backup_dir() -> Path:
    backup_dir = get_data_dir().parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def _create_manual_backup() -> DatabaseBackup:
    return create_database_backup(
        get_data_dir(),
        get_backup_dir(),
        filename_prefix="pos_backup",
    )


def _upload_if_connected(backup: DatabaseBackup) -> tuple[bool, str | None]:
    if not google_drive_backup.get_status()["connected"]:
        return False, "Connect Google Drive to enable automatic cloud backups."
    try:
        google_drive_backup.upload_backup(backup.path)
        return True, None
    except google_drive_backup.GoogleDriveBackupError as exc:
        return False, str(exc)


def _restore_database(source_path: Path) -> str:
    """Create a rollback snapshot, restore pos.db, and recycle pooled connections."""
    safety_backup = create_database_backup(
        get_data_dir(),
        get_backup_dir(),
        filename_prefix="pos_backup_pre_restore",
    )
    try:
        restore_pos_database(source_path, get_data_dir())
    except Exception:
        restore_pos_database(safety_backup.path, get_data_dir())
        raise
    finally:
        engine.dispose()
    return safety_backup.filename


@router.get("/list-files")
def list_database_files():
    """Show the single application database included in every backup."""
    try:
        database_path = get_pos_database(get_data_dir())
        size = database_path.stat().st_size
        return {
            "success": True,
            "files": [
                {
                    "path": POS_DATABASE_FILENAME,
                    "size": size,
                    "size_mb": round(size / (1024 * 1024), 2),
                }
            ],
            "total_files": 1,
            "total_size": size,
            "total_size_mb": round(size / (1024 * 1024), 2),
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/scheduler/status")
def get_scheduler_status():
    return {"success": True, "scheduler": backup_scheduler.get_scheduler_status()}


@router.post("/test-automatic")
async def test_automatic_backup(background_tasks: BackgroundTasks):
    background_tasks.add_task(backup_scheduler.create_automatic_backup)
    return {
        "success": True,
        "message": "Automatic pos.db backup started. It will upload to Drive when connected.",
    }


@router.post("/create")
async def create_backup():
    """Create a pos.db snapshot and automatically copy it to connected Drive."""
    try:
        backup = await run_in_threadpool(_create_manual_backup)
        drive_uploaded, drive_error = await run_in_threadpool(
            _upload_if_connected, backup
        )
        return {
            "success": True,
            "message": "pos.db backup created successfully",
            "backup_filename": backup.filename,
            "backup_info": BackupInfo(
                timestamp=backup.timestamp,
                files=[POS_DATABASE_FILENAME],
                total_size=backup.total_size,
            ),
            "drive_uploaded": drive_uploaded,
            "drive_error": drive_error,
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
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
    backup: Optional[DatabaseBackup] = None
    try:
        backup = await run_in_threadpool(_create_manual_backup)
        uploaded = await run_in_threadpool(
            google_drive_backup.upload_backup, backup.path
        )
        return {
            "success": True,
            "message": "pos.db backup uploaded to Google Drive successfully.",
            "filename": backup.filename,
            "folder_name": uploaded["folder_name"],
            "account": uploaded.get("account"),
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except google_drive_backup.GoogleDriveBackupError as exc:
        local_copy = f" A local copy was saved as {backup.filename}." if backup else ""
        raise HTTPException(status_code=400, detail=f"{exc}{local_copy}") from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="The backup could not be prepared for Google Drive.",
        ) from exc


@router.get("/google-drive/list", response_model=list[GoogleDriveBackupFile])
async def list_google_drive_backups():
    try:
        return await run_in_threadpool(google_drive_backup.list_backups)
    except google_drive_backup.GoogleDriveBackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/google-drive/restore/{file_id}")
async def restore_google_drive_backup(file_id: str):
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix="drive_restore_",
            suffix=".db",
            dir=get_data_dir().parent,
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)

        metadata = await run_in_threadpool(
            google_drive_backup.download_backup, file_id, temporary_path
        )
        safety_backup = await run_in_threadpool(_restore_database, temporary_path)
        return {
            "success": True,
            "message": "pos.db restored from Google Drive successfully. Restart VibePOS before continuing.",
            "restored_file": POS_DATABASE_FILENAME,
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
    if Path(filename).name != filename or not filename.lower().endswith(".db"):
        raise HTTPException(status_code=400, detail="Invalid backup filename")
    backup_path = get_backup_dir() / filename
    if not backup_path.is_file():
        raise HTTPException(status_code=404, detail="Backup file not found")
    return FileResponse(
        path=backup_path,
        filename=filename,
        media_type="application/vnd.sqlite3",
    )


@router.post("/restore")
async def restore_backup(file: UploadFile = File(...)):
    """Restore pos.db from a directly uploaded SQLite database file."""
    temporary_path: Path | None = None
    try:
        if not (file.filename or "").lower().endswith(".db"):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Select a VibePOS .db backup file.",
            )

        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix="local_restore_",
            suffix=".db",
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

        safety_backup = await run_in_threadpool(_restore_database, temporary_path)
        return {
            "success": True,
            "message": "pos.db restored successfully. Restart VibePOS before continuing.",
            "restored_file": POS_DATABASE_FILENAME,
            "safety_backup": safety_backup,
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


@router.get("/list")
def list_backups():
    backups = []
    for backup_file in get_backup_dir().glob("pos_backup_*.db"):
        if backup_file.is_file():
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
