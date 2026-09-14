"""Vehicle thumbnails: generated on upload, keyed off the original, served by size.

The dashboard was shipping multi-megabyte originals (one is 6.6 MB) to render a
200px widget. These tests pin the behaviour that fixes that, and pin the failure
modes that would make it worse than not having thumbnails at all.
"""

import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image

from modules.vehicles import storage


def _wide_jpeg(width: int, height: int) -> bytes:
    img = Image.new("RGB", (width, height), (200, 40, 40))
    # Some detail so the encoder cannot collapse it to a flat block trivially.
    for x in range(0, width, 7):
        for y in range(0, height, 11):
            img.putpixel((x, y), ((x * 3) % 256, (y * 5) % 256, 90))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=95)
    return out.getvalue()


def test_thumbnail_key_is_derived_from_the_original():
    """Every original maps to exactly one thumbnail, and deleting one deletes both."""
    key = "vehicles/1/2/images/abc-photo.jpg"
    assert storage.thumbnail_key(key) == f"{key}.t.jpg"
    # Distinct originals must not collide on one thumbnail.
    assert storage.thumbnail_key("a.jpg") != storage.thumbnail_key("a.png")


def test_thumbnail_is_actually_smaller_and_scaled_down():
    original = _wide_jpeg(2400, 1800)
    thumb = storage.make_thumbnail(original)
    assert thumb, "a valid JPEG must produce a thumbnail"
    assert len(thumb) < len(original), "thumbnail must be smaller than the original"

    with Image.open(io.BytesIO(thumb)) as img:
        assert max(img.size) <= storage.THUMBNAIL_MAX_EDGE, (
            f"longest edge {max(img.size)} exceeds {storage.THUMBNAIL_MAX_EDGE}"
        )
        # Aspect ratio must survive, or list images look stretched.
        src_ratio = 2400 / 1800
        got_ratio = img.size[0] / img.size[1]
        assert abs(src_ratio - got_ratio) < 0.02, f"aspect ratio drifted: {got_ratio}"


def test_thumbnail_of_non_image_returns_none_instead_of_raising():
    """A bad file must not break the upload; the caller keeps the original."""
    assert storage.make_thumbnail(b"this is not an image") is None
    assert storage.make_thumbnail(b"") is None


def test_route_serves_thumb_with_fallback_to_original():
    """Pre-thumbnail images must still render, so thumb falls back rather than 404s."""
    import inspect

    from modules.vehicles import service

    source = inspect.getsource(service.get_vehicle_image_bytes)
    assert 'size == "thumb"' in source
    thumb_try = source.index("storage.thumbnail_key(key)")
    fallback = source.index("storage.download(key)")
    assert thumb_try < fallback, "thumbnail must be attempted before the original"
    # The fallback must not sit inside the thumb-only except clause.
    assert "raise HTTPException" in source[fallback:], (
        "original download still reports a real 404 for a genuinely missing image"
    )


def test_upload_and_delete_keep_the_thumbnail_in_step():
    import inspect

    from modules.vehicles import service

    upload_source = inspect.getsource(service.upload_vehicle_image)
    delete_source = inspect.getsource(service.delete_vehicle_image)
    assert "_store_thumbnail(object_key, payload)" in upload_source
    # Replacing an image must remove the stale thumbnail, or the old picture
    # keeps showing in every list.
    assert "storage.delete(storage.thumbnail_key(old_key))" in upload_source
    assert "storage.delete(storage.thumbnail_key(vehicle.image_object_key))" in delete_source


if __name__ == "__main__":
    test_thumbnail_key_is_derived_from_the_original()
    test_thumbnail_is_actually_smaller_and_scaled_down()
    test_thumbnail_of_non_image_returns_none_instead_of_raising()
    test_route_serves_thumb_with_fallback_to_original()
    test_upload_and_delete_keep_the_thumbnail_in_step()
    print("vehicle thumbnails OK")
