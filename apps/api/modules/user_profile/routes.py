from __future__ import annotations

from datetime import datetime, timedelta
from typing import Awaitable, Callable

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import auth_utils
import email_service
import models
import schemas


async def get_my_profile_route(
    *,
    current_user: models.User,
) -> models.User:
    return current_user


async def update_my_profile_route(
    *,
    user_in: schemas.UserUpdate,
    db: AsyncSession,
    current_user: models.User,
    normalize_language: Callable[[str | None], str],
    normalize_theme_mode: Callable[[str | None], str],
    normalize_bot_personality: Callable[[str | None], str | None],
) -> models.User:
    if user_in.name is not None:
        current_user.name = user_in.name
    if user_in.phone is not None:
        current_user.phone = user_in.phone
    if user_in.language is not None:
        current_user.language = normalize_language(user_in.language)
    if user_in.show_hero_amounts is not None:
        current_user.show_hero_amounts = user_in.show_hero_amounts
    if user_in.theme_mode is not None:
        current_user.theme_mode = normalize_theme_mode(user_in.theme_mode)
    if user_in.bot_personality is not None:
        current_user.bot_personality = normalize_bot_personality(user_in.bot_personality)
    if user_in.cycle_start_day is not None:
        day = int(user_in.cycle_start_day)
        if day < 1 or day > 28:
            raise HTTPException(status_code=400, detail="Cycle reset day must be between 1 and 28.")
        current_user.cycle_start_day = day
    if user_in.cycle_mode is not None:
        mode = (user_in.cycle_mode or "day").strip().lower()
        if mode not in ("day", "category"):
            raise HTTPException(status_code=400, detail="cycle_mode must be 'day' or 'category'.")
        current_user.cycle_mode = mode

    await db.commit()
    await db.refresh(current_user)
    return current_user


async def request_my_email_change_route(
    *,
    payload: schemas.EmailChangeRequest,
    db: AsyncSession,
    current_user: models.User,
    normalize_email: Callable[[str | None], str],
    generate_email_change_code: Callable[[], str],
    hash_email_change_token: Callable[[str], str],
) -> dict[str, str]:
    normalized_new_email = normalize_email(payload.new_email)
    if not normalized_new_email:
        raise HTTPException(status_code=400, detail="New email is required")

    if normalized_new_email == normalize_email(current_user.email):
        raise HTTPException(status_code=400, detail="New email must be different from current email")

    if not auth_utils.verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    existing_user_result = await db.execute(
        select(models.User).where(
            models.User.email == normalized_new_email,
            models.User.id != current_user.id,
        )
    )
    if existing_user_result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already in use")

    verification_code = generate_email_change_code()
    current_user.pending_email = normalized_new_email
    current_user.email_change_token = hash_email_change_token(verification_code)
    current_user.email_change_token_expires = datetime.utcnow() + timedelta(minutes=15)

    await db.commit()
    await email_service.send_email_change_verification_email(
        normalized_new_email,
        verification_code,
        current_user.name,
        current_user.language,
    )
    return {"message": "Verification code sent to your new email."}


