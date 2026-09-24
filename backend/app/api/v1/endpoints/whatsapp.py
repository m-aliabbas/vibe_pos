import logging
import os
import queue
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from neonize.client import NewClient
from neonize.events import ConnectedEv, MessageEv, PairStatusEv, LoggedOutEv
from neonize.utils import build_jid
import multiprocessing
import threading
import time
import datetime
from app.db.session import SessionLocal
from app.core.config import settings
from app.core.timezone import now_pkt
from app.models.settings import StoreSettings
from app.services.whatsapp_reports import (
    create_low_stock_report_pdf,
    create_sales_report_pdf,
    create_vendor_outstanding_report_pdf,
    find_customer_balance,
    get_customer_outstanding_total,
    get_owner_number,
    get_sales_snapshot,
    normalize_whatsapp_number,
)

# Create data directory for WhatsApp session
WHATSAPP_DATA_DIR = Path(settings.DATA_DIR) / "whatsapp"
WHATSAPP_DATA_DIR.mkdir(parents=True, exist_ok=True)
SESSION_FILE = str(WHATSAPP_DATA_DIR / "my_bot_session.db")

client = NewClient(SESSION_FILE)
logger = logging.getLogger(__name__)

def _default_connection_status():
    return {
        "connected": False,
        "message": "Not connected yet",
        "pairing_code": None,
    }


def _use_multiprocessing() -> bool:
    raw = (os.getenv("WHATSAPP_MULTIPROCESS") or "").strip().lower()
    if raw in {"1", "true", "yes", "y"}:
        return True
    if raw in {"0", "false", "no", "n"}:
        return False
    return os.name != "nt"

# Global state (will be replaced by Manager dict when worker starts)
connection_status = _default_connection_status()
whatsapp_manager = None
message_queue = None
whatsapp_worker = None

print(f"📁 WhatsApp session file: {SESSION_FILE}")

# Pydantic models for request/response
class SendMessageRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number with country code (e.g., 923171585452)")
    message: str = Field(..., description="Message to send")
    is_bulk: bool = Field(False, description="Flag for bulk messages (adds delays and rate limiting)")

class SendMessageResponse(BaseModel):
    status: str
    message: str
    phone_number: str

class SendImageRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number with country code (e.g., 923171585452)")
    image_url: str = Field(..., description="URL of the image to send")
    caption: Optional[str] = Field(None, description="Optional caption for the image")

class SendAudioRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number with country code (e.g., 923171585452)")
    audio_url: str = Field(..., description="URL of the audio file to send")

class SendDocumentRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number with country code (e.g., 923171585452)")
    document_url: str = Field(..., description="URL of the document to send")
    caption: Optional[str] = Field(None, description="Optional caption for the document")
    filename: Optional[str] = Field(None, description="Optional filename for the document")

class ConnectionStatus(BaseModel):
    connected: bool
    message: str
    pairing_code: Optional[str] = None

# Helper function to safely update connection status (works with both dict and Manager.dict)
def set_status(
    *,
    connected: Optional[bool] = None,
    message: Optional[str] = None,
    pairing_code: Optional[str] = None,
):
    if connected is not None:
        connection_status["connected"] = connected
    if message is not None:
        connection_status["message"] = message
    if pairing_code is not None:
        connection_status["pairing_code"] = pairing_code

# Event handlers
@client.event(ConnectedEv)
def on_connected(client: NewClient, _: ConnectedEv):
    print("✅ WhatsApp Connection Established! You are now online.")
    set_status(
        connected=True,
        message="Connected successfully",
        pairing_code=None,
    )

@client.event(PairStatusEv)
def on_pair_status(client: NewClient, pair: PairStatusEv):
    if pair.ID.User:
        print(f"✅ WhatsApp Logged in as: {pair.ID.User}")
        set_status(
            connected=True,
            message=f"Logged in as: {pair.ID.User}",
            pairing_code=None,
        )

@client.event(LoggedOutEv)
def on_logged_out(client: NewClient, evt: LoggedOutEv):
    print(f"❌ WhatsApp Disconnected: {evt.Reason}")
    set_status(
        connected=False,
        message=f"Disconnected: {evt.Reason}",
        pairing_code=None,
    )

