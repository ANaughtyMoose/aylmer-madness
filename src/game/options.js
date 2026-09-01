// The options screen: audio, video, controls, gameplay.
//
// One table (SECTIONS) describes every control, so the panel, the wiring and
// the persistence are all generated from the same place — add a row and the
// slider, its live read-out, its clamp and its localStorage write come free.
// Every change is applied and persisted immediately; nothing here needs a
// restart and nothing here is part of a save file.
//
// The panel is used twice: full screen off the main menu (« Options ») and as
// the pause menu's Options tab. Confirmations are two-click buttons inside the
// panel — window.confirm() would freeze the headless harness.
import { t, setLang } from './i18n.js';
import {
  loadSettings, saveSettings, normalizeSettings, DEFAULT_SETTINGS,
  MAP_SIZES, loadMapPrefs, saveMapPrefs,
} from './store.js';
import { keyboardHTML } from './ui.js';

// The graphics presets. They seed render scale / DPR / draw distance / fog, and
// own the two things that are not sliders: the traffic count and the camera FOV.
export const QUALITY = {
  low:  { scale: 0.68, dpr: 1.0, fov: 1.12, traffic: 8, drawDist: 520, fogMul: 2.0 },
  med:  { scale: 0.85, dpr: 1.5, fov: 1.15, traffic: 14, drawDist: 720, fogMul: 1.45 },
  high: { scale: 1.0,  dpr: 2.0, fov: 1.15, traffic: 20, drawDist: 950, fogMul: 1.1 },
};

