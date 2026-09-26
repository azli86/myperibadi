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
/**
 * Token yang hanya bermakna "auth melalui cookie HttpOnly" — bukan JWT sebenar.
 * Profil yang menyimpan ini masih boleh dihidupkan (permintaan akan bawa cookie).
 */
const COOKIE_AUTH_SENTINEL_FALLBACK = "__cookie_auth__"

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

/**
 * Sync the active account's name (and current session id) into its profile.
 *
 * Token TIDAK disalin dari storan auth-session. Server hanya menyimpan hash
 * refresh token TERAKHIR (session_row.refresh_token_hash), jadi menyalin token
 * yang lebih baru ke dalam profil akan membuat profil akaun ini mustahil
 * dihidupkan semula selepas akaun lain me-refresh — pusing balik ke akaun ini
 * akan hantar token lama -> 401 "Invalid refresh token" berulang.
 */
export function syncCurrentAccountToProfile(name: string) {
  const s = store()
  if (!s) return
  const sessionId = getSessionId()
  if (!sessionId) return

  const email = getActiveEmail()
  if (!email) return

  const accounts = getAccounts()
  const idx = accounts.findIndex((a) => a.email === email)
  const existing = idx >= 0 ? accounts[idx] : null
  const profile: AccountProfile = {
    email,
    name,
    // Kekalkan token profil yang diterbitkan semasa akaun ini terakhir aktif.
    accessToken: existing?.accessToken ?? getAccessToken() ?? COOKIE_AUTH_SENTINEL_FALLBACK,
    refreshToken: existing?.refreshToken ?? getRefreshToken(),
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

/** Switch to a different account. Returns false bila profil tiada / tidak boleh dihidupkan. */
export function switchToAccount(email: string) {
  const accounts = getAccounts()
  const profile = accounts.find((a) => a.email === email)
  if (!profile) return false

  // Profil tanpa refresh token tidak boleh dihidupkan: setAuthTokens akan
  // biarkan refresh token akaun SEBELUM ini di dalam storan, jadi app nampak
  // 'berjaya tukar' tetapi setiap panggilan API gagal 401 -> butang seolah-olah
  // 'tk kluar pape'. Lapor gagal supaya pemanggil boleh minta login semula.
  if (!profile.refreshToken) return false

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

/**
 * Called after login to store the account.
 * Upsert — menyimpan akaun lain yang sudah ada. Sebelum ini ia guna
 * saveAccounts([profile]), jadi setiap login menimpa seluruh senarai
 * (akaun lain terus hilang -> butang "Tukar akaun" nampak tak berfungsi).
 */
export function initFirstAccount(email: string, name: string, accessToken: string, refreshToken: string | null, sessionId: string) {
  setActiveEmail(email)
  const accounts = getAccounts()
  const idx = accounts.findIndex((a) => a.email === email)
  const profile: AccountProfile = { email, name, accessToken, refreshToken, sessionId }
  if (idx >= 0) {
    accounts[idx] = profile
  } else {
    accounts.push(profile)
  }
  saveAccounts(accounts)
}

