"use client"

import * as React from "react"

/**
 * Minimalist human body silhouette (front view) with a pulsing highlight
 * dot placed on the body area relevant to the active health metric.
 * Also supports a height measuring line for the "height" metric.
 */

const METRIC_POINT: Record<string, { cx: number; cy: number; color: string; labelBM: string; labelEN: string }> = {
  weight: { cx: 100, cy: 148, color: "#0ea5e9", labelBM: "Berat Badan", labelEN: "Body Weight" },
  height: { cx: 100, cy: 96, color: "#6366f1", labelBM: "Ketinggian", labelEN: "Height" },
  bp: { cx: 100, cy: 106, color: "#f43f5e", labelBM: "Jantung", labelEN: "Heart" },
  glucose: { cx: 100, cy: 138, color: "#f59e0b", labelBM: "Perut / Pankreas", labelEN: "Stomach / Pancreas" },
  pulse: { cx: 100, cy: 106, color: "#ec4899", labelBM: "Jantung", labelEN: "Heart" },
  spo2: { cx: 100, cy: 116, color: "#10b981", labelBM: "Paru-paru", labelEN: "Lungs" },
  temperature: { cx: 100, cy: 44, color: "#f97316", labelBM: "Kepala / Dahi", labelEN: "Head / Forehead" },
}

export function BodyFigure({
  metric,
  isBm = true,
  className = "",
}: {
  metric: string
  isBm?: boolean
  className?: string
}) {
  const pt = METRIC_POINT[metric] || METRIC_POINT.weight
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "")
  const isHeight = metric === "height"

  return (
    <div className={className}>
      <svg viewBox="0 0 200 400" width="100%" className="block" role="img" aria-label="Body">
        <defs>
          <linearGradient id={`bodyG${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--card)" />
            <stop offset="100%" stopColor="var(--surface-tint)" />
          </linearGradient>
        </defs>

        {/* Height measuring line (height metric only) */}
        {isHeight && (
          <g>
            <line x1={52} y1={26} x2={52} y2={386} stroke={pt.color} strokeWidth={2} strokeDasharray="5 4" />
            <line x1={44} y1={26} x2={60} y2={26} stroke={pt.color} strokeWidth={2.5} />
            <line x1={44} y1={386} x2={60} y2={386} stroke={pt.color} strokeWidth={2.5} />
            <rect x={8} y={186} rx={7} width={40} height={26} fill={pt.color} opacity={0.92} />
            <text x={28} y={203} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff">
              CM
            </text>
          </g>
        )}

        {/* ── Body silhouette ── */}
        <g fill={`url(#bodyG${uid})`} stroke="var(--border)" strokeWidth={2}>
          {/* Head */}
          <circle cx={100} cy={40} r={26} />
          {/* Neck */}
          <rect x={91} y={62} width={18} height={14} rx={6} />
          {/* Torso */}
          <path d="M 76 76
                   C 60 82, 54 100, 52 128
                   L 50 168
                   C 50 190, 58 210, 66 222
                   L 70 250
                   C 71 262, 76 268, 84 270
                   L 84 296
                   C 84 308, 88 316, 92 322
                   L 92 372
                   C 92 382, 96 388, 100 388
                   C 104 388, 108 382, 108 372
                   L 108 322
                   C 112 316, 116 308, 116 296
                   L 116 270
                   C 124 268, 129 262, 130 250
                   L 134 222
                   C 142 210, 150 190, 150 168
                   L 148 128
                   C 146 100, 140 82, 124 76
                   C 116 72, 84 72, 76 76 Z" />
          {/* Left arm */}
          <path d="M 76 78
                   C 62 84, 56 96, 52 112
                   L 42 160
                   C 40 170, 42 178, 48 180
                   C 54 182, 58 176, 60 168
                   L 68 128
                   L 68 160
                   L 60 200
                   C 58 210, 62 216, 68 216
                   C 74 216, 76 210, 77 202
                   L 84 160
                   Z" />
          {/* Right arm */}
          <path d="M 124 78
                   C 138 84, 144 96, 148 112
                   L 158 160
                   C 160 170, 158 178, 152 180
                   C 146 182, 142 176, 140 168
                   L 132 128
                   L 132 160
                   L 140 200
                   C 142 210, 138 216, 132 216
                   C 126 216, 124 210, 123 202
                   L 116 160
                   Z" />
        </g>

        {/* Highlight pulse dot on the relevant body area (not for height) */}
        {!isHeight && (
          <g>
            <circle cx={pt.cx} cy={pt.cy} r={22} fill={pt.color} opacity={0.18} />
            <circle cx={pt.cx} cy={pt.cy} r={12} fill={pt.color} opacity={0.28}>
              <animate attributeName="r" values="10;16;10" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.28;0.12;0.28" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={pt.cx} cy={pt.cy} r={6} fill={pt.color} />
            <circle cx={pt.cx} cy={pt.cy} r={2.4} fill="#fff" />
          </g>
        )}

        {/* Metric label tag near the point */}
        {!isHeight && (
          <g>
            <rect
              x={116}
              y={pt.cy - 13}
              rx={8}
              width={Math.max(64, (isBm ? pt.labelBM : pt.labelEN).length * 6.4 + 16)}
              height={26}
              fill="var(--text)"
              opacity={0.92}
            />
            <text
              x={116 + Math.max(64, (isBm ? pt.labelBM : pt.labelEN).length * 6.4 + 16) / 2}
              y={pt.cy + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10.5}
              fontWeight={700}
              fill="var(--bg)"
            >
              {isBm ? pt.labelBM : pt.labelEN}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}
