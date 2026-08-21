from __future__ import annotations

import json
import os
import re
from datetime import date
from decimal import Decimal, InvalidOperation

import httpx


def _json_object(text: str) -> dict:
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    match = re.search(r"\{.*\}", cleaned, flags=re.S)
    if not match:
        raise ValueError("AI returned no JSON")
    return json.loads(match.group(0))


async def parse_statement(text: str) -> list[dict]:
    api_key = (os.getenv("OCR_OPENAI_API_KEY") or "").strip()
    base_url = (os.getenv("OCR_OPENAI_BASE_URL") or "https://api.openai.com/v1").strip().rstrip("/")
    model = (os.getenv("OCR_OPENAI_MODEL") or "gpt-4.1-mini").strip()
    if not api_key:
        raise RuntimeError("OpenAI OCR is not configured")
    content = text.strip()
    if not content or len(content) > 200_000:
        raise ValueError("Invalid statement text")
    prompt = (
        "Extract bank transactions from this Malaysian bank statement text. Return JSON only as "
        '{"transactions":[{"date":"YYYY-MM-DD","description":"merchant or counterparty","amount":12.34,"type":"expense"}]}. '
        "Use transaction amount, never running/current/available balance. Debit/DR/withdrawal is expense; credit/CR/deposit is income. "
        "Ignore opening/closing balance, totals, headers, page numbers, and account metadata. Preserve every real transaction exactly once. "
        "Do not guess unreadable amounts or dates. Statement text:\n" + content
    )
    body = {
        "model": model,
        "temperature": 0,
        "max_tokens": 12000,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "user", "content": prompt}],
    }
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(f"{base_url}/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json=body)
        response.raise_for_status()
    rows = _json_object(response.json()["choices"][0]["message"]["content"]).get("transactions")
    if not isinstance(rows, list):
        raise ValueError("AI returned invalid transactions")
    result = []
    for index, row in enumerate(rows[:2000]):
        try:
            txn_date = date.fromisoformat(str(row.get("date") or ""))
            amount = Decimal(str(row.get("amount"))).quantize(Decimal("0.01"))
            txn_type = str(row.get("type") or "").lower()
            description = " ".join(str(row.get("description") or "").split())[:300]
        except (ValueError, InvalidOperation, TypeError):
            continue
        if amount <= 0 or txn_type not in {"expense", "income"} or not description:
            continue
        result.append({"id": f"ai-{index}-{txn_date.isoformat()}-{amount}", "date": txn_date.isoformat(), "rawDate": txn_date.isoformat(), "description": description, "amount": float(amount), "type": txn_type, "selected": True})
    if not result:
        raise ValueError("AI found no valid transactions")
    return result
