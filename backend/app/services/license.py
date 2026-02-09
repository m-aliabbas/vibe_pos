# app/services/license.py
import hashlib
import json
import os
import platform
import sys
import uuid
import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple, List

import firebase_admin
from cryptography.fernet import Fernet
from firebase_admin import credentials, firestore, initialize_app
from firebase_admin.exceptions import FirebaseError

from app.core.config import settings


class LicenseError(RuntimeError):
    pass


DEFAULT_ENC_FILENAME = "k1.json.enc"
DEFAULT_LICENSE_CACHE_FILENAME = "license_cache.enc"


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

    expires_at = payload.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except ValueError:
            expires_at = None

    if _is_expired(expires_at if isinstance(expires_at, datetime) else None):
        return None

    return payload


def _save_local_license_cache(fingerprint: str, expires_at: Optional[datetime]) -> None:
    key = _get_license_cache_key()
    if not key:
        return

    cache_path = _get_license_cache_path()
    cache_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "fingerprint": fingerprint,
        "approved": True,
        "expires_at": expires_at.isoformat() if isinstance(expires_at, datetime) else None,
        "cached_at": datetime.now(timezone.utc).isoformat(),
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
    return datetime.now(timezone.utc) > expires_at


def check_license_or_exit() -> str:
    if not settings.LICENSE_ENFORCEMENT:
        return "license-check-skipped"

    fingerprint = get_device_fingerprint()

    print("🔐 Doing local license verification...")
    cached = _load_local_license_cache(fingerprint)
    if cached and cached.get("approved") is True:
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

    _save_local_license_cache(
        fingerprint,
        expires_at if isinstance(expires_at, datetime) else None,
    )

    return fingerprint

