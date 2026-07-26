"""Deterministic My Vehicle bot commands (WhatsApp + Chat). No LLM."""

from __future__ import annotations

import re
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

import models
from modules.vehicles import service


VEHICLE_COMMAND_PATTERNS = (
    r"^vehicle\s+summary$",
    r"^vehicle\s+reminders?$",
    r"^ringkasan\s+kenderaan$",
    r"^peringatan\s+kenderaan$",
    r"^bila\s+servis$",
    r"^bila\s+road\s*tax\s+tamat$",
    r"^bila\s+roadtax\s+tamat$",
    r"^bila\s+insurans\s+tamat$",
    r"^bila\s+insurance\s+tamat$",
)

_COMPILED = [re.compile(p, re.IGNORECASE) for p in VEHICLE_COMMAND_PATTERNS]


def match_vehicle_command(text: str) -> Optional[str]:
    normalized = re.sub(r"\s+", " ", (text or "").strip().lower())
    if not normalized:
        return None
    for pattern in _COMPILED:
        if pattern.match(normalized):
            return normalized
    return None


def _is_en(user: models.User | None) -> bool:
    return bool(user and getattr(user, "language", "BM") == "EN")


def _money(value: float | None, is_en: bool) -> str:
    amount = float(value or 0)
    return f"RM {amount:,.2f}"


async def handle_vehicle_command(
    db: AsyncSession,
    *,
    user: models.User,
    text: str,
) -> Optional[str]:
    matched = match_vehicle_command(text)
    if not matched:
        return None

    is_en = _is_en(user)

    if matched in {"vehicle summary", "ringkasan kenderaan"}:
        data = await service.build_vehicle_summary(db, current_user=user)
        return _format_summary(data, is_en=is_en)

    if matched in {
        "vehicle reminders",
        "vehicle reminder",
        "peringatan kenderaan",
        "bila servis",
        "bila road tax tamat",
        "bila roadtax tamat",
        "bila insurans tamat",
        "bila insurance tamat",
    }:
        items = await service.build_due_reminders(db, current_user=user)
        filter_type = None
        if "servis" in matched:
            filter_type = {"service", "odometer"}
        elif "road" in matched:
            filter_type = {"road_tax"}
        elif "insur" in matched:
            filter_type = {"insurance"}
        if filter_type:
            items = [i for i in items if (i.get("reminder_type") or "") in filter_type]
        return _format_reminders(items, is_en=is_en)

    return None


def _format_summary(data: dict, *, is_en: bool) -> str:
    vehicles = data.get("vehicles") or []
    if not vehicles and data.get("vehicle_id"):
        vehicles = [data]
    if not vehicles:
        return "Tiada kenderaan direkod." if not is_en else "No vehicles recorded."

    header = (
        f"*Ringkasan Kenderaan* · {data.get('month_key')}"
        if not is_en
        else f"*Vehicle Summary* · {data.get('month_key')}"
    )
    lines = [header, ""]
    if len(vehicles) > 1:
        lines.append(
            (f"Jumlah semua: {_money(data.get('total_cost'), is_en)}" if not is_en else f"All vehicles total: {_money(data.get('total_cost'), is_en)}")
        )
        if data.get("distance_travelled"):
            lines.append(
                (f"Jarak: {data['distance_travelled']:.0f} KM" if not is_en else f"Distance: {data['distance_travelled']:.0f} KM")
            )
        lines.append("")

    for v in vehicles:
        name = v.get("vehicle_name") or "Vehicle"
        reg = v.get("registration_number")
        title = f"*{name}*" + (f" ({reg})" if reg else "")
        lines.append(title)
        if v.get("current_odometer") is not None:
            lines.append(f"  ODO: {float(v['current_odometer']):,.0f} KM")
        lines.append(
            f"  {( 'Jumlah' if not is_en else 'Total' )}: {_money(v.get('total_cost'), is_en)}"
        )
        lines.append(
            f"  Fuel: {_money(v.get('fuel_cost'), is_en)} · {( 'Servis' if not is_en else 'Service' )}: {_money(v.get('maintenance_cost'), is_en)}"
        )
        if v.get("distance_travelled"):
            lines.append(f"  {( 'Jarak' if not is_en else 'Distance' )}: {float(v['distance_travelled']):,.0f} KM")
        if v.get("avg_km_per_litre"):
            lines.append(f"  Efficiency: {float(v['avg_km_per_litre']):.1f} KM/L")
        if v.get("next_service_date") or v.get("next_service_odometer") is not None:
            bits = []
            if v.get("next_service_date"):
                bits.append(str(v["next_service_date"]))
            if v.get("next_service_odometer") is not None:
                bits.append(f"{float(v['next_service_odometer']):,.0f} KM")
            lines.append(f"  {( 'Servis seterusnya' if not is_en else 'Next service' )}: {' · '.join(bits)}")
        if v.get("road_tax_expiry"):
            lines.append(f"  Road tax: {v['road_tax_expiry']}")
        if v.get("insurance_expiry"):
            lines.append(f"  {( 'Insurans' if not is_en else 'Insurance' )}: {v['insurance_expiry']}")
        lines.append("")
    return "\n".join(lines).strip()


def _format_reminders(items: list[dict], *, is_en: bool) -> str:
    if not items:
        return "Tiada peringatan kenderaan." if not is_en else "No vehicle reminders."

    overdue = [i for i in items if i.get("is_overdue")]
    due_soon = [i for i in items if i.get("is_due_soon") and not i.get("is_overdue")]
    other = [i for i in items if not i.get("is_overdue") and not i.get("is_due_soon")]

    lines = [("*Peringatan Kenderaan*" if not is_en else "*Vehicle Reminders*"), ""]

    def append_group(title: str, group: list[dict]) -> None:
        if not group:
            return
        lines.append(f"*{title}*")
        for item in group[:15]:
            name = item.get("vehicle_name") or "Vehicle"
            reg = item.get("registration_number")
            head = f"• {name}" + (f" ({reg})" if reg else "")
            lines.append(head)
            lines.append(f"  {item.get('title') or '-'}")
            extras = []
            if item.get("days_overdue") is not None:
                extras.append(
                    f"{item['days_overdue']} {( 'hari lewat' if not is_en else 'days overdue' )}"
                )
            if item.get("km_overdue") is not None:
                extras.append(f"{float(item['km_overdue']):,.0f} KM overdue")
            if item.get("due_date") and item.get("days_overdue") is None:
                extras.append(str(item["due_date"]))
            if item.get("due_odometer") is not None and item.get("km_overdue") is None:
                extras.append(f"{float(item['due_odometer']):,.0f} KM")
            if extras:
                lines.append(f"  {' · '.join(extras)}")
        lines.append("")

    append_group("Tertunggak" if not is_en else "Overdue", overdue)
    append_group("Akan datang" if not is_en else "Due soon", due_soon)
    append_group("Lain-lain" if not is_en else "Upcoming", other)
    return "\n".join(lines).strip()
