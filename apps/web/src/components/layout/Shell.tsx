"use client";

import { createPortal } from "react-dom";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  usePathname,
  useRouter,
  useParams,
  useSearchParams,
} from "next/navigation";
import dynamic from "next/dynamic";
import { ChatNavIcon } from "@/components/navigation/ChatNavIcon";
import { setupVoiceMedia } from "@/lib/voice-media";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import {
  NavCalcIcon,
  NavHomeIcon,
  NavMoreIcon,
  NavReceiptsIcon,
  NavTxnIcon,
  NavWalletIcon,
} from "@/components/navigation/MobileBottomNavIcons";
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  LayoutDashboard,
  Receipt,
  Settings,
  MessageSquare,
  MessageCircle,
  MessageCircleMore,
  Bot,
  Send,
  MapPinned,
  MapPin,
  HandCoins,
  CreditCard,
  Home,
  Grid2X2,
  Boxes,
  Wallet,
  FileSpreadsheet,
  Landmark,
  Sparkles,
  Search,
  Menu,
  X,
  Check,
  Delete,
  MinusCircle,
  Plus,
  Loader2,
  LogOut,
  Lock,
  Bell,
  AlertCircle,
  AlertTriangle,
  ScrollText,
  Info,
  User,
  UserCircle2,
  UserPlus,
  ChevronRight,
  Calculator as CalculatorIcon,
  CalendarDays,
  Award,
  ChevronDown,
  Briefcase,
  Package,
  Truck,
  DollarSign,
  ShieldCheck,
  Shield,
  Globe,
  Palette,
  Images,
  Car,
  Users,
  Heart,
  Mic,
  Pill,
  type LucideIcon,
} from "lucide-react";
import { cn, getTodayDateInTimeZone } from "@/lib/utils";
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose";
import { useRealtime } from "@/hooks/useRealtime";
import { useLang } from "@/lib/lang";
import ThemeToggle from "@/components/theme/ThemeToggle";
import HistoryBackButton from "@/components/navigation/HistoryBackButton";
import { useTheme } from "@/components/theme/ThemeProvider";
import { SidebarWeatherClock } from "@/components/layout/SidebarWeatherClock";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { writeSmartBackRoute } from "@/lib/smart-back";
import {
  AUTH_SESSION_CHANGED_EVENT,
  clearAuthSession,
  ensureSessionId,
  getAccessToken,
  getRefreshToken,
  getEmailVerified,
  getSessionId,
  hasPinEnabledSession,
  setEmailVerified,
  isCookieAuthSentinel,
  logoutAuthSession,
} from "@/lib/auth-session";
import { getAccounts, getActiveEmail, switchToAccount, removeAccount, addAccount, syncCurrentAccountToProfile, type AccountProfile } from "@/lib/multi-account"
import { signInWithGoogleProfile } from "@/lib/firebase"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose";
import { fetchApiJson, readApiCache, writeApiCache } from "@/lib/api-cache";
import Turnstile from "@/components/auth/Turnstile"
import BadgeOverviewModal from "@/components/badges/BadgeOverviewModal";
import Calculator from "@/components/calculator/Calculator";
import { CatPlayground } from "@/components/dashboard/CatPlayground";
import {
  APP_BADGES,
  deriveEarnedBadgeKeys,
  type BadgeBudgetItemLike,
  type BadgeTransactionLike,
} from "@/lib/badges";
import {
  SHARED_TRANSACTION_TOKEN_QUERY_KEY,
  getActiveSharedTransactionTokenStorageKey,
  getSharedTransactionPinBypassStorageKey,
} from "@/lib/share-target";

const ChatPageContent = dynamic(() => import("@/app/[sessionId]/chat/page"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
    </div>
  ),
});

type MobileHeaderMeta = {
  title: string;
  subtitle: string;
  eyebrow: string;
  icon: LucideIcon;
  backHref: string | null;
};

type NoticeBannerItem = {
  enabled: boolean;
  type: "info" | "warning" | "alert";
  title_bm?: string;
  message_bm?: string;
  title_en?: string;
  message_en?: string;
  title?: string;
  message?: string;
};


type ShellStats = {
  balance: number;
  income_month?: number;
  expense_month?: number;
  safe_balance?: number;
};

type ShellUser = {
  name: string;
  email?: string;
  is_admin?: boolean;
  email_verified?: boolean;
  verification_email_sent_at?: string;
  verification_email_resend_count?: number;
  created_at?: string;
  avatar_url?: string | null;
  show_hero_amounts?: boolean | null;
};

type ShellCategory = {
  id: number;
  name: string;
  kind?: "expense" | "income";
};

type ShellWallet = {
  id: number;
  name: string;
  label?: string | null;
  is_bot_default?: boolean;
};

type ShellTransaction = {
  txn_date: string;
  amount?: number | null;
  type?: "expense" | "income" | string | null;
  is_wallet_transfer?: boolean | null;
  is_debt_movement?: boolean | null;
  source_channel?: string | null;
  attachment_count?: number | null;
};

type ShellBudgetItem = {
  budget_amount: number;
  progress_percent: number;
};

type PinStatus = {
  enabled?: boolean;
};

const PIN_STATUS_CACHE_TTL_MS = 5 * 60 * 1000;
const PIN_STATUS_REVALIDATE_MS = 15 * 1000;

type ShellBadge = {
  key: string;
  title: string;
  titleEN: string;
  desc: string;
  descEN: string;
  status: "unlocked" | "locked";
  icon: "verified" | "active" | "streak" | "budget" | "receipt" | "bot";
};

type AddFormState = {
  description: string;
  amount: string;
  category: string;
  wallet_id: string;
  type: "expense" | "income";
  date: string;
};

type AddItemState = {
  name: string;
  quantity: string;
  unit_price: string;
};

function createDefaultAddForm(timezone: string): AddFormState {
  return {
    description: "",
    amount: "",
    category: "",
    wallet_id: "",
    type: "expense",
    date: getTodayDateInTimeZone(timezone),
  };
}

function createDefaultAddItems(): AddItemState[] {
  return [{ name: "", quantity: "1", unit_price: "0" }];
}

/** Pull the concise fields out of the bot's saved-transaction reply. */
function parseVoiceSavedReply(reply: string, fallbackNote: string) {
  // Tolerate any leading decoration: bullet (•, -, ·, ▪), bold markers (*),
  // bold-wrapped labels (*Nota:*), plus BM/EN label aliases.
  const value = (name: string) => {
    const match = reply.match(
      new RegExp(
        `^[\\s\\u2022\\u2023\\u2219\\u00b7\\u25aa*\\-]*\\*?(?:${name})\\*?\\s*:\\s*(.+)$`,
        "im",
      ),
    );
    if (!match) return "";
    return (match[1] || "").replace(/\*+/g, "").replace(/\s+/g, " ").trim();
  };
  const amount =
    value("Amount|Amaun|Jumlah") ||
    ((reply.match(/RM\s*([\d][\d.,]*)/) || ["", ""])[1] || "").trim();
  const note = value("Note|Nota|Perihal|Description") || fallbackNote;
  const category = value("Category|Kategori");
  // Bullet is "• Wallet: *TOUCH & GO | RM -16.72*" — the balance after " | "
  // is wallet state, not part of the wallet name; drop it.
  const wallet = (value("Wallet|Dompet") || "").split(/\s*\|\s*/)[0];
  const refMatch = reply.match(/\b(TXN\d{2}-[A-Z0-9]{6})\b/);
  return {
    amount: amount.replace(/^RM\s*/i, ""),
    note,
    category,
    wallet,
    ref: refMatch ? refMatch[1] : "",
  };
}

/**
 * Preferred WebM/Opus recorder config so every client (incl. Android WebView)
 * lands on the server's ogg/webm→WAV conversion chain (EQ + trim). WebView
 * defaults can pick AAC/mp4 which skips that chain. Falls back to the engine
 * default when Opus is unsupported. `true` ideal-style constraint booleans
 * degrade silently rather than throwing OverconstrainedError.
 */
function preferredVoiceMime(): MediaRecorderOptions | undefined {
  if (
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function" &&
    MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
  ) {
    return { mimeType: "audio/webm;codecs=opus" };
  }
  return undefined;
}

function getPreferredCategoryName(
  categories: ShellCategory[],
  type: AddFormState["type"],
  currentCategory = "",
): string {
  const matchingCategories = categories.filter(
    (category) => category.kind === type,
  );
  if (
    matchingCategories.some((category) => category.name === currentCategory)
  ) {
    return currentCategory;
  }
  return matchingCategories[0]?.name || "";
}

function decodeSharedHeaderValue(value: string | null): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isNumericLikeInput(
  target: EventTarget | null,
): target is HTMLInputElement | HTMLTextAreaElement {
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLTextAreaElement)
  )
    return false;
  const inputMode = (target.getAttribute("inputmode") || "").toLowerCase();
  const inputType =
    target instanceof HTMLInputElement ? (target.type || "").toLowerCase() : "";
  return (
    inputMode === "numeric" ||
    inputMode === "decimal" ||
    inputType === "number" ||
    inputType === "tel"
  );
}

function sanitizeNumericLikeValue(
  target: HTMLInputElement | HTMLTextAreaElement,
  rawValue: string,
): string {
  const inputMode = (target.getAttribute("inputmode") || "").toLowerCase();
  const inputType =
    target instanceof HTMLInputElement ? (target.type || "").toLowerCase() : "";

  if (inputMode === "decimal" || inputType === "number") {
    const cleaned = rawValue
      .replace(/,/g, ".")
      .replace(/[^0-9.]/g, "")
      .replace(/(\..*)\./g, "$1");
    if (!cleaned) return "";
    if (cleaned === ".") return ".";
    const [whole = "", decimal = ""] = cleaned.split(".");
    if (!cleaned.includes(".")) return whole;
    return `${whole}.${decimal.slice(0, 2)}`;
  }

  return rawValue.replace(/[^0-9+\-()\s]/g, "");
}

function extractApiDetailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail.trim();

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          const maybeMessage = (item as { msg?: unknown }).msg;
          return typeof maybeMessage === "string" ? maybeMessage.trim() : "";
        }
        return "";
      })
      .filter(Boolean);

    if (messages.length > 0) return messages.join("\n");
  }

  return fallback;
}

function authHeaders(token: string | null | undefined): HeadersInit {
  return token && !isCookieAuthSentinel(token)
    ? { Authorization: `Bearer ${token}` }
    : {};
}

function localizeAddRecordApiError(message: string, lang: string): string {
  const normalized = message.trim();
  const isMalay = lang !== "EN";
  const insufficientMatch = normalized.match(
    /Insufficient wallet balance \(available: (RM [^)]+)\)\.?/i,
  );

  if (insufficientMatch) {
    return isMalay
      ? `Baki wallet tidak mencukupi. Baki semasa: ${insufficientMatch[1]}.`
      : normalized;
  }

  const mapped: Record<string, { en: string; bm: string }> = {
    "Wallet not found.": {
      en: "Wallet not found.",
      bm: "Wallet tidak dijumpai.",
    },
    "Category not found.": {
      en: "Category not found.",
      bm: "Kategori tidak dijumpai.",
    },
    "Amount must be greater than 0.": {
      en: "Amount must be greater than 0.",
      bm: "Jumlah mesti lebih besar daripada 0.",
    },
    "Missing auth token": {
      en: "Your session has expired. Please sign in again.",
      bm: "Sesi anda telah tamat. Sila log masuk semula.",
    },
  };

  const matched = mapped[normalized];
  if (matched) return isMalay ? matched.bm : matched.en;
  return normalized;
}

const SHELL_BADGES: ShellBadge[] = APP_BADGES.map((badge) => ({
  key: badge.key,
  title: badge.titleBM,
  titleEN: badge.titleEN,
  desc: badge.descBM,
  descEN: badge.descEN,
  status: badge.status,
  icon: badge.icon,
}));

