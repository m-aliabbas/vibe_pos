from fastapi import APIRouter

from app.api.v1.endpoints import app_config
from app.platform.manifests import get_active_manifest, register_manifest_routers

api_router = APIRouter()
api_router.include_router(app_config.router, prefix="/app-config", tags=["app-config"])
register_manifest_routers(api_router, get_active_manifest())
