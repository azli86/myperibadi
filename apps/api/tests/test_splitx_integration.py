"""Integration self-check for Telegram splitx command (real DB, disposable user).

Run: venv/bin/python -m tests.test_splitx_integration
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select

import models
from database import SessionLocal
from modules.telegram_splitx.routes import handle_telegram_splitx_command_route


async def main():
    sent = []
    async def send(chat_id, text, linked=False):
        sent.append(text)

    def wallet_label(w):
        return getattr(w, "label", None) or w.name or "Wallet"

    async def get_wallets(db, user):
        return list((await db.execute(select(models.Wallet).where(models.Wallet.owner_user_id == user.id).order_by(models.Wallet.id))).scalars().all())

    async def match(wallets, hint):
        if not hint:
            return None
        for w in wallets:
            if hint.lower() in (w.name or "").lower() or hint.lower() in (w.label or "").lower():
                return w
        return None

    async def select_wallet(db, user, wid):
        ws = await get_wallets(db, user)
        return ws[0] if ws else None

    # Use a real linked user
    async with SessionLocal() as db:
        result = await db.execute(
            select(models.User).where(models.User.email == "azli.jahroni@gmail.com")
        )
        user = result.scalars().first()
        assert user is not None, "test user not found"
        user_id = user.id

        # Unique title to avoid collisions
        title = f"Bot Test {os.getpid()}"

        # 1. create
        sent.clear()
        ok = await handle_telegram_splitx_command_route(
            db, current_user=user, chat_id="t1",
            command_text=f"splitx create {title} 33 3", is_bm=True,
            _send_telegram_message=send, _wallet_label=wallet_label,
            _get_accessible_wallets_for_user=get_wallets, _match_wallet_by_hint=match,
            _select_transaction_wallet=select_wallet,
        )
        assert ok is True and sent, "create must send a reply"
        assert "33.00" in sent[0], "create reply must include total"
        assert f"ID" in sent[0], "create reply must include split id"

        # fetch the created split
        split = (await db.execute(
            select(models.SplitBill)
            .where(models.SplitBill.user_id == user_id, models.SplitBill.title == title)
            .order_by(models.SplitBill.id.desc())
        )).scalars().first()
        assert split is not None, "split must be created"
        split_id = int(split.id)

        # 2. list
        sent.clear()
        ok = await handle_telegram_splitx_command_route(
            db, current_user=user, chat_id="t1", command_text="splitx list", is_bm=True,
            _send_telegram_message=send, _wallet_label=wallet_label,
            _get_accessible_wallets_for_user=get_wallets, _match_wallet_by_hint=match,
            _select_transaction_wallet=select_wallet,
        )
        assert ok is True and sent and title in sent[0], "list must include the split"

        # 3. pay 11 -> balance 11
        sent.clear()
        ok = await handle_telegram_splitx_command_route(
            db, current_user=user, chat_id="t1", command_text=f"splitx pay {split_id} 11", is_bm=True,
            _send_telegram_message=send, _wallet_label=wallet_label,
            _get_accessible_wallets_for_user=get_wallets, _match_wallet_by_hint=match,
            _select_transaction_wallet=select_wallet,
        )
        assert ok is True and sent, "pay must send a reply"
        await db.refresh(split)
        assert abs(float(split.amount_received or 0) - 11.0) < 0.01, "received must be 11"
        assert abs(float(split.balance_amount or 0) - 11.0) < 0.01, "balance must be 11"

        # 4. detail
        sent.clear()
        ok = await handle_telegram_splitx_command_route(
            db, current_user=user, chat_id="t1", command_text=f"splitx {split_id}", is_bm=True,
            _send_telegram_message=send, _wallet_label=wallet_label,
            _get_accessible_wallets_for_user=get_wallets, _match_wallet_by_hint=match,
            _select_transaction_wallet=select_wallet,
        )
        assert ok is True and sent and title in sent[0], "detail must include title"

        # 5. cleanup: delete split (cascades payments) + its reimbursement txns
        payment_ids = list((await db.execute(
            select(models.SplitBillPayment.id).where(models.SplitBillPayment.split_bill_id == split_id)
        )).scalars().all())
        for pid in payment_ids:
            await db.execute(delete(models.SplitBillPayment).where(models.SplitBillPayment.id == pid))
        await db.execute(delete(models.SplitBill).where(models.SplitBill.id == split_id))
        await db.commit()

    print("splitx_integration OK")


if __name__ == "__main__":
    asyncio.run(main())
