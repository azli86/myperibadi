"""The transaction page leads with the amount, plainly, like the phone home.

Pinned here:

1. The summary is not a card: no hardcoded dark slab. It is centred on the
   page with the merchant as the title and the amount as the largest thing.

2. Income reads green with a darker light-mode shade; spending keeps the text
   colour. A -500 tone on white is under 4.5:1.

3. Actions are round labelled buttons (48px), not underlined links.

4. Rows are divided with --divider; --border is transparent in every theme.

5. Items read like the printed receipt, with a dashed rule above the total.

Run: cd apps/api && venv/bin/python -m tests.test_transaction_detail_layout
"""
from pathlib import Path

DIR = Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]" / "transactions" / "[txnId]"
PAGE = (DIR / "page.tsx").read_text(encoding="utf-8")
SUMMARY = (DIR / "sections" / "TxnSummaryCard.tsx").read_text(encoding="utf-8")
DETAILS = (DIR / "sections" / "TxnDetailsList.tsx").read_text(encoding="utf-8")
ITEMS = (DIR / "sections" / "TxnItemsTable.tsx").read_text(encoding="utf-8")

# 1.
assert "#1a1a1a" not in SUMMARY, "no dark slab behind the amount"
assert "title={txnDisplay.title || txn.vendor_or_source}" in PAGE, "the merchant is the title"
assert "text-[2.75rem] md:text-6xl" in SUMMARY

# 2.
assert '"text-emerald-700 dark:text-emerald-400"' in PAGE
assert 'const amountClass = isIncome ? "text-emerald-500" : "text-rose-500"' not in PAGE

# 3.
assert PAGE.count("<TxnActionButton") >= 4, "edit, refund, tax and delete"
assert "h-12 w-12" in SUMMARY and "underline" not in SUMMARY

# 4.
assert "divide-[var(--divider)]" in DETAILS and "divide-[var(--border)]" not in DETAILS

# 5.
assert "border-dashed border-[var(--divider)]" in ITEMS
assert "<table" not in ITEMS

print("transaction detail layout OK")
