import re
import random
import asyncio
import os
import hashlib
import math
import secrets
import sys
from pathlib import Path
from typing import Optional, Tuple, List, Any
from datetime import datetime, date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, or_
import httpx
import models
import storage_service
import budget_service
import llm_service
import location_service
from time_utils import current_business_date
from bot_responses import CHAT_AUTO_REPLIES, INSTRUCTIONAL_FALLBACKS, normalize_message_text


def _safe_print(message: str) -> None:
    """Print without crashing on Windows charmap consoles (emoji-safe)."""
    try:
        print(message)
    except UnicodeEncodeError:
        try:
            encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
            sys.stdout.write(message.encode(encoding, errors="replace").decode(encoding, errors="replace") + "\n")
        except Exception:
            try:
                sys.stdout.write(message.encode("ascii", errors="replace").decode("ascii") + "\n")
            except Exception:
                pass

STANDARD_CATEGORIES = [
    {"name": "Makanan & Minuman", "kind": "expense", "icon_name": "utensils-crossed", "keywords": ["nasi", "makan", "minum", "kfc", "mcd", "kedai"]},
    {"name": "Pengangkutan", "kind": "expense", "icon_name": "car-front", "keywords": ["grab", "minyak", "parking", "tol", "petrol"]},
    {"name": "Kesihatan", "kind": "expense", "icon_name": "heart-pulse", "keywords": ["klinik", "ubat", "hospital", "farmasi"]},
    {"name": "Loan / Komitmen", "kind": "expense", "icon_name": "wallet", "keywords": ["loan", "sewa", "ansuran", "pt", "bil"]},
    {"name": "Hiburan", "kind": "expense", "icon_name": "film", "keywords": ["wayang", "netflix", "game"]},
    {"name": "Pendapatan", "kind": "income", "icon_name": "banknote", "keywords": ["gaji", "bonus", "untung", "dividend"]},
    {"name": "Lain-lain", "kind": "expense", "icon_name": "tag", "keywords": ["lain", "benda"]}
]

STANDARD_CATEGORIES_EN = [
    {"name": "Food & Drinks", "kind": "expense", "icon_name": "utensils-crossed", "keywords": ["food", "eat", "drink", "mcd", "starbucks", "cafe"]},
    {"name": "Transport", "kind": "expense", "icon_name": "car-front", "keywords": ["grab", "fuel", "parking", "toll", "petrol", "train"]},
    {"name": "Health", "kind": "expense", "icon_name": "heart-pulse", "keywords": ["clinic", "medicine", "hospital", "pharmacy"]},
    {"name": "Loan / Commitment", "kind": "expense", "icon_name": "wallet", "keywords": ["loan", "rent", "installment", "bill"]},
    {"name": "Entertainment", "kind": "expense", "icon_name": "film", "keywords": ["movie", "netflix", "game", "spotify"]},
    {"name": "Income", "kind": "income", "icon_name": "banknote", "keywords": ["salary", "bonus", "profit", "dividend"]},
    {"name": "Others", "kind": "expense", "icon_name": "tag", "keywords": ["other", "misc"]}
]

INTERNAL_TRANSFER_CATEGORY_NAME = "Transfer Wallet"
INTERNAL_TRANSFER_CATEGORY_CODE = "wallet_transfer"
INTERNAL_DEBT_OUT_CATEGORY_NAME = "Debt Out"
INTERNAL_DEBT_IN_CATEGORY_NAME = "Debt In"
INTERNAL_DEBT_OUT_CATEGORY_CODE = "debt_out"
INTERNAL_DEBT_IN_CATEGORY_CODE = "debt_in"
INTERNAL_DEBT_CATEGORY_CODES = {
    INTERNAL_DEBT_OUT_CATEGORY_CODE,
    INTERNAL_DEBT_IN_CATEGORY_CODE,
}

MONTHLY_SALARY_CATEGORY_CODE = models.MONTHLY_SALARY_CATEGORY_CODE
MONTHLY_SALARY_CATEGORY_NAME = models.MONTHLY_SALARY_CATEGORY_NAME
MONTHLY_SALARY_KEYWORDS = models.MONTHLY_SALARY_KEYWORDS
# Reserved keywords locked to the system category; other categories cannot reuse them.
MONTHLY_SALARY_LOCKED_KEYWORDS = models.MONTHLY_SALARY_LOCKED_KEYWORDS

WHATSAPP_FALLBACK_REPLY_ENABLED = os.getenv("WHATSAPP_FALLBACK_REPLY_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}

MODEL_IDENTITY_QUERY_PATTERNS = [
    "model apa", "pakai model", "guna model", "model ai", "model llm",
    "llm apa", "ai apa", "apa ai", "guna ai", "pakai ai", "ai jenis",
    "engine apa", "ai engine", "openai", "chatgpt", "gpt", "minimax",
    "powered by", "dikuasakan", "what model", "which model", "what ai",
    "which ai", "ai model", "local model",
]


def is_model_identity_query(text: str) -> bool:
    normalized = normalize_message_text(text or "")
    if not normalized:
        return False
    return any(pattern in normalized for pattern in MODEL_IDENTITY_QUERY_PATTERNS)


def get_model_identity_reply(language: str = "BM") -> str:
    if language == "EN":
        return "MyPeribadi uses a *rule-based bot* tuned to reply naturally like a human assistant. I handle transactions, wallets, budgets, receipts, and debt records without live LLM replies."
    return "MyPeribadi menggunakan *bot berasaskan peraturan* yang ditala supaya jawapan rasa natural seperti pembantu sebenar. Saya urus transaksi, wallet, budget, resit, dan rekod hutang tanpa balasan LLM secara langsung."

DEBT_EVENT_TYPES = {"lend", "borrow", "payment_in", "payment_out", "opening_receivable", "opening_payable"}
DEBT_EVENT_SIGNS = {
    "lend": 1.0,
    "borrow": -1.0,
    "payment_in": -1.0,
    "payment_out": 1.0,
    "opening_receivable": 1.0,
    "opening_payable": -1.0,
}

PENDING_CATEGORY_SELECTIONS: dict[str, dict[str, Any]] = {}
PENDING_CATEGORY_SELECTION_TTL_SECONDS = 600
# Receipt media awaiting a category choice, keyed by user:channel.
# Stored separately so it survives pending-selection clearing.
PENDING_RECEIPT_MEDIA: dict[str, dict[str, Any]] = {}


def _pending_category_key(user_id: str, source_channel: str) -> str:
    return f"{user_id}:{source_channel}"


def _set_pending_receipt_media(user_id: str, source_channel: str, media: dict[str, Any]) -> None:
    media = dict(media)
    media["created_at_ts"] = datetime.utcnow().timestamp()
    PENDING_RECEIPT_MEDIA[_pending_category_key(user_id, source_channel)] = media


def _take_pending_receipt_media(user_id: str, source_channel: str) -> Optional[dict[str, Any]]:
    key = _pending_category_key(user_id, source_channel)
    media = PENDING_RECEIPT_MEDIA.get(key)
    if not media:
        return None
    created_at_ts = float(media.get("created_at_ts") or 0)
    if created_at_ts and datetime.utcnow().timestamp() - created_at_ts > PENDING_CATEGORY_SELECTION_TTL_SECONDS:
        PENDING_RECEIPT_MEDIA.pop(key, None)
        return None
    PENDING_RECEIPT_MEDIA.pop(key, None)
    return media


def _set_pending_category_selection(user_id: str, source_channel: str, payload: dict[str, Any]) -> None:
    payload = dict(payload)
    payload["created_at_ts"] = datetime.utcnow().timestamp()
    PENDING_CATEGORY_SELECTIONS[_pending_category_key(user_id, source_channel)] = payload


def _get_pending_category_selection(user_id: str, source_channel: str) -> Optional[dict[str, Any]]:
    key = _pending_category_key(user_id, source_channel)
    payload = PENDING_CATEGORY_SELECTIONS.get(key)
    if not payload:
        return None
    created_at_ts = float(payload.get("created_at_ts") or 0)
    if created_at_ts and datetime.utcnow().timestamp() - created_at_ts > PENDING_CATEGORY_SELECTION_TTL_SECONDS:
        PENDING_CATEGORY_SELECTIONS.pop(key, None)
        return None
    return payload


def _clear_pending_category_selection(user_id: str, source_channel: str) -> None:
    PENDING_CATEGORY_SELECTIONS.pop(_pending_category_key(user_id, source_channel), None)


async def _format_category_wallet_prompt(db, user_id: str, user_lang: str) -> list[str]:
    """Append a wallet picker to the category prompt so the user can choose a wallet
    in the same reply, e.g. 'makan tng'. Returns prompt lines (empty if one wallet)."""
    user = await db.scalar(select(models.User).where(models.User.id == user_id))
    if not user:
        return []
    query = select(models.Wallet).where(
        or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == user.default_household_id)
    )
    wallets = list((await db.execute(query)).scalars().all())
    if len(wallets) <= 1:
        return []
    wallets_sorted = sorted(wallets, key=lambda x: (not bool(getattr(x, "is_bot_default", False)), wallet_display_name(x) or x.name or ""))
    names = [wallet_display_name(w) or (w.name or "") for w in wallets_sorted]
    if user_lang == "BM":
        intro = f"\n*Dompet*: {', '.join(names)} (cth `income cash`)"
    else:
        intro = f"\n*Wallets*: {', '.join(names)} (e.g. `income cash`)"
    return [intro]


async def _split_reply_category_wallet(db, user_id: str, reply_text: str) -> Tuple[str, Optional[int]]:
    """Split a category reply that may include a wallet, e.g. 'makan tng' or 'loanx akpk tng'.
    Returns (category_part, wallet_id_or_None)."""
    normalized = normalize_message_text(reply_text or "").strip().lower()
    if not normalized:
        return (reply_text or ""), None
    user = await db.scalar(select(models.User).where(models.User.id == user_id))
    if not user:
        return (reply_text or ""), None
    query = select(models.Wallet).where(
        or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == user.default_household_id)
    )
    wallets = list((await db.execute(query)).scalars().all())
    # Longest names first so multi-word wallets match before short tokens.
    for w in sorted(wallets, key=lambda x: len(wallet_display_name(x) or x.name or ""), reverse=True):
        name = (w.name or "").strip()
        label = (getattr(w, "label", None) or "").strip()
        for candidate in (label or name, name):
            if not candidate:
                continue
            c_norm = normalize_message_text(candidate).lower()
            if c_norm and (c_norm == normalized or f" {c_norm} " in f" {normalized} "):
                # Remove the wallet token from the reply, keeping only the category part.
                remaining = re.sub(rf"\b{re.escape(c_norm)}\b", " ", normalized).strip()
                remaining = re.sub(r"\s{2,}", " ", remaining).strip()
                return remaining, int(w.id)
    return (reply_text or ""), None


BOT_TRANSLATIONS = {
    "BM": {
        "welcome": "*Hai! Saya Budget by DigitalPort.*\nGuna saya untuk simpan belanja terus ke portal anda.\n\n*Command Asas:*\n-Makan 10 : Simpan RM10 (dompet default)\n-Makan 10 Cash : Simpan RM10 ke dompet Cash\n-transfer : Pindah duit\n-checkwallet : Semak baki dompet\n-category : Senarai kategori & keyword\n-summary : Ringkasan bulanan\n-list : 5 rekod terakhir\n\n*Command Budget:*\n-budget set makanan 600 : Set budget kategori\n-budget summary : Ringkasan budget bulanan\n\n*Command Backdate:*\n-grab 18.50 @05042026 : Rekod ikut tarikh (format @DDMMYYYY)\n\n*Bahasa:*\nlang en : Tukar ke English",
        "summary_title": "*Ringkasan {month_year}*",
        "income": "Pendapatan",
        "expense": "Perbelanjaan",
        "current_balance": "Baki Semasa",
        "private_value": "Private",
        "last_5_records": "*5 Rekod Terakhir:*",
        "no_txns": "Anda belum mempunyai sebarang transaksi.",
        "no_amount": "Maaf, saya tidak dapat menemui jumlah (amount) dalam mesej anda.",
        "invalid_date_token": "Format tarikh tidak sah. Guna `@DDMMYYYY` contoh: `grab 18.50 @05042026`.",
        "wallet_not_found": "Ralat: Wallet personal tidak dijumpai.",
        "saved": "*{ref_id}*\n✅ *Done | Rekod Disimpan*\n• Nota: {text}\n• Wallet: *{wallet_name}*\n• Kategori: *{cat}*\n• Jumlah : *{amount}*\n• Tarikh: *{txn_date}*{time_note}\n• Baki Semasa : *{balance}*{backdate_hint}",
        "saved_hidden_balance": "*{ref_id}*\n✅ *Done | Rekod Disimpan*\n• Nota: {text}\n• Wallet: *{wallet_name}*\n• Kategori: *{cat}*\n• Jumlah : *{amount}*\n• Tarikh: *{txn_date}*{time_note}\n• Baki Semasa : *{private_value}*{backdate_hint}",
        "error": "Maaf, ralat teknikal berlaku semasa menyimpan data anda.",
        "no_note": "Tiada nota",
        "lang_switched": "Bahasa telah ditukar ke Bahasa Melayu.",
        "basic_fallback": "Saya boleh bantu anda tentang Budget by DigitalPort, dan saya boleh terus bagi contoh apa yang perlu ditaip juga. Kalau anda baru mula, saya boleh guide setup wallet, budget, sambung WhatsApp, atau cara guna portal di telefon. Contoh yang anda boleh terus cuba ialah `makan 12.50`, `summary`, `list`, `budget set makanan 600`, atau tanya saya `cara setup wallet`.",
        "basic_command_guide": "Kalau anda nak tahu apa command yang boleh ditaip, yang paling penting ialah ini:\n- `makan 12.50` untuk rekod belanja\n- `gaji 3500` untuk rekod pendapatan\n- `makan 12.50 cash` untuk pilih wallet tertentu\n- `summary` untuk tengok ringkasan bulan semasa\n- `list` untuk tengok rekod terbaru\n- `transfer 50 dari maybank ke cash` untuk pindah duit\n- `budget set makanan 600` untuk set budget\n- `budget list` atau `budget summary` untuk semak budget\n\nKalau anda mahu, saya boleh bagi command ikut tujuan anda, contohnya nak rekod belanja, nak set budget, atau nak guna wallet tertentu.",
        "basic_how_to_use": "Kalau nak mula guna, paling mudah terus taip command sebenar macam ini:\n- `makan 12.50` untuk rekod belanja biasa\n- `gaji 3500` untuk rekod pendapatan\n- `summary` untuk tengok ringkasan bulan semasa\n- `list` untuk tengok rekod terbaru\n- `transfer 50 dari maybank ke cash` untuk pindah duit antara wallet\n\nKalau nak backdate, tambah tarikh di hujung seperti `grab 18.50 @05042026`. Kalau ada banyak dompet, anda boleh sebut nama wallet di hujung seperti `makan 12.50 cash`.",
        "basic_setup_start": "Boleh, kalau baru mula saya cadangkan ikut urutan ini supaya tak serabut:\n1. Buka `Wallets` dan pastikan ada sekurang-kurangnya satu wallet.\n2. Kalau ada lebih daripada satu, set satu sebagai bot default.\n3. Semak `Categories` dan tambah keyword yang anda selalu guna seperti `makan`, `grab`, atau `gaji`.\n4. Lepas itu barulah set budget, sama ada di halaman Budget atau guna `budget set makanan 600`.\n5. Jika nak guna WhatsApp, sambungkan di halaman WhatsApp melalui QR atau pairing code.\n6. Akhir sekali, terus test dengan command sebenar seperti `makan 12.50`, `summary`, atau `list`.\n\nKalau anda mahu, saya boleh terangkan satu-satu ikut langkah dan saya boleh beritahu command apa sesuai untuk setiap langkah.",
        "basic_budget_setup": "Boleh, untuk set budget cara paling mudah ialah:\n1. Pastikan kategori expense yang anda nak guna sudah ada.\n2. Taip command seperti `budget set makanan 600`.\n3. Kalau untuk bulan tertentu, guna `budget set makanan 600 @2026-04`.\n4. Lepas set, semak semula dengan `budget list` atau `budget summary`.\n5. Jika kategori tak kena, biasanya perlu semak keyword di halaman `Categories`.\n\nCommand yang selalu orang guna:\n- `budget set makanan 600`\n- `budget list`\n- `budget summary`\n- `budget baki makanan`\n\nKalau anda nak, saya boleh guide ikut contoh kategori yang anda guna sekarang.",
        "basic_wallet_setup": "Boleh, untuk setup wallet saya cadangkan begini:\n1. Buka halaman `Wallets` di portal.\n2. Pastikan ada sekurang-kurangnya satu wallet aktif seperti `Cash` atau `Maybank`.\n3. Jika anda mahu bot sentiasa pilih wallet tertentu, tandakan wallet itu sebagai bot default.\n4. Selepas itu anda boleh terus cuba command seperti:\n- `makan 12.50`\n- `makan 12.50 cash`\n- `gaji 3500 maybank`\n- `transfer 50 dari maybank ke cash`\n\nKalau anda mahu, saya boleh terangkan juga bila sesuai guna bot default dan bila sesuai sebut nama wallet secara manual.",
        "basic_mobile_usage": "Boleh guna di telefon. Cara paling mudah ialah buka portal Budget by DigitalPort dalam browser telefon, sebab portal itu memang sesuai digunakan sebagai mobile web. Kalau anda nak lebih cepat rekod belanja, sambungkan WhatsApp di halaman WhatsApp. Lepas sambung, anda boleh terus taip command seperti:\n- `makan 12.50`\n- `summary`\n- `list`\n- `budget set makanan 600`\n\nKalau anda mahu, saya boleh guide beza guna portal di telefon dengan guna melalui WhatsApp, termasuk command apa yang biasanya orang terus guna.",
        "basic_summary": "`summary` akan tunjuk jumlah pendapatan, perbelanjaan, dan baki bersih untuk bulan semasa.",
        "basic_list": "`list` akan tunjuk 5 transaksi terbaru anda bersama tarikh dan jumlah.",
        "basic_budget": "Command budget: `budget set makanan 600`, `budget list`, `budget baki makanan`, `budget delete makanan @2026-04`, `budget summary`.",
        "basic_category": "Kategori akan ditentukan ikut keyword. Anda boleh ubah atau tambah keyword di halaman Categories.",
        "basic_whatsapp": "Untuk sambung WhatsApp, buka halaman WhatsApp, scan QR atau guna pairing code. Lepas sambung, mesej belanja akan direkod automatik.",
        "basic_language": "Anda boleh tukar bahasa dengan `lang en` atau `lang bm`. Dalam portal, bahasa juga boleh ditukar di halaman Settings.",
        "basic_timezone": "Timezone dan format masa boleh diubah di halaman Settings. Paparan masa dalam chat, transaksi, dan log akan ikut setting itu.",
        "basic_location": "Untuk lokasi transaksi, ada 2 cara:\n• Rekod terus dengan lokasi: hantar location pin dahulu, kemudian taip `makan 10 @here`.\n• Update transaksi lama: reply mesej bot yang ada nombor TXN, kemudian taip `@here`.\nJika belum pernah hantar location pin, bot akan minta anda hantar location pin dahulu.",
        "basic_theme": "Tema portal boleh ditukar antara dark mode dan light mode di halaman Settings.",
        "basic_export": "Untuk eksport data, buka Dashboard atau halaman Transactions dan tekan butang Export.",
        "basic_balance": "Untuk lihat baki semasa, buka Dashboard atau hantar `summary`.",
        "basic_reset_password": "Jika lupa kata laluan, gunakan halaman `Forgot Password` untuk minta pautan reset.",
        "no_wallets_found": "Tiada dompet dijumpai.",
        "wallet_list_title": "*Senarai Dompet Anda:*\n",
        "wallet_total": "• *Jumlah Keseluruhan*: RM{total}",
        "wallet_hidden_in_group": "*Baki: Private*",
        "transfer_same_wallet": "Dompet sumber dan destinasi tidak boleh sama.",
        "transfer_insufficient_bal": "*Transfer Gagal*\n• Dompet: *{wallet_name}*\n• Baki: *RM {balance}* (Tidak mencukupi).\n\nSila rekod masuk (topup) duit ke dalam dompet ini dahulu.",
        "transfer_insufficient_bal_hidden": "*Transfer Gagal*\n• Dompet: *{wallet_name}*\n• Baki: *{private_value}*",
        "expense_insufficient_wallet": "\n\nPilihan wallet: Wallet *{wallet_name}* tidak cukup untuk {amount}. Baki wallet: *{balance}*. Saya simpan sementara di wallet ini.\n\nSenarai wallet:\n{wallet_options}\n\nBalas nombor atau nama wallet pilihan untuk masukkan transaksi ini ke wallet tersebut. Contoh: `{example}`",
        "expense_insufficient_wallet_hidden": "\n\nPilihan wallet: Wallet *{wallet_name}* tidak cukup untuk transaksi ini. Baki wallet: *{private_value}*. Saya simpan sementara di wallet ini.\n\nSenarai wallet:\n{wallet_options}\n\nBalas nombor atau nama wallet pilihan untuk masukkan transaksi ini ke wallet tersebut. Contoh: `{example}`",
        "expense_no_sufficient_wallet": "\n\nPilihan wallet: Semua wallet tidak cukup untuk {amount}. Saya simpan sementara di *{wallet_name}*. Baki wallet mungkin jadi negatif.\n\nSenarai wallet:\n{wallet_options}\n\nBalas nombor atau nama wallet pilihan untuk masukkan transaksi ini ke wallet tersebut.",
        "wallet_selection_updated": "Pilihan wallet diterima.\n• Transaksi: *{ref_id}*\n• Wallet: *{wallet_name}*\n• Baki wallet: *{wallet_balance}*",
        "expense_wallet_auto_switched": "\n\nNota wallet: *{original_wallet}* tidak cukup ({original_balance}). Saya simpan guna *{selected_wallet}*. Boleh tukar wallet kemudian di detail transaksi.",
        "expense_wallet_auto_switched_hidden": "\n\nNota wallet: *{original_wallet}* tidak cukup. Saya simpan guna *{selected_wallet}*. Boleh tukar wallet kemudian di detail transaksi.",
        "transfer_success": "*{ref_id}*\n✅ *Done | Transfer Berjaya*\n• Dari: *{from_name}*\n• Ke: *{to_name}*\n• Jumlah : *{amount}*",
        "transfer_syntax_err": "Sila nyatakan dua nama dompet untuk tujuan transfer. Contoh: `Transfer 100 Maybank Cash`",
        "debt_syntax_err": "Format tidak sah. Contoh: `debtcol Ali 50`, `debtpay Ali 20`, `debtcol Ali -10`, `balance Ali`, `debt list`, `debtcmd`.",
        "debt_unknown_counterparty": "Tiada rekod hutang untuk *{name}*.",
        "debt_zero_balance": "Baki hutang *{name}* sudah selesai (RM 0.00).",
        "debt_insufficient_bal": "*Baki Tidak Mencukupi*\n• Wallet: *{wallet_name}*\n• Baki: *RM {balance}*",
        "debt_saved": "*{ref_id}*\n✅ *Done | Rekod Hutang Disimpan*\n• Nama: *{name}*\n• Jenis: *{event_label}*\n• Wallet: *{wallet_name}*\n• Jumlah : *{amount}*\n• Baki Semasa : *{balance}*",
        "debt_balance": "*Baki Hutang {name}*\n• *{balance}*",
        "debt_list_title": "*Senarai Pinjam*",
        "debt_list_empty": "Tiada baki pinjaman aktif.",
        "debt_receivable": "Collect (Orang hutang kita)",
        "debt_payable": "To Pay (Kita hutang orang)",
        "debt_help": "*Panduan Hutang*\n\n1. Orang hutang kita\n`debtcol Ali 50`\nAli hutang kita RM50.\n\n2. Orang bayar kita\n`debtcol Ali -20`\nAli bayar RM20. Baki hutang Ali berkurang.\n\n3. Kita hutang orang\n`debtpay Ali 50`\nKita hutang Ali RM50.\n\n4. Kita bayar balik\n`debtpay Ali -20`\nKita bayar Ali RM20. Baki hutang kita berkurang.\n\n5. Semak baki nama\n`balance Ali`\n\n6. Lihat semua baki aktif\n`debt list`\n\n7. Lihat panduan ini\n`debtcmd`",
        "summary_msg": "{title}\n• {income_label}: *{income}*\n• {expense_label}: *{expense}*\n• {current_balance_label}: *{current_balance}*",
        "summary_msg_hidden_balance": "{title}\n• {income_label}: *{income}*\n• {expense_label}: *{expense}*\n• {current_balance_label}: *{private_value}*",
        "receipt_success": "*{ref_id}*\n📎 *Done | Resit Dimuat Naik*\n• Baki Semasa : *{balance}*",
        "receipt_success_hidden_balance": "*{ref_id}*\n📎 *Done | Resit Dimuat Naik*\n• Baki Semasa : *{private_value}*"
    },
    "EN": {
        "welcome": "*Hi! I am Budget by DigitalPort.*\nUse me to save expenses directly to your portal.\n\n*Basic Commands:*\n-Lunch 10 : Save RM10 (default wallet)\n-Lunch 10 Cash : Save RM10 to Cash wallet\n-transfer : Transfer money\n-checkwallet : Check wallet balances\n-category : List categories & keywords\n-summary : Monthly summary\n-list : Your last 5 records\n\n*Budget Commands:*\n-budget set food 600 : Set category budget\n-budget summary : Monthly budget summary\n\n*Backdate Commands:*\n-grab 18.50 @05042026 : Backdate record (format @DDMMYYYY)\n\n*Language:*\nlang bm : Switch language to BM",
        "summary_title": "*Summary {month_year}*",
        "income": "Income",
        "expense": "Expense",
        "current_balance": "Current Balance",
        "private_value": "Private",
        "last_5_records": "*Last 5 Records:*",
        "no_txns": "You don't have any transactions yet.",
        "no_amount": "Sorry, I couldn't find an amount in your message.",
        "invalid_date_token": "Invalid date format. Use `@DDMMYYYY`, e.g. `grab 18.50 @05042026`.",
        "wallet_not_found": "Error: Personal wallet not found.",
        "saved": "*{ref_id}*\n✅ *Done | Record Saved*\n• Note: {text}\n• Wallet: *{wallet_name}*\n• Category: *{cat}*\n• Amount : *{amount}*\n• Date: *{txn_date}*{time_note}\n• Current Balance : *{balance}*{backdate_hint}",
        "saved_hidden_balance": "*{ref_id}*\n✅ *Done | Record Saved*\n• Note: {text}\n• Wallet: *{wallet_name}*\n• Category: *{cat}*\n• Amount : *{amount}*\n• Date: *{txn_date}*{time_note}\n• Current Balance : *{private_value}*{backdate_hint}",
        "error": "Sorry, a technical error occurred while saving your data.",
        "no_note": "No note",
        "lang_switched": "Language switched to English.",
        "basic_fallback": "I can help with Budget by DigitalPort, and I can also tell you exactly what to type. If you're just getting started, I can guide wallet setup, budget setup, WhatsApp linking, or how to use the portal on your phone. You can immediately try commands like `lunch 12.50`, `summary`, `list`, `budget set food 600`, or ask me `how do I set up wallets`.",
        "basic_command_guide": "If you want to know what commands to type, these are the most useful ones:\n- `lunch 12.50` to record an expense\n- `salary 3500` to record income\n- `lunch 12.50 cash` to choose a specific wallet\n- `summary` to view this month's summary\n- `list` to view recent records\n- `transfer 50 from maybank to cash` to move money\n- `budget set food 600` to set a budget\n- `budget list` or `budget summary` to review budget\n\nIf you want, I can also give you commands based on your goal, like expense recording, budget setup, or wallet usage.",
        "basic_how_to_use": "If you want the easiest way to start, just type real commands like these:\n- `lunch 12.50` to record an expense\n- `salary 3500` to record income\n- `summary` to see this month's summary\n- `list` to see your recent records\n- `transfer 50 from maybank to cash` to move money between wallets\n\nIf you want to backdate, add the date at the end like `grab 18.50 @05042026`. If you use multiple wallets, you can add the wallet name at the end like `lunch 12.50 cash`.",
        "basic_setup_start": "Sure, if you're new, I recommend this order so everything feels easier:\n1. Open `Wallets` and make sure you have at least one wallet.\n2. If you have more than one, set one as the bot default.\n3. Review `Categories` and add keywords you often use, like `lunch`, `grab`, or `salary`.\n4. Then set your budget on the Budget page or with `budget set food 600`.\n5. If you want WhatsApp, connect it from the WhatsApp page using QR or pairing code.\n6. Finally, test with real commands like `lunch 12.50`, `summary`, or `list`.\n\nIf you want, I can walk you through one step at a time and tell you exactly what to type at each step.",
        "basic_budget_setup": "Sure, the easiest way to set a budget is:\n1. Make sure the expense category already exists.\n2. Use a command like `budget set food 600`.\n3. For a specific month, use `budget set food 600 @2026-04`.\n4. Check it again with `budget list` or `budget summary`.\n5. If the category does not match, review the keywords on the `Categories` page.\n\nCommon commands people use here:\n- `budget set food 600`\n- `budget list`\n- `budget summary`\n- `budget baki food`\n\nIf you want, I can also explain this using your own category examples.",
        "basic_wallet_setup": "Sure, here’s the simplest wallet setup flow:\n1. Open the `Wallets` page in the portal.\n2. Make sure you have at least one active wallet like `Cash` or `Maybank`.\n3. If you want the bot to prefer one wallet automatically, mark it as the bot default.\n4. After that, you can try commands like:\n- `lunch 12.50`\n- `lunch 12.50 cash`\n- `salary 3500 maybank`\n- `transfer 50 from maybank to cash`\n\nIf you want, I can also explain when to use bot default versus typing the wallet name manually.",
        "basic_mobile_usage": "Yes, you can use Budget by DigitalPort on your phone. The easiest way is to open the Budget by DigitalPort portal in your phone browser, since it works as a mobile-friendly web app. If you want faster expense logging, connect WhatsApp from the WhatsApp page. After that, you can type commands like:\n- `lunch 12.50`\n- `summary`\n- `list`\n- `budget set food 600`\n\nIf you want, I can explain the difference between using the phone browser and using WhatsApp, including which commands people usually type first.",
        "basic_summary": "`summary` shows your current month's income, expenses, and net balance.",
        "basic_list": "`list` shows your latest 5 transactions with date and amount.",
        "basic_budget": "Budget commands: `budget set food 600`, `budget list`, `budget baki food`, `budget delete food @2026-04`, `budget summary`.",
        "basic_category": "Categories are assigned using keywords. You can edit or add keywords on the Categories page.",
        "basic_whatsapp": "To connect WhatsApp, open the WhatsApp page, scan the QR code, or use the pairing code. After linking, expense messages can be recorded automatically.",
        "basic_language": "You can switch language with `lang en` or `lang bm`. In the portal, language can also be changed from Settings.",
        "basic_timezone": "Timezone and time format can be changed in Settings. Chat, transactions, and logs will follow that setting.",
        "basic_location": "For transaction location, there are 2 ways:\n• Record directly with location: send a location pin first, then type `lunch 10 @here`.\n• Update an existing transaction: reply to the bot message that contains the TXN number, then type `@here`.\nIf no location pin has been sent before, the bot will ask you to send a location pin first.",
        "basic_theme": "You can switch the portal between dark mode and light mode from Settings.",
        "basic_export": "To export data, open Dashboard or Transactions and use the Export button.",
        "basic_balance": "To view your current balance, open Dashboard or send `summary`.",
        "basic_reset_password": "If you forgot your password, use the `Forgot Password` page to request a reset link.",
        "no_wallets_found": "No wallets found.",
        "wallet_list_title": "*Your Wallets:*\n",
        "wallet_total": "• *Total Balance*: RM{total}",
        "wallet_hidden_in_group": "*Balance: Private*",
        "transfer_same_wallet": "Source and destination wallets cannot be the same.",
        "transfer_insufficient_bal": "*Transfer Failed*\n• Wallet: *{wallet_name}*\n• Balance: *RM {balance}* (Insufficient).\n\nPlease top up this wallet first.",
        "transfer_insufficient_bal_hidden": "*Transfer Failed*\n• Wallet: *{wallet_name}*\n• Balance: *{private_value}*",
        "expense_insufficient_wallet": "\n\nWallet options: Wallet *{wallet_name}* does not have enough for {amount}. Wallet balance: *{balance}*. I saved it temporarily in this wallet.\n\nWallet list:\n{wallet_options}\n\nReply with the option number or wallet name you want for this transaction. Example: `{example}`",
        "expense_insufficient_wallet_hidden": "\n\nWallet options: Wallet *{wallet_name}* does not have enough for this transaction. Wallet balance: *{private_value}*. I saved it temporarily in this wallet.\n\nWallet list:\n{wallet_options}\n\nReply with the option number or wallet name you want for this transaction. Example: `{example}`",
        "expense_no_sufficient_wallet": "\n\nWallet options: No wallet has enough balance for {amount}. I saved it temporarily in *{wallet_name}*. This wallet balance may become negative.\n\nWallet list:\n{wallet_options}\n\nReply with the option number or wallet name you want for this transaction.",
        "wallet_selection_updated": "Wallet choice saved.\n• Transaction: *{ref_id}*\n• Wallet: *{wallet_name}*\n• Wallet balance: *{wallet_balance}*",
        "expense_wallet_auto_switched": "\n\nWallet note: *{original_wallet}* does not have enough ({original_balance}). I saved this using *{selected_wallet}*. You can change the wallet later in transaction details.",
        "expense_wallet_auto_switched_hidden": "\n\nWallet note: *{original_wallet}* does not have enough. I saved this using *{selected_wallet}*. You can change the wallet later in transaction details.",
        "transfer_success": "*{ref_id}*\n✅ *Done | Transfer Successful*\n• From: *{from_name}*\n• To: *{to_name}*\n• Amount : *{amount}*",
        "transfer_syntax_err": "Please specify two wallet names for the transfer. E.g: `Transfer 100 Maybank Cash`",
        "debt_syntax_err": "Invalid format. Example: `debtcol Ali 50`, `debtpay Ali 20`, `debtcol Ali -10`, `balance Ali`, `debt list`, `debtcmd`.",
        "debt_unknown_counterparty": "No debt record found for *{name}*.",
        "debt_zero_balance": "Debt with *{name}* is settled (RM 0.00).",
        "debt_insufficient_bal": "*Insufficient Balance*\n• Wallet: *{wallet_name}*\n• Balance: *RM {balance}*",
        "debt_saved": "*{ref_id}*\n✅ *Done | Debt Record Saved*\n• Name: *{name}*\n• Type: *{event_label}*\n• Wallet: *{wallet_name}*\n• Amount : *{amount}*\n• Current Balance : *{balance}*",
        "debt_balance": "*Debt Balance {name}*\n• *{balance}*",
        "debt_list_title": "*Lending List*",
        "debt_list_empty": "No active lending balance.",
        "debt_receivable": "Collect (People owe you)",
        "debt_payable": "To Pay (You owe people)",
        "debt_help": "*Debt Guide*\n\n1. Someone owes you\n`debtcol Ali 50`\nAli owes you RM50.\n\n2. Someone pays you back\n`debtcol Ali -20`\nAli pays RM20. Ali's balance reduces.\n\n3. You owe someone\n`debtpay Ali 50`\nYou owe Ali RM50.\n\n4. You pay someone back\n`debtpay Ali -20`\nYou pay Ali RM20. Your debt reduces.\n\n5. Check one person's balance\n`balance Ali`\n\n6. View all active debt balances\n`debt list`\n\n7. Show this guide\n`debtcmd`",
        "summary_msg": "{title}\n• {income_label}: *{income}*\n• {expense_label}: *{expense}*\n• {current_balance_label}: *{current_balance}*",
        "summary_msg_hidden_balance": "{title}\n• {income_label}: *{income}*\n• {expense_label}: *{expense}*\n• {current_balance_label}: *{private_value}*",
        "receipt_success": "*{ref_id}*\n📎 *Done | Receipt Uploaded*\n• Current Balance : *{balance}*",
        "receipt_success_hidden_balance": "*{ref_id}*\n📎 *Done | Receipt Uploaded*\n• Current Balance : *{private_value}*"
    }
}

