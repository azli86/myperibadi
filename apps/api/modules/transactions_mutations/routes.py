from __future__ import annotations

from datetime import date, time, datetime, timezone
from zoneinfo import ZoneInfo
from typing import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas
import location_service
from time_utils import current_business_date


async def update_transaction_route(
    *,
    txn_id: str,
    txn_in: schemas.TransactionCreate,
    current_user: models.User,
    db: AsyncSession,
    get_user_transaction: Callable[..., Awaitable[models.Transaction]],
    ensure_current_user_household: Callable[..., Awaitable[int]],
    backfill_wallet_transfer_categories: Callable[..., Awaitable[None]],
    is_wallet_transfer_signature: Callable[..., bool],
    is_debt_movement_signature: Callable[..., bool],
    coerce_transaction_date: Callable[[str | None, date], date],
    resolve_transaction_category_id: Callable[..., Awaitable[int | None]],
    normalize_transaction_items_payload: Callable[[list[schemas.TransactionItemInput] | None], tuple[list[dict], float]],
    validate_transaction_type: Callable[[str], str],
    get_accessible_wallet: Callable[..., Awaitable[models.Wallet]],
    select_transaction_wallet: Callable[..., Awaitable[models.Wallet]],
    ensure_wallet_can_cover_expense: Callable[..., Awaitable[None]],
    normalize_transaction_location: Callable[..., tuple[float | None, float | None, str | None]],
    replace_transaction_items: Callable[..., Awaitable[None]],
    publish_realtime_to_household: Callable[..., Awaitable[None]],
) -> dict[str, str]:
    existing = await get_user_transaction(txn_id, current_user.id, db)
    household_id = await ensure_current_user_household(db, current_user)
    await backfill_wallet_transfer_categories(db, user_id=current_user.id, household_id=household_id)

    category = None
    if existing.category_id is not None:
        category_result = await db.execute(select(models.Category).where(models.Category.id == existing.category_id))
        category = category_result.scalars().first()
    if is_wallet_transfer_signature(
        existing,
        category_system_code=getattr(category, "system_code", None),
        category_is_internal=getattr(category, "is_internal", None),
    ):
        raise HTTPException(status_code=403, detail="Wallet transfer transactions are managed internally.")
    if is_debt_movement_signature(category_system_code=getattr(category, "system_code", None)):
        raise HTTPException(status_code=403, detail="Debt transactions are managed internally.")

    txn_date = coerce_transaction_date(txn_in.txn_date, existing.txn_date)
    resolved_category_id = await resolve_transaction_category_id(
        txn_in.category_id,
        current_user=current_user,
        db=db,
    )
    normalized_items, computed_amount = normalize_transaction_items_payload(txn_in.items)
    resolved_amount = computed_amount if normalized_items else txn_in.amount
    resolved_type = validate_transaction_type(txn_in.type)
    if txn_in.wallet_id is not None:
        resolved_wallet = await get_accessible_wallet(txn_in.wallet_id, current_user, db)
    elif existing.wallet_id is not None:
        resolved_wallet = await get_accessible_wallet(existing.wallet_id, current_user, db)
    else:
        resolved_wallet = await select_transaction_wallet(db, current_user, None)
    resolved_wallet_id = resolved_wallet.id

    if resolved_type == "expense":
        await ensure_wallet_can_cover_expense(
            db,
            wallet=resolved_wallet,
            current_user=current_user,
            amount=resolved_amount,
            exclude_transaction_id=existing.id,
        )

    latitude, longitude, location_name = normalize_transaction_location(
        latitude=txn_in.latitude,
        longitude=txn_in.longitude,
        location_name=txn_in.location_name,
    )
    location_name = await location_service.resolve_short_location_name(
        latitude=latitude,
        longitude=longitude,
        location_name=location_name,
    )

    subscription_id = txn_in.subscription_id
    if subscription_id is not None:
        subscription = await db.scalar(select(models.Subscription).where(models.Subscription.id == subscription_id, models.Subscription.user_id == current_user.id))
        if not subscription:
            raise HTTPException(status_code=404, detail="Subscription not found.")
        # Linking a transaction to a subscription records its last payment date.
        if txn_date:
            subscription.last_payment_date = txn_date
        subscription.updated_at = datetime.utcnow()

    parsed_txn_time = _parse_txn_time(txn_in.txn_time)
    if parsed_txn_time is None and txn_date == current_business_date():
        parsed_txn_time = datetime.now(await _resolve_user_tz(db, current_user.id)).time().replace(microsecond=0)
    await db.execute(
        update(models.Transaction).where(models.Transaction.id == existing.id).values(
            wallet_id=resolved_wallet_id,
            type=resolved_type,
            amount=resolved_amount,
            vendor_or_source=txn_in.vendor_or_source,
            category_id=resolved_category_id,
            subscription_id=subscription_id,
            txn_date=txn_date,
            txn_time=parsed_txn_time,
            notes=txn_in.notes,
            latitude=latitude,
            longitude=longitude,
            location_name=location_name,
        )
    )
    if txn_in.items is not None:
        await replace_transaction_items(db, existing.id, normalized_items)
    await db.commit()
    try:
        await publish_realtime_to_household(db, current_user.id, "changed", "transactions")
    except Exception:
        pass
    return {"message": "Transaction updated"}


