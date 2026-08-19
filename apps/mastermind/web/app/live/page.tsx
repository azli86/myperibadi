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
  const termRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [reqs]);

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
        const r = await fetch("/api/live/api?limit=25", { credentials: "include" });
        if (r.ok) {
          const data = await r.json();
          setReqs([...data].reverse());
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

  const fmtStamp = (s?: string) => {
    const d = parseUtc(s);
    if (!d) return "";
    const day = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" });
    return `${day} ${time}`;
  };

  const statusClass = (c: number) => (c < 300 ? "ok" : c < 400 ? "redir" : "err");

  if (auth === null) return <div className="lv-load">Memuatkan Live API Feed…</div>;
  if (auth === false) return <div className="lv-load"><a href="/">Sila log masuk Mastermind dahulu.</a></div>;

  return (
    <div className="lv-wrap">
      <div className="lv-top">
        <a className="lv-back" href="/">← Dashboard</a>
        <div className="lv-title">LIVE · API FEED</div>
        <div className="lv-status">
          <button className="lv-pause" onClick={() => setPaused(p => !p)}>{paused ? "▶ Resume" : "❚❚ Pause"}</button>
          <span className="lv-dot" style={{ opacity: paused ? 0.3 : 1 }} />
          <span>{paused ? "PAUSED" : "LIVE"}</span>
          <span className="lv-count">{reqs.length} req</span>
          <span className="lv-upd">kemaskini {lastUpdate}</span>
        </div>
      </div>
      <div className="lv-term" ref={termRef}>
        {reqs.map((r: any) => (
          <div className="lv-line" key={r.id}>
            <span className="lv-time">[{fmtStamp(r.created_at)}]</span>
            <span className={"lv-method " + (r.method === "POST" ? "post" : r.method === "PUT" ? "put" : r.method === "DELETE" ? "del" : "get")}>
              {r.method}
            </span>
            <span className={"lv-code " + statusClass(r.status_code)}>{r.status_code}</span>
            <span className="lv-path">{r.path}</span>
            <span className="lv-user">{r.email}</span>
            <span className="lv-ip">{r.ip_address || ""}</span>
          </div>
        ))}
        <div className="lv-cursor">$ <span className="lv-blink">▊</span></div>
      </div>
    </div>
  );
}
