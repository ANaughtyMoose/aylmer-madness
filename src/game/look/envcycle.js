// The environment: the sky, sun, fog and light main.js hands the renderer every
// frame, and the clock that drives it. Moved out of main.js by V0-03 with the
// same code, so the same pixels in both entries; V1-02 (the timecycle) takes it
// from here.
//
// main.js keeps the clock TABLE (DAY_KEYS, DAY_WEIGHT, DAY_HOLD, phaseClock:
// the phase names save.js stores, and tools/smoke_shell.mjs reads them there)
// and hands it over in install(). Everything that turns a clock reading into an
// environment lives here:
//   cloneEnv(e)            a deep copy of an environment
//   setEnv(key, instant)   a mission's fixed time of day (classic); the clock (2004)
//   cycleEnv()             the environment the clock reads right now
//   setCycleEnv(instant)   ...applied, weather and all
//   advance(dt)            the env half of updateDayNight: move the clock on
//   stepEnv(dt)            ease G.env toward G.envTarget, once a frame
//   pinHour(h) / hourNow() AYLMER.time: hold the clock at an hour, read it back
import { clamp, lerp } from '../../core/math.js';
import { TIME_OF_DAY } from '../missions.js';
import { nightAmount } from '../world.js';
import * as calendar from '../calendar.js';
import { environmentAt } from '../../prototype/daylight.js';
import { advanceSummerClock, applyRecordedWeather } from '../../prototype/calendar-clock.js';

let G = null, weather = null, PROTO = false;
let CYCLE = 600, KEYS = ['morning', 'day', 'dusk', 'night'], WEIGHT = [0.16, 0.40, 0.13, 0.31], HOLD = 0.45;
let onMidnight = () => {}, onEnd = () => {};

// o: { G, weather, prototype, cycle, keys, weight, hold, onMidnight, onEnd }.
// onMidnight/onEnd are the 2004 calendar's date toast + autosave and the
// ending; they run at exactly the point updateDayNight used to run them.
export function install(o) {
  G = o.G; weather = o.weather; PROTO = !!o.prototype;
  if (o.cycle) CYCLE = o.cycle;
  if (o.keys) KEYS = o.keys;
  if (o.weight) WEIGHT = o.weight;
  if (o.hold != null) HOLD = o.hold;
  if (o.onMidnight) onMidnight = o.onMidnight;
  if (o.onEnd) onEnd = o.onEnd;
}

export function cloneEnv(e) {
  return {
    sky: e.sky.slice(), ground: e.ground.slice(), sun: e.sun.slice(),
    lightDir: e.lightDir.slice(), fog: e.fog.slice(), fogDensity: e.fogDensity,
  };
}

export function setEnv(key, instant) {
  if (PROTO) {
    // Jobs no longer move the clock. The player keeps the current date/hour.
    setCycleEnv(true); return;
  }
  const t = TIME_OF_DAY[key] || TIME_OF_DAY.day;
  G.envKey = TIME_OF_DAY[key] ? key : 'day';
  G.envPinned = G.envKey;      // what updateDayNight re-applies under a mission
  G.envTarget = weather.tintEnv(cloneEnv(t));
  // C4: headlights on. A mission that says 'dusk' or 'night' always wants them,
  // and so does a sky the storm has taken down to that brightness on its own.
  G.night = G.envKey === 'night' || G.envKey === 'dusk' || nightAmount(G.envTarget) > 0.15;
  if (instant || !G.env) {
    G.env = cloneEnv(G.envTarget);
    G.env.fogDensity *= G.q.fogMul;
  }
}

export function cycleEnv() {
  if (PROTO) {
    const env = environmentAt(G.dayClock / CYCLE * 24, G.day, calendar.dayInfo(G.day));
    return { env, key: env.key };
  }
  const p = ((G.dayClock / CYCLE) % 1 + 1) % 1;
  // Which phase the clock is in, and how far through it.
  let i = 0, acc = 0;
  while (i < KEYS.length - 1 && p >= acc + WEIGHT[i]) { acc += WEIGHT[i]; i++; }
  const frac = (p - acc) / WEIGHT[i];
  // Hold the phase's own colours for the first HOLD of it, then smoothstep
  // into the next one. The old cycle lerped straight across, so the sky was
  // always halfway between two times of day and never any of them.
  const raw = clamp((frac - HOLD) / (1 - HOLD), 0, 1);
  const k = raw * raw * (3 - 2 * raw);
  const a = TIME_OF_DAY[KEYS[i]];
  const b = TIME_OF_DAY[KEYS[(i + 1) % KEYS.length]];
  const out = cloneEnv(a);
  for (const f of ['sky', 'ground', 'sun', 'lightDir', 'fog']) {
    for (let n = 0; n < out[f].length; n++) out[f][n] = lerp(a[f][n], b[f][n], k);
  }
  out.fogDensity = lerp(a.fogDensity, b.fogDensity, k);
  return { env: out, key: KEYS[i] };
}

