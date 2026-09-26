from __future__ import annotations

import json

from sqlalchemy import Column, Integer, String as SQLString, Text

from app.db.session import Base
from app.platform.identifiers import ApplicationId, ModuleId, ProfileId


String = SQLString(255)


class BusinessConfiguration(Base):
    __tablename__ = "business_configuration"

    id = Column(Integer, primary_key=True, default=1)
    application_id = Column(String, nullable=False, default=ApplicationId.RETAIL.value)
    profile_id = Column(String, nullable=False, default=ProfileId.RETAIL.value)
    enabled_modules_json = Column(Text, nullable=False, default="[]")

    @property
    def enabled_modules(self) -> frozenset[ModuleId]:
        values = json.loads(self.enabled_modules_json or "[]")
        return frozenset(ModuleId(value) for value in values)

    def set_enabled_modules(self, modules: set[ModuleId] | frozenset[ModuleId]) -> None:
        self.enabled_modules_json = json.dumps(
            sorted(module.value for module in modules), separators=(",", ":")
        )
