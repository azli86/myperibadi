from __future__ import annotations

import socket
import os
import subprocess
import urllib.parse


def ensure_worker_running_route(*, worker_base_url: str, app_root: str) -> None:
    """Watchdog: Checks worker port, restarts if down."""
    parsed = urllib.parse.urlparse(worker_base_url)
    worker_host = parsed.hostname or "127.0.0.1"
    worker_port = parsed.port or 8024
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        result = sock.connect_ex((worker_host, worker_port))
        if result != 0:
            print(f"🚀 Watchdog: Worker at {worker_host}:{worker_port} is down. Attempting restart...")
            env = os.environ.copy()
            env.setdefault("WA_AUTOSTART_ALL_SESSIONS", "true")
            env.setdefault("WA_AUTOSTART_STAGGER_MS", "1800")
            env.setdefault("WA_AUTOSTART_MAX_SESSIONS", "80")
            env.setdefault("WA_WEBHOOK_TIMEOUT_MS", "120000")
            env.setdefault("WA_CRYPTO_ERROR_WINDOW_MS", "120000")
            env.setdefault("WA_CRYPTO_ERROR_QUARANTINE_THRESHOLD", "12")
            env.setdefault("WA_ALLOW_NON_SELF_DM", "false")
            env.setdefault("WA_WORKER_HOST", worker_host)
            env.setdefault("WA_WORKER_PORT", str(worker_port))
            env.setdefault("WA_API_GATEWAY_URL", os.getenv("WA_API_GATEWAY_URL", "http://127.0.0.1:8023"))
            subprocess.Popen(
                ["node", "index_v2.js"],
                cwd=f"{app_root}/apps/worker",
                stdout=open(f"{app_root}/apps/worker/worker.log", "a"),
                stderr=subprocess.STDOUT,
                env=env,
                start_new_session=True,
            )
    finally:
        sock.close()
