import unittest
import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import patch

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints.sales import _build_whatsapp_invoice_caption, create_sale, get_sale
from app.applications.workshop.api import complete_job, create_job, create_vehicle
from app.applications.workshop.migrations import MIGRATIONS as WORKSHOP_MIGRATIONS
from app.applications.workshop.models import WorkshopJob, WorkshopVehicle
from app.applications.workshop.schemas import JobComplete, JobCreate, JobLineCreate, VehicleCreate
from app.applications.workshop.seed import WORKSHOP_SAMPLE_PRODUCTS, seed_workshop_sample_products
import app.db.base  # noqa: F401 - register the complete POS metadata for the disposable database
from app.db.session import Base
from app.db.migrations.runner import upgrade_database
from app.models.accounting import JournalEntry, JournalLine
from app.models.customer import Customer
from app.models.product import Product
from app.models.sale import Sale
from app.models.user import User
from app.schemas.sale import Sale as SaleResponse
from app.schemas.sale import SaleCreate, SaleItemCreate, SaleOilChangeCreate


class WorkshopOilChangeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(username="owner", hashed_password="x", role="admin")
        self.customer = Customer(customer_id="CUST-1", name="Test Driver", phone="923001234567")
        self.oil = Product(
            name="Test Oil 10W-40",
            sku="OIL-TEST",
            item_type="stock",
            selling_price=1100.0,
            cost_price=800.0,
            quantity=10.0,
            allow_decimal_qty=True,
            base_unit="liter",
            selling_units=[
                {"unit": "4L can", "conversion": 4.0, "price": 4000.0},
                {"unit": "liter", "conversion": 1.0, "price": 1100.0},
            ],
        )
        self.db.add_all([self.user, self.customer, self.oil])
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_job_completion_posts_one_invoice_and_decimal_stock(self) -> None:
        vehicle = create_vehicle(
            VehicleCreate(
                customer_id=self.customer.id,
                registration_number="abc-123",
                make="Toyota",
                model="Corolla",
                current_mileage=42000,
            ),
            self.db,
            self.user,
        )
        self.assertEqual(vehicle.vehicle_id, "VH-0001")
        job = create_job(
            JobCreate(
                vehicle_id=vehicle.id,
                current_mileage=47100,
                oil_change_interval=5000,
                lines=[
                    JobLineCreate(product_id=self.oil.id, quantity=1, unit="4L can"),
                    JobLineCreate(product_id=self.oil.id, quantity=0.75, unit="liter"),
                ],
            ),
            self.db,
            self.user,
        )

        completed = complete_job(
            job.id,
            JobComplete(payment_method="cash"),
            self.db,
            self.user,
        )

        self.db.refresh(self.oil)
        self.db.refresh(self.customer)
        vehicle_row = self.db.query(WorkshopVehicle).filter_by(id=vehicle.id).one()
        self.assertEqual(completed.status, "completed")
        self.assertIsNotNone(completed.sale_id)
        self.assertAlmostEqual(completed.total, 4825.0)
        self.assertAlmostEqual(self.oil.quantity, 5.25)
        self.assertEqual(vehicle_row.current_mileage, 47100)
        self.assertEqual(vehicle_row.next_oil_change_mileage, 52100)
        self.assertEqual(self.db.query(Sale).count(), 1)
        self.assertEqual(self.customer.total_purchases, 1)

        journal = self.db.query(JournalEntry).filter_by(source_type="sale", source_id=completed.sale_id).one()
        debit, credit = self.db.query(
            func.sum(JournalLine.debit), func.sum(JournalLine.credit)
        ).filter(JournalLine.entry_id == journal.id).one()
        self.assertAlmostEqual(float(debit), float(credit))

        with self.assertRaises(HTTPException) as raised:
            complete_job(job.id, JobComplete(payment_method="cash"), self.db, self.user)
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(self.db.query(Sale).count(), 1)
        self.assertAlmostEqual(self.oil.quantity, 5.25)

    def test_sales_checkout_posts_completed_oil_change_without_double_stock_issue(self) -> None:
        vehicle = create_vehicle(
            VehicleCreate(
                customer_id=self.customer.id,
                registration_number="SALE-101",
                current_mileage=30000,
            ),
            self.db,
            self.user,
        )
        with patch("app.api.v1.endpoints.sales.settings.APPLICATION_ID", "workshop"):
            sale = create_sale(
                SaleCreate(
                    customer_ref_id=self.customer.id,
                    customer_name=self.customer.name,
                    customer_phone=self.customer.phone,
                    amount_paid=1100.0,
                    items=[SaleItemCreate(product_id=self.oil.id, quantity=1, unit="liter")],
                    oil_change=SaleOilChangeCreate(
                        vehicle_id=vehicle.id,
                        current_mileage=31250,
                        oil_change_interval=5000,
                    ),
                ),
                BackgroundTasks(),
                self.db,
                self.user,
            )
            invoice = get_sale(sale.id, self.db, self.user)

        self.db.refresh(self.oil)
        job = self.db.query(WorkshopJob).filter_by(sale_id=sale.id).one()
        vehicle_row = self.db.query(WorkshopVehicle).filter_by(id=vehicle.id).one()
        self.assertEqual(job.status, "completed")
        self.assertEqual(job.previous_mileage, 30000)
        self.assertEqual(job.next_oil_change_mileage, 36250)
        self.assertEqual(vehicle_row.current_mileage, 31250)
        self.assertEqual(vehicle_row.next_oil_change_mileage, 36250)
        self.assertAlmostEqual(self.oil.quantity, 9.0)
        self.assertEqual(invoice.oil_change["vehicle_identifier"], "SALE-101")
        self.assertEqual(
            SaleResponse.model_validate(invoice).oil_change.next_oil_change_mileage,
            36250,
        )
        self.assertIn("Next oil change: 36,250 KM", _build_whatsapp_invoice_caption(invoice))

    def test_meter_reading_cannot_move_backwards(self) -> None:
        vehicle = create_vehicle(
            VehicleCreate(customer_id=self.customer.id, current_mileage=50000),
            self.db,
            self.user,
        )
        with self.assertRaises(HTTPException) as raised:
            create_job(
                JobCreate(
                    vehicle_id=vehicle.id,
                    current_mileage=49000,
                    oil_change_interval=5000,
                    lines=[JobLineCreate(product_id=self.oil.id, quantity=1, unit="liter")],
                ),
                self.db,
                self.user,
            )
        self.assertEqual(raised.exception.status_code, 400)

    def test_partial_payment_updates_customer_credit(self) -> None:
        vehicle = create_vehicle(
            VehicleCreate(customer_id=self.customer.id, current_mileage=10000),
            self.db,
            self.user,
        )
        job = create_job(
            JobCreate(
                vehicle_id=vehicle.id,
                current_mileage=10500,
                oil_change_interval=5000,
                lines=[JobLineCreate(product_id=self.oil.id, quantity=1, unit="liter")],
            ),
            self.db,
            self.user,
        )
        completed = complete_job(
            job.id,
            JobComplete(payment_method="cash", amount_paid=100.0),
            self.db,
            self.user,
        )
        self.db.refresh(self.customer)
        self.assertAlmostEqual(completed.total, 1100.0)
        self.assertAlmostEqual(completed.amount_due, 1000.0)
        self.assertAlmostEqual(self.customer.outstanding_balance, 1000.0)

    def test_insufficient_stock_does_not_partially_complete_job(self) -> None:
        self.oil.quantity = 0.5
        self.db.commit()
        vehicle = create_vehicle(
            VehicleCreate(customer_id=self.customer.id, current_mileage=20000),
            self.db,
            self.user,
        )
        job = create_job(
            JobCreate(
                vehicle_id=vehicle.id,
                current_mileage=21000,
                oil_change_interval=5000,
                lines=[JobLineCreate(product_id=self.oil.id, quantity=1, unit="liter")],
            ),
            self.db,
            self.user,
        )
        with self.assertRaises(HTTPException) as raised:
            complete_job(job.id, JobComplete(payment_method="cash"), self.db, self.user)
        self.assertEqual(raised.exception.status_code, 400)
        self.db.refresh(self.oil)
        persisted_job = self.db.query(WorkshopJob).filter_by(id=job.id).one()
        self.assertEqual(persisted_job.status, "open")
        self.assertIsNone(persisted_job.sale_id)
        self.assertAlmostEqual(self.oil.quantity, 0.5)
        self.assertEqual(self.db.query(Sale).count(), 0)

    def test_vehicle_ids_are_generated_from_unique_database_ids(self) -> None:
        first = create_vehicle(
            VehicleCreate(customer_id=self.customer.id, registration_number="REG-001"),
            self.db,
            self.user,
        )
        second = create_vehicle(
            VehicleCreate(customer_id=self.customer.id, registration_number="REG-002"),
            self.db,
            self.user,
        )

        self.assertEqual(first.vehicle_id, "VH-0001")
        self.assertEqual(second.vehicle_id, "VH-0002")

    def test_sample_products_seed_missing_items_in_an_established_catalog(self) -> None:
        self.assertEqual(seed_workshop_sample_products(self.db), len(WORKSHOP_SAMPLE_PRODUCTS))
        self.assertEqual(seed_workshop_sample_products(self.db), 0)
        self.assertEqual(self.db.query(Product).count(), len(WORKSHOP_SAMPLE_PRODUCTS) + 1)
        service = self.db.query(Product).filter_by(sku="WS-SERVICE-OIL-CHANGE").one()
        open_oil = self.db.query(Product).filter_by(sku="WS-OPEN-OIL-20W50").one()
        self.assertEqual(service.item_type, "service")
        self.assertTrue(open_oil.allow_decimal_qty)

    def test_workshop_migration_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory(prefix="vibepos-workshop-migration-") as directory:
            database_path = Path(directory) / "workshop" / "data" / "pos.db"
            with patch.dict("os.environ", {"APPLICATION_ID": "workshop"}):
                first = upgrade_database(database_path, migrations=WORKSHOP_MIGRATIONS)
                second = upgrade_database(database_path, migrations=WORKSHOP_MIGRATIONS)

            self.assertIn("0007_workshop_oil_change", first.applied)
            self.assertEqual(second.applied, ())
            with sqlite3.connect(database_path) as connection:
                tables = {
                    row[0]
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type='table'"
                    )
                }
                identity = connection.execute(
                    "SELECT application_id, profile_id FROM business_configuration WHERE id = 1"
                ).fetchone()
            self.assertTrue(
                {"workshop_vehicles", "workshop_jobs", "workshop_job_lines"} <= tables
            )
            self.assertEqual(identity, ("workshop", "workshop"))


if __name__ == "__main__":
    unittest.main()
