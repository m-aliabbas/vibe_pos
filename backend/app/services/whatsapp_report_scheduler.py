"""Schedule previous-day WhatsApp reports while the POS backend is running."""

import logging
from datetime import datetime, time, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.timezone import now_pkt
from app.db.session import SessionLocal
from app.models.settings import StoreSettings
from app.services.whatsapp_reports import (
    create_sales_report_pdf,
    normalize_whatsapp_number,
)


logger = logging.getLogger(__name__)
scheduler = None


def send_pending_daily_report() -> None:
    """Send one PDF covering every completed day not yet successfully delivered."""
    from app.api.v1.endpoints.whatsapp import (
        queue_report_document,
        whatsapp_is_connected,
    )

    if not whatsapp_is_connected():
        return

    with SessionLocal() as db:
        row = db.query(StoreSettings).filter(StoreSettings.id == 1).first()
        if not row or not row.whatsapp_daily_report_enabled:
            return

        owner_number = normalize_whatsapp_number(row.whatsapp_owner_number)
        if not owner_number:
            return

        try:
            configured_time = time.fromisoformat(row.whatsapp_daily_report_time or "09:00")
        except ValueError:
            configured_time = time(hour=9)

        current = now_pkt()
        if current.time() < configured_time:
            return

        report_end = current.date() - timedelta(days=1)
        report_start = (
            row.whatsapp_last_daily_report_date + timedelta(days=1)
            if row.whatsapp_last_daily_report_date
            else report_end
        )
        if report_start > report_end:
            return

        path = create_sales_report_pdf(db, report_start, report_end)
        if report_start == report_end:
            caption = f"Automatic previous-day report - {report_end:%d %b %Y}"
        else:
            caption = (
                "Automatic catch-up report - "
                f"{report_start:%d %b %Y} to {report_end:%d %b %Y}"
            )
        queue_report_document(
            owner_number,
            path,
            caption,
            daily_report_end_date=report_end,
        )
        logger.info(
            "Queued automatic WhatsApp report for %s through %s",
            report_start,
            report_end,
        )


def start_scheduler() -> None:
    global scheduler
    if scheduler is not None:
        logger.warning("WhatsApp report scheduler already running")
        return

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        send_pending_daily_report,
        trigger=IntervalTrigger(minutes=2),
        id="whatsapp_daily_report",
        name="WhatsApp Previous-Day Report",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(),
    )
    scheduler.start()
    logger.info("WhatsApp report scheduler started")


def stop_scheduler() -> None:
    global scheduler
    if scheduler is not None:
        scheduler.shutdown()
        scheduler = None
        logger.info("WhatsApp report scheduler stopped")
