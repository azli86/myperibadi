import React from "react"
import { cn } from "@/lib/utils"

type SkeletonProps = {
  className?: string
}

function SkeletonLine({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn("skeleton-surface rounded-full", className)} />
}

function SkeletonCircle({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn("skeleton-surface rounded-full", className)} />
}

export function AmountSkeleton({ className }: SkeletonProps) {
  return <span aria-hidden="true" className={cn("skeleton-surface inline-block rounded-full align-middle", className)} />
}

export function DataSkeletonStats({ count = 3, className }: SkeletonProps & { count?: number }) {
  return (
    <div className={cn("grid gap-3 md:grid-cols-3", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="skeleton-panel overflow-hidden rounded-lg border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] p-4">
          <SkeletonLine className="h-2.5 w-20" />
          <SkeletonLine className="mt-4 h-5 w-32" />
          <SkeletonLine className="mt-3 h-2.5 w-24" />
        </div>
      ))}
    </div>
  )
}

export function DataSkeletonCards({ count = 6, className }: SkeletonProps & { count?: number }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="skeleton-panel rounded-lg border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] p-4">
          <div className="flex items-start gap-3">
            <SkeletonCircle className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <SkeletonLine className="h-3 w-3/4" />
              <SkeletonLine className="mt-2 h-2.5 w-1/2" />
            </div>
          </div>
          <SkeletonLine className="mt-5 h-4 w-28" />
          <SkeletonLine className="mt-4 h-2 w-full" />
        </div>
      ))}
    </div>
  )
}

export function DataSkeletonList({ rows = 5, className, compact = false }: SkeletonProps & { rows?: number; compact?: boolean }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton-panel rounded-xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] p-3">
          <div className="flex items-center gap-3">
            <SkeletonCircle className={compact ? "h-8 w-8" : "h-10 w-10"} />
            <div className="min-w-0 flex-1">
              <SkeletonLine className="h-3 w-2/3" />
              <SkeletonLine className="mt-2 h-2.5 w-1/2" />
            </div>
            <SkeletonLine className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DataSkeletonTable({ rows = 6, className }: SkeletonProps & { rows?: number }) {
  return (
    <div className={cn("skeleton-panel overflow-hidden rounded-lg border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)]", className)} aria-hidden="true">
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-[color:var(--skeleton-border)] px-5 py-3">
        <SkeletonLine className="h-2.5 w-24" />
        <SkeletonLine className="h-2.5 w-20" />
        <SkeletonLine className="h-2.5 w-20" />
        <SkeletonLine className="ml-auto h-2.5 w-20" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-4 border-b border-[color:var(--skeleton-border)] px-5 py-3 last:border-b-0">
          <div className="flex items-center gap-3">
            <SkeletonCircle className="h-8 w-8" />
            <div className="min-w-0 flex-1">
              <SkeletonLine className="h-3 w-3/4" />
              <SkeletonLine className="mt-2 h-2.5 w-1/2" />
            </div>
          </div>
          <SkeletonLine className="h-3 w-16" />
          <SkeletonLine className="h-3 w-24" />
          <SkeletonLine className="ml-auto h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

export function DataSkeletonChart({ className }: SkeletonProps) {
  return (
    <div className={cn("skeleton-panel flex h-56 items-end gap-3 rounded-lg border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] p-4", className)} aria-hidden="true">
      {[48, 72, 42, 88, 58, 104, 68, 92, 54, 78, 110, 64].map((height, index) => (
        <div key={index} className="flex flex-1 items-end">
          <div className="skeleton-surface w-full rounded-t-md" style={{ height }} />
        </div>
      ))}
    </div>
  )
}

export function DataSkeletonPanel({ className, rows = 4 }: SkeletonProps & { rows?: number }) {
  return (
    <div className={cn("skeleton-panel rounded-2xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] p-4", className)} aria-hidden="true">
      <SkeletonLine className="h-3 w-28" />
      <SkeletonLine className="mt-4 h-6 w-40" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <SkeletonCircle className="h-8 w-8" />
            <div className="min-w-0 flex-1">
              <SkeletonLine className="h-3 w-3/4" />
              <SkeletonLine className="mt-2 h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DataSkeletonReceipt({ className }: SkeletonProps) {
  return (
    <div className={cn("mx-auto w-full max-w-[430px] rounded-[3px] border border-slate-200 bg-[#fffdf7] px-5 py-6 font-mono md:px-7 md:py-8", className)} aria-hidden="true">
      <SkeletonLine className="mx-auto h-4 w-44 bg-slate-200" />
      <SkeletonLine className="mx-auto mt-3 h-2.5 w-28 bg-slate-200" />
      <div className="my-5 border-t border-dashed border-slate-400" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <SkeletonLine className="h-2.5 w-20 bg-slate-200" />
            <SkeletonLine className="h-2.5 w-28 bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="my-5 border-t border-dashed border-slate-400" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="grid grid-cols-[1fr_44px_92px] gap-2">
            <SkeletonLine className="h-3 w-full bg-slate-200" />
            <SkeletonLine className="h-3 w-7 bg-slate-200" />
            <SkeletonLine className="ml-auto h-3 w-16 bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="my-5 border-t border-dashed border-slate-400" />
      <SkeletonLine className="ml-auto h-4 w-32 bg-slate-200" />
    </div>
  )
}
