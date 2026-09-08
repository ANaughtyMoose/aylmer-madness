#!/usr/bin/env node
// The named destinations, and the 18-job campaign that aims at them.
//
//   node tools/smoke_places.mjs
//
// Two things this pins, both of which were broken and neither of which any
// other suite could see:
//
//  1. THE SEVEN PLACES the plan called missing (docs/HANDOFF.md « What is next »
//     2). Six of them turned out to exist already under other keys — the list
//     was written before the Hull and Ottawa sectors landed — so what this
//     asserts is the state they have to STAY in: every one is in PLACES, every
//     one resolves onto real tarmac within a sane distance of the building it
//     names, every one sits inside its own sector's bounds, and the labels are
//     the 2004 spellings. The museum is the reason for that last clause: it was
//     labelled « Musée canadien de l'histoire », which is the 2013 rename.
//
//  2. THE CAMPAIGN MAPPING. `campaign.json`'s `to` fields are descriptive
//     French, not place keys, so nothing could resolve a destination; each job
//     now also carries `place`, a real PLACES key. Asserted here: all 18 exist,
//     no two consecutive jobs finish in the same spot (docs/VERIFY.md §4 — « the
//     destinations repeat » is NEXT.md §4's first complaint), and the whole
//     chain is drivable, i.e. no leg is longer than the map.
//
// Importing game/ottawa.js is what merges Hull and Ottawa into MAP — without it
// half these places have no road within a kilometre and the sector bounds do
// not exist. It costs a couple of seconds and eighteen megabytes of JSON.
import { readFileSync } from 'node:fs';
import '../src/game/ottawa.js';
import '../src/game/landmarks.js';
import { MAP } from '../src/game/mapdata.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';

let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

// resolvePlaces() only wants `nearestRoad`; buildWorld's version is the road
// graph's own and needs GL, so this is the same query straight off MAP.
const world = {
  nearestRoad(x, z) {
    let best = null, bd = Infinity;
    for (const r of MAP.roads) {
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
        const px = ax + ex * t, pz = az + ez * t;
        const d = Math.hypot(px - x, pz - z);
        if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(ex, ez), name: r.name }; }
      }
    }
    return best;
  },
};
resolvePlaces(world);

// Distance from a point to the nearest road of any name, metres.
function roadGap(x, z) {
  const r = world.nearestRoad(x, z);
  return r ? Math.hypot(r.x - x, r.z - z) : Infinity;
}

// ---------------------------------------------------------------- the sectors
//
// game/sectors.js slices the world by X: Aylmer west of the Hull seam, Hull to
// the Ottawa seam, Ottawa east of it, Chelsea north. A place that resolves into
// the wrong slice is loaded by the wrong sector and is simply not there when you
// drive to it, which is exactly the failure the coordinates have to rule out.
const SECTOR = {
  aylmer: { minX: -2600, maxX: 2600, minZ: -2000, maxZ: 1800 },
  hull:   { minX: 2540, maxX: 11374, minZ: -14500, maxZ: -330 },
  ottawa: { minX: 9800, maxX: 12160, minZ: -5750, maxZ: -330 },
};

// The seven, and what each one is being held to. `gap` is how far the marker may
// end up from the building it names — a house is metres from its own kerb, a
// mall is the width of its car park.
const SEVEN = [
  { key: 'russell',    sector: 'aylmer', gap: 40,  road: 'Rue Arial',
    label: '1 rue Arial (Russell)' },
  { key: 'abraham',    sector: 'aylmer', gap: 40,  road: 'Boulevard Wilfrid-Lavigne',
    label: '841 Wilfrid-Lavigne (Abraham)' },
  { key: 'gas',        sector: 'aylmer', gap: 24,  label: 'Petro-Canada, boul. de Lucerne' },
  { key: 'british',    sector: 'aylmer', gap: 40,  road: 'Rue Principale',
    label: 'Hôtel British, Vieux-Aylmer' },
  { key: 'hullmall',   sector: 'hull',   gap: 90,  label: 'Les Galeries de Hull' },
  { key: 'byward',     sector: 'ottawa', gap: 90,  label: 'Le marché By' },
  { key: 'hullmuseum', sector: 'hull',   gap: 90,
    label: 'Musée canadien des civilisations, Hull' },
];

for (const s of SEVEN) {
  const p = PLACES[s.key];
  if (!p) { fail(`PLACES.${s.key} is missing`); continue; }
  if (!p.label) { fail(`PLACES.${s.key} has no label`); continue; }
  if (p.label !== s.label) fail(`PLACES.${s.key} is labelled « ${p.label} », want « ${s.label} »`);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { fail(`${s.key}: non-finite coordinate`); continue; }
  // On a road, not in somebody's back garden.
  const gap = roadGap(p.x, p.z);
  if (gap > 3) fail(`${s.key}: resolved point is ${gap.toFixed(1)} m off the nearest road`);
  // ...and the road it landed on is still the one it names.
  if (s.road && p.street !== s.road) {
    fail(`${s.key}: snapped to « ${p.street} », want « ${s.road} »`);
  }
  // ...and it did not walk away from the building while doing it.
  const moved = Math.hypot(p.x - p.bx, p.z - p.bz);
  if (moved > s.gap) fail(`${s.key}: marker is ${moved | 0} m from the building, cap is ${s.gap} m`);
  const b = SECTOR[s.sector];
  if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) {
    fail(`${s.key}: (${p.x | 0}, ${p.z | 0}) is outside the ${s.sector} sector`);
  }
}
ok(`the seven destinations resolve onto their own streets, inside their own sectors`);

