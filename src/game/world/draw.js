// The per-frame draw() of a baked slice, and free().
import { HOUSE_NEAR, FADE } from './consts.js';
import { nightAmount } from './headlights.js';

export function makeDraw(ctx) {
  const { PROTO_NATURE, mats, tris, nearTris, farTris, chunks, waterChunks, signage, nightChunks, renderer,
    fallen } = ctx;
  // ------------------------------------------------------------ draw
  // One call from main.js render(): chunk cull + fade-in, the river, the
  // storefront signs, and the lamp pools after dark. Nothing allocates.
  const noOpts = { material: 'world' };
  const fadeOpts = { fogMul: 1, material: 'world' };
  const waterOpts = { water: true };
  const poolOpts = { alpha: 0.3, unlit: true, colorMul: new Float32Array([1, 0.86, 0.63]), additive: PROTO_NATURE };
  const signOpts = { tex: null };
  // Houses are drawn in a second pass with the atlas bound, so the texture is
  // switched on exactly once a frame instead of once a chunk.
  const houseTex = (mats && mats.tex) || null;
  const houseOpts = { tex: houseTex, fogMul: 1, material: 'building' };
  // Visible house meshes, queued during the chunk walk and drawn after it. 256
  // is four times the most chunks that survive the cull at drawDist 950; past
  // that the extra houses are dropped rather than growing the array mid-frame.
  const pendMesh = new Array(256).fill(null);
  const pendFade = new Float32Array(256);
  let firstFrame = true;
  let houseNear = HOUSE_NEAR;
  // Quality 'low' pulls the detailed houses in; everything else uses HOUSE_NEAR.
  function setHouseNear(m) { houseNear = Math.max(0, m || 0); }

  const stats = {
    resident: tris, residentNear: nearTris, residentFar: farTris,
    tris: 0, draws: 0, near: 0, far: 0, chunks: 0,
  };

  function draw(r, model, x, z, drawDist, dtSec) {
    const dd2 = drawDist * drawDist;
    const near2 = houseNear * houseNear;
    const step = firstFrame ? 1 : Math.min(1, (dtSec || 0) / FADE);
    let nH = 0;
    stats.tris = 0; stats.draws = 0; stats.near = 0; stats.far = 0; stats.chunks = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const dx = c.cx - x, dz = c.cz - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > dd2) { c.fade = 0; continue; }
      if (c.fade < 1) c.fade = Math.min(1, c.fade + step);
      if (c.mesh && r.visible(c.mesh)) {
        stats.chunks++;
        stats.tris += c.mesh.count / 3; stats.draws++;
        if (c.fade >= 1) r.draw(c.mesh, model, noOpts);
        else {
          // W2: a new chunk arrives buried in fog and thins out over FADE seconds,
          // which reads as a fade without paying for a transparent pass.
          fadeOpts.fogMul = 1 + (1 - c.fade) * 3.2;
          r.draw(c.mesh, model, fadeOpts);
        }
      }
      const isNear = d2 < near2;
      const hm = isNear ? c.near : c.far;
      if (hm && nH < pendMesh.length && r.visible(hm)) {
        pendMesh[nH] = hm; pendFade[nH] = c.fade; nH++;
        stats.tris += hm.count / 3; stats.draws++;
        if (isNear) stats.near += hm.count / 3; else stats.far += hm.count / 3;
      }
    }
    for (let i = 0; i < nH; i++) {
      houseOpts.fogMul = pendFade[i] >= 1 ? 1 : 1 + (1 - pendFade[i]) * 3.2;
      r.draw(pendMesh[i], model, houseOpts);
      pendMesh[i] = null;
    }
    for (let i = 0; i < waterChunks.length; i++) {
      const c = waterChunks[i];
      const dx = c.cx - x, dz = c.cz - z;
      if (dx * dx + dz * dz > dd2 * 2.6) continue;      // the river reads from far off
      if (r.visible(c.mesh)) r.draw(c.mesh, model, waterOpts);
    }
    if (signage) {
      signOpts.tex = signage.tex;
      if (r.visible(signage.mesh)) r.draw(signage.mesh, model, signOpts);
    }
    const night = nightAmount(r.env);
    if (night > 0.02) {
      poolOpts.alpha = 0.34 * night;
      for (let i = 0; i < nightChunks.length; i++) {
        const c = nightChunks[i];
        const dx = c.cx - x, dz = c.cz - z;
        if (dx * dx + dz * dz > 330 * 330) continue;
        if (r.visible(c.mesh)) r.draw(c.mesh, model, poolOpts);
      }
    }
    firstFrame = false;
  }

  // Give this slice's GPU buffers back (sectors.js, once the player is far
  // enough away). The distant scenery and the signage are shared and stay.
  function free() {
    ctx.cameraColliders?.free();
    if (!renderer.free) return;
    for (let i = fallen.length - 1; i >= 0; i--) {
      if (fallen[i].owner !== free) continue;
      if (fallen[i].mesh) renderer.free(fallen[i].mesh);
      fallen.splice(i, 1);
    }
    for (const c of chunks) {
      if (c.mesh) renderer.free(c.mesh);
      if (c.near) renderer.free(c.near);
      if (c.far) renderer.free(c.far);
    }
    for (const c of waterChunks) renderer.free(c.mesh);
    for (const c of nightChunks) renderer.free(c.mesh);
    chunks.length = 0; waterChunks.length = 0; nightChunks.length = 0;
  }

  Object.assign(ctx, { setHouseNear, stats, draw, free });
}
