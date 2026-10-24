// Sample script beat (B-02): the shape every later beat file follows.
// A plan runs it as { "do": "script", "id": "sample" }. `page` is the harness's
// helpers (evaluate, state, shot, sleep, tap, key, runTask, carState, setCar,
// seedFor, vehicle); `assert(cond, msg)`, `assert.equal`, `assert.near` record
// checks without stopping the beat. Whatever run() returns lands in metrics.json.
//
// A beat that drives starts from a known pose, never from wherever the beat
// before left the truck (s1-hotel, 20 Oct 2026: the quick plan's sample failed
// whenever the bz_vieux blitz clock ran out with the truck nosed into a wall).
// The pose is boot.mjs's own: chase_chemin_aylmer in tools/aylmer-compare/poses.json,
// the long straight east on chemin d'Aylmer. The damage the truck carried is put
// back afterwards, so a later beat still inherits what the played run left.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const POSES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../aylmer-compare/poses.json');

export async function run(page, assert) {
  const P = JSON.parse(fs.readFileSync(POSES, 'utf8')).poses.chase_chemin_aylmer;
  const inherited = await page.state();
  assert(inherited && inherited.mode === 'drive', 'the game is in drive mode');
  assert.equal(await page.vehicle(), 'ranger', 'the sample starts in the Ranger');
  const carried = await page.carState();
  // Known clear pose: teleport, no damage, wait for the truck to settle.
  await page.setCar({ damage: 0 });
  await page.evaluate(`window.AYLMER.teleport(${P.x}, ${P.z}, ${P.yaw})`);
  let s0 = null;
  for (let i = 0; i < 20; i++) {
    await page.sleep(250);
    s0 = await page.state();
    if (s0 && Math.hypot(s0.x - P.x, s0.z - P.z) < 3 && Math.abs(s0.kmh) < 1) break;
  }
  assert(s0 && Math.hypot(s0.x - P.x, s0.z - P.z) < 3, `the truck is at the sample pose (${s0 ? `${s0.x}, ${s0.z}` : 'no state'})`);
  // Two seconds of throttle with the bot's own task, then a shot.
  await page.runTask({ type: 'floor', seconds: 2, steer: 0 }, 'script-sample', { maxSecs: 15, every: 60 });
  const s1 = await page.state();
  const moved = Math.hypot(s1.x - s0.x, s1.z - s0.z);
  assert(moved > 1, `the truck moved (${moved.toFixed(1)} m)`);
  await page.shot('script-sample');
  await page.setCar({ damage: carried.damage });
  return { movedM: +moved.toFixed(1), kmh: s1.kmh, vehicle: s1.vehicle,
    pose: 'chase_chemin_aylmer', inheritedAt: [inherited.x, inherited.z], inheritedKmh: inherited.kmh, carriedDamage: carried.damage };
}
