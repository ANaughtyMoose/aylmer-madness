#!/usr/bin/env node
// glTF 2.0 -> the engine's own mesh format. BUILD TIME ONLY: nothing here ever
// ships to the browser, which is the whole point — the runtime stays a pile of
// plain ES modules with no dependencies, and a borrowed model arrives already
// in the shape MeshBuilder would have produced.
//
//   node tools/gltf2mesh.mjs IN.glb --out assets/models/tree-maple.json \
//        --scale 1.6 --forward +x --center --maxTris 600
//
// What comes out is positions / normals / colours / indices, a bounds box, a
// triangle count and the licence block copied verbatim from a sidecar. The
// engine's conventions, which the flags exist to reach:
//   * +Y up, metres.
//   * A vehicle's nose points +Z and +X is the car's LEFT (see cars.js).
//   * Colour is per-vertex sRGB, because the one shader MULTIPLIES the texture
//     by the vertex colour and untextured geometry wants a texture of white.
//
// Options
//   --out FILE       where to write (default: alongside the input, .json)
//   --scale K        metres multiplier, applied after the axis fixes. One number
//                    is uniform; "SX,SY,SZ" scales per axis, which is what it
//                    takes to make a stylised kit vehicle carry a real car's
//                    length, width and height at once — a toy car's proportions
//                    are not a Ranger's, and no single number reconciles them.
//   --up y|z         which axis is up in the SOURCE (default y, glTF's own)
//   --forward AXIS   which axis is the nose, AFTER the --up fix: +x -x +z -z
//                    (default +z). The order matters: a Blender Z-up export
//                    whose nose points +Y comes out nose -Z once --up z has
//                    been applied, so that model wants `--up z --forward -z`.
//   --center         drop the mesh onto y = 0 and centre it in x/z
//   --offset X,Y,Z   metres, applied LAST. What --center cannot do: a car body's
//                    origin has to be the midpoint between its axles (cars.js
//                    hangs the wheels at +-wheelbase/2), which is not the centre
//                    of its bounding box on any vehicle with unequal overhangs.
//   --maxTris N      refuse (loudly) rather than ship a mesh over N triangles
//   --uv             keep TEXCOORD_0
//   --material N=HEX repaint the material named N (repeatable; sRGB hex, the
//                    same #RRGGBB the rest of the game writes). What is borrowed
//                    is the GEOMETRY: Kenney's Nature Kit is deliberately
//                    turquoise-and-salmon, which is a fine look and not Aylmer's.
//   --color HEX      repaint every material at once
//   --recolor A=B    snap sampled colours to a palette (repeatable). Every
//                    vertex takes the B whose A is nearest to it in RGB. This is
//                    what --material cannot do: a Kenney City or Car kit model
//                    has ONE material called `colormap` covering the whole
//                    vehicle, so naming the material can only flatten it. Run
//                    with --listColors first to see what is actually in there.
//   --listColors     print the model's colour clusters and write nothing else
//   --node NAME      only nodes whose name matches (substring, repeatable)
//   --mesh NAME      only meshes whose name matches (substring, repeatable)
//   --license FILE   licence sidecar (default: <input>.license.json)
//   --maxJson BYTES  above this the payload goes to a sibling .bin (default 1 MB)
//   --quiet          only warnings and errors
//
// Axis conversions are proper rotations on purpose (determinant +1), so the
// winding a model was authored with survives and back-face culling still does
// what the artist meant. Mirrored node instances — Kenney's kits are full of
// them — are caught by the per-node determinant and re-wound.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

// ------------------------------------------------------------------ arguments

function parseArgs(argv) {
  const o = {
    in: null, out: null, scale: [1, 1, 1], up: 'y', forward: '+z', center: false,
    maxTris: 0, uv: false, nodes: [], meshes: [], license: null, offset: null,
    maxJson: 1024 * 1024, quiet: false, slug: null, material: {}, color: null, recolor: [], listColors: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--out') o.out = next();
    else if (a === '--scale') {
      const parts = next().split(',').map(Number);
      o.scale = parts.length === 1 ? [parts[0], parts[0], parts[0]] : parts;
      if (o.scale.length !== 3) throw new Error('--scale wants K or SX,SY,SZ');
    }
    else if (a === '--up') o.up = next().toLowerCase();
    else if (a === '--forward') o.forward = next().toLowerCase();
    else if (a === '--center' || a === '--centre') o.center = true;
    else if (a === '--offset') {
      o.offset = next().split(',').map(Number);
      if (o.offset.length !== 3 || o.offset.some((v) => !Number.isFinite(v))) {
        throw new Error('--offset wants X,Y,Z in metres');
      }
    }
    else if (a === '--maxTris') o.maxTris = Number(next());
    else if (a === '--uv') o.uv = true;
    else if (a === '--material') {
      const [name, hex] = next().split('=');
      if (!hex) throw new Error('--material wants NAME=#RRGGBB');
      o.material[name] = parseHex(hex);
    } else if (a === '--color' || a === '--colour') o.color = parseHex(next());
    else if (a === '--recolor' || a === '--recolour') {
      const [from, to] = next().split('=');
      if (!to) throw new Error('--recolor wants FROMHEX=TOHEX');
      o.recolor.push([parseHex(from), parseHex(to)]);
    } else if (a === '--listColors') o.listColors = true;
    else if (a === '--node') o.nodes.push(next());
    else if (a === '--mesh') o.meshes.push(next());
    else if (a === '--license') o.license = next();
    else if (a === '--maxJson') o.maxJson = Number(next());
    else if (a === '--slug') o.slug = next();
    else if (a === '--quiet') o.quiet = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (!o.in) o.in = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!o.in) throw new Error('no input file');
  if (!['y', 'z'].includes(o.up)) throw new Error(`--up must be y or z, got ${o.up}`);
  if (!['+x', '-x', '+z', '-z'].includes(o.forward)) {
    throw new Error(`--forward must be one of +x -x +z -z, got ${o.forward}`);
  }
  // Only positive scales: a negative one mirrors, and every face comes out
  // inside out with nothing to warn you.
  if (!o.scale.every((v) => v > 0)) throw new Error('--scale must be positive on every axis');
  return o;
}

