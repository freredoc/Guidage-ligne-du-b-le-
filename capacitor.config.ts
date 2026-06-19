import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'fr.tan.gpsbus',
  appName: 'TAN GPS Bus',
  // Le bundle web (Vite) est embarqué dans l'APK : app autonome, hors ligne.
  webDir: 'dist',
  android: {
    // Schéma https://localhost pour un contexte sécurisé (GPS, WakeLock…).
    allowMixedContent: false,
  },
}

export default config
