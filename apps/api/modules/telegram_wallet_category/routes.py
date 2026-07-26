from __future__ import annotations

import re
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import whatsapp_service


def build_telegram_add_category_keyboard_route(
    *,
    categories: list[models.Category],
    is_bm: bool,
    page: int,
    build_telegram_inline_keyboard: Callable[[list[list[Any]]], dict[str, Any]],
) -> dict[str, Any]:
    page_size = 8
    total_pages = max(1, (len(categories) + page_size - 1) // page_size)
    clamped_page = max(0, min(page, total_pages - 1))
    page_items = categories[clamped_page * page_size:(clamped_page + 1) * page_size]
    rows: list[list[tuple[str, str]]] = []
    row: list[tuple[str, str]] = []
    for cat in page_items:
        row.append((cat.name, f"tgadd:cat:{int(cat.id)}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    nav_row: list[tuple[str, str]] = []
    if clamped_page > 0:
        nav_row.append(("⬅️", f"tgadd:page:{clamped_page-1}"))
    if clamped_page < total_pages - 1:
        nav_row.append(("➡️", f"tgadd:page:{clamped_page+1}"))
    if nav_row:
        rows.append(nav_row)
    rows.append([("❌ Batal" if is_bm else "❌ Cancel", "tgadd:cancel")])
    return build_telegram_inline_keyboard(rows)


def build_telegram_numeric_choice_keyboard_route(
    *,
    reply_text: str | None,
    is_bm: bool,
    build_telegram_choice_keyboard: Callable[[list[list[str]]], dict[str, Any]],
) -> dict[str, Any] | None:
    matches = re.findall(r"(?m)^\s*(\d{1,2})[\).\-:]", str(reply_text or ""))
    numbers = [num for num in matches[:9] if num.isdigit()]
    if not numbers:
        return None
    rows: list[list[str]] = []
    row: list[str] = []
    for num in numbers:
        row.append(num)
        if len(row) == 3:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append(["Batal" if is_bm else "Cancel"])
    return build_telegram_choice_keyboard(rows)


async def get_telegram_wallets_for_user_route(
    *,
    db: AsyncSession,
    user_id: str,
    get_accessible_wallets_for_user: Callable[[AsyncSession, models.User], Awaitable[list[models.Wallet]]],
    ensure_wallet: Callable[[AsyncSession, str], Awaitable[models.Wallet]],
) -> list[models.Wallet]:
    user_res = await db.execute(select(models.User).where(models.User.id == user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        return []
    wallets = await get_accessible_wallets_for_user(db, user)
    if wallets:
        return wallets
    wallet = await ensure_wallet(db, user_id)
    return [wallet]


def build_telegram_wallet_keyboard_route(
    *,
    wallets: list[models.Wallet],
    is_bm: bool,
    wallet_label: Callable[[models.Wallet], str],
    build_telegram_choice_keyboard: Callable[[list[list[str]]], dict[str, Any]],
) -> dict[str, Any]:
    rows: list[list[str]] = []
    row: list[str] = []
    for idx, wallet in enumerate(wallets[:9], start=1):
        row.append(f"{idx}. {wallet_label(wallet)}")
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append(["Batal" if is_bm else "Cancel"])
    return build_telegram_choice_keyboard(rows)


def match_telegram_wallet_choice_route(
    *,
    text: str,
    wallets: list[models.Wallet],
    wallet_label: Callable[[models.Wallet], str],
) -> models.Wallet | None:
    value = str(text or "").strip()
    if not value:
        return None
    number_match = re.match(r"^\s*(\d{1,2})", value)
    if number_match:
        idx = int(number_match.group(1)) - 1
        if 0 <= idx < len(wallets[:9]):
            return wallets[idx]
    lowered = value.lower()
    for wallet in wallets:
        names = {
            str(getattr(wallet, "name", "") or "").strip().lower(),
            wallet_label(wallet).lower(),
        }
        if lowered in names:
            return wallet
    return None


async def get_telegram_categories_by_kind_route(
    *,
    db: AsyncSession,
    user_id: str,
    kind: str,
) -> list[models.Category]:
    user_res = await db.execute(select(models.User).where(models.User.id == user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        return []
    household_id = await whatsapp_service.ensure_standard_categories(db, user_id)
    await db.refresh(user)
    target_household = household_id or getattr(user, "default_household_id", None)
    target_kind = "income" if str(kind).lower() == "income" else "expense"
    if not target_household:
        return []
    stmt = select(models.Category).where(
        models.Category.kind == target_kind,
        models.Category.is_internal == False,
        models.Category.household_id == target_household,
    ).order_by(models.Category.name.asc())
    res = await db.execute(stmt)
    dedup: dict[str, models.Category] = {}
    for cat in res.scalars().all():
        dedup[str(cat.name).strip().lower()] = cat
    return sorted(dedup.values(), key=lambda c: str(c.name).lower())


async def get_telegram_categories_menu_text_route(
    *,
    db: AsyncSession,
    user_id: str,
    is_bm: bool,
) -> str:
    user_res = await db.execute(select(models.User).where(models.User.id == user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        return "Tiada kategori dijumpai." if is_bm else "No categories found."
    household_id = await whatsapp_service.ensure_standard_categories(db, user_id)
    await db.refresh(user)
    target_household = household_id or getattr(user, "default_household_id", None)
    if not target_household:
        return "Tiada kategori dijumpai." if is_bm else "No categories found."
    stmt = select(models.Category).where(
        models.Category.is_internal == False,
        models.Category.household_id == target_household,
    ).order_by(models.Category.kind.asc(), models.Category.name.asc())
    res = await db.execute(stmt)
    expense_names: list[str] = []
    income_names: list[str] = []
    seen = set()
    for cat in res.scalars().all():
        key = (str(cat.kind).lower(), str(cat.name).strip().lower())
        if key in seen:
            continue
        seen.add(key)
        if str(cat.kind).lower() == "income":
            income_names.append(str(cat.name))
        else:
            expense_names.append(str(cat.name))
    expense_line = ", ".join(expense_names[:20]) if expense_names else "-"
    income_line = ", ".join(income_names[:20]) if income_names else "-"
    if is_bm:
        return f"📂 *Kategori Anda*\n\n💸 *Expense:* {expense_line}\n\n💰 *Income:* {income_line}\n\nTaip /add untuk guna keypad simpan transaksi."
    return f"📂 *Your Categories*\n\n💸 *Expense:* {expense_line}\n\n💰 *Income:* {income_line}\n\nType /add to use keypad transaction flow."