DATE_TOKEN_PATTERN = re.compile(r"@(\d{8})\b")
DEBT_COMMAND_PATTERN = re.compile(r"^(debtcol|debtpay|lend|borrow|pay)\s+(.+?)\s+(?:rm\s*)?(-?\s*\d+(?:\.\d{1,2})?)(?:\s+(.+))?$", re.IGNORECASE)
DEBT_CMD_HELP_PATTERN = re.compile(r"^debtcmd$", re.IGNORECASE)
DEBT_BALANCE_PATTERN = re.compile(r"^balance\s+(.+)$", re.IGNORECASE)
LOCATION_HERE_PATTERN = re.compile(r"(^|\s)@here\b", re.IGNORECASE)
LOCATION_CONTEXT_TTL_MINUTES = max(5, int(os.getenv("LOCATION_CONTEXT_TTL_MINUTES", "240")))
WHATSAPP_BUDGET_COMMANDS_ENABLED = (
    os.getenv("WHATSAPP_BUDGET_COMMANDS_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
)

CORPORATE_BULLET = "•"
EMOJI_PATTERN = re.compile(
    "["
    "\U0001F1E6-\U0001F1FF"
    "\U0001F300-\U0001F5FF"
    "\U0001F600-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FAFF"
    "\u2600-\u27BF"
    "]+",
    re.UNICODE,
)
DECORATIVE_LINE_PATTERN = re.compile(r"(?m)^[ \t]*(?:[•\-\u2500-\u257F_=][ \t]*){2,}$")


def format_corporate_bot_reply(reply: Optional[str]) -> Optional[str]:
    """Normalize bot replies into a clean corporate WhatsApp style."""
    if reply is None:
        return None

    text = str(reply).strip()
    if not text:
        return text

    if not text:
        return text

    text = EMOJI_PATTERN.sub("", text)
    text = text.replace("\ufe0f", "").replace("\u200d", "").replace("\u20e3", "")
    text = text.replace("—", "-").replace("–", "-")
    text = re.sub(r"[ \t]+-{2,}[ \t]+", " ", text)
    text = DECORATIVE_LINE_PATTERN.sub("", text)
    text = re.sub(r"(?m)^\s*[├└]─\s*", f"{CORPORATE_BULLET} ", text)
    text = re.sub(r"(?m)^\s*[-]\s*(?=\S)", f"{CORPORATE_BULLET} ", text)
    text = re.sub(r"(?m)^[ \t]*•[ \t]*[\-\u2500-\u257F_=]+[ \t]*$", "", text)
    text = text.replace("*Done!* |", "*Record Saved* |")
    text = text.replace("*Done!*", "*Record Saved*")
    text = re.sub(r"(?m)^•[ \t]*", f"{CORPORATE_BULLET} ", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()
    text = re.sub(r"^\*Rekod Disimpan\*", "✅ *Rekod Disimpan*", text)
    text = re.sub(r"^\*Record Saved\*", "✅ *Record Saved*", text)
    text = text.replace("*Done | Rekod Disimpan*", "✅ *Done | Rekod Disimpan*")
    text = text.replace("*Done | Record Saved*", "✅ *Done | Record Saved*")
    text = text.replace("*Done | Transfer Berjaya*", "✅ *Done | Transfer Berjaya*")
    text = text.replace("*Done | Transfer Successful*", "✅ *Done | Transfer Successful*")
    text = text.replace("*Done | Rekod Hutang Disimpan*", "✅ *Done | Rekod Hutang Disimpan*")
    text = text.replace("*Done | Debt Record Saved*", "✅ *Done | Debt Record Saved*")
    text = text.replace("*Done | Resit Dimuat Naik*", "📎 *Done | Resit Dimuat Naik*")
    text = text.replace("*Done | Receipt Uploaded*", "📎 *Done | Receipt Uploaded*")
    text = re.sub(r"(?m)^Pilihan wallet:", "⚠️ Pilihan wallet:", text)
    text = re.sub(r"(?m)^Wallet options:", "⚠️ Wallet options:", text)
    return text



def wallet_display_name(wallet: models.Wallet) -> str:
    return (getattr(wallet, "label", None) or wallet.name or "").strip()


def strip_wallet_reference(text: str, wallet_name: str) -> str:
    if not text or not wallet_name:
        return (text or "").strip()
    cleaned = re.sub(rf"\b{re.escape(wallet_name.lower())}\b", " ", text)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def append_wallet_label_to_note(note_text: str, wallet_name: str) -> str:
    cleaned_note = (note_text or "").strip()
    cleaned_wallet_name = (wallet_name or "").strip()
    if not cleaned_note or not cleaned_wallet_name:
        return cleaned_note
    if f"({cleaned_wallet_name.lower()})" in cleaned_note.lower():
        return cleaned_note
    return f"{cleaned_note} ({cleaned_wallet_name})"


def _format_wallet_reply_name(
    wallet_name: str,
    wallet_balance: Optional[float] = None,
    *,
    hide_balance: bool = False,
) -> str:
    cleaned_name = (wallet_name or "").strip() or "-"
    if hide_balance or wallet_balance is None:
        return cleaned_name
    return f"{cleaned_name} | RM {float(wallet_balance):,.2f}"

def _format_wallet_option_lines(
    wallet_balances: list[tuple[models.Wallet, float]],
    *,
    hide_balance: bool,
    private_value: str,
    limit: int = 5,
) -> str:
    visible = wallet_balances[:limit]
    if not visible:
        return "-"

    lines = []
    for index, (wallet, balance) in enumerate(visible):
        prefix = f"{index + 1}."
        balance_label = private_value if hide_balance else f"RM {float(balance):,.2f}"
        lines.append(f"{prefix} *{wallet_display_name(wallet)}* : *{balance_label}*")
    return "\n".join(lines)


def _expense_wallet_retry_example(
    *,
    note: str,
    amount: float,
    wallet_name: str,
    hide_amount: bool,
    language: str,
) -> str:
    clean_note = (note or "").strip()
    if not clean_note or clean_note in {"Tiada nota", "No note"}:
        clean_note = "lunch" if language == "EN" else "makan"
    amount_label = "[amount]" if hide_amount else f"{float(amount):,.2f}"
    return f"{clean_note} {amount_label} {wallet_name}".strip()


async def _get_wallet_balances(
    db: AsyncSession,
    wallets: list[models.Wallet],
) -> list[tuple[models.Wallet, float]]:
    rows: list[tuple[models.Wallet, float]] = []
    seen: set[int] = set()
    for wallet in wallets:
        if int(wallet.id) in seen:
            continue
        seen.add(int(wallet.id))
        rows.append((wallet, await _get_wallet_balance(db, wallet.id)))
    return rows

def _wallet_matches_text(wallet: models.Wallet, text: str) -> bool:
    normalized = (text or "").strip().lower()
    if not normalized:
        return False
    names = {
        (getattr(wallet, "name", None) or "").strip().lower(),
        (getattr(wallet, "label", None) or "").strip().lower(),
        wallet_display_name(wallet).strip().lower(),
    }
    return normalized in {name for name in names if name}


def _wallet_choice_from_text(wallets: list[models.Wallet], text: str) -> Optional[models.Wallet]:
    normalized = (text or "").strip().lower()
    if not normalized:
        return None
    if normalized.isdigit():
        index = int(normalized) - 1
        if 0 <= index < len(wallets):
            return wallets[index]
    return next((wallet for wallet in wallets if _wallet_matches_text(wallet, normalized)), None)


async def _apply_recent_wallet_selection(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: Optional[int],
    text: str,
    source_channel: str,
    language: str,
    hide_balance: bool,
    private_value: str,
) -> Optional[Tuple[str, models.Transaction]]:
    wallet_query = select(models.Wallet).where(models.Wallet.owner_user_id == user_id)
    if household_id:
        wallet_query = select(models.Wallet).where(
            or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == household_id)
        )
    wallet_query = wallet_query.order_by(models.Wallet.is_bot_default.desc(), models.Wallet.name.asc(), models.Wallet.id.asc())
    wallet_res = await db.execute(wallet_query)
    wallets = list(wallet_res.scalars().all())
    selected_wallet = _wallet_choice_from_text(wallets, text)
    if not selected_wallet:
        return None

    cutoff = datetime.utcnow() - timedelta(minutes=15)
    txn_res = await db.execute(
        select(models.Transaction)
        .where(
            models.Transaction.user_id == user_id,
            models.Transaction.type == "expense",
            models.Transaction.source_channel == source_channel,
            models.Transaction.created_at >= cutoff,
        )
        .order_by(models.Transaction.created_at.desc(), models.Transaction.id.desc())
        .limit(1)
    )
    txn = txn_res.scalars().first()
    if not txn:
        return None

    current_wallet_balance = await _get_wallet_balance(db, txn.wallet_id)
    if current_wallet_balance >= -0.004:
        return None

    txn.wallet_id = selected_wallet.id
    await db.commit()
    await db.refresh(txn)
    selected_balance = await _get_wallet_balance(db, selected_wallet.id)
    balance_label = private_value if hide_balance else f"RM {selected_balance:,.2f}"
    translations = BOT_TRANSLATIONS.get(language, BOT_TRANSLATIONS["BM"])
    return translations["wallet_selection_updated"].format(
        ref_id=txn.reference_id or txn.id,
        wallet_name=wallet_display_name(selected_wallet),
        wallet_balance=balance_label,
    ), txn



def _is_budget_command(text: str) -> bool:
    lowered = (text or "").strip().lower()
    return lowered == "budget" or lowered == "bajet" or lowered.startswith("budget ") or lowered.startswith("bajet ")


def _budget_help_message(language: str) -> str:
    if language == "EN":
        return (
            "*Budget Commands*\n"
            "├─ `budget set <category> <amount>`\n"
            "├─ `budget set <category> <amount> @YYYY-MM`\n"
            "├─ `budget list`\n"
            "├─ `budget baki <category>`\n"
            "├─ `budget delete <category> @YYYY-MM`\n"
            "└─ `budget summary`"
        )
    return (
        "*Command Budget*\n"
        "├─ `budget set <kategori> <jumlah>`\n"
        "├─ `budget set <kategori> <jumlah> @YYYY-MM`\n"
        "├─ `budget list`\n"
        "├─ `budget baki <kategori>`\n"
        "├─ `budget delete <kategori> @YYYY-MM`\n"
        "└─ `budget summary`"
    )


def _budget_category_not_found_message(language: str, category_text: str, suggestions: list[str]) -> str:
    suggestion_text = ", ".join(suggestions[:6]) if suggestions else "-"
    if language == "EN":
        return (
            f"Category `{category_text}` not found.\n"
            f"Use existing categories only.\n"
            f"Available: {suggestion_text}"
        )
    return (
        f"Kategori `{category_text}` tidak dijumpai.\n"
        f"Sila guna kategori sedia ada sahaja.\n"
        f"Pilihan: {suggestion_text}"
    )


def _remove_last_amount_token(text: str) -> str:
    cleaned = re.sub(r"(?:\s|^)(?:rm\s*)?\d+(?:\.\d{1,2})?\s*$", "", (text or "").strip(), flags=re.IGNORECASE)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def has_here_location_marker(text: str) -> bool:
    return bool(LOCATION_HERE_PATTERN.search((text or "").strip()))


def strip_here_location_marker(text: str) -> str:
    if not text:
        return ""
    cleaned = LOCATION_HERE_PATTERN.sub(" ", text)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def normalize_counterparty_name(name: str) -> str:
    return re.sub(r"\s{2,}", " ", (name or "").strip())


def counterparty_key(name: str) -> str:
    return normalize_counterparty_name(name).lower()


def debt_signed_delta(event_type: str, amount: float) -> float:
    return float(DEBT_EVENT_SIGNS.get((event_type or "").strip().lower(), 0.0) * float(amount or 0.0))


def _build_loanx_help_text(language: str) -> str:
    if language == "EN":
        return "Loan usage:\n`loanx add <name> <amount> <monthly>` - create new loan record without transaction\n`loanx add <name> <amount> monthly <monthly>` - explicit version\n`loanx list` - list active loans\n`loanx pay <name> <amount> [wallet <wallet_name>]` - pay loan and deduct via transaction"
    return "Cara guna loan baru:\n`loanx add <nama> <jumlah> <bulanan>` - buat rekod loan baru tanpa transaksi\n`loanx add <nama> <jumlah> monthly <bulanan>` - versi jelas\n`loanx list` - senarai loan aktif\n`loanx pay <nama> <jumlah> [wallet <nama_wallet>]` - bayar loan dan tolak dalam transaksi"


def _build_subx_help_text(language: str) -> str:
    if language == "EN":
        return "Subscription usage:\n`subx ASTRO 89.90 15HB` - save a monthly subscription with due day\n`subx pay ASTRO 89.90 TNG` - pay subscription and record as transaction to wallet"
    return "Cara guna langganan:\n`subx ASTRO 89.90 15HB` - simpan langganan bulanan dengan due day\n`subx pay ASTRO 89.90 TNG` - bayar langganan dan rekod sebagai transaksi ke wallet"


def _match_wallet_by_hint(wallets: list[models.Wallet], hint: str | None) -> Optional[models.Wallet]:
    token = str(hint or "").strip().lower()
    if not token:
        return None
    exact = _wallet_choice_from_text(wallets, token)
    if exact:
        return exact
    for wallet in wallets:
        names = {
            (getattr(wallet, "name", None) or "").strip().lower(),
            (getattr(wallet, "label", None) or "").strip().lower(),
            wallet_display_name(wallet).strip().lower(),
        }
        if any(token and token in name for name in names if name):
            return wallet
    return None


async def _process_pinx_command(
    db: AsyncSession,
    *,
    user_id: str,
    text: str,
    language: str,
    source_channel: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    location_name: Optional[str] = None,
) -> Optional[str]:
    """Save personal place pin: pinx <title> <category> [@here already stripped upstream]."""
    normalized = str(text or "").strip()
    lowered = normalized.lower()
    if not lowered.startswith("pinx"):
        return None

    is_en = language == "EN"
    rest = normalized[4:].strip()

    if not rest or rest.lower() in {"help", "?", "list", "categories", "category", "kategori", "cats", "cat"}:
        if is_en:
            return (
                "📍 *My Places* (save only)\n"
                "1. Send location pin\n"
                "2. `pinx <title> <category> @here`\n"
                "Example: `pinx house maksu family @here`\n\n"
                "View list in the app: *My Places* (not via WhatsApp — avoids spam/ban)."
            )
        return (
            "📍 *Tempat Saya* (simpan sahaja)\n"
            "1. Hantar location pin\n"
            "2. `pinx <title> <kategori> @here`\n"
            "Contoh: `pinx house maksu family @here`\n\n"
            "Lihat senarai dalam app: *Tempat Saya* (bukan WhatsApp — elak spam/ban)."
        )

    # Save only: last token = category, rest = title
    tokens = rest.split()
    if len(tokens) < 2:
        return (
            "Format: `pinx <title> <category> @here`\nExample: `pinx house maksu family @here`"
            if is_en
            else "Format: `pinx <title> <kategori> @here`\nContoh: `pinx house maksu family @here`"
        )

    category_name = tokens[-1]
    title = " ".join(tokens[:-1]).strip()
    if not title or not category_name:
        return (
            "Format: `pinx <title> <category> @here`"
            if is_en
            else "Format: `pinx <title> <kategori> @here`"
        )

    resolved_lat = float(latitude) if latitude is not None else None
    resolved_lon = float(longitude) if longitude is not None else None
    resolved_name = (location_name or "").strip() or None

    if resolved_lat is None or resolved_lon is None:
        ctx = await get_user_location_context(db, user_id=user_id)
        if not ctx:
            if is_en:
                return "Please send your location pin first, then type:\n`pinx house maksu family @here`"
            return "Sila hantar location pin dahulu, kemudian taip:\n`pinx house maksu family @here`"
        resolved_lat = float(ctx.latitude)
        resolved_lon = float(ctx.longitude)
        resolved_name = ctx.location_name or resolved_name

    from modules.places import service as places_service
    from fastapi import HTTPException

    try:
        place = await places_service.create_place(
            db,
            user_id=user_id,
            title=title,
            latitude=resolved_lat,
            longitude=resolved_lon,
            category_name=category_name,
            location_name=resolved_name,
            source_channel=source_channel or "whatsapp",
        )
    except HTTPException as exc:
        detail = str(getattr(exc, "detail", "") or "")
        return detail or ("Failed to save place." if is_en else "Gagal simpan tempat.")
    except Exception:
        await db.rollback()
        return "Failed to save place." if is_en else "Gagal simpan tempat."

    cat_label = place.category.name if place.category else category_name
    maps_url = f"https://www.google.com/maps?q={resolved_lat},{resolved_lon}"
    if is_en:
        return f"📍 *Place saved*\n*{place.title}*\nCategory: {cat_label}\n{maps_url}"
    return f"📍 *Tempat disimpan*\n*{place.title}*\nKategori: {cat_label}\n{maps_url}"


async def _process_loanx_command(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: Optional[int],
    text: str,
    language: str,
    source_channel: str,
    hide_balance: bool,
    private_value: str,
) -> Optional[str]:
    normalized = str(text or "").strip()
    lowered = normalized.lower()
    if not lowered.startswith("loanx"):
        return None

    is_en = language == "EN"
    explicit_txn_date, normalized, _has_invalid = extract_explicit_txn_date(normalized)
    rest = normalized[5:].strip()
    if not rest:
        return _build_loanx_help_text(language)

    if rest.lower() == "list":
        result = await db.execute(
            select(models.Loan)
            .where(models.Loan.user_id == user_id)
            .order_by(models.Loan.status.asc(), models.Loan.updated_at.desc(), models.Loan.id.desc())
        )
        loans = list(result.scalars().all())
        active_loans = [loan for loan in loans if float(loan.outstanding_amount or 0) > 0.004]
        if not active_loans:
            return "No active loans. Use `loanx add <name> <amount>`." if is_en else "Tiada loan aktif. Guna `loanx add <nama> <jumlah>`."
        lines = ["📘 *Active Loans*" if is_en else "📘 *Loan Aktif*"]
        for idx, loan in enumerate(active_loans[:20], start=1):
            outstanding = float(loan.outstanding_amount or 0)
            monthly_payment = float(loan.monthly_payment or 0)
            outstanding_text = private_value if hide_balance else f"RM {outstanding:,.2f}"
            monthly_text = private_value if hide_balance else f"RM {monthly_payment:,.2f}"
            if monthly_payment > 0:
                remaining_months = math.ceil(outstanding / monthly_payment) if outstanding > 0.004 else 0
                month_label = "months left" if is_en else "bulan baki"
                lines.append(f"{idx}. *{loan.name}* — {outstanding_text} / {monthly_text} = *{remaining_months} {month_label}*")
            else:
                lines.append(f"{idx}. *{loan.name}* — {outstanding_text}")
        return "\n".join(lines)

    add_match = re.match(r"^add\s+(.+?)\s+(?:rm\s*)?(\d+(?:\.\d{1,2})?)(?:\s+(?:monthly\s+|bulanan\s+)?(?:rm\s*)?(\d+(?:\.\d{1,2})?))?$", rest, flags=re.IGNORECASE)
    if add_match:
        loan_name = str(add_match.group(1) or "").strip()
        opening_amount = float(add_match.group(2) or 0)
        monthly_payment = float(add_match.group(3) or 0)
        if not loan_name or opening_amount <= 0:
            return "Invalid format. Use `loanx add <name> <amount> <monthly>`." if is_en else "Format salah. Guna `loanx add <nama> <jumlah> <bulanan>`."
        if monthly_payment < 0 or monthly_payment - opening_amount > 0.004:
            return "Monthly pay must be lower than total loan." if is_en else "Bulanan mesti lebih kecil daripada jumlah loan."
        household_id = household_id or await ensure_standard_categories(db, user_id)
        loan_key = counterparty_key(loan_name)
        exists = await db.execute(select(models.Loan).where(models.Loan.user_id == user_id, models.Loan.key == loan_key))
        if exists.scalars().first():
            return "Loan already exists. Use another name or `loanx list`." if is_en else "Loan sudah wujud. Guna nama lain atau `loanx list`."
        loan = models.Loan(
            user_id=user_id,
            household_id=household_id,
            name=loan_name,
            key=loan_key,
            opening_amount=opening_amount,
            outstanding_amount=opening_amount,
            monthly_payment=monthly_payment if monthly_payment > 0 else None,
            start_date=current_business_date(),
            notes="WhatsApp loanx add",
            status="active",
        )
        db.add(loan)
        await db.commit()
        remaining_months = math.ceil(opening_amount / monthly_payment) if monthly_payment > 0 else None
        if monthly_payment > 0:
            monthly_line = f"\nMonthly: *RM {monthly_payment:,.2f}*\nMonths left: *{remaining_months}*" if is_en else f"\nBulanan: *RM {monthly_payment:,.2f}*\nBaki bulan: *{remaining_months}*"
        else:
            monthly_line = ""
        return (
            f"✅ Loan saved: *{loan_name}*\nOutstanding: *RM {opening_amount:,.2f}*{monthly_line}\nNo transaction created."
            if is_en else
            f"✅ Loan disimpan: *{loan_name}*\nOutstanding: *RM {opening_amount:,.2f}*{monthly_line}\nTiada transaksi dibuat."
        )

    pay_match = re.match(r"^pay\s+(.+?)\s+(?:rm\s*)?(\d+(?:\.\d{1,2})?)(?:\s+(?:wallet\s+)?(.+))?$", rest, flags=re.IGNORECASE)
    if pay_match:
        loan_name = str(pay_match.group(1) or "").strip()
        pay_amount = float(pay_match.group(2) or 0)
        wallet_hint = str(pay_match.group(3) or "").strip() or None
        if not loan_name or pay_amount <= 0:
            return "Invalid format. Use `loanx pay <name> <amount> [wallet <wallet_name>]`." if is_en else "Format salah. Guna `loanx pay <nama> <jumlah> [wallet <nama_wallet>]`."

        loan_key = counterparty_key(loan_name)
        loan_result = await db.execute(select(models.Loan).where(models.Loan.user_id == user_id, models.Loan.key == loan_key))
        loan = loan_result.scalars().first()
        if not loan:
            return "Loan not found." if is_en else "Loan tidak dijumpai."
        outstanding = float(loan.outstanding_amount or 0)
        if outstanding <= 0.004:
            return "Loan already settled." if is_en else "Loan sudah selesai."
        if pay_amount - outstanding > 0.004:
            over_text = private_value if hide_balance else f"RM {outstanding:,.2f}"
            return f"Payment exceeds loan outstanding ({over_text})." if is_en else f"Bayaran melebihi baki loan ({over_text})."

        wallet_query = select(models.Wallet).where(models.Wallet.owner_user_id == user_id)
        if household_id:
            wallet_query = select(models.Wallet).where(
                or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == household_id)
            )
        wallet_res = await db.execute(wallet_query.order_by(models.Wallet.is_bot_default.desc(), models.Wallet.name.asc(), models.Wallet.id.asc()))
        wallets = list(wallet_res.scalars().all())
        selected_wallet = _match_wallet_by_hint(wallets, wallet_hint) if wallet_hint else None
        if wallet_hint and not selected_wallet:
            return "Error: Personal wallet not found." if is_en else "Ralat: Wallet personal tidak dijumpai."
        if not selected_wallet:
            selected_wallet = await _select_default_wallet_for_debt(db, user_id=user_id, household_id=household_id)
        wallet_balance = await _get_wallet_balance(db, int(selected_wallet.id))
        if wallet_balance + 0.004 < pay_amount:
            balance_text = private_value if hide_balance else f"RM {wallet_balance:,.2f}"
            return (
                f"*Insufficient Balance*\n• Wallet: *{wallet_display_name(selected_wallet)}*\n• Balance: *{balance_text}*"
                if is_en else
                f"*Baki Tidak Mencukupi*\n• Wallet: *{wallet_display_name(selected_wallet)}*\n• Baki: *{balance_text}*"
            )

        household_id = household_id or await ensure_standard_categories(db, user_id)
        preferred_names = ["Loan / Komitmen", "Loan", "Komitmen"]
        category_result = await db.execute(
            select(models.Category).where(
                models.Category.household_id == household_id,
                models.Category.kind == "expense",
                models.Category.is_internal == False,
                models.Category.name.in_(preferred_names),
            ).order_by(models.Category.name.asc()).limit(1)
        )
        category = category_result.scalars().first()
        if not category:
            fallback_result = await db.execute(
                select(models.Category).where(
                    models.Category.household_id == household_id,
                    models.Category.kind == "expense",
                    models.Category.is_internal == False,
                ).order_by(models.Category.name.asc()).limit(1)
            )
            category = fallback_result.scalars().first()
        payment_date = explicit_txn_date or current_business_date()
        txn = models.Transaction(
            wallet_id=selected_wallet.id,
            user_id=user_id,
            household_id=household_id,
            reference_id=models.generate_txn_reference(payment_date),
            type="expense",
            txn_date=payment_date,
            vendor_or_source=f"Loan Payment {loan.name}"[:190],
            amount=pay_amount,
            category_id=category.id if category else None,
            notes=f"Loan payment for {loan.name}"[:255],
            source_channel=source_channel,
        )
        db.add(txn)
        await db.flush()
        payment = models.LoanPayment(
            user_id=user_id,
            household_id=household_id,
            loan_id=int(loan.id),
            wallet_id=selected_wallet.id,
            transaction_id=txn.id,
            amount=pay_amount,
            payment_date=payment_date,
            notes="WhatsApp loanx pay",
            source_channel=source_channel,
        )
        db.add(payment)
        remaining = max(0.0, round(outstanding - pay_amount, 2))
        loan.outstanding_amount = remaining
        loan.status = "settled" if remaining <= 0.004 else "active"
        await db.commit()
        pending_media = _take_pending_receipt_media(user_id, source_channel)
        if pending_media and txn:
            try:
                await process_whatsapp_media_message(
                    db=db,
                    user_id=user_id,
                    phone="",
                    payload=pending_media.get("payload"),
                    mime_type=pending_media.get("mime_type"),
                    file_name=pending_media.get("file_name"),
                    caption="",
                    target_txn_ref=None,
                    target_txn_override=txn,
                    source_channel=source_channel,
                    show_current_balance=True,
                    show_expense_amount=True,
                    show_income_amount=True,
                    existing_object_key=pending_media.get("object_key"),
                    media_size_bytes=pending_media.get("size_bytes"),
                )
            except Exception as exc:
                _safe_print(f"[WA] Failed to attach receipt media to loan payment: {exc}")
        remaining_text = private_value if hide_balance else f"RM {remaining:,.2f}"
        paid_text = private_value if hide_balance else f"RM {pay_amount:,.2f}"
        ref_id = txn.reference_id
        return (
            f"*{ref_id}*\n✅ Loan payment recorded.\nLoan: *{loan.name}*\nPaid: *{paid_text}*\nWallet: *{wallet_display_name(selected_wallet)}*\nRemaining: *{remaining_text}*"
            if is_en else
            f"*{ref_id}*\n✅ Bayaran loan direkod.\nLoan: *{loan.name}*\nBayar: *{paid_text}*\nWallet: *{wallet_display_name(selected_wallet)}*\nBaki: *{remaining_text}*"
        )

    return _build_loanx_help_text(language)


