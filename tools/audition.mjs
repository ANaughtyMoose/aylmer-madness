// Render the engine auditions to docs/audio/*.wav.
//
//   python3 -m http.server 8133 --bind 127.0.0.1 &          (from the repo root)
//   "Google Chrome" --headless=new --remote-debugging-port=9222 --use-angle=swiftshader
//   node tools/audition.mjs [baseUrl]
//
// Web Audio only exists in a browser, so the rendering happens in the page
// (tools/audition.html -> src/core/audition.js on an OfflineAudioContext) and
// comes back as base64 16-bit PCM. Everything printed here is measured off the
// samples that were written, not off the synth's intentions.
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:8133';
// Cache-buster: the page and the modules it pulls change under this script all
// the time, and a stale AUDITION object is a confusing way to fail.
const url = `${base}/tools/audition.html?t=${Date.now()}`;
const OUT = path.resolve(new URL('..', import.meta.url).pathname, 'docs/audio');
const CARS = ['ranger', 'civic', 'saturn', 'sunfire'];

const list = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(list.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id; pending.set(n, { res, rej });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
};
await send('Runtime.enable');
await send('Page.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wav16(pcm, sampleRate) {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);            // PCM
  head.writeUInt16LE(1, 22);            // mono
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

// --- measurement (the same maths tools/smoke_audio.mjs runs on the files) ----

function slice(pcm, sampleRate, t0, t1) {
  const a = Math.max(0, Math.floor(t0 * sampleRate)), b = Math.min(pcm.length / 2, Math.floor(t1 * sampleRate));
  const out = new Float32Array(Math.max(0, b - a));
  for (let i = 0; i < out.length; i++) out[i] = pcm.readInt16LE((a + i) * 2) / 32768;
  return out;
}

// Autocorrelation pitch: the period of the pulse train, not the loudest
// harmonic. Takes the *shortest* lag within 10% of the best peak, so the
// cylinder-to-cylinder unevenness (one engine cycle) does not read as the note.
export function dominantHz(x, sampleRate, loHz = 15, hiHz = 400) {
  const n = x.length;
  if (n < 64) return 0;
  let mean = 0; for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = x[i] - mean;
  let e0 = 0; for (let i = 0; i < n; i++) e0 += y[i] * y[i];
  if (e0 < 1e-12) return 0;
  const loLag = Math.max(2, Math.floor(sampleRate / hiHz));
  const hiLag = Math.min(n - 2, Math.ceil(sampleRate / loHz));
  const r = new Float32Array(hiLag + 1);
  for (let lag = loLag; lag <= hiLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += y[i] * y[i + lag];
    r[lag] = s / e0;
  }
  let best = 0;
  for (let lag = loLag; lag <= hiLag; lag++) best = Math.max(best, r[lag]);
  if (best <= 0.15) return 0;
  for (let lag = loLag; lag <= hiLag; lag++) {
    if (r[lag] >= best * 0.90 && r[lag] > r[lag - 1] && r[lag] >= r[lag + 1]) {
      // Parabolic interpolation on the peak for a fraction of a sample.
      const a = r[lag - 1], b = r[lag], c = r[lag + 1];
      const d = (a - c) / (2 * (a - 2 * b + c) || 1e-9);
      return sampleRate / (lag + Math.max(-1, Math.min(1, d)));
    }
  }
  return sampleRate / r.indexOf(best);
}

// --------------------------------------------------------------------------

let failed = null;
const report = {};
try {
  await send('Page.navigate', { url });
  await sleep(900);
  for (let i = 0; i < 60; i++) {
    if (await evaluate('!!window.AUDITION')) break;
    await sleep(150);
  }
  if (!await evaluate('!!window.AUDITION')) throw new Error(`page never loaded (${url}); is the server up?`);

  fs.mkdirSync(OUT, { recursive: true });
  for (const car of CARS) {
    report[car] = {};
    for (const kind of ['pull', 'cruise']) {
      const r = await evaluate(`AUDITION.render(${JSON.stringify(car)}, ${JSON.stringify(kind)})`);
      const pcm = Buffer.from(r.pcm, 'base64');
      const name = kind === 'pull' ? `${car}.wav` : `${car}-cruise.wav`;
      const file = path.join(OUT, name);
      fs.writeFileSync(file, wav16(pcm, r.sampleRate));
      const kb = Math.round(fs.statSync(file).size / 1024);

      const idleHz = kind === 'pull' ? dominantHz(slice(pcm, r.sampleRate, 1.2, 2.4), r.sampleRate) : null;
      const holdHz = r.plateau ? dominantHz(slice(pcm, r.sampleRate, r.plateau[0] + 0.25, r.plateau[1] - 0.05), r.sampleRate) : null;
      const cruiseHz = kind === 'cruise' ? dominantHz(slice(pcm, r.sampleRate, 3.0, 4.2), r.sampleRate) : null;
      let topHz = 0;
      if (kind === 'pull') {
        for (let t = 3.2; t < 8.9; t += 0.25) {
          topHz = Math.max(topHz, dominantHz(slice(pcm, r.sampleRate, t, t + 0.25), r.sampleRate));
        }
      }
      report[car][kind] = {
        file: `docs/audio/${name}`, kb, peak: +r.peak.toFixed(3),
        rms: r.rms.map((v) => +v.toFixed(4)),
        idleHz: idleHz && +idleHz.toFixed(1), holdHz: holdHz && +holdHz.toFixed(1),
        cruiseHz: cruiseHz && +cruiseHz.toFixed(1), topHz: +topHz.toFixed(1),
        shifts: r.shifts, plateauRpm: r.plateauRpm, cyl: r.cyl,
        gears: r.marks.filter((m, i) => i === 0 || m[2] !== r.marks[i - 1][2]).map((m) => `${m[0]}s g${m[2]} ${m[1]}rpm`),
      };
      console.log(`${name.padEnd(20)} ${String(kb).padStart(4)} KB  peak ${r.peak.toFixed(3)}  ` +
        (idleHz ? `idle ${idleHz.toFixed(1)} Hz  ` : '') +
        (holdHz ? `@${r.plateauRpm}rpm ${holdHz.toFixed(1)} Hz  ` : '') +
        (cruiseHz ? `50km/h ${cruiseHz.toFixed(1)} Hz  ` : '') +
        (topHz ? `peak-note ${topHz.toFixed(1)} Hz  ` : '') +
        `shifts ${r.shifts}`);
      console.log('   rms/s ' + r.rms.map((v) => v.toFixed(3)).join(' '));
      if (report[car][kind].gears.length) console.log('   gears ' + report[car][kind].gears.join('  '));
    }
  }
  // The road, once, in the truck. Tyres, gravel, grass, the springs and two
  // impacts — everything the engine auditions above deliberately leave out.
  {
    const r = await evaluate("AUDITION.render('ranger', 'road')");
    const pcm = Buffer.from(r.pcm, 'base64');
    const file = path.join(OUT, 'ranger-road.wav');
    fs.writeFileSync(file, wav16(pcm, r.sampleRate));
    const kb = Math.round(fs.statSync(file).size / 1024);
    report.ranger.road = {
      file: 'docs/audio/ranger-road.wav', kb, peak: +r.peak.toFixed(3),
      rms: r.rms.map((v) => +v.toFixed(4)), shifts: r.shifts,
      surfaces: r.marks.map((m) => `${m[0]}s ${m[1]} ${m[2]}km/h`),
    };
    console.log(`ranger-road.wav       ${String(kb).padStart(4)} KB  peak ${r.peak.toFixed(3)}  shifts ${r.shifts}`);
    console.log('   rms/s ' + r.rms.map((v) => v.toFixed(3)).join(' '));
    console.log('   surfaces ' + report.ranger.road.surfaces.join('  '));
  }

  // CKOI, eight seconds a style.
  report.radio = {};
  for (const style of await evaluate('Promise.resolve(AUDITION.styles || [])')) {
    const r = await evaluate(`AUDITION.radio(${JSON.stringify(style)})`);
    const pcm = Buffer.from(r.pcm, 'base64');
    const name = `radio-${style}.wav`;
    fs.writeFileSync(path.join(OUT, name), wav16(pcm, r.sampleRate));
    const kb = Math.round(fs.statSync(path.join(OUT, name)).size / 1024);
    report.radio[style] = { file: `docs/audio/${name}`, kb, bpm: r.bpm, peak: +r.peak.toFixed(3), rms: r.rms.map((v) => +v.toFixed(4)), title: r.title, artist: r.artist };
    console.log(`${name.padEnd(20)} ${String(kb).padStart(4)} KB  ${r.bpm} bpm  peak ${r.peak.toFixed(3)}  “${r.title}”, ${r.artist}`);
  }

  fs.writeFileSync(path.join(OUT, 'audition.json'), JSON.stringify(report, null, 1));
  console.log('\nwrote', path.join(OUT, 'audition.json'));
} catch (e) {
  failed = e;
  console.log('AUDITION ERROR:', e.message);
}
for (const e of errors) console.log('[page error]', e);
await send('Page.close').catch(() => {});
ws.close();
process.exit(failed || errors.length ? 1 : 0);
