"use client"

import { getAccessToken } from "@/lib/auth-session"
import React, { useState, useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  Link2,
  CheckCircle2,
  XCircle,
  Shield,
  Send,
  ArrowRight,
  Smartphone,
  Users,
  Bot,
  CalendarClock,
  RefreshCw,
  AlertCircle,
  Search,
  Zap,
  FileText,
  QrCode,
  Trash2,
  Check,
  LayoutGrid,
  Unlink,
} from "lucide-react"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageChip,
  DesktopPageHeader,
  MobileIconButton,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { cn } from "@/lib/utils"
import { HERO_MUTED, ModenHero, ModenHeroPill, heroPrimaryButtonStyle, heroQuietButtonStyle } from "@/components/ui/ModenHero"
import { useLang } from "@/lib/lang"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "@/components/theme/ThemeProvider"
import { usePageAlert } from "@/hooks/usePageAlert"

const botCommands = [
  { cmd: "makan nasi lemak 8.50", icon: Send },
  { cmd: "gaji 3500", icon: Zap },
  { cmd: "summary", icon: FileText },
  { cmd: "SUBX PAY ASTRO 89.90 TNG", icon: CalendarClock },
]

interface WhatsAppAvailableGroup {
  jid: string
  name: string
  participant_count: number
  announce: boolean
}

interface WhatsAppGroupRule {
  id: number
  group_jid: string
  group_name: string
  trigger_prefix: string
  show_current_balance: boolean
  show_expense_amount: boolean
  show_income_amount: boolean
  is_enabled: boolean
}

/* ── UI Components ── */

const Switch = ({ checked, onChange, disabled = false, isLight = false }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; isLight?: boolean }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
    className={cn(
      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 focus:outline-none disabled:opacity-50",
      checked 
        ? "bg-[var(--btn-primary-bg)]" 
        : (isLight ? "bg-[var(--surface-tint-strong)] border border-[var(--border)]" : "bg-white/20")
    )}
  >
    <motion.span
      animate={{ x: checked ? 18 : 3 }}
      className="pointer-events-none block h-3.5 w-3.5 rounded-full bg-white ring-0 transition-all duration-300"
    />
  </button>
)

