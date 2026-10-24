# S3-CRASH: a crash at speed is a show, traffic reacts

Builder s3-crash, branch rf/s3-crash, base fix/look-on-qr at 7272b85 (20 Oct 2026).
Sources: references/review/redteam-2026-10-19/feel.md findings 2 and 7, STEP3-BRIEF.md.

## Status

Done. Steps 1 to 4 built and committed (head 23eaff1 code, report after it); all checks green at ef827b8 (code) on base 7272b85. Commits: ebfa9cb (report), ff7f618 (traffic), c7806f3 (crash show, harness beat), 7ffbc2b (aim regex, flat parts), ef827b8 (square-wall aim, swerve from update, 80-300 ring).

## What changed

### 1. The crash show (main.js, camclip.js, reactive.js, debris.js, streetprops.js, audio.js)

- `SLOWMO.crash` 0.4 s at 0.3x to 0.9 s at 0.25x. The existing ease (full slow for two thirds, back over the last third) is kept. With the 0.1 s headOn hitstop in front, the world goes slow for 1.0 s, under the 1.2 s cap. The player keeps the wheel throughout (slow-mo, not a cutscene).
- Same threshold as before (`v.impact > 0.6`, about 39 km/h of closing, and over 40 km/h of road speed), so small bumps stay quick: no slow-mo, no cut, no parts.
- Crash cam (main.js, blocks marked `S3-CRASH crash cam`): while the crash slow-mo runs, the picture cuts to a fixed eye 6 m to the side of the impact and 1.2 m up, looking at the truck, then cuts back. The eye comes from the new `camclip.sideView()`: both pure sides, then the four quarters, each swept from the truck with the chase boom's own `safeFraction`, longest clear view wins; every frame it is then guarded with `guardView` like the chase boom, so it never sits in a wall. Hard cap `CRASH_CAM.max` 1.2 s of real time. Not from the driver's seat, the dev cam or a cinematic rail. The chase cam keeps smoothing underneath, so it comes back where it would have been.
- Parts (`Reactive.crashShow`): 16 glass shards off the nose (was 7) and 3 or 4 bodies: a body panel in the car's own paint (`spec.body`, through a per-body `colorMul`), the bumper, one or two hubcaps, thrown sideways and back off the impact. Three new loose kinds in streetprops.js (never placed in the world); panels and hubcaps settle flat. Fixed pools: at most 4 of the 48 debris bodies and 16 of the 24 glass slots; nothing allocated per show. The old 7-shard burst is skipped on the frame a show fires.
- Crunch tail (`audio.crashTail`, `fireCrashTail`): a detuned low saw bending down (the body settling), eight glass ticks over 0.7 s falling in level and one late clank, about 1.1 s, under CRASH_GAIN. `fireCrash` (the hit, AUD-02's level and dip) is untouched, so audition.mjs renders the same crashes.
- `AYLMER.feel()` now also carries `crashCam` (count), `crashCamLast` ({ side, frames, ms }) and `crashKmh` (road speed before the hit); `G.reactive.show` has { count, parts, glass }.

### 2. Traffic (traffic.js)

- A hit over 4 m/s of closing (`SLIDE_AT`) slides and spins: the solver's yawSpin is kept (it already was for any stunned car; feel.md's "parks it" is the light-hit case and the heavy drag), drag 1.7 / spin drag 1.3 instead of 2.6 / 2.4, at least 0.15 rad/s of spin per m/s of closing (a square hit gets some too), stun 2.0 s plus 0.08 s per m/s over 4, up to 2.8 s. Then it reacquires a lane and drives on as before.
  - Measured with a Ranger into a moving traffic car, real `Traffic.collidePlayer` and `update()` (unwrapped rotation, metres slid over the stun):

    | hit | before | after |
    |---|---|---|
    | T-bone on the rear quarter, 50 km/h | 156 deg, 3.7 m | 271 deg, 5.6 m |
    | T-bone dead centre, 50 km/h | 73 deg, 3.9 m | 132 deg, 5.8 m |
    | up its tailpipe, square, +43 km/h | (solver spin small) | 95 deg, 9.8 m |
- Swerve: a near miss (traffic.nearMiss, now called from update and followed by `swerve()`), or your horn (H or the pad horn; main.js hands `G.traffic.playerHorn`) on a car within 15 m ahead of you and within 4 m of your line, makes it jink 1.2 m away from you for 1.5 s (out in 0.35 s, held, eased back over 0.6 s), lift off the gas a little, and honk. Away is the side of its lane you are not on. Implemented as a lane offset in `aimAt` plus moving the body with it (pure pursuit alone took about two seconds to answer a 1.2 m offset: 0.6 m in 1.5 s, measured). 1.5 s cool-down per car after a swerve.
- Respawn ring: arterials (anything not residential) respawn from 80 m instead of 120 m. The brief asked for 80 to 220 m. Measured (player on a moving traffic route, three seeds, 5 minutes each, medium density): 120-300 gave 6.72 cars within 150 m (2.69 on arterials); 80-220 gave 6.73 (2.69), no gain, and it cut the arterial share of respawns at Principale from 45 % to 36 %, failing smoke_street_life's "respawns favour the arterials". 80-300 gave 7.68 (3.73 on arterials, +39 %) and 46 %. So the shipped ring is 80 to 300 m on arterials, 120 to 300 m on side streets (`RING.art`, read at each respawn). Same cells scanned: no added cost.

### 3. Harness crash beat (tools/review/harness.mjs)

