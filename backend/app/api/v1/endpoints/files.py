from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
import os
from pathlib import Path
from datetime import datetime

router = APIRouter()

# Save to Downloads folder
UPLOAD_DIR = Path.home() / "Downloads" / "pos_invoices"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload-invoice")
async def upload_invoice(file: UploadFile = File(...)):
    """
    Upload invoice image and save to Downloads folder, return absolute file path
    """
    try:
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = file.filename.split(".")[-1] if file.filename else "png"
        filename = f"invoice_{timestamp}.{file_extension}"
        file_path = UPLOAD_DIR / filename
        
        # Save file
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
        
        # Return absolute path for the WhatsApp API
        absolute_path = str(file_path.absolute())
        
        return {
            "file_path": absolute_path,
            "filename": filename,
            "message": "Invoice saved successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
