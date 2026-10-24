# QA matrix: integration build, 29 Sept 2026

Independent integration QA (wave 3) of `claude/quality-review-2026-09-29` at `1ce60cf`. Tester: Claude (did not write any of the changes). Defects are ranked in `docs/review/qa-findings.md`.

**Setup.** Apple M4, 16 GB, macOS 27. Headless Chrome 154.0.8037.58 on the Metal GPU (`--use-angle=metal`), own profile `/private/tmp/claude-501/qa-profile`. Server: `node tools/serve.mjs 8150 --audio-dir …/scratch/audio`. URLs: `http://localhost:8150/index.html?review=qa` and `http://localhost:8150/prototype.html?audioReview=1`, so no real save was touched. Driver: raw CDP (`/private/tmp/claude-501/qa/cdp.mjs`), with keys sent as `Input.dispatchKeyEvent` rawKeyDown/keyUp. Load average during the runs was 3.6 to 8.1 (logged next to each timing).

**Types.** LIVE means real keys, steered by hand-timed presses. SCRIPTED means real keys with a bot doing the steering from the game's own `G.route` / `G.mission.target` (`bot.mjs`). DEBUG means AYLMER shortcuts (`start`, `teleport`, `visualClock`, `G.*` writes, module imports). **No full campaign playthrough is claimed.** One job (alternateur) was driven end to end, SCRIPTED.

Evidence paths are relative to `/private/tmp/claude-501/qa/shots/` unless given in full.

