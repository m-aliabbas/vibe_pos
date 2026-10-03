from __future__ import annotations

from typing import Callable, Protocol

from sqlalchemy.orm import Session

from app.models.product import Product, ProductVariation
from app.models.stock_batch import BatchStatus, StockBatch
from app.platform.pos.catalog import CatalogItemType


class InventoryConsumptionPolicy(Protocol):
    def tracks_inventory(self, product: Product) -> bool: ...

    def issue(
        self,
        product: Product,
        quantity: float,
        variation_id: int | None,
        stock_operation: Callable[[Product, float, int | None], int | None],
    ) -> int | None: ...

    def receive(
        self,
        product: Product,
        quantity: float,
        variation_id: int | None,
        stock_operation: Callable[[Product, float, int | None], None],
    ) -> None: ...


class PosInventoryConsumptionPolicy:
    def tracks_inventory(self, product: Product) -> bool:
        item_type = CatalogItemType(getattr(product, "item_type", CatalogItemType.STOCK))
        return item_type.consumes_inventory

    def issue(self, product, quantity, variation_id, stock_operation):
        if not self.tracks_inventory(product):
            return None
        return stock_operation(product, quantity, variation_id)

    def receive(self, product, quantity, variation_id, stock_operation):
        if self.tracks_inventory(product):
            stock_operation(product, quantity, variation_id)


RetailInventoryConsumptionPolicy = PosInventoryConsumptionPolicy


class InventoryService:
    def __init__(self, db: Session, policy: InventoryConsumptionPolicy | None = None) -> None:
        self.db = db
        self.policy = policy or PosInventoryConsumptionPolicy()

    def _stock_owner(self, product: Product, variation_id: int | None) -> Product | ProductVariation:
        if variation_id is None:
            return product
        variation = self.db.query(ProductVariation).filter(
            ProductVariation.id == variation_id,
            ProductVariation.product_id == product.id,
        ).first()
        if variation is None:
            raise ValueError(f"Variation {variation_id} not found for product {product.id}")
        return variation

    def _deduct_fifo(self, product_id: int, variation_id: int | None, quantity: float) -> int | None:
        batches = self.db.query(StockBatch).filter(
            StockBatch.product_id == product_id,
            StockBatch.variation_id == variation_id,
            StockBatch.status == BatchStatus.ACTIVE,
            StockBatch.quantity_remaining > 0,
        ).order_by(StockBatch.purchase_date.asc(), StockBatch.id.asc()).all()
        remaining = quantity
        last_batch_id = None
        for batch in batches:
            taken = min(float(batch.quantity_remaining), remaining)
            batch.quantity_remaining -= taken
            if batch.quantity_remaining <= 0:
                batch.status = BatchStatus.DEPLETED
            remaining -= taken
            last_batch_id = batch.id
            self.db.add(batch)
            if remaining <= 0:
                break
        return last_batch_id

    def _issue_stock(self, product: Product, quantity: float, variation_id: int | None) -> int | None:
        owner = self._stock_owner(product, variation_id)
        owner.quantity = float(owner.quantity or 0.0) - quantity
        self.db.add(owner)
        return self._deduct_fifo(product.id, variation_id, quantity)

    def issue(self, product: Product, quantity: float, *, variation_id: int | None = None) -> int | None:
        return self.policy.issue(product, quantity, variation_id, self._issue_stock)

    def _receive_stock(self, product: Product, quantity: float, variation_id: int | None) -> None:
        owner = self._stock_owner(product, variation_id)
        owner.quantity = float(owner.quantity or 0.0) + quantity
        self.db.add(owner)

    def receive(self, product: Product, quantity: float, *, variation_id: int | None = None) -> None:
        self.policy.receive(product, quantity, variation_id, self._receive_stock)

    def return_stock(self, product: Product, quantity: float, *, variation_id: int | None = None) -> None:
        self.receive(product, quantity, variation_id=variation_id)

    def adjust_product(self, product: Product, quantity_delta: float) -> tuple[float, float]:
        before = float(product.quantity or 0.0)
        if self.policy.tracks_inventory(product):
            product.quantity = before + quantity_delta
            self.db.add(product)
        return before, float(product.quantity or before)

    def adjust_variation(
        self, product: Product, variation_id: int, quantity_delta: float
    ) -> tuple[float, float]:
        if not self.policy.tracks_inventory(product):
            return 0.0, 0.0
        variation = self._stock_owner(product, variation_id)
        before = float(variation.quantity or 0.0)
        variation.quantity = before + quantity_delta
        self.db.add(variation)
        return before, float(variation.quantity)
