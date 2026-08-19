"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, ChevronRight, Globe, Info, Languages, ShieldCheck, Sparkles } from "lucide-react"
import { useLang } from "@/lib/lang"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import { DesktopPageBody, DesktopPageHeader } from "@/components/layout/PageHeader"

type HealthState = "loading" | "ok" | "error"

export default function AboutPage() {
  const params = useParams()
  const sessionId = params.sessionId as string || ""
  const { lang, timezone, timeFormat, t } = useLang()
  const [health, setHealth] = useState<HealthState>("loading")

  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => isBm ? bm : en

  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const res = await fetch("/api/health")
        if (!active) return
        setHealth(res.ok ? "ok" : "error")
      } catch {
        if (!active) return
        setHealth("error")
      }
    }
    run()
    return () => { active = false }
  }, [])

  const statusLabel = health === "loading"
    ? tr("Menyemak", "Checking")
    : health === "ok"
      ? "Online"
      : tr("Tidak dapat dicapai", "Unreachable")

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">

      {/* ─── Mobile View ─── */}
      <div className="space-y-5 md:hidden">
        {/* Header */}
        <div className="px-1 pt-1">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 pt-4">
            <HistoryBackButton fallbackHref={`/${sessionId}/settings`} className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--text)]">
              <ArrowLeft size={18} />
            </HistoryBackButton>
            <h1 className="text-center text-[1.2rem] font-extrabold tracking-tight text-[var(--text)]">
              {tr("Tentang Apps", "About App")}
            </h1>
            <div className="h-10 w-10" aria-hidden="true" />
          </div>

          {/* Hero Card */}
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[0.625rem] font-black uppercase tracking-[0.26em] text-[var(--muted)]">DP</p>
              <p className="mt-2 text-lg font-black text-[var(--text)]">{tr("Tentang Apps", "About App")}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                {tr("Pantau kewangan harian melalui web dan WhatsApp bot.", "Track daily finances through web and WhatsApp bot.")}
              </p>
            </div>
          </div>
        </div>

        {/* Status Cards */}
        <section className="px-1">
          <p className="px-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{tr("Status", "Status")}</p>
          <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <StatusRow
              icon={<Globe size={18} />}
              label={tr("Status API", "API Status")}
              value={statusLabel}
              dot={health}
              borderTop
            />
            <StatusRow icon={<Languages size={18} />} label={tr("Bahasa Aktif", "Active Language")} value={lang} borderTop />
          </div>
        </section>

        {/* Company Identity */}
        <section className="px-1">
          <p className="px-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{tr("Identiti Syarikat", "Company Identity")}</p>
          <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <InfoRow label={tr("Nama Syarikat", "Company Name")} value="DIGITALPORT INTEGRATED" />
            <InfoRow label={tr("No. Pendaftaran SSM", "SSM Registration No.")} value="TR0329492-V" borderTop />
          </div>
        </section>

        {/* Preferences */}
        <section className="px-1">
          <p className="px-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{t.preferences}</p>
          <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <PreferenceRow label={tr("Zon Masa", "Timezone")} value={timezone} />
            <PreferenceRow label={tr("Format Masa", "Time Format")} value={timeFormat} borderTop />
          </div>
        </section>

        {/* Privacy */}
        <div className="px-1">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--muted)]">
                <ShieldCheck size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-[var(--text)]">{tr("Privasi Dilindungi", "Privacy Protected")}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                  {tr(
                    "MyPeribadi direka untuk rekod kewangan harian melalui web dan WhatsApp bot. Privasi akaun anda dilindungi menggunakan pengesahan token.",
                    "MyPeribadi is designed for daily finance tracking via web and WhatsApp bot. Your account privacy is protected through token-based authentication."
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Changelog */}
        <div className="px-1">
          <Link
            href={`/${sessionId}/whatsnew`}
            className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 active:scale-[0.98] transition-all"
          >
            <div className="shrink-0 text-[var(--text)]">
              <Info size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text)]">{t.changelog}</p>
              <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">{tr("Lihat rekod update dan perubahan terbaru.", "View recent updates and release changes.")}</p>
            </div>
            <ChevronRight size={16} className="text-[var(--muted)]" />
          </Link>
        </div>
      </div>

      {/* ─── Desktop View ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader title={tr("Tentang Apps", "About App")} homeHref={`/${sessionId}`} />
        <DesktopPageBody className="space-y-6">
        {/* Hero Card */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
          <div className="relative grid gap-5 p-6 md:grid-cols-[1.3fr_0.7fr] md:gap-6 md:p-8">
            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]">
                  <Sparkles size={20} />
                </div>
                <div className="min-w-0 flex-1">
              <p className="text-[0.625rem] font-black uppercase tracking-[0.26em] text-[var(--muted)]">MyPeribadi</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
                    {tr("Pantau kewangan harian melalui web dan WhatsApp bot dengan paparan yang ringkas, selamat, dan mesra mobile.", "Track daily finances through web and WhatsApp bot with a clean, secure, mobile-friendly experience.")}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <DesktopStatBox
                  icon={<Globe size={18} />}
                  label={tr("Status API", "API Status")}
                  value={statusLabel}
                  accent={health === "ok" ? "text-[var(--text)]" : health === "loading" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}
                  accentBg={health === "ok" ? "bg-[var(--surface-tint)]" : health === "loading" ? "bg-amber-500/10" : "bg-red-500/10"}
                  dot={health}
                />
                <DesktopStatBox icon={<Languages size={18} />} label={tr("Bahasa Aktif", "Active Language")} value={lang} accent="text-[var(--text)]" accentBg="bg-[var(--surface-tint)]" />
              </div>
            </div>

            {/* Company Identity Sidebar */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-5">
              <p className="text-[0.625rem] font-black uppercase tracking-[0.24em] text-[var(--muted)]">{tr("Identiti Syarikat", "Company Identity")}</p>
              <div className="mt-4 divide-y divide-[var(--border)]">
                <div className="py-3">
                  <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{tr("Nama Syarikat", "Company Name")}</p>
                  <p className="mt-1.5 text-sm font-bold text-[var(--text)]">DIGITALPORT INTEGRATED</p>
                </div>
                <div className="py-3">
                  <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{tr("No. Pendaftaran SSM", "SSM Registration No.")}</p>
                  <p className="mt-1.5 text-sm font-bold text-[var(--text)]">TR0329492-V</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Grid */}
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          {/* Left Column */}
          <div className="space-y-5">
            {/* Preferences */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]">
                  <Globe size={20} />
                </div>
                <div>
                  <p className="text-[0.625rem] font-black uppercase tracking-[0.24em] text-[var(--muted)]">{t.preferences}</p>
                  <p className="text-sm font-semibold text-[var(--muted)]">{tr("Tetapan tempatan semasa anda", "Your current local preferences")}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-4">
                  <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{tr("Zon Masa", "Timezone")}</p>
                  <p className="mt-2 text-base font-black text-[var(--text)]">{timezone}</p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-4">
                  <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{tr("Format Masa", "Time Format")}</p>
                  <p className="mt-2 text-base font-black text-[var(--text)]">{timeFormat}</p>
                </div>
              </div>
            </div>

            {/* Privacy */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--muted)]">
                  <ShieldCheck size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-[var(--text)]">{tr("Privasi Dilindungi", "Privacy Protected")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                    {tr(
                      "MyPeribadi direka untuk rekod kewangan harian melalui web dan WhatsApp bot. Privasi akaun anda dilindungi menggunakan pengesahan token.",
                      "MyPeribadi is designed for daily finance tracking via web and WhatsApp bot. Your account privacy is protected through token-based authentication."
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            {/* Changelog */}
            <Link
              href={`/${sessionId}/whatsnew`}
              className="block rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm transition-colors hover:border-[var(--text)]"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]">
                    <Info size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--text)]">{t.changelog}</p>
                    <p className="mt-1 text-xs font-medium text-[var(--muted)]">{tr("Lihat rekod update dan perubahan terbaru.", "View recent updates and release changes.")}</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-[var(--muted)] shrink-0" />
              </div>
            </Link>
          </div>
        </div>
        </DesktopPageBody>
      </div>
    </div>
  )
}

