"""Audio-to-text transcription for voice transactions.

Uses the same OpenAI-compatible base URL / API key that the receipt OCR uses,
hitting the standard Whisper endpoint `/audio/transcriptions`.

Supported input: audio bytes with an audio/* or video/* mime type. If the base
URL does not support `/audio/transcriptions`, we fall back to nothing (the
caller treats the media as unsupported) rather than crashing the bot flow.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
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
    prompt: str | None = None,
    timeout: float = 60.0,
) -> TranscriptionResult | None:
    """Transcribe audio bytes to text.

    Returns None when transcription is not configured or the provider rejects
    the request. Raises on transport errors so the caller can decide whether to
    surface a friendly message.
    """
    if not payload:
        return None
    _debug_save_voice(payload, mime_type)
    api_key = (os.getenv("OCR_OPENAI_API_KEY") or "").strip()
    base_url = (os.getenv("OCR_OPENAI_BASE_URL") or "https://api.openai.com/v1").strip().rstrip("/")
    if not api_key:
        return None

    # gpt-4o-transcribe: same $/min as whisper-1 but far better on short
    # accented Bahasa Melayu clips and does not hallucinate on silence.
    model = (os.getenv("WHISPER_MODEL") or "gpt-4o-transcribe").strip()
    # Mime may carry parameters like "audio/ogg; codecs=opus" which OpenAI
    # rejects and which break our extension lookup — use the base mime only.
    base_mime = (mime_type or "").split(";", 1)[0].strip().lower()

    # Telegram voice notes are OGG Opus, which Whisper accepts but sometimes
    # transcribes less accurately than a decoded WAV. Convert to 16 kHz mono
    # WAV first (best format for Whisper) and fall back to the original bytes
    # if ffmpeg is unavailable or conversion fails.
    payload, ext, content_mime = _maybe_convert_to_wav(payload, base_mime)

    files = {
        "file": ("voice" + ext, payload, content_mime or "application/octet-stream"),
    }
    data: dict[str, str] = {"model": model, "response_format": "json"}
    # Guide Whisper toward common money/transaction words so short, accented
    # voice notes are spelled more accurately ("direct", "ringgit", wallet names).
    if prompt and prompt.strip():
        data["prompt"] = prompt.strip()
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
    # Whisper is trained mostly on Indonesian audio, so short Bahasa Melayu
    # clips often come back spelled Indonesian-style — including "Rp" (rupiah)
    # injected before amounts. Rewrite Indonesian currency tokens to Malaysian
    # so downstream parsers never record a Rupiah amount by mistake.
    text = _malaysianize_currency(text)
    return TranscriptionResult(text=text, language=body.get("language"))


def _debug_save_voice(payload: bytes, mime_type: str) -> None:
    """Keep recent raw voice uploads under /tmp so failed transcriptions can be
    re-analysed offline (pruned by age + count on every save)."""
    import hashlib
    import time

    try:
        d = "/tmp/voice_dbg"
        os.makedirs(d, exist_ok=True)
        ext = ".bin"
        base = (mime_type or "").split(";", 1)[0].strip().lower()
        ext_map = {"audio/ogg": ".ogg", "audio/webm": ".webm", "audio/mp4": ".m4a",
                   "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav"}
        if base in ext_map:
            ext = ext_map[base]
        h = hashlib.sha1(payload).hexdigest()[:10]
        path = os.path.join(d, f"{time.time():.0f}-{h}{ext}")
        with open(path, "wb") as f:
            f.write(payload)
        # Prune: older than 2 hours or more than 150 files.
        cutoff = time.time() - 7200
        try:
            for name in os.listdir(d):
                p = os.path.join(d, name)
                try:
                    if os.path.getmtime(p) < cutoff:
                        os.unlink(p)
                except OSError:
                    pass
            files = sorted(os.listdir(d))
            for name in files[:-150]:
                try:
                    os.unlink(os.path.join(d, name))
                except OSError:
                    pass
        except OSError:
            pass
    except Exception:
        pass


def _malaysianize_currency(text: str) -> str:
    """Map Indonesian currency spellings in a transcript to Malaysian ones."""
    import re

    # "makan rp 10 tng" / "rp10" / "Rp. 10" -> "makan RM 10 tng" (drop
    # nothing: RM is stripped by amount parsers and keeps the digit intact).
    text = re.sub(r"\brp\.?\s*([0-9][0-9.,]*)\b", r"RM \1", text, flags=re.I)
    text = re.sub(r"\brp\b", "RM", text, flags=re.I)
    text = re.sub(r"\brupiah\b", "ringgit", text, flags=re.I)
    return text


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


def _maybe_convert_to_wav(payload: bytes, mime_type: str) -> tuple[bytes, str, str | None]:
    """Decode OGG Opus voice notes to 16 kHz mono WAV for more accurate Whisper
    transcription. Falls back to the original bytes on any error.

    Returns (payload, extension, content_type)."""
    base = (mime_type or "").lower()
    # Only convert OGG (and optionally webm) voice; leave mp3/wav/m4a as-is
    # since they're already well supported.
    if base not in ("audio/ogg", "audio/webm", "audio/opus"):
        return payload, _guess_extension(base) or ".bin", base or "application/octet-stream"
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg or not payload:
        return payload, _guess_extension(base) or ".bin", base or "application/octet-stream"
    in_ext = _guess_extension(base) or ".ogg"
    try:
        with tempfile.NamedTemporaryFile(suffix=in_ext, delete=False) as fin:
            fin.write(payload)
            in_path = fin.name
        out_path = in_path + ".wav"
        try:
            result = subprocess.run(
                [
                    ffmpeg, "-y", "-i", in_path,
                    "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                    "-af", (
                        # NO loudnorm: its compressor distorts short voice clips
                        # (raises noise, pumps gain) and confuses Whisper. Strip
                        # leading + trailing silence only, since Whisper
                        # hallucinates English filler on quiet margins.
                        "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.4:"
                        "stop_periods=-1:stop_threshold=-50dB:stop_silence=0.5"
                    ),
                    out_path,
                ],
                capture_output=True,
                timeout=30,
            )
            if result.returncode == 0 and os.path.exists(out_path):
                with open(out_path, "rb") as fout:
                    wav_bytes = fout.read()
                if wav_bytes:
                    print(f"[voice-dbg] converted {base} to wav bytes={len(wav_bytes)}")
                    # Post-trim clip collapsed to near-nothing = pure silence.
                    # Whisper would hallucinate on it; return empty so the
                    # caller skips transcription instead.
                    if len(wav_bytes) < 5000:
                        return b"", ".wav", "audio/wav"
                    return wav_bytes, ".wav", "audio/wav"
        finally:
            for p in (in_path, out_path):
                try:
                    if p and os.path.exists(p):
                        os.unlink(p)
                except OSError:
                    pass
    except Exception as exc:
        print(f"[voice-dbg] ffmpeg conversion failed: {type(exc).__name__}: {exc}")
    return payload, _guess_extension(base) or ".bin", base or "application/octet-stream"


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
