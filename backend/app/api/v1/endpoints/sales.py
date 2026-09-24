from typing import Dict, List, Literal, Optional
import os
import re
import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from datetime import datetime, date, timezone, timedelta
from app.core.timezone import now_pkt
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image as ReportLabImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from PIL import Image
import io
import requests
from types import SimpleNamespace
from pydantic import BaseModel, Field
from xml.sax.saxutils import escape

from app.api import deps
from app.core.config import settings
from app.models.sale import Sale, SaleItem
from app.models.product import Product, ProductVariation
from app.models.user import User, UserRole
from app.models.customer import Customer
from app.models.pos_return import PosReturn
from app.models.accounting import JournalEntry
from app.models.stock_batch import StockBatch, BatchStatus
from app.schemas.sale import SaleCreate, SaleUpdate, Sale as SaleSchema, SaleStats
from app.services import accounting as accounting_service

router = APIRouter()


class QuotationItemRequest(BaseModel):
    product_id: int
    variation_id: Optional[int] = None
    quantity: float = Field(gt=0)
    unit: str = "piece"
    item_discount: float = Field(default=0.0, ge=0)
    unit_price: Optional[float] = Field(default=None, ge=0)


class QuotationSendRequest(BaseModel):
    phone_number: str
    customer_name: Optional[str] = None
    items: List[QuotationItemRequest]
    discount: float = Field(default=0.0, ge=0)
    tax: float = Field(default=0.0, ge=0)
    delivery_charges: float = Field(default=0.0, ge=0)


def _deduct_from_batches_fifo(db: Session, product_id: int, variation_id, qty_needed: float) -> int | None:
    """Deducts qty_needed from ACTIVE batches in FIFO order. Returns last batch_id used."""
    batches = db.query(StockBatch).filter(
        StockBatch.product_id == product_id,
        StockBatch.variation_id == variation_id,
        StockBatch.status == BatchStatus.ACTIVE,
        StockBatch.quantity_remaining > 0,
    ).order_by(StockBatch.purchase_date.asc()).all()

    if not batches:
        return None

    batch_used_id = None
    remaining = qty_needed
    for batch in batches:
        take = min(batch.quantity_remaining, remaining)
        batch.quantity_remaining -= take
        if batch.quantity_remaining <= 0:
            batch.status = BatchStatus.DEPLETED
        remaining -= take
        batch_used_id = batch.id
        db.add(batch)
        if remaining <= 0:
            break
    return batch_used_id

# Invoice folder
INVOICE_DIR = Path.home() / "Downloads" / "pos_invoices"
INVOICE_DIR.mkdir(parents=True, exist_ok=True)


def _load_system_font(size: int, bold: bool = False):
    """
    Load a system font that is commonly available on Windows/macOS/Linux.
    Falls back to PIL's default bitmap font if none found.
    """
    from PIL import ImageFont

    windows_fonts = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/tahomabd.ttf" if bold else "C:/Windows/Fonts/tahoma.ttf",
    ]
    mac_fonts = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNS.ttf",
        "/Library/Fonts/Arial.ttf",
        "/Library/Fonts/Helvetica.ttf",
    ]
    linux_fonts = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]

    for font_path in [*windows_fonts, *mac_fonts, *linux_fonts]:
        if font_path and os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                continue

    return ImageFont.load_default()


def _get_store_details():
    """Fetch store details from DB, falling back to env vars if not set."""
    from app.db.session import SessionLocal
    from app.models.settings import StoreSettings
    db = SessionLocal()
    try:
        row = db.query(StoreSettings).filter(StoreSettings.id == 1).first()
        if row and row.store_name:
            name = row.store_name or "My Store"
            address_parts = [p for p in [row.store_address, row.store_city] if p]
            address = ", ".join(address_parts) if address_parts else ""
            phone = row.store_phone or ""
            return name, address, phone
    except Exception:
        pass
    finally:
        db.close()
    # fallback to env vars
    name = os.getenv("STORE_NAME", "My Store").strip() or "My Store"
    address = os.getenv("STORE_ADDRESS", "").strip()
    return name, address, ""


def _get_invoice_design() -> Dict[str, object]:
    """Load invoice preferences without tying renderers to an API request session."""
    from app.db.session import SessionLocal
    from app.models.settings import StoreSettings

    defaults: Dict[str, object] = {
        "tax_id": "",
        "logo_path": None,
        "default_whatsapp_format": "mobile",
        "default_whatsapp_design": "modern",
        "show_tax_id": True,
        "show_cashier": True,
        "show_sku": False,
        "show_customer_balance": True,
        "footer_message": "Thank you for your business!",
        "terms": "Return and exchange accepted with invoice.",
    }
    db = SessionLocal()
    try:
        row = db.query(StoreSettings).filter(StoreSettings.id == 1).first()
        if not row:
            return defaults
        logo_path = None
        if row.store_logo_filename:
            candidate = Path(settings.DATA_DIR) / "branding" / Path(row.store_logo_filename).name
            if candidate.is_file():
                logo_path = candidate
        return {
            "tax_id": row.store_tax_id or "",
            "logo_path": logo_path,
            "default_whatsapp_format": row.default_whatsapp_format or "mobile",
            "default_whatsapp_design": row.default_whatsapp_design or "modern",
            "show_tax_id": bool(row.invoice_show_tax_id),
            "show_cashier": bool(row.invoice_show_cashier),
            "show_sku": bool(row.invoice_show_sku),
            "show_customer_balance": bool(row.invoice_show_customer_balance),
            "footer_message": row.invoice_footer_message or "",
            "terms": row.invoice_terms or "",
        }
    except Exception:
        return defaults
    finally:
        db.close()


def _convert_utc_to_pakistan(dt: datetime) -> datetime:
    """
    Times are now stored as naive PKT (GMT+5) in the DB — return as-is.
    """
    return dt


def _get_invoice_amounts(sale: Sale) -> Dict[str, float]:
    """Return invoice amounts in a consistent way for image and WhatsApp caption."""
    total_item_discount = sum(float(getattr(item, "item_discount", 0.0) or 0.0) for item in sale.items)
    net_subtotal = float(sale.subtotal or 0.0)
    discount = float(sale.discount or 0.0)
    tax_amount = float(sale.tax or 0.0)
    delivery_charges = float(sale.delivery_charges or 0.0)
    total = float(sale.total or 0.0)
    previous_balance = float(getattr(sale, "previous_balance", 0.0) or 0.0)

    # `sale.subtotal` is stored after item-level discounts.
    # For receipt display, show subtotal before item discounts so the breakdown matches print.
    display_subtotal = net_subtotal + total_item_discount
    total_discount = discount + total_item_discount

    return {
        "display_subtotal": display_subtotal,
        "total_item_discount": total_item_discount,
        "total_discount": total_discount,
        "tax_amount": tax_amount,
        "delivery_charges": delivery_charges,
        "total": total,
        "previous_balance": previous_balance,
        "grand_total": total + previous_balance,
    }


