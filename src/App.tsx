import { useEffect, useState } from 'react'
import type { AppSettings, LinesFile, ServiceConfig } from './types'
import linesData from './data/tan_gps_final.json'
import { LineSelector } from './components/LineSelector'
import { DrivingScreen } from './components/DrivingScreen'
import {
  unlockSpeech,
  setPreferredVoice,
  isSpeechSupported,
} from './utils/speech'
import { checkUpdate, type UpdateInfo } from './utils/update'

const lines = linesData as unknown as LinesFile

const SETTINGS_KEY = 'tan-gps-settings'

const DEFAULT_SETTINGS: AppSettings = {
  voiceEnabled: true,
  vibrationEnabled: true,
  voiceURI: null,
  nightMode: 'dark',
  headingUp: false,
  autoFollow: true,
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS
}

export default function App() {
  const [service, setService] = useState<ServiceConfig | null>(null)
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [soundUnlocked, setSoundUnlocked] = useState(false)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  // Vérification automatique d'une mise à jour au démarrage (silencieuse si
  // hors ligne ou déjà à jour). Surtout utile pour l'APK (la PWA s'actualise
  // seule via le service worker).
  useEffect(() => {
    checkUpdate()
      .then((info) => info.hasUpdate && setUpdate(info))
      .catch(() => {})
  }, [])

  // Persiste les réglages et applique la voix préférée.
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      /* ignore */
    }
    setPreferredVoice(settings.voiceURI)
  }, [settings])

  const changeSettings = (patch: Partial<AppSettings>) =>
    setSettings((s) => ({ ...s, ...patch }))

  const endService = () => {
    setService(null)
    setSoundUnlocked(false)
  }

  if (!service) {
    return (
      <LineSelector lines={lines} onStart={setService} update={update} />
    )
  }

  const line = lines[service.lineId]

  // Verrou son (iOS) : la synthèse vocale exige un geste utilisateur.
  const needSoundGate =
    settings.voiceEnabled && isSpeechSupported() && !soundUnlocked

  return (
    <>
      <DrivingScreen
        line={line}
        service={service}
        settings={settings}
        onChangeSettings={changeSettings}
        onEndService={endService}
      />
      {needSoundGate && (
        <div className="sound-gate">
          <strong style={{ fontSize: 20 }}>Activer le son</strong>
          <p>
            Touchez pour autoriser les annonces vocales du guidage. Indispensable
            sur iPhone (Safari n'autorise la voix qu'après une action).
          </p>
          <button
            onClick={() => {
              unlockSpeech()
              setSoundUnlocked(true)
            }}
          >
            🔊 Activer les annonces
          </button>
          <button
            style={{ background: 'transparent', color: 'var(--text-dim)' }}
            onClick={() => setSoundUnlocked(true)}
          >
            Continuer sans le son
          </button>
        </div>
      )}
    </>
  )
}
