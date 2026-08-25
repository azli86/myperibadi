"""Audio-to-text transcription for voice transactions.

Uses the same OpenAI-compatible base URL / API key that the receipt OCR uses,
hitting the standard Whisper endpoint `/audio/transcriptions`.

Supported input: audio bytes with an audio/* or video/* mime type. If the base
URL does not support `/audio/transcriptions`, we fall back to nothing (the
caller treats the media as unsupported) rather than crashing the bot flow.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    language: str | None = None


AUDIO_MIME_PREFIXES = ("audio/", "voice/", "video/")


def is_transcribable(mime_type: str | None) -> bool:
    """Return True when the media looks like a voice/audio/video clip."""
    if not mime_type:
        return False
    return mime_type.strip().lower().startswith(AUDIO_MIME_PREFIXES)


async def transcribe_audio(
    payload: bytes,
    mime_type: str,
    *,
    language_hint: str | None = None,
    timeout: float = 60.0,
) -> TranscriptionResult | None:
    """Transcribe audio bytes to text.

    Returns None when transcription is not configured or the provider rejects
    the request. Raises on transport errors so the caller can decide whether to
    surface a friendly message.
    """
    if not payload:
        return None
    api_key = (os.getenv("OCR_OPENAI_API_KEY") or "").strip()
    base_url = (os.getenv("OCR_OPENAI_BASE_URL") or "https://api.openai.com/v1").strip().rstrip("/")
    if not api_key:
        return None

    model = (os.getenv("WHISPER_MODEL") or "whisper-1").strip()
    # Mime may carry parameters like "audio/ogg; codecs=opus" which OpenAI
    # rejects and which break our extension lookup — use the base mime only.
    base_mime = (mime_type or "").split(";", 1)[0].strip().lower()
    ext = _guess_extension(base_mime)
    files = {
        "file": ("voice" + ext, payload, base_mime or "application/octet-stream"),
    }
    data: dict[str, str] = {"model": model, "response_format": "json"}
    # Only send a language hint when it looks like a valid ISO-639-1 code.
    # User profiles may store "BM"/"EN" which Whisper does not understand —
    # sending those breaks transcription, so map them or fall back to auto-detect.
    lang_code = _normalize_language_hint(language_hint)
    if lang_code:
        data["language"] = lang_code

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base_url}/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                data=data,
                files=files,
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        # 404 often means the provider has no transcription endpoint.
        if exc.response.status_code in {404, 400, 501}:
            return None
        raise
    except httpx.HTTPError:
        return None

    try:
        body = response.json()
    except ValueError:
        return None
    text = str(body.get("text") or "").strip()
    if not text:
        return None
    return TranscriptionResult(text=text, language=body.get("language"))


def _normalize_language_hint(language_hint: str | None) -> str | None:
    """Map app-facing language values to ISO-639-1 codes Whisper accepts.

    Returns None when no safe hint can be derived so the caller can let
    Whisper auto-detect the language instead of sending an invalid code.
    """
    if not language_hint:
        return None
    raw = language_hint.strip().lower()
    if raw in {"", "auto", "none", "null"}:
        return None
    alias = {
        "bm": "ms",
        "malay": "ms",
        "malaysia": "ms",
        "ms": "ms",
        "melayu": "ms",
        "en": "en",
        "english": "en",
        "bi": "en",
        "indonesian": "id",
        "id": "id",
    }
    if raw in alias:
        return alias[raw]
    # Fall back to allowing only short ISO-ish codes (2 letters, or zh/ja/etc.)
    if len(raw) == 2 and raw.isalpha():
        return raw
    return None


def _guess_extension(mime_type: str) -> str:
    mapping = {
        "audio/ogg": ".ogg",
        "audio/webm": ".webm",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/wave": ".wav",
        "audio/mp4": ".m4a",
        "audio/x-m4a": ".m4a",
        "audio/aac": ".aac",
        "audio/flac": ".flac",
        "audio/amr": ".amr",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
        "video/3gpp": ".3gp",
        "video/3gpp2": ".3g2",
    }
    clean = (mime_type or "").split(";", 1)[0].strip().lower()
    return mapping.get(clean, "")
