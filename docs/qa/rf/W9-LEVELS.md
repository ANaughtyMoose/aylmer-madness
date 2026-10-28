# W9-LEVELS: where a mission starts and stops

Branch rf/w9-levels, worktree wt-rf-w9-levels, from fix/look-on-qr 8a1ca3a (release 3 code, same src tree as public 4fb0dfa). Tom, 27 Oct, after playing release 3: « it's not clear where the levels start and stop anymore ».

## Diagnosis

Compared 3c02c92 (release 1) and 8a1ca3a in main.js, hud.js, cinematic.js, modes.js and the W6 to W8 reports. cinematic.js is unchanged; the brief card and the « JOB TERMINÉE » card still exist. What changed is everything around them.

### Commits that moved the start and end signals

| Commit | What it did | Effect on start / end |
|---|---|---|
| 29079f5 w6-opening W6 | `openingDone` starts L'alternateur with `{ card: false }` always (release 1: a card when the film was skipped) | Mission 1 has no start moment at all after the opening |
| f67dbd5 (wave 8, lead) | Balade libre: L'alternateur starts with `{ card: false }` right after « Été 2004 » | Same on the other path: no mission 1 start anywhere |
| 525094d W8-FIRST15 step 2 | removed the new-game toast « AYLMER, QUÉBEC / prends ton temps » | The last thing that marked « you are now playing » at control is gone (right call, it contradicted Maman's clock, but nothing replaced it) |
| 0367fc6 W8-OPENING W7b | the end name card and the friends' end lines wait on each other after the end card | The end now runs past the card: card, then name card, then end lines |
| a42490b w7-polish 3 | the street-race challenge waits for the end lines | One more beat after the end, up to 60 s later |
| 954a79f W8-BUGS 1 | last stage text on the card only | Good (one less duplicate); kept |
| W6-REPLAY (c-02a) | a course ends on a toast, no card, so R works at once | Right for courses, but the brief cards of a course and a story mission look identical (same « AYLMER, QUÉBEC · ÉTÉ 2004 » eyebrow) |

And one that was always there but now bites harder: the toast queue freezes while any card is up (hud.js `setModalOpen`, U7) and has one slot with a 2.5 s floor (A-04). The « FINI : title / time / Histoire n/10 » toast, the car-unlock toasts and the new-day toast are all pushed while the end card is up, so they play **after** the card closes, one after another, for 10 s or more, frozen again whenever a friend's end line (a story bubble outranks a toast) is up. A player who drives straight to the next pillar can see mission N's « FINI » toast after mission N+1's brief card. The end of a mission is smeared over the start of free roam, and sometimes over the next mission.

### What the player sees today (8a1ca3a)

1. **L'alternateur (mission 1).** Opening film, control. No title, no card, no toast: the objective line top left (« Va chercher ton alternateur ... ») and Margaret's bubble. Nothing says a mission began. End: the « JOB TERMINÉE » card (good, it says « Le reste de l'été commence ici »), then after it closes: « FINI : L'alternateur ... Histoire : 1/10 » toast, the day toast, Margaret's door line and end lines. Nothing on the card says what is next; the free-roam line top left does (W8-FIRST15).
2. **Réveiller Sayyad (2).** His pillar, « ⏎ Réveiller Sayyad », brief card (eyebrow « AYLMER, QUÉBEC · ÉTÉ 2004 », the same on every card). End: « JOB TERMINÉE » card, then Sayyad's name card, the end lines, the FINI toast, unlock toasts (the Civic), day toast.
3. **La Saint-Jean (3).** Same as 2. Its card and an optional job's card are indistinguishable.
4. **Le divan de Mike (4).** Same as 2.
5. **A course (M, e.g. Blitz du Vieux).** Teleport, « BZ_VIEUX / Sur la ligne » toast, then a brief card with the same eyebrow as a story mission. End: the FINI toast with the medal, no card, R for another run. Balade libre (« Cruise ») is a toast only.

So: mission 1 has no start, every mission's end trails off into four or five late toasts and lines, and nothing on screen tells a story mission from a side job or a course.

## Fix (what changed)

One new module decides the frame, main.js only asks it: **src/game/missionframe.js** (pure, no DOM). Commit 1898bb7.

### Start
- Every brief card now has an eyebrow that says what it is, instead of « AYLMER, QUÉBEC · ÉTÉ 2004 » on all of them: « MISSION 3 SUR 10 » (EN « MISSION 3 OF 10 »), « DERNIÈRE MISSION » for Le dernier soir, « JOB À CÔTÉ » for a side job, « COURSE LIBRE · HORS HISTOIRE » for a course, « DÉFI · HORS HISTOIRE » for a rival's street race.
- **Mission 1 has a start again, without a card** (bar 1 and W6 still hold: no card after the opening, none after « Été 2004 »). A story mission started with `{ card: false }` gets a start banner: one toast in the front slot, 3.2 s, « MISSION 1 SUR 10 : L'ALTERNATEUR » then the first objective. It never stops the truck; Enter takes it down early. The friends' start lines (Margaret) and the live name cards wait for it on game time (main.js `holdBanner` / `tickBanner`), so the title is the first thing on screen and nothing stacks under it. Courses rerun with R keep their own « Sur la ligne » toast, no banner.

### End
- The end card's eyebrow names the mission: « MISSION 2 SUR 10 TERMINÉE » (with the medal after it when there is one, « ... · OR »). Side jobs keep « JOB TERMINÉE ».
- The card ends with **one next step**: « Prochaine mission : La Saint-Jean · Plage ... » (the next main mission and where it starts; Le dernier soir after the tenth; nothing after the finale). S4-SUMMER's date note (« Prochaine histoire : le 24 juin ») still follows when the story waits on a date.
- **Nothing about a finished job is left in the toast queue.** The FINI toast is no longer pushed when a card follows (the card already has the time, Histoire n/10, pay and style); a lent car (« NOUVEAU CHAR ... ») and the new day (calendar.spendDay's toast, caught through a sink in `endOfJob`) go on the card's task lines instead of playing one by one after it closes. If the summer ends on that job (no card), the same lines go out as toasts as before.
- Unchanged on purpose: Sayyad's end name card and the friends' end lines still follow the card (W7b), and the street-race challenge still waits for them (w7-polish 3). Those are people talking, after a clear end.

### Free roam reads as free roam
- Courses keep ending on their FINI toast with no card, so R works at once (W6-REPLAY); their card says « HORS HISTOIRE ».
- M, Balade: the toast is « BALADE · HORS HISTOIRE » (was « CRUISE »).

### Files
src/game/missionframe.js (new), src/main.js (startMission, holdBanner, tickBanner, closeMission, handleKeys, endOfJob, updateMission end block; every edit marked W9-LEVELS), src/game/hud.js (`dropToast`), src/game/modes.js (Balade toast), tools/smoke_levels.mjs (new).

Per-frame cost: one null check per fixed step (`tickBanner`); the rest runs once per job start or end. No allocation per frame, no new DOM layer, no new pass.

## Checks (Colab VM via ct.py, nothing run on the Mac)
- The VM had been stopped: started session aylmer-ct again (CPU high-mem), Node v26.12.1 in /content/node, /content/base cloned from public main at 4fb0dfa (tree b310d84), ct.py BASE_TREE updated to it.
- smoke_levels.mjs (new, 218 checks): every story mission (the ten, both ids of step 9, the finale) gets a numbered start eyebrow and a start banner with its title and first objective, in FR and EN; every one ends on a card with « MISSION n SUR 10 TERMINÉE » and the right next mission played in order; side jobs, courses, a challenge and a score mode never read as a mission; main.js wiring pinned (card eyebrow, banner on both card-less starts, lines wait, Enter, closeMission drop, FINI only without a card, unlocks and day on the card, sink around endOfJob, summer-over fallback); no dashes.
- Named run on 1898bb7: smoke_levels, smoke_missionclose, smoke_sp_sauna, smoke_first15, smoke_opening, smoke_modes, smoke_replay, smoke_no_dashes, smoke_lang, smoke_summer, smoke_canon, smoke_ui: GREEN.

- Full suite on 218f219 (489 s): 124/126, only smoke_audio and smoke_models failed (known VM-only): `ct: RESULT GREEN`. The lead reruns those on the Mac at merge.

## Where I stopped
Done. Nothing in flight. VM stopped with `ct.py stop`. Not merged, not pushed.

## Cloud checks for the lead (browser)
1. New game, fresh profile: at control, the banner « MISSION 1 SUR 10 : L'ALTERNATEUR » with the objective under it for about 3 s, then Margaret's first line; Tom's name card bottom left at the same time is fine. Enter during the banner clears it and Margaret starts at once. `opening.stats.cardsAfter` still 0.
2. Balade libre with no job done: « Été 2004 » card, Embarquer, then the same banner (no second card).
3. Finish L'alternateur: one card « MISSION 1 SUR 10 TERMINÉE », its task ending with the new day and « Prochaine mission : Réveiller Sayyad ... »; after Continuer, no FINI or day toast comes up; Margaret's door line and end lines play.
4. Finish Sayyad: card lists the Civic loan line; after it, Sayyad's name card and end lines, no toasts.
5. Take Dr Morin's box: eyebrow « JOB À CÔTÉ » on the brief, « JOB TERMINÉE » at the end, next line still names the next story mission.
6. M, a Blitz: brief eyebrow « COURSE LIBRE · HORS HISTOIRE », finish on the FINI toast, R reruns with no card and no banner. M, Balade: « BALADE · HORS HISTOIRE ».
7. English: « MISSION 1 OF 10 : L'ALTERNATEUR », « MISSION 2 OF 10 COMPLETE », « Next mission: ».
8. hud-overlap: the banner is the toast slot, so the existing B-06 boxes cover it; the longer end-card task (up to about 8 lines on a job that lends a car) should still fit at 800x500.

## For Tom
- Wording: « MISSION 3 SUR 10 » and « JOB À CÔTÉ ». The game says « job » for everything elsewhere (« Commencer la job »); « mission » is used here only for the ten, to set them apart. If Tom prefers « HISTOIRE 3/10 » or « JOB 3 SUR 10 », it is one function (missionframe.js startEyebrow / endEyebrow) and the smoke.
- The new day now reads on the end card instead of as a toast after it. If Tom liked the day landing on its own once he is back on the road, it can be put back for the day only.
