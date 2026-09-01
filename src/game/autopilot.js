// A dev-only chauffeur. Open index.html?drive=ottawa and it clicks through the
// menu, dismisses the story card, and drives the truck to Ottawa and back on
// the GPS route until you close the tab. It exists for one reason: the Safari
// memory test in docs/VERIFY.md needs twenty minutes of real driving, and
// Safari cannot be scripted from outside without developer settings a friend's
// laptop will not have. Nothing here runs unless the query string asks.
//
// It drives like a learner: throttle off above a cap, brake into corners, and
// if it has been stuck for a while it reverses, then — as a last resort — puts
// itself back on the route and says so in the console. It is not a demo of
// the handling; it is a way of touching every sector for a long time.
const KEYS = { gas: 'KeyW', brake: 'KeyS', left: 'KeyA', right: 'KeyD' };

function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

export function start(A, PLACES, want = 'ottawa') {
  const legs = [want, 'home'].map((k) => PLACES[k]).filter(Boolean);
  if (legs.length < 2) { console.warn('autopilot: unknown destination', want); return; }
  const st = { leg: 0, laps: 0, route: null, idx: 0, stuckT: 0, reverseT: 0, resets: 0, t0: performance.now(), started: false, storyT: 0 };
  const panel = document.createElement('div');
  panel.id = 'autopilot';
  panel.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:30;font:13px/1.4 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.55);padding:4px 10px;border-radius:6px;pointer-events:none';
  document.body.appendChild(panel);
  window.AUTOPILOT = st;

  const keys = () => A.input.keys;
  const press = (k, on) => (on ? keys().add(k) : keys().delete(k));
  const clearKeys = () => { for (const k of Object.values(KEYS)) keys().delete(k); };

  async function boot() {
    for (let i = 0; i < 200 && A.G.mode !== 'drive'; i++) {
      const b = document.getElementById('start');
      const c = document.getElementById('startconfirm');
      if (c && !c.disabled && c.getBoundingClientRect().width > 0) c.click();
      else if (b && b.getBoundingClientRect().width > 0 && !b.disabled) b.click();
      await new Promise((r) => setTimeout(r, 400));
    }
    st.started = A.G.mode === 'drive';
    if (!st.started) { panel.textContent = 'autopilot: never reached drive'; return; }
    requestAnimationFrame(frame);
  }

  function frame() {
    requestAnimationFrame(frame);
    const G = A.G, v = G.veh;
    if (!v || G.mode !== 'drive' || G.seamHold) { clearKeys(); return; }
    // The new-game story card swallows the keys until it is dismissed.
    const story = document.getElementById('story');
    if (story && !story.classList.contains('hidden')) {
      if (performance.now() - st.storyT > 300) {
        st.storyT = performance.now();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      }
      clearKeys(); return;
    }
    const dest = legs[st.leg];
    if (!st.route) {
      st.route = G.nav && G.nav.route(v.x, v.z, dest.x, dest.z);
      st.idx = 0;
      if (!st.route) { panel.textContent = 'autopilot: no route'; return; }
    }
    const path = st.route;
    const d2 = (p) => (p[0] - v.x) ** 2 + (p[1] - v.z) ** 2;
    while (st.idx < path.length - 1 && d2(path[st.idx]) < 14 * 14) st.idx++;
    // Arrived: turn around.
    if (Math.hypot(dest.x - v.x, dest.z - v.z) < 30 || st.idx >= path.length - 1 && d2(path[path.length - 1]) < 30 * 30) {
      st.leg = (st.leg + 1) % legs.length;
      if (st.leg === 0) st.laps++;
      st.route = null; clearKeys(); return;
    }
    // Aim at the first point ≥ 18 m ahead so the truck cuts corners like a person.
    let ti = st.idx;
    while (ti < path.length - 1 && d2(path[ti]) < 18 * 18) ti++;
    const t = path[ti];
    const wantYaw = Math.atan2(t[0] - v.x, t[1] - v.z);
    const err = wrap(wantYaw - v.yaw);
    const kmh = v.speedKmh || 0;
    const dt = 1 / 60;

    // Stuck: no speed while trying to go for 4 s → reverse for 1.5 s. Three
    // times in a row without getting anywhere → back on the route.
    if (st.reverseT > 0) {
      st.reverseT -= dt;
      press(KEYS.gas, false); press(KEYS.brake, true);
      press(KEYS.left, err > 0); press(KEYS.right, err < 0);
      if (st.reverseT <= 0) { st.stuckT = 0; }
      status(dest, path, kmh, 'reverse');
      return;
    }
    if (kmh < 3) st.stuckT += dt; else st.stuckT = 0;
    if (st.stuckT > 4) {
      st.stuckT = 0; st.resets++;
      if (st.resets % 3 === 0) {
        const p = path[Math.min(st.idx, path.length - 2)], q = path[Math.min(st.idx + 1, path.length - 1)];
        A.teleport(p[0], p[1], Math.atan2(q[0] - p[0], q[1] - p[1]));
        console.warn(`autopilot: stuck at ${v.x | 0},${v.z | 0}, back on the route`);
      } else st.reverseT = 1.5;
      return;
    }

    // Gentle on purpose: at 85 km/h the Ranger was being towed home twice a
    // trip after meeting traffic in a bend, and a tow resets the position.
    const sharp = Math.abs(err) > 0.5;
    const cap = sharp ? 28 : Math.abs(err) > 0.2 ? 45 : 65;
    press(KEYS.left, err > 0.04);
    press(KEYS.right, err < -0.04);
    press(KEYS.gas, kmh < cap);
    press(KEYS.brake, kmh > cap + 12);
    status(dest, path, kmh, '');
  }

  function status(dest, path, kmh, note) {
    const s = ((performance.now() - st.t0) / 1000) | 0;
    const left = Math.hypot(dest.x - A.G.veh.x, dest.z - A.G.veh.z);
    panel.textContent = `→ ${dest.label} · ${(left / 1000).toFixed(1)} km · ${kmh | 0} km/h · ${(s / 60) | 0}:${String(s % 60).padStart(2, '0')} · laps ${st.laps} · resets ${st.resets} · ${A.G.world.sectors ? A.G.world.sectors.loaded() : ''} ${note}`;
  }

  boot();
}
