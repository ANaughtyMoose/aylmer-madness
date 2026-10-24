// Builds references/places/_feedback/compare-index.json for the compare page:
// one PAIR per verified reference in _manifest/core-refs.json, matched to the
// newest game shot in references/places/<slug>/game-shots-v2/ that was taken
// for that exact reference file. Run after capture.mjs:
//   node tools/aylmer-compare/build_index.mjs
// An existing index is moved to references/places/_previous/ first.
//
// VISUAL-WAVE MODE:  node tools/aylmer-compare/build_index.mjs --task=V1-01 [--runs=before,after]
// Pairs the named-pose runs (tools/qa, capture.mjs --poses=) of one task: for every
// <pose>__<env> present in all the runs, one entry with each run's PNG, the pose's
// 2009 reference and the look-diff contact sheet when there is one. Written to
// <CMP_REF_ROOT>/references/places/_feedback/visual-wave/<task>/compare-index.json
// (the review artifact for the Tom gate is built from it). Nothing else is touched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = (n, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
if (argv('task')) {
  const REF = path.resolve(process.env.CMP_REF_ROOT || path.join(ROOT, '../aylmer-madness'));
  const task = argv('task'), runs = argv('runs', 'before,after').split(',').filter(Boolean);
  const base = path.join(REF, 'references/places/_feedback/visual-wave', task);
  const poses = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/aylmer-compare/poses.json'), 'utf8')).poses;
  const list = (r) => (fs.existsSync(path.join(base, r)) ? fs.readdirSync(path.join(base, r)).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)) : []);
  const names = list(runs[0]).filter((n) => runs.every((r) => list(r).includes(n))).sort();
  const sheetDir = path.join('look-diff', `${runs[0]}-vs-${runs[runs.length - 1]}`);
  const pairs = names.map((n) => {
    const [pose, env] = n.split('__');
    const sheet = path.join(sheetDir, n + '.sheet.png');
    return { id: n, pose, env, place: poses[pose]?.place || '', reference: poses[pose]?.ref || null,
      shots: Object.fromEntries(runs.map((r) => [r, path.join(r, n + '.png')])), sheet: fs.existsSync(path.join(base, sheet)) ? sheet : null };
  });
  const outFile = path.join(base, 'compare-index.json');
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ schema: 'aylmer-visual-wave-index', version: 1, task, runs, built: new Date().toISOString(), root: base, pairs }, null, 1));
  console.log(`${pairs.length} pair(s) across ${runs.join(' / ')} -> ${outFile}`);
  process.exit(0);
}
const PLACES = path.join(ROOT, 'references/places');
const OUT = path.join(PLACES, '_feedback/compare-index.json');
const core = JSON.parse(fs.readFileSync(path.join(PLACES, '_manifest/core-refs.json'), 'utf8'));

const shotsFor = (slug) => {
  const dir = path.join(PLACES, slug, process.env.CMP_SHOTS_DIR || 'game-shots-v3');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
};

let commit = 'unknown';
const places = core.places.map((p) => {
  const shots = shotsFor(p.slug);
  const pairs = (p.refs || []).filter((r) => r.verified !== false).map((r, i) => {
    const mine = shots.filter((s) => s.reference === r.file);
    const s = mine[mine.length - 1] || null;
    if (s && s.commit) commit = s.commit;
    return {
      id: p.slug + '::' + path.basename(r.file),
      n: i + 1,
      reference: r.file,
      reference_source: r.source || path.basename(path.dirname(r.file)),
      shows: r.shows || '',
      pose_in: r.pose || null,
      game_shot: s ? s.game_shot : null,
      game_sidecar: s ? s.game_shot.replace(/\.png$/, '.json') : null,
      pose_quality: s ? s.pose_quality : 'no shot',
      pose_notes: s ? s.pose_notes : ['no game shot captured for this reference'],
      camera: s ? s.camera : null,
      captured: s ? s.captured : null,
      commit: s ? s.commit : null,
    };
  });
  const qs = pairs.map((x) => x.pose_quality);
  return {
    slug: p.slug, name: p.name || p.slug, building_latlng: p.building_latlng || null,
    notes: p.notes || '', rejected_count: (p.rejected || []).length,
    pose_quality: !pairs.length ? 'no reference' : qs.every((q) => q === 'streetview') ? 'streetview'
      : qs.some((q) => q === 'streetview') ? 'mixed' : 'approximate',
    pairs,
  };
});

if (fs.existsSync(OUT)) {
  const prev = path.join(PLACES, '_previous');
  fs.mkdirSync(prev, { recursive: true });
  let dest = path.join(prev, 'compare-index.json'), k = 2;
  while (fs.existsSync(dest)) dest = path.join(prev, `compare-index_${k++}.json`);
  fs.renameSync(OUT, dest);
  console.log('old index moved to', path.relative(ROOT, dest));
}
const out = { schema: 'aylmer-compare-index', version: 2, built: new Date().toISOString(), commit, core_refs_generated: core.generated, places };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
for (const p of places) console.log(p.slug.padEnd(28), String(p.pairs.length).padStart(2), 'pairs', p.pose_quality);
console.log('wrote', path.relative(ROOT, OUT));