async def _process_subx_command(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: Optional[int],
    text: str,
    language: str,
    source_channel: str,
    hide_balance: bool = False,
    private_value: str = "Private",
) -> tuple[str, Optional[models.Transaction]] | str | None:
    normalized = str(text or "").strip()
    lowered = normalized.lower()
    if not lowered.startswith("subx"):
        return None

    is_en = language == "EN"

    explicit_txn_date, normalized, _has_invalid = extract_explicit_txn_date(normalized)

    # subx pay <name> <amount> <wallet>
    pay_match = re.match(r"^subx\s+pay\s+(.+?)\s+(?:rm\s*)?(\d+(?:\.\d{1,2})?)(?:\s+(.+))?$", normalized, flags=re.IGNORECASE)
    if pay_match:
        sub_name = normalize_counterparty_name(pay_match.group(1) or "")
        pay_amount = float(pay_match.group(2) or 0)
        wallet_hint = str(pay_match.group(3) or "").strip() or None
        if not sub_name or pay_amount <= 0:
            return _build_subx_help_text(language)

        sub_key = counterparty_key(sub_name)
        sub_result = await db.execute(select(models.Subscription).where(models.Subscription.user_id == user_id, models.Subscription.key == sub_key))
        sub = sub_result.scalars().first()
        if not sub:
            return (f"Subscription not found. Use `subx {sub_name} {pay_amount} 1HB` to create it first." if is_en else f"Langganan tidak dijumpai. Guna `subx {sub_name} {pay_amount} 1HB` dulu untuk cipta.")

        wallet_query = select(models.Wallet).where(models.Wallet.owner_user_id == user_id)
        if household_id:
            wallet_query = select(models.Wallet).where(
                or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == household_id)
            )
        wallet_res = await db.execute(wallet_query.order_by(models.Wallet.is_bot_default.desc(), models.Wallet.name.asc(), models.Wallet.id.asc()))
        wallets = list(wallet_res.scalars().all())
        selected_wallet = _match_wallet_by_hint(wallets, wallet_hint) if wallet_hint else None
        if wallet_hint and not selected_wallet:
            return ("Error: Personal wallet not found." if is_en else "Ralat: Wallet personal tidak dijumpai.")
        if not selected_wallet:
            selected_wallet = await _select_default_wallet_for_debt(db, user_id=user_id, household_id=household_id)

        household_id = household_id or await ensure_standard_categories(db, user_id)
        category_names = ["Subscriptions", "Subscription", "Langganan", "Loan / Komitmen", "Bil & Langganan"]
        category_result = await db.execute(
            select(models.Category).where(
                models.Category.household_id == household_id,
                models.Category.kind == "expense",
                models.Category.is_internal == False,
                models.Category.name.in_(category_names),
            ).order_by(models.Category.name.asc()).limit(1)
        )
        category = category_result.scalars().first()
        if not category:
            fallback_result = await db.execute(
                select(models.Category).where(
                    models.Category.household_id == household_id,
                    models.Category.kind == "expense",
                    models.Category.is_internal == False,
                ).order_by(models.Category.name.asc()).limit(1)
            )
            category = fallback_result.scalars().first()

        payment_date = explicit_txn_date or current_business_date()
        txn = models.Transaction(
            wallet_id=selected_wallet.id,
            user_id=user_id,
            household_id=household_id,
            reference_id=models.generate_txn_reference(payment_date),
            type="expense",
            txn_date=payment_date,
            vendor_or_source=f"SUBX {sub.name}"[:190],
            amount=pay_amount,
            category_id=category.id if category else None,
            subscription_id=sub.id,
            notes=f"SUBX payment for {sub.name}"[:255],
            source_channel=source_channel,
        )
        db.add(txn)
        await db.flush()
        sub.last_payment_date = payment_date
        await db.commit()
        pending_media = _take_pending_receipt_media(user_id, source_channel)
        if pending_media and txn:
            try:
                await process_whatsapp_media_message(
                    db=db,
                    user_id=user_id,
                    phone="",
                    payload=pending_media.get("payload"),
                    mime_type=pending_media.get("mime_type"),
                    file_name=pending_media.get("file_name"),
                    caption="",
                    target_txn_ref=None,
                    target_txn_override=txn,
                    source_channel=source_channel,
                    show_current_balance=True,
                    show_expense_amount=True,
                    show_income_amount=True,
                    existing_object_key=pending_media.get("object_key"),
                    media_size_bytes=pending_media.get("size_bytes"),
                )
            except Exception as exc:
                _safe_print(f"[WA] Failed to attach receipt media to subx payment: {exc}")
        ref_id = txn.reference_id
        message = (
            f"*{ref_id}*\n✅ {sub.name} paid: *RM {pay_amount:,.2f}* via *{wallet_display_name(selected_wallet)}*.\nTransaction recorded."
            if is_en
            else
            f"*{ref_id}*\n✅ {sub.name} dibayar: *RM {pay_amount:,.2f}* guna *{wallet_display_name(selected_wallet)}*.\nTransaksi direkod."
        )
        return message, txn

    # subx <name> <amount> <day>HB
    match = re.match(r"^subx\s+(.+?)\s+(?:rm\s*)?(\d+(?:\.\d{1,2})?)\s+(\d{1,2})\s*hb$", normalized, flags=re.IGNORECASE)
    if not match:
        return _build_subx_help_text(language)

    subscription_name = normalize_counterparty_name(match.group(1) or "")
    amount = float(match.group(2) or 0)
    due_day_of_month = int(match.group(3) or 0)
    if not subscription_name or amount <= 0 or due_day_of_month < 1 or due_day_of_month > 31:
        return _build_subx_help_text(language)

    household_id = household_id or await ensure_standard_categories(db, user_id)
    subscription_key = counterparty_key(subscription_name)
    exists = await db.execute(select(models.Subscription).where(models.Subscription.user_id == user_id, models.Subscription.key == subscription_key))
    if exists.scalars().first():
        return ((f"Subscription already exists. Use another name." if is_en else f"Langganan sudah wujud. Guna nama lain."),)

    c = models.Subscription(
        user_id=user_id,
        household_id=household_id,
        name=subscription_name,
        key=subscription_key,
        amount=amount,
        due_day_of_month=due_day_of_month,
        start_date=current_business_date(),
        notes="WhatsApp subx add",
        status="active",
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    day_label = f"{due_day_of_month}HB"
    message = (
        f"✅ Subscription saved: *{subscription_name}*\nAmount: *RM {amount:,.2f}*\nDue day: *{day_label}*\nNo transaction created."
        if is_en else
        f"✅ Subscription disimpan: *{subscription_name}*\nJumlah: *RM {amount:,.2f}*\nDue day: *{day_label}*\nTiada transaksi dibuat."
    )
    return message


async def process_subscription_command_from_web(
    db: AsyncSession,
    *,
    user_id: str,
    command_text: str,
) -> str:
    user_result = await db.execute(select(models.User).where(models.User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise ValueError("USER_NOT_FOUND")
    result = await _process_subx_command(
        db,
        user_id=user_id,
        household_id=user.default_household_id,
        text=command_text,
        language=getattr(user, "language", "BM"),
        source_channel="web",
    )
    if not result:
        raise ValueError("INVALID_SUBSCRIPTION_COMMAND")
    return result


def parse_debt_command(text: str) -> tuple[Optional[str], Optional[str], Optional[float], Optional[str]]:
    normalized = re.sub(r"\s{2,}", " ", (text or "").strip())
    match = DEBT_COMMAND_PATTERN.match(normalized)
    if not match:
        return None, None, None, None
    command = match.group(1).lower()
    name = normalize_counterparty_name(match.group(2))
    amount_str = (match.group(3) or "").replace(" ", "")
    wallet_name = normalize_counterparty_name(match.group(4) or "") if match.lastindex and match.lastindex >= 4 else None
    try:
        amount = float(amount_str)
    except (ValueError, TypeError):
        return None, None, None, None
    if not name or abs(amount) < 0.005:
        return None, None, None, None
    return command, name, amount, (wallet_name or None)



def parse_debt_balance_query(text: str) -> Optional[str]:
    normalized = re.sub(r"\s{2,}", " ", (text or "").strip())
    match = DEBT_BALANCE_PATTERN.match(normalized)
    if not match:
        return None
    name = normalize_counterparty_name(match.group(1))
    return name or None


def is_debt_list_command(text: str) -> bool:
    normalized = re.sub(r"\s{2,}", " ", (text or "").strip()).lower()
    return normalized in ["list lend", "debt list", "senarai hutang"]


def is_primary_report_excluded_category_code(category_system_code: Optional[str]) -> bool:
    return (category_system_code or "").strip().lower() in {
        INTERNAL_TRANSFER_CATEGORY_CODE,
        INTERNAL_DEBT_OUT_CATEGORY_CODE,
        INTERNAL_DEBT_IN_CATEGORY_CODE,
    }


def _debt_event_label(event_type: str, language: str) -> str:
    event = (event_type or "").strip().lower()
    if language == "EN":
        mapping = {
            "lend": "Lend Out",
            "borrow": "Borrowed",
            "payment_in": "Payment Received",
            "payment_out": "Payment Sent",
            "opening_receivable": "Opening Receivable",
            "opening_payable": "Opening Payable",
        }
    else:
        mapping = {
            "lend": "Bagi Pinjam",
            "borrow": "Pinjam Dari Orang",
            "payment_in": "Terima Bayaran",
            "payment_out": "Bayar Balik",
            "opening_receivable": "Baki Lama Orang Hutang",
            "opening_payable": "Baki Lama Kita Hutang",
        }
    return mapping.get(event, event_type)


async def ensure_internal_debt_categories(
    db: AsyncSession,
    household_id: Optional[int],
) -> tuple[Optional[models.Category], Optional[models.Category]]:
    if not household_id:
        return None, None

    out_result = await db.execute(
        select(models.Category).where(
            models.Category.household_id == household_id,
            or_(
                models.Category.system_code == INTERNAL_DEBT_OUT_CATEGORY_CODE,
                models.Category.name == INTERNAL_DEBT_OUT_CATEGORY_NAME,
            ),
        ).order_by(models.Category.id.asc()).limit(1)
    )
    debt_out_category = out_result.scalar_one_or_none()
    if debt_out_category:
        debt_out_category.name = INTERNAL_DEBT_OUT_CATEGORY_NAME
        debt_out_category.kind = "expense"
        debt_out_category.icon_name = debt_out_category.icon_name or "wallet"
        debt_out_category.is_internal = True
        debt_out_category.system_code = INTERNAL_DEBT_OUT_CATEGORY_CODE
        debt_out_category.is_default = False
    else:
        debt_out_category = models.Category(
            name=INTERNAL_DEBT_OUT_CATEGORY_NAME,
            icon_name="wallet",
            kind="expense",
            household_id=household_id,
            is_default=False,
            is_internal=True,
            system_code=INTERNAL_DEBT_OUT_CATEGORY_CODE,
        )
        db.add(debt_out_category)
        await db.flush()

    in_result = await db.execute(
        select(models.Category).where(
            models.Category.household_id == household_id,
            or_(
                models.Category.system_code == INTERNAL_DEBT_IN_CATEGORY_CODE,
                models.Category.name == INTERNAL_DEBT_IN_CATEGORY_NAME,
            ),
        ).order_by(models.Category.id.asc()).limit(1)
    )
    debt_in_category = in_result.scalar_one_or_none()
    if debt_in_category:
        debt_in_category.name = INTERNAL_DEBT_IN_CATEGORY_NAME
        debt_in_category.kind = "income"
        debt_in_category.icon_name = debt_in_category.icon_name or "wallet"
        debt_in_category.is_internal = True
        debt_in_category.system_code = INTERNAL_DEBT_IN_CATEGORY_CODE
        debt_in_category.is_default = False
    else:
        debt_in_category = models.Category(
            name=INTERNAL_DEBT_IN_CATEGORY_NAME,
            icon_name="wallet",
            kind="income",
            household_id=household_id,
            is_default=False,
            is_internal=True,
            system_code=INTERNAL_DEBT_IN_CATEGORY_CODE,
        )
        db.add(debt_in_category)
        await db.flush()

    await db.flush()
    return debt_out_category, debt_in_category


async def _get_wallet_balance(db: AsyncSession, wallet_id: int) -> float:
    inc_res = await db.execute(
        select(func.sum(models.Transaction.amount)).where(
            models.Transaction.wallet_id == wallet_id,
            models.Transaction.type == "income",
        )
    )
    exp_res = await db.execute(
        select(func.sum(models.Transaction.amount)).where(
            models.Transaction.wallet_id == wallet_id,
            models.Transaction.type == "expense",
        )
    )
    return float((inc_res.scalar() or 0) - (exp_res.scalar() or 0))


async def _select_default_wallet_for_debt(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: Optional[int],
) -> models.Wallet:
    wallet_query = select(models.Wallet).where(models.Wallet.owner_user_id == user_id)
    if household_id:
        wallet_query = select(models.Wallet).where(
            or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == household_id)
        )
    wallet_res = await db.execute(wallet_query)
    wallets = wallet_res.scalars().all()

    for wallet in wallets:
        if getattr(wallet, "is_bot_default", False):
            return wallet

    if wallets:
        return wallets[0]

    return await ensure_personal_wallet(db, user_id)


async def get_debt_balance(
    db: AsyncSession,
    *,
    user_id: str,
    counterparty_name: str,
) -> float:
    key = counterparty_key(counterparty_name)
    if not key:
        return 0.0
    result = await db.execute(
        select(
            func.sum(
                case(
                    (models.Debt.event_type == "lend", models.Debt.amount),
                    (models.Debt.event_type == "borrow", -models.Debt.amount),
                    (models.Debt.event_type == "payment_in", -models.Debt.amount),
                    (models.Debt.event_type == "payment_out", models.Debt.amount),
                    (models.Debt.event_type == "opening_receivable", models.Debt.amount),
                    (models.Debt.event_type == "opening_payable", -models.Debt.amount),
                    else_=0,
                )
            )
        ).where(
            models.Debt.user_id == user_id,
            models.Debt.counterparty_key == key,
        )
    )
    return float(result.scalar() or 0.0)


async def get_debt_summaries(
    db: AsyncSession,
    *,
    user_id: str,
) -> list[dict[str, Any]]:
    # Get all debtors for the user
    debtors_result = await db.execute(
        select(models.Debtor).where(models.Debtor.user_id == user_id)
    )
    debtors = debtors_result.scalars().all()
    debtor_map = {d.id: d for d in debtors}

    # Get all debts for the user
    result = await db.execute(
        select(models.Debt)
        .where(models.Debt.user_id == user_id)
        .order_by(models.Debt.created_at.asc(), models.Debt.id.asc())
    )
    debts = result.scalars().all()

    summaries: dict[str, dict[str, Any]] = {}
    
    # Process debts and group by counterparty_key
    # (Note: we still use counterparty_key for grouping to support legacy/bot entries)
    for debt in debts:
        key = debt.counterparty_key
        if key not in summaries:
            summaries[key] = {
                "counterparty_name": debt.counterparty_name,
                "counterparty_key": key,
                "debtor_id": debt.debtor_id,
                "balance": 0.0,
                "total_lent": 0.0,
                "total_borrowed": 0.0,
                "total_paid_in": 0.0,
                "total_paid_out": 0.0,
                "event_count": 0,
                "last_activity_at": debt.created_at,
            }

        summary = summaries[key]
        amount = float(debt.amount or 0)
        summary["balance"] += debt_signed_delta(debt.event_type, amount)
        summary["event_count"] += 1
        summary["last_activity_at"] = debt.created_at
        
        # If debt has debtor_id, ensure summary reflects the registered name
        if debt.debtor_id and debt.debtor_id in debtor_map:
            summary["counterparty_name"] = debtor_map[debt.debtor_id].name
            summary["debtor_id"] = debt.debtor_id

        if debt.event_type == "lend":
            summary["total_lent"] += amount
        elif debt.event_type == "borrow":
            summary["total_borrowed"] += amount
        elif debt.event_type == "payment_in":
            summary["total_paid_in"] += amount
        elif debt.event_type == "payment_out":
            summary["total_paid_out"] += amount

    # Ensure all registered debtors are in the summaries even if they have no debts
    for d in debtors:
        if d.key not in summaries:
            summaries[d.key] = {
                "counterparty_name": d.name,
                "counterparty_key": d.key,
                "debtor_id": d.id,
                "balance": 0.0,
                "total_lent": 0.0,
                "total_borrowed": 0.0,
                "total_paid_in": 0.0,
                "total_paid_out": 0.0,
                "event_count": 0,
                "last_activity_at": d.created_at,
            }

    rows = []
    for summary in summaries.values():
        rows.append(
            {
                **summary,
                "balance": round(float(summary["balance"]), 2),
                "total_lent": round(float(summary["total_lent"]), 2),
                "total_borrowed": round(float(summary["total_borrowed"]), 2),
                "total_paid_in": round(float(summary["total_paid_in"]), 2),
                "total_paid_out": round(float(summary["total_paid_out"]), 2),
            }
        )

    rows.sort(key=lambda item: (-abs(item["balance"]), item["counterparty_name"].lower()))
    return rows


async def create_debt_event(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: Optional[int],
    counterparty_name: Optional[str] = None,
    debtor_id: Optional[int] = None,
    event_type: str,
    amount: float,
    wallet_id: Optional[int] = None,
    txn_date: Optional[date] = None,
    notes: Optional[str] = None,
    source_channel: str = "whatsapp",
    allow_auto_register: bool = True,
) -> tuple[models.Debt, Optional[models.Transaction]]:
    debtor: Optional[models.Debtor] = None
    if debtor_id is not None:
        debtor_stmt = select(models.Debtor).where(models.Debtor.id == debtor_id, models.Debtor.user_id == user_id)
        debtor_result = await db.execute(debtor_stmt)
        debtor = debtor_result.scalars().first()
        if not debtor:
            raise ValueError("DEBTOR_NOT_FOUND")
        final_counterparty_name = debtor.name
    elif counterparty_name:
        normalized_name = normalize_counterparty_name(counterparty_name)
        if not normalized_name:
            raise ValueError("INVALID_COUNTERPARTY")
        
        # Check if debtor exists by key
        key = counterparty_key(normalized_name)
        debtor_stmt = select(models.Debtor).where(models.Debtor.user_id == user_id, models.Debtor.key == key)
        debtor_result = await db.execute(debtor_stmt)
        debtor = debtor_result.scalars().first()

        # Bot commands should be able to create names from any connector when allowed.
        if not debtor and allow_auto_register:
            debtor = models.Debtor(
                user_id=user_id,
                household_id=household_id,
                name=normalized_name,
                key=key
            )
            db.add(debtor)
            await db.flush()
        
        if not debtor:
            raise ValueError("DEBTOR_NOT_FOUND")
            
        final_counterparty_name = debtor.name
    else:
        raise ValueError("INVALID_COUNTERPARTY")

    normalized_event = (event_type or "").strip().lower()
    if normalized_event not in DEBT_EVENT_TYPES:
        raise ValueError("INVALID_EVENT_TYPE")

    normalized_amount = round(float(amount or 0), 2)
    if normalized_amount <= 0:
        raise ValueError("INVALID_AMOUNT")

    is_opening_balance = normalized_event in {"opening_receivable", "opening_payable"}
    is_outgoing = normalized_event in {"lend", "payment_out"}
    wallet: Optional[models.Wallet] = None
    if not is_opening_balance:
        if wallet_id is not None:
            wallet_stmt = select(models.Wallet).where(models.Wallet.id == wallet_id)
            if household_id:
                wallet_stmt = wallet_stmt.where(
                    or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == household_id)
                )
            else:
                wallet_stmt = wallet_stmt.where(models.Wallet.owner_user_id == user_id)
            wallet_result = await db.execute(wallet_stmt)
            wallet = wallet_result.scalars().first()
            if not wallet:
                raise ValueError("WALLET_NOT_FOUND")
        else:
            wallet = await _select_default_wallet_for_debt(db, user_id=user_id, household_id=household_id)
        if not wallet:
            raise ValueError("WALLET_NOT_FOUND")

    if is_outgoing and wallet is not None:
        wallet_balance = await _get_wallet_balance(db, wallet.id)
        if wallet_balance < normalized_amount:
            raise ValueError(f"INSUFFICIENT_BALANCE:{wallet.id}:{wallet_balance}")

    normalized_txn_date = txn_date or current_business_date()
    txn_note = (notes or f"Debt {final_counterparty_name}").strip()
    txn: Optional[models.Transaction] = None

    if not is_opening_balance:
        debt_out_category, debt_in_category = await ensure_internal_debt_categories(db, household_id)
        txn_type = "expense" if is_outgoing else "income"
        txn_category = debt_out_category if is_outgoing else debt_in_category
        reference_id = models.generate_txn_reference(normalized_txn_date)

        txn = models.Transaction(
            wallet_id=wallet.id,
            user_id=user_id,
            reference_id=reference_id,
            type=txn_type,
            txn_date=normalized_txn_date,
            vendor_or_source=f"Debt {final_counterparty_name}"[:50],
            amount=normalized_amount,
            category_id=txn_category.id if txn_category else None,
            notes=txn_note[:255] if txn_note else None,
            source_channel=source_channel,
        )
        db.add(txn)
        await db.flush()

    debt = models.Debt(
        user_id=user_id,
        household_id=household_id,
        wallet_id=wallet.id if wallet else None,
        transaction_id=txn.id if txn else None,
        debtor_id=debtor.id,
        counterparty_name=final_counterparty_name,
        counterparty_key=debtor.key,
        event_type=normalized_event,
        amount=normalized_amount,
        txn_date=normalized_txn_date,
        notes=txn_note[:255] if txn_note else None,
        source_channel=source_channel,
    )
    db.add(debt)
    await db.commit()
    if txn:
        await db.refresh(txn)
    await db.refresh(debt)
    return debt, txn


async def upsert_user_location_context(
    db: AsyncSession,
    *,
    user_id: str,
    latitude: float,
    longitude: float,
    location_name: Optional[str] = None,
    ttl_minutes: Optional[int] = None,
) -> models.UserLocationContext:
    lat = float(latitude)
    lon = float(longitude)
    if lat < -90 or lat > 90:
        raise ValueError("INVALID_LATITUDE")
    if lon < -180 or lon > 180:
        raise ValueError("INVALID_LONGITUDE")

    ttl = max(5, int(ttl_minutes or LOCATION_CONTEXT_TTL_MINUTES))
    expires_at = datetime.utcnow() + timedelta(minutes=ttl)
    cleaned_name = await location_service.resolve_short_location_name(
        latitude=lat,
        longitude=lon,
        location_name=location_name,
    )

    existing_result = await db.execute(
        select(models.UserLocationContext).where(models.UserLocationContext.user_id == user_id)
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        existing.latitude = lat
        existing.longitude = lon
        existing.location_name = cleaned_name
        existing.expires_at = expires_at
        existing.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing)
        return existing

    ctx = models.UserLocationContext(
        user_id=user_id,
        latitude=lat,
        longitude=lon,
        location_name=cleaned_name,
        expires_at=expires_at,
    )
    db.add(ctx)
    await db.commit()
    await db.refresh(ctx)
    return ctx


async def get_user_location_context(
    db: AsyncSession,
    *,
    user_id: str,
) -> Optional[models.UserLocationContext]:
    result = await db.execute(
        select(models.UserLocationContext).where(models.UserLocationContext.user_id == user_id)
    )
    ctx = result.scalar_one_or_none()
    if not ctx:
        return None

    if ctx.expires_at <= datetime.utcnow():
        await db.delete(ctx)
        await db.commit()
        return None
    return ctx


async def clear_user_location_context(
    db: AsyncSession,
    *,
    user_id: str,
) -> bool:
    result = await db.execute(
        select(models.UserLocationContext).where(models.UserLocationContext.user_id == user_id)
    )
    ctx = result.scalar_one_or_none()
    if not ctx:
        return False
    await db.delete(ctx)
    await db.commit()
    return True


async def _process_budget_command(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: int,
    text: str,
    language: str,
) -> str:
    if not WHATSAPP_BUDGET_COMMANDS_ENABLED:
        return (
            "Budget commands are temporarily disabled."
            if language == "EN"
            else "Command budget dimatikan sementara waktu."
        )

    normalized = normalize_message_text(text)
    parts = normalized.strip().split(maxsplit=1)
    command_body = parts[1].strip() if len(parts) > 1 else ""
    if not command_body:
        return _budget_help_message(language)

    month_token, command_body, invalid_month_token = budget_service.extract_month_token(command_body)
    if invalid_month_token:
        return (
            "Format bulan tidak sah. Guna `@YYYY-MM`, contoh `@2026-04`."
            if language != "EN"
            else "Invalid month format. Use `@YYYY-MM`, e.g. `@2026-04`."
        )
    user_row = (await db.execute(select(models.User.cycle_start_day).where(models.User.id == user_id))).scalar_one_or_none()
    start_day = int(user_row or 1)
    month_key = month_token or budget_service.normalize_month_key(None, start_day)
    lowered_body = command_body.lower()

    if lowered_body in {"list"}:
        items = await budget_service.get_budget_items(
            db,
            user_id=user_id,
            household_id=household_id,
            month_key=month_key,
            start_day=start_day,
        )
        active_items = [item for item in items if item["budget_amount"] > 0]
        if not active_items:
            return (
                f"No budget set for {month_key}."
                if language == "EN"
                else f"Tiada budget ditetapkan untuk {month_key}."
            )
        lines = [f"📒 *Budget {month_key}*"]
        for i, item in enumerate(active_items):
            symbol = "├─" if i < len(active_items) - 1 else "└─"
            lines.append(
                f"{symbol} {item['category_name']}: RM {item['used_amount']:,.2f} / RM {item['budget_amount']:,.2f} ({item['progress_percent']:.0f}%)"
            )
        return "\n".join(lines)

    if lowered_body in {"summary", "ringkasan"}:
        summary = await budget_service.get_budget_summary(
            db,
            user_id=user_id,
            household_id=household_id,
            month_key=month_key,
            start_day=start_day,
        )
        if language == "EN":
            return (
                f"📊 *Budget Summary {month_key}*\n"
                f"├─ Total Budget: *RM {summary['total_budget']:,.2f}*\n"
                f"├─ Total Used: *RM {summary['total_used']:,.2f}*\n"
                f"├─ Remaining: *RM {summary['remaining_amount']:,.2f}*\n"
                f"└─ Alerts: *{summary['alert_count']}* (Over: {summary['over_budget_count']})"
            )
        return (
            f"📊 *Ringkasan Budget {month_key}*\n"
            f"├─ Jumlah Budget: *RM {summary['total_budget']:,.2f}*\n"
            f"├─ Jumlah Digunakan: *RM {summary['total_used']:,.2f}*\n"
            f"├─ Baki: *RM {summary['remaining_amount']:,.2f}*\n"
            f"└─ Amaran: *{summary['alert_count']}* (Lebih: {summary['over_budget_count']})"
        )

    if lowered_body.startswith("set "):
        payload = command_body[4:].strip()
        amount = extract_amount(payload)
        if amount is None or amount <= 0:
            return (
                "Invalid amount. Example: `budget set makanan 600`."
                if language == "EN"
                else "Jumlah tidak sah. Contoh: `budget set makanan 600`."
            )
        category_text = _remove_last_amount_token(payload)
        if not category_text:
            return _budget_help_message(language)

        category, suggestions = await budget_service.find_expense_category_by_name(
            db,
            household_id=household_id,
            raw_name=category_text,
        )
        if not category:
            return _budget_category_not_found_message(language, category_text, suggestions)

        existing_result = await db.execute(
            select(models.CategoryBudget).where(
                models.CategoryBudget.household_id == household_id,
                models.CategoryBudget.category_id == category.id,
                models.CategoryBudget.month_key == month_key,
            )
        )
        existing_budget = existing_result.scalars().first()
        if existing_budget:
            existing_budget.budget_amount = round(float(amount), 2)
        else:
            db.add(
                models.CategoryBudget(
                    household_id=household_id,
                    category_id=category.id,
                    month_key=month_key,
                    budget_amount=round(float(amount), 2),
                )
            )
        await db.commit()

        items = await budget_service.get_budget_items(
            db,
            user_id=user_id,
            household_id=household_id,
            month_key=month_key,
            start_day=start_day,
        )
        item = next((x for x in items if x["category_id"] == int(category.id)), None)
        if not item:
            return "Budget saved." if language == "EN" else "Budget berjaya disimpan."
        if language == "EN":
            return (
                f"✅ Budget set for *{item['category_name']}* ({month_key})\n"
                f"├─ Budget: *RM {item['budget_amount']:,.2f}*\n"
                f"├─ Used: *RM {item['used_amount']:,.2f}*\n"
                f"└─ Remaining: *RM {item['remaining_amount']:,.2f}*"
            )
        return (
            f"✅ Budget diset untuk *{item['category_name']}* ({month_key})\n"
            f"├─ Budget: *RM {item['budget_amount']:,.2f}*\n"
            f"├─ Digunakan: *RM {item['used_amount']:,.2f}*\n"
            f"└─ Baki: *RM {item['remaining_amount']:,.2f}*"
        )

    if lowered_body.startswith("baki "):
        category_text = command_body[5:].strip()
        category, suggestions = await budget_service.find_expense_category_by_name(
            db,
            household_id=household_id,
            raw_name=category_text,
        )
        if not category:
            return _budget_category_not_found_message(language, category_text, suggestions)
        items = await budget_service.get_budget_items(
            db,
            user_id=user_id,
            household_id=household_id,
            month_key=month_key,
            start_day=start_day,
        )
        item = next((x for x in items if x["category_id"] == int(category.id)), None)
        if not item or item["budget_amount"] <= 0:
            return (
                f"No budget set for {category.name} ({month_key})."
                if language == "EN"
                else f"Tiada budget untuk {category.name} ({month_key})."
            )
        if language == "EN":
            return (
                f"💡 *{item['category_name']}* ({month_key})\n"
                f"├─ Used: *RM {item['used_amount']:,.2f}*\n"
                f"├─ Budget: *RM {item['budget_amount']:,.2f}*\n"
                f"└─ Remaining: *RM {item['remaining_amount']:,.2f}*"
            )
        return (
            f"💡 *{item['category_name']}* ({month_key})\n"
            f"├─ Digunakan: *RM {item['used_amount']:,.2f}*\n"
            f"├─ Budget: *RM {item['budget_amount']:,.2f}*\n"
            f"└─ Baki: *RM {item['remaining_amount']:,.2f}*"
        )

    if lowered_body.startswith("delete ") or lowered_body.startswith("padam "):
        prefix_len = 7 if lowered_body.startswith("delete ") else 6
        category_text = command_body[prefix_len:].strip()
        category, suggestions = await budget_service.find_expense_category_by_name(
            db,
            household_id=household_id,
            raw_name=category_text,
        )
        if not category:
            return _budget_category_not_found_message(language, category_text, suggestions)

        budget_result = await db.execute(
            select(models.CategoryBudget).where(
                models.CategoryBudget.household_id == household_id,
                models.CategoryBudget.category_id == category.id,
                models.CategoryBudget.month_key == month_key,
            )
        )
        budget_row = budget_result.scalars().first()
        if not budget_row:
            return (
                f"No budget found for {category.name} ({month_key})."
                if language == "EN"
                else f"Tiada budget untuk {category.name} ({month_key})."
            )

        await db.execute(models.CategoryBudget.__table__.delete().where(models.CategoryBudget.id == budget_row.id))
        await db.commit()
        return (
            f"🗑️ Budget deleted for {category.name} ({month_key})."
            if language == "EN"
            else f"🗑️ Budget dipadam untuk {category.name} ({month_key})."
        )

    return _budget_help_message(language)


def get_corporate_canned_reply(text: str, language: str = "BM") -> str:
    normalized = normalize_message_text(text or "")
    is_en = language == "EN"

    def has(patterns: list[str]) -> bool:
        return any(pattern in normalized for pattern in patterns)

    if is_model_identity_query(text):
        return get_model_identity_reply(language)

    if has(["siapa", "who are you", "what is your name", "nama"]):
        if is_en:
            return "I am the official *Budget by DigitalPort AI Assistant*. I can help with transactions, wallets, budgets, summaries, receipts, and debt records."
        return "Saya ialah *Budget by DigitalPort AI Assistant*. Saya boleh bantu urus transaksi, wallet, budget, ringkasan, resit, dan rekod hutang."

    if has(["terima kasih", "thank you", "thanks", "tq", "thx"]):
        if is_en:
            return "You are welcome. I am ready to assist with any Budget by DigitalPort task."
        return "Sama-sama. Saya sedia membantu untuk sebarang urusan Budget by DigitalPort."

    if has(["hello", "hi", "halo", "hai", "salam", "assalamualaikum", "selamat pagi", "selamat petang", "selamat malam"]):
        if is_en:
            return "Hello. I am ready to assist. You can send a transaction, check `summary`, view `list`, or ask for Budget by DigitalPort guidance."
        return "Hai. Saya sedia membantu. Anda boleh hantar transaksi, semak `summary`, lihat `list`, atau minta panduan Budget by DigitalPort."

    if has(["ok", "okay", "baik", "noted", "faham", "alright"]):
        if is_en:
            return "Noted. Please send the next transaction or Budget by DigitalPort request when ready."
        return "Baik, maklumat diterima. Sila hantar transaksi atau permintaan Budget by DigitalPort seterusnya apabila sedia."

    if has(["bye", "goodbye", "jumpa lagi"]):
        if is_en:
            return "Thank you. I will be ready when you need to record or review your finances again."
        return "Terima kasih. Saya sedia membantu semula apabila anda mahu rekod atau semak kewangan."

    if is_en:
        return "I can help with Budget by DigitalPort tasks such as recording expenses, checking `summary`, viewing `list`, managing wallets, setting budgets, and reviewing debt records."
    return "Saya boleh bantu urusan Budget by DigitalPort seperti rekod belanja, semak `summary`, lihat `list`, urus wallet, set budget, dan semak rekod hutang."


def get_simulated_ai_reply(text: str, language: str = "BM") -> Optional[str]:
    negative_reply = get_negative_or_abusive_reply(text, language)
    if negative_reply:
        return negative_reply

    raw_text = (text or "").strip()
    lowered = raw_text.lower()
    if not lowered:
        return None

    responses_list = CHAT_AUTO_REPLIES.get(language, CHAT_AUTO_REPLIES.get("BM", []))
    matches = []

    for keywords, response in responses_list:
        matched_keyword = None
        current_group_max_len = -1

        for kw in keywords:
            kw_lowered = kw.lower()
            if len(kw_lowered) <= 4:
                if re.search(rf"\b{re.escape(kw_lowered)}\b", lowered):
                    if len(kw_lowered) > current_group_max_len:
                        current_group_max_len = len(kw_lowered)
                        matched_keyword = kw_lowered
            else:
                if kw_lowered in lowered:
                    if len(kw_lowered) > current_group_max_len:
                        current_group_max_len = len(kw_lowered)
                        matched_keyword = kw_lowered

        if matched_keyword:
            if isinstance(response, (list, tuple)):
                chosen_res = random.choice(response)
            else:
                chosen_res = response
            matches.append((current_group_max_len, chosen_res))

    if matches:
        matches.sort(key=lambda item: item[0], reverse=True)
        return matches[0][1]

    fallback_templates = INSTRUCTIONAL_FALLBACKS.get(language, INSTRUCTIONAL_FALLBACKS.get("BM", []))
    if fallback_templates:
        template = _select_deterministic_template(fallback_templates, normalize_message_text(raw_text) or raw_text)
        return template.format(text=raw_text)
    return None



NEGATIVE_TONE_PATTERNS = [
    "babi",
    "bangang",
    "bodoh",
    "bodo",
    "stupid",
    "dumb",
    "idiot",
    "bangsat",
    "sial",
    "celaka",
    "pukimak",
    "puki",
    "kimak",
    "lancau",
    "hanat",
    "bengap",
    "tak pandai",
    "tak bijak",
    "tak membantu",
    "tak guna",
    "tak neutral",
    "tak betul",
    "merepek",
    "menyampah",
    "benci",
    "hate you",
    "geram",
    "marah",
    "annoying",
    "useless",
    "trash",
    "worst",
]


def _contains_text_pattern(text: str, pattern: str) -> bool:
    if len(pattern) <= 4:
        return re.search(rf"\b{re.escape(pattern)}\b", text) is not None
    return pattern in text


def has_negative_or_abusive_tone(text: str) -> bool:
    normalized = normalize_message_text(text or "")
    if not normalized:
        return False
    return any(_contains_text_pattern(normalized, pattern) for pattern in NEGATIVE_TONE_PATTERNS)


def get_negative_or_abusive_reply(text: str, language: str) -> Optional[str]:
    normalized = normalize_message_text(text or "")
    if not normalized or not has_negative_or_abusive_tone(normalized):
        return None

    if language == "EN":
        templates = [
            "If my last reply felt off, we can make this simpler. Tell me the Budget by DigitalPort task directly and I will answer with the exact step or command, like `summary`, `list`, `lunch 12.50`, or `budget set food 600`.",
            "Fair point. If you tell me what you want to do in Budget by DigitalPort, I can reply more naturally and more precisely, for example wallet setup, budget setup, `summary`, or `list`.",
            "Let’s keep it practical. Send the real goal and I will guide it properly, such as `how do I set budget`, `how do I set wallet`, `summary`, or `transfer 50 from maybank to cash`.",
        ]
    else:
        templates = [
            "Kalau jawapan saya tadi rasa tak kena, kita buat cara lebih mudah. Beritahu terus tugas yang anda nak buat dalam Budget by DigitalPort dan saya akan bagi langkah atau command yang tepat seperti `summary`, `list`, `makan 12.50`, atau `budget set makanan 600`.",
            "Faham. Kalau anda beritahu tujuan sebenar, saya boleh jawab dengan lebih natural dan lebih praktikal. Contohnya `cara setup wallet`, `cara set budget`, `summary`, atau `transfer 50 dari maybank ke cash`.",
            "Kita buat terus ikut apa yang anda mahu. Beritahu apa yang anda nak buat dalam app ini dan saya akan bagi langkah atau command yang betul seperti `makan 12.50`, `summary`, `list`, atau `budget set makanan 600`.",
        ]
    return _select_deterministic_template(templates, normalized)


def get_basic_assistant_reply(text: str, language: str) -> Optional[str]:
    lowered = (text or "").strip().lower()
    if not lowered:
        return None

    t = BOT_TRANSLATIONS.get(language, BOT_TRANSLATIONS["BM"])
    pattern_map = [
        (["command apa", "komand apa", "apa command", "apa komand", "apa nak taip", "nak taip apa", "what command", "what should i type", "what do i type", "contoh command", "contoh komand", "bagi command", "format command", "syntax", "format taip"], t["basic_command_guide"]),
        (["cara setup", "cara set up", "macam mana nak mula", "cara mula", "baru daftar", "user baru", "first time", "getting started", "how do i start", "how to start", "setup app", "setup budget app", "budget apps", "setting app", "cara setting app"], t["basic_setup_start"]),
        (["setup budget", "set budget", "cara set budget", "macam mana set budget", "setting budget", "budget macam mana", "budget app", "tak tahu set budget"], t["basic_budget_setup"]),
        (["wallet", "dompet", "default wallet", "bot default"], t["basic_wallet_setup"]),
        (["cara guna", "macam mana guna", "how to use", "how do i use", "cara rekod", "record expense", "rekod belanja"], t["basic_how_to_use"]),
        (["summary apa", "apa itu summary", "what is summary", "ringkasan macam mana"], t["basic_summary"]),
        (["list apa", "apa itu list", "what is list", "rekod terbaru"], t["basic_list"]),
        (["budget", "bajet", "budget set", "budget summary", "budget list", "budget baki"], t["basic_budget"]),
        (["kategori", "category", "keyword"], t["basic_category"]),
        (["whatsapp", "qr", "pairing", "link account", "sambung whatsapp"], t["basic_whatsapp"]),
        (["bahasa", "language", "lang en", "lang bm"], t["basic_language"]),
        (["timezone", "zon masa", "time format", "format masa", "waktu"], t["basic_timezone"]),
        (["location", "lokasi", "map", "peta", "@here", "here", "mark location", "tanda lokasi", "lampir lokasi", "attach location", "reply location", "reply @here", "slide reply"], t["basic_location"]),
        (["theme", "tema", "dark mode", "light mode"], t["basic_theme"]),
        (["export", "download csv", "muat turun", "eksport"], t["basic_export"]),
        (["baki", "balance"], t["basic_balance"]),
        (["reset password", "forgot password", "lupa kata laluan", "kata laluan"], t["basic_reset_password"]),
    ]

    for patterns, reply in pattern_map:
        if any(pattern in lowered for pattern in patterns):
            return reply

    return None


def is_command_help_query(text: str) -> bool:
    normalized = normalize_message_text(text or "")
    if not normalized:
        return False
    patterns = [
        "command apa",
        "komand apa",
        "apa command",
        "apa nak taip",
        "nak taip apa",
        "what command",
        "what should i type",
        "what do i type",
        "contoh command",
        "bagi command",
        "format command",
        "syntax",
    ]
    return any(pattern in normalized for pattern in patterns)


def is_general_product_help_query(text: str) -> bool:
    normalized = normalize_message_text(text or "")
    if not normalized:
        return False
    patterns = [
        "cara guna",
        "how to use",
        "macam mana guna",
        "macam mana nak mula",
        "cara mula",
        "setup",
        "set up",
        "budget macam mana",
        "cara set budget",
        "wallet macam mana",
        "default wallet",
        "sambung whatsapp",
        "how do i start",
        "getting started",
    ]
    return any(pattern in normalized for pattern in patterns)


def is_non_domain_casual_question(text: str) -> bool:
    normalized = normalize_message_text(text or "")
    if not normalized:
        return False
    if is_command_help_query(normalized) or is_general_product_help_query(normalized):
        return False

    domain_tokens = [
        "budget",
        "bajet",
        "wallet",
        "dompet",
        "summary",
        "list",
        "whatsapp",
        "portal",
        "kategori",
        "category",
        "transfer",
        "rekod",
        "record",
        "expense",
        "income",
        "gaji",
        "makan 12.50",
    ]
    if any(token in normalized for token in domain_tokens):
        return False

    casual_markers = [
        "apa",
        "siapa",
        "mana",
        "kenapa",
        "macam mana",
        "how",
        "what",
        "which",
        "why",
        "cantik",
        "best",
        "sedap",
        "menarik",
    ]
    return normalized.endswith("?") or any(marker in normalized for marker in casual_markers)


def get_general_casual_reply(text: str, language: str) -> Optional[str]:
    normalized = normalize_message_text(text or "")
    if not normalized or not is_non_domain_casual_question(normalized):
        return None

    if any(token in normalized for token in ["bangunan", "building", "architecture", "arkitektur"]):
        if language == "EN":
            return "Depends on taste, but buildings with strong identity, clean lines, and good lighting usually look beautiful. I personally think modern-minimal and classic heritage styles both stand out."
        return "Ikut citarasa juga, tapi bangunan yang ada identiti, bentuk kemas, dan pencahayaan elok biasanya nampak cantik. Pada saya gaya moden minimalis atau klasik warisan memang selalu nampak menarik."

    if any(token in normalized for token in ["makan", "food", "sedap"]):
        if language == "EN":
            return "That really depends on taste, but comfort food usually wins. If you want, tell me the category and I’ll answer more directly."
        return "Itu ikut citarasa juga, tapi makanan yang simple dan comfort food selalunya paling mudah orang suka. Kalau anda mahu, sebut topik lebih spesifik sikit dan saya jawab terus."

    if language == "EN":
        return "That depends on personal taste, but I’d say the ones with clear character and a nice overall feel usually stand out most."
    return "Itu ikut citarasa juga, tapi selalunya benda yang ada karakter dan nampak seimbang memang orang mudah rasa cantik."


def is_useful_command_answer(reply_text: str) -> bool:
    lowered = (reply_text or "").lower()
    useful_markers = [
        "summary",
        "list",
        "budget set",
        "transfer",
        "makan 12.50",
        "lunch 12.50",
        "gaji 3500",
        "salary 3500",
        "wallet",
        "budget",
        "taip",
        "guna",
        "contoh",
        "settings",
        "categories",
        "wallets",
        "`",
    ]
    return any(marker in lowered for marker in useful_markers)


def is_useful_product_help_answer(reply_text: str) -> bool:
    lowered = (reply_text or "").lower()
    useful_markers = [
        "wallet",
        "dompet",
        "budget",
        "bajet",
        "whatsapp",
        "summary",
        "list",
        "command",
        "portal",
        "telefon",
        "phone",
        "categories",
        "kategori",
        "settings",
        "wallets",
        "langkah",
        "step",
        "mula",
        "taip",
        "guna",
        "`",
    ]
    return any(marker in lowered for marker in useful_markers)


def _select_deterministic_template(templates: list[str], seed_text: str) -> str:
    if not templates:
        return ""
    digest = hashlib.sha256((seed_text or "").encode("utf-8")).hexdigest()
    index = int(digest[:8], 16) % len(templates)
    return templates[index]


def get_contextual_domain_fallback(text: str, language: str) -> str:
    normalized = normalize_message_text(text or "")
    t = BOT_TRANSLATIONS.get(language, BOT_TRANSLATIONS["BM"])

    if any(token in normalized for token in ["telefon", "phone", "mobile", "android", "iphone", "ios"]):
        return t["basic_mobile_usage"]
    if any(token in normalized for token in ["wallet", "dompet", "cash", "maybank"]):
        return t["basic_wallet_setup"]
    if any(token in normalized for token in ["budget", "bajet"]):
        return t["basic_budget_setup"]
    if any(token in normalized for token in ["location", "lokasi", "map", "peta", "@here", "mark location", "tanda lokasi", "lampir lokasi", "attach location"]):
        return t["basic_location"]
    if any(token in normalized for token in ["whatsapp", "pairing", "qr"]):
        return t["basic_whatsapp"]
    if any(token in normalized for token in ["mula", "start", "setup", "set up", "baru", "first time"]):
        return t["basic_setup_start"]

    if language == "EN":
        templates = [
            "I can help with Budget by DigitalPort in a more practical way. If you're not sure where to begin, you can try one of these right away: `lunch 12.50`, `summary`, `list`, or `budget set food 600`. If you want, tell me which part you want first and I’ll suggest the exact command.",
            "No worries, we can do this step by step. For most people, the easiest order is wallet first, then categories, then budget. The commands people usually try first are `lunch 12.50`, `summary`, and `list`.",
            "I’m still focused on Budget by DigitalPort here, and I can guide you like a setup buddy instead of just listing features. If you want, ask me about wallet setup, budget setup, WhatsApp setup, or I can simply tell you what command to type first.",
        ]
    else:
        templates = [
            "Tak apa, saya boleh bantu hal Budget by DigitalPort dengan cara yang lebih mudah difahami. Kalau anda tak pasti nak mula, anda boleh terus cuba command ini dulu: `makan 12.50`, `summary`, `list`, atau `budget set makanan 600`.",
            "Kalau anda rasa banyak sangat benda nak setup, kita boleh buat satu-satu. Selalunya orang mula dengan wallet dulu, kemudian budget. Lepas itu terus test dengan `makan 12.50`, kemudian semak `summary` atau `list`.",
            "Saya boleh guide anda langkah demi langkah macam orang sebenar bantu setup. Beritahu saja anda nak mula dengan wallet, budget, WhatsApp, atau saya terus bagi command pertama yang patut anda cuba.",
        ]
    return _select_deterministic_template(templates, normalized or text)


def _is_out_of_scope_question(text: str) -> bool:
    """Detect questions that are clearly OUTSIDE the MyPeribadi budgeting domain.
    When True, the bot should stay silent (no reply at all) instead of answering
    like a generic AI assistant or trying to steer back."""
    if not text:
        return False
    normalized = normalize_message_text(text or "").strip().lower()
    if not normalized:
        return False

    # Known MyPeribadi commands / in-domain objects. If the user asks "how to use <this>",
    # only these count as in-scope; anything else is out of scope.
    domain_terms = {
        "summary", "list", "checkwallet", "semak", "wallet", "dompet", "budget", "bajet",
        "lend", "borrow", "pay", "balance", "debt", "hutang", "loanx", "loan", "subx",
        "subskripsi", "subscription", "transfer", "pindah", "lang", "help", "bantuan",
        "makan", "belanja", "expense", "income", "pendapatan", "rekod", "record",
        "transaksi", "transaction", "receipt", "resit", "kategori", "category", "tag",
        "saving", "simpanan", "gaji", "salary", "duit", "wang", "money", "cash",
        "maybank", "tng", "tabung", "location", "lokasi", "peta", "map", "media",
        "gambar", "photo", "photo", "ocr", "scan", "whatsapp", "telegram", "bot",
    }

    # Phrases that introduce a "how to use X" question.
    how_to_patterns = [
        r"(?:macam\s*(?:mana|mne|mane)\s*nak\s*(?:guna|pakai)|cara\s*(?:nak\s*)?(?:guna|pakai)|how\s+(?:to|do\s+i)\s*(?:use|do)|guna\s*macam\s*mana|pakai\s*macam\s*mana)\s*([a-z0-9 ]+)",
    ]
    for pattern in how_to_patterns:
        m = re.search(pattern, normalized)
        if m:
            obj = m.group(1).strip()
            if not obj:
                return False  # vague "macam mana nak guna" -> handled by command-list short-circuit
            obj_first = obj.split()[0] if obj else ""
            # If the object starts with a domain term, keep it in scope (LLM answers).
            if obj_first in domain_terms or obj in domain_terms:
                return False
            # Single generic filler words after "how to use" — not a real object.
            if obj_first in {"a", "an", "the", "ni", "tu", "ini", "itu", "saya", "anda", "aku", "awak", "ia", "nya"}:
                return False
            return True  # "how to use git/python/..." -> out of scope, stay silent

    # Clear out-of-scope topic keywords (programming, cooking, politics, games, etc.)
    out_of_scope_keywords = [
        "git", "python", "docker", "postman", "node", "react", "javascript", "typescript",
        "vscode", "visual studio", "terminal", "command prompt", "linux", "ubuntu", "windows",
        "macos", "github", "api", "library", "framework", "install", "coding", "program",
        "programming", "masak", "resepi", "recipe", "memasak", "politik", "politics", "sukan",
        "sport", "game", "permainan", "bola", "sepak", "movie", "filem", "drama", "lagu",
        "musik", "musik", "fesyen", "fashion", "cantik", "kecantikan", "kereta", "motor",
    ]
    if any(kw in normalized for kw in out_of_scope_keywords):
        return True

    return False

def _contains_keyword_score(source_text: str, keyword: str) -> Optional[int]:
    index = source_text.find(keyword)
    if index < 0:
        return None

    end_index = index + len(keyword)
    before_char = source_text[index - 1] if index > 0 else " "
    after_char = source_text[end_index] if end_index < len(source_text) else " "
    boundary_before = not before_char.isalnum()
    boundary_after = not after_char.isalnum()

    # Only accept a substring match when it sits on a token boundary (start or
    # end of a word). A match buried in the middle of a word (e.g. keyword "ai"
    # inside "main") is a false positive and must be rejected so that unrelated
    # categories are not pulled in from every keyword-contain match.
    if not boundary_before and not boundary_after:
        return None

    # An explicit standalone token (the keyword is a whole word in the text) is
    # the strongest signal: "AI" and "TNG" called out by name should win over
    # any longer keyword that only shares a prefix (e.g. "best"). Give it a
    # dominant score so short brand keywords are not out-ranked by word length.
    if boundary_before and boundary_after:
        return 10000 + len(keyword) * 100

    # Otherwise the keyword is a prefix/suffix of a longer word (one side open).
    score = len(keyword) * 100 + 80

    # Small tie-breakers: starts/ends with keyword.
    if index == 0:
        score += 25
    if end_index == len(source_text):
        score += 25

    return score


async def get_category_suggestions_by_keywords(
    db: AsyncSession,
    text: str,
    household_id: Optional[int] = None,
    preferred_kind: Optional[str] = None,
    limit: int = 3,
) -> list[models.Category]:
    if not household_id:
        return []

    stmt = (
        select(models.CategoryKeyword, models.Category)
        .join(models.Category)
        .where(
            models.CategoryKeyword.is_active == True,
            models.Category.is_internal == False,
            models.Category.household_id == household_id,
        )
    )
    if preferred_kind:
        stmt = stmt.where(models.Category.kind == preferred_kind)

    result = await db.execute(stmt)
    rows = result.all()
    normalized_text = normalize_message_text(text or "")
    if not normalized_text:
        return []

    source_words = [word for word in re.split(r"[^a-z0-9]+", normalized_text.lower()) if len(word) >= 3]
    if not source_words:
        return []

    best_by_category: dict[int, tuple[int, models.Category]] = {}
    for kw, category in rows:
        kw_text = normalize_message_text((kw.keyword or "").strip().lower())
        if not kw_text:
            continue
        kw_words = [word for word in re.split(r"[^a-z0-9]+", kw_text) if len(word) >= 3]
        score = 0
        for source_word in source_words:
            for kw_word in kw_words or [kw_text]:
                if source_word == kw_word:
                    score = max(score, 500 + len(kw_word) * 10)
                elif source_word.startswith(kw_word) or kw_word.startswith(source_word):
                    # Only accept prefix overlap (e.g. "tng" / "touchng") so that a
                    # keyword buried in the middle of a word ("ai" inside "main")
                    # is not treated as a match for every related category.
                    score = max(score, 180 + min(len(source_word), len(kw_word)) * 8)
                elif source_word[:4] == kw_word[:4] and len(source_word) >= 4 and len(kw_word) >= 4:
                    score = max(score, 120 + min(len(source_word), len(kw_word)) * 6)
        if score <= 0:
            continue
        current = best_by_category.get(int(category.id))
        if current is None or score > current[0]:
            best_by_category[int(category.id)] = (score, category)

    ranked = sorted(best_by_category.values(), key=lambda item: (-item[0], item[1].name.lower()))
    if ranked:
        return [category for _, category in ranked[:limit]]

    fallback_stmt = (
        select(models.Category)
        .where(
            models.Category.household_id == household_id,
            models.Category.is_internal == False,
        )
        .order_by(models.Category.is_default.asc(), models.Category.name.asc(), models.Category.id.asc())
    )
    if preferred_kind:
        fallback_stmt = fallback_stmt.where(models.Category.kind == preferred_kind)
    fallback_result = await db.execute(fallback_stmt)
    default_names = {"lain", "lain-lain", "other", "others", "miscellaneous"}
    fallback_categories = [
        category for category in fallback_result.scalars().all()
        if (category.name or "").strip().lower() not in default_names
    ]
    # OCR appends an exact portal category name. Put that choice first, then
    # nearby names; never return the previous arbitrary alphabetical first three.
    normalized = normalized_text.lower()
    exact = [category for category in fallback_categories if normalize_message_text(category.name).lower() in normalized]
    rest = [category for category in fallback_categories if category not in exact]
    return (exact + rest)[:limit]


async def get_category_by_keywords(db: AsyncSession, text: str, household_id: Optional[int] = None, preferred_kind: Optional[str] = None) -> Optional[models.Category]:
    # Legacy compatibility:
    # category mappings are still internally scoped by household_id even though
    # the public "Household" feature is no longer surfaced to end users.
    stmt = (
        select(models.CategoryKeyword, models.Category)
        .join(models.Category)
        .where(
            models.CategoryKeyword.is_active == True,
            models.Category.is_internal == False,
        )
    )
    if household_id:
        stmt = stmt.where(models.Category.household_id == household_id)
    else:
        # No scope key means we avoid matching to prevent cross-user leakage.
        return None
        
    result = await db.execute(stmt)
    rows = result.all()  # list of (keyword_obj, category_obj)
    normalized_text = (text or "").strip().lower()
    preferred_kind_norm = (preferred_kind or "").strip().lower()

    def _match_category(candidate_rows, search_text: str) -> Optional[models.Category]:
        best: Optional[tuple[int, int, int, int, models.Category]] = None
        for kw, category in candidate_rows:
            kw_text = (kw.keyword or "").strip().lower()
            if not kw_text:
                continue

            if kw.match_type == "exact":
                if kw_text != search_text:
                    continue
                base_score = 200000 + len(kw_text) * 100
            else:  # contains
                contains_score = _contains_keyword_score(search_text, kw_text)
                if contains_score is None:
                    continue
                base_score = contains_score

            preferred_bonus = 75 if preferred_kind_norm and category.kind == preferred_kind_norm else 0
            exact_bonus = 1 if kw.match_type == "exact" else 0
            candidate = (
                base_score + preferred_bonus,
                exact_bonus,
                len(kw_text),
                -int(kw.id or 0),  # deterministic tie-breaker
                category,
            )

            if best is None or candidate[:-1] > best[:-1]:
                best = candidate

        return best[-1] if best else None

    # Leading-word rule: the user types the category keyword first, then the rest
    # of the message becomes the note (e.g. "makan nasi ayam tng" -> category Makan,
    # note "nasi ayam tng"). Match the very first word as the category keyword and
    # return it immediately if found; only fall back to scanning the whole text.
    first_word_match = re.match(r"[a-z0-9]+", normalized_text)
    if first_word_match:
        leading = _match_category(rows, first_word_match.group(0))
        if leading is not None:
            return leading
        # Fall back to matching the leading word against the category name itself
        # (e.g. a category literally named "Makan") even when no keyword is set.
        name_match = await db.execute(
            select(models.Category).where(
                models.Category.is_internal == False,
                models.Category.household_id == household_id,
                func.lower(models.Category.name) == first_word_match.group(0),
            )
        )
        leading_by_name = name_match.scalars().first()
        if leading_by_name is not None:
            return leading_by_name

    return _match_category(rows, normalized_text)

async def ensure_standard_categories(db: AsyncSession, user_id: str):
    # Legacy compatibility bootstrap:
    # categories and budgets still require an internal scope key backed by the
    # old household tables, so we keep seeding that structure quietly.
    u_res = await db.execute(
        select(models.User)
        .where(models.User.id == user_id)
        .with_for_update()
    )
    user = u_res.scalar_one_or_none()
    if not user: return None

    household_id = user.default_household_id

    if not household_id:
        new_household = models.Household(
            name=f"Rumah {user.name}",
            owner_user_id=user.id
        )
        db.add(new_household)
        await db.flush()
        household_id = new_household.id
        user.default_household_id = household_id

    member_res = await db.execute(
        select(models.HouseholdMember).where(
            models.HouseholdMember.household_id == household_id,
            models.HouseholdMember.user_id == user.id,
        )
    )
    member = member_res.scalar_one_or_none()
    if not member:
        db.add(models.HouseholdMember(
            household_id=household_id,
            user_id=user.id,
            role="owner"
        ))
        await db.flush()

    # 3. Ensure internal plumbing categories are always present.
    await ensure_internal_transfer_category(db, household_id)
    await ensure_internal_debt_categories(db, household_id)
    await ensure_monthly_salary_category(db, household_id)

    res = await db.execute(select(models.Category).where(models.Category.household_id == household_id))
    existing = res.scalars().all()

    # New users: do not seed user-facing categories until onboarding is completed
    # (user chooses auto BM / auto EN / manual).
    if not user.onboarding_done:
        await db.flush()
        return household_id

    category_language = (user.category_language or "bm").strip().lower()
    if category_language == "manual":
        # Manual mode: no auto categories; only internal plumbing categories.
        await db.flush()
        return household_id

    existing_names = {c.name for c in existing}
    seed_list = STANDARD_CATEGORIES_EN if category_language == "en" else STANDARD_CATEGORIES
    if all(cat_data["name"] in existing_names for cat_data in seed_list):
        await db.flush()
        return household_id

    for cat_data in seed_list:
        exists = any(c.name == cat_data["name"] for c in existing)
        if not exists:
            new_cat = models.Category(
                name=cat_data["name"],
                icon_name=cat_data.get("icon_name"),
                kind=cat_data["kind"],
                household_id=household_id,
                is_default=(cat_data["name"] == "Lain-lain" or cat_data["name"] == "Pendapatan")
            )
            db.add(new_cat)
            await db.flush()
            
            for kw_text in cat_data["keywords"]:
                new_kw = models.CategoryKeyword(
                    category_id=new_cat.id,
                    keyword=kw_text,
                    match_type="contains",
                    is_active=True
                )
                db.add(new_kw)
    await ensure_internal_transfer_category(db, household_id)
    await ensure_internal_debt_categories(db, household_id)
    await ensure_monthly_salary_category(db, household_id)
    await db.flush()
    return household_id


async def ensure_internal_transfer_category(
    db: AsyncSession,
    household_id: Optional[int],
) -> Optional[models.Category]:
    if not household_id:
        return None

    result = await db.execute(
        select(models.Category).where(
            models.Category.household_id == household_id,
            or_(
                models.Category.system_code == INTERNAL_TRANSFER_CATEGORY_CODE,
                models.Category.name == INTERNAL_TRANSFER_CATEGORY_NAME,
            ),
        )
        .order_by(models.Category.id.asc())
        .limit(1)
    )
    category = result.scalar_one_or_none()
    if category:
        category.name = INTERNAL_TRANSFER_CATEGORY_NAME
        category.icon_name = category.icon_name or "wallet"
        category.is_internal = True
        category.system_code = INTERNAL_TRANSFER_CATEGORY_CODE
        category.is_default = False
        await db.flush()
        return category

    category = models.Category(
        name=INTERNAL_TRANSFER_CATEGORY_NAME,
        icon_name="wallet",
        kind="expense",
        household_id=household_id,
        is_default=False,
        is_internal=True,
        system_code=INTERNAL_TRANSFER_CATEGORY_CODE,
    )
    db.add(category)
    await db.flush()
    return category

async def ensure_monthly_salary_category(
    db: AsyncSession,
    household_id: Optional[int],
) -> Optional[models.Category]:
    if not household_id:
        return None

    result = await db.execute(
        select(models.Category).where(
            models.Category.household_id == household_id,
            models.Category.system_code == MONTHLY_SALARY_CATEGORY_CODE,
        ).limit(1)
    )
    category = result.scalar_one_or_none()
    if not category:
        category = models.Category(
            name=MONTHLY_SALARY_CATEGORY_NAME,
            icon_name="banknote",
            kind="income",
            household_id=household_id,
            is_default=False,
            is_internal=False,
            system_code=MONTHLY_SALARY_CATEGORY_CODE,
        )
        db.add(category)
        await db.flush()

    # Seed locked keywords (Mgaji / Msalary only). Do not add anything else.
    existing_res = await db.execute(
        select(models.CategoryKeyword).where(models.CategoryKeyword.category_id == category.id)
    )
    existing = {kw.keyword.lower(): kw for kw in existing_res.scalars().all()}
    for kw_text in MONTHLY_SALARY_KEYWORDS:
        if kw_text.lower() not in existing:
            db.add(models.CategoryKeyword(
                category_id=category.id,
                keyword=kw_text,
                match_type="contains",
                is_active=True,
            ))
    await db.flush()
    return category

async def get_default_category(
    db: AsyncSession,
    kind: str,
    *,
    household_id: Optional[int] = None,
) -> Optional[models.Category]:
    # Always scope fallback category to the user's legacy scope key to prevent
    # cross-tenant leakage.
    if not household_id:
        return None

    base_stmt = select(models.Category).where(
        models.Category.kind == kind,
        models.Category.household_id == household_id,
        models.Category.is_internal == False,
    )

    # 1. Try to find is_default category for this kind and scope
    res = await db.execute(
        base_stmt.where(models.Category.is_default == True).limit(1)
    )
    cat = res.scalars().first()
    if cat: return cat
    
    # 2. Try to find by common names if no is_default=True is set
    default_names = {"lain", "lain-lain", "others", "miscellaneous", "pendapatan", "salary", "bonus"}
    res = await db.execute(
        base_stmt.where(func.lower(models.Category.name).in_(default_names))
        .limit(1)
    )
    cat = res.scalars().first()
    if cat: return cat
    
    # 3. Last fallback: pick the first one for this kind in the same scope
    res = await db.execute(base_stmt.limit(1))
    return res.scalars().first()


async def ensure_personal_wallet(db: AsyncSession, user_id: str) -> models.Wallet:
    user = await db.get(models.User, user_id)
    stmt = select(models.Wallet).where(models.Wallet.owner_user_id == user_id)
    if user and user.default_household_id:
        stmt = select(models.Wallet).where(
            or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == user.default_household_id)
        )
    wallet_result = await db.execute(
        stmt.order_by(models.Wallet.is_bot_default.desc(), models.Wallet.created_at.asc(), models.Wallet.id.asc()).limit(1)
    )
    wallet = wallet_result.scalar_one_or_none()
    if wallet:
        return wallet

    try:
        wallet = models.Wallet(
            owner_user_id=user_id,
            name="Cash",
            type="personal",
            currency="MYR",
            status="active",
        )
        db.add(wallet)
        await db.flush()
    except Exception:
        # Race: another request created it first — return the existing wallet.
        await db.rollback()
        existing = (await db.execute(stmt.order_by(models.Wallet.is_bot_default.desc(), models.Wallet.created_at.asc(), models.Wallet.id.asc()).limit(1))).scalar_one_or_none()
        return existing
    await db.commit()
    await db.refresh(wallet)
    return wallet