// Changing the preset re-seeds the four numbers it owns; the sliders then
// override it until you pick a preset again.
export function presetSettings(s, quality) {
  const q = QUALITY[quality] || QUALITY.med;
  return { ...s, quality, renderScale: q.scale, maxDpr: q.dpr, drawDist: q.drawDist, fogMul: q.fogMul };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const doc = () => (typeof document !== 'undefined' ? document : null);
const byId = (id) => doc()?.getElementById(id) || null;

// ---------------------------------------------------------------- the table

const pct = (v) => Math.round(v * 100) + ' %';
const metres = (v) => Math.round(v) + ' m';
const times = (v) => Number(v).toFixed(2) + '×';
const signed = (v) => (v >= 0 ? '+' : '') + Number(v).toFixed(2);

export const FMT = { pct, metres, times, signed };

export const SECTIONS = [
  {
    id: 'audio', title: 'opt.audio', rows: [
      { k: 'audio', type: 'check', label: 'opt.mute' },
      { k: 'volMaster', type: 'range', min: 0, max: 1, step: 0.05, fmt: 'pct' },
      { k: 'volEngine', type: 'range', min: 0, max: 1, step: 0.05, fmt: 'pct' },
      { k: 'volEffects', type: 'range', min: 0, max: 1, step: 0.05, fmt: 'pct' },
      { k: 'volRadio', type: 'range', min: 0, max: 1, step: 0.05, fmt: 'pct' },
      { k: 'engineSpeed', type: 'check' },
    ],
  },
  {
    id: 'video', title: 'opt.video', rows: [
      {
        k: 'quality', type: 'select', preset: true,
        options: [['low', 'menu.q.low'], ['med', 'menu.q.med'], ['high', 'menu.q.high']],
      },
      { k: 'renderScale', type: 'range', min: 0.5, max: 1, step: 0.05, fmt: 'pct' },
      { k: 'maxDpr', type: 'select', num: true, options: [['1', '1×'], ['1.5', '1.5×'], ['2', '2×']], raw: true },
      { k: 'drawDist', type: 'range', min: 400, max: 1200, step: 20, fmt: 'metres' },
      { k: 'fogMul', type: 'range', min: 0.5, max: 2, step: 0.05, fmt: 'times' },
      { k: 'fov', type: 'range', min: -0.15, max: 0.2, step: 0.01, fmt: 'signed' },
      {
        k: 'cam', type: 'select', int: true,
        options: [['0', 'opt.cam.chase'], ['1', 'opt.cam.close'], ['2', 'opt.cam.far'], ['3', 'opt.cam.hood']],
      },
      { k: 'mapSize', type: 'select', int: true, options: [['0', 'opt.small'], ['1', 'opt.large']] },
      { k: 'showHud', type: 'check' },
      { k: 'showLegend', type: 'check' },
      { k: 'showFps', type: 'check' },
      { act: 'fullscreen', type: 'action', label: 'opt.fullscreen' },
    ],
  },
  {
    id: 'controls', title: 'opt.controls', rows: [
      { k: 'steerSens', type: 'range', min: 0.5, max: 1.6, step: 0.05, fmt: 'times' },
      { k: 'assist', type: 'check' },
      { k: 'lookBackToggle', type: 'check' },
      { k: 'invertLook', type: 'check' },
      { k: 'rumble', type: 'check' },
      { type: 'keys' },
    ],
  },
  {
    id: 'gameplay', title: 'opt.gameplay', rows: [
      { k: 'autosave', type: 'check' },
      {
        k: 'difficulty', type: 'select',
        options: [['easy', 'opt.diff.easy'], ['normal', 'opt.diff.normal'], ['hard', 'opt.diff.hard']],
      },
      { k: 'heckles', type: 'check' },
      // The slang gloss (G). It is NOT a settings key: store.js keeps a closed
      // list and drops anything it does not know, and this flag belongs to
      // heckle.js, which persists it itself. `flag` rows read and write through
      // ctx.flags instead of through the settings object.
      { flag: 'slangGloss', type: 'check', label: 'opt.slangGloss' },
      { act: 'resetCars', type: 'action', label: 'opt.resetCars' },
      { act: 'tutorial', type: 'action', label: 'opt.tutorial' },
      { act: 'story', type: 'action', label: 'opt.story' },
      { act: 'wipeSaves', type: 'confirm', label: 'opt.wipeSaves', danger: true },
    ],
  },
];

const ctrlId = (k) => 'o_' + k;
const valId = (k) => 'o_' + k + '_v';
const rowValue = (s, r) => s[r.k];

// Rows that live outside the settings object. `flags.get/set` is supplied by
// whoever mounts the panel; with no ctx.flags at all they draw unchecked and do
// nothing, which is what the smoke tests see.
let FLAGS = null;

function rowHTML(s, r) {
  if (r.flag) {
    const on = FLAGS && FLAGS.get ? !!FLAGS.get(r.flag) : false;
    return `<label class="srow"><span>${esc(t(r.label))}</span>` +
      `<input type="checkbox" id="${ctrlId(r.flag)}"${on ? ' checked' : ''}></label>`;
  }
  return rowHTML0(s, r);
}

function rowHTML0(s, r) {
  if (r.type === 'keys') {
    return `<div class="okeys"><p class="hint">${esc(t('opt.keyhint'))}</p>${keyboardHTML()}</div>`;
  }
  if (r.type === 'action' || r.type === 'confirm') {
    return `<div class="srow act"><span>${esc(t(r.label))}</span>` +
      `<button class="obtn${r.danger ? ' danger' : ''}" data-act="${esc(r.act)}"` +
      `${r.type === 'confirm' ? ' data-confirm="1"' : ''}>${esc(t(r.label))}</button></div>`;
  }
  const label = esc(t('opt.' + r.k));
  const v = rowValue(s, r);
  if (r.type === 'check') {
    return `<label class="srow"><span>${esc(t(r.label || ('opt.' + r.k)))}</span>` +
      `<input type="checkbox" id="${ctrlId(r.k)}"${v ? ' checked' : ''}></label>`;
  }
  if (r.type === 'select') {
    const opts = r.options.map(([val, lab]) =>
      `<option value="${esc(val)}"${String(v) === String(val) ? ' selected' : ''}>` +
      `${esc(r.literal || r.raw ? lab : t(lab))}</option>`).join('');
    return `<label class="srow"><span>${label}</span><select id="${ctrlId(r.k)}">${opts}</select></label>`;
  }
  // range
  const fmt = FMT[r.fmt] || String;
  return `<label class="srow"><span>${label}</span>` +
    `<input type="range" id="${ctrlId(r.k)}" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}">` +
    `<b id="${valId(r.k)}">${esc(fmt(v))}</b></label>`;
}

// `only` picks a subset of sections (the pause tab shows all four).
export function optionsHTML(s0, { only = null } = {}) {
  const s = normalizeSettings(s0);
  const secs = SECTIONS.filter((sec) => !only || only.includes(sec.id));
  return `<div class="opts">` + secs.map((sec) =>
    `<div class="osec"><h4>${esc(t(sec.title))}</h4>` +
    `<div class="sform">${sec.rows.map((r) => rowHTML(s, r)).join('')}</div></div>`).join('') +
    `</div>`;
}

// Read every control that is actually on screen; anything absent keeps the
// value it already had.
export function readOptions(root, current) {
  const s = { ...normalizeSettings(current) };
  const q = (id) => (root && root.querySelector ? root.querySelector('#' + id) : null);
  for (const sec of SECTIONS) {
    for (const r of sec.rows) {
      if (!r.k) continue;
      const el = q(ctrlId(r.k));
      if (!el) continue;
      if (r.type === 'check') s[r.k] = !!el.checked;
      else if (r.type === 'select') s[r.k] = r.int ? parseInt(el.value, 10) : (r.num ? parseFloat(el.value) : el.value);
      else s[r.k] = parseFloat(el.value);
    }
  }
  return normalizeSettings(s);
}

/**
 * Draw the panel into `root` and keep it wired.
 *   ctx.get()        -> the current settings
 *   ctx.onChange(s)  -> a change has been persisted; apply it to the game
 *   ctx.actions      -> { resetCars, tutorial, wipeSaves, fullscreen }
 *   ctx.only         -> section ids to show
 * Returns { redraw() } so a language change can repaint the labels.
 */
export function mountOptions(root, ctx = {}) {
  if (!root) return { redraw() {} };
  const get = ctx.get || loadSettings;
  const draw = () => {
    FLAGS = ctx.flags || null;
    root.innerHTML = optionsHTML(get(), { only: ctx.only });
    FLAGS = null;
    wire();
  };

  const wire = () => {
    const cur = get();
    const emit = (changed) => {
      let next = readOptions(root, get());
      // Picking a preset re-seeds the numbers it owns, so the panel is redrawn.
      if (changed === 'quality' && next.quality !== cur.quality) {
        next = presetSettings(next, next.quality);
        const fresh = saveSettings(next);
        ctx.onChange?.(fresh);
        draw();
        return;
      }
      const before = get();
      const fresh = saveSettings(next);
      // Live read-outs next to the sliders.
      for (const sec of SECTIONS) {
        for (const r of sec.rows) {
          if (r.type !== 'range') continue;
          const b = root.querySelector('#' + valId(r.k));
          if (b) b.textContent = (FMT[r.fmt] || String)(fresh[r.k]);
        }
      }
      ctx.onChange?.(fresh);
      if (fresh.lang !== before.lang) draw();   // relabel everything, in place
    };

    for (const sec of SECTIONS) {
      for (const r of sec.rows) {
        if (r.flag) {
          const fl = root.querySelector('#' + ctrlId(r.flag));
          if (fl) fl.onchange = () => ctx.flags?.set?.(r.flag, !!fl.checked);
          continue;
        }
        if (!r.k) continue;
        const el = root.querySelector('#' + ctrlId(r.k));
        if (!el) continue;
        el.oninput = () => emit(r.k);
        el.onchange = () => emit(r.k);
      }
    }

    // Actions. A `data-confirm` button asks once, in place, and gives up after
    // four seconds — no modal dialogs anywhere in this game.
    for (const b of root.querySelectorAll('button[data-act]')) {
      const act = b.dataset.act;
      const label = b.textContent;
      let armed = 0, timer = 0;
      b.onclick = () => {
        if (b.dataset.confirm && !armed) {
          armed = 1;
          b.textContent = t('opt.confirm');
          b.classList.add('armed');
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => { armed = 0; b.textContent = label; b.classList.remove('armed'); }, 4000);
          return;
        }
        armed = 0;
        if (timer) { clearTimeout(timer); timer = 0; }
        b.textContent = label;
        b.classList.remove('armed');
        ctx.actions?.[act]?.();
        if (act === 'wipeSaves') draw();
      };
    }
  };

  draw();
  return { redraw: draw };
}

