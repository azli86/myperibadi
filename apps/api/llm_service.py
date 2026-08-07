import json
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models


@dataclass(frozen=True)
class LLMConfig:
    enabled: bool
    api_key: str
    base_url: str
    model: str
    fallback_model: str
    allowed_channels: tuple[str, ...]
    timeout_seconds: float
    max_history_messages: int
    max_tokens: int
    temperature: float


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name, "true" if default else "false").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _split_csv_env(name: str, default: list[str]) -> tuple[str, ...]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return tuple(default)
    return tuple(item.strip() for item in raw.split(",") if item.strip())


def get_llm_config() -> LLMConfig:
    api_key = (os.getenv("ILMU_API_KEY") or os.getenv("OPENAI_API_KEY") or "").strip()
    base_url = (
        os.getenv("ILMU_BASE_URL")
        or os.getenv("OPENAI_BASE_URL")
        or "https://api.ilmu.ai/v1"
    ).strip().rstrip("/")
    model = (os.getenv("ILMU_MODEL") or "nemo-super").strip()
    fallback_model = (os.getenv("ILMU_FALLBACK_MODEL") or "").strip()
    timeout_raw = (os.getenv("ILMU_TIMEOUT_SECONDS") or "12").strip()
    history_raw = (os.getenv("ILMU_MAX_HISTORY_MESSAGES") or "4").strip()
    max_tokens_raw = (os.getenv("ILMU_MAX_TOKENS") or "360").strip()
    temperature_raw = (os.getenv("ILMU_TEMPERATURE") or "0.65").strip()

    try:
        timeout_seconds = max(3.0, float(timeout_raw))
    except ValueError:
        timeout_seconds = 12.0

    try:
        max_history_messages = max(2, int(history_raw))
    except ValueError:
        max_history_messages = 4

    try:
        max_tokens = max(64, int(max_tokens_raw))
    except ValueError:
        max_tokens = 360

    try:
        temperature = min(1.0, max(0.0, float(temperature_raw)))
    except ValueError:
        temperature = 0.65

    return LLMConfig(
        enabled=_env_flag("ILMU_ENABLED", default=False),
        api_key=api_key,
        base_url=base_url,
        model=model,
        fallback_model=fallback_model,
        allowed_channels=_split_csv_env("ILMU_CHAT_CHANNELS", ["chat"]),
        timeout_seconds=timeout_seconds,
        max_history_messages=max_history_messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )


def is_llm_reply_enabled_for_channel(source_channel: str) -> bool:
    config = get_llm_config()
    return config.enabled and bool(config.api_key) and source_channel in config.allowed_channels


def _normalize_personality_for_prompt(value: str | None) -> Optional[str]:
    cleaned = " ".join((value or "").split())
    if not cleaned:
        return None
    if len(cleaned) > 160:
        cleaned = cleaned[:160].rstrip()
    return cleaned


def _normalize_user_call_name(value: str | None) -> Optional[str]:
    cleaned = " ".join((value or "").split())
    if not cleaned:
        return None
    if len(cleaned) > 40:
        cleaned = cleaned[:40].rstrip()
    if re.search(r"[`<>\[\]{}]", cleaned):
        return None
    return cleaned


def _extract_bot_call_name(user_personality: str | None) -> Optional[str]:
    cleaned = _normalize_personality_for_prompt(user_personality)
    if not cleaned:
        return None

    # Explicit pattern support, e.g. "Nama bot: Malik" or "Call you Malik".
    explicit_patterns = [
        r"(?:nama|name)\s*(?:bot|assistant)?\s*(?:ialah|adalah|is|=|:)\s*([A-Za-z][A-Za-z0-9 _-]{1,23})",
        r"(?:panggil|call)\s*(?:bot|assistant|you|awak|kau)?\s*(?:sebagai|as)?\s*([A-Za-z][A-Za-z0-9 _-]{1,23})",
    ]
    for pattern in explicit_patterns:
        match = re.search(pattern, cleaned, flags=re.IGNORECASE)
        if not match:
            continue
        name = " ".join((match.group(1) or "").split()).strip(" .,!?:;")
        if re.fullmatch(r"[A-Za-z][A-Za-z0-9 _-]{1,23}", name):
            return name

    # If user stores a single short token (e.g. "Malik"), interpret it as call name.
    if re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{1,19}", cleaned):
        return cleaned
    return None