AMOUNT_PATTERN = re.compile(r"(?:^|\s|[Rr][Mm])\s?(\d+(?:\.\d{1,2})?)(?![A-Za-z])\b")


def extract_amount(text: str) -> Optional[float]:
    # Require space/start/RM before number, and reject numbers attached to letters like `7e`.
    match = AMOUNT_PATTERN.search(text)
    if match:
        return float(match.group(1))
    return None


def parse_one_line_item_transaction(text: str) -> Optional[dict[str, Any]]:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if not cleaned:
        return None

    qty_match = re.match(
        r"^(.+?)\s+(\d+(?:\.\d{1,2})?)\s*(?:x|×|@)\s*(?:rm\s*)?(\d+(?:\.\d{1,2})?)(?:\s+(.+))?$",
        cleaned,
        flags=re.IGNORECASE,
    )
    if not qty_match:
        return None

    title = qty_match.group(1).strip()
    quantity = round(float(qty_match.group(2)), 2)
    unit_price = round(float(qty_match.group(3)), 2)
    trailing_text = (qty_match.group(4) or "").strip()
    subtotal = round(quantity * unit_price, 2)

    if not title or quantity <= 0 or unit_price <= 0 or subtotal <= 0:
        return None

    return {
        "header": cleaned,
        "title": title,
        "trailing_text": trailing_text,
        "items": [{
            "sort_order": 0,
            "name": title[:190],
            "quantity": quantity,
            "unit_price": unit_price,
            "subtotal": subtotal,
        }],
        "total": subtotal,
    }


