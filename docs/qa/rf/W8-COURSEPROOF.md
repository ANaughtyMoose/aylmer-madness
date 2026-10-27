# W8-COURSEPROOF: medals, R rerun, ghost and Crash Night seen in a browser

Branch rf/w8-courseproof, worktree wt-rf-w8-courseproof, from fix/look-on-qr 81b7c30.
Problem: pressure check risk 4 (references/review/pressure-2026-10-27/PRESSURE.md) and wave7-cloud/RESULTS.md: the cloud bot could not finish a course (SwiftShader runs the game at about 0.1x real time, task timeouts counted wall time), so medals, R and the ghost had never been seen working in a browser.

## Status (27 Oct 2026)
DONE. Hook, game-time clocks and papercuts committed and node-tested on the VM. Cloud proof run three times (cp1, cp2, cp3): every check PASS. Crash Night numbers below; thresholds left as they are (lead decision).

## What changed (all marked [w8-courseproof])
- src/game/qacourse.js (new, QA only, no DOM): `completeNextGate(G)` puts the truck in the middle of the next gate (the race's own Track.check clears it on the next tick, so gates count in order and only after GO); `follow(G, { kmh })` carries the truck along the GPS route through every gate at a fixed speed in game time, so a run has a believable time and the ghost a real path; `follow(G, { kmh, path })` walks a fixed polyline once (used for the church cut); `gateInfo`, `followState`, `qaAllowed`.
- src/main.js (3 lines): `window.AYLMER.qa` is defined only when `qaAllowed(AYLMER_STORAGE)`, i.e. ?review=, ?audioReview= or a tools/ harness frame. In normal play there is no AYLMER.qa and nothing sets G.qaFollow; tick pays one `if (G.qaFollow)` null check before updateMission. No allocation in play.
- tools/review/page-agent.js: task clocks (`seconds`, `timeout`, the stage watchdog, steering timers) count GAME seconds from G.time (warp sub-steps included). `RV.clock = 'wall'` restores the old behaviour. Note: a task's `seconds` under --warp now means game seconds (it used to be wall seconds, i.e. warp x more game time).
- tools/review/harness.mjs: runTask `maxSecs` counts game seconds, with a wall cap of maxSecs x `--wall-factor` (default 3, env CMP_WALL_FACTOR; 15 used on the VM). Results carry gameSecs and wallSecs. REVIEW_ROOT/.gitignore only written when the pack is under REVIEW_ROOT. Enter over CDP carries text "\r".
- tools/qa/lib/rig.mjs: CMP_CHROME_NO_SANDBOX=1 adds --no-sandbox; SwiftShader gets --enable-unsafe-swiftshader.
- tools/smoke_qacourse.mjs (new, 40 checks), tools/review/plans/courseproof.json + courseproof-sc.json, tools/review/beats/courseproof.mjs + courseproof-reload.mjs (the cloud proof, reusable: `--plan courseproof --size 800x500 --warp 3 --wall-factor 15`).

## Node checks for the hook (Colab VM, smoke_qacourse 40/40)
| Check | Result |
|---|---|
| qaAllowed closed with no storage info, player keys (no flag), empty review | PASS |
| qaAllowed open for ?review=panel and a harness frame; storage-ns gives no review name on a plain url | PASS |
| main.js has exactly one `AYLMER.qa =`, guarded by `qaCourse.qaAllowed(globalThis.AYLMER_STORAGE)`; no qa key in the AYLMER literal | PASS |
| qaTick only behind `if (G.qaFollow)`; G.qaFollow is assigned in src/ only by qacourse.js | PASS |
| completeNextGate refuses before GO and after the line; places in the gate on the ground facing the next gate; the race clears gates 1, 2, 3 in order | PASS |
| follow idles on the grid, finishes a stub course with race time = distance / speed (29.3 s at 72 km/h, game time), idles after the line, follow(null) stops | PASS |
| follow walks the nav route polyline (not the straight line); fixed path walked at speed, stops at its end | PASS |
| page agent run in a vm stub: 2 wall seconds with G.time +0.6 count 0.6 s; a reset G.time adds nothing | PASS |
| harness .gitignore guard, Enter "\r", game-time maxSecs; rig no-sandbox and unsafe-swiftshader | PASS |

## Cloud proof (Colab VM aylmer-ct, /content/qa only, one niced Chrome for Testing 156.0.8078.47, SwiftShader, 800x500, warp 3)
Evidence: aylmer-madness/references/review/wave8-cloud/cp1, cp2 (full plan, at bf2f393 and cbddd56), cp3 (shortcut, b6e6ff5): metrics.json, transcript.txt, console.log, shots/. 0 console errors and 0 exceptions in all three.

| Check | Result | Evidence |
|---|---|---|
| bz_vieux run 1 finishes (follow 300 km/h) | PASS | race time 25.0 s game, 5 route legs, 2075 m; cp2 331 wall s |
| Medal line shown | PASS | toast « FINI : Le Raccourci du Curé / OR 0:25,0. Or, avec 1:13,9 d’avance. R : une autre run » (cp2 shots/006, transcript t 498) |
| AYLMER.medal() not null | PASS | {medal "or", value 25.03, t {or 99, argent 110, bronze 126}, isNew true, rerun true} |
| R window open after the finish | PASS | G.rerun {id bz_vieux} |
| Real R key within 10 s puts the truck on the line, no card | PASS | 0.0 m from the line (-895, -86.6), stage 0 grid, cardUp null (shots/007) |
| Run 2 shows the ghost | PASS | ghost() {id bz_vieux, loaded true, t 25.03} at 1.2, 2.5 and 4 s; the gold-tinted translucent Ranger is visible 13 m and 28 m ahead in cp2 shots/009 and 010 (run 2 at 260 km/h) |
| Run 2 finish names the ghost | PASS | « OR 0:28,7 ... 3,7 s derrière le fantôme » (cp2), « 12,2 s derrière le fantôme » (cp1, run 2 at 200) |
| Reload keeps « ton record » | PASS | picker row « départ: rue Principale, coin Bancroft · ton record 0:25,0 », medal disc on the row (cp1 shots/028, cp2 038) |
| Reload keeps the ghost | PASS | after the reload ghost() starts empty {cached 0}; starting bz_vieux loads it: {id bz_vieux, loaded true, t 25.03} (store, not cache) |
| Crash Night result toast | PASS | « TÔLE FROISSÉE : 10 810 $ · BRONZE / Essais : 8 470 · 8 410 · 10 810 / Record : 10 810 $ » (all 7 nights showed one) |
| Crash Night record after reload | PASS | records() {t 13030, better higher}; mode tab « Bronze 6 000 $ · Argent 16 000 $ · Or 30 000 $ · ton record 13 030 $ » (cp2 shots/039) |
| Church shortcut found, saved, reload, load | PASS | cp3: found ["sc_eglise"], toast « Raccourci trouvé! 1/4 / En arrière de l’église », quickSave to tom.1; after the reload a new free summer has [] (per summer, as designed); load tom.1: found ["sc_eglise"], pause « Raccourcis 1/4 » |

Notes on method: the course runs are driven by `AYLMER.qa.follow` (the truck is placed along the GPS route each tick, speed reads 0), so they prove the medal, R, ghost and record plumbing, not driving feel or the medal times a player gets. The church cut in cp3 is carried along its own points at 40 km/h: in cp2 the bot at full throttle overshot the corner at (-294, -48) into a wall at (-278, -66) and stuck (damage 32); finding the cut by real driving was already PASS in wave 7 (RESULTS pass 2), so this step proves the save/reload only.

## Crash Night numbers (spec C-04 placeholders bronze 6 000, argent 16 000, or 30 000)
Bot tries, all at night on the fixed wave: each try waits d game seconds after GO, then full throttle at the junction offset o m sideways; "floor" is RESULTS pass 4's straight line.
| Night | Plan | Tries ($) | Night score |
|---|---|---|---|
| cp1-1 | d 0 / 1.5 / 3, o 0 | 0, 0, 0 | 0 |
| cp1-2 | o -5, o +5, d 2 o +3 | 3 690, 5 330, 8 330 | 8 330 bronze |
| cp2-1 | floor, o -3, d 1 o +3 | 8 470, 8 410, 10 810 | 10 810 bronze |
| cp2-2 | o -5, o +5, d 2 o +3 | 3 690, 6 740, 13 030 | 13 030 bronze |
| cp2-3 | d 4, d 0.8 o -3, d 2.5 o -6 | 0, 8 410, 190 | 8 410 bronze |
| cp2-4 | d 6 o +2, d 1 o +7, d 0.3 o -1.5 | 0, 4 000, 8 240 | 8 240 bronze |
| cp2-5 | d 0 / 1.5 / 3, o 0 | 0, 1 850, 0 | 1 850 none |
| wave 7 pass 4 | floor x3 | 8 200 x3 | 8 200 bronze |
21 tries: 7 zero (aiming dead centre goes through the gap), 14 hits from 190 to 13 030; median hit 8 240; best try 13 030 (4 cars, x1,45). Night scores (best of 3): 0, 1 850, 8 200, 8 240, 8 330, 8 410, 10 810, 13 030.
Read: bronze 6 000 is right (any committed hit on the queue gets it). No bot try came near argent 16 000 or or 30 000. The bot has no timing skill, so these numbers are a floor, not a player's ceiling; 8 nights are not enough to set the top two. Recommendation for the lead (not applied): keep bronze 6 000; argent 12 000 (beaten once in 8 bot nights, so a player who times the cross traffic gets it on a good night); or 24 000 (about twice the best bot try, needs 5 or more cars in the pile). Confirm with Tom's own three tries before changing CRASH.medals.

## Findings for the lead (not fixed, outside the task)
1. save.saveRecord on a slower run updates the record's top-level `at` but keeps t (record {t 25.028, at = run 2's time}); harmless today, worth a look if anything sorts by `at`.
2. The bot overshooting the church cut corner at full throttle into a wall (cp2 shots/025): a player taking the cut flat out may do the same (RESULTS saw a house at the exit too).
3. The course finish toast says « Histoire : 0/10 » under the medal line in free roam (shots/006); fine, but it is noise on a mode result.

