from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.api import api_router
from app.db.session import engine, Base, provider
from app.db.bootstrap import bootstrap_database
from app.platform.manifests import get_active_manifest, load_manifest_models
from app.platform.identifiers import CapabilityId
from app.services.license import check_license_or_exit, LicenseError

# Import backup scheduler
from app.services import backup_scheduler

# Direct uvicorn development startup and the packaged launcher use the same
# ordered, fail-closed migration path. The second call is an idempotent no-op.
active_manifest = get_active_manifest()
load_manifest_models(active_manifest)
bootstrap_database(
    provider,
    engine,
    Base.metadata,
    application_version=active_manifest.application_version,
)

app = FastAPI(
    title=active_manifest.application_name,
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

    if CapabilityId.MESSAGING in active_manifest.capabilities:
        from app.api.v1.endpoints.whatsapp import init_whatsapp

        print("Initializing WhatsApp client...")
        init_whatsapp()
        print("WhatsApp client initialized")
    
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
