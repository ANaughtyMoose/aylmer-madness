import { placementReason, roadSpot } from './tow.js';
// The three modes.
//
// Midtown Madness shipped with three, and they are three because each one asks
// a different question of the same town:
//
//   BLITZ       one route, one clock, no rivals. "Can you drive?"
//   CHECKPOINT  scattered gates, rivals, and NO GPS line between them. The
//               route is yours to find, which is the only reason an open world
//               is worth building. "Do you know this town?"
//   CRUISE      no clock, no gates. The story jobs live in here — they always
//               did; Cruise is just the name for the game you were already
//               playing between them, and the place you go back to after a run.
//
// M opens the picker from behind the wheel. Picking a course puts you on its
// start line, hands the whole thing to main.js's ordinary mission runner via
// racejobs.js's two stages (a grid you press E on, and one long stage that owns
// the countdown, the gates and the clock), and gets out of the way. There is no
// second runner, no second Track, and no second set of AI.
//
// Everything below is data plus a small DOM overlay. The only thing it asks of
// main.js is one hook block: installModes(G, { startMission }).
import { PLACES } from './places.js';
import { setModal } from './ui.js';
// [w7-replay] medals and records (both outside the race.js cycle).
import { thresholdsFor, clockText, runText, TARGET_NAMES, medalFor } from './medals.js';
import * as save from './save.js';
import { raceMission, raceStages, endRace } from './racejobs.js';
import { scaledPay, runPay, courseTime, yieldsToMode } from './missionkit.js';
// The written copy: course names by index into assets/text/racing.json, plus the
// rivals' taunts. See racingtext.js — a name is a fallback, never a blank.
import { writtenName, taunt, line as textLine } from './racingtext.js';
// The twelve people you race against: who drives what, how they drive it, and
// whose mouth each taunt comes out of.
import { grid, rival, rivalName, rivalStyle, rivalWhenLosing, rivalSays } from './rivals.js';

// « 1 job faite », « 3 jobs faites » (une job, in Quebec French; QA F7).
const jobsDone = (n) => `${n} job${n > 1 ? 's' : ''} faite${n > 1 ? 's' : ''}`;

// Gate rings. A blitz gate is the size of an intersection because you are
// following a line into it; a checkpoint gate is wider because you might be
// arriving down an alley nobody planned for.
//
// BLITZ_R is racejobs.js's GATE_R written out rather than imported: race.js
// imports this file (that is where the per-tick hook lives), so racejobs -> race
// -> modes -> racejobs is a cycle, and reading a `const` out of a module that is
// still evaluating is a temporal-dead-zone crash. Functions are fine across the
// cycle; module-scope VALUES are not. tools/smoke_modes.mjs asserts the two
// numbers still agree.
export const BLITZ_R = 18;
export const CHECK_R = 26;

const at = (c) => (typeof c === 'string' ? PLACES[c] : c);

// ---------------------------------------------------------------- start poses
//
// Review 5 Oct 2026 (pack 20261005-212013-quick): « Le Raccourci du Curé »
// put the truck inside the brick house on the south side of Principale, the
// camera in the building, and in three runs it never got out. Every course's
// `start` was a raw coordinate that nothing ever checked against the world:
// all eight were inside a building footprint. The data below is now authored
// on the road, and startCourse() still runs the pose through startPose() so a
// future map rebake cannot put a start line back inside a house.

/** Metres of clear road a start line must have straight ahead of it. */
export const START_CLEAR = 15;

/**
 * Why driving `dist` metres straight ahead from `p` would hit something, or
 * null if it would not: the whole body (tow.js placementReason) at every metre,
 * plus the collider walls and the poles along the way.
 */
export function blockedAhead(world, p, spec = {}, dist = START_CLEAR) {
  const fx = Math.sin(p.yaw || 0), fz = Math.cos(p.yaw || 0);
  const hw = (spec.wid || 1.8) / 2, hl = (spec.len || 4.8) / 2;
  for (let d = 0; d <= dist; d += 1) {
    const q = { x: p.x + fx * d, z: p.z + fz * d, yaw: p.yaw || 0 };
    const why = placementReason(world, q, spec);
    if (why) return `${why} at ${d} m`;
    // The nose sweeps the next metre; a wall or a pole inside half a width of
    // the centreline there is a wall the truck drives into.
    const nx = q.x + fx * hl, nz = q.z + fz * hl;
    if (world.querySegments && world.querySegments(nx, nz, hw).length) return `wall at ${d} m`;
    if (world.queryPoles && world.queryPoles(nx, nz, hw).length) return `pole at ${d} m`;
  }
  return null;
}

/** Why `p` is a bad start line (on the road, clear body, clear road ahead), or null. */
export function startReason(world, p, spec = {}) {
  if (!world) return null;
  if (world.roadAt && !world.roadAt(p.x, p.z)) return 'off the road';
  return placementReason(world, p, spec) || blockedAhead(world, p, spec);
}

/**
 * A start pose that passes startReason, as close to the authored one as the
 * road allows: the authored pose itself if it is good; otherwise the first
 * good point along `route` (the GPS route to the first gate, as [x, z] pairs),
 * facing along it; otherwise slide along the nearest road (facing whichever
 * way along it is closer to the authored heading); otherwise tow.js roadSpot,
 * turned the same way. Returns { x, z, a, yaw, moved }, `moved` being how far
 * it had to go.
 */
