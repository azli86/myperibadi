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

    ocr_forced_kind = None
    receipt_user_note = None
    if has_media:
        user_res = await db.execute(select(models.User).where(models.User.id == user_id))
        user = user_res.scalar_one_or_none()
        is_en = getattr(user, "language", "BM") == "EN" if user else False
        if is_reply_message and not normalized_target_txn_ref:
            return {
                "reply": (
                    "Receipt upload failed. The replied message has no valid transaction reference. Please reply to a saved transaction message with TXN."
                    if is_en
                    else "Upload lampiran gagal. Mesej yang direply tiada rujukan transaksi yang sah. Sila reply mesej transaksi yang ada TXN."
                )
            }
        if not normalized_target_txn_ref:
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
                # Drop literal junk descriptions: payment notes, transaction types, section labels.
                junk_lower = safe_description.lower().strip()
                junk_types = ("note", "nota", "payment", "bayaran", "transfer", "pindahan", "refund", "pulangan", "receipt", "resit", "transaction", "transaksi", "duitnow", "tnc ewallet", "tng ewallet", "ewallet")
                if not junk_lower or junk_lower in junk_types or junk_lower.startswith(("type: ", "jenis: ", "note: ", "nota: ")):
                    safe_description = ""
                # Income/expense type flows through the same category+wallet selection
                # prompt below; the user confirms the category (income ones included).
                ocr_forced_kind = draft.transaction_type
                # Hint is never mixed into transaction text; AI categories are unreliable.
                txn_text = f"{safe_description} {draft.amount} @{draft.txn_date.strftime('%d%m%Y')}".replace("  ", " ").strip()
                if not safe_description:
                    # Keep a generic label so the transaction can still be saved.
                    txn_text = f"Resit {draft.amount} @{draft.txn_date.strftime('%d%m%Y')}"
                # Keep whatever the user typed alongside the receipt as the note
                # (category + note + wallet), so it survives the OCR text override.
                receipt_user_note = (text or "").strip() or None
                text = txn_text
                has_amount = True
                # Tell the user what the bot scanned before asking them to type a keyword.
                draft_date_display = draft.txn_date.strftime("%d/%m/%Y")
                ocr_summary = (
                    f"🧾 I read your receipt:\n• Details: *{safe_description}*\n• Amount: *RM {draft.amount}*\n• Date: *{draft_date_display}*"
                    + (f"\n• Time: *{draft.txn_time}*" if draft.txn_time else "")
                    if is_en
                    else f"🧾 Saya dapat baca resit anda:\n• Butiran: *{safe_description}*\n• Jumlah: *RM {draft.amount}*\n• Tarikh: *{draft_date_display}*"
                    + (f"\n• Masa: *{draft.txn_time}*" if draft.txn_time else "")
                )
                # Dedup guard: warn when an identical receipt was already saved.
                if safe_description and draft.amount > 0:
                    dup_res = await db.execute(
                        select(models.Transaction).where(
                            models.Transaction.user_id == user_id,
                            models.Transaction.txn_date == draft.txn_date,
                            models.Transaction.amount == float(draft.amount),
                            models.Transaction.vendor_or_source.ilike(f"%{safe_description[:40]}%"),
                        )
                    )
                    dup_txn = dup_res.scalars().first()
                    if dup_txn:
                        dup_txn_date_display = dup_txn.txn_date.strftime("%d/%m/%Y")
                        dup_msg = (
                            f"⚠️ You already have a receipt on *{dup_txn_date_display}* for *{safe_description}* (*RM {draft.amount}*). "
                            "If this is a duplicate scan, reply `batal`. Otherwise choose a category to save it anyway."
                            if is_en
                            else f"⚠️ Anda sudah ada resit pada *{dup_txn_date_display}* untuk *{safe_description}* (*RM {draft.amount}*). "
                            "Jika ini scan berganda, balas `batal`. Jika tidak, pilih kategori untuk simpan juga."
                        )
                        ocr_summary = f"{ocr_summary}\n\n{dup_msg}"
                print(f"[receipt-ocr] draft description={draft.description!r} amount={draft.amount} date={draft.txn_date} category_options={len(category_rows)}")
                print(f"[receipt-ocr] built text={text!r}")
                # Store pending OCR so a follow-up split/splitx command can reuse
                # amount/title/date/time/media without the user retyping them.
                from modules.split_bills import bot_flow

                bot_flow.set_pending_ocr(
                    user_id,
                    source_channel,
                    {
                        "amount": str(draft.amount),
                        "title": safe_description or None,
                        "txn_date": draft.txn_date.isoformat(),
                        "txn_time": (draft.txn_time or "") if draft.txn_time else None,
                        "media": {
                            "object_key": media_object_key,
                            "payload": media_payload,
                            "mime_type": media_mime_type,
                            "file_name": media_file_name,
                            "size_bytes": media_size_bytes,
                        },
                    },
                )
            except Exception as exc:
                print(f"[receipt-ocr] failed user={user_id} channel={source_channel}: {type(exc).__name__}")
                if not text or not has_amount:
                    return {"reply": "Receipt details could not be read. Send the image with text like `lunch 12.50`." if is_en else "Butiran resit tidak dapat dibaca. Hantar gambar bersama teks seperti `makan 12.50`."}
                # OCR failed but a caption exists: fall back to the text and keep the media.
                ocr_forced_kind = None
        try:
            if media_payload:
                storage_service.validate_receipt_file(media_file_name, media_mime_type, media_payload)
            else:
                storage_service.validate_receipt_metadata(media_file_name, media_mime_type)
        except storage_service.StorageValidationError as exc:
            return {"reply": f"Receipt rejected: {exc}" if is_en else f"Resit ditolak: {exc}"}
    is_reference_only_caption = bool(text) and bool(txn_ref_pattern.fullmatch(text))

    # ---- Split Bill bot commands (create `<cat> <wallet> split N` and
    # payment `splitx <wallet>`) — intercepted before normal category handling. ----
    split_intercept = None
    if text and not has_location:
        from modules.split_bills import bot_flow

        user_res = await db.execute(select(models.User).where(models.User.id == user_id))
        split_user = user_res.scalar_one_or_none()
        split_cmd_text = text or ""
        pending_ocr = bot_flow.get_pending_ocr(user_id, source_channel)

        # 1. Pending overpayment confirmation
        over = bot_flow.get_pending_overpayment(user_id, source_channel)
        if over and split_user:
            lowered = (split_cmd_text or "").strip().lower()
            if lowered in {"confirm", "ya", "yes"}:
                bot_flow.clear_pending_overpayment(user_id, source_channel)
                split_row = await db.get(models.SplitBill, int(over["split_id"]))
                if split_row and split_row.user_id == user_id:
                    from decimal import Decimal
                    wrow = await db.get(models.Wallet, int(over["wallet_id"]))
                    if wrow:
                        split_intercept = await bot_flow._commit_split_payment(
                            db, user=split_user, source_channel=source_channel,
                            split=split_row, amount=Decimal(str(over["amount"])),
                            wallet=wrow, pending_ocr=over.get("pending_ocr") or {},
                        )
                if not split_intercept:
                    split_intercept = ("Tiada split untuk bayaran ini." if bot_flow._is_bm(split_user) else "No split for this payment.")
            elif lowered in {"cancel", "batal"}:
                bot_flow.clear_pending_overpayment(user_id, source_channel)
                split_intercept = "Bayaran dibatalkan." if bot_flow._is_bm(split_user) else "Payment cancelled."

        # 2. Pending split selection (reply with a number)
        if not split_intercept:
            sel = bot_flow.get_pending_split_selection(user_id, source_channel)
            if sel and split_user and (split_cmd_text or "").strip().isdigit():
                idx = int(split_cmd_text.strip()) - 1
                ids = sel.get("split_ids") or []
                if 0 <= idx < len(ids):
                    bot_flow.clear_pending_split_selection(user_id, source_channel)
                    from decimal import Decimal
                    split_row = await db.get(models.SplitBill, int(ids[idx]))
                    wrow = await db.get(models.Wallet, int(sel["wallet_id"]))
                    if split_row and split_row.user_id == user_id and wrow:
                        split_intercept = await bot_flow._commit_split_payment(
                            db, user=split_user, source_channel=source_channel,
                            split=split_row, amount=Decimal(str(sel["amount"])),
                            wallet=wrow, pending_ocr=sel.get("pending_ocr") or {},
                        )
                    else:
                        split_intercept = "Pilihan tidak sah." if bot_flow._is_bm(split_user) else "Invalid selection."
                else:
                    split_intercept = "Nombor tidak sah." if bot_flow._is_bm(split_user) else "Invalid number."

        # 3. Payment command `splitx <wallet>` (skip legacy keywords)
        if not split_intercept and split_user:
            from modules.split_bills.bot_flow import SPLIT_PAYMENT_PATTERN
            # For an image with a caption, the command lives in the caption (receipt_user_note).
            candidate = (receipt_user_note or "").strip() if has_media and (receipt_user_note or "").strip() else (split_cmd_text or "").strip()
            pm = SPLIT_PAYMENT_PATTERN.match(candidate)
            if pm and pm.group("wallet").strip().lower() not in bot_flow.LEGACY_SPLITX_KEYWORDS:
                split_intercept = await bot_flow.handle_splitx_payment_command(
                    db, user=split_user, source_channel=source_channel,
                    command_text=candidate, pending_ocr=pending_ocr,
                )

        # 4. Create command `<cat> <wallet> split N`
        if not split_intercept and split_user:
            create_text = (receipt_user_note or "").strip() if has_media and (receipt_user_note or "").strip() else (split_cmd_text or "").strip()
            split_intercept = await bot_flow.handle_create_split_command(
                db, user=split_user, source_channel=source_channel,
                command_text=create_text, pending_ocr=pending_ocr,
            )

    if split_intercept:
        return {"reply": whatsapp_service.format_corporate_bot_reply(split_intercept)}

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
            force_category_prompt=bool(ocr_summary),
            txn_time=draft.txn_time if ocr_summary else None,
            receipt_user_note=receipt_user_note,
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
    # When media awaits a category choice, stash the receipt object metadata so the
    # later category/wallet reply can attach it to the just-saved transaction.
    if category_prompt_pending:
        whatsapp_service._set_pending_receipt_media(
            user_id,
            source_channel,
            {
                "object_key": media_object_key,
                "mime_type": media_mime_type,
                "file_name": media_file_name,
                "size_bytes": media_size_bytes,
                "payload": media_payload,
            },
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
