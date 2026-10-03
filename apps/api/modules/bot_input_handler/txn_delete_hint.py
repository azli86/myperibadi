"""`delete TXN26-ABC123` in chat.

Deleting a transaction is not a chat command: it is done on the Transactions page. Barang Saya
(inventory) owns the word `delete`, so a transaction reference typed after it used to come back
as "Barang … tidak dijumpai". This answers it properly: finds the transaction, points to where it
is deleted, and catches a mistyped reference (the letter I and the digit 1, O and 0, look alike).
"""

from __future__ import annotations

import re
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import models

_DELETE = re.compile(r"^\s*(?:delete|padam|buang|remove)\s*\+?\s*(.*)$", re.IGNORECASE)
_REF = re.compile(r"TXN\s*(\d{2})\s*-\s*([A-Z0-9]{6})", re.IGNORECASE)
_LOOSE = re.compile(r"^TXN", re.IGNORECASE)
_LOOK_ALIKE = str.maketrans({"1": "I", "0": "O", "5": "S", "8": "B"})


def _canon(value: str) -> str:
    return value.upper().translate(_LOOK_ALIKE)


async def txn_delete_reply(db: AsyncSession, *, user_id: str, text: str) -> Optional[str]:
    m = _DELETE.match(text or "")
    if not m:
        return None
    arg = m.group(1).strip()
    if not _LOOSE.match(arg):
        return None  # a Barang Saya item, not a transaction

    user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalars().first()
    en = getattr(user, "language", "BM") == "EN"

    howto = (
        "Transactions cannot be deleted from chat. Open *Transactions* in the app, tap the record and choose *Delete*."
        if en
        else "Transaksi tidak boleh dipadam melalui chat. Buka *Transaksi* dalam app, tekan rekod itu dan pilih *Padam*."
    )

    ref_match = _REF.search(arg)
    if not ref_match:
        return (
            "I need the full reference, like `TXN26-ABC123`. Send `list` to see your last 5 records.\n\n" + howto
            if en
            else "Saya perlukan rujukan penuh, contohnya `TXN26-ABC123`. Hantar `list` untuk 5 rekod terakhir.\n\n" + howto
        )
    ref = f"TXN{ref_match.group(1)}-{ref_match.group(2).upper()}"

    found = (
        await db.execute(
            select(models.Transaction)
            .where(models.Transaction.user_id == user_id, or_(models.Transaction.reference_id == ref, models.Transaction.reference_id.like(f"{ref}-%")))
            .limit(1)
        )
    ).scalars().first()
    if found:
        return (f"Found *{ref}*. " if en else f"Rujukan *{ref}* dijumpai. ") + howto

    # Not found: look for the nearest reference that only differs by look-alike characters.
    year = ref_match.group(1)
    rows = (
        await db.execute(
            select(models.Transaction.reference_id)
            .where(models.Transaction.user_id == user_id, models.Transaction.reference_id.like(f"TXN{year}-%"))
            .order_by(models.Transaction.created_at.desc())
            .limit(2000)
        )
    ).scalars().all()
    wanted = _canon(ref)
    seen: list[str] = []
    for r in rows:
        base = re.sub(r"-[IO]$", "", r or "") if (r or "").count("-") > 1 else (r or "")
        if _canon(base) == wanted and base not in seen:
            seen.append(base)
        if len(seen) >= 3:
            break
    if seen:
        guess = ", ".join(f"*{s}*" for s in seen)
        return (
            f"I could not find *{ref}*. Did you mean {guess}? (the letter I and the digit 1, or O and 0, look alike)\n\n" + howto
            if en
            else f"Saya tak jumpa *{ref}*. Maksud anda {guess}? (huruf I dan nombor 1, atau O dan 0, nampak sama)\n\n" + howto
        )
    return (
        f"I could not find *{ref}* in your records. Send `list` to see your last 5 records.\n\n" + howto
        if en
        else f"Saya tak jumpa *{ref}* dalam rekod anda. Hantar `list` untuk 5 rekod terakhir.\n\n" + howto
    )
