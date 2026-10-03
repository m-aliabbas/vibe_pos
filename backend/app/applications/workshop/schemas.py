from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class VehicleCreate(BaseModel):
    customer_id: int
    registration_number: str | None = Field(default=None, max_length=64)
    make: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    model_year: int | None = Field(default=None, ge=1900, le=2200)
    engine: str | None = Field(default=None, max_length=120)
    current_mileage: int | None = Field(default=None, ge=0)


class VehicleResponse(VehicleCreate):
    id: int
    vehicle_id: str
    next_oil_change_mileage: int | None = None
    last_oil_change_at: datetime | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobLineCreate(BaseModel):
    product_id: int
    variation_id: int | None = None
    quantity: float = Field(gt=0)
    unit: str = Field(default="piece", min_length=1, max_length=64)
    unit_price: float | None = Field(default=None, ge=0)
    item_discount: float = Field(default=0.0, ge=0)


class JobLineResponse(BaseModel):
    id: int
    product_id: int
    variation_id: int | None = None
    description: str
    quantity: float
    unit: str
    unit_price: float
    item_discount: float
    total_price: float

    model_config = {"from_attributes": True}


class JobCreate(BaseModel):
    vehicle_id: int
    current_mileage: int = Field(ge=0)
    oil_change_interval: int = Field(gt=0)
    technician_id: int | None = None
    notes: str | None = None
    discount: float = Field(default=0.0, ge=0)
    tax: float = Field(default=0.0, ge=0)
    lines: list[JobLineCreate] = Field(min_length=1)


class JobUpdate(BaseModel):
    status: Literal["open", "in_progress", "cancelled"] | None = None
    technician_id: int | None = None
    notes: str | None = None


class JobComplete(BaseModel):
    payment_method: Literal["cash", "card", "mobile", "other"] = "cash"
    amount_paid: float | None = Field(default=None, ge=0)


class JobResponse(BaseModel):
    id: int
    job_number: str
    vehicle_id: int
    customer_id: int
    technician_id: int | None = None
    sale_id: int | None = None
    status: str
    previous_mileage: int | None = None
    current_mileage: int
    oil_change_interval: int
    next_oil_change_mileage: int
    notes: str | None = None
    subtotal: float
    discount: float
    tax: float
    total: float
    payment_method: str | None = None
    amount_paid: float
    amount_due: float
    created_at: datetime
    completed_at: datetime | None = None
    updated_at: datetime
    lines: list[JobLineResponse]
    vehicle_identifier: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None

    model_config = {"from_attributes": True}


class DueReminderResponse(BaseModel):
    vehicle_id: int
    vehicle_identifier: str
    customer_id: int
    customer_name: str | None = None
    customer_phone: str | None = None
    current_mileage: int | None = None
    next_oil_change_mileage: int
    kilometres_remaining: int | None = None
