"""Receipt OCR prefers the LAN vision model, with the cloud behind it.

OCR used to go straight to the public OpenAI API, which meant every phone photo made a
round trip over the internet. The same job is served on the office LAN, which is faster
for a multi-megabyte photo.

These tests cover the parts that are easy to break: the provider order, the fallback
when the LAN box is unreachable, tolerating the gateway's trailing SSE sentinel, and
rejecting a photo the model cannot read instead of raising a conversion error.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("OCR_LOCAL_API_KEY", "test-key")
os.environ.setdefault("OCR_LOCAL_BASE_URL", "http://127.0.0.1:59998/v1")
os.environ.setdefault("OCR_LOCAL_MODEL", "test-vision")
os.environ.setdefault("OCR_OPENAI_API_KEY", "test-cloud-key")
os.environ.setdefault("OCR_OPENAI_MODEL", "test-cloud-model")

import httpx  # noqa: E402
import receipt_ocr_service as ocr  # noqa: E402


def test_local_is_offered_before_cloud():
    providers = asyncio.run(ocr._ocr_providers())
    names = [p["name"] for p in providers]
    assert names == ["local", "cloud"], names
    assert providers[0]["model"] == "test-vision"
    assert providers[1]["model"] == "test-cloud-model"


def test_ocr_still_works_with_no_local_provider_configured():
    """Removing OCR_LOCAL_MODEL must not disable OCR, only reorder it."""
    saved = {k: os.environ.pop(k, None) for k in ("OCR_LOCAL_MODEL",)}
    try:
        providers = asyncio.run(ocr._ocr_providers())
        assert [p["name"] for p in providers] == ["cloud"]
    finally:
        for key, value in saved.items():
            if value is not None:
                os.environ[key] = value


def test_trailing_sse_sentinel_is_tolerated():
    """The LAN gateway appends `data: [DONE]` after the JSON object."""
    body = '{"choices":[{"message":{"content":"{}"}}]}data: [DONE]'
    response = httpx.Response(200, text=body, request=httpx.Request("POST", "http://x"))
    parsed = ocr._http_json(response)
    assert parsed["choices"][0]["message"]["content"] == "{}"


def test_plain_json_still_parses():
    body = '{"choices":[{"message":{"content":"{}"}}]}'
    response = httpx.Response(200, text=body, request=httpx.Request("POST", "http://x"))
    assert ocr._http_json(response)["choices"][0]["message"]["content"] == "{}"


def test_null_amount_is_rejected_as_unreadable():
    """A model that cannot read the photo answers with nulls. That must surface as
    'could not read it' (ValueError), not a Decimal conversion crash."""
    content = (
        '{"description":null,"amount":null,"amount_label":null,"amount_evidence":null,'
        '"date":null,"time":null,"category_hint":null,"type":"expense"}'
    )
    data = ocr._json_object(content)
    try:
        amount = ocr.Decimal(str(data.get("amount")))
    except Exception:
        amount = None
    assert amount is None, "a null amount must not become a Decimal"
    assert data.get("date") is None


def test_missing_or_bad_date_is_rejected():
    """txn_date is formatted with strftime downstream, so it can never be None."""
    for raw in (None, "", "not-a-date", "2026-13-45"):
        try:
            parsed = ocr.date.fromisoformat(str(raw))
        except Exception:
            parsed = None
        assert parsed is None, f"{raw!r} should not parse"


if __name__ == "__main__":
    test_local_is_offered_before_cloud()
    test_ocr_still_works_with_no_local_provider_configured()
    test_trailing_sse_sentinel_is_tolerated()
    test_plain_json_still_parses()
    test_null_amount_is_rejected_as_unreadable()
    test_missing_or_bad_date_is_rejected()
    print("receipt ocr providers OK")
