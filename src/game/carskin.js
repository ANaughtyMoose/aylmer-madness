// Photo skins: build a car from orthographic renders instead of hand profiles.
//
// Drop images in assets/cars/<id>/ — side.png (required), top.png (required),
// front.png and rear.png (optional) — on a plain white or transparent background,
// nose pointing LEFT in side and top views. The silhouettes give the body shape
// (side = height profile, top = plan width, front = greenhouse taper) and the
// images become the texture. Nothing here runs if the files are missing.
import { MeshBuilder } from '../core/mesh.js';
import { rgb } from '../core/mesh.js';
import { loft } from './cars.js';

const ATLAS = 2048;
// Atlas slots in pixels: [x, y, w, h]
const SLOT = {
  side: [0, 0, 2048, 1024], top: [0, 1024, 1024, 1024],
  front: [1024, 1024, 512, 512], rear: [1536, 1024, 512, 512], dark: [1024, 1536, 1024, 512],
};

function loadImage(url) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
}

// Mask of "car" pixels: opaque and not near-white. Returns bbox + the image data.
function silhouette(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data, W = c.width, H = c.height;
  const mask = new Uint8Array(W * H);
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4;
    const a = d[k + 3], r = d[k], g = d[k + 1], b = d[k + 2];
    const on = a > 110 && !(r > 232 && g > 232 && b > 232);
    if (on) {
      mask[y * W + x] = 1;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  // Column extents (top-most / bottom-most car pixel) and row extents.
  const colTop = new Int32Array(W).fill(-1), colBot = new Int32Array(W).fill(-1);
  const rowL = new Int32Array(H).fill(-1), rowR = new Int32Array(H).fill(-1);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (mask[y * W + x]) {
    if (colTop[x] < 0) colTop[x] = y; colBot[x] = y;
    if (rowL[y] < 0) rowL[y] = x; rowR[y] = x;
  }
  return { canvas: c, ctx, img, W, H, x0, x1, y0, y1, mask, colTop, colBot, rowL, rowR };
}

// Sample a per-column array at a fractional column, skipping empty columns.
function colAt(arr, x, lo, hi) {
  let xi = Math.round(x);
  for (let k = 0; k < 40; k++) {
    const a = arr[Math.min(hi, Math.max(lo, xi + (k % 2 ? k : -k)))];
    if (a >= 0) return a;
  }
  return -1;
}

// Find the two tyre-contact clusters along the bottom of the side view.
function findAxles(S) {
  const cols = [];
  for (let x = S.x0; x <= S.x1; x++) if (S.colBot[x] >= S.y1 - 2) cols.push(x);
  if (cols.length < 4) return null;
  const groups = [[cols[0]]];
  for (let i = 1; i < cols.length; i++) {
    if (cols[i] - cols[i - 1] > 6) groups.push([cols[i]]); else groups[groups.length - 1].push(cols[i]);
  }
  groups.sort((a, b) => b.length - a.length);
  if (groups.length < 2) return null;
  const g = groups.slice(0, 2).map((gr) => ({ c: (gr[0] + gr[gr.length - 1]) / 2, w: gr[gr.length - 1] - gr[0] }));
  g.sort((a, b) => a.c - b.c);
  return g;
}

export async function loadCarSkin(renderer, spec) {
  const base = `assets/cars/${spec.id}/`;
  const [side, top, front, rear, cfgRes] = await Promise.all([
    loadImage(base + 'side.png'), loadImage(base + 'top.png'),
    loadImage(base + 'front.png'), loadImage(base + 'rear.png'),
    fetch(base + 'skin.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  if (!side || !top) return null;
  const cfg = Object.assign({ nose: 'left', clearance: 0.14 }, cfgRes || {});
  const S = silhouette(side), T = silhouette(top), F = front ? silhouette(front) : null;
  if (!S || !T) return null;
  const R = rear ? silhouette(rear) : null;

  // ---- geometry from silhouettes
  const noseLeft = cfg.nose !== 'right';
  const sLen = S.x1 - S.x0, sH = S.y1 - S.y0;
  const scaleY = spec.h / sH;
  const tToCol = (t, X) => (noseLeft ? X.x1 - t * (X.x1 - X.x0) : X.x0 + t * (X.x1 - X.x0));
  const topAt = (t) => { const y = colAt(S.colTop, tToCol(t, S), S.x0, S.x1); return y < 0 ? spec.h * 0.5 : (S.y1 - y) * scaleY; };
  const botAt = (t) => { const y = colAt(S.colBot, tToCol(t, S), S.x0, S.x1); return y < 0 ? 0 : (S.y1 - y) * scaleY; };
  const tW = T.x1 - T.x0, tH = T.y1 - T.y0;
  const planAt = (t) => {
    const x = Math.round(tToCol(t, T));
    let a = -1, b = -1;
    for (let k = 0; k < 40 && a < 0; k++) {
      const xx = Math.min(T.x1, Math.max(T.x0, x + (k % 2 ? k : -k)));
      for (let y = T.y0; y <= T.y1; y++) if (T.mask[y * T.W + xx]) { if (a < 0) a = y; b = y; }
    }
    if (a < 0) return spec.wid * 0.4;
    return ((b - a) / tH) * spec.wid * 0.5;
  };
  // Greenhouse taper from the front view: half width per height.
  let beltY = spec.h * 0.62, roofK = 0.82;
  let frontHalf = null;
  if (F) {
    const fH = F.y1 - F.y0, fW = F.x1 - F.x0;
    frontHalf = (y) => {
      const row = Math.round(F.y1 - (y / spec.h) * fH);
      const l = F.rowL[Math.min(F.y1, Math.max(F.y0, row))], r = F.rowR[Math.min(F.y1, Math.max(F.y0, row))];
      if (l < 0) return spec.wid * 0.5;
      return ((r - l) / fW) * spec.wid * 0.5;
    };
    // belt = highest height where the car is still ≥ 93% of its max width
    for (let y = spec.h * 0.95; y > spec.h * 0.3; y -= spec.h / 80) {
      if (frontHalf(y) >= spec.wid * 0.5 * 0.93) { beltY = y; break; }
    }
    void roofK;
  }
  const axles = findAxles(S);
  let tRear = 0.22, tFront = 0.80, wheelR = spec.wheelR;
  if (axles) {
    const tOf = (c) => (noseLeft ? (S.x1 - c) / sLen : (c - S.x0) / sLen);
    tRear = tOf(axles[0].c); tFront = tOf(axles[1].c);
    if (tRear > tFront) [tRear, tFront] = [tFront, tRear];
    wheelR = Math.min(0.42, Math.max(0.25, (Math.max(axles[0].w, axles[1].w) / sLen) * spec.len * 0.5));
  }
  const tMid = (tRear + tFront) / 2;
  const fake = Object.assign({}, spec, {
    len: spec.len, wheelbase: (tFront - tRear) * spec.len,
    overhangF: (1 - tFront) * spec.len,
  });
  void tMid;
  const clearance = spec.h * cfg.clearance;

  const ring = (t) => {
    const top = Math.max(topAt(t), clearance + 0.05);
    const bot = Math.max(botAt(t), t < 0.03 || t > 0.97 ? clearance + 0.1 : clearance);
    const hw = planAt(t);
    const belt = Math.min(beltY, top);
    let roofHw = hw * 0.82;
    if (frontHalf) roofHw = Math.min(hw, Math.max(hw * 0.5, frontHalf(Math.min(top, spec.h - 0.02))));
    if (top - belt < 0.03) roofHw = hw;
    return [[hw, bot], [hw, belt], [roofHw, top], [-roofHw, top], [-hw, belt], [-hw, bot]];
  };

  // ---- texture atlas
  const atlas = document.createElement('canvas');
  atlas.width = atlas.height = ATLAS;
  const ctx = atlas.getContext('2d');
  const body = rgb(spec.body).map((v) => Math.round(v * 255));
  ctx.fillStyle = `rgb(${body[0]},${body[1]},${body[2]})`;
  ctx.fillRect(0, 0, ATLAS, ATLAS);
  ctx.fillStyle = '#1c1d20';
  ctx.fillRect(...SLOT.dark);
  // Draw each view's *bbox* region stretched into its slot (keeping aspect), and
  // remember where it landed in UV space.
  const uvRect = {};
  const place = (name, X) => {
    if (!X) return;
    const [sx, sy, sw, sh] = SLOT[name];
    const bw = X.x1 - X.x0 + 1, bh = X.y1 - X.y0 + 1;
    const k = Math.min(sw / bw, sh / bh);
    const dw = bw * k, dh = bh * k;
    const dx = sx + (sw - dw) / 2, dy = sy + (sh - dh) / 2;
    // knock the background out to body colour so fringe pixels aren't white
    const tmp = document.createElement('canvas');
    tmp.width = bw; tmp.height = bh;
    const tc = tmp.getContext('2d');
    const id = X.ctx.getImageData(X.x0, X.y0, bw, bh);
    const d = id.data;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (!X.mask[(y + X.y0) * X.W + (x + X.x0)]) {
        const q = (y * bw + x) * 4;
        d[q] = body[0]; d[q + 1] = body[1]; d[q + 2] = body[2]; d[q + 3] = 255;
      } else d[(y * bw + x) * 4 + 3] = 255;
    }
    tc.putImageData(id, 0, 0);
    ctx.drawImage(tmp, dx, dy, dw, dh);
    uvRect[name] = { u0: dx / ATLAS, v0: dy / ATLAS, u1: (dx + dw) / ATLAS, v1: (dy + dh) / ATLAS };
  };
  place('side', S); place('top', T); place('front', F); place('rear', R);
  const white = [1, 1, 1];
  const dark = [(SLOT.dark[0] + SLOT.dark[2] / 2) / ATLAS, (SLOT.dark[1] + SLOT.dark[3] / 2) / ATLAS];
  const lerp = (a, b, t) => a + (b - a) * t;

  const paint = (face, t, y, Rg, P) => {
    if (!P) return [white, 0, 0];
    const tt = noseLeft ? 1 - t : t;         // image x grows toward the rear when the nose is left
    if (face === 'bottom') return [white, dark[0], dark[1]];
    if (face === 'sideL' || face === 'sideR' || face === 'glassL' || face === 'glassR') {
      const r = uvRect.side;
      return [white, lerp(r.u0, r.u1, tt), lerp(r.v1, r.v0, Math.min(1, Math.max(0, y / spec.h)))];
    }
    if (face === 'top') {
      const r = uvRect.top;
      const lat = 0.5 + P[0] / spec.wid;        // +X (car's left) is at the image bottom
      return [white, lerp(r.u0, r.u1, tt), lerp(r.v0, r.v1, Math.min(1, Math.max(0, lat)))];
    }
    if (face === 'front' && uvRect.front) {
      const r = uvRect.front;
      return [white, lerp(r.u0, r.u1, 0.5 + P[0] / spec.wid), lerp(r.v1, r.v0, y / spec.h)];
    }
    if (face === 'rear' && uvRect.rear) {
      const r = uvRect.rear;
      return [white, lerp(r.u0, r.u1, 0.5 - P[0] / spec.wid), lerp(r.v1, r.v0, y / spec.h)];
    }
    // no end-cap image: borrow the side texture's end column
    const r = uvRect.side;
    return [white, face === 'front' ? (noseLeft ? r.u0 : r.u1) : (noseLeft ? r.u1 : r.u0), lerp(r.v1, r.v0, y / spec.h)];
  };

  const mb = new MeshBuilder();
  mb.textured = true;
  loft(mb, fake, 56, ring, paint);
  const mesh = renderer.upload(mb);
  const tex = renderer.texture(atlas);
  return {
    mesh, tex, wheelR,
    wheelZ: [fake.wheelbase / 2, -fake.wheelbase / 2],
    tris: mb.i.length / 3,
  };
}
