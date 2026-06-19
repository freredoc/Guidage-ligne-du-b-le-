// Convertit un GTFS (dossier extrait) en tan_gps_final.json pour l'app.
// Aucune dépendance externe : lecture en flux des gros fichiers (shapes,
// stop_times) et parseur CSV minimal gérant les champs entre guillemets.
//
// Sélection robuste : pour chaque ligne et chaque sens, on prend la séquence
// d'arrêts la plus longue (variante complète), puis le tracé (shape) qui
// COUVRE le mieux ces arrêts (le plus de points parmi ceux qui passent près de
// tous les arrêts). Évite les variantes « service court » au tracé partiel.
//
// Usage : node scripts/build-gtfs.mjs <dossier_gtfs> <sortie.json>
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'

const GTFS_DIR = process.argv[2] || 'gtfs'
const OUT = process.argv[3] || 'src/data/tan_gps_final.json'

const TARGET = ['C1', 'C6', 'C7', '10', '11', '23', '85', '86']
const COVER_RADIUS = 70 // m : un arrêt est « couvert » si à moins de 70 m du tracé

// --- Géométrie ---
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
const toXY = (lat, lon, ref) => ({
  x: toRad(lon) * R * Math.cos(toRad(ref)),
  y: toRad(lat) * R,
})
function snapDist(lat, lon, route) {
  let best = Infinity
  for (let i = 0; i < route.length - 1; i++) {
    const p = toXY(lat, lon, lat)
    const a = toXY(route[i][0], route[i][1], lat)
    const b = toXY(route[i + 1][0], route[i + 1][1], lat)
    const abx = b.x - a.x
    const aby = b.y - a.y
    const L = abx * abx + aby * aby
    let t = 0
    if (L > 0) {
      t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / L
      t = Math.max(0, Math.min(1, t))
    }
    const pl = route[i][0] + t * (route[i + 1][0] - route[i][0])
    const po = route[i][1] + t * (route[i + 1][1] - route[i][1])
    const dd = haversine(lat, lon, pl, po)
    if (dd < best) best = dd
  }
  return best
}

