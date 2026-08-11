"use client";

import { useEffect, useRef, useState } from "react";

/**
 * PWAInstallGate — wajibkan Android user install MyPeribadi PWA.
 *
 * Logik:
 * - Android + belum install (bukan standalone) -> full-screen gate, blok app.
 * - iOS/desktop/browser lain -> tiada gate (tak boleh paksa install).
 * - Butang "Install App" trigger beforeinstallprompt; fallback ke arahan manual
 *   kalau event tak sampai (contoh: Chrome dah dismiss, atau user guna browser lain).
 */
export default function PWAInstallGate() {
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const deferredPrompt = useRef<any>(null);

  useEffect(() => {
    // Detect platform
    const ua = navigator.userAgent;
    setIsAndroid(/Android/i.test(ua));

    const checkStandalone = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(standalone);
    };
    checkStandalone();
    window.addEventListener("appinstalled", checkStandalone);

    // Capture install prompt (Chrome/Android + desktop).
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    return () => {
      window.removeEventListener("appinstalled", checkStandalone);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    const prompt = deferredPrompt.current;
    if (prompt) {
      prompt.prompt();
      const choice = await prompt.userChoice;
      deferredPrompt.current = null;
      setCanInstall(false);
      if (choice && choice.outcome === "accepted") {
        // App akan masuk standalone mode selepas install
        window.location.reload();
      } else {
        setShowManual(true);
      }
    } else {
      // Tiada beforeinstallprompt — tunjuk arahan manual
      setShowManual(true);
    }
  };

  // Bukan Android, atau dah install -> biarkan app berfungsi normal
  if (!isAndroid || isStandalone) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg, #0d0d0d)",
        padding: "24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 380,
          width: "100%",
          textAlign: "center",
          color: "var(--text, #f3f4f6)",
        }}
      >
        {/* Logo */}
        <img
          src="/icon-512-v3.png"
          alt="MyPeribadi"
          style={{ width: 88, height: 88, borderRadius: 20, margin: "0 auto 20px", display: "block" }}
        />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>
          Install Aplikasi MyPeribadi
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.85, margin: "0 0 24px" }}>
          Sila install aplikasi MyPeribadi dahulu untuk pengalaman terbaik —
          notifikasi, offline & akses pantas dari skrin utama.
        </p>

        {!showManual ? (
          <>
            <button
              onClick={handleInstall}
              style={{
                width: "100%",
                padding: "14px 20px",
                fontSize: 16,
                fontWeight: 600,
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                background: "var(--btn-primary-bg, #1a73e8)",
                color: "var(--btn-primary-text, #fff)",
                marginBottom: 12,
              }}
            >
              {canInstall ? "📲 Install App" : "Install App"}
            </button>
            <button
              onClick={() => setShowManual(true)}
              style={{
                width: "100%",
                padding: "12px 20px",
                fontSize: 14,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.2)",
                cursor: "pointer",
                background: "transparent",
                color: "inherit",
              }}
            >
              Cara install manual
            </button>
          </>
        ) : (
          <div
            style={{
              textAlign: "left",
              fontSize: 14,
              lineHeight: 1.7,
              background: "rgba(255,255,255,0.05)",
              borderRadius: 12,
              padding: "16px 18px",
              marginBottom: 16,
            }}
          >
            <strong style={{ display: "block", marginBottom: 8 }}>
              Cara install di Android:
            </strong>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Buka menu <b>⋮</b> (3 titik) di atas kanan Chrome</li>
              <li>Pilih <b>“Install app”</b> atau <b>“Add to Home screen”</b></li>
              <li>Tekan <b>Install</b> — aplikasi akan muncul di skrin utama</li>
            </ol>
            <p style={{ margin: "12px 0 0", opacity: 0.8 }}>
              Jika butang install tidak muncul, tutup & buka semula halaman ini
              dalam Chrome.
            </p>
          </div>
        )}

        {!showManual && (
          <p style={{ fontSize: 12, opacity: 0.6, marginTop: 16 }}>
            Anda tidak boleh menggunakan aplikasi sebelum install.
          </p>
        )}
      </div>
    </div>
  );
}
