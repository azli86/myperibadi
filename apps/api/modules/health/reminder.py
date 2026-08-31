"""Kesihatan medication reminder scheduler.

Runs periodically from the API background loop. For each user with active
medication schedules it:

  * creates today's pending dose logs for enabled schedules
  * sends a reminder (Telegram / WhatsApp / push) when a scheduled time arrives
    and the dose is still pending
  * marks doses as "missed" after a window if still pending

Outbound channels are injected so this module stays transport-agnostic.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Awaitable, Callable, Optional

from sqlalchemy import select

import models

# A pending dose becomes "missed" if its scheduled time passed by this many
# minutes and it was never taken (or held for remind-later past that window).
MISSED_AFTER_MINUTES = 180


def _parse_minutes(value: Optional[int]) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return 30
    if v <= 0:
        return 30
    return min(v, 720)


async def _ensure_today_logs(db, med: models.Medication, today: date) -> dict[int, models.MedicationDoseLog]:
    schedules = (
        await db.execute(
            select(models.MedicationSchedule).where(
                models.MedicationSchedule.medication_id == med.id,
                models.MedicationSchedule.enabled == True,  # noqa: E712
            )
        )
    ).scalars().all()
    existing = (
        await db.execute(
            select(models.MedicationDoseLog).where(
                models.MedicationDoseLog.medication_id == med.id,
                models.MedicationDoseLog.dose_date == today,
            )
        )
    ).scalars().all()
    by_sched = {d.schedule_id: d for d in existing}
    for sc in schedules:
        if sc.id not in by_sched:
            log = models.MedicationDoseLog(
                medication_id=med.id,
                schedule_id=sc.id,
                user_id=med.user_id,
                dose_date=today,
                scheduled_time=sc.time,
                status="pending",
            )
            db.add(log)
            by_sched[sc.id] = log
    return by_sched


async def run_reminder_cycle(
    db,
    *,
    send_telegram: Callable[..., Awaitable[Any]],
    send_whatsapp: Callable[..., Awaitable[Any]],
    now: Optional[datetime] = None,
) -> dict[str, int]:
    now = now or datetime.utcnow()
    today = now.date()
    now_time = now.time().replace(microsecond=0)
    counts = {"sent": 0, "missed": 0, "users": 0}

    users = (await db.execute(select(models.User).where(models.User.is_active == True))).scalars().all()  # noqa: E712
    for user in users:
        meds = (
            await db.execute(
                select(models.Medication)
                .where(
                    models.Medication.user_id == user.id,
                    models.Medication.reminder_enabled == True,  # noqa: E712
                )
            )
        ).scalars().all()
        if not meds:
            continue

        lang = getattr(user, "language", "BM")
        is_bm = lang != "EN"
        tg = wa = None

        due_logs: list[models.MedicationDoseLog] = []

        for med in meds:
            if med.start_date and med.start_date > today:
                continue
            if med.end_date and med.end_date < today:
                continue
            by_sched = await _ensure_today_logs(db, med, today)
            schedules = (
                await db.execute(
                    select(models.MedicationSchedule).where(
                        models.MedicationSchedule.medication_id == med.id,
                        models.MedicationSchedule.enabled == True,  # noqa: E712
                    )
                )
            ).scalars().all()
            for sc in schedules:
                log = by_sched.get(sc.id)
                if not log:
                    continue
                # mark missed if long past its scheduled time
                scheduled_dt = datetime.combine(today, sc.time)
                if log.status == "pending" and (now - scheduled_dt) >= timedelta(minutes=MISSED_AFTER_MINUTES):
                    if log.remind_later_at is None or log.remind_later_at <= now:
                        log.status = "missed"
                        log.missed_at = now
                        counts["missed"] += 1
                        continue
                # notify when the scheduled time arrives, pending, not already sent
                if log.status == "pending" and not log.notified_at and sc.time <= now_time:
                    if log.remind_later_at is None or log.remind_later_at <= now:
                        due_logs.append(log)

        await db.commit()

        if not due_logs:
            continue
        counts["users"] += 1

        # Lazy-load channel targets once per user (only when we have reminders)
        tg = (
            await db.execute(
                select(models.TelegramLink).where(
                    models.TelegramLink.user_id == user.id,
                    models.TelegramLink.is_active == True,  # noqa: E712
                )
            )
        ).scalars().first()
        wa = (
            await db.execute(
                select(models.WhatsAppLink).where(
                    models.WhatsAppLink.user_id == user.id,
                    models.WhatsAppLink.verified == True,  # noqa: E712
                )
            )
        ).scalars().first()
        push_tokens = (
            await db.execute(
                select(models.UserPushToken).where(
                    models.UserPushToken.user_id == user.id,
                    models.UserPushToken.is_active == True,  # noqa: E712
                )
            )
        ).scalars().all()

        for log in due_logs:
            med = await db.get(models.Medication, log.medication_id)
            if not med:
                continue
            time_label = log.scheduled_time.strftime("%I:%M %p")
            title = "💊 Reminder Ubat" if is_bm else "💊 Medication Reminder"
            body = f"*{med.name}*"
            if med.dosage:
                body += f"\nDos: {med.dosage}"
            body += f"\n🕐 Masa: {time_label}" if is_bm else f"\n🕐 Time: {time_label}"
            body += "\n\nSudah ambil ubat?" if is_bm else "\n\nDid you take your medication?"

            if push_tokens:
                try:
                    import push_service
                    await push_service.send_push_to_user(
                        db, user.id, title, f"{med.name} {med.dosage or ''} — {time_label}", "/health"
                    )
                except Exception as exc:
                    print(f"[health-reminder] push failed user={user.id}: {exc}")

            if tg:
                try:
                    from modules.telegram_transport.routes import build_telegram_inline_keyboard_route
                    markup = build_telegram_inline_keyboard_route([
                        [
                            ("✅ Sudah Ambil", f"health:dose:{log.id}:taken"),
                            ("⏰ Nanti", f"health:dose:{log.id}:later"),
                            ("Skip", f"health:dose:{log.id}:skip"),
                        ]
                    ])
                    await send_telegram(tg.telegram_chat_id, body, reply_markup=markup, parse_mode="Markdown")
                except Exception as exc:
                    print(f"[health-reminder] telegram failed user={user.id}: {exc}")

            if wa:
                try:
                    hint = "Balas: ambil / skip / nanti 30" if is_bm else "Reply: taken / skip / later 30"
                    await send_whatsapp(user.id, wa.phone, f"{body}\n\n{hint}")
                except Exception as exc:
                    print(f"[health-reminder] whatsapp failed user={user.id}: {exc}")

            log.notified_at = now
            counts["sent"] += 1

        await db.commit()

    return counts