// #RRGGBB (or bare RRGGBB) -> an sRGB triple, which is the space every colour
// in the engine is already written in.
function parseHex(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim());
  if (!m) throw new Error(`not a #RRGGBB colour: ${h}`);
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const warnings = [];
function warn(msg) { warnings.push(msg); console.warn('warn:', msg); }

// ------------------------------------------------------------------ container

// A .glb is a 12-byte header then chunks; the first is the JSON, the second (if
// present) is the one binary buffer, which is the buffer that has no `uri`.
function readGLB(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error(`GLB version ${version}, only 2 is supported`);
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
    else if (type === 0x004e4942) bin = body;
    off += 8 + len + ((4 - (len % 4)) % 4) * 0;   // chunk lengths are already 4-aligned
    off += (4 - (off % 4)) % 4;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

function decodeDataURI(uri) {
  const comma = uri.indexOf(',');
  const head = uri.slice(5, comma);
  const body = uri.slice(comma + 1);
  if (head.endsWith(';base64')) return Buffer.from(body, 'base64');
  return Buffer.from(decodeURIComponent(body), 'binary');
}

function loadGltf(file) {
  const buf = readFileSync(file);
  const base = dirname(file);
  let json, glbBin = null;
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x46546c67) {
    ({ json, bin: glbBin } = readGLB(buf));
  } else {
    json = JSON.parse(buf.toString('utf8'));
  }
  const buffers = (json.buffers || []).map((b) => {
    if (!b.uri) {
      if (!glbBin) throw new Error('a buffer has no uri and there is no GLB chunk');
      return glbBin;
    }
    if (b.uri.startsWith('data:')) return decodeDataURI(b.uri);
    return readFileSync(join(base, decodeURIComponent(b.uri)));
  });
  return { json, buffers, base };
}

// ------------------------------------------------------------------ accessors

const COMP = {
  5120: { n: 1, get: (d, o) => d.getInt8(o), norm: (v) => Math.max(v / 127, -1) },
  5121: { n: 1, get: (d, o) => d.getUint8(o), norm: (v) => v / 255 },
  5122: { n: 2, get: (d, o) => d.getInt16(o, true), norm: (v) => Math.max(v / 32767, -1) },
  5123: { n: 2, get: (d, o) => d.getUint16(o, true), norm: (v) => v / 65535 },
  5125: { n: 4, get: (d, o) => d.getUint32(o, true), norm: (v) => v },
  5126: { n: 4, get: (d, o) => d.getFloat32(o, true), norm: (v) => v },
};
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function readAccessor(g, index) {
  const acc = g.json.accessors[index];
  if (!acc) throw new Error(`no accessor ${index}`);
  const comps = NUM[acc.type];
  const c = COMP[acc.componentType];
  if (!c) throw new Error(`unsupported componentType ${acc.componentType}`);
  const out = new Float64Array(acc.count * comps);
  if (acc.bufferView !== undefined) {
    const bv = g.json.bufferViews[acc.bufferView];
    const buf = g.buffers[bv.buffer];
    const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = bv.byteStride || comps * c.n;
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    for (let i = 0; i < acc.count; i++) {
      for (let k = 0; k < comps; k++) {
        const raw = c.get(view, start + i * stride + k * c.n);
        out[i * comps + k] = acc.normalized ? c.norm(raw) : raw;
      }
    }
  }
  // Sparse accessors override a handful of elements of an otherwise zero (or
  // bufferView-backed) array. Rare, but silently dropping them corrupts a mesh.
  if (acc.sparse) {
    const s = acc.sparse;
    const idxBv = g.json.bufferViews[s.indices.bufferView];
    const idxBuf = g.buffers[idxBv.buffer];
    const ic = COMP[s.indices.componentType];
    const idxView = new DataView(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength);
    const idxStart = (idxBv.byteOffset || 0) + (s.indices.byteOffset || 0);
    const valBv = g.json.bufferViews[s.values.bufferView];
    const valBuf = g.buffers[valBv.buffer];
    const valView = new DataView(valBuf.buffer, valBuf.byteOffset, valBuf.byteLength);
    const valStart = (valBv.byteOffset || 0) + (s.values.byteOffset || 0);
    for (let i = 0; i < s.count; i++) {
      const target = ic.get(idxView, idxStart + i * ic.n);
      for (let k = 0; k < comps; k++) {
        const raw = c.get(valView, valStart + (i * comps + k) * c.n);
        out[target * comps + k] = acc.normalized ? c.norm(raw) : raw;
      }
    }
  }
  return { data: out, comps, count: acc.count };
}

// ------------------------------------------------------------------ matrices

// Column-major 4x4, glTF's own order.
const matIdentity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function matMul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
        + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function trsMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const t = node.translation || [0, 0, 0];
  const q = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