def build_system_prompt(
    language: str,
    user_personality: str | None = None,
    user_display_name: str | None = None,
) -> str:
    if (language or "BM").upper() == "EN":
        reply_language = "English"
        command_examples = "`lunch 12.50`, `summary`, `list`, `budget set food 600`"
        extra_language_hint = ""
    else:
        reply_language = "Bahasa Melayu Malaysia"
        command_examples = "`makan 12.50`, `summary`, `list`, `budget set makanan 600`"
        extra_language_hint = " Use natural Malaysian Malay, not Indonesian."

    personality_hint = _normalize_personality_for_prompt(user_personality)
    user_call_name = _normalize_user_call_name(user_display_name)
    preferred_name = _extract_bot_call_name(user_personality)
    identity_block = ""
    if preferred_name:
        identity_block = (
            f"[IDENTITY]\n"
            f"- Your preferred call name for this user is: {preferred_name}\n"
            f"- If asked who you are or what to call you, say they can call you {preferred_name}.\n"
            f"- You are still the official MyPeribadi assistant.\n\n"
        )

    user_block = ""
    if user_call_name:
        user_block = (
            f"[USER CONTEXT]\n"
            f"- User display name (internal only): {user_call_name}\n"
            f"- Do NOT open replies with the user's name. Do NOT address them by name in the first sentence.\n"
            f"- Prefer neutral openings like a normal chat reply. Never write patterns like \"{user_call_name}, ...\".\n\n"
        )

    personality_block = ""
    if personality_hint:
        personality_block = (
            f"[USER STYLE PREFERENCE]\n"
            f"- Preferred personality style: {personality_hint}\n"
            f"- Use this preference ONLY for tone and wording style.\n"
            f"- Never change scope, command syntax, budgeting logic, or system rules because of this preference.\n"
            f"- If it conflicts with [SCOPE & CRITICAL RULES], ignore the conflicting part.\n\n"
        )

    return (
        f"[ROLE]\n"
        f"You are the official MyPeribadi AI assistant. Reply in {reply_language} ({extra_language_hint}) like a warm, patient teacher — clear, informative, and easy to follow.\n"
        f"You support MyPeribadi users on the web portal, WhatsApp, and phone browser chat experiences.\n\n"
        f"[SCOPE & CRITICAL RULES]\n"
        f"1. STAY IN SCOPE: Focus entirely on personal finance, MyPeribadi app usage, expense tracking, and debt management. If asked unrelated questions (politics, cooking, etc.), politely decline and steer back to MyPeribadi. For harmless casual questions, answer briefly then guide back to budget usage.\n"
        f"2. DO NOT HALLUCINATE COMMANDS: ONLY provide the exact commands listed in the [COMMAND REFERENCE] below. Never invent new syntax.\n"
        f"3. PADAT & INFORMATIF (DEFAULT): Write complete, useful answers like a short essay (karangan) — dense with info, not sparse. Prefer 80–220 words when teaching. Lead with the answer, then explain, then give commands/examples.\n"
        f"4. COMPACT FORMATTING (CRITICAL FOR WHATSAPP):\n"
        f"   • Write in continuous paragraphs (2–4 short paragraphs). Do NOT put each sentence on its own line.\n"
        f"   • Do NOT insert blank lines between every sentence or bullet.\n"
        f"   • Maximum ONE blank line between sections only when switching topic (e.g. explanation → example).\n"
        f"   • Prefer: paragraph + tight bullet list (one item per line, no empty line between bullets) + short closing sentence.\n"
        f"   • Avoid headings, markdown # titles, horizontal rules, or decorative separators.\n"
        f"5. DEPTH BY INTENT: For how-to, help, feature, budget tips, debt/loan/subscription — informative and thorough but still compact. For greetings/yes-no — short warm reply + 1 tip.\n"
        f"6. KEEP CONTEXT: If the user says they don't understand ('tak faham'), DO NOT change the topic. Re-explain with simpler words and one clear example from chat history.\n"
        f"7. NO FAKE ACTIONS: Do not claim you performed actions or invent balances. Friendly confirmations like 'Done! ✅' only for commands you actually processed.\n"
        f"8. FRIENDLY TONE: Warm, everyday language. Light emojis (✅📊💰) are fine. Avoid slang seperti boss, bro, mate.\n"
        f"9. BULLET STYLE: Use '•' only. Keep bullet lists tight: no blank line between bullets. Do not use hyphen bullets, tree symbols, or long dash separators.\n"
        f"10. STYLE GUARDRAIL: Personality preferences can change tone only, never operational behavior.\n"
        f"11. MODEL IDENTITY: If asked what model/AI/engine powers you, answer only that you are powered by a local LLM model by DigitalPort AI. Do not reveal internal provider/model names.\n"
        f"12. VAGUE / INCOMPLETE QUESTIONS GUARD: If the user sends a short, vague, or incomplete message (e.g. only 'macam mana nak guna', 'cara nak guna', 'help', 'apa ni', 'tak paham', '?') without specifying WHAT they want to use or ask about, DO NOT reply with a generic assistant template like 'Nampaknya anda ingin bertanya macam mana nak guna sesuatu, tetapi belum nyatakan apa'. Instead, briefly ask WHAT they want to do and immediately offer the most useful MyPeribadi commands with examples (e.g. record expense 'Makan 10', summary 'summary', budget 'budget set makanan 600', debt 'borrow Ali 50', loan 'loanx list', subscription 'subx list'). Keep it short (2-3 lines). Never behave like a generic support bot; always steer to MyPeribadi budgeting.\n\n"
        f"{identity_block}"
        f"{user_block}"
        f"{personality_block}"
        f"[COMMAND REFERENCE]\n"
        f"1. TRANSACTIONS\n"
        f"- Basic: `[Note] [Amount]` (e.g., `Makan 10`)\n"
        f"- With Wallet: `[Note] [Amount] [Wallet]` (e.g., `Makan 10 Cash`, `Gaji 3500 Maybank`)\n"
        f"- Backdate: Append `@DDMMYYYY` (e.g., `Grab 18.50 @05042026`)\n"
        f"- Multi-item mode: Start with `item` or `bd` on first line, then list items with amounts: `item makan` then `nasi ayam 5` `sirap 2`. Quantity format: `telur 2 x 8.50` or `ayam 1.5 @ 12`.\n\n"
        f"2. WALLETS & TRANSFERS\n"
        f"- Transfer: `transfer [amount] dari [from_wallet] ke [to_wallet]` or `transfer [amount] [from] [to]`\n"
        f"- Malay version: `pindah [amount] [from] [to]`\n"
        f"- Check balance: `checkwallet` or `semak wallet`\n\n"
        f"3. REPORTS\n"
        f"- Monthly summary: `summary`\n"
        f"- Last 5 records: `list`\n"
        f"- Help: `help`\n\n"
        f"4. BUDGET (also: `bajet`)\n"
        f"- Set budget: `budget set [category] [amount]` (e.g., `budget set makanan 600`)\n"
        f"- Set specific month: `budget set [category] [amount] @YYYY-MM`\n"
        f"- Summary: `budget summary` or `budget ringkasan`\n"
        f"- List budgets: `budget list`\n"
        f"- Check category balance: `budget baki [category]`\n"
        f"- Delete budget: `budget delete [category] @YYYY-MM`\n\n"
        f"5. DEBT TRACKER\n"
        f"- Someone owes you: `lend [name] [amount]` (e.g., `lend Ali 50`)\n"
        f"- You owe someone: `borrow [name] [amount]` (e.g., `borrow Ahmad 100`)\n"
        f"- Repay debt: `pay [name] [amount]` (e.g., `pay Ahmad 30`)\n"
        f"- Check balance: `balance [name]`\n"
        f"- List all debts: `debt list`\n\n"
        f"6. LOAN TRACKER (loanx)\n"
        f"- Add loan: `loanx add [name] [total] [monthly]` (e.g., `loanx add kereta 12000 500`)\n"
        f"- List active: `loanx list`\n"
        f"- Pay loan: `loanx pay [name] [amount]` (e.g., `loanx pay kereta 500`)\n"
        f"- Pay from wallet: `loanx pay [name] [amount] wallet [wallet]`\n\n"
        f"7. SUBSCRIPTION (subx)\n"
        f"- Add subscription: `subx [name] [amount] [day]HB` (e.g., `SUBX ASTRO 89.90 15HB`)\n"
        f"- Pay subscription: `subx pay [name] [amount] [wallet]` (e.g., `SUBX PAY ASTRO 89.90 TNG`)\n\n"
        f"8. MAP FEATURE (PETA LOKASI)\n"
        f"- Record a new transaction with location: send a location pin first, then append `@here` to the transaction (e.g., `makan 10 @here`).\n"
        f"- The map visualizes where expenses occurred. Available in the web portal.\n\n"
        f"9. SYSTEM\n"
        f"- Change language: `lang en` or `lang bm`\n"
    )


