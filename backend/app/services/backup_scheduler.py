"""
Automatic backup scheduler service
Runs daily backups at 12:00 PM if the system is running
"""
import os
import zipfile
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.core.timezone import now_pkt

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = None


def get_data_dir() -> Path:
    """Get the data directory path from environment"""
    data_dir = os.environ.get("DATA_DIR")
    if not data_dir:
        raise ValueError("DATA_DIR not configured")
    return Path(data_dir)


def find_all_db_files(data_dir: Path) -> List[Path]:
    """Recursively find all .db files in the data directory"""
    db_files = []
    for root, dirs, files in os.walk(data_dir):
        for file in files:
            if file.endswith('.db'):
                db_files.append(Path(root) / file)
    return db_files


def get_backup_dir() -> Path:
    """Get or create the backups directory"""
    data_dir = get_data_dir()
    backup_dir = data_dir.parent / "backups" / "auto"
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


async def create_automatic_backup():
    """
    Create an automatic backup of all database files
    This function runs asynchronously as a scheduled task
    """
    try:
        logger.info("🔄 Starting automatic backup...")
        
        data_dir = get_data_dir()
        backup_dir = get_backup_dir()
        
        # Find all database files
        db_files = find_all_db_files(data_dir)
        
        if not db_files:
            logger.warning("⚠️ No database files found for automatic backup")
            return
        
        # Create timestamped backup filename
        timestamp = now_pkt().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"auto_backup_{timestamp}.zip"
        backup_path = backup_dir / backup_filename
        
        # Create backup metadata
        backup_metadata = {
            "timestamp": now_pkt().isoformat(),
            "type": "automatic",
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
        
        # Clean up old automatic backups (keep last 7 days)
        cleanup_old_backups(backup_dir, days_to_keep=7)
        
        logger.info(f"✅ Automatic backup created successfully: {backup_filename}")
        logger.info(f"   Files backed up: {len(db_files)}")
        logger.info(f"   Total size: {backup_metadata['total_size'] / (1024*1024):.2f} MB")
        
    except Exception as e:
        logger.error(f"❌ Automatic backup failed: {str(e)}", exc_info=True)


def cleanup_old_backups(backup_dir: Path, days_to_keep: int = 7):
    """
    Remove automatic backups older than specified days
    """
    try:
        from datetime import timedelta
        cutoff_time = now_pkt() - timedelta(days=days_to_keep)
        
        deleted_count = 0
        for backup_file in backup_dir.glob("auto_backup_*.zip"):
            if backup_file.is_file():
                file_time = datetime.fromtimestamp(backup_file.stat().st_mtime)
                if file_time < cutoff_time:
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
            id='daily_backup',
            name='Daily Automatic Backup',
            replace_existing=True
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
        return {
            "running": False,
            "next_run": None
        }
    
    jobs = scheduler.get_jobs()
    if jobs:
        next_run = jobs[0].next_run_time
        return {
            "running": True,
            "next_run": next_run.isoformat() if next_run else None,
            "jobs": len(jobs)
        }
    
    return {
        "running": True,
        "next_run": None,
        "jobs": 0
    }
