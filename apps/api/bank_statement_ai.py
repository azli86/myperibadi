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


async def parse_statement(text: str, page_images: list[str] | None = None) -> list[dict]:
    api_key = (os.getenv("OCR_OPENAI_API_KEY") or "").strip()
    base_url = (os.getenv("OCR_OPENAI_BASE_URL") or "https://api.openai.com/v1").strip().rstrip("/")
    model = (os.getenv("OCR_OPENAI_MODEL") or "gpt-4.1-mini").strip()
    if not api_key:
        raise RuntimeError("OpenAI OCR is not configured")
    content = text.strip()
    images = [image for image in (page_images or [])[:20] if isinstance(image, str) and image.startswith("data:image/")]
    if sum(len(image) for image in images) > 30_000_000:
        raise ValueError("Statement images too large")
    if images:
        # PDF text layer loses debit/credit columns; rely on page images only.
        content = ""
    elif not content:
        raise ValueError("Invalid statement input")
    prompt = (
        "Read the transaction table from these Malaysian bank statement page images. Return JSON only as "
        '{"transactions":[{"date":"YYYY-MM-DD","time":"HH:MM","description":"exact description column text","amount":12.34,"type":"expense"}]}. '
        "For each transaction row take exactly: the DATE column, the TIME column if present, the DESCRIPTION/TRANSACTION DETAILS column, and the TRANSACTION AMOUNT column. "
        "The transaction amount is the value under the Withdrawal/Debit column or the Deposit/Credit column, NOT the running BALANCE column, NOT the date, NOT a reference number. "
        "If the row has a value in the debit column set type to expense and amount to that debit value; if it has a value in the credit column set type to income and amount to that credit value. "
        "Ignore opening/closing balance rows, carried-forward rows, headers, footers, page numbers, and any repeated totals. Include every real transaction exactly once, in statement order. "
        "If a value is unreadable set that field to null; never guess. "
        + ("The images follow." if images else "Statement text:\n" + content)
    )
    user_content = [{"type": "text", "text": prompt}]
    user_content.extend({"type": "image_url", "image_url": {"url": image, "detail": "high"}} for image in images)
    body = {
        "model": model,
        "temperature": 0,
        "max_tokens": 12000,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "user", "content": user_content}],
    }
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(f"{base_url}/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json=body)
        response.raise_for_status()
    content_out = response.json()["choices"][0]["message"]["content"]
    print(f"[bank-statement-ai] model={model} images={len(images)} img_bytes={sum(len(i) for i in images)} text_chars={len(content)}", flush=True)
    print(f"[bank-statement-ai] raw_response={content_out[:3000]}", flush=True)
    rows = _json_object(content_out).get("transactions")
    if not isinstance(rows, list):
        raise ValueError("AI returned invalid transactions")
    result = []
    for index, row in enumerate(rows[:2000]):
        try:
            txn_date = date.fromisoformat(str(row.get("date") or ""))
            amount = Decimal(str(row.get("amount"))).quantize(Decimal("0.01"))
            txn_type = str(row.get("type") or "").lower()
            description = " ".join(str(row.get("description") or "").split())[:300]
            raw_time = " ".join(str(row.get("time") or "").split())[:8]
        except (ValueError, InvalidOperation, TypeError):
            continue
        if amount <= 0 or txn_type not in {"expense", "income"} or not description:
            continue
        if not re.fullmatch(r"\d{2}:\d{2}(:\d{2})?", raw_time):
            raw_time = ""
        result.append({"id": f"ai-{index}-{txn_date.isoformat()}-{amount}", "date": txn_date.isoformat(), "rawDate": txn_date.isoformat(), "time": raw_time, "description": description, "amount": float(amount), "type": txn_type, "selected": True})
    if not result:
        raise ValueError("AI found no valid transactions")
    return result