def _build_whatsapp_invoice_caption(sale: Sale, refunded_amount: float = 0.0) -> str:
    """Build a WhatsApp caption using the same monetary values shown on the invoice image."""
    amounts = _get_invoice_amounts(sale)
    subtotal = amounts["display_subtotal"]
    total_discount = amounts["total_discount"]
    tax_amount = amounts["tax_amount"]
    delivery_charges = amounts["delivery_charges"]
    total = amounts["total"]
    previous_balance = amounts["previous_balance"]
    grand_total = amounts["grand_total"]
    amount_paid = float(sale.amount_paid or 0.0)
    amount_due = float(sale.amount_due or 0.0)
    account_balance = previous_balance + amount_due
    net_total = max(0.0, total - float(refunded_amount or 0.0))

    design = _get_invoice_design()
    lines = [
        f"Invoice #{str(sale.id).zfill(6)}",
        f"Date/Time (GMT+5): {_convert_utc_to_pakistan(sale.created_at).strftime('%Y-%m-%d %H:%M')}",
    ]
    if design["show_cashier"]:
        lines.append(f"Cashier: {sale.user.username if sale.user else 'N/A'}")
    lines.extend([
        f"Customer: {sale.customer_name or 'Walk-in Customer'}",
        "",
        f"Subtotal: RS {subtotal:.2f}",
    ])

    if total_discount > 0:
        lines.append(f"Discount: -RS {total_discount:.2f}")
    if tax_amount > 0:
        lines.append(f"Tax: RS {tax_amount:.2f}")
    if delivery_charges > 0:
        lines.append(f"Delivery: RS {delivery_charges:.2f}")

    lines.append(f"Current Bill: RS {total:.2f}")
    if abs(previous_balance) > 0.005:
        lines.append(f"Previous Balance: RS {previous_balance:.2f}")
        lines.append(f"Grand Total: RS {grand_total:.2f}")

    if refunded_amount > 0:
        lines.append(f"Refunded: -RS {refunded_amount:.2f}")
        lines.append(f"Net Total: RS {net_total:.2f}")

    lines.append(f"Amount Paid: RS {amount_paid:.2f}")
    if design["show_customer_balance"] and account_balance > 0:
        lines.append(f"Total Outstanding (Udhar): RS {account_balance:.2f}")

    if design["footer_message"]:
        lines.append(str(design["footer_message"]))
    return "\n".join(lines)


