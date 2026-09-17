from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_, or_
from datetime import datetime, date, timedelta, timezone
from app.core.timezone import now_pkt
from typing import List, Optional, Any, Dict
import csv
import io
import json
import requests
from app.api import deps
from app.models.sale import Sale, SaleItem
from app.models.product import Product, ProductVariation
from app.models.purchase import Purchase, PurchaseItem
from app.models.vendor import Vendor
from app.models.customer import Customer, CustomerNote
from app.models.pos_return import PosReturn, ReturnItem
from app.models.accounting import JournalEntry, JournalLine, Account
from app.models.stock_batch import StockBatch
from app.models.user import User, UserRole
from app.services import accounting as accounting_service
from app.schemas.report import (
    SalesSummaryReport, TopProductsReport, ProductSalesHistoryReport, AnalyticsOverviewReport, PaymentMethodReport,
    CashierPerformanceReport, CustomerSalesReport, SalesTrendReport,
    StockLevelReport, LowStockAlert, InventoryTurnoverReport,
    StockMovementReport, ProductPerformanceReport, VariationStockReport,
    ProfitLossReport, ExpenseReport, CashFlowReport, RevenueBreakdownReport,
    MarginAnalysisReport, VendorPaymentReport, PrepaidCreditReport,
    VendorPurchaseReport, ProductCostReport, PurchaseTimelineReport,
    PurchaseTrendReport, ProductPurchaseReport, PurchasePaymentStatusReport,
    CashierPerformanceReport as UserCashierPerformanceReport,
    UserActivityReport, UserPerformanceReport, AdminAuditReport, UserLoginHistory,
    LedgerReport, LedgerEntry
)

router = APIRouter()


def _get_pakistan_time() -> datetime:
    """Get current time in Pakistan timezone (GMT+5)."""
    return now_pkt()


# Helper function to validate date range
def validate_date_range(start_date: Optional[str], end_date: Optional[str]):
    if start_date:
        try:
            start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        except:
            raise HTTPException(status_code=400, detail="Invalid start_date format")
    else:
        start = now_pkt() - timedelta(days=30)

    if end_date:
        try:
            end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        except:
            raise HTTPException(status_code=400, detail="Invalid end_date format")
    else:
        end = now_pkt()

    if start > end:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    return start, end

