from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
import hashlib
import os

# Secret key must be provided by environment.
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is required")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
MOBILE_ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("MOBILE_ACCESS_TOKEN_EXPIRE_MINUTES", str(ACCESS_TOKEN_EXPIRE_MINUTES))
)
MOBILE_REFRESH_TOKEN_EXPIRE_DAYS = int(
    os.getenv("MOBILE_REFRESH_TOKEN_EXPIRE_DAYS", "90")
)
SESSION_KIND_DEFAULT = "default"
SESSION_KIND_MOBILE = "mobile"


def _env_bool(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


REFRESH_TOKEN_NO_EXPIRY = _env_bool("REFRESH_TOKEN_NO_EXPIRY", False)
MOBILE_REFRESH_TOKEN_NO_EXPIRY = _env_bool(
    "MOBILE_REFRESH_TOKEN_NO_EXPIRY",
    REFRESH_TOKEN_NO_EXPIRY,
)


def normalize_session_kind(session_kind: Optional[str]) -> str:
    if (session_kind or "").strip().lower() == SESSION_KIND_MOBILE:
        return SESSION_KIND_MOBILE
    return SESSION_KIND_DEFAULT


def get_access_token_expiry_minutes(session_kind: Optional[str] = None) -> int:
    if normalize_session_kind(session_kind) == SESSION_KIND_MOBILE:
        return MOBILE_ACCESS_TOKEN_EXPIRE_MINUTES
    return ACCESS_TOKEN_EXPIRE_MINUTES


def get_refresh_token_expiry_days(session_kind: Optional[str] = None) -> int:
    if normalize_session_kind(session_kind) == SESSION_KIND_MOBILE:
        return MOBILE_REFRESH_TOKEN_EXPIRE_DAYS
    return REFRESH_TOKEN_EXPIRE_DAYS


def is_refresh_token_non_expiring(session_kind: Optional[str] = None) -> bool:
    if normalize_session_kind(session_kind) == SESSION_KIND_MOBILE:
        return MOBILE_REFRESH_TOKEN_NO_EXPIRY
    return REFRESH_TOKEN_NO_EXPIRY

def verify_password(plain_password: str, hashed_password: str):
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), 
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False

def get_password_hash(password: str):
    # Hash a password for the first time
    # (gensalt generates a random salt)
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
    session_kind: Optional[str] = None,
):
    to_encode = data.copy()
    normalized_session_kind = normalize_session_kind(
        session_kind or to_encode.get("session_kind")
    )
    if normalized_session_kind != SESSION_KIND_DEFAULT:
        to_encode["session_kind"] = normalized_session_kind
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=get_access_token_expiry_minutes(normalized_session_kind)
        )
    to_encode.update({"exp": expire, "token_type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
    session_kind: Optional[str] = None,
):
    to_encode = data.copy()
    normalized_session_kind = normalize_session_kind(
        session_kind or to_encode.get("session_kind")
    )
    if normalized_session_kind != SESSION_KIND_DEFAULT:
        to_encode["session_kind"] = normalized_session_kind
    to_encode.update({"token_type": "refresh"})
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
        to_encode["exp"] = expire
    elif not is_refresh_token_non_expiring(normalized_session_kind):
        expire = datetime.now(timezone.utc) + timedelta(
            days=get_refresh_token_expiry_days(normalized_session_kind)
        )
        to_encode["exp"] = expire
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        token_type = payload.get("token_type")
        # Backward compatible with older access tokens that do not have token_type.
        if token_type and token_type != "access":
            return None
        return payload
    except JWTError:
        return None


def decode_refresh_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("token_type") != "refresh":
            return None
        return payload
    except JWTError:
        return None


def hash_token(token: str) -> str:
    token_bytes = f"{SECRET_KEY}:{token}".encode("utf-8")
    return hashlib.sha256(token_bytes).hexdigest()
