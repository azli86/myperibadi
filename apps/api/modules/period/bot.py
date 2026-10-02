"""Period Tracker from the bot (WhatsApp, Telegram, web chat).

    period                          status and predictions
    period mula|start               a period started today
    period tamat|end|habis          the open period ended today
    period aliran sikit|banyak      today's flow (tompok, sikit, sederhana, banyak)
    period senggugut, period letih  today's symptoms
    period mood sedih               today's mood
    period suhu 36.6                today's temperature
    period ovulasi positif|negatif  today's ovulation test
    period qada [2]                 fasting to make up; a number marks days made up

Add "semalam" or @DDMMYYYY for another day. Answers only for a user who switched
Period Tracker on. The caller never sends it a group message: groups are
answered with silence before this module is reached.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

import models
from modules.period import service
from time_utils import current_business_date

_COMMAND = re.compile(r"^\s*(period|haid)\b\s*(.*)$", re.IGNORECASE | re.DOTALL)
_START = {"mula", "start", "started", "datang", "bermula"}
_END = {"tamat", "habis", "end", "ended", "stop", "berhenti", "selesai"}
_STATUS = {"", "bila", "status", "when", "next", "seterusnya"}
_DATE_TOKEN = re.compile(r"@(\d{2})(\d{2})(\d{4})\b")
_YESTERDAY = {"semalam", "yesterday", "kelmarin"}

_FLOW_WORDS = {
    "tompok": "spotting", "spotting": "spotting",
    "sikit": "light", "sedikit": "light", "light": "light", "ringan": "light",
    "sederhana": "medium", "medium": "medium", "biasa": "medium",
    "banyak": "heavy", "heavy": "heavy", "lebat": "heavy",
}
_SYMPTOM_WORDS = {
    "senggugut": "cramps", "kejang": "cramps", "cramps": "cramps", "cramp": "cramps",
    "sakitkepala": "headache", "pening": "headache", "headache": "headache",
    "kembung": "bloating", "bloating": "bloating", "bloated": "bloating",
    "jerawat": "acne", "acne": "acne",
    "sakitbelakang": "backache", "backache": "backache",
    "letih": "tired", "penat": "tired", "tired": "tired",
    "payudara": "tender", "tender": "tender",
    "loya": "nausea", "mual": "nausea", "nausea": "nausea",
}
_MOOD_WORDS = {
    "gembira": "happy", "happy": "happy",
    "tenang": "calm", "calm": "calm",
    "sensitif": "sensitive", "sensitive": "sensitive",
    "cemas": "anxious", "risau": "anxious", "anxious": "anxious",
    "sedih": "sad", "sad": "sad",
    "marah": "irritable", "irritable": "irritable", "geram": "irritable",
}
_TEST_WORDS = {"positif": "positive", "positive": "positive", "+": "positive", "negatif": "negative", "negative": "negative", "-": "negative"}

LABELS_BM = {
    "spotting": "tompok", "light": "sikit", "medium": "sederhana", "heavy": "banyak",
    "cramps": "senggugut", "headache": "sakit kepala", "bloating": "kembung", "acne": "jerawat",
    "backache": "sakit belakang", "tired": "letih", "tender": "payudara sakit", "nausea": "loya",
    "happy": "gembira", "calm": "tenang", "sensitive": "sensitif", "anxious": "cemas", "sad": "sedih", "irritable": "mudah marah",
    "positive": "positif", "negative": "negatif",
}
LABELS_EN = {
    "spotting": "spotting", "light": "light", "medium": "medium", "heavy": "heavy",
    "cramps": "cramps", "headache": "headache", "bloating": "bloating", "acne": "acne",
    "backache": "backache", "tired": "tired", "tender": "tender breasts", "nausea": "nausea",
    "happy": "happy", "calm": "calm", "sensitive": "sensitive", "anxious": "anxious", "sad": "sad", "irritable": "irritable",
    "positive": "positive", "negative": "negative",
}

_PROBLEMS_BM = {
    "The start date cannot be in the future.": "Tarikh mula tidak boleh pada masa depan.",
    "The end date cannot be before the start date.": "Tarikh tamat tidak boleh sebelum tarikh mula.",
    "These dates overlap another recorded period.": "Tarikh ini bertindih dengan rekod period lain.",
    "The start date is too far in the past.": "Tarikh mula terlalu lama dahulu.",
    f"A period cannot be longer than {service.MAX_PERIOD_DAYS} days.": f"Satu period tidak boleh lebih {service.MAX_PERIOD_DAYS} hari.",
}


def match_period_command(text: str) -> bool:
    return bool(_COMMAND.match(text or ""))


def _when(words: list[str], today: date) -> tuple[Optional[date], list[str]]:
    """The day named among the words (today by default), and the words left."""
    rest = " ".join(words)
    match = _DATE_TOKEN.search(rest)
    if match:
        try:
            day = date(int(match.group(3)), int(match.group(2)), int(match.group(1)))
        except ValueError:
            return None, words
        return day, (rest[: match.start()] + rest[match.end():]).split()
    if any(w in _YESTERDAY for w in words):
        return today - timedelta(days=1), [w for w in words if w not in _YESTERDAY]
    return today, words


def _fmt(value, bm: bool) -> str:
    d = value if isinstance(value, date) else datetime.strptime(value, "%Y-%m-%d").date()
    months = (
        ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"]
        if bm
        else ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    )
    return f"{d.day} {months[d.month - 1]}"


def _label(key: str, bm: bool) -> str:
    return (LABELS_BM if bm else LABELS_EN).get(key, key)


def status_text(cycles: list, prefs: dict, today: date, bm: bool, logs: list | None = None) -> str:
    s = service.compute_summary(cycles, today, pregnancy_mode=bool(prefs.get("pregnancy_mode")), logs=logs)
    if s["status"] == "no_data":
        return (
            "*Period Tracker*\nBelum ada rekod. Hantar `period mula` bila period bermula."
            if bm
            else "*Period Tracker*\nNo records yet. Send `period start` when a period starts."
        )
    if s["status"] == "pregnant":
        return (
            f"*Period Tracker*\nMod kehamilan: minggu ke-{s['pregnancy_week']}."
            if bm
            else f"*Period Tracker*\nPregnancy mode: week {s['pregnancy_week']}."
        )
    window = (
        f"{_fmt(s['next_range_start'], bm)} – {_fmt(s['next_range_end'], bm)}" if s["next_range_start"] else None
    )
    if s["status"] == "period":
        head = f"Period hari ke-{s['period_day']}." if bm else f"Period day {s['period_day']}."
    elif s["status"] == "waiting" and window:
        head = (
            f"Period dijangka antara *{window}* (dari {s['days_until_next']} hari lagi)."
            if bm
            else f"Period expected between *{window}* (from {s['days_until_next']} days away)."
        )
    elif s["status"] == "waiting":
        head = (
            f"Period seterusnya dijangka *{_fmt(s['next_start'], bm)}* ({s['days_until_next']} hari lagi)."
            if bm
            else f"Next period expected *{_fmt(s['next_start'], bm)}* (in {s['days_until_next']} days)."
        )
    elif s["status"] == "expected":
        head = (
            f"Period mungkin bermula bila-bila masa ({window})."
            if bm
            else f"Your period may start any day now ({window})."
        )
    else:
        late = s["days_late"] or 0
        head = (
            (f"Period lewat {late} hari." if late else "Period dijangka hari ini.")
            if bm
            else (f"Period {late} days late." if late else "Period expected today.")
        )
    stats = s["stats"]
    if s["irregular"] and stats["shortest"] is not None:
        cycle_line = (
            f"Kitaran tak teratur: {stats['shortest']}–{stats['longest']} hari · tempoh: {s['avg_period_length']} hari"
            if bm
            else f"Irregular cycle: {stats['shortest']}–{stats['longest']} days · period: {s['avg_period_length']} days"
        )
    else:
        cycle_line = (
            f"Purata kitaran: {s['avg_cycle_length']} hari · tempoh: {s['avg_period_length']} hari"
            if bm
            else f"Avg cycle: {s['avg_cycle_length']} days · period: {s['avg_period_length']} days"
        )
    lines = ["*Period Tracker*", head, cycle_line]
    fertile = next((u for u in s["upcoming"] if u["fertile_start"] and u["fertile_end"] >= today.isoformat()), None)
    if fertile:
        lines.append(
            f"Tempoh subur (anggaran): {_fmt(fertile['fertile_start'], bm)} – {_fmt(fertile['fertile_end'], bm)}"
            if bm
            else f"Fertile window (estimate): {_fmt(fertile['fertile_start'], bm)} – {_fmt(fertile['fertile_end'], bm)}"
        )
    elif not s["fertile_reliable"]:
        lines.append(
            "Tempoh subur tidak dianggar kerana kitaran tak teratur. Ujian ovulasi positif (`period ovulasi positif`) membantu."
            if bm
            else "No fertile window, as the cycle is irregular. A positive ovulation test (`period ovulation positive`) helps."
        )
    return "\n".join(lines)


def _help(bm: bool) -> str:
    if bm:
        return (
            "*Period Tracker*\n"
            "`period` – status\n"
            "`period mula` / `period tamat` – period bermula / tamat\n"
            "`period aliran banyak` – tompok, sikit, sederhana, banyak\n"
            "`period senggugut` – simptom (letih, kembung, pening…)\n"
            "`period mood sedih` – mood\n"
            "`period suhu 36.6` · `period ovulasi positif`\n"
            "`period qada` – puasa ganti; `period qada 2` tanda 2 hari diganti\n"
            "Tambah `semalam` atau `@DDMMYYYY` untuk tarikh lain. Arahan BM dan English sama-sama boleh."
        )
    return (
        "*Period Tracker*\n"
        "`period` – status\n"
        "`period start` / `period end` – started / ended\n"
        "`period flow heavy` – spotting, light, medium, heavy\n"
        "`period cramps` – symptoms (tired, bloating, headache…)\n"
        "`period mood sad` – mood\n"
        "`period temp 36.6` · `period ovulation positive`\n"
        "`period qada` – fasts to make up; `period qada 2` marks 2 made up\n"
        "Add `yesterday` or `@DDMMYYYY` for another day. Malay commands work too (`period mula`)."
    )


def _qada_text(cycles: list, prefs: dict, today: date, bm: bool) -> str:
    rows = service.qada_summary(cycles, prefs, today)
    if not rows:
        return "Tiada puasa ganti direkod." if bm else "No fasts to make up are recorded."
    lines = ["*Puasa ganti*" if bm else "*Fasts to make up*"]
    for r in rows:
        lines.append(
            f"Ramadan {r['year']}: {r['missed']} hari tertinggal, {r['made_up']} diganti, baki *{r['remaining']}*"
            if bm
            else f"Ramadan {r['year']}: {r['missed']} missed, {r['made_up']} made up, *{r['remaining']}* left"
        )
    lines.append(
        "Tarikh Ramadan anggaran; boleh dibetulkan di halaman Period Tracker." if bm
        else "Ramadan dates are estimates; correct them on the Period Tracker page."
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
    words = (match.group(2) if match else "").strip().lower().split()
    today = current_business_date()
    action = words[0] if words else ""
    cycles = await service.own_cycles(db, user.id)
    prefs = await service.load_prefs(db, user.id)
    logs = await service.recent_logs(db, user.id, today)

    if action in _START or action in _END:
        day, _ = _when(words[1:], today)
        if day is None:
            return "Tarikh tidak sah. Guna `@DDMMYYYY`." if bm else "Invalid date. Use `@DDMMYYYY`."
        if action in _START:
            running = service.running_period(cycles, day)
            if running:
                same_day = running.start_date == day
                started = _fmt(running.start_date, bm)
                return (
                    (f"Period sudah direkod bermula {started}" + ("." if same_day else f" (hari ke-{(day - running.start_date).days + 1}).")
                     + " Hantar `period tamat` bila habis.")
                    if bm
                    else (f"Your period is already recorded as started {started}" + ("." if same_day else f" (day {(day - running.start_date).days + 1}).")
                          + " Send `period end` when it ends.")
                )
            service.close_open_cycle_before(cycles, day)
            problem = service.date_problem(day, None, cycles, today)
            if problem:
                await db.rollback()
                return _PROBLEMS_BM.get(problem, problem) if bm else problem
            db.add(models.PeriodCycle(user_id=user.id, start_date=day))
            saved = f"✅ Period bermula {_fmt(day, bm)} direkod." if bm else f"✅ Period started {_fmt(day, bm)} recorded."
        else:
            open_cycle = next((c for c in cycles if c.end_date is None), None)
            if not open_cycle:
                return (
                    "Tiada period yang sedang direkod. Hantar `period mula` dahulu."
                    if bm
                    else "No period is open. Send `period start` first."
                )
            problem = service.date_problem(open_cycle.start_date, day, [c for c in cycles if c.id != open_cycle.id], today)
            if problem:
                return _PROBLEMS_BM.get(problem, problem) if bm else problem
            open_cycle.end_date = day
            saved = f"✅ Period tamat {_fmt(day, bm)} direkod." if bm else f"✅ Period ended {_fmt(day, bm)} recorded."
        await db.commit()
        cycles = await service.own_cycles(db, user.id)
        return f"{saved}\n\n{status_text(cycles, prefs, today, bm, logs)}"

    if action in _STATUS:
        return status_text(cycles, prefs, today, bm, logs)

    if action in {"bantuan", "help", "panduan", "guide"}:
        return _help(bm)

    if action == "qada":
        numbers = [w for w in words[1:] if w.isdigit()]
        if numbers:
            rows = service.qada_summary(cycles, prefs, today)
            target = next((r for r in rows if r["remaining"] > 0), rows[0] if rows else None)
            if not target:
                return "Tiada puasa ganti direkod." if bm else "No fasts to make up are recorded."
            paid = dict(prefs.get("qada_paid") or {})
            paid[target["year"]] = min(target["missed"], int(paid.get(target["year"], 0)) + int(numbers[0]))
            prefs = service.merge_prefs(prefs, {"qada_paid": paid})
            await service.save_json_setting(db, user.id, service.PREFS_KEY, prefs)
            await db.commit()
        return _qada_text(cycles, prefs, today, bm)

    # Daily log: flow, symptoms, mood, temperature, ovulation test.
    day, words = _when(words, today)
    if day is None:
        return "Tarikh tidak sah. Guna `@DDMMYYYY`." if bm else "Invalid date. Use `@DDMMYYYY`."
    if day > today:
        return "Tarikh tidak boleh pada masa depan." if bm else "The date cannot be in the future."
    joined = "".join(words)
    fields: dict = {}
    noted: list[str] = []
    if words and words[0] in {"aliran", "flow"} and len(words) > 1 and words[1] in _FLOW_WORDS:
        fields["flow"] = _FLOW_WORDS[words[1]]
        noted.append(("aliran " if bm else "flow ") + _label(fields["flow"], bm))
    elif words and words[0] in {"mood"} and len(words) > 1 and words[1] in _MOOD_WORDS:
        fields["mood"] = _MOOD_WORDS[words[1]]
        noted.append("mood " + _label(fields["mood"], bm))
    elif words and words[0] in {"suhu", "temp", "temperature"} and len(words) > 1:
        try:
            value = float(words[1].replace(",", "."))
        except ValueError:
            value = 0
        if not 34 <= value <= 42:
            return "Suhu mesti antara 34 dan 42 °C." if bm else "The temperature must be between 34 and 42 °C."
        fields["temperature"] = value
        noted.append(f"{'suhu' if bm else 'temperature'} {value:.1f}°C")
    elif words and words[0] in {"ovulasi", "ovulation", "opk"} and len(words) > 1 and words[1] in _TEST_WORDS:
        fields["ovulation_test"] = _TEST_WORDS[words[1]]
        noted.append(("ujian ovulasi " if bm else "ovulation test ") + _label(fields["ovulation_test"], bm))
    else:
        found = [_SYMPTOM_WORDS[w] for w in words if w in _SYMPTOM_WORDS]
        for phrase, key in (("sakitkepala", "headache"), ("sakitbelakang", "backache")):
            if phrase in joined and key not in found:
                found.append(key)
        if not found:
            return _help(bm)
        existing = await service.log_for_day(db, user.id, day)
        current = service.log_symptoms(existing) if existing else []
        fields["symptoms"] = sorted(set(current + found))
        noted.append(", ".join(_label(k, bm) for k in found))

    await service.upsert_day_log(db, user.id, day, fields)
    await db.commit()
    when = ("hari ini" if bm else "today") if day == today else _fmt(day, bm)
    return f"✅ {('Dicatat' if bm else 'Logged')} {when}: {', '.join(noted)}."
