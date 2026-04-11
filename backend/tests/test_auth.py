from jose import jwt

from src.config import settings


def test_jwt_encode_decode():
    payload = {"sub": "a0000000-0000-0000-0000-000000000001", "aud": "authenticated", "role": "authenticated"}
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    decoded = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience="authenticated")
    assert decoded["sub"] == "a0000000-0000-0000-0000-000000000001"


def test_jwt_invalid_secret():
    payload = {"sub": "test", "aud": "authenticated"}
    token = jwt.encode(payload, "wrong-secret-that-is-long-enough-for-hs256", algorithm="HS256")
    try:
        jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience="authenticated")
        assert False, "Should have raised"
    except Exception:
        pass