// Normals go through the inverse transpose, or a non-uniform scale tips every
// normal off the surface it belongs to.
function normalMatrix(m) {
  const a = m[0], b = m[1], c = m[2];
  const d = m[4], e = m[5], f = m[6];
  const g = m[8], h = m[9], i = m[10];
  const det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
  if (Math.abs(det) < 1e-12) return { m: [a, b, c, d, e, f, g, h, i], det: 0 };
  const id = 1 / det;
  // inverse transpose == cofactor matrix / det
  return {
    m: [
      (e * i - f * h) * id, (f * g - d * i) * id, (d * h - e * g) * id,
      (c * h - b * i) * id, (a * i - c * g) * id, (b * g - a * h) * id,
      (b * f - c * e) * id, (c * d - a * f) * id, (a * e - b * d) * id,
    ],
    det,
  };
}

function transformNormal(nm, x, y, z) {
  return [
    nm[0] * x + nm[3] * y + nm[6] * z,
    nm[1] * x + nm[4] * y + nm[7] * z,
    nm[2] * x + nm[5] * y + nm[8] * z,
  ];
}

// ------------------------------------------------------------------ PNG decode

// Enough PNG for "what colour is this, on average": every colour type, 8 and
// 16 bits, all five filters, interlace refused. node:zlib does the hard part.
function decodePNG(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a PNG');
  let off = 8, ihdr = null, palette = null, trns = null;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        w: body.readUInt32BE(0), h: body.readUInt32BE(4),
        depth: body[8], color: body[9], interlace: body[12],
      };
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error('PNG has no IHDR');
  if (ihdr.interlace) throw new Error('interlaced PNG is not supported');
  const CH = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.color];
  if (CH === undefined) throw new Error(`PNG colour type ${ihdr.color}`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = Math.max(1, (CH * ihdr.depth) / 8 | 0);
  const rowBytes = Math.ceil((CH * ihdr.depth * ihdr.w) / 8);
  const out = Buffer.alloc(ihdr.h * rowBytes);
  let p = 0;
  for (let y = 0; y < ihdr.h; y++) {
    const filter = raw[p++];
    const row = out.subarray(y * rowBytes, (y + 1) * rowBytes);
    const prev = y ? out.subarray((y - 1) * rowBytes, y * rowBytes) : null;
    for (let x = 0; x < rowBytes; x++) {
      const rv = raw[p + x];
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v;
      if (filter === 0) v = rv;
      else if (filter === 1) v = rv + a;
      else if (filter === 2) v = rv + b;
      else if (filter === 3) v = rv + ((a + b) >> 1);
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v = rv + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`PNG filter ${filter}`);
      row[x] = v & 255;
    }
    p += rowBytes;
  }
  return { ...ihdr, ch: CH, rowBytes, data: out, palette, trns };
}

// One texel, nearest, in LINEAR light. Nearest and not bilinear on purpose: a
// Kenney kit's `colormap` is a strip of flat swatches, and blending across a
// swatch boundary invents a colour that is in neither.
function pngPixel(png, u, v) {
  const { w, h, depth, color, ch, rowBytes, data, palette } = png;
  // Wrap, so a UV that has drifted a hair outside [0,1] still lands somewhere.
  let x = Math.floor(((u % 1) + 1) % 1 * w);
  let y = Math.floor(((1 - v) % 1 + 1) % 1 * h);   // glTF V is measured downward
  if (x >= w) x = w - 1; if (y >= h) y = h - 1;
  const sample = (row, i) => {
    if (depth === 16) return data.readUInt16BE(row * rowBytes + i * 2) / 65535;
    if (depth === 8) return data[row * rowBytes + i] / 255;
    const bit = i * depth;
    const byte = data[row * rowBytes + (bit >> 3)];
    const shift = 8 - depth - (bit & 7);
    return ((byte >> shift) & ((1 << depth) - 1)) / (color === 3 ? 1 : (1 << depth) - 1);
  };
  let pr, pg, pb;
  if (color === 3) {
    const idx = sample(y, x) | 0;
    pr = palette[idx * 3] / 255; pg = palette[idx * 3 + 1] / 255; pb = palette[idx * 3 + 2] / 255;
  } else {
    const base = x * ch;
    pr = sample(y, base);
    if (color === 0 || color === 4) { pg = pr; pb = pr; }
    else { pg = sample(y, base + 1); pb = sample(y, base + 2); }
  }
  return [srgbToLinear(pr), srgbToLinear(pg), srgbToLinear(pb)];
}

// Mean colour, weighted by alpha: a leaf card is mostly transparent gutter and
// averaging the gutter in turns every tree the colour of nothing.
function pngAverage(png) {
  const { w, h, depth, color, ch, rowBytes, data, palette } = png;
  let r = 0, g = 0, b = 0, wsum = 0;
  const sample = (row, i) => {
    if (depth === 16) return data.readUInt16BE(row * rowBytes + i * 2) / 65535;
    if (depth === 8) return data[row * rowBytes + i] / 255;
    // 1/2/4-bit greyscale or palette index
    const bitsPer = depth;
    const bit = i * bitsPer;
    const byte = data[row * rowBytes + (bit >> 3)];
    const shift = 8 - bitsPer - (bit & 7);
    return ((byte >> shift) & ((1 << bitsPer) - 1)) / (color === 3 ? 1 : (1 << bitsPer) - 1);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let pr, pg, pb, pa = 1;
      if (color === 3) {
        const idx = sample(y, x) | 0;
        pr = palette[idx * 3] / 255; pg = palette[idx * 3 + 1] / 255; pb = palette[idx * 3 + 2] / 255;
        if (png.trns && idx < png.trns.length) pa = png.trns[idx] / 255;
      } else {
        const base = x * ch;
        pr = sample(y, base);
        if (color === 0) { pg = pr; pb = pr; }
        else if (color === 4) { pg = pr; pb = pr; pa = sample(y, base + 1); }
        else { pg = sample(y, base + 1); pb = sample(y, base + 2); if (color === 6) pa = sample(y, base + 3); }
      }
      // Average in LINEAR light, then hand the caller linear: mixing sRGB
      // numbers directly makes a green-and-brown tree come out muddy.
      r += srgbToLinear(pr) * pa; g += srgbToLinear(pg) * pa; b += srgbToLinear(pb) * pa;
      wsum += pa;
    }
  }
  if (wsum < 1e-6) return [0.5, 0.5, 0.5];
  return [r / wsum, g / wsum, b / wsum];
}

