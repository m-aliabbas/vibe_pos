from __future__ import annotations

from app.api.v1.endpoints import auth, backup, settings, users, workshop
from app.db.migrations.registry import MIGRATIONS
from app.platform.compatibility import PackageRequirement
from app.platform.identifiers import (
    ApplicationId,
    CapabilityId,
    ProfileId,
    SharedPackageId,
)
from app.platform.manifests import ApplicationManifest, RouterRegistration
from app.platform.profiles import WORKSHOP_PROFILE_CAPABILITIES


def _platform_route(module, prefix: str, tag: str, capability: CapabilityId):
    return RouterRegistration(
        router=module.router,
        prefix=prefix,
        tags=(tag,),
        capability=capability,
        owner_application=None,
    )


MANIFEST = ApplicationManifest(
    application_id=ApplicationId.WORKSHOP,
    application_name="Vibe Workshop",
    application_version="1.0.20",
    schema_version="5",
    default_profile=ProfileId.WORKSHOP,
    compatible_profiles=frozenset({ProfileId.WORKSHOP}),
    enabled_modules=frozenset(),
    capabilities=WORKSHOP_PROFILE_CAPABILITIES,
    routers=(
        _platform_route(auth, "/auth", "auth", CapabilityId.AUTHENTICATION),
        _platform_route(users, "/users", "users", CapabilityId.USERS),
        _platform_route(settings, "/settings", "settings", CapabilityId.STORE_CONFIGURATION),
        _platform_route(backup, "/backup", "backup", CapabilityId.BACKUP),
        RouterRegistration(
            router=workshop.router,
            prefix="/workshop",
            tags=("workshop",),
            capability=CapabilityId.WORKSHOP_JOBS,
            owner_application=ApplicationId.WORKSHOP,
        ),
    ),
    model_modules=(
        "app.models.user",
        "app.models.settings",
        "app.models.business_configuration",
        "app.models.workshop",
    ),
    migration_registry_module="app.db.migrations.registry",
    migration_ids=tuple(migration.migration_id for migration in MIGRATIONS),
    shared_package_requirements={
        package_id: PackageRequirement("1.0.0", "2.0.0")
        for package_id in SharedPackageId
    },
)