/* ── Frontend Logic ── */
export default function WhatsAppPage() {
  const params = useParams()
  const sessionId = params.sessionId as string || ""
  const { t, lang } = useLang()
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'
  // Moden look: outlined cards on one hairline, blue as the only accent.
  const cardClass = "border border-[var(--border)] bg-[var(--card)]"
  const linkAccountCardClass = cardClass
  const pageBackgroundCardClass = cardClass
  const innerCardClass = "border border-[var(--border)] bg-[var(--surface-tint)]"
  const primaryTextClass = "text-[var(--text)]"
  const secondaryTextClass = "text-[var(--text)]"
  const mutedTextClass = "text-[var(--muted)]"
  const iconBgClass = "bg-[#0550B8] !text-white"
  const accentTextClass = "text-[var(--text)]"
  const accentSoftClass = "bg-[#0550B8]/10 text-[#0550B8]"

  const [activeTab, setActiveTab] = useState<"link" | "groups" | "guide">("link")
  
  const [sessionStatus, setSessionStatus] = useState<"loading" | "starting" | "qr" | "pairing" | "connected" | "disconnected" | "quarantined" | "error">("loading")
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [phoneNumber, setPhoneNumber] = useState("")
  const [isPairingLoading, setIsPairingLoading] = useState(false)
  const [isClearingSession, setIsClearingSession] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [hasRequestedQr, setHasRequestedQr] = useState(false)
  const [hasAgreedPrivacy, setHasAgreedPrivacy] = useState(false)
  const [showPrivacyPopup, setShowPrivacyPopup] = useState(false)
  const [personalPrefixModeEnabled, setPersonalPrefixModeEnabled] = useState(false)
  const [personalTriggerPrefix, setPersonalTriggerPrefix] = useState("bd")
  const [isSavingPersonalPrefix, setIsSavingPersonalPrefix] = useState(false)
  const [personalPrefixError, setPersonalPrefixError] = useState("")

  const [availableGroups, setAvailableGroups] = useState<WhatsAppAvailableGroup[]>([])
  const [groupRules, setGroupRules] = useState<WhatsAppGroupRule[]>([])
  const [groupPrefixes, setGroupPrefixes] = useState<Record<string, string>>({})
  const [groupShowBalances, setGroupShowBalances] = useState<Record<string, boolean>>({})
  const [groupShowExpenses, setGroupShowExpenses] = useState<Record<string, boolean>>({})
  const [groupShowIncomes, setGroupShowIncomes] = useState<Record<string, boolean>>({})
  const [isLoadingGroups, setIsLoadingGroups] = useState(false)
  const [groupErrorMsg, setGroupErrorMsg] = useState("")
  const [savingGroupJid, setSavingGroupJid] = useState("")
  const [removingGroupRuleId, setRemovingGroupRuleId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const { showAlert, alertModal } = usePageAlert(lang)

  const fetchGroupSettings = async (isSilent = false) => {
    if (sessionStatus !== "connected") {
      setAvailableGroups([])
      setGroupRules([])
      setGroupPrefixes({})
      setGroupShowBalances({})
      setGroupShowExpenses({})
      setGroupShowIncomes({})
      setGroupErrorMsg("")
      return
    }

    if (!isSilent) setIsLoadingGroups(true)
    try {
      const token = getAccessToken()
      const [availableRes, rulesRes] = await Promise.all([
        fetch("/api/whatsapp/available-groups", {
          credentials: "include",
          headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
        }),
        fetch("/api/whatsapp/groups", {
          credentials: "include",
          headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
        }),
      ])

      const rulesData = rulesRes.ok ? await rulesRes.json() : []
      setGroupRules(rulesData)
      setGroupPrefixes(
        rulesData.reduce((acc: Record<string, string>, rule: WhatsAppGroupRule) => {
          acc[rule.group_jid] = rule.trigger_prefix || "bd"
          return acc
        }, {})
      )
      setGroupShowBalances(
        rulesData.reduce((acc: Record<string, boolean>, rule: WhatsAppGroupRule) => {
          acc[rule.group_jid] = Boolean(rule.show_current_balance)
          return acc
        }, {})
      )
      setGroupShowExpenses(
        rulesData.reduce((acc: Record<string, boolean>, rule: WhatsAppGroupRule) => {
          acc[rule.group_jid] = Boolean(rule.show_expense_amount)
          return acc
        }, {})
      )
      setGroupShowIncomes(
        rulesData.reduce((acc: Record<string, boolean>, rule: WhatsAppGroupRule) => {
          acc[rule.group_jid] = Boolean(rule.show_income_amount)
          return acc
        }, {})
      )

      if (availableRes.ok) {
        const availableData = await availableRes.json()
        setAvailableGroups(availableData)
        setGroupErrorMsg("")
      } else {
        const errorData = await availableRes.json().catch(() => ({}))
        setAvailableGroups([])
        setGroupErrorMsg(errorData.detail || (lang === "EN" ? "Unable to load groups right now." : "Tak dapat ambil senarai group buat masa ini."))
      }
    } catch (err) {
      console.error(err)
      setAvailableGroups([])
      setGroupErrorMsg(lang === "EN" ? "Unable to load groups right now." : "Tak dapat ambil senarai group buat masa ini.")
    } finally {
      if (!isSilent) setIsLoadingGroups(false)
    }
  }

  useEffect(() => {
    if (sessionStatus === "connected") {
      fetchGroupSettings()
    }
  }, [sessionStatus])

  const fetchSession = async () => {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/whatsapp/session", {
        credentials: "include",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (!res.ok) throw new Error("Gagal mengambil status sesi")
      
      const data = await res.json()
      setSessionStatus(data.status)
      if (data.status === "quarantined" || data.requiresRelink) {
        setQrCode(null)
        setPairingCode(null)
        setErrorMsg(lang === "EN"
          ? "WhatsApp session is damaged. Press Reconnect WhatsApp to link it again."
          : "Sesi WhatsApp rosak. Tekan Reconnect WhatsApp untuk sambung semula."
        )
      }
      if (data.qr) {
        setQrCode(data.qr)
      }
      if (data.pairingCode) {
        setPairingCode(data.pairingCode)
      }
      setPersonalPrefixModeEnabled(Boolean(data.personal_prefix_mode_enabled))
      const fetchedPrefix = typeof data.personal_trigger_prefix === "string" ? data.personal_trigger_prefix.trim() : ""
      setPersonalTriggerPrefix(fetchedPrefix || "bd")
      setPersonalPrefixError("")
      if (!(data.status === "quarantined" || data.requiresRelink)) {
        setErrorMsg("")
      }
    } catch (err: unknown) {
      setSessionStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Unknown error")
    }
  }

  async function savePersonalPrefixMode(nextEnabled: boolean, nextPrefix: string) {
    const normalizedPrefix = nextPrefix.trim() || "bd"
    const previousEnabled = personalPrefixModeEnabled
    const previousPrefix = personalTriggerPrefix

    setPersonalPrefixModeEnabled(nextEnabled)
    setPersonalTriggerPrefix(normalizedPrefix)
    setIsSavingPersonalPrefix(true)
    setPersonalPrefixError("")

    try {
      const token = getAccessToken()
      const res = await fetch("/api/whatsapp/session", {
        credentials: "include",
        method: "PATCH",
        headers: {
          ...(token ? { ...(token ? { "Authorization": `Bearer ${token}` } : {}) } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personal_prefix_mode_enabled: nextEnabled,
          personal_trigger_prefix: normalizedPrefix,
        }),
      })
      if (!res.ok) throw new Error("Failed to save personal prefix settings")
      const data = await res.json().catch(() => null)
      if (data && typeof data.personal_prefix_mode_enabled === "boolean") {
        setPersonalPrefixModeEnabled(Boolean(data.personal_prefix_mode_enabled))
      }
      if (data && typeof data.personal_trigger_prefix === "string") {
        setPersonalTriggerPrefix(data.personal_trigger_prefix.trim() || "bd")
      }
      showAlert(
        lang === "EN" ? "Saved" : "Berjaya Disimpan",
        lang === "EN" ? "Personal chat prefix setting updated." : "Tetapan prefix chat personal berjaya dikemaskini.",
        "success"
      )
    } catch (err) {
      console.error("Save personal prefix mode failed", err)
      setPersonalPrefixModeEnabled(previousEnabled)
      setPersonalTriggerPrefix(previousPrefix)
      const message = lang === "EN"
        ? "Failed to save personal prefix setting."
        : "Gagal simpan tetapan prefix personal."
      setPersonalPrefixError(message)
      showAlert(
        lang === "EN" ? "Save Failed" : "Simpan Gagal",
        message,
        "error"
      )
    } finally {
      setIsSavingPersonalPrefix(false)
    }
  }

  async function handlePairing() {
    if (!phoneNumber) return
    setIsPairingLoading(true)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/whatsapp/pair?phone=${phoneNumber}`, {
        credentials: "include",
        method: "POST",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (!res.ok) throw new Error("Gagal menjana kod pautan")
      setSessionStatus("pairing")
      fetchSession()
      showAlert(
        lang === "EN" ? "Pairing Started" : "Pairing Bermula",
        lang === "EN" ? "Pairing code generated successfully." : "Kod pairing berjaya dijana.",
        "success"
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setErrorMsg(message)
      showAlert(
        lang === "EN" ? "Action Failed" : "Tindakan Gagal",
        message,
        "error"
      )
    } finally {
      setIsPairingLoading(false)
    }
  }

  // Poll status every 3 seconds while not connected
  useEffect(() => {
    fetchSession()
    const interval = setInterval(() => {
      if (sessionStatus !== "connected") {
        fetchSession()
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [sessionStatus])

  async function handleLogout() {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/whatsapp/session", {
        credentials: "include",
        method: "DELETE",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (!res.ok) throw new Error(lang === "EN" ? "Failed to unlink WhatsApp account." : "Gagal nyahpaut akaun WhatsApp.")
      setSessionStatus("loading")
      setQrCode(null)
      setHasAgreedPrivacy(false)
      setHasRequestedQr(false)
      fetchSession()
      showAlert(
        lang === "EN" ? "Unlinked" : "Nyahpaut Berjaya",
        lang === "EN" ? "WhatsApp account has been unlinked." : "Akaun WhatsApp telah dinyahpaut.",
        "success"
      )
    } catch (err) {
      console.error("Logout failed", err)
      showAlert(
        lang === "EN" ? "Action Failed" : "Tindakan Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to unlink WhatsApp account." : "Gagal nyahpaut akaun WhatsApp."),
        "error"
      )
    }
  }

  async function handleClearSession() {
    setIsClearingSession(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/whatsapp/session", {
        credentials: "include",
        method: "DELETE",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (!res.ok) throw new Error(lang === "EN" ? "Failed to reset session." : "Gagal reset sesi.")
      setQrCode(null)
      setPairingCode(null)
      setSessionStatus("loading")
      setErrorMsg("")
      setHasAgreedPrivacy(false)
      setHasRequestedQr(false)
      // Wait a moment for the worker to start fresh
      await new Promise(r => setTimeout(r, 2000))
      await fetchSession()
      showAlert(
        lang === "EN" ? "Session Reset" : "Sesi Direset",
        lang === "EN" ? "WhatsApp session reset completed." : "Reset sesi WhatsApp selesai.",
        "success"
      )
    } catch (err) {
      console.error("Clear session failed", err)
      showAlert(
        lang === "EN" ? "Action Failed" : "Tindakan Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to reset session." : "Gagal reset sesi."),
        "error"
      )
    } finally {
      setIsClearingSession(false)
    }
  }

  async function handleSaveGroup(
    group: WhatsAppAvailableGroup,
    overrides?: Partial<{
      trigger_prefix: string
      show_current_balance: boolean
      show_expense_amount: boolean
      show_income_amount: boolean
    }>
  ) {
    setSavingGroupJid(group.jid)
    try {
      const token = getAccessToken()
      const trigger_prefix = (overrides?.trigger_prefix ?? groupPrefixes[group.jid] ?? "bd").trim() || "bd"
      const show_current_balance = Boolean(overrides?.show_current_balance ?? groupShowBalances[group.jid])
      const show_expense_amount = Boolean(overrides?.show_expense_amount ?? groupShowExpenses[group.jid])
      const show_income_amount = Boolean(overrides?.show_income_amount ?? groupShowIncomes[group.jid])
      const res = await fetch("/api/whatsapp/groups", {
        credentials: "include",
        method: "POST",
        headers: {
          ...(token ? { ...(token ? { "Authorization": `Bearer ${token}` } : {}) } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          group_jid: group.jid,
          group_name: group.name,
          trigger_prefix,
          show_current_balance,
          show_expense_amount,
          show_income_amount,
        }),
      })
      if (!res.ok) throw new Error("Failed to save group rule")
      await fetchGroupSettings(true)
      showAlert(
        lang === "EN" ? "Saved" : "Berjaya Disimpan",
        lang === "EN" ? "Group setting updated successfully." : "Tetapan group berjaya dikemaskini.",
        "success"
      )
    } catch (err) {
      console.error("Save group failed", err)
      const message = lang === "EN" ? "Failed to save group rule." : "Gagal simpan tetapan group."
      setGroupErrorMsg(message)
      showAlert(
        lang === "EN" ? "Save Failed" : "Simpan Gagal",
        message,
        "error"
      )
    } finally {
      setSavingGroupJid("")
    }
  }

  async function handleRemoveGroup(ruleId: number) {
    setRemovingGroupRuleId(ruleId)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/whatsapp/groups/${ruleId}`, {
        credentials: "include",
        method: "DELETE",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
      })
      if (!res.ok) throw new Error("Failed to delete group rule")
      await fetchGroupSettings(true)
      showAlert(
        lang === "EN" ? "Removed" : "Berjaya Dibuang",
        lang === "EN" ? "Group setting removed." : "Tetapan group berjaya dibuang.",
        "success"
      )
    } catch (err) {
      console.error("Remove group failed", err)
      const message = lang === "EN" ? "Failed to remove group rule." : "Gagal buang tetapan group."
      setGroupErrorMsg(message)
      showAlert(
        lang === "EN" ? "Action Failed" : "Tindakan Gagal",
        message,
        "error"
      )
    } finally {
      setRemovingGroupRuleId(null)
    }
  }

  const tabs = [
    {
      key: "link" as const,
      label: t.linkAccount,
      mobileLabel: lang === "EN" ? "Link" : "Paut",
      icon: Link2,
    },
    {
      key: "groups" as const,
      label: t.waGroupsTab,
      mobileLabel: lang === "EN" ? "Groups" : "Group",
      icon: Users,
    },
    {
      key: "guide" as const,
      label: t.botGuide,
      mobileLabel: lang === "EN" ? "Guide" : "Panduan",
      icon: FileText,
    },
  ]

  const isLinked = sessionStatus === "connected"
  const needsReconnect = sessionStatus === "quarantined"
  const primaryStatusLabel = isLinked
    ? t.waConnected
    : needsReconnect
      ? (lang === "EN" ? "Reconnect required" : "Perlu sambung semula")
      : t.notConnected
  const primaryStatusTone = isLinked ? "bg-[var(--surface-tint)] text-[var(--muted)]" : "bg-amber-400/10 text-amber-300"

  const startConnect = () => {
    setActiveTab("link")
    if (hasAgreedPrivacy) {
      setHasRequestedQr(true)
      void fetchSession()
    } else {
      setShowPrivacyPopup(true)
    }
  }

  const handleAgreePrivacy = () => {
    setHasAgreedPrivacy(true)
    setShowPrivacyPopup(false)
    setHasRequestedQr(true)
    void fetchSession()
  }

  const desktopHeaderActions = (
    <>
      <DesktopPageChip
        className={cn(
          isLinked
            ? isLight
              ? "border-emerald-100 bg-emerald-50 text-emerald-700"
              : "border-emerald-500/20 bg-[var(--btn-primary-bg)]/10 text-emerald-300"
            : isLight
              ? "border-amber-100 bg-amber-50 text-amber-700"
              : "border-amber-500/20 bg-amber-500/10 text-amber-300",
        )}
      >
        <span className={cn("h-2 w-2 rounded-full", isLinked ? "bg-[var(--btn-primary-bg)]" : "bg-amber-500")} />
        {isLinked ? t.waConnected : t.notConnected}
      </DesktopPageChip>
      {isLinked ? (
        <DesktopPageAction
          onClick={() => void handleLogout()}
          className="border border-red-500/25 bg-red-500/15 text-red-500 shadow-none hover:bg-red-500/20"
        >
          <Unlink strokeWidth={2.5} />
          {lang === "EN" ? "Disconnect" : "Putus"}
        </DesktopPageAction>
      ) : (
        <DesktopPageAction
          onClick={needsReconnect ? () => void handleClearSession() : startConnect}
          disabled={isClearingSession || sessionStatus === "loading" || sessionStatus === "starting"}
        >
          {isClearingSession || sessionStatus === "starting" ? (
            <RefreshCw strokeWidth={2.5} className="animate-spin" />
          ) : (
            <Link2 strokeWidth={2.5} />
          )}
          {needsReconnect
            ? (lang === "EN" ? "Reconnect" : "Sambung semula")
            : (lang === "EN" ? "Connect" : "Sambung")}
        </DesktopPageAction>
      )}
    </>
  )

  const mobileHeaderAction = isLinked ? (
    <MobileIconButton
      onClick={() => void handleLogout()}
      label={lang === "EN" ? "Disconnect" : "Putus"}
      className="bg-red-500/15 text-red-500 shadow-none"
    >
      <Unlink strokeWidth={2.5} />
    </MobileIconButton>
  ) : (
    <MobileIconButton
      onClick={needsReconnect ? () => void handleClearSession() : startConnect}
      disabled={isClearingSession || sessionStatus === "loading" || sessionStatus === "starting"}
      label={
        needsReconnect
          ? (lang === "EN" ? "Reconnect" : "Sambung semula")
          : (lang === "EN" ? "Connect" : "Sambung")
      }
    >
      {isClearingSession || sessionStatus === "starting" ? (
        <RefreshCw strokeWidth={2.5} className="animate-spin" />
      ) : (
        <Link2 strokeWidth={2.5} />
      )}
    </MobileIconButton>
  )

  return (
    // Root must stay tall (header + body). Never wrap sticky topbar in a short-only parent.
    <div className="pb-24 lg:pb-0">
      <div className="lg:hidden">
        <MobilePageHeader
          title="WhatsApp"
          fallbackHref={`/${sessionId}/connector`}
          action={mobileHeaderAction}
        />
      </div>

      <DesktopPageHeader
        className="hidden lg:block"
        title="WhatsApp"
        breadcrumbs={[{ label: lang === "BM" ? "Penyambung" : "Connector", href: `/${sessionId}/connector` }]}
        homeHref={`/${sessionId}`}
        backHref={`/${sessionId}/connector`}
        actions={desktopHeaderActions}
      />

      <DesktopPageBody className="mt-4 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">


      {/* Status: the Moden hero card */}
      <ModenHero
        label={
          <>
            WhatsApp
            <ModenHeroPill dot={isLinked ? "#4ADE80" : needsReconnect ? "#FDBA74" : "var(--hero-muted)"}>
              {sessionStatus === "loading"
                ? (lang === "EN" ? "Checking" : "Menyemak")
                : isLinked
                  ? (lang === "EN" ? "Live" : "Aktif")
                  : (lang === "EN" ? "Offline" : "Tidak aktif")}
            </ModenHeroPill>
          </>
        }
        currency={null}
        amount={
          sessionStatus === "loading"
            ? (lang === "EN" ? "Checking…" : "Menyemak…")
            : isLinked
              ? (lang === "EN" ? "Connected" : "Disambung")
              : needsReconnect
                ? (lang === "EN" ? "Reconnect needed" : "Perlu sambung semula")
                : (lang === "EN" ? "Not connected" : "Belum disambung")
        }
        amountSize="clamp(1.75rem, 7.5vw, 2.5rem)"
        stats={[
          { key: "groups", tone: "neutral", icon: <Users size={16} strokeWidth={2.2} />, label: lang === "EN" ? "Active groups" : "Group aktif", value: groupRules.length },
          { key: "prefix", tone: "neutral", icon: <Bot size={16} strokeWidth={2.2} />, label: lang === "EN" ? "Personal prefix" : "Prefix peribadi", value: <span className="font-mono">{personalPrefixModeEnabled ? personalTriggerPrefix || "-" : (lang === "EN" ? "Off" : "Tutup")}</span> },
        ]}
      >
        <p className="max-w-md text-[0.8125rem] font-medium leading-relaxed" style={{ color: HERO_MUTED }}>
          {isLinked
            ? (lang === "EN" ? "Send expenses and income to the bot from WhatsApp." : "Hantar belanja dan pendapatan kepada bot dari WhatsApp.")
            : (lang === "EN" ? "Link WhatsApp to record with a chat message." : "Paut WhatsApp untuk rekod guna mesej chat.")}
        </p>
        <div className="grid grid-cols-2 gap-2 md:flex">
          {isLinked ? (
            <button
              type="button"
              onClick={() => setActiveTab("groups")}
              className="inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold transition active:scale-[0.98] disabled:opacity-50 md:px-5 [&>svg]:shrink-0"
              style={heroPrimaryButtonStyle}
            >
              <Users size={16} />
              {lang === "EN" ? "Manage groups" : "Urus group"}
            </button>
          ) : (
            <button
              type="button"
              onClick={needsReconnect ? () => void handleClearSession() : startConnect}
              disabled={isClearingSession || sessionStatus === "loading" || sessionStatus === "starting"}
              className="inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold transition active:scale-[0.98] disabled:opacity-50 md:px-5 [&>svg]:shrink-0"
              style={heroPrimaryButtonStyle}
            >
              {isClearingSession || sessionStatus === "starting" ? <RefreshCw size={16} className="animate-spin" /> : <Link2 size={16} />}
              {needsReconnect
                ? (lang === "EN" ? "Reconnect" : "Sambung semula")
                : (
                  <>
                    <span className="md:hidden">{lang === "EN" ? "Connect" : "Sambung"}</span>
                    <span className="hidden md:inline">{lang === "EN" ? "Connect WhatsApp" : "Sambung WhatsApp"}</span>
                  </>
                )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab("guide")}
            className="inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold transition active:scale-[0.98] md:px-5 [&>svg]:shrink-0"
            style={heroQuietButtonStyle}
          >
            <Bot size={16} />
            {lang === "EN" ? "Guide" : "Panduan"}
          </button>
        </div>
      </ModenHero>

      {/* Tabs */}
      <div className="sticky top-2 z-20 flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] p-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "relative z-10 flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2.5 text-[0.75rem] font-semibold transition-colors md:flex-none md:gap-2 md:px-5 md:text-[0.8125rem]",
                isActive
                  ? "!text-white"
                  : "text-[var(--muted)] hover:text-[var(--text)]",
              )}
            >
              {isActive ? (
                <motion.div
                  layoutId="whatsapp-tabs"
                  className="absolute inset-0 -z-10 rounded-full bg-[#0550B8]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              ) : null}
              <tab.icon size={14} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
              <span className="truncate sm:hidden">{tab.mobileLabel}</span>
              <span className="hidden truncate sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        {activeTab === "link" && (
          <motion.div
            key="link"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 md:space-y-5"
          >
            {/* Link Account Card */}
            <div className={cn("flex flex-col items-center space-y-6 rounded-[1.5rem] p-5 text-center transition-all md:space-y-8 md:p-7", linkAccountCardClass)}>
              
              <div className="max-w-md space-y-2.5 md:space-y-4">
                <div className={cn("mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full md:mb-5 md:h-16 md:w-16", iconBgClass)}>
                  <QrCode size={26} className="md:hidden" /><QrCode size={32} className="hidden md:block" />
                </div>
                <h2 className={cn("text-lg font-semibold tracking-tight md:text-3xl md:font-extrabold", primaryTextClass)}>
                  {t.scanQR}
                </h2>
                <p className={cn("text-xs font-medium leading-relaxed md:text-base", mutedTextClass)}>
                  {t.waInstructions}
                </p>
              </div>

              <div className={cn("w-full max-w-xl space-y-3 rounded-[1.25rem] px-4 py-4 md:space-y-4 md:px-6 md:py-5", innerCardClass)}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={cn("text-[0.8125rem] font-semibold tracking-tight md:text-sm md:font-black", primaryTextClass)}>
                      {lang === "EN" ? "Personal Chat Prefix" : "Prefix Chat Personal"}
                    </p>
                    <p className={cn("mt-1 text-[0.6875rem] leading-relaxed md:text-xs", mutedTextClass)}>
                      {lang === "EN"
                        ? "Default OFF: bot replies normally without prefix."
                        : "Default OFF: bot balas seperti biasa tanpa prefix."}
                    </p>
                  </div>
                  <Switch
                    checked={personalPrefixModeEnabled}
                    isLight={isLight}
                    disabled={isSavingPersonalPrefix}
                    onChange={(nextValue) => {
                      void savePersonalPrefixMode(nextValue, personalTriggerPrefix)
                    }}
                  />
                </div>

                {personalPrefixModeEnabled && (
                  <div className={cn("space-y-2 rounded-[1.25rem] border border-[var(--border)] bg-[var(--card)] p-3 md:space-y-3 md:p-4")}>
                    <div className="flex flex-col md:flex-row gap-3">
                      <input
                        type="text"
                        value={personalTriggerPrefix}
                        onChange={(e) => setPersonalTriggerPrefix(e.target.value)}
                        className={cn(
                          "h-10 flex-1 rounded-full border px-4 text-[0.8125rem] font-semibold outline-none transition-all focus:!border-[#0550B8] md:h-11 md:text-sm",
                          "border-[var(--border)] bg-[var(--card)] text-[var(--text)] focus:border-[#0550B8]"
                        )}
                        placeholder={lang === "EN" ? "Example: bd" : "Contoh: bd"}
                      />
                      <button
                        onClick={() => {
                          void savePersonalPrefixMode(true, personalTriggerPrefix)
                        }}
                        disabled={isSavingPersonalPrefix}
                        className={cn(
                          "flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[0.75rem] font-semibold transition-all disabled:opacity-60 md:h-11 md:text-[0.8125rem]",
                          "bg-[#0550B8] !text-white hover:bg-[#04449c]"
                        )}
                      >
                        {isSavingPersonalPrefix ? <RefreshCw size={12} className="animate-spin" /> : <Check size={13} />}
                        Save
                      </button>
                    </div>
                    <p className={cn("text-[0.625rem] font-semibold md:text-[0.6875rem]", mutedTextClass)}>
                      {lang === "EN"
                        ? "Use like: prefix + command (example: `bd makan 12.50`)."
                        : "Guna macam ini: prefix + command (contoh: `bd makan 12.50`)."}
                    </p>
                  </div>
                )}

                {personalPrefixError && (
                  <p className={cn("text-xs font-semibold", isLight ? "text-rose-600" : "text-rose-300")}>
                    {personalPrefixError}
                  </p>
                )}
              </div>

              <div className="group relative mx-auto w-full max-w-[15rem] md:max-w-xs">
                <div className={cn("absolute -inset-6 rounded-2xl blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700", isLight ? "bg-slate-300/30" : "bg-white/10")} />
                
                {(!hasRequestedQr || !hasAgreedPrivacy) && sessionStatus !== "connected" ? (
                  <button
                    onClick={startConnect}
                    className={cn(
                      "relative z-10 flex aspect-square w-full flex-col items-center justify-center space-y-3 rounded-2xl border transition-all duration-300 group-hover:-translate-y-1 md:space-y-5 md:rounded-2xl",
                      "border-dashed border-[var(--border-strong)] bg-[var(--surface-tint)] hover:border-[#0550B8]"
                    )}
                  >
                    <div className={cn("flex h-14 w-14 items-center justify-center rounded-full md:h-20 md:w-20", iconBgClass)}>
                      <QrCode size={28} strokeWidth={2.5} className="md:hidden" /><QrCode size={40} strokeWidth={2.5} className="hidden md:block" />
                    </div>
                    <div className="space-y-1.5">
                      <p className={cn("text-sm font-semibold md:text-base md:font-bold", accentTextClass)}>
                        {lang === "EN" ? "Link WhatsApp" : "Paut WhatsApp"}
                      </p>
                      <p className={cn("text-[0.625rem] font-bold uppercase tracking-wide md:text-[0.6875rem] md:tracking-widest", mutedTextClass)}>
                        {lang === "EN" ? "Click to generate QR" : "Klik untuk kod QR"}
                      </p>
                    </div>
                  </button>
                ) : (sessionStatus === "loading" || sessionStatus === "starting") ? (
                  <div className={cn("relative z-10 flex aspect-square w-full flex-col items-center justify-center space-y-3 rounded-2xl border md:space-y-5 md:rounded-2xl", innerCardClass)}>
                    <RefreshCw className={cn("animate-spin md:hidden", accentTextClass)} size={28} strokeWidth={3} /><RefreshCw className={cn("hidden animate-spin md:block", accentTextClass)} size={40} strokeWidth={3} />
                    <p className={cn("text-xs font-bold uppercase tracking-[0.16em]", accentTextClass)}>
                      {t.generatingQR}
                    </p>
                  </div>
                ) : sessionStatus === "connected" ? (
                  <div className={cn(
                    "relative z-10 flex aspect-square w-full flex-col items-center justify-center space-y-4 rounded-2xl border-2 transition-all md:space-y-6 md:rounded-2xl", 
                    "border-[#0550B8]/30 bg-[#0550B8]/[0.06]"
                  )}>
                    <div className={cn(
                      "flex h-16 w-16 items-center justify-center rounded-full md:h-24 md:w-24",
                      "bg-[#0550B8] !text-white"
                    )}>
                      <CheckCircle2 size={34} strokeWidth={2.5} className="md:hidden" /><CheckCircle2 size={48} strokeWidth={2.5} className="hidden md:block" />
                    </div>
                    <h3 className={cn(
                      "text-sm font-semibold tracking-tight md:text-base md:font-extrabold",
                      "text-[var(--text)]"
                    )}>
                      {t.connectedSuccess}
                    </h3>
                  </div>
                ) : needsReconnect ? (
                  <div className={cn(
                    "relative z-10 flex aspect-square w-full flex-col items-center justify-center space-y-4 rounded-2xl border-2 p-4 text-center md:space-y-5 md:rounded-2xl md:p-6",
                    isLight ? "bg-amber-50/70 border-amber-200" : "bg-amber-400/[0.04] border-amber-400/20"
                  )}>
                    <div className={cn(
                      "mx-auto flex h-14 w-14 items-center justify-center rounded-full md:h-20 md:w-20",
                      isLight ? "bg-amber-500/10 text-amber-700" : "bg-amber-300/10 text-amber-300"
                    )}>
                      <AlertCircle size={28} strokeWidth={2.5} className="md:hidden" /><AlertCircle size={40} strokeWidth={2.5} className="hidden md:block" />
                    </div>
                    <div className="space-y-2">
                      <p className={cn("text-sm font-bold", isLight ? "text-amber-800" : "text-amber-200")}>
                        {lang === "EN" ? "Reconnect Required" : "Perlu Reconnect"}
                      </p>
                      <p className={cn("text-xs font-medium leading-relaxed", mutedTextClass)}>
                        {errorMsg || (lang === "EN" ? "WhatsApp session is damaged. Press Reconnect WhatsApp to link it again." : "Sesi WhatsApp rosak. Tekan Reconnect WhatsApp untuk sambung semula.")}
                      </p>
                    </div>
                    <button
                      onClick={handleClearSession}
                      disabled={isClearingSession}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[0.8125rem] font-semibold transition-all disabled:opacity-60 md:py-3",
                        "bg-[#0550B8] !text-white hover:bg-[#04449c]"
                      )}
                    >
                      {isClearingSession ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                      {lang === "EN" ? "Reconnect WhatsApp" : "Reconnect WhatsApp"}
                    </button>
                  </div>
                ) : sessionStatus === "error" ? (
                  <div className={cn(
                    "relative z-10 flex aspect-square w-full flex-col items-center justify-center space-y-3 rounded-2xl border-2 p-4 text-center md:space-y-5 md:rounded-2xl md:p-6", 
                    isLight ? "bg-red-50/50 border-red-200" : "bg-red-500/[0.02] border-red-500/20"
                  )}>
                    <div className={cn(
                      "mx-auto flex h-14 w-14 items-center justify-center rounded-full md:h-20 md:w-20",
                      isLight ? "bg-red-500/10 text-red-600" : "bg-red-400/10 text-red-400"
                    )}>
                      <XCircle size={28} strokeWidth={2.5} className="md:hidden" /><XCircle size={40} strokeWidth={2.5} className="hidden md:block" />
                    </div>
                    <div className="space-y-2">
                      <p className={cn("text-sm font-bold", isLight ? "text-red-700" : "text-red-400")}>{t.connError}</p>
                      <p className={cn("text-xs font-medium", mutedTextClass)}>{errorMsg}</p>
                    </div>
                  </div>
                ) : sessionStatus === "pairing" ? (
                  <div className={cn("relative z-10 flex aspect-[4/3] w-full flex-col items-center justify-center space-y-4 rounded-2xl border p-4 text-center md:space-y-6 md:rounded-2xl md:p-6", isLight ? "bg-[var(--card2)]" : "bg-white/[0.02] border-white/10")}>
                    <Smartphone size={28} strokeWidth={2.5} className={cn("md:hidden", accentTextClass)} /><Smartphone size={36} strokeWidth={2.5} className={cn("hidden md:block", accentTextClass)} />
                    <div className="space-y-4 w-full">
                      <p className={cn("text-[0.625rem] font-bold uppercase tracking-widest", mutedTextClass)}>
                        {t.yourPairingCode}
                      </p>
                      {pairingCode ? (
                        <div className="flex gap-2.5 justify-center">
                          {pairingCode.split('').map((char, i) => (
                            <span key={i} className={cn(
                              "flex h-10 w-9 items-center justify-center rounded-xl border text-xl font-bold transition-transform hover:-translate-y-1 md:h-14 md:w-12 md:rounded-xl md:text-3xl md:font-black", 
                              "border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                            )}>
                              {char}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className={cn("flex items-center justify-center gap-2.5 text-sm font-bold", mutedTextClass)}>
                          <RefreshCw size={16} className="animate-spin" />
                          {t.generatingCode}
                        </div>
                      )}
                    </div>
                  </div>
                ) : qrCode ? (
                  <div className={cn("relative z-10 rounded-[1.5rem] border border-[var(--border)] bg-white p-3 transition-all duration-300 md:p-5")}>
                    <img src={qrCode} alt="WhatsApp QR Code" className="aspect-square h-auto w-full rounded-2xl object-contain md:rounded-2xl" />
                  </div>
                ) : null}
              </div>

              <div className={cn("w-full max-w-xl rounded-[1.25rem] px-4 py-4 text-left md:px-6 md:py-5", innerCardClass)}>
                <div className="flex items-start gap-3">
                  <div className={cn("mt-0.5 flex h-8 w-8 items-center justify-center rounded-full md:h-9 md:w-9", accentSoftClass)}>
                    <Bot size={16} />
                  </div>
                  <div className="space-y-1.5">
                    <p className={cn("text-[0.625rem] font-bold uppercase tracking-[0.12em] md:text-[0.6875rem] md:font-black md:tracking-[0.16em]", accentTextClass)}>
                      {lang === "EN" ? "Verify Test" : "Ujian Verify"}
                    </p>
                    <p className={cn("text-xs font-semibold leading-relaxed md:text-sm", secondaryTextClass)}>
                      {lang === "EN"
                        ? "After link and verify, type this to trigger bot:"
                        : "Lepas link dan verify, taip ini untuk trigger bot:"}
                    </p>
                    <p className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[0.6875rem] font-bold tracking-wide md:px-3 md:text-xs md:font-black", "bg-[#0550B8] !text-white")}>
                      {personalPrefixModeEnabled ? `${personalTriggerPrefix} summary` : "summary"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Pairing Code Fallback */}
              {hasRequestedQr && (sessionStatus === "qr" || sessionStatus === "starting" || sessionStatus === "error") && (
                <div className="flex w-full max-w-sm flex-col space-y-3 border-t border-slate-200/20 pt-5 md:space-y-5 md:pt-8">
                  <p className={cn("text-[0.6875rem] font-bold uppercase tracking-[0.16em]", mutedTextClass)}>
                    {lang === "EN" ? "Or link with phone number" : "Atau paut dengan nombor telefon"}
                  </p>
                  <div className="flex flex-col gap-3">
                    <div className="relative">
                      <input
                        type="tel"
                        placeholder={t.phonePlaceholder}
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className={cn(
                          "w-full rounded-full border px-4 py-3 pl-11 text-sm font-semibold transition-all focus:outline-none focus:ring-0 focus:!border-[#0550B8] md:px-5 md:py-3.5 md:pl-14 md:text-base",
                          "border-[var(--border)] bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--muted)]"
                        )}
                      />
                      <Smartphone size={16} className={cn("absolute left-4 top-1/2 -translate-y-1/2 md:hidden", mutedTextClass)} /><Smartphone size={20} className={cn("absolute left-5 top-1/2 hidden -translate-y-1/2 md:block", mutedTextClass)} />
                    </div>
                    <button
                      onClick={handlePairing}
                      disabled={isPairingLoading || !phoneNumber}
                      className={cn(
                        "flex h-12 w-full items-center justify-center rounded-full px-5 text-sm font-semibold transition-all active:scale-[0.99] disabled:opacity-50", 
                        "bg-[#0550B8] !text-white hover:bg-[#04449c]"
                      )}
                    >
                      {isPairingLoading ? <RefreshCw size={18} className="animate-spin" /> : t.getCode}
                    </button>
                  </div>
                </div>
              )}

              {/* Clear Session / Reset Button */}
              {hasRequestedQr && (sessionStatus === "qr" || sessionStatus === "error" || sessionStatus === "disconnected") && (
                <div className="w-full max-w-sm">
                  <button
                    onClick={handleClearSession}
                    disabled={isClearingSession}
                    className={cn("flex h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[0.8125rem] font-semibold transition-all", 
                      "border border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500"
                    )}
                  >
                    {isClearingSession ? (
                      <><RefreshCw size={16} className="animate-spin" /> {t.clearingSession}</>
                    ) : (
                      <><Trash2 size={16} /> {t.clearSessionBtn}</>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Mode Info */}
              <div className={cn("flex items-start gap-3 border-t pt-4 md:gap-4 md:pt-6", "border-[var(--border)]")}>
              <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full md:h-11 md:w-11", accentSoftClass)}>
                <Shield size={16} strokeWidth={2.5} className="md:hidden" /><Shield size={20} strokeWidth={2.5} className="hidden md:block" />
              </div>
              <div>
                <h3 className={cn("text-[0.6875rem] font-semibold uppercase tracking-[0.1em] md:text-sm md:tracking-[0.12em]", accentTextClass)}>
                  {t.securityPrivacy}
                </h3>
                <p className={cn("mt-1.5 text-xs leading-relaxed md:mt-2 md:text-sm", secondaryTextClass)}>
                  {t.securityDesc}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "groups" && (
          <motion.div
            key="groups"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 md:space-y-5"
          >
            <div className={cn("rounded-[1.5rem] p-4 transition-all md:p-8", pageBackgroundCardClass)}>
              <div className={cn("mb-4 rounded-[1.25rem] px-4 py-4 md:mb-5 md:px-6 md:py-5", innerCardClass)}>
                <div className="flex items-start justify-between gap-3 md:gap-4">
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className={cn("flex h-9 w-9 items-center justify-center rounded-full md:h-12 md:w-12", iconBgClass)}>
                      <Users size={17} className="md:hidden" /><Users size={22} className="hidden md:block" />
                    </div>
                    <div>
                      <h3 className={cn("text-base font-semibold tracking-tight md:text-2xl md:font-black", primaryTextClass)}>
                        {lang === "EN" ? "Allowed Groups" : "Group Dibenarkan"}
                      </h3>
                      <p className={cn("mt-1 text-xs md:mt-1.5 md:text-sm", mutedTextClass)}>
                        {lang === "EN"
                          ? "Enable only groups you want the bot to respond to."
                          : "Aktifkan hanya group yang anda mahu bot respon."}
                      </p>
                    </div>
                  </div>
                  {isLinked && (
                    <button
                      onClick={() => fetchGroupSettings()}
                      disabled={isLoadingGroups}
                      className={cn(
                        "flex h-9 items-center gap-1.5 rounded-full border px-4 text-[0.75rem] font-semibold transition-all disabled:opacity-50 md:h-10 md:gap-2",
                        "border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--surface-tint)]"
                      )}
                    >
                      <RefreshCw size={12} className={cn("md:hidden", isLoadingGroups && "animate-spin")} /><RefreshCw size={14} className={cn("hidden md:block", isLoadingGroups && "animate-spin")} />
                      {lang === "EN" ? "Refresh" : "Segar"}
                    </button>
                  )}
                </div>
              </div>

              {!isLinked ? (
                <div className={cn("rounded-2xl border border-dashed px-4 py-8 text-center md:rounded-2xl md:px-8 md:py-12", "border-[var(--border-strong)] bg-[var(--surface-tint)]")}>
                  <Smartphone size={24} className={cn("mx-auto mb-2 md:hidden", mutedTextClass)} /><Smartphone size={30} className={cn("mx-auto mb-3 hidden md:block", mutedTextClass)} />
                  <p className={cn("text-xs font-semibold md:text-sm md:font-bold", mutedTextClass)}>
                    {lang === "EN"
                      ? "Connect WhatsApp first before setting allowed groups."
                      : "Sambungkan WhatsApp dahulu sebelum tetapkan group dibenarkan."}
                  </p>
                </div>
              ) : groupErrorMsg ? (
                <div className={cn("rounded-2xl border p-4 text-center md:rounded-2xl md:p-5", isLight ? "border-rose-200 bg-rose-50 text-rose-600" : "border-rose-500/30 bg-rose-500/10 text-rose-300")}>
                  <AlertCircle size={24} className="mx-auto mb-2" />
                  <p className="text-xs font-semibold md:text-sm md:font-bold">{groupErrorMsg}</p>
                </div>
              ) : availableGroups.length === 0 ? (
                <div className={cn("rounded-2xl border border-dashed px-4 py-8 text-center md:rounded-2xl md:px-8 md:py-12", "border-[var(--border-strong)] bg-[var(--surface-tint)] text-[var(--muted)]")}>
                  <Users size={24} className="mx-auto mb-2 opacity-70 md:hidden" /><Users size={30} className="mx-auto mb-3 hidden opacity-70 md:block" />
                  <p className={cn("text-base font-semibold tracking-tight md:text-lg md:font-black", primaryTextClass)}>
                    {lang === "EN" ? "No groups found yet" : "Belum jumpa group lagi"}
                  </p>
                  <p className={cn("mt-1 text-xs md:text-sm", mutedTextClass)}>
                    {lang === "EN"
                      ? "Join the group with this WhatsApp account, then refresh."
                      : "Pastikan akaun ini sudah join group, kemudian segarkan."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 md:space-y-4">
                  <div className={cn("rounded-[1.25rem] border border-[var(--border)] bg-[var(--card)] p-3 md:p-4")}>
                    <div className="flex flex-col md:flex-row gap-3 md:items-center">
                      <div className="relative flex-1">
                        <Search size={16} className={cn("absolute left-3 top-1/2 -translate-y-1/2", mutedTextClass)} />
                        <input
                          type="text"
                          placeholder={lang === "EN" ? "Search groups..." : "Cari group..."}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className={cn(
                            "h-10 w-full rounded-full border pl-9 pr-3 text-[0.8125rem] font-semibold outline-none transition-all md:h-11 md:pr-4 md:text-sm",
                            "border-[var(--border)] bg-[var(--card)] text-[var(--text)] focus:border-[#0550B8]"
                          )}
                        />
                      </div>
                      <div className={cn("rounded-full px-3 py-1.5 text-[0.75rem] font-semibold", "border border-[var(--border)] text-[var(--muted)]")}>
                        {availableGroups.length} {lang === "EN" ? "groups" : "group"}
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const filtered = availableGroups.filter((g) =>
                      g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      g.jid.toLowerCase().includes(searchQuery.toLowerCase())
                    )

                    if (filtered.length === 0 && searchQuery) {
                      return (
                        <div className={cn("rounded-2xl border border-dashed py-8 text-center md:rounded-2xl md:py-12", isLight ? "border-slate-200 bg-[var(--card2)]/50" : "border-white/10 bg-white/[0.02]")}>
                          <Users size={28} className={cn("mx-auto mb-2", mutedTextClass)} />
                          <p className={cn("text-xs font-semibold md:text-sm md:font-bold", mutedTextClass)}>
                            {lang === "EN" ? `No groups for "${searchQuery}"` : `Tiada group untuk "${searchQuery}"`}
                          </p>
                        </div>
                      )
                    }

                    return (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {filtered.map((group) => {
                          const existingRule = groupRules.find((rule) => rule.group_jid === group.jid)
                          const prefixValue = groupPrefixes[group.jid] ?? existingRule?.trigger_prefix ?? "bd"
                          const showCurrentBalance = groupShowBalances[group.jid] ?? existingRule?.show_current_balance ?? false
                          const showExpenseAmount = groupShowExpenses[group.jid] ?? existingRule?.show_expense_amount ?? false
                          const showIncomeAmount = groupShowIncomes[group.jid] ?? existingRule?.show_income_amount ?? false
                          const isEnabled = !!existingRule
                          const isLoading = savingGroupJid === group.jid || removingGroupRuleId === existingRule?.id

                          if (!isEnabled) {
                            return (
                              <div
                                key={group.jid}
                                className={cn(
                                  "flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 md:px-4"
                                )}
                              >
                                <div className="min-w-0">
                                  <p className={cn("truncate text-sm font-bold", primaryTextClass)}>{group.name}</p>
                                  <p className={cn("mt-0.5 truncate text-[0.6875rem]", mutedTextClass)}>{group.participant_count} {lang === "EN" ? "members" : "ahli"}</p>
                                </div>
                                <button
                                  onClick={() => handleSaveGroup(group)}
                                  disabled={isLoading}
                                  className={cn(
                                    "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-[0.75rem] font-semibold transition-all disabled:opacity-60",
                                    "bg-[#0550B8] !text-white hover:bg-[#04449c]"
                                  )}
                                >
                                  {isLoading ? <RefreshCw size={12} className="animate-spin" /> : <Check size={13} />}
                                  {lang === "EN" ? "Activate" : "Aktifkan"}
                                </button>
                              </div>
                            )
                          }

                          const responseToggles = [
                            {
                              key: "balance",
                              checked: showCurrentBalance,
                              label: lang === "EN" ? "Balance" : "Baki",
                              setChecked: (value: boolean) => setGroupShowBalances((prev) => ({ ...prev, [group.jid]: value })),
                              buildOverrides: (value: boolean) => ({
                                show_current_balance: value,
                                show_expense_amount: showExpenseAmount,
                                show_income_amount: showIncomeAmount,
                              }),
                            },
                            {
                              key: "expense",
                              checked: showExpenseAmount,
                              label: lang === "EN" ? "Expenses" : "Belanja",
                              setChecked: (value: boolean) => setGroupShowExpenses((prev) => ({ ...prev, [group.jid]: value })),
                              buildOverrides: (value: boolean) => ({
                                show_current_balance: showCurrentBalance,
                                show_expense_amount: value,
                                show_income_amount: showIncomeAmount,
                              }),
                            },
                            {
                              key: "income",
                              checked: showIncomeAmount,
                              label: lang === "EN" ? "Income" : "Income",
                              setChecked: (value: boolean) => setGroupShowIncomes((prev) => ({ ...prev, [group.jid]: value })),
                              buildOverrides: (value: boolean) => ({
                                show_current_balance: showCurrentBalance,
                                show_expense_amount: showExpenseAmount,
                                show_income_amount: value,
                              }),
                            },
                          ]

                          return (
                            <div
                              key={group.jid}
                              className={cn(
                                "overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] transition-all",
                                isEnabled && (isLight ? "" : "")
                              )}
                            >
                              <div className="flex items-center justify-between gap-3 p-3 md:gap-3 md:px-4 md:py-3">
                                <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
                                  <div className={cn(
                                    "flex h-9 w-9 items-center justify-center rounded-full",
                                    isEnabled
                                      ? "bg-[#0550B8] !text-white"
                                      : "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]"
                                  )}>
                                    <Users size={16} className="md:hidden" /><Users size={18} className="hidden md:block" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className={cn("truncate text-[0.8125rem] font-semibold tracking-tight md:text-[0.875rem] md:font-bold", primaryTextClass)}>{group.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className={cn("text-[0.5625rem] font-bold uppercase tracking-wide md:text-[0.625rem] md:tracking-widest", mutedTextClass)}>
                                        {group.participant_count} {lang === "EN" ? "members" : "ahli"}
                                      </span>
                                      <span
                                        className={cn(
                                          "rounded-full px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wide md:px-2 md:text-[0.5625rem] md:font-black md:tracking-widest",
                                          isEnabled
                                            ? "bg-[#0550B8]/10 text-[#0550B8]"
                                            : (isLight ? "bg-[var(--card2)] text-slate-500" : "bg-white/[0.08] text-white/50")
                                        )}
                                      >
                                        {isEnabled ? (lang === "EN" ? "Active" : "Aktif") : (lang === "EN" ? "Off" : "Tutup")}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <Switch
                                  checked={isEnabled}
                                  isLight={isLight}
                                  disabled={isLoading}
                                  onChange={() => {
                                    if (isEnabled) {
                                      handleRemoveGroup(existingRule.id)
                                    } else {
                                      handleSaveGroup(group)
                                    }
                                  }}
                                />
                              </div>

                              <AnimatePresence>
                                {isEnabled && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.22 }}
                                  >
                                    <div className={cn("border-t px-3 pb-3 md:px-4 md:pb-3", "border-[var(--border)]")}>
                                      <div className="grid grid-cols-1 items-center gap-2 pt-2.5 md:grid-cols-[72px_1fr_auto] md:gap-2 md:pt-2">
                                        <label className={cn("text-[0.5625rem] font-bold uppercase tracking-wide md:text-[0.625rem] md:font-black md:tracking-widest", mutedTextClass)}>
                                          {lang === "EN" ? "Prefix" : "Prefix"}
                                        </label>
                                        <input
                                          type="text"
                                          value={prefixValue}
                                          onChange={(e) => setGroupPrefixes((prev) => ({ ...prev, [group.jid]: e.target.value }))}
                                          className={cn(
                                            "h-9 rounded-full border px-3.5 font-mono text-[0.8125rem] font-semibold outline-none transition-all",
                                            "border-[var(--border)] bg-[var(--card)] text-[var(--text)] focus:border-[#0550B8]"
                                          )}
                                        />
                                        <button
                                          onClick={() => handleSaveGroup(group)}
                                          disabled={isLoading}
                                          className={cn(
                                            "flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-[0.75rem] font-semibold transition-all disabled:opacity-60",
                                            "bg-[#0550B8] !text-white hover:bg-[#04449c]"
                                          )}
                                        >
                                          {isLoading ? <RefreshCw size={12} className="animate-spin" /> : <Check size={13} />}
                                          Save
                                        </button>
                                      </div>

                                      <div className="mt-2">
                                        <p className={cn("mb-1.5 text-[0.5625rem] font-bold uppercase tracking-wide md:text-[0.5625rem] md:font-bold md:tracking-wide", mutedTextClass)}>
                                          {lang === "EN" ? "Response Options" : "Option Balasan"}
                                        </p>
                                        <div className="grid grid-cols-3 gap-1.5">
                                          {responseToggles.map((toggle) => {
                                            const handleToggleChange = (nextChecked: boolean) => {
                                              if (isLoading) return
                                              toggle.setChecked(nextChecked)
                                              void handleSaveGroup(group, toggle.buildOverrides(nextChecked))
                                            }

                                            return (
                                              <div
                                                key={toggle.key}
                                                className={cn(
                                                  "flex h-9 items-center justify-between gap-2 rounded-full pl-3 pr-1.5 transition-all",
                                                  toggle.checked
                                                    ? "border border-[#0550B8]/30 bg-[#0550B8]/10"
                                                    : "border border-[var(--border)] bg-[var(--surface-tint)]"
                                                )}
                                              >
                                                <span className={cn(
                                                  "text-[0.625rem] font-semibold tracking-tight md:text-[0.6875rem] md:font-semibold",
                                                  toggle.checked
                                                    ? "text-[#0550B8]"
                                                    : "text-[var(--text-soft)]"
                                                )}>
                                                  {toggle.label}
                                                </span>
                                                <Switch
                                                  checked={toggle.checked}
                                                  isLight={isLight}
                                                  disabled={isLoading}
                                                  onChange={handleToggleChange}
                                                />
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )
                        })}
                        </div>
                    )
                  })()}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === "guide" && (
          <motion.div
            key="guide"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-5 md:space-y-8"
          >
            <div className={cn("rounded-[1.5rem] p-5 transition-all md:p-8", pageBackgroundCardClass)}>
              <div className="mb-5 flex items-center gap-3 md:mb-8 md:gap-4">
                <div className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full md:h-14 md:w-14", iconBgClass)}>
                  <Bot size={22} className="md:hidden" /><Bot size={26} className="hidden md:block" />
                </div>
                <div className="min-w-0">
                  <h2 className={cn("text-lg font-bold tracking-tight md:text-2xl md:font-extrabold", primaryTextClass)}>
                    {t.howToUse}
                  </h2>
                  <p className={cn("mt-0.5 text-xs md:text-sm", mutedTextClass)}>
                    {lang === "EN" ? "Get started in 4 quick steps" : "Mula dalam 4 langkah pantas"}
                  </p>
                </div>
              </div>

              <div className="relative mb-6 md:mb-8">
                <div className={cn("absolute left-[1.0625rem] top-3 bottom-3 w-px md:left-[1.3125rem]", "bg-[var(--border)]")} />
                <div className="space-y-2.5 md:space-y-3">
                  {[
                    { step: 1, title: t.guideStep1, desc: t.guideStep1Desc, icon: Smartphone },
                    { step: 2, title: t.guideStep2, desc: t.guideStep2Desc, icon: Send },
                    { step: 3, title: t.guideStep3, desc: t.guideStep3Desc, icon: CheckCircle2 },
                    { step: 4, title: lang === "EN" ? "Try Commands" : "Cuba Perintah", desc: lang === "EN" ? "Try typing `summary` or `checkwallet`." : "Cuba taip `summary` atau `checkwallet`.", icon: Zap },
                  ].map((item, idx) => (
                    <div key={idx} className={cn("relative flex items-start gap-3.5 rounded-2xl border p-3 transition-all md:gap-4 md:p-4", innerCardClass)}>
                      <div className={cn("relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold md:h-11 md:w-11 md:text-base", iconBgClass)}>
                        {item.step}
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <h3 className={cn("text-sm font-bold tracking-tight md:text-base", primaryTextClass)}>{item.title}</h3>
                        <p className={cn("mt-1 text-xs leading-relaxed md:text-sm", mutedTextClass)}>{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={cn("border-t pt-4 md:pt-6", "border-[var(--border)]")}>
                <h3 className={cn("mb-3 text-sm font-bold tracking-tight md:mb-4 md:text-base", primaryTextClass)}>
                  {lang === "EN" ? "Example Messages" : "Contoh Mesej"}
                </h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-3">
                  {botCommands.map((c, idx) => (
                    <div key={idx} className={cn("flex items-center gap-3 rounded-2xl border p-3 transition-all", innerCardClass)}>
                      <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full md:h-10 md:w-10", accentSoftClass)}>
                        <c.icon size={16} strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0">
                        <span className={cn("text-[0.625rem] font-bold uppercase tracking-wide", mutedTextClass)}>
                          {idx === 0 ? t.expense : idx === 1 ? t.income : t.summary}
                        </span>
                        <p className={cn("truncate font-mono text-xs font-semibold md:text-sm", primaryTextClass)}>{c.cmd}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Auto-Mapping Info Box */}
            <div className={cn("flex flex-col items-center justify-between gap-4 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--text)] transition-all md:flex-row md:gap-6 md:p-8")}>
              <div className="flex items-start gap-3 md:gap-4">
                <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#0550B8] !text-white md:h-12 md:w-12")}>
                  <Zap size={18} className="md:hidden" /><Zap size={22} className="hidden md:block" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight md:text-lg md:font-extrabold">
                    {t.smartCategory}
                  </h3>
                  <p className={cn("mt-1 text-xs leading-relaxed md:mt-1.5 md:max-w-md md:text-sm", "text-[var(--muted)]")}>
                    {t.smartCategoryDesc}
                  </p>
                </div>
              </div>
              <Link href={`/${sessionId}/categories`} className={cn("flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-[#0550B8] px-5 text-[0.8125rem] font-semibold !text-white transition-all hover:bg-[#04449c] md:w-auto")}>
                {t.manageCategories}
                <ArrowRight size={16} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </DesktopPageBody>
      {alertModal}

      {showPrivacyPopup && (
        <div className="fixed inset-0 z-[530] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setShowPrivacyPopup(false)} />
          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "relative w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 shadow-2xl",
              "border border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
            )}
            style={{ borderRadius: "1.5rem" }}
          >
            <button
              type="button"
              onClick={() => setShowPrivacyPopup(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition hover:text-[var(--text)] hover:bg-[var(--surface-tint)]"
            >
              <XCircle size={18} />
            </button>

            <div className={cn(
              "mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#0550B8] !text-white"
            )}>
              <Shield size={26} strokeWidth={2} />
            </div>

            <h3 className="text-xl font-black tracking-tight mb-3">
              {t.waPrivacyTitle}
            </h3>

            <div className={cn(
              "whitespace-pre-line text-sm leading-relaxed mb-6",
              "text-[var(--muted)]"
            )}>
              {t.waPrivacyNotice}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowPrivacyPopup(false)}
                className={cn(
                  "flex-1 h-12 rounded-full border border-[var(--border)] bg-[var(--card)] text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[var(--surface-tint)] active:scale-[0.98]"
                )}
              >
                {t.waPrivacyDisagree}
              </button>
              <button
                type="button"
                onClick={handleAgreePrivacy}
                className="flex-1 h-12 rounded-full bg-[#0550B8] text-sm font-semibold transition hover:bg-[#04449c] active:scale-[0.98]"
                style={{ color: "#ffffff" }}
              >
                {t.waPrivacyAgree}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
