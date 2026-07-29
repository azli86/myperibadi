import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_BUSINESS_TIMEZONE = "Asia/Kuala_Lumpur"


def _get_business_timezone() -> ZoneInfo:
    configured = (os.getenv("BUSINESS_TIMEZONE") or DEFAULT_BUSINESS_TIMEZONE).strip() or DEFAULT_BUSINESS_TIMEZONE
    try:
        return ZoneInfo(configured)
    except ZoneInfoNotFoundError:
        return ZoneInfo(DEFAULT_BUSINESS_TIMEZONE)


def current_business_date() -> date:
    return datetime.now(_get_business_timezone()).date()

def clamp_day(year: int, month: int, day: int) -> int:
    last = (date(year, month, 1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    return min(day, last.day)

def cycle_bounds(start_day: int, ref: date | None = None) -> tuple[date, date]:
    ref = ref or current_business_date()
    d = clamp_day(ref.year, ref.month, start_day)
    if ref.day >= d:
        start = date(ref.year, ref.month, d)
    else:
        prev = ref.replace(day=1) - timedelta(days=1)
        start = date(prev.year, prev.month, clamp_day(prev.year, prev.month, start_day))
    nxt = (start.replace(day=1) + timedelta(days=32)).replace(day=1)
    end = date(nxt.year, nxt.month, clamp_day(nxt.year, nxt.month, start_day))
    return start, end

def current_cycle_key(start_day: int, ref: date | None = None) -> str:
    start, _ = cycle_bounds(start_day, ref)
    return start.strftime("%Y-%m")  # label = cycle start month