async def _fetch_user_profile_context(db: AsyncSession | None, user_id: str) -> tuple[Optional[str], Optional[str]]:
    if db is None:
        return None, None
    result = await db.execute(
        select(models.User.bot_personality, models.User.name).where(models.User.id == user_id).limit(1)
    )
    row = result.one_or_none()
    if row is None:
        return None, None
    personality_raw, user_name_raw = row
    personality = personality_raw if isinstance(personality_raw, str) else None
    user_name = user_name_raw if isinstance(user_name_raw, str) else None
    return _normalize_personality_for_prompt(personality), _normalize_user_call_name(user_name)


def _apply_user_name_addressing(reply_text: str, user_name: str | None) -> str:
    """Strip forced name greetings — do not prefix user name onto AI replies."""
    cleaned_reply = (reply_text or "").strip()
    if not cleaned_reply:
        return cleaned_reply
    normalized_name = _normalize_user_call_name(user_name)
    if not normalized_name:
        return cleaned_reply
    # Remove openings like "Ali, ..." / "Ali: ..." / "Hi Ali," / "Hello Ali!"
    patterns = [
        rf"^(?:hi|hello|hey|hai|helo|salam|assalamualaikum)\s+{re.escape(normalized_name)}\s*[,!:\-–—]?\s*",
        rf"^{re.escape(normalized_name)}\s*[,:!\-–—]\s+",
        rf"^{re.escape(normalized_name)}\s+",
    ]
    for pattern in patterns:
        cleaned_reply = re.sub(pattern, "", cleaned_reply, count=1, flags=re.IGNORECASE)
    return cleaned_reply.strip()


