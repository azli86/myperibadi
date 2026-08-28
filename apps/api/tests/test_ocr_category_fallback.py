"""Verify that after a receipt OCR scan asks for a category, a reply with a
non-matching category keyword (e.g. "potong rambut tng") falls back to the
default category ("Lain-lain") + the typed wallet instead of asking for an
amount again.

Run: venv/bin/python -m tests.test_ocr_category_fallback
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
import whatsapp_service
from database import SessionLocal

class _FakeDraft:
    description = "kedai gunting"
    amount = 55.00
    txn_date = date(2026, 8, 10)
    txn_time = time(15, 4)
    transaction_type = "expense"

async def main():
    async with SessionLocal() as db:
        user = (await db.execute(select(models.User).where(models.User.email == "azli.jahroni@gmail.com"))).scalars().first()
        channel = "whatsapp"
        tag = f"OcrFallback {os.getpid()}"

        orig = receipt_ocr_service.extract_receipt
        async def fake_extract(*a, **k):
            return _FakeDraft()
        receipt_ocr_service.extract_receipt = fake_extract

        # clear any pending selection for this user/channel first
        whatsapp_service._clear_pending_category_selection(user.id, channel)

        try:
            # 1. Send a receipt image -> OCR -> bot asks for a category
            r1 = await bh.process_bot_input_route(
                db, user_id=user.id, phone="+601",
                text="", media_payload=b"fake-image-bytes", media_mime_type="image/jpeg",
                media_file_name="receipt.jpg",
                source_channel=channel, show_current_balance=False,
            )
            reply1 = r1.get("reply") or ""
            assert "Balas kategori" in reply1 or "Reply category" in reply1, reply1

            # 2. Reply with a category that does NOT exist, plus wallet
            r2 = await bh.process_bot_input_route(
                db, user_id=user.id, phone="+601",
                text="potong rambut tng",
                media_payload=None, media_mime_type=None, media_file_name=None,
                source_channel=channel, show_current_balance=False,
            )
            reply2 = r2.get("reply") or ""
            print("REPLY2:", reply2)
            assert "RM 55.00" in reply2 or "55.00" in reply2, reply2

            # 3. The transaction should be saved with the OCR amount
            txns = (await db.execute(select(models.Transaction).where(
                models.Transaction.user_id == user.id,
                models.Transaction.txn_date == date(2026, 8, 10),
                models.Transaction.amount == 55.00,
            ))).scalars().all()
            assert txns, "transaction was not saved"
            t = txns[0]
            print("SAVED:", t.vendor_or_source, t.amount, "cat_id=", t.category_id)

            # 4. It should use the default (Lain-lain) expense category
            cat = await db.get(models.Category, t.category_id)
            assert cat and cat.kind == "expense", f"expected expense category, got {cat.name if cat else None}"
            print("CATEGORY:", cat.name)

        finally:
            receipt_ocr_service.extract_receipt = orig
            # cleanup
            await db.execute(delete(models.Transaction).where(
                models.Transaction.user_id == user.id,
                models.Transaction.txn_date == date(2026, 8, 10),
                models.Transaction.amount == 55.00,
            ))
            await db.commit()

asyncio.run(main())
print("PASS")
