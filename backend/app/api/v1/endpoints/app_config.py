from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.api.v1.endpoints.settings import get_or_create_store_settings
from app.models.user import User
from app.platform.capabilities import resolve_effective_configuration
from app.platform.compatibility import PLATFORM_SHARED_PACKAGE_VERSIONS
from app.platform.manifests import get_active_manifest
from app.schemas.app_config import AppBranding, AppConfigResponse, ProfileChangeRequest


router = APIRouter()


def _response(db: Session) -> AppConfigResponse:
    manifest = get_active_manifest()
    effective = resolve_effective_configuration(db, manifest=manifest)
    store = get_or_create_store_settings(db)
    return AppConfigResponse(
        application_id=effective.application_id,
        application_name=manifest.application_name,
        application_version=manifest.application_version,
        schema_version=manifest.schema_version,
        profile_id=effective.profile_id,
        enabled_modules=sorted(effective.enabled_modules, key=lambda item: item.value),
        enabled_capabilities=sorted(
            effective.enabled_capabilities, key=lambda item: item.value
        ),
        shared_package_versions={
            package_id.value: version
            for package_id, version in PLATFORM_SHARED_PACKAGE_VERSIONS.items()
        },
        branding=AppBranding(
            name=store.store_name or "",
            address=store.store_address or "",
            phone=store.store_phone or "",
            email=store.store_email or "",
            city=store.store_city or "",
            tax_id=store.store_tax_id or "",
            website=store.store_website or "",
        ),
        bootstrap_required=(
            manifest.application_id.value != "retail"
            and db.query(User.id).first() is None
        ),
    )


@router.get("", response_model=AppConfigResponse)
def get_app_config(db: Session = Depends(deps.get_db)):
    return _response(db)


@router.put("/profile", response_model=AppConfigResponse)
def update_profile(
    payload: ProfileChangeRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    if get_active_manifest().application_id.value != "retail":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Independent applications do not support business-profile switching",
        )

    from app.platform.configuration import ProfileChangeError, change_business_profile

    try:
        change_business_profile(db, payload.profile_id)
    except ProfileChangeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return _response(db)
