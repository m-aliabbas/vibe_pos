from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
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

RETURN_DIR = Path.home() / "Downloads" / "pos_invoices"
RETURN_DIR.mkdir(parents=True, exist_ok=True)


def normalize_phone_number(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("0"):
        digits = "92" + digits[1:]
    elif len(digits) == 10:
        digits = "92" + digits
    return digits if digits else None


def generate_and_send_return_invoice(return_id: int, phone_number: str):
    from PIL import ImageDraw, ImageFont
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        ret = db.query(PosReturn).filter(PosReturn.id == return_id).first()
        if not ret:
            return

        sale = db.query(Sale).filter(Sale.id == ret.sale_id).first() if ret.sale_id else None

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"return_{timestamp}.png"
        file_path = RETURN_DIR / filename

        dpi = 300
        mm_to_px = dpi / 25.4
        width = int(80 * mm_to_px)
        base_height = int(110 * mm_to_px)
        item_height = len(ret.items) * int(18 * mm_to_px)
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

        date_text = ret.created_at.strftime("%Y-%m-%d %H:%M")
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
            draw.text((mm(3), y), name[:30], fill='black', font=font_normal)
            y += mm(4.5)
            qty_line = f"{item.quantity_returned} {item.unit}"
            draw.text((mm(4), y), qty_line, fill='black', font=font_small)
            refund_text = f"RS: {(item.total_refund or 0.0):.2f}"
            bbox = draw.textbbox((0, 0), refund_text, font=font_small)
            text_width = bbox[2] - bbox[0]
            draw.text((width - text_width - mm(3), y), refund_text, fill='black', font=font_small)
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

        whatsapp_url = "http://127.0.0.1:8000/api/v1/whatsapp/send"
        payload = {
            "phone_number": phone_number,
            "image_url": str(file_path.absolute()),
            "caption": f"Return #{str(ret.id).zfill(6)} - Refund: RS{ret.refund_amount:.2f}"
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


def parse_json_field(value):
    """Parse JSON string field to Python object"""
    if isinstance(value, str):
        try:
            return json.loads(value) if value else []
        except:
            return []
    return value or []


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
    
    # MODE 1: Sale-based return (legacy)
    return_customer_phone = return_in.customer_phone
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
            
            # Calculate refund for this item
            item_refund = sale_item.unit_price * quantity
            subtotal += item_refund

            # Resolve product for inventory updates
            product = db.query(Product).filter(Product.id == sale_item.product_id).first()
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {sale_item.product_id} not found")
            
            restocked = item.restocked if item.restocked is not None else item.add_to_inventory
            
            return_items_data.append({
                "sale_item": sale_item,
                "product": product,
                "quantity_returned": quantity,
                "item_refund": item_refund,
                "restocked": restocked if restocked is not None else True
            })
        
        # Determine refund amount (use provided or calculated)
        refund_amount = return_in.refund_amount if return_in.refund_amount is not None else subtotal
        
    # MODE 2: Direct product return (new simplified approach)
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
                "product": product,
                "quantity_returned": quantity,
                "item_refund": 0.0,  # No refund for direct returns
                "restocked": restocked
            })
        
        refund_amount = 0.0  # No refund for direct returns
    
    # Create return record
    db_return = PosReturn(
        sale_id=return_in.sale_id,
        customer_name=return_in.customer_name,
        customer_phone=return_in.customer_phone,
        processed_by=current_user.id,
        reason=return_in.reason,
        notes=return_in.notes,
        status="approved",  # Auto-approve for now
        subtotal=subtotal,
        refund_amount=refund_amount
    )
    db.add(db_return)
    db.flush()  # Get return ID
    
    # Create return items and update inventory
    for item_data in return_items_data:
        sale_item = item_data.get("sale_item")
        product = item_data["product"]
        quantity_returned = item_data["quantity_returned"]
        restocked = item_data["restocked"]
        
        # Create return item record
        db_return_item = ReturnItem(
            return_id=db_return.id,
            sale_item_id=sale_item.id if sale_item else None,
            product_id=product.id,
            variation_id=sale_item.variation_id if sale_item else None,
            quantity_returned=quantity_returned,
            unit=sale_item.unit if sale_item else product.base_unit,
            unit_price=sale_item.unit_price if sale_item else 0.0,
            total_refund=item_data["item_refund"],
            restocked=restocked
        )
        db.add(db_return_item)
        
        # Add back to inventory if restocked
        if restocked:
            # Convert to base units
            quantity_in_base_units = quantity_returned
            
            unit_used = sale_item.unit if sale_item else product.base_unit
            
            if unit_used != product.base_unit:
                # Find conversion rate
                selling_units = parse_json_field(product.selling_units)
                for su in selling_units:
                    if su.get('unit') == unit_used:
                        quantity_in_base_units = quantity_returned * float(su['conversion'])
                        break
            
            # Add back to inventory
            variation_id = sale_item.variation_id if sale_item else None
            if variation_id:
                variation = db.query(ProductVariation).filter(
                    ProductVariation.id == variation_id
                ).first()
                if variation:
                    variation.quantity += quantity_in_base_units
            else:
                product.quantity += quantity_in_base_units
    
    ar_reduction = 0.0
    cash_refund = refund_amount

    settlement_mode = (return_in.settlement_mode or "auto").strip().lower()
    if settlement_mode not in {"auto", "paid_to_customer", "added_to_account"}:
        raise HTTPException(
            status_code=400,
            detail="Invalid settlement_mode. Use: auto, paid_to_customer, or added_to_account",
        )

    # Update customer balance and settlement buckets - only for sale-based returns
    if return_in.sale_id:
        sale = db.query(Sale).filter(Sale.id == return_in.sale_id).first()
        if sale and sale.customer_ref_id and refund_amount > 0:
            customer = db.query(Customer).filter(Customer.id == sale.customer_ref_id).first()
            if customer:
                if settlement_mode == "auto":
                    # Legacy behavior: reduce due first, then cash refund remainder.
                    if customer.outstanding_balance > 0:
                        ar_reduction = min(customer.outstanding_balance, refund_amount)
                        customer.outstanding_balance -= ar_reduction
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
                    customer.outstanding_balance = (customer.outstanding_balance or 0.0) - refund_amount
                
                # Update customer stats
                customer.total_spent = max(0, customer.total_spent - refund_amount)
                customer.updated_at = datetime.utcnow()

    if settlement_mode == "added_to_account" and ar_reduction <= 0 and refund_amount > 0:
        raise HTTPException(
            status_code=400,
            detail="added_to_account requires a linked customer sale to credit account",
        )
    
    # Commit transaction
    try:
        accounting_service.post_return_entry(
            db=db,
            return_record=db_return,
            refund_amount=refund_amount,
            ar_reduction=ar_reduction,
            cash_refund=cash_refund,
            created_by=current_user.id,
        )
        db.commit()
        db.refresh(db_return)

        normalized_phone = normalize_phone_number(return_customer_phone)
        if normalized_phone and background_tasks is not None:
            background_tasks.add_task(generate_and_send_return_invoice, db_return.id, normalized_phone)
        
        # Build response
        response = ReturnResponse(
            id=db_return.id,
            sale_id=db_return.sale_id,
            customer_name=db_return.customer_name,
            customer_phone=db_return.customer_phone,
            processed_by=db_return.processed_by,
            processed_by_username=current_user.username,
            reason=db_return.reason,
            notes=db_return.notes,
            status=db_return.status,
            subtotal=db_return.subtotal,
            refund_amount=db_return.refund_amount,
            created_at=db_return.created_at,
            updated_at=db_return.updated_at,
            items=[]
        )
        
        # Add items with product names
        response_data = response.model_dump()
        response_data["settlement_mode"] = settlement_mode
        response_data["account_credit_amount"] = ar_reduction
        response_data["cash_refund_amount"] = cash_refund

        for ret_item in db_return.items:
            product = db.query(Product).filter(Product.id == ret_item.product_id).first()
            response.items.append({
                "id": ret_item.id,
                "sale_item_id": ret_item.sale_item_id,
                "product_id": ret_item.product_id,
                "product_name": product.name if product else None,
                "quantity": ret_item.quantity_returned,
                "unit": ret_item.unit,
                "total_refund": ret_item.total_refund,
                "restocked": ret_item.restocked,
                "add_to_inventory": ret_item.restocked
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
    customer_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get list of all returns with optional filters"""
    query = db.query(PosReturn)
    
    if sale_id:
        query = query.filter(PosReturn.sale_id == sale_id)

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
        
        response = ReturnResponse(
            id=ret.id,
            sale_id=ret.sale_id,
            customer_name=ret.customer_name,
            customer_phone=ret.customer_phone,
            processed_by=ret.processed_by,
            processed_by_username=user.username if user else None,
            reason=ret.reason,
            notes=ret.notes,
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
    
    response = ReturnResponse(
        id=ret.id,
        sale_id=ret.sale_id,
        customer_name=ret.customer_name,
        customer_phone=ret.customer_phone,
        processed_by=ret.processed_by,
        processed_by_username=user.username if user else None,
        reason=ret.reason,
        notes=ret.notes,
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
            "product_id": ret_item.product_id,
            "product_name": product.name if product else None,
            "quantity": ret_item.quantity_returned,
            "unit": ret_item.unit,
            "total_refund": ret_item.total_refund,
            "restocked": ret_item.restocked
        })
    
    return response
