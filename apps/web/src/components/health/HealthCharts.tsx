"use client"

import * as React from "react"
import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export const METRIC_HEX: Record<string, string> = {
  weight: "#0ea5e9",
  height: "#6366f1",
  bp: "#f43f5e",
  glucose: "#f59e0b",
  pulse: "#ec4899",
  spo2: "#10b981",
  temperature: "#f97316",
}

export type HealthPoint = { label: string; value?: number; systolic?: number; diastolic?: number }

function useGradientId(prefix: string) {
  return `${prefix}-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`
}

/** Gradient area trend chart (Apple-Health style) using shadcn chart. */
export function HealthAreaChart({
  points,
  color,
  className = "h-44",
}: {
  points: HealthPoint[]
  color: string
  className?: string
}) {
  const gid = useGradientId("ha")
  if (!points.length) return null
  const config: ChartConfig = { value: { label: "", color } }
  return (
    <ChartContainer config={config} className={`${className} w-full`}>
      <AreaChart data={points} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "var(--muted)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "var(--muted)" }}
          width={46}
          domain={["auto", "auto"]}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${gid})`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </AreaChart>
    </ChartContainer>
  )
}

/** Blood-pressure dual gradient chart (SYS + DIA). */
export function HealthBpChart({
  points,
  className = "h-44",
}: {
  points: HealthPoint[]
  className?: string
}) {
  const gid = useGradientId("bp")
  const sys = "#f43f5e"
  const dia = "#0ea5e9"
  if (!points.length) return null
  const config: ChartConfig = {
    systolic: { label: "SYS", color: sys },
    diastolic: { label: "DIA", color: dia },
  }
  return (
    <ChartContainer config={config} className={`${className} w-full`}>
      <AreaChart data={points} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id={`${gid}-s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sys} stopOpacity={0.28} />
            <stop offset="100%" stopColor={sys} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={`${gid}-d`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={dia} stopOpacity={0.28} />
            <stop offset="100%" stopColor={dia} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "var(--muted)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "var(--muted)" }}
          width={46}
          domain={["auto", "auto"]}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="systolic"
          stroke={sys}
          strokeWidth={2.5}
          fill={`url(#${gid}-s)`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
        <Area
          type="monotone"
          dataKey="diastolic"
          stroke={dia}
          strokeWidth={2}
          fill={`url(#${gid}-d)`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </AreaChart>
    </ChartContainer>
  )
}

/** Mini gradient sparkline (no axes). */
export function HealthSparkline({
  points,
  color,
  className = "h-10",
}: {
  points: Array<{ label: string; value: number }>
  color: string
  className?: string
}) {
  const gid = useGradientId("sp")
  const config: ChartConfig = { value: { label: "", color } }
  if (!points.length) return null
  return (
    <ChartContainer config={config} className={`${className} w-full`}>
      <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gid})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}

/** Circular BMI progress ring (Apple-Health style). */
export function BmiRing({ bmi, category }: { bmi: number; category?: { color: string } | null }) {
  const size = 124
  const stroke = 11
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, (bmi - 14) / (40 - 14)))
  const color = category?.color === "red" ? "#ef4444" : category?.color === "amber" ? "#f59e0b" : "#22c55e"
  return (
    <div className="relative h-[124px] w-[124px] shrink-0">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 700ms ease, stroke 300ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[28px] font-black leading-none tracking-tight text-[var(--text)]">{bmi}</span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">BMI</span>
      </div>
    </div>
  )
}

/** Pick the right gradient chart for a metric. */
export function MetricChart({
  metricKey,
  points,
  className,
}: {
  metricKey: string
  points: HealthPoint[]
  className?: string
}) {
  if (metricKey === "bp") return <HealthBpChart points={points} className={className} />
  return <HealthAreaChart points={points} color={METRIC_HEX[metricKey] || "#3b82f6"} className={className} />
}

/** Trend summary chips (latest / min / max / average). */
export function TrendStats({
  values,
  unit,
  isBm,
}: {
  values: number[]
  unit?: string
  isBm: boolean
}) {
  const nums = values.filter((v): v is number => v != null)
  if (nums.length < 2) return null
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length
  const fmt = (n: number) => {
    const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(1)
    return `${s}${unit ? ` ${unit}` : ""}`
  }
  const items = [
    { label: isBm ? "Terendah" : "Min", value: fmt(min) },
    { label: isBm ? "Purata" : "Avg", value: fmt(avg) },
    { label: isBm ? "Tertinggi" : "Max", value: fmt(max) },
  ]
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl bg-[var(--page-bg)] px-2 py-2 text-center">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">{it.label}</div>
          <div className="mt-0.5 truncate text-sm font-black text-[var(--text)]">{it.value}</div>
        </div>
      ))}
    </div>
  )
}
