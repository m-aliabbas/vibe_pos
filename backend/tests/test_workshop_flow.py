import unittest

from fastapi import HTTPException
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.applications.workshop import oil_stock
from app.api.v1.endpoints import workshop as api
from app.db.session import Base
from app.models.workshop import OilProduct
from app.schemas import workshop as schemas
import app.models.workshop  # noqa: F401


def _oil(**kw):
    return OilProduct(name="Oil", container_litres=4.0, sealed_containers=2, open_litres=0.0, **kw)


class OpenBottleTests(unittest.TestCase):
    def test_sells_from_open_bottle_first(self) -> None:
        oil = _oil()
        oil_stock.consume(oil, 1, datetime.now())
        self.assertEqual((oil.sealed_containers, oil.open_litres), (1, 3.0))
        oil_stock.consume(oil, 3, datetime.now())
        self.assertEqual((oil.sealed_containers, oil.open_litres), (1, 0.0))

    def test_spans_containers_and_rejects_shortage(self) -> None:
        oil = _oil()
        oil_stock.consume(oil, 1, datetime.now())
        oil_stock.consume(oil, 5.5, datetime.now())
        self.assertEqual((oil.sealed_containers, oil.open_litres), (0, 1.5))
        with self.assertRaises(oil_stock.InsufficientOilStock):
            oil_stock.consume(oil, 2, datetime.now())
        self.assertEqual(oil.open_litres, 1.5)

    def test_restore_reseals_full_containers(self) -> None:
        oil = _oil()
        oil_stock.consume(oil, 1, datetime.now())
        oil_stock.restore(oil, 1)
        self.assertEqual((oil.sealed_containers, oil.open_litres), (2, 0.0))


class JobFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.user = None

    def test_full_oil_change_flow(self) -> None:
        customer = api.register_customer(
            schemas.RegisterRequest(
                name="Ali", whatsapp="+92 300 1234567",
                vehicle=schemas.VehicleBase(plate_number="abc-123"),
            ), self.db, self.user,
        )
        self.assertEqual(customer.whatsapp, "923001234567")
        found = api.lookup("abc 123", self.db, self.user)
        self.assertEqual(found[0].vehicles[0].plate_number, "ABC123")
        oil = api.create_oil(
            schemas.OilProductIn(
                name="Engine Oil", grade="5W-30", container_litres=4, sealed_containers=3,
                price_per_litre=1000, cost_per_container=3200, default_interval_km=5000,
                default_interval_months=6,
            ), self.db, self.user,
        )
        vehicle_id = customer.vehicles[0].id
        job = api.create_job(schemas.JobCreate(vehicle_id=vehicle_id, odometer_km=40000), self.db, self.user)
        job = api.add_line(job.id, schemas.JobLineIn(kind="oil", oil_product_id=oil.id, quantity=3.5), self.db, self.user)
        job = api.add_line(job.id, schemas.JobLineIn(kind="labour", description="Labour", unit_price=500, quantity=1), self.db, self.user)
        self.assertEqual(job.total, 4000.0)
        self.assertEqual(api.list_oil(self.db, self.user)[0].open_litres, 0.5)
        with self.assertRaises(HTTPException) as raised:
            api.update_job(job.id, schemas.JobUpdate(status="delivered"), self.db, self.user)
        self.assertEqual(raised.exception.status_code, 400)
        for status in ("in_progress", "ready", "delivered"):
            job = api.update_job(job.id, schemas.JobUpdate(status=status), self.db, self.user)
        record = job.service_records[0]
        self.assertEqual(record.next_due_km, 45000)
        self.assertIsNotNone(record.next_due_date)
        self.assertIn("wa.me/923001234567", job.whatsapp_link)
        lower = api.create_job(schemas.JobCreate(vehicle_id=vehicle_id, odometer_km=39000), self.db, self.user)
        self.assertTrue(lower.warnings)
        due = api.due_services(within_days=14, within_km=500, db=self.db, current_user=self.user)
        self.assertEqual(due, [])
        self.assertEqual(len(api.due_services(within_days=14, within_km=6000, db=self.db, current_user=self.user)), 1)


if __name__ == "__main__":
    unittest.main()
