// Pose and environment selection shared by capture, perf and vis-check.
//   --poses=core            a set (its own environments unless --env is given)
//   --poses=core,chase_fraser   sets and single poses can mix
//   --env=noon,night        environments (override the sets' own)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './rig.mjs';

export const POSES_FILE = path.join(ROOT, 'tools/aylmer-compare/poses.json');
export const loadPoses = () => JSON.parse(fs.readFileSync(POSES_FILE, 'utf8'));

// -> { jobs: [{ pose, envId, env }] in a stable order (pose-major), tiers: the set's tiers or null }
export function resolve(P, posesArg, envArg, tierArg) {
  const toks = String(posesArg || 'core').split(',').map((s) => s.trim()).filter(Boolean);
  const envOverride = envArg ? String(envArg).split(',').map((s) => s.trim()).filter(Boolean) : null;
  const jobs = [], seen = new Set();
  let tiers = null;
  for (const t of toks) {
    let ids, envs;
    if (P.sets[t]) { ids = P.sets[t].poses; envs = P.sets[t].envs; if (P.sets[t].tiers) tiers = P.sets[t].tiers; }
    else if (P.poses[t]) { ids = [t]; envs = ['noon']; }
    else throw new Error(`unknown pose or set "${t}". Sets: ${Object.keys(P.sets).join(', ')}. Poses: ${Object.keys(P.poses).join(', ')}`);
    for (const id of ids) for (const e of envOverride || envs) {
      if (!P.envs[e]) throw new Error(`unknown environment "${e}". Known: ${Object.keys(P.envs).join(', ')}`);
      const k = id + '|' + e; if (!seen.has(k)) { seen.add(k); jobs.push({ pose: P.poses[id], envId: e, env: P.envs[e] }); }
    }
  }
  if (tierArg) tiers = String(tierArg).split(',').map((s) => s.trim()).filter(Boolean);
  for (const t of tiers || []) if (!P.tiers.includes(t)) throw new Error(`unknown tier "${t}". Known: ${P.tiers.join(', ')}`);
  return { jobs, tiers };
}

// Reference-image root (gitignored; lives in the main checkout).
export const refRoot = () => path.resolve(process.env.CMP_REF_ROOT || path.join(ROOT, '../aylmer-madness'));
export const reportRoot = (task) => path.join(refRoot(), 'references/places/_feedback/visual-wave', task || '_adhoc');