def parse_multi_item_transaction(text: str) -> Optional[dict[str, Any]]:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    if len(lines) < 2:
        return None

    first_line = re.sub(r"\s+", " ", lines[0]).strip()
    header_match = re.match(r"^(?:bd|items?)\s+(.+)$", first_line, flags=re.IGNORECASE)
    has_command_prefix = bool(header_match)
    header_text = re.sub(r"\s+", " ", header_match.group(1) if header_match else first_line).strip()
    if not header_text:
        return None

    # Multiline item mode without an explicit command needs at least two parsed item rows
    # to avoid turning casual two-line notes into transactions.
    header_prefix = header_text.split()[0].lower()
    items: list[dict[str, Any]] = []
    total = 0.0

    for line in lines[1:]:
        cleaned = re.sub(r"\s+", " ", line).strip()
        qty_match = re.match(
            r"^(.+?)\s+(\d+(?:\.\d{1,2})?)\s*(?:x|×|@)\s*(?:rm\s*)?(\d+(?:\.\d{1,2})?)$",
            cleaned,
            flags=re.IGNORECASE,
        )
        amount_match = None if qty_match else re.match(
            r"^(.+?)\s+(?:rm\s*)?(\d+(?:\.\d{1,2})?)$",
            cleaned,
            flags=re.IGNORECASE,
        )
        if qty_match:
            raw_name = qty_match.group(1).strip()
            quantity = round(float(qty_match.group(2)), 2)
            unit_price = round(float(qty_match.group(3)), 2)
        elif amount_match:
            raw_name = amount_match.group(1).strip()
            quantity = 1.0
            unit_price = round(float(amount_match.group(2)), 2)
        else:
            continue

        subtotal = round(quantity * unit_price, 2)
        item_name = re.sub(rf"^{re.escape(header_prefix)}\s+", "", raw_name, flags=re.IGNORECASE).strip()
        item_name = item_name or raw_name
        if not item_name or quantity <= 0 or unit_price <= 0 or subtotal <= 0:
            continue

        items.append({
            "sort_order": len(items),
            "name": item_name[:190],
            "quantity": quantity,
            "unit_price": unit_price,
            "subtotal": subtotal,
        })
        total += subtotal

    if not items:
        return None

    return {
        "header": header_text,
        "title": header_prefix,
        "items": items,
        "total": round(total, 2),
    }