def _render_invoice_image(
    sale: Sale,
    file_path: Path,
    dpi: int = 300,
    refunded_amount: float = 0.0,
    document_title: str = "INVOICE",
    document_number: Optional[str] = None,
    layout_format: Literal["compact", "mobile"] = "compact",
    design_format: Literal["classic", "modern", "minimal"] = "classic",
) -> None:
    """Render an invoice image with consistent design across OSes."""
    from PIL import ImageDraw

    mm_to_px = dpi / 25.4

    def mm(mm_val: float) -> int:
        return int(mm_val * mm_to_px)

    design = _get_invoice_design()
    document_width_mm = 108 if layout_format == "mobile" else 80
    width = int(document_width_mm * mm_to_px)
    has_previous_balance = abs(float(getattr(sale, "previous_balance", 0.0) or 0.0)) > 0.005
    logo_extra_mm = 24 if design["logo_path"] else 0
    terms_extra_mm = min(30, len(str(design["terms"]).splitlines()) * 5)
    base_height_mm = 146 + logo_extra_mm + terms_extra_mm + (14 if refunded_amount > 0 else 0) + (12 if has_previous_balance else 0)
    base_height = int(base_height_mm * mm_to_px)
    item_height = len(sale.items) * int(22 * mm_to_px)
    total_height = base_height + item_height

    img = Image.new("RGB", (width, total_height), color="white")
    draw = ImageDraw.Draw(img)

    font_xl = _load_system_font(mm(5), bold=True)
    font_lg = _load_system_font(mm(4), bold=True)
    font_md = _load_system_font(mm(3.2), bold=False)
    font_sm = _load_system_font(mm(2.6), bold=False)
    font_sm_bold = _load_system_font(mm(2.6), bold=True)

    y = 0

    accent_color = {
        "classic": "black",
        "modern": "#173b57",
        "minimal": "#374151",
    }[design_format]
    rule_color = "#d1d5db" if design_format == "minimal" else accent_color

    store_name, store_address, store_phone = _get_store_details()

    logo_path = design["logo_path"]
    if isinstance(logo_path, Path):
        with Image.open(logo_path) as logo_source:
            logo = logo_source.convert("RGBA")
            logo.thumbnail((width - mm(20), mm(20)), Image.Resampling.LANCZOS)
            logo_x = (width - logo.width) // 2
            img.paste(logo, (logo_x, y), logo)
            y += logo.height + mm(3)

    # Header bar
    header_height = mm(10)
    header_color = "white" if design_format == "minimal" else accent_color
    draw.rectangle([(0, y), (width, y + header_height)], fill=header_color)
    bbox = draw.textbbox((0, 0), store_name, font=font_lg)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, y + mm(2)), store_name, fill="black" if design_format == "minimal" else "white", font=font_lg)
    if design_format == "minimal":
        draw.line([(mm(3), y + header_height), (width - mm(3), y + header_height)], fill=accent_color, width=max(1, mm(0.4)))
    y += header_height + mm(2)

    for line in [l for l in [store_address, store_phone] if l]:
        bbox = draw.textbbox((0, 0), line, font=font_sm)
        text_width = bbox[2] - bbox[0]
        draw.text(((width - text_width) // 2, y), line, fill="black", font=font_sm)
        y += mm(4)

    if design["show_tax_id"] and design["tax_id"]:
        tax_line = f"Tax ID / NTN: {design['tax_id']}"
        bbox = draw.textbbox((0, 0), tax_line, font=font_sm)
        draw.text(((width - (bbox[2] - bbox[0])) // 2, y), tax_line, fill="black", font=font_sm)
        y += mm(4)

    y += mm(2)
    draw.line([(mm(3), y), (width - mm(3), y)], fill=rule_color, width=1)
    y += mm(4)

    invoice_text = document_title
    bbox = draw.textbbox((0, 0), invoice_text, font=font_xl)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, y), invoice_text, fill=accent_color, font=font_xl)
    y += mm(7)

    invoice_num = document_number or f"#{str(sale.id).zfill(6)}"
    bbox = draw.textbbox((0, 0), invoice_num, font=font_md)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, y), invoice_num, fill="black", font=font_md)
    y += mm(5)

    # Convert UTC to Pakistan time for display
    pakistan_time = _convert_utc_to_pakistan(sale.created_at)
    date_text = pakistan_time.strftime("%Y-%m-%d %H:%M")
    bbox = draw.textbbox((0, 0), date_text, font=font_sm)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, y), date_text, fill="black", font=font_sm)
    y += mm(4)

    if design["show_cashier"]:
        cashier_text = f"Cashier: {sale.user.username if sale.user else 'N/A'}"
        bbox = draw.textbbox((0, 0), cashier_text, font=font_sm)
        text_width = bbox[2] - bbox[0]
        draw.text(((width - text_width) // 2, y), cashier_text, fill="black", font=font_sm)
        y += mm(5)

    draw.line([(mm(3), y), (width - mm(3), y)], fill=rule_color, width=1)
    y += mm(4)

    draw.text((mm(3), y), "CUSTOMER", fill=accent_color, font=font_sm_bold)
    y += mm(4)
    customer_name = sale.customer_name or "Walk-in Customer"
    draw.text((mm(3), y), customer_name[:40], fill="black", font=font_md)
    y += mm(6)

    draw.line([(mm(3), y), (width - mm(3), y)], fill=rule_color, width=1)
    y += mm(4)

    draw.text((mm(3), y), "ITEMS", fill=accent_color, font=font_sm_bold)
    y += mm(5)

    amounts = _get_invoice_amounts(sale)
    display_subtotal = amounts["display_subtotal"]
    total_discount = amounts["total_discount"]
    previous_balance = amounts["previous_balance"]
    grand_total = amounts["grand_total"]

    for item in sale.items:
        product_name = item.product.name if item.product else f"Product #{item.product_id}"
        draw.text((mm(3), y), product_name[:34], fill="black", font=font_md)
        y += mm(4)

        if item.variation:
            attrs = ", ".join([f"{k}: {v}" for k, v in item.variation.attributes.items()])
            draw.text((mm(4), y), attrs[:36], fill="#5c4dff", font=font_sm)
            y += mm(4)

        if design["show_sku"]:
            sku = (item.variation.sku if item.variation else None) or (item.product.sku if item.product else None)
            if sku:
                draw.text((mm(4), y), f"SKU: {sku}"[:48], fill="gray", font=font_sm)
                y += mm(4)

        qty_price = f"{item.quantity} {item.unit} x RS {item.unit_price:.2f}"
        draw.text((mm(4), y), qty_price, fill="black", font=font_sm)
        y += mm(4)

        original_price = item.unit_price * item.quantity
        if item.item_discount and item.item_discount > 0:
            original_text = f"RS {original_price:.2f}"
            bbox = draw.textbbox((0, 0), original_text, font=font_sm)
            text_width = bbox[2] - bbox[0]
            x_pos = width - text_width - mm(3)
            draw.text((x_pos, y), original_text, fill="gray", font=font_sm)
            draw.line([(x_pos, y + mm(1.6)), (x_pos + text_width, y + mm(1.6))], fill="gray", width=1)
            y += mm(4)

            discount_text = f"Discount: -RS {item.item_discount:.2f}"
            draw.text((mm(4), y), discount_text, fill="#cc0000", font=font_sm)
            y += mm(4)

        final_price = f"RS {item.total_price:.2f}"
        bbox = draw.textbbox((0, 0), final_price, font=font_sm_bold)
        text_width = bbox[2] - bbox[0]
        final_color = accent_color if design_format != "classic" else "#0a7d2c"
        draw.text((width - text_width - mm(3), y), final_price, fill=final_color, font=font_sm_bold)
        y += mm(6)

    y += mm(1)
    draw.line([(mm(3), y), (width - mm(3), y)], fill=rule_color, width=1)
    y += mm(4)

    draw.text((mm(3), y), "Subtotal", fill="black", font=font_md)
    subtotal_text = f"RS {display_subtotal:.2f}"
    bbox = draw.textbbox((0, 0), subtotal_text, font=font_md)
    text_width = bbox[2] - bbox[0]
    draw.text((width - text_width - mm(3), y), subtotal_text, fill="black", font=font_md)
    y += mm(5)

    if total_discount > 0:
        draw.text((mm(3), y), "Discount", fill="black", font=font_md)
        discount_text = f"-RS {total_discount:.2f}"
        bbox = draw.textbbox((0, 0), discount_text, font=font_md)
        text_width = bbox[2] - bbox[0]
        draw.text((width - text_width - mm(3), y), discount_text, fill="#cc0000", font=font_md)
        y += mm(5)

    if sale.tax > 0:
        draw.text((mm(3), y), "Tax", fill="black", font=font_md)
        tax_text = f"RS {sale.tax:.2f}"
        bbox = draw.textbbox((0, 0), tax_text, font=font_md)
        text_width = bbox[2] - bbox[0]
        draw.text((width - text_width - mm(3), y), tax_text, fill="black", font=font_md)
        y += mm(5)

    if sale.delivery_charges > 0:
        draw.text((mm(3), y), "Delivery", fill="black", font=font_md)
        delivery_text = f"RS {sale.delivery_charges:.2f}"
        bbox = draw.textbbox((0, 0), delivery_text, font=font_md)
        text_width = bbox[2] - bbox[0]
        draw.text((width - text_width - mm(3), y), delivery_text, fill="black", font=font_md)
        y += mm(5)

    draw.text((mm(3), y), "CURRENT BILL", fill=accent_color, font=font_lg)
    total_text = f"RS {sale.total:.2f}"
    bbox = draw.textbbox((0, 0), total_text, font=font_lg)
    text_width = bbox[2] - bbox[0]
    draw.text((width - text_width - mm(3), y), total_text, fill=accent_color, font=font_lg)
    y += mm(7)

    if abs(previous_balance) > 0.005:
        draw.text((mm(3), y), "Previous Balance", fill="black", font=font_md)
        previous_text = f"RS {previous_balance:.2f}"
        bbox = draw.textbbox((0, 0), previous_text, font=font_md)
        draw.text((width - (bbox[2] - bbox[0]) - mm(3), y), previous_text, fill="black", font=font_md)
        y += mm(5)

        draw.text((mm(3), y), "GRAND TOTAL", fill="black", font=font_lg)
        grand_total_text = f"RS {grand_total:.2f}"
        bbox = draw.textbbox((0, 0), grand_total_text, font=font_lg)
        draw.text((width - (bbox[2] - bbox[0]) - mm(3), y), grand_total_text, fill="black", font=font_lg)
        y += mm(7)

    if refunded_amount > 0:
        draw.text((mm(3), y), "Refunded", fill="#cc0000", font=font_md)
        refunded_text = f"-RS {refunded_amount:.2f}"
        bbox = draw.textbbox((0, 0), refunded_text, font=font_md)
        text_width = bbox[2] - bbox[0]
        draw.text((width - text_width - mm(3), y), refunded_text, fill="#cc0000", font=font_md)
        y += mm(5)

        draw.text((mm(3), y), "Net Total", fill="black", font=font_lg)
        net_total_text = f"RS {max(0.0, sale.total - refunded_amount):.2f}"
        bbox = draw.textbbox((0, 0), net_total_text, font=font_lg)
        text_width = bbox[2] - bbox[0]
        draw.text((width - text_width - mm(3), y), net_total_text, fill="black", font=font_lg)
        y += mm(7)

    draw.line([(mm(3), y), (width - mm(3), y)], fill=rule_color, width=1)
    y += mm(4)

    if document_title == "INVOICE":
        draw.text((mm(3), y), "Amount Paid", fill="black", font=font_md)
        paid_text = f"RS {sale.amount_paid:.2f}"
        bbox = draw.textbbox((0, 0), paid_text, font=font_md)
        text_width = bbox[2] - bbox[0]
        draw.text((width - text_width - mm(3), y), paid_text, fill="black", font=font_md)
        y += mm(5)

        account_balance = previous_balance + float(sale.amount_due or 0.0)
        if design["show_customer_balance"] and account_balance > 0:
            draw.text((mm(3), y), "Total Balance (Udhar)", fill="black", font=font_sm_bold)
            due_text = f"RS {account_balance:.2f}"
            bbox = draw.textbbox((0, 0), due_text, font=font_sm_bold)
            text_width = bbox[2] - bbox[0]
            draw.text((width - text_width - mm(3), y), due_text, fill="#cc0000", font=font_sm_bold)
            y += mm(5)

        if sale.change_amount > 0:
            draw.text((mm(3), y), "Change", fill="black", font=font_md)
            change_text = f"RS {sale.change_amount:.2f}"
            bbox = draw.textbbox((0, 0), change_text, font=font_md)
            text_width = bbox[2] - bbox[0]
            draw.text((width - text_width - mm(3), y), change_text, fill="#0a7d2c", font=font_md)
            y += mm(5)

        payment_text = f"Payment: {sale.payment_method}"
        draw.text((mm(3), y), payment_text, fill="black", font=font_sm)
        y += mm(7)

        status_text = "BALANCE DUE" if account_balance > 0 else "PAID"
        bbox = draw.textbbox((0, 0), status_text, font=font_lg)
        status_width = bbox[2] - bbox[0]
        if design_format == "modern":
            status_background = "#fff4e5" if account_balance > 0 else "#e6f6f2"
            status_foreground = "#a24b05" if account_balance > 0 else "#08765f"
            draw.rounded_rectangle(
                [(mm(3), y), (width - mm(3), y + mm(9))],
                radius=mm(2),
                fill=status_background,
            )
            draw.text((width - status_width - mm(6), y + mm(2)), status_text, fill=status_foreground, font=font_lg)
        elif design_format == "classic":
            draw.rectangle([(mm(3), y), (width - mm(3), y + mm(9))], fill="black")
            draw.text((width - status_width - mm(6), y + mm(2)), status_text, fill="white", font=font_lg)
        else:
            draw.line([(mm(3), y), (width - mm(3), y)], fill=rule_color, width=1)
            draw.text((width - status_width - mm(3), y + mm(2)), status_text, fill=accent_color, font=font_lg)
        y += mm(12)

    draw.line([(mm(3), y), (width - mm(3), y)], fill=rule_color, width=1)
    y += mm(4)

    footer_message = str(design["footer_message"] or "")
    if footer_message:
        bbox = draw.textbbox((0, 0), footer_message[:60], font=font_sm_bold)
        draw.text(((width - (bbox[2] - bbox[0])) // 2, y), footer_message[:60], fill="black", font=font_sm_bold)
        y += mm(5)

    for index, term in enumerate(str(design["terms"] or "").splitlines(), start=1):
        if term.strip():
            draw.text((mm(3), y), f"{index}. {term.strip()}"[:72], fill="black", font=font_sm)
            y += mm(4)

    footer_text = "VibePOS (by vibeexe.com)"
    bbox = draw.textbbox((0, 0), footer_text, font=font_sm)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, y), footer_text, fill="gray", font=font_sm)

    img = img.crop((0, 0, width, y + mm(10)))
    img.save(file_path, "PNG", quality=95)


def _render_invoice_pdf(
    sale: Sale,
    file_path: Path,
    refunded_amount: float = 0.0,
    design_format: Literal["classic", "modern", "minimal"] = "modern",
) -> None:
    """Render a paginated A4 invoice suitable for printing or WhatsApp documents."""
    design = _get_invoice_design()
    store_name, store_address, store_phone = _get_store_details()
    styles = getSampleStyleSheet()
    normal = styles["BodyText"]
    normal.fontSize = 9
    normal.leading = 12
    small = styles["BodyText"]
    accent = {
        "classic": colors.black,
        "modern": colors.HexColor("#0f5f78"),
        "minimal": colors.HexColor("#374151"),
    }[design_format]
    header_background = colors.white if design_format == "minimal" else accent
    header_text = colors.black if design_format == "minimal" else colors.white
    light_background = colors.white if design_format == "minimal" else colors.HexColor("#eef5f9")
    doc = SimpleDocTemplate(
        str(file_path),
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"Invoice {sale.id:06d}",
    )
    story = []

    brand_parts = []
    logo_path = design["logo_path"]
    if isinstance(logo_path, Path):
        logo = ReportLabImage(str(logo_path), width=34 * mm, height=20 * mm, kind="proportional")
        brand_parts.append(logo)
    store_lines = [f"<b>{escape(store_name)}</b>"]
    if store_address:
        store_lines.append(escape(store_address))
    if store_phone:
        store_lines.append(escape(store_phone))
    if design["show_tax_id"] and design["tax_id"]:
        store_lines.append(f"Tax ID / NTN: {escape(str(design['tax_id']))}")
    brand_parts.append(Paragraph("<br/>".join(store_lines), normal))

    invoice_meta = [
        "<b>INVOICE</b>",
        f"INV-{sale.id:06d}",
        _convert_utc_to_pakistan(sale.created_at).strftime("%d %b %Y, %I:%M %p"),
    ]
    if design["show_cashier"]:
        invoice_meta.append(f"Cashier: {escape(sale.user.username if sale.user else 'N/A')}")
    header = Table(
        [[brand_parts, Paragraph("<br/>".join(invoice_meta), normal)]],
        colWidths=[115 * mm, 55 * mm],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BOX", (0, 0), (-1, -1), 0.8 if design_format != "minimal" else 0, accent),
        ("LINEBELOW", (0, 0), (-1, -1), 0.8, accent),
        ("BACKGROUND", (1, 0), (1, 0), light_background),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([header, Spacer(1, 7 * mm)])

    customer_name = sale.customer_name or "Walk-in Customer"
    customer_phone = getattr(sale, "customer_phone", None) or ""
    account_balance = float(sale.previous_balance or 0) + float(sale.amount_due or 0)
    customer = Table([
        [Paragraph("<b>Bill to</b>", normal), Paragraph("<b>Payment</b>", normal)],
        [Paragraph(escape(customer_name), normal), Paragraph(escape(str(sale.payment_method).title()), normal)],
        [Paragraph(escape(customer_phone), normal), Paragraph(f"Status: {'Balance due' if account_balance > 0 else 'Paid'}", normal)],
    ], colWidths=[100 * mm, 70 * mm])
    customer.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#cad5dc")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([customer, Spacer(1, 6 * mm)])

    item_headers = ["#", "Description", "Qty", "Rate", "Discount", "Amount"]
    item_rows = [item_headers]
    for index, item in enumerate(sale.items, start=1):
        description = item.product.name if item.product else f"Product #{item.product_id}"
        if item.variation:
            description += " — " + ", ".join(str(value) for value in item.variation.attributes.values())
        if design["show_sku"]:
            sku = (item.variation.sku if item.variation else None) or (item.product.sku if item.product else None)
            if sku:
                description += f"\nSKU: {sku}"
        item_rows.append([
            str(index),
            Paragraph(escape(description).replace("\n", "<br/>"), normal),
            f"{item.quantity:g} {item.unit}",
            f"Rs {item.unit_price:,.2f}",
            f"Rs {float(item.item_discount or 0):,.2f}",
            f"Rs {item.total_price:,.2f}",
        ])
    items_table = Table(item_rows, repeatRows=1, colWidths=[9 * mm, 69 * mm, 24 * mm, 25 * mm, 22 * mm, 27 * mm])
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), header_background),
        ("TEXTCOLOR", (0, 0), (-1, 0), header_text),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cad5dc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.white if design_format == "minimal" else colors.HexColor("#f7fafb")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([items_table, Spacer(1, 6 * mm)])

    amounts = _get_invoice_amounts(sale)
    summary_rows = [
        ["Subtotal", f"Rs {amounts['display_subtotal']:,.2f}"],
        ["Discount", f"- Rs {amounts['total_discount']:,.2f}"],
        ["Tax / Other charges", f"Rs {amounts['tax_amount']:,.2f}"],
        ["Delivery", f"Rs {amounts['delivery_charges']:,.2f}"],
        ["Current Bill", f"Rs {amounts['total']:,.2f}"],
    ]
    if abs(amounts["previous_balance"]) > 0.005:
        summary_rows.extend([
            ["Previous Balance", f"Rs {amounts['previous_balance']:,.2f}"],
            ["Grand Total", f"Rs {amounts['grand_total']:,.2f}"],
        ])
    if refunded_amount > 0:
        summary_rows.append(["Refunded", f"- Rs {refunded_amount:,.2f}"])
    summary_rows.append(["Amount Paid", f"Rs {sale.amount_paid:,.2f}"])
    if design["show_customer_balance"]:
        summary_rows.append(["Total Balance", f"Rs {amounts['previous_balance'] + float(sale.amount_due or 0):,.2f}"])
    summary = Table(summary_rows, colWidths=[43 * mm, 37 * mm], hAlign="RIGHT")
    summary.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, -2), (-1, -2), 0.6, accent),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.extend([summary, Spacer(1, 5 * mm)])

    status_text = "BALANCE DUE" if account_balance > 0 else "PAID"
    if design_format == "modern":
        status_background = colors.HexColor("#fff4e5" if account_balance > 0 else "#e6f6f2")
        status_foreground = colors.HexColor("#a24b05" if account_balance > 0 else "#08765f")
    elif design_format == "classic":
        status_background = colors.black
        status_foreground = colors.white
    else:
        status_background = colors.white
        status_foreground = colors.HexColor("#374151")
    status = Table([[status_text]], colWidths=[80 * mm], hAlign="RIGHT")
    status.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), status_background),
        ("TEXTCOLOR", (0, 0), (-1, -1), status_foreground),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 13),
        ("LINEABOVE", (0, 0), (-1, 0), 0.8 if design_format == "minimal" else 0, accent),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([status, Spacer(1, 8 * mm)])

    if design["footer_message"]:
        story.append(Paragraph(f"<b>{escape(str(design['footer_message']))}</b>", styles["Heading3"]))
    terms = [line.strip() for line in str(design["terms"] or "").splitlines() if line.strip()]
    if terms:
        story.append(Paragraph("<b>Terms</b>", normal))
        for index, term in enumerate(terms, start=1):
            story.append(Paragraph(f"{index}. {escape(term)}", small))
    story.extend([Spacer(1, 4 * mm), Paragraph("VibePOS (by vibeexe.com)", small)])
    doc.build(story)


