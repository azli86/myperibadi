"""Message text must not reach the logs unless the switch is on.

The worker log had reached 193MB of user messages, bot replies and third party group
text, all in plain files. These checks run the real logging helpers rather than
grepping for strings, because a string check cannot tell whether the value behind it
is still the user's text.
"""

from __future__ import annotations

import importlib
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # apps/api
WORKER = ROOT.parent / "worker" / "index_v2.js"

SECRET = "subway 11.65 tng"


def _reload_log_privacy(value: str | None):
    if value is None:
        os.environ.pop("LOG_MESSAGE_CONTENT", None)
    else:
        os.environ["LOG_MESSAGE_CONTENT"] = value
    if "log_privacy" in sys.modules:
        del sys.modules["log_privacy"]
    return importlib.import_module("log_privacy")


def test_message_text_is_hidden_by_default():
    mod = _reload_log_privacy(None)
    assert mod.message_content_enabled() is False
    out = mod.preview(SECRET)
    assert SECRET not in out, out
    assert out == f"<{len(SECRET)} chars>", out


def test_message_text_returns_when_switched_on():
    mod = _reload_log_privacy("1")
    try:
        assert mod.message_content_enabled() is True
        out = mod.preview(SECRET)
        assert SECRET in out, out
    finally:
        _reload_log_privacy(None)


def test_preview_accepts_non_strings_without_leaking():
    mod = _reload_log_privacy(None)
    assert mod.preview(None) == "<0 chars>"
    assert mod.preview(123) == "<3 chars>"


def test_log_calls_route_through_the_switch():
    """Every log line that used to print the text must now call the helper.

    Guards the actual defect: the helper can be perfect while three call sites still
    interpolate the raw variable.
    """
    offenders = []
    for path in (ROOT / "modules").rglob("*.py"):
        text = path.read_text()
        for needle in ("reply_preview", "draft description=", "built text="):
            for i, line in enumerate(text.splitlines(), 1):
                if needle in line and "preview(" not in line:
                    offenders.append(f"{path.name}:{i}: {line.strip()[:100]}")
    assert not offenders, "raw content still logged:\n" + "\n".join(offenders)


def test_worker_hides_text_by_default():
    """Run the worker's own helper, so the check cannot drift from the real code."""
    script = (
        "process.env.LOG_MESSAGE_CONTENT='';\n"
        f"const src = require('fs').readFileSync({str(WORKER)!r}, 'utf8');\n"
        "const start = src.indexOf('const LOG_MESSAGE_CONTENT');\n"
        "const end = src.indexOf('const WA_MESSAGE_QUEUE_MAX');\n"
        "const body = src.slice(start, end);\n"
        "eval(body + ';console.log(logPreview(process.argv[1]));');\n"
    )
    out = subprocess.run(
        ["node", "-e", script, SECRET],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    assert SECRET not in out, out
    assert out == "<%d chars>" % len(SECRET), out


if __name__ == "__main__":
    test_message_text_is_hidden_by_default()
    test_message_text_returns_when_switched_on()
    test_preview_accepts_non_strings_without_leaking()
    test_log_calls_route_through_the_switch()
    test_worker_hides_text_by_default()
    print("log privacy checks passed")