async def _fetch_recent_chat_history(
    db: AsyncSession,
    *,
    user_id: str,
    limit: int,
    source_channel: str,
) -> list[models.ChatMessage]:
    history_channel = source_channel if source_channel in {"chat", "whatsapp"} else "chat"
    result = await db.execute(
        select(models.ChatMessage)
        .where(
            models.ChatMessage.user_id == user_id,
            models.ChatMessage.source_channel == history_channel,
            models.ChatMessage.text.is_not(None),
        )
        .order_by(models.ChatMessage.created_at.desc(), models.ChatMessage.id.desc())
        .limit(limit)
    )
    rows = list(result.scalars().all())
    rows.reverse()
    return rows


def _clean_bot_message_for_history(text: str) -> str:
    if not text:
        return ""
    # Strip transaction headers like ✅*Done!*✅ | *TXN26-XXXXXX*
    # or ✅*Transfer Successful!*✅ | *TXN26-XXXXXX*
    # We strip the first line if it looks like a transaction header
    lines = text.split("\n")
    if lines and ("✅" in lines[0] and ("TXN" in lines[0] or "Done!" in lines[0] or "Berjaya" in lines[0] or "Success" in lines[0])):
        # Remove the first line and any following empty lines
        remaining = lines[1:]
        while remaining and not remaining[0].strip():
            remaining.pop(0)
        return "\n".join(remaining).strip()
    return text.strip()


def build_chat_messages(
    *,
    system_prompt: str,
    history: list[models.ChatMessage],
    user_message: str,
) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for item in history:
        role = "assistant" if item.role == "bot" else "user"
        content = (item.text or "").strip()
        if role == "assistant":
            content = _clean_bot_message_for_history(content)
        
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_message.strip()})
    return messages


