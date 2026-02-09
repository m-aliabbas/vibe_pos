from typing import List, Optional
import os
import re
import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime, date
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
from app.schemas.sale import SaleCreate, Sale as SaleSchema, SaleStats
from app.services import accounting as accounting_service

router = APIRouter()

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


def _get_store_details() -> tuple[str, str]:
    store_name = os.getenv("STORE_NAME", "MyStore").strip() or "MyStore"
    store_address = os.getenv("STORE_ADDRESS", "Gulberg Islamabad").strip() or "Gulberg Islamabad"
    return store_name, store_address


def _render_invoice_image(sale: Sale, file_path: Path, dpi: int = 300) -> None:
    """Render an invoice image with consistent design across OSes."""
    from PIL import ImageDraw

    mm_to_px = dpi / 25.4

    def mm(mm_val: float) -> int:
        return int(mm_val * mm_to_px)

    # 80mm thermal receipt width
    width = int(80 * mm_to_px)
    base_height = int(135 * mm_to_px)
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

    store_name, store_address = _get_store_details()

    # Header bar
    header_height = mm(10)
    draw.rectangle([(0, y), (width, y + header_height)], fill="black")
    bbox = draw.textbbox((0, 0), store_name, font=font_lg)
    text_width = bbox[2] - bbox[0]
    draw.text(((width - text_width) // 2, y + mm(2)), store_name, fill="white", font=font_lg)
    y += header_height + mm(2)

    for line in [store_address]:
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

    date_text = sale.created_at.strftime("%Y-%m-%d %H:%M")
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

    total_item_discount = 0
    for item in sale.items:
        if hasattr(item, "item_discount") and item.item_discount:
            total_item_discount += item.item_discount

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
    subtotal_text = f"RS {sale.subtotal:.2f}"
    bbox = draw.textbbox((0, 0), subtotal_text, font=font_md)
    text_width = bbox[2] - bbox[0]
    draw.text((width - text_width - mm(3), y), subtotal_text, fill="black", font=font_md)
    y += mm(5)

    total_discount = sale.discount + total_item_discount
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


def generate_and_send_invoice(sale_id: int, phone_number: str):
    """
    Background task to generate invoice image and send via WhatsApp
    """
    from app.db.session import SessionLocal
    
    # Create new DB session for background task
    db = SessionLocal()
    
    try:
        # Get the sale with all relationships
        sale = db.query(Sale).filter(Sale.id == sale_id).first()
        if not sale:
            print(f"Sale {sale_id} not found")
            return
        # Generate invoice image
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"invoice_{timestamp}.png"
        file_path = INVOICE_DIR / filename
        _render_invoice_image(sale, file_path, dpi=300)
        
        # Send to WhatsApp
        whatsapp_url = "http://127.0.0.1:8000/api/v1/whatsapp/send-image"
        payload = {
            "phone_number": phone_number,
            "image_url": str(file_path.absolute()),
            "caption": f"Invoice #{str(sale.id).zfill(6)} - Total: RS {sale.total:.2f}\nThank you for your business!"
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
            quantity_in_base_units = item.quantity * selling_unit['conversion']
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
    
    # Normalize phone number
    normalized_phone = normalize_phone_number(sale_in.customer_phone)
    
    # === CUSTOMER LINKING LOGIC ===
    # Priority: customer_ref_id > customer_id > phone > walk-in
    customer_ref_id = None
    is_walkin = True
    customer = None
    
    # 1. If customer_ref_id provided (direct internal ID)
    if sale_in.customer_ref_id:
        customer = db.query(Customer).filter(Customer.id == sale_in.customer_ref_id).first()
        if customer:
            customer_ref_id = customer.id
            is_walkin = False
    
    # 2. Else if customer_id provided (readable ID like CUST001)
    elif sale_in.customer_id:
        customer = db.query(Customer).filter(
            Customer.customer_id == sale_in.customer_id.strip().upper()
        ).first()
        if customer:
            customer_ref_id = customer.id
            is_walkin = False
    
    # 3. Else if phone provided - find or create customer
    elif normalized_phone:
        customer = db.query(Customer).filter(Customer.phone == normalized_phone).first()
        
        if not customer:
            # Auto-create customer with phone number
            # Generate customer_id
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
                member_since=datetime.utcnow(),
            )
            db.add(customer)
            db.flush()  # Get customer ID
        
        customer_ref_id = customer.id
        is_walkin = False
    
    # 4. Else - walk-in customer (no linking)
    # is_walkin remains True, customer_ref_id remains None
    
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
        
        # Deduct from inventory (always in base units)
        if item.variation_id:
            variation = variations_dict[item.variation_id]
            variation.quantity -= int(quantity_in_base_units)
        else:
            product.quantity -= int(quantity_in_base_units)
    
    # Update customer statistics if linked
    if customer and customer_ref_id:
        customer.total_purchases += 1
        customer.total_spent += total
        # Add to outstanding balance if there's amount due (udhar)
        if amount_due > 0:
            customer.outstanding_balance += amount_due
        customer.updated_at = datetime.utcnow()
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
    query = db.query(Sale)
    
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
    sale = db.query(Sale).filter(Sale.id == id).first()
    
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
    # Get the sale
    sale = db.query(Sale).filter(Sale.id == id).first()
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
        # Generate invoice image
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"invoice_{timestamp}.png"
        file_path = INVOICE_DIR / filename
        _render_invoice_image(sale, file_path, dpi=300)
        
        # Send to WhatsApp API
        whatsapp_url = "http://127.0.0.1:8000/api/v1/whatsapp/send-image"
        payload = {
            "phone_number": normalized_phone,
            "image_url": str(file_path.absolute()),
            "caption": f"Invoice #{str(sale.id).zfill(6)} - Total: RS {sale.total:.2f}\nThank you for your business!"
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
