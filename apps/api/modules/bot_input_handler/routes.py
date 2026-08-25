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
import audio_transcription_service


# Remember recently-processed inventory images (hash -> unix ts) so an echoed/second
# delivery of the same photo doesn't get OCR'd as a receipt and error out.
_INVENTORY_IMG_SEEN: dict[str, float] = {}
_INVENTORY_IMG_TTL = 90.0


def _mark_inventory_img_seen(payload: bytes | None, object_key: str | None):
    key = object_key or (__import__("hashlib").sha256(payload or b"").hexdigest())
    if key:
        _INVENTORY_IMG_SEEN[key] = __import__("time").time()


def _inventory_img_seen(payload: bytes | None, object_key: str | None) -> bool:
    key = object_key or (__import__("hashlib").sha256(payload or b"").hexdigest())
    if not key:
        return False
    now = __import__("time").time()
    if key in _INVENTORY_IMG_SEEN and now - _INVENTORY_IMG_SEEN[key] < _INVENTORY_IMG_TTL:
        return True
    _INVENTORY_IMG_SEEN.pop(key, None)
    return False


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

    # ── Voice / audio: transcribe to text, then process as a normal message ──
    is_voice_media = audio_transcription_service.is_transcribable(media_mime_type)
    voice_transcribed = False
    print(f"[voice-dbg] has_media={has_media} mime={media_mime_type!r} is_transcribable={is_voice_media} has_text={bool(text)} payload_len={len(media_payload) if media_payload else 0} obj_key={bool(media_object_key)}")
    if has_media and is_voice_media and not text:
        try:
            user_res = await db.execute(select(models.User).where(models.User.id == user_id))
            voice_user = user_res.scalar_one_or_none()
            voice_lang = getattr(voice_user, "language", "BM") if voice_user else "BM"
            voice_payload = media_payload
            if not voice_payload and media_object_key:
                voice_payload, stored_mime = await asyncio.to_thread(storage_service.download_receipt_object, media_object_key)
                media_mime_type = media_mime_type or stored_mime
            result = await audio_transcription_service.transcribe_audio(
                voice_payload or b"",
                media_mime_type or "audio/ogg",
                language_hint=voice_lang,
            )
            if result and result.text:
                text = result.text.strip()
                # Convert spoken Malay/English amounts to digits so the standard
                # parsers can read amounts said aloud ("makan dua ringgit" -> "makan 2").
                text = whatsapp_service.normalize_spoken_amounts(text)
                has_amount = False
                if text:
                    text_without_txn_ref = txn_ref_pattern.sub("", text).strip()
                    has_amount = bool(
                        text_without_txn_ref
                        and (
                            whatsapp_service.extract_amount(text_without_txn_ref) is not None
                            or whatsapp_service.parse_multi_item_transaction(text_without_txn_ref) is not None
                            or whatsapp_service.parse_one_line_item_transaction(text_without_txn_ref) is not None
                        )
                    )
                voice_transcribed = True
                print(f"[voice] user={user_id} channel={source_channel} transcribed={text!r} mime={media_mime_type}")
                # A transcribed voice note is a spoken transaction, so process it as
                # a plain text message (create/command) rather than an audio media
                # message that waits for a category keyword. Drop the media flag so
                # the text path creates the transaction directly.
                has_media = False
                media_payload = None
                media_object_key = None
        except Exception as exc:
            print(f"[voice] transcription failed user={user_id} channel={source_channel}: {type(exc).__name__}: {exc}")
            is_voice_media = False
    # For voice media we never run receipt OCR (audio is not an image receipt).
    _skip_receipt_ocr = is_voice_media

    # Barang Saya image flow: caption is an inventory add command (`stuff ...` /
    # `tambah barang ...`), so skip OCR/receipt handling entirely and let the
    # image hook below attach the photo to the item.
    from modules.inventory.bot_service import parse_inventory_intent as _parse_inv
    _inv_intent = _parse_inv(text) if (text or "").strip() else None
    _inv_img = bool(
        has_media
        and (text or "").strip()
        and not has_location
        and (media_mime_type or "").startswith("image/")
        and _inv_intent is not None
        and _inv_intent.get("intent") != "unknown"
    )

    if has_media:
        user_res = await db.execute(select(models.User).where(models.User.id == user_id))
        user = user_res.scalar_one_or_none()
        is_en = getattr(user, "language", "BM") == "EN" if user else False
        # Echo/second delivery of the same image already processed as inventory → stay silent.
        if not _inv_img and not (text or "").strip() and _inventory_img_seen(media_payload, media_object_key):
            return {"reply": None}
        if _inv_img:
            # Inventory item + photo: skip receipt OCR entirely and remember the
            # image so an echoed/second delivery doesn't get OCR'd as a receipt.
            _mark_inventory_img_seen(media_payload, media_object_key)
            receipt_user_note = (text or "").strip() or None
        elif is_reply_message and not normalized_target_txn_ref:
            return {
                "reply": (
                    "Receipt upload failed. The replied message has no valid transaction reference. Please reply to a saved transaction message with TXN."
                    if is_en
                    else "Upload lampiran gagal. Mesej yang direply tiada rujukan transaksi yang sah. Sila reply mesej transaksi yang ada TXN."
                )
            }
        if not normalized_target_txn_ref and not _inv_img and not _inventory_img_seen(media_payload, media_object_key) and not _skip_receipt_ocr:
            try:
                ocr_payload = media_payload
                if not ocr_payload and media_object_key:
                    ocr_payload, stored_mime = await asyncio.to_thread(storage_service.download_receipt_object, media_object_key)
                    media_mime_type = media_mime_type or stored_mime
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
            if _skip_receipt_ocr:
                pass
            else:
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

    # ---- Barang Saya (Personal Inventory) commands — intercepted before txn handling. ----
    # Skip text handling when there's an image: the image+caption hook below attaches the photo.
    if text and not has_location and not has_media:
        from modules.inventory.bot_service import handle_inventory_message
        try:
            inventory_reply = await handle_inventory_message(
                db, user_id=user_id, text=text, channel=source_channel,
            )
        except Exception as exc:
            print(f"[inventory] error user={user_id} channel={source_channel}: {type(exc).__name__}")
            inventory_reply = (
                "Maaf, Barang Saya tidak dapat diakses buat masa ini. Tiada perubahan dilakukan. Cuba lagi sebentar."
            )
        if inventory_reply:
            return {"reply": inventory_reply}

    # ---- Barang Saya: image + caption "tambah barang <name> [N]" → item with photo ----
    if has_media and text and not has_location and (media_mime_type or "").startswith("image/"):
        from modules.inventory.bot_service import parse_inventory_intent
        parsed_img = parse_inventory_intent(text)
        if parsed_img["intent"] == "inventory_create_item":
            from modules.inventory.bot_service import create_item_with_media
            try:
                img_reply = await create_item_with_media(
                    db, user_id=user_id, channel=source_channel,
                    entities=parsed_img["entities"],
                    media_payload=media_payload, media_object_key=media_object_key,
                    media_mime_type=media_mime_type, media_file_name=media_file_name,
                )
                return {"reply": img_reply}
            except Exception as exc:
                print(f"[inventory][img] error user={user_id}: {type(exc).__name__}")
                return {"reply": "Maaf, gagal menyimpan barang bersama gambar. Tiada perubahan dilakukan."}

    # ---- Barang Saya: image + non-create caption (e.g. `stuff kabel`) → run text command ----
    if _inv_img and (text or "").strip():
        from modules.inventory.bot_service import parse_inventory_intent
        if parse_inventory_intent(text)["intent"] != "inventory_create_item":
            from modules.inventory.bot_service import handle_inventory_message
            try:
                inv_reply = await handle_inventory_message(
                    db, user_id=user_id, text=text, channel=source_channel,
                )
            except Exception as exc:
                print(f"[inventory] error user={user_id} channel={source_channel}: {type(exc).__name__}")
                inv_reply = "Maaf, Barang Saya tidak dapat diakses buat masa ini. Cuba lagi sebentar."
            if inv_reply:
                return {"reply": inv_reply}

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
            # Barang Saya: offer to record a fresh purchase txn as an item (text channel only,
            # media flow has its own caption path). Suggestion is text-only, user opts in by replying.
            if txn_context is not None and not has_media:
                try:
                    from modules.inventory.bot_service import build_txn_suggestion
                    sug = await build_txn_suggestion(db, user_id=user_id, txn=txn_context)
                    if sug:
                        replies.append(sug)
                except Exception:
                    pass

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

    if has_media and not category_prompt_pending and not _skip_receipt_ocr:
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

    # Voice that transcribed but produced no actionable text (e.g. "hi") → hint.
    if is_voice_media and not replies:
        if voice_transcribed:
            replies.append(
                "Saya tak dapat faham transaksi dari audio itu. Cuba sebut seperti `makan 12.50` atau `gaji 2000`."
                if is_en
                else "Saya tak dapat faham transaksi dari audio itu. Cuba sebut seperti `makan 12.50` atau `gaji 2000`."
            )
        else:
            replies.append(
                "Voice note could not be transcribed right now. Please type your transaction like `lunch 12.50`."
                if is_en
                else "Nota suara tidak dapat dibaca buat masa ini. Sila taip transaksi anda seperti `makan 12.50`."
            )

    final_reply = "\n\n".join(replies) if replies else None
    if has_media:
        print(
            f"[WA][media-timing] route_done user={user_id} channel={source_channel} file={media_file_name or '-'} replies={len(replies)} total_ms={(datetime.utcnow() - started_at).total_seconds() * 1000:.1f}"
        )
    return {"reply": whatsapp_service.format_corporate_bot_reply(final_reply)}
