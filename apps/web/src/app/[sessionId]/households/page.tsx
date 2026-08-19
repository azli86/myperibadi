"use client"

import React from "react"
import { Users, Construction } from "lucide-react"
import { useLang } from "@/lib/lang"

export default function HouseholdsPage() {
  const { lang } = useLang()

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-20 h-20 rounded-2xl bg-[var(--text)] flex items-center justify-center mb-6">
        <Users size={40} className="text-[var(--text)]" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-3">
        {lang === "BM" ? "Household Legacy" : "Household Legacy"}
      </h1>
      <p className="text-[var(--muted)] max-w-md mb-8">
        {lang === "BM"
          ? "Modul ini tidak lagi digunakan sebagai feature aktif. Data lama dikekalkan sementara untuk keserasian sistem."
          : "This module is no longer used as an active feature. Legacy data is being kept temporarily for system compatibility."}
      </p>
      
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-500 rounded-full text-base font-bold border border-amber-500/20">
        <Construction size={16} />
        {lang === "BM" ? "Legacy / Compatibility" : "Legacy / Compatibility"}
      </div>
    </div>
  )
}
