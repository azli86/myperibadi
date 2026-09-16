"""Telegram connector page must survive cookie-based auth.

Reported symptom: "kod tak kluar cik / dia kosong shaja" — the pairing code card
stayed at "------".

Cause: auth can run on an HttpOnly cookie, in which case getAccessToken()
returns the sentinel "__cookie_auth__". The page sent `Bearer __cookie_auth__`,
the API rejected it, /telegram/link/request answered 401, and the UI fell into
its catch branch. Server logs showed the exact pair:

    POST /telegram/link/request HTTP/1.1" 401 Unauthorized
    POST /telegram/link/request HTTP/1.1" 401 Unauthorized

Every other authed page in the app guards with isCookieAuthSentinel; this one
did not.

Run: cd apps/api && venv/bin/python -m tests.test_telegram_cookie_auth
"""
from pathlib import Path

WEB = Path(__file__).resolve().parents[2] / "web" / "src"
PAGE = (WEB / "app" / "[sessionId]" / "telegram" / "page.tsx").read_text(encoding="utf-8")


def test_page_imports_the_sentinel_guard():
    assert "isCookieAuthSentinel" in PAGE, "telegram page must guard against cookie-auth tokens"


def test_bearer_header_is_skipped_for_cookie_auth():
    assert "if (!isCookieAuthSentinel(token)) headers.set(\"Authorization\"" in PAGE, \
        "sending Bearer __cookie_auth__ makes the API answer 401"


def test_sentinel_guard_matches_the_rest_of_the_app():
    # Nine other pages already use this exact shape; keep telegram consistent.
    badges = (WEB / "app" / "[sessionId]" / "badges" / "page.tsx").read_text(encoding="utf-8")
    assert "isCookieAuthSentinel(token)" in badges, "reference guard disappeared"


def test_fresh_code_is_scrolled_into_view():
    # The code card sits under the status card while the trigger is in the header,
    # so on a phone the generated code stays off-screen.
    assert 'id="telegram-pair-code"' in PAGE, "code card needs a scroll target"
    assert 'getElementById("telegram-pair-code")?.scrollIntoView' in PAGE, \
        "generating a code must reveal it"


def test_no_blank_code_fallback_left_unexplained():
    # "------" is the placeholder; it must only appear before a code exists.
    assert '{pairCode?.code || "------"}' in PAGE
    assert "Belum jana kod" in PAGE, "placeholder needs an explicit explanation"


if __name__ == "__main__":
    test_page_imports_the_sentinel_guard()
    test_bearer_header_is_skipped_for_cookie_auth()
    test_sentinel_guard_matches_the_rest_of_the_app()
    test_fresh_code_is_scrolled_into_view()
    test_no_blank_code_fallback_left_unexplained()
    print("telegram cookie auth OK")
