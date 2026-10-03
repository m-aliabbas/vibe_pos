from __future__ import annotations

from app.api.v1.endpoints import (
    accounting,
    auth,
    backup,
    cash_register,
    customers,
    expenses,
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
from app.applications.workshop import api as workshop
from app.applications.workshop.migrations import MIGRATIONS
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


def _workshop_route(module, prefix: str, tag: str, capability: CapabilityId):
    return RouterRegistration(
        router=module.router,
        prefix=prefix,
        tags=(tag,),
        capability=capability,
        owner_application=ApplicationId.WORKSHOP,
    )


MANIFEST = ApplicationManifest(
    application_id=ApplicationId.WORKSHOP,
    application_name="Vibe Workshop",
    application_version="1.0.20",
    schema_version="6",
    default_profile=ProfileId.WORKSHOP,
    compatible_profiles=frozenset({ProfileId.WORKSHOP}),
    enabled_modules=frozenset(),
    capabilities=WORKSHOP_PROFILE_CAPABILITIES,
    routers=(
        _platform_route(auth, "/auth", "auth", CapabilityId.AUTHENTICATION),
        _platform_route(users, "/users", "users", CapabilityId.USERS),
        _platform_route(customers, "/customers", "customers", CapabilityId.CUSTOMER_IDENTITY),
        _platform_route(settings, "/settings", "settings", CapabilityId.STORE_CONFIGURATION),
        _platform_route(backup, "/backup", "backup", CapabilityId.BACKUP),
        _workshop_route(products, "/products", "products", CapabilityId.POS_CATALOG),
        _workshop_route(vendors, "/vendors", "vendors", CapabilityId.POS_PURCHASING),
        _workshop_route(purchases, "/purchases", "purchases", CapabilityId.POS_PURCHASING),
        _workshop_route(sales, "/sales", "sales", CapabilityId.POS_SALES),
        _workshop_route(hold_sales, "/hold-sales", "hold-sales", CapabilityId.POS_HOLDS),
        _workshop_route(hold_purchases, "/hold-purchases", "hold-purchases", CapabilityId.POS_HOLDS),
        _workshop_route(returns, "/returns", "returns", CapabilityId.POS_RETURNS),
        _workshop_route(accounting, "/accounting", "accounting", CapabilityId.POS_ACCOUNTING),
        _workshop_route(expenses, "/expenses", "expenses", CapabilityId.POS_EXPENSES),
        _workshop_route(cash_register, "/cash-register", "cash-register", CapabilityId.POS_CASH_REGISTER),
        _workshop_route(stock_audit, "/stock-audit", "stock-audit", CapabilityId.POS_INVENTORY),
        _workshop_route(reports, "/reports", "reports", CapabilityId.REPORTING),
        _workshop_route(files, "", "files", CapabilityId.FILES),
        _workshop_route(whatsapp, "", "whatsapp", CapabilityId.MESSAGING),
        _workshop_route(workshop, "/workshop", "workshop", CapabilityId.WORKSHOP_JOBS),
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
        "app.models.expense",
        "app.models.cash_register",
        "app.applications.workshop.models",
    ),
    migration_registry_module="app.applications.workshop.migrations",
    migration_ids=tuple(migration.migration_id for migration in MIGRATIONS),
    shared_package_requirements={
        package_id: PackageRequirement("1.0.0", "2.0.0")
        for package_id in SharedPackageId
    },
)
