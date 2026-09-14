"""One-off: generate `.t.jpg` thumbnails for vehicle images uploaded before they existed.

Idempotent — skips any object whose thumbnail already exists — and safe to re-run.
Deletes nothing. Prints a summary so the run can be verified.

    cd apps/api && venv/bin/python -m scripts.backfill_vehicle_thumbnails
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

for _line in open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")):
    _line = _line.strip()
    if _line and not _line.startswith("#") and "=" in _line:
        _k, _, _v = _line.partition("=")
        if _k.strip().replace("_", "").isalnum():
            os.environ.setdefault(_k.strip(), _v.strip().strip('"'))

import asyncpg  # noqa: E402

from modules.vehicles import storage  # noqa: E402


async def main() -> int:
    conn = await asyncpg.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ["DB_PORT"]),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASS"],
        database=os.environ["DB_NAME"],
    )
    rows = await conn.fetch(
        "SELECT id, image_object_key FROM vehicles WHERE image_object_key IS NOT NULL AND image_object_key <> ''"
    )
    await conn.close()

    made = skipped = failed = 0
    saved_bytes = 0
    for row in rows:
        key = row["image_object_key"]
        thumb_key = storage.thumbnail_key(key)
        try:
            storage.download(thumb_key)
            skipped += 1
            continue
        except Exception:
            pass  # no thumbnail yet

        try:
            payload, _ctype = storage.download(key)
        except Exception as exc:
            print(f"  vehicle {row['id']}: original unreadable ({exc})")
            failed += 1
            continue

        thumb = storage.make_thumbnail(payload)
        if not thumb:
            print(f"  vehicle {row['id']}: could not decode image")
            failed += 1
            continue

        try:
            storage.upload(thumb_key, thumb, "image/jpeg")
        except Exception as exc:
            print(f"  vehicle {row['id']}: upload failed ({exc})")
            failed += 1
            continue

        made += 1
        saved_bytes += max(0, len(payload) - len(thumb))
        print(f"  vehicle {row['id']}: {len(payload):>9,} -> {len(thumb):>7,} bytes")

    print(f"\nthumbnails created: {made}")
    print(f"already present:    {skipped}")
    print(f"failed:             {failed}")
    print(f"total rows:         {len(rows)}")
    if made:
        print(f"payload saved:      {saved_bytes / 1024 / 1024:.1f} MB")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