def parse_json_field(value):
    """Parse JSON string field to Python object"""
    if isinstance(value, str):
        try:
            return json.loads(value) if value else []
        except:
            return []
    return value or []


def normalize_phone_number(phone: Optional[str]) -> Optional[str]:
    """
    Normalize phone number to format: 923171585452
    Accepts: 03171585452, +923171585452, 3171585452
    Returns: 923171585452 or None
    """
    if not phone:
        return None
    
    # Remove all non-digit characters
    phone = re.sub(r'\D', '', phone)
    
    # Handle different formats
    if phone.startswith('0'):  # 03171585452 -> 923171585452
        phone = '92' + phone[1:]
    elif len(phone) == 10:  # 3171585452 -> 923171585452
        phone = '92' + phone
    # else: already in correct format (923171585452) or with +92 prefix (will be cleaned above)
    
    return phone if phone else None


def is_effectively_integer(value: float) -> bool:
    return abs(value - round(value)) < 1e-9


def validate_item_quantity_rules(product: Product, quantity: float) -> None:
    if quantity <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"Quantity must be greater than 0 for product {product.name}",
        )

    if not getattr(product, "allow_decimal_qty", False) and not is_effectively_integer(quantity):
        raise HTTPException(
            status_code=400,
            detail=f"Decimal quantity is not allowed for product {product.name}",
        )


