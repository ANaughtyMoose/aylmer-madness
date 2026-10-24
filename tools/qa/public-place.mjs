#!/usr/bin/env node
// Is it a public place?  node tools/qa/public-place.mjs --task=<id> | --coords=x,z[;x,z…] | --file=<json> | --selftest
//
// Plan v2, B-15; hard rule 5. Nothing game-visible goes at a real private
// address beyond the cast's existing place keys: every collectible, ramp,
// shortcut, event, hide spot, secret and toy a task places must be at least
// MIN_M (30 m) from every private home in references/places.
//
// The private list lives in the private project folder, read through
// CMP_REF_ROOT (default ../aylmer-madness, see tools/qa/lib/poses.mjs):
//   - the home folders: a slug that carries a house number (« 12-rue-x »,
//     « rue-x-12 »), plus every slug in the README's « Homes » table;
//   - each home's position: core-refs.json `building_latlng`, else the mean
//     of its Street View capture positions (streetview-index.json).
// Positions go through the game's own projection (src/game/mapdata.js
// latLonToXZ), so a task gives game metres (x, z) as it places things.
//
// It prints only « pass » or « FAIL », the distance to the nearest home and
// the task's own label for the point. It never prints, logs or writes a slug,
// an address or a home's position. Exit 0 all pass, 1 any fail, 2 no list.
//
// Inputs:
//   --task=<id>     reads docs/qa/rf/<id>.places.json
//   --file=<path>   a JSON list: [{ "label": "ramp 1", "x": 120, "z": -40 }, …]
//                   ({ "lat", "lng" } also accepted in place of x, z)
//   --coords=x,z;x,z
//   --selftest      a point 5 m from a home must fail, a point 100 m from
//                   every home must pass, and neither prints an address
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MIN_M = 30;
const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };

// The game's projection, read out of the generated map (not imported: 4 MB).
function projection() {
  const all = readFileSync(path.join(ROOT, 'src/game/mapdata.js'), 'utf8');
  const at = all.indexOf('export function latLonToXZ');
  const head = at >= 0 ? all.slice(at, at + 400) : '';
  const m = head.match(/latLonToXZ\(lat, lon\)\s*\{\s*return \[\(lon - \((-?[\d.]+)\)\) \* ([\d.]+), -\(lat - \((-?[\d.]+)\)\) \* ([\d.]+)\];/);
  if (!m) throw new Error('mapdata.js latLonToXZ not found');
  const [lonc, mx, latc, mz] = m.slice(1).map(Number);
  return (lat, lon) => [(lon - lonc) * mx, -(lat - latc) * mz];
}

// [{ x, z }] for every private home. Never returned to a caller that prints.
export function privateHomes(refRoot = process.env.CMP_REF_ROOT || path.join(ROOT, '../aylmer-madness')) {
  const dir = path.join(path.resolve(refRoot), 'references/places');
  if (!existsSync(dir)) return null;
  const slugs = new Set(readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+[a-z]?-|-\d+[a-z]?$/.test(d.name)).map((d) => d.name));
  try {
    const readme = readFileSync(path.join(dir, 'README.md'), 'utf8');
    const sec = readme.split(/^## /m).find((s) => /^Homes\b/.test(s)) || '';
    for (const m of sec.matchAll(/^\|\s*([a-z0-9][a-z0-9-]+)/gm)) if (m[1] !== 'place' && existsSync(path.join(dir, m[1]))) slugs.add(m[1]);
  } catch { /* no README: the numbered folders are the list */ }
  const proj = projection();
  const json = (f) => { try { return JSON.parse(readFileSync(path.join(dir, '_manifest', f), 'utf8')); } catch { return null; } };
  const core = json('core-refs.json') || {};
  const sv = json('streetview-index.json') || {};
  const coreAll = [...(core.places || []), ...(core.retired || [])];
  const homes = [];
  let missing = 0;
  for (const s of slugs) {
    const c = coreAll.find((p) => p.slug === s && Array.isArray(p.building_latlng));
    let ll = c ? c.building_latlng : null;
    if (!ll) {
      const crops = (sv.crops || []).filter((x) => x.slug === s && Number.isFinite(x.lat) && Number.isFinite(x.lng));
      if (crops.length) ll = [crops.reduce((a, x) => a + x.lat, 0) / crops.length, crops.reduce((a, x) => a + x.lng, 0) / crops.length];
    }
    if (!ll) { missing++; continue; }
    const [x, z] = proj(ll[0], ll[1]);
    homes.push({ x, z });
  }
  return { homes, missing, proj };
}

export function nearest(homes, x, z) {
  let d = Infinity;
  for (const h of homes) d = Math.min(d, Math.hypot(h.x - x, h.z - z));
  return d;
}

function points(proj) {
  const task = arg('task'), file = arg('file'), coords = arg('coords');
  let list = [];
  if (coords) list = coords.split(';').filter(Boolean).map((p, i) => { const [x, z] = p.split(',').map(Number); return { label: `point ${i + 1}`, x, z }; });
  const f = file || (task ? path.join(ROOT, 'docs/qa/rf', `${task}.places.json`) : null);
  if (f) {
    if (!existsSync(f)) { console.log(`public-place: no coordinate list at ${path.relative(ROOT, f)}`); process.exit(2); }
    const raw = JSON.parse(readFileSync(f, 'utf8'));
    list = list.concat((Array.isArray(raw) ? raw : raw.points || []).map((p, i) => {
      if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) { const [x, z] = proj(p.lat, p.lng); return { label: p.label || `point ${i + 1}`, x, z }; }
      return { label: p.label || `point ${i + 1}`, x: Number(p.x), z: Number(p.z) };
    }));
  }
  return list;
}

