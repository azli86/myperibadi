"""Self-check for Telegram splitx command routing (no DB).

Run: venv/bin/python -m tests.test_splitx_command
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.telegram_splitx import routes


class FakeUser:
    id = "test-user"


async def run(command: str, is_bm: bool = True):
    sent = []
    async def send(chat_id, text, linked=False):
        sent.append(text)
    from modules.telegram_splitx.routes import handle_telegram_splitx_command_route

    async def wallet_label(w): return "Wallet"
    async def get_wallets(db, user): return []
    async def match(hints, hint): return None
    async def select(db, user, wid): raise AssertionError("no db in help path")

    ok = await handle_telegram_splitx_command_route(
        None,
        current_user=FakeUser(),
        chat_id="1",
        command_text=command,
        is_bm=is_bm,
        _send_telegram_message=send,
        _wallet_label=wallet_label,
        _get_accessible_wallets_for_user=get_wallets,
        _match_wallet_by_hint=match,
        _select_transaction_wallet=select,
    )
    return ok, sent


async def main():
    # Non-splitx command must not be consumed
    ok, _ = await run("loanx list")
    assert ok is False, "non-splitx command must return False"

    # bare splitx -> help
    ok, sent = await run("splitx")
    assert ok is True and sent, "bare splitx must send help"

    # help variant
    ok, sent = await run("splitx help", is_bm=False)
    assert ok is True and any("Split Bill" in s for s in sent), "splitx help must send text"

    # unrecognized subcommand falls through to the shared bot flow
    ok, sent = await run("splitx tng")
    assert ok is False, "unrecognized/non-legacy subcommand must fall through (return False)"

    # legacy keywords still consumed by the legacy handler
    ok, sent = await run("splitx help", is_bm=False)
    assert ok is True and any("Split Bill" in s for s in sent), "legacy splitx help must be consumed"

    print("splitx_command OK")


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
