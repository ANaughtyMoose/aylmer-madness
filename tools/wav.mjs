// A very small WAV reader and the two measurements the engine work needs:
// autocorrelation pitch (the period of the pulse train) and a short-frame RMS
// envelope. No dependencies — this runs under plain node.
import fs from 'node:fs';

export function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(file + ': not a RIFF/WAVE file');
  }
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    const body = b.subarray(pos + 8, pos + 8 + size);
    if (id === 'fmt ') {
      fmt = {
        format: body.readUInt16LE(0), channels: body.readUInt16LE(2),
        sampleRate: body.readUInt32LE(4), bits: body.readUInt16LE(14),
      };
    } else if (id === 'data') data = body;
    pos += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error(file + ': missing fmt/data');
  if (fmt.format !== 1 || fmt.bits !== 16) throw new Error(file + ': expected 16-bit PCM');
  const n = data.length / 2 / fmt.channels;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = data.readInt16LE(i * 2 * fmt.channels) / 32768;
  return { ...fmt, samples: x, seconds: n / fmt.sampleRate, bytes: b.length };
}

export function slice(x, sampleRate, t0, t1) {
  const a = Math.max(0, Math.floor(t0 * sampleRate));
  const b = Math.min(x.length, Math.floor(t1 * sampleRate));
  return x.subarray(a, Math.max(a, b));
}

export function peak(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}

export function rms(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return x.length ? Math.sqrt(s / x.length) : 0;
}

// RMS in fixed frames — the envelope you look at to see the shifts.
export function rmsFrames(x, sampleRate, frameMs = 25) {
  const n = Math.max(1, Math.round((frameMs / 1000) * sampleRate));
  const out = [];
  for (let a = 0; a + n <= x.length; a += n) out.push(rms(x.subarray(a, a + n)));
  return { frames: out, frameSec: n / sampleRate };
}

/**
 * The fundamental of a pulse train by autocorrelation.
 *
 * A spectral peak would find whichever harmonic the exhaust bandpass happens to
 * favour; what we want is the *repetition rate*, which for a four-stroke four
 * at 750 rpm is 25 Hz whether or not there is any energy at 25 Hz. Cylinder-to-
 * cylinder unevenness makes the whole engine cycle (a quarter of that) correlate
 * slightly better, so we take the shortest lag within 10% of the best peak.
 */
export function dominantHz(x, sampleRate, loHz = 15, hiHz = 400) {
  const n = x.length;
  if (n < 64) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = x[i] - mean;
  let e0 = 0;
  for (let i = 0; i < n; i++) e0 += y[i] * y[i];
  if (e0 < 1e-12) return 0;
  const loLag = Math.max(2, Math.floor(sampleRate / hiHz));
  const hiLag = Math.min(n - 2, Math.ceil(sampleRate / loHz));
  if (hiLag <= loLag) return 0;
  const r = new Float32Array(hiLag + 2);
  for (let lag = loLag; lag <= hiLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += y[i] * y[i + lag];
    r[lag] = s / e0;
  }
  let best = 0, bestLag = loLag;
  for (let lag = loLag; lag <= hiLag; lag++) if (r[lag] > best) { best = r[lag]; bestLag = lag; }
  if (best <= 0.15) return 0;
  for (let lag = loLag + 1; lag < hiLag; lag++) {
    if (r[lag] >= best * 0.90 && r[lag] > r[lag - 1] && r[lag] >= r[lag + 1]) {
      const a = r[lag - 1], b = r[lag], c = r[lag + 1];
      const d = (a - c) / (2 * (a - 2 * b + c) || 1e-9);
      return sampleRate / (lag + Math.max(-1, Math.min(1, d)));
    }
  }
  return sampleRate / bestLag;
}

/**
 * Dips in an RMS envelope: runs where the level falls below `ratio` of the
 * local level either side. Returns [{ start, end, seconds, depth }].
 */
export function findDips(frames, frameSec, ratio = 0.72, minSec = 0.10, maxSec = 0.55) {
  const n = frames.length;
  const win = Math.max(2, Math.round(0.35 / frameSec));
  // The reference has to be the quieter *shoulder*, not the loudest frame
  // nearby: a wide-open pull is a rising ramp, and against a one-sided maximum
  // every frame of a ramp looks like a dip. min(left peak, right peak) is only
  // large when the frame really does sit in a notch.
  const ref = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let l = 0, r = 0;
    for (let k = Math.max(0, i - win); k < i; k++) l = Math.max(l, frames[k]);
    for (let k = i + 1; k < Math.min(n, i + win + 1); k++) r = Math.max(r, frames[k]);
    ref[i] = Math.min(l, r);
  }
  const dips = [];
  let i = 0;
  while (i < n) {
    if (ref[i] > 1e-5 && frames[i] < ref[i] * ratio) {
      let j = i, lo = Infinity, hi = 0;
      while (j < n && ref[j] > 1e-5 && frames[j] < ref[j] * ratio) {
        lo = Math.min(lo, frames[j]); hi = Math.max(hi, ref[j]); j++;
      }
      const secs = (j - i) * frameSec;
      if (secs >= minSec && secs <= maxSec) {
        dips.push({
          start: +(i * frameSec).toFixed(3), end: +(j * frameSec).toFixed(3),
          seconds: +secs.toFixed(3), depth: +(lo / hi).toFixed(3),
        });
      }
      i = j + 1;
    } else i++;
  }
  return dips;
}
