"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { getAccessToken } from "@/lib/auth-session"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"

type Lang = "EN" | "BM"
type CatMood = "happy" | "ok" | "hungry" | "critical" | "dead"
type CatSkinId = "amber" | "orange" | "gray" | "black" | "white" | "calico" | "cream" | "lilac"
type HouseSkinId = "violet" | "sky" | "mint" | "rose" | "sunset" | "wood"

type PetState = {
  hunger: number
  happy: number
  lastFedAt: number
  lastSeenAt: number
  totalFeeds: number
  deaths: number
  revives: number
  name: string
  remindersEnabled: boolean
  /** first birth timestamp — used for age */
  bornAt: number
  catSkin: CatSkinId
  houseSkin: HouseSkinId
}

const CAT_SKINS: CatSkinId[] = ["amber", "orange", "gray", "black", "white", "calico", "cream", "lilac"]
const HOUSE_SKINS: HouseSkinId[] = ["violet", "sky", "mint", "rose", "sunset", "wood"]

type CatPalette = {
  body: string
  bodyDark: string
  belly: string
  earIn: string
  nose: string
  mouth: string
  whisker: string
  patch?: string
}

type HousePalette = {
  wall: string
  wallDark: string
  roof: string
  roofDark: string
  roofHi: string
  door: string
  doorIn: string
  doorRim: string
  window: string
  windowFrame: string
  chimney: string
  chimneyTop: string
  mat: string
  heart: string
  star: string
}

const CAT_PALETTES: Record<CatSkinId, CatPalette> = {
  amber: {
    body: "#fbbf24",
    bodyDark: "#f59e0b",
    belly: "#fde68a",
    earIn: "#fb7185",
    nose: "#fb7185",
    mouth: "#78350f",
    whisker: "#78350f",
  },
  orange: {
    body: "#fb923c",
    bodyDark: "#ea580c",
    belly: "#fed7aa",
    earIn: "#f472b6",
    nose: "#f472b6",
    mouth: "#7c2d12",
    whisker: "#7c2d12",
  },
  gray: {
    body: "#a8a29e",
    bodyDark: "#78716c",
    belly: "#e7e5e4",
    earIn: "#fda4af",
    nose: "#fb7185",
    mouth: "#44403c",
    whisker: "#57534e",
  },
  black: {
    body: "#292524",
    bodyDark: "#1c1917",
    belly: "#57534e",
    earIn: "#9f1239",
    nose: "#fb7185",
    mouth: "#a8a29e",
    whisker: "#d6d3d1",
  },
  white: {
    body: "#fafaf9",
    bodyDark: "#d6d3d1",
    belly: "#ffffff",
    earIn: "#fda4af",
    nose: "#fb7185",
    mouth: "#78716c",
    whisker: "#a8a29e",
  },
  calico: {
    body: "#fef3c7",
    bodyDark: "#f59e0b",
    belly: "#fff7ed",
    earIn: "#fb7185",
    nose: "#fb7185",
    mouth: "#78350f",
    whisker: "#78350f",
    patch: "#292524",
  },
  cream: {
    body: "#fde68a",
    bodyDark: "#fbbf24",
    belly: "#fffbeb",
    earIn: "#fda4af",
    nose: "#fb7185",
    mouth: "#92400e",
    whisker: "#a16207",
  },
  lilac: {
    body: "#c4b5fd",
    bodyDark: "#8b5cf6",
    belly: "#ede9fe",
    earIn: "#f9a8d4",
    nose: "#f472b6",
    mouth: "#5b21b6",
    whisker: "#6d28d9",
  },
}

const HOUSE_PALETTES: Record<HouseSkinId, HousePalette> = {
  violet: {
    wall: "#fbbf24",
    wallDark: "#f59e0b",
    roof: "#a78bfa",
    roofDark: "#7c3aed",
    roofHi: "#c4b5fd",
    door: "#1e1b4b",
    doorIn: "#312e81",
    doorRim: "#fde68a",
    window: "#93c5fd",
    windowFrame: "#1d4ed8",
    chimney: "#c4b5fd",
    chimneyTop: "#8b5cf6",
    mat: "#f472b6",
    heart: "#fb7185",
    star: "#fde68a",
  },
  sky: {
    wall: "#bae6fd",
    wallDark: "#38bdf8",
    roof: "#0ea5e9",
    roofDark: "#0369a1",
    roofHi: "#7dd3fc",
    door: "#0c4a6e",
    doorIn: "#075985",
    doorRim: "#e0f2fe",
    window: "#fef9c3",
    windowFrame: "#0369a1",
    chimney: "#7dd3fc",
    chimneyTop: "#0284c7",
    mat: "#38bdf8",
    heart: "#f472b6",
    star: "#fef08a",
  },
  mint: {
    wall: "#bbf7d0",
    wallDark: "#4ade80",
    roof: "#34d399",
    roofDark: "#059669",
    roofHi: "#6ee7b7",
    door: "#064e3b",
    doorIn: "#065f46",
    doorRim: "#d1fae5",
    window: "#fef3c7",
    windowFrame: "#047857",
    chimney: "#6ee7b7",
    chimneyTop: "#10b981",
    mat: "#34d399",
    heart: "#fb7185",
    star: "#fde68a",
  },
  rose: {
    wall: "#fecdd3",
    wallDark: "#fb7185",
    roof: "#f472b6",
    roofDark: "#be185d",
    roofHi: "#f9a8d4",
    door: "#831843",
    doorIn: "#9d174d",
    doorRim: "#ffe4e6",
    window: "#fef9c3",
    windowFrame: "#be185d",
    chimney: "#f9a8d4",
    chimneyTop: "#ec4899",
    mat: "#fb7185",
    heart: "#e11d48",
    star: "#fde68a",
  },
  sunset: {
    wall: "#fdba74",
    wallDark: "#f97316",
    roof: "#f43f5e",
    roofDark: "#be123c",
    roofHi: "#fb7185",
    door: "#7c2d12",
    doorIn: "#9a3412",
    doorRim: "#ffedd5",
    window: "#fef08a",
    windowFrame: "#c2410c",
    chimney: "#fb923c",
    chimneyTop: "#ea580c",
    mat: "#f97316",
    heart: "#e11d48",
    star: "#fde68a",
  },
  wood: {
    wall: "#d6d3d1",
    wallDark: "#a8a29e",
    roof: "#78716c",
    roofDark: "#44403c",
    roofHi: "#a8a29e",
    door: "#292524",
    doorIn: "#44403c",
    doorRim: "#e7e5e4",
    window: "#bae6fd",
    windowFrame: "#57534e",
    chimney: "#a8a29e",
    chimneyTop: "#57534e",
    mat: "#a3e635",
    heart: "#fb7185",
    star: "#fde68a",
  },
}

function isCatSkin(v: unknown): v is CatSkinId {
  return typeof v === "string" && (CAT_SKINS as string[]).includes(v)
}

function isHouseSkin(v: unknown): v is HouseSkinId {
  return typeof v === "string" && (HOUSE_SKINS as string[]).includes(v)
}

/** 48 hours from last full feed → empty / death */
const HUNGER_FULL_MS = 48 * 60 * 60 * 1000
/** Happy empties a bit faster — need play to keep up */
const HAPPY_FULL_MS = 36 * 60 * 60 * 1000
const FEED_HAPPY_GAIN = 18
const PLAY_HAPPY_GAIN = 28
const STORAGE_PREFIX = "bdp-cat-playground-v1"
const REMIND_COOLDOWN_MS = 6 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function storageKey(userKey: string) {
  return `${STORAGE_PREFIX}:${userKey || "guest"}`
}

function remindKey(userKey: string) {
  return `${STORAGE_PREFIX}:remind-at:${userKey || "guest"}`
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n))
}

function defaultState(): PetState {
  const now = Date.now()
  return {
    hunger: 100,
    happy: 100,
    lastFedAt: now,
    lastSeenAt: now,
    totalFeeds: 0,
    deaths: 0,
    revives: 0,
    name: "Mimi",
    remindersEnabled: true,
    bornAt: now,
    catSkin: "amber",
    houseSkin: "violet",
  }
}

