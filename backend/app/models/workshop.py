from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String as SQLString, Text, Boolean
from sqlalchemy.orm import relationship

from app.core.timezone import now_pkt
from app.db.session import Base

String = SQLString(255)


class WorkshopCustomer(Base):
    __tablename__ = "workshop_customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    whatsapp = Column(String, unique=True, index=True, nullable=False)  # digits only, with country code
    created_at = Column(DateTime, default=now_pkt)

    vehicles = relationship("Vehicle", back_populates="customer", cascade="all, delete-orphan")


class Vehicle(Base):
    __tablename__ = "workshop_vehicles"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("workshop_customers.id"), nullable=False, index=True)
    plate_number = Column(String, unique=True, index=True, nullable=False)  # normalized upper-case, no spaces
    make = Column(String, nullable=True)
    model = Column(String, nullable=True)
    year = Column(Integer, nullable=True)
    engine_oil_type = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=now_pkt)

    customer = relationship("WorkshopCustomer", back_populates="vehicles")
    job_cards = relationship("JobCard", back_populates="vehicle")


class OilProduct(Base):
    """Oil sold by the litre from sealed containers; opened containers are tracked in litres."""

    __tablename__ = "workshop_oil_products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    grade = Column(String, nullable=True)  # e.g. 5W-30
    container_litres = Column(Float, nullable=False)  # e.g. 4.0
    sealed_containers = Column(Integer, nullable=False, default=0)
    open_litres = Column(Float, nullable=False, default=0.0)
    price_per_litre = Column(Float, nullable=False, default=0.0)
    cost_per_container = Column(Float, nullable=False, default=0.0)
    default_interval_km = Column(Integer, nullable=True)
    default_interval_months = Column(Integer, nullable=True)
    low_stock_containers = Column(Integer, nullable=False, default=2)
    opened_at = Column(DateTime, nullable=True)  # when the current open container was opened
    is_active = Column(Boolean, nullable=False, default=True)


class JobCard(Base):
    __tablename__ = "workshop_job_cards"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("workshop_vehicles.id"), nullable=False, index=True)
    odometer_km = Column(Integer, nullable=False)
    complaint = Column(Text, nullable=True)
    check_in_notes = Column(Text, nullable=True)
    mechanic = Column(String, nullable=True)
    status = Column(String, nullable=False, default="open", index=True)  # open, in_progress, ready, delivered
    discount = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=now_pkt, index=True)
    delivered_at = Column(DateTime, nullable=True)

    vehicle = relationship("Vehicle", back_populates="job_cards")
    lines = relationship("JobLine", back_populates="job", cascade="all, delete-orphan")


class JobLine(Base):
    __tablename__ = "workshop_job_lines"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("workshop_job_cards.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)  # oil, part, labour
    description = Column(String, nullable=False)
    oil_product_id = Column(Integer, ForeignKey("workshop_oil_products.id"), nullable=True)
    quantity = Column(Float, nullable=False, default=1.0)  # litres for oil
    unit_price = Column(Float, nullable=False, default=0.0)
    unit_cost = Column(Float, nullable=False, default=0.0)
    interval_km = Column(Integer, nullable=True)
    interval_months = Column(Integer, nullable=True)

    job = relationship("JobCard", back_populates="lines")
    oil_product = relationship("OilProduct")


class ServiceRecord(Base):
    """Created on delivery for every line that carries a service interval."""

    __tablename__ = "workshop_service_records"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("workshop_vehicles.id"), nullable=False, index=True)
    job_id = Column(Integer, ForeignKey("workshop_job_cards.id"), nullable=False, index=True)
    item_type = Column(String, nullable=False)  # e.g. "Engine oil", "Oil filter"
    description = Column(String, nullable=True)
    odometer_km = Column(Integer, nullable=False)
    service_date = Column(Date, nullable=False)
    interval_km = Column(Integer, nullable=True)
    interval_months = Column(Integer, nullable=True)
    next_due_km = Column(Integer, nullable=True)
    next_due_date = Column(Date, nullable=True)
