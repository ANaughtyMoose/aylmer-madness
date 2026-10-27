#!/usr/bin/env node
// 2004 names only:  node tools/smoke_w7_modern_names.mjs   (--list prints the modern list)
//
// w7-places, 27 Oct 2026 (D-12 design 2, the list check). No sign face may carry
// a name that arrived after 2004. "Modern" = the six post-2009 audit names
// (gemini-audit/AUDIT.md, streetview_pack.json) plus every OSM POI or building
// name within 60 m of Rue Principale (x < 200) or within 150 m of the Galeries
// centroid, minus the 2004 set (Tom's rulings, the mall tenants already in game,
// Tim Hortons, McDonald's) and civic labels. Single generic trade or place words
// are dropped. Match rule: fold case, accents and punctuation to single-spaced
// words; a hit is a modern name whose words appear as a whole-word run inside a
// sign text. Bambou (audit) and Bamboo (Tom's ruling) are different words.
//
// Sign texts checked: storefronts.json names, every landmark board (SITES, text
// and sub) and every name signage.js plans on a fascia. Prints names only, never
// an address. Pure node.
import { readFileSync } from 'node:fs';
import { MAP } from '../src/game/mapdata.js';
import { SITES } from '../src/game/landmarks.js';
import { planSigns, setStorefronts, STOREFRONT_URL } from '../src/game/signage.js';

let pass = 0, fail = 0;
const ok = (c, m, extra = '') => { if (c) pass++; else fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${extra ? '   ' + extra : ''}`); };

const fold = (t) => ` ${String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()} `;

const AUDIT = ['Bambou', 'Antonyme', 'La Basoche', 'Bouquinart', 'Salon Willy', 'Jolie Plus'];
const ALLOWED = ['Moca-Loca', 'Moca Loca', 'Jimmy’s Pizza', 'Bamboo', 'Super C', 'Canadian Tire',
  'Zellers', 'St-Hubert', 'Saint-Hubert', 'Jean Coutu', 'SAQ', 'SAQ Sélection', 'Galeries d’Aylmer',
  'Les Galeries d’Aylmer', 'Tim Hortons', 'McDonald’s', 'IGA', 'Loblaws', 'Esso', 'Ultramar',
  'Couche-Tard', 'Gabriel Pizza', 'Blockbuster', 'Desjardins', 'Caisse Desjardins'].map(fold);
const CIVIC = /^ (eglise|paroisse|ecole|college|cegep|bibliotheque|parc|arena|caserne|cimetiere|musee|auberge symmes|hotel british|marina|rue|chemin|boulevard|avenue|place|centre|club de golf|bureau de poste|postes canada|maison|hotel de ville|clsc|cpe|garderie|residence|chalet|pavillon|piscine|terrain|quai|phare|plage|patinoire|secteur|ville|municipalite|salle|caisse|banque|station|aylmer) /;
const GENERIC = new Set(['depanneur', 'garage', 'boutique', 'pharmacie', 'coiffure', 'pizza', 'aylmer',
  'outaouais', 'restaurant', 'bar', 'cafe', 'salon', 'clinique', 'dentiste', 'fleuriste', 'boulangerie',
  'epicerie', 'quincaillerie', 'taverne', 'pub', 'bistro', 'deli', 'traiteur', 'buanderie', 'nettoyeur',
  'esthetique', 'spa', 'gym', 'optometriste', 'veterinaire', 'notaire', 'avocat', 'comptable', 'tattoo',
  'friperie', 'atelier', 'studio', 'magasin', 'marche', 'galeries', 'principale', 'vieux aylmer']);

// ---- the modern list
const principale = [];
for (const r of MAP.roads) if (r.name === 'Rue Principale') for (let i = 0; i + 1 < r.pts.length; i++) principale.push([...r.pts[i], ...r.pts[i + 1]]);
const d2seg = (x, z, s) => {
  const ex = s[2] - s[0], ez = s[3] - s[1], l = ex * ex + ez * ez || 1;
  const t = Math.max(0, Math.min(1, ((x - s[0]) * ex + (z - s[1]) * ez) / l));
  const dx = s[0] + ex * t - x, dz = s[1] + ez * t - z; return dx * dx + dz * dz;
};
const nearPrincipale = (x, z) => x < 200 && principale.some((s) => d2seg(x, z, s) < 60 * 60);
const nearMall = (x, z) => Math.hypot(x + 18.9, z + 331.2) < 150;
const raw = new Set(AUDIT);
for (const p of MAP.pois) if (p.name && (nearPrincipale(p.x, p.z) || nearMall(p.x, p.z))) raw.add(p.name);
for (const b of MAP.buildings) if (b.name && (nearPrincipale(b.c[0], b.c[1]) || nearMall(b.c[0], b.c[1]))) raw.add(b.name);
const modern = [...raw].map((n) => ({ n, f: fold(n) })).filter(({ n, f }) => {
  if (AUDIT.includes(n)) return true;
  if (f.trim().length < 3) return false;
  if (ALLOWED.some((a) => f === a || a.includes(f) || f.includes(a))) return false;
  if (CIVIC.test(f)) return false;
  if (f.trim().split(' ').length === 1 && GENERIC.has(f.trim())) return false;
  if (f.trim().split(' ').every((w) => GENERIC.has(w))) return false;
  return true;
});
if (process.argv.includes('--list')) console.log(modern.map((m) => m.n).sort().join('\n'));

// ---- the sign texts
const json = JSON.parse(readFileSync(new URL('../' + STOREFRONT_URL, import.meta.url), 'utf8'));
const fronts = Array.isArray(json) ? json : json.storefronts;
const texts = [];
for (const s of fronts) texts.push({ from: 'storefronts.json', t: s.name });
for (const s of SITES) for (const g of [s.sign, ...(s.signs || [])].filter(Boolean)) texts.push({ from: `landmark ${s.key}`, t: `${g.text} ${g.sub || ''}` });
setStorefronts(fronts);
for (const s of planSigns()) if (s.name) texts.push({ from: 'signage plan', t: s.name });

const hits = [];
for (const { from, t } of texts) {
  const f = fold(t);
  for (const m of modern) if (f.includes(m.f)) hits.push(`${m.n} in "${t}" (${from})`);
}
console.log(`  modern list: ${modern.length} names; sign texts checked: ${texts.length}`);
ok(modern.length >= 6, 'the modern list has at least the six audit names', `${modern.length}`);
ok(hits.length === 0, '2004 tenants: no sign carries a post-2004 name', hits.length ? hits.join('; ') : '0 hits');
ok(!texts.some(({ t }) => fold(t).includes(' bambou ')), 'Bambou (the post-2009 name) is on no sign; Bamboo is Tom’s 2004 ruling');
ok(texts.filter(({ t }) => fold(t) === fold('Super C ')).length >= 1, 'the Super C is signed');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
