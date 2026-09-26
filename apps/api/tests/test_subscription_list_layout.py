"""The subscription list leads with the monthly total and groups by what to do.

Pinned here:

1. The summary is the .subscription-hero dark card globals.css defines for this
   module, with the debt page's gradient and blooms.

2. Rows are grouped into due soon / upcoming / inactive, and empty groups are
   dropped rather than shown as empty cards.

3. The Active / All toggle is rendered. It was defined but never mounted, so
   inactive subscriptions could not be listed at all.

4. Each row is one tap target that opens the detail panel.

Run: cd apps/api && venv/bin/python -m tests.test_subscription_list_layout
"""
from pathlib import Path

PAGE = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]" / "subscription" / "page.tsx"
).read_text(encoding="utf-8")

BODY = PAGE[PAGE.index("const renderSubscriptionRow"):]
BODY = BODY[: BODY.index("{/* ─── Add/Edit Sheet ─── */}")]

# 1. The module's dark hero.
HERO = BODY[BODY.index("const renderSummary"):BODY.index("const renderList")]
assert '"subscription-hero relative overflow-hidden rounded-2xl bg-[#1a1a1a]' in HERO
assert "-right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" in HERO, "the blooms match debt"
assert "value={Number(summary.totalMonthly || 0)}" in HERO, "the monthly total leads"

# 2. Grouping.
for label in ("Perlu dibayar", "Akan datang", "Tak aktif"):
    assert label in BODY, f"missing group: {label}"
assert ".filter((s) => s.items.length > 0)" in BODY, "empty groups are dropped"

# 3. The toggle is mounted.
assert BODY.count("{filterToggle}") == 1, "the Active / All toggle must render"

# 4. One tap target per row.
row = BODY[: BODY.index("const sections")]
assert row.count("<button") == 1 and "onClick={() => openDetail(c.id)}" in row

for tone in ("rose", "amber"):
    assert f"text-{tone}-700 dark:text-{tone}-400" in BODY, f"{tone} needs a light-mode shade"

print("subscription list layout OK")
