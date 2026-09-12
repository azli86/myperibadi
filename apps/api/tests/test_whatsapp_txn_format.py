"""Format check for the WhatsApp transaction confirmation message.

Renders the BM/EN `saved` templates and the money-lifespan footer with the
exact shape the new layout promises: no bullet prefixes, blank line after the
reference id, and the two separator rules.
"""
import re
import sys

sys.path.insert(0, ".")



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
    time_note="\nTime: 10.00AM",
    balance="RM 187.40",
    backdate_hint="",
    private_value="RM ••••••",
    wallet_name="x",
)


def check(lang):
    out = _template(lang).format(
        txn_type_label="Expense" if lang == "EN" else "Perbelanjaan", **ARGS
    )
    assert "•" not in out, f"{lang}: bullet prefix left behind: {out!r}"
    head = out.split("\n")
    assert head[0].startswith("🔴 *TXN26-WMASOD*"), head[0]
    assert head[1] == "", f"{lang}: expected blank line after ref id"
    assert out.count("────────────────") == 2, f"{lang}: separator count"
    assert "Balance Wallet" in out or "Baki Dompet" in out, f"{lang}: wallet balance line"
    assert "All Wallets Balance" in out or "Jumlah Semua Dompet" in out, f"{lang}: total line"
    print(f"{lang} OK")
    print(out)
    print()


if __name__ == "__main__":
    check("BM")
    check("EN")
    print("whatsapp transaction format OK")
