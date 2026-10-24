#!/usr/bin/env node
// Look diff: compares two capture runs (tags) pose by pose.
//
//   node tools/qa/look-diff.mjs --task=V1-01 --a=before --b=after [--unchanged-ok] [--scope=pose,pose] [--identity]
//   node tools/qa/look-diff.mjs --a-dir=<dir> --b-dir=<dir> --out=<dir>
//
// Runs are folders of <pose>__<env>.png written by capture.mjs / vis-check.mjs:
// <report root>/<task or _adhoc>/<tag>/. Output goes to <report root>/<task>/look-diff/<a>-vs-<b>/:
//   <pose>__<env>.sheet.png   before | after | 2009 reference (the reference is the pose's `ref`)
//   <pose>__<env>.mask.png    pixel-diff mask: grey = unchanged, red = a channel moved by more than 1/255
//   thumbs.png                every "after" shot at 160x100 (the thumbnail test)
//   look-diff.json            all numbers below
// Numbers per shot (and printed as a table):
//   clipHi%  pixels with any channel >= 254 (blown highlights), clipLo% pixels with every channel <= 2
//   regions  mean RGB of the pose's tagged regions (poses.json `regions`: lawn, road, wall, sky as
//            [x0,y0,x1,y1] fractions of the shot) against assets/look/palette.json when it exists
//            (entry.srgbTarget [r,g,b] or "#rrggbb", +/- entry.tolerance, default 8 per channel; the
//            tag maps to the palette key lawn|grass, road|asphalt, wall|siding|brick, sky|sky_zenith)
//   changed% share of pixels whose max channel differs by more than 1, and the max channel diff
// Fails (exit 1) when: clipHi% > 0.5 at noon in the "after" run; a region mean is outside the palette
// tolerance; a pose NOT in --scope changed by more than 1% of its pixels (default scope is empty, so
// every pose counts: pass --scope=<poses the task may change>);
// in --identity mode the clip and palette checks are reported as notes only: identity is about pixels, not about the look; --identity and any shot differs by
// more than 1/255 anywhere (the "identity proof" the pure-tooling tasks owe).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, arg, done } from './lib/rig.mjs';
import { reportRoot, refRoot, loadPoses } from './lib/poses.mjs';
import { readPng, writePng, blank, fit, paste, label, rect, resize } from './lib/png.mjs';

const task = arg('task', null);
const rr = reportRoot(task);
const aTag = arg('a', 'before'), bTag = arg('b', 'after');
const aDir = path.resolve(arg('a-dir', null) || path.join(rr, aTag));
const bDir = path.resolve(arg('b-dir', null) || path.join(rr, bTag));
const out = path.resolve(arg('out', null) || path.join(rr, 'look-diff', `${aTag}-vs-${bTag}`));
const scope = new Set(String(arg('scope', '')).split(',').filter(Boolean));
const identity = !!arg('identity', false);
const P = loadPoses();
fs.mkdirSync(out, { recursive: true });

// ---------------------------------------------------------------- palette
const palettePath = path.join(ROOT, 'assets/look/palette.json');
let palette = null;
try { palette = JSON.parse(fs.readFileSync(palettePath, 'utf8')); } catch {}
const parseRgb = (v) => {
  if (Array.isArray(v) && v.length >= 3) return v.slice(0, 3).map(Number);
  if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v)) { const h = v.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
  if (v && typeof v === 'object') return parseRgb(v.srgbTarget ?? v.rgb ?? v.mean ?? v.target);
  return null;
};
const KEYS = { lawn: ['lawn', 'grass'], road: ['road', 'asphalt'], wall: ['wall', 'siding', 'brick'], sky: ['sky', 'sky_zenith', 'skyZenith', 'sky_horizon'] };
function paletteFor(tag) {
  if (!palette) return null;
  const pools = [palette, palette.materials, palette.entries, palette.palette].filter((x) => x && typeof x === 'object');
  for (const k of KEYS[tag] || [tag]) for (const pool of pools) {
    const e = Array.isArray(pool) ? pool.find((x) => x && (x.id === k || x.name === k)) : pool[k];
    const rgb = e && parseRgb(e); if (rgb) return { key: k, rgb, tol: Number(e.tolerance ?? e.tol ?? 8) || 8 };
  }
  return null;
}

// -------------------------------------------------------------- references
const cache = path.join(rr, '.refcache'); fs.mkdirSync(cache, { recursive: true });
function refImage(rel) {
  if (!rel) return null;
  const src = path.join(refRoot(), rel);
  if (!fs.existsSync(src)) return null;
  const dst = path.join(cache, rel.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/\.[^.]+$/, '') + '.png');
  try {
    if (!fs.existsSync(dst)) execFileSync('sips', ['-s', 'format', 'png', '-Z', '1280', src, '--out', dst], { stdio: 'ignore' });   // macOS sips: jpeg -> png, no window
    return readPng(dst);
  } catch { return null; }
}

