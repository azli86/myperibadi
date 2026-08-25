from __future__ import annotations

from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import whatsapp_service

async def handle_telegram_webhook_payload_route(
    payload: Any,
    db: AsyncSession,
    *,
    _handle_telegram_callback_query: Callable[..., Any],
    _send_telegram_message: Callable[..., Any],
    _sanitize_input: Callable[..., Any],
    _build_telegram_message_key: Callable[..., Any],
    _mark_telegram_event_if_new: Callable[..., Any],
    _get_telegram_link_by_identity: Callable[..., Any],
    _consume_telegram_pair_code: Callable[..., Any],
    _telegram_is_bm: Callable[..., Any],
    _download_telegram_file: Callable[..., Any],
    _normalize_telegram_command: Callable[..., Any],
    _build_telegram_debt_help_text: Callable[..., Any],
    _build_telegram_loan_help_text: Callable[..., Any],
    _handle_telegram_loanx_command: Callable[..., Any],
    _handle_telegram_splitx_command: Callable[..., Any],
    _build_telegram_transfer_help_text: Callable[..., Any],
    _sweep_telegram_pending_media: Callable[..., Any],
    _sweep_telegram_add_flows: Callable[..., Any],
    _get_telegram_add_flow: Callable[..., Any],
    _remember_telegram_add_flow_message: Callable[..., Any],
    _clear_telegram_add_flow: Callable[..., Any],
    _cleanup_telegram_add_flow_messages: Callable[..., Any],
    _parse_telegram_amount_text: Callable[..., Any],
    _send_telegram_add_flow_message: Callable[..., Any],
    _show_telegram_add_type_menu: Callable[..., Any],
    _get_telegram_wallets_for_user: Callable[..., Any],
    _build_telegram_wallet_keyboard: Callable[..., Any],
    _set_telegram_add_flow: Callable[..., Any],
    _match_telegram_wallet_choice: Callable[..., Any],
    _show_telegram_add_wallet_menu: Callable[..., Any],
    _get_telegram_categories_menu_text: Callable[..., Any],
    _show_telegram_add_category_menu: Callable[..., Any],
    _process_bot_input: Callable[..., Any],
    _is_category_prompt_reply: Callable[..., Any],
    _set_telegram_pending_media: Callable[..., Any],
    _pop_telegram_pending_media: Callable[..., Any],
    _delete_telegram_message: Callable[..., Any],
    _build_telegram_numeric_choice_keyboard: Callable[..., Any],
):
    if payload.callback_query:
        return await _handle_telegram_callback_query(payload.callback_query, db)

    message = payload.message or {}
    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    chat_id = str(chat.get("id") or "").strip()
    telegram_user_id = str(sender.get("id") or "").strip()
    text = (message.get("text") or message.get("caption") or "").strip()
    location = message.get("location") or {}
    latitude = location.get("latitude")
    longitude = location.get("longitude")
    location_name = (message.get("venue") or {}).get("title") or None
    message_id = message.get("message_id")
    media_file_id: str | None = None
    media_mime_type: str | None = None
    media_file_name: str | None = None
    media_size_bytes: int | None = None
    reply_to_message = message.get("reply_to_message") or {}
    reply_media_file_id: str | None = None
    reply_media_mime_type: str | None = None
    reply_media_file_name: str | None = None
    reply_media_size_bytes: int | None = None
    reply_photos = reply_to_message.get("photo") or []
    if isinstance(reply_photos, list) and reply_photos:
        best_reply_photo = max(reply_photos, key=lambda item: int((item or {}).get("file_size") or 0))
        reply_media_file_id = str(best_reply_photo.get("file_id") or "").strip() or None
        reply_media_mime_type = "image/jpeg"
        reply_media_file_name = f"telegram-reply-photo-{message_id or reply_media_file_id}.jpg"
        reply_media_size_bytes = int(best_reply_photo.get("file_size") or 0) or None
    elif isinstance(reply_to_message.get("document"), dict):
        reply_document = reply_to_message.get("document") or {}
        reply_media_file_id = str(reply_document.get("file_id") or "").strip() or None
        reply_media_mime_type = (reply_document.get("mime_type") or "").strip() or None
        reply_media_file_name = (reply_document.get("file_name") or f"telegram-reply-document-{message_id or reply_media_file_id}").strip()
        reply_media_size_bytes = int(reply_document.get("file_size") or 0) or None
    photos = message.get("photo") or []
    if isinstance(photos, list) and photos:
        best_photo = max(photos, key=lambda item: int((item or {}).get("file_size") or 0))
        media_file_id = str(best_photo.get("file_id") or "").strip() or None
        media_mime_type = "image/jpeg"
        media_file_name = f"telegram-photo-{message_id or media_file_id}.jpg"
        media_size_bytes = int(best_photo.get("file_size") or 0) or None
    elif isinstance(message.get("document"), dict):
        document = message.get("document") or {}
        media_file_id = str(document.get("file_id") or "").strip() or None
        media_mime_type = (document.get("mime_type") or "").strip() or None
        media_file_name = (document.get("file_name") or f"telegram-document-{message_id or media_file_id}").strip()
        media_size_bytes = int(document.get("file_size") or 0) or None
    elif isinstance(message.get("voice"), dict):
        voice = message.get("voice") or {}
        media_file_id = str(voice.get("file_id") or "").strip() or None
        media_mime_type = "audio/ogg"
        media_file_name = f"telegram-voice-{message_id or media_file_id}.ogg"
        media_size_bytes = int(voice.get("file_size") or 0) or None
    elif isinstance(message.get("audio"), dict):
        audio = message.get("audio") or {}
        media_file_id = str(audio.get("file_id") or "").strip() or None
        media_mime_type = (audio.get("mime_type") or "audio/mpeg").strip() or None
        media_file_name = (audio.get("file_name") or f"telegram-audio-{message_id or media_file_id}").strip()
        media_size_bytes = int(audio.get("file_size") or 0) or None
    elif isinstance(message.get("video"), dict):
        video = message.get("video") or {}
        media_file_id = str(video.get("file_id") or "").strip() or None
        media_mime_type = (video.get("mime_type") or "video/mp4").strip() or None
        media_file_name = f"telegram-video-{message_id or media_file_id}.mp4"
        media_size_bytes = int(video.get("file_size") or 0) or None

    if not chat_id or not telegram_user_id:
        return {"ok": True}

    if len(text) > 2000:
        await _send_telegram_message(chat_id, "Message too long.")
        return {"ok": True}

    text = _sanitize_input(text)
    has_location = latitude is not None and longitude is not None
    if has_location and not text:
        text = "@here"
    message_key = _build_telegram_message_key(
        payload.update_id,
        message_id,
        chat_id,
        f"{text}|{latitude or ''}|{longitude or ''}|{media_file_id or ''}",
    )
    is_new_event = await _mark_telegram_event_if_new(
        db,
        telegram_user_id=telegram_user_id,
        telegram_chat_id=chat_id,
        message_key=message_key,
    )
    if not is_new_event:
        return {"ok": True}

    link = await _get_telegram_link_by_identity(db, telegram_user_id)
    if not link:
        if text.lower() in {"/start", "/help", "help"}:
            await _send_telegram_message(
                chat_id,
                "Hantar pairing code dari portal untuk sambung akaun. Contoh: BD-7K2P9\n\nSend your pairing code from the portal to link your account.",
            )
            return {"ok": True}

        linked_user_id = await _consume_telegram_pair_code(
            db,
            code=text,
            telegram_user_id=telegram_user_id,
            telegram_chat_id=chat_id,
            telegram_username=sender.get("username"),
            telegram_first_name=sender.get("first_name"),
            telegram_last_name=sender.get("last_name"),
        )
        if linked_user_id:
            await _send_telegram_message(
                chat_id,
                "Akaun Telegram berjaya disambung ke MyPeribadi.\n\nTelegram account linked successfully.",
                linked=True,
            )
        else:
            await _send_telegram_message(
                chat_id,
                "Kod tidak sah atau telah tamat tempoh. Jana kod baru dari portal.\n\nInvalid or expired code. Generate a new code from the portal.",
            )
        return {"ok": True}

    user = await db.get(models.User, link.user_id)
    user_lang = getattr(user, "language", None) if user else "BM"
    is_bm = _telegram_is_bm(user_lang)

    if text.lower() == "/start":
        await _send_telegram_message(
            chat_id,
            "MyPeribadi Telegram aktif. Tekan button bawah untuk command, atau taip transaksi seperti makan 12.50." if is_bm else "MyPeribadi Telegram is active. Use the buttons below or type a transaction like lunch 12.50.",
            linked=True,
        )
        return {"ok": True}

    reply_text = (reply_to_message.get("text") or reply_to_message.get("caption") or "").strip()
    target_txn_ref = (
        whatsapp_service._extract_transaction_reference(text)
        or whatsapp_service._extract_transaction_reference(reply_text)
    )

    if not media_file_id and text and reply_media_file_id:
        media_file_id = reply_media_file_id
        media_mime_type = reply_media_mime_type
        media_file_name = reply_media_file_name
        media_size_bytes = reply_media_size_bytes

    media_payload: bytes | None = None
    if media_file_id:
        downloaded_media = await _download_telegram_file(media_file_id, expected_size_bytes=media_size_bytes)
        if not downloaded_media:
            await _send_telegram_message(
                chat_id,
                "Gagal muat turun media Telegram." if is_bm else "Failed to download Telegram media.",
                linked=True,
            )
            return {"ok": True}
        media_payload, telegram_file_path, media_error_text = downloaded_media
        if media_error_text:
            await _send_telegram_message(
                chat_id,
                "Gambar ambil masa terlalu lama atau gagal diproses. Sila upload semula gambar ini." if is_bm else media_error_text,
                linked=True,
            )
            return {"ok": True}
        if media_payload is None:
            await _send_telegram_message(
                chat_id,
                "Gagal muat turun media Telegram." if is_bm else "Failed to download Telegram media.",
                linked=True,
            )
            return {"ok": True}
        if not media_file_name and telegram_file_path:
            media_file_name = telegram_file_path.rsplit("/", 1)[-1]

    bot_text = _normalize_telegram_command(text)
    if bot_text == '__telegram_lang_menu__':
        await _send_telegram_message(
            chat_id,
            'Cara guna bahasa:\n`lang bm` - tukar reply ke BM\n`lang en` - switch replies to English' if is_bm else 'Language usage:\n`lang bm` - Malay replies\n`lang en` - English replies',
            linked=True,
        )
        return {"ok": True}

    if bot_text == '__telegram_budget_menu__':
        await _send_telegram_message(
            chat_id,
            'Cara guna budget:\n`budget summary` - ringkasan bajet bulan ini\n`budget list` - senarai bajet\n`budget baki <kategori>` - baki bajet kategori\n`budget set <kategori> <jumlah>` - set bajet kategori\n`budget delete <kategori> @YYYY-MM` - padam bajet' if is_bm else 'Budget usage:\n`budget summary` - monthly budget summary\n`budget list` - budget list\n`budget baki <category>` - category budget balance\n`budget set <category> <amount>` - set category budget\n`budget delete <category> @YYYY-MM` - delete budget',
            linked=True,
        )
        return {"ok": True}

    if bot_text == '__telegram_debt_menu__':
        await _send_telegram_message(
            chat_id,
            _build_telegram_debt_help_text(is_bm),
            linked=True,
        )
        return {"ok": True}

    if bot_text == '__telegram_loan_menu__':
        await _send_telegram_message(
            chat_id,
            _build_telegram_loan_help_text(is_bm),
            linked=True,
        )
        return {"ok": True}

    if await _handle_telegram_loanx_command(
        db,
        current_user=user,
        chat_id=chat_id,
        command_text=bot_text,
        is_bm=is_bm,
    ):
        return {"ok": True}

    if await _handle_telegram_splitx_command(
        db,
        current_user=user,
        chat_id=chat_id,
        command_text=bot_text,
        is_bm=is_bm,
    ):
        return {"ok": True}

    if bot_text == '__telegram_transfer_menu__':
        await _send_telegram_message(
            chat_id,
            _build_telegram_transfer_help_text(is_bm),
            linked=True,
        )
        return {"ok": True}

    _sweep_telegram_pending_media()
    _sweep_telegram_add_flows()

    flow = _get_telegram_add_flow(link.user_id, chat_id)
    lowered_text = (text or "").strip().lower()
    cancel_tokens = {"batal", "cancel", "/cancel", "x"}

    if flow:
        _remember_telegram_add_flow_message(link.user_id, chat_id, message_id)
        flow = _get_telegram_add_flow(link.user_id, chat_id)

    if flow and flow.get("step") == "amount":
        if text.startswith("/") and lowered_text not in cancel_tokens:
            _clear_telegram_add_flow(link.user_id, chat_id)
            flow = None
        else:
            if lowered_text in cancel_tokens:
                await _cleanup_telegram_add_flow_messages(chat_id, flow)
                await _show_telegram_add_type_menu(chat_id=chat_id, user_id=link.user_id, is_bm=is_bm)
                return {"ok": True}
            amount_value = _parse_telegram_amount_text(text)
            if amount_value is None:
                await _send_telegram_add_flow_message(
                    chat_id=chat_id,
                    user_id=link.user_id,
                    text="Taip jumlah sahaja. Contoh: `12.50`" if is_bm else "Type amount only. Example: `12.50`",
                    linked=True,
                )
                return {"ok": True}
            flow["amount"] = f"{amount_value:.2f}"
            _set_telegram_add_flow(link.user_id, chat_id, flow)
            await _show_telegram_add_wallet_menu(db, chat_id=chat_id, user_id=link.user_id, is_bm=is_bm)
            return {"ok": True}

    if flow and flow.get("step") == "wallet":
        if text.startswith("/") and lowered_text not in cancel_tokens:
            _clear_telegram_add_flow(link.user_id, chat_id)
            flow = None
        else:
            if lowered_text in cancel_tokens:
                await _cleanup_telegram_add_flow_messages(chat_id, flow)
                await _show_telegram_add_type_menu(chat_id=chat_id, user_id=link.user_id, is_bm=is_bm)
                return {"ok": True}
            wallets = await _get_telegram_wallets_for_user(db, link.user_id)
            selected_wallet = _match_telegram_wallet_choice(text, wallets)
            if not selected_wallet:
                await _send_telegram_add_flow_message(
                    chat_id=chat_id,
                    user_id=link.user_id,
                    text="Pilih wallet dari list. Anda boleh tekan nombor atau nama wallet." if is_bm else "Choose wallet from list. You can tap number or send wallet name.",
                    linked=True,
                    reply_markup=_build_telegram_wallet_keyboard(wallets, is_bm=is_bm),
                )
                return {"ok": True}
            amount_value = float(str(flow.get("amount") or "0") or 0)
            category_id = int(flow.get("category_id") or 0)
            category_name = str(flow.get("category_name") or "Expense")
            kind = "income" if str(flow.get("kind") or "expense").lower() == "income" else "expense"
            prefix = "income" if kind == "income" else "expense"
            txn_text = f"{prefix} {selected_wallet.name} {category_name} {amount_value:.2f}"
            reply, _txn = await whatsapp_service.process_whatsapp_message(
                db,
                link.user_id,
                f"telegram:{telegram_user_id}",
                txn_text,
                source_channel="telegram",
                forced_category_id=category_id,
                skip_category_prompt=True,
            )
            await _cleanup_telegram_add_flow_messages(chat_id, flow)
            _clear_telegram_add_flow(link.user_id, chat_id)
            await _send_telegram_message(chat_id, reply or ("Disimpan." if is_bm else "Saved."), linked=True, reply_markup={"remove_keyboard": True})
            return {"ok": True}

    if flow and flow.get("step") == "debt_name":
        if text.startswith("/") and lowered_text not in cancel_tokens:
            _clear_telegram_add_flow(link.user_id, chat_id)
            flow = None
        else:
            if lowered_text in cancel_tokens:
                await _cleanup_telegram_add_flow_messages(chat_id, flow)
                await _show_telegram_add_type_menu(chat_id=chat_id, user_id=link.user_id, is_bm=is_bm)
                return {"ok": True}
            contact_name = str(text or "").strip()
            if not contact_name or whatsapp_service.extract_amount(contact_name) is not None:
                await _send_telegram_add_flow_message(
                    chat_id=chat_id,
                    user_id=link.user_id,
                    text="Taip nama sahaja. Contoh: `Ali`" if is_bm else "Type name only. Example: `Ali`",
                    linked=True,
                )
                return {"ok": True}
            flow["counterparty_name"] = contact_name
            flow["step"] = "debt_amount"
            _set_telegram_add_flow(link.user_id, chat_id, flow)
            await _send_telegram_add_flow_message(
                chat_id=chat_id,
                user_id=link.user_id,
                text=(f"Nama: *{contact_name}*\nTaip jumlah sekarang. Contoh: `12.50`" if is_bm else f"Name: *{contact_name}*\nType amount now. Example: `12.50`"),
                linked=True,
            )
            return {"ok": True}

    if flow and flow.get("step") == "debt_amount":
        if text.startswith("/") and lowered_text not in cancel_tokens:
            _clear_telegram_add_flow(link.user_id, chat_id)
            flow = None
        else:
            if lowered_text in cancel_tokens:
                await _cleanup_telegram_add_flow_messages(chat_id, flow)
                await _show_telegram_add_type_menu(chat_id=chat_id, user_id=link.user_id, is_bm=is_bm)
                return {"ok": True}
            amount_value = _parse_telegram_amount_text(text)
            if amount_value is None:
                await _send_telegram_add_flow_message(
                    chat_id=chat_id,
                    user_id=link.user_id,
                    text="Taip jumlah sahaja. Contoh: `12.50`" if is_bm else "Type amount only. Example: `12.50`",
                    linked=True,
                )
                return {"ok": True}
            flow["amount"] = f"{amount_value:.2f}"
            flow["step"] = "debt_wallet"
            _set_telegram_add_flow(link.user_id, chat_id, flow)
            wallets = await _get_telegram_wallets_for_user(db, link.user_id)
            await _send_telegram_add_flow_message(
                chat_id=chat_id,
                user_id=link.user_id,
                text=(f"Nama: *{str(flow.get('counterparty_name') or '-')}*\nJumlah: *RM {amount_value:.2f}*\nPilih wallet." if is_bm else f"Name: *{str(flow.get('counterparty_name') or '-')}*\nAmount: *RM {amount_value:.2f}*\nChoose wallet."),
                linked=True,
                reply_markup=_build_telegram_wallet_keyboard(wallets, is_bm=is_bm),
            )
            return {"ok": True}

    if flow and flow.get("step") == "debt_wallet":
        if text.startswith("/") and lowered_text not in cancel_tokens:
            _clear_telegram_add_flow(link.user_id, chat_id)
            flow = None
        else:
            if lowered_text in cancel_tokens:
                await _cleanup_telegram_add_flow_messages(chat_id, flow)
                await _show_telegram_add_type_menu(chat_id=chat_id, user_id=link.user_id, is_bm=is_bm)
                return {"ok": True}
            wallets = await _get_telegram_wallets_for_user(db, link.user_id)
            selected_wallet = _match_telegram_wallet_choice(text, wallets)
            if not selected_wallet:
                await _send_telegram_add_flow_message(
                    chat_id=chat_id,
                    user_id=link.user_id,
                    text="Pilih wallet dari list." if is_bm else "Choose wallet from list.",
                    linked=True,
                    reply_markup=_build_telegram_wallet_keyboard(wallets, is_bm=is_bm),
                )
                return {"ok": True}
            debt_command = str(flow.get("debt_command") or "debtcol")
            counterparty_name = str(flow.get("counterparty_name") or "").strip()
            amount_value = float(str(flow.get("amount") or "0") or 0)
            debt_text = f"{debt_command} {counterparty_name} {amount_value:.2f} {selected_wallet.name}"
            reply, _txn = await whatsapp_service.process_whatsapp_message(
                db,
                link.user_id,
                f"telegram:{telegram_user_id}",
                debt_text,
                source_channel="telegram",
            )
            await _cleanup_telegram_add_flow_messages(chat_id, flow)
            _clear_telegram_add_flow(link.user_id, chat_id)
            await _send_telegram_message(chat_id, reply or ("Disimpan." if is_bm else "Saved."), linked=True, reply_markup={"remove_keyboard": True})
            return {"ok": True}

    if flow and flow.get("step") == "transfer_amount":
        if text.startswith("/") and lowered_text not in cancel_tokens:
            _clear_telegram_add_flow(link.user_id, chat_id)
            flow = None
        else:
            if lowered_text in cancel_tokens:
                await _cleanup_telegram_add_flow_messages(chat_id, flow)
                await _show_telegram_add_type_menu(chat_id=chat_id, user_id=link.user_id, is_bm=is_bm)
                return {"ok": True}
            amount_value = _parse_telegram_amount_text(text)
            if amount_value is None:
                await _send_telegram_add_flow_message(
                    chat_id=chat_id,
                    user_id=link.user_id,
                    text="Taip jumlah sahaja. Contoh: `12.50`" if is_bm else "Type amount only. Example: `12.50`",
                    linked=True,
                )
                return {"ok": True}
            transfer_text = f"transfer {amount_value:.2f} {str(flow.get('from_wallet_name') or '')} {str(flow.get('to_wallet_name') or '')}".strip()
            reply, _txn = await whatsapp_service.process_whatsapp_message(
                db,
                link.user_id,
                f"telegram:{telegram_user_id}",
                transfer_text,
                source_channel="telegram",
            )
            await _cleanup_telegram_add_flow_messages(chat_id, flow)
            _clear_telegram_add_flow(link.user_id, chat_id)
            await _send_telegram_message(chat_id, reply or ("Disimpan." if is_bm else "Saved."), linked=True, reply_markup={"remove_keyboard": True})
            return {"ok": True}

    if bot_text == '__telegram_category_menu__':
        await _send_telegram_message(
            chat_id,
            await _get_telegram_categories_menu_text(db, link.user_id, is_bm=is_bm),
            linked=True,
        )
        return {"ok": True}

    if bot_text == '__telegram_keypad_menu__':
        await _show_telegram_add_type_menu(chat_id=chat_id, user_id=link.user_id, is_bm=is_bm)
        return {"ok": True}

    if bot_text == '__telegram_add_menu__':
        await _show_telegram_add_type_menu(chat_id=chat_id, user_id=link.user_id, is_bm=is_bm)
        return {"ok": True}

    if bot_text == '__telegram_add_expense_menu__':
        await _show_telegram_add_category_menu(db, chat_id=chat_id, user_id=link.user_id, is_bm=is_bm, kind="expense")
        return {"ok": True}

    if bot_text == '__telegram_add_income_menu__':
        await _show_telegram_add_category_menu(db, chat_id=chat_id, user_id=link.user_id, is_bm=is_bm, kind="income")
        return {"ok": True}

    result = await _process_bot_input(
        db,
        user_id=link.user_id,
        phone=f"telegram:{telegram_user_id}",
        text=bot_text,
        media_payload=media_payload,
        media_mime_type=media_mime_type,
        media_file_name=media_file_name,
        latitude=float(latitude) if latitude is not None else None,
        longitude=float(longitude) if longitude is not None else None,
        location_name=location_name,
        media_size_bytes=media_size_bytes,
        target_txn_ref=target_txn_ref,
        source_channel="telegram",
        is_reply_message=bool(reply_to_message),
    )
    reply = result.get("reply") if isinstance(result, dict) else None

    if media_payload and _is_category_prompt_reply(reply):
        _set_telegram_pending_media(
            link.user_id,
            chat_id,
            {
                "media_payload": media_payload,
                "media_mime_type": media_mime_type,
                "media_file_name": media_file_name,
                "media_size_bytes": media_size_bytes,
            },
        )

    reply_txn_ref = whatsapp_service._extract_transaction_reference(reply) if reply else None
    pending_media = None
    if reply_txn_ref and not media_payload:
        pending_media = _pop_telegram_pending_media(link.user_id, chat_id)
    if pending_media and reply_txn_ref:
        processing_response = await _send_telegram_message(
            chat_id,
            r"⚠️ *_Lampiran diterima dan diproses sebentar lagi\._*" if is_bm else r"⚠️ *_Uploading your attachment and processing the transaction shortly\._*",
            linked=True,
            reply_markup={"remove_keyboard": True},
            parse_mode="MarkdownV2",
        )
        processing_message_id = int((((processing_response or {}).get("result") or {}).get("message_id") or 0) or 0) or None
        try:
            media_result = await _process_bot_input(
                db,
                user_id=link.user_id,
                phone=f"telegram:{telegram_user_id}",
                text="",
                media_payload=pending_media.get("media_payload"),
                media_mime_type=pending_media.get("media_mime_type"),
                media_file_name=pending_media.get("media_file_name"),
                latitude=None,
                longitude=None,
                location_name=None,
                media_size_bytes=pending_media.get("media_size_bytes"),
                target_txn_ref=reply_txn_ref,
                source_channel="telegram",
            )
        finally:
            if processing_message_id:
                await _delete_telegram_message(chat_id, processing_message_id)
        media_reply = media_result.get("reply") if isinstance(media_result, dict) else None
        if media_reply:
            reply = (reply + "\n\n" + media_reply) if reply else media_reply
    if reply:
        lowered_reply = reply.lower()
        # OCR previews mention receipts but have not saved a transaction yet.
        is_saved_reply = "txn" in lowered_reply
        has_lifespan = (
            "boleh tahan" in lowered_reply
            or "status duit" in lowered_reply
            or "can last" in lowered_reply
            or "money status" in lowered_reply
        )
        if is_saved_reply and not has_lifespan:
            user_res = await db.execute(select(models.User).where(models.User.id == link.user_id))
            user = user_res.scalar_one_or_none()
            user_lang = getattr(user, "language", "BM") if user else "BM"
            balance = await whatsapp_service.get_user_balance(db, link.user_id)
            reply += await whatsapp_service._format_money_lifespan_message(db, link.user_id, balance, user_lang)
        await _send_telegram_message(
            chat_id,
            reply,
            linked=True,
            reply_markup=_build_telegram_numeric_choice_keyboard(reply, is_bm=is_bm),
        )
    return {"ok": True}
