/**
 * Wrapper léger autour de speechSynthesis + vibration.
 *
 * Sur iOS, la synthèse vocale n'est autorisée qu'après un geste utilisateur :
 * appeler {@link unlockSpeech} depuis un handler de clic au premier lancement.
 */

let preferredVoiceURI: string | null = null
let unlocked = false

export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  return speechSynthesis.getVoices()
}

/** S'abonne aux changements de la liste de voix (chargement asynchrone). */
export function onVoicesChanged(cb: () => void): () => void {
  if (typeof speechSynthesis === 'undefined') return () => {}
  speechSynthesis.addEventListener('voiceschanged', cb)
  return () => speechSynthesis.removeEventListener('voiceschanged', cb)
}

export function setPreferredVoice(uri: string | null) {
  preferredVoiceURI = uri
}

/**
 * Débloque la synthèse vocale (iOS/Safari) en jouant un énoncé silencieux
 * dans le contexte d'un geste utilisateur. À appeler une fois.
 */
export function unlockSpeech() {
  if (typeof speechSynthesis === 'undefined') return
  try {
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    speechSynthesis.speak(u)
    unlocked = true
  } catch {
    /* ignore */
  }
}

export function isSpeechSupported(): boolean {
  return typeof speechSynthesis !== 'undefined'
}

export function isUnlocked(): boolean {
  return unlocked
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = listVoices()
  if (voices.length === 0) return null
  if (preferredVoiceURI) {
    const v = voices.find((x) => x.voiceURI === preferredVoiceURI)
    if (v) return v
  }
  // Préférence : une voix française.
  const fr = voices.find((v) => v.lang.toLowerCase().startsWith('fr'))
  return fr ?? voices[0]
}

/**
 * Énonce un message. Interrompt l'énoncé courant (les annonces d'arrêt sont
 * prioritaires sur les annonces plus anciennes).
 */
export function speak(text: string, enabled: boolean) {
  if (!enabled || !isSpeechSupported()) return
  try {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'fr-FR'
    u.rate = 1.0
    u.pitch = 1.0
    const v = pickVoice()
    if (v) u.voice = v
    speechSynthesis.speak(u)
  } catch {
    /* ignore */
  }
}

/** Vibration courte (annonce de proximité) ou longue (arrêt imminent). */
export function vibrate(pattern: number | number[], enabled: boolean) {
  if (!enabled) return
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      /* ignore */
    }
  }
}