## Tests (Colab VM only; nothing ran on the Mac but node --check)
- 4bbd924 named: smoke_qacourse 37/37, smoke_bot 17/0, smoke_review ok, smoke_replay 48, smoke_modes 140/0: GREEN. b6e6ff5 smoke_qacourse 40/40 GREEN.
- Full suite run 1 at cbddd56: 121/124; smoke_audio and smoke_models are the known VM-only fails; smoke_medals failed its timing bar (2000 judgements 9.17 ms vs 5 ms) while my cloud browser run shared the VM. medals.js is untouched by this branch; smoke_medals alone on this branch then GREEN twice, and on fix/look-on-qr GREEN under the same load. A load flake, not a regression.
- Full suite run 2 at b6e6ff5: 122/124 suites passed; only smoke_audio and smoke_models failed (known VM-only): ct.py RESULT GREEN. Log colab-test/logs/b6e6ff5-1027-150311.log. Commits after b6e6ff5 touch only this report.

## Cloud checks for the lead
- Done here: everything in the cloud table above.
- Still for a real GPU / a human: medal times a player actually gets on bz_vieux (the pressure check's "Tom runs bz_vieux twice"), the ghost's look at 60 fps, Crash Night thresholds from Tom's own tries.

## Notes
- colab-test/qa.py: BASE_TREE updated to ddf94827 (the VM was rebuilt on public main ed4703d; the old base, /content/qa and the Playwright Chrome were gone; `npx playwright install` hung, so Chrome for Testing 156.0.8078.47 was fetched straight into /content/qa with a no-sandbox wrapper /content/qa/chrome-wrap.sh). REPO there reads QA_REPO if set.
- Recycled (after the pause ended): my own duplicate downloads in wave8-cloud (4 jpgs, 3 tgz).
