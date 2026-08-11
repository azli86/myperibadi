from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable

from fastapi import HTTPException, Request, Response
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import auth_utils
import email_service
import models
import schemas


async def register_route(
    *,
    user_in: schemas.UserCreate,
    request: Request,
    db: AsyncSession,
    normalize_email: Callable[[str | None], str],
    enforce_auth_rate_limit: Callable[..., Awaitable[None]],
    validate_turnstile_token: Callable[[str | None], Awaitable[None]],
    validate_password_strength: Callable[..., str],
) -> dict[str, str]:
    normalized_email = normalize_email(user_in.email)
    await enforce_auth_rate_limit("register", request, identity=normalized_email)
    await validate_turnstile_token(user_in.turnstile_token)

    result = await db.execute(select(models.User).where(models.User.email == normalized_email))
    if result.scalars().first():
        return {"message": "If the details are valid, you can sign in now."}

    validated_password = validate_password_strength(user_in.password)
    hashed_password = auth_utils.get_password_hash(validated_password)
    db_user = models.User(
        name=user_in.name,
        email=normalized_email,
        phone=user_in.phone,
        password_hash=hashed_password,
        onboarding_done=False,
    )
    db.add(db_user)
    await db.commit()
    return {"message": "If the details are valid, you can sign in now."}


async def login_route(
    *,
    login_data: schemas.LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession,
    normalize_email: Callable[[str | None], str],
    enforce_auth_rate_limit: Callable[..., Awaitable[None]],
    validate_turnstile_token: Callable[[str | None], Awaitable[None]],
    is_mobile_user_agent: Callable[[str | None], bool],
    issue_auth_tokens_for_user: Callable[..., Awaitable[schemas.Token]],
    set_auth_cookies: Callable[[Response, schemas.Token], None],
) -> schemas.Token:
    normalized_email = normalize_email(login_data.email)
    await enforce_auth_rate_limit("login", request, identity=normalized_email)
    await validate_turnstile_token(login_data.turnstile_token)

    result = await db.execute(select(models.User).where(models.User.email == normalized_email))
    user = result.scalars().first()

    if not user or not user.is_active or not auth_utils.verify_password(login_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    session_kind = auth_utils.SESSION_KIND_MOBILE if is_mobile_user_agent(request.headers.get("user-agent")) else None
    token_bundle = await issue_auth_tokens_for_user(
        user,
        db=db,
        session_id=login_data.session_id,
        session_kind=session_kind,
        user_agent=request.headers.get("user-agent"),
    )
    set_auth_cookies(response, token_bundle)
    await db.commit()
    return token_bundle


async def pin_login_route(
    *,
    payload: schemas.PinLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession,
    normalize_email: Callable[[str | None], str],
    enforce_auth_rate_limit: Callable[..., Awaitable[None]],
    validate_turnstile_token: Callable[[str | None], Awaitable[None]],
    validate_pin_value: Callable[[str | None], str],
    is_user_pin_locked: Callable[[models.User], bool],
    record_pin_failed_attempt: Callable[[models.User], bool],
    clear_user_pin_lock: Callable[[models.User], None],
    is_mobile_user_agent: Callable[[str | None], bool],
    issue_auth_tokens_for_user: Callable[..., Awaitable[schemas.Token]],
    set_auth_cookies: Callable[[Response, schemas.Token], None],
    pin_lock_minutes: int,
) -> schemas.Token:
    normalized_email = normalize_email(payload.email)
    await enforce_auth_rate_limit("pin_login", request, identity=normalized_email)
    await validate_turnstile_token(payload.turnstile_token)
    pin = validate_pin_value(payload.pin)

    result = await db.execute(select(models.User).where(models.User.email == normalized_email))
    user = result.scalars().first()

    if not user or not user.is_active or not user.pin_hash:
        raise HTTPException(status_code=401, detail="Invalid email or PIN")

    if is_user_pin_locked(user):
        raise HTTPException(
            status_code=423,
            detail=f"PIN is temporarily locked. Try again in {pin_lock_minutes} minutes.",
        )

    if not auth_utils.verify_password(pin, user.pin_hash):
        record_pin_failed_attempt(user)
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid email or PIN")

    clear_user_pin_lock(user)
    session_kind = auth_utils.SESSION_KIND_MOBILE if is_mobile_user_agent(request.headers.get("user-agent")) else None
    token_bundle = await issue_auth_tokens_for_user(
        user,
        db=db,
        session_id=payload.session_id,
        session_kind=session_kind,
        user_agent=request.headers.get("user-agent"),
    )
    set_auth_cookies(response, token_bundle)
    await db.commit()
    return token_bundle


async def refresh_auth_token_route(
    *,
    payload: schemas.RefreshTokenRequest,
    request: Request,
    response: Response,
    db: AsyncSession,
    enforce_auth_rate_limit: Callable[..., Awaitable[None]],
    auth_refresh_cookie_name: str,
    clear_user_refresh_token: Callable[[models.User], None],
    issue_auth_tokens_for_user: Callable[..., Awaitable[schemas.Token]],
    set_auth_cookies: Callable[[Response, schemas.Token], None],
) -> schemas.Token:
    await enforce_auth_rate_limit("refresh", request)
    refresh_token = payload.refresh_token or request.cookies.get(auth_refresh_cookie_name) or ""
    decoded = auth_utils.decode_refresh_token(refresh_token)
    if not decoded:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    email = decoded.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(models.User).where(models.User.email == email))
    user = result.scalars().first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    decoded_session_id = decoded.get("sid")
    payload_session_id = payload.session_id or decoded_session_id
    session_row = None
    if payload_session_id:
        session_row = (await db.execute(
            select(models.UserAuthSession).where(
                models.UserAuthSession.user_id == user.id,
                models.UserAuthSession.session_id == payload_session_id,
            )
        )).scalar_one_or_none()

    incoming_hash = auth_utils.hash_token(refresh_token)
    expected_hash = session_row.refresh_token_hash if session_row else (user.refresh_token_hash or "")
    if not expected_hash or incoming_hash != expected_hash:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    refresh_token_expires = session_row.refresh_token_expires if session_row else user.refresh_token_expires
    if refresh_token_expires and refresh_token_expires < datetime.utcnow():
        await clear_user_refresh_token(user, db=db, session_id=payload_session_id)
        await db.commit()
        raise HTTPException(status_code=401, detail="Refresh token expired")

    token_bundle = await issue_auth_tokens_for_user(
        user,
        db=db,
        session_id=payload_session_id,
        session_kind=decoded.get("session_kind"),
        user_agent=request.headers.get("user-agent"),
    )
    set_auth_cookies(response, token_bundle)
    await db.commit()
    return token_bundle


