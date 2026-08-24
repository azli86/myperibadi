"use client"

import { getAccessToken } from "@/lib/auth-session"
import React, { useState, useEffect, useRef } from "react"
import {
  AlertTriangle,
  BadgePercent,
  Car,
  ChevronRight,
  Download,
  Edit3,
  Loader2,
  Package,
  Trash2,
  Undo2,
  Users,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useLang } from "@/lib/lang"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"
import { usePageAlert } from "@/hooks/usePageAlert"
import { splitWalletTaggedDescription } from "@/lib/transaction-display"
import TxnHeader from "./sections/TxnHeader"
import TxnSummaryCard from "./sections/TxnSummaryCard"
import TxnDetailsList from "./sections/TxnDetailsList"
import TxnItemsTable from "./sections/TxnItemsTable"
import TxnAttachmentsPanel from "./sections/TxnAttachmentsPanel"
import TxnDeleteModal from "./sections/TxnDeleteModal"
import TxnRefundModal from "./sections/TxnRefundModal"
import TxnEditSheet from "./sections/TxnEditSheet"
import TaxLinkSheet from "./sections/TaxLinkSheet"
import type {
  TransactionDetail,
  CategoryOption,
  WalletOption,
  LoanOption,
  SubscriptionOption,
  EditItem,
  UserProfile,
  ReceiptPdfImage,
} from "./types"

