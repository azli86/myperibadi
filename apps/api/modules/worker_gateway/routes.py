from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable


def worker_request_json_route(
    *,
    path: str,
    ensure_worker_running: Callable[[], None],
    worker_base_url: str,
    method: str = "GET",
    timeout_seconds: float = 15.0,
    json_payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
):
    ensure_worker_running()
    body_bytes = None
    req_headers = dict(headers or {})
    if json_payload is not None:
        body_bytes = json.dumps(json_payload).encode("utf-8")
        req_headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(
        f"{worker_base_url}{path}",
        data=body_bytes,
        headers=req_headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}, response.status
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            data = {"detail": body or exc.reason}
        return data, exc.code
    except Exception as exc:
        return {"detail": str(exc) or "Worker request failed."}, 503


def send_worker_message_route(
    *,
    user_id: str,
    payload: dict[str, Any],
    worker_request_json: Callable[..., tuple[object, int]],
    timeout_seconds: float = 30.0,
):
    return worker_request_json(
        f"/api/send/{urllib.parse.quote(user_id)}",
        method="POST",
        timeout_seconds=timeout_seconds,
        json_payload=payload,
    )


def fetch_session_route(
    *,
    user_id: str,
    worker_request_json: Callable[..., tuple[object, int]],
):
    return worker_request_json(f"/api/session/{urllib.parse.quote(user_id)}")


def delete_session_route(
    *,
    user_id: str,
    worker_request_json: Callable[..., tuple[object, int]],
):
    return worker_request_json(f"/api/session/{urllib.parse.quote(user_id)}", method="DELETE")


def pair_session_route(
    *,
    user_id: str,
    phone: str,
    worker_request_json: Callable[..., tuple[object, int]],
):
    params = urllib.parse.urlencode({"phone": phone})
    return worker_request_json(f"/api/pair/{urllib.parse.quote(user_id)}?{params}", method="POST")


def fetch_worker_groups_route(
    *,
    user_id: str,
    worker_request_json: Callable[..., tuple[object, int]],
):
    return worker_request_json(f"/api/groups/{urllib.parse.quote(user_id)}", timeout_seconds=35.0)
