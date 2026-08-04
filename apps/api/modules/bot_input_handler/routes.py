from __future__ import annotations

import asyncio
from datetime import datetime
import random
import re
from typing import Any, Callable, List

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import location_service
import models
import whatsapp_service
import receipt_ocr_service
import storage_service


async def process_bot_input_route(
    db: AsyncSession,
    *,
    user_id: str,
    phone: str,
    text: str,
    media_payload: bytes | None,
    media_mime_type: str | None,
    media_file_name: str | None,
    media_object_key: str | None = None,
    media_size_bytes: int | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    location_name: str | None = None,
    target_txn_ref: str | None = None,
    source_channel: str,
    is_reply_message: bool = False,
    show_current_balance: bool = True,
    show_expense_amount: bool = True,
    show_income_amount: bool = True,
    normalize_transaction_location: Callable[..., tuple[float, float, str | None]] | None = None,
):
    started_at = datetime.utcnow()
    replies: List[str] = []
    ocr_summary: str | None = None
    text = (text or "").strip()
    has_media = bool(media_payload) or bool(media_object_key)
    has_location = latitude is not None and longitude is not None

    if (latitude is None) != (longitude is None):
        return {"reply": "Invalid location payload."}

    txn_ref_pattern = re.compile(r"\bTXN\d{2}-[A-Z0-9]{6}\b", re.IGNORECASE)
    target_ref_match = txn_ref_pattern.search(target_txn_ref or "")
    normalized_target_txn_ref = target_ref_match.group(0).upper() if target_ref_match else None
    has_here_marker = whatsapp_service.has_here_location_marker(text)
    text_without_here = whatsapp_service.strip_here_location_marker(text) if has_here_marker else text

    if normalized_target_txn_ref and not has_media and (has_location or has_here_marker) and not text_without_here.strip():
        user_res = await db.execute(select(models.User).where(models.User.id == user_id))
        user = user_res.scalar_one_or_none()
        is_en = getattr(user, "language", "BM") == "EN" if user else False

        if has_location:
            try:
                resolved_latitude, resolved_longitude, resolved_location_name = normalize_transaction_location(
                    latitude=latitude,
                    longitude=longitude,
                    location_name=location_name,
                )
                resolved_location_name = await location_service.resolve_short_location_name(
                    latitude=resolved_latitude,
                    longitude=resolved_longitude,
                    location_name=resolved_location_name,
                )
                await whatsapp_service.upsert_user_location_context(
                    db,
                    user_id=user_id,
                    latitude=float(resolved_latitude),
                    longitude=float(resolved_longitude),
                    location_name=resolved_location_name,
                )
            except (HTTPException, ValueError):
                return {"reply": "Invalid location payload." if is_en else "Payload lokasi tidak sah."}
        else:
            ctx = await whatsapp_service.get_user_location_context(db, user_id=user_id)
            if not ctx:
                if is_en:
                    return {"reply": "Please send a location pin first, then reply to the transaction with `@here`."}
                return {"reply": "Sila hantar location pin dahulu, kemudian reply transaksi dengan `@here`."}
            resolved_latitude = float(ctx.latitude)
            resolved_longitude = float(ctx.longitude)
            resolved_location_name = ctx.location_name

        txn_res = await db.execute(
            select(models.Transaction).where(
                models.Transaction.user_id == user_id,
                models.Transaction.reference_id == normalized_target_txn_ref,
            )
        )
        txn = txn_res.scalar_one_or_none()
        if not txn:
            if is_en:
                return {"reply": f"Transaction {normalized_target_txn_ref} was not found."}
            return {"reply": f"Transaksi {normalized_target_txn_ref} tidak dijumpai."}

        txn.latitude = resolved_latitude
        txn.longitude = resolved_longitude
        txn.location_name = resolved_location_name
        await db.commit()
        if is_en:
            return {"reply": f"Location attached to transaction *{normalized_target_txn_ref}*."}
        return {"reply": f"Lokasi berjaya dilampirkan pada transaksi *{normalized_target_txn_ref}*."}

    if has_location and not text and not has_media:
        resolved_location_name = await location_service.resolve_short_location_name(
            latitude=float(latitude),
            longitude=float(longitude),
            location_name=location_name,
        )
        await whatsapp_service.upsert_user_location_context(
            db,
            user_id=user_id,
            latitude=float(latitude),
            longitude=float(longitude),
            location_name=resolved_location_name,
        )
        user_res = await db.execute(select(models.User).where(models.User.id == user_id))
        user = user_res.scalar_one_or_none()
        is_en = getattr(user, "language", "BM") == "EN" if user else False
        if is_en:
            return {"reply": "Location saved. Now send your expense, e.g. `lunch 15 @here`."}
        return {"reply": "Lokasi disimpan. Seterusnya hantar perbelanjaan anda, contoh `lunch 15 @here`."}
    
    command_text = text.lower()
    is_command = command_text in {"summary", "list"} or command_text.startswith("lang ")
    text_without_txn_ref = txn_ref_pattern.sub("", text).strip() if text else ""
    has_amount = False
    if text_without_txn_ref:
        has_amount = (
            whatsapp_service.extract_amount(text_without_txn_ref) is not None
            or whatsapp_service.parse_multi_item_transaction(text_without_txn_ref) is not None
            or whatsapp_service.parse_one_line_item_transaction(text_without_txn_ref) is not None
        )

    # My Vehicle deterministic commands (summary / reminders only — no LLM)
    if text and not has_media and not has_location:
        try:
            from modules.vehicles.bot_views import handle_vehicle_command, match_vehicle_command

            if match_vehicle_command(text):
                user_res = await db.execute(select(models.User).where(models.User.id == user_id))
                vehicle_user = user_res.scalar_one_or_none()
                if vehicle_user is not None:
                    vehicle_reply = await handle_vehicle_command(db, user=vehicle_user, text=text)
                    if vehicle_reply:
                        return {"reply": vehicle_reply}
        except Exception as vehicle_exc:
            print(f"[vehicle-bot] command handling failed: {vehicle_exc}")

    if has_media:
        user_res = await db.execute(select(models.User).where(models.User.id == user_id))
        user = user_res.scalar_one_or_none()
        is_en = getattr(user, "language", "BM") == "EN" if user else False
        ocr_forced_kind = None
        if is_reply_message and not normalized_target_txn_ref:
            return {
                "reply": (
                    "Receipt upload failed. The replied message has no valid transaction reference. Please reply to a saved transaction message with TXN."
                    if is_en
                    else "Upload lampiran gagal. Mesej yang direply tiada rujukan transaksi yang sah. Sila reply mesej transaksi yang ada TXN."
                )
            }
        if not normalized_target_txn_ref and not has_amount:
            try:
                ocr_payload = media_payload
                if not ocr_payload and media_object_key:
                    ocr_payload, stored_mime = await asyncio.to_thread(storage_service.download_receipt_object, media_object_key)
                    media_mime_type = media_mime_type or stored_mime
                category_rows = (await db.execute(select(models.Category).where(models.Category.household_id == user.default_household_id, models.Category.is_internal == False).order_by(models.Category.name))).scalars().all()
                category_names = [category.name for category in category_rows]
                draft = await receipt_ocr_service.extract_receipt(
                    ocr_payload or b"",
                    media_mime_type or "",
                    "EN" if is_en else "BM",
                    category_names,
                )
                # Telegram legacy Markdown rejects merchant names containing `_`, `[`, etc.
                safe_description = re.sub(r"[^\w .,&'()-]", "", draft.description, flags=re.UNICODE).replace("_", " ").strip()
                # Merchant reference tokens containing digits must not be parsed as amounts.
                safe_description = re.sub(r"\b\S*\d\S*\b", "", safe_description).strip()
                # Income/expense type flows through the same category+wallet selection
                # prompt below; the user confirms the category (income ones included).
                ocr_forced_kind = draft.transaction_type
                # Hint is never mixed into transaction text; AI categories are unreliable.
                text = f"{safe_description} {draft.amount} @{draft.txn_date.strftime('%d%m%Y')}".replace("  ", " ")
                has_amount = True
                # Tell the user what the bot scanned before asking them to type a keyword.
                draft_date_display = draft.txn_date.strftime("%d/%m/%Y")
                ocr_summary = (
                    f"🧾 I read your receipt:\n• Details: *{safe_description}*\n• Amount: *RM {draft.amount}*\n• Date: *{draft_date_display}*"
                    if is_en
                    else f"🧾 Saya dapat baca resit anda:\n• Butiran: *{safe_description}*\n• Jumlah: *RM {draft.amount}*\n• Tarikh: *{draft_date_display}*"
                )
                print(f"[receipt-ocr] draft description={draft.description!r} amount={draft.amount} date={draft.txn_date} category_options={len(category_rows)}")
                print(f"[receipt-ocr] built text={text!r}")
            except Exception as exc:
                print(f"[receipt-ocr] failed user={user_id} channel={source_channel}: {type(exc).__name__}")
                return {"reply": "Receipt details could not be read. Send the image with text like `lunch 12.50`." if is_en else "Butiran resit tidak dapat dibaca. Hantar gambar bersama teks seperti `makan 12.50`."}
        try:
            if media_payload:
                storage_service.validate_receipt_file(media_file_name, media_mime_type, media_payload)
            else:
                storage_service.validate_receipt_metadata(media_file_name, media_mime_type)
        except storage_service.StorageValidationError as exc:
            return {"reply": f"Receipt rejected: {exc}" if is_en else f"Resit ditolak: {exc}"}
    is_reference_only_caption = bool(text) and bool(txn_ref_pattern.fullmatch(text))

    # 1. Process Text (Transaction / Command / Bot)
    # If media is replying to an existing transaction, caption must not create a new transaction.
    txn_context = None
    should_process_text = bool(text) and not (has_media and (normalized_target_txn_ref or is_reply_message))
    if should_process_text:
        txt_reply, txn_context = await whatsapp_service.process_whatsapp_message(
            db,
            user_id,
            phone,
            text,
            latitude=latitude,
            longitude=longitude,
            location_name=location_name,
            source_channel=source_channel,
            show_current_balance=show_current_balance,
            show_expense_amount=show_expense_amount,
            show_income_amount=show_income_amount,
            allow_llm_fallback=True,
            forced_kind=ocr_forced_kind,
        )
        # Keep the transaction confirmation together with the later receipt-upload reply.
        if txt_reply:
            replies.append(txt_reply)

    # For OCR scans awaiting a category keyword, show the scanned details first
    # so the user can verify what was read before typing the keyword.
    if ocr_summary and replies and whatsapp_service._looks_like_category_prompt("\n\n".join(replies) or ""):
        replies = [ocr_summary] + replies

    # If OCR asked the user to pick a category, do not attach media yet.
    # Telegram pending-media flow attaches after the transaction is saved.
    category_prompt_pending = bool(
        has_media
        and not target_txn_ref
        and not normalized_target_txn_ref
        and replies
        and whatsapp_service._looks_like_category_prompt("".join(replies) or "")
    )
    print(
        f"[WA][debug] has_media={has_media} target_ref={target_txn_ref!r} norm={normalized_target_txn_ref!r} replies={len(replies)} cat_prompt_pending={category_prompt_pending} reply_preview={(''.join(replies) or '')[:120]!r}",
        flush=True,
    )

    if has_media and not category_prompt_pending:
        print(
            f"[WA][media-timing] route_start user={user_id} channel={source_channel} file={media_file_name or '-'} mime={media_mime_type or '-'} has_text={'yes' if bool(text) else 'no'} target_ref={target_txn_ref or '-'} total_ms={(datetime.utcnow() - started_at).total_seconds() * 1000:.1f}"
        )
        print(f"[WA] Processing media: {media_file_name} ({media_mime_type})")
        media_reply = await whatsapp_service.process_whatsapp_media_message(
            db=db,
            user_id=user_id,
            phone=phone,
            payload=media_payload,
            mime_type=media_mime_type,
            file_name=media_file_name,
            caption=text,
            existing_object_key=media_object_key,
            media_size_bytes=media_size_bytes,
            target_txn_ref=target_txn_ref,
            target_txn_override=txn_context,
            source_channel=source_channel,
            show_current_balance=show_current_balance,
            show_expense_amount=show_expense_amount,
            show_income_amount=show_income_amount,
        )
        if media_reply:
            print(f"[WA] Media reply: {media_reply}")
            print(
                f"[WA][media-timing] route_media_done user={user_id} channel={source_channel} file={media_file_name or '-'} total_ms={(datetime.utcnow() - started_at).total_seconds() * 1000:.1f}"
            )
            replies.append(media_reply)
        else:
            print(f"[WA] No media reply generated")

    if not replies and text and not has_media:
        # Fallback for text-only messages
        txt_reply, _ = await whatsapp_service.process_whatsapp_message(
            db,
            user_id,
            phone,
            text,
            latitude=latitude,
            longitude=longitude,
            location_name=location_name,
            source_channel=source_channel,
            show_current_balance=show_current_balance,
            show_expense_amount=show_expense_amount,
            show_income_amount=show_income_amount,
            allow_llm_fallback=True,
        )
        if txt_reply:
            replies.append(txt_reply)

    # Keep the web chat a little softer, but don't slow down WhatsApp webhook replies.
    if replies and source_channel not in {"whatsapp", "whatsapp_group", "telegram"}:
        delay = random.uniform(1.2, 2.8)
        await asyncio.sleep(delay)

    final_reply = "\n\n".join(replies) if replies else None
    if has_media:
        print(
            f"[WA][media-timing] route_done user={user_id} channel={source_channel} file={media_file_name or '-'} replies={len(replies)} total_ms={(datetime.utcnow() - started_at).total_seconds() * 1000:.1f}"
        )
    return {"reply": whatsapp_service.format_corporate_bot_reply(final_reply)}
