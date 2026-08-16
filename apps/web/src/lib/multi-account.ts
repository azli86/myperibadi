"use client"

import {
  getAccessToken,
  getRefreshToken,
  getSessionId,
  setAuthTokens,
  clearAuthSession,
  ensureSessionId,
  SESSION_ID_STORAGE_KEY,
  ACCESS_TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
} from "@/lib/auth-session"

const ACCOUNTS_STORAGE_KEY = "bdp_accounts"
const ACTIVE_EMAIL_STORAGE_KEY = "bdp_active_email"

export type AccountProfile = {
  email: string
  name: string
  accessToken: string
  refreshToken: string | null
  sessionId: string
}

function store(): Storage | null {
  if (typeof window === "undefined") return null
  return window.localStorage
}

export function getAccounts(): AccountProfile[] {
  const s = store()
  if (!s) return []
  try {
    const raw = s.getItem(ACCOUNTS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AccountProfile[]) : []
  } catch {
    return []
  }
}

function saveAccounts(accounts: AccountProfile[]) {
  const s = store()
  if (!s) return
  const value = JSON.stringify(accounts)
  try {
    s.setItem(ACCOUNTS_STORAGE_KEY, value)
  } catch (error) {
    // API responses are disposable; free their quota before saving account credentials.
    for (let i = s.length - 1; i >= 0; i--) {
      const key = s.key(i)
      if (key?.startsWith("budget-by-digitalport:api:")) s.removeItem(key)
    }
    s.setItem(ACCOUNTS_STORAGE_KEY, value)
  }
}

export function getActiveEmail(): string | null {
  const s = store()
  if (!s) return null
  return s.getItem(ACTIVE_EMAIL_STORAGE_KEY)
}

function setActiveEmail(email: string) {
  const s = store()
  if (!s) return
  s.setItem(ACTIVE_EMAIL_STORAGE_KEY, email)
}

/** Sync current auth tokens into the active account profile */
export function syncCurrentAccountToProfile(name: string) {
  const s = store()
  if (!s) return
  const token = getAccessToken()
  const refresh = getRefreshToken()
  const sessionId = getSessionId()
  if (!token || !sessionId) return

  const email = getActiveEmail()
  if (!email) return

  const accounts = getAccounts()
  const idx = accounts.findIndex((a) => a.email === email)
  const profile: AccountProfile = {
    email,
    name,
    accessToken: token,
    refreshToken: refresh,
    sessionId,
  }
  if (idx >= 0) {
    accounts[idx] = profile
  } else {
    accounts.push(profile)
  }
  saveAccounts(accounts)
}

/** Initialise active account from stored profiles on app load */
export function initActiveAccount(): AccountProfile | null {
  const accounts = getAccounts()
  const activeEmail = getActiveEmail()
  if (!activeEmail || accounts.length === 0) return null

  const profile = accounts.find((a) => a.email === activeEmail)
  if (profile) {
    setAuthTokens(profile.accessToken, profile.refreshToken)
    const s = store()
    if (s) s.setItem(SESSION_ID_STORAGE_KEY, profile.sessionId)
    return profile
  }
  return null
}

/** Switch to a different account */
export function switchToAccount(email: string) {
  const accounts = getAccounts()
  const profile = accounts.find((a) => a.email === email)
  if (!profile) return false

  setAuthTokens(profile.accessToken, profile.refreshToken)
  const s = store()
  if (s) s.setItem(SESSION_ID_STORAGE_KEY, profile.sessionId)
  setActiveEmail(email)
  return true
}

/** Add a new account after successful login */
export function addAccount(email: string, name: string, accessToken: string, refreshToken: string | null, sessionId: string) {
  const accounts = getAccounts()
  const idx = accounts.findIndex((a) => a.email === email)
  const profile: AccountProfile = { email, name, accessToken, refreshToken, sessionId }
  if (idx >= 0) {
    accounts[idx] = profile
  } else {
    accounts.push(profile)
  }
  saveAccounts(accounts)
  setAuthTokens(accessToken, refreshToken)
  const s = store()
  if (s) s.setItem(SESSION_ID_STORAGE_KEY, sessionId)
  setActiveEmail(email)
}

/** Remove an account from the list. Returns the next active email or null. */
export function removeAccount(email: string): string | null {
  let accounts = getAccounts()
  accounts = accounts.filter((a) => a.email !== email)
  saveAccounts(accounts)

  if (accounts.length === 0) {
    const s = store()
    if (s) s.removeItem(ACTIVE_EMAIL_STORAGE_KEY)
    clearAuthSession()
    return null
  }

  const next = accounts[0].email
  switchToAccount(next)
  return next
}

/** Called after login to store the initial account */
export function initFirstAccount(email: string, name: string, accessToken: string, refreshToken: string | null, sessionId: string) {
  setActiveEmail(email)
  const profile: AccountProfile = { email, name, accessToken, refreshToken, sessionId }
  saveAccounts([profile])
}