// ------------------------------------------------------------------ JPEG (DC)

// Baseline sequential JPEG, DC coefficients ONLY. That is all an average colour
// needs: for the 8x8 IDCT the DC basis function is constant, so a block's mean
// is exactly dequantised(DC)/8 + 128. Skipping the AC pass and the IDCT turns a
// full decoder into this. Progressive JPEG throws, and the caller falls back to
// the material's baseColorFactor.
function jpegAverage(buf) {
  let p = 2;
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
  const qt = {}, huff = {};
  let frame = null, adobeTransform = -1;
  while (p < buf.length) {
    if (buf[p] !== 0xff) { p++; continue; }
    const marker = buf[p + 1];
    p += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9) break;
    const len = buf.readUInt16BE(p);
    const seg = buf.subarray(p + 2, p + len);
    if (marker === 0xdb) {                       // DQT
      let q = 0;
      while (q < seg.length) {
        const pq = seg[q] >> 4, tq = seg[q] & 15; q++;
        const tab = new Int32Array(64);
        for (let i = 0; i < 64; i++) {
          tab[i] = pq ? seg.readUInt16BE(q + i * 2) : seg[q + i];
        }
        q += pq ? 128 : 64;
        qt[tq] = tab;
      }
    } else if (marker === 0xc0 || marker === 0xc1) {   // SOF0/1 baseline
      frame = { h: seg.readUInt16BE(1), w: seg.readUInt16BE(3), comps: [] };
      const n = seg[5];
      for (let i = 0; i < n; i++) {
        const o = 6 + i * 3;
        frame.comps.push({ id: seg[o], hs: seg[o + 1] >> 4, vs: seg[o + 1] & 15, tq: seg[o + 2] });
      }
    } else if (marker === 0xc2) {
      throw new Error('progressive JPEG is not supported');
    } else if (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      throw new Error(`JPEG frame type 0x${marker.toString(16)} is not supported`);
    } else if (marker === 0xc4) {                // DHT
      let q = 0;
      while (q < seg.length) {
        const tc = seg[q] >> 4, th = seg[q] & 15; q++;
        const counts = [];
        let total = 0;
        for (let i = 0; i < 16; i++) { counts.push(seg[q + i]); total += seg[q + i]; }
        q += 16;
        const symbols = [];
        for (let i = 0; i < total; i++) symbols.push(seg[q + i]);
        q += total;
        // canonical code table: [length, code] -> symbol
        const map = new Map();
        let code = 0, k = 0;
        for (let l = 1; l <= 16; l++) {
          for (let i = 0; i < counts[l - 1]; i++) map.set(l * 65536 + code++, symbols[k++]);
          code <<= 1;
        }
        huff[tc * 16 + th] = map;
      }
    } else if (marker === 0xee) {                // APP14 Adobe: colour transform
      if (seg.length >= 12 && seg.toString('ascii', 0, 5) === 'Adobe') adobeTransform = seg[11];
    } else if (marker === 0xda) {                // SOS — the scan itself
      if (!frame) throw new Error('JPEG SOS before SOF');
      const ns = seg[0];
      const scan = [];
      for (let i = 0; i < ns; i++) {
        const id = seg[1 + i * 2], t = seg[2 + i * 2];
        const c = frame.comps.find((q2) => q2.id === id);
        scan.push({ c, dc: t >> 4, ac: t & 15 });
      }
      return jpegScanAverage(buf, p + len, frame, scan, qt, huff, adobeTransform);
    }
    p += len;
  }
  throw new Error('JPEG has no scan');
}

