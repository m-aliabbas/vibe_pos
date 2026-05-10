from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.core.config import settings
from app.api.v1.api import api_router
from app.db.session import engine, Base
from app.services.license import check_license_or_exit, LicenseError

# Import WhatsApp client initializer
from app.api.v1.endpoints.whatsapp import init_whatsapp

# Import backup scheduler
from app.services import backup_scheduler

# Create tables (for simplicity in MVP, usually handled by Alembic)
Base.metadata.create_all(bind=engine)


def ensure_schema_columns() -> None:
    inspector = inspect(engine)
    if "products" not in inspector.get_table_names():
        return

    product_columns = {col["name"] for col in inspector.get_columns("products")}
    if "allow_decimal_qty" in product_columns:
        return

    with engine.begin() as conn:
        if conn.dialect.name == "sqlite":
            conn.exec_driver_sql(
                "ALTER TABLE products ADD COLUMN allow_decimal_qty BOOLEAN DEFAULT 0"
            )
        else:
            conn.execute(
                text(
                    "ALTER TABLE products "
                    "ADD COLUMN IF NOT EXISTS allow_decimal_qty BOOLEAN DEFAULT FALSE"
                )
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
    
    if "sqlite" in settings.db_url:
        print("🚀 Starting automatic backup scheduler...")
        backup_scheduler.start_scheduler()
        print("✅ Backup scheduler started")
    else:
        print("ℹ️ PostgreSQL detected — SQLite backup scheduler skipped")

@app.on_event("shutdown")
async def shutdown_event():
    """Stop backup scheduler on application shutdown"""
    if "sqlite" in settings.db_url:
        print("🛑 Stopping backup scheduler...")
        backup_scheduler.stop_scheduler()
        print("✅ Backup scheduler stopped")

@app.get("/")
def root():
    return {"message": "Welcome to VibePOS API"}
