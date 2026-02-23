/**
 * Generate PNG icons from scratch for PWA manifest.
 * Run from project root: node scripts/generate-icons.js
 * No external dependencies — uses built-in Node zlib for PNG compression.
 */

import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

// --- PNG Encoder ---

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(pixels, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // 8-bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // default filter
  ihdr[12] = 0; // no interlace

  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 4);
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = rowStart + 1 + x * 4;
      raw[di] = pixels[si];
      raw[di + 1] = pixels[si + 1];
      raw[di + 2] = pixels[si + 2];
      raw[di + 3] = pixels[si + 3];
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Drawing helpers ---

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function inRoundedRect(x, y, w, h, r) {
  if (x < r && y < r) return dist(x, y, r, r) <= r;
  if (x >= w - r && y < r) return dist(x, y, w - r - 1, r) <= r;
  if (x < r && y >= h - r) return dist(x, y, r, h - r - 1) <= r;
  if (x >= w - r && y >= h - r) return dist(x, y, w - r - 1, h - r - 1) <= r;
  return true;
}

function setPixel(pixels, w, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= w || y >= w) return;
  const i = (y * w + x) * 4;
  const alpha = a / 255;
  pixels[i] = Math.round(pixels[i] * (1 - alpha) + r * alpha);
  pixels[i + 1] = Math.round(pixels[i + 1] * (1 - alpha) + g * alpha);
  pixels[i + 2] = Math.round(pixels[i + 2] * (1 - alpha) + b * alpha);
  pixels[i + 3] = Math.min(255, pixels[i + 3] + a);
}

function fillRR(pixels, w, x0, y0, rw, rh, r, cr, cg, cb, ca) {
  for (let dy = 0; dy < rh; dy++) {
    for (let dx = 0; dx < rw; dx++) {
      if (inRoundedRect(dx, dy, rw, rh, r)) {
        setPixel(pixels, w, x0 + dx, y0 + dy, cr, cg, cb, ca);
      }
    }
  }
}

function fillBox(pixels, w, x0, y0, bw, bh, cr, cg, cb, ca) {
  for (let dy = 0; dy < bh; dy++) {
    for (let dx = 0; dx < bw; dx++) {
      setPixel(pixels, w, x0 + dx, y0 + dy, cr, cg, cb, ca);
    }
  }
}

// --- Icon renderer ---

function renderIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const s = size / 512; // scale factor
  const r = Math.floor(96 * s); // corner radius

  // Background — gradient blue rounded square
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRoundedRect(x, y, size, size, r)) {
        const t = (x + y) / (size * 2);
        const i = (y * size + x) * 4;
        pixels[i] = Math.round(41 + (30 - 41) * t);     // R: 41→30
        pixels[i + 1] = Math.round(82 + (63 - 82) * t);  // G: 82→63
        pixels[i + 2] = Math.round(184 + (143 - 184) * t); // B: 184→143
        pixels[i + 3] = 255;
      }
    }
  }

  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2) + Math.floor(10 * s);

  // Clipboard body
  const bw = Math.floor(200 * s);
  const bh = Math.floor(250 * s);
  fillRR(pixels, size,
    cx - Math.floor(bw / 2), cy - Math.floor(bh / 2),
    bw, bh, Math.floor(16 * s),
    255, 255, 255, 210);

  // Clipboard clip
  const cw = Math.floor(76 * s);
  const ch = Math.floor(32 * s);
  fillRR(pixels, size,
    cx - Math.floor(cw / 2), cy - Math.floor(bh / 2) - Math.floor(14 * s),
    cw, ch, Math.floor(8 * s),
    255, 255, 255, 240);

  // Three task lines with checkboxes
  const bodyLeft = cx - Math.floor(bw / 2);
  const bodyTop = cy - Math.floor(bh / 2);
  const lineH = Math.max(Math.floor(8 * s), 2);
  const cbSize = Math.floor(18 * s);

  for (let i = 0; i < 3; i++) {
    const ly = bodyTop + Math.floor((65 + i * 60) * s);

    // Checkbox
    const cbX = bodyLeft + Math.floor(24 * s);
    const cbY = ly - Math.floor(1 * s);
    fillRR(pixels, size, cbX, cbY, cbSize, cbSize, Math.floor(3 * s), 30, 63, 143, 140);

    // Checkmark for first two (completed)
    if (i < 2) {
      const cmX = cbX + Math.floor(4 * s);
      const cmY = cbY + Math.floor(4 * s);
      const cmS = cbSize - Math.floor(8 * s);
      fillBox(pixels, size, cmX, cmY, cmS, cmS, 30, 63, 143, 200);
    }

    // Line
    const lx = bodyLeft + Math.floor(52 * s);
    const lw = bw - Math.floor(76 * s);
    fillBox(pixels, size, lx, ly + Math.floor(4 * s), lw, lineH, 30, 63, 143, 100);
  }

  return pixels;
}

// Generate both sizes
const p192 = renderIcon(192);
const p512 = renderIcon(512);

writeFileSync('public/icon-192.png', encodePNG(p192, 192, 192));
writeFileSync('public/icon-512.png', encodePNG(p512, 512, 512));

console.log('Generated public/icon-192.png and public/icon-512.png');