async def delete_transaction_route(
    *,
    txn_id: str,
    current_user: models.User,
    db: AsyncSession,
    get_user_transaction: Callable[..., Awaitable[models.Transaction]],
    ensure_current_user_household: Callable[..., Awaitable[int]],
    backfill_wallet_transfer_categories: Callable[..., Awaitable[None]],
    is_wallet_transfer_signature: Callable[..., bool],
    is_debt_movement_signature: Callable[..., bool],
    delete_storage_object_safe: Callable[[str], Awaitable[None]],
    publish_realtime_to_household: Callable[..., Awaitable[None]],
) -> dict[str, str]:
    existing = await get_user_transaction(txn_id, current_user.id, db)
    household_id = await ensure_current_user_household(db, current_user)
    await backfill_wallet_transfer_categories(db, user_id=current_user.id, household_id=household_id)

    category = None
    if existing.category_id is not None:
        category_result = await db.execute(select(models.Category).where(models.Category.id == existing.category_id))
        category = category_result.scalars().first()

    # Debt movements cannot be deleted directly — they are managed internally
    if is_debt_movement_signature(category_system_code=getattr(category, "system_code", None)):
        raise HTTPException(status_code=403, detail="Debt transactions are managed internally.")

    # Detect if this is a wallet transfer; if so, find the paired counterpart
    is_transfer = is_wallet_transfer_signature(
        existing,
        category_system_code=getattr(category, "system_code", None),
        category_is_internal=getattr(category, "is_internal", None),
    )
    paired_txn = None
    if is_transfer:
        ref_id = (existing.reference_id or "").strip()
        paired_ref = None
        if ref_id.endswith("-O"):
            paired_ref = ref_id[:-2] + "-I"
        elif ref_id.endswith("-I"):
            paired_ref = ref_id[:-2] + "-O"

        if paired_ref:
            paired_result = await db.execute(
                select(models.Transaction).where(
                    models.Transaction.reference_id == paired_ref,
                    models.Transaction.user_id == current_user.id,
                )
            )
            paired_txn = paired_result.scalars().first()
        else:
            # Fallback: vendor-based detection for transfers without reference_id suffix
            vendor = (existing.vendor_or_source or "").strip().lower()
            if vendor.startswith("transfer to "):
                paired_result = await db.execute(
                    select(models.Transaction).where(
                        models.Transaction.user_id == current_user.id,
                        models.Transaction.txn_date == existing.txn_date,
                        models.Transaction.amount == existing.amount,
                        models.Transaction.type != existing.type,
                        models.Transaction.id != existing.id,
                        models.Transaction.vendor_or_source.ilike("Transfer from %"),
                    )
                )
                paired_txn = paired_result.scalars().first()
            elif vendor.startswith("transfer from "):
                paired_result = await db.execute(
                    select(models.Transaction).where(
                        models.Transaction.user_id == current_user.id,
                        models.Transaction.txn_date == existing.txn_date,
                        models.Transaction.amount == existing.amount,
                        models.Transaction.type != existing.type,
                        models.Transaction.id != existing.id,
                        models.Transaction.vendor_or_source.ilike("Transfer to %"),
                    )
                )
                paired_txn = paired_result.scalars().first()

    async def _delete_one_transaction(txn: models.Transaction) -> None:
        """Delete a single transaction and all its related records."""
        loan_payment_result = await db.execute(
            select(models.LoanPayment).where(
                models.LoanPayment.transaction_id == txn.id,
                models.LoanPayment.user_id == current_user.id,
            )
        )
        linked_loan_payment = loan_payment_result.scalars().first()
        linked_loan = None
        if linked_loan_payment:
            linked_loan_result = await db.execute(
                select(models.Loan).where(
                    models.Loan.id == linked_loan_payment.loan_id,
                    models.Loan.user_id == current_user.id,
                )
            )
            linked_loan = linked_loan_result.scalars().first()

        linked_subscription = None
        if txn.subscription_id is not None:
            sub_result = await db.execute(
                select(models.Subscription).where(
                    models.Subscription.id == txn.subscription_id,
                    models.Subscription.user_id == current_user.id,
                )
            )
            linked_subscription = sub_result.scalars().first()

        attachment_result = await db.execute(
            select(models.Attachment).where(models.Attachment.transaction_id == txn.id)
        )
        attachments = attachment_result.scalars().all()

        attachment_ids = [attachment.id for attachment in attachments]
        if attachment_ids:
            await db.execute(
                update(models.ChatMessage)
                .where(models.ChatMessage.attachment_id.in_(attachment_ids))
                .values(attachment_id=None)
            )

        for attachment in attachments:
            await delete_storage_object_safe(attachment.file_path)

        await db.execute(
            models.Attachment.__table__.delete().where(models.Attachment.transaction_id == txn.id)
        )
        await db.execute(
            models.TransactionItem.__table__.delete().where(models.TransactionItem.transaction_id == txn.id)
        )
        if linked_loan_payment:
            await db.execute(
                models.LoanPayment.__table__.delete().where(
                    models.LoanPayment.id == linked_loan_payment.id,
                    models.LoanPayment.user_id == current_user.id,
                )
            )
            if linked_loan:
                linked_loan.outstanding_amount = round(
                    float(linked_loan.outstanding_amount or 0) + float(linked_loan_payment.amount or 0), 2
                )
                linked_loan.status = (
                    "active" if float(linked_loan.outstanding_amount or 0) > 0.004 else "settled"
                )

        if linked_subscription:
            remaining_paid = await db.scalar(
                select(func.max(models.Transaction.txn_date)).where(
                    models.Transaction.user_id == current_user.id,
                    models.Transaction.subscription_id == linked_subscription.id,
                    models.Transaction.id != txn.id,
                )
            )
            linked_subscription.last_payment_date = remaining_paid

        await db.execute(models.Transaction.__table__.delete().where(models.Transaction.id == txn.id))

    # Delete the primary transaction
    await _delete_one_transaction(existing)

    # If a paired transfer side exists, delete it too
    if paired_txn:
        await _delete_one_transaction(paired_txn)

    await db.commit()
    try:
        await publish_realtime_to_household(db, current_user.id, "changed", "transactions")
    except Exception:
        pass

    if paired_txn:
        return {"message": "Transfer deleted (both outgoing and incoming sides)"}
    return {"message": "Transaction deleted"}


