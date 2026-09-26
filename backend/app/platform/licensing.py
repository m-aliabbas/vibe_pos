from __future__ import annotations

from dataclasses import dataclass
from threading import RLock
from typing import Any

from app.platform.identifiers import ApplicationId, CapabilityId, ModuleId, ProfileId


@dataclass(frozen=True)
class LicenseEntitlements:
    application_id: ApplicationId | None = None
    profiles: frozenset[ProfileId] | None = None
    modules: frozenset[ModuleId] | None = None
    capabilities: frozenset[CapabilityId] | None = None


_lock = RLock()
_active_entitlements = LicenseEntitlements()


def _optional_ids(enum_type, value: Any):
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValueError("License entitlement lists must be arrays")
    return frozenset(enum_type(item) for item in value)


def entitlements_from_payload(payload: dict[str, Any] | None) -> LicenseEntitlements:
    data = payload or {}
    application = data.get("application_id")
    return LicenseEntitlements(
        application_id=ApplicationId(application) if application else None,
        profiles=_optional_ids(ProfileId, data.get("profiles")),
        modules=_optional_ids(ModuleId, data.get("modules")),
        capabilities=_optional_ids(CapabilityId, data.get("capabilities")),
    )


def set_active_entitlements(entitlements: LicenseEntitlements) -> None:
    global _active_entitlements
    with _lock:
        _active_entitlements = entitlements


def get_active_entitlements() -> LicenseEntitlements:
    with _lock:
        return _active_entitlements
