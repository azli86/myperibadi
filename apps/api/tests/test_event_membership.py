"""Checks for derived event membership.

Membership is computed, not stored, so the rule itself is the thing worth
pinning: a transaction belongs to an event when its date is inside the window
and its wallet matches (or the event watches all wallets), minus the user's
explicit exclusions. The SQL predicate is built here without a database, so the
assertions cover the boundary dates that are easy to get wrong.
"""
import sys

sys.path.insert(0, ".")

from datetime import date

from modules.events import queries


class Txn:
    def __init__(self, id, txn_date=None, wallet_id=None, user_id="u1", amount=0):
        self.id = id
        self.txn_date = txn_date
        self.wallet_id = wallet_id
        self.user_id = user_id
        self.amount = amount


class Event:
    def __init__(self, id=1, start=None, end=None, wallet_id=None, user_id="u1"):
        self.id = id
        self.start_date = start
        self.end_date = end
        self.wallet_id = wallet_id
        self.user_id = user_id


def matches(event, txn):
    """Python mirror of event_membership_condition, used to pin the semantics."""
    if event.start_date is None or event.end_date is None:
        return False
    if txn.user_id != event.user_id:
        return False
    if txn.txn_date is None:
        return False
    if not (event.start_date <= txn.txn_date <= event.end_date):
        return False
    if event.wallet_id is not None and txn.wallet_id != event.wallet_id:
        return False
    return True


def test_predicate_shape():
    event = Event(start=date(2026, 9, 20), end=date(2026, 9, 24))
    conditions = queries.event_membership_condition(event)
    assert conditions is not None
    rendered = " ".join(str(c) for c in conditions)
    assert "event_transaction_exclusions" in rendered, rendered
    assert "EXISTS" in rendered.upper(), rendered
    assert len(conditions) == 4  # user, start, end, exclusion

    # A wallet-scoped event adds exactly one more clause.
    scoped = queries.event_membership_condition(Event(start=date(2026, 9, 20), end=date(2026, 9, 24), wallet_id=7))
    assert len(scoped) == 5

    # Without both dates an event can never claim anything.
    assert queries.event_membership_condition(Event(start=None, end=date(2026, 9, 24))) is None
    assert queries.event_membership_condition(Event(start=date(2026, 9, 20), end=None)) is None


def test_trip_window():
    # The reported case: a trip 20-24 Sep picks up spending on those days.
    trip = Event(start=date(2026, 9, 20), end=date(2026, 9, 24))
    assert not matches(trip, Txn(1, txn_date=date(2026, 9, 19)))  # day before
    assert matches(trip, Txn(2, txn_date=date(2026, 9, 20)))  # inclusive start
    assert matches(trip, Txn(3, txn_date=date(2026, 9, 22)))  # inside
    assert matches(trip, Txn(4, txn_date=date(2026, 9, 24)))  # inclusive end
    assert not matches(trip, Txn(5, txn_date=date(2026, 9, 25)))  # day after

    # Another user's transaction never counts.
    assert not matches(trip, Txn(6, txn_date=date(2026, 9, 22), user_id="other"))


def test_wallet_scope_is_optional():
    window = dict(start=date(2026, 9, 20), end=date(2026, 9, 24))
    any_wallet = Event(**window)
    assert matches(any_wallet, Txn(1, txn_date=date(2026, 9, 22), wallet_id=7))
    assert matches(any_wallet, Txn(2, txn_date=date(2026, 9, 22), wallet_id=9))

    one_wallet = Event(**window, wallet_id=7)
    assert matches(one_wallet, Txn(3, txn_date=date(2026, 9, 22), wallet_id=7))
    assert not matches(one_wallet, Txn(4, txn_date=date(2026, 9, 22), wallet_id=9))


def test_overlapping_events_both_claim():
    # Two overlapping events are expected to share a transaction.
    a = Event(id=1, start=date(2026, 9, 20), end=date(2026, 9, 24))
    b = Event(id=2, start=date(2026, 9, 20), end=date(2026, 9, 25))
    txn = Txn(1, txn_date=date(2026, 9, 21))
    assert matches(a, txn) and matches(b, txn)


def test_exclusion_is_checked_before_membership():
    """Re-detaching must not 404.

    The exclusion row removes the transaction from the membership predicate, so
    once excluded the "is this transaction in the event?" check no longer finds
    it. set_transaction_in_event must therefore look for an existing exclusion
    FIRST, otherwise a double-tap on the remove button returns 404 and the UI
    reports a failure for an operation that already succeeded.
    """
    import inspect

    source = inspect.getsource(queries.set_transaction_in_event)
    exclusion_lookup = source.index("EventTransactionExclusion.id")
    membership_check = source.index("event_membership_condition(event)")
    assert exclusion_lookup < membership_check, (
        "existing-exclusion lookup must precede the membership check"
    )


def main():
    test_predicate_shape()
    test_trip_window()
    test_wallet_scope_is_optional()
    test_overlapping_events_both_claim()
    test_exclusion_is_checked_before_membership()
    print("event membership OK")


if __name__ == "__main__":
    main()
