import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Optional, Tuple
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

ALLOWED_EXTENSIONS = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
ALLOWED_MIME_TYPES = set(ALLOWED_EXTENSIONS.values())

R2_CONNECT_TIMEOUT_SECONDS = max(1, int(os.getenv("R2_CONNECT_TIMEOUT_SECONDS", "5")))
R2_READ_TIMEOUT_SECONDS = max(1, int(os.getenv("R2_READ_TIMEOUT_SECONDS", "45")))
R2_MAX_ATTEMPTS = max(1, int(os.getenv("R2_MAX_ATTEMPTS", "3")))


class StorageError(Exception):
    pass


class StorageValidationError(StorageError):
    pass


class StorageNotConfiguredError(StorageError):
    pass


def _get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise StorageNotConfiguredError(f"Missing required storage config: {name}")
    return value


def _get_endpoint_url() -> str:
    explicit_endpoint = os.getenv("R2_ENDPOINT_URL", "").strip()
    if explicit_endpoint:
        return explicit_endpoint
    account_id = os.getenv("R2_ACCOUNT_ID", "").strip()
    if account_id:
        return f"https://{account_id}.r2.cloudflarestorage.com"
    raise StorageNotConfiguredError("Missing storage endpoint. Set R2_ENDPOINT_URL or R2_ACCOUNT_ID.")


def _normalize_content_type(content_type: Optional[str]) -> str:
    normalized = (content_type or "").split(";")[0].strip().lower()
    if normalized == "image/jpg":
        normalized = "image/jpeg"
    return normalized


def _detect_magic_mime(payload: bytes) -> Optional[str]:
    if payload.startswith(b"%PDF-"):
        return "application/pdf"
    if payload.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if payload.startswith(b"RIFF") and payload[8:12] == b"WEBP":
        return "image/webp"
    return None


def _sanitize_filename(filename: Optional[str]) -> str:
    base_name = Path(filename or "receipt").name
    cleaned = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in base_name)
    cleaned = cleaned.strip("._")
    return cleaned[:120] if cleaned else "receipt"


def _extension_for_mime(mime_type: str) -> str:
    for extension, mime in ALLOWED_EXTENSIONS.items():
        if mime == mime_type:
            return extension
    return ".bin"


def validate_receipt_metadata(filename: Optional[str], content_type: Optional[str]) -> Tuple[str, str]:
    normalized_content_type = _normalize_content_type(content_type)
    ext = Path(filename or "").suffix.lower()
    ext_mime = ALLOWED_EXTENSIONS.get(ext)

    if normalized_content_type not in ALLOWED_MIME_TYPES:
        raise StorageValidationError("Unsupported file type. Only PDF, JPG, PNG, and WEBP are allowed.")

    if ext_mime and ext_mime != normalized_content_type:
        raise StorageValidationError("File extension does not match content type.")

    if ext not in ALLOWED_EXTENSIONS:
        ext = _extension_for_mime(normalized_content_type)

    return normalized_content_type, ext


def validate_receipt_file(filename: Optional[str], content_type: Optional[str], payload: bytes) -> Tuple[str, str]:
    if not payload:
        raise StorageValidationError("File is empty.")

    normalized_content_type = _normalize_content_type(content_type)
    ext = Path(filename or "").suffix.lower()
    magic_mime = _detect_magic_mime(payload)

    chosen_mime = magic_mime
    if not chosen_mime and normalized_content_type in ALLOWED_MIME_TYPES:
        _, ext = validate_receipt_metadata(filename, normalized_content_type)
        chosen_mime = normalized_content_type

    if not chosen_mime or chosen_mime not in ALLOWED_MIME_TYPES:
        raise StorageValidationError("Unsupported file type. Only PDF, JPG, PNG, and WEBP are allowed.")

    if chosen_mime == "application/pdf" and not payload.startswith(b"%PDF-"):
        raise StorageValidationError("Invalid PDF file.")

    if ext not in ALLOWED_EXTENSIONS:
        ext = _extension_for_mime(chosen_mime)

    return chosen_mime, ext


def build_receipt_object_key(user_id: str, transaction_id: int, filename: Optional[str], extension: str) -> str:
    safe_name = _sanitize_filename(filename)
    stem = Path(safe_name).stem or "receipt"
    ext = extension.lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    month_prefix = datetime.utcnow().strftime("%Y/%m")
    return f"receipts/{user_id}/{month_prefix}/txn-{transaction_id}/{uuid4().hex}-{stem}{ext}"


def build_direct_receipt_object_key(user_id: str, filename: Optional[str], extension: str) -> str:
    safe_name = _sanitize_filename(filename)
    stem = Path(safe_name).stem or "receipt"
    ext = extension.lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    month_prefix = datetime.utcnow().strftime("%Y/%m")
    return f"receipts/{user_id}/{month_prefix}/direct/{uuid4().hex}-{stem}{ext}"


def build_theme_asset_object_key(user_id: str, asset_type: str, extension: str) -> str:
    ext = extension.lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    return f"removed_business/theme-assets/{user_id}/{asset_type}-{uuid4().hex}{ext}"


def get_bucket_name() -> str:
    return _get_required_env("R2_BUCKET")


@lru_cache(maxsize=1)
def get_s3_client():
    endpoint_url = _get_endpoint_url()
    access_key = _get_required_env("R2_ACCESS_KEY_ID")
    secret_key = _get_required_env("R2_SECRET_ACCESS_KEY")
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            connect_timeout=R2_CONNECT_TIMEOUT_SECONDS,
            read_timeout=R2_READ_TIMEOUT_SECONDS,
            retries={"max_attempts": R2_MAX_ATTEMPTS, "mode": "standard"},
            max_pool_connections=50,
        ),
    )