@client.event(MessageEv)
def on_message(client: NewClient, message: MessageEv):
    """Handle exact owner-only report commands received over WhatsApp."""
    if not message:
        return
    sender = ""
    reply_jid = None
    try:
        source = message.Info.MessageSource
        if bool(getattr(source, "IsFromMe", False)):
            return
        if bool(getattr(source, "IsGroup", False)):
            return
        sender = _resolve_sender_phone(client, source)
        reply_jid = source.Chat
        text = _extract_message_text(message)
        if not sender or not text or not text.startswith("/"):
            return

        with SessionLocal() as db:
            if sender != get_owner_number(db):
                return
            command = text.partition(" ")[0].lower()
            logger.info("Processing WhatsApp owner command: %s", command)
            _handle_owner_command(client, reply_jid, text, db)
    except Exception:
        logger.exception("Failed to process WhatsApp owner command")
        if reply_jid is not None:
            try:
                _send_text(client, reply_jid, "Unable to process that command. Please try again.")
            except Exception:
                logger.exception("Failed to send WhatsApp command error response")


def _jid_has_value(jid) -> bool:
    if jid is None:
        return False
    try:
        return bool(jid.ListFields())
    except (AttributeError, TypeError):
        return bool(getattr(jid, "User", ""))


def _resolve_sender_phone(client: NewClient, source) -> str:
    """Resolve modern LID-addressed messages back to the owner's phone number."""
    sender = getattr(source, "Sender", None)
    sender_alt = getattr(source, "SenderAlt", None)

    # WhatsApp normally includes the phone JID as SenderAlt when Sender is a LID.
    for candidate in (sender_alt, sender):
        if not _jid_has_value(candidate):
            continue
        server = str(getattr(candidate, "Server", "") or "").lower()
        if server != "lid":
            phone = normalize_whatsapp_number(str(getattr(candidate, "User", "")))
            if phone:
                return phone

    # Fall back to Neonize's local LID-to-phone mapping when SenderAlt is absent.
    if _jid_has_value(sender) and hasattr(client, "get_pn_from_lid"):
        try:
            phone_jid = client.get_pn_from_lid(sender)
            return normalize_whatsapp_number(str(getattr(phone_jid, "User", "")))
        except Exception:
            logger.warning("Could not resolve incoming WhatsApp LID to a phone number")
    return ""


def _extract_message_text(message: MessageEv) -> str:
    payload = message.Message
    conversation = getattr(payload, "conversation", None)
    if conversation:
        return str(conversation).strip()
    extended = getattr(payload, "extendedTextMessage", None)
    return str(getattr(extended, "text", "") or "").strip()


def _send_text(client: NewClient, reply_jid, text: str) -> None:
    client.send_message(reply_jid, text)


def _send_pdf(client: NewClient, reply_jid, path: Path, caption: str) -> None:
    client.send_document(
        reply_jid,
        str(path),
        caption=caption,
        filename=path.name,
    )


def _command_help() -> str:
    return (
        "VibePOS owner commands:\n"
        "/today - today's sales summary\n"
        "/sales <YYYY-MM-DD> - report for a date\n"
        "/day - yesterday's sales report\n"
        "/week - previous week's sales report\n"
        "/top - today's top products\n"
        "/cash - today's invoice collections\n"
        "/due - total customer outstanding\n"
        "/summary - today's compact dashboard\n"
        "/stock - low-stock report\n"
        "/bal <customer phone> - customer balance\n"
        "/vendors - vendor outstanding report\n"
        "/help"
    )


def _format_sales_summary(snapshot: dict, report_date: datetime.date) -> str:
    return (
        f"Sales summary - {report_date:%d %b %Y}\n"
        f"Transactions: {snapshot['transaction_count']}\n"
        f"Gross sales: PKR {snapshot['gross_sales']:,.2f}\n"
        f"Approved refunds: PKR {snapshot['refunds']:,.2f}\n"
        f"Net sales: PKR {snapshot['net_sales']:,.2f}\n"
        f"Collected against invoices: PKR {snapshot['amount_collected']:,.2f}\n"
        f"Credit added: PKR {snapshot['credit_sales']:,.2f}"
    )


def _format_top_products(snapshot: dict, report_date: datetime.date) -> str:
    products = snapshot["top_products"]
    if not products:
        return f"No products sold on {report_date:%d %b %Y}."
    lines = [f"Top products - {report_date:%d %b %Y}"]
    for index, product in enumerate(products, start=1):
        quantity = f"{product['quantity']:,.3f}".rstrip("0").rstrip(".")
        lines.append(
            f"{index}. {product['name']}: {quantity} sold, PKR {product['revenue']:,.2f}"
        )
    return "\n".join(lines)


