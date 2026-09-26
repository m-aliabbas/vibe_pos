from __future__ import annotations

from app.api.v1.endpoints import (
    accounting,
    auth,
    backup,
    customers,
    files,
    hold_purchases,
    hold_sales,
    products,
    purchases,
    reports,
    returns,
    sales,
    settings,
    stock_audit,
    users,
    vendors,
    whatsapp,
)
from app.platform.compatibility import PackageRequirement
from app.platform.identifiers import (
    ApplicationId,
    CapabilityId,
    ProfileId,
    SharedPackageId,
)
from app.platform.manifests import ApplicationManifest, RouterRegistration
from app.platform.profiles import RETAIL_PROFILE_CAPABILITIES


def _route(module, prefix: str, tag: str, capability: CapabilityId) -> RouterRegistration:
    return RouterRegistration(
        router=module.router,
        prefix=prefix,
        tags=(tag,),
        capability=capability,
        owner_application=ApplicationId.RETAIL,
    )


RETAIL_MANIFEST = ApplicationManifest(
    application_id=ApplicationId.RETAIL,
    application_name="VibePOS Retail",
    application_version="1.0.20",
    schema_version="3",
    default_profile=ProfileId.RETAIL,
    compatible_profiles=frozenset(
        {ProfileId.RETAIL, ProfileId.CLOTHING_RETAIL, ProfileId.MILK_COUNTER_RETAIL}
    ),
    enabled_modules=frozenset(),
    capabilities=RETAIL_PROFILE_CAPABILITIES,
    routers=(
        _route(auth, "/auth", "auth", CapabilityId.AUTHENTICATION),
        _route(users, "/users", "users", CapabilityId.USERS),
        _route(customers, "/customers", "customers", CapabilityId.CUSTOMER_IDENTITY),
        _route(vendors, "/vendors", "vendors", CapabilityId.RETAIL_PURCHASING),
        _route(products, "/products", "products", CapabilityId.RETAIL_CATALOG),
        _route(purchases, "/purchases", "purchases", CapabilityId.RETAIL_PURCHASING),
        _route(sales, "/sales", "sales", CapabilityId.RETAIL_SALES),
        _route(hold_sales, "/hold-sales", "hold-sales", CapabilityId.RETAIL_HOLDS),
        _route(hold_purchases, "/hold-purchases", "hold-purchases", CapabilityId.RETAIL_HOLDS),
        _route(returns, "/returns", "returns", CapabilityId.RETAIL_RETURNS),
        _route(accounting, "/accounting", "accounting", CapabilityId.RETAIL_ACCOUNTING),
        _route(files, "", "files", CapabilityId.FILES),
        _route(reports, "/reports", "reports", CapabilityId.REPORTING),
        _route(whatsapp, "", "whatsapp", CapabilityId.MESSAGING),
        _route(backup, "/backup", "backup", CapabilityId.BACKUP),
        _route(settings, "/settings", "settings", CapabilityId.STORE_CONFIGURATION),
        _route(stock_audit, "/stock-audit", "stock-audit", CapabilityId.RETAIL_INVENTORY),
    ),
    model_modules=(
        "app.models.user",
        "app.models.vendor",
        "app.models.product",
        "app.models.purchase",
        "app.models.sale",
        "app.models.customer",
        "app.models.pos_return",
        "app.models.accounting",
        "app.models.settings",
        "app.models.business_configuration",
        "app.models.hold_purchase",
        "app.models.hold_sale",
        "app.models.stock_adjustment",
        "app.models.stock_batch",
    ),
    migration_registry_module="app.db.migrations.registry",
    migration_ids=(
        "0001_legacy_schema_baseline",
        "0002_startup_column_additions",
        "0003_retail_business_configuration",
    ),
    shared_package_requirements={
        package_id: PackageRequirement("1.0.0", "2.0.0")
        for package_id in SharedPackageId
    },
)
