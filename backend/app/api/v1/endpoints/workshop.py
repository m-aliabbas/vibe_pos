import re
from datetime import date, timedelta
from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.applications.workshop import oil_stock
from app.core.timezone import now_pkt
from app.models.user import User
from app.models.workshop import (
    JobCard,
    JobLine,
    OilProduct,
    ServiceRecord,
    Vehicle,
    WorkshopCustomer,
)
from app.schemas import workshop as schemas

router = APIRouter()

_FLOW = {"open": "in_progress", "in_progress": "ready", "ready": "delivered"}


def _plate(value: str) -> str:
    return re.sub(r"[\s-]+", "", value).upper()


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value)


def _link(whatsapp: str, text: str) -> str:
    return f"https://wa.me/{whatsapp}?text={quote(text)}"


def _oil_dict(oil: OilProduct) -> schemas.OilProductOut:
    return schemas.OilProductOut(
        id=oil.id, name=oil.name, grade=oil.grade, container_litres=oil.container_litres,
        sealed_containers=oil.sealed_containers or 0, open_litres=oil.open_litres or 0.0,
        price_per_litre=oil.price_per_litre or 0.0, cost_per_container=oil.cost_per_container or 0.0,
        default_interval_km=oil.default_interval_km, default_interval_months=oil.default_interval_months,
        low_stock_containers=oil.low_stock_containers or 0,
        total_litres=oil_stock.total_litres(oil),
        low_stock=(oil.sealed_containers or 0) <= (oil.low_stock_containers or 0),
        opened_at=oil.opened_at,
    )


def _job_out(db: Session, job: JobCard, warnings: Optional[List[str]] = None) -> schemas.JobOut:
    subtotal = round(sum(line.quantity * line.unit_price for line in job.lines), 2)
    records = db.query(ServiceRecord).filter(ServiceRecord.job_id == job.id).all()
    customer = job.vehicle.customer
    link = None
    if job.status in ("ready", "delivered"):
        text = f"Hello {customer.name}, your vehicle {job.vehicle.plate_number} is "
        text += "ready for pickup." if job.status == "ready" else "serviced. Thank you!"
        for record in records:
            if record.next_due_km or record.next_due_date:
                text += f" Next {record.item_type} due: {record.next_due_km or '-'} km / {record.next_due_date or '-'}."
        link = _link(customer.whatsapp, text)
    return schemas.JobOut(
        id=job.id, vehicle_id=job.vehicle_id, plate_number=job.vehicle.plate_number,
        customer_name=customer.name, whatsapp=customer.whatsapp, odometer_km=job.odometer_km,
        complaint=job.complaint, check_in_notes=job.check_in_notes, mechanic=job.mechanic,
        status=job.status, discount=job.discount or 0.0, subtotal=subtotal,
        total=round(max(subtotal - (job.discount or 0.0), 0.0), 2),
        created_at=job.created_at, delivered_at=job.delivered_at,
        lines=[schemas.JobLineOut(
            id=l.id, kind=l.kind, description=l.description, oil_product_id=l.oil_product_id,
            quantity=l.quantity, unit_price=l.unit_price, interval_km=l.interval_km,
            interval_months=l.interval_months,
        ) for l in job.lines],
        service_records=[schemas.ServiceRecordOut(
            id=r.id, vehicle_id=r.vehicle_id, job_id=r.job_id, item_type=r.item_type,
            description=r.description, odometer_km=r.odometer_km, service_date=r.service_date,
            interval_km=r.interval_km, interval_months=r.interval_months,
            next_due_km=r.next_due_km, next_due_date=r.next_due_date,
        ) for r in records],
        warnings=warnings or [], whatsapp_link=link,
    )


