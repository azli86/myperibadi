"""Barang Saya — shared bot command service.

Single entry point used by ALL channels (whatsapp / telegram / chat).
Pure-python NLU (regex + keyword), no LLM required. State in inventory_conversation_states.

Channel adapters call handle_inventory_message() and only format the reply.
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from modules.inventory import queries, service
from modules.inventory.schemas import (
    ContainerCreate, ItemCreate, ItemMove, ItemQuantity, ItemStatus,
    LocationCreate, STATUS_LABELS_BM,
)

STATE_TTL_MINUTES = 10
PAGE_SIZE = 8
FUZZY_MIN_RATIO = 0.55

CONFIRM_WORDS = {"sah", "ya", "ok", "confirm", "setuju", "1"}
CANCEL_WORDS = {"batal", "cancel", "0", "tak"}
NEXT_WORDS = {"seterusnya", "next", "lagi"}

STATUS_KEYWORDS = {
    "rosak": "damaged",
    "hilang": "missing",
    "dipinjam": "loaned",
    "pinjam": "loaned",
    "dibuang": "disposed",
    "buang": "disposed",
    "habis": "used_up",
    "dah habis": "used_up",
}

def _now() -> datetime:
    return datetime.utcnow()

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

# ── conversation state helpers ────────────────────────────────────────────────

async def _load_state(db: AsyncSession, *, user_id: str, channel: str) -> Optional[models.InventoryConversationState]:
    row = (await db.execute(
        select(models.InventoryConversationState).where(
            models.InventoryConversationState.user_id == user_id,
            models.InventoryConversationState.channel == channel,
        )
    )).scalar_one_or_none()
    if row is None:
        return None
    if row.expires_at < _now():
        await _clear_state(db, row=row)
        return None
    return row

async def _clear_state(db: AsyncSession, *, row: Optional[models.InventoryConversationState] = None, user_id: str = "", channel: str = "") -> None:
    if row is None and user_id and channel:
        row = (await db.execute(
            select(models.InventoryConversationState).where(
                models.InventoryConversationState.user_id == user_id,
                models.InventoryConversationState.channel == channel,
            )
        )).scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.commit()

async def _save_state(
    db: AsyncSession, *, user_id: str, channel: str,
    active_intent: Optional[str] = None, pending_action: Optional[str] = None,
    draft_data: Optional[dict] = None, candidate_ids: Optional[list] = None,
    confirmation_token_hash: Optional[str] = None,
) -> models.InventoryConversationState:
    row = (await db.execute(
        select(models.InventoryConversationState).where(
            models.InventoryConversationState.user_id == user_id,
            models.InventoryConversationState.channel == channel,
        )
    )).scalar_one_or_none()
    if row is None:
        row = models.InventoryConversationState(user_id=user_id, channel=channel, expires_at=_now())
        db.add(row)
    row.active_intent = active_intent
    row.pending_action = pending_action
    row.draft_data = json.dumps(draft_data or {}, ensure_ascii=False)
    row.candidate_ids = json.dumps(candidate_ids) if candidate_ids else None
    row.confirmation_token_hash = confirmation_token_hash
    row.expires_at = _now() + timedelta(minutes=STATE_TTL_MINUTES)
    await db.commit()
    return row

def _draft(row: models.InventoryConversationState) -> dict:
    try:
        return json.loads(row.draft_data or "{}")
    except Exception:
        return {}

def _candidates(row: models.InventoryConversationState) -> list[int]:
    try:
        return json.loads(row.candidate_ids or "[]")
    except Exception:
        return []

# ── fuzzy name match ──────────────────────────────────────────────────────────

def _ratio(a: str, b: str) -> float:
    """Cheap SequenceMatcher-free similarity via difflib."""
    from difflib import SequenceMatcher
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()

async def _match_items(db: AsyncSession, *, user_id: str, name: str, limit: int = 5) -> tuple[list[models.InventoryItem], bool]:
    """Returns (items, exact). Fuzzy below FUZZY_MIN_RATIO is rejected."""
    rows, _ = await queries.search_items(db, user_id=user_id, query=name, limit=limit)
    if rows:
        exact = any(r.name.lower() == name.lower() for r in rows)
        return list(rows), exact
    # no substring hit — try fuzzy across all names
    all_rows, _ = await queries.search_items(db, user_id=user_id, limit=500)
    scored = [(r, _ratio(name, r.name)) for r in all_rows]
    scored = [(r, s) for r, s in scored if s >= FUZZY_MIN_RATIO]
    scored.sort(key=lambda x: -x[1])
    return [r for r, _ in scored[:limit]], False

async def _match_location(db: AsyncSession, *, user_id: str, name: str) -> Optional[models.InventoryLocation]:
    rows = await queries.list_locations(db, user_id=user_id)
    name_l = name.lower().strip()
    for r in rows:
        if r.name.lower() == name_l:
            return r
    for r in rows:
        if name_l in r.name.lower() or r.name.lower() in name_l:
            return r
    best, best_s = None, 0.0
    for r in rows:
        s = _ratio(name, r.name)
        if s > best_s:
            best, best_s = r, s
    return best if best_s >= FUZZY_MIN_RATIO else None

async def _match_container(db: AsyncSession, *, user_id: str, name: str) -> Optional[models.InventoryContainer]:
    rows = await queries.list_containers(db, user_id=user_id)
    name_l = name.lower().strip()
    for r in rows:
        if r.name.lower() == name_l:
            return r
    for r in rows:
        if name_l in r.name.lower() or r.name.lower() in name_l:
            return r
    best, best_s = None, 0.0
    for r in rows:
        s = _ratio(name, r.name)
        if s > best_s:
            best, best_s = r, s
    return best if best_s >= FUZZY_MIN_RATIO else None

# ── NLU: parse intent + entities ─────────────────────────────────────────────

_NUM_WORDS = {"satu": 1, "dua": 2, "tiga": 3, "empat": 4, "lima": 5, "enam": 6, "tujuh": 7, "lapan": 8, "sembilan": 9, "sepuluh": 10}

def _extract_quantity(text: str) -> tuple[Optional[int], str]:
    """Returns (qty, text_without_qty)."""
    m = re.search(r"\b(\d{1,6})\b", text)
    if m:
        qty = int(m.group(1))
        return qty, (text[:m.start()] + text[m.end():]).strip()
    for word, val in _NUM_WORDS.items():
        m = re.search(rf"\b{word}\b", text, re.IGNORECASE)
        if m:
            return val, (text[:m.start()] + text[m.end():]).strip()
    return None, text

def parse_inventory_intent(text: str) -> dict[str, Any]:
    """Regex NLU. Returns {'intent':..., 'entities': {...}, 'confidence': float}."""
    t = " ".join((text or "").split())
    tl = t.lower()

    if tl in {"barang", "barang help", "inventory", "inventory help", "barang?"}:
        return {"intent": "inventory_help", "confidence": 1.0, "entities": {}}

    if re.search(r"ringkasan barang|berapa barang", tl):
        return {"intent": "inventory_summary", "confidence": 0.95, "entities": {}}

    m = re.search(r"^(?:padam|delete|buang rekod)\s+(?:barang\s+)?(.+)$", tl)
    if m:
        return {"intent": "inventory_delete_item", "confidence": 0.9, "entities": {"item_name": m.group(1).strip()}}

    m = re.search(r"(?:pindah|letak|pindahkan)\s+(.+?)\s+(?:ke|dalam|dekat)\s+(.+)$", tl)
    if m:
        return {"intent": "inventory_move_item", "confidence": 0.9, "entities": {"item_name": m.group(1).strip(), "destination": m.group(2).strip()}}

    m = re.search(r"^(?:apa ada|senarai barang|barang)\s+(?:dalam|dekat|di)\s+(.+)$", tl)
    if m:
        return {"intent": "inventory_list_location", "confidence": 0.9, "entities": {"place_name": m.group(1).strip()}}

    # status: "<item> rosak/hilang/dipinjam/dah habis"
    for kw, status in STATUS_KEYWORDS.items():
        m = re.search(rf"^(.+?)\s+{re.escape(kw)}\b", tl)
        if m and m.group(1).strip() not in {"barang"}:
            return {"intent": "inventory_update_status", "confidence": 0.85, "entities": {"item_name": m.group(1).strip(), "status": status}}

    # location question: "kabel hdmi dekat mana" / "mana aku letak charger"
    m = re.search(r"^(.+?)\s+dekat mana\??$", tl)
    if m:
        return {"intent": "inventory_find_location", "confidence": 0.9, "entities": {"item_name": m.group(1).strip()}}
    m = re.search(r"^mana (?:aku )?letak (.+?)\??$", tl)
    if m:
        return {"intent": "inventory_find_location", "confidence": 0.85, "entities": {"item_name": m.group(1).strip()}}

    # quantity set: "bateri AA tinggal 2" / "bateri aa tinggal dua"
    m = re.search(r"^(.+?)\s+tinggal\s+(\d{1,6}|[a-z]+)$", tl)
    if m:
        word = m.group(2)
        qty = _NUM_WORDS.get(word, int(word) if word.isdigit() else None)
        if qty is not None:
            return {"intent": "inventory_update_quantity", "confidence": 0.85, "entities": {"item_name": m.group(1).strip(), "operation": "set", "amount": qty}}

    # quantity add: "tambah bateri AA 4"
    m = re.search(r"^tambah\s+(.+?)\s+(\d{1,6})$", tl)
    if m and not tl.startswith("tambah barang"):
        return {"intent": "inventory_update_quantity", "confidence": 0.85, "entities": {"item_name": m.group(1).strip(), "operation": "add", "amount": int(m.group(2))}}

    # quantity use: "guna satu bateri AA" / "guna 2 bateri AA"
    m = re.search(r"^guna\s+(\d{1,6}|[a-z]+)\s+(.+)$", tl)
    if m:
        word = m.group(1)
        qty = _NUM_WORDS.get(word, int(word) if word.isdigit() else None)
        if qty is not None:
            return {"intent": "inventory_update_quantity", "confidence": 0.85, "entities": {"item_name": m.group(2).strip(), "operation": "subtract", "amount": qty}}

    # search: "cari kabel" / "aku ada charger tak" / "pernah beli mouse tak" / "ada bateri lagi tak"
    m = re.search(r"^cari\s+(.+)$", tl)
    if m:
        return {"intent": "inventory_search_item", "confidence": 0.95, "entities": {"item_name": m.group(1).strip()}}
    m = re.search(r"^(?:aku )?ada\s+(.+?)\s+tak\??$", tl)
    if m:
        return {"intent": "inventory_search_item", "confidence": 0.85, "entities": {"item_name": m.group(1).strip()}}
    m = re.search(r"^pernah beli\s+(.+?)\s+tak\??$", tl)
    if m:
        return {"intent": "inventory_search_item", "confidence": 0.85, "entities": {"item_name": m.group(1).strip()}}
    m = re.search(r"^ada\s+(.+?)\s+lagi\??$", tl)
    if m:
        return {"intent": "inventory_search_item", "confidence": 0.85, "entities": {"item_name": m.group(1).strip()}}

    # create: "tambah barang X [N] [dalam Y]" / "barang baru X" / "simpan N X"
    m = re.search(r"^(?:tambah barang|barang baru|simpan)\s+(.+)$", tl)
    if m:
        rest = m.group(1).strip()
        qty, name = _extract_quantity(rest)
        location_name = None
        lm = re.search(r"\s+(?:dalam|dekat|di)\s+(.+)$", name)
        if lm:
            location_name = lm.group(1).strip()
            name = name[:lm.start()].strip()
        return {"intent": "inventory_create_item", "confidence": 0.9, "entities": {
            "item_name": name, "quantity": qty or 1, "location_name": location_name,
        }}

    return {"intent": "unknown", "confidence": 0.0, "entities": {}}

# ── formatting ────────────────────────────────────────────────────────────────

def _fmt_qty(item: models.InventoryItem) -> str:
    return f"{item.quantity} {item.unit}"

async def _fmt_location(db: AsyncSession, *, user_id: str, item: models.InventoryItem) -> str:
    path = await queries.location_full_path(db, location_id=item.location_id, user_id=user_id)
    cont = None
    if item.container_id:
        row = (await db.execute(select(models.InventoryContainer.name).where(models.InventoryContainer.id == item.container_id))).first()
        cont = row[0] if row else None
    if path and cont:
        return f"{path} → {cont}"
    return path or cont or "Tiada lokasi direkodkan"

def _help_text() -> str:
    return (
        "📦 *Barang Saya*\n\n"
        "Anda boleh cuba:\n"
        "• tambah barang kabel HDMI 2\n"
        "• cari kabel HDMI\n"
        "• kabel HDMI dekat mana\n"
        "• barang dalam Kotak Elektronik A\n"
        "• pindah kabel HDMI ke Kotak Elektronik B\n"
        "• kabel HDMI rosak\n"
        "• ringkasan barang"
    )

def _fallback_text() -> str:
    return (
        "Saya tidak pasti arahan tersebut.\n\n"
        "Untuk Barang Saya, anda boleh cuba:\n"
        "• cari kabel HDMI\n"
        "• tambah barang charger laptop\n"
        "• kabel HDMI dekat mana\n"
        "• barang dalam Kotak Elektronik A"
    )

# ── main handler ─────────────────────────────────────────────────────────────

async def handle_inventory_message(
    db: AsyncSession, *, user_id: str, text: str, channel: str,
    current_user: Optional[models.User] = None,
) -> str | None:
    """Returns reply text, or None when the message is not inventory-related."""
    t = " ".join((text or "").split())
    if not t:
        return None
    tl = t.lower()

    # Guard: "barang" keyword must appear or active state must exist for plain flows
    state = await _load_state(db, user_id=user_id, channel=channel)

    # 1) active confirmation flow takes precedence
    if state and state.pending_action:
        return await _handle_state_reply(db, user_id=user_id, channel=channel, state=state, text=t)

    parsed = parse_inventory_intent(t)
    intent = parsed["intent"]
    if intent == "unknown":
        return None  # not ours — let other handlers try

    entities = parsed["entities"]

    if intent == "inventory_help":
        return _help_text()

    if intent == "inventory_summary":
        s = await queries.get_summary(db, user_id=user_id)
        return (
            "📦 *Ringkasan Barang Saya*\n\n"
            f"Jenis barang: {s['total_types']}\n"
            f"Jumlah unit: {s['total_units']}\n"
            f"Ada: {s['available']}\n"
            f"Dipinjam: {s['loaned']}\n"
            f"Hilang: {s['missing']}\n"
            f"Rosak: {s['damaged']}\n"
            f"Tanpa lokasi: {s['no_location']}"
        )

    if intent == "inventory_create_item":
        name = entities["item_name"]
        qty = int(entities.get("quantity") or 1)
        location = None
        container = None
        if entities.get("location_name"):
            location = await _match_location(db, user_id=user_id, name=entities["location_name"])
            if location is None:
                container = await _match_container(db, user_id=user_id, name=entities["location_name"])
        if current_user is None:
            current_user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalar_one()
        payload = ItemCreate(
            name=name, quantity=qty,
            location_id=location.id if location else None,
            container_id=container.id if container else None,
        )
        item = await service.create_item(db, current_user=current_user, payload=payload, source_channel=channel)
        loc_txt = await _fmt_location(db, user_id=user_id, item=item)
        return f"✅ *{item.name}* direkodkan\nKuantiti: {_fmt_qty(item)}\nLokasi: {loc_txt}"

    if intent == "inventory_search_item":
        items, _ = await _match_items(db, user_id=user_id, name=entities["item_name"])
        if not items:
            await _save_state(db, user_id=user_id, channel=channel, active_intent="inventory_create_item",
                              pending_action="offer_create", draft_data={"name": entities["item_name"]})
            return (f"Barang *{entities['item_name']}* tidak dijumpai.\n\n"
                    "Mahu tambah sebagai barang baharu?\n1. Ya\n0. Batal")
        if len(items) == 1:
            item = items[0]
            loc_txt = await _fmt_location(db, user_id=user_id, item=item)
            return (f"📍 *{item.name}* berada di:\n{loc_txt}\n\n"
                    f"Kuantiti: {_fmt_qty(item)}\nStatus: {STATUS_LABELS_BM.get(item.status, item.status)}")
        await _save_state(db, user_id=user_id, channel=channel, active_intent="inventory_get_item",
                          candidate_ids=[int(i.id) for i in items[:PAGE_SIZE]])
        lines = [f"{idx}. {i.name} — {_fmt_qty(i)}" for idx, i in enumerate(items[:PAGE_SIZE], 1)]
        return "Beberapa barang dijumpai:\n" + "\n".join(lines) + "\n\nBalas nombor untuk pilih."

    if intent == "inventory_find_location":
        items, _ = await _match_items(db, user_id=user_id, name=entities["item_name"])
        if not items:
            return f"Barang *{entities['item_name']}* tidak dijumpai dalam rekod anda."
        if len(items) == 1:
            item = items[0]
            loc_txt = await _fmt_location(db, user_id=user_id, item=item)
            return f"📍 *{item.name}* berada di:\n{loc_txt}\n\nKuantiti: {_fmt_qty(item)}"
        await _save_state(db, user_id=user_id, channel=channel, active_intent="inventory_get_item",
                          candidate_ids=[int(i.id) for i in items[:PAGE_SIZE]])
        lines = [f"{idx}. {i.name} — {_fmt_qty(i)}" for idx, i in enumerate(items[:PAGE_SIZE], 1)]
        return "Beberapa barang dijumpai:\n" + "\n".join(lines) + "\n\nBalas nombor untuk pilih."

    if intent == "inventory_list_location":
        place = entities["place_name"]
        container = await _match_container(db, user_id=user_id, name=place)
        if container is not None:
            rows, total = await queries.search_items(db, user_id=user_id, container_id=container.id, limit=PAGE_SIZE)
            path = await queries.location_full_path(db, location_id=container.location_id, user_id=user_id)
            header = f"📦 *{container.name}*\n" + (f"Lokasi: {path}\n" if path else "")
            units = sum(r.quantity for r in rows)
            lines = [f"{i}. {r.name} — {_fmt_qty(r)}" for i, r in enumerate(rows, 1)]
            tail = f"\n\nJumlah: {total} jenis barang · {units} unit"
            nxt = "\n\nBalas *seterusnya* untuk lagi." if total > len(rows) else ""
            return header + "\n" + "\n".join(lines) + tail + nxt if rows else header + "\n(Kosong)"
        location = await _match_location(db, user_id=user_id, name=place)
        if location is not None:
            rows, total = await queries.search_items(db, user_id=user_id, location_id=location.id, limit=PAGE_SIZE)
            units = sum(r.quantity for r in rows)
            lines = [f"{i}. {r.name} — {_fmt_qty(r)}" for i, r in enumerate(rows, 1)]
            tail = f"\n\nJumlah: {total} jenis barang · {units} unit"
            nxt = "\n\nBalas *seterusnya* untuk lagi." if total > len(rows) else ""
            return f"📍 *{location.name}*\n\n" + "\n".join(lines) + tail + nxt if rows else f"📍 *{location.name}*\n\n(Kosong)"
        return f"Lokasi/bekas *{place}* tidak dijumpai. Senaraikan lokasi anda dahulu melalui app web."

    if intent == "inventory_move_item":
        items, _ = await _match_items(db, user_id=user_id, name=entities["item_name"])
        if not items:
            return f"Barang *{entities['item_name']}* tidak dijumpai."
        dest = entities["destination"]
        container = await _match_container(db, user_id=user_id, name=dest)
        location = None if container else await _match_location(db, user_id=user_id, name=dest)
        if container is None and location is None:
            return (f"Destinasi *{dest}* tidak dijumpai.\n"
                    "Cipta lokasi/bekas dahulu melalui app web, kemudian cuba lagi.")
        if len(items) > 1:
            await _save_state(db, user_id=user_id, channel=channel, active_intent="inventory_move_item",
                              pending_action="pick_item",
                              draft_data={"destination": dest, "container_id": container.id if container else None,
                                          "location_id": location.id if location else None},
                              candidate_ids=[int(i.id) for i in items[:PAGE_SIZE]])
            lines = [f"{idx}. {i.name} — {_fmt_qty(i)}" for idx, i in enumerate(items[:PAGE_SIZE], 1)]
            return "Barang mana yang hendak dipindah?\n" + "\n".join(lines)
        item = items[0]
        payload = ItemMove(location_id=location.id if location else None, container_id=container.id if container else None)
        if current_user is None:
            current_user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalar_one()
        await service.move_item(db, current_user=current_user, item_id=int(item.id), payload=payload, source_channel=channel)
        await db.refresh(item)
        loc_txt = await _fmt_location(db, user_id=user_id, item=item)
        return f"✅ *{item.name}* dipindah ke:\n{loc_txt}"

    if intent == "inventory_update_status":
        items, _ = await _match_items(db, user_id=user_id, name=entities["item_name"])
        if not items:
            return f"Barang *{entities['item_name']}* tidak dijumpai."
        if len(items) > 1:
            await _save_state(db, user_id=user_id, channel=channel, active_intent="inventory_update_status",
                              pending_action="pick_item",
                              draft_data={"status": entities["status"]},
                              candidate_ids=[int(i.id) for i in items[:PAGE_SIZE]])
            lines = [f"{idx}. {i.name} — {_fmt_qty(i)}" for idx, i in enumerate(items[:PAGE_SIZE], 1)]
            return "Barang mana?\n" + "\n".join(lines)
        item = items[0]
        status = entities["status"]
        if status in {"disposed", "used_up"}:
            token = secrets.token_hex(8)
            await _save_state(db, user_id=user_id, channel=channel, active_intent="inventory_update_status",
                              pending_action="confirm_status",
                              draft_data={"item_id": int(item.id), "status": status},
                              confirmation_token_hash=_hash_token(token))
            label = STATUS_LABELS_BM[status]
            return (f"Tetapkan *{item.name}* sebagai {label}?\n\n"
                    "Tindakan ini merekodkan perubahan status kekal.\n"
                    f"Balas *sah* untuk sahkan atau *batal*.")
        if current_user is None:
            current_user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalar_one()
        await service.change_status(db, current_user=current_user, item_id=int(item.id), payload=ItemStatus(status=status), source_channel=channel)
        return f"✅ Status *{item.name}* → {STATUS_LABELS_BM[status]}"

    if intent == "inventory_update_quantity":
        items, _ = await _match_items(db, user_id=user_id, name=entities["item_name"])
        if not items:
            return f"Barang *{entities['item_name']}* tidak dijumpai."
        if len(items) > 1:
            await _save_state(db, user_id=user_id, channel=channel, active_intent="inventory_update_quantity",
                              pending_action="pick_item",
                              draft_data={"operation": entities["operation"], "amount": entities["amount"]},
                              candidate_ids=[int(i.id) for i in items[:PAGE_SIZE]])
            lines = [f"{idx}. {i.name} — {_fmt_qty(i)}" for idx, i in enumerate(items[:PAGE_SIZE], 1)]
            return "Barang mana?\n" + "\n".join(lines)
        item = items[0]
        if current_user is None:
            current_user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalar_one()
        payload = ItemQuantity(operation=entities["operation"], amount=int(entities["amount"]))
        try:
            item = await service.change_quantity(db, current_user=current_user, item_id=int(item.id), payload=payload, source_channel=channel)
        except Exception:
            return "Kuantiti tidak boleh negatif. Tiada perubahan dibuat."
        extra = ""
        if item.quantity == 0:
            extra = "\n\nKuantiti sudah 0. Mahu tanda *Sudah Habis*? Balas *sah*."
            await _save_state(db, user_id=user_id, channel=channel, active_intent="inventory_update_status",
                              pending_action="confirm_status",
                              draft_data={"item_id": int(item.id), "status": "used_up"})
        return f"✅ *{item.name}*: {_fmt_qty(item)}{extra}"

    if intent == "inventory_delete_item":
        items, _ = await _match_items(db, user_id=user_id, name=entities["item_name"])
        if not items:
            return f"Barang *{entities['item_name']}* tidak dijumpai."
        if len(items) > 1:
            await _save_state(db, user_id=user_id, channel=channel, active_intent="inventory_delete_item",
                              pending_action="pick_item",
                              candidate_ids=[int(i.id) for i in items[:PAGE_SIZE]])
            lines = [f"{idx}. {i.name} — {_fmt_qty(i)}" for idx, i in enumerate(items[:PAGE_SIZE], 1)]
            return "Barang mana yang hendak dipadam?\n" + "\n".join(lines)
        item = items[0]
        await _save_state(db, user_id=user_id, channel=channel, active_intent="inventory_delete_item",
                          pending_action="confirm_delete",
                          draft_data={"item_id": int(item.id)})
        return (f"Padam *{item.name}* ({_fmt_qty(item)})?\n\n"
                "Rekod dan sejarah pergerakan akan disembunyikan.\n"
                "Balas *sah* untuk padam atau *batal*.")

    return _fallback_text()

# ── state reply handler (numbered pick / confirm / cancel) ───────────────────

async def _handle_state_reply(
    db: AsyncSession, *, user_id: str, channel: str, state: models.InventoryConversationState, text: str,
) -> str:
    tl = text.lower().strip()

    if tl in CANCEL_WORDS or tl in {"batal", "cancel"}:
        await _clear_state(db, row=state)
        return "Baik, dibatalkan. Tiada perubahan dibuat."

    draft = _draft(state)
    cands = _candidates(state)
    action = state.pending_action or ""

    if tl in NEXT_WORDS:
        return "Tiada lagi senarai seterusnya buat masa ini."

    if action == "offer_create":
        if tl in CONFIRM_WORDS:
            name = draft.get("name", "")
            user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalar_one()
            payload = ItemCreate(name=name)
            item = await service.create_item(db, current_user=user, payload=payload, source_channel=channel)
            await _clear_state(db, row=state)
            return f"✅ *{item.name}* direkodkan\nKuantiti: {_fmt_qty(item)}\nLokasi: Tiada lokasi direkodkan"
        await _clear_state(db, row=state)
        return "Baik, tidak ditambah."

    if action == "pick_item" and tl.isdigit():
        idx = int(tl) - 1
        if idx < 0 or idx >= len(cands):
            return "Nombor tidak sah. Balas nombor dalam senarai atau *batal*."
        item_id = cands[idx]
        intent = state.active_intent
        await _clear_state(db, row=state)
        user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalar_one()
        item = await queries.get_item_or_404(db, item_id=item_id, user_id=user_id)

        if intent == "inventory_get_item":
            loc_txt = await _fmt_location(db, user_id=user_id, item=item)
            return (f"📍 *{item.name}* berada di:\n{loc_txt}\n\n"
                    f"Kuantiti: {_fmt_qty(item)}\nStatus: {STATUS_LABELS_BM.get(item.status, item.status)}")

        if intent == "inventory_move_item":
            payload = ItemMove(location_id=draft.get("location_id"), container_id=draft.get("container_id"))
            await service.move_item(db, current_user=user, item_id=item_id, payload=payload, source_channel=channel)
            await db.refresh(item)
            loc_txt = await _fmt_location(db, user_id=user_id, item=item)
            return f"✅ *{item.name}* dipindah ke:\n{loc_txt}"

        if intent == "inventory_update_status":
            status = draft.get("status", "available")
            if status in {"disposed", "used_up"}:
                await _save_state(db, user_id=user_id, channel=channel, active_intent="inventory_update_status",
                                  pending_action="confirm_status", draft_data={"item_id": item_id, "status": status})
                return (f"Tetapkan *{item.name}* sebagai {STATUS_LABELS_BM[status]}?\n\n"
                        "Balas *sah* untuk sahkan atau *batal*.")
            await service.change_status(db, current_user=user, item_id=item_id, payload=ItemStatus(status=status), source_channel=channel)
            return f"✅ Status *{item.name}* → {STATUS_LABELS_BM.get(status, status)}"

        if intent == "inventory_update_quantity":
            payload = ItemQuantity(operation=draft.get("operation", "set"), amount=int(draft.get("amount", 0)))
            try:
                item = await service.change_quantity(db, current_user=user, item_id=item_id, payload=payload, source_channel=channel)
            except Exception:
                return "Kuantiti tidak boleh negatif. Tiada perubahan dibuat."
            return f"✅ *{item.name}*: {_fmt_qty(item)}"

        if intent == "inventory_delete_item":
            await _save_state(db, user_id=user_id, channel=channel, active_intent="inventory_delete_item",
                              pending_action="confirm_delete", draft_data={"item_id": item_id})
            return f"Padam *{item.name}* ({_fmt_qty(item)})?\n\nBalas *sah* untuk padam atau *batal*."

        return _fallback_text()

    if action == "confirm_status" and tl in CONFIRM_WORDS:
        item_id = int(draft.get("item_id", 0))
        status = draft.get("status", "available")
        user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalar_one()
        try:
            await service.change_status(db, current_user=user, item_id=item_id, payload=ItemStatus(status=status), source_channel=channel)
        except Exception:
            await _clear_state(db, row=state)
            return "Barang tidak dijumpai. Tiada perubahan dibuat."
        await _clear_state(db, row=state)
        return f"✅ Status dikemas kini → {STATUS_LABELS_BM.get(status, status)}"

    if action == "confirm_delete" and tl in CONFIRM_WORDS:
        item_id = int(draft.get("item_id", 0))
        user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalar_one()
        try:
            item = await queries.get_item_or_404(db, item_id=item_id, user_id=user_id)
            name = item.name
            await service.delete_item(db, current_user=user, item_id=item_id)
        except Exception:
            await _clear_state(db, row=state)
            return "Barang tidak dijumpai. Tiada perubahan dibuat."
        await _clear_state(db, row=state)
        return f"🗑️ *{name}* dipadam."

    # non-matching reply while in state: re-ask
    return "Balas nombor dalam senarai, *sah*, atau *batal*."
