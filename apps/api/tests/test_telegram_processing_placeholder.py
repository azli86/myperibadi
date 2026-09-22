"""Telegram shows one hourglass, sends the reply, then removes it.

The entry route owns the hourglass for media updates: it writes one, lets the
handler do the work, and deletes it once the reply is out. The handler never
writes a second one and never edits.

Run: venv/bin/python -m tests.test_telegram_processing_placeholder
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.telegram_webhook_entry import routes as entry
from modules.telegram_webhook_handler import routes as handler

ENTRY = open(entry.__file__, encoding="utf-8").read()
HANDLER = open(handler.__file__, encoding="utf-8").read()


def check_entry_writes_and_removes_the_hourglass():
    assert "build_telegram_processing_text(payload)" in ENTRY, "entry sends no hourglass"
    assert "async with session_factory() as db:" in ENTRY, "entry does not run the work"
    after = ENTRY.index("async with session_factory() as db:")
    tail = ENTRY[after:]
    assert "finally:" in tail, "entry no longer cleans up"
    assert "await delete_telegram_message(processing_chat_id, processing_message_id)" in tail, (
        "the hourglass is never removed"
    )


def check_entry_removes_it_even_when_sending_fails():
    """A stuck hourglass is worse than no hourglass, so every path must clean up."""
    assert "except Exception as exc:" in ENTRY, "entry has no error path"
    after_except = ENTRY.index("except Exception as exc:")
    between = ENTRY[after_except : ENTRY.index("finally:", after_except)]
    assert "send_telegram_message(" in between, "no fallback notice on failure"


def check_handler_sends_the_reply_itself():
    assert "_send_telegram_message(" in HANDLER, "handler no longer sends anything"
    assert "_edit_telegram_message_text" not in HANDLER, (
        "handler edits a message it does not own"
    )
    assert "⏳" not in HANDLER, "handler writes a second hourglass"


def check_handler_still_uses_a_held_photo():
    """A photo held for a category prompt is the only copy left when answered."""
    assert "pending_media = _pop_telegram_pending_media" in HANDLER, (
        "the held photo is never claimed"
    )
    assert "if pending_media and reply_txn_ref:" in HANDLER, (
        "the held photo branch changed"
    )


def check_only_one_call_gets_the_fresh_photo():
    """Running the receipt twice replies with nothing the second time."""
    first = HANDLER.index("result = await _process_bot_input(")
    second = HANDLER.index("media_result = await _process_bot_input(")
    assert first < second, "call order changed"
    assert "media_payload=media_payload" in HANDLER[first:second], (
        "the first call no longer receives the fresh photo"
    )


def check_the_route_actually_writes_and_removes_the_hourglass():
    """Run the entry route against a fake transport.

    String checks could not tell a working route from a broken one; this runs it
    and records what the user would see.
    """
    import asyncio

    seen = []

    async def send(chat_id, text, **kwargs):
        seen.append(("send", chat_id, text))
        return {"result": {"message_id": 42}}

    async def delete(chat_id, message_id):
        seen.append(("delete", chat_id, message_id))
        return {"ok": True}

    class _Payload:
        def __init__(self, **data):
            self.message = data.get("message")

        def model_dump(self):
            return {"message": self.message}

    class _Db:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    async def handle(payload, db):
        seen.append(("handle",))
        await send("5864777376", "the answer")
        return {"ok": True}

    asyncio.run(
        entry.process_telegram_webhook_payload_background_route(
            payload_data={"message": {"chat": {"id": 5864777376}}},
            payload_model=_Payload,
            telegram_should_show_processing_before_handle=lambda payload: True,
            send_telegram_message=send,
            build_telegram_processing_text=lambda payload: "⏳",
            session_factory=lambda: _Db(),
            handle_telegram_webhook_payload=handle,
            delete_telegram_message=delete,
        )
    )
    assert [step[0] for step in seen] == ["send", "handle", "send", "delete"], seen
    assert seen[0][2] == "⏳", "the first message is not the hourglass"
    assert seen[1][0] == "handle", "the work runs before the hourglass"
    assert seen[-1] == ("delete", "5864777376", 42), (
        "the hourglass is not removed at the end"
    )


def check_the_hourglass_is_removed_when_the_work_fails():
    import asyncio

    seen = []

    async def send(chat_id, text, **kwargs):
        seen.append(("send", text))
        return {"result": {"message_id": 42}}

    async def delete(chat_id, message_id):
        seen.append(("delete", message_id))
        return {"ok": True}

    class _Payload:
        def __init__(self, **data):
            self.message = data.get("message")

        def model_dump(self):
            return {"message": self.message}

    class _Db:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    async def handle(payload, db):
        raise RuntimeError("boom")

    asyncio.run(
        entry.process_telegram_webhook_payload_background_route(
            payload_data={"message": {"chat": {"id": 5864777376}}},
            payload_model=_Payload,
            telegram_should_show_processing_before_handle=lambda payload: True,
            send_telegram_message=send,
            build_telegram_processing_text=lambda payload: "⏳",
            session_factory=lambda: _Db(),
            handle_telegram_webhook_payload=handle,
            delete_telegram_message=delete,
        )
    )
    assert ("delete", 42) in seen, f"a failed run left the hourglass spinning: {seen}"


def main():
    check_the_route_actually_writes_and_removes_the_hourglass()
    check_the_hourglass_is_removed_when_the_work_fails()
    check_entry_writes_and_removes_the_hourglass()
    check_entry_removes_it_even_when_sending_fails()
    check_handler_sends_the_reply_itself()
    check_handler_still_uses_a_held_photo()
    check_only_one_call_gets_the_fresh_photo()
    print("telegram processing placeholder OK")


if __name__ == "__main__":
    main()
