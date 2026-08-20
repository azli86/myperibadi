"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { signInWithGoogle } from "../lib/firebase";
import {
  LayoutDashboard,
  Users,
  Home as HomeIcon,
  BarChart3,
  Activity,
  ArrowLeftRight,
  Radio,
  Server,
  ScrollText,
  Ticket,
  LogOut,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Clock,
  Shield,
  ShieldCheck,
  Mail,
  Lock,
  UserCheck,
  UserX,
  ExternalLink,
  Database,
  MessageSquare,
  Package,
  Calendar,
  Smartphone,
  RefreshCw,
  Menu,
  X,
  Eye,
  DollarSign,
  Layers,
  HardDrive,
  Paperclip,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

type View =
  | "dashboard"
  | "users"
  | "households"
  | "logs"
  | "analytics"
  | "system"
  | "activity"
  | "transactions"
  | "tickets";

type Stats = Record<
  | "users"
  | "active_users"
  | "households"
  | "transactions"
  | "transactions_30d"
  | "active_wallets"
  | "requests_24h"
  | "new_users_7d"
  | "active_sessions_24h"
  | "total_income"
  | "total_expense"
  | "total_net"
  | "total_amount",
  number
>;

type User = {
  id: string;
  name: string | null;
  email: string;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
  deactivated_reason: string | null;
  auth_provider: string | null;
  phone: string | null;
};

type Household = {
  id: number;
  name: string;
  status: string;
  created_at: string;
  owner_name: string | null;
  member_count: number;
};

type LoginLog = {
  id: number;
  email: string;
  status: string;
  ip_address: string;
  device_label: string;
  created_at: string;
  name: string | null;
};

type AuditLog = {
  id: number;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: string;
  created_at: string;
};

const parseUtc = (s: string | null | undefined) => {
  if (!s) return null;
  const raw = String(s);
  const d = new Date(raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z");
  return isNaN(d.getTime()) ? null : d;
};

const fmtDate = (s: string | null | undefined) => {
  const d = parseUtc(s);
  if (!d) return "—";
  return d
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kuala_Lumpur",
    })
    .replace(",", "")
    .trim();
};

