"""Budget bot commands must honour an explicit month and ampersand categories.

Two bugs from ticket #7:

  budget set FnB 300 @2026-11        -> set for 2026-09 (month ignored)
  budget set Food & Drinks 300 @...  -> "Category food drinks 300 2026-11 not found"

Both came from normalize_message_text running first: it strips '@' and '&', so
the month marker reached extract_month_token as a bare "2026-11" and never
matched, while a category named "Food & Drinks" lost its ampersand and could
not be looked up. The month is now taken from the raw text before normalizing,
normalization happens on the remainder, and a stray '@word' is reported as a
bad month instead of leaking into the category name.
"""

from __future__ import annotations

import sys
import pathlib

API = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API))

import budget_service  # noqa: E402


def test_month_token_is_read_from_raw_text():
    month, cleaned, invalid = budget_service.extract_month_token("set FnB 300 @2026-11")
    assert month == "2026-11"
    assert invalid is False
    assert cleaned == "set FnB 300"


def test_ampersand_category_survives_extraction():
    month, cleaned, invalid = budget_service.extract_month_token("set Food & Drinks 300 @2026-11")
    assert month == "2026-11"
    assert "&" in cleaned


def test_malformed_month_marker_is_reported():
    month, cleaned, invalid = budget_service.extract_month_token("set makanan 500 @bukan-bulan")
    assert invalid is True
    assert month is None


def test_no_month_marker_is_not_an_error():
    month, cleaned, invalid = budget_service.extract_month_token("set makanan 600")
    assert invalid is False
    assert month is None


def test_ampersand_and_spacing_compare_equal():
    assert budget_service.normalize_lookup_value("Food & Drinks") == budget_service.normalize_lookup_value("food  drinks")


def test_loose_month_pattern_is_defined():
    assert budget_service.MONTH_TOKEN_LOOSE_PATTERN.search("@2026-11")
    assert budget_service.MONTH_TOKEN_LOOSE_PATTERN.search("@bukan-bulan")


def test_budget_command_normalizes_after_month_removal():
    source = (API / "whatsapp_service.py").read_text(encoding="utf-8")
    start = source.index("async def _process_budget_command(")
    body = source[start : source.index("\nasync def ", start + 10)]
    # the month is extracted from raw text, normalization happens on the remainder
    assert "raw_body = text.strip().split(maxsplit=1)[1]" in body
    assert "budget_service.extract_month_token(raw_body)" in body
    assert "command_body = normalize_message_text(raw_body).strip()" in body


def test_category_lookup_uses_household_keywords():
    """A budget command must accept the same keywords the transaction bot does."""
    source = (API / "budget_service.py").read_text(encoding="utf-8")
    start = source.index("async def find_expense_category_by_name(")
    body = source[start : source.index("\nasync def ", start + 10)] if "\nasync def " in source[start + 10 :] else source[start:]
    assert "models.CategoryKeyword" in body, "keyword layer missing"
    assert "is_active == True" in body
    # exact name match still takes priority over the keyword layer
    assert body.index("exact_matches") < body.index("models.CategoryKeyword")