// ------------------------------------------------------------------ metrics
function clip(img) {
  let hi = 0, lo = 0; const d = img.data, n = img.w * img.h;
  for (let i = 0; i < d.length; i += 4) { if (d[i] >= 254 || d[i + 1] >= 254 || d[i + 2] >= 254) hi++; if (d[i] <= 2 && d[i + 1] <= 2 && d[i + 2] <= 2) lo++; }
  return { hi: +(hi * 100 / n).toFixed(3), lo: +(lo * 100 / n).toFixed(3) };
}
function regionMeans(img, regions) {
  const o = {};
  for (const [tag, r] of Object.entries(regions || {})) {
    const x0 = Math.round(r[0] * img.w), y0 = Math.round(r[1] * img.h), x1 = Math.round(r[2] * img.w), y1 = Math.round(r[3] * img.h);
    let s = [0, 0, 0], n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = (y * img.w + x) * 4; s[0] += img.data[k]; s[1] += img.data[k + 1]; s[2] += img.data[k + 2]; n++; }
    if (n) o[tag] = { mean: s.map((v) => +(v / n).toFixed(1)), rect: r };
  }
  return o;
}
function pixelDiff(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { sizeMismatch: [a.w, a.h, b.w, b.h], changedPct: 100, maxDiff: 255, mask: null };
  const mask = blank(a.w, a.h); let changed = 0, max = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > max) max = d;
    const g = (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3 * 0.35 + 20;
    if (d > 1) { changed++; mask.data[i] = 255; mask.data[i + 1] = Math.max(0, 80 - d); mask.data[i + 2] = Math.max(0, 80 - d); }
    else { mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = g; }
  }
  return { changedPct: +(changed * 100 / (a.w * a.h)).toFixed(3), maxDiff: max, mask };
}

