import logging
import os
import queue
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional
from neonize.client import NewClient
from neonize.events import ConnectedEv, MessageEv, PairStatusEv, LoggedOutEv, event
from neonize.utils import build_jid
import multiprocessing
import threading
import time
import datetime
import requests
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.user import User, UserRole
import random




def get_today_date_time_pakistan_time():
    """Get today's date and time in Pakistan timezone"""
    pakistan_tz = datetime.timezone(datetime.timedelta(hours=5))
    now = datetime.datetime.now(pakistan_tz)
    return now.strftime("%Y-%m-%d"), now.strftime("%H:%M:%S")

# Create data directory for WhatsApp session
from app.core.config import settings

# Create data directory for WhatsApp session
WHATSAPP_DATA_DIR = Path(settings.DATA_DIR) / "whatsapp"
WHATSAPP_DATA_DIR.mkdir(parents=True, exist_ok=True)
SESSION_FILE = str(WHATSAPP_DATA_DIR / "my_bot_session.db")

client = NewClient(SESSION_FILE)

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
    # Basic auto-reply logic
    if message:
        sender = str(message.Info.MessageSource.Sender.User)
        
            
        # print(f"📩 New message from {sender}")
        
        if message.Message.extendedTextMessage:
            text = message.Message.extendedTextMessage.text
            # print(f"💬 Message content: {text} from sender: {sender}")
            if sender in ["923171585452"]:
                x = random.uniform(0.1, 5.2)
                if 'day' in text.lower() and 'daily' not in text.lower() or 'today' in text.lower():
                    time.sleep(x)  # Simulate processing delay
                    print("📊 Processing daily report request")
                    try:
                        # Create a database session
                        db = SessionLocal()
                        
                        # Get admin user for authorization
                        admin_user = db.query(User).filter(User.role == UserRole.ADMIN).first()
                        
                        if not admin_user:
                            reply = "⚠️ System error: No admin user found"
                        else:
                            # Import and call the report function directly
                            from app.api.v1.endpoints.reports import get_daily_summary_text
                            
                            report_data = get_daily_summary_text(db=db, current_user=admin_user)
                            reply = report_data.get("report", "Unable to generate report")
                            print("✅ Daily report generated successfully")
                        
                        db.close()
                        client.reply_message(reply, message)
                        
                    except Exception as e:
                        print(f"❌ Error generating daily report: {e}")
                        error_reply = "⚠️ Error generating daily report. Please contact admin."
                        client.reply_message(error_reply, message)
                        
                elif 'week' in text.lower():
                    
                    time.sleep(x)  # Simulate processing delay
                    print("📊 Processing weekly report request")
                    try:
                        # Create a database session
                        db = SessionLocal()
                        
                        # Get admin user for authorization
                        admin_user = db.query(User).filter(User.role == UserRole.ADMIN).first()
                        
                        if not admin_user:
                            reply = "⚠️ System error: No admin user found"
                        else:
                            # Import and call the report function directly
                            from app.api.v1.endpoints.reports import get_weekly_summary_text
                            
                            report_data = get_weekly_summary_text(db=db, current_user=admin_user)
                            reply = report_data.get("report", "Unable to generate report")
                            print("✅ Weekly report generated successfully")
                        
                        db.close()
                        client.reply_message(reply, message)
                        
                    except Exception as e:
                        print(f"❌ Error generating weekly report: {e}")
                        error_reply = "⚠️ Error generating weekly report. Please contact admin."
                        client.reply_message(error_reply, message)


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
                    caption=task.get("caption") or ",
                    filename=task.get("filename") or "",
                )
            else:
                print(f"⚠️ Unknown WhatsApp task type: {task_type}")
        except Exception as e:
            print(f"❌ WhatsApp send error: {e}")


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
    return connection_status

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