def upload_receipt_object(object_key: str, payload: bytes, content_type: str, *, filename: str | None = None) -> None:
    try:
        disposition = "inline"
        if filename:
            safe_filename = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in filename).strip("._") or "receipt"
            disposition = f'inline; filename="{safe_filename}"'
        get_s3_client().put_object(
            Bucket=get_bucket_name(),
            Key=object_key,
            Body=payload,
            ContentType=content_type,
            ContentDisposition=disposition,
        )
    except (BotoCoreError, ClientError) as exc:
        raise StorageError(f"Failed to upload receipt to storage: {exc}") from exc


def create_presigned_receipt_upload_url(object_key: str, content_type: str, expires_in: int = 300) -> str:
    try:
        return get_s3_client().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": get_bucket_name(),
                "Key": object_key,
                "ContentType": content_type,
                "ContentDisposition": "inline",
            },
            ExpiresIn=expires_in,
            HttpMethod="PUT",
        )
    except (BotoCoreError, ClientError) as exc:
        raise StorageError(f"Failed to create upload URL: {exc}") from exc


def get_receipt_object_metadata(object_key: str) -> Tuple[int, Optional[str]]:
    try:
        response = get_s3_client().head_object(Bucket=get_bucket_name(), Key=object_key)
        return int(response.get("ContentLength") or 0), response.get("ContentType")
    except ClientError as exc:
        error_code = (exc.response.get("Error", {}) or {}).get("Code")
        if error_code in {"NoSuchKey", "404", "NotFound"}:
            raise StorageError("Attachment file not found in storage.") from exc
        raise StorageError(f"Failed to read receipt metadata: {exc}") from exc
    except BotoCoreError as exc:
        raise StorageError(f"Failed to read receipt metadata: {exc}") from exc


def read_receipt_object_prefix(object_key: str, byte_count: int = 32) -> bytes:
    try:
        response = get_s3_client().get_object(
            Bucket=get_bucket_name(),
            Key=object_key,
            Range=f"bytes=0-{max(byte_count - 1, 0)}",
        )
        return response["Body"].read()
    except ClientError as exc:
        error_code = (exc.response.get("Error", {}) or {}).get("Code")
        if error_code in {"NoSuchKey", "404", "NotFound"}:
            raise StorageError("Attachment file not found in storage.") from exc
        raise StorageError(f"Failed to read receipt prefix: {exc}") from exc
    except BotoCoreError as exc:
        raise StorageError(f"Failed to read receipt prefix: {exc}") from exc


def validate_uploaded_receipt_object(
    object_key: str,
    expected_content_type: str,
    expected_size_bytes: Optional[int],
    max_size_bytes: int,
) -> Tuple[int, str]:
    size_bytes, stored_content_type = get_receipt_object_metadata(object_key)
    if size_bytes <= 0:
        raise StorageValidationError("Uploaded file is empty.")
    if size_bytes > max_size_bytes:
        raise StorageValidationError("Uploaded file is too large.")
    if expected_size_bytes is not None and size_bytes != expected_size_bytes:
        raise StorageValidationError("Uploaded file size does not match the signed upload request.")

    expected_mime = _normalize_content_type(expected_content_type)
    stored_mime = _normalize_content_type(stored_content_type)
    if stored_mime and stored_mime != expected_mime:
        raise StorageValidationError("Uploaded file content type does not match the signed upload request.")

    prefix = read_receipt_object_prefix(object_key)
    magic_mime = _detect_magic_mime(prefix)
    if magic_mime != expected_mime:
        raise StorageValidationError("Uploaded file content does not match the signed upload request.")

    return size_bytes, expected_mime


def download_receipt_object(object_key: str) -> Tuple[bytes, Optional[str]]:
    try:
        response = get_s3_client().get_object(Bucket=get_bucket_name(), Key=object_key)
        payload = response["Body"].read()
        return payload, response.get("ContentType")
    except ClientError as exc:
        error_code = (exc.response.get("Error", {}) or {}).get("Code")
        if error_code in {"NoSuchKey", "404"}:
            raise StorageError("Attachment file not found in storage.") from exc
        raise StorageError(f"Failed to read receipt from storage: {exc}") from exc
    except BotoCoreError as exc:
        raise StorageError(f"Failed to read receipt from storage: {exc}") from exc


def delete_receipt_object(object_key: str) -> None:
    try:
        get_s3_client().delete_object(Bucket=get_bucket_name(), Key=object_key)
    except ClientError as exc:
        error_code = (exc.response.get("Error", {}) or {}).get("Code")
        if error_code in {"NoSuchKey", "404"}:
            return
        raise StorageError(f"Failed to delete receipt from storage: {exc}") from exc
    except BotoCoreError as exc:
        raise StorageError(f"Failed to delete receipt from storage: {exc}") from exc


def public_cdn_url(object_key: str | None) -> Optional[str]:
    """Public HTTPS URL via R2 custom domain (R2_CDN_DOMAIN), if configured."""
    if not object_key:
        return None
    key = str(object_key).lstrip("/")
    if not key:
        return None
    if key.startswith("http://") or key.startswith("https://"):
        return key
    cdn_domain = os.getenv("R2_CDN_DOMAIN", "").strip().rstrip("/")
    if not cdn_domain:
        return None
    if cdn_domain.startswith("http://") or cdn_domain.startswith("https://"):
        return f"{cdn_domain}/{key}"
    return f"https://{cdn_domain}/{key}"
