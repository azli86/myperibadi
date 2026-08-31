"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import {
  Bell,
  BellOff,
  Check,
  Clock,
  Loader2,
  Pill,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageHeader,
  MobileIconButton,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type Schedule = { id: number; time: string; enabled: boolean; position: number }
type Dose = { schedule_id?: number | null; scheduled_time: string; status: string; taken_at?: string | null }
type Medication = {
  id: number
  name: string
  dosage?: string | null
  frequency: number
  timing: string
  start_date?: string | null
  end_date?: string | null
  notes?: string | null
  reminder_enabled: boolean
  created_at: string
  schedules: Schedule[]
  today_doses: Dose[]
}

export default function HealthMedicationsPage() {
  const params = useParams()
  const { lang } = useLang()
  const sessionId = (params.sessionId as string) || ""
  const { showAlert, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)
  const isBm = lang === "BM"

  const [meds, setMeds] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tickingId, setTickingId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  // add form
  const [name, setName] = useState("")
  const [dosage, setDosage] = useState("")
  const [timing, setTiming] = useState("anytime")
  const [times, setTimes] = useState<string[]>(["08:00"])
  const [reminderEnabled, setReminderEnabled] = useState(true)

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken()
    if (token && !isCookieAuthSentinel(token)) return { Authorization: `Bearer ${token}` }
    return {}
  }, [])

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])
  useEffect(() => setMounted(true), [])

  const loadMeds = useCallback(async () => {
    if (!hasLoaded) setLoading(true)
    try {
      const res = await fetch("/api/health/medications", {
        headers: authHeaders(),
        credentials: "include",
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        setMeds(Array.isArray(data) ? data : [])
      }
      setHasLoaded(true)
    } catch {
      showAlertRef.current(isBm ? "Ralat" : "Error", isBm ? "Gagal memuat ubat." : "Failed to load medications.", "error")
    } finally {
      setLoading(false)
    }
  }, [authHeaders, hasLoaded, isBm])

  useEffect(() => {
    void loadMeds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveMed = useCallback(async () => {
    if (!name.trim()) {
      showAlertRef.current(isBm ? "Ralat" : "Error", isBm ? "Nama ubat diperlukan." : "Medication name is required.", "error")
      return
    }
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        dosage: dosage.trim() || null,
        timing,
        reminder_enabled: reminderEnabled,
        schedules: times.filter((t) => t).map((t) => ({ time: t, enabled: true })),
      }
      const res = await fetch("/api/health/medications", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      setName("")
      setDosage("")
      setTimes(["08:00"])
      setShowAdd(false)
      await loadMeds()
    } catch {
      showAlertRef.current(isBm ? "Ralat" : "Error", isBm ? "Gagal simpan ubat." : "Failed to save medication.", "error")
    } finally {
      setSaving(false)
    }
  }, [name, dosage, timing, reminderEnabled, times, authHeaders, loadMeds, isBm])

  const toggleReminder = useCallback(
    async (med: Medication) => {
      try {
        const res = await fetch(`/api/health/medications/${med.id}/toggle-reminder?enabled=${!med.reminder_enabled}`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
        })
        if (res.ok) await loadMeds()
      } catch {
        showAlertRef.current(isBm ? "Ralat" : "Error", isBm ? "Gagal tukar reminder." : "Failed to toggle reminder.", "error")
      }
    },
    [authHeaders, loadMeds, isBm],
  )

  const toggleSchedule = useCallback(
    async (med: Medication, s: Schedule) => {
      try {
        const res = await fetch(`/api/health/schedules/${s.id}?enabled=${!s.enabled}`, {
          method: "PATCH",
          headers: authHeaders(),
          credentials: "include",
        })
        if (res.ok) await loadMeds()
      } catch {
        showAlertRef.current(isBm ? "Ralat" : "Error", isBm ? "Gagal tukar waktu." : "Failed to toggle time.", "error")
      }
    },
    [authHeaders, loadMeds, isBm],
  )

  const tickDose = useCallback(
    async (med: Medication, s: Schedule, status: string) => {
      setTickingId(`${med.id}-${s.id}`)
      try {
        const res = await fetch(`/api/health/medications/${med.id}/doses`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ schedule_id: s.id, status }),
        })
        if (res.ok) await loadMeds()
      } catch {
        showAlertRef.current(isBm ? "Ralat" : "Error", isBm ? "Gagal kemas kini." : "Failed to update.", "error")
      } finally {
        setTickingId(null)
      }
    },
    [authHeaders, loadMeds, isBm],
  )

  const deleteMed = useCallback(
    async (med: Medication) => {
      if (!confirm(isBm ? `Padam ${med.name}?` : `Delete ${med.name}?`)) return
      try {
        const res = await fetch(`/api/health/medications/${med.id}`, {
          method: "DELETE",
          headers: authHeaders(),
          credentials: "include",
        })
        if (res.ok) await loadMeds()
      } catch {
        showAlertRef.current(isBm ? "Ralat" : "Error", isBm ? "Gagal padam." : "Failed to delete.", "error")
      }
    },
    [authHeaders, loadMeds, isBm],
  )

  const statusOf = (med: Medication, s: Schedule): Dose | undefined =>
    med.today_doses.find((d) => d.schedule_id === s.id)

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <div className="md:hidden">
        <MobilePageHeader
          className="border-b border-[color:var(--border)] pb-4"
          title={isBm ? "Ubat" : "Medications"}
          fallbackHref={`/${sessionId}/health`}
          action={
            <MobileIconButton label={isBm ? "Tambah ubat" : "Add medication"} onClick={() => setShowAdd(true)}>
              <Plus />
            </MobileIconButton>
          }
        />
      </div>

      <div className="hidden md:block">
        <DesktopPageHeader
          title={isBm ? "Ubat & Reminder" : "Medications & Reminders"}
          homeHref={`/${sessionId}`}
          breadcrumbs={[{ label: isBm ? "Kesihatan" : "Health", href: `/${sessionId}/health` }]}
          actions={
            <DesktopPageAction onClick={() => setShowAdd(true)}>
              <Plus />
              {isBm ? "Tambah Ubat" : "Add Medication"}
            </DesktopPageAction>
          }
        />
      </div>

      {/* ── MOBILE VIEW ── */}
      <div className="md:hidden px-1 pb-24 pt-1 space-y-4">
        {showDataSkeleton ? (
          <div className="h-28 animate-pulse rounded-2xl bg-[var(--card)]" />
        ) : !meds.length ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 px-4 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]">
              <Pill size={24} />
            </div>
            <p className="mt-3 text-sm font-bold text-[var(--text)]">
              {isBm ? "Belum ada ubat" : "No medications yet"}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {isBm ? "Tambahkan ubat pertama anda dan tetapkan waktu reminder." : "Add your first medication and set reminder times."}
            </p>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] px-4 py-2.5 text-xs font-bold text-[var(--bg)] shadow-sm transition active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              {isBm ? "Tambah Ubat" : "Add Medication"}
            </button>
          </div>
        ) : (
          meds.map((med) => (
            <section key={med.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Pill size={18} className="shrink-0 text-[var(--accent2)]" />
                  <h2 className="truncate text-base font-black text-[var(--text)]">{med.name}</h2>
                  {med.dosage ? (
                    <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">{med.dosage}</span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => toggleReminder(med)}
                    className={cn(
                      "rounded-lg p-1.5 transition",
                      med.reminder_enabled
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-[var(--page-bg)] text-[var(--muted)]",
                    )}
                    aria-label={isBm ? "Toggle reminder" : "Toggle reminder"}
                  >
                    {med.reminder_enabled ? <Bell size={16} /> : <BellOff size={16} />}
                  </button>
                  <button
                    onClick={() => deleteMed(med)}
                    className="rounded-lg p-1.5 text-[var(--muted)] transition hover:text-rose-500"
                    aria-label={isBm ? "Padam" : "Delete"}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {med.schedules.map((s) => {
                  const dose = statusOf(med, s)
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--page-bg)] p-2.5"
                    >
                      <button
                        onClick={() => toggleSchedule(med, s)}
                        className={cn(
                          "relative h-5 w-9 shrink-0 rounded-full transition",
                          s.enabled ? "bg-emerald-500" : "bg-[var(--border)]",
                        )}
                        aria-label={isBm ? "Toggle waktu" : "Toggle time"}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                            s.enabled ? "left-[18px]" : "left-0.5",
                          )}
                        />
                      </button>
                      <Clock size={14} className="shrink-0 text-[var(--muted)]" />
                      <span className={cn("flex-1 text-sm font-bold text-[var(--text)]", !s.enabled && "opacity-40")}>
                        {s.time}
                      </span>
                      {s.enabled ? (
                        dose?.status === "taken" ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-500">
                            <Check size={13} strokeWidth={3} />
                            {isBm ? "Sudah Ambil" : "Taken"}
                          </span>
                        ) : (
                          <button
                            onClick={() => tickDose(med, s, "taken")}
                            disabled={tickingId === `${med.id}-${s.id}`}
                            className="flex shrink-0 items-center gap-1 rounded-lg border-2 border-emerald-500 px-2 py-1 text-[11px] font-bold text-emerald-500 transition active:scale-95 disabled:opacity-50"
                          >
                            {tickingId === `${med.id}-${s.id}` ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Check size={13} strokeWidth={3} />
                            )}
                            {isBm ? "Ambil" : "Take"}
                          </button>
                        )
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {/* ── DESKTOP VIEW ── */}
      <div className="hidden md:block">
        <DesktopPageBody>
        <div className="mx-auto w-full max-w-[900px] space-y-3 p-4">
          {showDataSkeleton ? (
            <div className="h-24 animate-pulse rounded-2xl bg-[var(--card)]" />
          ) : !meds.length ? (
            <p className="rounded-2xl bg-[var(--card)] py-10 text-center text-sm text-[var(--muted)]">
              {isBm ? "Belum ada ubat. Tambah ubat pertama anda." : "No medications yet. Add your first medication."}
            </p>
          ) : (
            meds.map((med) => (
              <section key={med.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Pill size={18} className="shrink-0 text-[var(--accent2)]" />
                    <h2 className="truncate text-base font-black text-[var(--text)]">{med.name}</h2>
                    {med.dosage ? (
                      <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">{med.dosage}</span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => toggleReminder(med)}
                      className={cn(
                        "rounded-lg p-1.5 transition",
                        med.reminder_enabled
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-[var(--page-bg)] text-[var(--muted)]",
                      )}
                      aria-label={isBm ? "Toggle reminder" : "Toggle reminder"}
                    >
                      {med.reminder_enabled ? <Bell size={16} /> : <BellOff size={16} />}
                    </button>
                    <button
                      onClick={() => deleteMed(med)}
                      className="rounded-lg p-1.5 text-[var(--muted)] transition hover:text-rose-500"
                      aria-label={isBm ? "Padam" : "Delete"}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {med.schedules.map((s) => {
                    const dose = statusOf(med, s)
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--page-bg)] p-2.5"
                      >
                        <button
                          onClick={() => toggleSchedule(med, s)}
                          className={cn(
                            "relative h-5 w-9 shrink-0 rounded-full transition",
                            s.enabled ? "bg-emerald-500" : "bg-[var(--border)]",
                          )}
                          aria-label={isBm ? "Toggle waktu" : "Toggle time"}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                              s.enabled ? "left-[18px]" : "left-0.5",
                            )}
                          />
                        </button>
                        <Clock size={14} className="shrink-0 text-[var(--muted)]" />
                        <span className={cn("flex-1 text-sm font-bold text-[var(--text)]", !s.enabled && "opacity-40")}>
                          {s.time}
                        </span>
                        {s.enabled ? (
                          dose?.status === "taken" ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-500">
                              <Check size={13} strokeWidth={3} />
                              {isBm ? "Sudah Ambil" : "Taken"}
                            </span>
                          ) : (
                            <button
                              onClick={() => tickDose(med, s, "taken")}
                              disabled={tickingId === `${med.id}-${s.id}`}
                              className="flex shrink-0 items-center gap-1 rounded-lg border-2 border-emerald-500 px-2 py-1 text-[11px] font-bold text-emerald-500 transition active:scale-95 disabled:opacity-50"
                            >
                              {tickingId === `${med.id}-${s.id}` ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Check size={13} strokeWidth={3} />
                              )}
                              {isBm ? "Ambil" : "Take"}
                            </button>
                          )
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>
        </DesktopPageBody>
      </div>

      {/* Add medication sheet */}
      {showAdd ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setShowAdd(false)}>
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--card)] p-5 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-[var(--text)]">{isBm ? "Tambah Ubat" : "Add Medication"}</h3>
              <button onClick={() => setShowAdd(false)} className="rounded-lg p-1 text-[var(--muted)]">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--muted)]">
                  {isBm ? "Nama Ubat" : "Medication Name"}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isBm ? "cth. Metformin" : "e.g. Metformin"}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent2)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--muted)]">{isBm ? "Dos" : "Dosage"}</label>
                <input
                  value={dosage}
                  onChange={(e) => setDosage(e.target.value)}
                  placeholder={isBm ? "cth. 500mg" : "e.g. 500mg"}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent2)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--muted)]">{isBm ? "Pengambilan" : "Timing"}</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { k: "before_meal", label: isBm ? "Sebelum Makan" : "Before Meal" },
                    { k: "after_meal", label: isBm ? "Selepas Makan" : "After Meal" },
                    { k: "anytime", label: isBm ? "Bila-bila" : "Anytime" },
                  ].map((t) => (
                    <button
                      key={t.k}
                      onClick={() => setTiming(t.k)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-bold transition",
                        timing === t.k
                          ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                          : "bg-[var(--page-bg)] text-[var(--muted)]",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--muted)]">
                  {isBm ? "Waktu Pengambilan" : "Reminder Times"}
                </label>
                <div className="space-y-1.5">
                  {times.map((t, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={t}
                        onChange={(e) => setTimes((prev) => prev.map((x, i) => (i === idx ? e.target.value : x)))}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent2)]"
                      />
                      {times.length > 1 ? (
                        <button
                          onClick={() => setTimes((prev) => prev.filter((_, i) => i !== idx))}
                          className="rounded-lg p-1 text-[var(--muted)]"
                        >
                          <X size={16} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    onClick={() => setTimes((prev) => [...prev, "12:00"])}
                    className="flex items-center gap-1 text-xs font-bold text-[var(--accent2)]"
                  >
                    <Plus size={14} />
                    {isBm ? "Tambah Waktu" : "Add Time"}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--page-bg)] p-3">
                <span className="text-sm font-bold text-[var(--text)]">{isBm ? "Reminder Aktif" : "Reminder Active"}</span>
                <button
                  onClick={() => setReminderEnabled((v) => !v)}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition",
                    reminderEnabled ? "bg-emerald-500" : "bg-[var(--border)]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                      reminderEnabled ? "left-[22px]" : "left-0.5",
                    )}
                  />
                </button>
              </div>
              <button
                onClick={saveMed}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-3 text-sm font-bold text-[var(--btn-primary-text)] disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {isBm ? "Simpan" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {alertModal}
    </div>
  )
}
