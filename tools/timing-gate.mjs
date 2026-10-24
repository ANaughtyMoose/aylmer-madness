// Wall-clock and CPU-time budgets are quiet-window checks (red team 19 Oct, tech.md
// section 3 item 5): on a Mac running harness Chromes and bakes (load 10 to 168)
// an absolute ns or ms budget fails on unchanged code, and "rerun once" lets a real
// regression through on an idle box. So npm test still MEASURES each one and prints
// it as a SKIP line, without counting it either way; `npm run test:timing`
// (AYLMER_QUIET=1, run in the quiet window) asserts the very same budgets.
// The budgets themselves are unchanged.
export const QUIET = process.env.AYLMER_QUIET === '1';

// ok: the suite's own ok(name, cond, detail); print: where the suite writes a line.
export function timingCheck(ok, print, name, cond, detail = '') {
  if (QUIET) return ok(name, cond, detail);
  print(`  SKIP ${name}   ${typeof detail === 'string' ? detail : JSON.stringify(detail)}   [${cond ? 'within budget' : 'OVER budget'} now; quiet-window check, asserted by npm run test:timing]`);
}
