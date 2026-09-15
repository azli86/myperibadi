/**
 * CARTO basemap tiles.
 *
 * The API key is a `NEXT_PUBLIC_*` value, so it ends up in the browser bundle —
 * that is expected for tile keys, but it does mean it must be restricted to this
 * domain in the CARTO dashboard rather than treated as a secret.
 *
 * The key is optional on purpose: CARTO currently serves these styles without one,
 * so a missing key degrades to the previous URL instead of breaking every map.
 */

export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

export type MapTheme = "light" | "dark"

/** CARTO style slug for a theme. `light_all`/`dark_all` are the labelled variants. */
export function cartoStyle(theme: MapTheme) {
  return theme === "light" ? "light_all" : "dark_all"
}

/**
 * Leaflet tile URL template. `{s}`, `{z}`, `{x}`, `{y}` and `{r}` are substituted
 * by Leaflet; `{r}` handles retina tiles when the layer asks for them.
 */
export function cartoTileUrl(theme: MapTheme): string {
  const key = (process.env.NEXT_PUBLIC_CARTO_API_KEY || "").trim()
  const base = `https://{s}.basemaps.cartocdn.com/${cartoStyle(theme)}/{z}/{x}/{y}{r}.png`
  return key ? `${base}?key=${encodeURIComponent(key)}` : base
}
