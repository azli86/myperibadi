/**
 * Voice-capture helpers shared by the bottom-nav hold recorder and the chat
 * mic. The Android wrapper (WebView) feeds raw mic input with NO platform AGC,
 * so recordings arrive ~25 dB quiet — Whisper only hears filler ("Markers.")
 * and the bot can't read an amount. Chrome/PWA applies its own AGC and needs
 * no help, so the boost path is gated on a flag injected by the native app.
 */

export interface VoiceMediaSetup {
  /** Stream to feed MediaRecorder (boosted copy in the native app). */
  stream: MediaStream
  /** True when the WebAudio boost graph is live. */
  boosted: boolean
  /** Stops the input tracks and closes the boost graph if any. */
  cleanup: () => void
}

declare global {
  interface Window {
    __nativeApp?: boolean
  }
}

export function isNativeWrapper(): boolean {
  try {
    return typeof window !== "undefined" && window.__nativeApp === true
  } catch {
    return false
  }
}

const stopTracks = (s: MediaStream) => s.getTracks().forEach((t) => t.stop())

export function setupVoiceMedia(raw: MediaStream): VoiceMediaSetup {
  const plain: VoiceMediaSetup = {
    stream: raw,
    boosted: false,
    cleanup: () => stopTracks(raw),
  }
  if (!isNativeWrapper()) return plain
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined
  if (!Ctor) return plain
  try {
    const ctx = new Ctor()
    const src = ctx.createMediaStreamSource(raw)
    const gain = ctx.createGain()
    gain.gain.value = 6.0 // ≈ +15.6 dB makeup for whisper-quiet WebView input
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -24
    comp.knee.value = 12
    comp.ratio.value = 10
    comp.attack.value = 0.003
    comp.release.value = 0.18
    const dest = ctx.createMediaStreamDestination()
    src.connect(gain)
    gain.connect(comp)
    comp.connect(dest)
    return {
      stream: dest.stream,
      boosted: true,
      cleanup: () => {
        try {
          src.disconnect()
          gain.disconnect()
          comp.disconnect()
        } catch {}
        void ctx.close().catch(() => {})
        stopTracks(raw)
      },
    }
  } catch {
    return plain
  }
}
