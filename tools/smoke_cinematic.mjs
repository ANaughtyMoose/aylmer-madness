import assert from 'node:assert/strict';
import { Cinematic, missionClock, CINEMA_ART, CARD_GRADES, cardGrade, cardArt, resolveArt, gradeStyle } from '../src/game/cinematic.js';
import { MAIN, FINALE } from '../src/game/campaign.js';
import { ALL_MISSIONS } from '../src/game/missions.js';
import { readPng, resize } from './qa/lib/png.mjs';
import fs from 'node:fs';
import { placementReason, freeReset, callTow, roadSpot } from '../src/game/tow.js';
import { missionById } from '../src/game/missions.js';
import { stageSettle } from '../src/game/missionkit.js';

assert.equal(missionClock([{time:null}, {}]), null);
assert.deepEqual(missionClock([{time:null}, {time:40}], 1), [40]);
assert.deepEqual(missionClock([{time:40}], 1.5), [60]);
const world = {
  nearestRoad: (x,z) => ({x:0,z,yaw:0,name:'Test',dist:Math.abs(x)}),
  roadAt: x => Math.abs(x) < 4,
  buildingAt: (x,z) => x > 0.6 && z > 1 && z < 3,
  waterAt: () => false,
};
const spec = {wid:1.8,len:4.8};
assert.equal(world.buildingAt(0,0), false);
assert.equal(placementReason(world,{x:0,z:0,yaw:0},spec), 'building');
const recovered = roadSpot(world,0,0,spec);
assert.ok(recovered && Math.abs(recovered.z) >= 6);
assert.equal(placementReason(world,recovered,spec), null);
assert.equal(placementReason(world,{x:0,z:0,yaw:Math.PI/2},{wid:1,len:1}), null);
const blocked = {...world,buildingAt:()=>true};
let repairs=0,spent=0,resets=0;
const G={world:blocked,veh:{x:0,z:0,spec,damage:40,reset(){resets++;},repair(){repairs++;}},wallet:{can:()=>true,spend(){spent++;}}};
assert.equal(freeReset(G).ok,false);
assert.equal(callTow(G).ok,false);
assert.equal(spent+repairs+resets,0);

// The same finish path is used by mouse and keyboard; it consumes its callback.
const c=Object.create(Cinematic.prototype);
let finished=0,cleared=0;
c.active=true;c.onDone=()=>finished++;
c.clearInput=()=>cleared++;
assert.equal(c.finish(),true);
assert.equal(c.finish(),false);
assert.equal(finished,1);
assert.equal(cleared,1);
c.active=true;c.onDone=()=>finished++;c.hide();
assert.equal(c.finish(),false);
assert.equal(finished,1,'cancelled presentation must not run its follow-up');

// Real first-job settlement precedes presentation and cannot be repeated by it.
const def=missionById('alternateur');
const stages=def.build({carName:'Ranger'});
const mission={def,stages,idx:1};
let balance=80;
const state={wallet:{add(n){balance+=n;},spend(n){balance-=n;}},done:new Set()};
stageSettle(state,mission,stages[1]);
const earned=balance;
c.active=true;c.onDone=()=>{};c.finish();c.finish();
assert.equal(balance,earned);
assert.ok(earned>80);

