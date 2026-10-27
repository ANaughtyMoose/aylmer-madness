// « Éclairage avancé » / "Advanced lighting" (W8-LIGHT, Tom's ruling 27 Oct).
//
// One per-device switch for everything rf/s5-light-cuts added: linear light and
// the ACES curve, the timecycle table, the per-pixel sky, aerial fog, linear
// reflections, the night glow of windows and lamp heads, baked vertex AO on walls
// and car bodies. Off, the game assembles the shader fix/look-on-qr shipped
// (same source, same cost) and bakes the same vertex colours.
//
// DEFAULT ON (W8-LIGHTAUTO, Tom's ruling 27 Oct): a browser that never chose
// gets it on; a browser where the player ticked or unticked it keeps that
// choice (`advLightChosen` in the same settings key), so the default can move
// again without overriding anyone. If the game runs under 50 fps while driving,
// look/lightwatch.js offers to turn it off. Under node (the smokes, the tools)
// an unchosen value stays off, so every pinned hash and bake keeps today's
// numbers; smoke_advlight checks the browser default through setBrowserDefault().
//
// Where it lives: the player's own settings key (store.js, aylmer.settings,
// `advLight`), which is per browser and never part of a save slot, so a summer
// saved on the Mac mini with it on loads on the Air with the Air's own choice.
//
// When it is read: once, the first time anything asks (the renderer, at start
// up), then cached for the session. The shader is compiled once and the world
// baked once, so a change made in the options screen takes effect at the next
// launch (the option's label says so).
//
// Overrides: `?light=on` / `?light=off` in the URL (cloud checks, perf runs);
// setAdvLight() for the sector Worker (no localStorage there, the client passes
// the main thread's value) and for the node smokes.
const SETTINGS_KEY = 'aylmer.settings';

let V = null;

// What a browser that never chose gets. A real page (no node `process`) gets
// on; node gets off unless a smoke asks for the browser rule.
const IS_NODE = typeof process === 'object' && !!process?.versions?.node;
let BROWSER = !IS_NODE;
export function defaultAdvLight() { return BROWSER; }
// Smokes only: pretend to be (or not be) a browser for the default.
export function setBrowserDefault(on) { BROWSER = on == null ? !IS_NODE : !!on; return BROWSER; }

// The one rule, for the parsed aylmer.settings object (or nothing): a chosen
// value is kept, anything else is the default.
export function resolveAdvLight(s) {
  if (s && typeof s === 'object' && s.advLightChosen === true) return s.advLight === true;
  return defaultAdvLight();
}

function readUrl() {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('light') : null;
    if (q === 'on' || q === '1') return true;
    if (q === 'off' || q === '0') return false;
  } catch { /* no URL */ }
  return null;
}

function readSetting() {
  // window.localStorage, not globalThis: under node the bare global prints an
  // experimental warning (heckle.js), and a Worker has none at all.
  try {
    const ls = typeof window !== 'undefined' ? window.localStorage : null;
    const raw = ls?.getItem(SETTINGS_KEY);
    return resolveAdvLight(raw ? JSON.parse(raw) : null);
  } catch { return defaultAdvLight(); }
}

// Is advanced lighting on for this session? A plain cached read after the first call.
export function advLight() {
  if (V === null) { const u = readUrl(); V = u === null ? readSetting() : u; }
  return V;
}

// Force it (the Worker, smokes). Takes effect for anything assembled or baked
// after. null forgets the cached value, so the next advLight() reads again.
export function setAdvLight(on) { V = on == null ? null : !!on; return V; }
