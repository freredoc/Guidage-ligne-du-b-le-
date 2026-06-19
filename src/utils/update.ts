import { isNative } from './native'

// Dépôt source des releases (APK signés).
const REPO = 'freredoc/Guidage-ligne-du-b-le-'

// Version de l'app, injectée au build (tag de release, ex "v1.0.6").
declare const __APP_VERSION__: string
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

export interface UpdateInfo {
  current: string
  latest: string
  hasUpdate: boolean
  /** URL de l'APK de la dernière release (null si absente). */
  apkUrl: string | null
  /** Page de la release. */
  pageUrl: string
  /** true si l'app tourne en APK natif (sinon PWA = MAJ auto). */
  native: boolean
}

function parseV(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
}

/** true si `a` (dernière) est strictement plus récente que `b` (actuelle). */
export function isNewer(a: string, b: string): boolean {
  const pa = parseV(a)
  const pb = parseV(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d > 0
  }
  return false
}

/**
 * Interroge l'API GitHub pour la dernière release et compare à la version
 * courante. Nécessite le réseau ; lève une erreur sinon.
 */
export async function checkUpdate(): Promise<UpdateInfo> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    { headers: { Accept: 'application/vnd.github+json' } },
  )
  if (!res.ok) throw new Error('Vérification impossible (HTTP ' + res.status + ')')
  const j = await res.json()
  const latest: string = j.tag_name ?? ''
  const apk = (j.assets ?? []).find((a: { name: string }) =>
    a.name.toLowerCase().endsWith('.apk'),
  )
  return {
    current: APP_VERSION,
    latest,
    hasUpdate: latest ? isNewer(latest, APP_VERSION) : false,
    apkUrl: apk ? apk.browser_download_url : null,
    pageUrl: j.html_url ?? `https://github.com/${REPO}/releases`,
    native: isNative(),
  }
}
