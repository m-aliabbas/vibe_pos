"""
Automatic backup scheduler service
Runs daily backups at 12:00 PM if the system is running
"""

import asyncio
import logging
from pathlib import Path
from time import time

from app.core.config import settings
from app.services import google_drive_backup
from app.services.backup_archive import create_database_backup
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = None


def get_data_dir() -> Path:
    """Get the configured application data directory."""
    return Path(settings.DATA_DIR)


def get_backup_dir() -> Path:
    """Get or create the backups directory"""
    data_dir = get_data_dir()
    backup_dir = data_dir.parent / "backups" / "auto"
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def _create_automatic_backup_sync() -> None:
    """
    Create an automatic backup of pos.db and upload it to Google Drive when connected.
    This function runs asynchronously as a scheduled task
    """
    try:
        logger.info("🔄 Starting automatic backup...")

        data_dir = get_data_dir()
        backup_dir = get_backup_dir()

        try:
            backup = create_database_backup(
                data_dir,
                backup_dir,
                filename_prefix="auto_backup",
            )
        except FileNotFoundError:
            logger.warning("⚠️ No database files found for automatic backup")
            return

        # Clean up old automatic backups (keep last 7 days)
        cleanup_old_backups(backup_dir, days_to_keep=7)

        logger.info(f"✅ Automatic backup created successfully: {backup.filename}")
        logger.info("   Files backed up: 1 (pos.db)")
        logger.info(f"   Total size: {backup.total_size / (1024 * 1024):.2f} MB")

        if google_drive_backup.get_status()["connected"]:
            try:
                uploaded = google_drive_backup.upload_backup(backup.path)
                logger.info(
                    "☁️ Automatic backup uploaded to Google Drive: %s",
                    uploaded["filename"],
                )
            except google_drive_backup.GoogleDriveBackupError as exc:
                logger.error("Google Drive automatic backup failed: %s", exc)
        else:
            logger.warning(
                "Google Drive is not connected; automatic backup was kept locally"
            )

    except Exception as e:
        logger.error(f"❌ Automatic backup failed: {str(e)}", exc_info=True)


async def create_automatic_backup():
    """Run snapshot and Drive I/O without blocking the FastAPI event loop."""
    await asyncio.to_thread(_create_automatic_backup_sync)


def cleanup_old_backups(backup_dir: Path, days_to_keep: int = 7):
    """
    Remove automatic backups older than specified days
    """
    try:
        cutoff_time = time() - (days_to_keep * 24 * 60 * 60)

        deleted_count = 0
        for backup_file in backup_dir.glob("auto_backup_*.db"):
            if backup_file.is_file():
                if backup_file.stat().st_mtime < cutoff_time:
                    backup_file.unlink()
                    deleted_count += 1
                    logger.info(f"🗑️ Deleted old backup: {backup_file.name}")

        if deleted_count > 0:
            logger.info(f"🧹 Cleaned up {deleted_count} old automatic backup(s)")
    except Exception as e:
        logger.error(f"⚠️ Failed to cleanup old backups: {str(e)}")


def start_scheduler():
    """
    Start the automatic backup scheduler
    Schedules daily backup at 12:00 PM
    """
    global scheduler

    if scheduler is not None:
        logger.warning("Scheduler already running")
        return

    try:
        # Create async scheduler
        scheduler = AsyncIOScheduler()

        # Schedule daily backup at 12:00 PM
        scheduler.add_job(
            create_automatic_backup,
            trigger=CronTrigger(hour=12, minute=0),
            id="daily_backup",
            name="Daily Automatic Backup",
            replace_existing=True,
        )

        # Start the scheduler
        scheduler.start()

        logger.info("✅ Automatic backup scheduler started")
        logger.info("📅 Daily backups will run at 12:00 PM")

    except Exception as e:
        logger.error(f"❌ Failed to start scheduler: {str(e)}", exc_info=True)


def stop_scheduler():
    """
    Stop the automatic backup scheduler
    """
    global scheduler

    if scheduler is not None:
        scheduler.shutdown()
        scheduler = None
        logger.info("🛑 Automatic backup scheduler stopped")


def get_scheduler_status():
    """
    Get the current status of the scheduler
    """
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
