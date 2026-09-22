"""The Telegram hourglass must be edited into the reply, never deleted.

Media updates are handled on a background route that owns the hourglass, so the
edit lives there and the handler hands its text back instead of sending it. The
handler still answers directly for everything that had no hourglass.

Run: venv/bin/python -m tests.test_telegram_processing_placeholder
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.telegram_webhook_entry import routes as entry
from modules.telegram_webhook_handler import routes as handler

ENTRY = open(entry.__file__, encoding="utf-8").read()
HANDLER = open(handler.__file__, encoding="utf-8").read()


def check_entry_edits_the_hourglass():
    assert "edit_telegram_message_text" in ENTRY, "entry route never edits"
    assert 'reply = (result or {}).get("reply")' in ENTRY, "entry route drops the reply"
    assert "processing_message_id = None" in ENTRY, (
        "entry route still deletes the message it just edited"
    )


def check_entry_still_cleans_up_when_editing_is_impossible():
    after_edit = ENTRY.index("processing_message_id = None")
    tail = ENTRY[after_edit:]
    assert "finally:" in tail and "delete_telegram_message" in tail, (
        "no fallback cleanup once the edit did not happen"
    )


def check_handler_does_not_send_media_replies_twice():
    assert "media_handled = True" in HANDLER, "handler no longer tracks the media reply"
    assert "if reply and not media_handled:" in HANDLER, (
        "handler would both send and return the media reply"
    )


def check_handler_returns_the_reply():
    # Handled media is the only case the entry route may replace; every other
    # reply is sent here, so returning it too would post it twice.
    assert 'return {"ok": True, "reply": reply if media_handled else None}' in HANDLER, (
        "handler does not hand only the media reply to the entry route"
    )


def check_no_second_hourglass():
    """Only the entry route may create one, or the chat shows two."""
    assert "⏳" not in HANDLER, "handler sends its own hourglass again"
    assert "build_telegram_processing_text(payload)" in ENTRY, (
        "entry route lost its hourglass"
    )


def main():
    check_entry_edits_the_hourglass()
    check_entry_still_cleans_up_when_editing_is_impossible()
    check_handler_does_not_send_media_replies_twice()
    check_handler_returns_the_reply()
    check_no_second_hourglass()
    print("telegram processing placeholder OK")


if __name__ == "__main__":
    main()
