"""Business queries and PDF generation for owner WhatsApp reports."""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Iterable, Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    LongTable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timezone import now_pkt
from app.models.customer import Customer
from app.models.pos_return import PosReturn
from app.models.product import Product
from app.models.purchase import Purchase
from app.models.sale import Sale, SaleItem
from app.models.settings import StoreSettings
from app.models.vendor import Vendor
from app.services import accounting as accounting_service


REPORT_DIR = Path(settings.DATA_DIR) / "whatsapp" / "reports"


def normalize_whatsapp_number(value: Optional[str]) -> str:
    """Return a digits-only international number, normalizing Pakistan local forms."""
    digits = re.sub(r"\D", "", value or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("0") and len(digits) == 11:
        return "92" + digits[1:]
    if len(digits) == 10 and digits.startswith("3"):
        return "92" + digits
    return digits


def get_owner_number(db: Session) -> str:
    row = db.query(StoreSettings).filter(StoreSettings.id == 1).first()
    return normalize_whatsapp_number(row.whatsapp_owner_number if row else "")


def find_customer_balance(db: Session, phone_number: str) -> Optional[dict]:
    """Find a customer using normalized phone forms and return its ledger balance."""
    requested = normalize_whatsapp_number(phone_number)
    if not requested:
        return None
    customer = next(
        (
            row
            for row in db.query(Customer).order_by(Customer.id.asc()).all()
            if normalize_whatsapp_number(row.phone) == requested
        ),
        None,
    )
    if customer is None:
        return None
    balance = accounting_service.get_customer_balance(
        db,
        customer.id,
        float(customer.opening_balance or 0.0),
    )
    return {
        "name": customer.name or customer.customer_id or customer.phone or f"Customer #{customer.id}",
        "phone": customer.phone or requested,
        "balance": float(balance),
    }


def get_low_stock_items(db: Session) -> list[dict]:
    rows: list[dict] = []
    for product in db.query(Product).order_by(Product.name.asc()).all():
        quantity = float(product.quantity or 0.0)
        if product.has_variations:
            quantity += sum(float(variation.quantity or 0.0) for variation in product.variations)
        threshold = float(
            product.low_stock_threshold
            if product.low_stock_threshold is not None
            else 10
        )
        if quantity <= threshold:
            rows.append({
                "name": product.name,
                "sku": product.sku or "-",
                "quantity": quantity,
                "threshold": threshold,
                "unit": product.base_unit or "piece",
                "status": "OUT OF STOCK" if quantity <= 0 else "LOW STOCK",
            })
    return sorted(rows, key=lambda item: (item["quantity"], item["name"].lower()))


def get_vendor_outstanding(db: Session) -> list[dict]:
    rows = []
    for vendor in db.query(Vendor).order_by(Vendor.name.asc()).all():
        balance = max(0.0, accounting_service.get_vendor_balance(db, vendor.id))
        if balance > 0.005:
            rows.append({
                "name": vendor.name,
                "phone": vendor.phone or "-",
                "balance": balance,
            })
    return sorted(rows, key=lambda item: (-item["balance"], item["name"].lower()))


def get_customer_outstanding_total(db: Session) -> float:
    customers = db.query(Customer).all()
    balances = accounting_service.get_customer_balances(
        db,
        {row.id: float(row.opening_balance or 0.0) for row in customers},
    )
    return sum(max(0.0, balance) for balance in balances.values())


def get_sales_snapshot(db: Session, start_date: date, end_date: date) -> dict:
    """Return inclusive sales-period totals for compact owner updates."""
    if end_date < start_date:
        raise ValueError("end_date cannot be before start_date")

    start_dt = datetime.combine(start_date, time.min)
    end_dt = datetime.combine(end_date + timedelta(days=1), time.min)
    sales = db.query(Sale).filter(
        Sale.created_at >= start_dt,
        Sale.created_at < end_dt,
    ).all()
    sale_returns = db.query(PosReturn).filter(
        PosReturn.created_at >= start_dt,
        PosReturn.created_at < end_dt,
        PosReturn.status == "approved",
        PosReturn.sale_id.isnot(None),
    ).all()

    payment_totals: dict[str, float] = {}
    for sale in sales:
        method = str(sale.payment_method or "cash").lower()
        payment_totals[method] = payment_totals.get(method, 0.0) + max(
            0.0,
            float(sale.total or 0.0) - float(sale.amount_due or 0.0),
        )

    top_products = db.query(
        Product.name,
        func.coalesce(func.sum(SaleItem.quantity), 0.0).label("quantity"),
        func.coalesce(func.sum(SaleItem.total_price), 0.0).label("revenue"),
    ).join(SaleItem, SaleItem.product_id == Product.id).join(
        Sale, Sale.id == SaleItem.sale_id
    ).filter(
        Sale.created_at >= start_dt,
        Sale.created_at < end_dt,
    ).group_by(Product.id, Product.name).order_by(
        func.sum(SaleItem.total_price).desc()
    ).limit(5).all()

    gross_sales = sum(float(sale.total or 0.0) for sale in sales)
    refunds = sum(float(row.refund_amount or 0.0) for row in sale_returns)
    return {
        "transaction_count": len(sales),
        "gross_sales": gross_sales,
        "refunds": refunds,
        "net_sales": gross_sales - refunds,
        "amount_collected": sum(payment_totals.values()),
        "credit_sales": sum(max(0.0, float(sale.amount_due or 0.0)) for sale in sales),
        "payment_totals": payment_totals,
        "top_products": [
            {
                "name": row.name,
                "quantity": float(row.quantity or 0.0),
                "revenue": float(row.revenue or 0.0),
            }
            for row in top_products
        ],
    }


def _store_name(db: Session) -> str:
    row = db.query(StoreSettings).filter(StoreSettings.id == 1).first()
    return (row.store_name if row else None) or "VibePOS"


def _clean_old_reports(days: int = 30) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    cutoff = now_pkt() - timedelta(days=days)
    for path in REPORT_DIR.glob("*.pdf"):
        try:
            modified = datetime.fromtimestamp(path.stat().st_mtime)
            if modified < cutoff:
                path.unlink()
        except OSError:
            continue


def _money(value: float) -> str:
    return f"PKR {float(value or 0):,.2f}"


def _quantity(value: float) -> str:
    number = float(value or 0.0)
    return f"{number:,.3f}".rstrip("0").rstrip(".")


def _styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="ReportTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#17324D"),
        spaceAfter=4 * mm,
    ))
    styles.add(ParagraphStyle(
        name="ReportSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        leading=13,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#5D6D7E"),
        spaceAfter=5 * mm,
    ))
    styles.add(ParagraphStyle(
        name="SectionHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#17324D"),
        spaceBefore=4 * mm,
        spaceAfter=2 * mm,
    ))
    return styles