// ── Reusable components ─────────────────────────────────────────────

function StatusRow({ icon, label, value, dot, borderTop }: { icon: React.ReactNode; label: string; value: string; dot?: HealthState; borderTop?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5${borderTop ? " border-t border-[var(--border)]" : ""}`}>
      <div className="shrink-0 text-[var(--text)]">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text)]">{label}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--muted)]">{value}</span>
        {dot && <span className={`inline-block h-2 w-2 rounded-full ${dot === "ok" ? "bg-[var(--text)]" : dot === "loading" ? "bg-[var(--muted)] animate-pulse" : "bg-[var(--muted)]"}`} />}
      </div>
    </div>
  )
}

function InfoRow({ label, value, borderTop }: { label: string; value: string; borderTop?: boolean }) {
  return (
    <div className={`px-4 py-3.5${borderTop ? " border-t border-[var(--border)]" : ""}`}>
      <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-sm font-bold text-[var(--text)]">{value}</p>
    </div>
  )
}

function PreferenceRow({ label, value, borderTop }: { label: string; value: string; borderTop?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3.5${borderTop ? " border-t border-[var(--border)]" : ""}`}>
      <span className="text-sm font-medium text-[var(--text)]">{label}</span>
      <span className="min-w-0 truncate text-right text-xs font-medium text-[var(--muted)]">{value}</span>
    </div>
  )
}

function DesktopStatBox({ icon, label, value, accent, accentBg, dot }: { icon: React.ReactNode; label: string; value: string; accent: string; accentBg: string; dot?: HealthState }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-4">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${accentBg} ${accent}`}>{icon}</div>
        <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <p className="text-lg font-black text-[var(--text)]">{value}</p>
        {dot && <span className={`inline-block h-2 w-2 rounded-full ${dot === "ok" ? "bg-[var(--text)]" : dot === "loading" ? "bg-[var(--muted)] animate-pulse" : "bg-[var(--muted)]"}`} />}
      </div>
    </div>
  )
}