def _format_collections(snapshot: dict, report_date: datetime.date) -> str:
    payment_totals = snapshot["payment_totals"]
    if not payment_totals:
        return f"No invoice collections recorded on {report_date:%d %b %Y}."
    lines = [f"Invoice collections - {report_date:%d %b %Y}"]
    for method, amount in sorted(payment_totals.items()):
        lines.append(f"{method.title()}: PKR {amount:,.2f}")
    lines.append(f"Total: PKR {snapshot['amount_collected']:,.2f}")
    return "\n".join(lines)


def _format_daily_dashboard(db, snapshot: dict, report_date: datetime.date) -> str:
    top_product = snapshot["top_products"][0] if snapshot["top_products"] else None
    lines = [
        f"Daily dashboard - {report_date:%d %b %Y}",
        f"Net sales: PKR {snapshot['net_sales']:,.2f}",
        f"Transactions: {snapshot['transaction_count']}",
        f"Invoice collections: PKR {snapshot['amount_collected']:,.2f}",
        f"Customer outstanding: PKR {get_customer_outstanding_total(db):,.2f}",
    ]
    if top_product:
        lines.append(
            f"Top product: {top_product['name']} (PKR {top_product['revenue']:,.2f})"
        )
    return "\n".join(lines)


def _handle_owner_command(
    client: NewClient,
    reply_jid,
    raw_text: str,
    db,
) -> None:
    command, _, argument = raw_text.strip().partition(" ")
    command = {
        "/day": "/previous-day-report",
        "/daily": "/previous-day-report",
        "/week": "/previous-week-report",
        "/weekly": "/previous-week-report",
        "/stock": "/low-stock-item",
        "/lowstock": "/low-stock-item",
        "/vendors": "/vendoroutstanding",
        "/vendor": "/vendoroutstanding",
        "/bal": "/balance",
    }.get(command.lower(), command.lower())
    today = now_pkt().date()

    if command == "/previous-day-report":
        report_date = today - datetime.timedelta(days=1)
        path = create_sales_report_pdf(db, report_date, report_date)
        _send_pdf(client, reply_jid, path, f"Previous day report - {report_date:%d %b %Y}")
        return

    if command == "/previous-week-report":
        current_week_start = today - datetime.timedelta(days=today.weekday())
        week_start = current_week_start - datetime.timedelta(days=7)
        week_end = current_week_start - datetime.timedelta(days=1)
        path = create_sales_report_pdf(db, week_start, week_end)
        _send_pdf(client, reply_jid, path, f"Previous week report - {week_start:%d %b} to {week_end:%d %b %Y}")
        return

    if command == "/today":
        _send_text(client, reply_jid, _format_sales_summary(get_sales_snapshot(db, today, today), today))
        return

    if command == "/sales":
        try:
            report_date = datetime.date.fromisoformat(argument.strip())
        except ValueError:
            _send_text(client, reply_jid, "Usage: /sales <YYYY-MM-DD>")
            return
        path = create_sales_report_pdf(db, report_date, report_date)
        _send_pdf(client, reply_jid, path, f"Sales report - {report_date:%d %b %Y}")
        return

    if command == "/top":
        _send_text(client, reply_jid, _format_top_products(get_sales_snapshot(db, today, today), today))
        return

    if command == "/cash":
        _send_text(client, reply_jid, _format_collections(get_sales_snapshot(db, today, today), today))
        return

    if command == "/due":
        _send_text(
            client,
            reply_jid,
            f"Total customer outstanding: PKR {get_customer_outstanding_total(db):,.2f}",
        )
        return

    if command == "/summary":
        _send_text(
            client,
            reply_jid,
            _format_daily_dashboard(db, get_sales_snapshot(db, today, today), today),
        )
        return

    if command == "/low-stock-item":
        path = create_low_stock_report_pdf(db)
        _send_pdf(client, reply_jid, path, "Current low-stock report")
        return

    if command == "/vendoroutstanding":
        path = create_vendor_outstanding_report_pdf(db)
        _send_pdf(client, reply_jid, path, "Current vendor outstanding report")
        return

    if command == "/balance":
        if not argument.strip():
            _send_text(client, reply_jid, "Usage: /balance <customer phone number>")
            return
        customer = find_customer_balance(db, argument)
        if customer is None:
            _send_text(client, reply_jid, "No customer found for that phone number.")
            return
        balance = float(customer["balance"])
        if balance > 0.005:
            position = f"Outstanding: PKR {balance:,.2f}"
        elif balance < -0.005:
            position = f"Advance credit: PKR {abs(balance):,.2f}"
        else:
            position = "Balance is settled: PKR 0.00"
        _send_text(
            client,
            reply_jid,
            f"Customer: {customer['name']}\nPhone: {customer['phone']}\n{position}",
        )
        return

    if command in {"/help", "/commands"}:
        _send_text(client, reply_jid, _command_help())
        return

    _send_text(client, reply_jid, f"Unknown command.\n\n{_command_help()}")


