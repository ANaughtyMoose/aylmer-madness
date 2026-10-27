# W8-FIRST15: the first fifteen minutes (2:35 to 5:00)

Branch rf/w8-first15, worktree /Users/thomaslever/Desktop/Coding Projects/wt-rf-w8-first15, from fix/look-on-qr 81b7c30 (27 Oct 2026).
Sources: references/review/pressure-2026-10-27/PRESSURE.md risk 3; references/review/redteam-2026-10-20/FIRST-15.md (three S fixes).

## What changed

### 1. The way home after the first errand (FIRST-15 dead spot 1)
L'alternateur stays untimed as a job (Tom: a driving lesson; `time: null` on both stages, nothing can fail it). Stage 2 only:
- **Maman's time, a soft record** (src/game/missions.js `MAMAN_T`, `mamanTime`, `homeLeg`). A dim count-up in the clock slot, « 1:12 · Maman 2:10 » (English HUD: « Mom 2:10 »), never red, no flash; past her time it just dims (hud.js `setSoftClock`, style.css `#timer.soft`). 2:10 is the stage's 1,660 m (tools/timers.md) at 46 km/h on average; it scales with the difficulty timer factor like every story clock (easy 3:02, hard 1:57).
- At the door Margaret says one line before the existing end lines (English, main cast, no facts): under her time « 2:01. Faster than I said. Don't make a habit of it. », over it « 3:20. I said straight back, Tom. ».
- The end card's task gets a line: « Retour 2:01 · Maman 2:10 · battue · nouveau record perso · coin glissé ». Your best for the leg is kept in `G.best['alternateur.retour']` (saved with G.best; summer.js ignores non-job keys), so a replay names it.
- The « C'est dans la boîte » card no longer says « Aucun chrono. Prends ton temps. »: it says « Maman chronomètre le retour : 2:10. Aucune pénalité. Le dernier coin : prends-le en dérapage. » So Margaret's « I'm timing you » is now true.
- **Slide zone** (`lastCorner`, `slideZoneTick`, `SLIDE`): the last sharp corner (50 degrees or more, 60 to 900 m from the end) of the live GPS line home. The game calls it once at 90 m (« Dernier coin avant la maison : Espace pour le frein à main, pis prends-le en dérapage. ») and a handbrake slide inside 26 m above 20 km/h gets « BEAU DÉRAPAGE. La boîte, elle, a pas aimé ça. ». It is found on the route, not hard-coded: on the real line home (Nav over MAP, smoke_first15) it lands **63 m from the garnotte ramp, 404 m from the door**, i.e. the turn off chemin d'Aylmer onto Fraser, right after the ramp's west face. No render cost: no decal, no mesh, a toast and a few flops per step.
- The brief (pause list) adds « Au retour, ta mère te chronomètre, pour le fun. »

