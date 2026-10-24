// B-11: the first launch, measured in a real headless page, and the contact
// sheet for Tom.
//
// Two ways in:
//   * As a script beat ({ "do": "script", "id": "B-11" }) after the harness has
//     booted: it reads the opening's stats and the live cast cards' log.
//   * Standalone (always through references/review/qa-slot.sh):
//       node tools/review/beats/B-11.mjs [--entry=index] [--out=<abs dir>] [--sheet]
//     It serves the worktree (CMP_SRV_PORT), starts headless Chrome
//     (CMP_CDP_PORT), clicks « Nouvelle partie » for real on a fresh profile,
//     follows the first film to control, then reloads the same profile (seen
//     now) for the quick New Game. With --sheet it writes the twelve frames
//     and their mean luma differences into --out (a private folder by
//     absolute path, never the worktree).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const READ = `(() => { const O = window.AYLMER && window.AYLMER.opening; if (!O) return null;
  return { stats: O.stats ? { ...O.stats, dts: undefined } : null, log: O.cast ? O.cast.log : [], variant: O.variant || null }; })()`;

export async function run(page, assert) {
  const r = await page.evaluate(READ);
  assert(r, 'window.AYLMER.opening is exposed');
  if (!r || !r.stats) return { exposed: !!r };
  if (r.stats.controlAt != null) assert(r.stats.controlAt <= 40, `first launch control at ${r.stats.controlAt} s (<= 40)`);
  return r;
}

// ---------------------------------------------------------------- standalone

const SHEET = [
  ['01-gate', 'menu'], ['02-S1-2.0', 2.0], ['03-S2-1.0', 5.5], ['04-S2-4.0', 8.5], ['05-S3-2.0', 11.5],
  ['06-S4-2.0', 16.0], ['07-S4-4.6', 18.6], ['08-S5-1.5', 21.5], ['09-S5-5.8', 25.8], ['10-S5-10.0', 30.0],
  ['11-control-0.5', 'c0.5'], ['12-control-2.0', 'c2.0'],
];

async function standalone() {
  const { startServer, startChrome, Page, ports, arg, done } = await import('../../qa/lib/rig.mjs');
  const { decodePng } = await import('../../qa/lib/png.mjs');
  const { srv, cdp } = ports();
  const entry = arg('entry', 'index');
  const out = arg('out', '');
  const sheet = process.argv.includes('--sheet');
  if (sheet && (!out || !path.isAbsolute(out) || /wt-rf-|wt-qr-/.test(out))) { console.log('FAIL --out must be an absolute private folder'); done(2); }
  if (sheet) fs.mkdirSync(out, { recursive: true });
  await startServer(srv);
  await startChrome({ gpu: !process.argv.includes("--nogpu"), port: cdp });
  const page = await Page.open(cdp);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ev = (x) => page.eval(x, 120000);
  const url = `http://127.0.0.1:${srv}/${entry}.html`;
  await page.send('Storage.clearDataForOrigin', { origin: `http://127.0.0.1:${srv}`, storageTypes: 'all' }).catch(() => {});
  const frames = [];
  const grab = async (name) => {
    const buf = await page.screenshot();
    if (sheet) fs.writeFileSync(path.join(out, name + '.png'), buf);
    const img = decodePng(buf);
    let sum = 0, n = 0;
    const L = new Float32Array((img.w >> 2) * (img.h >> 2));
    for (let y = 0, k = 0; y < img.h - 3; y += 4) for (let x = 0; x < img.w - 3; x += 4, k++) {
      const i = (y * img.w + x) * 4;
      L[k] = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]; sum += L[k]; n++;
    }
    frames.push({ name, luma: L, mean: sum / n });
  };
  const click = async () => {
    const r = await ev(`(() => { const b = document.getElementById('start').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'left', clickCount: 1 });
  };
  const toMenu = async () => {
    await page.send('Page.navigate', { url });
    for (let i = 0; i < 600; i++) { await sleep(200); if (await ev(`!!(window.AYLMER && window.AYLMER.G && document.getElementById('start').getBoundingClientRect().width)`).catch(() => false)) return; }
    throw new Error('no menu');
  };
  const follow = async (shots) => {
    const tClick = Date.now();
    await click();
    let st = null, idx = 0, controlWall = null, lastT = -1;
    const pending = shots ? shots.filter(([, t]) => typeof t === 'number') : [];
    while (Date.now() - tClick < 180000) {
      await sleep(60);
      const o = await ev(`(() => { const O = window.AYLMER.opening; return { a: O.active, T: O.T, v: O.variant, w: O.worldOk, mode: window.AYLMER.G.mode }; })()`).catch(() => null);
      if (!o) continue;
      if (o.a && o.T != null && idx < pending.length && o.T >= pending[idx][1] && o.T !== lastT) { lastT = o.T; await grab(pending[idx][0]); idx++; }
      if (!o.a) { controlWall = (Date.now() - tClick) / 1000; break; }
    }
    if (shots) {
      const c0 = Date.now();
      for (const [name, t] of shots.filter(([, t]) => typeof t === 'string' && t[0] === 'c')) {
        const wait = +t.slice(1) * 1000 - (Date.now() - c0);
        if (wait > 0) await sleep(wait);
        await grab(name);
      }
    }
    await sleep(2500);
    st = await ev(READ);
    const extra = await ev(`(() => { const G = window.AYLMER.G, v = G.veh; return { mode: G.mode, mission: G.mission ? G.mission.def.id : null,
      speed: v ? Math.hypot(v.vx || 0, v.vz || 0) : null, yaw: v ? v.yaw : null, x: v ? v.x : null, z: v ? v.z : null,
      chip: (document.querySelector('#tutchip, .tutchip, #tut')?.innerText || '').slice(0, 80),
      cinema: !!document.querySelector('#cinematic:not(.hidden)'), castcard: !!document.querySelector('#castcard.on') }; })()`).catch((e) => ({ err: String(e) }));
    return { controlWall, ...st, after: extra };
  };

  await toMenu();
  if (sheet) await grab('01-gate');
  const first = await follow(SHEET);
  const errors = page.errors.slice();
  await toMenu();
  const quick = await follow(null);
  const diffs = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].luma, b = frames[i].luma, n = Math.min(a.length, b.length);
    let d = 0; for (let k = 0; k < n; k++) d += Math.abs(a[k] - b[k]);
    diffs.push({ pair: frames[i - 1].name + ' -> ' + frames[i].name, meanAbs: +(d / n).toFixed(1) });
  }
  const res = { entry, first, quick, frames: frames.map((f) => ({ name: f.name, mean: +f.mean.toFixed(1) })), diffs, consoleErrors: errors.concat(page.errors.slice(errors.length)) };
  if (sheet) fs.writeFileSync(path.join(out, 'B-11-probe.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1));
  done(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) standalone().catch((e) => { console.error(e); process.exit(1); });
