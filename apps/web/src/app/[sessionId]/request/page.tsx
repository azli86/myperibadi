"use client"

import React, { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, Send, Lightbulb, LifeBuoy, Bug, Inbox } from "lucide-react"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"

type Ticket = {
  id: number
  kind: string
  title: string
  description?: string | null
  status: string
  priority: string
  admin_note?: string | null
  created_at?: string | null
}

const KIND_OPTIONS = [
  { key: "feature", label: "Request Feature", icon: Lightbulb, desc: "Cadangkan ciri baharu" },
  { key: "support", label: "Bantuan / Support", icon: LifeBuoy, desc: "Minta bantuan teknikal" },
  { key: "bug", label: "Laporkan Bug", icon: Bug, desc: "Laporkan masalah / pepijat" },
]

const STATUS_LABEL: Record<string, string> = {
  new: "Baru",
  in_progress: "Dalam Proses",
  resolved: "Selesai",
  closed: "Ditutup",
}

export default function RequestPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { lang } = useLang()
  const [kind, setKind] = useState("feature")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("medium")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loaded, setLoaded] = useState(false)

  const token = getAccessToken()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token && token !== "cookie") headers["Authorization"] = `Bearer ${token}`

  async function loadMine() {
    try {
      const r = await fetch("/api/support/tickets/mine", { credentials: "include", headers: { ...(token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}) } })
      if (r.ok) setTickets(await r.json())
    } catch { /* ignore */ }
    setLoaded(true)
  }

  useEffect(() => { void loadMine() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError("Sila isi tajuk / perkara."); return }
    setSubmitting(true); setError("")
    try {
      const r = await fetch("/api/support/tickets", {
        method: "POST", credentials: "include", headers,
        body: JSON.stringify({ kind, title: title.trim(), description: description.trim() || null, priority }),
      })
      if (!r.ok) { const d = await r.json().catch(() => null); setError((d && (d.detail || d.message)) || "Gagal hantar."); return }
      setDone(true); setTitle(""); setDescription(""); setPriority("medium")
      await loadMine()
    } catch { setError("Ralat rangkaian. Cuba lagi.") }
    finally { setSubmitting(false) }
  }

  return (
    <div className="min-h-screen">
      {/* Mobile */}
      <div className="md:hidden">
        <MobilePageHeader title={tr("Request", "Hantar Request")} fallbackHref={`/${sessionId}`} />
        <div className="space-y-5 px-1 pt-2">
          {done && (
            <div className="rounded-2xl border border-[var(--primary)]/30 bg-[var(--primary)]/10 p-4 text-center">
              <div className="text-[1rem] font-bold text-[var(--text)]">{tr("Terima kasih!", "Thank you!")}</div>
              <p className="mt-1 text-[0.85rem] text-[var(--text-muted)]">{tr("Request anda telah dihantar. Pasukan kami akan semak.", "Your request has been submitted. Our team will review it.")}</p>
            </div>
          )}
          {renderForm()}
          {renderMyList()}
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <DesktopPageHeader title={tr("Hantar Request & Ticket", "Submit Request & Ticket")} homeHref={`/${sessionId}`} />
        <DesktopPageBody className="space-y-5">
          {done && (
            <div className="rounded-2xl border border-[var(--primary)]/30 bg-[var(--primary)]/10 p-4 text-center">
              <div className="text-[1rem] font-bold text-[var(--text)]">{tr("Terima kasih!", "Thank you!")}</div>
              <p className="mt-1 text-[0.85rem] text-[var(--text-muted)]">{tr("Request anda telah dihantar.", "Your request has been submitted.")}</p>
            </div>
          )}
          {renderForm()}
          {renderMyList()}
        </DesktopPageBody>
      </div>
    </div>
  )

  function tr(en: string, ms: string) { return lang === "BM" ? ms : en }
  function renderForm() {
  return (
    <form onSubmit={submit} className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface)] p-5 space-y-4">
      <h2 className="text-[1.05rem] font-extrabold text-[var(--text)]">{tr("Pilih jenis request", "Choose request type")}</h2>
      <div className="grid grid-cols-1 gap-2">
        {KIND_OPTIONS.map((o) => {
          const Icon = o.icon
          const active = kind === o.key
          return (
            <button type="button" key={o.key} onClick={() => setKind(o.key)}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${active ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-[var(--outline-variant)] bg-transparent"}`}>
              <Icon size={18} className={active ? "text-[var(--primary)]" : "text-[var(--text-muted)]"} />
              <div>
                <div className="text-[0.9rem] font-bold text-[var(--text)]">{tr(o.label, o.label)}</div>
                <div className="text-[0.78rem] text-[var(--text-muted)]">{tr(o.desc, o.desc)}</div>
              </div>
            </button>
          )
        })}
      </div>

      <div>
        <label className="mb-1 block text-[0.82rem] font-semibold text-[var(--text)]">{tr("Tajuk / Perkara", "Title / Subject")} *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("Contoh: Tambah ciri eksport PDF", "Example: Add PDF export feature")}
          className="w-full rounded-xl border border-[var(--outline)] bg-[var(--surface-tint)] px-4 py-3 text-[0.9rem] text-[var(--text)] outline-none focus:border-[var(--primary)]" />
      </div>

      <div>
        <label className="mb-1 block text-[0.82rem] font-semibold text-[var(--text)]">{tr("Penerangan", "Description")}</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder={tr("Terangkan permintaan atau masalah anda secara terperinci…", "Describe your request or issue in detail…")}
          className="w-full resize-none rounded-xl border border-[var(--outline)] bg-[var(--surface-tint)] px-4 py-3 text-[0.9rem] text-[var(--text)] outline-none focus:border-[var(--primary)]" />
      </div>

      {error && <p className="text-[0.85rem] text-[var(--error)]">{error}</p>}

      <button type="submit" disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] py-3.5 text-[0.95rem] font-bold text-[var(--on-primary)] disabled:opacity-50">
        <Send size={16} /> {submitting ? tr("Menghantar…", "Submitting…") : tr("Hantar", "Submit")}
      </button>
    </form>
  )
  }
  function renderMyList() {
  return (
    <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface)] p-5">
      <h2 className="mb-3 flex items-center gap-2 text-[1.05rem] font-extrabold text-[var(--text)]"><Inbox size={18} /> {tr("Request Saya", "My Requests")}</h2>
      {!loaded ? <p className="text-[0.85rem] text-[var(--text-muted)]">{tr("Memuatkan…", "Loading…")}</p>
        : tickets.length === 0 ? <p className="text-[0.85rem] text-[var(--text-muted)]">{tr("Tiada request lagi.", "No requests yet.")}</p>
        : <ul className="divide-y divide-[var(--outline-variant)]">
          {tickets.map((tk) => (
            <li key={tk.id} className="py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-0.5 text-[0.72rem] font-bold text-[var(--primary)]">{tr(tk.kind, tk.kind)}</span>
                <span className="rounded-full bg-[var(--surface-tint)] px-2.5 py-0.5 text-[0.72rem] font-bold text-[var(--text-muted)]">{STATUS_LABEL[tk.status] || tk.status}</span>
              </div>
              <div className="mt-1.5 text-[0.9rem] font-bold text-[var(--text)]">{tk.title}</div>
              {tk.description && <p className="mt-0.5 text-[0.8rem] text-[var(--text-muted)] line-clamp-2">{tk.description}</p>}
              {tk.admin_note && <p className="mt-1 text-[0.8rem] text-[var(--primary)]">{tr("Nota admin: ", "Admin note: ")}{tk.admin_note}</p>}
            </li>
          ))}
        </ul>}
    </div>
  )
  }
}
