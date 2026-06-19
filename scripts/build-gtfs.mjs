// Convertit un GTFS (dossier extrait) en tan_gps_final.json pour l'app.
// Aucune dépendance externe : lecture en flux des gros fichiers (shapes,
// stop_times) et parseur CSV minimal gérant les champs entre guillemets.
//
// Usage : node scripts/build-gtfs.mjs <dossier_gtfs> <sortie.json>
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'

const GTFS_DIR = process.argv[2] || 'gtfs'
const OUT = process.argv[3] || 'src/data/tan_gps_final.json'

// Lignes à conserver (route_short_name), dans l'ordre d'affichage souhaité.
const TARGET = ['C1', 'C6', 'C7', '10', '11', '23', '85', '86']

// --- Parseur CSV (une ligne) : gère "..." et "" échappé. ---
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inq = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inq) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inq = false
      } else cur += c
    } else {
      if (c === '"') inq = true
      else if (c === ',') {
        out.push(cur)
        cur = ''
      } else cur += c
    }
  }
  out.push(cur)
  return out
}

function readCsv(path) {
  const txt = readFileSync(resolve(GTFS_DIR, path), 'utf8')
  const lines = txt.split(/\r?\n/).filter((l) => l.length > 0)
  const header = parseCsvLine(lines[0]).map((h) => h.replace(/^﻿/, '').trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i])
    const o = {}
    header.forEach((h, j) => (o[h] = vals[j]))
    rows.push(o)
  }
  return rows
}

/** Lecture en flux ligne par ligne, callback(objet) par enregistrement. */
async function streamCsv(path, onRow) {
  const rl = createInterface({
    input: createReadStream(resolve(GTFS_DIR, path), 'utf8'),
    crlfDelay: Infinity,
  })
  let header = null
  for await (const raw of rl) {
    if (!raw) continue
    if (!header) {
      header = parseCsvLine(raw).map((h) => h.replace(/^﻿/, '').trim())
      continue
    }
    const vals = parseCsvLine(raw)
    const o = {}
    header.forEach((h, j) => (o[h] = vals[j]))
    onRow(o)
  }
}

const withHash = (c) => (c ? (c.startsWith('#') ? c : '#' + c) : '')

