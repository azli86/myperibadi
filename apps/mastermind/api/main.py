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


async def _ensure_audit_table(db: AsyncSession):
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS mastermind_audit_logs (
            id BIGSERIAL PRIMARY KEY,
            actor_user_id VARCHAR(16),
            actor_email VARCHAR(190),
            action VARCHAR(64),
            target_type VARCHAR(64),
            target_id VARCHAR(190),
            detail TEXT,
            created_at TIMESTAMP DEFAULT now()
        )
    """))
    await db.commit()


async def _audit(db: AsyncSession, actor: dict, action: str, target_type: str = "", target_id: str = "", detail: str = ""):
    await db.execute(text("""
        INSERT INTO mastermind_audit_logs (actor_user_id, actor_email, action, target_type, target_id, detail)
        VALUES (:a, :e, :action, :tt, :ti, :d)
    """), {"a": actor["id"], "e": actor["email"], "action": action, "tt": target_type, "ti": target_id, "d": detail})
    await db.commit()


@app.on_event("startup")
async def _startup():
    async with SessionLocal() as db:
        try:
            await _ensure_audit_table(db)
        except Exception as e:  # noqa: BLE001
            logging.warning("Failed to ensure mastermind_audit_logs: %s", e)

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

def mask_name(value):
    """Mask a name/email-local for privacy, e.g. azlijahroni -> az****ni."""
    if not value:
        return "—"
    s = str(value)
    if len(s) <= 4:
        return s[0] + "****"
    return s[:2] + "****" + s[-2:]

def mask_email(value):
    """Mask an email local-part, keep domain, e.g. azlijahroni@x.com -> az****ni@x.com."""
    if not value:
        return "—"
    s = str(value)
    if "@" in s:
        local, _, domain = s.partition("@")
        return mask_name(local) + "@" + domain
    return mask_name(s)

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
          (SELECT count(*) FROM users WHERE email_verified_at IS NOT NULL) active_users,
          (SELECT count(*) FROM households) households,
          (SELECT count(*) FROM transactions) transactions,
          (SELECT count(*) FROM transactions WHERE created_at >= now() - interval '30 days') transactions_30d,
          (SELECT count(*) FROM wallets WHERE status = 'active') active_wallets,
          (SELECT count(*) FROM access_logs WHERE created_at >= now() - interval '24 hours') requests_24h,
          (SELECT count(*) FROM users WHERE created_at >= now() - interval '7 days') new_users_7d,
          (SELECT count(*) FROM user_auth_sessions WHERE created_at >= now() - interval '24 hours') active_sessions_24h
    """))).mappings().one()
    totals = (await db.execute(text("""
        SELECT
          coalesce(sum(amount) FILTER (WHERE type = 'income'), 0) AS total_income,
          coalesce(sum(amount) FILTER (WHERE type = 'expense'), 0) AS total_expense,
          coalesce(sum(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS total_net,
          coalesce(sum(abs(amount)), 0) AS total_amount
        FROM transactions
    """))).mappings().one()
    return {
        **{key: scalar(values, key) for key in values.keys()},
        "total_income": float(totals["total_income"] or 0),
        "total_expense": float(totals["total_expense"] or 0),
        "total_net": float(totals["total_net"] or 0),
        "total_amount": float(totals["total_amount"] or 0),
    }

@app.get("/stats/transactions", dependencies=[Depends(admin)])
async def stats_transactions(months: int = 6, db: AsyncSession = Depends(db_session)):
    months = max(1, min(months, 12))
    rows = (await db.execute(text("""
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
               count(*) AS txn_count,
               count(*) FILTER (WHERE type = 'expense') AS expenses,
               count(*) FILTER (WHERE type = 'income') AS income
        FROM transactions
        WHERE created_at >= now() - make_interval(months => :months)
        GROUP BY 1 ORDER BY 1
    """), {"months": months})).mappings().all()
    return [dict(r) for r in rows]

@app.get("/stats/users-growth", dependencies=[Depends(admin)])
async def stats_users_growth(months: int = 6, db: AsyncSession = Depends(db_session)):
    months = max(1, min(months, 12))
    rows = (await db.execute(text("""
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
               count(*) AS new_users
        FROM users
        WHERE created_at >= now() - make_interval(months => :months)
        GROUP BY 1 ORDER BY 1
    """), {"months": months})).mappings().all()
    return [dict(r) for r in rows]

