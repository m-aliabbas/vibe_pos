import os
import shutil
import tempfile
import zipfile
import json
from datetime import datetime
from app.core.timezone import now_pkt
from pathlib import Path
from typing import List
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

# Import backup scheduler for status and manual trigger
from app.services import backup_scheduler

router = APIRouter()
MAX_BACKUP_UPLOAD_BYTES = 1024 * 1024 * 1024


class BackupInfo(BaseModel):
    timestamp: str
    files: List[str]
    total_size: int


class BackupResponse(BaseModel):
    success: bool
    message: str
    backup_info: BackupInfo | None = None


def get_data_dir() -> Path:
    """Get the data directory path from environment"""
    data_dir = os.environ.get("DATA_DIR")
    if not data_dir:
        raise HTTPException(status_code=500, detail="DATA_DIR not configured")
    return Path(data_dir)


def find_all_db_files(data_dir: Path) -> List[Path]:
    """Find databases and user-managed branding assets in the data directory."""
    db_files = []
    for root, dirs, files in os.walk(data_dir):
        for file in files:
            if file.endswith('.db'):
                db_files.append(Path(root) / file)
    branding_dir = data_dir / "branding"
    if branding_dir.is_dir():
        db_files.extend(path for path in branding_dir.rglob("*") if path.is_file())
    return db_files


def get_backup_dir() -> Path:
    """Get or create the backups directory"""
    data_dir = get_data_dir()
    backup_dir = data_dir.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


