// « Le sauna de cèdre »: the water balance on the cedar plank, and what it
// does to the screen. Mission 7 (id stvincent) lives in sauna.js; this file is
// the mechanic.
//
// Tom, 13 Oct 2026 (D31): Sayyad lays a piece of cedar across the dash and
// pours water on it. The game is a balance: press a button to add water and
// keep the sauna just right. Too little and the cab cooks; too much and you
// ruin the truck: steam everywhere, the electrics short out with sparks
// everywhere (game invention, played for laughs).
//
//   * `w`, the wetness of the cedar and the cab, 0 (bone dry) to 1 (soaked).
//     The green band is BAND_LO..BAND_HI. The cedar dries all the time: slowly
//     with air through the windows at speed, fast stopped in the sun, faster
//     again in a line of hot exhaust;
//   * F pours one DOSE. It soaks in over SOAK_S, so the meter shows a ghost
//     of where the splash will land and a panicked double press overshoots;
//   * under the band the canvas shimmers, blurs and warms (the cab cooks);
//     at 0 for PINNED_S the truck goes sluggish;
//   * over the band a white steam layer climbs from the dash; at SHORT_AT the
//     dash shorts out: sparks, the radio dies, the Ranger coughs (sauna.js
//     plays the show), and Sayyad opens both windows (w back to SHORT_RESET_W).
//
// Everything that decides anything is a pure function over a plain state
// object (saunaStep, pour), so tools/smoke_sp_sauna.mjs tests every number in
// Node. The DOM half (openSaunaFx, listenPour) guards `document`/`window`.

// ---------------------------------------------------------------- tuning
// The green band. Width 0.30 = exactly two splashes.
export const BAND_LO = 0.40;
export const BAND_HI = 0.70;
// Below this the shimmer is strong and Sayyad says he is cooking.
export const DEEP_COOK = 0.20;
// Above this Sayyad says it is too much.
export const DEEP_FOG = 0.85;
// `w` reaching this is a short circuit.
export const SHORT_AT = 0.95;
// One press of F, and how long it takes to soak in (s). All pending water
// soaks at one rate (DOSE / SOAK_S), so two doses take twice as long.
export const DOSE = 0.15;
export const SOAK_S = 0.5;
// Minimum gap between two presses (s).
export const POUR_COOLDOWN = 0.35;
// Drying per second: at or above CRUISE_KMH (air through the windows), under
// SLOW_KMH or stopped (the sun on the dash), linear in between; plus
// DRAIN_TRAFFIC per traffic car within TRAFFIC_R m, at most TRAFFIC_MAX.
export const DRAIN_CRUISE = 0.020;
export const DRAIN_SLOW = 0.040;
export const CRUISE_KMH = 40;
export const SLOW_KMH = 15;
export const DRAIN_TRAFFIC = 0.005;
export const TRAFFIC_R = 25;
export const TRAFFIC_MAX = 3;
// A knock (G.veh.impact >= IMPACT_SPILL) sloshes the jug: +SPILL, at most one
// per SPILL_GAP s.
export const SPILL = 0.08;
export const IMPACT_SPILL = 0.35;
export const SPILL_GAP = 1.5;
// After a short: w drops to this (both windows open, the steam blows out), and
// no second short inside SHORT_IMMUNE s.
export const SHORT_RESET_W = 0.62;
export const SHORT_IMMUNE = 4.0;
// At w = 0 this long: the truck goes sluggish (SLUG_KMH cap).
export const PINNED_S = 6.0;
export const SLUG_KMH = 55;
// After a short: the Ranger coughs and will not go over LIMP_KMH for LIMP_S.
export const LIMP_S = 4.0;
export const LIMP_KMH = 25;
// After a short the radio is off this long.
export const RADIO_OUT_S = 6.0;
// The joke fails (sauna.js reads them): bone dry this long is « Coup de
// chaleur »; the SHORT_FAIL-th short of a leg drowns the dash. Both give R.
export const COOK_FAIL_S = 20;
export const SHORT_FAIL = 3;
// The bot's (and a calm player's) rule: one splash when the needle and its
// ghost are under this. page-agent.js uses the same number.
export const BOT_POUR_BELOW = 0.48;

