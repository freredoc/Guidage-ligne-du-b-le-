import { useMemo } from 'react'
import type { LatLon, TurnInfo } from '../types'
import { snapToRoute, haversine, bearing } from '../utils/geo'

const ANGLE_THRESHOLD = 35 // degrés (changement de cap net)
const LOOKAHEAD_M = 160 // distance d'anticipation
const WINDOW_M = 22 // demi-fenêtre pour estimer le cap avant/après le virage

/** Ramène un écart d'angle dans [-180, 180]. >0 = sens horaire = droite. */
function normDeg(d: number): number {
  return ((d + 540) % 360) - 180
}

/**
 * Détecte le prochain virage marqué sur le tracé, en avant de la position, à
 * moins de 160 m. Le sens est déterminé par le **changement de cap net** : on
 * compare le cap ~22 m avant et ~22 m après le sommet, ce qui ignore les
 * micro-zigzags de la géométrie routière (points denses, ronds-points) et donne
 * la direction réelle du virage.
 */
export function useTurnDetection(
  route: LatLon[],
  lat: number | null,
  lon: number | null,
): TurnInfo {
  // Distances cumulées le long du tracé (recalculées au changement de ligne).
  const cum = useMemo(() => {
    const c = new Array<number>(route.length).fill(0)
    for (let i = 1; i < route.length; i++) {
      c[i] =
        c[i - 1] +
        haversine(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1])
    }
    return c
  }, [route])

  return useMemo<TurnInfo>(() => {
    const none: TurnInfo = { side: null, distance: Infinity, angle: 0 }
    if (lat == null || lon == null || route.length < 3) return none

    const snap = snapToRoute(lat, lon, route)
    if (!snap) return none
    const alongPos = snap.along
    const total = cum[cum.length - 1]

    // Point du tracé à une distance cumulée donnée (interpolation linéaire).
    const pointAtAlong = (target: number): LatLon => {
      const t = Math.max(0, Math.min(total, target))
      let i = 1
      while (i < cum.length && cum[i] < t) i++
      if (i >= cum.length) return route[route.length - 1]
      const seg = cum[i] - cum[i - 1] || 1
      const f = (t - cum[i - 1]) / seg
      return [
        route[i - 1][0] + f * (route[i][0] - route[i - 1][0]),
        route[i - 1][1] + f * (route[i][1] - route[i - 1][1]),
      ]
    }

    for (let i = snap.segmentIndex + 1; i < route.length - 1; i++) {
      const dist = cum[i] - alongPos
      if (dist < 0) continue
      if (dist > LOOKAHEAD_M) break

      const before = pointAtAlong(cum[i] - WINDOW_M)
      const after = pointAtAlong(cum[i] + WINDOW_M)
      const bIn = bearing(before[0], before[1], route[i][0], route[i][1])
      const bOut = bearing(route[i][0], route[i][1], after[0], after[1])
      const delta = normDeg(bOut - bIn)

      if (Math.abs(delta) >= ANGLE_THRESHOLD) {
        return {
          side: delta > 0 ? 'right' : 'left',
          distance: dist,
          angle: Math.abs(delta),
        }
      }
    }
    return none
  }, [route, lat, lon, cum])
}