def _table(data: Iterable[Iterable[object]], widths=None, numeric_columns=()) -> Table:
    rows = list(data)
    header_style = ParagraphStyle(
        "TableHeader",
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=10.5,
        textColor=colors.white,
    )
    body_style = ParagraphStyle(
        "TableBody",
        fontName="Helvetica",
        fontSize=8.5,
        leading=10.5,
        textColor=colors.black,
    )
    numeric_style = ParagraphStyle(
        "TableNumber",
        parent=body_style,
        alignment=TA_RIGHT,
    )
    prepared = []
    for row_index, row in enumerate(rows):
        prepared.append([
            Paragraph(
                escape(str(cell)),
                header_style
                if row_index == 0
                else numeric_style
                if column_index in numeric_columns
                else body_style,
            )
            for column_index, cell in enumerate(row)
        ])
    table = LongTable(prepared, colWidths=widths, repeatRows=1, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17324D")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CCD6DD")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7F9")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for column in numeric_columns:
        style.append(("ALIGN", (column, 1), (column, -1), "RIGHT"))
    table.setStyle(TableStyle(style))
    return table


def _page_footer(canvas, document) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawString(15 * mm, 10 * mm, f"Generated {now_pkt().strftime('%d %b %Y %I:%M %p')} PKT")
    canvas.drawRightString(document.pagesize[0] - 15 * mm, 10 * mm, f"Page {document.page}")
    canvas.restoreState()


def _build_pdf(path: Path, story: list, *, landscape_page: bool = False) -> Path:
    _clean_old_reports()
    page_size = landscape(A4) if landscape_page else A4
    document = SimpleDocTemplate(
        str(path),
        pagesize=page_size,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=17 * mm,
        title=path.stem.replace("_", " ").title(),
    )
    document.build(story, onFirstPage=_page_footer, onLaterPages=_page_footer)
    return path