// -------------------------------------------------------------------- run
const names = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort() : []);
const A = new Set(names(aDir)), B = names(bDir);
if (!B.length) { console.error(`no shots in ${bDir}`); done(2); }
if (!A.size) { console.error(`no shots in ${aDir}`); done(2); }
const rows = [], problems = [], thumbs = [];
const W = 640, H = 400, HEAD = 22;
for (const name of B) {
  if (!A.has(name)) { problems.push(`${name}: in ${bTag} but not in ${aTag}`); continue; }
  const [poseId, envId] = name.split('__');
  const pose = P.poses[poseId] || {};
  const a = readPng(path.join(aDir, name + '.png')), b = readPng(path.join(bDir, name + '.png'));
  const ref = refImage(pose.ref);
  const d = pixelDiff(a, b);
  const notes = [];
  const row = { shot: name, pose: poseId, env: envId, aSize: [a.w, a.h], bSize: [b.w, b.h], clipA: clip(a), clipB: clip(b), changedPct: d.changedPct, maxDiff: d.maxDiff, regions: {}, ref: pose.ref || null, refFound: !!ref, issues: [] };
  const ra = regionMeans(a, pose.regions), rb = regionMeans(b, pose.regions);
  for (const tag of Object.keys(rb)) {
    const pal = paletteFor(tag);
    const e = { before: ra[tag]?.mean, after: rb[tag].mean };
    if (pal) { e.palette = pal.key; e.target = pal.rgb; e.tolerance = pal.tol; e.delta = rb[tag].mean.map((v, i) => +(v - pal.rgb[i]).toFixed(1)); e.ok = e.delta.every((x) => Math.abs(x) <= pal.tol); if (!e.ok && envId === 'noon') (identity ? notes : row.issues).push(`${tag} mean ${rb[tag].mean.join(',')} is outside palette ${pal.key} ${pal.rgb.join(',')} +/-${pal.tol}`); }
    else e.palette = palette ? 'no matching entry' : 'assets/look/palette.json not present yet';
    row.regions[tag] = e;
  }
  if (envId === 'noon' && row.clipB.hi > 0.5) (identity ? notes : row.issues).push(`clipped highlights ${row.clipB.hi}% > 0.5% at noon`);
  if (!scope.has(poseId) && row.changedPct > 1 && !identity) row.issues.push(`${row.changedPct}% of pixels changed on a pose outside --scope`);
  if (identity && (d.maxDiff > 1 || d.sizeMismatch)) row.issues.push(`identity: max channel diff ${d.maxDiff}/255 (${row.changedPct}% of pixels differ by more than 1)`);
  if (d.sizeMismatch) row.issues.push('image sizes differ: ' + d.sizeMismatch.join(' '));
  // the sheet
  const sheet = blank(W * 3, H + HEAD, [12, 12, 12, 255]);
  paste(sheet, fit(a, W, H), 0, HEAD); paste(sheet, fit(b, W, H), W, HEAD);
  {   // the tagged regions, outlined on the AFTER panel so a wrong rectangle is visible
    const k = Math.min(W / b.w, H / b.h), nw = Math.round(b.w * k), nh = Math.round(b.h * k), ox = W + Math.floor((W - nw) / 2), oy = HEAD + Math.floor((H - nh) / 2);
    const RC = { lawn: [255, 230, 0], road: [255, 0, 255], wall: [0, 255, 255], sky: [255, 128, 0] };
    for (const [tag, r] of Object.entries(pose.regions || {})) { rect(sheet, ox + Math.round(r[0] * nw), oy + Math.round(r[1] * nh), ox + Math.round(r[2] * nw), oy + Math.round(r[3] * nh), RC[tag] || [255, 255, 255], 1); label(sheet, tag, ox + Math.round(r[0] * nw) + 2, oy + Math.round(r[1] * nh) + 2, 1, RC[tag] || [255, 255, 255]); }
  }
  if (ref) paste(sheet, fit(ref, W, H), W * 2, HEAD); else label(sheet, 'NO REFERENCE', W * 2 + 20, HEAD + H / 2, 3, [200, 200, 200], [12, 12, 12]);
  label(sheet, `${name}  BEFORE ${aTag}`, 4, 3, 2); label(sheet, `AFTER ${bTag}  clip ${row.clipB.hi}%  changed ${row.changedPct}%`, W + 4, 3, 2); label(sheet, '2009 REFERENCE', W * 2 + 4, 3, 2);
  writePng(path.join(out, name + '.sheet.png'), sheet);
  if (d.mask) writePng(path.join(out, name + '.mask.png'), d.mask);
  thumbs.push({ name, img: resize(fit(b, 160, 100), 160, 100) });
  row.notes = notes; rows.push(row);
}
// thumbnail test sheet
{
  const cols = Math.min(6, thumbs.length || 1), rws = Math.ceil(thumbs.length / cols), tw = 160, th = 100 + 11;
  const t = blank(cols * (tw + 4) + 4, rws * (th + 4) + 4, [12, 12, 12, 255]);
  thumbs.forEach((x, i) => { const cx = 4 + (i % cols) * (tw + 4), cy = 4 + Math.floor(i / cols) * (th + 4); paste(t, x.img, cx, cy); label(t, x.name.slice(0, 26), cx, cy + 100, 1); });
  writePng(path.join(out, 'thumbs.png'), t);
}
for (const n of A) if (!B.includes(n)) problems.push(`${n}: in ${aTag} but not in ${bTag}`);
for (const r of rows) for (const i of r.issues) problems.push(`${r.shot}: ${i}`);
const noteLines = rows.flatMap((r) => (r.notes || []).map((n) => `${r.shot}: ${n}`));

console.log(`look-diff ${aTag} -> ${bTag}: ${rows.length} shot(s)${identity ? ' (identity proof: max channel diff must be <= 1/255)' : ''}`);
console.log('shot'.padEnd(36), 'clipHi%'.padStart(8), 'clipLo%'.padStart(8), 'changed%'.padStart(9), 'maxDiff'.padStart(8), ' regions');
for (const r of rows) console.log(r.shot.padEnd(36), String(r.clipB.hi).padStart(8), String(r.clipB.lo).padStart(8), String(r.changedPct).padStart(9), String(r.maxDiff).padStart(8), ' ' + (Object.entries(r.regions).map(([k, v]) => `${k}=${v.after.map(Math.round).join(',')}`).join(' ') || '-'));
if (!palette) console.log('palette: assets/look/palette.json is not present yet (V0-05); region means are printed without a target');
const report = { schema: 'aylmer-look-diff', version: 1, when: new Date().toISOString(), task, a: { tag: aTag, dir: aDir }, b: { tag: bTag, dir: bDir }, identity, scope: [...scope], paletteFile: palette ? path.relative(ROOT, palettePath) : null, rows, problems, notes: noteLines, ok: !problems.length };
fs.writeFileSync(path.join(out, 'look-diff.json'), JSON.stringify(report, null, 1));
console.log(`wrote ${out}`);
if (problems.length) { console.log(`look-diff: ${problems.length} problem(s)`); for (const p of problems) console.log('  ' + p); }
else console.log('look-diff: ok');
if (noteLines.length) { console.log(`notes (not failures in --identity mode; ${noteLines.length}):`); for (const n of noteLines) console.log('  ' + n); }
done(problems.length ? 1 : 0);