def extract_explicit_txn_date(text: str) -> Tuple[Optional[date], str, bool]:
    match = DATE_TOKEN_PATTERN.search(text or "")
    if not match:
        return None, text, False

    raw_token = match.group(1)
    try:
        parsed_date = datetime.strptime(raw_token, "%d%m%Y").date()
    except ValueError:
        return None, text, True

    cleaned_text = f"{text[:match.start()]} {text[match.end():]}".strip()
    cleaned_text = re.sub(r"\s{2,}", " ", cleaned_text)
    return parsed_date, cleaned_text, False

# Time tokens like 14:30, 2:30pm, pukul 2 petang, jam 8 pagi, 2 tengahari, 10 malam
TIME_TOKEN_PATTERN = re.compile(
    r"""(?i)(?:
        # 24h HH:MM
        # 24h HH:MM
        \b(\d{1,2}):(\d{2})\b |
        # 12h HH:MM am/pm
        \b(\d{1,2}):(\d{2})\s*(am|pm)\b |
        # pukul/jam + number + optional minutes + optional time-of-day
        \b(?:pukul|jam)\s+(\d{1,2})(?:\.(\d{2}))?\s*(pagi|tengahari|tengah hari|petang|malam|am|pm)?\b |
        # bare number + time-of-day (2 petang / 8 pagi / 10 malam / 3 tengahari)
        \b(\d{1,2})\s*(pagi|tengahari|tengah hari|petang|malam)\b
    )""",
    re.VERBOSE,
)

# Group map:
# g1,g2 = 24h hour,minute | g3,g4,g5 = 12h hour,minute,am|pm
# g6,g7,g8 = pukul/jam hour,minute,tod | g9,g10 = bare hour,tod

def extract_explicit_txn_time(text: str) -> Tuple[Optional[str], str]:
    """Extract an explicit time token from text. Returns (HH:MM or None, cleaned_text)."""
    raw = (text or "").strip()
    if not raw:
        return None, text

    match = TIME_TOKEN_PATTERN.search(raw)
    if not match:
        return None, text

    groups = match.groups()
    hh_24, mm_24 = groups[0], groups[1]
    hh_12, mm_12, ampm = groups[2], groups[3], groups[4]
    pukul_hour, pukul_min, pukul_tod = groups[5], groups[6], groups[7]
    bare_hour, bare_tod = groups[8], groups[9]

    hour: Optional[int] = None
    minute: int = 0

    if hh_24:
        hour = int(hh_24)
        minute = int(mm_24)
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return None, text
        formatted = f"{hour:02d}:{minute:02d}"
    elif hh_12:
        hour = int(hh_12)
        minute = int(mm_12)
        if not (1 <= hour <= 12 and 0 <= minute <= 59):
            return None, text
        if (ampm or "").lower() == "pm" and hour != 12:
            hour += 12
        elif (ampm or "").lower() == "am" and hour == 12:
            hour = 0
        formatted = f"{hour:02d}:{minute:02d}"
    elif pukul_hour:
        hour = int(pukul_hour)
        minute = int(pukul_min or 0)
        if not (1 <= hour <= 12 and 0 <= minute <= 59):
            return None, text
        tod = (pukul_tod or "").lower()
        if tod == "malam" and hour < 12:
            hour += 12
        elif tod in ("petang", "tengahari", "tengah hari") and hour < 12:
            hour += 12
        elif tod == "am" and hour == 12:
            hour = 0
        elif tod == "pm" and hour != 12:
            hour += 12
        formatted = f"{hour:02d}:{minute:02d}"
    elif bare_hour:
        hour = int(bare_hour)
        minute = 0
        if not (1 <= hour <= 12):
            return None, text
        tod = (bare_tod or "").lower()
        if tod == "malam" and hour < 12:
            hour += 12
        elif tod in ("petang", "tengahari", "tengah hari") and hour < 12:
            hour += 12
        formatted = f"{hour:02d}:{minute:02d}"
    else:
        return None, text

    cleaned_text = f"{raw[:match.start()]} {raw[match.end():]}".strip()
    cleaned_text = re.sub(r"\s{2,}", " ", cleaned_text)
    return formatted, cleaned_text

# Time-of-day words -> hour offset (12h to 24h)
_TIME_OF_DAY_OFFSET = {
    "pagi": 0,        # 1 pagi = 01:00
    "am": 0,
    "tengahari": 12,  # 12 tengahari = 12:00, 1 tengahari = 13:00
    "tengah hari": 12,
    "petang": 12,     # 1 petang = 13:00
    "pm": 12,
    "malam": 12,      # 8 malam = 20:00
}

# Group map:
# g1,g2 = 24h hour,minute | g3,g4,g5 = 12h hour,minute,am|pm
# g6,g7,g8 = pukul/jam hour,minute,tod | g9,g10 = bare hour,tod

def extract_explicit_txn_time(text: str) -> Tuple[Optional[str], str]:
    """Extract an explicit time token from text. Returns (HH:MM or None, cleaned_text)."""
    raw = (text or "").strip()
    if not raw:
        return None, text

    match = TIME_TOKEN_PATTERN.search(raw)
    if not match:
        return None, text

    groups = match.groups()
    hh_24, mm_24 = groups[0], groups[1]
    hh_12, mm_12, ampm = groups[2], groups[3], groups[4]
    pukul_hour, pukul_min, pukul_tod = groups[5], groups[6], groups[7]
    bare_hour, bare_tod = groups[8], groups[9]

    hour: Optional[int] = None
    minute: int = 0

    if hh_24:
        hour = int(hh_24)
        minute = int(mm_24)
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return None, text
        formatted = f"{hour:02d}:{minute:02d}"
    elif hh_12:
        hour = int(hh_12)
        minute = int(mm_12)
        if not (1 <= hour <= 12 and 0 <= minute <= 59):
            return None, text
        if (ampm or "").lower() == "pm" and hour != 12:
            hour += 12
        elif (ampm or "").lower() == "am" and hour == 12:
            hour = 0
        formatted = f"{hour:02d}:{minute:02d}"
    elif pukul_hour:
        hour = int(pukul_hour)
        minute = int(pukul_min or 0)
        if not (1 <= hour <= 12 and 0 <= minute <= 59):
            return None, text
        tod = (pukul_tod or "").lower()
        if tod == "malam" and hour < 12:
            hour += 12
        elif tod in ("petang", "tengahari", "tengah hari") and hour < 12:
            hour += 12
        elif tod == "am" and hour == 12:
            hour = 0
        elif tod == "pm" and hour != 12:
            hour += 12
        formatted = f"{hour:02d}:{minute:02d}"
    elif bare_hour:
        hour = int(bare_hour)
        minute = 0
        if not (1 <= hour <= 12):
            return None, text
        tod = (bare_tod or "").lower()
        if tod == "malam" and hour < 12:
            hour += 12
        elif tod in ("petang", "tengahari", "tengah hari") and hour < 12:
            hour += 12
        formatted = f"{hour:02d}:{minute:02d}"
    else:
        return None, text

    cleaned_text = f"{raw[:match.start()]} {raw[match.end():]}".strip()
    cleaned_text = re.sub(r"\s{2,}", " ", cleaned_text)
    return formatted, cleaned_text

async def get_user_balance(db: AsyncSession, user_id: str) -> float:
    bal_res = await db.execute(
        select(func.sum(
            case(
                (models.Transaction.type == "income", models.Transaction.amount),
                else_=-models.Transaction.amount
            )
        ))
        .select_from(models.Transaction)
        .outerjoin(models.Category, models.Transaction.category_id == models.Category.id)
        .where(models.Transaction.user_id == user_id)
        .where(
            or_(
                models.Category.system_code.is_(None),
                models.Category.system_code.notin_((INTERNAL_TRANSFER_CATEGORY_CODE,)),
            )
        )
    )
    return float(bal_res.scalar() or 0)


async def _money_lifespan_days_left(db: AsyncSession, user_id: str, today: Optional[date] = None) -> int:
    current_day = today or current_business_date()
    user = await db.get(models.User, user_id)
    if user:
        cycle = await budget_service.resolve_user_cycle(db, user=user, ref=current_day)
        end = cycle.get("end")
        if end:
            return max((end - current_day).days, 1)
    _, month_end_exclusive = budget_service.month_bounds(current_day.strftime("%Y-%m"))
    return max((month_end_exclusive - current_day).days, 1)


def _format_lifespan_money(value: float, *, rounded: bool = False) -> str:
    sign = "-" if value < 0 else ""
    abs_value = abs(float(value or 0))
    if rounded:
        return f"{sign}RM{int(abs_value + 0.5):,}"
    if abs(abs_value - round(abs_value)) < 0.005:
        return f"{sign}RM{int(round(abs_value)):,}"
    return f"{sign}RM{abs_value:,.2f}"


def _money_lifespan_status(daily_amount: float, language: str) -> str:
    if daily_amount >= 50:
        return "Comfortable" if language == "EN" else "Sempoi"
    if daily_amount >= 30:
        return "Be Careful" if language == "EN" else "Kena jaga"
    if daily_amount >= 20:
        return "Tight Budget" if language == "EN" else "Ketat"
    return "Critical Mode" if language == "EN" else "Nazak"


