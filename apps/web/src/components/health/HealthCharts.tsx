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

/**
 * Spotify-style speedometer BMI gauge (thick rounded arc segments with gaps,
 * saturated colors, scale numbers inside the arc).
 * 4 zones: blue <18.5, green 18.5-24.9, yellow 25-29.9, red >=30.
 */
export function BmiGauge({
  bmi,
  category,
  className = "",
}: {
  bmi: number
  category?: { color: string; label_bm?: string; label_en?: string } | null
  className?: string
}) {
  const MIN = 14
  const MAX = 40
  // [from, to, color]
  const ZONES: Array<[number, number, string]> = [
    [MIN, 18.5, "#00a0f0"],
    [18.5, 25, "#1db954"],
    [25, 30, "#f5c400"],
    [30, MAX, "#fc0000"],
  ]
  const START = -235 // deg
  const SWEEP = 290 // total sweep
  const W = 300
  const H = 252
  const cx = W / 2
  const cy = 138
  const R = 118 // band radius (center of stroke)
  const BW = 21 // band width

  const angleFor = (v: number) => {
    const t = Math.max(0, Math.min(1, (v - MIN) / (MAX - MIN)))
    return START + t * SWEEP
  }
  const polar = (r: number, deg: number) => {
    const rad = (deg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }
  const arcPath = (r: number, a1: number, a2: number) => {
    const p1 = polar(r, a1)
    const p2 = polar(r, a2)
    const large = a2 - a1 > 180 ? 1 : 0
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }

  // Thick rounded segments with gaps between zones
  const GAP_DEG = 2.5
  const zoneEls = ZONES.map(([from, to, color], i) => {
    const a1 = i === 0 ? START : angleFor(from) + GAP_DEG
    const a2 = i === ZONES.length - 1 ? START + SWEEP : angleFor(to) - GAP_DEG
    return (
      <path
        key={i}
        d={arcPath(R, a1, a2)}
        stroke={color}
        strokeWidth={BW}
        fill="none"
        strokeLinecap="round"
        style={{ filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.16))" }}
      />
    )
  })

  // Minor tick marks on the outside edge of the band (subtle)
  const tickEls: React.ReactNode[] = []
  for (let v = MIN; v <= MAX; v += 1) {
    const a = angleFor(v)
    const p1 = polar(R + BW / 2 + 2, a)
    const p2 = polar(R + BW / 2 + 7, a)
    tickEls.push(
      <line
        key={`t${v}`}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="var(--muted)"
        strokeWidth={1}
        opacity={0.4}
      />,
    )
  }

  // Scale numbers INSIDE the arc (like the reference)
  const scaleLabels = [15, 20, 25, 30, 35, 40].map((v) => {
    const p = polar(R - BW / 2 - 18, angleFor(v))
    return (
      <text
        key={`l${v}`}
        x={p.x}
        y={p.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={13}
        fontWeight={800}
        fill="var(--text)"
        opacity={0.85}
      >
        {v}
      </text>
    )
  })

  // Needle: white with dark outline + colored tip, Spotify style
  const needleColor =
    bmi < 18.5 ? "#00a0f0" : bmi < 25 ? "#1db954" : bmi < 30 ? "#f5c400" : "#fc0000"
  const needleAngle = angleFor(Math.max(MIN, Math.min(MAX, bmi)))
  const tip0 = polar(R - 30, START)
  const tail0 = polar(-16, START)
  const catLabel = category?.label_bm || category?.label_en || ""
  const catColor = category?.color === "red" ? "#fc0000" : category?.color === "amber" ? "#f5c400" : category?.color === "amber" ? "#f5c400" : "#1db954"
  // amber maps to the yellow zone color; normal->green; blue handled below
  const catColor2 =
    bmi < 18.5 ? "#00a0f0" : bmi < 25 ? "#1db954" : bmi < 30 ? "#f5c400" : "#fc0000"
  void catColor

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block" role="img" aria-label={`BMI ${bmi}`}>
        {/* Color band */}
        {zoneEls}
        {/* Outer minor ticks */}
        {tickEls}
        {/* Scale numbers inside the band */}
        {scaleLabels}

        {/* Needle group rotated via CSS for animation */}
        <g
          style={{
            transform: `rotate(${needleAngle - START}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: "transform 1000ms cubic-bezier(0.34, 1.25, 0.64, 1)",
          }}
        >
          <line
            x1={tail0.x}
            y1={tail0.y}
            x2={tip0.x}
            y2={tip0.y}
            stroke="var(--text)"
            strokeWidth={5}
            strokeLinecap="round"
          />
          <circle cx={tip0.x} cy={tip0.y} r={4} fill={needleColor} />
        </g>
        {/* Hub */}
        <circle cx={cx} cy={cy} r={11} fill="var(--text)" />
        <circle cx={cx} cy={cy} r={5} fill="var(--card)" />

        {/* Center readout */}
        <text x={cx} y={cy + 62} textAnchor="middle" fontSize={38} fontWeight={900} fill="var(--text)">
          {bmi.toFixed(1)}
        </text>
        <text x={cx} y={cy + 82} textAnchor="middle" fontSize={12} fontWeight={800} letterSpacing={1} fill={catColor2}>
          {catLabel.toUpperCase()}
        </text>
        <text x={cx} y={cy + 97} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--muted)">
          kg/m²
        </text>
      </svg>
    </div>
  )
}


/** Legend for the BMI gauge zones: color + WHO range. */
export function BmiGaugeLegend({ isBm }: { isBm: boolean }) {
  const zones = [
    { color: "#38bdf8", range: "< 18.5", label: isBm ? "Kurus" : "Underweight" },
    { color: "#22c55e", range: "18.5–24.9", label: isBm ? "Normal" : "Normal" },
    { color: "#facc15", range: "25–29.9", label: isBm ? "Berlebihan" : "Overweight" },
    { color: "#ef4444", range: "≥ 30", label: isBm ? "Obes" : "Obese" },
  ]
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {zones.map((z) => (
        <div key={z.range} className="flex items-center gap-1.5 rounded-lg bg-[var(--page-bg)] px-2 py-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: z.color }} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[11px] font-black text-[var(--text)]">{z.label}</div>
            <div className="text-[10px] font-semibold text-[var(--muted)]">BMI {z.range}</div>
          </div>
        </div>
      ))}
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