function jpegScanAverage(buf, start, frame, scan, qt, huff, adobeTransform) {
  const hmax = Math.max(...frame.comps.map((c) => c.hs));
  const vmax = Math.max(...frame.comps.map((c) => c.vs));
  const mcuW = 8 * hmax, mcuH = 8 * vmax;
  const mcusX = Math.ceil(frame.w / mcuW), mcusY = Math.ceil(frame.h / mcuH);

  let bp = start, bitBuf = 0, bitCount = 0;
  const nextBit = () => {
    if (bitCount === 0) {
      if (bp >= buf.length) return 0;
      let b = buf[bp++];
      if (b === 0xff) {
        const m = buf[bp];
        if (m === 0x00) bp++;
        else if (m >= 0xd0 && m <= 0xd7) { bp++; b = buf[bp++]; if (b === 0xff && buf[bp] === 0) bp++; }
        else return 0;
      }
      bitBuf = b; bitCount = 8;
    }
    bitCount--;
    return (bitBuf >> bitCount) & 1;
  };
  const decodeHuff = (map) => {
    let code = 0;
    for (let l = 1; l <= 16; l++) {
      code = (code << 1) | nextBit();
      const s = map.get(l * 65536 + code);
      if (s !== undefined) return s;
    }
    throw new Error('bad Huffman code');
  };
  const receiveExtend = (s) => {
    if (s === 0) return 0;
    let v = 0;
    for (let i = 0; i < s; i++) v = (v << 1) | nextBit();
    return v < (1 << (s - 1)) ? v - (1 << s) + 1 : v;
  };

  const pred = new Array(scan.length).fill(0);
  const sums = scan.map(() => 0);
  const counts = scan.map(() => 0);
  for (let my = 0; my < mcusY; my++) {
    for (let mx = 0; mx < mcusX; mx++) {
      for (let s = 0; s < scan.length; s++) {
        const { c, dc } = scan[s];
        const q = qt[c.tq];
        for (let by = 0; by < c.vs; by++) {
          for (let bx = 0; bx < c.hs; bx++) {
            const t = decodeHuff(huff[dc]);
            pred[s] += receiveExtend(t);
            // Every AC coefficient still has to be Huffman-decoded to walk the
            // bitstream to the next block; the values themselves are dropped.
            const acMap = huff[16 + scan[s].ac];
            let k = 1;
            while (k < 64) {
              const rs = decodeHuff(acMap);
              const r = rs >> 4, sz = rs & 15;
              if (sz === 0) { if (r !== 15) break; k += 16; continue; }
              k += r;
              receiveExtend(sz);
              k++;
            }
            sums[s] += (pred[s] * q[0]) / 8 + 128;
            counts[s]++;
          }
        }
      }
    }
  }
  const mean = sums.map((v, i) => (counts[i] ? v / counts[i] / 255 : 0.5));
  let rgb;
  if (scan.length >= 3 && adobeTransform !== 0) {
    const [Y, Cb, Cr] = mean;
    rgb = [
      Y + 1.402 * (Cr - 0.5),
      Y - 0.344136 * (Cb - 0.5) - 0.714136 * (Cr - 0.5),
      Y + 1.772 * (Cb - 0.5),
    ];
  } else if (scan.length === 1) rgb = [mean[0], mean[0], mean[0]];
  else rgb = [mean[0], mean[1] ?? mean[0], mean[2] ?? mean[0]];
  return rgb.map((v) => srgbToLinear(Math.min(1, Math.max(0, v))));
}

// ------------------------------------------------------------------ colour

const hex = (c) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
};

// The average colour of a material's baseColorTexture, in LINEAR light, cached
// per texture index because a Kenney kit is fifty meshes sharing one atlas.
const texAvgCache = new Map();
const usedOverrides = new Set();

// Decode a texture once per file: { avg (linear rgb), png (or null) }. `png`
// being present is what unlocks per-vertex sampling, which is the difference
// between a Kenney kit arriving in its real colours and arriving as one flat
// average of its whole palette strip — a grey blob.
function textureData(g, texIndex) {
  if (texAvgCache.has(texIndex)) return texAvgCache.get(texIndex);
  let result = null;
  try {
    const tex = g.json.textures[texIndex];
    const src = tex.source ?? tex.extensions?.EXT_texture_webp?.source
      ?? tex.extensions?.KHR_texture_basisu?.source;
    if (src === undefined) throw new Error('texture has no decodable source');
    const img = g.json.images[src];
    let bytes;
    if (img.uri && img.uri.startsWith('data:')) bytes = decodeDataURI(img.uri);
    else if (img.uri) bytes = readFileSync(join(g.base, decodeURIComponent(img.uri)));
    else {
      const bv = g.json.bufferViews[img.bufferView];
      const b = g.buffers[bv.buffer];
      bytes = b.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    }
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      const png = decodePNG(bytes);
      result = { avg: pngAverage(png), png };
    } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      // The DC-only JPEG decoder yields the mean and nothing addressable, so a
      // JPEG-textured model gets one flat colour per material. None of the kits
      // in assets/models use JPEG; Poly Haven's photogrammetry does.
      result = { avg: jpegAverage(bytes), png: null };
    } else throw new Error('image is neither PNG nor JPEG');
  } catch (e) {
    warn(`texture ${texIndex}: ${e.message} — falling back to baseColorFactor`);
    result = null;
  }
  texAvgCache.set(texIndex, result);
  return result;
}

// Per-material flat colour, sRGB, ready to go straight into a vertex.
// How a primitive is coloured: a flat sRGB triple, and — when the material's
// baseColorTexture decoded to real pixels — a per-vertex sampler to use instead.
// Order of preference is the documented one: an override, then COLOR_0 (handled
// by the caller), then baseColorTexture, then baseColorFactor.
function materialColour(g, matIndex, opt) {
  const mat = matIndex === undefined ? null : g.json.materials?.[matIndex];
  // An override is already sRGB and skips the whole factor/texture chain.
  if (opt.color) return { flat: opt.color, sample: null };
  if (mat && opt.material[mat.name]) {
    usedOverrides.add(mat.name);
    return { flat: opt.material[mat.name], sample: null };
  }
  const pbr = mat?.pbrMetallicRoughness || {};
  const factor = pbr.baseColorFactor || [1, 1, 1, 1];
  let lin = [factor[0], factor[1], factor[2]];
  let sample = null;
  if (pbr.baseColorTexture) {
    const tex = textureData(g, pbr.baseColorTexture.index);
    if (tex) {
      lin = [tex.avg[0] * factor[0], tex.avg[1] * factor[1], tex.avg[2] * factor[2]];
      if (tex.png) {
        sample = (u, v) => {
          const t = pngPixel(tex.png, u, v);
          return [linearToSrgb(t[0] * factor[0]), linearToSrgb(t[1] * factor[1]),
            linearToSrgb(t[2] * factor[2])];
        };
      }
    }
  }
  return { flat: lin.map(linearToSrgb), sample };
}

