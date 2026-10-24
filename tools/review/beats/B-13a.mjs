// B-13a script beat: the audio automation counter in a real page.
// A plan runs it as { "do": "script", "id": "B-13a" }. It reads
// window.AYLMER.audio.automation() (src/core/audio.js) before and after a short
// drive, then suspends the context on purpose, drives on, and resumes. While the
// clock is stopped the owned counts must not move and nothing may be pending;
// after any state change pending must be 0.
const READ = `(() => { const a = window.AYLMER && window.AYLMER.audio; return a && a.automation ? a.automation() : null; })()`;
const own = (r) => r.whileStopped - r.foreign;

export async function run(page, assert) {
  const a0 = await page.evaluate(READ);
  assert(a0, 'audio.automation() is exposed on window.AYLMER.audio');
  if (!a0) return { exposed: false };
  await page.runTask({ type: 'floor', seconds: 4, steer: 0 }, 'b13a-drive', { maxSecs: 15, every: 60 });
  const a1 = await page.evaluate(READ);
  assert.equal(a1.pending, 0, 'after a drive nothing is pending');
  if (!a1.running) assert.equal(own(a1), own(a0), 'on a stopped clock the owned stopped count stays flat');
  else assert(a1.scheduled > a0.scheduled, 'on a running clock the engine is automated');

  // A deliberate suspend, a drive on the frozen clock, then a resume.
  // audio.paused holds off the lifecycle kick (a real key press would wake the
  // context otherwise); only the audio flag is set, the game keeps running.
  const sus = await page.evaluate(`(async () => { const a = window.AYLMER.audio; if (!a.ctx || !a.ctx.suspend) return 'none'; a.__b13aPaused = a.paused; a.paused = true; await a.ctx.suspend(); return a.state; })()`);
  const s0 = await page.evaluate(READ);
  if (sus === 'suspended') assert.equal(s0.pending, 0, 'suspend: 0 pending after the sweep');
  await page.runTask({ type: 'floor', seconds: 4, steer: 0 }, 'b13a-suspended', { maxSecs: 15, every: 60 });
  const s1 = await page.evaluate(READ);
  assert.equal(s1.state, sus, 'the context stayed as suspended through the drive');
  if (sus === 'suspended' && s1.state === 'suspended') {
    assert.equal(own(s1), own(s0), '4 s suspended: owned stopped count flat');
    assert.equal(s1.scheduled - s1.foreign, s0.scheduled - s0.foreign, '4 s suspended: owned automation calls flat');
    assert.equal(s1.pending, 0, '4 s suspended: pending stays 0');
    assert(s1.refused > s0.refused, '4 s suspended: the per-frame calls are refused');
  }
  const res = await page.evaluate(`(async () => { const a = window.AYLMER.audio; a.paused = !!a.__b13aPaused; await a.resume(); return a.state; })()`);
  const r1 = await page.evaluate(READ);
  assert.equal(r1.pending, 0, `after resume (${res}) nothing is pending`);
  return { suspendState: sus, resumeState: res, before: a0, afterDrive: a1, suspended: [s0, s1], afterResume: r1 };
}
