"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Bot, Check, Copy, ExternalLink, KeyRound, Loader2, Plus, Trash2 } from "lucide-react"
import { MobilePageHeader, DesktopPageBody, DesktopPageHeader } from "@/components/layout/PageHeader"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"

type Token = { id: number; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at?: string; revoked_at?: string }

export default function HermesMcpPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>()
  const { lang } = useLang()
  const tr = (bm: string, en: string) => lang === "BM" ? bm : en

  const [tokens, setTokens] = useState<Token[]>([])
  const [plainToken, setPlainToken] = useState("")
  const [revokeId, setRevokeId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const headers = useCallback(() => ({ Authorization: `Bearer ${getAccessToken()}`, "Content-Type": "application/json" }), [])
  const load = useCallback(async () => {
    const r = await fetch("/api/mcp-tokens", { headers: headers(), credentials: "include" })
    if (r.ok) setTokens(await r.json())
    setLoading(false)
  }, [headers])
  useEffect(() => { void load() }, [load])

  const create = async () => {
    setCreating(true)
    try {
      const r = await fetch("/api/mcp-tokens", { method: "POST", headers: headers(), credentials: "include", body: JSON.stringify({ name: "Hermes" }) })
      if (r.ok) { const d = await r.json(); setPlainToken(d.token); void load() }
    } finally { setCreating(false) }
  }

  const revoke = async () => {
    if (revokeId === null) return
    await fetch(`/api/mcp-tokens/${revokeId}`, { method: "DELETE", headers: headers(), credentials: "include" })
    setRevokeId(null); void load()
  }

  const copy = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1800) }

  const mcpUrl = typeof window === "undefined" ? "/mcp" : `${window.location.origin}/mcp`
  const hermesGuide = `Connect this remote MCP server to Hermes Agent.\n\nServer name: MyPeribadi\nTransport: Streamable HTTP\nMCP URL: ${mcpUrl}\nAuthentication: HTTP Bearer token\nAuthorization header: Bearer <PASTE_MY_TOKEN_HERE>\n\nDo not open the MCP URL as a normal web page. Configure it as a remote MCP server and send MCP JSON-RPC requests with the Authorization header. Never print, log, or share the token.\n\nPermissions:\n- Read financial summaries, wallets, transactions, categories, budgets, subscriptions, loans, and debts.\n- Create transactions.\n- Preview and edit transactions only after user confirmation.\n- No delete, bulk update, raw SQL, generic API, or account-setting access.\n\nIf the server returns HTML, stop and report that the MCP endpoint is not active. If authentication returns 401, ask the user to generate a new token. Never request a user ID or session ID.`

  const CopyBtn = ({ text, label, className }: { text: string; label: string; className?: string }) => (
    <button
      type="button"
      onClick={() => copy(text, label)}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl bg-[var(--text)] text-[var(--bg)] transition active:scale-95",
        className ?? "h-10 w-10",
      )}
    >
      {copied === label ? <Check size={16} strokeWidth={2.5} /> : <Copy size={15} />}
    </button>
  )

  const body = (
    <div className="space-y-4">
      {/* Hero / setup */}
      <section className="overflow-hidden rounded-[var(--card-radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-start gap-3 p-4 md:p-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]">
            <Bot size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-black text-[var(--text)] md:text-lg">Hermes MCP</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-[var(--muted)]">
              {tr("Akses baca. Tulis hanya tambah dan edit transaksi.", "Read access. Writes limited to creating and editing transactions.")}
            </p>
          </div>
        </div>

        <div className="border-t border-[var(--border)] p-4 md:p-5">
          <p className="text-[0.625rem] font-black uppercase tracking-[0.14em] text-[var(--muted)]">MCP URL</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5 text-sm text-[var(--text)]">{mcpUrl}</code>
            <CopyBtn text={mcpUrl} label="copy-mcp" />
          </div>

          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--text)] px-4 py-3 text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-60 md:w-auto"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.5} />}
            {creating ? tr("Menjana...", "Generating...") : tr("Jana token Hermes", "Generate Hermes token")}
          </button>
        </div>
      </section>

      {/* One-time token */}
      {plainToken && (
        <section className="rounded-[var(--card-radius-lg)] border border-amber-500/30 bg-amber-500/10 p-4 md:p-5">
          <p className="text-sm font-black text-[var(--text)]">{tr("Salin sekarang — token dipaparkan sekali sahaja", "Copy now — token is shown once")}</p>
          <code className="mt-3 block break-all rounded-xl border border-amber-500/20 bg-[var(--card)] p-3 text-sm text-[var(--text)]">{plainToken}</code>
          <div className="mt-3 flex items-center gap-2">
            <CopyBtn text={plainToken} label="copy-token" className="h-10 px-4" />
            <span className="text-xs font-semibold text-[var(--muted)]">
              {copied === "copy-token" ? tr("Tersalin ✓", "Copied ✓") : tr("Jangan kongsi token ini", "Never share this token")}
            </span>
          </div>
        </section>
      )}

      {/* Hermes instructions */}
      <section className="rounded-[var(--card-radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-[var(--text)]">{tr("Arahan untuk Hermes", "Instructions for Hermes")}</h2>
            <p className="mt-0.5 text-sm text-[var(--muted)]">{tr("Salin kepada Hermes dan ganti ruang token.", "Copy to Hermes and replace the token placeholder.")}</p>
          </div>
          <CopyBtn text={hermesGuide} label="copy-guide" className="hidden h-10 w-auto px-4 sm:inline-flex" />
        </div>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3 text-xs leading-5 text-[var(--text)]">{hermesGuide}</pre>
        <CopyBtn text={hermesGuide} label="copy-guide" className="mt-3 h-10 w-auto px-4 sm:hidden" />
      </section>

      {/* Tokens list */}
      <section className="space-y-2">
        <h2 className="px-1 text-[0.625rem] font-black uppercase tracking-[0.16em] text-[var(--muted)]">
          {tr("Token sambungan", "Connection tokens")}
        </h2>

        {loading ? (
          <div className="flex h-24 items-center justify-center text-[var(--muted)]">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[var(--card-radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 px-6 py-10 text-center">
            <KeyRound size={24} className="text-[var(--muted)]" />
            <p className="mt-3 text-sm font-black text-[var(--text)]">{tr("Tiada token lagi", "No tokens yet")}</p>
            <p className="mt-1 max-w-xs text-xs font-medium text-[var(--muted)]">
              {tr("Jana token pertama untuk sambung Hermes.", "Generate your first token to connect Hermes.")}
            </p>
            <button type="button" onClick={create} disabled={creating} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--text)] px-4 py-2 text-[0.625rem] font-black uppercase tracking-[0.12em] text-[var(--bg)] transition active:scale-95">
              <Plus size={13} strokeWidth={3} />
              {tr("Jana token", "Generate token")}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map(t => {
              const revoked = Boolean(t.revoked_at)
              return (
                <div key={t.id} className={cn(
                  "flex items-center gap-3 rounded-[var(--card-radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3.5",
                  revoked && "opacity-60",
                )}>
                  <div className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                    revoked ? "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
                  )}>
                    <KeyRound size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-black text-[var(--text)]">{t.name}</p>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[0.5rem] font-black uppercase tracking-[0.1em]",
                        revoked ? "bg-[var(--surface-tint)] text-[var(--muted)]" : "bg-emerald-500/10 text-emerald-500",
                      )}>
                        {revoked ? tr("Dibatalkan", "Revoked") : tr("Aktif", "Active")}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs font-semibold text-[var(--muted)]">
                      {t.prefix}… · {t.scopes?.join(", ") || "read/write"}
                    </p>
                  </div>
                  {!revoked && (
                    <button
                      type="button"
                      onClick={() => setRevokeId(t.id)}
                      aria-label={tr("Padam token", "Delete token")}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-tint)] text-[var(--muted)] transition hover:text-rose-500 active:scale-95"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <p className="flex items-center gap-1.5 px-1 text-[0.625rem] font-semibold text-[var(--muted)]">
        <ExternalLink size={11} />
        {tr("Konfigurasi sebagai remote MCP server, bukan buka pautan dalam pelayar.", "Configure as a remote MCP server — do not open the link in a browser.")}
      </p>
    </div>
  )

  /* Revoke confirm dialog */
  const confirmDialog = revokeId !== null && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-5" onClick={() => setRevokeId(null)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="revoke-title" className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--text)]" onClick={e => e.stopPropagation()}>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-500/10 text-rose-500"><Trash2 size={18} /></div>
        <h2 id="revoke-title" className="mt-3 text-lg font-black">{tr("Padam token?", "Delete token?")}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
          {tr("Token dipadam kekal. Hermes akan kehilangan akses serta-merta.", "The token will be permanently deleted. Hermes will lose access immediately.")}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={() => setRevokeId(null)} className="rounded-xl bg-[var(--surface-tint)] px-4 py-3 text-sm font-bold">{tr("Tidak", "No")}</button>
          <button onClick={revoke} className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white">{tr("Ya, padam", "Yes, delete")}</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="pb-20 md:pb-0">
      <div className="md:hidden">
        <MobilePageHeader title="Hermes MCP" fallbackHref={`/${sessionId}/connector`} />
        <div className="mt-4 px-1">{body}</div>
      </div>
      <div className="hidden md:block">
        <DesktopPageHeader title="Hermes MCP" breadcrumbs={[{ label: "Connector", href: `/${sessionId}/connector` }]} homeHref={`/${sessionId}`} />
        <DesktopPageBody>{body}</DesktopPageBody>
      </div>
      {confirmDialog}
    </div>
  )
}
