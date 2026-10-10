# app/services/license.py
import hashlib
import json
import os
import platform
import sys
import uuid
import base64
from datetime import datetime, timedelta, timezone
from math import ceil
from pathlib import Path
from typing import Optional, Tuple, List

import firebase_admin
from cryptography.fernet import Fernet
from firebase_admin import credentials, firestore, initialize_app
from firebase_admin.exceptions import FirebaseError

from app.core.config import settings
from app.platform.identifiers import ApplicationId
from app.platform.licensing import (
    LicenseEntitlements,
    entitlements_from_payload,
    set_active_entitlements,
)


class LicenseError(RuntimeError):
    pass


DEFAULT_ENC_FILENAME = "k1.json.enc"
DEFAULT_LICENSE_CACHE_FILENAME = "license_cache.enc"
LOCAL_LICENSE_CACHE_DAYS = 30
DEFAULT_LICENSE_TERM_DAYS = 30

_active_license_expiry: Optional[datetime] = None


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


def _project_root_dir() -> Path:
    """
    Resolve backend project root (folder containing `app/`, `run_server.py`, `k1.json.enc`, etc.)
    Works in dev; in frozen builds, it won't be used unless needed as a fallback.
    """
    try:
        # .../backend/app/services/license.py -> parents[2] == .../backend
        return Path(__file__).resolve().parents[2]
    except Exception:
        return Path.cwd()


def _resolve_resource_path(path_or_name: Optional[str]) -> Tuple[Path, List[Path]]:
    """
    Resolve a file path that may be:
    - absolute on disk
    - relative (filename) in dev
    - bundled with PyInstaller onefile (sys._MEIPASS)
    - placed next to the sidecar exe (Tauri bin folder)

    Returns: (resolved_path, candidates_tried)
    """
    candidates: List[Path] = []

    # Decide the filename to look for (default if None/empty)
    raw = (path_or_name or "").strip()
    filename = Path(raw).name if raw else DEFAULT_ENC_FILENAME

    # 1) If user provided an absolute path, try it first
    if raw:
        p = Path(raw)
        if p.is_absolute():
            candidates.append(p)

    # 2) Frozen build: prefer "next to exe" then _MEIPASS
    if getattr(sys, "frozen", False):
        try:
            exe_dir = Path(sys.executable).resolve().parent
            candidates.append(exe_dir / filename)
        except Exception:
            pass

        try:
            meipass = Path(getattr(sys, "_MEIPASS"))
            candidates.append(meipass / filename)
        except Exception:
            pass

    # 3) Dev / fallback: project root, then cwd
    root = _project_root_dir()
    candidates.append(root / filename)
    candidates.append(Path.cwd() / filename)

    # Pick the first one that exists
    for c in candidates:
        try:
            if c.exists() and c.is_file():
                return c, candidates
        except Exception:
            continue

    # Nothing found
    return Path(filename), candidates


def _get_license_cache_path() -> Path:
    raw = (settings.LICENSE_CACHE_PATH or "").strip()
    if raw:
        p = Path(raw)
        if p.is_absolute():
            return p
        return Path(settings.DATA_DIR) / p
    return Path(settings.DATA_DIR) / DEFAULT_LICENSE_CACHE_FILENAME