function isOwnerSalaryBusinessWithdrawal(tx: Pick<TransactionDetail, "category_name" | "vendor_or_source" | "reference_id" | "notes" | "source_channel">) {
  const haystack = [tx.vendor_or_source, tx.reference_id, tx.notes, tx.source_channel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return (
    !tx.category_name &&
    (haystack.includes("owner salary") || haystack.includes("salary business") || haystack.includes("salary biness")) &&
    (haystack.includes("withdraw") || haystack.includes("widdraw") || haystack.includes("owner salary"))
  )
}

function getTransactionCategoryLabel(tx: TransactionDetail, fallback: string) {
  const vendor = (tx.vendor_or_source || "").trim().toLowerCase()
  if (vendor.startsWith("subx ")) return "Subscription"
  if (vendor.startsWith("loan payment ")) return "Loan"
  if (tx.category_name) return tx.category_name
  if (isOwnerSalaryBusinessWithdrawal(tx)) return "Salary Business"
  return fallback
}

const ATTACHMENT_PREVIEW_RETRY_DELAYS_MS = [500, 1200, 2500]
const ATTACHMENT_POLL_DELAYS_MS = [700, 1500, 3000, 5000]
const RECEIPT_BRAND_NAME = "MyPeribadi"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const normalizeAttachmentProxyUrl = (rawUrl: string) => {
  if (!rawUrl) return rawUrl

  try {
    const parsed = new URL(rawUrl, window.location.origin)
    if (parsed.pathname.startsWith("/attachments/")) {
      return `/api${parsed.pathname}${parsed.search}`
    }
    if (parsed.pathname.startsWith("/api/attachments/")) {
      return `${parsed.pathname}${parsed.search}`
    }
    return rawUrl.startsWith("http") ? rawUrl : `${parsed.pathname}${parsed.search}`
  } catch {
    if (rawUrl.startsWith("/attachments/")) return `/api${rawUrl}`
    return rawUrl
  }
}


const sanitizeReceiptText = (value: unknown) => {
  return String(value ?? "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2022]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim() || "-"
}

const escapePdfText = (value: unknown) => {
  return sanitizeReceiptText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
}

const wrapReceiptText = (value: unknown, maxChars: number) => {
  const words = sanitizeReceiptText(value).split(" ")
  const lines: string[] = []
  let current = ""

  words.forEach((word) => {
    if (!current) {
      current = word
      return
    }
    if (`${current} ${word}`.length > maxChars) {
      lines.push(current)
      current = word
      return
    }
    current = `${current} ${word}`
  })

  if (current) lines.push(current)
  return lines.length ? lines : ["-"]
}

const convertBlobToReceiptImage = async (blob: Blob, fileName: string): Promise<ReceiptPdfImage> => {
  const objectUrl = URL.createObjectURL(blob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("Unable to load attachment image"))
      img.src = objectUrl
    })

    const maxEdge = 1400
    const naturalWidth = image.naturalWidth || image.width || 1
    const naturalHeight = image.naturalHeight || image.height || 1
    const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight))
    const width = Math.max(1, Math.round(naturalWidth * scale))
    const height = Math.max(1, Math.round(naturalHeight * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas is not available")

    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((convertedBlob) => {
        if (convertedBlob) {
          resolve(convertedBlob)
          return
        }
        reject(new Error("Unable to convert attachment image"))
      }, "image/jpeg", 0.86)
    })

    return {
      fileName,
      data: new Uint8Array(await jpegBlob.arrayBuffer()),
      width,
      height,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const createPdfBlob = (contentStream: string, attachmentImages: ReceiptPdfImage[] = []) => {
  const encoder = new TextEncoder()
  const parts: BlobPart[] = []
  const offsets: number[] = [0]
  let byteLength = 0

  const append = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part
    parts.push(bytes as unknown as BlobPart)
    byteLength += bytes.byteLength
  }

  const beginObject = (id: number) => {
    offsets[id] = byteLength
    append(`${id} 0 obj\n`)
  }

  const endObject = () => append("endobj\n")

  const pageDefinitions: {
    pageObjectId: number
    contentObjectId: number
    imageObjectId?: number
    content: string
    image?: ReceiptPdfImage
  }[] = []
  let nextObjectId = 5

  const addPage = (content: string, image?: ReceiptPdfImage) => {
    const pageObjectId = nextObjectId++
    const contentObjectId = nextObjectId++
    const imageObjectId = image ? nextObjectId++ : undefined
    pageDefinitions.push({ pageObjectId, contentObjectId, imageObjectId, content, image })
  }

  addPage(contentStream)

  attachmentImages.forEach((image, index) => {
    const maxWidth = 515
    const maxHeight = 640
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
    const drawWidth = Math.round(image.width * scale)
    const drawHeight = Math.round(image.height * scale)
    const x = Math.round((595 - drawWidth) / 2)
    const y = Math.round(100 + (maxHeight - drawHeight) / 2)
    const title = escapePdfText(`Lampiran Gambar ${index + 1}`)
    const fileName = escapePdfText(image.fileName)
    const pageContent = [
      `BT 0 0 0 rg /F2 16 Tf 40 798 Td (${title}) Tj ET`,
      `BT 0.35 0.35 0.35 rg /F1 9 Tf 40 781 Td (${fileName}) Tj ET`,
      `0.78 0.78 0.78 RG 0.8 w 40 758 m 555 758 l S`,
      `q ${drawWidth} 0 0 ${drawHeight} ${x} ${y} cm /Im1 Do Q`,
      `BT 0.45 0.45 0.45 rg /F1 8 Tf 40 62 Td (${escapePdfText(`${RECEIPT_BRAND_NAME} - ${new Date().toISOString().slice(0, 10)}`)}) Tj ET`,
    ].join("\n")
    addPage(pageContent, image)
  })

  const maxObjectId = nextObjectId - 1
  append("%PDF-1.4\n")

  beginObject(1)
  append("<< /Type /Catalog /Pages 2 0 R >>\n")
  endObject()

  beginObject(2)
  append(`<< /Type /Pages /Kids [${pageDefinitions.map((page) => `${page.pageObjectId} 0 R`).join(" ")}] /Count ${pageDefinitions.length} >>\n`)
  endObject()

  beginObject(3)
  append("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\n")
  endObject()

  beginObject(4)
  append("<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\n")
  endObject()

  pageDefinitions.forEach((page) => {
    beginObject(page.pageObjectId)
    const xObjectResource = page.imageObjectId ? ` /XObject << /Im1 ${page.imageObjectId} 0 R >>` : ""
    append(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObjectResource} >> /Contents ${page.contentObjectId} 0 R >>\n`)
    endObject()

    const contentBytes = encoder.encode(page.content)
    beginObject(page.contentObjectId)
    append(`<< /Length ${contentBytes.byteLength} >>\nstream\n`)
    append(contentBytes)
    append("\nendstream\n")
    endObject()

    if (page.image && page.imageObjectId) {
      beginObject(page.imageObjectId)
      append(`<< /Type /XObject /Subtype /Image /Width ${page.image.width} /Height ${page.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.image.data.byteLength} >>\nstream\n`)
      append(page.image.data)
      append("\nendstream\n")
      endObject()
    }
  })

  const xrefOffset = byteLength
  append(`xref\n0 ${maxObjectId + 1}\n0000000000 65535 f \n`)
  for (let id = 1; id <= maxObjectId; id += 1) {
    append(`${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`)
  }
  append(`trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  return new Blob(parts, { type: "application/pdf" })
}

export default function TransactionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { lang, timezone, timeFormat, t: langT } = useLang()
  const sessionId = params.sessionId as string || ""
  const txnId = params.txnId as string || ""

  const [txn, setTxn] = useState<TransactionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showRefundModal, setShowRefundModal] = useState(false)
  const [showTaxModal, setShowTaxModal] = useState(false)
  const [refundAmount, setRefundAmount] = useState("")
  const [refunding, setRefunding] = useState(false)
  const [attachmentToDelete, setAttachmentToDelete] = useState<NonNullable<TransactionDetail["attachments"]>[number] | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [loans, setLoans] = useState<LoanOption[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionOption[]>([])
  const [linkedLoanId, setLinkedLoanId] = useState<string>("")
  const [linkedSubscriptionId, setLinkedSubscriptionId] = useState<string>("")
  const [vehicleLink, setVehicleLink] = useState<{
    vehicle_id: number | null
    vehicle_name: string | null
    registration_number?: string | null
    kind?: string | null
    label?: string | null
    transaction_reference_id?: string | null
  } | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [splitBill, setSplitBill] = useState<{
    id: number
    title: string
    status: string
    balance_amount: number
    collect_amount?: number | null
    currency?: string | null
  } | null>(null)
  const [splitLoaded, setSplitLoaded] = useState(false)
  const [invAdded, setInvAdded] = useState(false)
  const [invAdding, setInvAdding] = useState(false)
  const [receiptDownloading, setReceiptDownloading] = useState(false)
  const [editForm, setEditForm] = useState<{
    description: string
    amount: string
    category_id: string
    wallet_id: string
    type: "expense" | "income"
    date: string
    time: string
    notes: string
  }>({
    description: "",
    amount: "",
    category_id: "",
    wallet_id: "",
    type: "expense",
    date: "",
    time: "",
    notes: ""
  })
  const [editItems, setEditItems] = useState<EditItem[]>([])
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [editFile, setEditFile] = useState<File | null>(null)
  const [, setOpeningAttachmentId] = useState<number | null>(null)
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<number | null>(null)
  const [attachmentObjectUrls, setAttachmentObjectUrls] = useState<Record<number, string>>({})
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const attachmentObjectUrlRef = useRef<Record<number, string>>({})
  const activeFetchIdRef = useRef(0)

  useEffect(() => {
    if (!showEditModal && !showRefundModal) return

    const scrollY = window.scrollY
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyOverscroll = document.body.style.overscrollBehavior
    const previousBodyPosition = document.body.style.position
    const previousBodyTop = document.body.style.top
    const previousBodyWidth = document.body.style.width
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior

    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"
    document.body.style.position = "fixed"
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = "100%"
    document.documentElement.style.overscrollBehavior = "none"

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.overscrollBehavior = previousBodyOverscroll
      document.body.style.position = previousBodyPosition
      document.body.style.top = previousBodyTop
      document.body.style.width = previousBodyWidth
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll
      window.scrollTo(0, scrollY)
    }
  }, [showEditModal, showRefundModal])

  const clearAttachmentUrls = (keepIds?: Set<number>) => {
    for (const [idText, objectUrl] of Object.entries(attachmentObjectUrlRef.current)) {
      const id = Number(idText)
      if (keepIds && keepIds.has(id)) continue
      URL.revokeObjectURL(objectUrl)
      delete attachmentObjectUrlRef.current[id]
    }
    setAttachmentObjectUrls({ ...attachmentObjectUrlRef.current })
  }

  const isImageAttachment = (mimeType?: string | null, fileName?: string | null) => {
    const mime = (mimeType || "").toLowerCase()
    const name = (fileName || "").toLowerCase()
    return mime.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(name)
  }

  const isPdfAttachment = (mimeType?: string | null, fileName?: string | null) => {
    const mime = (mimeType || "").toLowerCase()
    const name = (fileName || "").toLowerCase()
    return mime.includes("pdf") || name.endsWith(".pdf")
  }

  const waitForImageUrl = (url: string) =>
    new Promise<void>((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("Image not ready"))
      img.src = url
    })

  const getAttachmentBlobUrl = async (attachment: NonNullable<TransactionDetail["attachments"]>[number]) => {
    const cached = attachmentObjectUrlRef.current[attachment.id]
    if (cached) return cached

    const token = getAccessToken()
    const isImage = isImageAttachment(attachment.mime_type, attachment.file_name)
    const isPdf = isPdfAttachment(attachment.mime_type, attachment.file_name)

    // For PDF files: fetch the high-resolution rendered first-page image preview
    if (isPdf) {
      for (let attempt = 0; attempt <= ATTACHMENT_PREVIEW_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          const previewUrl = `/api/attachments/${attachment.id}/pdf-preview`
          const retryUrl = attempt > 0 ? `${previewUrl}?_retry=${attempt}` : previewUrl
          const res = await fetch(retryUrl, {
            credentials: "include",
            cache: "no-store",
            headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
          })
          if (res.ok) {
            const blob = await res.blob()
            const objectUrl = URL.createObjectURL(blob)
            attachmentObjectUrlRef.current[attachment.id] = objectUrl
            setAttachmentObjectUrls({ ...attachmentObjectUrlRef.current })
            return objectUrl
          }
        } catch {
          if (attempt < ATTACHMENT_PREVIEW_RETRY_DELAYS_MS.length) {
            await sleep(ATTACHMENT_PREVIEW_RETRY_DELAYS_MS[attempt])
          }
        }
      }
    }

    // Attempt 1: R2 direct_url — actually probe image load (HEAD no-cors always "succeeds")
    if (attachment.direct_url) {
      if (isImage) {
        for (let attempt = 0; attempt <= ATTACHMENT_PREVIEW_RETRY_DELAYS_MS.length; attempt += 1) {
          try {
            const probeUrl = attempt > 0
              ? `${attachment.direct_url}${attachment.direct_url.includes("?") ? "&" : "?"}_retry=${attempt}`
              : attachment.direct_url
            await waitForImageUrl(probeUrl)
            attachmentObjectUrlRef.current[attachment.id] = probeUrl
            setAttachmentObjectUrls({ ...attachmentObjectUrlRef.current })
            return probeUrl
          } catch {
            if (attempt < ATTACHMENT_PREVIEW_RETRY_DELAYS_MS.length) {
              await sleep(ATTACHMENT_PREVIEW_RETRY_DELAYS_MS[attempt])
            }
          }
        }
      } else {
        try {
          const res = await fetch(attachment.direct_url, { method: "GET", mode: "cors", cache: "no-store" })
          if (res.ok) {
            const blob = await res.blob()
            const objectUrl = URL.createObjectURL(blob)
            attachmentObjectUrlRef.current[attachment.id] = objectUrl
            setAttachmentObjectUrls({ ...attachmentObjectUrlRef.current })
            return objectUrl
          }
        } catch {
          // fall through to proxy
        }
      }
    }

    // Attempt 2: Fallback to proxy_url (API proxy) with retries for post-upload propagation
    const proxyUrl = normalizeAttachmentProxyUrl(attachment.proxy_url)
    let lastError: unknown = null
    for (let attempt = 0; attempt <= ATTACHMENT_PREVIEW_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const retryUrl = attempt > 0
          ? `${proxyUrl}${proxyUrl.includes("?") ? "&" : "?"}_retry=${attempt}`
          : proxyUrl
        const res = await fetch(retryUrl, {
          credentials: "include",
          cache: "no-store",
          headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        })
        if (!res.ok) throw new Error(`Failed to fetch attachment (${res.status})`)

        const blob = await res.blob()
        const objectUrl = URL.createObjectURL(blob)
        attachmentObjectUrlRef.current[attachment.id] = objectUrl
        setAttachmentObjectUrls({ ...attachmentObjectUrlRef.current })
        return objectUrl
      } catch (err) {
        lastError = err
        if (attempt < ATTACHMENT_PREVIEW_RETRY_DELAYS_MS.length) {
          await sleep(ATTACHMENT_PREVIEW_RETRY_DELAYS_MS[attempt])
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Failed to fetch attachment")
  }

  const preloadImagePreviews = async (attachments: NonNullable<TransactionDetail["attachments"]>) => {
    const previewableAttachments = attachments.filter(
      (att) => isImageAttachment(att.mime_type, att.file_name) || isPdfAttachment(att.mime_type, att.file_name)
    )
    await Promise.all(
      previewableAttachments.map(async (att) => {
        try {
          await getAttachmentBlobUrl(att)
        } catch (err) {
          console.error("Preview load error:", err)
        }
      })
    )
  }

  const fetchTransactionAttachments = async (transactionKey: string, token: string) => {
    const attRes = await fetch(`/api/transactions/${transactionKey}/attachments`, {
      credentials: "include",
      headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
    })
    if (attRes.status === 404) throw new Error("TX_NOT_FOUND")
    if (!attRes.ok) return []
    const attachments = await attRes.json()
    return Array.isArray(attachments) ? attachments : []
  }

  const applyResolvedAttachments = (
    fetchId: number,
    resolvedTxnId: number,
    attachments: NonNullable<TransactionDetail["attachments"]>
  ) => {
    if (activeFetchIdRef.current !== fetchId) return

    setTxn((prev) => {
      if (!prev || prev.id !== resolvedTxnId) return prev
      return { ...prev, attachments }
    })
    clearAttachmentUrls(new Set(attachments.map((att) => att.id)))
    void preloadImagePreviews(attachments)
  }

  const pollForAttachments = async (
    fetchId: number,
    transactionKey: string,
    resolvedTxnId: number,
    token: string
  ) => {
    for (const delayMs of ATTACHMENT_POLL_DELAYS_MS) {
      if (activeFetchIdRef.current !== fetchId) return
      await sleep(delayMs)
      if (activeFetchIdRef.current !== fetchId) return

      try {
        const attachments = await fetchTransactionAttachments(transactionKey, token)
        if (attachments.length) {
          applyResolvedAttachments(fetchId, resolvedTxnId, attachments)
          return
        }
      } catch (err) {
        if ((err as Error).message === "TX_NOT_FOUND") return
        console.error("Attachment poll error:", err)
      }
    }
  }

  useEffect(() => {
    if (txn && txn.reference_id && txnId === String(txn.id)) {
      // Normalize URL to professional ID if current URL is numeric
      router.replace(`/${sessionId}/transactions/${txn.reference_id}`);
    }
  }, [txn, txnId, sessionId, router]);

  useEffect(() => {
    return () => {
      clearAttachmentUrls()
    }
  }, [])

  useEffect(() => {
    fetchTransaction()
    fetchCategories()
    fetchWallets()
    fetchLoans()
    fetchSubscriptions()
    fetchTransactionLoanLink()
    fetchTransactionVehicleLink()
    fetchUserProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnId])

  const fetchTransaction = async () => {
    const fetchId = activeFetchIdRef.current + 1
    activeFetchIdRef.current = fetchId

    try {
      const token = getAccessToken()
      const res = await fetch(`/api/transactions/${txnId}`, {
        credentials: "include",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (res.ok) {
        const data = await res.json()
        if (activeFetchIdRef.current !== fetchId) return

        let attachments = Array.isArray(data.attachments) ? data.attachments : []
        if (!attachments.length) {
          attachments = await fetchTransactionAttachments(txnId, token || "")
        }
        if (activeFetchIdRef.current !== fetchId) return

        setTxn({ ...data, attachments })
        void fetchSplitForTxn(data.id)
        clearAttachmentUrls(new Set(attachments.map((att: { id: number }) => att.id)))
        void preloadImagePreviews(attachments)
        if (!attachments.length) {
          const transactionKey = data.reference_id || txnId
          void pollForAttachments(fetchId, transactionKey, data.id, token || "")
        }
        setLinkedSubscriptionId(data.subscription_id ? String(data.subscription_id) : "")
        setEditForm({
          description: data.vendor_or_source,
          amount: String(data.amount),
          category_id: data.category_id ? String(data.category_id) : "",
          wallet_id: data.wallet_id ? String(data.wallet_id) : "",
          type: data.type,
          date: data.txn_date || "",
          time: data.txn_time ? String(data.txn_time).slice(0, 5) : "",
          notes: data.notes || ""
        })
        const existingItems = (data.items || []).map((item: NonNullable<TransactionDetail["items"]>[number]) => ({
          name: item.name || "",
          quantity: String(item.quantity ?? 1),
          unit_price: String(item.unit_price ?? 0),
        }))
        const inferredItems = inferEditItemsFromDescription(data.vendor_or_source || "")
        setEditItems(existingItems.length
          ? existingItems
          : (inferredItems.length ? inferredItems : (data.type === "income" ? [] : [{ name: "", quantity: "1", unit_price: data.amount ? String(data.amount) : "0" }])))
      } else {
        if (activeFetchIdRef.current !== fetchId) return
        if (res.status === 404) {
          router.replace(`/${sessionId}/transactions?deleted=success`)
          return
        }
        setError(langT.transactionNotFound)
      }
    } catch {
      if (activeFetchIdRef.current !== fetchId) return
      setError(langT.transactionLoadError)
    } finally {
      if (activeFetchIdRef.current === fetchId) {
        setLoading(false)
      }
    }
  }

  const fetchCategories = async () => {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/categories", {
        credentials: "include",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (res.ok) setCategories(await res.json())
    } catch {}
  }

  const fetchSplitForTxn = async (transactionId: number) => {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/split-bills?limit=100", {
        credentials: "include",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        cache: "no-store",
      })
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data)) {
        const match = data.find((s) => s.transaction_id === transactionId)
        setSplitBill(match || null)
      }
    } catch {
      // silent
    } finally {
      setSplitLoaded(true)
    }
  }

  const fetchWallets = async () => {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/wallets", {
        credentials: "include",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (res.ok) {
        const data = await res.json()
        setWallets(Array.isArray(data) ? data : [])
      }
    } catch {}
  }

  const fetchLoans = async () => {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/loans?include_settled=true", {
        credentials: "include",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (res.ok) {
        const data = await res.json()
        setLoans(Array.isArray(data) ? data : [])
      }
    } catch {}
  }

  const fetchSubscriptions = async () => {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/subscriptions?include_settled=true", {
        credentials: "include",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (res.ok) {
        const data = await res.json()
        setSubscriptions(Array.isArray(data) ? data : [])
      }
    } catch {}
  }

  const fetchTransactionLoanLink = async () => {
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/transactions/${txnId}/loan-link`, {
        credentials: "include",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (res.ok) {
        const data = await res.json()
        setLinkedLoanId(data?.loan_id ? String(data.loan_id) : "")
      }
    } catch {}
  }

  const fetchTransactionVehicleLink = async () => {
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/transactions/${txnId}/vehicle-link`, {
        credentials: "include",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.vehicle_id) setVehicleLink(data)
        else setVehicleLink(null)
      }
    } catch {
      setVehicleLink(null)
    }
  }

  const fetchUserProfile = async () => {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me", {
        credentials: "include",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (res.ok) setUserProfile(await res.json())
    } catch {}
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/transactions/${txnId}`, {
        credentials: "include",
        method: "DELETE",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (res.ok) {
        setShowDeleteModal(false)
        router.push(`/${sessionId}/transactions?deleted=success`)
      } else {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData?.detail || (lang === "EN" ? "Failed to delete transaction." : "Gagal padam transaksi."))
      }
    } catch (err) {
      console.error("Delete error:", err)
      showAlert(
        lang === "EN" ? "Delete Failed" : "Padam Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to delete transaction." : "Gagal padam transaksi."),
        "error"
      )
    } finally {
      setDeleting(false)
    }
  }

  const addTxnToInventory = async () => {
    if (!txn || invAdding) return
    setInvAdding(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/inventory/items", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          name: txn.vendor_or_source,
          quantity: 1,
          purchase_date: txn.txn_date,
          purchase_price: Number(txn.amount),
          transaction_id: txn.id,
        }),
      })
      if (res.ok) setInvAdded(true)
    } finally {
      setInvAdding(false)
    }
  }

  const openRefundModal = () => {
    setRefundAmount(txn?.amount?.toFixed(2) || "")
    setShowRefundModal(true)
  }

  const handleRefundClick = () => {
    if (!txn) return
    const title = lang === "BM" ? "Refund Transaksi?" : "Refund Transaction?"
    const desc = lang === "BM"
      ? `Anda akan mencipta transaksi refund untuk "${txn.vendor_or_source}" sebanyak RM ${txn.amount.toFixed(2)}. Teruskan?`
      : `You are about to create a refund for "${txn.vendor_or_source}" for RM ${txn.amount.toFixed(2)}. Continue?`
    showConfirm(title, desc, openRefundModal)
  }

  const handleRefund = async () => {
    const amount = parseFloat(refundAmount)
    if (!amount || amount <= 0) {
      showAlert(
        lang === "EN" ? "Invalid Amount" : "Amaun Tidak Sah",
        lang === "EN" ? "Please enter a valid refund amount." : "Sila masukkan amaun refund yang sah.",
        "error"
      )
      return
    }
    setRefunding(true)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/transactions/${txnId}/refund`, {
        credentials: "include",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ refund_amount: amount })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setShowRefundModal(false)
        showAlert(
          lang === "EN" ? "Refund Created" : "Refund Berjaya",
          data?.message || (lang === "EN" ? "Refund transaction created successfully." : "Transaksi refund berjaya dijana."),
          "success"
        )
        router.push(`/${sessionId}/transactions?refund=success`)
      } else {
        showAlert(
          lang === "EN" ? "Refund Failed" : "Refund Gagal",
          data?.detail || (lang === "EN" ? "Failed to create refund." : "Gagal jana refund."),
          "error"
        )
      }
    } catch (err) {
      console.error("Refund error:", err)
      showAlert(
        lang === "EN" ? "Refund Failed" : "Refund Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to create refund." : "Gagal jana refund."),
        "error"
      )
    } finally {
      setRefunding(false)
    }
  }

  const inferEditItemsFromDescription = (description: string): EditItem[] => {
    const cleaned = description.replace(/\s+/g, " ").trim()
    const match = cleaned.match(/^(.+?)\s+(\d+(?:\.\d{1,2})?)\s*(?:x|×|@)\s*(?:rm\s*)?(\d+(?:\.\d{1,2})?)(?:\s+.*)?$/i)
    if (!match) return []
    return [{
      name: match[1].trim(),
      quantity: match[2],
      unit_price: match[3],
    }]
  }

  const editItemsTotal = editItems.reduce((sum, item) => {
    const quantity = Number.parseFloat(item.quantity || "0")
    const unitPrice = Number.parseFloat(item.unit_price || "0")
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return sum
    return sum + Math.max(0, quantity) * Math.max(0, unitPrice)
  }, 0)
  const itemManagerActive = editItems.length > 0

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editForm.type !== "income" && ((!itemManagerActive && !editForm.description) || (!itemManagerActive && !editForm.amount) || (itemManagerActive && !editItems.some(item => item.name.trim())))) return

    setSaving(true)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/transactions/${txnId}`, {        credentials: "include",
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          type: editForm.type,
          amount: editForm.type === "income" ? parseFloat(editForm.amount) : (itemManagerActive ? editItemsTotal : parseFloat(editForm.amount)),
          vendor_or_source: editForm.type === "income" ? editForm.description : (editForm.description.startsWith("SUBX ") ? editForm.description : (itemManagerActive ? editItems.filter(item => item.name.trim()).map(item => item.name.trim()).join(", ").slice(0, 50) : editForm.description)),
          txn_date: editForm.date,
          txn_time: editForm.time || null,
          notes: editForm.notes || null,
          category_id: editForm.category_id ? parseInt(editForm.category_id) : null,
          wallet_id: editForm.wallet_id ? parseInt(editForm.wallet_id) : null,
          subscription_id: linkedSubscriptionId ? parseInt(linkedSubscriptionId) : null,
          items: editForm.type === "income" ? null : (itemManagerActive
            ? editItems
                .filter(item => item.name.trim())
                .map(item => {
                  const quantity = Math.max(0, Number.parseFloat(item.quantity || "0"))
                  const unitPrice = Math.max(0, Number.parseFloat(item.unit_price || "0"))
                  const subtotal = Number((quantity * unitPrice).toFixed(2))
                  return {
                    name: item.name.trim(),
                    quantity,
                    unit_price: unitPrice,
                    subtotal,
                  }
                })
            : [])
        })
      })
      if (res.ok) {
        if (editFile) {
          const formData = new FormData()
          formData.append("file", editFile)
          try {
            await fetch(`/api/transactions/${txnId}/attachments`, {
              credentials: "include",
              method: "POST",
              headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
              body: formData
            })
          } catch (err) {
            console.error("Attachment upload error during edit:", err)
            showAlert(
              lang === "EN" ? "Updated with Warning" : "Dikemaskini Dengan Amaran",
              lang === "EN"
                ? "Transaction updated, but attachment upload failed."
                : "Transaksi berjaya dikemaskini, tetapi muat naik lampiran gagal.",
              "warning"
            )
          }
        }
        try {
          await fetch(`/api/transactions/${txnId}/loan-link`, {
            method: "PUT",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { "Authorization": `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ loan_id: linkedLoanId ? Number(linkedLoanId) : null })
          })
        } catch (loanLinkErr) {
          console.error("Loan link update error:", loanLinkErr)
        }
        setSaveSuccess(true)
        showAlert(
          lang === "EN" ? "Updated" : "Berjaya Dikemaskini",
          lang === "EN" ? "Transaction updated successfully." : "Transaksi berjaya dikemaskini.",
          "success"
        )
        setTimeout(() => {
          setShowEditModal(false)
          setSaveSuccess(false)
          setEditFile(null)
          fetchTransaction()
        }, 1200)
      } else {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData?.detail || (lang === "EN" ? "Failed to update transaction." : "Gagal kemaskini transaksi."))
      }
    } catch (err) {
      console.error("Edit error:", err)
      showAlert(
        lang === "EN" ? "Update Failed" : "Kemaskini Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to update transaction." : "Gagal kemaskini transaksi."),
        "error"
      )
    } finally {
      setSaving(false)
    }
  }

  const getSourceChannelLabel = (channel: string | null) => {
    switch (channel) {
      case "chat": return langT.sourceWebChat
      case "whatsapp": return langT.sourceWhatsappBot
      case "whatsapp_group": return langT.sourceWhatsappGroupBot
      case "web": return langT.sourcePortalWeb
      case "vehicle": return lang === "BM" ? "My Vehicle" : "My Vehicle"
      default: return channel || langT.sourceUnknown
    }
  }

  const formatBytes = (bytes: number | null) => {
    if (!bytes || bytes <= 0) return "—"
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const openAttachment = async (attachment: NonNullable<TransactionDetail["attachments"]>[number]) => {
    setOpeningAttachmentId(attachment.id)
    try {
      const isPdf = isPdfAttachment(attachment.mime_type, attachment.file_name)
      if (isPdf) {
        if (attachment.direct_url) {
          window.open(attachment.direct_url, "_blank", "noopener,noreferrer")
          return
        }
        const token = getAccessToken()
        const proxyUrl = normalizeAttachmentProxyUrl(attachment.proxy_url)
        const res = await fetch(proxyUrl, {
          credentials: "include",
          headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        })
        if (res.ok) {
          const blob = await res.blob()
          const pdfBlob = new Blob([blob], { type: "application/pdf" })
          const blobUrl = URL.createObjectURL(pdfBlob)
          window.open(blobUrl, "_blank", "noopener,noreferrer")
          return
        }
      }
      const objectUrl = await getAttachmentBlobUrl(attachment)
      window.open(objectUrl, "_blank", "noopener,noreferrer")
    } catch (err) {
      console.error("Open attachment error:", err)
      showAlert(
        lang === "EN" ? "Open Failed" : "Buka Gagal",
        langT.openAttachmentError,
        "error"
      )
    } finally {
      setOpeningAttachmentId(null)
    }
  }

  const requestDeleteAttachment = (attachment: NonNullable<TransactionDetail["attachments"]>[number]) => {
    setAttachmentToDelete(attachment)
  }

  const deleteAttachment = async () => {
    const attachment = attachmentToDelete
    if (!attachment) return
    const token = getAccessToken()

    setDeletingAttachmentId(attachment.id)
    try {
      const res = await fetch(`/api/attachments/${attachment.id}`, {
        credentials: "include",
        method: "DELETE",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData?.detail || (lang === "EN" ? "Failed to delete attachment." : "Gagal buang lampiran."))
      }

      const existingUrl = attachmentObjectUrlRef.current[attachment.id]
      if (existingUrl && existingUrl.startsWith("blob:")) {
        URL.revokeObjectURL(existingUrl)
      }
      delete attachmentObjectUrlRef.current[attachment.id]
      setAttachmentObjectUrls({ ...attachmentObjectUrlRef.current })
      setTxn((prev) => prev ? {
        ...prev,
        attachments: (prev.attachments || []).filter((item) => item.id !== attachment.id),
      } : prev)
      setAttachmentToDelete(null)
      showAlert(
        lang === "EN" ? "Attachment Removed" : "Lampiran Dibuang",
        lang === "EN" ? "Attachment removed from transaction." : "Lampiran berjaya dibuang dari transaksi.",
        "success"
      )
    } catch (err) {
      console.error("Delete attachment error:", err)
      showAlert(
        lang === "EN" ? "Delete Failed" : "Buang Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to delete attachment." : "Gagal buang lampiran."),
        "error"
      )
    } finally {
      setDeletingAttachmentId(null)
    }
  }


  const fetchReceiptAttachmentBlob = async (attachment: NonNullable<TransactionDetail["attachments"]>[number]) => {
    const token = getAccessToken()
    const proxyUrl = normalizeAttachmentProxyUrl(attachment.proxy_url)
    const fetchCandidates = [proxyUrl]
    if (attachment.direct_url) fetchCandidates.push(attachment.direct_url)

    let lastError: unknown = null
    for (const url of fetchCandidates) {
      try {
        const headers: HeadersInit = url.startsWith("/api") || url.startsWith("/attachments/")
          ? { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
          : {}
        const res = await fetch(url, { headers })
        if (!res.ok) throw new Error(`Failed to fetch receipt image (${res.status})`)
        return await res.blob()
      } catch (err) {
        lastError = err
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Failed to fetch receipt image")
  }

  const buildReceiptAttachmentImages = async () => {
    const currentTxn = txn
    if (!currentTxn?.attachments?.length) return []

    const imageAttachments = currentTxn.attachments.filter((attachment) => isImageAttachment(attachment.mime_type))
    const images: ReceiptPdfImage[] = []

    for (const attachment of imageAttachments) {
      try {
        const blob = await fetchReceiptAttachmentBlob(attachment)
        images.push(await convertBlobToReceiptImage(blob, attachment.file_name || `attachment-${attachment.id}.jpg`))
      } catch (err) {
        console.warn("Receipt image embed skipped:", err)
      }
    }

    return images
  }

  const downloadStandardReceipt = async () => {
    if (!txn) return

    setReceiptDownloading(true)
    try {
      const receiptNo = txn.reference_id || `TXN-${txn.id}`
      const transactionTitle = txnDisplay.title || txn.vendor_or_source || "Transaction"
      const accountName = userProfile?.name || userProfile?.email || (lang === "BM" ? "Pemilik Akaun" : "Account Holder")
      const txnTimeStr = txn.txn_time ? String(txn.txn_time).slice(0, 5) : ""
      const transactionDate = txn.txn_date ? (() => {
        try {
          const rawDate = txn.txn_date
          const dateStr = rawDate.includes("Z") || rawDate.includes("+") ? rawDate : (rawDate.includes("T") || rawDate.includes(" ") ? `${rawDate.replace(" ", "T")}Z` : `${rawDate}T00:00:00Z`)
          const fmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: timezone }).format(new Date(dateStr))
          if (txnTimeStr) {
            const [h, m] = txnTimeStr.split(":").map(Number)
            const tm = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: timeFormat === "12h", timeZone: "UTC" }).format(new Date(Date.UTC(1970, 0, 1, h, m)))
            return `${fmt} · ${tm}`
          }
          return fmt
        } catch {
          return txn.txn_date
        }
      })() : "-"
      const formatPdfMoney = (value: number) => `RM ${Number(value || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      const formatPdfQty = (value: number) => {
        const qty = Number(value || 1)
        return Number.isInteger(qty) ? String(qty) : qty.toLocaleString(locale, { maximumFractionDigits: 2 })
      }
      const pdfReceiptItems = txn.items?.length
        ? txn.items
        : [{ id: 0, name: transactionTitle, quantity: 1, unit_price: txn.amount, subtotal: txn.amount, sort_order: 0 }]
      const amountText = formatPdfMoney(txn.amount)
      const pdfNotes = cleanReceiptNotes(txn.notes)
      const sourceLabel = getSourceChannelLabel(txn.source_channel)
      const originalReceiptNote = lang === "BM"
        ? "Simpan resit cukai/invois asal peniaga jika diperlukan untuk tuntutan atau audit."
        : "Keep the original merchant tax invoice/receipt where required for claim or audit."
      const validationNote = lang === "BM"
        ? "Dokumen ini tidak mempunyai UUID/QR LHDN kerana transaksi belum dihantar dan disahkan melalui MyInvois."
        : "This document has no LHDN UUID/QR because the transaction has not been submitted and validated through MyInvois."

      const ops: string[] = []
      const text = (value: unknown, x: number, y: number, size = 10, font = "F1", color = "0 0 0") => {
        ops.push(`BT ${color} rg /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`)
      }
      const line = (x1: number, y1: number, x2: number, y2: number, color = "0.75 0.75 0.75", width = 0.8) => {
        ops.push(`${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`)
      }
      const rect = (x: number, y: number, w: number, h: number, color = "0.96 0.96 0.96") => {
        ops.push(`${color} rg ${x} ${y} ${w} ${h} re f`)
      }
      const receiptLeft = 166
      const receiptRight = 429
      const receiptCenter = 297.5
      const approximateTextWidth = (value: unknown, size = 10) => sanitizeReceiptText(value).length * size * 0.55
      const centerText = (value: unknown, y: number, size = 10, font = "F1", color = "0 0 0") => {
        text(value, receiptCenter - approximateTextWidth(value, size) / 2, y, size, font, color)
      }
      const rightText = (value: unknown, y: number, size = 9.5, font = "F1", color = "0 0 0") => {
        text(value, receiptRight - approximateTextWidth(value, size), y, size, font, color)
      }
      const rowText = (label: string, value: unknown, y: number, size = 9.5, font = "F1") => {
        text(label, receiptLeft, y, size, font)
        rightText(value, y, size, font)
      }

      rect(146, 42, 303, 762, "0.995 0.985 0.955")
      line(146, 804, 449, 804, "0.82 0.82 0.82", 0.6)
      line(146, 42, 449, 42, "0.82 0.82 0.82", 0.6)

      let receiptY = 780
      centerText(accountName.toUpperCase(), receiptY, 15, "F2")
      receiptY -= 18
      centerText(lang === "BM" ? "REKOD TRANSAKSI" : "TRANSACTION RECEIPT", receiptY, 9, "F2", "0.35 0.35 0.35")
      receiptY -= 14
      centerText(receiptNo, receiptY, 9, "F1", "0.35 0.35 0.35")
      receiptY -= 20
      centerText("--------------------------------------", receiptY, 8.5, "F1", "0.35 0.35 0.35")
      receiptY -= 17

      rowText(lang === "BM" ? "KATEGORI" : "CATEGORY", getTransactionCategoryLabel(txn, langT.other), receiptY, 9.5, "F2")
      receiptY -= 14
      rowText(lang === "BM" ? "TARIKH" : "DATE", transactionDate, receiptY)
      receiptY -= 14
      rowText("STATUS", txn.type === "income" ? "INCOME" : "EXPENSE", receiptY, 9.5, "F2")
      receiptY -= 14
      rowText(lang === "BM" ? "CARA SIMPAN" : "SAVED VIA", sourceLabel, receiptY)
      receiptY -= 14
      rowText("WALLET", txn.wallet_name || langT.walletCash, receiptY)
      receiptY -= 20
      centerText("--------------------------------------", receiptY, 8.5, "F1", "0.35 0.35 0.35")
      receiptY -= 17

      if (pdfNotes) {
        text("NOTES", receiptLeft, receiptY, 8.7, "F2")
        wrapReceiptText(pdfNotes, 24).slice(0, 2).forEach((lineText, idx) => rightText(lineText, receiptY - idx * 11, 8.7))
        receiptY -= Math.max(0, (wrapReceiptText(pdfNotes, 24).slice(0, 2).length - 1) * 11)
        receiptY -= 20
        centerText("--------------------------------------", receiptY, 8.5, "F1", "0.35 0.35 0.35")
        receiptY -= 17
      }

      text("ITEM", receiptLeft, receiptY, 8.5, "F2", "0.35 0.35 0.35")
      text("QTY", 315, receiptY, 8.5, "F2", "0.35 0.35 0.35")
      rightText("AMT", receiptY, 8.5, "F2", "0.35 0.35 0.35")
      receiptY -= 14
      const visiblePdfItems = pdfReceiptItems.slice(0, 10)
      visiblePdfItems.forEach((item) => {
        const itemName = item.name || transactionTitle
        const itemLines = wrapReceiptText(`${itemName} @ ${formatPdfMoney(item.unit_price)}`, 31).slice(0, 2)
        itemLines.forEach((lineText, idx) => {
          text(lineText.toUpperCase(), receiptLeft, receiptY - idx * 12, 9.2, idx === 0 ? "F2" : "F1")
        })
        text(formatPdfQty(item.quantity), 320, receiptY, 9.2)
        rightText(formatPdfMoney(item.subtotal), receiptY, 9.2, "F2")
        receiptY -= Math.max(24, itemLines.length * 12 + 4)
      })
      if (pdfReceiptItems.length > visiblePdfItems.length) {
        text(`+${pdfReceiptItems.length - visiblePdfItems.length} ITEMS`, receiptLeft, receiptY, 8.5, "F2", "0.35 0.35 0.35")
        receiptY -= 16
      }
      centerText("--------------------------------------", receiptY, 8.5, "F1", "0.35 0.35 0.35")
      receiptY -= 17

      rowText(lang === "BM" ? "SUBTOTAL" : "SUBTOTAL", amountText, receiptY)
      receiptY -= 17
      centerText("--------------------------------------", receiptY, 8.5, "F1", "0.35 0.35 0.35")
      receiptY -= 19
      text("TOTAL", receiptLeft, receiptY, 13, "F2")
      rightText(`${txn.type === "income" ? "+" : "-"}${amountText}`, receiptY, 13, "F2")
      receiptY -= 24
      centerText("--------------------------------------", receiptY, 8.5, "F1", "0.35 0.35 0.35")
      receiptY -= 17

      centerText(lang === "BM" ? "REKOD SOKONGAN SAHAJA" : "SUPPORTING RECORD ONLY", receiptY, 8.2, "F2", "0.35 0.35 0.35")
      receiptY -= 12
      centerText(lang === "BM" ? "BUKAN e-INVOICE LHDN" : "NOT LHDN e-INVOICE", receiptY, 8.2, "F2", "0.35 0.35 0.35")
      receiptY -= 18
      wrapReceiptText(validationNote, 36).slice(0, 4).forEach((lineText, idx) => text(lineText, receiptLeft, receiptY - idx * 11, 7.6, "F1", "0.35 0.35 0.35"))
      receiptY -= 50
      wrapReceiptText(originalReceiptNote, 36).slice(0, 3).forEach((lineText, idx) => text(lineText, receiptLeft, receiptY - idx * 11, 7.6, "F1", "0.35 0.35 0.35"))
      receiptY -= 42

      centerText("||||| || ||| |||| || | |||||", Math.max(receiptY, 105), 12, "F2")
      centerText(lang === "BM" ? "TERIMA KASIH" : "THANK YOU", Math.max(receiptY - 20, 85), 9.5, "F2")

      const attachmentImages = await buildReceiptAttachmentImages()
      const pdfBlob = createPdfBlob(ops.join("\n"), attachmentImages)
      const objectUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = `${sanitizeReceiptText(receiptNo).replace(/[^a-zA-Z0-9_-]+/g, "-")}-receipt.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200)
      showAlert(
        lang === "EN" ? "Receipt Downloaded" : "Resit Dimuat Turun",
        lang === "EN"
          ? "The structured transaction receipt has been generated."
          : "Resit transaksi berstruktur telah dijana.",
        "success"
      )
    } catch (err) {
      console.error("Receipt PDF error:", err)
      showAlert(
        lang === "EN" ? "Receipt Failed" : "Resit Gagal",
        lang === "EN"
          ? "Unable to generate the receipt. Please try again."
          : "Tak dapat jana resit. Sila cuba lagi.",
        "error"
      )
    } finally {
      setReceiptDownloading(false)
    }
  }

  if (!txn) {
    if (loading) {
      // Initial load: show a skeleton so no raw text flashes before data arrives.
      const pendingTitle = lang === "BM" ? "Butiran Transaksi" : "Transaction Details"
      return (
        <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
          <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
            <MobilePageHeader
              title={pendingTitle}
              fallbackHref={`/${sessionId}/transactions`}
              backPreferHistory
            />
          </div>
          <DesktopPageHeader
            title={pendingTitle}
            breadcrumbs={[{ label: langT.transactions, href: `/${sessionId}/transactions` }]}
            homeHref={`/${sessionId}`}
            backHref={`/${sessionId}/transactions`}
            backPreferHistory
            className="hidden md:block"
            actions={
              <>
                <DesktopPageAction
                  onClick={downloadStandardReceipt}
                  disabled={receiptDownloading || true}
                  variant="solid"
                  aria-label={lang === "BM" ? "Muat turun resit" : "Download receipt"}
                  className="sm:px-2.5"
                >
                  <Download size={16} />
                </DesktopPageAction>
                <DesktopPageAction
                  onClick={() => setShowEditModal(true)}
                  disabled
                  aria-label={langT.editTransaction}
                  className="sm:px-2.5"
                >
                  <Edit3 size={16} />
                </DesktopPageAction>
                <button
                  type="button"
                  disabled
                  className="inline-flex h-8 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2 text-xs font-bold leading-none text-emerald-500 transition active:scale-[0.98] disabled:opacity-40 sm:flex-none sm:px-3 [&_svg]:h-3.5 [&_svg]:w-3.5"
                  aria-label={lang === "BM" ? "Refund transaksi" : "Refund transaction"}
                >
                  <Undo2 size={16} />
                  Refund
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex h-8 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-2 text-xs font-bold leading-none text-rose-500 transition active:scale-[0.98] disabled:opacity-40 sm:flex-none sm:px-3 [&_svg]:h-3.5 [&_svg]:w-3.5"
                  aria-label={langT.delete}
                >
                  <Trash2 size={16} />
                  {langT.delete}
                </button>
              </>
            }
          />
          <DesktopPageBody className="px-1 pb-24 md:px-4 md:pb-16 lg:max-w-7xl">
            <div className="animate-pulse space-y-4">
              <div className="h-40 rounded-2xl bg-[var(--surface-tint)]" />
              <div className="h-64 rounded-2xl bg-[var(--surface-tint)]" />
              <div className="h-40 rounded-2xl bg-[var(--surface-tint)]" />
            </div>
          </DesktopPageBody>
        </div>
      )
    }

    const pendingTitle = error || (lang === "BM" ? "Transaksi" : "Transaction")
    const pendingDesc = error
      ? langT.transactionBackToList
      : (lang === "BM" ? `Rujukan ${txnId}` : `Reference ${txnId}`)

    return (
      <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
        <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
          <MobilePageHeader
            title={pendingTitle}
            fallbackHref={`/${sessionId}/transactions`}
            backPreferHistory
          />
        </div>
        <DesktopPageHeader
          title={pendingTitle}
          breadcrumbs={[{ label: langT.transactions, href: `/${sessionId}/transactions` }]}
          homeHref={`/${sessionId}`}
          backHref={`/${sessionId}/transactions`}
          backPreferHistory
          className="hidden md:block"
        />

        <DesktopPageBody className="px-1 pb-24 md:px-4 md:pb-16 lg:max-w-7xl">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-center">
            {error && (
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10">
                <AlertTriangle size={26} className="text-rose-500" />
              </div>
            )}
            <h2 className="text-base font-semibold text-[var(--text)]">{pendingTitle}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{pendingDesc}</p>
          </div>
        </DesktopPageBody>
      </div>
    )
  }

  const isIncome = txn.type === "income"
  const isWalletTransfer = Boolean(txn.is_wallet_transfer)
  const txnDisplay = splitWalletTaggedDescription(txn.vendor_or_source, txn.wallet_name)
  const cleanReceiptNotes = (value?: string | null) => {
    const raw = (value || "").trim()
    if (!raw) return ""
    const cleaned = splitWalletTaggedDescription(raw, txn.wallet_name).title || raw
    return cleaned
      .replace(/\s{2,}/g, " ")
      .trim()
  }
  const displayNotes = cleanReceiptNotes(txn.notes)
  const locale = lang === "BM" ? "ms-MY" : "en-MY"
  const formattedAmount = txn.amount.toLocaleString(locale, { minimumFractionDigits: 2 })
  const deleteTransactionDesc = langT.deleteTransactionDesc
    .replace("{description}", txn.vendor_or_source)
    .replace("{amount}", formattedAmount)
  const formatReceiptLineAmount = (value: number) => `RM ${Number(value || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const formatReceiptLineQty = (value: number) => {
    const qty = Number(value || 1)
    return Number.isInteger(qty) ? String(qty) : qty.toLocaleString(locale, { maximumFractionDigits: 2 })
  }
  const receiptItems = txn.items?.length
    ? txn.items
    : [{ id: 0, name: txnDisplay.title || txn.vendor_or_source, quantity: 1, unit_price: txn.amount, subtotal: txn.amount, sort_order: 0 }]
  const transactionDateLabel = (() => {
    // Receipt date/time are LOCAL (printed on the receipt) — render as-is, no timezone shift.
    // Fall back to issued/created datetime which IS an instant → convert to user timezone.
    const formatTime = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number)
      if (isNaN(h) || isNaN(m)) return hhmm
      return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: timeFormat === "12h", timeZone: "UTC" }).format(new Date(Date.UTC(1970, 0, 1, h, m)))
    }
    const formatDate = (raw: string) => {
      const [y, mo, dd] = raw.slice(0, 10).split("-").map(Number)
      if (isNaN(y) || isNaN(mo) || isNaN(dd)) return raw
      return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, dd)))
    }
    try {
      if (txn.txn_date && txn.txn_time) {
        return `${formatDate(txn.txn_date)} · ${formatTime(txn.txn_time)}`
      }
      if (txn.txn_date) {
        return formatDate(txn.txn_date)
      }
      if (txn.created_at) {
        const dateStr = txn.created_at.includes("Z") || txn.created_at.includes("+") ? txn.created_at : (txn.created_at.includes("T") || txn.created_at.includes(" ") ? `${txn.created_at.replace(" ", "T")}Z` : `${txn.created_at}T00:00:00Z`)
        return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: timeFormat === "12h", timeZone: timezone }).format(new Date(dateStr))
      }
      return "-"
    } catch {
      return txn.txn_date || "-"
    }
  })()
  const receiptStatusLabel = isIncome ? langT.incomingFunds : langT.outgoingFlow

  const refundButtonState = txn.is_refund || txn.has_been_refunded || isWalletTransfer || txn.is_debt_movement
    ? "hidden"
    : refunding
      ? "loading"
      : "idle"

  const amountClass = isIncome ? "text-emerald-500" : "text-rose-500"
  const badgeClass = isIncome
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
    : "border-rose-500/20 bg-rose-500/10 text-rose-500"

  const transactionDetailTitle = lang === "BM" ? "Butiran Transaksi" : "Transaction Details"

  const summaryCardActions = (
    <>
      <button
        type="button"
        onClick={() => setShowEditModal(true)}
        disabled={saving || !txn}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-[#d4d4d4] underline-offset-4 transition hover:text-[#f5f5f5] hover:underline disabled:opacity-40"
      >
        <Edit3 size={15} />
        {langT.edit}
      </button>
      {refundButtonState !== "hidden" ? (
        <>
          <span className="h-3.5 w-px bg-white/15" aria-hidden />
          <button
            type="button"
            onClick={handleRefundClick}
            disabled={refundButtonState === "loading" || !txn}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-400 underline-offset-4 transition hover:text-emerald-300 hover:underline disabled:opacity-40"
          >
            {refundButtonState === "loading" ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}
            Refund
          </button>
        </>
      ) : null}
      <span className="h-3.5 w-px bg-white/15" aria-hidden />
      <button
        type="button"
        onClick={() => setShowTaxModal(true)}
        disabled={saving || !txn}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-[#d4d4d4] underline-offset-4 transition hover:text-[#f5f5f5] hover:underline disabled:opacity-40"
      >
        <BadgePercent size={15} />
        {lang === "BM" ? "Cukai" : "Tax"}
      </button>
      <span className="h-3.5 w-px bg-white/15" aria-hidden />
      <button
        type="button"
        onClick={() => setShowDeleteModal(true)}
        disabled={saving || !txn}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-400 underline-offset-4 transition hover:text-rose-300 hover:underline disabled:opacity-40"
      >
        <Trash2 size={15} />
        {langT.delete}
      </button>
    </>
  )

  const heroActions = (
    <>
      <DesktopPageAction
        onClick={downloadStandardReceipt}
        disabled={receiptDownloading}
        variant="solid"
        aria-label={lang === "BM" ? "Muat turun resit" : "Download receipt"}
        className="sm:px-2.5"
      >
        {receiptDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
      </DesktopPageAction>
      <DesktopPageAction onClick={() => setShowEditModal(true)} aria-label={langT.editTransaction} className="sm:px-2.5">
        <Edit3 size={16} />
      </DesktopPageAction>
      <DesktopPageAction
        onClick={() => setShowTaxModal(true)}
        aria-label={lang === "BM" ? "Kaitkan dengan cukai" : "Link to tax"}
        className="sm:px-2.5"
      >
        <BadgePercent size={16} />
      </DesktopPageAction>
      {refundButtonState !== "hidden" ? (
        <button
          type="button"
          onClick={handleRefundClick}
          disabled={refundButtonState === "loading"}
          className="inline-flex h-8 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2 text-xs font-bold leading-none text-emerald-500 transition active:scale-[0.98] disabled:opacity-40 sm:flex-none sm:px-3 [&_svg]:h-3.5 [&_svg]:w-3.5"
          aria-label={lang === "BM" ? "Refund transaksi" : "Refund transaction"}
        >
          {refundButtonState === "loading" ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
          Refund
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setShowDeleteModal(true)}
        className="inline-flex h-8 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-2 text-xs font-bold leading-none text-rose-500 transition active:scale-[0.98] sm:flex-none sm:px-3 [&_svg]:h-3.5 [&_svg]:w-3.5"
        aria-label={langT.delete}
      >
        <Trash2 size={16} />
        {langT.delete}
      </button>
    </>
  )

  return (
    <>
      <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
        <TxnHeader
          txn={txn}
          sessionId={sessionId}
          onDownloadReceipt={() => downloadStandardReceipt()}
          downloading={receiptDownloading}
        />
        <DesktopPageHeader
          title={transactionDetailTitle}
          breadcrumbs={[{ label: langT.transactions, href: `/${sessionId}/transactions` }]}
          homeHref={`/${sessionId}`}
          backHref={`/${sessionId}/transactions`}
          backPreferHistory
          className="hidden md:block"
          actions={heroActions}
        />

        <DesktopPageBody className="px-1 pb-24 md:px-4 md:pb-16 lg:max-w-7xl">
          <TxnSummaryCard
            txn={txn}
            transactionDateLabel={transactionDateLabel}
            formattedAmount={formattedAmount}
            amountClass={amountClass}
            badgeClass={badgeClass}
            actions={summaryCardActions}
          />

          {vehicleLink?.vehicle_id ? (
            <Link
              href={`/${sessionId}/vehicle/${vehicleLink.vehicle_id}${
                vehicleLink.kind === "maintenance"
                  ? "?tab=maintenance"
                  : vehicleLink.kind === "fuel"
                    ? "?tab=fuel"
                    : ""
              }`}
              className="mt-3 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 transition active:scale-[0.99] hover:bg-[var(--surface-tint)]/30"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--accent2)]">
                <Car size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                  {lang === "BM" ? "Dari Kenderaan" : "From Vehicle"}
                </span>
                <span className="mt-0.5 block truncate text-sm font-bold text-[var(--text)]">
                  {vehicleLink.vehicle_name || "Vehicle"}
                  {vehicleLink.registration_number
                    ? ` · ${vehicleLink.registration_number}`
                    : ""}
                </span>
                {vehicleLink.label ? (
                  <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--muted)]">
                    {vehicleLink.label}
                  </span>
                ) : null}
              </span>
              <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
            </Link>
          ) : null}

          {splitLoaded ? (
            splitBill ? (
              <Link
                href={`/${sessionId}/split-bills`}
                className="mt-3 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 transition active:scale-[0.99] hover:bg-[var(--surface-tint)]/30"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--accent)]">
                  <Users size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                    {lang === "BM" ? "Split Bill" : "Split Bill"}
                  </span>
                  <span className="mt-0.5 block truncate text-sm font-bold text-[var(--text)]">{splitBill.title}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-[var(--muted)]">
                    {splitBill.status === "completed"
                      ? (lang === "BM" ? "Selesai" : "Completed")
                      : splitBill.balance_amount > 0
                        ? `${lang === "BM" ? "Baki" : "Balance"}: ${splitBill.currency || "RM"} ${splitBill.balance_amount.toFixed(2)}`
                        : (lang === "BM" ? "Separa" : "Partial")}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
              </Link>
            ) : (
              <Link
                href={`/${sessionId}/split-bills?create=1&txn=${txn?.id}`}
                className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-3.5 transition active:scale-[0.99] hover:bg-[var(--surface-tint)]/30"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)]">
                  <Users size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                    {lang === "BM" ? "Split Bill" : "Split Bill"}
                  </span>
                  <span className="mt-0.5 block text-sm font-bold text-[var(--text)]">
                    {lang === "BM" ? "Buat Split Bill" : "Create Split Bill"}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-[var(--muted)]">
                    {lang === "BM" ? "Bahagi bil dengan rakan" : "Split this bill with friends"}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
              </Link>
            )
          ) : null}

          {/* Barang Saya: offer to record this purchase as an item (expense, non-transfer, user opt-in) */}
          {txn && txn.type === "expense" && !isWalletTransfer && !txn.is_debt_movement && !txn.is_refund && !invAdded ? (
            <button
              type="button"
              onClick={addTxnToInventory}
              disabled={invAdding}
              className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-3.5 text-left transition active:scale-[0.99] hover:bg-[var(--surface-tint)]/30 disabled:opacity-50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
                {invAdding ? <Loader2 size={18} className="animate-spin" /> : <Package size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                  {lang === "BM" ? "Barang Saya" : "My Inventory"}
                </span>
                <span className="mt-0.5 block text-sm font-bold text-[var(--text)]">
                  {lang === "BM" ? "Tambah ke Barang Saya" : "Add to My Inventory"}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-[var(--muted)]">
                  {lang === "BM" ? "Rekod pembelian ini sebagai barang" : "Record this purchase as an item"}
                </span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
            </button>
          ) : invAdded ? (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
                <Package size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[var(--text)]">
                  {lang === "BM" ? "Ditambah ke Barang Saya" : "Added to My Inventory"}
                </span>
              </span>
              <Link href={`/${sessionId}/inventory`} className="shrink-0 text-xs font-bold text-[var(--accent)] hover:underline">
                {lang === "BM" ? "Lihat" : "View"}
              </Link>
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
            {/* Left Column */}
            <div className="w-full space-y-5 lg:min-w-0">
              <TxnDetailsList
                txn={txn}
                transactionDateLabel={transactionDateLabel}
                statusLabel={receiptStatusLabel}
                sourceChannelLabel={getSourceChannelLabel(txn.source_channel)}
                categoryLabel={getTransactionCategoryLabel(txn, langT.other)}
                walletLabel={txn.wallet_name || langT.walletCash}
                displayNotes={displayNotes}
                merchantLabel={txnDisplay.title || txn.vendor_or_source}
              />
              <TxnItemsTable
                txn={txn}
                receiptItems={receiptItems}
                showDataSkeleton={loading}
                formatReceiptLineAmount={formatReceiptLineAmount}
                formatReceiptLineQty={formatReceiptLineQty}
              />
            </div>

            {/* Right Column */}
            <TxnAttachmentsPanel
              txn={txn}
              attachmentObjectUrls={attachmentObjectUrls}
              deletingAttachmentId={deletingAttachmentId}
              onOpen={openAttachment}
              onRequestDelete={requestDeleteAttachment}
              onRetryLoad={getAttachmentBlobUrl}
              formatBytes={formatBytes}
              isImageAttachment={isImageAttachment}
              isPdfAttachment={isPdfAttachment}
            />
          </div>
        </DesktopPageBody>
      </div>

      <TxnDeleteModal
        open={showDeleteModal}
        title={langT.deleteTransactionTitle}
        description={deleteTransactionDesc}
        deleting={deleting}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
      />

      <TxnRefundModal
        open={showRefundModal}
        vendorOrSource={txn.vendor_or_source}
        originalAmount={txn.amount}
        refundAmount={refundAmount}
        refunding={refunding}
        onAmountChange={(value) => {
          const v = value.replace(/,/g, ".").replace(/[^0-9.]/g, "")
          const parts = v.split(".")
          setRefundAmount(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : v)
        }}
        onClose={() => setShowRefundModal(false)}
        onConfirm={handleRefund}
      />

      <TaxLinkSheet
        open={showTaxModal}
        transactionId={txn?.id ?? 0}
        transactionAmount={txn?.amount ?? 0}
        categoryLabel={getTransactionCategoryLabel(txn, "")}
        onClose={() => setShowTaxModal(false)}
        onSaved={() => {}}
      />

      <TxnEditSheet
        open={showEditModal}
        categories={categories}
        wallets={wallets}
        loans={loans}
        subscriptions={subscriptions}
        editForm={editForm}
        editItems={editItems}
        linkedLoanId={linkedLoanId}
        linkedSubscriptionId={linkedSubscriptionId}
        saving={saving}
        saveSuccess={saveSuccess}
        onEditFormChange={(next) => setEditForm((f) => ({ ...f, ...next }))}
        onEditItemsChange={setEditItems}
        onLinkedLoanIdChange={setLinkedLoanId}
        onLinkedSubscriptionIdChange={setLinkedSubscriptionId}
        onEditFileChange={setEditFile}
        editFile={editFile}
        onSubmit={handleEdit}
        onClose={() => { setShowEditModal(false); setEditFile(null) }}
      />

      {attachmentToDelete && (
 <div className="fixed inset-0 z-[70] flex items-center justify-center bg-transparent animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
              <Trash2 size={24} />
            </div>
            <div className="text-center">
              <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">
                {lang === "EN" ? "Remove Attachment?" : "Buang Lampiran?"}
              </h3>
              <p className="mb-1 text-sm font-medium leading-relaxed text-[var(--muted)]">
                {lang === "EN" ? "This image/file will be removed from this transaction." : "Gambar/fail ini akan dibuang dari transaksi ini."}
              </p>
              <p className="mx-auto mb-5 max-w-[15rem] truncate text-xs text-[var(--muted)]">
                {attachmentToDelete.file_name}
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setAttachmentToDelete(null)}
                disabled={deletingAttachmentId === attachmentToDelete.id}
                className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-tint-strong)] disabled:opacity-60"
              >
                {langT.cancel}
              </button>
              <button
                onClick={deleteAttachment}
                disabled={deletingAttachmentId === attachmentToDelete.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition-colors hover:bg-red-600 disabled:opacity-60"
              >
                {deletingAttachmentId === attachmentToDelete.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={15} />}
                {lang === "EN" ? "Remove" : "Buang"}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertModal}
    </>
  )
}