def get_quantity_in_base_units(product: Product, unit: str, quantity: float) -> float:
    quantity_in_base_units = float(quantity)
    if unit != product.base_unit:
        selling_units = parse_json_field(product.selling_units)
        selling_unit = None
        for su in selling_units:
            if su.get('unit') == unit:
                selling_unit = su
                break

        if not selling_unit:
            raise HTTPException(
                status_code=400,
                detail=f"Unit '{unit}' not configured for product {product.name}"
            )

        quantity_in_base_units = quantity * float(selling_unit['conversion'])

    return quantity_in_base_units


def resolve_sale_customer(db: Session, sale_in: SaleCreate):
    normalized_phone = normalize_phone_number(sale_in.customer_phone)

    customer_ref_id = None
    is_walkin = True
    customer = None

    if sale_in.customer_ref_id:
        customer = db.query(Customer).filter(Customer.id == sale_in.customer_ref_id).first()
        if customer:
            customer_ref_id = customer.id
            is_walkin = False
    elif sale_in.customer_id:
        customer = db.query(Customer).filter(
            Customer.customer_id == sale_in.customer_id.strip().upper()
        ).first()
        if customer:
            customer_ref_id = customer.id
            is_walkin = False
    elif normalized_phone:
        customer = db.query(Customer).filter(Customer.phone == normalized_phone).first()

        if not customer:
            # If phone doesn't match but name uniquely matches an existing customer,
            # link to that record to keep sale and ledger tied to the same customer.
            if sale_in.customer_name and sale_in.customer_name.strip():
                exact_name = sale_in.customer_name.strip().lower()
                name_matches = db.query(Customer).filter(
                    func.lower(Customer.name) == exact_name
                ).all()
                if len(name_matches) == 1:
                    customer = name_matches[0]

        if not customer:
            last_customer = db.query(Customer).filter(
                Customer.customer_id.like("CUST%")
            ).order_by(Customer.id.desc()).first()

            if last_customer and last_customer.customer_id:
                try:
                    last_num = int(last_customer.customer_id.replace("CUST", ""))
                    new_num = last_num + 1
                except ValueError:
                    new_num = 1
            else:
                new_num = 1

            new_customer_id = f"CUST{new_num:04d}"

            customer = Customer(
                customer_id=new_customer_id,
                phone=normalized_phone,
                name=sale_in.customer_name,
                member_since=now_pkt(),
            )
            db.add(customer)
            db.flush()

        customer_ref_id = customer.id
        is_walkin = False
    elif sale_in.customer_name and sale_in.customer_name.strip():
        # Fallback for named customers entered without phone/id.
        exact_name = sale_in.customer_name.strip().lower()
        name_matches = db.query(Customer).filter(
            func.lower(Customer.name) == exact_name
        ).all()
        if len(name_matches) == 1:
            customer = name_matches[0]
            customer_ref_id = customer.id
            is_walkin = False

    return customer, customer_ref_id, is_walkin, normalized_phone


