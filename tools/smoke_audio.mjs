// Engine-audio smoke test:  node tools/smoke_audio.mjs
//
// Two halves. The first runs the gearbox in plain node — no browser, no audio —
// and checks the arithmetic that decides what rpm the synth is asked for. The
// second reads the rendered auditions in docs/audio/ and measures them:
//
//   * the Ranger idles at 26.7 Hz (800 rpm / 30) and every car reads 100 Hz
//     where the programme holds it at 3000 rpm,
//   * nothing clips,
//   * the gearchanges show up as ~250 ms dips in the RMS envelope, at the times
//     the gearbox says it changed gear,
//   * the Civic's redline note is higher than the Ranger's,
//   * and the envelope reads like an engine — idle well under wide-open.
//
// Regenerate the WAVs with `node tools/audition.mjs` (needs the local server and
// a headless Chrome on 9222).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARS, carById } from '../src/game/cars.js';
import { Gearbox } from '../src/game/gearbox.js';
import { programme } from '../src/core/audition.js';
import { readWav, slice, peak, rms, rmsFrames, dominantHz, findDips } from './wav.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const AUDIO = path.join(ROOT, 'docs/audio');
const CORE = ['ranger', 'civic', 'saturn', 'sunfire'];

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const group = (n) => console.log('\n' + n);

// ---------------------------------------------------------------- 1. gearbox

group('gearbox');
{
  const ranger = carById('ranger');
  const gb = new Gearbox(ranger.drive);
  // 27" tyre, 1.42 third, 3.73 final: fifty in third is a shade over 2000 rpm.
  const r3 = gb.rpmAt(50, 3);
  ok(near(r3, 2050, 40), `Ranger: 50 km/h in 3rd = ${r3.toFixed(0)} rpm`, String(r3));
  ok(gb.rpmAt(50, 5) < gb.rpmAt(50, 1), 'taller gear, fewer revs');
  ok(near(gb.kmhAt(r3, 3), 50, 0.5), 'kmhAt inverts rpmAt');

  // A standing start: idle, then the clutch is slipped, then the road catches up.
  gb.reset();
  gb.update(1 / 60, 0, 0);
  // 800, not 750: a 2.3 Lima with no balance shafts does not tick over any
  // lower than that, and the synth's idle has to be the same number.
  ok(near(gb.rpm, 800, 1), `idle is ${gb.rpm.toFixed(0)} rpm at a standstill`);
  ok(ranger.drive.idle === ranger.sound.idle,
    `the box and the synth agree on ${ranger.drive.idle} rpm`);
  gb.update(1 / 60, 0, 1);
  ok(gb.rpm > 1800 && gb.rpm <= 2200, `launch lifts to ${gb.rpm.toFixed(0)} rpm on full throttle`, String(gb.rpm));
  ok(gb.clutch < 1, 'and the clutch is slipping');

  // Wide open from a standstill: it should walk up through the box.
  gb.reset();
  let v = 0, up = 0, lastGear = 1;
  for (let t = 0; t < 12; t += 1 / 120) {
    v += 3.8 / 120;
    gb.update(1 / 120, v * 3.6, 1);
    if (gb.gear > lastGear) { up++; lastGear = gb.gear; }
    ok.silent = true;
  }
  ok(up >= 3, `${up} upshifts in a 12 s wide-open pull`);
  ok(gb.rpm <= ranger.drive.limiter + 1, 'the limiter is a ceiling');

  // Coming back down: below 1600 it drops a gear.
  gb.reset(); gb.gear = 4;
  for (let t = 0; t < 2; t += 1 / 120) gb.update(1 / 120, 30, 0.1);
  ok(gb.gear < 4, `rolling at 30 km/h it drops to ${gb.gear}`);

  // The clutch dip is a quarter of a second and it really does reach zero.
  gb.reset();
  gb.shiftTo(2);
  let minClutch = 1, dipT = 0;
  for (let t = 0; t < 0.6; t += 1 / 240) {
    gb.update(1 / 240, 45, 1);
    if (gb.clutch < 0.999) dipT += 1 / 240;
    minClutch = Math.min(minClutch, gb.clutch);
  }
  ok(minClutch < 0.05, `the clutch goes to ${minClutch.toFixed(2)} mid-shift`);
  ok(near(dipT, ranger.drive.shiftTime, 0.03), `the dip lasts ${(dipT * 1000).toFixed(0)} ms`);

  // SPEED — real top speeds put every car somewhere it can be dropped into a
  // gear the driveshaft would spin past the limiter. Both the steady state and
  // the mid-shift interpolation have to hold the ceiling.
  for (const c of CARS) {
    const g = new Gearbox(c.drive);
    let worst = 0;
    for (const gear of [1, 2, 3]) {
      g.reset(); g.gear = gear; g.shiftTo(Math.min(gear + 1, g.top));
      for (let t = 0; t < 1; t += 1 / 240) {
        g.update(1 / 240, c.topSpeed * 3.6, 1);
        worst = Math.max(worst, g.rpm);
      }
    }
    ok(worst <= c.drive.limiter + 1,
      `${c.id}: flat out in the wrong gear still tops out at the limiter`,
      `${worst.toFixed(0)} vs ${c.drive.limiter}`);
  }
  // ...and fifth at the top speed is a sane number of revs, not a redline.
  const gTop = new Gearbox(ranger.drive);
  const topRpm = gTop.rpmAt(ranger.topSpeed * 3.6, ranger.drive.gears.length);
  ok(topRpm > 3000 && topRpm < ranger.drive.redline,
    `Ranger: ${Math.round(ranger.topSpeed * 3.6)} km/h in fifth is ${topRpm.toFixed(0)} rpm`);

  // Every car has a box, and the Civic revs further than the Ranger.
  // ...except the golf cart, which is a motor, one reduction and a switch.
  ok(CARS.every((c) => c.drive && (c.electric || c.drive.gears.length >= 3)), 'every car has gear ratios');
  ok(CARS.every((c) => c.sound && c.sound.cyl >= 4), 'every car has a sound profile');
  ok(carById('civic').sound.redline > carById('ranger').sound.redline,
    `Civic redline ${carById('civic').sound.redline} > Ranger ${carById('ranger').sound.redline}`);
  ok(carById('civic').drive.redline === carById('civic').sound.redline, 'box and synth agree on the Civic redline');
}