function main() {
  const P = privateHomes();
  if (!P || !P.homes.length) { console.log('public-place: no private place list (CMP_REF_ROOT/references/places); cannot check'); process.exit(2); }
  const { homes, proj } = P;
  console.log(`public-place: ${homes.length} private homes loaded${P.missing ? `, ${P.missing} without a position` : ''}; pass at >= ${MIN_M} m`);
  if (process.argv.includes('--selftest')) {
    let bad = 0;
    // 5 m east of a home, by construction: must fail.
    const h = homes[0];
    const near = nearest(homes, h.x + 5, h.z);
    const f1 = near < MIN_M;
    console.log(`  planted 5 m from a home: ${f1 ? 'FAIL' : 'pass'} ${near.toFixed(1)} m (expected FAIL)`);
    if (!f1) bad++;
    // A point at least 100 m from every home: walk out from the first one.
    let far = null;
    for (let r = 100; r <= 2000 && !far; r += 50) for (let a = 0; a < 16 && !far; a++) {
      const x = h.x + r * Math.cos(a * Math.PI / 8), z = h.z + r * Math.sin(a * Math.PI / 8);
      if (nearest(homes, x, z) >= 100) far = { x, z };
    }
    const dFar = far ? nearest(homes, far.x, far.z) : 0;
    console.log(`  planted >= 100 m from every home: ${dFar >= MIN_M ? 'pass' : 'FAIL'} ${dFar.toFixed(1)} m (expected pass)`);
    if (!(dFar >= MIN_M)) bad++;
    console.log(bad ? 'selftest FAILED' : 'selftest ok');
    process.exit(bad ? 1 : 0);
  }
  const list = points(proj);
  if (!list.length) { console.log('public-place: no points given (--task, --file or --coords)'); process.exit(2); }
  let fails = 0;
  for (const p of list) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { console.log(`  FAIL ${p.label}: not a coordinate`); fails++; continue; }
    const d = nearest(homes, p.x, p.z);
    const okp = d >= MIN_M;
    if (!okp) fails++;
    console.log(`  ${okp ? 'pass' : 'FAIL'} ${p.label}: ${d.toFixed(1)} m from the nearest private home`);
  }
  console.log(fails ? `${fails} of ${list.length} too close to a private home` : `all ${list.length} public`);
  process.exit(fails ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