// ------------------------------------------------------------------ traversal

function collectPrimitives(g, opt) {
  const out = [];
  const scene = g.json.scenes?.[g.json.scene ?? 0];
  const roots = scene?.nodes ?? g.json.nodes?.map((_, i) => i) ?? [];
  const seen = new Set();
  const walk = (ni, parent, keep) => {
    if (seen.has(ni)) return;   // a malformed file can loop; a node is one place
    const node = g.json.nodes[ni];
    if (!node) return;
    const world = matMul(parent, trsMatrix(node));
    const named = !opt.nodes.length
      || opt.nodes.some((n) => (node.name || '').toLowerCase().includes(n.toLowerCase()));
    const take = keep || named;
    if (node.mesh !== undefined && take) {
      const mesh = g.json.meshes[node.mesh];
      const meshOk = !opt.meshes.length
        || opt.meshes.some((n) => (mesh.name || '').toLowerCase().includes(n.toLowerCase()));
      if (meshOk) {
        for (const prim of mesh.primitives || []) {
          out.push({ prim, world, name: node.name || mesh.name || `node${ni}` });
        }
      }
    }
    for (const c of node.children || []) walk(c, world, take);
  };
  for (const r of roots) walk(r, matIdentity(), false);
  return out;
}

// TRIANGLE_STRIP / _FAN are rare in glTF but legal; the rest of the pipeline
// only ever wants plain triangles.
function triangulate(mode, indices, vertCount) {
  const n = indices ? indices.length : vertCount;
  const at = (i) => (indices ? indices[i] : i);
  const out = [];
  if (mode === undefined || mode === 4) {                 // TRIANGLES
    for (let i = 0; i + 2 < n; i += 3) out.push(at(i), at(i + 1), at(i + 2));
  } else if (mode === 5) {                                // TRIANGLE_STRIP
    for (let i = 0; i + 2 < n; i++) {
      if (i % 2 === 0) out.push(at(i), at(i + 1), at(i + 2));
      else out.push(at(i), at(i + 2), at(i + 1));
    }
  } else if (mode === 6) {                                // TRIANGLE_FAN
    for (let i = 1; i + 1 < n; i++) out.push(at(0), at(i), at(i + 1));
  } else {
    return null;                                          // points / lines: skip
  }
  return out;
}

// ------------------------------------------------------------------ the build

