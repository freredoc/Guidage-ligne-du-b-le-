import { useEffect, useRef, useState } from 'react'
import type { GeoState, GeoPermission } from '../types'

const INITIAL: GeoState = {
  lat: null,
  lon: null,
  speed: null,
  heading: null,
  accuracy: null,
  timestamp: null,
  error: null,
  permission: 'unknown',
}

/**
 * Suivi GPS continu via watchPosition (haute précision).
 * Gère explicitement le refus de permission avec un message clair.
 */
export function useGeolocation(active: boolean): GeoState {
  const [state, setState] = useState<GeoState>(INITIAL)
  const watchIdRef = useRef<number | null>(null)

  // Statut de permission (informatif) si l'API Permissions est dispo.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setState((s) => ({
        ...s,
        permission: 'unsupported',
        error: "La géolocalisation n'est pas supportée par cet appareil.",
      }))
      return
    }
    if ('permissions' in navigator && navigator.permissions?.query) {
      let cancelled = false
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          if (cancelled) return
          const map = (s: string): GeoPermission =>
            s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt'
          setState((prev) => ({ ...prev, permission: map(status.state) }))
          status.onchange = () =>
            setState((prev) => ({ ...prev, permission: map(status.state) }))
        })
        .catch(() => {})
      return () => {
        cancelled = true
      }
    }
  }, [])

  useEffect(() => {
    if (!active || !('geolocation' in navigator)) return

    const onSuccess = (pos: GeolocationPosition) => {
      const c = pos.coords
      setState((prev) => ({
        ...prev,
        lat: c.latitude,
        lon: c.longitude,
        // speed peut être null tant que le GPS n'est pas calibré.
        speed: c.speed != null && !Number.isNaN(c.speed) ? c.speed : null,
        heading:
          c.heading != null && !Number.isNaN(c.heading) ? c.heading : prev.heading,
        accuracy: c.accuracy ?? null,
        timestamp: pos.timestamp,
        error: null,
        permission: 'granted',
      }))
    }

    const onError = (err: GeolocationPositionError) => {
      let msg = 'Erreur de géolocalisation.'
      let permission: GeoPermission = state.permission
      if (err.code === err.PERMISSION_DENIED) {
        msg =
          "Accès à la position refusé. Autorisez la localisation dans les réglages du navigateur pour démarrer le guidage."
        permission = 'denied'
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        msg = 'Position indisponible (signal GPS faible). Recherche en cours…'
      } else if (err.code === err.TIMEOUT) {
        msg = 'Délai GPS dépassé, nouvelle tentative…'
      }
      setState((prev) => ({ ...prev, error: msg, permission }))
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      onSuccess,
      onError,
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return state
}
