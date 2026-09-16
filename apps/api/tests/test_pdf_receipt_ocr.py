"""PDF receipts must reach the OCR renderer, whatever mime the sender labelled them.

WhatsApp sends `application/octet-stream` for documents and some clients append
`; charset=binary`, so an exact compare on `application/pdf` dropped every PDF before
ghostscript could turn it into a PNG. The bytes are the source of truth.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import receipt_ocr_service as ocr


# A real, renderable one-page PDF. Ghostscript rejects a stub without an xref table,
# and the test has to exercise the same path a phone's PDF receipt does.
PDF = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R"
    b"/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
    b"4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 20 160 Td (TOTAL RM 9.90) Tj ET\nendstream\nendobj\n"
    b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
    b"trailer<</Root 1 0 R>>\n"
)
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"0" * 32


def test_pdf_mime_variants_all_reach_the_renderer():
    for label in (
        "application/pdf",
        "application/pdf; charset=binary",
        "APPLICATION/PDF",
        "application/x-pdf",
        "  application/pdf  ",
        "",
        "application/octet-stream",
    ):
        assert ocr._normalize_receipt_mime(PDF, label) == "application/pdf", label


def test_the_gate_accepts_what_the_normalizer_returns():
    # extract_receipt renders a PDF to PNG first, so by the time the allow-list runs the
    # mime is image/png. Prove the render path is what a PDF takes.
    assert ocr._normalize_receipt_mime(PDF, "application/octet-stream") == "application/pdf"


def test_images_are_untouched():
    assert ocr._normalize_receipt_mime(JPEG, "image/jpeg") == "image/jpeg"
    assert ocr._normalize_receipt_mime(JPEG, "image/jpg") == "image/jpeg"
    assert ocr._normalize_receipt_mime(PNG, "image/png; charset=utf-8") == "image/png"
    assert ocr._normalize_receipt_mime(WEBP, "image/webp") == "image/webp"


def test_a_non_pdf_octet_stream_is_still_rejected():
    # The header alone must not let arbitrary bytes through as a PDF.
    assert ocr._normalize_receipt_mime(b"not a pdf at all", "application/octet-stream") == "application/octet-stream"
    assert ocr._normalize_receipt_mime(b"hello", "text/plain") == "text/plain"
    # A lie in the header is corrected by the bytes.
    assert ocr._normalize_receipt_mime(b"hello", "application/pdf") == "application/pdf"


def test_the_pdf_renderer_produces_a_png():
    payload, mime = ocr._pdf_to_png(PDF)
    assert mime == "image/png"
    assert payload.startswith(b"\x89PNG\r\n\x1a\n"), payload[:8]
    assert len(payload) > 200


def test_the_renderer_refuses_bytes_that_are_not_a_pdf():
    import pytest

    with pytest.raises(ValueError):
        ocr._pdf_to_png(b"this is not a pdf")


def _run_extract_with_captured_payload(payload: bytes, mime_type: str) -> tuple[bytes, str]:
    """Call extract_receipt with a stubbed provider and return what it sent upstream.

    This is the level that regressed: the mime gate lives inside extract_receipt, so a
    test that only calls the normalizer would pass even with the gate reverted.
    """
    import asyncio

    seen: dict[str, bytes] = {}
    image = {"image_url": {"url": "data:image/png;base64,AAAA"}}

    async def fake_providers():
        return [{"name": "stub", "api_key": "k", "base_url": "http://stub", "model": "m"}]

    class FakeResponse:
        status_code = 200
        text = ""

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": '{"description":"Tesco","amount":9.9,"date":"2026-03-01","time":null,"category_hint":"Groceries","type":"expense"}'
                        }
                    }
                ]
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, json=None, headers=None):
            body = (json or {}).get("messages", [{}])[0].get("content", [])
            for part in body:
                if isinstance(part, dict) and "image_url" in part:
                    seen["url"] = part["image_url"]["url"]
                    break
            return FakeResponse()

    original_providers = ocr._ocr_providers
    original_client = ocr.httpx.AsyncClient
    ocr._ocr_providers = fake_providers
    ocr.httpx.AsyncClient = FakeClient
    try:
        asyncio.run(ocr.extract_receipt(payload, mime_type, "BM", ["Groceries"]))
    finally:
        ocr._ocr_providers = original_providers
        ocr.httpx.AsyncClient = original_client

    url = seen.get("url", "")
    assert url.startswith("data:image/png;base64,"), url[:40]
    import base64

    return base64.b64decode(url.split(",", 1)[1]), url.split(";", 1)[0]


def test_extract_receipt_renders_a_pdf_labelled_octet_stream():
    rendered, prefix = _run_extract_with_captured_payload(PDF, "application/octet-stream")
    assert prefix == "data:image/png", prefix
    assert rendered.startswith(b"\x89PNG\r\n\x1a\n"), rendered[:8]


def test_extract_receipt_renders_a_pdf_with_a_charset_parameter():
    rendered, prefix = _run_extract_with_captured_payload(PDF, "application/pdf; charset=binary")
    assert prefix == "data:image/png", prefix
    assert rendered.startswith(b"\x89PNG\r\n\x1a\n"), rendered[:8]


def test_extract_receipt_rejects_a_non_pdf_octet_stream():
    import pytest

    with pytest.raises(ValueError):
        _run_extract_with_captured_payload(b"not a pdf at all", "application/octet-stream")


if __name__ == "__main__":
    test_pdf_mime_variants_all_reach_the_renderer()
    test_the_gate_accepts_what_the_normalizer_returns()
    test_images_are_untouched()
    test_a_non_pdf_octet_stream_is_still_rejected()
    test_the_pdf_renderer_produces_a_png()
    test_the_renderer_refuses_bytes_that_are_not_a_pdf()
    test_extract_receipt_renders_a_pdf_labelled_octet_stream()
    test_extract_receipt_renders_a_pdf_with_a_charset_parameter()
    test_extract_receipt_rejects_a_non_pdf_octet_stream()
    print("pdf receipt OCR OK")
