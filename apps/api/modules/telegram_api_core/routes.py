from __future__ import annotations

import hmac
from typing import Any, Awaitable, Callable

import httpx
from fastapi import Request


def has_valid_telegram_webhook_secret_route(
    *,
    request: Request,
    telegram_webhook_secret: str,
) -> bool:
    provided_secret = request.headers.get("x-telegram-bot-api-secret-token", "")
    if not provided_secret or not telegram_webhook_secret:
        return False
    return hmac.compare_digest(provided_secret, telegram_webhook_secret)


async def telegram_api_request_route(
    *,
    method: str,
    payload: dict[str, Any],
    telegram_bot_token: str,
) -> dict[str, Any] | None:
    if not telegram_bot_token:
        return None
    url = f"https://api.telegram.org/bot{telegram_bot_token}/{method}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=payload)
            return response.json() if response.content else None
    except Exception as exc:
        print(f"[telegram] API request failed: {method}: {exc}")
        return None


async def sync_telegram_bot_commands_route(
    *,
    telegram_bot_token: str,
    telegram_api_request: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any] | None]],
) -> None:
    if not telegram_bot_token:
        return
    commands = [
        {"command": "add", "description": "Open add transaction wizard"},
        {"command": "summary", "description": "Monthly summary"},
        {"command": "checkwallet", "description": "Check wallet balances"},
        {"command": "budget", "description": "Budget help"},
        {"command": "loanx", "description": "Loan tracker help"},
        {"command": "transfer", "description": "Transfer help"},
        {"command": "debt", "description": "Debt help"},
        {"command": "list", "description": "Recent transactions"},
        {"command": "lang", "description": "Change language"},
        {"command": "help", "description": "Help"},
    ]
    await telegram_api_request("setMyCommands", {"commands": commands})