def _whatsapp_bold_money(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return f"*{value}*"
async def _format_money_lifespan_message(
    db: AsyncSession,
    user_id: str,
    balance: float,
    language: str,
    today: Optional[date] = None,
    *,
    txn_type: Optional[str] = None,
    txn_amount: Optional[float] = None,
) -> str:
    balance_value = float(balance or 0)
    days_left = await _money_lifespan_days_left(db, user_id, today)
    daily_amount = balance_value / days_left if balance_value > 0 else 0.0
    daily_text = _format_lifespan_money(daily_amount, rounded=True)
    balance_text = _format_lifespan_money(balance_value, rounded=True)
    status_text = _money_lifespan_status(daily_amount, language)

    txn_prefix = ""
    if txn_amount is not None and abs(float(txn_amount)) > 0.004:
        txn_amount_text = _format_lifespan_money(float(txn_amount), rounded=True)
        if language == "EN":
            txn_prefix = f"Received *{txn_amount_text}*. " if (txn_type or "").lower() == "income" else f"Spent *{txn_amount_text}* recorded. "
        else:
            txn_prefix = f"Pendapatan *{txn_amount_text}* direkod. " if (txn_type or "").lower() == "income" else f"Belanja *{txn_amount_text}* dicatat. "

    if language == "EN":
        return (
            f"\n\n{txn_prefix}{'Your balance is now' if txn_prefix else 'Your balance is now'} *{balance_text}*. "
            f"It can last about {days_left} more days. "
            f"Try to stay under *{daily_text}* per day until the next reset. "
            f"Money status: {status_text}."
        )
    return (
        f"\n\n{txn_prefix}{'Baki tinggal' if txn_prefix else 'Baki sekarang'} *{balance_text}*. "
        f"Boleh tahan {days_left} hari lagi. "
        f"Cuba jaga bawah *{daily_text}* sehari sehingga reset seterusnya. "
        f"Status duit: {status_text}."
    )

    return f"\n\nAnda boleh berbelanja {daily_budget_text} untuk bertahan sehingga {days_text} (Hujung Bulan)."

def _should_hide_group_amount(
    *,
    source_channel: str,
    txn_type: str,
    show_expense_amount: bool,
    show_income_amount: bool,
) -> bool:
    if source_channel != "whatsapp_group":
        return False
    if (txn_type or "").lower() == "income":
        return not show_income_amount
    return not show_expense_amount

async def _handle_direct_order(
    db: AsyncSession, user_id: str, phone: str, text: str, user_lang: str, t: dict,
) -> str | None:
    """Handle !ORDER prefix — direct order + auto-payment flow."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if not lines or not lines[0].lower().startswith("!order"):
        return None
    item_lines = lines[1:]
    if not item_lines:
        return t.get("welcome", "Hello!") if user_lang == "EN" else "Halo!"

    # Get active products sorted by sort_order
    result = await db.execute(
        select(models.BusinessProduct).where(
            models.BusinessProduct.user_id == user_id,
            models.BusinessProduct.is_active.is_(True),
        ).order_by(models.BusinessProduct.sort_order, models.BusinessProduct.id)
    )
    products = list(result.scalars().all())
    if not products:
        return "Store has no products yet." if user_lang == "EN" else "Kedai belum ada produk."

    order_items = []
    total_amount = 0.0
    missing_codes = []

    for line in item_lines:
        parts = line.split(None, 1)
        if not parts:
            continue
        code = parts[0].strip()
        qty = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 1
        if qty < 1:
            continue

        # Map code to product: try by id, then by index (1-based)
        product = None
        if code.isdigit():
            idx = int(code) - 1
            if 0 <= idx < len(products):
                product = products[idx]

        if product:
            amount = float(product.default_price or 0) * qty
            item = models.BusinessOrderItem(
                user_id=user_id,
                item_name=product.product_name,
                quantity=qty,
                unit_price=float(product.default_price or 0),
                line_total=amount,
                product_id=int(product.id),
                sort_order=0,
            )
            order_items.append(item)
            total_amount += amount
        else:
            missing_codes.append(code)

    if not order_items:
        return "No valid items found." if user_lang == "EN" else "Tiada item sah."

    # Create order
    from uuid import uuid4
    order_no = f"D-{uuid4().hex[:6].upper()}"
    order = models.BusinessOrder(
        user_id=user_id,
        order_no=order_no,
        customer_name=phone,
        customer_phone=phone,
        item_name=order_items[0].item_name if order_items else "Order",
        quantity=1,
        amount=total_amount,
        subtotal_amount=total_amount,
        payment_method="online_payment",
        status="pending_payment",
        source="whatsapp_direct",
        note="Direct !ORDER from public cart",
        order_mode="standard",
    )
    db.add(order)
    await db.flush()

    # Save order items
    for item in order_items:
        item.order_id = int(order.id)
        db.add(item)

    # Generate Stripe payment link
    payment_url = None
    setting_result = await db.execute(
        select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == user_id)
    )
    payment_settings = setting_result.scalar_one_or_none()
    if payment_settings and getattr(payment_settings, "stripe_enabled", False):
        stripe_key = str(getattr(payment_settings, "stripe_secret_key", None) or "").strip()
        if stripe_key:
            amount_cents = int(round(total_amount * 100))
            if amount_cents < 50:
                amount_cents = 50
            short_token = secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8]
            order.stripe_payment_short_token = short_token
            app_url = os.getenv("APP_PUBLIC_URL", "https://budget.digitalport.my").rstrip("/")
            success_url = f"{app_url}/public/removed_business/payment/{short_token}/success"
            cancel_url = f"{app_url}/public/removed_business/payment/{short_token}/cancelled"
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    res = await client.post(
                        "https://api.stripe.com/v1/checkout/sessions",
                        data={
                            "mode": "payment",
                            "success_url": success_url,
                            "cancel_url": cancel_url,
                            "client_reference_id": str(order.id),
                            "metadata[order_id]": str(order.id),
                            "metadata[user_id]": str(user_id),
                            "line_items[0][quantity]": "1",
                            "line_items[0][price_data][currency]": "myr",
                            "line_items[0][price_data][unit_amount]": str(amount_cents),
                            "line_items[0][price_data][product_data][name]": f"Order {order_no}",
                        },
                        auth=(stripe_key, ""),
                        headers={"Stripe-Version": "2026-02-25.clover"},
                    )
                if res.status_code < 400:
                    data = res.json()
                    order.stripe_checkout_session_id = data.get("id")
                    order.stripe_payment_url = data.get("url")
                    payment_url = data.get("url")
            except Exception:
                pass

    await db.commit()

    # Build reply
    items_text = "\n".join(f"{item.quantity:.0f} x {item.item_name}" for item in order_items)
    missing_text = ""
    if missing_codes:
        if user_lang == "EN":
            missing_text = f"\n\nUnrecognized codes: {', '.join(missing_codes)}"
        else:
            missing_text = f"\n\nKod tidak dikenali: {', '.join(missing_codes)}"

    if user_lang == "EN":
        reply = (
            f"✅ *Order {order_no} Created!*\n\n"
            f"{items_text}\n\n"
            f"*Total: RM{total_amount:,.2f}*{missing_text}"
        )
        if payment_url:
            reply += f"\n\n💳 *Pay here:*\n{payment_url}"
        else:
            reply += "\n\nPayment link will be available shortly."
    else:
        reply = (
            f"✅ *Order {order_no} Dibuat!*\n\n"
            f"{items_text}\n\n"
            f"*Jumlah: RM{total_amount:,.2f}*{missing_text}"
        )
        if payment_url:
            reply += f"\n\n💳 *Bayar di sini:*\n{payment_url}"
        else:
            reply += "\n\nLink pembayaran akan tersedia sebentar lagi."

    return reply


async def _process_whatsapp_message_impl(
    db: AsyncSession,
    user_id: str,
    phone: str,
    text: str,
    latitude: float | None = None,
    longitude: float | None = None,
    location_name: str | None = None,
    source_channel: str = "whatsapp",
    show_current_balance: bool = True,
    show_expense_amount: bool = True,
    show_income_amount: bool = True,
    allow_llm_fallback: bool = True,
    forced_category_id: Optional[int] = None,
    forced_wallet_id: Optional[int] = None,
    forced_kind: Optional[str] = None,
    skip_category_prompt: bool = False,
    force_category_prompt: bool = False,
    txn_time: Optional[str] = None,
) -> Tuple[str, Optional[models.Transaction]]:
    try:
        # 1. Fetch the user directly from the multi-tenant hook
        user_result = await db.execute(select(models.User).where(models.User.id == user_id))
        user = user_result.scalar_one_or_none()
        
        if not user:
            print(f"[WA] User {user_id} not found.")
            return "Pengguna tidak dijumpai.", None
        
        user_name = user.name
        user_lang = getattr(user, "language", "BM")
        t = BOT_TRANSLATIONS.get(user_lang, BOT_TRANSLATIONS["BM"])
        private_value = t["private_value"]
        hide_group_balance = source_channel == "whatsapp_group" and not show_current_balance
        hide_group_income = _should_hide_group_amount(
            source_channel=source_channel,
            txn_type="income",
            show_expense_amount=show_expense_amount,
            show_income_amount=show_income_amount,
        )
        hide_group_expense = _should_hide_group_amount(
            source_channel=source_channel,
            txn_type="expense",
            show_expense_amount=show_expense_amount,
            show_income_amount=show_income_amount,
        )
        household_id = user.default_household_id
        # 1. Cleaning & Normalization
        raw_text = (text or "").strip()
        full_raw_text = raw_text  # keep original incl. date token for pending-selection reprocessing
        explicit_txn_date, text_without_date_token, has_invalid_date_token = extract_explicit_txn_date(raw_text)
        if has_invalid_date_token:
            return t["invalid_date_token"], None

        raw_text = text_without_date_token or raw_text
        # Explicit time from command text (e.g. "pukul 2 petang", "14:30", "2:30pm").
        explicit_txn_time, text_without_time_token = extract_explicit_txn_time(raw_text)
        if explicit_txn_time and not txn_time:
            txn_time = explicit_txn_time
        if text_without_time_token:
            raw_text = text_without_time_token
        has_here_marker = has_here_location_marker(raw_text)
        if has_here_marker:
            raw_text = strip_here_location_marker(raw_text)

        multi_item_source_text = raw_text
        text = normalize_message_text(raw_text)
        lowered = text.lower()

        # [DO-NOT-CHANGE] !ORDER prefix handler — direct-to-payment shortcut for public cart orders.
        # Check raw_text (before normalization) because normalize_message_text strips ! and collapses newlines.
        if raw_text.startswith("!ORDER") or raw_text.startswith("!order"):
            order_reply = await _handle_direct_order(db, user_id, phone, raw_text, user_lang, t)

        if (latitude is None) != (longitude is None):
            return ("Invalid location payload." if user_lang == "EN" else "Payload lokasi tidak sah."), None

        resolved_latitude = float(latitude) if latitude is not None else None
        resolved_longitude = float(longitude) if longitude is not None else None
        resolved_location_name = (location_name or "").strip() or None
        if resolved_latitude is not None:
            resolved_location_name = await location_service.resolve_short_location_name(
                latitude=resolved_latitude,
                longitude=resolved_longitude,
                location_name=resolved_location_name,
            )

        if resolved_latitude is not None:
            try:
                await upsert_user_location_context(
                    db,
                    user_id=user_id,
                    latitude=resolved_latitude,
                    longitude=float(resolved_longitude),
                    location_name=resolved_location_name,
                )
            except ValueError:
                return ("Invalid location payload." if user_lang == "EN" else "Payload lokasi tidak sah."), None
            except Exception:
                await db.rollback()

        if has_here_marker and resolved_latitude is None:
            ctx = await get_user_location_context(db, user_id=user_id)
            if not ctx:
                if user_lang == "EN":
                    return "Please send your location pin first, then retry your command with `@here`.", None
                return "Sila hantar location pin dahulu, kemudian cuba semula command contoh `lunch 15 @here`.", None
            resolved_latitude = float(ctx.latitude)
            resolved_longitude = float(ctx.longitude)
            resolved_location_name = ctx.location_name
        
        _safe_print(f"[WA] Processing: \"{text}\" for user {user_name} ({user_lang})")

        pending_selection = None if skip_category_prompt else _get_pending_category_selection(user_id, source_channel)
        if pending_selection:
            normalized_selection = normalize_message_text(text or "").strip().lower()
            if normalized_selection in {"batal", "cancel", "x"}:
                _clear_pending_category_selection(user_id, source_channel)
                _take_pending_receipt_media(user_id, source_channel)
                return ("Pilihan kategori dibatalkan." if user_lang == "BM" else "Category selection cancelled."), None
            # Allow a wallet to be chosen together with the category, e.g. "makan tng"
            # or "loanx akpk tng". Extract the trailing wallet token so category matching
            # only considers the category portion of the reply.
            category_reply, forced_wallet_id = await _split_reply_category_wallet(db, user_id, text or "")
            normalized_typed = normalize_message_text(category_reply).strip().lower()
            selected_index = None
            if normalized_typed.isdigit():
                selected_index = int(normalized_typed) - 1
            else:
                for idx_option, option in enumerate(pending_selection.get("options") or []):
                    if normalize_message_text(option.get("name") or "") == normalized_typed:
                        selected_index = idx_option
                        break
            options = pending_selection.get("options") or []
            if selected_index is not None and 0 <= selected_index < len(options):
                _clear_pending_category_selection(user_id, source_channel)
                selected_option = options[selected_index]
                return await _process_whatsapp_message_impl(
                    db,
                    user_id=user_id,
                    phone=phone,
                    text=str(pending_selection.get("original_text") or ""),
                    latitude=pending_selection.get("latitude"),
                    longitude=pending_selection.get("longitude"),
                    location_name=pending_selection.get("location_name"),
                    source_channel=source_channel,
                    show_current_balance=show_current_balance,
                    show_expense_amount=show_expense_amount,
                    show_income_amount=show_income_amount,
                    allow_llm_fallback=allow_llm_fallback,
                    forced_category_id=int(selected_option.get("id")),
                    forced_wallet_id=forced_wallet_id,
                    skip_category_prompt=True,
                    txn_time=pending_selection.get("txn_time"),
                )
            # User typed a category name or keyword not in the shortlist: match against all user categories.
            if selected_index is None:
                all_rows = (await db.execute(
                    select(models.Category).where(
                        models.Category.household_id == user.default_household_id,
                        models.Category.is_internal == False,
                    )
                )).scalars().all()
                exact_match = next((c for c in all_rows if normalize_message_text(c.name).lower() == normalized_typed), None)
                keyword_match = None
                if not exact_match:
                    kw_rows = (await db.execute(
                        select(models.CategoryKeyword, models.Category)
                        .join(models.Category, models.CategoryKeyword.category_id == models.Category.id)
                        .where(
                            models.CategoryKeyword.is_active == True,
                            models.Category.is_internal == False,
                            models.Category.household_id == user.default_household_id,
                        )
                    )).all()
                    for kw, category in kw_rows:
                        kw_norm = normalize_message_text(kw.keyword or "").lower()
                        if kw_norm and (kw_norm == normalized_typed or kw_norm in normalized_typed or normalized_typed in kw_norm):
                            keyword_match = category
                            break
                matched = exact_match or keyword_match
                if matched:
                    _clear_pending_category_selection(user_id, source_channel)
                    return await _process_whatsapp_message_impl(
                        db,
                        user_id=user_id,
                        phone=phone,
                        text=str(pending_selection.get("original_text") or ""),
                        latitude=pending_selection.get("latitude"),
                        longitude=pending_selection.get("longitude"),
                        location_name=pending_selection.get("location_name"),
                        source_channel=source_channel,
                        show_current_balance=show_current_balance,
                        show_expense_amount=show_expense_amount,
                        show_income_amount=show_income_amount,
                        allow_llm_fallback=allow_llm_fallback,
                        forced_category_id=int(matched.id),
                        forced_wallet_id=forced_wallet_id,
                        skip_category_prompt=True,
                        txn_time=pending_selection.get("txn_time"),
                    )
            # subx/loanx link: reply like `subx astro tng` / `loanx akpk tng` links the
            # OCR amount (taken from the pending transaction) to a subscription/loan payment.
            if normalized_typed.startswith("subx ") or normalized_typed.startswith("loanx "):
                ocr_amount = extract_amount(str(pending_selection.get("original_text") or ""))
                ocr_date, _cleaned, _inv = extract_explicit_txn_date(str(pending_selection.get("original_text") or ""))
                print(f"[WA][debug] pending loanx/subx branch: typed={normalized_typed!r} ocr_amount={ocr_amount!r} ocr_date={ocr_date!r}")
                if ocr_amount and ocr_amount > 0:
                    _clear_pending_category_selection(user_id, source_channel)
                    wallet_name = ""
                    if forced_wallet_id is not None:
                        wrow = await db.execute(select(models.Wallet).where(models.Wallet.id == int(forced_wallet_id)))
                        w = wrow.scalar_one_or_none()
                        if w:
                            wallet_name = f" {wallet_display_name(w)}"
                    date_token = f" @{ocr_date.strftime('%d%m%Y')}" if ocr_date else ""
                    cmd = (
                        f"loanx pay {normalized_typed[6:]} {ocr_amount:.2f}{wallet_name}{date_token}"
                        if normalized_typed.startswith("loanx ")
                        else f"subx pay {normalized_typed[5:]} {ocr_amount:.2f}{wallet_name}{date_token}"
                    )
                    if normalized_typed.startswith("loanx "):
                        reply = await _process_loanx_command(
                            db, user_id=user_id, household_id=household_id,
                            text=cmd, language=user_lang, source_channel=source_channel,
                            hide_balance=hide_group_balance, private_value=private_value,
                        )
                    else:
                        res = await _process_subx_command(
                            db, user_id=user_id, household_id=household_id,
                            text=cmd, language=user_lang, source_channel=source_channel,
                            hide_balance=hide_group_balance, private_value=private_value,
                        )
                        reply = res[0] if isinstance(res, tuple) else res
                    return reply, None
            # Generic kind alias: reply 'income' or 'expense' picks the default category of that kind.
            if normalized_typed in {"income", "pendapatan", "gaji", "salary", "expense", "expenses", "belanja", "perbelanjaan"}:
                alias_kind = "income" if normalized_typed in {"income", "pendapatan", "gaji", "salary"} else "expense"
                alias_cat = await get_default_category(db, alias_kind, household_id=user.default_household_id)
                if alias_cat:
                    _clear_pending_category_selection(user_id, source_channel)
                    return await _process_whatsapp_message_impl(
                        db,
                        user_id=user_id,
                        phone=phone,
                        text=str(pending_selection.get("original_text") or ""),
                        latitude=pending_selection.get("latitude"),
                        longitude=pending_selection.get("longitude"),
                        location_name=pending_selection.get("location_name"),
                        source_channel=source_channel,
                        show_current_balance=show_current_balance,
                        show_expense_amount=show_expense_amount,
                        show_income_amount=show_income_amount,
                        allow_llm_fallback=allow_llm_fallback,
                        forced_category_id=int(alias_cat.id),
                        forced_wallet_id=forced_wallet_id,
                        skip_category_prompt=True,
                    )

        
        # 1.5. Ensure legacy category scope exists for budget/category mapping.
        # This quietly creates the compatibility scope if it does not exist yet.
        household_id = await ensure_standard_categories(db, user_id)
        # Refresh user in case the compatibility scope was just created.
        await db.refresh(user)
        
        wallet_selection_result = await _apply_recent_wallet_selection(
            db,
            user_id=user_id,
            household_id=household_id,
            text=text,
            source_channel=source_channel,
            language=user_lang,
            hide_balance=hide_group_balance,
            private_value=private_value,
        )
        if wallet_selection_result:
            return wallet_selection_result

        # 2. Help / Menu Handling
        if lowered in ["hai", "hello", "hi", "help", "menu", "salam", "p", "siapa"]:
            return t["welcome"], None
            
        if DEBT_CMD_HELP_PATTERN.match(lowered):
            return t["debt_help"], None
            
        # 2.5 Language Change Handling
        if lowered.startswith("lang "):
            target = lowered.split(" ")[1]
            if target in ["en", "english", "inggeris"]:
                user.language = "EN"
                await db.commit()
                return BOT_TRANSLATIONS["EN"]["lang_switched"], None
            elif target in ["bm", "malay", "melayu"]:
                user.language = "BM"
                await db.commit()
                return BOT_TRANSLATIONS["BM"]["lang_switched"], None

        if _is_budget_command(lowered):
            budget_reply = await _process_budget_command(
                db,
                user_id=user_id,
                household_id=household_id,
                text=text,
                language=user_lang,
            )
            return budget_reply, None

        subx_result = await _process_subx_command(
            db,
            user_id=user_id,
            household_id=household_id,
            text=text,
            language=user_lang,
            source_channel=source_channel,
            hide_balance=hide_group_balance,
            private_value=private_value,
        )
        if subx_result:
            if isinstance(subx_result, tuple):
                return subx_result
            return subx_result, None

        loanx_reply = await _process_loanx_command(
            db,
            user_id=user_id,
            household_id=household_id,
            text=text,
            language=user_lang,
            source_channel=source_channel,
            hide_balance=hide_group_balance,
            private_value=private_value,
        )
        if loanx_reply:
            return loanx_reply, None

        pinx_reply = await _process_pinx_command(
            db,
            user_id=user_id,
            text=text,
            language=user_lang,
            source_channel=source_channel,
            latitude=resolved_latitude,
            longitude=resolved_longitude,
            location_name=resolved_location_name,
        )
        if pinx_reply:
            return pinx_reply, None

        if is_debt_list_command(text):
            debt_summaries = await get_debt_summaries(db, user_id=user_id)
            active_rows = [row for row in debt_summaries if abs(float(row["balance"])) > 0.005]
            if not active_rows:
                return t["debt_list_empty"], None

            receivables = [r for r in active_rows if float(r["balance"]) > 0]
            payables = [r for r in active_rows if float(r["balance"]) < 0]

            lines = ["📒 *Senarai Hutang Aktif*"] if user_lang != "EN" else ["📒 *Active Debt List*"]
            
            if receivables:
                lines.append(f"\n📈 *{t['debt_receivable']}:*")
                for index, row in enumerate(receivables):
                    symbol = "├─" if index < len(receivables) - 1 else "└─"
                    balance_text = f"RM {float(row['balance']):,.2f}" if not hide_group_balance else private_value
                    lines.append(f"{symbol} {row['counterparty_name']}: *{balance_text}*")
            
            if payables:
                lines.append(f"\n📉 *{t['debt_payable']}:*")
                for index, row in enumerate(payables):
                    symbol = "├─" if index < len(payables) - 1 else "└─"
                    balance_text = f"RM {abs(float(row['balance'])):,.2f}" if not hide_group_balance else private_value
                    lines.append(f"{symbol} {row['counterparty_name']}: *{balance_text}*")

            return "\n".join(lines), None

        debt_balance_name = parse_debt_balance_query(text)
        if debt_balance_name:
            current_balance = await get_debt_balance(db, user_id=user_id, counterparty_name=debt_balance_name)
            if abs(current_balance) < 0.005:
                return t["debt_zero_balance"].format(name=debt_balance_name), None
            if hide_group_balance:
                balance_value = private_value
            else:
                if current_balance > 0:
                    direction = "Orang hutang kita" if user_lang != "EN" else "They owe you"
                    balance_value = f"RM {current_balance:,.2f} ({direction})"
                else:
                    direction = "Kita hutang orang" if user_lang != "EN" else "You owe them"
                    balance_value = f"RM {abs(current_balance):,.2f} ({direction})"
            return t["debt_balance"].format(name=debt_balance_name, balance=balance_value), None

        debt_command, debt_name, debt_amount, debt_wallet_name_input = parse_debt_command(text)
        if debt_command:
            resolved_event_type: Optional[str] = None
            if debt_command in {"debtcol", "lend"}:
                if debt_amount > 0.005:
                    resolved_event_type = "lend"
                else:
                    resolved_event_type = "payment_in"
            elif debt_command in {"debtpay", "borrow"}:
                if debt_amount > 0.005:
                    resolved_event_type = "borrow"
                else:
                    resolved_event_type = "payment_out"
            elif debt_command == "pay":
                resolved_event_type = "payment_out"
            
            # Always pass absolute value to internal logic
            debt_amount = abs(debt_amount)

            if not resolved_event_type:
                return t["debt_syntax_err"], None

            allow_auto_reg = resolved_event_type in {"lend", "borrow"}

            selected_wallet_id: Optional[int] = None
            if debt_wallet_name_input:
                wallet_query = select(models.Wallet).where(models.Wallet.owner_user_id == user_id)
                if household_id:
                    wallet_query = select(models.Wallet).where(
                        or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == household_id)
                    )
                wallet_res = await db.execute(wallet_query)
                wallet_candidates = wallet_res.scalars().all()
                selected_wallet = _wallet_choice_from_text(wallet_candidates, debt_wallet_name_input)
                if not selected_wallet:
                    return t["wallet_not_found"], None
                selected_wallet_id = selected_wallet.id

            try:
                debt_record, debt_txn = await create_debt_event(
                    db,
                    user_id=user_id,
                    household_id=household_id,
                    counterparty_name=debt_name,
                    event_type=resolved_event_type,
                    amount=debt_amount,
                    wallet_id=selected_wallet_id,
                    txn_date=explicit_txn_date or current_business_date(),
                    notes=text,
                    source_channel=source_channel,
                    allow_auto_register=allow_auto_reg,
                )
            except ValueError as exc:
                error_code = str(exc)
                if error_code == "DEBTOR_NOT_FOUND":
                    return t["debt_unknown_counterparty"].format(name=debt_name), None
                if error_code.startswith("INSUFFICIENT_BALANCE:"):
                    parts = error_code.split(":")
                    wallet_name = "-"
                    balance_value = "0.00"
                    if len(parts) >= 3:
                        wallet_id = int(parts[1])
                        balance_value = f"{float(parts[2]):,.2f}"
                        wallet_result = await db.execute(select(models.Wallet).where(models.Wallet.id == wallet_id))
                        wallet = wallet_result.scalars().first()
                        if wallet:
                            wallet_name = wallet_display_name(wallet)
                    return t["debt_insufficient_bal"].format(
                        wallet_name=wallet_name,
                        balance=balance_value,
                    ), None
                if error_code == "WALLET_NOT_FOUND":
                    return t["wallet_not_found"], None
                return t["debt_syntax_err"], None

            wallet_result = await db.execute(select(models.Wallet).where(models.Wallet.id == debt_record.wallet_id))
            debt_wallet = wallet_result.scalars().first()
            debt_wallet_name = wallet_display_name(debt_wallet) if debt_wallet else "-"
            current_balance = await get_debt_balance(db, user_id=user_id, counterparty_name=debt_name)

            if hide_group_balance:
                balance_text = private_value
            else:
                if abs(current_balance) < 0.005:
                    balance_text = "RM 0.00"
                elif current_balance > 0:
                    direction = "Orang hutang kita" if user_lang != "EN" else "They owe you"
                    balance_text = f"RM {current_balance:,.2f} ({direction})"
                else:
                    direction = "Kita hutang orang" if user_lang != "EN" else "You owe them"
                    balance_text = f"RM {abs(current_balance):,.2f} ({direction})"

            hide_debt_amount = _should_hide_group_amount(
                source_channel=source_channel,
                txn_type=debt_txn.type,
                show_expense_amount=show_expense_amount,
                show_income_amount=show_income_amount,
            )
            amount_text = private_value if hide_debt_amount else f"RM {debt_amount:,.2f}"

            return t["debt_saved"].format(
                ref_id=debt_txn.reference_id,
                name=debt_name,
                event_label=_debt_event_label(resolved_event_type, user_lang),
                wallet_name=debt_wallet_name,
                amount=amount_text,
                balance=balance_text,
            ), debt_txn

        if lowered.startswith("lend") or lowered.startswith("borrow") or lowered.startswith("pay") or lowered.startswith("balance"):
            return t["debt_syntax_err"], None
        
        if lowered == "checkwallet" or lowered == "semak wallet":
            if hide_group_balance:
                return t["wallet_hidden_in_group"], None
            wallet_query = select(models.Wallet).where(models.Wallet.owner_user_id == user_id).order_by(models.Wallet.name)
            if household_id:
                wallet_query = select(models.Wallet).where(
                    or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == household_id)
                ).order_by(models.Wallet.name)
            wallet_res = await db.execute(wallet_query)
            wallets = wallet_res.scalars().all()
            
            if not wallets:
                return t.get("no_wallets_found", "Tiada dompet dijumpai."), None
            
            msg = t.get("wallet_list_title", "💼 *Senarai Dompet Anda:*\n\n")
            total = 0
            for w in wallets:
                inc_res = await db.execute(select(func.sum(models.Transaction.amount)).where(models.Transaction.wallet_id == w.id, models.Transaction.type == "income"))
                exp_res = await db.execute(select(func.sum(models.Transaction.amount)).where(models.Transaction.wallet_id == w.id, models.Transaction.type == "expense"))
                inc = inc_res.scalar() or 0
                exp = exp_res.scalar() or 0
                bal = inc - exp
                total += bal
                msg += f"├─ {wallet_display_name(w)} : *RM {bal:,.2f}*\n"
            
            msg += t.get("wallet_total", "\n└─ *Jumlah Keseluruhan* : RM{total}").format(total=f"{total:,.2f}")
            return msg, None

        if lowered == "summary":
            today = current_business_date()
            user = await db.get(models.User, user_id)
            cycle = await budget_service.resolve_user_cycle(db, user=user, ref=today) if user else None
            start_of_month = (cycle or {}).get("start") or date(today.year, today.month, 1)
            end_exclusive = (cycle or {}).get("end") or (today + timedelta(days=1))
            excluded_codes = (
                INTERNAL_TRANSFER_CATEGORY_CODE,
                INTERNAL_DEBT_OUT_CATEGORY_CODE,
                INTERNAL_DEBT_IN_CATEGORY_CODE,
            )
            
            # Calculate income (current month)
            income_res = await db.execute(
                select(func.sum(models.Transaction.amount))
                .select_from(models.Transaction)
                .outerjoin(models.Category, models.Transaction.category_id == models.Category.id)
                .where(models.Transaction.user_id == user_id, models.Transaction.type == "income", models.Transaction.txn_date >= start_of_month, models.Transaction.txn_date < end_exclusive)
                .where(
                    or_(
                        models.Category.system_code.is_(None),
                        models.Category.system_code.notin_(excluded_codes),
                    )
                )
            )
            total_income = income_res.scalar() or 0
            
            # Calculate expense (current month)
            expense_res = await db.execute(
                select(func.sum(models.Transaction.amount))
                .select_from(models.Transaction)
                .outerjoin(models.Category, models.Transaction.category_id == models.Category.id)
                .where(models.Transaction.user_id == user_id, models.Transaction.type == "expense", models.Transaction.txn_date >= start_of_month, models.Transaction.txn_date < end_exclusive)
                .where(
                    or_(
                        models.Category.system_code.is_(None),
                        models.Category.system_code.notin_(excluded_codes),
                    )
                )
            )
            total_expense = expense_res.scalar() or 0
            
            balance = total_income - total_expense
            
            month_year = today.strftime('%B %Y')
            summary_template = t["summary_msg_hidden_balance"] if hide_group_balance else t["summary_msg"]
            current_balance = await get_user_balance(db, user_id)
            summary = summary_template.format(
                title=t["summary_title"].format(month_year=month_year),
                income_label=t["income"],
                expense_label=t["expense"],
                current_balance_label=t["current_balance"],
                income=private_value if hide_group_income else f"RM {total_income:,.2f}",
                expense=private_value if hide_group_expense else f"RM {total_expense:,.2f}",
                current_balance=private_value if hide_group_balance else f"RM {current_balance:,.2f}",
                private_value=private_value,
            )
            return summary, None

        if lowered == "list":
            # Fetch last 5 transactions
            list_res = await db.execute(
                select(models.Transaction)
                .where(models.Transaction.user_id == user_id)
                .order_by(models.Transaction.txn_date.desc(), models.Transaction.created_at.desc())
                .limit(5)
            )
            txns = list_res.scalars().all()
            
            if not txns:
                return t["no_txns"], None
                
            lines = [t["last_5_records"]]
            txns_list = list(txns)
            for i, txn in enumerate(txns_list):
                symbol = "├─" if i < len(txns_list) - 1 else "└─"
                sign = "+" if txn.type == "income" else "-"
                note = txn.notes if txn.notes else (txn.vendor_or_source if txn.vendor_or_source else t["no_note"])
                amount_text = f"{sign}RM{txn.amount:,.2f}"
                if _should_hide_group_amount(
                    source_channel=source_channel,
                    txn_type=txn.type,
                    show_expense_amount=show_expense_amount,
                    show_income_amount=show_income_amount,
                ):
                    amount_text = private_value
                # Truncate note if too long
                if len(note) > 20: note = note[:17] + "..."
                lines.append(f"{symbol} *{note}* | {txn.txn_date.strftime('%d/%m/%Y')} | {amount_text}")
            
            return "\n".join(lines), None

        if lowered in {
            "category",
            "categories",
            "kategori",
            "kategoris",
            "senarai kategori",
            "list category",
            "listcategory",
            "listkategori",
        }:
            is_en = user_lang == "EN"
            household_id = household_id or await ensure_standard_categories(db, user_id)
            cat_res = await db.execute(
                select(models.Category)
                .where(
                    models.Category.household_id == household_id,
                    models.Category.is_internal == False,
                )
                .order_by(models.Category.name)
            )
            categories = cat_res.scalars().all()
            if not categories:
                return ("No categories found." if is_en else "Tiada kategori dijumpai."), None

            cat_ids = [c.id for c in categories]
            kw_res = await db.execute(
                select(models.CategoryKeyword)
                .where(
                    models.CategoryKeyword.category_id.in_(cat_ids),
                    models.CategoryKeyword.is_active == True,
                )
                .order_by(models.CategoryKeyword.keyword)
            )
            keywords_by_cat: dict[int, list[str]] = {}
            for kw in kw_res.scalars().all():
                keywords_by_cat.setdefault(kw.category_id, []).append(kw.keyword)

            none_label = "(no keyword)" if is_en else "(tiada keyword)"
            expense_label = "Expense" if is_en else "Perbelanjaan"
            income_label = "Income" if is_en else "Pendapatan"

            lines = ["🏷️ *Category & Keyword*" if is_en else "🏷️ *Kategori & Keyword*", ""]

            def _render_category_group(title: str, kind: str) -> None:
                group = [c for c in categories if c.kind == kind]
                if not group:
                    return
                lines.append(f"*{title}*")
                for i, c in enumerate(group):
                    symbol = "├─" if i < len(group) - 1 else "└─"
                    branch = "│  " if i < len(group) - 1 else "   "
                    kws = keywords_by_cat.get(c.id) or []
                    kw_text = ", ".join(kws) if kws else none_label
                    lines.append(f"{symbol} *{c.name}*")
                    lines.append(f"{branch}{kw_text}")
                lines.append("")

            _render_category_group(expense_label, "expense")
            _render_category_group(income_label, "income")

            lines.append(
                "💡 Edit keywords on the Categories page."
                if is_en
                else "💡 Ubah keyword di halaman Categories."
            )
            return "\n".join(lines).strip(), None

        # 3. Extract data from text
        multi_item_transaction = parse_multi_item_transaction(multi_item_source_text)
        one_line_item_transaction = None if multi_item_transaction else parse_one_line_item_transaction(multi_item_source_text)
        if one_line_item_transaction:
            multi_item_transaction = one_line_item_transaction

        # Reject long text with amount to prevent spam/articles parsed as transactions
        text_len = len(text.strip()) if text else 0
        if text_len > 60 and not multi_item_transaction:
            amount_check = extract_amount(text)
            if amount_check is not None:
                is_en = user_lang == "EN"
                return (
                    (
                        f"⚠️ Mesej terlalu panjang ({text_len} aksara). Sila ringkaskan ≤60 aksara.\n"
                        f"Contoh: _makan 12.50_ atau _beli barang 50_"
                    )
                    if not is_en
                    else (
                        f"⚠️ Message too long ({text_len} chars). Shorten to ≤60 chars.\n"
                        f"Example: _lunch 12.50_ or _groceries 50_"
                    )
                ), None

        amount = multi_item_transaction["total"] if multi_item_transaction else extract_amount(text)

        
        # 3.5 Check for transfer
        if amount and not multi_item_transaction and any(k in lowered for k in ["transfer", "pindah"]):
            wallet_query = select(models.Wallet).where(models.Wallet.owner_user_id == user_id)
            if household_id:
                wallet_query = select(models.Wallet).where(
                    or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == household_id)
                )
            w_res = await db.execute(wallet_query)
            user_wallets = w_res.scalars().all()
            
            found_wallets = []
            for w in user_wallets:
                match = re.search(rf"\b{re.escape(w.name.lower())}\b", lowered)
                if match:
                    found_wallets.append((match.start(), w))
            
            # Sort by appearance index
            found_wallets.sort(key=lambda x: x[0])
            
            if len(found_wallets) >= 2:
                from_w = found_wallets[0][1]
                to_w = found_wallets[-1][1]
                
                if from_w.id == to_w.id:
                    return t.get("transfer_same_wallet", "Dompet sumber dan destinasi tidak boleh sama."), None
                    
                # Check balance of source wallet
                inc_res = await db.execute(select(func.sum(models.Transaction.amount)).where(models.Transaction.wallet_id == from_w.id, models.Transaction.type == "income"))
                exp_res = await db.execute(select(func.sum(models.Transaction.amount)).where(models.Transaction.wallet_id == from_w.id, models.Transaction.type == "expense"))
                from_w_bal = (inc_res.scalar() or 0) - (exp_res.scalar() or 0)
                
                if from_w_bal < amount:
                    transfer_error_key = "transfer_insufficient_bal_hidden" if hide_group_balance else "transfer_insufficient_bal"
                    return t.get(
                        transfer_error_key,
                        "❌ *Transfer Gagal*\nBaki di *{wallet_name}* tidak mencukupi (RM{balance}).\nSila rekod masuk (topup) duit ke dalam dompet ini dahulu."
                    ).format(wallet_name=wallet_display_name(from_w), balance=f"{from_w_bal:,.2f}", private_value=private_value), None
                    
                txn_date = explicit_txn_date or current_business_date()
                ref_id = models.generate_txn_reference(txn_date)
                transfer_category = await ensure_internal_transfer_category(db, household_id)
                
                txn_out = models.Transaction(
                    wallet_id=from_w.id,
                    user_id=user_id,
                    reference_id=ref_id + "-O",
                    type="expense",
                    txn_date=txn_date,
                    vendor_or_source=f"Transfer to {to_w.name}",
                    amount=amount,
                    category_id=transfer_category.id if transfer_category else None,
                    notes=text,
                    source_channel=source_channel
                )
                
                txn_in = models.Transaction(
                    wallet_id=to_w.id,
                    user_id=user_id,
                    reference_id=ref_id + "-I",
                    type="income",
                    txn_date=txn_date,
                    vendor_or_source=f"Transfer from {from_w.name}",
                    amount=amount,
                    category_id=transfer_category.id if transfer_category else None,
                    notes=text,
                    source_channel=source_channel
                )
                
                db.add(txn_out)
                db.add(txn_in)
                await db.commit()

                hide_group_transfer_amount = _should_hide_group_amount(
                    source_channel=source_channel,
                    txn_type="expense",
                    show_expense_amount=show_expense_amount,
                    show_income_amount=show_income_amount,
                ) or _should_hide_group_amount(
                    source_channel=source_channel,
                    txn_type="income",
                    show_expense_amount=show_expense_amount,
                    show_income_amount=show_income_amount,
                )
                
                return t.get("transfer_success").format(
                    ref_id=ref_id,
                    amount=private_value if hide_group_transfer_amount else f"RM {amount:,.2f}",
                    from_name=wallet_display_name(from_w),
                    to_name=wallet_display_name(to_w)
                ), None
            else:
                return t.get("transfer_syntax_err", "Sila nyatakan dua nama dompet untuk tujuan transfer. Contoh: `Transfer 100 Maybank Cash`"), None

        if not amount:
            if source_channel in {"whatsapp", "whatsapp_group"} and not WHATSAPP_FALLBACK_REPLY_ENABLED:
                return None, None

            negative_reply = get_negative_or_abusive_reply(text, user_lang)
            if negative_reply:
                print(f"[BOT] Using negative-tone fallback before LLM for user={user_id} channel={source_channel}")
                return negative_reply, None

            normalized_help_text = normalize_message_text(text or "")
            if is_model_identity_query(text):
                print(f"[BOT] Using model-identity reply before LLM for user={user_id} channel={source_channel}")
                return get_model_identity_reply(user_lang), None

            # Out-of-scope questions (how to use git/python/etc.) -> stay silent.
            if _is_out_of_scope_question(text):
                print(f"[BOT] Out-of-scope question, staying silent for user={user_id} channel={source_channel} text={text[:80]!r}")
                return None, None

            if any(pattern in normalized_help_text for pattern in ["location", "lokasi", "map", "peta", "@here", "here", "mark location", "tanda lokasi", "lampir lokasi", "attach location", "reply location", "reply @here", "slide reply"]):
                location_reply = get_basic_assistant_reply(text, user_lang)
                if location_reply:
                    print(f"[BOT] Using location-help fallback before LLM for user={user_id} channel={source_channel}")
                    return location_reply, None

            # 0. Try AI first for non-transaction chat so the assistant feels more natural.
            if allow_llm_fallback and llm_service.is_llm_reply_enabled_for_channel(source_channel):
                llm_reply = await llm_service.request_budget_reply(
                    db,
                    user_id=user_id,
                    preferred_language=user_lang,
                    user_message=text,
                    source_channel=source_channel,
                )
                if llm_reply:
                    if is_command_help_query(text) and not is_useful_command_answer(llm_reply):
                        print(f"[BOT] Discarding weak LLM command-help reply for user={user_id} channel={source_channel}")
                    elif is_general_product_help_query(text) and not is_useful_product_help_answer(llm_reply):
                        print(f"[BOT] Discarding weak LLM product-help reply for user={user_id} channel={source_channel}")
                    else:
                        return llm_reply, None
                print(f"[BOT] LLM returned no usable text; falling back for user={user_id} channel={source_channel}")

            # 1. Keep the rule-based assistant for explicit Budget by DigitalPort help queries.
            basic_reply = get_basic_assistant_reply(text, user_lang)
            if basic_reply:
                print(f"[BOT] Using rule-based fallback for user={user_id} channel={source_channel}")
                return basic_reply, None

            # 2. For casual or emotional chat, prefer the more human canned reply.
            general_casual_reply = get_general_casual_reply(text, user_lang)
            if general_casual_reply:
                print(f"[BOT] Using general casual fallback for user={user_id} channel={source_channel}")
                return general_casual_reply, None

            # 3. For casual or emotional chat, prefer the more human canned reply.
            sim_reply = get_simulated_ai_reply(text, language=user_lang)
            if sim_reply:
                print(f"[BOT] Using simulated conversational fallback for user={user_id} channel={source_channel}")
                return sim_reply, None

            # 4. Final fallback stays in-domain but should still feel conversational.
            print(f"[BOT] Using contextual fallback for user={user_id} channel={source_channel}")
            return get_contextual_domain_fallback(text, user_lang), None

        
        # 4. Find category from portal mapping (web-app source of truth)
        # When force_category_prompt is set (OCR media flow), always ask the user to
        # pick a category instead of auto-matching a keyword inside the scan text.
        category = None if force_category_prompt else await get_category_by_keywords(db, text, household_id=household_id)
        
        # 5. Determine Transaction Type (Income vs Expense)
        category_suggestions: list[models.Category] = []
        if forced_category_id is not None:
            forced_res = await db.execute(
                select(models.Category).where(
                    models.Category.id == int(forced_category_id),
                    models.Category.household_id == household_id,
                    models.Category.is_internal == False,
                )
            )
            category = forced_res.scalars().first()
        if category:
            # Strictly follow the category's kind as set in the Web App (the "Mapping")
            txn_type = category.kind
        else:
            # Fallback ONLY if no keyword mapping exists in the portal
            # We default to 'expense' for safety
            txn_type = forced_kind or "expense"
            category_suggestions = await get_category_suggestions_by_keywords(
                db,
                text,
                household_id=household_id,
                preferred_kind=txn_type,
            )
            if (category_suggestions or force_category_prompt) and not skip_category_prompt:
                default_category = await get_default_category(db, txn_type, household_id=household_id)
                prompt_options = []
                if default_category:
                    prompt_options.append({"id": int(default_category.id), "name": default_category.name})
                for item in category_suggestions[:3]:
                    if any(int(existing["id"]) == int(item.id) for existing in prompt_options):
                        continue
                    prompt_options.append({"id": int(item.id), "name": item.name})
                prompt_options = prompt_options[:3]
                _set_pending_category_selection(
                    user_id,
                    source_channel,
                    {
                        "original_text": full_raw_text,
                        "latitude": resolved_latitude,
                        "longitude": resolved_longitude,
                        "location_name": resolved_location_name,
                        "options": prompt_options,
                        "txn_time": txn_time,
                    },
                )
                lines = [
                    (
                        f"Balas kategori/subx/loanx + dompet, cth `income/expenses`/`subx <subs nama>`/`loanx <loan nama>` tng"
                        if user_lang == "BM"
                        else f"Reply category/subx/loanx + wallet, e.g. `income/expenses`/`subx <sub name>`/`loanx <loan name>` tng"
                    )
                ]
                return "\n".join(lines), None
            category = await get_default_category(db, txn_type, household_id=household_id)

        cat = category
        cat_name = cat.name if cat else ("Pendapatan" if txn_type == "income" else "Lain-lain")
        
        # 6. Determine Wallet (Dynamic Match)
        wallet_query = select(models.Wallet).where(models.Wallet.owner_user_id == user_id)
        if household_id:
            wallet_query = select(models.Wallet).where(
                or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == household_id)
            )
        wallet_query = wallet_query.order_by(models.Wallet.is_bot_default.desc(), models.Wallet.name.asc(), models.Wallet.id.asc())
        user_wallets_res = await db.execute(wallet_query)
        user_wallets = list(user_wallets_res.scalars().all())
        
        selected_wallet = None
        used_explicit_wallet_prefix = False
        if forced_wallet_id is not None:
            # Receipt OCR flow: category + wallet chosen together in one reply.
            forced_wallet = next((w for w in user_wallets if int(w.id) == int(forced_wallet_id)), None)
            if forced_wallet:
                selected_wallet = forced_wallet
        if not selected_wallet:
            # Sort by length descending, so "maybank cash" matches before "cash"
            for w in sorted(user_wallets, key=lambda x: len(x.name), reverse=True):
                if re.search(rf"\b{re.escape(w.name.lower())}\b", lowered):
                    selected_wallet = w
                    used_explicit_wallet_prefix = True
                    break

        if not selected_wallet:
            # Priority 1: Check if user has explicitly set a bot default wallet in portal
            for w in user_wallets:
                if getattr(w, "is_bot_default", False):
                    selected_wallet = w
                    break
            
            # Priority 2: Fallback to the most recently used wallet (owner or household),
            # so a stale "Cash" created first doesn't keep swallowing new transactions.
            if not selected_wallet and user_wallets:
                recent_res = await db.execute(
                    select(models.Transaction.wallet_id, func.max(models.Transaction.txn_date))
                    .where(models.Transaction.user_id == user_id)
                    .where(models.Transaction.wallet_id.in_([int(w.id) for w in user_wallets]))
                    .group_by(models.Transaction.wallet_id)
                    .order_by(func.max(models.Transaction.txn_date).desc())
                )
                recent_rows = recent_res.all()
                if recent_rows:
                    most_recent_wallet_id = int(recent_rows[0][0])
                    selected_wallet = next((w for w in user_wallets if int(w.id) == most_recent_wallet_id), None)
                if not selected_wallet:
                    selected_wallet = user_wallets[0]
            if not selected_wallet:
                # Only create a fresh "Cash" wallet when the user has NO wallet at all.
                selected_wallet = await ensure_personal_wallet(db, user_id)
            
        wallet = selected_wallet
        
        # Derive a clean description for the portal confirmation and record
        if multi_item_transaction:
            vendor_name = str(multi_item_transaction["title"])
            if used_explicit_wallet_prefix and wallet:
                vendor_name = strip_wallet_reference(vendor_name, wallet.name)
        else:
            vendor_name = text
            amount_match = AMOUNT_PATTERN.search(text)
            if amount_match:
                vendor_name = text.replace(amount_match.group(0), " ").strip()
            if used_explicit_wallet_prefix and wallet:
                vendor_name = strip_wallet_reference(vendor_name, wallet.name)
        vendor_name = re.sub(r"\s{2,}", " ", vendor_name).strip()
        if not vendor_name:
            vendor_name = t["no_note"]
        reply_note = vendor_name
        if used_explicit_wallet_prefix and wallet:
            vendor_name = append_wallet_label_to_note(vendor_name, wallet_display_name(wallet))

        # Note comes from what the user typed, minus the leading category keyword,
        # the amount, and the wallet token (e.g. "makan nasi ayam 5 tng" -> note
        # "nasi ayam"). Only strip the leading keyword when it actually matched a
        # category so free-text messages keep their full wording.
        txn_notes = text
        if cat and not multi_item_transaction:
            # A receipt-scan text carries a date token (e.g. "merchant 5 @2801") and
            # its description is the merchant name, so it should have no separate note.
            if re.search(r"\s@\d{4,8}(?=\s|$)", txn_notes):
                txn_notes = None
            else:
                amount_match = AMOUNT_PATTERN.search(txn_notes)
                if amount_match:
                    txn_notes = txn_notes.replace(amount_match.group(0), " ").strip()
                if used_explicit_wallet_prefix and wallet:
                    txn_notes = strip_wallet_reference(txn_notes, wallet.name)
                parts = txn_notes.split(None, 1)
                if parts:
                    txn_notes = parts[1] if len(parts) > 1 else ""
        txn_notes = re.sub(r"\s{2,}", " ", txn_notes).strip()
        txn_notes = txn_notes or None

        wallet_switch_note = ""
        push_wallet_insufficient = False
        push_wallet_balance = 0.0
        push_expense_amount = float(amount or 0)
        if wallet and all(int(existing_wallet.id) != int(wallet.id) for existing_wallet in user_wallets):
            user_wallets.append(wallet)

        if txn_type == "expense" and wallet:
            wallet_balances = await _get_wallet_balances(db, user_wallets)
            selected_wallet_balance = next(
                (balance for candidate_wallet, balance in wallet_balances if int(candidate_wallet.id) == int(wallet.id)),
                await _get_wallet_balance(db, wallet.id),
            )
            if selected_wallet_balance + 0.004 < float(amount or 0):
                push_wallet_insufficient = True
                push_wallet_balance = float(selected_wallet_balance or 0)
                amount_label = private_value if hide_group_expense else f"RM {float(amount or 0):,.2f}"
                wallet_options = _format_wallet_option_lines(
                    wallet_balances,
                    hide_balance=hide_group_balance,
                    private_value=private_value,
                )
                sufficient_wallets = [
                    (candidate_wallet, balance)
                    for candidate_wallet, balance in wallet_balances
                    if int(candidate_wallet.id) != int(wallet.id) and balance + 0.004 >= float(amount or 0)
                ]

                if sufficient_wallets:
                    option_wallet_ids = [int(option_wallet.id) for option_wallet, _ in wallet_balances]
                    example = str(option_wallet_ids.index(int(sufficient_wallets[0][0].id)) + 1)
                    insufficient_key = "expense_insufficient_wallet_hidden" if hide_group_balance else "expense_insufficient_wallet"
                    wallet_switch_note = t[insufficient_key].format(
                        wallet_name=wallet_display_name(wallet),
                        amount=amount_label,
                        balance=f"RM {selected_wallet_balance:,.2f}",
                        private_value=private_value,
                        wallet_options=wallet_options,
                        example=example,
                    )
                else:
                    wallet_switch_note = t["expense_no_sufficient_wallet"].format(
                        amount=amount_label,
                        wallet_name=wallet_display_name(wallet),
                        wallet_options=wallet_options,
                    )

        # 7. Save transaction
        txn_date = explicit_txn_date or current_business_date()
        parsed_txn_time = None
        if txn_time:
            try:
                parsed_txn_time = datetime.strptime(txn_time, "%H:%M").time()
            except ValueError:
                parsed_txn_time = None

        txn = models.Transaction(
            wallet_id=wallet.id,
            user_id=user_id,
            reference_id=models.generate_txn_reference(txn_date),
            type=txn_type,
            txn_date=txn_date,
            txn_time=parsed_txn_time,
            vendor_or_source=vendor_name[:50],
            amount=amount,
            category_id=cat.id if cat else None,
            notes=txn_notes,
            latitude=resolved_latitude,
            longitude=resolved_longitude,
            location_name=resolved_location_name,
            source_channel=source_channel
        )
        db.add(txn)
        await db.flush()
        transaction_items = multi_item_transaction["items"] if multi_item_transaction else []
        if not transaction_items and txn_type == "expense" and float(amount or 0) > 0:
            transaction_items = [{
                "sort_order": 0,
                "name": vendor_name[:190] if vendor_name else t["no_note"],
                "quantity": 1.0,
                "unit_price": round(float(amount or 0), 2),
                "subtotal": round(float(amount or 0), 2),
            }]
        if transaction_items:
            db.add_all([
                models.TransactionItem(
                    transaction_id=txn.id,
                    sort_order=item["sort_order"],
                    name=item["name"],
                    quantity=item["quantity"],
                    unit_price=item["unit_price"],
                    subtotal=item["subtotal"],
                )
                for item in transaction_items
            ])
        await db.commit()
        await db.refresh(txn)

        # Attach the receipt media that was scanned earlier but deferred until the
        # user chose a category/wallet (OCR media flow).
        pending_media = _take_pending_receipt_media(user_id, source_channel)
        if pending_media and txn:
            try:
                media_reply = await process_whatsapp_media_message(
                    db=db,
                    user_id=user_id,
                    phone=phone,
                    payload=pending_media.get("payload"),
                    mime_type=pending_media.get("mime_type"),
                    file_name=pending_media.get("file_name"),
                    caption="",
                    target_txn_ref=None,
                    target_txn_override=txn,
                    source_channel=source_channel,
                    show_current_balance=show_current_balance,
                    show_expense_amount=show_expense_amount,
                    show_income_amount=show_income_amount,
                    existing_object_key=pending_media.get("object_key"),
                    media_size_bytes=pending_media.get("size_bytes"),
                )
                if media_reply:
                    _safe_print(f"[WA] Receipt attached to {txn.reference_id}")
            except Exception as exc:
                _safe_print(f"[WA] Failed to attach receipt media: {exc}")
        
        # 8. Calculate total balance
        balance = await get_user_balance(db, user_id)
        wallet_balance = await _get_wallet_balance(db, wallet.id)
        wallet_reply_name = _format_wallet_reply_name(
            wallet_display_name(wallet),
            wallet_balance,
            hide_balance=hide_group_balance,
        )
        _safe_print(f"[WA] Success: RM{amount} saved for {user_name}. New Balance: {balance}")

        backdate_hint = (
            f"\n[ Back Date : @{explicit_txn_date.strftime('%d%m%Y')} ]"
            if explicit_txn_date
            else ""
        )
        
        # 10. Final Response
        # If it's a successful transaction, return the confirmation message using translation template
        saved_template = t["saved_hidden_balance"] if hide_group_balance else t["saved"]
        hide_saved_amount = _should_hide_group_amount(
            source_channel=source_channel,
            txn_type=txn_type,
            show_expense_amount=show_expense_amount,
            show_income_amount=show_income_amount,
        )
        lifespan_note = "" if hide_group_balance else await _format_money_lifespan_message(
            db,
            user_id,
            balance,
            user_lang,
            txn_type=txn_type,
            txn_amount=None if hide_saved_amount else amount,
        )
        multi_item_note = ""
        time_note = f"\n• Masa: *{txn_time}*" if parsed_txn_time else ""
        if user_lang == "EN" and time_note:
            time_note = f"\n• Time: *{txn_time}*"
        if multi_item_transaction:
            item_title = "Senarai Item" if user_lang == "BM" else "Items"
            item_lines = []
            visible_items = multi_item_transaction["items"][:10]
            for item in visible_items:
                if hide_saved_amount:
                    item_lines.append(f"• {item['name']} : *{private_value}*")
                    continue
                item_quantity = float(item["quantity"])
                item_qty_text = f"{item_quantity:g}"
                item_unit_text = f"RM {float(item['unit_price']):,.2f}"
                item_amount = f"RM {float(item['subtotal']):,.2f}"
                if abs(item_quantity - 1.0) < 0.0001:
                    item_lines.append(f"• {item['name']} : *{item_amount}*")
                else:
                    item_lines.append(f"• {item['name']} : {item_qty_text} x {item_unit_text} = *{item_amount}*")
            if len(multi_item_transaction["items"]) > len(visible_items):
                remaining = len(multi_item_transaction["items"]) - len(visible_items)
                more_label = "item lagi" if user_lang == "BM" else "more items"
                item_lines.append(f"• +{remaining} {more_label}")
            multi_item_note = f"\n\n*{item_title}*\n" + "\n".join(item_lines)
        category_suggestion_note = ""
        if not hide_group_balance and category_suggestions:
            suggestion_names = ", ".join(f"*{item.name}*" for item in category_suggestions[:3])
            if user_lang == "EN":
                category_suggestion_note = f"\n\n💡 No exact category keyword matched. Suggested categories: {suggestion_names}"
            else:
                category_suggestion_note = f"\n\n💡 Tiada padanan keyword kategori yang tepat. Cadangan kategori: {suggestion_names}"


        return saved_template.format(
            ref_id=txn.reference_id,
            text=reply_note,
            wallet_name=wallet_reply_name,
            cat=cat_name,
            amount=private_value if hide_saved_amount else f"RM {amount:,.2f}",
            txn_date=txn_date.strftime("%d/%m/%Y"),
            time_note=time_note,
            balance=private_value if hide_group_balance else f"RM {balance:,.2f}",
            backdate_hint=backdate_hint,
            private_value=private_value,
        ) + multi_item_note + category_suggestion_note + wallet_switch_note + lifespan_note, txn
    except Exception as e:
        import traceback
        _safe_print(f"[WA] ERROR: {str(e)}")
        try:
            traceback.print_exc()
        except Exception:
            pass
        # Fallback to BM error even if user set EN, as we might have lost 't' context
        return "Maaf, ralat teknikal berlaku semasa menyimpan data anda.", None


async def process_whatsapp_message(*args, **kwargs) -> Tuple[Optional[str], Optional[models.Transaction]]:
    reply, txn = await _process_whatsapp_message_impl(*args, **kwargs)
    return format_corporate_bot_reply(reply), txn


def _looks_like_category_prompt(text: Optional[str]) -> bool:
    lowered = (text or "").lower()
    return (
        "sila masukkan kategori" in lowered
        or "pilih kategori" in lowered
        or "please choose a category" in lowered
        or "pick one first" in lowered
        or "reply with 1, 2, or 3" in lowered
        or "balas nombor 1, 2, atau 3" in lowered
        or "transaction not saved yet" in lowered
        or "transaksi belum disimpan" in lowered
        or "balas kategori" in lowered
        or "reply category" in lowered
    )


def _extract_transaction_reference(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    match = re.search(r"\b(TXN\d{2}-[A-Z0-9]{6})\b", text.upper())
    return match.group(1) if match else None


def _default_media_name(mime_type: Optional[str]) -> str:
    mime_to_ext = {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    ext = mime_to_ext.get((mime_type or "").split(";")[0].lower(), ".bin")
    return f"receipt{ext}"


async def _pick_target_transaction(
    db: AsyncSession,
    user_id: str,
    caption: Optional[str],
    target_txn_ref: Optional[str] = None,
) -> Optional[models.Transaction]:
    reference_id = _extract_transaction_reference(target_txn_ref) or _extract_transaction_reference(caption)
    if reference_id:
        ref_res = await db.execute(
            select(models.Transaction).where(
                models.Transaction.user_id == user_id,
                models.Transaction.reference_id == reference_id,
            )
        )
        ref_txn = ref_res.scalars().first()
        if ref_txn:
            return ref_txn
        return None

    latest_res = await db.execute(
        select(models.Transaction)
        .where(models.Transaction.user_id == user_id)
        .order_by(models.Transaction.created_at.desc())
        .limit(1)
    )
    return latest_res.scalars().first()


async def _process_whatsapp_media_message_impl(
    db: AsyncSession,
    user_id: str,
    phone: str,
    payload: Optional[bytes],
    mime_type: Optional[str],
    file_name: Optional[str],
    caption: Optional[str] = None,
    target_txn_ref: Optional[str] = None,
    target_txn_override: Optional[models.Transaction] = None,
    source_channel: str = "whatsapp",
    show_current_balance: bool = True,
    show_expense_amount: bool = True,
    show_income_amount: bool = True,
    existing_object_key: Optional[str] = None,
    media_size_bytes: Optional[int] = None,
):
    started_at = datetime.utcnow()
    is_en = False
    object_key: Optional[str] = existing_object_key

    async def cleanup_existing_object() -> None:
        if not existing_object_key:
            return
        try:
            await asyncio.to_thread(storage_service.delete_receipt_object, existing_object_key)
        except Exception:
            pass

    try:
        user_result = await db.execute(select(models.User).where(models.User.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            print(f"[WA] User {user_id} not found for media upload.")
            await cleanup_existing_object()
            return "Pengguna tidak dijumpai."

        user_lang = getattr(user, "language", "BM")
        t = BOT_TRANSLATIONS.get(user_lang, BOT_TRANSLATIONS["BM"])
        is_en = user_lang == "EN"
        private_value = t["private_value"]
        hide_group_balance = source_channel == "whatsapp_group" and not show_current_balance
        
        target_txn = None
        if target_txn_ref:
            target_txn = await _pick_target_transaction(
                db,
                user_id,
                None,
                target_txn_ref=target_txn_ref,
            )
        if target_txn_ref and not target_txn:
            await cleanup_existing_object()
            return (
                f"❌ Transaction {target_txn_ref} was not found. Receipt upload failed."
                if is_en
                else f"❌ Transaksi {target_txn_ref} tidak dijumpai. Upload lampiran gagal."
            )
        if not target_txn:
            target_txn = target_txn_override
            
        if not target_txn:
            await cleanup_existing_object()
            return (
                "❌ No transaction found. Send an expense first, then resend the receipt."
                if is_en
                else "❌ Tiada transaksi dijumpai. Hantar belanja dulu, kemudian hantar semula resit."
            )

        incoming_name = file_name or _default_media_name(mime_type)
        print(
            f"[WA][media-timing] start user={user_id} channel={source_channel} file={incoming_name} mime={mime_type or '-'} bytes={len(payload or b'')} existing_key={'yes' if existing_object_key else 'no'} target_ref={target_txn_ref or '-'} total_ms={(datetime.utcnow() - started_at).total_seconds() * 1000:.1f}"
        )
        try:
            if existing_object_key:
                validated_mime, extension = storage_service.validate_receipt_metadata(incoming_name, mime_type)
            else:
                validated_mime, extension = storage_service.validate_receipt_file(incoming_name, mime_type, payload or b"")
        except storage_service.StorageValidationError as exc:
            await cleanup_existing_object()
            return (
                f"Receipt rejected: {exc}"
                if is_en
                else f"Resit ditolak: {exc}"
            )

        if not existing_object_key:
            object_key = storage_service.build_receipt_object_key(
                user_id=user_id,
                transaction_id=target_txn.id,
                filename=incoming_name,
                extension=extension,
            )
        target_ref_id = target_txn.reference_id or f"#{target_txn.id}"

        if not existing_object_key:
            try:
                storage_started_at = datetime.utcnow()
                await asyncio.to_thread(storage_service.upload_receipt_object, object_key, payload or b"", validated_mime)
                print(
                    f"[WA][media-timing] storage_ok user={user_id} file={incoming_name} object_key={object_key or '-'} storage_ms={(datetime.utcnow() - storage_started_at).total_seconds() * 1000:.1f} total_ms={(datetime.utcnow() - started_at).total_seconds() * 1000:.1f}"
                )
            except storage_service.StorageError as exc:
                print(f"[WA] Storage upload failed: {exc}")
                return (
                    "Image processing took too long or failed. Please re-upload this image."
                    if is_en
                    else "Gambar ambil masa terlalu lama atau gagal diproses. Sila upload semula gambar ini."
                )

        safe_name = Path(incoming_name).name or _default_media_name(validated_mime)
        stored_size_bytes = media_size_bytes if media_size_bytes is not None else len(payload or b"")
        attachment = models.Attachment(
            transaction_id=target_txn.id,
            uploaded_by_user_id=user_id,
            file_name=safe_name,
            file_path=object_key,
            mime_type=validated_mime,
            size_bytes=stored_size_bytes,
        )
        db.add(attachment)
        try:
            commit_started_at = datetime.utcnow()
            await db.commit()
            print(
                f"[WA][media-timing] commit_ok user={user_id} txn={target_ref_id} attachment_name={safe_name} commit_ms={(datetime.utcnow() - commit_started_at).total_seconds() * 1000:.1f} total_ms={(datetime.utcnow() - started_at).total_seconds() * 1000:.1f}"
            )
        except Exception:
            await db.rollback()
            if object_key:
                try:
                    await asyncio.to_thread(storage_service.delete_receipt_object, object_key)
                except Exception:
                    pass
            raise

        balance = await get_user_balance(db, user_id)
        receipt_template = t["receipt_success_hidden_balance"] if hide_group_balance else t["receipt_success"]
        print(
            f"[WA][media-timing] done user={user_id} txn={target_ref_id} total_ms={(datetime.utcnow() - started_at).total_seconds() * 1000:.1f}"
        )
        return receipt_template.format(
            ref_id=target_ref_id,
            balance=private_value if hide_group_balance else f"RM {balance:,.2f}",
            private_value=private_value,
        )
    except Exception as e:
        import traceback

        print(f"[WA] MEDIA ERROR: {str(e)}")
        traceback.print_exc()
        await cleanup_existing_object()
        return (
            "Sorry, technical error while uploading receipt."
            if is_en
            else "Maaf, ralat teknikal semasa upload resit."
        )

async def process_whatsapp_media_message(*args, **kwargs):
    reply = await _process_whatsapp_media_message_impl(*args, **kwargs)
    return format_corporate_bot_reply(reply)
