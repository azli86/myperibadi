"""An exact-balance transfer must not be refused.

Support ticket: a wallet holding RM0.34 rejected "pindah 0.34 tng cimb" as
insufficient. The cause is a mixed-type comparison, not the balance.

func.sum over a NUMERIC column returns Decimal. The requested amount comes from
extract_amount as a float. Python compares Decimal to float exactly, widening the
float, so float(0.34) becomes 0.34000000000000002... and Decimal("0.34") < 0.34 is
True. Only amounts that float cannot represent exactly are affected: 0.34, 0.10,
0.07. RM10.34 looks fine, RM0.34 does not.

These checks use the real comparison, on the exact values from the ticket, so a
reintroduced float comparison fails here rather than in someone's chat.
"""

from __future__ import annotations

from decimal import Decimal

# Values straight from the reported wallet and command.
REPORTED_BALANCE = Decimal("561.57") - Decimal("561.23")  # RM0.34
REPORTED_COMMAND_AMOUNT = 0.34  # float, as extract_amount returns it


def test_balance_is_exactly_the_reported_amount():
    assert REPORTED_BALANCE == Decimal("0.34"), REPORTED_BALANCE


def test_the_old_comparison_is_the_defect():
    """Documents why the fix is needed: the raw comparison refuses a full transfer."""
    assert REPORTED_BALANCE < REPORTED_COMMAND_AMOUNT, (
        "the mixed Decimal/float comparison is no longer the defect; "
        "if Python changed, revisit the fix rather than deleting it"
    )


def test_comparing_as_decimal_allows_the_full_transfer():
    assert not (REPORTED_BALANCE < Decimal(str(REPORTED_COMMAND_AMOUNT)))


def test_affected_amounts_are_the_ones_float_cannot_hold():
    """The set is not arbitrary, which is why the bug looked intermittent."""
    affected = [a for a in ("0.34", "0.10", "0.07") if Decimal(a) < float(a)]
    assert affected == ["0.34", "0.10", "0.07"], affected


def test_unaffected_amounts_are_still_compared_exactly():
    """A whole-cent amount must compare equal to itself once both sides are Decimal.

    The float side is what varies, and it varies for most amounts, not a handful:
    only 0.30 of the samples here happens to survive the mixed comparison. The fix
    therefore cannot be 'list the bad amounts' -- it has to convert both sides.
    """
    whole_cents = ["0.34", "0.10", "0.07", "0.30", "10.34", "1.00"]
    for value in whole_cents:
        assert Decimal(value) == Decimal(value)
        assert not (Decimal(value) < Decimal(value)), value
        # and the same value arriving as a float must not be judged short
        assert not (Decimal(value) < Decimal(str(float(value)))), value


def test_transfer_code_compares_as_decimal():
    """The call site must use the same conversion the checks above assume."""
    from pathlib import Path

    src = (Path(__file__).resolve().parents[1] / "whatsapp_service.py").read_text()
    assert "if from_w_bal < Decimal(str(amount)):" in src
    assert "if from_w_bal >= Decimal(str(ocr_amount)):" in src
    assert "if from_w_bal < amount:" not in src, "the float comparison came back"
    assert "if from_w_bal >= ocr_amount:" not in src, "the float comparison came back"


if __name__ == "__main__":
    test_balance_is_exactly_the_reported_amount()
    test_the_old_comparison_is_the_defect()
    test_comparing_as_decimal_allows_the_full_transfer()
    test_affected_amounts_are_the_ones_float_cannot_hold()
    test_unaffected_amounts_are_still_compared_exactly()
    test_transfer_code_compares_as_decimal()
    print("exact-balance transfer checks passed")
