/**
 * Generates build/icon.ico (and icon.png) without any image dependency.
 *
 *   node scripts/make-icon.mjs
 *
 * The mark is a rounded square in --spice-main with waveform bars in
 * --spice-button, matching the in-app accent.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 256
const SAMPLES = 4 // per axis, for anti-aliasing

const BASE = [0x12, 0x12, 0x12, 255] // --spice-main
const ACCENT = [0x1d, 0xb9, 0x54, 255] // --spice-button

/** Signed-distance helpers, all in a 0..1 normalised space. */
function roundedRectDistance(x, y, w, h, r) {
  const dx = Math.abs(x - w / 2) - (w / 2 - r)
  const dy = Math.abs(y - h / 2) - (h / 2 - r)
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - r
}

/** Vertical bar with rounded caps. */
function barDistance(x, y, cx, w, top, bottom) {
  const halfW = w / 2
  const r = halfW
  const cy = (top + bottom) / 2
  const h = (bottom - top) / 2
  const dx = Math.abs(x - cx) - (halfW - r)
  const dy = Math.abs(y - cy) - (h - r)
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - r
}

const BARS = [0.16, 0.28, 0.44, 0.28, 0.16] // bar heights, mirrored around centre
const BAR_W = 0.052
const BAR_GAP = 0.088

function sampleAt(x, y) {
  // Background plate: full-bleed rounded square.
  if (roundedRectDistance(x, y, 1, 1, 0.22) > 0) return [0, 0, 0, 0]

  const midY = 0.5
  for (let i = 0; i < BARS.length; i++) {
    const half = BARS[i] / 2
    const cx = 0.5 + (i - (BARS.length - 1) / 2) * BAR_GAP
    if (barDistance(x, y, cx, BAR_W, midY - half, midY + half) <= 0) return ACCENT
  }
  return BASE
}

function renderPixels() {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
  let p = 0
  for (let y = 0; y < SIZE; y++) {
    raw[p++] = 0 // PNG filter: none
    for (let x = 0; x < SIZE; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = (x + (sx + 0.5) / SAMPLES) / SIZE
          const py = (y + (sy + 0.5) / SAMPLES) / SIZE
          const [sr, sg, sb, sa] = sampleAt(px, py)
          // premultiply so transparent samples do not darken the edge
          r += sr * sa
          g += sg * sa
          b += sb * sa
          a += sa
        }
      }
      const n = SAMPLES * SAMPLES
      const alpha = a / n
      if (alpha > 0) {
        r = Math.round(r / a)
        g = Math.round(g / a)
        b = Math.round(b / a)
      }
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
      raw[p++] = Math.round(alpha)
    }
  }
  return raw
}

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** Wraps a PNG in an ICO container (Vista+ understands PNG-compressed entries). */
function encodeIco(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // one image

  const entry = Buffer.alloc(16)
  entry[0] = 0 // width  (0 means 256)
  entry[1] = 0 // height
  entry[2] = 0 // palette
  entry[3] = 0 // reserved
  entry.writeUInt16LE(1, 4) // colour planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12)

  return Buffer.concat([header, entry, png])
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'build')
mkdirSync(outDir, { recursive: true })

const png = encodePng(renderPixels())
writeFileSync(join(outDir, 'icon.png'), png)
writeFileSync(join(outDir, 'icon.ico'), encodeIco(png))
console.log(`wrote build/icon.png (${png.length} bytes) and build/icon.ico`)
