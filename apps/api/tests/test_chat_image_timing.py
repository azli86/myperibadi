"""The picture is on screen immediately, and the typing dots report the real request.

Two separate things used to make a screenshot feel slow:

1. `submitMessage` revoked `selectedPreviewUrl` on send. That URL is the very one the
   optimistic bubble renders from (`localPreviewUrl` is `selectedPreviewUrl || ...`),
   so revoking it blanked the thumbnail the user was waiting to see.
2. The upload did not start until the 900ms paint floor had fully elapsed, so a slow
   OCR was delayed twice over.

The floor itself is now gone too. It held the typing indicator open for a fixed 900ms
regardless of how long the request actually took, which made a fast reply look slow. The
three dots now track the request: they appear while it is outstanding and stop when the
reply lands.
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


def test_upload_starts_before_any_pause():
    """A picture must not sit idle before the request leaves."""
    source = _source()
    assert "const inflight = postChatMessage(formData)" in source, (
        "the request is not started before the typing indicator"
    )


def test_typing_indicator_tracks_the_request_not_a_timer():
    """A fixed floor made a fast reply look slow, which is what the user reported."""
    source = _source()
    assert "ATTACHMENT_PAINT_FLOOR_MS" not in source, (
        "the fixed paint floor is back; the indicator no longer follows the request"
    )
    # It must be raised before the response is awaited and cleared once it arrives.
    assert source.index("setIsTyping(true)") < source.index("await inflight"), (
        "the indicator is not shown while the request is outstanding"
    )
    assert source.index("await inflight") < source.index("setIsTyping(false)"), (
        "the indicator is not cleared once the reply is in"
    )


def test_the_reply_arrives_without_an_artificial_delay():
    """Holding the reply back for a fixed time is what made the bot feel slow."""
    source = _source()
    assert "const minDelay = activeFile ? ATTACHMENT_PAINT_FLOOR_MS : 0" not in source, (
        "the bot reply is being delayed on a timer again"
    )
    assert "const elapsed = Date.now() - sendStartedAt" not in source, (
        "the removed delay is still being measured"
    )


def test_thumbnail_is_released_eventually():
    """Not revoking on send is fine only if the URL is released somewhere."""
    source = _source()
    assert "objectUrlsRef.current" in source, (
        "preview object URLs are never tracked, so they would leak"
    )


if __name__ == "__main__":
    test_send_does_not_revoke_the_thumbnail_it_is_showing()
    test_upload_starts_before_any_pause()
    test_typing_indicator_tracks_the_request_not_a_timer()
    test_the_reply_arrives_without_an_artificial_delay()
    test_thumbnail_is_released_eventually()
    print("chat image timing OK")