@app.get("/stats/wallets", dependencies=[Depends(admin)])
async def stats_wallets(limit: int = 15, db: AsyncSession = Depends(db_session)):
    limit = max(1, min(limit, 50))
    rows = (await db.execute(text("""
        SELECT w.name, w.type, w.currency, w.status, w.is_saving, u.email AS owner,
               (SELECT count(*) FROM transactions t WHERE t.wallet_id = w.id) txn_count
        FROM wallets w LEFT JOIN users u ON u.id = w.owner_user_id
        ORDER BY w.id DESC LIMIT :limit
    """), {"limit": limit})).mappings().all()
    return [dict(r) for r in rows]

@app.get("/sessions", dependencies=[Depends(admin)])
async def sessions(limit: int = 50, db: AsyncSession = Depends(db_session)):
    limit = max(1, min(limit, 100))
    rows = (await db.execute(text("""
        SELECT s.id, s.user_id, u.email, u.name, s.session_kind, s.user_agent, s.created_at, s.last_used_at
        FROM user_auth_sessions s LEFT JOIN users u ON u.id = s.user_id
        ORDER BY s.last_used_at DESC NULLS LAST LIMIT :limit
    """), {"limit": limit})).mappings().all()
    return [dict(r) for r in rows]

@app.get("/system-status", dependencies=[Depends(admin)])
async def system_status(db: AsyncSession = Depends(db_session)):
    db_ok = True
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    sizes = (await db.execute(text("""
        SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
               (SELECT count(*) FROM attachments) attachments,
               (SELECT count(*) FROM access_logs WHERE created_at >= now() - interval '24 hours') requests_24h,
               (SELECT count(*) FROM chat_messages) chat_messages,
               (SELECT count(*) FROM inventory_items) inventory_items
    """))).mappings().one()
    return {"db_ok": db_ok, **dict(sizes)}

@app.get("/activity", dependencies=[Depends(admin)])
async def activity(kind: str = "all", limit: int = 40, db: AsyncSession = Depends(db_session)):
    """Recent activity feed. kind: all | login | api | audit"""
    limit = max(1, min(limit, 100))
    out = []
    if kind in ("all", "login"):
        rows = (await db.execute(text("""
            SELECT 'login' AS kind, l.created_at AS at, l.email, l.status AS detail, l.ip_address,
                   l.device_label, u.name AS actor
            FROM login_logs l LEFT JOIN users u ON u.id = l.user_id
            ORDER BY l.created_at DESC LIMIT :limit
        """), {"limit": limit})).mappings().all()
        out += [dict(r) for r in rows]
    if kind in ("all", "api"):
        rows = (await db.execute(text("""
            SELECT 'api' AS kind, a.created_at AS at, coalesce(u.email, 'anonymous') AS email,
                   a.method || ' ' || a.path AS detail, a.ip_address, a.user_agent AS device_label,
                   u.name AS actor, a.status_code
            FROM access_logs a LEFT JOIN users u ON u.id = a.user_id
            ORDER BY a.created_at DESC LIMIT :limit
        """), {"limit": limit})).mappings().all()
        out += [dict(r) for r in rows]
    if kind in ("all", "audit"):
        rows = (await db.execute(text("""
            SELECT 'audit' AS kind, a.created_at AS at, a.actor_email AS email,
                   a.action AS detail, '' AS ip_address, '' AS device_label,
                   a.actor_email AS actor, a.target_type || ':' || a.target_id AS status_code
            FROM mastermind_audit_logs a
            ORDER BY a.created_at DESC LIMIT :limit
        """), {"limit": limit})).mappings().all()
        out += [dict(r) for r in rows]
    out.sort(key=lambda r: r["at"], reverse=True)
    for item in out:
        item["actor"] = mask_name(item.get("actor"))
        item["email"] = mask_email(item.get("email"))
    return out[:limit]

