// Render a car's engine to a buffer, offline, so it can be listened to without
// playing the game — see tools/audition.mjs, which drives this in a headless
// Chrome and writes docs/audio/*.wav.
//
// The whole point is that this is NOT a second implementation: it builds the
// same EngineDriver on an OfflineAudioContext and feeds it from the same
// Gearbox the game's tick() uses. If the WAV sounds wrong, the game sounds
// wrong.
import { EngineDriver, RoadDriver, SURFACE, makeMasterComp, makeNoise, fireCrash, fireLand } from './audio.js';
import { Gearbox } from '../game/gearbox.js';

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The two audition programmes, as a function of time in seconds:
 *
 *   'pull'   12 s — idle, a wide-open pull through first/second/third, a
 *                   plateau held at 3000 rpm, an overrun coast, back to idle.
 *   'cruise'  8 s — a steady 50 km/h, which is where the box settles into third
 *                   and the body starts to boom.
 *
 * Returns { seconds, preroll, at(t) -> [kmh, throttle] } — `preroll` seconds of
 * silent gearbox stepping happen before t=0 so the box starts in the right gear.
 */
export function programme(spec, kind = 'pull') {
  const gb = new Gearbox(spec.drive);
  const d = gb.d;
  const cruiseGear = Math.min(3, d.gears.length);

  if (kind === 'cruise') {
    return {
      seconds: 8, preroll: 2.5, name: 'cruise',
      at(t, out) {
        out[0] = 50;
        // A hand that is not quite still: 0.25-0.40 of throttle, slowly.
        out[1] = 0.32 + 0.08 * Math.sin(t * 0.9);
        return out;
      },
    };
  }

  // Where the pull ends: safely past the 2->3 change, and inside the car's
  // actual top speed.
  const shift23 = gb.kmhAt(d.shiftUp, Math.min(2, d.gears.length));
  const vEnd = Math.min(shift23 * 1.12, spec.topSpeed * 3.6 * 0.95);
  const T0 = 2.6, T1 = 9.0;
  const A = (vEnd / 3.6) / (T1 - T0);              // m/s², constant-force pull
  const plateauRpm = Math.min(3000, d.redline * 0.82);
  const vHold = gb.kmhAt(plateauRpm, cruiseGear);
  const COAST = 8.0;                               // m/s² off the throttle

  return {
    seconds: 12, preroll: 0, name: 'pull', plateauRpm,
    plateau: [9.4, 10.3],                          // the 3000 rpm window
    pull: [T0, T1],
    at(t, out) {
      if (t < T0) { out[0] = 0; out[1] = 0; return out; }            // idle
      if (t < T1) {                                                   // WOT pull
        out[0] = A * (t - T0) * 3.6; out[1] = 1; return out;
      }
      if (t < 9.4) {                                                  // lift
        // Still 0.6 of throttle: back off any further and the box would take
        // the light-throttle upshift and the plateau would land in fourth.
        out[0] = lerp(vEnd, vHold, (t - T1) / 0.4); out[1] = 0.6; return out;
      }
      if (t < 10.3) { out[0] = vHold; out[1] = 0.6; return out; }     // plateau
      if (t < 11.45) {                                                // overrun
        out[0] = Math.max(6, vHold - COAST * (t - 10.3) * 3.6); out[1] = 0; return out;
      }
      if (t < 11.7) {                                                 // stop
        out[0] = Math.max(0, lerp(vHold - COAST * 1.15 * 3.6, 0, (t - 11.45) / 0.25));
        out[1] = 0; return out;
      }
      out[0] = 0; out[1] = 0; return out;                             // idle again
    },
  };
}

/**
 * Render one audition. `spec` is a CARS entry (it needs `.sound` and `.drive`).
 * Resolves to { samples: Float32Array, sampleRate, seconds, marks } where
 * `marks` is a per-tick log of what the gearbox was doing — the RMS numbers in
 * tools/smoke_audio.mjs are checked against it.
 */
export async function renderAudition(spec, kind = 'pull', sampleRate = 22050) {
  if (kind === 'road') return renderRoadAudition(spec, sampleRate);
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC) throw new Error('no OfflineAudioContext here');
  const prog = programme(spec, kind);
  const ctx = new OAC(1, Math.round(prog.seconds * sampleRate), sampleRate);

  const master = ctx.createGain();
  master.gain.value = 0.5;
  const comp = makeMasterComp(ctx);
  master.connect(comp);
  comp.connect(ctx.destination);

  const driver = new EngineDriver(ctx, master, spec.sound, makeNoise(ctx, 2));
  const gb = new Gearbox(spec.drive);

  const STEP = 1 / 120;
  const out = [0, 0];
  // Silent pre-roll: let the box find the gear it would already be in.
  for (let t = 0; t < prog.preroll; t += STEP) {
    prog.at(0, out);
    gb.update(STEP, out[0], out[1]);
  }
  const marks = [];
  for (let i = 0; i * STEP < prog.seconds; i++) {
    const t = i * STEP;
    prog.at(t, out);
    gb.update(STEP, out[0], out[1]);
    // Load is what the engine is being asked for: the pedal, plus a bit of the
    // work it is doing holding the car at speed.
    const load = Math.min(1, out[1] * 0.85 + Math.min(0.2, out[0] / 400));
    driver.step(STEP, gb.rpm, load, out[0], out[1], gb.clutch, 1, t);
    if (i % 12 === 0) marks.push([+t.toFixed(3), Math.round(gb.rpm), gb.gear, +gb.clutch.toFixed(2), Math.round(out[0])]);
  }

  const buf = await ctx.startRendering();
  return {
    samples: buf.getChannelData(0), sampleRate, seconds: prog.seconds,
    marks, shifts: gb.shifts, kind: prog.name,
    plateau: prog.plateau || null, plateauRpm: prog.plateauRpm || null,
    cyl: (spec.sound && spec.sound.cyl) || 4,
  };
}

