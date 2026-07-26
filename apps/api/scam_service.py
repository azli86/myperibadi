"""Scam detection service using penipu.my API."""

from __future__ import annotations

import asyncio
import os
import re
from typing import Any

import httpx

PENIPU_API_BASE = os.getenv("PENIPU_API_BASE", "https://penipu.my/api/v1")
PENIPU_API_KEY = os.getenv("PENIPU_API_KEY", "")

BANK_ACCOUNT_PATTERN = r"(\d{6,20})"
BANK_KEYWORDS = [
    "maybank", "cimb", "public bank", "rhb", "hong leong", "hlb",
    "ambank", "bank islam", "bank rakyat", "bsn", "uob", "ocbc",
    "alliance", "affin", "agrobank", "muamalat", "standard chartered",
    "mbb", "pbb", "cimb",
    "akaun", "account",
]


def extract_bank_account_numbers(text: str) -> list[str]:
    """Extract potential bank account numbers from text."""
    if not text:
        return []
    # Remove only internal whitespace/dash/dot WITHIN digit sequences,
    # so surrounding word boundaries (\b) still work
    cleaned = re.sub(r"(?<=\d)[\s\-\.]+(?=\d)", "", text)
    candidates = re.findall(BANK_ACCOUNT_PATTERN, cleaned)
    seen = set()
    result = []
    for c in candidates:
        if c not in seen and len(c) >= 6:
            seen.add(c)
            result.append(c)
    return result[:5]


def _find_bank_context_lines(text: str) -> list[str]:
    """Find lines mentioning bank-related keywords."""
    if not text:
        return []
    lines = text.splitlines()
    result = []
    lower_lines = [line.lower() for line in lines]
    for i, lower in enumerate(lower_lines):
        if any(kw in lower for kw in BANK_KEYWORDS):
            start = max(0, i - 5)
            end = min(len(lines), i + 6)
            for j in range(start, end):
                result.append(lines[j].strip())
    return result


def extract_bank_account_from_text(text: str) -> str | None:
    """Try to find bank account numbers, prioritizing bank-context lines."""
    if not text:
        return None
    bank_lines = _find_bank_context_lines(text)
    if bank_lines:
        bank_accounts = extract_bank_account_numbers(" ".join(bank_lines))
        if bank_accounts:
            return bank_accounts[0]
    # Jika tak jumpa dalam bank context, search seluruh teks
    accounts = extract_bank_account_numbers(text)
    if accounts:
        return accounts[0]
    return None


async def check_bank_account(account_number: str, api_key: str | None = None) -> dict[str, Any]:
    """Check bank account against penipu.my API."""
    key = (api_key or PENIPU_API_KEY).strip()
    url = f"{PENIPU_API_BASE}/bank"
    normalized = re.sub(r"[^0-9]", "", account_number)

    if len(normalized) < 6 or len(normalized) > 24:
        return {
            "bank_account": normalized,
            "error": "Invalid account number length",
            "fraud": False,
            "police_report_count": 0,
            "verified_report_count": 0,
            "holder_name": None,
            "bank_name": None,
        }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(
                url,
                params={"q": normalized},
                headers={"X-API-Key": key},
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "bank_account": data.get("bank_account", normalized),
                    "holder_name": data.get("holder_name"),
                    "bank_name": data.get("bank_name"),
                    "police_report_count": data.get("police_report_count", 0),
                    "verified_report_count": data.get("verified_report_count", 0),
                    "fraud": bool(data.get("fraud", False)),
                    "error": None,
                }
            if resp.status_code == 404:
                return {
                    "bank_account": normalized,
                    "holder_name": None,
                    "bank_name": None,
                    "police_report_count": 0,
                    "verified_report_count": 0,
                    "fraud": False,
                    "error": None,
                }
            return {
                "bank_account": normalized,
                "error": f"API error: {resp.status_code}",
                "fraud": False,
                "police_report_count": 0,
                "verified_report_count": 0,
                "holder_name": None,
                "bank_name": None,
            }
        except Exception as exc:
            return {
                "bank_account": normalized,
                "error": str(exc),
                "fraud": False,
                "police_report_count": 0,
                "verified_report_count": 0,
                "holder_name": None,
                "bank_name": None,
            }


async def check_bank_account_sync(account_number: str, api_key: str | None = None) -> dict[str, Any]:
    """Synchronous wrapper for check_bank_account."""
    return await check_bank_account(account_number, api_key)
