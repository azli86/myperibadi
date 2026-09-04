"use client"

import { getAccessToken } from "@/lib/auth-session"
import React, { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import {
  Send,
  Plus,
  Camera,
  Loader2,
  X,
  ImageIcon,
  FileText,
  ShieldCheck,
  MapPin,
  MessageSquare,
  Menu,
  LayoutDashboard,
  Receipt,
  MapPinned,
  HandCoins,
  Wallet,
  CreditCard,
  Grid2X2,
  Bot,
  Settings,
  Sparkle,
  Mic,
  type LucideIcon,
} from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { SmartImage } from "@/components/ui/SmartImage"
import Calculator from "@/components/calculator/Calculator"
import ChatRichMessage, { type ChatAction } from "@/components/chat/ChatRichMessage"
import TxnFxOverlay, { detectTxnFx, type TxnFxKind } from "@/components/chat/TxnFxOverlay"
import { useLang } from "@/lib/lang"
import { useTheme } from "@/components/theme/ThemeProvider"
import { usePageAlert } from "@/hooks/usePageAlert"
import { SHARED_CHAT_TOKEN_QUERY_KEY } from "@/lib/share-target"

type ChatRole = "user" | "bot"

type ChatAttachment = {
  id: number
  file_name: string
  mime_type?: string | null
  size_bytes?: number | null
  proxy_url: string
}

const normalizeAttachmentProxyUrl = (rawUrl: string): string => {
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
    return rawUrl
  }
}

type ChatApiMessage = {
  id: number
  role: ChatRole
  text?: string | null
  source_channel: string
  file_name?: string | null
  mime_type?: string | null
  size_bytes?: number | null
  attachment?: ChatAttachment | null
  created_at: string
}

type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  createdAt: number
  fileName?: string
  fileType?: string
  previewUrl?: string
}

type CommandItem = {
  command: string
  insert: string
  labelBM: string
  labelEN: string
  hintBM: string
  hintEN: string
}

type ChatMenuItem = {
  name: string
  href: string
  subtitle: string
  icon: LucideIcon
}

const COMMAND_ITEMS: CommandItem[] = [
  { command: "help", insert: "help", labelBM: "Bantuan bot", labelEN: "Bot help", hintBM: "Tunjuk panduan command ringkas.", hintEN: "Show a short command guide." },
  { command: "summary", insert: "summary", labelBM: "Ringkasan bulan", labelEN: "Monthly summary", hintBM: "Pendapatan, belanja dan baki bulan semasa.", hintEN: "Income, expenses and current month balance." },
  { command: "list", insert: "list", labelBM: "Transaksi terbaru", labelEN: "Recent transactions", hintBM: "Papar rekod transaksi terkini.", hintEN: "Show the latest transaction records." },
  { command: "checkwallet", insert: "checkwallet", labelBM: "Semak wallet", labelEN: "Check wallets", hintBM: "Papar baki setiap wallet dan jumlah keseluruhan.", hintEN: "Show every wallet balance and total balance." },
  { command: "budget set <kategori> <jumlah>", insert: "budget set ", labelBM: "Set bajet", labelEN: "Set budget", hintBM: "Contoh: budget set makanan 600.", hintEN: "Example: budget set food 600." },
  { command: "budget list", insert: "budget list", labelBM: "Senarai bajet", labelEN: "Budget list", hintBM: "Lihat semua bajet aktif.", hintEN: "View all active budgets." },
  { command: "budget summary", insert: "budget summary", labelBM: "Ringkasan bajet", labelEN: "Budget summary", hintBM: "Ringkasan bajet bulanan ikut kategori.", hintEN: "Monthly budget summary by category." },
  { command: "budget baki <kategori>", insert: "budget baki ", labelBM: "Baki bajet kategori", labelEN: "Category budget balance", hintBM: "Semak baki bajet satu kategori.", hintEN: "Check budget balance for one category." },
  { command: "budget delete <kategori> @YYYY-MM", insert: "budget delete ", labelBM: "Padam bajet", labelEN: "Delete budget", hintBM: "Padam bajet kategori untuk bulan tertentu.", hintEN: "Delete a category budget for a month." },
  { command: "lend <nama> <amaun>", insert: "lend ", labelBM: "Orang hutang kita", labelEN: "Money lent out", hintBM: "Rekod duit yang orang hutang kita.", hintEN: "Record money someone owes you." },
  { command: "borrow <nama> <amaun>", insert: "borrow ", labelBM: "Kita hutang orang", labelEN: "Money borrowed", hintBM: "Rekod duit yang kita hutang orang.", hintEN: "Record money you owe someone." },
  { command: "debt list", insert: "debt list", labelBM: "Senarai hutang", labelEN: "Debt list", hintBM: "Papar semua baki hutang aktif.", hintEN: "Show all active debt balances." },
  { command: "debtcmd", insert: "debtcmd", labelBM: "Panduan hutang", labelEN: "Debt guide", hintBM: "Papar command hutang dalam chat.", hintEN: "Show debt commands in chat." },
  { command: "transfer <jumlah> <wallet A> <wallet B>", insert: "transfer ", labelBM: "Transfer wallet", labelEN: "Wallet transfer", hintBM: "Pindah duit antara wallet.", hintEN: "Move money between wallets." },
  { command: "pindah <jumlah> <wallet A> <wallet B>", insert: "pindah ", labelBM: "Pindah wallet", labelEN: "Malay wallet transfer", hintBM: "Versi BM untuk transfer wallet.", hintEN: "Malay version of wallet transfer." },
  { command: "lang bm", insert: "lang bm", labelBM: "Bahasa Melayu", labelEN: "Malay replies", hintBM: "Tukar reply bot kepada BM.", hintEN: "Switch bot replies to Malay." },
  { command: "lang en", insert: "lang en", labelBM: "Bahasa Inggeris", labelEN: "English replies", hintBM: "Tukar reply bot kepada English.", hintEN: "Switch bot replies to English." },
  { command: "loanx list", insert: "loanx list", labelBM: "Senarai loan", labelEN: "Loan list", hintBM: "Papar loan aktif dan baki bulan.", hintEN: "Show active loans and months left." },
  { command: "loanx add <nama> <jumlah> <bulanan>", insert: "loanx add ", labelBM: "Tambah loan", labelEN: "Add loan", hintBM: "Contoh: loanx add kereta 12000 500.", hintEN: "Example: loanx add car 12000 500." },
  { command: "loanx pay <nama> <jumlah>", insert: "loanx pay ", labelBM: "Bayar loan", labelEN: "Pay loan", hintBM: "Bayar ansuran loan.", hintEN: "Pay loan installment." },
  { command: "loanx", insert: "loanx", labelBM: "Panduan loan", labelEN: "Loan guide", hintBM: "Papar command loan.", hintEN: "Show loan commands." },
  { command: "subx <nama> <jumlah> <day>HB", insert: "subx ", labelBM: "Simpan langganan", labelEN: "Save subscription", hintBM: "Simpan langganan bulanan dengan due day.", hintEN: "Save monthly subscription with due day." },
  { command: "subx pay <nama> <jumlah> <wallet>", insert: "subx pay ", labelBM: "Bayar langganan", labelEN: "Pay subscription", hintBM: "Bayar langganan & rekod transaksi ke wallet.", hintEN: "Pay subscription & record transaction to wallet." },
  { command: "pinx", insert: "pinx", labelBM: "Panduan pinx", labelEN: "Pinx guide", hintBM: "Simpan tempat ke My Places.", hintEN: "Save a place to My Places." },
  { command: "pinx <title> <kategori> @here", insert: "pinx ", labelBM: "Simpan tempat", labelEN: "Save place", hintBM: "Contoh: pinx house maksu family @here", hintEN: "Example: pinx house maksu family @here" },
  { command: "@here", insert: "@here", labelBM: "Lampir lokasi semasa", labelEN: "Attach current location", hintBM: "Hantar lokasi semasa bersama mesej.", hintEN: "Send current location with the message." },
]

