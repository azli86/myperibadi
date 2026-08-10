"""Self-check for Split Bill pure logic (no DB).

Run: venv/bin/python -m tests.test_split_bill_logic
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.split_bills import service


class FakeRow:
    def __init__(self, **kw):
        self.payments = []
        for k, v in kw.items():
            setattr(self, k, v)


def test_compute_status():
    # collect > 0, balance 0 -> completed
    r = FakeRow(status="active", balance_amount=0, collect_amount=10, amount_received=10)
    assert service.compute_split_status(r) == "completed", service.compute_split_status(r)
    # balance > 0 -> stays active unless partial
    r = FakeRow(status="active", balance_amount=5, collect_amount=10, amount_received=5)
    assert service.compute_split_status(r) == "partial"
    r = FakeRow(status="active", balance_amount=10, collect_amount=10, amount_received=0)
    assert service.compute_split_status(r) == "active"


def test_recompute_amounts():
    r = FakeRow(status="active", collect_amount=16.67, amount_received=0, balance_amount=16.67, updated_at=None)
    from datetime import datetime

    r.updated_at = datetime.utcnow()
    p = FakeRow(amount=5.0)
    r.payments = [p]
    service.recompute_amounts(r)
    assert abs(r.amount_received - 5.0) < 0.001
    assert abs(r.balance_amount - 11.67) < 0.01
    assert r.status == "partial"


if __name__ == "__main__":
    test_compute_status()
    test_recompute_amounts()
    print("split_bill_logic OK")
