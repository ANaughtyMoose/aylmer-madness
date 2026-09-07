// Where you are allowed to start:  node tools/smoke_start.mjs
//
// Thomas, 2026-09-07: « limit where you can start until you unlock the rest
// (you can still drive there) by winning missions. » The table that does it
// lives in src/main.js, beside the start-point data it belongs to — and no
// smoke suite may import main.js, because main.js touches the DOM at module
// scope. So this reads it out of the source text, exactly the way
// tools/smoke_shell.mjs already reads START_POINTS, and then checks it against
// the real missions, the real places and the real characters.
//
// What it is protecting:
//   1. every start point has a rule, and every rule names a place that exists
//   2. every rule names at least one job this build actually has
//   3. a brand-new character sees their own front door and 299 Fraser, and
//      nothing else
//   4. each unlock job opens exactly the points it is supposed to, and no more
//   5. a finished summer opens all of them
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const { ALL_MISSIONS } = await import('../src/game/missions.js');
const { PLACES } = await import('../src/game/places.js');
const { CHARACTERS } = await import('../src/game/save.js');
const { OTTAWA_STARTS } = await import('../src/game/ottawa.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

// ---------------------------------------------------------------- the source

// The array literal, comments and all, then every quoted id in it. Same trick
// smoke_shell uses; the comment block over START_POINTS in main.js is outside
// the brackets on purpose so this stays honest.
function block(name, open, close) {
  const at = src.indexOf(`const ${name} = ${open}`);
  if (at < 0) throw new Error(`${name} not found in src/main.js`);
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`${name} never closed`);
}
const POINTS = [...block('START_POINTS', '[', ']')
  .replace(/\/\/[^\n]*/g, '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
// key: null  |  key: ['a', 'b']
const RULES = {};
for (const m of block('START_UNLOCKS', '{', '}').replace(/\/\/[^\n]*/g, '')
  .matchAll(/(\w+):\s*(null|\[[^\]]*\])/g)) {
  RULES[m[1]] = m[2] === 'null' ? null : [...m[2].matchAll(/'([\w-]+)'/g)].map((q) => q[1]);
}

// main.js's own startOpen(), reimplemented from the same two tables. If this
// ever drifts from the real one the counts below stop matching the game, which
// is a failure worth having.
const homeOf = (id) => (CHARACTERS.find((c) => c.id === id) || CHARACTERS[0]).home;
const open = (key, done, character) => {
  const rule = RULES[key];
  if (rule === null) return true;
  if (rule === undefined) return false;
  if (key === homeOf(character)) return true;
  return rule.some((id) => done.has(id));
};
// main.js pushes Ottawa's five in at import time (START_POINTS.push(...
// OTTAWA_STARTS)), so the real list the picker draws is both.
const ALL_POINTS = [...POINTS, ...OTTAWA_STARTS];
const openSet = (done, character) =>
  ALL_POINTS.filter((k) => PLACES[k]).filter((k) => open(k, done, character));

// ---------------------------------------------------------------- 1. the table

group('every start point has a rule');
{
  ok(POINTS.length >= 18, `${POINTS.length} start points in main.js`);
  ok(POINTS.every((k) => PLACES[k]), 'every one of them is a real place',
    POINTS.filter((k) => !PLACES[k]).join(', '));
  const ALL = ALL_POINTS;
  const missing = ALL.filter((k) => !(k in RULES));
  ok(missing.length === 0, 'every start point — Ottawa\'s included — has an unlock rule', missing.join(', '));
  const stray = Object.keys(RULES).filter((k) => !ALL.includes(k));
  ok(stray.length === 0, 'and no rule names a start point that does not exist', stray.join(', '));
  ok(RULES.home === null, '299 Chemin Fraser is always open');
  for (const who of CHARACTERS) {
    ok(POINTS.includes(who.home) || OTTAWA_STARTS.includes(who.home),
      `${who.id}'s own front door (${who.home}) is one of the pins`);
  }
}

group('every rule names a job that exists');
{
  const ids = new Set(ALL_MISSIONS.map((m) => m.id));
  for (const [key, rule] of Object.entries(RULES)) {
    if (rule === null) continue;
    ok(rule.length > 0, `${key} names at least one job`);
    // At least one, not all: a row may name a Wave 3 job that has not landed
    // yet alongside the one that opens it today (see the comment on the table).
    // A row where NOTHING exists would print « Finis «  » » and never open.
    ok(rule.some((id) => ids.has(id)),
      `${key}: « ${rule.join(' / ')} » — ${rule.filter((id) => ids.has(id)).join(', ')} exists today`,
      rule.join(', '));
    const pending = rule.filter((id) => !ids.has(id));
    if (pending.length) console.log(`       (pending Wave 3 job${pending.length > 1 ? 's' : ''}: ${pending.join(', ')})`);
  }
}

// ------------------------------------------------------ 2. a brand-new summer

group('a fresh save opens one or two points, and no more');
{
  for (const who of CHARACTERS) {
    const got = openSet(new Set(), who.id);
    ok(got.length >= 1 && got.length <= 2,
      `${who.id}: ${got.length} open — ${got.join(', ')}`, got.join(', '));
    ok(got.includes('home'), `${who.id}: 299 Chemin Fraser is one of them`);
    ok(got.includes(who.home), `${who.id}: and so is ${PLACES[who.home].label}`);
  }
  // Tom's own home IS 299 Fraser, so he is the one who sees exactly one.
  ok(openSet(new Set(), 'tom').length === 1, 'Tom, whose house is the default, sees exactly one');
  // Nothing across the river, on the first frame, for anybody.
  for (const who of CHARACTERS) {
    const got = openSet(new Set(), who.id);
    ok(!got.some((k) => ['ottawa', 'chelsea', 'heritage', 'hulldowntown'].includes(k)),
      `${who.id}: nowhere across the river`);
  }
}

// ------------------------------------------------- 3. each job opens its own

group('each job opens exactly its own points');
{
  const base = openSet(new Set(), 'tom');
  const want = {
    // The first job of the summer parks you on the chemin d'Aylmer, at the
    // Canadian Tire counter — so that is the street you may begin on after it.
    alternateur: ['mall'],
    poutine: ['sayyad', 'mall'],
    // « Réveiller Sayyad » ends in the street outside 75 Denise-Friend, and it
    // comes before « Poutine express » now, so it opens that door too.
    sayyad: ['sayyad'],
    gang: ['marina', 'principale', 'abraham'],
    divan: ['mike', 'arena'],
    curfew: ['deschenes'],
    golfcart: ['golf'],
    chelsea: ['chelsea'],
    canot: ['beach'],
    highwayhull: ['heritage', 'hulldowntown', 'hullmuseum', 'hullcasino', 'hullmall',
      'ottawa', ...OTTAWA_STARTS],
  };
  for (const [job, keys] of Object.entries(want)) {
    const got = openSet(new Set([job]), 'tom').filter((k) => !base.includes(k));
    const wanted = keys.filter((k) => PLACES[k]);
    ok(got.length === wanted.length && wanted.every((k) => got.includes(k)),
      `« ${(ALL_MISSIONS.find((m) => m.id === job) || {}).title || job } » opens ${got.join(', ')}`,
      `wanted ${wanted.join(', ')}, got ${got.join(', ')}`);
  }
  // ...and one job does not quietly open somebody else's.
  ok(!openSet(new Set(['poutine']), 'tom').includes('chelsea'), 'the poutine run does not open Chelsea');
}

// ----------------------------------------------------- 4. a finished summer

group('a summer with everything done opens everything');
{
  const all = new Set(ALL_MISSIONS.map((m) => m.id));
  for (const who of CHARACTERS) {
    const got = openSet(all, who.id);
    const shut = ALL_POINTS.filter((k) => PLACES[k] && !got.includes(k));
    ok(shut.length === 0, `${who.id}: all ${got.length} points open`, shut.join(', '));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