- Before: aimed square off the road from rest and floored; never above 17 km/h, impacts at 0.1 to 1.1 km/h, one still shot.
- Now: from road points on the route out of the place (principale, then marina and home, both sides), three rays off the nose (centre and 0.8 m either side) must meet a wall or a building 16 to 50 m out within 2.5 m of each other (a square wall, not the end of a fence), with a clear run-up (`modes.js blockedAhead`, no water). The truck is set at 70 km/h (`kmh` in the beat) and floored in the same evaluate. A ring of screenshots keeps 3 frames before the first slow-mo frame and 7 after: `shots/NNN-seq-crash/00..09.jpg`, each frame with kmh, damage, slow-mo scale and crash cam side. The result carries `aimed` (with the rays), `misses` (why each place failed), `impacts[0].kmh`, `slowmo`, `feel` (crashKmh, crashCam, crashCamLast, show) and the sequence.
- The first try of this aim had `\d` inside the page's template literal (it becomes `d`), so no place ever matched; the second took a fence end at 19 m and drove through. Both fixed; see Checks.

### 4. The crash owns the screen (lead's request, 23eaff1)

- New `crashShowQuiet(G)` in mission-notifications.js, true from the crash show's start until 2.0 s later (0.9 s show, 0.1 s hitstop, 1 s after), set by `startCrashCam` as `G.crashQuietUntil`.
- While it holds: no repair toast or standing repair hint (main.js repair hint line, the same way `landingRepairHintMuted` mutes; the once-only flags are not consumed, so « Ton char est magané » shows once the quiet ends); no jumps.js live airtime readout, score board, blip or pay for the bounce off the wall; no « s dans les airs » toast and no `stats.jumps` count. Nothing touched in damage.js (s3-cops owns its chase suppression there).
- Re-shot at 23eaff1 (crash-23eaff1/): same wall, 76 km/h, slow-mo 0.25x, crash cam left for 60 frames, 999 ms, 3 parts and 16 shards, camera clearPct 100, eyeBlocked 0, unframed 0. Frames 03 to 09: no repair banner, no repair hint under the damage bar, no airtime readout. The only text left mid-screen is the place card « AYLMER, QUÉBEC / prends ton temps », which was already up before the impact (frame 02) and is not crash UI.
- npm test 102/102; boot both entries ok, 0 console errors, 144.6 m.

## Checks

All browser jobs through qa-slot.sh with AYLMER_QA_SLOTS=1, ports 8272/9472 (perf 8272/9572). Evidence in aylmer-madness/references/review/rf-s3-crash/ (private).

- Harness `--plan quick --only crash --rev ef827b8` (crash-ef827b8/): aimed at Principale side 1, road point 14, a garage wall square at 49.5 m on all three rays. Truck into it at 76 km/h (crashKmh 76, max 84); damage 0 to 39.1 on impact, 41.1 after. Slow-mo fired once (scale 0.25), crash cam on the left side for 59 frames, 984 ms (under the 1.2 s cap), 4 parts and 16 shards thrown. Camera evidence for the beat: 536 frames, clearPct 100, eyeBlocked 0, unframed 0.
- The 10-frame sequence, `shots/011-seq-crash/00..09.jpg`:

  | frame | t s | km/h | damage | slow-mo | camera |
  |---|---|---|---|---|---|
  | 00 | 41.4 | 76.4 | 0 | - | chase |
  | 01 | 41.5 | 76.4 | 0 | - | chase |
  | 02 | 41.6 | 76.3 | 0 | - | chase, wall ahead |
  | 03 | 41.7 | 13.7 | 39.1 | 0.25x | side, left |
  | 04-09 | 41.8-42.2 | 13.7 | 39.1 | 0.25x | side, left: the truck rears on its nose against the garage, the white panel and a hubcap leave the front |
- Before (crash-1 on c7806f3 and the packs feel.md cites): impacts at 0.1 to 1.1 km/h, no slow-mo; my first two tries of the new aim matched no place (template escape) and then clipped a fence end (max 31 then 72 km/h, no crash). Both fixed.
- npm test: 102/102 suites (smoke_traffic gains T6 to T10). On the way: smoke_style's fake traffic had no `swerve()` (fixed by calling swerve from update, not inside nearMiss) and smoke_street_life's arterial share fell to 36 % with 80-220 (see 2: the ring is now 80-300, 46 %). No test loosened, no budget raised.
- Boot gate (tools/qa/boot.mjs, both entries): index.html and prototype.html menu and drive ok, 0 console errors, W moved 144.6 m each.
- Perf, 60 s at the Air display (perf.mjs `--poses=chase_lucerne_golden --env=noon --tier=med --frames=3600 --fresh --display=air`, 1874x1219 backbuffer): this branch p50/p95 3.3/6.4 ms, GPU+CPU p95 7.155 ms, budget pass. Integration head a41702f the same run: 3.2/6.4 ms, 7.196 ms. No measurable cost. The crash show itself is transient and pool-bound (4 bodies, 16 shards); camera evidence shows maxSolveMs 0.4 over the beat.
- Node: smoke_traffic all green (T6 T-bone 15.1 m/s, stun 2.8 s, slid 5.5 m; T8 swerve 1.19 m in the first second; T10 arterial respawns 90 to 283 m), smoke_driving 126 ok, smoke_style 72/72, smoke_street_life 22/22.

## Open issues

- 80 to 300 m instead of 80 to 220 m (see 2): lead to confirm.
- Arterial cars can now appear from 80 m, which is inside the draw distance; nothing hides the pop-in.
- A sliding traffic car has no wall collision (it never had); a 5 to 10 m slide can put it partly into a hedge or a porch for a second.
