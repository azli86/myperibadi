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
    txn_time: str = ""


def _normalize_time(raw: str) -> str:
    """Normalize a time string to 24-hour HH:MM, supporting 12h AM/PM and 24h."""
    value = (raw or "").strip().lower()
    if not value or value in {"null", "none", "n/a", "na", "-", "--"}:
        return ""
    # Reject values that look like a full date/datetime (take only the clock part).
    value = value.replace(".", ":")
    # Pattern 1: HH:MM(:SS)? with optional AM/PM (the clearest form).
    m = re.search(r"\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b", value)
    if not m:
        # Pattern 2: H AM/PM or H:MM AM/PM without colon separator (e.g. "2 pm", "8am").
        m = re.search(r"\b(\d{1,2})\s*(am|pm)\b", value)
    if not m:
        return ""
    hour = int(m.group(1))
    minute = int(m.group(2)) if m.lastindex and m.group(2) and len(m.group(2)) == 2 and m.group(2).isdigit() else 0
    meridiem = m.group(3) if m.lastindex >= 3 else None
    if meridiem == "am":
        hour = 0 if hour == 12 else hour
    elif meridiem == "pm":
        hour = 12 if hour == 12 else (hour + 12) % 24
    elif hour > 23 or minute > 59:
        return ""
    return f"{hour:02d}:{minute:02d}"


def _http_json(response: httpx.Response) -> dict:
    """Decode a completion body, tolerating a trailing SSE sentinel.

    The LAN gateway appends a literal `data: [DONE]` line after the JSON object for the
    same requests where the public API returns bare JSON, so `response.json()` raises on
    a scan that actually succeeded. Trim anything after the first complete object.
    """
    try:
        return response.json()
    except ValueError:
        depth = 0
        in_string = False
        escaped = False
        for index, char in enumerate(response.text):
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return json.loads(response.text[: index + 1])
        raise


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


async def _ocr_providers() -> list[dict[str, str]]:
    """Vision providers, in the order they should be tried.

    The LAN box at ILMU_BASE_URL used to be tried first on the grounds that it was
    faster on a large phone photo. In practice it misread plain receipts often enough
    that the draft had to be corrected by hand, which costs more than the round trip.

    OpenAI now goes first. The LAN box stays behind it so that an OpenAI outage degrades
    OCR to poorer reads rather than to nothing — the receipt path is how transactions get
    created, so it must not have a single point of failure.
    """
    providers: list[dict[str, str]] = []

    cloud_key = (os.getenv("OCR_OPENAI_API_KEY") or "").strip()
    cloud_base = (os.getenv("OCR_OPENAI_BASE_URL") or "https://api.openai.com/v1").strip().rstrip("/")
    cloud_model = (os.getenv("OCR_OPENAI_MODEL") or "gpt-4.1-mini").strip()
    if cloud_key:
        providers.append({"name": "cloud", "api_key": cloud_key, "base_url": cloud_base, "model": cloud_model})

    local_key = (os.getenv("OCR_LOCAL_API_KEY") or os.getenv("ILMU_API_KEY") or "").strip()
    local_base = (os.getenv("OCR_LOCAL_BASE_URL") or os.getenv("ILMU_BASE_URL") or "").strip().rstrip("/")
    local_model = (os.getenv("OCR_LOCAL_MODEL") or "").strip()
    if local_key and local_base and local_model:
        providers.append({"name": "local", "api_key": local_key, "base_url": local_base, "model": local_model})

    if not providers:
        raise RuntimeError("Receipt OCR is not configured")
    return providers


def _normalize_receipt_mime(payload: bytes, mime_type: str) -> str:
    """Trust the bytes over the header.

    Bots send `application/octet-stream` for documents and `application/pdf; charset=binary`
    for some clients, so an exact string compare dropped every PDF before it could be
    rendered. The magic bytes decide.
    """
    base = (mime_type or "").split(";")[0].strip().lower()
    if payload.startswith(b"%PDF-") or base in {"application/pdf", "application/x-pdf"}:
        return "application/pdf"
    if base == "image/jpg":
        return "image/jpeg"
    return base

