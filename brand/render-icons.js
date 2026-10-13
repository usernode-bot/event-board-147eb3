// Generates the Event Board brand icons from one shape list, so the SVG and
// the three PNGs cannot drift apart. No dependencies: uses node:zlib and node:fs.
//
//   node brand/render-icons.js
//
// Outputs (all from the same 1024-grid mark):
//   brand/icon.png           1024x1024 app icon (black mark on cream)
//   brand/featured-light.png 1600x900  black mark on cream
//   brand/featured-dark.png  1600x900  cream mark on black
//   brand/icon.svg           vector source of the app icon
//
// With ICON_CHECK=1 it also writes 32x32 downscales of the icon composited on
// white and on black to a temp directory, for the small-size readability check.

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Homeroom brand palette (only these appear as solid fills).
const CREAM = [0xff, 0xfe, 0xea]; // #FFFEEA
const BLACK = [0x00, 0x00, 0x00]; // #000000
const YELLOW = [0xff, 0xee, 0x6f]; // #FFEE6F

// ---------------------------------------------------------------- geometry --
// The mark on a 1024 grid. Every entry is { sdf(x,y), fill } where sdf is
// negative inside the shape and fill is one of 'bg' | 'mark' | 'accent'.
// Shapes are painted in order; antialiasing comes from the signed distance.

// Rounded-rectangle signed distance, centred at (cx, cy), half sizes hw/hh.
function rrect(cx, cy, hw, hh, r) {
  return (x, y) => {
    const qx = Math.abs(x - cx) - (hw - r);
    const qy = Math.abs(y - cy) - (hh - r);
    const ax = Math.max(qx, 0);
    const ay = Math.max(qy, 0);
    return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
  };
}

function circle(cx, cy, r) {
  return (x, y) => Math.hypot(x - cx, y - cy) - r;
}

// Page outline: rounded rect x 232..792, y 272..812, outer radius 72,
// stroke 48 inward (the inside is filled with the background colour).
const PAGE = rrect(512, 542, 280, 270, 72);
const PAGE_INNER = rrect(512, 542, 232, 222, 24);

// Header band: the top of the page, down to y 432, sharing the page's
// top corner radius. Intersection of the page shape with a half plane.
const HEADER = (x, y) => Math.max(PAGE(x, y), y - 432);

// Binder rings: 48x120 pills at x 352 and x 624, y 212..332.
const PILL_L = rrect(376, 272, 24, 60, 24);
const PILL_R = rrect(648, 272, 24, 60, 24);

// Days: 3x2 rounded squares 64x64, radius 14. The rows sit 16px higher than
// the first draft so the circle around the bottom-right day keeps 16px clear
// of the page edge (see brand/ICON.md).
const DAY_R = rrect(0, 0, 32, 32, 14); // centred, translated per day
const DAY_CENTRES = [
  [368, 532], [512, 532], [656, 532],
  [368, 676], [512, 676], [656, 676],
];

// Circled day: black ring outer radius 72, stroke 24 (annulus 52..72),
// yellow disc r 72 underneath, black day square on top. Painted as
// mark disc r72, then accent disc r52, then the day square.
const RING = circle(656, 676, 72);
const RING_INNER = circle(656, 676, 52);

function daySdf(i) {
  const [cx, cy] = DAY_CENTRES[i];
  return (x, y) => DAY_R(x - cx, y - cy);
}

// The mark, in paint order, on the 1024 grid.
const SHAPES = [
  { sdf: (x, y) => -1, fill: 'bg' }, // full-bleed background
  { sdf: PAGE, fill: 'mark' },
  { sdf: PAGE_INNER, fill: 'bg' },
  { sdf: HEADER, fill: 'mark' },
  { sdf: PILL_L, fill: 'mark' },
  { sdf: PILL_R, fill: 'mark' },
  { sdf: RING, fill: 'mark' },
  { sdf: RING_INNER, fill: 'accent' },
  ...DAY_CENTRES.map((_, i) => ({ sdf: daySdf(i), fill: 'mark' })),
];

// Light: black mark on cream. Dark: cream mark on black. Yellow in both.
const LIGHT = { bg: CREAM, mark: BLACK, accent: YELLOW };
const DARK = { bg: BLACK, mark: CREAM, accent: YELLOW };

// ----------------------------------------------------------------- render --
function coverage(d) {
  return Math.min(1, Math.max(0, 0.5 - d));
}

function render(w, h, shapes, colours, dx = 0, dy = 0) {
  const px = new Uint8Array(w * h * 3);
  for (const shape of shapes) {
    const col = colours[shape.fill];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = shape.sdf(x + 0.5 - dx, y + 0.5 - dy);
        if (d > 1) continue; // entirely outside, skip the blend
        const a = coverage(d);
        if (a <= 0) continue;
        const i = (y * w + x) * 3;
        px[i] = Math.round(px[i] + (col[0] - px[i]) * a);
        px[i + 1] = Math.round(px[i + 1] + (col[1] - px[i + 1]) * a);
        px[i + 2] = Math.round(px[i + 2] + (col[2] - px[i + 2]) * a);
      }
    }
  }
  return px;
}

