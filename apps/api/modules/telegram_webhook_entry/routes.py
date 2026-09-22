from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable

from fastapi import HTTPException, Request


def telegram_should_show_processing_before_handle_route(
    *,
    payload: Any,
    telegram_update_has_media: Callable[[Any], bool],
) -> bool:
    return telegram_update_has_media(payload)


async def process_telegram_webhook_payload_background_route(
    *,
    payload_data: dict[str, Any],
    payload_model: type,
    telegram_should_show_processing_before_handle: Callable[[Any], bool],
    send_telegram_message: Callable[..., Awaitable[dict[str, Any] | None]],
    build_telegram_processing_text: Callable[[Any], str],
    session_factory: Callable[[], Any],
    handle_telegram_webhook_payload: Callable[[Any, Any], Awaitable[dict[str, Any]]],
    delete_telegram_message: Callable[[str, int], Awaitable[dict[str, Any] | None]],
) -> None:
    processing_chat_id = ""
    processing_message_id: int | None = None
    try:
        payload = payload_model(**payload_data)
        processing_chat_id = str(((payload.message or {}).get("chat") or {}).get("id") or "").strip()
        if processing_chat_id and telegram_should_show_processing_before_handle(payload):
            processing_response = await send_telegram_message(
                processing_chat_id,
                build_telegram_processing_text(payload),
                linked=True,
                reply_markup={"remove_keyboard": True},
                parse_mode="MarkdownV2",
            )
            processing_message_id = int((((processing_response or {}).get("result") or {}).get("message_id") or 0) or 0) or None
        async with session_factory() as db:
            print(f"[telegram-media] processing started chat={processing_chat_id}", flush=True)
            await asyncio.wait_for(handle_telegram_webhook_payload(payload, db), timeout=60)
            print(f"[telegram-media] processing completed chat={processing_chat_id}", flush=True)
    except Exception as exc:
        print(f"[telegram] Background webhook processing failed: {type(exc).__name__}: {exc}", flush=True)
        if processing_chat_id:
            try:
                await send_telegram_message(
                    processing_chat_id,
                    "Gambar gagal diproses. Sila cuba semula atau hantar gambar bersama teks seperti `makan 12.50`.\n\nImage processing failed. Please retry or send the image with text such as `lunch 12.50`.",
                    linked=True,
                )
            except Exception:
                pass
    finally:
        if processing_chat_id and processing_message_id:
            await delete_telegram_message(processing_chat_id, processing_message_id)


async def telegram_webhook_route(
    *,
    payload: Any,
    request: Request,
    has_valid_telegram_webhook_secret: Callable[[Request], bool],
    telegram_update_has_media: Callable[[Any], bool],
    process_telegram_webhook_payload_background: Callable[[dict[str, Any]], Awaitable[None]],
    session_factory: Callable[[], Any],
    handle_telegram_webhook_payload: Callable[[Any, Any], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    if not has_valid_telegram_webhook_secret(request):
        raise HTTPException(status_code=401, detail="Unauthorized webhook")

    if telegram_update_has_media(payload):
        asyncio.create_task(process_telegram_webhook_payload_background(payload.model_dump()))
        return {"ok": True, "queued": True}

    async with session_factory() as db:
        return await handle_telegram_webhook_payload(payload, db)
