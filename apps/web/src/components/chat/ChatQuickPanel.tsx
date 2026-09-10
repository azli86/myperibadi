"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, Loader2, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { getAccessToken } from "@/lib/auth-session"

type Category = { id: number; name: string; kind?: string }
type Keyword = { id: number; keyword: string }

/**
 * Quick reference above the composer: pick a category, tap a keyword to drop it into the message.
 * ponytail: one source only (keywords). Add BNPL/Wallet as extra tabs when actually needed.
 */
export default function ChatQuickPanel({
  lang,
  onPick,
}: {
  lang: "BM" | "EN"
  onPick: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [keywords, setKeywords] = useState<Record<number, Keyword[]>>({})
  const [loadingCats, setLoadingCats] = useState(false)
  const [loadingKw, setLoadingKw] = useState(false)
  const catsLoadedRef = useRef(false)

  const authHeaders = () => {
    const token = getAccessToken()
    return { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }

  useEffect(() => {
    if (!open || catsLoadedRef.current) return
    catsLoadedRef.current = true
    setLoadingCats(true)
    fetch("/api/categories", { credentials: "include", headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Category[]) => {
        const list = Array.isArray(data) ? data : []
        setCategories(list)
        setActiveId(list.length ? list[0].id : null)
      })
      .catch(() => {})
      .finally(() => setLoadingCats(false))
  }, [open])

  useEffect(() => {
    if (activeId == null || keywords[activeId]) return
    setLoadingKw(true)
    fetch(`/api/categories/${activeId}/keywords`, { credentials: "include", headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Keyword[]) => {
        setKeywords((prev) => ({ ...prev, [activeId]: Array.isArray(data) ? data : [] }))
      })
      .catch(() => {
        setKeywords((prev) => ({ ...prev, [activeId]: [] }))
      })
      .finally(() => setLoadingKw(false))
  }, [activeId, keywords])

  const activeKeywords = activeId != null ? keywords[activeId] : undefined
  const label = lang === "EN" ? "Category keywords" : "Keyword kategori"

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-fit items-center gap-1.5 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-[0.75rem] font-semibold transition-colors",
          "text-[var(--muted)] hover:bg-[color:var(--surface-tint)] hover:text-[var(--text)]"
        )}
      >
        <Tag size={13} />
        {label}
        <ChevronDown size={13} className={open ? "rotate-180" : undefined} />
      </button>

      {open && (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2.5">
          {loadingCats ? (
            <div className="flex items-center gap-2 px-1 py-2 text-xs text-[var(--muted)]">
              <Loader2 size={13} className="animate-spin" />
              {lang === "EN" ? "Loading..." : "Memuatkan..."}
            </div>
          ) : categories.length === 0 ? (
            <p className="px-1 py-2 text-xs text-[var(--muted)]">
              {lang === "EN" ? "No categories found" : "Tiada kategori dijumpai"}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveId(cat.id)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      cat.kind === "income"
                        ? "text-[var(--income)]"
                        : cat.kind === "expense"
                          ? "text-[var(--expense)]"
                          : "text-[var(--muted)]",
                      cat.id === activeId
                        ? "border-transparent bg-[var(--surface-tint-strong)]"
                        : "border-[color:var(--border)] hover:bg-[color:var(--surface-tint)]"
                    )}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              <div className="max-h-36 overflow-y-auto border-t border-[color:var(--border)] pt-2">
                {loadingKw && !activeKeywords ? (
                  <div className="flex items-center gap-2 px-1 py-1.5 text-xs text-[var(--muted)]">
                    <Loader2 size={13} className="animate-spin" />
                    {lang === "EN" ? "Loading..." : "Memuatkan..."}
                  </div>
                ) : !activeKeywords || activeKeywords.length === 0 ? (
                  <p className="px-1 py-1.5 text-xs text-[var(--muted)]">
                    {lang === "EN" ? "No keyword for this category" : "Tiada keyword untuk kategori ini"}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {activeKeywords.map((kw) => (
                      <button
                        key={kw.id}
                        type="button"
                        onClick={() => onPick(kw.keyword)}
                        className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-xs text-[var(--text)] transition-colors hover:bg-[color:var(--surface-tint)] active:scale-95"
                      >
                        {kw.keyword}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
