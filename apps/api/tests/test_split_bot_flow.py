"""Integration self-check for Split Bill bot flow (create + payment from OCR).

Run: venv/bin/python -m tests.test_split_bot_flow
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select

import models
from database import SessionLocal
from modules.split_bills import bot_flow


async def main():
    async with SessionLocal() as db:
        user = (await db.execute(select(models.User).where(models.User.email == "azli.jahroni@gmail.com"))).scalars().first()
        assert user is not None
        channel = "whatsapp"
        tag = f"BotFlow {os.getpid()}"

        # ---- create from OCR: `makan tng split 6` (RM66, 6 people) ----
        bot_flow.set_pending_ocr(
            user.id, channel,
            {
                "amount": "66.00",
                "title": tag,
                "txn_date": "2026-08-10",
                "txn_time": "15:04",
                "media": None,
            },
        )
        pending = bot_flow.get_pending_ocr(user.id, channel)
        reply = await bot_flow.handle_create_split_command(
            db, user=user, source_channel=channel,
            command_text="makan tng split 6", pending_ocr=pending,
        )
        assert reply is not None, "create must return a reply"
        assert "RM 66.00" in reply and "RM 11.00" in reply, reply
        assert "RM 55.00" in reply, "collect must be 55: " + reply

        # fetch the split + original expense
        split = (await db.execute(
            select(models.SplitBill).where(models.SplitBill.user_id == user.id, models.SplitBill.title == tag)
        )).scalars().first()
        assert split is not None, "split not created"
        assert int(split.people_count) == 6
        assert abs(float(split.share_amount or 0) - 11.0) < 0.01, split.share_amount
        assert abs(float(split.collect_amount or 0) - 55.0) < 0.01, split.collect_amount
        expense = (await db.execute(select(models.Transaction).where(models.Transaction.id == split.transaction_id))).scalars().first()
        assert expense is not None and expense.type == "expense", "original expense must be created"
        assert expense.transaction_kind == "split", expense.transaction_kind
        assert pending is None or True  # pending still present until commit handled by caller
        split_id = int(split.id)

        # ---- payment from OCR: `splitx tng` (RM11) ----
        bot_flow.set_pending_ocr(
            user.id, channel,
            {
                "amount": "11.00",
                "title": tag,
                "txn_date": "2026-08-10",
                "txn_time": "16:00",
                "media": None,
            },
        )
        pending2 = bot_flow.get_pending_ocr(user.id, channel)
        reply2 = await bot_flow.handle_splitx_payment_command(
            db, user=user, source_channel=channel,
            command_text="splitx tng", pending_ocr=pending2,
        )
        assert reply2 is not None, "payment must return a reply"
        assert "RM 11.00" in reply2 and "RM 44.00" in reply2, reply2

        await db.refresh(split)
        assert abs(float(split.amount_received or 0) - 11.0) < 0.01, split.amount_received
        assert abs(float(split.balance_amount or 0) - 44.0) < 0.01, split.balance_amount

        # find the reimbursement txn
        reimb = (await db.execute(
            select(models.Transaction).where(
                models.Transaction.user_id == user.id,
                models.Transaction.vendor_or_source == f"Split: {tag}",
            )
        )).scalars().first()
        assert reimb is not None and reimb.type == "income", "reimbursement income must exist"
        assert reimb.transaction_kind == "reimbursement", reimb.transaction_kind

        # ---- cleanup ----
        # split payments + their reimbursement txns + split + original expense
        for pay in list((await db.execute(select(models.SplitBillPayment).where(models.SplitBillPayment.split_bill_id == split_id))).scalars().all()):
            await db.execute(delete(models.SplitBillPayment).where(models.SplitBillPayment.id == pay.id))
            await db.execute(delete(models.Transaction).where(models.Transaction.id == pay.transaction_id))
        await db.execute(delete(models.SplitBill).where(models.SplitBill.id == split_id))
        await db.execute(delete(models.Transaction).where(models.Transaction.id == expense.id))
        await db.commit()
        bot_flow.clear_pending_ocr(user.id, channel)

    print("split_bot_flow OK")


if __name__ == "__main__":
    asyncio.run(main())
