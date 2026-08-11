"""Integration test: bot_input_handler intercepts split/splitx commands.

Run: venv/bin/python -m tests.test_bot_input_split
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select

import models
from database import SessionLocal
from modules.split_bills import bot_flow
from modules.bot_input_handler.routes import process_bot_input_route


async def main():
    async with SessionLocal() as db:
        user = (await db.execute(select(models.User).where(models.User.email == "azli.jahroni@gmail.com"))).scalars().first()
        channel = "whatsapp"
        tag = f"BotInput {os.getpid()}"

        # ---- create via full bot_input handler: `makan tng split 6` (RM66) ----
        bot_flow.set_pending_ocr(
            user.id, channel,
            {"amount": "66.00", "title": tag, "txn_date": "2026-08-10", "txn_time": "15:04", "media": None},
        )
        result = await process_bot_input_route(
            db, user_id=user.id, phone="+601", text="makan tng split 6",
            media_payload=None, media_mime_type=None, media_file_name=None,
            source_channel=channel, show_current_balance=False,
        )
        reply = result.get("reply") or ""
        assert "RM 55.00" in reply, reply

        split = (await db.execute(
            select(models.SplitBill).where(models.SplitBill.user_id == user.id, models.SplitBill.title == tag)
        )).scalars().first()
        assert split is not None, "split not created via bot_input"
        split_id = int(split.id)

        # ---- payment via full bot_input handler: `splitx tng` (RM11) ----
        bot_flow.set_pending_ocr(
            user.id, channel,
            {"amount": "11.00", "title": tag, "txn_date": "2026-08-10", "txn_time": "16:00", "media": None},
        )
        result2 = await process_bot_input_route(
            db, user_id=user.id, phone="+601", text="splitx tng",
            media_payload=None, media_mime_type=None, media_file_name=None,
            source_channel=channel, show_current_balance=False,
        )
        reply2 = result2.get("reply") or ""
        assert "RM 11.00" in reply2 and "RM 44.00" in reply2, reply2

        await db.refresh(split)
        assert abs(float(split.amount_received or 0) - 11.0) < 0.01, split.amount_received

        # ---- cleanup ----
        for pay in list((await db.execute(select(models.SplitBillPayment).where(models.SplitBillPayment.split_bill_id == split_id))).scalars().all()):
            await db.execute(delete(models.SplitBillPayment).where(models.SplitBillPayment.id == pay.id))
            await db.execute(delete(models.Transaction).where(models.Transaction.id == pay.transaction_id))
        await db.execute(delete(models.SplitBill).where(models.SplitBill.id == split_id))
        await db.execute(delete(models.Transaction).where(models.Transaction.id == split.transaction_id))
        await db.commit()
        bot_flow.clear_pending_ocr(user.id, channel)

    print("bot_input_split OK")


if __name__ == "__main__":
    asyncio.run(main())
