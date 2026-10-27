# W7-BUGS: five small bugs from the 20 Oct red team

Builder w7-bugs, branch rf/w7-bugs, worktree wt-rf-w7-bugs, base fix/look-on-qr 786acf4.
All tests ran on the Colab VM through ct.py (rule of 27 Oct 00:55). Nothing ran on the Mac except one tiny pure node check of the heckle queue, before the new rule.

## Status
Done. Five fixes, one commit and one node regression each. Full suite on the VM at f3369b2: 101/104 green, plus smoke_audio, smoke_harness_gate and smoke_models, the known VM-only failures (counted as GREEN by ct.py; the lead reruns those 3 on the Mac at merge).

## Fixes

### 1. Sauna end lines (8c103ac)
- Evidence: cloud transcript 813b1a7 (s4-sauna-stvincent-fresh). The shift ends at 547.6 s; the bot is already in the lot circle and holds E, so stage 5 ended at 548.8 s. « Sayyad est revenu de chez NASA... » was a toast of its own, pushed on stage 5's enter. It queued behind the shift's toast, was yielded (CENTRE_MAX 2: the prompt and Sayyad's bubble outrank a toast), then held under the end card. The end lines (the attendant, then Sayyad « Walked to NASA and back... ») were queued behind the samosa line. The slow sim (about 0.4x) ended the beat before they came round.
- Fix (src/game/setpieces/sauna.js): the return narration now rides on the shift's own completion toast (« Les plateaux sont ramassés... 40 $. » then a new line with the return). The samosa stage takes E only after SAMOSA_DWELL_S = 3.5 s, so Sayyad's line plays out first and the end lines start right after the end card.
- Test: smoke_sp_sauna. The shift toast carries the return. A held E does nothing for 3.5 s, then ends the job. The stvincent end lines play in order through a real Heckle queue after the samosa line.

### 2. Speedometer against the damage box (7bc58b2, bc62639)
- Evidence: cloud hud-overlap: `speedo x dmgwrap` in 20 of 40 frames. The cause is geometry, not speed: #dmgwrap sat at bottom:104px, inside the speedo's 20 to 152 px (the 132 px dial), so it drew over the dial whenever there was damage. The 0 km/h was a coincidence.
- Fix (style.css): #dmgwrap now sits at bottom:156px with height and line-height 12px. That is the gap between the dial top (152) and the key legend (bottom 170). right:50px keeps it clear of the reverse R (#gear, right:26px, bottom:150px).
- Test: smoke_ui, group « the speedo corner ». It reads style.css and checks the stack: dial, then damage bar, then legend, and the R clear of the bar.

### 3. Sleep re-entrancy (f4d63c5)
- Fix: `summer.sleepBlock(G, { card })` refuses silently ('card', in SLEEP_SILENT) while anything owns the screen. main.js trySleep builds the flag from cinema.active, story.active, endingCard.active, modalOpen(), G.seamHold, G.mealShift and G.mode !== 'drive'. A plan also applies only once (`plan.applied`), so a second onDone moves nothing.
- Note: in the current loop handleKeys already returns while a cinema card is up, and the card swallows keydown. The guard makes trySleep safe on its own and covers the meal, the map and the menus.
- Test: smoke_summer, « sleep is not re-entrant ».

### 4. Sleep forgave an owed day (cddb20d)
- Cause: trySleep called cancelRetry before the card. That settled the owed day (day +1), then applySleep went to the planned morning anyway (planned before the settle). So « fail, sleep one night » cost nothing.
- Fix: sleepTarget adds the owed days (calendar.deferDay, open while the R offer is up) on top of the nights, the same way spendDay adds them on top of a job's day. The card says « +1 jour : la job ratée ». trySleep drops the R offer only after applySleep, when nothing is left to settle. This can land a day past the next opening; that job stays open (nothing expires), which matches S4-SUMMER's « open jobs stay open ». Capped at Labour Day.
- Test: smoke_summer, « a sleep pays an owed day ». A failed job costs its day across a sleep. applySleep then cancelRetry pays it once. It stops at Labour Day. trySleep's order is checked.

### 5. Old save mid « arcsurchauffe » (f3369b2)
- What was broken: the job had no def, so the load toasted « Job perdue », and the slot list still said it was in progress. The cut beat's radiator hose damage (55, set at its stage 1 and only repaired at its stage 7, when you paid Norm) stayed on the Ranger: a wrench on the map and a repair bill for a beat that no longer exists. The old D31 check had been moved to the sauna's date by S4-SUMMER, which hid that the story now waits.
- Fix (src/game/save.js `migrateRetiredJob`, run first in normalizeSave): a saved job whose id is retired is dropped (mission null, doing ''). For arcsurchauffe between stages 2 and 7, Ranger damage of 55 or less goes to 0; more than that (a crash on top) stays. The day is not moved: the wait line and Z take the player to 30 July (safe default, see below).
- Test: smoke_campaign. The D31 group now expects the job to be dropped, plus a new group: damage before and after the hose, other cars untouched, a live job untouched, every retired id.

## Date gates on missions 1 to 3 (not changed, waiting on Tom)
At this head only arcbache (mission 3, the Saint-Jean, 24 June = day 2) has a gate among missions 1 to 3. Sayyad has none. On normal, alternateur and sayyad each spend a day, so arcbache opens just as you get to it: no sleep line. On **easy** (dayCost 0.5), after the first two jobs it is still day 1, so the « Z : dormir » wait line shows before mission 3. Pressing Z at the wrong moment shows it too.
Size of the change: one line in campaign.js DATE_GATES (drop arcbache, or let it open on day 1), plus about 4 to 6 assertions (smoke_summer « mains on days 0 1 2 » and the Saint-Jean on the 24th, smoke_campaign and smoke_econ gate checks). The blocker is canon, not code: the bonfire IS the Saint-Jean, so ungating it moves the fire off 24 June. Alternatives: gate only on normal and hard, or let the first sleep after mission 2 be implicit (the end card's « Le reste de l'été commence ici » rolls to the 24th).

## Cloud checks for the lead
1. `--plan full --only stvincent --columns fresh`: the transcript shows « Les plateaux sont ramassés... / Sayyad est revenu de chez NASA... » with Sayyad's samosa line, then after the card the attendant line and SAYYAD « Walked to NASA and back... ». If the beat still ends before the end lines (slow sim), the harness should hold the beat until the story queue is empty. That is a harness question, not the game.
2. `node tools/qa/hud-overlap.mjs --jobs=stvincent` (and one job with damage plus reverse): no `speedo x dmgwrap`, no `gear x dmgwrap`, no `dmgwrap x legend`. Eyeball one frame: the bar sits just above the dial.
3. Sleep by hand: fail a paid job (first fail, R on offer), drive home, Z: the card shows « +1 jour : la job ratée » and lands one day later than without the fail; the R offer is gone after Debout. Z while a job's end card is up does nothing.
4. Load a save taken mid arcsurchauffe at stage 3 (built at 351835b): no « Job perdue », no damage bar, the wait line for the sauna.

## Out of scope, noticed
- The ambush offer (afterJob) right after a job's end card puts a prompt plus the rival's line on screen while the friends' end lines are still queued, which yields any toast for up to 15 s. Consider holding the ambush offer until heckle.storyBusy() is false.
- hud-overlap's « clock from t=0 on curfew, highwayhull, blitz » fails when those jobs are not in --jobs (QUEUE.md): a tool bug.

## For the lead to decide
- Fix 5 keeps the day (the player sleeps to the sauna). The alternative is to move a mid-arcsurchauffe save to day 38 on load. Tom's call if wanted.
- Fix 4 lets a sleep land one day past the next opening when a day is owed. The alternative is to absorb the owed day into a multi-night sleep, which forgives it again.
- Missions 1 to 3 gate: above.
