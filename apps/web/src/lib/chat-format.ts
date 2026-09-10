import { createElement, useMemo, type ReactNode } from "react"

/**
 * WhatsApp / Telegram style inline markup:
 *   *bold*  **bold**  _italic_  __underline__  ~strike~  `code`  ```block```  bare links
 * Plain-text tokens are rendered as text nodes, so nothing is injected as HTML.
 */
export type ChatToken =
  | { kind: "text"; value: string }
  | { kind: "bold" | "italic" | "strike" | "underline" | "code"; value: string; block?: boolean }
  | { kind: "link"; value: string }

// ponytail: no nesting (WhatsApp does not render it either)
const INLINE =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|__[^_\n]+__|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s<>()]+)/g

function inlineTokens(line: string): ChatToken[] {
  const out: ChatToken[] = []
  let last = 0
  for (const match of line.matchAll(INLINE)) {
    const at = match.index ?? 0
    if (at > last) out.push({ kind: "text", value: line.slice(last, at) })
    const token = match[0]
    if (token.startsWith("**")) out.push({ kind: "bold", value: token.slice(2, -2) })
    else if (token.startsWith("__")) out.push({ kind: "underline", value: token.slice(2, -2) })
    else if (token.startsWith("*")) out.push({ kind: "bold", value: token.slice(1, -1) })
    else if (token.startsWith("_")) out.push({ kind: "italic", value: token.slice(1, -1) })
    else if (token.startsWith("~")) out.push({ kind: "strike", value: token.slice(1, -1) })
    else if (token.startsWith("`")) out.push({ kind: "code", value: token.slice(1, -1) })
    else out.push({ kind: "link", value: token })
    last = at + token.length
  }
  if (last < line.length) out.push({ kind: "text", value: line.slice(last) })
  return out
}

export function parseChatText(text: string): ChatToken[] {
  const out: ChatToken[] = []
  text.split("```").forEach((part, index) => {
    if (index % 2 === 1) {
      out.push({ kind: "code", value: part.replace(/^\n+|\n+$/g, ""), block: true })
      return
    }
    part.split("\n").forEach((line, lineIndex) => {
      if (lineIndex > 0) out.push({ kind: "text", value: "\n" })
      out.push(...inlineTokens(line))
    })
  })
  return out
}

function renderToken(token: ChatToken, key: number): ReactNode {
  switch (token.kind) {
    case "text":
      return token.value
    case "bold":
      return createElement("strong", { key, className: "font-bold" }, token.value)
    case "italic":
      return createElement("em", { key, className: "italic" }, token.value)
    case "strike":
      return createElement("s", { key, className: "line-through opacity-80" }, token.value)
    case "underline":
      return createElement("u", { key, className: "underline" }, token.value)
    case "code":
      return createElement(
        "code",
        {
          key,
          className: token.block
            ? "my-1 block overflow-x-auto rounded-lg bg-[var(--surface-tint)] px-2.5 py-2 font-mono text-[0.85em]"
            : "rounded bg-[var(--surface-tint)] px-1 py-0.5 font-mono text-[0.9em]",
        },
        token.value,
      )
    case "link":
      return createElement(
        "a",
        {
          key,
          href: token.value,
          target: "_blank",
          rel: "noopener noreferrer",
          className: "underline break-all text-[var(--brand-blue)]",
        },
        token.value,
      )
  }
}

export function ChatFormattedText({ text, className }: { text: string; className?: string }) {
  const tokens = useMemo(() => parseChatText(text), [text])
  return createElement(
    "p",
    { className },
    tokens.map((token, index) => renderToken(token, index)),
  )
}
