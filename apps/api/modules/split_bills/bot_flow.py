"""Split Bill bot command flow — create from OCR receipt and record reimbursement.

New command formats (primary):
  <category> <wallet> split <people_count>   e.g. `makan tng split 6`
  splitx <wallet>                            e.g. `splitx tng` (payment from OCR)

Legacy command formats (compatibility alias, unchanged):
  splitx create / pay / done / list / help
"""

from __future__ import annotations

import re
from datetime import date, datetime, time as dt_time
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import whatsapp_service
import bot_responses
from . import queries as split_queries
from . import service as split_service

CREATE_SPLIT_PATTERN = re.compile(
    r"^(?P<normal_command>.+?)\s+split\s+(?P<people_count>\d+)$",
    re.IGNORECASE,
)
SPLIT_PAYMENT_PATTERN = re.compile(
    r"^splitx\s+(?P<wallet>.+)$",
    re.IGNORECASE,
)
# Reserved legacy splitx subcommands that fall back to the old handler.
LEGACY_SPLITX_KEYWORDS = {"create", "pay", "done", "list", "help", "bantuan"}

# In-memory pending OCR + selection state (per process), same pattern as
# whatsapp_service pending-category state.
PENDING_OCR: dict[str, dict[str, Any]] = {}
PENDING_SPLIT_SELECTION: dict[str, dict[str, Any]] = {}
PENDING_OVERPAYMENT: dict[str, dict[str, Any]] = {}
PENDING_OCR_TTL_SECONDS = 60 * 60  # 1 hour


def _pending_key(user_id: str, source_channel: str) -> str:
    return f"{user_id}:{source_channel or 'whatsapp'}"


def _fresh(created_ts: Optional[float]) -> bool:
    if not created_ts:
        return True
    return (datetime.utcnow().timestamp() - created_ts) <= PENDING_OCR_TTL_SECONDS


# ---- pending OCR store ------------------------------------------------------


def set_pending_ocr(user_id: str, source_channel: str, payload: dict[str, Any]) -> None:
    payload = dict(payload)
    payload["created_at_ts"] = datetime.utcnow().timestamp()
    PENDING_OCR[_pending_key(user_id, source_channel)] = payload


def get_pending_ocr(user_id: str, source_channel: str) -> Optional[dict[str, Any]]:
    payload = PENDING_OCR.get(_pending_key(user_id, source_channel))
    if not payload:
        return None
    if not _fresh(payload.get("created_at_ts")):
        PENDING_OCR.pop(_pending_key(user_id, source_channel), None)
        return None
    return payload


def clear_pending_ocr(user_id: str, source_channel: str) -> None:
    PENDING_OCR.pop(_pending_key(user_id, source_channel), None)


def get_pending_split_selection(user_id: str, source_channel: str) -> Optional[dict[str, Any]]:
    p = PENDING_SPLIT_SELECTION.get(_pending_key(user_id, source_channel))
    if not p:
        return None
    if not _fresh(p.get("created_at_ts")):
        PENDING_SPLIT_SELECTION.pop(_pending_key(user_id, source_channel), None)
        return None
    return p


def set_pending_split_selection(user_id: str, source_channel: str, payload: dict[str, Any]) -> None:
    payload = dict(payload)
    payload["created_at_ts"] = datetime.utcnow().timestamp()
    PENDING_SPLIT_SELECTION[_pending_key(user_id, source_channel)] = payload


def clear_pending_split_selection(user_id: str, source_channel: str) -> None:
    PENDING_SPLIT_SELECTION.pop(_pending_key(user_id, source_channel), None)


def get_pending_overpayment(user_id: str, source_channel: str) -> Optional[dict[str, Any]]:
    p = PENDING_OVERPAYMENT.get(_pending_key(user_id, source_channel))
    if not p:
        return None
    if not _fresh(p.get("created_at_ts")):
        PENDING_OVERPAYMENT.pop(_pending_key(user_id, source_channel), None)
        return None
    return p


def set_pending_overpayment(user_id: str, source_channel: str, payload: dict[str, Any]) -> None:
    payload = dict(payload)
    payload["created_at_ts"] = datetime.utcnow().timestamp()
    PENDING_OVERPAYMENT[_pending_key(user_id, source_channel)] = payload


