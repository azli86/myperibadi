"""End-to-end: receipt image + caption `makan tng split 6` -> create split,
then `splitx tng` -> payment. Mocks OCR to emulate a real receipt scan.

Run: venv/bin/python -m tests.test_split_media_flow
"""

import asyncio
import os
import sys
from datetime import date, time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select

import models
import modules.bot_input_handler.routes as bh
import receipt_ocr_service
from database import SessionLocal
from modules.split_bills import bot_flow


class _FakeDraft:
    description = "makanan kedai"
    amount = 66.00
    txn_date = date(2026, 8, 10)
    txn_time = time(15, 4)
    transaction_type = "expense"


async def main():
    async with SessionLocal() as db:
        user = (await db.execute(select(models.User).where(models.User.email == "azli.jahroni@gmail.com"))).scalars().first()
        channel = "whatsapp"
        tag = f"MediaFlow {os.getpid()}"

        orig = receipt_ocr_service.extract_receipt

        async def fake_extract(*a, **k):
            return _FakeDraft()
        receipt_ocr_service.extract_receipt = fake_extract

        try:
            # create: receipt image + caption `makan tng split 6`
            r = await bh.process_bot_input_route(
                db, user_id=user.id, phone="+601",
                text="makan tng split 6",
                media_payload=b"fake-image-bytes", media_mime_type="image/jpeg",
                media_file_name="receipt.jpg",
                source_channel=channel, show_current_balance=False,
            )
            reply = r.get("reply") or ""
            assert "RM 55.00" in reply, reply

            split = (await db.execute(
                select(models.SplitBill).where(models.SplitBill.user_id == user.id, models.SplitBill.title == tag)
            )).scalars().first()
            # title may fall back to category; search by txn instead
            if not split:
                txn = (await db.execute(select(models.Transaction).where(
                    models.Transaction.user_id == user.id, models.Transaction.transaction_kind == "split",
                    models.Transaction.amount == 66.0,
                ))).scalars().first()
                split = (await db.execute(select(models.SplitBill).where(models.SplitBill.transaction_id == txn.id))).scalars().first()
            assert split is not None, "split not created from media+caption"
            split_id = int(split.id)

            # payment: set a payment screenshot OCR, then `splitx tng`
            bot_flow.set_pending_ocr(
                user.id, channel,
                {"amount": "11.00", "title": tag, "txn_date": "2026-08-10", "txn_time": "16:00", "media": None},
            )
            r2 = await bh.process_bot_input_route(
                db, user_id=user.id, phone="+601",
                text="splitx tng",
                media_payload=None, media_mime_type=None, media_file_name=None,
                source_channel=channel, show_current_balance=False,
            )
            reply2 = r2.get("reply") or ""
            assert "RM 11.00" in reply2 and "RM 44.00" in reply2, reply2

            await db.refresh(split)
            assert abs(float(split.amount_received or 0) - 11.0) < 0.01, split.amount_received
        finally:
            receipt_ocr_service.extract_receipt = orig

        # cleanup (attachments first — FK from transactions)
        for pay in list((await db.execute(select(models.SplitBillPayment).where(models.SplitBillPayment.split_bill_id == split_id))).scalars().all()):
            await db.execute(delete(models.SplitBillPayment).where(models.SplitBillPayment.id == pay.id))
            await db.execute(delete(models.Attachment).where(models.Attachment.transaction_id == pay.transaction_id))
            await db.execute(delete(models.Transaction).where(models.Transaction.id == pay.transaction_id))
        await db.execute(delete(models.Attachment).where(models.Attachment.transaction_id == split.transaction_id))
        await db.execute(delete(models.SplitBill).where(models.SplitBill.id == split_id))
        await db.execute(delete(models.Transaction).where(models.Transaction.id == split.transaction_id))
        await db.commit()
        bot_flow.clear_pending_ocr(user.id, channel)

    print("split_media_flow OK")


if __name__ == "__main__":
    asyncio.run(main())
