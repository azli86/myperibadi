from __future__ import annotations

from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models

async def handle_telegram_callback_query_route(
    callback_query: dict[str, Any],
    db: AsyncSession,
    *,
    _get_telegram_link_by_identity: Callable[..., Any],
    _telegram_is_bm: Callable[..., Any],
    _answer_telegram_callback: Callable[..., Any],
    _get_telegram_add_flow: Callable[..., Any],
    _show_telegram_add_type_menu: Callable[..., Any],
    _clear_telegram_add_flow: Callable[..., Any],
    _cleanup_telegram_add_flow_messages: Callable[..., Any],
    _edit_telegram_message_text: Callable[..., Any],
    _get_telegram_wallets_for_user: Callable[..., Any],
    _set_telegram_add_flow: Callable[..., Any],
    _remember_telegram_add_flow_message: Callable[..., Any],
    _build_telegram_transfer_wallet_keyboard: Callable[..., Any],
    _show_telegram_add_category_menu: Callable[..., Any],
    _get_telegram_categories_by_kind: Callable[..., Any],
    _build_telegram_add_preview_text: Callable[..., Any],
    _send_telegram_add_flow_message: Callable[..., Any],
    _wallet_label: Callable[..., Any],
):
    callback_query_id = str(callback_query.get("id") or "").strip()
    data = str(callback_query.get("data") or "").strip()
    message = callback_query.get("message") or {}
    chat = message.get("chat") or {}
    sender = callback_query.get("from") or {}
    chat_id = str(chat.get("id") or "").strip()
    telegram_user_id = str(sender.get("id") or "").strip()
    message_id = int(message.get("message_id") or 0) or None
    if not chat_id or not telegram_user_id:
        await _answer_telegram_callback(callback_query_id)
        return {"ok": True}

    link = await _get_telegram_link_by_identity(db, telegram_user_id)
    if not link:
        await _answer_telegram_callback(callback_query_id, "Please link your account first.")
        return {"ok": True}
    user_res = await db.execute(select(models.User).where(models.User.id == link.user_id))
    user = user_res.scalar_one_or_none()
    is_bm = _telegram_is_bm(getattr(user, "language", "BM") if user else "BM")

    if not data.startswith("tgadd:"):
        await _answer_telegram_callback(callback_query_id)
        return {"ok": True}

    await _answer_telegram_callback(callback_query_id)
    parts = data.split(":")
    action = parts[1] if len(parts) > 1 else ""
    flow = _get_telegram_add_flow(link.user_id, chat_id)
    _remember_telegram_add_flow_message(link.user_id, chat_id, message_id)
    flow = _get_telegram_add_flow(link.user_id, chat_id)

    if action == "close":
        await _cleanup_telegram_add_flow_messages(chat_id, flow)
        _clear_telegram_add_flow(link.user_id, chat_id)
        return {"ok": True}

    if action == "cancel":
        if flow and flow.get("step") in {"category", "amount", "wallet", "transfer_from_wallet", "transfer_to_wallet", "transfer_amount"}:
            await _show_telegram_add_type_menu(chat_id=chat_id, user_id=link.user_id, is_bm=is_bm, message_id=message_id)
        else:
            await _cleanup_telegram_add_flow_messages(chat_id, flow)
            _clear_telegram_add_flow(link.user_id, chat_id)
        return {"ok": True}

    if action == "type":
        selected_type = str(parts[2] if len(parts) > 2 else "").lower()
        if selected_type in {"expense", "income"}:
            await _show_telegram_add_category_menu(
                db,
                chat_id=chat_id,
                user_id=link.user_id,
                is_bm=is_bm,
                message_id=message_id,
                kind=selected_type,
            )
            return {"ok": True}
        if selected_type == "transfer":
            wallets = await _get_telegram_wallets_for_user(db, link.user_id)
            _set_telegram_add_flow(link.user_id, chat_id, {
                "step": "transfer_from_wallet",
                "kind": "transfer",
                "amount": "",
            })
            _remember_telegram_add_flow_message(link.user_id, chat_id, message_id)
            await _edit_telegram_message_text(
                chat_id,
                message_id,
                "🔁 *Transfer*\nPilih wallet asal." if is_bm else "🔁 *Transfer*\nChoose source wallet.",
                reply_markup=_build_telegram_transfer_wallet_keyboard(wallets, mode="from", is_bm=is_bm),
            )
            return {"ok": True}
        await _show_telegram_add_type_menu(chat_id=chat_id, user_id=link.user_id, is_bm=is_bm, message_id=message_id)
        return {"ok": True}

    if action == "transfer" and len(parts) > 3:
        transfer_mode = str(parts[2]).lower()
        wallet_id = int(parts[3]) if str(parts[3]).isdigit() else 0
        wallets = await _get_telegram_wallets_for_user(db, link.user_id)
        selected_wallet = next((wallet for wallet in wallets if int(wallet.id) == wallet_id), None)
        if not selected_wallet:
            await _answer_telegram_callback(callback_query_id, "Wallet tidak jumpa." if is_bm else "Wallet not found.")
            return {"ok": True}
        flow = _get_telegram_add_flow(link.user_id, chat_id) or {}
        flow["kind"] = "transfer"
        if transfer_mode == "from":
            flow["from_wallet_id"] = int(selected_wallet.id)
            flow["from_wallet_name"] = str(selected_wallet.name)
            flow["step"] = "transfer_to_wallet"
            _set_telegram_add_flow(link.user_id, chat_id, flow)
            _remember_telegram_add_flow_message(link.user_id, chat_id, message_id)
            await _edit_telegram_message_text(
                chat_id,
                message_id,
                (
                    f"🔁 *Transfer*\nAsal: *{_wallet_label(selected_wallet)}*\nPilih wallet tujuan."
                    if is_bm else
                    f"🔁 *Transfer*\nFrom: *{_wallet_label(selected_wallet)}*\nChoose destination wallet."
                ),
                reply_markup=_build_telegram_transfer_wallet_keyboard(wallets, mode="to", is_bm=is_bm),
            )
            return {"ok": True}
        if transfer_mode == "to":
            from_wallet_id = int(flow.get("from_wallet_id") or 0)
            if from_wallet_id and int(selected_wallet.id) == from_wallet_id:
                await _answer_telegram_callback(callback_query_id, "Wallet tujuan mesti berbeza." if is_bm else "Destination wallet must be different.")
                return {"ok": True}
            flow["to_wallet_id"] = int(selected_wallet.id)
            flow["to_wallet_name"] = str(selected_wallet.name)
            flow["step"] = "transfer_amount"
            _set_telegram_add_flow(link.user_id, chat_id, flow)
            _remember_telegram_add_flow_message(link.user_id, chat_id, message_id)
            await _edit_telegram_message_text(
                chat_id,
                message_id,
                (
                    f"🔁 *Transfer*\nAsal: *{str(flow.get('from_wallet_name') or '-')}*\nTujuan: *{_wallet_label(selected_wallet)}*\n\nTaip jumlah sekarang. Contoh: `12.50`"
                    if is_bm else
                    f"🔁 *Transfer*\nFrom: *{str(flow.get('from_wallet_name') or '-')}*\nTo: *{_wallet_label(selected_wallet)}*\n\nType amount now. Example: `12.50`"
                ),
                reply_markup={"inline_keyboard": []},
            )
            return {"ok": True}

    if action == "page":
        page = int(parts[2] or 0) if len(parts) > 2 and parts[2].isdigit() else 0
        kind = str((flow or {}).get("kind") or "expense").lower()
        await _show_telegram_add_category_menu(db, chat_id=chat_id, user_id=link.user_id, is_bm=is_bm, message_id=message_id, page=page, kind=kind)
        return {"ok": True}

    if action == "cat":
        kind = str((flow or {}).get("kind") or "expense").lower()
        category_id = int(parts[2] or 0) if len(parts) > 2 and parts[2].isdigit() else 0
        categories = await _get_telegram_categories_by_kind(db, link.user_id, kind=kind)
        category = next((cat for cat in categories if int(cat.id) == category_id), None)
        if not category:
            await _edit_telegram_message_text(chat_id, message_id, "Kategori tidak dijumpai." if is_bm else "Category not found.")
            return {"ok": True}
        _set_telegram_add_flow(link.user_id, chat_id, {
            "step": "amount",
            "kind": kind,
            "category_id": int(category.id),
            "category_name": str(category.name),
            "amount": "",
        })
        flow = _get_telegram_add_flow(link.user_id, chat_id) or {}
        await _edit_telegram_message_text(chat_id, message_id, _build_telegram_add_preview_text(flow, is_bm=is_bm), reply_markup={"inline_keyboard": []})
        await _send_telegram_add_flow_message(
            chat_id=chat_id,
            user_id=link.user_id,
            text="Taip jumlah sekarang. Contoh: `12.50`" if is_bm else "Type amount now. Example: `12.50`",
            linked=True,
        )
        return {"ok": True}

    if flow and flow.get("step") in {"amount", "wallet"}:
        await _answer_telegram_callback(callback_query_id, "Taip jawapan terus dalam chat." if is_bm else "Type your answer in chat.")
        return {"ok": True}

    if flow:
        await _show_telegram_add_type_menu(chat_id=chat_id, user_id=link.user_id, is_bm=is_bm, message_id=message_id)
        return {"ok": True}

    return {"ok": True}
