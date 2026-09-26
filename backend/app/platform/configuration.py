from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.business_configuration import BusinessConfiguration
from app.platform.identifiers import ApplicationId, ProfileId
from app.platform.licensing import get_active_entitlements
from app.platform.manifests import ApplicationManifest, get_active_manifest
from app.platform.profiles import get_profile


class ProfileChangeError(RuntimeError):
    pass


ProfileConversion = Callable[[Session, BusinessConfiguration, ProfileId], None]


def get_business_configuration(
    db: Session,
    manifest: ApplicationManifest | None = None,
) -> BusinessConfiguration:
    active_manifest = manifest or get_active_manifest()
    row = db.get(BusinessConfiguration, 1)
    if row is None:
        row = BusinessConfiguration(
            id=1,
            application_id=active_manifest.application_id.value,
            profile_id=active_manifest.default_profile.value,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    if row.application_id != active_manifest.application_id.value:
        raise RuntimeError(
            f"Database belongs to {row.application_id!r}, not "
            f"{active_manifest.application_id.value!r}"
        )
    get_profile(row.profile_id)
    return row


def has_transactional_data(db: Session) -> bool:
    from app.models.accounting import JournalEntry
    from app.models.pos_return import PosReturn
    from app.models.purchase import Purchase
    from app.models.sale import Sale

    transaction_models = (Sale, Purchase, PosReturn, JournalEntry)
    return any(
        (db.query(func.count(model.id)).scalar() or 0) > 0
        for model in transaction_models
    )


def change_business_profile(
    db: Session,
    target_profile: ProfileId,
    *,
    conversion: ProfileConversion | None = None,
    manifest: ApplicationManifest | None = None,
) -> BusinessConfiguration:
    active_manifest = manifest or get_active_manifest()
    row = get_business_configuration(db, active_manifest)
    if target_profile not in active_manifest.compatible_profiles:
        raise ProfileChangeError(
            f"Profile {target_profile.value!r} is not compatible with "
            f"{active_manifest.application_id.value!r}"
        )
    entitled_profiles = get_active_entitlements().profiles
    if entitled_profiles is not None and target_profile not in entitled_profiles:
        raise ProfileChangeError(
            f"Profile {target_profile.value!r} is not enabled by the active license"
        )
    if row.profile_id == target_profile.value:
        return row
    if has_transactional_data(db):
        if conversion is None:
            raise ProfileChangeError(
                "Direct profile switching is blocked after transactional data exists; "
                "use a verified profile conversion"
            )
        conversion(db, row, target_profile)
    row.profile_id = target_profile.value
    row.application_id = ApplicationId(active_manifest.application_id).value
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
