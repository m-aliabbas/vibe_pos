from __future__ import annotations

import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch


# Production modules create a configured engine and invoice directory at import
# time. Point both at an isolated process-wide temporary root before importing
# the application. Per-test business data still uses a separate engine below.
IMPORT_ROOT = tempfile.TemporaryDirectory(prefix="vibepos-import-tests-")
os.environ["DATA_DIR"] = str(Path(IMPORT_ROOT.name) / "runtime-data")
os.environ["HOME"] = IMPORT_ROOT.name
os.environ["LICENSE_ENFORCEMENT"] = "false"

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints import hold_purchases, hold_sales, purchases, returns, sales
from app.db.base import Base
from app.models.accounting import JournalEntry
from app.models.customer import Customer
from app.models.hold_purchase import HoldPurchase
from app.models.hold_sale import HoldSale
from app.models.product import Product, ProductVariation
from app.models.purchase import Purchase
from app.models.sale import Sale
from app.models.stock_batch import BatchStatus, StockBatch
from app.models.user import User, UserRole
from app.models.vendor import Vendor
from app.schemas.hold_purchase import HoldPurchaseCreate
from app.schemas.hold_sale import HoldSaleCreate
from app.schemas.purchase import PurchaseCreate, PurchaseItemCreate
from app.schemas.return_schema import ReturnCreate, ReturnItemCreate
from app.schemas.sale import SaleCreate, SaleItemCreate
from app.services import accounting as accounting_service
from app.applications.retail.calculations import (
    calculate_sale_line,
    calculate_sale_totals,
    convert_to_base_quantity,
)
from app.applications.retail.catalog import CatalogItemType
from app.applications.retail.inventory import InventoryService, RetailInventoryConsumptionPolicy
from app.platform.contracts import BusinessTransactionReference, InvoiceRequest, PaymentCommand
from app.schemas.product import ProductBase
from tests.support.disposable_database import create_disposable_sqlite_engine


class RetailCharacterizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory, self.engine, self.database_path = create_disposable_sqlite_engine()
        Base.metadata.create_all(bind=self.engine)
        session_factory = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = session_factory()
        self.user = User(
            username="characterization-admin",
            hashed_password="not-a-real-password-hash",
            role=UserRole.ADMIN,
            is_active=True,
        )
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()
        self.temp_directory.cleanup()

    def add_product(
        self,
        *,
        name: str,
        price: float,
        quantity: float,
        allow_decimal: bool = False,
        base_unit: str = "piece",
        selling_units: list[dict] | None = None,
        has_variations: bool = False,
    ) -> Product:
        product = Product(
            name=name,
            selling_price=price,
            cost_price=price / 2,
            quantity=quantity,
            allow_decimal_qty=allow_decimal,
            base_unit=base_unit,
            selling_units=selling_units or [],
            has_variations=has_variations,
            variation_attributes=["Size"] if has_variations else [],
        )
        self.db.add(product)
        self.db.commit()
        self.db.refresh(product)
        return product

    def assert_all_journals_balanced(self) -> None:
        entries = self.db.query(JournalEntry).all()
        self.assertGreater(len(entries), 0)
        for entry in entries:
            debit = sum(float(line.debit or 0.0) for line in entry.lines)
            credit = sum(float(line.credit or 0.0) for line in entry.lines)
            self.assertAlmostEqual(debit, credit, places=2, msg=f"Journal {entry.id} is unbalanced")

    def test_catalog_and_shared_transaction_contracts_are_typed(self) -> None:
        service_product = ProductBase(name="Synthetic service", item_type="service")
        source = BusinessTransactionReference("workshop", "job_card", "WO-100")

        self.assertEqual(service_product.item_type, CatalogItemType.SERVICE)
        self.assertEqual(PaymentCommand(source, 12.5, "cash").source, source)
        self.assertEqual(InvoiceRequest(source, {"total": 12.5}).source, source)

    def test_sale_calculations_cover_overrides_discounts_tax_and_rounding(self) -> None:
        priced_line = calculate_sale_line(
            quantity=3.0,
            unit="piece",
            base_unit="piece",
            base_price=10.0,
            selling_units=[],
            product_name="Synthetic item",
            item_discount=0.25,
            unit_price_override=10.005,
        )
        totals = calculate_sale_totals(
            [priced_line],
            discount=0.10,
            tax=0.105,
            delivery_charges=1.0,
        )

        self.assertAlmostEqual(priced_line.unit_price, 10.005)
        self.assertAlmostEqual(priced_line.total_price, 29.77)
        self.assertAlmostEqual(totals.subtotal, 29.77)
        self.assertAlmostEqual(totals.total, 30.78)

    def test_unit_conversion_keeps_fractional_quantity_precision(self) -> None:
        converted = convert_to_base_quantity(
            0.1,
            unit="pack",
            base_unit="piece",
            selling_units=[{"unit": "pack", "conversion": 2.5, "price": 4.0}],
            product_name="Synthetic item",
        )

        self.assertAlmostEqual(converted, 0.25)

    def create_sale(self, payload: SaleCreate) -> Sale:
        return sales.create_sale(
            sale_in=payload,
            background_tasks=BackgroundTasks(),
            db=self.db,
            current_user=self.user,
        )

    def test_cash_sale_deducts_stock_and_posts_balanced_journal(self) -> None:
        product = self.add_product(name="Retail item", price=10.0, quantity=20.0)

        sale = self.create_sale(
            SaleCreate(items=[SaleItemCreate(product_id=product.id, quantity=2.0)])
        )

        self.assertAlmostEqual(sale.total, 20.0)
        self.assertAlmostEqual(sale.amount_due, 0.0)
        self.assertAlmostEqual(product.quantity, 18.0)
        self.assertEqual(self.db.query(Sale).count(), 1)
        self.assert_all_journals_balanced()

    def test_partial_credit_sale_updates_customer_balance(self) -> None:
        product = self.add_product(name="Credit item", price=50.0, quantity=10.0)
        customer = Customer(customer_id="CUST0001", name="Synthetic Customer", opening_balance=0.0)
        self.db.add(customer)
        self.db.commit()
        self.db.refresh(customer)

        sale = self.create_sale(
            SaleCreate(
                customer_ref_id=customer.id,
                amount_paid=30.0,
                items=[SaleItemCreate(product_id=product.id, quantity=2.0)],
            )
        )

        self.assertAlmostEqual(sale.total, 100.0)
        self.assertAlmostEqual(sale.amount_due, 70.0)
        self.assertAlmostEqual(customer.outstanding_balance, 70.0)
        self.assertEqual(customer.total_purchases, 1)
        self.assertAlmostEqual(customer.total_spent, 100.0)
        self.assertAlmostEqual(
            accounting_service.get_customer_balance(self.db, customer.id, customer.opening_balance),
            70.0,
        )
        self.assert_all_journals_balanced()

    def test_fractional_and_converted_units_use_base_stock(self) -> None:
        fabric = self.add_product(
            name="Fabric",
            price=100.0,
            quantity=10.0,
            allow_decimal=True,
            base_unit="meter",
        )
        packs = self.add_product(
            name="Pack item",
            price=10.0,
            quantity=100.0,
            selling_units=[{"unit": "dozen", "conversion": 12.0, "price": 100.0}],
        )

        fractional_sale = self.create_sale(
            SaleCreate(items=[SaleItemCreate(product_id=fabric.id, quantity=1.25, unit="meter")])
        )
        converted_sale = self.create_sale(
            SaleCreate(items=[SaleItemCreate(product_id=packs.id, quantity=2.0, unit="dozen")])
        )

        self.assertAlmostEqual(fractional_sale.total, 125.0)
        self.assertAlmostEqual(fabric.quantity, 8.75)
        self.assertAlmostEqual(converted_sale.total, 200.0)
        self.assertAlmostEqual(packs.quantity, 76.0)
        self.assert_all_journals_balanced()

    def test_variation_sale_deducts_variation_not_base_product(self) -> None:
        product = self.add_product(
            name="Shirt",
            price=100.0,
            quantity=30.0,
            has_variations=True,
        )
        variation = ProductVariation(
            product_id=product.id,
            attributes={"Size": "M"},
            price_adjustment=20.0,
            quantity=5.0,
        )
        self.db.add(variation)
        self.db.commit()
        self.db.refresh(variation)

        sale = self.create_sale(
            SaleCreate(
                items=[
                    SaleItemCreate(
                        product_id=product.id,
                        variation_id=variation.id,
                        quantity=2.0,
                    )
                ]
            )
        )

        self.assertAlmostEqual(sale.total, 240.0)
        self.assertAlmostEqual(product.quantity, 30.0)
        self.assertAlmostEqual(variation.quantity, 3.0)
        self.assert_all_journals_balanced()

    def test_sale_rolls_back_when_accounting_fails(self) -> None:
        product = self.add_product(name="Rollback item", price=25.0, quantity=8.0)
        customer = Customer(customer_id="CUST0002", name="Rollback Customer", opening_balance=0.0)
        self.db.add(customer)
        self.db.commit()
        self.db.refresh(customer)

        with patch.object(
            sales.accounting_service,
            "post_sale_entry",
            side_effect=RuntimeError("synthetic accounting failure"),
        ):
            with self.assertRaises(HTTPException) as raised:
                self.create_sale(
                    SaleCreate(
                        customer_ref_id=customer.id,
                        amount_paid=0.0,
                        items=[SaleItemCreate(product_id=product.id, quantity=2.0)],
                    )
                )

        self.assertEqual(raised.exception.status_code, 500)
        self.db.expire_all()
        stored_product = self.db.query(Product).filter(Product.id == product.id).one()
        self.assertAlmostEqual(stored_product.quantity, 8.0)
        self.assertEqual(self.db.query(Sale).count(), 0)
        self.assertEqual(self.db.query(JournalEntry).count(), 0)
        self.db.expire_all()
        stored_customer = self.db.query(Customer).filter(Customer.id == customer.id).one()
        self.assertEqual(stored_customer.total_purchases, 0)
        self.assertAlmostEqual(stored_customer.total_spent, 0.0)
        self.assertAlmostEqual(stored_customer.outstanding_balance, 0.0)

    def test_purchase_adds_stock_batch_and_balanced_journal(self) -> None:
        product = self.add_product(name="Purchased item", price=20.0, quantity=2.0)
        vendor = Vendor(name="Synthetic Vendor", opening_balance=0.0, prepaid_credit=0.0)
        self.db.add(vendor)
        self.db.commit()
        self.db.refresh(vendor)

        result = purchases.create_purchase(
            db=self.db,
            purchase_in=PurchaseCreate(
                vendor_id=vendor.id,
                amount_paid=20.0,
                items=[PurchaseItemCreate(product_id=product.id, quantity=5.0, unit_cost=10.0)],
            ),
            current_user=self.user,
        )

        self.assertAlmostEqual(result.total_amount, 50.0)
        self.assertEqual(str(result.status.value), "partial")
        self.assertAlmostEqual(product.quantity, 7.0)
        self.assertEqual(self.db.query(Purchase).count(), 1)
        self.assertEqual(self.db.query(StockBatch).count(), 1)
        self.assertAlmostEqual(accounting_service.get_vendor_balance(self.db, vendor.id), 30.0)
        self.assert_all_journals_balanced()

    def test_sale_issues_stock_batches_in_fifo_order(self) -> None:
        product = self.add_product(name="FIFO item", price=5.0, quantity=10.0)
        oldest = StockBatch(
            product_id=product.id,
            batch_number="TEST-FIFO-OLD",
            quantity_received=2.0,
            quantity_remaining=2.0,
            unit_cost=1.0,
            selling_price=5.0,
            purchase_date=datetime(2025, 1, 1),
            status=BatchStatus.ACTIVE,
        )
        newest = StockBatch(
            product_id=product.id,
            batch_number="TEST-FIFO-NEW",
            quantity_received=8.0,
            quantity_remaining=8.0,
            unit_cost=2.0,
            selling_price=5.0,
            purchase_date=datetime(2025, 2, 1),
            status=BatchStatus.ACTIVE,
        )
        self.db.add_all([oldest, newest])
        self.db.commit()
        self.db.refresh(oldest)
        self.db.refresh(newest)

        sale = self.create_sale(
            SaleCreate(items=[SaleItemCreate(product_id=product.id, quantity=4.0)])
        )

        self.assertAlmostEqual(oldest.quantity_remaining, 0.0)
        self.assertEqual(oldest.status, BatchStatus.DEPLETED)
        self.assertAlmostEqual(newest.quantity_remaining, 6.0)
        self.assertEqual(sale.items[0].batch_id, newest.id)

    def test_purchase_return_uses_shared_inventory_boundary(self) -> None:
        product = self.add_product(name="Vendor return item", price=20.0, quantity=2.0)
        vendor = Vendor(name="Return Vendor", opening_balance=0.0, prepaid_credit=0.0)
        self.db.add(vendor)
        self.db.commit()
        self.db.refresh(vendor)
        purchase = purchases.create_purchase(
            db=self.db,
            purchase_in=PurchaseCreate(
                vendor_id=vendor.id,
                amount_paid=20.0,
                items=[PurchaseItemCreate(product_id=product.id, quantity=3.0, unit_cost=10.0)],
            ),
            current_user=self.user,
        )

        response = returns.create_return(
            background_tasks=BackgroundTasks(),
            return_in=ReturnCreate(
                purchase_id=purchase.id,
                return_type="purchase",
                settlement_mode="paid_to_business",
                reason="wrong_item",
                items=[
                    ReturnItemCreate(
                        purchase_item_id=purchase.items[0].id,
                        quantity_returned=1,
                    )
                ],
            ),
            db=self.db,
            current_user=self.user,
        )

        self.assertEqual(response.purchase_id, purchase.id)
        self.assertAlmostEqual(product.quantity, 4.0)
        active_batch = self.db.query(StockBatch).filter(
            StockBatch.product_id == product.id,
            StockBatch.status == BatchStatus.ACTIVE,
        ).one()
        self.assertAlmostEqual(active_batch.quantity_remaining, 2.0)
        self.assert_all_journals_balanced()

    def test_sale_return_restocks_once_and_posts_balanced_journal(self) -> None:
        product = self.add_product(name="Return item", price=10.0, quantity=10.0)
        sale = self.create_sale(
            SaleCreate(items=[SaleItemCreate(product_id=product.id, quantity=2.0)])
        )
        sale_item = sale.items[0]
        self.assertAlmostEqual(product.quantity, 8.0)

        response = returns.create_return(
            background_tasks=BackgroundTasks(),
            return_in=ReturnCreate(
                sale_id=sale.id,
                reason="customer_changed_mind",
                settlement_mode="paid_to_customer",
                items=[ReturnItemCreate(sale_item_id=sale_item.id, quantity_returned=1)],
            ),
            db=self.db,
            current_user=self.user,
        )

        self.assertAlmostEqual(response.refund_amount, 10.0)
        self.assertAlmostEqual(product.quantity, 9.0)
        self.assert_all_journals_balanced()

    def test_holds_store_payload_without_stock_or_journal_effects(self) -> None:
        product = self.add_product(name="Held item", price=5.0, quantity=12.0)

        hold_sales.create_hold_sale(
            db=self.db,
            hold_in=HoldSaleCreate(label="sale hold", payload={"items": [{"product_id": product.id}]}),
            current_user=self.user,
        )
        hold_purchases.create_hold_purchase(
            db=self.db,
            hold_in=HoldPurchaseCreate(label="purchase hold", payload={"items": [{"product_id": product.id}]}),
            current_user=self.user,
        )

        self.assertEqual(self.db.query(HoldSale).count(), 1)
        self.assertEqual(self.db.query(HoldPurchase).count(), 1)
        self.assertAlmostEqual(product.quantity, 12.0)
        self.assertEqual(self.db.query(JournalEntry).count(), 0)

    def test_service_item_sale_does_not_mutate_stock(self) -> None:
        product = self.add_product(name="Service item", price=40.0, quantity=6.0)
        product.item_type = "service"
        self.db.commit()

        sale = self.create_sale(
            SaleCreate(items=[SaleItemCreate(product_id=product.id, quantity=2.0)])
        )

        self.assertAlmostEqual(sale.total, 80.0)
        self.assertAlmostEqual(product.quantity, 6.0)
        self.assert_all_journals_balanced()

    def test_prepared_item_policy_can_replace_stock_consumption(self) -> None:
        product = self.add_product(name="Prepared item", price=8.0, quantity=5.0)
        product.item_type = CatalogItemType.PREPARED.value
        self.db.commit()
        consumed: list[float] = []

        class RecipePolicy(RetailInventoryConsumptionPolicy):
            def issue(self, item, quantity, variation_id, stock_operation):
                if item.item_type == CatalogItemType.PREPARED.value:
                    consumed.append(quantity)
                    return None
                return super().issue(item, quantity, variation_id, stock_operation)

        InventoryService(self.db, RecipePolicy()).issue(product, 1.25)

        self.assertEqual(consumed, [1.25])
        self.assertAlmostEqual(product.quantity, 5.0)

    def test_purchase_rolls_back_stock_when_accounting_fails(self) -> None:
        product = self.add_product(name="Purchase rollback item", price=20.0, quantity=2.0)
        vendor = Vendor(name="Rollback Vendor", opening_balance=0.0, prepaid_credit=0.0)
        self.db.add(vendor)
        self.db.commit()
        self.db.refresh(vendor)

        with patch.object(
            purchases.accounting_service,
            "post_purchase_entry",
            side_effect=RuntimeError("synthetic accounting failure"),
        ):
            with self.assertRaises(HTTPException):
                purchases.create_purchase(
                    db=self.db,
                    purchase_in=PurchaseCreate(
                        vendor_id=vendor.id,
                        amount_paid=0.0,
                        items=[PurchaseItemCreate(product_id=product.id, quantity=3.0, unit_cost=10.0)],
                    ),
                    current_user=self.user,
                )

        self.db.expire_all()
        stored_product = self.db.query(Product).filter(Product.id == product.id).one()
        self.assertAlmostEqual(stored_product.quantity, 2.0)
        self.assertEqual(self.db.query(Purchase).count(), 0)


if __name__ == "__main__":
    unittest.main()
