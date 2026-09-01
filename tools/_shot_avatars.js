// Page script for tools/headless.mjs. Boots through the start-point picker,
// then renders one custom frame: a portrait of the avatar named in WHO, lit by
// the game's own day environment, so the screenshot shows exactly the mesh the
// game draws and nothing else. Not shipped — a viewing tool.
const A = window.AYLMER;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (A.G.mode !== 'drive') {
  document.getElementById('start')?.click();
  await wait(500);
  document.getElementById('startpoints')?.children[0]?.click();
  await wait(150);
  document.getElementById('startconfirm')?.click();
  for (let i = 0; i < 900 && A.G.mode !== 'drive'; i++) await wait(50);
}
for (let i = 0; i < 30; i++) A.step(1 / 60);
A.env('day');
A.render();
// Clear the chrome: the opener card, the HUD and the heckle bubbles all sit
// over the canvas, and this frame is only about the mesh.
for (const id of ['story', 'hud', 'heckles', 'menu']) {
  const e = document.getElementById(id);
  if (e) e.style.display = 'none';
}

const G = A.G;
const AV = await import('/src/game/avatars.js');
const who = window.__WHO || 'sayyad';
const mode = window.__MODE || 'stand';
const az = window.__AZ === undefined ? 0.35 : window.__AZ;   // radians round the front
const r = G.renderer;
const m = G.avatars && G.avatars.mesh[who];
if (!m) throw new Error('no avatar meshes yet');

// __INWORLD stands them where the game actually puts them and draws the town
// behind them; otherwise it is a plain portrait against the sky.
const spot = window.__INWORLD ? AV.standSpot(who) : { x: 0, z: 0, yaw: 0 };
const gy = window.__INWORLD ? G.phys.groundY(spot.x, spot.z) : 0;
const yaw = (window.__INWORLD ? spot.yaw : 0) + az;
const dist = window.__DIST || (mode === 'seat' ? 1.5 : 4.4);
const fov = window.__FOV || 0.55;
const eye = window.__EYE === undefined ? (mode === 'seat' ? 0.05 : 1.0) : window.__EYE;
const cx = spot.x + Math.sin(yaw) * dist, cz = spot.z + Math.cos(yaw) * dist;
const mm = new Float32Array(16);
const M = (x, y, z, ry = 0, rx = 0, rz = 0) => {
  const cy = Math.cos(ry), sy = Math.sin(ry), cp = Math.cos(rx), sp = Math.sin(rx);
  const cr = Math.cos(rz), sr = Math.sin(rz);
  const m00 = cy, m01 = sy * sp, m02 = sy * cp;
  const m10 = 0, m11 = cp, m12 = -sp;
  const m20 = -sy, m21 = cy * sp, m22 = cy * cp;
  mm[0] = m00 * cr + m01 * sr; mm[1] = m10 * cr + m11 * sr; mm[2] = m20 * cr + m21 * sr; mm[3] = 0;
  mm[4] = -m00 * sr + m01 * cr; mm[5] = -m10 * sr + m11 * cr; mm[6] = -m20 * sr + m21 * cr; mm[7] = 0;
  mm[8] = m02; mm[9] = m12; mm[10] = m22; mm[11] = 0;
  mm[12] = x; mm[13] = y; mm[14] = z; mm[15] = 1;
  return mm;
};

r.setEnvironment(G.env);
// A camera with yaw t looks along (-sin t, -cos t) — see the chase cam in
// main.js — so sitting at (sin az, cos az) * dist and looking at the origin
// means the camera's yaw IS az.
r.begin([cx, gy + eye, cz], yaw, mode === 'seat' ? 0.02 : 0.05, fov);
// The game's own sky, so the light and the fog are the ones you see in play.
const SKY = await import('/src/game/sky.js');
r.draw(G.sky.mesh, M(cx, 0, cz), SKY.skyOpts(G.env));
if (window.__INWORLD) {
  const I = new Float32Array(16); I[0] = I[5] = I[10] = I[15] = 1;
  G.world.draw(r, I, cx, cz, 320, 0);
}
r.draw(m[mode], M(spot.x, gy, spot.z, spot.yaw));
if (mode === 'stand') {
  // Same pose the game would draw at t = 1 s, straight out of CAST[who].idle.
  const c = AV.CAST[who];
  const o = { bob: 0, roll: 0, yaw: 0, arm: [0, 0, 0, 0] };
  if (c.idle) c.idle(window.__T === undefined ? 1 : window.__T, o);
  for (let k = 0; k < m.arms.length; k++) {
    const a = c.arms[k].at;
    const ca = Math.cos(spot.yaw), sa = Math.sin(spot.yaw);
    r.draw(m.arms[k], M(spot.x + a[0] * ca + a[2] * sa, gy + a[1], spot.z - a[0] * sa + a[2] * ca,
      spot.yaw, o.arm[k * 2], o.roll + o.arm[k * 2 + 1]));
  }
}
r.end();
// The game keeps its own rAF loop running, and it would paint over this frame
// the moment the script returns. render() is gated on mode === 'drive'.
G.mode = 'shot';
return JSON.stringify({ who, mode, az });
