"""The health module keeps schedules in local time and stamps in UTC."""
from datetime import date, datetime, time

from modules.health.service import runs_on
from time_utils import utc_iso, utc_to_business_naive


class _Med:
    def __init__(self, start=None, end=None):
        self.start_date = start
        self.end_date = end


def test_utc_stamps_are_marked_as_utc():
    assert utc_iso(datetime(2026, 10, 2, 6, 0, 0)) == "2026-10-02T06:00:00Z"
    assert utc_iso(None) is None


def test_utc_clock_becomes_malaysian_wall_clock():
    # 00:30 UTC on the 2nd is 08:30 on the 2nd in Kuala Lumpur, not yesterday.
    assert utc_to_business_naive(datetime(2026, 10, 2, 0, 30)) == datetime(2026, 10, 2, 8, 30)
    # 20:00 UTC on the 1st is already 04:00 on the 2nd there.
    assert utc_to_business_naive(datetime(2026, 10, 1, 20, 0)).date() == date(2026, 10, 2)


def test_course_runs_only_between_its_dates():
    day = date(2026, 10, 2)
    assert runs_on(_Med(), day)
    assert runs_on(_Med(date(2026, 10, 2), date(2026, 10, 2)), day)
    assert not runs_on(_Med(date(2026, 10, 3)), day)      # not begun
    assert not runs_on(_Med(None, date(2026, 10, 1)), day)  # already ended
