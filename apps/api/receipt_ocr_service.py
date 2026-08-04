from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
import httpx

import llm_service


def _pdf_to_png(payload: bytes) -> tuple[bytes, str]:
    """Render the first page of a PDF to PNG via ghostscript."""
    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = os.path.join(tmp, "receipt.pdf")
        out_path = os.path.join(tmp, "page.png")
        with open(pdf_path, "wb") as fh:
            fh.write(payload)
        proc = subprocess.run(
            [
                "gs", "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE",
                "-sDEVICE=png16m", "-r150",
                "-dFirstPage=1", "-dLastPage=1",
                f"-sOutputFile={out_path}", pdf_path,
            ],
            capture_output=True,
            timeout=60,
        )
        if proc.returncode != 0 or not os.path.exists(out_path):
            raise ValueError("PDF could not be rendered")
        with open(out_path, "rb") as fh:
            return fh.read(), "image/png"


@dataclass(frozen=True)
class ReceiptDraft:
    description: str
    amount: Decimal
    txn_date: date
    category_hint: str = ""
    transaction_type: str = "expense"


def _json_object(text: str) -> dict:
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    match = re.search(r"\{.*\}", cleaned, flags=re.S)
    if not match:
        raise ValueError("Vision model returned no JSON")
    candidate = match.group(0)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        # Some custom vision models emit Python-style JSON despite explicit instructions.
        import ast
        parsed = ast.literal_eval(candidate)
        if not isinstance(parsed, dict):
            raise ValueError("Vision model returned invalid JSON")
        return parsed


async def extract_receipt(payload: bytes, mime_type: str, language: str, category_names: list[str] | None = None) -> ReceiptDraft:
    config = llm_service.get_llm_config()
    api_key = (os.getenv("OCR_OPENAI_API_KEY") or "").strip()
    base_url = (os.getenv("OCR_OPENAI_BASE_URL") or "https://api.openai.com/v1").strip().rstrip("/")
    model = (os.getenv("OCR_OPENAI_MODEL") or "gpt-4.1-mini").strip()
    if not api_key:
        raise RuntimeError("Receipt OCR is not configured")
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if mime_type == "application/pdf":
        payload, mime_type = await asyncio.to_thread(_pdf_to_png, payload)
    if mime_type not in allowed or not payload or len(payload) > 10 * 1024 * 1024:
        raise ValueError("Unsupported receipt image")

    category_options = ", ".join((category_names or [])[:80])
    prompt = (
        "Read this receipt. Return JSON only: "
        '{"description":"counterparty name","amount":12.34,"amount_label":"exact label beside chosen amount","amount_evidence":"exact receipt line containing chosen amount","date":"YYYY-MM-DD","category_hint":"one category from options","type":"expense"}. '
        "description is the counterparty name: for expense use the merchant/vendor/business name printed on the receipt (restaurant, shop, store, company); "
        "for income use the payer/sender/company name (employer name, sender of the transfer, refund source). "
        "Never output the literal word 'note', a payment note text, a reference number, a transaction type like TRANSFER/PAYMENT/REFUND, or a section label as the description. "
        "type is 'expense' when the document is a purchase/sales receipt (money paid out), or 'income' when it is a payment received, salary slip, transfer-in confirmation, bank-in slip, or refund (money received). "
        "AMOUNT RULES: extract only the final amount charged/paid. Prefer labels GRAND TOTAL, TOTAL, JUMLAH, AMOUNT DUE, NET TOTAL, TOTAL SALES, or card/e-wallet charged amount. "
        "Never use subtotal, tax, service charge, discount, rounding, cash tendered, payment received, balance, change, item price, quantity, savings, previous balance, account balance, or receipt/reference numbers. "
        "If several totals exist, use the final payable total after tax, discount, service charge, and rounding. Verify that amount against visible line items. If uncertain, set amount to null; never guess. "
        "DATE RULES: extract the purchase/transaction date from the receipt (labels DATE, TARIKH, TRANSACTION DATE, PURCHASE DATE, or the date near the total). "
        "Use the receipt date even if it differs from today. If the receipt shows only a time, use the date printed next to it. If no date is visible, set date to today. Output format YYYY-MM-DD. "
        "Choose category_hint as the single most suitable category name from CATEGORY OPTIONS; never invent one. "
        "Use visible line items to decide. Never guess unreadable values; use null. "
        f"CATEGORY OPTIONS: {category_options}. Today is {date.today().isoformat()}. User language is {language}."
    )
    body = {
        "model": model,
        "temperature": 0,
        "max_tokens": 250,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64.b64encode(payload).decode()}"}},
        ]}],
    }
    print(f"[receipt-ocr] request model={model} bytes={len(payload)}", flush=True)
    async with httpx.AsyncClient(timeout=max(config.timeout_seconds, 30)) as client:
        response = await client.post(f"{base_url}/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json=body)
        response.raise_for_status()
    print(f"[receipt-ocr] response status={response.status_code}", flush=True)
    content = response.json()["choices"][0]["message"]["content"]
    data = _json_object(content)
    description = str(data.get("description") or "").strip()
    amount = Decimal(str(data.get("amount")))
    amount_label = str(data.get("amount_label") or "").strip().lower()
    amount_evidence = str(data.get("amount_evidence") or "").strip().lower()
    trusted_labels = ("grand total", "total", "jumlah", "amount due", "net total", "total sales", "charged", "paid")
    evidence_amounts = []
    for raw in re.findall(r"(?<!\d)(?:rm\s*)?([0-9][0-9,]*(?:\.\d{1,2})?)(?!\d)", amount_evidence, flags=re.I):
        try:
            evidence_amounts.append(Decimal(raw.replace(",", "")))
        except Exception:
            pass
    has_total_label = any(label in f"{amount_label} {amount_evidence}" for label in trusted_labels)
    if not has_total_label or amount not in evidence_amounts:
        # Preserve OCR extraction for user review; never silently substitute another number.
        amount = max(evidence_amounts) if has_total_label and evidence_amounts else amount
    txn_date = date.fromisoformat(str(data.get("date")))
    if not description or len(description) > 190 or amount <= 0 or amount > Decimal("9999999999") or data.get("type") not in {"expense", "income"}:
        raise ValueError("Incomplete receipt details")
    category_hint = " ".join(str(data.get("category_hint") or "").split())[:120]
    return ReceiptDraft(description=description, amount=amount.quantize(Decimal("0.01")), txn_date=txn_date, category_hint=category_hint, transaction_type=str(data.get("type")))