def _get_job(db: Session, job_id: int) -> JobCard:
    job = (
        db.query(JobCard)
        .options(joinedload(JobCard.vehicle).joinedload(Vehicle.customer), joinedload(JobCard.lines))
        .filter(JobCard.id == job_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job card not found")
    return job


# ---------- customers & vehicles ----------

@router.post("/customers", response_model=schemas.CustomerOut)
def register_customer(
    payload: schemas.RegisterRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    whatsapp = _digits(payload.whatsapp)
    plate = _plate(payload.vehicle.plate_number)
    if len(whatsapp) < 5 or not plate:
        raise HTTPException(status_code=400, detail="Valid WhatsApp number and plate number are required")
    if db.query(Vehicle).filter(Vehicle.plate_number == plate).first():
        raise HTTPException(status_code=400, detail="Vehicle plate is already registered")
    customer = db.query(WorkshopCustomer).filter(WorkshopCustomer.whatsapp == whatsapp).first()
    if not customer:
        customer = WorkshopCustomer(name=payload.name.strip(), whatsapp=whatsapp)
        db.add(customer)
        db.flush()
    vehicle_data = payload.vehicle.dict()
    vehicle_data["plate_number"] = plate
    db.add(Vehicle(customer_id=customer.id, **vehicle_data))
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/lookup", response_model=List[schemas.CustomerOut])
def lookup(
    q: str = Query(min_length=2),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Find customers by WhatsApp number or plate number."""
    digits, plate = _digits(q), _plate(q)
    conditions = [Vehicle.plate_number.like(f"%{plate}%")]
    if digits:
        conditions.append(WorkshopCustomer.whatsapp.like(f"%{digits}%"))
    return (
        db.query(WorkshopCustomer)
        .outerjoin(Vehicle)
        .filter(or_(*conditions))
        .options(joinedload(WorkshopCustomer.vehicles))
        .distinct()
        .limit(20)
        .all()
    )


@router.post("/customers/{customer_id}/vehicles", response_model=schemas.VehicleOut)
def add_vehicle(
    customer_id: int,
    payload: schemas.VehicleBase,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not db.query(WorkshopCustomer).get(customer_id):
        raise HTTPException(status_code=404, detail="Customer not found")
    data = payload.dict()
    data["plate_number"] = _plate(payload.plate_number)
    if db.query(Vehicle).filter(Vehicle.plate_number == data["plate_number"]).first():
        raise HTTPException(status_code=400, detail="Vehicle plate is already registered")
    vehicle = Vehicle(customer_id=customer_id, **data)
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.get("/vehicles/{vehicle_id}/history", response_model=List[schemas.ServiceRecordOut])
def vehicle_history(
    vehicle_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return (
        db.query(ServiceRecord)
        .filter(ServiceRecord.vehicle_id == vehicle_id)
        .order_by(ServiceRecord.service_date.desc(), ServiceRecord.id.desc())
        .all()
    )


# ---------- oil stock ----------

@router.get("/oil", response_model=List[schemas.OilProductOut])
def list_oil(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return [_oil_dict(o) for o in db.query(OilProduct).filter(OilProduct.is_active.is_(True)).order_by(OilProduct.name)]


@router.post("/oil", response_model=schemas.OilProductOut)
def create_oil(
    payload: schemas.OilProductIn,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    if payload.open_litres >= payload.container_litres:
        raise HTTPException(status_code=400, detail="Open litres must be less than the container size")
    oil = OilProduct(**payload.dict())
    db.add(oil)
    db.commit()
    db.refresh(oil)
    return _oil_dict(oil)


@router.post("/oil/{oil_id}/adjust", response_model=schemas.OilProductOut)
def adjust_oil(
    oil_id: int,
    payload: schemas.StockAdjust,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
):
    oil = db.query(OilProduct).get(oil_id)
    if not oil:
        raise HTTPException(status_code=404, detail="Oil product not found")
    if oil.sealed_containers + payload.add_sealed_containers < 0:
        raise HTTPException(status_code=400, detail="Sealed containers cannot go negative")
    oil.sealed_containers += payload.add_sealed_containers
    try:
        if payload.wastage_litres:
            oil_stock.consume(oil, payload.wastage_litres, now_pkt())
    except oil_stock.InsufficientOilStock as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    return _oil_dict(oil)


# ---------- job cards ----------

@router.post("/jobs", response_model=schemas.JobOut)
def create_job(
    payload: schemas.JobCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    vehicle = db.query(Vehicle).options(joinedload(Vehicle.customer)).get(payload.vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    warnings = []
    last_km = db.query(JobCard.odometer_km).filter(JobCard.vehicle_id == vehicle.id).order_by(
        JobCard.odometer_km.desc()
    ).first()
    if last_km and payload.odometer_km < last_km[0]:
        warnings.append(
            f"Odometer {payload.odometer_km} km is lower than the previous reading of {last_km[0]} km"
        )
    job = JobCard(**payload.dict())
    db.add(job)
    db.commit()
    return _job_out(db, _get_job(db, job.id), warnings)


@router.get("/jobs", response_model=List[schemas.JobOut])
def list_jobs(
    status: Optional[schemas.JobStatus] = None,
    active_only: bool = False,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Queue board: active_only hides delivered cars."""
    query = db.query(JobCard).options(
        joinedload(JobCard.vehicle).joinedload(Vehicle.customer), joinedload(JobCard.lines)
    )
    if status:
        query = query.filter(JobCard.status == status)
    if active_only:
        query = query.filter(JobCard.status != "delivered")
    return [_job_out(db, j) for j in query.order_by(JobCard.created_at.desc()).limit(200).unique().all()]


@router.get("/jobs/{job_id}", response_model=schemas.JobOut)
def get_job(
    job_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return _job_out(db, _get_job(db, job_id))


@router.post("/jobs/{job_id}/lines", response_model=schemas.JobOut)
def add_line(
    job_id: int,
    payload: schemas.JobLineIn,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    job = _get_job(db, job_id)
    if job.status == "delivered":
        raise HTTPException(status_code=400, detail="Delivered job cards cannot be changed")
    line = JobLine(
        job_id=job.id, kind=payload.kind, quantity=payload.quantity,
        interval_km=payload.interval_km, interval_months=payload.interval_months,
    )
    if payload.kind == "oil":
        oil = db.query(OilProduct).get(payload.oil_product_id) if payload.oil_product_id else None
        if not oil or not oil.is_active:
            raise HTTPException(status_code=400, detail="An active oil product is required for oil lines")
        try:
            oil_stock.consume(oil, payload.quantity, now_pkt())
        except oil_stock.InsufficientOilStock as exc:
            db.rollback()
            raise HTTPException(status_code=400, detail=str(exc))
        line.oil_product_id = oil.id
        line.description = payload.description or f"{oil.name} {oil.grade or ''}".strip()
        line.unit_price = oil.price_per_litre if payload.unit_price is None else payload.unit_price
        line.unit_cost = (oil.cost_per_container / oil.container_litres) if oil.container_litres else 0.0
        line.interval_km = payload.interval_km or oil.default_interval_km
        line.interval_months = payload.interval_months or oil.default_interval_months
    else:
        if not payload.description:
            raise HTTPException(status_code=400, detail="Description is required")
        line.description = payload.description
        line.unit_price = payload.unit_price or 0.0
    db.add(line)
    db.commit()
    return _job_out(db, _get_job(db, job_id))


@router.delete("/jobs/{job_id}/lines/{line_id}", response_model=schemas.JobOut)
def remove_line(
    job_id: int,
    line_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    job = _get_job(db, job_id)
    if job.status == "delivered":
        raise HTTPException(status_code=400, detail="Delivered job cards cannot be changed")
    line = next((l for l in job.lines if l.id == line_id), None)
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    if line.kind == "oil" and line.oil_product_id:
        oil = db.query(OilProduct).get(line.oil_product_id)
        if oil:
            oil_stock.restore(oil, line.quantity)
    db.delete(line)
    db.commit()
    return _job_out(db, _get_job(db, job_id))


@router.patch("/jobs/{job_id}", response_model=schemas.JobOut)
def update_job(
    job_id: int,
    payload: schemas.JobUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    job = _get_job(db, job_id)
    if job.status == "delivered":
        raise HTTPException(status_code=400, detail="Delivered job cards cannot be changed")
    data = payload.dict(exclude_unset=True)
    new_status = data.pop("status", None)
    if "discount" in data and data["discount"] is not None:
        subtotal = sum(l.quantity * l.unit_price for l in job.lines)
        if data["discount"] > subtotal + 1e-9:
            raise HTTPException(status_code=400, detail="Discount cannot exceed the job subtotal")
    if new_status and new_status != job.status and _FLOW.get(job.status) != new_status:
        raise HTTPException(status_code=400, detail=f"Cannot move from {job.status} to {new_status}")
    for key, value in data.items():
        setattr(job, key, value)
    if new_status and new_status != job.status:
        job.status = new_status
        if new_status == "delivered":
            _record_services(db, job)
            job.delivered_at = now_pkt()
    db.commit()
    return _job_out(db, _get_job(db, job_id))


def _record_services(db: Session, job: JobCard) -> None:
    today = now_pkt().date()
    for line in job.lines:
        if not (line.interval_km or line.interval_months):
            continue
        db.add(ServiceRecord(
            vehicle_id=job.vehicle_id, job_id=job.id,
            item_type="Engine oil" if line.kind == "oil" else line.description,
            description=line.description, odometer_km=job.odometer_km, service_date=today,
            interval_km=line.interval_km, interval_months=line.interval_months,
            next_due_km=job.odometer_km + line.interval_km if line.interval_km else None,
            next_due_date=oil_stock.add_months(today, line.interval_months) if line.interval_months else None,
        ))


# ---------- reminders ----------

@router.get("/due-services", response_model=List[schemas.DueService])
def due_services(
    within_days: int = Query(14, ge=0),
    within_km: int = Query(500, ge=0),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Latest record per vehicle+item that is overdue or due soon by date or kilometres."""
    horizon = now_pkt().date() + timedelta(days=within_days)
    today = now_pkt().date()
    latest: dict = {}
    for r in db.query(ServiceRecord).order_by(ServiceRecord.service_date, ServiceRecord.id).all():
        latest[(r.vehicle_id, r.item_type)] = r
    result = []
    for (vehicle_id, _), r in latest.items():
        vehicle = db.query(Vehicle).options(joinedload(Vehicle.customer)).get(vehicle_id)
        current_km = db.query(JobCard.odometer_km).filter(JobCard.vehicle_id == vehicle_id).order_by(
            JobCard.odometer_km.desc()
        ).first()[0]
        km_due = r.next_due_km is not None and current_km + within_km >= r.next_due_km
        date_due = r.next_due_date is not None and r.next_due_date <= horizon
        if not (km_due or date_due):
            continue
        overdue = (r.next_due_km is not None and current_km >= r.next_due_km) or (
            r.next_due_date is not None and r.next_due_date < today
        )
        text = (
            f"Hello {vehicle.customer.name}, your {r.item_type} service for {vehicle.plate_number} "
            f"is due ({r.next_due_km or '-'} km / {r.next_due_date or '-'}). Please visit us."
        )
        result.append(schemas.DueService(
            vehicle_id=vehicle_id, plate_number=vehicle.plate_number,
            customer_name=vehicle.customer.name, whatsapp=vehicle.customer.whatsapp,
            item_type=r.item_type, last_service_km=r.odometer_km, next_due_km=r.next_due_km,
            next_due_date=r.next_due_date, current_km=current_km, overdue=overdue,
            whatsapp_link=_link(vehicle.customer.whatsapp, text),
        ))
    return sorted(result, key=lambda d: (not d.overdue, d.next_due_date or date.max))
