from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.api import api_router
from app.db.session import engine, Base

# Import WhatsApp client initializer
from app.api.v1.endpoints.whatsapp import init_whatsapp

# Create tables (for simplicity in MVP, usually handled by Alembic)
Base.metadata.create_all(bind=engine)

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
    """Initialize WhatsApp client on application startup"""
    print("🚀 Initializing WhatsApp client...")
    init_whatsapp()
    print("✅ WhatsApp client initialized")

@app.get("/")
def root():
    return {"message": "Welcome to POS System API"}
