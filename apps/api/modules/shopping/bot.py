"""Shopping list from the bot (WhatsApp, Telegram, web chat).

    buyx                      the list
    buyx susu                 add milk
    buyx susu 2, telur, roti  add several, split by commas or new lines
    buyx siap 2 | buyx siap susu     tick an item off (number or name)
    buyx buang 2              remove an item
    buyx clear                clear everything already bought

"senarai beli" and "shopping list" also show the list. The caller answers a
group chat with silence before this module is reached.
"""

from __future__ import annotations

import re

from sqlalchemy.ext.asyncio import AsyncSession

import models
from modules.shopping import service

_COMMAND = re.compile(r"^\s*(?:buyx|senarai\s+beli|shopping\s+list)\b[\s:,-]*(.*)$", re.IGNORECASE | re.DOTALL)
_SHOW = {"", "list", "senarai", "show", "papar", "lihat"}
_DONE = {"siap", "done", "dah", "tick", "beli", "bought", "settle"}
_UNDO = {"batal", "undo", "belum", "untick"}
_REMOVE = {"buang", "del", "delete", "padam", "remove", "hapus"}
_CLEAR = {"clear", "kosong", "kosongkan", "bersih"}
_HELP = {"help", "bantuan", "?"}


def match_shopping_command(text: str) -> bool:
    return bool(_COMMAND.match(text or ""))


def _line(item: models.ShoppingItem) -> str:
    qty = f" ×{item.quantity}" if item.quantity else ""
    return f"{item.name}{qty}"


def list_text(items: list[models.ShoppingItem], bm: bool) -> str:
    todo = [i for i in items if not i.done]
    bought = [i for i in items if i.done]
    title = "*Senarai Beli*" if bm else "*Shopping List*"
    if not todo and not bought:
        return (
            f"{title}\nKosong. Tambah dengan `buyx susu`."
            if bm
            else f"{title}\nEmpty. Add with `buyx milk`."
        )
    lines = [f"{title} ({len(todo)})" if todo else title]
    if todo:
        lines += [f"{n}. {_line(i)}" for n, i in enumerate(todo, 1)]
    else:
        lines.append("Semua sudah dibeli 🎉" if bm else "Everything is bought 🎉")
    if bought:
        names = ", ".join(i.name for i in bought[:6]) + ("…" if len(bought) > 6 else "")
        lines.append(f"\n✅ {'Dah beli' if bm else 'Bought'} ({len(bought)}): {names}")
    return "\n".join(lines)


def _help(bm: bool) -> str:
    if bm:
        return (
            "*Senarai Beli*\n"
            "`buyx` – papar senarai\n"
            "`buyx susu 2` – tambah (boleh banyak: `buyx susu, telur, roti`)\n"
            "`buyx siap 2` atau `buyx siap susu` – tanda sudah beli\n"
            "`buyx batal susu` – kembalikan ke senarai\n"
            "`buyx buang 2` – buang item\n"
            "`buyx kosongkan` – kosongkan yang sudah dibeli\n"
            "Arahan BM dan English sama-sama boleh."
        )
    return (
        "*Shopping List*\n"
        "`buyx` – show the list\n"
        "`buyx milk 2` – add (several: `buyx milk, eggs, bread`)\n"
        "`buyx done 2` or `buyx done milk` – tick off\n"
        "`buyx undo milk` – put it back on the list\n"
        "`buyx remove 2` – remove an item\n"
        "`buyx clear` – clear what is bought\n"
        "Malay commands work too (`buyx siap`)."
    )


async def handle_shopping_command(db: AsyncSession, *, user: models.User, text: str) -> str:
    bm = (getattr(user, "language", "BM") or "BM") != "EN"
    match = _COMMAND.match(text or "")
    rest = (match.group(1) if match else "").strip()
    first, _, tail = rest.partition(" ")
    action = first.lower()
    tail = tail.strip()

    async def show() -> str:
        return list_text(await service.list_items(db, user.id), bm)

    if action in _HELP:
        return _help(bm)
    if action in _SHOW and not tail:
        return await show()

    if action in _CLEAR and not tail:
        removed = await service.clear_done(db, user.id)
        await db.commit()
        head = (f"🧹 {removed} item yang sudah dibeli dibuang." if bm else f"🧹 Cleared {removed} bought item(s).")
        return f"{head}\n\n{await show()}"

    if action in _DONE or action in _UNDO or action in _REMOVE:
        if not tail:
            return _help(bm)
        done_target = action in _DONE
        # "done 1 3" ticks several; a name ticks one.
        refs = tail.split() if all(t.isdigit() for t in tail.split()) else [tail]
        changed: list[str] = []
        for ref in refs:
            if action in _REMOVE:
                item = (await service.find_item(db, user.id, ref, done=False)) or (await service.find_item(db, user.id, ref, done=True))
            else:
                item = await service.find_item(db, user.id, ref, done=not done_target)
            if item:
                changed.append(item.name)
                if action in _REMOVE:
                    await db.delete(item)
                else:
                    service.set_done(item, done_target)
        if not changed:
            return (
                f"Tak jumpa \"{tail}\" dalam senarai.\n\n{await show()}"
                if bm
                else f"Could not find \"{tail}\" on the list.\n\n{await show()}"
            )
        await db.commit()
        verb_bm = "dibuang" if action in _REMOVE else ("sudah dibeli" if done_target else "dikembalikan ke senarai")
        verb_en = "removed" if action in _REMOVE else ("bought" if done_target else "back on the list")
        return f"✅ {', '.join(changed)} – {verb_bm if bm else verb_en}.\n\n{await show()}"

    # Anything else is something to add: one or several, split by commas or lines.
    parts = [p.strip() for p in re.split(r"[,\n;]+", rest) if p.strip()]
    added: list[str] = []
    try:
        for part in parts[:30]:
            name, qty = service.split_name_and_quantity(part)
            if not name:
                continue
            item = await service.add_item(db, user.id, name, qty)
            added.append(_line(item))
    except ValueError as exc:
        await db.rollback()
        message = str(exc)
        if bm:
            full = re.match(r"The list is full \((\d+) items\)", message)
            if full:
                return f"Senarai penuh ({full.group(1)} barang). Tandakan beberapa yang sudah dibeli dahulu."
            if message == "Name is required.":
                return "Nama barang diperlukan."
        return message
    if not added:
        return _help(bm)
    await db.commit()
    return f"✅ {'Ditambah' if bm else 'Added'}: {', '.join(added)}.\n\n{await show()}"
