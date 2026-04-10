import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from src.config import settings


def decrypt(ciphertext: str) -> str:
    """Decrypt AES-256-GCM ciphertext in format iv:authTag:encrypted (all base64)."""
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
