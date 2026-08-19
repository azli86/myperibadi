"use client";

import { useEffect, useRef, useState } from "react";

const parseUtc = (s?: string | null) => {
  if (!s) return null;
  const raw = String(s);
  const d = new Date(raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z");
  return isNaN(d.getTime()) ? null : d;
};

export default function LivePage() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [reqs, setReqs] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [paused, setPaused] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/dashboard", { credentials: "include", cache: "no-store" });
      setAuth(r.ok);
    })();
  }, []);

  useEffect(() => {
    if (auth === null) return;
    let t: any;
    const load = async () => {
      try {
        const r = await fetch("/api/live/api?limit=30", { credentials: "include" });
        if (r.ok) {
          setReqs(await r.json());
          setLastUpdate(new Date().toLocaleTimeString("en-GB", {
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            timeZone: "Asia/Kuala_Lumpur",
          }));
        }
      } catch { /* ignore */ }
    };
    load();
    t = setInterval(() => { if (!paused) load(); }, 3000);
    return () => t && clearInterval(t);
  }, [auth, paused]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = 0;
  }, [reqs]);

  const fmtTime = (s?: string) => {
    const d = parseUtc(s);
    if (!d) return "";
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" });
  };
  const fmtDay = (s?: string) => {
    const d = parseUtc(s);
    if (!d) return "";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Asia/Kuala_Lumpur" });
  };

  const meta = (r: any) => {
    if (r.kind === "TXN") {
      const label = r.detail1 === "income" ? "IN" : "OUT";
      const tone = r.detail1 === "income" ? "in" : "out";
      const parts: string[] = [];
      if (r.category_name) parts.push(r.category_name);
      if (r.household_name) parts.push(r.household_name);
      return { label, tone, title: parts.join(" · ") || "Transaksi", sub: r.user_email || "" };
    }
    if (r.kind === "LOGIN") {
      return { label: "LOGIN", tone: "login", title: r.status, sub: r.user_email || r.detail2 || "" };
    }
    return { label: "NEW", tone: "new", title: "Akaun baharu", sub: r.user_email || "" };
  };

  if (auth === null) return <div className="lv-load">Memuatkan Live Aktiviti…</div>;
  if (auth === false) return <div className="lv-load"><a href="/">Sila log masuk Mastermind dahulu.</a></div>;

  return (
    <div className="lv-wrap">
      <header className="lv-head">
        <div>
          <a className="lv-back" href="/">← Dashboard</a>
          <h1 className="lv-h1">Live Aktiviti</h1>
          <p className="lv-sub">Aktiviti pengguna masa nyata dalam sistem</p>
        </div>
        <div className="lv-ctl">
          <button className={"lv-pause " + (paused ? "on" : "")} onClick={() => setPaused(p => !p)}>
            {paused ? "▶ Resume" : "❚❚ Jeda"}
          </button>
          <div className="lv-badge-live">
            <span className="lv-dot" style={{ opacity: paused ? 0.3 : 1 }} />
            {paused ? "Dijeda" : "LIVE"}
          </div>
        </div>
      </header>

      <div className="lv-summary">
        <div className="lv-stat"><span className="muted">Jumlah</span><b>{reqs.length} aktiviti</b></div>
        <div className="lv-stat"><span className="muted">Kemaskini</span><b>{lastUpdate}</b></div>
      </div>

      <div className="lv-list" ref={listRef}>
        {reqs.map((r: any) => {
          const m = meta(r);
          return (
            <div className={"lv-row " + m.tone} key={r.kind + r.created_at + (r.detail2 || "")}>
              <span className={"lv-chip " + m.tone}>{m.label}</span>
              <div className="lv-info">
                <div className="lv-title">{m.title}</div>
                <div className="lv-sub"><span className="lv-name">{r.user_name}</span>{m.sub ? <span className="lv-mail"> · {m.sub}</span> : null}</div>
              </div>
              <div className="lv-stamp"><div>{fmtTime(r.created_at)}</div><div className="muted">{fmtDay(r.created_at)}</div></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