function renderMiniGemGlyph(
  icon: "verified" | "active" | "streak" | "budget" | "receipt" | "bot",
) {
  switch (icon) {
    case "verified":
      return (
        <path
          d="M31 41 l6 6 l13 -15"
          fill="none"
          stroke="white"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "active":
      return (
        <path
          d="M40 24 l4.7 9.5 l10.5 1.5 l-7.6 7.3 l1.8 10.3 l-9.4 -5 l-9.4 5 l1.8 -10.3 l-7.6 -7.3 l10.5 -1.5 z"
          fill="white"
        />
      );
    case "streak":
      return (
        <path
          d="M42 24 C50 31 49 39 43 43 C49 43 53 50 48 57 C39 54 32 45 32 37 C32 31 36 27 42 24 Z"
          fill="white"
        />
      );
    case "budget":
      return (
        <path
          d="M25 31 h30 a4 4 0 0 1 4 4 v12 a4 4 0 0 1 -4 4 h-30 a4 4 0 0 1 -4 -4 v-12 a4 4 0 0 1 4 -4 Z M46 41 h8"
          fill="none"
          stroke="white"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "receipt":
      return (
        <path
          d="M31 24 h18 l6 6 v26 l-4 -2 l-4 2 l-4 -2 l-4 2 l-4 -2 l-4 2 Z M35 36 h14 M35 44 h10"
          fill="none"
          stroke="white"
          strokeWidth="4.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "bot":
      return (
        <path
          d="M32 34 a8 8 0 0 1 8 -8 h0 a8 8 0 0 1 8 8 v11 h-16 Z M36 45 h8 M35 30 l-3 -4 M45 30 l3 -4 M36 38 h.01 M44 38 h.01"
          fill="none"
          stroke="white"
          strokeWidth="4.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
  }
}

function MiniVerifiedGemBadge({
  large = false,
  outlined = false,
  icon = "verified",
}: {
  large?: boolean;
  outlined?: boolean;
  icon?: ShellBadge["icon"];
}) {
  return (
    <span
      className={cn(
        "relative inline-grid place-items-center overflow-visible",
        large ? "h-14 w-14" : "h-8 w-8",
      )}
    >
      <style jsx>{`
        @keyframes miniGemFloat {
          0%,
          100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-2px) scale(1.05);
          }
        }
        @keyframes miniGemSpark {
          0%,
          100% {
            transform: scale(0.72) rotate(0deg);
            opacity: 0.25;
          }
          45% {
            transform: scale(1.18) rotate(16deg);
            opacity: 1;
          }
        }
        @keyframes miniGemShine {
          0% {
            transform: translateX(-16px) translateY(5px) rotate(-24deg);
            opacity: 0;
          }
          35% {
            opacity: 0.58;
          }
          70%,
          100% {
            transform: translateX(18px) translateY(-5px) rotate(-24deg);
            opacity: 0;
          }
        }
        .mini-gem-main {
          animation: miniGemFloat 2.7s ease-in-out infinite;
          transform-origin: center;
        }
        .mini-gem-spark-a {
          animation: miniGemSpark 1.8s ease-in-out infinite;
          transform-origin: center;
        }
        .mini-gem-spark-b {
          animation: miniGemSpark 2.1s ease-in-out infinite 0.25s;
          transform-origin: center;
        }
        .mini-gem-shine {
          animation: miniGemShine 2.8s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>
      <svg
        viewBox="0 0 80 80"
        className={cn(
          outlined
            ? "drop-shadow-[0_6px_10px_rgba(148,163,184,0.24)]"
            : "drop-shadow-[0_8px_12px_rgba(37,99,235,0.32)]",
          large ? "h-14 w-14" : "h-8 w-8",
        )}
        aria-hidden="true"
      >
        <defs>
          <clipPath id="shellMiniVerifiedGemClip">
            <path d="M40 8 L58 26 L52 55 L40 72 L28 55 L22 26 Z" />
          </clipPath>
        </defs>
        {!outlined && (
          <path
            className="mini-gem-spark-a"
            d="M14 25 l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"
            fill="#fde68a"
          />
        )}
        {!outlined && (
          <path
            className="mini-gem-spark-b"
            d="M65 51 l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"
            fill="#67e8f9"
          />
        )}
        <g className="mini-gem-main">
          {outlined ? (
            <>
              <path
                d="M40 8 L58 26 L52 55 L40 72 L28 55 L22 26 Z"
                fill="rgba(148,163,184,0.08)"
                stroke="rgba(191,219,254,0.9)"
                strokeWidth="4"
              />
              <path
                d="M40 8 L58 26 L40 35 L22 26 Z"
                fill="rgba(191,219,254,0.12)"
              />
              <path d="M22 26 L40 35 L28 55 Z" fill="rgba(125,211,252,0.12)" />
              <path d="M58 26 L40 35 L52 55 Z" fill="rgba(96,165,250,0.14)" />
              <path
                d="M28 55 L40 35 L52 55 L40 72 Z"
                fill="rgba(59,130,246,0.12)"
              />
            </>
          ) : (
            <>
              <path
                d="M40 8 L58 26 L52 55 L40 72 L28 55 L22 26 Z"
                fill="#091b3a"
              />
              <path d="M40 8 L58 26 L40 35 L22 26 Z" fill="#bfdbfe" />
              <path d="M22 26 L40 35 L28 55 Z" fill="#60a5fa" />
              <path d="M58 26 L40 35 L52 55 Z" fill="#2563eb" />
              <path d="M28 55 L40 35 L52 55 L40 72 Z" fill="#0f2a55" />
              <g clipPath="url(#shellMiniVerifiedGemClip)">
                <rect
                  className="mini-gem-shine"
                  x="13"
                  y="12"
                  width="8"
                  height="58"
                  rx="4"
                  fill="white"
                  opacity="0.5"
                />
              </g>
              {renderMiniGemGlyph(icon)}
            </>
          )}
        </g>
      </svg>
    </span>
  );
}

function getMobileHeaderMeta(
  pathname: string,
  sessionId: string,
  t: Record<string, string>,
  user: ShellUser | null,
): MobileHeaderMeta {
  const base = `/${sessionId}`;
  const displayName =
    typeof user?.name === "string" && user.name.trim()
      ? user.name.trim()
      : "Portal";

  if (pathname === base) {
    return {
      title: `${t.welcome}, ${displayName}`,
      subtitle: t.headerDashboardSubtitle,
      eyebrow: t.dashboard,
      icon: LayoutDashboard,
      backHref: null,
    };
  }

  if (pathname === `${base}/transactions`) {
    return {
      title: t.transactions,
      subtitle: t.headerTransactionsSubtitle,
      eyebrow: t.transactions,
      icon: Receipt,
      backHref: null,
    };
  }

  if (pathname === `${base}/map`) {
    return {
      title: t.mapView,
      subtitle: t.headerMapSubtitle,
      eyebrow: t.mapView,
      icon: MapPinned,
      backHref: null,
    };
  }

  if (pathname === `${base}/map-analysis`) {
    return {
      title: "Analisis Maps",
      subtitle: "Analisis belanja ikut lokasi",
      eyebrow: t.mapView,
      icon: BarChart3,
      backHref: null,
    };
  }

  if (pathname === `${base}/places`) {
    return {
      title: "My Places",
      subtitle: "Your saved place pins",
      eyebrow: "Places",
      icon: MapPin,
      backHref: null,
    };
  }

  if (pathname === `${base}/debt`) {
    return {
      title: t.debt,
      subtitle: t.headerDebtSubtitle,
      eyebrow: t.debt,
      icon: HandCoins,
      backHref: null,
    };
  }

  if (pathname === `${base}/loan`) {
    return {
      title: "Loan",
      subtitle: "Track loan balance and remaining months",
      eyebrow: "Loan",
      icon: CreditCard,
      backHref: null,
    };
  }

  if (pathname === `${base}/vehicle` || pathname.startsWith(`${base}/vehicle/`)) {
    return {
      title: "My Vehicle",
      subtitle: "Fuel, service, road tax & insurance",
      eyebrow: "Vehicle",
      icon: Car,
      backHref: null,
    };
  }

  if (pathname === `${base}/inventory` || pathname.startsWith(`${base}/inventory/`)) {
    return {
      title: "Barang Saya",
      subtitle: "Rekod barang & lokasi simpanan",
      eyebrow: "Peribadi",
      icon: Package,
      backHref: null,
    };
  }

  if (pathname === `${base}/warranty` || pathname.startsWith(`${base}/warranty/`)) {
    return {
      title: "Waranti Saya",
      subtitle: "",
      eyebrow: "Waranti",
      icon: Shield,
      backHref: null,
    };
  }

  if (pathname === `${base}/health` || pathname.startsWith(`${base}/health/`)) {
    return {
      title: "Kesihatan",
      subtitle: "Monitor kesihatan & peringatan ubat",
      eyebrow: "Kesihatan",
      icon: Heart,
      backHref: null,
    };
  }

  if (pathname === `${base}/budget`) {
    return {
      title: t.budget,
      subtitle: t.headerBudgetSubtitle,
      eyebrow: t.budget,
      icon: Wallet,
      backHref: null,
    };
  }

  if (pathname.startsWith(`${base}/transactions/`)) {
    return {
      title: t.headerTransactionDetailTitle,
      subtitle: t.headerTransactionDetailSubtitle,
      eyebrow: t.transactions,
      icon: Receipt,
      backHref: `${base}/transactions`,
    };
  }

  if (pathname === `${base}/categories`) {
    return {
      title: t.categories,
      subtitle: t.headerCategoriesSubtitle,
      eyebrow: t.categories,
      icon: Grid2X2,
      backHref: null,
    };
  }

  if (pathname === `${base}/connector` || pathname.startsWith(`${base}/connector/`)) {
    return {
      title: "Connector",
      subtitle: "Bot connections",
      eyebrow: "Connector",
      icon: Bot,
      backHref: null,
    };
  }

  if (pathname === `${base}/whatsapp`) {
    return {
      title: t.whatsapp,
      subtitle: t.headerWhatsappSubtitle,
      eyebrow: "Connector",
      icon: Bot,
      backHref: `${base}/connector`,
    };
  }

  if (pathname === `${base}/telegram`) {
    return {
      title: "Telegram",
      subtitle: "Link Telegram bot",
      eyebrow: "Connector",
      icon: Send,
      backHref: `${base}/connector`,
    };
  }

  if (pathname === `${base}/settings`) {
    return {
      title: t.lagiTitle,
      subtitle: t.headerSettingsSubtitle,
      eyebrow: t.system,
      icon: Settings,
      backHref: null,
    };
  }

  if (pathname === `${base}/account`) {
    return {
      title: t.myAccount,
      subtitle: t.headerAccountSubtitle,
      eyebrow: t.profile,
      icon: User,
      backHref: `${base}/settings`,
    };
  }

  if (pathname === `${base}/wallet-settings`) {
    return {
      title: t.walletSettings,
      subtitle: t.headerWalletSubtitle,
      eyebrow: t.walletSettings,
      icon: CreditCard,
      backHref: `${base}/settings`,
    };
  }

  if (pathname === `${base}/bank-reconciliation`) {
    return {
      title: "Rekonsiliasi Bank",
      subtitle: "Padankan penyata bank & rekod MyPeribadi",
      eyebrow: "Penyata Bank",
      icon: FileSpreadsheet,
      backHref: `${base}/wallet-settings`,
    };
  }

  if (pathname === `${base}/security`) {
    return {
      title: t.security,
      subtitle: t.headerSecuritySubtitle,
      eyebrow: t.system,
      icon: Settings,
      backHref: `${base}/settings`,
    };
  }

  if (pathname === `${base}/bot-command`) {
    return {
      title: t.helpSupport,
      subtitle: t.headerHelpSubtitle,
      eyebrow: t.helpSupport,
      icon: Bot,
      backHref: `${base}/settings`,
    };
  }

  if (pathname === `${base}/about`) {
    return {
      title: t.about,
      subtitle: t.headerAboutSubtitle,
      eyebrow: t.about,
      icon: Info,
      backHref: `${base}/settings`,
    };
  }

  if (pathname === `${base}/badges`) {
    return {
      title: "Reward Badge",
      subtitle: "SVG badge ideas and reward functions",
      eyebrow: "System",
      icon: Award,
      backHref: `${base}/settings`,
    };
  }

  if (pathname === `${base}/whatsnew`) {
    return {
      title: t.changelog,
      subtitle: t.headerChangelogSubtitle,
      eyebrow: t.system,
      icon: ScrollText,
      backHref: `${base}/settings`,
    };
  }

  return {
    title: "MyPeribadi App",
    subtitle: t.headerSettingsSubtitle,
    eyebrow: "MyPeribadi",
    icon: CreditCard,
    backHref: null,
  };
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const pathSegments = pathname.split("/").filter(Boolean);
  const hideGlobalCalculator = pathname.includes("/chat");
  useRealtime({ enabled: Boolean(pathSegments[0]) });
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { t, lang, timezone, setLang } = useLang();
  const { theme, resolvedTheme } = useTheme();

  const sessionId =
    (typeof params.sessionId === "string" ? params.sessionId : "") ||
    pathSegments[0] ||
    "";
  const isPersonalDashboardHome =
    Boolean(sessionId) &&
    (pathname === `/${sessionId}` || pathname === `/${sessionId}/`);
  const isLight = resolvedTheme === "light";
  const [noticeBanners, setNoticeBanners] = useState<{ personal?: NoticeBannerItem } | null>(null);
  const menuTitle = lang === "BM" ? "Menu Utama" : "Main Menu";

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    // Reset stale banner state so an enabled banner from the previous
    // fetch cannot render while the fresh fetch is still in flight.
    setNoticeBanners(null);
    async function loadNoticeBanners() {
      try {
        const token = getAccessToken();
        if (!token) return; // no valid session -> don't emit 401 noise
        const res = await fetch("/api/notice-banners", { credentials: "include", headers: authHeaders(token), cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setNoticeBanners(data);
      } catch {}
    }
    void loadNoticeBanners();
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadNoticeBanners();
    };
    const onFocus = () => { void loadNoticeBanners(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const intervalId = window.setInterval(() => { void loadNoticeBanners(); }, 30000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(intervalId);
    };
  }, [sessionId, pathname]);

  const activeNoticeBanner = noticeBanners?.personal;
  const noticeTitle = activeNoticeBanner
    ? (lang === "BM"
        ? (activeNoticeBanner.title_bm || activeNoticeBanner.title_en || activeNoticeBanner.title || "")
        : (activeNoticeBanner.title_en || activeNoticeBanner.title_bm || activeNoticeBanner.title || "")).trim()
    : "";
  const noticeMessage = activeNoticeBanner
    ? (lang === "BM"
        ? (activeNoticeBanner.message_bm || activeNoticeBanner.message_en || activeNoticeBanner.message || "")
        : (activeNoticeBanner.message_en || activeNoticeBanner.message_bm || activeNoticeBanner.message || "")).trim()
    : "";
  const showNoticeBanner = Boolean(activeNoticeBanner?.enabled && (noticeTitle || noticeMessage) && isPersonalDashboardHome);
  const noticeBannerNode = showNoticeBanner && activeNoticeBanner ? (
    <section className={cn("mb-4 rounded-2xl border px-4 py-3 text-sm shadow-[var(--shadow-soft)]", activeNoticeBanner.type === "alert" ? "border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-200" : activeNoticeBanner.type === "warning" ? "border-amber-500/25 bg-amber-400/15 text-amber-800 dark:text-amber-200" : "border-sky-500/25 bg-sky-500/12 text-sky-700 dark:text-sky-200")}>
      <div className="flex items-start gap-3">
        {activeNoticeBanner.type === "alert" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : activeNoticeBanner.type === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          {noticeTitle ? <p className="font-black leading-tight">{noticeTitle}</p> : null}
          {noticeMessage ? <p className="mt-0.5 whitespace-pre-wrap text-xs font-semibold leading-5 opacity-90">{noticeMessage}</p> : null}
        </div>
      </div>
    </section>
  ) : null;

  const navigation = [
    { name: t.dashboard, href: `/${sessionId}`, icon: LayoutDashboard },
    { name: t.transactions, href: `/${sessionId}/transactions`, icon: Receipt },
    { name: t.mapView, href: `/${sessionId}/map`, icon: MapPinned },
    {
      name: lang === "BM" ? "Analisis Maps" : "Map Analysis",
      href: `/${sessionId}/map-analysis`,
      icon: BarChart3,
    },
    { name: t.debt, href: `/${sessionId}/debt`, icon: HandCoins },
    { name: lang === "BM" ? "Subscription" : "Subscription", href: `/${sessionId}/subscription`, icon: CreditCard },
    { name: "Loan", href: `/${sessionId}/loan`, icon: CreditCard },
    { name: lang === "BM" ? "Kenderaan" : "My Vehicle", href: `/${sessionId}/vehicle`, icon: Car },
    { name: lang === "BM" ? "Waranti Saya" : "My Warranty", href: `/${sessionId}/warranty`, icon: Shield },
    { name: lang === "BM" ? "Barang Saya" : "My Inventory", href: `/${sessionId}/inventory`, icon: Package },
    { name: lang === "BM" ? "Acara Saya" : "My Events", href: `/${sessionId}/event`, icon: CalendarDays },
    { name: "Split Bill", href: `/${sessionId}/split-bills`, icon: Users },
    { name: "BNPL", href: `/${sessionId}/bnpl`, icon: CreditCard },
    { name: t.budget, href: `/${sessionId}/budget`, icon: Wallet },
    { name: t.receipts, href: `/${sessionId}/receipts`, icon: Images },
    {
      name: t.walletSettings,
      href: `/${sessionId}/wallet-settings`,
      icon: CreditCard,
    },
    {
      name: lang === "BM" ? "Rekonsiliasi Bank" : "Bank Reconciliation",
      href: `/${sessionId}/bank-reconciliation`,
      icon: FileSpreadsheet,
    },
    {
      name: lang === "BM" ? "Cukai Pendapatan" : "Income Tax",
      href: `/${sessionId}/tax`,
      icon: Landmark,
    },
    { name: t.categories, href: `/${sessionId}/categories`, icon: Settings },
    { name: lang === "BM" ? "Kesihatan" : "Health", href: `/${sessionId}/health`, icon: Heart },
    { name: t.chat, href: `/${sessionId}/chat`, icon: MessageSquare },
  ];
  const desktopMainNavigation = [
    { name: t.dashboard, href: `/${sessionId}`, icon: LayoutDashboard },
    { name: lang === "BM" ? "Analisis Kewangan" : "Financial Analysis", href: `/${sessionId}/financial-analysis`, icon: BarChart3 },
    { name: t.transactions, href: `/${sessionId}/transactions`, icon: Receipt },
    { name: t.budget, href: `/${sessionId}/budget`, icon: Wallet },
    { name: t.receipts, href: `/${sessionId}/receipts`, icon: Images },
    {
      name: t.walletSettings,
      href: `/${sessionId}/wallet-settings`,
      icon: CreditCard,
    },
    {
      name: lang === "BM" ? "Rekonsiliasi Bank" : "Bank Reconciliation",
      href: `/${sessionId}/bank-reconciliation`,
      icon: FileSpreadsheet,
    },
    {
      name: lang === "BM" ? "Cukai Pendapatan" : "Income Tax",
      href: `/${sessionId}/tax`,
      icon: Landmark,
    },
    { name: t.categories, href: `/${sessionId}/categories`, icon: Settings },
  ];
  const desktopPersonalNavigation = [
    { name: lang === "BM" ? "Kenderaan" : "My Vehicle", href: `/${sessionId}/vehicle`, icon: Car },
    { name: lang === "BM" ? "Waranti Saya" : "My Warranty", href: `/${sessionId}/warranty`, icon: Shield },
    { name: lang === "BM" ? "Barang Saya" : "My Inventory", href: `/${sessionId}/inventory`, icon: Package },
    { name: lang === "BM" ? "Acara Saya" : "My Events", href: `/${sessionId}/event`, icon: CalendarDays },
    { name: "Split Bill", href: `/${sessionId}/split-bills`, icon: Users },
    { name: "BNPL", href: `/${sessionId}/bnpl`, icon: CreditCard },
    { name: lang === "BM" ? "Subscription" : "Subscription", href: `/${sessionId}/subscription`, icon: CreditCard },
    { name: "Loan", href: `/${sessionId}/loan`, icon: CreditCard },
    { name: lang === "BM" ? "Kesihatan" : "Health", href: `/${sessionId}/health`, icon: Heart },
    { name: t.debt, href: `/${sessionId}/debt`, icon: HandCoins },
  ];
  const desktopMapNavigation = [
    { name: t.mapView, href: `/${sessionId}/map`, icon: MapPinned },
    {
      name: lang === "BM" ? "Tempat Saya" : "My Places",
      href: `/${sessionId}/places`,
      icon: MapPin,
    },
    {
      name: lang === "BM" ? "Analisis Maps" : "Map Analysis",
      href: `/${sessionId}/map-analysis`,
      icon: BarChart3,
    },
  ];
  const desktopConnectorNavigation = [
    { name: "Connector", href: `/${sessionId}/connector`, icon: Bot },
  ];
  const desktopNavigationSections = [
    { label: menuTitle, items: desktopMainNavigation },
    { label: "Personal", items: desktopPersonalNavigation },
    { label: "Maps", items: desktopMapNavigation },
    { label: "Connector", items: desktopConnectorNavigation },
    { label: lang === "BM" ? "Bantuan" : "Help", items: [{ name: lang === "BM" ? "Command Bot" : "Bot Command", href: `/${sessionId}/bot-command`, icon: Bot }, { name: lang === "BM" ? "Request & Ticket" : "Request & Ticket", href: `/${sessionId}/request`, icon: Send }, { name: t.changelog, href: `/${sessionId}/whatsnew`, icon: ScrollText }] },
  ];
  const mobileNavLeft = [
    { nameKey: "home" as const, href: `/${sessionId}`, icon: Home },
    {
      nameKey: "transactions" as const,
      href: `/${sessionId}/transactions`,
      icon: Receipt,
    },
  ];
  const mobileNavRight = [
    {
      nameKey: "wallet" as const,
      href: `/${sessionId}/wallet-settings`,
      icon: CreditCard,
    },
  ];
  const mobileNavFlat = [
    { nameKey: "home" as const, href: `/${sessionId}`, icon: NavHomeIcon, label: t.dashboard },
    { nameKey: "transactions" as const, href: `/${sessionId}/transactions`, icon: NavTxnIcon, label: t.transactions },
    { nameKey: "wallet" as const, href: `/${sessionId}/wallet-settings`, icon: NavWalletIcon, label: lang === "BM" ? "Dompet" : "Wallet" },
    { nameKey: "chat" as const, href: `/${sessionId}/chat`, icon: MessageCircle, label: t.chat },
    { nameKey: "receipts" as const, href: `/${sessionId}/receipts`, icon: NavReceiptsIcon, label: t.receipts },
  ];
  const mobileBottomNavItems = [
    { key: "dashboard", href: `/${sessionId}` },
    { key: "transactions", href: `/${sessionId}/transactions` },
    { key: "wallet", href: `/${sessionId}/wallet-settings` },
    { key: "chat", href: `/${sessionId}/chat` },
    { key: "more", href: `/${sessionId}/settings` },
  ];
  const mobileSheetClass = "bg-[var(--page-bg)] text-[var(--text)]";
  const mobileSheetMutedButtonClass = isLight
    ? "bg-neutral-100 text-neutral-900"
    : "bg-white/[0.06] text-white";
  const mobileSheetSectionLabelClass = isLight
    ? "!text-neutral-900"
    : "text-neutral-500";
  const mobileSheetTitleClass = isLight ? "!text-neutral-900" : "text-white";
  const mobileSheetRowClass = isLight
    ? "hover:bg-neutral-50"
    : "hover:bg-white/[0.03]";
  const mobileSheetIconWrapClass = isLight
    ? "bg-neutral-100 !text-neutral-900"
    : "bg-white/[0.06] text-neutral-100";
  const mobileSheetSubtextClass = isLight ? "!text-neutral-600" : "text-neutral-500";
  const mobileSheetActiveRowClass = isLight
    ? "bg-neutral-100"
    : "bg-white/[0.08]";
  const mobileSheetActiveIconClass = isLight ? "!text-neutral-900" : "text-[var(--btn-primary-text)]";
  const mobileSheetActiveTitleClass = isLight ? "!text-neutral-900" : "text-[var(--text)]";
  const mobileBottomNavInactiveClass = "text-[var(--bottom-nav-muted)] hover:text-[var(--bottom-nav-text)]";
  const mobileBottomNavActiveClass = "text-[var(--bottom-nav-text)]";
  const mobileBottomNavIndicatorClass = "bg-[var(--bottom-nav-text)]";
  const mobileBottomNavShellClass = isLight
    ? "bg-white/80 backdrop-blur-xl"
    : "bg-[var(--sheet-bg)]/95 backdrop-blur-xl";
  const mobileBottomNavRailClass = "bg-[var(--pill-bg)]";
  const mobileBottomNavCenterGlowClass = "bg-[var(--bottom-nav-center-ring)]";
  const mobileBottomNavItemActiveClass = isLight
    ? "bg-neutral-900 text-white"
    : "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]";
  const mobileBottomNavItemInactiveClass = isLight
    ? "bg-transparent text-neutral-400"
    : "bg-transparent text-neutral-500";
  const mobileMenuSections = [
        {
          label: menuTitle,
          items: [
            {
              name: t.chat,
              subtitle:
                lang === "BM"
                  ? "Buka chat assistant anda"
                  : "Open your assistant chat",
              href: `/${sessionId}/chat`,
              icon: MessageSquare,
            },
            {
              name: t.dashboard,
              subtitle:
                lang === "BM"
                  ? "Ringkasan baki dan trend semasa"
                  : "Overview of balance and trends",
              href: `/${sessionId}`,
              icon: LayoutDashboard,
            },
            {
              name: t.transactions,
              subtitle:
                lang === "BM"
                  ? "Semak semua rekod masuk dan keluar"
                  : "Review all income and expense records",
              href: `/${sessionId}/transactions`,
              icon: Receipt,
            },
          ],
        },
        {
          label: "Personal",
          items: [
            {
              name: lang === "BM" ? "Subscription" : "Subscription",
              subtitle:
                lang === "BM"
                  ? "Urus langganan bulanan dan due day"
                  : "Manage monthly subscriptions and due day",
              href: `/${sessionId}/subscription`,
              icon: CreditCard,
            },
            {
              name: "Loan",
              subtitle:
                lang === "BM"
                  ? "Kira baki loan dan berapa bulan lagi"
                  : "Track balance and remaining months",
              href: `/${sessionId}/loan`,
              icon: CreditCard,
            },
            {
              name: lang === "BM" ? "Kenderaan" : "My Vehicle",
              subtitle:
                lang === "BM"
                  ? "Minyak, servis, road tax dan insurans"
                  : "Fuel, service, road tax and insurance",
              href: `/${sessionId}/vehicle`,
              icon: Car,
            },
            {
              name: lang === "BM" ? "Waranti Saya" : "My Warranty",
              subtitle:
                lang === "BM"
                  ? "Cari dan simpan maklumat waranti peranti"
                  : "Find and save device warranty information",
              href: `/${sessionId}/warranty`,
              icon: Shield,
            },
            {
              name: lang === "BM" ? "Acara Saya" : "My Events",
              subtitle:
                lang === "BM"
                  ? "Jejak acara dengan bajet, tarikh dan wallet"
                  : "Track events with a budget, date and wallet",
              href: `/${sessionId}/event`,
              icon: CalendarDays,
            },
            {
              name: lang === "BM" ? "Barang Saya" : "My Inventory",
              subtitle:
                lang === "BM"
                  ? "Jejak barang, lokasi dan bekas anda"
                  : "Track your items, locations and boxes",
              href: `/${sessionId}/inventory`,
              icon: Package,
            },
            {
              name: lang === "BM" ? "Kesihatan" : "Health",
              subtitle:
                lang === "BM"
                  ? "Monitor kesihatan & peringatan ubat"
                  : "Health monitor & medication reminder",
              href: `/${sessionId}/health`,
              icon: Heart,
            },
            {
              name: "Split Bill",
              subtitle:
                lang === "BM"
                  ? "Bahagi bil dan kumpul bayaran balik daripada rakan"
                  : "Split a bill and collect reimbursements from friends",
              href: `/${sessionId}/split-bills`,
              icon: Users,
            },
            {
              name: "BNPL",
              subtitle:
                lang === "BM"
                  ? "Jejak ansuran Buy Now Pay Later dengan duedate"
                  : "Track Buy Now Pay Later installments with due dates",
              href: `/${sessionId}/bnpl`,
              icon: CreditCard,
            },
            {
              name: t.debt,
              subtitle:
                lang === "BM"
                  ? "Jejak orang hutang dan bayaran balik"
                  : "Track IOUs and repayments",
              href: `/${sessionId}/debt`,
              icon: HandCoins,
            },
          ],
        },
        {
          // Keep distinct from the "Personal" section above (keys + labels must be unique)
          label: lang === "BM" ? "Perancangan" : "Planning",
          items: [
            {
              name: t.budget,
              subtitle:
                lang === "BM"
                  ? "Set bajet bulanan ikut kategori"
                  : "Set monthly budget by category",
              href: `/${sessionId}/budget`,
              icon: Wallet,
            },
            {
              name: t.walletSettings,
              subtitle:
                lang === "BM"
                  ? "Dompet, baki dan struktur akaun"
                  : "Wallets, balances and structure",
              href: `/${sessionId}/wallet-settings`,
              icon: CreditCard,
            },
            {
              name: lang === "BM" ? "Rekonsiliasi Bank" : "Bank Reconciliation",
              subtitle:
                lang === "BM"
                  ? "Padankan penyata bank & rekod MyPeribadi"
                  : "Reconcile bank statements & MyPeribadi records",
              href: `/${sessionId}/bank-reconciliation`,
              icon: FileSpreadsheet,
            },
            {
              name: t.categories,
              subtitle:
                lang === "BM"
                  ? "Urus kategori dan rules automatik"
                  : "Manage categories and auto rules",
              href: `/${sessionId}/categories`,
              icon: Grid2X2,
            },
          ],
        },
        {
          label: "Maps",
          items: [
            {
              name: t.mapView,
              subtitle:
                lang === "BM"
                  ? "Lihat pin lokasi transaksi ikut bulan"
                  : "View monthly transaction location pins",
              href: `/${sessionId}/map`,
              icon: MapPinned,
            },
            {
              name: lang === "BM" ? "Tempat Saya" : "My Places",
              subtitle:
                lang === "BM"
                  ? "Pin rumah sedara, kerja, tempat penting"
                  : "Pin family homes, work, important places",
              href: `/${sessionId}/places`,
              icon: MapPin,
            },
            {
              name: lang === "BM" ? "Analisis Maps" : "Map Analysis",
              subtitle:
                lang === "BM"
                  ? "Analisis belanja ikut lokasi"
                  : "Expense analysis by location",
              href: `/${sessionId}/map-analysis`,
              icon: BarChart3,
            },
          ],
        },
        {
          label: "Connector",
          items: [
            {
              name: "Connector",
              subtitle:
                lang === "BM"
                  ? "WhatsApp, Telegram dan status sambungan"
                  : "WhatsApp, Telegram and connection status",
              href: `/${sessionId}/connector`,
              icon: Bot,
            },
          ],
        },
        {
          label: lang === "BM" ? "Tetapan" : "Settings",
          items: [
            {
              name: t.changelog,
              subtitle:
                lang === "BM"
                  ? "Kemaskini terkini dan ciri baru"
                  : "Latest updates and new features",
              href: `/${sessionId}/whatsnew`,
              icon: ScrollText,
            },
            {
              name: t.more,
              subtitle:
                lang === "BM"
                  ? "Bahasa, tema dan tetapan sistem"
                  : "Language, theme and system settings",
              href: `/${sessionId}/settings`,
              icon: Settings,
            },
          ],
        },
      ];

  const [user, setUser] = useState<ShellUser | null>(null);
  const adminNavigationSection = user?.is_admin
    ? [
        {
          label: "Admin",
          items: [
            {
              name: "AdminPortal Admin",
              subtitle:
                lang === "BM"
                  ? "Urus akaun dan akses pengguna"
                  : "Manage user accounts and access",
              href: `/${sessionId}/adminportal`,
              icon: ShieldCheck,
            },
            {
              name: "Access Log",
              subtitle:
                lang === "BM"
                  ? "IP ban dan alert Telegram"
                  : "IP ban and Telegram alerts",
              href: `/${sessionId}/adminportal/access-log`,
              icon: Lock,
            },
          ],
        },
      ]
    : [];
  const currentDesktopNavigationSections = desktopNavigationSections;

  const [stats, setStats] = useState<ShellStats>({ balance: 0, income_month: 0, expense_month: 0 });
  const [isMounted, setIsMounted] = useState(false);
  const [emailVerified, setEmailVerifiedState] = useState(() =>
    typeof window !== "undefined" ? getEmailVerified() : false
  );
  const [emailVerifiedKnown, setEmailVerifiedKnown] = useState(false);
  const [resendingVerify, setResendingVerify] = useState(false);
  const [verifyCooldownUntil, setVerifyCooldownUntil] = useState(0);
  const [verifyResendCount, setVerifyResendCount] = useState(0);
  const [verifyDeadlineAt, setVerifyDeadlineAt] = useState(0);
  const [nowTick, setNowTick] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(() =>
    createDefaultAddForm(timezone),
  );
  const [addItems, setAddItems] = useState<AddItemState[]>(() =>
    createDefaultAddItems(),
  );
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showWalletDropdown, setShowWalletDropdown] = useState(false);
  const [sharedAddFile, setSharedAddFile] = useState<File | null>(null);
  const [sharedAddPreviewUrl, setSharedAddPreviewUrl] = useState<string | null>(
    null,
  );
  const [storedSharedTransactionToken, setStoredSharedTransactionToken] =
    useState("");
  const [saving, setSaving] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showChatOverlay, setShowChatOverlay] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [addError, setAddError] = useState("");
  const [categories, setCategories] = useState<ShellCategory[]>([]);
  const [wallets, setWallets] = useState<ShellWallet[]>([]);
  const [transactions, setTransactions] = useState<ShellTransaction[]>([]);
  const [budgetItems, setBudgetItems] = useState<ShellBudgetItem[]>([]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileSheetAccountSwitcher, setShowMobileSheetAccountSwitcher] = useState(false);

  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [showLeftAccountSwitcher, setShowLeftAccountSwitcher] = useState(false);
  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const [storedAccounts, setStoredAccounts] = useState<AccountProfile[]>([]);
  const [waReconnectBanner, setWaReconnectBanner] = useState<{ show: boolean; status: string; requiresRelink?: boolean }>({ show: false, status: "" });
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [addAccountEmail, setAddAccountEmail] = useState("");
  const [addAccountPassword, setAddAccountPassword] = useState("");
  const [addAccountLoading, setAddAccountLoading] = useState(false);
  const [addAccountError, setAddAccountError] = useState("");
  const [addAccountTurnstileToken, setAddAccountTurnstileToken] = useState<string | null>(null)
  const [addAccountCaptchaKey, setAddAccountCaptchaKey] = useState(0)
  const [addAccountGoogleLoading, setAddAccountGoogleLoading] = useState(false)
  const [showAddAccountEmailForm, setShowAddAccountEmailForm] = useState(false)
  const handleAddAccountTurnstileVerify = useCallback((token: string) => {
    setAddAccountTurnstileToken(token || null)
  }, [])
  const handleAddAccountTurnstileError = useCallback(() => {
    setAddAccountTurnstileToken(null)
  }, [])

  const resetAddAccountModal = useCallback(() => {
    setShowAddAccountModal(false)
    setAddAccountError("")
    setAddAccountEmail("")
    setAddAccountPassword("")
    setAddAccountTurnstileToken(null)
    setAddAccountCaptchaKey((k) => k + 1)
    setAddAccountGoogleLoading(false)
    setAddAccountLoading(false)
    setShowAddAccountEmailForm(false)
  }, [])

  const handleAddAccountGoogleLogin = useCallback(async () => {
    setAddAccountError("")
    setAddAccountGoogleLoading(true)
    try {
      const profile = await signInWithGoogleProfile()
      const newSessionId =
        crypto.randomUUID?.() ||
        "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
        })
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: profile.idToken, session_id: newSessionId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.access_token) {
          let email = profile.email
          let name = profile.name
          try {
            const payload = JSON.parse(atob(data.access_token.split(".")[1] || ""))
            email = String(payload.sub || payload.email || email || "")
            name = String(payload.name || name || email.split("@")[0] || "User")
          } catch {
            /* keep firebase profile */
          }
          if (!email) {
            setAddAccountError(lang === "BM" ? "Google akaun tiada email." : "Google account has no email.")
            return
          }
          addAccount(email, name || email.split("@")[0], data.access_token, data.refresh_token ?? null, newSessionId)
          resetAddAccountModal()
          window.location.reload()
          return
        }
        setAddAccountError(lang === "BM" ? "Google log masuk gagal." : "Google sign in failed.")
      } else {
        const err = await res.json().catch(() => null)
        setAddAccountError(
          typeof err?.detail === "string"
            ? err.detail
            : (lang === "BM" ? "Google log masuk gagal." : "Google sign in failed."),
        )
      }
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user") return
      if (err?.code === "auth/cancelled-popup-request") return
      setAddAccountError(
        err?.code || err?.message || (lang === "BM" ? "Ralat Google." : "Google error."),
      )
    } finally {
      setAddAccountGoogleLoading(false)
    }
  }, [lang, resetAddAccountModal])
  const [accountSwitcherRef, setAccountSwitcherRef] = useState<HTMLDivElement | null>(null);
  const [hideMobileBottomNav, setHideMobileBottomNav] = useState(false);
  const [mobileBottomNavCenterIndex, setMobileBottomNavCenterIndex] =
    useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [startY, setStartY] = useState<number | null>(null);
  const [pinLockRequired, setPinLockRequired] = useState(false);
  const [pinUnlocking, setPinUnlocking] = useState(false);
  const [pinInput, setPinInput] = useState("");

  const displayName =
    typeof user?.name === "string" && user.name.trim()
      ? user.name.trim()
      : "User";
  const earnedBadgeKeys = useMemo(
    () =>
      deriveEarnedBadgeKeys(
        transactions as BadgeTransactionLike[],
        budgetItems as BadgeBudgetItemLike[],
      ),
    [transactions, budgetItems],
  );
  const liveBadges = useMemo(
    () =>
      SHELL_BADGES.map((badge) => ({
        ...badge,
        status: earnedBadgeKeys.has(badge.key)
          ? ("unlocked" as const)
          : ("locked" as const),
      })),
    [earnedBadgeKeys],
  );
  const unlockedBadges = liveBadges.filter(
    (badge) => badge.status === "unlocked",
  );
  const lockedBadges = liveBadges.filter((badge) => badge.status === "locked");
  const primaryBadge = unlockedBadges[0] ?? liveBadges[0];

  const [pinLockError, setPinLockError] = useState("");
  const [pinEnabled, setPinEnabled] = useState<boolean>(() =>
    hasPinEnabledSession(),
  );
  const [pinStatusReady, setPinStatusReady] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Keep sidebar amount-visibility in sync with the dashboard eye toggle (no refresh needed).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ show: boolean }>).detail;
      if (typeof detail?.show === "boolean") {
        setUser((u) => (u ? { ...u, show_hero_amounts: detail.show } : u));
      }
    };
    window.addEventListener("budget-hero-amounts", handler);
    return () => window.removeEventListener("budget-hero-amounts", handler);
  }, []);

  // Always start at top on route change. Bottom nav uses scroll:false and
  // router.back() would otherwise restore the previous mid-page scroll.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const unlockBodyIfNeeded = () => {
      if (document.body.style.position === "fixed") {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.overflow = "";
        document.body.style.width = "";
        document.body.style.overscrollBehavior = "";
        document.documentElement.style.overscrollBehavior = "";
      }
    };

    const resetScroll = () => {
      unlockBodyIfNeeded();
      try {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      } catch {
        window.scrollTo(0, 0);
      }
      try {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      } catch {
        /* ignore */
      }
      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
        mainRef.current.scrollLeft = 0;
      }
      // Desktop shell can scroll on the main column wrapper too.
      document
        .querySelectorAll<HTMLElement>(
          ".portal-desktop-main, .portal-app-shell, [data-scroll-root=\"true\"]",
        )
        .forEach((el) => {
          if (el.scrollTop) el.scrollTop = 0;
          if (el.scrollLeft) el.scrollLeft = 0;
        });
    };

    resetScroll();
    const raf1 = window.requestAnimationFrame(() => {
      resetScroll();
      window.requestAnimationFrame(resetScroll);
    });
    // Browser/Next can re-apply restored scroll after paint — beat it with retries.
    const t0 = window.setTimeout(resetScroll, 0);
    const t1 = window.setTimeout(resetScroll, 50);
    const t2 = window.setTimeout(resetScroll, 150);
    const t3 = window.setTimeout(resetScroll, 350);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [pathname]);

  const idleTimerRef = useRef<number | null>(null);
  const lastPinProbeAtRef = useRef(0);
  const processedSharedTransactionTokensRef = useRef<Set<string>>(new Set());
  const mobileBottomNavRef = useRef<HTMLDivElement>(null);
  const mobileBottomNavItemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";
  const isChatFullscreen = pathname === `/${sessionId}/chat`;
  const isMapFullscreen =
    pathname === `/${sessionId}/map` || pathname === `/${sessionId}/places`;
  const isTransactionDetailPage = ["transactions", "loan", "subscription"].some(
    (module) => pathname.startsWith(`/${sessionId}/${module}/`) && pathname !== `/${sessionId}/${module}`,
  );
  const personalRootPath = `/${sessionId}`;
  const pinVerifiedStorageKey = `pin_verified_${sessionId}_personal`;
  const mobileChatHref = `/${sessionId}/chat`;
  const isMobileChatActive = pathname === mobileChatHref;
  const sharedTransactionQueryToken =
    searchParams.get(SHARED_TRANSACTION_TOKEN_QUERY_KEY) || "";
  const sharedTransactionStorageKey =
    getActiveSharedTransactionTokenStorageKey(sessionId);
  const sharedTransactionToken =
    sharedTransactionQueryToken || storedSharedTransactionToken;
  const sharedTransactionPinBypassKey =
    getSharedTransactionPinBypassStorageKey(sessionId);
  const hasSharedTransactionPinBypass =
    typeof window !== "undefined" &&
    window.sessionStorage.getItem(sharedTransactionPinBypassKey) === "true";
  const suppressPinLockUi =
    Boolean(sharedTransactionToken) || hasSharedTransactionPinBypass;
  const showMobileHeader = false;
  const mobileHeaderMeta = getMobileHeaderMeta(
    pathname,
    sessionId,
    t as Record<string, string>,
    user,
  );
  const MobileHeaderIcon = mobileHeaderMeta.icon;
  const currentMobileNavLeft = mobileNavLeft;
  const currentMobileNavRight = mobileNavRight;
  const currentMobileCenterHref = mobileChatHref;
  const currentMobileBottomNavItems = mobileBottomNavItems;

  const isMobileBottomNavActive = React.useCallback(
    (href: string) => {
      const base = `/${sessionId}`;

      if (href === base) return pathname === href;
      if (href === `${base}/transactions`)
        return pathname === href || pathname.startsWith(`${href}/`);
      if (href === `${base}/settings`) {
        return [
          `${base}/settings`,
          `${base}/account`,
          `${base}/security`,
          `${base}/bot-command`,
          `${base}/about`,
          `${base}/whatsnew`,
          `${base}/households`,
        ].includes(pathname);
      }

      return pathname === href;
    },
    [pathname, sessionId],
  );

  const activeMobileBottomNavIndex = currentMobileBottomNavItems.findIndex(
    (item) => isMobileBottomNavActive(item.href),
  );



  // Load multi-account data only after mount to avoid SSR/client hydration mismatch.
  useEffect(() => {
    if (typeof window === "undefined") return
    setActiveEmail(getActiveEmail())
    setStoredAccounts(getAccounts())
  }, [])

  // Auto-initialize multi-account store for existing sessions
  useEffect(() => {
    if (typeof window === "undefined") return
    const token = getAccessToken()
    const sid = getSessionId()
    if (!token || !sid) return
    const accounts = getAccounts()
    // If we have an active session but no stored accounts, sync the current one
    if (accounts.length === 0 && user?.name) {
      const refresh = getRefreshToken()
      const email = user.email || ""
      if (email) {
        addAccount(email, user.name || email.split("@")[0], token, refresh, sid)
        setActiveEmail(email)
        setStoredAccounts(getAccounts())
      }
    } else {
      setActiveEmail(getActiveEmail())
      setStoredAccounts(accounts)
    }
  }, [user])

  // Sync current account name to multi-account profile store
  useEffect(() => {
    if (user?.name) {
      syncCurrentAccountToProfile(user.name)
      setStoredAccounts(getAccounts())
      setActiveEmail(getActiveEmail())
    }
  }, [user?.name])

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const updateMobileBottomNavCenterIndex = React.useCallback(() => {
    const container = mobileBottomNavRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.left + containerRect.width / 2;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    mobileBottomNavItemRefs.current.forEach((item, index) => {
      if (!item) return;
      const rect = item.getBoundingClientRect();
      const itemCenter = rect.left + rect.width / 2;
      const distance = Math.abs(centerX - itemCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setMobileBottomNavCenterIndex(nearestIndex);
  }, []);

  const closeMobileMenu = React.useCallback(() => {
    setShowMobileMenu(false);
  }, []);

  const resetAddForm = React.useCallback(() => {
    setAddForm(createDefaultAddForm(timezone));
    setAddItems(createDefaultAddItems());
  }, [timezone]);

  const clearSharedAddAttachment = React.useCallback(() => {
    setSharedAddFile(null);
    setSharedAddPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  const closeAddModal = React.useCallback(() => {
    setAddError("");
    setAddSuccess(false);
    setShowAddModal(false);
    setShowCategoryDropdown(false);
    setShowWalletDropdown(false);
    clearSharedAddAttachment();
    resetAddForm();
  }, [clearSharedAddAttachment, resetAddForm]);

  // ── Voice record (long-press the centre chat nav button) ───────────────
  // Record while held; on release the clip is transcribed and the result is
  // prefilled into the existing Add-Transaction sheet (amount/type/category/
  // wallet) so the user can confirm before saving. No page navigation.
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voicePhase, setVoicePhase] = useState<"recording" | "busy" | "error">("recording");
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState("");
  const [voiceResult, setVoiceResult] = useState<{
    ok: boolean;
    income: boolean;
    title: string;
    body: string;
  } | null>(null);
  const voiceRecorderRef = React.useRef<MediaRecorder | null>(null);
  const voiceChunksRef = React.useRef<Blob[]>([]);
  const voiceStreamRef = React.useRef<MediaStream | null>(null);
  const voiceCleanupRef = React.useRef<(() => void) | null>(null);
  const voiceTickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const closeVoiceRecorder = React.useCallback(() => {
    if (voiceTickRef.current) {
      clearInterval(voiceTickRef.current);
      voiceTickRef.current = null;
    }
    voiceRecorderRef.current = null;
    voiceChunksRef.current = [];
    const stream = voiceStreamRef.current;
    voiceStreamRef.current = null;
    stream?.getTracks().forEach((tr) => tr.stop());
    setVoiceOpen(false);
    setVoiceSeconds(0);
    setVoicePhase("recording");
  }, []);

  const stopAndTranscribe = React.useCallback(async () => {
    setVoicePhase("busy");
    const recorder = voiceRecorderRef.current;
    try {
      recorder?.stop();
    } catch {}
    // onstop does the rest (see beginVoiceHold).
  }, []);

  const beginVoiceHold = React.useCallback(async () => {
    if (voiceOpen) return;
    setVoiceError("");
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError(
        lang === "BM"
          ? "Rakaman suara tidak disokong pada pelayar ini."
          : "Voice recording is not supported on this browser.",
      );
      setVoicePhase("error");
      setVoiceOpen(true);
      window.setTimeout(() => setVoiceOpen(false), 2600);
      return;
    }
    try {
      const perm = (navigator.permissions as any)?.query
        ? await (navigator.permissions as any).query({ name: "microphone" as any })
        : null;
      if (perm?.state === "denied") {
        setVoiceError(
          lang === "BM"
            ? "Kebenaran mikrofon disekat. Benarkan mikrofon, kemudian cuba lagi."
            : "Microphone permission was blocked. Allow microphone, then try again.",
        );
        setVoicePhase("error");
        setVoiceOpen(true);
        window.setTimeout(() => setVoiceOpen(false), 2600);
        return;
      }
    } catch {}
    const isIncomeSpoken = (s: string) =>
      /gaji|salary|income|terima|receive|masuk|dividen|bonus/i.test(s);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      // WebView (Android app) has no platform AGC — the constraints above are
      // ideals WebView may ignore, leaving raw ~25 dB-quiet input that Whisper
      // can't hear. setupVoiceMedia() boosts + compresses through WebAudio in
      // the wrapper only; Chrome/PWA (real AGC) passes through untouched.
      // Released/cancelled while the mic was warming up → never start recording.
      if (!chatHoldFired.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      const voiceSetup = setupVoiceMedia(stream);
      const voiceMime = preferredVoiceMime();
      const recorder = voiceMime
        ? new MediaRecorder(voiceSetup.stream, voiceMime)
        : new MediaRecorder(voiceSetup.stream);
      console.warn(
        "[voice] MediaRecorder mime=" + recorder.mimeType,
        "sampleRate=" + (voiceSetup.stream.getAudioTracks()[0]?.getSettings?.().sampleRate ?? "?"),
        "boost=" + voiceSetup.boosted,
      );
      voiceCleanupRef.current = voiceSetup.cleanup;
      voiceStreamRef.current = voiceSetup.stream;
      voiceChunksRef.current = [];
      voiceRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const streamNow = voiceStreamRef.current;
        voiceStreamRef.current = null;
        voiceRecorderRef.current = null;
        streamNow?.getTracks().forEach((tr) => tr.stop());
        voiceCleanupRef.current?.();
        voiceCleanupRef.current = null;
        if (voiceTickRef.current) {
          clearInterval(voiceTickRef.current);
          voiceTickRef.current = null;
        }
        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        voiceChunksRef.current = [];
        if (blob.size < 200) {
          setVoicePhase("error");
          setVoiceError(lang === "BM" ? "Audio terlalu pendek." : "Audio too short.");
          window.setTimeout(() => setVoiceOpen(false), 2000);
          return;
        }
        setVoicePhase("busy");
        try {
          const token = getAccessToken();
          const formData = new FormData();
          formData.append("file", blob, "voice.webm");
          const res = await fetch("/api/transcribe", {
            credentials: "include",
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: formData,
          });
          if (!res.ok) throw new Error("transcribe failed");
          const data = await res.json();
          const spoken = String(data?.text || "").trim();
          console.warn("[voice] transcript=" + JSON.stringify(spoken));
          const showResult = (
            ok: boolean,
            income: boolean,
            title: string,
            body: string,
          ) => {
            setVoiceOpen(false);
            setVoiceSeconds(0);
            setVoicePhase("recording");
            setVoiceResult({ ok, income, title, body });
          };
          if (!spoken) {
            showResult(
              false,
              false,
              lang === "BM" ? "Transaksi suara tidak dikesan" : "Voice transaction not detected",
              "",
            );
            return;
          }
          // Let the chat/transaction engine detect & save the transaction from
          // the spoken text (same path as chat's voice button, but headless —
          // no navigation, no chat page). Its reply marks a saved transaction.
          const chatForm = new FormData();
          chatForm.append("text", spoken);
          const chatRes = await fetch("/api/chat/message", {
            credentials: "include",
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: chatForm,
          });
          if (!chatRes.ok) throw new Error("chat detect failed");
          const chatData = await chatRes.json().catch(() => null);
          const reply = String(chatData?.reply || "").trim();
          console.warn("[voice] reply=" + JSON.stringify(reply));
          const isTxn = reply.startsWith("*Done!") || /\bTXN\d{2}-/.test(reply);
          if (reply && isTxn) {
            window.dispatchEvent(
              new CustomEvent("app:data-changed", {
                detail: { resource: "transactions" },
              }),
            );
            showResult(
              true,
              isIncomeSpoken(spoken) || /pendapatan|\bincome\b/i.test(reply),
              lang === "BM" ? "Transaksi Direkod" : "Transaction Recorded",
              reply,
            );
          } else {
            showResult(
              false,
              false,
              lang === "BM" ? "Transaksi suara tidak dikesan" : "Voice transaction not detected",
              spoken,
            );
          }
        } catch {
          setVoiceError(
            lang === "BM" ? "Ralat membaca audio. Cuba lagi." : "Error reading audio. Try again.",
          );
          setVoicePhase("error");
          window.setTimeout(() => setVoiceOpen(false), 2000);
        }
      };
      // Safety: released during setup → discard, never record without a hold.
      if (!chatHoldFired.current) {
        recorder.onstop = null;
        voiceCleanupRef.current?.();
        voiceCleanupRef.current = null;
        voiceStreamRef.current = null;
        voiceRecorderRef.current = null;
        if (voiceTickRef.current) {
          clearInterval(voiceTickRef.current);
          voiceTickRef.current = null;
        }
        setVoiceOpen(false);
        return;
      }
      recorder.start();
      setVoiceSeconds(0);
      setVoicePhase("recording");
      setVoiceOpen(true);
      voiceTickRef.current = setInterval(() => {
        setVoiceSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      const denied =
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError" ||
        err?.name === "SecurityError";
      setVoiceError(
        denied
          ? (lang === "BM"
              ? "Akses mikrofon tidak dibenarkan."
              : "Microphone access was not granted.")
          : (lang === "BM" ? "Tidak dapat memulakan mikrofon." : "Could not start microphone."),
      );
      setVoicePhase("error");
      setVoiceOpen(true);
      window.setTimeout(() => setVoiceOpen(false), 2200);
    }
  }, [lang, voiceOpen]);

  const finishVoiceHold = React.useCallback(() => {
    if (!voiceRecorderRef.current) {
      closeVoiceRecorder();
      return;
    }
    void stopAndTranscribe();
  }, [closeVoiceRecorder, stopAndTranscribe]);

  const cancelVoiceHold = React.useCallback(() => {
    const recorder = voiceRecorderRef.current;
    try {
      recorder?.stop();
    } catch {}
    // Swallow onstop: recording must be discarded, so clear the stop handler
    // before stopping and tear everything down ourselves.
    if (recorder) recorder.onstop = null;
    voiceStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    voiceStreamRef.current = null;
    voiceCleanupRef.current?.();
    voiceCleanupRef.current = null;
    if (voiceTickRef.current) {
      clearInterval(voiceTickRef.current);
      voiceTickRef.current = null;
    }
    voiceRecorderRef.current = null;
    voiceChunksRef.current = [];
    setVoiceOpen(false);
    setVoiceSeconds(0);
    setVoicePhase("recording");
    setVoiceError("");
  }, []);

  const handleBottomNavLinkClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (pathname === href) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      router.push(href, { scroll: true });
    },
    [pathname, router],
  );

  // Long-press the centre chat button → record a voice transaction in place
  // (no navigation); release submits. chatSuppressClick swallows the synthetic
  // click that follows the release so we never navigate to the chat page.
  const chatHoldTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatHoldFired = React.useRef(false);
  const chatSuppressClick = React.useRef(false);
  const releaseChatHold = React.useCallback(() => {
    if (chatHoldTimer.current) {
      clearTimeout(chatHoldTimer.current);
      chatHoldTimer.current = null;
    }
  }, []);
  const armChatVoiceHold = React.useCallback(() => {
    // Never stack: already recording (or mic warming up) → ignore new hold.
    if (voiceOpen || voiceRecorderRef.current) return;
    chatHoldFired.current = false;
    releaseChatHold();
    chatHoldTimer.current = setTimeout(() => {
      chatHoldTimer.current = null;
      chatHoldFired.current = true;
      chatSuppressClick.current = true;
      void beginVoiceHold();
    }, 550);
  }, [beginVoiceHold, releaseChatHold, voiceOpen]);
  const finishChatHold = React.useCallback(
    (cancel: boolean) => {
      releaseChatHold();
      if (!chatHoldFired.current) return;
      chatHoldFired.current = false;
      if (cancel) {
        chatSuppressClick.current = false; // pointer-cancel sends no click; stay clear for next tap
        cancelVoiceHold();
      } else {
        finishVoiceHold();
      }
    },
    [releaseChatHold, cancelVoiceHold, finishVoiceHold],
  );

  const {
    requestClose: requestMobileMenuClose,
    requestCloseThen: requestMobileMenuCloseThen,
  } = useOverlayBackClose({
    id: "shell-mobile-menu",
    isOpen: showMobileMenu && !isChatFullscreen,
    onClose: closeMobileMenu,
  });

  const {
    requestClose: requestAddModalClose,
    requestCloseThen: requestAddModalCloseThen,
  } = useOverlayBackClose({
    id: "shell-add-modal",
    isOpen: showAddModal,
    onClose: closeAddModal,
  });
  const shellAddSheetSwipe = useSwipeDownToClose(requestAddModalClose);

  useEffect(() => {
    setShowMobileMenu(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextRoute = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    writeSmartBackRoute(nextRoute);
  }, [pathname, searchParams]);

  useEffect(() => {
    return () => {
      if (sharedAddPreviewUrl) {
        URL.revokeObjectURL(sharedAddPreviewUrl);
      }
    };
  }, [sharedAddPreviewUrl]);

  useEffect(() => {
    if (!sessionId || !suppressPinLockUi) return;
    setPinLockRequired(false);
    setPinInput("");
    setPinLockError("");
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(pinVerifiedStorageKey, "true");
    }
  }, [sessionId, suppressPinLockUi]);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionId) return;
    const storedToken =
      window.sessionStorage.getItem(sharedTransactionStorageKey) || "";
    if (storedToken !== storedSharedTransactionToken) {
      setStoredSharedTransactionToken(storedToken);
    }
  }, [sessionId, sharedTransactionStorageKey, storedSharedTransactionToken]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !sessionId ||
      !sharedTransactionQueryToken
    )
      return;
    window.sessionStorage.setItem(
      sharedTransactionStorageKey,
      sharedTransactionQueryToken,
    );
    if (sharedTransactionQueryToken !== storedSharedTransactionToken) {
      setStoredSharedTransactionToken(sharedTransactionQueryToken);
    }
  }, [
    sessionId,
    sharedTransactionQueryToken,
    sharedTransactionStorageKey,
    storedSharedTransactionToken,
  ]);

  useEffect(() => {
    if (
      isAuthPage ||
      !sharedTransactionToken ||
      processedSharedTransactionTokensRef.current.has(sharedTransactionToken)
    ) {
      return;
    }

    processedSharedTransactionTokensRef.current.add(sharedTransactionToken);
    let cancelled = false;

    const clearShareQuery = () => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete(SHARED_TRANSACTION_TOKEN_QUERY_KEY);
      const nextUrl = nextParams.toString()
        ? `${pathname}?${nextParams.toString()}`
        : pathname;
      if (typeof window !== "undefined") {
        window.history.replaceState(window.history.state, "", nextUrl);
        return;
      }
      router.replace(nextUrl, { scroll: false });
    };

    const openSharedTransactionModal = async () => {
      try {
        const res = await fetch(
          `/share-target-file/${encodeURIComponent(sharedTransactionToken)}`,
          {
            cache: "no-store",
          },
        );
        if (!res.ok) {
          throw new Error(`Shared transaction fetch failed (${res.status})`);
        }

        let sharedText = "";
        let sharedFile: File | null = null;
        const contentType = res.headers.get("content-type") || "";

        if (contentType.startsWith("application/json")) {
          const payload = (await res.json().catch(() => null)) as {
            title?: string;
            text?: string;
            url?: string;
          } | null;
          sharedText = [payload?.title, payload?.text, payload?.url]
            .filter(Boolean)
            .join(" ")
            .trim();
        } else {
          if (!contentType.startsWith("image/")) {
            throw new Error("Shared file is not supported");
          }

          const fileName =
            decodeSharedHeaderValue(res.headers.get("x-shared-file-name")) ||
            "shared-screenshot.png";
          const blob = await res.blob();
          sharedFile = new File([blob], fileName, {
            type: contentType || "image/png",
          });
          sharedText = [
            decodeSharedHeaderValue(res.headers.get("x-shared-title")),
            decodeSharedHeaderValue(res.headers.get("x-shared-text")),
            decodeSharedHeaderValue(res.headers.get("x-shared-url")),
          ]
            .filter(Boolean)
            .join(" ")
            .trim();
        }

        if (cancelled) return;

        clearSharedAddAttachment();
        if (sharedFile) {
          setSharedAddFile(sharedFile);
          setSharedAddPreviewUrl(URL.createObjectURL(sharedFile));
        }

        setAddError("");
        setAddSuccess(false);
        setAddForm((current) => ({
          ...current,
          description: sharedText || current.description,
          type: "expense",
        }));
        if (sharedText) {
          setAddItems([
            { name: sharedText.slice(0, 190), quantity: "1", unit_price: "0" },
          ]);
        } else {
          setAddItems(createDefaultAddItems());
        }
        setShowAddModal(true);
        void fetch(
          `/share-target-file/${encodeURIComponent(sharedTransactionToken)}`,
          { method: "DELETE" },
        );
      } catch (error) {
        if (cancelled) return;
        console.error("Open shared transaction modal error:", error);
        setAddError(
          lang === "BM"
            ? "Screenshot yang dikongsi tidak dapat dibuka."
            : "Shared screenshot could not be opened.",
        );
        setShowAddModal(true);
      } finally {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(sharedTransactionPinBypassKey);
          window.sessionStorage.removeItem(sharedTransactionStorageKey);
        }
        setStoredSharedTransactionToken("");
        clearShareQuery();
      }
    };

    void openSharedTransactionModal();

    return () => {
      cancelled = true;
    };
  }, [
    clearSharedAddAttachment,
    isAuthPage,
    lang,
    pathname,
    router,
    searchParams,
    sharedTransactionPinBypassKey,
    sharedTransactionStorageKey,
    sharedTransactionToken,
  ]);

  useEffect(() => {
    setAddForm((current) => {
      const preferredCategory = getPreferredCategoryName(
        categories,
        current.type,
        current.category,
      );
      if (preferredCategory === current.category) return current;
      return {
        ...current,
        category: preferredCategory,
      };
    });
  }, [categories]);

  useEffect(() => {
    const handleMobileBottomNavVisibility = (event: Event) => {
      const customEvent = event as CustomEvent<{ hidden?: boolean }>;
      setHideMobileBottomNav(Boolean(customEvent.detail?.hidden));
    };

    window.addEventListener(
      "portal:mobile-bottom-nav-visibility",
      handleMobileBottomNavVisibility as EventListener,
    );
    return () => {
      window.removeEventListener(
        "portal:mobile-bottom-nav-visibility",
        handleMobileBottomNavVisibility as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (activeMobileBottomNavIndex < 0) return;

    const frame = window.requestAnimationFrame(() => {
      const activeItem =
        mobileBottomNavItemRefs.current[activeMobileBottomNavIndex];
      activeItem?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
      setMobileBottomNavCenterIndex(activeMobileBottomNavIndex);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeMobileBottomNavIndex, pathname]);

  useEffect(() => {
    const handleResize = () => updateMobileBottomNavCenterIndex();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateMobileBottomNavCenterIndex]);

  useEffect(() => {
    const isAllowedContextMenuTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const editable = target.closest(
        "input, textarea, [contenteditable='true'], [contenteditable=''], [contenteditable]",
      );
      if (!(editable instanceof HTMLElement)) return false;
      if (editable instanceof HTMLTextAreaElement) return true;
      if (editable instanceof HTMLInputElement) {
        const type = (editable.type || "text").toLowerCase();
        return ![
          "button",
          "checkbox",
          "color",
          "file",
          "hidden",
          "image",
          "radio",
          "range",
          "reset",
          "submit",
        ].includes(type);
      }
      return editable.isContentEditable;
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (isAllowedContextMenuTarget(event.target)) return;
      event.preventDefault();
    };

    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  const fetchData = async () => {
    try {
      const token = getAccessToken();
      if (!token) return;

      const urls = {
        stats: "/api/stats",
        categories: "/api/categories",
        wallets: "/api/wallets",
        user: "/api/users/me",
        transactions: "/api/transactions",
        budgets: `/api/budgets?month=${new Date().toISOString().slice(0, 7)}`,
      };

      const cachedStats = readApiCache<ShellStats>(urls.stats, token);
      const cachedCategories = readApiCache<ShellCategory[]>(
        urls.categories,
        token,
      );
      const cachedWallets = readApiCache<ShellWallet[]>(urls.wallets, token);
      const cachedUser = readApiCache<ShellUser>(urls.user, token);
      const cachedTransactions = readApiCache<ShellTransaction[]>(
        urls.transactions,
        token,
      );
      const cachedBudgets = readApiCache<ShellBudgetItem[]>(
        urls.budgets,
        token,
      );
      if (cachedStats) setStats(cachedStats);
      if (cachedCategories) setCategories(cachedCategories);
      if (cachedWallets)
        setWallets(Array.isArray(cachedWallets) ? cachedWallets : []);
      if (cachedUser) setUser(cachedUser);
      if (cachedTransactions)
        setTransactions(
          Array.isArray(cachedTransactions) ? cachedTransactions : [],
        );
      if (cachedBudgets)
        setBudgetItems(Array.isArray(cachedBudgets) ? cachedBudgets : []);

      const [
        statsResult,
        catsResult,
        walletsResult,
        userResult,
        transactionsResult,
        budgetsResult,
      ] = await Promise.allSettled([
        fetchApiJson<ShellStats>(urls.stats, token),
        fetchApiJson<ShellCategory[]>(urls.categories, token),
        fetchApiJson<ShellWallet[]>(urls.wallets, token),
        fetchApiJson<ShellUser>(urls.user, token),
        fetchApiJson<ShellTransaction[]>(urls.transactions, token),
        fetchApiJson<ShellBudgetItem[]>(urls.budgets, token),
      ]);

      const results = [
        statsResult,
        catsResult,
        walletsResult,
        userResult,
        transactionsResult,
        budgetsResult,
      ];
      const hasUnauthorized = results.some(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof Error &&
          result.reason.message.includes("401"),
      );
      if (hasUnauthorized) {
        const latestToken = getAccessToken();
        const latestRefreshToken = getRefreshToken();
        if (
          !isCookieAuthSentinel(latestToken) &&
          !isCookieAuthSentinel(latestRefreshToken)
        ) {
          clearAuthSession();
          router.replace("/login");
        }
        return;
      }

      if (statsResult.status === "fulfilled") setStats(statsResult.value);
      if (catsResult.status === "fulfilled")
        setCategories(Array.isArray(catsResult.value) ? catsResult.value : []);
      if (walletsResult.status === "fulfilled")
        setWallets(
          Array.isArray(walletsResult.value) ? walletsResult.value : [],
        );
      if (userResult.status === "fulfilled") setUser(userResult.value);
      // Source of truth for email verification (covers legacy/Google users whose local flag was never set).
      if (userResult.status === "fulfilled" && userResult.value && typeof userResult.value.email_verified === "boolean") {
        setEmailVerifiedState(userResult.value.email_verified);
        setEmailVerified(userResult.value.email_verified);
        setEmailVerifiedKnown(true);
      }
      // Derive resend cooldown from server-provided last-sent time (server clock, not device).
      if (userResult.status === "fulfilled" && userResult.value?.verification_email_sent_at) {
        const sent = new Date(userResult.value.verification_email_sent_at).getTime()
        if (!Number.isNaN(sent)) {
          const count = userResult.value.verification_email_resend_count ?? 0
          setVerifyResendCount(count)
          const cd = count >= 1 ? 300_000 : 60_000
          setVerifyCooldownUntil(Math.max(verifyCooldownUntil, sent + cd))
          // Account auto-disable deadline: 2 days after the verification email was sent.
          setVerifyDeadlineAt(sent + 2 * 24 * 60 * 60 * 1000)
        }
      }
      // Legacy email users (no sent_at) still get a deadline from account creation.
      if (userResult.status === "fulfilled" && userResult.value?.created_at && verifyDeadlineAt <= 0) {
        const created = new Date(userResult.value.created_at).getTime()
        if (!Number.isNaN(created)) {
          setVerifyDeadlineAt(created + 2 * 24 * 60 * 60 * 1000)
        }
      }
      if (transactionsResult.status === "fulfilled")
        setTransactions(
          Array.isArray(transactionsResult.value)
            ? transactionsResult.value
            : [],
        );
      if (budgetsResult.status === "fulfilled")
        setBudgetItems(
          Array.isArray(budgetsResult.value) ? budgetsResult.value : [],
        );
    } catch (err) {
      console.error("Shell data fetch error:", err);
    }

  };

  useEffect(() => setIsMounted(true), [])

  useEffect(() => {
    if (!isMounted) return
    setEmailVerifiedState(getEmailVerified())
  }, [isMounted])

  useEffect(() => {
    const onAuth = () => {
      setEmailVerifiedState(getEmailVerified())
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") setEmailVerifiedState(getEmailVerified())
    }
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onAuth)
    window.addEventListener("focus", onAuth)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onAuth)
      window.removeEventListener("focus", onAuth)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  // Tick each second while a resend cooldown or account-disable deadline is active.
  useEffect(() => {
    if (verifyCooldownUntil <= 0 && verifyDeadlineAt <= 0) return
    const iv = setInterval(() => setNowTick((n) => n + 1), 1000)
    return () => clearInterval(iv)
  }, [verifyCooldownUntil, verifyDeadlineAt])

  const handleResendVerify = useCallback(async () => {
    setResendingVerify(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/verify-email/resend", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(token),
      })
      if (res.ok) {
        // Cooldown after send: first resend 60s, subsequent 300s. Server increments count.
        const cd = verifyResendCount >= 1 ? 300_000 : 60_000
        setVerifyCooldownUntil(Date.now() + cd)
        setVerifyResendCount((c) => c + 1)
      } else if (res.status === 429) {
        // Server-enforced cooldown still active; honour Retry-After from server.
        const retryAfter = Number(res.headers.get("Retry-After")) || 60
        setVerifyCooldownUntil(Date.now() + retryAfter * 1000)
      }
      // Ignore other errors — banner stays; user can retry.
    } catch {
      // ignore — banner stays; user can retry
    } finally {
      setResendingVerify(false)
    }
  }, [verifyResendCount])

  useEffect(() => {
    let delayedFetchTimer: number | undefined;
    if (!isAuthPage) {
      const token = getAccessToken();
      const refreshToken = getRefreshToken();
      const localSessionId =
        token || refreshToken ? ensureSessionId() : getSessionId();
      if (!token && !refreshToken) {
        router.replace("/login");
      } else if (localSessionId && sessionId !== localSessionId) {
        router.replace(`/${localSessionId}`);
      } else if (!token && refreshToken) {
        delayedFetchTimer = window.setTimeout(() => {
          void fetchData();
        }, 500);
      } else {
        void fetchData();
      }
    }
    return () => {
      if (delayedFetchTimer) window.clearTimeout(delayedFetchTimer);
    };
  }, [pathname, isAuthPage, router, sessionId]);

  useEffect(() => {
    if (isAuthPage) return;

    const handleAuthSessionChanged = () => {
      const token = getAccessToken();
      const refreshToken = getRefreshToken();
      if (!token && !refreshToken) {
        router.replace("/login");
      }
    };

    window.addEventListener(
      AUTH_SESSION_CHANGED_EVENT,
      handleAuthSessionChanged,
    );
    return () => {
      window.removeEventListener(
        AUTH_SESSION_CHANGED_EVENT,
        handleAuthSessionChanged,
      );
    };
  }, [isAuthPage, router]);

  useEffect(() => {
    if (isAuthPage) return;

    const hasVerifiedPin =
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(pinVerifiedStorageKey) === "true";
    const shouldLock =
      pinEnabled &&
      !isTransactionDetailPage &&
      !hasVerifiedPin &&
      !suppressPinLockUi;

    setPinLockRequired(shouldLock);
    if (!shouldLock) {
      setPinInput("");
      setPinLockError("");
    }
  }, [
    isAuthPage,
    isTransactionDetailPage,
    pinEnabled,
    pinVerifiedStorageKey,
    suppressPinLockUi,
  ]);

  useEffect(() => {
    let isCancelled = false;

    if (isAuthPage) {
      setPinLockRequired(false);
      setPinInput("");
      setPinLockError("");
      setPinEnabled(false);
      setPinStatusReady(false);
      return;
    }

    const probePinLock = async (attempt = 0, forceRefresh = false) => {
      if (isCancelled) return;
      const token = getAccessToken();
      const refreshToken = getRefreshToken();
      const pinEnabledFromSession = hasPinEnabledSession();

      if (!token) {
        if (refreshToken && attempt < 20) {
          window.setTimeout(() => {
            void probePinLock(attempt + 1);
          }, 500);
          return;
        }
        setPinEnabled(pinEnabledFromSession);
        setPinStatusReady(true);
        return;
      }

      try {
        const now = Date.now();
        if (!forceRefresh) {
          const cached = readApiCache<PinStatus>(
            "/api/users/me/pin",
            token,
            PIN_STATUS_CACHE_TTL_MS,
          );
          if (cached) {
            setPinEnabled(Boolean(cached?.enabled));
            setPinStatusReady(true);
            lastPinProbeAtRef.current = now;
            return;
          }
        }

        if (
          !forceRefresh &&
          lastPinProbeAtRef.current > 0 &&
          now - lastPinProbeAtRef.current < PIN_STATUS_REVALIDATE_MS
        ) {
          setPinEnabled(pinEnabledFromSession);
          setPinStatusReady(true);
          return;
        }

        const data = await fetchApiJson<PinStatus>("/api/users/me/pin", token, {
          headers: authHeaders(token),
        }).catch(() => null);

        if (!data) {
          setPinEnabled(pinEnabledFromSession);
          setPinStatusReady(true);
          return;
        }

        const isPinEnabled = Boolean(data?.enabled);
        writeApiCache("/api/users/me/pin", token, data);
        lastPinProbeAtRef.current = now;
        setPinEnabled(isPinEnabled);
        setPinStatusReady(true);
      } catch {
        setPinEnabled(pinEnabledFromSession);
        setPinStatusReady(true);
        // Best effort only; don't block app on pin status fetch failures.
      }
    };

    void probePinLock();

    const handlePinStatusChanged = () => {
      void probePinLock(0, true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void probePinLock();
      }
    };
    window.addEventListener("pin-status-changed", handlePinStatusChanged);
    window.addEventListener("focus", handlePinStatusChanged);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      window.removeEventListener("pin-status-changed", handlePinStatusChanged);
      window.removeEventListener("focus", handlePinStatusChanged);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    isAuthPage,
    sessionId,
  ]);

  const addItemsTotal = addItems.reduce((sum, item) => {
    const quantity = Number.parseFloat(item.quantity || "0") || 0;
    const unitPrice = Number.parseFloat(item.unit_price || "0") || 0;
    return sum + Math.max(0, quantity) * Math.max(0, unitPrice);
  }, 0);

  const activeAddItems = addItems.filter((item) => item.name.trim());

  const selectedCategoryLabel = addForm.category || t.other;
  const selectedWalletLabel = (() => {
    if (!addForm.wallet_id) return t.debtDefaultWallet;
    const wallet = wallets.find((w) => String(w.id) === addForm.wallet_id);
    return wallet?.label || wallet?.name || t.debtDefaultWallet;
  })();

  const updateAddItem = (
    index: number,
    field: keyof AddItemState,
    value: string,
  ) => {
    setAddItems((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const addAddItem = () => {
    setAddItems((items) => [
      ...items,
      { name: "", quantity: "1", unit_price: "0" },
    ]);
  };

  const removeAddItem = (index: number) => {
    setAddItems((items) =>
      items.length <= 1
        ? createDefaultAddItems()
        : items.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  async function handleAddRecord(e: React.FormEvent) {
    e.preventDefault();
    const useItems = addForm.type === "expense";
    if (useItems && !activeAddItems.length) return;
    if (!useItems && (!addForm.description || !addForm.amount)) return;
    setAddError("");
    setSaving(true);
    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("Missing auth token");
      }
      const res = await fetch("/api/transactions", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token),
        },
        body: JSON.stringify({
          type: addForm.type,
          amount: useItems ? addItemsTotal : parseFloat(addForm.amount),
          vendor_or_source: useItems
            ? activeAddItems
                .map((item) => item.name.trim())
                .join(", ")
                .slice(0, 50)
            : addForm.description,
          txn_date: addForm.date,
          notes: useItems
            ? activeAddItems
                .map(
                  (item) =>
                    `${item.name.trim()} ${item.quantity || "1"}x${item.unit_price || "0"}`,
                )
                .join("\n")
            : addForm.description,
          category_id: addForm.category
            ? (categories.find((c) => c.name === addForm.category)?.id ?? null)
            : null,
          wallet_id: addForm.wallet_id ? parseInt(addForm.wallet_id, 10) : null,
          items: useItems
            ? activeAddItems.map((item) => {
                const quantity = Math.max(
                  0,
                  Number.parseFloat(item.quantity || "0"),
                );
                const unitPrice = Math.max(
                  0,
                  Number.parseFloat(item.unit_price || "0"),
                );
                return {
                  name: item.name.trim(),
                  quantity,
                  unit_price: unitPrice,
                  subtotal: Number((quantity * unitPrice).toFixed(2)),
                };
              })
            : undefined,
        }),
      });

      const payload = (await res.json().catch(() => null)) as {
        id?: number | string;
        txn_id?: number | string;
        transaction_id?: number | string;
        reference_id?: number | string;
        detail?: unknown;
      } | null;

      if (res.ok) {
        let attachmentWarning = "";

        if (sharedAddFile) {
          const transactionKey =
            payload?.reference_id ??
            payload?.id ??
            payload?.transaction_id ??
            payload?.txn_id;
          if (transactionKey) {
            const formData = new FormData();
            formData.append("file", sharedAddFile);
            try {
              const uploadRes = await fetch(
                `/api/transactions/${encodeURIComponent(String(transactionKey))}/attachments`,
                {
                  method: "POST",
                  credentials: "include",
                  headers: authHeaders(token),
                  body: formData,
                },
              );
              if (!uploadRes.ok) {
                throw new Error(
                  `Attachment upload failed (${uploadRes.status})`,
                );
              }
            } catch (error) {
              console.error("Shared attachment upload error:", error);
              attachmentWarning =
                lang === "BM"
                  ? "Transaksi disimpan, tetapi gambar screenshot tidak berjaya dimuat naik."
                  : "Transaction saved, but the shared screenshot could not be uploaded.";
            }
          } else {
            attachmentWarning =
              lang === "BM"
                ? "Transaksi disimpan, tetapi rujukan lampiran tidak ditemui."
                : "Transaction saved, but the attachment reference was not returned.";
          }
        }

        setAddError(attachmentWarning);
        setAddSuccess(true);
        setTimeout(
          () => {
            requestAddModalCloseThen(() => {
              setAddSuccess(false);
              setAddError("");
              clearSharedAddAttachment();
              resetAddForm();
              fetchData();
              window.dispatchEvent(new Event("refreshData"));
            });
          },
          attachmentWarning ? 2400 : 1500,
        );
      } else {
        const fallbackMessage =
          lang === "BM"
            ? "Rekod tidak dapat disimpan."
            : "Record could not be saved.";
        const detail = extractApiDetailMessage(
          payload?.detail,
          fallbackMessage,
        );
        setAddError(localizeAddRecordApiError(detail, lang));
      }
    } catch (err) {
      console.error("Add record error:", err);
      const message =
        err instanceof Error
          ? err.message
          : lang === "BM"
            ? "Rekod tidak dapat disimpan."
            : "Record could not be saved.";
      setAddError(localizeAddRecordApiError(message, lang));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(pinVerifiedStorageKey);
    }
    // Multi-account: remove current account, switch to next if available
    const activeEmail = getActiveEmail()
    if (activeEmail) {
      const nextEmail = removeAccount(activeEmail)
      if (nextEmail) {
        // Switch to another account
        await logoutAuthSession()
        const accts = getAccounts()
        const next = accts.find(a => a.email === nextEmail)
        if (next) {
          switchToAccount(nextEmail)
          router.push("/" + next.sessionId)
          return
        }
      }
    }
    await logoutAuthSession();
    router.push("/login");
  }

  async function verifyPin(candidatePin: string) {
    setPinLockError("");

    if (!/^\d{6}$/.test(candidatePin)) {
      setPinLockError(
        lang === "BM" ? "PIN mesti 6 digit." : "PIN must be exactly 6 digits.",
      );
      return;
    }

    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setPinUnlocking(true);
    try {
      const requestBody = JSON.stringify({ pin: candidatePin });
      let res = await fetch("/api/users/me/pin/verify", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token),
        },
        body: requestBody,
      });

      if (res.status === 401 && token && !isCookieAuthSentinel(token)) {
        res = await fetch("/api/users/me/pin/verify", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: requestBody,
        });
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(
          payload?.detail ||
            (lang === "BM" ? "PIN tidak sah." : "Invalid PIN."),
        );
      }

      setPinInput("");
      setPinLockError("");
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(pinVerifiedStorageKey, "true");
      }
      setPinLockRequired(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setPinInput("");
      setPinLockError(
        message ||
          (lang === "BM"
            ? "Gagal buka kunci dengan PIN."
            : "Failed to unlock with PIN."),
      );
    } finally {
      setPinUnlocking(false);
    }
  }

  const appendPinDigit = (digit: string) => {
    if (pinUnlocking) return;
    if (!/^\d$/.test(digit)) return;
    setPinLockError("");
    setPinInput((prev) => (prev.length >= 6 ? prev : `${prev}${digit}`));
  };

  const removePinDigit = () => {
    if (pinUnlocking) return;
    setPinLockError("");
    setPinInput((prev) => prev.slice(0, -1));
  };

  const handlePinPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    digit: string,
  ) => {
    event.preventDefault();
    appendPinDigit(digit);
  };

  const handlePinDeletePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    removePinDigit();
  };

  useEffect(() => {
    if (!pinLockRequired) return;
    if (pinUnlocking) return;
    if (pinInput.length !== 6) return;
    void verifyPin(pinInput);
  }, [pinInput, pinLockRequired, pinUnlocking, pinVerifiedStorageKey]);

  useEffect(() => {
    if (!pinLockRequired) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const desktopKeyboardMediaQuery = window.matchMedia(
        "(min-width: 1024px) and (hover: hover) and (pointer: fine)",
      );
      if (!desktopKeyboardMediaQuery.matches) return;
      if (pinUnlocking) return;

      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        appendPinDigit(event.key);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        removePinDigit();
        return;
      }

      if (event.key === "Enter" && pinInput.length === 6) {
        event.preventDefault();
        void verifyPin(pinInput);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pinInput, pinLockRequired, pinUnlocking, pinVerifiedStorageKey]);

  const resetIdleTimer = () => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    if (pinLockRequired) return; // Don't track idle if already locked

    idleTimerRef.current = window.setTimeout(
      () => {
        // Check if PIN is even enabled before locking on idle
        const probe = async () => {
          const token = getAccessToken();
          if (!token) return;
          try {
            const res = await fetch("/api/users/me/pin", {
              credentials: "include",
              headers: authHeaders(token),
            });
            if (res.ok) {
              const data = (await res.json()) as PinStatus;
              if (data.enabled && !isTransactionDetailPage) {
                if (typeof window !== "undefined") {
                  window.sessionStorage.removeItem(pinVerifiedStorageKey);
                }
                setPinLockRequired(true);
              }
            }
          } catch {}
        };
        void probe();
      },
      5 * 60 * 1000,
    ); // 5 minutes idle
  };

  useEffect(() => {
    const handleBeforeInput = (event: InputEvent) => {
      const target = event.target;
      if (!isNumericLikeInput(target)) return;
      if (event.isComposing) return;
      const incoming = typeof event.data === "string" ? event.data : "";
      if (!incoming) return;
      const sanitized = sanitizeNumericLikeValue(target, incoming);
      if (sanitized === incoming) return;
      event.preventDefault();
    };

    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (!isNumericLikeInput(target)) return;
      const pasted = event.clipboardData?.getData("text") || "";
      const sanitized = sanitizeNumericLikeValue(target, pasted);
      if (sanitized === pasted) return;
      event.preventDefault();
      const input = target;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const nextValue = `${input.value.slice(0, start)}${sanitized}${input.value.slice(end)}`;
      const nextSanitizedValue = sanitizeNumericLikeValue(input, nextValue);
      input.value = nextSanitizedValue;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    document.addEventListener("beforeinput", handleBeforeInput, true);
    document.addEventListener("paste", handlePaste, true);
    return () => {
      document.removeEventListener("beforeinput", handleBeforeInput, true);
      document.removeEventListener("paste", handlePaste, true);
    };
  }, []);

  useEffect(() => {
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
    ];
    const handler = () => resetIdleTimer();

    events.forEach((e) => window.addEventListener(e, handler));
    resetIdleTimer(); // Initial start

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [pinLockRequired, pathname, sessionId]);

  // Close account switcher on click outside
  useEffect(() => {
    if (!showAccountSwitcher) return
    const handler = (e: MouseEvent) => {
      if (accountSwitcherRef && !accountSwitcherRef.contains(e.target as Node)) {
        setShowAccountSwitcher(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showAccountSwitcher, accountSwitcherRef])

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchData();
      setRefreshKey((prev) => prev + 1);
      window.dispatchEvent(new Event("refreshData"));
      // Artificial delay for visual feedback
      await new Promise((r) => setTimeout(r, 600));
    } finally {
      setIsRefreshing(false);
    }
  };

  const shouldIgnorePullToRefresh = (event: React.TouchEvent) => {
    const target = event.target;
    return (
      target instanceof Element &&
      Boolean(target.closest('[data-prevent-pull-refresh="true"]'))
    );
  };

  const onTouchStart = () => {
    // Pull-to-refresh disabled — caused unwanted triggers during normal scroll
  };

  const onTouchMove = () => {
    // Pull-to-refresh disabled
  };

  const onTouchEnd = () => {
    // Pull-to-refresh disabled
    setPullDistance(0);
    setStartY(null);
  };

  if (isAuthPage) {
    return (
      <main
        className={cn(
          "min-h-screen relative",
          isLight ? "bg-[var(--bg)]" : "bg-black",
        )}
      >
        {children}
      </main>
    );
  }

  const shellContent = (
    <div
      className={cn(
        // overflow-x-clip (not hidden) so sticky page top bars still work against main scroll
        "portal-app-shell min-h-[100dvh] flex flex-col font-sans select-none overflow-x-clip",
        "portal-personal-shell",
        isPersonalDashboardHome && "portal-dashboard-home",
        "lg:h-[100dvh] lg:flex-row lg:overflow-hidden",
        isLight
          ? "bg-[var(--bg)] text-slate-900"
          : "bg-black text-[#f0f2fa]",
      )}
    >
      {pinLockRequired && !suppressPinLockUi && (
 <div className="fixed inset-0 z-[99999] overflow-hidden">
          <div
            aria-hidden="true"
            className={cn("absolute inset-0 z-0", isLight ? "bg-[var(--page-bg)]" : "bg-black")}
          />

          {/* Lock screen content */}
          <div className="relative z-10 flex h-[100dvh] w-full flex-col items-center justify-center px-6 py-10">
            <div className="flex w-full max-w-[320px] flex-col items-center">
              <div
                className={cn(
                  "mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border",
                  isLight
                    ? "border-[var(--border)] bg-[var(--card)] text-slate-800"
                    : "border-[var(--border)] bg-[var(--card)] text-white",
                )}
              >
                <Lock size={26} strokeWidth={2.6} />
              </div>
              <h2
                className={cn(
                  "text-center text-2xl font-black tracking-tight",
                  isLight ? "text-slate-900" : "text-white",
                )}
              >
                {lang === "BM" ? "Masukkan PIN" : "Enter PIN"}
              </h2>
              <p
                className={cn(
                  "mt-1.5 text-center text-[0.8rem] font-medium",
                  isLight ? "text-slate-600" : "text-white/55",
                )}
              >
                {lang === "BM"
                  ? "6 digit untuk buka portal"
                  : "6 digits to unlock portal"}
              </p>
              <div
                className={cn(
                  "mx-auto mt-6 flex items-center justify-center gap-4 rounded-full border px-6 py-4",
                  isLight ? "border-[var(--border)] bg-[var(--card)]" : "border-[var(--border)] bg-[var(--card)]",
                )}
              >
                {Array.from({ length: 6 }).map((_, idx) => {
                  const filled = idx < pinInput.length;
                  return (
                    <span
                      key={idx}
                      className={cn(
                        "block h-3.5 w-3.5 rounded-full transition-all duration-200",
                        filled
                          ? isLight
                            ? "scale-110 bg-slate-700"
                            : "scale-110 bg-white"
                          : isLight
                            ? "bg-slate-300/80 ring-1 ring-slate-400/30"
                            : "bg-white/20 ring-1 ring-white/10",
                      )}
                    />
                  );
                })}
              </div>

              {pinLockError && (
                <p
                  className={cn(
                    "mt-4 w-full rounded-2xl border px-4 py-3 text-center text-[0.8125rem] font-bold",
                    isLight
                      ? "border-red-200 bg-red-50 text-red-600"
                      : "border-red-400/20 bg-red-400/10 text-red-200",
                  )}
                >
                  {pinLockError}
                </p>
              )}
            </div>

            <div className="mx-auto mt-10 grid w-full max-w-[300px] grid-cols-3 gap-x-5 gap-y-5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(
                (digit) => (
                  <button
                    key={digit}
                    type="button"
                    disabled={pinUnlocking}
                    onPointerDown={(event) =>
                      handlePinPointerDown(event, digit)
                    }
                    onClick={(event) => event.preventDefault()}
                    className={cn(
                      "flex h-[62px] touch-manipulation select-none items-center justify-center rounded-2xl border transition-all duration-150 active:scale-[0.94] disabled:opacity-50",
                      isLight
                        ? "border-[var(--border)] bg-[var(--card)] text-slate-900 hover:bg-[var(--surface-tint)]"
                        : "border-[var(--border)] bg-[var(--card)] text-white hover:bg-[var(--surface-tint)]",
                    )}
                  >
                    <span className="block translate-y-[1px] text-[1.9rem] font-black leading-none">
                      {digit}
                    </span>
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => {
                  void handleLogout();
                }}
                className={cn(
                  "flex h-[62px] select-none items-center justify-center rounded-2xl border text-[0.7rem] font-black uppercase tracking-[0.14em] transition-all active:scale-[0.94]",
                  isLight
                    ? "border-[var(--border)] bg-[var(--card)] text-slate-500 hover:bg-[var(--surface-tint)]"
                    : "border-[var(--border)] bg-[var(--card)] text-white/60 hover:bg-[var(--surface-tint)]",
                )}
              >
                {lang === "BM" ? "Keluar" : "Exit"}
              </button>
              <button
                type="button"
                disabled={pinUnlocking}
                onPointerDown={(event) => handlePinPointerDown(event, "0")}
                onClick={(event) => event.preventDefault()}
                className={cn(
                  "flex h-[62px] touch-manipulation select-none items-center justify-center rounded-2xl backdrop-blur-md transition-all duration-150 active:scale-[0.94] disabled:opacity-50",
                  isLight
                    ? "bg-white/60 text-slate-900 hover:bg-white/80"
                    : "bg-white/[0.10] text-white hover:bg-white/[0.16]",
                )}
              >
                <span className="block translate-y-[1px] text-[1.9rem] font-black leading-none">
                  0
                </span>
              </button>
              <button
                type="button"
                disabled={pinUnlocking || pinInput.length === 0}
                onPointerDown={handlePinDeletePointerDown}
                onClick={(event) => event.preventDefault()}
                className={cn(
                  "flex h-[62px] select-none items-center justify-center rounded-2xl border transition-all active:scale-[0.94] disabled:opacity-35",
                  isLight
                    ? "border-[var(--border)] bg-[var(--card)] text-slate-700 hover:bg-[var(--surface-tint)]"
                    : "border-[var(--border)] bg-[var(--card)] text-white/70 hover:bg-[var(--surface-tint)]",
                )}
                aria-label={lang === "BM" ? "Padam digit" : "Delete digit"}
              >
                {pinUnlocking ? (
                  <Loader2 size={22} className="animate-spin" />
                ) : (
                  <Delete size={22} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <BadgeOverviewModal
        open={showBadgeModal}
        onClose={() => setShowBadgeModal(false)}
        sessionId={sessionId}
        lang={lang}
      />
      { (
        <Sidebar collapsible="icon" className="portal-desktop-sidebar z-50">
          <SidebarHeader className="shrink-0 gap-0 px-0 pb-3 pt-1.5">
            <Link
              href={`/${sessionId}`}
              className="group/brand flex w-full items-center justify-start rounded-2xl pl-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
            >
              <img
                src={isLight ? "/logoweb.png" : "/logowebdark.png"}
                alt="MyPeribadi"
                className="h-9 w-full max-w-[180px] object-contain"
              />
            </Link>
          </SidebarHeader>

          <SidebarContent className="personal-sidebar-scroll gap-0.5 px-3 pb-4 pt-0" aria-label={lang === "BM" ? "Navigasi Personal" : "Personal navigation"}>
            {currentDesktopNavigationSections.map((section, sectionIndex) => (
              <SidebarGroup key={section.label} className={sectionIndex === 0 ? "pt-0" : undefined}>
                <SidebarGroupLabel className={sectionIndex === 0 ? "h-6" : undefined}>{section.label}</SidebarGroupLabel>
                <SidebarMenu>
                  {section.items.map((item) => {
                    const personalRoot = `/${sessionId}`;
                    const isConnectorNav = item.href === `/${sessionId}/connector`;
                    const isActive = item.href === personalRoot
                      ? pathname === item.href
                      : isConnectorNav
                        ? pathname === item.href
                          || pathname === `/${sessionId}/whatsapp`
                          || pathname.startsWith(`/${sessionId}/whatsapp/`)
                          || pathname === `/${sessionId}/telegram`
                          || pathname.startsWith(`/${sessionId}/telegram/`)
                        : pathname === item.href || pathname.startsWith(`${item.href}/`);

                    return (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.name}
                        >
                          <Link href={item.href}>
                            <item.icon />
                            <span className="truncate">{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="relative shrink-0 border-t border-[var(--border)] p-2.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLeftAccountSwitcher((prev) => !prev)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left shadow-sm transition active:scale-[0.99]",
                  showLeftAccountSwitcher
                    ? "border-[var(--border-strong)] bg-[var(--surface-tint)]"
                    : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-tint)]",
                )}
              >
                <UserAvatar name={displayName} size={30} src={user?.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.75rem] font-bold leading-tight text-[var(--text)]">{displayName}</p>
                  <p className="mt-0.5 truncate text-[0.56rem] font-medium text-[var(--muted)]">
                    {activeEmail || (lang === "BM" ? "Akaun aktif" : "Active account")}
                  </p>
                </div>
                <ChevronDown
                  size={14}
                  className={cn(
                    "shrink-0 text-[var(--muted)] transition-transform duration-200",
                    showLeftAccountSwitcher && "rotate-180",
                  )}
                />
              </button>

              
                {showLeftAccountSwitcher && (
                  <div
                    className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-[120] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_16px_48px_rgba(0,0,0,0.18)]"
                  >
                    <div className="border-b border-[var(--border)] px-3.5 py-3">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={displayName} size={36} src={user?.avatar_url} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-[var(--text)]">{displayName}</p>
                          <p className="mt-0.5 truncate text-[0.62rem] font-medium text-[var(--muted)]">
                            {activeEmail || "—"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Account list */}
                    {storedAccounts.length > 1 && (
                      <div className="max-h-48 space-y-0.5 overflow-y-auto p-1.5">
                        <p className="px-2 py-1 text-[0.55rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                          {lang === "BM" ? "Tukar akaun" : "Switch account"}
                        </p>
                        {storedAccounts.map((acct) => {
                          const isActive = acct.email === activeEmail;
                          return (
                            <button
                              key={acct.email}
                              type="button"
                              onClick={() => {
                                if (isActive) {
                                  setShowLeftAccountSwitcher(false);
                                  return;
                                }
                                switchToAccount(acct.email);
                                setShowLeftAccountSwitcher(false);
                                window.location.reload();
                              }}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition",
                                isActive
                                  ? "bg-[var(--surface-tint-strong)]"
                                  : "hover:bg-[var(--surface-tint)]",
                              )}
                            >
                              <UserAvatar
                                name={acct.name || acct.email}
                                size={30}
                                active={isActive}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold leading-tight text-[var(--text)]">
                                  {acct.name || acct.email.split("@")[0]}
                                </p>
                                <p className="mt-0.5 truncate text-[0.58rem] font-medium text-[var(--muted)]">
                                  {acct.email}
                                </p>
                              </div>
                              {isActive ? (
                                <Check size={14} strokeWidth={2.5} className="shrink-0 text-[var(--text)]" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="space-y-0.5 border-t border-[var(--border)] p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setShowLeftAccountSwitcher(false);
                          setShowAddAccountModal(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--surface-tint)]"
                      >
                        <UserPlus size={14} className="shrink-0 text-[var(--muted)]" />
                        <span className="text-xs font-semibold text-[var(--text)]">
                          {lang === "BM" ? "Tambah akaun" : "Add account"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowLeftAccountSwitcher(false);
                          void handleLogout();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--expense-bg)]"
                      >
                        <LogOut size={14} className="shrink-0 text-[var(--muted)]" />
                        <span className="text-xs font-semibold text-[var(--expense)]">
                          {lang === "BM" ? "Log keluar" : "Logout"}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              
            </div>
          </SidebarFooter>

        </Sidebar>
      )}
      {/* ── Main Content ── */}
      <div
        className={cn(
          "portal-desktop-main flex-1 flex min-w-0 flex-col min-h-[100dvh] lg:h-full lg:min-h-0",
        )}
      >
        {/* Global Status Bar Background for iOS immersive mode */}
        <div className="fixed top-0 left-0 right-0 h-[env(safe-area-inset-top,0px)] z-[110] bg-[var(--bg)] pointer-events-none" />
        {/* Verify email banner — notice-banner style, follows theme & announcement format */}
        {emailVerifiedKnown && !emailVerified && !isAuthPage && !pinLockRequired && (() => {
          const remaining = Math.max(0, Math.ceil((verifyCooldownUntil - Date.now()) / 1000))
          const inCooldown = remaining > 0
          const hasDeadline = verifyDeadlineAt > 0
          const msLeft = Math.max(0, verifyDeadlineAt - Date.now())
          const ds = Math.floor(msLeft / 86400000)
          const hs = Math.floor((msLeft % 86400000) / 3600000)
          const mins = Math.floor((msLeft % 3600000) / 60000)
          const secs = Math.floor((msLeft % 60000) / 1000)
          const timerLabel = `${ds}d ${String(hs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
          return (
            <section className="mb-4 ml-3 mr-3 mt-3 rounded-2xl border border-sky-500/25 bg-sky-500/12 px-4 py-3 text-sm text-sky-700 shadow-[var(--shadow-soft)] dark:text-sky-200">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-black leading-tight">{t.verifyEmailTitle}</p>
                  <p className="mt-0.5 text-xs font-semibold leading-5 opacity-90">{t.verifyEmail}</p>
                  {hasDeadline ? (
                    <p className="mt-1 text-xs font-bold">
                      {t.verifyEmailDisableWarning}{" "}
                      <span className="rounded-md bg-sky-600/15 px-1.5 py-0.5 font-mono tabular-nums">{timerLabel}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs font-semibold opacity-90">{t.verifyEmailDisableWarningLegacy}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={inCooldown || resendingVerify}
                  onClick={handleResendVerify}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-sky-600 hover:bg-sky-700"
                >
                  {resendingVerify ? t.verifySending : inCooldown ? `${remaining}s` : t.verifyEmailAction}
                </button>
              </div>
            </section>
          )
        })()}
        {/* Page Content */}
        <main
          key={refreshKey}
          ref={mainRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className={cn(
            // overflow-x-clip avoids creating a sticky-blocking scrollport (unlike overflow-x-hidden)
            "relative w-full flex-1 overflow-visible overscroll-none lg:overflow-y-auto lg:overflow-x-clip",
            pinLockRequired &&
              !suppressPinLockUi &&
              "pointer-events-none select-none",
            isChatFullscreen || isMapFullscreen
              ? "p-0 pb-0"
              : cn(
                  // Personal desktop: no side/top pad so sticky top bars can go edge-to-edge
                  "w-full p-3 pt-[calc(env(safe-area-inset-top,0px)+0.35rem)] pb-[calc(88px+env(safe-area-inset-bottom,0px))] md:px-0 md:pt-0 md:pb-6",
                  isTransactionDetailPage &&
                    "mx-auto max-w-5xl md:mx-0 md:max-w-none",
                ),
          )}
        >
          {/* Pull to refresh indicator */}
          {!isChatFullscreen && !isMapFullscreen && (
            <div
              style={{ y: pullDistance - 40, opacity: pullDistance / 60 }}
              className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-50 pt-[calc(env(safe-area-inset-top,0px)+1rem)] md:pt-6"
            >
              <div
                className={cn(
                  "p-2 rounded-full shadow-xl border",
                  isLight
                    ? "bg-white border-slate-300 text-slate-900"
                    : "bg-[#0f0f0f] border-white/10 text-white",
                )}
              >
                <Loader2
                  size={20}
                  className={cn(
                    isLight ? "text-slate-900" : "text-[var(--text)]",
                    isRefreshing ? "animate-spin" : "",
                  )}
                  style={{
                    transform: !isRefreshing
                      ? `rotate(${pullDistance * 2}deg)`
                      : undefined,
                  }}
                />
              </div>
            </div>
          )}

          {showMobileHeader && (
            <section className="lg:hidden mb-4">
              <div className={cn(
                "relative overflow-hidden rounded-2xl border px-4 py-3.5 backdrop-blur-2xl",
                isLight
                  ? "border-white/80 bg-white/82 text-slate-950"
                  : "border-white/10 bg-white/[0.075] text-white",
              )}>
                <div className="pointer-events-none absolute -right-10 -top-16 h-32 w-32 rounded-full bg-indigo-500/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 left-6 h-36 w-36 rounded-full bg-sky-400/15 blur-3xl" />
                <div className="relative flex items-center gap-3">
                  {mobileHeaderMeta.backHref ? (
                    <HistoryBackButton
                      fallbackHref={mobileHeaderMeta.backHref}
                      aria-label={t.previous}
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur-xl",
                        isLight
                          ? "border-slate-200/80 bg-slate-100/80 text-slate-900"
                          : "border-white/10 bg-white/10 text-white",
                      )}
                    >
                      <ArrowLeft size={18} />
                    </HistoryBackButton>
                  ) : (
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm",
                      isLight
                        ? "bg-slate-950 text-white"
                        : "bg-white text-slate-950",
                    )}>
                      <MobileHeaderIcon size={18} />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "truncate text-[0.62rem] font-black uppercase tracking-[0.2em]",
                      isLight ? "text-slate-500" : "text-white/55",
                    )}>
                      {mobileHeaderMeta.eyebrow}
                    </p>
                    <h1 className={cn(
                      "mt-1 truncate text-[1.08rem] font-black tracking-tight",
                      isLight ? "text-slate-950" : "text-white",
                    )}>
                      {mobileHeaderMeta.title}
                    </h1>
                    <p className={cn(
                      "mt-1 line-clamp-1 text-[0.76rem] font-medium leading-snug",
                      isLight ? "text-slate-500" : "text-white/58",
                    )}>
                      {mobileHeaderMeta.subtitle}
                    </p>
                  </div>

                </div>

              </div>
            </section>
          )}

          {isChatFullscreen || isMapFullscreen ? (
            children
          ) : (
            <div className="portal-page-frame">
              {noticeBannerNode}
              {children}
            </div>
          )}


        </main>

          {/* Chat Overlay (Desktop Only) */}
          {showChatOverlay && isDesktop && (
            <>
 <div className="fixed inset-0 z-[60] bg-transparent lg:left-[260px]" onClick={() => setShowChatOverlay(false)} />
              <div className="fixed bottom-0 right-0 top-0 z-[61] w-full border-l border-[var(--border)] bg-[var(--page-bg)] shadow-2xl lg:left-auto lg:right-0 lg:w-[420px]">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                  <h3 className="text-sm font-black tracking-tight text-[var(--text)]">Chat</h3>
                  <button type="button" onClick={() => setShowChatOverlay(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface-tint)] hover:text-[var(--text)]"><X size={16} /></button>
                </div>
                <div className="h-[calc(100%-49px)] overflow-hidden [&>div:first-child]:!h-full"><ChatPageContent /></div>
              </div>
            </>
          )}


        {!isChatFullscreen && !isTransactionDetailPage &&  (
          <nav
            className={cn(
              "lg:hidden fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 will-change-transform",
              hideMobileBottomNav
                ? "translate-y-full pointer-events-none"
                : "translate-y-0",
            )}
          >
            <div className="bg-[var(--bottom-nav-surface)] pb-[env(safe-area-inset-bottom,0px)]">
              {(() => {
                const chatItem = mobileNavFlat.find((item) => item.nameKey === "chat");
                const leftNavItems = mobileNavFlat.filter((item) =>
                  item.nameKey === "home" ||
                  item.nameKey === "transactions",
                );
                const rightNavItems = mobileNavFlat.filter((item) => item.nameKey === "wallet");
                const isChatActive = Boolean(
                  chatItem &&
                    (pathname === chatItem.href ||
                      (chatItem.href !== `/${sessionId}` &&
                        chatItem.href !== "/" &&
                        pathname.startsWith(chatItem.href))),
                );
                const renderSideLink = (item: (typeof mobileNavFlat)[number]) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== `/${sessionId}` &&
                      item.href !== "/" &&
                      pathname.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.nameKey}
                      href={item.href}
                      aria-label={item.label}
                      scroll={true}
                      prefetch
                      onClick={(event) => handleBottomNavLinkClick(event, item.href)}
                      className={cn(
                        "group relative flex h-14 w-full items-center justify-center select-none touch-none transition-all duration-250 active:scale-95",
                        isActive
                          ? "text-[var(--bottom-nav-active-detail)]"
                          : "text-[var(--bottom-nav-muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--bottom-nav-text)]",
                      )}
                    >
                      <span className="relative inline-flex flex-col items-center gap-1">
                        <Icon
                          active={isActive}
                          size={
                            item.nameKey === "wallet" || item.nameKey === "receipts" ? 30 : 28
                          }
                        />
                      </span>
                    </Link>
                  );
                };
                return (
              <div
                className={cn(
                  "relative mx-auto grid h-16 max-w-screen-md grid-cols-5 items-center px-2",
                )}
              >
                {/* Left cluster */}
                <div className="contents">
                  {leftNavItems.map(renderSideLink)}
                </div>

                {/* Center spacer keeps layout balanced; chat sits on true center */}
                <div className="col-start-3 h-14" aria-hidden="true" />

                {chatItem ? (
                  <Link
                    href={chatItem.href}
                    aria-label={chatItem.label}
                    scroll={true}
                    prefetch
                    onClick={(event) => {
                      if (chatSuppressClick.current) {
                        chatSuppressClick.current = false;
                        event.preventDefault();
                        return;
                      }
                      handleBottomNavLinkClick(event, chatItem.href);
                    }}
                    onPointerDown={(event) => {
                      if (event.pointerType === "mouse" && event.button !== 0) return;
                      armChatVoiceHold();
                    }}
                    onPointerUp={() => finishChatHold(false)}
                    onPointerCancel={() => finishChatHold(true)}
                    onPointerLeave={() => {
                      if (chatHoldFired.current) {
                        // Finger/mouse slid off while recording → cancel (no
                        // pointerup will reach this button for mouse users).
                        finishChatHold(true);
                      } else {
                        releaseChatHold();
                      }
                    }}
                    className={cn(
                      "absolute left-1/2 top-1/2 z-10 flex h-14 w-[54px] -translate-x-1/2 -translate-y-1/2 items-center justify-center select-none touch-none text-[var(--bottom-nav-text)] transition-all duration-250 active:scale-95",
                      isChatActive
                        ? "text-[var(--bottom-nav-active-detail)]"
                        : "text-[var(--bottom-nav-text)]",
                    )}
                  >
                    <ChatNavIcon active={isChatActive} size={54} />
                  </Link>
                ) : null}

                {/* Right cluster */}
                <div className="contents">
                  {rightNavItems.map(renderSideLink)}
                  <button
                    type="button"
                    aria-label={t.openMenu}
                    onClick={() => setShowMobileMenu(true)}
                    className={cn(
                      "group relative flex h-14 w-full items-center justify-center transition-all duration-200 active:scale-95",
                      showMobileMenu
                        ? "text-[var(--bottom-nav-active-detail)]"
                        : "text-[var(--bottom-nav-muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--bottom-nav-text)]",
                    )}
                  >
                    <span className="relative inline-flex flex-col items-center">
                      <NavMoreIcon active={showMobileMenu} size={28} />
                    </span>
                  </button>
                </div>
              </div>
                );
              })()}
            </div>
          </nav>
        )}
      </div>

      {/* ── Desktop Right Sidebar ── */}
      { (
        <aside className="portal-desktop-right-rail hidden h-[100dvh] w-[300px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--page-bg)] lg:flex">
          {/* Balance only at top */}
          <div className="shrink-0 border-b border-[var(--border)] px-3 pb-3 pt-3">
            <div
              className="balance-hero relative overflow-hidden rounded-[var(--card-radius-xl)] p-4 text-white shadow-[var(--shadow-card)]"
              style={{ background: "var(--brand-gradient)" }}
            >
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div
                  className="absolute -right-16 -top-20 h-52 w-52 rounded-full"
                  style={{ background: "linear-gradient(135deg, rgba(1,211,225,0.35), rgba(9,99,255,0.15))", filter: "blur(2px)" }}
                />
                <div
                  className="absolute -left-16 top-8 h-44 w-44 rounded-full"
                  style={{ background: "linear-gradient(225deg, rgba(9,99,255,0.28), transparent 70%)" }}
                />
                <div
                  className="absolute -bottom-20 right-0 h-40 w-56 rotate-[-15deg] rounded-[50%]"
                  style={{ background: "linear-gradient(45deg, rgba(1,211,225,0.22), rgba(0,26,83,0.12))" }}
                />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
                <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.08] to-transparent" />
              </div>
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] ring-1 ring-white/15 backdrop-blur-sm"
                        style={{ background: "rgba(255,255,255,0.12)" }}
                      >
                        <Wallet size={12} strokeWidth={2.5} className="text-white" />
                      </div>
                      <p className="balance-hero-label truncate text-[0.62rem] font-semibold tracking-wide text-[#c5d0e0]">
                        {lang === "EN" ? "Total Balance" : "Jumlah Baki"}
                      </p>
                    </div>
                    <p className="mt-3 truncate text-[1.7rem] font-bold leading-none tracking-tight text-white tabular-nums">
                      {user?.show_hero_amounts !== false ? (
                        <>
                          <span className="balance-hero-label mr-1 text-[0.42em] font-medium align-top text-[#c5d0e0]">RM</span>
                          {stats.balance.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                        </>
                      ) : "RM ••••••"}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[0.62rem] font-bold text-white ring-1 ring-white/15"
                    style={{ background: "rgba(255,255,255,0.12)" }}
                  >
                    {lang === "EN" ? "Live" : "Kini"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Cat playground + calculator */}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-0 pt-2">
            <CatPlayground
              lang={lang === "BM" ? "BM" : "EN"}
              userKey={sessionId}
              compact
              stackFeed
              presentation="chip"
            />
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/70">
              <Calculator embedded />
            </div>
          </div>

          {/* Footer tools */}
          <div className="shrink-0 border-t border-[var(--border)] px-3 pb-3 pt-2.5">
            <div className="flex items-center gap-1.5">
              <Link
                href={`/${sessionId}/settings`}
                title={lang === "BM" ? "Tetapan" : "Settings"}
                className={cn(
                  "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[0.62rem] font-bold transition active:scale-[0.98]",
                  ["settings", "security", "bot-command", "about", "whatsnew", "login-logs"].some(
                    (segment) => pathname === `/${sessionId}/${segment}`,
                  )
                    ? "border-[color-mix(in_srgb,var(--accent2)_28%,var(--border))] bg-[var(--accent-bg)] text-[var(--accent2)]"
                    : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)]",
                )}
              >
                <Settings size={13} strokeWidth={2.2} />
                <span>{lang === "BM" ? "Tetapan" : "Settings"}</span>
              </Link>
              <button
                type="button"
                onClick={() => setShowChatOverlay(true)}
                title="Chat"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] transition hover:opacity-95 active:scale-[0.98]"
              >
                <ChatNavIcon active size={15} />
              </button>
              <ThemeToggle compact inverted={!isLight} className="!h-9 !w-9 !rounded-xl !border !border-[var(--border)] !bg-[var(--surface-tint)]" />
              <button
                type="button"
                onClick={() => setLang(lang === "EN" ? "BM" : "EN")}
                title={lang}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] text-[0.62rem] font-black text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)]"
              >
                {lang}
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ── Mobile Menu Sheet ── */}
      
        {showMobileMenu && !isChatFullscreen && (
          <div
            className="fixed inset-0 z-[500] flex items-stretch bg-black/60 backdrop-blur-xs lg:hidden animate-in fade-in-0 duration-200"
            onClick={requestMobileMenuClose}
          >
            <aside
              className={cn(
                "app-sheet-panel relative flex h-[100dvh] max-h-none w-full flex-col overflow-y-auto overflow-x-hidden rounded-none overscroll-contain pb-[calc(3rem+env(safe-area-inset-bottom,0px))]",
                mobileSheetClass
              )}
              onClick={(event) => event.stopPropagation()}
            >
              {/* ── Top Drag Indicator Bar & Close Button ── */}
              <div className="relative flex items-center justify-between px-5 pt-3 pb-1">
                <div className="w-9" />
                <div className="h-1.5 w-12 rounded-full bg-[var(--border-strong)] opacity-60" />
                <button
                  type="button"
                  onClick={requestMobileMenuClose}
                  className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] shadow-2xs transition-all hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)] active:scale-95"
                  aria-label="Tutup menu"
                >
                  <X size={16} />
                </button>
              </div>

              {/* ── Centered Profile Hero (Like Settings) ── */}
              <div className="relative flex flex-col items-center text-center px-4 pt-1 pb-3">
                <div className="relative">
                  <UserAvatar name={displayName || activeEmail} size={76} src={user?.avatar_url} />
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-[var(--card)] shadow-xs">
                    <Check size={11} strokeWidth={3} />
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-center gap-1.5">
                  <h3 className="text-base font-black tracking-tight text-[var(--text)] truncate max-w-[240px]">
                    {displayName}
                  </h3>
                  <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface-tint-strong)] px-1.5 py-0.5 text-[8px] font-black uppercase text-[var(--text)]">
                    PRO
                  </span>
                </div>

                {/* Account Switcher Pill */}
                <div className="relative mt-1">
                  <button
                    type="button"
                    onClick={() => setShowMobileSheetAccountSwitcher((open) => !open)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-1 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] transition active:scale-95"
                  >
                    <span className="truncate max-w-[200px]">{activeEmail || (lang === "BM" ? "Akaun aktif" : "Active account")}</span>
                    <ChevronDown
                      size={12}
                      className={cn(
                        "transition-transform duration-200 shrink-0",
                        showMobileSheetAccountSwitcher && "rotate-180"
                      )}
                    />
                  </button>

                  {showMobileSheetAccountSwitcher && (
                    <div
                      className={cn(
                        "absolute left-1/2 -translate-x-1/2 top-[38px] z-40 w-[280px] overflow-hidden rounded-3xl border p-2 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95",
                        "border-[var(--border)] bg-[var(--sheet-bg)]"
                      )}
                    >
                      {storedAccounts.map((acct: AccountProfile) => {
                        const isActiveAccount = acct.email === activeEmail;
                        return (
                          <button
                            key={acct.email}
                            type="button"
                            onClick={() => {
                              if (isActiveAccount) {
                                setShowMobileSheetAccountSwitcher(false);
                                return;
                              }
                              switchToAccount(acct.email);
                              setShowMobileSheetAccountSwitcher(false);
                              setShowMobileMenu(false);
                              window.location.reload();
                            }}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold transition-all",
                              isActiveAccount
                                ? "bg-[var(--surface-tint-strong)] text-[var(--text)]"
                                : "text-[var(--text)] hover:bg-[var(--surface-tint)]"
                            )}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--text)] text-[10px] font-black uppercase text-[var(--bg)] shadow-xs">
                              {(acct.name || acct.email)[0]}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{acct.name || acct.email.split("@")[0]}</span>
                            {isActiveAccount ? <Check size={14} className="shrink-0 font-bold text-[var(--text)]" /> : null}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => { setShowMobileSheetAccountSwitcher(false); setShowMobileMenu(false); setShowAddAccountModal(true); }}
                        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/50 px-2.5 py-2 text-xs font-black text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                      >
                        <UserPlus size={13} />
                        {lang === "BM" ? "Tambah akaun" : "Add account"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowMobileSheetAccountSwitcher(false); setShowMobileMenu(false); void handleLogout(); }}
                        className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-2 text-xs font-black text-[var(--text)] transition-all hover:bg-[var(--surface-tint-strong)] active:scale-95"
                      >
                        <LogOut size={13} strokeWidth={2.5} />
                        {lang === "BM" ? "Log keluar" : "Logout"}
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Quick Controls Toolbar: Lang, Theme, WhatsNew, Settings ── */}
                <div className="mt-3.5 grid w-full max-w-[340px] grid-cols-4 gap-2">
                  {/* Language */}
                  <button
                    type="button"
                    onClick={() => setLang(lang === "EN" ? "BM" : "EN")}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-2 text-center text-[var(--text)] shadow-2xs transition-all hover:bg-[var(--surface-tint-strong)] active:scale-95"
                  >
                    <Globe size={16} className="text-[var(--text)]" />
                    <span className="text-[10px] font-black uppercase">{lang}</span>
                  </button>

                  {/* Theme Mode */}
                  <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-1.5 text-center text-[var(--text)] shadow-2xs">
                    <ThemeToggle
                      compact
                      inverted={!isLight}
                      className="h-5 w-5 bg-transparent border-0 shadow-none p-0"
                    />
                    <span className="text-[10px] font-bold text-[var(--muted)]">{lang === "BM" ? "Tema" : "Theme"}</span>
                  </div>

                  {/* What's New */}
                  <button
                    type="button"
                    onClick={() => requestMobileMenuCloseThen(() => router.push(`/${sessionId}/whatsnew`))}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-2 text-center text-[var(--text)] shadow-2xs transition-all hover:bg-[var(--surface-tint-strong)] active:scale-95"
                  >
                    <ScrollText size={16} className="text-[var(--text)]" />
                    <span className="text-[10px] font-bold truncate max-w-full px-1">WhatsNew</span>
                  </button>

                  {/* Settings */}
                  <button
                    type="button"
                    onClick={() => requestMobileMenuCloseThen(() => router.push(`/${sessionId}/settings`))}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-2 text-center text-[var(--text)] shadow-2xs transition-all hover:bg-[var(--surface-tint-strong)] active:scale-95"
                  >
                    <Settings size={16} className="text-[var(--text)]" />
                    <span className="text-[10px] font-bold">{lang === "BM" ? "Tetapan" : "Settings"}</span>
                  </button>
                </div>
              </div>

              {/* ── Main Sheet Content: Grouped Cards ── */}
              <div className="px-4 pb-12 space-y-3.5 pt-1">
                {/* ── SheetCard 1: Kewangan & Bajet (Finance & Accounts) ── */}
                <section className={cn("rounded-3xl border border-[var(--border)] p-4 shadow-sm", "bg-[var(--card)]")}>
                      <div className="mb-3.5 flex items-center justify-between px-0.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                            <Wallet size={12} strokeWidth={2.2} />
                          </div>
                          <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                            {lang === "BM" ? "Kewangan & Bajet" : "Finance & Budget"}
                          </span>
                        </div>
                        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                          10 {lang === "BM" ? "modul" : "modules"}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                        {[
                          { name: t.budget, href: `/${sessionId}/budget`, icon: Wallet, badge: "" },
                          { name: t.walletSettings, href: `/${sessionId}/wallet-settings`, icon: CreditCard, badge: "" },
                          { name: lang === "BM" ? "Rekonsiliasi" : "Reconcile", href: `/${sessionId}/bank-reconciliation`, icon: FileSpreadsheet, badge: "AI" },
                          { name: lang === "BM" ? "Cukai" : "Tax", href: `/${sessionId}/tax`, icon: Landmark, badge: "" },
                          { name: t.categories, href: `/${sessionId}/categories`, icon: Grid2X2, badge: "" },
                          { name: "Subscription", href: `/${sessionId}/subscription`, icon: CreditCard, badge: "" },
                          { name: "Loan", href: `/${sessionId}/loan`, icon: Landmark, badge: "" },
                          { name: "BNPL", href: `/${sessionId}/bnpl`, icon: CreditCard, badge: "" },
                          { name: "Split Bill", href: `/${sessionId}/split-bills`, icon: Users, badge: "" },
                          { name: t.debt, href: `/${sessionId}/debt`, icon: HandCoins, badge: "" },
                        ].map((item) => {
                          const isCurrent = pathname === item.href;
                          return (
                            <button
                              key={item.href}
                              type="button"
                              onClick={() => {
                                if (isCurrent) {
                                  requestMobileMenuClose();
                                  return;
                                }
                                requestMobileMenuCloseThen(() => {
                                  router.push(item.href);
                                });
                              }}
                              className="group relative flex min-w-0 flex-col items-center gap-1.5 text-center transition-all duration-200 active:scale-90"
                            >
                              <div
                                className={cn(
                                  "relative flex h-13 w-13 items-center justify-center rounded-[18px] border shadow-2xs transition-all duration-200 group-hover:scale-105",
                                  isCurrent
                                    ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)] shadow-sm ring-2 ring-[var(--text)]/20"
                                    : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)] group-hover:bg-[var(--surface-tint-strong)]"
                                )}
                              >
                                <item.icon
                                  size={22}
                                  strokeWidth={1.9}
                                  className="shrink-0 transition-transform group-hover:scale-110"
                                />
                                {item.badge && !isCurrent && (
                                  <span className="absolute -top-1 -right-1 flex h-4 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--text)] px-1 text-[8px] font-black text-[var(--bg)] shadow-xs">
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              <p
                                className={cn(
                                  "w-full line-clamp-2 px-0.5 text-[11px] font-bold leading-tight transition-colors",
                                  isCurrent ? "text-[var(--text)] font-black" : "text-[var(--text)]"
                                )}
                              >
                                {item.name}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {/* ── SheetCard 2: Alatan & Peribadi (Personal & Tools) ── */}
                    <section className={cn("rounded-3xl border border-[var(--border)] p-3.5 shadow-sm", "bg-[var(--card)]")}>
                      <div className="mb-3 flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                            <Sparkles size={12} strokeWidth={2.2} />
                          </div>
                          <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                            {lang === "BM" ? "Alatan & Peribadi" : "Personal & Tools"}
                          </span>
                        </div>
                        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                          8 {lang === "BM" ? "modul" : "modules"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => requestMobileMenuCloseThen(() => router.push(`/${sessionId}/receipts`))}
                          className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3 text-left text-[var(--text)] shadow-2xs transition-all hover:bg-[var(--surface-tint-strong)] active:scale-[0.97]"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)] transition-transform group-hover:scale-105">
                            <Images size={20} strokeWidth={2} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-bold leading-tight">Gallery</span>
                            <span className="block truncate text-[10px] text-[var(--muted)]">{lang === "BM" ? "Resit & media" : "Receipts"}</span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => { requestMobileMenuClose(); setShowCalculator(true); }}
                          className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3 text-left text-[var(--text)] shadow-2xs transition-all hover:bg-[var(--surface-tint-strong)] active:scale-[0.97]"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)] transition-transform group-hover:scale-105">
                            <CalculatorIcon size={20} strokeWidth={2} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-bold leading-tight">Calculator</span>
                            <span className="block truncate text-[10px] text-[var(--muted)]">{lang === "BM" ? "Kira pantas" : "Quick calc"}</span>
                          </div>
                        </button>

                        {[
                          { name: lang === "BM" ? "Kenderaan" : "My Vehicle", subtitle: lang === "BM" ? "Minyak & servis" : "Fuel & log", href: `/${sessionId}/vehicle`, icon: Car },
                          { name: lang === "BM" ? "Waranti" : "My Warranty", subtitle: lang === "BM" ? "Peranti & tamat" : "Expiry alert", href: `/${sessionId}/warranty`, icon: Shield },
                          { name: lang === "BM" ? "Barang Saya" : "Inventory", subtitle: lang === "BM" ? "Jejak barang" : "Item boxes", href: `/${sessionId}/inventory`, icon: Package },
                          { name: lang === "BM" ? "Cukai" : "Income Tax", subtitle: lang === "BM" ? "Cukai tahunan" : "Annual tax", href: `/${sessionId}/tax`, icon: Landmark },
                          { name: lang === "BM" ? "Acara Saya" : "My Events", subtitle: lang === "BM" ? "Bajet majlis" : "Event budget", href: `/${sessionId}/event`, icon: CalendarDays },
                          { name: lang === "BM" ? "Kesihatan" : "Health", subtitle: lang === "BM" ? "Monitor & ubat" : "Monitor & meds", href: `/${sessionId}/health`, icon: Heart },
                          { name: lang === "BM" ? "Lencana" : "Badges", subtitle: lang === "BM" ? "Status & level" : "Achievements", href: `/${sessionId}/badges`, icon: Award },
                        ].map((item) => (
                          <button
                            key={item.href}
                            type="button"
                            onClick={() => requestMobileMenuCloseThen(() => router.push(item.href))}
                            className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3 text-left text-[var(--text)] shadow-2xs transition-all hover:bg-[var(--surface-tint-strong)] active:scale-[0.97]"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)] transition-transform group-hover:scale-105">
                              <item.icon size={20} strokeWidth={2} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-bold leading-tight">{item.name}</span>
                              <span className="block truncate text-[10px] text-[var(--muted)]">{item.subtitle}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>

                    {/* ── SheetCard 3: Peta & Lokasi (Maps & Places) ── */}
                    <section className={cn("rounded-3xl border border-[var(--border)] p-3.5 shadow-sm", "bg-[var(--card)]")}>
                      <div className="mb-2.5 flex items-center gap-2 text-[var(--text)]">
                        <div className="flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                          <MapPinned size={12} strokeWidth={2.2} />
                        </div>
                        <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                          {lang === "BM" ? "Peta & Lokasi" : "Maps & Places"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { name: lang === "BM" ? "Peta" : "Map", href: `/${sessionId}/map`, icon: MapPinned },
                          { name: lang === "BM" ? "Tempat Saya" : "My Places", href: `/${sessionId}/places`, icon: MapPin },
                          { name: lang === "BM" ? "Analisis" : "Analysis", href: `/${sessionId}/map-analysis`, icon: BarChart3 },
                        ].map((item) => (
                          <button
                            key={item.href}
                            type="button"
                            onClick={() => requestMobileMenuCloseThen(() => router.push(item.href))}
                            className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-2.5 text-center text-[var(--text)] shadow-2xs transition-all hover:bg-[var(--surface-tint-strong)] active:scale-[0.96]"
                          >
                            <item.icon size={20} strokeWidth={1.9} />
                            <span className="truncate text-xs font-bold">{item.name}</span>
                          </button>
                        ))}
                      </div>
                    </section>

                    {/* ── SheetCard 4: Connector & Bot Hub ── */}
                    <button
                      type="button"
                      onClick={() => requestMobileMenuCloseThen(() => router.push(`/${sessionId}/connector`))}
                      className={cn(
                        "group flex w-full items-center justify-between rounded-3xl border border-[var(--border)] p-3.5 text-left shadow-sm transition-all hover:bg-[var(--surface-tint)] active:scale-[0.98]",
                        "bg-[var(--card)] text-[var(--text)]"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)] transition-transform group-hover:scale-105">
                          <Bot size={22} strokeWidth={2} />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="block text-xs font-black tracking-tight">Connector Hub</span>
                            <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-tint-strong)] px-2 py-0.5 text-[9px] font-black uppercase text-[var(--text)]">
                              Active
                            </span>
                          </div>
                          <span className="mt-0.5 block text-[11px] font-medium text-[var(--muted)]">WhatsApp & Telegram Bot sync</span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-[var(--muted)] transition-transform group-hover:translate-x-0.5" />
                    </button>

                    {/* ── SheetCard 5: Bantuan & Bot (Bot & Support) ── */}
                    <section className={cn("rounded-3xl border border-[var(--border)] p-3.5 shadow-sm", "bg-[var(--card)]")}>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { name: lang === "BM" ? "Command Bot" : "Bot Command", href: `/${sessionId}/bot-command`, icon: Bot },
                          { name: lang === "BM" ? "Request & Tiket" : "Request & Ticket", href: `/${sessionId}/request`, icon: Send },
                        ].map((item) => (
                          <button
                            key={item.href}
                            type="button"
                            onClick={() => requestMobileMenuCloseThen(() => router.push(item.href))}
                            className="group flex items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-2.5 text-left text-[var(--text)] shadow-2xs transition-all hover:bg-[var(--surface-tint-strong)] active:scale-[0.98]"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)] transition-transform group-hover:scale-105">
                              <item.icon size={16} strokeWidth={1.9} />
                            </span>
                            <span className="truncate text-xs font-bold leading-tight">{item.name}</span>
                          </button>
                        ))}
                      </div>
                    </section>
              </div>
            </aside>
          </div>
        )}
      

      
        {voiceOpen && (
          <div className="pointer-events-none fixed inset-0 z-[130] flex items-center justify-center bg-black/50">
            {voicePhase === "recording" && (
              <div className="flex flex-col items-center gap-6 px-8 text-center">
                <div className="relative flex h-28 w-28 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-[var(--brand-blue)] opacity-25" />
                  <span
                    className="absolute inset-3 animate-ping rounded-full bg-[var(--brand-blue)] opacity-30"
                    style={{ animationDelay: "0.25s" }}
                  />
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--brand-blue)] text-white shadow-2xl">
                    <Mic size={34} strokeWidth={2.2} />
                  </span>
                </div>
                <div className="text-3xl font-black tabular-nums tracking-tight text-white">
                  {`${String(Math.floor(voiceSeconds / 60)).padStart(2, "0")}:${String(voiceSeconds % 60).padStart(2, "0")}`}
                </div>
                <p className="text-sm font-bold text-white/90">
                  {lang === "BM"
                    ? "Lepas butang Chat untuk hantar"
                    : "Release the Chat button to send"}
                </p>
              </div>
            )}
            {voicePhase === "busy" && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-9 w-9 animate-spin text-white" />
                <p className="text-sm font-bold text-white">
                  {lang === "BM" ? "Mengesan transaksi…" : "Detecting transaction…"}
                </p>
              </div>
            )}
            {voicePhase === "error" && (
              <div className="mx-8 max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 py-4 text-center">
                <p className="text-sm font-bold text-[var(--text)]">{voiceError}</p>
              </div>
            )}
          </div>
        )}

        {voiceResult && (
          <div
            className="fixed inset-0 z-[135] flex bg-black/50 px-6 py-4 overflow-y-auto"
            onClick={() => setVoiceResult(null)}
          >
            <div
              className="m-auto w-full max-w-sm overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {voiceResult.ok ? (
                (() => {
                  const parsed = parseVoiceSavedReply(voiceResult.body, "");
                  const amountText = parsed.amount
                    ? `RM ${parsed.amount}`
                    : "";
                  return (
                    <div>
                      <div
                        className={`flex items-center gap-3 px-5 py-4 ${
                          voiceResult.income
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-rose-500/12 text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                            voiceResult.income
                              ? "bg-emerald-500 text-white"
                              : "bg-rose-500 text-white"
                          }`}
                        >
                          <Check size={18} strokeWidth={3} />
                        </span>
                        <p className="text-base font-black tracking-tight">
                          {voiceResult.title}
                        </p>
                      </div>
                      <div className="max-h-[45vh] overflow-y-auto px-5 py-4">
                        {amountText && (
                          <p
                            className={`text-3xl font-black tabular-nums tracking-tight ${
                              voiceResult.income
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {amountText}
                          </p>
                        )}
                        {parsed.note && (
                          <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                            {parsed.note}
                          </p>
                        )}
                        {(parsed.category || parsed.wallet) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {parsed.category && (
                              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-1 text-xs font-bold text-[var(--text)]">
                                {parsed.category}
                              </span>
                            )}
                            {parsed.wallet && (
                              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-1 text-xs font-bold text-[var(--text)]">
                                {parsed.wallet}
                              </span>
                            )}
                          </div>
                        )}
                        {parsed.ref && (
                          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                            {parsed.ref}
                          </p>
                        )}
                        {(!parsed.note || !parsed.category) && (parsed.note || amountText) && (
                          <p className="mt-3 whitespace-pre-line rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-[11px] font-medium leading-relaxed text-[var(--muted)]">
                            {voiceResult.body}
                          </p>
                        )}
                        {!parsed.note && !amountText && (
                          <p className="whitespace-pre-line text-sm font-semibold leading-relaxed text-[var(--text)]">
                            {voiceResult.body}
                          </p>
                        )}
                      </div>
                      <div className="px-5 pb-5">
                        <button
                          type="button"
                          onClick={() => setVoiceResult(null)}
                          className="w-full rounded-2xl bg-[var(--brand-blue)] py-3 text-sm font-black text-white transition-transform active:scale-[0.98]"
                        >
                          {lang === "BM" ? "Siap" : "Done"}
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div>
                  <div className="flex items-center gap-3 bg-amber-500/12 px-5 py-4 text-amber-600 dark:text-amber-400">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
                      <Mic size={17} strokeWidth={2.4} />
                    </span>
                    <p className="text-base font-black tracking-tight">{voiceResult.title}</p>
                  </div>
                  <div className="max-h-[45vh] overflow-y-auto px-5 py-4">
                    <p className="text-sm font-semibold leading-relaxed text-[var(--text)]">
                      {voiceResult.body}
                    </p>
                    {!voiceResult.body && (
                      <p className="text-sm font-medium text-[var(--muted)]">
                        {lang === "BM"
                          ? "Tiada suara atau teks dikesan. Cuba lagi."
                          : "No speech or text detected. Try again."}
                      </p>
                    )}
                  </div>
                  <div className="px-5 pb-5">
                    <button
                      type="button"
                      onClick={() => setVoiceResult(null)}
                      className="w-full rounded-2xl bg-[var(--brand-blue)] py-3 text-sm font-black text-white transition-transform active:scale-[0.98]"
                    >
                      {lang === "BM" ? "Tutup" : "Close"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {showAddModal && (
          <div
            className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-transparent p-0 sm:items-center"
            onClick={requestAddModalClose}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              data-swipe-sheet
              {...shellAddSheetSwipe}
              className="app-sheet-panel app-sheet-panel--lg bg-[var(--sheet-bg)] border border-[var(--border)] w-full sm:max-w-[30rem] max-h-[92vh] overflow-y-auto overscroll-contain touch-pan-y shadow-2xl"
            >
              <AppSheetHeader
                title={t.addNewRecord}
                onClose={requestAddModalClose}
                action={
                  <button
                    type="submit"
                    form="shell-add-form"
                    disabled={saving}
                    className="px-1 py-1.5 text-xl font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                  >
                    {saving
                      ? (lang === "BM" ? "Menyimpan…" : "Saving…")
                      : (lang === "BM" ? "Simpan" : "Save")}
                  </button>
                }
              />

              {addSuccess && (
                <div className="mx-4 mb-4 flex items-center gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-400 sm:mx-6">
                  <Check size={16} /> {t.recordSaved}
                </div>
              )}

              {addError && (
                <div className="mx-4 mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-medium leading-snug text-rose-400 sm:mx-6">
                  {addError}
                </div>
              )}

              {(sharedAddPreviewUrl || sharedAddFile) && (
                <div className="mx-4 mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-2.5 sm:mx-6">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                        {lang === "BM"
                          ? "Screenshot Dikongsi"
                          : "Shared Screenshot"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {lang === "BM"
                          ? "Gambar ini akan disimpan sekali dengan transaksi."
                          : "This image will be saved together with the transaction."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearSharedAddAttachment}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {sharedAddPreviewUrl && (
                    <img
                      src={sharedAddPreviewUrl}
                      alt={
                        lang === "BM"
                          ? "Preview screenshot"
                          : "Screenshot preview"
                      }
                      className="h-40 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] object-contain"
                    />
                  )}
                </div>
              )}

              <form
                id="shell-add-form"
                onSubmit={handleAddRecord}
                className="space-y-3 px-4 pb-4 pt-1 sm:px-6 sm:pb-6 sm:pt-0"
              >
                {/* Type toggle */}
                <div className="grid grid-cols-2 gap-2">
                  {(["expense", "income"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setAddForm((f) => ({
                          ...f,
                          type,
                          category: getPreferredCategoryName(
                            categories,
                            type,
                            f.category,
                          ),
                        }))
                      }
                      className={cn(
                        "py-2.5 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider transition-all",
                        addForm.type === type
                          ? type === "expense"
                            ? "bg-[#f87171]/20 text-[#f87171] border border-[#f87171]/30"
                            : "bg-[#34d399]/20 text-[#34d399] border border-[#34d399]/30"
                          : "bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)] hover:border-[var(--border-strong)]",
                      )}
                    >
                      {type === "expense" ? t.expense : t.income}
                    </button>
                  ))}
                </div>

                {addForm.type === "expense" ? (
                  <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-[var(--muted)]">
                          {lang === "BM" ? "Item" : "Items"}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">
                          {activeAddItems.length}{" "}
                          {lang === "BM" ? "item" : "items"} · RM{" "}
                          {addItemsTotal.toFixed(2)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addAddItem}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--text)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--bg)] active:scale-95"
                      >
                        <Plus size={13} /> {lang === "BM" ? "Tambah" : "Add"}
                      </button>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_3.2rem_4.6rem_4.8rem_2rem] gap-1.5 px-1 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                      <span>{lang === "BM" ? "Nama" : "Item"}</span>
                      <span className="text-center">Qty</span>
                      <span className="text-right">RM</span>
                      <span className="text-right">Total</span>
                      <span />
                    </div>

                    <div className="space-y-1.5">
                      {addItems.map((item, index) => {
                        const quantity =
                          Number.parseFloat(item.quantity || "0") || 0;
                        const unitPrice =
                          Number.parseFloat(item.unit_price || "0") || 0;
                        const subtotal =
                          Math.max(0, quantity) * Math.max(0, unitPrice);
                        return (
                          <div
                            key={index}
                            className="grid grid-cols-[minmax(0,1fr)_3.2rem_4.6rem_4.8rem_2rem] items-center gap-1.5 border-b border-[var(--border)] pb-1.5 last:border-b-0"
                          >
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) =>
                                updateAddItem(index, "name", e.target.value)
                              }
                              placeholder={lang === "BM" ? "Nama item" : "Item"}
                              className="min-w-0 rounded-xl border border-transparent bg-[var(--surface-tint)] px-2.5 py-2 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)] focus:outline-none"
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) =>
                                updateAddItem(index, "quantity", e.target.value)
                              }
                              placeholder="1"
                              className="w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-2 py-2 text-center text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)] focus:outline-none"
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) =>
                                updateAddItem(
                                  index,
                                  "unit_price",
                                  e.target.value,
                                )
                              }
                              placeholder="0.00"
                              className="w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-2 py-2 text-right text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)] focus:outline-none"
                            />
                            <div className="truncate text-right text-xs font-black text-[var(--text)]">
                              {subtotal.toFixed(2)}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeAddItem(index)}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-rose-500 active:scale-95"
                              aria-label={
                                lang === "BM" ? "Buang item" : "Remove item"
                              }
                            >
                              <MinusCircle size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                        {t.description}
                      </label>
                      <input
                        type="text"
                        placeholder={t.descPlaceholder}
                        value={addForm.description}
                        onChange={(e) =>
                          setAddForm((f) => ({
                            ...f,
                            description: e.target.value,
                          }))
                        }
                        required={addForm.type === "income"}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:ring-1 focus:ring-[color:var(--text)]/20 sm:text-base"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                        {t.amount}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={addForm.amount}
                        onChange={(e) =>
                          setAddForm((f) => ({ ...f, amount: e.target.value }))
                        }
                        required={addForm.type === "income"}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:ring-1 focus:ring-[color:var(--text)]/20 sm:text-base"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                    {t.date}
                  </label>
                  <input
                    type="date"
                    value={addForm.date}
                    onChange={(e) =>
                      setAddForm((f) => ({ ...f, date: e.target.value }))
                    }
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-sm font-medium text-[var(--text)] focus:ring-1 focus:ring-[color:var(--text)]/20 sm:text-base"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                      {t.category}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCategoryDropdown((v) => !v);
                        setShowWalletDropdown(false);
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-left text-sm font-medium text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[color:var(--text)]/20 sm:text-base"
                    >
                      <span className="truncate">{selectedCategoryLabel}</span>
                      <ChevronDown
                        size={16}
                        className={cn(
                          "shrink-0 transition-transform",
                          showCategoryDropdown ? "rotate-180" : "rotate-0",
                        )}
                      />
                    </button>
                    {showCategoryDropdown && (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[180] max-h-56 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-2xl">
                        {categories
                          .filter((c) => c.kind === addForm.type)
                          .map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => {
                                setAddForm((f) => ({
                                  ...f,
                                  category: cat.name,
                                }));
                                setShowCategoryDropdown(false);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                                addForm.category === cat.name
                                  ? "bg-[var(--text)] text-[var(--bg)]"
                                  : "text-[var(--text)] hover:bg-[var(--surface-tint)]",
                              )}
                            >
                              <span className="truncate">{cat.name}</span>
                              {addForm.category === cat.name && (
                                <Check size={14} />
                              )}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                      {t.walletLabel}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowWalletDropdown((v) => !v);
                        setShowCategoryDropdown(false);
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-left text-sm font-medium text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[color:var(--text)]/20 sm:text-base"
                    >
                      <span className="truncate">{selectedWalletLabel}</span>
                      <ChevronDown
                        size={16}
                        className={cn(
                          "shrink-0 transition-transform",
                          showWalletDropdown ? "rotate-180" : "rotate-0",
                        )}
                      />
                    </button>
                    {showWalletDropdown && (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[180] max-h-56 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-2xl">
                        <button
                          type="button"
                          onClick={() => {
                            setAddForm((f) => ({ ...f, wallet_id: "" }));
                            setShowWalletDropdown(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                            !addForm.wallet_id
                              ? "bg-[var(--text)] text-[var(--bg)]"
                              : "text-[var(--text)] hover:bg-[var(--surface-tint)]",
                          )}
                        >
                          <span className="truncate">
                            {t.debtDefaultWallet}
                          </span>
                          {!addForm.wallet_id && <Check size={14} />}
                        </button>
                        {wallets.map((wallet) => {
                          const label = wallet.label || wallet.name;
                          const selected =
                            addForm.wallet_id === String(wallet.id);
                          return (
                            <button
                              key={wallet.id}
                              type="button"
                              onClick={() => {
                                setAddForm((f) => ({
                                  ...f,
                                  wallet_id: String(wallet.id),
                                }));
                                setShowWalletDropdown(false);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                                selected
                                  ? "bg-[var(--text)] text-[var(--bg)]"
                                  : "text-[var(--text)] hover:bg-[var(--surface-tint)]",
                              )}
                            >
                              <span className="truncate">{label}</span>
                              {selected && <Check size={14} />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      
    </div>
  );

  // Visitor without any session: skip shell render entirely (empty-dashboard flash),
  // the effect above will router.replace("/login").
  if (
    isMounted &&
    !isAuthPage &&
    !getAccessToken() &&
    !getRefreshToken()
  ) {
    return null;
  }

  return (
    <>
      <SidebarProvider className="contents">{shellContent}</SidebarProvider>
      {/* ── Mobile Calculator ── */}
      { !isDesktop && <Calculator show={showCalculator} onClose={() => setShowCalculator(false)} hideFab />}
      {/* ── Add Account Login Overlay ── */}
      
        {showAddAccountModal && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-transparent p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                resetAddAccountModal()
              }
            }}
          >
            <div
              className="w-full max-w-[380px] overflow-visible rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-black tracking-tight text-[var(--text)]">
                  {lang === "BM" ? "Tambah Akaun" : "Add Account"}
                </h2>
                <button
                  type="button"
                  onClick={resetAddAccountModal}
                  className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-tint)]"
                >
                  <X size={18} className="text-[var(--muted)]" />
                </button>
              </div>

              {addAccountError && (
                <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-[13px] font-bold text-rose-500">
                  {addAccountError}
                </div>
              )}

              {/* Primary: Google Firebase */}
              <button
                type="button"
                onClick={() => {
                  void handleAddAccountGoogleLogin()
                }}
                disabled={addAccountGoogleLoading || addAccountLoading}
                className="flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white py-3.5 text-[15px] font-bold text-gray-800 shadow-sm transition-all hover:bg-gray-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addAccountGoogleLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {lang === "BM" ? "Sedang log masuk..." : "Signing in..."}
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    {lang === "BM" ? "Log masuk dengan Google" : "Sign in with Google"}
                  </>
                )}
              </button>

              {!showAddAccountEmailForm ? (
                <button
                  type="button"
                  onClick={() => {
                    setAddAccountError("")
                    setShowAddAccountEmailForm(true)
                  }}
                  disabled={addAccountGoogleLoading}
                  className="mt-4 w-full text-center text-[0.8rem] font-semibold text-[var(--muted)] underline-offset-2 transition hover:text-[var(--text)] hover:underline disabled:opacity-50"
                >
                  {lang === "BM" ? "Guna email & kata laluan" : "Use email & password"}
                </button>
              ) : (
                <>
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[var(--border)]" />
                    <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                      {lang === "BM" ? "email" : "email"}
                    </span>
                    <div className="h-px flex-1 bg-[var(--border)]" />
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      setAddAccountError("")
                      if (!addAccountTurnstileToken) {
                        setAddAccountError(lang === "BM" ? "Sila lengkapkan pengesahan keselamatan." : "Please complete the security check.")
                        return
                      }
                      if (!addAccountEmail || !addAccountPassword) {
                        setAddAccountError(lang === "BM" ? "Sila isi email dan kata laluan." : "Please fill in email and password.")
                        return
                      }
                      setAddAccountLoading(true)
                      try {
                        const newSessionId = crypto.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16) })
                        const res = await fetch("/api/login", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: addAccountEmail, password: addAccountPassword, turnstile_token: addAccountTurnstileToken, session_id: newSessionId }),
                        })
                        if (res.ok) {
                          const data = await res.json()
                          if (data.access_token) {
                            const nameFromEmail = addAccountEmail.split("@")[0]
                            addAccount(addAccountEmail, nameFromEmail, data.access_token, data.refresh_token, newSessionId)
                            resetAddAccountModal()
                            window.location.reload()
                          }
                        } else {
                          const err = await res.json().catch(() => null)
                          setAddAccountError(typeof err?.detail === "string" ? err.detail : (lang === "BM" ? "Log masuk gagal." : "Login failed."))
                          setAddAccountTurnstileToken(null)
                          setAddAccountCaptchaKey((k) => k + 1)
                        }
                      } catch {
                        setAddAccountError(lang === "BM" ? "Ralat pelayan." : "Server error.")
                        setAddAccountTurnstileToken(null)
                        setAddAccountCaptchaKey((k) => k + 1)
                      } finally {
                        setAddAccountLoading(false)
                      }
                    }}
                    className="space-y-4"
                  >
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="Email"
                      value={addAccountEmail}
                      onChange={(e) => setAddAccountEmail(e.target.value)}
                      required
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-[15px] font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition-all focus:ring-2 focus:ring-indigo-500/40"
                    />

                    <input
                      type="password"
                      autoComplete="current-password"
                      placeholder={lang === "BM" ? "Kata laluan" : "Password"}
                      value={addAccountPassword}
                      onChange={(e) => setAddAccountPassword(e.target.value)}
                      required
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-[15px] font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition-all focus:ring-2 focus:ring-indigo-500/40"
                    />

                    <div className="flex w-full flex-col items-center gap-2 py-1">
                      {process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ? (
                        <Turnstile
                          key={`add-account-captcha-${addAccountCaptchaKey}`}
                          sitekey={process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY}
                          theme="auto"
                          onVerify={handleAddAccountTurnstileVerify}
                          onError={handleAddAccountTurnstileError}
                          className="flex min-h-[70px] w-full max-w-full items-center justify-center overflow-visible"
                        />
                      ) : (
                        <p className="text-center text-[0.75rem] font-semibold text-rose-500">
                          {lang === "BM" ? "Captcha tidak dikonfigurasi." : "Captcha is not configured."}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setAddAccountTurnstileToken(null)
                          setAddAccountCaptchaKey((k) => k + 1)
                        }}
                        className="text-[0.7rem] font-semibold text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
                      >
                        {lang === "BM" ? "Muat semula captcha" : "Reload captcha"}
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={addAccountLoading || addAccountGoogleLoading || !addAccountTurnstileToken}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-indigo-600 py-3.5 text-[15px] font-bold text-white transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {addAccountLoading ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        lang === "BM" ? "Log masuk email" : "Sign in with email"
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowAddAccountEmailForm(false)
                        setAddAccountError("")
                        setAddAccountEmail("")
                        setAddAccountPassword("")
                        setAddAccountTurnstileToken(null)
                        setAddAccountCaptchaKey((k) => k + 1)
                      }}
                      className="w-full text-center text-[0.75rem] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      {lang === "BM" ? "Sembunyi login email" : "Hide email login"}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      
    </>
  );
}
