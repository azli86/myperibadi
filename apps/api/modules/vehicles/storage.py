"""Thin R2 wrapper for My Vehicle uploads. Reuses apps/api/storage_service.py."""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple
from uuid import uuid4

import storage_service


def build_vehicle_object_key(
    *,
    household_id: int,
    vehicle_id: int,
    kind: str,
    parent_id: Optional[int],
    filename: Optional[str],
    extension: str,
) -> str:
    safe_name = Path(filename or "file").name
    cleaned = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in safe_name)
    cleaned = cleaned.strip("._") or "file"
    stem = Path(cleaned).stem[:80] or "file"
    ext = extension.lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    parent_segment = str(parent_id) if parent_id is not None else "root"
    if kind == "images":
        return f"vehicles/{household_id}/{vehicle_id}/images/{uuid4().hex}-{stem}{ext}"
    if kind == "fuel":
        return f"vehicles/{household_id}/{vehicle_id}/fuel/{parent_segment}/{uuid4().hex}-{stem}{ext}"
    if kind == "maintenance":
        return f"vehicles/{household_id}/{vehicle_id}/maintenance/{parent_segment}/{uuid4().hex}-{stem}{ext}"
    if kind == "expenses":
        return f"vehicles/{household_id}/{vehicle_id}/expenses/{parent_segment}/{uuid4().hex}-{stem}{ext}"
    if kind == "documents":
        return f"vehicles/{household_id}/{vehicle_id}/documents/{parent_segment}/{uuid4().hex}-{stem}{ext}"
    return f"vehicles/{household_id}/{vehicle_id}/other/{uuid4().hex}-{stem}{ext}"


def validate_file(filename: Optional[str], content_type: Optional[str], payload: bytes) -> Tuple[str, str]:
    return storage_service.validate_receipt_file(filename, content_type, payload)


def upload(object_key: str, payload: bytes, content_type: str, *, filename: str | None = None) -> None:
    storage_service.upload_receipt_object(object_key, payload, content_type, filename=filename)


def download(object_key: str) -> Tuple[bytes, Optional[str]]:
    return storage_service.download_receipt_object(object_key)


def delete(object_key: str) -> None:
    storage_service.delete_receipt_object(object_key)
