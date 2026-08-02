"use client"

import React, { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { TrendingUp, TrendingDown } from "lucide-react"

export type TxnFxKind = "income" | "expense"

type Props = {
  kind: TxnFxKind | null
  onDone?: () => void
  durationMs?: number
}

type Particle = {
  id: number
  x: number
  delay: number
  rot: number
  scale: number
  drift: number
  color: string
}

function MoneyBill({ className, tone }: { className?: string; tone: TxnFxKind }) {
  const income = tone === "income"
  const body = income ? "#059669" : "#475569"
  const face = income ? "#10b981" : "#64748b"
  const edge = income ? "#064e3b" : "#1e293b"
  const mark = income ? "#a7f3d0" : "#cbd5e1"
  const ink = income ? "#064e3b" : "#1e293b"
  return (
    <svg
      className={className}
      width="40"
      height="22"
      viewBox="0 0 44 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="1" y="1" width="42" height="22" rx="3" fill={body} stroke={edge} strokeWidth="1" />
      <rect x="4" y="4" width="36" height="16" rx="2" fill={face} opacity="0.9" />
      <circle cx="22" cy="12" r="6" fill={mark} opacity="0.9" />
      <text
        x="22"
        y="15.5"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill={ink}
        fontFamily="system-ui, sans-serif"
      >
        RM
      </text>
    </svg>
  )
}

function FxBadge({ kind }: { kind: TxnFxKind }) {
  const income = kind === "income"
  return (
    <motion.div
      className="absolute left-1/2 top-[30%] -translate-x-1/2"
      initial={{ opacity: 0, scale: 0.85, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -8 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      <div
        className={
          income
            ? "flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 shadow-lg shadow-emerald-500/10 backdrop-blur-sm"
            : "flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/12 px-4 py-2 shadow-lg shadow-rose-500/10 backdrop-blur-sm"
        }
      >
        {income ? (
          <TrendingUp size={14} className="text-emerald-400" strokeWidth={2.5} />
        ) : (
          <TrendingDown size={14} className="text-rose-400" strokeWidth={2.5} />
        )}
        <span
          className={
            income
              ? "text-[0.8125rem] font-bold tracking-wide text-emerald-400"
              : "text-[0.8125rem] font-bold tracking-wide text-rose-400"
          }
        >
          {income ? "Money In" : "Money Out"}
        </span>
      </div>
    </motion.div>
  )
}

export function detectTxnFx(replyText: string, userText?: string): TxnFxKind | null {
  const reply = (replyText || "").trim()
  if (!reply) return null
  const isDone =
    /\bTXN\d{2}-[A-Z0-9]{6}\b/i.test(reply) ||
    /\*Done\s*\|/i.test(reply) ||
    /Done\s*\|\s*(Record Saved|Rekod Disimpan)/i.test(reply)
  if (!isDone) return null
  // skip pure transfer/debt unless it is a normal saved record
  if (
    /Transfer Berjaya|Transfer Successful|Debt Record|Rekod Hutang/i.test(reply) &&
    !/Rekod Disimpan|Record Saved/i.test(reply)
  ) {
    return null
  }

  const user = (userText || "").trim()
  const blob = `${user}\n${reply}`

  // Explicit category / note rows from bot reply
  const catLine = blob.match(/(?:Kategori|Category)\s*[:：]\s*\*?([^\n*]+)/i)
  const noteLine = blob.match(/(?:Nota|Note)\s*[:：]\s*\*?([^\n*]+)/i)
  const catNote = `${catLine?.[1] || ""} ${noteLine?.[1] || ""} ${user}`

  const incomeHints =
    /\b(gaji|salary|bonus|income|pendapatan|elaun|allowance|commission|komisen|refund|cashback|dividen|dividend|freelance|profit|untung|inflow|masuk)\b/i
  const expenseHints =
    /\b(makan|lunch|dinner|belanja|expense|grab|petrol|minyak|shopping|bayar|bill|sewa|rent|grocery|kedai|outflow|keluar)\b/i

  // Amount sign if present
  if (/(?:Jumlah|Amount)\s*[:：][^\n]*\+\s*RM/i.test(reply)) return "income"
  if (/(?:Jumlah|Amount)\s*[:：][^\n]*-\s*RM/i.test(reply)) return "expense"

  const hasIncome = incomeHints.test(catNote)
  const hasExpense = expenseHints.test(catNote)
  if (hasIncome && !hasExpense) return "income"
  if (hasExpense && !hasIncome) return "expense"
  if (hasIncome) return "income"

  // Default for normal saved records is expense
  if (/Rekod Disimpan|Record Saved/i.test(reply)) return "expense"
  return "expense"
}

export default function TxnFxOverlay({ kind, onDone, durationMs = 2200 }: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!kind) return
    const t = window.setTimeout(() => onDone?.(), durationMs)
    return () => window.clearTimeout(t)
  }, [kind, durationMs, onDone])

  const particles = useMemo(() => {
    if (!kind) return [] as Particle[]
    const count = kind === "income" ? 14 : 10
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: 15 + Math.random() * 70,
      delay: Math.random() * 0.45,
      rot: (Math.random() - 0.5) * 40,
      scale: 0.75 + Math.random() * 0.45,
      drift: (Math.random() - 0.5) * 90,
      color: "",
    }))
  }, [kind])

  if (!mounted || !kind) return null

  return createPortal(
    <AnimatePresence>
      {kind && (
        <div
          className="pointer-events-none fixed inset-0 z-[400] overflow-hidden"
          aria-hidden
        >
          {kind === "income" && (
            <>
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  background:
                    "radial-gradient(circle at 50% 30%, rgba(16,185,129,0.16), transparent 55%)",
                }}
              />
              <FxBadge kind="income" />
              {particles.map((p) => (
                <motion.div
                  key={p.id}
                  className="absolute top-[-8%]"
                  style={{ left: `${p.x}%` }}
                  initial={{ y: "-10vh", opacity: 0, rotate: p.rot * 0.4, scale: p.scale }}
                  animate={{
                    y: "110vh",
                    opacity: [0, 0.9, 0.9, 0],
                    rotate: p.rot,
                    x: p.drift,
                  }}
                  transition={{
                    duration: 2 + Math.random() * 0.5,
                    delay: p.delay,
                    ease: [0.3, 0.6, 0.4, 1],
                  }}
                >
                  <MoneyBill tone="income" />
                </motion.div>
              ))}
            </>
          )}

          {kind === "expense" && (
            <>
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  background:
                    "radial-gradient(circle at 50% 70%, rgba(239,68,68,0.12), transparent 55%)",
                }}
              />
              <FxBadge kind="expense" />
              {particles.map((p) => (
                <motion.div
                  key={p.id}
                  className="absolute"
                  style={{ left: `${p.x}%`, bottom: "8%" }}
                  initial={{
                    y: 0,
                    opacity: 0,
                    rotate: p.rot * 0.4,
                    scale: p.scale * 0.9,
                  }}
                  animate={{
                    y: -Math.min(window.innerHeight * 0.8, 500 + Math.random() * 160),
                    opacity: [0, 0.9, 0.9, 0],
                    rotate: p.rot,
                    x: p.drift,
                    scale: p.scale,
                  }}
                  transition={{
                    duration: 1.7 + Math.random() * 0.5,
                    delay: p.delay,
                    ease: [0.25, 0.7, 0.35, 1],
                  }}
                >
                  <MoneyBill tone="expense" />
                </motion.div>
              ))}
            </>
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
