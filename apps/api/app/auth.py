import base64
import binascii
import hashlib
import hmac
import json
import time
from typing import Any

from fastapi import HTTPException, status
from google.auth.transport import requests
from google.oauth2 import id_token

from app.config import Settings


TOKEN_TTL_SECONDS = 60 * 60


def verify_google_id_token(credential: str, audience: str) -> dict[str, Any]:
    return id_token.verify_oauth2_token(credential, requests.Request(), audience=audience)


def create_admin_session_token(settings: Settings, *, email: str, subject: str) -> str:
    secret = settings.api_admin_session_secret
    if not secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "La autenticación administrativa no está configurada.")
    now = int(time.time())
    payload = {"email": email, "sub": subject, "iat": now, "exp": now + TOKEN_TTL_SECONDS}
    encoded_payload = _base64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    signature = _sign(encoded_payload, secret)
    return f"{encoded_payload}.{signature}"


def validate_admin_session_token(settings: Settings, token: str) -> bool:
    secret = settings.api_admin_session_secret
    if not secret:
        return False
    try:
        encoded_payload, supplied_signature = token.split(".", 1)
        expected_signature = _sign(encoded_payload, secret)
        if not hmac.compare_digest(supplied_signature, expected_signature):
            return False
        payload = json.loads(_base64url_decode(encoded_payload))
    except (binascii.Error, ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return False

    email = str(payload.get("email", "")).strip().lower()
    expires_at = payload.get("exp")
    if not email or not isinstance(expires_at, int) or expires_at < int(time.time()):
        return False
    return email in settings.admin_allowed_emails_set


def _sign(encoded_payload: str, secret: str) -> str:
    digest = hmac.new(secret.encode(), encoded_payload.encode(), hashlib.sha256).digest()
    return _base64url_encode(digest)


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")