// ---------------------------------------------------------------- state
export function newSauna() {
  return {
    w: 0.55, pend: 0, cool: 0, shorts: 0, spills: 0, pours: 0,
    driveT: 0, inBandT: 0, cookT: 0, fogT: 0, zeroT: 0,
    immune: 0, spillCool: 0, pinned: false, wantPour: false, zone: 'ok', events: [],
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp01 = (v) => clamp(v, 0, 1);

/** 'cook' under the band, 'fog' over it, 'ok' in it. */
export const zoneOf = (w) => (w < BAND_LO ? 'cook' : w > BAND_HI ? 'fog' : 'ok');

/** How fast the cedar dries (per second) at this speed with this traffic. */
export function drainRate(speedKmh, traffic = 0) {
  const k = Math.abs(speedKmh || 0);
  const f = clamp((k - SLOW_KMH) / (CRUISE_KMH - SLOW_KMH), 0, 1);
  const base = DRAIN_SLOW + (DRAIN_CRUISE - DRAIN_SLOW) * f;
  return base + DRAIN_TRAFFIC * clamp(traffic || 0, 0, TRAFFIC_MAX);
}

/**
 * One step of the balance. input: { speedKmh, traffic, impact }. Mutates and
 * returns s; pushes events ('short', 'spill', 'pinned', 'enter:<zone>') on
 * s.events, which the caller clears after reading. Never fails anything.
 */
export function saunaStep(s, dt, input = {}) {
  s.cool = Math.max(0, s.cool - dt);
  s.immune = Math.max(0, s.immune - dt);
  s.spillCool = Math.max(0, s.spillCool - dt);
  const take = Math.min(s.pend, DOSE * dt / SOAK_S);
  s.w += take;
  s.pend -= take;
  if (s.pend < 1e-12) s.pend = 0;
  s.w -= drainRate(input.speedKmh, input.traffic) * dt;
  if ((input.impact || 0) >= IMPACT_SPILL && s.spillCool <= 0) {
    s.w += SPILL; s.spills++; s.spillCool = SPILL_GAP; s.events.push('spill');
  }
  s.w = clamp01(s.w);
  if (s.w >= SHORT_AT && s.immune <= 0) {
    s.shorts++; s.w = SHORT_RESET_W; s.pend = 0; s.immune = SHORT_IMMUNE; s.events.push('short');
  }
  const z = zoneOf(s.w);
  if (z !== s.zone) { s.zone = z; s.events.push('enter:' + z); }
  s.driveT += dt;
  if (z === 'ok') s.inBandT += dt; else if (z === 'cook') s.cookT += dt; else s.fogT += dt;
  if (s.w <= 0) {
    s.zeroT += dt;
    if (!s.pinned && s.zeroT >= PINNED_S) { s.pinned = true; s.events.push('pinned'); }
  } else { s.zeroT = 0; s.pinned = false; }
  return s;
}

/** One splash on the cedar. Returns true if it happened. */
export function pour(s) {
  if (s.cool > 0) return false;
  s.pend += DOSE;
  s.pours++;
  s.cool = POUR_COOLDOWN;
  return true;
}

/** The drive in numbers, for the lot's card and the metrics. */
export function saunaResult(s) {
  return {
    inBand: s.driveT > 0 ? s.inBandT / s.driveT : 0,
    shorts: s.shorts, spills: s.spills, cookS: s.cookT, fogS: s.fogT, pours: s.pours,
  };
}

/** The sauna bonus in dollars: 20 $ at 85 % in the green, 5 $ off per short. */
export function saunaBonus(res) {
  const k = clamp(((res.inBand || 0) - 0.40) / 0.45, 0, 1);
  return Math.max(0, Math.round(20 * k) - 5 * (res.shorts || 0));
}

/** The grade on the lot's card. */
export function saunaGrade(res) {
  if (res.inBand >= 0.80 && !res.shorts) return 'Sauna parfait';
  if (res.inBand >= 0.60) return 'Bon sauna';
  if (res.inBand >= 0.40) return 'Sauna tiède';
  return (res.fogS || 0) > (res.cookS || 0) ? 'Lave-auto' : 'Four à pizza';
}

/** Traffic cars within TRAFFIC_R of (x, z). Cheap: a plain distance loop. */
export function trafficNear(cars, x, z) {
  if (!cars || !cars.length) return 0;
  let n = 0;
  const r2 = TRAFFIC_R * TRAFFIC_R;
  for (const c of cars) {
    if (!c) continue;
    const dx = c.x - x, dz = c.z - z;
    if (dx * dx + dz * dz < r2 && ++n >= TRAFFIC_MAX) break;
  }
  return n;
}

/** How cooked the cab is, 0 in the band, 1 bone dry. */
export const cookOf = (w) => (w >= BAND_LO ? 0 : clamp01((BAND_LO - w) / BAND_LO));
/** How steamed the cab is, 0 in the band, 1 at the short. */
export const fogOf = (w) => (w <= BAND_HI ? 0 : clamp01((w - BAND_HI) / (SHORT_AT - BAND_HI)));

/** What the screen does when the cab cooks: pure, so the test checks the ramp. */
export function fxLook(cook, pinned = false) {
  const h = clamp01(cook);
  const blur = h < 0.3 ? 0 : ((h - 0.3) / 0.7) * 3.2 + (pinned ? 1.2 : 0);
  return {
    blur: +blur.toFixed(2),                // px of CSS blur on the canvas
    sepia: +(0.4 * h).toFixed(3),
    saturate: +(1 + 0.45 * h).toFixed(3),
    bright: +(1 + 0.08 * h).toFixed(3),
    wobble: +(h < 0.15 ? 0 : 0.9 * h + (pinned ? 0.5 : 0)).toFixed(3), // deg of skew
    tint: +(0.38 * h).toFixed(3),           // opacity of the orange glow
    shimmer: +(h < 0.2 ? 0 : 0.55 * h).toFixed(3),
  };
}

/** The steam layer's opacity when the cab is too wet. */
export function fogLook(fog) {
  return { fog: +(0.55 * clamp01(fog)).toFixed(3) };
}

/** The meter's zone label: a word and a colour, never colour alone. */
export const ZONE_LABEL = {
  cook: { text: 'ÇA CUIT', color: '#f07a2a' },
  ok: { text: 'PARFAIT', color: '#4caf50' },
  fog: { text: 'TROP DE VAPEUR', color: '#bfe3ff' },
};

// ---------------------------------------------------------------- DOM
const hasDoc = () => typeof document !== 'undefined' && !!document.body;

/** The game canvas on both entry points (index.html and prototype.html). */
function gameCanvas() {
  return document.getElementById('gl') || document.querySelector('canvas');
}

const CSS = `
@keyframes saunaWobble{0%{transform:skewX(calc(var(--sauna-amp,0)*1deg)) scaleY(calc(1 + var(--sauna-amp,0)*.004))}
50%{transform:skewX(calc(var(--sauna-amp,0)*-1deg)) scaleY(calc(1 - var(--sauna-amp,0)*.004))}
100%{transform:skewX(calc(var(--sauna-amp,0)*1deg)) scaleY(calc(1 + var(--sauna-amp,0)*.004))}}
@keyframes saunaBands{from{background-position:0 0}to{background-position:0 -48px}}
@keyframes saunaPuff{0%{opacity:.85;transform:translate(-50%,0) scale(.5)}100%{opacity:0;transform:translate(-50%,-160px) scale(2.4)}}
@keyframes saunaBlink{from{opacity:1}to{opacity:.35}}
@keyframes saunaShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
#saunaMeter{position:fixed;left:20px;bottom:232px;z-index:5;width:240px;padding:8px 10px;border-radius:8px;
background:rgba(20,14,10,.8);color:#fbe9d2;font:600 13px system-ui,sans-serif;pointer-events:none;
text-shadow:0 1px 3px rgba(0,0,0,.7)}
#saunaMeter .zone{font-weight:800;font-size:14px;letter-spacing:.04em}
#saunaMeter .zone.blink{animation:saunaBlink .31s ease-in-out infinite alternate}
#saunaMeter .bar{position:relative;height:14px;margin:6px 0 5px;border-radius:4px;overflow:hidden;
background:linear-gradient(90deg,#d7261e 0%,#f5a142 40%,#3e9d4c 40%,#3e9d4c 70%,#9ccbe8 70%,#9ccbe8 95%,#d7261e 95%)}
#saunaMeter .bolt{position:absolute;right:1px;top:1px;width:10px;height:12px}
#saunaMeter .needle,#saunaMeter .ghost{position:absolute;top:-2px;bottom:-2px;width:3px;margin-left:-1px;background:#fff;
box-shadow:0 0 3px rgba(0,0,0,.9)}
#saunaMeter .ghost{opacity:.5}
#saunaMeter.shake{animation:saunaShake .1s linear 3}
#saunaMeter.flicker .info{animation:saunaBlink .08s steps(2) 7}
.saunaPuff{position:fixed;left:50%;bottom:18%;width:120px;height:120px;border-radius:50%;pointer-events:none;z-index:5;
background:radial-gradient(circle,rgba(255,255,255,.9),rgba(255,255,255,.35) 45%,rgba(255,255,255,0) 70%);
animation:saunaPuff 1.3s ease-out forwards}
@media (prefers-reduced-motion:reduce){#saunaGlow .bands{animation:none}#saunaMeter.shake{animation:none}#saunaMeter .zone.blink{animation:none}}
`;

const BOLT = '<svg class="bolt" viewBox="0 0 10 12" aria-hidden="true"><path d="M6 0L1 7h3l-1 5 5-7H5z" fill="#fff"/></svg>';
const reducedMotion = () => {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
};

/**
 * The screen effect and the meter. Returns { update(s), puff(), short(), fade(to, ms),
 * close(), dom }. A no-op object in Node. close() puts the canvas back exactly as it was.
 */
export function openSaunaFx() {
  const nop = { update() {}, puff() {}, short() {}, fade() {}, close() {}, dom: false };
  if (!hasDoc()) return nop;
  const cv = gameCanvas();
  const prev = cv ? { filter: cv.style.filter, animation: cv.style.animation, transform: cv.style.transform, amp: cv.style.getPropertyValue('--sauna-amp') } : null;

  const style = document.createElement('style');
  style.id = 'saunaStyle';
  style.textContent = CSS;
  document.head.append(style);

  // Warm glow + shimmer bands + steam over the canvas. Inserted right after
  // the canvas with no z-index, so it paints under #hud (which comes later).
  const glow = document.createElement('div');
  glow.id = 'saunaGlow';
  glow.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0';
  glow.innerHTML =
    '<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 110%,rgba(255,120,30,.9),rgba(255,150,60,.35) 45%,rgba(255,170,80,0) 75%)"></div>' +
    '<div class="bands" style="position:absolute;inset:0;mix-blend-mode:overlay;' +
    'background:repeating-linear-gradient(0deg,rgba(255,255,255,0) 0 10px,rgba(255,230,200,.35) 12px,rgba(255,255,255,0) 14px 24px);' +
    'animation:saunaBands 1.1s linear infinite"></div>' +
    '<div style="position:absolute;inset:0;opacity:0;background:linear-gradient(0deg,rgba(235,240,245,.95) 0%,rgba(235,240,245,.6) 45%,rgba(235,240,245,0) 85%)"></div>';
  const [tintEl, bandsEl, fogEl] = glow.children;
  if (cv && cv.parentNode) cv.after(glow); else document.body.append(glow);

  const meter = document.createElement('div');
  meter.id = 'saunaMeter';
  meter.innerHTML = '<div class="zone"></div><div class="bar">' + BOLT + '<div class="ghost"></div><div class="needle"></div></div><div class="info"></div>';
  document.body.append(meter);
  const zoneEl = meter.querySelector('.zone'), needle = meter.querySelector('.needle'),
    ghost = meter.querySelector('.ghost'), info = meter.querySelector('.info');

  const cut = document.createElement('div');
  cut.id = 'saunaCut';
  cut.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:6;transition:opacity .5s';
  document.body.append(cut);

  if (cv) cv.style.animation = 'saunaWobble .9s ease-in-out infinite';
  let last = null;
  const temp = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { temp.delete(id); fn(); }, ms); temp.add(id); };
  const still = reducedMotion();
  return {
    dom: true,
    update(s) {
      const inBand = s.driveT > 0 ? s.inBandT / s.driveT : 1;
      const key = Math.round(s.w * 100) + ':' + Math.round((s.w + s.pend) * 100) + ':' + s.zone + ':' + s.shorts + ':' + Math.round(inBand * 100) + ':' + (s.pinned ? 1 : 0);
      if (key === last) return;
      last = key;
      const L = fxLook(cookOf(s.w), s.pinned), F = fogLook(fogOf(s.w));
      if (cv) {
        cv.style.filter = L.blur || L.sepia ? `blur(${L.blur}px) sepia(${L.sepia}) saturate(${L.saturate}) brightness(${L.bright})` : (prev ? prev.filter : '');
        cv.style.setProperty('--sauna-amp', String(still ? 0 : L.wobble));
      }
      glow.style.opacity = '1';
      tintEl.style.opacity = String(L.tint);
      bandsEl.style.opacity = String(L.shimmer);
      fogEl.style.opacity = String(F.fog);
      const z = ZONE_LABEL[s.zone] || ZONE_LABEL.ok;
      zoneEl.textContent = z.text;
      zoneEl.style.color = z.color;
      zoneEl.classList.toggle('blink', s.w < DEEP_COOK || s.w > DEEP_FOG);
      needle.style.left = (clamp01(s.w) * 100).toFixed(1) + '%';
      ghost.style.left = (clamp01(s.w + s.pend) * 100).toFixed(1) + '%';
      ghost.style.display = s.pend > 0.005 ? '' : 'none';
      info.textContent = `F : verser · vert ${Math.round(inBand * 100)} % · courts-circuits ${s.shorts}`;
    },
    puff(big = false) {
      for (let i = 0; i < 3; i++) {
        const p = document.createElement('div');
        p.className = 'saunaPuff';
        p.style.marginLeft = (i - 1) * 55 + 'px';
        p.style.animationDelay = i * 0.12 + 's';
        if (big) p.style.width = p.style.height = '168px';
        document.body.append(p);
        later(() => p.remove(), 1700);
        temp.add(p);
      }
    },
    // A short: the panel shakes and flickers, two white flashes 250 ms apart.
    short() {
      meter.classList.remove('shake', 'flicker');
      void meter.offsetWidth;
      meter.classList.add('shake', 'flicker');
      later(() => meter.classList.remove('shake', 'flicker'), 650);
      if (still) return;
      for (const at of [0, 250]) later(() => {
        const f = document.createElement('div');
        f.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:.45;pointer-events:none;z-index:6';
        document.body.append(f);
        temp.add(f);
        later(() => f.remove(), 80);
      }, at);
    },
    fade(to) { cut.style.opacity = String(to); },
    close() {
      if (cv && prev) {
        cv.style.filter = prev.filter;
        cv.style.animation = prev.animation;
        cv.style.transform = prev.transform;
        if (prev.amp) cv.style.setProperty('--sauna-amp', prev.amp);
        else cv.style.removeProperty('--sauna-amp');
      }
      for (const t of temp) { if (typeof t === 'object' && t && t.remove) t.remove(); else clearTimeout(t); }
      temp.clear();
      glow.remove(); meter.remove(); cut.remove(); style.remove();
    },
  };
}

// The pour key. KeyF is bound to nothing in main.js / core/input.js (checked
// 29 Sept), so the set piece owns it while it runs.
export const POUR_KEY = 'KeyF';

/**
 * Listen for F. onPour() is called once per press (no auto-repeat). Returns
 * the remover. A no-op in Node.
 */
export function listenPour(onPour) {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {};
  const h = (e) => {
    if (e.code !== POUR_KEY || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return;
    onPour();
  };
  window.addEventListener('keydown', h);
  return () => window.removeEventListener('keydown', h);
}
