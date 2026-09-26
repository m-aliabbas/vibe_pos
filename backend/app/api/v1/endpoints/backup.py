import zipfile
import json
from datetime import datetime
from app.core.timezone import now_pkt
from app.core.config import settings
from app.db.session import engine, provider
from app.db.integrity import assert_journals_balanced
from pathlib import Path
from typing import List
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Import backup scheduler for status and manual trigger
from app.services import backup_scheduler

router = APIRouter()


class BackupInfo(BaseModel):
    timestamp: str
    files: List[str]
    total_size: int


class BackupResponse(BaseModel):
    success: bool
    message: str
    backup_info: BackupInfo | None = None


def get_data_dir() -> Path:
    """Return the configured writable application data directory."""
    return Path(settings.DATA_DIR).resolve()


def get_backup_dir() -> Path:
    """Get or create the backups directory"""
    data_dir = get_data_dir()
    backup_dir = data_dir.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


@router.get("/list-files")
def list_database_files():
    """Describe the provider-owned database included in a backup."""
    try:
        if provider.name == "sqlite":
            database_path = provider.database_path
            size = database_path.stat().st_size if database_path.exists() else 0
            files_info = [{
                "path": database_path.name,
                "size": size,
                "size_mb": round(size / (1024 * 1024), 2),
            }]
            total_size = size
        else:
            files_info = [{
                "path": f"{provider.name}:{provider.url.database}",
                "size": 0,
                "size_mb": 0,
            }]
            total_size = 0
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
    """Create a provider-aware database backup."""
    try:
        backup_dir = get_backup_dir()
        backup_path = provider.create_backup(engine, backup_dir, "pos_backup")
        size = backup_path.stat().st_size
        
        return {
            "success": True,
            "message": f"{provider.name} backup created successfully",
            "backup_path": str(backup_path),
            "backup_filename": backup_path.name,
            "backup_info": BackupInfo(
                timestamp=now_pkt().isoformat(),
                files=[backup_path.name],
                total_size=size,
            )
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")


@router.get("/download/{filename}")
def download_backup(filename: str):
    """Download a specific backup file"""
    try:
        backup_dir = get_backup_dir()
        backup_path = (backup_dir / Path(filename).name).resolve()
        if backup_dir.resolve() not in backup_path.parents:
            raise HTTPException(status_code=400, detail="Invalid backup filename")
        
        if not backup_path.exists():
            raise HTTPException(status_code=404, detail="Backup file not found")
        
        if not backup_path.is_file():
            raise HTTPException(status_code=400, detail="Invalid backup file")
        
        return FileResponse(
            path=backup_path,
            filename=filename,
            media_type="application/octet-stream"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restore")
async def restore_backup(file: UploadFile = File(...)):
    """Restore a native provider backup while maintenance mode is enabled."""
    try:
        data_dir = get_data_dir()
        if not settings.DATABASE_MAINTENANCE_MODE:
            raise HTTPException(
                status_code=409,
                detail="Restore requires DATABASE_MAINTENANCE_MODE=true and all other application processes stopped",
            )
        suffix = Path(file.filename or "").suffix
        temp_backup_path = data_dir.parent / f"temp_restore_{now_pkt().strftime('%Y%m%d_%H%M%S')}{suffix}"
        
        try:
            # Write uploaded file
            with open(temp_backup_path, 'wb') as f:
                content = await file.read()
                f.write(content)
            
            restored_files = [file.filename]
            if provider.name == "sqlite" and suffix.lower() == ".zip":
                with zipfile.ZipFile(temp_backup_path, "r") as archive:
                    if "backup_info.json" not in archive.namelist():
                        raise HTTPException(status_code=400, detail="Invalid legacy backup metadata")
                    metadata = json.loads(archive.read("backup_info.json"))
                    restored_files = []
                    for file_info in metadata.get("files", []):
                        relative = Path(file_info["path"])
                        if relative.is_absolute() or ".." in relative.parts or relative.suffix != ".db":
                            raise HTTPException(status_code=400, detail="Unsafe legacy backup path")
                        payload = archive.read(relative.as_posix())
                        target = (data_dir / relative).resolve()
                        if data_dir.resolve() not in target.parents:
                            raise HTTPException(status_code=400, detail="Unsafe legacy backup target")
                        target.parent.mkdir(parents=True, exist_ok=True)
                        if target.name == "pos.db":
                            legacy_database = temp_backup_path.with_suffix(".db")
                            legacy_database.write_bytes(payload)
                            provider.restore_backup(engine, legacy_database)
                            legacy_database.unlink(missing_ok=True)
                        else:
                            target.write_bytes(payload)
                        restored_files.append(relative.as_posix())
            else:
                provider.restore_backup(engine, temp_backup_path)
            provider.health_check(engine)
            assert_journals_balanced(engine)
            return {
                "success": True,
                "message": "Backup restored successfully. Please restart the application.",
                "restored_files": restored_files,
                "backup_timestamp": now_pkt().isoformat(),
            }
        
        finally:
            # Clean up temporary file
            if temp_backup_path.exists():
                temp_backup_path.unlink()
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")


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
        for backup_file in backup_dir.glob("pos_backup_*"):
            if backup_file.is_file() and backup_file.suffix != ".json":
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
