// [w7-replay] « Une autre run »: judging a timed run against its medals and
// keeping the record (spec C-02a, records through save.js per C-02b).
//
// main.js calls four things, each once per stage or per run, never per frame:
//   stageStart(G, m)        applyStage: opens a medal run on a timed story stage
//   stageDone(G, m)         a stage just passed: closes the run, returns the result
//   failLine(G, m, en)      a real fail (not an abandon): the estimate line
//   lastResult()            for window.AYLMER.medal and the review beats
//
// A story stage is judged on its own clock (a chase over several flags is one
// run: medals.stageRunEnd). A course is judged as a whole run on m.race.t, the
// time from GO, never m.elapsed (which includes the grid and the E hold).
// This file imports save.js and medals.js only, both outside the race.js cycle.
import * as save from './save.js';
import {
  medalFor, recordId, failLine as estimateLine, stageMedalKey, stageRunEnd, isCourse,
} from './medals.js';

let LAST = null;
export function lastResult() { return LAST; }
export function resetReplay() { LAST = null; }

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** applyStage: open a medal run when this stage starts a timed story clock. */
export function stageStart(G, m) {
  if (!m || !m.def) return null;
  if (m.medalRun && m.idx <= m.medalRun.end) return m.medalRun;   // a chase flag in the same run
  m.medalRun = null;
  const key = stageMedalKey(m.def, m.stages, m.idx);
  if (!key) return null;
  const d0 = G.veh && m.target ? dist(G.veh, m.target) : 0;
  m.medalRun = { key, start: m.idx, end: stageRunEnd(m.stages, m.idx), t0: m.elapsed || 0, d0 };
  return m.medalRun;
}

function judge(G, m, key, value) {
  const res = medalFor(key, value);
  if (!res) return null;
  const id = recordId(key);
  const rec = id && save.saveRecord ? save.saveRecord(id, value, { better: 'lower', by: G.character, car: G.carId }) : null;
  res.id = id;
  res.isNew = !!(rec && rec.ok && rec.isNew);
  res.newBest = res.isNew && rec.prev != null;     // a first run is not « Nouveau record »
  res.prev = rec ? rec.prev : null;
  res.rank = rec ? rec.rank : -1;
  res.at = typeof performance !== 'undefined' ? performance.now() : Date.now();
  res.outcome = 'done';
  LAST = res;
  if (m) m.medal = res;
  return res;
}

/**
 * A stage just passed (call before m.idx moves on). Returns the medal result
 * when this closed a timed run, else null.
 */
export function stageDone(G, m) {
  if (!m || !m.def) return null;
  const last = m.idx >= m.stages.length - 1;
  if (isCourse(m.def.id)) {
    if (!last || !m.race || !(m.race.t > 0)) return null;
    return judge(G, m, m.def.id, m.race.t);
  }
  const run = m.medalRun;
  if (!run || m.idx !== run.end) return null;
  m.medalRun = null;
  // A race stage pauses its clock through the count-in; its own timer is the run.
  const value = m.race && m.race.t > 0 ? m.race.t : (m.elapsed || 0) - run.t0;
  return judge(G, m, run.key, value);
}

/**
 * A real fail: how far was left, as an estimate. '' when the run is untimed,
 * the race never started, or there is nothing honest to say.
 */
export function failLine(G, m, en = false) {
  if (!m || !m.def || !G.veh) return '';
  const R = m.race;
  if (isCourse(m.def.id)) {
    if (!R || !R.going || !(R.t > 0) || !R.track) return '';
    const rest = Math.max(0, R.track.total - R.track.progress(R.me.done, G.veh.x, G.veh.z));
    const done = R.track.total - rest;
    LAST = { key: m.def.id, outcome: 'fail', rest };
    return estimateLine(m.def.id, R.t, rest, done / R.t, en);
  }
  const run = m.medalRun;
  if (!run || !m.target) return '';
  const elapsed = R && R.t > 0 ? R.t : (m.elapsed || 0) - run.t0;
  if (!(elapsed > 0)) return '';
  let rest, done;
  if (R && R.going && R.track) {
    rest = Math.max(0, R.track.total - R.track.progress(R.me.done, G.veh.x, G.veh.z));
    done = R.track.total - rest;
  } else {
    // A chase spans several flags: straight line to this flag only, so the
    // estimate leans short, which is the honest side for « environ ».
    rest = dist(G.veh, m.target);
    done = Math.max(0, run.d0 - rest);
  }
  LAST = { key: run.key, outcome: 'fail', rest };
  return estimateLine(run.key, elapsed, rest, done / elapsed, en);
}
