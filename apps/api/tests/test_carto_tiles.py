"""CARTO basemap key wiring.

CARTO is moving their raster basemaps behind an API key, and the key must arrive
as `?key=`. Getting that parameter name wrong fails silently — tiles still return
200, but with the "API key required" watermark — so it is worth pinning.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

WEB_SRC = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "web", "src"
)

MAP_PAGES = [
    os.path.join(WEB_SRC, "app", "[sessionId]", "map", "page.tsx"),
    os.path.join(WEB_SRC, "app", "[sessionId]", "places", "page.tsx"),
    os.path.join(WEB_SRC, "app", "[sessionId]", "map-analysis", "page.tsx"),
]

# health/tracking renders Google tiles, not CARTO, so it is deliberately absent
# above. It used to carry an unused OpenStreetMap constant; that is gone, and this
# keeps it from creeping back in.
NON_CARTO_MAP_PAGES = [
    os.path.join(WEB_SRC, "app", "[sessionId]", "health", "tracking", "page.tsx"),
]


def _read(path: str) -> str:
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def test_helper_uses_the_key_parameter_carto_documents():
    source = _read(os.path.join(WEB_SRC, "lib", "map-tiles.ts"))
    assert "?key=" in source, "CARTO expects the parameter to be named `key`"
    assert "api_key" not in source, "`api_key` is not the CARTO parameter name"


def test_helper_survives_a_missing_key():
    """A missing key must degrade to the old URL, not produce `?key=undefined`."""
    source = _read(os.path.join(WEB_SRC, "lib", "map-tiles.ts"))
    assert 'process.env.NEXT_PUBLIC_CARTO_API_KEY || ""' in source
    assert "key ? `${base}?key=" in source, "the key must be optional"


def test_every_map_page_goes_through_the_helper():
    """No page may hand-build a cartocdn URL and quietly miss the key."""
    for page in MAP_PAGES:
        source = _read(page)
        assert "cartoTileUrl(" in source, f"{page} does not use the tile helper"
        assert "basemaps.cartocdn.com" not in source, (
            f"{page} still builds a cartocdn URL inline, so it would skip the key"
        )


def test_attribution_is_kept():
    """CARTO's terms require the CARTO and OpenStreetMap attribution to stay visible."""
    helper = _read(os.path.join(WEB_SRC, "lib", "map-tiles.ts"))
    assert "openstreetmap.org/copyright" in helper
    assert "carto.com/attributions" in helper

    for page in MAP_PAGES:
        source = _read(page)
        if "cartoTileUrl(" in source:
            # Either uses the shared constant, or carries its own attribution.
            assert "CARTO_ATTRIBUTION" in source or "carto.com/attributions" in source, (
                f"{page} renders a CARTO layer with no attribution"
            )


def test_style_slugs_are_valid_carto_styles():
    helper = _read(os.path.join(WEB_SRC, "lib", "map-tiles.ts"))
    assert '"light_all"' in helper and '"dark_all"' in helper
    # `isLight ? "light" : "dark"` at the call sites feeds these.
    for page in MAP_PAGES:
        source = _read(page)
        assert re.search(r'cartoTileUrl\(isLight \? "light" : "dark"\)', source), (
            f"{page} passes something other than a light/dark theme"
        )


def test_no_page_still_hardcodes_openstreetmap_tiles():
    """OSM's own tile server is not licensed for app traffic; only use it as a
    documented fallback, never as a page's basemap."""
    for page in MAP_PAGES + NON_CARTO_MAP_PAGES:
        source = _read(page)
        assert "tile.openstreetmap.org" not in source, (
            f"{page} points at OpenStreetMap's tile server"
        )


if __name__ == "__main__":
    test_helper_uses_the_key_parameter_carto_documents()
    test_helper_survives_a_missing_key()
    test_every_map_page_goes_through_the_helper()
    test_attribution_is_kept()
    test_style_slugs_are_valid_carto_styles()
    test_no_page_still_hardcodes_openstreetmap_tiles()
    print("carto tiles OK")
