"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Bot, Copy, KeyRound, Plus, Trash2 } from "lucide-react"
import { MobilePageHeader, DesktopPageBody, DesktopPageHeader } from "@/components/layout/PageHeader"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"

type Token = { id: number; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at?: string; revoked_at?: string }

export default function HermesMcpPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>()
  const { lang } = useLang()
  const tr = (bm: string, en: string) => lang === "BM" ? bm : en
  const [tokens, setTokens] = useState<Token[]>([])
  const [plainToken, setPlainToken] = useState("")
  const [revokeId, setRevokeId] = useState<number | null>(null)
  const headers = useCallback(() => ({ Authorization: `Bearer ${getAccessToken()}`, "Content-Type": "application/json" }), [])
  const load = useCallback(async () => { const r = await fetch("/api/mcp-tokens", { headers: headers(), credentials: "include" }); if (r.ok) setTokens(await r.json()) }, [headers])
  useEffect(() => { void load() }, [load])
  const create = async () => { const r = await fetch("/api/mcp-tokens", { method: "POST", headers: headers(), credentials: "include", body: JSON.stringify({ name: "Hermes" }) }); if (r.ok) { const d = await r.json(); setPlainToken(d.token); void load() } }
  const revoke = async () => { if (revokeId === null) return; await fetch(`/api/mcp-tokens/${revokeId}`, { method: "DELETE", headers: headers(), credentials: "include" }); setRevokeId(null); void load() }
  const mcpUrl = typeof window === "undefined" ? "/mcp" : `${window.location.origin}/mcp`
  const hermesGuide = `Connect this remote MCP server to Hermes Agent.\n\nServer name: MyPeribadi\nTransport: Streamable HTTP\nMCP URL: ${mcpUrl}\nAuthentication: HTTP Bearer token\nAuthorization header: Bearer <PASTE_MY_TOKEN_HERE>\n\nDo not open the MCP URL as a normal web page. Configure it as a remote MCP server and send MCP JSON-RPC requests with the Authorization header. Never print, log, or share the token.\n\nPermissions:\n- Read financial summaries, wallets, transactions, categories, budgets, subscriptions, loans, and debts.\n- Create transactions.\n- Preview and edit transactions only after user confirmation.\n- No delete, bulk update, raw SQL, generic API, or account-setting access.\n\nIf the server returns HTML, stop and report that the MCP endpoint is not active. If authentication returns 401, ask the user to generate a new token. Never request a user ID or session ID.`

  const body = <div className="space-y-5">
    <section className="rounded-2xl bg-[var(--card)] p-5 text-[var(--text)]">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-black">Hermes MCP</h2><p className="mt-1 text-sm text-[var(--muted)]">{tr("Akses baca. Tulis hanya tambah dan edit transaksi.", "Read access. Writes limited to creating and editing transactions.")}</p></div><Bot /></div>
      <div className="mt-4 flex items-center gap-3 rounded-xl bg-[var(--surface-tint)] p-3"><div className="min-w-0 flex-1"><p className="text-xs font-bold text-[var(--muted)]">MCP URL</p><code className="mt-1 block break-all text-sm">{mcpUrl}</code></div><button onClick={() => navigator.clipboard.writeText(mcpUrl)} aria-label={tr("Salin pautan MCP", "Copy MCP link")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--card)]"><Copy size={17}/></button></div>
      <button onClick={create} className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--text)] px-4 py-3 text-sm font-bold text-[var(--bg)]"><Plus size={17}/>{tr("Jana token Hermes", "Generate Hermes token")}</button>
    </section>
    {plainToken && <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5"><p className="font-black">{tr("Salin sekarang — token dipaparkan sekali sahaja", "Copy now — token is shown once")}</p><code className="mt-3 block break-all rounded-xl bg-[var(--card)] p-3 text-sm">{plainToken}</code><button onClick={() => navigator.clipboard.writeText(plainToken)} className="mt-3 flex items-center gap-2 text-sm font-bold"><Copy size={16}/>{tr("Salin token", "Copy token")}</button></section>}
    <section className="rounded-2xl bg-[var(--card)] p-5 text-[var(--text)]"><h2 className="font-black">{tr("Arahan untuk Hermes", "Instructions for Hermes")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{tr("Salin arahan universal ini kepada Hermes. Gantikan ruang token dengan token anda.", "Copy these universal instructions to Hermes. Replace the token placeholder with your token.")}</p><pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-tint)] p-3 text-xs leading-5">{hermesGuide}</pre><button onClick={() => navigator.clipboard.writeText(hermesGuide)} className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--text)] px-4 py-3 text-sm font-bold text-[var(--bg)]"><Copy size={16}/>{tr("Salin arahan", "Copy instructions")}</button></section>
    <section className="space-y-3"><h2 className="text-sm font-black">{tr("Token sambungan", "Connection tokens")}</h2>{tokens.map(t => <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-[var(--card)] p-4"><KeyRound className="shrink-0"/><div className="min-w-0 flex-1"><p className="font-bold">{t.name}</p><p className="truncate text-xs text-[var(--muted)]">{t.prefix}… · {t.revoked_at ? tr("Dibatalkan", "Revoked") : tr("Aktif", "Active")}</p></div>{!t.revoked_at && <button onClick={() => setRevokeId(t.id)} aria-label="Revoke"><Trash2 size={18}/></button>}</div>)}</section>
    {revokeId !== null && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-5" onClick={() => setRevokeId(null)}><div role="alertdialog" aria-modal="true" aria-labelledby="revoke-title" className="w-full max-w-sm rounded-3xl bg-[var(--card)] p-6 text-[var(--text)]" onClick={e => e.stopPropagation()}><h2 id="revoke-title" className="text-xl font-black">{tr("Padam token?", "Delete token?")}</h2><p className="mt-2 text-sm text-[var(--muted)]">{tr("Token dipadam kekal. Hermes akan kehilangan akses serta-merta.", "The token will be permanently deleted. Hermes will lose access immediately.")}</p><div className="mt-6 grid grid-cols-2 gap-3"><button onClick={() => setRevokeId(null)} className="rounded-xl bg-[var(--surface-tint)] px-4 py-3 font-bold">{tr("Tidak", "No")}</button><button onClick={revoke} className="rounded-xl bg-rose-600 px-4 py-3 font-bold text-white">{tr("Ya", "Yes")}</button></div></div></div>}
  </div>

  return <div className="pb-20 md:pb-0"><div className="md:hidden"><MobilePageHeader title="Hermes MCP" fallbackHref={`/${sessionId}/connector`}/><div className="mt-4">{body}</div></div><div className="hidden md:block"><DesktopPageHeader title="Hermes MCP" breadcrumbs={[{ label: "Connector", href: `/${sessionId}/connector` }]} homeHref={`/${sessionId}`}/><DesktopPageBody>{body}</DesktopPageBody></div></div>
}
