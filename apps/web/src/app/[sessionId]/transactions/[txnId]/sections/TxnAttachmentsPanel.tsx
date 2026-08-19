"use client"

import { useState } from "react"
import { FileText, Globe, Trash2, Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { SmartImage } from "@/components/ui/SmartImage"
import { useLang } from "@/lib/lang"
import type { TransactionDetail } from "../types"

export type TxnAttachmentsPanelProps = {
  txn: TransactionDetail
  attachmentObjectUrls: Record<number, string>
  deletingAttachmentId: number | null
  onOpen: (attachment: NonNullable<TransactionDetail["attachments"]>[number]) => void
  onRequestDelete: (attachment: NonNullable<TransactionDetail["attachments"]>[number]) => void
  onRetryLoad: (attachment: NonNullable<TransactionDetail["attachments"]>[number]) => void
  formatBytes: (bytes: number | null) => string
  isImageAttachment: (mimeType: string | null) => boolean
  isPdfAttachment: (mimeType: string | null) => boolean
}

export default function TxnAttachmentsPanel({
  txn,
  attachmentObjectUrls,
  deletingAttachmentId,
  onOpen,
  onRequestDelete,
  onRetryLoad,
  formatBytes,
  isImageAttachment,
  isPdfAttachment,
}: TxnAttachmentsPanelProps) {
  const { lang, t: langT } = useLang()
  const isBm = lang === "BM"
  const [activeIndex, setActiveIndex] = useState(0)
  const attachments = txn.attachments || []
  const hasAttachments = attachments.length > 0
  const previewable = attachments.filter((att) => isImageAttachment(att.mime_type) || isPdfAttachment(att.mime_type))

  return (
    <div className="sticky top-5 space-y-5">
      <div className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] lg:min-h-0">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 md:px-6 md:py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--muted)]">
              <FileText size={16} />
            </div>
            <h3 className="text-sm font-semibold text-[var(--text)]">{langT.preview}</h3>
          </div>
          {!!attachments.length && (
            <span className="rounded-full bg-[var(--surface-tint-strong)] px-2.5 py-1 text-[0.625rem] font-semibold text-[var(--muted)]">
              {attachments.length} {attachments.length === 1 ? (isBm ? "Item" : "Item") : (isBm ? "Items" : "Items")}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:max-h-[540px]">
          {!hasAttachments ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center opacity-40">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)]">
                <FileText size={32} strokeWidth={1} />
              </div>
              <p className="mt-3 text-sm font-semibold">{langT.receiptAttachments}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{langT.noWaRecordsDesc}</p>
            </div>
          ) : (
            <div className="space-y-5">
              {previewable.length > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => setActiveIndex((i) => (i - 1 + previewable.length) % previewable.length)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <p className="text-xs font-semibold text-[var(--muted)]">
                    {activeIndex + 1} / {previewable.length}
                  </p>
                  <button
                    onClick={() => setActiveIndex((i) => (i + 1) % previewable.length)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {attachments.map((att) => (
                <div key={att.id} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--text)]">{att.file_name}</p>
                        <p className="mt-0.5 text-[0.6875rem] text-[var(--muted)]">
                          {att.mime_type?.split("/")?.[1]?.toUpperCase() || "FILE"} · {formatBytes(att.size_bytes)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => onOpen(att)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-tint-strong)] text-[var(--muted)] transition-colors hover:bg-[var(--border)]"
                        title={langT.view}
                      >
                        <Globe size={14} />
                      </button>
                      <button
                        onClick={() => onRequestDelete(att)}
                        disabled={deletingAttachmentId === att.id}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-tint-strong)] text-rose-500 transition-colors hover:bg-rose-500/15 disabled:opacity-60"
                        title={isBm ? "Buang lampiran" : "Remove attachment"}
                      >
                        {deletingAttachmentId === att.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>

                  {isImageAttachment(att.mime_type) && (
                    <div className="flex min-h-40 justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                      {attachmentObjectUrls[att.id] ? (
                        <SmartImage
                          src={attachmentObjectUrls[att.id]}
                          alt={att.file_name}
                          className="h-auto max-h-[280px] w-auto max-w-full md:max-h-[320px]"
                          imgClassName="h-auto max-h-[280px] w-auto max-w-full cursor-zoom-in object-contain transition-transform active:scale-[0.98] md:max-h-[320px]"
                          loading="eager"
                          onClick={() => onOpen(att)}
                        />
                      ) : (
                        <div className="flex h-40 w-full flex-col items-center justify-center gap-2">
                          <Loader2 className="animate-spin text-[var(--muted)]" size={20} />
                          <button onClick={() => onRetryLoad(att)} className="text-[0.625rem] font-semibold text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                            {langT.pleaseWait}...
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {isPdfAttachment(att.mime_type) && (
                    <div className="h-[500px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] md:h-[440px] lg:h-[460px]">
                      {attachmentObjectUrls[att.id] ? (
                        <iframe src={`${attachmentObjectUrls[att.id]}#toolbar=0`} className="h-full w-full border-0" title={att.file_name} />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2">
                          <Loader2 className="animate-spin text-[var(--muted)]" size={20} />
                          <button onClick={() => onRetryLoad(att)} className="text-[0.625rem] font-semibold text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                            {langT.pleaseWait}...
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
