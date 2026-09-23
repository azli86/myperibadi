"""The assistant must refuse anything outside personal finance.

The bot wrote HTML, essays and recipes on request because the scope rule only said
"politely decline" and left "harmless casual questions" as an exception the model
read broadly. It answered "generate code" with a full HTML page.

These checks pin the rule text, so a later prompt edit cannot quietly drop it.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from llm_service import build_system_prompt


def check_every_language_refuses_off_topic_requests():
    for language in ("BM", "EN"):
        prompt = build_system_prompt(language)
        assert "ALWAYS DECLINE" in prompt, f"{language}: no decline instruction"
        assert "No code blocks" in prompt, f"{language}: code is not forbidden"
        assert "HTML" in prompt, f"{language}: HTML is not named"
        assert "Do NOT answer the off-topic request even partially" in prompt, (
            f"{language}: partial off-topic answers are still allowed"
        )


def check_the_prompt_still_allows_greetings_and_commands():
    prompt = build_system_prompt("BM")
    assert "A greeting, thanks, or short small talk is fine" in prompt, (
        "small talk is now refused too, which makes the bot cold"
    )
    assert "`makan 10`" in prompt or "Makan 10" in prompt, "command examples are gone"
    assert "summary" in prompt, "command reference is gone"


def main():
    check_every_language_refuses_off_topic_requests()
    check_the_prompt_still_allows_greetings_and_commands()
    print("assistant scope OK")


if __name__ == "__main__":
    main()
