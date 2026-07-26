import asyncio
import os
import re
import time
from typing import Any

import httpx


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


REVERSE_GEOCODE_ENABLED = _env_bool("REVERSE_GEOCODE_ENABLED", True)
REVERSE_GEOCODE_URL = os.getenv("REVERSE_GEOCODE_URL", "https://nominatim.openstreetmap.org/reverse").strip()
REVERSE_GEOCODE_USER_AGENT = os.getenv(
    "REVERSE_GEOCODE_USER_AGENT",
    f"BudgetDigitalPort/1.0 ({os.getenv('APP_PUBLIC_URL', 'budget.digitalport.my')})",
).strip()
REVERSE_GEOCODE_TIMEOUT_SECONDS = float(os.getenv("REVERSE_GEOCODE_TIMEOUT_SECONDS", "4.0"))
REVERSE_GEOCODE_MIN_INTERVAL_SECONDS = float(os.getenv("REVERSE_GEOCODE_MIN_INTERVAL_SECONDS", "1.05"))
MAX_LOCATION_NAME_LENGTH = int(os.getenv("LOCATION_NAME_MAX_LENGTH", "80"))

_CACHE: dict[tuple[float, float], str | None] = {}
_REQUEST_LOCK = asyncio.Lock()
_LAST_REQUEST_AT = 0.0
_POSTCODE_RE = re.compile(r"^\d{4,6}$")
_DROP_PARTS = {"malaysia", "my"}
_ADDRESS_PRIMARY_KEYS = (
    "amenity",
    "shop",
    "tourism",
    "leisure",
    "office",
    "building",
    "commercial",
    "retail",
    "road",
)
_ADDRESS_AREA_KEYS = (
    "neighbourhood",
    "suburb",
    "quarter",
    "village",
    "town",
    "city",
    "municipality",
    "county",
    "state_district",
    "state",
)


def _clean_part(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    text = re.sub(r"\s+", " ", text)
    text = text.strip(" ,.-")
    lowered = text.lower()
    if not text or lowered in _DROP_PARTS or _POSTCODE_RE.fullmatch(text):
        return None
    return text


def _dedupe(parts: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for part in parts:
        key = part.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(part)
    return result


def shorten_location_name(location_name: str | None) -> str | None:
    if not location_name:
        return None
    parts = [_clean_part(part) for part in str(location_name).split(",")]
    clean_parts = _dedupe([part for part in parts if part])
    if not clean_parts:
        clean = _clean_part(location_name)
        return clean[:MAX_LOCATION_NAME_LENGTH] if clean else None
    return ", ".join(clean_parts[:2])[:MAX_LOCATION_NAME_LENGTH]


def _location_name_from_payload(payload: dict[str, Any]) -> str | None:
    address = payload.get("address") if isinstance(payload.get("address"), dict) else {}
    candidates: list[str] = []

    name = _clean_part(payload.get("name"))
    if name:
        candidates.append(name)

    for key in _ADDRESS_PRIMARY_KEYS:
        part = _clean_part(address.get(key))
        if part:
            candidates.append(part)
            break

    for key in _ADDRESS_AREA_KEYS:
        part = _clean_part(address.get(key))
        if part:
            candidates.append(part)
            break

    candidates = _dedupe(candidates)
    if candidates:
        return ", ".join(candidates[:2])[:MAX_LOCATION_NAME_LENGTH]

    return shorten_location_name(payload.get("display_name"))


async def reverse_geocode_short_name(latitude: float | None, longitude: float | None) -> str | None:
    if not REVERSE_GEOCODE_ENABLED or not REVERSE_GEOCODE_URL:
        return None
    if latitude is None or longitude is None:
        return None

    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        return None

    if lat < -90 or lat > 90 or lon < -180 or lon > 180:
        return None

    cache_key = (round(lat, 5), round(lon, 5))
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    global _LAST_REQUEST_AT
    async with _REQUEST_LOCK:
        if cache_key in _CACHE:
            return _CACHE[cache_key]

        elapsed = time.monotonic() - _LAST_REQUEST_AT
        wait_seconds = REVERSE_GEOCODE_MIN_INTERVAL_SECONDS - elapsed
        if wait_seconds > 0:
            await asyncio.sleep(wait_seconds)

        try:
            async with httpx.AsyncClient(
                timeout=REVERSE_GEOCODE_TIMEOUT_SECONDS,
                headers={"User-Agent": REVERSE_GEOCODE_USER_AGENT},
            ) as client:
                response = await client.get(
                    REVERSE_GEOCODE_URL,
                    params={
                        "format": "jsonv2",
                        "lat": f"{lat:.7f}",
                        "lon": f"{lon:.7f}",
                        "zoom": "18",
                        "addressdetails": "1",
                        "namedetails": "1",
                    },
                )
                _LAST_REQUEST_AT = time.monotonic()
                response.raise_for_status()
                payload = response.json()
        except Exception:
            _CACHE[cache_key] = None
            return None

    name = _location_name_from_payload(payload if isinstance(payload, dict) else {})
    _CACHE[cache_key] = name
    return name


async def resolve_short_location_name(
    *,
    latitude: float | None,
    longitude: float | None,
    location_name: str | None,
) -> str | None:
    existing = shorten_location_name(location_name)
    if existing:
        return existing
    return await reverse_geocode_short_name(latitude, longitude)


async def geocode_address_query(query: str | None) -> tuple[float | None, float | None, str | None]:
    text = str(query or "").strip()
    if not text:
        return None, None, None
    try:
        async with httpx.AsyncClient(
            timeout=REVERSE_GEOCODE_TIMEOUT_SECONDS,
            headers={"User-Agent": REVERSE_GEOCODE_USER_AGENT},
        ) as client:
            response = await client.get(
                SEARCH_GEOCODE_URL,
                params={
                    "q": text,
                    "format": "jsonv2",
                    "limit": "1",
                    "addressdetails": "1",
                },
            )
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return None, None, None

    if not isinstance(payload, list) or not payload:
        return None, None, None
    first = payload[0] if isinstance(payload[0], dict) else {}
    try:
        lat = float(first.get("lat")) if first.get("lat") is not None else None
        lon = float(first.get("lon")) if first.get("lon") is not None else None
    except (TypeError, ValueError):
        lat, lon = None, None
    return lat, lon, shorten_location_name(first.get("display_name") or text)

async def reverse_geocode_full_address(latitude: float | None, longitude: float | None) -> str | None:
    if not REVERSE_GEOCODE_ENABLED or not REVERSE_GEOCODE_URL:
        return None
    if latitude is None or longitude is None:
        return None
    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        return None
    if lat < -90 or lat > 90 or lon < -180 or lon > 180:
        return None
    try:
        async with httpx.AsyncClient(
            timeout=REVERSE_GEOCODE_TIMEOUT_SECONDS,
            headers={"User-Agent": REVERSE_GEOCODE_USER_AGENT},
        ) as client:
            response = await client.get(
                REVERSE_GEOCODE_URL,
                params={
                    "format": "jsonv2",
                    "lat": f"{lat:.7f}",
                    "lon": f"{lon:.7f}",
                    "zoom": "18",
                    "addressdetails": "1",
                },
            )
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return None
    if isinstance(payload, dict):
        return payload.get("display_name") or None
    return None

