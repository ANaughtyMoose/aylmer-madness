# W8-BUGS: six bugs from the wave 7 cloud browser run

Builder w8-bugs, branch rf/w8-bugs, worktree wt-rf-w8-bugs, base fix/look-on-qr c2928ca.
Evidence: aylmer-madness/references/review/wave7-cloud/RESULTS.md (cloud run on 17fc765, SwiftShader at about 0.1x real time).
Every test ran on the Colab VM through ct.py. Nothing heavy ran on the Mac (only `node --check` syntax checks).

## Status
Done. All six fixed, one commit and one node regression each. Full suite on the VM at 0f84b8d: GREEN, 116/118 suites, the two failures being smoke_audio and smoke_models, the known VM-only ones (smoke_harness_gate passed here). The lead reruns those on the Mac at merge.

## Fixes

### 1. St. Vincent lines out of order, end lines missing, end text twice (954a79f)
- Does w7-polish fix part of it? Yes, one part: `ambush.holdAfterJob` now waits for `heckle.storyBusy()` false, so the challenge prompt no longer counts down over the queued end lines. It does not fix the order or the missing lines.
- Causes found:
  - The lot stage queued « Go feed people. I'm walking to NASA... » on enter, and a held E went into the meal at once. main.js does not run `heckle.update` during the meal, so the line sat in the queue and came up after the shift, behind « Sayyad est revenu de chez NASA ».
  - `stopHeat()` returned early once `G.sauna` was gone (the lot stage stops the toy), so its `heckle.cancel('sauna')` never ran again. The samosa line, still queued when the 3.5 s dwell let E end the job, outlived the job and played after the end card, ahead of the end pair. At 0.1x the end pair then never came round inside the 15 s the run watched.
  - main.js toasted the last stage's text and also put it in the end card body. The toast waited under the card and came up again after it.
- Fix:
  - src/game/setpieces/sauna.js: `sayyadTalking(G)` (a 'sauna' line queued or on screen) and `lineDone(G, m, minS)`. The lot stage's E waits for « Go feed people » to play out. The samosa stage's E waits for SAMOSA_DWELL_S and for the samosa line to leave the queue. Both are measured through the queue itself (game time), never wall clock. LINE_WAIT_MAX_S = 12 s of stage time is the cap so nothing can lock. `stopHeat()` now cancels 'sauna' lines even when the toy is already gone, so a lot line that never got its turn is cut when the meal opens instead of playing after it.
  - src/main.js: `toastOnCard`. On the last stage of a job that ends on the card, the stage text is shown only in the card. If no card shows (the summer ended on that job), it is toasted as before.
  - story.js stvincent.end needed no change. Once the samosa line is done before E, the end pair is first in the queue after the card.
- Test: smoke_sp_sauna, group « Sayyad in order through a real queue, at any frame rate ». A real Heckle at 1/60 s and 1/6 s steps. A held E does not go in while Sayyad talks. « Go feed people » plays before the meal. The samosa line plays before E ends the job. The order is lot, meal, samosa, attendant, « Walked to NASA and back ». A stuck queue opens E at 12 s and the meal cuts the leftover line. main.js shows the end text once. 109/109.

