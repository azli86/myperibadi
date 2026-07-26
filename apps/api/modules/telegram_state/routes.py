from __future__ import annotations

import time
from typing import Any, Awaitable, Callable


def telegram_pending_media_key_route(user_id: str, chat_id: str) -> str:
    return f"{user_id}:{chat_id}"


def set_telegram_pending_media_route(
    *,
    user_id: str,
    chat_id: str,
    payload: dict[str, Any],
    pending_media: dict[str, dict[str, Any]],
    ttl_seconds: int,
    telegram_pending_media_key: Callable[[str, str], str],
) -> None:
    pending_media[telegram_pending_media_key(user_id, chat_id)] = {
        "expires_at": time.time() + ttl_seconds,
        **payload,
    }


def pop_telegram_pending_media_route(
    *,
    user_id: str,
    chat_id: str,
    pending_media: dict[str, dict[str, Any]],
    telegram_pending_media_key: Callable[[str, str], str],
) -> dict[str, Any] | None:
    pending = pending_media.pop(telegram_pending_media_key(user_id, chat_id), None)
    if not pending:
        return None
    if float(pending.get("expires_at") or 0) < time.time():
        return None
    return pending


def sweep_telegram_pending_media_route(*, pending_media: dict[str, dict[str, Any]]) -> None:
    now = time.time()
    expired_keys = [
        key
        for key, payload in pending_media.items()
        if float(payload.get("expires_at") or 0) < now
    ]
    for key in expired_keys:
        pending_media.pop(key, None)


def telegram_add_flow_key_route(user_id: str, chat_id: str) -> str:
    return f"{user_id}:{chat_id}"


def set_telegram_add_flow_route(
    *,
    user_id: str,
    chat_id: str,
    payload: dict[str, Any],
    add_flows: dict[str, dict[str, Any]],
    ttl_seconds: int,
    telegram_add_flow_key: Callable[[str, str], str],
) -> None:
    existing = add_flows.get(telegram_add_flow_key(user_id, chat_id)) or {}
    tracked_ids = [
        int(mid)
        for mid in list(existing.get("tracked_message_ids") or [])
        if str(mid).isdigit()
    ]
    for mid in list(payload.get("tracked_message_ids") or []):
        if str(mid).isdigit() and int(mid) not in tracked_ids:
            tracked_ids.append(int(mid))
    add_flows[telegram_add_flow_key(user_id, chat_id)] = {
        "expires_at": time.time() + ttl_seconds,
        "tracked_message_ids": tracked_ids,
        **payload,
    }


def get_telegram_add_flow_route(
    *,
    user_id: str,
    chat_id: str,
    add_flows: dict[str, dict[str, Any]],
    telegram_add_flow_key: Callable[[str, str], str],
) -> dict[str, Any] | None:
    flow = add_flows.get(telegram_add_flow_key(user_id, chat_id))
    if not flow:
        return None
    if float(flow.get("expires_at") or 0) < time.time():
        add_flows.pop(telegram_add_flow_key(user_id, chat_id), None)
        return None
    return flow


def clear_telegram_add_flow_route(
    *,
    user_id: str,
    chat_id: str,
    add_flows: dict[str, dict[str, Any]],
    telegram_add_flow_key: Callable[[str, str], str],
) -> None:
    add_flows.pop(telegram_add_flow_key(user_id, chat_id), None)


def remember_telegram_add_flow_message_route(
    *,
    user_id: str,
    chat_id: str,
    message_id: int | None,
    get_telegram_add_flow: Callable[[str, str], dict[str, Any] | None],
    set_telegram_add_flow: Callable[[str, str, dict[str, Any]], None],
) -> None:
    if not message_id:
        return
    flow = get_telegram_add_flow(user_id, chat_id) or {}
    tracked_ids = [
        int(mid)
        for mid in list(flow.get("tracked_message_ids") or [])
        if str(mid).isdigit()
    ]
    if int(message_id) not in tracked_ids:
        tracked_ids.append(int(message_id))
    flow["tracked_message_ids"] = tracked_ids
    set_telegram_add_flow(user_id, chat_id, flow)


async def cleanup_telegram_add_flow_messages_route(
    *,
    chat_id: str,
    flow: dict[str, Any] | None,
    delete_telegram_message: Callable[[str, int], Awaitable[dict[str, Any] | None]],
) -> None:
    tracked_ids = [
        int(mid)
        for mid in list((flow or {}).get("tracked_message_ids") or [])
        if str(mid).isdigit()
    ]
    for tracked_id in tracked_ids:
        await delete_telegram_message(chat_id, tracked_id)


async def send_telegram_add_flow_message_route(
    *,
    chat_id: str,
    user_id: str,
    text: str,
    linked: bool = True,
    reply_markup: dict[str, Any] | None = None,
    send_telegram_message: Callable[..., Awaitable[dict[str, Any] | None]],
    remember_telegram_add_flow_message: Callable[[str, str, int | None], None],
) -> dict[str, Any] | None:
    response = await send_telegram_message(
        chat_id,
        text,
        linked=linked,
        reply_markup=reply_markup,
    )
    sent_message_id = int((((response or {}).get("result") or {}).get("message_id") or 0) or 0) or None
    remember_telegram_add_flow_message(user_id, chat_id, sent_message_id)
    return response


def sweep_telegram_add_flows_route(*, add_flows: dict[str, dict[str, Any]]) -> None:
    now = time.time()
    expired_keys = [
        key
        for key, payload in add_flows.items()
        if float(payload.get("expires_at") or 0) < now
    ]
    for key in expired_keys:
        add_flows.pop(key, None)
