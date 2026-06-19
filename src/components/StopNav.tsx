import type { OrderedStop } from '../hooks/useLineProgress'

interface Props {
  lineId: string
  lineColor: string
  lineTextColor: string
  directionLabel: string
  stops: OrderedStop[]
  /** Index actuellement affiché (peut être un override manuel). */
  displayIndex: number
  overridden: boolean
  onPrev: () => void
  onNext: () => void
}

export function StopNav({
  lineId,
  lineColor,
  lineTextColor,
  directionLabel,
  stops,
  displayIndex,
  overridden,
  onPrev,
  onNext,
}: Props) {
  const prevStop = displayIndex > 0 ? stops[displayIndex - 1] : null
  const nextStop =
    displayIndex < stops.length - 1 ? stops[displayIndex + 1] : null

  return (
    <div className="bottombar">
      <button className="nav-btn" disabled={!prevStop} onClick={onPrev}>
        <span className="lbl">← Précéd.</span>
        <span className="nm">{prevStop ? prevStop.name : '—'}</span>
      </button>

      <div className={`center-info${overridden ? ' override' : ''}`}>
        <span
          className="line-chip"
          style={{ background: lineColor, color: lineTextColor }}
        >
          {lineId}
        </span>
        <span className="dir-label">{directionLabel}</span>
      </div>

      <button className="nav-btn" disabled={!nextStop} onClick={onNext}>
        <span className="lbl">Suivant →</span>
        <span className="nm">{nextStop ? nextStop.name : '—'}</span>
      </button>
    </div>
  )
}