async def refund_transaction_route(
    *,
    txn_id: str,
    refund_amount: float,
    current_user: models.User,
    db: AsyncSession,
    get_user_transaction: Callable[..., Awaitable[models.Transaction]],
    ensure_current_user_household: Callable[..., Awaitable[int]],
    backfill_wallet_transfer_categories: Callable[..., Awaitable[None]],
    is_wallet_transfer_signature: Callable[..., bool],
    is_debt_movement_signature: Callable[..., bool],
    select_transaction_wallet: Callable[..., Awaitable[models.Wallet]],
    resolve_transaction_category_id: Callable[..., Awaitable[int | None]],
    validate_transaction_type: Callable[[str], str],
    coerce_transaction_date: Callable[[str | None, date], date],
    current_business_date_fn: Callable[[], date],
    publish_realtime_to_household: Callable[..., Awaitable[None]],
) -> dict[str, str]:
    """
    Create a refund transaction that reverses the original transaction.
    - If original was expense → refund is income (money back)
    - If original was income → refund is expense (money back out)

    Wallet transfers and debt movements cannot be refunded through this route.
    """
    if refund_amount <= 0:
        raise HTTPException(status_code=400, detail="Refund amount must be greater than zero.")

    original = await get_user_transaction(txn_id, current_user.id, db)
    household_id = await ensure_current_user_household(db, current_user)
    await backfill_wallet_transfer_categories(db, user_id=current_user.id, household_id=household_id)

    category = None
    if original.category_id is not None:
        category_result = await db.execute(
            select(models.Category).where(models.Category.id == original.category_id)
        )
        category = category_result.scalars().first()

    # No refunds for wallet transfers or debt movements
    if is_wallet_transfer_signature(
        original,
        category_system_code=getattr(category, "system_code", None),
        category_is_internal=getattr(category, "is_internal", None),
    ):
        raise HTTPException(status_code=403, detail="Wallet transfer transactions cannot be refunded individually.")
    if is_debt_movement_signature(category_system_code=getattr(category, "system_code", None)):
        raise HTTPException(status_code=403, detail="Debt transactions cannot be refunded.")

    # No refunds for transactions that are themselves refunds
    original_vendor = (original.vendor_or_source or "").strip()
    if original_vendor.lower().startswith("refund:") or (original.notes or "").strip().startswith("Refund for transaction #"):
        raise HTTPException(status_code=403, detail="Refund transactions cannot be refunded again.")

    # Guard against double-refund — check if this transaction has already been refunded
    already_refunded_result = await db.execute(
        select(models.Transaction).where(
            models.Transaction.user_id == current_user.id,
            models.Transaction.notes.in_([
                f"Refund for transaction #{original.reference_id}",
                f"Refund for transaction #{original.id}",
            ]),
        )
    )
    existing_refund = already_refunded_result.scalars().first()
    if existing_refund:
        raise HTTPException(
            status_code=409,
            detail=f"This transaction has already been refunded (Refund: {existing_refund.reference_id or f'#{existing_refund.id}'}). Delete the existing refund first before creating a new one.",
        )

    # Cap refund amount at original amount (cannot refund more than original)
    original_amount = float(original.amount)
    if refund_amount > original_amount:
        refund_amount = original_amount

    # Determine the reversal type
    original_type = validate_transaction_type(original.type)
    refund_type = "income" if original_type == "expense" else "expense"

    # Build vendor/or source label for refund — strip any existing "Refund: " prefix to avoid double prefix
    original_vendor = (original.vendor_or_source or "").strip()
    # Remove leading "Refund: " (case-insensitive) so we never get "Refund: Refund: ..."
    import re
    clean_vendor = re.sub(r"^[Rr]efund:\s*", "", original_vendor)
    refund_vendor = f"Refund: {clean_vendor}" if clean_vendor else "Refund"

    # Same wallet, same category, same date
    wallet = await select_transaction_wallet(db, current_user, original.wallet_id)
    resolved_category_id = await resolve_transaction_category_id(
        original.category_id,
        current_user=current_user,
        db=db,
    )
    txn_date = coerce_transaction_date(None, current_business_date_fn())

    refund_txn = models.Transaction(
        user_id=current_user.id,
        reference_id=models.generate_txn_reference(txn_date),
        wallet_id=wallet.id,
        type=refund_type,
        amount=refund_amount,
        vendor_or_source=refund_vendor,
        category_id=resolved_category_id,
        txn_date=txn_date,
        notes=f"Refund for transaction #{original.reference_id or original.id}",
        latitude=original.latitude,
        longitude=original.longitude,
        location_name=original.location_name,
        source_channel="web",
    )
    db.add(refund_txn)
    await db.commit()
    await db.refresh(refund_txn)
    try:
        await publish_realtime_to_household(db, current_user.id, "changed", "transactions")
    except Exception:
        pass

    return {
        "message": "Refund transaction created",
        "refund_transaction_id": str(refund_txn.id),
        "refund_reference_id": refund_txn.reference_id or "",
    }