const QUICK_COMMANDS = ["summary", "list", "checkwallet", "budget summary", "lang bm", "lang en"]
const HERE_LOCATION_PATTERN = /(^|\s)@here\b/i
const SUPPORTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
const IMAGE_PICKER_ACCEPT = SUPPORTED_IMAGE_MIME_TYPES.join(",")
const SUPPORTED_IMAGE_EXTENSION = /\.(jpe?g|png|webp)$/i


function decodeSharedHeaderValue(value: string | null): string {
  if (!value) return ""
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

type DirectReceiptUpload = {
  upload_url: string
  object_key: string
  content_type: string
  file_name: string
  size_bytes: number
}

function getSupportedImageContentType(file: File): string | null {
  if (SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) return file.type
  const extension = file.name.toLowerCase().split(".").pop()
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg"
  if (extension === "png") return "image/png"
  if (extension === "webp") return "image/webp"
  return null
}

function isSupportedImageFile(file: File): boolean {
  if (file.type.startsWith("video/")) return false
  return !!getSupportedImageContentType(file) || SUPPORTED_IMAGE_EXTENSION.test(file.name)
}

function sanitizeIncomingBotText(value: unknown): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
}

/** Camera/gallery sometimes omits file.type; give API a real image mime when we can. */
function normalizeReceiptFile(file: File): File {
  const known = getSupportedImageContentType(file)
  if (known && file.type === known) return file
  if (known) {
    return new File([file], file.name || "receipt.jpg", { type: known })
  }
  return file
}

function extractTxnRefFromText(value: string): string | null {
  const m = (value || "").match(/\b(TXN\d{2}-[A-Z0-9]{6})\b/i)
  return m ? m[1].toUpperCase() : null
}

function textLooksLikeNewExpense(value: string): boolean {
  // Rough client-side check: has digits that could be an amount (not TXN-only).
  const t = (value || "").trim()
  if (!t) return false
  if (/^TXN\d{2}-[A-Z0-9]{6}$/i.test(t)) return false
  return /\d/.test(t)
}

async function uploadReceiptDirectToR2(file: File, token: string | null): Promise<DirectReceiptUpload> {
  const contentType = getSupportedImageContentType(file)
  if (!contentType) {
    throw new Error("Unsupported receipt image type.")
  }

  const presignRes = await fetch("/api/chat/uploads/presign", {
    credentials: "include",
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_name: file.name || "receipt.jpg",
      content_type: contentType,
      size_bytes: file.size,
    }),
  })
  const presignData = await presignRes.json().catch(() => ({}))
  if (!presignRes.ok) {
    throw new Error(presignData?.detail || `Upload URL failed (${presignRes.status})`)
  }

  const upload = presignData as DirectReceiptUpload
  // Direct browser PUT to R2 often fails with CORS / network ("Failed to fetch").
  // Callers should catch and fall back to multipart file upload via /api/chat/message.
  const uploadRes = await fetch(upload.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": upload.content_type,
      "Content-Disposition": "inline",
    },
    body: file,
  })
  if (!uploadRes.ok) {
    throw new Error(`R2 upload failed (${uploadRes.status})`)
  }

  return upload
}

function parseApiTimestamp(rawDate: string): number {
  if (!rawDate) return Date.now()

  try {
    const normalized = rawDate.includes("Z") || /[+-]\d{2}:\d{2}$/.test(rawDate)
      ? rawDate
      : `${rawDate}Z`
    return new Date(normalized).getTime()
  } catch {
    return Date.now()
  }
}

function createIntroMessage(lang: string): ChatMessage {
  return {
    id: "intro",
    role: "bot",
    text:
      lang === "EN"
        ? "Hi! I am MyPeribadi.\nUse me to save expenses directly to your portal.\n\n*Basic Commands:*\n-Lunch 10 : Save RM10\n-summary : Monthly summary\n-list : Last 5 records\n-checkwallet : Wallet balances"
        : "Hai! Saya MyPeribadi.\nGuna saya untuk simpan belanja terus ke portal anda.\n\n*Command Asas:*\n-Makan 10 : Simpan RM10\n-summary : Ringkasan bulanan\n-list : 5 rekod terakhir\n-checkwallet : Semak baki dompet",
    createdAt: Date.now(),
  }
}

