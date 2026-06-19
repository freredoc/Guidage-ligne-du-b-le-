import { useEffect, useState } from 'react'
import type { AppSettings } from '../types'
import { listVoices, onVoicesChanged, isSpeechSupported } from '../utils/speech'

interface Props {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
  onClose: () => void
  onEndService: () => void
}

function Toggle({
  on,
  onToggle,
}: {
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      className={`switch${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      onClick={onToggle}
    />
  )
}

export function Settings({ settings, onChange, onClose, onEndService }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    const refresh = () => setVoices(listVoices())
    refresh()
    return onVoicesChanged(refresh)
  }, [])

  const frVoices = voices.filter((v) =>
    v.lang.toLowerCase().startsWith('fr'),
  )
  const voiceList = frVoices.length > 0 ? frVoices : voices

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>
          Paramètres
          <button onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </h2>

        <div className="setting-row">
          <div className="label">
            <strong>Annonces vocales</strong>
            <small>Prochain arrêt, virages, terminus</small>
          </div>
          <Toggle
            on={settings.voiceEnabled}
            onToggle={() => onChange({ voiceEnabled: !settings.voiceEnabled })}
          />
        </div>

        <div className="setting-row">
          <div className="label">
            <strong>Vibrations</strong>
            <small>Approche et arrêt imminent</small>
          </div>
          <Toggle
            on={settings.vibrationEnabled}
            onToggle={() =>
              onChange({ vibrationEnabled: !settings.vibrationEnabled })
            }
          />
        </div>

        {isSpeechSupported() && (
          <div className="setting-row">
            <div className="label">
              <strong>Voix de synthèse</strong>
              <small>{voiceList.length} voix disponibles</small>
            </div>
            <select
              className="select-voice"
              value={settings.voiceURI ?? ''}
              onChange={(e) =>
                onChange({ voiceURI: e.target.value || null })
              }
            >
              <option value="">Voix par défaut</option>
              {voiceList.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="setting-row">
          <div className="label">
            <strong>Auto-recentrage</strong>
            <small>La carte suit le bus</small>
          </div>
          <Toggle
            on={settings.autoFollow}
            onToggle={() => onChange({ autoFollow: !settings.autoFollow })}
          />
        </div>

        <div className="setting-row">
          <div className="label">
            <strong>Carte en sens de marche</strong>
            <small>Rotation heading-up</small>
          </div>
          <Toggle
            on={settings.headingUp}
            onToggle={() => onChange({ headingUp: !settings.headingUp })}
          />
        </div>

        <div className="setting-row">
          <div className="label">
            <strong>Mode nuit</strong>
            <small>Thème sombre permanent</small>
          </div>
          <select
            className="select-voice"
            value={settings.nightMode}
            onChange={(e) =>
              onChange({ nightMode: e.target.value as AppSettings['nightMode'] })
            }
          >
            <option value="auto">Auto</option>
            <option value="dark">Forcé</option>
          </select>
        </div>

        <div className="setting-row">
          <div className="label">
            <strong>Unité de distance</strong>
            <small>Mètres / kilomètres</small>
          </div>
          <span style={{ color: 'var(--text-dim)', fontSize: 14 }}>Mètres</span>
        </div>

        <button className="end-btn" onClick={onEndService}>
          Fin de service
        </button>
      </div>
    </div>
  )
}
