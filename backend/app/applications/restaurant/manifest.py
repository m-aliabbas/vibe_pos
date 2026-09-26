from __future__ import annotations

from app.api.v1.endpoints import auth, backup, settings, users
from app.db.migrations.registry import MIGRATIONS
from app.platform.compatibility import PackageRequirement
from app.platform.identifiers import (
    ApplicationId,
    CapabilityId,
    ProfileId,
    SharedPackageId,
)
from app.platform.manifests import ApplicationManifest, RouterRegistration
from app.platform.profiles import RESTAURANT_PROFILE_CAPABILITIES


def _platform_route(module, prefix: str, tag: str, capability: CapabilityId):
    return RouterRegistration(
        router=module.router,
        prefix=prefix,
        tags=(tag,),
        capability=capability,
        owner_application=None,
    )


MANIFEST = ApplicationManifest(
    application_id=ApplicationId.RESTAURANT,
    application_name="Vibe Restaurant",
    application_version="1.0.20",
    schema_version="5",
    default_profile=ProfileId.RESTAURANT,
    compatible_profiles=frozenset({ProfileId.RESTAURANT}),
    enabled_modules=frozenset(),
    capabilities=RESTAURANT_PROFILE_CAPABILITIES,
    routers=(
        _platform_route(auth, "/auth", "auth", CapabilityId.AUTHENTICATION),
        _platform_route(users, "/users", "users", CapabilityId.USERS),
        _platform_route(settings, "/settings", "settings", CapabilityId.STORE_CONFIGURATION),
        _platform_route(backup, "/backup", "backup", CapabilityId.BACKUP),
    ),
    model_modules=(
        "app.models.user",
        "app.models.settings",
        "app.models.business_configuration",
    ),
    migration_registry_module="app.db.migrations.registry",
    migration_ids=tuple(migration.migration_id for migration in MIGRATIONS),
    shared_package_requirements={
        package_id: PackageRequirement("1.0.0", "2.0.0")
        for package_id in SharedPackageId
    },
)