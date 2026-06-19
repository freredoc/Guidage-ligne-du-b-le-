import { useEffect, useRef } from 'react'

/**
 * Maintient l'écran allumé pendant le service via la Wake Lock API.
 * Ré-acquiert le verrou au retour de visibilité (l'OS le libère en arrière-plan).
 * Silencieux si l'API n'est pas supportée.
 */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active) return
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> }
    }
    if (!nav.wakeLock) return

    let released = false

    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible') return
        lockRef.current = await nav.wakeLock!.request('screen')
        lockRef.current.addEventListener('release', () => {
          lockRef.current = null
        })
      } catch {
        /* refus ou non supporté : on ignore silencieusement */
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !released) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibility)
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
    }
  }, [active])
}
