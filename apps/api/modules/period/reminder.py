"""Period Tracker reminders, sent to the user's own chats only.

Each reminder goes out once (remembered in user_settings) between 09:00 and
21:00 business time, through the channels the user left on: push, WhatsApp
to the user's own linked number, Telegram to the user's own chat. Never to a
group, and never while pregnancy mode is on.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from modules.period import service
from time_utils import _get_business_timezone, current_business_date

SEND_FROM_HOUR = 9
SEND_UNTIL_HOUR = 21


def _messages(user: models.User, prefs: dict[str, Any], summary: dict[str, Any], cycles: list) -> list[tuple[str, str, str]]:
    """(key, title, body) for every reminder due now."""
    from modules.period.bot import _fmt

    bm = (getattr(user, "language", "BM") or "BM") != "EN"
    out: list[tuple[str, str, str]] = []
    before = int(prefs.get("remind_before_days") or 0)
    last_start = max(c.start_date for c in cycles)
    if summary["status"] == "waiting" and before and summary["days_until_next"] == before:
        if summary["next_range_start"]:
            # An irregular cycle: a range, not a day.
            span = f"{_fmt(summary['next_range_start'], bm)} – {_fmt(summary['next_range_end'], bm)}"
            body = (
                f"Period mungkin bermula antara {span} (dalam {before} hari)."
                if bm
                else f"Your period may start between {span} (in {before} days)."
            )
        else:
            when = _fmt(summary["next_start"], bm)
            body = (
                f"Period dijangka dalam {before} hari ({when})."
                if bm
                else f"Your period is expected in {before} days ({when})."
            )
        if prefs.get("remind_supplies"):
            body += " Semak stok pad anda." if bm else " Check your pad supply."
        out.append((f"before:{last_start.isoformat()}", "Period Tracker", body))
    # Late means past the end of the expected range, so an irregular cycle is
    # not nagged while it is still inside it. Asked once per cycle.
    if summary["status"] == "late" and prefs.get("remind_late") and (summary["days_late"] or 0) >= 1:
        out.append((
            f"late:{last_start.isoformat()}",
            "Period Tracker",
            "Period sudah mula? Balas `period mula` atau tekan Mula hari ini dalam app." if bm
            else "Has your period started? Reply `period start` or tap Started today in the app.",
        ))
    open_cycle = next((c for c in cycles if c.end_date is None), None)
    if (
        open_cycle
        and prefs.get("remind_open")
        and summary["status"] == "period"
        and (summary["period_day"] or 0) > summary["avg_period_length"] + 2
    ):
        out.append((
            f"open:{open_cycle.id}",
            "Period Tracker",
            "Period dah habis? Balas `period tamat` supaya ramalan kekal tepat." if bm
            else "Has your period ended? Reply `period end` to keep predictions accurate.",
        ))
    return out


async def run_period_reminder_cycle(
    db: AsyncSession,
    *,
    send_telegram: Callable[..., Awaitable[Any]],
    send_whatsapp: Callable[..., Awaitable[Any]],
) -> dict[str, int]:
    counts = {"users": 0, "sent": 0}
    local_now = datetime.now(_get_business_timezone())
    if not (SEND_FROM_HOUR <= local_now.hour < SEND_UNTIL_HOUR):
        return counts
    today = current_business_date()
    users = (
        await db.execute(select(models.User).where(models.User.period_tracker_enabled == True))  # noqa: E712
    ).scalars().all()
    for user in users:
        prefs = await service.load_prefs(db, user.id)
        if prefs.get("pregnancy_mode"):
            continue
        cycles = await service.own_cycles(db, user.id)
        if not cycles:
            continue
        summary = service.compute_summary(cycles, today, logs=await service.recent_logs(db, user.id, today))
        due = _messages(user, prefs, summary, cycles)
        if not due:
            continue
        sent = await service.load_json_setting(db, user.id, service.SENT_KEY)
        due = [m for m in due if m[0] not in sent]
        if not due:
            continue
        counts["users"] += 1
        channels = prefs.get("channels") or {}
        tg = wa = None
        if channels.get("telegram", True):
            tg = (
                await db.execute(
                    select(models.TelegramLink).where(
                        models.TelegramLink.user_id == user.id,
                        models.TelegramLink.is_active == True,  # noqa: E712
                    )
                )
            ).scalars().first()
        if channels.get("whatsapp", True):
            # The user's own linked number: WhatsApp delivers it to their own
            # chat. Groups are never a target here.
            wa = (
                await db.execute(
                    select(models.WhatsAppLink).where(
                        models.WhatsAppLink.user_id == user.id,
                        models.WhatsAppLink.verified == True,  # noqa: E712
                    )
                )
            ).scalars().first()
        for key, title, body in due:
            if channels.get("push", True):
                try:
                    import push_service

                    await push_service.send_push_to_user(db, user.id, title, body.replace("`", ""), "/period")
                except Exception as exc:
                    print(f"[period-reminder] push failed user={user.id}: {exc}")
            if tg:
                try:
                    await send_telegram(tg.telegram_chat_id, f"*{title}*\n{body}", parse_mode="Markdown")
                except Exception as exc:
                    print(f"[period-reminder] telegram failed user={user.id}: {exc}")
            if wa:
                try:
                    await send_whatsapp(user.id, wa.phone, f"*{title}*\n{body}")
                except Exception as exc:
                    print(f"[period-reminder] whatsapp failed user={user.id}: {exc}")
            sent[key] = today.isoformat()
            counts["sent"] += 1
        # Keep the record small: forget reminders older than a year.
        cutoff = (today - timedelta(days=365)).isoformat()
        sent = {k: v for k, v in sent.items() if v >= cutoff}
        await service.save_json_setting(db, user.id, service.SENT_KEY, sent)
        await db.commit()
    return counts