@app.get("/transactions/recent", dependencies=[Depends(admin)])
async def transactions_recent(limit: int = 40, db: AsyncSession = Depends(db_session)):
    """Most recent transactions across the system."""
    limit = max(1, min(limit, 100))
    rows = (await db.execute(text("""
        SELECT t.id, t.reference_id, t.type, t.amount, t.vendor_or_source, t.txn_date, t.created_at,
               t.source_channel, t.household_id, u.email AS user_email, u.name AS user_name,
               w.name AS wallet_name, c.name AS category_name
        FROM transactions t
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN wallets w ON w.id = t.wallet_id
        LEFT JOIN categories c ON c.id = t.category_id
        ORDER BY t.created_at DESC LIMIT :limit
    """), {"limit": limit})).mappings().all()
    result = [dict(r) for r in rows]
    for item in result:
        item["user_name"] = mask_name(item.get("user_name"))
        item["user_email"] = mask_email(item.get("user_email"))
    return result

@app.get("/live/api", dependencies=[Depends(admin)])
async def live_api(limit: int = 25, db: AsyncSession = Depends(db_session)):
    """Live user activity feed: transactions + logins + new signups."""
    limit = max(1, min(limit, 60))
    rows = (await db.execute(text("""
        SELECT kind, created_at, detail1, detail2, amount, user_name, user_email, status, category_name, household_name
        FROM (
          SELECT 'TXN' AS kind, t.created_at, t.type AS detail1,
                 coalesce(t.vendor_or_source,'') AS detail2,
                 t.amount::float AS amount,
                 coalesce(u.name,'') AS user_name, coalesce(u.email,'') AS user_email,
                 '' AS status, coalesce(c.name,'') AS category_name,
                 coalesce(h.name,'') AS household_name
          FROM transactions t LEFT JOIN users u ON u.id = t.user_id
                            LEFT JOIN categories c ON c.id = t.category_id
                            LEFT JOIN households h ON h.id = t.household_id
          UNION ALL
          SELECT 'LOGIN' AS kind, l.created_at, l.status AS detail1,
                 coalesce(l.email,'') AS detail2, NULL AS amount,
                 coalesce(u.name,'') AS user_name, coalesce(l.email,'') AS user_email,
                 l.status AS status, '' AS category_name, '' AS household_name
          FROM login_logs l LEFT JOIN users u ON u.id = l.user_id
          UNION ALL
          SELECT 'SIGNUP' AS kind, u.created_at, '' AS detail1,
                 coalesce(u.email,'') AS detail2, NULL AS amount,
                 coalesce(u.name,'') AS user_name, coalesce(u.email,'') AS user_email,
                 '' AS status, '' AS category_name, '' AS household_name
          FROM users u WHERE u.created_at >= now() - interval '7 days'
          UNION ALL
          SELECT 'UPDATE' AS kind, u.updated_at, 'profil' AS detail1,
                 coalesce(u.email,'') AS detail2, NULL AS amount,
                 coalesce(u.name,'') AS user_name, coalesce(u.email,'') AS user_email,
                 '' AS status, '' AS category_name, '' AS household_name
          FROM users u
          WHERE u.updated_at > u.created_at AND u.updated_at >= now() - interval '7 days'
          UNION ALL
          SELECT 'WALLET' AS kind, w.created_at, coalesce(w.name,'') AS detail1,
                 coalesce(w.label,'') AS detail2, NULL AS amount,
                 coalesce(u.name,'') AS user_name, coalesce(u.email,'') AS user_email,
                 '' AS status, '' AS category_name, coalesce(h.name,'') AS household_name
          FROM wallets w
          LEFT JOIN users u ON u.id = w.owner_user_id
          LEFT JOIN households h ON h.id = w.household_id
          WHERE w.created_at >= now() - interval '7 days'
          UNION ALL
          SELECT 'ITEM' AS kind, i.created_at, coalesce(i.name,'') AS detail1,
                 coalesce(i.category,'') AS detail2, NULL AS amount,
                 coalesce(u.name,'') AS user_name, coalesce(u.email,'') AS user_email,
                 '' AS status, '' AS category_name, '' AS household_name
          FROM inventory_items i LEFT JOIN users u ON u.id = i.user_id
          WHERE i.deleted_at IS NULL AND i.created_at >= now() - interval '7 days'
          UNION ALL
          SELECT 'HOUSE' AS kind, h.created_at, coalesce(h.name,'') AS detail1,
                 'household' AS detail2, NULL AS amount,
                 coalesce(u.name,'') AS user_name, coalesce(u.email,'') AS user_email,
                 '' AS status, '' AS category_name, '' AS household_name
          FROM households h LEFT JOIN users u ON u.id = h.owner_user_id
          WHERE h.created_at >= now() - interval '7 days'
          UNION ALL
          SELECT 'LOAN' AS kind, l.created_at, coalesce(l.name,'') AS detail1,
                 coalesce(l.record_kind,'') AS detail2, NULL AS amount,
                 coalesce(u.name,'') AS user_name, coalesce(u.email,'') AS user_email,
                 '' AS status, '' AS category_name, '' AS household_name
          FROM loans l LEFT JOIN users u ON u.id = l.user_id
          WHERE l.created_at >= now() - interval '7 days'
          UNION ALL
          SELECT 'JOIN' AS kind, hm.joined_at, coalesce(h.name,'') AS detail1,
                 coalesce(hm.role,'') AS detail2, NULL AS amount,
                 coalesce(u.name,'') AS user_name, coalesce(u.email,'') AS user_email,
                 '' AS status, '' AS category_name, '' AS household_name
          FROM household_members hm
          LEFT JOIN users u ON u.id = hm.user_id
          LEFT JOIN households h ON h.id = hm.household_id
          WHERE hm.joined_at >= now() - interval '7 days'
        ) q
        ORDER BY created_at DESC LIMIT :limit
    """), {"limit": limit})).mappings().all()
    result = [dict(r) for r in rows]
    for item in result:
        item["user_name"] = mask_name(item.get("user_name"))
        item["user_email"] = mask_email(item.get("user_email"))
    return result

