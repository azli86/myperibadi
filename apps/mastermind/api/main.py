import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

load_dotenv()

SECRET = os.environ.get("MASTERMIND_SECRET_KEY", "")
ADMIN_EMAIL = os.environ.get("MASTERMIND_ADMIN_EMAIL", "").strip().lower()
ADMIN_PASSWORD_HASH = os.environ.get("MASTERMIND_ADMIN_PASSWORD_SHA256", "")
if not SECRET or not ADMIN_EMAIL or not ADMIN_PASSWORD_HASH:
    raise RuntimeError("MASTERMIND_SECRET_KEY, MASTERMIND_ADMIN_EMAIL and MASTERMIND_ADMIN_PASSWORD_SHA256 are required")

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

async def db_session():
    async with SessionLocal() as db:
        yield db

async def admin(token: Annotated[str | None, Cookie(alias=COOKIE)] = None):
    try:
        payload = jwt.decode(token or "", SECRET, algorithms=["HS256"])
        if payload.get("sub") != ADMIN_EMAIL or payload.get("scope") != "mastermind":
            raise ValueError
        return payload
    except (JWTError, ValueError):
        raise HTTPException(401, "Authentication required")

def scalar(row, key):
    return int(row.get(key) or 0)

@app.get("/health")
async def health():
    return {"ok": True, "service": "mastermind-api"}

@app.post("/auth/login")
async def login(data: Login, response: Response):
    supplied = hashlib.sha256(data.password.encode()).hexdigest()
    if data.email.lower() != ADMIN_EMAIL or not hmac.compare_digest(supplied, ADMIN_PASSWORD_HASH):
        raise HTTPException(401, "Invalid credentials")
    token = jwt.encode({"sub": ADMIN_EMAIL, "scope": "mastermind", "exp": datetime.now(timezone.utc) + timedelta(hours=8)}, SECRET, algorithm="HS256")
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
