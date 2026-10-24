// The collider query (querySegments). Installed right after the buildings, as
// it always was, because the dedupe stamp array is sized from the segment count
// at that moment; furniture.js grows it once the poles have added theirs, and
// reactive.js allocates the dead-segment mask for snapped poles.
import { SEG_CELL } from './consts.js';
import { distPtSeg2 } from './geom.js';

export function installSegmentQuery(ctx) {
  const { segs, segGrid, gkey } = ctx;
  // ------------------------------------------------------------ segment query
  const segCount = segs.length >> 2;
  let seen = new Int32Array(segCount + 12000);
  let segDead = null;          // allocated once the pole count is known
  let stamp = 0;
  const outArr = [];
  const pool = [];
  function querySegments(x, z, r) {
    stamp++;
    outArr.length = 0;
    const i0 = Math.floor((x - r) / SEG_CELL), i1 = Math.floor((x + r) / SEG_CELL);
    const j0 = Math.floor((z - r) / SEG_CELL), j1 = Math.floor((z + r) / SEG_CELL);
    const r2 = r * r;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = segGrid.get(gkey(i, j));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const idx = arr[k];
          if (seen[idx] === stamp) continue;
          seen[idx] = stamp;
          if (segDead !== null && segDead[idx]) continue;   // a snapped pole
          const o = idx * 4;
          const ax = segs[o], az = segs[o + 1], bx = segs[o + 2], bz = segs[o + 3];
          if (distPtSeg2(x, z, ax, az, bx, bz) > r2) continue;
          const m = outArr.length;
          let s = pool[m];
          if (!s) { s = { ax: 0, az: 0, bx: 0, bz: 0 }; pool[m] = s; }
          s.ax = ax; s.az = az; s.bx = bx; s.bz = bz;
          outArr.push(s);
        }
      }
    }
    return outArr;
  }
  function growSegQuery() {
    if (seen.length < (segs.length >> 2)) seen = new Int32Array(segs.length >> 2);
  }
  function allocSegDead() {
    segDead = new Uint8Array(segs.length >> 2);
    return segDead;
  }
  Object.assign(ctx, { querySegments, growSegQuery, allocSegDead });
}
