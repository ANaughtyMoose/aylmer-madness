// AUD-02: the mix ladder, measured in plain node.
//
// The harness runs Chrome muted and records gains, not levels, so this puts
// the game's own offline renders (docs/audio/*.wav: the engine through master
// 0.5 and the limiter, the raw synth radio loops, the road file with its
// landing and crash) through the game's own chain constants, with the Web Audio
// biquad formulas (RBJ, as the Web Audio spec gives them: lowpass/highpass Q in
// dB, peaking Q linear), and reports dBFS RMS at the output. RMS of a full
// band programme stands in for LUFS (within a couple of dB for these sources);
// the recorded stations are arithmetic from their programme loudness. The
// limiter's own gain reduction on the summed bus is not modelled.
import path from 'node:path';
import { readWav, slice, peak, rms } from './wav.mjs';

const dB = (x) => 20 * Math.log10(Math.max(1e-12, x));

/** One Web Audio BiquadFilterNode, applied offline. */
export function biquad(x, sampleRate, { type, freq, Q = 1, gain = 0 }) {
  const w0 = 2 * Math.PI * freq / sampleRate, cw = Math.cos(w0), sw = Math.sin(w0);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass' || type === 'highpass') {
    const alpha = sw / (2 * Math.pow(10, Q / 20));
    if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
    else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
    a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
  } else if (type === 'peaking') {
    const A = Math.pow(10, gain / 40), alpha = sw / (2 * Q);
    b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
  } else if (type === 'bandpass') {
    const alpha = sw / (2 * Q);
    b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
  } else throw new Error('biquad type ' + type);
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// The load main.js hands the radio at a 50 km/h cruise (pedal about 0.3) and
// flat out: drivePedal * 0.85 + min(0.2, kmh / 400).
export const LOAD_CRUISE = 0.3 * 0.85 + 50 / 400, LOAD_WOT = 1;

// The mix as it was at 7ed4dfb, for the before column.
export const BEFORE = {
  label: 'before (7ed4dfb)',
  engineTrim: Math.pow(10, -4 / 20),
  synthDeck: 0.85,
  synthDuck: (load) => 1 - Math.min(0.42, load * 0.42),
  // CHUM FM: its { freq: 900, q: 0.35 } written into the 150 Hz highpass.
  synthChain: [{ type: 'highpass', freq: 900, Q: 0.35 }, { type: 'lowpass', freq: 5000, Q: 0.7 }],
  recordedOut: 0.8,
  recordedDuck: (load) => 1 - load * 0.12,
  volRadio: 0.7,
  crashGain: 1, landGain: 1, crashDip: 1,
  misfireGain: 0.36, misfirePerMin: 60 / 1.05,      // cars.js 0.4..1.7 s, every one heard
  honkPerMinNear: 60 / 2.6,                         // every 2.6 s within 40 m
  limiterKneeStart: -14 - 22 / 2,
};

/** The mix in the code now, read from the modules themselves. */
export async function current() {
  const A = await import('../src/core/audio.js');
  const R = await import('../src/game/radio.js');
  const RR = await import('../src/game/recorded-radio.js');
  const S = await import('../src/game/store.js');
  const C = await import('../src/game/cops.js');
  const v = R.voicing({ freq: 900, q: 0.35 });
  const fake = { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} };
  A.makeMasterComp({ createDynamicsCompressor: () => fake });
  return {
    label: 'after (AUD-02)',
    engineTrim: A.ENGINE_TRIM,
    synthDeck: R.SYNTH_DECK,
    synthDuck: () => 1,
    synthChain: [{ type: 'peaking', freq: v.peakHz, Q: v.peakQ, gain: v.peakDb },
      { type: 'highpass', freq: v.hpHz, Q: 0.7 }, { type: 'lowpass', freq: v.lpHz, Q: 0.7 }],
    recordedOut: 0.8,
    recordedDuck: () => 1,
    recordedDuckTalk: RR.RECORDED_DUCK.dialogue,
    volRadio: S.DEFAULT_SETTINGS.volRadio,
    crashGain: A.CRASH_GAIN, landGain: A.LAND_GAIN, crashDip: A.CRASH_DIP, engineTalk: A.ENGINE_TALK,
    misfireGain: A.MISFIRE_GAIN, misfirePerMin: 60 / ((A.MISFIRE_GAP[0] + A.MISFIRE_GAP[1]) / 2),
    honkPerMinNear: 60 / ((C.HONK.gap[0] + C.HONK.gap[1]) / 2),
    limiterKneeStart: fake.threshold.value - fake.knee.value / 2,
    sirenNear: A.sirenLevel(10), sirenFar: A.sirenLevel(80),
  };
}

/** Levels at the output, dBFS RMS (peak where named), for one parameter set. */
export function ladder(m, audioDir) {
  const W = (n) => readWav(path.join(audioDir, n + '.wav'));
  const cruise = W('ranger-cruise'), pull = W('ranger'), road = W('ranger-road'), pop = W('radio-pop');
  const sr = pull.sampleRate;
  // The loudest second of the wide-open pull.
  let wot = 0;
  for (let t = 0; t + 1 <= pull.seconds; t += 0.1) wot = Math.max(wot, rms(slice(pull.samples, sr, t, t + 1)));
  const trim = dB(m.engineTrim);
  const engine = {
    cruise: dB(rms(cruise.samples)) + trim,
    pull3000: dB(rms(slice(pull.samples, sr, 9.4, 10.3))) + trim,
    wot: dB(wot) + trim,
  };
  let y = pop.samples;
  for (const f of m.synthChain) y = biquad(y, pop.sampleRate, f);
  const synthRaw = dB(rms(y)) + dB(m.synthDeck * m.volRadio * 0.5);
  const synth = {
    raw: dB(rms(pop.samples)),
    cruise: synthRaw + dB(m.synthDuck(LOAD_CRUISE)),
    wot: synthRaw + dB(m.synthDuck(LOAD_WOT)),
  };
  const rec = (lufs, load) => lufs + dB(m.recordedOut * m.recordedDuck(load) * m.volRadio * 0.5);
  const recorded = {
    library: rec(-18, LOAD_CRUISE), libraryWot: rec(-18, LOAD_WOT),
    energie: rec(-16.1, LOAD_CRUISE), energieWot: rec(-16.1, LOAD_WOT),
  };
  const crashSeg = slice(road.samples, sr, 15.2, 15.6), landSeg = slice(road.samples, sr, 14.4, 14.7);
  const one = {
    crashPeak: dB(peak(crashSeg) * m.crashGain), crashRms: dB(rms(crashSeg) * m.crashGain),
    landPeak: dB(peak(landSeg) * m.landGain),
    engineUnderCrash: engine.pull3000 + dB(m.crashDip),
    misfirePeak: dB(m.misfireGain * 0.5),
  };
  return { engine, synth, recorded, one, misfirePerMin: m.misfirePerMin, honkPerMinNear: m.honkPerMinNear, limiterKneeStart: m.limiterKneeStart };
}

export const fmt = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