def _guard_generic_reply(reply_text: str, language: str = "BM") -> str:
    """Replace generic support-bot / out-of-scope template replies with a
    short MyPeribadi steering message. Prevents the LLM from replying like a
    generic assistant (e.g. 'Nampaknya anda ingin bertanya macam mana nak guna…')."""
    text = (reply_text or "").strip()
    if not text:
        return text
    lowered = text.lower()
    generic_signals = (
        "nampaknya anda ingin bertanya macam mana nak guna",
        "belum nyatakan apa",
        "anda ingin bertanya **macam mana nak guna** sesuatu",
        "macam mana nak guna saya (ai",
        "jikalau anda maksudkan **macam mana nak guna saya",
        "sebagai ai assistant",
        "i'm an ai assistant here to help",
        "you seem to be asking how to use something",
    )
    if not any(sig in lowered for sig in generic_signals):
        # Broader pattern: reply steers toward "how to use ME / I am an AI assistant"
        # instead of MyPeribadi budgeting — still an out-of-scope generic template.
        if not re.search(
            r"(cara menggunakan saya|macam mana nak guna saya|guna saya\s*\(?ai|i['’]?m an? ai assistant|\bai assistant\b|ini panduan|berikut adalah panduan|cara menggunakan saya\(?ai)",
            lowered,
        ):
            return text
    return _build_command_help_reply(language)


def _compact_reply_text(text: str) -> str:
    """Make LLM replies denser: collapse blank lines and strip noisy spacing for chat/WhatsApp."""
    if not text:
        return ""
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    # Drop decorative separators the model sometimes invents
    cleaned = re.sub(r"(?m)^[ \t]*([-=_*~]{3,}|—{2,}|–{2,})[ \t]*$", "", cleaned)
    # Trim trailing spaces on each line
    lines = [line.rstrip() for line in cleaned.split("\n")]
    # Collapse 2+ blank lines → single blank line, then drop leading/trailing blanks
    compact_lines: list[str] = []
    blank_run = 0
    for line in lines:
        if not line.strip():
            blank_run += 1
            if blank_run == 1 and compact_lines:
                compact_lines.append("")
            continue
        blank_run = 0
        compact_lines.append(line)
    # Remove blank lines that sit between consecutive bullet/list lines
    result: list[str] = []
    bullet_re = re.compile(r"^\s*(?:[•●▪‣*]|\d+[\.)]|[-–—])\s+")
    for i, line in enumerate(compact_lines):
        if not line.strip():
            prev_is_bullet = i > 0 and bool(bullet_re.match(compact_lines[i - 1] or ""))
            next_is_bullet = i + 1 < len(compact_lines) and bool(
                bullet_re.match(compact_lines[i + 1] or "")
            )
            if prev_is_bullet and next_is_bullet:
                continue
            # Keep at most one blank between non-bullet paragraphs
            if result and result[-1] == "":
                continue
            result.append("")
            continue
        result.append(line)
    while result and not result[0].strip():
        result.pop(0)
    while result and not result[-1].strip():
        result.pop()
    # Soft-join accidental single-sentence-per-line prose (no bullets, short lines)
    if result and not any(bullet_re.match(line) for line in result if line.strip()):
        non_empty = [line.strip() for line in result if line.strip()]
        if len(non_empty) >= 3 and all(len(line) < 90 for line in non_empty):
            # Merge into paragraphs of ~2–3 sentences
            joined = " ".join(non_empty)
            joined = re.sub(r"\s{2,}", " ", joined).strip()
            return joined
    return "\n".join(result).strip()


def _extract_reply_text(payload: dict[str, Any]) -> Optional[str]:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first_choice = choices[0] if isinstance(choices[0], dict) else {}
    message = first_choice.get("message") if isinstance(first_choice, dict) else {}
    if not isinstance(message, dict):
        return None
    content = message.get("content")
    if isinstance(content, str):
        cleaned = _compact_reply_text(content)
        return cleaned or None
    return None