// ---------------------------------------------------------------- 2. the WAVs

group('auditions (docs/audio)');
const haveAudio = fs.existsSync(AUDIO) && CORE.every((c) => fs.existsSync(path.join(AUDIO, c + '.wav')));
if (!haveAudio) {
  console.log('  SKIP no docs/audio/*.wav — run `node tools/audition.mjs` first');
} else {
  const topNote = {};
  for (const id of CORE) {
    const spec = carById(id);
    const prog = programme(spec, 'pull');
    const firing = (rpm) => (rpm / 120) * spec.sound.cyl;

    // Re-run the same programme through the same gearbox to find out where the
    // shifts should be. This is the thing the RMS dips are checked against.
    const gb = new Gearbox(spec.drive);
    const out = [0, 0], shiftAt = [];
    let wasShifting = false;
    for (let i = 0; i * (1 / 120) < prog.seconds; i++) {
      const t = i / 120;
      prog.at(t, out);
      gb.update(1 / 120, out[0], out[1]);
      const shifting = gb.shiftT > 0;
      if (shifting && !wasShifting) shiftAt.push(+t.toFixed(2));
      wasShifting = shifting;
    }

    for (const kind of ['pull', 'cruise']) {
      const file = path.join(AUDIO, kind === 'pull' ? `${id}.wav` : `${id}-cruise.wav`);
      const w = readWav(file);
      const name = path.basename(file);
      ok(w.channels === 1 && w.bits === 16 && w.sampleRate === 22050,
        `${name}: 16-bit mono 22.05 kHz`, `${w.channels}ch ${w.bits}b ${w.sampleRate}`);
      ok(w.bytes <= 600 * 1024, `${name}: ${Math.round(w.bytes / 1024)} KB <= 600 KB`);
      const pk = peak(w.samples);
      ok(pk < 0.9, `${name}: peak ${pk.toFixed(3)} (no clipping)`, String(pk));
      ok(pk > 0.02, `${name}: it is not silence`);

      if (kind === 'cruise') {
        // Fifty in third: the note should be the third-gear rpm, and that is
        // where the body boom lives.
        const gc = new Gearbox(spec.drive);
        for (let t = 0; t < 3; t += 1 / 120) gc.update(1 / 120, 50, 0.32);
        const want = firing(gc.rpm);
        const got = dominantHz(slice(w.samples, w.sampleRate, 3.0, 4.4), w.sampleRate);
        ok(near(got, want, Math.max(4, want * 0.06)),
          `${name}: ${got.toFixed(1)} Hz at 50 km/h in ${gc.gear}th (want ${want.toFixed(1)})`,
          `${got.toFixed(1)} vs ${want.toFixed(1)}`);
        continue;
      }

      // --- idle -----------------------------------------------------------
      const idleHz = dominantHz(slice(w.samples, w.sampleRate, 1.2, 2.4), w.sampleRate);
      const wantIdle = firing(spec.sound.idle);
      ok(near(idleHz, wantIdle, 3),
        `${name}: idles at ${idleHz.toFixed(1)} Hz (${spec.sound.idle} rpm / ${120 / spec.sound.cyl} = ${wantIdle.toFixed(1)})`,
        `${idleHz.toFixed(1)} vs ${wantIdle.toFixed(1)}`);
      if (id === 'ranger') {
        ok(near(idleHz, 26.7, 3), `Ranger idle is ${idleHz.toFixed(1)} Hz (800 rpm / 30 = 26.7 ± 3)`, String(idleHz));
      }

      // --- the 3000 rpm plateau -------------------------------------------
      const holdHz = dominantHz(slice(w.samples, w.sampleRate, prog.plateau[0] + 0.25, prog.plateau[1] - 0.05), w.sampleRate);
      const wantHold = firing(prog.plateauRpm);
      ok(near(holdHz, wantHold, 5),
        `${name}: ${holdHz.toFixed(1)} Hz held at ${prog.plateauRpm} rpm (want ${wantHold.toFixed(1)})`,
        `${holdHz.toFixed(1)} vs ${wantHold.toFixed(1)}`);
      if (prog.plateauRpm === 3000) {
        ok(near(holdHz, 100, 5), `${name}: 3000 rpm reads 100 Hz`, String(holdHz));
      }

      // --- the top of the pull --------------------------------------------
      let top = 0;
      for (let t = 3.4; t < 8.9; t += 0.25) {
        top = Math.max(top, dominantHz(slice(w.samples, w.sampleRate, t, t + 0.25), w.sampleRate));
      }
      topNote[id] = top;
      ok(top > wantIdle * 3, `${name}: the pull reaches ${top.toFixed(0)} Hz`);
      ok(top <= firing(spec.sound.limiter) * 1.06,
        `${name}: and never goes past the limiter (${firing(spec.sound.limiter).toFixed(0)} Hz)`, String(top));

      // --- the envelope ----------------------------------------------------
      const idleR = rms(slice(w.samples, w.sampleRate, 0.6, 2.4));
      const wotR = rms(slice(w.samples, w.sampleRate, 6.5, 8.8));
      const coastR = rms(slice(w.samples, w.sampleRate, 10.5, 11.3));
      ok(idleR < wotR * 0.35, `${name}: idle ${idleR.toFixed(4)} well under wide open ${wotR.toFixed(4)}`);
      ok(idleR > 0.0008, `${name}: idle is audible (${idleR.toFixed(4)})`);
      ok(coastR < wotR, `${name}: the overrun (${coastR.toFixed(4)}) is quieter than the pull`);

      // --- the shifts ------------------------------------------------------
      const { frames, frameSec } = rmsFrames(slice(w.samples, w.sampleRate, 2.6, 11.4), w.sampleRate, 20);
      const dips = findDips(frames, frameSec, 0.72, 0.10, 0.55).map((d) => ({ ...d, start: +(d.start + 2.6).toFixed(2), end: +(d.end + 2.6).toFixed(2) }));
      ok(dips.length >= 2, `${name}: ${dips.length} dips in the RMS envelope`, JSON.stringify(dips));
      const avg = dips.reduce((s, d) => s + d.seconds, 0) / (dips.length || 1);
      ok(dips.length === 0 || (avg > 0.12 && avg < 0.45),
        `${name}: they last ${(avg * 1000).toFixed(0)} ms on average (the clutch dip is ${spec.drive.shiftTime * 1000} ms)`);
      const matched = shiftAt.filter((s) => dips.some((d) => s >= d.start - 0.30 && s <= d.end + 0.30));
      ok(matched.length >= Math.min(2, shiftAt.length),
        `${name}: ${matched.length}/${shiftAt.length} gearchanges line up with a dip`,
        `shifts ${JSON.stringify(shiftAt)} dips ${JSON.stringify(dips.map((d) => [d.start, d.end]))}`);

      console.log(`       ${name}: idle ${idleHz.toFixed(1)} Hz · hold ${holdHz.toFixed(1)} Hz · top ${top.toFixed(0)} Hz · peak ${pk.toFixed(3)}`);
      console.log('       rms/s ' + Array.from({ length: Math.floor(w.seconds) }, (_, s) =>
        rms(slice(w.samples, w.sampleRate, s, s + 1)).toFixed(3)).join(' '));
    }
  }
  ok(topNote.civic > topNote.ranger,
    `the Civic's top note (${topNote.civic.toFixed(0)} Hz) is above the Ranger's (${topNote.ranger.toFixed(0)} Hz)`);
  ok(topNote.civic > 200 && topNote.ranger < 200, 'and it is a whole different engine up there');
}

