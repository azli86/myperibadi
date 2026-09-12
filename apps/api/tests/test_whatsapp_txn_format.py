"""Format check for the WhatsApp transaction confirmation message.

Renders the BM/EN `saved` templates and the money-lifespan footer with the
exact shape the new layout promises: no bullet prefixes, blank line after the
reference id, and the two separator rules.
"""
import re
import sys

sys.path.insert(0, ".")

from whatsapp_service import RULE_LINE, format_corporate_bot_reply  # noqa: E402



def _template(lang):
    src = open("whatsapp_service.py", encoding="utf-8").read()
    blocks = re.findall(r"^\s+\"saved\": (\".*\"),$", src, re.M)
    # BM block first, EN block second.
    return eval(blocks[0] if lang == "BM" else blocks[1])


ARGS = dict(
    status_mark="🔴",
    ref_id="TXN26-WMASOD",
    text="Makan nasi goreng ayam",
    cat="Makanan & Minuman",
    amount="RM 1.00",
    wallet_plain="Public Bank",
    wallet_balance="RM 40.00",
    txn_date="12/09/2026",
    time_note="\nTime: *10.00AM*",
    balance="RM 187.40",
    backdate_hint="",
    private_value="RM ••••••",
    wallet_name="x",
    rule=RULE_LINE,
)


def check(lang):
    out = _template(lang).format(
        txn_type_label="Expense" if lang == "EN" else "Perbelanjaan", **ARGS
    )
    assert "•" not in out, f"{lang}: bullet prefix left behind: {out!r}"
    assert out.count("*") % 2 == 0, f"{lang}: unbalanced bold markers: {out!r}"
    head = out.split("\n")
    assert head[0].startswith("🔴 *TXN26-WMASOD*"), head[0]
    assert head[1] == "", f"{lang}: expected blank line after ref id"
    # Values are bolded; labels stay plain so the line reads without markdown noise.
    for line in out.split("\n"):
        if ": " in line and not line.startswith("🔴"):
            label, _, value = line.partition(": ")
            if label in ("Nota", "Note"):
                # Free text: the user's own note may contain markdown.
                continue
            assert "*" not in label, f"{lang}: label bolded: {line!r}"
            if value:
                assert value.startswith("*") and value.endswith("*"), f"{lang}: value not bolded: {line!r}"
    rule = RULE_LINE
    assert out.count(rule) == 2, f"{lang}: separator count"
    assert "Balance Wallet" in out or "Baki Dompet" in out, f"{lang}: wallet balance line"
    assert "All Wallets Balance" in out or "Jumlah Semua Dompet" in out, f"{lang}: total line"
    # The corporate-style scrub deletes decorative rule lines; ours must survive it.
    cleaned = format_corporate_bot_reply(out)
    assert cleaned.count(rule) == 2, f"{lang}: separator stripped by formatter"
    print(f"{lang} OK")
    print(out)
    print()


if __name__ == "__main__":
    check("BM")
    check("EN")
    print("whatsapp transaction format OK")