// ---------------------------------------------------------------- apply live

/**
 * The one place a settings change reaches the running game. Safe to call with a
 * half-built G (the menu calls it before there is a renderer) and safe to call
 * with no DOM at all, which is how the smoke test drives it.
 * Returns { langChanged } so the caller can repaint its own labels.
 */
export function applySettings(G, s0) {
  const s = normalizeSettings(s0);
  const prev = G.settings || DEFAULT_SETTINGS;
  const langChanged = s.lang !== prev.lang;
  G.settings = s;
  setLang(s.lang);

  // ---- video
  G.quality = s.quality;
  const base = QUALITY[s.quality] || QUALITY.med;
  // Everything that reads a quality number each frame reads G.q, so the sliders
  // are live: no reload, no rebuild of the world.
  G.q = {
    ...base,
    scale: s.renderScale, dpr: s.maxDpr,
    drawDist: s.drawDist, fogMul: s.fogMul,
  };
  const r = G.renderer;
  if (r) {
    r.scale = s.renderScale;
    r.maxDpr = s.maxDpr;
    r.resize?.();
  }

  // ---- driving
  G.assist = s.assist;
  if (G.veh) G.veh.assist = s.assist;
  if (s.cam !== prev.cam) G.cam = s.cam;
  G.difficulty = s.difficulty;   // the AI agent reads it if it wants to

  // ---- audio: the mixer if somebody has built one, one master gain otherwise
  const a = G.audio;
  if (a) {
    a.enabled = s.audio;
    const vol = {
      master: s.audio ? s.volMaster : 0,
      engine: s.volEngine, effects: s.volEffects, radio: s.volRadio,
    };
    if (typeof a.setVolume === 'function') a.setVolume(vol);
    else a.setMaster?.(vol.master);
    a.engineFollowsSpeed = s.engineSpeed;
  }
  G.radio?.setVolume?.(s.volRadio);

  // ---- hud
  if (G.hud) {
    G.hud.setSize?.(MAP_SIZES[s.mapSize] ?? MAP_SIZES[0]);
    if (G.mode === 'drive') G.hud.setVisible?.(s.showHud);
  }
  const mp = G.mapPrefs || loadMapPrefs();
  if (mp.size !== s.mapSize) { mp.size = s.mapSize; G.mapPrefs = mp; saveMapPrefs(mp); }

  byId('legend')?.classList.toggle('hidden', !s.showLegend);
  byId('fps')?.classList.toggle('hidden', !s.showFps);
  G.legend?.render?.();

  return { langChanged };
}

// document.documentElement.requestFullscreen, with the exit half and no throw
// on a browser that will not have it.
export function toggleFullscreen() {
  const d = doc();
  if (!d) return false;
  try {
    if (d.fullscreenElement) { d.exitFullscreen?.(); return false; }
    d.documentElement?.requestFullscreen?.();
    return true;
  } catch { return false; }
}
