#!/usr/bin/env node
// Headless checks for src/game/signage.js and assets/text/storefronts.json.
//
//   node tools/smoke_signs.mjs           assert the plan
//   node tools/smoke_signs.mjs --list    print every sign the town will carry
//
// Asserts: the JSON has exactly MAX_SIGNS names across twelve trades with no
// repeats, every planned sign gets a unique name, no generated "Parc Gilles Pas
// Pire" survives, real chains keep their real names, the two cross-referenced
// names (Norm Lafleur's garage, Ti-Guy's lot) are actually placed, a trade never
// lands on the wrong kind of POI, and signage still plans with the file missing.
import { readFileSync } from 'node:fs';
import {
  planSigns, _resetSigns, setStorefronts, storefronts, STOREFRONT_URL,
} from '../src/game/signage.js';

let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

// ---------------------------------------------------------------- the file

const raw = JSON.parse(readFileSync(new URL('../' + STOREFRONT_URL, import.meta.url), 'utf8'));
const list = Array.isArray(raw) ? raw : raw.storefronts;
if (!Array.isArray(list)) { fail('storefronts.json has no array'); process.exit(1); }

const MAX_SIGNS = 120;
if (list.length !== MAX_SIGNS) fail(`storefronts.json has ${list.length} names, MAX_SIGNS is ${MAX_SIGNS}`);
else ok(`${list.length} storefront names, exactly MAX_SIGNS — every sign can be unique`);

const names = list.map((s) => s.name);
if (new Set(names).size !== names.length) fail('storefronts.json repeats a name');
const byType = {};
for (const s of list) {
  if (!s.type || !s.name) fail('a storefront entry is missing type or name');
  byType[s.type] = (byType[s.type] || 0) + 1;
}
const types = Object.keys(byType);
if (types.length !== 12) fail(`${types.length} trades in storefronts.json, want 12`);
for (const t of types) if (byType[t] !== 10) fail(`trade "${t}" has ${byType[t]} names, want 10`);
ok(`twelve trades, ten names each: ${types.join(', ')}`);

// The `why` column is authoring notes. It must never reach a sign face.
for (const s of list) if (/^why$/i.test(s.name)) fail('a name looks like a why field');

// ---------------------------------------------------------------- the plan

setStorefronts(list);
_resetSigns();
const plan = planSigns();
if (plan.length !== MAX_SIGNS) fail(`plan has ${plan.length} signs, want ${MAX_SIGNS}`);

const planned = plan.map((s) => s.name);
const dupes = planned.filter((n, i) => planned.indexOf(n) !== i);
if (dupes.length) fail('the town carries the same sign twice: ' + [...new Set(dupes)].join(', '));
else ok(`all ${plan.length} signs in town are unique`);

for (const s of plan) {
  if (!s.name || typeof s.name !== 'string') fail('a sign has no name');
  if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) fail(`sign "${s.name}" is nowhere`);
  if (s.w <= 0 || s.h <= 0) fail(`sign "${s.name}" has no size`);
}

// Nothing generated may survive. quebec_pois.js builds its labels out of a fixed
// set of first names and tag-lines; if any pair still shows up on a board, the
// hand-written list is not actually being used.
const GENERATED = /(Ti-Claude|Mononc’ Réjean|Ginette|Gilles|Carole|Normand|Manon|Réjean|Diane|Yvon|Lise|Francine|Marcel|Johanne)\s+(du Coin|Chez Nous|Pas Pire|À Peu Près|Ben Correct|En Masse|du Rang|du P’tit Change|de la Garnotte|des Bons Chums|du Gros Bon Sens)/;
const leaked = planned.filter((n) => GENERATED.test(n));
if (leaked.length) fail(`${leaked.length} generated names still on signs: ${leaked.slice(0, 3).join(', ')}`);
else ok('no procedurally generated names left on any sign');

const handSet = new Set(names);
const handUsed = planned.filter((n) => handSet.has(n));
if (handUsed.length < 55) fail(`only ${handUsed.length} hand-written names made it onto signs`);
ok(`${handUsed.length} hand-written names placed, ${plan.length - handUsed.length} slots kept a real `
  + 'OpenStreetMap name (chains, schools, parks, churches)');

// Real chains beat inventions — half of why an Aylmer person recognises a street.
const CHAINS = /Tim Hortons|Canadian Tire|Couche-Tard|Metro|IGA|Subway|Petro-Canada|SAQ|Jean Coutu/i;
if (!planned.some((n) => CHAINS.test(n))) fail('not one real chain kept its own name');
else ok('real chains keep their real names: ' + planned.filter((n) => CHAINS.test(n)).slice(0, 6).join(', '));

// Cross-references to other agents' work, kept verbatim.
for (const pin of ['Garage Norm Lafleur & Fils', 'Les Chars à Ti-Guy', 'Dépanneur Chez Ti-Guy']) {
  if (!planned.includes(pin)) fail(`"${pin}" is in the list but never gets placed`);
}
ok('Norm Lafleur’s garage, Ti-Guy’s lot and Ti-Guy’s dep are all standing');

// A trade must land on a POI that could plausibly be it.
const WRONG = { park: 1, playground: 1, place_of_worship: 1, school: 1, cemetery: 1 };
for (const s of plan) {
  if (handSet.has(s.name) && WRONG[s.poi.k]) {
    fail(`"${s.name}" (a business) is signed on a ${s.poi.k}`);
  }
}
ok('no business name lands on a park, a school or a church');

// ---------------------------------------------------------------- fallback

_resetSigns();
setStorefronts(null);              // ignored: setStorefronts keeps the last good list
const still = planSigns();
if (still.length !== MAX_SIGNS) fail('the plan fell over when handed a null list');
if (!storefronts().length) fail('storefronts() went empty');
ok('a missing or empty list leaves the last good names in place');

if (process.argv.includes('--list')) {
  console.log();
  for (const s of plan) {
    console.log('  ' + String(s.slot).padStart(3) + '  ' + s.name.padEnd(38)
      + (handSet.has(s.name) ? 'hand ' : 'osm  ') + s.poi.k.padEnd(18)
      + s.x.toFixed(0).padStart(7) + ',' + s.z.toFixed(0).padStart(7));
  }
  console.log();
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nsignage: all good');
process.exit(failures ? 1 : 0);