export default function ChatPage() {
  const { lang } = useLang()
  const params = useParams()
  const searchParams = useSearchParams()
  const sessionId = (params?.sessionId as string) || ""
  const { resolvedTheme } = useTheme()
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [viewportOffsetTop, setViewportOffsetTop] = useState(0)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null)
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false)
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false)
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [txnFxKind, setTxnFxKind] = useState<TxnFxKind | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [errorText, setErrorText] = useState("")
  const [isVoiceRecording, setIsVoiceRecording] = useState(false)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voicePopupOpen, setVoicePopupOpen] = useState(false)
  const [voiceSecs, setVoiceSecs] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceChunksRef = useRef<Blob[]>([])
  const voiceReadyRef = useRef(false)
  const voiceReleaseRef = useRef(false)
  const voiceSubmitRef = useRef(false)
  const voiceHoldRef = useRef(false)

  // Voice hold timer
  useEffect(() => {
    if (!isVoiceRecording) return
    const id = window.setInterval(() => setVoiceSecs((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [isVoiceRecording])
  const { showAlert, alertModal } = usePageAlert(lang)

  const listRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const objectUrlsRef = useRef<string[]>([])
  const pendingTxnAttachRef = useRef<string | null>(null)
  const processedShareTokensRef = useRef<Set<string>>(new Set())
  const isLightTheme = resolvedTheme === "light"
  const slashCommandText = input.trimStart()
  const isSlashCommandInput = slashCommandText.startsWith("/")
  const commandQuery = isSlashCommandInput ? slashCommandText.slice(1).trim().toLowerCase() : ""
  const sharedToken = searchParams.get(SHARED_CHAT_TOKEN_QUERY_KEY) || ""

  const menuItems = useMemo<ChatMenuItem[]>(() => [
    { name: lang === "EN" ? "Dashboard" : "Dashboard", href: `/${sessionId}`, subtitle: lang === "EN" ? "Balance and activity" : "Baki dan aktiviti", icon: LayoutDashboard },
    { name: lang === "EN" ? "Transactions" : "Transaksi", href: `/${sessionId}/transactions`, subtitle: lang === "EN" ? "Income and expense records" : "Rekod masuk dan keluar", icon: Receipt },
    { name: lang === "EN" ? "Map" : "Peta", href: `/${sessionId}/map`, subtitle: lang === "EN" ? "Transaction locations" : "Lokasi transaksi", icon: MapPinned },
    { name: lang === "EN" ? "Debt" : "Hutang", href: `/${sessionId}/debt`, subtitle: lang === "EN" ? "IOU tracker" : "Tracker hutang", icon: HandCoins },
    { name: lang === "EN" ? "Budget" : "Bajet", href: `/${sessionId}/budget`, subtitle: lang === "EN" ? "Monthly category budgets" : "Bajet kategori bulanan", icon: Wallet },
    { name: lang === "EN" ? "Wallet" : "Wallet", href: `/${sessionId}/wallet-settings`, subtitle: lang === "EN" ? "Wallet balances" : "Baki wallet", icon: CreditCard },
    { name: lang === "EN" ? "Categories" : "Kategori", href: `/${sessionId}/categories`, subtitle: lang === "EN" ? "Category and keyword rules" : "Kategori dan keyword", icon: Grid2X2 },
    { name: lang === "EN" ? "Chat" : "Chat", href: `/${sessionId}/chat`, subtitle: lang === "EN" ? "Assistant chat" : "Chat assistant", icon: MessageSquare },
    { name: lang === "EN" ? "WhatsApp" : "WhatsApp", href: `/${sessionId}/whatsapp`, subtitle: lang === "EN" ? "Bot connection" : "Sambungan bot", icon: Bot },
    { name: lang === "EN" ? "Settings" : "Tetapan", href: `/${sessionId}/settings`, subtitle: lang === "EN" ? "Account and system" : "Akaun dan sistem", icon: Settings },
    { name: lang === "EN" ? "Bot Command" : "Command Bot", href: `/${sessionId}/bot-command`, subtitle: lang === "EN" ? "WhatsApp & Telegram commands" : "Command WhatsApp & Telegram", icon: Bot },
  ], [lang, sessionId])

  const commandSuggestions = useMemo(() => {
    if (!commandQuery) return COMMAND_ITEMS
    return COMMAND_ITEMS.filter((item) => {
      const searchable = [item.command, item.insert, item.labelBM, item.labelEN, item.hintBM, item.hintEN].join(" ").toLowerCase()
      return searchable.includes(commandQuery)
    })
  }, [commandQuery])

  const quickCommandItems = useMemo(
    () => COMMAND_ITEMS.filter((item) => QUICK_COMMANDS.includes(item.insert.trim())),
    []
  )

  const canSend = useMemo(() => {
    return !sending && !isTyping && !isLocating && (input.trim().length > 0 || !!selectedFile)
  }, [sending, isTyping, isLocating, input, selectedFile])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, sending, isTyping])

  const resizeComposerTextarea = React.useCallback(() => {
    const el = textareaRef.current
    if (!el) return

    const minHeight = 24
    const maxHeight = 180

    el.style.height = "auto"
    const nextHeight = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight))
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden"
  }, [])

  useEffect(() => {
    resizeComposerTextarea()
  }, [input, resizeComposerTextarea])

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    const token = getAccessToken()

    let active = true

    const loadMessages = async () => {
      try {
        const res = await fetch("/api/chat/messages", {
          credentials: "include",
          headers: {
            ...(token ? { ...(token ? { Authorization: `Bearer ${token}` } : {}) } : {}),
          },
        })
        const data = await res.json().catch(() => [])
        if (!active) return
        if (!res.ok || !Array.isArray(data)) {
          setMessages([createIntroMessage(lang)])
          return
        }

        const mapped = data.map(mapApiMessage).filter(Boolean) as ChatMessage[]
        setMessages(mapped.length > 0 ? mapped : [createIntroMessage(lang)])
      } catch {
        if (active) {
          setMessages([createIntroMessage(lang)])
        }
      }
    }

    void loadMessages()
    return () => {
      active = false
    }
  }, [lang])

  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) return

    const scrollY = window.scrollY
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyOverscroll = document.body.style.overscrollBehavior
    const previousBodyPosition = document.body.style.position
    const previousBodyTop = document.body.style.top
    const previousBodyLeft = document.body.style.left
    const previousBodyRight = document.body.style.right
    const previousBodyWidth = document.body.style.width

    document.documentElement.style.overflow = "hidden"
    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"
    document.body.style.position = "fixed"
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = "0"
    document.body.style.right = "0"
    document.body.style.width = "100%"

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
      document.body.style.overscrollBehavior = previousBodyOverscroll
      document.body.style.position = previousBodyPosition
      document.body.style.top = previousBodyTop
      document.body.style.left = previousBodyLeft
      document.body.style.right = previousBodyRight
      document.body.style.width = previousBodyWidth
      window.scrollTo(0, scrollY)
    }
  }, [])

  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) return

    const viewport = window.visualViewport
    if (!viewport) {
      setViewportHeight(window.innerHeight)
      setViewportOffsetTop(0)
      return
    }

    let frame = 0

    const updateViewport = () => {
      cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        setViewportHeight(Math.round(viewport.height))
        setViewportOffsetTop(Math.max(0, Math.round(viewport.offsetTop)))
      })
    }

    updateViewport()
    viewport.addEventListener("resize", updateViewport)
    viewport.addEventListener("scroll", updateViewport)
    window.addEventListener("orientationchange", updateViewport)

    return () => {
      cancelAnimationFrame(frame)
      viewport.removeEventListener("resize", updateViewport)
      viewport.removeEventListener("scroll", updateViewport)
      window.removeEventListener("orientationchange", updateViewport)
    }
  }, [])

  const registerObjectUrl = (url: string) => {
    objectUrlsRef.current.push(url)
    return url
  }

  const mapApiMessage = (message: ChatApiMessage): ChatMessage | null => {
    if (!message?.id || !message?.role) return null
    const attachmentMime = message.attachment?.mime_type || message.mime_type || undefined
    const attachmentUrl = message.attachment?.proxy_url
    const cleanedText = sanitizeIncomingBotText(message.text || "")
    if (message.role === "bot" && !cleanedText && !attachmentUrl) return null
    return {
      id: String(message.id),
      role: message.role,
      text: cleanedText,
      createdAt: parseApiTimestamp(message.created_at),
      fileName: message.attachment?.file_name || message.file_name || undefined,
      fileType: attachmentMime,
      previewUrl: attachmentUrl && attachmentMime?.startsWith("image/") ? normalizeAttachmentProxyUrl(attachmentUrl) : undefined,
    }
  }

  const clearSelectedFile = () => {
    if (selectedPreviewUrl) {
      URL.revokeObjectURL(selectedPreviewUrl)
      objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== selectedPreviewUrl)
    }
    setSelectedPreviewUrl(null)
    setSelectedFile(null)
    if (cameraInputRef.current) {
      cameraInputRef.current.value = ""
    }
    if (galleryInputRef.current) {
      galleryInputRef.current.value = ""
    }
  }

  const handlePickFile = (file: File | null) => {
    clearSelectedFile()
    setIsAttachmentMenuOpen(false)
    if (!file) return

    if (!isSupportedImageFile(file)) {
      const message = file.type.startsWith("video/")
        ? (lang === "EN" ? "Video upload is not supported. Choose a receipt photo only." : "Video tidak disokong. Pilih gambar resit sahaja.")
        : (lang === "EN" ? "Only JPG, PNG, and WEBP receipt photos are supported." : "Hanya gambar resit JPG, PNG, dan WEBP disokong.")
      setErrorText(message)
      showAlert(
        lang === "EN" ? "Unsupported File" : "Fail Tidak Disokong",
        message,
        "warning"
      )
      pendingTxnAttachRef.current = null
      return
    }

    const receiptFile = normalizeReceiptFile(file)
    setErrorText("")
    setSelectedFile(receiptFile)
    const url = registerObjectUrl(URL.createObjectURL(receiptFile))
    setSelectedPreviewUrl(url)

    // Bubble "Ambil resit / Lampir gambar": auto-send file attached to that TXN
    const pendingTxn = pendingTxnAttachRef.current
    if (pendingTxn) {
      pendingTxnAttachRef.current = null
      window.setTimeout(() => {
        // text empty — attach uses target_txn_ref (not a new expense command)
        void submitMessage(undefined, "", receiptFile, pendingTxn)
      }, 0)
    }
  }

  useEffect(() => {
    if (!sharedToken || processedShareTokensRef.current.has(sharedToken)) return
    processedShareTokensRef.current.add(sharedToken)

    let cancelled = false

    const attachSharedImage = async () => {
      try {
        const res = await fetch(`/share-target-file/${encodeURIComponent(sharedToken)}`)
        if (!res.ok) {
          throw new Error(`Shared file fetch failed (${res.status})`)
        }

        // Text-only share (e.g. bank/eWallet notification text): the endpoint
        // returns JSON {title,text,url} instead of the file + header stream.
        const contentType = res.headers.get("content-type") || ""
        let sharedText = ""
        if (!contentType.startsWith("image/")) {
          try {
            const info = await res.json()
            sharedText = [info?.title, info?.text, info?.url].filter(Boolean).join("\n").trim()
          } catch {
            sharedText = ""
          }
          void fetch(`/share-target-file/${encodeURIComponent(sharedToken)}`, { method: "DELETE" })
          if (sharedText) {
            window.setTimeout(() => {
              void submitMessage(undefined, sharedText)
            }, 0)
            showAlert(
              lang === "EN" ? "Text Sent" : "Teks Dihantar",
              lang === "EN" ? "Shared text is being processed in chat." : "Teks yang dikongsi sedang diproses dalam chat.",
              "success"
            )
          }
          return
        }

        sharedText = [
          decodeSharedHeaderValue(res.headers.get("x-shared-title")),
          decodeSharedHeaderValue(res.headers.get("x-shared-text")),
          decodeSharedHeaderValue(res.headers.get("x-shared-url")),
        ].filter(Boolean).join("\n").trim()

        // Clean, friendly file name — phone share names like "temp_screenshot.png"
        // or "Screenshot_20250612-103022.png" look noisy in the chat bubble.
        const rawName = decodeSharedHeaderValue(res.headers.get("x-shared-file-name"))
        const stamp = new Date()
        const pad = (n: number) => String(n).padStart(2, "0")
        const fileName = `screenshot-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.${(rawName || "png").split(".").pop()?.toLowerCase() || "png"}`
        const blob = await res.blob()
        if (cancelled) return

        const file = normalizeReceiptFile(new File([blob], fileName, { type: contentType }))

        // Auto-send: shared screenshot goes straight into the conversation.
        void fetch(`/share-target-file/${encodeURIComponent(sharedToken)}`, { method: "DELETE" })
        window.setTimeout(() => {
          void submitMessage(undefined, sharedText, file)
        }, 0)
        showAlert(
          lang === "EN" ? "Screenshot Sent" : "Screenshot Dihantar",
          lang === "EN" ? "Screenshot is being processed in chat." : "Screenshot sedang diproses dalam chat.",
          "success"
        )
      } catch {
        if (cancelled) return
        setErrorText(lang === "EN" ? "Shared screenshot could not be opened." : "Screenshot yang dikongsi tidak dapat dibuka.")
        showAlert(
          lang === "EN" ? "Share Failed" : "Kongsi Gagal",
          lang === "EN" ? "Open the screenshot again from Share." : "Buka semula screenshot daripada Share.",
          "warning"
        )
      }
    }

    void attachSharedImage()

    return () => {
      cancelled = true
    }
  }, [sharedToken, lang])

  const openAttachmentPicker = (source: "camera" | "gallery") => {
    setIsAttachmentMenuOpen(false)
    const input = source === "camera" ? cameraInputRef.current : galleryInputRef.current
    if (!input) return
    input.value = ""
    input.click()
  }

  const normalizeSlashCommand = (value: string) => {
    const trimmed = value.trim()
    return trimmed.startsWith("/") ? trimmed.slice(1).trim() : trimmed
  }

  const applyCommand = (item: CommandItem) => {
    const nextValue = item.insert === "@here" ? "@here" : `/${item.insert}`
    setInput(nextValue)
    setIsCommandMenuOpen(false)
    setIsAttachmentMenuOpen(false)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.focus()
        const cursorPosition = nextValue.length
        textarea.setSelectionRange(cursorPosition, cursorPosition)
        resizeComposerTextarea()
      })
    })
  }

  const handleComposerInputChange = (value: string) => {
    setInput(value)
    if (value.trimStart().startsWith("/")) {
      setIsAttachmentMenuOpen(false)
      setIsCommandMenuOpen(true)
      return
    }
    setIsCommandMenuOpen(false)
  }

  const submitMessage = async (
    locationData?: { latitude: number; longitude: number; name?: string },
    textOverride?: string,
    fileOverride?: File | null,
    /** Bubble attach: explicit TXN ref to attach receipt to (web chat only). */
    attachTxnRef?: string | null
  ) => {
    const activeFileRaw = fileOverride !== undefined ? fileOverride : selectedFile
    const activeFile = activeFileRaw ? normalizeReceiptFile(activeFileRaw) : null
    const text = (textOverride ?? input).trim()
    const attachRef =
      (attachTxnRef || "").trim().toUpperCase() ||
      (activeFile ? extractTxnRefFromText(text) : null)
    if (!locationData && !activeFile && text.length === 0) return
    setSending(true)
    setErrorText("")
    setIsAttachmentMenuOpen(false)
    setIsCommandMenuOpen(false)
    setIsMobileMenuOpen(false)

    const now = Date.now()
    const tempMessageId = `user-${now}`

    const localPreviewUrl = selectedPreviewUrl || (activeFile && activeFile.type.startsWith("image/")
      ? registerObjectUrl(URL.createObjectURL(activeFile))
      : undefined)
    const localLabel = (() => {
      if (text) return text
      if (locationData) return lang === "EN" ? "[Location pinned]" : "[Lokasi dipin]"
      if (activeFile && attachRef) {
        return lang === "EN"
          ? `[Receipt → ${attachRef}]`
          : `[Resit → ${attachRef}]`
      }
      return lang === "EN" ? "[Receipt uploaded]" : "[Resit dimuat naik]"
    })()
    const localUserMessage: ChatMessage = {
      id: tempMessageId,
      role: "user",
      text: localLabel,
      createdAt: now,
      fileName: activeFile?.name,
      fileType: activeFile ? (getSupportedImageContentType(activeFile) || activeFile.type) : undefined,
      previewUrl: localPreviewUrl,
    }
    setMessages((prev) => [...prev, localUserMessage])

    try {
      const token = getAccessToken()
      const formData = new FormData()
      // For bubble attach-only, text can be empty; target_txn_ref carries the TXN.
      formData.append("text", text)

      if (activeFile && attachRef) {
        formData.append("target_txn_ref", attachRef)
      }
      
      // Skip flaky browser→R2 direct PUT (CORS / Failed to fetch).
      // Always send image via API multipart so server stores the receipt.
      let receiptUploadSkipped = false
      if (activeFile) {
        const contentType = getSupportedImageContentType(activeFile)
        if (!contentType && !isSupportedImageFile(activeFile)) {
          throw new Error(
            lang === "EN"
              ? "Unsupported receipt image type. Use JPG, PNG, or WebP."
              : "Jenis imej resit tidak disokong. Guna JPG, PNG, atau WebP."
          )
        }
        formData.append("file", activeFile, activeFile.name || "receipt.jpg")
      }

      if (locationData) {
        formData.append("latitude", String(locationData.latitude));
        formData.append("longitude", String(locationData.longitude));
        if (locationData.name) {
          formData.append("location_name", locationData.name);
        }
      }

      setInput("")
      setSelectedFile(null)
      setSelectedPreviewUrl(null)
      if (cameraInputRef.current) {
        cameraInputRef.current.value = ""
      }
      if (galleryInputRef.current) {
        galleryInputRef.current.value = ""
      }

      // Show typing indicator immediately
      setIsTyping(true)

      const postChatMessage = async (body: FormData) => {
        const res = await fetch("/api/chat/message", {
          credentials: "include",
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body,
        })
        const data = await res.json().catch(() => ({}))
        return { res, data }
      }

      let { res, data } = await postChatMessage(formData)

      // Bubble attach (TXN + photo only): never retry as text-only — that is not a new expense
      // and would hide the real attach failure. Only retry text-only for "makan 12" style sends.
      const isBubbleAttachOnly = Boolean(activeFile && attachRef && !textLooksLikeNewExpense(text))
      if (!res.ok && activeFile && text.length > 0 && !isBubbleAttachOnly && textLooksLikeNewExpense(text)) {
        console.warn("Chat message with receipt failed; retrying text-only to save transaction", data)
        const textOnly = new FormData()
        textOnly.append("text", text)
        if (locationData) {
          textOnly.append("latitude", String(locationData.latitude))
          textOnly.append("longitude", String(locationData.longitude))
          if (locationData.name) textOnly.append("location_name", locationData.name)
        }
        const retry = await postChatMessage(textOnly)
        res = retry.res
        data = retry.data
        receiptUploadSkipped = res.ok
      }

      if (!res.ok) {
        const detail =
          typeof data?.detail === "string"
            ? data.detail
            : Array.isArray(data?.detail)
              ? data.detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join("; ")
              : ""
        throw new Error(detail || `HTTP ${res.status}`)
      }

      // Bot may return 200 with "Upload lampiran gagal..." — surface that clearly
      const replyPreview = typeof data?.reply === "string" ? data.reply : ""
      if (
        activeFile &&
        attachRef &&
        /upload lampiran gagal|receipt upload failed|tiada transaksi|no transaction found|resit ditolak|receipt rejected/i.test(
          replyPreview
        )
      ) {
        setErrorText(replyPreview.split("\n")[0].slice(0, 200))
      }

      if (receiptUploadSkipped) {
        const warn =
          lang === "EN"
            ? "Transaction saved, but receipt upload failed. You can attach the photo later with the TXN id."
            : "Transaksi disimpan, tetapi upload resit gagal. Anda boleh lampirkan gambar kemudian dengan ID TXN."
        setErrorText(warn)
      }

      // Buffer data
      const persistedMessages = Array.isArray(data?.messages)
        ? data.messages.map(mapApiMessage).filter(Boolean)
        : []
      const replyText = sanitizeIncomingBotText(data?.reply)

      if (!replyText) {
        setIsTyping(false)
        setMessages((prev) => {
          const withoutTemp = prev.filter((msg) => msg.id !== tempMessageId)
          if (persistedMessages.length > 0) {
            return [...withoutTemp, ...persistedMessages]
          }
          return [...withoutTemp, localUserMessage]
        })
        return
      }

      // Artificial delay for natural feel
      // USER REQUEST: Skip delay for transactions and attachments, longer for normal chat
      const isTransaction = replyText?.trim().startsWith("*Done!") || replyText?.trim().includes("TXN")
      // Celebrate income / fly-money for expense (web chat only)
      if (isTransaction) {
        const fx = detectTxnFx(String(replyText), text)
        if (fx) setTxnFxKind(fx)
      }
      const minDelay = (activeFile || isTransaction) ? 0 : 4000
      
      const elapsed = Date.now() - now
      if (elapsed < minDelay) {
        await new Promise((resolve) => setTimeout(resolve, minDelay - elapsed))
      }
      setIsTyping(false)

      setMessages((prev) => {
        const withoutTemp = prev.filter((msg) => msg.id !== tempMessageId)
        if (persistedMessages.length > 0) {
          return [...withoutTemp, ...persistedMessages]
        }
        return [
          ...withoutTemp,
          localUserMessage,
          {
            id: `bot-${Date.now()}`,
            role: "bot",
            text: replyText,
            createdAt: Date.now(),
          },
        ]
      })
    } catch (err: unknown) {
      setIsTyping(false)
      const errorMessage = err instanceof Error ? err.message : ""
      const msg =
        errorMessage ||
        (lang === "EN" ? "Failed to send message." : "Gagal menghantar mesej.")
      
      const isConnectionError = msg.includes("ECONNRESET") || msg.includes("fetch") || msg.includes("500") || msg.includes("socket");
      
      setErrorText(msg)
      showAlert(
        lang === "EN" ? "Send Failed" : "Hantar Gagal",
        msg,
        "error"
      )
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          role: "bot",
          text:
            lang === "EN"
              ? `Sorry, failed to process message. ${isConnectionError ? "This might be a temporary connection issue. Please try again." : `(${msg})`}`
              : `Maaf, mesej gagal diproses. ${isConnectionError ? "Mungkin ada masalah sambungan sementara. Sila cuba lagi." : `(${msg})`}`,
          createdAt: Date.now(),
        },
      ])
    } finally {
      setIsTyping(false)
      setSending(false)
    }
  }

  const requestCurrentLocation = (onSuccess: (coords: { latitude: number; longitude: number }) => void) => {
    if (isLocating) return
    setIsAttachmentMenuOpen(false)
    setIsCommandMenuOpen(false)
    setIsMobileMenuOpen(false)
    setIsLocating(true)
    setErrorText("")

    if (!navigator.geolocation) {
      const message = lang === "EN" ? "Geolocation is not supported by your browser" : "Geolocation tidak disokong oleh pelayar anda"
      setErrorText(message)
      showAlert(
        lang === "EN" ? "Location Unavailable" : "Lokasi Tidak Tersedia",
        message,
        "warning"
      )
      setIsLocating(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false)
        onSuccess({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      (err) => {
        setIsLocating(false)
        let msg = lang === "EN" ? "Unable to retrieve your location" : "Gagal mendapatkan lokasi anda"
        if (err.code === 1) {
          msg = lang === "EN" ? "Location access denied" : "Akses lokasi ditolak"
        }
        setErrorText(msg)
        showAlert(
          lang === "EN" ? "Location Failed" : "Lokasi Gagal",
          msg,
          "error"
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )
  }

  const sendCurrentInput = () => {
    const rawText = input.trim()
    const normalizedText = normalizeSlashCommand(rawText)
    if (!HERE_LOCATION_PATTERN.test(normalizedText)) {
      void submitMessage(undefined, normalizedText)
      return
    }

    const textWithoutHere = normalizedText.replace(HERE_LOCATION_PATTERN, " ").trim()
    requestCurrentLocation((coords) => {
      void submitMessage(coords, textWithoutHere ? normalizedText : "")
    })
  }

  const handlePinLocation = () => {
    requestCurrentLocation((coords) => {
      void submitMessage(coords)
    })
  }

  // ── Voice: mic popup → hold to record → release auto-submits ──
  const openVoicePopup = () => {
    if (voiceBusy || isLocating) return
    setIsAttachmentMenuOpen(false)
    setIsCommandMenuOpen(false)
    setVoiceSecs(0)
    voiceSubmitRef.current = true
    voiceReleaseRef.current = false
    setVoicePopupOpen(true)
  }
  const closeVoicePopup = () => {
    if (isVoiceRecording || voiceBusy) return
    setVoicePopupOpen(false)
  }
  const stopVoice = (submit: boolean) => {
    if (!mediaRecorderRef.current) return
    voiceSubmitRef.current = submit
    try {
      mediaRecorderRef.current.stop()
    } catch {}
  }
  const endVoiceHold = () => {
    voiceHoldRef.current = false
    if (isVoiceRecording) {
      stopVoice(true)
    } else {
      voiceReleaseRef.current = true
    }
  }
  const cancelVoice = () => {
    voiceHoldRef.current = false
    if (voiceBusy) return
    if (isVoiceRecording) {
      stopVoice(false)
    } else {
      setVoicePopupOpen(false)
    }
  }
  const startVoiceHold = async () => {
    if (isVoiceRecording || voiceBusy || isLocating) return
    if (!navigator.mediaDevices?.getUserMedia) {
      showAlert(
        lang === "EN" ? "Voice unsupported" : "Suara tidak disokong",
        lang === "EN" ? "Voice recording is not supported on this browser. Please open the app in Chrome or Safari." : "Rakaman suara tidak disokong pada pelayar ini. Sila buka aplikasi dalam Chrome atau Safari.",
        "error",
      )
      return
    }
    // If browser exposes permission state and it is already denied, guide the user.
    try {
      const perm = (navigator.permissions as any)?.query
        ? await (navigator.permissions as any).query({ name: "microphone" as any })
        : null
      if (perm?.state === "denied") {
        showAlert(
          lang === "EN" ? "Mic blocked" : "Mikrofon disekat",
          lang === "EN"
            ? "Microphone permission was blocked. Tap the lock/site icon in the address bar and allow microphone, then try again."
            : "Kebenaran mikrofon telah disekat. Ketik ikon kunci/laman di bar alamat dan benarkan mikrofon, kemudian cuba lagi.",
          "error",
        )
        setVoicePopupOpen(false)
        return
      }
    } catch {}
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      voiceChunksRef.current = []
      voiceReleaseRef.current = false
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop())
        mediaRecorderRef.current = null
        const submit = voiceSubmitRef.current
        setIsVoiceRecording(false)
        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" })
        voiceChunksRef.current = []
        if (!submit || blob.size < 200) {
          if (blob.size < 200) {
            showAlert(lang === "EN" ? "Too short" : "Terlalu pendek", lang === "EN" ? "Hold longer to record your voice." : "Tekan lama untuk rakam suara.", "error")
          }
          setVoicePopupOpen(false)
          return
        }
        await sendVoiceBlob(blob)
      }
      recorder.start()
      voiceReadyRef.current = true
      setVoiceSecs(0)
      setIsVoiceRecording(true)
      // Released before mic warmed up → stop immediately so it never records silently.
      if (voiceReleaseRef.current) {
        stopVoice(true)
      }
    } catch (err: any) {
      const denied =
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError" ||
        err?.name === "SecurityError"
      showAlert(
        denied ? (lang === "EN" ? "Mic denied" : "Mikrofon dinafikan") : (lang === "EN" ? "Mic error" : "Ralat mikrofon"),
        denied
          ? (lang === "EN"
              ? "Microphone access was not granted. Allow microphone access and try again."
              : "Akses mikrofon tidak dibenarkan. Benarkan akses mikrofon dan cuba lagi.")
          : (lang === "EN"
              ? "Could not start microphone. Please try again."
              : "Tidak dapat memulakan mikrofon. Sila cuba lagi."),
        "error",
      )
      setVoicePopupOpen(false)
    }
  }

  const sendVoiceBlob = async (blob: Blob) => {
    setVoiceBusy(true)
    try {
      const token = getAccessToken()
      const formData = new FormData()
      formData.append("file", blob, "voice.webm")
      const res = await fetch("/api/transcribe", {
        credentials: "include",
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      })
      if (!res.ok) {
        throw new Error(lang === "EN" ? "Failed to read audio." : "Gagal membaca audio.")
      }
      const data = await res.json()
      const spoken = String(data?.text || "").trim()
      if (!spoken) {
        showAlert(lang === "EN" ? "No text" : "Tiada teks", lang === "EN" ? "No text detected in audio." : "Tiada teks dikesan dalam audio.", "error")
        return
      }
      await submitMessage(undefined, spoken)
    } catch {
      showAlert(lang === "EN" ? "Error" : "Ralat", lang === "EN" ? "Error reading audio. Try again." : "Ralat membaca audio. Cuba lagi.", "error")
    } finally {
      setVoiceBusy(false)
      setVoicePopupOpen(false)
    }
  }

  const pageBg = "bg-[var(--page-bg)]"
  const sectionBg = "bg-[var(--page-bg)]"
  const surfaceBg = "bg-[var(--card)]"
  const bubbleUserBg = isLightTheme
    ? "border-transparent bg-[color-mix(in_srgb,var(--brand-blue)_10%,var(--surface-tint))] text-[var(--text)]"
    : "border-[color:var(--border)] bg-[color-mix(in_srgb,var(--brand-blue)_22%,var(--card))] text-[var(--text)]"
  const bubbleBotBg = isLightTheme
    ? "border-[color:var(--border)] bg-[var(--card)] text-[var(--text)] shadow-sm shadow-[color-mix(in_srgb,var(--brand-navy)_6%,transparent)]"
    : "border-[color:var(--border)] bg-[var(--card)] text-[var(--text)] shadow-sm shadow-black/20"
  const userAttachmentText = isLightTheme ? "text-[var(--brand-blue)]" : "text-[color-mix(in_srgb,var(--brand-cyan)_70%,white)]"
  const titleText = "text-[var(--text)]"
  const mutedText = "text-[var(--muted)]"
  const subtleText = "text-[var(--muted)]"
  const composerBg = "bg-[var(--card)]"
  const handleChatAction = (action: ChatAction) => {
    if (sending || isTyping || isLocating) return
    if (action.type === "send") {
      const value = action.text
      if (value.endsWith(" ") || value.includes("…")) {
        setInput(value.replace(/…/g, ""))
        setIsCommandMenuOpen(false)
        setIsAttachmentMenuOpen(false)
        window.requestAnimationFrame(() => {
          textareaRef.current?.focus()
          resizeComposerTextarea()
        })
        return
      }
      void submitMessage(undefined, value)
      return
    }
    if (action.type === "attach") {
      const ref = (action.txnRef || "").trim().toUpperCase() || null
      if (!ref) {
        showAlert(
          lang === "EN" ? "No transaction" : "Tiada transaksi",
          lang === "EN"
            ? "This card has no TXN id. Send an expense first, then attach the receipt."
            : "Kad ini tiada ID TXN. Hantar belanja dulu, kemudian lampir resit.",
          "warning"
        )
        return
      }
      pendingTxnAttachRef.current = ref
      // Keep composer free; attach uses target_txn_ref, not typed text
      openAttachmentPicker(action.mode)
      return
    }
    if (action.type === "open_commands") {
      setIsCommandMenuOpen(true)
      setInput("/")
      window.requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }

  const mobileControlButton = isLightTheme
    ? "border-[color:var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--surface-tint)]"
    : "border-[color:var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--surface-tint-strong)]"
  const mobileIconTile = isLightTheme
    ? "bg-[var(--surface-tint)] text-[var(--text)] hover:bg-[var(--surface-tint-strong)]"
    : "bg-[var(--surface-tint)] text-[var(--text)] hover:bg-[var(--surface-tint-strong)]"
  const mobileCommandBadge = isLightTheme
    ? "bg-[var(--surface-tint)] text-[var(--text)]"
    : "bg-[var(--surface-tint-strong)] text-[var(--text)]"
  const composerIconBg = mobileIconTile
  const sendButtonBg = canSend
    ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:opacity-95"
    : isLightTheme
      ? "bg-[var(--surface-tint-strong)] text-[var(--muted)]"
      : "bg-[var(--surface-tint)] text-[color-mix(in_srgb,var(--text)_45%,transparent)]"

  return (
    <div
      className={cn("fixed left-0 right-0 z-40 w-full flex flex-col overflow-hidden lg:static lg:inset-auto lg:z-auto lg:h-[100dvh]", pageBg)}
      style={{
        top: viewportHeight ? `${viewportOffsetTop}px` : undefined,
        height: viewportHeight ? `${viewportHeight}px` : undefined,
      }}
    >


      <div className={cn("hidden border-b border-white/[0.06] md:block", sectionBg)}>
        <div className="mx-auto flex w-full max-w-5xl gap-2 overflow-x-auto px-4 py-3 lg:max-w-none">
          {quickCommandItems.map((item) => (
            <button
              key={item.insert}
              type="button"
              onClick={() => applyCommand(item)}
              className={cn(
                "shrink-0 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-[0.6875rem] font-medium transition-colors",
                surfaceBg,
                "text-[var(--muted)] hover:bg-[color:var(--surface-tint)] hover:text-[var(--text)]"
              )}
            >
              /{item.insert.trim()}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("border-b border-[color:var(--border)] md:hidden", sectionBg)}>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-3 py-2.5 lg:max-w-none">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label={lang === "EN" ? "Open menu" : "Buka menu"}
              aria-haspopup="menu"
              aria-expanded={isMobileMenuOpen}
              onClick={() => {
                setIsCommandMenuOpen(false)
                setIsAttachmentMenuOpen(false)
                setIsMobileMenuOpen(true)
              }}
              className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors", mobileControlButton)}
            >
              <Menu size={18} strokeWidth={2.3} />
            </button>
            <Link
              href={`/${sessionId}`}
              aria-label={lang === "EN" ? "Back to dashboard" : "Kembali ke dashboard"}
              onClick={() => {
                setIsAttachmentMenuOpen(false)
                setIsMobileMenuOpen(false)
                setIsCommandMenuOpen(false)
              }}
              className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors", mobileControlButton)}
            >
              <X size={17} strokeWidth={2.4} />
            </Link>
          </div>
          <div className={cn("flex min-w-0 items-center justify-center gap-1.5 rounded-full border border-[color:var(--border)] px-3 py-2", surfaceBg)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("shrink-0", subtleText)}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <p className={cn("truncate text-[0.6875rem] font-medium", subtleText)}>
              {lang === "EN" ? "Chat history clears automatically every 24 hours" : "Sejarah chat dikosongkan secara automatik setiap 24 jam"}
            </p>
          </div>
        </div>
      </div>

      <div className={cn("hidden border-b border-[color:var(--border)] md:block", sectionBg)}>
        <div className="mx-auto flex w-full max-w-5xl items-center justify-center gap-1.5 px-6 py-2.5 lg:max-w-none">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("shrink-0", subtleText)}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <p className={cn("truncate text-[0.6875rem] font-medium", subtleText)}>
            {lang === "EN" ? "Chat history clears automatically every 24 hours" : "Sejarah chat dikosongkan secara automatik setiap 24 jam"}
          </p>
        </div>
      </div>

      {isMobileMenuOpen && (
 <div className={cn("fixed inset-0 z-[70] flex h-[100dvh] overflow-hidden", isLightTheme ? "bg-transparent" : "bg-transparent")} onClick={() => setIsMobileMenuOpen(false)}>
          <div
            role="menu"
            className={cn(
              "flex h-[100dvh] min-h-0 w-[min(86vw,360px)] flex-col overflow-hidden border-r shadow-2xl",
              isLightTheme
                ? "border-[color:var(--border)] bg-[var(--card)] text-[var(--text)] shadow-[color-mix(in_srgb,var(--brand-navy)_12%,transparent)]"
                : "border-[color:var(--border)] bg-[var(--card)] text-[var(--text)] shadow-black/40"
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem] font-semibold text-[var(--text)]">{lang === "EN" ? "Menu" : "Menu"}</p>
                <p className="truncate text-xs text-[var(--muted)]">{lang === "EN" ? "MyPeribadi pages" : "Halaman MyPeribadi"}</p>
              </div>
              <button
                type="button"
                aria-label={lang === "EN" ? "Close menu" : "Tutup menu"}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn("flex h-9 w-9 items-center justify-center rounded-full border transition-colors", mobileControlButton)}
              >
                <X size={17} />
              </button>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              {menuItems.map((item) => {
                const Icon = item.icon
                const active = item.href === `/${sessionId}/chat`
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors",
                      active ? "bg-[color:var(--surface-tint)]" : "hover:bg-[color:var(--surface-tint)]"
                    )}
                  >
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", mobileIconTile)}>
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-semibold leading-5 text-[var(--text)]">{item.name}</span>
                      <span className="block truncate text-xs leading-4 text-[var(--muted)]">{item.subtitle}</span>
                    </span>
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      )}

      <div
        ref={listRef}
        className={cn("flex-1 overflow-y-auto px-4 py-6", pageBg)}
      >
        <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4 overflow-visible">
        {messages.map((msg) => {
          const isUser = msg.role === "user"
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("flex w-full min-w-0 overflow-visible", isUser ? "justify-end" : "justify-start")}
            >
              {isUser ? (
                <div
                  className={cn(
                    "chat-user-bubble w-fit max-w-[85%] min-w-0 rounded-2xl border px-3.5 py-2.5 break-words [overflow-wrap:anywhere]",
                    bubbleUserBg
                  )}
                >
                  {msg.previewUrl && msg.fileType?.startsWith("image/") && (
                    <SmartImage
                      src={msg.previewUrl}
                      alt={msg.fileName || "attachment"}
                      className="mb-3 max-h-48 w-full overflow-hidden rounded-xl"
                      imgClassName="max-h-48 w-full object-cover"
                      loading="eager"
                    />
                  )}
                  <ChatRichMessage text={msg.text} isUser isLight={isLightTheme} lang={lang} />
                  {msg.fileName && (
                    <div className={cn("mt-3 flex items-center gap-1.5 text-[0.6875rem] font-medium", userAttachmentText)}>
                      {msg.fileType?.startsWith("image/") ? <ImageIcon size={12} /> : <FileText size={12} />}
                      <span className="truncate">{msg.fileName}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={cn(
                    "chat-bot-bubble w-full max-w-full min-w-0 overflow-visible rounded-2xl border px-3.5 py-3 break-words",
                    bubbleBotBg
                  )}
                >
                  {msg.previewUrl && msg.fileType?.startsWith("image/") && (
                    <SmartImage
                      src={msg.previewUrl}
                      alt={msg.fileName || "attachment"}
                      className="mb-2.5 max-h-44 w-full overflow-hidden rounded-xl"
                      imgClassName="max-h-44 w-full object-cover"
                      loading="eager"
                    />
                  )}
                  <ChatRichMessage text={msg.text} isLight={isLightTheme} lang={lang} disabled={sending || isTyping || isLocating} onAction={handleChatAction} />
                  {msg.fileName && (
                    <div className="mt-2 flex items-center gap-1.5 text-[0.6875rem] font-medium text-[var(--muted)]">
                      {msg.fileType?.startsWith("image/") ? <ImageIcon size={12} /> : <FileText size={12} />}
                      <span className="truncate">{msg.fileName}</span>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )
        })}

        {isTyping && (
          <div className="flex w-full justify-start">
            <div className={cn("inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-2.5", bubbleBotBg)}>
              <motion.span
                animate={{ scale: [1, 1.15, 1], rotate: [0, 8, -8, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                className="text-[var(--accent)]"
              >
                <Sparkle size={15} fill="currentColor" />
              </motion.span>
              <motion.span
                aria-label="Thinking"
                className="bg-clip-text text-sm font-medium text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, var(--muted) 0%, var(--muted) 35%, var(--text) 50%, var(--muted) 65%, var(--muted) 100%)",
                  backgroundSize: "200% 100%",
                }}
                animate={{ backgroundPosition: ["150% 0%", "-50% 0%"] }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                Thinking...
              </motion.span>
            </div>
          </div>
        )}
        </div>
      </div>

      <div className={cn("px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]", sectionBg)}>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        {selectedFile && (
          <div className={cn("chat-composer-surface flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] px-3 py-2.5", composerBg)}>
            <div className="min-w-0">
              <p className={cn("truncate text-sm font-semibold", titleText)}>{selectedFile.name}</p>
              <p className={cn("text-[0.6875rem]", subtleText)}>
                {selectedFile.type || "unknown"} · {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              type="button"
              onClick={clearSelectedFile}
              className={cn("flex h-8 w-8 items-center justify-center rounded-xl transition-colors", mobileIconTile)}
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="relative">
          {isCommandMenuOpen && (
            <div
              role="listbox"
              className={cn(
                "absolute bottom-[calc(100%+0.5rem)] left-0 w-max max-w-[calc(100vw-2rem)] md:max-w-[400px] z-40 overflow-hidden rounded-2xl border border-[color:var(--border)] p-2",
                composerBg
              )}
            >
              <div className="flex items-center justify-between gap-3 px-2 pb-2">
                <p className="truncate text-[0.9375rem] font-semibold text-[var(--text)]">
                  {lang === "EN" ? "Commands" : "Command"}
                </p>
                <p className={cn("shrink-0 rounded-full px-2 py-1 text-[0.6875rem] font-medium", mobileCommandBadge)}>
                  {isSlashCommandInput ? `/${commandQuery}` : "/"}
                </p>
              </div>
              <div className="max-h-[min(18rem,48vh)] overflow-y-auto pr-1">
                {commandSuggestions.length > 0 ? (
                  commandSuggestions.map((item) => (
                    <button
                      key={item.command}
                      type="button"
                      role="option"
                      onClick={() => applyCommand(item)}
                      className="flex w-full items-start gap-3 rounded-full px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-tint)]"
                    >
                      <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold", mobileCommandBadge)}>
                        /
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-semibold leading-5 text-[var(--text)]">/{item.command}</span>
                        <span className="block truncate text-xs leading-4 text-[var(--muted)]">
                          {lang === "EN" ? item.hintEN : item.hintBM}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-center text-sm text-[var(--muted)]">
                    {lang === "EN" ? "No command found" : "Command tidak dijumpai"}
                  </p>
                )}
              </div>
            </div>
          )}

          <input
            ref={cameraInputRef}
            type="file"
            accept={IMAGE_PICKER_ACCEPT}
            capture="environment"
            className="hidden"
            onChange={(e) => handlePickFile(e.target.files?.[0] || null)}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept={IMAGE_PICKER_ACCEPT}
            className="hidden"
            onChange={(e) => handlePickFile(e.target.files?.[0] || null)}
          />

          <div className="flex items-end gap-2">
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={lang === "EN" ? "Open attachment options" : "Buka pilihan lampiran"}
                aria-haspopup="menu"
                aria-expanded={isAttachmentMenuOpen}
                onClick={() => {
                  setIsCommandMenuOpen(false)
                  setIsCalculatorOpen(false)
                  setIsAttachmentMenuOpen((prev) => !prev)
                }}
                className={cn("chatgpt-composer-control flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-colors", mobileControlButton)}
              >
                <Plus size={21} strokeWidth={2.4} />
              </button>

              {isAttachmentMenuOpen && (
                <div
                  role="menu"
                  className={cn("absolute bottom-14 left-0 z-30 w-60 rounded-2xl border border-white/[0.08] p-2.5", composerBg)}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsAttachmentMenuOpen(false)
                      setIsCalculatorOpen((prev) => !prev)
                    }}
                    className="flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-tint)]"
                  >
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", composerIconBg)}>
                      <Plus size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block truncate text-sm font-semibold", titleText)}>{lang === "EN" ? "Calculator" : "Kalkulator"}</span>
                      <span className={cn("block truncate text-[0.6875rem]", subtleText)}>{lang === "EN" ? "Quick math beside chat" : "Kira cepat sebelah chat"}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openAttachmentPicker("camera")}
                    className="flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-tint)]"
                  >
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", composerIconBg)}>
                      <Camera size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block truncate text-sm font-semibold", titleText)}>{lang === "EN" ? "Camera" : "Kamera"}</span>
                      <span className={cn("block truncate text-[0.6875rem]", subtleText)}>{lang === "EN" ? "Take receipt photo" : "Ambil gambar resit"}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openAttachmentPicker("gallery")}
                    className="flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-tint)]"
                  >
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", composerIconBg)}>
                      <ImageIcon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block truncate text-sm font-semibold", titleText)}>{lang === "EN" ? "Photos" : "Gambar"}</span>
                      <span className={cn("block truncate text-[0.6875rem]", subtleText)}>{lang === "EN" ? "Choose photo only" : "Pilih gambar sahaja"}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isLocating}
                    onClick={handlePinLocation}
                    className="flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-tint)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", composerIconBg)}>
                      {isLocating ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block truncate text-sm font-semibold", titleText)}>{lang === "EN" ? "Location" : "Lokasi"}</span>
                      <span className={cn("block truncate text-[0.6875rem]", subtleText)}>{lang === "EN" ? "Send current location" : "Hantar lokasi semasa"}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={voiceBusy || isLocating}
                    onClick={openVoicePopup}
                    className="flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-tint)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", composerIconBg)}>
                      {voiceBusy ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block truncate text-sm font-semibold", titleText)}>{lang === "EN" ? "Voice" : "Suara"}</span>
                      <span className={cn("block truncate text-[0.6875rem]", subtleText)}>
                        {lang === "EN" ? "Hold the mic to talk, release to send" : "Tekan lama ikut untuk bercakap, lepas untuk hantar"}
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </div>

            <div className={cn("chatgpt-composer-shell flex min-h-12 flex-1 items-end gap-1.5 rounded-2xl border border-[color:var(--border)] px-3 py-2", composerBg)}>
              <div className="flex min-h-8 flex-1 items-center px-1 py-0.5">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => handleComposerInputChange(e.target.value)}
                  onFocus={() => {
                    setIsAttachmentMenuOpen(false)
                    if (input.trimStart().startsWith("/")) {
                      setIsCommandMenuOpen(true)
                    }
                  }}
                  placeholder={lang === "EN" ? "Type message..." : "Tulis mesej..."}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      if (canSend) sendCurrentInput()
                    }
                  }}
                  className="chat-composer-textarea min-h-6 w-full resize-none bg-transparent py-1 text-[1rem] leading-6 text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none md:text-base"
                  style={{ overflowWrap: "anywhere" }}
                />
              </div>

              <button
                type="button"
                aria-label={lang === "EN" ? "Add by voice" : "Tambah dengan suara"}
                title={lang === "EN" ? "Add by voice" : "Tambah dengan suara"}
                disabled={voiceBusy || isLocating}
                onClick={openVoicePopup}
                className={cn(
                  "chatgpt-composer-control flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  mobileControlButton
                )}
              >
                {voiceBusy ? <Loader2 size={14} className="animate-spin" /> : <Mic size={15} />}
              </button>

              <button
                type="button"
                disabled={!canSend}
                onClick={sendCurrentInput}
                className={cn("chatgpt-send-button flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-100", sendButtonBg)}
              >
                {sending || isLocating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>

          {isCalculatorOpen && (
            <div className="mt-3">
              <Calculator embedded />
            </div>
          )}
        </div>

        {errorText && <p className="px-1 text-[0.6875rem] font-medium text-red-400">{errorText}</p>}
        </div>
      </div>
      <TxnFxOverlay kind={txnFxKind} onDone={() => setTxnFxKind(null)} />
      {voicePopupOpen && (
        <div className="fixed inset-0 z-[700] flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeVoicePopup}
            aria-hidden="true"
          />
          <div
            role="dialog"
            className={cn(
              "relative w-full max-w-md rounded-t-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center shadow-2xl sm:rounded-3xl sm:pb-6",
              voiceBusy || isVoiceRecording ? "" : "chatgpt-voice-popup"
            )}
          >
            <button
              type="button"
              aria-label={lang === "EN" ? "Close" : "Tutup"}
              onClick={closeVoicePopup}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[color:var(--surface-tint)]"
            >
              <X size={18} />
            </button>

            <div className="mb-1 text-base font-bold text-[var(--text)]">
              {voiceBusy
                ? lang === "EN"
                  ? "Sending..."
                  : "Menghantar..."
                : lang === "EN"
                  ? "Voice message"
                  : "Mesej suara"}
            </div>
            <p className={cn("mb-6 text-xs", "text-[var(--muted)]")}>
              {voiceBusy
                ? ""
                : isVoiceRecording
                  ? lang === "EN"
                    ? "Release to send"
                    : "Lepas untuk hantar"
                  : lang === "EN"
                    ? "Press and hold the mic, release to send"
                    : "Tekan dan tahan ikut, lepas untuk hantar"}
            </p>

            {voiceBusy ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 size={30} className="animate-spin text-[var(--muted)]" />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-1">
                {isVoiceRecording && (
                  <div className="flex items-center gap-2 text-sm font-semibold tabular-nums text-[#f87171]">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#f87171]" />
                    {Math.floor(voiceSecs / 60)}:{String(voiceSecs % 60).padStart(2, "0")}
                  </div>
                )}
                <button
                  type="button"
                  aria-label={
                    isVoiceRecording
                      ? lang === "EN"
                        ? "Release to send voice message"
                        : "Lepas untuk hantar mesej suara"
                      : lang === "EN"
                        ? "Hold to record"
                        : "Tekan lama untuk rakam"
                  }
                  onPointerDown={(e) => {
                    e.preventDefault()
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId)
                    } catch {}
                    voiceHoldRef.current = true
                    void startVoiceHold()
                  }}
                  onPointerUp={() => endVoiceHold()}
                  onPointerCancel={() => cancelVoice()}
                  onContextMenu={(e) => e.preventDefault()}
                  className={cn(
                    "mx-auto flex h-24 w-24 touch-none select-none items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95",
                    isVoiceRecording ? "animate-pulse bg-[#ef4444]" : "bg-[var(--brand-blue)]"
                  )}
                >
                  <Mic size={40} />
                </button>
                {isVoiceRecording ? (
                  <button
                    type="button"
                    onClick={() => cancelVoice()}
                    className="text-xs font-semibold text-[var(--muted)] underline underline-offset-4"
                  >
                    {lang === "EN" ? "Cancel & discard" : "Batal & buang"}
                  </button>
                ) : (
                  <span className="text-[0.6875rem] font-medium text-[var(--muted)]">
                    {lang === "EN" ? "Press and hold" : "Tekan dan tahan"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {alertModal}
    </div>
  )
}
