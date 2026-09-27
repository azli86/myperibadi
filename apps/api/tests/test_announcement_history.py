"""Announcements published from Mastermind are kept as a history in the database.

The live notice stays in user_settings (adminportal.notice_banners), which is
what Mastermind edits. Every distinct notice saved with the banner switched on
is also written to the announcements table, and the app lists that history.

Pinned here:

1. Saving the notice records it, before the commit, in the same transaction.
2. A notice that is off or has no text is not recorded, and re-saving the same
   notice does not stack copies.
3. The user endpoints need a signed-in user and list newest first.
4. The live notice is seeded once when the table is empty, so history does not
   start blank.

Run: cd apps/api && venv/bin/python -m tests.test_announcement_history
"""
from pathlib import Path

API = Path(__file__).resolve().parents[1]
MAIN = (API / "main.py").read_text(encoding="utf-8")
MODELS = (API / "models.py").read_text(encoding="utf-8")

# The table.
assert 'class Announcement(Base):' in MODELS and '__tablename__ = "announcements"' in MODELS

# 1.
patch = MAIN[MAIN.index('@app.patch("/adminportal/notice-banners"'):]
patch = patch[: patch.index("def _announcement_fields")]
assert patch.index("await _record_announcement(") < patch.index("await db.commit()"), \
    "the history row must land in the same commit as the notice"

# 2.
rec = MAIN[MAIN.index("async def _record_announcement("):]
rec = rec[: rec.index("async def _announcement_rows(")]
assert 'if not _normalize_notice_banner_item(item).get("enabled"):' in rec
assert "if not any(fields[k]" in rec, "a notice with no text is not published"
assert "if latest and all(getattr(latest, k) == v" in rec, "re-saving must not stack copies"

# 3.
for route in ('@app.get("/announcements", response_model=List[schemas.AnnouncementResponse])',
              '@app.get("/announcements/{announcement_id}", response_model=schemas.AnnouncementResponse)'):
    body = MAIN[MAIN.index(route):]
    body = body[: body.index("\n\n\n") if "\n\n\n" in body else 600]
    assert "Depends(get_current_user)" in body, f"{route} must require a signed-in user"
assert ".order_by(models.Announcement.id.desc())" in MAIN

# 4.
rows = MAIN[MAIN.index("async def _announcement_rows("):]
rows = rows[: rows.index('@app.get("/announcements"')]
assert 'if not rows and current.get("enabled")' in rows

# 5. Mastermind lists the history through an admin-only route.
body = MAIN[MAIN.index('@app.get("/adminportal/announcements"'):]
body = body[: body.index('@app.get("/announcements"')]
assert "Depends(get_adminportal_admin)" in body, "the admin history must require an admin"
MM = (API.parents[0] / "mastermind" / "api" / "main.py").read_text(encoding="utf-8")
assert '_budget_api_call("GET", "/adminportal/announcements", actor["email"])' in MM
assert "Depends(admin)" in MM[MM.index('@app.get("/announcements")'):][:300]

# 6. Replacing a live notice while the history is still empty records the old
# one first, so it is not lost.
patch = MAIN[MAIN.index('@app.patch("/adminportal/notice-banners"'):]
patch = patch[: patch.index("def _announcement_fields")]
assert patch.index("previous = (await _get_notice_banner_settings(db))") < patch.index("keep.value = value")
assert 'if previous.get("enabled") and not await db.scalar(select(func.count()).select_from(models.Announcement)):' in patch

# 7. Mastermind can delete history entries: a soft delete, admin only, and
# never the notice that is live (it would vanish from the bell while the
# banner still showed).
assert "deleted_at: Mapped[Optional[datetime]]" in MODELS
assert "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL" in MAIN
body = MAIN[MAIN.index('@app.delete("/adminportal/announcements/{announcement_id}")'):]
body = body[: body.index('@app.get("/announcements"')]
assert "Depends(get_adminportal_admin)" in body
assert "row.deleted_at = datetime.utcnow()" in body and "db.delete(" not in body, "a soft delete"
assert 'rows[0]["is_current"]' in body and "status_code=409" in body, "the live notice cannot be deleted"
rows_fn = MAIN[MAIN.index("async def _announcement_rows("):]
rows_fn = rows_fn[: rows_fn.index('@app.get("/adminportal/announcements"')]
assert ".where(models.Announcement.deleted_at.is_(None))" in rows_fn, "deleted rows are hidden everywhere"
assert "select(func.count()).select_from(models.Announcement)" in rows_fn, "deleting everything must not re-seed"
assert '@app.delete("/announcements/{announcement_id}")' in MM and '"announcement_delete"' in MM, "Mastermind deletes and audits"

print("announcement history OK")
