"use client";

import { useEffect, useState } from "react";

const parseUtc = (s?: string | null) => {
  if (!s) return null;
  const raw = String(s);
  const d = new Date(raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z");
  return isNaN(d.getTime()) ? null : d;
};

export default function LivePage() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string>("");

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
        const r = await fetch("/api/transactions/recent?limit=20", { credentials: "include" });
        if (r.ok) {
          setTxns(await r.json());
          setLastUpdate(new Date().toLocaleTimeString("en-GB", {
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            timeZone: "Asia/Kuala_Lumpur",
          }));
        }
      } catch { /* ignore */ }
    };
    load();
    t = setInterval(load, 5000);
    return () => t && clearInterval(t);
  }, [auth]);

  const fmtDate = (t: any) => {
    const d = parseUtc(t?.created_at || t?.txn_date);
    if (!d) return "";
    const day = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" });
    return `${day} ${time}`;
  };

  if (auth === null) return <div className="lv-load">Memuatkan Live Feed…</div>;
  if (auth === false) return <div className="lv-load"><a href="/">Sila log masuk Mastermind dahulu.</a></div>;

  return (
    <div className="lv-wrap">
      <div className="lv-top">
        <a className="lv-back" href="/">← Dashboard</a>
        <div className="lv-title">LIVE · TRANSAKSI FEED</div>
        <div className="lv-status">
          <span className="lv-dot" />
          <span>LIVE</span>
          <span className="lv-upd">kemaskini {lastUpdate}</span>
        </div>
      </div>
      <div className="lv-term">
        {txns.map((t: any) => (
          <div className="lv-line" key={t.id}>
            <span className="lv-time">[{fmtDate(t)}]</span>
            <span className={"lv-type " + (t.type === "expense" ? "exp" : "inc")}>
              {t.type === "expense" ? "OUT" : "IN"}
            </span>
            <span className="lv-vendor">{t.vendor_or_source || "—"}</span>
            <span className="lv-user">{t.user_name || t.user_email || "—"}</span>
            <span className="lv-wallet">{t.wallet_name || ""}</span>
          </div>
        ))}
        <div className="lv-cursor">$ <span className="lv-blink">▊</span></div>
      </div>
    </div>
  );
}
