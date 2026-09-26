from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.platform.configuration import get_business_configuration
from app.platform.identifiers import ApplicationId, CapabilityId, ModuleId, ProfileId
from app.platform.licensing import LicenseEntitlements, get_active_entitlements
from app.platform.manifests import ApplicationManifest, get_active_manifest
from app.platform.profiles import get_profile


@dataclass(frozen=True)
class EffectiveApplicationConfiguration:
    application_id: ApplicationId
    profile_id: ProfileId
    enabled_modules: frozenset[ModuleId]
    enabled_capabilities: frozenset[CapabilityId]


def resolve_effective_configuration(
    db: Session,
    *,
    manifest: ApplicationManifest | None = None,
    entitlements: LicenseEntitlements | None = None,
) -> EffectiveApplicationConfiguration:
    active_manifest = manifest or get_active_manifest()
    active_entitlements = entitlements or get_active_entitlements()
    persisted = get_business_configuration(db, active_manifest)
    profile = get_profile(persisted.profile_id)

    if active_entitlements.application_id not in (None, active_manifest.application_id):
        enabled_capabilities: frozenset[CapabilityId] = frozenset()
    elif active_entitlements.profiles is not None and profile.profile_id not in active_entitlements.profiles:
        enabled_capabilities = frozenset()
    else:
        enabled_capabilities = active_manifest.capabilities & profile.capabilities
        if active_entitlements.capabilities is not None:
            enabled_capabilities &= active_entitlements.capabilities

    enabled_modules = persisted.enabled_modules & active_manifest.enabled_modules
    if active_entitlements.modules is not None:
        enabled_modules &= active_entitlements.modules

    return EffectiveApplicationConfiguration(
        application_id=active_manifest.application_id,
        profile_id=profile.profile_id,
        enabled_modules=enabled_modules,
        enabled_capabilities=enabled_capabilities,
    )


def require_capability(capability: CapabilityId):
    def dependency(db: Session = Depends(deps.get_db)) -> None:
        effective = resolve_effective_configuration(db)
        if capability not in effective.enabled_capabilities:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Capability is disabled: {capability.value}",
            )

    return dependency
