from __future__ import annotations

import hashlib
from typing import Any, Awaitable, Callable

import httpx


def build_telegram_choice_keyboard_route(rows: list[list[str]]) -> dict[str, Any]:
    return {
        "keyboard": [[{"text": text} for text in row] for row in rows],
        "resize_keyboard": True,
        "is_persistent": True,
        "one_time_keyboard": False,
    }


def build_telegram_inline_keyboard_route(rows: list[list[tuple[str, str] | tuple[str, str, str]]]) -> dict[str, Any]:
    inline_rows: list[list[dict[str, Any]]] = []
    for row in rows:
        inline_row: list[dict[str, Any]] = []
        for item in row:
            label, callback_data = item[0], item[1]
            button: dict[str, Any] = {"text": label, "callback_data": callback_data}
            if len(item) >= 3 and item[2]:
                button["style"] = item[2]
            inline_row.append(button)
        inline_rows.append(inline_row)
    return {"inline_keyboard": inline_rows}


def build_telegram_keyboard_route(linked: bool) -> dict[str, Any] | None:
    if not linked:
        return None, None, "Image processing took too long or failed. Please re-upload this image."
    return {"remove_keyboard": True}


def normalize_telegram_command_route(text: str) -> str:
    value = (text or "").strip()
    if not value:
        return ""

    if not value.startswith("/"):
        lowered_plain = value.lower()
        if lowered_plain in {"kategori", "category", "categories", "cat", "fetch kategori", "fetch category", "list kategori"}:
            return "__telegram_category_menu__"
        if lowered_plain in {"keypad", "num", "numpad", "amount keypad"}:
            return "__telegram_keypad_menu__"
        plain_map = {
            "summary": "summary",
            "wallet": "checkwallet",
            "checkwallet": "checkwallet",
            "budget": "__telegram_budget_menu__",
            "list": "list",
            "help": "help",
            "lang": "__telegram_lang_menu__",
            "debt": "__telegram_debt_menu__",
            "loanx": "__telegram_loan_menu__",
            "transfer": "__telegram_transfer_menu__",
        }
        return plain_map.get(lowered_plain, value)

    body = value[1:].strip()
    if not body:
        return ""
    parts = body.split(None, 1)
    command = parts[0].split("@", 1)[0].lower()
    rest = parts[1].strip() if len(parts) > 1 else ""

    if command == "start":
        return "/start"
    if command == "summary":
        return "summary"
    if command in {"wallet", "checkwallet"}:
        return "checkwallet"
    if command == "list":
        return "list"
    if command == "help":
        return "help"
    if command == "budget":
        return f"budget {rest}".strip() if rest else "__telegram_budget_menu__"
    if command in {"kategori", "category", "categories", "cat"}:
        return "__telegram_category_menu__"
    if command in {"keypad", "num", "numpad"}:
        return "__telegram_keypad_menu__"
    if command in {"pindah", "debtcol", "debtpay", "balance", "debtcmd"}:
        return f"{command} {rest}".strip()
    if command == "transfer":
        return f"transfer {rest}".strip() if rest else "__telegram_transfer_menu__"
    if command == "debt":
        return f"debt {rest}".strip() if rest else "__telegram_debt_menu__"
    if command == "loanx":
        return f"loanx {rest}".strip() if rest else "__telegram_loan_menu__"
    if command == "lang":
        return f"lang {rest}".strip() if rest else "__telegram_lang_menu__"
    if command == "add":
        return rest if rest else "__telegram_add_menu__"
    return value


def build_telegram_message_key_route(update_id: int | None, message_id: int | None, chat_id: str, text: str) -> str:
    if update_id is not None:
        return f"upd:{update_id}"
    if message_id is not None:
        return f"msg:{chat_id}:{message_id}"
    fingerprint = hashlib.sha256(f"{chat_id}|{text}".encode("utf-8")).hexdigest()
    return f"fp:{fingerprint}"


async def edit_telegram_message_text_route(
    *,
    chat_id: str,
    message_id: int | str | None,
    text: str,
    reply_markup: dict[str, Any] | None,
    telegram_api_request: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any] | None]],
) -> dict[str, Any] | None:
    if not chat_id or message_id in (None, ""):
        return None
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "message_id": int(message_id),
        "text": text,
        "parse_mode": "Markdown",
    }
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    return await telegram_api_request("editMessageText", payload)


async def answer_telegram_callback_route(
    *,
    callback_query_id: str | None,
    text: str | None,
    telegram_api_request: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any] | None]],
) -> None:
    if not callback_query_id:
        return
    payload: dict[str, Any] = {"callback_query_id": callback_query_id}
    if text:
        payload["text"] = text
    await telegram_api_request("answerCallbackQuery", payload)


async def download_telegram_file_route(
    *,
    file_id: str,
    expected_size_bytes: int | None,
    telegram_bot_token: str,
    telegram_max_media_bytes: int,
    telegram_api_request: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any] | None]],
) -> tuple[bytes, str | None, str | None] | None:
    if not telegram_bot_token or not file_id:
        return None
    file_info = await telegram_api_request("getFile", {"file_id": file_id})
    if not file_info or not file_info.get("ok"):
        return None
    file_result = file_info.get("result") or {}
    file_size = int(file_result.get("file_size") or expected_size_bytes or 0)
    if file_size and file_size > telegram_max_media_bytes:
        print(f"[telegram] File rejected before download: size={file_size} max={telegram_max_media_bytes}")
        return None, None, "Image processing took too long or failed. Please re-upload this image."
    file_path = (file_result.get("file_path") or "").strip()
    if not file_path:
        return None, None, "Image processing took too long or failed. Please re-upload this image."
    url = f"https://api.telegram.org/file/bot{telegram_bot_token}/{file_path}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            content_length = int(response.headers.get("content-length") or 0)
            if content_length and content_length > telegram_max_media_bytes:
                print(f"[telegram] File rejected by content-length: size={content_length} max={telegram_max_media_bytes}")
                return None, None, "Image processing took too long or failed. Please re-upload this image."
            if len(response.content) > telegram_max_media_bytes:
                print(f"[telegram] File rejected after download: size={len(response.content)} max={telegram_max_media_bytes}")
                return None, None, "Image processing took too long or failed. Please re-upload this image."
            return response.content, file_path, None
    except Exception as exc:
        print(f"[telegram] File download failed: {exc}")
        return None, None, "Image processing took too long or failed. Please re-upload this image."


async def send_telegram_message_route(
    *,
    chat_id: str,
    text: str,
    linked: bool,
    reply_markup: dict[str, Any] | None,
    build_telegram_keyboard: Callable[[bool], dict[str, Any] | None],
    telegram_api_request: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any] | None]],
    parse_mode: str = "Markdown",
) -> dict[str, Any] | None:
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
    }
    keyboard = reply_markup or build_telegram_keyboard(linked)
    if keyboard:
        payload["reply_markup"] = keyboard
    return await telegram_api_request("sendMessage", payload)


async def delete_telegram_message_route(
    *,
    chat_id: str,
    message_id: int | str | None,
    telegram_api_request: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any] | None]],
) -> None:
    if not chat_id or message_id in (None, ""):
        return
    await telegram_api_request("deleteMessage", {
        "chat_id": chat_id,
        "message_id": int(message_id),
    })
