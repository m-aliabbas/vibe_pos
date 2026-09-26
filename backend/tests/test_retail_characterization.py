from __future__ import annotations

import os
import tempfile
import unittest
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
from app.models.stock_batch import StockBatch
from app.models.user import User, UserRole
from app.models.vendor import Vendor
from app.schemas.hold_purchase import HoldPurchaseCreate
from app.schemas.hold_sale import HoldSaleCreate
from app.schemas.purchase import PurchaseCreate, PurchaseItemCreate
from app.schemas.return_schema import ReturnCreate, ReturnItemCreate
from app.schemas.sale import SaleCreate, SaleItemCreate
from app.services import accounting as accounting_service
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

        with patch.object(
            sales.accounting_service,
            "post_sale_entry",
            side_effect=RuntimeError("synthetic accounting failure"),
        ):
            with self.assertRaises(HTTPException) as raised:
                self.create_sale(
                    SaleCreate(items=[SaleItemCreate(product_id=product.id, quantity=2.0)])
                )

        self.assertEqual(raised.exception.status_code, 500)
        self.db.expire_all()
        stored_product = self.db.query(Product).filter(Product.id == product.id).one()
        self.assertAlmostEqual(stored_product.quantity, 8.0)
        self.assertEqual(self.db.query(Sale).count(), 0)
        self.assertEqual(self.db.query(JournalEntry).count(), 0)

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


if __name__ == "__main__":
    unittest.main()
