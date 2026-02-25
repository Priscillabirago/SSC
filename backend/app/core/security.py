from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings


def _truncate_password(password: str) -> bytes:
    """Bcrypt has a 72-byte limit; truncate to avoid ValueError."""
    encoded = password.encode("utf-8")
    return encoded[:72] if len(encoded) > 72 else encoded


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        _truncate_password(plain_password),
        hashed_password.encode("utf-8"),
    )


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(
        _truncate_password(password),
        bcrypt.gensalt(),
    ).decode("utf-8")


def _create_token(subject: str | int, expires_delta: timedelta, token_type: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode: Dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "exp": expire,
    }
    return jwt.encode(
        to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )


def create_refresh_token(subject: str | int) -> str:
    settings = get_settings()
    return _create_token(
        subject,
        timedelta(minutes=settings.refresh_token_expire_minutes),
        token_type="refresh",
    )


def create_access_token(subject: str | int) -> str:
    settings = get_settings()
    return _create_token(
        subject,
        timedelta(minutes=settings.access_token_expire_minutes),
        token_type="access",
    )


def create_password_reset_token(subject: str | int) -> str:
    """Create a short-lived token for password reset (1 hour expiration)."""
    return _create_token(
        subject,
        timedelta(hours=1),
        token_type="password_reset",
    )


def decode_token(token: str) -> Dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:  # pragma: no cover - captured and re-raised upstream
        raise ValueError("Invalid token") from exc

