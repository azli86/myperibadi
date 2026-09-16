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


def test_code_card_offers_generate_before_a_code_exists():
    # The only trigger used to be a 36px unlabelled icon in the header. Users
    # tapped the lone visible button ("Copy code"), found it disabled, and
    # reported "dia kekal kosong".
    assert 'onClick={() => void (pairCode?.code ? copyCode() : requestPairCode())}' in PAGE, \
        "the in-card button must generate a code while none exists"
    assert '"Jana kod"' in PAGE and '"Generate code"' in PAGE
    assert 'disabled={!pairCode?.code}' not in PAGE, \
        "a disabled button with no path forward is what stranded the user"


def test_instructions_point_at_the_card_not_the_header():
    assert "Tekan Sambung di header" not in PAGE


def test_open_bot_avoids_the_t_me_scheme_redirect():
    # t.me/<bot> redirects to tg://resolve?... and an in-app WebView has no handler
    # for tg:, so the tab dies with "net::ERR_UNKNOWN_URL_SCHEME".
    assert 'href={botUrl}' not in PAGE, "a plain t.me link is what triggers the redirect"
    assert "const botUrl" not in PAGE, "dead variable once the anchor is gone"
    assert '`tg://resolve?domain=${encodeURIComponent(botHandle)}`' in PAGE
    assert 'window.open(webUrl, "_blank", "noopener,noreferrer")' in PAGE, \
        "web Telegram is the fallback when the app does not take over"
    # Handoff is detected from events, never from an artificial delay.
    assert 'window.addEventListener("blur", markHandedOff' in PAGE
    assert 'document.addEventListener("visibilitychange", markHandedOff' in PAGE


def test_bot_name_can_be_copied_as_a_last_resort():
    assert 'navigator.clipboard.writeText(botHandle)' in PAGE
    assert '"Salin nama bot"' in PAGE and '"Copy bot name"' in PAGE


if __name__ == "__main__":
    test_page_imports_the_sentinel_guard()
    test_bearer_header_is_skipped_for_cookie_auth()
    test_sentinel_guard_matches_the_rest_of_the_app()
    test_fresh_code_is_scrolled_into_view()
    test_no_blank_code_fallback_left_unexplained()
    test_code_card_offers_generate_before_a_code_exists()
    test_instructions_point_at_the_card_not_the_header()
    test_open_bot_avoids_the_t_me_scheme_redirect()
    test_bot_name_can_be_copied_as_a_last_resort()
    print("telegram cookie auth OK")
