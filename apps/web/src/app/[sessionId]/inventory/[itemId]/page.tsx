"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowRightLeft, Boxes, Check, ChevronRight, History, Loader2, MapPin, Minus, Package, Pencil, Plus, Receipt, ShieldCheck, Trash2 } from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { DOT, ItemSheet, LocationOptions, STATUSES, area, field, label, type InvContainer, type InvItem, type InvLocation, type InvStatus, type Tree } from "@/components/inventory/shared"

type Movement = {
  id: number
  movement_type: string
  quantity_before?: number | null
  quantity_after?: number | null
  status_before?: string | null
  status_after?: string | null
  from_place?: string | null
  to_place?: string | null
  notes?: string | null
  moved_at?: string | null
}

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtDateTime(value: string | null | undefined, locale: string) {
  if (!value) return "—"
  const d = new Date(value.endsWith("Z") || value.includes("+") ? value : `${value}Z`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString(locale, { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
}

export default function InventoryItemDetailPage() {
  const params = useParams()
  const router = useRouter()
  const itemId = params.itemId as string
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const locale = isBm ? "ms-MY" : "en-MY"
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const [item, setItem] = useState<InvItem | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [locations, setLocations] = useState<InvLocation[]>([])
  const [containers, setContainers] = useState<InvContainer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [sheet, setSheet] = useState<"edit" | "move" | null>(null)
  const [busy, setBusy] = useState(false)
  const [setQty, setSetQty] = useState("")
  const showSkeleton = useDelayedSkeleton(loading && !item)

  const headers = useCallback((json = false): Record<string, string> => {
    const token = getAccessToken()
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}) }
  }, [])
  const errorOf = useCallback(async (res: Response, fallback: string) => {
    const payload = (await res.json().catch(() => null)) as { detail?: unknown } | null
    return typeof payload?.detail === "string" ? payload.detail : fallback
  }, [])

  const load = useCallback(async () => {
    try {
      const opts = { headers: headers(), credentials: "include" as const, cache: "no-store" as const }
      const [iRes, mRes, lRes, cRes] = await Promise.all([
        fetch(`/api/inventory/items/${itemId}`, opts),
        fetch(`/api/inventory/items/${itemId}/movements`, opts),
        fetch("/api/inventory/locations", opts),
        fetch("/api/inventory/containers", opts),
      ])
      if (!iRes.ok) throw new Error(await errorOf(iRes, tr("Barang tidak dijumpai.", "Item not found.")))
      setItem(await iRes.json())
      if (mRes.ok) setMovements(await mRes.json())
      if (lRes.ok) setLocations(await lRes.json())
      if (cRes.ok) setContainers(await cRes.json())
      setLoadFailed(false)
    } catch (err) {
      setLoadFailed(true)
      showAlert(tr("Ralat", "Error"), err instanceof Error ? err.message : "", "error")
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers, itemId])

  useEffect(() => {
    void load()
  }, [load])

  const tree: Tree = useMemo(() => {
    const byParent = new Map<number | null, InvLocation[]>()
    for (const l of locations) byParent.set(l.parent_id, [...(byParent.get(l.parent_id) || []), l])
    const rows: Tree = []
    const walk = (p: number | null, depth: number) => { for (const l of byParent.get(p) || []) { rows.push({ loc: l, depth }); walk(l.id, depth + 1) } }
    walk(null, 0)
    return rows
  }, [locations])

  const call = async (run: () => Promise<Response>, fallback: string) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await run()
      if (!res.ok) throw new Error(await errorOf(res, fallback))
      await load()
    } catch (err) {
      showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : fallback, "error")
    } finally {
      setBusy(false)
    }
  }

  const changeQty = (operation: "add" | "subtract" | "set", amount: number) =>
    call(() => fetch(`/api/inventory/items/${itemId}/quantity`, { method: "POST", headers: headers(true), credentials: "include", body: JSON.stringify({ operation, amount }) }), tr("Gagal kemas kini kuantiti.", "Could not update the quantity."))

  const setStatus = (status: InvStatus) => {
    const run = () => call(() => fetch(`/api/inventory/items/${itemId}/status`, { method: "POST", headers: headers(true), credentials: "include", body: JSON.stringify({ status }) }), tr("Gagal tukar status.", "Could not change the status."))
    if (status === "disposed" || status === "used_up") {
      showConfirm(tr("Tukar status?", "Change status?"), tr("Perubahan ini direkodkan dalam sejarah barang.", "This change is recorded in the item's history."), () => void run(), "warning")
    } else {
      void run()
    }
  }

  const deleteItem = () =>
    showConfirm(tr(`Padam ${item?.name}?`, `Delete ${item?.name}?`), tr("Barang ini akan dibuang daripada senarai.", "This item will be removed from the list."), async () => {
      try {
        const res = await fetch(`/api/inventory/items/${itemId}`, { method: "DELETE", headers: headers(), credentials: "include" })
        if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam.", "Could not delete.")))
        router.push(`/${sessionId}/inventory`)
      } catch (err) {
        showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : "", "error")
      }
    }, "warning")

  const statusText = (s: InvStatus) =>
    ({ available: tr("Ada", "Available"), loaned: tr("Dipinjam", "Loaned"), missing: tr("Hilang", "Missing"), damaged: tr("Rosak", "Damaged"), disposed: tr("Dilupus", "Disposed"), used_up: tr("Habis", "Used up") })[s]
  const moveTitle = (m: Movement) =>
    ({ created: tr("Barang dicipta", "Item created"), moved: tr("Dipindahkan", "Moved"), quantity_changed: tr("Kuantiti diubah", "Quantity changed"), status_changed: tr("Status ditukar", "Status changed") } as Record<string, string>)[m.movement_type] || m.movement_type

  const listHref = `/${sessionId}/inventory`
  const disabled = !item

  return (
    <div className="pb-24 md:pb-6">
      <div className="md:hidden">
        <MobilePageHeader
          title={item?.name || tr("Butiran Barang", "Item Details")}
          fallbackHref={listHref}
          backPreferHistory
          action={
            <>
              <MobileIconButton onClick={() => setSheet("move")} disabled={disabled} label={tr("Pindah", "Move")}>
                <ArrowRightLeft />
              </MobileIconButton>
              <MobileIconButton onClick={() => setSheet("edit")} disabled={disabled} label={tr("Ubah", "Edit")}>
                <Pencil />
              </MobileIconButton>
            </>
          }
        />
      </div>
      <DesktopPageHeader
        className="hidden md:block"
        title={item?.name || tr("Butiran Barang", "Item Details")}
        breadcrumbs={[{ label: tr("Barang Saya", "My Inventory"), href: listHref }]}
        homeHref={`/${sessionId}`}
        backHref={listHref}
        actions={
          <>
            <DesktopPageAction onClick={() => setSheet("move")} disabled={disabled}>
              <ArrowRightLeft size={16} />
              {tr("Pindah", "Move")}
            </DesktopPageAction>
            <DesktopPageAction onClick={() => setSheet("edit")} disabled={disabled} variant="solid">
              <Pencil size={16} />
              {tr("Ubah", "Edit")}
            </DesktopPageAction>
          </>
        }
      />

      <DesktopPageBody className="mt-2 space-y-4 px-1 md:mt-0 md:space-y-5 md:px-0">
        {loadFailed && !item ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
            <p className="text-sm font-bold text-[var(--text)]">{tr("Barang tidak dapat dimuatkan", "The item could not be loaded")}</p>
            <button type="button" onClick={() => { setLoading(true); void load() }} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">{tr("Cuba lagi", "Try again")}</button>
          </div>
        ) : showSkeleton || !item ? (
          <div className="space-y-4">
            <div className="h-44 animate-pulse rounded-[2rem] bg-[var(--surface-tint)]" />
            <div className="h-48 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
          </div>
        ) : (
          <>
            {item.has_image ? (
              <div className="relative h-44 w-full overflow-hidden rounded-[1.5rem] border border-[var(--border)] sm:h-52 md:h-60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/inventory/items/${item.id}/image`} alt={item.name} className="h-full w-full object-cover" />
              </div>
            ) : null}

            <ModenHero
              label={
                <>
                  <Package size={16} />
                  <span className="min-w-0 truncate">{item.category || tr("Barang", "Item")}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-semibold opacity-80"><span className={cn("h-2 w-2 rounded-full", DOT[item.status])} />{statusText(item.status)}</span>
                </>
              }
              currency={null}
              amount={
                <>
                  {item.quantity}
                  <span className="ml-2 text-base font-semibold opacity-60">{item.unit}</span>
                </>
              }
              amountSize="clamp(2rem, 9vw, 2.75rem)"
              stats={[
                { key: "loc", tone: "neutral", icon: <MapPin size={15} strokeWidth={2.2} />, label: tr("Lokasi", "Location"), value: item.location_path || tr("Tiada", "None") },
                { key: "box", tone: "neutral", icon: <Boxes size={15} strokeWidth={2.2} />, label: tr("Bekas", "Box"), value: item.container_name || tr("Tiada", "None") },
              ]}
            />

            <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-2 lg:items-start">
              <div className="space-y-4">
                <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
                  <h2 className="mb-3 text-base font-bold text-[var(--text)]">{tr("Kuantiti", "Quantity")}</h2>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void changeQty("subtract", 1)} disabled={item.quantity <= 0 || busy} aria-label={tr("Kurang satu", "Remove one")} className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-strong)] text-[var(--text)] disabled:opacity-40">
                        <Minus size={18} />
                      </button>
                      <span className="min-w-14 text-center text-2xl font-bold tabular-nums text-[var(--text)]">{item.quantity}</span>
                      <button type="button" onClick={() => void changeQty("add", 1)} disabled={busy} aria-label={tr("Tambah satu", "Add one")} className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] disabled:opacity-40">
                        <Plus size={18} />
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      {[5, 10].map((n) => (
                        <button key={n} type="button" onClick={() => void changeQty("add", n)} disabled={busy} className="h-10 rounded-full border border-[var(--border)] px-3.5 text-sm font-semibold text-[var(--text)] disabled:opacity-40">+{n}</button>
                      ))}
                    </div>
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const n = Number(setQty)
                      if (setQty === "" || !Number.isInteger(n) || n < 0) {
                        showAlert(tr("Tak sah", "Invalid"), tr("Masukkan nombor bulat, 0 atau lebih.", "Enter a whole number, 0 or more."), "error")
                        return
                      }
                      void changeQty("set", n).then(() => setSetQty(""))
                    }}
                  >
                    <input value={setQty} onChange={(e) => setSetQty(e.target.value.replace(/\D/g, "").slice(0, 7))} inputMode="numeric" placeholder={tr("Tetapkan jumlah tepat", "Set an exact amount")} aria-label={tr("Tetapkan jumlah tepat", "Set an exact amount")} className={field} />
                    <button type="submit" disabled={busy || setQty === ""} className="h-12 shrink-0 rounded-full border border-[var(--border-strong)] px-5 text-sm font-semibold text-[var(--text)] disabled:opacity-40">{tr("Tetapkan", "Set")}</button>
                  </form>
                </section>

                <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
                  <h2 className="mb-3 text-base font-bold text-[var(--text)]">{tr("Status", "Status")}</h2>
                  <div className="grid grid-cols-3 gap-2">
                    {STATUSES.map((s) => (
                      <button key={s} type="button" aria-pressed={item.status === s} disabled={busy || item.status === s} onClick={() => setStatus(s)} className={cn("flex h-10 items-center justify-center gap-1.5 rounded-full border text-xs font-semibold", item.status === s ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--text)] disabled:opacity-50")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", DOT[s])} />
                        {statusText(s)}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
                  <h2 className="mb-3 text-base font-bold text-[var(--text)]">{tr("Maklumat", "Details")}</h2>
                  <dl className="divide-y divide-[var(--divider)] text-sm">
                    {([
                      [tr("Jenama", "Brand"), item.brand],
                      ["Model", item.model],
                      [tr("No. siri", "Serial no."), item.serial_number],
                      [tr("Tarikh beli", "Purchased"), item.purchase_date ? new Date(`${item.purchase_date}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : ""],
                      [tr("Harga", "Price"), item.purchase_price != null ? `RM ${money(item.purchase_price)}` : ""],
                      [tr("Dicipta", "Added"), item.created_at ? fmtDateTime(item.created_at, locale) : ""],
                    ] as Array<[string, string | null | undefined]>).map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
                        <dt className="shrink-0 text-[var(--muted)]">{k}</dt>
                        <dd className="min-w-0 text-right font-semibold text-[var(--text)] [overflow-wrap:anywhere]">{v || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  {item.notes ? <p className="mt-3 whitespace-pre-line border-t border-[var(--border)] pt-3 text-sm text-[var(--muted)] [overflow-wrap:anywhere]">{item.notes}</p> : null}
                  {(item.transaction_id || item.warranty_id) && (
                    <div className="mt-4 space-y-2">
                      {item.transaction_id ? (
                        <Link href={`/${sessionId}/transactions/${item.transaction_id}`} className="flex h-11 items-center justify-between rounded-full border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text)]">
                          <span className="flex items-center gap-2"><Receipt size={15} />{tr("Lihat transaksi pembelian", "View purchase transaction")}</span>
                          <ChevronRight size={15} className="opacity-60" />
                        </Link>
                      ) : null}
                      {item.warranty_id ? (
                        <Link href={`/${sessionId}/warranty/${item.warranty_id}`} className="flex h-11 items-center justify-between rounded-full border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text)]">
                          <span className="flex items-center gap-2"><ShieldCheck size={15} />{tr("Lihat waranti", "View warranty")}</span>
                          <ChevronRight size={15} className="opacity-60" />
                        </Link>
                      ) : null}
                    </div>
                  )}
                </section>
              </div>

              <div className="space-y-4">
                <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="flex items-center gap-2 text-base font-bold text-[var(--text)]"><History size={16} className="text-[var(--muted)]" />{tr("Sejarah", "History")}</h2>
                    <span className="text-xs font-semibold text-[var(--muted)]">{movements.length} {tr("rekod", "records")}</span>
                  </div>
                  {movements.length === 0 ? (
                    <p className="rounded-[1.25rem] border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">{tr("Belum ada sejarah.", "No history yet.")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {movements.map((m) => (
                        <li key={m.id} className="rounded-[1.25rem] border border-[var(--border)] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-bold text-[var(--text)]">{moveTitle(m)}</p>
                            <time className="shrink-0 text-xs text-[var(--muted)]">{fmtDateTime(m.moved_at, locale)}</time>
                          </div>
                          {(m.quantity_before != null || m.quantity_after != null) && (
                            <p className="mt-0.5 text-xs font-semibold text-[var(--text-soft)]">{m.quantity_before ?? "—"} → {m.quantity_after ?? "—"} {item.unit}</p>
                          )}
                          {(m.status_before || m.status_after) && (
                            <p className="mt-0.5 text-xs font-semibold text-[var(--text-soft)]">{m.status_before || "—"} → {m.status_after || "—"}</p>
                          )}
                          {m.movement_type !== "quantity_changed" && m.movement_type !== "status_changed" && (m.from_place || m.to_place) && (
                            <p className="mt-0.5 text-xs text-[var(--text-soft)] [overflow-wrap:anywhere]">{m.from_place ? `${m.from_place} → ` : ""}{m.to_place || tr("Tiada lokasi", "No location")}</p>
                          )}
                          {m.notes ? <p className="mt-1 text-xs text-[var(--muted)] [overflow-wrap:anywhere]">{m.notes}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <button type="button" onClick={deleteItem} className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-rose-500/30 text-sm font-semibold text-rose-500">
                  <Trash2 size={15} />
                  {tr("Padam barang ini", "Delete this item")}
                </button>
              </div>
            </div>
          </>
        )}
      </DesktopPageBody>

      {sheet === "edit" && item && (
        <ItemSheet
          state={{ item }}
          locations={tree}
          containers={containers}
          categories={[]}
          headers={headers}
          errorOf={errorOf}
          tr={tr}
          showAlert={showAlert}
          onClose={() => setSheet(null)}
          onSaved={() => { setSheet(null); void load() }}
        />
      )}
      {sheet === "move" && item && (
        <MoveSheet
          item={item}
          tree={tree}
          containers={containers}
          headers={headers}
          errorOf={errorOf}
          tr={tr}
          showAlert={showAlert}
          onClose={() => setSheet(null)}
          onMoved={() => { setSheet(null); void load() }}
        />
      )}
      {alertModal}
    </div>
  )
}

function MoveSheet({ item, tree, containers, headers, errorOf, tr, showAlert, onClose, onMoved }: {
  item: InvItem
  tree: Tree
  containers: InvContainer[]
  headers: (json?: boolean) => Record<string, string>
  errorOf: (res: Response, fallback: string) => Promise<string>
  tr: (bm: string, en: string) => string
  showAlert: (title: string, message: string, kind?: "error" | "success" | "warning") => void
  onClose: () => void
  onMoved: () => void
}) {
  const [locationId, setLocationId] = useState(item.location_id ? String(item.location_id) : "")
  const [containerId, setContainerId] = useState(item.container_id ? String(item.container_id) : "")
  const [qty, setQty] = useState(String(item.quantity))
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const boxes = containers.filter((c) => !locationId || String(c.location_id) === locationId)
  const n = Number(qty)
  const problem = !Number.isInteger(n) || n < 1 ? tr("Kuantiti mesti sekurang-kurangnya 1.", "Quantity must be at least 1.") : n > item.quantity ? tr(`Hanya ada ${item.quantity} ${item.unit}.`, `Only ${item.quantity} ${item.unit} in stock.`) : null
  const unchanged = String(item.location_id || "") === locationId && String(item.container_id || "") === containerId

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    if (problem) {
      showAlert(tr("Tak sah", "Invalid"), problem, "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/inventory/items/${item.id}/move`, {
        method: "POST",
        headers: headers(true),
        credentials: "include",
        body: JSON.stringify({ location_id: locationId ? Number(locationId) : null, container_id: containerId ? Number(containerId) : null, quantity: n === item.quantity ? 0 : n, notes: notes.trim() || null }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal pindah.", "Could not move.")))
      onMoved()
    } catch (err) {
      showAlert(tr("Gagal pindah", "Move failed"), err instanceof Error ? err.message : "", "error")
      setSaving(false)
    }
  }

  return (
    <AppSheet
      open
      onClose={onClose}
      id="inventory-move-sheet"
      title={tr("Pindahkan barang", "Move item")}
      size="sm"
      footer={
        <button type="button" onClick={() => void submit()} disabled={saving || unchanged && n === item.quantity} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {tr("Pindah", "Move")}
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-full border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted)] [overflow-wrap:anywhere]">
          {tr("Sekarang", "Now")}: <span className="font-semibold text-[var(--text)]">{[item.location_path, item.container_name].filter(Boolean).join(" · ") || tr("Tiada lokasi", "No location")}</span>
        </p>
        <div>
          <label htmlFor="mv-loc" className={label}>{tr("Lokasi baharu", "New location")}</label>
          <select id="mv-loc" value={locationId} onChange={(e) => { setLocationId(e.target.value); setContainerId("") }} className={field}>
            <LocationOptions tree={tree} tr={tr} />
          </select>
        </div>
        <div>
          <label htmlFor="mv-box" className={label}>{tr("Bekas (pilihan)", "Box (optional)")}</label>
          <select id="mv-box" value={containerId} onChange={(e) => setContainerId(e.target.value)} className={field}>
            <option value="">{tr("— Tiada —", "— None —")}</option>
            {boxes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {item.quantity > 1 && (
          <div>
            <label htmlFor="mv-qty" className={label}>{tr("Berapa unit dipindahkan", "How many to move")} ({tr("daripada", "of")} {item.quantity})</label>
            <input id="mv-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 7))} className={field} />
            {n > 0 && n < item.quantity && <p className="mt-1.5 text-xs text-[var(--muted)]">{tr("Baki akan kekal di tempat asal sebagai rekod berasingan.", "The rest stays where it is, as a separate record.")}</p>}
          </div>
        )}
        <div>
          <label htmlFor="mv-notes" className={label}>{tr("Nota (pilihan)", "Note (optional)")}</label>
          <textarea id="mv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={area} />
        </div>
      </form>
    </AppSheet>
  )
}
