"use client"

import type React from "react"

// Small pieces for the "how to use" popups: a numbered step, an inline command,
// a titled block, and a list of commands with what each does.

export function HelpStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-xs font-bold text-[var(--btn-primary-text)]">{n}</span>
      <span className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--text-soft)]">{children}</span>
    </li>
  )
}

export function HelpCode({ children }: { children: React.ReactNode }) {
  return <code className="rounded-md bg-[var(--surface-tint-strong)] px-1.5 py-0.5 font-mono text-[0.8125rem] font-semibold text-[var(--text)]">{children}</code>
}

export function HelpBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.25rem] border border-[var(--border)] p-4">
      <p className="mb-3 text-sm font-bold text-[var(--text)]">{title}</p>
      {children}
    </section>
  )
}

export function HelpCommands({ commands }: { commands: Array<[command: string, meaning: string]> }) {
  return (
    <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">
      {commands.map(([cmd, meaning]) => (
        <li key={cmd} className="flex flex-col items-start gap-1 px-3.5 py-3">
          <HelpCode>{cmd}</HelpCode>
          <span className="text-[0.8125rem] text-[var(--muted)]">{meaning}</span>
        </li>
      ))}
    </ul>
  )
}

export function HelpNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[0.8125rem] leading-relaxed text-[var(--muted)]">{children}</p>
}