def create_sales_report_pdf(db: Session, start_date: date, end_date: date) -> Path:
    """Create an inclusive sales-period PDF; current balances/stock are labeled as such."""
    if end_date < start_date:
        raise ValueError("end_date cannot be before start_date")

    start_dt = datetime.combine(start_date, time.min)
    end_dt = datetime.combine(end_date + timedelta(days=1), time.min)
    sales = db.query(Sale).filter(Sale.created_at >= start_dt, Sale.created_at < end_dt).all()
    sale_returns = db.query(PosReturn).filter(
        PosReturn.created_at >= start_dt,
        PosReturn.created_at < end_dt,
        PosReturn.status == "approved",
        PosReturn.sale_id.isnot(None),
    ).all()
    purchase_returns = db.query(PosReturn).filter(
        PosReturn.created_at >= start_dt,
        PosReturn.created_at < end_dt,
        PosReturn.status == "approved",
        PosReturn.notes.like("%[PURCHASE_RETURN:%"),
    ).all()
    purchases = db.query(Purchase).filter(
        Purchase.created_at >= start_dt,
        Purchase.created_at < end_dt,
    ).all()

    gross_sales = sum(float(row.total or 0.0) for row in sales)
    refunds = sum(float(row.refund_amount or 0.0) for row in sale_returns)
    net_sales = gross_sales - refunds
    collected = sum(
        max(0.0, float(row.total or 0.0) - float(row.amount_due or 0.0))
        for row in sales
    )
    credit_sales = sum(max(0.0, float(row.amount_due or 0.0)) for row in sales)
    purchase_total = sum(float(row.total_amount or 0.0) for row in purchases)
    purchase_return_total = sum(float(row.refund_amount or 0.0) for row in purchase_returns)

    payment_totals: dict[str, float] = {}
    for sale in sales:
        key = str(sale.payment_method or "cash").lower()
        payment_totals[key] = payment_totals.get(key, 0.0) + float(sale.total or 0.0)

    top_products = db.query(
        Product.name,
        Product.sku,
        func.coalesce(func.sum(SaleItem.quantity), 0.0).label("quantity"),
        func.coalesce(func.sum(SaleItem.total_price), 0.0).label("revenue"),
    ).join(SaleItem, SaleItem.product_id == Product.id).join(
        Sale, Sale.id == SaleItem.sale_id
    ).filter(
        Sale.created_at >= start_dt,
        Sale.created_at < end_dt,
    ).group_by(Product.id, Product.name, Product.sku).order_by(
        func.sum(SaleItem.total_price).desc()
    ).limit(15).all()

    styles = _styles()
    one_day = start_date == end_date
    is_full_week = (
        (end_date - start_date).days == 6
        and start_date.weekday() == 0
        and end_date.weekday() == 6
    )
    title = (
        "Previous Day Report"
        if one_day
        else "Previous Week Report"
        if is_full_week
        else "Daily Report Catch-up"
    )
    period = (
        start_date.strftime("%A, %d %B %Y")
        if one_day
        else f"{start_date.strftime('%d %B %Y')} - {end_date.strftime('%d %B %Y')}"
    )
    story = [
        Paragraph(_store_name(db), styles["ReportTitle"]),
        Paragraph(f"{title}<br/>{period}", styles["ReportSubtitle"]),
        Paragraph("Sales Summary", styles["SectionHeading"]),
        _table([
            ["Metric", "Value"],
            ["Transactions", len(sales)],
            ["Gross sales", _money(gross_sales)],
            ["Approved sale returns", _money(refunds)],
            ["Net sales", _money(net_sales)],
            ["Collected against these sales", _money(collected)],
            ["Credit added by these sales", _money(credit_sales)],
            ["Purchases", _money(purchase_total)],
            ["Approved purchase returns", _money(purchase_return_total)],
        ], widths=[105 * mm, 60 * mm], numeric_columns=(1,)),
        Paragraph("Payment Method Breakdown (Gross Sales)", styles["SectionHeading"]),
        _table(
            [["Payment method", "Amount"]]
            + [[method.title(), _money(amount)] for method, amount in sorted(payment_totals.items())]
            if payment_totals
            else [["Payment method", "Amount"], ["No sales", _money(0)]],
            widths=[105 * mm, 60 * mm],
            numeric_columns=(1,),
        ),
    ]

    if not one_day:
        sales_by_day: dict[date, list[Sale]] = {}
        returns_by_day: dict[date, float] = {}
        for sale in sales:
            sales_by_day.setdefault(sale.created_at.date(), []).append(sale)
        for return_row in sale_returns:
            return_day = return_row.created_at.date()
            returns_by_day[return_day] = returns_by_day.get(return_day, 0.0) + float(return_row.refund_amount or 0.0)
        breakdown = [["Date", "Transactions", "Gross sales", "Returns", "Net sales"]]
        cursor = start_date
        while cursor <= end_date:
            day_sales = sales_by_day.get(cursor, [])
            day_gross = sum(float(row.total or 0.0) for row in day_sales)
            day_returns = returns_by_day.get(cursor, 0.0)
            breakdown.append([
                cursor.strftime("%a, %d %b"),
                len(day_sales),
                _money(day_gross),
                _money(day_returns),
                _money(day_gross - day_returns),
            ])
            cursor += timedelta(days=1)
        story.extend([
            Paragraph("Daily Breakdown", styles["SectionHeading"]),
            _table(breakdown, widths=[36 * mm, 28 * mm, 35 * mm, 32 * mm, 35 * mm], numeric_columns=(1, 2, 3, 4)),
        ])

    story.extend([
        Paragraph("Top Selling Products (Gross)", styles["SectionHeading"]),
        _table(
            [["Product", "SKU", "Quantity", "Revenue"]]
            + [
                [row.name, row.sku or "-", _quantity(row.quantity), _money(row.revenue)]
                for row in top_products
            ]
            if top_products
            else [["Product", "SKU", "Quantity", "Revenue"], ["No products sold", "-", "0", _money(0)]],
            widths=[66 * mm, 35 * mm, 27 * mm, 38 * mm],
            numeric_columns=(2, 3),
        ),
    ])

    low_stock = get_low_stock_items(db)
    vendor_outstanding = get_vendor_outstanding(db)
    story.extend([
        PageBreak(),
        Paragraph("Current Position", styles["SectionHeading"]),
        Paragraph(
            "The figures below are current at report-generation time, not historical period snapshots.",
            styles["Normal"],
        ),
        Spacer(1, 2 * mm),
        _table([
            ["Metric", "Value"],
            ["Customer receivables", _money(get_customer_outstanding_total(db))],
            ["Vendor payables", _money(sum(row["balance"] for row in vendor_outstanding))],
            ["Low/out-of-stock products", len(low_stock)],
        ], widths=[105 * mm, 60 * mm], numeric_columns=(1,)),
        Paragraph("Low Stock Items", styles["SectionHeading"]),
        _table(
            [["Product", "SKU", "Stock", "Threshold", "Status"]]
            + [
                [row["name"], row["sku"], f"{_quantity(row['quantity'])} {row['unit']}", _quantity(row["threshold"]), row["status"]]
                for row in low_stock[:25]
            ]
            if low_stock
            else [["Product", "SKU", "Stock", "Threshold", "Status"], ["No low-stock items", "-", "-", "-", "OK"]],
            widths=[58 * mm, 30 * mm, 31 * mm, 23 * mm, 24 * mm],
            numeric_columns=(2, 3),
        ),
    ])

    file_name = f"sales_report_{start_date.isoformat()}_{end_date.isoformat()}.pdf"
    return _build_pdf(REPORT_DIR / file_name, story)


