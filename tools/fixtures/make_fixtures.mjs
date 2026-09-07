#!/usr/bin/env node
// Writes the glTF fixtures tools/smoke_models.mjs converts. Committed output,
// regenerable input: the .gltf files are small enough to read in a diff, and
// this is where the numbers in them came from.
//
//   node tools/fixtures/make_fixtures.mjs
//
// Three files, each exercising a path the real kits take:
//   cube.gltf / cube.bin  external buffer, NO normals (the converter computes
//                         them), one baseColorFactor material.
//   cube.glb              the same cube as a binary container.
//   pickup.gltf           embedded data: URI buffer, a node hierarchy with real
//                         translations to bake, one MIRRORED wheel (negative
//                         scale, so its winding has to be flipped back), a
//                         COLOR_0 stream on the bed, and a 2x2 PNG
//                         baseColorTexture on the tyres so the texture-average
//                         path has something to average. Nose points +X, and it
//                         floats 0.35 m off the ground so --center has work.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(HERE, { recursive: true });

// ------------------------------------------------------------------ geometry

// An axis-aligned box as 24 vertices (4 per face, so faces stay flat) and 36
// indices, wound counter-clockwise seen from outside.
function box(x0, y0, z0, x1, y1, z1) {
  const P = [], I = [];
  const face = (a, b, c, d) => {
    const base = P.length / 3;
    for (const p of [a, b, c, d]) P.push(p[0], p[1], p[2]);
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const v = (i, j, k) => [i ? x1 : x0, j ? y1 : y0, k ? z1 : z0];
  face(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1));   // +Z
  face(v(1, 0, 0), v(0, 0, 0), v(0, 1, 0), v(1, 1, 0));   // -Z
  face(v(1, 0, 1), v(1, 0, 0), v(1, 1, 0), v(1, 1, 1));   // +X
  face(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0));   // -X
  face(v(0, 1, 1), v(1, 1, 1), v(1, 1, 0), v(0, 1, 0));   // +Y
  face(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1));   // -Y
  return { P, I };
}

const bounds = (P) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (P[i + k] < min[k]) min[k] = P[i + k];
      if (P[i + k] > max[k]) max[k] = P[i + k];
    }
  }
  return { min, max };
};

// ------------------------------------------------------------------ a real PNG

