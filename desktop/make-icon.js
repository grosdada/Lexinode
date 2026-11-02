#!/usr/bin/env node
/* Dessine l'icône de Lexinode (le logo de la barre du haut : trois nœuds reliés) et l'écrit en .ico, sans dépendance.
 * Usage : node make-icon.js sortie.ico */
'use strict';
const fs = require('fs');
const zlib = require('zlib');

const BG = [0x0f, 0x12, 0x18], ACCENT = [0xff, 0xb7, 0x03];
const NODES = [[5.5, 7], [18.5, 6], [14, 18]]; // coordonnées du logo SVG (grille 24 x 24)
const bez = (p0, p1, p2, p3, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
});
const LINES = [bez([8, 7], [12, 7], [14, 6], [16, 6], 24), bez([7.5, 8.8], [10, 12], [11, 15.5], [11.6, 16.8], 24)];

function distSeg(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
function inRoundedSquare(x, y) { // carré 24 x 24 aux coins arrondis (rayon 5)
  const r = 5, cx = Math.max(r, Math.min(24 - r, x)), cy = Math.max(r, Math.min(24 - r, y));
  return Math.hypot(x - cx, y - cy) <= r;
}
function shade(x, y, stroke) { // [r, v, b, alpha] d'un point de la grille 24 x 24
  if (!inRoundedSquare(x, y)) return [0, 0, 0, 0];
  for (const n of NODES) if (Math.hypot(x - n[0], y - n[1]) <= 3.1) return [...ACCENT, 255];
  for (const l of LINES) for (let i = 0; i < l.length - 1; i++) if (distSeg(x, y, l[i], l[i + 1]) <= stroke) return [...ACCENT, 255];
  return [...BG, 255];
}
function render(size) { // suréchantillonnage 4 x 4
  const buf = Buffer.alloc(size * size * 4), S = 4, stroke = size < 32 ? 1.25 : 0.95;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const c = shade(((px + (sx + 0.5) / S) / size) * 24, ((py + (sy + 0.5) / S) / size) * 24, stroke);
      r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
    }
    const o = (py * size + px) * 4;
    if (a) { buf[o] = Math.round(r / a); buf[o + 1] = Math.round(g / a); buf[o + 2] = Math.round(b / a); }
    buf[o + 3] = Math.round(a / (S * S));
  }
  return buf;
}
function png(size, rgba) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function ico(sizes) {
  const images = sizes.map((s) => png(s, render(s)));
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e[0] = s >= 256 ? 0 : s; e[1] = s >= 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(images[i].length, 8); e.writeUInt32LE(offset, 12);
    offset += images[i].length;
    return e;
  });
  return Buffer.concat([head, ...entries, ...images]);
}

const out = process.argv[2];
if (!out) { console.error('Usage : node make-icon.js sortie.ico'); process.exit(1); }
fs.writeFileSync(out, ico([16, 24, 32, 48, 64, 128, 256]));
console.log('Icône écrite : ' + out);
