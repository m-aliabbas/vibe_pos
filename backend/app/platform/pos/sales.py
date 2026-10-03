from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.timezone import now_pkt
from app.models.product import Product, ProductVariation
from app.models.sale import Sale, SaleItem
from app.platform.pos.calculations import SaleLineCalculation, calculate_sale_line, calculate_sale_totals
from app.platform.pos.inventory import InventoryService
from app.services import accounting as accounting_service


@dataclass(frozen=True)
class PosSaleLineCommand:
    product_id: int
    quantity: float
    unit: str
    variation_id: int | None
    item_discount: float
    unit_price: float | None


@dataclass(frozen=True)
class PosSaleCommand:
    user_id: int
    lines: tuple[PosSaleLineCommand, ...]
    payment_method: str
    discount: float
    tax: float
    delivery_charges: float
    amount_paid: float | None


class PosSaleService:
    def __init__(self, db: Session, inventory: InventoryService | None = None) -> None:
        self.db = db
        self.inventory = inventory or InventoryService(db)

    @staticmethod
    def calculate_lines(
        command: PosSaleCommand,
        products: dict[int, Product],
        variations: dict[int, ProductVariation],
        selling_units_for,
    ) -> tuple[list[SaleLineCalculation], float, float]:
        lines: list[SaleLineCalculation] = []
        for item in command.lines:
            product = products[item.product_id]
            variation = variations.get(item.variation_id)
            base_price = product.selling_price + variation.price_adjustment if variation else product.selling_price
            lines.append(
                calculate_sale_line(
                    quantity=item.quantity,
                    unit=item.unit,
                    base_unit=product.base_unit,
                    base_price=base_price,
                    selling_units=selling_units_for(product),
                    product_name=product.name,
                    item_discount=item.item_discount,
                    unit_price_override=item.unit_price,
                )
            )
        totals = calculate_sale_totals(
            lines,
            discount=command.discount,
            tax=command.tax,
            delivery_charges=command.delivery_charges,
        )
        return lines, totals.subtotal, totals.total

    def apply_lines(
        self,
        sale: Sale,
        command: PosSaleCommand,
        products: dict[int, Product],
        lines: list[SaleLineCalculation],
    ) -> None:
        for item, line in zip(command.lines, lines):
            product = products[item.product_id]
            sale_item = SaleItem(
                sale_id=sale.id,
                product_id=item.product_id,
                variation_id=item.variation_id,
                quantity=item.quantity,
                unit=item.unit,
                unit_price=line.unit_price,
                item_discount=line.item_discount,
                total_price=line.total_price,
            )
            self.db.add(sale_item)
            batch_id = self.inventory.issue(
                product,
                line.quantity_in_base_units,
                variation_id=item.variation_id,
            )
            if batch_id is not None:
                sale_item.batch_id = batch_id
                self.db.add(sale_item)

    def post_and_commit(self, sale: Sale, *, payment_method: str, user_id: int) -> Sale:
        accounting_service.post_sale_entry(
            db=self.db,
            sale=sale,
            payment_method=payment_method,
            created_by=user_id,
        )
        self.db.commit()
        self.db.refresh(sale)
        return sale

    def update_customer_balance(self, customer, *, total: float, amount_due: float) -> None:
        customer.total_purchases += 1
        customer.total_spent += total
        if amount_due > 0:
            customer.outstanding_balance += amount_due
        customer.updated_at = now_pkt()
        self.db.add(customer)


RetailSaleLineCommand = PosSaleLineCommand
RetailSaleCommand = PosSaleCommand
RetailSaleService = PosSaleService
