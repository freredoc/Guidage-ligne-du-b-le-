import type { LatLon } from '../types'

const R = 6371000 // rayon terrestre moyen en mètres
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

/** Distance haversine en mètres entre deux points (lat, lon). */
export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Cap initial (bearing) en degrés [0,360) de A vers B. */
export function bearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lon2 - lon1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/**
 * Projection locale équirectangulaire (mètres) autour d'une latitude de
 * référence. Suffisant pour les calculs d'angle/snap à l'échelle urbaine.
 */
export function toLocalXY(
  lat: number,
  lon: number,
  refLat: number,
): { x: number; y: number } {
  const x = toRad(lon) * R * Math.cos(toRad(refLat))
  const y = toRad(lat) * R
  return { x, y }
}

export interface SnapResult {
  /** Point projeté sur la polyligne. */
  point: LatLon
  /** Index du segment [i, i+1] sur lequel tombe la projection. */
  segmentIndex: number
  /** Distance perpendiculaire au tracé, en mètres. */
  distance: number
  /** Distance cumulée depuis le début du tracé jusqu'au point projeté (m). */
  along: number
}

/**
 * Projette une position sur la polyligne (snap-to-route) en testant chaque
 * segment. Retourne le point projeté, le segment, la distance au tracé et la
 * distance cumulée le long du tracé.
 */
export function snapToRoute(
  lat: number,
  lon: number,
  route: LatLon[],
): SnapResult | null {
  if (route.length === 0) return null
  if (route.length === 1) {
    return {
      point: route[0],
      segmentIndex: 0,
      distance: haversine(lat, lon, route[0][0], route[0][1]),
      along: 0,
    }
  }

  const refLat = lat
  const p = toLocalXY(lat, lon, refLat)
  let best: SnapResult | null = null
  let cumulative = 0

  for (let i = 0; i < route.length - 1; i++) {
    const a = toLocalXY(route[i][0], route[i][1], refLat)
    const b = toLocalXY(route[i + 1][0], route[i + 1][1], refLat)
    const abx = b.x - a.x
    const aby = b.y - a.y
    const segLenSq = abx * abx + aby * aby
    let t = 0
    if (segLenSq > 0) {
      t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / segLenSq
      t = Math.max(0, Math.min(1, t))
    }
    const projLat = route[i][0] + t * (route[i + 1][0] - route[i][0])
    const projLon = route[i][1] + t * (route[i + 1][1] - route[i][1])
    const dist = haversine(lat, lon, projLat, projLon)
    const segLen = haversine(
      route[i][0],
      route[i][1],
      route[i + 1][0],
      route[i + 1][1],
    )

    if (best === null || dist < best.distance) {
      best = {
        point: [projLat, projLon],
        segmentIndex: i,
        distance: dist,
        along: cumulative + t * segLen,
      }
    }
    cumulative += segLen
  }
  return best
}

/**
 * Localise une suite de points (arrêts, dans l'ordre officiel) le long d'un
 * tracé et renvoie leur distance cumulée. La recherche avance segment par
 * segment (chaque arrêt est cherché en avant du précédent), ce qui produit des
 * valeurs monotones et reste correct sur les tracés à boucle (terminus).
 */
export function locateStopsAlong(route: LatLon[], points: LatLon[]): number[] {
  const n = route.length
  if (n < 2) return points.map(() => 0)
  const cum = new Array<number>(n).fill(0)
  for (let i = 1; i < n; i++) {
    cum[i] =
      cum[i - 1] +
      haversine(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1])
  }

  const out: number[] = []
  let startSeg = 0
  let prevAlong = 0
  for (const [lat, lon] of points) {
    const p = toLocalXY(lat, lon, lat)
    let best = { dist: Infinity, along: cum[startSeg], seg: startSeg }
    for (let i = startSeg; i < n - 1; i++) {
      const a = toLocalXY(route[i][0], route[i][1], lat)
      const b = toLocalXY(route[i + 1][0], route[i + 1][1], lat)
      const abx = b.x - a.x
      const aby = b.y - a.y
      const segLenSq = abx * abx + aby * aby
      let t = 0
      if (segLenSq > 0) {
        t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / segLenSq
        t = Math.max(0, Math.min(1, t))
      }
      const projLat = route[i][0] + t * (route[i + 1][0] - route[i][0])
      const projLon = route[i][1] + t * (route[i + 1][1] - route[i][1])
      const d = haversine(lat, lon, projLat, projLon)
      if (d < best.dist) {
        best = { dist: d, along: cum[i] + t * (cum[i + 1] - cum[i]), seg: i }
      }
    }
    const along = Math.max(prevAlong, best.along)
    out.push(along)
    prevAlong = along
    startSeg = best.seg
  }
  return out
}

/** Distance cumulée d'un point d'index donné depuis le début du tracé (m). */
export function cumulativeDistance(route: LatLon[], index: number): number {
  let d = 0
  for (let i = 0; i < index && i < route.length - 1; i++) {
    d += haversine(route[i][0], route[i][1], route[i + 1][0], route[i + 1][1])
  }
  return d
}

/**
 * Angle de braquage (en degrés) au sommet B formé par A→B→C.
 * 0° = tout droit, 180° = demi-tour. Le signe via {@link turnSide}.
 */
export function turnAngle(a: LatLon, b: LatLon, c: LatLon): number {
  const refLat = b[0]
  const pa = toLocalXY(a[0], a[1], refLat)
  const pb = toLocalXY(b[0], b[1], refLat)
  const pc = toLocalXY(c[0], c[1], refLat)
  const v1x = pb.x - pa.x
  const v1y = pb.y - pa.y
  const v2x = pc.x - pb.x
  const v2y = pc.y - pb.y
  const dot = v1x * v2x + v1y * v2y
  const m1 = Math.hypot(v1x, v1y)
  const m2 = Math.hypot(v2x, v2y)
  if (m1 === 0 || m2 === 0) return 0
  let cos = dot / (m1 * m2)
  cos = Math.max(-1, Math.min(1, cos))
  return toDeg(Math.acos(cos))
}

/**
 * Sens du virage en B (A→B→C) via le produit vectoriel 2D.
 * Retourne 'left' (gauche) ou 'right' (droite).
 */
export function turnSide(a: LatLon, b: LatLon, c: LatLon): 'left' | 'right' {
  const refLat = b[0]
  const pa = toLocalXY(a[0], a[1], refLat)
  const pb = toLocalXY(b[0], b[1], refLat)
  const pc = toLocalXY(c[0], c[1], refLat)
  const v1x = pb.x - pa.x
  const v1y = pb.y - pa.y
  const v2x = pc.x - pb.x
  const v2y = pc.y - pb.y
  // Produit vectoriel z = v1 × v2. y pointe vers le Nord, x vers l'Est.
  const cross = v1x * v2y - v1y * v2x
  return cross > 0 ? 'left' : 'right'
}

/** Formate une distance en mètres pour affichage (ex: "320 m", "1,2 km"). */
export function formatDistance(m: number): string {
  if (!isFinite(m)) return '—'
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

/** Formate une durée (secondes) en "~45 s" ou "~2 min". */
export function formatEta(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds)) return '—'
  if (seconds < 90) return `~${Math.round(seconds / 5) * 5} s`
  return `~${Math.round(seconds / 60)} min`
}
