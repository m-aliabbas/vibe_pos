from typing import Dict, List, Optional
import os
import re
import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from datetime import datetime, date, timezone, timedelta
from app.core.timezone import now_pkt
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image
import io
import requests

from app.api import deps
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
    }


def _build_whatsapp_invoice_caption(sale: Sale, refunded_amount: float = 0.0) -> str:
    """Build a WhatsApp caption using the same monetary values shown on the invoice image."""
    amounts = _get_invoice_amounts(sale)
    subtotal = amounts["display_subtotal"]
    total_discount = amounts["total_discount"]
    tax_amount = amounts["tax_amount"]
    delivery_charges = amounts["delivery_charges"]
    total = amounts["total"]
    amount_paid = float(sale.amount_paid or 0.0)
    amount_due = float(sale.amount_due or 0.0)
    net_total = max(0.0, total - float(refunded_amount or 0.0))

    lines = [
        f"Invoice #{str(sale.id).zfill(6)}",
        f"Date/Time (GMT+5): {_convert_utc_to_pakistan(sale.created_at).strftime('%Y-%m-%d %H:%M')}",
        f"Cashier: {sale.user.username if sale.user else 'N/A'}",
        f"Customer: {sale.customer_name or 'Walk-in Customer'}",
        "",
        f"Subtotal: RS {subtotal:.2f}",
    ]

    if total_discount > 0:
        lines.append(f"Discount: -RS {total_discount:.2f}")
    if tax_amount > 0:
        lines.append(f"Tax: RS {tax_amount:.2f}")
    if delivery_charges > 0:
        lines.append(f"Delivery: RS {delivery_charges:.2f}")

    lines.append(f"Total: RS {total:.2f}")

    if refunded_amount > 0:
        lines.append(f"Refunded: -RS {refunded_amount:.2f}")
        lines.append(f"Net Total: RS {net_total:.2f}")

    lines.append(f"Amount Paid: RS {amount_paid:.2f}")
    if amount_due > 0:
        lines.append(f"Outstanding (Udhar): RS {amount_due:.2f}")

    lines.append("Thank you for your business!")
    return "\n".join(lines)


