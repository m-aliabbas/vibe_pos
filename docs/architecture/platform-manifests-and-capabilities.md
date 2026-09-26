# Platform Manifests, Profiles, and Capabilities

Status: Phase 2 implementation

## Source of truth

The backend is authoritative for application identity and access:

1. The static application manifest declares the routes, models, migrations,
   compatible profiles, shared-package requirements, and maximum capability set
   that the application was built to use.
2. The singleton `business_configuration` row selects one compatible profile
   and any application-declared modules for that database.
3. License entitlements may reduce the allowed profiles, modules, and
   capabilities. Missing entitlement fields preserve the complete manifest
   defaults so existing online and offline licenses remain compatible.
4. The effective capability set is the intersection of the manifest, selected
   profile, and any explicit license restriction.

The frontend consumes `GET /api/v1/app-config` for presentation. Hiding a menu
or route in React is never authorization; manifest-owned backend routers carry
capability dependencies and return HTTP 403 when their capability is disabled.

## Retail manifest

The current retail application owns its existing routers and models. Its
manifest is `backend/app/applications/retail/manifest.py`. Router registration
now comes from that manifest, while the route paths and payload contracts remain
unchanged. A manifest is rejected when it:

- declares an incompatible default profile;
- attempts to register a router owned by another application;
- attaches a router to an undeclared capability;
- omits or reorders a migration from its own declared registry; or
- requests an unavailable shared-package version.

Model modules are both statically imported by `app.db.base` for PyInstaller and
loaded from the manifest before metadata creation. This keeps schema discovery
explicit without depending on endpoint import side effects.

## Profiles and profile changes

Migration `0003_retail_business_configuration` creates and seeds the singleton
configuration as application `retail`, profile `retail`. It is additive,
idempotent, and has SQLite plus provider-neutral server-database implementations.
The configured retail profiles are:

- `retail`
- `clothing-retail`
- `milk-counter-retail`

An administrator may select a compatible profile only while no sales,
purchases, returns, or journal entries exist. Once transactional data exists,
direct switching returns HTTP 409. A future verified conversion must be passed
through the explicit conversion callback seam; changing the database value
manually is unsupported.

## Licensing and offline behavior

The encrypted local license cache now carries optional application
entitlements. Old cache entries and existing Firebase documents have no such
fields and therefore keep the full retail defaults. Explicit entitlement lists
are restrictive. A license for another application fails startup rather than
opening the retail database with the wrong domain.

## Shared contracts and customer extensions

`backend/app/platform/contracts.py` defines focused interfaces for customer
identity, payments, invoice rendering, printing, reporting, permissions, and
audit logging. They do not define a universal sale or transaction type.

Business-specific customer data must live in a model package owned by that
application or module and reference the common customer identity. Phase 2 does
not introduce workshop, restaurant, clothing, or milk fields into the common
customer table. The legacy oil/mileage columns remain readable during the
approved compatibility window; the typed workshop vehicle/customer tables are
owned by the later workshop phase and will not be registered by the retail
manifest.

## Typed app configuration contract

`GET /api/v1/app-config` returns:

- application identity, application version, and schema version;
- selected business profile;
- effective modules and capabilities;
- installed shared-package versions; and
- current store branding.

`PUT /api/v1/app-config/profile` is admin-only and applies the profile-change
rules above. Backend Pydantic models and `frontend/lib/api.ts` are kept aligned.
