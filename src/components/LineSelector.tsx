import { useMemo, useState } from 'react'
import type { Direction, LinesFile, ServiceConfig } from '../types'
import type { UpdateInfo } from '../utils/update'

interface Props {
  lines: LinesFile
  onStart: (config: ServiceConfig) => void
  update: UpdateInfo | null
}

// Ordre d'affichage : Chronobus (C) puis lignes numérotées.
function sortLineIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ca = a.startsWith('C')
    const cb = b.startsWith('C')
    if (ca !== cb) return ca ? -1 : 1
    const na = parseInt(a.replace('C', ''), 10)
    const nb = parseInt(b.replace('C', ''), 10)
    return na - nb
  })
}

/** Terminus = dernier arrêt du sens choisi (ordre GTFS). */
function terminus(lines: LinesFile, lineId: string, dir: Direction): string {
  const stops = lines[lineId].stops[dir]
  if (!stops || stops.length === 0) return ''
  return stops[stops.length - 1].name
}

/** Origine = premier arrêt du sens choisi. */
function origin(lines: LinesFile, lineId: string, dir: Direction): string {
  const stops = lines[lineId].stops[dir]
  if (!stops || stops.length === 0) return ''
  return stops[0].name
}

export function LineSelector({ lines, onStart, update }: Props) {
  const ids = useMemo(() => sortLineIds(Object.keys(lines)), [lines])
  const [lineId, setLineId] = useState<string | null>(null)
  const [direction, setDirection] = useState<Direction | null>(null)
  const [serviceNumber, setServiceNumber] = useState('')

  const canStart = lineId !== null && direction !== null

  return (
    <div className="selector">
      <h1>
        TAN <span>GPS</span> Bus
      </h1>
      <div className="subtitle">Guidage ligne · réseau TAN — Nantes Métropole</div>

      {update && update.hasUpdate && (
        <a
          className="update-banner"
          href={
            update.native ? update.apkUrl ?? update.pageUrl : update.pageUrl
          }
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!update.native) {
              e.preventDefault()
              location.reload()
            }
          }}
        >
          <span>🔔 Nouvelle version {update.latest} disponible</span>
          <span className="up-cta">
            {update.native ? 'Télécharger' : 'Recharger'}
          </span>
        </a>
      )}

      <div className="section-label">Ligne</div>
      <div className="line-grid">
        {ids.map((id) => {
          const line = lines[id]
          const active = id === lineId
          return (
            <button
              key={id}
              className={`line-btn${active ? ' active' : ''}`}
              style={{
                background: line.color,
                color: line.text_color,
              }}
              onClick={() => {
                setLineId(id)
                setDirection(null)
              }}
            >
              {line.nom}
            </button>
          )
        })}
      </div>

      {lineId && (
        <>
          <div className="section-label">Sens de circulation</div>
          <div className="dir-options">
            {(['dir0', 'dir1'] as Direction[]).map((dir) => {
              const active = dir === direction
              return (
                <button
                  key={dir}
                  className={`dir-btn${active ? ' active' : ''}`}
                  onClick={() => setDirection(dir)}
                >
                  <span className="arrow">→</span>
                  <span className="dir-text">
                    <small>
                      Depuis {origin(lines, lineId, dir)}
                    </small>
                    <strong>{terminus(lines, lineId, dir)}</strong>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="section-label">Service / course (optionnel)</div>
          <input
            className="service-input"
            type="text"
            inputMode="numeric"
            placeholder="N° de service (mémo)"
            value={serviceNumber}
            onChange={(e) => setServiceNumber(e.target.value)}
          />
        </>
      )}

      <button
        className="start-btn spacer-top"
        disabled={!canStart}
        onClick={() =>
          canStart &&
          onStart({ lineId: lineId!, direction: direction!, serviceNumber })
        }
      >
        Démarrer le service
      </button>
    </div>
  )
}