@app.get("/users", dependencies=[Depends(admin)])
async def users(q: str = "", limit: int = 50, offset: int = 0, db: AsyncSession = Depends(db_session)):
    limit = max(1, min(limit, 100))
    like = f"%{q.strip().lower()}%"
    q_cond = "(:q = '' OR lower(email) LIKE :like OR lower(coalesce(name, '')) LIKE :like)"
    total = (await db.execute(text(f"SELECT count(*) FROM users WHERE {q_cond}"), {"q": q.strip(), "like": like})).scalar_one()
    rows = (await db.execute(text(f"""
        SELECT id, name, email, is_active, email_verified_at, created_at, deactivated_reason, auth_provider, phone
        FROM users
        WHERE {q_cond}
        ORDER BY created_at DESC LIMIT :limit OFFSET :offset
    """), {"q": q.strip(), "like": like, "limit": limit, "offset": max(0, offset)})).mappings().all()
    return {"users": [dict(row) for row in rows], "total": total, "limit": limit, "offset": max(0, offset)}

@app.get("/users/{user_id}", dependencies=[Depends(admin)])
async def user_detail(user_id: str, db: AsyncSession = Depends(db_session)):
    user = (await db.execute(text("""
        SELECT id, name, email, phone, is_active, is_admin, auth_provider, email_verified_at,
               created_at, deactivated_reason, deactivated_at, language
        FROM users WHERE id = :id
    """), {"id": user_id})).mappings().first()
    if not user:
        raise HTTPException(404, "User not found")
    user = dict(user)
    memberships = (await db.execute(text("""
        SELECT h.id, h.name, hm.role, hm.status, hm.joined_at
        FROM household_members hm
        JOIN households h ON h.id = hm.household_id
        WHERE hm.user_id = :uid ORDER BY h.id
    """), {"uid": user_id})).mappings().all()
    stats = (await db.execute(text("""
        SELECT
          (SELECT count(*) FROM transactions WHERE user_id = :uid) txn_count,
          (SELECT count(*) FROM wallets WHERE owner_user_id = :uid) wallet_count,
          (SELECT count(*) FROM inventory_items WHERE user_id = :uid) inventory_count
    """), {"uid": user_id})).mappings().one()
    user["memberships"] = [dict(r) for r in memberships]
    user["stats"] = dict(stats)
    return user

