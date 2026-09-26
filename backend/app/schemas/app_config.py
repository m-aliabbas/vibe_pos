from __future__ import annotations

from pydantic import BaseModel

from app.platform.identifiers import ApplicationId, CapabilityId, ModuleId, ProfileId


class AppBranding(BaseModel):
    name: str
    address: str
    phone: str
    email: str
    city: str
    tax_id: str
    website: str


class AppConfigResponse(BaseModel):
    application_id: ApplicationId
    application_name: str
    application_version: str
    schema_version: str
    profile_id: ProfileId
    enabled_modules: list[ModuleId]
    enabled_capabilities: list[CapabilityId]
    shared_package_versions: dict[str, str]
    branding: AppBranding


class ProfileChangeRequest(BaseModel):
    profile_id: ProfileId