def connect_client_loop():
    """
    Keep Neonize connection loop running in a background thread.
    """
    try:
        client.connect()
    except Exception as e:
        print(f"❌ Error in WhatsApp connect loop: {e}")
        set_status(
            connected=False,
            message=f"Connection error: {str(e)}",
            pairing_code=None,
        )


# Background task to run the WhatsApp client
def run_whatsapp_client():
    """
    Start the connect loop first, then request pairing code if needed.
    This avoids the 'client is nil' race seen when PairPhone is called
    before the underlying client is ready.
    """
    try:
        phone_number = os.getenv("WHATSAPP_PHONE", "923025114945")
        use_qr = os.getenv("USE_QR", "0") == "1"
        
        print(f"📞 Phone number for authentication: {phone_number}")
        
        # Start client connection loop first
        connect_thread = threading.Thread(target=connect_client_loop, daemon=True)
        connect_thread.start()
        
        # Give Neonize a moment to initialize its internal client
        time.sleep(2)
        
        # If already connected/logged in from existing session, no need to pair
        is_logged_in = bool(getattr(client, "is_logged_in", False))
        if connection_status.get("connected") or is_logged_in:
            set_status(
                connected=True,
                message="Connected using existing session",
                pairing_code=None,
            )
            print("✅ Existing session detected. No new pairing required.")
            return
        
        if use_qr:
            print("📱 Using QR Code authentication (USE_QR enabled)")
            print("📱 Scan the QR code in the terminal")
            set_status(
                connected=False,
                message="Waiting for QR code scan",
                pairing_code=None,
            )
            return
        
        print(f"📞 Attempting pairing code authentication for: {phone_number}")
        print("💡 Tip: If you get rate limited, restart with: USE_QR=1 python main.py")
        
        try:
            pairing_code = client.PairPhone(
                phone_number,
                show_push_notification=True,
            )
            pairing_code = str(pairing_code)
            
            print(f"🔑 Your pairing code: {pairing_code}")
            print("Enter this code in WhatsApp → Linked Devices → Link with phone number")
            
            set_status(
                connected=False,
                message="Pairing code generated. Complete linking from WhatsApp.",
                pairing_code=pairing_code,
            )
            
        except Exception as pair_error:
            error_msg = str(pair_error)
            print(f"❌ Pairing error: {error_msg}")
            
            if "429" in error_msg or "rate" in error_msg.lower() or "overlimit" in error_msg.lower():
                print("")
                print("⚠️ Rate limit detected! Falling back to QR code authentication...")
                print("📱 Scan the QR code in the terminal")
                print("")
                
                set_status(
                    connected=False,
                    message="Waiting for QR code scan (pairing rate limited)",
                    pairing_code=None,
                )
            else:
                raise pair_error
                
    except Exception as e:
        print(f"❌ Error connecting WhatsApp client: {e}")
        set_status(
            connected=False,
            message=f"Connection error: {str(e)}",
            pairing_code=None,
        )

