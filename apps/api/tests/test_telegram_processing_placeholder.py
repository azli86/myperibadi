"""The Telegram hourglass must be edited into the reply, never deleted.

Media updates are handled on a background route that owns the hourglass, so the
edit lives there and the handler hands its text back instead of sending it. The
handler still answers directly for everything that had no hourglass.

Run: venv/bin/python -m tests.test_telegram_processing_placeholder
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.telegram_webhook_entry import routes as entry
from modules.telegram_webhook_handler import routes as handler

ENTRY = open(entry.__file__, encoding="utf-8").read()
HANDLER = open(handler.__file__, encoding="utf-8").read()


class _Payload:
    def __init__(self, **data):
        self._data = data
        self.message = data.get("message")

    def model_dump(self):
        return self._data


def check_entry_edits_the_hourglass():
    assert "edit_telegram_message_text" in ENTRY, "entry route never edits"
    assert 'reply = (result or {}).get("reply")' in ENTRY, "entry route drops the reply"
    assert "processing_message_id = None" in ENTRY, (
        "entry route still deletes the message it just edited"
    )


def check_the_edit_call_actually_works():
    """Run the route against a real fake: a wrong arity must fail here, not live."""
    edits = []
    sends = []
    deletes = []

    async def send(chat_id, text, **kwargs):
        sends.append(text)
        return {"result": {"message_id": 77}}

    async def edit(chat_id, message_id, text, *, reply_markup=None):
        edits.append((chat_id, message_id, text))
        return {"ok": True}

    async def delete(chat_id, message_id):
        deletes.append(message_id)
        return {"ok": True}

    class _Db:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    async def handle(payload, db):
        return {"ok": True, "reply": "the answer"}

    asyncio.run(
        entry.process_telegram_webhook_payload_background_route(
            payload_data={"message": {"chat": {"id": 5}}},
            payload_model=_Payload,
            telegram_should_show_processing_before_handle=lambda payload: True,
            send_telegram_message=send,
            edit_telegram_message_text=edit,
            build_telegram_processing_text=lambda payload: "⏳",
            session_factory=lambda: _Db(),
            handle_telegram_webhook_payload=handle,
            delete_telegram_message=delete,
        )
    )
    assert sends == ["⏳"], f"expected only the hourglass to be sent, got {sends}"
    assert edits == [("5", 77, "the answer")], f"hourglass was not edited: {edits}"
    assert deletes == [], "the edited hourglass was deleted anyway"


def check_entry_still_cleans_up_when_editing_is_impossible():
    after_edit = ENTRY.index("processing_message_id = None")
    tail = ENTRY[after_edit:]
    assert "finally:" in tail and "delete_telegram_message" in tail, (
        "no fallback cleanup once the edit did not happen"
    )


def check_handler_does_not_send_media_replies_twice():
    assert "media_handled = True" in HANDLER, "handler no longer tracks the media reply"
    assert "if reply and not media_handled and not media_payload:" in HANDLER, (
        "handler would both send and return a media reply"
    )


def check_handler_returns_media_replies():
    # Every media update gets an hourglass from the entry route, including one with
    # no pending transaction, so all media replies must be handed back, not sent.
    assert "handed_back = media_handled or bool(media_payload)" in HANDLER, (
        "a media reply not handled by the pending branch is sent here instead of "
        "replacing the hourglass"
    )
    assert 'return {"ok": True, "reply": reply if handed_back else None}' in HANDLER, (
        "handler does not hand only the media reply to the entry route"
    )


def check_no_second_hourglass():
    """Only the entry route may create one, or the chat shows two."""
    assert "⏳" not in HANDLER, "handler sends its own hourglass again"
    assert "build_telegram_processing_text(payload)" in ENTRY, (
        "entry route lost its hourglass"
    )


def check_pending_media_survives_the_category_prompt():
    """A photo held for a category answer must still be used by that answer.

    The prompt is answered with plain text, so the saved photo is the only copy
    left. Popping it and then skipping the media branch lost the photo and left
    the user with nothing.
    """
    assert "if not media_payload:\n        pending_media = _pop_telegram_pending_media" in HANDLER, (
        "the saved photo is not claimed for a text answer"
    )
    assert "if pending_media or (media_payload and reply_txn_ref):" in HANDLER, (
        "a claimed photo can still be skipped and thrown away"
    )
    assert 'media_payload=source.get("media_payload") or media_payload' in HANDLER, (
        "the saved photo is never passed to the processor"
    )


def main():
    check_entry_edits_the_hourglass()
    check_the_edit_call_actually_works()
    check_entry_still_cleans_up_when_editing_is_impossible()
    check_handler_does_not_send_media_replies_twice()
    check_handler_returns_media_replies()
    check_pending_media_survives_the_category_prompt()
    check_no_second_hourglass()
    print("telegram processing placeholder OK")


if __name__ == "__main__":
    main()
