# W7-POLISH: six loose ends (27 Oct 2026)

Branch rf/w7-polish (worktree wt-rf-w7-polish), from fix/look-on-qr c685390.
Every test ran on the Colab VM through ct.py. Nothing heavy on the Mac.

## Items

### 1. Key legend: V (f46162f)
- src/game/i18n.js `k.weather`: FR « La météo, pousse au prochain front (après un gros crash : le revoir) », EN « Weather: push to the next front (after a big crash: replay it) ». The old FR line had an em dash; gone.
- Check: smoke_ui, the V row names weather and the replay in both languages, no dash.

### 2. Mid-course / mid Crash Night save (124852d)
- src/game/modes.js: startCourse's teleport split out as `placeOnStart`; new `resumeModeSave(G, id)`. A course id puts the truck on its start line, Cruise, toast « <course>\nUne run reprend pas d'une sauvegarde. T'es en balade sur la ligne de départ. M pour la relancer. ». A registered mode (Crash Night) stays where it was saved, Cruise, same line without the start-line part. Story ids return null.
- src/main.js resumeMission: asks resumeModeSave before « Job perdue » (still said for a story job that was cut).
- src/game/save.js snapshot: during Crash Night the current car's health is the pre-night damage (`G.crashNight.savedDamage`), the value the night's cleanup restores.
- Check: smoke_replay (course pose, free roam, no loss line, Crash Night, story id null, main.js order, snapshot damage both ways).
- VM: smoke_ui 168, smoke_replay 37, smoke_save 355, smoke_modes 138: GREEN (124852d).

### 3. Challenge offer held (a42490b, test fix 37d7ebf)
- src/game/ambush.js: `holdAfterJob(G, def)` parks the offer in `G.ambushHeld`; `tick()` makes it (afterJob, unchanged) on the first tick with `heckle.storyBusy()` false (queue empty, nothing on screen, breath over). Dropped when a job starts, the summer is over, or the queue stays busy past HOLD_MAX_S = 60 s; also skipped if the street is hushed at release.
- src/main.js: the end card's followUp calls holdAfterJob; a load clears G.ambushHeld.
- Check: smoke_verbs V8b (held 20 s behind queued end lines, offered on the first quiet tick, dropped on a new job, dropped after the cap, main.js wiring).

### 4. racedave win line (cc11196)
- src/game/racejobs.js: `rivalGapSeconds(G, m, name)` = Adam's metres left to the line over his own average pace so far (floor 4 m/s); `arrivesLine(name, secs)` writes « Adam arrive quatre secondes plus tard. » (« , ben tranquille » from 6 s), « collé sur ton pare-chocs » under 1 s, « en arrière, ben tranquille » with no number when unknown. The win is now a function (like the courses); `winText` keeps a plain string on the stage for smoke_lang / smoke_canon. The old line's em dash is gone (« +25 $, il paye ton gaz. Presque tout. »).
- Check: smoke_w6races (wording, the gap maths, the default has no « douze » and no dash).
- VM: smoke_verbs, smoke_w6races, smoke_lang 39, smoke_canon 139, smoke_race 215, smoke_econ 72: GREEN (37d7ebf).

### 5. One clock for courses (44a4211, stub fix 679119c)
- src/game/missionkit.js `courseTime(m)`: m.race.t when the race clock ran, else m.elapsed. runPay for a course compares it with G.best.
- src/main.js finish: a course's G.best, « NOUVEAU RECORD » and the FINI time use courseTime (story jobs keep m.elapsed, their only clock). src/game/modes.js cleanup: the aylmer.modes best and « MEILLEUR TEMPS » use it too.
- Old saves: src/game/save.js normalizeSave moves bz_* / cp_* entries of `best` into a new `bestLegacy` field when the save has none (a pre-change save). Snapshots always write `bestLegacy`, so a new save is never migrated twice. runPay: a legacy win still means « won once » (no second purse) and is never compared with a race time; the first run on the new clock sets the best and pays nothing (« Bats ton record pour 10 $ »). main.js loads G.bestLegacy.
- Not changed: the global aylmer.modes table may still hold an old grid-inclusive value for a course not run since; the first run replaces it (always faster). Its only readers are the summer-end card and the records legacy fold (already flagged legacy).
- Check: smoke_replay +11 (courseTime, pb and repeat on race time, legacy win, first win, old save migration, no second migration, snapshot marker, modes table and toast, main.js wiring).
- VM: smoke_replay 48, smoke_econ 72, smoke_save 355, smoke_storage 135, smoke_records 50, smoke_modes 138, smoke_summer 189: GREEN (679119c).

### 6. sc_galeries off the kiosk (d75eef1)
- src/game/shortcuts.js: the point (8, -283) is now (8, -278). Clearance to the four kiosk walls 0.63 m before, 3.96 m now. Pass points, seal and frozen lengths unchanged (cutM 558 vs 559 frozen).
- Check: smoke_landmark_roads group 5 (the galeries colliders round the kiosk centre, sampled every 0.25 m along the cut, 3 m or more).
- VM: smoke_landmark_roads 77, smoke_shortcuts GREEN (d75eef1): off-street 4 m from every building, beats the road by 7.3 s, pace car through the cut 38.7 s (was 39.7).

## Full suite
- Run 1 (626a992): 112/115, the three VM-only (smoke_audio, smoke_harness_gate, smoke_models): GREEN.
- Run 2 (e25ad43, code identical to the head): 113/115, only smoke_audio and smoke_models (VM-only): GREEN.

## Cloud checks for the lead
1. Legend: open it (?) in FR and EN; the V row reads on one line at the default HUD size, no overflow.
2. Save mid-course (F5 during bz_vieux), reload: no « Job perdue », truck on the bz_vieux line in Cruise, the « Une run reprend pas d'une sauvegarde » toast; M runs it again. Same mid Tôle froissée: free roam where saved, no damage from the night on the car.
3. Finish a job whose friends have end lines with 3+ jobs done (challenge eligible): the end lines play out, then Sayyad's challenge; no toast held under it.
4. Win racedave: the FINI line names a margin that matches what you saw (a few seconds on a clean run).
5. Win a course twice on a save made before this branch: the second purse line is « Pas de bourse... Bats ton record », no false « NOUVEAU RECORD » from the old grid-inclusive time; then beat the time: 10 $.
6. Drive sc_galeries past the kiosk: no wall contact, the shortcut still counts.

## Open for the lead / Tom
- Safe default taken in 2: a mid-night save keeps the car where it was saved (on Principale near the light) rather than moving it; the save's time of day is the night's.
- 5: the global aylmer.modes table (summer-end card) can still hold an old grid-inclusive value for a course not run since this change; the first run replaces it.
- Noticed, not fixed: the k.modes legend row and the challenge line and prompt in ambush.js (afterJob, tick) still carry em dashes. shortcuts.js registers a mode with id 'checkpoint', which also adds a second 'checkpoint' row to MODES and makes the picker's digit keys take the EXTRA path for that tab; worth a look by the owner of w6-shortcuts.

## Where I stopped
Done. All six items committed with a check each; full suite run 1 GREEN; run 2 on the final commit.
