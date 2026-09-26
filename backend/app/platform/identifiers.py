from __future__ import annotations

from enum import Enum


class StableIdentifier(str, Enum):
    """A serialized identifier that must remain stable across releases."""

    def __str__(self) -> str:
        return self.value


class ApplicationId(StableIdentifier):
    RETAIL = "retail"
    WORKSHOP = "workshop"
    RESTAURANT = "restaurant"


class ProfileId(StableIdentifier):
    RETAIL = "retail"
    CLOTHING_RETAIL = "clothing-retail"
    MILK_COUNTER_RETAIL = "milk-counter-retail"
    WORKSHOP = "workshop"
    RESTAURANT = "restaurant"


class ModuleId(StableIdentifier):
    WORKSHOP = "workshop"
    RESTAURANT = "restaurant"
    CLOTHING = "clothing"
    MILK = "milk"


class SharedPackageId(StableIdentifier):
    CUSTOMER_IDENTITY = "customer-identity"
    PAYMENTS = "payments"
    INVOICES = "invoices"
    PRINTING = "printing"
    REPORTING = "reporting"
    PERMISSIONS = "permissions"
    AUDIT = "audit"


class CapabilityId(StableIdentifier):
    AUTHENTICATION = "platform.authentication"
    USERS = "platform.users"
    CUSTOMER_IDENTITY = "shared.customer-identity"
    PAYMENTS = "shared.payments"
    INVOICES = "shared.invoices"
    PRINTING = "shared.printing"
    REPORTING = "shared.reporting"
    PERMISSIONS = "shared.permissions"
    AUDIT = "shared.audit"
    STORE_CONFIGURATION = "platform.store-configuration"
    RETAIL_CATALOG = "retail.catalog"
    RETAIL_INVENTORY = "retail.inventory"
    RETAIL_PURCHASING = "retail.purchasing"
    RETAIL_SALES = "retail.sales"
    RETAIL_RETURNS = "retail.returns"
    RETAIL_ACCOUNTING = "retail.accounting"
    RETAIL_HOLDS = "retail.holds"
    BACKUP = "infrastructure.backup"
    FILES = "infrastructure.files"
    MESSAGING = "infrastructure.messaging"
    WORKSHOP_JOBS = "workshop.jobs"
    RESTAURANT_ORDERS = "restaurant.orders"
