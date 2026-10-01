"""Period Tracker from the bot (WhatsApp, Telegram, web chat).

    period                  status and predictions
    period mula|start       a period started today (or "semalam", or @DDMMYYYY)
    period tamat|end|habis  the open period ended today (same date options)

Answers only for a user who switched Period Tracker on, and never in a group.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from modules.period.routes import MAX_PERIOD_DAYS, close_open_cycle_before, compute_summary, date_problem
from time_utils import current_business_date

_COMMAND = re.compile(r"^\s*(period|haid)\b\s*(.*)$", re.IGNORECASE | re.DOTALL)
_START = {"mula", "start", "started", "datang", "bermula"}
_END = {"tamat", "habis", "end", "ended", "stop", "berhenti", "selesai"}
_STATUS = {"", "bila", "status", "when", "next", "seterusnya"}
_DATE_TOKEN = re.compile(r"@(\d{2})(\d{2})(\d{4})\b")

_PROBLEMS_BM = {
    "The start date cannot be in the future.": "Tarikh mula tidak boleh pada masa depan.",
    "The end date cannot be before the start date.": "Tarikh tamat tidak boleh sebelum tarikh mula.",
    "These dates overlap another recorded period.": "Tarikh ini bertindih dengan rekod period lain.",
    f"A period cannot be longer than {MAX_PERIOD_DAYS} days.": f"Satu period tidak boleh lebih {MAX_PERIOD_DAYS} hari.",
}


def match_period_command(text: str) -> bool:
    return bool(_COMMAND.match(text or ""))


def _when(rest: str, today: date) -> tuple[Optional[date], str]:
    """The day named in the rest of the command, and the words left over."""
    match = _DATE_TOKEN.search(rest)
    if match:
        try:
            day = date(int(match.group(3)), int(match.group(2)), int(match.group(1)))
        except ValueError:
            return None, rest
        return day, (rest[: match.start()] + rest[match.end():]).strip()
    words = rest.split()
    if any(w in {"semalam", "yesterday", "kelmarin"} for w in words):
        return today - timedelta(days=1), " ".join(w for w in words if w not in {"semalam", "yesterday", "kelmarin"})
    return today, rest


def _fmt(iso_or_date, bm: bool) -> str:
    d = iso_or_date if isinstance(iso_or_date, date) else datetime.strptime(iso_or_date, "%Y-%m-%d").date()
    months_bm = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"]
    months_en = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return f"{d.day} {(months_bm if bm else months_en)[d.month - 1]}"


async def _cycles(db: AsyncSession, user_id: str) -> list[models.PeriodCycle]:
    result = await db.execute(
        select(models.PeriodCycle).where(models.PeriodCycle.user_id == user_id).order_by(models.PeriodCycle.start_date.desc())
    )
    return list(result.scalars().all())


def _status_text(cycles: list[models.PeriodCycle], today: date, bm: bool) -> str:
    s = compute_summary(cycles, today)
    if s["status"] == "no_data":
        return (
            "*Period Tracker*\nBelum ada rekod. Hantar `period mula` bila period bermula."
            if bm
            else "*Period Tracker*\nNo records yet. Send `period start` when a period starts."
        )
    if s["status"] == "period":
        head = f"Period hari ke-{s['period_day']}." if bm else f"Period day {s['period_day']}."
    elif s["status"] == "waiting":
        head = (
            f"Period seterusnya dijangka *{_fmt(s['next_start'], bm)}* ({s['days_until_next']} hari lagi)."
            if bm
            else f"Next period expected *{_fmt(s['next_start'], bm)}* (in {s['days_until_next']} days)."
        )
    else:
        late = s["days_late"] or 0
        head = (
            (f"Period lewat {late} hari." if late else "Period dijangka hari ini.")
            if bm
            else (f"Period {late} days late." if late else "Period expected today.")
        )
    window = next((u for u in s["upcoming"] if u["fertile_end"] >= today.isoformat()), None)
    lines = [
        "*Period Tracker*",
        head,
        (f"Purata kitaran: {s['avg_cycle_length']} hari · tempoh: {s['avg_period_length']} hari" if bm
         else f"Avg cycle: {s['avg_cycle_length']} days · period: {s['avg_period_length']} days"),
    ]
    if window:
        lines.append(
            f"Tempoh subur (anggaran): {_fmt(window['fertile_start'], bm)} – {_fmt(window['fertile_end'], bm)}"
            if bm
            else f"Fertile window (estimate): {_fmt(window['fertile_start'], bm)} – {_fmt(window['fertile_end'], bm)}"
        )
    return "\n".join(lines)


async def handle_period_command(db: AsyncSession, *, user: models.User, text: str) -> str:
    bm = (getattr(user, "language", "BM") or "BM") != "EN"
    if not bool(getattr(user, "period_tracker_enabled", False)):
        return (
            "Period Tracker belum dihidupkan. Hidupkan di Tetapan › Keutamaan dalam app."
            if bm
            else "Period Tracker is off. Switch it on in Settings › Preferences in the app."
        )
    match = _COMMAND.match(text or "")
    rest = (match.group(2) if match else "").strip().lower()
    today = current_business_date()
    words = rest.split()
    action = words[0] if words else ""
    cycles = await _cycles(db, user.id)

    if action in _START:
        day, _ = _when(" ".join(words[1:]), today)
        if day is None:
            return "Tarikh tidak sah. Guna `@DDMMYYYY`." if bm else "Invalid date. Use `@DDMMYYYY`."
        close_open_cycle_before(cycles, day)
        problem = date_problem(day, None, cycles, today)
        if problem:
            await db.rollback()
            return _PROBLEMS_BM.get(problem, problem) if bm else problem
        db.add(models.PeriodCycle(user_id=user.id, start_date=day))
        await db.commit()
        cycles = await _cycles(db, user.id)
        saved = f"✅ Period bermula {_fmt(day, bm)} direkod." if bm else f"✅ Period started {_fmt(day, bm)} recorded."
        return f"{saved}\n\n{_status_text(cycles, today, bm)}"

    if action in _END:
        day, _ = _when(" ".join(words[1:]), today)
        if day is None:
            return "Tarikh tidak sah. Guna `@DDMMYYYY`." if bm else "Invalid date. Use `@DDMMYYYY`."
        open_cycle = next((c for c in cycles if c.end_date is None), None)
        if not open_cycle:
            return (
                "Tiada period yang sedang direkod. Hantar `period mula` dahulu."
                if bm
                else "No period is open. Send `period start` first."
            )
        problem = date_problem(open_cycle.start_date, day, [c for c in cycles if c.id != open_cycle.id], today)
        if problem:
            return _PROBLEMS_BM.get(problem, problem) if bm else problem
        open_cycle.end_date = day
        await db.commit()
        cycles = await _cycles(db, user.id)
        saved = f"✅ Period tamat {_fmt(day, bm)} direkod." if bm else f"✅ Period ended {_fmt(day, bm)} recorded."
        return f"{saved}\n\n{_status_text(cycles, today, bm)}"

    if action in _STATUS:
        return _status_text(cycles, today, bm)

    return (
        "*Period Tracker*\n`period` – status\n`period mula` – period bermula hari ini\n`period tamat` – period tamat hari ini\nTambah `semalam` atau `@DDMMYYYY` untuk tarikh lain."
        if bm
        else "*Period Tracker*\n`period` – status\n`period start` – started today\n`period end` – ended today\nAdd `yesterday` or `@DDMMYYYY` for another day."
    )
