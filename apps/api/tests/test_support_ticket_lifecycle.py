"""Support tickets expire and answer the customer.

Two additions:

1. Tickets stuck in new/in_progress die after a week of silence. Tickets #3 and
   #4 sat untouched for 22 days before a human closed them.

2. A customer who gets an admin reply sees a popup on the dashboard, once.
   Repeat popups are the failure mode here, so the read marker matters as much
   as the popup itself. Reopening it would have hit every dashboard load from
   20 Aug onward.

Run: cd apps/api && venv/bin/python -m tests.test_support_ticket_lifecycle
"""
from pathlib import Path

API = Path(__file__).resolve().parents[1]
MAIN = (API / "main.py").read_text(encoding="utf-8")
MODELS = (API / "models.py").read_text(encoding="utf-8")
DASHBOARD = (
    API.parents[0] / "web" / "src" / "app" / "[sessionId]" / "page.tsx"
).read_text(encoding="utf-8")


def test_ticket_carries_a_read_marker():
    assert "user_read_at" in MODELS, "without a marker the popup repeats forever"


def test_stale_sweep_exists_and_is_scheduled():
    assert "_stale_ticket_loop" in MAIN
    assert "asyncio.create_task(_stale_ticket_loop())" in MAIN, "a loop nobody starts is dead code"


def test_stale_sweep_only_touches_open_tickets_after_seven_days():
    body = MAIN[MAIN.index("_stale_ticket_loop"):]
    body = body[: body.index("asyncio.create_task(_stale_ticket_loop())")]
    assert 'timedelta(days=7)' in body
    assert 'models.SupportTicket.status.in_(("new", "in_progress"))' in body, \
        "resolved and closed tickets must not be rewritten"
    assert 'models.SupportTicket.updated_at < cutoff' in body
    assert 'values(status="closed"' in body


def test_unread_endpoint_compares_admin_reply_against_the_marker():
    assert '@app.get("/support/tickets/unread")' in MAIN
    body = MAIN[MAIN.index('@app.get("/support/tickets/unread")'):]
    body = body[: body.index('@app.post("/support/tickets/{ticket_id}/read")')]
    assert 'models.SupportTicketReply.sender == "admin"' in body, "user replies are not news to the user"
    assert "func.max(models.SupportTicketReply.created_at)" in body, "only the newest reply decides"
    assert "func.coalesce(models.SupportTicket.user_read_at, models.SupportTicket.created_at)" in body, \
        "a never-read ticket must still surface its first admin reply"
    assert "last_admin.c.last_admin_at > seen" in body


def test_unread_endpoint_is_scoped_to_the_caller():
    body = MAIN[MAIN.index('@app.get("/support/tickets/unread")'):]
    body = body[: body.index('@app.post("/support/tickets/{ticket_id}/read")')]
    assert "models.SupportTicket.user_id == current_user.id" in body, \
        "a user must never see another user's ticket titles"


def test_mark_read_endpoint_checks_ownership():
    body = MAIN[MAIN.index('@app.post("/support/tickets/{ticket_id}/read")'):]
    body = body[: body.index("@app.", 10) if "@app." in body[10:] else len(body)]
    assert "t.user_id != current_user.id" in body
    assert "t.user_read_at = datetime.utcnow()" in body


def test_dashboard_asks_once_and_marks_read_on_confirm():
    assert 'fetch("/api/support/tickets/unread"' in DASHBOARD
    assert "/read`" in DASHBOARD, "confirming the popup must mark the ticket read"
    assert "}, [])" in DASHBOARD.split("support/tickets/unread")[1][:1600], \
        "an effect that reruns on every render would pop the alert repeatedly"


def test_dashboard_popup_uses_the_cookie_guard():
    block = DASHBOARD[DASHBOARD.index("support/tickets/unread") - 700:]
    block = block[: block.index("catch {")]
    assert "isCookieAuthSentinel(token)" in block, "Bearer __cookie_auth__ earns a 401"


if __name__ == "__main__":
    test_ticket_carries_a_read_marker()
    test_stale_sweep_exists_and_is_scheduled()
    test_stale_sweep_only_touches_open_tickets_after_seven_days()
    test_unread_endpoint_compares_admin_reply_against_the_marker()
    test_unread_endpoint_is_scoped_to_the_caller()
    test_mark_read_endpoint_checks_ownership()
    test_dashboard_asks_once_and_marks_read_on_confirm()
    test_dashboard_popup_uses_the_cookie_guard()
    print("support ticket lifecycle OK")