async def extract_receipt(payload: bytes, mime_type: str, language: str, category_names: list[str] | None = None) -> ReceiptDraft:
    config = llm_service.get_llm_config()
    providers = await _ocr_providers()
    allowed = {"image/jpeg", "image/png", "image/webp"}
    mime_type = _normalize_receipt_mime(payload, mime_type)
    if mime_type == "application/pdf":
        payload, mime_type = await asyncio.to_thread(_pdf_to_png, payload)
    if mime_type not in allowed or not payload or len(payload) > 10 * 1024 * 1024:
        raise ValueError("Unsupported receipt image")

    category_options = ", ".join((category_names or [])[:80])
    prompt = (
        "Read this receipt. Return JSON only: "
        '{"description":"counterparty name","amount":12.34,"amount_label":"exact label beside chosen amount","amount_evidence":"exact receipt line containing chosen amount","date":"YYYY-MM-DD","time":"HH:MM","category_hint":"one category from options","type":"expense"}. '
        "description is the counterparty name: for expense use the merchant/vendor/business name printed on the receipt (restaurant, shop, store, company); "
        "for income use the payer/sender/company name (employer name, sender of the transfer, refund source). "
        "Never output the literal word 'note', a payment note text, a reference number, a transaction type like TRANSFER/PAYMENT/REFUND, or a section label as the description. "
        "type is 'expense' when the document is a purchase/sales receipt (money paid out), or 'income' when it is a payment received, salary slip, transfer-in confirmation, bank-in slip, or refund (money received). "
        "AMOUNT RULES: extract only the final amount charged/paid. Prefer labels GRAND TOTAL, TOTAL, JUMLAH, AMOUNT DUE, NET TOTAL, TOTAL SALES, or card/e-wallet charged amount. "
        "Never use subtotal, tax, service charge, discount, rounding, cash tendered, payment received, balance, change, item price, quantity, savings, previous balance, account balance, or receipt/reference numbers. "
        "If several totals exist, use the final payable total after tax, discount, service charge, and rounding. Verify that amount against visible line items. If uncertain, set amount to null; never guess. "
        "DATE RULES: extract the purchase/transaction date from the receipt (labels DATE, TARIKH, TRANSACTION DATE, PURCHASE DATE, or the date near the total). "
        "Use the receipt date even if it differs from today. If the receipt shows only a time, use the date printed next to it. If no date is visible, set date to today. Output format YYYY-MM-DD. "
        "TIME RULES: extract the transaction time printed on the receipt (labels TIME, MASA, TRANSACTION TIME, or the timestamp near the total). "
        "Support 12-hour with AM/PM and 24-hour formats; normalize to 24-hour HH:MM. "
        "If a time is visible, set time to it; otherwise set time to null. "
        "Choose category_hint as the single most suitable category name from CATEGORY OPTIONS; never invent one. "
        "Use visible line items to decide. Never guess unreadable values; use null. "
        f"CATEGORY OPTIONS: {category_options}. Today is {date.today().isoformat()}. User language is {language}."
    )
    body = {
        "temperature": 0,
        # A reasoning model spends part of this budget on its own thinking before it writes
        # the JSON. At 250 the thinking frequently consumed the whole allowance last, which
        # left `content` empty and made roughly three in five scans look like a failed read.
        # The JSON itself is about 100 tokens, so the rest is headroom for reasoning.
        "max_tokens": 1200,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64.b64encode(payload).decode()}"}},
        ]}],
    }
    response = None
    model = providers[-1]["model"]
    used_provider = providers[-1]["name"]
    for index, provider in enumerate(providers):
        model = provider["model"]
        used_provider = provider["name"]
        attempt_body = {**body, "model": model}
        print(f"[receipt-ocr] request provider={provider['name']} model={model} bytes={len(payload)}", flush=True)
        failed = False
        attempt_response = None
        for attempt in range(4):
            try:
                async with httpx.AsyncClient(timeout=max(config.timeout_seconds, 30)) as client:
                    attempt_response = await client.post(
                        f"{provider['base_url']}/chat/completions",
                        headers={"Authorization": f"Bearer {provider['api_key']}"},
                        json=attempt_body,
                    )
            except Exception as exc:
                # A LAN box that is switched off is the expected failure here, so a transport
                # error falls through to the next provider rather than aborting the scan.
                print(f"[receipt-ocr] provider={provider['name']} transport error {type(exc).__name__}: {exc}", flush=True)
                failed = True
                break
            if attempt_response.status_code in {429, 500, 502, 503, 504} and attempt < 3:
                await asyncio.sleep(2 ** attempt)
                continue
            break
        response = attempt_response
        if failed or response is None or response.status_code != 200:
            if index + 1 < len(providers):
                status = "transport error" if failed or response is None else response.status_code
                print(f"[receipt-ocr] provider={provider['name']} unusable ({status}); falling back", flush=True)
                continue
            if response is None:
                raise RuntimeError("Vision model unreachable")
        break
    print(f"[receipt-ocr] response provider={used_provider} status={response.status_code}", flush=True)
    if response.status_code != 200:
        snippet = response.text[:600].replace("\n", " ")
        print(f"[receipt-ocr] ERROR status={response.status_code} body={snippet}", flush=True)
        raise RuntimeError(f"Vision model HTTP {response.status_code}")
    body_json = _http_json(response)
    choice = body_json["choices"][0]
    content = choice["message"].get("content") or ""
    if not content.strip():
        # A reasoning model can spend its whole budget thinking and never write the answer.
        # Log the finish reason so this is diagnosable instead of looking like a bad photo.
        print(
            f"[receipt-ocr] provider={used_provider} returned no content "
            f"finish_reason={choice.get('finish_reason')}",
            flush=True,
        )
    # Some models wrap the object in a fenced block and add prose after it. Salvage the
    # first JSON object rather than discarding a scan that actually succeeded.
    data = _json_object(content)
    description = str(data.get("description") or "").strip()
    # A model that cannot read the photo answers with nulls rather than failing. Coerce
    # those to None so the validation below rejects it as "unreadable" instead of raising
    # a conversion error that hides what actually happened.
    try:
        amount = Decimal(str(data.get("amount")))
    except Exception:
        amount = None
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
    if amount is None or not has_total_label or amount not in evidence_amounts:
        # Preserve OCR extraction for user review; never silently substitute another number.
        amount = max(evidence_amounts) if has_total_label and evidence_amounts else amount
    try:
        txn_date = date.fromisoformat(str(data.get("date")))
    except Exception:
        txn_date = None
    invalid_amount = amount is None or amount <= 0 or amount > Decimal("9999999999")
    if not description or len(description) > 190 or invalid_amount or txn_date is None or data.get("type") not in {"expense", "income"}:
        raise ValueError("Incomplete receipt details")
    category_hint = " ".join(str(data.get("category_hint") or "").split())[:120]
    txn_time = _normalize_time(str(data.get("time") or ""))
    return ReceiptDraft(description=description, amount=amount.quantize(Decimal("0.01")), txn_date=txn_date, category_hint=category_hint, transaction_type=str(data.get("type")), txn_time=txn_time)