// The 2013 rename, in every string a player can read. In the summer of 2004 it
// is the Musée canadien des civilisations and nothing else — see docs/VERIFY.md
// §4 on Gemini's dates, and the Maman sculpture it got wrong the same way.
for (const k of ['hullmuseum']) {
  if (/histoire/i.test(PLACES[k].label)) fail(`PLACES.${k} still says « histoire » — that is the 2013 name`);
}
const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
if (/hullmuseum: '[^']*histoire/.test(mainSrc)) {
  fail("main.js's short label for the museum still says « histoire »");
}
ok('the museum is the Musée canadien des civilisations, opened 1989, not the 2013 rename');

// Russell's is the one genuinely new address, and the whole point of it is the
// driveway: the shop is at the far end of it, so the marker has to be at the
// mouth on rue Arial and the property has to be clear of number 3 next door.
{
  const p = PLACES.russell;
  const three = MAP.buildings.find((b) => b.addr === '3 Rue Arial');
  if (!three) fail('3 Rue Arial is not in MAP — the lot next door moved');
  else if (Math.hypot(three.c[0] - p.bx, three.c[1] - p.bz) < 12) {
    fail("Russell's driveway is on top of 3 rue Arial");
  }
  const one = MAP.buildings.find((b) => b.id === 460809162);
  if (!one) fail('OSM way 460809162 (1 Rue Arial) is gone from MAP');
  else if (one.h > 0.05) fail('1 Rue Arial is not collapsed — the hero mesh and the OSM box both draw');
}
ok("Russell's is the real 1 rue Arial footprint, and the driveway clears number 3");

// ---------------------------------------------------------------- the campaign

const camp = JSON.parse(readFileSync(new URL('../assets/text/campaign.json', import.meta.url), 'utf8')).campaign;

if (camp.length !== 18) fail(`campaign.json has ${camp.length} jobs, want 18`);

let mapped = 0;
for (const j of camp) {
  if (typeof j.place !== 'string' || !j.place) { fail(`job ${j.n} « ${j.title} » has no place key`); continue; }
  if (!PLACES[j.place]) { fail(`job ${j.n}: place « ${j.place} » is not in PLACES`); continue; }
  mapped++;
  if (!j.to) fail(`job ${j.n}: the descriptive « to » was dropped — it is the written brief`);
}
ok(`all ${mapped} campaign destinations resolve to a real PLACES key`);

// NEXT.md §4: « the destinations repeat. Poutine express and the dep run are
// effectively the same errand twice. Each job should go somewhere it has not
// been. » Consecutive repeats are the version of that a test can hold.
const repeats = camp.filter((j, i) => i && j.place === camp[i - 1].place).map((j) => j.n);
if (repeats.length) fail(`consecutive jobs finish in the same place: ${repeats.join(', ')}`);
ok('no two consecutive jobs finish in the same place');

// Every leg has to be drivable: a job that sends you 30 km is a job whose
// destination key is wrong, and this is what catches a mis-keyed sector.
let longest = { n: 0, km: 0 };
for (let i = 1; i < camp.length; i++) {
  const a = PLACES[camp[i - 1].place], b = PLACES[camp[i].place];
  if (!a || !b) continue;
  const km = Math.hypot(a.x - b.x, a.z - b.z) / 1000;
  if (km > longest.km) longest = { n: camp[i].n, km };
  if (km > 18) fail(`job ${camp[i].n} is ${km.toFixed(1)} km from where job ${camp[i - 1].n} ended`);
}
ok(`the longest leg is job ${longest.n}, ${longest.km.toFixed(1)} km`);

// The campaign's own arc: it starts and ends at 299 chemin Fraser, and the
// unlock kinds are the five NEXT.md §4 asked for rather than a car every time.
if (camp[camp.length - 1].place !== 'home') fail('the campaign does not end at 299 Chemin Fraser');
const kinds = new Set(camp.map((j) => j.unlocks && j.unlocks.kind).filter(Boolean));
if (kinds.size < 4) fail(`only ${kinds.size} kinds of unlock across 18 jobs: ${[...kinds].join(', ')}`);
ok(`the campaign ends at home, with ${kinds.size} kinds of unlock (${[...kinds].sort().join(', ')})`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nplaces: all good');
process.exit(failures ? 1 : 0);