def generate_and_send_invoice(sale_id: int, phone_number: str):
    """
    Background task to generate invoice image and send via WhatsApp
    """
    from app.db.session import SessionLocal
    
    # Create new DB session for background task
    db = SessionLocal()
    
    try:
        # Get the sale with all relationships eagerly loaded
        sale = db.query(Sale).options(
            joinedload(Sale.items).joinedload(SaleItem.product),
            joinedload(Sale.items).joinedload(SaleItem.variation)
        ).filter(Sale.id == sale_id).first()
        if not sale:
            print(f"Sale {sale_id} not found")
            return
        refunded_amount = float(
            db.query(func.coalesce(func.sum(PosReturn.refund_amount), 0.0))
            .filter(PosReturn.sale_id == sale_id)
            .scalar()
            or 0.0
        )

        invoice_preferences = _get_invoice_design()
        invoice_format = str(invoice_preferences["default_whatsapp_format"])
        invoice_design = str(invoice_preferences["default_whatsapp_design"])
        timestamp = now_pkt().strftime("%Y%m%d_%H%M%S")
        is_pdf = invoice_format == "professional"
        filename = f"invoice_{timestamp}.{'pdf' if is_pdf else 'png'}"
        file_path = INVOICE_DIR / filename
        if is_pdf:
            _render_invoice_pdf(
                sale,
                file_path,
                refunded_amount=refunded_amount,
                design_format=invoice_design,
            )
        else:
            _render_invoice_image(
                sale,
                file_path,
                dpi=300,
                refunded_amount=refunded_amount,
                layout_format="mobile" if invoice_format == "mobile" else "compact",
                design_format=invoice_design,
            )
        
        # Send to WhatsApp
        whatsapp_url = f"http://127.0.0.1:8000/api/v1/whatsapp/send-{'document' if is_pdf else 'image'}"
        payload = {"phone_number": phone_number, "caption": _build_whatsapp_invoice_caption(sale, refunded_amount=refunded_amount)}
        if is_pdf:
            payload.update({"document_url": str(file_path.absolute()), "filename": filename})
        else:
            payload["image_url"] = str(file_path.absolute())
        
        response = requests.post(
            whatsapp_url,
            json=payload,
            headers={"accept": "application/json", "Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code == 200:
            print(f"Invoice sent successfully for sale {sale_id}")
        else:
            print(f"Failed to send invoice for sale {sale_id}: {response.text}")
        
    except Exception as e:
        print(f"Failed to send invoice for sale {sale_id}: {str(e)}")
    finally:
        db.close()


@router.post("/", response_model=SaleSchema)
def create_sale(
    sale_in: SaleCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Create a new sale with inventory deduction.
    Validates stock availability and updates product/variation quantities atomically.
    Supports unit conversions (dozen → pieces, kg, etc.)
    """
    # Validate that we have items
    if not sale_in.items or len(sale_in.items) == 0:
        raise HTTPException(status_code=400, detail="Sale must have at least one item")
    
    # Validate products, variations, and units
    products_dict = {}
    variations_dict = {}
    
    for item in sale_in.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(
                status_code=404, 
                detail=f"Product with id {item.product_id} not found"
            )
        
        products_dict[item.product_id] = product
        validate_item_quantity_rules(product, item.quantity)
        
        # Check if variation is specified
        if item.variation_id:
            if not product.has_variations:
                raise HTTPException(
                    status_code=400,
                    detail=f"Product {product.name} does not support variations"
                )
            
            variation = db.query(ProductVariation).filter(
                ProductVariation.id == item.variation_id,
                ProductVariation.product_id == item.product_id
            ).first()
            
            if not variation:
                raise HTTPException(
                    status_code=404,
                    detail=f"Variation with id {item.variation_id} not found for product {product.name}"
                )
            
            variations_dict[item.variation_id] = variation
        
        # Validate unit and calculate quantity in base units
        unit = item.unit
        unit_price = product.selling_price
        quantity_in_base_units = item.quantity
        
        if unit != product.base_unit:
            # Find the selling unit configuration
            selling_units = parse_json_field(product.selling_units)
            selling_unit = None
            for su in selling_units:
                if su.get('unit') == unit:
                    selling_unit = su
                    break
            
            if not selling_unit:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unit '{unit}' not configured for product {product.name}"
                )
            
            # Convert to base units for stock check
            quantity_in_base_units = item.quantity * float(selling_unit['conversion'])
            unit_price = selling_unit['price']
        
        # # Check stock availability
        # if item.variation_id:
        #     variation = variations_dict[item.variation_id]
        #     if variation.quantity < quantity_in_base_units:
        #         raise HTTPException(
        #             status_code=400,
        #             detail=f"Insufficient stock for {product.name} (variation). Available: {variation.quantity}, Requested: {quantity_in_base_units} {product.base_unit}"
        #         )
        # else:
        #     if product.quantity < quantity_in_base_units:
        #         raise HTTPException(
        #             status_code=400,
        #             detail=f"Insufficient stock for {product.name}. Available: {product.quantity}, Requested: {quantity_in_base_units} {product.base_unit}"
        #         )
    
    # Calculate totals
    subtotal = 0.0
    for item in sale_in.items:
        product = products_dict[item.product_id]
        
        # Determine price
        if item.variation_id:
            variation = variations_dict[item.variation_id]
            base_price = product.selling_price + variation.price_adjustment
        else:
            base_price = product.selling_price
        
        # Get unit price (allow override)
        if item.unit_price is not None:
            unit_price = item.unit_price
        else:
            unit_price = base_price
            if item.unit != product.base_unit:
                selling_units = parse_json_field(product.selling_units)
                for su in selling_units:
                    if su.get('unit') == item.unit:
                        unit_price = su['price']
                        break
        
        item_discount = item.item_discount if item.item_discount is not None else 0.0
        item_total = (unit_price * item.quantity) - item_discount
        subtotal += item_total
    
    # Apply discount if provided
    discount = sale_in.discount if sale_in.discount is not None else 0.0
    
    # Calculate tax if provided
    tax = sale_in.tax if sale_in.tax is not None else 0.0
    
    # Calculate delivery charges if provided
    delivery_charges = sale_in.delivery_charges if sale_in.delivery_charges is not None else 0.0
    
    # Calculate final total
    total = subtotal - discount + tax + delivery_charges
    
    # Calculate payment tracking
    amount_paid = sale_in.amount_paid if sale_in.amount_paid is not None else total
    amount_due = max(0, total - amount_paid)
    change_amount = max(0, amount_paid - total)
    
    customer, customer_ref_id, is_walkin, normalized_phone = resolve_sale_customer(db, sale_in)
    if customer and customer_ref_id:
        customer.outstanding_balance = accounting_service.get_customer_balance(
            db,
            customer.id,
            customer.opening_balance or 0.0,
        )

    previous_balance = float(customer.outstanding_balance or 0.0) if customer else 0.0

    # Enforce credit limit
    if customer and amount_due > 0:
        credit_limit = customer.credit_limit
        if credit_limit is not None and (customer.outstanding_balance + amount_due) > credit_limit:
            available = max(0, credit_limit - customer.outstanding_balance)
            raise HTTPException(
                status_code=400,
                detail=f"Credit limit exceeded. Limit: {credit_limit:.2f}, Current: {customer.outstanding_balance:.2f}, Available: {available:.2f}"
            )

    # Create sale record
    db_sale = Sale(
        user_id=current_user.id,
        customer_ref_id=customer_ref_id,
        is_walkin=is_walkin,
        customer_name=sale_in.customer_name or (customer.name if customer else None),
        customer_phone=normalized_phone,
        payment_method=sale_in.payment_method,
        subtotal=subtotal,
        discount=discount,
        tax=tax,
        delivery_charges=delivery_charges,
        total=total,
        previous_balance=previous_balance,
        amount_paid=amount_paid,
        amount_due=amount_due,
        change_amount=change_amount
    )
    db.add(db_sale)
    db.flush()  # Get the sale ID
    
    # Create sale items and deduct inventory
    for item in sale_in.items:
        product = products_dict[item.product_id]
        
        # Determine price
        if item.variation_id:
            variation = variations_dict[item.variation_id]
            base_price = product.selling_price + variation.price_adjustment
        else:
            base_price = product.selling_price
        
        # Get unit price (allow override)
        unit_price = item.unit_price if item.unit_price is not None else base_price
        quantity_in_base_units = item.quantity

        if item.unit != product.base_unit:
            selling_units = parse_json_field(product.selling_units)
            for su in selling_units:
                if su.get('unit') == item.unit:
                    if item.unit_price is None:
                        unit_price = su['price']
                    quantity_in_base_units = item.quantity * su['conversion']
                    break
        
        # Create sale item
        item_discount = item.item_discount if item.item_discount is not None else 0.0
        db_sale_item = SaleItem(
            sale_id=db_sale.id,
            product_id=item.product_id,
            variation_id=item.variation_id,
            quantity=item.quantity,
            unit=item.unit,
            unit_price=unit_price,
            item_discount=item_discount,
            total_price=(unit_price * item.quantity) - item_discount
        )
        db.add(db_sale_item)

        # Deduct from inventory (always in base units) — FIFO batch deduction
        if item.variation_id:
            variation = variations_dict[item.variation_id]
            variation.quantity -= quantity_in_base_units
            batch_id = _deduct_from_batches_fifo(db, item.product_id, item.variation_id, quantity_in_base_units)
        else:
            product.quantity -= quantity_in_base_units
            batch_id = _deduct_from_batches_fifo(db, item.product_id, None, quantity_in_base_units)

        if batch_id:
            db_sale_item.batch_id = batch_id
            db.add(db_sale_item)
    
    # Update customer statistics if linked
    if customer and customer_ref_id:
        customer.total_purchases += 1
        customer.total_spent += total

        # Add remaining amount due to outstanding balance (udhar)
        if db_sale.amount_due > 0:
            customer.outstanding_balance += db_sale.amount_due
            
        customer.updated_at = now_pkt()
        db.add(customer)
    
    # Commit transaction
    try:
        accounting_service.post_sale_entry(
            db=db,
            sale=db_sale,
            payment_method=sale_in.payment_method,
            created_by=current_user.id,
        )
        db.commit()
        db.refresh(db_sale)
        
        # Auto-send invoice in background if phone number provided
        if normalized_phone:
            background_tasks.add_task(generate_and_send_invoice, db_sale.id, normalized_phone)
        
        return db_sale
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create sale: {str(e)}")


@router.put("/{id}", response_model=SaleSchema)
def update_sale(
    id: int,
    sale_in: SaleUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    sale = db.query(Sale).filter(Sale.id == id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    has_returns = db.query(PosReturn.id).filter(PosReturn.sale_id == id).first()
    if has_returns:
        raise HTTPException(
            status_code=400,
            detail="Cannot edit sale that has returns. Please handle via returns workflow.",
        )

    old_total = sale.total or 0.0
    old_due = sale.amount_due or 0.0
    old_customer_id = sale.customer_ref_id

    old_items = list(sale.items)

    for old_item in old_items:
        product = db.query(Product).filter(Product.id == old_item.product_id).first()
        if not product:
            continue
        qty_base = get_quantity_in_base_units(product, old_item.unit, old_item.quantity)
        if old_item.variation_id:
            variation = db.query(ProductVariation).filter(ProductVariation.id == old_item.variation_id).first()
            if variation:
                variation.quantity += qty_base
                db.add(variation)
        else:
            product.quantity += qty_base
            db.add(product)

    for old_item in old_items:
        db.delete(old_item)

    if old_customer_id:
        old_customer = db.query(Customer).filter(Customer.id == old_customer_id).first()
        if old_customer:
            old_customer.outstanding_balance = accounting_service.get_customer_balance(
                db,
                old_customer.id,
                old_customer.opening_balance or 0.0,
            )
            old_customer.total_purchases = max(0, (old_customer.total_purchases or 0) - 1)
            old_customer.total_spent = max(0.0, (old_customer.total_spent or 0.0) - old_total)
            old_customer.outstanding_balance = (old_customer.outstanding_balance or 0.0) - old_due
            old_customer.updated_at = now_pkt()
            db.add(old_customer)

    old_entries = db.query(JournalEntry).filter(
        JournalEntry.source_type == "sale",
        JournalEntry.source_id == sale.id,
    ).all()
    for entry in old_entries:
        db.delete(entry)
    db.flush()

    products_dict: Dict[int, Product] = {}
    variations_dict: Dict[int, ProductVariation] = {}

    for item in sale_in.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product with id {item.product_id} not found")
        products_dict[item.product_id] = product
        validate_item_quantity_rules(product, item.quantity)

        if item.variation_id:
            if not product.has_variations:
                raise HTTPException(status_code=400, detail=f"Product {product.name} does not support variations")

            variation = db.query(ProductVariation).filter(
                ProductVariation.id == item.variation_id,
                ProductVariation.product_id == item.product_id,
            ).first()
            if not variation:
                raise HTTPException(
                    status_code=404,
                    detail=f"Variation with id {item.variation_id} not found for product {product.name}",
                )
            variations_dict[item.variation_id] = variation

        get_quantity_in_base_units(product, item.unit, item.quantity)

    subtotal = 0.0
    for item in sale_in.items:
        product = products_dict[item.product_id]
        if item.variation_id:
            variation = variations_dict[item.variation_id]
            base_price = product.selling_price + variation.price_adjustment
        else:
            base_price = product.selling_price

        if item.unit_price is not None:
            unit_price = item.unit_price
        else:
            unit_price = base_price
            if item.unit != product.base_unit:
                selling_units = parse_json_field(product.selling_units)
                for su in selling_units:
                    if su.get('unit') == item.unit:
                        unit_price = su['price']
                        break

        item_discount = item.item_discount if item.item_discount is not None else 0.0
        subtotal += (unit_price * item.quantity) - item_discount

    discount = sale_in.discount if sale_in.discount is not None else 0.0
    tax = sale_in.tax if sale_in.tax is not None else 0.0
    delivery_charges = sale_in.delivery_charges if sale_in.delivery_charges is not None else 0.0
    total = subtotal - discount + tax + delivery_charges
    amount_paid = sale_in.amount_paid if sale_in.amount_paid is not None else total
    amount_due = max(0, total - amount_paid)
    change_amount = max(0, amount_paid - total)

    customer, customer_ref_id, is_walkin, normalized_phone = resolve_sale_customer(db, sale_in)
    if customer and customer_ref_id:
        customer.outstanding_balance = accounting_service.get_customer_balance(
            db,
            customer.id,
            customer.opening_balance or 0.0,
        )
        sale.previous_balance = float(customer.outstanding_balance or 0.0)
    else:
        sale.previous_balance = 0.0

    # Enforce credit limit (account for balance reduction from old due on this sale)
    if customer and amount_due > 0:
        credit_limit = customer.credit_limit
        if credit_limit is not None:
            old_due = sale.amount_due or 0.0
            projected_balance = customer.outstanding_balance + amount_due
            if projected_balance > credit_limit:
                available = max(0, credit_limit - customer.outstanding_balance)
                raise HTTPException(
                    status_code=400,
                    detail=f"Credit limit exceeded. Limit: {credit_limit:.2f}, Available credit: {available:.2f}"
                )

    sale.customer_ref_id = customer_ref_id
    sale.is_walkin = is_walkin
    sale.customer_name = sale_in.customer_name or (customer.name if customer else None)
    sale.customer_phone = normalized_phone
    sale.payment_method = sale_in.payment_method
    sale.subtotal = subtotal
    sale.discount = discount
    sale.tax = tax
    sale.delivery_charges = delivery_charges
    sale.total = total
    sale.amount_paid = amount_paid
    sale.amount_due = amount_due
    sale.change_amount = change_amount

    for item in sale_in.items:
        product = products_dict[item.product_id]

        if item.variation_id:
            variation = variations_dict[item.variation_id]
            base_price = product.selling_price + variation.price_adjustment
        else:
            base_price = product.selling_price

        unit_price = item.unit_price if item.unit_price is not None else base_price
        quantity_in_base_units = get_quantity_in_base_units(product, item.unit, item.quantity)

        if item.unit != product.base_unit and item.unit_price is None:
            selling_units = parse_json_field(product.selling_units)
            for su in selling_units:
                if su.get('unit') == item.unit:
                    unit_price = su['price']
                    break

        item_discount = item.item_discount if item.item_discount is not None else 0.0
        db_sale_item = SaleItem(
            sale_id=sale.id,
            product_id=item.product_id,
            variation_id=item.variation_id,
            quantity=item.quantity,
            unit=item.unit,
            unit_price=unit_price,
            item_discount=item_discount,
            total_price=(unit_price * item.quantity) - item_discount,
        )
        db.add(db_sale_item)

        if item.variation_id:
            variation = variations_dict[item.variation_id]
            variation.quantity -= quantity_in_base_units
            db.add(variation)
            batch_id = _deduct_from_batches_fifo(db, item.product_id, item.variation_id, quantity_in_base_units)
        else:
            product.quantity -= quantity_in_base_units
            db.add(product)
            batch_id = _deduct_from_batches_fifo(db, item.product_id, None, quantity_in_base_units)

        if batch_id:
            db_sale_item.batch_id = batch_id
            db.add(db_sale_item)

    if customer and customer_ref_id:
        customer.total_purchases += 1
        customer.total_spent += total
        if amount_due > 0:
            customer.outstanding_balance += amount_due
        customer.updated_at = now_pkt()
        db.add(customer)

    try:
        accounting_service.post_sale_entry(
            db=db,
            sale=sale,
            payment_method=sale.payment_method,
            created_by=current_user.id,
        )
        db.commit()
        db.refresh(sale)
        return sale
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update sale: {str(e)}")


@router.get("/", response_model=List[SaleSchema])
def list_sales(
    skip: int = 0,
    limit: int = 100,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get list of sales with optional filters.
    Cashiers see only their own sales, admins see all sales.
    Search supports: customer name, phone number (in any format)
    """
    query = db.query(Sale).options(
        joinedload(Sale.items).joinedload(SaleItem.product),
        joinedload(Sale.items).joinedload(SaleItem.variation)
    )
    
    # Cashiers can only see their own sales
    if current_user.role == UserRole.CASHIER:
        query = query.filter(Sale.user_id == current_user.id)
    elif user_id is not None:
        # Admins can filter by specific user
        query = query.filter(Sale.user_id == user_id)
    
    # Date filters
    if start_date:
        query = query.filter(func.date(Sale.created_at) >= start_date)
    if end_date:
        query = query.filter(func.date(Sale.created_at) <= end_date)
    
    # Search filter (customer name, phone, or sale id)
    if search:
        conditions = []

        # Normalize phone if search looks like a phone number
        normalized_search = normalize_phone_number(search)
        if normalized_search:
            conditions.append(Sale.customer_phone == normalized_search)

        # Search by sale ID if numeric
        if search.strip().isdigit():
            conditions.append(Sale.id == int(search.strip()))

        # Search by customer name (case-insensitive)
        conditions.append(Sale.customer_name.ilike(f"%{search}%"))

        query = query.filter(or_(*conditions))
    
    # Order by most recent first
    query = query.order_by(Sale.created_at.desc())
    
    sales = query.offset(skip).limit(limit).all()
    return sales


@router.get("/stats/today", response_model=SaleStats)
def get_today_stats(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get sales statistics for today.
    Cashiers see only their stats, admins see all stats.
    """
    today = date.today()
    
    query = db.query(Sale).filter(func.date(Sale.created_at) == today)
    
    # Cashiers see only their own stats
    if current_user.role == UserRole.CASHIER:
        query = query.filter(Sale.user_id == current_user.id)
    
    sales = query.all()
    
    total_sales = len(sales)
    total_revenue = sum(sale.total for sale in sales)
    
    # Calculate average sale
    average_sale = total_revenue / total_sales if total_sales > 0 else 0.0
    
    return SaleStats(
        total_sales=total_sales,
        total_revenue=total_revenue,
        average_sale=average_sale
    )


@router.get("/{id}", response_model=SaleSchema)
def get_sale(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get a specific sale by ID.
    Cashiers can only access their own sales.
    """
    sale = db.query(Sale).options(
        joinedload(Sale.items).joinedload(SaleItem.product),
        joinedload(Sale.items).joinedload(SaleItem.variation)
    ).filter(Sale.id == id).first()
    
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    # All authenticated users can view any sale (removed cashier restriction)
    
    return sale


@router.post("/send-quotation")
def send_quotation(
    quotation_in: QuotationSendRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Render and queue a quotation image without creating a sale or changing stock."""
    normalized_phone = normalize_phone_number(quotation_in.phone_number)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    if not quotation_in.items:
        raise HTTPException(status_code=400, detail="Quotation must have at least one item")

    rendered_items = []
    subtotal = 0.0
    for item_in in quotation_in.items:
        product = db.query(Product).filter(Product.id == item_in.product_id).first()
        if not product:
            raise HTTPException(status_code=400, detail=f"Product {item_in.product_id} not found")

        variation = None
        if item_in.variation_id:
            variation = db.query(ProductVariation).filter(
                ProductVariation.id == item_in.variation_id,
                ProductVariation.product_id == product.id,
            ).first()
            if not variation:
                raise HTTPException(status_code=400, detail="Invalid product variation")

        unit_price = item_in.unit_price
        if unit_price is None:
            unit_price = float(product.selling_price or 0.0)
            if variation:
                unit_price += float(variation.price_adjustment or 0.0)
            if item_in.unit != product.base_unit:
                selling_unit = next(
                    (entry for entry in (product.selling_units or []) if entry.get("unit") == item_in.unit),
                    None,
                )
                if selling_unit:
                    unit_price = float(selling_unit.get("price") or unit_price)

        line_total = max(0.0, unit_price * item_in.quantity - item_in.item_discount)
        subtotal += line_total
        rendered_items.append(SimpleNamespace(
            product_id=product.id,
            product=product,
            variation=variation,
            quantity=item_in.quantity,
            unit=item_in.unit,
            unit_price=unit_price,
            item_discount=item_in.item_discount,
            total_price=line_total,
        ))

    total = max(0.0, subtotal - quotation_in.discount + quotation_in.tax + quotation_in.delivery_charges)
    quotation = SimpleNamespace(
        id=0,
        document_number=f"Q-{now_pkt().strftime('%Y%m%d-%H%M%S')}",
        user=current_user,
        created_at=now_pkt(),
        customer_name=quotation_in.customer_name,
        items=rendered_items,
        subtotal=subtotal,
        discount=quotation_in.discount,
        tax=quotation_in.tax,
        delivery_charges=quotation_in.delivery_charges,
        total=total,
        previous_balance=0.0,
        amount_paid=0.0,
        amount_due=0.0,
        change_amount=0.0,
        payment_method="quotation",
    )

    try:
        timestamp = now_pkt().strftime("%Y%m%d_%H%M%S")
        file_path = INVOICE_DIR / f"quotation_{timestamp}.png"
        _render_invoice_image(
            quotation,
            file_path,
            dpi=300,
            document_title="QUOTATION",
            document_number=quotation.document_number,
        )
        response = requests.post(
            "http://127.0.0.1:8000/api/v1/whatsapp/send-image",
            json={
                "phone_number": normalized_phone,
                "image_url": str(file_path.absolute()),
                "caption": f"Quotation {quotation.document_number} from {_get_store_details()[0]} - RS {total:.2f}",
            },
            headers={"accept": "application/json", "Content-Type": "application/json"},
            timeout=30,
        )
        if response.status_code != 200:
            raise RuntimeError(f"WhatsApp API error: {response.text}")
        return {
            "status": "success",
            "message": "Quotation image queued successfully",
            "phone_number": normalized_phone,
            "quotation_number": quotation.document_number,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send quotation: {exc}")


@router.post("/{id}/send-invoice")
def send_invoice(
    id: int,
    phone_number: str,
    invoice_format: Optional[Literal["compact", "professional", "mobile"]] = None,
    invoice_design: Optional[Literal["classic", "modern", "minimal"]] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Generate the selected invoice format and send it through WhatsApp.
    """
    # Get the sale with product/variation relationships loaded
    sale = db.query(Sale).options(
        joinedload(Sale.items).joinedload(SaleItem.product),
        joinedload(Sale.items).joinedload(SaleItem.variation)
    ).filter(Sale.id == id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    # Cashiers can only send invoices for their own sales
    if current_user.role == UserRole.CASHIER and sale.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Normalize phone number
    normalized_phone = normalize_phone_number(phone_number)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    
    try:
        invoice_preferences = _get_invoice_design()
        selected_format = invoice_format or str(invoice_preferences["default_whatsapp_format"])
        selected_design = invoice_design or str(invoice_preferences["default_whatsapp_design"])
        refunded_amount = float(
            db.query(func.coalesce(func.sum(PosReturn.refund_amount), 0.0))
            .filter(PosReturn.sale_id == id)
            .scalar()
            or 0.0
        )

        timestamp = now_pkt().strftime("%Y%m%d_%H%M%S")
        is_pdf = selected_format == "professional"
        filename = f"invoice_{timestamp}.{'pdf' if is_pdf else 'png'}"
        file_path = INVOICE_DIR / filename
        if is_pdf:
            _render_invoice_pdf(
                sale,
                file_path,
                refunded_amount=refunded_amount,
                design_format=selected_design,
            )
        else:
            _render_invoice_image(
                sale,
                file_path,
                dpi=300,
                refunded_amount=refunded_amount,
                layout_format="mobile" if selected_format == "mobile" else "compact",
                design_format=selected_design,
            )
        
        # Send to WhatsApp API
        whatsapp_url = f"http://127.0.0.1:8000/api/v1/whatsapp/send-{'document' if is_pdf else 'image'}"
        payload = {"phone_number": normalized_phone, "caption": _build_whatsapp_invoice_caption(sale, refunded_amount=refunded_amount)}
        if is_pdf:
            payload.update({"document_url": str(file_path.absolute()), "filename": filename})
        else:
            payload["image_url"] = str(file_path.absolute())
        
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
            "message": "Invoice sent successfully",
            "phone_number": normalized_phone,
            "file_path": str(file_path.absolute()),
            "invoice_format": selected_format,
            "invoice_design": selected_design,
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send invoice: {str(e)}")
