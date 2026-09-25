"""Repeated decryption noise must not fill the worker log.

A session with no creds.json kept failing to decrypt. libsignal reports that with a
bare console.error, which bypasses the pino logger and its throttle, and the worker
log grew to 549MB in five hours -- roughly 2.6GB/day.

node_modules cannot be patched because npm install replaces it, so index_v2.js wraps
console.error instead. These checks run the real wrapper rather than grepping for it,
and confirm real errors still get through.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

WORKER = Path(__file__).resolve().parents[2] / "worker" / "index_v2.js"

# Runs the two functions under test, then exercises the wrapper.
PROBE = r"""
const fs = require("fs");
const src = fs.readFileSync(process.argv[1], "utf8");
const start = src.indexOf("function isCryptoErrorLog");
const end = src.indexOf("function recordSessionCryptoError");
if (start < 0 || end < 0) { console.log(JSON.stringify({error: "markers not found"})); process.exit(0); }
const body = src.slice(start, end);

const captured = [];
let realConsoleError = (...args) => captured.push(args.map(String).join(" "));
eval(body.replace("console.error.bind(console)", "realConsoleError"));

const payloads = [
  "Session error:SessionError: Over 2000 messages into the future!",
  "Session error:SessionError: Over 2000 messages into the future!",
  "Session error:SessionError: Over 2000 messages into the future!",
  "Error: Bad MAC",
  "Error: Bad MAC",
  "MessageCounterError: ...",
  "Something genuinely broken",
  "Failed to start webhook delivery",
];
for (const p of payloads) console.error(p);
console.log(JSON.stringify({ captured }));
"""


def _run_probe() -> list[str]:
    out = subprocess.run(
        ["node", "-e", PROBE, str(WORKER)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip().splitlines()
    return json.loads(out[-1])["captured"]


def test_repeated_crypto_noise_is_collapsed():
    captured = _run_probe()
    over_2000 = [c for c in captured if "Over 2000 messages" in c]
    bad_mac = [c for c in captured if "Bad MAC" in c]
    assert len(over_2000) == 1, over_2000
    assert len(bad_mac) == 1, bad_mac


def test_real_errors_still_reach_the_log():
    """A filter that hides everything is worse than the noise it removed."""
    captured = _run_probe()
    joined = "\n".join(captured)
    assert "Something genuinely broken" in joined, joined
    assert "Failed to start webhook delivery" in joined, joined


def test_the_silenced_patterns_are_named_in_the_predicate():
    """Guards the regression directly: these are the strings libsignal emits."""
    src = WORKER.read_text()
    predicate = src[src.index("function isCryptoErrorLog") : src.index("function recordSessionCryptoError")]
    for needle in ("messages into the future", "MessageCounterError", "Bad MAC"):
        assert needle in predicate, needle


if __name__ == "__main__":
    test_repeated_crypto_noise_is_collapsed()
    test_real_errors_still_reach_the_log()
    test_the_silenced_patterns_are_named_in_the_predicate()
    print("worker log noise checks passed")
