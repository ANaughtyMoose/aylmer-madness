# QA findings: integration build, 29 Sept 2026

Independent QA of `claude/quality-review-2026-09-29` at `1ce60cf`. The scenario table is in `docs/QA-MATRIX.md`. Hardware: Apple M4, 16 GB, headless Chrome 154 on Metal. **No full campaign playthrough is claimed.** One job was driven end to end, SCRIPTED.

**Verdict.** The integration is sound for a first-run player. 70/70 suites pass. Both entry points boot with zero console errors. The spawn, the $0 Saturn prompt, the bubble order and Margaret's English are all fixed. The solenoid twist shows, and the end cards, radio, Dad's call and corrupt-slot handling behave. Frame time is locked at 16.7 ms (p99 16.8) at noon and at night. No blocker was found. The defects below are one medium and the rest low, ranked by what a player meets first.

## Ranked defects

### F2 (medium): the stuck nudge fires at spawn while the player reads Margaret's lines

- **Repro (LIVE):** index.html, new game. Enter past both cards. Do not touch the keys for ~20 s. That is about how long the three start bubbles take to play.
- **Observed:** the reset buttons « Remettre sur la route (T) / Dépanneuse (Y · 60 $) » stay on screen. A passer-by then says « T'es juché su'l banc d'neige comme une poule su'un piquet, champion! »: a snowbank line on 26 June, aimed at a truck parked in its own driveway. On index, the « Psst » GPS line also covers « W pour avancer » (shot `idx-brief-c.jpg`).
- **Expected:** no stuck logic while the job's opening lines play, or before the player has pressed a drive key. No winter lines in summer.
- **Where:** `src/game/story.js:24-25` (`STUCK_M = 20`, `STUCK_T = 20`, `updateStuck` at :277); the line is at `assets/text/heckles.json:1355`.
- **Fix:** arm `updateStuck` only after the first throttle input of the job, or once `heckle` has drained the job's start group. Remove or season-gate the snowbank heckle.

### F4 (low-medium): no way to abandon a job

- **Observed:** the pause menu offers « Recommencer la job » only (`main.js:2692-2694`). While `G.mission` is set, every job row is disabled (`row.disabled = !allowed || !!G.mission`). A player who has started a 420 s job they don't want can only restart it or fail it (for example, wreck the truck).
- **Fix:** add « Laisser tomber la job » next to restart. It should call the single close path (`closeMission`) with a no-pay, no-day-cost result.

### F5 (low): the breakfast-nachos window contradicts its own brief

- **Repro (DEBUG):** prototype; `curfew` is next. At 22 h, `missionLockReason` returns null (open). At 5 h and 12 h it says « Reviens après 21 h (jusqu'à 4 h). »
- **Observed vs expected:** the brief says « Quatre heures et demie à la marina… avant que Little Big Man finisse à cinq heures », yet the job opens at 9 p.m. and closes at 4 a.m., before the story's 4:30.
- **Where:** `src/game/jobwindows.js:28` `curfew: [21, 4]` (a leftover from « Avant minuit »).
- **Fix:** use `[3, 5]`, or `[2, 5]` for slack, and keep the message wording.

### F6 (low): a stale damage hint right after « …pis réparé »

- **Repro (DEBUG):** any car; set `G.veh.damage = 100` with $200 in the wallet.
- **Observed:** the toast « LE CHAR EST FINI | Remorquage: 60 $, pis réparé » is followed by « Ça tire à gauche pis ça pétarade — va le faire réparer », while the damage is 0.
- **Where:** `main.js` ~1975 (`hint.toast` from the pre-tow state) runs next to the tow branch at 1979-1994.
- **Fix:** compute the hint after the tow, or skip it on the tick that towed.

### F7 (low): the alternateur end numbers disagree

- **Observed:** the stage toast says « Bonus de formation, 22 $ » (hard-coded in `src/game/missions.js:82`). The card says « Paye : 23 $ » and the wallet gets +23. The card also says « 1 jobs faites » (`main.js:1686`).
- **Fix:** interpolate the real payout into the toast, or drop the number from it. Pluralise « job(s) faite(s) ».

### F8 (low, not reproduced): the tow toast said « t'es cassé » after a real -60 $

- In one unforced run (SVX attempt 1, the Ranger at $80 with damage forced to 100 and W held for 3 s), the wallet went 80 → 20, but the visible toast was « Remorquage: 60 $ — t'es cassé, on te le passe ». Forced single tows at $200 and $20 are both correct. The likely cause is two tows back to back (paid, then unpaid), because the truck dies again before `G.towed` settles. Worth a guard: do not tow twice within a few seconds.

### F9 (low): GO is dead for the first ~0.45 s

- `#start` is visible before `main.js` wires `onclick` (`main.js:3017`). A click in that window is swallowed with no feedback, and the player has to click again. Fix: keep the button disabled or hidden until the module has run, or queue the click.

### F10 (low, feel): Dad's money lands before Dad speaks

- The toast « Ton père t'envoie 85 $… +85 $ » appears with the ring, before Margaret's pickup and his five lines. The piano beat (the offer, then the tell) is spoiled. Fix: show the toast after the last Dad bubble (`dadcall.js`).

### F11 (low, test tooling): `AYLMER.start` is not a clean way into a job

- It shows no brief card. Used after `G.mission = null` (the only way to leave a job, see F4), it leaves the previous job's bubble on screen, and `seme` threw `Cannot read properties of null (reading 'x')`. This is not a player path. But QA and agents rely on this hook, so a real `AYLMER.abandon()` that goes through `closeMission`, plus a card on `start`, would make DEBUG checks trustworthy.

### F12 (low): a stray `undefined` key in storage

- The review namespace `aylmer.review.qa.` holds a key literally named `undefined`, beside `aylmer.save.*`, `aylmer.radio` and others. Some module calls `setItem(undefined, …)`. Find it with a `setItem` wrapper that throws on a non-string key.

## Notes (not defects, or not ours to rule)

- `dames` still boards Margaret in Tom's truck (« Margaret embarque »). It is allowed as a mother-and-son lift, but it is still STORY-REBUILD s.8 open decision 2.
- A loaded cop line reads « …j'appelle ton père » (`assets/text/ambient.json:178`, loaded by `cops.js`). It is generic, but Dad lives elsewhere.
- The unloaded files `assets/text/russell.json` (French Russell), `support.json` and `story.json` (Margaret « mon grand », a mint from her bag) contradict the canon. They are dead now; delete them or mark them so no one wires them back.
- Margaret's driveway pool follows her own instruction with « Where are you off to? ...I'm just asking. », which reads oddly right after « Canadian Tire and straight back ».
- A $75 speed ticket in the first minutes on Fraser (the bot's reversing caused it) takes most of the first job's pay. It is a design look, not a bug.
- JS heap reads 1.3 GB right after the prototype boots and 523-542 MB after 3-6 minutes of driving. The VERIFY target is under ~500 MB, so it is slightly over. Re-measure with `tools/measure_memory.mjs` on a quiet machine.

## Could not test

- St. Vincent meal → menu → new game (the softlock fix); only `smoke_missionclose` covers it.
- Esc on a shop, replay at 25 % once a day, the away-from-home Dad hint, the $1 bump leak in the browser, save/load mid-mission, and a blocked-storage boot. The smoke suites cover each of these, but no browser check was run.
- Taking the SVX with E (not offered at 4 m in my setup; `G.swapCar` was used).
- Audible sound (headless). The perf route reached Canadian Tire, not Principale or the marina.
