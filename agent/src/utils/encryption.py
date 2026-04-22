import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from src.config import settings


def encrypt(plaintext: str) -> str:
    """Encrypt plaintext with AES-256-GCM. Returns iv:authTag:encrypted (all base64)."""
    key = settings.encryption_key.encode("utf-8")
    if len(key) != 32:
        raise ValueError("ENCRYPTION_KEY must be exactly 32 bytes")
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    ct = ciphertext[:-16]
    tag = ciphertext[-16:]
    return f"{base64.b64encode(iv).decode()}:{base64.b64encode(tag).decode()}:{base64.b64encode(ct).decode()}"


def decrypt(ciphertext: str | bytes) -> str:
    """Decrypt AES-256-GCM ciphertext in format iv:authTag:encrypted (all base64).

    `bytea` columns round-trip as `bytes` via asyncpg even though we stored
    an ASCII "iv:tag:ct" triple. Normalize here so both paths work.
    """
    if isinstance(ciphertext, bytes):
        ciphertext = ciphertext.decode("utf-8", errors="strict")
    parts = ciphertext.split(":")
    if len(parts) != 3:
        raise ValueError("Invalid ciphertext format")

    iv = base64.b64decode(parts[0])
    auth_tag = base64.b64decode(parts[1])
    encrypted = base64.b64decode(parts[2])

    key = settings.encryption_key.encode("utf-8")
    if len(key) != 32:
        raise ValueError("ENCRYPTION_KEY must be exactly 32 bytes")

    aesgcm = AESGCM(key)
    # GCM expects ciphertext + tag concatenated
    plaintext = aesgcm.decrypt(iv, encrypted + auth_tag, None)
    return plaintext.decode("utf-8")