### 2. A calm HUD at first control (dead spot 2)
- ui.js `hudCalm(G, tutorialDone)`: while true, the folded key legend pill (`#legend.held.collapsed{display:none}`) and the FRÔLÉS / CASSÉS / STYLE counters (reactive.js) are off. It turns false, latched on `G.hudLoud`, at the first near miss, traffic near miss or smash, or when the first-drive tutorial ends, whichever first. A player whose tutorial is already done, or who loads a save with a job done, never sees the calm HUD.
- `?` (the Legend key) still opens the legend: CSS hides only the folded pill, never an open legend. Stage 1's sub still says « ? affiche les commandes ».
- main.js sets it every frame just before the reactive counters paint; `Legend.setHeld` touches the DOM only on a change. No per-frame allocation.
- The new-game toast « AYLMER, QUÉBEC / prends ton temps » is gone (it landed at first control and contradicted « I'm timing you »). A loaded save still gets its « Partie chargée » toast.
- Count at 0:35 after this: objective line (its sub fades after 5 s, B-06), Margaret's bubble, the « S pour reculer » chip, plus two ambient labels that were not in scope: the envelope / date plate top right and the street name bottom left. See the open questions.

### 3. One « next », no sleep before mission 3 (dead spot 3)
- campaign.js `quietStart(G)` (index.html only): no optional job opens before Sayyad is awake. After L'alternateur the only new pillar is his; Dr Morin's box and the yogurt say « Finis d'abord : Réveiller Sayyad ». The OPTIONAL pairing table is unchanged; this only holds the door one step. Not in the prototype (it has hour windows: Sayyad is a night job there, so holding the optional jobs would leave nothing at noon).
- In the first driveway the home pillar offers no « (déjà fait) » replay of L'alternateur, and the « K : Kijiji » hint is not shown at home (K still opens Kijiji; it is on the legend).
- campaign.js `earlyStory(G)`: until the Saint-Jean is done, the free-roam line names the next main mission when it can start (story.js `earlyNext`), even standing on Dr Morin's pillar after Sayyad, and summer.js `sleepHint` shows no « Z : dormir » unless the story really waits on a date. Z itself still works.
- **The easy-mode trap, confirmed and fixed.** Sayyad has no date gate; the Saint-Jean (arcbache) is locked to day 2, 24 June, and stays there (bonfire not moved). Normal: alternateur 0 to 1, Sayyad 1 to 2, open. Hard starts on day 32. Easy spent half days: 0 to 0.5 to 1.0, so the Saint-Jean was date-locked after mission 2 and a new player got « Prochaine histoire : le 24 juin » and a sleep line. Now (calendar.js `dayCost`, `WHOLE_DAYS_UNTIL = 2`) a job costs a whole day on every difficulty before the 24th; easy's half days start on the 24th. Easy's summer is 2 half-days shorter in total, nothing else changes. smoke_spine C3 updated on purpose (it asserted 0.5 after the first job on easy).

### Bar 1
Untouched: nothing in the opening, the film, the skip or the crank changed. The only first-control change is fewer things on screen.

## Checks (all on the Colab VM via ct.py)
- smoke_first15.mjs (new, 85 checks): days and date locks on easy/normal/hard, a story-only easy player plays three missions with no sleep, one pillar after the first errand, the line names the next main through the Saint-Jean, prototype unaffected, hudCalm triggers and latch, CSS never hides an open legend, Maman's soft record (never fails over 200 s, lines, end-card text in FR and EN, best kept, timer scaling), the slide zone (synthetic corners, driveway turn ignored, call once, handbrake slide once, no crash without car or route), the real line home's corner at the Fraser turn, no em or en dashes.
- Named run at ab571ff: smoke_first15, smoke_firstminute, smoke_spine, smoke_summer, smoke_campaign, smoke_econ, smoke_story, smoke_arc, smoke_ui, smoke_shell, smoke_style, smoke_dental: GREEN.
- Full suite run 1 at 236f960: 121/124, smoke_audio and smoke_harness_gate VM-only; smoke_campaign_spare a real fail, on purpose: it spells out the open set as « optional open when its pairing is done ». Updated to the new rule exactly (and Sayyad done), not loosened; named rerun GREEN at 6ef70a3.
- Full suite run 2 at f3dc60b (the final code): GREEN, 121/124 with only the known VM-only fails (smoke_audio, smoke_harness_gate, smoke_models); the lead reruns those on the Mac.

## Cloud checks for the lead (browser)
1. New game, fresh profile (clear localStorage), French: at control the legend pill and the FRÔLÉS / CASSÉS counters are absent; `?` opens the legend and `?` again folds and hides it; the first near miss (or the tutorial finishing) brings both up and they stay. Count the text elements at 0:35.
2. Same on a profile with the tutorial done: the legend pill is there from the first frame.
3. L'alternateur: after the « C'est dans la boîte » card the clock slot shows « 0:00 · Maman 2:10 » counting up, dim, not red; let it pass 2:10 and confirm it only dims and nothing fails. Check it does not overlap the objective (hud-overlap / B-06 beat on stage 2).
4. On the way home, about 90 m before the Fraser corner the « Dernier coin » toast; a Space slide there gets « BEAU DÉRAPAGE »; the box line can come in the same second (both should queue, not overlap).
5. At home: Margaret's timing line, then « That's the whole alternator? » and « just the solenoid »; the end card's task line reads « Retour m:ss · Maman 2:10 ... ».
6. In the driveway after the card: one prompt only (objective « Prochaine job: Réveiller Sayyad »), no « E : La boîte du Dr Morin », no « (déjà fait) », no « K : Kijiji », no « Z : dormir ».
7. Easy difficulty: play L'alternateur and Sayyad; the Saint-Jean is open at once, no « Prochaine histoire » on Sayyad's card, no sleep line.
8. English version: « Mom 2:10 » in the clock, the English card note.
9. 60 fps at medium on the M4 Air on the way home (the soft clock repaints once a second; no new pass).

## Open questions for Tom / the lead
- The envelope (date plate) and the street name are still on screen at first control, which makes it 5 text items if you count those ambient labels, not 3. Holding the envelope until the first job is done would be one more line in `hudCalm`, but the envelope is « the spine, top right, always » (Wave 2a), so I left it. Lead's call.
- Holding Dr Morin's box and the yogurt run until Sayyad departs slightly from the approved pairing (« Margaret's box: home, after the first errand »). Safe default taken; Tom may prefer Dr Morin right after the alternator.
- Maman's 2:10 is a desk number (1,660 m at 46 km/h). If the bot's return leg time from a harness run says a new player is far over or under, retune `MAMAN_T`.

## Not changed, noted
- story.js line 36 (« PREMIÈRE JOB ... Aucun chrono ») is still accurate for stage 1 and the job as a whole; left.
- No recycle-bin moves were made (pause rule from Tom respected; nothing needed recycling).

## Where I stopped
Done. Final code at f3dc60b, this report line committed on top. Nothing left in flight.