| # | Area | Scenario | Type | Result | Evidence |
|---|---|---|---|---|---|
| A1 | Build | `npm test` (all suites) on the final tree | n/a | PASS: 70/70; no flaky rerun needed | `/private/tmp/claude-501/qa/npmtest.log` |
| A2 | Build | `node --check src/main.js` | n/a | PASS | console |
| A3 | Build | Conflict markers in `src/ tools/ *.html assets/text` | n/a | PASS: none | console |
| B1 | First run, index | Menu reaches the screen; GO opens « Où tu pars? »; EMBARQUE (fixed, 520×55 at y=729) reaches `drive` | LIVE (DOM clicks) | PASS: menu 0.46 s, drive 7.0 s, 0 console errors | idx-menu, idx-where |
| B2 | First run, index | Clicking GO before `main.js` has loaded (the first ~0.45 s) | LIVE | FAIL (low): the click is swallowed with no feedback (F9) | idx-where (first attempt) |
| B3 | First run, index | Opening card: Tom, "ton père te l'a donné", ta mère's basement, $1,200, alternateur | LIVE | PASS | idx-card |
| B4 | First run, index | Mission brief card, then Enter; bubbles | LIVE | PASS: after the card closes, one bubble at a time: Margaret « Canadian Tire and straight back, Tom. I'm timing you. » → « Put the box where it won't slide. » → « Where are you off to? ...I'm just asking. » All in English, no "Ton père" | idx-brief-b |
| B5 | First run | No « acheter la Saturn · 0 $ » prompt at spawn | LIVE | PASS: prompt shows « K — Kijiji », then the GPS hint | idx-brief-c |
| B6 | First run | Spawn faces the street; W goes forward without hitting the Saturn | LIVE | PASS: W for 2.5 s moved 12 m forward, damage 0 → 0 | idx-w1, idx-brief-c |
| B7 | First run | Standing still at spawn while the bubbles play | LIVE | FAIL (medium): after ~20 s the stuck nudge fires; the reset buttons show and a passer-by says « T'es juché su'l banc d'neige… » (a snowbank on 26 June) (F2) | idx-brief-c |
| B8 | Alternateur | Drive Fraser → Canadian Tire, stop in the pillar, E | SCRIPTED (2 T resets while leaving the driveway area) | PASS: stage 0 → 1; « C'est dans la boîte » card | ct-E, idx-home |
| B9 | Alternateur | Drive back to 299 Fraser, E | SCRIPTED (0 resets) | PASS: job closes, +23 $ | alt-end |
| B10 | Alternateur | Completion shows the solenoid twist | SCRIPTED | PASS: toast and end card « …c'était juste le solénoïde… »; Margaret « That's the whole alternator? For one little light? » | alt-end |
| B11 | Alternateur | Numbers on the end screen | SCRIPTED | FAIL (low): the toast says « Bonus de formation, 22 $ », the card says « Paye : 23 $ » and +23 is paid; « 1 jobs faites » (F7) | alt-end |
| B12 | First run, prototype | Same flow in `prototype.html?audioReview=1` | LIVE | PASS: menu 1.97 s (0.74 s warm), drive 10.5 s (7.8 s warm); same three Margaret bubbles one at a time; « W pour avancer »; rain on 26 June (historical) | pro-card2-*, pro-brief-b |
| C1 | Story | Briefs, stages, toasts and start/end lines for gang, curfew, divan, dames, margaretdental, russellroyal, seme, arcdernier, sayyad, highwayhull, quatre, circuit, arckeys, school (14 missions), read from the live page's modules | DEBUG | PASS: no bingo, slush, CVs, Nepean, Waterloo, drinking, sister or hospital, and no "Ton père" at home. Margaret speaks English and stays in the driveway or upstairs | `/private/tmp/claude-501/qa/story2.txt` |
| C2 | Story | Margaret never boards or races | DEBUG | PASS, with one noted exception: `dames` (« Margaret embarque »), a lift with her son alone that is still an OPEN DECISION in STORY-REBUILD s.8. circuit fields Sayyad and Adam | story2.txt |
| C3 | Story | Russell in English | DEBUG | PASS: all 4 russellroyal lines are English. `assets/text/russell.json` still holds French Russell, but no runtime file loads it | story2.txt |
| C4 | Story | Sayyad's theory in seme | DEBUG | PASS: « Sayyad a une théorie… », « Theory: la police d'Aylmer lâche après deux rues »; Mike « Moé, je regarde » | story2.txt |
| C5 | Story | `story.endingCards` (made it and missed it) | DEBUG | PASS: no Waterloo; last card « Le Ranger va rouler jusqu'en 2011 » | story2.txt |
| C6 | Story | Zahra's age | DEBUG | n/a: no sampled line states it | story2.txt |
| C7 | Story | `AYLMER.start` in the running game (bubbles and toasts) for 8 ids | DEBUG | INCONCLUSIVE: `start` does not show a brief card; forcing `G.mission=null` between starts left one bubble (« Clean the pan, Tom ») on screen through several jobs, and `seme` threw `Cannot read properties of null (reading 'x')`. Both are artefacts of the DEBUG shortcut, not a player path (F11) | story-*.jpg, `/private/tmp/claude-501/qa/story1.txt` |
| C8 | Story | Town text | static grep | NOTE: a loaded cop line (`ambient.json:178`) says « …j'appelle ton père. »; `upgrades.js:465` and `mechanic.json:43` use « mon grand » (Norm, not Margaret) | grep |
| D1 | Systems | SVX: take it, then wreck it | DEBUG (E at 4 m did not offer the SVX, so `G.swapCar('svx')`, then damage=100) | PASS: towed to the SVX's home, the Fortier chase still runs, 0 exceptions, still drivable | svx-after |
| D2 | Systems | Tow toast vs wallet | DEBUG | PASS at $200 (-60, « pis réparé ») and at $20 (no charge, « t'es cassé »). One earlier unforced run showed « t'es cassé » after a real -60 (80 → 20): probably two tows in a row; not reproduced (F8) | console |
| D3 | Systems | Damage hint after the tow repairs the car | DEBUG | FAIL (low): « Ça tire à gauche pis ça pétarade — va le faire réparer » appears right after « Remorquage… pis réparé », with damage 0 (F6) | console |
| D4 | Systems | St. Vincent meal, quit to menu, new game drives (softlock) | DEBUG | NOT TESTED: `AYLMER.start('stvincent')` returned no job in the hacked state; covered only by `smoke_missionclose` (18/18) | n/a |
| D5 | Systems | Esc on a shop closes without pausing | n/a | NOT TESTED in the browser (`smoke_input` P1/P2 pass) | n/a |
| D6 | Systems | Mission fail, abandon, retry, replay at 25 % once a day | DEBUG (partly) | PARTIAL: fail by wreck works (« Le char est fini. Remorqué. »). The pause menu has « Recommencer la job » but **no abandon**, and the job list is disabled while a job runs (F4). Replay pay not measured in the browser (`smoke_econ` covers it) | code `main.js:2692-2697` |
| D7 | Systems | Night-job window in the prototype, noon | DEBUG | PASS: curfew at 12 h and 5 h gives « Reviens après 21 h (jusqu'à 4 h). »; open at 22 h. FAIL (low): the nachos brief is set at 4:30 a.m., yet the job opens at 21 h (F5) | console |
| D8 | Systems | Dad's landline call: broke at home | DEBUG (wallet $3, fuel 1 L, parked at 299 Fraser) | PASS: « Le téléphone sonne dans la maison », Margaret « Tom! Phone! It's your father. », 5 Dad lines in order, +85 $, `dadCalls` {n:1, log:[gas]}. The +85 $ toast lands before he speaks (F10) | console |
| D9 | Systems | Away-from-home hint | n/a | NOT TESTED in the browser (`smoke_econ` covers it) | n/a |
| D10 | Systems | $1 bump leak, 60 s over rough ground | n/a | NOT TESTED in the browser (`smoke_jumps` "bumpy road" passes: $6 over 2 min). The 3-minute perf drives earned $0 from bumps | perf runs |
| D11 | Systems | Unforced police ticket after the alternateur | SCRIPTED | NOTE: my stop routine reversed at up to 34 km/h on Fraser, which brought one star and a « Ticket: 75 $ » (103 → 28). This is the bot's fault; the $75 bill in the first minute of play is worth a design look | alt-end2 |
| E1 | Saves | `AYLMER.save('tom.1')`, then corrupt `aylmer.save.tom.1` in the review namespace, then `AYLMER.slots()` | DEBUG | PASS: `corrupt:true`, « Sauvegarde illisible (endommagée) », not empty. The load-menu DOM itself was not opened | console |
| E2 | Saves | Namespace hygiene | DEBUG | FAIL (low): a key literally named `undefined` exists in `aylmer.review.qa.` (F12) | console |
| E3 | Saves | Save and load mid-mission | n/a | NOT TESTED in the browser (`smoke_save` passes) | n/a |
| E4 | Saves | Storage blocked: the prototype shows a message and boots | n/a | NOT TESTED (needs a profile with blocked site data) | n/a |
| F1 | Radio | R toggles | LIVE | PASS: on ↔ off (`wantOn` follows) | console |
| F2 | Radio | Shift+R next station keeps on/off | LIVE | PASS: oldies1310 → ckmf943 → chez106 while off, stays off; cbc-radio-one while off, stays off | console |
| F3 | Radio | Holding R for 1.5 s does not churn | LIVE | PASS: exactly one toggle | console |
| F4 | Radio | Pause and resume keep the sound | LIVE | PASS: Esc gives mode paused and radio on=false (want kept); Esc again gives drive and on=true; AudioContext `running` throughout. Audible output was not verified (headless) | console |
| G1 | Performance | Prototype load | LIVE | Menu 0.74 s, drive 7.8 s (load 8.1). Cold first prototype: menu 1.97 s, drive 10.5 s (load 5.3) | perf-* |
| G2 | Performance | Noon (`visualClock(12)`), 3 min | SCRIPTED (route Fraser → chemin d'Aylmer → Canadian Tire, then circling the pillar; **not** Principale or the marina) | median 16.7 ms, p95 16.7, p99 16.8, 1 frame > 250 ms (500 ms, at start), 3 > 50 ms; JS heap 1,299 MB just after boot (pre-GC) → 523 MB after the run | perf-noon |
| G3 | Performance | Night (`visualClock(22)`), 3 min, same route | SCRIPTED | median 16.7, p95 16.7, p99 16.8, max 50 ms, 0 > 250 ms; heap 525 → 542 MB. Load 7.5 → 4.3 | perf-night |
| H1 | UX | Reset buttons « Remettre sur la route / Dépanneuse » and the « Espace… frein à main » tip | LIVE | NOTE: the Psst GPS line covers « W pour avancer » at spawn on index | idx-brief-c |
| H2 | UX | Margaret's driveway pool after the start lines | LIVE | NOTE: « Where are you off to? ...I'm just asking. » straight after she has sent him to Canadian Tire | idx-brief |

**Totals:** 25 PASS, 5 FAIL (B7 medium; B2, B11, D3, E2 low), 1 split row (D7: the message passes, the timing fails, low), 1 PARTIAL, 1 INCONCLUSIVE, 6 NOT TESTED, 4 NOTE, 1 n/a. G1-G3 are measurements, not verdicts.
