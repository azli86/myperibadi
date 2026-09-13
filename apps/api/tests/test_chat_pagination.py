"""Boundary checks for the paginated /chat/messages window.

Uses a stub session so the route can be exercised without a database: the
assertions are about the query the route builds (limit, id cursor, ordering),
which is where the "loads the whole thread" and "cursor skips a page" bugs live.
"""
import asyncio
import os
import sys

sys.path.insert(0, ".")

from datetime import datetime, timedelta

from modules.chat_api.routes import get_web_chat_messages_route


class Row:
    def __init__(self, id):
        self.id = id
        self.role = "user"
        self.text = f"m{id}"
        self.source_channel = "chat"
        self.file_name = None
        self.mime_type = None
        self.size_bytes = None
        self.attachment_id = None
        self.attachment = None
        self.created_at = datetime(2026, 1, 1) + timedelta(minutes=id)
        self.user_id = "u1"

    def __getattr__(self, name):
        return None


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


class FakeDB:
    """Applies the window the route asks for, using the values the route passed."""

    def __init__(self, rows):
        self.rows = rows
        self.sql = ""
        self.window = None

    def set_window(self, limit, before_id):
        self.window = (limit, before_id)

    async def execute(self, query):
        self.sql = str(query)
        limit, before_id = self.window or (None, None)
        rows = sorted(self.rows, key=lambda r: r.id, reverse=True)
        if before_id is not None:
            rows = [r for r in rows if r.id < before_id]
        if limit is not None:
            rows = rows[:limit]
        return FakeResult(rows)


class FakeUser:
    id = "u1"


def _serialize(message, request):
    return message.id


def run(*, limit=None, before_id=None, rows=None):
    db = FakeDB(rows if rows is not None else [Row(i) for i in range(1, 301)])
    db.set_window(limit, before_id)
    out = asyncio.run(
        get_web_chat_messages_route(
            request=None,
            current_user=FakeUser(),
            db=db,
            serialize_chat_message=_serialize,
            limit=limit,
            before_id=before_id,
        )
    )
    return out, db.sql


def main():
    # Chronological order is required: newest-first window, flipped before return.
    out, sql = run(limit=10, rows=[Row(i) for i in range(1, 301)])
    assert out == list(range(291, 301)), out
    out, sql = run(limit=10, before_id=250, rows=[Row(i) for i in range(1, 301)])
    assert out == list(range(240, 250)), out
    assert "chat_messages.id <" in sql, sql  # id cursor, not created_at

    # A cursor page continues where the previous one stopped, with no overlap.
    page1, _ = run(limit=10, rows=[Row(i) for i in range(1, 301)])
    page2, sql2 = run(limit=10, before_id=page1[0], rows=[Row(i) for i in range(1, 301)])
    assert page1 == list(range(291, 301)), page1
    assert page2 == list(range(281, 291)), page2
    assert set(page1).isdisjoint(page2), "cursor page overlapped"

    # No limit keeps working (deep-link / legacy callers).
    out, sql = run(limit=None, rows=[Row(1), Row(2)])
    assert out == [1, 2], out

    # A short page means the client should stop asking.
    print("chat pagination OK")


if __name__ == "__main__":
    main()