def _get_license_cache_key() -> Optional[bytes]:
    key = (settings.LICENSE_CACHE_KEY or "").strip()
    if not key:
        key = (settings.SECRET_KEY or "").strip()
    if not key:
        return None
    digest = hashlib.sha256(key.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _load_local_license_cache(expected_fingerprint: str) -> Optional[dict]:
    key = _get_license_cache_key()
    if not key:
        return None

    cache_path = _get_license_cache_path()
    if not cache_path.exists():
        return None

    try:
        encrypted = cache_path.read_bytes()
        fernet = Fernet(key)
        decrypted = fernet.decrypt(encrypted)
        payload = json.loads(decrypted.decode("utf-8"))
    except Exception:
        return None

    if payload.get("fingerprint") != expected_fingerprint:
        return None

    local_expires_at = _parse_expiry(payload.get("local_expires_at"))
    if local_expires_at is None or _is_expired(local_expires_at):
        return None

    remote_expires_at = _parse_expiry(payload.get("expire_date"))
    if remote_expires_at is None or _is_expired(remote_expires_at):
        return None

    return payload


def _entitlements_payload(entitlements: LicenseEntitlements) -> dict:
    return {
        "application_id": (
            entitlements.application_id.value if entitlements.application_id else None
        ),
        "profiles": (
            sorted(item.value for item in entitlements.profiles)
            if entitlements.profiles is not None
            else None
        ),
        "modules": (
            sorted(item.value for item in entitlements.modules)
            if entitlements.modules is not None
            else None
        ),
        "capabilities": (
            sorted(item.value for item in entitlements.capabilities)
            if entitlements.capabilities is not None
            else None
        ),
    }


def _activate_entitlements(payload: dict) -> LicenseEntitlements:
    try:
        entitlements = entitlements_from_payload(payload.get("entitlements") or payload)
    except (TypeError, ValueError) as exc:
        raise LicenseError(f"License contains invalid application entitlements: {exc}") from exc
    expected_application = ApplicationId(settings.APPLICATION_ID)
    if entitlements.application_id is None and expected_application != ApplicationId.RETAIL:
        raise LicenseError(
            f"License does not declare the required application "
            f"{expected_application.value!r}"
        )
    if entitlements.application_id not in (None, expected_application):
        raise LicenseError(
            f"License is for application {entitlements.application_id.value!r}, "
            f"not {expected_application.value!r}"
        )
    set_active_entitlements(entitlements)
    return entitlements


def _save_local_license_cache(
    fingerprint: str,
    expire_date: Optional[datetime],
    entitlements: LicenseEntitlements,
) -> None:
    key = _get_license_cache_key()
    if not key:
        return

    cache_path = _get_license_cache_path()
    cache_path.parent.mkdir(parents=True, exist_ok=True)

    cached_at = datetime.now(timezone.utc)
    payload = {
        "fingerprint": fingerprint,
        "approved": True,
        "expire_date": expire_date.isoformat() if isinstance(expire_date, datetime) else None,
        "cached_at": cached_at.isoformat(),
        "local_expires_at": (
            cached_at + timedelta(days=LOCAL_LICENSE_CACHE_DAYS)
        ).isoformat(),
        "entitlements": _entitlements_payload(entitlements),
    }

    try:
        fernet = Fernet(key)
        encrypted = fernet.encrypt(json.dumps(payload).encode("utf-8"))
        cache_path.write_bytes(encrypted)
    except Exception:
        return


def _load_firebase_credentials() -> dict:
    """
    Loads Firebase service account credentials.
    Supports:
    - Encrypted file (FIREBASE_CREDENTIALS_ENC_PATH + FIREBASE_CREDENTIALS_KEY)
    - Plain JSON file (FIREBASE_CREDENTIALS_PATH)
    """

    # --- Encrypted credentials path (preferred) ---
    enc_path_cfg = (settings.FIREBASE_CREDENTIALS_ENC_PATH or "").strip()
    key_cfg = (settings.FIREBASE_CREDENTIALS_KEY or "").strip()

    # If ENC_PATH is set OR if user provided a key, we attempt encrypted load.
    if enc_path_cfg or key_cfg:
        if not key_cfg:
            raise LicenseError("FIREBASE_CREDENTIALS_KEY is missing for encrypted credentials")

        # If ENC path not explicitly set, default to k1.json.enc
        enc_path_value = enc_path_cfg or DEFAULT_ENC_FILENAME
        enc_path, tried = _resolve_resource_path(enc_path_value)

        try:
            encrypted = enc_path.read_bytes()
        except FileNotFoundError:
            tried_str = "\n".join(f"- {p}" for p in tried)
            raise LicenseError(
                "Encrypted Firebase credentials file not found. Tried:\n" + tried_str
            )
        except Exception as exc:
            raise LicenseError(f"Failed to read encrypted credentials: {exc}") from exc

        try:
            fernet = Fernet(key_cfg.encode("utf-8"))
            decrypted = fernet.decrypt(encrypted)
            return json.loads(decrypted.decode("utf-8"))
        except Exception as exc:
            raise LicenseError(f"Failed to decrypt Firebase credentials: {exc}") from exc

    # --- Plain JSON credentials path (fallback) ---
    plain_path = (settings.FIREBASE_CREDENTIALS_PATH or "").strip()
    if plain_path:
        p = Path(plain_path)
        if not p.is_absolute():
            # treat as filename and try same resolution strategy
            p, tried = _resolve_resource_path(plain_path)
        else:
            tried = [p]

        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as handle:
                    return json.load(handle)
            except Exception as exc:
                raise LicenseError(f"Failed to read plain Firebase credentials: {exc}") from exc

        tried_str = "\n".join(f"- {pp}" for pp in tried)
        raise LicenseError("Firebase credentials file not found. Tried:\n" + tried_str)

    raise LicenseError(
        "Set FIREBASE_CREDENTIALS_ENC_PATH with FIREBASE_CREDENTIALS_KEY "
        "or set FIREBASE_CREDENTIALS_PATH"
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
    return datetime.now(timezone.utc) >= expires_at


def _parse_expiry(value: object) -> Optional[datetime]:
    if isinstance(value, datetime):
        expires_at = value
    elif isinstance(value, str):
        try:
            expires_at = datetime.fromisoformat(value)
        except ValueError:
            return None
    else:
        return None

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at


def _set_active_license_expiry(expires_at: Optional[datetime]) -> None:
    global _active_license_expiry
    _active_license_expiry = expires_at


def _days_remaining(
    expires_at: datetime,
    *,
    now: Optional[datetime] = None,
) -> int:
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return max(0, ceil((expires_at - current_time).total_seconds() / 86400))


def get_active_license_status() -> dict:
    expires_at = _active_license_expiry
    return {
        "enforced": settings.LICENSE_ENFORCEMENT,
        "expires_at": expires_at,
        "days_remaining": _days_remaining(expires_at) if expires_at else None,
    }


def check_license_or_exit() -> str:
    if not settings.LICENSE_ENFORCEMENT:
        _set_active_license_expiry(None)
        set_active_entitlements(LicenseEntitlements())
        return "license-check-skipped"

    fingerprint = get_device_fingerprint()

    print("🔐 Doing local license verification...")
    cached = _load_local_license_cache(fingerprint)
    if cached and cached.get("approved") is True:
        _activate_entitlements(cached)
        _set_active_license_expiry(_parse_expiry(cached.get("expire_date")))
        print("✅ Local license verification approved")
        return fingerprint

    print("🌐 Doing online license verification...")
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
                        "expire_date": datetime.now(timezone.utc)
                        + timedelta(days=DEFAULT_LICENSE_TERM_DAYS),
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
    approved = data.get("approved") is True
    disabled = bool(data.get("disabled"))
    expire_date = _parse_expiry(data.get("expire_date"))

    if disabled:
        raise LicenseError("License disabled for this device")
    if not approved:
        raise LicenseError("License not approved for this device")
    if expire_date is None:
        raise LicenseError("License expire_date is missing or invalid for this device")
    if _is_expired(expire_date):
        raise LicenseError("License expired for this device")

    entitlements = _activate_entitlements(data)
    _set_active_license_expiry(expire_date)

    _save_local_license_cache(
        fingerprint,
        expire_date,
        entitlements,
    )

    return fingerprint
