from __future__ import annotations

from app.core.timezone import now_pkt
from app.db.session import Base
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship


class WorkshopVehicle(Base):
    __tablename__ = "workshop_vehicles"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    vehicle_id = Column(String(64), nullable=False, unique=True, index=True)
    registration_number = Column(String(64), nullable=True, unique=True, index=True)
    make = Column(String(120), nullable=True)
    model = Column(String(120), nullable=True)
    model_year = Column(Integer, nullable=True)
    engine = Column(String(120), nullable=True)
    current_mileage = Column(Integer, nullable=True)
    next_oil_change_mileage = Column(Integer, nullable=True, index=True)
    last_oil_change_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now_pkt, nullable=False)
    updated_at = Column(DateTime, default=now_pkt, onupdate=now_pkt, nullable=False)

    customer = relationship("Customer")
    jobs = relationship(
        "WorkshopJob",
        back_populates="vehicle",
        cascade="all, delete-orphan",
        order_by="WorkshopJob.created_at.desc()",
    )

    @property
    def customer_name(self):
        return self.customer.name if self.customer else None

    @property
    def customer_phone(self):
        return self.customer.phone if self.customer else None


class WorkshopJob(Base):
    __tablename__ = "workshop_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_number = Column(String(64), nullable=False, unique=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("workshop_vehicles.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    technician_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=True, unique=True)
    status = Column(String(32), nullable=False, default="open", index=True)
    previous_mileage = Column(Integer, nullable=True)
    current_mileage = Column(Integer, nullable=False)
    oil_change_interval = Column(Integer, nullable=False)
    next_oil_change_mileage = Column(Integer, nullable=False, index=True)
    notes = Column(Text, nullable=True)
    subtotal = Column(Float, nullable=False, default=0.0)
    discount = Column(Float, nullable=False, default=0.0)
    tax = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False, default=0.0)
    payment_method = Column(String(32), nullable=True)
    amount_paid = Column(Float, nullable=False, default=0.0)
    amount_due = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=now_pkt, nullable=False, index=True)
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=now_pkt, onupdate=now_pkt, nullable=False)

    vehicle = relationship("WorkshopVehicle", back_populates="jobs")
    customer = relationship("Customer")
    technician = relationship("User")
    sale = relationship("Sale")
    lines = relationship(
        "WorkshopJobLine",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="WorkshopJobLine.id",
    )

    @property
    def vehicle_identifier(self):
        if not self.vehicle:
            return None
        return self.vehicle.registration_number or self.vehicle.vehicle_id

    @property
    def customer_name(self):
        return self.customer.name if self.customer else None

    @property
    def customer_phone(self):
        return self.customer.phone if self.customer else None


class WorkshopJobLine(Base):
    __tablename__ = "workshop_job_lines"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("workshop_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    variation_id = Column(Integer, ForeignKey("product_variations.id"), nullable=True)
    description = Column(String(255), nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String(64), nullable=False)
    unit_price = Column(Float, nullable=False)
    item_discount = Column(Float, nullable=False, default=0.0)
    total_price = Column(Float, nullable=False)

    job = relationship("WorkshopJob", back_populates="lines")
    product = relationship("Product")
    variation = relationship("ProductVariation")