function normalizeState(raw: Partial<PetState> | null | undefined): PetState {
  const d = defaultState()
  if (!raw) return d
  const lastFedAt = Number(raw.lastFedAt || d.lastFedAt) || d.lastFedAt
  const lastSeenAt = Number(raw.lastSeenAt || d.lastSeenAt) || d.lastSeenAt
  // prefer explicit bornAt; else earliest known timestamp so old pets get a sensible age
  const bornCandidate = Number(raw.bornAt || 0)
  const bornAt =
    bornCandidate > 0
      ? bornCandidate
      : Math.min(lastFedAt || d.bornAt, lastSeenAt || d.bornAt, d.bornAt)
  return {
    hunger: clamp(Number(raw.hunger ?? d.hunger)),
    happy: clamp(Number(raw.happy ?? d.happy)),
    lastFedAt,
    lastSeenAt,
    totalFeeds: Math.max(0, Math.floor(Number(raw.totalFeeds || 0))),
    deaths: Math.max(0, Math.floor(Number(raw.deaths || 0))),
    revives: Math.max(0, Math.floor(Number(raw.revives || 0))),
    name: String(raw.name || d.name).trim().slice(0, 24) || d.name,
    remindersEnabled: raw.remindersEnabled !== false,
    bornAt,
    catSkin: isCatSkin(raw.catSkin) ? raw.catSkin : d.catSkin,
    houseSkin: isHouseSkin(raw.houseSkin) ? raw.houseSkin : d.houseSkin,
  }
}

function loadLocal(userKey: string): PetState {
  if (typeof window === "undefined") return defaultState()
  try {
    const raw = localStorage.getItem(storageKey(userKey))
    if (!raw) return defaultState()
    return normalizeState(JSON.parse(raw) as Partial<PetState>)
  } catch {
    return defaultState()
  }
}