def create_low_stock_report_pdf(db: Session) -> Path:
    rows = get_low_stock_items(db)
    styles = _styles()
    story = [
        Paragraph(_store_name(db), styles["ReportTitle"]),
        Paragraph("Low Stock Report - Current Position", styles["ReportSubtitle"]),
        _table(
            [["Product", "SKU", "Current stock", "Threshold", "Status"]]
            + [
                [row["name"], row["sku"], f"{_quantity(row['quantity'])} {row['unit']}", _quantity(row["threshold"]), row["status"]]
                for row in rows
            ]
            if rows
            else [["Product", "SKU", "Current stock", "Threshold", "Status"], ["No low-stock items", "-", "-", "-", "OK"]],
            widths=[75 * mm, 38 * mm, 40 * mm, 28 * mm, 32 * mm],
            numeric_columns=(2, 3),
        ),
    ]
    return _build_pdf(
        REPORT_DIR / f"low_stock_{now_pkt().strftime('%Y%m%d_%H%M%S')}.pdf",
        story,
        landscape_page=True,
    )


def create_vendor_outstanding_report_pdf(db: Session) -> Path:
    rows = get_vendor_outstanding(db)
    styles = _styles()
    total = sum(row["balance"] for row in rows)
    story = [
        Paragraph(_store_name(db), styles["ReportTitle"]),
        Paragraph("Vendor Outstanding - Current Position", styles["ReportSubtitle"]),
        Paragraph(f"Total payable: {_money(total)}", styles["SectionHeading"]),
        _table(
            [["Vendor", "Phone", "Outstanding"]]
            + [[row["name"], row["phone"], _money(row["balance"])] for row in rows]
            if rows
            else [["Vendor", "Phone", "Outstanding"], ["No vendor payments outstanding", "-", _money(0)]],
            widths=[75 * mm, 48 * mm, 43 * mm],
            numeric_columns=(2,),
        ),
    ]
    return _build_pdf(
        REPORT_DIR / f"vendor_outstanding_{now_pkt().strftime('%Y%m%d_%H%M%S')}.pdf",
        story,
    )
