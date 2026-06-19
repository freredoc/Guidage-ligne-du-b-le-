import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLon } from '../types'
import type { OrderedStop } from '../hooks/useLineProgress'

interface Props {
  color: string
  route: LatLon[]
  stops: OrderedStop[]
  passed: boolean[]
  nextIndex: number
  busLat: number | null
  busLon: number | null
  heading: number | null
  autoFollow: boolean
  headingUp: boolean
  /** Incrémenté pour forcer un recentrage immédiat. */
  recenterSignal: number
  /** Appelé quand l'utilisateur déplace la carte manuellement. */
  onUserPan: () => void
}

const DARK_TILES =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'

function busIconHtml(color: string): string {
  return `<div class="bus-arrow"><svg width="36" height="36" viewBox="0 0 36 36">
    <circle cx="18" cy="18" r="9" fill="rgba(0,0,0,0.35)"/>
    <path d="M18 3 L29 31 L18 24 L7 31 Z" fill="${color}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
  </svg></div>`
}

export function DrivingMap(props: Props) {
  const {
    color,
    route,
    stops,
    passed,
    nextIndex,
    busLat,
    busLon,
    heading,
    autoFollow,
    headingUp,
    recenterSignal,
    onUserPan,
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const busMarkerRef = useRef<L.Marker | null>(null)
  const stopMarkersRef = useRef<L.Marker[]>([])
  const autoFollowRef = useRef(autoFollow)
  autoFollowRef.current = autoFollow

  // --- Init carte (une seule fois) ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      zoom: 15,
      center: route.length ? route[0] : [47.218, -1.553],
    })
    L.tileLayer(DARK_TILES, {
      maxZoom: 19,
      subdomains: 'abcd',
      crossOrigin: true,
    }).addTo(map)

    // Un geste de pan/zoom utilisateur désactive l'auto-suivi.
    map.on('dragstart', () => {
      if (autoFollowRef.current) onUserPan()
    })

    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 0)

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Tracé de la ligne + arrêts (sur changement de ligne/sens) ---
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const layers: L.Layer[] = []
    // Liseré sombre pour le contraste, puis trait couleur.
    L.polyline(route, { color: '#000', weight: 9, opacity: 0.5 }).addTo(map)
    const main = L.polyline(route, {
      color,
      weight: 5,
      opacity: 0.95,
      lineJoin: 'round',
    }).addTo(map)
    layers.push(main)

    // Arrêts numérotés.
    stopMarkersRef.current = stops.map((s, i) => {
      const icon = L.divIcon({
        className: '',
        html: `<div class="stop-dot" style="width:22px;height:22px">${i + 1}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      })
      const m = L.marker([s.lat, s.lon], { icon, interactive: true })
        .addTo(map)
        .bindTooltip(s.name, {
          className: 'stop-tip',
          direction: 'top',
          offset: [0, -12],
        })
      return m
    })

    if (route.length) {
      map.fitBounds(L.latLngBounds(route as L.LatLngExpression[]), {
        padding: [40, 40],
      })
    }

    return () => {
      stopMarkersRef.current.forEach((m) => map.removeLayer(m))
      stopMarkersRef.current = []
      // Retire les polylignes (trait principal + liseré sombre).
      map.eachLayer((l) => {
        if (l instanceof L.Polyline) map.removeLayer(l)
      })
    }
  }, [route, stops, color])

  // --- Mise à jour des états d'arrêts (passé / courant) ---
  useEffect(() => {
    stopMarkersRef.current.forEach((m, i) => {
      const el = m.getElement()?.querySelector('.stop-dot') as HTMLElement | null
      if (!el) return
      el.classList.toggle('passed', passed[i] === true)
      el.classList.toggle('current', i === nextIndex)
    })
  }, [passed, nextIndex])

  // --- Marqueur bus : position + cap ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || busLat == null || busLon == null) return

    if (!busMarkerRef.current) {
      const icon = L.divIcon({
        className: '',
        html: busIconHtml(color),
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })
      busMarkerRef.current = L.marker([busLat, busLon], {
        icon,
        zIndexOffset: 1000,
        interactive: false,
      }).addTo(map)
    } else {
      busMarkerRef.current.setLatLng([busLat, busLon])
    }

    // Rotation de la flèche selon le cap (toujours = heading ; en mode
    // heading-up le conteneur tourne de -heading, la flèche reste vers le haut).
    const arrow = busMarkerRef.current
      .getElement()
      ?.querySelector('.bus-arrow') as HTMLElement | null
    if (arrow && heading != null) {
      arrow.style.transform = `rotate(${heading}deg)`
    }

    if (autoFollowRef.current) {
      map.panTo([busLat, busLon], { animate: true, duration: 0.5 })
    }
  }, [busLat, busLon, heading, color])

  // --- Recentrage forcé ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || busLat == null || busLon == null) return
    map.setView([busLat, busLon], Math.max(map.getZoom(), 15), {
      animate: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal])

  // --- Mode heading-up : rotation continue du conteneur selon le cap ---
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (headingUp && heading != null) {
      el.style.transform = `rotate(${-heading}deg)`
    } else {
      el.style.transform = 'none'
    }
  }, [headingUp, heading])

  // Recalcule la taille de la carte quand le conteneur est agrandi (heading-up).
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 320)
    return () => clearTimeout(t)
  }, [headingUp])

  return (
    <div className="map-wrap" style={{ overflow: 'hidden' }}>
      <div
        ref={containerRef}
        style={{
          width: headingUp ? '170%' : '100%',
          height: headingUp ? '170%' : '100%',
          position: 'absolute',
          top: headingUp ? '-35%' : 0,
          left: headingUp ? '-35%' : 0,
          transformOrigin: 'center center',
          transition: 'transform 0.3s ease-out',
        }}
      />
    </div>
  )
}