function convert(opt) {
  const g = loadGltf(opt.in);
  const prims = collectPrimitives(g, opt);
  if (!prims.length) throw new Error('nothing matched: no mesh primitives in the scene');

  const pos = [], nor = [], col = [], uvs = [], idx = [];
  let hadNormals = true;
  for (const { prim, world, name } of prims) {
    const attrs = prim.attributes || {};
    if (attrs.POSITION === undefined) { warn(`${name}: primitive with no POSITION`); continue; }
    const P = readAccessor(g, attrs.POSITION);
    const tri = triangulate(prim.mode, prim.indices !== undefined
      ? readAccessor(g, prim.indices).data : null, P.count);
    if (!tri) { warn(`${name}: primitive mode ${prim.mode} is not triangles — skipped`); continue; }
    const N = attrs.NORMAL !== undefined ? readAccessor(g, attrs.NORMAL) : null;
    if (!N) hadNormals = false;
    const C = attrs.COLOR_0 !== undefined ? readAccessor(g, attrs.COLOR_0) : null;

    const paint = materialColour(g, prim.material, opt);
    // The sampler needs UVs whether or not --uv keeps them in the output.
    const UV = attrs.TEXCOORD_0 !== undefined ? readAccessor(g, attrs.TEXCOORD_0) : null;
    const nm = normalMatrix(world);

    const base = pos.length / 3;
    for (let i = 0; i < P.count; i++) {
      const p = transformPoint(world, P.data[i * 3], P.data[i * 3 + 1], P.data[i * 3 + 2]);
      pos.push(p[0], p[1], p[2]);
      if (N) {
        const q = transformNormal(nm.m, N.data[i * 3], N.data[i * 3 + 1], N.data[i * 3 + 2]);
        const l = Math.hypot(q[0], q[1], q[2]) || 1;
        nor.push(q[0] / l, q[1] / l, q[2] / l);
      } else nor.push(0, 0, 0);
      if (C) {
        // COLOR_0 is linear, like every colour in glTF.
        col.push(linearToSrgb(C.data[i * C.comps]),
          linearToSrgb(C.data[i * C.comps + 1]),
          linearToSrgb(C.data[i * C.comps + 2]));
      } else if (paint.sample && UV) {
        const c = paint.sample(UV.data[i * 2], UV.data[i * 2 + 1]);
        col.push(c[0], c[1], c[2]);
      } else col.push(paint.flat[0], paint.flat[1], paint.flat[2]);
      if (opt.uv) uvs.push(UV ? UV.data[i * 2] : 0, UV ? UV.data[i * 2 + 1] : 0);
    }
    // A node with a negative determinant is a MIRRORED instance. Its geometry
    // is fine; its winding is inside out, and the renderer culls by winding.
    const flip = nm.det < 0;
    for (let i = 0; i < tri.length; i += 3) {
      if (flip) idx.push(base + tri[i], base + tri[i + 2], base + tri[i + 1]);
      else idx.push(base + tri[i], base + tri[i + 1], base + tri[i + 2]);
    }
    if (flip) for (let i = base * 3; i < pos.length; i += 3) { /* normals flip too */
      nor[i] = -nor[i]; nor[i + 1] = -nor[i + 1]; nor[i + 2] = -nor[i + 2];
    }
  }
  if (!idx.length) throw new Error('no triangles survived conversion');
  // A misspelt material name would otherwise repaint nothing and say nothing,
  // and the model would ship in the kit's own palette.
  for (const name of Object.keys(opt.material)) {
    if (!usedOverrides.has(name)) {
      warn(`--material ${name} matched no material in ${basename(opt.in)} `
        + `(it has: ${(g.json.materials || []).map((m) => m.name).join(', ') || 'none'})`);
    }
  }

  // ---- axis fixes. Both are proper rotations, so winding survives untouched.
  const rotate = (x, y, z) => {
    if (opt.up === 'z') { const t = y; y = z; z = -t; }         // Z-up -> Y-up, -90 about X
    // Then a quarter turn about Y so the named axis becomes +Z. Checked by
    // hand: +x must land on +z AND +z on -x, or the mesh is mirrored rather
    // than turned and every face is inside out.
    if (opt.forward === '+x') { const t = x; x = -z; z = t; }   // (x,y,z) -> (-z, y, x)
    else if (opt.forward === '-x') { const t = x; x = z; z = -t; }
    else if (opt.forward === '-z') { x = -x; z = -z; }
    return [x, y, z];
  };
  const [sx, sy, sz] = opt.scale;
  // A non-uniform scale takes normals through the INVERSE, not the scale: shrink
  // a body in x and its side normals must tip further out, not further in. For a
  // uniform scale this is a no-op after renormalising.
  const [ix, iy, iz] = [1 / sx, 1 / sy, 1 / sz];
  for (let i = 0; i < pos.length; i += 3) {
    const p = rotate(pos[i], pos[i + 1], pos[i + 2]);
    pos[i] = p[0] * sx; pos[i + 1] = p[1] * sy; pos[i + 2] = p[2] * sz;
    const n = rotate(nor[i], nor[i + 1], nor[i + 2]);
    const qx = n[0] * ix, qy = n[1] * iy, qz = n[2] * iz;
    const l = Math.hypot(qx, qy, qz) || 1;
    nor[i] = qx / l; nor[i + 1] = qy / l; nor[i + 2] = qz / l;
  }

  // ---- normals, where the source had none. Accumulating area-weighted face
  // normals per INDEX gives smooth where the model shares vertices and flat
  // where it splits them, which is what the artist meant either way.
  if (!hadNormals) {
    const acc = new Float64Array(pos.length);
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) { acc[o] += nx; acc[o + 1] += ny; acc[o + 2] += nz; }
    }
    for (let i = 0; i < pos.length; i += 3) {
      const l = Math.hypot(acc[i], acc[i + 1], acc[i + 2]);
      if (l > 1e-12) { nor[i] = acc[i] / l; nor[i + 1] = acc[i + 1] / l; nor[i + 2] = acc[i + 2] / l; }
      else { nor[i] = 0; nor[i + 1] = 1; nor[i + 2] = 0; }
    }
  } else {
    // A zero normal reaches the shader as a black surface; a source that mixes
    // primitives with and without NORMAL leaves some behind.
    for (let i = 0; i < nor.length; i += 3) {
      const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]);
      if (l > 1e-6) { nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l; }
      else { nor[i] = 0; nor[i + 1] = 1; nor[i + 2] = 0; }
    }
  }

  // ---- palette snap. Nearest key in plain RGB: the sampled colours inside one
  // of Kenney's swatches drift by a few units (his colormap is not perfectly
  // flat), and a tolerance would need tuning per model where nearest never does.
  if (opt.recolor.length) {
    const hits = new Array(opt.recolor.length).fill(0);
    for (let i = 0; i < col.length; i += 3) {
      let best = 0, bestD = Infinity;
      for (let k = 0; k < opt.recolor.length; k++) {
        const a = opt.recolor[k][0];
        const d = (col[i] - a[0]) ** 2 + (col[i + 1] - a[1]) ** 2 + (col[i + 2] - a[2]) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      hits[best]++;
      const b = opt.recolor[best][1];
      col[i] = b[0]; col[i + 1] = b[1]; col[i + 2] = b[2];
    }
    // A key nothing landed on is a key that was measured wrong, and the part it
    // was meant for has silently taken some other colour.
    for (let k = 0; k < hits.length; k++) {
      if (!hits[k]) warn(`--recolor entry ${k + 1} (${hex(opt.recolor[k][0])}) claimed no vertices `
        + `in ${basename(opt.in)} — run --listColors and use a colour that is really there`);
    }
  }

  // ---- bounds, then centring
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const bounds = () => {
    min[0] = min[1] = min[2] = Infinity; max[0] = max[1] = max[2] = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (pos[i + k] < min[k]) min[k] = pos[i + k];
        if (pos[i + k] > max[k]) max[k] = pos[i + k];
      }
    }
  };
  bounds();
  if (opt.center) {
    const dx = -(min[0] + max[0]) / 2, dy = -min[1], dz = -(min[2] + max[2]) / 2;
    for (let i = 0; i < pos.length; i += 3) { pos[i] += dx; pos[i + 1] += dy; pos[i + 2] += dz; }
    bounds();
  }
  if (opt.offset) {
    const [ox, oy, oz] = opt.offset;
    for (let i = 0; i < pos.length; i += 3) { pos[i] += ox; pos[i + 1] += oy; pos[i + 2] += oz; }
    bounds();
  }

  const tris = idx.length / 3;
  if (opt.maxTris && tris > opt.maxTris) {
    throw new Error(`${tris} triangles is over the --maxTris ${opt.maxTris} budget for `
      + `${basename(opt.in)}. Decimate the source or pick a lower-poly one; shipping it `
      + 'as-is is how a 3,200-tree town runs out of memory.');
  }
  return { pos, nor, col, uvs, idx, min, max, tris, verts: pos.length / 3, hadNormals };
}

