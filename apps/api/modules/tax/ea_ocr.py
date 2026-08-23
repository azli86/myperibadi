"""EA / EC form OCR extraction.

Returns a DRAFT extraction that must be reviewed & confirmed by the user.
Never auto-confirm OCR output. The user explicitly confirms before data is
used in calculations."""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from typing import Optional

import httpx

import llm_service


@dataclass
class EADraft:
    document_type: str = "EA"                 # EA | EC
    assessment_year: Optional[int] = None
    employer_name: Optional[str] = None
    employer_tax_number: Optional[str] = None
    employee_name: Optional[str] = None
    employee_ic: Optional[str] = None
    salary: Optional[float] = None
    bonus: Optional[float] = None
    commission: Optional[float] = None
    allowances: Optional[float] = None
    benefits: Optional[float] = None
    perquisites: Optional[float] = None
    benefit_in_kind: Optional[float] = None
    living_accommodation: Optional[float] = None
    total_employment_income: Optional[float] = None
    pcb_amount: Optional[float] = None
    cp38_amount: Optional[float] = None
    epf_amount: Optional[float] = None
    socso_amount: Optional[float] = None
    zakat_amount: Optional[float] = None
    confidence: float = 0.0
    raw_json: str = "{}"


def _pdf_to_png(payload: bytes) -> tuple[bytes, str]:
    """Render the first page of a PDF to PNG via ghostscript."""
    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = os.path.join(tmp, "ea.pdf")
        out_path = os.path.join(tmp, "page.png")
        with open(pdf_path, "wb") as fh:
            fh.write(payload)
        proc = subprocess.run(
            [
                "gs", "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE",
                "-sDEVICE=png16m", "-r200",
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


def _json_object(content: str) -> dict:
    content = content.strip()
    # strip code fences if present
    m = re.search(r"\{.*\}", content, flags=re.S)
    if m:
        content = m.group(0)
    try:
        return json.loads(content)
    except Exception:
        return {}


def _to_float(value) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return None
    s = re.sub(r"[^\d.]", "", s)
    try:
        return float(s)
    except Exception:
        return None


def _to_int(value) -> Optional[int]:
    v = _to_float(value)
    return int(v) if v is not None else None


def _draft_from_data(data: dict) -> EADraft:
    return EADraft(
        document_type=str(data.get("document_type") or "EA").upper(),
        assessment_year=_to_int(data.get("assessment_year")),
        employer_name=str(data.get("employer_name") or "").strip() or None,
        employer_tax_number=str(data.get("employer_tax_number") or "").strip() or None,
        employee_name=str(data.get("employee_name") or "").strip() or None,
        employee_ic=str(data.get("employee_ic") or "").strip() or None,
        salary=_to_float(data.get("salary")),
        bonus=_to_float(data.get("bonus")),
        commission=_to_float(data.get("commission")),
        allowances=_to_float(data.get("allowances")),
        benefits=_to_float(data.get("benefits")),
        perquisites=_to_float(data.get("perquisites")),
        benefit_in_kind=_to_float(data.get("benefit_in_kind")),
        living_accommodation=_to_float(data.get("living_accommodation")),
        total_employment_income=_to_float(data.get("total_employment_income")),
        pcb_amount=_to_float(data.get("pcb_amount")),
        cp38_amount=_to_float(data.get("cp38_amount")),
        epf_amount=_to_float(data.get("epf_amount")),
        socso_amount=_to_float(data.get("socso_amount")),
        zakat_amount=_to_float(data.get("zakat_amount")),
        confidence=float(data.get("confidence") or 0),
        raw_json=json.dumps(data),
    )


async def extract_ea(payload: bytes, mime_type: str) -> EADraft:
    """Extract EA/EC data from a PDF or image. Returns a DRAFT (not confirmed)."""
    api_key = (os.getenv("OCR_OPENAI_API_KEY") or "").strip()
    base_url = (os.getenv("OCR_OPENAI_BASE_URL") or "https://api.openai.com/v1").strip().rstrip("/")
    model = (os.getenv("OCR_OPENAI_MODEL") or "gpt-4.1-mini").strip()
    if not api_key:
        raise RuntimeError("EA OCR is not configured")
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if mime_type == "application/pdf":
        payload, mime_type = await asyncio.to_thread(_pdf_to_png, payload)
    if mime_type not in allowed or not payload or len(payload) > 15 * 1024 * 1024:
        raise ValueError("Unsupported EA document")

    prompt = (
        "You are reading a Malaysian Form EA or Form EC (annual remuneration statement from an employer). "
        "Extract the fields and return JSON only. Do NOT include any text outside JSON. "
        '{"document_type":"EA or EC","assessment_year":2026,"employer_name":"...","employer_tax_number":"...",'
        '"employee_name":"...","employee_ic":"...","salary":0,"bonus":0,"commission":0,"allowances":0,'
        '"benefits":0,"perquisites":0,"benefit_in_kind":0,"living_accommodation":0,'
        '"total_employment_income":0,"pcb_amount":0,"cp38_amount":0,"epf_amount":0,"socso_amount":0,'
        '"zakat_amount":0,"confidence":0.0}. '
        "Set each numeric field to the RM value shown, or null if not present. "
        "total_employment_income is the grand total of all remuneration. "
        "pcb_amount is the PCB/MTD tax deducted. epf_amount is KWSP/EPF employee contribution. "
        "zakat_amount is any zakat deduction shown. "
        "confidence is a number 0.0 to 1.0 estimating how clearly the form was read. "
        "Never invent values that are not present. "
        f"Today is year {2026}."
    )
    body = {
        "model": model,
        "temperature": 0,
        "max_tokens": 900,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64.b64encode(payload).decode()}"}},
        ]}],
    }
    print(f"[tax-ea-ocr] request model={model} bytes={len(payload)}", flush=True)
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(f"{base_url}/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json=body)
        response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    data = _json_object(content)
    print(f"[tax-ea-ocr] extracted document_type={data.get('document_type')} year={data.get('assessment_year')}", flush=True)
    draft = _draft_from_data(data)
    # If confidence missing, default to 0.5
    if not draft.confidence:
        draft.confidence = 0.5
    return draft
