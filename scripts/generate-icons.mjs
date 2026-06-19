// Génère les icônes PWA (PNG) sans dépendance externe.
// Encodeur PNG minimal (RLE/zlib via zlib natif) dessinant l'icône TAN :
// fond sombre, pastille rouge TAN, flèche/triangle blanc (cap bus).
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../public/icons')
mkdirSync(OUT, { recursive: true })

const BG = [15, 16, 18] // #0f1012
const RED = [226, 0, 26] // #E2001A TAN
const WHITE = [255, 255, 255]

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePNG(size, pixels) {
  // pixels: Uint8Array RGBA length size*size*4
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // rows with filter byte 0
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy
      ? pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
      : raw.set(pixels.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Distance d'un point à un segment (pour bords lissés du triangle).
function pointInTriangle(px, py, a, b, c) {
  const d1 = sign(px, py, a, b)
  const d2 = sign(px, py, b, c)
  const d3 = sign(px, py, c, a)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}
function sign(px, py, p1, p2) {
  return (px - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (py - p2[1])
}

function drawIcon(size, maskable) {
  const px = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  // Rayon de la pastille : plus petit en maskable (zone de sécurité).
  const discR = size * (maskable ? 0.34 : 0.42)
  // Triangle (flèche cap) pointant vers le haut.
  const s = size * (maskable ? 0.22 : 0.27)
  const top = [cx, cy - s]
  const bl = [cx - s * 0.8, cy + s * 0.85]
  const br = [cx + s * 0.8, cy + s * 0.85]
  const notch = [cx, cy + s * 0.4] // encoche pour effet "flèche"
  const blN = [cx - s * 0.55, cy + s * 0.6]
  const brN = [cx + s * 0.55, cy + s * 0.6]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      let col = BG
      const dx = x - cx
      const dy = y - cy
      const dist = Math.hypot(dx, dy)
      if (dist <= discR) col = RED
      // flèche blanche : triangle plein moins encoche centrale basse
      const inTri = pointInTriangle(x + 0.5, y + 0.5, top, bl, br)
      const inNotch = pointInTriangle(x + 0.5, y + 0.5, notch, blN, brN)
      if (inTri && !inNotch) col = WHITE
      px[i] = col[0]
      px[i + 1] = col[1]
      px[i + 2] = col[2]
      px[i + 3] = 255
    }
  }
  return encodePNG(size, px)
}

function write(name, buf) {
  writeFileSync(resolve(OUT, name), buf)
  console.log('  ✓', name, `(${buf.length} o)`)
}

console.log('Génération des icônes PWA TAN…')
write('icon-192.png', drawIcon(192, false))
write('icon-512.png', drawIcon(512, false))
write('icon-512-maskable.png', drawIcon(512, true))
console.log('Terminé.')
