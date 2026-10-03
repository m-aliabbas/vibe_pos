"""Automatic local and Google Drive database backups."""

import asyncio
import logging
from pathlib import Path
from time import time

from app.core.config import settings
from app.db.session import engine, provider
from app.services import google_drive_backup
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
scheduler = None


def get_backup_dir() -> Path:
    """Get or create the automatic-backup directory."""
    data_dir = Path(settings.DATA_DIR).resolve()
    backup_dir = data_dir.parent / "backups" / "auto"
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def _create_automatic_backup_sync() -> None:
    """Create a native provider backup and upload it when Drive is connected."""
    try:
        logger.info("Starting automatic backup")
        backup_dir = get_backup_dir()
        backup_path = provider.create_backup(engine, backup_dir, "auto_backup")
        cleanup_old_backups(backup_dir, days_to_keep=7)
        logger.info(
            "Automatic %s backup created: %s", provider.name, backup_path.name
        )

        if google_drive_backup.get_status()["connected"]:
            try:
                uploaded = google_drive_backup.upload_backup(backup_path)
                logger.info(
                    "Automatic backup uploaded to Google Drive: %s",
                    uploaded["filename"],
                )
            except google_drive_backup.GoogleDriveBackupError as exc:
                logger.error("Google Drive automatic backup failed: %s", exc)
        else:
            logger.info(
                "Google Drive is not connected; automatic backup was kept locally"
            )
    except Exception as exc:
        logger.error("Automatic backup failed: %s", exc, exc_info=True)


async def create_automatic_backup() -> None:
    """Run database snapshot and Drive I/O outside the FastAPI event loop."""
    await asyncio.to_thread(_create_automatic_backup_sync)


def cleanup_old_backups(backup_dir: Path, days_to_keep: int = 7) -> None:
    """Remove automatic backups older than the configured retention window."""
    try:
        cutoff_time = time() - (days_to_keep * 24 * 60 * 60)
        deleted_count = 0
        for backup_file in backup_dir.glob("auto_backup_*"):
            if backup_file.is_file() and backup_file.stat().st_mtime < cutoff_time:
                backup_file.unlink()
                backup_file.with_suffix(".json").unlink(missing_ok=True)
                deleted_count += 1
                logger.info("Deleted old backup: %s", backup_file.name)
        if deleted_count:
            logger.info("Cleaned up %s old automatic backup(s)", deleted_count)
    except Exception as exc:
        logger.error("Failed to clean up old backups: %s", exc)


def start_scheduler() -> None:
    """Start the daily noon backup schedule."""
    global scheduler
    if scheduler is not None:
        logger.warning("Scheduler already running")
        return

    try:
        scheduler = AsyncIOScheduler()
        scheduler.add_job(
            create_automatic_backup,
            trigger=CronTrigger(hour=12, minute=0),
            id="daily_backup",
            name="Daily Automatic Backup",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("Automatic backup scheduler started; daily run is at 12:00 PM")
    except Exception as exc:
        logger.error("Failed to start backup scheduler: %s", exc, exc_info=True)


def stop_scheduler() -> None:
    """Stop the automatic backup scheduler."""
    global scheduler
    if scheduler is not None:
        scheduler.shutdown()
        scheduler = None
        logger.info("Automatic backup scheduler stopped")


def get_scheduler_status() -> dict[str, object]:
    if scheduler is None:
        return {"running": False, "next_run": None}

    jobs = scheduler.get_jobs()
    if jobs:
        next_run = jobs[0].next_run_time
        return {
            "running": True,
            "next_run": next_run.isoformat() if next_run else None,
            "jobs": len(jobs),
        }
    return {"running": True, "next_run": None, "jobs": 0}
