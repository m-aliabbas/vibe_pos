from __future__ import annotations

import json
from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.applications.workshop.models import WorkshopJob, WorkshopJobLine, WorkshopVehicle
from app.applications.workshop.schemas import (
    DueReminderResponse,
    JobComplete,
    JobCreate,
    JobResponse,
    JobUpdate,
    VehicleCreate,
    VehicleResponse,
)
from app.core.timezone import now_pkt
from app.models.customer import Customer
from app.models.product import Product, ProductVariation
from app.models.sale import Sale
from app.models.user import User
from app.platform.pos.catalog import CatalogItemType
from app.platform.pos.sales import PosSaleCommand, PosSaleLineCommand, PosSaleService
from app.services import accounting as accounting_service


router = APIRouter()


def _selling_units(product: Product) -> list[dict]:
    value = product.selling_units or []
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, json.JSONDecodeError):
            return []
    return value if isinstance(value, list) else []


def _job_query(db: Session):
    return db.query(WorkshopJob).options(
        joinedload(WorkshopJob.vehicle),
        joinedload(WorkshopJob.customer),
        joinedload(WorkshopJob.lines),
    )


@router.get("/vehicles", response_model=list[VehicleResponse])
def list_vehicles(
    search: str | None = None,
    customer_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(deps.get_db),
    _: User = Depends(deps.get_current_user),
):
    query = db.query(WorkshopVehicle).options(joinedload(WorkshopVehicle.customer))
    if customer_id is not None:
        query = query.filter(WorkshopVehicle.customer_id == customer_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.join(Customer).filter(
            or_(
                WorkshopVehicle.vehicle_id.ilike(term),
                WorkshopVehicle.registration_number.ilike(term),
                WorkshopVehicle.make.ilike(term),
                WorkshopVehicle.model.ilike(term),
                Customer.customer_id.ilike(term),
                Customer.name.ilike(term),
                Customer.phone.ilike(term),
            )
        )
    return query.order_by(WorkshopVehicle.updated_at.desc()).limit(limit).all()


@router.post("/vehicles", response_model=VehicleResponse, status_code=201)
def create_vehicle(
    payload: VehicleCreate,
    db: Session = Depends(deps.get_db),
    _: User = Depends(deps.get_current_user),
):
    customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    registration = payload.registration_number.strip().upper() if payload.registration_number else None
    existing = db.query(WorkshopVehicle.id).filter(
        WorkshopVehicle.registration_number == registration
    ).first() if registration else None
    if existing:
        raise HTTPException(status_code=409, detail="Registration number already exists")

    vehicle = WorkshopVehicle(
        **payload.model_dump(exclude={"registration_number"}),
        vehicle_id=f"PENDING-{uuid4().hex.upper()}",
        registration_number=registration,
    )
    try:
        db.add(vehicle)
        db.flush()
        generated_id = f"VH-{vehicle.id:04d}"
        if db.query(WorkshopVehicle.id).filter(
            WorkshopVehicle.vehicle_id == generated_id,
            WorkshopVehicle.id != vehicle.id,
        ).first():
            generated_id = f"{generated_id}-{uuid4().hex[:4].upper()}"
        vehicle.vehicle_id = generated_id
        db.add(vehicle)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Registration number already exists") from exc
    return db.query(WorkshopVehicle).options(joinedload(WorkshopVehicle.customer)).filter(
        WorkshopVehicle.id == vehicle.id
    ).one()


@router.get("/vehicles/{vehicle_id}", response_model=VehicleResponse)
def get_vehicle(
    vehicle_id: int,
    db: Session = Depends(deps.get_db),
    _: User = Depends(deps.get_current_user),
):
    vehicle = db.query(WorkshopVehicle).options(joinedload(WorkshopVehicle.customer)).filter(
        WorkshopVehicle.id == vehicle_id
    ).first()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.get("/jobs", response_model=list[JobResponse])
def list_jobs(
    status: str | None = None,
    search: str | None = None,
    customer_id: int | None = None,
    sale_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(deps.get_db),
    _: User = Depends(deps.get_current_user),
):
    query = _job_query(db)
    if status:
        query = query.filter(WorkshopJob.status == status)
    if customer_id is not None:
        query = query.filter(WorkshopJob.customer_id == customer_id)
    if sale_id is not None:
        query = query.filter(WorkshopJob.sale_id == sale_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.join(WorkshopVehicle).join(Customer).filter(
            or_(
                WorkshopJob.job_number.ilike(term),
                WorkshopVehicle.vehicle_id.ilike(term),
                WorkshopVehicle.registration_number.ilike(term),
                Customer.customer_id.ilike(term),
                Customer.name.ilike(term),
                Customer.phone.ilike(term),
            )
        )
    return query.order_by(WorkshopJob.created_at.desc()).limit(limit).all()


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(
    job_id: int,
    db: Session = Depends(deps.get_db),
    _: User = Depends(deps.get_current_user),
):
    job = _job_query(db).filter(WorkshopJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Workshop job not found")
    return job


@router.post("/jobs", response_model=JobResponse, status_code=201)
def create_job(
    payload: JobCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    vehicle = db.query(WorkshopVehicle).filter(WorkshopVehicle.id == payload.vehicle_id).first()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    previous_mileage = vehicle.current_mileage
    if previous_mileage is not None and payload.current_mileage < previous_mileage:
        raise HTTPException(
            status_code=400,
            detail=f"Current mileage cannot be below previous reading {previous_mileage}",
        )

    product_ids = {line.product_id for line in payload.lines}
    products = {
        product.id: product
        for product in db.query(Product).filter(Product.id.in_(product_ids)).all()
    }
    missing = sorted(product_ids - set(products))
    if missing:
        raise HTTPException(status_code=404, detail=f"Products not found: {missing}")

    variation_ids = {line.variation_id for line in payload.lines if line.variation_id is not None}
    variations = {
        variation.id: variation
        for variation in db.query(ProductVariation).filter(ProductVariation.id.in_(variation_ids)).all()
    } if variation_ids else {}
    for line in payload.lines:
        if line.variation_id is not None:
            variation = variations.get(line.variation_id)
            if variation is None or variation.product_id != line.product_id:
                raise HTTPException(status_code=400, detail="Product variation does not match its product")

    command = PosSaleCommand(
        user_id=current_user.id,
        lines=tuple(
            PosSaleLineCommand(
                product_id=line.product_id,
                variation_id=line.variation_id,
                quantity=line.quantity,
                unit=line.unit,
                item_discount=line.item_discount,
                unit_price=line.unit_price,
            )
            for line in payload.lines
        ),
        payment_method="cash",
        discount=payload.discount,
        tax=payload.tax,
        delivery_charges=0.0,
        amount_paid=None,
    )
    try:
        calculations, subtotal, total = PosSaleService.calculate_lines(
            command,
            products,
            variations,
            _selling_units,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job = WorkshopJob(
        job_number=f"WO-{date.today():%Y%m%d}-{uuid4().hex[:6].upper()}",
        vehicle_id=vehicle.id,
        customer_id=vehicle.customer_id,
        technician_id=payload.technician_id,
        status="open",
        previous_mileage=previous_mileage,
        current_mileage=payload.current_mileage,
        oil_change_interval=payload.oil_change_interval,
        next_oil_change_mileage=payload.current_mileage + payload.oil_change_interval,
        notes=payload.notes,
        subtotal=subtotal,
        discount=payload.discount,
        tax=payload.tax,
        total=total,
    )
    db.add(job)
    db.flush()
    for source, calculated in zip(payload.lines, calculations):
        product = products[source.product_id]
        db.add(
            WorkshopJobLine(
                job_id=job.id,
                product_id=source.product_id,
                variation_id=source.variation_id,
                description=product.name,
                quantity=source.quantity,
                unit=source.unit,
                unit_price=calculated.unit_price,
                item_discount=source.item_discount,
                total_price=calculated.total_price,
            )
        )
    db.commit()
    return _job_query(db).filter(WorkshopJob.id == job.id).one()


@router.patch("/jobs/{job_id}", response_model=JobResponse)
def update_job(
    job_id: int,
    payload: JobUpdate,
    db: Session = Depends(deps.get_db),
    _: User = Depends(deps.get_current_user),
):
    job = _job_query(db).filter(WorkshopJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Workshop job not found")
    if job.status == "completed":
        raise HTTPException(status_code=409, detail="Completed jobs cannot be changed")
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(job, key, value)
    db.add(job)
    db.commit()
    return _job_query(db).filter(WorkshopJob.id == job_id).one()


@router.post("/jobs/{job_id}/complete", response_model=JobResponse)
def complete_job(
    job_id: int,
    payload: JobComplete,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    job = _job_query(db).filter(WorkshopJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Workshop job not found")
    if job.sale_id is not None or job.status == "completed":
        raise HTTPException(status_code=409, detail="Workshop job is already invoiced")
    if job.status == "cancelled":
        raise HTTPException(status_code=409, detail="Cancelled jobs cannot be completed")

    product_ids = {line.product_id for line in job.lines}
    products = {
        product.id: product
        for product in db.query(Product).filter(Product.id.in_(product_ids)).all()
    }
    variation_ids = {line.variation_id for line in job.lines if line.variation_id is not None}
    variations = {
        variation.id: variation
        for variation in db.query(ProductVariation).filter(ProductVariation.id.in_(variation_ids)).all()
    } if variation_ids else {}
    command = PosSaleCommand(
        user_id=current_user.id,
        lines=tuple(
            PosSaleLineCommand(
                product_id=line.product_id,
                variation_id=line.variation_id,
                quantity=line.quantity,
                unit=line.unit,
                item_discount=line.item_discount,
                unit_price=line.unit_price,
            )
            for line in job.lines
        ),
        payment_method=payload.payment_method,
        discount=job.discount,
        tax=job.tax,
        delivery_charges=0.0,
        amount_paid=payload.amount_paid,
    )
    calculations, subtotal, total = PosSaleService.calculate_lines(
        command,
        products,
        variations,
        _selling_units,
    )
    for source, calculated in zip(job.lines, calculations):
        product = products[source.product_id]
        if not CatalogItemType(product.item_type).consumes_inventory:
            continue
        stock_owner = variations.get(source.variation_id) if source.variation_id else product
        available = float(stock_owner.quantity or 0.0)
        if available + 1e-9 < calculated.quantity_in_base_units:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {product.name}: {available:g} available",
            )

    customer = db.query(Customer).filter(Customer.id == job.customer_id).first()
    if customer is None:
        raise HTTPException(status_code=409, detail="Job customer no longer exists")
    customer.outstanding_balance = accounting_service.get_customer_balance(
        db, customer.id, customer.opening_balance or 0.0
    )
    amount_paid = total if payload.amount_paid is None else payload.amount_paid
    amount_due = max(0.0, total - amount_paid)
    if amount_due > 0 and customer.credit_limit is not None:
        if customer.outstanding_balance + amount_due > customer.credit_limit:
            raise HTTPException(status_code=400, detail="Customer credit limit would be exceeded")

    try:
        sale = Sale(
            user_id=current_user.id,
            customer_ref_id=customer.id,
            is_walkin=False,
            customer_name=customer.name,
            customer_phone=customer.phone,
            payment_method=payload.payment_method,
            subtotal=subtotal,
            discount=job.discount,
            tax=job.tax,
            delivery_charges=0.0,
            total=total,
            previous_balance=float(customer.outstanding_balance or 0.0),
            amount_paid=amount_paid,
            amount_due=amount_due,
            change_amount=max(0.0, amount_paid - total),
        )
        db.add(sale)
        db.flush()
        service = PosSaleService(db)
        service.apply_lines(sale, command, products, calculations)
        service.update_customer_balance(customer, total=total, amount_due=amount_due)

        job.sale_id = sale.id
        job.status = "completed"
        job.payment_method = payload.payment_method
        job.amount_paid = amount_paid
        job.amount_due = amount_due
        job.completed_at = now_pkt()
        job.vehicle.current_mileage = job.current_mileage
        job.vehicle.next_oil_change_mileage = job.next_oil_change_mileage
        job.vehicle.last_oil_change_at = job.completed_at
        db.add(job)
        db.add(job.vehicle)

        service.post_and_commit(sale, payment_method=payload.payment_method, user_id=current_user.id)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to complete workshop job: {exc}") from exc

    return _job_query(db).filter(WorkshopJob.id == job_id).one()


@router.get("/reminders/due", response_model=list[DueReminderResponse])
def due_reminders(
    within_km: int = Query(default=500, ge=0, le=10000),
    db: Session = Depends(deps.get_db),
    _: User = Depends(deps.get_current_user),
):
    vehicles = db.query(WorkshopVehicle).options(joinedload(WorkshopVehicle.customer)).filter(
        WorkshopVehicle.next_oil_change_mileage.is_not(None)
    ).all()
    result = []
    for vehicle in vehicles:
        remaining = None
        if vehicle.current_mileage is not None:
            remaining = vehicle.next_oil_change_mileage - vehicle.current_mileage
            if remaining > within_km:
                continue
        result.append(
            DueReminderResponse(
                vehicle_id=vehicle.id,
                vehicle_identifier=vehicle.registration_number or vehicle.vehicle_id,
                customer_id=vehicle.customer_id,
                customer_name=vehicle.customer_name,
                customer_phone=vehicle.customer_phone,
                current_mileage=vehicle.current_mileage,
                next_oil_change_mileage=vehicle.next_oil_change_mileage,
                kilometres_remaining=remaining,
            )
        )
    return result
