import { useMemo } from 'react'
import type { LatLon, TurnInfo } from '../types'
import { snapToRoute, cumulativeDistance, turnAngle, turnSide } from '../utils/geo'

const ANGLE_THRESHOLD = 30 // degrés
const LOOKAHEAD_M = 150 // distance d'anticipation

/**
 * Détecte le prochain virage marqué (> 30°) sur le tracé, en avant de la
 * position, à moins de 150 m. Le sens (gauche/droite) est donné par le produit
 * vectoriel 2D au sommet du virage.
 */
export function useTurnDetection(
  route: LatLon[],
  lat: number | null,
  lon: number | null,
): TurnInfo {
  return useMemo<TurnInfo>(() => {
    const none: TurnInfo = { side: null, distance: Infinity, angle: 0 }
    if (lat == null || lon == null || route.length < 3) return none

    const snap = snapToRoute(lat, lon, route)
    if (!snap) return none
    const alongPos = snap.along

    // Examine les sommets situés après le segment courant.
    for (let i = snap.segmentIndex + 1; i < route.length - 1; i++) {
      const alongVertex = cumulativeDistance(route, i)
      const dist = alongVertex - alongPos
      if (dist < 0) continue
      if (dist > LOOKAHEAD_M) break // au-delà de l'horizon d'anticipation

      const angle = turnAngle(route[i - 1], route[i], route[i + 1])
      if (angle >= ANGLE_THRESHOLD) {
        return {
          side: turnSide(route[i - 1], route[i], route[i + 1]),
          distance: dist,
          angle,
        }
      }
    }
    return none
  }, [route, lat, lon])
}
