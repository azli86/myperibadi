from __future__ import annotations

from typing import Any, Callable

import models


def format_telegram_amount_preview_route(amount_text: str) -> str:
    value = (amount_text or "").strip()
    if not value:
        return "0"
    return value if "." in value else f"{value}.00"


def parse_telegram_amount_text_route(
    *,
    text: str,
    extract_amount: Callable[[str], float | int | str | None],
) -> float | None:
    amount = extract_amount(str(text or ""))
    if amount is None:
        return None
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def build_telegram_add_type_keyboard_route(
    *,
    is_bm: bool,
    build_telegram_inline_keyboard: Callable[[list[list[Any]]], dict[str, Any]],
) -> dict[str, Any]:
    return build_telegram_inline_keyboard([
        [
            (("Belanja" if is_bm else "Expense"), "tgadd:type:expense", "danger"),
            (("Pendapatan" if is_bm else "Income"), "tgadd:type:income", "success"),
        ],
        [
            (("Transfer" if is_bm else "Transfer"), "tgadd:type:transfer", "primary"),
        ],
        [(("Tutup" if is_bm else "Close"), "tgadd:close")],
    ])


def build_telegram_debt_type_keyboard_route(
    *,
    is_bm: bool,
    build_telegram_inline_keyboard: Callable[[list[list[Any]]], dict[str, Any]],
) -> dict[str, Any]:
    return build_telegram_inline_keyboard([
        [
            (("Orang hutang kita" if is_bm else "Someone owes me"), "tgadd:debt:type:collect"),
            (("Kita hutang orang" if is_bm else "I owe someone"), "tgadd:debt:type:pay"),
        ],
        [("❌ Batal" if is_bm else "❌ Cancel", "tgadd:cancel")],
    ])


