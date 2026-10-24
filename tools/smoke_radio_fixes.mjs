// Recorded radio review fixes (docs/review/audio-radio.md F1, F2, F3, F7, F8, F12).
//   node tools/smoke_radio_fixes.mjs
// Plain node, stub media elements, the real 100 ms fade timer.
import assert from 'node:assert/strict';
import { RecordedRadio, FAILED_RETRY_MS } from '../src/game/recorded-radio.js';
import { STATIONS, RECORDINGS } from '../src/game/radio-library.js';

const param = () => ({ value: 0, setValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {} });
let sources = 0;
const node = () => ({ gain: param(), connect() {}, disconnect() {} });
async function rig({ fadeMs = 0 } = {}) {
  const listeners = new Set();
  const ctx = { currentTime: 0, state: 'running', createGain: node, createMediaElementSource: () => { sources++; return node(); } };
  const audio = { ok: true, enabled: true, ctx, radioBus: node(), started: 0, resumed: 0,
    get running() { return ctx.state === 'running'; },
    start() { this.started++; }, resume() { this.resumed++; ctx.state = 'running'; return Promise.resolve(); },
    setVolume() {}, onStateChange(fn) { listeners.add(fn); }, fire() { for (const fn of listeners) fn(ctx.state); } };
  const elements = [], loads = [];
  const mediaFactory = () => {
    const el = { currentTime: 0, duration: 100, paused: true, src: '',
      play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; },
      load() { loads.push(this.src); }, removeAttribute(k) { if (k === 'src') this.src = ''; } };
    elements.push(el); return el;
  };
  const memory = new Map();
  const storage = { getItem: (k) => memory.get(k), setItem: (k, v) => memory.set(k, v) };
  const r = new RecordedRadio(audio, { storage, mediaFactory, fadeMs });
  r.addSources(RECORDINGS.map((t) => ({ id: t.id, url: 'test:' + t.id })));
  r.resume(); await Promise.resolve();                 // main.js does this on entering drive
  return { r, audio, ctx, elements, loads };
}
const tick = () => new Promise((q) => setTimeout(q, 0));
const play = async (r) => { r.session.el.onloadedmetadata(); await Promise.resolve(); await Promise.resolve(); };
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok   ' + m); };

// ---- F1: 100 station switches through the real fade path, one element, one source node.
{
  sources = 0;
  const { r, elements } = await rig({ fadeMs: 5 });
  r.power(true); await play(r);
  for (let i = 0; i < 100; i++) {
    r.nextStation();
    await new Promise((q) => setTimeout(q, 7));
    if (r.session) await play(r);
  }
  ok(elements.length === 1, `100 switches: ${elements.length} media element (was 101)`);
  ok(sources === 1, `100 switches: ${sources} MediaElementSource node (was 101)`);
  ok(r.on && !r.session.el.paused, 'still playing after 100 switches');
  // AUD-02: energie1041 is enabled but has no committed recording (it is discovered), so it is not on this dial.
  ok(r.selectedStationId === STATIONS.filter((s) => s.enabled && s.recordingIds.length)[100 % 5].id, 'settled on the station the dial says');
  for (let i = 0; i < 30; i++) r.nextStation();          // rapid tuning inside one fade window
  await new Promise((q) => setTimeout(q, 10)); await play(r);
  ok(elements.length === 1 && sources === 1 && r.on, '30 rapid tunes inside the fade window reuse the same element');
  r.dispose();
  ok(elements[0].paused && elements[0].src === '', 'dispose releases the file');
}

// ---- F12: during the fade the outgoing session does not answer for the new station.
{
  const { r } = await rig({ fadeMs: 50 });
  r.power(true); await play(r); r.session.el.currentTime = 30;
  r.nextStation();
  const st = r.state();
  ok(st.stationId === 'cbc-radio-one' && st.position === 0, `state() during the fade shows the new station (position ${st.position})`);
  ok(r.seek(12) && r.session.el.currentTime === 30 && r.positions['cbc-radio-one'].positionSeconds === 12, 'seek() during the fade moves the new station, not the outgoing one');
  r.dispose();
}

