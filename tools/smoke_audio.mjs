// Engine-audio smoke test:  node tools/smoke_audio.mjs
//
// Two halves. The first runs the gearbox in plain node — no browser, no audio —
// and checks the arithmetic that decides what rpm the synth is asked for. The
// second reads the rendered auditions in docs/audio/ and measures them:
//
//   * the Ranger idles at 25 Hz (750 rpm / 30) and every car reads 100 Hz where
//     the programme holds it at 3000 rpm,
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
  ok(near(gb.rpm, 750, 1), `idle is ${gb.rpm.toFixed(0)} rpm at a standstill`);
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

  // Every car has a box, and the Civic revs further than the Ranger.
  ok(CARS.every((c) => c.drive && c.drive.gears.length >= 3), 'every car has gear ratios');
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
        ok(near(idleHz, 25, 3), `Ranger idle is ${idleHz.toFixed(1)} Hz (25 ± 3)`, String(idleHz));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
