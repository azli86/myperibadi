"""Guards on how the dashboard feeds the browser.

Both of these are speed regressions that are invisible in code review but very
visible on a phone, so they get an explicit test rather than a comment.
"""

import inspect
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.vehicles import service as vehicle_service


def test_vehicle_payload_does_not_advertise_dead_cdn_url():
    """The mixed CDN returns 403 for every vehicle object.

    Serving `image_url` made the client load a URL that always failed, retry it
    four times, and only then fall back to the authenticated proxy. Nothing should
    hand the browser a URL that is known to 403, so the field stays None and the
    proxy is the single source.
    """
    source = inspect.getsource(vehicle_service.serialize_vehicle)
    assert '"image_url": None' in source, (
        "vehicle payload must not expose a CDN url; the CDN 403s these objects"
    )
    assert "public_cdn_url" not in source, (
        "public_cdn_url must not be used for vehicle images"
    )


def test_dashboard_charts_do_not_animate():
    """Chart draw animations made the mobile dashboard feel like it was loading.

    Recharts animates by default and chart.js animates by default, so both have to
    be switched off explicitly.
    """
    dashboard = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "web", "src", "app", "[sessionId]", "page.tsx",
    )
    with open(dashboard, encoding="utf-8") as fh:
        source = fh.read()

    assert "isAnimationActive={false}" in source, "recharts Area must not animate"
    # Every <Area> in the file must be covered, not just the first.
    assert source.count("<Area ") == source.count("<Area isAnimationActive={false}"), (
        "some recharts <Area> elements still animate"
    )
    assert source.count("maintainAspectRatio: false") == source.count("animation: false"), (
        "some chart.js options still animate"
    )
    assert "animation: false," in source, "chart.js options must disable animation"


if __name__ == "__main__":
    test_vehicle_payload_does_not_advertise_dead_cdn_url()
    test_dashboard_charts_do_not_animate()
    print("dashboard speed OK")
