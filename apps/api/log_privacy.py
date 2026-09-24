"""Content logging, off unless explicitly switched on.

Bot logs carried the full text of user messages so that a misread command could be
diagnosed after the fact. That also put every message, every bot reply, and third
party group text into a plain file that grew without bound.

Diagnostics still need the text sometimes, so it is a switch rather than a deletion:
set LOG_MESSAGE_CONTENT=1 in the environment, restart, and the text comes back.

Length and identity stay in the logs either way, so the common questions (did the
message arrive, how long was it, who sent it, how long did the reply take) do not
need the switch.
"""

from __future__ import annotations

import os
from typing import Any

_MESSAGE_CONTENT_ENABLED = os.getenv("LOG_MESSAGE_CONTENT", "").strip().lower() in {"1", "true", "yes", "on"}


def message_content_enabled() -> bool:
    return _MESSAGE_CONTENT_ENABLED


def preview(value: Any, limit: int = 120) -> str:
    """The value itself when content logging is on, otherwise a length marker.

    Keeps the surrounding log line readable in both modes, so a search for a
    diagnostic line does not change shape depending on the switch.
    """
    text = value if isinstance(value, str) else str(value or "")
    if _MESSAGE_CONTENT_ENABLED:
        collapsed = " ".join(text.split())
        if len(collapsed) <= limit:
            return repr(collapsed)
        return repr(collapsed[: limit - 3] + "...")
    return f"<{len(text)} chars>"
