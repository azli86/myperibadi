"use client"

import React, { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"

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

function MoneyBill({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="44"
      height="24"
      viewBox="0 0 44 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="1" y="1" width="42" height="22" rx="3" fill="#16a34a" stroke="#14532d" strokeWidth="1.2" />
      <rect x="4" y="4" width="36" height="16" rx="2" fill="#22c55e" opacity="0.85" />
      <circle cx="22" cy="12" r="6" fill="#bbf7d0" opacity="0.95" />
      <text
        x="22"
        y="15.5"
        textAnchor="middle"
        fontSize="9"
        fontWeight="800"
        fill="#14532d"
        fontFamily="system-ui, sans-serif"
      >
        RM
      </text>
      <circle cx="8" cy="12" r="2.2" fill="#86efac" opacity="0.7" />
      <circle cx="36" cy="12" r="2.2" fill="#86efac" opacity="0.7" />
    </svg>
  )
}

function ConfettiPiece({ color }: { color: string }) {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden>
      <rect x="1" y="1" width="8" height="12" rx="1.5" fill={color} />
    </svg>
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
    const colors = ["#22c55e", "#eab308", "#f97316", "#38bdf8", "#a855f7", "#f43f5e", "#14b8a6"]
    const count = kind === "income" ? 36 : 18
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.35,
      rot: (Math.random() - 0.5) * 720,
      scale: 0.7 + Math.random() * 0.7,
      drift: (Math.random() - 0.5) * 120,
      color: colors[i % colors.length],
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
              {/* soft glow */}
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  background:
                    "radial-gradient(circle at 50% 30%, rgba(34,197,94,0.22), transparent 55%)",
                }}
              />
              <motion.div
                className="absolute left-1/2 top-[28%] -translate-x-1/2 text-center"
                initial={{ opacity: 0, scale: 0.6, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                transition={{ type: "spring", stiffness: 320, damping: 18 }}
              >
                <div className="text-4xl drop-shadow-lg">🎉</div>
                <div className="mt-1 text-sm font-black tracking-wide text-emerald-500 drop-shadow">
                  Income!
                </div>
              </motion.div>
              {particles.map((p) => (
                <motion.div
                  key={p.id}
                  className="absolute top-[-8%]"
                  style={{ left: `${p.x}%` }}
                  initial={{ y: "-10vh", opacity: 0, rotate: 0, scale: p.scale }}
                  animate={{
                    y: "110vh",
                    opacity: [0, 1, 1, 0],
                    rotate: p.rot,
                    x: p.drift,
                  }}
                  transition={{
                    duration: 1.8 + Math.random() * 0.6,
                    delay: p.delay,
                    ease: "easeIn",
                  }}
                >
                  {p.id % 5 === 0 ? (
                    <span className="text-lg">✨</span>
                  ) : p.id % 4 === 0 ? (
                    <span className="text-lg">💰</span>
                  ) : (
                    <ConfettiPiece color={p.color} />
                  )}
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
              <motion.div
                className="absolute left-1/2 top-[32%] -translate-x-1/2 text-center"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <div className="text-sm font-black tracking-wide text-rose-500/90 drop-shadow">
                  Money out 💸
                </div>
              </motion.div>
              {particles.map((p) => (
                <motion.div
                  key={p.id}
                  className="absolute"
                  style={{ left: `${20 + (p.x % 60)}%`, bottom: "8%" }}
                  initial={{
                    y: 0,
                    opacity: 0,
                    rotate: 0,
                    scale: p.scale * 0.9,
                  }}
                  animate={{
                    y: -Math.min(window.innerHeight * 0.85, 520 + Math.random() * 180),
                    opacity: [0, 1, 1, 0],
                    rotate: p.rot * 0.6,
                    x: p.drift * 1.4,
                    scale: p.scale,
                  }}
                  transition={{
                    duration: 1.55 + Math.random() * 0.55,
                    delay: p.delay * 0.8,
                    ease: [0.22, 0.8, 0.3, 1],
                  }}
                >
                  <MoneyBill />
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