async def create_transaction_route(
    *,
    txn_in: schemas.TransactionCreate,
    current_user: models.User,
    db: AsyncSession,
    select_transaction_wallet: Callable[..., Awaitable[models.Wallet]],
    normalize_transaction_items_payload: Callable[[list[schemas.TransactionItemInput] | None], tuple[list[dict], float]],
    validate_transaction_type: Callable[[str], str],
    ensure_wallet_can_cover_expense: Callable[..., Awaitable[None]],
    resolve_transaction_category_id: Callable[..., Awaitable[int | None]],
    normalize_transaction_location: Callable[..., tuple[float | None, float | None, str | None]],
    coerce_transaction_date: Callable[[str | None, date], date],
    current_business_date_fn: Callable[[], date],
    replace_transaction_items: Callable[..., Awaitable[None]],
    publish_realtime_to_household: Callable[..., Awaitable[None]],
) -> models.Transaction:
    wallet = await select_transaction_wallet(db, current_user, txn_in.wallet_id)
    normalized_items, computed_amount = normalize_transaction_items_payload(txn_in.items)
    resolved_amount = computed_amount if normalized_items else txn_in.amount
    txn_type = validate_transaction_type(txn_in.type)
    if txn_type == "expense":
        await ensure_wallet_can_cover_expense(
            db,
            wallet=wallet,
            current_user=current_user,
            amount=resolved_amount,
        )
    resolved_category_id = await resolve_transaction_category_id(
        txn_in.category_id,
        current_user=current_user,
        db=db,
    )
    latitude, longitude, location_name = normalize_transaction_location(
        latitude=txn_in.latitude,
        longitude=txn_in.longitude,
        location_name=txn_in.location_name,
    )
    location_name = await location_service.resolve_short_location_name(
        latitude=latitude,
        longitude=longitude,
        location_name=location_name,
    )

    txn_date = coerce_transaction_date(txn_in.txn_date, current_business_date_fn())

    # Manual web entries often omit a time. Default to the current time when the
    # transaction is dated today so it is sorted by time in the transaction list
    # instead of being pushed to the end (NULL txn_time sorts last).
    parsed_txn_time = _parse_txn_time(txn_in.txn_time)
    if parsed_txn_time is None and txn_date == current_business_date_fn():
        parsed_txn_time = datetime.now(await _resolve_user_tz(db, current_user.id)).time().replace(microsecond=0)

    db_txn = models.Transaction(
        user_id=current_user.id,
        reference_id=models.generate_txn_reference(txn_date),
        wallet_id=wallet.id,
        type=txn_type,
        amount=resolved_amount,
        vendor_or_source=txn_in.vendor_or_source,
        category_id=resolved_category_id,
        txn_date=txn_date,
        txn_time=parsed_txn_time,
        notes=txn_in.notes,
        latitude=latitude,
        longitude=longitude,
        location_name=location_name,
        source_channel="web",
    )
    db.add(db_txn)
    await db.flush()
    if normalized_items:
        await replace_transaction_items(db, db_txn.id, normalized_items)
    await db.commit()
    await db.refresh(db_txn)

    # BNPL auto-payment for manual web expense entries in a linked category.
    if txn_type == "expense" and db_txn.bnpl_id is None and resolved_category_id:
        try:
            from modules.bnpl import service as bnpl_service

            await bnpl_service.apply_bnpl_auto_payment(
                db,
                user_id=current_user.id,
                category_id=int(resolved_category_id),
                amount=float(resolved_amount or 0),
                txn_date=txn_date,
                txn_wallet_id=int(db_txn.wallet_id),
                txn_id=int(db_txn.id),
                source_channel="web",
            )
            await db.refresh(db_txn)
        except Exception:
            await db.rollback()

    # Loan auto-payment: expense recorded in a loan's linked category.
    if txn_type == "expense" and db_txn.bnpl_id is None and resolved_category_id:
        loan = await db.scalar(
            select(models.Loan).where(
                models.Loan.user_id == current_user.id,
                models.Loan.category_id == int(resolved_category_id),
                models.Loan.status == "active",
            ).limit(1)
        )
        if loan:
            try:
                remaining = float(loan.outstanding_amount or 0)
                applied = min(float(resolved_amount or 0), remaining)
                if applied > 0:
                    loan.outstanding_amount = round(remaining - applied, 2)
                    loan.updated_at = datetime.utcnow()
                    if float(loan.outstanding_amount or 0) <= 0:
                        loan.status = "settled"
                        loan.outstanding_amount = 0.0
                    db.add(
                        models.LoanPayment(
                            user_id=current_user.id,
                            household_id=loan.household_id,
                            loan_id=loan.id,
                            wallet_id=db_txn.wallet_id,
                            transaction_id=db_txn.id,
                            amount=applied,
                            payment_date=txn_date,
                            source_channel="web",
                        )
                    )
                await db.commit()
            except Exception:
                await db.rollback()

    # Subscription auto-link: expense recorded in a subscription's linked category.
    if txn_type == "expense" and resolved_category_id and db_txn.subscription_id is None:
        sub = await db.scalar(
            select(models.Subscription).where(
                models.Subscription.user_id == current_user.id,
                models.Subscription.category_id == int(resolved_category_id),
                models.Subscription.status == "active",
            ).limit(1)
        )
        if sub:
            try:
                db_txn.subscription_id = sub.id
                sub.last_payment_date = txn_date
                sub.updated_at = datetime.utcnow()
                await db.commit()
                await db.refresh(db_txn)
            except Exception:
                await db.rollback()

    try:
        await publish_realtime_to_household(db, current_user.id, "changed", "transactions")
    except Exception:
        pass
    return db_txn


def _parse_txn_time(raw: str | None) -> time | None:
    if not raw:
        return None
    try:
        return datetime.strptime(str(raw).strip(), "%H:%M").time()
    except ValueError:
        return None


async def _resolve_user_tz(db: AsyncSession, user_id: str) -> ZoneInfo:
    try:
        row = (await db.execute(
            select(models.UserSetting).where(
                models.UserSetting.user_id == user_id,
                models.UserSetting.key == "timezone",
            )
        )).scalar_one_or_none()
        tz = (row.value if row and row.value else "Asia/Kuala_Lumpur").strip()
    except Exception:
        tz = "Asia/Kuala_Lumpur"
    try:
        return ZoneInfo(tz)
    except Exception:
        return ZoneInfo("Asia/Kuala_Lumpur")
