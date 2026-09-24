from sqlalchemy import Boolean, Column, Date, Integer, String
from app.db.session import Base


class StoreSettings(Base):
    __tablename__ = "store_settings"

    id = Column(Integer, primary_key=True, default=1)
    store_name = Column(String, default="My Store")
    store_address = Column(String, default="")
    store_phone = Column(String, default="")
    store_email = Column(String, default="")
    store_city = Column(String, default="")
    store_tax_id = Column(String, default="")
    store_website = Column(String, default="")

    # Private WhatsApp owner/report settings. These fields are exposed only by
    # the admin-only /settings/whatsapp-reports endpoints.
    whatsapp_owner_number = Column(String, default="")
    whatsapp_daily_report_enabled = Column(Boolean, default=False)
    whatsapp_daily_report_time = Column(String, default="09:00")
    whatsapp_last_daily_report_date = Column(Date, nullable=True)
