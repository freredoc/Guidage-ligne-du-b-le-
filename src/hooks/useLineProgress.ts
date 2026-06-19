import { useMemo, useRef, useState, useEffect } from 'react'
import type { LatLon, Stop } from '../types'
import { haversine, snapToRoute, cumulativeDistance } from '../utils/geo'

export interface OrderedStop extends Stop {
  /** Distance cumulée de l'arrêt le long du tracé (m). */
  along: number
  /** Index original dans la liste de la ligne. */
  originalIndex: number
}

export interface LineProgress {
  orderedStops: OrderedStop[]
  /** Index (dans orderedStops) de l'arrêt courant / prochain à desservir. */
  nextIndex: number
  /** Prochain arrêt à desservir, ou null si terminus atteint. */
  nextStop: OrderedStop | null
  /** Distance haversine à vol d'oiseau jusqu'au prochain arrêt (m). */
  distanceToNext: number
  /** ETA en secondes basée sur la vitesse GPS, ou null. */
  etaSeconds: number | null
  /** Point projeté du bus sur le tracé (snap-to-route). */
  snapPoint: LatLon | null
  /** Distance perpendiculaire au tracé (m) — grande = hors itinéraire. */
  offRouteDistance: number
  /** true quand le terminus est atteint. */
  isFinished: boolean
  /** Tableau parallèle à orderedStops : arrêt déjà desservi ou non. */
  passed: boolean[]
}

const PASS_THRESHOLD_M = 40
// Marge de recalage : un arrêt n'est sauté automatiquement que si la position
// projetée le dépasse d'au moins cette distance (évite de sauter un arrêt
// encore devant le bus quand on est seulement « à sa hauteur »).
const RECAL_MARGIN_M = 70

/**
 * Logique de progression sur la ligne :
 *  - ordonne les arrêts selon leur position le long du tracé (gère les 2 sens) ;
 *  - détermine l'arrêt courant via la distance cumulée projetée (recalage
 *    automatique en cas de saut GPS / demi-tour) ;
 *  - confirme le passage d'un arrêt sous 50 m avec vitesse > 0.
 */
export function useLineProgress(
  route: LatLon[],
  stops: Stop[],
  lat: number | null,
  lon: number | null,
  speed: number | null,
): LineProgress {
  // Pré-calcul : ordonner les arrêts le long du tracé choisi.
  const orderedStops = useMemo<OrderedStop[]>(() => {
    const withAlong = stops.map((s, originalIndex) => {
      const snap = snapToRoute(s.lat, s.lon, route)
      const along = snap ? snap.along : cumulativeDistance(route, 0)
      return { ...s, along, originalIndex }
    })
    withAlong.sort((a, b) => a.along - b.along)
    return withAlong
  }, [route, stops])

  // Pointeur de progression : n'avance pas en arrière sauf recalage explicite.
  const [nextIndex, setNextIndex] = useState(0)
  const nextIndexRef = useRef(0)
  nextIndexRef.current = nextIndex

  // Réinitialise quand la ligne/le sens change.
  useEffect(() => {
    setNextIndex(0)
    nextIndexRef.current = 0
  }, [orderedStops])

  const result = useMemo<LineProgress>(() => {
    const n = orderedStops.length
    const passed = new Array<boolean>(n).fill(false)

    if (lat == null || lon == null || n === 0) {
      const idx = Math.min(nextIndex, n - 1)
      for (let i = 0; i < idx; i++) passed[i] = true
      return {
        orderedStops,
        nextIndex: idx,
        nextStop: n > 0 ? orderedStops[idx] : null,
        distanceToNext: Infinity,
        etaSeconds: null,
        snapPoint: null,
        offRouteDistance: Infinity,
        isFinished: false,
        passed,
      }
    }

    const snap = snapToRoute(lat, lon, route)
    const alongPos = snap ? snap.along : 0
    const offRoute = snap ? snap.distance : Infinity
    const moving = speed != null && speed > 0

    // L'arrêt n'est considéré « passé » que lorsqu'on l'a réellement atteint
    // (proximité), pas dès qu'on est à sa hauteur sur le tracé. On part du
    // pointeur courant et on n'avance que sur deux conditions claires.
    let idx = nextIndexRef.current

    // 1) Recalage : on a nettement dépassé l'arrêt cible le long du tracé
    //    (saut GPS, arrêt manqué, prise de service en cours de ligne). Marge
    //    large pour ne JAMAIS sauter un arrêt encore devant nous.
    while (idx < n && alongPos > orderedStops[idx].along + RECAL_MARGIN_M) {
      idx++
    }

    // 2) Passage normal : on est arrivé sur l'arrêt (< seuil) en roulant.
    while (
      idx < n &&
      moving &&
      haversine(lat, lon, orderedStops[idx].lat, orderedStops[idx].lon) <
        PASS_THRESHOLD_M
    ) {
      idx++
    }
    idx = Math.min(idx, n)

    const isFinished = idx >= n
    const nextStop = isFinished ? null : orderedStops[idx]

    for (let i = 0; i < idx; i++) passed[i] = true

    const distanceToNext = nextStop
      ? haversine(lat, lon, nextStop.lat, nextStop.lon)
      : 0

    const etaSeconds =
      nextStop && speed != null && speed > 0.5
        ? distanceToNext / speed
        : null

    return {
      orderedStops,
      nextIndex: isFinished ? n : idx,
      nextStop,
      distanceToNext,
      etaSeconds,
      snapPoint: snap ? snap.point : null,
      offRouteDistance: offRoute,
      isFinished,
      passed,
    }
  }, [orderedStops, route, lat, lon, speed, nextIndex])

  // Persiste l'avancement calculé dans l'état (déclenche les annonces côté UI).
  useEffect(() => {
    if (result.nextIndex !== nextIndexRef.current) {
      nextIndexRef.current = result.nextIndex
      setNextIndex(result.nextIndex)
    }
  }, [result.nextIndex])

  return result
}