def _render_invoice_image(sale: Sale, file_path: Path, dpi: int = 300, refunded_amount: float = 0.0) -> None:
    """Render an invoice image with consistent design across OSes."""
    from PIL import ImageDraw

    mm_to_px = dpi / 25.4

    def mm(mm_val: float) -> int:
        return int(mm_val * mm_to_px)

    # 80mm thermal receipt width
    width = int(80 * mm_to_px)
    base_height_mm = 135 + (14 if refunded_amount > 0 else 0)
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

    store_name, store_address, store_phone = _get_store_details()

    # Header bar
    header_height = mm(10)
    draw.rectangle([(0, y), (width, y + header_height)], fill="black")
    bbox = draw.textbbox((0, 0), store_name, font=font_lg)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, y + mm(2)), store_name, fill="white", font=font_lg)
    y += header_height + mm(2)

    for line in [l for l in [store_address, store_phone] if l]:
        bbox = draw.textbbox((0, 0), line, font=font_sm)
        text_width = bbox[2] - bbox[0]
        draw.text(((width - text_width) // 2, y), line, fill="black", font=font_sm)
        y += mm(4)

    y += mm(2)
    draw.line([(mm(3), y), (width - mm(3), y)], fill="black", width=1)
    y += mm(4)

    invoice_text = "INVOICE"
    bbox = draw.textbbox((0, 0), invoice_text, font=font_xl)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, y), invoice_text, fill="black", font=font_xl)
    y += mm(7)

    invoice_num = f"#{str(sale.id).zfill(6)}"
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

    cashier_text = f"Cashier: {sale.user.username if sale.user else 'N/A'}"
    bbox = draw.textbbox((0, 0), cashier_text, font=font_sm)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, y), cashier_text, fill="black", font=font_sm)
    y += mm(5)

    draw.line([(mm(3), y), (width - mm(3), y)], fill="black", width=1)
    y += mm(4)

    draw.text((mm(3), y), "CUSTOMER", fill="black", font=font_sm_bold)
    y += mm(4)
    customer_name = sale.customer_name or "Walk-in Customer"
    draw.text((mm(3), y), customer_name[:40], fill="black", font=font_md)
    y += mm(6)

    draw.line([(mm(3), y), (width - mm(3), y)], fill="black", width=1)
    y += mm(4)

    draw.text((mm(3), y), "ITEMS", fill="black", font=font_sm_bold)
    y += mm(5)

    amounts = _get_invoice_amounts(sale)
    display_subtotal = amounts["display_subtotal"]
    total_discount = amounts["total_discount"]

    for item in sale.items:
        product_name = item.product.name if item.product else f"Product #{item.product_id}"
        draw.text((mm(3), y), product_name[:34], fill="black", font=font_md)
        y += mm(4)

        if item.variation:
            attrs = ", ".join([f"{k}: {v}" for k, v in item.variation.attributes.items()])
            draw.text((mm(4), y), attrs[:36], fill="#5c4dff", font=font_sm)
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
        draw.text((width - text_width - mm(3), y), final_price, fill="#0a7d2c", font=font_sm_bold)
        y += mm(6)

    y += mm(1)
    draw.line([(mm(3), y), (width - mm(3), y)], fill="black", width=1)
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

    draw.text((mm(3), y), "TOTAL", fill="black", font=font_lg)
    total_text = f"RS {sale.total:.2f}"
    bbox = draw.textbbox((0, 0), total_text, font=font_lg)
    text_width = bbox[2] - bbox[0]
    draw.text((width - text_width - mm(3), y), total_text, fill="black", font=font_lg)
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

    draw.line([(mm(3), y), (width - mm(3), y)], fill="black", width=1)
    y += mm(4)

    draw.text((mm(3), y), "Amount Paid", fill="black", font=font_md)
    paid_text = f"RS {sale.amount_paid:.2f}"
    bbox = draw.textbbox((0, 0), paid_text, font=font_md)
    text_width = bbox[2] - bbox[0]
    draw.text((width - text_width - mm(3), y), paid_text, fill="black", font=font_md)
    y += mm(5)

    if sale.amount_due > 0:
        draw.text((mm(3), y), "Outstanding (Udhar)", fill="black", font=font_sm_bold)
        due_text = f"RS {sale.amount_due:.2f}"
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

    draw.line([(mm(3), y), (width - mm(3), y)], fill="black", width=1)
    y += mm(4)

    footer_text = "VibePOS (by vibeexe.com)"
    bbox = draw.textbbox((0, 0), footer_text, font=font_sm)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, y), footer_text, fill="gray", font=font_sm)

    img = img.crop((0, 0, width, y + mm(10)))
    img.save(file_path, "PNG", quality=95)


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

        # Generate invoice image
        timestamp = now_pkt().strftime("%Y%m%d_%H%M%S")
        filename = f"invoice_{timestamp}.png"
        file_path = INVOICE_DIR / filename
        _render_invoice_image(sale, file_path, dpi=300, refunded_amount=refunded_amount)
        
        # Send to WhatsApp
        whatsapp_url = "http://127.0.0.1:8000/api/v1/whatsapp/send-image"
        payload = {
            "phone_number": phone_number,
            "image_url": str(file_path.absolute()),
            "caption": _build_whatsapp_invoice_caption(sale, refunded_amount=refunded_amount)
        }
        
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

    # Enforce credit limit (account for balance reduction from old due on this sale)
    if customer and amount_due > 0:
        credit_limit = customer.credit_limit
        if credit_limit is not None:
            old_due = sale.amount_due or 0.0
            projected_balance = customer.outstanding_balance - old_due + amount_due
            if projected_balance > credit_limit:
                available = max(0, credit_limit - (customer.outstanding_balance - old_due))
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


@router.post("/{id}/send-invoice")
def send_invoice(
    id: int,
    phone_number: str,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Generate invoice image using PIL and send via WhatsApp API
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
        refunded_amount = float(
            db.query(func.coalesce(func.sum(PosReturn.refund_amount), 0.0))
            .filter(PosReturn.sale_id == id)
            .scalar()
            or 0.0
        )

        # Generate invoice image
        timestamp = now_pkt().strftime("%Y%m%d_%H%M%S")
        filename = f"invoice_{timestamp}.png"
        file_path = INVOICE_DIR / filename
        _render_invoice_image(sale, file_path, dpi=300, refunded_amount=refunded_amount)
        
        # Send to WhatsApp API
        whatsapp_url = "http://127.0.0.1:8000/api/v1/whatsapp/send-image"
        payload = {
            "phone_number": normalized_phone,
            "image_url": str(file_path.absolute()),
            "caption": _build_whatsapp_invoice_caption(sale, refunded_amount=refunded_amount)
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
            "message": "Invoice sent successfully",
            "phone_number": normalized_phone,
            "file_path": str(file_path.absolute())
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send invoice: {str(e)}")