// ------------------------------------------------------------------ licensing

function readLicense(opt) {
  const path = opt.license || `${opt.in.replace(/\.(gltf|glb)$/i, '')}.license.json`;
  if (!existsSync(path)) {
    warn(`no licence sidecar at ${path} — the model ships with an EMPTY licence block, `
      + 'which assets/models/LICENSES.md must not be allowed to contain');
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ------------------------------------------------------------------ output

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r5 = (v) => Math.round(v * 1e5) / 1e5;

function write(opt, m, license) {
  const outPath = resolve(opt.out || opt.in.replace(/\.(gltf|glb)$/i, '.json'));
  mkdirSync(dirname(outPath), { recursive: true });
  const slug = opt.slug || basename(outPath).replace(/\.json$/i, '');
  const head = {
    format: 'aylmer-mesh-1',
    slug,
    source: basename(opt.in),
    tris: m.tris,
    verts: m.verts,
    bounds: { min: m.min.map(r4), max: m.max.map(r4) },
    uv: opt.uv,
    license: license || null,
  };
  const doc = {
    ...head,
    positions: m.pos.map(r4),
    normals: m.nor.map(r5),
    colors: m.col.map(r4),
    indices: m.idx,
  };
  if (opt.uv) doc.uvs = m.uvs.map(r5);
  let text = JSON.stringify(doc);
  if (text.length <= opt.maxJson) {
    writeFileSync(outPath, text);
    return { outPath, bytes: text.length, bin: null };
  }
  // Too big to keep readable: the arrays go to a sibling .bin in the exact order
  // models.js reads them, and the .json keeps only what a manifest needs.
  const binName = `${slug}.bin`;
  const f32 = (arr) => Buffer.from(new Float32Array(arr).buffer);
  const parts = [f32(m.pos), f32(m.nor), f32(m.col)];
  if (opt.uv) parts.push(f32(m.uvs));
  parts.push(Buffer.from(new Uint32Array(m.idx).buffer));
  const bin = Buffer.concat(parts);
  writeFileSync(join(dirname(outPath), binName), bin);
  text = JSON.stringify({ ...head, bin: binName, binBytes: bin.length });
  writeFileSync(outPath, text);
  return { outPath, bytes: text.length, bin: binName, binBytes: bin.length };
}

// ------------------------------------------------------------------ main

// The colour clusters actually present, biggest first: what you write a
// --recolor palette from. Merges anything within a couple of units, because a
// Kenney swatch samples as a spread and not a single value.
function listColors(m) {
  const buckets = [];
  for (let i = 0; i < m.col.length; i += 3) {
    const c = [m.col[i], m.col[i + 1], m.col[i + 2]];
    let hit = null;
    for (const b of buckets) {
      const d = (b.c[0] - c[0]) ** 2 + (b.c[1] - c[1]) ** 2 + (b.c[2] - c[2]) ** 2;
      if (d < 0.02 * 0.02) { hit = b; break; }
    }
    if (hit) hit.n++; else buckets.push({ c, n: 1 });
  }
  buckets.sort((a, b) => b.n - a.n);
  console.log(`${buckets.length} colour clusters, biggest first:`);
  for (const b of buckets.slice(0, 24)) {
    console.log(`  ${hex(b.c)}  ${String(b.n).padStart(6)} verts `
      + `(${(100 * b.n / (m.col.length / 3)).toFixed(1)}%)`);
  }
}

export function run(argv) {
  // Both caches are module-level so one conversion can reuse a kit's shared
  // atlas. They have to be emptied per run, or a second file converted in the
  // same process inherits the first one's texture 0 and its warnings.
  warnings.length = 0;
  texAvgCache.clear();
  usedOverrides.clear();
  const opt = parseArgs(argv);
  const m = convert(opt);
  if (opt.listColors) { listColors(m); return { ...m, warnings: warnings.slice() }; }
  const license = readLicense(opt);
  const res = write(opt, m, license);
  if (!opt.quiet) {
    console.log(`${basename(opt.in)} -> ${res.outPath}`);
    console.log(`  ${m.tris} tris, ${m.verts} verts`
      + `, bounds ${m.min.map((v) => v.toFixed(2)).join(',')} .. ${m.max.map((v) => v.toFixed(2)).join(',')}`
      + `, ${(res.bytes / 1024).toFixed(1)} kB json${res.bin ? ` + ${(res.binBytes / 1024).toFixed(1)} kB bin` : ''}`);
  }
  return { ...res, ...m, warnings: warnings.slice() };
}

// fileURLToPath, not URL.pathname: this repo lives under a path with a space
// in it, and pathname hands back the %20 still encoded.
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    run(process.argv.slice(2));
  } catch (e) {
    console.error('gltf2mesh:', e.message);
    process.exit(1);
  }
}