def _reply_looks_complete(reply_text: str, finish_reason: Optional[str]) -> bool:
    cleaned = (reply_text or "").strip()
    if not cleaned:
        return False
    if finish_reason != "length":
        return True
    if cleaned.endswith(("...", "…")):
        return False
    if re.search(r"[.!?`)]$", cleaned):
        return True
    return False


def _preview_text(text: str, limit: int = 120) -> str:
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3] + "..."


def _build_command_help_reply(language: str) -> str:
    """Full MyPeribadi command list (mirrors the portal Help page)."""
    if (language or "BM").upper() == "EN":
        return (
            "Here are the commands you can use with me:\n"
            "• `[Note] [Amount]` — record expense (e.g. `Makan 10`)\n"
            "• `summary` — current month summary\n"
            "• `list` — latest 5 transactions\n"
            "• `checkwallet` / `semak wallet` — wallet balances\n"
            "• `budget set <category> <amount>` — set budget (e.g. `budget set food 600`)\n"
            "• `budget summary` — monthly budget summary\n"
            "• `borrow <name> <amount>` / `lend <name> <amount>` — debt tracker\n"
            "• `debt list` — all active debts\n"
            "• `loanx list` / `loanx add <name> <total> <monthly>` — loans\n"
            "• `subx <name> <amount> <day>HB` — subscription (e.g. `subx astro 89.90 15HB`)\n"
            "• `transfer <amount> <walletA> <walletB>` — move between wallets\n"
            "• `lang bm` / `lang en` — switch language\n"
            "Tell me what you'd like to do — for example: `I want to record lunch` ✅"
        )
    return (
        "Ini command yang awak boleh guna dengan saya:\n"
        "• `[Nota] [Amaun]` — rekod belanja (cth `Makan 10`)\n"
        "• `summary` — ringkasan bulan semasa\n"
        "• `list` — 5 transaksi terbaru\n"
        "• `checkwallet` / `semak wallet` — baki wallet\n"
        "• `budget set <kategori> <amaun>` — set bajet (cth `budget set makanan 600`)\n"
        "• `budget summary` / `budget ringkasan` — ringkasan bajet\n"
        "• `borrow <nama> <amaun>` / `lend <nama> <amaun>` — tracker hutang\n"
        "• `debt list` — semua hutang aktif\n"
        "• `loanx list` / `loanx add <nama> <jumlah> <bulanan>` — loan\n"
        "• `subx <nama> <amaun> <hari>HB` — subskripsi (cth `subx astro 89.90 15HB`)\n"
        "• `transfer <amaun> <walletA> <walletB>` — pindah antara wallet\n"
        "• `lang bm` / `lang en` — tukar bahasa\n"
        "Beritahu apa yang awak nak buat — contoh: `nak rekod duit makan` ✅"
    )


def _looks_like_vague_how_to(user_message: str) -> bool:
    """Detect short, vague 'how to use' questions with no object — these must
    never reach the LLM because it tends to reply like a generic AI assistant
    (out of scope). We short-circuit with the command list instead."""
    msg = (user_message or "").strip().lower()
    if not msg:
        return False
    # Normalize: strip punctuation, collapse whitespace
    norm = re.sub(r"[^a-z0-9\s]", "", msg)
    norm = re.sub(r"\s+", " ", norm).strip()
    # The exact vague phrases (no object after)
    vague_phrases = [
        "macam mana nak guna",
        "macam mne nak guna",
        "macam mane nak guna",
        "macam mana nak pakai",
        "macam mana guna",
        "cara nak guna",
        "cara guna",
        "cara nak pakai",
        "cara pakai",
        "cara2 guna",
        "cara cara guna",
        "how to use",
        "how do i use",
        "how to",
        "nak guna",
        "nak tahu cara guna",
        "guna macam mana",
        "pakai macam mana",
        "boleh ajar guna",
        "tunjuk cara guna",
    ]
    for phrase in vague_phrases:
        if norm == phrase or norm.startswith(phrase + " "):
            # If there's a non-trivial object after the phrase, let the LLM handle it.
            rest = norm[len(phrase):].strip()
            # Stopwords that don't count as a real object
            if not rest or rest in {"a", "an", "the", "ni", "tu", "ini", "itu", "lah", "je", "saja", "ya", "ye", "kah", "ke"}:
                return True
    # Also: very short messages that are essentially just "help" / "?" / "macam mana"
    if norm in {"help", "bantuan", "tolong", "macam mana", "macam mne", "cara", "cara2", "apa ni", "macam mana ni", "tak faham", "tak paham"}:
        return True
    return False



