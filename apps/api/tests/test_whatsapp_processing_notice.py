"""The WhatsApp worker must recall its hourglass notice once the reply is out.

The worker is plain JS with a live Baileys socket, so this checks the wiring
rather than calling it: every exit from the reply handler has to clear the
notice, and the notice has to be the hourglass with no leftover wording.

Run: venv/bin/python -m tests.test_whatsapp_processing_notice
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

WORKER = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "worker",
    "index_v2.js",
)
SOURCE = open(WORKER, encoding="utf-8").read()


def check_notice_is_only_the_hourglass():
    assert 'const text = "⏳";' in SOURCE, "notice is not the bare hourglass"
    assert "Uploading your attachment" not in SOURCE, "old notice wording survived"


def check_notice_is_remembered_for_recall():
    assert "function clearProcessingNotice(" in SOURCE, "no recall helper"
    assert "sendMessage(sentMsg.key.remoteJid, { delete: sentMsg.key })" in SOURCE, (
        "recall does not delete by the notice key"
    )


def check_reply_edits_the_notice_in_place():
    assert "edit: processingNotice.key" in SOURCE, "reply does not edit the notice"
    assert "editedInPlace = true" in SOURCE, "a successful edit is not recorded"
    assert "if (!sentMsg && !editedInPlace && lastError)" in SOURCE, (
        "a successful edit would be treated as a failed send"
    )
    # The hourglass has become the reply, so it must not also be deleted.
    edit_branch = SOURCE.index("if (editedInPlace) {")
    body = SOURCE[edit_branch : SOURCE.index("} else {", edit_branch)]
    assert "clearProcessingNotice" not in body, (
        "the edited notice is cleaned up as if it were still a placeholder"
    )


def _handler_body():
    """Text of handleWebhookResponse, up to the next top-level function."""
    start = SOURCE.index("async function handleWebhookResponse(")
    rest = SOURCE[start:]
    nxt = rest.index("\nfunction ", 10)
    return rest[:nxt]


def check_every_exit_clears_the_notice():
    body = _handler_body()
    exits = re.findall(r"^\s*return;", body, flags=re.MULTILINE)
    clears = body.count("clearProcessingNotice(")
    assert exits, "handler has no plain returns; layout changed"
    assert clears >= len(exits), (
        f"{len(exits)} plain returns but only {clears} notice clears in the handler"
    )


def check_notice_reaches_the_handler():
    assert SOURCE.count("processingNotice: jobContext.processingNotice || null") >= 2, (
        "a webhook reply call is missing the notice"
    )
    assert "jobContext.processingNotice = await sendProcessingNotice(" in SOURCE, (
        "the notice is never stored for the job"
    )


def main():
    check_notice_is_only_the_hourglass()
    check_notice_is_remembered_for_recall()
    check_reply_edits_the_notice_in_place()
    check_every_exit_clears_the_notice()
    check_notice_reaches_the_handler()
    print("whatsapp processing notice OK")


if __name__ == "__main__":
    main()
