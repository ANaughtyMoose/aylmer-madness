#!/usr/bin/env node
// Diff two review packs into one table: every job, as played and fresh car,
// before and after, plus the fail-cause totals and a few headline numbers.
//
//   node tools/review/compare.mjs --a=20261006-025529-full,20261006-034217-full-rest --b=<new pack> [--out file.md]
//
// A pack is a folder name under references/review/ or a path; a comma list is
// read as one pack (the two halves of a full run). Reads metrics.json only, so
// it works on packs that stopped before writing outcomes.json. Prints the
// table; writes it to <b>/COMPARE-vs-<a>.md unless --out says otherwise.
// B-02: a vehicle table follows: the vehicle each job was played in (bot.vehicle,
// "ranger>cart" when it changed), both columns, and the harness's wrong-vehicle
// flag. Packs from before B-02 recorded no vehicle and show "-".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTable, mergeMetrics, packRows } from './verdict.mjs';

const vehOf = (o) => {
  if (!o) return '-';
  const v = o.bot?.vehicle || o.vehicle?.got || (o.sameAsPlayed ? 'same' : '-');
  return o.vehicle && !o.vehicle.ok ? `${v} WRONG (wanted ${o.vehicle.want})` : v;
};
/** Markdown: per job, the vehicle in A and B (as played and fresh), and how many B beats failed the vehicle check. */
export function vehicleTable(a, b, { nameA = 'A', nameB = 'B' } = {}) {
  const ra = new Map(packRows(a).map((r) => [r.key, r]));
  const rb = new Map(packRows(b).map((r) => [r.key, r]));
  const keys = [...new Set([...ra.keys(), ...rb.keys()])];
  const lines = [`| job | ${nameA} vehicle as played | ${nameA} fresh | ${nameB} vehicle as played | ${nameB} fresh |`, '|---|---|---|---|---|'];
  let wrong = 0;
  for (const k of keys) {
    const A = ra.get(k), Bq = rb.get(k);
    if (Bq && ((Bq.played?.vehicle && !Bq.played.vehicle.ok) || (Bq.fresh?.vehicle && !Bq.fresh.vehicle.ok))) wrong++;
    lines.push(`| ${k} | ${vehOf(A?.played)} | ${vehOf(A?.fresh)} | ${vehOf(Bq?.played)} | ${vehOf(Bq?.fresh)} |`);
  }
  // Beats that are not jobs (speed, crash, jumps, cops, free roam) carry the check on the beat itself.
  const other = ((b && b.beats) || []).filter((x) => x.beat !== 'mission' && x.beat !== 'course' && x.result?.vehicle);
  for (const x of other) { if (!x.result.vehicle.ok) wrong++; }
  const tail = other.length ? ['', `| beat | ${nameB} vehicle at start |`, '|---|---|', ...other.map((x) => `| ${x.beat}${x.id ? ' ' + x.id : ''} | ${vehOf(x.result)} |`)] : [];
  const hl = b?.headline?.wrongVehicleBeats;
  const recorded = hl != null || other.length || [...rb.values()].some((r) => r.played?.vehicle || r.played?.bot?.vehicle);
  const verdict = !recorded ? `${nameB}: no vehicle recorded (a pack from before B-02).`
    : `${nameB}: ${hl ?? wrong} wrong-vehicle beat(s) as played${b?.headline?.wrongVehicleFresh != null ? ', ' + b.headline.wrongVehicleFresh + ' on a fresh run' : ''}.`;
  return { markdown: [...lines, ...tail, '', verdict].join('\n') + '\n', wrong: recorded ? wrong : null };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
const REVIEW_ROOT = path.join(os.homedir(), 'Desktop', 'Coding Projects', 'aylmer-madness', 'references', 'review');
const argv = process.argv.slice(2);
const arg = (name) => {
  const eq = argv.find((x) => x.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const A = arg('a'), Bv = arg('b');
if (!A || !Bv) { console.error('usage: compare.mjs --a=<pack[,pack]> --b=<pack[,pack]> [--out file.md]'); process.exit(2); }

const dirOf = (p) => (fs.existsSync(p) ? p : path.join(REVIEW_ROOT, p));
function load(spec) {
  const dirs = spec.split(',').map((s) => dirOf(s.trim()));
  const list = dirs.map((d) => {
    const f = path.join(d, 'metrics.json');
    if (!fs.existsSync(f)) { console.error(`no metrics.json in ${d}`); process.exit(2); }
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  });
  return { dirs, metrics: mergeMetrics(list), name: dirs.map((d) => path.basename(d)).join(' + ') };
}
const a = load(A), b = load(Bv);
const out = compareTable(a.metrics, b.metrics, { nameA: 'A', nameB: 'B' });
const veh = vehicleTable(a.metrics, b.metrics, { nameA: 'A', nameB: 'B' });
const md = [
  '# Pack compare', '',
  `- A: ${a.name} (build ${a.metrics.build?.head || '?'})`,
  `- B: ${b.name} (build ${b.metrics.build?.head || '?'})`, '',
  'As played: damage and money carry from beat to beat, as the pack ran. Fresh car: the same job started at damage 0 (the game\'s own fail rate). Old packs have no fresh column. Change compares the fresh column when there is one, else as played.', '',
  out.markdown,
  '## Vehicle', '',
  'The vehicle each job was played in (B-02). "WRONG" is the harness\'s wrong-vehicle flag: the beat did not start in the job\'s intended vehicle.', '',
  veh.markdown,
].join('\n');
const file = arg('out') || path.join(b.dirs[0], `COMPARE-vs-${path.basename(a.dirs[0])}.md`);
fs.writeFileSync(file, md);
console.log(md);
console.log(`written: ${file}`);
}
