import logging
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional
from neonize.client import NewClient
from neonize.events import ConnectedEv, MessageEv, PairStatusEv, LoggedOutEv, event
from neonize.utils import build_jid
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

# Initialize the WhatsApp client
client = NewClient(SESSION_FILE)

# Global state
connection_status = {
    "connected": False,
    "message": "Not connected yet",
    "pairing_code": None
}

print(f"📁 WhatsApp session file: {SESSION_FILE}")

# Pydantic models for request/response
class SendMessageRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number with country code (e.g., 923171585452)")
    message: str = Field(..., description="Message to send")

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

# Event handlers
@client.event(ConnectedEv)
def on_connected(client: NewClient, _: ConnectedEv):
    print("✅ WhatsApp Connection Established! You are now online.")
    connection_status["connected"] = True
    connection_status["message"] = "Connected successfully"
    connection_status["pairing_code"] = None

@client.event(PairStatusEv)
def on_pair_status(client: NewClient, pair: PairStatusEv):
    if pair.ID.User:
        print(f"✅ WhatsApp Logged in as: {pair.ID.User}")
        connection_status["connected"] = True
        connection_status["message"] = f"Logged in as: {pair.ID.User}"

@client.event(LoggedOutEv)
def on_logged_out(client: NewClient, evt: LoggedOutEv):
    print(f"❌ WhatsApp Disconnected: {evt.Reason}")
    connection_status["connected"] = False
    connection_status["message"] = f"Disconnected: {evt.Reason}"
    connection_status["pairing_code"] = None

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


# Background task to run the WhatsApp client
def run_whatsapp_client():
    try:
        phone_number = os.getenv("WHATSAPP_PHONE", "923025114945")
        use_qr = os.getenv("USE_QR", "0") == "1"
        
        if use_qr:
            print("📱 WhatsApp: Using QR Code authentication")
            print("📱 Scan the QR code below with WhatsApp:")
            print("")
            client.connect()
            connection_status["message"] = "Using QR code authentication"
        else:
            print(f"📞 WhatsApp: Attempting pairing code authentication for: {phone_number}")
            print("💡 Tip: If rate limited, restart with: USE_QR=1")
            
            try:
                pairing_code = client.PairPhone(
                    phone_number,
                    show_push_notification=True
                )
                
                print(f"🔑 WhatsApp Pairing Code: {pairing_code}")
                print("Enter this code in WhatsApp → Linked Devices → Link with phone number")
                
                client.connect()
                
            except Exception as pair_error:
                error_msg = str(pair_error)
                
                if "429" in error_msg or "rate" in error_msg.lower() or "overlimit" in error_msg.lower():
                    print("")
                    print("⚠️  Rate limit detected! Falling back to QR Code...")
                    print("📱 Scan the QR code below with WhatsApp:")
                    print("")
                    
                    client.connect()
                    connection_status["message"] = "Using QR code authentication (rate limited)"
                else:
                    raise pair_error
                
    except Exception as e:
        print(f"❌ WhatsApp Error: {e}")
        connection_status["connected"] = False
        connection_status["message"] = f"Connection error: {str(e)}"

# Initialize WhatsApp client
def init_whatsapp():
    """Initialize WhatsApp client in background thread"""
    thread = threading.Thread(target=run_whatsapp_client, daemon=True)
    thread.start()
    print("🚀 WhatsApp client started in background")

# Create router
router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])

@router.get("/status", response_model=ConnectionStatus)
async def get_status():
    """Get the current connection status of the WhatsApp bot"""
    return connection_status

@router.get("/connected")
async def is_connected():
    """Check if WhatsApp is currently connected (real-time status)"""
    is_actually_connected = connection_status["connected"] and client.is_logged_in
    
    if not is_actually_connected and connection_status["connected"]:
        connection_status["connected"] = False
        connection_status["message"] = "Connection lost"
    
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
    """
    if not connection_status["connected"]:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp bot is not connected. Please wait for connection or scan QR code."
        )
    
    try:
        jid = build_jid(request.phone_number)
        client.send_message(jid, request.message)
        
        return SendMessageResponse(
            status="success",
            message="Message sent successfully",
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
    if not connection_status["connected"]:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp bot is not connected. Please wait for connection or scan QR code."
        )
    
    try:
        jid = build_jid(request.phone_number)
        client.send_image(
            jid,
            request.image_url,
            caption=request.caption or ""
        )
        
        return SendMessageResponse(
            status="success",
            message="Image sent successfully",
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
    if not connection_status["connected"]:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp bot is not connected. Please wait for connection or scan QR code."
        )
    
    try:
        jid = build_jid(request.phone_number)
        client.send_audio(jid, request.audio_url)
        
        return SendMessageResponse(
            status="success",
            message="Audio sent successfully",
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
    if not connection_status["connected"]:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp bot is not connected. Please wait for connection or scan QR code."
        )
    
    try:
        jid = build_jid(request.phone_number)
        client.send_document(
            jid,
            request.document_url,
            caption=request.caption or "",
            filename=request.filename or ""
        )
        
        return SendMessageResponse(
            status="success",
            message="Document sent successfully",
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
    if not connection_status["connected"]:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp bot is not connected. Please wait for connection or scan QR code."
        )
    
    results = []
    for phone in phone_numbers:
        try:
            jid = build_jid(phone)
            client.send_message(jid, message)
            results.append({
                "phone_number": phone,
                "status": "success",
                "message": "Message sent"
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
