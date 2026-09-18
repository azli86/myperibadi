"""The local OCR provider must point at an address that answers.

This broke silently: ILMU_BASE_URL carried a stale third octet, pointing at a
host on a subnet the database does not use. Uploads still returned 200 from the
API while the provider call hung and failed, so nothing in the HTTP layer said
"wrong host" — only the OCR draft never arrived.

The address is now asserted against the one the database uses, which is known
good because the whole API would be down otherwise.

Skips when .env is absent (CI has no secrets) rather than failing.
"""
import os
import re
import socket
from pathlib import Path

ENV = Path(__file__).resolve().parent.parent / ".env"


def _env() -> dict[str, str]:
    if not ENV.exists():
        return {}
    out: dict[str, str] = {}
    for line in ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def _host(value: str) -> str | None:
    m = re.match(r"^https?://([^/:]+)", value or "")
    return m.group(1) if m else None


def test_the_local_provider_lives_on_the_database_subnet():
    env = _env()
    if not env:
        print("skip: no .env")
        return
    db_host = _host(f"http://{env.get('DB_HOST', '')}")
    ocr_host = _host(env.get("ILMU_BASE_URL", ""))
    assert ocr_host, f"ILMU_BASE_URL is unparseable: {env.get('ILMU_BASE_URL')!r}"
    assert db_host, "DB_HOST is missing; cannot derive the expected subnet"
    db_subnet = ".".join(db_host.split(".")[:3])
    ocr_subnet = ".".join(ocr_host.split(".")[:3])
    assert ocr_subnet == db_subnet, (
        f"the OCR provider sits on {ocr_subnet}.x while the database sits on "
        f"{db_subnet}.x — one of them is stale, and a wrong OCR host fails "
        f"silently because the upload endpoint still answers 200"
    )


def test_the_local_provider_actually_answers():
    env = _env()
    if not env:
        print("skip: no .env")
        return
    host = _host(env.get("ILMU_BASE_URL", ""))
    port = int(env.get("ILMU_BASE_URL", "").rsplit(":", 1)[-1].split("/")[0] or 80)
    with socket.create_connection((host, port), timeout=3):
        pass  # a refused connection raises, which is the failure we want to catch


if __name__ == "__main__":
    test_the_local_provider_lives_on_the_database_subnet()
    test_the_local_provider_actually_answers()
    print("ocr provider host OK")
