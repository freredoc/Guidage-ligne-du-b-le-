import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ensureNativeLocationPermission } from './utils/native'
import './styles.css'

// Enregistre le service worker (mode hors ligne). autoUpdate géré par le plugin.
registerSW({ immediate: true })

// Sur l'APK Android (Capacitor), demande la permission GPS native au démarrage.
ensureNativeLocationPermission()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