def clear_pending_overpayment(user_id: str, source_channel: str) -> None:
    PENDING_OVERPAYMENT.pop(_pending_key(user_id, source_channel), None)


def _is_bm(user: models.User) -> bool:
    return getattr(user, "language", "BM") != "EN"


# ---- helpers -----------------------------------------------------------------


def _round_money(value: Decimal) -> Decimal:
    return (value.quantize(Decimal("0.01")) if value > 0 else Decimal("0.00"))


async def _resolve_wallet(
    db: AsyncSession, user: models.User, hint: str
) -> Optional[models.Wallet]:
    wallets = await _user_wallets(db, user)
    return whatsapp_service._match_wallet_by_hint(wallets, hint)


async def _user_wallets(db: AsyncSession, user: models.User):
    query = select(models.Wallet).where(
        models.Wallet.owner_user_id == user.id,
    )
    rows = list((await db.execute(query)).scalars().all())
    if user.default_household_id:
        hq = select(models.Wallet).where(
            models.Wallet.household_id == user.default_household_id,
            models.Wallet.owner_user_id.is_(None),
        )
        rows += list((await db.execute(hq)).scalars().all())
    return rows


async def _resolve_category(
    db: AsyncSession, user: models.User, name: str
) -> Optional[models.Category]:
    """Resolve an expense category by exact name or keyword (existing resolver)."""
    if not user.default_household_id:
        return None
    norm = bot_responses.normalize_message_text(name).lower()
    rows = list((await db.execute(
        select(models.Category).where(
            models.Category.household_id == user.default_household_id,
            models.Category.is_internal == False,
            models.Category.kind == "expense",
        )
    )).scalars().all())
    for c in rows:
        c_norm = bot_responses.normalize_message_text(c.name).lower()
        if c_norm == norm:
            return c
    # Substring/prefix fallback so `makan` -> "Makanan & Minuman".
    for c in rows:
        c_norm = bot_responses.normalize_message_text(c.name).lower()
        if norm and (norm in c_norm or c_norm in norm):
            return c
    kw_rows = (await db.execute(
        select(models.CategoryKeyword, models.Category)
        .join(models.Category, models.CategoryKeyword.category_id == models.Category.id)
        .where(
            models.CategoryKeyword.is_active == True,
            models.Category.is_internal == False,
            models.Category.kind == "expense",
            models.Category.household_id == user.default_household_id,
        )
    )).all()
    for kw, category in kw_rows:
        kw_norm = bot_responses.normalize_message_text(kw.keyword or "").lower()
        if kw_norm and (kw_norm == norm or kw_norm in norm or norm in kw_norm):
            return category
    return None