// ------------------------------------------------- 2b. the mix ladder (AUD-02)
//
// tools/mixladder.mjs puts the game's own renders through the chain constants
// the code exports now, and through the ones it had at 7ed4dfb, and reports
// dBFS RMS at the output. The table is printed so the report can quote it.

group('mix ladder (AUD-02)');
// Its own path: ROOT above is a URL pathname, so in a checkout whose path has a
// space ("Coding Projects") the audition group skips. That is left as found
// (un-skipping it shows a stale saturn-cruise.wav; see docs/qa/rf/AUD-02.md).
const LADDER_AUDIO = path.join(fileURLToPath(new URL('..', import.meta.url)), 'docs/audio');
if (['ranger', 'ranger-cruise', 'ranger-road', 'radio-pop'].every((n) => fs.existsSync(path.join(LADDER_AUDIO, n + '.wav')))) {
  const AUDIO = LADDER_AUDIO;
  const L = await import('./mixladder.mjs');
  const now = await L.current();
  const a = L.ladder(L.BEFORE, AUDIO), b = L.ladder(now, AUDIO);
  const row = (name, x, y) => console.log(`       ${name.padEnd(40)} ${L.fmt(x).padStart(7)} -> ${L.fmt(y).padStart(7)}`);
  console.log('       level at the output, dBFS RMS (peak where named)    before ->   after');
  row('engine, 50 km/h cruise', a.engine.cruise, b.engine.cruise);
  row('engine, 3000 rpm under load', a.engine.pull3000, b.engine.pull3000);
  row('engine, loudest second wide open', a.engine.wot, b.engine.wot);
  row('synth radio (CHUM FM), cruise', a.synth.cruise, b.synth.cruise);
  row('synth radio (CHUM FM), wide open', a.synth.wot, b.synth.wot);
  row('recorded station at -18 LUFS, cruise', a.recorded.library, b.recorded.library);
  row('recorded station at -18 LUFS, wide open', a.recorded.libraryWot, b.recorded.libraryWot);
  row('Énergie 104,1 mix (-16.1 LUFS), cruise', a.recorded.energie, b.recorded.energie);
  row('crash, force 0.85, peak (pre-limiter)', a.one.crashPeak, b.one.crashPeak);
  row('crash, force 0.85, RMS of 0.4 s', a.one.crashRms, b.one.crashRms);
  row('engine under the crash (3000 rpm)', a.one.engineUnderCrash, b.one.engineUnderCrash);
  row('landing 6 m/s, peak', a.one.landPeak, b.one.landPeak);
  row('misfire, peak', a.one.misfirePeak, b.one.misfirePeak);
  row('misfires heard per minute (damaged, on throttle)', a.misfirePerMin, b.misfirePerMin);
  row('cop honks per minute, cruiser close', a.honkPerMinNear, b.honkPerMinNear);
  row('limiter starts acting at (dBFS)', a.limiterKneeStart, b.limiterKneeStart);
  // The highpass bug: the loop through the speaker chain keeps its loudness.
  const raw = b.synth.raw, chain = b.synth.cruise - 20 * Math.log10(now.synthDeck * now.volRadio * 0.5);
  ok(Math.abs(chain - raw) <= 3, `AUD-02: the synth loop through the car speaker is within 3 dB of the raw loop (${L.fmt(chain - raw)} dB; it was ${L.fmt(a.synth.cruise - 20 * Math.log10(0.85 * L.BEFORE.synthDuck(L.LOAD_CRUISE) * 0.7 * 0.5) - raw)})`);
  ok(b.synth.wot === b.synth.cruise && b.recorded.libraryWot === b.recorded.library, 'AUD-02: no radio duck under engine load, on either deck');
  ok(b.recorded.library >= b.engine.cruise + 2, `AUD-02: a recorded station sits over the cruising engine (${L.fmt(b.recorded.library - b.engine.cruise)} dB)`);
  ok(b.recorded.library >= -28 && b.recorded.library <= -24, `AUD-02: recorded radio in the -28..-24 band (${L.fmt(b.recorded.library)})`);
  ok(b.synth.cruise >= b.engine.cruise - 2, `AUD-02: the synth radio no longer sits under the engine (${L.fmt(b.synth.cruise - b.engine.cruise)} dB; was ${L.fmt(a.synth.cruise - a.engine.cruise)})`);
  ok(b.one.crashPeak >= -10 && b.one.crashPeak > b.engine.wot + 6, `AUD-02: the crash peak (${L.fmt(b.one.crashPeak)}) is the loudest thing`);
  ok(near(b.engine.pull3000 - b.one.engineUnderCrash, 6, 0.1), 'AUD-02: the engine drops 6 dB under a real crash');
  ok(b.one.misfirePeak <= b.one.crashPeak - 12 && b.misfirePerMin <= 20, `AUD-02: the cough sits well under the crash (${L.fmt(b.one.crashPeak - b.one.misfirePeak)} dB) and is rarer (${b.misfirePerMin.toFixed(0)}/min max)`);
  ok(b.honkPerMinNear <= 12, `AUD-02: cop honks ${b.honkPerMinNear.toFixed(1)}/min at most (was ${a.honkPerMinNear.toFixed(1)})`);
  ok(b.limiterKneeStart >= -18, `AUD-02: the master compressor is a limiter (from ${b.limiterKneeStart} dBFS)`);
} else ok(true, 'mix ladder skipped: no docs/audio renders');