// ------------------------------------------------------------------- PNG --
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function writePNG(file, w, h, px) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // filter 0 per row, 8-bit RGB
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(px.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  fs.writeFileSync(file, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

// -------------------------------------------------------------- downscale --
// Box-filter downscale to smallSize, for the readability check.
function downscale(px, w, h, s) {
  const out = new Uint8Array(s * s * 3);
  const f = w / s;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = Math.floor(y * f); sy < Math.floor((y + 1) * f); sy++) {
        for (let sx = Math.floor(x * f); sx < Math.floor((x + 1) * f); sx++) {
          const i = (sy * w + sx) * 3;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
        }
      }
      const o = (y * s + x) * 3;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

// ------------------------------------------------------------------- SVG --
function svgFor(colours) {
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  const bg = hex(colours.bg), mark = hex(colours.mark), accent = hex(colours.accent);
  const s = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">`);
  s.push(`  <rect width="1024" height="1024" fill="${bg}"/>`);
  s.push(`  <rect x="232" y="272" width="560" height="540" rx="72" fill="${mark}"/>`);
  s.push(`  <rect x="280" y="320" width="464" height="444" rx="24" fill="${bg}"/>`);
  s.push(`  <path d="M232 432 L232 344 A72 72 0 0 1 304 272 L720 272 A72 72 0 0 1 792 344 L792 432 Z" fill="${mark}"/>`);
  s.push(`  <rect x="352" y="212" width="48" height="120" rx="24" fill="${mark}"/>`);
  s.push(`  <rect x="624" y="212" width="48" height="120" rx="24" fill="${mark}"/>`);
  s.push(`  <circle cx="656" cy="676" r="72" fill="${mark}"/>`);
  s.push(`  <circle cx="656" cy="676" r="52" fill="${accent}"/>`);
  for (const [cx, cy] of DAY_CENTRES) {
    s.push(`  <rect x="${cx - 32}" y="${cy - 32}" width="64" height="64" rx="14" fill="${mark}"/>`);
  }
  s.push(`</svg>`);
  return s.join('\n') + '\n';
}

// -------------------------------------------------------------------- run --
const dir = path.join(__dirname);

const iconPx = render(1024, 1024, SHAPES, LIGHT);
writePNG(path.join(dir, 'icon.png'), 1024, 1024, iconPx);
fs.writeFileSync(path.join(dir, 'icon.svg'), svgFor(LIGHT));

// Featured images: the same shape list, unscaled, translated so the mark is
// centred on 1600x900. Mark spans x 232..792, y 212..812 -> centre (512, 512);
// target centre (800, 450) -> translate by (288, -62).
const FEAT_DX = 288, FEAT_DY = -62;
writePNG(path.join(dir, 'featured-light.png'), 1600, 900, render(1600, 900, SHAPES, LIGHT, FEAT_DX, FEAT_DY));
writePNG(path.join(dir, 'featured-dark.png'), 1600, 900, render(1600, 900, SHAPES, DARK, FEAT_DX, FEAT_DY));

// Palette check: the only distinct opaque colours in the big flat areas.
const seen = new Set();
for (let i = 0; i < iconPx.length; i += 3) seen.add(`${iconPx[i]},${iconPx[i + 1]},${iconPx[i + 2]}`);
console.log('distinct colours in icon.png:', seen.size, [...seen].join(' '));

if (process.env.ICON_CHECK) {
  const tmp = fs.mkdtempSync('/tmp/iconcheck-');
  const small = downscale(iconPx, 1024, 1024, 32);
  writePNG(path.join(tmp, 'icon32-on-own-bg.png'), 32, 32, small);
  // The icon is full bleed, so "on white / on black" is judged by scaling it
  // further down inside a backdrop tile, the way a launcher crops a corner
  // radius: draw the 32px icon inset on a white and a black tile.
  for (const [name, backdrop] of [['white', [255, 255, 255]], ['black', [0, 0, 0]]]) {
    const tile = 48, inner = 32, off = (tile - inner) / 2;
    const buf = new Uint8Array(tile * tile * 3);
    for (let i = 0; i < buf.length; i += 3) { buf[i] = backdrop[0]; buf[i + 1] = backdrop[1]; buf[i + 2] = backdrop[2]; }
    for (let y = 0; y < inner; y++) for (let x = 0; x < inner; x++) {
      const o = ((y + off) * tile + (x + off)) * 3, s = (y * inner + x) * 3;
      buf[o] = small[s]; buf[o + 1] = small[s + 1]; buf[o + 2] = small[s + 2];
    }
    writePNG(path.join(tmp, `icon32-tile-on-${name}.png`), tile, tile, buf);
  }
  console.log('check images in', tmp);
}

console.log('done');
