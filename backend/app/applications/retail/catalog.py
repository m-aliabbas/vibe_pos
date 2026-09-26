from enum import Enum


class CatalogItemType(str, Enum):
    STOCK = "stock"
    SERVICE = "service"
    PREPARED = "prepared"
    NON_STOCK = "non_stock"

    @property
    def consumes_inventory(self) -> bool:
        return self in {CatalogItemType.STOCK, CatalogItemType.PREPARED}