def build_telegram_transfer_wallet_keyboard_route(
    *,
    wallets: list[models.Wallet],
    mode: str,
    is_bm: bool,
    wallet_label: Callable[[models.Wallet], str],
    build_telegram_inline_keyboard: Callable[[list[list[Any]]], dict[str, Any]],
) -> dict[str, Any]:
    rows: list[list[tuple[str, str]]] = []
    row: list[tuple[str, str]] = []
    for wallet in wallets[:9]:
        row.append((wallet_label(wallet), f"tgadd:transfer:{mode}:{int(wallet.id)}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([("❌ Batal" if is_bm else "❌ Cancel", "tgadd:cancel")])
    return build_telegram_inline_keyboard(rows)


def build_telegram_debt_help_text_route(is_bm: bool) -> str:
    if is_bm:
        return "Cara guna hutang:\n`debt list` - senarai hutang aktif\n`debtcmd` - panduan penuh hutang\n`debtcol <nama> <amaun>` - orang hutang anda\n`debtpay <nama> <amaun>` - anda hutang orang\n`balance <nama>` - semak baki hutang nama itu"
    return "Debt usage:\n`debt list` - active debt list\n`debtcmd` - full debt guide\n`debtcol <name> <amount>` - someone owes you\n`debtpay <name> <amount>` - you owe someone\n`balance <name>` - check that debt balance"


def build_telegram_transfer_help_text_route(is_bm: bool) -> str:
    if is_bm:
        return "Cara guna transfer:\n`transfer <jumlah> <wallet asal> <wallet tujuan>`\nGuna nama wallet anda sendiri."
    return "Transfer usage:\n`transfer <amount> <from wallet> <to wallet>`\nUse your own wallet names."


def build_telegram_loan_help_text_route(is_bm: bool) -> str:
    if is_bm:
        return "Cara guna loan baru:\n`loanx add <nama> <jumlah> <bulanan>` - buat rekod loan baru tanpa transaksi\n`loanx add <nama> <jumlah> monthly <bulanan>` - versi jelas\n`loanx list` - senarai loan aktif\n`loanx pay <nama> <jumlah> [wallet <nama_wallet>]` - bayar loan dan tolak dalam transaksi"
    return "Loan usage:\n`loanx add <name> <amount> <monthly>` - create new loan record without transaction\n`loanx add <name> <amount> monthly <monthly>` - explicit version\n`loanx list` - list active loans\n`loanx pay <name> <amount> [wallet <wallet_name>]` - pay loan and deduct via transaction"


def match_wallet_by_hint_route(
    *,
    wallets: list[models.Wallet],
    hint: str | None,
    wallet_label: Callable[[models.Wallet], str],
) -> models.Wallet | None:
    token = str(hint or "").strip().lower()
    if not token:
        return None
    exact: models.Wallet | None = None
    contains: models.Wallet | None = None
    for wallet in wallets:
        name = str(getattr(wallet, "name", "") or "").strip().lower()
        label = wallet_label(wallet).strip().lower()
        if token == name or token == label:
            exact = wallet
            break
        if token in name or token in label:
            contains = contains or wallet
    return exact or contains


def is_category_prompt_reply_route(reply_text: str | None) -> bool:
    lowered = str(reply_text or "").lower()
    return (
        "sila masukkan kategori" in lowered
        or "pilih kategori" in lowered
        or "please choose a category" in lowered
        or "pick one first" in lowered
        or "reply with 1, 2, or 3" in lowered
        or "balas nombor 1, 2, atau 3" in lowered
    )


def telegram_update_has_media_route(payload: Any) -> bool:
    message = payload.message or {}
    reply_to_message = message.get("reply_to_message") or {}
    return bool(
        message.get("photo")
        or message.get("document")
        or reply_to_message.get("photo")
        or reply_to_message.get("document")
    )


def build_telegram_processing_text_route(payload: Any) -> str:
    message = payload.message or {}
    sender = message.get("from") or {}
    language_code = str(sender.get("language_code") or "").lower()
    is_bm = language_code.startswith("ms") or language_code.startswith("id") or language_code.startswith("bm")
    document = message.get("document") or (message.get("reply_to_message") or {}).get("document") or {}
    mime_type = str((document or {}).get("mime_type") or "").lower()
    has_photo = bool(message.get("photo") or (message.get("reply_to_message") or {}).get("photo"))
    is_pdf = "pdf" in mime_type

    if is_bm:
        media_label = "dokumen" if is_pdf else "imej" if has_photo else "media"
        return f"📎 *{media_label.capitalize()} diterima*\n📤 Sedang upload...\n⚙️ Selepas itu saya proses transaksi."

    media_label = "document" if is_pdf else "image" if has_photo else "media"
    return f"📎 *{media_label.capitalize()} received*\n📤 Uploading...\n⚙️ Then I will process the transaction."


def build_telegram_add_preview_text_route(
    *,
    flow: dict[str, Any],
    is_bm: bool,
    format_telegram_amount_preview: Callable[[str], str],
) -> str:
    kind = "income" if str(flow.get("kind") or "expense").lower() == "income" else "expense"
    kind_label = "Income" if kind == "income" else "Expense"
    category_name = str(flow.get("category_name") or "-")
    amount = format_telegram_amount_preview(str(flow.get("amount") or ""))
    step = str(flow.get("step") or "")
    if is_bm:
        if step == "wallet":
            return f"➕ *Tambah {kind_label}*\nKategori: *{category_name}*\nJumlah: *RM {amount}*\n\nPilih wallet untuk simpan."
        return f"➕ *Tambah {kind_label}*\nKategori: *{category_name}*\nJumlah: *RM {amount}*\n\nTaip jumlah (contoh: 12.50)."
    if step == "wallet":
        return f"➕ *Add {kind_label}*\nCategory: *{category_name}*\nAmount: *RM {amount}*\n\nChoose wallet to save."
    return f"➕ *Add {kind_label}*\nCategory: *{category_name}*\nAmount: *RM {amount}*\n\nType amount (example: 12.50)."
