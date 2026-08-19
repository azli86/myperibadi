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
    const el = termRef.current;
    if (el) el.scrollTop = 0;
  }, [reqs]);

  const fmtStamp = (s?: string) => {
    const d = parseUtc(s);
    if (!d) return "";
    const day = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" });
    return `${day} ${time}`;
  };

  if (auth === null) return <div className="lv-load">Memuatkan Live Feed…</div>;
  if (auth === false) return <div className="lv-load"><a href="/">Sila log masuk Mastermind dahulu.</a></div>;

  return (
    <div className="lv-wrap">
      <div className="ub-bar">
        <div className="ub-win">
          <button className="ub-btn close" aria-label="Tutup" onClick={()=>{window.location.href="/"}}><span>✕</span></button>
          <button className="ub-btn min" aria-label="Kurangkan"><span>–</span></button>
          <button className="ub-btn max" aria-label="Besarkan"><span>□</span></button>
        </div>
        <div className="ub-title">Aktiviti — Terminal</div>
        <div className="ub-right">
          <span className="ub-dot"/>
          <span>{paused ? "PAUSED" : "LIVE"}</span>
          <button className="lv-pause" onClick={() => setPaused(p => !p)}>{paused ? "▶ Resume" : "❚❚ Pause"}</button>
        </div>
      </div>
      <div className="ub-term" ref={termRef}>
        {reqs.map((r: any) => {
          let badge = r.kind;
          let cls = "t";
          let main = "";
          if (r.kind === "TXN") {
            badge = r.detail1 === "income" ? "IN" : "OUT";
            cls = r.detail1 === "income" ? "inc" : "exp";
            const parts: string[] = [];
            if (r.category_name) parts.push(r.category_name);
            if (r.household_name) parts.push(`[${r.household_name}]`);
            main = parts.join(" · ");
          } else if (r.kind === "LOGIN") {
            badge = "LOGIN";
            cls = "log";
            main = r.status;
          } else {
            badge = "NEW";
            cls = "sig";
            main = "Akaun baharu";
          }
          return (
            <div className="lv-line" key={r.kind + r.created_at + (r.detail2 || "")}>
              <span className="lv-time">[{fmtStamp(r.created_at)}]</span>
              <span className={"lv-badge " + cls}>{badge}</span>
              {main && <span className="lv-main">{main}</span>}
              <span className="lv-user">{r.user_name}</span>
              {r.user_email && <span className="lv-mail">{r.user_email}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
