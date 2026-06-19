// Recale les tracés « grossiers » (segments droits entre arrêts) sur le réseau
// routier réel via OSRM (map-matching par routage à travers les points).
// Les tracés déjà détaillés (issus du GTFS) ne sont pas touchés.
//
// Usage : node scripts/refine-osrm.mjs <fichier.json> [osrm_base_url]
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = process.argv[2] || 'src/data/tan_gps_final.json'
const OSRM = (process.argv[3] || 'https://router.project-osrm.org').replace(/\/$/, '')

// Un tracé est « grossier » s'il a peu de points OU un grand espacement moyen.
const COARSE_MAX_POINTS = 120
const COARSE_MIN_SPACING = 60 // m

const R = 6371000
const toRad = (d) => (d * Math.PI) / 180
function haversine(a, b, c, d) {
  const dLat = toRad(c - a)
  const dLon = toRad(d - b)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)))
}
function lineLength(line) {
  let t = 0
  for (let i = 1; i < line.length; i++)
    t += haversine(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1])
  return t
}
function isCoarse(line) {
  if (line.length < 2) return false
  if (line.length > COARSE_MAX_POINTS) return false
  const spacing = lineLength(line) / line.length
  return spacing > COARSE_MIN_SPACING
}
// Retire les points consécutifs identiques (les GTFS grossiers en ont beaucoup).
function dedupe(line) {
  const out = []
  for (const p of line) {
    const last = out[out.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
  }
  return out
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function routeThrough(points) {
  // OSRM attend lon,lat ; on envoie les points (arrêts/timing) comme étapes.
  const coords = points.map((p) => `${p[1]},${p[0]}`).join(';')
  const url = `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson&continue_straight=true`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const j = await res.json()
      if (j.code !== 'Ok' || !j.routes?.[0]) throw new Error('OSRM ' + j.code)
      return j.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon])
    } catch (e) {
      if (attempt === 2) throw e
      await sleep(1500 * (attempt + 1))
    }
  }
}

async function main() {
  const data = JSON.parse(readFileSync(FILE, 'utf8'))
  let refined = 0
  let kept = 0
  for (const [id, line] of Object.entries(data)) {
    for (const dir of ['dir0', 'dir1']) {
      const shape = line.shapes[dir]
      if (!shape || !isCoarse(shape)) {
        if (shape) kept++
        continue
      }
      const pts = dedupe(shape)
      if (pts.length < 2) continue
      try {
        const routed = await routeThrough(pts)
        const origLen = lineLength(shape)
        const newLen = lineLength(routed)
        // Garde-fou : on rejette un itinéraire aberrant (trop long/court).
        if (routed.length < pts.length || newLen > origLen * 1.8 || newLen < origLen * 0.6) {
          console.log(`${id} ${dir}: OSRM rejeté (len ${(newLen / 1000).toFixed(1)}km vs ${(origLen / 1000).toFixed(1)}km) — tracé conservé`)
          continue
        }
        line.shapes[dir] = routed
        refined++
        console.log(`${id} ${dir}: recalé sur route → ${routed.length} pts (${(newLen / 1000).toFixed(1)}km)`)
        await sleep(800) // courtoisie envers le serveur public OSRM
      } catch (e) {
        console.log(`${id} ${dir}: OSRM échec (${e.message}) — tracé grossier conservé`)
      }
    }
  }
  writeFileSync(FILE, JSON.stringify(data))
  console.log(`\n✓ ${refined} sens recalés, ${kept} déjà détaillés/inchangés. Écrit ${FILE}`)
}

main().catch((e) => {
  console.error('ERREUR:', e.message)
  process.exit(1)
})
