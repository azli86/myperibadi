import os
from datetime import date, datetime
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
