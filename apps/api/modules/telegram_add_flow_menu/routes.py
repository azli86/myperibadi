from __future__ import annotations

from typing import Any, Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

import models


async def show_telegram_add_type_menu_route(
    *,
    chat_id: str,
    user_id: str,
    is_bm: bool,
    message_id: int | None = None,
    set_telegram_add_flow: Callable[[str, str, dict[str, Any]], None],
    build_telegram_add_type_keyboard: Callable[[bool], dict[str, Any]],
    remember_telegram_add_flow_message: Callable[[str, str, int | None], None],
    edit_telegram_message_text: Callable[..., Awaitable[dict[str, Any] | None]],
    send_telegram_message: Callable[..., Awaitable[dict[str, Any] | None]],
) -> None:
    set_telegram_add_flow(user_id, chat_id, {
        "step": "type",
        "amount": "",
    })
    text = "➕ *Tambah Rekod*\nPilih jenis transaksi dahulu." if is_bm else "➕ *Add Record*\nChoose transaction type first."
    keyboard = build_telegram_add_type_keyboard(is_bm)
    if message_id:
        remember_telegram_add_flow_message(user_id, chat_id, message_id)
        await edit_telegram_message_text(chat_id, message_id, text, reply_markup=keyboard)
    else:
        response = await send_telegram_message(chat_id, text, linked=True, reply_markup=keyboard)
        sent_message_id = int((((response or {}).get("result") or {}).get("message_id") or 0) or 0) or None
        remember_telegram_add_flow_message(user_id, chat_id, sent_message_id)


async def show_telegram_add_category_menu_route(
    db: AsyncSession,
    *,
    chat_id: str,
    user_id: str,
    is_bm: bool,
    message_id: int | None = None,
    page: int = 0,
    kind: str = "expense",
    get_telegram_categories_by_kind: Callable[..., Awaitable[list[models.Category]]],
    send_telegram_message: Callable[..., Awaitable[dict[str, Any] | None]],
    set_telegram_add_flow: Callable[[str, str, dict[str, Any]], None],
    build_telegram_add_category_keyboard: Callable[..., dict[str, Any]],
    remember_telegram_add_flow_message: Callable[[str, str, int | None], None],
    edit_telegram_message_text: Callable[..., Awaitable[dict[str, Any] | None]],
) -> None:
    normalized_kind = "income" if str(kind).lower() == "income" else "expense"
    categories = await get_telegram_categories_by_kind(db, user_id, kind=normalized_kind)
    if not categories:
        await send_telegram_message(
            chat_id,
            (
                "Tiada kategori income dijumpai." if normalized_kind == "income" else "Tiada kategori expense dijumpai."
            ) if is_bm else (
                "No income categories found." if normalized_kind == "income" else "No expense categories found."
            ),
            linked=True,
        )
        return
    set_telegram_add_flow(user_id, chat_id, {
        "step": "category",
        "kind": normalized_kind,
        "amount": "",
        "categories": [{"id": int(cat.id), "name": str(cat.name)} for cat in categories],
    })
    label = "Income" if normalized_kind == "income" else "Expense"
    text = f"➕ *Tambah {label}*\nPilih kategori dahulu." if is_bm else f"➕ *Add {label}*\nChoose a category first."
    keyboard = build_telegram_add_category_keyboard(categories, is_bm=is_bm, page=page)
    if message_id:
        remember_telegram_add_flow_message(user_id, chat_id, message_id)
        await edit_telegram_message_text(chat_id, message_id, text, reply_markup=keyboard)
    else:
        response = await send_telegram_message(chat_id, text, linked=True, reply_markup=keyboard)
        sent_message_id = int((((response or {}).get("result") or {}).get("message_id") or 0) or 0) or None
        remember_telegram_add_flow_message(user_id, chat_id, sent_message_id)


async def show_telegram_add_wallet_menu_route(
    db: AsyncSession,
    *,
    chat_id: str,
    user_id: str,
    is_bm: bool,
    get_telegram_add_flow: Callable[[str, str], dict[str, Any] | None],
    get_telegram_wallets_for_user: Callable[..., Awaitable[list[models.Wallet]]],
    wallet_label: Callable[[models.Wallet], str],
    set_telegram_add_flow: Callable[[str, str, dict[str, Any]], None],
    build_telegram_add_preview_text: Callable[..., str],
    send_telegram_message: Callable[..., Awaitable[dict[str, Any] | None]],
    build_telegram_wallet_keyboard: Callable[..., dict[str, Any]],
    remember_telegram_add_flow_message: Callable[[str, str, int | None], None],
) -> None:
    flow = get_telegram_add_flow(user_id, chat_id) or {}
    wallets = await get_telegram_wallets_for_user(db, user_id)
    flow["step"] = "wallet"
    flow["wallet_options"] = [{"id": int(wallet.id), "name": str(wallet.name), "label": wallet_label(wallet)} for wallet in wallets[:9]]
    set_telegram_add_flow(user_id, chat_id, flow)
    text = build_telegram_add_preview_text(flow, is_bm=is_bm)
    response = await send_telegram_message(
        chat_id,
        text,
        linked=True,
        reply_markup=build_telegram_wallet_keyboard(wallets, is_bm=is_bm),
    )
    sent_message_id = int((((response or {}).get("result") or {}).get("message_id") or 0) or 0) or None
    remember_telegram_add_flow_message(user_id, chat_id, sent_message_id)
