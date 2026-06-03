from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime

from app.api import deps
from app.models.stock_batch import StockBatch, BatchStatus
from app.models.product import Product
from app.models.sale import SaleItem
from app.schemas.stock_batch import (
    StockBatchRead, StockBatchUpdate, StockBatchMergeRequest,
    StockBatchMergeResult, BatchSummaryByProduct, InventorySummary,
    CostingComparison, MergeMethod,
)
from app.core.timezone import now_pkt

router = APIRouter()


def _batch_to_read(batch: StockBatch) -> StockBatchRead:
    data = StockBatchRead.model_validate(batch)
    if batch.product:
        data.product_name = batch.product.name
    return data


@router.get("/batches", response_model=List[StockBatchRead])
def list_batches(
    *,
    db: Session = Depends(deps.get_db),
    product_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    q = db.query(StockBatch).options(
        joinedload(StockBatch.product),
        joinedload(StockBatch.variation),
    )
    if product_id:
        q = q.filter(StockBatch.product_id == product_id)
    if status:
        q = q.filter(StockBatch.status == status)
    batches = q.order_by(StockBatch.purchase_date.desc()).offset(skip).limit(limit).all()
    return [_batch_to_read(b) for b in batches]


@router.get("/batches/product/{product_id}", response_model=BatchSummaryByProduct)
def get_product_batches(
    *,
    db: Session = Depends(deps.get_db),
    product_id: int,
) -> Any:
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    batches = db.query(StockBatch).options(
        joinedload(StockBatch.product),
    ).filter(
        StockBatch.product_id == product_id,
    ).order_by(StockBatch.purchase_date.asc()).all()

    active_batches = [b for b in batches if b.status == BatchStatus.ACTIVE]
    total_qty = sum(b.quantity_remaining for b in active_batches)
    total_value = sum(b.quantity_remaining * b.unit_cost for b in active_batches)
    avg_cost = (total_value / total_qty) if total_qty > 0 else 0.0

    return BatchSummaryByProduct(
        product_id=product_id,
        product_name=product.name,
        total_qty=total_qty,
        active_batches=len(active_batches),
        avg_cost=round(avg_cost, 4),
        total_value=round(total_value, 4),
        batches=[_batch_to_read(b) for b in batches],
    )


@router.patch("/batches/{batch_id}", response_model=StockBatchRead)
def update_batch(
    *,
    db: Session = Depends(deps.get_db),
    batch_id: int,
    batch_in: StockBatchUpdate,
    current_user=Depends(deps.get_current_user),
) -> Any:
    batch = db.query(StockBatch).options(joinedload(StockBatch.product)).filter(StockBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if batch_in.selling_price is not None:
        if batch_in.selling_price < 0:
            raise HTTPException(status_code=400, detail="Selling price must be >= 0")
        batch.selling_price = batch_in.selling_price
    if batch_in.notes is not None:
        batch.notes = batch_in.notes

    db.add(batch)
    db.commit()
    db.refresh(batch)
    return _batch_to_read(batch)


@router.post("/merge", response_model=StockBatchMergeResult)
def merge_batches(
    *,
    db: Session = Depends(deps.get_db),
    merge_in: StockBatchMergeRequest,
    current_user=Depends(deps.get_current_user),
) -> Any:
    if len(merge_in.batch_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 batches required for merge")

    batches = db.query(StockBatch).options(joinedload(StockBatch.product)).filter(
        StockBatch.id.in_(merge_in.batch_ids),
        StockBatch.status == BatchStatus.ACTIVE,
    ).all()

    if len(batches) != len(merge_in.batch_ids):
        raise HTTPException(status_code=400, detail="One or more batches not found or not active")

    product_ids = {b.product_id for b in batches}
    if len(product_ids) > 1:
        raise HTTPException(status_code=400, detail="All batches must belong to the same product")

    product_id = batches[0].product_id
    product = db.query(Product).filter(Product.id == product_id).first()

    total_qty = sum(b.quantity_remaining for b in batches)
    total_value = sum(b.quantity_remaining * b.unit_cost for b in batches)

    if merge_in.merge_method == MergeMethod.WEIGHTED_AVG:
        new_cost = total_value / total_qty if total_qty > 0 else 0.0
    elif merge_in.merge_method == MergeMethod.USE_LATEST:
        latest = max(batches, key=lambda b: b.purchase_date)
        new_cost = latest.unit_cost
    else:  # USE_LOWEST
        new_cost = min(b.unit_cost for b in batches)

    new_cost = round(new_cost, 4)

    selling_price = merge_in.new_selling_price
    if selling_price is None:
        selling_price = max(b.selling_price for b in batches)

    # Create merged batch
    from app.core.timezone import now_pkt as _now
    today = _now().strftime("%Y%m%d")
    existing_count = db.query(func.count(StockBatch.id)).filter(StockBatch.product_id == product_id).scalar() or 0
    batch_num = f"BATCH-MERGE-{today}-P{product_id}-{existing_count + 1:03d}"

    new_batch = StockBatch(
        product_id=product_id,
        variation_id=batches[0].variation_id,
        batch_number=batch_num,
        quantity_received=total_qty,
        quantity_remaining=total_qty,
        unit_cost=new_cost,
        selling_price=selling_price,
        purchase_date=_now(),
        status=BatchStatus.ACTIVE,
        notes=merge_in.notes or f"Merged {len(batches)} batches via {merge_in.merge_method}",
    )
    db.add(new_batch)
    db.flush()

    for b in batches:
        b.status = BatchStatus.MERGED
        b.merged_into_id = new_batch.id
        b.quantity_remaining = 0
        db.add(b)

    db.commit()
    db.refresh(new_batch)

    return StockBatchMergeResult(
        new_batch=_batch_to_read(new_batch),
        merged_count=len(batches),
        total_qty=total_qty,
        computed_cost=new_cost,
    )


@router.get("/summary", response_model=InventorySummary)
def get_inventory_summary(
    *,
    db: Session = Depends(deps.get_db),
) -> Any:
    active_batches = db.query(StockBatch).filter(StockBatch.status == BatchStatus.ACTIVE).all()
    depleted_count = db.query(func.count(StockBatch.id)).filter(StockBatch.status == BatchStatus.DEPLETED).scalar() or 0

    total_value = sum(b.quantity_remaining * b.unit_cost for b in active_batches)

    # Products with more than 1 active batch
    from sqlalchemy import distinct
    multi_batch = db.query(StockBatch.product_id).filter(
        StockBatch.status == BatchStatus.ACTIVE
    ).group_by(StockBatch.product_id).having(func.count(StockBatch.id) > 1).count()

    return InventorySummary(
        total_inventory_value=round(total_value, 2),
        total_active_batches=len(active_batches),
        total_depleted_batches=depleted_count,
        products_with_multiple_batches=multi_batch,
    )


@router.get("/costing-comparison", response_model=List[CostingComparison])
def costing_comparison(
    *,
    db: Session = Depends(deps.get_db),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
) -> Any:
    """Compare FIFO vs LIFO vs Weighted-Average COGS for products sold in the period."""
    from app.models.sale import Sale, SaleItem
    from sqlalchemy import and_

    q = db.query(SaleItem).join(Sale, Sale.id == SaleItem.sale_id)
    if date_from:
        q = q.filter(Sale.created_at >= datetime.strptime(date_from, "%Y-%m-%d"))
    if date_to:
        q = q.filter(Sale.created_at <= datetime.strptime(date_to + " 23:59:59", "%Y-%m-%d %H:%M:%S"))

    sale_items = q.all()

    # Group sold quantities by product
    sold_by_product: dict[int, float] = {}
    for si in sale_items:
        sold_by_product[si.product_id] = sold_by_product.get(si.product_id, 0) + si.quantity

    results = []
    for product_id, qty_sold in sold_by_product.items():
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            continue

        batches = db.query(StockBatch).filter(
            StockBatch.product_id == product_id,
        ).order_by(StockBatch.purchase_date.asc()).all()

        if not batches:
            continue

        def calc_cogs(ordered_batches: list, qty: float) -> float:
            cost = 0.0
            rem = qty
            for b in ordered_batches:
                take = min(b.quantity_received, rem)
                cost += take * b.unit_cost
                rem -= take
                if rem <= 0:
                    break
            return round(cost, 2)

        fifo_cogs = calc_cogs(batches, qty_sold)
        lifo_cogs = calc_cogs(list(reversed(batches)), qty_sold)
        total_val = sum(b.quantity_received * b.unit_cost for b in batches)
        total_qty_all = sum(b.quantity_received for b in batches)
        wac = total_val / total_qty_all if total_qty_all > 0 else 0.0
        wac_cogs = round(wac * qty_sold, 2)

        results.append(CostingComparison(
            product_id=product_id,
            product_name=product.name,
            fifo_cogs=fifo_cogs,
            lifo_cogs=lifo_cogs,
            wac_cogs=wac_cogs,
            units_sold=qty_sold,
        ))

    return results
