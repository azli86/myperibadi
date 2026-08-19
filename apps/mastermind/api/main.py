import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
import bcrypt
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

load_dotenv()

SECRET = os.environ.get("MASTERMIND_SECRET_KEY", "")
if not SECRET:
    raise RuntimeError("MASTERMIND_SECRET_KEY is required")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    DATABASE_URL = URL.create(
        "postgresql+asyncpg",
        username=os.environ.get("DB_USER"), password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"), port=int(os.environ.get("DB_PORT", "5432")),
        database=os.environ.get("DB_NAME"),
    )
engine = create_async_engine(DATABASE_URL, pool_pre_ping=True, pool_size=3, max_overflow=2)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
app = FastAPI(title="Mastermind Admin API", docs_url=None, redoc_url=None)
COOKIE = "mastermind_session"

class Login(BaseModel):
    email: EmailStr
    password: str

class GoogleLogin(BaseModel):
    id_token: str

_fcm_initialized = False

def _init_fcm():
    global _fcm_initialized
    if _fcm_initialized:
        return
    try:
        from firebase_admin import credentials, initialize_app
        private_key = os.getenv("FCM_PRIVATE_KEY", "")
        client_email = os.getenv(
            "FCM_CLIENT_EMAIL", ""
        )
        project_id = os.getenv("FCM_PROJECT_ID", "digitalport-d23f0")
        if not private_key or not client_email:
            logging.warning("FCM credentials not configured - Google login disabled")
            return
        cred = credentials.Certificate(
            {
                "type": "service_account",
                "project_id": project_id,
                "private_key_id": os.getenv("FCM_PRIVATE_KEY_ID", ""),
                "private_key": private_key.replace("\\n", "\n"),
                "client_email": client_email,
                "client_id": os.getenv("FCM_CLIENT_ID", ""),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{client_email.replace('@', '%40')}",
                "universe_domain": "googleapis.com",
            }
        )
        initialize_app(cred)
        _fcm_initialized = True
    except Exception as e:  # noqa: BLE001
        logging.warning("Firebase Admin init failed: %s", e)


async def _verify_google_token(db: AsyncSession, id_token: str):
    import firebase_admin.auth as firebase_auth

    _init_fcm()
    try:
        decoded = firebase_auth.verify_id_token(id_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google ID token")
    firebase_uid = decoded.get("uid")
    email = (decoded.get("email") or "").strip().lower()
    if not firebase_uid or not email:
        raise HTTPException(status_code=400, detail="Google account missing email or UID")
    row = (
        await db.execute(
            text(
                """
                SELECT id FROM users
                WHERE (firebase_uid = :uid OR lower(email) = :email)
                  AND is_admin = true AND is_active = true
                """
            ),
            {"uid": firebase_uid, "email": email},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=403, detail="Not an admin account")
    return row["id"]

async def db_session():
    async with SessionLocal() as db:
        yield db

async def admin(
    token: Annotated[str | None, Cookie(alias=COOKIE)] = None,
    db: AsyncSession = Depends(db_session),
):
    try:
        payload = jwt.decode(token or "", SECRET, algorithms=["HS256"])
        if payload.get("scope") != "mastermind" or not payload.get("sub"):
            raise ValueError
    except (JWTError, ValueError):
        raise HTTPException(401, "Authentication required")
    row = (await db.execute(text(
        "SELECT id, email FROM users WHERE id = :id AND is_admin = true AND is_active = true"
    ), {"id": payload["sub"]})).mappings().first()
    if not row:
        raise HTTPException(401, "Admin access revoked")
    return dict(row)

def scalar(row, key):
    return int(row.get(key) or 0)

@app.get("/health")
async def health():
    return {"ok": True, "service": "mastermind-api"}

@app.post("/auth/google")
async def google_login(data: GoogleLogin, response: Response, db: AsyncSession = Depends(db_session)):
    user_id = await _verify_google_token(db, data.id_token)
    token = jwt.encode(
        {"sub": user_id, "scope": "mastermind", "exp": datetime.now(timezone.utc) + timedelta(hours=8)},
        SECRET,
        algorithm="HS256",
    )
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "true").lower() == "true",
        samesite="strict",
        max_age=28800,
        path="/",
    )
    return {"ok": True}


@app.post("/auth/login")
async def login(data: Login, response: Response, db: AsyncSession = Depends(db_session)):
    user = (await db.execute(text("""
        SELECT id, password_hash FROM users
        WHERE lower(email) = :email AND is_admin = true AND is_active = true
    """), {"email": data.email.lower()})).mappings().first()
    valid = bool(user and user["password_hash"] and bcrypt.checkpw(
        data.password.encode("utf-8"), user["password_hash"].encode("utf-8")
    ))
    if not valid:
        raise HTTPException(401, "Invalid credentials")
    token = jwt.encode({"sub": user["id"], "scope": "mastermind", "exp": datetime.now(timezone.utc) + timedelta(hours=8)}, SECRET, algorithm="HS256")
    response.set_cookie(COOKIE, token, httponly=True, secure=os.getenv("COOKIE_SECURE", "true").lower() == "true", samesite="strict", max_age=28800, path="/")
    return {"ok": True}

@app.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}

@app.get("/dashboard", dependencies=[Depends(admin)])
async def dashboard(db: AsyncSession = Depends(db_session)):
    # Deliberate allowlist: no schema discovery; unrelated/Cuba Info Biz data is never queried.
    values = (await db.execute(text("""
        SELECT
          (SELECT count(*) FROM users) users,
          (SELECT count(*) FROM users WHERE is_active = true) active_users,
          (SELECT count(*) FROM households) households,
          (SELECT count(*) FROM transactions) transactions,
          (SELECT count(*) FROM transactions WHERE created_at >= now() - interval '30 days') transactions_30d,
          (SELECT count(*) FROM wallets WHERE status = 'active') active_wallets,
          (SELECT count(*) FROM access_logs WHERE created_at >= now() - interval '24 hours') requests_24h
    """))).mappings().one()
    return {key: scalar(values, key) for key in values.keys()}

@app.get("/users", dependencies=[Depends(admin)])
async def users(q: str = "", limit: int = 50, offset: int = 0, db: AsyncSession = Depends(db_session)):
    limit = max(1, min(limit, 100))
    rows = (await db.execute(text("""
        SELECT id, name, email, is_active, email_verified_at, created_at, deactivated_reason
        FROM users
        WHERE (:q = '' OR lower(email) LIKE :like OR lower(coalesce(name, '')) LIKE :like)
        ORDER BY created_at DESC LIMIT :limit OFFSET :offset
    """), {"q": q.strip(), "like": f"%{q.strip().lower()}%", "limit": limit, "offset": max(0, offset)})).mappings().all()
    return [dict(row) for row in rows]
