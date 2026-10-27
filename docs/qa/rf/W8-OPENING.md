# W8-OPENING: the rest of B-11's W-list and the [opening-v2] marker

Branch rf/w8-opening, worktree wt-rf-w8-opening, from fix/look-on-qr c2928ca (wave 8, 27 Oct). W2, W3, W4, W6 and W10 were already in (W6-OPENING.md). This pass adds W1, W5, W7, W7b, W8, W9 and the W11 marker, so smoke_opening's check 9 is hard.

## What changed (src/main.js, plus one method in src/game/intro/opening.js)
- W1 hooks on `new Opening({...})`:
  - `markCastSeen: (id) => ...` only mirrors ids into `G.castSeen` (a Set, for the console and QA beats). The cards persist on their own in store key `aylmer.castseen`; a `castSeen` setting would be stripped by normalizeSettings, so nothing is written to settings (B-11 contract note).
  - `radioUp: (at, secs) => openingRadioUp(at, secs)`: at the starter crank (the film's `radio` cue, on the score's audio clock) the radio powers on if `radioAuto` allows, resumes, and the radio bus ramps from silence at `at` to `audio.vol.radio` over `secs` (3 s). It does nothing on a replay. openingDone keeps its old 4 s ramp only when the film never reached the crank (`opening.stats.radioUpAt == null`: skipped early, or the long film), so a skip still gets its radio.
- W5 `newGame()`: `opening.begin({ variant: newGameFilm() })`. `newGameFilm()` is opening.js's `filmFor(G)` (storySeen and the `?intro=` switches), except that a machine with a save is a returning player (the same test as the gate and buildMenu) and gets the quick film, unless `?intro=1`.
- W7 `startMission`: `castThenLines()` queues the job's live name cards (`opening.cast.queueForJob(def.id)`) after the brief card closes (`cinema.show({ ..., onDone })`), or at once when `card: false`; the friend's start lines wait for the cards (`opening.cast.onIdle(() => sayFriend(def, 'start'))`). It does nothing if the job is no longer the running one. Before, `sayFriend(def, 'start')` was called while the brief was up and heckle played the lines on close; with no card due the lines still start the moment the brief closes, so nothing changes for a job with no card.
- W7b job end: `opening.cast.queueForJob(def.id, 'end')`, and the end lines wait on it when a card is due (Sayyad's `sayyad@end`). The « JOB TERMINÉE » card blocks the live card, so the order is: end card closes, name card, end lines.
- W8 mission timer: `if (!opening.cast.active) m.timeLeft -= dt;` (one boolean read per step).
- W9 `pause(true)` and `toMenu()` call `opening.cast.interrupt()`.
- closeMission calls the new `opening.cast.dropIdle()`: start lines still waiting on a card for a job that was quit or failed are dropped with it (heckle already cancels the job's queued lines there).
- W11 marker `// [opening-v2]` next to the W2 gate block.

## STORY_CARDS (« LES COMMANDES », « PREMIÈRE JOB »)
Checked: they are not shown on a new game, or anywhere. `StoryOpener` is constructed at main.js:283 (`const story = new StoryOpener()`) but `story.show()` has not been called since commit 5aa9c8d; main.js only calls `story.hide()` and reads `story.active`. The canon report read the constructor as a show. Nothing to fold into the opening. The text is dead but still pinned by smoke_story (card count 3 to 5, the opener's paging), smoke_canon and smoke_lang, so I left it. Lead option: retire STORY_CARDS and StoryOpener with those three tests in one small pass.

A real "two cards in a row" remains on the **Balade libre** path when the alternateur is not done: `playStory()` (« Été 2004 », waits for Enter) then the alternateur brief card (waits for Enter). B-11's design leaves that path out of scope (section 3 table, "unchanged"), so it is not changed here. A one-line fix if the lead wants it: in playStory's onDone, `startMission(alternateur, { card: false })`, since the « Été 2004 » card already names the alternateur as the first step.

## Checks (Colab VM via ct.py, nothing run on the Mac)
- smoke_opening on 0367fc6: 280 passed, 0 failed (269 before + the 11 check-9 items now hard), GREEN. The V2 start-flow regex (newGame with `variant`) passes.
- smoke_missionclose, smoke_homeparking, smoke_firstminute, smoke_story, smoke_no_dashes on 0367fc6: all passed, GREEN.
- Two ct.py attempts failed before starting (patch sha mismatch, connection reset on upload); VM transport only, retried.
- Full suite on 63eed08 (ct.py, 589 s): 115/118. smoke_audio and smoke_models are the known VM-only failures. smoke_medals failed 1 of 112 checks; this branch does not touch medals.js, timers_pace.json or anything smoke_medals imports (it is pure math on src/game/medals.js), so the one failure is almost certainly its wall-clock check (2000 judgements under 5 ms) on a loaded VM. A rerun of smoke_medals alone could not start: the VM upload failed three times (patch sha mismatch, read timeout). Lead: rerun smoke_medals (VM or Mac) before merging.

## Per-frame cost
W8 is one boolean read per fixed step. Everything else runs once per event. No allocation per frame, no new pass.

## Cloud checks for the lead
1. Fresh profile, index and prototype: gate, one key, film; `opening.stats.controlAt` and harness `newGameToControlSecs` <= 40 s on the Air (bar 1); `cardsAfter` 0; `opening.stats.cards` = [ranger, margaret, dad, tom]; 0 console errors.
2. Radio: `opening.stats.radioUpAt` is set at the crank, the radio is audible from the crank (not 4 s after control), with no jump to full volume at control. Skip with Esc before the crank: radio still ramps in at control.
3. Second launch with a save: Continuer focused, Enter, wheel in under 15 s from page load. New Game on a machine with a save (storySeen unset) plays the quick film (`opening.stats.variant` = 'quick'), controlAt - worldReadyAt <= 4.0 s.
4. Campaign run (design check 13): `opening.cast.log` has each of the 10 ids once at the job and phase section 5b names (e.g. `{ id: 'sayyad', job: 'sayyad', phase: 'end' }`); during each card `G.mission.timeLeft` moves by 0 +/- 0.05 s; the friend's start lines begin after the card, not under it.
5. Pause (Esc) and Quit to menu while a live card is up: the card goes at once; under 1.5 s up it comes back after resume.
6. Quit a job while its card is up: none of that job's start lines play afterwards.
7. hud-overlap with `#castcard` in the boxes (B-06 contract note), if not already added.

## For the lead
- STORY_CARDS dead code and the Balade libre double card: two optional follow-ups above.
- B-11's open flags still stand (Zahra's kicker « LA PETITE SŒUR », FRIEND_LINES in French next to English cards).