function saveLocal(userKey: string, state: PetState) {
  try {
    localStorage.setItem(storageKey(userKey), JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

/**
 * Pure derive of live hunger/happy from timestamps.
 * Idempotent for the same (state, now) — safe to call repeatedly without double-decay.
 * Does NOT advance lastSeenAt (that caused dual-instance feed races).
 */
function applyDecay(state: PetState, now = Date.now()): PetState {
  const fedAt = Number(state.lastFedAt || 0) || Number(state.lastSeenAt || 0) || now
  const seenAt = Number(state.lastSeenAt || 0) || fedAt
  const hungerElapsed = Math.max(0, now - fedAt)
  const happyElapsed = Math.max(0, now - seenAt)
  const hunger = clamp(100 - (hungerElapsed / HUNGER_FULL_MS) * 100)
  const happyMul = hunger < 40 || hunger <= 0 ? 1.35 : 1
  const happyLoss = (happyElapsed / HAPPY_FULL_MS) * 100 * happyMul
  return {
    ...state,
    hunger,
    happy: clamp(Number(state.happy || 0) - happyLoss),
  }
}

/** Snapshot decayed stats and mark lastSeenAt=now (for intentional saves only). */
function touchSeen(state: PetState, now = Date.now()): PetState {
  const decayed = applyDecay(state, now)
  return { ...decayed, lastSeenAt: now }
}

function freshness(state: PetState) {
  return Math.max(Number(state.lastFedAt || 0), Number(state.lastSeenAt || 0))
}

/** Merge local + remote without letting a stale feed overwrite a newer one. */
function mergeStates(a: PetState, b: PetState): PetState {
  const aFed = Number(a.lastFedAt || 0)
  const bFed = Number(b.lastFedAt || 0)
  // Life/hunger clock always follows the most recent feed.
  const feedWinner = aFed >= bFed ? a : b
  // Cosmetics / name follow whichever side was touched more recently.
  const touchWinner = freshness(a) >= freshness(b) ? a : b
  const bornAt = Math.min(
    a.bornAt > 0 ? a.bornAt : Number.POSITIVE_INFINITY,
    b.bornAt > 0 ? b.bornAt : Number.POSITIVE_INFINITY,
    feedWinner.bornAt || Date.now(),
  )
  return {
    ...feedWinner,
    lastFedAt: Math.max(aFed, bFed),
    lastSeenAt: Math.max(Number(a.lastSeenAt || 0), Number(b.lastSeenAt || 0)),
    name: touchWinner.name || feedWinner.name,
    remindersEnabled: touchWinner.remindersEnabled,
    catSkin: touchWinner.catSkin || feedWinner.catSkin,
    houseSkin: touchWinner.houseSkin || feedWinner.houseSkin,
    bornAt: Number.isFinite(bornAt) ? bornAt : feedWinner.bornAt,
    totalFeeds: Math.max(a.totalFeeds, b.totalFeeds),
    deaths: Math.max(a.deaths, b.deaths),
    revives: Math.max(a.revives, b.revives),
  }
}

function moodFromStats(hunger: number, happy: number): CatMood {
  if (hunger <= 0) return "dead"
  if (hunger < 25) return "critical"
  if (hunger < 50) return "hungry"
  // full enough food, but mood from happy
  if (happy < 30) return "hungry" // sulking
  if (happy < 55 || hunger < 75) return "ok"
  if (happy >= 75 && hunger >= 75) return "happy"
  return "ok"
}

function formatCountdown(ms: number, lang: Lang) {
  const totalMin = Math.max(0, Math.ceil(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (lang === "BM") {
    if (h <= 0) return `${m} min lagi`
    if (h >= 48) return `${Math.floor(h / 24)}h ${h % 24}j lagi`
    return `${h}j ${m}m lagi`
  }
  if (h <= 0) return `${m}m left`
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h left`
  return `${h}h ${m}m left`
}

function formatAge(bornAt: number, now: number, lang: Lang) {
  const ms = Math.max(0, now - (bornAt || now))
  const totalMins = Math.max(0, Math.floor(ms / 60000))
  const totalHours = Math.floor(totalMins / 60)
  const totalDays = Math.floor(totalMins / (60 * 24))
  const totalYears = Math.floor(totalMins / (60 * 24 * 365))

  // Progressive unit: show the biggest sensible whole unit only
  // e.g. 20 minit, 20 jam, 20 hari, 2 tahun
  if (lang === "BM") {
    if (totalYears >= 1) return `${totalYears} tahun`
    if (totalDays >= 1) return `${totalDays} hari`
    if (totalHours >= 1) return `${totalHours} jam`
    return `${Math.max(1, totalMins)} minit`
  }
  if (totalYears >= 1) return `${totalYears} ${totalYears === 1 ? "year" : "years"}`
  if (totalDays >= 1) return `${totalDays} ${totalDays === 1 ? "day" : "days"}`
  if (totalHours >= 1) return `${totalHours} ${totalHours === 1 ? "hour" : "hours"}`
  return `${Math.max(1, totalMins)} ${Math.max(1, totalMins) === 1 ? "min" : "mins"}`
}

function ageStage(bornAt: number, now: number, lang: Lang) {
  const days = Math.floor(Math.max(0, now - (bornAt || now)) / DAY_MS)
  if (lang === "BM") {
    if (days < 1) return "anak kucing"
    if (days < 7) return "kitten"
    if (days < 30) return "remaja"
    return "dewasa"
  }
  if (days < 1) return "newborn"
  if (days < 7) return "kitten"
  if (days < 30) return "teen"
  return "adult"
}

async function apiGetPet(): Promise<PetState | null> {
  try {
    const token = getAccessToken()
    const res = await fetch("/api/users/me/cat-pet", {
      credentials: "include",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { pet?: Partial<PetState> | null }
    if (!data?.pet) return null
    return normalizeState(data.pet)
  } catch {
    return null
  }
}

async function apiPutPet(pet: PetState): Promise<void> {
  try {
    const token = getAccessToken()
    await fetch("/api/users/me/cat-pet", {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ pet }),
    })
  } catch {
    /* offline ok */
  }
}

function SkeletonCatSvg({ size = 72, facing = 1 }: { size?: number; facing?: 1 | -1 }) {
  return (
    <svg
      viewBox="0 0 72 70"
      width={size}
      height={Math.round(size * (70 / 72))}
      fill="none"
      className="drop-shadow-[0_3px_6px_rgba(15,23,42,0.28)] opacity-95"
      style={{ transform: `scaleX(${facing})` }}
      aria-hidden
    >
      <ellipse cx="36" cy="64.5" rx="14" ry="2.6" fill="#0f172a" opacity="0.14" />
      <ellipse cx="34" cy="22" rx="12" ry="11" fill="#e8e6e1" stroke="#a8a29e" strokeWidth="1.2" />
      <ellipse cx="29" cy="21" rx="3.2" ry="3.6" fill="#1c1917" />
      <ellipse cx="39" cy="21" rx="3.2" ry="3.6" fill="#1c1917" />
      <path d="M34 25.5c-1.2 0-2 .9-2 1.5s.9 1.1 2 1.1 2-.5 2-1.1-.8-1.5-2-1.5Z" fill="#44403c" />
      <path d="M30 30h2v2.5h-2zM33 30h2v2.5h-2zM36 30h2v2.5h-2z" fill="#fafaf9" stroke="#a8a29e" strokeWidth="0.4" />
      <path d="M28 14l2 3M40 13l-1.5 3.5" stroke="#a8a29e" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M34 33v18" stroke="#d6d3d1" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="34" cy="36" r="2" fill="#e7e5e4" stroke="#a8a29e" strokeWidth="0.8" />
      <circle cx="34" cy="41" r="2" fill="#e7e5e4" stroke="#a8a29e" strokeWidth="0.8" />
      <circle cx="34" cy="46" r="2" fill="#e7e5e4" stroke="#a8a29e" strokeWidth="0.8" />
      <circle cx="34" cy="51" r="2" fill="#e7e5e4" stroke="#a8a29e" strokeWidth="0.8" />
      <path d="M34 37c-6 1-10 3-11 6" stroke="#d6d3d1" strokeWidth="2" strokeLinecap="round" />
      <path d="M34 37c6 1 10 3 11 6" stroke="#d6d3d1" strokeWidth="2" strokeLinecap="round" />
      <path d="M34 42c-6 1-9 2.5-10 5" stroke="#d6d3d1" strokeWidth="2" strokeLinecap="round" />
      <path d="M34 42c6 1 9 2.5 10 5" stroke="#d6d3d1" strokeWidth="2" strokeLinecap="round" />
      <path d="M34 47c-5 .8-8 2-9 4" stroke="#d6d3d1" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M34 47c5 .8 8 2 9 4" stroke="#d6d3d1" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M34 38 L22 48" stroke="#e7e5e4" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M22 48 L18 54" stroke="#e7e5e4" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M34 38 L46 48" stroke="#e7e5e4" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M46 48 L50 54" stroke="#e7e5e4" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="22" cy="48" r="1.6" fill="#a8a29e" />
      <circle cx="46" cy="48" r="1.6" fill="#a8a29e" />
      <path d="M32 52 L28 61" stroke="#e7e5e4" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M36 52 L40 61" stroke="#e7e5e4" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="28" cy="61" r="1.7" fill="#a8a29e" />
      <circle cx="40" cy="61" r="1.7" fill="#a8a29e" />
      <path d="M34 50c6 1 10-1 12-5 1.2-2.4.4-5-1.5-6" stroke="#d6d3d1" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <circle cx="45.5" cy="40" r="1.5" fill="#a8a29e" />
      <circle cx="52" cy="16" r="1.1" fill="#a8a29e" opacity="0.55" />
      <circle cx="56" cy="22" r="0.8" fill="#a8a29e" opacity="0.4" />
      <circle cx="18" cy="18" r="0.9" fill="#a8a29e" opacity="0.45" />
    </svg>
  )
}

function CatSvg({
  mood,
  size = 72,
  facing = 1,
  sleeping = false,
  skin = "amber",
}: {
  mood: CatMood
  size?: number
  facing?: 1 | -1
  sleeping?: boolean
  skin?: CatSkinId
}) {
  const isDead = mood === "dead"
  if (isDead) {
    return <SkeletonCatSvg size={size} facing={facing} />
  }

  const isCritical = mood === "critical"
  const isHungry = mood === "hungry"
  const isSleeping = sleeping && !isCritical
  const pal = CAT_PALETTES[skin] || CAT_PALETTES.amber
  const body = isCritical ? "#d6d3d1" : pal.body
  const bodyDark = isCritical ? "#a8a29e" : pal.bodyDark
  const belly = isCritical ? "#e7e5e4" : pal.belly
  const earIn = pal.earIn
  const nose = pal.nose
  const mouth = pal.mouth
  const whisker = pal.whisker

  return (
    <svg
      viewBox="0 0 72 70"
      width={size}
      height={Math.round(size * (70 / 72))}
      fill="none"
      className={cn(
        "drop-shadow-[0_3px_6px_rgba(15,23,42,0.28)]",
        isSleeping && "catpg-sleep-breathe",
      )}
      style={{ transform: `scaleX(${facing})` }}
      aria-hidden
    >
      <ellipse cx="36" cy="64.5" rx="16" ry="3.2" fill="#0f172a" opacity="0.16" />
      <g className={isSleeping ? "catpg-tail-sleep" : "catpg-tail"}>
        <path d="M50 42c8 2 14-2 16-10 1.2-4.8-1.5-9.5-5.5-10.5" stroke={bodyDark} strokeWidth="5.5" strokeLinecap="round" />
        <path d="M50 42c8 2 14-2 16-10 1.2-4.8-1.5-9.5-5.5-10.5" stroke={body} strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="61.2" cy="22.5" r="3.2" fill={bodyDark} />
      </g>
      <ellipse cx="34" cy="48" rx="17" ry="14.5" fill={body} />
      {pal.patch && !isCritical ? (
        <>
          <ellipse cx="26" cy="44" rx="5" ry="4.2" fill={pal.patch} opacity="0.85" />
          <ellipse cx="42" cy="50" rx="4.2" ry="3.6" fill={bodyDark} opacity="0.75" />
        </>
      ) : null}
      <ellipse cx="34" cy="50" rx="10" ry="9" fill={belly} />
      <ellipse cx="24" cy="58" rx="5.5" ry="4" fill={bodyDark} />
      <ellipse cx="44" cy="58" rx="5.5" ry="4" fill={bodyDark} />
      <ellipse cx="27" cy="54" rx="4.2" ry="6" fill={body} />
      <ellipse cx="41" cy="54" rx="4.2" ry="6" fill={body} />
      <ellipse cx="27" cy="57.5" rx="3" ry="2.2" fill={bodyDark} />
      <ellipse cx="41" cy="57.5" rx="3" ry="2.2" fill={bodyDark} />
      <g className={isSleeping ? "catpg-head-sleep" : "catpg-head"}>
        <path d="M20 22 L24 8 L31 20 Z" fill={body} />
        <path d="M22.2 20.5 L24.3 11.5 L28.5 19.5 Z" fill={earIn} opacity="0.85" />
        <path d="M48 22 L44 8 L37 20 Z" fill={body} />
        <path d="M45.8 20.5 L43.7 11.5 L39.5 19.5 Z" fill={earIn} opacity="0.85" />
        <ellipse cx="34" cy="28" rx="15.5" ry="13.5" fill={body} />
        {pal.patch && !isCritical ? (
          <ellipse cx="42" cy="24" rx="5.5" ry="5" fill={pal.patch} opacity="0.9" />
        ) : null}
        <ellipse cx="21.5" cy="31" rx="4" ry="3.2" fill={belly} />
        <ellipse cx="46.5" cy="31" rx="4" ry="3.2" fill={belly} />
        <g className={isSleeping ? undefined : "catpg-eyes"}>
          {isSleeping ? (
            <>
              <path d="M24 28c2.2 2.4 5.2 2.4 7.2 0" stroke="#18181b" strokeWidth="1.9" strokeLinecap="round" fill="none" />
              <path d="M37 28c2.2 2.4 5.2 2.4 7.2 0" stroke="#18181b" strokeWidth="1.9" strokeLinecap="round" fill="none" />
            </>
          ) : isCritical || isHungry ? (
            <>
              <path d="M24 28c2-3 5-3 7 0" stroke="#18181b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
              <path d="M37 28c2-3 5-3 7 0" stroke="#18181b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              <ellipse cx="27.5" cy="27" rx="3.4" ry="4.2" fill="#18181b" />
              <ellipse cx="40.5" cy="27" rx="3.4" ry="4.2" fill="#18181b" />
              <circle cx="28.6" cy="25.6" r="1.15" fill="#fff" />
              <circle cx="41.6" cy="25.6" r="1.15" fill="#fff" />
            </>
          )}
        </g>
        <path d="M34 31.2c-1.3 0-2.2 1-2.2 1.6 0 .7.9 1.2 2.2 1.2s2.2-.5 2.2-1.2c0-.6-.9-1.6-2.2-1.6Z" fill={nose} />
        {isSleeping ? (
          <path d="M30 36.5c1.3 1.4 6.7 1.4 8 0" stroke={mouth} strokeWidth="1.1" strokeLinecap="round" opacity="0.5" />
        ) : mood === "happy" ? (
          <path d="M30 36c1.3 2.2 6.7 2.2 8 0" stroke={mouth} strokeWidth="1.1" strokeLinecap="round" opacity="0.65" />
        ) : isCritical ? (
          <path d="M30 37c1.8-1.4 6.2-1.4 8 0" stroke={mouth} strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
        ) : (
          <>
            <path d="M34 33.8v2.2" stroke={mouth} strokeWidth="0.9" strokeLinecap="round" opacity="0.55" />
            <path d="M34 35.6c-1.6 1.4-3.4 1.3-4.2.4" stroke={mouth} strokeWidth="0.95" strokeLinecap="round" opacity="0.55" />
            <path d="M34 35.6c1.6 1.4 3.4 1.3 4.2.4" stroke={mouth} strokeWidth="0.95" strokeLinecap="round" opacity="0.55" />
          </>
        )}
        <path d="M12 29h9.5M12 32.5h9M13 36h8" stroke={whisker} strokeWidth="0.85" strokeLinecap="round" opacity="0.4" />
        <path d="M46.5 29H56M47 32.5h9M47.5 36h8" stroke={whisker} strokeWidth="0.85" strokeLinecap="round" opacity="0.4" />
      </g>
      {isSleeping && (
        <g className="catpg-zzz" fill="#7c3aed" opacity="0.85">
          <text x="52" y="14" fontSize="7" fontWeight="800" fontFamily="system-ui,sans-serif">z</text>
          <text x="57" y="9" fontSize="9" fontWeight="800" fontFamily="system-ui,sans-serif">z</text>
          <text x="63" y="4" fontSize="11" fontWeight="800" fontFamily="system-ui,sans-serif">Z</text>
        </g>
      )}
    </svg>
  )
}

function TreeSvg({
  size = 40,
  variant = 0,
}: {
  size?: number
  variant?: 0 | 1 | 2
}) {
  const h = Math.round(size * 1.15)
  const trunk = variant === 1 ? "#78716c" : variant === 2 ? "#57534e" : "#44403c"
  const leafA = variant === 1 ? "#a8a29e" : variant === 2 ? "#d6d3d1" : "#a3a3a3"
  const leafB = variant === 1 ? "#737373" : variant === 2 ? "#8a8a8a" : "#6b6b6b"
  return (
    <svg viewBox="0 0 40 48" width={size} height={h} fill="none" aria-hidden className="drop-shadow-[0_2px_3px_rgba(15,23,42,0.18)]">
      <ellipse cx="20" cy="45" rx="10" ry="2.2" fill="#0f172a" opacity="0.12" />
      <rect x="17.5" y="30" width="5" height="14" rx="1.5" fill={trunk} />
      {variant === 2 ? (
        <>
          <ellipse cx="20" cy="22" rx="13" ry="11" fill={leafA} />
          <ellipse cx="14" cy="18" rx="7" ry="6" fill={leafB} opacity="0.85" />
          <ellipse cx="26" cy="17" rx="6.5" ry="5.5" fill={leafB} opacity="0.75" />
        </>
      ) : variant === 1 ? (
        <>
          <path d="M20 6 L32 28 H8 Z" fill={leafA} />
          <path d="M20 12 L29 30 H11 Z" fill={leafB} opacity="0.85" />
        </>
      ) : (
        <>
          <circle cx="20" cy="16" r="11" fill={leafA} />
          <circle cx="13" cy="20" r="7" fill={leafB} opacity="0.8" />
          <circle cx="27" cy="19" r="6.5" fill={leafB} opacity="0.7" />
          <circle cx="20" cy="10" r="6" fill={leafA} />
        </>
      )}
      <circle cx={variant === 1 ? 17 : 24} cy={variant === 1 ? 18 : 14} r="1.2" fill="#e5e5e5" opacity="0.9" />
      <circle cx={variant === 1 ? 23 : 15} cy={variant === 1 ? 22 : 18} r="1" fill="#d4d4d4" opacity="0.85" />
    </svg>
  )
}

function BushSvg({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 36 22" width={size} height={Math.round(size * 0.62)} fill="none" aria-hidden>
      <ellipse cx="18" cy="19" rx="12" ry="2" fill="#0f172a" opacity="0.1" />
      <ellipse cx="12" cy="13" rx="8" ry="7" fill="#a3a3a3" />
      <ellipse cx="22" cy="12" rx="9" ry="8" fill="#8a8a8a" />
      <ellipse cx="18" cy="14" rx="7" ry="6" fill="#737373" opacity="0.85" />
      <circle cx="10" cy="12" r="1.1" fill="#e5e5e5" opacity="0.8" />
      <circle cx="25" cy="11" r="1" fill="#d4d4d4" opacity="0.75" />
    </svg>
  )
}

function FlowerSvg({ size = 14, hue = 0 }: { size?: number; hue?: 0 | 1 | 2 }) {
  const petal = hue === 1 ? "#d4d4d4" : hue === 2 ? "#e5e5e5" : "#c4c4c4"
  const center = hue === 1 ? "#737373" : hue === 2 ? "#525252" : "#8a8a8a"
  return (
    <svg viewBox="0 0 16 18" width={size} height={Math.round(size * 1.12)} fill="none" aria-hidden>
      <rect x="7" y="9" width="2" height="8" rx="1" fill="#737373" />
      <circle cx="8" cy="5" r="2.2" fill={petal} />
      <circle cx="5.2" cy="7" r="2" fill={petal} />
      <circle cx="10.8" cy="7" r="2" fill={petal} />
      <circle cx="6.2" cy="3.4" r="1.8" fill={petal} opacity="0.9" />
      <circle cx="9.8" cy="3.4" r="1.8" fill={petal} opacity="0.9" />
      <circle cx="8" cy="5.4" r="1.4" fill={center} />
    </svg>
  )
}

function CatHouseSvg({ size = 88, skin = "violet" }: { size?: number; skin?: HouseSkinId }) {
  const h = Math.round(size * 0.92)
  const p = HOUSE_PALETTES[skin] || HOUSE_PALETTES.violet
  return (
    <svg
      viewBox="0 0 96 88"
      width={size}
      height={h}
      fill="none"
      className="drop-shadow-[0_3px_6px_rgba(15,23,42,0.22)]"
      aria-hidden
    >
      <ellipse cx="48" cy="82" rx="30" ry="4" fill="#0f172a" opacity="0.12" />
      <path
        d="M14 40 L48 12 L82 40 V76 H14 V40Z"
        fill={p.wall}
        stroke={p.wallDark}
        strokeWidth="1.5"
      />
      <path
        d="M10 42 L48 10 L86 42 L78 42 L48 18 L18 42Z"
        fill={p.roof}
        stroke={p.roofDark}
        strokeWidth="1.4"
      />
      <path d="M48 14 L78 40" stroke={p.roofHi} strokeWidth="1.2" opacity="0.7" />
      <path d="M82 40 V76 H70 V48Z" fill={p.wallDark} opacity="0.55" />
      <path
        d="M36 76 V52 c0-8 5.5-13 12-13 s12 5 12 13 V76"
        fill={p.door}
        opacity="0.85"
      />
      <path
        d="M38 76 V53 c0-6.5 4.5-10.5 10-10.5 s10 4 10 10.5 V76"
        fill={p.doorIn}
        opacity="0.5"
      />
      <path
        d="M36 76 V52 c0-8 5.5-13 12-13 s12 5 12 13 V76"
        stroke={p.doorRim}
        strokeWidth="1.4"
        fill="none"
      />
      <rect x="62" y="48" width="12" height="12" rx="2" fill={p.window} stroke={p.windowFrame} strokeWidth="1.1" />
      <path d="M68 48 V60 M62 54 H74" stroke={p.windowFrame} strokeWidth="0.9" opacity="0.7" />
      <rect x="64" y="18" width="9" height="16" rx="1.5" fill={p.chimney} stroke={p.roofDark} strokeWidth="1" />
      <rect x="62" y="16" width="13" height="4" rx="1.2" fill={p.chimneyTop} />
      <rect x="34" y="76" width="28" height="3.5" rx="1" fill={p.mat} opacity="0.85" />
      <path
        d="M48 46c-1.4-2.6-5-2.2-5.6.6-.5 2.4 2.2 4.4 5.6 7 3.4-2.6 6.1-4.6 5.6-7-.6-2.8-4.2-3.2-5.6-.6Z"
        fill={p.heart}
        opacity="0.9"
      />
      <circle cx="22" cy="28" r="1.2" fill={p.star} opacity="0.8" />
      <circle cx="74" cy="30" r="1" fill={p.star} opacity="0.65" />
    </svg>
  )
}

type CatPlaygroundProps = {
  lang: Lang
  userKey: string
  className?: string
  compact?: boolean
  /** Stack feed button under action icons (desktop right rail). */
  stackFeed?: boolean
  /**
   * card = full playground block (legacy)
   * chip = slim dashboard row; full playground opens in a sheet
   */
  presentation?: "card" | "chip"
}

export function CatPlayground({
  lang,
  userKey,
  className,
  compact = false,
  stackFeed = false,
  presentation = "card",
}: CatPlaygroundProps) {
  const [state, setState] = useState<PetState>(() => defaultState())
  const [hydrated, setHydrated] = useState(false)
  const [feedFlash, setFeedFlash] = useState(false)
  const [playFlash, setPlayFlash] = useState(false)
  const [now, setNow] = useState(0)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("Mimi")
  const [syncLabel, setSyncLabel] = useState<"idle" | "syncing" | "ok">("idle")
  const [isSleeping, setIsSleeping] = useState(true)
  const [wakeFlash, setWakeFlash] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const persistTimer = useRef<number | null>(null)
  const sleepTimer = useRef<number | null>(null)
  const SLEEP_IDLE_MS = 10_000
  const closeSheet = useCallback(() => setSheetOpen(false), [])
  const { requestClose: requestSheetClose } = useOverlayBackClose({ id: "cat-playground", isOpen: sheetOpen, onClose: closeSheet })
  const sheetSwipe = useSwipeDownToClose(requestSheetClose)

  const commitState = useCallback(
    (updater: (prev: PetState) => PetState, opts?: { sync?: boolean }) => {
      let nextState: PetState | null = null
      setState((prev) => {
        // Always re-read localStorage so dual CatPlayground instances
        // (dashboard + sidebar) do not overwrite each other's feed.
        const base = mergeStates(prev, loadLocal(userKey))
        const next = updater(base)
        nextState = next
        return next
      })

      // Side effects must run outside the setState updater. Dispatching a sync
      // CustomEvent inside the updater makes sibling CatPlayground listeners
      // call setState while React is still updating this instance.
      if (!nextState || typeof window === "undefined") return
      const next = nextState
      saveLocal(userKey, next)
      window.queueMicrotask(() => {
        try {
          window.dispatchEvent(
            new CustomEvent("bdp-cat-pet-updated", {
              detail: { userKey, pet: next },
            }),
          )
        } catch {
          /* ignore */
        }
        if (opts?.sync !== false) {
          if (persistTimer.current) window.clearTimeout(persistTimer.current)
          persistTimer.current = window.setTimeout(() => {
            setSyncLabel("syncing")
            void apiPutPet(next).finally(() => {
              setSyncLabel("ok")
              window.setTimeout(() => setSyncLabel("idle"), 1200)
            })
          }, 400)
        }
      })
    },
    [userKey],
  )

  useEffect(() => {
    let cancelled = false
    // Read local only — do not decay+persist on mount (that raced two instances).
    const local = loadLocal(userKey)
    setState(local)
    setNameDraft(local.name)
    setHydrated(true)
    setNow(Date.now())

    void (async () => {
      const remote = await apiGetPet()
      if (cancelled) return
      // Re-read local after network wait — another instance may have fed.
      const latestLocal = loadLocal(userKey)
      if (!remote) {
        // Keep timestamps; only derive for UI. Persist original (no lastSeenAt bump).
        setState(latestLocal)
        setNameDraft(latestLocal.name)
        void apiPutPet(latestLocal)
        return
      }
      const soft = mergeStates(latestLocal, remote)
      setState(soft)
      saveLocal(userKey, soft)
      setNameDraft(soft.name)
      // Only push if we have a strictly newer feed (avoid clobbering remote).
      if (Number(soft.lastFedAt || 0) >= Number(remote.lastFedAt || 0)) {
        void apiPutPet(soft)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userKey])

  // Sync between dual CatPlayground mounts (dashboard chip + sidebar).
  useEffect(() => {
    if (typeof window === "undefined") return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey(userKey) || !e.newValue) return
      try {
        const incoming = normalizeState(JSON.parse(e.newValue) as Partial<PetState>)
        setState((prev) => mergeStates(prev, incoming))
        setNameDraft(incoming.name)
        setNow(Date.now())
      } catch {
        /* ignore */
      }
    }
    const onLocal = (e: Event) => {
      const detail = (e as CustomEvent<{ userKey?: string; pet?: PetState }>).detail
      if (!detail || detail.userKey !== userKey || !detail.pet) return
      setState((prev) => mergeStates(prev, detail.pet as PetState))
      setNameDraft(detail.pet.name)
      setNow(Date.now())
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener("bdp-cat-pet-updated", onLocal as EventListener)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("bdp-cat-pet-updated", onLocal as EventListener)
    }
  }, [userKey])

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now())
      // UI-only refresh — do not rewrite lastSeenAt / persist on timer ticks.
    }, 30_000)
    return () => window.clearInterval(id)
  }, [])

  const liveHunger = useMemo(() => {
    if (!hydrated) return state.hunger
    // Always derive from lastFedAt so UI matches the 48h feed clock
    return applyDecay(state, now).hunger
  }, [state, now, hydrated])

  const msUntilEmpty = useMemo(() => {
    const fedAt = Number(state.lastFedAt || 0) || Number(state.lastSeenAt || 0) || now
    return Math.max(0, HUNGER_FULL_MS - Math.max(0, now - fedAt))
  }, [state.lastFedAt, state.lastSeenAt, now])

  const liveHappy = useMemo(() => {
    if (!hydrated) return state.happy
    return applyDecay(state, now).happy
  }, [state, now, hydrated])

  const mood = moodFromStats(liveHunger, liveHappy)
  const ageLabel = formatAge(state.bornAt, now, lang)
  const stageLabel = ageStage(state.bornAt, now, lang)




  useEffect(() => {
    if (!hydrated) return
    if (liveHunger > 0) return
    commitState((prev) => {
      const nowTs = Date.now()
      const decayed = touchSeen(prev, nowTs)
      if (decayed.hunger > 0) return decayed
      if (prev.hunger > 0 || Number(prev.lastFedAt || 0) > 0) {
        // Count death once when crossing into empty bowl.
        const alreadyDead = Number(prev.hunger || 0) <= 0 && Number(prev.deaths || 0) > 0
        if (alreadyDead) return { ...decayed, hunger: 0 }
        return { ...decayed, hunger: 0, deaths: Math.max(1, prev.deaths + (prev.hunger > 0 ? 1 : 0)) }
      }
      if (prev.deaths === 0) return { ...decayed, hunger: 0, deaths: 1 }
      return { ...decayed, hunger: 0 }
    })
  }, [liveHunger, hydrated, commitState])

  useEffect(() => {
    if (!hydrated || !state.remindersEnabled) return
    if (typeof window === "undefined" || !("Notification" in window)) return
    if (mood !== "hungry" && mood !== "critical" && mood !== "dead") return
    if (Notification.permission !== "granted") return
    try {
      const last = Number(localStorage.getItem(remindKey(userKey)) || 0)
      if (Date.now() - last < REMIND_COOLDOWN_MS) return
      const title = lang === "BM" ? `${state.name} perlukan anda!` : `${state.name} needs you!`
      const body =
        mood === "dead"
          ? lang === "BM"
            ? `${state.name} jadi tulang. Buka app & tekan Adopt.`
            : `${state.name} is bones. Open app & press Adopt.`
          : lang === "BM"
            ? `${state.name} lapar (${Math.round(liveHunger)}%). Bagi makan sebelum 48 jam habis.`
            : `${state.name} is hungry (${Math.round(liveHunger)}%). Feed before the 48h timer runs out.`
      new Notification(title, { body, tag: `cat-pet-${userKey}` })
      localStorage.setItem(remindKey(userKey), String(Date.now()))
    } catch {
      /* ignore */
    }
  }, [mood, hydrated, state.remindersEnabled, state.name, liveHunger, lang, userKey])

  const statusText = useMemo(() => {
    if (lang === "BM") {
      switch (mood) {
        case "happy":
          return "Kenyang & gembira · 48j life"
        case "ok":
          return "Okay je"
        case "hungry":
          return "Lapar… bagi makan!"
        case "critical":
          return "Lemah! Segera bagi makan"
        case "dead":
          return "Jadi tulang… tekan Adopt untuk start semula"
      }
    }
    switch (mood) {
      case "happy":
        return "Full & happy · 48h life"
      case "ok":
        return "Doing okay"
      case "hungry":
        return "Hungry… feed me!"
      case "critical":
        return "Starving! Feed now"
      case "dead":
        return "Bones… press Adopt to start again"
    }
  }, [mood, lang])

  const bubbleText = useMemo(() => {
    if (wakeFlash) return lang === "BM" ? "eh?!" : "huh?!"
    if (playFlash) return "hehe~"
    if (feedFlash) return lang === "BM" ? "nym nym!" : "nom nom!"
    if (isSleeping && mood !== "dead" && mood !== "critical") {
      return lang === "BM" ? "zzz…" : "zzz…"
    }
    if (lang === "BM") {
      switch (mood) {
        case "happy":
          return "meow~"
        case "ok":
          return "hai"
        case "hungry":
          return "lapar…"
        case "critical":
          return "tolong…"
        case "dead":
          return "tulang…"
      }
    }
    switch (mood) {
      case "happy":
        return "meow~"
      case "ok":
        return "hai"
      case "hungry":
        return "hungry…"
      case "critical":
        return "help…"
      case "dead":
        return "bones…"
    }
  }, [mood, lang, feedFlash, playFlash, isSleeping, wakeFlash])

  const feed = useCallback(() => {
    commitState((prev) => {
      const base = applyDecay(prev)
      if (base.hunger <= 0) return base // dead: must adopt
      const nowTs = Date.now()
      return {
        ...base,
        // Full bowl every feed → clear 48h life from this moment
        hunger: 100,
        happy: clamp(base.happy + FEED_HAPPY_GAIN),
        lastFedAt: nowTs,
        lastSeenAt: nowTs,
        totalFeeds: base.totalFeeds + 1,
        bornAt: base.bornAt || nowTs,
      }
    })
    setIsSleeping(false)
    setFeedFlash(true)
    window.setTimeout(() => setFeedFlash(false), 700)
    setNow(Date.now())
    if (sleepTimer.current) window.clearTimeout(sleepTimer.current)
    sleepTimer.current = window.setTimeout(() => setIsSleeping(true), SLEEP_IDLE_MS)
  }, [commitState, SLEEP_IDLE_MS])

  /** Dead skeleton -> adopt new life starting at 1 day old */
  const adopt = useCallback(() => {
    const nowTs = Date.now()
    commitState((prev) => {
      const base = applyDecay(prev)
      return {
        ...base,
        hunger: 100,
        happy: 100,
        lastFedAt: nowTs,
        lastSeenAt: nowTs,
        totalFeeds: 0,
        revives: base.revives + 1,
        bornAt: nowTs - DAY_MS,
        name: base.name || "Mimi",
        remindersEnabled: base.remindersEnabled,
        catSkin: base.catSkin || "amber",
        houseSkin: base.houseSkin || "violet",
      }
    })
    setFeedFlash(true)
    window.setTimeout(() => setFeedFlash(false), 700)
    setNow(nowTs)
  }, [commitState])

  const scheduleSleep = useCallback(() => {
    if (sleepTimer.current) window.clearTimeout(sleepTimer.current)
    sleepTimer.current = window.setTimeout(() => {
      setIsSleeping(true)
    }, SLEEP_IDLE_MS)
  }, [SLEEP_IDLE_MS])

  const cycleCatSkin = useCallback(() => {
    commitState((prev) => {
      const base = applyDecay(prev)
      const idx = CAT_SKINS.indexOf(base.catSkin || "amber")
      const next = CAT_SKINS[(idx + 1) % CAT_SKINS.length]
      return { ...base, catSkin: next, lastSeenAt: Date.now() }
    })
    setIsSleeping(false)
    scheduleSleep()
  }, [commitState, scheduleSleep])

  const cycleHouseSkin = useCallback(() => {
    commitState((prev) => {
      const base = applyDecay(prev)
      const idx = HOUSE_SKINS.indexOf(base.houseSkin || "violet")
      const next = HOUSE_SKINS[(idx + 1) % HOUSE_SKINS.length]
      return { ...base, houseSkin: next, lastSeenAt: Date.now() }
    })
  }, [commitState])

  const wakeUp = useCallback(() => {
    setIsSleeping(false)
    setWakeFlash(true)
    window.setTimeout(() => setWakeFlash(false), 900)
    scheduleSleep()
  }, [scheduleSleep])

  const play = useCallback(() => {
    if (mood === "dead" || mood === "critical") return
    if (isSleeping) {
      wakeUp()
      return
    }
    setPlayFlash(true)
    window.setTimeout(() => setPlayFlash(false), 800)
    scheduleSleep()
    commitState((prev) => {
      const base = applyDecay(prev)
      if (base.hunger <= 0) return { ...base, lastSeenAt: Date.now() }
      // Play only boosts happy — must not extend / fake the feed clock
      return {
        ...base,
        happy: clamp(base.happy + PLAY_HAPPY_GAIN),
        lastSeenAt: Date.now(),
      }
    })
  }, [commitState, mood, isSleeping, wakeUp, scheduleSleep])

  useEffect(() => {
    if (mood === "dead" || mood === "critical") {
      setIsSleeping(false)
      if (sleepTimer.current) window.clearTimeout(sleepTimer.current)
      return
    }
    if (!isSleeping) scheduleSleep()
    return () => {
      if (sleepTimer.current) window.clearTimeout(sleepTimer.current)
    }
  }, [mood, isSleeping, scheduleSleep])

  const saveName = useCallback(() => {
    const nextName = nameDraft.trim().slice(0, 24) || "Mimi"
    setNameDraft(nextName)
    setEditingName(false)
    commitState((prev) => ({ ...applyDecay(prev), name: nextName, lastSeenAt: Date.now() }))
  }, [nameDraft, commitState])

  const toggleReminders = useCallback(async () => {
    const enabling = !state.remindersEnabled
    if (enabling && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        try {
          await Notification.requestPermission()
        } catch {
          /* ignore */
        }
      }
    }
    commitState((prev) => ({
      ...applyDecay(prev),
      remindersEnabled: enabling,
      lastSeenAt: Date.now(),
    }))
  }, [state.remindersEnabled, commitState])

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus()
  }, [editingName])

  useEffect(() => {
    if (!sheetOpen || presentation !== "chip") return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [sheetOpen, presentation])

  const hungerColor =
    liveHunger >= 70
      ? "bg-[var(--text)]"
      : liveHunger >= 40
        ? "bg-[var(--text)]/70"
        : liveHunger > 0
          ? "bg-[var(--muted)]"
          : "bg-[var(--border-strong)]"

  const happyColor =
    liveHappy >= 70
      ? "bg-[var(--text)]"
      : liveHappy >= 40
        ? "bg-[var(--text)]/70"
        : liveHappy > 0
          ? "bg-[var(--muted)]"
          : "bg-[var(--border-strong)]"

  const playgroundBg =
    mood === "dead"
      ? "from-[var(--muted)]/15 via-[var(--muted)]/5 to-transparent"
      : mood === "critical"
        ? "from-[var(--text)]/12 via-[var(--muted)]/6 to-transparent"
        : "from-[var(--text)]/8 via-[var(--muted)]/5 to-transparent"

  const catSize = compact ? 70 : 80
  const moodEmoji = mood === "dead" ? "☠️" : mood === "happy" ? "😻" : mood === "critical" ? "😿" : mood === "hungry" ? "😾" : "🐱"
  const chipStatus =
    mood === "dead"
      ? lang === "BM"
        ? "tulang — adopt"
        : "bones — adopt"
      : mood === "critical"
        ? lang === "BM"
          ? "lemah!"
          : "starving!"
        : mood === "hungry"
          ? lang === "BM"
            ? "lapar…"
            : "hungry…"
          : isSleeping
            ? "zzz…"
            : lang === "BM"
              ? "ok"
              : "ok"

  const animationStyles = (
      <style jsx>{`
        .catpg-bubble {
          position: relative;
          animation: catpg-bubble 2.4s ease-in-out infinite;
        }
        .catpg-bubble-tail {
          position: absolute;
          left: 50%;
          bottom: -4px;
          width: 7px;
          height: 7px;
          margin-left: -3.5px;
          background: #fff;
          transform: rotate(45deg);
          border-radius: 1px;
        }
        .catpg-bubble-pop {
          animation: catpg-pop 0.65s ease-out !important;
        }
        .catpg-tail {
          transform-origin: 50px 42px;
          animation: catpg-tail 1.1s ease-in-out infinite;
        }
        .catpg-tail-sleep {
          transform-origin: 50px 42px;
          animation: catpg-tail-sleep 3.6s ease-in-out infinite;
        }
        .catpg-head {
          transform-origin: 34px 28px;
          animation: catpg-head 3.2s ease-in-out infinite;
        }
        .catpg-head-sleep {
          transform-origin: 34px 28px;
          animation: catpg-head-sleep 4s ease-in-out infinite;
        }
        .catpg-eyes {
          transform-origin: 34px 27px;
          animation: catpg-blink 4.5s ease-in-out infinite;
        }
        .catpg-sleep-breathe {
          animation: catpg-sleep-breathe 2.8s ease-in-out infinite;
        }
        .catpg-zzz {
          animation: catpg-zzz 2.2s ease-in-out infinite;
        }
        .catpg-walk-bob {
          animation: catpg-walk-bob 0.38s ease-in-out infinite;
        }
        .catpg-feed-bounce {
          animation: catpg-feed 0.65s ease-out;
        }
        @keyframes catpg-bubble {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-2px);
          }
        }
        @keyframes catpg-pop {
          0% {
            transform: scale(0.85);
          }
          40% {
            transform: scale(1.18);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes catpg-tail {
          0%,
          100% {
            transform: rotate(-8deg);
          }
          50% {
            transform: rotate(14deg);
          }
        }
        @keyframes catpg-tail-sleep {
          0%,
          100% {
            transform: rotate(-4deg);
          }
          50% {
            transform: rotate(3deg);
          }
        }
        @keyframes catpg-head {
          0%,
          100% {
            transform: rotate(-1.5deg);
          }
          50% {
            transform: rotate(2deg);
          }
        }
        @keyframes catpg-head-sleep {
          0%,
          100% {
            transform: rotate(-3deg) translateY(1px);
          }
          50% {
            transform: rotate(-1deg) translateY(0);
          }
        }
        @keyframes catpg-sleep-breathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.015);
          }
        }
        @keyframes catpg-zzz {
          0%,
          100% {
            opacity: 0.55;
            transform: translateY(0);
          }
          50% {
            opacity: 1;
            transform: translateY(-2px);
          }
        }
        @keyframes catpg-blink {
          0%,
          42%,
          48%,
          100% {
            transform: scaleY(1);
          }
          45% {
            transform: scaleY(0.12);
          }
        }
        @keyframes catpg-walk-bob {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-2px);
          }
        }
        @keyframes catpg-feed {
          0% {
            transform: scale(1);
          }
          35% {
            transform: scale(1.08) translateY(-4px);
          }
          100% {
            transform: scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .catpg-bubble,
          .catpg-tail,
          .catpg-tail-sleep,
          .catpg-head,
          .catpg-head-sleep,
          .catpg-eyes,
          .catpg-walk-bob,
          .catpg-feed-bounce,
          .catpg-sleep-breathe,
          .catpg-zzz {
            animation: none !important;
          }
        }
      `}</style>
  )

  const playgroundBody = (
      <div className="relative z-[1] flex flex-col gap-3">
        {/* Arena — cat house + sitting cat */}
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]",
            compact ? "h-[128px]" : "h-[148px]",
          )}
        >
          {/* soft ground + grass strip */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[var(--text)]/10 via-[var(--text)]/4 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-[var(--text)]/12 to-transparent" />
          <div className="pointer-events-none absolute inset-x-4 bottom-3 h-px bg-[var(--text)]/10" />

          {/* trees & plants — fill the cat city */}
          <div className="pointer-events-none absolute bottom-1 left-0.5 z-0 opacity-95 sm:left-1" aria-hidden>
            <TreeSvg size={compact ? 34 : 42} variant={0} />
          </div>
          <div className="pointer-events-none absolute bottom-1 left-[14%] z-0 opacity-90 sm:left-[16%]" aria-hidden>
            <TreeSvg size={compact ? 26 : 32} variant={1} />
          </div>
          <div className="pointer-events-none absolute bottom-0.5 left-[26%] z-0 opacity-95" aria-hidden>
            <BushSvg size={compact ? 22 : 26} />
          </div>
          <div className="pointer-events-none absolute bottom-1 right-0.5 z-0 opacity-95 sm:right-1" aria-hidden>
            <TreeSvg size={compact ? 36 : 44} variant={2} />
          </div>
          <div className="pointer-events-none absolute bottom-1 right-[14%] z-0 opacity-90 sm:right-[16%]" aria-hidden>
            <TreeSvg size={compact ? 24 : 30} variant={0} />
          </div>
          <div className="pointer-events-none absolute bottom-0.5 right-[26%] z-0 opacity-95" aria-hidden>
            <BushSvg size={compact ? 20 : 24} />
          </div>
          <div className="pointer-events-none absolute bottom-2 left-[38%] z-0" aria-hidden>
            <FlowerSvg size={12} hue={0} />
          </div>
          <div className="pointer-events-none absolute bottom-2 left-[44%] z-0" aria-hidden>
            <FlowerSvg size={11} hue={1} />
          </div>
          <div className="pointer-events-none absolute bottom-2 right-[40%] z-0" aria-hidden>
            <FlowerSvg size={12} hue={2} />
          </div>
          <div className="pointer-events-none absolute bottom-2 right-[34%] z-0" aria-hidden>
            <FlowerSvg size={10} hue={0} />
          </div>

          <div className="absolute inset-x-0 bottom-1 z-[1] flex items-end justify-center gap-1 px-2 sm:gap-3">
            {/* rumah kucing */}
            <button
              type="button"
              onClick={cycleHouseSkin}
              className="mb-0.5 shrink-0 opacity-95 outline-none transition active:scale-95"
              title={lang === "BM" ? "Tukar warna rumah" : "Change house color"}
              aria-label={lang === "BM" ? "Tukar warna rumah" : "Change house color"}
            >
              <CatHouseSvg size={compact ? 86 : 100} skin={state.houseSkin} />
            </button>

            {/* sitting cat + bubble */}
            <button
              type="button"
              onClick={play}
              disabled={mood === "dead" || mood === "critical"}
              className={cn(
                "mb-0 flex w-fit flex-col items-center outline-none",
                mood !== "dead" && mood !== "critical" && "active:scale-95",
                mood === "dead" ? "cursor-default" : "cursor-pointer",
              )}
              aria-label={
                mood === "dead" || mood === "critical"
                  ? lang === "BM"
                    ? "Kucing"
                    : "Cat"
                  : isSleeping
                    ? lang === "BM"
                      ? "Ketik untuk bangunkan"
                      : "Tap to wake"
                    : lang === "BM"
                      ? "Main dengan kucing"
                      : "Play with cat"
              }
            >
              <div
                className={cn(
                  "catpg-bubble mb-0.5 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-[var(--text)] shadow-sm",
                  (feedFlash || playFlash || wakeFlash) && "catpg-bubble-pop",
                  isSleeping && !wakeFlash && "opacity-80",
                )}
              >
                {bubbleText}
                <span className="catpg-bubble-tail" />
              </div>
              <div
                className={cn(
                  (feedFlash || playFlash || wakeFlash) && "catpg-feed-bounce",
                  isSleeping && !wakeFlash && "opacity-95",
                )}
              >
                <CatSvg
                  mood={mood}
                  size={catSize}
                  facing={1}
                  sleeping={isSleeping && mood !== "dead" && mood !== "critical"}
                  skin={state.catSkin}
                />
              </div>
            </button>
          </div>
        </div>

        {/* Info + controls */}
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {lang === "BM" ? "Playground Kucing" : "Cat Playground"}
                </p>
                {syncLabel === "syncing" && (
                  <span className="text-[0.55rem] font-semibold text-[var(--muted)]">
                    {lang === "BM" ? "sync…" : "sync…"}
                  </span>
                )}
                {syncLabel === "ok" && (
                  <span className="text-[0.55rem] font-semibold text-[var(--muted)]">
                    {lang === "BM" ? "tersimpan" : "saved"}
                  </span>
                )}
              </div>

              <div className="mt-0.5 flex items-center justify-between gap-2">
                {editingName ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <input
                      ref={nameInputRef}
                      value={nameDraft}
                      maxLength={24}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveName()
                        if (e.key === "Escape") {
                          setNameDraft(state.name)
                          setEditingName(false)
                        }
                      }}
                      className="h-7 w-full min-w-0 max-w-[11rem] rounded-lg border border-[var(--border)] bg-[var(--surface-tint)] px-2 text-sm font-black text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--text)]/20"
                    />
                    <button
                      type="button"
                      onClick={saveName}
                      className="h-7 shrink-0 rounded-lg bg-[var(--text)] px-2 text-[0.65rem] font-bold text-[var(--bg)]"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(state.name)
                      setEditingName(true)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-sm font-black text-[var(--text)]"
                    title={lang === "BM" ? "Tukar nama" : "Rename"}
                  >
                    <span className="truncate">{state.name}</span>
                    <span className="text-[0.7rem] font-bold text-[var(--muted)]">
                      {mood === "dead" ? "☠️" : mood === "happy" ? "😻" : mood === "critical" ? "😿" : "🐱"}
                    </span>
                    <span className="text-[0.58rem] font-semibold text-[var(--muted)]">✎</span>
                  </button>
                )}
                <div className="min-w-[5.75rem] shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2 text-right shadow-sm">
                  <p className="text-[0.58rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                    {lang === "BM" ? "Umur" : "Age"}
                  </p>
                  <p className="mt-0.5 text-sm font-black leading-tight text-[var(--text)] tabular-nums">
                    {ageLabel}
                  </p>
                  <p className="mt-0.5 text-[0.62rem] font-semibold capitalize text-[var(--muted)]">
                    {stageLabel}
                  </p>
                </div>
              </div>

              <p
                className={cn(
                  "mt-0.5 text-[0.7rem] font-semibold",
                  mood === "dead"
                    ? "text-[var(--muted)]"
                    : mood === "critical"
                      ? "text-[var(--text)]"
                      : mood === "hungry"
                        ? "text-[var(--text)]/80"
                        : "text-[var(--muted)]",
                )}
              >
                {statusText}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-[0.62rem] font-bold text-[var(--muted)]">
                <span>🐟 {lang === "BM" ? "Lapar" : "Hunger"}</span>
                <span className="tabular-nums text-[var(--text)]">{Math.round(liveHunger)}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-tint-strong)] ring-1 ring-[var(--border)]">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", hungerColor)}
                  style={{ width: `${Math.max(mood === "dead" ? 0 : 2, liveHunger)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[0.62rem] font-bold text-[var(--muted)]">
                <span>💖 {lang === "BM" ? "Happy" : "Happy"}</span>
                <span className="tabular-nums text-[var(--text)]">{Math.round(liveHappy)}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-tint-strong)] ring-1 ring-[var(--border)]">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", happyColor)}
                  style={{ width: `${Math.max(mood === "dead" ? 0 : 2, liveHappy)}%` }}
                />
              </div>
            </div>
            <p className="text-[0.6rem] font-medium text-[var(--muted)]">
              {mood === "dead"
                ? lang === "BM"
                  ? "Kucing jadi tulang. Adopt untuk mula semula (umur 1 hari)."
                  : "Cat is bones. Adopt to start over (age 1 day)."
                : lang === "BM"
                  ? `Makan = kenyang 100% · 48 jam dari makan terakhir · Mati ${formatCountdown(msUntilEmpty, lang)} jika tak jaga`
                  : `Feed = full 100% · 48h from last feed · Dies in ${formatCountdown(msUntilEmpty, lang)} if unfed`}
            </p>
          </div>

          <div className={cn("flex gap-2", stackFeed ? "flex-col" : "items-center")}>
            <button
              type="button"
              onClick={mood === "dead" ? adopt : feed}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-extrabold transition active:scale-[0.97]",
                stackFeed ? "order-2 w-full" : "flex-1",
                mood === "dead"
                  ? "bg-[var(--muted)] text-[var(--bg)] shadow-sm hover:opacity-95"
                  : "bg-[var(--text)] text-[var(--bg)] shadow-sm hover:opacity-95",
              )}
            >
              <span aria-hidden>{mood === "dead" ? "🏠" : "🐟"}</span>
              {mood === "dead"
                ? lang === "BM"
                  ? "Adopt (umur 1 hari)"
                  : "Adopt (age 1 day)"
                : lang === "BM"
                  ? "Bagi makan"
                  : "Feed cat"}
            </button>
            <div className={cn("flex items-center gap-2", stackFeed ? "order-1 w-full justify-between" : "")}>
              <button
                type="button"
                onClick={play}
                disabled={mood === "dead" || mood === "critical"}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] text-sm transition enabled:hover:bg-[var(--surface-tint-strong)] enabled:active:scale-95 disabled:opacity-40"
                title={lang === "BM" ? "Main (+happy)" : "Play (+happy)"}
                aria-label={lang === "BM" ? "Main" : "Play"}
              >
                🎾
              </button>
              <button
                type="button"
                onClick={cycleCatSkin}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] text-sm transition hover:bg-[var(--surface-tint-strong)] active:scale-95"
                title={lang === "BM" ? "Tukar skin kucing" : "Change cat skin"}
                aria-label={lang === "BM" ? "Skin kucing" : "Cat skin"}
              >
                <span
                  className="h-4 w-4 rounded-full ring-2 ring-white/80 shadow-sm"
                  style={{ background: CAT_PALETTES[state.catSkin]?.body || "#fbbf24" }}
                />
              </button>
              <button
                type="button"
                onClick={cycleHouseSkin}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] text-sm transition hover:bg-[var(--surface-tint-strong)] active:scale-95"
                title={lang === "BM" ? "Tukar warna rumah" : "Change house color"}
                aria-label={lang === "BM" ? "Warna rumah" : "House color"}
              >
                <span
                  className="h-4 w-4 rounded-md ring-2 ring-white/80 shadow-sm"
                  style={{ background: HOUSE_PALETTES[state.houseSkin]?.roof || "#a78bfa" }}
                />
              </button>
              <button
                type="button"
                onClick={() => void toggleReminders()}
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm transition active:scale-95",
                  state.remindersEnabled
                    ? "border-[var(--text)]/30 bg-[var(--text)]/10"
                    : "border-[var(--border)] bg-[var(--surface-tint)]",
                )}
                title={state.remindersEnabled ? (lang === "BM" ? "Reminder ON" : "Reminders ON") : lang === "BM" ? "Reminder OFF" : "Reminders OFF"}
                aria-label="Reminders"
              >
                {state.remindersEnabled ? "🔔" : "🔕"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.58rem] font-semibold text-[var(--muted)]">
            <span>
              {lang === "BM" ? "Makan" : "Fed"} {state.totalFeeds}×
            </span>
            <span>
              {lang === "BM" ? "Mati" : "Deaths"} {state.deaths}×
            </span>
            {state.revives > 0 && (
              <span>
                {lang === "BM" ? "Adopt" : "Adopts"} {state.revives}×
              </span>
            )}
          </div>
        </div>
      </div>
  )

  const playgroundCard = (
    <div
      className={cn(
        "catpg relative overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-soft)]",
        compact ? "p-3" : "p-4",
        presentation === "chip" ? "border-0 shadow-none" : className,
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", playgroundBg)} />
      {playgroundBody}
    </div>
  )

  if (presentation === "chip") {
    const sheet =
      sheetOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[140] flex h-[100dvh] w-screen items-end justify-center overflow-hidden bg-transparent px-0 py-0 sm:items-center sm:px-4 sm:py-6"
              onClick={requestSheetClose}
              role="presentation"
            >
              <div
                data-swipe-sheet
                className="app-sheet-panel relative flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden border border-[var(--border)] bg-[var(--card)] shadow-[0_-12px_50px_rgba(0,0,0,0.35)] sm:shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                {...sheetSwipe}
              >
                <AppSheetHeader
                  title={`${state.name} ${moodEmoji}`}
                  onClose={requestSheetClose}
                />
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  {playgroundCard}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null

    return (
      <>
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm",
            className,
          )}
        >
          <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80", playgroundBg)} />
          <div className="relative z-[1] flex items-center gap-2.5 px-3 py-2.5">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none active:scale-[0.99]"
              aria-label={lang === "BM" ? `Buka playground ${state.name}` : `Open ${state.name} playground`}
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]",
                  feedFlash && "catpg-feed-bounce",
                )}
              >
                <CatSvg
                  mood={mood}
                  size={36}
                  facing={1}
                  sleeping={isSleeping && mood !== "dead" && mood !== "critical"}
                  skin={state.catSkin}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-black text-[var(--text)]">{state.name}</span>
                  <span className="text-[0.75rem]" aria-hidden>
                    {moodEmoji}
                  </span>
                  {(mood === "hungry" || mood === "critical") && (
                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-orange-500" />
                  )}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-[0.68rem] font-semibold",
                    mood === "dead"
                      ? "text-slate-400"
                      : mood === "critical"
                        ? "text-orange-500"
                        : mood === "hungry"
                          ? "text-amber-500"
                          : "text-[var(--muted)]",
                  )}
                >
                  {chipStatus}
                  {mood !== "dead" ? ` · ${Math.round(liveHunger)}%` : ""}
                  <span className="text-[var(--muted)]">
                    {" · "}
                    {lang === "BM" ? "ketuk buka" : "tap to open"}
                  </span>
                </span>
                {mood !== "dead" && (
                  <span className="mt-1.5 block h-1.5 max-w-[9rem] overflow-hidden rounded-full bg-[var(--surface-tint-strong)] ring-1 ring-[var(--border)]">
                    <span
                      className={cn("block h-full rounded-full transition-all duration-500", hungerColor)}
                      style={{ width: `${Math.max(2, liveHunger)}%` }}
                    />
                  </span>
                )}
              </span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (mood === "dead") {
                  adopt()
                  setSheetOpen(true)
                  return
                }
                feed()
              }}
              className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-xl px-2.5 text-[0.68rem] font-extrabold transition active:scale-95",
                mood === "dead"
                  ? "bg-[var(--muted)] text-[var(--bg)]"
                  : "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]",
              )}
              aria-label={mood === "dead" ? (lang === "BM" ? "Adopt" : "Adopt") : lang === "BM" ? "Bagi makan" : "Feed"}
            >
              <span aria-hidden>{mood === "dead" ? "🏠" : "🐟"}</span>
              <span>
                {mood === "dead" ? "Adopt" : lang === "BM" ? "Makan" : "Feed"}
              </span>
            </button>
          </div>
        </div>
        {sheet}
        {animationStyles}
      </>
    )
  }

  return (
    <>
      {playgroundCard}
      {animationStyles}
    </>
  )
}

export default CatPlayground
