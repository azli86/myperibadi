"""A leading kind word must be honoured, not swallowed by the keyword matcher.

Reported: "income grab tng" was recorded as an expense under the Grab category. The
word "income" was ignored. get_category_by_keywords tries the first word as a keyword,
then the whole string as a single keyword, so with "income" leading, the remaining
words could never match -- and with no category found the type silently defaulted to
expense. The user said income and got spending.

The fix strips a leading kind word before matching and records it, so the stated kind
drives the type. These checks run the real regex from the module against the real
phrases, so a widened or narrowed alias list fails here.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

SERVICE = Path(__file__).resolve().parents[1] / "whatsapp_service.py"

# The exact expression as it appears in the source. Kept in one place so the test
# fails when the module changes rather than drifting from it.
PATTERN_SOURCE = r"^\s*(income|pendapatan|gaji|salary|expense|expenses|belanja|perbelanjaan)\b[\s,:-]*"
INCOME_WORDS = {"income", "pendapatan", "gaji", "salary"}


@pytest.fixture(scope="module")
def pattern() -> re.Pattern[str]:
    return re.compile(PATTERN_SOURCE, flags=re.IGNORECASE)


def split_leading_kind(pattern: re.Pattern[str], text: str) -> tuple[str | None, str]:
    """Mirrors the branch in whatsapp_service.py."""
    match = pattern.match(text or "")
    if not match:
        return None, text
    word = match.group(1).lower()
    kind = "income" if word in INCOME_WORDS else "expense"
    return kind, (text or "")[match.end() :].strip()


def test_the_reported_command_now_states_income(pattern):
    kind, rest = split_leading_kind(pattern, "income grab tng")
    assert kind == "income"
    assert rest == "grab tng", rest


def test_the_remaining_text_can_still_match_a_category(pattern):
    """The whole point: 'grab' must still be visible to the keyword matcher."""
    _, rest = split_leading_kind(pattern, "income grab tng")
    assert "grab" in rest.split()
    # and the wallet word survives too, so the wallet is still found
    assert "tng" in rest.split()


def test_expense_words_are_recognised(pattern):
    for phrase in ("expense grab tng", "belanja makan tng", "expenses food"):
        kind, _ = split_leading_kind(pattern, phrase)
        assert kind == "expense", phrase


def test_only_a_leading_word_counts(pattern):
    """'grab 18.50 tng' is a plain expense; nothing is stripped."""
    kind, rest = split_leading_kind(pattern, "grab 18.50 tng")
    assert kind is None
    assert rest == "grab 18.50 tng"


def test_longer_words_are_not_treated_as_the_alias(pattern):
    """Without the word boundary, 'incomes' and 'grabfood' would be mangled.

    'salaryman' and 'expenseslip' are the same shape: the alias is a prefix of a
    longer word with no boundary between them, so none of the four may match.
    """
    for phrase in ("incomes grab", "grabfood 20 tng", "salaryman 20", "expenseslip 5"):
        kind, rest = split_leading_kind(pattern, phrase)
        assert kind is None, phrase
        assert rest == phrase, rest


def test_a_following_word_does_not_count_as_the_alias(pattern):
    """The alias must lead. 'grab income tng' is a Grab expense with a note."""
    kind, rest = split_leading_kind(pattern, "grab income tng")
    assert kind is None, "a kind word in the middle must not set the type"
    assert rest == "grab income tng"


def test_amounts_are_not_consumed_by_the_alias(pattern):
    """'income 3500 maybank' keeps its amount so extract_amount still finds it."""
    kind, rest = split_leading_kind(pattern, "income 3500 maybank")
    assert kind == "income"
    assert rest.split()[0] == "3500", rest


def test_the_module_uses_this_pattern_and_the_stated_kind():
    """Confirms the source still strips the prefix and falls back to the stated kind."""
    src = SERVICE.read_text()
    assert PATTERN_SOURCE in src, "the leading-kind pattern changed or moved"
    assert 'txn_type = forced_kind or stated_kind or "expense"' in src, (
        "the fallback no longer honours the kind the user typed"
    )
    assert "category.kind != stated_kind" in src, (
        "a contradicting category match is no longer overridden by the stated kind"
    )


if __name__ == "__main__":
    p = re.compile(PATTERN_SOURCE, flags=re.IGNORECASE)
    test_the_reported_command_now_states_income(p)
    test_the_remaining_text_can_still_match_a_category(p)
    test_expense_words_are_recognised(p)
    test_only_a_leading_word_counts(p)
    test_longer_words_are_not_treated_as_the_alias(p)
    test_a_following_word_does_not_count_as_the_alias(p)
    test_amounts_are_not_consumed_by_the_alias(p)
    test_the_module_uses_this_pattern_and_the_stated_kind()
    print("leading kind word checks passed")
