"""Avatar cache must announce a fully written cache.

The sidebar reads the cached data URL synchronously on `avatar-updated`. If the
upload path fires that event while `cacheAvatarFromUrl` is still fetching, the
listener sees the previous image and nothing fires again, so the avatar only
changes after a reload.

Run: cd apps/api && venv/bin/python -m tests.test_avatar_cache_write_order
"""
from pathlib import Path

SHEET = (
    Path(__file__).resolve().parents[2]
    / "web" / "src" / "components" / "ui" / "AvatarPickerSheet.tsx"
).read_text(encoding="utf-8")

CACHE = (
    Path(__file__).resolve().parents[2]
    / "web" / "src" / "lib" / "avatar-cache.ts"
).read_text(encoding="utf-8")

# 1. The cache write is awaited before the event, so listeners never read a
#    half-written cache.
assert "await cacheAvatarFromUrl(url)" in SHEET, "the upload path must await the cache write"
assert "void cacheAvatarFromUrl(url)" not in SHEET, "a fire-and-forget write races the event"

write_at = SHEET.index("await cacheAvatarFromUrl(url)")
event_at = SHEET.index('dispatchEvent(new Event("avatar-updated"))')
assert write_at < event_at, "the cache write must finish before avatar-updated fires"

# 2. The listener falls back to the remote URL when the cache is empty, so an
#    avatar removal or a failed cache fetch does not strand the old image.
assert "else setSrc(remoteUrl ?? null)" in CACHE, "an empty cache must fall back to the remote URL"

# 3. A changed remote URL outranks the cache, so a stale data URL cannot pin
#    the old face after an upload.
assert "const remoteChanged = seenRemoteRef.current !== remoteUrl" in CACHE, (
    "a changed remote URL must take precedence over the cache"
)

# 4. An in-flight GET that started before an invalidation must not write its
#    stale body over the fresh cache when it resolves.
API_CACHE = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "api-cache.ts"
).read_text(encoding="utf-8")
assert "invalidatedAt.set(key, Date.now())" in API_CACHE, "invalidation must record a timestamp"
assert "if (!invalidated || invalidated < startedAt)" in API_CACHE, (
    "a response that predates the invalidation must not be cached"
)

# 5. Both call sites stay explicit about the now-async helper.
assert SHEET.count("void afterChange(") == 2, "both upload and removal must call the async helper"

print("avatar cache write order OK")