# Helper function to export data as CSV
def export_to_csv(data: List[Dict[str, Any]], filename: str):
    if not data:
        return StreamingResponse(
            io.StringIO("No data available"),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=data[0].keys())
    writer.writeheader()
    writer.writerows(data)
    output.seek(0)

    return StreamingResponse(
        io.StringIO(output.getvalue()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/analytics/overview", response_model=AnalyticsOverviewReport)
def get_analytics_overview(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    top_n: int = Query(5, ge=3, le=25),
    months: int = Query(6, ge=3, le=24),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Return the focused inventory, product, buying, and customer analytics dashboard."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)
    if end_date and len(end_date.strip()) == 10:
        end = end + timedelta(days=1) - timedelta(microseconds=1)

    products = db.query(Product).order_by(Product.name.asc()).all()
    stock_rows = []
    for product in products:
        current_stock = float(product.quantity or 0)
        if product.has_variations:
            current_stock += sum(float(variation.quantity or 0) for variation in product.variations)
        row = {
            "product_id": product.id,
            "product_name": product.name,
            "sku": product.sku,
            "category": product.category,
            "current_stock": current_stock,
            "threshold": int(product.low_stock_threshold if product.low_stock_threshold is not None else 10),
            "base_unit": product.base_unit or "piece",
        }
        stock_rows.append(row)

    out_of_stock = sorted(
        (row for row in stock_rows if row["current_stock"] <= 0),
        key=lambda row: (row["current_stock"], row["product_name"].lower()),
    )
    low_stock = sorted(
        (
            row for row in stock_rows
            if 0 < row["current_stock"] <= row["threshold"]
        ),
        key=lambda row: (row["current_stock"] / max(row["threshold"], 1), row["product_name"].lower()),
    )

    sales_rows = db.query(
        SaleItem.product_id,
        func.coalesce(func.sum(SaleItem.quantity), 0).label("quantity_sold"),
        func.coalesce(func.sum(SaleItem.total_price), 0).label("revenue"),
    ).join(Sale, Sale.id == SaleItem.sale_id).filter(
        Sale.created_at >= start,
        Sale.created_at <= end,
    ).group_by(SaleItem.product_id).all()
    sales_by_product = {
        row.product_id: (float(row.quantity_sold or 0), float(row.revenue or 0))
        for row in sales_rows
    }
    product_sales = [{
        "product_id": product.id,
        "product_name": product.name,
        "sku": product.sku,
        "quantity_sold": sales_by_product.get(product.id, (0.0, 0.0))[0],
        "revenue": sales_by_product.get(product.id, (0.0, 0.0))[1],
    } for product in products]
    most_selling = sorted(
        product_sales,
        key=lambda row: (-row["quantity_sold"], -row["revenue"], row["product_name"].lower()),
    )[:top_n]
    least_selling = sorted(
        product_sales,
        key=lambda row: (row["quantity_sold"], row["revenue"], row["product_name"].lower()),
    )[:top_n]

    month_start = now_pkt().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    year = month_start.year
    month = month_start.month - (months - 1)
    while month <= 0:
        month += 12
        year -= 1
    month_start = month_start.replace(year=year, month=month)
    monthly_rows = db.query(
        func.strftime('%Y-%m', Sale.created_at).label("month"),
        func.coalesce(func.sum(SaleItem.quantity), 0).label("quantity_sold"),
        func.coalesce(func.sum(SaleItem.total_price), 0).label("revenue"),
    ).join(SaleItem, SaleItem.sale_id == Sale.id).filter(
        Sale.created_at >= month_start,
    ).group_by(func.strftime('%Y-%m', Sale.created_at)).all()
    monthly_map = {
        row.month: {"quantity_sold": float(row.quantity_sold or 0), "revenue": float(row.revenue or 0)}
        for row in monthly_rows
    }
    monthly_sales = []
    cursor_year, cursor_month = month_start.year, month_start.month
    for _ in range(months):
        key = f"{cursor_year:04d}-{cursor_month:02d}"
        totals = monthly_map.get(key, {"quantity_sold": 0.0, "revenue": 0.0})
        monthly_sales.append({"month": key, **totals})
        cursor_month += 1
        if cursor_month == 13:
            cursor_month = 1
            cursor_year += 1

    vendor_rows = db.query(
        Vendor.id,
        Vendor.name,
        func.count(Purchase.id).label("purchase_count"),
        func.coalesce(func.sum(Purchase.total_amount), 0).label("total_bought"),
    ).join(Purchase, Purchase.vendor_id == Vendor.id).filter(
        Purchase.created_at >= start,
        Purchase.created_at <= end,
    ).group_by(Vendor.id, Vendor.name).order_by(func.sum(Purchase.total_amount).desc()).limit(top_n).all()
    top_vendors = [{
        "vendor_id": row.id,
        "vendor_name": row.name,
        "purchase_count": int(row.purchase_count or 0),
        "total_bought": float(row.total_bought or 0),
    } for row in vendor_rows]

    price_rows = db.query(
        PurchaseItem.product_id,
        Purchase.vendor_id,
        func.coalesce(func.sum(PurchaseItem.quantity), 0).label("quantity_bought"),
        func.coalesce(
            func.sum(func.coalesce(PurchaseItem.total_cost, PurchaseItem.quantity * PurchaseItem.unit_cost)),
            0,
        ).label("total_cost"),
        func.avg(PurchaseItem.unit_cost).label("fallback_average"),
    ).join(Purchase, Purchase.id == PurchaseItem.purchase_id).filter(
        Purchase.created_at >= start,
        Purchase.created_at <= end,
    ).group_by(PurchaseItem.product_id, Purchase.vendor_id).all()
    product_lookup = {product.id: product for product in products}
    vendor_lookup = {vendor.id: vendor for vendor in db.query(Vendor).all()}
    comparisons_by_product: Dict[int, List[Dict[str, Any]]] = {}
    for row in price_rows:
        if row.product_id not in product_lookup or row.vendor_id not in vendor_lookup:
            continue
        quantity = float(row.quantity_bought or 0)
        total_cost = float(row.total_cost or 0)
        average_cost = total_cost / quantity if quantity > 0 and total_cost else float(row.fallback_average or 0)
        comparisons_by_product.setdefault(row.product_id, []).append({
            "vendor_id": row.vendor_id,
            "vendor_name": vendor_lookup[row.vendor_id].name,
            "quantity_bought": quantity,
            "average_unit_cost": average_cost,
        })
    price_comparisons = []
    for product_id, vendor_prices in comparisons_by_product.items():
        if len(vendor_prices) < 2:
            continue
        prices = [item["average_unit_cost"] for item in vendor_prices]
        product = product_lookup[product_id]
        price_comparisons.append({
            "product_id": product_id,
            "product_name": product.name,
            "sku": product.sku,
            "lowest_price": min(prices),
            "highest_price": max(prices),
            "price_difference": max(prices) - min(prices),
            "vendors": sorted(vendor_prices, key=lambda item: item["average_unit_cost"]),
        })
    price_comparisons.sort(key=lambda item: (-item["price_difference"], item["product_name"].lower()))

    outstanding_vendors = []
    for vendor in vendor_lookup.values():
        balance = max(0.0, accounting_service.get_vendor_balance(db, vendor.id))
        if balance > 0:
            outstanding_vendors.append({
                "vendor_id": vendor.id,
                "vendor_name": vendor.name,
                "phone": vendor.phone,
                "outstanding_amount": balance,
            })
    outstanding_vendors.sort(key=lambda row: (-row["outstanding_amount"], row["vendor_name"].lower()))

    customers = db.query(Customer).all()
    customer_opening_balances = {customer.id: float(customer.opening_balance or 0) for customer in customers}
    customer_balances = accounting_service.get_customer_balances(db, customer_opening_balances)
    customer_sales_rows = db.query(
        Sale.customer_ref_id,
        func.count(Sale.id).label("transaction_count"),
        func.coalesce(func.sum(Sale.total), 0).label("total_bought"),
    ).filter(
        Sale.customer_ref_id.isnot(None),
        Sale.created_at >= start,
        Sale.created_at <= end,
    ).group_by(Sale.customer_ref_id).all()
    customer_sales_map = {
        row.customer_ref_id: (int(row.transaction_count or 0), float(row.total_bought or 0))
        for row in customer_sales_rows
    }
    customer_rows = [{
        "customer_id": customer.id,
        "customer_name": customer.name or customer.customer_id or customer.phone or f"Customer #{customer.id}",
        "phone": customer.phone,
        "transaction_count": customer_sales_map.get(customer.id, (0, 0.0))[0],
        "total_bought": customer_sales_map.get(customer.id, (0, 0.0))[1],
        "outstanding_amount": max(0.0, customer_balances.get(customer.id, 0.0)),
    } for customer in customers]
    outstanding_customers = sorted(
        (row for row in customer_rows if row["outstanding_amount"] > 0),
        key=lambda row: (-row["outstanding_amount"], row["customer_name"].lower()),
    )[:top_n]
    top_customers = sorted(
        customer_rows,
        key=lambda row: (-row["total_bought"], -row["transaction_count"], row["customer_name"].lower()),
    )[:top_n]

    return {
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "top_n": top_n,
        "months": months,
        "low_stock": low_stock,
        "out_of_stock": out_of_stock,
        "most_selling": most_selling,
        "least_selling": least_selling,
        "monthly_sales": monthly_sales,
        "top_vendors": top_vendors,
        "vendor_price_comparisons": price_comparisons,
        "outstanding_vendors": outstanding_vendors[:top_n],
        "outstanding_customers": outstanding_customers,
        "top_customers": top_customers,
    }

# Sales Reports
@router.get("/sales/summary", response_model=SalesSummaryReport)
def get_sales_summary(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    period: str = Query("daily", enum=["daily", "weekly", "monthly"]),
    export: bool = Query(False),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get sales summary report with revenue, transaction count, and averages"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    # Base query for sales in date range
    sales_query = db.query(Sale).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    )

    # Calculate metrics
    total_revenue = sales_query.with_entities(func.sum(Sale.total)).scalar() or 0
    transaction_count = sales_query.count()
    average_transaction = total_revenue / transaction_count if transaction_count > 0 else 0

    # Group by period
    if period == "daily":
        date_format = func.date(Sale.created_at)
    elif period == "weekly":
        date_format = func.strftime('%Y-%W', Sale.created_at)
    else:  # monthly
        date_format = func.strftime('%Y-%m', Sale.created_at)

    group_by = date_format

    period_data = sales_query.with_entities(
        date_format.label('period'),
        func.count(Sale.id).label('transactions'),
        func.sum(Sale.total).label('revenue')
    ).group_by(group_by).order_by(date_format).all()

    result = {
        "total_revenue": total_revenue,
        "transaction_count": transaction_count,
        "average_transaction": average_transaction,
        "period_data": [
            {
                "period": str(item.period),
                "transactions": item.transactions,
                "revenue": item.revenue
            } for item in period_data
        ]
    }

    if export:
        # Convert to CSV format
        csv_data = []
        for item in period_data:
            csv_data.append({
                "Period": str(item.period),
                "Transactions": item.transactions,
                "Revenue": f"{item.revenue:.2f}",
                "Avg Transaction": f"{item.revenue / item.transactions:.2f}" if item.transactions > 0 else "0.00"
            })
        return export_to_csv(csv_data, f"sales_summary_{period}_{start.date()}_{end.date()}.csv")

    return result

@router.get("/sales/top-products", response_model=TopProductsReport)
def get_top_products(
    limit: int = Query(10, ge=1, le=100),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    export: bool = Query(False),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get top-selling products by revenue and quantity"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    # Query top products by revenue
    top_by_revenue = db.query(
        Product.name,
        Product.sku,
        func.sum(SaleItem.total_price).label('total_revenue'),
        func.sum(SaleItem.quantity).label('total_quantity')
    ).join(SaleItem.product).join(SaleItem.sale).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).group_by(Product.id, Product.name, Product.sku).order_by(
        func.sum(SaleItem.total_price).desc()
    ).limit(limit).all()

    # Query top products by quantity
    top_by_quantity = db.query(
        Product.name,
        Product.sku,
        func.sum(SaleItem.total_price).label('total_revenue'),
        func.sum(SaleItem.quantity).label('total_quantity')
    ).join(SaleItem.product).join(SaleItem.sale).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).group_by(Product.id, Product.name, Product.sku).order_by(
        func.sum(SaleItem.quantity).desc()
    ).limit(limit).all()

    result = {
        "by_revenue": [
            {
                "product_name": item.name,
                "sku": item.sku,
                "total_revenue": item.total_revenue,
                "total_quantity": item.total_quantity
            } for item in top_by_revenue
        ],
        "by_quantity": [
            {
                "product_name": item.name,
                "sku": item.sku,
                "total_revenue": item.total_revenue,
                "total_quantity": item.total_quantity
            } for item in top_by_quantity
        ]
    }

    if export:
        # Convert to CSV format - combine both lists
        csv_data = []
        for item in top_by_revenue:
            csv_data.append({
                "Type": "By Revenue",
                "Product Name": item.name,
                "SKU": item.sku,
                "Total Revenue": f"{item.total_revenue:.2f}",
                "Total Quantity": item.total_quantity
            })
        for item in top_by_quantity:
            csv_data.append({
                "Type": "By Quantity",
                "Product Name": item.name,
                "SKU": item.sku,
                "Total Revenue": f"{item.total_revenue:.2f}",
                "Total Quantity": item.total_quantity
            })
        return export_to_csv(csv_data, f"top_products_{start.date()}_{end.date()}.csv")

    return result


@router.get("/sales/product-history", response_model=ProductSalesHistoryReport)
def get_product_sales_history(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    search: str = Query("", max_length=200),
    export: bool = Query(False),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Show product-level purchases, sales, and gross profit/loss."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)
    # Date inputs from the report UI represent whole calendar days.
    if end_date and len(end_date.strip()) == 10:
        end = end + timedelta(days=1) - timedelta(microseconds=1)

    normalized_search = search.strip()
    products_query = db.query(Product)
    if normalized_search:
        pattern = f"%{normalized_search}%"
        matching_variations = db.query(ProductVariation.product_id).filter(
            or_(
                ProductVariation.sku.ilike(pattern),
                ProductVariation.barcode.ilike(pattern),
            )
        )
        products_query = products_query.filter(
            or_(
                Product.name.ilike(pattern),
                Product.sku.ilike(pattern),
                Product.category.ilike(pattern),
                Product.id.in_(matching_variations),
            )
        )

    products = products_query.order_by(Product.name.asc(), Product.id.asc()).all()
    product_ids = [product.id for product in products]

    purchase_map: Dict[int, Dict[str, Any]] = {}
    sales_map: Dict[int, Dict[str, Any]] = {}

    if product_ids:
        products_by_id = {product.id: product for product in products}

        def to_base_quantity(product: Product, unit: Optional[str], quantity: float) -> float:
            conversion = 1.0
            selling_units = product.selling_units or []
            if isinstance(selling_units, str):
                try:
                    selling_units = json.loads(selling_units)
                except (TypeError, ValueError):
                    selling_units = []
            if unit and unit != product.base_unit:
                for selling_unit in selling_units:
                    if selling_unit.get("unit") == unit:
                        conversion = float(selling_unit.get("conversion") or 1)
                        break
            return float(quantity or 0) * conversion

        purchase_rows = db.query(
            PurchaseItem.product_id,
            func.coalesce(func.sum(PurchaseItem.quantity), 0).label("quantity"),
            func.coalesce(
                func.sum(
                    func.coalesce(
                        PurchaseItem.total_cost,
                        PurchaseItem.quantity * PurchaseItem.unit_cost,
                    )
                ),
                0,
            ).label("cost"),
            func.count(func.distinct(PurchaseItem.purchase_id)).label("orders"),
        ).join(Purchase, Purchase.id == PurchaseItem.purchase_id).filter(
            PurchaseItem.product_id.in_(product_ids),
            Purchase.created_at >= start,
            Purchase.created_at <= end,
        ).group_by(PurchaseItem.product_id).all()

        purchase_map = {
            row.product_id: {
                "quantity": float(row.quantity or 0),
                "cost": float(row.cost or 0),
                "orders": int(row.orders or 0),
            }
            for row in purchase_rows
        }

        purchase_return_rows = db.query(
            ReturnItem.product_id,
            ReturnItem.quantity_returned,
            ReturnItem.total_refund,
            ReturnItem.unit_price,
        ).join(PosReturn, PosReturn.id == ReturnItem.return_id).filter(
            ReturnItem.product_id.in_(product_ids),
            ReturnItem.sale_item_id.is_(None),
            PosReturn.status == "approved",
            PosReturn.notes.like("%[PURCHASE_RETURN:%"),
            PosReturn.created_at >= start,
            PosReturn.created_at <= end,
        ).all()

        for row in purchase_return_rows:
            purchase_data = purchase_map.setdefault(row.product_id, {
                "quantity": 0.0,
                "cost": 0.0,
                "orders": 0,
            })
            returned_quantity = float(row.quantity_returned or 0)
            returned_cost = row.total_refund
            if returned_cost is None:
                returned_cost = returned_quantity * float(row.unit_price or 0)
            purchase_data["quantity"] -= returned_quantity
            purchase_data["cost"] -= float(returned_cost or 0)

        sale_rows = db.query(
            SaleItem.product_id,
            SaleItem.sale_id,
            SaleItem.quantity,
            SaleItem.unit,
            SaleItem.total_price,
            StockBatch.unit_cost,
        ).join(Sale, Sale.id == SaleItem.sale_id).outerjoin(
            StockBatch, StockBatch.id == SaleItem.batch_id
        ).filter(
            SaleItem.product_id.in_(product_ids),
            Sale.created_at >= start,
            Sale.created_at <= end,
        ).all()

        for row in sale_rows:
            product = products_by_id[row.product_id]
            base_quantity = to_base_quantity(product, row.unit, row.quantity)
            unit_cost = row.unit_cost
            if unit_cost is None:
                unit_cost = product.cost_price or 0

            sales_data = sales_map.setdefault(row.product_id, {
                "quantity": 0.0,
                "revenue": 0.0,
                "cogs": 0.0,
                "sale_ids": set(),
            })
            sales_data["quantity"] += base_quantity
            sales_data["revenue"] += float(row.total_price or 0)
            sales_data["cogs"] += base_quantity * float(unit_cost or 0)
            sales_data["sale_ids"].add(row.sale_id)

        sale_return_rows = db.query(
            ReturnItem.product_id,
            ReturnItem.quantity_returned,
            ReturnItem.unit,
            ReturnItem.total_refund,
            ReturnItem.unit_price,
            StockBatch.unit_cost,
        ).join(PosReturn, PosReturn.id == ReturnItem.return_id).join(
            SaleItem, SaleItem.id == ReturnItem.sale_item_id
        ).outerjoin(
            StockBatch, StockBatch.id == SaleItem.batch_id
        ).filter(
            ReturnItem.product_id.in_(product_ids),
            ReturnItem.sale_item_id.isnot(None),
            PosReturn.status == "approved",
            PosReturn.created_at >= start,
            PosReturn.created_at <= end,
        ).all()

        for row in sale_return_rows:
            product = products_by_id[row.product_id]
            base_quantity = to_base_quantity(product, row.unit, row.quantity_returned)
            returned_revenue = row.total_refund
            if returned_revenue is None:
                returned_revenue = float(row.quantity_returned or 0) * float(row.unit_price or 0)
            unit_cost = row.unit_cost
            if unit_cost is None:
                unit_cost = product.cost_price or 0

            sales_data = sales_map.setdefault(row.product_id, {
                "quantity": 0.0,
                "revenue": 0.0,
                "cogs": 0.0,
                "sale_ids": set(),
            })
            sales_data["quantity"] -= base_quantity
            sales_data["revenue"] -= float(returned_revenue or 0)
            sales_data["cogs"] -= base_quantity * float(unit_cost or 0)

    report_products = []
    for product in products:
        purchase_data = purchase_map.get(product.id, {"quantity": 0.0, "cost": 0.0, "orders": 0})
        sales_data = sales_map.get(product.id, {"quantity": 0.0, "revenue": 0.0, "cogs": 0.0, "sale_ids": set()})
        profit_loss = sales_data["revenue"] - sales_data["cogs"]
        report_products.append({
            "product_id": product.id,
            "product_name": product.name,
            "sku": product.sku,
            "base_unit": product.base_unit or "piece",
            "purchased_quantity": purchase_data["quantity"],
            "sold_quantity": sales_data["quantity"],
            "purchase_cost": purchase_data["cost"],
            "sales_revenue": sales_data["revenue"],
            "cost_of_goods_sold": sales_data["cogs"],
            "profit_loss": profit_loss,
            "purchase_orders": purchase_data["orders"],
            "sales_transactions": len(sales_data["sale_ids"]),
        })

    summary = {
        "matched_products": len(report_products),
        "purchased_quantity": sum(item["purchased_quantity"] for item in report_products),
        "sold_quantity": sum(item["sold_quantity"] for item in report_products),
        "purchase_cost": sum(item["purchase_cost"] for item in report_products),
        "sales_revenue": sum(item["sales_revenue"] for item in report_products),
        "cost_of_goods_sold": sum(item["cost_of_goods_sold"] for item in report_products),
        "profit_loss": sum(item["profit_loss"] for item in report_products),
    }

    if export:
        csv_data = [{
            "Product": item["product_name"],
            "SKU": item["sku"] or "",
            "Base Unit": item["base_unit"],
            "Quantity Purchased": item["purchased_quantity"],
            "Quantity Sold": item["sold_quantity"],
            "Purchase Cost": f'{item["purchase_cost"]:.2f}',
            "Sales Revenue": f'{item["sales_revenue"]:.2f}',
            "COGS": f'{item["cost_of_goods_sold"]:.2f}',
            "Profit/Loss": f'{item["profit_loss"]:.2f}',
        } for item in report_products]
        return export_to_csv(csv_data, f"product_sales_history_{start.date()}_{end.date()}.csv")

    return {
        "products": report_products,
        "summary": summary,
        "search": normalized_search,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
    }

@router.get("/sales/by-payment-method", response_model=PaymentMethodReport)
def get_sales_by_payment_method(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get sales breakdown by payment method"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    payment_data = db.query(
        Sale.payment_method,
        func.count(Sale.id).label('transaction_count'),
        func.sum(Sale.total).label('total_amount')
    ).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).group_by(Sale.payment_method).all()

    return {
        "payment_methods": [
            {
                "method": item.payment_method,
                "transaction_count": item.transaction_count,
                "total_amount": item.total_amount
            } for item in payment_data
        ]
    }

@router.get("/sales/by-cashier", response_model=CashierPerformanceReport)
def get_sales_by_cashier(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get sales performance by cashier"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    cashier_data = db.query(
        User.username,
        User.full_name,
        func.count(Sale.id).label('transaction_count'),
        func.sum(Sale.total).label('total_revenue'),
        func.avg(Sale.total).label('average_transaction')
    ).join(Sale.user).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).group_by(User.id, User.username, User.full_name).all()

    return {
        "cashiers": [
            {
                "username": item.username,
                "full_name": item.full_name,
                "transaction_count": item.transaction_count,
                "total_revenue": item.total_revenue,
                "average_transaction": item.average_transaction
            } for item in cashier_data
        ]
    }

@router.get("/sales/customer-history", response_model=CustomerSalesReport)
def get_customer_sales_history(
    phone: str = Query(..., description="Customer phone number"),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get sales history for a specific customer by phone number"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Normalize phone number for search
    normalized_phone = phone
    if phone.startswith('0'):
        normalized_phone = '92' + phone[1:]
    elif len(phone) == 10:
        normalized_phone = '92' + phone

    sales = db.query(Sale).filter(
        Sale.customer_phone == normalized_phone
    ).order_by(Sale.created_at.desc()).limit(limit).all()

    total_spent = sum(sale.total for sale in sales)
    total_transactions = len(sales)

    return {
        "customer_phone": phone,
        "normalized_phone": normalized_phone,
        "total_spent": total_spent,
        "total_transactions": total_transactions,
        "sales": [
            {
                "id": sale.id,
                "created_at": sale.created_at.isoformat(),
                "total": sale.total,
                "payment_method": sale.payment_method,
                "cashier": sale.user.username if sale.user else "Unknown",
                "items_count": len(sale.items)
            } for sale in sales
        ]
    }

@router.get("/sales/trends", response_model=SalesTrendReport)
def get_sales_trends(
    period: str = Query("monthly", enum=["daily", "weekly", "monthly"]),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get sales trends over time"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    # Determine grouping
    if period == "daily":
        date_trunc = func.date(Sale.created_at)
    elif period == "weekly":
        date_trunc = func.strftime('%Y-%W', Sale.created_at)
    else:  # monthly
        date_trunc = func.strftime('%Y-%m', Sale.created_at)
    
    group_by = date_trunc

    trend_data = db.query(
        date_trunc.label('period'),
        func.count(Sale.id).label('transactions'),
        func.sum(Sale.total).label('revenue'),
        func.avg(Sale.total).label('avg_transaction')
    ).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).group_by(group_by).order_by(date_trunc).all()

    return {
        "period": period,
        "data": [
            {
                "period": str(item.period),
                "transactions": item.transactions,
                "revenue": item.revenue,
                "avg_transaction": item.avg_transaction
            } for item in trend_data
        ]
    }

# Inventory Reports
@router.get("/inventory/stock-levels", response_model=StockLevelReport)
def get_stock_levels(
    category: Optional[str] = Query(None),
    low_stock_only: bool = Query(False),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get current stock levels for all products"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    query = db.query(Product)

    if category:
        query = query.filter(Product.category == category)

    products = query.all()

    stock_data = []
    low_stock_count = 0

    for product in products:
        # Calculate total stock including variations
        total_stock = product.quantity
        if product.has_variations:
            for variation in product.variations:
                total_stock += variation.quantity

        # Check if low stock
        is_low_stock = total_stock <= (product.low_stock_threshold or 10)
        if is_low_stock:
            low_stock_count += 1

        if not low_stock_only or is_low_stock:
            stock_data.append({
                "product_id": product.id,
                "product_name": product.name,
                "sku": product.sku,
                "current_stock": total_stock,
                "base_unit": product.base_unit,
                "category": product.category,
                "selling_price": product.selling_price
            })

    return {
        "products": stock_data,
        "total_products": len(stock_data),
        "low_stock_count": low_stock_count
    }

@router.get("/inventory/low-stock-alerts", response_model=List[LowStockAlert])
def get_low_stock_alerts(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get products that are below low stock threshold"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    products = db.query(Product).all()
    alerts = []

    for product in products:
        total_stock = product.quantity
        if product.has_variations:
            for variation in product.variations:
                total_stock += variation.quantity

        threshold = product.low_stock_threshold or 10
        if total_stock <= threshold:
            alerts.append({
                "product_id": product.id,
                "product_name": product.name,
                "sku": product.sku,
                "current_stock": total_stock,
                "threshold": threshold,
                "base_unit": product.base_unit,
                "category": product.category
            })

    return alerts

@router.get("/inventory/turnover", response_model=List[InventoryTurnoverReport])
def get_inventory_turnover(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get inventory turnover ratios for products"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)
    period_days = (end - start).days

    products = db.query(Product).all()
    turnover_data = []

    for product in products:
        # Calculate sold quantity in period
        sold_quantity = db.query(func.sum(SaleItem.quantity)).join(
            SaleItem.sale
        ).filter(
            and_(
                SaleItem.product_id == product.id,
                Sale.created_at >= start,
                Sale.created_at <= end
            )
        ).scalar() or 0

        # Calculate average stock during period
        # This is a simplified calculation - in reality you'd want historical stock levels
        current_stock = product.quantity
        if product.has_variations:
            for variation in product.variations:
                current_stock += variation.quantity

        # Turnover ratio = (Sold quantity / Average inventory) * (Period length adjustment)
        if current_stock > 0:
            turnover_ratio = (sold_quantity / current_stock) * (365 / period_days) if period_days > 0 else 0
        else:
            turnover_ratio = 0

        turnover_data.append({
            "product_id": product.id,
            "product_name": product.name,
            "sku": product.sku,
            "turnover_ratio": turnover_ratio,
            "sold_quantity": sold_quantity,
            "average_stock": current_stock,
            "period_days": period_days
        })

    return turnover_data

@router.get("/inventory/movement/{product_id}", response_model=StockMovementReport)
def get_stock_movement(
    product_id: int,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get stock movement history for a specific product"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    start, end = validate_date_range(start_date, end_date)

    movements = []

    # Get sales movements
    sales_movements = db.query(
        Sale.created_at,
        func.sum(SaleItem.quantity).label('quantity'),
        Sale.id.label('reference')
    ).join(SaleItem).filter(
        and_(
            SaleItem.product_id == product_id,
            Sale.created_at >= start,
            Sale.created_at <= end
        )
    ).group_by(Sale.id, Sale.created_at).order_by(Sale.created_at).all()

    for movement in sales_movements:
        movements.append({
            "date": movement.created_at.isoformat(),
            "movement_type": "sale",
            "quantity": -movement.quantity,  # Negative for sales
            "reference": f"Sale #{movement.reference}",
            "balance_after": 0  # Would need historical tracking for accurate balance
        })

    # Get purchase movements
    purchase_movements = db.query(
        Purchase.created_at,
        func.sum(PurchaseItem.quantity).label('quantity'),
        Purchase.id.label('reference')
    ).join(PurchaseItem).filter(
        and_(
            PurchaseItem.product_id == product_id,
            Purchase.created_at >= start,
            Purchase.created_at <= end
        )
    ).group_by(Purchase.id, Purchase.created_at).order_by(Purchase.created_at).all()

    for movement in purchase_movements:
        movements.append({
            "date": movement.created_at.isoformat(),
            "movement_type": "purchase",
            "quantity": movement.quantity,  # Positive for purchases
            "reference": f"Purchase #{movement.reference}",
            "balance_after": 0
        })

    # Sort movements by date
    movements.sort(key=lambda x: x["date"])

    # Calculate current stock
    current_stock = product.quantity
    if product.has_variations:
        for variation in product.variations:
            current_stock += variation.quantity

    return {
        "product_id": product_id,
        "product_name": product.name,
        "sku": product.sku,
        "movements": movements,
        "current_stock": current_stock
    }

@router.get("/inventory/product-performance", response_model=ProductPerformanceReport)
def get_product_performance(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get product performance metrics"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)
    period_days = (end - start).days or 1

    # Get sales data by product
    performance_data = db.query(
        Product.id,
        Product.name,
        Product.sku,
        func.sum(SaleItem.quantity).label('sold_quantity'),
        func.sum(SaleItem.total_price).label('revenue')
    ).join(SaleItem.product).join(SaleItem.sale).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).group_by(Product.id, Product.name, Product.sku).all()

    products = []
    for item in performance_data:
        avg_daily_sales = item.sold_quantity / period_days

        # Get current stock for turnover calculation
        product = db.query(Product).filter(Product.id == item.id).first()
        current_stock = product.quantity
        if product.has_variations:
            for variation in product.variations:
                current_stock += variation.quantity

        stock_turnover_days = current_stock / avg_daily_sales if avg_daily_sales > 0 else None

        products.append({
            "product_id": item.id,
            "product_name": item.name,
            "sku": item.sku,
            "sold_quantity": item.sold_quantity,
            "revenue": item.revenue,
            "avg_daily_sales": avg_daily_sales,
            "stock_turnover_days": stock_turnover_days
        })

    return {
        "products": products,
        "period_days": period_days
    }

@router.get("/inventory/variations/{product_id}", response_model=VariationStockReport)
def get_variation_stock(
    product_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get stock levels for product variations"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if not product.has_variations:
        raise HTTPException(status_code=400, detail="Product does not have variations")

    variations = []
    total_stock = 0

    for variation in product.variations:
        variations.append({
            "variation_id": variation.id,
            "attributes": variation.attributes,
            "sku": variation.sku,
            "current_stock": variation.quantity,
            "price_adjustment": variation.price_adjustment
        })
        total_stock += variation.quantity

    return {
        "product_id": product_id,
        "product_name": product.name,
        "variations": variations,
        "total_stock": total_stock
    }

# Financial Reports
@router.get("/financial/profit-loss", response_model=ProfitLossReport)
def get_profit_loss(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get profit and loss statement"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    # Revenue from sales
    revenue = db.query(func.sum(Sale.total)).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).scalar() or 0

    # Cost of goods sold (COGS) from purchases
    cogs = db.query(func.sum(Purchase.total_amount)).filter(
        and_(Purchase.created_at >= start, Purchase.created_at <= end)
    ).scalar() or 0

    # Gross profit
    gross_profit = revenue - cogs

    # Operating expenses (if any - this would need additional expense tracking)
    operating_expenses = 0  # Placeholder

    # Net profit
    net_profit = gross_profit - operating_expenses

    return {
        "revenue": revenue,
        "cost_of_goods_sold": cogs,
        "gross_profit": gross_profit,
        "expenses": [], # No detailed expenses tracked currently
        "net_profit": net_profit,
        "period_start": start.isoformat(),
        "period_end": end.isoformat()
    }

@router.get("/financial/revenue-breakdown", response_model=RevenueBreakdownReport)
def get_revenue_breakdown(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get revenue breakdown by category and payment method"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    # Revenue by category
    category_revenue = db.query(
        Product.category,
        func.sum(SaleItem.total_price).label('revenue'),
        func.sum(SaleItem.quantity).label('quantity')
    ).join(SaleItem.product).join(SaleItem.sale).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).group_by(Product.category).all()

    # Revenue by payment method
    payment_revenue = db.query(
        Sale.payment_method,
        func.sum(Sale.total).label('revenue'),
        func.count(Sale.id).label('transactions')
    ).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).group_by(Sale.payment_method).all()

    return {
        "by_category": [
            {
                "category": item.category or "Uncategorized",
                "revenue": item.revenue,
                "quantity": item.quantity
            } for item in category_revenue
        ],
        "by_payment_method": [
            {
                "payment_method": item.payment_method,
                "revenue": item.revenue,
                "transactions": item.transactions
            } for item in payment_revenue
        ]
    }

@router.get("/financial/cash-flow", response_model=CashFlowReport)
def get_cash_flow(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get cash flow statement"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    # Cash inflows (sales revenue)
    cash_inflows = db.query(func.sum(Sale.total)).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).scalar() or 0

    # Cash outflows (purchase payments)
    cash_outflows = db.query(func.sum(Purchase.total_amount)).filter(
        and_(Purchase.created_at >= start, Purchase.created_at <= end)
    ).scalar() or 0

    # Net cash flow
    net_cash_flow = cash_inflows - cash_outflows

    # Payment method breakdown for inflows
    inflow_breakdown = db.query(
        Sale.payment_method,
        func.sum(Sale.total).label('amount')
    ).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).group_by(Sale.payment_method).all()

    # Payment method breakdown for outflows (assuming purchases have payment methods)
    outflow_breakdown = db.query(
        Purchase.payment_method,
        func.sum(Purchase.total_amount).label('amount')
    ).filter(
        and_(Purchase.created_at >= start, Purchase.created_at <= end)
    ).group_by(Purchase.payment_method).all()

    return {
        "period": {
            "start_date": start.isoformat(),
            "end_date": end.isoformat()
        },
        "cash_inflows": cash_inflows,
        "cash_outflows": cash_outflows,
        "net_cash_flow": net_cash_flow,
        "inflow_breakdown": [
            {"payment_method": item.payment_method, "amount": item.amount}
            for item in inflow_breakdown
        ],
        "outflow_breakdown": [
            {"payment_method": item.payment_method, "amount": item.amount}
            for item in outflow_breakdown
        ]
    }

@router.get("/financial/margins", response_model=MarginAnalysisReport)
def get_margin_analysis(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get profit margin analysis by product"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    # Get sales data with product costs
    margin_data = db.query(
        Product.id,
        Product.name,
        Product.sku,
        Product.selling_price,
        Product.purchase_price,
        func.sum(SaleItem.quantity).label('sold_quantity'),
        func.sum(SaleItem.total_price).label('revenue')
    ).join(SaleItem.product).join(SaleItem.sale).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).group_by(Product.id, Product.name, Product.sku, Product.selling_price, Product.purchase_price).all()

    products = []
    total_revenue = 0
    total_cost = 0
    total_profit = 0

    for item in margin_data:
        if item.purchase_price and item.purchase_price > 0:
            cost_of_goods = item.purchase_price * item.sold_quantity
            profit = item.revenue - cost_of_goods
            margin_percentage = (profit / item.revenue) * 100 if item.revenue > 0 else 0

            products.append({
                "product_id": item.id,
                "product_name": item.name,
                "sku": item.sku,
                "selling_price": item.selling_price,
                "purchase_price": item.purchase_price,
                "sold_quantity": item.sold_quantity,
                "revenue": item.revenue,
                "cost_of_goods": cost_of_goods,
                "profit": profit,
                "margin_percentage": margin_percentage
            })

            total_revenue += item.revenue
            total_cost += cost_of_goods
            total_profit += profit

    overall_margin = (total_profit / total_revenue) * 100 if total_revenue > 0 else 0

    return {
        "products": products,
        "summary": {
            "total_revenue": total_revenue,
            "total_cost": total_cost,
            "total_profit": total_profit,
            "overall_margin_percentage": overall_margin
        }
    }

# Purchase Reports
@router.get("/purchases/vendor-summary", response_model=VendorPurchaseReport)
def get_vendor_purchase_summary(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get purchase summary by vendor"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    vendor_data = db.query(
        Vendor.id,
        Vendor.name,
        Vendor.contact_name,
        func.count(Purchase.id).label('purchase_count'),
        func.sum(Purchase.total_amount).label('total_amount'),
        func.avg(Purchase.total_amount).label('avg_purchase_amount')
    ).join(Vendor.purchases).filter(
        and_(Purchase.created_at >= start, Purchase.created_at <= end)
    ).group_by(Vendor.id, Vendor.name, Vendor.contact_name).all()

    return {
        "vendors": [
            {
                "vendor_id": item.id,
                "vendor_name": item.name,
                "contact_person": item.contact_name,
                "purchase_count": item.purchase_count,
                "total_amount": item.total_amount,
                "avg_purchase_amount": item.avg_purchase_amount
            } for item in vendor_data
        ]
    }

@router.get("/purchases/product-costs", response_model=ProductCostReport)
def get_product_cost_analysis(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get product cost analysis from purchases"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    cost_data = db.query(
        Product.id,
        Product.name,
        Product.sku,
        func.avg(PurchaseItem.unit_cost).label('avg_purchase_price'),
        func.min(PurchaseItem.unit_cost).label('min_purchase_price'),
        func.max(PurchaseItem.unit_cost).label('max_purchase_price'),
        func.sum(PurchaseItem.quantity).label('total_purchased_quantity')
    ).join(PurchaseItem.product).join(PurchaseItem.purchase).filter(
        and_(Purchase.created_at >= start, Purchase.created_at <= end)
    ).group_by(Product.id, Product.name, Product.sku).all()

    return {
        "products": [
            {
                "product_id": item.id,
                "product_name": item.name,
                "sku": item.sku,
                "avg_purchase_price": item.avg_purchase_price,
                "min_purchase_price": item.min_purchase_price,
                "max_purchase_price": item.max_purchase_price,
                "total_purchased_quantity": item.total_purchased_quantity
            } for item in cost_data
        ]
    }

@router.get("/purchases/timeline", response_model=PurchaseTimelineReport)
def get_purchase_timeline(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    period: str = Query("monthly", enum=["daily", "weekly", "monthly"]),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get purchase timeline data"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    if period == "daily":
        date_format = func.date(Purchase.created_at)
    elif period == "weekly":
        date_format = func.strftime('%Y-%W', Purchase.created_at)
    else:  # monthly
        date_format = func.strftime('%Y-%m', Purchase.created_at)

    timeline_data = db.query(
        date_format.label('period'),
        func.count(Purchase.id).label('purchase_count'),
        func.sum(Purchase.total_amount).label('total_amount'),
        func.avg(Purchase.total_amount).label('avg_purchase_amount')
    ).filter(
        and_(Purchase.created_at >= start, Purchase.created_at <= end)
    ).group_by(date_format).order_by(date_format).all()

    return {
        "period": period,
        "data": [
            {
                "period": item.period,
                "purchase_count": item.purchase_count,
                "total_amount": item.total_amount,
                "avg_purchase_amount": item.avg_purchase_amount
            } for item in timeline_data
        ]
    }

# User Reports
@router.get("/users/activity", response_model=UserActivityReport)
def get_user_activity(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get user activity summary"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)

    # Get sales by user
    user_sales = db.query(
        User.id,
        User.username,
        User.role,
        func.count(Sale.id).label('sales_count'),
        func.sum(Sale.total).label('total_revenue')
    ).join(User.sales).filter(
        and_(Sale.created_at >= start, Sale.created_at <= end)
    ).group_by(User.id, User.username, User.role).all()

    # Get total users by role
    user_roles = db.query(
        User.role,
        func.count(User.id).label('count')
    ).group_by(User.role).all()

    return {
        "user_sales": [
            {
                "user_id": item.id,
                "username": item.username,
                "role": item.role,
                "sales_count": item.sales_count,
                "total_revenue": item.total_revenue
            } for item in user_sales
        ],
        "user_roles": [
            {
                "role": item.role,
                "count": item.count
            } for item in user_roles
        ]
    }

@router.get("/users/performance", response_model=UserPerformanceReport)
def get_user_performance(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get detailed user performance metrics"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    start, end = validate_date_range(start_date, end_date)
    period_days = (end - start).days or 1

    users = db.query(User).all()
    performance_data = []

    for user in users:
        # Sales metrics
        sales_count = db.query(func.count(Sale.id)).filter(
            and_(Sale.user_id == user.id, Sale.created_at >= start, Sale.created_at <= end)
        ).scalar() or 0

        total_revenue = db.query(func.sum(Sale.total)).filter(
            and_(Sale.user_id == user.id, Sale.created_at >= start, Sale.created_at <= end)
        ).scalar() or 0

        avg_sale_value = total_revenue / sales_count if sales_count > 0 else 0
        daily_avg_sales = sales_count / period_days

        # Items sold
        items_sold = db.query(func.sum(SaleItem.quantity)).join(SaleItem.sale).filter(
            and_(Sale.user_id == user.id, Sale.created_at >= start, Sale.created_at <= end)
        ).scalar() or 0

        performance_data.append({
            "user_id": user.id,
            "username": user.username,
            "role": user.role,
            "sales_count": sales_count,
            "total_revenue": total_revenue,
            "avg_sale_value": avg_sale_value,
            "daily_avg_sales": daily_avg_sales,
            "items_sold": items_sold
        })

    return {
        "users": performance_data,
        "period_days": period_days
    }

@router.get("/users/login-history", response_model=List[UserLoginHistory])
def get_user_login_history(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get user login history (placeholder - would need login tracking table)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    # This would require a login history table in the database
    # For now, return empty list as placeholder
    return []

@router.get("/customers/{customer_id}/ledger", response_model=LedgerReport)
def get_customer_ledger(
    customer_id: int,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    export: bool = Query(False),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Customer ledger with AR journal lines plus informational sale entries."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Default to full history for ledger (not the rolling 30-day window used by reports)
    if not start_date:
        start_date = "2000-01-01"
    start, end = validate_date_range(start_date, end_date)

    accounting_service.ensure_system_accounts(db)
    ar_code = accounting_service.SYSTEM_ACCOUNTS["ACCOUNTS_RECEIVABLE"]["code"]
    ar_account = db.query(Account).filter(Account.code == ar_code).first()
    if not ar_account:
        raise HTTPException(status_code=500, detail="Accounts Receivable not configured")

    # Match sales by explicit customer link and by legacy/unlinked phone match.
    digits = "".join(ch for ch in (customer.phone or "") if ch.isdigit())
    if digits.startswith("92") and len(digits) > 10:
        digits = digits[2:]
    if digits.startswith("0") and len(digits) > 10:
        digits = digits[1:]
    if len(digits) > 10:
        digits = digits[-10:]

    phone_variants: List[str] = []
    if digits:
        phone_variants = [digits, f"0{digits}", f"92{digits}", f"+92{digits}"]

    sale_filters = [Sale.customer_ref_id == customer_id]
    if phone_variants:
        sale_filters.append(
            and_(
                Sale.customer_ref_id.is_(None),
                Sale.customer_phone.in_(phone_variants),
            )
        )

    customer_sales_query = db.query(Sale.id).filter(or_(*sale_filters))
    customer_sales = customer_sales_query.subquery()

    base_query = db.query(JournalLine, JournalEntry).join(
        JournalEntry, JournalEntry.id == JournalLine.entry_id
    ).filter(
        JournalLine.account_id == ar_account.id,
        or_(
            JournalLine.customer_id == customer_id,
            JournalLine.sale_id.in_(customer_sales),
        )
    )

    pre_debit, pre_credit = base_query.filter(
        JournalEntry.entry_date < start
    ).with_entities(
        func.coalesce(func.sum(JournalLine.debit), 0.0),
        func.coalesce(func.sum(JournalLine.credit), 0.0)
    ).first()

    opening_balance = (customer.opening_balance or 0.0) + (pre_debit - pre_credit)

    rows = base_query.filter(
        JournalEntry.entry_date >= start,
        JournalEntry.entry_date <= end,
    ).order_by(
        JournalEntry.entry_date.asc(),
        JournalEntry.id.asc(),
        JournalLine.id.asc(),
    ).all()

    # Fallback for historical customer advances where journal descriptions were saved
    # without notes. We align same-day advance notes in chronological order.
    advance_notes = db.query(CustomerNote).filter(
        CustomerNote.customer_id == customer_id,
        CustomerNote.note_type == "advance_payment",
        CustomerNote.created_at >= start,
        CustomerNote.created_at <= end,
    ).order_by(
        CustomerNote.created_at.asc(),
        CustomerNote.id.asc(),
    ).all()

    advance_notes_by_day: Dict[str, List[CustomerNote]] = {}
    for note in advance_notes:
        day_key = note.created_at.date().isoformat()
        advance_notes_by_day.setdefault(day_key, []).append(note)

    aggregated_rows = {}
    for line, entry in rows:
        row = aggregated_rows.get(entry.id)
        if not row:
            row = {
                "entry": entry,
                "debit": 0.0,
                "credit": 0.0,
            }
            aggregated_rows[entry.id] = row
        row["debit"] += float(line.debit or 0.0)
        row["credit"] += float(line.credit or 0.0)

    sales_rows = db.query(Sale.id, Sale.created_at, Sale.total, Sale.amount_paid, Sale.amount_due).filter(
        Sale.id.in_(customer_sales_query)
    ).filter(
        Sale.created_at >= start,
        Sale.created_at <= end,
    ).all()

    returns_query = db.query(
        PosReturn.id,
        PosReturn.created_at,
        PosReturn.refund_amount,
        PosReturn.sale_id,
    ).filter(
        PosReturn.created_at >= start,
        PosReturn.created_at <= end,
    ).filter(
        or_(
            PosReturn.sale_id.in_(customer_sales_query),
            and_(
                PosReturn.customer_phone.isnot(None),
                PosReturn.customer_phone.in_(phone_variants),
            ) if phone_variants else False,
        )
    )
    returns_rows = returns_query.all()

    running_balance = opening_balance
    entries: List[LedgerEntry] = []

    if opening_balance != 0:
        entries.append(LedgerEntry(
            date=start,
            description="Opening Balance",
            debit=opening_balance if opening_balance > 0 else 0.0,
            credit=abs(opening_balance) if opening_balance < 0 else 0.0,
            balance=running_balance,
        ))

    sale_ids_in_journal = set()
    return_ids_in_journal = set()
    journal_events = []
    for line, entry in rows:
        sale_id = line.sale_id or entry.source_id
        if sale_id:
            sale_ids_in_journal.add(sale_id)
        return_id = line.return_id or (entry.source_id if entry.source_type == "return" else None)
        if return_id:
            return_ids_in_journal.add(return_id)

        description = entry.description
        if entry.source_type == "customer_advance" and ":" not in (entry.description or ""):
            day_key = entry.entry_date.date().isoformat()
            day_notes = advance_notes_by_day.get(day_key, [])
            if day_notes:
                note = day_notes.pop(0)
                if note.note_text:
                    description = f"{entry.description}: {note.note_text}"

        journal_events.append((entry.entry_date, 0, {
            "description": description,
            "source_type": entry.source_type,
            "source_id": entry.source_id,
            "debit": line.debit or 0.0,
            "credit": line.credit or 0.0,
        }))

    info_events = []
    for sale_id, created_at, total, amount_paid, amount_due in sales_rows:
        if sale_id in sale_ids_in_journal:
            continue
        # For cash/full-paid sales there is no AR journal movement, but we still
        # show amount in both sides for visibility while keeping net balance zero.
        paid_in_full_without_due = float(amount_due or 0.0) <= 0 and float(amount_paid or 0.0) > 0
        visible_amount = float(total or amount_paid or 0.0) if paid_in_full_without_due else 0.0
        info_events.append((created_at, 1, {
            "description": f"Sale #{sale_id} (Paid {amount_paid:.2f}, Due {amount_due:.2f}, Total {total:.2f})",
            "source_type": "sale",
            "source_id": sale_id,
            "debit": visible_amount,
            "credit": visible_amount,
        }))

    for return_id, created_at, refund_amount, sale_id in returns_rows:
        if return_id in return_ids_in_journal:
            continue
        sale_part = f" for Sale #{sale_id}" if sale_id else ""
        info_events.append((created_at, 1, {
            "description": f"Return #{return_id}{sale_part} (Refund {refund_amount:.2f})",
            "source_type": "return",
            "source_id": return_id,
            "debit": 0.0,
            "credit": 0.0,
        }))

    for event_date, _, data in sorted([*journal_events, *info_events], key=lambda x: (x[0], x[1])):
        debit = data["debit"]
        credit = data["credit"]
        running_balance += debit - credit
        entries.append(LedgerEntry(
            date=event_date,
            description=data["description"],
            source_type=data["source_type"],
            source_id=data["source_id"],
            debit=debit,
            credit=credit,
            balance=running_balance,
        ))

    if export:
        csv_data = [
            {
                "Date": e.date.isoformat(),
                "Description": e.description,
                "Source Type": e.source_type or "",
                "Source ID": e.source_id or "",
                "Debit": f"{e.debit:.2f}",
                "Credit": f"{e.credit:.2f}",
                "Balance": f"{e.balance:.2f}",
            }
            for e in entries
        ]
        return export_to_csv(csv_data, f"customer_ledger_{customer_id}_{start.date()}_{end.date()}.csv")

    return {
        "opening_balance": opening_balance,
        "closing_balance": running_balance,
        "entries": entries,
    }


@router.get("/vendors/{vendor_id}/ledger", response_model=LedgerReport)
def get_vendor_ledger(
    vendor_id: int,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    export: bool = Query(False),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Vendor ledger based on Accounts Payable journal lines."""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Default to full history for ledger (not the rolling 30-day window used by reports)
    if not start_date:
        start_date = "2000-01-01"
    start, end = validate_date_range(start_date, end_date)

    accounting_service.ensure_system_accounts(db)
    ap_code = accounting_service.SYSTEM_ACCOUNTS["ACCOUNTS_PAYABLE"]["code"]
    adv_code = accounting_service.SYSTEM_ACCOUNTS["VENDOR_ADVANCES"]["code"]
    ap_account = db.query(Account).filter(Account.code == ap_code).first()
    adv_account = db.query(Account).filter(Account.code == adv_code).first()
    if not ap_account or not adv_account:
        raise HTTPException(status_code=500, detail="Vendor ledger accounts not configured")

    base_query = db.query(JournalLine, JournalEntry).join(
        JournalEntry, JournalEntry.id == JournalLine.entry_id
    ).filter(
        JournalLine.account_id.in_([ap_account.id, adv_account.id]),
        JournalLine.vendor_id == vendor_id,
    )

    pre_debit, pre_credit = base_query.filter(
        JournalEntry.entry_date < start
    ).with_entities(
        func.coalesce(func.sum(JournalLine.debit), 0.0),
        func.coalesce(func.sum(JournalLine.credit), 0.0)
    ).first()

    pre_period_has_journal = base_query.filter(
        JournalEntry.entry_date < start
    ).limit(1).first() is not None
    journal_opening = float((pre_credit or 0.0) - (pre_debit or 0.0))
    legacy_opening = float(vendor.opening_balance or 0.0)
    # Prevent double counting when opening balance is already represented in journal history.
    opening_balance = journal_opening if pre_period_has_journal else legacy_opening

    rows = base_query.filter(
        JournalEntry.entry_date >= start,
        JournalEntry.entry_date <= end,
    ).order_by(
        JournalEntry.entry_date.asc(),
        JournalEntry.id.asc(),
        JournalLine.id.asc(),
    ).all()

    epsilon = 0.005

    aggregated_rows = {}
    for line, entry in rows:
        existing = aggregated_rows.get(entry.id)
        if not existing:
            existing = {
                "entry": entry,
                "debit": 0.0,
                "credit": 0.0,
            }
            aggregated_rows[entry.id] = existing
        existing["debit"] += float(line.debit or 0.0)
        existing["credit"] += float(line.credit or 0.0)

    # Normalize tiny floating artifacts to zero to avoid false "in-journal" purchases.
    for row in aggregated_rows.values():
        if abs(row["debit"]) < epsilon:
            row["debit"] = 0.0
        if abs(row["credit"]) < epsilon:
            row["credit"] = 0.0

    purchase_ids = {
        int(r["entry"].source_id)
        for r in aggregated_rows.values()
        if r["entry"].source_type in {"purchase", "purchase_payment"} and r["entry"].source_id
    }
    purchase_meta = {}
    if purchase_ids:
        purchase_rows = db.query(Purchase.id, Purchase.total_amount, Purchase.amount_paid).filter(
            Purchase.id.in_(purchase_ids)
        ).all()
        purchase_meta = {
            pid: {
                "total": float(total_amount or 0.0),
                "paid": float(amount_paid or 0.0),
            }
            for pid, total_amount, amount_paid in purchase_rows
        }

    running_balance = opening_balance
    entries: List[LedgerEntry] = []

    if opening_balance != 0:
        entries.append(LedgerEntry(
            date=start,
            description="Opening Balance",
            debit=abs(opening_balance) if opening_balance < 0 else 0.0,
            credit=opening_balance if opening_balance > 0 else 0.0,
            balance=running_balance,
        ))

    purchase_ids_in_journal = set()
    journal_events = []
    for row in sorted(
        aggregated_rows.values(),
        key=lambda r: (r["entry"].entry_date, r["entry"].id),
    ):
        entry = row["entry"]
        debit = row["debit"]
        credit = row["credit"]

        has_material_ap_movement = (abs(debit) + abs(credit)) >= epsilon

        if entry.source_type in {"purchase", "purchase_payment"} and entry.source_id and has_material_ap_movement:
            purchase_ids_in_journal.add(int(entry.source_id))

        # Skip zero-effect AP artifacts for purchase rows; informational event will be added below.
        if entry.source_type in {"purchase", "purchase_payment"} and not has_material_ap_movement:
            continue

        description = entry.description
        if entry.source_type == "vendor_payment":
            description = (
                f"{entry.description} "
                f"(Paid {debit:.2f})"
            )
        elif entry.source_type in {"purchase", "purchase_payment"} and entry.source_id in purchase_meta:
            meta = purchase_meta[int(entry.source_id)]
            due = max(0.0, meta["total"] - meta["paid"])
            description = (
                f"{entry.description} "
                f"(Total {meta['total']:.2f}, Paid {meta['paid']:.2f}, Due {due:.2f})"
            )
        elif entry.source_type == "vendor_advance":
            description = (
                f"{entry.description} "
                f"(Advance +{debit:.2f})"
            )

        journal_events.append((entry.entry_date, 0, {
            "description": description,
            "source_type": entry.source_type,
            "source_id": entry.source_id,
            "debit": debit,
            "credit": credit,
        }))

    purchase_rows = db.query(
        Purchase.id,
        Purchase.created_at,
        Purchase.total_amount,
        Purchase.amount_paid,
    ).filter(
        Purchase.vendor_id == vendor_id,
        Purchase.created_at >= start,
        Purchase.created_at <= end,
    ).all()

    info_events = []
    for purchase_id, created_at, total_amount, amount_paid in purchase_rows:
        if int(purchase_id) in purchase_ids_in_journal:
            continue
        total = float(total_amount or 0.0)
        paid = float(amount_paid or 0.0)
        due = max(0.0, total - paid)
        # Synthetic AP view for fully/partially paid purchases missing AP journal rows:
        # CR = purchase total (liability created), DR = amount settled against AP.
        ap_credit = total
        ap_debit = min(paid, total)
        info_events.append((created_at, 1, {
            "description": f"Purchase #{purchase_id} (Total {total:.2f}, Paid {paid:.2f}, Due {due:.2f})",
            "source_type": "purchase",
            "source_id": int(purchase_id),
            "debit": ap_debit,
            "credit": ap_credit,
        }))

    for event_date, _, data in sorted([*journal_events, *info_events], key=lambda x: (x[0], x[1])):
        debit = data["debit"]
        credit = data["credit"]
        running_balance += credit - debit
        entries.append(LedgerEntry(
            date=event_date,
            description=data["description"],
            source_type=data["source_type"],
            source_id=data["source_id"],
            debit=debit,
            credit=credit,
            balance=running_balance,
        ))

    if export:
        csv_data = [
            {
                "Date": e.date.isoformat(),
                "Description": e.description,
                "Source Type": e.source_type or "",
                "Source ID": e.source_id or "",
                "Debit": f"{e.debit:.2f}",
                "Credit": f"{e.credit:.2f}",
                "Balance": f"{e.balance:.2f}",
            }
            for e in entries
        ]
        return export_to_csv(csv_data, f"vendor_ledger_{vendor_id}_{start.date()}_{end.date()}.csv")

    return {
        "opening_balance": opening_balance,
        "closing_balance": running_balance,
        "entries": entries,
    }


@router.get("/daily-summary-text")
def get_daily_summary_text(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get daily summary report in text format for admin notifications"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get today's date range in Pakistan timezone
    pakistan_now = _get_pakistan_time()
    today = pakistan_now.date()
    start_of_day = datetime.combine(today, datetime.min.time())
    end_of_day = datetime.combine(today, datetime.max.time())
    
    # Build the report text
    report_lines = []
    report_lines.append("=" * 50)
    report_lines.append(f"DAILY SALES REPORT - {today.strftime('%d %B %Y')}")
    report_lines.append("=" * 50)
    report_lines.append("")
    
    # 1. TODAY'S SALES BY PAYMENT METHOD
    report_lines.append("📊 SALES SUMMARY")
    report_lines.append("-" * 50)
    
    sales = db.query(Sale).filter(
        and_(Sale.created_at >= start_of_day, Sale.created_at <= end_of_day)
    ).all()
    
    if sales:
        # Total sales
        total_revenue = sum(sale.total for sale in sales)
        total_transactions = len(sales)
        
        # Group by payment method
        payment_totals = {}
        for sale in sales:
            method = sale.payment_method or 'cash'
            payment_totals[method] = payment_totals.get(method, 0) + sale.total
        
        report_lines.append(f"Total Transactions: {total_transactions}")
        report_lines.append(f"Total Revenue: Rs. {total_revenue:,.2f}")
        report_lines.append("")
        report_lines.append("Payment Method Breakdown:")
        for method, amount in sorted(payment_totals.items()):
            percentage = (amount / total_revenue * 100) if total_revenue > 0 else 0
            report_lines.append(f"  • {method.upper()}: Rs. {amount:,.2f} ({percentage:.1f}%)")
        
        # Outstanding dues (udhar)
        total_due = sum(sale.amount_due for sale in sales if sale.amount_due > 0)
        if total_due > 0:
            report_lines.append(f"\n⚠️  Outstanding Credit (Udhar): Rs. {total_due:,.2f}")
    else:
        report_lines.append("No sales recorded today.")
    
    report_lines.append("")
    
    # 2. SALES BY CASHIER
    report_lines.append("👤 CASHIER PERFORMANCE")
    report_lines.append("-" * 50)
    
    cashier_sales = db.query(
        User.username,
        func.count(Sale.id).label('sales_count'),
        func.sum(Sale.total).label('total_sales')
    ).join(Sale, Sale.user_id == User.id).filter(
        and_(Sale.created_at >= start_of_day, Sale.created_at <= end_of_day)
    ).group_by(User.id, User.username).all()
    
    if cashier_sales:
        for cashier in cashier_sales:
            report_lines.append(f"{cashier.username}: {cashier.sales_count} transactions, Rs. {cashier.total_sales:,.2f}")
    else:
        report_lines.append("No cashier sales today.")
    
    report_lines.append("")
    
    # 3. LOW STOCK ALERTS
    report_lines.append("⚠️  LOW STOCK ALERTS")
    report_lines.append("-" * 50)
    
    low_stock_products = db.query(Product).filter(
        Product.quantity <= Product.low_stock_threshold
    ).order_by(Product.quantity).limit(10).all()
    
    if low_stock_products:
        for product in low_stock_products:
            status = "OUT OF STOCK" if product.quantity == 0 else "LOW STOCK"
            report_lines.append(f"  • {product.name} ({product.sku}): {product.quantity} {product.base_unit} [{status}]")
    else:
        report_lines.append("All products are well stocked! ✓")
    
    report_lines.append("")
    
    # 4. PRODUCT VARIATIONS LOW STOCK
    
    # 5. TOP SELLING PRODUCTS TODAY
    report_lines.append("🔥 TOP SELLING PRODUCTS TODAY")
    report_lines.append("-" * 50)
    
    top_products = db.query(
        Product.name,
        Product.sku,
        func.sum(SaleItem.quantity).label('qty_sold'),
        func.sum(SaleItem.total_price).label('revenue')
    ).join(SaleItem, SaleItem.product_id == Product.id).join(
        Sale, SaleItem.sale_id == Sale.id
    ).filter(
        and_(Sale.created_at >= start_of_day, Sale.created_at <= end_of_day)
    ).group_by(Product.id, Product.name, Product.sku).order_by(
        func.sum(SaleItem.quantity).desc()
    ).limit(5).all()
    
    if top_products:
        for idx, product in enumerate(top_products, 1):
            report_lines.append(f"  {idx}. {product.name}: {product.qty_sold} units sold, Rs. {product.revenue:,.2f}")
    else:
        report_lines.append("No products sold today.")
    
    report_lines.append("")
    report_lines.append("=" * 50)
    pakistan_now = _get_pakistan_time()
    report_lines.append(f"Report Generated: {pakistan_now.strftime('%d %B %Y %I:%M %p')}")
    report_lines.append("=" * 50)
    
    # Join all lines into a single text string
    report_text = "\n".join(report_lines)
    
    return {
        "report": report_text,
        "generated_at": pakistan_now.isoformat()
    }


@router.get("/weekly-summary-text")
def get_weekly_summary_text(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get weekly summary report in text format for admin notifications"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get this week's date range (Monday to Sunday) in Pakistan timezone
    pakistan_now = _get_pakistan_time()
    today = pakistan_now.date()
    start_of_week = today - timedelta(days=today.weekday())  # Monday
    end_of_week = start_of_week + timedelta(days=6)  # Sunday
    
    start_datetime = datetime.combine(start_of_week, datetime.min.time())
    end_datetime = datetime.combine(end_of_week, datetime.max.time())
    
    # Build the report text
    report_lines = []
    report_lines.append("=" * 50)
    report_lines.append(f"WEEKLY SALES REPORT")
    report_lines.append(f"{start_of_week.strftime('%d %B')} - {end_of_week.strftime('%d %B %Y')}")
    report_lines.append("=" * 50)
    report_lines.append("")
    
    # 1. WEEK'S SALES SUMMARY
    report_lines.append("📊 WEEKLY SALES SUMMARY")
    report_lines.append("-" * 50)
    
    sales = db.query(Sale).filter(
        and_(Sale.created_at >= start_datetime, Sale.created_at <= end_datetime)
    ).all()
    
    if sales:
        # Total sales
        total_revenue = sum(sale.total for sale in sales)
        total_transactions = len(sales)
        avg_transaction = total_revenue / total_transactions if total_transactions > 0 else 0
        
        # Group by payment method
        payment_totals = {}
        for sale in sales:
            method = sale.payment_method or 'cash'
            payment_totals[method] = payment_totals.get(method, 0) + sale.total
        
        report_lines.append(f"Total Transactions: {total_transactions}")
        report_lines.append(f"Total Revenue: Rs. {total_revenue:,.2f}")
        report_lines.append(f"Average Transaction: Rs. {avg_transaction:,.2f}")
        report_lines.append(f"Daily Average: Rs. {total_revenue / 7:,.2f}")
        report_lines.append("")
        report_lines.append("Payment Method Breakdown:")
        for method, amount in sorted(payment_totals.items()):
            percentage = (amount / total_revenue * 100) if total_revenue > 0 else 0
            report_lines.append(f"  • {method.upper()}: Rs. {amount:,.2f} ({percentage:.1f}%)")
        
        # Outstanding dues (udhar)
        total_due = sum(sale.amount_due for sale in sales if sale.amount_due > 0)
        if total_due > 0:
            report_lines.append(f"\n⚠️  Outstanding Credit (Udhar): Rs. {total_due:,.2f}")
    else:
        report_lines.append("No sales recorded this week.")
    
    report_lines.append("")
    
    # 2. DAILY BREAKDOWN
    report_lines.append("📅 DAILY BREAKDOWN")
    report_lines.append("-" * 50)
    
    for i in range(7):
        day_date = start_of_week + timedelta(days=i)
        day_start = datetime.combine(day_date, datetime.min.time())
        day_end = datetime.combine(day_date, datetime.max.time())
        
        day_sales = db.query(Sale).filter(
            and_(Sale.created_at >= day_start, Sale.created_at <= day_end)
        ).all()
        
        day_revenue = sum(sale.total for sale in day_sales) if day_sales else 0
        day_count = len(day_sales)
        
        day_name = day_date.strftime('%A')
        is_today = day_date == today
        marker = " ← TODAY" if is_today else ""
        
        report_lines.append(f"{day_name:10} ({day_date.strftime('%d %b')}): {day_count:3} sales, Rs. {day_revenue:10,.2f}{marker}")
    
    report_lines.append("")
    
    # 3. CASHIER PERFORMANCE
    report_lines.append("👤 CASHIER PERFORMANCE (Week)")
    report_lines.append("-" * 50)
    
    cashier_sales = db.query(
        User.username,
        func.count(Sale.id).label('sales_count'),
        func.sum(Sale.total).label('total_sales')
    ).join(Sale, Sale.user_id == User.id).filter(
        and_(Sale.created_at >= start_datetime, Sale.created_at <= end_datetime)
    ).group_by(User.id, User.username).order_by(func.sum(Sale.total).desc()).all()
    
    if cashier_sales:
        for idx, cashier in enumerate(cashier_sales, 1):
            avg_per_sale = cashier.total_sales / cashier.sales_count if cashier.sales_count > 0 else 0
            report_lines.append(f"  {idx}. {cashier.username}: {cashier.sales_count} sales, Rs. {cashier.total_sales:,.2f} (Avg: Rs. {avg_per_sale:,.2f})")
    else:
        report_lines.append("No cashier sales this week.")
    
    report_lines.append("")
    
    # 4. LOW STOCK ALERTS
    report_lines.append("⚠️  LOW STOCK ALERTS")
    report_lines.append("-" * 50)
    
    low_stock_products = db.query(Product).filter(
        Product.quantity <= Product.low_stock_threshold
    ).order_by(Product.quantity).limit(10).all()
    
    if low_stock_products:
        for product in low_stock_products:
            status = "OUT OF STOCK" if product.quantity == 0 else "LOW STOCK"
            report_lines.append(f"  • {product.name} ({product.sku}): {product.quantity} {product.base_unit} [{status}]")
    else:
        report_lines.append("All products are well stocked! ✓")
    
    report_lines.append("")
    
    # 5. TOP SELLING PRODUCTS THIS WEEK
    report_lines.append("🔥 TOP SELLING PRODUCTS (Week)")
    report_lines.append("-" * 50)
    
    top_products = db.query(
        Product.name,
        Product.sku,
        func.sum(SaleItem.quantity).label('qty_sold'),
        func.sum(SaleItem.total_price).label('revenue')
    ).join(SaleItem, SaleItem.product_id == Product.id).join(
        Sale, SaleItem.sale_id == Sale.id
    ).filter(
        and_(Sale.created_at >= start_datetime, Sale.created_at <= end_datetime)
    ).group_by(Product.id, Product.name, Product.sku).order_by(
        func.sum(SaleItem.quantity).desc()
    ).limit(10).all()
    
    if top_products:
        for idx, product in enumerate(top_products, 1):
            report_lines.append(f"  {idx:2}. {product.name}: {product.qty_sold} units, Rs. {product.revenue:,.2f}")
    else:
        report_lines.append("No products sold this week.")
    
    report_lines.append("")
    
    # # 6. WORST PERFORMING PRODUCTS (Not sold or low sales)
    # report_lines.append("📉 SLOW MOVING PRODUCTS (Week)")
    # report_lines.append("-" * 50)
    
    # slow_products = db.query(
    #     Product.name,
    #     Product.sku,
    #     Product.quantity,
    #     func.coalesce(func.sum(SaleItem.quantity), 0).label('qty_sold')
    # ).outerjoin(SaleItem, SaleItem.product_id == Product.id).outerjoin(
    #     Sale, and_(SaleItem.sale_id == Sale.id, Sale.created_at >= start_datetime, Sale.created_at <= end_datetime)
    # ).filter(
    #     Product.quantity > 0
    # ).group_by(Product.id, Product.name, Product.sku, Product.quantity).order_by(
    #     func.coalesce(func.sum(SaleItem.quantity), 0).asc()
    # ).limit(10).all()
    
    # if slow_products:
    #     for idx, product in enumerate(slow_products, 1):
    #         if product.qty_sold == 0:
    #             report_lines.append(f"  {idx:2}. {product.name}: No sales (Stock: {product.quantity})")
    #         else:
    #             report_lines.append(f"  {idx:2}. {product.name}: {product.qty_sold} units (Stock: {product.quantity})")
    # else:
    #     report_lines.append("No slow moving products.")
    
    # report_lines.append("")
    
    # # 7. SALES TREND
    # report_lines.append("📈 SALES TREND")
    # report_lines.append("-" * 50)
    
    # # Compare with previous week
    # prev_week_start = start_of_week - timedelta(days=7)
    # prev_week_end = start_of_week - timedelta(days=1)
    # prev_week_start_dt = datetime.combine(prev_week_start, datetime.min.time())
    # prev_week_end_dt = datetime.combine(prev_week_end, datetime.max.time())
    
    # prev_week_sales = db.query(Sale).filter(
    #     and_(Sale.created_at >= prev_week_start_dt, Sale.created_at <= prev_week_end_dt)
    # ).all()
    
    # if prev_week_sales and sales:
    #     prev_revenue = sum(sale.total for sale in prev_week_sales)
    #     current_revenue = sum(sale.total for sale in sales)
        
    #     if prev_revenue > 0:
    #         change = ((current_revenue - prev_revenue) / prev_revenue) * 100
    #         trend_symbol = "📈" if change > 0 else "📉" if change < 0 else "➡️"
    #         change_text = f"{abs(change):.1f}%"
            
    #         report_lines.append(f"Previous Week: Rs. {prev_revenue:,.2f}")
    #         report_lines.append(f"Current Week:  Rs. {current_revenue:,.2f}")
    #         report_lines.append(f"Change: {trend_symbol} {change_text} {'increase' if change > 0 else 'decrease' if change < 0 else 'no change'}")
    #     else:
    #         report_lines.append("No comparison data available.")
    # else:
    #     report_lines.append("Insufficient data for trend analysis.")
    
    # report_lines.append("")
    report_lines.append("=" * 50)
    pakistan_now_end = _get_pakistan_time()
    report_lines.append(f"Report Generated: {pakistan_now_end.strftime('%d %B %Y %I:%M %p')}")
    report_lines.append("=" * 50)
    
    # Join all lines into a single text string
    report_text = "\n".join(report_lines)
    
    return {
        "report": report_text,
        "generated_at": pakistan_now_end.isoformat(),
        "week_start": start_of_week.isoformat(),
        "week_end": end_of_week.isoformat()
    }


@router.post("/daily-summary-text/send")
def send_daily_summary_text(
    phone_number: str = Query(..., description="Phone number in format 923171585452"),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Send daily summary report via WhatsApp"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Generate the report
    report_data = get_daily_summary_text(db=db, current_user=current_user)
    report_text = report_data["report"]
    
    # Send via WhatsApp
    try:
        whatsapp_url = "http://127.0.0.1:8000/api/v1/whatsapp/send"
        payload = {
            "phone_number": phone_number,
            "message": report_text
        }
        
        response = requests.post(
            whatsapp_url,
            json=payload,
            headers={"accept": "application/json", "Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code != 200:
            raise Exception(f"WhatsApp API error: {response.text}")
        
        return {
            "status": "success",
            "message": "Daily report sent successfully",
            "phone_number": phone_number,
            "sent_at": now_pkt().isoformat()
        }
        
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Failed to send report: {str(e)}")


@router.post("/weekly-summary-text/send")
def send_weekly_summary_text(
    phone_number: str = Query(..., description="Phone number in format 923171585452"),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Send weekly summary report via WhatsApp"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Generate the report
    report_data = get_weekly_summary_text(db=db, current_user=current_user)
    report_text = report_data["report"]
    
    # Send via WhatsApp
    try:
        whatsapp_url = "http://127.0.0.1:8000/api/v1/whatsapp/send"
        payload = {
            "phone_number": phone_number,
            "message": report_text
        }
        
        response = requests.post(
            whatsapp_url,
            json=payload,
            headers={"accept": "application/json", "Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code != 200:
            raise Exception(f"WhatsApp API error: {response.text}")
        
        return {
            "status": "success",
            "message": "Weekly report sent successfully",
            "phone_number": phone_number,
            "sent_at": now_pkt().isoformat()
        }
        
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Failed to send report: {str(e)}")


@router.post("/send-scheduled-reports")
def send_scheduled_reports(
    phone_number: str = Query(..., description="Phone number in format 923171585452"),
    report_type: str = Query(..., enum=["daily", "weekly"]),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Send scheduled reports (daily or weekly) via WhatsApp.
    This endpoint can be called by a cron job or scheduler.
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if report_type == "daily":
        return send_daily_summary_text(phone_number=phone_number, db=db, current_user=current_user)
    elif report_type == "weekly":
        return send_weekly_summary_text(phone_number=phone_number, db=db, current_user=current_user)
    else:
        raise HTTPException(status_code=400, detail="Invalid report type")
