from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
from app.core.timezone import now_pkt
from pathlib import Path
from PIL import Image
import requests

from app.api import deps
from app.models.pos_return import PosReturn, ReturnItem
from app.models.sale import Sale, SaleItem
from app.models.product import Product, ProductVariation
from app.models.user import User
from app.models.customer import Customer
from app.schemas.return_schema import ReturnCreate, ReturnResponse, ReturnStatusUpdate
from app.services import accounting as accounting_service
import json
import re
from app.models.purchase import Purchase
from app.models.vendor import Vendor
from app.platform.pos.calculations import convert_to_base_quantity
from app.platform.pos.inventory import InventoryService

RETURN_DIR = Path.home() / "Downloads" / "pos_invoices"
RETURN_DIR.mkdir(parents=True, exist_ok=True)


def _convert_utc_to_pakistan(dt: datetime) -> datetime:
    """Times are stored as naive PKT (GMT+5) in the DB — return as-is."""
    return dt


def normalize_phone_number(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("0"):
        digits = "92" + digits[1:]
    elif len(digits) == 10:
        digits = "92" + digits
    return digits if digits else None


def _build_whatsapp_return_caption(ret: PosReturn, db: Session) -> str:
    caption_time = _convert_utc_to_pakistan(ret.created_at).strftime("%Y-%m-%d %H:%M")
    lines = [
        f"Return #{str(ret.id).zfill(6)}",
    ]

    if ret.sale_id:
        lines.append(f"Sale #{str(ret.sale_id).zfill(6)}")

    lines.append("Items:")

    for item in ret.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        name = product.name if product and product.name else f"Product #{item.product_id}"

        gross_amount = (item.unit_price or 0.0) * (item.quantity_returned or 0)
        item_discount_returned = 0.0

        if item.sale_item_id:
            sale_item = db.query(SaleItem).filter(SaleItem.id == item.sale_item_id).first()
            if sale_item and sale_item.quantity:
                per_unit_discount = (sale_item.item_discount or 0.0) / sale_item.quantity
                item_discount_returned = per_unit_discount * (item.quantity_returned or 0)

        net_refund = max(0.0, gross_amount - item_discount_returned)
        clean_name = " ".join(name.split())
        display_name = clean_name if len(clean_name) <= 60 else f"{clean_name[:57]}..."
        line = f"- {display_name} x {item.quantity_returned} {item.unit}: RS {net_refund:.2f}"
        if item_discount_returned > 0:
            line += f" (disc -RS {item_discount_returned:.2f})"
        lines.append(line)

    lines.extend(
        [
            f"Total Refund: RS {ret.refund_amount:.2f}",
            f"Date/Time (GMT+5): {caption_time}",
        ]
    )
    return "\n".join(lines)


def generate_and_send_return_invoice(return_id: int, phone_number: str):
    from PIL import ImageDraw, ImageFont
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        ret = db.query(PosReturn).filter(PosReturn.id == return_id).first()
        if not ret:
            return

        sale = db.query(Sale).filter(Sale.id == ret.sale_id).first() if ret.sale_id else None

        timestamp = now_pkt().strftime("%Y%m%d_%H%M%S")
        filename = f"return_{timestamp}.png"
        file_path = RETURN_DIR / filename

        dpi = 300
        mm_to_px = dpi / 25.4
        width = int(80 * mm_to_px)
        base_height = int(115 * mm_to_px)
        item_height = len(ret.items) * int(26 * mm_to_px)
        total_height = base_height + item_height

        img = Image.new('RGB', (width, total_height), color='white')
        draw = ImageDraw.Draw(img)

        try:
            font_bold = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 42)
            font_normal = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 32)
            font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 26)
        except:
            font_bold = ImageFont.load_default()
            font_normal = ImageFont.load_default()
            font_small = ImageFont.load_default()

        y = int(5 * mm_to_px)

        def mm(mm_val):
            return int(mm_val * mm_to_px)

        # Fetch store info from DB
        store_name = "My Store"
        store_address = ""
        store_phone = ""
        try:
            from app.models.settings import StoreSettings as _SS
            srow = db.query(_SS).filter(_SS.id == 1).first()
            if srow and srow.store_name:
                store_name = srow.store_name
                parts = [p for p in [srow.store_address, srow.store_city] if p]
                store_address = ", ".join(parts)
                store_phone = srow.store_phone or ""
        except Exception:
            pass

        bbox = draw.textbbox((0, 0), store_name, font=font_bold)
        text_width = bbox[2] - bbox[0]
        draw.text(((width - text_width) // 2, y), store_name, fill='black', font=font_bold)
        y += mm(6)

        sub_lines = [l for l in [store_address, store_phone, "Return Invoice"] if l]
        for line in sub_lines:
            bbox = draw.textbbox((0, 0), line, font=font_small)
            text_width = bbox[2] - bbox[0]
            draw.text(((width - text_width) // 2, y), line, fill='black', font=font_small)
            y += mm(4)

        y += mm(2)
        draw.line([(mm(3), y), (width - mm(3), y)], fill='black', width=1)
        y += mm(4)

        return_num = f"Return #{str(ret.id).zfill(6)}"
        bbox = draw.textbbox((0, 0), return_num, font=font_normal)
        text_width = bbox[2] - bbox[0]
        draw.text(((width - text_width) // 2, y), return_num, fill='black', font=font_normal)
        y += mm(5)

        if sale:
            sale_text = f"Sale #{str(sale.id).zfill(6)}"
            bbox = draw.textbbox((0, 0), sale_text, font=font_small)
            text_width = bbox[2] - bbox[0]
            draw.text(((width - text_width) // 2, y), sale_text, fill='black', font=font_small)
            y += mm(4)

        pakistan_time = _convert_utc_to_pakistan(ret.created_at)
        date_text = pakistan_time.strftime("%Y-%m-%d %H:%M")
        bbox = draw.textbbox((0, 0), date_text, font=font_small)
        text_width = bbox[2] - bbox[0]
        draw.text(((width - text_width) // 2, y), date_text, fill='black', font=font_small)
        y += mm(4)

        draw.line([(mm(3), y), (width - mm(3), y)], fill='black', width=1)
        y += mm(4)

        draw.text((mm(3), y), "ITEMS:", fill='black', font=font_bold)
        y += mm(6)

        for item in ret.items:
            product = db.query(Product).filter(Product.id == item.product_id).first()
            name = product.name if product else f"Product #{item.product_id}"
            draw.text((mm(3), y), name[:34], fill='black', font=font_normal)
            y += mm(4.2)

            gross_amount = (item.unit_price or 0.0) * (item.quantity_returned or 0)
            item_discount_returned = 0.0
            if item.sale_item_id:
                sale_item = db.query(SaleItem).filter(SaleItem.id == item.sale_item_id).first()
                if sale_item and sale_item.quantity:
                    per_unit_discount = (sale_item.item_discount or 0.0) / sale_item.quantity
                    item_discount_returned = per_unit_discount * (item.quantity_returned or 0)
            net_refund = max(0.0, gross_amount - item_discount_returned)

            qty_rate_line = f"{item.quantity_returned} {item.unit} x RS {(item.unit_price or 0.0):.2f}"
            draw.text((mm(4), y), qty_rate_line, fill='black', font=font_small)
            gross_text = f"Gross: RS {gross_amount:.2f}"
            bbox = draw.textbbox((0, 0), gross_text, font=font_small)
            text_width = bbox[2] - bbox[0]
            draw.text((width - text_width - mm(3), y), gross_text, fill='black', font=font_small)
            y += mm(4)

            if item_discount_returned > 0:
                discount_text = f"Discount: -RS {item_discount_returned:.2f}"
                draw.text((mm(4), y), discount_text, fill='#cc0000', font=font_small)
                y += mm(4)

            refund_text = f"Refund: RS {net_refund:.2f}"
            bbox = draw.textbbox((0, 0), refund_text, font=font_small)
            text_width = bbox[2] - bbox[0]
            draw.text((width - text_width - mm(3), y), refund_text, fill='#0a7d2c', font=font_small)
            y += mm(5)

        y += mm(1)
        draw.line([(mm(3), y), (width - mm(3), y)], fill='black', width=1)
        y += mm(4)

        draw.text((mm(3), y), "Refund:", fill='black', font=font_normal)
        refund_total = f"RS: {ret.refund_amount:.2f}"
        bbox = draw.textbbox((0, 0), refund_total, font=font_normal)
        text_width = bbox[2] - bbox[0]
        draw.text((width - text_width - mm(3), y), refund_total, fill='black', font=font_normal)

        img.save(file_path, "PNG")

        whatsapp_url = "http://127.0.0.1:8000/api/v1/whatsapp/send-image"
        payload = {
            "phone_number": phone_number,
            "image_url": str(file_path.absolute()),
            "caption": _build_whatsapp_return_caption(ret, db)
        }

        requests.post(
            whatsapp_url,
            json=payload,
            headers={"accept": "application/json", "Content-Type": "application/json"},
            timeout=30
        )
    except Exception as e:
        print(f"Failed to send return invoice {return_id}: {str(e)}")
    finally:
        db.close()

router = APIRouter()

_PURCHASE_META_RE = re.compile(r"\[PURCHASE_RETURN:(\d+)\]")


def parse_json_field(value):
    """Parse JSON string field to Python object"""
    if isinstance(value, str):
        try:
            return json.loads(value) if value else []
        except:
            return []
    return value or []


def _extract_purchase_meta(notes: Optional[str]) -> tuple[Optional[int], Optional[str]]:
    if not notes:
        return None, notes
    match = _PURCHASE_META_RE.search(notes)
    if not match:
        return None, notes
    purchase_id = int(match.group(1))
    clean_notes = _PURCHASE_META_RE.sub("", notes).strip()
    return purchase_id, clean_notes or None


def _attach_purchase_meta(notes: Optional[str], purchase_id: int) -> str:
    meta = f"[PURCHASE_RETURN:{purchase_id}]"
    if notes and notes.strip():
        return f"{meta} {notes.strip()}"
    return meta


def _purchase_item_lookup(purchase: Optional[Purchase]) -> dict[tuple[int, Optional[int]], int]:
    if not purchase:
        return {}
    lookup: dict[tuple[int, Optional[int]], int] = {}
    for item in purchase.items or []:
        key = (item.product_id, item.variation_id)
        if key not in lookup:
            lookup[key] = item.id
    return lookup


@router.post("/", response_model=ReturnResponse)
def create_return(
    background_tasks: BackgroundTasks,
    return_in: ReturnCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Process a return/refund.
    Supports two modes:
    1. Sale-based return: Validates original sale, checks quantities, etc.
    2. Direct return: Simply adds products back to inventory without sale reference
    """
    
    inventory = InventoryService(db)
    requested_return_type = (return_in.return_type or "sale").strip().lower()
    is_purchase_return = requested_return_type == "purchase" or return_in.purchase_id is not None
    if return_in.sale_id and return_in.purchase_id:
        raise HTTPException(status_code=400, detail="Provide either sale_id or purchase_id, not both")

    # MODE 1: Sale-based return (legacy)
    return_customer_phone = return_in.customer_phone
    purchase_record = None
    purchase_vendor = None
    if return_in.sale_id:
        # Validate sale exists
        sale = db.query(Sale).filter(Sale.id == return_in.sale_id).first()
        if not sale:
            raise HTTPException(status_code=404, detail="Sale not found")
        return_customer_phone = sale.customer_phone or return_customer_phone

        # Pre-calc already returned quantities per sale_item
        returned_rows = (
            db.query(
                ReturnItem.sale_item_id,
                func.coalesce(func.sum(ReturnItem.quantity_returned), 0)
            )
            .join(PosReturn, PosReturn.id == ReturnItem.return_id)
            .filter(PosReturn.sale_id == return_in.sale_id)
            .group_by(ReturnItem.sale_item_id)
            .all()
        )

        returned_map = {row[0]: row[1] for row in returned_rows if row[0] is not None}
        
        # Validate return items and calculate totals
        return_items_data = []
        subtotal = 0.0
        
        for item in return_in.items:
            # Get the original sale item
            sale_item = db.query(SaleItem).filter(SaleItem.id == item.sale_item_id).first()
            if not sale_item:
                raise HTTPException(
                    status_code=404,
                    detail=f"Sale item {item.sale_item_id} not found"
                )
            
            # Verify it belongs to this sale
            if sale_item.sale_id != return_in.sale_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Sale item {item.sale_item_id} does not belong to sale {return_in.sale_id}"
                )
            
            quantity = item.quantity_returned or item.quantity
            
            # Check if return quantity is valid
            if quantity <= 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Return quantity must be positive"
                )
            
            already_returned = returned_map.get(sale_item.id, 0)
            remaining_qty = max(0, sale_item.quantity - already_returned)

            if quantity > remaining_qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot return {quantity} {sale_item.unit} - only {remaining_qty} {sale_item.unit} remaining after previous returns"
                )
            
            # Calculate refund on net line value (after per-item discount share)
            per_unit_discount = 0.0
            if sale_item.quantity:
                per_unit_discount = (sale_item.item_discount or 0.0) / sale_item.quantity
            item_refund = max(0.0, (sale_item.unit_price - per_unit_discount) * quantity)
            subtotal += item_refund

            # Resolve product for inventory updates
            product = db.query(Product).filter(Product.id == sale_item.product_id).first()
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {sale_item.product_id} not found")
            
            restocked = item.restocked if item.restocked is not None else item.add_to_inventory
            
            return_items_data.append({
                "sale_item": sale_item,
                "purchase_item": None,
                "product": product,
                "quantity_returned": quantity,
                "item_refund": item_refund,
                "restocked": restocked if restocked is not None else True,
                "inventory_action": "add" if (restocked if restocked is not None else True) else "none",
            })
        
        # Determine refund amount (use provided or calculated)
        refund_amount = return_in.refund_amount if return_in.refund_amount is not None else subtotal
        
    # MODE 2: Purchase/vendor return
    elif is_purchase_return:
        if not return_in.purchase_id:
            raise HTTPException(status_code=400, detail="purchase_id is required for purchase/vendor returns")

        purchase_record = db.query(Purchase).filter(Purchase.id == return_in.purchase_id).first()
        if not purchase_record:
            raise HTTPException(status_code=404, detail="Purchase not found")

        purchase_vendor = db.query(Vendor).filter(Vendor.id == purchase_record.vendor_id).first()
        if purchase_vendor and not return_customer_phone:
            return_customer_phone = purchase_vendor.phone

        purchase_items = {item.id: item for item in (purchase_record.items or [])}
        purchase_token = f"[PURCHASE_RETURN:{purchase_record.id}]"

        returned_rows = (
            db.query(
                ReturnItem.product_id,
                ReturnItem.variation_id,
                func.coalesce(func.sum(ReturnItem.quantity_returned), 0),
            )
            .join(PosReturn, PosReturn.id == ReturnItem.return_id)
            .filter(PosReturn.notes.like(f"%{purchase_token}%"))
            .group_by(ReturnItem.product_id, ReturnItem.variation_id)
            .all()
        )
        returned_map = {(row[0], row[1]): row[2] for row in returned_rows}

        return_items_data = []
        subtotal = 0.0

        for item in return_in.items:
            if not item.purchase_item_id:
                raise HTTPException(status_code=400, detail="purchase_item_id is required for purchase/vendor return lines")

            purchase_item = purchase_items.get(item.purchase_item_id)
            if not purchase_item:
                raise HTTPException(
                    status_code=404,
                    detail=f"Purchase item {item.purchase_item_id} not found in purchase {purchase_record.id}",
                )

            quantity = item.quantity_returned or item.quantity
            if not quantity or quantity <= 0:
                raise HTTPException(status_code=400, detail="Return quantity must be positive")

            key = (purchase_item.product_id, purchase_item.variation_id)
            already_returned = returned_map.get(key, 0)
            remaining_qty = max(0, (purchase_item.quantity or 0) - already_returned)
            if quantity > remaining_qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot return {quantity} - only {remaining_qty} remaining for purchase item {purchase_item.id}",
                )

            product = db.query(Product).filter(Product.id == purchase_item.product_id).first()
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {purchase_item.product_id} not found")

            unit_cost = item.unit_cost if item.unit_cost is not None else (purchase_item.unit_cost or 0.0)
            item_refund = max(0.0, unit_cost * quantity)
            subtotal += item_refund

            remove_from_inventory = True if item.remove_from_inventory is None else bool(item.remove_from_inventory)
            return_items_data.append({
                "sale_item": None,
                "purchase_item": purchase_item,
                "product": product,
                "quantity_returned": quantity,
                "item_refund": item_refund,
                "unit_cost": unit_cost,
                "restocked": not remove_from_inventory,
                "inventory_action": "subtract" if remove_from_inventory else "none",
            })

        refund_amount = return_in.refund_amount if return_in.refund_amount is not None else subtotal

    # MODE 3: Direct product return (new simplified approach)
    else:
        return_items_data = []
        subtotal = 0.0
        
        for item in return_in.items:
            if not item.product_id:
                raise HTTPException(
                    status_code=400,
                    detail="product_id is required for direct returns"
                )
            
            # Get product
            product = db.query(Product).filter(Product.id == item.product_id).first()
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
            
            quantity = item.quantity or item.quantity_returned
            if not quantity or quantity <= 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Return quantity must be positive"
                )
            
            restocked = item.add_to_inventory if item.add_to_inventory is not None else (item.restocked if item.restocked is not None else True)
            
            return_items_data.append({
                "sale_item": None,
                "purchase_item": None,
                "product": product,
                "quantity_returned": quantity,
                "item_refund": 0.0,  # No refund for direct returns
                "restocked": restocked,
                "inventory_action": "add" if restocked else "none",
            })
        
        refund_amount = 0.0  # No refund for direct returns
    
    notes_to_store = return_in.notes
    if purchase_record:
        notes_to_store = _attach_purchase_meta(notes_to_store, purchase_record.id)

    # Create return record
    db_return = PosReturn(
        sale_id=return_in.sale_id,
        customer_name=return_in.customer_name or (purchase_vendor.name if purchase_vendor else None),
        customer_phone=return_in.customer_phone or (purchase_vendor.phone if purchase_vendor else None),
        processed_by=current_user.id,
        reason=return_in.reason,
        notes=notes_to_store,
        status="approved",  # Auto-approve for now
        subtotal=subtotal,
        refund_amount=refund_amount
    )
    db.add(db_return)
    db.flush()  # Get return ID
    
    # Create return items and update inventory
    for item_data in return_items_data:
        sale_item = item_data.get("sale_item")
        purchase_item = item_data.get("purchase_item")
        product = item_data["product"]
        quantity_returned = item_data["quantity_returned"]
        restocked = item_data["restocked"]
        inventory_action = item_data.get("inventory_action", "none")
        
        # Create return item record
        db_return_item = ReturnItem(
            return_id=db_return.id,
            sale_item_id=sale_item.id if sale_item else None,
            product_id=product.id,
            variation_id=(sale_item.variation_id if sale_item else (purchase_item.variation_id if purchase_item else None)),
            quantity_returned=quantity_returned,
            unit=sale_item.unit if sale_item else product.base_unit,
            unit_price=sale_item.unit_price if sale_item else item_data.get("unit_cost", 0.0),
            total_refund=item_data["item_refund"],
            restocked=restocked
        )
        db.add(db_return_item)
        
        if inventory_action == "add":
            unit_used = sale_item.unit if sale_item else product.base_unit
            try:
                quantity_in_base_units = convert_to_base_quantity(
                    quantity_returned,
                    unit=unit_used,
                    base_unit=product.base_unit,
                    selling_units=parse_json_field(product.selling_units),
                    product_name=product.name,
                )
            except ValueError as error:
                raise HTTPException(status_code=400, detail=str(error)) from error
            variation_id = sale_item.variation_id if sale_item else None
            inventory.return_stock(product, quantity_in_base_units, variation_id=variation_id)
        elif inventory_action == "subtract":
            quantity_in_base_units = quantity_returned
            variation_id = sale_item.variation_id if sale_item else (purchase_item.variation_id if purchase_item else None)
            if variation_id is None:
                available_quantity = float(product.quantity or 0.0)
            else:
                variation = db.query(ProductVariation).filter(
                    ProductVariation.id == variation_id,
                    ProductVariation.product_id == product.id,
                ).first()
                if variation is None:
                    raise HTTPException(status_code=404, detail=f"Variation {variation_id} not found")
                available_quantity = float(variation.quantity or 0.0)
            if inventory.policy.tracks_inventory(product) and available_quantity < quantity_in_base_units:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for product {product.id}: available {available_quantity}, requested {quantity_in_base_units}",
                )
            inventory.issue(product, quantity_in_base_units, variation_id=variation_id)
    
    ar_reduction = 0.0
    payable_reduction = 0.0
    vendor_credit_amount = 0.0
    cash_refund = refund_amount

    settlement_mode = (return_in.settlement_mode or "auto").strip().lower()
    allowed_settlements = {"auto", "paid_to_customer", "added_to_account"}
    if purchase_record:
        allowed_settlements = {"auto", "paid_to_business", "added_to_vendor_credit"}
    if settlement_mode not in allowed_settlements:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid settlement_mode. Use one of: {', '.join(sorted(allowed_settlements))}",
        )

    # Update customer balance and settlement buckets - only for sale-based returns
    if return_in.sale_id:
        sale = db.query(Sale).filter(Sale.id == return_in.sale_id).first()
        if sale and sale.customer_ref_id and refund_amount > 0:
            customer = db.query(Customer).filter(Customer.id == sale.customer_ref_id).first()
            if customer:
                reconciled_balance = accounting_service.get_customer_balance(
                    db,
                    customer.id,
                    float(customer.opening_balance or 0.0),
                )
                customer.outstanding_balance = reconciled_balance

                if settlement_mode == "auto":
                    # Legacy behavior: reduce due first, then cash refund remainder.
                    if reconciled_balance > 0:
                        ar_reduction = min(reconciled_balance, refund_amount)
                        customer.outstanding_balance = reconciled_balance - ar_reduction
                        cash_refund = max(0.0, refund_amount - ar_reduction)
                    else:
                        cash_refund = refund_amount

                elif settlement_mode == "paid_to_customer":
                    # Full cash refund; customer due/prepaid position unchanged.
                    ar_reduction = 0.0
                    cash_refund = refund_amount

                elif settlement_mode == "added_to_account":
                    # Full refund added to customer account (can become prepaid credit).
                    ar_reduction = refund_amount
                    cash_refund = 0.0
                    customer.outstanding_balance = reconciled_balance - refund_amount
                
                # Update customer stats
                customer.total_spent = max(0, customer.total_spent - refund_amount)
                customer.updated_at = now_pkt()

    if purchase_record and purchase_vendor and refund_amount > 0:
        current_payable = max(0.0, accounting_service.get_vendor_balance(db, purchase_vendor.id))

        if settlement_mode == "auto":
            payable_reduction = min(current_payable, refund_amount)
            vendor_credit_amount = max(0.0, refund_amount - payable_reduction)
            cash_refund = 0.0
        elif settlement_mode == "added_to_vendor_credit":
            payable_reduction = 0.0
            vendor_credit_amount = refund_amount
            cash_refund = 0.0
        else:  # paid_to_business
            payable_reduction = 0.0
            vendor_credit_amount = 0.0
            cash_refund = refund_amount

    if (not purchase_record) and settlement_mode == "added_to_account" and ar_reduction <= 0 and refund_amount > 0:
        raise HTTPException(
            status_code=400,
            detail="added_to_account requires a linked customer sale to credit account",
        )
    
    # Commit transaction
    try:
        if not purchase_record:
            accounting_service.post_return_entry(
                db=db,
                return_record=db_return,
                refund_amount=refund_amount,
                ar_reduction=ar_reduction,
                cash_refund=cash_refund,
                created_by=current_user.id,
            )
        elif purchase_vendor and purchase_record:
            accounting_service.post_purchase_return_entry(
                db=db,
                return_record=db_return,
                purchase_id=purchase_record.id,
                refund_amount=refund_amount,
                payable_reduction=payable_reduction,
                vendor_credit=vendor_credit_amount,
                cash_refund=cash_refund,
                vendor_id=purchase_vendor.id,
                created_by=current_user.id,
            )
            purchase_vendor.prepaid_credit = max(
                0.0,
                accounting_service.get_vendor_advance_balance(db, purchase_vendor.id),
            )
            db.add(purchase_vendor)
        db.commit()
        db.refresh(db_return)

        response_purchase_id, clean_notes = _extract_purchase_meta(db_return.notes)
        response_return_type = "purchase" if response_purchase_id else ("sale" if db_return.sale_id else "direct")
        purchase_item_map = _purchase_item_lookup(purchase_record if response_purchase_id else None)

        normalized_phone = normalize_phone_number(return_customer_phone)
        if normalized_phone and background_tasks is not None:
            background_tasks.add_task(generate_and_send_return_invoice, db_return.id, normalized_phone)
        
        # Build response
        response = ReturnResponse(
            id=db_return.id,
            sale_id=db_return.sale_id,
            purchase_id=response_purchase_id,
            return_type=response_return_type,
            customer_name=db_return.customer_name,
            customer_phone=db_return.customer_phone,
            processed_by=db_return.processed_by,
            processed_by_username=current_user.username,
            reason=db_return.reason,
            notes=clean_notes,
            status=db_return.status,
            subtotal=db_return.subtotal,
            refund_amount=db_return.refund_amount,
            created_at=db_return.created_at,
            updated_at=db_return.updated_at,
            items=[]
        )

        for ret_item in db_return.items:
            product = db.query(Product).filter(Product.id == ret_item.product_id).first()
            response.items.append({
                "id": ret_item.id,
                "sale_item_id": ret_item.sale_item_id,
                "purchase_item_id": purchase_item_map.get((ret_item.product_id, ret_item.variation_id)),
                "product_id": ret_item.product_id,
                "product_name": product.name if product else None,
                "quantity": ret_item.quantity_returned,
                "unit": ret_item.unit,
                "total_refund": ret_item.total_refund,
                "restocked": ret_item.restocked,
                "add_to_inventory": ret_item.restocked,
                "settlement_mode": settlement_mode,
                "account_credit_amount": vendor_credit_amount if purchase_record else ar_reduction,
                "payable_reduction_amount": payable_reduction if purchase_record else 0.0,
                "cash_refund_amount": cash_refund,
            })
        
        return response
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to process return: {str(e)}")


@router.get("/", response_model=List[ReturnResponse])
def list_returns(
    skip: int = 0,
    limit: int = 100,
    sale_id: int = None,
    purchase_id: Optional[int] = None,
    customer_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get list of all returns with optional filters"""
    query = db.query(PosReturn)
    
    if sale_id:
        query = query.filter(PosReturn.sale_id == sale_id)

    if purchase_id:
        query = query.filter(PosReturn.notes.like(f"%[PURCHASE_RETURN:{purchase_id}]%"))

    if customer_id:
        query = query.join(Sale, Sale.id == PosReturn.sale_id).filter(
            Sale.customer_ref_id == customer_id
        )
    
    query = query.order_by(PosReturn.created_at.desc())
    returns = query.offset(skip).limit(limit).all()
    
    # Build responses
    responses = []
    for ret in returns:
        user = db.query(User).filter(User.id == ret.processed_by).first()
        response_purchase_id, clean_notes = _extract_purchase_meta(ret.notes)
        response_return_type = "purchase" if response_purchase_id else ("sale" if ret.sale_id else "direct")
        purchase_item_map = {}
        if response_purchase_id:
            purchase = db.query(Purchase).filter(Purchase.id == response_purchase_id).first()
            purchase_item_map = _purchase_item_lookup(purchase)
        
        response = ReturnResponse(
            id=ret.id,
            sale_id=ret.sale_id,
            purchase_id=response_purchase_id,
            return_type=response_return_type,
            customer_name=ret.customer_name,
            customer_phone=ret.customer_phone,
            processed_by=ret.processed_by,
            processed_by_username=user.username if user else None,
            reason=ret.reason,
            notes=clean_notes,
            status=ret.status,
            subtotal=ret.subtotal,
            refund_amount=ret.refund_amount,
            created_at=ret.created_at,
            updated_at=ret.updated_at,
            items=[]
        )
        
        for ret_item in ret.items:
            product = db.query(Product).filter(Product.id == ret_item.product_id).first()
            response.items.append({
                "id": ret_item.id,
                "sale_item_id": ret_item.sale_item_id,
                "purchase_item_id": purchase_item_map.get((ret_item.product_id, ret_item.variation_id)),
                "product_id": ret_item.product_id,
                "product_name": product.name if product else None,
                "quantity": ret_item.quantity_returned,
                "unit": ret_item.unit,
                "total_refund": ret_item.total_refund,
                "restocked": ret_item.restocked
            })
        
        responses.append(response)
    
    return responses


@router.get("/{return_id}", response_model=ReturnResponse)
def get_return(
    return_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get a specific return by ID"""
    ret = db.query(PosReturn).filter(PosReturn.id == return_id).first()
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    
    user = db.query(User).filter(User.id == ret.processed_by).first()
    response_purchase_id, clean_notes = _extract_purchase_meta(ret.notes)
    response_return_type = "purchase" if response_purchase_id else ("sale" if ret.sale_id else "direct")
    purchase_item_map = {}
    if response_purchase_id:
        purchase = db.query(Purchase).filter(Purchase.id == response_purchase_id).first()
        purchase_item_map = _purchase_item_lookup(purchase)
    
    response = ReturnResponse(
        id=ret.id,
        sale_id=ret.sale_id,
        purchase_id=response_purchase_id,
        return_type=response_return_type,
        customer_name=ret.customer_name,
        customer_phone=ret.customer_phone,
        processed_by=ret.processed_by,
        processed_by_username=user.username if user else None,
        reason=ret.reason,
        notes=clean_notes,
        status=ret.status,
        subtotal=ret.subtotal,
        refund_amount=ret.refund_amount,
        created_at=ret.created_at,
        updated_at=ret.updated_at,
        items=[]
    )
    
    for ret_item in ret.items:
        product = db.query(Product).filter(Product.id == ret_item.product_id).first()
        response.items.append({
            "id": ret_item.id,
            "sale_item_id": ret_item.sale_item_id,
            "purchase_item_id": purchase_item_map.get((ret_item.product_id, ret_item.variation_id)),
            "product_id": ret_item.product_id,
            "product_name": product.name if product else None,
            "quantity": ret_item.quantity_returned,
            "unit": ret_item.unit,
            "total_refund": ret_item.total_refund,
            "restocked": ret_item.restocked
        })
    
    return response
