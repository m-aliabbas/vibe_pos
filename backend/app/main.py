from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect
from app.core.config import settings
from app.api.v1.api import api_router
from app.db.session import engine, Base
from app.services.license import check_license_or_exit, LicenseError

# Import WhatsApp client initializer
from app.api.v1.endpoints.whatsapp import init_whatsapp

# Import backup scheduler
from app.services import backup_scheduler
from app.services import whatsapp_report_scheduler

# Create tables (for simplicity in MVP, usually handled by Alembic)
Base.metadata.create_all(bind=engine)


def ensure_schema_columns() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    with engine.begin() as conn:
        additions = {
            "products": [
                ("allow_decimal_qty", "BOOLEAN DEFAULT 0"),
                ("company", "VARCHAR"),
            ],
            "purchases": [
                ("subtotal_amount", "REAL DEFAULT 0"),
                ("discount", "REAL DEFAULT 0"),
            ],
            "sales": [("previous_balance", "REAL DEFAULT 0")],
            "customer_notes": [
                ("amount", "REAL"),
                ("payment_method", "VARCHAR"),
            ],
            "store_settings": [
                ("whatsapp_owner_number", "VARCHAR DEFAULT ''"),
                ("whatsapp_daily_report_enabled", "BOOLEAN DEFAULT 0"),
                ("whatsapp_daily_report_time", "VARCHAR DEFAULT '09:00'"),
                ("whatsapp_last_daily_report_date", "DATE"),
                ("store_logo_filename", "VARCHAR"),
                ("default_print_format", "VARCHAR DEFAULT 'compact'"),
                ("default_whatsapp_format", "VARCHAR DEFAULT 'mobile'"),
                ("default_print_design", "VARCHAR DEFAULT 'classic'"),
                ("default_whatsapp_design", "VARCHAR DEFAULT 'modern'"),
                ("invoice_show_tax_id", "BOOLEAN DEFAULT 1"),
                ("invoice_show_cashier", "BOOLEAN DEFAULT 1"),
                ("invoice_show_sku", "BOOLEAN DEFAULT 0"),
                ("invoice_show_customer_balance", "BOOLEAN DEFAULT 1"),
                ("invoice_footer_message", "VARCHAR DEFAULT 'Thank you for your business!'"),
                ("invoice_terms", "TEXT DEFAULT 'Return and exchange accepted with invoice.'"),
            ],
        }
        for table, columns in additions.items():
            if table not in table_names:
                continue
            existing = {col["name"] for col in inspector.get_columns(table)}
            for column, definition in columns:
                if column not in existing:
                    conn.exec_driver_sql(
                        f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
                    )
        if "purchases" in table_names:
            conn.exec_driver_sql(
                "UPDATE purchases "
                "SET subtotal_amount = total_amount "
                "WHERE subtotal_amount IS NULL "
                "OR (subtotal_amount = 0 AND COALESCE(total_amount, 0) != 0)"
            )
            conn.exec_driver_sql(
                "UPDATE purchases SET discount = 0 WHERE discount IS NULL"
            )
        if "products" in table_names:
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_products_company ON products (company)"
            )


ensure_schema_columns()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS
origins = [
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.on_event("startup")
async def startup_event():
    """Initialize WhatsApp client and backup scheduler on application startup"""
    try:
        fingerprint = check_license_or_exit()
        print(f"✅ License approved for device: {fingerprint}")
    except LicenseError as exc:
        print(f"❌ License check failed: {exc}")
        raise RuntimeError("License check failed") from exc

    print("🚀 Initializing WhatsApp client...")
    init_whatsapp()
    print("✅ WhatsApp client initialized")
    
    print("🚀 Starting automatic backup scheduler...")
    backup_scheduler.start_scheduler()
    print("✅ Backup scheduler started")

    print("🚀 Starting WhatsApp report scheduler...")
    whatsapp_report_scheduler.start_scheduler()
    print("✅ WhatsApp report scheduler started")

@app.on_event("shutdown")
async def shutdown_event():
    """Stop background schedulers on application shutdown."""
    print("🛑 Stopping WhatsApp report scheduler...")
    whatsapp_report_scheduler.stop_scheduler()
    print("✅ WhatsApp report scheduler stopped")

    print("🛑 Stopping backup scheduler...")
    backup_scheduler.stop_scheduler()
    print("✅ Backup scheduler stopped")

@app.get("/")
def root():
    return {"message": "Welcome to VibePOS API"}
