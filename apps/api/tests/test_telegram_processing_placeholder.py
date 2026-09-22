"""The hourglass placeholder must be replaced in place, never deleted and
re-sent as a second message.

Run: venv/bin/python -m tests.test_telegram_processing_placeholder
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.telegram_webhook_handler import routes as wh

SOURCE = open(wh.__file__, encoding="utf-8").read()


def check_placeholder_is_edited_not_deleted():
    """The reply path picks edit when the placeholder id exists."""
    assert "_edit_telegram_message_text(" in SOURCE, "reply path never edits"
    assert "if processing_message_id:" in SOURCE, "reply path does not branch on the id"


def check_placeholder_survives_until_the_reply():
    """No finally-block delete: that removed the message before the reply."""
    assert "finally:\n            if processing_message_id:" not in SOURCE, (
        "placeholder is still deleted in a finally block"
    )


def check_placeholder_cleared_on_failure():
    """A raised error must not leave the hourglass spinning."""
    assert "except Exception:" in SOURCE, "no failure path for the placeholder"
    idx = SOURCE.index("except Exception:")
    window = SOURCE[idx : idx + 400]
    assert "_delete_telegram_message" in window, "failure path leaves the placeholder"


def check_send_kept_for_the_no_placeholder_case():
    """Messages without a placeholder still go out the normal way."""
    assert "else:\n            await _send_telegram_message(" in SOURCE, (
        "plain replies lost their send path"
    )


def main():
    check_placeholder_is_edited_not_deleted()
    check_placeholder_survives_until_the_reply()
    check_placeholder_cleared_on_failure()
    check_send_kept_for_the_no_placeholder_case()
    print("telegram processing placeholder OK")


if __name__ == "__main__":
    main()
