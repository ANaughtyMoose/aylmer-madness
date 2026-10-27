#!/usr/bin/env node
// Re-pace every story clock off the Mac (W6-CURFEW, 27 Oct 2026). Same work as
// `node tools/timers.mjs --pace`, but prints everything to stdout so a remote run
// (the Colab queue, ct.py runs tools/<name> with no arguments) carries the
// numbers back in its log:
//
//   node tools/run_pace.mjs
//
// It prints the pace JSON between PACE-JSON markers (paste it into
// tools/timers_pace.json), then one line per clock, its clock against the rule.
// It writes nothing. Not part of the suite: it bakes the world (about a minute).
import { paceAll, clocks, staticNav, rangerCtx, keyOf, clockFor } from './timers.mjs';

const pace = await paceAll();
console.log('PACE-JSON-BEGIN');
console.log(JSON.stringify(pace, null, 1));
console.log('PACE-JSON-END');
let off = 0;
for (const c of clocks(staticNav(), rangerCtx())) {
  const p = pace[keyOf(c)];
  const rule = p && p.pace ? clockFor(p.pace) : null;
  const total = c.time;
  const same = rule != null && total === rule;
  if (!same) off++;
  console.log(`clock ${keyOf(c).padEnd(22)} pace ${p && p.pace ? p.pace.toFixed(1) : 'NEVER'} s  clock ${total} s  rule ${rule ?? '-'} s${same ? '' : '  OFF'}${p && p.arriveKmh != null ? `  in at ${p.arriveKmh} km/h (max ${p.maxSpeed})` : ''}`);
}
console.log(`run_pace: ${off} clocks off the rule`);
