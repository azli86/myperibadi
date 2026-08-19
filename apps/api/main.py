import asyncio
import random
import secrets
import base64
import binascii
import hmac
import os
import subprocess
import hashlib
import time
import math
import ipaddress
import sys

# Windows consoles default to cp1252/charmap and crash on emoji in print().
# Force UTF-8 early so chat/bot replies with emoji do not raise UnicodeEncodeError.
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Email verification grace: how long a new user has to verify before the account
# is auto-disabled, and how long a verify link stays valid. Extended from 2 to 14
# days because 2 days was trapping users whose verify link expired (token purged)
# while their account got auto-disabled with no way to re-verify or login.
EMAIL_VERIFY_GRACE_DAYS = 14

import httpx
from fastapi import FastAPI, Depends, HTTPException, status, Query, Request, UploadFile, File, Form, Response, Body
from fastapi.responses import StreamingResponse, HTMLResponse, PlainTextResponse, RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, or_, and_, text, case, delete as sa_delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from typing import List, Dict, Any, Awaitable, Callable, Optional
from datetime import datetime, timedelta, date, timezone
from collections import deque
from pathlib import Path
from urllib.parse import quote
import mimetypes
from uuid import uuid4
from io import StringIO
from decimal import Decimal, ROUND_HALF_UP
import models, schemas, auth_utils, database, email_service
import push_service
from llm_service import get_llm_config, _request_model_reply

async def get_removed_business_user(*args, **kwargs):
    raise HTTPException(status_code=404, detail="RemovedBusiness moved to separate app")

from modules.auth import (
    register_route as _module_register_route,
    login_route as _module_login_route,
    pin_login_route as _module_pin_login_route,
    refresh_auth_token_route as _module_refresh_auth_token_route,
    logout_route as _module_logout_route,
    forgot_password_route as _module_forgot_password_route,
    reset_password_route as _module_reset_password_route,
)
from modules.user_profile import (
    get_my_profile_route as _module_get_my_profile_route,
    update_my_profile_route as _module_update_my_profile_route,
    request_my_email_change_route as _module_request_my_email_change_route,
    confirm_my_email_change_route as _module_confirm_my_email_change_route,
    get_my_pin_status_route as _module_get_my_pin_status_route,
    verify_my_pin_route as _module_verify_my_pin_route,
    set_my_pin_route as _module_set_my_pin_route,
    delete_my_pin_route as _module_delete_my_pin_route,
    change_my_password_route as _module_change_my_password_route,
    delete_my_account_route as _module_delete_my_account_route,
    reset_my_account_route as _module_reset_my_account_route,
)
from modules.wallets import (
    get_wallets_route as _module_get_wallets_route,
    create_wallet_route as _module_create_wallet_route,
    update_wallet_route as _module_update_wallet_route,
    delete_wallet_route as _module_delete_wallet_route,
)
from modules.categories import (
    get_categories_route as _module_get_categories_route,
    get_category_keywords_route as _module_get_category_keywords_route,
    create_category_route as _module_create_category_route,
    add_category_keyword_route as _module_add_category_keyword_route,
    delete_category_route as _module_delete_category_route,
    delete_keyword_route as _module_delete_keyword_route,
    update_category_route as _module_update_category_route,
    update_keyword_route as _module_update_keyword_route,
    get_category_layout_route as _module_get_category_layout_route,
    put_category_layout_route as _module_put_category_layout_route,
)
from modules.budgets import (
    get_budgets_route as _module_get_budgets_route,
    create_budget_route as _module_create_budget_route,
    update_budget_route as _module_update_budget_route,
    delete_budget_route as _module_delete_budget_route,
    get_budget_summary_route as _module_get_budget_summary_route,
)
from modules.debtors import (
    get_debtors_route as _module_get_debtors_route,
    create_debtor_route as _module_create_debtor_route,
    delete_debtor_route as _module_delete_debtor_route,
)
from modules.loans import (
    get_loans_route as _module_get_loans_route,
    create_loan_route as _module_create_loan_route,
    update_loan_route as _module_update_loan_route,
    get_loan_route as _module_get_loan_route,
    delete_loan_route as _module_delete_loan_route,
    get_loan_payments_route as _module_get_loan_payments_route,
    create_loan_payment_route as _module_create_loan_payment_route,
    delete_loan_payment_route as _module_delete_loan_payment_route,
)
from modules.subscriptions import (
    get_subscriptions_route as _module_get_subscriptions_route,
    create_subscription_route as _module_create_subscription_route,
    update_subscription_route as _module_update_subscription_route,
    get_subscription_route as _module_get_subscription_route,
    delete_subscription_route as _module_delete_subscription_route,
)
from modules.monthly_checkoffs import (
    get_monthly_checkoffs_route as _module_get_monthly_checkoffs_route,
    create_monthly_checkoff_route as _module_create_monthly_checkoff_route,
    delete_monthly_checkoff_route as _module_delete_monthly_checkoff_route,
)
from modules.debts import (
    get_debt_summaries_route as _module_get_debt_summaries_route,
    get_debt_entries_route as _module_get_debt_entries_route,
    create_debt_entry_route as _module_create_debt_entry_route,
    delete_debt_entry_route as _module_delete_debt_entry_route,
)
from modules.transactions_overview import (
    get_wa_status_route as _module_get_wa_status_route,
    get_transactions_route as _module_get_transactions_route,
    get_transaction_map_points_route as _module_get_transaction_map_points_route,
    sync_transaction_location_names_route as _module_sync_transaction_location_names_route,
)
from modules.transaction_details import (
    get_transaction_detail_route as _module_get_transaction_detail_route,
    get_transaction_attachments_route as _module_get_transaction_attachments_route,
    upload_transaction_attachment_route as _module_upload_transaction_attachment_route,
    get_attachment_file_route as _module_get_attachment_file_route,
    get_attachment_pdf_preview_route as _module_get_attachment_pdf_preview_route,
    delete_attachment_route as _module_delete_attachment_route,
    get_receipts_route as _module_get_receipts_route,
)
from modules.transactions_mutations import (
    update_transaction_route as _module_update_transaction_route,
    delete_transaction_route as _module_delete_transaction_route,
    refund_transaction_route as _module_refund_transaction_route,
    create_transaction_route as _module_create_transaction_route,
)
from modules.telegram_link import (
    internal_push_whatsapp_reconnect_route as _module_internal_push_whatsapp_reconnect_route,
    request_telegram_link_route as _module_request_telegram_link_route,
    get_telegram_link_status_route as _module_get_telegram_link_status_route,
    unlink_telegram_route as _module_unlink_telegram_route,
)
from modules.dashboard_stats import (
    get_dashboard_stats_route as _module_get_dashboard_stats_route,
)
from modules.chat_api import (
    create_chat_receipt_upload_route as _module_create_chat_receipt_upload_route,
    send_web_chat_message_route as _module_send_web_chat_message_route,
    get_web_chat_messages_route as _module_get_web_chat_messages_route,
)
from modules.whatsapp_webhook import (
    whatsapp_webhook_route as _module_whatsapp_webhook_route,
)
from modules.telegram_webhook_entry import (
    telegram_should_show_processing_before_handle_route as _module_telegram_should_show_processing_before_handle_route,
    process_telegram_webhook_payload_background_route as _module_process_telegram_webhook_payload_background_route,
    telegram_webhook_route as _module_telegram_webhook_route,
)
from modules.worker_gateway import (
    worker_request_json_route as _module_worker_request_json_route,
    send_worker_message_route as _module_send_worker_message_route,
    fetch_session_route as _module_fetch_session_route,
    delete_session_route as _module_delete_session_route,
    pair_session_route as _module_pair_session_route,
    fetch_worker_groups_route as _module_fetch_worker_groups_route,
)
from modules.webhook_payloads import (
    ChatUploadPresignRequest,
    WhatsAppWebhookPayload,
    TelegramWebhookPayload,
)
from modules.worker_watchdog import (
    ensure_worker_running_route as _module_ensure_worker_running_route,
)
from modules.telegram_webhook_handler import (
    handle_telegram_webhook_payload_route as _module_handle_telegram_webhook_payload_route,
)
from modules.telegram_state import (
    telegram_pending_media_key_route as _module_telegram_pending_media_key_route,
    set_telegram_pending_media_route as _module_set_telegram_pending_media_route,
    pop_telegram_pending_media_route as _module_pop_telegram_pending_media_route,
    sweep_telegram_pending_media_route as _module_sweep_telegram_pending_media_route,
    telegram_add_flow_key_route as _module_telegram_add_flow_key_route,
    set_telegram_add_flow_route as _module_set_telegram_add_flow_route,
    get_telegram_add_flow_route as _module_get_telegram_add_flow_route,
    clear_telegram_add_flow_route as _module_clear_telegram_add_flow_route,
    remember_telegram_add_flow_message_route as _module_remember_telegram_add_flow_message_route,
    cleanup_telegram_add_flow_messages_route as _module_cleanup_telegram_add_flow_messages_route,
    send_telegram_add_flow_message_route as _module_send_telegram_add_flow_message_route,
    sweep_telegram_add_flows_route as _module_sweep_telegram_add_flows_route,
)
from modules.telegram_ui_helpers import (
    format_telegram_amount_preview_route as _module_format_telegram_amount_preview_route,
    parse_telegram_amount_text_route as _module_parse_telegram_amount_text_route,
    build_telegram_add_type_keyboard_route as _module_build_telegram_add_type_keyboard_route,
    build_telegram_debt_type_keyboard_route as _module_build_telegram_debt_type_keyboard_route,
    build_telegram_transfer_wallet_keyboard_route as _module_build_telegram_transfer_wallet_keyboard_route,
    build_telegram_debt_help_text_route as _module_build_telegram_debt_help_text_route,
    build_telegram_transfer_help_text_route as _module_build_telegram_transfer_help_text_route,
    build_telegram_loan_help_text_route as _module_build_telegram_loan_help_text_route,
    match_wallet_by_hint_route as _module_match_wallet_by_hint_route,
    is_category_prompt_reply_route as _module_is_category_prompt_reply_route,
    telegram_update_has_media_route as _module_telegram_update_has_media_route,
    build_telegram_processing_text_route as _module_build_telegram_processing_text_route,
    build_telegram_add_preview_text_route as _module_build_telegram_add_preview_text_route,
)
from modules.telegram_callback import (
    handle_telegram_callback_query_route as _module_handle_telegram_callback_query_route,
)
from modules.telegram_loanx import (
    handle_telegram_loanx_command_route as _module_handle_telegram_loanx_command_route,
)
from modules.telegram_splitx import (
    handle_telegram_splitx_command_route as _module_handle_telegram_splitx_command_route,
)
from modules.telegram_wallet_category import (
    build_telegram_add_category_keyboard_route as _module_build_telegram_add_category_keyboard_route,
    build_telegram_numeric_choice_keyboard_route as _module_build_telegram_numeric_choice_keyboard_route,
    get_telegram_wallets_for_user_route as _module_get_telegram_wallets_for_user_route,
    build_telegram_wallet_keyboard_route as _module_build_telegram_wallet_keyboard_route,
    match_telegram_wallet_choice_route as _module_match_telegram_wallet_choice_route,
    get_telegram_categories_by_kind_route as _module_get_telegram_categories_by_kind_route,
    get_telegram_categories_menu_text_route as _module_get_telegram_categories_menu_text_route,
)
from modules.telegram_add_flow_menu import (
    show_telegram_add_type_menu_route as _module_show_telegram_add_type_menu_route,
    show_telegram_add_category_menu_route as _module_show_telegram_add_category_menu_route,
    show_telegram_add_wallet_menu_route as _module_show_telegram_add_wallet_menu_route,
)
from modules.telegram_transport import (
    build_telegram_choice_keyboard_route as _module_build_telegram_choice_keyboard_route,
    build_telegram_inline_keyboard_route as _module_build_telegram_inline_keyboard_route,
    build_telegram_keyboard_route as _module_build_telegram_keyboard_route,
    normalize_telegram_command_route as _module_normalize_telegram_command_route,
    build_telegram_message_key_route as _module_build_telegram_message_key_route,
    edit_telegram_message_text_route as _module_edit_telegram_message_text_route,
    answer_telegram_callback_route as _module_answer_telegram_callback_route,
    download_telegram_file_route as _module_download_telegram_file_route,
    send_telegram_message_route as _module_send_telegram_message_route,
    delete_telegram_message_route as _module_delete_telegram_message_route,
)
from modules.telegram_link_store import (
    get_telegram_link_by_user_id_route as _module_get_telegram_link_by_user_id_route,
    get_telegram_link_by_identity_route as _module_get_telegram_link_by_identity_route,
    get_telegram_link_by_identity_any_state_route as _module_get_telegram_link_by_identity_any_state_route,
    mark_telegram_event_if_new_route as _module_mark_telegram_event_if_new_route,
    consume_telegram_pair_code_route as _module_consume_telegram_pair_code_route,
)
from modules.telegram_api_core import (
    has_valid_telegram_webhook_secret_route as _module_has_valid_telegram_webhook_secret_route,
    telegram_api_request_route as _module_telegram_api_request_route,
    sync_telegram_bot_commands_route as _module_sync_telegram_bot_commands_route,
)
from modules.bot_input_handler import (
    process_bot_input_route as _module_process_bot_input_route,
)
from modules.whatsapp_admin import (
    get_internal_whatsapp_group_rules_route as _module_get_internal_whatsapp_group_rules_route,
    get_internal_whatsapp_removed_business_routing_route as _module_get_internal_whatsapp_removed_business_routing_route,
    get_whatsapp_group_rules_route as _module_get_whatsapp_group_rules_route,
    get_available_whatsapp_groups_route as _module_get_available_whatsapp_groups_route,
    create_whatsapp_group_rule_route as _module_create_whatsapp_group_rule_route,
    update_whatsapp_group_rule_route as _module_update_whatsapp_group_rule_route,
    delete_whatsapp_group_rule_route as _module_delete_whatsapp_group_rule_route,
    get_whatsapp_session_route as _module_get_whatsapp_session_route,
    update_whatsapp_session_settings_route as _module_update_whatsapp_session_settings_route,
    logout_whatsapp_session_route as _module_logout_whatsapp_session_route,
    pair_whatsapp_session_route as _module_pair_whatsapp_session_route,
)
from time_utils import current_business_date
from fastapi.security import OAuth2PasswordBearer
import storage_service
import location_service
import whatsapp_service
import budget_service
import account_cleanup_service
import scam_service
import urllib.request
import urllib.error
import urllib.parse
import json
import csv
import asyncio
import base64
import binascii
import re
import fitz
import html

# Backward-compatible wrappers after modular split (removed_business dispatch/reply helpers)
def _removed_business_resolve_whatsapp_target(target: str | None) -> str | None:
    return _module_removed_business_resolve_whatsapp_target(target)


def _removed_business_resolve_outbound_channel(order: models.BusinessOrder, explicit_channel: str | None = None) -> str:
    return _module_removed_business_resolve_outbound_channel(order, explicit_channel)


def _removed_business_build_reminder_dispatch_message(order: models.BusinessOrder, language: str | None = None) -> str:
    return _module_removed_business_build_reminder_dispatch_message(order, language)


async def _send_telegram_photo(
    *,
    chat_id: str,
    photo_url: str,
    caption: str | None = None,
) -> dict[str, Any] | None:
    return await _module_send_telegram_photo(
        chat_id=chat_id,
        photo_url=photo_url,
        caption=caption,
        telegram_api_request=_telegram_api_request,
    )


async def _send_cloud_api_message(user_id: str, recipient: str, message: str, image_urls: list[str], document_urls: list[str] = None) -> tuple[bool, str | None]:
    result = await database.SessionLocal().__aenter__()
    db = result
    try:
        row_result = await db.execute(
            select(models.UserSetting).where(
                models.UserSetting.user_id == user_id,
                models.UserSetting.key == 'removed_business_whatsapp_cloud_api',
            )
        )
        row = row_result.scalar_one_or_none()
        data = {}
        if row and row.value:
            try:
                parsed = json.loads(row.value)
                if isinstance(parsed, dict):
                    data = parsed
            except Exception:
                data = {}
        phone_number_id = str(data.get('phone_number_id') or '').strip()
        access_token = str(data.get('access_token') or '').strip()
        if not phone_number_id or not access_token:
            return False, 'Cloud API phone_number_id or access_token missing.'
        recipient_digits = re.sub(r'\D', '', (recipient or '').strip())
        if not recipient_digits:
            return False, 'Missing Cloud API recipient.'
        api_url = f'https://graph.facebook.com/v23.0/{phone_number_id}/messages'

        def _post_json(payload: dict[str, Any]) -> tuple[bool, str | None]:
            req = urllib.request.Request(api_url, data=json.dumps(payload).encode('utf-8'), method='POST')
            req.add_header('Authorization', f'Bearer {access_token}')
            req.add_header('Content-Type', 'application/json')
            try:
                with urllib.request.urlopen(req, timeout=45) as response:
                    body = response.read().decode('utf-8', errors='ignore')
                    return 200 <= int(response.status) < 300, body
            except urllib.error.HTTPError as exc:
                return False, exc.read().decode('utf-8', errors='ignore')
            except Exception as exc:
                return False, str(exc)

        # If we have both text and images, send first image with caption
        if image_urls and message:
            first_image = image_urls[0]
            ok, detail = await asyncio.to_thread(_post_json, {
                'messaging_product': 'whatsapp',
                'to': recipient_digits,
                'type': 'image',
                'image': {'link': first_image, 'caption': message},
            })
            if not ok:
                return False, detail or 'Cloud API image with caption send failed.'
            # Send remaining images without caption
            for image_url in image_urls[1:]:
                ok, detail = await asyncio.to_thread(_post_json, {
                    'messaging_product': 'whatsapp',
                    'to': recipient_digits,
                    'type': 'image',
                    'image': {'link': image_url},
                })
                if not ok:
                    return False, detail or 'Cloud API image send failed.'
        else:
            # Text only or images only
            if message:
                ok, detail = await asyncio.to_thread(_post_json, {
                    'messaging_product': 'whatsapp',
                    'to': recipient_digits,
                    'type': 'text',
                    'text': {'preview_url': False, 'body': message},
                })
                if not ok:
                    return False, detail or 'Cloud API text send failed.'
            for image_url in image_urls:
                ok, detail = await asyncio.to_thread(_post_json, {
                    'messaging_product': 'whatsapp',
                    'to': recipient_digits,
                    'type': 'image',
                    'image': {'link': image_url},
                })
                if not ok:
                    return False, detail or 'Cloud API image send failed.'
        for doc_url in (document_urls or []):
            doc_filename = urllib.parse.unquote(urllib.parse.urlparse(doc_url).path.split('/')[-1] or '') or 'Resit.pdf'
            ok, detail = await asyncio.to_thread(_post_json, {
                'messaging_product': 'whatsapp',
                'to': recipient_digits,
                'type': 'document',
                'document': {'link': doc_url, 'filename': doc_filename},
            })
            if not ok:
                return False, detail or 'Cloud API document send failed.'
        return True, None
    finally:
        await db.close()

async def _removed_business_dispatch_message(
    *,
    user_id: str,
    order: models.BusinessOrder,
    message: str,
    image_urls: list[str],
    document_urls: list[str] = None,
    channel: str,
    recipient: str,
) -> tuple[bool, str | None]:
    return await _module_removed_business_dispatch_message(
        user_id=user_id,
        order=order,
        message=message,
        image_urls=image_urls,
        document_urls=document_urls,
        channel=channel,
        recipient=recipient,
        telegram_api_request=_telegram_api_request,
        send_worker_message=_send_worker_message,
        send_cloud_api_message=_send_cloud_api_message,
        resolve_whatsapp_target=_removed_business_resolve_whatsapp_target,
    )


def _removed_business_build_qr_dispatch_message(
    order: models.BusinessOrder,
    setting: models.BusinessPaymentSetting | None,
    language: str | None = None,
) -> str:
    return _module_removed_business_build_qr_dispatch_message(order, setting, language)

try:
    import redis.asyncio as redis_asyncio
except Exception:  # pragma: no cover - optional dependency
    redis_asyncio = None

app = FastAPI(
    title="BudgetDigitalPort API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
ROBOTS_BLOCK_HEADER = "noindex, nofollow, noarchive, nosnippet, noimageindex"
AUTH_ACCESS_COOKIE_NAME = os.getenv("AUTH_ACCESS_COOKIE_NAME", "bdp_access")
AUTH_REFRESH_COOKIE_NAME = os.getenv("AUTH_REFRESH_COOKIE_NAME", "bdp_refresh")
AUTH_COOKIE_SECURE = os.getenv("AUTH_COOKIE_SECURE", "1").strip().lower() not in {"0", "false", "no", "off"}
AUTH_COOKIE_SAMESITE = os.getenv("AUTH_COOKIE_SAMESITE", "lax").strip().lower()
if AUTH_COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    AUTH_COOKIE_SAMESITE = "lax"
PASSWORD_MIN_LENGTH = int(os.getenv("PASSWORD_MIN_LENGTH", "8"))
PASSWORD_MAX_LENGTH = int(os.getenv("PASSWORD_MAX_LENGTH", "128"))
PIN_LENGTH = int(os.getenv("PIN_LENGTH", "6"))
PIN_MAX_FAILED_ATTEMPTS = int(os.getenv("PIN_MAX_FAILED_ATTEMPTS", "5"))
PIN_LOCK_MINUTES = int(os.getenv("PIN_LOCK_MINUTES", "15"))
WHATSAPP_INBOUND_EVENT_RETENTION_DAYS = int(os.getenv("WHATSAPP_INBOUND_EVENT_RETENTION_DAYS", "14"))
RECEIPT_DIRECT_UPLOAD_MAX_BYTES = int(os.getenv("RECEIPT_DIRECT_UPLOAD_MAX_BYTES", str(8 * 1024 * 1024)))
TELEGRAM_MAX_MEDIA_BYTES = int(os.getenv("TELEGRAM_MAX_MEDIA_BYTES", str(RECEIPT_DIRECT_UPLOAD_MAX_BYTES)))
RECEIPT_DIRECT_UPLOAD_EXPIRES_SECONDS = int(os.getenv("RECEIPT_DIRECT_UPLOAD_EXPIRES_SECONDS", "300"))
AUTH_RATE_LIMIT_RULES = {
    "register": (6, 300),           # 6 requests per 5 minutes
    "login": (8, 300),              # 8 requests per 5 minutes
    "pin_login": (10, 300),        # 10 requests per 5 minutes
    "forgot_password": (5, 900),    # 5 requests per 15 minutes
    "reset_password": (8, 900),     # 8 requests per 15 minutes
    "refresh": (30, 300),           # 30 requests per 5 minutes
    "data_get": (1000, 60),         # 1000 requests per minute per user (anti-bot polling; blocks 873/min bots)
    "loans_get": (90, 60),          # 90 loans per minute per user (stops runaway /loans poll loops)
}
AUTH_RATE_LIMIT_BUCKETS: dict[str, deque[float]] = {}
AUTH_RATE_LIMIT_LAST_SWEEP = 0.0
AUTH_RATE_LIMIT_SWEEP_INTERVAL_SECONDS = 300
AUTH_RATE_LIMIT_MAX_BUCKETS = 50000
AUTH_RATE_LIMIT_REDIS_URL = (os.getenv("AUTH_RATE_LIMIT_REDIS_URL") or os.getenv("REDIS_URL") or "").strip()
AUTH_RATE_LIMIT_REDIS_PREFIX = os.getenv("AUTH_RATE_LIMIT_REDIS_PREFIX", "budget-by-digitalport:authrl").strip()
AUTH_RATE_LIMIT_REDIS_KEY_GRACE_SECONDS = 30
AUTH_RATE_LIMIT_REDIS_CLIENT = None
AUTH_RATE_LIMIT_REDIS_UNAVAILABLE = False


def _split_csv_env(name: str, default: list[str]) -> list[str]:
    raw_value = os.getenv(name, "")
    if not raw_value.strip():
        return default
    return [item.strip() for item in raw_value.split(",") if item.strip()]


APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "https://budget.digitalport.my").rstrip("/")

DEFAULT_CORS_ALLOW_ORIGINS = [
    APP_PUBLIC_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
CORS_ALLOW_ORIGINS = _split_csv_env("CORS_ALLOW_ORIGINS", DEFAULT_CORS_ALLOW_ORIGINS)
WORKER_BASE_URL = os.getenv("WHATSAPP_WORKER_BASE_URL", "http://127.0.0.1:8024").rstrip("/")
WHATSAPP_WEBHOOK_SECRET = os.getenv("WHATSAPP_WEBHOOK_SECRET", "").strip()
if not WHATSAPP_WEBHOOK_SECRET:
    raise RuntimeError("WHATSAPP_WEBHOOK_SECRET environment variable is required")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_ADMIN_CHAT_ID = os.getenv("TELEGRAM_ADMIN_CHAT_ID", "").strip()
TELEGRAM_ACCESS_LOG_ALERTS = os.getenv("TELEGRAM_ACCESS_LOG_ALERTS", "true").strip().lower() in {"1", "true", "yes", "on"}
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()
TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "").strip().lstrip("@") or None
TELEGRAM_PAIR_CODE_TTL_MINUTES = int(os.getenv("TELEGRAM_PAIR_CODE_TTL_MINUTES", "5"))
TELEGRAM_PAIR_CODE_MAX_ATTEMPTS = max(1, int(os.getenv("TELEGRAM_PAIR_CODE_MAX_ATTEMPTS", "5")))
TELEGRAM_PENDING_MEDIA_TTL_SECONDS = max(60, int(os.getenv("TELEGRAM_PENDING_MEDIA_TTL_SECONDS", "600")))
TELEGRAM_PENDING_MEDIA: dict[str, dict[str, Any]] = {}
TELEGRAM_ADD_FLOW_TTL_SECONDS = max(120, int(os.getenv("TELEGRAM_ADD_FLOW_TTL_SECONDS", "900")))
TELEGRAM_ADD_FLOWS: dict[str, dict[str, Any]] = {}
REMOVED_BUSINESS_ENABLED_USER_IDS = {item.strip() for item in os.getenv("REMOVED_BUSINESS_ENABLED_USER_IDS", "").split(",") if item.strip()}
ADMINPORTAL_TELEGRAM_SETTING_KEY = "adminportal.telegram_access"
ADMINPORTAL_NOTICE_BANNER_SETTING_KEY = "adminportal.notice_banners"
_IP_GEO_CACHE: dict[str, str] = {}

def _request_ip(request: Request) -> str | None:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    real_ip = (request.headers.get("x-real-ip") or "").strip()
    return forwarded or real_ip or (request.client.host if request.client else None)

def _request_token_user_id(request: Request) -> str | None:
    auth_header = request.headers.get("authorization") or ""
    token = auth_header.removeprefix("Bearer ").strip() if auth_header.lower().startswith("bearer ") else ""
    if not token:
        token = request.cookies.get("access_token") or ""
    if not token:
        return None
    payload = auth_utils.decode_access_token(token)
    if not payload:
        return None
    return payload.get("sub") or payload.get("user_id")

def _access_alert_title(path_value: str) -> str:
    return "Budget RemovedBusiness" if path_value.startswith("/removed_business") or path_value.startswith("/api/removed_business") else "Budget"

def _is_private_ip_value(ip_value: str | None) -> bool:
    if not ip_value:
        return True
    try:
        parsed = ipaddress.ip_address(ip_value.replace("::ffff:", ""))
        return parsed.is_private or parsed.is_loopback or parsed.is_link_local
    except ValueError:
        return True

def _country_flag(country_code: str) -> str:
    code = (country_code or "").strip().upper()
    if len(code) != 2 or not code.isalpha():
        return "🌐"
    return "".join(chr(127397 + ord(char)) for char in code)

async def _ip_geo_label(ip_value: str | None) -> str:
    if not ip_value or _is_private_ip_value(ip_value):
        return "🌐 Local"
    if ip_value in _IP_GEO_CACHE:
        return _IP_GEO_CACHE[ip_value]
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.get(f"https://ipapi.co/{ip_value}/json/")
            response.raise_for_status()
            data = response.json()
        label = f"{_country_flag(str(data.get('country_code') or ''))} {str(data.get('country_name') or 'Unknown')}"
    except Exception:
        label = "🌐 Unknown"
    _IP_GEO_CACHE[ip_value] = label
    return label

async def _notify_access_alert(path_value: str, method: str, status_code: int, ip_value: str | None, user_label: str | None) -> None:
    geo_label = await _ip_geo_label(ip_value)
    await _notify_admin_telegram(
        "\n".join([
            f"<b>{html.escape(_access_alert_title(path_value))} Access Alert</b>",
            html.escape(geo_label),
            f"Status: {status_code}",
            f"User: {html.escape(user_label or 'Guest / no session')}",
            "",
            f"IP: {html.escape(ip_value or '-')}",
            html.escape(f"{method} {path_value}"),
        ])
    )

async def _notify_admin_telegram(text_value: str) -> None:
    bot_token = TELEGRAM_BOT_TOKEN
    chat_id = TELEGRAM_ADMIN_CHAT_ID
    try:
        async with database.SessionLocal() as db:
            row = await db.scalar(
                select(models.UserSetting)
                .where(models.UserSetting.key == ADMINPORTAL_TELEGRAM_SETTING_KEY)
                .order_by(models.UserSetting.updated_at.desc())
            )
            if row and row.value:
                data = json.loads(row.value)
                if isinstance(data, dict):
                    bot_token = str(data.get("bot_token") or bot_token).strip()
                    chat_id = str(data.get("admin_chat_id") or chat_id).strip()
    except Exception:
        pass
    if not bot_token or not chat_id:
        return
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={"chat_id": chat_id, "text": text_value[:3900], "parse_mode": "HTML"},
            )
    except Exception:
        pass

def _default_notice_banner_settings() -> dict[str, Any]:
    return {
        "personal": {
            "enabled": False,
            "type": "info",
            "title_bm": "",
            "message_bm": "",
            "title_en": "",
            "message_en": "",
        },
        "removed_business": {
            "enabled": False,
            "type": "info",
            "title_bm": "",
            "message_bm": "",
            "title_en": "",
            "message_en": "",
        },
    }

def _normalize_notice_banner_item(raw: dict[str, Any] | None) -> dict[str, Any]:
    item = dict(raw or {})
    legacy_title = str(item.get("title") or "").strip()
    legacy_message = str(item.get("message") or "").strip()
    title_bm = str(item.get("title_bm") or legacy_title or "")[:120]
    message_bm = str(item.get("message_bm") or legacy_message or "")[:600]
    title_en = str(item.get("title_en") or legacy_title or "")[:120]
    message_en = str(item.get("message_en") or legacy_message or "")[:600]
    notice_type = str(item.get("type") or "info")
    if notice_type not in {"info", "warning", "alert"}:
        notice_type = "info"
    raw_enabled = item.get("enabled", False)
    if isinstance(raw_enabled, str):
        enabled = raw_enabled.strip().lower() in {"1", "true", "yes", "on"}
    else:
        enabled = bool(raw_enabled)
    return {
        "enabled": enabled,
        "type": notice_type,
        "title_bm": title_bm,
        "message_bm": message_bm,
        "title_en": title_en,
        "message_en": message_en,
    }

async def _get_notice_banner_settings(db: AsyncSession) -> dict[str, Any]:
    data = _default_notice_banner_settings()
    # Read every matching row (newest first) and merge so a stale duplicate
    # row never overrides the most recently saved banner config.
    rows = (
        await db.scalars(
            select(models.UserSetting)
            .where(models.UserSetting.key == ADMINPORTAL_NOTICE_BANNER_SETTING_KEY)
            .order_by(models.UserSetting.updated_at.desc())
        )
    ).all()
    for row in rows:
        if not row or not row.value:
            continue
        try:
            saved = json.loads(row.value)
        except Exception:
            continue
        if not isinstance(saved, dict):
            continue
        for scope in ("personal", "removed_business"):
            if isinstance(saved.get(scope), dict):
                data[scope] = _normalize_notice_banner_item(saved[scope])
        # Only the newest row's values are authoritative; older rows ignored.
        break
    for scope in ("personal", "removed_business"):
        data[scope] = _normalize_notice_banner_item(data[scope])
    return data

async def _get_adminportal_telegram_settings(db: AsyncSession) -> dict[str, Any]:
    data: dict[str, Any] = {
        "bot_token": TELEGRAM_BOT_TOKEN,
        "admin_chat_id": TELEGRAM_ADMIN_CHAT_ID,
        "access_log_alerts": TELEGRAM_ACCESS_LOG_ALERTS,
        "alert_status_min": 400,
        "alert_path_contains": "",
    }
    row = await db.scalar(
        select(models.UserSetting)
        .where(models.UserSetting.key == ADMINPORTAL_TELEGRAM_SETTING_KEY)
        .order_by(models.UserSetting.updated_at.desc())
    )
    if row and row.value:
        try:
            saved = json.loads(row.value)
            if isinstance(saved, dict):
                data.update(saved)
        except Exception:
            pass
    return data
ADMINPORTAL_REMOVED_BUSINESS_ACCESS_SETTING_KEY = "adminportal_removed_business_enabled"
REMOVED_BUSINESS_ACCESS_REQUEST_SETTING_KEY = "removed_business_access_request"
REMOVED_BUSINESS_PROFILE_CHANGE_REQUEST_SETTING_KEY = "removed_business_profile_change_request"
REMOVED_BUSINESS_WEBHOOK_SECRET = os.getenv("REMOVED_BUSINESS_WEBHOOK_SECRET", WHATSAPP_WEBHOOK_SECRET)
WHATSAPP_WEBHOOK_LOCAL_ONLY = (
    os.getenv("WHATSAPP_WEBHOOK_LOCAL_ONLY", "true").strip().lower() in {"1", "true", "yes", "on"}
)
TURNSTILE_SECRET_KEY = os.getenv("CLOUDFLARE_TURNSTILE_SECRET_KEY")
TURNSTILE_DISABLE_VERIFICATION = (
    os.getenv("TURNSTILE_DISABLE_VERIFICATION", "false").strip().lower() in {"1", "true", "yes", "on"}
)

# --- Receipt public link token helpers ---
_RECEIPT_TOKEN_VERSION = "r1"

def _removed_business_generate_receipt_token(order_id: int, order_no: str) -> str:
    """Generate a signed public token for a receipt link (no DB required)."""
    payload = f"{_RECEIPT_TOKEN_VERSION}:{order_id}:{order_no}"
    sig = hmac.new(
        auth_utils.SECRET_KEY.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:24]
    import base64 as _b64
    encoded = _b64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    return f"{encoded}.{sig}"

def _removed_business_verify_receipt_token(token: str) -> tuple[int, str] | None:
    """Verify a receipt token and return (order_id, order_no) or None."""
    try:
        import base64 as _b64
        parts = token.rsplit(".", 1)
        if len(parts) != 2:
            return None
        encoded, sig = parts
        padding = 4 - len(encoded) % 4
        payload = _b64.urlsafe_b64decode(encoded + "=" * (padding % 4)).decode()
        expected_sig = hmac.new(
            auth_utils.SECRET_KEY.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()[:24]
        if not hmac.compare_digest(sig, expected_sig):
            return None
        segments = payload.split(":")
        if len(segments) != 3 or segments[0] != _RECEIPT_TOKEN_VERSION:
            return None
        return int(segments[1]), segments[2]
    except Exception:
        return None

# --- End receipt token helpers ---

CATEGORY_ICON_NAMES = {
    "tag",
    "utensils-crossed",
    "shopping-bag",
    "car-front",
    "bus",
    "house",
    "heart-pulse",
    "graduation-cap",
    "shirt",
    "wallet",
    "coins",
    "plane",
    "gift",
    "briefcase",
    "coffee",
    "smartphone",
    "landmark",
    "banknote",
    "film",
    "receipt",
    "brand-shopee",
    "brand-grab",
    "brand-tiktok",
}

CATEGORY_ICON_HINTS = [
    (("shopee",), "brand-shopee"),
    (("grab", "grabfood", "grabpay"), "brand-grab"),
    (("tiktok", "tik tok"), "brand-tiktok"),
    (("makan", "minum", "food", "drink", "restoran", "restaurant", "coffee", "kafe"), "utensils-crossed"),
    (("shopping", "shop", "beli", "mall", "pasar"), "shopping-bag"),
    (("transport", "pengangkutan", "kereta", "car", "petrol", "tol", "parking", "minyak"), "car-front"),
    (("bas", "bus", "lrt", "mrt", "train"), "bus"),
    (("rumah", "home", "house", "sewa", "bill", "bil", "utilities"), "house"),
    (("klinik", "ubat", "hospital", "health", "medical", "kesihatan", "farmasi"), "heart-pulse"),
    (("study", "education", "school", "kelas", "tuition", "pendidikan"), "graduation-cap"),
    (("baju", "shirt", "fashion", "clothes", "pakaian"), "shirt"),
    (("loan", "commitment", "komitmen", "hutang", "debt", "installment", "ansuran"), "wallet"),
    (("saving", "simpanan", "tabung"), "coins"),
    (("travel", "trip", "flight", "holiday", "vacation", "cuti"), "plane"),
    (("gift", "hadiah", "donation", "sedekah"), "gift"),
    (("salary", "gaji", "income", "bonus", "dividend", "pendapatan"), "banknote"),
    (("work", "office", "job", "bisnes", "business"), "briefcase"),
    (("phone", "mobile", "internet", "data", "telco"), "smartphone"),
    (("bank", "investment", "duit", "finance", "wallet"), "landmark"),
    (("movie", "hiburan", "entertainment", "netflix", "game", "wayang"), "film"),
    (("receipt", "resit", "invoice"), "receipt"),
]


def _validate_category_icon_name(icon_name: str | None) -> str | None:
    value = (icon_name or "").strip()
    if not value:
        return None
    limit = 500 if value.startswith("https://") else 32
    if len(value) > limit:
        raise HTTPException(status_code=400, detail="Category icon is too long.")
    return value


def _suggest_category_icon_name(name: str | None, kind: str | None) -> str:
    lowered = (name or "").strip().lower()
    for hints, icon_name in CATEGORY_ICON_HINTS:
        if any(hint in lowered for hint in hints):
            return icon_name
    return "banknote" if kind == "income" else "tag"

@app.on_event("startup")
async def ensure_database_schema():
    print("INFO:  Bot personality module 'Natural Local' version 2.0.2 loaded.")
    async with database.engine.begin() as conn:
        await conn.run_sync(database.Base.metadata.create_all)
        if conn.dialect.name == "postgresql":
            await conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subscription_id BIGINT NULL REFERENCES subscriptions(id) ON DELETE SET NULL"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_subscription_id ON transactions (subscription_id)"))
            await conn.execute(text("UPDATE transactions t SET subscription_id = s.id FROM subscriptions s WHERE t.subscription_id IS NULL AND t.user_id = s.user_id AND LOWER(TRIM(t.vendor_or_source)) = LOWER(TRIM('SUBX ' || s.name))"))
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_transactions_user_date_id ON transactions (user_id, txn_date, id)")
            )
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN NOT NULL DEFAULT TRUE"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS category_language VARCHAR(10) NULL"))
            await conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_kind VARCHAR(20) NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_email_sent_at TIMESTAMP NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token VARCHAR(100) NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token_expires TIMESTAMP NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_email_resend_count INTEGER NOT NULL DEFAULT 0"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_reason VARCHAR(20) NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL"))
        elif conn.dialect.name in {"mysql", "mariadb"}:
            index_exists = await conn.execute(
                text(
                    "SELECT COUNT(1) FROM information_schema.statistics "
                    "WHERE table_schema = DATABASE() "
                    "AND table_name = 'transactions' "
                    "AND index_name = 'ix_transactions_user_date_id'"
                )
            )
            if int(index_exists.scalar() or 0) == 0:
                await conn.execute(
                    text("CREATE INDEX ix_transactions_user_date_id ON transactions (user_id, txn_date, id)")
                )
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN NOT NULL DEFAULT TRUE"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS category_language VARCHAR(10) NULL"))
            await conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_kind VARCHAR(20) NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_email_sent_at TIMESTAMP NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token VARCHAR(100) NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token_expires TIMESTAMP NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_email_resend_count INTEGER NOT NULL DEFAULT 0"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_reason VARCHAR(20) NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL"))
        if conn.dialect.name != "postgresql":
            print(f"INFO:  PostgreSQL-only schema patch block skipped for {conn.dialect.name}.")
        else:
            await conn.execute(
                text("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_payment_date DATE NULL")
            )
            await conn.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS uq_wallets_owner_name ON wallets (owner_user_id, LOWER(name)) WHERE owner_user_id IS NOT NULL")
            )
            await conn.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS uq_category_keywords_cat_keyword ON category_keywords (category_id, LOWER(keyword))")
            )
            await conn.execute(
                text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS txn_time TIME NULL")
            )
            await conn.execute(
                text("ALTER TABLE loans ADD COLUMN IF NOT EXISTS monthly_payment NUMERIC(12,2) NULL")
            )
            await conn.execute(
                text("ALTER TABLE loans ADD COLUMN IF NOT EXISTS record_kind VARCHAR(20) NOT NULL DEFAULT 'loan'")
            )
            await conn.execute(
                text("ALTER TABLE loans ADD COLUMN IF NOT EXISTS due_day_of_month INTEGER NULL")
            )
            await conn.execute(
                text("ALTER TABLE loans ADD COLUMN IF NOT EXISTS category_id BIGINT NULL REFERENCES categories(id)")
            )
            await conn.execute(
                text("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS category_id BIGINT NULL REFERENCES categories(id)")
            )
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_loans_record_kind ON loans (record_kind)")
            )
            await conn.execute(
                text("ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL")
            )
            await conn.execute(
                text("UPDATE telegram_links SET created_at = COALESCE(created_at, linked_at, NOW())")
            )
            await conn.execute(
                text("ALTER TABLE telegram_links ALTER COLUMN created_at SET DEFAULT NOW()")
            )
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_telegram_links_created_at ON telegram_links (created_at)")
            )
            await conn.execute(text("CREATE TABLE IF NOT EXISTS user_auth_sessions (id BIGSERIAL PRIMARY KEY, user_id VARCHAR(16) NOT NULL REFERENCES users(id) ON DELETE CASCADE, session_id VARCHAR(64) NOT NULL, refresh_token_hash VARCHAR(128) NOT NULL, refresh_token_expires TIMESTAMP NULL, session_kind VARCHAR(20) NOT NULL DEFAULT 'default', user_agent VARCHAR(500) NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), last_used_at TIMESTAMP NOT NULL DEFAULT NOW())"))
            await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_user_auth_sessions_user_session ON user_auth_sessions (user_id, session_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_auth_sessions_user_id ON user_auth_sessions (user_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_auth_sessions_session_id ON user_auth_sessions (session_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_auth_sessions_last_used_at ON user_auth_sessions (last_used_at)"))
            await conn.execute(
                text("ALTER TABLE business_products ADD COLUMN IF NOT EXISTS removed_business_product_image_url TEXT NULL")
            )
            await conn.execute(
                text("ALTER TABLE business_products ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0")
            )
            await conn.execute(
                text("ALTER TABLE business_products ADD COLUMN IF NOT EXISTS category_id BIGINT NULL")
            )
            await conn.execute(
                text("ALTER TABLE removed_business_themes ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(190) NULL")
            )
            await conn.execute(
                text("CREATE TABLE IF NOT EXISTS business_product_categories (id BIGSERIAL PRIMARY KEY, user_id VARCHAR(16) NOT NULL REFERENCES users(id), name VARCHAR(120) NOT NULL, slug VARCHAR(120) NOT NULL, description TEXT NULL, sort_order INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())")
            )
            await conn.execute(
                text("ALTER TABLE business_product_categories ADD COLUMN IF NOT EXISTS image_url TEXT NULL")
            )
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_bp_cat_category_id ON business_products (category_id)")
            )
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_bpc_user_id ON business_product_categories (user_id)")
            )
            await conn.execute(
                text("ALTER TABLE business_payment_settings ADD COLUMN IF NOT EXISTS capture_all_whatsapp_messages BOOLEAN NOT NULL DEFAULT FALSE")
            )
            await conn.execute(
                text("ALTER TABLE business_payment_settings ADD COLUMN IF NOT EXISTS allow_owner_whatsapp_order_proxy BOOLEAN NOT NULL DEFAULT FALSE")
            )
            await conn.execute(
                text("ALTER TABLE business_payment_settings ADD COLUMN IF NOT EXISTS is_business_open BOOLEAN NOT NULL DEFAULT TRUE")
            )
            await conn.execute(
                text("ALTER TABLE business_payment_settings ADD COLUMN IF NOT EXISTS whatsapp_trigger_prefix VARCHAR(80) NULL")
            )
            await conn.execute(
                text("ALTER TABLE business_payment_settings ADD COLUMN IF NOT EXISTS business_closed_reply_template TEXT NULL")
            )
            await conn.execute(text("CREATE TABLE IF NOT EXISTS business_automation_flows (id BIGSERIAL PRIMARY KEY, user_id VARCHAR(16) NOT NULL REFERENCES users(id) ON DELETE CASCADE, name VARCHAR(120) NOT NULL DEFAULT 'Automation Flow', enabled BOOLEAN NOT NULL DEFAULT FALSE, flow_json TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())"))
            await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_business_automation_flows_user_id ON business_automation_flows (user_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_business_automation_flows_user_id ON business_automation_flows (user_id)"))
            await conn.execute(
                text("ALTER TABLE business_payment_settings ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE")
            )
            await conn.execute(
                text("ALTER TABLE business_payment_settings ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE")
            )
            await conn.execute(
                text("UPDATE business_payment_settings SET pickup_enabled = TRUE WHERE pickup_enabled IS NULL")
            )
            await conn.execute(
                text("UPDATE business_payment_settings SET delivery_enabled = TRUE WHERE delivery_enabled IS NULL")
            )
            await conn.execute(
                text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS product_id BIGINT NULL")
            )
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS order_mode VARCHAR(16) NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS delivery_address_text TEXT NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS delivery_latitude NUMERIC(12, 8) NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS delivery_longitude NUMERIC(12, 8) NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(12, 2) NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(12, 2) NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(12, 2) NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS checkout_stage VARCHAR(40) NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS delivery_rider_id BIGINT NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS delivery_rider_name VARCHAR(190) NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS delivery_public_token VARCHAR(80) NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS delivery_public_status VARCHAR(40) NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS delivery_public_note TEXT NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS delivery_public_updated_at TIMESTAMP NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(190) NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(190) NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS stripe_payment_url TEXT NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS stripe_payment_short_token VARCHAR(32) NULL"))
            await conn.execute(text("ALTER TABLE business_payment_settings ADD COLUMN IF NOT EXISTS stripe_enabled BOOLEAN NOT NULL DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE business_payment_settings ADD COLUMN IF NOT EXISTS stripe_secret_key TEXT NULL"))
            await conn.execute(text("ALTER TABLE business_payment_settings ADD COLUMN IF NOT EXISTS stripe_publishable_key TEXT NULL"))
            await conn.execute(text("ALTER TABLE business_payment_settings ADD COLUMN IF NOT EXISTS stripe_webhook_secret TEXT NULL"))
            await conn.execute(text("ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(120) NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'email'"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128) NULL"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS cycle_start_day BIGINT NOT NULL DEFAULT 1"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS cycle_mode VARCHAR(12) NOT NULL DEFAULT 'day'"))
            await conn.execute(text("ALTER TABLE categories ALTER COLUMN icon_name TYPE VARCHAR(500)"))
            await conn.execute(text("ALTER TABLE wallets ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) NULL"))
            await conn.execute(text("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL"))
            # Fix FK constraints so products can be deleted (SET NULL on referenced rows)
            await conn.execute(text("ALTER TABLE business_orders DROP CONSTRAINT IF EXISTS business_orders_product_id_fkey"))
            await conn.execute(text("ALTER TABLE business_orders ADD CONSTRAINT business_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES business_products(id) ON DELETE SET NULL"))
            await conn.execute(text("ALTER TABLE business_order_items DROP CONSTRAINT IF EXISTS business_order_items_product_id_fkey"))
            await conn.execute(text("ALTER TABLE business_order_items ADD CONSTRAINT business_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES business_products(id) ON DELETE SET NULL"))
            await conn.execute(text("CREATE TABLE IF NOT EXISTS business_riders (id BIGSERIAL PRIMARY KEY, user_id VARCHAR(16) NOT NULL REFERENCES users(id), name VARCHAR(190) NOT NULL, phone VARCHAR(64) NULL, vehicle_no VARCHAR(80) NULL, avatar_url TEXT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_business_riders_user_id ON business_riders (user_id)"))
            # My Vehicle: wallet columns for fuel/maintenance → budget transactions
            await conn.execute(text("ALTER TABLE vehicle_fuel_logs ADD COLUMN IF NOT EXISTS wallet_id BIGINT NULL"))
            await conn.execute(text("ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS wallet_id BIGINT NULL"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_vehicle_fuel_logs_wallet_id ON vehicle_fuel_logs (wallet_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_vehicle_maintenance_wallet_id ON vehicle_maintenance (wallet_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_vehicle_fuel_logs_transaction_id ON vehicle_fuel_logs (transaction_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_vehicle_expenses_transaction_id ON vehicle_expenses (transaction_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_vehicle_maintenance_transaction_id ON vehicle_maintenance (transaction_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_business_orders_delivery_rider_id ON business_orders (delivery_rider_id)"))
            await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_business_orders_delivery_public_token ON business_orders (delivery_public_token) WHERE delivery_public_token IS NOT NULL"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_business_orders_stripe_checkout_session_id ON business_orders (stripe_checkout_session_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_business_orders_stripe_payment_intent_id ON business_orders (stripe_payment_intent_id)"))
            await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_business_orders_stripe_payment_short_token ON business_orders (stripe_payment_short_token) WHERE stripe_payment_short_token IS NOT NULL"))
            for index_sql in (
                "CREATE INDEX IF NOT EXISTS ix_transactions_user_txn_date_id ON transactions (user_id, txn_date DESC, id DESC)",
                "CREATE INDEX IF NOT EXISTS ix_transactions_user_created_id ON transactions (user_id, created_at DESC, id DESC)",
                "CREATE INDEX IF NOT EXISTS ix_transactions_user_type_txn_date ON transactions (user_id, type, txn_date)",
                "CREATE INDEX IF NOT EXISTS ix_transactions_user_category_txn_date ON transactions (user_id, category_id, txn_date)",
                "CREATE INDEX IF NOT EXISTS ix_transactions_wallet_id ON transactions (wallet_id)",
                "CREATE INDEX IF NOT EXISTS ix_transactions_household_id ON transactions (household_id)",
                "CREATE INDEX IF NOT EXISTS ix_transactions_category_id ON transactions (category_id)",
                "CREATE INDEX IF NOT EXISTS ix_wallets_owner_created_id ON wallets (owner_user_id, created_at, id)",
                "CREATE INDEX IF NOT EXISTS ix_wallets_household_id ON wallets (household_id)",
                "CREATE INDEX IF NOT EXISTS ix_categories_household_internal_kind ON categories (household_id, is_internal, kind)",
                "CREATE INDEX IF NOT EXISTS ix_categories_household_id ON categories (household_id)",
                "CREATE INDEX IF NOT EXISTS ix_category_keywords_category_id ON category_keywords (category_id)",
                "CREATE INDEX IF NOT EXISTS ix_category_budgets_household_month ON category_budgets (household_id, month_key)",
                "CREATE INDEX IF NOT EXISTS ix_attachments_transaction_id ON attachments (transaction_id)",
                "CREATE INDEX IF NOT EXISTS ix_attachments_uploaded_by_user_id ON attachments (uploaded_by_user_id)",
                "CREATE INDEX IF NOT EXISTS ix_chat_messages_user_created_id ON chat_messages (user_id, created_at DESC, id DESC)",
                "CREATE INDEX IF NOT EXISTS ix_chat_messages_attachment_id ON chat_messages (attachment_id)",
                "CREATE INDEX IF NOT EXISTS ix_business_orders_product_id ON business_orders (product_id)",
                "CREATE INDEX IF NOT EXISTS ix_business_orders_order_mode ON business_orders (order_mode)",
                "CREATE INDEX IF NOT EXISTS ix_business_orders_checkout_stage ON business_orders (checkout_stage)",
                "CREATE INDEX IF NOT EXISTS ix_business_order_items_order_id ON business_order_items (order_id)",
                "CREATE INDEX IF NOT EXISTS ix_business_order_items_user_id ON business_order_items (user_id)",
                "CREATE INDEX IF NOT EXISTS ix_business_order_items_product_id ON business_order_items (product_id)",
                "CREATE INDEX IF NOT EXISTS ix_removed_business_inbox_threads_user_last_message_at ON removed_business_inbox_threads (user_id, last_message_at DESC, id DESC)",
                "CREATE INDEX IF NOT EXISTS ix_removed_business_inbox_messages_thread_created_at ON removed_business_inbox_messages (thread_id, created_at ASC, id ASC)",
                "CREATE INDEX IF NOT EXISTS ix_removed_business_inbox_messages_user_created_at ON removed_business_inbox_messages (user_id, created_at DESC, id DESC)",
            ):
                await conn.execute(text(index_sql))

    async with database.SessionLocal() as db:
        # Migrate existing debts to debtors
        result = await db.execute(select(models.Debt).where(models.Debt.debtor_id.is_(None)))
        unlinked_debts = result.scalars().all()
        if unlinked_debts:
            for d in unlinked_debts:
                key = whatsapp_service.counterparty_key(d.counterparty_name)
                # Find or create debtor
                debtor_res = await db.execute(
                    select(models.Debtor).where(models.Debtor.user_id == d.user_id, models.Debtor.key == key)
                )
                debtor = debtor_res.scalars().first()
                if not debtor:
                    debtor = models.Debtor(
                        user_id=d.user_id,
                        household_id=d.household_id,
                        name=d.counterparty_name,
                        key=key
                    )
                    db.add(debtor)
                    await db.flush()
                d.debtor_id = debtor.id
            await db.commit()

        result = await db.execute(select(models.Category).where(models.Category.icon_name.is_(None)))
        categories_without_icon = result.scalars().all()
        for category in categories_without_icon:
            category.icon_name = _suggest_category_icon_name(category.name, category.kind)
        if categories_without_icon:
            await db.commit()

@app.on_event("startup")
async def sync_telegram_bot_commands_on_startup():
    await _sync_telegram_bot_commands()

@app.on_event("startup")
async def start_chat_cleanup_task():
    """Background task: delete chat messages older than 24 hours every hour."""
    async def _cleanup_loop():
        while True:
            await asyncio.sleep(3600)  # Run every 1 hour
            try:
                async with database.SessionLocal() as db:
                    from datetime import timedelta
                    cutoff = datetime.utcnow() - timedelta(hours=24)
                    inbound_event_cutoff = datetime.utcnow() - timedelta(days=WHATSAPP_INBOUND_EVENT_RETENTION_DAYS)
                    # Find old messages with attachments to clean R2
                    result = await db.execute(
                        select(models.ChatMessage)
                        .where(models.ChatMessage.created_at < cutoff)
                        .where(models.ChatMessage.attachment_id.isnot(None))
                    )
                    old_with_attachments = result.scalars().all()
                    for msg in old_with_attachments:
                        if msg.attachment_id:
                            att_result = await db.execute(
                                select(models.Attachment).where(models.Attachment.id == msg.attachment_id)
                            )
                            att = att_result.scalars().first()
                            if att and att.file_path:
                                try:
                                    await asyncio.to_thread(storage_service.delete_receipt_object, att.file_path)
                                except Exception:
                                    pass
                    # Delete all old chat messages
                    from sqlalchemy import delete as sa_delete
                    await db.execute(
                        sa_delete(models.ChatMessage).where(models.ChatMessage.created_at < cutoff)
                    )
                    await db.execute(
                        sa_delete(models.WhatsAppInboundEvent).where(
                            models.WhatsAppInboundEvent.received_at < inbound_event_cutoff
                        )
                    )
                    # Retain access_logs for 7 days only (they balloon to ~150MB/5d on 96k rows)
                    access_log_cutoff = datetime.utcnow() - timedelta(days=7)
                    await db.execute(
                        sa_delete(models.AccessLog).where(
                            models.AccessLog.created_at < access_log_cutoff
                        )
                    )
                    await db.commit()
                    print(f"[cleanup] Purged chat messages older than {cutoff.isoformat()}")
            except Exception as e:
                print(f"[cleanup] Error during chat cleanup: {e}")
    asyncio.create_task(_cleanup_loop())

@app.on_event("startup")
async def start_account_verification_email_task():
    """Background task: email a verification request when an account is deactivated.
    Sends at most once per account (tracked by verification_email_sent_at).
    Reactivation stays manual/admin-driven."""
    async def _verification_loop():
        print("[account-verify] background verification loop started")
        while True:
            await asyncio.sleep(60)  # check every 60s
            try:
                async with database.SessionLocal() as db:
                    now = datetime.utcnow()
                    # Backfill deactivated_at for deactivated accounts missing it.
                    await db.execute(
                        update(models.User)
                        .where(models.User.is_active.is_(False))
                        .where(models.User.deactivated_at.is_(None))
                        .values(deactivated_at=now)
                    )
                    await db.commit()

                    # Auto-disable accounts that never verified email within the grace.
                    # Legacy users (verification_email_sent_at is None) are exempt.
                    cutoff = now - timedelta(days=EMAIL_VERIFY_GRACE_DAYS)
                    unverified = (
                        await db.execute(
                            select(models.User).where(
                                models.User.is_active.is_(True),
                                models.User.email_verified_at.is_(None),
                                models.User.verification_email_sent_at.isnot(None),
                                models.User.verification_email_sent_at < cutoff,
                                (models.User.deactivated_reason.is_(None))
                                | (models.User.deactivated_reason == ""),
                            )
                        )
                    ).scalars().all()
                    for user in unverified:
                        user.is_active = False
                        user.deactivated_at = now
                        user.deactivated_reason = "email_verify_expired"
                        print(f"[account-verify] Auto-disabled {user.email}: email not verified within 2-day grace")
                    await db.commit()

                    # Find deactivated accounts that still need a verification email.
                    result = await db.execute(
                        select(models.User).where(
                            models.User.is_active.is_(False),
                            models.User.deactivated_at.isnot(None),
                            models.User.verification_email_sent_at.is_(None),
                        )
                    )
                    pending = result.scalars().all()
                    for user in pending:
                        email = (user.email or "").strip()
                        if not email:
                            continue
                        name = (user.name or "").strip() or email
                        sent = await email_service.send_account_verification_email(email, name)
                        if sent:
                            user.verification_email_sent_at = datetime.utcnow()
                            print(f"[account-verify] Verification email sent to {email}")
                        else:
                            print(f"[account-verify] Failed to send verification email to {email}")
                    await db.commit()
            except Exception as e:
                print(f"[account-verify] Error: {e}")
    asyncio.create_task(_verification_loop())


@app.on_event("startup")
async def start_inactivity_deactivation_task():
    """Background task: auto-deactivate accounts with no login AND no transaction for 60+ days.
    Manual (admin) deactivations are untouched (deactivated_reason='manual').
    Runs in LOG-ONLY mode unless AUTO_DEACTIVATE=true, so admins can review candidates first."""
    AUTO_DEACTIVATE = os.getenv("AUTO_DEACTIVATE", "false").strip().lower() in {"1", "true", "yes", "on"}
    async def _inactivity_loop():
        print(f"[inactivity] loop started (mode={'AUTO-DEACTIVATE' if AUTO_DEACTIVATE else 'LOG-ONLY'})")
        while True:
            await asyncio.sleep(24 * 3600)  # daily
            try:
                async with database.SessionLocal() as db:
                    # dialect-aware 60-day cutoff comparison
                    sql = text("""
                        SELECT u.id, u.email, u.created_at
                        FROM users u
                        WHERE u.is_active = true
                          AND COALESCE(u.deactivated_reason, '') != 'manual'
                          AND u.created_at < NOW() - INTERVAL '60 days'
                          AND (
                            (SELECT MAX(al.created_at) FROM access_logs al
                              WHERE al.user_id = u.id AND NOT al.is_blocked) IS NULL
                            OR (SELECT MAX(al.created_at) FROM access_logs al
                              WHERE al.user_id = u.id AND NOT al.is_blocked)
                                 < NOW() - INTERVAL '60 days'
                          )
                          AND (
                            (SELECT MAX(t.created_at) FROM transactions t WHERE t.user_id = u.id) IS NULL
                            OR (SELECT MAX(t.created_at) FROM transactions t WHERE t.user_id = u.id)
                                 < NOW() - INTERVAL '60 days'
                          )
                    """)
                    rows = (await db.execute(sql)).fetchall()
                    if AUTO_DEACTIVATE:
                        if rows:
                            print(f"[inactivity] AUTO-DEACTIVATING {len(rows)} inactive account(s)")
                            for row in rows:
                                await db.execute(
                                    update(models.User)
                                    .where(models.User.id == row.id)
                                    .values(
                                        is_active=False,
                                        deactivated_at=datetime.utcnow(),
                                        deactivated_reason="inactivity",
                                    )
                                )
                                print(f"[inactivity] deactivated {row.email} ({row.id})")
                            await db.commit()
                    else:
                        print(f"[inactivity] LOG-ONLY: {len(rows)} inactive candidate(s) (set AUTO_DEACTIVATE=true to actually deactivate)")
                        for row in rows[:20]:
                            print(f"[inactivity]   candidate: {row.email} (created {row.created_at})")
            except Exception as e:
                print(f"[inactivity] Error: {e}")
    asyncio.create_task(_inactivity_loop())

@app.on_event("startup")
async def start_expired_token_cleanup_task():
    """Background task: clear expired reset/verify/email-change tokens daily.
    ponytail: piggybacks on the inactivity loop pattern; move to pg_cron if loops multiply."""
    async def _token_cleanup_loop():
        while True:
            await asyncio.sleep(24 * 3600)  # daily
            try:
                async with database.SessionLocal() as db:
                    now = datetime.utcnow()
                    r = await db.execute(
                        sa_delete(models.User).where(
                            models.User.reset_token.is_not(None),
                            models.User.reset_token_expires < now,
                        ).values(reset_token=None, reset_token_expires=None)
                    )
                    r2 = await db.execute(
                        sa_delete(models.User).where(
                            models.User.email_verify_token.is_not(None),
                            models.User.email_verify_token_expires < now,
                            # Keep the token for accounts disabled because they never
                            # verified — the verify link (proof of email ownership) is
                            # their only recovery path, so we still honour it after expiry.
                            models.User.deactivated_reason != "email_verify_expired",
                        ).values(email_verify_token=None, email_verify_token_expires=None)
                    )
                    r3 = await db.execute(
                        sa_delete(models.User).where(
                            models.User.email_change_token.is_not(None),
                            models.User.email_change_token_expires < now,
                        ).values(email_change_token=None, email_change_token_expires=None)
                    )
                    if r.rowcount or r2.rowcount or r3.rowcount:
                        print(f"[token-cleanup] cleared {r.rowcount} reset, {r2.rowcount} verify, {r3.rowcount} email-change")
                    await db.commit()
            except Exception as e:
                print(f"[token-cleanup] Error: {e}")
    asyncio.create_task(_token_cleanup_loop())


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def access_guard_and_headers(request: Request, call_next):
    ip_address = _request_ip(request)
    user_id = None
    is_blocked = False
    status_code = 500
    if ip_address:
        try:
            async with database.SessionLocal() as db:
                banned = await db.scalar(
                    select(models.IpBan).where(models.IpBan.ip_address == ip_address, models.IpBan.is_active == True)
                )
                if banned:
                    is_blocked = True
                    status_code = 403
                    db.add(models.AccessLog(
                        ip_address=ip_address,
                        method=request.method,
                        path=str(request.url.path),
                        status_code=status_code,
                        user_agent=request.headers.get("user-agent"),
                        is_blocked=True,
                    ))
                    await db.commit()
                    return PlainTextResponse("IP banned", status_code=status_code)
        except Exception:
            pass
    response = await call_next(request)
    status_code = response.status_code
    if not request.url.path.startswith(("/health", "/static", "/favicon")):
        try:
            async with database.SessionLocal() as db:
                token_sub = _request_token_user_id(request)
                user_label = None
                if token_sub:
                    user_row = (await db.execute(select(models.User.id, models.User.name, models.User.email).where(models.User.email == token_sub))).mappings().first()
                    if user_row:
                        user_id = user_row["id"]
                        user_label = user_row["name"] or user_row["email"] or user_id
                db.add(models.AccessLog(
                    ip_address=ip_address,
                    method=request.method,
                    path=str(request.url.path),
                    status_code=status_code,
                    user_id=user_id,
                    user_agent=request.headers.get("user-agent"),
                    is_blocked=is_blocked,
                ))
                await db.commit()
                settings = await _get_adminportal_telegram_settings(db)
                path_filter = str(settings.get("alert_path_contains") or "").strip()
                if (
                    bool(settings.get("access_log_alerts"))
                    and status_code >= int(settings.get("alert_status_min") or 400)
                    and (not path_filter or path_filter in str(request.url.path))
                ):
                    asyncio.create_task(_notify_access_alert(str(request.url.path), request.method, status_code, ip_address, user_label or user_id or "Guest / no session"))
        except Exception:
            pass
    response.headers["X-Robots-Tag"] = ROBOTS_BLOCK_HEADER
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Authentication Dependency
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

async def get_current_user(request: Request, token: str | None = Depends(oauth2_scheme), db: AsyncSession = Depends(database.get_db)):
    header_token = (token or "").strip()
    cookie_token = (request.cookies.get(AUTH_ACCESS_COOKIE_NAME) or "").strip()
    payload = auth_utils.decode_access_token(header_token) if header_token else None
    if payload is None and cookie_token:
        payload = auth_utils.decode_access_token(cookie_token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    email: str = payload.get("sub")
    if email is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    result = await db.execute(select(models.User).where(models.User.email == email))
    user = result.scalars().first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    # Per-user request rate limit (anti-bot polling) — identity = user id, not IP,
    # so shared ISP/VPN IPv6 ranges are never wrongly blocked.
    await enforce_auth_rate_limit("data_get", request, identity=user.id)
    return user


def _removed_business_env_access_enabled(user: models.User) -> bool:
    if not REMOVED_BUSINESS_ENABLED_USER_IDS:
        return False
    return user.id in REMOVED_BUSINESS_ENABLED_USER_IDS or user.email in REMOVED_BUSINESS_ENABLED_USER_IDS


def _user_setting_enabled(row: models.UserSetting | None) -> bool:
    return str(getattr(row, "value", "") or "").strip().lower() in {"1", "true", "yes", "on", "enabled"}


async def _get_adminportal_removed_business_setting(db: AsyncSession, user_id: str) -> models.UserSetting | None:
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == ADMINPORTAL_REMOVED_BUSINESS_ACCESS_SETTING_KEY,
        )
    )
    return result.scalar_one_or_none()


_REMOVED_BUSINESS_INACTIVE_DISABLE_DAYS = 30

_REMOVED_BUSINESS_ACTIVITY_MODELS = (
    models.BusinessOrder,
    models.BusinessProduct,
    models.BusinessPaymentSetting,
    models.BusinessProductCategory,
    models.BusinessExpense,
    models.BusinessOwnerDraw,
    models.BusinessAutomationFlow,
    models.RemovedBusinessTheme,
)


async def _removed_business_last_activity_at(db: AsyncSession, user_id: str) -> datetime | None:
    by_user = await _removed_business_last_activity_by_user_ids(db, [user_id])
    return by_user.get(user_id)


async def _removed_business_last_activity_by_user_ids(db: AsyncSession, user_ids: list[str]) -> dict[str, datetime]:
    ids = [uid for uid in user_ids if uid]
    if not ids:
        return {}
    latest: dict[str, datetime] = {}
    for model in _REMOVED_BUSINESS_ACTIVITY_MODELS:
        rows = (await db.execute(
            select(model.user_id, func.max(model.updated_at))
            .where(model.user_id.in_(ids))
            .group_by(model.user_id)
        )).all()
        for user_id, value in rows:
            if not isinstance(value, datetime):
                continue
            prev = latest.get(user_id)
            if prev is None or value > prev:
                latest[user_id] = value
    return latest


def _removed_business_inactivity_anchor(
    last_activity_at: datetime | None,
    setting: models.UserSetting | None,
) -> datetime | None:
    if isinstance(last_activity_at, datetime):
        return last_activity_at
    if setting is None:
        return None
    for value in (getattr(setting, "updated_at", None), getattr(setting, "created_at", None)):
        if isinstance(value, datetime):
            return value
    return None


def _removed_business_inactive_days(anchor: datetime | None, now: datetime | None = None) -> int | None:
    if not isinstance(anchor, datetime):
        return None
    ref = now or datetime.utcnow()
    delta = ref - anchor
    return max(0, int(delta.total_seconds() // 86400))


async def _auto_disable_inactive_removed_business_access(
    db: AsyncSession,
    user: models.User,
    setting: models.UserSetting | None,
    last_activity_at: datetime | None,
    *,
    actor_user_id: str | None = None,
    commit: bool = False,
) -> bool:
    if _removed_business_env_access_enabled(user) or bool(getattr(user, "is_admin", False)):
        return False
    if not _user_setting_enabled(setting) or setting is None:
        return False
    anchor = _removed_business_inactivity_anchor(last_activity_at, setting)
    if anchor is None:
        return False
    cutoff = datetime.utcnow() - timedelta(days=_REMOVED_BUSINESS_INACTIVE_DISABLE_DAYS)
    if anchor >= cutoff:
        return False
    setting.value = "false"
    db.add(models.BusinessAuditLog(
        user_id=user.id,
        actor_user_id=actor_user_id,
        entity_type="adminportal_removed_business_access",
        entity_id=user.id,
        action="auto_disable_inactive",
        before_state=None,
        after_state=json.dumps(
            {
                "enabled": False,
                "inactive_days": _removed_business_inactive_days(anchor),
                "last_activity_at": last_activity_at.isoformat() if isinstance(last_activity_at, datetime) else None,
                "threshold_days": _REMOVED_BUSINESS_INACTIVE_DISABLE_DAYS,
            },
            ensure_ascii=False,
        ),
    ))
    if commit:
        await db.commit()
    return True


async def _removed_business_access_enabled_for_user(db: AsyncSession, user: models.User) -> bool:
    if _removed_business_env_access_enabled(user):
        return True
    if bool(getattr(user, "is_admin", False)):
        return True
    setting = await _get_adminportal_removed_business_setting(db, user.id)
    if not _user_setting_enabled(setting):
        return False
    last_activity_at = await _removed_business_last_activity_at(db, user.id)
    if await _auto_disable_inactive_removed_business_access(db, user, setting, last_activity_at, commit=True):
        return False
    anchor = _removed_business_inactivity_anchor(last_activity_at, setting)
    if anchor is None:
        return False
    return anchor >= datetime.utcnow() - timedelta(days=_REMOVED_BUSINESS_INACTIVE_DISABLE_DAYS)


def _removed_business_access_enabled(user: models.User) -> bool:
    if _removed_business_env_access_enabled(user):
        return True
    return bool(getattr(user, "is_admin", False))


async def get_removed_business_user(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    if not await _removed_business_access_enabled_for_user(db, current_user):
        raise HTTPException(status_code=404, detail="Business module not found")
    return current_user


async def get_adminportal_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if not bool(getattr(current_user, "is_admin", False)):
        raise HTTPException(status_code=404, detail="Not found")
    return current_user


_REMOVED_BUSINESS_ORDERS_SSE_SUBSCRIBERS: dict[str, set[asyncio.Queue[str]]] = {}

# ── Whole-app realtime (SSE) ─────────────────────────────────────────────
# Per-user subscriber queues keyed by user_id. publish_realtime() fans a
# message out to every subscriber of the target user. Household broadcast
# resolves member ids server-side before publishing.
_REALTIME_SUBSCRIBERS: dict[str, set[asyncio.Queue[str]]] = {}
_REALTIME_QUEUE_MAX = 50


def _realtime_subscribe(user_id: str) -> asyncio.Queue[str]:
    q: asyncio.Queue[str] = asyncio.Queue(maxsize=_REALTIME_QUEUE_MAX)
    _REALTIME_SUBSCRIBERS.setdefault(user_id, set()).add(q)
    return q


def _realtime_unsubscribe(user_id: str, q: asyncio.Queue[str]) -> None:
    subs = _REALTIME_SUBSCRIBERS.get(user_id)
    if subs is None:
        return
    subs.discard(q)
    if not subs:
        _REALTIME_SUBSCRIBERS.pop(user_id, None)


def publish_realtime(user_id: str, event: str, resource: str, payload: dict[str, Any] | None = None) -> None:
    """Broadcast a realtime event to one user's subscribers. Best-effort, never raises."""
    if not user_id:
        return
    subs = _REALTIME_SUBSCRIBERS.get(user_id)
    if not subs:
        return
    msg = json.dumps({"event": event, "resource": resource, "data": payload or {}, "ts": datetime.utcnow().isoformat() + "Z"})
    for q in list(subs):
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            pass


async def publish_realtime_to_household(
    db: AsyncSession, actor_user_id: str, event: str, resource: str, payload: dict[str, Any] | None = None
) -> None:
    """Broadcast to the actor and all household members that share data with them."""
    target_ids: set[str] = {actor_user_id}
    try:
        # Household ids where the actor is owner or a member.
        household_ids = list(
            (
                await db.execute(
                    select(models.HouseholdMember.household_id).where(
                        models.HouseholdMember.user_id == actor_user_id
                    )
                )
            ).scalars().all()
        )
        owned_ids = list(
            (
                await db.execute(
                    select(models.Household.id).where(models.Household.owner_user_id == actor_user_id)
                )
            ).scalars().all()
        )
        all_hids = set(household_ids) | set(owned_ids)
        if all_hids:
            member_ids = list(
                (
                    await db.execute(
                        select(models.HouseholdMember.user_id).where(
                            models.HouseholdMember.household_id.in_(all_hids)
                        )
                    )
                ).scalars().all()
            )
            owner_ids = list(
                (
                    await db.execute(
                        select(models.Household.owner_user_id).where(models.Household.id.in_(all_hids))
                    )
                ).scalars().all()
            )
            for uid in member_ids + owner_ids:
                if uid:
                    target_ids.add(str(uid))
    except Exception:
        pass
    for uid in target_ids:
        publish_realtime(uid, event, resource, payload)


async def get_current_user_realtime(
    request: Request,
    access_token: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
):
    header_token = (access_token or "").strip()
    cookie_token = (request.cookies.get(AUTH_ACCESS_COOKIE_NAME) or "").strip()
    payload = auth_utils.decode_access_token(header_token) if header_token else None
    if payload is None and cookie_token:
        payload = auth_utils.decode_access_token(cookie_token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    email: str | None = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.execute(select(models.User).where(models.User.email == email))
    user = result.scalars().first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@app.get("/api/events")
async def realtime_events(
    request: Request,
    current_user: models.User = Depends(get_current_user_realtime),
):
    async def event_stream():
        q = _realtime_subscribe(str(current_user.id))
        yield 'event: ready\ndata: {"ok":true}\n\n'
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=20)
                    yield f"event: {json.loads(payload).get('event', 'update')}\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield 'event: ping\ndata: {}\n\n'
        finally:
            _realtime_unsubscribe(str(current_user.id), q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _removed_business_publish_orders_event(user_id: str, event: str, order_id: int | None = None) -> None:
    pyld = json.dumps({
        "event": event,
        "order_id": order_id,
        "ts": datetime.utcnow().isoformat() + "Z",
    })
    subscribers = list(_REMOVED_BUSINESS_ORDERS_SSE_SUBSCRIBERS.get(user_id, set()))
    for queue in subscribers:
        try:
            queue.put_nowait(pyld)
        except asyncio.QueueFull:
            pass

    # Also publish notification for bell
    if event == "deleted":
        # Remove existing notifications for deleted order
        if order_id:
            try:
                async with database.SessionLocal() as db:
                    await db.execute(
                        sa_delete(models.RemovedBusinessNotification).where(
                            models.RemovedBusinessNotification.order_id == order_id,
                            models.RemovedBusinessNotification.user_id == user_id,
                        )
                    )
                    await db.commit()
            except Exception:
                pass
    else:
        order_no: str | None = None
        order_mode: str | None = None
        order_status: str | None = None
        if order_id:
            try:
                async with database.SessionLocal() as db:
                    row = await db.execute(
                        select(models.BusinessOrder.order_no, models.BusinessOrder.order_mode, models.BusinessOrder.status)
                        .where(models.BusinessOrder.id == order_id)
                    )
                    fetched = row.one_or_none()
                    if fetched:
                        order_no, order_mode, order_status = fetched
                    existing_notif = await db.execute(
                        select(models.RemovedBusinessNotification.id).where(
                            models.RemovedBusinessNotification.order_id == order_id,
                            models.RemovedBusinessNotification.user_id == user_id,
                        ).limit(1)
                    )
                    if existing_notif.scalar_one_or_none() is not None:
                        return
            except Exception:
                pass

        # Treat any non-deleted order as "you've received an order" since
        # it means the order is now visible/in play for the removed_business owner
        title = "You've received an order"
        body = f"#{order_no}" if order_no else f"Order #{order_id}" if order_id else ""
        await _removed_business_publish_notification(user_id, event, order_id, title, body, order_mode)
        # Persist notification to DB
        try:
            async with database.SessionLocal() as db:
                notif = models.RemovedBusinessNotification(
                    user_id=user_id,
                    order_id=order_id,
                    event=event,
                    title=title,
                    body=body,
                )
                db.add(notif)
                await db.commit()
        except Exception:
            pass  # Don't break order flow if notification save fails
        
        # Send FCM push notification
        try:
            async with database.SessionLocal() as fcm_db:
                await push_service.send_push_to_user(
                    fcm_db,
                    user_id,
                    title,
                    body,
                    f"/{user_id}/removed_business/orders/{order_id}" if order_id else "/",
                    "new-order",
                )
        except Exception:
            pass

async def get_current_user_sse(
    request: Request,
    access_token: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
):
    header_token = (access_token or "").strip()
    cookie_token = (request.cookies.get(AUTH_ACCESS_COOKIE_NAME) or "").strip()
    payload = auth_utils.decode_access_token(header_token) if header_token else None
    if payload is None and cookie_token:
        payload = auth_utils.decode_access_token(cookie_token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    email: str | None = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(models.User).where(models.User.email == email))
    user = result.scalars().first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    if not await _removed_business_access_enabled_for_user(db, user):
        raise HTTPException(status_code=404, detail="Business module not found")
    return user

@app.get("/removed_business/orders/events")
async def removed_business_orders_events(
    request: Request,
    current_user: models.User = Depends(get_current_user_sse),
):
    async def event_stream():
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=20)
        user_key = str(current_user.id)
        _REMOVED_BUSINESS_ORDERS_SSE_SUBSCRIBERS.setdefault(user_key, set()).add(queue)
        yield 'event: ready\ndata: {"ok":true}\n\n'
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=20)
                    yield f"event: orders\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield 'event: ping\ndata: {}\n\n'
        finally:
            subscribers = _REMOVED_BUSINESS_ORDERS_SSE_SUBSCRIBERS.get(user_key)
            if subscribers is not None:
                subscribers.discard(queue)
                if not subscribers:
                    _REMOVED_BUSINESS_ORDERS_SSE_SUBSCRIBERS.pop(user_key, None)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


_REMOVED_BUSINESS_NOTIF_SSE_SUBSCRIBERS: dict[str, set[asyncio.Queue[str]]] = {}

async def _removed_business_publish_notification(user_id: str, event: str, order_id: int | None, title: str, body: str | None, order_mode: str | None = None) -> None:
    pyld = json.dumps({"event": event, "order_id": order_id, "order_mode": order_mode, "title": title, "body": body, "ts": datetime.utcnow().isoformat() + "Z"})
    subscribers = list(_REMOVED_BUSINESS_NOTIF_SSE_SUBSCRIBERS.get(user_id, set()))
    for q in subscribers:
        try:
            q.put_nowait(pyld)
        except asyncio.QueueFull:
            pass


@app.get("/removed_business/notifications/events")
async def removed_business_notifications_events(
    request: Request,
    current_user: models.User = Depends(get_current_user_sse),
):
    async def event_stream():
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=20)
        user_key = str(current_user.id)
        _REMOVED_BUSINESS_NOTIF_SSE_SUBSCRIBERS.setdefault(user_key, set()).add(queue)
        yield 'event: ready\ndata: {"ok":true}\n\n'
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    pyld = await asyncio.wait_for(queue.get(), timeout=20)
                    yield f"event: notification\ndata: {pyld}\n\n"
                except asyncio.TimeoutError:
                    yield 'event: ping\ndata: {}\n\n'
        finally:
            subscribers = _REMOVED_BUSINESS_NOTIF_SSE_SUBSCRIBERS.get(user_key)
            if subscribers is not None:
                subscribers.discard(queue)
                if not subscribers:
                    _REMOVED_BUSINESS_NOTIF_SSE_SUBSCRIBERS.pop(user_key, None)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/removed_business/notifications")
async def removed_business_notifications_list(
    current_user: models.User = Depends(get_current_user_sse),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(database.get_db),
):
    rows = (await db.execute(
        select(
            models.RemovedBusinessNotification,
            models.BusinessOrder.order_mode,
        )
        .outerjoin(models.BusinessOrder, models.BusinessOrder.id == models.RemovedBusinessNotification.order_id)
        .where(models.RemovedBusinessNotification.user_id == current_user.id)
        .order_by(models.RemovedBusinessNotification.created_at.desc())
        .limit(limit)
    )).all()
    return {
        "notifications": [
            {
                "id": r.RemovedBusinessNotification.id,
                "order_id": r.RemovedBusinessNotification.order_id,
                "order_mode": r.order_mode,
                "event": r.RemovedBusinessNotification.event,
                "title": r.RemovedBusinessNotification.title,
                "body": r.RemovedBusinessNotification.body,
                "is_read": r.RemovedBusinessNotification.is_read,
                "created_at": (r.RemovedBusinessNotification.created_at.isoformat() + "Z") if r.RemovedBusinessNotification.created_at else None,
            }
            for r in rows
        ],
        "unread_count": (await db.execute(
            select(func.count(models.RemovedBusinessNotification.id)).where(
                models.RemovedBusinessNotification.user_id == current_user.id,
                models.RemovedBusinessNotification.is_read == False,
            )
        )).scalar() or 0,
    }


@app.delete("/removed_business/notifications/{notification_id}")
async def removed_business_notifications_delete(
    notification_id: int,
    current_user: models.User = Depends(get_current_user_sse),
    db: AsyncSession = Depends(database.get_db),
):
    await db.execute(
        sa_delete(models.RemovedBusinessNotification).where(
            models.RemovedBusinessNotification.id == notification_id,
            models.RemovedBusinessNotification.user_id == current_user.id,
        )
    )
    await db.commit()
    return {"ok": True}


@app.post("/removed_business/notifications/mark-read")
async def removed_business_notifications_mark_read(
    current_user: models.User = Depends(get_current_user_sse),
    notification_ids: list[int] | None = None,
    db: AsyncSession = Depends(database.get_db),
):
    if notification_ids:
        stmt = (
            update(models.RemovedBusinessNotification)
            .where(
                models.RemovedBusinessNotification.user_id == current_user.id,
                models.RemovedBusinessNotification.id.in_(notification_ids),
            )
            .values(is_read=True)
        )
    else:
        stmt = (
            update(models.RemovedBusinessNotification)
            .where(
                models.RemovedBusinessNotification.user_id == current_user.id,
                models.RemovedBusinessNotification.is_read == False,
            )
            .values(is_read=True)
        )
    await db.execute(stmt)
    await db.commit()
    return {"ok": True}


async def _resolve_removed_business_webhook_user_id(db: AsyncSession, payload_user_id: str | None = None) -> str | None:
    candidate = (payload_user_id or "").strip()
    if candidate:
        result = await db.execute(select(models.User).where(models.User.id == candidate))
        user = result.scalars().first()
        if user and await _removed_business_access_enabled_for_user(db, user):
            return user.id
    if not REMOVED_BUSINESS_ENABLED_USER_IDS:
        return None
    result = await db.execute(select(models.User).where(or_(models.User.id.in_(list(REMOVED_BUSINESS_ENABLED_USER_IDS)), models.User.email.in_(list(REMOVED_BUSINESS_ENABLED_USER_IDS)))))
    user = result.scalars().first()
    return user.id if user else None


def _parse_business_order_from_text(text: str) -> dict[str, Any]:
    return _module_parse_business_order_from_text(text)



def _removed_business_webhook_has_valid_secret(request: Request) -> bool:
    secret = (REMOVED_BUSINESS_WEBHOOK_SECRET or "").strip()
    if not secret:
        return True
    provided = request.headers.get("x-removed_business-secret") or request.headers.get("x-webhook-secret") or request.headers.get("x-telegram-bot-api-secret-token")
    return bool(provided and hmac.compare_digest(provided.strip(), secret))

def _removed_business_should_ingest_whatsapp_message(text: str, has_receipt_media: bool) -> bool:
    return _module_removed_business_should_ingest_whatsapp_message(text, has_receipt_media)


def _removed_business_apply_whatsapp_prefix(text: str, prefix: str | None) -> tuple[bool, str]:
    return _module_removed_business_apply_whatsapp_prefix(text, prefix)


def _removed_business_split_order_message_segments(text: str) -> list[str]:
    return _module_removed_business_split_order_message_segments(text)


def _get_client_ip(request: Request) -> str | None:
    cf_connecting_ip = request.headers.get("cf-connecting-ip")
    if cf_connecting_ip:
        return cf_connecting_ip.strip()
    true_client_ip = request.headers.get("true-client-ip")
    if true_client_ip:
        return true_client_ip.strip()
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    if request.client:
        return request.client.host
    return None


def _normalize_email(email: str | None) -> str:
    return (email or "").strip().lower()


def _hash_reset_token(token: str) -> str:
    return auth_utils.hash_token(f"reset:{token}")


def _hash_email_verify_token(token: str) -> str:
    return auth_utils.hash_token(f"email-verify:{token}")


# Soft anti-spam: reject disposable/throwaway email domains at registration.
# ponytail: static list; replace with a maintained blocklist service (e.g. disposable-email-domains) when abuse grows.
_DISPOSABLE_EMAIL_DOMAINS = {
    "hidepost.net", "mailinator.com", "guerrillamail.com", "temp-mail.org",
    "10minutemail.com", "yopmail.com", "throwawaymail.com", "dispostable.com",
    "maildrop.cc", "mailnesia.com", "tempmail.com", "sharklasers.com",
    "guerrillamailblock.com", "burnermail.io", "getnada.com", "emailnator.com",
    "maileater.com", "inboxbear.com", "mailcatch.com", "trashmail.com",
}


def _email_domain(email: str) -> str:
    return (email.split("@", 1)[-1] if "@" in email else email).strip().lower()


def _is_verify_grace_expired(user: Any) -> bool:
    """True when a user must have verified their email but the grace has lapsed.
    Legacy users (verification_email_sent_at is None) are exempt so we never disable existing accounts."""
    if getattr(user, "email_verified_at", None) is not None:
        return False
    sent_at = getattr(user, "verification_email_sent_at", None)
    if sent_at is None:
        return False
    return datetime.utcnow() > sent_at + timedelta(days=EMAIL_VERIFY_GRACE_DAYS)


def _is_disposable_email(email: str) -> bool:
    return _email_domain(email) in _DISPOSABLE_EMAIL_DOMAINS


def _hash_email_change_token(token: str) -> str:
    return auth_utils.hash_token(f"email-change:{token}")


def _generate_email_change_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def validate_password_strength(password: str, *, field_label: str = "Password") -> str:
    value = password or ""
    if len(value) < PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"{field_label} must be at least {PASSWORD_MIN_LENGTH} characters",
        )
    if len(value) > PASSWORD_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"{field_label} must be at most {PASSWORD_MAX_LENGTH} characters",
        )
    return value


def validate_pin_value(pin: str, *, field_label: str = "PIN") -> str:
    value = (pin or "").strip()
    if not re.fullmatch(rf"\d{{{PIN_LENGTH}}}", value):
        raise HTTPException(
            status_code=400,
            detail=f"{field_label} must be exactly {PIN_LENGTH} digits",
        )
    return value


def _rate_limit_bucket_key(action: str, ip: str, identity: str) -> str:
    return f"{action}|{ip}|{identity}"


def _rate_limit_bucket_hash(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


async def _get_auth_rate_limit_redis_client():
    global AUTH_RATE_LIMIT_REDIS_CLIENT, AUTH_RATE_LIMIT_REDIS_UNAVAILABLE

    if AUTH_RATE_LIMIT_REDIS_UNAVAILABLE:
        return None
    if not AUTH_RATE_LIMIT_REDIS_URL or redis_asyncio is None:
        return None
    if AUTH_RATE_LIMIT_REDIS_CLIENT is not None:
        return AUTH_RATE_LIMIT_REDIS_CLIENT

    try:
        client = redis_asyncio.from_url(AUTH_RATE_LIMIT_REDIS_URL, decode_responses=True)
        await client.ping()
        AUTH_RATE_LIMIT_REDIS_CLIENT = client
        return AUTH_RATE_LIMIT_REDIS_CLIENT
    except Exception as exc:
        AUTH_RATE_LIMIT_REDIS_UNAVAILABLE = True
        print(f"[auth-rate-limit] Redis unavailable, using in-memory fallback: {exc}")
        return None


async def _consume_auth_rate_limit_redis(
    action: str,
    ip: str,
    identity: str,
    *,
    limit_count: int,
    window_seconds: int,
) -> tuple[bool, int] | None:
    client = await _get_auth_rate_limit_redis_client()
    if client is None:
        return None

    key_seed = _rate_limit_bucket_key(action, ip, identity)
    bucket_hash = _rate_limit_bucket_hash(key_seed)
    now_unix = int(time.time())
    window_bucket = now_unix // window_seconds
    redis_key = f"{AUTH_RATE_LIMIT_REDIS_PREFIX}:{action}:{bucket_hash}:{window_bucket}"

    try:
        count = await client.incr(redis_key)
        if count == 1:
            await client.expire(redis_key, window_seconds + AUTH_RATE_LIMIT_REDIS_KEY_GRACE_SECONDS)

        if count > limit_count:
            retry_after_seconds = max(1, ((window_bucket + 1) * window_seconds) - now_unix)
            return (False, retry_after_seconds)
        return (True, 0)
    except Exception as exc:
        print(f"[auth-rate-limit] Redis error, using in-memory fallback: {exc}")
        return None


def _sweep_auth_rate_limits(now: float):
    global AUTH_RATE_LIMIT_LAST_SWEEP
    if now - AUTH_RATE_LIMIT_LAST_SWEEP < AUTH_RATE_LIMIT_SWEEP_INTERVAL_SECONDS:
        return
    AUTH_RATE_LIMIT_LAST_SWEEP = now
    for key in list(AUTH_RATE_LIMIT_BUCKETS.keys()):
        bucket = AUTH_RATE_LIMIT_BUCKETS.get(key)
        if not bucket:
            AUTH_RATE_LIMIT_BUCKETS.pop(key, None)

    # Hard ceiling to avoid unbounded memory if traffic is maliciously varied.
    if len(AUTH_RATE_LIMIT_BUCKETS) > AUTH_RATE_LIMIT_MAX_BUCKETS:
        for key in list(AUTH_RATE_LIMIT_BUCKETS.keys())[: len(AUTH_RATE_LIMIT_BUCKETS) // 4]:
            AUTH_RATE_LIMIT_BUCKETS.pop(key, None)


async def enforce_auth_rate_limit(action: str, request: Request, *, identity: str = ""):
    limit_count, window_seconds = AUTH_RATE_LIMIT_RULES.get(action, (20, 300))
    ip = _get_client_ip(request) or "unknown"

    redis_result = await _consume_auth_rate_limit_redis(
        action,
        ip,
        identity,
        limit_count=limit_count,
        window_seconds=window_seconds,
    )
    if redis_result is not None:
        allowed, retry_after_seconds = redis_result
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Please try again later.",
                headers={"Retry-After": str(retry_after_seconds)},
            )
        return

    now = time.monotonic()
    key = _rate_limit_bucket_key(action, ip, identity)
    bucket = AUTH_RATE_LIMIT_BUCKETS.get(key)
    if bucket is None:
        bucket = deque()
        AUTH_RATE_LIMIT_BUCKETS[key] = bucket

    cutoff = now - window_seconds
    while bucket and bucket[0] <= cutoff:
        bucket.popleft()

    if len(bucket) >= limit_count:
        retry_after_seconds = max(1, int(window_seconds - (now - bucket[0])))
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please try again later.",
            headers={"Retry-After": str(retry_after_seconds)},
        )

    bucket.append(now)
    _sweep_auth_rate_limits(now)


async def _issue_auth_tokens_for_user(
    user: models.User,
    *,
    db: AsyncSession,
    session_id: str | None = None,
    session_kind: str | None = None,
    user_agent: str | None = None,
) -> schemas.Token:
    normalized_session_kind = auth_utils.normalize_session_kind(session_kind)
    normalized_session_id = _normalize_auth_session_id(session_id) or secrets.token_urlsafe(32)[:43]
    token_data = {
        "sub": user.email,
        "pin_enabled": bool(user.pin_hash),
        "sid": normalized_session_id,
    }
    if normalized_session_kind != auth_utils.SESSION_KIND_DEFAULT:
        token_data["session_kind"] = normalized_session_kind

    access_token = auth_utils.create_access_token(
        data=token_data,
        session_kind=normalized_session_kind,
    )
    refresh_token = auth_utils.create_refresh_token(
        data=token_data,
        session_kind=normalized_session_kind,
    )
    refresh_token_expires = None
    if not auth_utils.is_refresh_token_non_expiring(normalized_session_kind):
        refresh_token_expiry_days = auth_utils.get_refresh_token_expiry_days(normalized_session_kind)
        refresh_token_expires = datetime.utcnow() + timedelta(days=refresh_token_expiry_days)

    session_row = (await db.execute(
        select(models.UserAuthSession).where(
            models.UserAuthSession.user_id == user.id,
            models.UserAuthSession.session_id == normalized_session_id,
        )
    )).scalar_one_or_none()
    if session_row is None:
        session_row = models.UserAuthSession(
            user_id=user.id,
            session_id=normalized_session_id,
            refresh_token_hash=auth_utils.hash_token(refresh_token),
            refresh_token_expires=refresh_token_expires,
            session_kind=normalized_session_kind,
            user_agent=(user_agent or "")[:500] or None,
        )
        db.add(session_row)
    else:
        session_row.refresh_token_hash = auth_utils.hash_token(refresh_token)
        session_row.refresh_token_expires = refresh_token_expires
        session_row.session_kind = normalized_session_kind
        session_row.user_agent = (user_agent or session_row.user_agent or "")[:500] or None
        session_row.last_used_at = datetime.utcnow()

    # Legacy columns are kept in sync for backward compatibility only.
    user.refresh_token_hash = auth_utils.hash_token(refresh_token)
    user.refresh_token_expires = refresh_token_expires
    return schemas.Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        theme_mode=_normalize_theme_mode(getattr(user, "theme_mode", "system")),
        language=_normalize_language(getattr(user, "language", "BM")),
        email_verified=bool(getattr(user, "email_verified_at", None)),
    )


def _set_auth_cookies(response: Response, token_bundle: schemas.Token):
    access_token = token_bundle.access_token
    refresh_token = token_bundle.refresh_token
    if access_token:
        response.set_cookie(
            AUTH_ACCESS_COOKIE_NAME,
            access_token,
            httponly=True,
            secure=AUTH_COOKIE_SECURE,
            samesite=AUTH_COOKIE_SAMESITE,
            path="/",
            max_age=auth_utils.get_access_token_expiry_minutes() * 60,
        )
    if refresh_token:
        response.set_cookie(
            AUTH_REFRESH_COOKIE_NAME,
            refresh_token,
            httponly=True,
            secure=AUTH_COOKIE_SECURE,
            samesite=AUTH_COOKIE_SAMESITE,
            path="/",
            max_age=auth_utils.get_refresh_token_expiry_days() * 24 * 60 * 60,
        )


def _clear_auth_cookies(response: Response):
    for cookie_name in (AUTH_ACCESS_COOKIE_NAME, AUTH_REFRESH_COOKIE_NAME):
        response.delete_cookie(
            cookie_name,
            path="/",
            secure=AUTH_COOKIE_SECURE,
            samesite=AUTH_COOKIE_SAMESITE,
        )


def _normalize_auth_session_id(session_id: str | None) -> str | None:
    value = (session_id or "").strip()
    if not value or len(value) > 64:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_.:-]+", value):
        return None
    return value


async def _clear_user_refresh_token(user: models.User, *, db: AsyncSession | None = None, session_id: str | None = None):
    normalized_session_id = _normalize_auth_session_id(session_id)
    if db is not None:
        stmt = sa_delete(models.UserAuthSession).where(models.UserAuthSession.user_id == user.id)
        if normalized_session_id:
            stmt = stmt.where(models.UserAuthSession.session_id == normalized_session_id)
        await db.execute(stmt)
    if not normalized_session_id:
        user.refresh_token_hash = None
        user.refresh_token_expires = None


async def _handle_google_login(
    *,
    payload: schemas.GoogleLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession,
    normalize_email: Callable[[str | None], str],
    issue_auth_tokens_for_user: Callable[..., Awaitable[schemas.Token]],
    set_auth_cookies: Callable[[Response, schemas.Token], None],
) -> schemas.Token:
    import firebase_admin.auth as firebase_auth
    from push_service import _init_fcm

    _init_fcm()
    try:
        decoded = firebase_auth.verify_id_token(payload.id_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google ID token")

    firebase_uid = decoded.get("uid")
    email = normalize_email(decoded.get("email"))
    name = str(decoded.get("name") or email).strip()[:120]

    if not email or not firebase_uid:
        raise HTTPException(status_code=400, detail="Google account missing email or UID")

    result = await db.execute(
        select(models.User).where(
            (models.User.firebase_uid == firebase_uid) | (models.User.email == email)
        )
    )
    user = result.scalars().first()

    # ponytail: registration toggle; flip REGISTRATION_ENABLED=true in .env to reopen account creation.
    if user is None and os.getenv("REGISTRATION_ENABLED", "true").strip().lower() not in {"1", "true", "yes", "on"}:
        raise HTTPException(status_code=403, detail="Pendaftaran akaun baru tidak dibuka buat masa ini.")

    if user:
        if not user.firebase_uid:
            user.firebase_uid = firebase_uid
        if not user.auth_provider or user.auth_provider == "email":
            user.auth_provider = "google"
        if not user.name or user.name == user.email:
            user.name = name
        # Google verified this email at sign-in; mark existing accounts verified too.
        if user.email_verified_at is None:
            user.email_verified_at = datetime.utcnow()
            user.email_verify_token = None
            user.email_verify_token_expires = None
        await db.flush()
    else:
        user = models.User(
            name=name,
            email=email,
            auth_provider="google",
            firebase_uid=firebase_uid,
            onboarding_done=False,
        )
        db.add(user)
        await db.flush()
        # Google verified the email at sign-in.
        user.email_verified_at = user.email_verified_at or datetime.utcnow()

    if not user.is_active:
        if user.deactivated_reason == "manual":
            raise HTTPException(status_code=403, detail="Account is deactivated")
        # Auto-reactivate on successful Google sign-in: the user proving control of
        # this email/Google account restores access without manual admin approval.
        user.is_active = True
        user.deactivated_at = None
        user.deactivated_reason = None
        user.verification_email_sent_at = None
        user.verification_email_resend_count = 0

    token_bundle = await issue_auth_tokens_for_user(user, db=db, session_id=payload.session_id)
    set_auth_cookies(response, token_bundle)
    await db.commit()
    return token_bundle


def _clear_user_pin_lock(user: models.User):
    user.pin_failed_attempts = 0
    user.pin_locked_until = None


def _clear_user_pin(user: models.User):
    user.pin_hash = None
    user.pin_updated_at = None
    _clear_user_pin_lock(user)


PIN_LOCK_THRESHOLD = int(os.getenv("PIN_LOCK_THRESHOLD", "5"))


def _is_user_pin_locked(user: models.User) -> bool:
    locked_until = getattr(user, "pin_locked_until", None)
    return bool(locked_until and locked_until > datetime.utcnow())


def _record_pin_failed_attempt(user: models.User) -> bool:
    """Increment failed-PIN counter; lock the PIN when threshold is reached.
    Returns True if the PIN is now (or already) locked."""
    if _is_user_pin_locked(user):
        return True
    attempts = int(getattr(user, "pin_failed_attempts", 0) or 0) + 1
    user.pin_failed_attempts = attempts
    if attempts >= PIN_LOCK_THRESHOLD:
        user.pin_locked_until = datetime.utcnow() + timedelta(minutes=PIN_LOCK_MINUTES)
        return True
    return False


async def validate_turnstile_token(token: str | None):
    """Verify Cloudflare Turnstile token."""
    if TURNSTILE_DISABLE_VERIFICATION:
        return True

    if not TURNSTILE_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Security verification is not configured.",
        )

    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security verification required (missing token).",
        )

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={
                    "secret": TURNSTILE_SECRET_KEY,
                    "response": token,
                },
                timeout=5.0,
            )
            outcome = res.json()
            if not outcome.get("success"):
                print(f"[turnstile] Verification failed: {outcome.get('error-codes')}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Security verification failed. Please try again.",
                )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[turnstile] Verification error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Security verification is temporarily unavailable. Please try again.",
        )

    return True


def _is_mobile_user_agent(user_agent: str | None) -> bool:
    if not user_agent:
        return False

    ua = user_agent.lower()
    mobile_markers = (
        "iphone",
        "ipad",
        "android",
        "mobile",
        "windows phone",
        "opera mini",
    )
    return any(marker in ua for marker in mobile_markers)


@app.get("/")
async def root():
    return {"message": "Welcome to BudgetDigitalPort API v1"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/system/db-backup-status")
async def db_backup_status(current_user: models.User = Depends(get_adminportal_admin)):
    log_path = Path("/home/digitalport2budget/db-backup-r2.log")
    if not log_path.exists():
        return {"ok": False, "status": "missing", "message": "Backup log not found"}

    lines = [line.strip() for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines() if line.strip()]
    if not lines:
        return {"ok": False, "status": "empty", "message": "Backup log is empty"}

    latest = lines[-1]
    uploaded_match = re.search(r"Uploaded to (\S+) size=(\d+)", latest)
    failed = bool(re.search(r"failed|error|denied|timeout", latest, re.IGNORECASE))
    stat = log_path.stat()
    response = {
        "ok": bool(uploaded_match) and not failed,
        "status": "success" if uploaded_match and not failed else "failed",
        "message": latest,
        "checked_at": datetime.utcnow().isoformat() + "Z",
        "log_updated_at": datetime.utcfromtimestamp(stat.st_mtime).isoformat() + "Z",
        "size_bytes": int(uploaded_match.group(2)) if uploaded_match else None,
        "destination": uploaded_match.group(1) if uploaded_match else None,
    }
    return response


@app.get("/removed_business/access", response_model=schemas.RemovedBusinessAccessResponse)
async def removed_business_access_status(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return {"enabled": await _removed_business_access_enabled_for_user(db, current_user)}


def _empty_removed_business_access_request_response() -> schemas.RemovedBusinessAccessRequestResponse:
    return schemas.RemovedBusinessAccessRequestResponse(status="none")


def _removed_business_access_request_response_from_data(data: dict[str, Any] | None) -> schemas.RemovedBusinessAccessRequestResponse:
    if not isinstance(data, dict):
        return _empty_removed_business_access_request_response()
    return schemas.RemovedBusinessAccessRequestResponse(
        status=str(data.get("status") or "none"),
        business_name=data.get("business_name"),
        business_type=data.get("business_type"),
        business_description=data.get("business_description"),
        whatsapp_customer_per_day=data.get("whatsapp_customer_per_day"),
        whatsapp_use_case=data.get("whatsapp_use_case"),
        current_tools=data.get("current_tools"),
        submitted_at=data.get("submitted_at"),
        reviewed_at=data.get("reviewed_at"),
        reviewed_by_name=data.get("reviewed_by_name"),
    )


def _removed_business_profile_change_request_response_from_data(data: dict[str, Any] | None) -> schemas.RemovedBusinessProfileChangeRequestResponse:
    if not isinstance(data, dict):
        return schemas.RemovedBusinessProfileChangeRequestResponse(status="none")
    return schemas.RemovedBusinessProfileChangeRequestResponse(
        status=str(data.get("status") or "none"),
        current_brand_name=data.get("current_brand_name"),
        current_business_type=data.get("current_business_type"),
        requested_brand_name=data.get("requested_brand_name"),
        requested_business_type=data.get("requested_business_type"),
        submitted_at=data.get("submitted_at"),
        reviewed_at=data.get("reviewed_at"),
        reviewed_by_name=data.get("reviewed_by_name"),
    )


def _parse_removed_business_access_request(row: models.UserSetting | None) -> dict[str, Any] | None:
    if not row or not row.value:
        return None
    try:
        data = json.loads(row.value)
    except Exception:
        return None
    return data if isinstance(data, dict) else None


async def _get_removed_business_access_request_setting(db: AsyncSession, user_id: str) -> models.UserSetting | None:
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == REMOVED_BUSINESS_ACCESS_REQUEST_SETTING_KEY,
        )
    )
    return result.scalar_one_or_none()


async def _get_removed_business_profile_change_request_setting(db: AsyncSession, user_id: str) -> models.UserSetting | None:
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == REMOVED_BUSINESS_PROFILE_CHANGE_REQUEST_SETTING_KEY,
        )
    )
    return result.scalar_one_or_none()


async def _save_user_setting_json(db: AsyncSession, user_id: str, key: str, data: dict[str, Any]) -> models.UserSetting:
    row = (await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == key,
        )
    )).scalars().first()
    value = json.dumps(data, ensure_ascii=False)
    if row is None:
        row = models.UserSetting(user_id=user_id, key=key, value=value)
        db.add(row)
    else:
        row.value = value
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        # concurrent request inserted the same (user_id, key) row first
        row = (
            await db.execute(
                select(models.UserSetting).where(
                    models.UserSetting.user_id == user_id,
                    models.UserSetting.key == key,
                )
            )
        ).scalars().first()
        if row is None:
            raise
        row.value = value
        await db.flush()
    return row


async def _save_removed_business_access_request(db: AsyncSession, user_id: str, data: dict[str, Any]) -> models.UserSetting:
    return await _save_user_setting_json(db, user_id, REMOVED_BUSINESS_ACCESS_REQUEST_SETTING_KEY, data)


async def _save_removed_business_profile_change_request(db: AsyncSession, user_id: str, data: dict[str, Any]) -> models.UserSetting:
    return await _save_user_setting_json(db, user_id, REMOVED_BUSINESS_PROFILE_CHANGE_REQUEST_SETTING_KEY, data)


@app.get("/removed_business/access-request", response_model=schemas.RemovedBusinessAccessRequestResponse)
async def removed_business_access_request_status(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    row = await _get_removed_business_access_request_setting(db, current_user.id)
    return _removed_business_access_request_response_from_data(_parse_removed_business_access_request(row))


@app.post("/removed_business/access-request", response_model=schemas.RemovedBusinessAccessRequestResponse)
async def submit_removed_business_access_request(
    payload: schemas.RemovedBusinessAccessRequestSubmit,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if await _removed_business_access_enabled_for_user(db, current_user):
        raise HTTPException(status_code=400, detail="Business access already enabled")
    data = {
        "status": "pending",
        "business_name": payload.business_name.strip(),
        "business_type": payload.business_type.strip(),
        "business_description": payload.business_description.strip(),
        "whatsapp_customer_per_day": int(payload.whatsapp_customer_per_day),
        "whatsapp_use_case": payload.whatsapp_use_case.strip(),
        "current_tools": (payload.current_tools or "").strip() or None,
        "submitted_at": datetime.utcnow().isoformat(),
        "reviewed_at": None,
        "reviewed_by_name": None,
    }
    await _save_removed_business_access_request(db, current_user.id, data)
    await db.commit()
    return _removed_business_access_request_response_from_data(data)


def _adminportal_user_response(
    user: models.User,
    removed_business_enabled: bool,
    business_type: str | None = None,
    brand_name: str | None = None,
    business_name: str | None = None,
    business_description: str | None = None,
    whatsapp_customer_per_day: int | None = None,
    whatsapp_use_case: str | None = None,
    current_tools: str | None = None,
    requested_brand_name: str | None = None,
    requested_business_type: str | None = None,
    removed_business_last_activity_at: datetime | None = None,
    removed_business_inactive_days: int | None = None,
) -> schemas.AdminPortalUserResponse:
    return schemas.AdminPortalUserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        is_active=bool(user.is_active),
        is_admin=bool(user.is_admin),
        removed_business_enabled=bool(removed_business_enabled),
        brand_name=brand_name,
        business_name=business_name,
        business_type=business_type,
        business_description=business_description,
        whatsapp_customer_per_day=whatsapp_customer_per_day,
        whatsapp_use_case=whatsapp_use_case,
        current_tools=current_tools,
        requested_brand_name=requested_brand_name,
        requested_business_type=requested_business_type,
        created_at=user.created_at,
        updated_at=user.updated_at,
        removed_business_last_activity_at=removed_business_last_activity_at,
        removed_business_inactive_days=removed_business_inactive_days,
    )


@app.get("/adminportal/users", response_model=schemas.AdminPortalUsersResponse)
async def adminportal_users(
    q: str | None = Query(default=None, max_length=120),
    filter: str | None = Query(default=None, max_length=40),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    query = select(models.User).order_by(models.User.created_at.desc())
    search = (q or "").strip().lower()
    filter_value = (filter or "").strip().lower()
    removed_business_enabled_exists = select(models.UserSetting.id).where(
        models.UserSetting.user_id == models.User.id,
        models.UserSetting.key == ADMINPORTAL_REMOVED_BUSINESS_ACCESS_SETTING_KEY,
        func.lower(models.UserSetting.value).in_(["1", "true", "yes", "on", "enabled"]),
    ).exists()
    if search:
        pattern = f"%{search}%"
        query = select(models.User).where(
            or_(
                func.lower(models.User.name).like(pattern),
                func.lower(models.User.email).like(pattern),
                func.lower(models.User.id).like(pattern),
            )
        ).order_by(models.User.created_at.desc())
    if filter_value == "removed_business":
        query = query.where(or_(models.User.is_admin == True, removed_business_enabled_exists))

    users = list((await db.execute(query.limit(limit).offset(offset))).scalars().all())
    user_ids = [user.id for user in users]
    setting_rows = list((await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.key == ADMINPORTAL_REMOVED_BUSINESS_ACCESS_SETTING_KEY,
            models.UserSetting.user_id.in_(user_ids or [""]),
        )
    )).scalars().all())
    request_rows = list((await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.key == REMOVED_BUSINESS_ACCESS_REQUEST_SETTING_KEY,
            models.UserSetting.user_id.in_(user_ids or [""]),
        )
    )).scalars().all())
    profile_request_rows = list((await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.key == REMOVED_BUSINESS_PROFILE_CHANGE_REQUEST_SETTING_KEY,
            models.UserSetting.user_id.in_(user_ids or [""]),
        )
    )).scalars().all())
    payment_setting_rows = list((await db.execute(
        select(models.BusinessPaymentSetting).where(
            models.BusinessPaymentSetting.user_id.in_(user_ids or [""]),
        )
    )).scalars().all())
    settings_by_user_id = {row.user_id: row for row in setting_rows}
    requests_by_user_id = {row.user_id: _parse_removed_business_access_request(row) for row in request_rows}
    profile_requests_by_user_id = {row.user_id: _parse_removed_business_access_request(row) for row in profile_request_rows}
    payment_settings_by_user_id = {row.user_id: row for row in payment_setting_rows}
    activity_by_user_id = await _removed_business_last_activity_by_user_ids(db, user_ids)
    disabled_any = False
    for user in users:
        setting = settings_by_user_id.get(user.id)
        if await _auto_disable_inactive_removed_business_access(
            db,
            user,
            setting,
            activity_by_user_id.get(user.id),
            actor_user_id=current_admin.id,
            commit=False,
        ):
            disabled_any = True
    if disabled_any:
        await db.commit()
    now = datetime.utcnow()
    response_users = []
    for user in users:
        setting = settings_by_user_id.get(user.id)
        last_activity_at = activity_by_user_id.get(user.id)
        removed_business_enabled = _removed_business_env_access_enabled(user) or bool(user.is_admin) or _user_setting_enabled(setting)
        if filter_value == "removed_business" and not removed_business_enabled:
            continue
        anchor = _removed_business_inactivity_anchor(last_activity_at, setting) if removed_business_enabled else last_activity_at
        response_users.append(
            _adminportal_user_response(
                user,
                removed_business_enabled,
                (requests_by_user_id.get(user.id) or {}).get("business_type"),
                getattr(payment_settings_by_user_id.get(user.id), "brand_name", None),
                (requests_by_user_id.get(user.id) or {}).get("business_name"),
                (requests_by_user_id.get(user.id) or {}).get("business_description"),
                (requests_by_user_id.get(user.id) or {}).get("whatsapp_customer_per_day"),
                (requests_by_user_id.get(user.id) or {}).get("whatsapp_use_case"),
                (requests_by_user_id.get(user.id) or {}).get("current_tools"),
                (profile_requests_by_user_id.get(user.id) or {}).get("requested_brand_name"),
                (profile_requests_by_user_id.get(user.id) or {}).get("requested_business_type"),
                last_activity_at,
                _removed_business_inactive_days(anchor, now) if removed_business_enabled else None,
            )
        )
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()
    if disabled_any and filter_value == "removed_business":
        total = max(0, int(total) - (len(users) - len(response_users)))
    return {
        "total": total,
        "users": response_users,
    }


@app.patch("/adminportal/users/{user_id}/removed_business-access", response_model=schemas.AdminPortalUserResponse)
async def adminportal_update_removed_business_access(
    user_id: str,
    payload: schemas.AdminPortalRemovedBusinessActivationUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    result = await db.execute(select(models.User).where(models.User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_admin.id and not payload.enabled:
        raise HTTPException(status_code=400, detail="Admin business access cannot be disabled here")
    row = await _get_adminportal_removed_business_setting(db, user.id)
    was_enabled = _removed_business_env_access_enabled(user) or bool(user.is_admin) or _user_setting_enabled(row)
    next_value = "true" if payload.enabled else "false"
    if row is None:
        db.add(models.UserSetting(user_id=user.id, key=ADMINPORTAL_REMOVED_BUSINESS_ACCESS_SETTING_KEY, value=next_value))
    else:
        row.value = next_value
    db.add(models.BusinessAuditLog(
        user_id=user.id,
        actor_user_id=current_admin.id,
        entity_type="adminportal_removed_business_access",
        entity_id=user.id,
        action="enable" if payload.enabled else "disable",
        before_state=None,
        after_state=json.dumps({"enabled": bool(payload.enabled)}, ensure_ascii=False),
    ))
    await db.commit()
    if bool(payload.enabled) and not was_enabled:
        try:
            await email_service.send_removed_business_activation_email(user.email, user.name or user.email)
        except Exception as exc:
            print(f"⚠️ Failed to send removed_business activation email for {user.email}: {exc}")
    removed_business_enabled = _removed_business_env_access_enabled(user) or bool(user.is_admin) or bool(payload.enabled)
    last_activity_at = await _removed_business_last_activity_at(db, user.id)
    setting = await _get_adminportal_removed_business_setting(db, user.id)
    anchor = _removed_business_inactivity_anchor(last_activity_at, setting) if removed_business_enabled else last_activity_at
    return _adminportal_user_response(
        user,
        removed_business_enabled,
        removed_business_last_activity_at=last_activity_at,
        removed_business_inactive_days=_removed_business_inactive_days(anchor) if removed_business_enabled else None,
    )


@app.get("/adminportal/removed_business-access-requests", response_model=schemas.AdminPortalRemovedBusinessAccessRequestsResponse)
async def adminportal_removed_business_access_requests(
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    rows = list((await db.execute(
        select(models.UserSetting, models.User)
        .join(models.User, models.User.id == models.UserSetting.user_id)
        .where(models.UserSetting.key == REMOVED_BUSINESS_ACCESS_REQUEST_SETTING_KEY)
        .order_by(models.UserSetting.updated_at.desc())
        .limit(200)
    )).all())
    user_ids = [row.User.id for row in rows]
    removed_business_rows = list((await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.key == ADMINPORTAL_REMOVED_BUSINESS_ACCESS_SETTING_KEY,
            models.UserSetting.user_id.in_(user_ids or [""]),
        )
    )).scalars().all())
    removed_business_by_user_id = {row.user_id: row for row in removed_business_rows}
    requested_status = (status_filter or "").strip().lower()
    requests = []
    for row in rows:
        data = _parse_removed_business_access_request(row.UserSetting)
        if not data:
            continue
        current_status = str(data.get("status") or "none").lower()
        if requested_status and requested_status != "all" and current_status != requested_status:
            continue
        user = row.User
        response = _removed_business_access_request_response_from_data(data).model_dump()
        requests.append(schemas.AdminPortalRemovedBusinessAccessRequestResponse(
            **response,
            user_id=user.id,
            user_name=user.name,
            user_email=user.email,
            is_active=bool(user.is_active),
            removed_business_enabled=_removed_business_env_access_enabled(user) or bool(user.is_admin) or _user_setting_enabled(removed_business_by_user_id.get(user.id)),
        ))
    return {"requests": requests}


@app.patch("/adminportal/removed_business-access-requests/{user_id}/approve", response_model=schemas.AdminPortalRemovedBusinessAccessRequestResponse)
async def adminportal_approve_removed_business_access_request(
    user_id: str,
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    request_row = await _get_removed_business_access_request_setting(db, user.id)
    data = _parse_removed_business_access_request(request_row)
    if not data:
        raise HTTPException(status_code=404, detail="Request not found")
    before_state = dict(data)
    data["status"] = "approved"
    data["reviewed_at"] = datetime.utcnow().isoformat()
    data["reviewed_by_name"] = current_admin.name
    await _save_removed_business_access_request(db, user.id, data)
    removed_business_row = await _get_adminportal_removed_business_setting(db, user.id)
    was_enabled = _removed_business_env_access_enabled(user) or bool(user.is_admin) or _user_setting_enabled(removed_business_row)
    if removed_business_row is None:
        db.add(models.UserSetting(user_id=user.id, key=ADMINPORTAL_REMOVED_BUSINESS_ACCESS_SETTING_KEY, value="true"))
    else:
        removed_business_row.value = "true"
    db.add(models.BusinessAuditLog(
        user_id=user.id,
        actor_user_id=current_admin.id,
        entity_type="adminportal_removed_business_access_request",
        entity_id=user.id,
        action="approve",
        before_state=json.dumps(before_state, ensure_ascii=False),
        after_state=json.dumps(data, ensure_ascii=False),
    ))
    await db.commit()
    if not was_enabled:
        try:
            await email_service.send_removed_business_activation_email(user.email, user.name or user.email)
        except Exception as exc:
            print(f"⚠️ Failed to send removed_business activation email for {user.email}: {exc}")
    response = _removed_business_access_request_response_from_data(data).model_dump()
    return schemas.AdminPortalRemovedBusinessAccessRequestResponse(
        **response,
        user_id=user.id,
        user_name=user.name,
        user_email=user.email,
        is_active=bool(user.is_active),
        removed_business_enabled=True,
    )


@app.patch("/adminportal/removed_business-access-requests/{user_id}/reject", response_model=schemas.AdminPortalRemovedBusinessAccessRequestResponse)
async def adminportal_reject_removed_business_access_request(
    user_id: str,
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    request_row = await _get_removed_business_access_request_setting(db, user.id)
    data = _parse_removed_business_access_request(request_row)
    if not data:
        raise HTTPException(status_code=404, detail="Request not found")
    before_state = dict(data)
    data["status"] = "rejected"
    data["reviewed_at"] = datetime.utcnow().isoformat()
    data["reviewed_by_name"] = current_admin.name
    await _save_removed_business_access_request(db, user.id, data)
    db.add(models.BusinessAuditLog(
        user_id=user.id,
        actor_user_id=current_admin.id,
        entity_type="adminportal_removed_business_access_request",
        entity_id=user.id,
        action="reject",
        before_state=json.dumps(before_state, ensure_ascii=False),
        after_state=json.dumps(data, ensure_ascii=False),
    ))
    await db.commit()
    response = _removed_business_access_request_response_from_data(data).model_dump()
    removed_business_row = await _get_adminportal_removed_business_setting(db, user.id)
    return schemas.AdminPortalRemovedBusinessAccessRequestResponse(
        **response,
        user_id=user.id,
        user_name=user.name,
        user_email=user.email,
        is_active=bool(user.is_active),
        removed_business_enabled=_removed_business_env_access_enabled(user) or bool(user.is_admin) or _user_setting_enabled(removed_business_row),
    )

@app.post("/removed_business/profile-change-request", response_model=schemas.RemovedBusinessProfileChangeRequestResponse)
async def submit_removed_business_profile_change_request(
    payload: schemas.RemovedBusinessProfileChangeRequestSubmit,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == current_user.id))
    setting = result.scalars().first()
    if setting is None:
        setting = models.BusinessPaymentSetting(user_id=current_user.id)
        db.add(setting)
        await db.flush()
    access_data = _parse_removed_business_access_request(await _get_removed_business_access_request_setting(db, current_user.id)) or {}
    requested_brand_name = (payload.requested_brand_name or "").strip()
    requested_business_type = (payload.requested_business_type or "").strip()
    if not requested_brand_name and not requested_business_type:
        raise HTTPException(status_code=400, detail="Brand name or business type is required")
    data = {
        "status": "pending",
        "current_brand_name": setting.brand_name,
        "current_business_type": access_data.get("business_type"),
        "requested_brand_name": requested_brand_name or setting.brand_name,
        "requested_business_type": requested_business_type or access_data.get("business_type"),
        "submitted_at": datetime.utcnow().isoformat(),
        "reviewed_at": None,
        "reviewed_by_name": None,
    }
    await _save_removed_business_profile_change_request(db, current_user.id, data)
    await db.commit()
    return _removed_business_profile_change_request_response_from_data(data)


@app.get("/adminportal/removed_business-profile-change-requests", response_model=schemas.AdminPortalRemovedBusinessProfileChangeRequestsResponse)
async def adminportal_removed_business_profile_change_requests(
    status_filter: str | None = Query(default="pending", alias="status", max_length=32),
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    rows = list((await db.execute(
        select(models.UserSetting, models.User)
        .join(models.User, models.User.id == models.UserSetting.user_id)
        .where(models.UserSetting.key == REMOVED_BUSINESS_PROFILE_CHANGE_REQUEST_SETTING_KEY)
        .order_by(models.UserSetting.updated_at.desc())
        .limit(200)
    )).all())
    user_ids = [row.User.id for row in rows]
    removed_business_rows = list((await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.key == ADMINPORTAL_REMOVED_BUSINESS_ACCESS_SETTING_KEY,
            models.UserSetting.user_id.in_(user_ids or [""]),
        )
    )).scalars().all())
    removed_business_by_user_id = {row.user_id: row for row in removed_business_rows}
    requested_status = (status_filter or "").strip().lower()
    requests = []
    for row in rows:
        data = _parse_removed_business_access_request(row.UserSetting)
        if not data:
            continue
        current_status = str(data.get("status") or "none").lower()
        if requested_status and requested_status != "all" and current_status != requested_status:
            continue
        user = row.User
        response = _removed_business_profile_change_request_response_from_data(data).model_dump()
        requests.append(schemas.AdminPortalRemovedBusinessProfileChangeRequestResponse(
            **response,
            user_id=user.id,
            user_name=user.name,
            user_email=user.email,
            is_active=bool(user.is_active),
            removed_business_enabled=_removed_business_env_access_enabled(user) or bool(user.is_admin) or _user_setting_enabled(removed_business_by_user_id.get(user.id)),
        ))
    return {"requests": requests}


@app.patch("/adminportal/removed_business-profile-change-requests/{user_id}/approve", response_model=schemas.AdminPortalRemovedBusinessProfileChangeRequestResponse)
async def adminportal_approve_removed_business_profile_change_request(
    user_id: str,
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    request_row = await _get_removed_business_profile_change_request_setting(db, user.id)
    data = _parse_removed_business_access_request(request_row)
    if not data:
        raise HTTPException(status_code=404, detail="Request not found")
    setting_result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == user.id))
    setting = setting_result.scalars().first()
    if setting is None:
        setting = models.BusinessPaymentSetting(user_id=user.id)
        db.add(setting)
        await db.flush()
    before_state = dict(data)
    requested_brand_name = (data.get("requested_brand_name") or "").strip()
    requested_business_type = (data.get("requested_business_type") or "").strip()
    if requested_brand_name:
        setting.brand_name = requested_brand_name
    access_row = await _get_removed_business_access_request_setting(db, user.id)
    access_data = _parse_removed_business_access_request(access_row) or {}
    if requested_business_type:
        access_data["business_type"] = requested_business_type
        await _save_removed_business_access_request(db, user.id, access_data)
    data["status"] = "approved"
    data["reviewed_at"] = datetime.utcnow().isoformat()
    data["reviewed_by_name"] = current_admin.name
    await _save_removed_business_profile_change_request(db, user.id, data)
    db.add(models.BusinessAuditLog(
        user_id=user.id,
        actor_user_id=current_admin.id,
        entity_type="removed_business_profile_change_request",
        entity_id=user.id,
        action="approve",
        before_state=json.dumps(before_state, ensure_ascii=False),
        after_state=json.dumps(data, ensure_ascii=False),
    ))
    await db.commit()
    response = _removed_business_profile_change_request_response_from_data(data).model_dump()
    return schemas.AdminPortalRemovedBusinessProfileChangeRequestResponse(
        **response,
        user_id=user.id,
        user_name=user.name,
        user_email=user.email,
        is_active=bool(user.is_active),
        removed_business_enabled=True,
    )


@app.get("/removed_business/dashboard", response_model=schemas.RemovedBusinessDashboardResponse)
async def removed_business_dashboard(
    month: str | None = None,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    return await _module_removed_business_dashboard_route(
        db=db,
        current_user=current_user,
        current_business_date=current_business_date,
        month_key=month,
    )

def _removed_business_clean_aliases(values: list[str] | None) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in values or []:
        value = " ".join((raw or "").strip().split())
        if not value:
            continue
        lowered = value.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        cleaned.append(value)
    return cleaned


async def _removed_business_load_follow_stock_map(db: AsyncSession, user_id: str) -> dict[int, bool]:
    mapped: dict[int, bool] = {}
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == 'removed_business_product_follow_stock',
        )
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return mapped
    try:
        raw = json.loads(row.value)
    except Exception:
        return mapped
    if not isinstance(raw, dict):
        return mapped
    for key, value in raw.items():
        try:
            mapped[int(key)] = bool(value)
        except Exception:
            continue
    return mapped

async def _removed_business_load_product_shipping_map(db: AsyncSession, user_id: str) -> dict[int, dict[str, float | str]]:
    mapped: dict[int, dict[str, float | str]] = {}
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == 'removed_business_product_shipping_settings',
        )
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return mapped
    try:
        raw = json.loads(row.value)
    except Exception:
        return mapped
    if not isinstance(raw, dict):
        return mapped
    for key, value in raw.items():
        try:
            product_id = int(key)
            if isinstance(value, dict):
                mode = str(value.get('mode') or 'rider').strip().lower()
                amount = float(value.get('amount') or 0)
                basis = str(value.get('basis') or 'order').strip().lower()
            else:
                mode = 'shipping' if str(value).strip().lower() == 'shipping' else 'rider'
                amount = 0.0
                basis = 'order'
            mapped[product_id] = {'mode': mode if mode in {'rider', 'shipping'} else 'rider', 'amount': max(0.0, amount), 'basis': basis if basis in {'order', 'item'} else 'order'}
        except Exception:
            continue
    return mapped


async def _removed_business_save_product_shipping_value(db: AsyncSession, user_id: str, product_id: int, delivery_charge_mode: str, shipping_fixed_amount: float | None, shipping_charge_basis: str | None = None) -> None:
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == 'removed_business_product_shipping_settings',
        )
    )
    row = result.scalar_one_or_none()
    data: dict[str, dict[str, float | str]] = {}
    if row and row.value:
        try:
            raw = json.loads(row.value)
            if isinstance(raw, dict):
                for key, value in raw.items():
                    if isinstance(value, dict):
                        data[str(key)] = value
        except Exception:
            data = {}
    mode = 'shipping' if str(delivery_charge_mode or '').strip().lower() == 'shipping' else 'rider'
    basis = 'item' if str(shipping_charge_basis or '').strip().lower() == 'item' else 'order'
    try:
        amount = max(0.0, float(shipping_fixed_amount or 0))
    except (TypeError, ValueError):
        amount = 0.0
    data[str(int(product_id))] = {'mode': mode, 'amount': amount if mode == 'shipping' else 0.0, 'basis': basis if mode == 'shipping' else 'order'}
    payload = json.dumps(data)
    if row is None:
        db.add(models.UserSetting(user_id=user_id, key='removed_business_product_shipping_settings', value=payload))
    else:
        row.value = payload
    await db.flush()


async def _removed_business_load_product_delivery_mode_map(db: AsyncSession, user_id: str) -> dict[int, str]:
    mapped: dict[int, str] = {}
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == 'removed_business_product_delivery_mode',
        )
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return mapped
    try:
        raw = json.loads(row.value)
    except Exception:
        return mapped
    if not isinstance(raw, dict):
        return mapped
    for key, value in raw.items():
        try:
            mode = str(value or 'all').strip().lower()
            mapped[int(key)] = mode if mode in {'all', 'pickup', 'delivery'} else 'all'
        except Exception:
            continue
    return mapped

async def _removed_business_save_product_delivery_mode_value(db: AsyncSession, user_id: str, product_id: int, delivery_mode: str) -> None:
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == 'removed_business_product_delivery_mode',
        )
    )
    row = result.scalar_one_or_none()
    data: dict[str, str] = {}
    if row and row.value:
        try:
            raw = json.loads(row.value)
            if isinstance(raw, dict):
                data = {str(k): str(v) for k, v in raw.items()}
        except Exception:
            data = {}
    mode = str(delivery_mode or 'all').strip().lower()
    data[str(int(product_id))] = mode if mode in {'all', 'pickup', 'delivery'} else 'all'
    payload = json.dumps(data)
    if row is None:
        db.add(models.UserSetting(user_id=user_id, key='removed_business_product_delivery_mode', value=payload))
    else:
        row.value = payload
    await db.flush()

async def _removed_business_save_follow_stock_value(db: AsyncSession, user_id: str, product_id: int, follow_stock: bool) -> None:
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == 'removed_business_product_follow_stock',
        )
    )
    row = result.scalar_one_or_none()
    data: dict[str, bool] = {}
    if row and row.value:
        try:
            raw = json.loads(row.value)
            if isinstance(raw, dict):
                data = {str(k): bool(v) for k, v in raw.items()}
        except Exception:
            data = {}
    data[str(int(product_id))] = bool(follow_stock)
    payload = json.dumps(data)
    if row is None:
        db.add(models.UserSetting(user_id=user_id, key='removed_business_product_follow_stock', value=payload))
    else:
        row.value = payload
    await db.flush()

def _removed_business_parse_aliases(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return [str(item) for item in data if str(item).strip()]


def _removed_business_product_response(row: models.BusinessProduct, *, follow_stock: bool = False, delivery_mode: str = "all", delivery_charge_mode: str = "rider", shipping_fixed_amount: float | None = None, shipping_charge_basis: str = "order") -> schemas.RemovedBusinessProductResponse:
    return schemas.RemovedBusinessProductResponse(
        id=int(row.id),
        product_name=row.product_name,
        product_type=row.product_type,
        keyword_aliases=_removed_business_parse_aliases(row.keyword_aliases),
        unit_label=row.unit_label,
        default_price=float(row.default_price) if row.default_price is not None else None,
        removed_business_product_image_url=row.removed_business_product_image_url,
        is_active=bool(row.is_active),
        follow_stock=bool(follow_stock),
        delivery_mode=delivery_mode if delivery_mode in {"all", "pickup", "delivery"} else "all",
        delivery_charge_mode=delivery_charge_mode if delivery_charge_mode in {"rider", "shipping"} else "rider",
        shipping_charge_basis=shipping_charge_basis if shipping_charge_basis in {"order", "item"} else "order",
        shipping_fixed_amount=float(shipping_fixed_amount) if shipping_fixed_amount is not None else None,
        sort_order=int(row.sort_order or 0),
        category_id=int(row.category_id) if row.category_id is not None else None,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _removed_business_order_item_response(
    row: models.BusinessOrderItem,
    product_image_url: str | None = None,
) -> schemas.RemovedBusinessOrderItemResponse:
    return schemas.RemovedBusinessOrderItemResponse(
        id=int(row.id),
        order_id=int(row.order_id),
        product_id=int(row.product_id) if row.product_id is not None else None,
        item_name=row.item_name,
        quantity=float(row.quantity),
        unit_price=float(row.unit_price) if row.unit_price is not None else None,
        line_total=float(row.line_total),
        sort_order=int(row.sort_order),
        removed_business_product_image_url=product_image_url,
        created_at=row.created_at.replace(tzinfo=timezone.utc) if row.created_at else None,
        updated_at=row.updated_at.replace(tzinfo=timezone.utc) if row.updated_at else None,
    )


async def _removed_business_load_official_identifiers_for_app(db: AsyncSession, user_id: str) -> set[str]:
    result = await db.execute(
        select(models.BusinessOfficialStaff.identifier).where(
            models.BusinessOfficialStaff.is_active.is_(True),
            or_(
                models.BusinessOfficialStaff.user_id == user_id,
                models.BusinessOfficialStaff.is_global.is_(True),
            ),
        )
    )
    return {str(value).strip() for value in result.scalars().all() if str(value or "").strip()}


def _removed_business_is_order_official_for_app(row: models.BusinessOrder, official_identifiers: set[str] | None = None) -> bool:
    if bool(row.is_official):
        return True
    if official_identifiers is None:
        return False
    customer_phone = _removed_business_display_customer_phone(row.customer_phone)
    return bool(customer_phone and customer_phone in official_identifiers)


def _removed_business_order_response(
    row: models.BusinessOrder,
    order_items: list[models.BusinessOrderItem] | None = None,
    rider: models.BusinessRider | None = None,
    official_identifiers: set[str] | None = None,
    order_item_image_map: dict[int, str | None] | None = None,
) -> schemas.RemovedBusinessOrderResponse:
    clean_note, delivery_meta = _removed_business_parse_delivery_meta(row.note)
    delivery_charge = float(row.delivery_charge) if row.delivery_charge is not None else (float(delivery_meta.get("delivery_charge")) if delivery_meta.get("delivery_charge") is not None else 0.0)
    amount_value = float(row.amount) if row.amount is not None else None
    subtotal_amount = float(row.subtotal_amount) if row.subtotal_amount is not None else (None if amount_value is None else max(0.0, amount_value - max(0.0, float(delivery_charge or 0))))
    order_mode = (row.order_mode or delivery_meta.get("order_mode") or "").strip().lower()
    if order_mode not in {"pickup", "delivery"}:
        order_mode = "delivery" if delivery_meta.get("delivery_address") or delivery_meta.get("delivery_latitude") is not None else "pickup"
    derived_delivery_address = row.delivery_address or delivery_meta.get("delivery_address")
    if not derived_delivery_address and delivery_meta.get("delivery_latitude") is not None and delivery_meta.get("delivery_longitude") is not None:
        derived_delivery_address = f"{float(delivery_meta.get("delivery_latitude")):.6f}, {float(delivery_meta.get("delivery_longitude")):.6f}"
    return schemas.RemovedBusinessOrderResponse(
        id=int(row.id),
        order_no=row.order_no,
        customer_name=row.customer_name,
        customer_phone=_removed_business_display_customer_phone(row.customer_phone),
        order_mode=order_mode,
        delivery_address=derived_delivery_address,
        delivery_address_text=row.delivery_address_text or delivery_meta.get("delivery_address_text"),
        delivery_latitude=float(row.delivery_latitude) if row.delivery_latitude is not None else (float(delivery_meta.get("delivery_latitude")) if delivery_meta.get("delivery_latitude") is not None else None),
        delivery_longitude=float(row.delivery_longitude) if row.delivery_longitude is not None else (float(delivery_meta.get("delivery_longitude")) if delivery_meta.get("delivery_longitude") is not None else None),
        delivery_distance_km=float(row.delivery_distance_km) if row.delivery_distance_km is not None else (float(delivery_meta.get("delivery_distance_km")) if delivery_meta.get("delivery_distance_km") is not None else None),
        delivery_charge=delivery_charge,
        subtotal_amount=subtotal_amount,
        delivery_rider_id=int(row.delivery_rider_id) if row.delivery_rider_id is not None else None,
        delivery_rider_name=row.delivery_rider_name,
        delivery_rider_vehicle_no=rider.vehicle_no if rider else None,
        delivery_rider_avatar_url=rider.avatar_url if rider else None,
        delivery_public_token=row.delivery_public_token,
        delivery_public_status=row.delivery_public_status,
        delivery_public_note=row.delivery_public_note,
        delivery_public_updated_at=row.delivery_public_updated_at.replace(tzinfo=timezone.utc) if row.delivery_public_updated_at else None,
        stripe_payment_url=getattr(row, "stripe_payment_url", None),
        stripe_payment_short_url=(f"{APP_PUBLIC_URL}/p/{row.stripe_payment_short_token}" if getattr(row, "stripe_payment_short_token", None) else None),
        paid_at=row.paid_at.replace(tzinfo=timezone.utc).isoformat() if row.paid_at else None,
        product_id=int(row.product_id) if row.product_id is not None else None,
        item_name=row.item_name,
        product_type=row.product_type,
        quantity=float(row.quantity) if row.quantity is not None else None,
        amount=amount_value,
        payment_method=row.payment_method,
        status=row.status,
        cancel_reason=row.cancel_reason,
        note=clean_note,
        customer_note=getattr(row, 'customer_note', None),
        source=row.source,
        receipt_url=row.receipt_url,
        scam_status=row.scam_status,
        scam_bank_account=row.scam_bank_account,
        scam_holder_name=row.scam_holder_name,
        scam_bank_name=row.scam_bank_name,
        scam_report_count=row.scam_report_count,
        scam_fraud_flag=bool(row.scam_fraud_flag),
        scam_checked_at=row.scam_checked_at.replace(tzinfo=timezone.utc) if row.scam_checked_at else None,
        scam_scan_source=row.scam_scan_source,
        is_official=_removed_business_is_order_official_for_app(row, official_identifiers),
        order_items=[
            _removed_business_order_item_response(
                item,
                (order_item_image_map or {}).get(int(item.id)),
            )
            for item in (order_items or [])
        ],
        created_at=row.created_at.replace(tzinfo=timezone.utc) if row.created_at else None,
        updated_at=row.updated_at.replace(tzinfo=timezone.utc) if row.updated_at else None,
    )


def _removed_business_expense_response(row: models.BusinessExpense) -> schemas.RemovedBusinessExpenseResponse:
    return schemas.RemovedBusinessExpenseResponse(
        id=int(row.id),
        category=row.category,
        item_name=row.item_name,
        amount=float(row.amount),
        note=row.note,
        source=row.source,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )



def _removed_business_audit_log_response(row: models.BusinessAuditLog, include_order_name: bool = False, order_name: str | None = None, user_name: str | None = None) -> schemas.RemovedBusinessAuditLogResponse:
    before_state: dict[str, Any] | None = None
    after_state: dict[str, Any] | None = None
    try:
        before_state = json.loads(row.before_state) if row.before_state else None
    except Exception:
        before_state = None
    try:
        after_state = json.loads(row.after_state) if row.after_state else None
    except Exception:
        after_state = None
    return schemas.RemovedBusinessAuditLogResponse(
        id=int(row.id),
        user_id=row.user_id,
        actor_user_id=row.actor_user_id,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        action=row.action,
        before_state=before_state,
        after_state=after_state,
        order_name=order_name if include_order_name else None,
        user_name=user_name,
        created_at=row.created_at,
    )


def _removed_business_order_snapshot(row: models.BusinessOrder | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": int(row.id) if getattr(row, "id", None) is not None else None,
        "order_no": row.order_no,
        "customer_name": row.customer_name,
        "customer_phone": _removed_business_display_customer_phone(row.customer_phone),
        "product_id": int(row.product_id) if row.product_id is not None else None,
        "item_name": row.item_name,
        "product_type": row.product_type,
        "quantity": float(row.quantity) if row.quantity is not None else None,
        "amount": float(row.amount) if row.amount is not None else None,
        "payment_method": row.payment_method,
        "status": row.status,
        "cancel_reason": row.cancel_reason,
        "note": row.note,
        "source": row.source,
        "receipt_url": row.receipt_url,
        "paid_at": row.paid_at.isoformat() if row.paid_at else None,
    }


def _removed_business_public_delivery_item_response(row: models.BusinessOrderItem) -> schemas.RemovedBusinessPublicDeliveryItemResponse:
    return schemas.RemovedBusinessPublicDeliveryItemResponse(
        item_name=row.item_name,
        quantity=float(row.quantity),
    )


async def _removed_business_public_delivery_response(db: AsyncSession, row: models.BusinessOrder) -> schemas.RemovedBusinessPublicDeliveryResponse:
    rider = None
    if row.delivery_rider_id is not None:
        rider_result = await db.execute(
            select(models.BusinessRider).where(
                models.BusinessRider.id == int(row.delivery_rider_id),
                models.BusinessRider.user_id == row.user_id,
            )
        )
        rider = rider_result.scalar_one_or_none()
    items = await _removed_business_load_order_items(db, user_id=row.user_id, order_id=int(row.id))
    return schemas.RemovedBusinessPublicDeliveryResponse(
        order_no=row.order_no,
        customer_name=row.customer_name,
        order_mode=row.order_mode,
        delivery_address=row.delivery_address,
        delivery_address_text=row.delivery_address_text,
        delivery_latitude=float(row.delivery_latitude) if row.delivery_latitude is not None else None,
        delivery_longitude=float(row.delivery_longitude) if row.delivery_longitude is not None else None,
        delivery_charge=float(row.delivery_charge) if row.delivery_charge is not None else 0.0,
        amount=float(row.amount) if row.amount is not None else None,
        status=row.status,
        delivery_public_status=row.delivery_public_status,
        delivery_public_note=row.delivery_public_note,
        delivery_public_updated_at=row.delivery_public_updated_at,
        rider_name=row.delivery_rider_name or (rider.name if rider else None),
        rider_vehicle_no=rider.vehicle_no if rider else None,
        rider_avatar_url=rider.avatar_url if rider else None,
        items=[_removed_business_public_delivery_item_response(item) for item in items],
        created_at=row.created_at,
    )


def _removed_business_order_item_snapshot(row: models.BusinessOrderItem | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": int(row.id) if getattr(row, "id", None) is not None else None,
        "order_id": int(row.order_id) if row.order_id is not None else None,
        "product_id": int(row.product_id) if row.product_id is not None else None,
        "item_name": row.item_name,
        "quantity": float(row.quantity),
        "unit_price": float(row.unit_price) if row.unit_price is not None else None,
        "line_total": float(row.line_total),
        "sort_order": int(row.sort_order),
    }


def _removed_business_expense_snapshot(row: models.BusinessExpense | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": int(row.id) if getattr(row, "id", None) is not None else None,
        "category": row.category,
        "item_name": row.item_name,
        "amount": float(row.amount),
        "note": row.note,
        "source": row.source,
    }


def _removed_business_owner_draw_response(row: models.BusinessOwnerDraw) -> schemas.RemovedBusinessOwnerDrawResponse:
    return schemas.RemovedBusinessOwnerDrawResponse(
        id=int(row.id),
        amount=float(row.amount),
        note=row.note,
        auto_record_personal=bool(row.auto_record_personal),
        personal_wallet_id=int(row.personal_wallet_id) if row.personal_wallet_id is not None else None,
        personal_transaction_id=int(row.personal_transaction_id) if row.personal_transaction_id is not None else None,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _removed_business_owner_draw_snapshot(row: models.BusinessOwnerDraw | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": int(row.id) if getattr(row, "id", None) is not None else None,
        "amount": float(row.amount) if row.amount is not None else None,
        "note": row.note,
        "auto_record_personal": bool(row.auto_record_personal),
        "personal_wallet_id": int(row.personal_wallet_id) if row.personal_wallet_id is not None else None,
        "personal_transaction_id": int(row.personal_transaction_id) if row.personal_transaction_id is not None else None,
    }

async def _removed_business_owner_draw_summary(db: AsyncSession, current_user: models.User) -> dict[str, float]:
    dashboard = await _module_removed_business_dashboard_route(
        db=db,
        current_user=current_user,
        current_business_date=current_business_date,
    )
    draw_result = await db.execute(
        select(func.sum(models.BusinessOwnerDraw.amount))
        .where(models.BusinessOwnerDraw.user_id == current_user.id)
    )
    sales = float(dashboard.get("sales") or 0.0)
    costs = float(dashboard.get("costs") or 0.0)
    total_owner_drawn = float(draw_result.scalar() or 0.0)
    gross_profit = float(dashboard.get("profit") or 0.0)
    safe_profit_available = gross_profit - total_owner_drawn
    return {
        "sales": round(sales, 2),
        "costs": round(costs, 2),
        "gross_profit": round(gross_profit, 2),
        "total_owner_drawn": round(total_owner_drawn, 2),
        "safe_profit_available": round(safe_profit_available, 2),
        "rolling_modal_balance": round(safe_profit_available, 2),
    }

def _removed_business_product_snapshot(row: models.BusinessProduct | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": int(row.id) if getattr(row, "id", None) is not None else None,
        "product_name": row.product_name,
        "product_type": row.product_type,
        "keyword_aliases": _removed_business_parse_aliases(row.keyword_aliases),
        "unit_label": row.unit_label,
        "default_price": float(row.default_price) if row.default_price is not None else None,
        "removed_business_product_image_url": row.removed_business_product_image_url,
        "is_active": bool(row.is_active),
    }


def _removed_business_payment_settings_snapshot(row: models.BusinessPaymentSetting | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "brand_name": row.brand_name,
        "qr_image_url": row.qr_image_url,
        "payment_image_url": row.payment_image_url,
        "bank_name": row.bank_name,
        "account_name": row.account_name,
        "account_number": row.account_number,
        "auto_acknowledge_incoming_order": bool(row.auto_acknowledge_incoming_order),
        "auto_acknowledge_payment_receipt": bool(row.auto_acknowledge_payment_receipt),
        "auto_reply_qr_on_order": bool(row.auto_reply_qr_on_order),
        "auto_reply_qr_when_amount_ready": bool(row.auto_reply_qr_when_amount_ready),
        "is_business_open": bool(row.is_business_open),
        "capture_all_whatsapp_messages": bool(row.capture_all_whatsapp_messages),
        "allow_owner_whatsapp_order_proxy": bool(getattr(row, "allow_owner_whatsapp_order_proxy", False)),
        "whatsapp_trigger_prefix": row.whatsapp_trigger_prefix,
        "business_closed_reply_template": row.business_closed_reply_template,
        "incoming_order_reply_template": row.incoming_order_reply_template,
        "payment_review_reply_template": row.payment_review_reply_template,
        "qr_caption_template": row.qr_caption_template,
        "payment_note_template": row.payment_note_template,
        "customer_note_prompt": row.customer_note_prompt,
        "customer_note_example": row.customer_note_example,
        "customer_note_enabled": bool(getattr(row, "customer_note_enabled", True)),
        "catalog_list_enabled": bool(getattr(row, "catalog_list_enabled", True)),
        "catalog_image_url": row.catalog_image_url,
    }


async def _removed_business_write_audit_log(
    db: AsyncSession,
    *,
    user_id: str,
    actor_user_id: str | None,
    entity_type: str,
    entity_id: str | int | None,
    action: str,
    before_state: dict[str, Any] | None,
    after_state: dict[str, Any] | None,
) -> None:
    db.add(
        models.BusinessAuditLog(
            user_id=user_id,
            actor_user_id=actor_user_id,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            action=action,
            before_state=json.dumps(before_state, ensure_ascii=False) if before_state is not None else None,
            after_state=json.dumps(after_state, ensure_ascii=False) if after_state is not None else None,
        )
    )


def _removed_business_decimal_2(value: float) -> float:
    return round(float(value) + 1e-9, 2)


def _removed_business_compute_line_total(
    *,
    quantity: float,
    unit_price: float | None,
    line_total: float | None,
) -> tuple[float, float | None, float]:
    qty = float(quantity)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")

    normalized_unit: float | None = None
    if unit_price is not None:
        normalized_unit = float(unit_price)
        if normalized_unit < 0:
            raise HTTPException(status_code=400, detail="Unit price must be zero or greater.")

    normalized_total: float | None = None
    if line_total is not None:
        normalized_total = float(line_total)
        if normalized_total < 0:
            raise HTTPException(status_code=400, detail="Line total must be zero or greater.")

    if normalized_total is None and normalized_unit is None:
        raise HTTPException(status_code=400, detail="Provide unit_price or line_total.")

    if normalized_total is None and normalized_unit is not None:
        normalized_total = normalized_unit * qty
    if normalized_unit is None and normalized_total is not None:
        normalized_unit = (normalized_total / qty) if qty else 0.0

    return _removed_business_decimal_2(qty), _removed_business_decimal_2(normalized_unit or 0), _removed_business_decimal_2(normalized_total or 0)


async def _removed_business_find_product_by_id(
    db: AsyncSession,
    *,
    user_id: str,
    product_id: int,
) -> models.BusinessProduct | None:
    result = await db.execute(
        select(models.BusinessProduct).where(
            models.BusinessProduct.id == int(product_id),
            models.BusinessProduct.user_id == user_id,
            models.BusinessProduct.is_active.is_(True),
        )
    )
    return result.scalars().first()


async def _removed_business_load_order_items(
    db: AsyncSession,
    *,
    user_id: str,
    order_id: int,
) -> list[models.BusinessOrderItem]:
    result = await db.execute(
        select(models.BusinessOrderItem)
        .where(
            models.BusinessOrderItem.user_id == user_id,
            models.BusinessOrderItem.order_id == order_id,
        )
        .order_by(models.BusinessOrderItem.sort_order.asc(), models.BusinessOrderItem.id.asc())
    )
    return list(result.scalars().all())


async def _removed_business_load_order_item_image_map(
    db: AsyncSession,
    *,
    user_id: str,
    order_id: int,
) -> dict[int, str | None]:
    result = await db.execute(
        select(models.BusinessOrderItem.id, models.BusinessProduct.removed_business_product_image_url)
        .outerjoin(
            models.BusinessProduct,
            models.BusinessOrderItem.product_id == models.BusinessProduct.id,
        )
        .where(
            models.BusinessOrderItem.user_id == user_id,
            models.BusinessOrderItem.order_id == order_id,
        )
    )
    return {int(item_id): image_url for item_id, image_url in result.all()}


async def _removed_business_sync_order_summary_from_items(
    db: AsyncSession,
    *,
    order: models.BusinessOrder,
) -> None:
    items = await _removed_business_load_order_items(db, user_id=order.user_id, order_id=int(order.id))
    if not items:
        return

    total_qty = sum(float(item.quantity or 0) for item in items)
    total_amount = sum(float(item.line_total or 0) for item in items)
    first_item = items[0]
    order.item_name = first_item.item_name
    order.product_id = first_item.product_id
    if first_item.product_id is not None:
        product = await _removed_business_find_product_by_id(db, user_id=order.user_id, product_id=int(first_item.product_id))
        if product is not None:
            order.product_type = (product.product_type or "").strip() or order.product_type
    if total_qty > 0:
        order.quantity = _removed_business_decimal_2(total_qty)
    clean_note, delivery_meta = _removed_business_parse_delivery_meta(order.note)
    delivery_charge = float(order.delivery_charge) if order.delivery_charge is not None else (float(delivery_meta.get("delivery_charge")) if delivery_meta.get("delivery_charge") is not None else 0.0)
    order.subtotal_amount = _removed_business_decimal_2(total_amount)
    order.amount = _removed_business_decimal_2(total_amount + max(0.0, delivery_charge))


def _removed_business_build_receipt_object_key(user_id: str, source: str, filename: str | None, extension: str) -> str:
    safe_name = Path(filename or "payment-receipt").name
    safe_name = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in safe_name).strip("._") or "payment-receipt"
    stem = Path(safe_name).stem or "payment-receipt"
    ext = extension.lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    month_prefix = datetime.utcnow().strftime("%Y/%m")
    source_slug = re.sub(r"[^a-z0-9_-]", "-", (source or "removed_business").strip().lower()) or "removed_business"
    return f"removed_business/receipts/{user_id}/{month_prefix}/{source_slug}/{uuid4().hex}-{stem}{ext}"


def _removed_business_storage_direct_url(object_key: str | None) -> str | None:
    if not object_key:
        return None
    cdn_domain = os.getenv("R2_CDN_DOMAIN", "").strip()
    if not cdn_domain:
        return None
    return f"https://{cdn_domain}/{object_key}"


async def _removed_business_store_receipt_payload(
    *,
    user_id: str,
    source: str,
    payload: bytes | None,
    mime_type: str | None,
    file_name: str | None,
    order_no: str | None = None,
) -> str | None:
    if not payload:
        return None
    if len(payload) > RECEIPT_DIRECT_UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Receipt image is too large.")
    validated_mime, extension = storage_service.validate_receipt_file(file_name, mime_type, payload)
    key_file_name = file_name
    if order_no:
        key_file_name = f"{order_no}{extension}"
    object_key = _removed_business_build_receipt_object_key(user_id, source, key_file_name, extension)
    await asyncio.to_thread(storage_service.upload_receipt_object, object_key, payload, validated_mime, filename=key_file_name)
    return _removed_business_storage_direct_url(object_key) or object_key


def _removed_business_decode_media_base64(media_base64: str | None) -> bytes | None:
    if not media_base64:
        return None
    try:
        return base64.b64decode(media_base64, validate=True)
    except (ValueError, binascii.Error):
        return None


def _removed_business_webhook_receipt_fields(payload: dict[str, Any]) -> tuple[bytes | None, str | None, str | None]:
    media_payload = _removed_business_decode_media_base64(str(payload.get("media_base64") or "").strip() or None)
    media_mime_type = str(payload.get("media_mime_type") or payload.get("mime_type") or "").strip() or None
    media_file_name = str(payload.get("media_file_name") or payload.get("file_name") or "payment-receipt").strip() or "payment-receipt"
    return media_payload, media_mime_type, media_file_name


def _removed_business_parse_month_key(month_key: str | None) -> tuple[datetime | None, datetime | None]:
    value = (month_key or "").strip()
    if not value:
        return None, None
    if not re.fullmatch(r"\d{4}-\d{2}", value):
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")
    start = datetime.strptime(value + "-01", "%Y-%m-%d")
    if start.month == 12:
        end = datetime(start.year + 1, 1, 1)
    else:
        end = datetime(start.year, start.month + 1, 1)
    return start, end


def _removed_business_csv_response(filename: str, headers: list[str], rows: list[list[Any]]) -> Response:
    sio = StringIO()
    writer = csv.writer(sio)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    content = sio.getvalue()
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _fmt_money(value: float | None) -> str:
    return f"{float(value or 0):.2f}"


def _fmt_number(value: float | None) -> str:
    if value is None:
        return ""
    number = float(value)
    if abs(number - int(number)) < 1e-9:
        return str(int(number))
    return f"{number:g}"


def _fmt_dt(dt: datetime | None) -> str:
    if dt is None:
        return ""
    return dt.strftime("%Y-%m-%d %H:%M:%S")


REMOVED_BUSINESS_CONFIRM_FOOTER = "Status order anda telah disahkan."


def _removed_business_ensure_confirm_reply(reply: str | None) -> str:
    body = (reply or "").strip()
    if not body:
        return REMOVED_BUSINESS_CONFIRM_FOOTER
    normalized = body.lower()
    if "confirm" in normalized or "disahkan" in normalized or "sahkan" in normalized:
        return body
    return f"{body}\n\n{REMOVED_BUSINESS_CONFIRM_FOOTER}"


def _generate_removed_business_webhook_token() -> str:
    return secrets.token_urlsafe(24)

def _removed_business_cloud_callback_url(token: str | None) -> str | None:
    cleaned = (token or '').strip()
    if not cleaned:
        return None
    return f"{APP_PUBLIC_URL}/removed_business/api/inbox/webhook/{cleaned}"

def _mask_secret(value: str | None, *, keep_start: int = 4, keep_end: int = 4) -> str | None:
    raw = (value or '').strip()
    if not raw:
        return None
    if len(raw) <= keep_start + keep_end:
        return '*' * len(raw)
    return f"{raw[:keep_start]}{'*' * max(4, len(raw) - keep_start - keep_end)}{raw[-keep_end:]}"

def _removed_business_whatsapp_cloud_settings_response(raw_value: str | None) -> schemas.RemovedBusinessWhatsAppCloudSettingsResponse:
    data: dict[str, Any] = {}
    if raw_value:
        try:
            parsed = json.loads(raw_value)
            if isinstance(parsed, dict):
                data = parsed
        except Exception:
            data = {}
    access_token = str(data.get('access_token') or '').strip()
    webhook_token = str(data.get('webhook_token') or '').strip() or _generate_removed_business_webhook_token()
    webhook_url = str(data.get('webhook_url') or '').strip() or '/removed_business/api/inbox/webhook/{token}'
    callback_url = _removed_business_cloud_callback_url(webhook_token)
    return schemas.RemovedBusinessWhatsAppCloudSettingsResponse(
        enabled=bool(data.get('enabled', False)),
        phone_number_id=(str(data.get('phone_number_id') or '').strip() or None),
        business_account_id=(str(data.get('business_account_id') or '').strip() or None),
        has_access_token=bool(access_token),
        access_token_masked=_mask_secret(access_token, keep_start=6, keep_end=4),
        verify_token=(str(data.get('verify_token') or '').strip() or None),
        app_secret=(str(data.get('app_secret') or '').strip() or None),
        webhook_url=webhook_url,
        webhook_token=webhook_token,
        callback_url=callback_url,
    )

def _removed_business_flag_enabled(value):
    if value is None:
        return True
    if isinstance(value, bool):
        return value
    val = str(value).strip().lower()
    if val in {'0', 'false', 'no', 'off'}:
        return False
    return True


async def _removed_business_payment_settings_response_with_delivery(db: AsyncSession, row: models.BusinessPaymentSetting | None, user_id: str) -> schemas.RemovedBusinessPaymentSettingsResponse:
    delivery = await _removed_business_get_delivery_settings(db, user_id)
    access_request = _parse_removed_business_access_request(await _get_removed_business_access_request_setting(db, user_id)) or {}
    profile_request = _removed_business_profile_change_request_response_from_data(_parse_removed_business_access_request(await _get_removed_business_profile_change_request_setting(db, user_id)))
    base_response = {
        "business_type": access_request.get("business_type"),
        "profile_change_request": profile_request if profile_request.status == "pending" else None,
        "store_address": delivery.get("store_address"),
        "store_latitude": delivery.get("store_latitude"),
        "store_longitude": delivery.get("store_longitude"),
        "delivery_rate_per_km": delivery.get("delivery_rate_per_km"),
        "delivery_base_price": delivery.get("delivery_base_price"),
        "delivery_max_distance_km": delivery.get("delivery_max_distance_km"),
        "delivery_charge_mode": delivery.get("delivery_charge_mode") or "rider",
        "shipping_fixed_amount": delivery.get("shipping_fixed_amount"),
        "pickup_enabled": True if row is None else bool(row.pickup_enabled),
        "delivery_enabled": True if row is None else bool(row.delivery_enabled),
    }
    if row is None:
        return schemas.RemovedBusinessPaymentSettingsResponse(**base_response)
    return schemas.RemovedBusinessPaymentSettingsResponse(
        **base_response,
        brand_name=row.brand_name,
        qr_image_url=row.qr_image_url,
        payment_image_url=row.payment_image_url,
        bank_name=row.bank_name,
        account_name=row.account_name,
        account_number=row.account_number,
        stripe_enabled=bool(getattr(row, "stripe_enabled", False)),
        stripe_configured=bool(str(getattr(row, "stripe_secret_key", None) or "").strip()),
        stripe_publishable_key=getattr(row, "stripe_publishable_key", None),
        stripe_webhook_configured=bool(str(getattr(row, "stripe_webhook_secret", None) or "").strip()),
        auto_acknowledge_incoming_order=bool(row.auto_acknowledge_incoming_order),
        auto_acknowledge_payment_receipt=bool(row.auto_acknowledge_payment_receipt),
        auto_reply_qr_on_order=bool(row.auto_reply_qr_on_order),
        auto_reply_qr_when_amount_ready=bool(row.auto_reply_qr_when_amount_ready),
        is_business_open=bool(row.is_business_open),
        capture_all_whatsapp_messages=bool(row.capture_all_whatsapp_messages),
        allow_owner_whatsapp_order_proxy=bool(getattr(row, "allow_owner_whatsapp_order_proxy", False)),
        whatsapp_trigger_prefix=row.whatsapp_trigger_prefix,
        business_closed_reply_template=row.business_closed_reply_template,
        incoming_order_reply_template=row.incoming_order_reply_template,
        payment_review_reply_template=row.payment_review_reply_template,
        qr_caption_template=row.qr_caption_template,
        payment_note_template=row.payment_note_template,
        customer_note_prompt=row.customer_note_prompt,
        customer_note_example=row.customer_note_example,
        customer_note_enabled=bool(getattr(row, "customer_note_enabled", True)),
        catalog_list_enabled=bool(getattr(row, "catalog_list_enabled", True)),
        catalog_image_url=row.catalog_image_url,
        prepared_order_notify_enabled=bool(getattr(row, "prepared_order_notify_enabled", True)),
        updated_at=row.updated_at,
    )


def _removed_business_status_from_payload(amount: float | None, payment_method: str | None) -> str:
    method = (payment_method or "").strip().lower() or None
    if amount is None or amount <= 0:
        return "pending_amount"
    if method == "cod":
        return "cod_pending"
    return "pending_payment"

def _stripe_amount_cents(amount: float | Decimal | None) -> int:
    value = Decimal(str(amount or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int((value * Decimal("100")).to_integral_value(rounding=ROUND_HALF_UP))

async def _removed_business_create_stripe_checkout_session(db: AsyncSession, order: models.BusinessOrder) -> dict[str, Any]:
    settings_result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == order.user_id))
    payment_settings = settings_result.scalar_one_or_none()
    if not payment_settings or not bool(getattr(payment_settings, "stripe_enabled", False)):
        raise HTTPException(status_code=400, detail="Stripe is disabled in payment settings.")
    secret_key = str(getattr(payment_settings, "stripe_secret_key", None) or "").strip()
    if not secret_key:
        raise HTTPException(status_code=400, detail="Stripe secret key is not configured in payment settings.")
    amount_cents = _stripe_amount_cents(order.amount)
    if amount_cents <= 0:
        raise HTTPException(status_code=400, detail="Order amount must be set before Stripe payment.")
    if not getattr(order, "stripe_payment_short_token", None):
        order.stripe_payment_short_token = secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8]
        await db.flush()
    success_url = f"{APP_PUBLIC_URL}/public/removed_business/payment/{order.stripe_payment_short_token}/success"
    cancel_url = f"{APP_PUBLIC_URL}/public/removed_business/payment/{order.stripe_payment_short_token}/cancelled"
    payload = {
        "mode": "payment",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": str(order.id),
        "metadata[order_id]": str(order.id),
        "metadata[user_id]": str(order.user_id),
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "myr",
        "line_items[0][price_data][unit_amount]": str(amount_cents),
        "line_items[0][price_data][product_data][name]": f"Order {order.order_no}",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            "https://api.stripe.com/v1/checkout/sessions",
            data=payload,
            auth=(secret_key, ""),
            headers={"Stripe-Version": "2026-02-25.clover"},
        )
    data = res.json()
    if res.status_code >= 400:
        raise HTTPException(status_code=400, detail=data.get("error", {}).get("message") or "Failed to create Stripe checkout.")
    order.stripe_checkout_session_id = data.get("id")
    order.stripe_payment_url = data.get("url")
    if data.get("url") and not getattr(order, "stripe_payment_short_token", None):
        order.stripe_payment_short_token = secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8]
    await db.flush()
    return data


async def _removed_business_suggest_order_amount(
    db: AsyncSession,
    user_id: str,
    item_name: str,
    product_type: str | None,
    quantity: float | None,
) -> float | None:
    if quantity is None or quantity <= 0:
        return None
    needle = (item_name or "").strip().lower()
    type_needle = (product_type or "").strip().lower()
    if not needle and not type_needle:
        return None

    result = await db.execute(
        select(models.BusinessProduct).where(
            models.BusinessProduct.user_id == user_id,
            models.BusinessProduct.is_active.is_(True),
        )
    )
    rows = list(result.scalars().all())
    for product in rows:
        default_price = float(product.default_price) if product.default_price is not None else 0.0
        if default_price <= 0:
            continue
        aliases = [alias.strip().lower() for alias in _removed_business_parse_aliases(product.keyword_aliases)]
        name_match = (product.product_name or "").strip().lower()
        type_match = (product.product_type or "").strip().lower()
        if needle and (needle == name_match or needle in aliases):
            return round(default_price * quantity, 2)
        if type_needle and type_needle and type_needle == type_match:
            return round(default_price * quantity, 2)
    return None


def _removed_business_automation_flow_response(row: models.BusinessAutomationFlow | None) -> schemas.RemovedBusinessAutomationFlowResponse:
    if row is None:
        return schemas.RemovedBusinessAutomationFlowResponse()
    try:
        payload = json.loads(row.flow_json or "{}")
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    nodes = payload.get("nodes") if isinstance(payload.get("nodes"), list) else []
    edges = payload.get("edges") if isinstance(payload.get("edges"), list) else []
    version = payload.get("version") if isinstance(payload.get("version"), int) else 1
    return schemas.RemovedBusinessAutomationFlowResponse(
        name=row.name or "Automation Flow",
        enabled=bool(row.enabled),
        nodes=nodes,
        edges=edges,
        version=version,
        updated_at=row.updated_at,
    )

@app.get("/removed_business/automation-flow", response_model=schemas.RemovedBusinessAutomationFlowResponse)
async def get_removed_business_automation_flow(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessAutomationFlow).where(models.BusinessAutomationFlow.user_id == current_user.id))
    return _removed_business_automation_flow_response(result.scalar_one_or_none())

@app.put("/removed_business/automation-flow", response_model=schemas.RemovedBusinessAutomationFlowResponse)
async def save_removed_business_automation_flow(
    payload: schemas.RemovedBusinessAutomationFlowSaveRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessAutomationFlow).where(models.BusinessAutomationFlow.user_id == current_user.id))
    row = result.scalar_one_or_none()
    flow_payload = {
        "version": int(payload.version or 1),
        "nodes": payload.nodes if isinstance(payload.nodes, list) else [],
        "edges": payload.edges if isinstance(payload.edges, list) else [],
    }
    if row is None:
        row = models.BusinessAutomationFlow(
            user_id=current_user.id,
            name=(payload.name or "Automation Flow").strip() or "Automation Flow",
            enabled=bool(payload.enabled),
            flow_json=json.dumps(flow_payload, ensure_ascii=False),
        )
        db.add(row)
    else:
        row.name = (payload.name or "Automation Flow").strip() or "Automation Flow"
        row.enabled = bool(payload.enabled)
        row.flow_json = json.dumps(flow_payload, ensure_ascii=False)
        row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return _removed_business_automation_flow_response(row)

@app.post("/removed_business/automation-flow/test")
async def test_removed_business_automation_flow(
    payload: schemas.RemovedBusinessAutomationFlowTestRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    text_value = " ".join(str(payload.text or "").split())
    if not text_value:
        raise HTTPException(status_code=400, detail="Text is required")
    user_lang = (current_user.language or "BM").upper()
    def tr(bm: str, en: str) -> str:
        return bm if user_lang == "BM" else en
    result = await _module_removed_business_try_automation_flow(
        db,
        user_id=current_user.id,
        cleaned_text=text_value,
        customer_name=current_user.name,
        tr=tr,
    )
    return result or {"status": "no_match", "reply": None, "qr_image_url": None, "payment_image_url": None}

@app.get("/removed_business/products", response_model=List[schemas.RemovedBusinessProductResponse])
async def removed_business_products(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessProduct)
        .where(models.BusinessProduct.user_id == current_user.id)
        .order_by(models.BusinessProduct.sort_order.asc(), models.BusinessProduct.product_name.asc(), models.BusinessProduct.id.asc())
    )
    follow_stock_map = await _removed_business_load_follow_stock_map(db, current_user.id)
    delivery_mode_map = await _removed_business_load_product_delivery_mode_map(db, current_user.id)
    shipping_map = await _removed_business_load_product_shipping_map(db, current_user.id)
    return [_removed_business_product_response(row, follow_stock=follow_stock_map.get(int(row.id), False), delivery_mode=delivery_mode_map.get(int(row.id), "all"), delivery_charge_mode=str(shipping_map.get(int(row.id), {}).get("mode", "rider")), shipping_fixed_amount=float(shipping_map.get(int(row.id), {}).get("amount", 0) or 0), shipping_charge_basis=str(shipping_map.get(int(row.id), {}).get("basis", "order"))) for row in result.scalars().all()]


@app.post("/removed_business/products", response_model=schemas.RemovedBusinessProductResponse)
async def create_removed_business_product(
    payload: schemas.RemovedBusinessProductCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    aliases = _removed_business_clean_aliases(payload.keyword_aliases)
    if payload.default_price is not None and float(payload.default_price) < 0:
        raise HTTPException(status_code=400, detail="Default price must be zero or greater.")
    next_sort_order_result = await db.execute(select(func.max(models.BusinessProduct.sort_order)).where(models.BusinessProduct.user_id == current_user.id))
    next_sort_order = int(next_sort_order_result.scalar() or 0) + 1
    row = models.BusinessProduct(
        user_id=current_user.id,
        product_name=payload.product_name.strip(),
        product_type=(payload.product_type or "").strip() or None,
        keyword_aliases=json.dumps(aliases),
        unit_label=(payload.unit_label or "").strip() or None,
        default_price=float(payload.default_price) if payload.default_price is not None else None,
        removed_business_product_image_url=(payload.removed_business_product_image_url or "").strip() or None,
        is_active=bool(payload.is_active),
        sort_order=int(payload.sort_order) if payload.sort_order is not None else next_sort_order,
    )
    db.add(row)
    await db.flush()
    await _removed_business_save_follow_stock_value(db, current_user.id, int(row.id), bool(payload.follow_stock))
    await _removed_business_save_product_shipping_value(db, current_user.id, int(row.id), payload.delivery_charge_mode, payload.shipping_fixed_amount, payload.shipping_charge_basis)
    await _removed_business_write_audit_log(
        db,
        user_id=current_user.id,
        actor_user_id=current_user.id,
        entity_type="product",
        entity_id=row.id,
        action="create",
        before_state=None,
        after_state=_removed_business_product_snapshot(row),
    )
    await db.commit()
    await db.refresh(row)
    return _removed_business_product_response(row, follow_stock=bool(payload.follow_stock), delivery_mode=payload.delivery_mode, delivery_charge_mode=payload.delivery_charge_mode, shipping_fixed_amount=payload.shipping_fixed_amount, shipping_charge_basis=payload.shipping_charge_basis)


@app.patch("/removed_business/products/{product_id}", response_model=schemas.RemovedBusinessProductResponse)
async def update_removed_business_product(
    product_id: int,
    payload: schemas.RemovedBusinessProductUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessProduct).where(models.BusinessProduct.id == product_id, models.BusinessProduct.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Business product not found.")
    before_state = _removed_business_product_snapshot(row)
    if payload.product_name is not None:
        row.product_name = payload.product_name.strip()
    if payload.product_type is not None:
        row.product_type = payload.product_type.strip() or None
    if payload.keyword_aliases is not None:
        row.keyword_aliases = json.dumps(_removed_business_clean_aliases(payload.keyword_aliases))
    if payload.unit_label is not None:
        row.unit_label = payload.unit_label.strip() or None
    if payload.default_price is not None:
        if float(payload.default_price) < 0:
            raise HTTPException(status_code=400, detail="Default price must be zero or greater.")
        row.default_price = float(payload.default_price)
    if payload.is_active is not None:
        row.is_active = bool(payload.is_active)
    if payload.sort_order is not None:
        row.sort_order = int(payload.sort_order)
    if payload.removed_business_product_image_url is not None:
        row.removed_business_product_image_url = payload.removed_business_product_image_url.strip() or None
    if payload.follow_stock is not None:
        await _removed_business_save_follow_stock_value(db, current_user.id, int(row.id), bool(payload.follow_stock))
    if payload.delivery_mode is not None:
        await _removed_business_save_product_delivery_mode_value(db, current_user.id, int(row.id), payload.delivery_mode)
    if payload.delivery_charge_mode is not None or payload.shipping_fixed_amount is not None or payload.shipping_charge_basis is not None:
        current_shipping_map = await _removed_business_load_product_shipping_map(db, current_user.id)
        current_shipping = current_shipping_map.get(int(row.id), {})
        next_mode = payload.delivery_charge_mode or str(current_shipping.get("mode", "rider"))
        next_amount = payload.shipping_fixed_amount if payload.shipping_fixed_amount is not None else float(current_shipping.get("amount", 0) or 0)
        next_basis = payload.shipping_charge_basis or str(current_shipping.get("basis", "order"))
        await _removed_business_save_product_shipping_value(db, current_user.id, int(row.id), next_mode, next_amount, next_basis)
    await db.flush()
    after_state = _removed_business_product_snapshot(row)
    if before_state != after_state:
        await _removed_business_write_audit_log(
            db,
            user_id=current_user.id,
            actor_user_id=current_user.id,
            entity_type="product",
            entity_id=row.id,
            action="update",
            before_state=before_state,
            after_state=after_state,
        )
    await db.commit()
    await db.refresh(row)
    follow_stock_map = await _removed_business_load_follow_stock_map(db, current_user.id)
    delivery_mode_map = await _removed_business_load_product_delivery_mode_map(db, current_user.id)
    shipping_map = await _removed_business_load_product_shipping_map(db, current_user.id)
    shipping = shipping_map.get(int(row.id), {})
    return _removed_business_product_response(row, follow_stock=follow_stock_map.get(int(row.id), False), delivery_mode=delivery_mode_map.get(int(row.id), "all"), delivery_charge_mode=str(shipping.get("mode", "rider")), shipping_fixed_amount=float(shipping.get("amount", 0) or 0), shipping_charge_basis=str(shipping.get("basis", "order")))


@app.delete("/removed_business/products/{product_id}")
async def delete_removed_business_product(
    product_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessProduct).where(models.BusinessProduct.id == product_id, models.BusinessProduct.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Business product not found.")
    before_state = _removed_business_product_snapshot(row)
    await db.delete(row)
    await db.flush()
    await _removed_business_write_audit_log(
        db,
        user_id=current_user.id,
        actor_user_id=current_user.id,
        entity_type="product",
        entity_id=product_id,
        action="delete",
        before_state=before_state,
        after_state=None,
    )
    await db.commit()
    await _removed_business_publish_orders_event(current_user.id, "deleted", int(product_id))
    return {"ok": True}

@app.post("/removed_business/products/{product_id}/upload-image", response_model=schemas.RemovedBusinessProductResponse)
async def upload_removed_business_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessProduct).where(models.BusinessProduct.id == product_id, models.BusinessProduct.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Business product not found.")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="File is empty.")
    if len(payload) > RECEIPT_DIRECT_UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large.")

    try:
        validated_mime, extension = storage_service.validate_receipt_file(file.filename, file.content_type, payload)
    except storage_service.StorageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    object_key = _removed_business_build_receipt_object_key(current_user.id, "product-image", file.filename, extension)
    try:
        await asyncio.to_thread(storage_service.upload_receipt_object, object_key, payload, validated_mime)
    except storage_service.StorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    before_state = _removed_business_product_snapshot(row)
    row.removed_business_product_image_url = _removed_business_storage_direct_url(object_key) or object_key
    await db.flush()
    await _removed_business_write_audit_log(
        db,
        user_id=current_user.id,
        actor_user_id=current_user.id,
        entity_type="product",
        entity_id=row.id,
        action="upload_image",
        before_state=before_state,
        after_state=_removed_business_product_snapshot(row),
    )
    await db.commit()
    await db.refresh(row)
    follow_stock_map = await _removed_business_load_follow_stock_map(db, current_user.id)
    return _removed_business_product_response(row, follow_stock=follow_stock_map.get(int(row.id), False))


# ── Theme Studio API ──

THEME_DEFAULTS = {
    "primary_color": "#058B70", "secondary_color": "#4f46e5",
    "background_color": "#f7f8f4", "text_color": "#102015",
    "font_family": "Inter", "border_radius": 12, "theme_mode": "light",
}

def _theme_response(theme: models.RemovedBusinessTheme) -> dict:
    return {k: v for k, v in theme.__dict__.items() if not k.startswith("_")}

async def _get_or_create_theme(db, user_id: str) -> models.RemovedBusinessTheme:
    result = await db.execute(select(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.user_id == user_id))
    theme = result.scalars().first()
    if not theme:
        theme = models.RemovedBusinessTheme(user_id=user_id, **THEME_DEFAULTS)
        db.add(theme)
        await db.flush()
    return theme


@app.get("/removed_business/theme")
async def removed_business_theme_get(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    theme = await _get_or_create_theme(db, current_user.id)
    return _theme_response(theme)


@app.put("/removed_business/theme")
async def removed_business_theme_put(
    payload: dict,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    theme = await _get_or_create_theme(db, current_user.id)
    allowed = {"theme_name", "primary_color", "secondary_color", "background_color",
               "text_color", "font_family", "border_radius", "theme_mode",
               "logo_url", "shop_name", "cover_image_url", "header_style",
               "button_style", "product_card_style",
                "whatsapp_button_enabled", "whatsapp_number", "order_button_text",
                "order_button_color", "floating_button", "confirmation_dialog",
                "custom_domain"}
    for k, v in payload.items():
        if k in allowed and hasattr(theme, k):
            setattr(theme, k, v)
    await db.commit()
    await db.refresh(theme)
    return _theme_response(theme)


@app.post("/removed_business/theme/upload")
async def removed_business_theme_upload(
    file: UploadFile = File(...),
    asset_type: str = Form("logo"),
    current_user: models.User = Depends(get_removed_business_user),
):
    if asset_type not in ("logo", "cover"):
        raise HTTPException(status_code=400, detail="asset_type must be 'logo' or 'cover'")
    content_type = file.content_type or "image/png"
    ext = content_type.split("/")[-1] if "/" in content_type else "png"
    if ext == "jpeg":
        ext = "jpg"
    payload = await file.read()
    if len(payload) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    object_key = storage_service.build_theme_asset_object_key(current_user.id, asset_type, ext)
    await asyncio.to_thread(storage_service.upload_receipt_object, object_key, payload, content_type)
    return {"url": f"https://r2-data-upload.budget.digitalport.my/{object_key}", "object_key": object_key}


@app.post("/removed_business/theme/upload-presign")
async def removed_business_theme_upload_presign(
    payload: dict,
    current_user: models.User = Depends(get_removed_business_user),
):
    asset_type = payload.get("asset_type", "logo")
    content_type = payload.get("content_type", "image/png")
    if asset_type not in ("logo", "cover"):
        raise HTTPException(status_code=400, detail="asset_type must be 'logo' or 'cover'")
    ext = content_type.split("/")[-1] if "/" in content_type else "png"
    if ext == "jpeg":
        ext = "jpg"
    object_key = storage_service.build_theme_asset_object_key(current_user.id, asset_type, ext)
    upload_url = storage_service.create_presigned_receipt_upload_url(object_key, content_type, expires_in=300)
    return {"upload_url": upload_url, "object_key": object_key}


@app.post("/removed_business/theme/publish")
async def removed_business_theme_publish(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    theme = await _get_or_create_theme(db, current_user.id)
    theme.status = "published"
    if not theme.share_slug:
        shop_slug = re.sub(r"[^a-z0-9]+", "-", (theme.shop_name or "").strip().lower()).strip("-")
        theme.share_slug = shop_slug or uuid4().hex[:12]
    await db.commit()
    await db.refresh(theme)
    return _theme_response(theme)


@app.post("/removed_business/theme/duplicate")
async def removed_business_theme_duplicate(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    theme = await _get_or_create_theme(db, current_user.id)
    dup = models.RemovedBusinessTheme(
        user_id=current_user.id,
        theme_name=f"{theme.theme_name} (Copy)",
        primary_color=theme.primary_color,
        secondary_color=theme.secondary_color,
        background_color=theme.background_color,
        text_color=theme.text_color,
        font_family=theme.font_family,
        border_radius=theme.border_radius,
        theme_mode=theme.theme_mode,
        logo_url=theme.logo_url,
        shop_name=theme.shop_name,
        cover_image_url=theme.cover_image_url,
        header_style=theme.header_style,
        button_style=theme.button_style,
        product_card_style=theme.product_card_style,
        whatsapp_button_enabled=theme.whatsapp_button_enabled,
        whatsapp_number=theme.whatsapp_number,
        order_button_text=theme.order_button_text,
        order_button_color=theme.order_button_color,
        floating_button=theme.floating_button,
        confirmation_dialog=theme.confirmation_dialog,
    )
    # replace old theme with dup
    await db.execute(sa_delete(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.id == theme.id))
    db.add(dup)
    await db.commit()
    await db.refresh(dup)
    return _theme_response(dup)


@app.post("/removed_business/theme/reset")
async def removed_business_theme_reset(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    await db.execute(sa_delete(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.user_id == current_user.id))
    theme = models.RemovedBusinessTheme(user_id=current_user.id, **THEME_DEFAULTS)
    db.add(theme)
    await db.commit()
    await db.refresh(theme)
    return _theme_response(theme)


# ── Public Theme API (no auth) ──

@app.post("/public/theme/{slug}/session")
async def public_theme_session(slug: str, payload: dict, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.share_slug == slug, models.RemovedBusinessTheme.status == "published"))
    theme = result.scalars().first()
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found.")
    phone = "".join(c for c in (payload.get("phone") or "").strip() if c.isdigit())
    if phone.startswith("0") and not phone.startswith("60"):
        phone = "6" + phone
    if not phone or len(phone) < 9:
        raise HTTPException(status_code=400, detail="Valid phone number required.")
    ord_result = await db.execute(
        select(models.BusinessOrder).where(
            models.BusinessOrder.user_id == theme.user_id,
            models.BusinessOrder.customer_phone == phone,
            models.BusinessOrder.status.in_(["pending_payment", "pending_approval", "pending_address", "payment_review"]),
        ).order_by(models.BusinessOrder.created_at.desc())
    )
    pending = ord_result.scalars().first()
    if pending:
        return {
            "has_pending": True,
            "order_no": pending.order_no,
            "total": float(pending.subtotal_amount or 0),
            "status": pending.status,
            "payment_url": getattr(pending, "stripe_payment_url", None) or "",
        }
    return {"has_pending": False, "phone": phone}


@app.get("/public/theme/{slug}")
async def public_theme_get(slug: str, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.share_slug == slug, models.RemovedBusinessTheme.status == "published"))
    theme = result.scalars().first()
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found or not published.")
    data = {k: v for k, v in theme.__dict__.items() if not k.startswith("_") and k != "share_slug"}
    # Include delivery/pickup enabled from payment settings
    setting_result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == theme.user_id))
    payment = setting_result.scalar_one_or_none()
    data["delivery_enabled"] = bool(payment.delivery_enabled) if payment else True
    data["pickup_enabled"] = bool(payment.pickup_enabled) if payment else True
    data["is_business_open"] = bool(payment.is_business_open) if payment else True
    data["business_closed_reply_template"] = payment.business_closed_reply_template if payment else None
    return data


@app.get("/public/theme/{slug}/store-status")
async def public_theme_store_status(slug: str, db: AsyncSession = Depends(database.get_db)):
    theme_result = await db.execute(select(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.share_slug == slug, models.RemovedBusinessTheme.status == "published"))
    theme = theme_result.scalars().first()
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found.")
    setting_result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == theme.user_id))
    payment = setting_result.scalar_one_or_none()
    return {
        "is_business_open": bool(payment.is_business_open) if payment else True,
        "business_closed_reply_template": payment.business_closed_reply_template if payment else None,
    }

@app.get("/public/theme/{slug}/products")
async def public_theme_products(slug: str, db: AsyncSession = Depends(database.get_db)):
    theme_result = await db.execute(select(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.share_slug == slug, models.RemovedBusinessTheme.status == "published"))
    theme = theme_result.scalars().first()
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found.")
    result = await db.execute(
        select(models.BusinessProduct).where(
            models.BusinessProduct.user_id == theme.user_id,
            models.BusinessProduct.is_active.is_(True),
        ).order_by(models.BusinessProduct.sort_order, models.BusinessProduct.id)
    )
    products = result.scalars().all()
    delivery_mode_map = await _removed_business_load_product_delivery_mode_map(db, theme.user_id)
    # Load categories for product grouping
    cat_result = await db.execute(
        select(models.BusinessProductCategory.id, models.BusinessProductCategory.name)
        .where(models.BusinessProductCategory.user_id == theme.user_id, models.BusinessProductCategory.is_active.is_(True))
        .order_by(models.BusinessProductCategory.sort_order)
    )
    cat_map = {row[0]: row[1] for row in cat_result.all()}
    return [{"id": p.id, "code": str(idx + 1).zfill(3), "name": p.product_name, "price": float(p.default_price or 0), "image_url": p.removed_business_product_image_url, "delivery_mode": delivery_mode_map.get(int(p.id), "all"), "category_id": p.category_id, "category_name": cat_map.get(p.category_id) if p.category_id else None} for idx, p in enumerate(products)]


@app.get("/public/theme/{slug}/categories")
async def public_theme_categories(slug: str, db: AsyncSession = Depends(database.get_db)):
    theme_result = await db.execute(select(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.share_slug == slug, models.RemovedBusinessTheme.status == "published"))
    theme = theme_result.scalars().first()
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found.")
    result = await db.execute(
        select(models.BusinessProductCategory)
        .where(models.BusinessProductCategory.user_id == theme.user_id, models.BusinessProductCategory.is_active.is_(True))
        .order_by(models.BusinessProductCategory.sort_order)
    )
    return [{"id": c.id, "name": c.name, "slug": c.slug, "image_url": c.image_url} for c in result.scalars().all()]


@app.post("/public/theme/{slug}/order")
async def public_theme_order(slug: str, payload: dict, db: AsyncSession = Depends(database.get_db)):
    theme_result = await db.execute(select(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.share_slug == slug, models.RemovedBusinessTheme.status == "published"))
    theme = theme_result.scalars().first()
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found.")
    user_id = theme.user_id

    payment_setting_result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == user_id))
    payment_setting = payment_setting_result.scalar_one_or_none()
    if payment_setting is not None and not bool(payment_setting.is_business_open):
        raise HTTPException(status_code=409, detail=(payment_setting.business_closed_reply_template or "Store is temporarily closed for orders right now."))

    order_items = payload.get("items", [])
    customer_name = payload.get("customer_name", "").strip() or "Customer"
    customer_phone = _removed_business_normalize_phone(payload.get("customer_phone", "").strip()) or payload.get("customer_phone", "").strip()
    delivery_address = payload.get("delivery_address", "").strip() or None
    note = payload.get("note", "").strip() or None
    order_mode = payload.get("order_mode", "pickup")

    if not order_items:
        raise HTTPException(status_code=400, detail="No items in order.")

    # Get products
    result = await db.execute(
        select(models.BusinessProduct).where(models.BusinessProduct.user_id == user_id, models.BusinessProduct.is_active.is_(True))
        .order_by(models.BusinessProduct.sort_order, models.BusinessProduct.id)
    )
    products = list(result.scalars().all())

    total = 0.0
    items_list = []
    for item in order_items:
        code = str(item.get("code", "")).strip()
        qty = max(1, int(item.get("qty", 1)))
        product = None
        if code.isdigit():
            idx = int(code) - 1
            if 0 <= idx < len(products):
                product = products[idx]
        name = product.product_name if product else code
        price = float(product.default_price or 0) if product else 0
        amount = price * qty
        total += amount
        items_list.append({"name": name, "code": code, "qty": qty, "price": price, "amount": amount, "product_id": int(product.id) if product else None})

    from uuid import uuid4
    store_prefix = slug[:4].upper()
    order_no = f"ORD-{store_prefix}-{uuid4().hex[:4].upper()}"
    item_name = items_list[0]["name"] if items_list else "Order"
    primary_product_id = items_list[0].get("product_id") if items_list else None

    # Compute shipping charge for delivery orders
    shipping_charge = 0.0
    rider_charge = 0.0
    has_rider_products = False
    rider_distance_km = None
    rider_customer_lat = None
    rider_customer_lon = None
    if order_mode == "delivery":
        shipping_map = await _removed_business_load_product_shipping_map(db, user_id)
        for item in items_list:
            code = item["code"]
            product = None
            if code.isdigit():
                idx = int(code) - 1
                if 0 <= idx < len(products):
                    product = products[idx]
            if not product:
                continue
            setting = shipping_map.get(int(product.id)) or {}
            mode = str(setting.get("mode") or "rider")
            if mode == "shipping":
                amt = max(0.0, float(setting.get("amount") or 0))
                if str(setting.get("basis") or "order") == "item":
                    shipping_charge = max(shipping_charge, amt * int(item["qty"]))
                else:
                    shipping_charge += amt
            elif mode == "rider":
                has_rider_products = True

        # Rider delivery charge from customer lat/lon or base price fallback
        if has_rider_products:
            delivery_settings = await _removed_business_get_delivery_settings(db, user_id)
            base_price = max(0.0, float(delivery_settings.get("delivery_base_price") or 0))
            rider_charge = base_price
            customer_lat = payload.get("latitude")
            customer_lon = payload.get("longitude")
            if customer_lat is not None and customer_lon is not None:
                store_lat = delivery_settings.get("store_latitude")
                store_lon = delivery_settings.get("store_longitude")
                if store_lat is not None and store_lon is not None:
                    import math
                    rlat1, rlon1, rlat2, rlon2 = map(math.radians, [float(store_lat), float(store_lon), float(customer_lat), float(customer_lon)])
                    dlat, dlon = rlat2 - rlat1, rlon2 - rlon1
                    a = math.sin(dlat/2)**2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon/2)**2
                    distance_km = round(6371 * 2 * math.asin(math.sqrt(a)), 2)
                    rate_per_km = max(0.0, float(delivery_settings.get("delivery_rate_per_km") or 0))
                    rider_charge = round(base_price + (distance_km * rate_per_km), 2)
                    rider_distance_km = distance_km
                    rider_customer_lat = float(customer_lat)
                    rider_customer_lon = float(customer_lon)

        shipping_charge = round(shipping_charge, 2)
        rider_charge = round(rider_charge, 2)

    delivery_charge_total = round(shipping_charge + rider_charge, 2)

    order = models.BusinessOrder(
        user_id=user_id, order_no=order_no,
        customer_name=customer_name, customer_phone=customer_phone,
        item_name=item_name, product_id=int(primary_product_id) if primary_product_id is not None else None, quantity=1,
        amount=round(total + delivery_charge_total, 2), subtotal_amount=total,
        delivery_charge=delivery_charge_total if delivery_charge_total > 0 else None,
        payment_method="online_payment", status="pending_payment",
        source="public_cart", note=note,
        delivery_address=delivery_address,
        order_mode=order_mode,
    )
    db.add(order)
    await db.flush()

    # Set rider delivery coordinates on order
    if rider_customer_lat is not None:
        order.delivery_latitude = rider_customer_lat
        order.delivery_longitude = rider_customer_lon
        order.delivery_distance_km = rider_distance_km

    # Create order items
    for it in items_list:
        oi = models.BusinessOrderItem(
            user_id=user_id, order_id=int(order.id),
            item_name=it["name"], product_id=int(it["product_id"]) if it.get("product_id") is not None else None, quantity=it["qty"],
            unit_price=it["price"], line_total=it["amount"],
            sort_order=0,
        )
        db.add(oi)

    # Include delivery charge in total
    total = round(total + delivery_charge_total, 2)

    # Stripe payment
    payment_url = None
    setting_result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == user_id))
    payment_settings = setting_result.scalar_one_or_none()
    if payment_settings and getattr(payment_settings, "stripe_enabled", False):
        stripe_key = str(getattr(payment_settings, "stripe_secret_key", None) or "").strip()
        if stripe_key and total > 0:
            import secrets as _sec
            amount_cents = max(50, int(round(total * 100)))
            short_token = _sec.token_urlsafe(6).replace("-", "").replace("_", "")[:8]
            order.stripe_payment_short_token = short_token
            app_url = os.getenv("APP_PUBLIC_URL", "https://budget.digitalport.my").rstrip("/")
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    res = await client.post(
                        "https://api.stripe.com/v1/checkout/sessions",
                        data={
                            "mode": "payment", "success_url": f"{app_url}/public/removed_business/payment/{short_token}/success",
                            "cancel_url": f"{app_url}/public/removed_business/payment/{short_token}/cancelled",
                            "client_reference_id": str(order.id), "metadata[order_id]": str(order.id),
                            "metadata[user_id]": str(user_id), "line_items[0][quantity]": "1",
                            "line_items[0][price_data][currency]": "myr",
                            "line_items[0][price_data][unit_amount]": str(amount_cents),
                            "line_items[0][price_data][product_data][name]": f"Order {order_no}",
                        },
                        auth=(stripe_key, ""), headers={"Stripe-Version": "2026-02-25.clover"},
                    )
                if res.status_code < 400:
                    data = res.json()
                    order.stripe_payment_url = data.get("url")
                    order.stripe_checkout_session_id = data.get("id")
                    payment_url = data.get("url")
            except Exception:
                pass

    await db.commit()
    await db.refresh(order)

    # Trigger push notification + bell notification for removed_business owner
    try:
        await _removed_business_publish_orders_event(user_id, "created", int(order.id))
    except Exception:
        pass

    try:
        if customer_phone:
            auto_reply = await _removed_business_build_auto_reply(db, user_id, order)
            reply_text = str(auto_reply.get("reply") or "").strip() if isinstance(auto_reply, dict) else ""
            reply_text = re.sub(r"\n*TAIP:\s*\[ \*YA\* atau \*TIDAK\* \].*?(?:ORDER|BATALKAN ORDER)\s*", "", reply_text, flags=re.IGNORECASE | re.DOTALL).strip()
            reply_text = re.sub(r"\n*TYPE:\s*\[ \*YES\* or \*NO\* \].*?(?:CONFIRM ORDER|CANCEL ORDER)\s*", "", reply_text, flags=re.IGNORECASE | re.DOTALL).strip()
            bank_details_reply = str(auto_reply.get("bank_details_reply") or "").strip() if isinstance(auto_reply, dict) else ""
            if bank_details_reply and bank_details_reply not in reply_text:
                reply_text = f"{reply_text}\n\n{bank_details_reply}".strip()
            if payment_url:
                short_url = f"{APP_PUBLIC_URL}/p/{order.stripe_payment_short_token}" if getattr(order, "stripe_payment_short_token", None) else payment_url
                reply_text = f"{reply_text}\n\nCheckout: {short_url}".strip()
            outbound_images = []
            if isinstance(auto_reply, dict):
                outbound_images = [url for url in [auto_reply.get("qr_image_url"), auto_reply.get("payment_image_url"), auto_reply.get("catalog_image_url")] if isinstance(url, str) and url.strip()]
            if reply_text or outbound_images:
                _send_worker_message(user_id, {
                    "to": customer_phone,
                    "text": "" if outbound_images else reply_text,
                    "image_urls": outbound_images,
                    "image_caption": reply_text if outbound_images else None,
                }, timeout_seconds=45.0)
    except Exception as exc:
        print(f"[public-cart] failed to send whatsapp checkout user={user_id} order={order_no}: {exc}")

    whatsapp_msg = f"""*{theme.shop_name or 'Store'}*
Order: #{order_no}

Items:
""" + "\n".join(f"{it['code']} {it['qty']} - {it['name']} @ RM{it['amount']:.2f}" for it in items_list) + f"""

*Customer:* {customer_name}
*Phone:* {customer_phone}
{("Delivery: " + (delivery_address or "")) if delivery_address else ""}{f"\nRider Charge: RM{rider_charge:,.2f}" if rider_charge > 0 else ""}{f"\nShipping Charge: RM{shipping_charge:,.2f}" if shipping_charge > 0 else ""}
*Total: RM{total:,.2f}*
"""

    return {
        "order_no": order_no, "total": total, "status": "pending_payment",
        "payment_url": payment_url,
        "whatsapp_message": whatsapp_msg,
        "whatsapp_number": theme.whatsapp_number,
        "items": items_list,
        "shipping_charge": shipping_charge,
        "rider_charge": rider_charge,
        "subtotal": round(total - delivery_charge_total, 2),
    }


@app.patch("/public/theme/{slug}/order/{order_no}/mark-sent")
async def public_theme_order_mark_sent(slug: str, order_no: str, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(
        select(models.BusinessOrder).where(
            models.BusinessOrder.order_no == order_no,
            models.BusinessOrder.source == "public_cart",
            models.BusinessOrder.status == "pending_cart",
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found or already sent.")
    order.status = "pending_payment"
    await db.commit()
    # Trigger push notification now that customer has sent order
    try:
        await _removed_business_publish_orders_event(order.user_id, "created", int(order.id))
    except Exception:
        pass
    return {"order_no": order_no, "status": "pending_payment"}


_KITCHEN_ACTIVE_STATUSES = ("pending_payment", "payment_review", "cod_pending", "paid", "packing", "ready_pickup", "paid_ready_pickup")
_ORDERTRACK_COLUMN_KEYS = ("pending_payment", "payment_review", "cod_pending", "paid", "packing", "ready_pickup")
_ORDERTRACK_COLUMNS_SETTING_KEY = "removed_business_ordertrack_visible_columns"
_ORDERTRACK_PASSWORD_SETTING_KEY = "removed_business_ordertrack_password_sha256"

_KITCHEN_ADVANCE_MAP: dict[str, str] = {
    "pending_payment": "payment_review",
    "payment_review": "paid",
    "cod_pending": "packing",
    "paid": "packing",
    "packing": "ready_pickup",
    "ready_pickup": "cod_completed",
    "paid_ready_pickup": "cod_completed",
}


def _ordertrack_default_columns() -> dict[str, bool]:
    return {key: True for key in _ORDERTRACK_COLUMN_KEYS}


def _ordertrack_normalize_columns(raw: Any) -> dict[str, bool]:
    defaults = _ordertrack_default_columns()
    if not isinstance(raw, dict):
        return defaults
    next_map = dict(defaults)
    for key in _ORDERTRACK_COLUMN_KEYS:
        if key in raw:
            next_map[key] = bool(raw.get(key))
    # Keep at least one column enabled so the board never goes empty.
    if not any(next_map.values()):
        next_map["packing"] = True
    return next_map


async def _ordertrack_load_columns(db: AsyncSession, user_id: str) -> dict[str, bool]:
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == _ORDERTRACK_COLUMNS_SETTING_KEY,
        )
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return _ordertrack_default_columns()
    try:
        parsed = json.loads(row.value)
    except Exception:
        return _ordertrack_default_columns()
    return _ordertrack_normalize_columns(parsed)


def _ordertrack_password_hash(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


async def _ordertrack_load_password_hash(db: AsyncSession, user_id: str) -> str | None:
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == _ORDERTRACK_PASSWORD_SETTING_KEY,
        )
    )
    row = result.scalar_one_or_none()
    return str(row.value or "").strip() if row and row.value else None


async def _ordertrack_save_password_hash(db: AsyncSession, user_id: str, password_hash: str) -> None:
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == user_id,
            models.UserSetting.key == _ORDERTRACK_PASSWORD_SETTING_KEY,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        db.add(models.UserSetting(user_id=user_id, key=_ORDERTRACK_PASSWORD_SETTING_KEY, value=password_hash))
    else:
        row.value = password_hash
    await db.flush()


async def _ordertrack_require_password(db: AsyncSession, user_id: str, password: str | None) -> None:
    saved_hash = await _ordertrack_load_password_hash(db, user_id)
    if not saved_hash:
        raise HTTPException(status_code=403, detail="Order Track password has not been set.")
    if not password or not hmac.compare_digest(saved_hash, _ordertrack_password_hash(password)):
        raise HTTPException(status_code=401, detail="Invalid Order Track password.")


def _ordertrack_visible_status_list(columns: dict[str, bool]) -> list[str]:
    statuses: list[str] = []
    for key in _ORDERTRACK_COLUMN_KEYS:
        if columns.get(key, True):
            statuses.append(key)
            if key == "ready_pickup":
                statuses.append("paid_ready_pickup")
    return statuses


async def _kitchen_resolve_theme_user_id(db: AsyncSession, slug: str) -> str | None:
    result = await db.execute(
        select(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.share_slug == slug, models.RemovedBusinessTheme.status == "published")
    )
    theme = result.scalars().first()
    return theme.user_id if theme else None


@app.get("/removed_business/ordertrack/settings", response_model=schemas.RemovedBusinessOrderTrackSettingsResponse)
async def removed_business_ordertrack_settings_get(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    columns = await _ordertrack_load_columns(db, current_user.id)
    theme_result = await db.execute(select(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.user_id == current_user.id))
    theme = theme_result.scalar_one_or_none()
    public_slug = None
    if theme and theme.status == "published" and theme.share_slug:
        public_slug = theme.share_slug
    password_hash = await _ordertrack_load_password_hash(db, current_user.id)
    return schemas.RemovedBusinessOrderTrackSettingsResponse(
        columns=schemas.RemovedBusinessOrderTrackColumnSettings(**columns),
        public_slug=public_slug,
        password_set=bool(password_hash),
    )


@app.patch("/removed_business/ordertrack/settings", response_model=schemas.RemovedBusinessOrderTrackSettingsResponse)
async def removed_business_ordertrack_settings_patch(
    payload: schemas.RemovedBusinessOrderTrackSettingsUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    columns = _ordertrack_normalize_columns(payload.columns.model_dump())
    await _save_user_setting_json(db, current_user.id, _ORDERTRACK_COLUMNS_SETTING_KEY, columns)
    password = (payload.password or "").strip() if payload.password is not None else None
    if password:
        await _ordertrack_save_password_hash(db, current_user.id, _ordertrack_password_hash(password))
    await db.commit()
    theme_result = await db.execute(select(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.user_id == current_user.id))
    theme = theme_result.scalar_one_or_none()
    public_slug = None
    if theme and theme.status == "published" and theme.share_slug:
        public_slug = theme.share_slug
    password_hash = await _ordertrack_load_password_hash(db, current_user.id)
    return schemas.RemovedBusinessOrderTrackSettingsResponse(
        columns=schemas.RemovedBusinessOrderTrackColumnSettings(**columns),
        public_slug=public_slug,
        password_set=bool(password_hash),
    )


@app.get("/public/theme/{slug}/ordertrack", response_model=schemas.RemovedBusinessKitchenDisplayResponse)
async def public_theme_ordertrack(slug: str, password: str | None = None, db: AsyncSession = Depends(database.get_db)):
    user_id = await _kitchen_resolve_theme_user_id(db, slug)
    if not user_id:
        raise HTTPException(status_code=404, detail="Store not found.")
    await _ordertrack_require_password(db, user_id, password)
    theme_result = await db.execute(select(models.RemovedBusinessTheme).where(models.RemovedBusinessTheme.user_id == user_id))
    theme = theme_result.scalar_one_or_none()
    shop_name = theme.shop_name if theme else None
    columns = await _ordertrack_load_columns(db, user_id)
    visible_statuses = _ordertrack_visible_status_list(columns)
    if not visible_statuses:
        return schemas.RemovedBusinessKitchenDisplayResponse(shop_name=shop_name, orders=[], visible_columns=[])
    order_result = await db.execute(
        select(models.BusinessOrder).where(
            models.BusinessOrder.user_id == user_id,
            models.BusinessOrder.status.in_(visible_statuses),
        ).order_by(models.BusinessOrder.created_at.asc(), models.BusinessOrder.id.asc())
    )
    rows = list(order_result.scalars().all())
    order_ids = [int(r.id) for r in rows]
    items_map: dict[int, list[models.BusinessOrderItem]] = {}
    if order_ids:
        items_result = await db.execute(
            select(models.BusinessOrderItem).where(
                models.BusinessOrderItem.user_id == user_id,
                models.BusinessOrderItem.order_id.in_(order_ids),
            ).order_by(models.BusinessOrderItem.sort_order.asc(), models.BusinessOrderItem.id.asc())
        )
        for item in items_result.scalars().all():
            items_map.setdefault(int(item.order_id), []).append(item)
    orders = [
        schemas.RemovedBusinessKitchenOrder(
            id=int(row.id),
            order_no=row.order_no,
            customer_name=row.customer_name,
            order_mode=row.order_mode,
            status=row.status,
            payment_method=row.payment_method,
            customer_note=row.customer_note,
            note=row.note,
            amount=float(row.amount) if row.amount is not None else None,
            items=[
                schemas.RemovedBusinessKitchenOrderItem(
                    item_name=it.item_name,
                    quantity=float(it.quantity or 1),
                    note=None,
                )
                for it in items_map.get(int(row.id), [])
            ],
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]
    visible_columns = [key for key in _ORDERTRACK_COLUMN_KEYS if columns.get(key, True)]
    return schemas.RemovedBusinessKitchenDisplayResponse(shop_name=shop_name, orders=orders, visible_columns=visible_columns)


@app.get("/public/theme/{slug}/ordertrack/events")
async def public_theme_ordertrack_events(slug: str, request: Request, password: str | None = None, db: AsyncSession = Depends(database.get_db)):
    user_id = await _kitchen_resolve_theme_user_id(db, slug)
    if not user_id:
        raise HTTPException(status_code=404, detail="Store not found.")
    await _ordertrack_require_password(db, user_id, password)

    async def event_stream():
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=20)
        _REMOVED_BUSINESS_ORDERS_SSE_SUBSCRIBERS.setdefault(user_id, set()).add(queue)
        yield 'event: ready\ndata: {"ok":true}\n\n'
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=20)
                    yield f"event: orders\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield 'event: ping\ndata: {}\n\n'
        finally:
            subscribers = _REMOVED_BUSINESS_ORDERS_SSE_SUBSCRIBERS.get(user_id)
            if subscribers is not None:
                subscribers.discard(queue)
                if not subscribers:
                    _REMOVED_BUSINESS_ORDERS_SSE_SUBSCRIBERS.pop(user_id, None)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.post("/public/theme/{slug}/ordertrack/order/{order_no}/advance", response_model=schemas.RemovedBusinessKitchenOrder)
async def public_theme_ordertrack_advance(slug: str, order_no: str, password: str | None = None, db: AsyncSession = Depends(database.get_db)):
    user_id = await _kitchen_resolve_theme_user_id(db, slug)
    if not user_id:
        raise HTTPException(status_code=404, detail="Store not found.")
    await _ordertrack_require_password(db, user_id, password)
    result = await db.execute(
        select(models.BusinessOrder).where(
            models.BusinessOrder.order_no == order_no,
            models.BusinessOrder.user_id == user_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Order not found.")

    user_result = await db.execute(select(models.User).where(models.User.id == user_id))
    current_user = user_result.scalar_one_or_none()
    if not current_user:
        raise HTTPException(status_code=404, detail="Store user not found.")

    payment_method = (row.payment_method or "").strip().lower()
    is_cod_flow = payment_method == "cod" or row.status in {"cod_pending", "paid_ready_pickup"}
    common_kwargs = dict(
        order_id=int(row.id),
        db=db,
        current_user=current_user,
        order_snapshot=_removed_business_order_snapshot,
        write_audit_log=_removed_business_write_audit_log,
        load_order_items=_removed_business_load_order_items,
        render_order_reply_lines=_removed_business_render_order_reply_lines,
        resolve_outbound_channel=_removed_business_resolve_outbound_channel,
        dispatch_message=_removed_business_dispatch_message,
        order_response_builder=_removed_business_order_response,
    )

    if row.status == "pending_payment":
        result_order = await _module_mark_order_paid(**common_kwargs)
    elif row.status in {"payment_review", "cod_pending", "paid"}:
        result_order = await _module_mark_order_packing(**common_kwargs)
    elif row.status == "packing":
        result_order = await _module_mark_order_ready_pickup(**common_kwargs)
    elif row.status == "ready_pickup" and is_cod_flow:
        result_order = await _module_mark_order_paid(**common_kwargs)
    elif row.status in {"ready_pickup", "paid_ready_pickup"}:
        result_order = await _module_mark_order_cod_completed(**common_kwargs)
    else:
        raise HTTPException(status_code=409, detail=f"Order status '{row.status}' cannot be advanced.")

    await _removed_business_publish_orders_event(user_id, "updated", int(result_order.id))
    items = await _removed_business_load_order_items(db, user_id=user_id, order_id=int(result_order.id))
    return schemas.RemovedBusinessKitchenOrder(
        id=int(result_order.id),
        order_no=result_order.order_no,
        customer_name=result_order.customer_name,
        order_mode=result_order.order_mode,
        status=result_order.status,
        payment_method=result_order.payment_method,
        customer_note=result_order.customer_note,
        note=result_order.note,
        amount=float(result_order.amount) if result_order.amount is not None else None,
        items=[
            schemas.RemovedBusinessKitchenOrderItem(item_name=it.item_name, quantity=float(it.quantity or 1), note=None)
            for it in items
        ],
        created_at=result_order.created_at,
        updated_at=result_order.updated_at,
    )

@app.get("/removed_business/expenses", response_model=List[schemas.RemovedBusinessExpenseResponse])
async def removed_business_expenses(
    month: str | None = None,
    date: str | None = None,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    query = select(models.BusinessExpense).where(models.BusinessExpense.user_id == current_user.id)
    
    try:
        if date:
            target_year, target_month, target_day = map(int, date.split("-"))
            start_date = datetime(target_year, target_month, target_day)
            end_date = start_date + timedelta(days=1)
            query = query.where(models.BusinessExpense.created_at >= start_date, models.BusinessExpense.created_at < end_date)
        elif month:
            target_year, target_month = map(int, month.split("-"))
            start_date = datetime(target_year, target_month, 1)
            next_month = target_month + 1 if target_month < 12 else 1
            next_year = target_year if target_month < 12 else target_year + 1
            end_date = datetime(next_year, next_month, 1)
            query = query.where(models.BusinessExpense.created_at >= start_date, models.BusinessExpense.created_at < end_date)
    except ValueError:
        pass

    query = query.order_by(models.BusinessExpense.created_at.desc(), models.BusinessExpense.id.desc())
    result = await db.execute(query)
    return [_removed_business_expense_response(row) for row in result.scalars().all()]


@app.get("/removed_business/expenses/export.csv")
async def removed_business_expenses_export_csv(
    month: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    query = select(models.BusinessExpense).where(models.BusinessExpense.user_id == current_user.id)
    month_start, month_end = _removed_business_parse_month_key(month)
    if month_start is not None and month_end is not None:
        query = query.where(models.BusinessExpense.created_at >= month_start, models.BusinessExpense.created_at < month_end)
    query = query.order_by(models.BusinessExpense.created_at.desc(), models.BusinessExpense.id.desc())
    result = await db.execute(query)
    rows = [
        [
            int(row.id),
            row.category,
            row.item_name,
            _fmt_money(float(row.amount)),
            row.note or "",
            row.source,
            _fmt_dt(row.created_at),
        ]
        for row in result.scalars().all()
    ]
    suffix = (month or "all").replace("/", "-")
    return _removed_business_csv_response(
        f"removed_business-expenses-{suffix}.csv",
        ["id", "category", "item_name", "amount", "note", "source", "created_at"],
        rows,
    )

@app.post("/removed_business/expenses", response_model=schemas.RemovedBusinessExpenseResponse)
async def create_removed_business_expense(
    payload: schemas.RemovedBusinessExpenseCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    amount = float(payload.amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Expense amount must be greater than zero.")
    row = models.BusinessExpense(
        user_id=current_user.id,
        category=payload.category.strip(),
        item_name=payload.item_name.strip(),
        amount=amount,
        note=(payload.note or "").strip() or None,
        source="manual",
    )
    db.add(row)
    await db.flush()
    await _removed_business_write_audit_log(
        db,
        user_id=current_user.id,
        actor_user_id=current_user.id,
        entity_type="expense",
        entity_id=row.id,
        action="create",
        before_state=None,
        after_state=_removed_business_expense_snapshot(row),
    )
    await db.commit()
    await db.refresh(row)
    return _removed_business_expense_response(row)


@app.patch("/removed_business/expenses/{expense_id}", response_model=schemas.RemovedBusinessExpenseResponse)
async def update_removed_business_expense(
    expense_id: int,
    payload: schemas.RemovedBusinessExpenseUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessExpense).where(models.BusinessExpense.id == expense_id, models.BusinessExpense.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Business expense not found.")
    before_state = _removed_business_expense_snapshot(row)
    if payload.category is not None:
        row.category = payload.category.strip()
    if payload.item_name is not None:
        row.item_name = payload.item_name.strip()
    if payload.amount is not None:
        amount = float(payload.amount)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Expense amount must be greater than zero.")
        row.amount = amount
    if payload.note is not None:
        row.note = payload.note.strip() or None
    await db.flush()
    await _removed_business_write_audit_log(
        db,
        user_id=current_user.id,
        actor_user_id=current_user.id,
        entity_type="expense",
        entity_id=row.id,
        action="update",
        before_state=before_state,
        after_state=_removed_business_expense_snapshot(row),
    )
    await db.commit()
    await db.refresh(row)
    return _removed_business_expense_response(row)


@app.delete("/removed_business/expenses/{expense_id}")
async def delete_removed_business_expense(
    expense_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessExpense).where(models.BusinessExpense.id == expense_id, models.BusinessExpense.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Business expense not found.")
    before_state = _removed_business_expense_snapshot(row)
    await db.delete(row)
    await _removed_business_write_audit_log(
        db,
        user_id=current_user.id,
        actor_user_id=current_user.id,
        entity_type="expense",
        entity_id=row.id,
        action="delete",
        before_state=before_state,
        after_state=None,
    )
    await db.commit()
    await _removed_business_publish_orders_event(current_user.id, "deleted", int(product_id))
    return {"ok": True}


@app.get("/removed_business/owner-draws/summary", response_model=schemas.RemovedBusinessOwnerDrawSummaryResponse)
async def removed_business_owner_draw_summary(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    summary = await _removed_business_owner_draw_summary(db, current_user)
    wallet = await whatsapp_service.ensure_personal_wallet(db, current_user.id)
    return schemas.RemovedBusinessOwnerDrawSummaryResponse(
        sales=float(summary["sales"]),
        costs=float(summary["costs"]),
        gross_profit=float(summary["gross_profit"]),
        total_owner_drawn=float(summary["total_owner_drawn"]),
        safe_profit_available=float(summary["safe_profit_available"]),
        rolling_modal_balance=float(summary["rolling_modal_balance"]),
        auto_record_wallet_id=int(wallet.id) if wallet else None,
    )

@app.get("/removed_business/owner-draws", response_model=List[schemas.RemovedBusinessOwnerDrawResponse])
async def removed_business_owner_draws(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessOwnerDraw)
        .where(models.BusinessOwnerDraw.user_id == current_user.id)
        .order_by(models.BusinessOwnerDraw.created_at.desc(), models.BusinessOwnerDraw.id.desc())
    )
    return [_removed_business_owner_draw_response(row) for row in result.scalars().all()]

@app.post("/removed_business/owner-draws", response_model=schemas.RemovedBusinessOwnerDrawResponse)
async def create_removed_business_owner_draw(
    payload: schemas.RemovedBusinessOwnerDrawCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    amount = round(float(payload.amount or 0), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Owner salary amount must be greater than zero.")

    summary = await _removed_business_owner_draw_summary(db, current_user)
    safe_profit_available = float(summary["safe_profit_available"])
    if safe_profit_available <= 0:
        raise HTTPException(status_code=400, detail="Owner salary is locked because current business profit is zero or negative.")
    if amount > safe_profit_available:
        raise HTTPException(status_code=400, detail="Owner salary amount exceeds safe profit available.")

    wallet = None
    personal_txn = None
    if payload.auto_record_personal:
        if payload.personal_wallet_id is not None:
            wallet_result = await db.execute(
                select(models.Wallet).where(
                    models.Wallet.id == payload.personal_wallet_id,
                    models.Wallet.owner_user_id == current_user.id,
                )
            )
            wallet = wallet_result.scalar_one_or_none()
            if wallet is None:
                raise HTTPException(status_code=404, detail="Personal wallet not found.")
        else:
            wallet = await whatsapp_service.ensure_personal_wallet(db, current_user.id)

        txn_date = current_business_date()
        personal_txn = models.Transaction(
            wallet_id=wallet.id,
            user_id=current_user.id,
            reference_id=models.generate_txn_reference(txn_date),
            type="income",
            txn_date=txn_date,
            vendor_or_source="Owner Salary"[:50],
            amount=amount,
            notes=((payload.note or "").strip() or "Owner salary from business")[:255],
            source_channel="business_owner_draw",
        )
        db.add(personal_txn)
        await db.flush()

    row = models.BusinessOwnerDraw(
        user_id=current_user.id,
        amount=amount,
        note=(payload.note or "").strip() or None,
        auto_record_personal=bool(payload.auto_record_personal),
        personal_wallet_id=int(wallet.id) if wallet is not None else None,
        personal_transaction_id=int(personal_txn.id) if personal_txn is not None else None,
    )
    db.add(row)
    await db.flush()
    await _removed_business_write_audit_log(
        db,
        user_id=current_user.id,
        actor_user_id=current_user.id,
        entity_type="owner_draw",
        entity_id=row.id,
        action="create",
        before_state={"safe_profit_available_before": safe_profit_available},
        after_state=_removed_business_owner_draw_snapshot(row),
    )
    await db.commit()
    await db.refresh(row)
    return _removed_business_owner_draw_response(row)

@app.delete("/removed_business/owner-draws/{draw_id}")
async def delete_removed_business_owner_draw(
    draw_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessOwnerDraw).where(
            models.BusinessOwnerDraw.id == draw_id,
            models.BusinessOwnerDraw.user_id == current_user.id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Owner salary record not found.")

    before_state = _removed_business_owner_draw_snapshot(row)
    linked_txn = None
    if row.personal_transaction_id is not None:
        txn_result = await db.execute(
            select(models.Transaction).where(
                models.Transaction.id == row.personal_transaction_id,
                models.Transaction.user_id == current_user.id,
            )
        )
        linked_txn = txn_result.scalar_one_or_none()
        if linked_txn is not None and (linked_txn.source_channel or "") != "business_owner_draw":
            linked_txn = None

    linked_txn_id = int(linked_txn.id) if linked_txn is not None else None

    row.personal_transaction_id = None
    row.personal_wallet_id = None
    await db.flush()

    await db.delete(row)
    await db.flush()

    if linked_txn_id is not None:
        txn_delete_result = await db.execute(
            select(models.Transaction).where(
                models.Transaction.id == linked_txn_id,
                models.Transaction.user_id == current_user.id,
                models.Transaction.source_channel == "business_owner_draw",
            )
        )
        linked_txn = txn_delete_result.scalar_one_or_none()
        if linked_txn is not None:
            await db.delete(linked_txn)
            await db.flush()
    await _removed_business_write_audit_log(
        db,
        user_id=current_user.id,
        actor_user_id=current_user.id,
        entity_type="owner_draw",
        entity_id=draw_id,
        action="delete",
        before_state=before_state,
        after_state=None,
    )
    await db.commit()
    await _removed_business_publish_orders_event(current_user.id, "deleted", int(product_id))
    return {"ok": True}

@app.get("/removed_business/orders", response_model=List[schemas.RemovedBusinessOrderResponse])
async def removed_business_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    month: str | None = None,
    date: str | None = None,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    query = select(models.BusinessOrder).where(models.BusinessOrder.user_id == current_user.id)
    if status_filter:
        query = query.where(models.BusinessOrder.status == status_filter)

    try:
        if date:
            target_year, target_month, target_day = map(int, date.split("-"))
            start_date = datetime(target_year, target_month, target_day)
            end_date = start_date + timedelta(days=1)
            query = query.where(models.BusinessOrder.created_at >= start_date, models.BusinessOrder.created_at < end_date)
        elif month:
            target_year, target_month = map(int, month.split("-"))
            start_date = datetime(target_year, target_month, 1)
            next_month = target_month + 1 if target_month < 12 else 1
            next_year = target_year if target_month < 12 else target_year + 1
            end_date = datetime(next_year, next_month, 1)
            query = query.where(models.BusinessOrder.created_at >= start_date, models.BusinessOrder.created_at < end_date)
    except ValueError:
        pass

    query = query.order_by(models.BusinessOrder.created_at.desc(), models.BusinessOrder.id.desc())
    result = await db.execute(query)
    rows = list(result.scalars().all())
    order_ids = [int(row.id) for row in rows]
    order_items_map: dict[int, list[models.BusinessOrderItem]] = {}
    if order_ids:
        items_result = await db.execute(
            select(models.BusinessOrderItem)
            .where(
                models.BusinessOrderItem.user_id == current_user.id,
                models.BusinessOrderItem.order_id.in_(order_ids),
            )
            .order_by(models.BusinessOrderItem.order_id.asc(), models.BusinessOrderItem.sort_order.asc(), models.BusinessOrderItem.id.asc())
        )
        for item in items_result.scalars().all():
            order_items_map.setdefault(int(item.order_id), []).append(item)

    # Auto-detect scam for orders in list (by WhatsApp ID / phone)
    unscanned = [r for r in rows if not r.scam_checked_at and r.customer_phone]
    if unscanned:
        fraud_phones = set()
        sr = await db.execute(
            select(models.BusinessOrder.customer_phone).where(
                models.BusinessOrder.user_id == current_user.id,
                models.BusinessOrder.scam_fraud_flag.is_(True),
                models.BusinessOrder.scam_bank_account.isnot(None),
            )
        )
        for p in sr.scalars().all():
            if p:
                digits = re.sub(r"[^0-9]", "", p)
                if digits:
                    fraud_phones.add(digits)

        if fraud_phones:
            for u in unscanned:
                ud = re.sub(r"[^0-9]", "", u.customer_phone or "")
                if ud and any(fp for fp in fraud_phones if fp == ud):
                    # Find the scam record to copy data from
                    sp = await db.execute(
                        select(models.BusinessOrder).where(
                            models.BusinessOrder.user_id == current_user.id,
                            models.BusinessOrder.scam_fraud_flag.is_(True),
                            models.BusinessOrder.scam_bank_account.isnot(None),
                        ).order_by(models.BusinessOrder.scam_checked_at.desc()).limit(1)
                    )
                    src = sp.scalars().first()
                    if src:
                        u.scam_status = src.scam_status
                        u.scam_bank_account = src.scam_bank_account
                        u.scam_holder_name = src.scam_holder_name
                        u.scam_bank_name = src.scam_bank_name
                        u.scam_report_count = src.scam_report_count
                        u.scam_fraud_flag = src.scam_fraud_flag
                        u.scam_checked_at = datetime.utcnow()
                        u.scam_scan_source = "customer_mark_auto"
            await db.commit()

    official_identifiers = await _removed_business_load_official_identifiers_for_app(db, current_user.id)
    return [_removed_business_order_response(row, order_items_map.get(int(row.id), []), official_identifiers=official_identifiers) for row in rows]


COMPLETED_DELIVERY_STATUSES = {"cod_completed", "completed", "delivered"}


async def _removed_business_rider_summary_map(db: AsyncSession, user_id: str, month: str | None = None) -> dict[int, dict[str, float | int]]:
    query = (
        select(
            models.BusinessOrder.delivery_rider_id,
            func.coalesce(func.sum(models.BusinessOrder.delivery_charge), 0),
            func.count(models.BusinessOrder.id),
        )
        .where(
            models.BusinessOrder.user_id == user_id,
            models.BusinessOrder.delivery_rider_id.is_not(None),
            models.BusinessOrder.order_mode == "delivery",
            models.BusinessOrder.status.in_(COMPLETED_DELIVERY_STATUSES),
        )
    )
    if month:
        try:
            target_year, target_month = map(int, month.split("-"))
            start_date = datetime(target_year, target_month, 1)
            next_month = target_month + 1 if target_month < 12 else 1
            next_year = target_year if target_month < 12 else target_year + 1
            end_date = datetime(next_year, next_month, 1)
            query = query.where(models.BusinessOrder.created_at >= start_date, models.BusinessOrder.created_at < end_date)
        except ValueError:
            pass
    result = await db.execute(query.group_by(models.BusinessOrder.delivery_rider_id))
    return {
        int(rider_id): {
            "total_income": float(total_income or 0),
            "total_completed_order": int(total_completed or 0),
        }
        for rider_id, total_income, total_completed in result.all()
        if rider_id is not None
    }


def _removed_business_rider_response(row: models.BusinessRider, summary: dict[str, float | int] | None = None) -> schemas.RemovedBusinessRiderResponse:
    summary = summary or {}
    return schemas.RemovedBusinessRiderResponse(
        id=int(row.id),
        name=row.name,
        phone=row.phone,
        vehicle_no=row.vehicle_no,
        avatar_url=row.avatar_url,
        total_income=float(summary.get("total_income") or 0),
        total_completed_order=int(summary.get("total_completed_order") or 0),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@app.get("/removed_business/riders", response_model=List[schemas.RemovedBusinessRiderResponse])
async def list_removed_business_riders(
    q: str | None = Query(default=None),
    month: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    query = select(models.BusinessRider).where(models.BusinessRider.user_id == current_user.id)
    keyword = (q or "").strip().lower()
    if keyword:
        like = f"%{keyword}%"
        query = query.where(
            func.lower(func.concat(models.BusinessRider.name, " ", func.coalesce(models.BusinessRider.phone, ""), " ", func.coalesce(models.BusinessRider.vehicle_no, ""))).like(like)
        )
    result = await db.execute(query.order_by(models.BusinessRider.created_at.desc(), models.BusinessRider.id.desc()))
    rows = list(result.scalars().all())
    summary_map = await _removed_business_rider_summary_map(db, current_user.id, month)
    return [_removed_business_rider_response(row, summary_map.get(int(row.id))) for row in rows]


@app.post("/removed_business/riders", response_model=schemas.RemovedBusinessRiderResponse)
async def create_removed_business_rider(
    payload: schemas.RemovedBusinessRiderCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nama rider wajib diisi.")
    row = models.BusinessRider(user_id=current_user.id, name=name, phone=(payload.phone or "").strip() or None, vehicle_no=(payload.vehicle_no or "").strip().upper() or None, avatar_url=(payload.avatar_url or "").strip() or None)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _removed_business_rider_response(row)


@app.get("/removed_business/riders/{rider_id}", response_model=schemas.RemovedBusinessRiderDetailResponse)
async def get_removed_business_rider(
    rider_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessRider).where(models.BusinessRider.id == rider_id, models.BusinessRider.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Rider not found.")
    summary_map = await _removed_business_rider_summary_map(db, current_user.id)
    orders_result = await db.execute(
        select(models.BusinessOrder)
        .where(models.BusinessOrder.user_id == current_user.id, models.BusinessOrder.delivery_rider_id == rider_id, models.BusinessOrder.order_mode == "delivery", models.BusinessOrder.status.in_(COMPLETED_DELIVERY_STATUSES))
        .order_by(models.BusinessOrder.updated_at.desc(), models.BusinessOrder.id.desc())
    )
    base = _removed_business_rider_response(row, summary_map.get(int(row.id)))
    return schemas.RemovedBusinessRiderDetailResponse(
        **base.model_dump(),
        order_history=[
            schemas.RemovedBusinessRiderOrderHistoryResponse(id=int(order.id), order_no=order.order_no, customer_name=order.customer_name, order_amount=float(order.subtotal_amount if order.subtotal_amount is not None else (order.amount or 0)), delivery_fee=float(order.delivery_charge or 0), status=order.status, completed_at=order.updated_at)
            for order in orders_result.scalars().all()
        ],
    )


@app.patch("/removed_business/riders/{rider_id}", response_model=schemas.RemovedBusinessRiderResponse)
async def update_removed_business_rider(
    rider_id: int,
    payload: schemas.RemovedBusinessRiderUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessRider).where(models.BusinessRider.id == rider_id, models.BusinessRider.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Rider not found.")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Nama rider wajib diisi.")
        row.name = name
    if payload.phone is not None:
        row.phone = payload.phone.strip() or None
    if payload.vehicle_no is not None:
        row.vehicle_no = payload.vehicle_no.strip().upper() or None
    if payload.avatar_url is not None:
        row.avatar_url = payload.avatar_url.strip() or None
    await db.commit()
    await db.refresh(row)
    summary_map = await _removed_business_rider_summary_map(db, current_user.id)
    return _removed_business_rider_response(row, summary_map.get(int(row.id)))


@app.delete("/removed_business/riders/{rider_id}")
async def delete_removed_business_rider(
    rider_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessRider).where(models.BusinessRider.id == rider_id, models.BusinessRider.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Rider not found.")
    await db.execute(update(models.BusinessOrder).where(models.BusinessOrder.user_id == current_user.id, models.BusinessOrder.delivery_rider_id == rider_id).values(delivery_rider_id=None))
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@app.post("/removed_business/riders/{rider_id}/avatar", response_model=schemas.RemovedBusinessRiderResponse)
async def upload_removed_business_rider_avatar(
    rider_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessRider).where(models.BusinessRider.id == rider_id, models.BusinessRider.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Rider not found.")
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="File is empty.")
    if len(payload) > RECEIPT_DIRECT_UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large.")
    try:
        validated_mime, extension = storage_service.validate_receipt_file(file.filename, file.content_type, payload)
    except storage_service.StorageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    object_key = _removed_business_build_receipt_object_key(current_user.id, "rider-avatar", file.filename, extension)
    try:
        await asyncio.to_thread(storage_service.upload_receipt_object, object_key, payload, validated_mime)
    except storage_service.StorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    row.avatar_url = _removed_business_storage_direct_url(object_key) or object_key
    await db.commit()
    await db.refresh(row)
    summary_map = await _removed_business_rider_summary_map(db, current_user.id)
    return _removed_business_rider_response(row, summary_map.get(int(row.id)))


@app.get("/removed_business/orders/{order_id}", response_model=schemas.RemovedBusinessOrderResponse)
async def removed_business_order_detail(
    order_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessOrder).where(models.BusinessOrder.id == order_id, models.BusinessOrder.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Business order not found.")

    # Auto-detect scam: kalau customer (WhatsApp ID) ini pernah ditanda scam sebelum ini
    if not row.scam_checked_at:
        prev_scam = None

        # Try by customer_phone only (WhatsApp ID / normalized phone)
        raw_phone = (row.customer_phone or "").strip()
        phone_digits = re.sub(r"[^0-9]", "", raw_phone)
        if phone_digits:
            all_prev = await db.execute(
                select(models.BusinessOrder).where(
                    models.BusinessOrder.user_id == current_user.id,
                    models.BusinessOrder.customer_phone.isnot(None),
                    models.BusinessOrder.id != order_id,
                    models.BusinessOrder.scam_fraud_flag.is_(True),
                    models.BusinessOrder.scam_bank_account.isnot(None),
                ).order_by(models.BusinessOrder.scam_checked_at.desc())
            )
            for o in all_prev.scalars().all():
                if o.customer_phone and re.sub(r"[^0-9]", "", o.customer_phone) == phone_digits:
                    prev_scam = o
                    break

        if prev_scam:
            row.scam_status = prev_scam.scam_status
            row.scam_bank_account = prev_scam.scam_bank_account
            row.scam_holder_name = prev_scam.scam_holder_name
            row.scam_bank_name = prev_scam.scam_bank_name
            row.scam_report_count = prev_scam.scam_report_count
            row.scam_fraud_flag = prev_scam.scam_fraud_flag
            row.scam_checked_at = datetime.utcnow()
            row.scam_scan_source = "customer_mark_auto"
            await db.commit()
            await db.refresh(row)

    order_items = await _removed_business_load_order_items(db, user_id=current_user.id, order_id=int(row.id))
    order_item_image_map = await _removed_business_load_order_item_image_map(db, user_id=current_user.id, order_id=int(row.id))
    rider = None
    if row.delivery_rider_id is not None:
        rider_result = await db.execute(
            select(models.BusinessRider).where(
                models.BusinessRider.id == int(row.delivery_rider_id),
                models.BusinessRider.user_id == current_user.id,
            )
        )
        rider = rider_result.scalars().first()
    official_identifiers = await _removed_business_load_official_identifiers_for_app(db, current_user.id)
    return _removed_business_order_response(row, order_items, rider, official_identifiers, order_item_image_map)


@app.get("/removed_business/orders/export.csv")
async def removed_business_orders_export_csv(
    status_filter: str | None = Query(default=None, alias="status"),
    month: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    query = select(models.BusinessOrder).where(models.BusinessOrder.user_id == current_user.id)
    if status_filter:
        query = query.where(models.BusinessOrder.status == status_filter)
    month_start, month_end = _removed_business_parse_month_key(month)
    if month_start is not None and month_end is not None:
        query = query.where(models.BusinessOrder.created_at >= month_start, models.BusinessOrder.created_at < month_end)
    query = query.order_by(models.BusinessOrder.created_at.desc(), models.BusinessOrder.id.desc())
    result = await db.execute(query)
    rows = [
        [
            int(row.id),
            row.order_no,
            row.customer_name or "",
            _removed_business_display_customer_phone(row.customer_phone) or "",
            row.item_name,
            row.product_type or "",
            _fmt_number(float(row.quantity) if row.quantity is not None else None),
            _fmt_money(float(row.amount) if row.amount is not None else None),
            row.payment_method or "",
            row.status,
            row.source,
            row.receipt_url or "",
            _fmt_dt(row.created_at),
        ]
        for row in result.scalars().all()
    ]
    status_slug = (status_filter or "all").replace("/", "-")
    month_slug = (month or "all").replace("/", "-")
    return _removed_business_csv_response(
        f"removed_business-orders-{status_slug}-{month_slug}.csv",
        ["id", "order_no", "customer_name", "customer_phone", "item_name", "product_type", "quantity", "amount", "payment_method", "status", "source", "receipt_url", "created_at"],
        rows,
    )

@app.post("/removed_business/orders", response_model=schemas.RemovedBusinessOrderResponse)
async def create_removed_business_order(
    payload: schemas.RemovedBusinessOrderCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await _module_create_removed_business_order_route(
        payload=payload,
        db=db,
        current_user=current_user,
        find_product_by_id=_removed_business_find_product_by_id,
        suggest_order_amount=_removed_business_suggest_order_amount,
        status_from_payload=_removed_business_status_from_payload,
        normalize_phone=_removed_business_normalize_phone,
        decimal_2=_removed_business_decimal_2,
        write_audit_log=_removed_business_write_audit_log,
        order_snapshot=_removed_business_order_snapshot,
        load_order_items=_removed_business_load_order_items,
        order_response_builder=_removed_business_order_response,
    )
    await _removed_business_publish_orders_event(current_user.id, "created", int(result.id))
    return result

@app.patch("/removed_business/orders/{order_id}", response_model=schemas.RemovedBusinessOrderResponse)
async def update_removed_business_order(
    order_id: int,
    payload: schemas.RemovedBusinessOrderUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await _module_update_removed_business_order_route(
        order_id=order_id,
        payload=payload,
        db=db,
        current_user=current_user,
        order_snapshot=_removed_business_order_snapshot,
        find_product_by_id=_removed_business_find_product_by_id,
        normalize_phone=_removed_business_normalize_phone,
        suggest_order_amount=_removed_business_suggest_order_amount,
        status_from_payload=_removed_business_status_from_payload,
        load_order_items=_removed_business_load_order_items,
        decimal_2=_removed_business_decimal_2,
        write_audit_log=_removed_business_write_audit_log,
        order_response_builder=_removed_business_order_response,
    )
    if payload.delivery_charge is not None:
        row_result = await db.execute(
            select(models.BusinessOrder).where(
                models.BusinessOrder.id == int(result.id),
                models.BusinessOrder.user_id == current_user.id,
            )
        )
        row = row_result.scalars().first()
        if row is not None:
            row.delivery_charge = float(payload.delivery_charge)
            row.subtotal_amount = max(0.0, float(row.amount or 0) - max(0.0, float(payload.delivery_charge or 0))) if row.amount is not None else None
            await db.commit()
            await db.refresh(row)
            order_items = await _removed_business_load_order_items(db, user_id=current_user.id, order_id=int(row.id))
            result = _removed_business_order_response(row, order_items)
    await _removed_business_publish_orders_event(current_user.id, "updated", int(result.id))
    return result

@app.get("/removed_business/orders/{order_id}/items", response_model=List[schemas.RemovedBusinessOrderItemResponse])
async def removed_business_order_items(
    order_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessOrder).where(
            models.BusinessOrder.id == order_id,
            models.BusinessOrder.user_id == current_user.id,
        )
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Business order not found.")
    items = await _removed_business_load_order_items(db, user_id=current_user.id, order_id=int(order.id))
    return [_removed_business_order_item_response(item) for item in items]


@app.post("/removed_business/orders/{order_id}/items", response_model=schemas.RemovedBusinessOrderItemResponse)
async def add_removed_business_order_item(
    order_id: int,
    payload: schemas.RemovedBusinessOrderItemCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await _module_add_removed_business_order_item_route(
        order_id=order_id,
        payload=payload,
        db=db,
        current_user=current_user,
        find_product_by_id=_removed_business_find_product_by_id,
        compute_line_total=_removed_business_compute_line_total,
        sync_order_summary_from_items=_removed_business_sync_order_summary_from_items,
        status_from_payload=_removed_business_status_from_payload,
        write_audit_log=_removed_business_write_audit_log,
        order_item_snapshot=_removed_business_order_item_snapshot,
        order_item_response_builder=_removed_business_order_item_response,
    )
    await _removed_business_publish_orders_event(current_user.id, "updated", int(order_id))
    return result

@app.patch("/removed_business/orders/{order_id}/items/{item_id}", response_model=schemas.RemovedBusinessOrderItemResponse)
async def update_removed_business_order_item(
    order_id: int,
    item_id: int,
    payload: schemas.RemovedBusinessOrderItemUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await _module_update_removed_business_order_item_route(
        order_id=order_id,
        item_id=item_id,
        payload=payload,
        db=db,
        current_user=current_user,
        order_item_snapshot=_removed_business_order_item_snapshot,
        find_product_by_id=_removed_business_find_product_by_id,
        compute_line_total=_removed_business_compute_line_total,
        sync_order_summary_from_items=_removed_business_sync_order_summary_from_items,
        status_from_payload=_removed_business_status_from_payload,
        write_audit_log=_removed_business_write_audit_log,
        order_item_response_builder=_removed_business_order_item_response,
    )
    await _removed_business_publish_orders_event(current_user.id, "updated", int(order_id))
    return result

@app.delete("/removed_business/orders/{order_id}/items/{item_id}")
async def delete_removed_business_order_item(
    order_id: int,
    item_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await _module_delete_removed_business_order_item_route(
        order_id=order_id,
        item_id=item_id,
        db=db,
        current_user=current_user,
        order_item_snapshot=_removed_business_order_item_snapshot,
        sync_order_summary_from_items=_removed_business_sync_order_summary_from_items,
        load_order_items=_removed_business_load_order_items,
        status_from_payload=_removed_business_status_from_payload,
        write_audit_log=_removed_business_write_audit_log,
    )
    await _removed_business_publish_orders_event(current_user.id, "updated", int(order_id))
    return result

@app.post("/removed_business/orders/{order_id}/confirm-amount", response_model=schemas.RemovedBusinessOrderResponse)
async def confirm_removed_business_order_amount(
    order_id: int,
    payload: schemas.RemovedBusinessOrderAmountConfirm,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await _module_confirm_removed_business_order_amount_route(
        order_id=order_id,
        payload=payload,
        db=db,
        current_user=current_user,
        order_snapshot=_removed_business_order_snapshot,
        status_from_payload=_removed_business_status_from_payload,
        write_audit_log=_removed_business_write_audit_log,
        order_response_builder=_removed_business_order_response,
    )
    try:
        order_result = await db.execute(select(models.BusinessOrder).where(models.BusinessOrder.id == int(result.id), models.BusinessOrder.user_id == current_user.id))
        row = order_result.scalar_one_or_none()
        if row and row.status in {"pending_payment", "payment_review", "pending_approval", "pending_address"} and str(row.payment_method or "").lower() != "cod":
            settings_result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == current_user.id))
            payment_settings = settings_result.scalar_one_or_none()
            if payment_settings and bool(getattr(payment_settings, "stripe_enabled", False)):
                recipient = (row.customer_phone or "").strip()
                if recipient:
                    session = await _removed_business_create_stripe_checkout_session(db, row)
                    checkout_url = str(session.get("url") or "").strip()
                    if checkout_url:
                        short_url = f"{APP_PUBLIC_URL}/p/{row.stripe_payment_short_token}" if getattr(row, "stripe_payment_short_token", None) else checkout_url
                        message = f"Payment for order {row.order_no}:\n{short_url}"
                        ok, error = await _removed_business_dispatch_message(user_id=current_user.id, order=row, message=message, image_urls=[], channel=_removed_business_resolve_outbound_channel(row), recipient=recipient)
                        if not ok:
                            raise HTTPException(status_code=400, detail=(error or "Failed to send Stripe payment link.")[:500])
                        await db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Order amount saved, but Stripe link failed: {exc}")
    await _removed_business_publish_orders_event(current_user.id, "created", int(result.id))
    return result

@app.post("/removed_business/orders/{order_id}/mark-paid", response_model=schemas.RemovedBusinessOrderResponse)
async def mark_removed_business_order_paid(
    order_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await _module_mark_order_paid(
        order_id=order_id,
        db=db,
        current_user=current_user,
        order_snapshot=_removed_business_order_snapshot,
        write_audit_log=_removed_business_write_audit_log,
        load_order_items=_removed_business_load_order_items,
        render_order_reply_lines=_removed_business_render_order_reply_lines,
        resolve_outbound_channel=_removed_business_resolve_outbound_channel,
        dispatch_message=_removed_business_dispatch_message,
        order_response_builder=_removed_business_order_response,
    )
    await _removed_business_publish_orders_event(current_user.id, "created", int(result.id))
    return result

@app.post("/removed_business/orders/{order_id}/mark-packing", response_model=schemas.RemovedBusinessOrderResponse)
async def mark_removed_business_order_packing(
    order_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await _module_mark_order_packing(
        order_id=order_id,
        db=db,
        current_user=current_user,
        order_snapshot=_removed_business_order_snapshot,
        write_audit_log=_removed_business_write_audit_log,
        load_order_items=_removed_business_load_order_items,
        render_order_reply_lines=_removed_business_render_order_reply_lines,
        resolve_outbound_channel=_removed_business_resolve_outbound_channel,
        dispatch_message=_removed_business_dispatch_message,
        order_response_builder=_removed_business_order_response,
    )
    await _removed_business_publish_orders_event(current_user.id, "updated", int(result.id))
    return result

@app.post("/removed_business/orders/{order_id}/ready-pickup", response_model=schemas.RemovedBusinessOrderResponse)
async def mark_removed_business_order_ready_pickup(
    order_id: int,
    payload: schemas.RemovedBusinessOrderReadyPayload | None = Body(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    rider_name = payload.rider_name if payload else None
    rider_id = payload.rider_id if payload else None
    rider = None
    if rider_id is not None:
        rider_result = await db.execute(
            select(models.BusinessRider).where(
                models.BusinessRider.id == int(rider_id),
                models.BusinessRider.user_id == current_user.id,
            )
        )
        rider = rider_result.scalars().first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found.")
        rider_name = rider.name
    result = await _module_mark_order_ready_pickup(
        order_id=order_id,
        db=db,
        current_user=current_user,
        order_snapshot=_removed_business_order_snapshot,
        write_audit_log=_removed_business_write_audit_log,
        load_order_items=_removed_business_load_order_items,
        render_order_reply_lines=_removed_business_render_order_reply_lines,
        resolve_outbound_channel=_removed_business_resolve_outbound_channel,
        dispatch_message=_removed_business_dispatch_message,
        order_response_builder=_removed_business_order_response,
        rider_name=rider_name,
        rider_id=rider_id,
    )
    if result.order_mode == "delivery" and rider is not None:
        order_result = await db.execute(
            select(models.BusinessOrder).where(
                models.BusinessOrder.id == int(result.id),
                models.BusinessOrder.user_id == current_user.id,
            )
        )
        order_row = order_result.scalar_one_or_none()
        if order_row:
            if not order_row.delivery_public_token:
                order_row.delivery_public_token = secrets.token_urlsafe(32)
            if not order_row.delivery_public_status:
                order_row.delivery_public_status = "assigned"
            order_row.delivery_public_updated_at = datetime.utcnow()
            await db.commit()
            await db.refresh(order_row)
            delivery_link = f"{APP_PUBLIC_URL}/public/removed_business/delivery/{order_row.delivery_public_token}"
            rider_phone = getattr(rider, "phone", None)
            if rider_phone:
                if (current_user.language or "BM").strip().upper() == "EN":
                    message = f"Update delivery here:\n{delivery_link}"
                else:
                    message = f"Update delivery dekat link ini:\n{delivery_link}"
                rider_channel = "whatsapp_cloud" if (order_row.source or "").strip().lower() == "whatsapp_cloud" else "whatsapp"
                await _removed_business_dispatch_message(
                    user_id=current_user.id,
                    order=order_row,
                    message=message,
                    image_urls=[],
                    channel=rider_channel,
                    recipient=str(rider_phone),
                )
            items = await _removed_business_load_order_items(db, user_id=current_user.id, order_id=int(order_row.id))
            result = _removed_business_order_response(order_row, items, rider)
    await _removed_business_publish_orders_event(current_user.id, "updated", int(result.id))
    return result


@app.post("/removed_business/orders/{order_id}/delivery-public-link", response_model=schemas.RemovedBusinessOrderResponse)
async def create_removed_business_order_delivery_public_link(
    order_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessOrder).where(
            models.BusinessOrder.id == order_id,
            models.BusinessOrder.user_id == current_user.id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Business order not found.")
    if row.order_mode != "delivery":
        raise HTTPException(status_code=400, detail="Public rider link is only for delivery orders.")
    if not row.delivery_public_token:
        row.delivery_public_token = secrets.token_urlsafe(32)
    if not row.delivery_public_status:
        row.delivery_public_status = "assigned"
    row.delivery_public_updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    items = await _removed_business_load_order_items(db, user_id=current_user.id, order_id=int(row.id))
    rider = None
    if row.delivery_rider_id is not None:
        rider_result = await db.execute(
            select(models.BusinessRider).where(
                models.BusinessRider.id == int(row.delivery_rider_id),
                models.BusinessRider.user_id == current_user.id,
            )
        )
        rider = rider_result.scalar_one_or_none()
    return _removed_business_order_response(row, items, rider)

@app.post("/removed_business/orders/{order_id}/stripe-checkout", response_model=schemas.RemovedBusinessStripeCheckoutResponse)
async def create_removed_business_order_stripe_checkout(
    order_id: int,
    dispatch: bool = Query(False),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessOrder).where(models.BusinessOrder.id == order_id, models.BusinessOrder.user_id == current_user.id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Business order not found.")
    if row.status in {"paid", "cod_completed", "cancelled"}:
        raise HTTPException(status_code=400, detail="Order is already closed.")
    session = await _removed_business_create_stripe_checkout_session(db, row)
    checkout_url = str(session.get("url") or "").strip()
    if not checkout_url:
        raise HTTPException(status_code=400, detail="Stripe checkout URL is missing.")
    short_url = f"{APP_PUBLIC_URL}/p/{row.stripe_payment_short_token}" if getattr(row, "stripe_payment_short_token", None) else checkout_url
    message = f"Payment for order {row.order_no}:\n{short_url}"
    if dispatch:
        recipient = (row.customer_phone or "").strip()
        if not recipient:
            raise HTTPException(status_code=400, detail="Customer phone is missing.")
        ok, error = await _removed_business_dispatch_message(user_id=current_user.id, order=row, message=message, image_urls=[], channel=_removed_business_resolve_outbound_channel(row), recipient=recipient)
        if not ok:
            raise HTTPException(status_code=400, detail=(error or "Failed to send Stripe payment link.")[:500])
    await db.commit()
    await _removed_business_publish_orders_event(current_user.id, "updated", int(row.id))
    return schemas.RemovedBusinessStripeCheckoutResponse(ok=True, checkout_url=checkout_url, short_url=short_url, session_id=session.get("id"), message=message)

@app.get("/p/{token}")
async def redirect_stripe_short_payment(token: str, db: AsyncSession = Depends(database.get_db)):
    clean = (token or "").strip()
    if not clean:
        raise HTTPException(status_code=404, detail="Payment link not found.")
    result = await db.execute(select(models.BusinessOrder).where(models.BusinessOrder.stripe_payment_short_token == clean))
    row = result.scalar_one_or_none()
    if not row or not row.stripe_payment_url:
        raise HTTPException(status_code=404, detail="Payment link not found.")
    return RedirectResponse(url=row.stripe_payment_url, status_code=302)

@app.get("/public/removed_business/payment/{token}/{state}")
async def public_removed_business_payment_result(token: str, state: str, db: AsyncSession = Depends(database.get_db)):
    clean = (token or "").strip()
    result = await db.execute(select(models.BusinessOrder).where(models.BusinessOrder.stripe_payment_short_token == clean))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Payment link not found.")
    paid = state == "success"
    title = "Payment received" if paid else "Payment cancelled"
    body = "Thank you. Your payment is being verified." if paid else "You can reopen the payment link to try again."
    return HTMLResponse(f"""
<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>{title}</title></head>
<body style='margin:0;font-family:system-ui;background:#f8fafc;color:#0f172a;display:grid;min-height:100vh;place-items:center;padding:24px'>
<main style='max-width:420px;width:100%;background:white;border:1px solid #e2e8f0;border-radius:28px;padding:28px;box-shadow:0 20px 50px rgba(15,23,42,.08);text-align:center'>
<div style='font-size:44px'>{'✅' if paid else '↩️'}</div><h1 style='margin:12px 0 8px;font-size:24px'>{title}</h1>
<p style='margin:0 0 18px;color:#64748b;font-weight:700'>{body}</p>
<p style='margin:0;font-size:13px;color:#94a3b8;font-weight:800'>Order {row.order_no}</p>
</main></body></html>""")


@app.get("/public/removed_business/delivery/{token}", response_model=schemas.RemovedBusinessPublicDeliveryResponse)
async def get_public_removed_business_delivery(
    token: str,
    db: AsyncSession = Depends(database.get_db),
):
    result = await db.execute(
        select(models.BusinessOrder).where(models.BusinessOrder.delivery_public_token == token)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Delivery link not found.")
    return await _removed_business_public_delivery_response(db, row)


@app.post("/public/removed_business/delivery/{token}", response_model=schemas.RemovedBusinessPublicDeliveryResponse)
async def update_public_removed_business_delivery(
    token: str,
    payload: schemas.RemovedBusinessPublicDeliveryUpdate,
    db: AsyncSession = Depends(database.get_db),
):
    result = await db.execute(
        select(models.BusinessOrder).where(models.BusinessOrder.delivery_public_token == token)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Delivery link not found.")
    row.delivery_public_status = payload.status
    row.delivery_public_note = (payload.note or "").strip() or None
    row.delivery_public_updated_at = datetime.utcnow()
    if payload.status == "delivered" and row.status not in {"cod_completed", "cancelled"}:
        row.status = "cod_completed"
    await db.commit()
    await db.refresh(row)
    if payload.status == "delivered":
        try:
            user_result = await db.execute(select(models.User).where(models.User.id == row.user_id))
            order_user = user_result.scalar_one_or_none()
            if order_user:
                order_items = await _removed_business_load_order_items(db, user_id=row.user_id, order_id=int(row.id))
                order_lines = _removed_business_render_order_reply_lines(row, order_items)
                lang = (order_user.language or "BM").strip().upper()
                step_header = "[Step 3.5 — COMPLETED]"
                delivered_msg = (
                    f'{step_header}\nOrder {row.order_no} telah delivered. Terima kasih.'
                    if lang != "EN"
                    else f'{step_header}\nOrder {row.order_no} has been delivered. Thank you.'
                )
                if order_lines:
                    delivered_msg = f"{delivered_msg}\n\nOrder:\n{order_lines}"
                channel = _removed_business_resolve_outbound_channel(row)
                recipient = (row.customer_phone or "").strip()
                if recipient:
                    await _removed_business_dispatch_message(
                        user_id=row.user_id,
                        order=row,
                        message=delivered_msg,
                        image_urls=[],
                        channel=channel,
                        recipient=recipient,
                    )
        except Exception:
            pass  # notification is best-effort
    if payload.status == "on_the_way":
        try:
            user_result = await db.execute(select(models.User).where(models.User.id == row.user_id))
            order_user = user_result.scalar_one_or_none()
            if order_user:
                order_items = await _removed_business_load_order_items(db, user_id=row.user_id, order_id=int(row.id))
                order_lines = _removed_business_render_order_reply_lines(row, order_items)
                lang = (order_user.language or "BM").strip().upper()
                step_header = "[Step 3.4 — ON THE WAY]"
                on_the_way_msg = (
                    f'{step_header}\nOrder {row.order_no} is on the way.'
                    if lang == "EN"
                    else f'{step_header}\nOrder {row.order_no} dalam perjalanan.'
                )
                if clean_rider := (row.delivery_rider_name or "").strip():
                    on_the_way_msg += f"\nRider: {clean_rider}"
                if order_lines:
                    on_the_way_msg = f"{on_the_way_msg}\n\nOrder:\n{order_lines}"
                channel = _removed_business_resolve_outbound_channel(row)
                recipient = (row.customer_phone or "").strip()
                if recipient:
                    await _removed_business_dispatch_message(
                        user_id=row.user_id,
                        order=row,
                        message=on_the_way_msg,
                        image_urls=[],
                        channel=channel,
                        recipient=recipient,
                    )
        except Exception:
            pass
    await _removed_business_publish_orders_event(row.user_id, "updated", int(row.id))
    return await _removed_business_public_delivery_response(db, row)

@app.post("/removed_business/orders/{order_id}/upload-received", response_model=schemas.RemovedBusinessOrderResponse)
async def upload_removed_business_order_received(
    order_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await _module_upload_order_received(
        order_id=order_id,
        file=file,
        db=db,
        current_user=current_user,
        receipt_max_bytes=RECEIPT_DIRECT_UPLOAD_MAX_BYTES,
        build_receipt_object_key=_removed_business_build_receipt_object_key,
        storage_direct_url=_removed_business_storage_direct_url,
        order_snapshot=_removed_business_order_snapshot,
        write_audit_log=_removed_business_write_audit_log,
        load_order_items=_removed_business_load_order_items,
        order_response_builder=_removed_business_order_response,
    )
    await _removed_business_publish_orders_event(current_user.id, "updated", int(result.id))
    return result

@app.post("/removed_business/orders/{order_id}/cod-completed", response_model=schemas.RemovedBusinessOrderResponse)
async def mark_removed_business_order_cod_completed(
    order_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await _module_mark_order_cod_completed(
        order_id=order_id,
        db=db,
        current_user=current_user,
        order_snapshot=_removed_business_order_snapshot,
        write_audit_log=_removed_business_write_audit_log,
        load_order_items=_removed_business_load_order_items,
        render_order_reply_lines=_removed_business_render_order_reply_lines,
        resolve_outbound_channel=_removed_business_resolve_outbound_channel,
        dispatch_message=_removed_business_dispatch_message,
        order_response_builder=_removed_business_order_response,
    )
    await _removed_business_publish_orders_event(current_user.id, "created", int(result.id))
    return result

@app.post("/stripe/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(database.get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    event = json.loads(payload.decode("utf-8"))
    if event.get("type") == "checkout.session.completed":
        session = event.get("data", {}).get("object", {})
        order_id = str(session.get("metadata", {}).get("order_id") or session.get("client_reference_id") or "").strip()
        if order_id.isdigit():
            result = await db.execute(select(models.BusinessOrder).where(models.BusinessOrder.id == int(order_id)))
            row = result.scalar_one_or_none()
            if row and row.status not in {"paid", "cod_completed", "cancelled"}:
                settings_result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == row.user_id))
                payment_settings = settings_result.scalar_one_or_none()
                webhook_secret = str(getattr(payment_settings, "stripe_webhook_secret", None) or "").strip()
                if webhook_secret:
                    timestamp = ""
                    signatures: list[str] = []
                    for part in sig_header.split(","):
                        key, _, value = part.partition("=")
                        if key == "t":
                            timestamp = value
                        elif key == "v1":
                            signatures.append(value)
                    signed_payload = f"{timestamp}.".encode() + payload
                    expected = hmac.new(webhook_secret.encode(), signed_payload, hashlib.sha256).hexdigest()
                    if not timestamp or not any(hmac.compare_digest(expected, item) for item in signatures):
                        raise HTTPException(status_code=400, detail="Invalid Stripe signature.")
                before_state = _removed_business_order_snapshot(row)
                row.status = "paid"
                row.payment_method = "stripe"
                row.stripe_checkout_session_id = session.get("id") or row.stripe_checkout_session_id
                row.stripe_payment_intent_id = session.get("payment_intent") or row.stripe_payment_intent_id
                await db.flush()
                await _removed_business_write_audit_log(db, user_id=row.user_id, actor_user_id=None, entity_type="order", entity_id=row.id, action="stripe_paid", before_state=before_state, after_state=_removed_business_order_snapshot(row))
                await db.commit()
                await _removed_business_publish_orders_event(row.user_id, "updated", int(row.id))
                return {"ok": True}
    return {"ok": True}

@app.post("/removed_business/orders/{order_id}/approve", response_model=schemas.RemovedBusinessOrderResponse)
async def approve_removed_business_order(
    order_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessOrder).where(models.BusinessOrder.id == order_id, models.BusinessOrder.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Business order not found.")
    raise HTTPException(status_code=410, detail="Verify order flow removed. Order now auto-processes.")


@app.post("/removed_business/orders/{order_id}/cancel", response_model=schemas.RemovedBusinessOrderResponse)
async def cancel_removed_business_order(
    order_id: int,
    payload: schemas.RemovedBusinessOrderCancelPayload,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessOrder).where(models.BusinessOrder.id == order_id, models.BusinessOrder.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Business order not found.")
    if row.status in {"cod_completed", "cancelled"}:
        raise HTTPException(status_code=400, detail="Completed or cancelled order cannot be cancelled again.")
    customer_phone = (row.customer_phone or "").strip()
    before_state = _removed_business_order_snapshot(row)
    row.status = "cancelled"
    row.cancel_reason = (payload.cancel_reason or "").strip() or None
    await db.flush()
    await _removed_business_write_audit_log(
        db,
        user_id=current_user.id,
        actor_user_id=current_user.id,
        entity_type="order",
        entity_id=row.id,
        action="cancel",
        before_state=before_state,
        after_state=_removed_business_order_snapshot(row),
    )
    await db.commit()
    await db.refresh(row)
    await _removed_business_publish_orders_event(current_user.id, "updated", int(row.id))

    if customer_phone:
        try:
            customer_name = (row.customer_name or "Customer").strip() or "Customer"
            order_no = row.order_no or ""
            is_en = (current_user.language or "").strip().upper() == "EN"
            cancel_msg = (
                f"Hi {customer_name}, your order {order_no} has been cancelled. Thank you."
                if is_en
                else f"Hi {customer_name}, order {order_no} telah dibatalkan. Terima kasih."
            )
            outbound_channel = _removed_business_resolve_outbound_channel(row, None)
            await _removed_business_dispatch_message(
                user_id=current_user.id,
                order=row,
                message=cancel_msg,
                image_urls=[],
                channel=outbound_channel,
                recipient=customer_phone,
            )
        except Exception:
            pass

    return _removed_business_order_response(row)


@app.delete("/removed_business/orders/{order_id}")
async def delete_removed_business_order(
    order_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessOrder).where(models.BusinessOrder.id == order_id, models.BusinessOrder.user_id == current_user.id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Business order not found.")

    before_state = _removed_business_order_snapshot(row)
    items_result = await db.execute(
        select(models.BusinessOrderItem).where(
            models.BusinessOrderItem.order_id == int(row.id),
            models.BusinessOrderItem.user_id == current_user.id,
        )
    )
    items = list(items_result.scalars().all())
    for item in items:
        await db.delete(item)

    await db.flush()
    await _removed_business_write_audit_log(
        db,
        user_id=current_user.id,
        actor_user_id=current_user.id,
        entity_type="order",
        entity_id=row.id,
        action="delete",
        before_state=before_state,
        after_state=None,
    )

    await db.delete(row)
    await db.commit()
    await _removed_business_publish_orders_event(current_user.id, "deleted", int(order_id))
    return {"ok": True}


@app.post("/removed_business/orders/{order_id}/scam-check", response_model=schemas.RemovedBusinessScamCheckResponse)
async def scam_check_removed_business_order(
    order_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    """Extract bank account from receipt/order text, check against penipu.my, and store result."""
    result = await db.execute(
        select(models.BusinessOrder).where(
            models.BusinessOrder.id == order_id,
            models.BusinessOrder.user_id == current_user.id,
        )
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Business order not found.")

    # 0. Semak sama ada customer (WhatsApp ID) ini pernah ditanda scam sebelum ini
    customer_phone = (order.customer_phone or "").strip()
    if customer_phone:
        previous = await db.execute(
            select(models.BusinessOrder).where(
                models.BusinessOrder.user_id == current_user.id,
                models.BusinessOrder.customer_phone == customer_phone,
                models.BusinessOrder.id != order_id,
                models.BusinessOrder.scam_fraud_flag.is_(True),
                models.BusinessOrder.scam_bank_account.isnot(None),
            ).order_by(models.BusinessOrder.scam_checked_at.desc()).limit(1)
        )
        prev_scam = previous.scalars().first()
        if prev_scam:
            order.scam_status = prev_scam.scam_status
            order.scam_bank_account = prev_scam.scam_bank_account
            order.scam_holder_name = prev_scam.scam_holder_name
            order.scam_bank_name = prev_scam.scam_bank_name
            order.scam_report_count = prev_scam.scam_report_count
            order.scam_fraud_flag = prev_scam.scam_fraud_flag
            order.scam_checked_at = datetime.utcnow()
            order.scam_scan_source = "customer_mark"
            await db.commit()
            await db.refresh(order)
            return schemas.RemovedBusinessScamCheckResponse(
                order_id=int(order.id),
                order_no=order.order_no,
                bank_account=prev_scam.scam_bank_account,
                holder_name=prev_scam.scam_holder_name,
                bank_name=prev_scam.scam_bank_name,
                police_report_count=prev_scam.scam_report_count or 0,
                verified_report_count=prev_scam.scam_report_count or 0,
                fraud=True,
                scanned_from="customer_mark",
            )

    scanned_from = None
    bank_account = None

    # 1. Try extract from receipt — download PDF if needed
    if order.receipt_url:
        try:
            receipt_text = None
            url = order.receipt_url
            is_pdf = url.lower().endswith(".pdf") or ".pdf?" in url.lower()

            if is_pdf:
                async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        doc = fitz.open(stream=resp.content, filetype="pdf")
                        receipt_text = ""
                        for page in doc:
                            receipt_text += page.get_text()
                        doc.close()
                        scanned_from = "receipt_pdf"
                        if receipt_text.strip():
                            bank_account = scam_service.extract_bank_account_from_text(receipt_text)
                        else:
                            receipt_text = None
            # Non-PDF (image): skip — URL string tidak mengandungi no akaun
        except Exception:
            pass

    # 2. Try from raw_message / note
    if not bank_account:
        raw_text = " ".join(filter(None, [order.raw_message or "", order.note or ""]))
        if raw_text.strip():
            bank_account = scam_service.extract_bank_account_from_text(raw_text)
            if bank_account:
                scanned_from = "order_text"

    # 3. Try from customer order concatenation
    if not bank_account:
        order_text = " ".join(filter(None, [
            order.customer_name or "",
            order.item_name or "",
            order.note or "",
        ]))
        bank_account = scam_service.extract_bank_account_from_text(order_text)
        if bank_account:
            scanned_from = "customer_details"

    if not bank_account:
        return schemas.RemovedBusinessScamCheckResponse(
            order_id=int(order.id),
            order_no=order.order_no,
            bank_account=None,
            holder_name=None,
            bank_name=None,
            police_report_count=0,
            verified_report_count=0,
            fraud=False,
            scanned_from=None,
        )

    # Check if this bank account was already checked before (in any order)
    existing = await db.execute(
        select(models.BusinessOrder).where(
            models.BusinessOrder.scam_bank_account == bank_account,
            models.BusinessOrder.scam_status.isnot(None),
        ).limit(1)
    )
    cached = existing.scalars().first()

    if cached and cached.scam_checked_at is not None:
        # Reuse cached result — no API call needed
        order.scam_status = cached.scam_status
        order.scam_bank_account = cached.scam_bank_account
        order.scam_holder_name = cached.scam_holder_name
        order.scam_bank_name = cached.scam_bank_name
        order.scam_report_count = cached.scam_report_count
        order.scam_fraud_flag = cached.scam_fraud_flag
        order.scam_checked_at = datetime.utcnow()
        order.scam_scan_source = cached.scam_scan_source or "penipu_my"

        await db.commit()
        await db.refresh(order)

        return schemas.RemovedBusinessScamCheckResponse(
            order_id=int(order.id),
            order_no=order.order_no,
            bank_account=cached.scam_bank_account,
            holder_name=cached.scam_holder_name,
            bank_name=cached.scam_bank_name,
            police_report_count=cached.scam_report_count or 0,
            verified_report_count=cached.scam_report_count or 0,
            fraud=bool(cached.scam_fraud_flag),
            scanned_from=scanned_from,
        )

    # Check against penipu.my API (only if not cached)
    api_result = await scam_service.check_bank_account(bank_account)

    # Store in database
    order.scam_status = "fraud" if api_result.get("fraud") else "clean"
    order.scam_bank_account = api_result.get("bank_account") or bank_account
    order.scam_holder_name = api_result.get("holder_name")
    order.scam_bank_name = api_result.get("bank_name")
    order.scam_report_count = (api_result.get("police_report_count") or 0) + (api_result.get("verified_report_count") or 0)
    order.scam_fraud_flag = bool(api_result.get("fraud"))
    order.scam_checked_at = datetime.utcnow()
    order.scam_scan_source = "penipu_my"

    await db.commit()
    await db.refresh(order)

    return schemas.RemovedBusinessScamCheckResponse(
        order_id=int(order.id),
        order_no=order.order_no,
        bank_account=api_result.get("bank_account") or bank_account,
        holder_name=api_result.get("holder_name"),
        bank_name=api_result.get("bank_name"),
        police_report_count=api_result.get("police_report_count", 0),
        verified_report_count=api_result.get("verified_report_count", 0),
        fraud=bool(api_result.get("fraud")),
        scanned_from=scanned_from,
    )


@app.get("/removed_business/customers/scam-summary", response_model=List[schemas.RemovedBusinessCustomerScamSummary])
async def get_removed_business_customers_scam_summary(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    """Return scam summary per customer for marking in customer list."""
    result = await db.execute(
        select(models.BusinessOrder).where(
            models.BusinessOrder.user_id == current_user.id,
            models.BusinessOrder.scam_status.isnot(None),
        )
    )
    scam_orders = result.scalars().all()

    customers: dict[str, dict[str, Any]] = {}
    for o in scam_orders:
        key = (o.customer_name or "Unknown").strip() or "Unknown"

        if key not in customers:
            customers[key] = {
                "customer_name": key,
                "customer_phone": o.customer_phone,
                "scam_orders_count": 0,
                "fraud_bank_accounts": [],
            }
        customers[key]["scam_orders_count"] += 1
        if o.scam_fraud_flag and o.scam_bank_account and o.scam_bank_account not in customers[key]["fraud_bank_accounts"]:
            customers[key]["fraud_bank_accounts"].append(o.scam_bank_account)

    return [
        schemas.RemovedBusinessCustomerScamSummary(
            customer_name=v["customer_name"],
            customer_phone=v.get("customer_phone"),
            scam_orders_count=v["scam_orders_count"],
            total_fraud_bank_accounts=len(v["fraud_bank_accounts"]),
            fraud_bank_accounts=v["fraud_bank_accounts"],
            is_scammer=len(v["fraud_bank_accounts"]) > 0,
        )
        for v in customers.values()
    ]


# ─── Community Scam Reports ───────────────────────────────────────────

@app.get("/removed_business/scam-report", response_model=schemas.ScamPhoneReportResponse)
async def get_scam_phone_report(
    phone: str = Query(...),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    """Get scam report count and whether current user reported this phone."""
    phone = phone.strip().lstrip("+")
    result = await db.execute(
        select(models.ScamPhoneReport).where(models.ScamPhoneReport.phone == phone)
    )
    reports = result.scalars().all()
    count = len(reports)
    reported_by_me = any(r.reporter_user_id == current_user.id for r in reports)
    return schemas.ScamPhoneReportResponse(
        phone=phone,
        report_count=count,
        reported_by_me=reported_by_me,
    )


@app.post("/removed_business/scam-report", response_model=schemas.ScamPhoneReportResponse)
async def report_scam_phone(
    body: schemas.ScamPhoneReportRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    """Report a phone number as scam."""
    phone = body.phone.strip().lstrip("+")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required.")
    existing = await db.execute(
        select(models.ScamPhoneReport).where(
            models.ScamPhoneReport.phone == phone,
            models.ScamPhoneReport.reporter_user_id == current_user.id,
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="Already reported.")
    report = models.ScamPhoneReport(phone=phone, reporter_user_id=current_user.id)
    db.add(report)
    await db.commit()

    result = await db.execute(
        select(models.ScamPhoneReport).where(models.ScamPhoneReport.phone == phone)
    )
    count = len(result.scalars().all())
    return schemas.ScamPhoneReportResponse(
        phone=phone,
        report_count=count,
        reported_by_me=True,
    )


@app.delete("/removed_business/scam-report", response_model=schemas.ScamPhoneReportResponse)
async def cancel_scam_phone_report(
    body: schemas.ScamPhoneReportRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    """Cancel your scam report for a phone number."""
    phone = body.phone.strip().lstrip("+")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required.")
    result = await db.execute(
        select(models.ScamPhoneReport).where(
            models.ScamPhoneReport.phone == phone,
            models.ScamPhoneReport.reporter_user_id == current_user.id,
        )
    )
    report = result.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    await db.delete(report)
    await db.commit()

    result2 = await db.execute(
        select(models.ScamPhoneReport).where(models.ScamPhoneReport.phone == phone)
    )
    count = len(result2.scalars().all())
    return schemas.ScamPhoneReportResponse(
        phone=phone,
        report_count=count,
        reported_by_me=False,
    )


@app.post("/removed_business/orders/{order_id}/send-qr", response_model=schemas.RemovedBusinessSendQrResponse)
async def send_qr_for_removed_business_order(
    order_id: int,
    dispatch: bool = Query(default=False),
    channel: str | None = Query(default=None),
    recipient: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    return await _module_send_qr_for_removed_business_order_route(
        order_id=order_id,
        dispatch=dispatch,
        channel=channel,
        recipient=recipient,
        db=db,
        current_user=current_user,
        load_order_items=_removed_business_load_order_items,
        build_qr_dispatch_message=_removed_business_build_qr_dispatch_message,
        resolve_outbound_channel=_removed_business_resolve_outbound_channel,
        dispatch_message=_removed_business_dispatch_message,
        write_audit_log=_removed_business_write_audit_log,
        order_snapshot=_removed_business_order_snapshot,
        render_order_reply_lines=_removed_business_render_order_reply_lines,
        apply_order_lines_inside_caption=_removed_business_apply_order_lines_inside_caption,
    )

@app.get("/removed_business/orders/{order_id}/receipt")
async def get_receipt_html(
    order_id: int,
    request: Request,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    order_result = await db.execute(
        select(models.BusinessOrder).where(
            models.BusinessOrder.id == order_id,
            models.BusinessOrder.user_id == current_user.id,
        )
    )
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    items = await _removed_business_load_order_items(db, user_id=current_user.id, order_id=int(order.id))
    return _removed_business_render_receipt_html(order, items, request)

@app.get("/public/removed_business/receipt/{token}", response_class=HTMLResponse)
async def get_public_removed_business_receipt(
    token: str,
    request: Request,
    db: AsyncSession = Depends(database.get_db),
):
    """Public (no-auth) receipt page. Token is HMAC-signed: order_id + order_no."""
    verified = _removed_business_verify_receipt_token(token)
    if not verified:
        raise HTTPException(status_code=404, detail="Receipt link not found or expired.")
    order_id_from_token, _ = verified
    order_result = await db.execute(
        select(models.BusinessOrder).where(models.BusinessOrder.id == order_id_from_token)
    )
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    items = await _removed_business_load_order_items(db, user_id=order.user_id, order_id=int(order.id))
    setting_res = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == order.user_id))
    setting_row = setting_res.scalar_one_or_none()
    brand_name = setting_row.brand_name if setting_row else None
    return _removed_business_render_receipt_html(order, items, request, brand_name)


@app.get("/public/removed_business/receipt/{token}/{filename}")
@app.get("/public/removed_business/receipt/{token}/pdf")
async def get_public_removed_business_receipt_pdf(
    token: str,
    filename: str = "receipt.pdf",
    db: AsyncSession = Depends(database.get_db),
):
    """Public (no-auth) PDF receipt."""
    verified = _removed_business_verify_receipt_token(token)
    if not verified:
        raise HTTPException(status_code=404, detail="Receipt link not found or expired.")
    order_id_from_token, _ = verified
    order_result = await db.execute(
        select(models.BusinessOrder).where(models.BusinessOrder.id == order_id_from_token)
    )
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    items = await _removed_business_load_order_items(db, user_id=order.user_id, order_id=int(order.id))
    
    total = sum(float(it.quantity or 0) * float(it.unit_price or 0) for it in items)
    if order.delivery_charge:
        total += float(order.delivery_charge)
        
    setting_res = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == order.user_id))
    setting_row = setting_res.scalar_one_or_none()
    brand_name = setting_row.brand_name if setting_row else None
    
    user_res = await db.execute(select(models.User.language).where(models.User.id == order.user_id))
    user_lang = user_res.scalar_one_or_none()
    
    pdf_bytes = _render_pdf_receipt(order, items, total, brand_name, user_lang=user_lang)
    filename = f"{order.order_no or order.id}.pdf"
    
    return Response(
        content=pdf_bytes, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.post("/removed_business/orders/{order_id}/send-receipt")
async def send_receipt_for_removed_business_order(
    order_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    order_result = await db.execute(
        select(models.BusinessOrder).where(
            models.BusinessOrder.id == order_id,
            models.BusinessOrder.user_id == current_user.id,
        )
    )
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    customer_phone = (order.customer_phone or "").strip()
    if not customer_phone:
        raise HTTPException(status_code=400, detail="Customer phone is missing")
    items = await _removed_business_load_order_items(db, user_id=current_user.id, order_id=int(order.id))
    receipt_text = _removed_business_build_receipt_text(order, items)

    # Use PDF URL
    receipt_token = _removed_business_generate_receipt_token(int(order.id), str(order.order_no or order.id))
    safe_filename = urllib.parse.quote(f"{order.order_no or order.id}.pdf")
    pdf_link = f"{APP_PUBLIC_URL}/api/public/removed_business/receipt/{receipt_token}/{safe_filename}"

    # Use proper channel resolution (supports both regular WhatsApp and Cloud API)
    outbound_channel = _removed_business_resolve_outbound_channel(order, None)
    is_en = (current_user.language or "").strip().upper() == "EN"
    receipt_message = (
        "Thank you. Here is your receipt:"
        if is_en
        else "Terima kasih. Berikut adalah resit anda:"
    )
    ok, error = await _removed_business_dispatch_message(
        user_id=current_user.id,
        order=order,
        message=receipt_message,
        image_urls=[],
        document_urls=[pdf_link],
        channel=outbound_channel,
        recipient=customer_phone,
    )
    if not ok:
        print("DISPATCH ERROR:", error, flush=True)
        raise HTTPException(status_code=400, detail=(error or "Failed to send receipt")[:500])
    return {"ok": True}

@app.post("/removed_business/orders/{order_id}/send-reminder", response_model=schemas.RemovedBusinessDispatchResponse)
async def send_removed_business_order_reminder(
    order_id: int,
    channel: str | None = Query(default=None),
    recipient: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    return await _module_send_removed_business_order_reminder_route(
        order_id=order_id,
        channel=channel,
        recipient=recipient,
        db=db,
        current_user=current_user,
        resolve_outbound_channel=_removed_business_resolve_outbound_channel,
        build_reminder_dispatch_message=_removed_business_build_reminder_dispatch_message,
        dispatch_message=_removed_business_dispatch_message,
        write_audit_log=_removed_business_write_audit_log,
        order_snapshot=_removed_business_order_snapshot,
    )

@app.get("/removed_business/settings/payment", response_model=schemas.RemovedBusinessPaymentSettingsResponse)
async def removed_business_payment_settings(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == current_user.id))
    row = result.scalars().first()
    return await _removed_business_payment_settings_response_with_delivery(db, row, current_user.id)


@app.patch("/removed_business/settings/payment", response_model=schemas.RemovedBusinessPaymentSettingsResponse)
async def update_removed_business_payment_settings(
    payload: schemas.RemovedBusinessPaymentSettingsUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == current_user.id))
    row = result.scalars().first()
    if row is None:
        row = models.BusinessPaymentSetting(user_id=current_user.id)
        db.add(row)
        await db.flush()
    before_state = _removed_business_payment_settings_snapshot(row)
    delivery_settings_payload = await _removed_business_get_delivery_settings(db, current_user.id)
    # Explicitly persist pickup/delivery enabled flags on the row
    if payload.pickup_enabled is not None:
        row.pickup_enabled = payload.pickup_enabled
    if payload.delivery_enabled is not None:
        row.delivery_enabled = payload.delivery_enabled
    for delivery_field in ["store_address", "store_latitude", "store_longitude", "delivery_rate_per_km", "delivery_base_price", "delivery_max_distance_km", "delivery_charge_mode", "shipping_fixed_amount", "pickup_enabled", "delivery_enabled"]:
        delivery_value = getattr(payload, delivery_field)
        if delivery_value is not None:
            if delivery_field == "delivery_charge_mode":
                delivery_value = "shipping" if str(delivery_value).lower() == "shipping" else "rider"
            if delivery_field in {"shipping_fixed_amount", "delivery_base_price", "delivery_rate_per_km", "delivery_max_distance_km"}:
                try:
                    delivery_value = max(0.0, float(delivery_value))
                except (TypeError, ValueError):
                    delivery_value = 0.0
            delivery_settings_payload[delivery_field] = delivery_value
    await _removed_business_set_delivery_settings(db, current_user.id, delivery_settings_payload)
    await db.flush()
    for field in [
        "brand_name",
        "qr_image_url",
        "payment_image_url",
        "bank_name",
        "account_name",
        "account_number",
        "stripe_enabled",
        "stripe_secret_key",
        "stripe_publishable_key",
        "stripe_webhook_secret",
        "auto_acknowledge_incoming_order",
        "auto_acknowledge_payment_receipt",
        "auto_reply_qr_on_order",
        "auto_reply_qr_when_amount_ready",
        "is_business_open",
        "capture_all_whatsapp_messages",
        "allow_owner_whatsapp_order_proxy",
        "pickup_enabled",
        "delivery_enabled",
        "whatsapp_trigger_prefix",
        "business_closed_reply_template",
        "incoming_order_reply_template",
        "payment_review_reply_template",
        "qr_caption_template",
        "payment_note_template",
        "customer_note_prompt",
        "customer_note_example",
        "customer_note_enabled",
        "catalog_list_enabled",
        "catalog_image_url",
        "prepared_order_notify_enabled",
    ]:
        value = getattr(payload, field)
        if value is not None:
            if field in {"qr_image_url", "payment_image_url", "bank_name", "account_name", "account_number", "stripe_secret_key", "stripe_publishable_key", "stripe_webhook_secret", "whatsapp_trigger_prefix", "business_closed_reply_template", "incoming_order_reply_template", "payment_review_reply_template", "qr_caption_template", "payment_note_template", "customer_note_prompt", "customer_note_example", "catalog_image_url"} and isinstance(value, str):
                # Explicit empty string means delete for catalog_image_url
                if field == "catalog_image_url" and value == "":
                    old_url = getattr(row, field, None)
                    if old_url:
                        try:
                            from urllib.parse import urlparse
                            parsed = urlparse(old_url)
                            object_key = parsed.path.lstrip("/")
                            if object_key:
                                await asyncio.to_thread(storage_service.delete_receipt_object, object_key)
                                print(f"[removed_business-catalog] Deleted R2 object: {object_key}", flush=True)
                        except Exception as exc:
                            print(f"[removed_business-catalog] Failed to delete R2 object from URL {old_url}: {exc}", flush=True)
                    setattr(row, field, None)
                else:
                    value = value.strip() or None
                    if field in {"stripe_secret_key", "stripe_webhook_secret"} and value is None:
                        continue
                    setattr(row, field, value)
            else:
                # Non-string fields (bool, int, float)
                setattr(row, field, value)
    await db.flush()
    await _removed_business_write_audit_log(
        db,
        user_id=current_user.id,
        actor_user_id=current_user.id,
        entity_type="payment_setting",
        entity_id=row.id,
        action="update",
        before_state=before_state,
        after_state=_removed_business_payment_settings_snapshot(row),
    )
    await db.commit()
    await db.refresh(row)
    response = await _removed_business_payment_settings_response_with_delivery(db, row, current_user.id)
    response.pickup_enabled = bool(row.pickup_enabled)
    response.delivery_enabled = bool(row.delivery_enabled)
    return response


@app.post("/removed_business/settings/payment/upload", response_model=schemas.RemovedBusinessPaymentSettingsResponse)
async def upload_removed_business_payment_asset(
    target: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    return await _module_upload_removed_business_payment_asset_route(
        target=target,
        file=file,
        db=db,
        current_user=current_user,
        receipt_max_bytes=RECEIPT_DIRECT_UPLOAD_MAX_BYTES,
        build_receipt_object_key=_removed_business_build_receipt_object_key,
        storage_direct_url=_removed_business_storage_direct_url,
        payment_settings_snapshot=_removed_business_payment_settings_snapshot,
        write_audit_log=_removed_business_write_audit_log,
        payment_settings_response_builder=lambda row: _removed_business_payment_settings_response_with_delivery(db, row, current_user.id),
    )


@app.post("/removed_business/settings/catalog-image", response_model=schemas.RemovedBusinessPaymentSettingsResponse)
async def upload_removed_business_catalog_image(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="File is empty.")
    if len(payload) > RECEIPT_DIRECT_UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large.")

    try:
        validated_mime, extension = storage_service.validate_receipt_file(file.filename, file.content_type, payload)
    except storage_service.StorageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    object_key = _removed_business_build_receipt_object_key(current_user.id, "catalog-image", file.filename, extension)
    try:
        await asyncio.to_thread(storage_service.upload_receipt_object, object_key, payload, validated_mime)
    except storage_service.StorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == current_user.id))
    row = result.scalars().first()
    if row is None:
        row = models.BusinessPaymentSetting(user_id=current_user.id)
        db.add(row)
        await db.flush()

    before_state = _removed_business_payment_settings_snapshot(row)
    row.catalog_image_url = _removed_business_storage_direct_url(object_key) or object_key
    await db.flush()
    await _removed_business_write_audit_log(
        db,
        user_id=current_user.id,
        actor_user_id=current_user.id,
        entity_type="payment_setting",
        entity_id=row.id,
        action="upload_catalog_image",
        before_state=before_state,
        after_state=_removed_business_payment_settings_snapshot(row),
    )
    await db.commit()
    await db.refresh(row)
    return await _removed_business_payment_settings_response_with_delivery(db, row, current_user.id)



@app.get("/removed_business/whatsapp-cloud-settings", response_model=schemas.RemovedBusinessWhatsAppCloudSettingsResponse)
async def removed_business_whatsapp_cloud_settings(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == current_user.id,
            models.UserSetting.key == 'removed_business_whatsapp_cloud_api',
        )
    )
    row = result.scalar_one_or_none()
    stored: dict[str, Any] = {}
    if row and row.value:
        try:
            parsed = json.loads(row.value)
            if isinstance(parsed, dict):
                stored = parsed
        except Exception:
            stored = {}
    changed = False
    if not str(stored.get('webhook_token') or '').strip():
        stored['webhook_token'] = _generate_removed_business_webhook_token()
        changed = True
    if not str(stored.get('webhook_url') or '').strip() or str(stored.get('webhook_url') or '').strip() == '/api/whatsapp/webhook':
        stored['webhook_url'] = '/removed_business/api/inbox/webhook/{token}'
        changed = True
    if changed:
        payload_json = json.dumps(stored)
        if row is None:
            db.add(models.UserSetting(user_id=current_user.id, key='removed_business_whatsapp_cloud_api', value=payload_json))
        else:
            row.value = payload_json
        await db.commit()
        return _removed_business_whatsapp_cloud_settings_response(payload_json)
    return _removed_business_whatsapp_cloud_settings_response(row.value if row else None)

@app.put("/removed_business/whatsapp-cloud-settings", response_model=schemas.RemovedBusinessWhatsAppCloudSettingsResponse)
async def update_removed_business_whatsapp_cloud_settings(
    payload: schemas.RemovedBusinessWhatsAppCloudSettingsUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == current_user.id,
            models.UserSetting.key == 'removed_business_whatsapp_cloud_api',
        )
    )
    row = result.scalar_one_or_none()
    stored: dict[str, Any] = {}
    if row and row.value:
        try:
            parsed = json.loads(row.value)
            if isinstance(parsed, dict):
                stored = parsed
        except Exception:
            stored = {}

    next_data = dict(stored)
    if not str(next_data.get('webhook_token') or '').strip():
        next_data['webhook_token'] = _generate_removed_business_webhook_token()
    if payload.regenerate_webhook_token:
        next_data['webhook_token'] = _generate_removed_business_webhook_token()
    elif payload.webhook_token is not None and (payload.webhook_token or '').strip():
        next_data['webhook_token'] = (payload.webhook_token or '').strip()
    if payload.enabled is not None:
        next_data['enabled'] = bool(payload.enabled)
    if payload.phone_number_id is not None:
        next_data['phone_number_id'] = (payload.phone_number_id or '').strip() or None
    if payload.business_account_id is not None:
        next_data['business_account_id'] = (payload.business_account_id or '').strip() or None
    if payload.verify_token is not None:
        next_data['verify_token'] = (payload.verify_token or '').strip() or None
    if payload.app_secret is not None:
        next_data['app_secret'] = (payload.app_secret or '').strip() or None
    if payload.webhook_url is not None:
        next_data['webhook_url'] = (payload.webhook_url or '').strip() or '/removed_business/api/inbox/webhook/{token}'
    if payload.clear_access_token:
        next_data['access_token'] = None
    elif payload.access_token is not None and (payload.access_token or '').strip():
        next_data['access_token'] = (payload.access_token or '').strip()

    payload_json = json.dumps(next_data)
    if row is None:
        db.add(models.UserSetting(user_id=current_user.id, key='removed_business_whatsapp_cloud_api', value=payload_json))
    else:
        row.value = payload_json
    await db.commit()
    return _removed_business_whatsapp_cloud_settings_response(payload_json)

@app.get("/removed_business/whatsapp-cloud-settings/test", response_model=schemas.RemovedBusinessWhatsAppCloudWebhookTestResponse)
async def test_removed_business_whatsapp_cloud_settings(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == current_user.id,
            models.UserSetting.key == 'removed_business_whatsapp_cloud_api',
        )
    )
    row = result.scalar_one_or_none()
    data: dict[str, Any] = {}
    if row and row.value:
        try:
            parsed = json.loads(row.value)
            if isinstance(parsed, dict):
                data = parsed
        except Exception:
            data = {}
    webhook_token = str(data.get('webhook_token') or '').strip()
    verify_token = str(data.get('verify_token') or '').strip()
    callback_url = _removed_business_cloud_callback_url(webhook_token)
    if not webhook_token:
        return schemas.RemovedBusinessWhatsAppCloudWebhookTestResponse(
            ok=False,
            callback_url=None,
            verify_token_present=bool(verify_token),
            webhook_token_present=False,
            challenge_url=None,
            detail='Webhook token missing.',
        )
    if not verify_token:
        return schemas.RemovedBusinessWhatsAppCloudWebhookTestResponse(
            ok=False,
            callback_url=callback_url,
            verify_token_present=False,
            webhook_token_present=True,
            challenge_url=None,
            detail='Verify token missing.',
        )
    challenge_url = f"{callback_url}?hub.mode=subscribe&hub.verify_token={quote(verify_token, safe='')}&hub.challenge=budget-cloud-ok"
    return schemas.RemovedBusinessWhatsAppCloudWebhookTestResponse(
        ok=True,
        callback_url=callback_url,
        verify_token_present=True,
        webhook_token_present=True,
        challenge_url=challenge_url,
        detail='Webhook config looks valid. Use Meta verify with this callback URL and verify token.',
    )

@app.get("/removed_business/stock-counts")
async def removed_business_stock_counts(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    counts: dict[str, float] = {}
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == current_user.id,
            models.UserSetting.key == 'removed_business_stock_counts',
        )
    )
    row = result.scalar_one_or_none()
    if row and row.value:
        try:
            raw = json.loads(row.value)
            if isinstance(raw, dict):
                for key, value in raw.items():
                    try:
                        counts[str(int(key))] = round(float(value or 0), 2)
                    except (TypeError, ValueError):
                        continue
        except Exception:
            counts = {}
    return {"counts": counts}


@app.put("/removed_business/stock-counts")
async def update_removed_business_stock_counts(
    payload: schemas.RemovedBusinessStockCountsUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    cleaned: dict[str, float] = {}
    for key, value in (payload.counts or {}).items():
        try:
            cleaned[str(int(key))] = round(max(0.0, float(value or 0)), 2)
        except (TypeError, ValueError):
            continue
    result = await db.execute(
        select(models.UserSetting).where(
            models.UserSetting.user_id == current_user.id,
            models.UserSetting.key == 'removed_business_stock_counts',
        )
    )
    row = result.scalar_one_or_none()
    payload_json = json.dumps(cleaned)
    if row is None:
        db.add(models.UserSetting(user_id=current_user.id, key='removed_business_stock_counts', value=payload_json))
    else:
        row.value = payload_json
    await db.commit()
    return {"counts": cleaned}

@app.get("/removed_business/reports", response_model=schemas.RemovedBusinessReportSummaryResponse)
async def removed_business_reports(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    dashboard = await removed_business_dashboard(db=db, current_user=current_user)

    product_result = await db.execute(
        select(models.BusinessProduct)
        .where(models.BusinessProduct.user_id == current_user.id, models.BusinessProduct.is_active.is_(True))
        .order_by(models.BusinessProduct.product_name.asc(), models.BusinessProduct.id.asc())
    )
    products = list(product_result.scalars().all())
    product_map = {int(row.id): row for row in products}

    order_result = await db.execute(
        select(models.BusinessOrder)
        .where(models.BusinessOrder.user_id == current_user.id)
        .order_by(models.BusinessOrder.created_at.desc(), models.BusinessOrder.id.desc())
    )
    orders = list(order_result.scalars().all())
    order_ids = [int(row.id) for row in orders]

    order_items_by_order: dict[int, list[models.BusinessOrderItem]] = {}
    if order_ids:
        order_items_result = await db.execute(
            select(models.BusinessOrderItem)
            .where(
                models.BusinessOrderItem.user_id == current_user.id,
                models.BusinessOrderItem.order_id.in_(order_ids),
            )
            .order_by(models.BusinessOrderItem.order_id.asc(), models.BusinessOrderItem.sort_order.asc(), models.BusinessOrderItem.id.asc())
        )
        for item in order_items_result.scalars().all():
            order_items_by_order.setdefault(int(item.order_id), []).append(item)

    expense_result = await db.execute(
        select(models.BusinessExpense)
        .where(models.BusinessExpense.user_id == current_user.id)
        .order_by(models.BusinessExpense.created_at.desc(), models.BusinessExpense.id.desc())
    )
    expenses = list(expense_result.scalars().all())

    draw_result = await db.execute(
        select(func.sum(models.BusinessOwnerDraw.amount)).where(models.BusinessOwnerDraw.user_id == current_user.id)
    )
    total_owner_drawn = float(draw_result.scalar() or 0.0)

    stock_counts: dict[int, float] = {}
    try:
        stock_result = await db.execute(
            select(models.UserSetting).where(
                models.UserSetting.user_id == current_user.id,
                models.UserSetting.key == 'removed_business_stock_counts',
            )
        )
        stock_row = stock_result.scalar_one_or_none()
        if stock_row and stock_row.value:
            raw_stock_map = json.loads(stock_row.value)
            if isinstance(raw_stock_map, dict):
                for key, value in raw_stock_map.items():
                    try:
                        stock_counts[int(key)] = round(float(value or 0), 2)
                    except (TypeError, ValueError):
                        continue
    except Exception:
        stock_counts = {}

    sold_statuses = {'paid', 'packing', 'ready_pickup', 'cod_completed'}
    pending_delivery_statuses = {'paid', 'cod_pending', 'packing', 'ready_pickup'}
    cancelled_statuses = {'cancelled'}

    product_units_sold: dict[int, float] = {}
    product_pending_delivery: dict[int, float] = {}
    product_revenue: dict[int, float] = {}
    expense_by_category: dict[str, float] = {}
    total_items_sold = 0.0

    for expense in expenses:
        category = (expense.category or 'Other').strip() or 'Other'
        expense_by_category[category] = round(expense_by_category.get(category, 0.0) + float(expense.amount or 0), 2)

    for order in orders:
        status = (order.status or '').strip().lower()
        order_items = order_items_by_order.get(int(order.id), [])
        if order_items:
            delivery_charge = max(0.0, float(order.delivery_charge or 0))
            order_revenue = float(order.subtotal_amount) if order.subtotal_amount is not None else max(0.0, float(order.amount or 0) - delivery_charge)
            total_qty = sum(float(item.quantity or 0) for item in order_items)
            for item in order_items:
                if item.product_id is None:
                    continue
                product_id = int(item.product_id)
                qty = float(item.quantity or 0)
                if qty <= 0:
                    continue
                if status in sold_statuses:
                    product_units_sold[product_id] = round(product_units_sold.get(product_id, 0.0) + qty, 2)
                    total_items_sold = round(total_items_sold + qty, 2)
                    share = (qty / total_qty) if total_qty > 0 else 0.0
                    product_revenue[product_id] = round(product_revenue.get(product_id, 0.0) + (order_revenue * share), 2)
                if status in pending_delivery_statuses:
                    product_pending_delivery[product_id] = round(product_pending_delivery.get(product_id, 0.0) + qty, 2)
            continue

        if order.product_id is None:
            continue
        product_id = int(order.product_id)
        qty = float(order.quantity or 0)
        if qty <= 0:
            qty = 1.0
        if status in sold_statuses:
            product_units_sold[product_id] = round(product_units_sold.get(product_id, 0.0) + qty, 2)
            total_items_sold = round(total_items_sold + qty, 2)
            delivery_charge = max(0.0, float(order.delivery_charge or 0))
            order_revenue = float(order.subtotal_amount) if order.subtotal_amount is not None else max(0.0, float(order.amount or 0) - delivery_charge)
            product_revenue[product_id] = round(product_revenue.get(product_id, 0.0) + order_revenue, 2)
        if status in pending_delivery_statuses:
            product_pending_delivery[product_id] = round(product_pending_delivery.get(product_id, 0.0) + qty, 2)

    def _report_product_payload(product_id: int) -> schemas.RemovedBusinessReportTopProductResponse:
        product = product_map.get(product_id)
        current_stock = round(float(stock_counts.get(product_id, 0.0) or 0.0), 2)
        pending_delivery = round(float(product_pending_delivery.get(product_id, 0.0) or 0.0), 2)
        return schemas.RemovedBusinessReportTopProductResponse(
            product_id=product_id,
            product_name=(product.product_name if product is not None else f'Product #{product_id}'),
            units_sold=round(float(product_units_sold.get(product_id, 0.0) or 0.0), 2),
            revenue=round(float(product_revenue.get(product_id, 0.0) or 0.0), 2),
            pending_delivery=pending_delivery,
            current_stock=current_stock,
            available_after_delivery=round(max(0.0, current_stock - pending_delivery), 2),
        )

    top_unit_ids = sorted(product_units_sold.keys(), key=lambda pid: (-product_units_sold.get(pid, 0.0), -product_revenue.get(pid, 0.0), pid))[:10]
    top_revenue_ids = sorted(product_revenue.keys(), key=lambda pid: (-product_revenue.get(pid, 0.0), -product_units_sold.get(pid, 0.0), pid))[:10]

    total_orders = len(orders)
    paid_orders = int(dashboard['paid_orders'])
    average_order_value = round((float(dashboard['sales'] or 0.0) / paid_orders), 2) if paid_orders > 0 else 0.0
    total_stock = round(sum(float(stock_counts.get(int(product.id), 0.0) or 0.0) for product in products), 2)
    total_pending_delivery_units = round(sum(product_pending_delivery.values()), 2)
    total_available_stock = round(max(0.0, total_stock - total_pending_delivery_units), 2)
    status_counts: dict[str, int] = {}
    for order in orders:
        status = (order.status or '').strip().lower()
        status_counts[status] = status_counts.get(status, 0) + 1
    cancelled_orders = sum(status_counts.get(status, 0) for status in cancelled_statuses)
    completed_orders = sum(status_counts.get(status, 0) for status in {'cod_completed', 'completed', 'delivered'})

    return schemas.RemovedBusinessReportSummaryResponse(
        sales=float(dashboard['sales']),
        costs=float(dashboard['costs']),
        profit=float(dashboard['profit']),
        paid_orders=paid_orders,
        pending_orders=int(dashboard['pending_orders']),
        pending_amount=int(dashboard['pending_amount']),
        pending_payment=int(dashboard['pending_payment']),
        cod_pending=int(dashboard['cod_pending']),
        pending_approval=status_counts.get('pending_approval', 0),
        pending_address=status_counts.get('pending_address', 0),
        payment_review=status_counts.get('payment_review', 0),
        packing_orders=status_counts.get('packing', 0),
        ready_pickup_orders=status_counts.get('ready_pickup', 0) + status_counts.get('paid_ready_pickup', 0),
        completed_orders=completed_orders,
        cod_completed=status_counts.get('cod_completed', 0),
        cancelled_orders=cancelled_orders,
        total_orders=total_orders,
        total_items_sold=total_items_sold,
        average_order_value=average_order_value,
        active_products=len(products),
        total_stock=total_stock,
        total_pending_delivery_units=total_pending_delivery_units,
        total_available_stock=total_available_stock,
        total_owner_drawn=round(total_owner_drawn, 2),
        safe_profit_available=round(float(dashboard['profit']) - total_owner_drawn, 2),
        expense_categories=[
            schemas.RemovedBusinessReportExpenseCategoryResponse(category=category, amount=amount)
            for category, amount in sorted(expense_by_category.items(), key=lambda item: (-item[1], item[0].lower()))[:8]
        ],
        top_products_by_units=[_report_product_payload(product_id) for product_id in top_unit_ids],
        top_products_by_revenue=[_report_product_payload(product_id) for product_id in top_revenue_ids],
    )


@app.get("/removed_business/reports/export.csv")
async def removed_business_reports_export_csv(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    order_result = await db.execute(
        select(models.BusinessOrder)
        .where(models.BusinessOrder.user_id == current_user.id)
        .order_by(models.BusinessOrder.created_at.asc(), models.BusinessOrder.id.asc())
    )
    expense_result = await db.execute(
        select(models.BusinessExpense)
        .where(models.BusinessExpense.user_id == current_user.id)
        .order_by(models.BusinessExpense.created_at.asc(), models.BusinessExpense.id.asc())
    )
    monthly: dict[str, dict[str, float]] = {}
    for row in order_result.scalars().all():
        key = row.created_at.strftime("%Y-%m") if row.created_at else "unknown"
        bucket = monthly.setdefault(key, {"sales": 0.0, "costs": 0.0})
        if row.status in {"paid", "cod_completed"}:
            bucket["sales"] += float(row.amount or 0)
    for row in expense_result.scalars().all():
        key = row.created_at.strftime("%Y-%m") if row.created_at else "unknown"
        bucket = monthly.setdefault(key, {"sales": 0.0, "costs": 0.0})
        bucket["costs"] += float(row.amount or 0)
    rows = []
    for key in sorted(monthly.keys()):
        sales = monthly[key]["sales"]
        costs = monthly[key]["costs"]
        rows.append([key, _fmt_money(sales), _fmt_money(costs), _fmt_money(sales - costs)])
    return _removed_business_csv_response(
        "removed_business-report-monthly.csv",
        ["month", "sales", "costs", "profit"],
        rows,
    )

@app.get("/removed_business/customers", response_model=List[schemas.RemovedBusinessCustomerSummaryResponse])
async def removed_business_customers(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    balance_statuses = {"pending_payment", "payment_review", "cod_pending"}
    result = await db.execute(
        select(models.BusinessOrder)
        .where(models.BusinessOrder.user_id == current_user.id)
        .order_by(models.BusinessOrder.created_at.desc(), models.BusinessOrder.id.desc())
    )
    rows = list(result.scalars().all())
    official_identifiers = await _removed_business_load_official_identifiers_for_app(db, current_user.id)
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        name = (row.customer_name or "Walk-in Customer").strip() or "Walk-in Customer"
        delivery_charge = max(0.0, float(row.delivery_charge or 0))
        item_amount = float(row.subtotal_amount) if row.subtotal_amount is not None else max(0.0, float(row.amount or 0) - delivery_charge)
        bucket = grouped.setdefault(name.lower(), {
            "customer_name": name,
            "customer_phone": _removed_business_display_customer_phone(row.customer_phone),
            "total_orders": 0,
            "total_paid": 0.0,
            "unpaid_amount": 0.0,
            "item_total": 0.0,
            "delivery_total": 0.0,
            "is_official": False,
        })
        if _removed_business_is_order_official_for_app(row, official_identifiers):
            bucket["is_official"] = True
        bucket["total_orders"] += 1
        amount = float(row.amount or 0)
        if row.status not in {"cancelled"}:
            bucket["item_total"] += item_amount
            bucket["delivery_total"] += delivery_charge
        if row.status in {"paid", "cod_completed"}:
            bucket["total_paid"] += amount
        elif row.status in balance_statuses:
            bucket["unpaid_amount"] += amount
        display_phone = _removed_business_display_customer_phone(row.customer_phone)
        if not bucket["customer_phone"] and display_phone:
            bucket["customer_phone"] = display_phone
    return [schemas.RemovedBusinessCustomerSummaryResponse(**value) for value in grouped.values()]


@app.get("/removed_business/customers/detail", response_model=schemas.RemovedBusinessCustomerDetailResponse)
async def removed_business_customer_detail(
    customer_name: str = Query(..., min_length=1),
    customer_phone: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    balance_statuses = {"pending_payment", "payment_review", "cod_pending"}
    name = customer_name.strip()
    phone = (customer_phone or "").strip()

    query = (
        select(models.BusinessOrder)
        .where(models.BusinessOrder.user_id == current_user.id)
        .where(func.lower(func.coalesce(models.BusinessOrder.customer_name, "Walk-in Customer")) == name.lower())
        .order_by(models.BusinessOrder.created_at.desc(), models.BusinessOrder.id.desc())
    )
    if phone:
        query = query.where(models.BusinessOrder.customer_phone == phone)

    result = await db.execute(query)
    rows = list(result.scalars().all())
    if not rows:
        raise HTTPException(status_code=404, detail="Customer not found")

    total_paid = 0.0
    unpaid_amount = 0.0
    item_total = 0.0
    delivery_total = 0.0
    for row in rows:
        delivery_charge = max(0.0, float(row.delivery_charge or 0))
        item_amount = float(row.subtotal_amount) if row.subtotal_amount is not None else max(0.0, float(row.amount or 0) - delivery_charge)
        amount = float(row.amount or 0)
        if row.status not in {"cancelled"}:
            item_total += item_amount
            delivery_total += delivery_charge
        if row.status in {"paid", "cod_completed"}:
            total_paid += amount
        elif row.status in balance_statuses:
            unpaid_amount += amount

    official_identifiers = await _removed_business_load_official_identifiers_for_app(db, current_user.id)
    is_official = any(_removed_business_is_order_official_for_app(row, official_identifiers) for row in rows)

    orders: list[schemas.RemovedBusinessCustomerOrderHistoryResponse] = []
    for row in rows:
        delivery_charge = max(0.0, float(row.delivery_charge or 0))
        item_amount = float(row.subtotal_amount) if row.subtotal_amount is not None else max(0.0, float(row.amount or 0) - delivery_charge)
        orders.append(schemas.RemovedBusinessCustomerOrderHistoryResponse(
            id=int(row.id),
            order_no=row.order_no,
            amount=float(row.amount or 0),
            item_amount=item_amount,
            delivery_charge=delivery_charge,
            status=row.status,
            payment_method=row.payment_method,
            item_name=row.item_name,
            total_items=1,
            created_at=row.created_at,
        ))

    return schemas.RemovedBusinessCustomerDetailResponse(
        customer_name=(rows[0].customer_name or "Walk-in Customer").strip() or "Walk-in Customer",
        customer_phone=_removed_business_display_customer_phone(rows[0].customer_phone),
        total_orders=len(rows),
        total_paid=total_paid,
        unpaid_amount=unpaid_amount,
        item_total=item_total,
        delivery_total=delivery_total,
        latest_order_at=rows[0].created_at if rows else None,
        is_official=is_official,
        orders=orders,
    )

@app.get("/removed_business/audit", response_model=List[schemas.RemovedBusinessAuditLogResponse])
async def removed_business_audit_logs(
    limit: int = Query(default=100, ge=1, le=500),
    entity_type: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    query = select(models.BusinessAuditLog).where(models.BusinessAuditLog.user_id == current_user.id)
    if entity_type:
        query = query.where(models.BusinessAuditLog.entity_type == entity_type.strip())
    query = query.order_by(models.BusinessAuditLog.created_at.desc(), models.BusinessAuditLog.id.desc()).limit(limit)
    result = await db.execute(query)
    return [_removed_business_audit_log_response(row) for row in result.scalars().all()]


@app.get("/adminportal/users/{user_id}/audit", response_model=List[schemas.RemovedBusinessAuditLogResponse])
async def adminportal_user_audit_logs(
    user_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    entity_type: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    query = select(models.BusinessAuditLog).where(models.BusinessAuditLog.user_id == user_id)
    if entity_type:
        query = query.where(models.BusinessAuditLog.entity_type == entity_type.strip())
    query = query.order_by(models.BusinessAuditLog.created_at.desc(), models.BusinessAuditLog.id.desc()).limit(limit)
    result = await db.execute(query)
    return [_removed_business_audit_log_response(row) for row in result.scalars().all()]


@app.get("/adminportal/audit", response_model=List[schemas.RemovedBusinessAuditLogResponse])
async def adminportal_global_audit(
    include_order_name: bool = Query(default=True, include_in_schema=False),
    include_user_name: bool = Query(default=True, include_in_schema=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    entity_type: str | None = Query(default=None),
    action: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    query = select(models.BusinessAuditLog)
    if user_id:
        query = query.where(models.BusinessAuditLog.user_id == user_id.strip())
    if entity_type:
        query = query.where(models.BusinessAuditLog.entity_type == entity_type.strip())
    if action:
        query = query.where(models.BusinessAuditLog.action == action.strip())
    query = query.order_by(models.BusinessAuditLog.created_at.desc(), models.BusinessAuditLog.id.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    rows = result.scalars().all()
    # Resolve order names and user names
    order_ids = [int(row.entity_id) for row in rows if row.entity_type == "order" and row.entity_id]
    order_names: dict[int, str] = {}
    if order_ids:
        order_rows = list((await db.execute(
            select(models.BusinessOrder.id, models.BusinessOrder.order_no)
            .where(models.BusinessOrder.id.in_(order_ids))
        )).mappings().all())
        order_names = {int(r["id"]): (r["order_no"] or f"Order #{r['id']}") for r in order_rows}
    user_ids = set(row.user_id for row in rows if row.user_id)
    user_names: dict[str, str] = {}
    if include_user_name and user_ids:
        user_rows = list((await db.execute(
            select(models.User.id, models.User.name, models.User.email)
            .where(models.User.id.in_(list(user_ids)))
        )).mappings().all())
        user_names = {r["id"]: (r["name"] or r["email"] or r["id"][:8]) for r in user_rows}
    return [_removed_business_audit_log_response(row, include_order_name=include_order_name, order_name=order_names.get(int(row.entity_id) if row.entity_type == "order" else None), user_name=user_names.get(row.user_id)) for row in rows]



@app.get("/adminportal/access-logs", response_model=List[schemas.AccessLogResponse])
async def adminportal_access_logs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    ip: str | None = Query(default=None),
    path: str | None = Query(default=None),
    status_min: int | None = Query(default=None, ge=100, le=599),
    blocked: bool | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    query = select(models.AccessLog)
    if ip:
        query = query.where(models.AccessLog.ip_address == ip.strip())
    if path:
        query = query.where(models.AccessLog.path.contains(path.strip()))
    if status_min is not None:
        query = query.where(models.AccessLog.status_code >= status_min)
    if blocked is not None:
        query = query.where(models.AccessLog.is_blocked == blocked)
    result = await db.execute(query.order_by(models.AccessLog.created_at.desc(), models.AccessLog.id.desc()).limit(limit).offset(offset))
    rows = list(result.scalars().all())
    user_ids = [row.user_id for row in rows if row.user_id]
    users_by_id: dict[str, dict[str, str | None]] = {}
    if user_ids:
        user_rows = (await db.execute(select(models.User.id, models.User.name, models.User.email).where(models.User.id.in_(user_ids)))).mappings().all()
        users_by_id = {str(row["id"]): {"user_name": row["name"], "user_email": row["email"]} for row in user_rows}
    return [
        {
            "id": row.id,
            "ip_address": row.ip_address,
            "method": row.method,
            "path": row.path,
            "status_code": row.status_code,
            "user_id": row.user_id,
            "user_name": users_by_id.get(row.user_id or "", {}).get("user_name"),
            "user_email": users_by_id.get(row.user_id or "", {}).get("user_email"),
            "user_agent": row.user_agent,
            "is_blocked": row.is_blocked,
            "created_at": row.created_at,
        }
        for row in rows
    ]

@app.delete("/adminportal/access-logs")
async def adminportal_clear_access_logs(
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    await db.execute(sa_delete(models.AccessLog))
    await db.commit()
    asyncio.create_task(_notify_admin_telegram(f"Access logs cleared\nBy: {current_admin.email}"))
    return {"ok": True}

@app.get("/adminportal/security-summary")
async def adminportal_security_summary(
    hours: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    since = datetime.utcnow() - timedelta(hours=hours)
    result = await db.execute(
        select(models.AccessLog)
        .where(models.AccessLog.created_at >= since)
        .order_by(models.AccessLog.created_at.desc())
        .limit(2000)
    )
    rows = list(result.scalars().all())
    by_ip: dict[str, dict[str, Any]] = {}
    user_ids = {row.user_id for row in rows if row.user_id}
    users_by_id: dict[str, str] = {}
    if user_ids:
        user_rows = (await db.execute(select(models.User.id, models.User.name, models.User.email).where(models.User.id.in_(list(user_ids))))).mappings().all()
        users_by_id = {str(row["id"]): (row["name"] or row["email"] or str(row["id"])) for row in user_rows}
    for row in rows:
        ip_value = row.ip_address or "unknown"
        bucket = by_ip.setdefault(ip_value, {"ip_address": ip_value, "total": 0, "ok": 0, "errors": 0, "unauthorized": 0, "forbidden": 0, "blocked": 0, "paths": {}, "users": {}, "last_seen": row.created_at})
        bucket["total"] += 1
        if row.status_code < 400:
            bucket["ok"] += 1
        else:
            bucket["errors"] += 1
        if row.status_code == 401:
            bucket["unauthorized"] += 1
        if row.status_code == 403:
            bucket["forbidden"] += 1
        if row.is_blocked:
            bucket["blocked"] += 1
        bucket["paths"][row.path] = bucket["paths"].get(row.path, 0) + 1
        if row.user_id:
            user_label = users_by_id.get(row.user_id, row.user_id)
            bucket["users"][user_label] = bucket["users"].get(user_label, 0) + 1
        if row.created_at > bucket["last_seen"]:
            bucket["last_seen"] = row.created_at
    items = []
    for bucket in by_ip.values():
        suspicious_score = bucket["unauthorized"] * 2 + bucket["forbidden"] * 3 + bucket["blocked"] * 5 + max(0, bucket["errors"] - 5)
        top_paths = sorted(bucket["paths"].items(), key=lambda item: item[1], reverse=True)[:3]
        top_users = sorted(bucket["users"].items(), key=lambda item: item[1], reverse=True)[:3]
        items.append({**bucket, "paths": top_paths, "users": top_users, "suspicious_score": suspicious_score})
    items.sort(key=lambda item: (item["suspicious_score"], item["errors"], item["total"]), reverse=True)
    return {"hours": hours, "total_requests": len(rows), "items": items[:50]}

@app.get("/adminportal/ip-bans", response_model=List[schemas.IpBanResponse])
async def adminportal_ip_bans(db: AsyncSession = Depends(database.get_db), current_admin: models.User = Depends(get_adminportal_admin)):
    result = await db.execute(select(models.IpBan).order_by(models.IpBan.created_at.desc()))
    return result.scalars().all()

@app.post("/adminportal/ip-bans", response_model=schemas.IpBanResponse)
async def adminportal_create_ip_ban(payload: schemas.IpBanCreateRequest, db: AsyncSession = Depends(database.get_db), current_admin: models.User = Depends(get_adminportal_admin)):
    ip_value = payload.ip_address.strip()
    try:
        ipaddress.ip_address(ip_value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid IP address")
    row = await db.scalar(select(models.IpBan).where(models.IpBan.ip_address == ip_value))
    if row:
        row.is_active = True
        row.reason = payload.reason
        row.created_by_user_id = current_admin.id
    else:
        row = models.IpBan(ip_address=ip_value, reason=payload.reason, created_by_user_id=current_admin.id)
        db.add(row)
    await db.commit()
    await db.refresh(row)
    asyncio.create_task(_notify_admin_telegram(f"IP banned\nIP: {ip_value}\nBy: {current_admin.email}\nReason: {payload.reason or '-'}"))
    return row

@app.delete("/adminportal/ip-bans/{ban_id}")
async def adminportal_delete_ip_ban(ban_id: int, db: AsyncSession = Depends(database.get_db), current_admin: models.User = Depends(get_adminportal_admin)):
    row = await db.get(models.IpBan, ban_id)
    if not row:
        raise HTTPException(status_code=404, detail="IP ban not found")
    row.is_active = False
    await db.commit()
    return {"ok": True}

@app.get("/adminportal/telegram-settings", response_model=schemas.AdminPortalTelegramSettingsResponse)
async def adminportal_get_telegram_settings(db: AsyncSession = Depends(database.get_db), current_admin: models.User = Depends(get_adminportal_admin)):
    data = await _get_adminportal_telegram_settings(db)
    token = str(data.get("bot_token") or "").strip()
    return {**data, "bot_token": "", "bot_token_set": bool(token)}

@app.patch("/adminportal/telegram-settings", response_model=schemas.AdminPortalTelegramSettingsResponse)
async def adminportal_update_telegram_settings(payload: schemas.AdminPortalTelegramSettingsRequest, db: AsyncSession = Depends(database.get_db), current_admin: models.User = Depends(get_adminportal_admin)):
    current = await _get_adminportal_telegram_settings(db)
    token = (payload.bot_token or "").strip() or str(current.get("bot_token") or "").strip()
    data = {"bot_token": token, "admin_chat_id": (payload.admin_chat_id or "").strip(), "access_log_alerts": bool(payload.access_log_alerts), "alert_status_min": int(payload.alert_status_min), "alert_path_contains": (payload.alert_path_contains or "").strip()}
    row = await db.scalar(select(models.UserSetting).where(models.UserSetting.user_id == current_admin.id, models.UserSetting.key == ADMINPORTAL_TELEGRAM_SETTING_KEY))
    if row:
        row.value = json.dumps(data, ensure_ascii=False)
    else:
        db.add(models.UserSetting(user_id=current_admin.id, key=ADMINPORTAL_TELEGRAM_SETTING_KEY, value=json.dumps(data, ensure_ascii=False)))
    await db.commit()
    if data["admin_chat_id"] and token:
        asyncio.create_task(_notify_admin_telegram("AdminPortal Telegram setting saved."))
    return {**data, "bot_token": "", "bot_token_set": bool(token)}

@app.get("/notice-banners", response_model=schemas.NoticeBannerSettings)
async def get_notice_banners(db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _get_notice_banner_settings(db)

@app.get("/adminportal/notice-banners", response_model=schemas.NoticeBannerSettings)
async def adminportal_get_notice_banners(db: AsyncSession = Depends(database.get_db), current_admin: models.User = Depends(get_adminportal_admin)):
    return await _get_notice_banner_settings(db)

@app.patch("/adminportal/notice-banners", response_model=schemas.NoticeBannerSettings)
async def adminportal_update_notice_banners(payload: schemas.NoticeBannerSettings, db: AsyncSession = Depends(database.get_db), current_admin: models.User = Depends(get_adminportal_admin)):
    data = payload.model_dump()
    value = json.dumps(data, ensure_ascii=False)
    # Canonical write: keep a single newest row, drop stale duplicates so GET
    # (which reads the latest row for this key across all users) cannot flip
    # back to an older enabled banner.
    rows = (
        await db.scalars(
            select(models.UserSetting)
            .where(models.UserSetting.key == ADMINPORTAL_NOTICE_BANNER_SETTING_KEY)
            .order_by(models.UserSetting.updated_at.desc())
        )
    ).all()
    if rows:
        keep = rows[0]
        keep.user_id = current_admin.id
        keep.value = value
        keep.updated_at = datetime.utcnow()
        for stale in rows[1:]:
            await db.delete(stale)
    else:
        db.add(models.UserSetting(user_id=current_admin.id, key=ADMINPORTAL_NOTICE_BANNER_SETTING_KEY, value=value))
    await db.commit()
    return data

@app.patch("/adminportal/users/{user_id}/status")
async def adminportal_update_user_status(
    user_id: str,
    payload: dict,
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    user = await db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Cannot deactivate admin accounts")
    is_active = payload.get("is_active")
    if not isinstance(is_active, bool):
        raise HTTPException(status_code=422, detail="is_active must be a boolean")
    user.is_active = is_active
    await db.commit()
    await db.refresh(user)
    return {"user_id": user.id, "is_active": user.is_active, "name": user.name, "email": user.email}


@app.get("/adminportal/users/{user_id}", response_model=schemas.AdminPortalUserResponse)
async def adminportal_user_detail(
    user_id: str,
    db: AsyncSession = Depends(database.get_db),
    current_admin: models.User = Depends(get_adminportal_admin),
):
    user = await db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    setting = await db.scalar(select(models.UserSetting).where(
        models.UserSetting.user_id == user_id,
        models.UserSetting.key == ADMINPORTAL_REMOVED_BUSINESS_ACCESS_SETTING_KEY,
    ))
    request_setting = await db.scalar(select(models.UserSetting).where(
        models.UserSetting.user_id == user_id,
        models.UserSetting.key == REMOVED_BUSINESS_ACCESS_REQUEST_SETTING_KEY,
    ))
    profile_request_setting = await db.scalar(select(models.UserSetting).where(
        models.UserSetting.user_id == user_id,
        models.UserSetting.key == REMOVED_BUSINESS_PROFILE_CHANGE_REQUEST_SETTING_KEY,
    ))
    payment_setting = await db.scalar(select(models.BusinessPaymentSetting).where(
        models.BusinessPaymentSetting.user_id == user_id,
    ))
    req = _parse_removed_business_access_request(request_setting) if request_setting else {}
    profile_req = _parse_removed_business_access_request(profile_request_setting) if profile_request_setting else {}
    removed_business_enabled = _removed_business_env_access_enabled(user) or bool(user.is_admin) or _user_setting_enabled(setting)
    return _adminportal_user_response(
        user, removed_business_enabled,
        req.get("business_type"), getattr(payment_setting, "brand_name", None),
        req.get("business_name"), req.get("business_description"),
        req.get("whatsapp_customer_per_day"), req.get("whatsapp_use_case"),
        req.get("current_tools"), profile_req.get("requested_brand_name"),
        profile_req.get("requested_business_type"),
    )

def _removed_business_is_receipt_like_text(text: str) -> bool:
    return _module_removed_business_is_receipt_like_text(text)


def _removed_business_is_order_confirm_text(text: str) -> bool:
    return _module_removed_business_is_order_confirm_text(text)



def _removed_business_normalize_phone(phone: str | None) -> str | None:
    value = re.sub(r"[^0-9+]", "", (phone or "").strip())
    return value or None


def _removed_business_is_plausible_phone_digits(digits: str) -> bool:
    cleaned = re.sub(r"[^0-9]", "", digits or "")
    if not cleaned:
        return False
    if len(cleaned) < 8 or len(cleaned) > 15:
        return False
    if cleaned == (cleaned[:1] * len(cleaned)):
        return False
    return True


def _removed_business_extract_whatsapp_phone_from_value(value: Any, *, allow_group: bool = False) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    lowered = raw.lower()
    if lowered in {"status@broadcast", "broadcast"}:
        return None
    body = raw
    domain = ""
    if "@" in raw:
        body, domain = raw.split("@", 1)
        domain = domain.strip().lower()
        if domain == "g.us" and not allow_group:
            return None
        if domain and domain not in {"s.whatsapp.net", "c.us", "g.us", "lid"}:
            return None
    body = body.split(":", 1)[0].strip()
    digits = re.sub(r"[^0-9+]", "", body)
    if digits.startswith("+"):
        digits = digits[1:]
    if digits.startswith("00"):
        digits = digits[2:]
    if not _removed_business_is_plausible_phone_digits(digits):
        return None
    return digits


def _removed_business_extract_whatsapp_customer_phone(payload: dict[str, Any]) -> str | None:
    direct_keys = (
        "customer_phone", "phone", "from", "sender", "sender_phone", "from_number",
        "author", "participant", "jid", "remote_jid", "remoteJid", "chat_id", "wa_id",
    )
    candidates: list[Any] = []

    def push(value: Any) -> None:
        if value is None:
            return
        if isinstance(value, (dict, list, tuple, set)):
            return
        text = str(value).strip()
        if not text:
            return
        candidates.append(text)

    def collect_map(node: Any) -> None:
        if not isinstance(node, dict):
            return
        for key in direct_keys:
            push(node.get(key))
        key_node = node.get("key")
        if isinstance(key_node, dict):
            for key in direct_keys:
                push(key_node.get(key))

    collect_map(payload)
    for root_key in ("message", "data", "event", "msg", "value", "sender", "contact", "context"):
        collect_map(payload.get(root_key))

    for value in candidates:
        parsed = _removed_business_extract_whatsapp_phone_from_value(value, allow_group=False)
        if parsed:
            return parsed

    fallback = str(payload.get("phone") or payload.get("customer_phone") or "").strip() or None
    if fallback and "@g.us" in fallback.lower():
        return None
    normalized = _removed_business_normalize_phone(fallback)
    if normalized and (len(normalized) < 8 or len(normalized) > 15):
        return None
    return normalized

def _removed_business_display_customer_phone(phone: str | None) -> str | None:
    parsed = _module_removed_business_extract_whatsapp_phone_from_value(phone, allow_group=False)
    return parsed


_REMOVED_BUSINESS_DELIVERY_META_MARKER = "<!--REMOVED_BUSINESS_DELIVERY:"


def _removed_business_parse_delivery_meta(note: str | None) -> tuple[str | None, dict[str, Any]]:
    raw = str(note or "")
    start = raw.find(_REMOVED_BUSINESS_DELIVERY_META_MARKER)
    if start < 0:
        return (raw or None), {}
    end = raw.find("-->", start)
    if end < 0:
        return (raw or None), {}
    body = raw[:start].rstrip() or None
    meta_raw = raw[start + len(_REMOVED_BUSINESS_DELIVERY_META_MARKER):end].strip()
    try:
        meta = json.loads(meta_raw) if meta_raw else {}
    except Exception:
        meta = {}
    return body, meta if isinstance(meta, dict) else {}


def _removed_business_merge_delivery_meta(note: str | None, **updates: Any) -> str | None:
    clean_note, meta = _removed_business_parse_delivery_meta(note)
    meta.update({k: v for k, v in updates.items()})
    meta = {k: v for k, v in meta.items() if v is not None and v != ""}
    if not meta:
        return clean_note
    marker = f"{_REMOVED_BUSINESS_DELIVERY_META_MARKER}{json.dumps(meta, ensure_ascii=False)}-->"
    return f"{clean_note}\n\n{marker}".strip() if clean_note else marker


async def _removed_business_get_delivery_settings(db: AsyncSession, user_id: str) -> dict[str, Any]:
    result = await db.execute(select(models.UserSetting).where(models.UserSetting.user_id == user_id, models.UserSetting.key == 'removed_business_delivery_settings'))
    row = result.scalars().first()
    if not row or not row.value:
        return {}
    try:
        data = json.loads(row.value)
    except Exception:
        data = {}
    return data if isinstance(data, dict) else {}


async def _removed_business_set_delivery_settings(db: AsyncSession, user_id: str, payload: dict[str, Any]) -> None:
    result = await db.execute(select(models.UserSetting).where(models.UserSetting.user_id == user_id, models.UserSetting.key == 'removed_business_delivery_settings'))
    row = result.scalars().first()
    if row is None:
        row = models.UserSetting(user_id=user_id, key='removed_business_delivery_settings', value='{}')
        db.add(row)
        await db.flush()
    row.value = json.dumps(payload, ensure_ascii=False)
    await db.flush()
async def _removed_business_find_recent_duplicate_order(
    db: AsyncSession,
    *,
    user_id: str,
    source: str,
    customer_name: str | None,
    customer_phone: str | None,
    item_name: str,
    raw_message: str,
    quantity: float | None,
    amount: float | None,
    payment_method: str | None,
    within_seconds: int = 300,
) -> models.BusinessOrder | None:
    return await _module_removed_business_find_recent_duplicate_order(
        db,
        user_id=user_id,
        source=source,
        customer_name=customer_name,
        customer_phone=customer_phone,
        item_name=item_name,
        raw_message=raw_message,
        quantity=quantity,
        amount=amount,
        payment_method=payment_method,
        within_seconds=within_seconds,
        normalize_phone=_removed_business_normalize_phone,
    )


def _removed_business_item_key(item_name: str | None) -> str:
    return _module_removed_business_item_key(item_name)



def _removed_business_item_qty_map_from_payload(items: list[dict[str, Any]]) -> dict[str, float]:
    return _module_removed_business_item_qty_map_from_payload(items, decimal_2=_removed_business_decimal_2)



def _removed_business_item_qty_map_from_rows(rows: list[models.BusinessOrderItem]) -> dict[str, float]:
    return _module_removed_business_item_qty_map_from_rows(rows, decimal_2=_removed_business_decimal_2)



def _removed_business_incoming_extends_existing_items(
    existing_rows: list[models.BusinessOrderItem],
    normalized_items: list[dict[str, Any]],
) -> bool:
    return _module_removed_business_incoming_extends_existing_items(
        existing_rows,
        normalized_items,
        decimal_2=_removed_business_decimal_2,
    )



async def _removed_business_find_open_customer_order(
    db: AsyncSession,
    *,
    user_id: str,
    source: str,
    customer_name: str | None,
    customer_phone: str | None,
) -> models.BusinessOrder | None:
    return await _module_removed_business_find_open_customer_order(
        db,
        user_id=user_id,
        source=source,
        customer_name=customer_name,
        customer_phone=customer_phone,
        normalize_phone=_removed_business_normalize_phone,
    )



async def _removed_business_replace_order_items(
    db: AsyncSession,
    *,
    user_id: str,
    order_id: int,
    parsed_item_name: str,
    normalized_items: list[dict[str, Any]],
) -> None:
    return await _module_removed_business_replace_order_items(
        db,
        user_id=user_id,
        order_id=order_id,
        parsed_item_name=parsed_item_name,
        normalized_items=normalized_items,
        decimal_2=_removed_business_decimal_2,
    )



async def _removed_business_has_matching_product_keyword(
    db: AsyncSession,
    user_id: str,
    text: str,
) -> bool:
    return await _module_removed_business_has_matching_product_keyword(
        db,
        user_id,
        text,
        parse_aliases=_removed_business_parse_aliases,
    )



async def _removed_business_match_product_hint(
    db: AsyncSession,
    user_id: str,
    item_name: str,
) -> tuple[str, str | None, int | None]:
    return await _module_removed_business_match_product_hint(
        db,
        user_id,
        item_name,
        parse_aliases=_removed_business_parse_aliases,
    )


def _removed_business_render_order_reply_lines(
    order: models.BusinessOrder,
    order_items: list[models.BusinessOrderItem],
) -> str:
    return _module_removed_business_render_order_reply_lines(
        order,
        order_items,
        fmt_number=_fmt_number,
    )

def _render_pdf_receipt(order: models.BusinessOrder, items: list[models.BusinessOrderItem], total: float, brand_name: str | None = None, user_lang: str | None = None) -> bytes:
    pdf = bytearray()
    def w(s: str):
        pdf.extend(s.encode("utf-8") if isinstance(s, str) else s)
    def obj_ref(n: int):
        return f"{n} 0 R"
    objects: list[bytes] = []
    objects.append(b"")  # index 0 unused
    # Font: use built-in Courier (no embedding needed)
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Oblique >>")
    def text_obj(x: float, y: float, font_obj: int, size: float, txt: str) -> bytes:
        escaped = txt.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        return f"BT\n/F{font_obj} {size} Tf\n{x} {y} Td\n({escaped}) Tj\nET\n".encode()
    def line(x1: float, y1: float, x2: float, y2: float, w_pt: float = 0.5) -> bytes:
        return f"{w_pt} w\n{x1} {y1} m\n{x2} {y2} l\nS\n".encode()
    page_w = 227.0  # 80mm thermal receipt width
    page_h = 842.0
    margin = 14.0
    y = page_h - margin
    left = margin
    right = page_w - margin
    content: list[bytes] = []
    def text_l(x: float, ypos: float, font_idx: int, size: float, txt: str):
        return text_obj(x, ypos, font_idx, size, txt)
    def text_c(ypos: float, font_idx: int, size: float, txt: str):
        w_txt = len(txt) * size * 0.6
        return text_obj((page_w - w_txt) / 2, ypos, font_idx, size, txt)
    def text_r(ypos: float, font_idx: int, size: float, txt: str):
        w_txt = len(txt) * size * 0.6
        return text_obj(right - w_txt, ypos, font_idx, size, txt)
    def hr(ypos: float):
        return line(left, ypos, right, ypos)
    is_en = (user_lang or "").strip().upper() == "EN"
    # Header
    title = (brand_name.strip() or ("RECEIPT" if is_en else "RESIT RASMI")) if brand_name else ("RECEIPT" if is_en else "RESIT RASMI")
    content.append(text_c(y, 2, 12, title))
    y -= 18
    content.append(text_c(y, 1, 8, order.order_no or f"#{order.id}"))
    y -= 14
    content.append(hr(y))
    y -= 10
    content.append(text_l(left, y, 2, 8, ("Date:" if is_en else "Tarikh:")))
    kl_created = order.created_at.replace(tzinfo=timezone.utc).astimezone(timezone(timedelta(hours=8))) if order.created_at else order.created_at
    content.append(text_r(y, 1, 8, kl_created.strftime("%d/%m/%Y %I:%M %p") if kl_created else "-"))
    y -= 14
    content.append(text_l(left, y, 2, 8, ("Name:" if is_en else "Nama:")))
    content.append(text_r(y, 1, 8, (order.customer_name or "-")[:30]))
    y -= 14
    y -= 4
    content.append(hr(y))
    y -= 10
    # Column headers
    content.append(text_l(left, y, 2, 7, "Item"))
    content.append(text_r(y, 1, 7, ("Qty" if is_en else "Jumlah")))
    y -= 12
    content.append(hr(y))
    y -= 8
    # Items
    receipt_total = 0.0
    for it in items:
        qty = float(it.quantity or 0)
        price = float(it.unit_price or 0)
        subtotal = qty * price
        receipt_total += subtotal
        name = it.item_name[:24]
        content.append(text_l(left, y, 1, 7, name))
        y -= 11
        content.append(text_l(left + 4, y, 1, 6.5, f"{qty:g} x RM{price:,.2f}"))
        content.append(text_r(y, 1, 6.5, f"RM{subtotal:,.2f}"))
        y -= 13
    if order.delivery_charge:
        dc = float(order.delivery_charge)
        receipt_total += dc
        y -= 2
        content.append(text_l(left, y, 1, 7, ("Delivery Fee" if is_en else "Caj Delivery")))
        content.append(text_r(y, 1, 7, f"RM{dc:,.2f}"))
        y -= 12
        if order.delivery_distance_km:
            content.append(text_l(left + 4, y, 1, 6, f"({order.delivery_distance_km} km)"))
            y -= 10
    y -= 2
    content.append(hr(y))
    y -= 10
    content.append(text_l(left, y, 2, 10, ("TOTAL" if is_en else "JUMLAH")))
    content.append(text_r(y, 2, 10, f"RM{receipt_total:,.2f}"))
    y -= 18
    content.append(hr(y))
    y -= 12
    mode_label = ("Pickup" if order.order_mode == "pickup" else "Delivery" if order.order_mode == "delivery" else "-")
    content.append(text_l(left, y, 2, 6.5, ("Mode:" if is_en else "Mode:")))
    content.append(text_r(y, 1, 6.5, mode_label))
    y -= 12
    if order.payment_method:
        content.append(text_l(left, y, 2, 6.5, ("Payment:" if is_en else "Bayaran:")))
        content.append(text_r(y, 1, 6.5, order.payment_method.upper()))
        y -= 12
    y -= 8
    content.append(text_c(y, 3, 7, ("Thank you for your purchase!" if is_en else "Terima kasih atas pembelian!")))
    # Build page content stream
    stream = b"\n".join(content)
    stream_len = len(stream)
    objects.append(f"<< /Length {stream_len} >>\nstream\n".encode() + stream + b"\nendstream")
    content_obj = len(objects) - 1
    # Page
    objects.append(
        f"<< /Type /Page /Parent {obj_ref(len(objects)+1)} /MediaBox [0 0 {page_w} {page_h}] /Contents {obj_ref(content_obj)} /Resources << /Font << /F1 {obj_ref(1)} /F2 {obj_ref(2)} /F3 {obj_ref(3)} >> >> >>".encode()
    )
    page_obj = len(objects) - 1
    # Pages
    objects.append(f"<< /Type /Pages /Kids [{obj_ref(page_obj)}] /Count 1 >>".encode())
    pages_obj = len(objects) - 1
    # Catalog
    objects.append(f"<< /Type /Catalog /Pages {obj_ref(pages_obj)} >>".encode())
    catalog_obj = len(objects) - 1
    # Build PDF
    out = bytearray()
    out.extend(b"%PDF-1.4\n")
    offsets: list[int] = [0]
    for i in range(1, len(objects)):
        offsets.append(len(out))
        out.extend(f"{i} 0 obj\n".encode())
        out.extend(objects[i])
        out.extend(b"\nendobj\n")
    xref_offset = len(out)
    out.extend(f"xref\n0 {len(objects)}\n".encode())
    out.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode())
    out.extend(f"trailer << /Size {len(objects)} /Root {obj_ref(catalog_obj)} >>\nstartxref\n{xref_offset}\n%%EOF".encode())
    return bytes(out)


def _removed_business_build_receipt_text(order: models.BusinessOrder, items: list[models.BusinessOrderItem]) -> str:
    lines: list[str] = []
    lines.append("RESIT RASMI")
    lines.append("")
    lines.append(f"No Order : {order.order_no or '#' + str(order.id)}")
    lines.append(f"Tarikh  : {order.created_at.strftime('%d/%m/%Y %I:%M %p')}")
    lines.append(f"Nama    : {order.customer_name or '-'}")
    lines.append("")
    lines.append("ITEM")
    total = 0.0
    for it in items:
        qty = float(it.quantity or 0)
        price = float(it.unit_price or 0)
        subtotal = qty * price
        total += subtotal
        lines.append(f"  {it.item_name}")
        lines.append(f"  {qty:g} x RM{price:,.2f}  =  RM{subtotal:,.2f}")
    if order.delivery_charge:
        dc = float(order.delivery_charge)
        total += dc
        if order.delivery_distance_km:
            lines.append(f"  Caj Delivery ({order.delivery_distance_km} km) : RM{dc:,.2f}")
        else:
            lines.append(f"  Caj Delivery : RM{dc:,.2f}")
    lines.append("──────────────────")
    lines.append(f"JUMLAH : RM{total:,.2f}")
    if order.order_mode:
        mode_label = "Pickup" if order.order_mode == "pickup" else "Delivery"
        lines.append(f"Mode    : {mode_label}")
    if order.payment_method:
        lines.append(f"Bayaran : {order.payment_method.upper()}")
    lines.append("──────────────────")
    lines.append("")
    lines.append("Terima kasih atas pembelian!")
    return "\n".join(lines)


def _removed_business_render_receipt_html(order: models.BusinessOrder, items: list[models.BusinessOrderItem], request: Request, brand_name: str | None = None) -> HTMLResponse:
    total = 0.0
    item_rows = ""
    for it in items:
        qty = float(it.quantity or 0)
        price = float(it.unit_price or 0)
        subtotal = qty * price
        total += subtotal
        item_rows += f"""<tr>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb">{it.item_name}</td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:center">{qty:g}</td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right">RM{price:,.2f}</td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right">RM{subtotal:,.2f}</td>
        </tr>"""
    delivery_row = ""
    if order.delivery_charge:
        dc = float(order.delivery_charge)
        total += dc
        dist = f" ({order.delivery_distance_km} km)" if order.delivery_distance_km else ""
        delivery_row = f"""<tr>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb">🛵 Caj Delivery{dist}</td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:center">1</td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right"></td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right">RM{dc:,.2f}</td>
        </tr>"""
    mode_label = "Pickup" if order.order_mode == "pickup" else "Delivery" if order.order_mode == "delivery" else "-"
    title = (brand_name.strip() or "RESIT RASMI") if brand_name else "RESIT RASMI"
    html = f"""<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Resit #{order.order_no or order.id}</title>
<style>
  * {{ margin:0; padding:0; box-sizing:border-box }}
  body {{ font-family: 'Segoe UI', system-ui, sans-serif; background:#f3f4f6; padding:20px; color:#1f2937 }}
  .receipt {{ max-width:420px; margin:0 auto; background:#fff; border-radius:16px; padding:28px 24px; box-shadow:0 4px 24px rgba(0,0,0,.08) }}
  h1 {{ font-size:20px; text-align:center; margin-bottom:4px }}
  .subtitle {{ text-align:center; color:#6b7280; font-size:12px; margin-bottom:20px }}
  .meta {{ font-size:13px; margin-bottom:16px }}
  .meta td {{ padding:2px 6px 2px 0 }}
  .meta td:first-child {{ color:#6b7280; white-space:nowrap }}
  table {{ width:100%; border-collapse:collapse }}
  th {{ font-size:11px; text-transform:uppercase; color:#6b7280; text-align:left; padding:8px 0; border-bottom:2px solid #e5e7eb }}
  th:last-child, th:nth-child(3) {{ text-align:right }}
  th:nth-child(2) {{ text-align:center }}
  .total-row td {{ font-size:16px; font-weight:700; padding:12px 0 4px }}
  .total-row td:last-child {{ text-align:right }}
  .footer {{ text-align:center; color:#6b7280; font-size:12px; margin-top:20px; border-top:1px solid #e5e7eb; padding-top:16px }}
  @media print {{
    body {{ background:#fff; padding:0 }}
    .receipt {{ box-shadow:none; border-radius:0; max-width:100% }}
  }}
</style>
</head>
<body>
<div class="receipt">
  <h1>🧾 {title}</h1>
  <p class="subtitle">{order.order_no or '#' + str(order.id)}</p>
  <table class="meta">
    <tr><td>Tarikh</td><td>: {order.created_at.strftime('%d/%m/%Y %I:%M %p')}</td></tr>
    <tr><td>Nama</td><td>: {order.customer_name or '-'}</td></tr>
    {('<tr><td>Telefon</td><td>: ' + (order.customer_phone or '') + '</td></tr>') if order.customer_phone else ''}
    <tr><td>Mode</td><td>: {mode_label}</td></tr>
    {('<tr><td>Bayaran</td><td>: ' + (order.payment_method or '').upper() + '</td></tr>') if order.payment_method else ''}
  </table>
  <table>
    <thead><tr><th>Item</th><th>Qty</th><th>Harga</th><th>Jumlah</th></tr></thead>
    <tbody>
      {item_rows}
      {delivery_row}
    </tbody>
  </table>
  <table>
    <tr class="total-row"><td>Jumlah</td><td></td><td></td><td>RM{total:,.2f}</td></tr>
  </table>
  <p class="footer">Terima kasih atas pembelian!</p>
</div>
</body>
</html>"""
    filename = f"{order.order_no or order.id}.pdf"
    pdf_bytes = _render_pdf_receipt(order, items, total)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )



def _removed_business_apply_order_lines_inside_caption(reply: str | None, order_lines: str) -> str:
    return _module_removed_business_apply_order_lines_inside_caption(reply, order_lines)



def _removed_business_compose_order_reply(base_reply: str | None, order_lines: str) -> str:
    return _module_removed_business_compose_order_reply(
        base_reply,
        order_lines,
        ensure_confirm_reply=_removed_business_ensure_confirm_reply,
    )



async def _removed_business_build_auto_reply(
    db: AsyncSession,
    user_id: str,
    order: models.BusinessOrder,
    *,
    payment_review: bool = False,
) -> dict[str, Any]:
    return await _module_removed_business_build_auto_reply(
        db,
        user_id,
        order,
        payment_review=payment_review,
        load_order_items=_removed_business_load_order_items,
        render_order_reply_lines=_removed_business_render_order_reply_lines,
        compose_order_reply=_removed_business_compose_order_reply,
        apply_order_lines_inside_caption=_removed_business_apply_order_lines_inside_caption,
    )


async def _removed_business_handle_incoming_order_payload(
    db: AsyncSession,
    *,
    user_id: str,
    source: str,
    text: str,
    customer_name: str | None,
    customer_phone: str | None,
    receipt_url: str | None = None,
    has_receipt_media: bool = False,
    receipt_payload: bytes | None = None,
    receipt_mime_type: str | None = None,
    receipt_file_name: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    location_name: str | None = None,
    bypass_whatsapp_prefix: bool = False,
) -> dict[str, Any]:
    result = await _module_handle_incoming_order_payload(
        db,
        user_id=user_id,
        source=source,
        text=text,
        customer_name=customer_name,
        customer_phone=customer_phone,
        receipt_url=receipt_url,
        has_receipt_media=has_receipt_media,
        receipt_payload=receipt_payload,
        receipt_mime_type=receipt_mime_type,
        receipt_file_name=receipt_file_name,
        latitude=latitude,
        longitude=longitude,
        location_name=location_name,
        bypass_whatsapp_prefix=bypass_whatsapp_prefix,
        _removed_business_apply_whatsapp_prefix=_removed_business_apply_whatsapp_prefix,
        _removed_business_is_order_confirm_text=_removed_business_is_order_confirm_text,
        _removed_business_find_open_customer_order=_removed_business_find_open_customer_order,
        _removed_business_ensure_confirm_reply=_removed_business_ensure_confirm_reply,
        _removed_business_load_order_items=_removed_business_load_order_items,
        _removed_business_render_order_reply_lines=_removed_business_render_order_reply_lines,
        _removed_business_compose_order_reply=_removed_business_compose_order_reply,
        _removed_business_build_auto_reply=_removed_business_build_auto_reply,
        _removed_business_build_qr_dispatch_message=_removed_business_build_qr_dispatch_message,
        _removed_business_apply_order_lines_inside_caption=_removed_business_apply_order_lines_inside_caption,
        _removed_business_should_ingest_whatsapp_message=_removed_business_should_ingest_whatsapp_message,
        _removed_business_has_matching_product_keyword=_removed_business_has_matching_product_keyword,
        _removed_business_store_receipt_payload=_removed_business_store_receipt_payload,
        _removed_business_is_receipt_like_text=_removed_business_is_receipt_like_text,
        _removed_business_order_snapshot=_removed_business_order_snapshot,
        _removed_business_write_audit_log=_removed_business_write_audit_log,
        _parse_business_order_from_text=_parse_business_order_from_text,
        _removed_business_split_order_message_segments=_removed_business_split_order_message_segments,
        _removed_business_match_product_hint=_removed_business_match_product_hint,
        _removed_business_suggest_order_amount=_removed_business_suggest_order_amount,
        _removed_business_decimal_2=_removed_business_decimal_2,
        _removed_business_normalize_phone=_removed_business_normalize_phone,
        _removed_business_find_recent_duplicate_order=_removed_business_find_recent_duplicate_order,
        _removed_business_status_from_payload=_removed_business_status_from_payload,
        _removed_business_replace_order_items=_removed_business_replace_order_items,
        _removed_business_incoming_extends_existing_items=_removed_business_incoming_extends_existing_items,
    )
    if isinstance(result, dict) and str(result.get("status") or "").strip().lower() == "confirmed_send_qr":
        try:
            order_id = result.get("order_id")
            if order_id is not None:
                order_result = await db.execute(select(models.BusinessOrder).where(models.BusinessOrder.id == int(order_id), models.BusinessOrder.user_id == user_id))
                order = order_result.scalar_one_or_none()
                settings_result = await db.execute(select(models.BusinessPaymentSetting).where(models.BusinessPaymentSetting.user_id == user_id))
                payment_settings = settings_result.scalar_one_or_none()
                if order and payment_settings and bool(getattr(payment_settings, "stripe_enabled", False)) and str(order.payment_method or "").strip().lower() != "cod":
                    session = await _removed_business_create_stripe_checkout_session(db, order)
                    checkout_url = str(session.get("url") or "").strip()
                    short_url = f"{APP_PUBLIC_URL}/p/{order.stripe_payment_short_token}" if getattr(order, "stripe_payment_short_token", None) else checkout_url
                    if short_url:
                        await db.commit()
                        lines = _removed_business_render_order_reply_lines(order, await _removed_business_load_order_items(db, user_id=user_id, order_id=int(order.id)))
                        amount = float(order.amount or 0)
                        result = dict(result)
                        result["reply"] = f"Order {order.order_no} confirmed.\nTotal: RM{amount:,.2f}\n\nPayment link:\n{short_url}" + (f"\n\nOrder:\n{lines}" if lines else "")
                        result["qr_image_url"] = None
                        result["payment_image_url"] = None
        except Exception as exc:
            result = dict(result)
            result["reply"] = f"{result.get('reply') or ''}\n\nStripe link failed: {exc}".strip()
    return await _removed_business_attach_whatsapp_step_header(db, result, source=source)


def _removed_business_step_from_status(status: str | None, order_status: str | None = None, note: str | None = None) -> tuple[str, str]:
    normalized_status = (status or "").strip().lower()
    normalized_order_status = (order_status or "").strip().lower()
    note_text = (note or "").lower()
    substeps = {
        "catalog_menu": "1.1",
        "catalog_updated": "1.2",
        "collecting_customer_note": "1.3",
        "catalog_order_cancelled": "1.4",
        "catalog_empty": "1.5",
        "checkout_stage_locked": "2.0",
        "order_mode_required": "2.1",
        "order_mode_required_repeat": "2.1",
        "order_mode_pickup_selected": "2.2",
        "order_mode_delivery_selected": "2.3",
        "delivery_address_required": "2.4",
        "delivery_location_saved": "2.5",
        "delivery_address_saved": "2.6",
        "confirmed_send_qr": "2.7",
        "confirm_without_qr": "2.7",
        "payment_review": "2.8",
        "checkout_stage_repeat": "2.9",
        "blocked_pending_order": "2.9",
        "blocked_active_order": "3.1",
        "paid": "3.2",
        "cod_pending": "3.2",
        "packing": "3.3",
        "ready_pickup": "3.4",
    }
    if normalized_status in substeps:
        step_no = substeps[normalized_status]
        label = "LOCKED" if step_no.startswith("3.") else "CHECKOUT" if step_no.startswith("2.") else "CUSTOMER NOTE" if step_no == "1.3" else "CART"
        return f"Step {step_no}", label
    if normalized_order_status in {"paid", "cod_pending", "packing", "ready_pickup"} or normalized_status in {"blocked_active_order", "paid", "cod_pending", "packing", "ready_pickup"}:
        return "Step 3.0", "LOCKED"
    if (
        normalized_order_status in {"pending_address", "pending_amount", "pending_payment", "payment_review"}
        or "checkout_stage" in note_text
        or "order_mode" in note_text
        or normalized_status.startswith("order_mode_")
        or normalized_status.startswith("delivery_")
        or normalized_status.startswith("checkout_")
        or normalized_status in {"confirmed_send_qr", "confirm_without_qr", "payment_review", "blocked_pending_order"}
    ):
        return "Step 2.0", "CHECKOUT"
    return "Step 1.0", "CART"


async def _removed_business_attach_whatsapp_step_header(db: AsyncSession, result: dict[str, Any], *, source: str) -> dict[str, Any]:
    if source not in {"whatsapp", "whatsapp_cloud"} or not isinstance(result, dict):
        return result
    if str(result.get("status") or "").startswith("automation_flow_"):
        return result
    reply = result.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        return result
    if reply.lstrip().lower().startswith("[step "):
        return result
    order_status = None
    note = None
    order_id = result.get("order_id")
    if order_id is not None:
        try:
            row_result = await db.execute(
                select(models.BusinessOrder.status, models.BusinessOrder.note).where(models.BusinessOrder.id == int(order_id))
            )
            row = row_result.first()
            if row:
                order_status = row[0]
                note = row[1]
        except Exception:
            order_status = None
            note = None
    step, label = _removed_business_step_from_status(str(result.get("status") or ""), order_status, note)
    extra_brand = ""
    if step == "Step 1.0" and order_id is not None:
        try:
            uid_result = await db.execute(
                select(models.BusinessOrder.user_id).where(models.BusinessOrder.id == int(order_id))
            )
            uid = uid_result.scalar()
            if uid:
                brand_result = await db.execute(
                    select(models.BusinessPaymentSetting.brand_name).where(models.BusinessPaymentSetting.user_id == uid)
                )
                brand_name = (brand_result.scalar() or "").strip()
                if brand_name:
                    extra_brand = f"\n*{brand_name.upper()}*\n{'_' * len(brand_name)}\n"
        except Exception:
            pass
    result = dict(result)
    result["reply"] = f"[{step} — {label}]{extra_brand}\n{reply.strip()}"
    return result

@app.api_route("/removed_business/api/inbox/webhook/{webhook_token}", methods=["GET", "POST"])
async def removed_business_cloud_inbox_webhook(
    webhook_token: str,
    request: Request,
):
    async with database.SessionLocal() as db:
        result = await db.execute(
            select(models.UserSetting).where(models.UserSetting.key == 'removed_business_whatsapp_cloud_api')
        )
        matched_user_id: str | None = None
        matched_payload: dict[str, Any] = {}
        for row in result.scalars().all():
            try:
                payload_data = json.loads(row.value or '{}')
            except Exception:
                payload_data = {}
            if str(payload_data.get('webhook_token') or '').strip() != webhook_token:
                continue
            matched_user_id = row.user_id
            matched_payload = payload_data if isinstance(payload_data, dict) else {}
            break

        if request.method == "GET":
            mode = str(request.query_params.get("hub.mode") or "").strip()
            verify_token = str(request.query_params.get("hub.verify_token") or "").strip()
            challenge = str(request.query_params.get("hub.challenge") or "").strip()
            expected_verify = str(matched_payload.get('verify_token') or '').strip()
            if matched_user_id and mode == 'subscribe' and expected_verify and hmac.compare_digest(expected_verify, verify_token):
                return PlainTextResponse(challenge or '')
            raise HTTPException(status_code=403, detail='Invalid webhook verify token')

        if not matched_user_id:
            raise HTTPException(status_code=404, detail='Webhook token not found')

        body = await request.json()
        print(f"[cloud-webhook][api][POST] token={webhook_token} body={json.dumps(body)[:1200]}")
        messages = _extract_cloud_api_messages(body if isinstance(body, dict) else {})
        print(f"[cloud-webhook][api][POST] messages={len(messages)}")
        results: list[dict[str, Any]] = []
        for message in messages:
            phone_number_id = str(message.get('phone_number_id') or '').strip() or str(matched_payload.get('phone_number_id') or '').strip()
            owner_user_id = await _resolve_cloud_api_user_id(db, phone_number_id) or matched_user_id
            incoming_phone = str(message.get('from') or '').strip() or None
            customer_phone = _removed_business_normalize_phone(incoming_phone)
            text_value = str(message.get('text') or '').strip()
            message_type = str(message.get('type') or '').strip().lower()
            has_receipt_media = message_type in {'image', 'document', 'video', 'audio', 'sticker'}
            receipt_payload = None
            receipt_mime_type = str(message.get('media_mime_type') or '').strip() or None
            receipt_file_name = str(message.get('media_file_name') or '').strip() or None
            if has_receipt_media:
                receipt_payload, receipt_mime_type, receipt_file_name = await _fetch_cloud_api_media_attachment(
                    access_token=str(matched_payload.get('access_token') or '').strip() or None,
                    media_id=str(message.get('media_id') or '').strip() or None,
                    fallback_mime_type=receipt_mime_type,
                    fallback_file_name=receipt_file_name,
                )
            latitude = message.get('latitude')
            longitude = message.get('longitude')
            location_name = str(message.get('location_name') or '').strip() or None
            customer_name = (str(message.get('customer_name') or '').strip() or None)

            is_from_owner = False
            if incoming_phone and owner_user_id:
                normalized_incoming = _removed_business_normalize_phone(incoming_phone)
                if normalized_incoming:
                    # 1) Check WhatsAppLink.phone (QR-linked number)
                    try:
                        owner_link = await db.execute(
                            select(models.WhatsAppLink).where(models.WhatsAppLink.user_id == owner_user_id)
                        )
                        owner_link_row = owner_link.scalar_one_or_none()
                        linked_phone = _removed_business_normalize_phone(getattr(owner_link_row, "phone", None))
                        if linked_phone and normalized_incoming == linked_phone:
                            is_from_owner = True
                    except Exception as exc:
                        print(f"[cloud-webhook][owner-detect] WhatsAppLink error: {exc}")
                    # 2) Check User.phone
                    if not is_from_owner:
                        try:
                            user_row = await db.execute(
                                select(models.User).where(models.User.id == owner_user_id)
                            )
                            user = user_row.scalar_one_or_none()
                            user_phone = _removed_business_normalize_phone(getattr(user, "phone", None))
                            if user_phone and normalized_incoming == user_phone:
                                is_from_owner = True
                        except Exception as exc:
                            print(f"[cloud-webhook][owner-detect] User.phone error: {exc}")
                    # 3) Check Cloud API display_phone_number
                    if not is_from_owner:
                        try:
                            display_phone = _removed_business_normalize_phone(str(matched_payload.get('display_phone_number') or '').strip() or None)
                            if display_phone and normalized_incoming == display_phone:
                                is_from_owner = True
                        except Exception as exc:
                            print(f"[cloud-webhook][owner-detect] display_phone error: {exc}")
                print(f"[cloud-webhook][owner-detect] incoming={incoming_phone!r} normalized={normalized_incoming!r} is_from_owner={is_from_owner} owner_user_id={owner_user_id!r}")

            if is_from_owner:
                result_payload = await _removed_business_handle_incoming_order_payload(
                    db,
                    user_id=owner_user_id,
                    source='whatsapp_cloud',
                    text=text_value,
                    customer_name=customer_name or "Owner",
                    customer_phone=customer_phone,
                    receipt_url=None,
                    has_receipt_media=has_receipt_media,
                    receipt_payload=receipt_payload,
                    receipt_mime_type=receipt_mime_type,
                    receipt_file_name=receipt_file_name,
                    latitude=float(latitude) if latitude is not None else None,
                    longitude=float(longitude) if longitude is not None else None,
                    location_name=location_name,
                    bypass_whatsapp_prefix=True,
                )
                reply_text = result_payload.get('reply') if isinstance(result_payload, dict) else None
                if reply_text and customer_phone:
                    print(f"[cloud-webhook][owner-chat] reply={str(reply_text)[:400]!r}")
                    ok, err = await _send_cloud_api_message(owner_user_id, customer_phone, str(reply_text), [])
                    print(f"[cloud-webhook][owner-chat][send] ok={ok} error={(err or '')[:400]!r}")
                results.append({
                    'message_id': message.get('message_id'),
                    'status': 'owner_chat',
                    'reply': reply_text,
                })
                continue

            await _removed_business_inbox_persist_message(
                db,
                user_id=owner_user_id,
                source_channel='whatsapp_cloud',
                customer_phone=customer_phone,
                customer_name=customer_name,
                direction='incoming',
                text=text_value,
                message_type=str(message.get('type') or '').strip() or None,
                external_message_id=str(message.get('message_id') or '').strip() or None,
            )
            result_payload = await _removed_business_handle_incoming_order_payload(
                db,
                user_id=owner_user_id,
                source='whatsapp_cloud',
                text=text_value,
                customer_name=customer_name,
                customer_phone=customer_phone,
                receipt_url=None,
                has_receipt_media=has_receipt_media,
                receipt_payload=receipt_payload,
                receipt_mime_type=receipt_mime_type,
                receipt_file_name=receipt_file_name,
                latitude=float(latitude) if latitude is not None else None,
                longitude=float(longitude) if longitude is not None else None,
                location_name=location_name,
            )
            if isinstance(result_payload, dict) and result_payload.get('order_id'):
                event_name = 'deleted' if result_payload.get('status') == 'catalog_order_cancelled' else 'updated'
                await _removed_business_publish_orders_event(owner_user_id, event_name, int(result_payload['order_id']))
            reply_text = result_payload.get('reply') if isinstance(result_payload, dict) else None
            qr_image_url = result_payload.get('qr_image_url') if isinstance(result_payload, dict) else None
            payment_image_url = result_payload.get('payment_image_url') if isinstance(result_payload, dict) else None
            catalog_image_url = result_payload.get('catalog_image_url') if isinstance(result_payload, dict) else None
            outbound_images = [url for url in [qr_image_url, payment_image_url, catalog_image_url] if isinstance(url, str) and url.strip()]
            send_ok = None
            send_error = None
            if reply_text and customer_phone:
                print(f"[cloud-webhook][reply] status={result_payload.get('status') if isinstance(result_payload, dict) else None} to={customer_phone} reply={str(reply_text)[:400]!r}")
                send_ok, send_error = await _send_cloud_api_message(owner_user_id, customer_phone, str(reply_text), outbound_images)
                if send_ok:
                    await _removed_business_inbox_persist_message(
                        db,
                        user_id=owner_user_id,
                        source_channel='whatsapp_cloud',
                        customer_phone=customer_phone,
                        customer_name=(str(message.get('customer_name') or '').strip() or None),
                        direction='outgoing',
                        text=str(reply_text),
                        message_type='text',
                        external_message_id=None,
                    )
                print(f"[cloud-webhook][send] ok={send_ok} error={(send_error or '')[:400]!r}")
            else:
                print(f"[cloud-webhook][reply-skip] status={result_payload.get('status') if isinstance(result_payload, dict) else None} has_reply={bool(reply_text)} phone={customer_phone!r}")
            results.append({
                'message_id': message.get('message_id'),
                'status': result_payload.get('status') if isinstance(result_payload, dict) else None,
                'reply': reply_text,
                'send_ok': send_ok,
                'send_error': send_error,
            })
        return {'ok': True, 'processed': len(results), 'results': results}

@app.post("/removed_business/telegram/webhook")
async def removed_business_telegram_webhook(
    payload: dict[str, Any],
    request: Request,
):
    return await _module_removed_business_telegram_webhook_route(
        payload=payload,
        request=request,
        removed_business_webhook_has_valid_secret=_removed_business_webhook_has_valid_secret,
        handle_removed_business_telegram_webhook=_module_handle_removed_business_telegram_webhook,
        session_factory=database.SessionLocal,
        resolve_removed_business_webhook_user_id=_resolve_removed_business_webhook_user_id,
        removed_business_webhook_receipt_fields=_removed_business_webhook_receipt_fields,
        removed_business_handle_incoming_order_payload=_removed_business_handle_incoming_order_payload,
    )


@app.post("/removed_business/whatsapp/webhook")
async def removed_business_whatsapp_webhook(
    payload: dict[str, Any],
    request: Request,
):
    result = await _module_removed_business_whatsapp_webhook_route(
        payload=payload,
        request=request,
        removed_business_webhook_has_valid_secret=_removed_business_webhook_has_valid_secret,
        handle_removed_business_whatsapp_webhook=_module_handle_removed_business_whatsapp_webhook,
        session_factory=database.SessionLocal,
        resolve_removed_business_webhook_user_id=_resolve_removed_business_webhook_user_id,
        removed_business_extract_whatsapp_customer_phone=_removed_business_extract_whatsapp_customer_phone,
        removed_business_webhook_receipt_fields=_removed_business_webhook_receipt_fields,
        removed_business_handle_incoming_order_payload=_removed_business_handle_incoming_order_payload,
    )
    if isinstance(result, dict) and result.get("order_id"):
        owner_user_id = await _resolve_removed_business_webhook_user_id(str(payload.get("user_id") or payload.get("owner_user_id") or "").strip() or None)
        if owner_user_id:
            await _removed_business_publish_orders_event(owner_user_id, "updated", int(result["order_id"]))
    return result


# Auth Endpoints
@app.post("/register", response_model=schemas.MessageResponse)
async def register(user_in: schemas.UserCreate, request: Request, db: AsyncSession = Depends(database.get_db)):
    return await _module_register_route(
        user_in=user_in,
        request=request,
        db=db,
        normalize_email=_normalize_email,
        enforce_auth_rate_limit=enforce_auth_rate_limit,
        validate_turnstile_token=validate_turnstile_token,
        validate_password_strength=validate_password_strength,
        is_disposable_email=_is_disposable_email,
        hash_email_verify_token=_hash_email_verify_token,
    )

@app.post("/login", response_model=schemas.Token)
async def login(login_data: schemas.LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(database.get_db)):
    return await _module_login_route(
        login_data=login_data,
        request=request,
        response=response,
        db=db,
        normalize_email=_normalize_email,
        enforce_auth_rate_limit=enforce_auth_rate_limit,
        validate_turnstile_token=validate_turnstile_token,
        is_mobile_user_agent=_is_mobile_user_agent,
        issue_auth_tokens_for_user=_issue_auth_tokens_for_user,
        set_auth_cookies=_set_auth_cookies,
        is_verify_grace_expired=_is_verify_grace_expired,
    )

@app.post("/auth/pin-login", response_model=schemas.Token)
async def pin_login(
    payload: schemas.PinLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_pin_login_route(
        payload=payload,
        request=request,
        response=response,
        db=db,
        normalize_email=_normalize_email,
        enforce_auth_rate_limit=enforce_auth_rate_limit,
        validate_turnstile_token=validate_turnstile_token,
        validate_pin_value=validate_pin_value,
        is_user_pin_locked=_is_user_pin_locked,
        record_pin_failed_attempt=_record_pin_failed_attempt,
        clear_user_pin_lock=_clear_user_pin_lock,
        is_mobile_user_agent=_is_mobile_user_agent,
        issue_auth_tokens_for_user=_issue_auth_tokens_for_user,
        set_auth_cookies=_set_auth_cookies,
        pin_lock_minutes=PIN_LOCK_MINUTES,
    )

@app.post("/auth/google", response_model=schemas.Token)
async def google_login(
    payload: schemas.GoogleLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(database.get_db),
):
    return await _handle_google_login(
        payload=payload,
        request=request,
        response=response,
        db=db,
        normalize_email=_normalize_email,
        issue_auth_tokens_for_user=_issue_auth_tokens_for_user,
        set_auth_cookies=_set_auth_cookies,
    )

@app.post("/auth/refresh", response_model=schemas.Token)
async def refresh_auth_token(
    payload: schemas.RefreshTokenRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_refresh_auth_token_route(
        payload=payload,
        request=request,
        response=response,
        db=db,
        enforce_auth_rate_limit=enforce_auth_rate_limit,
        auth_refresh_cookie_name=AUTH_REFRESH_COOKIE_NAME,
        clear_user_refresh_token=_clear_user_refresh_token,
        issue_auth_tokens_for_user=_issue_auth_tokens_for_user,
        set_auth_cookies=_set_auth_cookies,
    )

@app.post("/auth/logout")
async def logout_auth_session(
    response: Response,
    payload: schemas.LogoutRequest | None = None,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_logout_route(
        response=response,
        payload=payload,
        current_user=current_user,
        db=db,
        clear_user_refresh_token=_clear_user_refresh_token,
        clear_auth_cookies=_clear_auth_cookies,
    )

@app.get("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(database.get_db)):
    # Soft verification: confirms email ownership via a single-use link. Does not gate login.
    result = await db.execute(select(models.User).where(models.User.email_verify_token == _hash_email_verify_token(token)))
    user = result.scalars().first()
    if user is None or user.email_verified_at is not None or user.email_verify_token_expires is None:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    # If the user was auto-disabled because they never verified within the grace,
    # honour the link even if the token is now past its nominal expiry — the token
    # in the email is proof of email ownership, which is their only recovery path
    # (login is blocked while disabled, so they can't re-send).
    is_recovery = user.deactivated_reason == "email_verify_expired"
    if user.email_verify_token_expires < datetime.utcnow() and not is_recovery:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    user.email_verified_at = datetime.utcnow()
    user.email_verify_token = None
    user.email_verify_token_expires = None
    # Successful verification proves ownership; restore access if auto-disabled by grace expiry.
    if is_recovery:
        user.is_active = True
        user.deactivated_at = None
        user.deactivated_reason = None
    await db.commit()
    return {"message": "Email verified successfully", "email": user.email}


@app.post("/verify-email/resend")
async def resend_verify_email(
    request: Request,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    await enforce_auth_rate_limit("register", request, identity=current_user.email)
    now = datetime.utcnow()
    if current_user.email_verified_at is not None:
        return {"message": "Email already verified"}

    # Server-side resend cooldown (DB-sourced so device clock can't be spoofed).
    # First resend 60s; subsequent resends 300s.
    VERIFY_RESEND_COOLDOWN_SECONDS = 300 if current_user.verification_email_resend_count >= 1 else 60
    last_sent = current_user.verification_email_sent_at
    if last_sent is not None:
        elapsed = (now - last_sent).total_seconds()
        if elapsed < VERIFY_RESEND_COOLDOWN_SECONDS:
            remaining = max(1, int(VERIFY_RESEND_COOLDOWN_SECONDS - elapsed))
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {remaining}s before resending.",
                headers={"Retry-After": str(remaining)},
            )

    verify_token = secrets.token_urlsafe(32)[:43]
    current_user.email_verify_token = _hash_email_verify_token(verify_token)
    current_user.email_verify_token_expires = datetime.utcnow() + timedelta(days=EMAIL_VERIFY_GRACE_DAYS)
    current_user.verification_email_sent_at = now
    current_user.verification_email_resend_count += 1
    await db.commit()
    language = getattr(current_user, "language", "BM") or "BM"
    await email_service.send_email_verification_email(current_user.email, verify_token, current_user.name, language)
    return {"message": "Verification email sent"}


@app.post("/auth/forgot-password")
async def forgot_password(req: schemas.ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(database.get_db)):
    return await _module_forgot_password_route(
        req=req,
        request=request,
        db=db,
        normalize_email=_normalize_email,
        enforce_auth_rate_limit=enforce_auth_rate_limit,
        validate_turnstile_token=validate_turnstile_token,
        hash_reset_token=_hash_reset_token,
    )

@app.post("/auth/reset-password")
async def reset_password(req: schemas.ResetPasswordRequest, request: Request, db: AsyncSession = Depends(database.get_db)):
    return await _module_reset_password_route(
        req=req,
        request=request,
        db=db,
        enforce_auth_rate_limit=enforce_auth_rate_limit,
        validate_turnstile_token=validate_turnstile_token,
        validate_password_strength=validate_password_strength,
        hash_reset_token=_hash_reset_token,
        clear_user_pin=_clear_user_pin,
        clear_user_refresh_token=_clear_user_refresh_token,
    )

@app.get("/me", response_model=schemas.UserResponse)
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

# --- Helper: Ensure Wallet exists ---
async def ensure_wallet(db: AsyncSession, user_id: str):
    user = await db.get(models.User, user_id)
    stmt = select(models.Wallet).where(models.Wallet.owner_user_id == user_id)
    if user and user.default_household_id:
        stmt = select(models.Wallet).where(
            or_(models.Wallet.owner_user_id == user_id, models.Wallet.household_id == user.default_household_id)
        )
    res = await db.execute(stmt)
    wallet = res.scalars().first()
    if not wallet:
        try:
            wallet = models.Wallet(
                owner_user_id=user_id,
                name="Cash",
                type="personal"
            )
            db.add(wallet)
            await db.flush()
        except Exception:
            # Race: another request created it first — return the existing wallet.
            await db.rollback()
            existing = (await db.execute(stmt)).scalars().first()
            return existing
        await db.commit()
        await db.refresh(wallet)
    return wallet


def _normalize_whatsapp_group_jid(group_jid: str) -> str:
    value = (group_jid or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="Group JID is required")
    if "@" not in value:
        value = f"{value}@g.us"
    if not value.endswith("@g.us"):
        raise HTTPException(status_code=400, detail="Invalid WhatsApp group id")
    return value


def _normalize_group_prefix(prefix: str | None) -> str:
    value = (prefix or "bd").strip()
    if not value:
        raise HTTPException(status_code=400, detail="Trigger prefix is required")
    if len(value) > 20:
        raise HTTPException(status_code=400, detail="Trigger prefix is too long")
    if any(ch.isspace() for ch in value):
        raise HTTPException(status_code=400, detail="Trigger prefix cannot contain spaces")
    return value


def _normalize_personal_prefix(prefix: str | None) -> str:
    value = (prefix or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="Personal trigger prefix is required")
    if len(value) > 20:
        raise HTTPException(status_code=400, detail="Personal trigger prefix is too long")
    if any(ch.isspace() for ch in value):
        raise HTTPException(status_code=400, detail="Personal trigger prefix cannot contain spaces")
    return value


def _normalize_language(value: str | None) -> str:
    normalized = (value or "BM").strip().upper()
    if normalized not in {"EN", "BM"}:
        raise HTTPException(status_code=400, detail="Language must be EN or BM.")
    return normalized


def _normalize_theme_mode(value: str | None) -> str:
    normalized = (value or "system").strip().lower()
    if normalized not in {"dark", "light", "system"}:
        raise HTTPException(status_code=400, detail="Theme mode must be dark, light, or system.")
    return normalized


def _normalize_bot_personality(value: str | None) -> str | None:
    # Personalization is style-only; we keep it short and plain for predictable prompts.
    normalized = re.sub(r"\s+", " ", (value or "").strip())
    if not normalized:
        return None
    if len(normalized) > 160:
        raise HTTPException(status_code=400, detail="Bot personality is too long. Maximum 160 characters.")
    return normalized


def _strip_personal_prefix(text: str, prefix: str) -> str | None:
    clean_text = (text or "").strip()
    if not clean_text:
        return None
    prefix_value = (prefix or "").strip()
    if not prefix_value:
        return clean_text

    lowered_text = clean_text.lower()
    lowered_prefix = prefix_value.lower()
    if lowered_text == lowered_prefix:
        return ""
    if lowered_text.startswith(f"{lowered_prefix} "):
        return clean_text[len(prefix_value):].lstrip()
    return None


async def _get_personal_prefix_mode_settings(
    db: AsyncSession,
    *,
    user_id: str,
) -> tuple[bool, str]:
    result = await db.execute(
        select(
            models.User.personal_bot_prefix_enabled,
            models.User.personal_bot_prefix,
        ).where(models.User.id == user_id)
    )
    row = result.one_or_none()
    if row is None:
        return False, "bd"

    is_enabled = bool(row[0])
    prefix = (row[1] or "").strip() or "bd"
    return is_enabled, prefix


async def _get_whatsapp_group_rule(rule_id: int, current_user: models.User, db: AsyncSession) -> models.WhatsAppGroupRule:
    result = await db.execute(
        select(models.WhatsAppGroupRule).where(
            models.WhatsAppGroupRule.id == rule_id,
            models.WhatsAppGroupRule.user_id == current_user.id,
        )
    )
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail="WhatsApp group rule not found")
    return rule


async def _get_whatsapp_group_privacy_settings(
    db: AsyncSession,
    *,
    user_id: str,
    group_jid: str | None,
) -> tuple[bool, bool, bool]:
    if not group_jid:
        return True, True, True

    normalized_group_jid = _normalize_whatsapp_group_jid(group_jid)
    result = await db.execute(
        select(
            models.WhatsAppGroupRule.show_current_balance,
            models.WhatsAppGroupRule.show_expense_amount,
            models.WhatsAppGroupRule.show_income_amount,
        ).where(
            models.WhatsAppGroupRule.user_id == user_id,
            models.WhatsAppGroupRule.group_jid == normalized_group_jid,
            models.WhatsAppGroupRule.is_enabled == True,
        )
    )
    row = result.one_or_none()
    if row is None:
        return False, False, False
    return bool(row[0]), bool(row[1]), bool(row[2])


async def _ensure_current_user_household(db: AsyncSession, current_user: models.User) -> int:
    # Legacy compatibility layer:
    # the product no longer surfaces "Households" to end users, but existing
    # category/budget rows still use household_id as the internal scope key.
    household_id = await whatsapp_service.ensure_standard_categories(db, current_user.id)
    await whatsapp_service.ensure_internal_transfer_category(db, household_id)
    await whatsapp_service.ensure_internal_debt_categories(db, household_id)
    await db.commit()
    await db.refresh(current_user)
    return household_id


def _is_wallet_transfer_signature(
    txn: models.Transaction,
    *,
    category_system_code: str | None = None,
    category_is_internal: bool | None = None,
) -> bool:
    if category_system_code == whatsapp_service.INTERNAL_TRANSFER_CATEGORY_CODE:
        return True
    if category_is_internal and category_system_code == whatsapp_service.INTERNAL_TRANSFER_CATEGORY_CODE:
        return True

    reference_id = (getattr(txn, "reference_id", None) or "").strip().upper()
    vendor = (getattr(txn, "vendor_or_source", None) or "").strip().lower()

    return (
        reference_id.endswith("-O")
        or reference_id.endswith("-I")
        or vendor.startswith("transfer to ")
        or vendor.startswith("transfer from ")
    )


def _is_debt_movement_signature(*, category_system_code: str | None = None) -> bool:
    return (category_system_code or "").strip().lower() in whatsapp_service.INTERNAL_DEBT_CATEGORY_CODES


def _is_primary_reporting_excluded_signature(
    txn: models.Transaction,
    *,
    category_system_code: str | None = None,
    category_is_internal: bool | None = None,
) -> bool:
    return _is_wallet_transfer_signature(
        txn,
        category_system_code=category_system_code,
        category_is_internal=category_is_internal,
    ) or _is_debt_movement_signature(category_system_code=category_system_code)


async def _backfill_wallet_transfer_categories(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: int,
) -> None:
    transfer_category = await whatsapp_service.ensure_internal_transfer_category(db, household_id)
    if transfer_category is None:
        return

    result = await db.execute(
        select(models.Transaction).where(
            models.Transaction.user_id == user_id,
            models.Transaction.category_id.is_(None),
            or_(
                models.Transaction.reference_id.like("%-O"),
                models.Transaction.reference_id.like("%-I"),
                models.Transaction.vendor_or_source.ilike("Transfer to %"),
                models.Transaction.vendor_or_source.ilike("Transfer from %"),
            ),
        )
    )
    updated = False
    for txn in result.scalars().all():
        txn.category_id = transfer_category.id
        updated = True

    if updated:
        await db.commit()


async def _resolve_transaction_category_id(
    category_id: int | None,
    *,
    current_user: models.User,
    db: AsyncSession,
) -> int | None:
    if category_id is None:
        return None

    category = await _get_accessible_category(category_id, current_user, db)
    if category.is_internal:
        raise HTTPException(status_code=403, detail="Internal category cannot be used manually.")
    return category.id


def _validate_transaction_type(txn_type: str) -> str:
    normalized = (txn_type or "").strip().lower()
    if normalized not in {"income", "expense"}:
        raise HTTPException(status_code=400, detail="Transaction type must be 'income' or 'expense'")
    return normalized

def _coerce_transaction_date(value: Any, fallback: date) -> date:
    if not value:
        return fallback
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="txn_date must be in YYYY-MM-DD format.")


def _normalize_transaction_location(
    *,
    latitude: float | None,
    longitude: float | None,
    location_name: str | None,
) -> tuple[float | None, float | None, str | None]:
    lat = float(latitude) if latitude is not None else None
    lon = float(longitude) if longitude is not None else None

    if (lat is None) != (lon is None):
        raise HTTPException(status_code=400, detail="Both latitude and longitude are required together.")

    if lat is not None:
        if lat < -90 or lat > 90:
            raise HTTPException(status_code=400, detail="Latitude must be between -90 and 90.")
        if lon is None or lon < -180 or lon > 180:
            raise HTTPException(status_code=400, detail="Longitude must be between -180 and 180.")

    normalized_location_name = (location_name or "").strip() or None
    return lat, lon, normalized_location_name

def _wallet_label(wallet: models.Wallet | None) -> str:
    if not wallet:
        return "Wallet"
    return (getattr(wallet, "label", None) or wallet.name or "Wallet").strip() or "Wallet"


async def _get_accessible_wallets_for_user(
    db: AsyncSession,
    current_user: models.User,
) -> list[models.Wallet]:
    household_id = await _ensure_current_user_household(db, current_user)
    stmt = select(models.Wallet).where(models.Wallet.owner_user_id == current_user.id)
    if household_id:
        stmt = select(models.Wallet).where(
            or_(models.Wallet.owner_user_id == current_user.id, models.Wallet.household_id == household_id)
        )
    stmt = stmt.order_by(models.Wallet.is_bot_default.desc(), models.Wallet.name.asc(), models.Wallet.id.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _get_accessible_wallet(
    wallet_id: int,
    current_user: models.User,
    db: AsyncSession,
) -> models.Wallet:
    wallets = await _get_accessible_wallets_for_user(db, current_user)
    for wallet in wallets:
        if int(wallet.id) == int(wallet_id):
            return wallet
    raise HTTPException(status_code=404, detail="Wallet not found")


async def _select_transaction_wallet(
    db: AsyncSession,
    current_user: models.User,
    wallet_id: int | None,
) -> models.Wallet:
    if wallet_id is not None:
        return await _get_accessible_wallet(wallet_id, current_user, db)

    wallets = await _get_accessible_wallets_for_user(db, current_user)
    # Never auto-select a saving wallet for regular transactions
    non_saving = [w for w in wallets if not getattr(w, "is_saving", False)]
    for wallet in non_saving:
        if getattr(wallet, "is_bot_default", False):
            return wallet
    if non_saving:
        return non_saving[0]
    return await ensure_wallet(db, current_user.id)


async def _get_wallet_balance(
    db: AsyncSession,
    wallet_id: int,
    *,
    exclude_transaction_id: int | None = None,
) -> float:
    stmt = select(
        func.coalesce(
            func.sum(
                case(
                    (models.Transaction.type == "income", models.Transaction.amount),
                    else_=-models.Transaction.amount,
                )
            ),
            0,
        )
    ).where(models.Transaction.wallet_id == wallet_id)
    if exclude_transaction_id is not None:
        stmt = stmt.where(models.Transaction.id != exclude_transaction_id)
    result = await db.execute(stmt)
    return float(result.scalar() or 0)


async def _format_sufficient_wallets_for_user(
    db: AsyncSession,
    current_user: models.User,
    amount: float,
    *,
    excluded_wallet_id: int | None = None,
) -> str:
    lines: list[str] = []
    for wallet in await _get_accessible_wallets_for_user(db, current_user):
        if excluded_wallet_id is not None and int(wallet.id) == int(excluded_wallet_id):
            continue
        balance = await _get_wallet_balance(db, wallet.id)
        if balance + 0.004 >= float(amount or 0):
            lines.append(f"{_wallet_label(wallet)} (RM {balance:,.2f})")
    return ", ".join(lines)


async def _ensure_wallet_can_cover_expense(
    db: AsyncSession,
    *,
    wallet: models.Wallet,
    current_user: models.User,
    amount: float,
    exclude_transaction_id: int | None = None,
) -> None:
    normalized_amount = float(amount or 0)
    if normalized_amount <= 0:
        return

    available = await _get_wallet_balance(
        db,
        wallet.id,
        exclude_transaction_id=exclude_transaction_id,
    )
    if available + 0.004 >= normalized_amount:
        return

    suggestions = await _format_sufficient_wallets_for_user(
        db,
        current_user,
        normalized_amount,
        excluded_wallet_id=wallet.id,
    )
    suggestion_text = f" Wallet yang cukup: {suggestions}." if suggestions else " Tiada wallet lain yang cukup."
    raise HTTPException(
        status_code=400,
        detail=(
            f"Baki wallet tidak mencukupi. {_wallet_label(wallet)} ada RM {available:,.2f}, "
            f"transaksi RM {normalized_amount:,.2f}.{suggestion_text} "
            "Pilih wallet lain atau top up dahulu."
        ),
    )



async def _get_accessible_category(cat_id: int, current_user: models.User, db: AsyncSession) -> models.Category:
    household_id = await _ensure_current_user_household(db, current_user)
    stmt = select(models.Category).where(models.Category.id == cat_id)
    stmt = stmt.where(models.Category.household_id == household_id)

    result = await db.execute(stmt)
    category = result.scalars().first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


async def _get_mutable_category(cat_id: int, current_user: models.User, db: AsyncSession) -> models.Category:
    household_id = await _ensure_current_user_household(db, current_user)

    result = await db.execute(
        select(models.Category).where(
            models.Category.id == cat_id,
            models.Category.household_id == household_id,
        )
    )
    category = result.scalars().first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.is_internal:
        raise HTTPException(status_code=403, detail="Internal category cannot be modified.")
    return category


async def _get_accessible_keyword(kw_id: int, current_user: models.User, db: AsyncSession) -> models.CategoryKeyword:
    household_id = await _ensure_current_user_household(db, current_user)
    stmt = (
        select(models.CategoryKeyword)
        .join(models.Category, models.CategoryKeyword.category_id == models.Category.id)
        .where(models.CategoryKeyword.id == kw_id)
    )
    stmt = stmt.where(models.Category.household_id == household_id)

    result = await db.execute(stmt)
    keyword = result.scalars().first()
    if not keyword:
        raise HTTPException(status_code=404, detail="Keyword not found")
    return keyword


async def _get_mutable_keyword(kw_id: int, current_user: models.User, db: AsyncSession) -> models.CategoryKeyword:
    household_id = await _ensure_current_user_household(db, current_user)

    stmt = (
        select(models.CategoryKeyword)
        .join(models.Category, models.CategoryKeyword.category_id == models.Category.id)
        .where(
            models.CategoryKeyword.id == kw_id,
            models.Category.household_id == household_id,
        )
    )
    result = await db.execute(stmt)
    keyword = result.scalars().first()
    if not keyword:
        raise HTTPException(status_code=404, detail="Keyword not found")
    return keyword


def _validate_category_kind(kind: str) -> str:
    normalized = (kind or "").strip().lower()
    if normalized not in {"expense", "income"}:
        raise HTTPException(status_code=400, detail="Category kind must be 'expense' or 'income'")
    return normalized


def _validate_keyword_match_type(match_type: str) -> str:
    normalized = (match_type or "").strip().lower()
    if normalized not in {"contains", "exact"}:
        raise HTTPException(status_code=400, detail="Keyword match_type must be 'contains' or 'exact'")
    return normalized


def _validate_keyword_text(keyword: str) -> str:
    normalized = (keyword or "").strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="Keyword is required")
    if re.search(r"\s", normalized):
        raise HTTPException(
            status_code=400,
            detail="Keyword cannot contain spaces. Use one word only.",
        )
    return normalized


def _validate_budget_amount(amount: float) -> float:
    try:
        normalized = float(amount)
    except Exception:
        raise HTTPException(status_code=400, detail="Budget amount must be a number")
    if normalized <= 0:
        raise HTTPException(status_code=400, detail="Budget amount must be greater than 0")
    return round(normalized, 2)


def _resolve_wallet_type(requested_type: str, *, current_type: str | None = None) -> str:
    normalized = (requested_type or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "personal": "bank",
        "cash": "cash",
        "bank": "bank",
        "bank_digital": "bank_digital",
        "digital_bank": "bank_digital",
        "digital": "bank_digital",
        "ewallet": "ewallet",
        "e_wallet": "ewallet",
        "credit_card": "credit_card",
        "credit": "credit_card",
        "credit_kad": "credit_card",
        "kad_kredit": "credit_card",
        "saving": "saving",
        "simpanan": "saving",
        "tabungan": "saving",
        "shared": "shared",
    }
    resolved = aliases.get(normalized)
    if not resolved:
        raise HTTPException(
            status_code=400,
            detail="Wallet type must be cash, bank, bank_digital, ewallet, saving, or credit_card",
        )

    # Legacy shared/household: keep existing shared wallets, block new shared.
    if resolved == "shared" and current_type != "shared":
        return "bank"

    # Map leftover personal → bank
    if resolved == "personal":
        return "bank"

    return resolved


async def _get_mutable_budget(budget_id: int, current_user: models.User, db: AsyncSession) -> models.CategoryBudget:
    household_id = await _ensure_current_user_household(db, current_user)
    result = await db.execute(
        select(models.CategoryBudget).where(
            models.CategoryBudget.id == budget_id,
            models.CategoryBudget.household_id == household_id,
        )
    )
    budget = result.scalars().first()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    return budget


async def _get_user_transaction(txn_id: str, user_id: str, db: AsyncSession) -> models.Transaction:
    from sqlalchemy import or_

    id_cond = models.Transaction.id == int(txn_id) if txn_id.isdigit() else False
    result = await db.execute(
        select(models.Transaction).where(
            or_(id_cond, models.Transaction.reference_id == txn_id),
            models.Transaction.user_id == user_id,
        )
    )
    txn = result.scalars().first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return txn


async def _get_user_attachment(attachment_id: int, user_id: str, db: AsyncSession) -> models.Attachment:
    stmt = (
        select(models.Attachment)
        .join(models.Transaction, models.Attachment.transaction_id == models.Transaction.id)
        .where(models.Attachment.id == attachment_id, models.Transaction.user_id == user_id)
    )
    result = await db.execute(stmt)
    attachment = result.scalars().first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return attachment


def _serialize_attachment(attachment: models.Attachment, request: Request) -> schemas.AttachmentResponse:
    cdn_domain = os.getenv("R2_CDN_DOMAIN", "").strip()
    direct_url = f"https://{cdn_domain}/{attachment.file_path}" if cdn_domain else None
    proxy_url = f"/attachments/{attachment.id}/file"

    return schemas.AttachmentResponse(
        id=attachment.id,
        transaction_id=attachment.transaction_id,
        file_name=attachment.file_name,
        mime_type=attachment.mime_type,
        size_bytes=attachment.size_bytes,
        proxy_url=proxy_url,
        direct_url=direct_url,
        created_at=attachment.created_at,
    )


def _serialize_transaction_item(item: models.TransactionItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "name": item.name,
        "quantity": float(item.quantity),
        "unit_price": float(item.unit_price),
        "subtotal": float(item.subtotal),
        "sort_order": int(item.sort_order or 0),
    }


def _normalize_transaction_items_payload(
    items: list[schemas.TransactionItemCreate] | None,
) -> tuple[list[dict[str, Any]], float]:
    normalized: list[dict[str, Any]] = []
    total_amount = 0.0

    for index, item in enumerate(items or []):
        name = (item.name or "").strip()
        if not name:
            continue

        quantity = round(float(item.quantity or 0), 2)
        unit_price = round(float(item.unit_price or 0), 2)
        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Transaction item quantity must be greater than zero.")
        if unit_price < 0:
            raise HTTPException(status_code=400, detail="Transaction item unit price cannot be negative.")

        computed_subtotal = round(quantity * unit_price, 2)
        subtotal = computed_subtotal if item.subtotal is None else round(float(item.subtotal), 2)
        if subtotal < 0:
            raise HTTPException(status_code=400, detail="Transaction item subtotal cannot be negative.")
        if abs(subtotal - computed_subtotal) > 0.02:
            subtotal = computed_subtotal

        normalized.append({
            "sort_order": index,
            "name": name[:190],
            "quantity": quantity,
            "unit_price": unit_price,
            "subtotal": subtotal,
        })
        total_amount += subtotal

    return normalized, round(total_amount, 2)


async def _replace_transaction_items(
    db: AsyncSession,
    transaction_id: int,
    items: list[dict[str, Any]],
) -> None:
    await db.execute(
        models.TransactionItem.__table__.delete().where(models.TransactionItem.transaction_id == transaction_id)
    )
    if not items:
        return

    db.add_all([
        models.TransactionItem(
            transaction_id=transaction_id,
            sort_order=item["sort_order"],
            name=item["name"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            subtotal=item["subtotal"],
        )
        for item in items
    ])


def _serialize_chat_message(
    chat_message: models.ChatMessage,
    request: Request,
    attachment_override: models.Attachment | None = None,
) -> schemas.ChatMessageResponse:
    attachment = None
    preloaded_attachment = attachment_override if attachment_override is not None else chat_message.__dict__.get("attachment")
    if preloaded_attachment is not None:
        attachment = _serialize_attachment(preloaded_attachment, request)

    return schemas.ChatMessageResponse(
        id=chat_message.id,
        role=chat_message.role,
        text=chat_message.text,
        source_channel=chat_message.source_channel,
        file_name=chat_message.file_name,
        mime_type=chat_message.mime_type,
        size_bytes=chat_message.size_bytes,
        attachment=attachment,
        created_at=chat_message.created_at,
    )


async def _find_recent_user_attachment(
    db: AsyncSession,
    *,
    user_id: str,
    since: datetime,
    file_name: str | None,
    size_bytes: int | None,
) -> models.Attachment | None:
    stmt = (
        select(models.Attachment)
        .where(
            models.Attachment.uploaded_by_user_id == user_id,
            models.Attachment.created_at >= since,
        )
        .order_by(models.Attachment.created_at.desc(), models.Attachment.id.desc())
    )
    if file_name:
        stmt = stmt.where(models.Attachment.file_name == Path(file_name).name)
    if size_bytes is not None:
        stmt = stmt.where(models.Attachment.size_bytes == size_bytes)

    result = await db.execute(stmt.limit(1))
    return result.scalars().first()


async def _persist_chat_message(
    db: AsyncSession,
    *,
    user_id: str,
    role: str,
    text: str | None,
    source_channel: str,
    attachment: models.Attachment | None = None,
    file_name: str | None = None,
    mime_type: str | None = None,
    size_bytes: int | None = None,
) -> models.ChatMessage:
    chat_message = models.ChatMessage(
        user_id=user_id,
        role=role,
        text=text,
        source_channel=source_channel,
        attachment_id=attachment.id if attachment else None,
        file_name=file_name,
        mime_type=mime_type,
        size_bytes=size_bytes,
    )
    db.add(chat_message)
    await db.commit()
    await db.refresh(chat_message)
    if attachment:
        chat_message.attachment = attachment
    return chat_message


async def _delete_storage_object_safe(file_key: str):
    if not file_key:
        return
    try:
        await asyncio.to_thread(storage_service.delete_receipt_object, file_key)
    except storage_service.StorageError as exc:
        print(f"[storage] Warning: failed to delete object '{file_key}': {exc}")

# --- Stats & Transactions ---
@app.post("/financial-analysis/insights")
async def generate_financial_insights(payload: dict = Body(...), current_user: models.User = Depends(get_current_user)):
    config = get_llm_config()
    if not config.enabled or not config.api_key:
        raise HTTPException(status_code=503, detail="AI analysis is not configured.")
    metrics = payload.get("metrics")
    if not isinstance(metrics, dict):
        raise HTTPException(status_code=400, detail="Invalid analysis metrics.")
    language = "Bahasa Melayu Malaysia" if str(payload.get("language", "BM")).upper() == "BM" else "English"
    safe_metrics = {str(key)[:50]: value for key, value in list(metrics.items())[:30] if isinstance(value, (str, int, float, bool, type(None)))}
    prompt = f"Act as a professional personal finance analyst. Reply in {language}. Using only these aggregate metrics, write 5 concise specific plain-text bullet insights covering strengths, risks, spending concentration, month comparison, commitments, and one practical action. Do not invent facts: {safe_metrics}"
    reply = await _request_model_reply(config=config, model_name=config.model, payload={"messages": [{"role": "system", "content": "Give cautious, data-grounded personal finance analysis, not regulated financial advice."}, {"role": "user", "content": prompt}]}, user_message=prompt)
    if not reply:
        raise HTTPException(status_code=502, detail="AI analysis is temporarily unavailable.")
    return {"insights": reply, "model": config.model}

@app.get("/stats", response_model=schemas.DashboardStats)
async def get_dashboard_stats(current_user: models.User = Depends(get_current_user), db: AsyncSession = Depends(database.get_db)):
    return await _module_get_dashboard_stats_route(
        current_user=current_user,
        db=db,
        ensure_wallet=ensure_wallet,
        ensure_current_user_household=_ensure_current_user_household,
        backfill_wallet_transfer_categories=_backfill_wallet_transfer_categories,
        is_primary_reporting_excluded_signature=_is_primary_reporting_excluded_signature,
        is_wallet_transfer_signature=_is_wallet_transfer_signature,
        current_business_date=current_business_date,
    )

@app.get("/users/me", response_model=schemas.UserResponse)
async def get_my_profile(current_user: models.User = Depends(get_current_user)):
    return await _module_get_my_profile_route(
        current_user=current_user,
    )


@app.get("/users/me/stats", response_model=schemas.MyStatsResponse)
async def get_my_stats(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    def count(table, column):
        return (
            db.scalar(select(func.count()).select_from(table).where(column == current_user.id)) or 0
        )

    transaction_count = await count(models.Transaction, models.Transaction.user_id)
    wallet_count = await count(models.Wallet, models.Wallet.owner_user_id)
    debt_count = await count(models.Debt, models.Debt.user_id)
    loan_count = await count(models.Loan, models.Loan.user_id)
    subscription_count = await count(models.Subscription, models.Subscription.user_id)
    return schemas.MyStatsResponse(
        transaction_count=transaction_count,
        wallet_count=wallet_count,
        debt_count=debt_count,
        loan_count=loan_count,
        subscription_count=subscription_count,
    )

@app.get("/cycles/me")
async def get_my_cycle(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Ensure household/categories (incl. Monthly Salary) exist before resolving,
    # otherwise default_household_id may be None and the salary cycle won't apply.
    await whatsapp_service.ensure_standard_categories(db, current_user.id)
    await db.commit()
    await db.refresh(current_user)
    cycle = await budget_service.resolve_user_cycle(db, user=current_user)
    salary_dates = await budget_service.get_salary_dates(
        db,
        user_id=current_user.id,
        household_id=current_user.default_household_id,
    )
    return {
        "mode": cycle["mode"],
        "month_key": cycle["month_key"],
        "start": cycle["start"].isoformat(),
        "end": cycle["end"].isoformat(),
        "salary_dates": [d.isoformat() for d in salary_dates],
    }

@app.patch("/users/me", response_model=schemas.UserResponse)
async def update_my_profile(user_in: schemas.UserUpdate, db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_update_my_profile_route(
        user_in=user_in,
        db=db,
        current_user=current_user,
        normalize_language=_normalize_language,
        normalize_theme_mode=_normalize_theme_mode,
        normalize_bot_personality=_normalize_bot_personality,
    )


async def _account_cleanup(db: AsyncSession, *, user_id: str, reset_only: bool):
    user = (await db.execute(select(models.User).where(models.User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if reset_only:
        await account_cleanup_service.reset_account_data(db, user)
    else:
        await account_cleanup_service.hard_delete_account(db, user)


@app.delete("/users/me", response_model=schemas.MessageResponse)
async def delete_my_account(
    payload: schemas.AccountActionRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_delete_my_account_route(
        payload=payload,
        db=db,
        current_user=current_user,
        account_cleanup=_account_cleanup,
        clear_user_refresh_token=_clear_user_refresh_token,
    )


@app.post("/users/me/reset", response_model=schemas.MessageResponse)
async def reset_my_account(
    payload: schemas.AccountActionRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_reset_my_account_route(
        payload=payload,
        db=db,
        current_user=current_user,
        account_cleanup=_account_cleanup,
    )


@app.post("/users/me/onboarding", response_model=schemas.UserResponse)
async def complete_my_onboarding(payload: schemas.OnboardingRequest, db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    language = _normalize_language(payload.language)
    category_mode = (payload.category_mode or "bm").strip().lower()
    if category_mode not in {"bm", "en", "manual"}:
        raise HTTPException(status_code=400, detail="category_mode must be 'bm', 'en', or 'manual'.")

    timezone = (payload.timezone or "Asia/Kuala_Lumpur").strip()
    time_format = (payload.time_format or "24h").strip().lower()
    if time_format not in {"12h", "24h"}:
        raise HTTPException(status_code=400, detail="time_format must be '12h' or '24h'.")

    current_user.language = language
    current_user.category_language = category_mode
    current_user.onboarding_done = True

    setting_updates = {
        "timezone": timezone,
        "time_format": time_format,
    }
    for key, value in setting_updates.items():
        row = (await db.execute(
            select(models.UserSetting).where(
                models.UserSetting.user_id == current_user.id,
                models.UserSetting.key == key,
            )
        )).scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.add(models.UserSetting(user_id=current_user.id, key=key, value=value))

    await whatsapp_service.ensure_standard_categories(db, current_user.id)
    await db.commit()
    await db.refresh(current_user)
    return current_user

CAT_PET_SETTING_KEY = "cat_playground_v1"


def _normalize_cat_pet_payload(data: dict | None) -> dict:
    raw = data if isinstance(data, dict) else {}

    def _num(key: str, default: float = 0) -> float:
        try:
            return float(raw.get(key, default))
        except (TypeError, ValueError):
            return default

    def _int(key: str, default: int = 0) -> int:
        try:
            return int(raw.get(key, default))
        except (TypeError, ValueError):
            return default

    name = str(raw.get("name") or "Mimi").strip()[:24] or "Mimi"
    name_updated_at = max(0, _int("nameUpdatedAt", 0))
    hunger = max(0.0, min(100.0, _num("hunger", 100)))
    happy = max(0.0, min(100.0, _num("happy", 100)))
    last_fed = _int("lastFedAt", 0)
    last_seen = _int("lastSeenAt", 0)
    born = _int("bornAt", 0)
    if born <= 0:
        candidates = [v for v in (last_fed, last_seen) if v > 0]
        born = min(candidates) if candidates else 0
    cat_skins = {"amber", "orange", "gray", "black", "white", "calico", "cream", "lilac"}
    house_skins = {"violet", "sky", "mint", "rose", "sunset", "wood"}
    cat_skin = str(raw.get("catSkin") or "amber").strip().lower()
    house_skin = str(raw.get("houseSkin") or "violet").strip().lower()
    if cat_skin not in cat_skins:
        cat_skin = "amber"
    if house_skin not in house_skins:
        house_skin = "violet"
    return {
        "hunger": hunger,
        "happy": happy,
        "lastFedAt": last_fed,
        "lastSeenAt": last_seen,
        "totalFeeds": max(0, _int("totalFeeds", 0)),
        "deaths": max(0, _int("deaths", 0)),
        "revives": max(0, _int("revives", 0)),
        "name": name,
        "nameUpdatedAt": name_updated_at,
        "remindersEnabled": bool(raw.get("remindersEnabled", True)),
        "bornAt": born,
        "catSkin": cat_skin,
        "houseSkin": house_skin,
    }


@app.get("/users/me/cat-pet")
async def get_my_cat_pet(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    row = (
        await db.execute(
            select(models.UserSetting).where(
                models.UserSetting.user_id == current_user.id,
                models.UserSetting.key == CAT_PET_SETTING_KEY,
            )
        )
    ).scalars().first()
    if not row or not row.value:
        return {"pet": None}
    try:
        parsed = json.loads(row.value)
    except Exception:
        return {"pet": None}
    return {"pet": _normalize_cat_pet_payload(parsed if isinstance(parsed, dict) else None)}


@app.put("/users/me/cat-pet")
async def put_my_cat_pet(
    payload: dict,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    pet_in = payload.get("pet") if isinstance(payload, dict) else None
    pet = _normalize_cat_pet_payload(
        pet_in if isinstance(pet_in, dict) else payload if isinstance(payload, dict) else None
    )
    await _save_user_setting_json(db, current_user.id, CAT_PET_SETTING_KEY, pet)
    await db.commit()
    return {"pet": pet}


@app.post("/users/me/email-change/request", response_model=schemas.MessageResponse)
async def request_my_email_change(
    payload: schemas.EmailChangeRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_request_my_email_change_route(
        payload=payload,
        db=db,
        current_user=current_user,
        normalize_email=_normalize_email,
        generate_email_change_code=_generate_email_change_code,
        hash_email_change_token=_hash_email_change_token,
    )

@app.post("/users/me/email-change/confirm", response_model=schemas.Token)
async def confirm_my_email_change(
    payload: schemas.EmailChangeConfirmRequest,
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_confirm_my_email_change_route(
        payload=payload,
        request=request,
        token=token,
        db=db,
        current_user=current_user,
        normalize_email=_normalize_email,
        hash_email_change_token=_hash_email_change_token,
        issue_auth_tokens_for_user=_issue_auth_tokens_for_user,
        auth_access_cookie_name=AUTH_ACCESS_COOKIE_NAME,
    )

@app.get("/users/me/pin", response_model=schemas.PinStatusResponse)
async def get_my_pin_status(current_user: models.User = Depends(get_current_user)):
    return await _module_get_my_pin_status_route(
        current_user=current_user,
    )

@app.post("/users/me/pin/verify")
async def verify_my_pin(
    payload: schemas.PinVerifyRequest,
    request: Request,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_verify_my_pin_route(
        payload=payload,
        request=request,
        db=db,
        current_user=current_user,
        enforce_auth_rate_limit=enforce_auth_rate_limit,
        normalize_email=_normalize_email,
        validate_pin_value=validate_pin_value,
        is_user_pin_locked=_is_user_pin_locked,
        record_pin_failed_attempt=_record_pin_failed_attempt,
        clear_user_pin_lock=_clear_user_pin_lock,
        pin_lock_minutes=PIN_LOCK_MINUTES,
    )

@app.put("/users/me/pin")
async def set_my_pin(
    payload: schemas.PinSetRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_set_my_pin_route(
        payload=payload,
        db=db,
        current_user=current_user,
        validate_pin_value=validate_pin_value,
        clear_user_pin_lock=_clear_user_pin_lock,
    )

@app.delete("/users/me/pin")
async def delete_my_pin(
    payload: schemas.PinDeleteRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_delete_my_pin_route(
        payload=payload,
        db=db,
        current_user=current_user,
        clear_user_pin=_clear_user_pin,
    )

@app.patch("/users/me/password")
async def change_my_password(
    payload: schemas.ChangePasswordRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_change_my_password_route(
        payload=payload,
        db=db,
        current_user=current_user,
        validate_password_strength=validate_password_strength,
        clear_user_pin=_clear_user_pin,
        clear_user_refresh_token=_clear_user_refresh_token,
    )
@app.post("/wallets/image-upload")
async def upload_wallet_image(file: UploadFile = File(...), current_user: models.User = Depends(get_current_user)):
    payload = await file.read(524289)
    if len(payload) > 524288:
        raise HTTPException(status_code=413, detail="Imej terlalu besar. Maksimum 512 KB.")
    try:
        mime_type, extension = storage_service.validate_receipt_file(file.filename, file.content_type, payload)
        if mime_type == "application/pdf":
            raise storage_service.StorageValidationError("Hanya PNG, JPG atau WEBP dibenarkan.")
        object_key = f"wallet-images/{current_user.id}/{uuid4().hex}{extension}"
        await asyncio.to_thread(storage_service.upload_receipt_object, object_key, payload, mime_type, filename=file.filename)
        url = storage_service.public_cdn_url(object_key)
        if not url:
            raise storage_service.StorageError("R2_CDN_DOMAIN tidak dikonfigurasi.")
        return {"url": url}
    except storage_service.StorageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except storage_service.StorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@app.get("/wallets", response_model=List[schemas.WalletResponse])
async def get_wallets(db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_get_wallets_route(
        db=db,
        current_user=current_user,
        ensure_wallet=ensure_wallet,
    )

@app.post("/wallets", response_model=schemas.WalletResponse)
async def create_wallet(
    wallet_in: schemas.WalletCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_create_wallet_route(
        wallet_in=wallet_in,
        db=db,
        current_user=current_user,
        resolve_wallet_type=_resolve_wallet_type,
    )

@app.patch("/wallets/{wallet_id}", response_model=schemas.WalletResponse)
async def update_wallet(
    wallet_id: int,
    wallet_in: schemas.WalletUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_update_wallet_route(
        wallet_id=wallet_id,
        wallet_in=wallet_in,
        db=db,
        current_user=current_user,
        resolve_wallet_type=_resolve_wallet_type,
    )

@app.delete("/wallets/{wallet_id}")
async def delete_wallet(
    wallet_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_delete_wallet_route(
        wallet_id=wallet_id,
        db=db,
        current_user=current_user,
    )

@app.post("/categories/icon-upload")
async def upload_category_icon(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
):
    payload = await file.read(262145)
    if len(payload) > 262144:
        raise HTTPException(status_code=413, detail="Icon terlalu besar. Maksimum 256 KB.")
    try:
        mime_type, extension = storage_service.validate_receipt_file(file.filename, file.content_type, payload)
        if mime_type == "application/pdf":
            raise storage_service.StorageValidationError("Hanya PNG, JPG atau WEBP dibenarkan.")
        object_key = storage_service.build_category_icon_object_key(current_user.id, extension)
        await asyncio.to_thread(storage_service.upload_receipt_object, object_key, payload, mime_type, filename=file.filename)
        url = storage_service.public_cdn_url(object_key)
        if not url:
            raise storage_service.StorageError("R2_CDN_DOMAIN tidak dikonfigurasi.")
        return {"url": url}
    except storage_service.StorageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except storage_service.StorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@app.post("/users/me/avatar")
async def upload_user_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    payload = await file.read(2_097_153)
    if len(payload) > 2_097_152:
        raise HTTPException(status_code=413, detail="Imej terlalu besar. Maksimum 2 MB.")
    try:
        mime_type, extension = storage_service.validate_receipt_file(file.filename, file.content_type, payload)
        if mime_type == "application/pdf":
            raise storage_service.StorageValidationError("Hanya PNG, JPG atau WEBP dibenarkan.")
        object_key = storage_service.build_avatar_object_key(current_user.id, extension)
        await asyncio.to_thread(storage_service.upload_receipt_object, object_key, payload, mime_type, filename=file.filename)
        url = storage_service.public_cdn_url(object_key)
        if not url:
            raise storage_service.StorageError("R2_CDN_DOMAIN tidak dikonfigurasi.")
        old_key = current_user.avatar_url
        current_user.avatar_url = url
        await db.commit()
        if old_key and old_key.startswith("http") and "/avatars/" in old_key:
            try:
                await asyncio.to_thread(storage_service.delete_receipt_object, old_key.split("/avatars/")[-1])
            except Exception:
                pass
        return {"avatar_url": url}
    except storage_service.StorageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except storage_service.StorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@app.get("/categories", response_model=List[schemas.CategoryResponse])
async def get_categories(db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_get_categories_route(
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
        is_primary_reporting_excluded_signature=_is_primary_reporting_excluded_signature,
        current_business_date_fn=current_business_date,
    )

@app.get("/categories/layout", response_model=schemas.CategoryLayoutIn)
async def get_category_layout(db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_get_category_layout_route(
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
    )

@app.put("/categories/layout", response_model=dict)
async def put_category_layout(cat_layout: schemas.CategoryLayoutIn, db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_put_category_layout_route(
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
        payload=cat_layout,
    )

@app.get("/categories/{cat_id}/keywords", response_model=List[schemas.KeywordResponse])
async def get_category_keywords(cat_id: int, db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_get_category_keywords_route(
        cat_id=cat_id,
        db=db,
        current_user=current_user,
        get_accessible_category=_get_accessible_category,
    )

@app.post("/categories", response_model=schemas.CategoryResponse)
async def create_category(cat_in: schemas.CategoryCreate, db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_create_category_route(
        cat_in=cat_in,
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
        validate_category_icon_name=_validate_category_icon_name,
        suggest_category_icon_name=_suggest_category_icon_name,
        validate_category_kind=_validate_category_kind,
    )

@app.post("/categories/{cat_id}/keywords", response_model=schemas.KeywordResponse)
async def add_category_keyword(cat_id: int, kw_in: schemas.KeywordCreate, db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_add_category_keyword_route(
        cat_id=cat_id,
        kw_in=kw_in,
        db=db,
        current_user=current_user,
        get_mutable_category=_get_mutable_category,
        validate_keyword_text=_validate_keyword_text,
        validate_keyword_match_type=_validate_keyword_match_type,
    )

@app.delete("/categories/{cat_id}")
async def delete_category(cat_id: int, db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_delete_category_route(
        cat_id=cat_id,
        db=db,
        current_user=current_user,
        get_mutable_category=_get_mutable_category,
    )

@app.delete("/keywords/{kw_id}")
async def delete_keyword(kw_id: int, db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_delete_keyword_route(
        kw_id=kw_id,
        db=db,
        current_user=current_user,
        get_mutable_keyword=_get_mutable_keyword,
    )

@app.patch("/categories/{cat_id}", response_model=schemas.CategoryResponse)
async def update_category(cat_id: int, cat_in: schemas.CategoryBase, db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_update_category_route(
        cat_id=cat_id,
        cat_in=cat_in,
        db=db,
        current_user=current_user,
        get_mutable_category=_get_mutable_category,
        validate_category_kind=_validate_category_kind,
        validate_category_icon_name=_validate_category_icon_name,
        suggest_category_icon_name=_suggest_category_icon_name,
    )

@app.patch("/keywords/{kw_id}")
async def update_keyword(kw_id: int, kw_in: schemas.KeywordBase, db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_update_keyword_route(
        kw_id=kw_id,
        kw_in=kw_in,
        db=db,
        current_user=current_user,
        get_mutable_keyword=_get_mutable_keyword,
        validate_keyword_text=_validate_keyword_text,
        validate_keyword_match_type=_validate_keyword_match_type,
    )

@app.get("/budgets", response_model=List[schemas.BudgetItemResponse])
async def get_budgets(
    month: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_get_budgets_route(
        month=month,
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
    )


@app.post("/budgets", response_model=schemas.BudgetItemResponse)
async def create_budget(
    budget_in: schemas.BudgetCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_create_budget_route(
        budget_in=budget_in,
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
        get_accessible_category=_get_accessible_category,
        validate_budget_amount=_validate_budget_amount,
    )


@app.patch("/budgets/{budget_id}", response_model=schemas.BudgetItemResponse)
async def update_budget(
    budget_id: int,
    budget_in: schemas.BudgetUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_update_budget_route(
        budget_id=budget_id,
        budget_in=budget_in,
        db=db,
        current_user=current_user,
        get_mutable_budget=_get_mutable_budget,
        ensure_current_user_household=_ensure_current_user_household,
        validate_budget_amount=_validate_budget_amount,
    )

@app.delete("/budgets/{budget_id}")
async def delete_budget(
    budget_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_delete_budget_route(
        budget_id=budget_id,
        db=db,
        current_user=current_user,
        get_mutable_budget=_get_mutable_budget,
    )

@app.get("/budgets/summary", response_model=schemas.BudgetSummaryResponse)
async def get_budget_summary(
    month: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_get_budget_summary_route(
        month=month,
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
    )


# Debtor Endpoints
@app.get("/debtors", response_model=List[schemas.DebtorResponse])
async def get_debtors(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_get_debtors_route(
        db=db,
        current_user=current_user,
    )

@app.post("/debtors", response_model=schemas.DebtorResponse)
async def create_debtor(
    payload: schemas.DebtorCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_create_debtor_route(
        payload=payload,
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
    )

@app.delete("/debtors/{debtor_id}")
async def delete_debtor(
    debtor_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_delete_debtor_route(
        debtor_id=debtor_id,
        db=db,
        current_user=current_user,
    )

async def _get_loan_payment_category_id(db: AsyncSession, user_id: str, household_id: int | None) -> int | None:
    await whatsapp_service.ensure_standard_categories(db, user_id)
    if not household_id:
        return None
    preferred_names = ["Loan / Komitmen", "Loan", "Komitmen"]
    result = await db.execute(
        select(models.Category).where(
            models.Category.household_id == household_id,
            models.Category.kind == "expense",
            models.Category.is_internal == False,
            models.Category.name.in_(preferred_names),
        )
        .order_by(models.Category.name.asc())
        .limit(1)
    )
    category = result.scalars().first()
    if category:
        return int(category.id)
    fallback = await db.execute(
        select(models.Category).where(
            models.Category.household_id == household_id,
            models.Category.kind == "expense",
            models.Category.is_internal == False,
        )
        .order_by(models.Category.name.asc())
        .limit(1)
    )
    fallback_category = fallback.scalars().first()
    return int(fallback_category.id) if fallback_category else None

def _serialize_loan_response(
    loan: models.Loan,
    *,
    payment_count: int = 0,
    last_payment_at: datetime | None = None,
) -> schemas.LoanResponse:
    opening_amount = float(loan.opening_amount or 0)
    outstanding_amount = float(loan.outstanding_amount or 0)
    monthly_payment_raw = float(loan.monthly_payment or 0)
    monthly_payment = monthly_payment_raw if monthly_payment_raw > 0 else None
    remaining_months = math.ceil(outstanding_amount / monthly_payment) if monthly_payment and outstanding_amount > 0.004 else 0 if monthly_payment else None
    return schemas.LoanResponse(
        id=int(loan.id),
        name=str(loan.name),
        key=str(loan.key),
        opening_amount=opening_amount,
        outstanding_amount=outstanding_amount,
        monthly_payment=monthly_payment,
        paid_amount=max(0.0, opening_amount - outstanding_amount),
        remaining_months=remaining_months,
        start_date=loan.start_date.strftime("%Y-%m-%d"),
        notes=loan.notes,
        status=str(loan.status),
        record_kind=str(getattr(loan, "record_kind", "loan") or "loan"),
        due_day_of_month=int(loan.due_day_of_month) if getattr(loan, "due_day_of_month", None) is not None else None,
        category_id=int(loan.category_id) if loan.category_id is not None else None,
        payment_count=int(payment_count or 0),
        last_payment_at=last_payment_at,
        created_at=loan.created_at,
        updated_at=loan.updated_at,
    )

async def _get_loan_payment_summary(
    db: AsyncSession,
    *,
    loan_id: int,
    user_id: str,
) -> tuple[int, datetime | None]:
    aggregate_result = await db.execute(
        select(
            func.count(models.LoanPayment.id),
            func.max(models.LoanPayment.created_at),
        )
        .where(models.LoanPayment.loan_id == loan_id, models.LoanPayment.user_id == user_id)
    )
    count, last_payment_at = aggregate_result.one()
    return int(count or 0), last_payment_at

@app.get("/loans", response_model=List[schemas.LoanResponse])
async def get_loans(
    request: Request,
    include_settled: bool = Query(default=False),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    await enforce_auth_rate_limit("loans_get", request, identity=current_user.id)
    return await _module_get_loans_route(
        include_settled=include_settled,
        db=db,
        current_user=current_user,
        serialize_loan_response=_serialize_loan_response,
    )


@app.post("/subscriptions/parse", response_model=schemas.SubscriptionCommandResponse)
async def parse_subscription_command(
    payload: schemas.SubscriptionCommandCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    msg, c = await whatsapp_service.process_commitment_command_from_web(
        db,
        user_id=current_user.id,
        command_text=payload.command_text,
    )
    from modules.subscriptions.routes import _serialize_subscription
    return schemas.SubscriptionCommandResponse(
        ok=True,
        message=msg,
        commitment=_serialize_subscription(c),
    )


@app.get("/subscriptions", response_model=List[schemas.SubscriptionResponse])
async def get_commitments(
    include_settled: bool = Query(default=False),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_get_subscriptions_route(
        include_settled=include_settled,
        db=db,
        current_user=current_user,
    )


@app.post("/subscriptions", response_model=schemas.SubscriptionResponse)
async def create_commitment(
    payload: schemas.SubscriptionCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_create_subscription_route(
        payload=payload,
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
        current_business_date_fn=current_business_date,
    )


@app.patch("/subscriptions/{subscription_id}", response_model=schemas.SubscriptionResponse)
async def update_commitment(
    subscription_id: int,
    payload: schemas.SubscriptionUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_update_subscription_route(
        subscription_id=subscription_id,
        payload=payload,
        db=db,
        current_user=current_user,
    )


@app.get("/subscriptions/{subscription_id}", response_model=schemas.SubscriptionResponse)
async def get_commitment(
    subscription_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_get_subscription_route(
        subscription_id=subscription_id,
        db=db,
        current_user=current_user,
    )


@app.delete("/subscriptions/{subscription_id}")
async def delete_commitment(
    subscription_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_delete_subscription_route(
        subscription_id=subscription_id,
        db=db,
        current_user=current_user,
    )

@app.post("/subscriptions/{subscription_id}/reset")
async def reset_subscription_due(
    subscription_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    sub_result = await db.execute(
        select(models.Subscription).where(
            models.Subscription.id == subscription_id,
            models.Subscription.user_id == current_user.id,
        )
    )
    sub = sub_result.scalars().first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found.")
    sub.last_payment_date = None
    await db.commit()
    return {"ok": True}


@app.get("/subscriptions/{subscription_id}/transactions", response_model=List[schemas.TransactionResponse])
async def get_subscription_transactions(
    subscription_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    sub_result = await db.execute(
        select(models.Subscription).where(
            models.Subscription.id == subscription_id,
            models.Subscription.user_id == current_user.id,
        )
    )
    sub = sub_result.scalars().first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found.")

    vendor_prefix = f"SUBX {sub.name}"
    txn_result = await db.execute(
        select(models.Transaction)
        .where(
            models.Transaction.user_id == current_user.id,
            or_(
                models.Transaction.subscription_id == sub.id,
                and_(
                    models.Transaction.subscription_id.is_(None),
                    func.lower(func.trim(models.Transaction.vendor_or_source)) == vendor_prefix.strip().lower(),
                ),
            ),
        )
        .order_by(models.Transaction.txn_date.desc(), models.Transaction.id.desc())
    )
    txns = list(txn_result.scalars().all())

    wallet_ids = list({t.wallet_id for t in txns if t.wallet_id})
    category_ids = list({t.category_id for t in txns if t.category_id})
    wallet_map: dict[int, models.Wallet] = {}
    category_map: dict[int, models.Category] = {}
    if wallet_ids:
        w_res = await db.execute(select(models.Wallet).where(models.Wallet.id.in_(wallet_ids)))
        wallet_map = {w.id: w for w in w_res.scalars().all()}
    if category_ids:
        c_res = await db.execute(select(models.Category).where(models.Category.id.in_(category_ids)))
        category_map = {c.id: c for c in c_res.scalars().all()}

    return [
        schemas.TransactionResponse(
            id=int(t.id),
            reference_id=t.reference_id,
            user_id=t.user_id,
            wallet_name=wallet_map[t.wallet_id].name if t.wallet_id and t.wallet_id in wallet_map else None,
            category_name=category_map[t.category_id].name if t.category_id and t.category_id in category_map else None,
            category_icon_name=getattr(category_map.get(t.category_id), 'icon_name', None) if t.category_id else None,
            category_is_internal=False,
            category_system_code=None,
            is_wallet_transfer=False,
            is_debt_movement=False,
            source_channel=t.source_channel,
            type=t.type or "expense",
            amount=float(t.amount or 0),
            vendor_or_source=t.vendor_or_source,
            txn_date=t.txn_date,
            notes=t.notes,
            created_at=t.created_at,
        )
        for t in txns
    ]


@app.post("/loans", response_model=schemas.LoanResponse)
async def create_loan(
    payload: schemas.LoanCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_create_loan_route(
        payload=payload,
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
        serialize_loan_response=_serialize_loan_response,
        current_business_date_fn=current_business_date,
    )

@app.patch("/loans/{loan_id}", response_model=schemas.LoanResponse)
async def update_loan(
    loan_id: int,
    payload: schemas.LoanUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_update_loan_route(
        loan_id=loan_id,
        payload=payload,
        db=db,
        current_user=current_user,
        get_loan_payment_summary=_get_loan_payment_summary,
        serialize_loan_response=_serialize_loan_response,
    )

@app.get("/loans/{loan_id}", response_model=schemas.LoanResponse)
async def get_loan(
    loan_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_get_loan_route(
        loan_id=loan_id,
        db=db,
        current_user=current_user,
        get_loan_payment_summary=_get_loan_payment_summary,
        serialize_loan_response=_serialize_loan_response,
    )

@app.delete("/loans/{loan_id}")
async def delete_loan(
    loan_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_delete_loan_route(
        loan_id=loan_id,
        db=db,
        current_user=current_user,
    )

@app.get("/loans/{loan_id}/payments", response_model=List[schemas.LoanPaymentResponse])
async def get_loan_payments(
    loan_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_get_loan_payments_route(
        loan_id=loan_id,
        db=db,
        current_user=current_user,
    )

@app.post("/loans/{loan_id}/payments", response_model=schemas.LoanPaymentResponse)
async def create_loan_payment(
    loan_id: int,
    payload: schemas.LoanPaymentCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_create_loan_payment_route(
        loan_id=loan_id,
        payload=payload,
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
        get_accessible_wallet=_get_accessible_wallet,
        ensure_wallet_can_cover_expense=_ensure_wallet_can_cover_expense,
        get_loan_payment_category_id=_get_loan_payment_category_id,
        current_business_date_fn=current_business_date,
    )

@app.delete("/loans/{loan_id}/payments/{payment_id}")
async def delete_loan_payment(
    loan_id: int,
    payment_id: int,
    delete_transaction: bool = Query(default=True),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_delete_loan_payment_route(
        loan_id=loan_id,
        payment_id=payment_id,
        delete_transaction=delete_transaction,
        db=db,
        current_user=current_user,
        delete_storage_object_safe=_delete_storage_object_safe,
    )

@app.get("/monthly-checkoffs", response_model=List[schemas.MonthlyCheckoffResponse])
async def get_monthly_checkoffs(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_get_monthly_checkoffs_route(
        today=current_business_date(),
        db=db,
        current_user=current_user,
    )

@app.post("/monthly-checkoffs", response_model=schemas.MonthlyCheckoffResponse)
async def create_monthly_checkoff(
    payload: schemas.MonthlyCheckoffCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_create_monthly_checkoff_route(
        payload=payload,
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
    )

@app.delete("/monthly-checkoffs/{item_type}/{item_id}")
async def delete_monthly_checkoff(
    item_type: str,
    item_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_delete_monthly_checkoff_route(
        item_type=item_type,
        item_id=item_id,
        db=db,
        current_user=current_user,
    )


@app.get("/transactions/{txn_id}/loan-link", response_model=schemas.TransactionLoanLinkResponse)
async def get_transaction_loan_link(
    txn_id: str,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    txn = await _get_user_transaction(txn_id, current_user.id, db)
    result = await db.execute(
        select(models.LoanPayment, models.Loan)
        .join(models.Loan, models.Loan.id == models.LoanPayment.loan_id)
        .where(models.LoanPayment.transaction_id == txn.id, models.LoanPayment.user_id == current_user.id)
        .order_by(models.LoanPayment.id.desc())
    )
    row = result.first()
    if not row:
        return schemas.TransactionLoanLinkResponse(payment_id=None, loan_id=None, loan_name=None)
    payment, loan = row
    return schemas.TransactionLoanLinkResponse(payment_id=int(payment.id), loan_id=int(loan.id), loan_name=str(loan.name))

@app.put("/transactions/{txn_id}/loan-link", response_model=schemas.TransactionLoanLinkResponse)
async def update_transaction_loan_link(
    txn_id: str,
    payload: schemas.TransactionLoanLinkUpdate,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    txn = await _get_user_transaction(txn_id, current_user.id, db)
    existing_result = await db.execute(
        select(models.LoanPayment)
        .where(models.LoanPayment.transaction_id == txn.id, models.LoanPayment.user_id == current_user.id)
        .order_by(models.LoanPayment.id.desc())
    )
    existing = existing_result.scalars().first()

    if payload.loan_id is None:
        if existing:
            old_loan = await db.get(models.Loan, existing.loan_id)
            if old_loan and old_loan.user_id == current_user.id:
                old_loan.outstanding_amount = round(float(old_loan.outstanding_amount or 0) + float(existing.amount or 0), 2)
                old_loan.status = "active" if float(old_loan.outstanding_amount or 0) > 0.004 else "settled"
            await db.delete(existing)
            await db.commit()
        return schemas.TransactionLoanLinkResponse(payment_id=None, loan_id=None, loan_name=None)

    loan_result = await db.execute(select(models.Loan).where(models.Loan.id == payload.loan_id, models.Loan.user_id == current_user.id))
    loan = loan_result.scalars().first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    if txn.type != "expense":
        raise HTTPException(status_code=400, detail="Only expense transactions can be linked to a loan.")

    amount = float(txn.amount or 0)
    if existing and int(existing.loan_id) == int(loan.id):
        return schemas.TransactionLoanLinkResponse(payment_id=int(existing.id), loan_id=int(loan.id), loan_name=str(loan.name))

    if existing:
        previous_loan = await db.get(models.Loan, existing.loan_id)
        if previous_loan and previous_loan.user_id == current_user.id:
            previous_loan.outstanding_amount = round(float(previous_loan.outstanding_amount or 0) + float(existing.amount or 0), 2)
            previous_loan.status = "active" if float(previous_loan.outstanding_amount or 0) > 0.004 else "settled"
        await db.delete(existing)
        await db.flush()

    if amount - float(loan.outstanding_amount or 0) > 0.004:
        raise HTTPException(status_code=400, detail="Transaction amount exceeds outstanding loan balance.")

    payment = models.LoanPayment(
        user_id=current_user.id,
        household_id=txn.household_id,
        loan_id=int(loan.id),
        wallet_id=txn.wallet_id,
        transaction_id=txn.id,
        amount=amount,
        payment_date=txn.txn_date,
        notes=(txn.notes or f"Linked from transaction {txn.reference_id or txn.id}")[:255],
        source_channel="web",
    )
    db.add(payment)
    loan.outstanding_amount = max(0.0, round(float(loan.outstanding_amount or 0) - amount, 2))
    loan.status = "settled" if float(loan.outstanding_amount or 0) <= 0.004 else "active"
    await db.commit()
    await db.refresh(payment)
    return schemas.TransactionLoanLinkResponse(payment_id=int(payment.id), loan_id=int(loan.id), loan_name=str(loan.name))

@app.get("/debts", response_model=List[schemas.DebtSummaryResponse])
async def get_debt_summaries(
    include_settled: bool = Query(default=False),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_get_debt_summaries_route(
        include_settled=include_settled,
        db=db,
        current_user=current_user,
    )

@app.get("/debts/{counterparty_name}/entries", response_model=List[schemas.DebtEventResponse])
async def get_debt_entries(
    counterparty_name: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_get_debt_entries_route(
        counterparty_name=counterparty_name,
        limit=limit,
        db=db,
        current_user=current_user,
    )

@app.post("/debts", response_model=schemas.DebtEventResponse)
async def create_debt_entry(
    payload: schemas.DebtEventCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_create_debt_entry_route(
        payload=payload,
        db=db,
        current_user=current_user,
        ensure_current_user_household=_ensure_current_user_household,
    )

@app.delete("/debts/entries/{debt_id}")
async def delete_debt_entry(
    debt_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await _module_delete_debt_entry_route(
        debt_id=debt_id,
        db=db,
        current_user=current_user,
        delete_storage_object_safe=_delete_storage_object_safe,
    )

@app.get("/whatsapp/status")
async def get_wa_status(db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return await _module_get_wa_status_route(
        db=db,
        current_user=current_user,
    )

@app.get("/transactions", response_model=List[schemas.TransactionResponse])
async def get_transactions(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    limit: int = Query(1000, ge=1, le=5000),
):
    return await _module_get_transactions_route(
        current_user=current_user,
        db=db,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        ensure_current_user_household=_ensure_current_user_household,
        backfill_wallet_transfer_categories=_backfill_wallet_transfer_categories,
        is_wallet_transfer_signature=_is_wallet_transfer_signature,
        is_debt_movement_signature=_is_debt_movement_signature,
    )

@app.get("/transactions/map", response_model=List[schemas.TransactionMapPoint])
async def get_transaction_map_points(
    month: str | None = Query(default=None, description="YYYY-MM"),
    limit: int = Query(default=500, ge=1, le=2000),
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_get_transaction_map_points_route(
        month=month,
        limit=limit,
        current_user=current_user,
        db=db,
    )

@app.post("/transactions/locations/sync")
async def sync_transaction_location_names(
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_sync_transaction_location_names_route(
        limit=limit,
        current_user=current_user,
        db=db,
    )

@app.get("/transactions/{txn_id}")
async def get_transaction_detail(txn_id: str, request: Request, current_user: models.User = Depends(get_current_user), db: AsyncSession = Depends(database.get_db)):
    return await _module_get_transaction_detail_route(
        txn_id=txn_id,
        request=request,
        current_user=current_user,
        db=db,
        ensure_current_user_household=_ensure_current_user_household,
        backfill_wallet_transfer_categories=_backfill_wallet_transfer_categories,
        serialize_attachment=_serialize_attachment,
        serialize_transaction_item=_serialize_transaction_item,
        is_wallet_transfer_signature=_is_wallet_transfer_signature,
        is_debt_movement_signature=_is_debt_movement_signature,
    )


@app.get("/transactions/{txn_id}/attachments", response_model=List[schemas.AttachmentResponse])
async def get_transaction_attachments(txn_id: str, request: Request, current_user: models.User = Depends(get_current_user), db: AsyncSession = Depends(database.get_db)):
    return await _module_get_transaction_attachments_route(
        txn_id=txn_id,
        request=request,
        current_user=current_user,
        db=db,
        get_user_transaction=_get_user_transaction,
        serialize_attachment=_serialize_attachment,
    )


@app.post("/transactions/{txn_id}/attachments", response_model=schemas.AttachmentResponse)
async def upload_transaction_attachment(
    txn_id: str,
    request: Request,
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_upload_transaction_attachment_route(
        txn_id=txn_id,
        request=request,
        file=file,
        current_user=current_user,
        db=db,
        get_user_transaction=_get_user_transaction,
        serialize_attachment=_serialize_attachment,
        delete_storage_object_safe=_delete_storage_object_safe,
    )


@app.get("/attachments/{attachment_id}/file", name="get_attachment_file")
async def get_attachment_file(attachment_id: int, current_user: models.User = Depends(get_current_user), db: AsyncSession = Depends(database.get_db)):
    return await _module_get_attachment_file_route(
        attachment_id=attachment_id,
        current_user=current_user,
        db=db,
        get_user_attachment=_get_user_attachment,
    )


@app.get("/attachments/{attachment_id}/pdf-preview")
async def get_attachment_pdf_preview(attachment_id: int, current_user: models.User = Depends(get_current_user), db: AsyncSession = Depends(database.get_db)):
    return await _module_get_attachment_pdf_preview_route(
        attachment_id=attachment_id,
        current_user=current_user,
        db=db,
        get_user_attachment=_get_user_attachment,
    )


@app.delete("/attachments/{attachment_id}")
async def delete_attachment(attachment_id: int, current_user: models.User = Depends(get_current_user), db: AsyncSession = Depends(database.get_db)):
    return await _module_delete_attachment_route(
        attachment_id=attachment_id,
        current_user=current_user,
        db=db,
        get_user_attachment=_get_user_attachment,
        delete_storage_object_safe=_delete_storage_object_safe,
    )


@app.get("/receipts")
async def get_receipts(
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
    month_key: Optional[str] = None,
    category_id: Optional[int] = None,
    q: Optional[str] = None,
    limit: int = 60,
    offset: int = 0,
):
    return await _module_get_receipts_route(
        request=request,
        current_user=current_user,
        db=db,
        serialize_attachment=_serialize_attachment,
        month_key=month_key,
        category_id=category_id,
        q=q,
        limit=limit,
        offset=offset,
    )

@app.put("/transactions/{txn_id}")
async def update_transaction(txn_id: str, txn_in: schemas.TransactionCreate, current_user: models.User = Depends(get_current_user), db: AsyncSession = Depends(database.get_db)):
    return await _module_update_transaction_route(
        txn_id=txn_id,
        txn_in=txn_in,
        current_user=current_user,
        db=db,
        get_user_transaction=_get_user_transaction,
        ensure_current_user_household=_ensure_current_user_household,
        backfill_wallet_transfer_categories=_backfill_wallet_transfer_categories,
        is_wallet_transfer_signature=_is_wallet_transfer_signature,
        is_debt_movement_signature=_is_debt_movement_signature,
        coerce_transaction_date=_coerce_transaction_date,
        resolve_transaction_category_id=_resolve_transaction_category_id,
        normalize_transaction_items_payload=_normalize_transaction_items_payload,
        validate_transaction_type=_validate_transaction_type,
        get_accessible_wallet=_get_accessible_wallet,
        select_transaction_wallet=_select_transaction_wallet,
        ensure_wallet_can_cover_expense=_ensure_wallet_can_cover_expense,
        normalize_transaction_location=_normalize_transaction_location,
        replace_transaction_items=_replace_transaction_items,
        publish_realtime_to_household=publish_realtime_to_household,
    )

@app.delete("/transactions/{txn_id}")
async def delete_transaction(txn_id: str, current_user: models.User = Depends(get_current_user), db: AsyncSession = Depends(database.get_db)):
    return await _module_delete_transaction_route(
        txn_id=txn_id,
        current_user=current_user,
        db=db,
        get_user_transaction=_get_user_transaction,
        ensure_current_user_household=_ensure_current_user_household,
        backfill_wallet_transfer_categories=_backfill_wallet_transfer_categories,
        is_wallet_transfer_signature=_is_wallet_transfer_signature,
        is_debt_movement_signature=_is_debt_movement_signature,
        delete_storage_object_safe=_delete_storage_object_safe,
        publish_realtime_to_household=publish_realtime_to_household,
    )

@app.post("/transactions/{txn_id}/refund")
async def refund_transaction(
    txn_id: str,
    refund_body: dict = Body(...),
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    refund_amount = float(refund_body.get("refund_amount", 0))
    return await _module_refund_transaction_route(
        txn_id=txn_id,
        refund_amount=refund_amount,
        current_user=current_user,
        db=db,
        get_user_transaction=_get_user_transaction,
        ensure_current_user_household=_ensure_current_user_household,
        backfill_wallet_transfer_categories=_backfill_wallet_transfer_categories,
        is_wallet_transfer_signature=_is_wallet_transfer_signature,
        is_debt_movement_signature=_is_debt_movement_signature,
        select_transaction_wallet=_select_transaction_wallet,
        resolve_transaction_category_id=_resolve_transaction_category_id,
        validate_transaction_type=_validate_transaction_type,
        coerce_transaction_date=_coerce_transaction_date,
        current_business_date_fn=current_business_date,
        publish_realtime_to_household=publish_realtime_to_household,
    )

@app.post("/transactions", response_model=schemas.TransactionResponse)
async def create_transaction(txn_in: schemas.TransactionCreate, current_user: models.User = Depends(get_current_user), db: AsyncSession = Depends(database.get_db)):
    return await _module_create_transaction_route(
        txn_in=txn_in,
        current_user=current_user,
        db=db,
        select_transaction_wallet=_select_transaction_wallet,
        normalize_transaction_items_payload=_normalize_transaction_items_payload,
        validate_transaction_type=_validate_transaction_type,
        ensure_wallet_can_cover_expense=_ensure_wallet_can_cover_expense,
        resolve_transaction_category_id=_resolve_transaction_category_id,
        normalize_transaction_location=_normalize_transaction_location,
        coerce_transaction_date=_coerce_transaction_date,
        current_business_date_fn=current_business_date,
        replace_transaction_items=_replace_transaction_items,
        publish_realtime_to_household=publish_realtime_to_household,
    )

def _ensure_worker_running():
    """Watchdog: Checks if Port 8024 is alive, restarts worker if not."""
    return _module_ensure_worker_running_route(
        worker_base_url=WORKER_BASE_URL,
        app_root="/home/digitalport2budget/htdocs/budget.digitalport.my",
    )

# WhatsApp Webhook
def _sanitize_input(text: str) -> str:
    """Strips HTML tags and checks for malicious patterns."""
    if not text:
        return ""
    # Strip HTML tags
    clean = re.sub(r'<[^>]*>', '', text)
    # Check for malicious patterns
    malicious_patterns = [
        r'javascript:',
        r'data:text/html',
        r'vbscript:',
        r'onclick',
        r'onerror',
        r'onload',
    ]
    for pattern in malicious_patterns:
        if re.search(pattern, clean, re.IGNORECASE):
            # In bot processing, we might just strip the malicious parts instead of raising 400
            # but for now let's be strict if they try to send script keywords
            raise HTTPException(status_code=400, detail="Malicious input detected.")
    return clean

async def _process_bot_input(
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
):
    return await _module_process_bot_input_route(
        db,
        user_id=user_id,
        phone=phone,
        text=text,
        media_payload=media_payload,
        media_mime_type=media_mime_type,
        media_file_name=media_file_name,
        media_object_key=media_object_key,
        media_size_bytes=media_size_bytes,
        latitude=latitude,
        longitude=longitude,
        location_name=location_name,
        target_txn_ref=target_txn_ref,
        source_channel=source_channel,
        is_reply_message=is_reply_message,
        show_current_balance=show_current_balance,
        show_expense_amount=show_expense_amount,
        show_income_amount=show_income_amount,
        normalize_transaction_location=_normalize_transaction_location,
    )


def _build_whatsapp_message_key(payload: WhatsAppWebhookPayload, media_payload: bytes | None) -> str:
    if payload.message_id:
        return f"msg:{payload.message_id.strip()}"

    media_hash = "-"
    if media_payload:
        media_hash = hashlib.sha256(media_payload).hexdigest()

    raw_parts = [
        payload.user_id.strip(),
        (payload.phone or "").strip(),
        str(payload.message_timestamp or ""),
        (payload.group_jid or "").strip(),
        (payload.participant_jid or "").strip(),
        (payload.text or "").strip(),
        str(payload.latitude if payload.latitude is not None else ""),
        str(payload.longitude if payload.longitude is not None else ""),
        (payload.location_name or "").strip(),
        media_hash,
    ]
    fingerprint = hashlib.sha256("|".join(raw_parts).encode("utf-8")).hexdigest()
    return f"fp:{fingerprint}"


async def _mark_whatsapp_event_if_new(
    db: AsyncSession,
    *,
    user_id: str,
    source_channel: str,
    message_key: str,
) -> bool:
    inbound_event = models.WhatsAppInboundEvent(
        user_id=user_id,
        source_channel=source_channel,
        message_key=message_key,
    )
    db.add(inbound_event)
    try:
        await db.commit()
        return True
    except IntegrityError:
        await db.rollback()
        return False


def _has_valid_whatsapp_webhook_secret(request: Request) -> bool:
    provided_secret = request.headers.get("x-whatsapp-webhook-secret", "")
    if not provided_secret or not WHATSAPP_WEBHOOK_SECRET:
        return False
    return hmac.compare_digest(provided_secret, WHATSAPP_WEBHOOK_SECRET)


def _is_loopback_request(request: Request) -> bool:
    if not request.client or not request.client.host:
        return False
    client_host = request.client.host.strip()
    if not client_host:
        return False
    if client_host == "localhost":
        return True
    if client_host.startswith("::ffff:"):
        client_host = client_host[7:]
    try:
        return ipaddress.ip_address(client_host).is_loopback
    except ValueError:
        return False


def _removed_business_inbox_normalize_phone(value: str | None) -> str:
    return re.sub(r"\D", "", str(value or "").strip())


def _removed_business_inbox_fallback_text(*, text: str | None, message_type: str | None) -> str | None:
    cleaned = str(text or "").strip()
    if cleaned:
        return cleaned
    kind = str(message_type or "").strip().lower()
    labels = {
        "image": "[Imej diterima]",
        "document": "[Dokumen diterima]",
        "video": "[Video diterima]",
        "audio": "[Audio diterima]",
        "sticker": "[Sticker diterima]",
        "location": "[Lokasi diterima]",
    }
    return labels.get(kind) or None


async def _removed_business_inbox_get_or_create_thread(
    db: AsyncSession,
    *,
    user_id: str,
    source_channel: str,
    customer_phone: str,
    customer_name: str | None = None,
) -> models.RemovedBusinessInboxThread:
    normalized_phone = _removed_business_inbox_normalize_phone(customer_phone)
    stmt = select(models.RemovedBusinessInboxThread).where(
        models.RemovedBusinessInboxThread.user_id == user_id,
        models.RemovedBusinessInboxThread.source_channel == source_channel,
        models.RemovedBusinessInboxThread.customer_phone == normalized_phone,
    )
    result = await db.execute(stmt)
    thread = result.scalar_one_or_none()
    if thread is None:
        thread = models.RemovedBusinessInboxThread(
            user_id=user_id,
            source_channel=source_channel,
            customer_phone=normalized_phone,
            customer_name=(str(customer_name or '').strip() or None),
        )
        db.add(thread)
        await db.flush()
    elif customer_name and (not thread.customer_name or thread.customer_name != customer_name.strip()):
        thread.customer_name = customer_name.strip()
        await db.flush()
    return thread


async def _removed_business_inbox_persist_message(
    db: AsyncSession,
    *,
    user_id: str,
    source_channel: str,
    customer_phone: str,
    customer_name: str | None,
    direction: str,
    text: str | None,
    message_type: str | None = None,
    external_message_id: str | None = None,
) -> models.RemovedBusinessInboxMessage | None:
    normalized_phone = _removed_business_inbox_normalize_phone(customer_phone)
    if not normalized_phone:
        return None
    thread = await _removed_business_inbox_get_or_create_thread(
        db,
        user_id=user_id,
        source_channel=source_channel,
        customer_phone=normalized_phone,
        customer_name=customer_name,
    )
    message_text = _removed_business_inbox_fallback_text(text=text, message_type=message_type)
    if external_message_id:
        dup_result = await db.execute(
            select(models.RemovedBusinessInboxMessage).where(
                models.RemovedBusinessInboxMessage.thread_id == thread.id,
                models.RemovedBusinessInboxMessage.external_message_id == external_message_id,
            )
        )
        if dup_result.scalar_one_or_none() is not None:
            return None
    now = datetime.utcnow()
    message = models.RemovedBusinessInboxMessage(
        thread_id=thread.id,
        user_id=user_id,
        source_channel=source_channel,
        direction=direction,
        message_type=(str(message_type or '').strip() or None),
        text=message_text,
        external_message_id=(str(external_message_id or '').strip() or None),
        created_at=now,
    )
    db.add(message)
    thread.last_message_text = message_text
    thread.last_message_direction = direction
    thread.last_message_at = now
    thread.updated_at = now
    if direction == 'incoming':
        thread.unread_count = int(thread.unread_count or 0) + 1
    await db.commit()
    await db.refresh(message)
    return message


def _serialize_removed_business_inbox_thread(thread: models.RemovedBusinessInboxThread) -> schemas.RemovedBusinessInboxThreadResponse:
    return schemas.RemovedBusinessInboxThreadResponse(
        id=thread.id,
        source_channel=thread.source_channel,
        customer_phone=thread.customer_phone,
        customer_name=thread.customer_name,
        last_message_text=thread.last_message_text,
        last_message_direction=thread.last_message_direction,
        last_message_at=thread.last_message_at,
        unread_count=int(thread.unread_count or 0),
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


def _serialize_removed_business_inbox_message(message: models.RemovedBusinessInboxMessage) -> schemas.RemovedBusinessInboxMessageResponse:
    return schemas.RemovedBusinessInboxMessageResponse(
        id=message.id,
        thread_id=message.thread_id,
        source_channel=message.source_channel,
        direction=message.direction,
        message_type=message.message_type,
        text=message.text,
        external_message_id=message.external_message_id,
        created_at=message.created_at,
    )


async def _resolve_cloud_api_user_id(db: AsyncSession, phone_number_id: str | None) -> str | None:
    target = (phone_number_id or '').strip()
    if not target:
        return None
    result = await db.execute(
        select(models.UserSetting).where(models.UserSetting.key == 'removed_business_whatsapp_cloud_api')
    )
    for row in result.scalars().all():
        try:
            data = json.loads(row.value or '{}')
        except Exception:
            data = {}
        if not isinstance(data, dict):
            continue
        if str(data.get('phone_number_id') or '').strip() == target:
            return row.user_id
    return None

async def _fetch_cloud_api_media_attachment(
    *,
    access_token: str | None,
    media_id: str | None,
    fallback_mime_type: str | None = None,
    fallback_file_name: str | None = None,
) -> tuple[bytes | None, str | None, str | None]:
    token = str(access_token or '').strip()
    target_media_id = str(media_id or '').strip()
    if not token or not target_media_id:
        return None, None, None

    try:
        async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as client:
            meta_response = await client.get(
                f'https://graph.facebook.com/v23.0/{target_media_id}',
                headers={'Authorization': f'Bearer {token}'},
                params={'fields': 'url,mime_type,file_size,sha256'},
            )
            meta_response.raise_for_status()
            meta_payload = meta_response.json() if meta_response.content else {}
            media_url = str((meta_payload or {}).get('url') or '').strip()
            if not media_url:
                return None, None, None
            mime_type = str((meta_payload or {}).get('mime_type') or fallback_mime_type or '').strip() or None

            file_response = await client.get(
                media_url,
                headers={'Authorization': f'Bearer {token}'},
            )
            file_response.raise_for_status()
            payload = file_response.content
            if not payload:
                return None, None, None

            resolved_name = str(fallback_file_name or '').strip() or f'whatsapp-media-{target_media_id}'
            if '.' not in Path(resolved_name).name:
                guessed_ext = mimetypes.guess_extension(mime_type or '') or ''
                if guessed_ext == '.jpe':
                    guessed_ext = '.jpg'
                resolved_name = f'{resolved_name}{guessed_ext}' if guessed_ext else resolved_name
            return payload, mime_type, resolved_name
    except Exception as exc:
        print(f'[cloud-webhook][api] media fetch failed media_id={target_media_id}: {exc}')
        return None, fallback_mime_type, fallback_file_name


def _extract_cloud_api_messages(payload: dict[str, Any]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for entry in payload.get('entry') or []:
        if not isinstance(entry, dict):
            continue
        for change in entry.get('changes') or []:
            if not isinstance(change, dict):
                continue
            value = change.get('value') or {}
            metadata = value.get('metadata') or {}
            contacts = value.get('contacts') or []
            contact_name = None
            if contacts and isinstance(contacts[0], dict):
                profile = contacts[0].get('profile') or {}
                contact_name = str(profile.get('name') or '').strip() or None
            for msg in value.get('messages') or []:
                if not isinstance(msg, dict):
                    continue
                message_type = str(msg.get('type') or '').strip().lower()
                media_payload = msg.get(message_type) if isinstance(msg.get(message_type), dict) else {}
                text_value = ''
                latitude = None
                longitude = None
                location_name = None
                if message_type == 'text':
                    text_value = str((msg.get('text') or {}).get('body') or '').strip()
                elif message_type in {'image', 'document', 'video', 'audio', 'sticker'}:
                    text_value = str((media_payload or {}).get('caption') or '').strip()
                elif message_type == 'location':
                    location_payload = msg.get('location') if isinstance(msg.get('location'), dict) else {}
                    latitude = location_payload.get('latitude')
                    longitude = location_payload.get('longitude')
                    location_name = str(location_payload.get('name') or location_payload.get('address') or '').strip() or None
                    text_value = location_name or ''
                messages.append({
                    'message_id': str(msg.get('id') or '').strip() or None,
                    'phone_number_id': str(metadata.get('phone_number_id') or '').strip() or None,
                    'from': str(msg.get('from') or '').strip() or None,
                    'customer_name': contact_name,
                    'text': text_value,
                    'type': message_type,
                    'media_id': str((media_payload or {}).get('id') or '').strip() or None,
                    'media_mime_type': str((media_payload or {}).get('mime_type') or '').strip() or None,
                    'media_file_name': str((media_payload or {}).get('filename') or '').strip() or None,
                    'latitude': latitude,
                    'longitude': longitude,
                    'location_name': location_name,
                    'raw': msg,
                })
    return messages

def _ensure_valid_whatsapp_worker_request(request: Request) -> None:
    if not _has_valid_whatsapp_webhook_secret(request):
        raise HTTPException(status_code=401, detail="Unauthorized webhook")
    if WHATSAPP_WEBHOOK_LOCAL_ONLY and not _is_loopback_request(request):
        raise HTTPException(status_code=403, detail="Webhook only accepts local worker requests")

def _generate_telegram_pair_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "BD-" + "".join(secrets.choice(alphabet) for _ in range(5))


def _build_telegram_choice_keyboard(rows: list[list[str]]) -> dict[str, Any]:
    return _module_build_telegram_choice_keyboard_route(rows)

def _build_telegram_inline_keyboard(rows: list[list[tuple[str, str] | tuple[str, str, str]]]) -> dict[str, Any]:
    return _module_build_telegram_inline_keyboard_route(rows)

def _telegram_is_bm(language: str | None) -> bool:
    return (language or "BM").upper() == "BM"

def _build_telegram_keyboard(linked: bool) -> dict[str, Any] | None:
    return _module_build_telegram_keyboard_route(linked)

def _normalize_telegram_command(text: str) -> str:
    return _module_normalize_telegram_command_route(text)


def _build_telegram_message_key(update_id: int | None, message_id: int | None, chat_id: str, text: str) -> str:
    return _module_build_telegram_message_key_route(update_id, message_id, chat_id, text)


def _has_valid_telegram_webhook_secret(request: Request) -> bool:
    return _module_has_valid_telegram_webhook_secret_route(
        request=request,
        telegram_webhook_secret=TELEGRAM_WEBHOOK_SECRET,
    )


async def _telegram_api_request(method: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    return await _module_telegram_api_request_route(
        method=method,
        payload=payload,
        telegram_bot_token=TELEGRAM_BOT_TOKEN,
    )

async def _edit_telegram_message_text(
    chat_id: str,
    message_id: int | str | None,
    text: str,
    *,
    reply_markup: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await _module_edit_telegram_message_text_route(
        chat_id=chat_id,
        message_id=message_id,
        text=text,
        reply_markup=reply_markup,
        telegram_api_request=_telegram_api_request,
    )

async def _answer_telegram_callback(callback_query_id: str | None, text: str | None = None) -> None:
    await _module_answer_telegram_callback_route(
        callback_query_id=callback_query_id,
        text=text,
        telegram_api_request=_telegram_api_request,
    )

async def _sync_telegram_bot_commands() -> None:
    await _module_sync_telegram_bot_commands_route(
        telegram_bot_token=TELEGRAM_BOT_TOKEN,
        telegram_api_request=_telegram_api_request,
    )

async def _download_telegram_file(file_id: str, *, expected_size_bytes: int | None = None) -> tuple[bytes, str | None] | None:
    return await _module_download_telegram_file_route(
        file_id=file_id,
        expected_size_bytes=expected_size_bytes,
        telegram_bot_token=TELEGRAM_BOT_TOKEN,
        telegram_max_media_bytes=TELEGRAM_MAX_MEDIA_BYTES,
        telegram_api_request=_telegram_api_request,
    )


async def _send_telegram_message(
    chat_id: str,
    text: str,
    *,
    linked: bool = False,
    reply_markup: dict[str, Any] | None = None,
    parse_mode: str = "Markdown",
) -> dict[str, Any] | None:
    return await _module_send_telegram_message_route(
        chat_id=chat_id,
        text=text,
        linked=linked,
        reply_markup=reply_markup,
        build_telegram_keyboard=_build_telegram_keyboard,
        telegram_api_request=_telegram_api_request,
        parse_mode=parse_mode,
    )


async def _delete_telegram_message(chat_id: str, message_id: int | str | None) -> None:
    await _module_delete_telegram_message_route(
        chat_id=chat_id,
        message_id=message_id,
        telegram_api_request=_telegram_api_request,
    )

async def _get_telegram_link_by_user_id(db: AsyncSession, user_id: str) -> models.TelegramLink | None:
    return await _module_get_telegram_link_by_user_id_route(
        db=db,
        user_id=user_id,
    )


async def _get_telegram_link_by_identity(db: AsyncSession, telegram_user_id: str) -> models.TelegramLink | None:
    return await _module_get_telegram_link_by_identity_route(
        db=db,
        telegram_user_id=telegram_user_id,
    )


async def _get_telegram_link_by_identity_any_state(db: AsyncSession, telegram_user_id: str) -> models.TelegramLink | None:
    return await _module_get_telegram_link_by_identity_any_state_route(
        db=db,
        telegram_user_id=telegram_user_id,
    )


async def _mark_telegram_event_if_new(
    db: AsyncSession,
    *,
    telegram_user_id: str,
    telegram_chat_id: str,
    message_key: str,
) -> bool:
    return await _module_mark_telegram_event_if_new_route(
        db=db,
        telegram_user_id=telegram_user_id,
        telegram_chat_id=telegram_chat_id,
        message_key=message_key,
    )


async def _consume_telegram_pair_code(
    db: AsyncSession,
    *,
    code: str,
    telegram_user_id: str,
    telegram_chat_id: str,
    telegram_username: str | None,
    telegram_first_name: str | None,
    telegram_last_name: str | None,
) -> str | None:
    return await _module_consume_telegram_pair_code_route(
        db=db,
        code=code,
        telegram_user_id=telegram_user_id,
        telegram_chat_id=telegram_chat_id,
        telegram_username=telegram_username,
        telegram_first_name=telegram_first_name,
        telegram_last_name=telegram_last_name,
        telegram_pair_code_max_attempts=TELEGRAM_PAIR_CODE_MAX_ATTEMPTS,
        get_telegram_link_by_identity=_get_telegram_link_by_identity,
        get_telegram_link_by_user_id=_get_telegram_link_by_user_id,
        get_telegram_link_by_identity_any_state=_get_telegram_link_by_identity_any_state,
    )


@app.post("/internal/push/whatsapp-reconnect", response_model=schemas.InternalPushResponse)
async def internal_push_whatsapp_reconnect(
    payload: schemas.InternalWhatsAppReconnectPushRequest,
    request: Request,
):
    _ensure_valid_whatsapp_worker_request(request)
    return {"ok": True}

@app.post("/telegram/link/request", response_model=schemas.TelegramLinkRequestResponse)
async def request_telegram_link(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_request_telegram_link_route(
        current_user=current_user,
        db=db,
        generate_telegram_pair_code=_generate_telegram_pair_code,
        telegram_pair_code_ttl_minutes=TELEGRAM_PAIR_CODE_TTL_MINUTES,
        telegram_bot_username=TELEGRAM_BOT_USERNAME,
    )

@app.get("/telegram/link/status", response_model=schemas.TelegramLinkStatusResponse)
async def get_telegram_link_status(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_get_telegram_link_status_route(
        current_user=current_user,
        db=db,
        get_telegram_link_by_user_id=_get_telegram_link_by_user_id,
        telegram_bot_username=TELEGRAM_BOT_USERNAME,
    )

@app.delete("/telegram/link", response_model=schemas.TelegramUnlinkResponse)
async def unlink_telegram(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_unlink_telegram_route(
        current_user=current_user,
        db=db,
        get_telegram_link_by_user_id=_get_telegram_link_by_user_id,
    )

def _telegram_pending_media_key(user_id: str, chat_id: str) -> str:
    return _module_telegram_pending_media_key_route(user_id, chat_id)


def _set_telegram_pending_media(user_id: str, chat_id: str, payload: dict[str, Any]) -> None:
    _module_set_telegram_pending_media_route(
        user_id=user_id,
        chat_id=chat_id,
        payload=payload,
        pending_media=TELEGRAM_PENDING_MEDIA,
        ttl_seconds=TELEGRAM_PENDING_MEDIA_TTL_SECONDS,
        telegram_pending_media_key=_telegram_pending_media_key,
    )


def _pop_telegram_pending_media(user_id: str, chat_id: str) -> dict[str, Any] | None:
    return _module_pop_telegram_pending_media_route(
        user_id=user_id,
        chat_id=chat_id,
        pending_media=TELEGRAM_PENDING_MEDIA,
        telegram_pending_media_key=_telegram_pending_media_key,
    )


def _sweep_telegram_pending_media() -> None:
    _module_sweep_telegram_pending_media_route(
        pending_media=TELEGRAM_PENDING_MEDIA,
    )


def _telegram_add_flow_key(user_id: str, chat_id: str) -> str:
    return _module_telegram_add_flow_key_route(user_id, chat_id)


def _set_telegram_add_flow(user_id: str, chat_id: str, payload: dict[str, Any]) -> None:
    _module_set_telegram_add_flow_route(
        user_id=user_id,
        chat_id=chat_id,
        payload=payload,
        add_flows=TELEGRAM_ADD_FLOWS,
        ttl_seconds=TELEGRAM_ADD_FLOW_TTL_SECONDS,
        telegram_add_flow_key=_telegram_add_flow_key,
    )


def _get_telegram_add_flow(user_id: str, chat_id: str) -> dict[str, Any] | None:
    return _module_get_telegram_add_flow_route(
        user_id=user_id,
        chat_id=chat_id,
        add_flows=TELEGRAM_ADD_FLOWS,
        telegram_add_flow_key=_telegram_add_flow_key,
    )


def _clear_telegram_add_flow(user_id: str, chat_id: str) -> None:
    _module_clear_telegram_add_flow_route(
        user_id=user_id,
        chat_id=chat_id,
        add_flows=TELEGRAM_ADD_FLOWS,
        telegram_add_flow_key=_telegram_add_flow_key,
    )


def _remember_telegram_add_flow_message(user_id: str, chat_id: str, message_id: int | None) -> None:
    _module_remember_telegram_add_flow_message_route(
        user_id=user_id,
        chat_id=chat_id,
        message_id=message_id,
        get_telegram_add_flow=_get_telegram_add_flow,
        set_telegram_add_flow=_set_telegram_add_flow,
    )


async def _cleanup_telegram_add_flow_messages(chat_id: str, flow: dict[str, Any] | None) -> None:
    await _module_cleanup_telegram_add_flow_messages_route(
        chat_id=chat_id,
        flow=flow,
        delete_telegram_message=_delete_telegram_message,
    )


async def _send_telegram_add_flow_message(
    *,
    chat_id: str,
    user_id: str,
    text: str,
    linked: bool = True,
    reply_markup: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await _module_send_telegram_add_flow_message_route(
        chat_id=chat_id,
        user_id=user_id,
        text=text,
        linked=linked,
        reply_markup=reply_markup,
        send_telegram_message=_send_telegram_message,
        remember_telegram_add_flow_message=_remember_telegram_add_flow_message,
    )


def _sweep_telegram_add_flows() -> None:
    _module_sweep_telegram_add_flows_route(
        add_flows=TELEGRAM_ADD_FLOWS,
    )

def _format_telegram_amount_preview(amount_text: str) -> str:
    return _module_format_telegram_amount_preview_route(amount_text)


def _parse_telegram_amount_text(text: str) -> float | None:
    return _module_parse_telegram_amount_text_route(
        text=text,
        extract_amount=whatsapp_service.extract_amount,
    )


def _build_telegram_add_type_keyboard(is_bm: bool) -> dict[str, Any]:
    return _module_build_telegram_add_type_keyboard_route(
        is_bm=is_bm,
        build_telegram_inline_keyboard=_build_telegram_inline_keyboard,
    )


def _build_telegram_debt_type_keyboard(is_bm: bool) -> dict[str, Any]:
    return _module_build_telegram_debt_type_keyboard_route(
        is_bm=is_bm,
        build_telegram_inline_keyboard=_build_telegram_inline_keyboard,
    )


def _build_telegram_transfer_wallet_keyboard(wallets: list[models.Wallet], *, mode: str, is_bm: bool) -> dict[str, Any]:
    return _module_build_telegram_transfer_wallet_keyboard_route(
        wallets=wallets,
        mode=mode,
        is_bm=is_bm,
        wallet_label=_wallet_label,
        build_telegram_inline_keyboard=_build_telegram_inline_keyboard,
    )


def _build_telegram_debt_help_text(is_bm: bool) -> str:
    return _module_build_telegram_debt_help_text_route(is_bm)


def _build_telegram_transfer_help_text(is_bm: bool) -> str:
    return _module_build_telegram_transfer_help_text_route(is_bm)


def _build_telegram_loan_help_text(is_bm: bool) -> str:
    return _module_build_telegram_loan_help_text_route(is_bm)


def _match_wallet_by_hint(wallets: list[models.Wallet], hint: str | None) -> models.Wallet | None:
    return _module_match_wallet_by_hint_route(
        wallets=wallets,
        hint=hint,
        wallet_label=_wallet_label,
    )

async def _handle_telegram_loanx_command(
    db: AsyncSession,
    *,
    current_user: models.User,
    chat_id: str,
    command_text: str,
    is_bm: bool,
) -> bool:
    return await _module_handle_telegram_loanx_command_route(
        db,
        current_user=current_user,
        chat_id=chat_id,
        command_text=command_text,
        is_bm=is_bm,
        _send_telegram_message=_send_telegram_message,
        _build_telegram_loan_help_text=_build_telegram_loan_help_text,
        _ensure_current_user_household=_ensure_current_user_household,
        _match_wallet_by_hint=_match_wallet_by_hint,
        _wallet_label=_wallet_label,
        _select_transaction_wallet=_select_transaction_wallet,
        _get_accessible_wallets_for_user=_get_accessible_wallets_for_user,
        _get_loan_payment_category_id=_get_loan_payment_category_id,
        _ensure_wallet_can_cover_expense=_ensure_wallet_can_cover_expense,
        current_business_date=current_business_date,
    )

async def _handle_telegram_splitx_command(
    db: AsyncSession,
    *,
    current_user: models.User,
    chat_id: str,
    command_text: str,
    is_bm: bool,
) -> bool:
    return await _module_handle_telegram_splitx_command_route(
        db,
        current_user=current_user,
        chat_id=chat_id,
        command_text=command_text,
        is_bm=is_bm,
        _send_telegram_message=_send_telegram_message,
        _wallet_label=_wallet_label,
        _get_accessible_wallets_for_user=_get_accessible_wallets_for_user,
        _match_wallet_by_hint=_match_wallet_by_hint,
        _select_transaction_wallet=_select_transaction_wallet,
    )

def _build_telegram_add_category_keyboard(categories: list[models.Category], *, is_bm: bool, page: int = 0) -> dict[str, Any]:
    return _module_build_telegram_add_category_keyboard_route(
        categories=categories,
        is_bm=is_bm,
        page=page,
        build_telegram_inline_keyboard=_build_telegram_inline_keyboard,
    )


def _build_telegram_numeric_choice_keyboard(reply_text: str | None, *, is_bm: bool) -> dict[str, Any] | None:
    return _module_build_telegram_numeric_choice_keyboard_route(
        reply_text=reply_text,
        is_bm=is_bm,
        build_telegram_choice_keyboard=_build_telegram_choice_keyboard,
    )


async def _get_telegram_wallets_for_user(db: AsyncSession, user_id: str) -> list[models.Wallet]:
    return await _module_get_telegram_wallets_for_user_route(
        db=db,
        user_id=user_id,
        get_accessible_wallets_for_user=_get_accessible_wallets_for_user,
        ensure_wallet=ensure_wallet,
    )


def _build_telegram_wallet_keyboard(wallets: list[models.Wallet], *, is_bm: bool) -> dict[str, Any]:
    return _module_build_telegram_wallet_keyboard_route(
        wallets=wallets,
        is_bm=is_bm,
        wallet_label=_wallet_label,
        build_telegram_choice_keyboard=_build_telegram_choice_keyboard,
    )


def _match_telegram_wallet_choice(text: str, wallets: list[models.Wallet]) -> models.Wallet | None:
    return _module_match_telegram_wallet_choice_route(
        text=text,
        wallets=wallets,
        wallet_label=_wallet_label,
    )


async def _get_telegram_categories_by_kind(db: AsyncSession, user_id: str, *, kind: str) -> list[models.Category]:
    return await _module_get_telegram_categories_by_kind_route(
        db=db,
        user_id=user_id,
        kind=kind,
    )


async def _get_telegram_categories_menu_text(db: AsyncSession, user_id: str, *, is_bm: bool) -> str:
    return await _module_get_telegram_categories_menu_text_route(
        db=db,
        user_id=user_id,
        is_bm=is_bm,
    )

def _is_category_prompt_reply(reply_text: str | None) -> bool:
    return _module_is_category_prompt_reply_route(reply_text)


def _telegram_update_has_media(payload: TelegramWebhookPayload) -> bool:
    return _module_telegram_update_has_media_route(payload)


def _build_telegram_processing_text(payload: TelegramWebhookPayload) -> str:
    return _module_build_telegram_processing_text_route(payload)


def _build_telegram_add_preview_text(flow: dict[str, Any], *, is_bm: bool) -> str:
    return _module_build_telegram_add_preview_text_route(
        flow=flow,
        is_bm=is_bm,
        format_telegram_amount_preview=_format_telegram_amount_preview,
    )

async def _show_telegram_add_type_menu(
    *,
    chat_id: str,
    user_id: str,
    is_bm: bool,
    message_id: int | None = None,
) -> None:
    await _module_show_telegram_add_type_menu_route(
        chat_id=chat_id,
        user_id=user_id,
        is_bm=is_bm,
        message_id=message_id,
        set_telegram_add_flow=_set_telegram_add_flow,
        build_telegram_add_type_keyboard=_build_telegram_add_type_keyboard,
        remember_telegram_add_flow_message=_remember_telegram_add_flow_message,
        edit_telegram_message_text=_edit_telegram_message_text,
        send_telegram_message=_send_telegram_message,
    )


async def _show_telegram_add_category_menu(
    db: AsyncSession,
    *,
    chat_id: str,
    user_id: str,
    is_bm: bool,
    message_id: int | None = None,
    page: int = 0,
    kind: str = "expense",
) -> None:
    await _module_show_telegram_add_category_menu_route(
        db,
        chat_id=chat_id,
        user_id=user_id,
        is_bm=is_bm,
        message_id=message_id,
        page=page,
        kind=kind,
        get_telegram_categories_by_kind=_get_telegram_categories_by_kind,
        send_telegram_message=_send_telegram_message,
        set_telegram_add_flow=_set_telegram_add_flow,
        build_telegram_add_category_keyboard=_build_telegram_add_category_keyboard,
        remember_telegram_add_flow_message=_remember_telegram_add_flow_message,
        edit_telegram_message_text=_edit_telegram_message_text,
    )


async def _show_telegram_add_wallet_menu(
    db: AsyncSession,
    *,
    chat_id: str,
    user_id: str,
    is_bm: bool,
) -> None:
    await _module_show_telegram_add_wallet_menu_route(
        db,
        chat_id=chat_id,
        user_id=user_id,
        is_bm=is_bm,
        get_telegram_add_flow=_get_telegram_add_flow,
        get_telegram_wallets_for_user=_get_telegram_wallets_for_user,
        wallet_label=_wallet_label,
        set_telegram_add_flow=_set_telegram_add_flow,
        build_telegram_add_preview_text=_build_telegram_add_preview_text,
        send_telegram_message=_send_telegram_message,
        build_telegram_wallet_keyboard=_build_telegram_wallet_keyboard,
        remember_telegram_add_flow_message=_remember_telegram_add_flow_message,
    )

async def _handle_telegram_callback_query(
    callback_query: dict[str, Any],
    db: AsyncSession,
):
    return await _module_handle_telegram_callback_query_route(
        callback_query=callback_query,
        db=db,
        _get_telegram_link_by_identity=_get_telegram_link_by_identity,
        _telegram_is_bm=_telegram_is_bm,
        _answer_telegram_callback=_answer_telegram_callback,
        _get_telegram_add_flow=_get_telegram_add_flow,
        _show_telegram_add_type_menu=_show_telegram_add_type_menu,
        _clear_telegram_add_flow=_clear_telegram_add_flow,
        _cleanup_telegram_add_flow_messages=_cleanup_telegram_add_flow_messages,
        _edit_telegram_message_text=_edit_telegram_message_text,
        _get_telegram_wallets_for_user=_get_telegram_wallets_for_user,
        _set_telegram_add_flow=_set_telegram_add_flow,
        _remember_telegram_add_flow_message=_remember_telegram_add_flow_message,
        _build_telegram_transfer_wallet_keyboard=_build_telegram_transfer_wallet_keyboard,
        _show_telegram_add_category_menu=_show_telegram_add_category_menu,
        _get_telegram_categories_by_kind=_get_telegram_categories_by_kind,
        _build_telegram_add_preview_text=_build_telegram_add_preview_text,
        _send_telegram_add_flow_message=_send_telegram_add_flow_message,
        _wallet_label=_wallet_label,
    )


def _telegram_should_show_processing_before_handle(payload: TelegramWebhookPayload) -> bool:
    return _module_telegram_should_show_processing_before_handle_route(
        payload=payload,
        telegram_update_has_media=_telegram_update_has_media,
    )


async def _process_telegram_webhook_payload_background(payload_data: dict[str, Any]) -> None:
    await _module_process_telegram_webhook_payload_background_route(
        payload_data=payload_data,
        payload_model=TelegramWebhookPayload,
        telegram_should_show_processing_before_handle=_telegram_should_show_processing_before_handle,
        send_telegram_message=_send_telegram_message,
        build_telegram_processing_text=_build_telegram_processing_text,
        session_factory=database.SessionLocal,
        handle_telegram_webhook_payload=_handle_telegram_webhook_payload,
        delete_telegram_message=_delete_telegram_message,
    )


@app.post("/telegram/webhook")
async def telegram_webhook(
    payload: TelegramWebhookPayload,
    request: Request,
):
    return await _module_telegram_webhook_route(
        payload=payload,
        request=request,
        has_valid_telegram_webhook_secret=_has_valid_telegram_webhook_secret,
        telegram_update_has_media=_telegram_update_has_media,
        process_telegram_webhook_payload_background=_process_telegram_webhook_payload_background,
        session_factory=database.SessionLocal,
        handle_telegram_webhook_payload=_handle_telegram_webhook_payload,
    )

async def _handle_telegram_webhook_payload(
    payload: TelegramWebhookPayload,
    db: AsyncSession,
):
    return await _module_handle_telegram_webhook_payload_route(
        payload=payload,
        db=db,
        _handle_telegram_callback_query=_handle_telegram_callback_query,
        _send_telegram_message=_send_telegram_message,
        _sanitize_input=_sanitize_input,
        _build_telegram_message_key=_build_telegram_message_key,
        _mark_telegram_event_if_new=_mark_telegram_event_if_new,
        _get_telegram_link_by_identity=_get_telegram_link_by_identity,
        _consume_telegram_pair_code=_consume_telegram_pair_code,
        _telegram_is_bm=_telegram_is_bm,
        _download_telegram_file=_download_telegram_file,
        _normalize_telegram_command=_normalize_telegram_command,
        _build_telegram_debt_help_text=_build_telegram_debt_help_text,
        _build_telegram_loan_help_text=_build_telegram_loan_help_text,
        _handle_telegram_loanx_command=_handle_telegram_loanx_command,
        _handle_telegram_splitx_command=_handle_telegram_splitx_command,
        _build_telegram_transfer_help_text=_build_telegram_transfer_help_text,
        _sweep_telegram_pending_media=_sweep_telegram_pending_media,
        _sweep_telegram_add_flows=_sweep_telegram_add_flows,
        _get_telegram_add_flow=_get_telegram_add_flow,
        _remember_telegram_add_flow_message=_remember_telegram_add_flow_message,
        _clear_telegram_add_flow=_clear_telegram_add_flow,
        _cleanup_telegram_add_flow_messages=_cleanup_telegram_add_flow_messages,
        _parse_telegram_amount_text=_parse_telegram_amount_text,
        _send_telegram_add_flow_message=_send_telegram_add_flow_message,
        _show_telegram_add_type_menu=_show_telegram_add_type_menu,
        _get_telegram_wallets_for_user=_get_telegram_wallets_for_user,
        _build_telegram_wallet_keyboard=_build_telegram_wallet_keyboard,
        _set_telegram_add_flow=_set_telegram_add_flow,
        _match_telegram_wallet_choice=_match_telegram_wallet_choice,
        _show_telegram_add_wallet_menu=_show_telegram_add_wallet_menu,
        _get_telegram_categories_menu_text=_get_telegram_categories_menu_text,
        _show_telegram_add_category_menu=_show_telegram_add_category_menu,
        _process_bot_input=_process_bot_input,
        _is_category_prompt_reply=_is_category_prompt_reply,
        _set_telegram_pending_media=_set_telegram_pending_media,
        _pop_telegram_pending_media=_pop_telegram_pending_media,
        _delete_telegram_message=_delete_telegram_message,
        _build_telegram_numeric_choice_keyboard=_build_telegram_numeric_choice_keyboard,
    )


@app.post("/whatsapp/webhook")
async def whatsapp_webhook(
    payload: WhatsAppWebhookPayload,
    request: Request,
    db: AsyncSession = Depends(database.get_db),
):
    result = await _module_whatsapp_webhook_route(
        payload=payload,
        request=request,
        db=db,
        ensure_valid_whatsapp_worker_request=_ensure_valid_whatsapp_worker_request,
        sanitize_input=_sanitize_input,
        get_whatsapp_group_privacy_settings=_get_whatsapp_group_privacy_settings,
        build_whatsapp_message_key=_build_whatsapp_message_key,
        mark_whatsapp_event_if_new=_mark_whatsapp_event_if_new,
        removed_business_access_enabled=_removed_business_access_enabled,
        removed_business_access_enabled_for_user=_removed_business_access_enabled_for_user,
        removed_business_extract_whatsapp_phone_from_value=_removed_business_extract_whatsapp_phone_from_value,
        removed_business_normalize_phone=_removed_business_normalize_phone,
        removed_business_handle_incoming_order_payload=_removed_business_handle_incoming_order_payload,
        get_personal_prefix_mode_settings=_get_personal_prefix_mode_settings,
        strip_personal_prefix=_strip_personal_prefix,
        process_bot_input=_process_bot_input,
    )
    if isinstance(result, dict) and result.get("order_id"):
        await _removed_business_publish_orders_event(payload.user_id, "updated", int(result["order_id"]))
    return result

@app.post("/chat/uploads/presign")
async def create_chat_receipt_upload(
    payload: ChatUploadPresignRequest,
    current_user: models.User = Depends(get_current_user),
):
    return await _module_create_chat_receipt_upload_route(
        payload=payload,
        current_user=current_user,
        receipt_direct_upload_max_bytes=RECEIPT_DIRECT_UPLOAD_MAX_BYTES,
        receipt_direct_upload_expires_seconds=RECEIPT_DIRECT_UPLOAD_EXPIRES_SECONDS,
    )


@app.post("/chat/message")
async def send_web_chat_message(
    request: Request,
    text: str = Form(""),
    file: UploadFile | None = File(None),
    direct_upload_key: str | None = Form(None),
    direct_upload_file_name: str | None = Form(None),
    direct_upload_mime_type: str | None = Form(None),
    direct_upload_size_bytes: int | None = Form(None),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    location_name: str | None = Form(None),
    # Web chat bubble attach only — WhatsApp still uses webhook payload path.
    target_txn_ref: str | None = Form(None),
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_send_web_chat_message_route(
        request=request,
        text=text,
        file=file,
        direct_upload_key=direct_upload_key,
        direct_upload_file_name=direct_upload_file_name,
        direct_upload_mime_type=direct_upload_mime_type,
        direct_upload_size_bytes=direct_upload_size_bytes,
        latitude=latitude,
        longitude=longitude,
        location_name=location_name,
        target_txn_ref=target_txn_ref,
        current_user=current_user,
        db=db,
        receipt_direct_upload_max_bytes=RECEIPT_DIRECT_UPLOAD_MAX_BYTES,
        sanitize_input=_sanitize_input,
        process_bot_input=_process_bot_input,
        delete_storage_object_safe=_delete_storage_object_safe,
        find_recent_user_attachment=_find_recent_user_attachment,
        persist_chat_message=_persist_chat_message,
        serialize_chat_message=_serialize_chat_message,
    )


@app.get("/chat/messages", response_model=List[schemas.ChatMessageResponse])
async def get_web_chat_messages(
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_get_web_chat_messages_route(
        request=request,
        current_user=current_user,
        db=db,
        serialize_chat_message=_serialize_chat_message,
    )

@app.get("/removed_business/inbox/threads", response_model=list[schemas.RemovedBusinessInboxThreadResponse])
async def removed_business_inbox_threads(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.RemovedBusinessInboxThread)
        .where(models.RemovedBusinessInboxThread.user_id == current_user.id)
        .order_by(models.RemovedBusinessInboxThread.last_message_at.desc(), models.RemovedBusinessInboxThread.id.desc())
        .limit(100)
    )
    rows = result.scalars().all()
    return [_serialize_removed_business_inbox_thread(row) for row in rows]


@app.get("/removed_business/inbox/threads/{thread_id}/messages")
async def removed_business_inbox_thread_messages(
    thread_id: int,
    before_id: int | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    thread_result = await db.execute(
        select(models.RemovedBusinessInboxThread).where(
            models.RemovedBusinessInboxThread.id == thread_id,
            models.RemovedBusinessInboxThread.user_id == current_user.id,
        )
    )
    thread = thread_result.scalar_one_or_none()
    if thread is None:
        raise HTTPException(status_code=404, detail="Inbox thread not found")
    query = (
        select(models.RemovedBusinessInboxMessage)
        .where(
            models.RemovedBusinessInboxMessage.thread_id == thread.id,
            models.RemovedBusinessInboxMessage.user_id == current_user.id,
        )
    )
    if before_id is not None:
        sub = (
            select(models.RemovedBusinessInboxMessage.created_at, models.RemovedBusinessInboxMessage.id)
            .where(models.RemovedBusinessInboxMessage.id == before_id)
            .limit(1)
            .subquery()
        )
        query = query.filter(
            or_(
                models.RemovedBusinessInboxMessage.created_at < sub.c.created_at,
                and_(
                    models.RemovedBusinessInboxMessage.created_at == sub.c.created_at,
                    models.RemovedBusinessInboxMessage.id < sub.c.id,
                ),
            )
        )
    query = query.order_by(models.RemovedBusinessInboxMessage.created_at.desc(), models.RemovedBusinessInboxMessage.id.desc()).limit(limit)
    result = await db.execute(query)
    rows = list(result.scalars().all())
    # Mark unread as zero only on first page (no before_id)
    if before_id is None:
        thread.unread_count = 0
        await db.commit()
    # Return in chronological order for frontend
    rows.reverse()
    return [_serialize_removed_business_inbox_message(row) for row in rows]


@app.post("/removed_business/inbox/threads/{thread_id}/reply", response_model=schemas.RemovedBusinessInboxMessageResponse)
async def removed_business_inbox_reply(
    thread_id: int,
    payload: schemas.RemovedBusinessInboxReplyRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    thread_result = await db.execute(
        select(models.RemovedBusinessInboxThread).where(
            models.RemovedBusinessInboxThread.id == thread_id,
            models.RemovedBusinessInboxThread.user_id == current_user.id,
        )
    )
    thread = thread_result.scalar_one_or_none()
    if thread is None:
        raise HTTPException(status_code=404, detail="Inbox thread not found")
    message_text = str(payload.text or '').strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Reply text is required")
    if thread.source_channel != 'whatsapp_cloud':
        raise HTTPException(status_code=400, detail="Only WhatsApp Cloud inbox is supported right now")

    # Process through removed_business handler to get bot reply (bypass prefix for owner)
    bot_reply_text: str | None = None
    try:
        removed_business_result = await _removed_business_handle_incoming_order_payload(
            db,
            user_id=current_user.id,
            source='whatsapp_cloud',
            text=message_text,
            customer_name=thread.customer_name or "Owner",
            customer_phone=thread.customer_phone,
            receipt_url=None,
            has_receipt_media=False,
            receipt_payload=None,
            receipt_mime_type=None,
            receipt_file_name=None,
            latitude=None,
            longitude=None,
            location_name=None,
            bypass_whatsapp_prefix=True,
        )
        if isinstance(removed_business_result, dict) and removed_business_result.get('reply'):
            removed_business_status = str(removed_business_result.get('status') or '')
            if not removed_business_status.startswith('ignored'):
                bot_reply_text = str(removed_business_result['reply'])
    except Exception:
        pass

    # Use removed_business handler reply, or send original text if no bot reply
    send_text = bot_reply_text or message_text
    outbound_images = []
    if isinstance(removed_business_result, dict):
        outbound_images = [url for url in [removed_business_result.get('qr_image_url'), removed_business_result.get('payment_image_url'), removed_business_result.get('catalog_image_url')] if isinstance(url, str) and url.strip()]
    ok, error = await _send_cloud_api_message(current_user.id, thread.customer_phone, send_text, outbound_images)
    if not ok:
        raise HTTPException(status_code=400, detail=(error or 'Failed to send WhatsApp reply')[:500])

    # Save outgoing message (what owner typed)
    outgoing_msg = await _removed_business_inbox_persist_message(
        db,
        user_id=current_user.id,
        source_channel=thread.source_channel,
        customer_phone=thread.customer_phone,
        customer_name=thread.customer_name,
        direction='outgoing',
        text=message_text,
        message_type='text',
        external_message_id=None,
    )
    if outgoing_msg is None:
        raise HTTPException(status_code=500, detail='Failed to save reply')

    # If bot generated a reply, save it as outgoing too (it's what was sent to customer)
    if bot_reply_text and bot_reply_text != message_text:
        bot_msg = await _removed_business_inbox_persist_message(
            db,
            user_id=current_user.id,
            source_channel=thread.source_channel,
            customer_phone=thread.customer_phone,
            customer_name=thread.customer_name,
            direction='outgoing',
            text=bot_reply_text,
            message_type='text',
            external_message_id=None,
        )
        if bot_msg is not None:
            return _serialize_removed_business_inbox_message(bot_msg)

    return _serialize_removed_business_inbox_message(outgoing_msg)


def _send_worker_message(user_id: str, payload: dict[str, Any], timeout_seconds: float = 30.0):
    return _module_send_worker_message_route(
        user_id=user_id,
        payload=payload,
        worker_request_json=_worker_request_json,
        timeout_seconds=timeout_seconds,
    )


def _fetch_session(user_id: str):
    return _module_fetch_session_route(
        user_id=user_id,
        worker_request_json=_worker_request_json,
    )


def _delete_session(user_id: str):
    return _module_delete_session_route(
        user_id=user_id,
        worker_request_json=_worker_request_json,
    )


def _pair_session(user_id: str, phone: str):
    return _module_pair_session_route(
        user_id=user_id,
        phone=phone,
        worker_request_json=_worker_request_json,
    )


def _fetch_worker_groups(user_id: str):
    return _module_fetch_worker_groups_route(
        user_id=user_id,
        worker_request_json=_worker_request_json,
    )


def _worker_request_json(
    path: str,
    method: str = "GET",
    timeout_seconds: float = 15.0,
    json_payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
):
    return _module_worker_request_json_route(
        path=path,
        ensure_worker_running=_ensure_worker_running,
        worker_base_url=WORKER_BASE_URL,
        method=method,
        timeout_seconds=timeout_seconds,
        json_payload=json_payload,
        headers=headers,
    )


@app.get("/internal/whatsapp/group-rules/{user_id}")
async def get_internal_whatsapp_group_rules(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_get_internal_whatsapp_group_rules_route(
        user_id=user_id,
        request=request,
        db=db,
        ensure_valid_whatsapp_worker_request=_ensure_valid_whatsapp_worker_request,
    )


@app.get("/internal/whatsapp/removed_business-routing/{user_id}")
async def get_internal_whatsapp_removed_business_routing(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_get_internal_whatsapp_removed_business_routing_route(
        user_id=user_id,
        request=request,
        db=db,
        ensure_valid_whatsapp_worker_request=_ensure_valid_whatsapp_worker_request,
        removed_business_access_enabled=_removed_business_access_enabled,
    )


@app.get("/internal/whatsapp/removed_business-user-ids")
async def get_internal_removed_business_user_ids(
    request: Request,
    db: AsyncSession = Depends(database.get_db),
):
    await _ensure_valid_whatsapp_worker_request(request)
    result = await db.execute(
        select(models.UserSetting.user_id).where(
            models.UserSetting.key.in_(["removed_business_access_granted", "adminportal_removed_business_enabled"]),
            models.UserSetting.value == "true",
        )
    )
    removed_business_ids = list({row[0] for row in result.all()})
    return {"removed_business_user_ids": removed_business_ids}


@app.get("/internal/whatsapp/user-language/{user_id}")
async def get_internal_whatsapp_user_language(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(database.get_db),
):
    from sqlalchemy import select
    _ensure_valid_whatsapp_worker_request(request)
    result = await db.execute(select(models.User.language).where(models.User.id == user_id))
    language = result.scalar_one_or_none()
    return {"language": (language or "BM")}


@app.post("/internal/whatsapp/link-phone/{user_id}")
async def post_internal_whatsapp_link_phone(
    user_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default={}),
    db: AsyncSession = Depends(database.get_db),
):
    _ensure_valid_whatsapp_worker_request(request)
    phone = str(payload.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")
    result = await db.execute(select(models.WhatsAppLink).where(models.WhatsAppLink.user_id == user_id))
    link = result.scalar_one_or_none()
    if link:
        link.phone = phone
    else:
        link = models.WhatsAppLink(
            user_id=user_id,
            phone=phone,
            link_code=secrets.token_urlsafe(16)[:32],
            verified=True,
        )
        db.add(link)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await db.execute(select(models.WhatsAppLink).where(models.WhatsAppLink.phone == phone))
        existing_link = existing.scalar_one_or_none()
        if existing_link:
            existing_link.user_id = user_id
            existing_link.link_code = secrets.token_urlsafe(16)[:32]
            existing_link.verified = True
            await db.commit()
        else:
            raise
    return {"ok": True, "phone": phone}


@app.get("/whatsapp/groups", response_model=List[schemas.WhatsAppGroupRuleResponse])
async def get_whatsapp_group_rules(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_get_whatsapp_group_rules_route(
        current_user=current_user,
        db=db,
    )


@app.get("/whatsapp/available-groups", response_model=List[schemas.WhatsAppAvailableGroup])
async def get_available_whatsapp_groups(current_user: models.User = Depends(get_current_user)):
    return await _module_get_available_whatsapp_groups_route(
        current_user=current_user,
        fetch_worker_groups=_fetch_worker_groups,
    )


@app.post("/whatsapp/groups", response_model=schemas.WhatsAppGroupRuleResponse)
async def create_whatsapp_group_rule(
    rule_in: schemas.WhatsAppGroupRuleCreate,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_create_whatsapp_group_rule_route(
        rule_in=rule_in,
        current_user=current_user,
        db=db,
        normalize_whatsapp_group_jid=_normalize_whatsapp_group_jid,
        normalize_group_prefix=_normalize_group_prefix,
    )


@app.patch("/whatsapp/groups/{rule_id}", response_model=schemas.WhatsAppGroupRuleResponse)
async def update_whatsapp_group_rule(
    rule_id: int,
    rule_in: schemas.WhatsAppGroupRuleUpdate,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_update_whatsapp_group_rule_route(
        rule_id=rule_id,
        rule_in=rule_in,
        current_user=current_user,
        db=db,
        get_whatsapp_group_rule=_get_whatsapp_group_rule,
        normalize_group_prefix=_normalize_group_prefix,
    )


@app.delete("/whatsapp/groups/{rule_id}")
async def delete_whatsapp_group_rule(
    rule_id: int,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_delete_whatsapp_group_rule_route(
        rule_id=rule_id,
        current_user=current_user,
        db=db,
        get_whatsapp_group_rule=_get_whatsapp_group_rule,
    )


@app.get("/whatsapp/session")
async def get_whatsapp_session(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    data = await _module_get_whatsapp_session_route(
        current_user=current_user,
        fetch_session=_fetch_session,
    )
    if not data.get("phone"):
        result = await db.execute(select(models.WhatsAppLink).where(models.WhatsAppLink.user_id == current_user.id))
        link = result.scalar_one_or_none()
        if link and link.phone:
            data["phone"] = link.phone
    return data


@app.patch("/whatsapp/session")
async def update_whatsapp_session_settings(
    payload: schemas.WhatsAppSessionSettingsUpdate,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    return await _module_update_whatsapp_session_settings_route(
        payload=payload,
        current_user=current_user,
        db=db,
        normalize_personal_prefix=_normalize_personal_prefix,
    )


@app.delete("/whatsapp/session")
async def logout_whatsapp_session(current_user: models.User = Depends(get_current_user)):
    return await _module_logout_whatsapp_session_route(
        current_user=current_user,
        delete_session=_delete_session,
    )


@app.post("/whatsapp/pair")
async def pair_whatsapp_session(phone: str, current_user: models.User = Depends(get_current_user)):
    return await _module_pair_whatsapp_session_route(
        phone=phone,
        current_user=current_user,
        pair_session=_pair_session,
    )



# --- Push Token Management ---

@app.post("/removed_business/push-token")
async def register_push_token(
    payload: schemas.PushTokenRegister,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    from sqlalchemy import select as sa_select
    
    existing = await db.execute(
        sa_select(models.UserPushToken).where(
            models.UserPushToken.user_id == current_user.id,
            models.UserPushToken.token == payload.token,
        )
    )
    row = existing.scalar_one_or_none()
    
    if row:
        row.is_active = True
        row.updated_at = datetime.utcnow()
        await db.commit()
        return {"status": "updated"}
    
    entry = models.UserPushToken(
        user_id=current_user.id,
        token=payload.token,
        platform=payload.platform or "web",
    )
    db.add(entry)
    await db.commit()
    return {"status": "registered"}


@app.delete("/removed_business/push-token")
async def unregister_push_token(
    token: str = Query(..., description="FCM token to unregister"),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    from sqlalchemy import select as sa_select, update as sa_update
    
    await db.execute(
        sa_update(models.UserPushToken)
        .where(
            models.UserPushToken.user_id == current_user.id,
            models.UserPushToken.token == token,
        )
        .values(is_active=False, updated_at=datetime.utcnow())
    )
    await db.commit()
    return {"status": "unregistered"}


# ─── RemovedBusiness Phonebook ──────────────────────────────────────────────

@app.get("/removed_business/phonebook/groups", response_model=list[schemas.RemovedBusinessPhonebookGroupResponse])
async def removed_business_phonebook_groups_list(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessPhonebookGroup)
        .where(models.BusinessPhonebookGroup.user_id == current_user.id)
        .order_by(models.BusinessPhonebookGroup.sort_order, models.BusinessPhonebookGroup.created_at)
    )
    groups = result.scalars().all()
    count_result = await db.execute(
        select(models.BusinessPhonebookContact.group_id, func.count(models.BusinessPhonebookContact.id))
        .where(models.BusinessPhonebookContact.user_id == current_user.id)
        .group_by(models.BusinessPhonebookContact.group_id)
    )
    counts = {row[0]: row[1] for row in count_result.all()}
    return [
        schemas.RemovedBusinessPhonebookGroupResponse(
            id=g.id, name=g.name, color=g.color,
            contact_count=counts.get(g.id, 0), created_at=g.created_at,
        )
        for g in groups
    ]


@app.post("/removed_business/phonebook/groups", response_model=schemas.RemovedBusinessPhonebookGroupResponse)
async def removed_business_phonebook_group_create(
    payload: schemas.RemovedBusinessPhonebookGroupCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    row = models.BusinessPhonebookGroup(
        user_id=current_user.id,
        name=payload.name.strip(),
        color=payload.color,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return schemas.RemovedBusinessPhonebookGroupResponse(id=row.id, name=row.name, color=row.color, contact_count=0, created_at=row.created_at)


@app.patch("/removed_business/phonebook/groups/{group_id}", response_model=schemas.RemovedBusinessPhonebookGroupResponse)
async def removed_business_phonebook_group_update(
    group_id: int,
    payload: schemas.RemovedBusinessPhonebookGroupUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessPhonebookGroup)
        .where(models.BusinessPhonebookGroup.id == group_id, models.BusinessPhonebookGroup.user_id == current_user.id)
    )
    row = result.scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Group not found")
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.color is not None:
        row.color = payload.color
    await db.commit()
    await db.refresh(row)
    count_result = await db.execute(
        select(func.count(models.BusinessPhonebookContact.id))
        .where(models.BusinessPhonebookContact.group_id == group_id)
    )
    contact_count = count_result.scalar() or 0
    return schemas.RemovedBusinessPhonebookGroupResponse(id=row.id, name=row.name, color=row.color, contact_count=contact_count, created_at=row.created_at)


@app.delete("/removed_business/phonebook/groups/{group_id}")
async def removed_business_phonebook_group_delete(
    group_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessPhonebookGroup)
        .where(models.BusinessPhonebookGroup.id == group_id, models.BusinessPhonebookGroup.user_id == current_user.id)
    )
    row = result.scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.execute(
        models.BusinessPhonebookContact.__table__.update()
        .where(models.BusinessPhonebookContact.group_id == group_id)
        .values(group_id=None)
    )
    await db.delete(row)
    await db.commit()
    return {"status": "deleted"}


@app.get("/removed_business/phonebook/contacts", response_model=list[schemas.RemovedBusinessPhonebookContactResponse])
async def removed_business_phonebook_contacts_list(
    group_id: Optional[int] = None,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    stmt = select(models.BusinessPhonebookContact).where(models.BusinessPhonebookContact.user_id == current_user.id)
    if group_id is not None:
        stmt = stmt.where(models.BusinessPhonebookContact.group_id == group_id)
    stmt = stmt.order_by(models.BusinessPhonebookContact.created_at.desc())
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        schemas.RemovedBusinessPhonebookContactResponse(
            id=r.id, group_id=r.group_id, name=r.name, phone_number=r.phone_number,
            display_phone=r.display_phone, note=r.note, created_at=r.created_at,
        )
        for r in rows
    ]


@app.post("/removed_business/phonebook/contacts", response_model=schemas.RemovedBusinessPhonebookContactResponse)
async def removed_business_phonebook_contact_create(
    payload: schemas.RemovedBusinessPhonebookContactCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    row = models.BusinessPhonebookContact(
        user_id=current_user.id,
        group_id=payload.group_id,
        name=payload.name.strip(),
        phone_number=payload.phone_number.strip(),
        display_phone=payload.display_phone.strip() if payload.display_phone else None,
        note=payload.note,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return schemas.RemovedBusinessPhonebookContactResponse(id=row.id, group_id=row.group_id, name=row.name, phone_number=row.phone_number, display_phone=row.display_phone, note=row.note, created_at=row.created_at)


@app.patch("/removed_business/phonebook/contacts/{contact_id}", response_model=schemas.RemovedBusinessPhonebookContactResponse)
async def removed_business_phonebook_contact_update(
    contact_id: int,
    payload: schemas.RemovedBusinessPhonebookContactUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessPhonebookContact)
        .where(models.BusinessPhonebookContact.id == contact_id, models.BusinessPhonebookContact.user_id == current_user.id)
    )
    row = result.scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    if payload.group_id is not None:
        row.group_id = payload.group_id
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.phone_number is not None:
        row.phone_number = payload.phone_number.strip()
    if payload.display_phone is not None:
        row.display_phone = payload.display_phone.strip() or None
    if payload.note is not None:
        row.note = payload.note
    await db.commit()
    await db.refresh(row)
    return schemas.RemovedBusinessPhonebookContactResponse(id=row.id, group_id=row.group_id, name=row.name, phone_number=row.phone_number, display_phone=row.display_phone, note=row.note, created_at=row.created_at)


@app.delete("/removed_business/phonebook/contacts/{contact_id}")
async def removed_business_phonebook_contact_delete(
    contact_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessPhonebookContact)
        .where(models.BusinessPhonebookContact.id == contact_id, models.BusinessPhonebookContact.user_id == current_user.id)
    )
    row = result.scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    await db.delete(row)
    await db.commit()
    return {"status": "deleted"}


@app.get("/removed_business/phonebook/contacts/lookup", response_model=Optional[schemas.RemovedBusinessPhonebookContactResponse])
async def removed_business_phonebook_contact_lookup(
    phone: str,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return None
    result = await db.execute(
        select(models.BusinessPhonebookContact)
        .where(models.BusinessPhonebookContact.user_id == current_user.id)
        .order_by(models.BusinessPhonebookContact.created_at.desc())
    )
    rows = result.scalars().all()
    for r in rows:
        if re.sub(r"\D", "", r.phone_number or "").endswith(digits) or digits.endswith(re.sub(r"\D", "", r.phone_number or "")):
            return schemas.RemovedBusinessPhonebookContactResponse(
                id=r.id, group_id=r.group_id, name=r.name, phone_number=r.phone_number,
                display_phone=r.display_phone, note=r.note, created_at=r.created_at,
            )
    return None


# ══════════════════════ Product Categories ═══════════════════

@app.get("/removed_business/product-categories", response_model=List[schemas.RemovedBusinessProductCategoryResponse])
async def removed_business_product_categories(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessProductCategory)
        .where(models.BusinessProductCategory.user_id == current_user.id)
        .order_by(models.BusinessProductCategory.sort_order, models.BusinessProductCategory.id)
    )
    return result.scalars().all()


@app.post("/removed_business/product-categories", response_model=schemas.RemovedBusinessProductCategoryResponse)
async def removed_business_product_category_create(
    payload: schemas.RemovedBusinessProductCategoryCreate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    cat = models.BusinessProductCategory(
        user_id=current_user.id,
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        sort_order=payload.sort_order,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@app.patch("/removed_business/product-categories/{category_id}", response_model=schemas.RemovedBusinessProductCategoryResponse)
async def removed_business_product_category_update(
    category_id: int,
    payload: schemas.RemovedBusinessProductCategoryUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessProductCategory).where(
            models.BusinessProductCategory.id == category_id,
            models.BusinessProductCategory.user_id == current_user.id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(cat, key, value)
    await db.commit()
    await db.refresh(cat)
    return cat


@app.delete("/removed_business/product-categories/{category_id}")
async def removed_business_product_category_delete(
    category_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessProductCategory).where(
            models.BusinessProductCategory.id == category_id,
            models.BusinessProductCategory.user_id == current_user.id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    await db.delete(cat)
    await db.commit()
    return {"ok": True}


@app.post("/removed_business/product-categories/{category_id}/upload-image", response_model=schemas.RemovedBusinessProductCategoryResponse)
async def upload_removed_business_product_category_image(
    category_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessProductCategory).where(
            models.BusinessProductCategory.id == category_id,
            models.BusinessProductCategory.user_id == current_user.id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="File is empty.")
    if len(payload) > RECEIPT_DIRECT_UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large.")

    try:
        validated_mime, extension = storage_service.validate_receipt_file(file.filename, file.content_type, payload)
    except storage_service.StorageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    object_key = _removed_business_build_receipt_object_key(current_user.id, "category-image", file.filename, extension)
    try:
        await asyncio.to_thread(storage_service.upload_receipt_object, object_key, payload, validated_mime)
    except storage_service.StorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    cat.image_url = _removed_business_storage_direct_url(object_key) or object_key
    await db.commit()
    await db.refresh(cat)
    return cat


@app.patch("/removed_business/product-categories/{category_id}/products")
async def removed_business_product_category_assign_products(
    category_id: int,
    payload: dict,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessProductCategory).where(
            models.BusinessProductCategory.id == category_id,
            models.BusinessProductCategory.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Category not found.")
    product_ids = payload.get("product_ids", [])
    if not isinstance(product_ids, list) or not product_ids:
        raise HTTPException(status_code=400, detail="product_ids required.")
    products_result = await db.execute(
        select(models.BusinessProduct).where(
            models.BusinessProduct.id.in_([int(pid) for pid in product_ids]),
            models.BusinessProduct.user_id == current_user.id,
        )
    )
    for p in products_result.scalars().all():
        p.category_id = category_id
    await db.commit()
    return {"ok": True, "count": len(product_ids)}


@app.delete("/removed_business/product-categories/{category_id}/products/{product_id}")
async def removed_business_product_category_remove_product(
    category_id: int,
    product_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_removed_business_user),
):
    result = await db.execute(
        select(models.BusinessProduct).where(
            models.BusinessProduct.id == product_id,
            models.BusinessProduct.user_id == current_user.id,
            models.BusinessProduct.category_id == category_id,
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found in this category.")
    p.category_id = None
    await db.commit()
    return {"ok": True}


from modules.donations.routes import router as donations_router
app.include_router(donations_router, prefix="/donations", tags=["donations"])

from modules.vehicles import create_vehicles_router
app.include_router(create_vehicles_router(get_current_user=get_current_user))

from modules.warranties import create_warranties_router
app.include_router(create_warranties_router(get_current_user=get_current_user))

from modules.events import create_events_router
app.include_router(create_events_router(get_current_user=get_current_user))

from modules.split_bills import create_split_bills_router
app.include_router(create_split_bills_router(get_current_user=get_current_user))

from modules.bnpl import create_bnpl_router
app.include_router(create_bnpl_router(get_current_user=get_current_user))

from modules.inventory import create_inventory_router
app.include_router(create_inventory_router(get_current_user=get_current_user, publish_realtime=publish_realtime))

from modules.places import create_places_router
app.include_router(
    create_places_router(
        get_current_user=get_current_user,
        send_worker_message=_send_worker_message,
    )
)

# Vehicle ↔ Transaction link (same pattern as loan-link)
@app.get("/transactions/{txn_id}/vehicle-link")
async def get_transaction_vehicle_link(
    txn_id: str,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    from modules.vehicles import service as _vehicle_service

    return await _vehicle_service.get_link_by_transaction(
        db, current_user=current_user, txn_id=txn_id
    )

# ── Support Tickets (feature request & support) ─────────────────────

@app.post("/support/tickets", response_model=schemas.SupportTicketResponse)
async def create_support_ticket(
    body: schemas.SupportTicketCreate,
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    """User submits a feature request or support ticket."""
    kind = body.kind.strip().lower()
    if kind not in ("feature", "support", "bug"):
        raise HTTPException(status_code=422, detail="Jenis tidak sah (feature/support/bug)")
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Tajuk diperlukan")
    priority = (body.priority or "medium").strip().lower()
    if priority not in ("low", "medium", "high"):
        priority = "medium"
    t = models.SupportTicket(
        user_id=current_user.id,
        kind=kind,
        title=title[:200],
        description=body.description,
        priority=priority,
        status="new",
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t

@app.get("/support/tickets/mine", response_model=List[schemas.SupportTicketResponse])
async def my_support_tickets(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_db),
):
    """User lists their own tickets."""
    result = await db.execute(
        select(models.SupportTicket)
        .where(models.SupportTicket.user_id == current_user.id)
        .order_by(models.SupportTicket.created_at.desc())
    )
    return result.scalars().all()

if __name__ == "__main__":
    import uvicorn
    api_host = os.getenv("API_HOST", "0.0.0.0")
    api_port = int(os.getenv("API_PORT", "8023"))
    uvicorn.run(app, host=api_host, port=api_port)
