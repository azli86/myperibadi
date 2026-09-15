"""Shared-screenshot auto-send, and the bubble that shows it.

A screenshot from the Android/PWA share sheet is sent straight into the
conversation (the user asked for that — staging it in the composer was worse).
What must be true is that the image is visible in the chat bubble as it goes out;
the composer preview only ever showed a file name, which is why the image looked
like it never appeared at all.

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


if __name__ == "__main__":
    test_shared_image_is_sent_immediately()
    test_send_does_not_go_through_the_composer()
    test_shared_text_travels_with_the_image()
    test_user_bubble_renders_the_image()
    test_composer_still_previews_a_picked_image()
    print("shared screenshot OK")
