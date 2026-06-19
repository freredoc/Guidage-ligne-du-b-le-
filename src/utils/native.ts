import { Capacitor } from '@capacitor/core'

/** true si l'app tourne dans l'enveloppe native Capacitor (APK Android). */
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Sur Android (APK Capacitor), déclenche la demande de permission de
 * localisation au niveau de l'OS afin que `navigator.geolocation` de la WebView
 * puisse ensuite recevoir des positions. No-op sur le web (la permission y est
 * gérée par le navigateur).
 */
export async function ensureNativeLocationPermission(): Promise<void> {
  if (!isNative()) return
  try {
    const { Geolocation } = await import('@capacitor/geolocation')
    const status = await Geolocation.checkPermissions()
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      await Geolocation.requestPermissions({ permissions: ['location'] })
    }
  } catch {
    /* plugin indisponible : on laisse la WebView gérer la demande */
  }
}
