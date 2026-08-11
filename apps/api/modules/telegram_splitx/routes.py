"""Telegram splitx command — manage Split Bills from chat.

Reuses the same backend service as the Split Bill web page
(modules/split_bills/service.py) so amounts and status stay consistent.

Commands:
  splitx                       help
  splitx list                  list active/partial split bills
  splitx create <title> <total> <people>   create a new split bill
  splitx pay <id> <amount> [wallet <name>] record a reimbursement
  splitx done <id>             mark a split bill completed
  splitx <id>                  show split bill detail
"""

from __future__ import annotations

import re
from typing import Any, Callable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from modules.split_bills import schemas as split_schemas
from modules.split_bills import service as split_service


async def handle_telegram_splitx_command_route(
    db: AsyncSession,
    *,
    current_user: models.User,
    chat_id: str,
    command_text: str,
    is_bm: bool,
    _send_telegram_message: Callable[..., Any],
    _wallet_label: Callable[..., Any],
    _get_accessible_wallets_for_user: Callable[..., Any],
    _match_wallet_by_hint: Callable[..., Any],
    _select_transaction_wallet: Callable[..., Any],
) -> bool:
    normalized = str(command_text or "").strip()
    lowered = normalized.lower()
    if not lowered.startswith("splitx"):
        return False

    rest = normalized[6:].strip()
    _h = lambda s: s if is_bm else s  # placeholder for future bm/en switch

    if not rest or rest.lower() in ("help", "bantuan"):
        await _send_telegram_message(
            chat_id,
            (
                "🔀 *Split Bill*\n\n"
                "`splitx list` — senarai split bill aktif\n"
                "`splitx create <tajuk> <jumlah> <orang>` — buat split baharu\n"
                "`splitx pay <id> <jumlah> [wallet <nama>]` — rekod bayaran\n"
                "`splitx done <id>` — tanda selesai\n"
                "`splitx <id>` — butiran split bill"
                if is_bm else
                "🔀 *Split Bill*\n\n"
                "`splitx list` — list active split bills\n"
                "`splitx create <title> <amount> <people>` — create a new split\n"
                "`splitx pay <id> <amount> [wallet <name>]` — record a payment\n"
                "`splitx done <id>` — mark completed\n"
                "`splitx <id>` — split bill detail"
            ),
            linked=True,
        )
        return True

    if rest.lower() == "list":
        result = await db.execute(
            select(models.SplitBill)
            .where(models.SplitBill.user_id == current_user.id)
            .order_by(models.SplitBill.status.asc(), models.SplitBill.updated_at.desc(), models.SplitBill.id.desc())
        )
        splits = list(result.scalars().all())
        pending = [
            s for s in splits if split_service.compute_split_status(s) in ("active", "partial")
        ]
        if not pending:
            await _send_telegram_message(
                chat_id,
                "Tiada split bill aktif. Guna `splitx create <tajuk> <jumlah> <orang>`." if is_bm else "No active split bills. Use `splitx create <title> <amount> <people>`.",
                linked=True,
            )
            return True
        lines = ["🔀 *Split Bill Aktif*" if is_bm else "🔀 *Active Split Bills*"]
        for idx, s in enumerate(pending[:20], start=1):
            bal = float(s.balance_amount or 0)
            lines.append(
                f"{idx}. *{s.title}* (ID {s.id})\n"
                f"   Baki: *RM {bal:,.2f}*"
                if is_bm else
                f"{idx}. *{s.title}* (ID {s.id})\n"
                f"   Balance: *RM {bal:,.2f}*"
            )
        await _send_telegram_message(chat_id, "\n".join(lines), linked=True)
        return True

    # splitx create <title> <total> <people>
    create_match = re.match(
        r"^create\s+(.+?)\s+(?:rm\s*)?(\d+(?:\.\d{1,2})?)\s+(\d+)$",
        rest,
        flags=re.IGNORECASE,
    )
    if create_match:
        title = str(create_match.group(1) or "").strip()
        total = float(create_match.group(2) or 0)
        people = int(create_match.group(3) or 1)
        if not title or total <= 0 or people < 1:
            await _send_telegram_message(
                chat_id,
                "Format salah. Guna `splitx create <tajuk> <jumlah> <orang>`." if is_bm else "Invalid format. Use `splitx create <title> <amount> <people>`.",
                linked=True,
            )
            return True
        payload = split_schemas.SplitBillCreate(
            title=title,
            total_amount=total,
            people_count=people,
            am_i_included=True,
            notes="Telegram splitx create",
        )
        try:
            row = await split_service.create_split(
                db, current_user=current_user, payload=payload
            )
        except Exception as e:
            await _send_telegram_message(
                chat_id,
                f"Gagal buat split bill: {e}" if is_bm else f"Failed to create split bill: {e}",
                linked=True,
            )
            return True
        share = float(row.share_amount or 0)
        collect = float(row.collect_amount or 0)
        await _send_telegram_message(
            chat_id,
            (
                f"✅ Split bill disimpan: *{title}* (ID {row.id})\n"
                f"Jumlah: *RM {total:,.2f}*\n"
                f"{people} orang × RM {share:,.2f}\n"
                f"Bahagian anda: *RM {share:,.2f}*\n"
                f"Perlu terima: *RM {collect:,.2f}*\n\n"
                f"Rekod bayaran: `splitx pay {row.id} <jumlah>`"
                if is_bm else
                f"✅ Split bill saved: *{title}* (ID {row.id})\n"
                f"Total: *RM {total:,.2f}*\n"
                f"{people} people × RM {share:,.2f}\n"
                f"Your share: *RM {share:,.2f}*\n"
                f"To collect: *RM {collect:,.2f}*\n\n"
                f"Record payment: `splitx pay {row.id} <amount>`"
            ),
            linked=True,
        )
        return True

    # splitx pay <id> <amount> [wallet <name>]
    pay_match = re.match(
        r"^pay\s+(\d+)\s+(?:rm\s*)?(\d+(?:\.\d{1,2})?)(?:\s+wallet\s+(.+))?$",
        rest,
        flags=re.IGNORECASE,
    )
    if pay_match:
        split_id = int(pay_match.group(1))
        amount = float(pay_match.group(2) or 0)
        wallet_hint = str(pay_match.group(3) or "").strip() or None
        if amount <= 0:
            await _send_telegram_message(
                chat_id,
                "Jumlah tidak sah. Guna `splitx pay <id> <jumlah> [wallet <nama>]`." if is_bm else "Invalid amount. Use `splitx pay <id> <amount> [wallet <name>]`.",
                linked=True,
            )
            return True
        split = await db.get(models.SplitBill, split_id)
        if not split or split.user_id != current_user.id:
            await _send_telegram_message(chat_id, "Split bill tidak dijumpai." if is_bm else "Split bill not found.", linked=True)
            return True
        if split_service.compute_split_status(split) == "completed":
            await _send_telegram_message(chat_id, "Split bill sudah selesai." if is_bm else "Split bill already completed.", linked=True)
            return True

        wallets = await _get_accessible_wallets_for_user(db, current_user)
        selected_wallet = _match_wallet_by_hint(wallets, wallet_hint) if wallet_hint else None
        if not selected_wallet:
            selected_wallet = await _select_transaction_wallet(db, current_user, None)
        if selected_wallet is None:
            await _send_telegram_message(chat_id, "Tiada wallet tersedia." if is_bm else "No wallet available.", linked=True)
            return True

        from datetime import date as _date

        payload = split_schemas.SplitBillPaymentCreate(
            amount=amount,
            wallet_id=int(selected_wallet.id),
            payment_date=str(_date.today()),
            notes="Telegram splitx pay",
        )
        try:
            updated = await split_service.record_payment(
                db, current_user=current_user, split_id=split_id, payload=payload
            )
        except Exception as e:
            await _send_telegram_message(
                chat_id,
                f"Gagal rekod bayaran: {e}" if is_bm else f"Failed to record payment: {e}",
                linked=True,
            )
            return True
        received = float(updated.amount_received or 0)
        bal = float(updated.balance_amount or 0)
        status = split_service.compute_split_status(updated)
        await _send_telegram_message(
            chat_id,
            (
                f"✅ Bayaran direkod: *{updated.title}* (ID {updated.id})\n"
                f"Bayar: *RM {amount:,.2f}*\n"
                f"Wallet: *{_wallet_label(selected_wallet)}*\n"
                f"Diterima: *RM {received:,.2f}*\n"
                f"Baki: *RM {bal:,.2f}*\n"
                f"Status: *{status.title()}*"
                if is_bm else
                f"✅ Payment recorded: *{updated.title}* (ID {updated.id})\n"
                f"Paid: *RM {amount:,.2f}*\n"
                f"Wallet: *{_wallet_label(selected_wallet)}*\n"
                f"Received: *RM {received:,.2f}*\n"
                f"Balance: *RM {bal:,.2f}*\n"
                f"Status: *{status.title()}*"
            ),
            linked=True,
        )
        return True

    # splitx done <id>
    done_match = re.match(r"^done\s+(\d+)$", rest, flags=re.IGNORECASE)
    if done_match:
        split_id = int(done_match.group(1))
        split = await db.get(models.SplitBill, split_id)
        if not split or split.user_id != current_user.id:
            await _send_telegram_message(chat_id, "Split bill tidak dijumpai." if is_bm else "Split bill not found.", linked=True)
            return True
        try:
            updated = await split_service.mark_completed(
                db, current_user=current_user, split_id=split_id
            )
        except Exception as e:
            await _send_telegram_message(
                chat_id,
                f"Gagal tandakan selesai: {e}" if is_bm else f"Failed to mark completed: {e}",
                linked=True,
            )
            return True
        await _send_telegram_message(
            chat_id,
            f"✅ *{updated.title}* (ID {updated.id}) ditandakan selesai." if is_bm else f"✅ *{updated.title}* (ID {updated.id}) marked as completed.",
            linked=True,
        )
        return True

    # splitx <id> — detail
    detail_match = re.match(r"^(\d+)$", rest)
    if detail_match:
        split_id = int(detail_match.group(1))
        split = await db.get(models.SplitBill, split_id)
        if not split or split.user_id != current_user.id:
            await _send_telegram_message(chat_id, "Split bill tidak dijumpai." if is_bm else "Split bill not found.", linked=True)
            return True
        total = float(split.total_amount or 0)
        share = float(split.share_amount or 0)
        collect = float(split.collect_amount or 0)
        received = float(split.amount_received or 0)
        bal = float(split.balance_amount or 0)
        status = split_service.compute_split_status(split)
        await _send_telegram_message(
            chat_id,
            (
                f"🔀 *{split.title}* (ID {split.id})\n"
                f"Jumlah: *RM {total:,.2f}*\n"
                f"Orang: *{split.people_count}*\n"
                f"Bahagian anda: *RM {share:,.2f}*\n"
                f"Perlu terima: *RM {collect:,.2f}*\n"
                f"Diterima: *RM {received:,.2f}*\n"
                f"Baki: *RM {bal:,.2f}*\n"
                f"Status: *{status.title()}*"
                if is_bm else
                f"🔀 *{split.title}* (ID {split.id})\n"
                f"Total: *RM {total:,.2f}*\n"
                f"People: *{split.people_count}*\n"
                f"Your share: *RM {share:,.2f}*\n"
                f"To collect: *RM {collect:,.2f}*\n"
                f"Received: *RM {received:,.2f}*\n"
                f"Balance: *RM {bal:,.2f}*\n"
                f"Status: *{status.title()}*"
            ),
            linked=True,
        )
        return True

    await _send_telegram_message(
        chat_id,
        (
            "Format tidak dikenali. Guna `splitx help` untuk senarai arahan."
            if is_bm else
            "Unrecognized format. Use `splitx help` for a list of commands."
        ),
        linked=True,
    )
    return True