const fmtDay = (s: string | null | undefined) => {
  const d = parseUtc(s);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  });
};

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  type UserFilter = "all" | "active_verified" | "active_unverified" | "inactive";
  const [userFilter, setUserFilter] = useState<UserFilter>("all");
  const [users, setUsers] = useState<User[]>([]);
  const [usersOffset, setUsersOffset] = useState(0);
  const [usersTotal, setUsersTotal] = useState(0);
  const [userQuery, setUserQuery] = useState("");
  const [detail, setDetail] = useState<any | null>(null);
  const [detailUser, setDetailUser] = useState<string | null>(null);

  const [households, setHouseholds] = useState<Household[]>([]);
  const [hhDetail, setHhDetail] = useState<any | null>(null);

  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeLogTab, setActiveLogTab] = useState<"login" | "audit">("login");

  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketsTotal, setTicketsTotal] = useState(0);
  const [ticketKindFilter, setTicketKindFilter] = useState("");
  const [ticketDetail, setTicketDetail] = useState<any | null>(null);

  const [busy, setBusy] = useState(false);
  const [ticketReply, setTicketReply] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [txnStats, setTxnStats] = useState<any[]>([]);
  const [userGrowth, setUserGrowth] = useState<any[]>([]);
  const [walletStats, setWalletStats] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sysStatus, setSysStatus] = useState<any | null>(null);
  const [txnMonths, setTxnMonths] = useState(6);

  const [activity, setActivity] = useState<any[]>([]);
  const [activityKind, setActivityKind] = useState("all");
  const [recentTxns, setRecentTxns] = useState<any[]>([]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch("/api/dashboard", {
        credentials: "include",
        cache: "no-store",
      });
      if (r.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!r.ok) throw new Error("Dashboard gagal dimuat");
      setStats(await r.json());
      setAuthenticated(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    if (!r.ok) {
      setError("E-mel atau kata laluan tidak sah");
      return;
    }
    await load();
  }

  async function loginGoogle() {
    setError("");
    setGoogleLoading(true);
    try {
      const idToken = await signInWithGoogle();
      const r = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        setError((d && d.detail) || "Akaun Google ini bukan pentadbir");
        return;
      }
      await load();
    } finally {
      setGoogleLoading(false);
    }
  }

  async function showUsers(
    q = userQuery,
    filter = userFilter,
    append = false
  ) {
    setView("users");
    setMobileNavOpen(false);
    const off = append ? usersOffset : 0;
    const r = await fetch(
      `/api/users?q=${encodeURIComponent(q)}&status=${encodeURIComponent(
        filter
      )}&limit=50&offset=${off}`,
      { credentials: "include" }
    );
    if (!r.ok) {
      setError("Senarai pengguna gagal dimuat");
      return;
    }
    const data = await r.json();
    const list = data.users ?? data;
    const total = data.total ?? list.length;
    setUsers(append ? [...users, ...list] : list);
    setUsersOffset(off + list.length);
    setUsersTotal(total);
  }

  async function openUser(id: string) {
    setDetailUser(id);
    const r = await fetch(`/api/users/${id}`, { credentials: "include" });
    if (!r.ok) {
      setError("Detail pengguna gagal dimuat");
      return;
    }
    setDetail(await r.json());
  }

  async function toggleActive(u: User) {
    if (
      !window.confirm(
        `Pasti ${u.is_active ? "nyahaktifkan" : "aktifkan semula"} akaun ${u.email}?`
      )
    )
      return;
    setBusy(true);
    setError("");
    const r = await fetch(
      `/api/users/${u.id}/${u.is_active ? "deactivate" : "reactivate"}`,
      { method: "POST", credentials: "include" }
    );
    if (!r.ok) {
      const d = await r.json().catch(() => null);
      setError((d && d.detail) || "Tindakan gagal");
    } else {
      await showUsers(userQuery, userFilter);
    }
    setBusy(false);
  }

  async function showHouseholds(q = "") {
    setView("households");
    setMobileNavOpen(false);
    setHhDetail(null);
    const r = await fetch(`/api/households?q=${encodeURIComponent(q)}`, {
      credentials: "include",
    });
    if (!r.ok) {
      setError("Senarai household gagal dimuat");
      return;
    }
    setHouseholds(await r.json());
  }

  async function openHousehold(id: number) {
    const r = await fetch(`/api/households/${id}`, { credentials: "include" });
    if (!r.ok) {
      setError("Detail household gagal dimuat");
      return;
    }
    setHhDetail(await r.json());
  }

  async function showLogs(kind: "login" | "audit") {
    setView("logs");
    setActiveLogTab(kind);
    setMobileNavOpen(false);
    const ep = kind === "login" ? "login-logs" : "audit-logs";
    const r = await fetch(`/api/${ep}`, { credentials: "include" });
    if (!r.ok) {
      setError("Log gagal dimuat");
      return;
    }
    if (kind === "login") setLoginLogs(await r.json());
    else setAuditLogs(await r.json());
  }

  async function showAnalytics(months = txnMonths) {
    setView("analytics");
    setMobileNavOpen(false);
    setError("");
    const [t, g, w] = await Promise.all([
      fetch(`/api/stats/transactions?months=${months}`, {
        credentials: "include",
      }),
      fetch(`/api/stats/users-growth`, { credentials: "include" }),
      fetch(`/api/stats/wallets`, { credentials: "include" }),
    ]);
    if (!t.ok || !g.ok || !w.ok) {
      setError("Statistik gagal dimuat");
      return;
    }
    setTxnStats(await t.json());
    setUserGrowth(await g.json());
    setWalletStats(await w.json());
  }

  async function showSystem() {
    setView("system");
    setMobileNavOpen(false);
    setError("");
    const [s, sess] = await Promise.all([
      fetch(`/api/system-status`, { credentials: "include" }),
      fetch(`/api/sessions`, { credentials: "include" }),
    ]);
    if (!s.ok || !sess.ok) {
      setError("Status sistem gagal dimuat");
      return;
    }
    setSysStatus(await s.json());
    setSessions(await sess.json());
  }

  async function showTickets(
    kind = ticketKindFilter,
    status = "",
    q = "",
    append = false
  ) {
    setView("tickets");
    setTicketKindFilter(kind);
    setMobileNavOpen(false);
    setError("");
    const r = await fetch(
      `/api/support/tickets?kind=${encodeURIComponent(
        kind
      )}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(
        q
      )}&offset=${append ? tickets.length : 0}&limit=50`,
      { credentials: "include" }
    );
    if (!r.ok) {
      setError("Tiket gagal dimuat");
      return;
    }
    const d = await r.json();
    if (append) setTickets((t) => [...t, ...d.tickets]);
    else setTickets(d.tickets);
    setTicketsTotal(d.total);
  }

  async function openTicket(id: number) {
    const r = await fetch(`/api/support/tickets/${id}`, {
      credentials: "include",
    });
    if (!r.ok) {
      setError("Detail tiket gagal dimuat");
      return;
    }
    setTicketDetail(await r.json());
  }

  async function setTicketStatus(id: number, status: string) {
    if (!window.confirm("Tukar status tiket ini?")) return;
    setError("");
    const r = await fetch(`/api/support/tickets/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => null);
      setError((d && d.detail) || "Tindakan gagal");
      return;
    }
    await openTicket(id);
    await showTickets(ticketKindFilter);
  }

  async function sendTicketReply(id: number) {
    const reply = ticketReply.trim();
    if (!reply) return;
    setError("");
    const r = await fetch(`/api/support/tickets/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reply }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => null);
      setError((d && d.detail) || "Balasan gagal dihantar");
      return;
    }
    setTicketReply("");
    await openTicket(id);
    await showTickets(ticketKindFilter);
  }

  async function showActivity(kind = "all") {
    setView("activity");
    setMobileNavOpen(false);
    setActivityKind(kind);
    setError("");
    const r = await fetch(`/api/activity?kind=${kind}`, {
      credentials: "include",
    });
    if (!r.ok) {
      setError("Aktiviti gagal dimuat");
      return;
    }
    setActivity(await r.json());
  }

  async function showTransactions() {
    setView("transactions");
    setMobileNavOpen(false);
    setError("");
    const r = await fetch(`/api/transactions/recent`, {
      credentials: "include",
    });
    if (!r.ok) {
      setError("Transaksi gagal dimuat");
      return;
    }
    setRecentTxns(await r.json());
  }

  const handleRefresh = async () => {
    if (view === "dashboard") await load();
    else if (view === "users") await showUsers(userQuery, userFilter);
    else if (view === "households") await showHouseholds();
    else if (view === "analytics") await showAnalytics();
    else if (view === "system") await showSystem();
    else if (view === "activity") await showActivity(activityKind);
    else if (view === "transactions") await showTransactions();
    else if (view === "logs") await showLogs(activeLogTab);
    else if (view === "tickets") await showTickets(ticketKindFilter);
  };

  // Unauthenticated State (Login Screen)
  if (authenticated === null) {
    return (
      <main className="login-screen">
        <div style={{ textAlign: "center", color: "var(--text-sub)" }}>
          <div className="login-icon-box">
            <RefreshCw className="animate-spin" size={24} />
          </div>
          <p style={{ fontWeight: 600 }}>Memuatkan Mastermind…</p>
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="login-screen">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon-box">
              <Shield size={28} />
            </div>
            <h1>Mastermind</h1>
            <p>Portal Pentadbiran &amp; Kawalan MyPeribadi</p>
          </div>

          <button
            type="button"
            className="primary google"
            style={{ width: "100%" }}
            onClick={() => void loginGoogle()}
            disabled={googleLoading}
          >
            <GoogleIcon />
            <span>
              {googleLoading ? "Memproses Google Auth…" : "Log masuk dengan Google"}
            </span>
          </button>

          <div className="divider">
            <span>atau guna e-mel admin</span>
          </div>

          <form onSubmit={login}>
            <div className="form-group">
              <label className="form-label">E-mel Pentadbir</label>
              <input
                className="field"
                name="email"
                type="email"
                placeholder="admin@myperibadi.my"
                required
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Kata Laluan</label>
              <input
                className="field"
                name="password"
                type="password"
                placeholder="••••••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              className="primary"
              style={{ width: "100%", marginTop: "12px" }}
            >
              Log Masuk ke Dashboard
            </button>
          </form>

          {error && (
            <div className="error-banner">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="login-footer">
            <ShieldCheck size={14} color="var(--emerald)" />
            <span>Akses Terhad &amp; Disulitkan</span>
          </div>
        </div>
      </main>
    );
  }

  // Dashboard Cards Data
  const metricCards = [
    {
      label: "Jumlah Pengguna",
      value: stats?.users,
      icon: <Users size={20} />,
      badge: "+100%",
      sub: "Akaun berdaftar",
    },
    {
      label: "Pengguna Aktif",
      value: stats?.active_users,
      icon: <UserCheck size={20} />,
      badge: "Status OK",
      sub: "Akaun sah",
    },
    {
      label: "Household",
      value: stats?.households,
      icon: <HomeIcon size={20} />,
      badge: "Keluarga",
      sub: "Kumpulan akaun",
    },
    {
      label: "Jumlah Transaksi",
      value: stats?.transactions,
      icon: <ArrowLeftRight size={20} />,
      badge: "Sepanjang masa",
      sub: "Entri kewangan",
    },
    {
      label: "Transaksi 30 Hari",
      value: stats?.transactions_30d,
      icon: <TrendingUp size={20} />,
      badge: "30 Hari",
      sub: "Kekerapan semasa",
    },
    {
      label: "Wallet Aktif",
      value: stats?.active_wallets,
      icon: <Wallet size={20} />,
      badge: "Dompet",
      sub: "Akaun simpanan/tunai",
    },
    {
      label: "Permintaan 24 Jam",
      value: stats?.requests_24h,
      icon: <Activity size={20} />,
      badge: "API Traffic",
      sub: "Panggilan server",
    },
    {
      label: "Pengguna Baru 7 Hari",
      value: stats?.new_users_7d,
      icon: <Sparkles size={20} />,
      badge: "Pertumbuhan",
      sub: "Pendaftaran baru",
    },
    {
      label: "Sesi Aktif 24 Jam",
      value: stats?.active_sessions_24h,
      icon: <Smartphone size={20} />,
      badge: "Sesi",
      sub: "Peranti aktif",
    },
  ];

  const totalInc = Number(stats?.total_income || 0);
  const totalExp = Number(stats?.total_expense || 0);
  const grandTotal = totalInc + totalExp;
  const incPercent = grandTotal > 0 ? (totalInc / grandTotal) * 100 : 50;
  const expPercent = grandTotal > 0 ? (totalExp / grandTotal) * 100 : 50;

  const viewTitles: Record<View, { title: string; desc: string }> = {
    dashboard: {
      title: "Ringkasan Eksekutif",
      desc: "Metrik utama prestasi dan volum kewangan MyPeribadi",
    },
    users: {
      title: "Pengurusan Pengguna",
      desc: "Senarai keseluruhan akaun pengguna dan kawalan status",
    },
    households: {
      title: "Pengurusan Household",
      desc: "Akaun perkongsian keluarga dan senarai keahlian",
    },
    analytics: {
      title: "Statistik & Trend",
      desc: "Analisis volum transaksi, pertumbuhan pengguna dan wallet",
    },
    activity: {
      title: "Log Aktiviti Terkini",
      desc: "Jejak peristiwa pengguna dan sistem secara terperinci",
    },
    transactions: {
      title: "Transaksi Terkini",
      desc: "Senarai aliran tunai transaksi masuk dan keluar",
    },
    system: {
      title: "Kesihatan & Sesi Sistem",
      desc: "Status infrastruktur database dan sambungan peranti aktif",
    },
    logs: {
      title: "Rekod Log & Keselamatan",
      desc: "Audit pentadbir serta sejarah cubaan log masuk",
    },
    tickets: {
      title: "Tiket Sokongan & Cadangan",
      desc: "Permintaan bantuan, laporan pepijat dan maklum balas",
    },
  };

  const navItems = [
    {
      id: "dashboard" as View,
      label: "Dashboard",
      icon: <LayoutDashboard className="nav-icon" />,
      onClick: () => {
        setView("dashboard");
        setMobileNavOpen(false);
      },
    },
    {
      id: "users" as View,
      label: "Pengguna",
      icon: <Users className="nav-icon" />,
      onClick: () => void showUsers(),
    },
    {
      id: "households" as View,
      label: "Household",
      icon: <HomeIcon className="nav-icon" />,
      onClick: () => void showHouseholds(),
    },
    {
      id: "analytics" as View,
      label: "Statistik",
      icon: <BarChart3 className="nav-icon" />,
      onClick: () => void showAnalytics(),
    },
    {
      id: "activity" as View,
      label: "Aktiviti",
      icon: <Activity className="nav-icon" />,
      onClick: () => void showActivity(),
    },
    {
      id: "transactions" as View,
      label: "Transaksi",
      icon: <ArrowLeftRight className="nav-icon" />,
      onClick: () => void showTransactions(),
    },
    {
      id: "live" as any,
      label: "Live Feed",
      icon: <Radio className="nav-icon" />,
      isLive: true,
      onClick: () => {
        window.location.href = "/live";
      },
    },
    {
      id: "system" as View,
      label: "Sistem",
      icon: <Server className="nav-icon" />,
      onClick: () => void showSystem(),
    },
    {
      id: "logs" as View,
      label: "Log",
      icon: <ScrollText className="nav-icon" />,
      onClick: () => void showLogs(activeLogTab),
    },
    {
      id: "tickets" as View,
      label: "Tiket",
      icon: <Ticket className="nav-icon" />,
      onClick: () => void showTickets(),
    },
  ];

  return (
    <div className="shell">
      {/* Desktop Sidebar Navigation */}
      <aside className="side">
        <div className="brand-section">
          <div className="brand-icon">
            <Shield size={22} />
          </div>
          <div className="brand-info">
            <span className="brand">Mastermind</span>
            <span className="brand-tag">MyPeribadi Admin</span>
          </div>
        </div>

        <div className="nav-group">
          <div className="nav-group-title">Menu Utama</div>
          <nav className="nav">
            {navItems.slice(0, 3).map((item) => (
              <button
                key={item.id}
                className={`nav-btn ${view === item.id ? "active" : ""}`}
                onClick={item.onClick}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="nav-group">
          <div className="nav-group-title">Analitis &amp; Transaksi</div>
          <nav className="nav">
            {navItems.slice(3, 7).map((item) => (
              <button
                key={item.id}
                className={`nav-btn ${view === item.id ? "active" : ""}`}
                onClick={item.onClick}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.isLive && (
                  <span className="nav-badge live-indicator">
                    <span className="live-dot" /> LIVE
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="nav-group">
          <div className="nav-group-title">Sistem &amp; Sokongan</div>
          <nav className="nav">
            {navItems.slice(7).map((item) => (
              <button
                key={item.id}
                className={`nav-btn ${view === item.id ? "active" : ""}`}
                onClick={item.onClick}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="side-footer">
          <div className="admin-card">
            <div className="admin-info">
              <div className="admin-avatar">A</div>
              <div className="admin-texts">
                <span className="admin-name">Superadmin</span>
                <span className="admin-role">
                  <span className="pulse-dot" /> Online
                </span>
              </div>
            </div>
            <button
              className="btn-icon-logout"
              title="Log keluar"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                setAuthenticated(false);
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Topbar */}
      <div className="mobile-topbar">
        <div className="mobile-brand">
          <div className="brand-icon" style={{ width: "32px", height: "32px" }}>
            <Shield size={18} />
          </div>
          <span className="brand">Mastermind</span>
        </div>
        <button
          className="btn-mobile-menu"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Buka Menu"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div
          className="mobile-drawer-overlay"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <div className={`mobile-drawer ${mobileNavOpen ? "open" : ""}`}>
        <div className="mobile-drawer-header">
          <div className="brand-section" style={{ border: 0, margin: 0, padding: 0 }}>
            <div className="brand-icon" style={{ width: "34px", height: "34px" }}>
              <Shield size={18} />
            </div>
            <div className="brand-info">
              <span className="brand" style={{ fontSize: "17px" }}>
                Mastermind
              </span>
              <span className="brand-tag">MyPeribadi Admin</span>
            </div>
          </div>
          <button
            className="btn-icon-logout"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="nav" style={{ gap: "6px" }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-btn ${view === item.id ? "active" : ""}`}
              onClick={item.onClick}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.isLive && (
                <span className="nav-badge live-indicator">
                  <span className="live-dot" /> LIVE
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="side-footer" style={{ marginTop: "auto" }}>
          <button
            className="primary"
            style={{ width: "100%" }}
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              setAuthenticated(false);
            }}
          >
            <LogOut size={16} />
            <span>Log Keluar</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <main className="main">
        <div className="main-inner">
          {/* Header */}
          <header className="top">
            <div className="top-titles">
              <div className="top-breadcrumbs">
                <span>Mastermind</span>
                <span>/</span>
                <span style={{ color: "var(--primary-light)" }}>
                  {viewTitles[view].title}
                </span>
              </div>
              <h1>{viewTitles[view].title}</h1>
              <p className="top-desc">{viewTitles[view].desc}</p>
            </div>

            <div className="top-actions">
              <div className="top-status-badge">
                <span className="pulse-dot" />
                <span>Sistem Operasi Normal</span>
              </div>
              <button
                className="btn-refresh"
                onClick={() => void handleRefresh()}
                title="Muat semula data"
              >
                <RefreshCw
                  size={14}
                  className={refreshing ? "animate-spin" : ""}
                />
                <span>Segarkan</span>
              </button>
            </div>
          </header>

          {error && (
            <div className="error-banner mb-4">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* VIEW: DASHBOARD */}
          {view === "dashboard" && (
            <>
              {/* Financial Hero Card */}
              <div className="hero">
                <div className="hero-header">
                  <span className="hero-badge">
                    <DollarSign size={14} /> Volum Keseluruhan
                  </span>
                  <span className="muted" style={{ fontSize: "12.5px" }}>
                    Semua transaksi terkumpul
                  </span>
                </div>

                <div className="hero-amount">
                  <span className="hero-currency">RM</span>
                  <span>
                    {Number(stats?.total_amount || 0).toLocaleString("ms-MY", {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>

                <div className="hero-progress-wrap">
                  <div className="hero-progress-bar">
                    <div
                      className="hero-progress-inc"
                      style={{ width: `${incPercent}%` }}
                      title={`Pendapatan: ${incPercent.toFixed(1)}%`}
                    />
                    <div
                      className="hero-progress-exp"
                      style={{ width: `${expPercent}%` }}
                      title={`Perbelanjaan: ${expPercent.toFixed(1)}%`}
                    />
                  </div>
                </div>

                <div className="hero-sub">
                  <div className="hero-stat-card">
                    <span className="hero-stat-label">
                      <ArrowDownRight size={14} color="var(--emerald)" /> Pendapatan
                    </span>
                    <span className="hero-stat-val inc">
                      RM{" "}
                      {Number(stats?.total_income || 0).toLocaleString("ms-MY", {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>

                  <div className="hero-stat-card">
                    <span className="hero-stat-label">
                      <ArrowUpRight size={14} color="var(--rose)" /> Perbelanjaan
                    </span>
                    <span className="hero-stat-val exp">
                      RM{" "}
                      {Number(stats?.total_expense || 0).toLocaleString("ms-MY", {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>

                  <div className="hero-stat-card">
                    <span className="hero-stat-label">
                      <Wallet size={14} /> Aliran Bersih
                    </span>
                    <span
                      className={`hero-stat-val ${
                        Number(stats?.total_net || 0) < 0 ? "neg" : "pos"
                      }`}
                    >
                      RM{" "}
                      {Number(stats?.total_net || 0).toLocaleString("ms-MY", {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="sub-title">
                <Layers size={14} /> Indikator Prestasi Utama (KPI)
              </div>
              <section className="grid">
                {metricCards.map((card) => (
                  <article className="metric-card" key={card.label}>
                    <div className="metric-top">
                      <span className="metric-label">{card.label}</span>
                      <div className="metric-icon-box">{card.icon}</div>
                    </div>
                    <div className="metric">
                      {card.value !== undefined
                        ? card.value.toLocaleString("ms-MY")
                        : "—"}
                    </div>
                    <div className="metric-footer">
                      <span className="pill info" style={{ fontSize: "10.5px" }}>
                        {card.badge}
                      </span>
                      <span>{card.sub}</span>
                    </div>
                  </article>
                ))}
              </section>
            </>
          )}

          {/* VIEW: USERS */}
          {view === "users" && (
            <>
              <div className="card">
                <div className="toolbar" style={{ gap: "12px" }}>
                  <div className="tabs-container">
                    {[
                      { key: "all", label: "Semua", icon: <Users size={13} /> },
                      {
                        key: "active_verified",
                        label: "Aktif & Sah",
                        icon: <CheckCircle2 size={13} color="var(--emerald)" />,
                      },
                      {
                        key: "active_unverified",
                        label: "Aktif & Belum Sah",
                        icon: <AlertTriangle size={13} color="var(--amber)" />,
                      },
                      {
                        key: "inactive",
                        label: "Tidak Aktif",
                        icon: <XCircle size={13} color="var(--rose)" />,
                      },
                    ].map((f) => (
                      <button
                        key={f.key}
                        className={`tab ${userFilter === f.key ? "active" : ""}`}
                        onClick={() => {
                          setUserFilter(f.key as UserFilter);
                          setUsers([]);
                          setUsersOffset(0);
                          void showUsers(userQuery, f.key as UserFilter, false);
                        }}
                      >
                        {f.icon}
                        <span>{f.label}</span>
                      </button>
                    ))}
                  </div>

                  <div
                    className="row"
                    style={{
                      gap: "10px",
                      flex: "1 1 auto",
                      justifyContent: "flex-end",
                    }}
                  >
                    <div className="search-box" style={{ maxWidth: "340px" }}>
                      <Search className="search-icon" />
                      <input
                        className="search"
                        data-user-q
                        placeholder="Cari nama atau e-mel pengguna…"
                        value={userQuery}
                        onChange={(e) => {
                          setUserQuery(e.target.value);
                          setUsers([]);
                          setUsersOffset(0);
                          void showUsers(e.target.value, userFilter, false);
                        }}
                      />
                    </div>
                    <span className="pill purple">
                      <Users size={13} /> {users.length} / {usersTotal} pengguna
                    </span>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Pengguna</th>
                        <th>Kaedah Login</th>
                        <th>Status Akaun</th>
                        <th>Emel Sah</th>
                        <th>Tarikh Daftar</th>
                        <th style={{ textAlign: "right" }}>Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center" style={{ padding: "32px" }}>
                            Tiada rekod pengguna dijumpai untuk kategori ini.
                          </td>
                        </tr>
                      ) : (
                        users.map((u) => (
                          <tr key={u.id}>
                            <td>
                              <div className="user-cell">
                                <div className="user-avatar-sm">
                                  {(u.name || u.email).slice(0, 2).toUpperCase()}
                                </div>
                                <div className="user-text-info">
                                  <span className="user-text-name">
                                    {u.name || "—"}
                                  </span>
                                  <span className="user-text-email">
                                    {u.email}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td>
                              {u.auth_provider === "google" ? (
                                <span className="login-badge">
                                  <GoogleIcon />
                                  <span>Google</span>
                                </span>
                              ) : (
                                <span className="login-badge mail">
                                  <span>@</span>
                                  <span>Email</span>
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`pill ${
                                  u.is_active ? "ok" : "bad"
                                }`}
                              >
                                {u.is_active ? (
                                  <>
                                    <CheckCircle2 size={12} /> Aktif
                                  </>
                                ) : (
                                  <>
                                    <XCircle size={12} />{" "}
                                    {u.deactivated_reason || "Tidak Aktif"}
                                  </>
                                )}
                              </span>
                            </td>
                            <td>
                              {u.email_verified_at ? (
                                <span className="pill ok" style={{ fontSize: "11px" }}>
                                  Ya
                                </span>
                              ) : (
                                <span className="pill warn" style={{ fontSize: "11px" }}>
                                  Belum Sah
                                </span>
                              )}
                            </td>
                            <td>{fmtDay(u.created_at)}</td>
                            <td>
                              <div
                                className="row"
                                style={{
                                  justifyContent: "flex-end",
                                  flexWrap: "nowrap",
                                }}
                              >
                                <button
                                  className="ghost"
                                  onClick={() => void openUser(u.id)}
                                >
                                  <Eye size={13} /> Detail
                                </button>
                                {!u.email.endsWith("@invalid.local") && (
                                  <button
                                    className={`ghost ${
                                      u.is_active ? "danger" : "good"
                                    }`}
                                    disabled={busy}
                                    onClick={() => void toggleActive(u)}
                                  >
                                    {u.is_active ? (
                                      <>
                                        <UserX size={13} /> Nyahaktif
                                      </>
                                    ) : (
                                      <>
                                        <UserCheck size={13} /> Aktifkan
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {users.length < usersTotal && (
                  <div style={{ textAlign: "center", marginTop: "18px" }}>
                    <button
                      className="primary"
                      onClick={() =>
                        void showUsers(userQuery, userFilter, true)
                      }
                    >
                      Muat Lebih Banyak Pengguna
                    </button>
                  </div>
                )}
              </div>

              {/* User Detail Modal */}
              {detailUser && (
                <div
                  className="overlay"
                  onClick={() => {
                    setDetail(null);
                    setDetailUser(null);
                  }}
                >
                  <div className="modal" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-head">
                      <h2>Profil &amp; Maklumat Pengguna</h2>
                      <button
                        className="ghost"
                        onClick={() => {
                          setDetail(null);
                          setDetailUser(null);
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {detail ? (
                      <>
                        <div className="kv-grid">
                          <div className="kv">
                            <span>Nama Penuh</span>
                            <b>{detail.name || "—"}</b>
                          </div>
                          <div className="kv">
                            <span>E-mel</span>
                            <b>{detail.email}</b>
                          </div>
                          <div className="kv">
                            <span>Nombor Telefon</span>
                            <b>{detail.phone || "—"}</b>
                          </div>
                          <div className="kv">
                            <span>Penyedia Log Masuk</span>
                            <b>{detail.auth_provider || "email"}</b>
                          </div>
                          <div className="kv">
                            <span>E-mel Disahkan</span>
                            <b>{detail.email_verified_at ? "Ya" : "Tidak"}</b>
                          </div>
                          <div className="kv">
                            <span>Akses Pentadbir</span>
                            <b>{detail.is_admin ? "Ya (Admin)" : "Bukan"}</b>
                          </div>
                          <div className="kv">
                            <span>Status Semasa</span>
                            <b>
                              {detail.is_active
                                ? "Aktif"
                                : detail.deactivated_reason || "Tidak aktif"}
                            </b>
                          </div>
                          <div className="kv">
                            <span>Tarikh Pendaftaran</span>
                            <b>{fmtDate(detail.created_at)}</b>
                          </div>
                        </div>

                        <div className="sub-title">
                          <BarChart3 size={14} /> Statistik Pengguna
                        </div>
                        <div className="row">
                          {Object.entries(detail.stats || {}).map(([k, v]) => (
                            <span className="pill info" key={k}>
                              {k.replace(/_/g, " ")}: <b>{String(v)}</b>
                            </span>
                          ))}
                        </div>

                        <div className="sub-title">
                          <HomeIcon size={14} /> Keahlian Household
                        </div>
                        {(detail.memberships || []).length ? (
                          <div className="table-responsive">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Household</th>
                                  <th>Peranan (Role)</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.memberships.map((m: any) => (
                                  <tr key={m.id}>
                                    <td>
                                      <strong>{m.name}</strong>
                                    </td>
                                    <td>
                                      <span className="pill purple">
                                        {m.role}
                                      </span>
                                    </td>
                                    <td>
                                      <span className="pill ok">{m.status}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="muted" style={{ fontSize: "13px" }}>
                            Tiada sebarang keahlian household.
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="text-center" style={{ padding: "20px" }}>
                        <RefreshCw className="animate-spin" size={20} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* VIEW: HOUSEHOLDS */}
          {view === "households" && (
            <>
              <div className="card">
                <div className="toolbar">
                  <div className="search-box">
                    <Search className="search-icon" />
                    <input
                      className="search"
                      placeholder="Cari nama household…"
                      onChange={(e) => void showHouseholds(e.target.value)}
                    />
                  </div>
                  <span className="pill purple">
                    <HomeIcon size={13} /> {households.length} Household
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Household</th>
                        <th>Pemilik Utama</th>
                        <th>Bil. Ahli</th>
                        <th>Status</th>
                        <th>Tarikh Dibuat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {households.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center" style={{ padding: "32px" }}>
                            Tiada rekod household dijumpai.
                          </td>
                        </tr>
                      ) : (
                        households.map((h) => (
                          <tr
                            key={h.id}
                            onClick={() => void openHousehold(h.id)}
                            style={{ cursor: "pointer" }}
                          >
                            <td>
                              <strong>{h.name}</strong>
                            </td>
                            <td>{h.owner_name || `ID: ${h.id}`}</td>
                            <td>
                              <span className="pill info">{h.member_count} ahli</span>
                            </td>
                            <td>
                              <span className="pill ok">{h.status}</span>
                            </td>
                            <td>{fmtDay(h.created_at)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Household Detail Drawer/Card */}
              {hhDetail && (
                <div className="card detail">
                  <header className="detail-head">
                    <h2>Household: {hhDetail.household.name}</h2>
                    <button className="ghost" onClick={() => setHhDetail(null)}>
                      <X size={15} /> Tutup
                    </button>
                  </header>
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Ahli</th>
                          <th>Peranan</th>
                          <th>Status</th>
                          <th>Tarikh Sertai</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hhDetail.members.map((m: any) => (
                          <tr key={m.id}>
                            <td>
                              <strong>{m.name || "—"}</strong>
                              <br />
                              <span className="muted">{m.email}</span>
                            </td>
                            <td>
                              <span className="pill purple">{m.role}</span>
                            </td>
                            <td>
                              <span
                                className={`pill ${
                                  m.is_active ? "ok" : "bad"
                                }`}
                              >
                                {m.status}
                              </span>
                            </td>
                            <td>{fmtDate(m.joined_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* VIEW: ANALYTICS */}
          {view === "analytics" && (
            <>
              <div className="row tabs" style={{ justifyContent: "space-between" }}>
                <div className="tabs-container">
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      padding: "0 8px",
                      fontWeight: 600,
                    }}
                  >
                    Tempoh:
                  </span>
                  {[3, 6, 12].map((m) => (
                    <button
                      key={m}
                      className={`tab ${txnMonths === m ? "active" : ""}`}
                      onClick={() => {
                        setTxnMonths(m);
                        void showAnalytics(m);
                      }}
                    >
                      {m} Bulan
                    </button>
                  ))}
                </div>
              </div>

              <div className="card mb-4">
                <div className="card-header">
                  <div className="card-title-group">
                    <div className="card-title-icon">
                      <BarChart3 size={18} />
                    </div>
                    <div>
                      <h3 className="card-title">Transaksi Mengikut Bulan</h3>
                      <p className="card-subtitle">
                        Perbandingan kekerapan transaksi, perbelanjaan dan pendapatan
                      </p>
                    </div>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Bulan</th>
                        <th>Jumlah Transaksi</th>
                        <th>Perbelanjaan (RM)</th>
                        <th>Pendapatan (RM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txnStats.map((r) => (
                        <tr key={r.month}>
                          <td>
                            <strong>{r.month}</strong>
                          </td>
                          <td>
                            <span className="pill info">{r.txn_count}</span>
                          </td>
                          <td>
                            <span style={{ color: "var(--rose-text)", fontWeight: 600 }}>
                              RM {Number(r.expenses || 0).toLocaleString("ms-MY")}
                            </span>
                          </td>
                          <td>
                            <span style={{ color: "var(--emerald-text)", fontWeight: 600 }}>
                              RM {Number(r.income || 0).toLocaleString("ms-MY")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: "16px",
                }}
              >
                <div className="card">
                  <div className="card-header">
                    <div className="card-title-group">
                      <div className="card-title-icon">
                        <TrendingUp size={18} />
                      </div>
                      <div>
                        <h3 className="card-title">Pertumbuhan Pengguna Baharu</h3>
                        <p className="card-subtitle">Kadar pendaftaran bulanan</p>
                      </div>
                    </div>
                  </div>
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Bulan</th>
                          <th>Pengguna Baharu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userGrowth.map((r) => (
                          <tr key={r.month}>
                            <td>
                              <strong>{r.month}</strong>
                            </td>
                            <td>
                              <span className="pill ok">+{r.new_users}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <div className="card-title-group">
                      <div className="card-title-icon">
                        <Wallet size={18} />
                      </div>
                      <div>
                        <h3 className="card-title">Wallet Terkini</h3>
                        <p className="card-subtitle">Senarai dompet dan akaun pengguna</p>
                      </div>
                    </div>
                  </div>
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Wallet</th>
                          <th>Jenis</th>
                          <th>Pemilik</th>
                          <th>Transaksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {walletStats.map((w: any) => (
                          <tr key={w.id}>
                            <td>
                              <strong>{w.name}</strong>
                              {w.is_saving && (
                                <span
                                  className="pill ok"
                                  style={{ marginLeft: "6px", fontSize: "10px" }}
                                >
                                  Saving
                                </span>
                              )}
                            </td>
                            <td>
                              <span className="pill">{w.type}</span>
                            </td>
                            <td>{w.owner || "—"}</td>
                            <td>
                              <span className="pill info">{w.txn_count}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* VIEW: SYSTEM */}
          {view === "system" && (
            <>
              <div className="grid">
                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Status Pangkalan Data</span>
                    <div className="metric-icon-box">
                      <Database size={20} />
                    </div>
                  </div>
                  <div className="metric">
                    {sysStatus?.db_ok ? (
                      <span style={{ color: "var(--emerald-text)" }}>SIHAT</span>
                    ) : (
                      <span style={{ color: "var(--rose-text)" }}>GAGAL</span>
                    )}
                  </div>
                  <div className="metric-footer">
                    <span className="pulse-dot" />
                    <span>PostgreSQL connection</span>
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Saiz Pangkalan Data</span>
                    <div className="metric-icon-box">
                      <HardDrive size={20} />
                    </div>
                  </div>
                  <div className="metric">{sysStatus?.db_size || "—"}</div>
                  <div className="metric-footer">
                    <span>Penggunaan disk data</span>
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Lampiran Fail</span>
                    <div className="metric-icon-box">
                      <Paperclip size={20} />
                    </div>
                  </div>
                  <div className="metric">{sysStatus?.attachments || 0}</div>
                  <div className="metric-footer">
                    <span>Resit &amp; Dokumen</span>
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Mesej Chat / AI</span>
                    <div className="metric-icon-box">
                      <MessageSquare size={20} />
                    </div>
                  </div>
                  <div className="metric">{sysStatus?.chat_messages || 0}</div>
                  <div className="metric-footer">
                    <span>Interaksi Pembantu</span>
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Barang Inventori</span>
                    <div className="metric-icon-box">
                      <Package size={20} />
                    </div>
                  </div>
                  <div className="metric">{sysStatus?.inventory_items || 0}</div>
                  <div className="metric-footer">
                    <span>Item &amp; Barangan</span>
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Permintaan 24 Jam</span>
                    <div className="metric-icon-box">
                      <Activity size={20} />
                    </div>
                  </div>
                  <div className="metric">{sysStatus?.requests_24h || 0}</div>
                  <div className="metric-footer">
                    <span>Panggilan Web &amp; API</span>
                  </div>
                </article>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title-group">
                    <div className="card-title-icon">
                      <Smartphone size={18} />
                    </div>
                    <div>
                      <h3 className="card-title">Sesi Aktif Terkini</h3>
                      <p className="card-subtitle">
                        Peranti dan pengguna yang sedang log masuk
                      </p>
                    </div>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Pengguna</th>
                        <th>Jenis Sesi</th>
                        <th>Tarikh Dibuka</th>
                        <th>Terakhir Digunakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => {
                        const anyS: any = s;
                        return (
                          <tr key={s.id}>
                            <td>
                              <strong>{anyS.name || "—"}</strong>
                              <br />
                              <span className="muted">{anyS.email}</span>
                            </td>
                            <td>
                              <span className="pill info">
                                {anyS.session_kind || "web"}
                              </span>
                            </td>
                            <td>{fmtDate(anyS.created_at)}</td>
                            <td>{fmtDate(anyS.last_used_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* VIEW: ACTIVITY */}
          {view === "activity" && (
            <>
              <div className="row tabs">
                <div className="tabs-container">
                  {[
                    ["all", "Semua"],
                    ["login", "Log Masuk"],
                    ["api", "API Traffic"],
                    ["audit", "Audit Pentadbir"],
                  ].map(([k, l]) => (
                    <button
                      key={k}
                      className={`tab ${activityKind === k ? "active" : ""}`}
                      onClick={() => void showActivity(k as string)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Jenis</th>
                        <th>Pengguna / Pelaku</th>
                        <th>Butiran Peristiwa</th>
                        <th>IP / Sasaran</th>
                        <th>Masa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.map((a: any) => (
                        <tr key={a.at + a.kind + a.email + a.detail}>
                          <td>
                            <span
                              className={`pill ${
                                a.kind === "login"
                                  ? "ok"
                                  : a.kind === "api"
                                  ? "info"
                                  : "purple"
                              }`}
                            >
                              {a.kind}
                            </span>
                          </td>
                          <td>
                            <strong>{a.actor || "—"}</strong>
                            <br />
                            <span className="muted">{a.email}</span>
                          </td>
                          <td>{a.detail}</td>
                          <td>
                            <span className="pill" style={{ fontSize: "11px" }}>
                              {a.ip_address || a.status_code || "—"}
                            </span>
                          </td>
                          <td>{fmtDate(a.at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* VIEW: TRANSACTIONS */}
          {view === "transactions" && (
            <>
              <div className="card">
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Jenis</th>
                        <th>Pengguna</th>
                        <th>Wallet</th>
                        <th>Kategori</th>
                        <th>Tarikh &amp; Masa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTxns.map((t: any) => (
                        <tr key={t.id}>
                          <td>
                            <span
                              className={`pill ${
                                t.type === "expense" ? "bad" : "ok"
                              }`}
                            >
                              {t.type === "expense" ? (
                                <>
                                  <ArrowUpRight size={12} /> Keluar
                                </>
                              ) : (
                                <>
                                  <ArrowDownRight size={12} /> Masuk
                                </>
                              )}
                            </span>
                          </td>
                          <td>
                            <strong>{t.user_name || t.user_email || "—"}</strong>
                            {t.user_name && t.user_email && (
                              <div className="muted" style={{ fontSize: "11.5px" }}>
                                {t.user_email}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="pill info">{t.wallet_name || "—"}</span>
                          </td>
                          <td>{t.category_name || "—"}</td>
                          <td>{fmtDate(t.txn_date || t.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* VIEW: LOGS */}
          {view === "logs" && (
            <>
              <div className="row tabs">
                <div className="tabs-container">
                  <button
                    className={`tab ${activeLogTab === "login" ? "active" : ""}`}
                    onClick={() => void showLogs("login")}
                  >
                    <Smartphone size={14} /> Log Masuk
                  </button>
                  <button
                    className={`tab ${activeLogTab === "audit" ? "active" : ""}`}
                    onClick={() => void showLogs("audit")}
                  >
                    <Shield size={14} /> Audit Pentadbir
                  </button>
                </div>
              </div>

              {activeLogTab === "login" ? (
                <div className="card">
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Pengguna / E-mel</th>
                          <th>Status</th>
                          <th>Alamat IP</th>
                          <th>Peranti</th>
                          <th>Masa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loginLogs.map((l) => (
                          <tr key={l.id}>
                            <td>
                              <strong>{l.name || "—"}</strong>
                              <br />
                              <span className="muted">{l.email}</span>
                            </td>
                            <td>
                              <span
                                className={`pill ${
                                  l.status === "success" ? "ok" : "bad"
                                }`}
                              >
                                {l.status}
                              </span>
                            </td>
                            <td>
                              <span className="pill" style={{ fontSize: "11px" }}>
                                {l.ip_address}
                              </span>
                            </td>
                            <td>{l.device_label || "—"}</td>
                            <td>{fmtDate(l.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="card">
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Pentadbir</th>
                          <th>Tindakan</th>
                          <th>Sasaran</th>
                          <th>Masa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((l) => (
                          <tr key={l.id}>
                            <td>
                              <strong>{l.actor_email}</strong>
                            </td>
                            <td>
                              <span className="pill purple">{l.action}</span>
                            </td>
                            <td>
                              <strong>
                                {l.target_type} {l.target_id}
                              </strong>
                              {l.detail && (
                                <div className="muted" style={{ fontSize: "12px" }}>
                                  {l.detail}
                                </div>
                              )}
                            </td>
                            <td>{fmtDate(l.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* VIEW: TICKETS */}
          {view === "tickets" && (
            <>
              <div className="card">
                <div className="toolbar">
                  <div className="tabs-container">
                    {[
                      ["", "Semua"],
                      ["feature", "Feature"],
                      ["support", "Support"],
                      ["bug", "Bug"],
                    ].map(([k, l]) => (
                      <button
                        key={k}
                        className={`tab ${ticketKindFilter === k ? "active" : ""}`}
                        onClick={() => void showTickets(k as string)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <span className="pill purple">
                    <Ticket size={13} /> {tickets.length} / {ticketsTotal} tiket
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Jenis</th>
                        <th>Tajuk &amp; Keterangan</th>
                        <th>Pengirim</th>
                        <th>Status</th>
                        <th>Prioriti</th>
                        <th>Dihantar</th>
                        <th style={{ textAlign: "right" }}>Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center" style={{ padding: "32px" }}>
                            Tiada tiket sokongan dijumpai.
                          </td>
                        </tr>
                      ) : (
                        tickets.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <span
                                className={`pill ${
                                  t.kind === "bug"
                                    ? "bad"
                                    : t.kind === "feature"
                                    ? "purple"
                                    : "info"
                                }`}
                              >
                                {t.kind}
                              </span>
                            </td>
                            <td>
                              <strong>{t.title}</strong>
                              {t.description && (
                                <div className="muted" style={{ fontSize: "12px" }}>
                                  {t.description.length > 75
                                    ? t.description.slice(0, 75) + "…"
                                    : t.description}
                                </div>
                              )}
                            </td>
                            <td>
                              <strong>{t.user_name || "—"}</strong>
                              <br />
                              <span className="muted">{t.user_email}</span>
                            </td>
                            <td>
                              <span
                                className={`pill ${
                                  t.status === "resolved"
                                    ? "ok"
                                    : t.status === "closed"
                                    ? "bad"
                                    : t.status === "in_progress"
                                    ? "info"
                                    : "warn"
                                }`}
                              >
                                {t.status}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`pill ${
                                  t.priority === "high"
                                    ? "bad"
                                    : t.priority === "low"
                                    ? "ok"
                                    : "warn"
                                }`}
                              >
                                {t.priority}
                              </span>
                            </td>
                            <td>{fmtDate(t.created_at)}</td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                className="ghost"
                                onClick={() => void openTicket(t.id)}
                              >
                                <Eye size={13} /> Detail
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {tickets.length < ticketsTotal && (
                  <div style={{ textAlign: "center", marginTop: "18px" }}>
                    <button
                      className="primary"
                      onClick={() =>
                        void showTickets(ticketKindFilter, "", "", true)
                      }
                    >
                      Muat Lebih Banyak Tiket
                    </button>
                  </div>
                )}
              </div>

              {/* Ticket Detail Modal */}
              {ticketDetail && (
                <div
                  className="overlay"
                  onClick={() => setTicketDetail(null)}
                >
                  <div className="modal" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-head">
                      <h2>
                        #{ticketDetail.id} · {ticketDetail.title}
                      </h2>
                      <button
                        className="ghost"
                        onClick={() => setTicketDetail(null)}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="kv-grid">
                      <div className="kv">
                        <span>Jenis Tiket</span>
                        <b>{ticketDetail.kind}</b>
                      </div>
                      <div className="kv">
                        <span>Pengguna</span>
                        <b>
                          {ticketDetail.user_name} ({ticketDetail.user_email})
                        </b>
                      </div>
                      <div className="kv">
                        <span>Tahap Prioriti</span>
                        <b>{ticketDetail.priority}</b>
                      </div>
                      <div className="kv">
                        <span>Status Semasa</span>
                        <b>{ticketDetail.status}</b>
                      </div>
                      <div className="kv">
                        <span>Tarikh Dihantar</span>
                        <b>{fmtDate(ticketDetail.created_at)}</b>
                      </div>
                      {ticketDetail.resolved_at && (
                        <div className="kv">
                          <span>Tarikh Selesai</span>
                          <b>{fmtDate(ticketDetail.resolved_at)}</b>
                        </div>
                      )}
                    </div>

                    <div className="sub-title">Kandungan Keterangan</div>
                    <div
                      style={{
                        padding: "14px",
                        background: "rgba(0,0,0,0.3)",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "14px",
                        lineHeight: "1.6",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {ticketDetail.description || "Tiada keterangan disediakan."}
                    </div>

                    <div className="sub-title">Tukar Status Tiket</div>
                    <div className="row" style={{ gap: "8px" }}>
                      {[
                        ["new", "Baru"],
                        ["in_progress", "Dalam Proses"],
                        ["resolved", "Selesai"],
                        ["closed", "Tutup"],
                      ].map(([k, l]) => (
                        <button
                          key={k}
                          className={`ghost ${
                            ticketDetail.status === k ? "active" : ""
                          }`}
                          disabled={busy}
                          onClick={() =>
                            void setTicketStatus(ticketDetail.id, k as string)
                          }
                        >
                          {l}
                        </button>
                      ))}
                    </div>

                    {ticketDetail.kind === "support" && (
                      <div style={{ marginTop: "16px" }}>
                        <div className="sub-title">Balas Tiket</div>
                        {ticketDetail.admin_note ? (
                          <div
                            className="ticket-reply-box"
                            style={{
                              background: "var(--panel)",
                              border: "1px solid var(--border)",
                              borderRadius: "10px",
                              padding: "10px 12px",
                              marginBottom: "10px",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                              Balasan semasa
                            </div>
                            {ticketDetail.admin_note}
                          </div>
                        ) : null}
                        <textarea
                          value={ticketReply}
                          onChange={(e) => setTicketReply(e.target.value)}
                          placeholder="Taip balasan untuk pengguna…"
                          rows={3}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            borderRadius: "10px",
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                            color: "var(--text-main)",
                            padding: "10px 12px",
                            fontSize: 13,
                            fontFamily: "inherit",
                            resize: "vertical",
                          }}
                        />
                        <button
                          className="primary"
                          style={{ marginTop: "10px", width: "100%" }}
                          disabled={busy || !ticketReply.trim()}
                          onClick={() => void sendTicketReply(ticketDetail.id)}
                        >
                          Hantar Balasan
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