export function setCycleEnv(instant = false) {
  const c = cycleEnv();
  G.envKey = c.key;
  G.envPinned = null;               // the clock has the sky back
  // The weather leans the sky BEFORE anything asks how dark it is, so a real
  // thunderstorm at two in the afternoon puts the headlights on by itself.
  const naturalSun = Math.max(...c.env.sun);
  weather.tintEnv(c.env);
  if (PROTO) {
    const light=Math.min(1,naturalSun*3);
    c.env.sun=c.env.sun.map(v=>v*light);
    c.env.sky=c.env.sky.map(v=>v*(.15+.85*light));
    c.env.fog=c.env.fog.map(v=>v*(.22+.78*light));
  }
  G.night = nightAmount(c.env) > 0.15;
  G.envTarget = c.env;
  if (instant || !G.env) {
    G.env = cloneEnv(c.env);
    G.env.fogDensity *= G.q.fogMul;
  }
}

// The env half of updateDayNight, on the fixed step. While AYLMER.time has the
// clock pinned it does not move (and no midnight passes), but the sky is still
// re-applied every step so the weather keeps reaching it.
export function advance(dt) {
  if (PROTO) {
    const opt = (typeof window !== 'undefined' && window.AYLMER_VISUAL) || {};
    const next = pinned != null ? (G.dayClock = clockAt(pinned), NO_MIDNIGHT)
      : advanceSummerClock(G,dt,CYCLE,opt.dayMinutes||24,opt.clockRate??1,calendar.LAST);
    applyRecordedWeather(weather,calendar.dayInfo(G.day),calendar.iso(G.day));
    if(next.midnights) onMidnight();
    setCycleEnv();
    if(next.end)onEnd();
    return;
  }
  if (pinned != null) { G.dayClock = clockAt(pinned); setCycleEnv(); return; }
  G.dayClock = (G.dayClock + dt) % CYCLE;
  // Under a mission the clock keeps running but the SKY is whatever the job
  // asked for, except that the weather still has to reach it, so the pinned
  // time of day is re-applied rather than left frozen at the value it had when
  // the job started.
  if (!G.mission) setCycleEnv();
  else if (G.envPinned) setEnv(G.envPinned);
}
const NO_MIDNIGHT = { midnights: 0, end: false };

export function stepEnv(dt) {
  const a = G.env, b = G.envTarget, k = Math.min(1, dt * 0.9);
  for (const f of ['sky', 'ground', 'sun', 'lightDir', 'fog']) {
    for (let i = 0; i < a[f].length; i++) a[f][i] = lerp(a[f][i], b[f][i], k);
  }
  a.fogDensity = lerp(a.fogDensity, b.fogDensity * G.q.fogMul, k);
}

// ---------------------------------------------------------------- AYLMER.time
// The 2004 clock IS the hour. The classic cycle has no hours, so an hour is
// placed inside its four phases: morning from 06:00, day from 09:30, dusk from
// 19:00, night from 21:30 to the next 06:00, linear inside each. Every named
// environment in PLAN.md section 4 then lands where it should: 07:00 and 13:00
// sit in the morning and day holds (exactly TIME_OF_DAY.morning and .day),
// 19:30 in the dusk hold, 23:30 in the night hold, and 20:45 between dusk and
// night.
const PHASE_HOURS = [6, 9.5, 19, 21.5, 30];
let pinned = null;

function clockAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (PROTO) return h / 24 * CYCLE;
  const hh = h < PHASE_HOURS[0] ? h + 24 : h;
  let i = 0;
  while (i < KEYS.length - 1 && hh >= PHASE_HOURS[i + 1]) i++;
  const frac = (hh - PHASE_HOURS[i]) / (PHASE_HOURS[i + 1] - PHASE_HOURS[i]);
  let start = 0;
  for (let n = 0; n < i; n++) start += WEIGHT[n];
  return (start + WEIGHT[i] * frac) * CYCLE;
}

// The hour the clock reads now (the inverse of clockAt).
export function hourNow() {
  if (pinned != null) return ((pinned % 24) + 24) % 24;
  const p = ((G.dayClock / CYCLE) % 1 + 1) % 1;
  if (PROTO) return p * 24;
  let i = 0, acc = 0;
  while (i < KEYS.length - 1 && p >= acc + WEIGHT[i]) { acc += WEIGHT[i]; i++; }
  const h = PHASE_HOURS[i] + (p - acc) / WEIGHT[i] * (PHASE_HOURS[i + 1] - PHASE_HOURS[i]);
  return h % 24;
}

// Pin the clock at `hour` (a number) and show it at once; null lets it run
// again from there. A pin holds the sky over a mission's own time of day too:
// it is for captures, and a capture asks for one environment.
export function pinHour(hour) {
  if (hour == null) { pinned = null; return null; }
  if (!Number.isFinite(hour)) return hourNow();
  pinned = hour;
  G.dayClock = clockAt(hour);
  setCycleEnv(true);
  return hourNow();
}
export function isPinned() { return pinned != null; }