async def logout_route(
    *,
    response: Response,
    payload: schemas.LogoutRequest | None,
    current_user: models.User,
    db: AsyncSession,
    clear_user_refresh_token: Callable[..., Awaitable[None]],
    clear_auth_cookies: Callable[[Response], None],
) -> dict[str, str]:
    session_id = payload.session_id if payload else None
    if payload and payload.refresh_token:
        incoming_hash = auth_utils.hash_token(payload.refresh_token)
        session_row = None
        if session_id:
            session_row = (await db.execute(
                select(models.UserAuthSession).where(
                    models.UserAuthSession.user_id == current_user.id,
                    models.UserAuthSession.session_id == session_id,
                )
            )).scalar_one_or_none()
        expected_hash = session_row.refresh_token_hash if session_row else (current_user.refresh_token_hash or "")
        if expected_hash and incoming_hash != expected_hash:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

    await clear_user_refresh_token(current_user, db=db, session_id=session_id)
    await db.commit()
    clear_auth_cookies(response)
    return {"message": "Logged out"}


async def forgot_password_route(
    *,
    req: schemas.ForgotPasswordRequest,
    request: Request,
    db: AsyncSession,
    normalize_email: Callable[[str | None], str],
    enforce_auth_rate_limit: Callable[..., Awaitable[None]],
    validate_turnstile_token: Callable[[str | None], Awaitable[None]],
    hash_reset_token: Callable[[str], str],
) -> dict[str, str]:
    normalized_email = normalize_email(req.email)
    await enforce_auth_rate_limit("forgot_password", request, identity=normalized_email)
    await validate_turnstile_token(req.turnstile_token)

    result = await db.execute(select(models.User).where(models.User.email == normalized_email))
    user = result.scalars().first()

    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token = hash_reset_token(token)
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)

        u_email = user.email
        u_name = user.name
        u_lang = user.language

        await db.commit()
        await email_service.send_reset_password_email(u_email, token, u_name, u_lang)

    return {"message": "If that email is in our system, we've sent a reset link."}


async def reset_password_route(
    *,
    req: schemas.ResetPasswordRequest,
    request: Request,
    db: AsyncSession,
    enforce_auth_rate_limit: Callable[..., Awaitable[None]],
    validate_turnstile_token: Callable[[str | None], Awaitable[None]],
    validate_password_strength: Callable[..., str],
    hash_reset_token: Callable[[str], str],
    clear_user_pin: Callable[[models.User], None],
    clear_user_refresh_token: Callable[..., Awaitable[None]],
) -> dict[str, str]:
    await enforce_auth_rate_limit("reset_password", request)
    await validate_turnstile_token(req.turnstile_token)

    new_password = validate_password_strength(req.new_password, field_label="New password")

    result = await db.execute(
        select(models.User).where(
            or_(
                models.User.reset_token == req.token,
                models.User.reset_token == hash_reset_token(req.token),
            ),
            models.User.reset_token_expires > datetime.utcnow(),
        )
    )
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user.password_hash = auth_utils.get_password_hash(new_password)
    user.reset_token = None
    user.reset_token_expires = None
    if user.deactivated_reason == "manual":
        # Admin-deactivated accounts are not re-activated automatically on reset.
        user.is_active = False
    else:
        # Reset completed proves email ownership -> restore access automatically.
        user.is_active = True
        user.deactivated_at = None
        user.deactivated_reason = None
        user.verification_email_sent_at = None
    clear_user_pin(user)
    await clear_user_refresh_token(user, db=db)
    await db.commit()

    return {"message": "Password reset successfully"}
