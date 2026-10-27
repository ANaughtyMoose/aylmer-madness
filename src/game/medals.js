// [w6-replay] [w7-replay] Medals for timed runs: pure, no DOM, no storage, no
// imports, so it is safe inside the race.js / modes.js / racejobs.js import
// cycle. replay.js does the saving.
//
// Rule (spec C-02a): or = round(pace * 0.90), argent = round(pace),
// bronze = round(pace * 1.15), whole seconds, lower is better, ties go to the
// player. A blitz bronze leaves at least 10 s on the real clock.
//
// Two kinds of key share one table:
//   - a story stage, "<mission id> <stage>/<stages>", pace from
//     tools/timers_pace.json (pace car, Ranger, or cart 29 km/h), 0.1 s;
//   - a course id (bz_vieux, cp_ruelles), pace from the smoke_modes pace car
//     (tools/smoke_modes.mjs checks the frozen numbers stay within 8 %).
export const MEDALS = ['or', 'argent', 'bronze'];
export const MEDAL_K = { or: 0.90, argent: 1.00, bronze: 1.15 };
export const BLITZ_RESERVE = 10;
// D41 (Tom, 13 Oct): Sayyad and Adam lend their first names to the course
// target times. Bronze stays unnamed. Set to {} to print no names.
export const TARGET_NAMES = { or: 'Sayyad', argent: 'Adam' };
export const STAGE_PACE = {"sayyad 3/3":18.4,"arcbache 2/5":84.8,"golfcart 7/12":84.5,"school 1/1":190.9,"russellroyal 2/13":146.2,"curfew 1/1":119.4,"dep 2/2":43.1,"margaretdental 2/2":85,"highwayhull 1/3":387,"highwayhull 2/3":263.3,"highwayhull 3/3":47,"chelsea 1/1":342.2,"blitz 2/2":154.2};
// Course pace in seconds from GO: the smoke_modes pace car (seeded), measured
// on the Colab VM 27 Oct 2026 at 96024fb (merge of fix/look-on-qr 786acf4).
export const COURSE_PACE = {
  bz_vieux: 109.7, bz_aylmer: 286.2, bz_ouest: 209.7, bz_hull: 393.8,
  cp_ruelles: 145.1, cp_traverse: 263.5, cp_deschenes: 330.3, cp_hull: 393.1,
};
// The real blitz budget: clock + bonus x (gates - 1) (the last gate gives
// nothing). smoke_medals checks it against modes.js.
export const BLITZ_BUDGET = { bz_vieux: 140, bz_aylmer: 336, bz_ouest: 260, bz_hull: 450, 'blitz 2/2': 210 };
// Stages that share one clock (a chase over several flags): timers.mjs paces
// them as one run, so the medal judges them as one run too.
export const SHARED_KIND = /^(chase\d+|bikes)$/;

export function stageKey(id, idx, n) { return id + ' ' + (idx + 1) + '/' + n; }
export function isCourse(key) { return Object.prototype.hasOwnProperty.call(COURSE_PACE, key); }

/** { or, argent, bronze } in whole seconds from a pace, or null. */
export function thresholdsFromPace(pace, budget = null) {
  if (!(pace > 0)) return null;
  const t = {
    or: Math.round(pace * MEDAL_K.or),
    argent: Math.round(pace * MEDAL_K.argent),
    bronze: Math.round(pace * MEDAL_K.bronze),
  };
  if (budget > 0) t.bronze = Math.min(t.bronze, budget - BLITZ_RESERVE);
  return t;
}

// Built once per key: the tables are frozen, and a fail or a finish should
// cost a lookup, not an allocation. Callers never mutate the result.
const T_CACHE = new Map();
export function thresholdsFor(key) {
  let t = T_CACHE.get(key);
  if (t === undefined) {
    t = thresholdsFromPace(STAGE_PACE[key] ?? COURSE_PACE[key], BLITZ_BUDGET[key]);
    if (t) Object.freeze(t);
    T_CACHE.set(key, t);
  }
  return t;
}

/** The medal key a timed stage starts, or null. */
export function stageMedalKey(def, stages, idx) {
  if (!def || !stages || !stages[idx]) return null;
  if (isCourse(def.id)) return null;           // a course is judged as a whole run
  const k = stageKey(def.id, idx, stages.length);
  return STAGE_PACE[k] != null ? k : null;
}
/** Last stage index of the run that starts at idx (a shared chase clock). */
export function stageRunEnd(stages, idx) {
  const st = stages[idx];
  let j = idx;
  if (st && SHARED_KIND.test(st.kind || '')) {
    while (j + 1 < stages.length && SHARED_KIND.test(stages[j + 1].kind || '') && stages[j + 1].time === st.time) j++;
  }
  return j;
}
/** Records id for a medal key: course ids as is, stages as stage:<job>:<n>-<of>. */
export function recordId(key) {
  if (isCourse(key)) return key;
  const m = /^([a-z0-9_]+) (\d+)\/(\d+)$/i.exec(key || '');
  return m ? `stage:${m[1]}:${m[2]}-${m[3]}` : null;
}

const NEXT = { or: null, argent: 'or', bronze: 'argent', null: 'bronze' };

/** -> { key, value, medal, next, gap, margin, t } or null when the key has no thresholds. */
export function medalFor(key, value) {
  const t = thresholdsFor(key);
  if (!t || !(value >= 0)) return null;
  const medal = MEDALS.find((m) => value <= t[m]) || null;
  const next = NEXT[medal];
  const gap = next ? Math.ceil((value - t[next]) * 10 - 1e-6) / 10 : null;
  const margin = medal === 'or' ? Math.floor((t.or - value) * 10 + 1e-6) / 10 : null;
  return { key, value, medal, next, gap, margin, t };
}

