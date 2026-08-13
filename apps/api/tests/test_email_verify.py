from main import _is_disposable_email, _email_domain, _hash_email_verify_token, _is_verify_grace_expired
from datetime import datetime, timedelta


class _U:
    def __init__(self, verified=None, sent=None):
        self.email_verified_at = verified
        self.verification_email_sent_at = sent


def test_grace_not_expired_when_verified():
    assert _is_verify_grace_expired(_U(verified=datetime.utcnow(), sent=datetime.utcnow() - timedelta(days=5))) is False


def test_grace_expired_when_unverified_past_2d():
    assert _is_verify_grace_expired(_U(verified=None, sent=datetime.utcnow() - timedelta(days=3))) is True


def test_grace_not_expired_within_window():
    assert _is_verify_grace_expired(_U(verified=None, sent=datetime.utcnow() - timedelta(hours=10))) is False


def test_grace_exempts_legacy_no_sent_at():
    assert _is_verify_grace_expired(_U(verified=None, sent=None)) is False
    assert _is_disposable_email("bot@hidepost.net") is True
    assert _is_disposable_email("x@mailinator.com") is True


def test_normal_domain_allowed():
    assert _is_disposable_email("user@gmail.com") is False
    assert _is_disposable_email("ali@myperibadi.com.my") is False


def test_email_domain_extracts_lowercase():
    assert _email_domain("Ali@Gmail.COM") == "gmail.com"


def test_verify_token_hash_roundtrip():
    tok = "abc123"
    h = _hash_email_verify_token(tok)
    assert len(h) == 64  # sha256 hex
    assert h == _hash_email_verify_token(tok)
    assert h != _hash_email_verify_token("other")