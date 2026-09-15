"""Shared-screenshot ordering: the picture is on screen before the bot replies.

Users were confused about whether their screenshot had sent at all, because the
bot's reply could land while the thumbnail was still being painted. Auto-send is
correct; the ordering was not.

These checks read the chat page source. They are structural on purpose: the
behaviour lives in JSX and in an effect, and neither is reachable from a unit test
without mounting the whole page.
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


def _shared_image_effect(source: str) -> str:
    """The block that handles ``sharedToken`` for image shares."""
    start = source.index("const attachSharedImage = async () => {")
    end = source.index("}, [sharedToken, lang])", start)
    return source[start:end]


def test_shared_image_is_sent_immediately():
    source = _source()
    block = _shared_image_effect(source)
    assert re.search(r"submitMessage\([^)]*\bfile\b", block), (
        "a shared screenshot should be sent straight into the conversation"
    )


def test_send_does_not_go_through_the_composer():
    """Staging in the composer means an extra tap before anything happens."""
    source = _source()
    block = _shared_image_effect(source)
    assert "handlePickFile(file)" not in block, (
        "the shared screenshot is staged in the composer instead of being sent"
    )


def test_shared_text_travels_with_the_image():
    source = _source()
    block = _shared_image_effect(source)
    assert re.search(r"submitMessage\(undefined, sharedText, file\)", block), (
        "text that came along with the share must travel with the image"
    )


def test_user_bubble_renders_the_image():
    """The bubble must paint the picture, not just the label.

    An outbound image message renders through SmartImage from `msg.previewUrl`, and
    submitMessage sets that from a freshly created object URL when no composer
    preview exists (which is exactly the share case).
    """
    source = _source()
    assert re.search(r"src=\{msg\.previewUrl\}", source), (
        "the sent image is not rendered in the chat bubble"
    )
    assert "registerObjectUrl(URL.createObjectURL(activeFile))" in source, (
        "submitMessage must mint a preview URL when there is no composer preview, "
        "or a shared image ships with no bubble thumbnail"
    )


def test_composer_still_previews_a_picked_image():
    """Picking from gallery/camera still stages in the composer, so keep the thumbnail."""
    source = _source()
    assert re.search(r"src=\{selectedPreviewUrl\}", source), (
        "the composer no longer previews a manually picked image"
    )
    assert "URL.revokeObjectURL(selectedPreviewUrl)" in source, (
        "clearing the attachment must revoke the preview object URL"
    )


def test_picture_is_visible_before_the_bot_replies():
    """The reply must not race the thumbnail onto the screen.

    Two things have to hold: the typing indicator is held back until the image has
    had a paint floor, and the reply itself waits out the same floor. Either one
    alone still lets a fast connection swap the picture out from under the user.
    """
    source = _source()
    assert "ATTACHMENT_PAINT_FLOOR_MS" in source, "no paint floor is defined"

    # The typing indicator is gated on the attachment.
    assert re.search(
        r"if \(activeFile\) \{\s*await new Promise\(\(resolve\) => setTimeout\(resolve, ATTACHMENT_PAINT_FLOOR_MS\)\)\s*\}\s*setIsTyping\(true\)",
        source,
    ), "the typing indicator can appear before the image has painted"

    # ...and the reply waits out the same floor.
    assert "const minDelay = activeFile ? ATTACHMENT_PAINT_FLOOR_MS : 0" in source, (
        "the bot reply no longer waits, so it can replace the picture instantly"
    )


def test_paint_floor_is_short():
    """A paint floor that is too long is just lag the user has to sit through."""
    source = _source()
    match = re.search(r"ATTACHMENT_PAINT_FLOOR_MS = (\d+)", source)
    assert match, "ATTACHMENT_PAINT_FLOOR_MS is not a plain number"
    assert 300 <= int(match.group(1)) <= 1500, (
        f"a {match.group(1)}ms floor is either imperceptible or feels like lag"
    )


if __name__ == "__main__":
    test_shared_image_is_sent_immediately()
    test_send_does_not_go_through_the_composer()
    test_shared_text_travels_with_the_image()
    test_user_bubble_renders_the_image()
    test_composer_still_previews_a_picked_image()
    test_picture_is_visible_before_the_bot_replies()
    test_paint_floor_is_short()
    print("shared screenshot OK")
