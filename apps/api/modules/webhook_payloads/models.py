from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ChatUploadPresignRequest(BaseModel):
    file_name: str
    content_type: str
    size_bytes: int


class WhatsAppWebhookPayload(BaseModel):
    user_id: str
    phone: str
    text: str = ""
    message_id: str | None = None
    message_timestamp: int | None = None
    group_jid: str | None = None
    group_name: str | None = None
    participant_jid: str | None = None
    remote_jid: str | None = None
    customer_name: str | None = None
    push_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    location_name: str | None = None
    media_base64: str | None = None
    media_mime_type: str | None = None
    media_file_name: str | None = None
    target_txn_ref: str | None = None
    reply_has_media: bool = False
    is_reply_message: bool = False
    from_me: bool = False
    is_self_chat: bool = False


class TelegramWebhookPayload(BaseModel):
    update_id: int | None = None
    message: dict[str, Any] | None = None
    callback_query: dict[str, Any] | None = None
