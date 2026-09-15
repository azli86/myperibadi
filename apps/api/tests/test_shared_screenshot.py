"""Shared-screenshot lands in the composer, not straight into OCR.

Two things used to go wrong when a screenshot arrived from the Android/PWA share
sheet:

1. It was auto-sent (`submitMessage`), and the server runs OCR as soon as the
   image arrives. The user never got to look at the image first — and a mis-share
   was already scanned before it could be cancelled.
2. Even when it was staged instead of sent, the composer only showed the file
   name and size, so there was no image on screen at all.

These checks read the chat page source. They are structural on purpose: the two
behaviours live in JSX and in an effect, and neither is reachable from a unit test
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
    # The effect closes at the first `}, [sharedToken, lang])` after the block.
    end = source.index("}, [sharedToken, lang])", start)
    return source[start:end]


def test_shared_image_is_staged_in_the_composer():
    source = _source()
    block = _shared_image_effect(source)
    assert "handlePickFile(file)" in block, (
        "a shared screenshot must land in the composer so the user sees it first"
    )


def test_shared_image_is_not_auto_sent():
    source = _source()
    block = _shared_image_effect(source)
    assert not re.search(r"submitMessage\([^)]*\bfile\b", block), (
        "the shared image is auto-sent, so OCR runs before the user can look at it "
        "or cancel a mis-share"
    )


def test_shared_text_does_not_overwrite_what_the_user_typed():
    source = _source()
    block = _shared_image_effect(source)
    assert "!input.trim()" in block, (
        "shared text would clobber text already in the composer"
    )


def test_composer_renders_an_image_thumbnail():
    """Showing only the file name means a shared screenshot is invisible."""
    source = _source()
    assert "selectedPreviewUrl" in source, "the preview URL is never read"
    assert re.search(r"src=\{selectedPreviewUrl\}", source), (
        "the composer does not render the pending image, so it is never shown before sending"
    )


def test_preview_object_url_is_revoked():
    """Object URLs leak the whole blob until revoked."""
    source = _source()
    assert "URL.revokeObjectURL(selectedPreviewUrl)" in source, (
        "clearing the attachment must revoke the preview object URL"
    )


if __name__ == "__main__":
    test_shared_image_is_staged_in_the_composer()
    test_shared_image_is_not_auto_sent()
    test_shared_text_does_not_overwrite_what_the_user_typed()
    test_composer_renders_an_image_thumbnail()
    test_preview_object_url_is_revoked()
    print("shared screenshot OK")
