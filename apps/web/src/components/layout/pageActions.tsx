"use client"

import React, { useEffect, useId, useRef, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

/**
 * Page actions live under the hero card. The header gets them as props but the hero is a
 * different component, so they meet here: a header registers its action row, and the first
 * hero on the page renders it right below itself. A page without a hero keeps the row under
 * the header.
 */
type Entry = { ref: { current: React.ReactNode }; className: string }
let actions = new Map<string, Entry>()
let heroes: string[] = []
const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = () => version

export function useActionsStore() {
  useSyncExternalStore(subscribe, snapshot, () => 0)
  return { actions, heroes }
}

export function useRegisterActions(node: React.ReactNode, className: string) {
  const id = useId()
  const has = Boolean(node)
  // The latest buttons are kept in a ref that the slot reads when it renders, so a changed
  // button (a new label, a disabled state) shows without registering again: registering
  // re-renders every subscriber, and doing it on each render loops.
  const ref = useRef<React.ReactNode>(node)
  ref.current = node
  useEffect(() => {
    if (!has) return
    actions = new Map(actions).set(id, { ref, className })
    emit()
    return () => {
      const next = new Map(actions)
      next.delete(id)
      actions = next
      emit()
    }
  }, [has, id, className])
}

export function useRegisterHero(enabled = true) {
  const id = useId()
  useEffect(() => {
    if (!enabled) return
    heroes = [...heroes, id]
    emit()
    return () => {
      heroes = heroes.filter((h) => h !== id)
      emit()
    }
  }, [id, enabled])
  return id
}

/** Rendered by a hero, right below it. Only the first hero on the page shows the row. */
export function HeroActionsSlot({ heroId }: { heroId: string }) {
  const { actions: map, heroes: list } = useActionsStore()
  if (list[0] !== heroId || map.size === 0) return null
  return (
    <>
      {[...map.entries()].map(([key, entry]) => (
        <div key={key} data-page-actions className={entry.className}>
          {entry.ref.current}
        </div>
      ))}
    </>
  )
}

export function usePageHasHero() {
  return useActionsStore().heroes.length > 0
}

/** The first hero card in the page content: ModenHero, or a page's own "...-hero" block. */
function findHero(): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>('.moden-hero, [class*="-hero"]')
  for (const el of nodes) {
    if (el.closest("[data-page-actions], aside, header, [data-mobile-page-header], nav")) continue
    if (el.parentElement?.closest('[class*="-hero"], .moden-hero')) continue // a part of a hero
    if (el.getBoundingClientRect().height < 60) continue
    return el
  }
  return null
}

/**
 * For a page whose hero is its own markup: put the action row right after that hero by
 * rendering it into a placeholder inserted beside the hero. With no hero found the row
 * stays where the header rendered it.
 */
export function ActionsAfterHero({ className, children }: { className: string; children: React.ReactNode }) {
  const [host, setHost] = React.useState<HTMLElement | null>(null)
  useEffect(() => {
    let placeholder: HTMLElement | null = null
    let timer: number | undefined
    const place = () => {
      if (placeholder?.isConnected) return
      const hero = findHero()
      if (!hero) return
      placeholder = document.createElement("div")
      placeholder.setAttribute("data-page-actions-host", "")
      hero.insertAdjacentElement("afterend", placeholder)
      setHost(placeholder)
    }
    place()
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(place, 80)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      placeholder?.remove()
      setHost(null)
    }
  }, [])
  const row = (
    <div data-page-actions className={className}>
      {children}
    </div>
  )
  return host ? createPortal(row, host) : row
}
