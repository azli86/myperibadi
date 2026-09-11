"""Natural language → existing read-only bot command.

The local LLM only *picks* a command id and fills plain args. Validation and
execution happen here and in the existing deterministic handler
(`whatsapp_service._process_whatsapp_message_impl`), so the model never sees or
builds SQL and never gets to run a mutating command.

Run self-check: venv/bin/python -m tests.test_ai_command_router
"""

from __future__ import annotations

import json
import re
from typing import Any, Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

import llm_service

# id -> (BM label, English label, example question, command line template).
# {category} is the only free-text arg and is sanitised before use.
READ_ONLY_COMMANDS: dict[str, dict[str, str]] = {
    "summary": {
        "bm": "ringkasan perbelanjaan bulan ini",
        "en": "this month's spending summary",
        "example": "berapa saya belanja bulan ni",
        "template": "summary",
    },
    "list": {
        "bm": "5 transaksi terakhir",
        "en": "last 5 transactions",
        "example": "saya makan apa sebelum ni",
        "template": "list",
    },
    "wallets": {
        "bm": "baki setiap wallet",
        "en": "wallet balances",
        "example": "baki wallet saya berapa",
        "template": "checkwallet",
    },
    "budget_summary": {
        "bm": "ringkasan bajet",
        "en": "budget summary",
        "example": "bajet saya macam mana",
        "template": "budget summary",
    },
    "budget_list": {
        "bm": "senarai bajet",
        "en": "budget list",
        "example": "bajet apa saya dah set",
        "template": "budget list",
    },
    "budget_remaining": {
        "bm": "baki bajet satu kategori",
        "en": "remaining budget for one category",
        "example": "baki bajet makanan",
        "template": "budget baki {category}",
    },
    "debts": {
        "bm": "senarai hutang/piutang",
        "en": "debt list",
        "example": "siapa hutang saya",
        "template": "debt list",
    },
    "loans": {
        "bm": "senarai pinjaman",
        "en": "loan list",
        "example": "loan saya apa",
        "template": "loanx list",
    },
    "subscriptions": {
        "bm": "senarai langganan",
        "en": "subscription list",
        "example": "langganan saya apa",
        "template": "subx list",
    },
    "category_list": {
        "bm": "senarai kategori dan bilangan keyword",
        "en": "category list with keyword counts",
        "example": "kategori apa saya ada",
        "template": "category",
    },
    "category_keywords": {
        "bm": "keyword yang disimpan untuk satu kategori",
        "en": "keywords saved for one category",
        "example": "keyword untuk makanan",
        "template": "category {category}",
        "fallback_template": "category",
    },
}

CATEGORY_PATTERN = re.compile(r"[^\w\s\-]", re.UNICODE)
MAX_CATEGORY_LENGTH = 40


def sanitize_category(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(CATEGORY_PATTERN.sub(" ", value).split())
    if len(cleaned) < 2 or len(cleaned) > MAX_CATEGORY_LENGTH:
        return None
    return cleaned.lower()


def build_command_text(command_id: Any, category: Any = None) -> Optional[str]:
    """Whitelist + arg validation. Returns the command line to run, or None."""
    spec = READ_ONLY_COMMANDS.get(command_id) if isinstance(command_id, str) else None
    if spec is None:
        return None
    template = spec["template"]
    if "{category}" not in template:
        return template
    cleaned = sanitize_category(category)
    if not cleaned:
        return spec.get("fallback_template")
    return template.format(category=cleaned)


def parse_router_reply(raw: str) -> Optional[dict[str, Any]]:
    """Accept raw JSON, fenced JSON, or JSON wrapped in chatter."""
    if not raw:
        return None
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", text).strip()
    candidates = [text]
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        candidates.append(text[start : end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except (ValueError, TypeError):
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def build_router_prompt(language: str) -> str:
    is_en = (language or "BM").upper() == "EN"
    lines = []
    for command_id, spec in READ_ONLY_COMMANDS.items():
        label = spec["en"] if is_en else spec["bm"]
        lines.append(f'- "{command_id}": {label} (contoh: "{spec["example"]}")')
    return (
        "You map a user message to ONE read-only MyPeribadi helper command.\n"
        "Reply with JSON only, no prose: "
        '{"command": "<id or none>", "category": "<category name or empty>"}\n'
        "Use \"category\" only for budget_remaining (single word, e.g. makanan).\n"
        "For category_keywords you MUST fill \"category\" with the named category, e.g. "
        '{"command": "category_keywords", "category": "pengangkutan"}.\n'
        "If the message is a new expense/income entry, a greeting, or nothing "
        'matches, reply {"command": "none", "category": ""}.\n'
        "Available commands:\n" + "\n".join(lines)
    )


async def infer_command(*, user_message: str, language: str) -> Optional[str]:
    """Ask the local model which command fits. Returns a command line or None."""
    config = llm_service.get_llm_config()
    if not (config.enabled and config.api_key):
        return None

    payload = {
        "model": config.model,
        "messages": [
            {"role": "system", "content": build_router_prompt(language)},
            {"role": "user", "content": (user_message or "").strip()[:500]},
        ],
        "temperature": 0.0,
        "max_tokens": 60,
    }
    try:
        async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
            response = await client.post(
                f"{config.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {config.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            # This endpoint can return more than one JSON object; decode the first
            # (same handling as llm_service._request_model_reply).
            data, _ = json.JSONDecoder().raw_decode(response.text)
    except Exception as exc:
        print(f"[AI-ROUTE] command inference failed: {exc}")
        return None

    choices = data.get("choices") if isinstance(data, dict) else None
    raw = ""
    if isinstance(choices, list) and choices:
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        if isinstance(message, dict):
            raw = message.get("content") or ""

    parsed = parse_router_reply(raw)
    if parsed is None:
        print(f"[AI-ROUTE] unparsable router reply: {raw[:120]!r}")
        return None
    command_text = build_command_text(parsed.get("command"), parsed.get("category"))
    print(
        f"[AI-ROUTE] message={user_message[:60]!r} -> command={command_text!r} "
        f"(raw={raw[:80]!r})"
    )
    return command_text


async def route_natural_language_to_command(
    db: AsyncSession | None,
    *,
    user_id: str,
    text: str,
    language: str,
    source_channel: str,
) -> Optional[str]:
    """Command line to execute for this message, or None to fall back to chat."""
    if not text or not text.strip():
        return None
    if not llm_service.is_llm_reply_enabled_for_channel(source_channel):
        return None
    # DB is accepted for symmetry with the other services and possible future
    # category-name lookups; the LLM itself never receives user rows.
    del db, user_id
    return await infer_command(user_message=text, language=language)
