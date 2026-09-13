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

# Create tables (for simplicity in MVP, usually handled by Alembic)
Base.metadata.create_all(bind=engine)


def ensure_schema_columns() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    with engine.begin() as conn:
        additions = {
            "products": [("allow_decimal_qty", "BOOLEAN DEFAULT 0")],
            "sales": [("previous_balance", "REAL DEFAULT 0")],
            "customer_notes": [
                ("amount", "REAL"),
                ("payment_method", "VARCHAR"),
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

@app.on_event("shutdown")
async def shutdown_event():
    """Stop backup scheduler on application shutdown"""
    print("🛑 Stopping backup scheduler...")
    backup_scheduler.stop_scheduler()
    print("✅ Backup scheduler stopped")

@app.get("/")
def root():
    return {"message": "Welcome to VibePOS API"}
