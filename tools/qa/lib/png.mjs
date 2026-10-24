// Minimal PNG toolkit with no dependencies: decode 8-bit gray/RGB/RGBA/palette
// (non-interlaced, what Chrome and sips write), encode RGBA, plus the few image
// operations the QA tools need (box resize, crop, paste, text-free labels are
// left to the caller). Pixels are { w, h, data: Uint8Array(w*h*4) } RGBA.
import zlib from 'node:zlib';
import fs from 'node:fs';

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0, plte = null, trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8), d = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ctype = d[9]; interlace = d[12]; }
    else if (type === 'PLTE') plte = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`unsupported PNG (depth ${depth}, interlace ${interlace})`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!ch) throw new Error('unsupported colour type ' + ctype);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * ch;
      if (ctype === 6) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = cur[s + 3]; }
      else if (ctype === 2) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = 255; }
      else if (ctype === 0) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = 255; }
      else if (ctype === 4) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = cur[s + 1]; }
      else { const p = cur[s]; out[o] = plte[p * 3]; out[o + 1] = plte[p * 3 + 1]; out[o + 2] = plte[p * 3 + 2]; out[o + 3] = trns && p < trns.length ? trns[p] : 255; }
    }
    [prev, cur] = [cur, prev];
  }
  return { w, h, data: out };
}

let CRC = null;
const crc32 = (b) => {
  if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } }
  let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out;
};
export function encodePng({ w, h, data }) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
export const readPng = (f) => decodePng(fs.readFileSync(f));
export const writePng = (f, img) => fs.writeFileSync(f, encodePng(img));
export const blank = (w, h, rgba = [24, 24, 24, 255]) => { const data = new Uint8Array(w * h * 4); for (let i = 0; i < data.length; i += 4) { data[i] = rgba[0]; data[i + 1] = rgba[1]; data[i + 2] = rgba[2]; data[i + 3] = rgba[3]; } return { w, h, data }; };

// Box-filter resize to w x h.
export function resize(img, w, h) {
  const out = new Uint8Array(w * h * 4), sx = img.w / w, sy = img.h / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx)), y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = y0; yy < y1 && yy < img.h; yy++) for (let xx = x0; xx < x1 && xx < img.w; xx++) { const o = (yy * img.w + xx) * 4; r += img.data[o]; g += img.data[o + 1]; b += img.data[o + 2]; n++; }
    const o = (y * w + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  return { w, h, data: out };
}
export function paste(dst, src, dx, dy) {
  for (let y = 0; y < src.h; y++) { const ty = y + dy; if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) { const tx = x + dx; if (tx < 0 || tx >= dst.w) continue;
      const s = (y * src.w + x) * 4, t = (ty * dst.w + tx) * 4; dst.data[t] = src.data[s]; dst.data[t + 1] = src.data[s + 1]; dst.data[t + 2] = src.data[s + 2]; dst.data[t + 3] = 255; } }
}
// Fit inside w x h keeping aspect, centred on a dark panel.
export function fit(img, w, h) {
  const k = Math.min(w / img.w, h / img.h), nw = Math.max(1, Math.round(img.w * k)), nh = Math.max(1, Math.round(img.h * k));
  const out = blank(w, h); paste(out, resize(img, nw, nh), Math.floor((w - nw) / 2), Math.floor((h - nh) / 2)); return out;
}
export function crop(img, x, y, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const s = ((y + j) * img.w + x + i) * 4, t = (j * w + i) * 4; out[t] = img.data[s]; out[t + 1] = img.data[s + 1]; out[t + 2] = img.data[s + 2]; out[t + 3] = 255; }
  return { w, h, data: out };
}
export function rect(img, x0, y0, x1, y1, rgb, t = 2) {
  const put = (x, y) => { if (x < 0 || y < 0 || x >= img.w || y >= img.h) return; const o = (y * img.w + x) * 4; img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; };
  for (let k = 0; k < t; k++) for (let x = x0; x <= x1; x++) { put(x, y0 + k); put(x, y1 - k); }
  for (let k = 0; k < t; k++) for (let y = y0; y <= y1; y++) { put(x0 + k, y); put(x1 - k, y); }
}

// 5x7 bitmap font (upper case, digits, a little punctuation) for sheet labels.
const FONT = {
  A: '01110100011000110001111111000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110', D: '11110100011000110001100011000111110',
  E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000', G: '01110100011000010111100011000101110', H: '10001100011000111111100011000110001',
  I: '01110001000010000100001000010001110', J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000',
  Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001', S: '01111100000100000110000010000111110', T: '11111001000010000100001000010000100',
  U: '10001100011000110001100011000101110', V: '10001100011000110001100010101000100', W: '10001100011000110101101011101110001', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111', 3: '11110000010000101110000010000111110',
  4: '00010001100101010010111110001000010', 5: '11111100001111000001000010000111110', 6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000',
  8: '01110100011000101110100011000101110', 9: '01110100011000101111000010001001100', '-': '00000000000000011111000000000000000', '_': '00000000000000000000000000000011111',
  '.': '00000000000000000000000000001100110', ':': '00000011000110000000011000110000000', '/': '00001000010001000100010001000010000', '%': '11001110010001000100010001001110011',
  '|': '00100001000010000100001000010000100', '=': '00000000001111100000111110000000000', '+': '00000001000010011111001000010000000', '(': '00010001000100001000010000010000010', ')': '01000001000001000010000100010001000',
  ' ': '00000000000000000000000000000000000',
};
export function label(img, text, x, y, scale = 2, rgb = [255, 255, 255], bg = [0, 0, 0]) {
  const s = String(text).toUpperCase();
  const w = s.length * 6 * scale + 2 * scale, h = 9 * scale;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const tx = x + i, ty = y + j; if (tx >= 0 && ty >= 0 && tx < img.w && ty < img.h) { const o = (ty * img.w + tx) * 4; img.data[o] = bg[0]; img.data[o + 1] = bg[1]; img.data[o + 2] = bg[2]; } }
  for (let k = 0; k < s.length; k++) {
    const g = FONT[s[k]] || FONT[' '];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r * 5 + c] === '1')
      for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) { const tx = x + (k * 6 + c + 1) * scale + a, ty = y + (r + 1) * scale + b; if (tx >= 0 && ty >= 0 && tx < img.w && ty < img.h) { const o = (ty * img.w + tx) * 4; img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; } }
  }
}
