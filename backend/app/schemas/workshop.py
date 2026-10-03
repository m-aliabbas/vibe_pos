from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

JobStatus = Literal["open", "in_progress", "ready", "delivered"]
LineKind = Literal["oil", "part", "labour"]


class VehicleBase(BaseModel):
    plate_number: str = Field(min_length=1, max_length=20)
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = Field(default=None, ge=1900, le=2100)
    engine_oil_type: Optional[str] = None
    notes: Optional[str] = None


class VehicleOut(VehicleBase):
    id: int
    customer_id: int

    class Config:
        from_attributes = True


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1)
    whatsapp: str = Field(min_length=5)
    vehicle: VehicleBase


class CustomerOut(BaseModel):
    id: int
    name: str
    whatsapp: str
    vehicles: List[VehicleOut] = []

    class Config:
        from_attributes = True


class ServiceRecordOut(BaseModel):
    id: int
    vehicle_id: int
    job_id: int
    item_type: str
    description: Optional[str] = None
    odometer_km: int
    service_date: date
    interval_km: Optional[int] = None
    interval_months: Optional[int] = None
    next_due_km: Optional[int] = None
    next_due_date: Optional[date] = None

    class Config:
        from_attributes = True


class JobLineIn(BaseModel):
    kind: LineKind
    description: Optional[str] = None
    oil_product_id: Optional[int] = None
    quantity: float = Field(gt=0)
    unit_price: Optional[float] = Field(default=None, ge=0)
    interval_km: Optional[int] = Field(default=None, gt=0)
    interval_months: Optional[int] = Field(default=None, gt=0)


class JobLineOut(BaseModel):
    id: int
    kind: str
    description: str
    oil_product_id: Optional[int] = None
    quantity: float
    unit_price: float
    interval_km: Optional[int] = None
    interval_months: Optional[int] = None

    class Config:
        from_attributes = True


class JobCreate(BaseModel):
    vehicle_id: int
    odometer_km: int = Field(ge=0)
    complaint: Optional[str] = None
    check_in_notes: Optional[str] = None
    mechanic: Optional[str] = None


class JobUpdate(BaseModel):
    status: Optional[JobStatus] = None
    mechanic: Optional[str] = None
    complaint: Optional[str] = None
    check_in_notes: Optional[str] = None
    discount: Optional[float] = Field(default=None, ge=0)


class JobOut(BaseModel):
    id: int
    vehicle_id: int
    plate_number: str
    customer_name: str
    whatsapp: str
    odometer_km: int
    complaint: Optional[str] = None
    check_in_notes: Optional[str] = None
    mechanic: Optional[str] = None
    status: str
    discount: float
    subtotal: float
    total: float
    created_at: datetime
    delivered_at: Optional[datetime] = None
    lines: List[JobLineOut] = []
    service_records: List[ServiceRecordOut] = []
    warnings: List[str] = []
    whatsapp_link: Optional[str] = None


class OilProductIn(BaseModel):
    name: str = Field(min_length=1)
    grade: Optional[str] = None
    container_litres: float = Field(gt=0)
    sealed_containers: int = Field(default=0, ge=0)
    open_litres: float = Field(default=0, ge=0)
    price_per_litre: float = Field(default=0, ge=0)
    cost_per_container: float = Field(default=0, ge=0)
    default_interval_km: Optional[int] = Field(default=None, gt=0)
    default_interval_months: Optional[int] = Field(default=None, gt=0)
    low_stock_containers: int = Field(default=2, ge=0)


class OilProductOut(OilProductIn):
    id: int
    total_litres: float
    low_stock: bool
    opened_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class StockAdjust(BaseModel):
    add_sealed_containers: int = 0
    wastage_litres: float = Field(default=0, ge=0)  # spillage, drained from stock


class DueService(BaseModel):
    vehicle_id: int
    plate_number: str
    customer_name: str
    whatsapp: str
    item_type: str
    last_service_km: int
    next_due_km: Optional[int] = None
    next_due_date: Optional[date] = None
    current_km: int
    overdue: bool
    whatsapp_link: str
