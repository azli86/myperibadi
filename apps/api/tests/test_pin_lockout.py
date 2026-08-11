"""Unit tests for PIN lockout logic (_is_user_pin_locked / _record_pin_failed_attempt).

Does not touch the production database: uses plain stub user objects.
"""
import datetime

import pytest

import main


class StubUser:
    def __init__(self, pin_failed_attempts=0, pin_locked_until=None):
        self.pin_failed_attempts = pin_failed_attempts
        self.pin_locked_until = pin_locked_until


def _future_ts(minutes=15):
    return datetime.datetime.utcnow() + datetime.timedelta(minutes=minutes)


def test_not_locked_when_no_lock():
    assert main._is_user_pin_locked(StubUser()) is False


def test_locked_while_lock_in_future():
    user = StubUser(pin_locked_until=_future_ts(15))
    assert main._is_user_pin_locked(user) is True


def test_not_locked_after_expiry():
    user = StubUser(pin_locked_until=datetime.datetime.utcnow() - datetime.timedelta(minutes=1))
    assert main._is_user_pin_locked(user) is False


def test_failed_attempts_below_threshold_not_locked():
    user = StubUser()
    for _ in range(main.PIN_LOCK_THRESHOLD - 1):
        locked = main._record_pin_failed_attempt(user)
    assert locked is False
    assert user.pin_failed_attempts == main.PIN_LOCK_THRESHOLD - 1
    assert user.pin_locked_until is None


def test_reaching_threshold_locks_and_returns_true():
    user = StubUser()
    locked = False
    for _ in range(main.PIN_LOCK_THRESHOLD):
        locked = main._record_pin_failed_attempt(user)
    assert locked is True
    assert user.pin_failed_attempts == main.PIN_LOCK_THRESHOLD
    assert user.pin_locked_until is not None


def test_already_locked_returns_true_without_increment():
    user = StubUser(pin_failed_attempts=0, pin_locked_until=_future_ts(15))
    assert main._record_pin_failed_attempt(user) is True
    assert user.pin_failed_attempts == 0


def test_clear_pin_lock_resets_fields():
    user = StubUser(pin_failed_attempts=main.PIN_LOCK_THRESHOLD, pin_locked_until=_future_ts(15))
    main._clear_user_pin_lock(user)
    assert user.pin_failed_attempts == 0
    assert user.pin_locked_until is None
