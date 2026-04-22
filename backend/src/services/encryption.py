import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from src.config import settings


def encrypt(plaintext: str) -> str:
    key = settings.encryption_key.encode()
    if len(key) != 32:
        raise ValueError("ENCRYPTION_KEY must be exactly 32 bytes.")
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext.encode(), None)
    ct = ciphertext[:-16]
    tag = ciphertext[-16:]
    return f"{base64.b64encode(iv).decode()}:{base64.b64encode(tag).decode()}:{base64.b64encode(ct).decode()}"


def decrypt(ciphertext: str | bytes) -> str:
    # `bytea` columns round-trip as `bytes` via asyncpg even though we stored
    # an ASCII "iv:tag:ct" triple. Normalize here so both paths work.
    if isinstance(ciphertext, bytes):
        ciphertext = ciphertext.decode("utf-8", errors="strict")
    key = settings.encryption_key.encode()
    parts = ciphertext.split(":")
    if len(parts) != 3:
        raise ValueError("Invalid ciphertext format.")
    iv = base64.b64decode(parts[0])
    tag = base64.b64decode(parts[1])
    ct = base64.b64decode(parts[2])
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ct + tag, None).decode()
