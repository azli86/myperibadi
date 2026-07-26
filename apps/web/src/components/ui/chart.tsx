"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { cn } from "@/lib/utils"

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>

type ChartContextProps = { config: ChartConfig }

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) throw new Error("useChart must be used within a ChartContainer")
  return context
}

export function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [hasSize, setHasSize] = React.useState(false)

  React.useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const updateSize = () => {
      const rect = node.getBoundingClientRect()
      setHasSize(rect.width > 0 && rect.height > 0)
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={containerRef}
        data-chart={chartId}
        className={cn("flex aspect-video min-h-1 min-w-1 justify-center text-xs", className)}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        {hasSize ? (
          <RechartsPrimitive.ResponsiveContainer minWidth={1} minHeight={1}>
            {children}
          </RechartsPrimitive.ResponsiveContainer>
        ) : null}
      </div>
    </ChartContext.Provider>
  )
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, item]) => item.color)
  if (!colorConfig.length) return null

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: colorConfig
          .map(([key, item]) => `[data-chart=${id}] { --color-${key}: ${item.color}; }`)
          .join("\n"),
      }}
    />
  )
}

export const ChartTooltip = RechartsPrimitive.Tooltip

type ChartTooltipContentProps = {
  active?: boolean
  payload?: Array<{
    dataKey?: string | number
    name?: string | number
    value?: string | number
    color?: string
    payload?: { label?: string }
  }>
  className?: string
  labelFormatter?: (label: string, payload: ChartTooltipContentProps["payload"]) => React.ReactNode
}

export function ChartTooltipContent({
  active,
  payload,
  className,
  labelFormatter,
}: ChartTooltipContentProps) {
  const { config } = useChart()

  if (!active || !payload?.length) return null

  return (
    <div className={cn("grid min-w-[8rem] gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs shadow-xl", className)}>
      {payload[0]?.payload?.label && (
        <div className="font-medium text-[var(--text)]">
          {labelFormatter ? labelFormatter(payload[0].payload.label, payload) : payload[0].payload.label}
        </div>
      )}
      <div className="grid gap-1.5">
        {payload.map((item) => {
          const key = `${item.dataKey || item.name || "value"}`
          const itemConfig = config[key]
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-[var(--muted)]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {itemConfig?.label || item.name}
              </div>
              <div className="font-mono font-medium tabular-nums text-[var(--text)]">
                {typeof item.value === "number" ? item.value.toLocaleString("en-MY") : item.value}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
