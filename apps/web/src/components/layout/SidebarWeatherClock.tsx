"use client"

import { useEffect, useState, type ReactNode } from "react"

function useNow() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])
  return now
}

type WeatherVariant = "morning" | "noon" | "evening" | "night"

function WeatherGraphic({ variant = "noon" }: { variant?: WeatherVariant }) {
  const isNight = variant === "night"
  const sunColor = variant === "morning" ? "#FBBF24" : variant === "evening" ? "#FB7185" : "#F59E0B"
  const cloudColor = isNight ? "#CBD5E1" : "#F8FAFC"

  return (
    <div aria-hidden="true" className="relative flex h-10 w-10 shrink-0 items-center justify-center">
      <svg viewBox="0 0 48 48" className="relative h-11 w-11">
        {isNight ? (
          <>
            <circle cx="22" cy="22" r="10" fill="#C4B5FD" />
            <circle cx="27" cy="18" r="10" fill="var(--card)" opacity="0.92" />
            <circle cx="12" cy="12" r="1.4" fill="#E0E7FF" className="animate-pulse motion-reduce:animate-none" />
            <circle cx="36" cy="13" r="1.2" fill="#E0E7FF" className="animate-pulse [animation-delay:400ms] motion-reduce:animate-none" />
            <circle cx="34" cy="29" r="1" fill="#E0E7FF" className="animate-pulse [animation-delay:800ms] motion-reduce:animate-none" />
          </>
        ) : (
          <>
            <g className={variant === "evening" ? "origin-center animate-[spin_24s_linear_infinite] motion-reduce:animate-none" : "origin-center animate-[spin_16s_linear_infinite] motion-reduce:animate-none"}>
              {Array.from({ length: 8 }).map((_, i) => (
                <line
                  key={i}
                  x1="24"
                  y1="2.5"
                  x2="24"
                  y2="8"
                  stroke={sunColor}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  transform={`rotate(${i * 45} 24 24)`}
                />
              ))}
            </g>
            <circle cx="24" cy={variant === "evening" ? "27" : "24"} r="9" fill={sunColor} />
          </>
        )}
        <path
          d="M14 40a6 6 0 0 1 0-12 7 7 0 0 1 13-2 5 5 0 0 1 8 4 5 5 0 0 1-1 10Z"
          fill={cloudColor}
          opacity={isNight ? "0.78" : "0.92"}
        />
      </svg>
    </div>
  )
}

function getTimeGreeting(hour: number, lang: "EN" | "BM") {
  if (hour < 5) return { greeting: lang === "BM" ? "Selamat Malam" : "Good Night", variant: "night" as const }
  if (hour < 12) return { greeting: lang === "BM" ? "Selamat Pagi" : "Good Morning", variant: "morning" as const }
  if (hour < 17) return { greeting: lang === "BM" ? "Selamat Tengahari" : "Good Afternoon", variant: "noon" as const }
  if (hour < 19) return { greeting: lang === "BM" ? "Selamat Petang" : "Good Evening", variant: "evening" as const }
  return { greeting: lang === "BM" ? "Selamat Malam" : "Good Night", variant: "night" as const }
}

export function SidebarWeatherClock({ lang = "BM" }: { lang?: "EN" | "BM" }) {
  const now = useNow()

  if (!now) {
    return (
      <div className="flex items-center gap-2.5 px-1.5 py-0.5" aria-hidden="true">
        <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--surface-tint)]" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-1.5 w-16 rounded bg-[var(--surface-tint)]" />
          <div className="h-3 w-20 rounded bg-[var(--surface-tint)]" />
          <div className="h-1.5 w-24 rounded bg-[var(--surface-tint)]" />
        </div>
      </div>
    )
  }

  const time = now.toLocaleTimeString(lang === "BM" ? "ms-MY" : "en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })

  const date = now.toLocaleDateString(lang === "BM" ? "ms-MY" : "en-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  const hour = now.getHours()
  const { greeting, variant } = getTimeGreeting(hour, lang)

  return (
    <div className="flex items-center gap-2.5 px-1.5 py-0.5">
      <WeatherGraphic variant={variant} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.56rem] font-black uppercase tracking-[0.16em] text-[var(--muted)]">
          {greeting}
        </p>
        <p className="mt-1 text-[1rem] font-black tabular-nums leading-none tracking-tight text-[var(--text)]">
          {time}
        </p>
        <p className="mt-1 truncate text-[0.56rem] font-semibold text-[var(--muted)]">{date}</p>
      </div>
    </div>
  )
}

export function WeatherClockMini({
  lang = "BM",
  title,
}: {
  lang?: "EN" | "BM"
  title?: ReactNode
}) {
  void lang
  return <div className="flex min-w-0 items-center gap-3">{title}</div>
}