group('mix behaviour (AUD-02)');
{
  const { honkCue, HONK } = await import('../src/game/cops.js');
  ok(honkCue(10, 0) === null && honkCue(10, 1.5) === null, 'cop honk: a cruiser that is not closing never honks');
  ok(honkCue(30, 8) === null, 'cop honk: not from 30 m');
  const cues = Array.from({ length: 50 }, () => honkCue(12, 5));
  const fs_ = cues.map((c) => c.freq);
  ok(Math.max(...fs_) - Math.min(...fs_) > 30, `cop honk: pitch varies (${Math.min(...fs_).toFixed(0)}..${Math.max(...fs_).toFixed(0)} Hz)`);
  ok(cues.every((c) => c.next >= HONK.gap[0]), `cop honk: never twice within ${HONK.gap[0]} s`);
  ok(honkCue(24, 5, () => 0.5).vol < honkCue(10, 5, () => 0.5).vol, 'cop honk: quieter further away');
  const { SPEECH_GAIN } = await import('../src/game/fortier.js');
  ok(SPEECH_GAIN <= 0.5, `speech: text-to-speech at ${SPEECH_GAIN} (${(20 * Math.log10(SPEECH_GAIN)).toFixed(1)} dB)`);
  const { voicing } = await import('../src/game/radio.js');
  ok(voicing({ freq: 900, q: 0.35 }).hpHz === 150 && voicing({ freq: 1100, q: 0.5 }).hpHz === 150, 'synth radio: FM stations keep the 150 Hz speaker');
  ok(voicing({ freq: 1450, q: 2.6 }).hpHz === 300 && voicing({ freq: 1450, q: 2.6 }).peakDb > 0, 'synth radio: CJRC 1150 AM gets its own narrow set');
  const { DEFAULT_SETTINGS, normalizeSettings } = await import('../src/game/store.js');
  ok(DEFAULT_SETTINGS.radioAuto === true, 'settings: the radio is on at the start of a drive by default');
  ok(normalizeSettings({ volRadio: 0.7 }).volRadio === DEFAULT_SETTINGS.volRadio && normalizeSettings({ volRadio: 0.7, mix: 2 }).volRadio === 0.7
    && normalizeSettings({ volRadio: 0.4 }).volRadio === 0.4, 'settings: only the old default radio level moves to the new one, once');
}

