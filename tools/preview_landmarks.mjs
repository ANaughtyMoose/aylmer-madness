#!/usr/bin/env node
// Orthographic previews of the hero landmarks, straight out of the MeshBuilder.
//
//   node tools/preview_landmarks.mjs [outdir] [--only=pwhs,heritage] [--far]
//
// Chrome is shared with the rest of the wave and a starved renderer is
// indistinguishable from a broken script, so this exists to answer the
// questions that do not actually need WebGL: is the atrium attached to the
// building, does the porch stand clear of the wall, is the couch in the tree.
// Z-buffered, flat-shaded off the vertex colours and normals, ~120 lines, no
// dependencies. It writes PPM and shells out to `sips` for the PNG.
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import STUB from '../src/game/materials_stub.js';
import { SITES, bakeSite, buildCouchPreview } from '../src/game/landmarks.js';
import { buildBigTree } from '../src/game/props.js';

const outdir = process.argv[2] || '/tmp/lmprev';
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const useFar = process.argv.includes('--far');
mkdirSync(outdir, { recursive: true });

const W = 1000, H = 640;
const SUN = (() => { const v = [0.42, 0.86, -0.3]; const l = Math.hypot(...v); return v.map((c) => c / l); })();

// Camera: eye -> target, orthographic, `span` metres across the frame.
function view(eye, at, span) {
  const f = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
  const fl = Math.hypot(...f); for (let i = 0; i < 3; i++) f[i] /= fl;
  let up = Math.abs(f[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0];   // plan view: north up, east right
  const r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
  const rl = Math.hypot(...r); for (let i = 0; i < 3; i++) r[i] /= rl;
  up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const scale = W / span;
  return (p) => {
    const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const x = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
    const y = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
    const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    return [W / 2 + x * scale, H / 2 - y * scale, z];
  };
}

function render(builders, proj, skyTop, skyBot) {
  const col = new Uint8Array(W * H * 3);
  const dep = new Float32Array(W * H).fill(1e18);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) col[o + c] = skyTop[c] + (skyBot[c] - skyTop[c]) * t;
    }
  }
  for (const b of builders) {
    const v = b.v, idx = b.i;
    for (let k = 0; k < idx.length; k += 3) {
      const P = [], N = [], C = [];
      for (let j = 0; j < 3; j++) {
        const o = idx[k + j] * 9;
        P.push(proj([v[o], v[o + 1], v[o + 2]]));
        N.push([v[o + 3], v[o + 4], v[o + 5]]);
        C.push([v[o + 6], v[o + 7], v[o + 8]]);
      }
      // back-face cull in screen space, the way the real renderer does
      const ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1];
      const bx = P[2][0] - P[0][0], by = P[2][1] - P[0][1];
      const area = ax * by - ay * bx;
      if (area >= 0) continue;                       // CCW in world = CW on screen
      const n = N[0];
      const lam = Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
      const sh = 0.42 + 0.58 * lam;
      const c = C[0];
      const rr = Math.min(255, c[0] * 255 * sh), gg = Math.min(255, c[1] * 255 * sh);
      const bb = Math.min(255, c[2] * 255 * sh);
      const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0])));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1])));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
      const inv = 1 / area;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[1][1] - py) * (P[2][0] - px)) * inv;
          if (w0 < 0) continue;
          const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[2][1] - py) * (P[0][0] - px)) * inv;
          if (w1 < 0) continue;
          const w2 = 1 - w0 - w1;
          if (w2 < 0) continue;
          const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2];
          const o = y * W + x;
          if (z >= dep[o] || z < 0) continue;
          dep[o] = z;
          const q = o * 3;
          col[q] = rr; col[q + 1] = gg; col[q + 2] = bb;
        }
      }
    }
  }
  return col;
}

function writePng(col, file) {
  const ppm = `P6\n${W} ${H}\n255\n`;
  const buf = Buffer.concat([Buffer.from(ppm, 'ascii'), Buffer.from(col)]);
  const tmp = file.replace(/\.png$/, '.ppm');
  writeFileSync(tmp, buf);
  try {
    execFileSync('sips', ['-s', 'format', 'png', tmp, '--out', file], { stdio: 'ignore' });
    unlinkSync(tmp);
  } catch { /* no sips: the .ppm is still there */ }
  return existsSync(file) ? file : tmp;
}

// Each site: where to stand for the elevation, and how wide the frame is.
const CAM = {
  pwhs:       { at: [6800, 6, -8040], from: [6800, 22, -7860], span: 300, plan: 340 },
  heritage:   { at: [5510, 6, -6800], from: [5700, 30, -6980], span: 300, plan: 320 },
  symmesjr:   { at: [-310, 5, 380], from: [-310, 14, 430], span: 90, plan: 120 },
  symmesinn:  { at: [-1517, 5, -56], from: [-1517, 10, -8], span: 55, plan: 70 },
  british:    { at: [-916, 6, -110], from: [-916, 12, -60], span: 70, plan: 90 },
  marina:     { at: [-1785, 7, -40], from: [-1730, 16, 10], span: 90, plan: 110 },
  mike:       { at: [-424, 6, 55], from: [-378, 9, 53], span: 46, plan: 60 },
  lordaylmer: { at: [-362, 4, 60], from: [-430, 14, 60], span: 110, plan: 130 },
};

const SKY_T = [96, 132, 178], SKY_B = [178, 196, 206];
for (const s of SITES) {
  if (only && !only.split(',').includes(s.key)) continue;
  const b = bakeSite(s, STUB);
  const meshes = [useFar ? b.far : b.near, b.site];
  // The maple belongs to props.js and the couch is its own mesh, so pull both in
  // — the whole point of the 129 view is whether the couch sits in the branches.
  if (s.key === 'mike') {
    const t = buildBigTree();
    for (let i = 0; i < t.v.length; i += 9) { t.v[i] += -417.5; t.v[i + 2] += 57.0; }
    meshes.push(t, buildCouchPreview());
  }
  const c = CAM[s.key];
  if (!c) { console.log('no camera for', s.key); continue; }
  const tag = useFar ? '-far' : '';
  const e = render(meshes, view(c.from, c.at, c.span), SKY_T, SKY_B);
  console.log('  ', writePng(e, `${outdir}/${s.key}${tag}-elev.png`));
  const p = render(meshes, view([c.at[0], 300, c.at[2] + 0.01], [c.at[0], 0, c.at[2]], c.plan),
    [30, 40, 34], [30, 40, 34]);
  console.log('  ', writePng(p, `${outdir}/${s.key}${tag}-plan.png`));
}