@app.get("/households", dependencies=[Depends(admin)])
async def households(q: str = "", limit: int = 50, offset: int = 0, db: AsyncSession = Depends(db_session)):
    limit = max(1, min(limit, 100))
    rows = (await db.execute(text("""
        SELECT h.id, h.name, h.status, h.created_at, h.owner_user_id, u.name AS owner_name,
               (SELECT count(*) FROM household_members hm WHERE hm.household_id = h.id) member_count
        FROM households h
        LEFT JOIN users u ON u.id = h.owner_user_id
        WHERE (:q = '' OR lower(h.name) LIKE :like)
        ORDER BY h.id DESC LIMIT :limit OFFSET :offset
    """), {"q": q.strip(), "like": f"%{q.strip().lower()}%", "limit": limit, "offset": max(0, offset)})).mappings().all()
    return [dict(row) for row in rows]

@app.get("/households/{household_id}", dependencies=[Depends(admin)])
async def household_detail(household_id: int, db: AsyncSession = Depends(db_session)):
    h = (await db.execute(text("""
        SELECT h.*, u.name AS owner_name
        FROM households h LEFT JOIN users u ON u.id = h.owner_user_id WHERE h.id = :id
    """), {"id": household_id})).mappings().first()
    if not h:
        raise HTTPException(404, "Household not found")
    members = (await db.execute(text("""
        SELECT u.id, u.name, u.email, u.is_active, hm.role, hm.status, hm.joined_at
        FROM household_members hm JOIN users u ON u.id = hm.user_id
        WHERE hm.household_id = :id ORDER BY hm.joined_at
    """), {"id": household_id})).mappings().all()
    return {"household": dict(h), "members": [dict(m) for m in members]}

@app.get("/login-logs", dependencies=[Depends(admin)])
async def login_logs(limit: int = 50, offset: int = 0, db: AsyncSession = Depends(db_session)):
    limit = max(1, min(limit, 100))
    rows = (await db.execute(text("""
        SELECT l.id, l.email, l.status, l.ip_address, l.device_label, l.created_at, u.name
        FROM login_logs l LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.id DESC LIMIT :limit OFFSET :offset
    """), {"limit": limit, "offset": max(0, offset)})).mappings().all()
    return [dict(row) for row in rows]

@app.get("/audit-logs", dependencies=[Depends(admin)])
async def audit_logs(limit: int = 50, offset: int = 0, db: AsyncSession = Depends(db_session)):
    limit = max(1, min(limit, 100))
    rows = (await db.execute(text("""
        SELECT * FROM mastermind_audit_logs ORDER BY id DESC LIMIT :limit OFFSET :offset
    """), {"limit": limit, "offset": max(0, offset)})).mappings().all()
    return [dict(row) for row in rows]

@app.post("/users/{user_id}/deactivate")
async def user_deactivate(user_id: str, actor: dict = Depends(admin), db: AsyncSession = Depends(db_session)):
    if user_id == actor["id"]:
        raise HTTPException(400, "Cannot deactivate your own admin account")
    user = (await db.execute(text("SELECT id, name, email FROM users WHERE id = :id"), {"id": user_id})).mappings().first()
    if not user:
        raise HTTPException(404, "User not found")
    if not user["email"].endswith("@invalid.local"):
        await db.execute(text("UPDATE users SET is_active = false, deactivated_reason = 'manual', deactivated_at = now() WHERE id = :id"), {"id": user_id})
        await _audit(db, actor, "deactivate", "user", user_id, user["email"])
    return {"ok": True, "deactivated": user_id}

@app.post("/users/{user_id}/reactivate")
async def user_reactivate(user_id: str, actor: dict = Depends(admin), db: AsyncSession = Depends(db_session)):
    user = (await db.execute(text("SELECT id, name, email FROM users WHERE id = :id"), {"id": user_id})).mappings().first()
    if not user:
        raise HTTPException(404, "User not found")
    await db.execute(text("UPDATE users SET is_active = true, deactivated_reason = NULL, deactivated_at = NULL WHERE id = :id"), {"id": user_id})
    await _audit(db, actor, "reactivate", "user", user_id, user["email"])
    return {"ok": True, "reactivated": user_id}
