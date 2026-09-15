"""The picture is on screen immediately, and the scan overlaps it.

Two separate things used to make a screenshot feel slow:

1. `submitMessage` revoked `selectedPreviewUrl` on send. That URL is the very one the
   optimistic bubble renders from (`localPreviewUrl` is `selectedPreviewUrl || ...`),
   so revoking it blanked the thumbnail the user was waiting to see.
2. The upload did not start until the 900ms paint floor had fully elapsed, so a slow
   OCR was delayed twice over.

The floor itself is kept: it still gates the typing indicator and the reply, so the
user sees their own image before the bot answers.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

WEB_SRC = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "web", "src"
)
CHAT_PAGE = os.path.join(WEB_SRC, "app", "[sessionId]", "chat", "page.tsx")


def _source() -> str:
    with open(CHAT_PAGE, encoding="utf-8") as fh:
        return fh.read()


def test_send_does_not_revoke_the_thumbnail_it_is_showing():
    """The bubble renders from selectedPreviewUrl, so revoking it on send blanks it."""
    source = _source()
    sends = source[source.index("const submitMessage = async"):]
    body = sends[: sends.index("const requestCurrentLocation")]
    assert "URL.revokeObjectURL(selectedPreviewUrl)" not in body, (
        "submitMessage revokes the preview URL that the outgoing bubble renders from"
    )


def test_upload_starts_before_the_paint_floor_finishes():
    """A picture must not sit idle for the floor before the request even leaves."""
    source = _source()
    assert "const inflight = postChatMessage(formData)" in source, (
        "the request is not started before the floor"
    )
    # The floor await must come after the request is kicked off.
    assert source.index("const inflight = postChatMessage(formData)") < source.index(
        "await new Promise((resolve) => setTimeout(resolve, ATTACHMENT_PAINT_FLOOR_MS))"
    ), "the paint floor runs before the upload starts, serialising them"


def test_the_reply_is_still_held_back_for_the_picture():
    """Sending fast and replying instantly is what confused users in the first place."""
    source = _source()
    assert "const minDelay = activeFile ? ATTACHMENT_PAINT_FLOOR_MS : 0" in source, (
        "the bot reply no longer waits, so it can replace the picture instantly"
    )
    assert "const elapsed = Date.now() - sendStartedAt" in source, (
        "the delay must be measured from when the send started, not from before it"
    )


def test_thumbnail_is_released_eventually():
    """Not revoking on send is fine only if the URL is released somewhere."""
    source = _source()
    assert "objectUrlsRef.current" in source, (
        "preview object URLs are never tracked, so they would leak"
    )


if __name__ == "__main__":
    test_send_does_not_revoke_the_thumbnail_it_is_showing()
    test_upload_starts_before_the_paint_floor_finishes()
    test_the_reply_is_still_held_back_for_the_picture()
    test_thumbnail_is_released_eventually()
    print("chat image timing OK")