export function startPose(world, start, spec = {}, route = null) {
  const want = start.a != null ? start.a : (start.yaw || 0);
  const pose = (x, z, yaw) => ({ x, z, a: yaw, yaw, moved: Math.hypot(x - start.x, z - start.z) });
  const p0 = pose(start.x, start.z, want);
  if (!world || !world.nearestRoad || !startReason(world, p0, spec)) return p0;
  if (route && route.length > 1) {
    // Walk the first 120 m of the route in 2 m steps, facing down it.
    let walked = 0;
    for (let i = 0; i + 1 < route.length && walked < 120; i++) {
      const [ax, az] = route[i], [bx, bz] = route[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      const yaw = Math.atan2(bx - ax, bz - az);
      for (let t = 0; t < len; t += 2) {
        const p = pose(ax + (bx - ax) * t / len, az + (bz - az) * t / len, yaw);
        if (!startReason(world, p, spec)) return p;
      }
      walked += len;
    }
  }
  // Of the two ways along a road, the one nearer the authored heading.
  const along = (yaw) => {
    const d = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
    return Math.abs(d) <= Math.PI / 2 ? yaw : yaw + Math.PI;
  };
  const r0 = world.nearestRoad(start.x, start.z);
  if (r0 && Number.isFinite(r0.x)) {
    const yaw0 = along(r0.yaw || 0);
    const fx = Math.sin(yaw0), fz = Math.cos(yaw0);
    // Back first (a start line is behind its first corner, never past it).
    for (const off of [0, -4, -8, -12, -16, -20, -25, -30, 4, 8, 12, -40, -50, -60]) {
      const r = world.nearestRoad(r0.x + fx * off, r0.z + fz * off);
      if (!r || !Number.isFinite(r.x)) continue;
      const p = pose(r.x, r.z, along(r.yaw || 0));
      if (!startReason(world, p, spec)) return p;
    }
  }
  const s = roadSpot(world, start.x, start.z, spec);
  if (s) {
    const p = pose(s.x, s.z, along(s.yaw || 0));
    if (!startReason(world, p, spec)) return p;
  }
  return p0;
}

/**
 * What this course is called. `text` is its index in assets/text/racing.json's
 * `courses` list and `name` is the same name written out here, so the picker has
 * something to show the instant it opens and the JSON is free to arrive late.
 * Courses with no `text` are the ones the written list has no name for — a name
 * that does not match the road it is on is worse than no name.
 */
export const courseName = (c) => writtenName('courses', c.text, c.name);

// A rival's line, in quotes, or nothing at all. `pre` on the grid, `ahead` when
// one of them goes by, `beaten` when one of them does not. A rival off the
// roster speaks in his own voice; anyone else gets the shared pool.
function saidBy(who, when) {
  const r = who && who.rival ? rival(who.rival) : null;
  if (r) return rivalSays(r, when);
  const l = textLine(taunt(when));
  const name = typeof who === 'string' ? who : (who && who.name) || '';
  return l && name ? `${name}: « ${l} »` : '';
}

// ---------------------------------------------------------------- the courses
//
// Gates are PLACES keys (already snapped to the road by resolvePlaces) or raw
// {x, z, label} taken off the road graph. `clock` is the starting seconds and
// `bonus` what each gate puts back on it — a blitz never stops the clock, it
// only ever buys you more of it.
//
// Every clock below was set from a measured pace-car lap — tools/smoke_modes.mjs
// drives all eight on the real road bake and fails the build if one cannot be
// finished, if the timer has no slack in it, or if the slack is so wide the
// clock stops meaning anything. The comment on each says what that lap took.
// The pace car never takes a shortcut and lifts for every bend, so its margin is
// the floor and not the ceiling.

export const BLITZ = [
  {
    id: 'bz_vieux', text: 2, name: 'Le Raccourci du Curé',
    blurb: 'Six coins du vieux village. Deux kilomètres, pis pas une ligne droite.',
    where: 'rue Principale, coin Bancroft',
    // The 1830s grid: Principale east, north up Frank-Robinson, west along du
    // Patrimoine, south down Bancroft, out to the dépanneur and back. 2.1 km.
    // On Principale just west of Bancroft, facing east (review 5 Oct 2026: the
    // old -877, -102 was inside the brick house on the south side).
    start: { x: -895, z: -86.6, a: 1.663 },
    cps: [
      { x: -426, z: -130, label: 'Principale × Frank-Robinson' },
      { x: -416, z: -36, label: 'Frank-Robinson × du Patrimoine' },
      { x: -856, z: 4, label: 'du Patrimoine × Bancroft' },
      { x: -867, z: -99, label: 'Bancroft × Principale' },
      'dep',
      // The finish ring is where it always was (r = 18), moved 9.5 m onto
      // Bancroft so its pillar stands on the road and not in the house.
      { x: -867.6, z: -103, label: 'rue Principale : l’arrivée' },
    ],
    // Pace car: 1:59. Budget 2:40.
    clock: 40, bonus: 20, money: 30, timeOfDay: 'morning',
  },
  {
    id: 'bz_aylmer', text: 1, name: 'La Strip des Galeries',
    blurb: 'Plein est jusqu’à Deschênes. Cinq kilomètres et demi de quatrième vitesse.',
    where: 'rue Principale, devant le Tim',
    // The long high-speed one: the whole commercial strip, then Fraser and the
    // Petro-Canada, then over to the Hôtel Deschênes. 5.6 km.
    start: { x: -895, z: -86.6, a: 1.663 },
    cps: ['tims', 'mall', 'mcdo', 'ctire', 'home', 'gas', 'deschenes'],
    // Pace car: 4:58. Budget 6:24.
    clock: 48, bonus: 48, money: 45, timeOfDay: 'day',
  },
  {
    id: 'bz_ouest', text: 4, name: 'La Descente des Cèdres',
    blurb: 'La marina, la plage, le chemin Eardley, pis retour à l’église. Ça tourne.',
    where: 'rue Principale, coin Bancroft',
    // The twisty one: out past the Auberge Symmes to the marina, down to the
    // Plage des Cèdres, back up Eardley and in to Saint-Paul. 4.3 km.
    // On Principale just east of Bancroft, facing west.
    start: { x: -845, z: -91.1, a: -1.483 },
    cps: ['symmes', 'marina', 'beach', { x: -1719, z: -1012, label: 'chemin Eardley' },
      'church', { x: -845, z: -91.1, label: 'rue Principale : l’arrivée' }],
    // Pace car: 3:48. Budget 5:03.
    clock: 45, bonus: 43, money: 40, timeOfDay: 'dusk',
  },
  {
    id: 'bz_hull', text: 12, name: 'Le Sprint des Allumettières',
    blurb: 'Des Galeries d’Aylmer aux Galeries de Hull. Onze kilomètres. Le chrono arrête jamais.',
    where: 'Galeries d’Aylmer',
    // The one that crosses the whole map: the 148 the entire way, Aylmer to the
    // Hull sector. 11.3 km, and the bonus per gate is the only reason it is
    // possible at all.
    // Principale in front of the Galeries, facing up the route (the old
    // -18.9, -331.2 was inside the mall).
    start: { x: -7.7, z: -278.4, a: 0.074 },
    cps: [
      { x: 1411, z: -309, label: 'chemin d’Aylmer × Fraser' },
      { x: 2518, z: -809, label: 'chemin d’Aylmer, Deschênes' },
      { x: 4014, z: -1566, label: 'la 148, secteur Lucerne' },
      { x: 5219, z: -2168, label: 'la 148, le seuil de Hull' },
      'hullmall',
    ],
    // Pace car: 7:07. Budget 9:07. The marathon of the set, on purpose.
    clock: 62, bonus: 97, money: 80, timeOfDay: 'day',
  },
];

export const CHECKPOINT = [
  {
    id: 'cp_ruelles', name: 'Les ruelles du Vieux',
    blurb: 'Cinq points dans le vieux village. Prends le chemin que tu veux, eux autres suivent les rues.',
    where: 'Paroisse Saint-Paul',
    // Short and dense: the rivals will take the road graph between the gates,
    // and the road graph is not the shortest way across the 1830s grid.
    // Denise-Friend at the church, facing east toward the dépanneur.
    start: { x: -901, z: -433.2, a: 1.684 },
    cps: ['dep', 'sayyad', 'arena', 'mike', 'principale'],
    money: 35, timeOfDay: 'day',
    // Kevin Boucher trades paint in exactly the kind of narrow section this
    // course is made of. Margaret never races with the gang (canon, ledger
    // s.0): Sayyad takes her slot in his Civic. The « margaret » entry in
    // race.js SKILL is only a pace profile, kept so the grid is as hard as it
    // was (the same trick racejobs.js uses).
    // [w6-canon] D32: Kevin Boucher (invented) is off this grid; Adam takes it.
    rivals: [
      { carId: 'sunfire', name: 'Adam', skill: 'dave' },
      { carId: 'civic', name: 'Sayyad', skill: 'margaret' },
    ],
  },
  {
    id: 'cp_traverse', text: 19, name: 'Le Grand Huit d’Aylmer',
    blurb: 'La plage jusqu’à chez vous, huit points, pas de ligne bleue. Le remblai du CN compte comme une rue.',
    where: 'Plage des Cèdres',
    // West end to your own driveway. 5.1 km of road — less if you know about the
    // rail berm, the mall dock and the ciné-parc field.
    // Helenore at the beach (the old -1918.1, -451.5 was in a cottage).
    start: { x: -1804.2, z: -497.8, a: 1.663 },
    cps: ['marina', 'symmes', 'principale', 'arena', 'tims', 'mall', 'ctire', 'home'],
    money: 55, timeOfDay: 'day',
    rivals: [
      ...grid('sayyad'),
      { carId: 'sunfire', name: 'Adam', skill: 'dave' },
    ],
  },
  {
    id: 'cp_deschenes', text: 10, name: 'Le Circuit du Club de Golf',
    blurb: 'Le golf, l’école de l’Aigle, la station, pis l’hôtel. Du gros chemin.',
    where: 'Aréna Frank-Robinson',
    // The fast open one: out to the Club de Golf and back up chemin Vanier. 8 km
    // of tertiary road where the Sunfire's straight-line speed actually tells.
    // Lord-Aylmer at the arena, facing the route out.
    start: { x: -581.8, z: 85.5, a: -0.366 },
    cps: ['golf', 'aigle', 'gas', 'deschenes', 'vanier'],
    money: 60, timeOfDay: 'morning',
    // Eight kilometres of open tertiary road is where Big Dan's V8 momentum
    // finally has somewhere to go.
    rivals: [
      // [w6-canon] D32: Big Dan Beaulieu (invented) is off this grid.
      ...grid('sayyad'),
      { carId: 'sunfire', name: 'Adam', skill: 'dave' },
    ],
  },
  {
    id: 'cp_hull', name: 'La run à Hull',
    blurb: 'Quatre points sur la 148 pis un dans le secteur Hull. Sayyad connaît un raccourci. Toi aussi, peut-être.',
    where: 'Galeries d’Aylmer',
    // The cross-map checkpoint race. Same corridor as the Hull blitz, half the
    // gates, and somebody in a two-thousand-pound Civic beside you the whole way.
    // Principale in front of the Galeries, facing up the route (the old
    // -18.9, -331.2 was inside the mall).
    start: { x: -7.7, z: -278.4, a: 0.074 },
    cps: [
      { x: 2518, z: -809, label: 'chemin d’Aylmer, Deschênes' },
      { x: 4014, z: -1566, label: 'la 148, secteur Lucerne' },
      { x: 5219, z: -2168, label: 'la 148, le seuil de Hull' },
      'hullmall',
    ],
    money: 90, timeOfDay: 'dusk',
    rivals: [...grid('sayyad')],
  },
];

// ---------------------------------------------------------------- best times

const KEY = 'aylmer.modes';
function store() { try { return globalThis.localStorage || null; } catch { return null; } }
export function loadModeBests() {
  try { return JSON.parse(store()?.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
export function saveModeBest(id, secs) {
  const all = loadModeBests();
  if (all[id] != null && all[id] <= secs) return all[id];
  all[id] = secs;
  try { store()?.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
  return secs;
}
export const fmtTime = (s) =>
  s == null ? '-' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- the purse

/** « +45 $ », « Nouveau record: +10 $ » or « Pas de bourse: t’as déjà gagné celle-là ». */
export function purseLine(G, m, course) {
  const pay = scaledPay(G, m, course.money);
  const kind = runPay(G, m).kind;
  if (kind === 'mode-pb') return `Nouveau record: +${pay} $`;
  if (kind === 'mode-repeat') return 'Pas de bourse: tu l’as déjà gagnée. Bats ton record pour 10 $.';
  return `+${pay} $`;
}

// ---------------------------------------------------------------- the missions

/**
 * One course as a mission definition main.js can run. It is racejobs.js's two
 * stages with mode-shaped copy on them — no new runner.
 *
 * The one wrinkle: main.js adds a finished mission's id to G.done and counts
 * that against MISSIONS.length. A course is a mode, not a job, so cleanup()
 * takes the id straight back out and keeps the time in its own table instead.
 */
export function courseMission(course, kind = course.kind) {
  // A blitz is the one with a clock on it. Taking that from the course rather
  // than from the caller means a bare BLITZ[] entry, without the `kind` that
  // COURSES adds, still builds the right stage.
  const blitz = kind ? kind === 'blitz' : course.clock != null;
  const name = courseName(course);
  const lead = (course.rivals && course.rivals[0]) || null;
  // Rebuilt on every start, not once: the taunts inside it are drawn from the
  // shuffle bag, and a rival who says the same thing every single time you line
  // up against him is worse than a rival who says nothing.
  const makeCfg = () => ({
    id: course.id,
    title: name,
    brief: course.blurb,
    giver: 'principale',            // never shown: modes are picked, not found
    timeOfDay: course.timeOfDay || 'day',
    start: course.start,
    cps: course.cps,
    laps: course.laps || 1,
    money: course.money,
    rivals: course.rivals || [],
    gateR: blitz ? BLITZ_R : CHECK_R,
    noRoute: !blitz,
    showDist: !blitz,
    clock: blitz ? course.clock : undefined,
    bonus: blitz ? course.bonus : undefined,

    gridText: `${name} : sur la ligne`,
    gridSub: blitz
      ? `E pour partir le chrono : ${course.clock} secondes au départ, pis +${course.bonus} à chaque checkpoint`
      : 'E quand t’es prêt. Pas de ligne bleue dans cette course-là, le chemin c’est ton affaire',
    gridHold: blitz ? 'E : partir le chrono' : 'E : on part',
    // The grid is where somebody says something. A blitz has nobody in it, so
    // it gets the mode's own line; a checkpoint race gets whoever showed up.
    gridToast: blitz
      ? 'BLITZ. Le chrono arrête jamais.'
      : ('CHECKPOINT. Trouve ton chemin.\n' + (saidBy(lead, 'pre') || '')).trim(),
    intro: 'Trois. Deux. Un.',
    text: name,
    sub: blitz
      ? 'W à fond, le GPS trace la ligne bleue jusqu’au prochain pilier. Chaque checkpoint te redonne du temps'
      : 'W à fond. Le pilier jaune te dit OÙ, pas COMMENT. Les ruelles, les stationnements pis les rampes comptent',
    hint: blitz
      ? 'Suis la ligne bleue. Espace dans les courbes serrées, pis lâche pas le pied entre les checkpoints.'
      : 'Tab ouvre la grande carte: le prochain checkpoint est dessus. Coupe par où tu veux, eux autres suivent les rues.',
    clockFail: 'Le chrono est à zéro. Le blitz est fini.',
    // A function: racejobs.js calls it at the finish line, when the purse is
    // known. The full purse is a first win; after that only a new best pays.
    win: (G, m) => { const purse = purseLine(G, m, course); return blitz
      ? `${name.toUpperCase()} : FINI.\nT’as battu le chrono.\n${purse}`
      // Beaten rivals make excuses, and the written ones are very good excuses.
      : [`${name.toUpperCase()} : PREMIER.`, purse,
        // The roster says what each of them does when they lose. It is the best
        // half of the writing and it belongs on the screen you see least often.
        lead && lead.rival ? rivalWhenLosing(rival(lead.rival)) : '',
        saidBy(lead, 'beaten')].filter(Boolean).join('\n'); },
    // `rv` is the live Rival; match it back to the grid entry so the loser gets
    // his own voice and not a stranger's.
    lose: (rv) => {
      const entry = (course.rivals || []).find((e) => e.name === rv.name) || rv.name;
      return `${rv.name} est arrivé avant toi.\n${saidBy(entry, 'ahead')}`.trim();
    },
  });

  const def = raceMission(makeCfg());
  def.build = (ctx) => raceStages(makeCfg(), ctx);
  def.mode = kind;
  def.course = course;
  const inner = def.cleanup;
  def.cleanup = (G, m) => {
    if (inner) inner(G, m); else endRace(G);
    // A mode is not a job: take the id back out of the completed set so the
    // "x/y jobs faites" count keeps telling the truth, and keep the time here.
    if (G.done && G.done.has(course.id)) {
      G.done.delete(course.id);
      const t = courseTime(m);   // [w7-polish] race time from GO, the medals' clock
      if (t > 0) {
        const best = saveModeBest(course.id, t);
        // [w7-replay] the medal line already says « Nouveau record ».
        if (G.hud && best === t && !m.medal) G.hud.toast(`MEILLEUR TEMPS : ${fmtTime(t)}`, 2400);
      }
    }
  };
  return def;
}

/** Every course, in the order the picker shows them. */
export const COURSES = [
  ...BLITZ.map((c) => ({ ...c, kind: 'blitz' })),
  ...CHECKPOINT.map((c) => ({ ...c, kind: 'checkpoint' })),
];

const MISSION_CACHE = new Map();
export function missionFor(course) {
  let m = MISSION_CACHE.get(course.id);
  if (!m) { m = courseMission(course); MISSION_CACHE.set(course.id, m); }
  return m;
}

export const MODES = [
  {
    id: 'cruise', name: 'Cruise', fr: 'Balade',
    blurb: 'Pas de chrono, pas de barrières. Les jobs de la gang sont là-dedans : roule jusqu’à un pilier jaune pis appuie sur ⏎.',
  },
  {
    id: 'blitz', name: 'Blitz', fr: 'Blitz',
    blurb: 'Un parcours, un chrono, personne d’autre. Chaque checkpoint te redonne du temps. Rate-en un pis c’est fini.',
  },
  {
    id: 'checkpoint', name: 'Checkpoint', fr: 'Checkpoint',
    blurb: 'Des checkpoints éparpillés pis des chums qui courent contre toi. Pas de ligne bleue: le chemin, c’est à toi de le trouver.',
  },
];

// [w7-crashnight] a mode from outside this file (Crash Night): a tab in the
// picker with one row, started by its own desc.start(G). Registered once.
const EXTRA = new Map();
export function registerMode(desc) {
  // A built-in tab (checkpoint, blitz...) is never added twice: shortcuts.js
  // calls this for C-02a's gate registry, which is not this one.
  if (!desc || !desc.id || EXTRA.has(desc.id) || MODES.some((m) => m.id === desc.id)) return false;
  EXTRA.set(desc.id, desc);
  MODES.push({ id: desc.id, name: desc.name, fr: desc.fr, blurb: desc.blurb });
  return true;
}
export const extraMode = (id) => EXTRA.get(id) || null;

// ---------------------------------------------------------------- the picker

const CSS = `
#modepick{position:fixed;inset:0;z-index:70;background:rgba(8,12,15,.90);
  display:flex;align-items:center;justify-content:center;
  font:14px/1.5 Helvetica,Arial,sans-serif;color:#e9edf2}
#modepick .box{width:min(920px,94vw);max-height:88vh;overflow:auto;
  background:#141b20;border:1px solid #2d3942;border-radius:10px;padding:22px 26px;
  box-shadow:0 24px 70px rgba(0,0,0,.6)}
#modepick h2{margin:0 0 2px;font-size:22px;letter-spacing:.04em}
#modepick .tag{margin:0 0 18px;color:#8fa0ad;font-size:12.5px}
#modepick .mrow{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
#modepick .m{flex:1 1 200px;text-align:left;background:#1d262c;border:1px solid #33414b;
  border-radius:8px;padding:10px 12px;color:#e9edf2;cursor:pointer}
#modepick .m.on{border-color:#ffc94d;background:#2a2a1c}
#modepick .m b{display:block;font-size:15px;letter-spacing:.05em}
#modepick .m span{display:block;color:#93a3b0;font-size:11.5px;margin-top:3px}
#modepick .c{display:flex;gap:12px;align-items:baseline;width:100%;text-align:left;
  background:#192228;border:1px solid #2b3640;border-radius:7px;padding:9px 12px;
  color:#e9edf2;cursor:pointer;margin-bottom:7px}
#modepick .c:hover{border-color:#ffc94d}
#modepick .c i{font-style:normal;color:#ffc94d;font-weight:700;width:16px}
#modepick .c .t{font-weight:700}
#modepick .c .w{color:#8fa0ad;font-size:11.5px}
#modepick .c .b{margin-left:auto;color:#9fb0bd;font-size:12px;white-space:nowrap}
#modepick .foot{margin-top:14px;color:#7f8f9c;font-size:11.5px;display:flex;gap:16px}
#modepick .foot b{color:#c9d6e0}
#modepick .c.off{opacity:.42;cursor:default}
#modepick .tg{display:inline-block;margin:3px 4px 0 0;padding:0 6px;border-radius:9px;font-size:11.5px;color:#141b20}
#modepick .tg[data-tier=or]{background:#f2c14e}#modepick .tg[data-tier=argent]{background:#c8d0d8}#modepick .tg[data-tier=bronze]{background:#c98a4b}
#modepick .disc{display:inline-block;width:14px;height:14px;border-radius:50%;border:1.5px solid #5d6b75;vertical-align:-2px;margin-right:4px}
#modepick .disc[data-tier=or]{background:#f2c14e;border-color:#f2c14e}#modepick .disc[data-tier=argent]{background:#c8d0d8;border-color:#c8d0d8}#modepick .disc[data-tier=bronze]{background:#c98a4b;border-color:#c98a4b}
#modepick .busy{margin-top:12px;padding:9px 12px;border-radius:7px;white-space:pre-line;
  background:#2a2118;border:1px solid #6a5326;color:#ffd48a;font-size:12px}
`;

const state = { open: false, mode: 'blitz', el: null, api: null };

// Everything DOM in this file is written defensively on purpose: the smoke tests
// run it against a two-method `document` stub, and a mode picker that throws
// under node would take the whole suite with it.
function css() {
  if (typeof document === 'undefined' || !document.createElement) return;
  if (!document.head || !document.head.appendChild) return;
  if (document.getElementById('modepickcss')) return;
  const st = document.createElement('style');
  st.id = 'modepickcss';
  st.textContent = CSS;
  document.head.appendChild(st);
}

// [w7-replay] The three target times as pills, gold named Sayyad and silver
// Adam (D41), bronze unnamed, then the player's own medal best (m.race.t).
export function targetPills(id) {
  const t = thresholdsFor(id);
  if (!t) return '';
  const word = { or: 'Or', argent: 'Argent', bronze: 'Bronze' };
  return ['or', 'argent', 'bronze'].map((k) =>
    `<span class="tg" data-tier="${k}">${word[k]} ${clockText(t[k])}${TARGET_NAMES[k] ? ' ' + TARGET_NAMES[k] : ''}</span>`).join('');
}
function medalBest(id) {
  let r = null;
  try { r = save.loadRecord ? save.loadRecord(id) : null; } catch { r = null; }
  return r && !r.legacy ? r.t : null;
}
function courseRow(G, c, i) {
  const best = medalBest(c.id);
  const won = best != null ? medalFor(c.id, best) : null;
  const field = (c.rivals || []).map((r) => r.name).join(', ');
  const budget = c.kind === 'blitz'
    ? `${c.clock} s + ${c.bonus}/checkpoint`
    : `contre ${field || 'personne'}`;
  return `<button class="c" data-id="${c.id}">` +
    `<i>${i + 1}</i>` +
    `<span><span class="t"><span class="disc"${won && won.medal ? ` data-tier="${won.medal}"` : ''}></span>${courseName(c)}</span><br><span class="w">${c.blurb}</span>` +
    `<br>${targetPills(c.id)}</span>` +
    `<span class="b">${c.cps.length} checkpoints · ${budget}<br>` +
    `<span class="w">départ: ${c.where} · ton record ${best != null ? runText(best) : 'aucun'}</span></span></button>`;
}

// A story job is running and it is not one of ours. Starting a course would
// throw it away, and losing an hour of Sayyad's evening to a mis-click is not
// a trade anybody agreed to — so the rows go grey and the footer says why.
// W8-BUGS: the first job the game started by itself, untouched, does not count
// (missionkit yieldsToMode); startMission closes it quietly instead.
export const busyWith = (G) => (G.mission && G.mission.def && !G.mission.def.mode && !yieldsToMode(G.mission)
  ? G.mission.def.title : null);

function paint(G) {
  const el = state.el;
  if (!el) return;
  const list = state.mode === 'cruise' ? []
    : COURSES.filter((c) => c.kind === state.mode);
  const mode = MODES.find((m) => m.id === state.mode) || MODES[0];
  const busy = busyWith(G);
  el.innerHTML = '<div class="box">' +
    '<h2>LES MODES</h2>' +
    '<p class="tag">Aylmer au complet, trois façons de la conduire.</p>' +
    '<div class="mrow">' + MODES.map((m) =>
      `<button class="m${m.id === state.mode ? ' on' : ''}" data-mode="${m.id}">` +
      `<b>${m.fr.toUpperCase()}</b><span>${m.blurb}</span></button>`).join('') + '</div>' +
    (EXTRA.has(state.mode)   // [w7-crashnight]
      ? `<button class="c" data-id="${state.mode}"><i>↵</i><span><span class="t">${EXTRA.get(state.mode).fr}</span><br>` +
        `<span class="w">${EXTRA.get(state.mode).blurb}</span><br><span class="w">${EXTRA.get(state.mode).row ? EXTRA.get(state.mode).row() : ''}</span></span></button>`
      : state.mode === 'cruise'
      ? '<button class="c" data-id="cruise"><i>↵</i><span><span class="t">Partir en balade</span><br>' +
        '<span class="w">Aucun chrono. Les piliers jaunes sur la carte, c’est les jobs de la gang.</span></span>' +
        `<span class="b">${jobsDone(G.done ? G.done.size : 0)}</span></button>`
      : '<p class="tag">Temps à battre</p>' + list.map((c, i) => courseRow(G, c, i)).join('')) +
    (busy
      ? `<div class="busy">T’es en pleine job : « ${busy} ».\n` +
        'Finis-la, ou Retour arrière pour l’abandonner, avant de partir une course.</div>'
      : '') +
    '<div class="foot"><span><b>1 à 4</b> choisir un parcours</span>' +
    '<span><b>←/→</b> changer de mode</span><span><b>M</b> ou <b>Échap</b> fermer</span>' +
    `<span>${mode.name}</span></div></div>`;
  if (busy) for (const b of el.querySelectorAll('.c')) {
    if (b.dataset.id !== 'cruise') { b.disabled = true; b.classList.add('off'); }
  }
  for (const b of el.querySelectorAll('.m')) b.onclick = () => { state.mode = b.dataset.mode; paint(G); };
  for (const b of el.querySelectorAll('.c')) b.onclick = () => pick(G, b.dataset.id);
}

function overlay(G) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  if (state.el) return state.el;
  const host = document.body || document.documentElement;
  if (!host || !host.appendChild) return null;
  css();
  const el = document.createElement('div');
  el.id = 'modepick';
  el.style.display = 'none';
  host.appendChild(el);
  state.el = el;
  return el;
}

/** Open or close the picker. While it is open the sim is parked, like the map. */
export function openModes(G, on) {
  const el = overlay(G);
  if (!el) return;
  state.open = !!on;
  // U7: through the one door, so opening the picker closes the pause menu (and
  // the other way round) and the HUD stops drawing behind it.
  setModal('modes', !!on);
  if (on) {
    state.mode = G.modeNow === 'cruise' ? 'blitz' : (G.modeNow || 'blitz');
    paint(G);
    G.prevMode = G.mode;
    G.mode = 'modes';
    if (G.hud) G.hud.prompt(null);
  } else if (G.mode === 'modes') {
    G.mode = G.prevMode || 'drive';
    // Whoever closed this used a key that main.js is also listening for.
    if (G.input) G.input.consume('Escape', 'KeyM');
  }
}

function pick(G, id) {
  if (id !== 'cruise' && busyWith(G)) return;      // the grey rows mean it
  if (id === 'cruise') {
    openModes(G, false);
    startCruise(G);
    return;
  }
  const ex = EXTRA.get(id);   // [w7-crashnight]
  if (ex) { openModes(G, false); if (ex.start) ex.start(G); return; }
  const c = COURSES.find((x) => x.id === id);
  if (!c) return;
  openModes(G, false);
  startCourse(G, c);
}

/** Drop the timed mode and go back to free roam with the story jobs in it. */
export function startCruise(G) {
  if (G.mission && G.mission.def && G.mission.def.mode) {
    // A course is running: abandon it the way Backspace would.
    if (G.failMission) G.failMission('Abandonné. Retour en balade.');
  }
  G.modeNow = 'cruise';
  if (G.hud) {
    G.hud.toast('CRUISE\nPas de chrono. Roule jusqu’à un pilier jaune pis ⏎ pour prendre la job.', 2800);
  }
}

/**
 * Put the truck on the start line and hand the course to the mission runner.
 * The teleport is deliberate and it is what every arcade racer does: you picked
 * a race off a menu, you should not then have to drive across town to it.
 */
export function startCourse(G, course, opts) {
  if (!state.api || !state.api.startMission) return false;
  // W8-BUGS: an untouched auto-started first job is not failed (no RATÉ card
  // for a job the player never chose); startMission closes it quietly.
  if (G.mission && G.failMission && !yieldsToMode(G.mission)) G.failMission('Abandonné.');
  placeOnStart(G, course);
  G.modeNow = course.kind;
  G.routeKey = '';
  G.waypoint = null;
  if (G.hud) G.hud.toast(`${courseName(course).toUpperCase()}\nSur la ligne. E pour partir.`, 2200);
  state.api.startMission(missionFor(course), opts);   // [w7-replay] opts: { card: false } on a rerun
  return true;
}

/** The truck on a course's start line (startCourse's teleport, no mission). */
function placeOnStart(G, course) {
  let p = at(course.start);
  if (G.veh && p && G.world) {
    // The authored line passes on today's map (tools/smoke_racestarts.mjs);
    // this is the net for the car you are in and for the next rebake. A
    // moved object start is written back so the grid pillar, the rivals and
    // the Track all use the same line the truck is on.
    const first = at(course.cps[0]);
    const route = first && G.nav ? G.nav.route(p.x, p.z, first.x, first.z) : null;
    const q = startPose(G.world, p, G.veh.spec, route);
    if (q.moved > 0.01) {
      if (typeof course.start === 'object') Object.assign(course.start, { x: q.x, z: q.z, a: q.a });
      p = q;
    }
  }
  if (G.veh && p) {
    G.veh.reset(p.x, p.z, p.a != null ? p.a : (p.yaw || 0),
      G.phys && G.phys.groundY ? G.phys.groundY(p.x, p.z) : 0);
    // reset() does not touch `onRoad`, and a stale one fires cars.js's kerb kick
    // on the first tick after the move — which on a start line reads as the
    // truck hopping into the air before the countdown has even started.
    if (G.world && G.world.roadAt) G.veh.onRoad = G.world.roadAt(G.veh.x, G.veh.z);
  }
  return p || null;
}

// [w7-polish] A save taken mid-course or mid Crash Night (W6-CRASHNIGHT,
// W6-REPLAY). Neither is a story job, so main.js resumeMission found no def and
// said « Job perdue », which is false: nothing was lost, a run is not resumed
// from a save. A course puts the truck back on its start line, free roaming
// (Cruise), and says M runs it again. A registered mode (Crash Night) leaves
// the car where it was saved, free roaming. null = not a mode id (a story job).
export function resumeModeSave(G, id) {
  const course = COURSES.find((x) => x.id === id) || null;
  const extra = course ? null : EXTRA.get(id) || null;
  if (!course && !extra) return null;
  if (course) placeOnStart(G, course);
  G.modeNow = 'cruise';
  G.routeKey = '';
  G.waypoint = null;
  const name = course ? courseName(course) : (extra.fr || extra.name || id);
  if (G.hud) G.hud.toast(`${name}\nUne run reprend pas d\u2019une sauvegarde. T\u2019es en balade`
    + (course ? ' sur la ligne de départ' : '') + '. M pour la relancer.', 3200);
  return { id, course, extra };
}

// ---------------------------------------------------------------- [w7-replay] une autre run

/** R on a course: straight back on the line, no brief card. false = not a course. */
export function restartRun(G, id) {
  const c = COURSES.find((x) => x.id === id);
  if (!c) return false;
  return startCourse(G, c, { card: false });
}
/** After a finish: R restarts the course for the next 10 s. */
export function offerRerun(G, id) {
  if (!COURSES.some((x) => x.id === id)) return false;
  G.rerun = { id, left: 10 };
  return true;
}
/** Per frame, one null check when no window is open. Consumes KeyR on a restart. */
export function tickRerun(G, dt, input) {
  const r = G.rerun;
  if (!r) return false;
  if (G.mission) { G.rerun = null; return false; }
  if (input && input.hit && input.hit('KeyR')) {
    if (input.consume) input.consume('KeyR');
    G.rerun = null;
    return restartRun(G, r.id);
  }
  r.left -= Math.max(0, dt || 0);
  if (r.left <= 0) G.rerun = null;
  return false;
}

// ---------------------------------------------------------------- the hook

/**
 * main.js hook. `api.startMission` is main.js's own, so a course goes through
 * exactly the same door as every other job — intro card, clock, HUD and all.
 */
export function installModes(G, api) {
  state.api = api || {};
  G.modeNow = G.modeNow || 'cruise';
  G.modes = { MODES, COURSES, open: (on) => openModes(G, on), start: (id) => pick(G, id) };
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', (e) => {
      if (!state.open) return;
      if (e.code === 'Escape' || e.code === 'KeyM') { e.preventDefault(); openModes(G, false); return; }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        const i = MODES.findIndex((m) => m.id === state.mode);
        const n = MODES.length;
        state.mode = MODES[(i + (e.code === 'ArrowRight' ? 1 : n - 1) + n) % n].id;
        paint(G);
        return;
      }
      const d = /^Digit([1-9])$/.exec(e.code);
      if (d) {
        e.preventDefault();
        if (state.mode === 'cruise') { pick(G, 'cruise'); return; }
        if (busyWith(G)) return;
        if (EXTRA.has(state.mode)) { pick(G, state.mode); return; }   // [w7-crashnight]
        const list = COURSES.filter((c) => c.kind === state.mode);
        const c = list[+d[1] - 1];
        if (c) pick(G, c.id);
      }
    });
  }
  return G.modes;
}

/** Per-tick, from race.js's hook. Owns the M key. */
export function updateModes(G, dt) {
  if (G.mode !== 'drive') return;
  if (G.input && G.input.hit && G.input.hit('KeyM') && !G.story?.active) {
    openModes(G, true);
    return;
  }
  // There used to be a first-run toast here — « M — les modes / Blitz,
  // Checkpoint, Balade » — and it fired six seconds into a brand new game, in
  // 26 px type across the middle of the screen, on top of the story card
  // (BACKLOG U8, gemini-inbox "ten things"). M is on the key legend and in the
  // pause menu's Touches tab; a mode picker does not need to shout over the
  // opening of the game to be discovered.
  // Falling out of a course (finished, failed, abandoned) is falling back into
  // Cruise, which is where the story jobs are.
  if (!G.mission && G.modeNow !== 'cruise') G.modeNow = 'cruise';
}

/** Tests: forget the overlay. */
export function resetModes() {
  state.open = false;
  state.el = null;
}
