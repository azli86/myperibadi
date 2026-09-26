"""The subscription detail page leads with the monthly amount and follows the theme.

Pinned here:

1. The hero is the .subscription-hero dark card globals.css defines for this
   module, with the debt page's gradient and blooms (commit efb9aad made that
   card the reference for every summary hero).

2. The hero forces light text in both themes, so urgency is carried by a
   coloured dot, not by coloured words that the hero would repaint.

3. The cycle bar only renders for an active subscription; an inactive one has
   no due date to count toward.

4. Every payment row opens its transaction.

Run: cd apps/api && venv/bin/python -m tests.test_subscription_detail_layout
"""
from pathlib import Path

PAGE = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]" / "subscription"
    / "[subscriptionId]" / "page.tsx"
).read_text(encoding="utf-8")

BODY = PAGE[PAGE.index("lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"):]
BODY = BODY[: BODY.index("</DesktopPageBody>")]

# 1. The module's dark hero, as globals.css and the debt page define it.
assert 'className="subscription-hero relative overflow-hidden rounded-2xl bg-[#1a1a1a]' in BODY
assert "bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" in BODY
assert "-right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" in BODY, "the blooms match debt"

# 2. Tone on a dot.
assert "backgroundColor: isActive ? urgencyColor" in BODY, "status tone rides on a dot"

# 3. The monthly amount leads and goes through the formatter; the bar is gated.
assert "value={summary.amount}" in BODY and 'size="hero"' in BODY
assert BODY.index("{isActive ? (") < BODY.index("cycleProgress * 100"), "the cycle bar needs an active guard"

# 4. Rows open their transaction.
assert "router.push(`/${sessionId}/transactions/${txnLinkId}`)" in BODY

print("subscription detail layout OK")
