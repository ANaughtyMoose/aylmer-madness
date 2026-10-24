# S3-COPS: a 2 to 3 star chase with real pressure

Builder s3-cops, branch rf/s3-cops, base fix/look-on-qr at 7272b85.
Sources: STEP3-BRIEF.md, feel.md finding 3, missions.md finding 7(b), audio.md (AUD-02 honk, untouched).

## Status
- [x] 1. Cruisers close in and stay in frame (7c8a560)
- [x] 2. Light rams (7c8a560)
- [x] 3. Bust check (report only, no change)
- [x] 4. Repair toasts quiet during a chase (7c8a560)
- [x] 5. Harness `inFrame` (30bd005)
- [x] Proof run, `--plan jen --only cops` (heat 2 and heat 4, which clamps to 3 stars)
- [x] npm test 102/102 suites, boot of both entries ok

## What changed

### src/game/cops.js
- **Closing in.** Lift band was 0.3 floor, 12 to 48 m. Now: 1.12 x cruise past 60 m (a 90 km/h truck is no longer simply faster than the police), 1.0 down to 20 m, floor 0.65 at 4 m (`CHASE`).
- **On your line.** Inside 45 m, behind you and within 12 m of the breadcrumb trail of where you drove (`_track`, a point every 3 m, 70 kept), the cruiser follows that trail plus a point 12 m + 1.2 s ahead of your nose (`_linePath`, re-built every 0.2 s), not the 1.5 s GPS route that ended where you were 1.5 s ago. That old route end was a hidden cause of "never in frame": inside the look-ahead the Rival hit `atEnd` and capped itself at 9 m/s.
- **Closing ceiling, not a lift.** `_cap` solves for the cruiser speed that gives a wanted closing speed on the truck: hold station 7.5 m (unit 0, straight behind) or 6.5 m (unit 1, 2.4 m out to your left, alongside), come in at 3.5 m/s when a bump is due, roll up to 6.5 m and stop next to a truck under 3 m/s (never a pin), back off after any touch, and wait in the road if it is ahead of you and facing you (never a head-on). race.js got a one-line `ctx.cap` hook for this; no other rival sets it.
- **Spawn.** The second unit comes from up the road only under 60 km/h (`SPAWN_AHEAD_KMH`), else 70 m behind (`SPAWN_BACK2`).
- **Rams, light (`BUMP`, `_contact`).** Cruiser to truck contact replaces `collideRivals`. If you drove into the cruiser it is an ordinary crash, priced as one. If it came into you: the truck's velocity change is held to 2.6 m/s and the yaw it leaves to 0.15 rad/s; only a unit that is due (2 stars or more, truck over 3 m/s, 10 to 15 s since its last bump, first one 3 to 6 s in) costs damage, and at most a 4.8 m/s impact: `knockDamage(4.8)` = 2.74. At 3 stars the alongside unit aims for your rear quarter (1.3 m out) and may leave up to 0.9 rad/s of yaw, which decays in well under a second: a PIT-style nudge. Every contact is logged in `cops.bumpLog` (`{ t, unit, closing, dmg, by: cop|you|touch, pit, stars }`).
- Note on the brief's number: a 6 m/s closing impact is 4.3 damage on `knockDamage`, not under 3, so the cap is 4.8 m/s (2.74).

### src/game/damage.js, src/main.js
- `repairHint(state, damage, { quiet })`: while `G.cops.chasing` the 25 % and 60 % banners are held back (flags not spent) and come once the chase is over if the truck is still bent; the standing HUD line still shows. main.js: one line in a `[s3-cops]` block.

### tools/review/harness.mjs (cops beat)
- New fields: `inFrame` (game seconds a driving cruiser within 120 m projected inside the frustum through `G.renderer.vp`: centre, nose, tail or light bar; houses in the way are not tested), `seen { inFrame, near40, chaseSecs, inFramePct, minD }`, `damage { before, after }`, `after.bumps` (the bump log).

### Tests
- tools/smoke_race.mjs: 4 new groups (second unit behind at 79 km/h; a 12 m/s contact costs under 3 and shoves under 2.6 m/s, the next one inside the gap costs nothing, one star and a stopped truck are never rammed; hold station next to a stopped truck, stop rather than meet head-on, ramming a parked cruiser is an ordinary crash; 3-star PIT yaw under 0.9 rad/s and under 3 damage). 215/215.
- tools/smoke_repair.mjs: quiet toast held, standing line shown, toast comes after.

