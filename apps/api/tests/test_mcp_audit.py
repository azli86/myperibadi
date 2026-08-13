import asyncio
from main import _mcp_write_audit
from models import McpAuditLog


class _DB:
    def __init__(self):
        self.added = []
        self.committed = False

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.committed = True


class _Tok:
    id = 7


class _U:
    id = "u123"


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_audit_success_recorded():
    db = _DB()
    _run(_mcp_write_audit(db, _Tok(), _U(), "get_transaction", 42, None))
    assert db.committed is True
    assert len(db.added) == 1
    e = db.added[0]
    assert isinstance(e, McpAuditLog)
    assert e.mcp_token_id == 7 and e.user_id == "u123"
    assert e.tool == "get_transaction" and e.target_id == 42
    assert e.success is True and e.error_code is None


def test_audit_failure_recorded():
    db = _DB()
    _run(_mcp_write_audit(db, _Tok(), _U(), "update_transaction", 9, "http_400"))
    e = db.added[0]
    assert e.success is False and e.error_code == "http_400"
