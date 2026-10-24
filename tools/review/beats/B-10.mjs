// B-10 script beat: the job cards graded to the job's hour.
// A plan runs it as { "do": "script", "id": "B-10" } (or --only B-10).
//
// In-task (before B-12b wires main.js): for every main mission, the live
// AYLMER.cinema opens the card twice, once as the game shows it today (the
// shared painting, alternateur's own) and once with show({ job: def }), the
// B-10 path. Each card's art box is captured as a PNG and measured: mean
// luminance, mean RGB, and the share of pixels that moved against the
// ungraded card and against alternateur's card (look-diff's "changed%":
// any channel more than 1/255 apart; a pose is "unchanged" under 1%).
// The PNGs go to the private folder, by absolute path:
//   references/review/rf-b10/cards/{before,after}/<id>__card.png
// so `node tools/qa/look-diff.mjs --a-dir=<before> --b-dir=<after> --out=<...>`
// reads them as poses.
//
// After integration (B-12b): the harness mission beats' own card shots
// (nuittim, golfcart, arcbache against alternateur) show the grade.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { decodePng, writePng } from '../../qa/lib/png.mjs';

const OUT = path.join(os.homedir(), 'Desktop', 'Coding Projects', 'aylmer-madness', 'references', 'review', 'rf-b10', 'cards');

async function capture(page, id, spec) {
  const ok = await page.evaluate(`(async () => {
    const A = window.AYLMER, M = await import('/src/game/missions.js');
    const def = M.ALL_MISSIONS.find((m) => m.id === ${JSON.stringify(id)});
    if (A.cinema.active) A.cinema.hide();
    const opts = { title: def ? def.title : ${JSON.stringify(id)}, body: '', note: ' ' };
    ${spec.job ? 'opts.job = def;' : `opts.art = ${JSON.stringify(spec.art)};`}
    A.cinema.show(opts);
    const layer = document.querySelector('#cinematic .cinema-art');
    for (let i = 0; i < 100 && !/url\\(/.test(layer.style.backgroundImage); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 250));
    const b = layer.getBoundingClientRect(), root = document.getElementById('cinematic');
    return JSON.stringify({ loaded: /url\\(/.test(layer.style.backgroundImage), art: root.dataset.art, grade: root.dataset.grade || 'day',
      rect: { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(Math.min(b.height, innerHeight)) } });
  })()`);
  const info = JSON.parse(ok);
  const r = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...info.rect, scale: 1 } });
  const img = decodePng(Buffer.from(r.data, 'base64'));
  return { ...info, img };
}

function stats(img) {
  let L = 0, R = 0, G = 0, B = 0;
  const n = img.w * img.h;
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i] / 255, g = img.data[i + 1] / 255, b = img.data[i + 2] / 255;
    L += 0.2126 * r + 0.7152 * g + 0.0722 * b; R += r; G += g; B += b;
  }
  return { L: +(L / n).toFixed(4), R: +(R / n).toFixed(4), G: +(G / n).toFixed(4), B: +(B / n).toFixed(4) };
}

function changedPct(a, b) {
  if (a.w !== b.w || a.h !== b.h) return 100;
  let c = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > 1) c++;
  }
  return +(100 * c / (a.w * a.h)).toFixed(2);
}

export async function run(page, assert) {
  const ids = JSON.parse(await page.evaluate(`(async () => {
    const C = await import('/src/game/campaign.js');
    return JSON.stringify([...C.MAIN.flatMap((m) => m.ids), C.FINALE]); })()`));
  fs.mkdirSync(path.join(OUT, 'before'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'after'), { recursive: true });
  const cards = {};
  const imgs = {};
  for (const id of ids) {
    const before = await capture(page, id, { art: id === 'alternateur' ? 'alternateur' : 'home' });
    const after = await capture(page, id, { job: true });
    await page.shot(`B-10-card-${id}`);
    writePng(path.join(OUT, 'before', `${id}__card.png`), before.img);
    writePng(path.join(OUT, 'after', `${id}__card.png`), after.img);
    imgs[id] = after.img;
    cards[id] = { art: after.art, grade: after.grade, loaded: before.loaded && after.loaded, before: stats(before.img), after: stats(after.img), changedVsUngradedPct: changedPct(before.img, after.img) };
    assert(cards[id].loaded, `${id}: both card paintings loaded`);
  }
  await page.evaluate('window.AYLMER.cinema.hide(), 1');
  // The noon reference is a day job's card: the shared painting as painted.
  const ref = cards.russellroyal || cards.stvincent;
  for (const id of ids) cards[id].lumVsNoon = +(cards[id].after.L / ref.after.L).toFixed(3);
  for (const id of ['nuittim', 'golfcart', 'arcbache']) {
    if (!cards[id]) continue;
    cards[id].changedVsAlternateurPct = changedPct(imgs[id], imgs.alternateur);
    assert(cards[id].changedVsAlternateurPct > 1, `${id} card differs from alternateur's (${cards[id].changedVsAlternateurPct}% changed, unchanged is under 1%)`);
    assert(cards[id].changedVsUngradedPct > 1, `${id} card differs from the ungraded painting (${cards[id].changedVsUngradedPct}% changed)`);
  }
  assert(cards.nuittim && cards.nuittim.lumVsNoon <= 0.25, `nuittim card mean luminance <= 25% of the noon card (${cards.nuittim?.lumVsNoon})`);
  assert(cards.golfcart && cards.golfcart.grade === 'rain', `golfcart card has the rain grade (${cards.golfcart?.grade})`);
  assert(cards.golfcart && cards.golfcart.after.B >= cards.golfcart.after.R, 'golfcart card leans cool');
  assert(cards.arcbache && cards.arcbache.after.R >= 1.1 * cards.arcbache.after.B, 'arcbache (dusk) card leans warm');
  return { cards, refCard: cards.russellroyal ? 'russellroyal' : 'stvincent', pngDir: OUT };
}
