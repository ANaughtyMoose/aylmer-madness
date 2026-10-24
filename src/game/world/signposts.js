// Section 4c: the signal masts, the stop signs and their stop lines.
import { rgb } from '../../core/mesh.js';
import { C } from './consts.js';
import { planSignals, HEAD_Y, LAMP_DY, planStopSigns } from '../signals.js';

export function buildSignposts(ctx) {
  const { inside, bAt, baseAt, addPole, bKey, stopLine } = ctx;
  // -------------------------------------------------- 4c. signals & stop signs
  // Only the *lamp that is lit* moves, so everything else - post, mast arm, the
  // dark housing, the octagons - is baked into the chunks like any other prop.
  // signals.js draws one small box per approach on top. (W4)
  const poleCol = rgb(C.pole), lampCol = rgb(C.lamp), hydroCol = rgb(C.hydro);
  const headCol = rgb(C.signHead), lensOff = rgb(C.lensOff);
  const stopRed = rgb(C.stopRed), stopRim = rgb(C.stopRim);

  // A flat octagon standing on its edge, facing `yaw`, drawn from both sides.
  function octagon(bd, x, y, z, r, yaw, col, off) {
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const px = [], py = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      px.push(Math.cos(a) * r); py.push(Math.sin(a) * r);
    }
    for (const sg of [1, -1]) {
      const ox = s * (off + (sg > 0 ? 0.012 : -0.012)), oz = co * (off + (sg > 0 ? 0.012 : -0.012));
      const c0 = bd.vert(x + ox, y, z + oz, s * sg, 0, co * sg, col);
      for (let i = 0; i < 8; i++) {
        bd.vert(x + px[i] * co + ox, y + py[i], z - px[i] * s + oz, s * sg, 0, co * sg, col);
      }
      for (let i = 0; i < 8; i++) {
        const a = c0 + 1 + i, b = c0 + 1 + ((i + 1) % 8);
        if (sg > 0) bd.tri(c0, a, b); else bd.tri(c0, b, a);
      }
    }
  }

  const SIGNALS = planSignals();
  for (const sig of SIGNALS) {
    // Planned over the whole road graph (signals.js has no idea about sectors);
    // only the ones standing in this slice get a post.
    const a0 = sig.approaches[0];
    if (inside && a0 && !inside(a0.poleX, a0.poleZ)) continue;
    for (const a of sig.approaches) {
      const bd = bAt(a.poleX, a.poleZ);
      const first = bd.i.length;
      // The mast is planted on the ground at its own foot; the head and its
      // three dark lenses hang from it at the height they always did. `headY`
      // is written back onto the approach because signals.js draws the ONE lit
      // lamp from it at runtime, and a lens 30 m under its housing is not a
      // traffic light. planSignals() is memoised, so this is the same object.
      const gy = baseAt(a.poleX, a.poleZ).h;
      a.headY = HEAD_Y + gy;
      bd.cyl(a.poleX, gy + 3.1, a.poleZ, 0.13, 6.2, 6, poleCol, 'y', false);
      const mx = (a.poleX + a.headX) / 2, mz = (a.poleZ + a.headZ) / 2;
      bd.box(mx, gy + 6.18, mz, 0.13, 0.13, a.arm * 0.95, poleCol,
        { yaw: Math.atan2(a.armX, a.armZ), noBottom: true });
      bd.box(a.headX, a.headY, a.headZ, 0.52, 1.52, 0.34, headCol, { yaw: a.headYaw });
      const fx = Math.sin(a.headYaw), fz = Math.cos(a.headYaw);
      for (let k = 0; k < 3; k++) {
        bd.box(a.headX + fx * 0.1, a.headY + LAMP_DY[k], a.headZ + fz * 0.1,
          0.3, 0.3, 0.14, lensOff, { yaw: a.headYaw });
      }
      a.broken = false;
      const mast = addPole(a.poleX, a.poleZ, 'signal', 6.2, bKey(a.poleX, a.poleZ), first, bd.i.length);
      mast.signal = a;
      stopLine(a.x, a.z, a.dx, a.dz, a.hw, a.yaw);
    }
  }

  const STOPS = planStopSigns();
  for (const s of STOPS) {
    if (inside && !inside(s.poleX, s.poleZ)) continue;
    const bd = bAt(s.poleX, s.poleZ);
    const first = bd.i.length;
    const gy = baseAt(s.poleX, s.poleZ).h;
    bd.cyl(s.poleX, gy + 1.15, s.poleZ, 0.065, 2.3, 4, poleCol, 'y', false);
    octagon(bd, s.poleX, gy + 2.34, s.poleZ, 0.47, s.faceYaw, stopRim, 0.0);
    octagon(bd, s.poleX, gy + 2.34, s.poleZ, 0.40, s.faceYaw, stopRed, 0.03);
    addPole(s.poleX, s.poleZ, 'stopsign', 2.3, bKey(s.poleX, s.poleZ), first, bd.i.length);
    stopLine(s.x, s.z, s.dx, s.dz, s.hw, s.yaw);
  }

  Object.assign(ctx, { poleCol, lampCol, hydroCol, SIGNALS, STOPS });
}