@router.get("/list-files")
def list_database_files():
    """List all database files that will be included in backup"""
    try:
        data_dir = get_data_dir()
        db_files = find_all_db_files(data_dir)
        
        files_info = []
        total_size = 0
        
        for db_file in db_files:
            if db_file.exists():
                size = db_file.stat().st_size
                total_size += size
                # Get relative path from data_dir
                rel_path = db_file.relative_to(data_dir)
                files_info.append({
                    "path": str(rel_path),
                    "size": size,
                    "size_mb": round(size / (1024 * 1024), 2)
                })
        
        return {
            "success": True,
            "files": files_info,
            "total_files": len(files_info),
            "total_size": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scheduler/status")
def get_scheduler_status():
    """Get the status of the automatic backup scheduler"""
    try:
        status = backup_scheduler.get_scheduler_status()
        return {
            "success": True,
            "scheduler": status
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-automatic")
async def test_automatic_backup(background_tasks: BackgroundTasks):
    """Manually trigger an automatic backup for testing purposes"""
    try:
        # Run backup in background
        background_tasks.add_task(backup_scheduler.create_automatic_backup)
        return {
            "success": True,
            "message": "Automatic backup triggered successfully. Check logs for progress."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create")
def create_backup():
    """Create a backup of all database files"""
    try:
        data_dir = get_data_dir()
        backup_dir = get_backup_dir()
        
        # Find all database files
        db_files = find_all_db_files(data_dir)
        
        if not db_files:
            raise HTTPException(status_code=404, detail="No database files found")
        
        # Create timestamped backup filename
        timestamp = now_pkt().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"pos_backup_{timestamp}.zip"
        backup_path = backup_dir / backup_filename
        
        # Create backup metadata
        backup_metadata = {
            "timestamp": now_pkt().isoformat(),
            "files": [],
            "total_size": 0
        }
        
        # Create ZIP archive
        with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for db_file in db_files:
                if db_file.exists():
                    # Store relative path in ZIP to maintain directory structure
                    rel_path = db_file.relative_to(data_dir)
                    zipf.write(db_file, arcname=rel_path)
                    
                    # Add to metadata
                    file_size = db_file.stat().st_size
                    backup_metadata["files"].append({
                        "path": str(rel_path),
                        "size": file_size
                    })
                    backup_metadata["total_size"] += file_size
            
            # Add metadata file to backup
            metadata_json = json.dumps(backup_metadata, indent=2)
            zipf.writestr("backup_info.json", metadata_json)
        
        return {
            "success": True,
            "message": "Backup created successfully",
            "backup_path": str(backup_path),
            "backup_filename": backup_filename,
            "backup_info": BackupInfo(
                timestamp=backup_metadata["timestamp"],
                files=[f["path"] for f in backup_metadata["files"]],
                total_size=backup_metadata["total_size"]
            )
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")


@router.get("/download/{filename}")
def download_backup(filename: str):
    """Download a specific backup file"""
    try:
        backup_dir = get_backup_dir()
        backup_path = backup_dir / filename
        
        if not backup_path.exists():
            raise HTTPException(status_code=404, detail="Backup file not found")
        
        if not backup_path.is_file() or not filename.endswith('.zip'):
            raise HTTPException(status_code=400, detail="Invalid backup file")
        
        return FileResponse(
            path=backup_path,
            filename=filename,
            media_type="application/zip"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restore")
async def restore_backup(file: UploadFile = File(...)):
    """Restore database files from a backup ZIP"""
    temp_backup_path: Path | None = None

    try:
        data_dir = get_data_dir()

        # Validate file type
        if not (file.filename or '').lower().endswith('.zip'):
            raise HTTPException(status_code=400, detail="Invalid file type. Must be a ZIP file")

        data_dir.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode='wb',
            prefix='temp_restore_',
            suffix='.zip',
            dir=data_dir.parent,
            delete=False,
        ) as temp_file:
            temp_backup_path = Path(temp_file.name)
            uploaded_size = 0
            while chunk := await file.read(1024 * 1024):
                uploaded_size += len(chunk)
                if uploaded_size > MAX_BACKUP_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Backup file is too large")
                temp_file.write(chunk)

        restored_files, backup_timestamp = await run_in_threadpool(
            _restore_backup_archive,
            temp_backup_path,
            data_dir,
        )

        return {
            "success": True,
            "message": "Backup restored successfully. Please restart the application.",
            "restored_files": restored_files,
            "backup_timestamp": backup_timestamp,
        }

    except HTTPException:
        raise
    except (zipfile.BadZipFile, json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid backup file: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")
    finally:
        await file.close()
        if temp_backup_path and temp_backup_path.exists():
            temp_backup_path.unlink()


def _restore_backup_archive(backup_path: Path, data_dir: Path) -> tuple[List[str], str]:
    """Validate and restore an uploaded archive without blocking the async server loop."""
    data_dir = data_dir.resolve()

    with zipfile.ZipFile(backup_path, 'r') as zipf:
        archive_names = set(zipf.namelist())
        if 'backup_info.json' not in archive_names:
            raise ValueError("missing metadata")

        corrupt_member = zipf.testzip()
        if corrupt_member:
            raise ValueError(f"corrupt archive member: {corrupt_member}")

        backup_metadata = json.loads(zipf.read('backup_info.json'))
        file_entries = backup_metadata.get("files")
        backup_timestamp = backup_metadata.get("timestamp")
        if not isinstance(file_entries, list) or not isinstance(backup_timestamp, str):
            raise ValueError("invalid metadata")

        restored_files: List[str] = []
        for file_info in file_entries:
            if not isinstance(file_info, dict) or not isinstance(file_info.get("path"), str):
                raise ValueError("invalid file metadata")

            file_path = file_info["path"]
            if file_path not in archive_names:
                raise ValueError(f"missing archive member: {file_path}")

            target_path = (data_dir / file_path).resolve()
            if target_path == data_dir or data_dir not in target_path.parents:
                raise ValueError("invalid backup file path")

            target_path.parent.mkdir(parents=True, exist_ok=True)
            with zipf.open(file_path, 'r') as source, target_path.open('wb') as destination:
                shutil.copyfileobj(source, destination, length=1024 * 1024)
            restored_files.append(file_path)

    return restored_files, backup_timestamp


@router.get("/list")
def list_backups():
    """List all available backup files"""
    try:
        backup_dir = get_backup_dir()
        
        if not backup_dir.exists():
            return {
                "success": True,
                "backups": [],
                "total_backups": 0
            }
        
        backups = []
        for backup_file in backup_dir.glob("pos_backup_*.zip"):
            if backup_file.is_file():
                backups.append({
                    "filename": backup_file.name,
                    "size": backup_file.stat().st_size,
                    "size_mb": round(backup_file.stat().st_size / (1024 * 1024), 2),
                    "created": datetime.fromtimestamp(backup_file.stat().st_mtime).isoformat()
                })
        
        # Sort by creation time (newest first)
        backups.sort(key=lambda x: x["created"], reverse=True)
        
        return {
            "success": True,
            "backups": backups,
            "total_backups": len(backups)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
