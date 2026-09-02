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
 * Minimalist semicircular BMI gauge (flat butt-capped segments).
 * 180deg left -> 0deg right, thick color segments with square ends
 * (no rounding), curved category labels inside each segment, small
 * triangular pointer riding on the arc, big BMI readout in the middle.
 */
export function BmiGauge({
  bmi,
  category,
  isBm = true,
  className = "",
}: {
  bmi: number
  category?: { color: string; label_bm?: string; label_en?: string } | null
  isBm?: boolean
  className?: string
}) {
  const MIN = 14
  const MAX = 40
  const ZONES = [
    { from: 14, to: 18.5, color: "#00a0f0", dark: false, label: isBm ? "KURUS" : "UNDERWEIGHT" },
    { from: 18.5, to: 25, color: "#1db954", dark: false, label: isBm ? "NORMAL" : "NORMAL" },
    { from: 25, to: 30, color: "#f5c400", dark: true, label: isBm ? "BERLEBIHAN" : "OVERWEIGHT" },
    { from: 30, to: 40, color: "#fc0000", dark: false, label: isBm ? "OBES" : "OBESE" },
  ]
  // Visual spans (degrees, sum = 180) — balanced so every label fits
  const SPANS = [40, 50, 44, 46]
  const bounds: number[] = [180]
  for (const sp of SPANS) bounds.push(bounds[bounds.length - 1] - sp)

  const W = 324
  const H = 196
  const cx = 162
  const cy = 176
  const R = 130 // band center radius
  const BW = 40 // band thickness

  // Piecewise value -> angle (180 left ... 0 right)
  const angleFor = (v: number) => {
    for (let i = 0; i < ZONES.length; i++) {
      const z = ZONES[i]
      if (v <= z.to || i === ZONES.length - 1) {
        const t = Math.max(0, Math.min(1, (v - z.from) / (z.to - z.from)))
        return bounds[i] - t * SPANS[i]
      }
    }
    return bounds[0]
  }
  const polar = (r: number, deg: number) => {
    const rad = (deg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
  }
  const arcPath = (r: number, a1: number, a2: number) => {
    const p1 = polar(r, a1)
    const p2 = polar(r, a2)
    const large = a1 - a2 > 180 ? 1 : 0
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }

  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "")
  const activeIdx = bmi < 18.5 ? 0 : bmi < 25 ? 1 : bmi < 30 ? 2 : 3
  const activeColor = ZONES[activeIdx].color

  // Flat segments — butt caps, no rounding, no gaps
  const segEls = ZONES.map((z, i) => (
    <path
      key={i}
      d={arcPath(R, bounds[i], bounds[i + 1])}
      stroke={z.color}
      strokeWidth={BW}
      fill="none"
      strokeLinecap="butt"
    />
  ))


  // Category labels curved along each band segment (inside the color)
  const labelEls = ZONES.map((z, i) => {
    const a1 = bounds[i]
    const a2 = bounds[i + 1]
    const spanRad = ((a1 - a2) * Math.PI) / 180
    const avail = R * spanRad * 0.86
    const fs = Math.max(8, Math.min(11, avail / (0.6 * z.label.length)))
    return (
      <g key={`lb${i}`}>
        <path id={`bmizl${uid}${i}`} d={arcPath(R, a1, a2)} fill="none" stroke="none" />
        <text fontSize={fs} fontWeight={800} fill="#ffffff" letterSpacing={0.4}>
          <textPath href={`#bmizl${uid}${i}`} startOffset="50%" textAnchor="middle" dominantBaseline="central">
            {z.label}
          </textPath>
        </text>
      </g>
    )
  })

  // Arrow: starts in the hollow (just inside the band's inner edge), tip
  // extends halfway into the band. Outer part uses var(--text) so it adapts
  // to dark/light page background; the part inside the colored band is
  // overlaid white for contrast on every zone color.
  const theta = angleFor(Math.max(MIN, Math.min(MAX, bmi)))
  const rot = 90 - theta
  const tipR = R // halfway into the band
  const baseR2 = R - BW / 2 - 6 // just inside the band's inner edge
  const triPts = `${cx},${cy - tipR} ${cx - 6},${cy - baseR2} ${cx + 6},${cy - baseR2}`
  // Sub-triangle covering only the band part (inner edge -> tip)
  const innerEdgeR = R - BW / 2
  const spanTotal = tipR - baseR2 // 26
  const spanBand = tipR - innerEdgeR // 20
  const halfW = (6 * spanBand) / spanTotal
  const triBandPts = `${cx},${cy - tipR} ${(cx - halfW).toFixed(2)},${cy - innerEdgeR} ${(cx + halfW).toFixed(2)},${cy - innerEdgeR}`

  const catLabel = (isBm ? category?.label_bm : category?.label_en) || ZONES[activeIdx].label

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block" role="img" aria-label={`BMI ${bmi}`}>
        {/* Color segments (butt caps) */}
        {segEls}
        {/* Curved category labels inside the bands */}
        {labelEls}

        {/* Triangular pointer on the arc */}
        <g
          style={{
            transform: `rotate(${rot}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: "transform 900ms cubic-bezier(0.34, 1.3, 0.64, 1)",
          }}
        >
          <polygon points={triPts} fill="var(--text)" />
          <polygon points={triBandPts} fill="#ffffff" />
        </g>

        {/* Center readout in the empty middle area */}
        <text x={cx} y={cy - 88} textAnchor="middle" fontSize={10} fontWeight={800} letterSpacing={2.5} fill="var(--muted)">
          BMI
        </text>
        <text x={cx} y={cy - 42} textAnchor="middle" fontSize={46} fontWeight={900} fill="var(--text)">
          {bmi.toFixed(1)}
        </text>
        <text x={cx} y={cy - 16} textAnchor="middle" fontSize={13} fontWeight={800} fill={activeColor}>
          {catLabel.toUpperCase()}
        </text>
      </svg>
    </div>
  )
}

/** Legend for the BMI gauge zones: color + WHO range. */
export function BmiGaugeLegend({ isBm }: { isBm: boolean }) {
  const zones = [
    { color: "#00a0f0", range: "< 18.5", label: isBm ? "Kurus" : "Underweight" },
    { color: "#1db954", range: "18.5–24.9", label: isBm ? "Normal" : "Normal" },
    { color: "#f5c400", range: "25–29.9", label: isBm ? "Berlebihan" : "Overweight" },
    { color: "#fc0000", range: "≥ 30", label: isBm ? "Obes" : "Obese" },
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
