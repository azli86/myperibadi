"""Self-check for AI command routing (pure logic, no DB or network).

Run: venv/bin/python -m tests.test_ai_command_router
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai_command_router import build_command_text, parse_router_reply, sanitize_category


def test_build_command_text_whitelist():
    assert build_command_text("list") == "list"
    assert build_command_text("summary", 123) == "summary"
    assert build_command_text("wallets") == "checkwallet"
    assert build_command_text("debts") == "debt list"
    # Mutating commands are not in the whitelist — the AI can never run them.
    for banned in ["transfer", "delete", "loanx pay kereta 500", "subx pay astro 89.9 tng"]:
        assert build_command_text(banned) is None, banned
    assert build_command_text(None) is None
    assert build_command_text({"command": "list"}) is None


def test_category_arg_sanitised():
    assert build_command_text("budget_remaining", "Makanan!") == "budget baki makanan"
    assert build_command_text("budget_remaining", "  makan   luar ") == "budget baki makan luar"
    # Free text that tries to become a second command is flattened, not executed.
    assert build_command_text("budget_remaining", "makan; rm -rf /") == "budget baki makan rm -rf"
    assert build_command_text("budget_remaining", "") is None
    assert build_command_text("budget_remaining", "x") is None
    assert build_command_text("budget_remaining", "a" * 60) is None
    assert sanitize_category(["makanan"]) is None
    assert build_command_text("category_list") == "category"
    assert build_command_text("category_keywords", "Makanan") == "category makanan"
    # No usable category -> directory listing instead of a dead end.
    assert build_command_text("category_keywords", "") == "category"


def test_parse_router_reply():
    assert parse_router_reply('{"command": "list"}') == {"command": "list"}
    assert parse_router_reply('```json\n{"command": "summary", "category": ""}\n```') == {
        "command": "summary",
        "category": "",
    }
    assert parse_router_reply('Sure!\n{"command": "wallets"}\nHope that helps.') == {"command": "wallets"}
    assert parse_router_reply("[1, 2, 3]") is None
    assert parse_router_reply("") is None
    assert parse_router_reply(None) is None


if __name__ == "__main__":
    test_build_command_text_whitelist()
    test_category_arg_sanitised()
    test_parse_router_reply()
    print("ai_command_router OK")
