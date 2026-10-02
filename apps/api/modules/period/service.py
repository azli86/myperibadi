"""Period Tracker logic shared by the API, the bot commands and the reminders.

Everything here is private to one user: nothing is read from or written to a
household, and nothing is sent anywhere but the user's own chats.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any, Optional

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from time_utils import current_business_date

DEFAULT_CYCLE_LENGTH = 28
DEFAULT_PERIOD_LENGTH = 5
MAX_PERIOD_DAYS = 15
# A start date further back than this is a typing slip (0001, 1926), not a record.
MAX_HISTORY_DAYS = 3660


class PrefsError(ValueError):
    """A settings value that can be shown to the user as it is."""
# Gaps outside this range are a missed record, not a cycle; leave them out.
MIN_CYCLE_DAYS = 15
MAX_CYCLE_DAYS = 90
RECENT_CYCLES = 6
LOG_HISTORY_DAYS = 400

FLOWS = ("spotting", "light", "medium", "heavy")
SYMPTOMS = ("cramps", "headache", "bloating", "acne", "backache", "tired", "tender", "nausea")
MOODS = ("happy", "calm", "sensitive", "anxious", "sad", "irritable")
OVULATION_TESTS = ("positive", "negative")

PREFS_KEY = "period.prefs"
SENT_KEY = "period.reminders_sent"

# Ramadan in Malaysia, as estimated ahead of the sighting. The user can correct
# a year on the Period Tracker page; these only fill in what they have not set.
RAMADAN_DEFAULTS: dict[str, tuple[str, str]] = {
    "2024": ("2024-03-12", "2024-04-09"),
    "2025": ("2025-03-02", "2025-03-30"),
    "2026": ("2026-02-19", "2026-03-19"),
    "2027": ("2027-02-08", "2027-03-09"),
    "2028": ("2028-01-28", "2028-02-26"),
}

DEFAULT_PREFS: dict[str, Any] = {
    "remind_before_days": 2,  # 0 switches the heads-up off
    "remind_late": True,
    "remind_open": True,
    "remind_supplies": False,
    "channels": {"push": True, "whatsapp": True, "telegram": True},
    "pregnancy_mode": False,
    "spend_category_id": None,
    "ramadan": {},
    "qada_paid": {},
}


# ── preferences ────────────────────────────────────────────────────────────

async def _setting_row(db: AsyncSession, user_id: str, key: str) -> Optional[models.UserSetting]:
    return (
        await db.execute(
            select(models.UserSetting)
            .where(models.UserSetting.user_id == user_id, models.UserSetting.key == key)
            .order_by(models.UserSetting.updated_at.desc())
            .limit(1)
        )
    ).scalars().first()


async def load_json_setting(db: AsyncSession, user_id: str, key: str) -> dict[str, Any]:
    row = await _setting_row(db, user_id, key)
    try:
        value = json.loads(row.value) if row and row.value else {}
    except ValueError:
        value = {}
    return value if isinstance(value, dict) else {}


async def save_json_setting(db: AsyncSession, user_id: str, key: str, value: dict[str, Any]) -> None:
    row = await _setting_row(db, user_id, key)
    text = json.dumps(value, ensure_ascii=False)
    if row:
        row.value = text
        row.updated_at = datetime.utcnow()
    else:
        db.add(models.UserSetting(user_id=user_id, key=key, value=text))


async def load_prefs(db: AsyncSession, user_id: str) -> dict[str, Any]:
    stored = await load_json_setting(db, user_id, PREFS_KEY)
    prefs = json.loads(json.dumps(DEFAULT_PREFS))
    for key, value in stored.items():
        if key == "channels" and isinstance(value, dict):
            prefs["channels"].update({k: bool(v) for k, v in value.items() if k in prefs["channels"]})
        elif key in prefs:
            prefs[key] = value
    return prefs


def merge_prefs(prefs: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """Apply a partial update, keeping only known keys with sane values."""
    out = json.loads(json.dumps(prefs))
    if "remind_before_days" in patch:
        out["remind_before_days"] = max(0, min(7, int(patch["remind_before_days"] or 0)))
    for key in ("remind_late", "remind_open", "remind_supplies", "pregnancy_mode"):
        if key in patch:
            out[key] = bool(patch[key])
    if isinstance(patch.get("channels"), dict):
        out["channels"].update({k: bool(v) for k, v in patch["channels"].items() if k in out["channels"]})
    if "spend_category_id" in patch:
        value = patch["spend_category_id"]
        out["spend_category_id"] = int(value) if value not in (None, "", 0) else None
    if isinstance(patch.get("ramadan"), dict):
        for year, span in patch["ramadan"].items():
            if span is None:
                out["ramadan"].pop(str(year), None)
                continue
            start, end = date.fromisoformat(span[0]), date.fromisoformat(span[1])
            if not (0 <= (end - start).days <= 31):
                raise PrefsError("Ramadan must run 1 to 31 days.")
            out["ramadan"][str(year)] = [start.isoformat(), end.isoformat()]
    if isinstance(patch.get("qada_paid"), dict):
        for year, count in patch["qada_paid"].items():
            out["qada_paid"][str(year)] = max(0, min(31, int(count or 0)))
    return out


# ── records ────────────────────────────────────────────────────────────────

async def own_cycles(db: AsyncSession, user_id: str) -> list[models.PeriodCycle]:
    result = await db.execute(
        select(models.PeriodCycle)
        .where(models.PeriodCycle.user_id == user_id)
        .order_by(models.PeriodCycle.start_date.desc())
    )
    return list(result.scalars().all())


async def own_logs(db: AsyncSession, user_id: str, since: date) -> list[models.PeriodDayLog]:
    result = await db.execute(
        select(models.PeriodDayLog)
        .where(models.PeriodDayLog.user_id == user_id, models.PeriodDayLog.log_date >= since)
        .order_by(models.PeriodDayLog.log_date.asc())
    )
    return list(result.scalars().all())


async def recent_logs(db: AsyncSession, user_id: str, today: date) -> list[models.PeriodDayLog]:
    return await own_logs(db, user_id, today - timedelta(days=120))


async def log_for_day(db: AsyncSession, user_id: str, day: date) -> Optional[models.PeriodDayLog]:
    return (
        await db.execute(
            select(models.PeriodDayLog).where(models.PeriodDayLog.user_id == user_id, models.PeriodDayLog.log_date == day)
        )
    ).scalars().first()


def log_symptoms(log: models.PeriodDayLog) -> list[str]:
    try:
        value = json.loads(log.symptoms) if log.symptoms else []
    except ValueError:
        value = []
    return [s for s in value if s in SYMPTOMS] if isinstance(value, list) else []


def serialize_cycle(cycle: models.PeriodCycle) -> dict[str, Any]:
    length = (cycle.end_date - cycle.start_date).days + 1 if cycle.end_date else None
    return {
        "id": cycle.id,
        "start_date": cycle.start_date.isoformat(),
        "end_date": cycle.end_date.isoformat() if cycle.end_date else None,
        "period_length": length,
        "notes": cycle.notes,
    }


def serialize_log(log: models.PeriodDayLog) -> dict[str, Any]:
    return {
        "date": log.log_date.isoformat(),
        "flow": log.flow,
        "symptoms": log_symptoms(log),
        "mood": log.mood,
        "temperature": float(log.temperature) if log.temperature is not None else None,
        "ovulation_test": log.ovulation_test,
        "notes": log.notes,
    }


def date_problem(start: date, end: Optional[date], others: list[models.PeriodCycle], today: date) -> Optional[str]:
    """Why these dates cannot be saved, or None when they can. Shared by the
    API and the bot commands, so both refuse the same things."""
    if start > today:
        return "The start date cannot be in the future."
    if (today - start).days > MAX_HISTORY_DAYS:
        return "The start date is too far in the past."
    if end is not None:
        if end < start:
            return "The end date cannot be before the start date."
        if (end - start).days + 1 > MAX_PERIOD_DAYS:
            return f"A period cannot be longer than {MAX_PERIOD_DAYS} days."
    new_end = end or start
    for other in others:
        other_end = other.end_date or other.start_date
        if start <= other_end and other.start_date <= new_end:
            return "These dates overlap another recorded period."
    return None


def running_period(cycles: list[models.PeriodCycle], day: date) -> Optional[models.PeriodCycle]:
    """The period still open that `day` falls in, if any. Starting again within the
    length of one period is the same period, e.g. "period start" typed a day late."""
    open_cycle = next((c for c in cycles if c.end_date is None), None)
    if open_cycle and 0 <= (day - open_cycle.start_date).days < MAX_PERIOD_DAYS:
        return open_cycle
    return None


def close_open_cycle_before(cycles: list[models.PeriodCycle], start: date) -> None:
    """Starting a new period closes one still left open, the day before."""
    open_cycle = next((c for c in cycles if c.end_date is None), None)
    if open_cycle and open_cycle.start_date < start:
        closing = min(start - timedelta(days=1), open_cycle.start_date + timedelta(days=MAX_PERIOD_DAYS - 1))
        open_cycle.end_date = max(closing, open_cycle.start_date)


def period_days(cycles: list[models.PeriodCycle], today: date) -> set[date]:
    """Every day a recorded period covers; an open one runs to today."""
    days: set[date] = set()
    for c in cycles:
        end = c.end_date or min(today, c.start_date + timedelta(days=MAX_PERIOD_DAYS - 1))
        d = c.start_date
        while d <= end:
            days.add(d)
            d += timedelta(days=1)
    return days


# ── predictions ────────────────────────────────────────────────────────────

def _median_days(values: list[int]) -> int:
    """Median of whole days, halves rounded up (so 28.5 reads 29, not 28)."""
    ordered = sorted(values)
    mid = len(ordered) // 2
    value = ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2
    return int(value + 0.5)


def _cycle_gaps(ordered: list) -> list[int]:
    return [(b.start_date - a.start_date).days for a, b in zip(ordered, ordered[1:])]


def cycle_stats(cycles: list) -> dict[str, Any]:
    """The figures a doctor asks for: how short and long the cycles run."""
    ordered = sorted(cycles, key=lambda c: c.start_date)
    gaps = [g for g in _cycle_gaps(ordered) if MIN_CYCLE_DAYS <= g <= MAX_CYCLE_DAYS]
    lengths = [(c.end_date - c.start_date).days + 1 for c in ordered if c.end_date]
    return {
        "records": len(ordered),
        "cycles_counted": len(gaps),
        "shortest": min(gaps) if gaps else None,
        "longest": max(gaps) if gaps else None,
        "median": _median_days(gaps) if gaps else None,
        "spread": (max(gaps) - min(gaps)) if gaps else None,
        "shortest_period": min(lengths) if lengths else None,
        "longest_period": max(lengths) if lengths else None,
    }


def _positive_test_after(logs: Optional[list], since: date, today: date) -> Optional[date]:
    """The latest positive ovulation test within this cycle, if any."""
    days = [l.log_date for l in (logs or []) if l.ovulation_test == "positive" and since < l.log_date <= today]
    return max(days) if days else None


def compute_summary(cycles: list, today: date, *, pregnancy_mode: bool = False, logs: Optional[list] = None) -> dict[str, Any]:
    """Averages and predictions from the recorded periods.

    The cycle length is the median gap between consecutive starts (so one odd
    cycle does not drag it); the period length is start to end inclusive.
    Ovulation is taken as 14 days before the next period, the fertile window
    the five days before it and the day after. These are estimates only.

    When the recent cycles vary by more than a week the cycle is irregular:
    the next period becomes a range instead of a day, and the fertile window
    is withheld, since a calendar cannot place it. A positive ovulation test in
    the current cycle then anchors both: ovulation the day after the test,
    the next period two weeks after that."""
    ordered = sorted(cycles, key=lambda c: c.start_date)
    gaps = [g for g in _cycle_gaps(ordered) if MIN_CYCLE_DAYS <= g <= MAX_CYCLE_DAYS][-RECENT_CYCLES:]
    lengths = [(c.end_date - c.start_date).days + 1 for c in ordered if c.end_date][-RECENT_CYCLES:]

    avg_cycle = _median_days(gaps) if gaps else DEFAULT_CYCLE_LENGTH
    avg_period = _median_days(lengths) if lengths else DEFAULT_PERIOD_LENGTH
    regular = (max(gaps) - min(gaps) <= 7) if len(gaps) >= 2 else None
    irregular = regular is False
    summary: dict[str, Any] = {
        "avg_cycle_length": avg_cycle,
        "avg_period_length": avg_period,
        "cycle_length_known": bool(gaps),
        "cycles_counted": len(gaps),
        "regular": regular,
        "irregular": irregular,
        "cycle_range": [min(gaps), max(gaps)] if gaps else None,
        "status": "no_data",
        "cycle_day": None,
        "period_day": None,
        "days_until_next": None,
        "days_late": None,
        "next_start": None,
        "next_end": None,
        "next_range_start": None,
        "next_range_end": None,
        "anchored_by_test": False,
        "fertile_reliable": not irregular,
        "ovulation_date": None,
        "fertile_start": None,
        "fertile_end": None,
        "pregnancy_week": None,
        "upcoming": [],
        "alerts": [],
        "stats": cycle_stats(cycles),
    }
    if not ordered:
        return summary

    last = ordered[-1]
    summary["cycle_day"] = (today - last.start_date).days + 1

    if pregnancy_mode:
        # Counted from the first day of the last period, as clinics do.
        summary["status"] = "pregnant"
        summary["pregnancy_week"] = max(1, (today - last.start_date).days // 7 + 1)
        return summary

    point = last.start_date + timedelta(days=avg_cycle)
    earliest = latest = point
    ovulation: Optional[date] = point - timedelta(days=14)
    if irregular:
        half = min(14, (max(gaps) - min(gaps) + 1) // 2)
        earliest = max(last.start_date + timedelta(days=MIN_CYCLE_DAYS), point - timedelta(days=half))
        latest = point + timedelta(days=half)
        ovulation = None
        test_day = _positive_test_after(logs, last.start_date, today)
        if test_day:
            ovulation = test_day + timedelta(days=1)
            point = ovulation + timedelta(days=14)
            earliest, latest = point - timedelta(days=2), point + timedelta(days=2)
            summary["anchored_by_test"] = True
            summary["fertile_reliable"] = True

    ongoing = last.end_date is None and (today - last.start_date).days < MAX_PERIOD_DAYS
    in_recorded = last.end_date is not None and last.start_date <= today <= last.end_date
    if ongoing or in_recorded:
        summary["status"] = "period"
        summary["period_day"] = (today - last.start_date).days + 1
    elif today < earliest:
        summary["status"] = "waiting"
        summary["days_until_next"] = (earliest - today).days
    elif today <= latest and (irregular or today < point):
        # Inside the range: it may start any day now.
        summary["status"] = "expected"
    else:
        summary["status"] = "late"
        summary["days_late"] = (today - latest).days

    period_span = timedelta(days=avg_period - 1)
    if not irregular:
        # A late period is expected any day now: predict from today, not the
        # past. The fertile window stays where it was predicted.
        anchor = max(point, today) if summary["status"] == "late" else point
        summary.update(
            next_start=anchor.isoformat(),
            next_end=(anchor + period_span).isoformat(),
        )
        upcoming = []
        for k in range(3):
            start = anchor + timedelta(days=avg_cycle * k)
            ov = start - timedelta(days=14)
            upcoming.append(
                {
                    "start": start.isoformat(),
                    "end": (start + period_span).isoformat(),
                    "ovulation": ov.isoformat(),
                    "fertile_start": (ov - timedelta(days=5)).isoformat(),
                    "fertile_end": (ov + timedelta(days=1)).isoformat(),
                    "uncertain": False,
                }
            )
    else:
        start = max(earliest, today) if summary["status"] in ("late", "expected") else earliest
        end = max(latest, today) + period_span
        summary.update(
            next_start=(max(point, today) if summary["status"] == "late" else point).isoformat(),
            next_end=end.isoformat(),
            next_range_start=earliest.isoformat(),
            next_range_end=latest.isoformat(),
        )
        entry: dict[str, Any] = {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "ovulation": None,
            "fertile_start": None,
            "fertile_end": None,
            "uncertain": True,
        }
        if ovulation:
            entry.update(
                ovulation=ovulation.isoformat(),
                fertile_start=(ovulation - timedelta(days=5)).isoformat(),
                fertile_end=(ovulation + timedelta(days=1)).isoformat(),
            )
        upcoming = [entry]
    if upcoming and upcoming[0]["ovulation"]:
        first = upcoming[0]
        summary.update(ovulation_date=first["ovulation"], fertile_start=first["fertile_start"], fertile_end=first["fertile_end"])
    summary["upcoming"] = upcoming
    summary["alerts"] = health_alerts(ordered, today)
    return summary


def health_alerts(ordered: list, today: date) -> list[dict[str, Any]]:
    """Gentle flags worth raising with a doctor. Never a diagnosis."""
    alerts: list[dict[str, Any]] = []
    recent = _cycle_gaps(ordered)[-3:]
    if any(g < 21 for g in recent):
        alerts.append({"key": "short_cycle", "value": min(recent)})
    if any(35 < g <= MAX_CYCLE_DAYS for g in recent):
        alerts.append({"key": "long_cycle", "value": max(g for g in recent if g <= MAX_CYCLE_DAYS)})
    if any(g > MAX_CYCLE_DAYS for g in recent):
        # Months with no period in between: those gaps stay out of the averages.
        alerts.append({"key": "skipped", "value": max(recent)})
    last = ordered[-1]
    since_last = (today - last.start_date).days
    if since_last > 60 and last.end_date is not None:
        alerts.append({"key": "missed", "value": since_last})
    long_periods = [(c.end_date - c.start_date).days + 1 for c in ordered[-3:] if c.end_date]
    if any(n > 7 for n in long_periods):
        alerts.append({"key": "long_period", "value": max(long_periods)})
    return alerts


# ── qada (fasting to make up) ──────────────────────────────────────────────

def ramadan_spans(prefs: dict[str, Any]) -> dict[str, tuple[date, date, bool]]:
    """Each year's Ramadan, the user's correction first, else the estimate."""
    spans: dict[str, tuple[date, date, bool]] = {}
    for year, (start, end) in RAMADAN_DEFAULTS.items():
        spans[year] = (date.fromisoformat(start), date.fromisoformat(end), False)
    for year, span in (prefs.get("ramadan") or {}).items():
        try:
            spans[str(year)] = (date.fromisoformat(span[0]), date.fromisoformat(span[1]), True)
        except (TypeError, ValueError, IndexError):
            continue
    return spans


def qada_summary(cycles: list, prefs: dict[str, Any], today: date) -> list[dict[str, Any]]:
    """Per Ramadan that has begun: the period days that fell in it, the days
    already made up, and what is left. Newest first."""
    days = period_days(cycles, today)
    paid = prefs.get("qada_paid") or {}
    out = []
    for year, (start, end, confirmed) in sorted(ramadan_spans(prefs).items(), reverse=True):
        if start > today:
            continue
        missed = sum(1 for d in days if start <= d <= end)
        made_up = int(paid.get(year, 0) or 0)
        if missed == 0 and made_up == 0 and year != str(today.year):
            continue
        out.append(
            {
                "year": year,
                "ramadan_start": start.isoformat(),
                "ramadan_end": end.isoformat(),
                "confirmed": confirmed,
                "missed": missed,
                "made_up": made_up,
                "remaining": max(0, missed - made_up),
            }
        )
    return out


# ── spending ───────────────────────────────────────────────────────────────

async def spend_summary(db: AsyncSession, user: models.User, prefs: dict[str, Any], today: date) -> Optional[dict[str, Any]]:
    category_id = prefs.get("spend_category_id")
    if not category_id:
        return None
    category = await db.get(models.Category, int(category_id))
    if not category or category.household_id != user.default_household_id:
        return None
    month_start = today.replace(day=1)
    year_start = today - timedelta(days=365)

    async def total(since: date) -> float:
        value = await db.scalar(
            select(func.coalesce(func.sum(models.Transaction.amount), 0)).where(
                and_(
                    models.Transaction.user_id == user.id,
                    models.Transaction.category_id == category.id,
                    models.Transaction.type == "expense",
                    models.Transaction.txn_date >= since,
                    models.Transaction.txn_date <= today,
                )
            )
        )
        return float(value or 0)

    this_month = await total(month_start)
    last_year = await total(year_start)
    return {
        "category_id": category.id,
        "category_name": category.name,
        "this_month": round(this_month, 2),
        "monthly_average": round(last_year / 12, 2),
    }


async def build_overview(db: AsyncSession, user: models.User) -> dict[str, Any]:
    today = current_business_date()
    prefs = await load_prefs(db, user.id)
    cycles = await own_cycles(db, user.id)
    logs = await own_logs(db, user.id, today - timedelta(days=LOG_HISTORY_DAYS))
    return {
        "today": today.isoformat(),
        "cycles": [serialize_cycle(c) for c in cycles],
        "logs": [serialize_log(l) for l in logs],
        "summary": compute_summary(cycles, today, pregnancy_mode=bool(prefs.get("pregnancy_mode")), logs=logs),
        "prefs": prefs,
        "qada": qada_summary(cycles, prefs, today),
        "spend": await spend_summary(db, user, prefs, today),
        "options": {"flows": FLOWS, "symptoms": SYMPTOMS, "moods": MOODS, "ovulation_tests": OVULATION_TESTS},
    }


async def upsert_day_log(db: AsyncSession, user_id: str, day: date, fields: dict[str, Any]) -> models.PeriodDayLog:
    """Set the given fields on the day's log, creating it when needed.
    A field set to None is cleared; one left out is kept."""
    log = await log_for_day(db, user_id, day)
    if not log:
        log = models.PeriodDayLog(user_id=user_id, log_date=day)
        db.add(log)
    if "flow" in fields:
        log.flow = fields["flow"] if fields["flow"] in FLOWS else None
    if "symptoms" in fields:
        chosen = [s for s in (fields["symptoms"] or []) if s in SYMPTOMS]
        log.symptoms = json.dumps(sorted(set(chosen))) if chosen else None
    if "mood" in fields:
        log.mood = fields["mood"] if fields["mood"] in MOODS else None
    if "temperature" in fields:
        t = fields["temperature"]
        log.temperature = round(float(t), 2) if t not in (None, "") and 34 <= float(t) <= 42 else None
    if "ovulation_test" in fields:
        log.ovulation_test = fields["ovulation_test"] if fields["ovulation_test"] in OVULATION_TESTS else None
    if "notes" in fields:
        log.notes = (fields["notes"] or "").strip()[:500] or None
    return log
