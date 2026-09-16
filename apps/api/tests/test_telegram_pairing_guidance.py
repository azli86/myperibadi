"""Telegram pairing guidance must point at a real portal path and echo bad input.

Regression: users reset their data, the connector vanishes, and /start used to
reply with a bare example code. Customers then had no idea where the code comes
from and sent the whole sentence instead of the code.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _load():
    # Import only the two builders by executing main.py lazily is impossible
    # (it boots the app), so read the source and exec the functions alone.
    src = (ROOT / "main.py").read_text()
    ns = {
        "APP_BASE_URL": "https://app.myperibadi.com",
        "TELEGRAM_PAIR_CODE_TTL_MINUTES": 30,
    }
    start = src.index("def _build_telegram_pairing_prompt() -> str:")
    end = src.index("async def _get_telegram_wallets_for_user(")
    block = src[start:end]
    exec(compile(block, "main.py", "exec"), ns)
    return ns


def test_pairing_prompt_has_real_portal_link():
    ns = _load()
    text = ns["_build_telegram_pairing_prompt"]()
    assert "https://app.myperibadi.com/connector" in text, text
    # The portal page lives at /connector; /connector/telegram does not exist.
    assert "/connector/telegram" not in text, text
    assert "BD-7K2P9" in text
    assert "30 minit" in text, text


def test_rejected_text_echoes_what_the_user_sent():
    ns = _load()
    text = ns["_build_telegram_pair_code_rejected_text"]("hii kenapa tak boleh link tele")
    assert "Kodi diterima" in text, text
    assert "hii kenapa tak boleh" in text, text
    assert "Received:" in text, text


def test_rejected_text_handles_empty_input():
    ns = _load()
    text = ns["_build_telegram_pair_code_rejected_text"]("   ")
    assert "Kodi diterima" not in text, text
    assert "Connector" in text, text


def test_ttl_default_is_thirty_minutes():
    src = (ROOT / "main.py").read_text()
    assert 'TELEGRAM_PAIR_CODE_TTL_MINUTES = int(os.getenv("TELEGRAM_PAIR_CODE_TTL_MINUTES", "30"))' in src, \
        "5 minutes strands users who read the code, switch apps, then send it"


def test_webhook_uses_the_builders():
    src = (ROOT / "modules/telegram_webhook_handler/routes.py").read_text()
    assert "_build_telegram_pairing_prompt()" in src
    assert "_build_telegram_pair_code_rejected_text(text)" in src
    # The old hardcoded hint must be gone.
    assert "Hantar pairing code dari portal untuk sambung akaun. Contoh" not in src


def test_main_wires_both_builders_into_the_route():
    src = (ROOT / "main.py").read_text()
    assert "_build_telegram_pairing_prompt=_build_telegram_pairing_prompt," in src
    assert "_build_telegram_pair_code_rejected_text=_build_telegram_pair_code_rejected_text," in src


if __name__ == "__main__":
    test_pairing_prompt_has_real_portal_link()
    test_rejected_text_echoes_what_the_user_sent()
    test_rejected_text_handles_empty_input()
    test_ttl_default_is_thirty_minutes()
    test_webhook_uses_the_builders()
    test_main_wires_both_builders_into_the_route()
    print("telegram pairing guidance OK")