### 2. Tôle froissée refused over the auto-started L'alternateur (b8d7f02)
- How courses handle it: from M, courses are refused too. `busyWith` greys every row except Balade, and Tôle froissée's row is greyed the same way. The cloud run called `crashNight.start()` directly, which has the same refusal. So the two already matched, and both refused a job the player never chose.
- Fix: one rule for both, `yieldsToMode(m)` in src/game/missionkit.js. It is true only for a job main.js marked `autoStarted` (L'alternateur after the opening or the story card, both auto-start paths) and only while it is still on its first stage. modes.js `busyWith`, `startCourse` and crashnight.js `startCrashNight` all use it. That job is not failed (no RATÉ card): main.js `startMission` closes it quietly with closeMission('quit'). A job the player took, or the first job once they have picked up the box (idx > 0), keeps the refusal. A loaded save has no `autoStarted` flag, so it keeps the refusal (safe default).
- Tests: smoke_modes (a course starts over the untouched auto job with no fail, and is refused once it has moved on) and smoke_crashnight_mode (the picker's rows are not greyed, Tôle froissée starts with no fail, it refuses at idx 1, and it refuses the same job when the player took it). Both GREEN.
- For the lead: after a mode, L'alternateur is not auto-started again. Its pillar is there as for any open job. Say so if it should restart by itself.

### 3. The first search cruiser busts a hidden truck (25136cd)
- Cause: `_searchPoint` sent unit 0 to the exact lost-sight point (radius 0), and the cone's fallback also went to the exact centre. Only the cone points kept off hide spots.
- Fix (src/game/cops.js): `SEARCH.miss = 35` (past HIDE.pass 30). The first targets are now unit 0 at 0.4 r and unit 1 at 0.5 r along your heading, each tried straight on, then turned 0.6 rad either way. Then the cone. Then a ring at 0.6 r, never the centre. Every target goes through `_searchTry`: snapped to a street node, inside the circle, not service-only, at least SEARCH.miss from the lost-sight point and 20 m off any spot's edge. The C-16 rules hold: never the true position, inside the circle, forward-biased, band, retarget and siren unchanged. Module-level constant arrays mean no new per-frame allocation.
- Test: smoke_cops_search, new group. 576 targets (every spot, 8 headings, 2 and 3 stars, both units, 6 re-plans) are all at least 35 m off and clear of spots. With no road graph, unit 0 is 56 m off. A live search from a spot sent no unit closer than 84 m. 102/102.

### 4. HUD crowding at curfew start (2b70fce)
- Cause: the toast and the prompt force `layoutCentre(true)` when they change. A story bubble (heckle.js) and the tutorial chip (ui.js) did not, so for a frame or more (100 ms throttle, longer on slow frames) three centre layers drew at once.
- Fix: the centre keeps its one ranking (CENTRE_ORDER, CENTRE_MAX unchanged). Hud `_watchCentre` puts a MutationObserver on #heckles (childList) and #tuto (class and text), so any change re-ranks before the next paint. These elements only mutate when they change, not every frame. No line is lost: a yielded toast was already frozen, and now a yielded tutorial tip also waits (Tutorial.update returns while it has hud-yield), so the handbrake tip's 25 s timeout cannot run out unseen. Top-left: `#sub.faded` now drops with `transition:none` (the 0.35 s fade-out was the third top-left line in the failing frame, « sub=faded/0.8 »). The fade-in is unchanged.
- Test: smoke_ui group. Both layers are watched, and a change forces a re-rank. A yielded tip does not time out and then runs its 25 s once back. The faded sub CSS is checked.

### 5. Stale « S pour reculer. Sors de l'entrée. » (9aa8bce)
- Fix: src/game/ui.js `DRIVEWAY_R = 30`, and the first step is flagged `driveway`. main.js enterDrive sets `G.tutoDrive` only when the truck starts in the nose-in spot at 299 Fraser (within 6 m of home.ranger), and passes `drivewayM` to the tutorial (Infinity otherwise). Away from the driveway at start, or once moved or teleported more than 30 m from it, the step is dropped with no green flash. A caller with no drivewayM keeps the old rule.
- Test: smoke_ui group (stays in the driveway, dropped on a far start, dropped past 30 m, old callers unchanged, main.js wiring).

### 6. Speech bubbles over the crash replay (2912706)
- Fix (src/game/crashreplay.js): `overlay(on)` also calls `speech(on)`, which hides #heckles and #slangpanel (SPEECH_IDS) with visibility and puts back the exact previous inline value afterwards. A second `on` does not overwrite the saved value. The story queue does not tick during the replay (main.js returns before heckle.update), so no line is lost.
- Test: smoke_crashreplay block (hidden on, restored off).

## Checks (Colab VM, ct.py)
- 954a79f smoke_sp_sauna: GREEN 109/109.
- 25136cd smoke_cops_search, smoke_modes, smoke_crashnight_mode: GREEN (102/102, 140 passed, 35/35).
- 0f84b8d smoke_ui (179), smoke_crashreplay (30/30), smoke_firstminute, smoke_heckle_queue, smoke_missionclose: GREEN.
- 0f84b8d full suite: GREEN 116/118 (smoke_audio, smoke_models VM-only), 640 s. Log: colab-test/logs/0f84b8d-1027-103126.log. The only commit after it is this report (docs only), so one full run covers the code.

## Cloud checks for the lead
1. `--plan full --only stvincent --columns fresh`: « Go feed people » before the meal. After the shift toast, the samosa line, then E. After the card: the attendant, then « Walked to NASA and back ». The end text shows once (card only). Then the challenge, if one comes.
2. Balade libre start, then M, Tôle froissée (and a Blitz) before touching the first job: it starts, with no RATÉ card. After picking up the box at Canadian Tire, both are refused with the busy footer.
3. Escape: teleport into the Galeries spot (`escape3` plan). The first cruiser goes about 0.4 r on along the heading, not onto the spot. Expect « Y ont passé tout droit » unless a route really passes within 16 m.
4. `node tools/qa/hud-overlap.mjs --jobs=stvincent,curfew`: 0 crowded frames, 0 top-left over.
5. Balade libre start away from home: no « S pour reculer » at any point. New game at home: it is there until you back out.
6. Crash replay (V) with a story line up: no bubble over REPRISE, and the line is back after.

## Out of scope, noticed
- The cloud note 7 (the « ? Afficher les commandes » chip over the centre toast at 800x500) is not in this task.

## For the lead to decide
- Bug 2: should L'alternateur auto-start again after a mode started over it? It does not now.
- Bug 1: LINE_WAIT_MAX_S = 12 s is a guess at a safe cap. On a normal frame rate the waits are about 3.5 to 4 s.