def run_whatsapp_worker(status_proxy, task_queue):
    global connection_status
    connection_status = status_proxy

    # Multiprocessing spawn imports only this endpoint module. Register every
    # ORM model before the worker opens a SessionLocal (notably PosReturn.User).
    import app.db.base  # noqa: F401

    connect_thread = threading.Thread(target=run_whatsapp_client, daemon=True)
    connect_thread.start()
    
    # Track messages sent today for rate limiting
    daily_message_count = 0
    last_reset_date = datetime.date.today()

    while True:
        task = task_queue.get()
        if task is None:
            break

        task_type = task.get("type")
        retries = int(task.get("retries", 0))
        is_bulk = task.get("is_bulk", False)  # Flag for bulk messages

        # Reset daily counter at midnight
        current_date = datetime.date.today()
        if current_date > last_reset_date:
            daily_message_count = 0
            last_reset_date = current_date
            print("📊 Daily message counter reset")

        # Daily limit check (200 bulk messages per day)
        if is_bulk and daily_message_count >= 200:
            print(f"⚠️ Daily bulk message limit reached ({daily_message_count}/200). Message queued for tomorrow.")
            time.sleep(60)  # Wait a minute before rechecking
            task_queue.put(task)  # Re-queue for later
            continue

        if not connection_status.get("connected"):
            if retries < 5:
                task["retries"] = retries + 1
                time.sleep(2)
                task_queue.put(task)
            else:
                print("⚠️ WhatsApp task dropped after retries (not connected)")
            continue

        try:
            # Fixed 3-minute delay BEFORE sending bulk messages
            if is_bulk:
                delay = 180  # 3 minutes delay
                print(f"⏳ Waiting {delay}s (3 min) before sending bulk message...")
                time.sleep(delay)
            
            if task_type == "text":
                jid = build_jid(task["phone_number"])
                client.send_message(jid, task["message"])
                if is_bulk:
                    daily_message_count += 1
                    print(f"✅ Bulk message sent ({daily_message_count}/200 today)")
            elif task_type == "image":
                jid = build_jid(task["phone_number"])
                client.send_image(jid, task["image_url"], caption=task.get("caption") or "")
            elif task_type == "audio":
                jid = build_jid(task["phone_number"])
                client.send_audio(jid, task["audio_url"])
            elif task_type == "document":
                jid = build_jid(task["phone_number"])
                client.send_document(
                    jid,
                    task["document_url"],
                    caption=task.get("caption") or "",
                    filename=task.get("filename") or "",
                )
                if task.get("daily_report_end_date"):
                    try:
                        _mark_daily_report_sent(task["daily_report_end_date"])
                    except Exception:
                        logger.exception(
                            "WhatsApp report was sent but its delivery marker could not be saved"
                        )
            else:
                print(f"⚠️ Unknown WhatsApp task type: {task_type}")
        except Exception as e:
            print(f"❌ WhatsApp send error: {e}")
            if retries < 5:
                task["retries"] = retries + 1
                time.sleep(2)
                task_queue.put(task)


def _mark_daily_report_sent(report_end_date: str) -> None:
    """Persist delivery completion from the WhatsApp worker process/thread."""
    delivered_date = datetime.date.fromisoformat(report_end_date)
    with SessionLocal() as db:
        row = db.query(StoreSettings).filter(StoreSettings.id == 1).first()
        if row and (
            row.whatsapp_last_daily_report_date is None
            or row.whatsapp_last_daily_report_date < delivered_date
        ):
            row.whatsapp_last_daily_report_date = delivered_date
            db.commit()


def _ensure_whatsapp_worker():
    global whatsapp_manager, message_queue, whatsapp_worker, connection_status

    if whatsapp_worker and whatsapp_worker.is_alive():
        return

    if _use_multiprocessing():
        whatsapp_manager = multiprocessing.Manager()
        connection_status = whatsapp_manager.dict(_default_connection_status())
        message_queue = whatsapp_manager.Queue()

        whatsapp_worker = multiprocessing.Process(
            target=run_whatsapp_worker,
            args=(connection_status, message_queue),
            daemon=True,
        )
    else:
        whatsapp_manager = None
        connection_status = _default_connection_status()
        message_queue = queue.Queue()
        whatsapp_worker = threading.Thread(
            target=run_whatsapp_worker,
            args=(connection_status, message_queue),
            daemon=True,
        )
    whatsapp_worker.start()


def _enqueue_task(task: dict):
    _ensure_whatsapp_worker()
    if message_queue is None:
        raise HTTPException(status_code=503, detail="WhatsApp worker not available")
    message_queue.put(task)


def queue_report_document(
    phone_number: str,
    document_path: Path,
    caption: str,
    *,
    daily_report_end_date: Optional[datetime.date] = None,
) -> None:
    """Queue a generated owner report for delivery by the connected worker."""
    task = {
        "type": "document",
        "phone_number": normalize_whatsapp_number(phone_number),
        "document_url": str(document_path),
        "caption": caption,
        "filename": document_path.name,
        "retries": 0,
    }
    if daily_report_end_date is not None:
        task["daily_report_end_date"] = daily_report_end_date.isoformat()
    _enqueue_task(task)