async function main() {
  console.log(`GTFS: ${GTFS_DIR}`)

  // 1) routes.txt → routes cibles
  const routes = readCsv('routes.txt')
  const targetRoutes = new Map() // route_id -> {short, long, color, text}
  for (const r of routes) {
    const short = (r.route_short_name || '').trim()
    if (TARGET.includes(short)) {
      targetRoutes.set(r.route_id, {
        short,
        long: (r.route_long_name || '').trim(),
        color: withHash((r.route_color || '').trim()) || '#888888',
        text: withHash((r.route_text_color || '').trim()) || '#FFFFFF',
      })
    }
  }
  console.log(`Routes cibles trouvées : ${targetRoutes.size}/${TARGET.length}`)
  if (targetRoutes.size === 0) {
    const shorts = [...new Set(routes.map((r) => r.route_short_name))].slice(0, 40)
    throw new Error('Aucune ligne cible. short_names dispo: ' + shorts.join(', '))
  }

  // 2) trips.txt → trips des routes cibles, groupés par (route, direction)
  const trips = readCsv('trips.txt')
  // key `${route_id}|${direction_id}` -> [{trip_id, shape_id, headsign}]
  const byRouteDir = new Map()
  const candidateShapeIds = new Set()
  for (const t of trips) {
    if (!targetRoutes.has(t.route_id)) continue
    if (!t.shape_id) continue
    const dir = t.direction_id === '1' ? '1' : '0'
    const key = `${t.route_id}|${dir}`
    if (!byRouteDir.has(key)) byRouteDir.set(key, [])
    byRouteDir.get(key).push({
      trip_id: t.trip_id,
      shape_id: t.shape_id,
      headsign: (t.trip_headsign || '').trim(),
    })
    candidateShapeIds.add(t.shape_id)
  }

  // 3) Passe 1 sur shapes.txt : compter les points par shape_id candidat
  const shapeCount = new Map()
  await streamCsv('shapes.txt', (s) => {
    if (candidateShapeIds.has(s.shape_id)) {
      shapeCount.set(s.shape_id, (shapeCount.get(s.shape_id) || 0) + 1)
    }
  })

  // Choisir, par (route, direction), le trip dont le shape est le plus détaillé
  const chosen = new Map() // key -> {trip_id, shape_id, headsign}
  const chosenShapeIds = new Set()
  const chosenTripIds = new Set()
  for (const [key, list] of byRouteDir) {
    let best = null
    for (const tr of list) {
      const c = shapeCount.get(tr.shape_id) || 0
      if (!best || c > best.count) best = { ...tr, count: c }
    }
    if (best) {
      chosen.set(key, best)
      chosenShapeIds.add(best.shape_id)
      chosenTripIds.add(best.trip_id)
    }
  }

  // 4) Passe 2 sur shapes.txt : collecter la géométrie des shapes retenus
  const shapePts = new Map() // shape_id -> [{seq,lat,lon}]
  await streamCsv('shapes.txt', (s) => {
    if (!chosenShapeIds.has(s.shape_id)) return
    if (!shapePts.has(s.shape_id)) shapePts.set(s.shape_id, [])
    shapePts.get(s.shape_id).push({
      seq: parseInt(s.shape_pt_sequence, 10),
      lat: parseFloat(s.shape_pt_lat),
      lon: parseFloat(s.shape_pt_lon),
    })
  })
  for (const arr of shapePts.values()) arr.sort((a, b) => a.seq - b.seq)

  // 5) Passe sur stop_times.txt : séquence d'arrêts des trips retenus
  const tripStops = new Map() // trip_id -> [{seq, stop_id}]
  await streamCsv('stop_times.txt', (st) => {
    if (!chosenTripIds.has(st.trip_id)) return
    if (!tripStops.has(st.trip_id)) tripStops.set(st.trip_id, [])
    tripStops.get(st.trip_id).push({
      seq: parseInt(st.stop_sequence, 10),
      stop_id: st.stop_id,
    })
  })
  for (const arr of tripStops.values()) arr.sort((a, b) => a.seq - b.seq)

  // 6) stops.txt → coordonnées et noms
  const stops = readCsv('stops.txt')
  const stopById = new Map()
  for (const s of stops) {
    stopById.set(s.stop_id, {
      name: (s.stop_name || '').trim(),
      lat: parseFloat(s.stop_lat),
      lon: parseFloat(s.stop_lon),
    })
  }

  // 7) Construction du JSON final, dans l'ordre TARGET
  const out = {}
  for (const short of TARGET) {
    // route_id correspondant
    let routeId = null
    for (const [rid, info] of targetRoutes) if (info.short === short) routeId = rid
    if (!routeId) {
      console.warn(`! ligne ${short} absente du GTFS`)
      continue
    }
    const info = targetRoutes.get(routeId)
    const shapes = {}
    const stopsByDir = {}
    for (const dir of ['0', '1']) {
      const ch = chosen.get(`${routeId}|${dir}`)
      if (!ch) {
        shapes['dir' + dir] = []
        stopsByDir[dir] = []
        continue
      }
      const pts = (shapePts.get(ch.shape_id) || []).map((p) => [p.lat, p.lon])
      shapes['dir' + dir] = pts
      const seq = tripStops.get(ch.trip_id) || []
      stopsByDir[dir] = seq
        .map((x) => {
          const s = stopById.get(x.stop_id)
          return s ? { id: x.stop_id, name: s.name, lat: s.lat, lon: s.lon } : null
        })
        .filter(Boolean)
    }
    // Repli : si un sens manque totalement, on inverse l'autre (shape + arrêts).
    if (shapes.dir0.length === 0 && shapes.dir1.length > 0) {
      shapes.dir0 = [...shapes.dir1].reverse()
      stopsByDir['0'] = [...stopsByDir['1']].reverse()
    }
    if (shapes.dir1.length === 0 && shapes.dir0.length > 0) {
      shapes.dir1 = [...shapes.dir0].reverse()
      stopsByDir['1'] = [...stopsByDir['0']].reverse()
    }
    // Dans ce GTFS, un seul sens porte le tracé détaillé ; l'autre est grossier
    // (~1 point/arrêt). On remplace alors le tracé grossier par le tracé riche
    // inversé (le bus suit quasi le même chemin), en gardant les arrêts du GTFS.
    const n0 = shapes.dir0.length
    const n1 = shapes.dir1.length
    if (n0 >= n1 && n1 < n0 * 0.5) {
      shapes.dir1 = [...shapes.dir0].reverse()
    } else if (n1 > n0 && n0 < n1 * 0.5) {
      shapes.dir0 = [...shapes.dir1].reverse()
    }

    // Les arrêts de l'app : on prend la séquence du sens 0 (référence).
    out[short] = {
      nom: short,
      long_name: info.long,
      color: info.color,
      text_color: info.text,
      shapes,
      stops: stopsByDir['0'].length ? stopsByDir['0'] : stopsByDir['1'],
    }
    console.log(
      `${short.padEnd(3)} dir0:${shapes.dir0.length}pts dir1:${shapes.dir1.length}pts arrêts:${out[short].stops.length}`,
    )
  }

  // Sanity check : chaque ligne doit avoir un tracé détaillé.
  const weak = Object.entries(out).filter(
    ([, l]) => l.shapes.dir0.length < 50 || l.shapes.dir1.length < 50,
  )
  if (Object.keys(out).length < TARGET.length) {
    throw new Error('Lignes manquantes dans la sortie')
  }
  if (weak.length) {
    throw new Error(
      'Tracés trop pauvres (<50 pts) pour: ' + weak.map(([k]) => k).join(', '),
    )
  }

  writeFileSync(OUT, JSON.stringify(out))
  console.log(`✓ écrit ${OUT} (${Object.keys(out).length} lignes)`)
}

main().catch((e) => {
  console.error('ERREUR:', e.message)
  process.exit(1)
})
