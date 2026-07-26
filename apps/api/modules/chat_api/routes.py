from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Awaitable, Callable

from fastapi import HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import models
import schemas
import storage_service


async def create_chat_receipt_upload_route(
    *,
    payload: Any,
    current_user: models.User,
    receipt_direct_upload_max_bytes: int,
    receipt_direct_upload_expires_seconds: int,
) -> dict:
    if payload.size_bytes <= 0:
        raise HTTPException(status_code=400, detail="File is empty.")
    if payload.size_bytes > receipt_direct_upload_max_bytes:
        raise HTTPException(status_code=400, detail="File is too large.")

    try:
        mime_type, extension = storage_service.validate_receipt_metadata(payload.file_name, payload.content_type)
    except storage_service.StorageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if mime_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, and WEBP receipt photos are allowed.")

    object_key = storage_service.build_direct_receipt_object_key(current_user.id, payload.file_name, extension)

    try:
        upload_url = await asyncio.to_thread(
            storage_service.create_presigned_receipt_upload_url,
            object_key,
            mime_type,
            receipt_direct_upload_expires_seconds,
        )
    except storage_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except storage_service.StorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {
        "upload_url": upload_url,
        "object_key": object_key,
        "content_type": mime_type,
        "file_name": Path(payload.file_name).name or f"receipt{extension}",
        "size_bytes": payload.size_bytes,
        "expires_in": receipt_direct_upload_expires_seconds,
    }


async def send_web_chat_message_route(
    *,
    request: Request,
    text: str,
    file: UploadFile | None,
    direct_upload_key: str | None,
    direct_upload_file_name: str | None,
    direct_upload_mime_type: str | None,
    direct_upload_size_bytes: int | None,
    latitude: float | None,
    longitude: float | None,
    location_name: str | None,
    target_txn_ref: str | None = None,
    current_user: models.User,
    db: AsyncSession,
    receipt_direct_upload_max_bytes: int,
    sanitize_input: Callable[[str], str],
    process_bot_input: Callable[..., Awaitable[dict]],
    delete_storage_object_safe: Callable[[str], Awaitable[None]],
    find_recent_user_attachment: Callable[..., Awaitable[models.Attachment | None]],
    persist_chat_message: Callable[..., Awaitable[models.ChatMessage]],
    serialize_chat_message: Callable[..., schemas.ChatMessageResponse],
) -> dict:
    media_payload: bytes | None = None
    media_mime_type: str | None = None
    media_file_name: str | None = None
    media_object_key: str | None = None
    media_size_bytes: int | None = None
    request_started_at = datetime.utcnow()

    direct_upload_key = (direct_upload_key or "").strip() or None
    if file and direct_upload_key:
        raise HTTPException(status_code=400, detail="Send either file or direct upload metadata, not both.")

    if file:
        media_payload = await file.read()
        media_mime_type = file.content_type
        media_file_name = file.filename
        if media_payload is not None and len(media_payload) == 0:
            media_payload = None

    if direct_upload_key:
        expected_prefix = f"receipts/{current_user.id}/"
        if not direct_upload_key.startswith(expected_prefix) or "/direct/" not in direct_upload_key:
            raise HTTPException(status_code=400, detail="Invalid direct upload key.")

        try:
            expected_mime, _ = storage_service.validate_receipt_metadata(direct_upload_file_name, direct_upload_mime_type)
            if expected_mime not in {"image/jpeg", "image/png", "image/webp"}:
                raise storage_service.StorageValidationError("Only JPG, PNG, and WEBP receipt photos are allowed.")
            media_size_bytes, media_mime_type = await asyncio.to_thread(
                storage_service.validate_uploaded_receipt_object,
                direct_upload_key,
                expected_mime,
                direct_upload_size_bytes,
                receipt_direct_upload_max_bytes,
            )
        except storage_service.StorageValidationError as exc:
            await delete_storage_object_safe(direct_upload_key)
            raise HTTPException(status_code=400, detail=str(exc))
        except storage_service.StorageError as exc:
            await delete_storage_object_safe(direct_upload_key)
            raise HTTPException(status_code=400, detail=str(exc))

        media_object_key = direct_upload_key
        media_file_name = Path(direct_upload_file_name or "receipt").name

    text = (text or "").strip()
    if len(text) > 1000:
        raise HTTPException(status_code=400, detail="Message too long. Maximum 1000 characters allowed.")

    text = sanitize_input(text)

    if not text and not media_payload and not media_object_key and latitude is None:
        raise HTTPException(status_code=400, detail="Message text, file or location is required.")

    try:
        user_id = current_user.id
        user_language = current_user.language
        phone = (current_user.phone or current_user.email or user_id).strip()
        # Web bubble attach only. WhatsApp webhook still supplies its own ref.
        resolved_target_txn_ref = (target_txn_ref or "").strip() or None
        bot_result = await process_bot_input(
            db,
            user_id=user_id,
            phone=phone,
            text=text,
            media_payload=media_payload,
            media_mime_type=media_mime_type,
            media_file_name=media_file_name,
            media_object_key=media_object_key,
            media_size_bytes=media_size_bytes,
            latitude=latitude,
            longitude=longitude,
            location_name=location_name,
            target_txn_ref=resolved_target_txn_ref,
            source_channel="chat",
        )
        attachment = None
        if media_payload or media_object_key:
            search_since = request_started_at - timedelta(seconds=2)
            attachment = await find_recent_user_attachment(
                db,
                user_id=user_id,
                since=search_since,
                file_name=media_file_name,
                size_bytes=len(media_payload) if media_payload else media_size_bytes,
            )

        user_text = text or ("[Receipt uploaded]" if user_language == "EN" else "[Resit dimuat naik]")
        user_message = await persist_chat_message(
            db,
            user_id=user_id,
            role="user",
            text=user_text,
            source_channel="chat",
            attachment=attachment,
            file_name=Path(media_file_name).name if media_file_name else None,
            mime_type=media_mime_type,
            size_bytes=len(media_payload) if media_payload else media_size_bytes,
        )

        reply_text = bot_result.get("reply")
        bot_message = None
        if reply_text:
            bot_message = await persist_chat_message(
                db,
                user_id=user_id,
                role="bot",
                text=reply_text,
                source_channel="chat",
            )

        return {
            "reply": reply_text,
            "messages": [
                serialize_chat_message(
                    message,
                    request,
                    attachment_override=attachment if message is user_message else None,
                ).model_dump()
                for message in [user_message, bot_message]
                if message is not None
            ],
        }
    except Exception as exc:
        import traceback

        print(f"🔥 CHAT FATAL ERROR: {str(exc)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def get_web_chat_messages_route(
    *,
    request: Request,
    current_user: models.User,
    db: AsyncSession,
    serialize_chat_message: Callable[..., schemas.ChatMessageResponse],
) -> list[schemas.ChatMessageResponse]:
    result = await db.execute(
        select(models.ChatMessage)
        .options(selectinload(models.ChatMessage.attachment))
        .where(
            models.ChatMessage.user_id == current_user.id,
            models.ChatMessage.source_channel == "chat",
        )
        .order_by(models.ChatMessage.created_at.asc(), models.ChatMessage.id.asc())
    )
    messages = result.scalars().all()
    return [serialize_chat_message(message, request) for message in messages]
