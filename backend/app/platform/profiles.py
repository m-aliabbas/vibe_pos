from __future__ import annotations

from dataclasses import dataclass

from app.platform.identifiers import ApplicationId, CapabilityId, ProfileId


@dataclass(frozen=True)
class BusinessProfile:
    profile_id: ProfileId
    application_id: ApplicationId
    capabilities: frozenset[CapabilityId]


RETAIL_PROFILE_CAPABILITIES = frozenset(
    {
        CapabilityId.AUTHENTICATION,
        CapabilityId.USERS,
        CapabilityId.CUSTOMER_IDENTITY,
        CapabilityId.PAYMENTS,
        CapabilityId.INVOICES,
        CapabilityId.PRINTING,
        CapabilityId.REPORTING,
        CapabilityId.PERMISSIONS,
        CapabilityId.AUDIT,
        CapabilityId.STORE_CONFIGURATION,
        CapabilityId.RETAIL_CATALOG,
        CapabilityId.RETAIL_INVENTORY,
        CapabilityId.RETAIL_PURCHASING,
        CapabilityId.RETAIL_SALES,
        CapabilityId.RETAIL_RETURNS,
        CapabilityId.RETAIL_ACCOUNTING,
        CapabilityId.RETAIL_HOLDS,
        CapabilityId.BACKUP,
        CapabilityId.FILES,
        CapabilityId.MESSAGING,
    }
)

WORKSHOP_PROFILE_CAPABILITIES = frozenset(
    {
        CapabilityId.AUTHENTICATION,
        CapabilityId.USERS,
        CapabilityId.STORE_CONFIGURATION,
        CapabilityId.BACKUP,
    }
)

RESTAURANT_PROFILE_CAPABILITIES = WORKSHOP_PROFILE_CAPABILITIES

PROFILES: dict[ProfileId, BusinessProfile] = {
    profile_id: BusinessProfile(
        profile_id=profile_id,
        application_id=ApplicationId.RETAIL,
        capabilities=RETAIL_PROFILE_CAPABILITIES,
    )
    for profile_id in (
        ProfileId.RETAIL,
        ProfileId.CLOTHING_RETAIL,
        ProfileId.MILK_COUNTER_RETAIL,
    )
}
PROFILES[ProfileId.WORKSHOP] = BusinessProfile(
    ProfileId.WORKSHOP,
    ApplicationId.WORKSHOP,
    WORKSHOP_PROFILE_CAPABILITIES,
)
PROFILES[ProfileId.RESTAURANT] = BusinessProfile(
    ProfileId.RESTAURANT,
    ApplicationId.RESTAURANT,
    RESTAURANT_PROFILE_CAPABILITIES,
)


def get_profile(profile_id: str | ProfileId) -> BusinessProfile:
    try:
        stable_id = ProfileId(profile_id)
        return PROFILES[stable_id]
    except (ValueError, KeyError) as exc:
        raise ValueError(f"Unknown business profile: {profile_id!r}") from exc
