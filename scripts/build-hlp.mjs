// Construit les parcours HLP (Haut Le Pied) et les fusionne dans
// tan_gps_final.json. Coordonnées : arrêts via le GTFS, points fixes
// (dépôt Le Bêle, Portes) via géocodage Nominatim (OpenStreetMap).
//
// Usage : node scripts/build-hlp.mjs <gtfs_dir> <data.json> <hlp_def.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const GTFS_DIR = process.argv[2] || 'gtfs'
const DATA = process.argv[3] || 'src/data/tan_gps_final.json'
const HLPDEF = process.argv[4] || 'data-source-bele-hlp.json'

const HLP_COLOR = '#E58A00' // ambre : distingue les HLP des lignes
const HLP_TEXT = '#1A1A1A'
// Boîte englobante Nantes Métropole (validation des géocodages).
const BBOX = { latMin: 47.05, latMax: 47.45, lonMin: -1.85, lonMax: -1.35 }

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += c
    } else if (c === '"') q = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

function loadStops() {
  const txt = readFileSync(resolve(GTFS_DIR, 'stops.txt'), 'utf8')
  const lines = txt.split(/\r?\n/).filter(Boolean)
  const h = parseCsvLine(lines[0]).map((x) => x.replace(/^﻿/, '').trim())
  const iN = h.indexOf('stop_name')
  const iLa = h.indexOf('stop_lat')
  const iLo = h.indexOf('stop_lon')
  const m = new Map()
  for (let k = 1; k < lines.length; k++) {
    const v = parseCsvLine(lines[k])
    const key = norm(v[iN])
    if (!m.has(key)) m.set(key, [parseFloat(v[iLa]), parseFloat(v[iLo])])
  }
  return m
}

const ALIAS = {
  HALUCHERE: 'Haluchère - Batignolles',
  'MF BELLEVUE': 'Mendès France - Bellevue',
  'BD DE DOULON': 'Bd de Doulon',
  CHANTRERIE: 'Chantrerie - Grandes Écoles',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function geocode(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q=' +
    encodeURIComponent(query)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'tan-gps-bus/1.0 (HLP geocoding)' },
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const j = await res.json()
  if (!j.length) return null
  const lat = parseFloat(j[0].lat)
  const lon = parseFloat(j[0].lon)
  if (
    lat < BBOX.latMin ||
    lat > BBOX.latMax ||
    lon < BBOX.lonMin ||
    lon > BBOX.lonMax
  ) {
    return null // hors zone -> géocodage non fiable, on ignore
  }
  return [lat, lon]
}

async function main() {
  const stops = loadStops()
  const aliasN = {}
  for (const [k, v] of Object.entries(ALIAS)) aliasN[norm(k)] = norm(v)
  const def = JSON.parse(readFileSync(HLPDEF, 'utf8'))
  const data = JSON.parse(readFileSync(DATA, 'utf8'))

  // Géocodage des points fixes (dépôt, Portes).
  const infraCoords = {}
  for (const [key, info] of Object.entries(def.infra)) {
    try {
      const c = await geocode(info.geo)
      if (c) {
        infraCoords[key] = c
        console.log(`geo ✓ ${key} -> ${c[0].toFixed(5)},${c[1].toFixed(5)}`)
      } else console.log(`geo ✗ ${key} (« ${info.geo} ») hors zone/introuvable`)
      await sleep(1100) // politesse Nominatim (1 req/s)
    } catch (e) {
      console.log(`geo ! ${key} : ${e.message}`)
    }
  }

  const resolve1 = (name) => {
    const n = norm(name)
    if (infraCoords[n]) return infraCoords[n]
    const gn = aliasN[n] || n
    if (stops.has(gn)) return stops.get(gn)
    if (stops.has(n)) return stops.get(n)
    return null
  }

  let added = 0
  for (const h of def.hlp) {
    const pts = []
    for (const name of h.points) {
      const c = resolve1(name)
      if (c) pts.push({ id: '', name: prettify(name), lat: c[0], lon: c[1] })
      else console.log(`  HLP ${h.id}: point non résolu « ${name} » (ignoré)`)
    }
    if (pts.length < 2) {
      console.log(`  HLP ${h.id}: < 2 points résolus, ignoré`)
      continue
    }
    const d0 = pts
    const d1 = [...pts].reverse()
    data[h.id] = {
      nom: h.nom,
      long_name: 'HLP · ' + (h.lignes || []).join(' / '),
      color: HLP_COLOR,
      text_color: HLP_TEXT,
      kind: 'hlp',
      lignes: h.lignes || [],
      shapes: {
        dir0: d0.map((s) => [s.lat, s.lon]),
        dir1: d1.map((s) => [s.lat, s.lon]),
      },
      stops: { dir0: d0, dir1: d1 },
    }
    added++
    console.log(`HLP ${h.id}: ${pts.length} points`)
  }

  writeFileSync(DATA, JSON.stringify(data))
  console.log(`\n✓ ${added} HLP ajoutés à ${DATA}`)
}

function prettify(name) {
  // Met en forme un nom de point HLP (depuis sa clé normalisée éventuelle).
  return name
    .replace(/\bN(\d+)\b/g, 'n°$1')
    .replace(/\bPTE\b/g, 'Porte')
    .replace(/\bBLX\b/g, 'Le Bêle')
    .split(' ')
    .map((w) =>
      w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w,
    )
    .join(' ')
}

main().catch((e) => {
  console.error('ERREUR:', e.message)
  process.exit(1)
})