// 2x2 truecolour PNG, no filtering: two mid-greys and two near-blacks, so its
// alpha-weighted mean is a known tyre grey. Written by hand (CRC included)
// because a fixture that needs a library to produce is not a fixture.
function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const tb = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, body])));
  return Buffer.concat([len, tb, body, crc]);
}
function tinyPNG() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGB
  // two scanlines, filter byte 0 each, pixels (60,60,64) (30,30,34) / (40,40,44) (20,20,24)
  const raw = Buffer.from([0, 60, 60, 64, 30, 30, 34, 0, 40, 40, 44, 20, 20, 24]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ 1. cube

// 2 m cube centred at the origin. No NORMAL attribute on purpose.
{
  const { P, I } = box(-1, -1, -1, 1, 1, 1);
  const posBuf = Buffer.from(new Float32Array(P).buffer);
  const idxBuf = Buffer.from(new Uint16Array(I).buffer);
  const bin = Buffer.concat([posBuf, idxBuf]);
  writeFileSync(join(HERE, 'cube.bin'), bin);
  const b = bounds(P);
  const gltf = {
    asset: { version: '2.0', generator: 'aylmer-madness tools/fixtures/make_fixtures.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Cube', mesh: 0 }],
    meshes: [{ name: 'Cube', primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    // 0.8 / 0.2 / 0.1 LINEAR -> the converter must hand back sRGB, which is
    // brighter: the smoke suite pins the exact numbers.
    materials: [{ name: 'Orange', pbrMetallicRoughness: { baseColorFactor: [0.8, 0.2, 0.1, 1] } }],
    buffers: [{ uri: 'cube.bin', byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length, byteLength: idxBuf.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: P.length / 3, type: 'VEC3', min: b.min, max: b.max },
      { bufferView: 1, componentType: 5123, count: I.length, type: 'SCALAR' },
    ],
  };
  writeFileSync(join(HERE, 'cube.gltf'), JSON.stringify(gltf, null, 1) + '\n');

  // ---- the same thing as a .glb
  const glbJson = JSON.parse(JSON.stringify(gltf));
  delete glbJson.buffers[0].uri;
  const pad = (buf, to) => {
    const n = (to - (buf.length % to)) % to;
    return n ? Buffer.concat([buf, Buffer.alloc(n, to === 4 ? 0x20 : 0)]) : buf;
  };
  const jsonChunk = pad(Buffer.from(JSON.stringify(glbJson), 'utf8'), 4);
  const binChunk = pad(bin, 4);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunk = (len, type) => {
    const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h;
  };
  writeFileSync(join(HERE, 'cube.glb'), Buffer.concat([
    head, chunk(jsonChunk.length, 0x4e4f534a), jsonChunk,
    chunk(binChunk.length, 0x004e4942), binChunk,
  ]));
}

// ------------------------------------------------------------------ 2. pickup

// A toy regular-cab pickup at 1993 Ranger dimensions, authored NOSE ALONG +X
// and floating 0.35 m off the ground, which is what --forward +x --center is
// for. Wheelbase 2.75 about x = 0, so the axle midpoint is the mesh origin the
// way cars.js wants it; the little grille box at x = +2.55 is what makes the
// nose findable in the output.
{
  // The Ranger's own numbers. TRACK is 1.66, not the 1.67 written in the cars.js
  // spec table: finalizeCar() recomputes track from the plan profile on import
  // and overwrites whatever the spec declared. Take the effective value, or the
  // game's wheels and a converted body disagree by a centimetre for ever.
  const WB = 2.75, R = 0.34, TRACK = 1.66, FLOAT = 0.35;
  const yc = FLOAT + R;                      // wheel centre height
  const parts = [];
  // cab + bed, one box each, symmetric about x = 0 so --center leaves x alone
  parts.push({ name: 'Bed', color: [0.92, 0.91, 0.87], vcol: true, ...box(-2.39, FLOAT + 0.40, -0.885, 0.05, FLOAT + 0.74, 0.885) });
  parts.push({ name: 'Cab', color: [0.92, 0.91, 0.87], ...box(0.05, FLOAT + 0.40, -0.885, 1.10, FLOAT + 1.64, 0.885) });
  parts.push({ name: 'Hood', color: [0.92, 0.91, 0.87], ...box(1.10, FLOAT + 0.40, -0.885, 2.39, FLOAT + 1.16, 0.885) });
  // The nose marker: it alone reaches x = +2.55, so "max z == +2.55 afterwards"
  // is a one-line proof the truck turned rather than mirrored.
  parts.push({ name: 'Grille', color: [0.2, 0.21, 0.22], ...box(2.39, FLOAT + 0.55, -0.60, 2.55, FLOAT + 0.95, 0.60) });

  const wheels = [
    ['WheelFL', WB / 2, TRACK / 2, 1],
    ['WheelFR', WB / 2, -TRACK / 2, -1],       // mirrored instance
    ['WheelRL', -WB / 2, TRACK / 2, 1],
    ['WheelRR', -WB / 2, -TRACK / 2, -1],
  ];

  const nodes = [], meshes = [], accessors = [], bufferViews = [], chunks = [];
  let byteOffset = 0;
  const push = (buf, target) => {
    const bv = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buf.length, target });
    chunks.push(buf);
    byteOffset += buf.length;
    // Every bufferView must start 4-aligned for the Float32 accessors above it.
    const padN = (4 - (byteOffset % 4)) % 4;
    if (padN) { chunks.push(Buffer.alloc(padN)); byteOffset += padN; }
    return bv;
  };
  const addPrim = (name, geo, material, vcol) => {
    const b = bounds(geo.P);
    const pv = push(Buffer.from(new Float32Array(geo.P).buffer), 34962);
    const attributes = { POSITION: accessors.length };
    accessors.push({ bufferView: pv, componentType: 5126, count: geo.P.length / 3, type: 'VEC3', min: b.min, max: b.max });
    if (vcol) {
      // COLOR_0 as normalised unsigned bytes, the common on-disk form: a green
      // tailgate stripe so the suite can prove COLOR_0 beat baseColorFactor.
      const bytes = [];
      for (let i = 0; i < geo.P.length / 3; i++) bytes.push(46, 122, 52, 255);
      const cv = push(Buffer.from(Uint8Array.from(bytes).buffer), 34962);
      attributes.COLOR_0 = accessors.length;
      accessors.push({ bufferView: cv, componentType: 5121, normalized: true, count: geo.P.length / 3, type: 'VEC4' });
    }
    const iv = push(Buffer.from(new Uint16Array(geo.I).buffer), 34963);
    const indices = accessors.length;
    accessors.push({ bufferView: iv, componentType: 5123, count: geo.I.length, type: 'SCALAR' });
    meshes.push({ name, primitives: [{ attributes, indices, material }] });
    return meshes.length - 1;
  };

  for (const p of parts) {
    const mi = addPrim(p.name, p, p.color === parts[3].color ? 1 : 0, !!p.vcol);
    nodes.push({ name: p.name, mesh: mi });
  }
  // One wheel MESH at the origin, instanced four times by node transforms —
  // exactly how a Kenney kit is put together, and the only way the determinant
  // check gets tested.
  // The axle runs across the vehicle, so for a nose-along-+X truck the wheel is
  // thin along Z and round in X/Y. Getting this backwards makes a truck whose
  // "wheels" are discs facing forward, which passes a bounds check and fails
  // the moment anything asks where the contact patches are.
  const wheelGeo = box(-R, -R, -0.12, R, R, 0.12);
  const wheelMesh = addPrim('Wheel', wheelGeo, 2, false);
  for (const [name, x, z, sign] of wheels) {
    nodes.push({
      name, mesh: wheelMesh, translation: [x, yc, z],
      // A negative Z scale mirrors the instance across the vehicle's centreline:
      // same geometry, inside-out winding, and the converter has to notice.
      scale: [1, 1, sign],
    });
  }

  const bin = Buffer.concat(chunks);
  const png = tinyPNG();
  const gltf = {
    asset: { version: '2.0', generator: 'aylmer-madness tools/fixtures/make_fixtures.mjs' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials: [
      { name: 'Paint', pbrMetallicRoughness: { baseColorFactor: [0.78, 0.76, 0.70, 1] } },
      { name: 'Trim', pbrMetallicRoughness: { baseColorFactor: [0.03, 0.032, 0.035, 1] } },
      { name: 'Tyre', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, baseColorFactor: [1, 1, 1, 1] } },
    ],
    textures: [{ source: 0 }],
    images: [{ name: 'tyre', uri: 'data:image/png;base64,' + png.toString('base64') }],
    buffers: [{ uri: 'data:application/octet-stream;base64,' + bin.toString('base64'), byteLength: bin.length }],
    bufferViews,
    accessors,
  };
  writeFileSync(join(HERE, 'pickup.gltf'), JSON.stringify(gltf, null, 1) + '\n');
  writeFileSync(join(HERE, 'pickup.license.json'), JSON.stringify({
    title: 'Fixture pickup (not a real asset)',
    author: 'Aylmer Madness fixtures',
    source: 'tools/fixtures/make_fixtures.mjs',
    license: 'CC0-1.0',
    note: 'Hand-built test geometry. Never shipped; it exists to be converted.',
  }, null, 1) + '\n');
}

console.log('fixtures written to tools/fixtures/');
