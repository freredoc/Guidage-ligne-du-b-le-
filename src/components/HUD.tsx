import type { TurnInfo } from '../types'
import { formatDistance, formatEta } from '../utils/geo'

interface Props {
  nextStopName: string | null
  distanceToNext: number
  etaSeconds: number | null
  isFinished: boolean
  turn: TurnInfo
  /** Message d'alerte (permission/erreur GPS) ou null. */
  alert: { level: 'warn' | 'danger'; text: string } | null
  /** true si l'arrêt affiché vient d'un override manuel. */
  overridden: boolean
}

export function HUD({
  nextStopName,
  distanceToNext,
  etaSeconds,
  isFinished,
  turn,
  alert,
  overridden,
}: Props) {
  return (
    <div className="hud">
      <div className="hud-row">
        <div className="hud-next">
          <small>{isFinished ? 'Service terminé' : overridden ? 'Arrêt (consultation)' : 'Prochain arrêt'}</small>
          <div className="stop-name">
            {isFinished ? 'Terminus' : nextStopName ?? '—'}
          </div>
        </div>
        <div className="hud-metric">
          <small>Dist</small>
          <div className="val">
            {isFinished ? '—' : formatDistance(distanceToNext)}
          </div>
        </div>
        <div className="hud-metric eta">
          <small>ETA</small>
          <div className="val">{isFinished ? '—' : formatEta(etaSeconds)}</div>
        </div>
      </div>

      {turn.side && turn.distance < 150 && (
        <div className="turn-banner">
          <span className="ic">{turn.side === 'left' ? '↰' : '↱'}</span>
          Virage à {turn.side === 'left' ? 'gauche' : 'droite'} dans{' '}
          {formatDistance(turn.distance)}
        </div>
      )}

      {alert && <div className={`banner ${alert.level}`}>{alert.text}</div>}
    </div>
  )
}
