"""Local filesystem storage for uploaded assets (business logos for now).

Files are saved under STORAGE_ROOT/business-logos/{user_id}/logo.{ext}.
Served by FastAPI via `/storage/logos/{user_id}/{filename}` — public URL
(logos aren't secret, paths are guessable only via user_id uuid).

For production, swap this for S3/Supabase Storage behind the same interface.
"""

import os
import re
from pathlib import Path

import structlog

logger = structlog.get_logger()

STORAGE_ROOT = Path(os.getenv("STORAGE_ROOT", "/var/wamply-storage"))
BUSINESS_LOGOS_DIR = STORAGE_ROOT / "business-logos"

ALLOWED_MIME = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
}
MAX_LOGO_BYTES = 5 * 1024 * 1024  # 5 MB


class StorageError(Exception):
    """Raised on validation or filesystem failures."""


def _safe_user_id(user_id: str) -> str:
    """Accept only uuid-ish strings to prevent path traversal."""
    if not re.fullmatch(r"[0-9a-fA-F\-]{16,64}", user_id):
        raise StorageError("user_id non valido")
    return user_id.lower()


def save_business_logo(
    user_id: str,
    content: bytes,
    content_type: str,
) -> str:
    """Save a logo for the given user and return the public URL path.

    Returns e.g. '/storage/logos/abc-123/logo.png' — callers persist
    this in `businesses.logo_url`.
    """
    if content_type not in ALLOWED_MIME:
        raise StorageError(
            f"Formato non supportato: {content_type}. Usa PNG, JPG, WebP o SVG."
        )
    if len(content) > MAX_LOGO_BYTES:
        raise StorageError(f"File troppo grande (max {MAX_LOGO_BYTES // (1024*1024)} MB).")
    if len(content) == 0:
        raise StorageError("File vuoto.")

    safe_uid = _safe_user_id(user_id)
    ext = ALLOWED_MIME[content_type]
    user_dir = BUSINESS_LOGOS_DIR / safe_uid
    user_dir.mkdir(parents=True, exist_ok=True)

    # Delete previous logos with other extensions to avoid stale files
    for existing in user_dir.glob("logo.*"):
        try:
            existing.unlink()
        except OSError:
            pass

    target = user_dir / f"logo.{ext}"
    target.write_bytes(content)
    logger.info("logo_saved", user_id=safe_uid, size=len(content), ext=ext)

    return f"/storage/logos/{safe_uid}/logo.{ext}"


def resolve_logo_path(user_id: str, filename: str) -> Path | None:
    """Return absolute path to a logo file if it exists and is safe.
    Used by the serving endpoint. Returns None on any validation failure.
    """
    try:
        safe_uid = _safe_user_id(user_id)
    except StorageError:
        return None
    m = re.fullmatch(r"logo\.(png|jpg|jpeg|webp|svg)", filename)
    if not m:
        return None
    safe_filename = "logo." + m.group(1)  # reconstruct from regex groups, not raw user input
    path = BUSINESS_LOGOS_DIR / safe_uid / safe_filename
    if not path.is_file():
        return None
    return path
