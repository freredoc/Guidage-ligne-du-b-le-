export type LatLon = [number, number]

export interface Stop {
  id: string
  name: string
  lat: number
  lon: number
}

export interface LineData {
  nom: string
  long_name: string
  color: string
  text_color: string
  shapes: {
    dir0: LatLon[]
    dir1: LatLon[]
  }
  stops: Stop[]
}

export type LinesFile = Record<string, LineData>

export type Direction = 'dir0' | 'dir1'

export interface ServiceConfig {
  lineId: string
  direction: Direction
  /** Numéro de service/course saisi par le machiniste (mémo, sans logique). */
  serviceNumber: string
}

export interface AppSettings {
  voiceEnabled: boolean
  vibrationEnabled: boolean
  /** voiceURI de la voix de synthèse choisie, ou null = voix par défaut. */
  voiceURI: string | null
  /** 'auto' suit l'heure, 'dark' force le mode nuit (toujours sombre ici). */
  nightMode: 'auto' | 'dark'
  /** Rotation de la carte dans le sens de marche (heading-up). */
  headingUp: boolean
  /** Recentrage automatique de la carte sur le bus. */
  autoFollow: boolean
}

export interface GeoState {
  lat: number | null
  lon: number | null
  /** Vitesse en m/s (peut être null tant que le GPS n'est pas calibré). */
  speed: number | null
  /** Cap en degrés (0 = Nord), null si indisponible. */
  heading: number | null
  accuracy: number | null
  timestamp: number | null
  error: string | null
  /** 'prompt' | 'granted' | 'denied' | 'unsupported' | 'unknown' */
  permission: GeoPermission
}

export type GeoPermission =
  | 'unknown'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unsupported'

export interface TurnInfo {
  /** 'left' | 'right' | null si pas de virage marqué devant. */
  side: 'left' | 'right' | null
  /** Distance au virage en mètres. */
  distance: number
  /** Angle du virage en degrés. */
  angle: number
}
