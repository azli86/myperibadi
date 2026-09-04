import { initializeApp, getApps } from "firebase/app"
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging"
import { getAuth, GoogleAuthProvider, signInWithCredential, signInWithPopup, type Auth } from "firebase/auth"

const firebaseConfig = {
  apiKey: "AIzaSyDl7ZC5T3hdRaGlaP6qMYOQyx3u8xUbvEs",
  authDomain: "digitalport-d23f0.firebaseapp.com",
  projectId: "digitalport-d23f0",
  storageBucket: "digitalport-d23f0.firebasestorage.app",
  messagingSenderId: "968953639969",
  appId: "1:968953639969:web:fde4422f15ecda53375f60",
}

let messaging: Messaging | null = null
let auth: Auth | null = null

function getFirebaseApp() {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    const app = getFirebaseApp()
    auth = getAuth(app)
  }
  return auth
}

export async function signInWithGoogle(): Promise<string> {
  const profile = await signInWithGoogleProfile()
  return profile.idToken
}

/**
 * Exchange a Google ID token obtained natively (Android Credential Manager) for
 * a Firebase session, then an ID token. No popup/redirect involved, so this is
 * the path the WebView wrapper uses to pick an on-device Google account.
 */
export async function signInWithGoogleCredential(googleIdToken: string): Promise<{ idToken: string; email: string; name: string }> {
  const googleAuth = getFirebaseAuth()
  const result = await signInWithCredential(googleAuth, GoogleAuthProvider.credential(googleIdToken))
  const idToken = await result.user.getIdToken()
  const email = (result.user.email || "").trim().toLowerCase()
  const name = (result.user.displayName || email.split("@")[0] || "User").trim()
  return { idToken, email, name }
}

export async function signInWithGoogleProfile(): Promise<{
  idToken: string
  email: string
  name: string
}> {
  const googleAuth = getFirebaseAuth()
  const provider = new GoogleAuthProvider()
  // No custom `select_account` prompt: reuse the Google account already on the
  // device (Android/iOS) or last authorized in the browser, skipping the chooser.
  const result = await signInWithPopup(googleAuth, provider)
  const idToken = await result.user.getIdToken()
  const email = (result.user.email || "").trim().toLowerCase()
  const name = (
    result.user.displayName ||
    email.split("@")[0] ||
    "User"
  ).trim()
  return { idToken, email, name }
}

export function getFirebaseMessaging(): Messaging | null {
  if (typeof window === "undefined") return null
  if (!("Notification" in window)) return null
  if (!("serviceWorker" in navigator)) return null

  if (!messaging) {
    const app = getFirebaseApp()
    messaging = getMessaging(app)
  }

  return messaging
}

export async function requestFcmToken(): Promise<string | null> {
  const msg = getFirebaseMessaging()
  if (!msg) {
    console.warn("[FCM] Messaging not available")
    return null
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== "granted") {
      console.warn("[FCM] Permission denied:", permission)
      return null
    }

    console.log("[FCM] Requesting token...")
    const swReg = await navigator.serviceWorker.getRegistration()
    const token = await getToken(msg, {
      serviceWorkerRegistration: swReg || undefined,
    })

    console.log("[FCM] Token obtained:", token ? `${token.slice(0, 30)}...` : "null")
    return token
  } catch (err: any) {
    console.error("[FCM] getToken error:", err?.message || err)
    return null
  }
}

export function onForegroundMessage(callback: (payload: any) => void): () => void {
  const msg = getFirebaseMessaging()
  if (!msg) return () => {}

  return onMessage(msg, callback)
}