// --- CSV ---
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

  // 1) routes cibles
  const routes = readCsv('routes.txt')
  const targetRoutes = new Map() // route_id -> {short,long,color,text}
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
  console.log(`Routes cibles : ${targetRoutes.size}/${TARGET.length}`)
  if (targetRoutes.size === 0) throw new Error('Aucune ligne cible trouvée')

  // 2) trips des routes cibles
  const trips = readCsv('trips.txt')
  // route_id -> { shapeIds:Set, tripsByDir:{0:[],1:[]} } ; trip:{trip_id,shape_id}
  const routeTrips = new Map()
  const candidateTripIds = new Set()
  const candidateShapeIds = new Set()
  for (const t of trips) {
    if (!targetRoutes.has(t.route_id)) continue
    if (!routeTrips.has(t.route_id))
      routeTrips.set(t.route_id, { shapeIds: new Set(), dir: { 0: [], 1: [] } })
    const e = routeTrips.get(t.route_id)
    const dir = t.direction_id === '1' ? 1 : 0
    e.dir[dir].push({ trip_id: t.trip_id, shape_id: t.shape_id })
    if (t.shape_id) {
      e.shapeIds.add(t.shape_id)
      candidateShapeIds.add(t.shape_id)
    }
    candidateTripIds.add(t.trip_id)
  }

  // 3) Géométrie de tous les shapes candidats (un passage)
  const shapePts = new Map() // shape_id -> [{seq,lat,lon}]
  await streamCsv('shapes.txt', (s) => {
    if (!candidateShapeIds.has(s.shape_id)) return
    if (!shapePts.has(s.shape_id)) shapePts.set(s.shape_id, [])
    shapePts.get(s.shape_id).push({
      seq: parseInt(s.shape_pt_sequence, 10),
      lat: parseFloat(s.shape_pt_lat),
      lon: parseFloat(s.shape_pt_lon),
    })
  })
  const shapeLine = new Map() // shape_id -> [[lat,lon],...]
  for (const [id, arr] of shapePts) {
    arr.sort((a, b) => a.seq - b.seq)
    shapeLine.set(id, arr.map((p) => [p.lat, p.lon]))
  }

  // 4) Nombre d'arrêts par trip candidat (passage 1 sur stop_times)
  const tripStopCount = new Map()
  await streamCsv('stop_times.txt', (st) => {
    if (!candidateTripIds.has(st.trip_id)) return
    tripStopCount.set(st.trip_id, (tripStopCount.get(st.trip_id) || 0) + 1)
  })

  // Trip canonique (le plus d'arrêts) par (route, sens)
  const canonicalTrip = new Map() // `${route}|${dir}` -> trip_id
  const canonicalTripIds = new Set()
  for (const [rid, e] of routeTrips) {
    for (const dir of [0, 1]) {
      let best = null
      for (const tr of e.dir[dir]) {
        const c = tripStopCount.get(tr.trip_id) || 0
        if (!best || c > best.c) best = { trip_id: tr.trip_id, c }
      }
      if (best && best.c > 0) {
        canonicalTrip.set(`${rid}|${dir}`, best.trip_id)
        canonicalTripIds.add(best.trip_id)
      }
    }
  }

  // 5) Séquences d'arrêts des trips canoniques (passage 2 sur stop_times)
  const tripStops = new Map() // trip_id -> [{seq,stop_id}]
  await streamCsv('stop_times.txt', (st) => {
    if (!canonicalTripIds.has(st.trip_id)) return
    if (!tripStops.has(st.trip_id)) tripStops.set(st.trip_id, [])
    tripStops.get(st.trip_id).push({
      seq: parseInt(st.stop_sequence, 10),
      stop_id: st.stop_id,
    })
  })
  for (const arr of tripStops.values()) arr.sort((a, b) => a.seq - b.seq)

  // 6) stops
  const stops = readCsv('stops.txt')
  const stopById = new Map()
  for (const s of stops)
    stopById.set(s.stop_id, {
      name: (s.stop_name || '').trim(),
      lat: parseFloat(s.stop_lat),
      lon: parseFloat(s.stop_lon),
    })

  // Choisit, parmi tous les shapes d'une route, celui qui couvre le mieux la
  // liste d'arrêts donnée (le plus d'arrêts à <70 m), puis le plus détaillé.
  // Oriente le tracé dans le sens des arrêts.
  function pickShape(routeId, stopList) {
    const e = routeTrips.get(routeId)
    const n = stopList.length
    const cands = []
    for (const sid of e.shapeIds) {
      const line = shapeLine.get(sid)
      if (!line || line.length < 2) continue
      let cov = 0
      let mx = 0
      for (const s of stopList) {
        const d = snapDist(s.lat, s.lon, line)
        if (d < COVER_RADIUS) cov++
        if (d > mx) mx = d
      }
      cands.push({ sid, line, cov, mx })
    }
    if (cands.length === 0) return []
    // Tracés « bien alignés » : couvrent tous les arrêts sauf au plus un, sans
    // gros écart. Parmi eux, on prend le plus détaillé (max de points).
    const aligned = cands.filter((c) => c.cov >= n - 1 && c.mx < 200)
    let best
    if (aligned.length) {
      best = aligned.reduce((a, b) => (b.line.length > a.line.length ? b : a))
    } else {
      // Aucun tracé détaillé n'épouse les arrêts : on garde le mieux couvrant.
      best = cands.reduce((a, b) =>
        b.cov > a.cov || (b.cov === a.cov && b.line.length > a.line.length) ? b : a,
      )
    }
    // Orientation : le 1er arrêt doit être plus proche du début que de la fin.
    const line = best.line
    if (stopList.length >= 2) {
      const s0 = stopList[0]
      const dStart = haversine(s0.lat, s0.lon, line[0][0], line[0][1])
      const dEnd = haversine(s0.lat, s0.lon, line[line.length - 1][0], line[line.length - 1][1])
      if (dStart > dEnd) return [...line].reverse()
    }
    return line
  }

  // 7) Construction du JSON
  const out = {}
  const report = []
  for (const short of TARGET) {
    let routeId = null
    for (const [rid, info] of targetRoutes) if (info.short === short) routeId = rid
    if (!routeId) {
      console.warn(`! ligne ${short} absente`)
      continue
    }
    const info = targetRoutes.get(routeId)
    const shapes = {}
    const stopsByDir = { 0: [], 1: [] }
    for (const dir of [0, 1]) {
      const tripId = canonicalTrip.get(`${routeId}|${dir}`)
      const seq = tripId ? tripStops.get(tripId) || [] : []
      stopsByDir[dir] = seq
        .map((x) => {
          const s = stopById.get(x.stop_id)
          return s ? { id: x.stop_id, name: s.name, lat: s.lat, lon: s.lon } : null
        })
        .filter(Boolean)
      shapes['dir' + dir] = pickShape(routeId, stopsByDir[dir])
    }
    // Repli si un sens manque.
    if (stopsByDir[0].length === 0 && stopsByDir[1].length) {
      stopsByDir[0] = [...stopsByDir[1]].reverse()
      shapes.dir0 = [...shapes.dir1].reverse()
    }
    if (stopsByDir[1].length === 0 && stopsByDir[0].length) {
      stopsByDir[1] = [...stopsByDir[0]].reverse()
      shapes.dir1 = [...shapes.dir0].reverse()
    }

    out[short] = {
      nom: short,
      long_name: info.long,
      color: info.color,
      text_color: info.text,
      shapes,
      stops: stopsByDir[0].length ? stopsByDir[0] : stopsByDir[1],
    }

    // Contrôle qualité : écart max des arrêts au tracé de leur sens.
    const maxoff = (dir) => {
      const r = shapes['dir' + dir]
      const ss = stopsByDir[dir]
      if (!r.length || !ss.length) return 0
      return Math.max(...ss.map((s) => snapDist(s.lat, s.lon, r)))
    }
    const m0 = maxoff(0)
    const m1 = maxoff(1)
    report.push({ short, p0: shapes.dir0.length, p1: shapes.dir1.length, m0, m1 })
    console.log(
      `${short.padEnd(3)} dir0:${shapes.dir0.length}pts(écart≤${m0.toFixed(0)}m) ` +
        `dir1:${shapes.dir1.length}pts(écart≤${m1.toFixed(0)}m) arrêts:${out[short].stops.length}`,
    )
  }

  if (Object.keys(out).length < TARGET.length)
    throw new Error('Lignes manquantes dans la sortie')
  // Qualité = alignement : chaque arrêt doit être proche du tracé de son sens.
  const misaligned = report.filter((r) => r.m0 > 300 || r.m1 > 300)
  if (misaligned.length)
    throw new Error(
      'Tracés mal alignés (>300 m) pour: ' + misaligned.map((r) => r.short).join(', '),
    )
  const detailed = report.filter((r) => r.p0 >= 200 || r.p1 >= 200).length
  console.log(`Sens détaillés : ${report.reduce((a, r) => a + (r.p0 >= 200 ? 1 : 0) + (r.p1 >= 200 ? 1 : 0), 0)}/16 (${detailed}/8 lignes avec au moins un sens détaillé)`)

  writeFileSync(OUT, JSON.stringify(out))
  console.log(`✓ écrit ${OUT} (${Object.keys(out).length} lignes)`)
}

main().catch((e) => {
  console.error('ERREUR:', e.message)
  process.exit(1)
})
