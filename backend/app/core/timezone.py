from datetime import datetime, timezone, timedelta

# Pakistan Standard Time (GMT+5)
PKT = timezone(timedelta(hours=5))


def now_pkt() -> datetime:
    """Return current naive datetime in Pakistan Standard Time (GMT+5)."""
    return datetime.now(PKT).replace(tzinfo=None)
