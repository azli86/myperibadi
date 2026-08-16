from __future__ import annotations

import math
import re
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import whatsapp_service

async def handle_telegram_loanx_command_route(
    db: AsyncSession,
    *,
    current_user: models.User,
    chat_id: str,
    command_text: str,
    is_bm: bool,
    _send_telegram_message: Callable[..., Any],
    _build_telegram_loan_help_text: Callable[..., Any],
    _ensure_current_user_household: Callable[..., Any],
    _match_wallet_by_hint: Callable[..., Any],
    _wallet_label: Callable[..., Any],
    _select_transaction_wallet: Callable[..., Any],
    _get_accessible_wallets_for_user: Callable[..., Any],
    _get_loan_payment_category_id: Callable[..., Any],
    _ensure_wallet_can_cover_expense: Callable[..., Any],
    current_business_date: Callable[..., Any],
) -> bool:
    normalized = str(command_text or "").strip()
    lowered = normalized.lower()
    if not lowered.startswith("loanx"):
        return False

    rest = normalized[5:].strip()
    if not rest:
        await _send_telegram_message(chat_id, _build_telegram_loan_help_text(is_bm), linked=True)
        return True

    if rest.lower() == "list":
        result = await db.execute(
            select(models.Loan)
            .where(models.Loan.user_id == current_user.id)
            .order_by(models.Loan.status.asc(), models.Loan.updated_at.desc(), models.Loan.id.desc())
        )
        loans = list(result.scalars().all())
        active_loans = [loan for loan in loans if float(loan.outstanding_amount or 0) > 0.004]
        if not active_loans:
            await _send_telegram_message(
                chat_id,
                "Tiada loan aktif. Guna `loanx add <nama> <jumlah>`." if is_bm else "No active loans. Use `loanx add <name> <amount>`.",
                linked=True,
            )
            return True
        lines = ["📘 *Loan Aktif*" if is_bm else "📘 *Active Loans*"]
        for idx, loan in enumerate(active_loans[:20], start=1):
            outstanding = float(loan.outstanding_amount or 0)
            monthly_payment = float(loan.monthly_payment or 0)
            if monthly_payment > 0:
                remaining_months = math.ceil(outstanding / monthly_payment) if outstanding > 0.004 else 0
                month_label = "bulan baki" if is_bm else "months left"
                lines.append(f"{idx}. *{loan.name}* — RM {outstanding:,.2f} / RM {monthly_payment:,.2f} = *{remaining_months} {month_label}*")
            else:
                lines.append(f"{idx}. *{loan.name}* — RM {outstanding:,.2f}")
        await _send_telegram_message(chat_id, "\n".join(lines), linked=True)
        return True

    add_match = re.match(r"^add\s+(.+?)\s+(?:rm\s*)?(\d+(?:\.\d{1,2})?)(?:\s+(?:monthly\s+|bulanan\s+)?(?:rm\s*)?(\d+(?:\.\d{1,2})?))?$", rest, flags=re.IGNORECASE)
    if add_match:
        loan_name = str(add_match.group(1) or "").strip()
        opening_amount = float(add_match.group(2) or 0)
        monthly_payment = float(add_match.group(3) or 0)
        if not loan_name or opening_amount <= 0:
            await _send_telegram_message(chat_id, "Format salah. Guna `loanx add <nama> <jumlah> <bulanan>`." if is_bm else "Invalid format. Use `loanx add <name> <amount> <monthly>`.", linked=True)
            return True
        if monthly_payment < 0 or monthly_payment - opening_amount > 0.004:
            await _send_telegram_message(chat_id, "Bulanan mesti lebih kecil daripada jumlah loan." if is_bm else "Monthly pay must be lower than total loan.", linked=True)
            return True
        household_id = await _ensure_current_user_household(db, current_user)
        loan_key = whatsapp_service.counterparty_key(loan_name)
        exists = await db.execute(select(models.Loan).where(models.Loan.user_id == current_user.id, models.Loan.key == loan_key))
        if exists.scalars().first():
            await _send_telegram_message(chat_id, "Loan sudah wujud. Guna nama lain atau `loanx list`." if is_bm else "Loan already exists. Use another name or `loanx list`.", linked=True)
            return True
        loan = models.Loan(
            user_id=current_user.id,
            household_id=household_id,
            name=loan_name,
            key=loan_key,
            opening_amount=opening_amount,
            outstanding_amount=opening_amount,
            monthly_payment=monthly_payment if monthly_payment > 0 else None,
            start_date=current_business_date(),
            notes="Telegram loanx add",
            status="active",
        )
        db.add(loan)
        await db.commit()
        remaining_months = math.ceil(opening_amount / monthly_payment) if monthly_payment > 0 else None
        monthly_line = f"\nBulanan: *RM {monthly_payment:,.2f}*\nBaki bulan: *{remaining_months}*" if is_bm and monthly_payment > 0 else f"\nMonthly: *RM {monthly_payment:,.2f}*\nMonths left: *{remaining_months}*" if monthly_payment > 0 else ""
        await _send_telegram_message(
            chat_id,
            (f"✅ Loan disimpan: *{loan_name}*\nOutstanding: *RM {opening_amount:,.2f}*{monthly_line}\nTiada transaksi dibuat." if is_bm else f"✅ Loan saved: *{loan_name}*\nOutstanding: *RM {opening_amount:,.2f}*{monthly_line}\nNo transaction created."),
            linked=True,
        )
        return True

    pay_match = re.match(
        r"^pay\s+(.+?)\s+(?:rm\s*)?(\d+(?:\.\d{1,2})?)(?:\s+wallet\s+(.+))?$",
        rest,
        flags=re.IGNORECASE,
    )
    if pay_match:
        loan_name = str(pay_match.group(1) or "").strip()
        pay_amount = float(pay_match.group(2) or 0)
        wallet_hint = str(pay_match.group(3) or "").strip() or None
        if not loan_name or pay_amount <= 0:
            await _send_telegram_message(chat_id, "Format salah. Guna `loanx pay <nama> <jumlah> [wallet <nama_wallet>]`." if is_bm else "Invalid format. Use `loanx pay <name> <amount> [wallet <wallet_name>]`.", linked=True)
            return True

        loan_key = whatsapp_service.counterparty_key(loan_name)
        loan_result = await db.execute(select(models.Loan).where(models.Loan.user_id == current_user.id, models.Loan.key == loan_key))
        loan = loan_result.scalars().first()
        if not loan:
            await _send_telegram_message(chat_id, "Loan tidak dijumpai." if is_bm else "Loan not found.", linked=True)
            return True
        outstanding = float(loan.outstanding_amount or 0)
        if outstanding <= 0.004:
            await _send_telegram_message(chat_id, "Loan sudah selesai." if is_bm else "Loan already settled.", linked=True)
            return True
        if pay_amount - outstanding > 0.004:
            await _send_telegram_message(chat_id, f"Bayaran melebihi baki loan (RM {outstanding:,.2f})." if is_bm else f"Payment exceeds loan outstanding (RM {outstanding:,.2f}).", linked=True)
            return True

        wallets = await _get_accessible_wallets_for_user(db, current_user)
        selected_wallet = _match_wallet_by_hint(wallets, wallet_hint) if wallet_hint else None
        if not selected_wallet:
            selected_wallet = await _select_transaction_wallet(db, current_user, None)
        await _ensure_wallet_can_cover_expense(db, wallet=selected_wallet, current_user=current_user, amount=pay_amount)

        household_id = await _ensure_current_user_household(db, current_user)
        category_id = await _get_loan_payment_category_id(db, current_user.id, household_id)
        payment_date = current_business_date()
        txn = models.Transaction(
            wallet_id=selected_wallet.id,
            user_id=current_user.id,
            household_id=household_id,
            reference_id=models.generate_txn_reference(payment_date),
            type="expense",
            txn_date=payment_date,
            vendor_or_source=f"Loan Payment {loan.name}"[:190],
            amount=pay_amount,
            category_id=category_id,
            notes=f"Loan payment for {loan.name}"[:255],
            source_channel="telegram",
        )
        db.add(txn)
        await db.flush()
        payment = models.LoanPayment(
            user_id=current_user.id,
            household_id=household_id,
            loan_id=int(loan.id),
            wallet_id=selected_wallet.id,
            transaction_id=txn.id,
            amount=pay_amount,
            payment_date=payment_date,
            notes="Telegram loanx pay",
            source_channel="telegram",
        )
        db.add(payment)
        remaining = max(0.0, round(outstanding - pay_amount, 2))
        loan.outstanding_amount = remaining
        loan.status = "settled" if remaining <= 0.004 else "active"
        await db.commit()
        await _send_telegram_message(
            chat_id,
            (
                f"✅ Bayaran loan direkod.\nLoan: *{loan.name}*\nBayar: *RM {pay_amount:,.2f}*\nWallet: *{_wallet_label(selected_wallet)}*\nBaki: *RM {remaining:,.2f}*"
                if is_bm else
                f"✅ Loan payment recorded.\nLoan: *{loan.name}*\nPaid: *RM {pay_amount:,.2f}*\nWallet: *{_wallet_label(selected_wallet)}*\nRemaining: *RM {remaining:,.2f}*"
            ),
            linked=True,
        )
        return True

    await _send_telegram_message(chat_id, _build_telegram_loan_help_text(is_bm), linked=True)
    return True
