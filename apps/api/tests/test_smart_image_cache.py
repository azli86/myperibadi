"""Pin the cached-image probe in SmartImage.

Reported symptom: photographs already in the chat log never appeared, even though the
browser fetched them successfully (the API log showed 200 for every /attachments/<id>/file
request). The image element was therefore carrying real bytes and being hidden by CSS.

`onLoad` does not fire when a response comes from cache, so `loaded` stayed false, the img
kept `opacity-0`, and the loading overlay stayed on top. Nothing about the data was wrong.

Run: cd apps/api && venv/bin/python -m tests.test_smart_image_cache
"""
from pathlib import Path

SOURCE = (
    Path(__file__).resolve().parents[2]
    / "web"
    / "src"
    / "components"
    / "ui"
    / "SmartImage.tsx"
).read_text(encoding="utf-8")


def test_cached_image_is_probed_instead_of_waiting_for_onload():
    probe = SOURCE.split("if (failed || !hasSrc) return", 1)[1].split("return (", 1)[0]
    assert "requestAnimationFrame" in probe, "cached images must be probed on later frames"
    assert "img.complete" in probe, "the probe has to ask whether the image is decoded"
    assert "naturalWidth" in probe, "a broken image completes with zero natural width"


def test_probe_stops_hiding_the_picture_even_if_it_never_reports_ready():
    probe = SOURCE.split("if (failed || !hasSrc) return", 1)[1].split("return (", 1)[0]
    # After the probe gives up it must reveal the picture rather than leave opacity-0 in
    # place, otherwise a slow image is indistinguishable from a missing one.
    give_up = probe.split("attempts++", 1)[1]
    assert "setLoaded(true)" in give_up, "giving up must still reveal the image"


def test_the_loading_overlay_is_still_gated_on_loaded():
    # The fix must not turn the spinner off unconditionally: while genuinely loading it
    # should still show, otherwise the blank frame is what the user sees.
    assert "showLoader && !loaded" in SOURCE
    assert '!loaded && "opacity-0"' in SOURCE


if __name__ == "__main__":
    test_cached_image_is_probed_instead_of_waiting_for_onload()
    test_probe_stops_hiding_the_picture_even_if_it_never_reports_ready()
    test_the_loading_overlay_is_still_gated_on_loaded()
    print("smart image cache OK")