// ---------------------------------------------------------------- B-10 card grades
// Every main mission card maps to its tint: the shared painting graded to the
// job's own hour (timeOfDay on its def), its own painting for alternateur, and
// the rain grade for the golf night (a card-art choice, CARD_WEATHER).
const EXPECT = {
  alternateur: 'alternateur', sayyad: 'home@night', arcbache: 'home@dusk', divan: 'home@dusk',
  canot: 'home', golfcart: 'home@rain', stvincent: 'home',
  nuittim: 'home@night', school: 'home', russellroyal: 'home', curfew: 'home@night', arcdernier: 'home@dusk',
};
const mainIds = [...MAIN.flatMap((m) => m.ids), FINALE];
const byId = (id) => ALL_MISSIONS.find((m) => m.id === id);
for (const id of mainIds) {
  const def = byId(id);
  assert.ok(def, `main mission ${id} has a def`);
  assert.ok(id in EXPECT, `main mission ${id} has an expected card tint (add it to EXPECT)`);
  assert.equal(cardArt(def), EXPECT[id], `${id} card art`);
  const r = resolveArt(cardArt(def));
  assert.ok(r.src && fs.existsSync(r.src), `${id} card art resolves to a file (${r.src})`);
}
assert.equal(cardGrade(byId('golfcart')), 'rain', 'golfcart card has the rain grade');
assert.equal(cardGrade(byId('nuittim')), 'night', 'nuittim card has the night grade');
// Side and race jobs fall back to their hour on the shared painting; unknown art stays ungraded.
assert.equal(cardArt(byId('dep')), 'home@dusk');
assert.equal(cardArt({ id: 'nope' }), 'home');
assert.deepEqual(resolveArt('home@nope'), { base: 'home', grade: 'day', src: CINEMA_ART.home });
assert.equal(resolveArt('nope@night').src, null, 'unknown painting: no src, the dark layer shows');
for (const g of Object.keys(CARD_GRADES)) {
  const st = gradeStyle(g, CINEMA_ART.home);
  assert.ok(st.backgroundImage.endsWith(`url("${CINEMA_ART.home}")`), `${g}: the painting is the bottom layer`);
  const n = st.backgroundImage.split('url(').length - 1 + (st.backgroundImage.match(/gradient\(/g) || []).length;
  if (st.backgroundBlendMode) assert.equal(st.backgroundBlendMode.split(',').length, n, `${g}: one blend mode per layer`);
  for (const L of CARD_GRADES[g].layers) if (L.kind === 'pattern') assert.ok(fs.existsSync(L.url) && L.url.startsWith('assets/cinema/tints/'), `${g}: pattern ${L.url} is in tints/`);
}

// The grades applied to the painting's pixels, as the page composites them:
// each layer blended over the painting (source-over with the layer's alpha),
// then the filter chain, in sRGB. Measured on the crop the card shows at
// 1280x800 (.cinema-art 56% wide, cover, home at left center).
const img = readPng(CINEMA_ART.home);
const boxW = Math.round(1280 * 0.56), boxH = 800;
const scale = boxH / img.h, shownW = Math.min(1, boxW / (img.w * scale));
const small = resize(img, 160, 90);
const cols = Math.max(1, Math.round(160 * shownW));
const blendFn = {
  multiply: (b, c) => b * c,
  screen: (b, c) => 1 - (1 - b) * (1 - c),
  normal: (b, c) => c,
};
const SAT = (s) => [
  0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
];
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
function gradeStats(grade) {
  const G = CARD_GRADES[grade];
  let L = 0, R = 0, Gs = 0, B = 0, n = 0;
  for (let y = 0; y < small.h; y++) for (let x = 0; x < cols; x++) {
    const i = (y * small.w + x) * 4;
    let c = [small.data[i] / 255, small.data[i + 1] / 255, small.data[i + 2] / 255];
    const fx = x / Math.max(1, cols - 1), fy = y / (small.h - 1);
    for (const layer of [...G.layers].reverse()) {   // bottom layer first
      let col, a;
      if (layer.kind === 'linear') { col = layer.top.map((v, k) => (v + (layer.bottom[k] - v) * fy)); a = col[3]; col = col.slice(0, 3).map((v) => v / 255); }
      else if (layer.kind === 'radial') { const d = Math.hypot((fx - layer.x) / layer.rx, (fy - layer.y) / layer.ry); a = layer.color[3] * clamp01(1 - d); col = layer.color.slice(0, 3).map((v) => v / 255); }
      else if (layer.kind === 'pattern') { a = layer.color[3] * layer.cover; col = layer.color.slice(0, 3).map((v) => v / 255); }
      const f = blendFn[layer.blend || 'normal'];
      c = c.map((b, k) => (1 - a) * b + a * f(b, col[k]));
    }
    for (const [fn, v] of G.filter) {
      if (fn === 'brightness') c = c.map((b) => b * v);
      else if (fn === 'contrast') c = c.map((b) => (b - 0.5) * v + 0.5);
      else if (fn === 'saturate') { const m = SAT(v); c = [0, 1, 2].map((r) => m[r * 3] * c[0] + m[r * 3 + 1] * c[1] + m[r * 3 + 2] * c[2]); }
      else throw new Error(`smoke does not model filter ${fn}`);
      c = c.map(clamp01);
    }
    L += 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; R += c[0]; Gs += c[1]; B += c[2]; n++;
  }
  return { L: L / n, R: R / n, G: Gs / n, B: B / n };
}
const S = Object.fromEntries(Object.keys(CARD_GRADES).map((g) => [g, gradeStats(g)]));
const ratio = (g) => S[g].L / S.day.L;
assert.ok(S.day.L >= 0.35, `the noon card is a bright painting (L ${S.day.L.toFixed(3)})`);
assert.ok(ratio('night') <= 0.25, `nuittim card mean luminance <= 25% of the noon card (${(ratio('night') * 100).toFixed(1)}%)`);
assert.ok(ratio('rain') <= 0.45, `the rain card is dark (${(ratio('rain') * 100).toFixed(1)}% of noon)`);
assert.ok(S.rain.B >= S.rain.R, 'the rain card leans cool (mean B >= mean R)');
assert.ok(ratio('dusk') <= 0.80 && S.dusk.R >= 1.10 * S.dusk.B, `the dusk card is warmer and dimmer (${(ratio('dusk') * 100).toFixed(1)}%, R/B ${(S.dusk.R / S.dusk.B).toFixed(2)})`);
assert.ok(S.night.B >= S.night.R, 'the night card leans blue');
console.log('Card grades (luminance vs noon): ' + Object.keys(S).map((g) => `${g} ${(ratio(g) * 100).toFixed(1)}%`).join(', '));

// show() on a stub: the job picks the grade, a late load is dropped, hide() clears it.
{
  const prevDoc = globalThis.document, prevImage = globalThis.Image;
  const images = [];
  globalThis.document = { activeElement: null, getElementById: () => null };
  globalThis.Image = class { constructor() { images.push(this); } };
  const els = {};
  const el = (sel) => els[sel] || (els[sel] = { style: {}, textContent: '' });
  const v = Object.create(Cinematic.prototype);
  Object.assign(v, { clearInput() {}, onHold() {}, root: { dataset: {}, querySelector: el }, button: { focus() {} } });
  v.show({ title: 't', body: 'b', job: byId('nuittim') });
  assert.equal(v.root.dataset.art, 'home');
  assert.equal(v.root.dataset.grade, 'night');
  assert.equal(el('.cinema-art').style.backgroundImage, '', 'no picture before the load');
  images.at(-1).onload();
  assert.ok(el('.cinema-art').style.backgroundImage.endsWith(`url("${CINEMA_ART.home}")`));
  assert.ok(el('.cinema-art').style.filter.includes('brightness'), 'night filter set');
  v.hide();
  assert.equal(el('.cinema-art').style.filter, '', 'hide clears the grade');
  v.show({ title: 't', body: 'b', art: 'home@rain' });
  const late = images.at(-1); v.hide(); late.onload();
  assert.equal(el('.cinema-art').style.backgroundImage, '', 'a load after hide() is dropped');
  v.show({ title: 't', body: 'b', art: 'alternateur', job: byId('nuittim') });
  images.at(-1).onload();
  assert.equal(v.root.dataset.art, 'alternateur', 'an explicit art wins over the job');
  assert.equal(el('.cinema-art').style.filter, '', 'own paintings stay ungraded');
  assert.equal(el('.cinema-art').style.backgroundImage, `url("${CINEMA_ART.alternateur}")`);
  v.show({ title: 't', body: 'b' });
  assert.equal(v.root.dataset.art, 'home', 'no art and no job: the home painting');
  globalThis.document = prevDoc; globalThis.Image = prevImage;
}
console.log('Cinematic timing, single-use callbacks, settlement, footprint recovery and B-10 card grades: passed');