// ---- F3: an autoplay block shows as an error, and ONE R press plays.
{
  const { r } = await rig();
  r.power(true);
  const el = r.session.el, real = el.play;
  el.play = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
  r.session.el.onloadedmetadata(); await tick();
  el.play = real;                                      // the key press is the user activation
  const st = r.state();
  ok(st.wantOn && !st.on && st.blocked && /bloqué/.test(st.track) && /bloqué/.test(st.error), 'blocked: HUD line says so, on is false');
  r.toggle();
  ok(r.wantOn === true, 'first R after a block keeps power on (retries)');
  await play(r);
  ok(r.on && !r.blocked && r.state().track === r.current().title, 'first R after a block plays');
  r.toggle();
  ok(!r.wantOn, 'next R turns it off as usual');
  r.dispose();
}

// ---- F2: a context the browser suspended is reported, and R wakes it.
{
  const { r, audio, ctx } = await rig();
  let heard = 0; r.subscribe(() => heard++);
  r.power(true); await play(r);
  ok(r.state().on, 'playing while the context runs');
  ctx.state = 'suspended'; heard = 0; audio.fire();
  const st = r.state();
  ok(heard > 0, 'a context statechange reaches radio listeners');
  ok(!st.on && st.wantOn && st.blocked && /suspendu/.test(st.error), 'suspended context: state().on is false and says why');
  const before = audio.resumed;
  r.toggle();
  ok(r.wantOn && audio.resumed > before, 'R on a silent-but-on radio resumes instead of powering off');
  await play(r);
  ok(r.state().on, 'audible again');
  r.dispose();
}

// ---- F7: a failed station advances along the dial; failures are not forever.
{
  const { r } = await rig();
  r.tune('cbc-radio-one'); r.power(true);
  for (let i = 0; i < 5 && r.session?.stationId === 'cbc-radio-one'; i++) r.session.el.onerror();
  ok(r.selectedStationId === 'radio-canada', `a dead CBC moves on to ${r.selectedStationId}, not back to CHEZ`);
  ok(/3 fichiers ignorés/.test(r.notice), `notice counts failures: "${r.notice}"`);
  ok(!r.available().some((s) => s.id === 'cbc-radio-one'), 'dead station is skipped for now');
  const [id] = r.failed.keys();
  r.failed.set(id, r.failed.get(id) - FAILED_RETRY_MS - 1);
  ok(!r.failed.has(id) || r.tracks('cbc-radio-one').some((t) => t.id === id), 'a failure older than the retry window is forgotten');
  for (const k of r.failed.keys()) r.failed.set(k, performance.now());
  r.power(false); r.power(true);
  ok(r.failed.size === 0 && r.available().some((s) => s.id === 'cbc-radio-one'), 'switching the radio on retries failed files');
  // Last station on the dial wraps to the first, still in dial order.
  r.tune('ckmf943');
  ok(r.selectedStationId === 'ckmf943', 'tuned to CKMF, the last preset');
  for (let i = 0; i < 5 && r.session?.stationId === 'ckmf943'; i++) r.session.el.onerror();
  ok(r.selectedStationId === 'chez106', `a dead last station wraps to the first (${r.selectedStationId})`);
  r.dispose();
}

// ---- F8: resume() then suspend() in the same turn (toMenu) opens nothing.
{
  const { r, loads, elements } = await rig();
  r.power(true); await play(r);
  r.suspend();
  const before = loads.filter(Boolean).length;
  r.resume(); r.suspend();
  await tick();
  ok(r.session === null && loads.filter(Boolean).length === before && elements.every((e) => e.paused), 'toMenu(): pause(false)+suspend() starts no file');
  r.resume(); await tick();
  ok(r.session && loads.filter(Boolean).length === before + 1, 'a real resume still starts the station');
  r.dispose();
}

// ---- Contract: five presets, R toggles, Shift+R keeps power.
{
  const { r } = await rig();
  ok(r.available().map((s) => s.name).length === 5, 'five presets available');
  ok(!STATIONS.some((s) => /CKTF/i.test(JSON.stringify(s))), 'no CKTF anywhere in the dial');
  r.nextStation(); ok(!r.wantOn, 'Shift+R with the radio off keeps it off');
  r.toggle(); r.nextStation(); ok(r.wantOn, 'Shift+R with the radio on keeps it on');
  r.dispose();
}
console.log(`PASS: ${n} recorded-radio fix checks (F1 single element, F2, F3, F7, F8, F12)`);
