// Pure helpers for the review harness and compare.mjs: why a job ended the way
// it did, the two result columns (as played, fresh car), and the pack diff.
// No browser, no files: tools/smoke_review.mjs tests them directly.

// Fail causes, in the order they are tested. The toast text is the game's own
// (French); the cause names are what SUMMARY.md and compare.mjs print.
export const CAUSES = [
  ['wrecked', /fini\b.*Remorqu|Remorqu|char est fini/i],
  ['clock', /Trop tard|chrono est à zéro|Le chrono|temps est écoulé/i],
  ['caught', /police|pogn|Ramassé|arrêté|busted/i],
  ['lost-race', /déjà stationné|assis sur le capot|t'a battu|t’a battu|perdu la course|arrivé avant/i],
  ['abandoned', /Abandonn/i],
];

/** One word for why a job ended: done, hand-play, missing, harness-timeout, bot-abandon, or a CAUSES name, else other. */
export function failCause(o) {
  if (!o) return 'other';
  if (o.outcome === 'done') return 'done';
  if (o.outcome === 'hand-play') return 'hand-play';
  if (o.outcome === 'missing' || o.outcome === 'unavailable') return 'missing';
  if (o.outcome === 'harness-timeout') return 'harness-timeout';
  if ((o.assists || []).some((a) => a.kind === 'abandon')) return 'bot-abandon';
  const why = String(o.why || '');
  for (const [name, re] of CAUSES) if (re.test(why)) return name;
  return 'other';
}

/** Counts per cause over a list of outcomes, plus played/done/fail and the fail rate (hand-play and missing left out). */
export function tally(list) {
  const t = { played: 0, done: 0, doneUnassisted: 0, fail: 0, failRate: null, causes: {} };
  for (const o of list) {
    if (!o) continue;
    const c = failCause(o);
    if (c === 'hand-play' || c === 'missing') { t.causes[c] = (t.causes[c] || 0) + 1; continue; }
    t.played++;
    if (c === 'done') { t.done++; if (!(o.assists || []).length) t.doneUnassisted++; continue; }
    t.fail++;
    t.causes[c] = (t.causes[c] || 0) + 1;
  }
  t.failRate = t.played ? +(t.fail / t.played).toFixed(3) : null;
  return t;
}

/** A start this close to a new truck needs no second run: the fresh column is the played one. */
export const FRESH_SAME_BELOW = 1;   // damage points (0..100)
export function needsFreshRun(damageStart) { return (damageStart || 0) >= FRESH_SAME_BELOW; }

/**
 * The job results of one pack, from metrics.json beats (works on packs that
 * stopped before writing outcomes.json). Each row: { key, id, kind, played, fresh }.
 * Old packs have no fresh column (null). Repeated ids get #2, #3.
 */
export function packRows(metrics) {
  const rows = [], seen = {};
  for (const b of (metrics && metrics.beats) || []) {
    if (b.beat !== 'mission' && b.beat !== 'course') continue;
    const r = b.result || {};
    const id = b.beat === 'course' ? 'course:' + (r.kind || r.id || '?') : (b.id || r.id || '?');
    seen[id] = (seen[id] || 0) + 1;
    const key = seen[id] > 1 ? `${id}#${seen[id]}` : id;
    const played = r.error ? { outcome: 'harness-error', why: r.error, assists: [] } : r;
    rows.push({ key, id, kind: b.beat, played, fresh: r.fresh || null });
  }
  return rows;
}

const cell = (o) => {
  if (!o) return '-';
  const c = failCause(o);
  if (c === 'done') return (o.assists || []).length ? 'done (assist)' : 'done';
  return c === 'hand-play' ? 'hand-play' : 'RATÉ ' + c;
};
const dmg = (o) => (o && o.damageStart != null ? Math.round(o.damageStart) : '');

/** Markdown: one table of every job in either pack, A and B side by side (B with both columns), then the totals. */
export function compareTable(a, b, { nameA = 'A', nameB = 'B' } = {}) {
  const ra = new Map(packRows(a).map((r) => [r.key, r]));
  const rb = new Map(packRows(b).map((r) => [r.key, r]));
  const keys = [...new Set([...ra.keys(), ...rb.keys()])];
  const lines = [
    `| job | ${nameA} as played | ${nameA} fresh | ${nameB} as played | ${nameB} start dmg | ${nameB} fresh | change |`,
    '|---|---|---|---|---|---|---|',
  ];
  const score = (o) => (o ? (failCause(o) === 'done' ? 1 : failCause(o) === 'hand-play' ? null : 0) : null);
  for (const k of keys) {
    const A = ra.get(k), Bq = rb.get(k);
    const before = score(A?.fresh || A?.played), after = score(Bq?.fresh || Bq?.played);
    const change = before == null || after == null ? '' : after > before ? 'better' : after < before ? 'worse' : 'same';
    lines.push(`| ${k} | ${cell(A?.played)} | ${cell(A?.fresh)} | ${cell(Bq?.played)} | ${dmg(Bq?.played)} | ${cell(Bq?.fresh)} | ${change} |`);
  }
  const col = (rows, which) => tally(rows.map((r) => (which === 'fresh' ? r.fresh : r.played)).filter(Boolean));
  const pa = [...ra.values()], pb = [...rb.values()];
  const tot = [['as played', col(pa, 'played'), col(pb, 'played')], ['fresh car', col(pa, 'fresh'), col(pb, 'fresh')]];
  const fmt = (t) => (t.played ? `${t.done}/${t.played} done (${t.doneUnassisted} unassisted), fail rate ${Math.round(t.failRate * 100)} %; ${Object.entries(t.causes).map(([c, n]) => `${c} ${n}`).join(', ') || 'no fails'}` : 'not run');
  lines.push('', `| column | ${nameA} | ${nameB} |`, '|---|---|---|');
  for (const [name, ta, tb] of tot) lines.push(`| ${name} | ${fmt(ta)} | ${fmt(tb)} |`);
  const h = (m) => m?.headline || {};
  const hl = ['fpsMeanWorst', 'consoleErrors', 'exceptions', 'meanMissionMinutes'];
  lines.push('', `| headline | ${nameA} | ${nameB} |`, '|---|---|---|');
  for (const k of hl) lines.push(`| ${k} | ${h(a)[k] ?? '-'} | ${h(b)[k] ?? '-'} |`);
  return { markdown: lines.join('\n') + '\n', rows: keys.length, totals: { [nameA]: { played: tot[0][1], fresh: tot[1][1] }, [nameB]: { played: tot[0][2], fresh: tot[1][2] } } };
}

/** Several metrics.json (the two halves of a full pack) as one: beats concatenated, the first headline kept. */
export function mergeMetrics(list) {
  const ok = list.filter(Boolean);
  if (ok.length === 1) return ok[0];
  return { ...ok[0], beats: ok.flatMap((m) => m.beats || []), headline: ok.find((m) => m.headline)?.headline || null };
}
