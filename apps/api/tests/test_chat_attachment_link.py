"""Receipt chat bubble must end up pointing at its attachment.

Receipt uploads pause at a category prompt, so the bubble is written before the
attachment row exists. `_link_attachment_to_chat_message` closes that gap; without
it the chat history can only ever show a file name.
"""

from pathlib import Path
from sqlalchemy import select

import models
from database import SessionLocal
import whatsapp_service as w


async def _run() -> None:
    async with SessionLocal() as db:
        message = (
            await db.execute(
                select(models.ChatMessage)
                .where(
                    models.ChatMessage.source_channel == "chat",
                    models.ChatMessage.attachment_id.is_(None),
                    models.ChatMessage.file_name.is_not(None),
                )
                .limit(1)
            )
        ).scalars().first()

        if message is None:
            print("skip: no unlinked receipt bubble in this database")
            return

        attachment = (
            await db.execute(
                select(models.Attachment)
                .where(models.Attachment.uploaded_by_user_id == message.user_id)
                .order_by(models.Attachment.id.desc())
                .limit(1)
            )
        ).scalars().first()

        if attachment is None:
            print("skip: no attachment available to link")
            return

        original_attachment_name = attachment.file_name
        original_attachment_id = message.attachment_id
        original_mime = message.mime_type
        original_size = message.size_bytes

        attachment.file_name = message.file_name
        await db.commit()

        try:
            await w._link_attachment_to_chat_message(
                db, user_id=message.user_id, attachment=attachment
            )
            await db.refresh(message)

            assert message.attachment_id == attachment.id, "bubble was not linked"
            assert message.mime_type == attachment.mime_type, "mime type not carried over"
            assert message.size_bytes == attachment.size_bytes, "size not carried over"

            # Second call must be a no-op, not a re-link or an error.
            await w._link_attachment_to_chat_message(
                db, user_id=message.user_id, attachment=attachment
            )
            await db.refresh(message)
            assert message.attachment_id == attachment.id, "second link changed the target"

            # Unknown file name must not steal another bubble.
            stranger = models.Attachment(
                transaction_id=attachment.transaction_id,
                uploaded_by_user_id=message.user_id,
                file_name="not-in-any-chat.jpg",
                file_path="tests/not-in-any-chat.jpg",
                mime_type="image/jpeg",
                size_bytes=1,
            )
            db.add(stranger)
            await db.commit()
            await db.refresh(stranger)

            await w._link_attachment_to_chat_message(
                db, user_id=message.user_id, attachment=stranger
            )
            await db.refresh(message)
            assert message.attachment_id == attachment.id, "unrelated file stole a bubble"

            await db.delete(stranger)
            await db.commit()
        finally:
            message.attachment_id = original_attachment_id
            message.mime_type = original_mime
            message.size_bytes = original_size
            attachment.file_name = original_attachment_name
            await db.commit()

    print("chat attachment linking OK")


async def _check_deleted_flag() -> None:
    """An image bubble with no attachment row must be flagged as deleted."""
    from sqlalchemy.orm import selectinload
    from main import _serialize_chat_message

    class _NoRequest:
        pass

    async with SessionLocal() as db:
        message = (
            await db.execute(
                select(models.ChatMessage)
                .options(selectinload(models.ChatMessage.attachment))
                .where(
                    models.ChatMessage.source_channel == "chat",
                    models.ChatMessage.attachment_id.is_not(None),
                )
                .limit(1)
            )
        ).scalars().first()

        if message is None:
            print("skip: no linked receipt bubble for the deleted-flag check")
            return

        live = _serialize_chat_message(message, _NoRequest())
        assert live.attachment_deleted is False, "live attachment flagged as deleted"
        assert live.attachment is not None, "live attachment lost its proxy url"

        # Simulate the transaction-delete path: attachment link cleared, row gone.
        original_id = message.attachment_id
        original_mime = message.mime_type
        message.attachment = None
        message.attachment_id = None

        deleted = _serialize_chat_message(message, _NoRequest())
        assert deleted.attachment_deleted is True, "deleted image not flagged"
        assert deleted.attachment is None, "deleted image still exposes a url"

        # Non-image uploads keep showing their file name; no placeholder.
        message.mime_type = "application/pdf"
        as_file = _serialize_chat_message(message, _NoRequest())
        assert as_file.attachment_deleted is False, "non-image wrongly flagged as deleted"

        message.mime_type = original_mime
        db.expire(message)
        await db.rollback()
        del original_id

    print("deleted attachment flag OK")


if __name__ == "__main__":
    import asyncio

    async def _all() -> None:
        await _run()
        await _check_deleted_flag()

    # One loop only: the engine's connection pool is bound to the loop it was
    # first used on, so a second asyncio.run() invalidates it.
    asyncio.run(_all())