def whatsapp_is_connected() -> bool:
    return bool(connection_status.get("connected"))


# Initialize WhatsApp client
def init_whatsapp():
    """Initialize WhatsApp client in a separate worker process"""
    _ensure_whatsapp_worker()
    print("🚀 WhatsApp worker started")

# Create router
router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])

@router.get("/status", response_model=ConnectionStatus)
async def get_status():
    """Get the current connection status of the WhatsApp bot"""
    return dict(connection_status)

@router.get("/connected")
async def is_connected():
    """Check if WhatsApp is currently connected (real-time status)"""
    is_actually_connected = bool(connection_status.get("connected"))
    return {
        "connected": is_actually_connected,
        "timestamp": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5))).isoformat()
    }

@router.post("/send", response_model=SendMessageResponse)
async def send_message(request: SendMessageRequest):
    """
    Send a text message to a WhatsApp number
    
    - **phone_number**: Phone number with country code (no + or spaces)
    - **message**: The message text to send
    - **is_bulk**: Set to true for bulk messages (adds delays and rate limiting)
    """
    try:
        _enqueue_task({
            "type": "text",
            "phone_number": request.phone_number,
            "message": request.message,
            "is_bulk": request.is_bulk,
            "retries": 0,
        })
        return SendMessageResponse(
            status="queued",
            message="Message queued successfully",
            phone_number=request.phone_number
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send message: {str(e)}"
        )

@router.post("/send-image", response_model=SendMessageResponse)
async def send_image(request: SendImageRequest):
    """
    Send an image to a WhatsApp number
    
    - **phone_number**: Phone number with country code (no + or spaces)
    - **image_url**: URL of the image to send
    - **caption**: Optional caption for the image
    """
    try:
        _enqueue_task({
            "type": "image",
            "phone_number": request.phone_number,
            "image_url": request.image_url,
            "caption": request.caption,
            "retries": 0,
        })
        return SendMessageResponse(
            status="queued",
            message="Image queued successfully",
            phone_number=request.phone_number
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send image: {str(e)}"
        )

@router.post("/send-audio", response_model=SendMessageResponse)
async def send_audio(request: SendAudioRequest):
    """
    Send an audio file to a WhatsApp number
    
    - **phone_number**: Phone number with country code (no + or spaces)
    - **audio_url**: URL of the audio file to send
    """
    try:
        _enqueue_task({
            "type": "audio",
            "phone_number": request.phone_number,
            "audio_url": request.audio_url,
            "retries": 0,
        })
        return SendMessageResponse(
            status="queued",
            message="Audio queued successfully",
            phone_number=request.phone_number
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send audio: {str(e)}"
        )

@router.post("/send-document", response_model=SendMessageResponse)
async def send_document(request: SendDocumentRequest):
    """
    Send a document to a WhatsApp number
    
    - **phone_number**: Phone number with country code (no + or spaces)
    - **document_url**: URL of the document to send
    - **caption**: Optional caption for the document
    - **filename**: Optional filename for the document
    """
    try:
        _enqueue_task({
            "type": "document",
            "phone_number": request.phone_number,
            "document_url": request.document_url,
            "caption": request.caption,
            "filename": request.filename,
            "retries": 0,
        })
        return SendMessageResponse(
            status="queued",
            message="Document queued successfully",
            phone_number=request.phone_number
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send document: {str(e)}"
        )

@router.post("/send-bulk")
async def send_bulk_messages(
    phone_numbers: list[str],
    message: str
):
    """
    Send the same message to multiple phone numbers
    
    - **phone_numbers**: List of phone numbers with country codes
    - **message**: The message text to send to all numbers
    """
    results = []
    for phone in phone_numbers:
        try:
            _enqueue_task({
                "type": "text",
                "phone_number": phone,
                "message": message,
                "retries": 0,
            })
            results.append({
                "phone_number": phone,
                "status": "queued",
                "message": "Message queued"
            })
        except Exception as e:
            results.append({
                "phone_number": phone,
                "status": "error",
                "message": str(e)
            })
    
    return {
        "total": len(phone_numbers),
        "results": results
    }

@router.post("/disconnect")
async def disconnect():
    """Disconnect the WhatsApp bot"""
    try:
        connection_status["connected"] = False
        connection_status["message"] = "Disconnected by user"
        return {"status": "success", "message": "Disconnected successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to disconnect: {str(e)}"
        )
