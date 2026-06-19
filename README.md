# TAN GPS Bus — Guidage ligne 🚍

Application **GPS de conduite** pour machinistes-receveurs SEMITAN (réseau TAN,
Nantes Métropole). PWA installable sur mobile : suivi de la position en temps
réel sur le tracé de la ligne, anticipation des arrêts et des virages, annonces
vocales automatiques — **sans manipuler l'écran en conduite**.

> Pas de backend : tout fonctionne en local à partir du fichier de données
> `tan_gps_final.json` embarqué. Une fois chargée, l'app fonctionne **hors ligne**.

---

## ✨ Fonctionnalités

- **Sélection de service** : 8 lignes aux couleurs officielles TAN (C1, C6, C7,
  10, 11, 23, 85, 86), choix du sens (terminus affichés), n° de service (mémo).
- **Mode conduite minimaliste** (thème sombre exclusif) :
  - Carte Leaflet + fond **CartoDB Dark Matter**, tracé en couleur officielle (5 px).
  - **Flèche de position** orientée selon le cap, recentrage auto, rotation
    *heading-up* optionnelle.
  - Arrêts numérotés (passés grisés, arrêt courant en valeur).
  - **HUD** : prochain arrêt (gros), distance (haversine temps réel), ETA (vitesse GPS).
  - Bandeau inférieur : consultation manuelle arrêt précédent/suivant
    (retour auto à la position calculée après 10 s), pastille vitesse km/h.
- **Annonces vocales + vibrations** automatiques :
  | Déclencheur | Action |
  |---|---|
  | < 300 m du prochain arrêt | Vibration courte + *« Prochain arrêt : … »* |
  | < 80 m | Vibration longue + *« Arrêt … »* |
  | Virage > 30° à < 150 m | *« Virage gauche/droite dans X mètres »* |
  | Terminus atteint | *« Terminus … Fin de service. »* |
- **Progression intelligente** : arrêt courant = prochain arrêt non dépassé le
  long du tracé ; passage confirmé sous 50 m avec vitesse > 0 ; **recalage
  automatique** par projection sur le tracé (snap-to-route) en cas de saut GPS
  ou de demi-tour.
- **Hors ligne** : service worker (Workbox) — bundle, données et tuiles CartoDB
  mises en cache (`StaleWhileRevalidate`).
- **Paramètres** : annonces on/off, vibrations on/off, choix de la voix, mode
  nuit, auto-recentrage, heading-up, fin de service.
- **Confort conduite** : écran maintenu allumé (**Wake Lock API**), interface
  paysage/portrait, aucune interaction nécessaire pendant le service.

---

## 🛠️ Stack

React + TypeScript (Vite) · Leaflet · `vite-plugin-pwa` (Workbox) ·
Web APIs : Geolocation, SpeechSynthesis, Vibration, Wake Lock.

---

## 🚀 Installation & développement

Prérequis : **Node ≥ 18**.

```bash
npm install
npm run dev        # serveur de dev → http://localhost:5173
```

> ⚠️ La géolocalisation et les API PWA exigent un contexte **sécurisé**
> (HTTPS ou `localhost`). Sur un vrai téléphone, testez via HTTPS (voir déploiement)
> ou un tunnel (ex. `npx vite --host` + reverse-proxy HTTPS).

### Régénérer les icônes PWA

```bash
npm run icons      # génère public/icons/icon-{192,512,512-maskable}.png
```

---

## 📦 Build de production

```bash
npm run build      # vérifie les types puis produit le bundle PWA dans dist/
npm run preview    # prévisualise le build (http://localhost:4173)
```

Le dossier `dist/` est un site **statique** complet (HTML/JS/CSS + `sw.js` +
`manifest.webmanifest` + icônes), déployable sur n'importe quel hébergement.

---

## 🌐 Déploiement

### Hébergement statique (Nginx, Apache, Netlify, Vercel…)

Copiez le contenu de `dist/` à la racine du serveur. Servez en **HTTPS**
(obligatoire pour GPS / service worker / Wake Lock).

### GitHub Pages (sous-dossier)

Le `base` est paramétrable via la variable d'environnement `BASE_PATH` :

```bash
BASE_PATH="/guidage-ligne-du-b-le-/" npm run build
```

Publiez ensuite `dist/` sur la branche `gh-pages` (ou via une action). L'app
sera servie sous `https://<user>.github.io/guidage-ligne-du-b-le-/`.

---

## 📲 Installation sur le téléphone (PWA)

1. Ouvrir l'URL HTTPS dans le navigateur mobile.
2. **Android (Chrome)** : menu ⋮ → *Ajouter à l'écran d'accueil*.
3. **iOS (Safari)** : *Partager* → *Sur l'écran d'accueil*.
4. Au premier démarrage d'un service, toucher **« Activer le son »**
   (obligatoire sur iOS : Safari n'autorise la synthèse vocale qu'après un geste).

Pour préparer le **mode hors ligne**, parcourez une fois la zone et la ligne
avec du réseau : les tuiles consultées et les données sont mises en cache.

---

## 🗂️ Données

Le fichier `src/data/tan_gps_final.json` contient, pour chaque ligne :
`nom`, `long_name`, `color`/`text_color`, `shapes.dir0` / `shapes.dir1`
(polylignes `[lat, lon]`) et `stops` (`id`, `name`, `lat`, `lon`).
Pour mettre à jour les lignes, remplacez ce fichier et relancez le build.

---

## 🧱 Architecture

```
src/
├── data/tan_gps_final.json     ← données des lignes (embarquées)
├── hooks/
│   ├── useGeolocation.ts        ← watchPosition (highAccuracy, speed, heading)
│   ├── useLineProgress.ts       ← arrêt courant, distance, ETA, recalage
│   ├── useTurnDetection.ts      ← détection des virages sur la polyligne
│   └── useWakeLock.ts           ← écran maintenu allumé
├── components/
│   ├── LineSelector.tsx         ← écran de sélection de service
│   ├── DrivingScreen.tsx        ← orchestration du mode conduite + alertes
│   ├── DrivingMap.tsx           ← carte Leaflet (tracé, arrêts, flèche)
│   ├── HUD.tsx                  ← bandeau prochain arrêt / dist / ETA
│   ├── StopNav.tsx              ← navigation précédent/suivant
│   └── Settings.tsx             ← panneau paramètres
├── utils/
│   ├── geo.ts                   ← haversine, snap-to-route, angles, bearing
│   └── speech.ts                ← synthèse vocale + vibrations
├── App.tsx                      ← machine à états (sélection ↔ conduite)
└── main.tsx                     ← bootstrap + enregistrement service worker
```

---

## 📝 Notes techniques

- `watchPosition` : `{ enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }`,
  message clair si la permission est refusée.
- Le passage d'arrêt ne se déclenche pas tant que `speed` est `null`
  (GPS non calibré au démarrage).
- Wake Lock et synthèse vocale dégradent silencieusement si non supportés.
- Cache des tuiles via Workbox `StaleWhileRevalidate` sur `*.basemaps.cartocdn.com`.

---

## ⚖️ Avertissement

Outil d'**aide à la conduite**. Le machiniste reste seul responsable du respect
du code de la route, de la signalisation et des consignes d'exploitation TAN.
Les couleurs et noms de lignes appartiennent à la SEMITAN / Nantes Métropole.