// ---------------------------------------------------------------- the road
//
// Everything the engine audition cannot show you: what the tyres do when the
// surface under them changes, what the springs do about a washboard, and what
// hitting something sounds like. Same drivers, same parameters, same graph the
// game builds — the only thing this file adds is a script for them.
//
//   0.0  idle on the gravel lot at the drive-in
//   2.0  pull away on tarmac, 0 to 70, three gearchanges
//   5.6  70 km/h on GRAVEL — crunch, and the springs working
//   7.8  70 km/h on GRASS — the same speed, muffled
//   9.8  back on tarmac and up to 130
//  13.2  lift: overrun, pops and burble, coasting to 90
//  14.4  a landing off a kerb
//  15.2  and then hitting something
export const ROAD_SCRIPT = [
  // [t, kmh, throttle, surface]
  [0.0, 0, 0, 'gravel'], [2.0, 0, 1, 'asphalt'], [5.4, 70, 1, 'asphalt'],
  [5.6, 70, 0.28, 'gravel'], [7.6, 70, 0.28, 'gravel'],
  [7.8, 70, 0.28, 'grass'], [9.6, 70, 0.28, 'grass'],
  [9.8, 70, 1, 'asphalt'], [13.2, 130, 1, 'asphalt'],
  [13.4, 128, 0, 'asphalt'], [16.0, 60, 0, 'asphalt'],
];

export async function renderRoadAudition(spec, sampleRate = 22050) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC) throw new Error('no OfflineAudioContext here');
  const seconds = 16;
  const ctx = new OAC(1, Math.round(seconds * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.5;
  const comp = makeMasterComp(ctx);
  master.connect(comp);
  comp.connect(ctx.destination);

  const noise = makeNoise(ctx, 2);
  const driver = new EngineDriver(ctx, master, spec.sound, noise);
  const road = new RoadDriver(ctx, master, noise);
  road.setProfile(spec.sound);
  const gb = new Gearbox(spec.drive);

  // Piecewise-linear on the script; the surface is a step, not a ramp.
  const at = (t) => {
    let i = 0;
    while (i < ROAD_SCRIPT.length - 1 && t >= ROAD_SCRIPT[i + 1][0]) i++;
    const a = ROAD_SCRIPT[i], b = ROAD_SCRIPT[Math.min(i + 1, ROAD_SCRIPT.length - 1)];
    const u = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 0;
    return [lerp(a[1], b[1], u), lerp(a[2], b[2], u), a[3]];
  };
  // A kerb thump at 14.4 and a solid hit at 15.2, on the master exactly as
  // main.js would fire them.
  fireLand(ctx, master, 14.4, 6.0, noise, SURFACE.asphalt);
  fireCrash(ctx, master, 15.2, 0.85, noise);

  const STEP = 1 / 120;
  const contact = { kmh: 0, kind: 'asphalt', rough: 0, air: false, bump: 0 };
  const marks = [];
  let wasKind = '';
  for (let i = 0; i * STEP < seconds; i++) {
    const t = i * STEP;
    const [kmh, throttle, kind] = at(t);
    gb.update(STEP, kmh, throttle);
    const load = Math.min(1, throttle * 0.85 + Math.min(0.2, kmh / 400));
    driver.step(STEP, gb.rpm, load, kmh, throttle, gb.clutch, 1, t);
    contact.kmh = kmh; contact.kind = kind;
    contact.rough = kind === 'gravel' ? 0.35 : kind === 'grass' ? 0.08 : 0;
    // One real spring spike a second on the rough stuff, so the thump that a
    // kerb or a driveway lip fires is in here too and not only the patter.
    contact.bump = contact.rough > 0.1 && (i % 120) === 60 ? -1.4 : 0;
    road.step(STEP, kmh, load, contact, 1, t);
    if (kind !== wasKind) { marks.push([+t.toFixed(2), kind, Math.round(kmh)]); wasKind = kind; }
  }

  const buf = await ctx.startRendering();
  return {
    samples: buf.getChannelData(0), sampleRate, seconds,
    marks, shifts: gb.shifts, kind: 'road',
    plateau: null, plateauRpm: null,
    cyl: (spec.sound && spec.sound.cyl) || 4,
  };
}

// 16-bit mono PCM, base64 — small enough to hand back through the DevTools
// protocol in one string.
export function toPcm16Base64(samples) {
  const n = samples.length;
  const bytes = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) {
    let v = samples[i];
    v = v < -1 ? -1 : v > 1 ? 1 : v;
    const s = Math.round(v * 32767);
    bytes[i * 2] = s & 0xff;
    bytes[i * 2 + 1] = (s >> 8) & 0xff;
  }
  let out = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CH, bytes.length)));
  }
  return btoa(out);
}

// Peak and per-second RMS, so the harness can print an envelope without
// shipping the samples anywhere.
export function envelope(samples, sampleRate, seconds) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const rms = [];
  for (let s = 0; s < Math.ceil(seconds); s++) {
    const a = s * sampleRate, b = Math.min(samples.length, a + sampleRate);
    let sum = 0;
    for (let i = a; i < b; i++) sum += samples[i] * samples[i];
    rms.push(b > a ? Math.sqrt(sum / (b - a)) : 0);
  }
  return { peak, rms };
}
