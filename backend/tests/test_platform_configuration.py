from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path


IMPORT_ROOT = tempfile.TemporaryDirectory(prefix="vibepos-platform-import-")
os.environ.setdefault("DATA_DIR", str(Path(IMPORT_ROOT.name) / "data"))
os.environ.setdefault("LICENSE_ENFORCEMENT", "false")

from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints.app_config import _response
from app.api.v1.api import api_router
from app.applications.retail.manifest import RETAIL_MANIFEST
from app.db.base import Base
from app.db.migrations.registry import MIGRATIONS
from app.models.business_configuration import BusinessConfiguration
from app.models.sale import Sale
from app.platform.capabilities import require_capability, resolve_effective_configuration
from app.platform.compatibility import IncompatibleSharedPackageError, PackageRequirement
from app.platform.configuration import ProfileChangeError, change_business_profile
from app.platform.identifiers import (
    ApplicationId,
    CapabilityId,
    ProfileId,
    SharedPackageId,
)
from app.platform.licensing import (
    LicenseEntitlements,
    entitlements_from_payload,
    set_active_entitlements,
)
from app.platform.manifests import (
    ApplicationManifest,
    InvalidApplicationManifest,
    RouterRegistration,
    validate_manifest,
)
from tests.support.disposable_database import create_disposable_sqlite_engine


class PlatformConfigurationTests(unittest.TestCase):
    def setUp(self) -> None:
        set_active_entitlements(LicenseEntitlements())
        self.temp_directory, self.engine, _ = create_disposable_sqlite_engine()
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()

    def tearDown(self) -> None:
        set_active_entitlements(LicenseEntitlements())
        self.db.close()
        self.engine.dispose()
        self.temp_directory.cleanup()

    def test_existing_database_defaults_to_persistent_retail_profile(self) -> None:
        effective = resolve_effective_configuration(
            self.db, entitlements=LicenseEntitlements()
        )
        persisted = self.db.get(BusinessConfiguration, 1)
        self.assertIsNotNone(persisted)
        self.assertEqual(effective.application_id, ApplicationId.RETAIL)
        self.assertEqual(effective.profile_id, ProfileId.RETAIL)
        self.assertIn(CapabilityId.RETAIL_SALES, effective.enabled_capabilities)

    def test_app_config_contract_contains_branding_versions_and_capabilities(self) -> None:
        payload = _response(self.db)
        self.assertEqual(payload.application_id, ApplicationId.RETAIL)
        self.assertEqual(payload.profile_id, ProfileId.RETAIL)
        self.assertEqual(payload.schema_version, "3")
        self.assertIn("customer-identity", payload.shared_package_versions)
        self.assertIn(CapabilityId.RETAIL_SALES, payload.enabled_capabilities)
        self.assertEqual(payload.branding.name, "My Store")

    def test_disabled_module_capability_blocks_direct_endpoint_access(self) -> None:
        require_capability(CapabilityId.RETAIL_SALES)(db=self.db)
        with self.assertRaises(HTTPException) as raised:
            require_capability(CapabilityId.WORKSHOP_JOBS)(db=self.db)
        self.assertEqual(raised.exception.status_code, 403)

    def test_license_entitlements_can_reduce_retail_capabilities(self) -> None:
        effective = resolve_effective_configuration(
            self.db,
            entitlements=LicenseEntitlements(
                application_id=ApplicationId.RETAIL,
                profiles=frozenset({ProfileId.RETAIL}),
                capabilities=frozenset({CapabilityId.AUTHENTICATION}),
            ),
        )
        self.assertEqual(
            effective.enabled_capabilities, frozenset({CapabilityId.AUTHENTICATION})
        )

    def test_legacy_license_without_entitlements_keeps_retail_defaults(self) -> None:
        legacy = entitlements_from_payload({"approved": True, "disabled": False})
        effective = resolve_effective_configuration(self.db, entitlements=legacy)
        self.assertIsNone(legacy.capabilities)
        self.assertIn(CapabilityId.RETAIL_SALES, effective.enabled_capabilities)

    def test_license_blocks_unentitled_profile_change(self) -> None:
        set_active_entitlements(
            LicenseEntitlements(profiles=frozenset({ProfileId.RETAIL}))
        )
        with self.assertRaises(ProfileChangeError):
            change_business_profile(self.db, ProfileId.CLOTHING_RETAIL)

    def test_direct_profile_switch_is_blocked_after_transactions(self) -> None:
        resolve_effective_configuration(self.db, entitlements=LicenseEntitlements())
        self.db.add(Sale(total=1.0))
        self.db.commit()
        with self.assertRaises(ProfileChangeError):
            change_business_profile(self.db, ProfileId.CLOTHING_RETAIL)
        self.assertEqual(self.db.get(BusinessConfiguration, 1).profile_id, "retail")

    def test_profile_can_change_before_transactional_data_exists(self) -> None:
        changed = change_business_profile(self.db, ProfileId.CLOTHING_RETAIL)
        self.assertEqual(changed.profile_id, ProfileId.CLOTHING_RETAIL.value)

    def test_manifest_cannot_register_another_applications_router(self) -> None:
        foreign_router = APIRouter()
        invalid = ApplicationManifest(
            application_id=ApplicationId.RETAIL,
            application_name="Invalid",
            application_version="1.0.0",
            schema_version="1",
            default_profile=ProfileId.RETAIL,
            compatible_profiles=frozenset({ProfileId.RETAIL}),
            enabled_modules=frozenset(),
            capabilities=frozenset({CapabilityId.RETAIL_SALES}),
            routers=(
                RouterRegistration(
                    router=foreign_router,
                    prefix="/foreign",
                    tags=("foreign",),
                    capability=CapabilityId.RETAIL_SALES,
                    owner_application=ApplicationId.WORKSHOP,
                ),
            ),
            model_modules=(),
            migration_registry_module="app.db.migrations.registry",
            migration_ids=(),
            shared_package_requirements={},
        )
        with self.assertRaises(InvalidApplicationManifest):
            validate_manifest(invalid)

    def test_manifest_model_and_migration_inventory_is_complete(self) -> None:
        self.assertEqual(
            RETAIL_MANIFEST.migration_ids,
            tuple(migration.migration_id for migration in MIGRATIONS),
        )
        self.assertIn("business_configuration", Base.metadata.tables)
        self.assertIn("app.models.business_configuration", RETAIL_MANIFEST.model_modules)

    def test_manifest_registration_preserves_critical_retail_route_paths(self) -> None:
        operations = {
            (method.lower(), route.path)
            for route in api_router.routes
            for method in getattr(route, "methods", set())
        }
        self.assertTrue(
            {
                ("post", "/sales/"),
                ("post", "/purchases/"),
                ("post", "/returns/"),
                ("post", "/hold-sales/"),
                ("post", "/hold-purchases/"),
                ("get", "/products/"),
                ("get", "/customers/"),
                ("get", "/vendors/"),
                ("get", "/accounting/accounts"),
                ("get", "/settings/store"),
                ("get", "/app-config"),
            }
            <= operations
        )

    def test_incompatible_shared_package_fails_manifest_validation(self) -> None:
        invalid = ApplicationManifest(
            **{
                **RETAIL_MANIFEST.__dict__,
                "shared_package_requirements": {
                    SharedPackageId.PAYMENTS: PackageRequirement("2.0.0", "3.0.0")
                },
            }
        )
        with self.assertRaises(IncompatibleSharedPackageError):
            validate_manifest(invalid)


if __name__ == "__main__":
    unittest.main()