async def confirm_my_email_change_route(
    *,
    payload: schemas.EmailChangeConfirmRequest,
    request: Request,
    token: str | None,
    db: AsyncSession,
    current_user: models.User,
    normalize_email: Callable[[str | None], str],
    hash_email_change_token: Callable[[str], str],
    issue_auth_tokens_for_user: Callable[..., Awaitable[schemas.Token]],
    auth_access_cookie_name: str,
) -> schemas.Token:
    verification_code = (payload.code or "").strip()
    if not verification_code:
        raise HTTPException(status_code=400, detail="Verification code is required")
    if not verification_code.isdigit() or len(verification_code) != 6:
        raise HTTPException(status_code=400, detail="Verification code must be exactly 6 digits")

    expires_at = current_user.email_change_token_expires
    if (
        not current_user.pending_email
        or not current_user.email_change_token
        or not expires_at
        or expires_at < datetime.utcnow()
    ):
        raise HTTPException(status_code=400, detail="Verification code is invalid or expired")

    if hash_email_change_token(verification_code) != current_user.email_change_token:
        raise HTTPException(status_code=400, detail="Verification code is invalid or expired")

    normalized_pending_email = normalize_email(current_user.pending_email)
    existing_user_result = await db.execute(
        select(models.User).where(
            models.User.email == normalized_pending_email,
            models.User.id != current_user.id,
        )
    )
    if existing_user_result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already in use")

    current_user.email = normalized_pending_email
    current_user.pending_email = None
    current_user.email_change_token = None
    current_user.email_change_token_expires = None

    raw_token = (token or "").strip() or (request.cookies.get(auth_access_cookie_name) or "").strip()
    payload_data = auth_utils.decode_access_token(raw_token) or {}
    token_bundle = await issue_auth_tokens_for_user(
        current_user,
        db=db,
        session_id=payload_data.get("sid"),
        session_kind=payload_data.get("session_kind"),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    return token_bundle


async def get_my_pin_status_route(
    *,
    current_user: models.User,
) -> schemas.PinStatusResponse:
    return schemas.PinStatusResponse(
        enabled=bool(current_user.pin_hash),
        failed_attempts=int(current_user.pin_failed_attempts or 0),
        locked_until=current_user.pin_locked_until,
    )


async def verify_my_pin_route(
    *,
    payload: schemas.PinVerifyRequest,
    request: Request,
    db: AsyncSession,
    current_user: models.User,
    enforce_auth_rate_limit: Callable[..., Awaitable[None]],
    normalize_email: Callable[[str | None], str],
    validate_pin_value: Callable[..., str],
    is_user_pin_locked: Callable[[models.User], bool],
    clear_user_pin_lock: Callable[[models.User], None],
    pin_lock_minutes: int,
) -> dict[str, str]:
    await enforce_auth_rate_limit("pin_login", request, identity=normalize_email(current_user.email))
    pin = validate_pin_value(payload.pin)

    if not current_user.pin_hash:
        raise HTTPException(status_code=400, detail="PIN is not set")

    if is_user_pin_locked(current_user):
        raise HTTPException(
            status_code=423,
            detail=f"PIN is temporarily locked. Try again in {pin_lock_minutes} minutes.",
        )

    if not auth_utils.verify_password(pin, current_user.pin_hash):
        raise HTTPException(status_code=401, detail="Invalid PIN")

    clear_user_pin_lock(current_user)
    await db.commit()
    return {"message": "PIN verified"}


async def set_my_pin_route(
    *,
    payload: schemas.PinSetRequest,
    db: AsyncSession,
    current_user: models.User,
    validate_pin_value: Callable[..., str],
    clear_user_pin_lock: Callable[[models.User], None],
) -> dict[str, str]:
    pin = validate_pin_value(payload.pin)

    if not auth_utils.verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.pin_hash = auth_utils.get_password_hash(pin)
    current_user.pin_updated_at = datetime.utcnow()
    clear_user_pin_lock(current_user)
    await db.commit()
    return {"message": "PIN updated successfully"}


async def delete_my_pin_route(
    *,
    payload: schemas.PinDeleteRequest,
    db: AsyncSession,
    current_user: models.User,
    clear_user_pin: Callable[[models.User], None],
) -> dict[str, str]:
    if not auth_utils.verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    clear_user_pin(current_user)
    await db.commit()
    return {"message": "PIN removed successfully"}


async def change_my_password_route(
    *,
    payload: schemas.ChangePasswordRequest,
    db: AsyncSession,
    current_user: models.User,
    validate_password_strength: Callable[..., str],
    clear_user_pin: Callable[[models.User], None],
    clear_user_refresh_token: Callable[..., Awaitable[None]],
) -> dict[str, str]:
    new_password = validate_password_strength(payload.new_password, field_label="New password")

    if not auth_utils.verify_password(payload.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if payload.old_password == new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    current_user.password_hash = auth_utils.get_password_hash(new_password)
    clear_user_pin(current_user)
    await clear_user_refresh_token(current_user, db=db)
    await db.commit()
    return {"message": "Password changed successfully"}
