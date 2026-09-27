"""Wallet cards are drawn in the wallet's own colour, at full strength.

The wallet page mixed the chosen card_color at 8-18% into the card surface, so
every wallet looked pale grey. The cards now use the colour as set, and a
.wallet-card-solid class in globals.css re-points the theme tokens inside the
card so all text turns white without touching each element. The light theme's
!important remaps resolve to var(--text)/var(--muted), so they follow it too.

Run: cd apps/api && venv/bin/python -m tests.test_wallet_card_colour
"""
from pathlib import Path

WEB = Path(__file__).resolve().parents[2] / "web" / "src" / "app"
PAGE = (WEB / "[sessionId]" / "wallet-settings" / "page.tsx").read_text(encoding="utf-8")
CSS = (WEB / "globals.css").read_text(encoding="utf-8")

assert "color-mix(in srgb, ${accent.from}" not in PAGE, "no pale mix of the wallet colour"
# Preview, list card, mobile deck and desktop deck (4), plus the two colour
# pickers, whose swatches show the card gradient (2).
assert PAGE.count("linear-gradient(135deg, ${accent.from} 0%, ${accent.to} 100%)") == 6, \
    "every card and swatch uses the full colour"
assert PAGE.count("wallet-card-solid ") == 4
assert PAGE.count('"--wallet-from": accent.from') == 4

block = CSS[CSS.index(".wallet-card-solid {"):]
block = block[: block.index("}")]
for token in ("--text: #ffffff", "--muted:", "--card: var(--wallet-from", "--icon-bg:", "--border:"):
    assert token in block, f"{token} must be re-pointed inside the card"

# The palette lives in one shared file, so a new colour shows the same on the
# wallet page, the dashboard, the phone home and bank reconciliation.
LIB = (WEB.parent / "lib" / "wallet-accents.ts").read_text(encoding="utf-8")
for f in ("[sessionId]/wallet-settings/page.tsx", "[sessionId]/bank-reconciliation/page.tsx",
          "[sessionId]/DashboardHome.tsx", "[sessionId]/PwaHome.tsx"):
    src = (WEB / f).read_text(encoding="utf-8")
    assert '@/lib/wallet-accents"' in src, f"{f} must use the shared palette"
    assert 'key: "indigo", label: "Indigo", color: "#4f46e5"' not in src, f"{f} keeps no copy of the palette"
assert LIB.count('{ key: "') >= 18, "the six originals plus the added colours"

# Wallets that never picked a colour must keep the one they have: the id-based
# fallback spreads over the original six only.
assert "const FALLBACK_ACCENTS = WALLET_ACCENTS.slice(0, 6)" in LIB
assert "FALLBACK_ACCENTS[Math.abs(wallet?.id ?? 0) % FALLBACK_ACCENTS.length]" in LIB
order = [k for k in ("indigo", "pink", "amber", "emerald", "cyan", "violet")]
positions = [LIB.index(f'key: "{k}"') for k in order]
assert positions == sorted(positions), "the original six keep their order"

print("wallet card colour OK")
