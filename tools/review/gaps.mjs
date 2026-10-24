#!/usr/bin/env node
// Dead air in a review pack (B-02): the longest gap between on-screen events, per job.
//
//   node tools/review/gaps.mjs --pack=<pack[,pack]> [--over 45] [--all] [--json] [--out file.md]
//
// An on-screen event is any overlay text the transcript recorded (a toast, a
// friend's line, a heckle, a prompt, an objective, a card). The street-name
// label and the date and money line are left out: they change because you
// drove, not because the game said something (--all keeps them). The audio
// rows (B-02) are never events. A job is one transcript section (a beat; both
// columns of a mission are one section). A pack is a folder under
// references/review/ or a path; a comma list is read in order as one pack.
// Prints the table and writes it to <first pack>/GAPS.md unless --out says otherwise.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REVIEW_ROOT = path.join(os.homedir(), 'Desktop', 'Coding Projects', 'aylmer-madness', 'references', 'review');
export const NOT_EVENTS = new Set(['street', 'envday', 'audio']);

/** transcript.txt -> [{ beat, rows: [{ t, el, text }] }], one entry per `## ` section. */
export function parseTranscript(txt) {
  return String(txt).split(/^## /m).slice(1).map((sec) => {
    const [head, ...lines] = sec.split('\n');
    const rows = [];
    for (const l of lines) {
      const m = l.match(/^\[(-?[\d.]+)s ([^\]]+)\] ?(.*)$/);
      if (m) rows.push({ t: +m[1], el: m[2], text: m[3] });
    }
    return { beat: head.trim(), rows };
  });
}

/** Per job: event count, the worst gap (seconds, where it starts, the text before it), and the gaps over `over` s. */
export function jobGaps(sections, { all = false, over = 60 } = {}) {
  return sections.map((s) => {
    const ev = s.rows.filter((r) => r.el !== 'audio' && (all || !NOT_EVENTS.has(r.el))).sort((a, b) => a.t - b.t);
    const gaps = [];
    for (let i = 1; i < ev.length; i++) gaps.push({ secs: +(ev[i].t - ev[i - 1].t).toFixed(1), at: ev[i - 1].t, after: ev[i - 1].text.slice(0, 60), before: ev[i].text.slice(0, 60) });
    const worst = gaps.reduce((w, g) => (!w || g.secs > w.secs ? g : w), null);
    return { job: s.beat, events: ev.length, spanSecs: ev.length ? +(ev[ev.length - 1].t - ev[0].t).toFixed(1) : 0,
      worst, over: gaps.filter((g) => g.secs > over).length, overList: gaps.filter((g) => g.secs > over).sort((a, b) => b.secs - a.secs) };
  });
}

export function gapsMarkdown(rows, { over = 60, name = '' } = {}) {
  const L = [`# Dead air${name ? ': ' + name : ''}`, '', `Longest gap between on-screen events per job, and the gaps over ${over} s. Street names, the date line and audio rows are not events.`, '',
    `| job | events | worst gap s | at s | after | gaps > ${over} s |`, '|---|---|---|---|---|---|'];
  for (const r of rows) L.push(`| ${r.job} | ${r.events} | ${r.worst ? r.worst.secs : '-'} | ${r.worst ? r.worst.at : '-'} | ${r.worst ? r.worst.after.replace(/\|/g, '/') : ''} | ${r.over}${r.over ? ' (' + r.overList.map((g) => Math.round(g.secs)).join(', ') + ')' : ''} |`);
  const jobs = rows.filter((r) => r.worst);
  const w = jobs.reduce((a, r) => (!a || r.worst.secs > a.worst.secs ? r : a), null);
  L.push('', w ? `Worst in the pack: ${w.job}, ${w.worst.secs} s (rounded ${Math.round(w.worst.secs)} s). Jobs with a gap over ${over} s: ${jobs.filter((r) => r.over).length} of ${jobs.length}.` : 'No events.');
  return L.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (name, d = null) => { const eq = argv.find((x) => x.startsWith(`--${name}=`)); if (eq) return eq.slice(name.length + 3); const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
  const spec = arg('pack');
  if (!spec) { console.error('usage: gaps.mjs --pack=<pack[,pack]> [--over 45] [--all] [--json] [--out file.md]'); process.exit(2); }
  const dirs = spec.split(',').map((s) => (fs.existsSync(s.trim()) ? s.trim() : path.join(REVIEW_ROOT, s.trim())));
  const sections = [];
  for (const d of dirs) {
    const f = path.join(d, 'transcript.txt');
    if (!fs.existsSync(f)) { console.error(`no transcript.txt in ${d}`); process.exit(2); }
    sections.push(...parseTranscript(fs.readFileSync(f, 'utf8')));
  }
  const over = Number(arg('over', '60'));
  const rows = jobGaps(sections, { all: argv.includes('--all'), over });
  if (argv.includes('--json')) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
  const md = gapsMarkdown(rows, { over, name: dirs.map((d) => path.basename(d)).join(' + ') });
  const out = arg('out') || path.join(dirs[0], 'GAPS.md');
  fs.writeFileSync(out, md);
  console.log(md);
  console.log(`written: ${out}`);
}
