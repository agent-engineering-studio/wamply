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
TEMPLATE_MEDIA_DIR = STORAGE_ROOT / "template-media"

ALLOWED_MIME = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
}
MAX_LOGO_BYTES = 5 * 1024 * 1024  # 5 MB

# WhatsApp media size limits (per Meta's official guidelines).
# Images: 5MB, Video: 16MB, Document: 100MB. We cap at 16MB across the board
# for UX simplicity — anyone needing >16MB documents can paste a URL instead.
ALLOWED_MEDIA_MIME = {
    "image/png": ("png", "IMAGE"),
    "image/jpeg": ("jpg", "IMAGE"),
    "image/webp": ("webp", "IMAGE"),
    "video/mp4": ("mp4", "VIDEO"),
    "video/3gpp": ("3gp", "VIDEO"),
    "application/pdf": ("pdf", "DOCUMENT"),
}
MAX_MEDIA_BYTES = 16 * 1024 * 1024


class StorageError(Exception):
    """Raised on validation or filesystem failures."""


_UUID_RE = re.compile(
    r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
)


def _safe_user_id(user_id: str) -> str:
    """Accept only standard UUID strings; return captured group to break taint tracking."""
    m = _UUID_RE.fullmatch(user_id)
    if not m:
        raise StorageError("user_id non valido")
    return m.group(1).lower()


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


_TEMPLATE_ID_RE = re.compile(
    r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
)


def save_template_media(
    user_id: str,
    template_id: str,
    content: bytes,
    content_type: str,
) -> tuple[str, str]:
    """Save a media file for a template and return (relative_url, format).

    relative_url: e.g. '/storage/template-media/abc-123/tmpl-xyz.jpg'.
    format: 'IMAGE' | 'VIDEO' | 'DOCUMENT' — what the WhatsApp template header
    needs in its `format` field.
    """
    if content_type not in ALLOWED_MEDIA_MIME:
        raise StorageError(
            "Formato non supportato. Usa PNG/JPEG/WebP per immagini, MP4/3GP per video, PDF per documenti."
        )
    if len(content) > MAX_MEDIA_BYTES:
        raise StorageError(f"File troppo grande (max {MAX_MEDIA_BYTES // (1024 * 1024)} MB).")
    if len(content) == 0:
        raise StorageError("File vuoto.")

    safe_uid = _safe_user_id(user_id)
    m = _TEMPLATE_ID_RE.fullmatch(template_id)
    if not m:
        raise StorageError("template_id non valido")
    safe_tid = m.group(1).lower()

    ext, fmt = ALLOWED_MEDIA_MIME[content_type]
    user_dir = TEMPLATE_MEDIA_DIR / safe_uid
    user_dir.mkdir(parents=True, exist_ok=True)

    # Wipe any stale media for this template (different extension, replacement)
    for existing in user_dir.glob(f"{safe_tid}.*"):
        try:
            existing.unlink()
        except OSError:
            pass

    target = user_dir / f"{safe_tid}.{ext}"
    target.write_bytes(content)
    logger.info("template_media_saved", user_id=safe_uid, template_id=safe_tid, size=len(content), ext=ext)
    # Path matches the FastAPI route mount under the templates router prefix.
    return f"/templates/storage/template-media/{safe_uid}/{safe_tid}.{ext}", fmt


def resolve_template_media_path(user_id: str, filename: str) -> Path | None:
    """Return absolute path to a template media file if it exists and is safe."""
    try:
        safe_uid = _safe_user_id(user_id)
    except StorageError:
        return None
    m = re.fullmatch(
        r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.(png|jpg|jpeg|webp|mp4|3gp|pdf)",
        filename,
    )
    if not m:
        return None
    safe_filename = f"{m.group(1).lower()}.{m.group(2)}"
    base_dir = TEMPLATE_MEDIA_DIR.resolve()
    path = (TEMPLATE_MEDIA_DIR / safe_uid / safe_filename).resolve()
    try:
        path.relative_to(base_dir)
    except ValueError:
        return None
    if not path.is_file():
        return None
    return path


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
    base_dir = BUSINESS_LOGOS_DIR.resolve()
    path = (BUSINESS_LOGOS_DIR / safe_uid / safe_filename).resolve()
    try:
        path.relative_to(base_dir)
    except ValueError:
        return None
    if not path.is_file():
        return None
    return path