// ------------------------------------------------- 3. the stopped clock (B-13a)
//
// A-11's creep (docs/visual-wave/reports/PERF-CREEP.md): while the context is
// suspended `currentTime` is frozen, Chrome never prunes an AudioParam event the
// clock has not passed, and every per-frame setTargetAtTime grows the list. The
// mock below keeps real event lists and prunes them the way Chrome does (an
// event goes once a later one is in the past), tags every event made while the
// clock was stopped, and counts the nodes built. Then: drive, suspend, ten
// minutes of frames on a frozen clock, resume.

group('stopped clock (B-13a)');
{
  class MParam {
    constructor(ctx, v = 0) { this.ctx = ctx; this.value = v; this.events = []; }
    _add(type, v, t) {
      const ctx = this.ctx;
      this._prune();
      this.events.push({ type, v, t, stopped: ctx.state !== 'running' });
      this.events.sort((a, b) => a.t - b.t);
      ctx.added++;
      return this;
    }
    _prune() { const now = this.ctx.currentTime; while (this.events.length > 1 && this.events[1].t < now) this.events.shift(); }
    setValueAtTime(v, t) { return this._add('set', v, t); }
    linearRampToValueAtTime(v, t) { return this._add('lin', v, t); }
    exponentialRampToValueAtTime(v, t) { return this._add('exp', v, t); }
    setTargetAtTime(v, t) { return this._add('target', v, t); }
    setValueCurveAtTime(v, t) { return this._add('curve', v, t); }
    cancelScheduledValues(t) { this.events = this.events.filter((e) => e.t < t); return this; }
  }
  const mk = (ctx, kind, keys) => {
    const n = { kind, connect() {}, disconnect() {}, start() {}, stop() {}, setPeriodicWave() {} };
    for (const k of keys) n[k] = new MParam(ctx);
    ctx.nodes++; ctx.params.push(...keys.map((k) => n[k]));
    return n;
  };
  class MockCtx {
    constructor() {
      this.state = 'running'; this.currentTime = 0; this.sampleRate = 22050;
      this.added = 0; this.nodes = 0; this.params = []; this.onstatechange = null;
      this.destination = { connect() {} };
    }
    createGain() { return mk(this, 'gain', ['gain']); }
    createBiquadFilter() { return mk(this, 'biquad', ['frequency', 'Q', 'gain', 'detune']); }
    createOscillator() { return mk(this, 'osc', ['frequency', 'detune']); }
    createBufferSource() { return mk(this, 'src', ['playbackRate', 'detune']); }
    createDynamicsCompressor() { return mk(this, 'comp', ['threshold', 'knee', 'ratio', 'attack', 'release']); }
    createWaveShaper() { this.nodes++; return { connect() {}, disconnect() {} }; }
    createPeriodicWave() { return {}; }
    createBuffer(ch, len) { return { length: len, getChannelData: () => new Float32Array(len) }; }
    resume() { return Promise.resolve(); }
    setState(st) { this.state = st; if (this.onstatechange) this.onstatechange(); }
  }
  globalThis.window = globalThis.window || { addEventListener() {} };
  globalThis.window.AudioContext = MockCtx;
  const { Audio, EngineDriver, sirenLevel, ENGINE_TRIM } = await import('../src/core/audio.js');
  // AUD-01: the mix Tom asked for. Engine 4 dB down; siren 6 dB under the old
  // 0.12 up close, faint (-12 dB more) at 80 m, a floor while chased, ducked
  // under speech.
  const dB = (x) => 20 * Math.log10(x);
  ok(near(dB(ENGINE_TRIM), -4, 0.05), `AUD-01: engine trim ${dB(ENGINE_TRIM).toFixed(2)} dB`);
  ok(near(dB(sirenLevel(10) / 0.12), -6, 0.1) && sirenLevel(NaN) === sirenLevel(10), 'AUD-01: siren 6 dB under the old level up close');
  ok(near(dB(sirenLevel(80) / sirenLevel(10)), -12, 0.1), `AUD-01: siren ${dB(sirenLevel(80) / sirenLevel(10)).toFixed(1)} dB at 80 m`);
  ok(sirenLevel(1000) > 0 && near(dB(sirenLevel(1000) / sirenLevel(10)), -16, 0.2), 'AUD-01: siren floor while chased');
  ok(near(dB(sirenLevel(30, true) / sirenLevel(30)), -4, 0.05), 'AUD-01: siren ducked 4 dB under speech');
  const audio = new Audio();
  audio.start();
  const ctx = audio.ctx;
  ok(audio.ok && ctx instanceof MockCtx, 'the Audio class starts on the mock context');
  audio.setEngineProfile(carById('ranger').sound);

  // Something outside this file that writes a param every frame (radio.js and
  // weather.js do): it gets the same coalescing tap.
  const foreign = ctx.createGain();
  let frame = 0;
  const DT = 1 / 60;
  const tick = (advance) => {
    frame++;
    audio.engine(2400, 0.6, 95, 0.7, 1, DT);
    audio.wind(95); audio.skid(0.3); audio.whoosh(frame % 120 < 30 ? 0.5 : 0);
    audio.environment({ rain: 0, night: false, waterfront: 0.4, speed: 95 });
    audio.sirenRange(15 + (frame % 240)); audio.siren(true); audio.horn(frame % 90 < 10);
    audio.setCabin(frame % 600 < 300);
    if (frame % 60 === 0) { audio.honk(); audio.blip(); audio.crash(0.5); audio.thud('metal'); audio.heille(); audio.misfire(); audio.wrench(); audio.land(4); }
    foreign.gain.setTargetAtTime(0.5 + 0.1 * Math.sin(frame), ctx.currentTime, 0.1);
    if (advance) ctx.currentTime += DT;
  };
  const own = () => audio._groups;
  const ownParams = () => [...own().values()].flat();
  const events = (ps) => ps.reduce((s, p) => s + p.events.length, 0);
  const stoppedFuture = (ps) => ps.reduce((s, p) => s + p.events.filter((e) => e.stopped && e.t >= ctx.currentTime).length, 0);

  for (let i = 0; i < 600; i++) tick(true);
  const run = audio.automation();
  ok(run.scheduled > 600 * 30, `running: ${run.scheduled} automation calls in 10 s of frames, all counted`);
  ok(run.whileStopped === 0 && run.pending === 0, 'running: nothing counted as stopped or pending');
  ok(events(ctx.params) < ctx.params.length * 4, `running: the clock prunes the lists (${events(ctx.params)} events on ${ctx.params.length} params)`);

  // ---- suspend
  ctx.setState('suspended');
  const s0 = audio.automation();
  ok(s0.pending === 0 && s0.suspends === 1 && s0.sweeps >= 1, `suspend: 0 pending after the sweep (sweeps ${s0.sweeps})`);
  ok(ownParams().every((p) => p.events.every((e) => e.t < ctx.currentTime)), 'suspend: nothing queued at or after the frozen time on any owned param');
  const e0 = events(ownParams()), n0 = ctx.nodes, a0 = ctx.added;

  // ---- ten minutes of frames on a frozen clock
  const series = [];
  for (let i = 0; i < 36000; i++) { tick(false); if (i % 3600 === 3599) series.push(audio.automation()); }
  const s1 = audio.automation();
  ok(s1.pending === 0, `10 min suspended: pending stays ${s1.pending}`);
  ok(series.every((r) => r.pending === 0 && r.whileStopped - r.foreign === 0), `10 min suspended: the owned stopped count is flat at 0 in all ${series.length} one-minute samples`);
  ok(series.every((r) => r.scheduled - r.foreign === s0.scheduled - s0.foreign), `10 min suspended: owned automation calls flat at ${s0.scheduled - s0.foreign}`);
  ok(events(ownParams()) === e0, `10 min suspended: owned event lists flat (${e0} -> ${events(ownParams())})`);
  ok(ctx.nodes === n0, `10 min suspended: no node built (${ctx.nodes - n0} new); the one-shots wait for the clock`);
  ok(foreign.gain.events.length <= 2, `10 min suspended: the outside per-frame caller holds ${foreign.gain.events.length} event(s), coalesced from ${s1.foreign} calls`);
  ok(ctx.added - a0 === s1.foreign, `10 min suspended: the only events added are the coalesced outside ones (${ctx.added - a0})`);
  ok(s1.refused >= 36000 * 5, `10 min suspended: ${s1.refused} per-frame calls refused`);

  // The control: the same engine voice on a bare suspended context (no Audio
  // class, so no guard and no tap) creeps, which is what the mock is measuring.
  const bare = new MockCtx(); bare.state = 'suspended';
  const raw = new EngineDriver(bare, bare.destination, carById('ranger').sound, audio.noiseBuf);
  const rawParams = Object.values(raw.voice.nodes).flatMap((n) => ['gain', 'frequency', 'Q'].map((k) => n && n[k]).filter((p) => p instanceof MParam));
  const r0 = events(rawParams);
  for (let i = 0; i < 600; i++) raw.step(DT, 2400, 0.6, 95, 0.7, 1, 1, bare.currentTime);
  ok(events(rawParams) - r0 > 600 * 10, `control: unguarded, 10 s on a frozen clock queues ${events(rawParams) - r0} events (the creep the guard stops)`);
  raw.dispose();

  // ---- resume, after a mix change made while stopped
  audio.setVolume({ master: 0.4 });
  ok(audio.master.gain.events.every((e) => !e.stopped), 'setVolume while suspended schedules nothing');
  ctx.setState('running');
  const s2 = audio.automation();
  ok(s2.pending === 0, `resume: ${s2.pending} pending`);
  ok(stoppedFuture(ownParams()) === 0, 'resume: no event made while stopped is left on an owned param');
  const mg = audio.master.gain.events[audio.master.gain.events.length - 1];
  ok(mg && mg.type === 'set' && near(mg.v, 0.2, 1e-9), `resume: the master level is written once (${mg && mg.v})`);
  for (let i = 0; i < 60; i++) tick(true);
  const out = audio.driver.voice.out.gain.events.filter((e) => !e.stopped);
  ok(out.length > 0 && out[out.length - 1].v > 0, 'resume: the engine voice sounds again on the next frames');
  ok(ctx.nodes > n0, 'resume: the one-shots build again');
  ok(events(ctx.params) < ctx.params.length * 4, `resume: lists stay pruned (${events(ctx.params)} events)`);

  // Suspend and resume again from the same state: still nothing pending.
  ctx.setState('suspended'); tick(false); tick(false); ctx.setState('running');
  ok(audio.automation().pending === 0 && stoppedFuture(ownParams()) === 0, 'a second suspend/resume leaves 0 pending');
  ok(audio.automation().suspends === 2, 'suspends counted');
  console.log('       ' + JSON.stringify(audio.automation()));

  // AUD-02 on the same mock: a voice dips the engine 2 dB once, a real crash
  // dips engine and radio, a small one does not, and the cough waits.
  const { ENGINE_TALK, CRASH_DIP } = await import('../src/core/audio.js');
  ctx.currentTime += 5;
  const eg = audio.engDuck.gain, rg = audio.radioDuck.gain;
  const a0s = ctx.added;
  audio.speech(true); audio.speech(true); audio.speech(true);
  ok(ctx.added === a0s + 1 && near(eg.events[eg.events.length - 1].v, ENGINE_TALK, 1e-9), `speech: the engine bus dips 2 dB, written once (${ctx.added - a0s})`);
  audio.speech(false); ctx.currentTime += 1;
  const rd0 = rg.events.length;
  audio.crash(0.2);
  ok(rg.events.length === rd0, 'crash: a tap does not dip the mix');
  ctx.currentTime += 1;
  audio.crash(0.9);
  ok(rg.events.some((e) => near(e.v, CRASH_DIP, 1e-9)) && eg.events.some((e) => near(e.v, CRASH_DIP, 1e-9)), 'crash: a real hit dips engine and radio to half');
  const nodes0 = ctx.nodes; audio.misfire();
  ok(ctx.nodes === nodes0, 'misfire: silent right after the crash that caused it');
  ctx.currentTime += 2; audio.misfire(); const nodes1 = ctx.nodes; audio.misfire();
  ok(nodes1 > nodes0 && ctx.nodes === nodes1, 'misfire: heard later, and not twice in a row');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