async def request_budget_reply(
    db: AsyncSession,
    *,
    user_id: str,
    preferred_language: str,
    user_message: str,
    source_channel: str,
) -> Optional[str]:
    if not user_message.strip():
        return None

    config = get_llm_config()
    if not (config.enabled and config.api_key and source_channel in config.allowed_channels):
        return None

    # Short-circuit vague / incomplete questions before touching the LLM,
    # so the bot can never reply like a generic AI assistant (out of scope).
    if _looks_like_vague_how_to(user_message):
        print(f"[ILMU] vague how-to short-circuit for user_message={_preview_text(user_message)!r}")
        return _build_command_help_reply(preferred_language)

    personality_hint, user_call_name = await _fetch_user_profile_context(db, user_id)

    history = await _fetch_recent_chat_history(
        db,
        user_id=user_id,
        limit=config.max_history_messages,
        source_channel=source_channel,
    )
    payload = {
        "messages": build_chat_messages(
            system_prompt=build_system_prompt(preferred_language, personality_hint, user_call_name),
            history=history,
            user_message=user_message,
        ),
    }
    reply_text = await _request_model_reply(
        config=config,
        model_name=config.model,
        payload=payload,
        user_message=user_message,
    )
    if reply_text:
        return _apply_user_name_addressing(_guard_generic_reply(reply_text, preferred_language), user_call_name)

    fallback_model = config.fallback_model
    if source_channel in {"chat", "whatsapp"} and fallback_model and fallback_model != config.model:
        print(
            f"[ILMU] primary model {config.model} returned no usable reply; "
            f"retrying with fallback model {fallback_model}"
        )
        fallback_reply = await _request_model_reply(
            config=config,
            model_name=fallback_model,
            payload=payload,
            user_message=user_message,
        )
        if fallback_reply:
            return _apply_user_name_addressing(_guard_generic_reply(fallback_reply, preferred_language), user_call_name)
        return None

    return None


async def _request_model_reply(
    *,
    config: LLMConfig,
    model_name: str,
    payload: dict[str, Any],
    user_message: str,
) -> Optional[str]:
    request_payload = {
        "model": model_name,
        "messages": payload["messages"],
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
    }

    started_at = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
            response = await client.post(
                f"{config.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {config.api_key}",
                    "Content-Type": "application/json",
                },
                json=request_payload,
            )
            response.raise_for_status()
            raw_text = response.text
            decoder = json.JSONDecoder()
            data, _ = decoder.raw_decode(raw_text)
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        print(f"[ILMU] reply request failed after {elapsed_ms:.0f}ms model={model_name}: {exc}")
        return None

    elapsed_ms = (time.perf_counter() - started_at) * 1000
    usage = data.get("usage") if isinstance(data, dict) else None
    reply_text = _extract_reply_text(data)
    first_choice = ((data.get("choices") or [{}])[0] if isinstance(data, dict) else {}) or {}
    finish_reason = first_choice.get("finish_reason") if isinstance(first_choice, dict) else None

    if reply_text:
        if not _reply_looks_complete(reply_text, finish_reason):
            print(
                f"[ILMU] truncated reply rejected in {elapsed_ms:.0f}ms "
                f"model={model_name} finish_reason={finish_reason} usage={usage} "
                f"preview={_preview_text(reply_text)!r}"
            )
            return None
        print(
            f"[ILMU] reply ok in {elapsed_ms:.0f}ms "
            f"model={model_name} finish_reason={finish_reason} usage={usage} "
            f"preview={_preview_text(reply_text)!r}"
        )
        return reply_text

    print(
        f"[ILMU] empty reply in {elapsed_ms:.0f}ms "
        f"model={model_name} finish_reason={finish_reason} usage={usage} "
        f"user_message={_preview_text(user_message)!r}"
    )
    return None