def _parse_ocr_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value), "%d/%m/%Y").date()
    except (ValueError, TypeError):
        try:
            return datetime.strptime(str(value), "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None


def _parse_ocr_time(value: Any) -> Optional[dt_time]:
    if value is None:
        return None
    if isinstance(value, dt_time):
        return value
    try:
        return datetime.strptime(str(value), "%H:%M").time()
    except (ValueError, TypeError):
        return None


async def _attach_media(
    db: AsyncSession,
    user_id: str,
    transaction_id: int,
    pending_media: Optional[dict[str, Any]],
) -> None:
    if not pending_media:
        return
    object_key = pending_media.get("object_key")
    payload = pending_media.get("payload")
    if not object_key and not payload:
        return
    import asyncio
    import storage_service

    if not object_key and payload:
        from pathlib import Path

        ext = Path(pending_media.get("file_name") or "receipt.jpg").suffix or ".jpg"
        object_key = f"receipts/{user_id}/{datetime.utcnow().strftime('%Y%m%d%H%M%S')}{ext}"
        await asyncio.to_thread(
            storage_service.upload_receipt_object,
            object_key,
            payload,
            pending_media.get("mime_type") or "image/jpeg",
        )
    if object_key:
        db.add(
            models.Attachment(
                transaction_id=transaction_id,
                uploaded_by_user_id=user_id,
                file_name=pending_media.get("file_name") or "receipt",
                file_path=object_key,
                mime_type=pending_media.get("mime_type"),
                size_bytes=pending_media.get("size_bytes"),
            )
        )


async def _reimbursement_category_id(db: AsyncSession, household_id: int) -> int:
    cat = await split_queries.find_or_create_reimbursement_category(
        db, household_id=household_id
    )
    return int(cat.id)


# ---- create split from OCR ----------------------------------------------------


async def handle_create_split_command(
    db: AsyncSession,
    *,
    user: models.User,
    source_channel: str,
    command_text: str,
    pending_ocr: Optional[dict[str, Any]],
) -> Optional[str]:
    """Handle `<category> <wallet> split <people_count>` from a pending OCR.

    Returns a reply string, or None if command does not apply.
    """
    stripped = (command_text or "").strip()
    match = CREATE_SPLIT_PATTERN.match(stripped)
    if not match:
        return None

    people_count = int(match.group("people_count"))
    if people_count < 2:
        return (
            "Split mesti sekurang-kurangnya 2 orang."
            if _is_bm(user)
            else "Split must include at least 2 people."
        )

    if not pending_ocr:
        return (
            "Hantar gambar resit dahulu."
            if _is_bm(user)
            else "Please send the receipt first."
        )

    amount = Decimal(str(pending_ocr.get("amount") or 0))
    if amount <= 0:
        return (
            "Jumlah resit tidak sah. Hantar semula gambar resit."
            if _is_bm(user)
            else "Invalid receipt amount. Resend the receipt image."
        )

    normal_command = match.group("normal_command").strip()
    # Split trailing wallet token, e.g. `makan tng` -> category `makan`, wallet `tng`.
    category_name, wallet = await _split_category_wallet(db, user, normal_command)
    if not category_name or wallet is None:
        return (
            "Kategori atau wallet tidak dijumpai. Contoh: `makan tng split 6`."
            if _is_bm(user)
            else "Category or wallet not found. Example: `makan tng split 6`."
        )

    title = (pending_ocr.get("title") or "").strip() or category_name
    txn_date = _parse_ocr_date(pending_ocr.get("txn_date")) or date.today()
    txn_time = _parse_ocr_time(pending_ocr.get("txn_time"))
    household_id = await split_queries.ensure_household(db, user)

    share = _round_money(amount / Decimal(people_count))
    expected = _round_money(amount - share)

    # Create original expense transaction (atomic).
    txn = models.Transaction(
        user_id=user.id,
        reference_id=models.generate_txn_reference(txn_date),
        wallet_id=int(wallet.id),
        household_id=household_id,
        type="expense",
        txn_date=txn_date,
        txn_time=txn_time,
        vendor_or_source=title[:190],
        amount=float(amount),
        category_id=await _resolve_category_id(db, user, category_name),
        notes=normal_command[:255] or None,
        source_channel=source_channel,
        transaction_kind="split",
    )
    db.add(txn)
    await db.flush()

    split = models.SplitBill(
        user_id=user.id,
        household_id=household_id,
        transaction_id=int(txn.id),
        title=title,
        currency="RM",
        total_amount=float(amount),
        people_count=int(people_count),
        share_amount=float(share),
        collect_amount=float(expected),
        amount_received=0.0,
        balance_amount=float(expected),
        am_i_included=True,
        status="active",
        notes=None,
        original_txn_date=txn_date,
    )
    db.add(split)

    await _attach_media(db, user.id, int(txn.id), pending_ocr.get("media"))

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    clear_pending_ocr(user.id, source_channel)
    whatsapp_service._take_pending_receipt_media(user.id, source_channel)

    return _render_split_created(is_bm=_is_bm(user), title=title, amount=amount, people=people_count, share=share, collect=expected)


async def _resolve_category_id(db: AsyncSession, user: models.User, name: str) -> Optional[int]:
    cat = await _resolve_category(db, user, name)
    return int(cat.id) if cat else None


async def _split_category_wallet(
    db: AsyncSession, user: models.User, command: str
):
    """Split `makan tng` into category `makan` + wallet hint `tng`."""
    normalized = bot_responses.normalize_message_text(command or "").strip()
    wallets = await _user_wallets(db, user)
    tokens = normalized.split()
    if not tokens:
        return None, None
    for cut in range(len(tokens), 0, -1):
        category_part = " ".join(tokens[:cut])
        wallet_hint = " ".join(tokens[cut:])
        cat = await _resolve_category(db, user, category_part)
        wallet = whatsapp_service._match_wallet_by_hint(wallets, wallet_hint) if wallet_hint else None
        if cat and wallet:
            return category_part, wallet
    return None, None


def _render_split_created(*, is_bm: bool, title: str, amount: Decimal, people: int, share: Decimal, collect: Decimal) -> str:
    if is_bm:
        return (
            f"✅ Split bill disimpan:\n"
            f"• Butiran: *{title}*\n"
            f"• Jumlah: *RM {amount:,.2f}*\n"
            f"• Split: *{people} × RM {share:,.2f}*\n"
            f"• Bahagian anda: *RM {share:,.2f}*\n"
            f"• Perlu terima: *RM {collect:,.2f}*"
        )
    return (
        f"✅ Split bill saved:\n"
        f"• Details: *{title}*\n"
        f"• Total: *RM {amount:,.2f}*\n"
        f"• Split: *{people} × RM {share:,.2f}*\n"
        f"• Your share: *RM {share:,.2f}*\n"
        f"• To collect: *RM {collect:,.2f}*"
    )


# ---- splitx payment from OCR ---------------------------------------------------


async def handle_splitx_payment_command(
    db: AsyncSession,
    *,
    user: models.User,
    source_channel: str,
    command_text: str,
    pending_ocr: Optional[dict[str, Any]],
) -> Optional[str]:
    """Handle `splitx <wallet>` payment from a pending OCR.

    Returns a reply string, or None if command does not apply.
    """
    stripped = (command_text or "").strip()
    match = SPLIT_PAYMENT_PATTERN.match(stripped)
    if not match:
        return None
    wallet_token = match.group("wallet").strip()
    if wallet_token.lower() in LEGACY_SPLITX_KEYWORDS:
        return None  # fall back to legacy handler

    if not pending_ocr:
        return (
            "Hantar screenshot pembayaran dahulu."
            if _is_bm(user)
            else "Please send the payment screenshot first."
        )

    amount = Decimal(str(pending_ocr.get("amount") or 0))
    if amount <= 0:
        return (
            "Jumlah screenshot tidak sah. Hantar semula screenshot."
            if _is_bm(user)
            else "Invalid screenshot amount. Resend the screenshot."
        )

    wallet = await _resolve_wallet(db, user, wallet_token)
    if wallet is None:
        return (
            f"Wallet *{wallet_token}* tidak dijumpai."
            if _is_bm(user)
            else f"Wallet *{wallet_token}* not found."
        )

    active = await _active_splits(db, user.id)
    if not active:
        return (
            "Tiada split bill aktif dijumpai."
            if _is_bm(user)
            else "No active split bill found."
        )

    if len(active) == 1:
        return await _record_split_payment(
            db,
            user=user,
            source_channel=source_channel,
            split=active[0],
            amount=amount,
            wallet=wallet,
            pending_ocr=pending_ocr,
        )

    set_pending_split_selection(
        user.id,
        source_channel,
        {
            "split_ids": [int(s.id) for s in active],
            "amount": str(amount),
            "wallet_id": int(wallet.id),
            "pending_ocr": pending_ocr,
        },
    )
    lines = ["Pilih split bill:"] if _is_bm(user) else ["Select split bill:"]
    for i, s in enumerate(active[:10], start=1):
        bal = float(s.balance_amount or 0)
        lines.append(f"{i} — {s.title} — Baki RM {bal:,.2f}" if _is_bm(user) else f"{i} — {s.title} — Balance RM {bal:,.2f}")
    lines.append("Balas `1` atau `2`." if _is_bm(user) else "Reply `1` or `2`.")
    return "\n".join(lines)


async def _active_splits(db: AsyncSession, user_id: str):
    res = await db.execute(
        select(models.SplitBill)
        .where(
            models.SplitBill.user_id == user_id,
            models.SplitBill.status.in_(["active", "partial"]),
        )
        .order_by(models.SplitBill.updated_at.desc())
    )
    return list(res.scalars().all())


async def _record_split_payment(
    db: AsyncSession,
    *,
    user: models.User,
    source_channel: str,
    split: models.SplitBill,
    amount: Decimal,
    wallet: models.Wallet,
    pending_ocr: dict[str, Any],
) -> str:
    balance = Decimal(str(split.balance_amount or 0))
    overpayment = amount > balance

    if overpayment:
        set_pending_overpayment(
            user.id,
            source_channel,
            {
                "split_id": int(split.id),
                "amount": str(amount),
                "wallet_id": int(wallet.id),
                "pending_ocr": pending_ocr,
            },
        )
        return (
            f"Jumlah bayaran: RM {amount:,.2f}\n"
            f"Baki split: RM {balance:,.2f}\n\n"
            "Bayaran melebihi baki.\n"
            "Balas `confirm` untuk teruskan atau `cancel`."
            if _is_bm(user)
            else f"Payment amount: RM {amount:,.2f}\n"
            f"Split balance: RM {balance:,.2f}\n\n"
            "Payment exceeds the remaining balance.\n"
            "Reply `confirm` to continue or `cancel`."
        )

    return await _commit_split_payment(
        db,
        user=user,
        source_channel=source_channel,
        split=split,
        amount=amount,
        wallet=wallet,
        pending_ocr=pending_ocr,
    )


async def _commit_split_payment(
    db: AsyncSession,
    *,
    user: models.User,
    source_channel: str,
    split: models.SplitBill,
    amount: Decimal,
    wallet: models.Wallet,
    pending_ocr: dict[str, Any],
) -> str:
    household_id = split.household_id or await split_queries.ensure_household(db, user)
    txn_date = _parse_ocr_date(pending_ocr.get("txn_date")) or date.today()
    txn_time = _parse_ocr_time(pending_ocr.get("txn_time"))
    category_id = await _reimbursement_category_id(db, household_id)

    txn = models.Transaction(
        user_id=user.id,
        reference_id=models.generate_txn_reference(txn_date),
        wallet_id=int(wallet.id),
        household_id=household_id,
        type="income",
        txn_date=txn_date,
        txn_time=txn_time,
        vendor_or_source=f"Split: {split.title[:120]}",
        amount=float(amount),
        category_id=category_id,
        notes="Reimbursement" if _is_bm(user) else "Reimbursement",
        source_channel=source_channel,
        transaction_kind="reimbursement",
    )
    db.add(txn)
    await db.flush()

    payment = models.SplitBillPayment(
        user_id=user.id,
        household_id=household_id,
        split_bill_id=int(split.id),
        wallet_id=int(wallet.id),
        transaction_id=int(txn.id),
        amount=float(amount),
        payment_date=txn_date,
        payment_time=txn_time,
        notes="Telegram/WA splitx",
    )
    db.add(payment)
    await db.flush()
    await db.refresh(split, ["payments"])

    split_service.recompute_amounts(split)
    await _attach_media(db, user.id, int(txn.id), pending_ocr.get("media"))
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    clear_pending_ocr(user.id, source_channel)
    whatsapp_service._take_pending_receipt_media(user.id, source_channel)

    received = float(split.amount_received or 0)
    bal = float(split.balance_amount or 0)
    status = split_service.compute_split_status(split)
    return (
        f"✅ Bayaran split diterima:\n"
        f"• Jumlah: *RM {amount:,.2f}*\n"
        f"• Split: *{split.title}*\n"
        f"• Wallet: *{whatsapp_service.wallet_display_name(wallet) or wallet.name}*\n"
        f"• Diterima: *RM {received:,.2f}*\n"
        f"• Baki: *RM {bal:,.2f}*\n"
        f"• Status: *{status.title()}*"
        if _is_bm(user)
        else f"✅ Split payment received:\n"
        f"• Amount: *RM {amount:,.2f}*\n"
        f"• Split: *{split.title}*\n"
        f"• Wallet: *{whatsapp_service.wallet_display_name(wallet) or wallet.name}*\n"
        f"• Received: *RM {received:,.2f}*\n"
        f"• Balance: *RM {bal:,.2f}*\n"
        f"• Status: *{status.title()}*"
    )
