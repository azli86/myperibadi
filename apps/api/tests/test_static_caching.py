"""Static JavaScript is cached; pages, API data and live files are not.

A Cache-Control: no-store sat in the global securityHeaders (source "/:path*"),
which overrode Next's immutable caching of /_next/static. Every open of the app
re-downloaded all of its JavaScript (about 181KB gzip for the home alone), and
Cloudflare bypassed it too. That was the main reason the app felt slow.

Run: cd apps/api && venv/bin/python -m tests.test_static_caching
"""
from pathlib import Path

WEB = Path(__file__).resolve().parents[2] / "web"
CONFIG = (WEB / "next.config.ts").read_text(encoding="utf-8")
MIDDLEWARE = (WEB / "src" / "middleware.ts").read_text(encoding="utf-8")

sec = CONFIG[CONFIG.index("const securityHeaders = ["):CONFIG.index("const nextConfig")]
assert 'key: "Cache-Control"' not in sec, "no global Cache-Control: it would override /_next/static"

def rule(source: str) -> str:
    i = CONFIG.index(f'source: "{source}"')
    return CONFIG[i:CONFIG.index("}", CONFIG.index("headers:", i)) + 1]

assert "public, max-age=31536000, immutable" in rule("/_next/static/:path*")
for src in ("/manifest.webmanifest", "/sw.js", "/build-version.json", "/offline"):
    assert "no-store" in rule(src), f"{src} must not be cached"
# Pages keep no-store through the middleware, which skips _next and api.
assert 'response.headers.set("Cache-Control", "no-store' in MIDDLEWARE
assert "(?!api|_next" in MIDDLEWARE

print("static caching OK")