## Proof: `--plan jen --only cops`, 30 s per beat, chase cam
Packs under aylmer-madness/references/review/rf-s3-cops/.

| | base (30bd005, harness only) 2 stars | after (7c8a560) 2 stars | base 3 stars | after 3 stars |
|---|---|---|---|---|
| inFrame (s of chase) | 8.2 of 30.1 (27 %) | 14.3 of 29.8 (48 %) | 10.2 of 29.8 (34 %) | 24.8 of 30.1 (83 %) |
| in frame inside 40 m | 3.7 s | 8.6 s | 5.1 s | 19.5 s |
| nearest cruiser | 3.2 m | 2.4 m | 22.9 m | 5.0 m |
| damage in beat | 0 to 22.1 | 0 to 22.8 | 22.1 to 44.0 | 22.8 to 25.6 |
| fps mean / p95 ms / raw max ms | 59.1 / 16.8 / 33.3 | 58.8 / 16.8 / 50.0 (1 frame over 33) | 60 / 16.8 / 16.8 | 60 / 16.8 / 16.8 |
| outcome | timeout, chasing | timeout, chasing | timeout, chasing | timeout, chasing |

Bumps after (from `bumpLog`):
- 2 stars: one cruiser bump, 5.08 m/s closing, 2.74 damage. One touch inside the gap at 11.8 m/s closing (the bot braked in front of it): 0 damage, shove capped. One "you" crash: the bot drove into unit 1, which had come from up the road (the truck was under 60 km/h at the start) and was waiting in the lane: 13.7 m/s, 19.0 damage. The base run had a similar single 22-point hit at 2 stars and another at 3 stars (80 to 8 km/h in one trace step).
- 3 stars: one cruiser bump, 3.83 m/s, 1.64 damage; two touches, 0 damage. No PIT landed in this run (the alongside unit never got to the rear quarter while due; the unit test covers the cap). Damage over the 3-star beat was 2.8, against 21.9 in base.
- Rate: one damaging bump per unit per 30 s beat in practice, under the 10 to 15 s gap ceiling.

The 3-star 83 % is helped by the bot being held at the roadblock (shot 020, 5 km/h, cruiser on the bumper, roadblock alongside). The 2-star 48 % is the open-road number.

## 3. Bust check (missions.md 7b): report, no change
- The bust rule is unchanged: under 6 km/h for 4 s with a cruiser inside 12 m, or from 2 stars inside 150 m.
- On a job (cops.js `bust`): the ticket is `G.ticket` (calendar.js: easy 40, normal 75, hard 120; the 150 $ in missions.md is the node fallback only), then `failMission('Ramassé par la police de Gatineau.')`, which refunds the job's pay (« la paye s'en va avec »), may spend the day (paid jobs and races; main story fails never do) and offers R with the first retry free. This is what the code comment and the smoke test (`the job fails, Ville de Gatineau police`, canot) say it should do, so it is a design call, not a bug.
- It is harsh for errands: a red light during the canoe job costs the ticket, the job and the canoe money. missions.md's proposal (fail the job only in `escape` or race stages or when the job carries cargo, otherwise ticket plus a line) needs Tom's ruling; I did not change it.
- New exposure from this branch: a cruiser now rolls up and holds 6.5 m off a stopped truck, so at 1 star a stop with a cruiser on your tail is more reliably inside the 12 m box (before, it crept in at a third of its speed and often stopped short or ended its route elsewhere). That is the rule as written (« boxed in »), and the bust still needs you nearly stopped.

## Checks
- smoke_race 215/215, smoke_repair green.
- npm test (RAM guard, one slot): 102/102 suites passed, on 7c8a560 plus the report.
- tools/qa/boot.mjs, ports 8274/9474: index.html and prototype.html both ok, 0 console errors, W moved 144.6 m and 145.6 m.
- Harness: `--plan jen --only cops` on 30bd005 (base) and 7c8a560 (after), table above.

## Open for the lead
- Tom: bust inside a non-escape job (above).
- The head-on unit now waits in the road and the bot does not steer round it; a human will, but a crash into it is a full crash (19 damage in the run). If that reads as unfair, the next step is a softer price for "you hit a waiting cruiser".
- Bump rate is one per unit per beat in practice; tuning `BUMP.first`/`BUMP.close` up would get nearer one every 10 to 15 s.
- No rear-view inset or panned siren (feel.md's cue idea); not in my task.
