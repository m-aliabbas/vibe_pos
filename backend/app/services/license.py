import hashlib
import json
import os
import platform
import uuid
from datetime import datetime, timezone
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore, initialize_app
from firebase_admin.exceptions import FirebaseError
from cryptography.fernet import Fernet

from app.core.config import settings


class LicenseError(RuntimeError):
    pass


def _normalize_fingerprint_payload() -> dict:
    return {
        "system": platform.system(),
        "node": platform.node(),
        "release": platform.release(),
        "version": platform.version(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "mac": uuid.getnode(),
        "os_user": os.getenv("USER") or os.getenv("USERNAME") or "",
    }


def get_device_fingerprint() -> str:
    payload = _normalize_fingerprint_payload()
    payload_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload_json.encode("utf-8")).hexdigest()


def _load_firebase_credentials() -> dict:
    if settings.FIREBASE_CREDENTIALS_ENC_PATH and settings.FIREBASE_CREDENTIALS_KEY:
        with open(settings.FIREBASE_CREDENTIALS_ENC_PATH, "rb") as handle:
            encrypted = handle.read()
        fernet = Fernet(settings.FIREBASE_CREDENTIALS_KEY.encode("utf-8"))
        decrypted = fernet.decrypt(encrypted)
        return json.loads(decrypted.decode("utf-8"))

    if settings.FIREBASE_CREDENTIALS_PATH and os.path.exists(settings.FIREBASE_CREDENTIALS_PATH):
        with open(settings.FIREBASE_CREDENTIALS_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)

    raise LicenseError(
        "Set FIREBASE_CREDENTIALS_PATH or FIREBASE_CREDENTIALS_ENC_PATH with FIREBASE_CREDENTIALS_KEY"
    )


def _ensure_firebase_initialized() -> None:
    if len(firebase_admin._apps) > 0:
        return

    credentials_payload = _load_firebase_credentials()
    cred = credentials.Certificate(credentials_payload)
    initialize_app(cred, {"projectId": settings.FIREBASE_PROJECT_ID})


def _is_expired(expires_at: Optional[datetime]) -> bool:
    if not expires_at:
        return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > expires_at


def check_license_or_exit() -> str:
    if not settings.LICENSE_ENFORCEMENT:
        return "license-check-skipped"

    fingerprint = get_device_fingerprint()

    try:
        _ensure_firebase_initialized()
        db = firestore.client()
        doc_ref = db.collection(settings.FIREBASE_LICENSE_COLLECTION).document(fingerprint)
        doc = doc_ref.get()
    except (FirebaseError, Exception) as exc:
        raise LicenseError(f"License check failed: {exc}") from exc

    if not doc.exists:
        if settings.LICENSE_AUTO_REGISTER:
            payload = _normalize_fingerprint_payload()
            try:
                doc_ref.set(
                    {
                        "approved": False,
                        "disabled": False,
                        "created_at": firestore.SERVER_TIMESTAMP,
                        "fingerprint_payload": payload,
                    },
                    merge=True,
                )
            except (FirebaseError, Exception) as exc:
                raise LicenseError(f"License auto-register failed: {exc}") from exc

            raise LicenseError(
                "Device registered. Waiting for approval. Set approved=true in Firebase."
            )

        raise LicenseError(
            "Device not registered. Add a doc in Firebase with ID="
            f"{fingerprint} and approved=true."
        )

    data = doc.to_dict() or {}
    approved = bool(data.get("approved"))
    disabled = bool(data.get("disabled"))
    expires_at = data.get("expires_at")

    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except ValueError:
            expires_at = None

    if disabled:
        raise LicenseError("License disabled for this device")
    if not approved:
        raise LicenseError("License not approved for this device")
    if _is_expired(expires_at if isinstance(expires_at, datetime) else None):
        raise LicenseError("License expired for this device")

    return fingerprint
