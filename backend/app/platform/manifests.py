from __future__ import annotations

from dataclasses import dataclass
import importlib
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends

from app.platform.compatibility import PackageRequirement, validate_package_requirements
from app.platform.identifiers import (
    ApplicationId,
    CapabilityId,
    ModuleId,
    ProfileId,
    SharedPackageId,
)

if TYPE_CHECKING:
    from fastapi.routing import APIRouter as TypedRouter


@dataclass(frozen=True)
class RouterRegistration:
    router: "TypedRouter"
    prefix: str
    tags: tuple[str, ...]
    capability: CapabilityId
    owner_application: ApplicationId | None


@dataclass(frozen=True)
class ApplicationManifest:
    application_id: ApplicationId
    application_name: str
    application_version: str
    schema_version: str
    default_profile: ProfileId
    compatible_profiles: frozenset[ProfileId]
    enabled_modules: frozenset[ModuleId]
    capabilities: frozenset[CapabilityId]
    routers: tuple[RouterRegistration, ...]
    model_modules: tuple[str, ...]
    migration_registry_module: str
    migration_ids: tuple[str, ...]
    shared_package_requirements: dict[SharedPackageId, PackageRequirement]


class InvalidApplicationManifest(RuntimeError):
    pass


def validate_manifest(manifest: ApplicationManifest) -> None:
    if manifest.default_profile not in manifest.compatible_profiles:
        raise InvalidApplicationManifest("Default profile is not compatible with application")
    for registration in manifest.routers:
        if (
            registration.owner_application is not None
            and registration.owner_application != manifest.application_id
        ):
            raise InvalidApplicationManifest(
                f"{manifest.application_id.value} cannot register a router owned by "
                f"{registration.owner_application.value}"
            )
        if registration.capability not in manifest.capabilities:
            raise InvalidApplicationManifest(
                f"Router capability is not declared: {registration.capability.value}"
            )
    validate_package_requirements(manifest.shared_package_requirements)
    registry = importlib.import_module(manifest.migration_registry_module)
    registered_migrations = tuple(item.migration_id for item in registry.MIGRATIONS)
    if manifest.migration_ids != registered_migrations:
        raise InvalidApplicationManifest(
            "Manifest migration inventory does not match the application registry"
        )


def load_manifest_models(manifest: ApplicationManifest) -> None:
    for module_name in manifest.model_modules:
        importlib.import_module(module_name)


def register_manifest_routers(target: APIRouter, manifest: ApplicationManifest) -> None:
    from app.platform.capabilities import require_capability

    validate_manifest(manifest)
    for registration in manifest.routers:
        target.include_router(
            registration.router,
            prefix=registration.prefix,
            tags=list(registration.tags),
            dependencies=[Depends(require_capability(registration.capability))],
        )


def get_active_manifest() -> ApplicationManifest:
    from app.core.config import settings

    manifests = {
        ApplicationId.RETAIL: "app.applications.retail.manifest",
        ApplicationId.WORKSHOP: "app.applications.workshop.manifest",
        ApplicationId.RESTAURANT: "app.applications.restaurant.manifest",
    }
    try:
        application_id = ApplicationId(settings.APPLICATION_ID)
    except ValueError as exc:
        raise InvalidApplicationManifest(
            f"Unsupported application ID: {settings.APPLICATION_ID!r}"
        ) from exc

    try:
        module = importlib.import_module(manifests[application_id])
        manifest = module.MANIFEST
    except (KeyError, AttributeError, ImportError) as exc:
        raise InvalidApplicationManifest(
            f"Application manifest is not packaged: {application_id.value!r}"
        ) from exc

    validate_manifest(manifest)
    return manifest
