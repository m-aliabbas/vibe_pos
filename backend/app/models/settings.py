from sqlalchemy import Boolean, Column, Date, Integer, String, Text
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

    # Invoice branding and document preferences. The logo itself lives under
    # DATA_DIR/branding; only its safe basename is persisted in SQLite.
    store_logo_filename = Column(String, nullable=True)
    default_print_format = Column(String, default="compact")
    default_whatsapp_format = Column(String, default="mobile")
    default_print_design = Column(String, default="classic")
    default_whatsapp_design = Column(String, default="modern")
    invoice_show_tax_id = Column(Boolean, default=True)
    invoice_show_cashier = Column(Boolean, default=True)
    invoice_show_sku = Column(Boolean, default=False)
    invoice_show_customer_balance = Column(Boolean, default=True)
    invoice_footer_message = Column(String, default="Thank you for your business!")
    invoice_terms = Column(Text, default="Return and exchange accepted with invoice.")

    # Private WhatsApp owner/report settings. These fields are exposed only by
    # the admin-only /settings/whatsapp-reports endpoints.
    whatsapp_owner_number = Column(String, default="")
    whatsapp_daily_report_enabled = Column(Boolean, default=False)
    whatsapp_daily_report_time = Column(String, default="09:00")
    whatsapp_last_daily_report_date = Column(Date, nullable=True)

    # When enabled, users must open a cash drawer session (declare starting
    # cash) before selling and close it out (declare counted cash) later.
    cash_register_enabled = Column(Boolean, default=False)