export function medalWord(medal, en = false) {
  if (!medal) return '';
  if (en) return { or: 'Gold', argent: 'Silver', bronze: 'Bronze' }[medal];
  return { or: 'Or', argent: 'Argent', bronze: 'Bronze' }[medal];
}
export function eyebrow(res, en = false) {
  if (!res) return '';
  if (!res.medal) return en ? 'NO MEDAL' : 'PAS DE MÉDAILLE';
  return medalWord(res.medal, en).toUpperCase();
}

const dec = (x, en) => x.toFixed(1).replace('.', en ? '.' : ',');
/** '0,4 s' under a minute, '1:04,2' from a minute; en uses a dot. */
export function gapText(gap, en = false) {
  if (gap < 60) return dec(gap, en) + ' s';
  const m = Math.floor(gap / 60), s = gap - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + dec(s, en);
}
/** A run time with tenths: '1:49,0' (en '1:49.0'). */
export function runText(s, en = false) {
  const tenths = Math.floor(s * 10 + 1e-6) / 10;
  const m = Math.floor(tenths / 60), r = tenths - m * 60;
  return m + ':' + (r < 10 ? '0' : '') + dec(r, en);
}
/** A threshold, whole seconds: '1:49'. */
export function clockText(s) {
  return Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
}
/** '340 m' under a kilometre (to 10 m), else '1,2 km' (en '1.2 km'). */
export function distText(m, en = false) {
  if (m < 1000) return Math.max(10, Math.round(m / 10) * 10) + ' m';
  return dec(m / 1000, en) + ' km';
}

/**
 * « Temps à battre : Or 1:38 (Sayyad) · Argent 1:49 (Adam) · Bronze 2:05 ».
 * Names only on courses (D41 is about the course record table); a story
 * stage prints the bare times, with « Étape n » when a job has several.
 */
export function medalNote(key, en = false, label = '') {
  const t = thresholdsFor(key);
  if (!t) return '';
  const names = isCourse(key) ? TARGET_NAMES : {};
  const tier = (m) => `${medalWord(m, en)} ${clockText(t[m])}` + (names[m] ? ` (${names[m]})` : '');
  const head = label || (en ? 'Times to beat' : 'Temps à battre');
  return `${head}${en ? ': ' : ' : '}${MEDALS.map(tier).join(' · ')}`;
}
/** Every timed stage of a story job, one line each; '' when none. */
export function jobMedalNote(def, stages, en = false) {
  if (!def || !stages) return '';
  if (isCourse(def.id)) return medalNote(def.id, en);
  const keys = [];
  for (let i = 0; i < stages.length; i++) {
    const k = stageMedalKey(def, stages, i);
    if (k) { keys.push([i, k]); i = stageRunEnd(stages, i); }
  }
  if (!keys.length) return '';
  if (keys.length === 1) return medalNote(keys[0][1], en);
  return keys.map(([i, k]) => medalNote(k, en, (en ? 'Stage ' : 'Étape ') + (i + 1))).join('\n');
}

const DE = { or: 'de l’or', argent: 'de l’argent', bronze: 'du bronze' };
/**
 * End-of-run line, spec C-02a: « 1:38,4. Argent. 0,4 s de l’or. »,
 * « 1:36,2. Or, avec 1,8 s d’avance. », « 2:09,3. 4,3 s du bronze. »,
 * then « Nouveau record. » (res.newBest) and « R : une autre run » (res.rerun).
 */
export function resultLine(res, en = false) {
  if (!res) return '';
  const bits = [runText(res.value, en) + '.'];
  if (res.medal === 'or') {
    bits.push(res.margin > 0
      ? (en ? `Gold, ${gapText(res.margin, true)} to spare.` : `Or, avec ${gapText(res.margin)} d’avance.`)
      : medalWord('or', en) + '.');
  } else {
    if (res.medal) bits.push(medalWord(res.medal, en) + '.');
    bits.push(en ? `${gapText(res.gap, true)} off ${medalWord(res.next, true).toLowerCase()}.`
      : `${gapText(res.gap)} ${DE[res.next]}.`);
  }
  if (res.newBest) bits.push(en ? 'New record.' : 'Nouveau record.');
  if (res.rerun) bits.push(en ? 'R: another run' : 'R : une autre run');
  return bits.join(' ');
}

/**
 * A fail has no finish time, so the line is an estimate and says so:
 * « Il restait 340 m, environ 6 s du bronze. » When the estimate already
 * beats bronze (a crash, a rival first), only the distance: « Il restait 210 m. »
 *   elapsed: seconds into the run; rest: metres left; avg: metres per second so far.
 */
export function failLine(key, elapsed, rest, avg, en = false) {
  const t = thresholdsFor(key);
  if (!t || !(rest >= 0) || !(elapsed >= 0)) return '';
  const est = rest / Math.max(5, avg || 0);
  const gap = Math.ceil(elapsed + est - t.bronze - 1e-6);
  const d = distText(rest, en);
  if (gap <= 0) return en ? `${d} to go.` : `Il restait ${d}.`;
  return en ? `${d} to go, about ${gap} s off bronze.` : `Il restait ${d}, environ ${gap} s du bronze.`;
}
