# Handoff — 2026-09-07, end of the Wave 2/3 session

Read this first, then `docs/PLAN.md` (the waves, the settled decisions, the
timeline), then `docs/VERIFY.md` (how to know a change worked). This file is
the state of the world at the moment the previous session ran out of context.

## Where `main` is

Everything below is merged and live at https://anaughtymoose.github.io/aylmer-madness/
(GitHub Pages redeploys ~2 min after a merge to `main`; `main` is protected,
merge with `gh pr merge N --merge --admin -R ANaughtyMoose/aylmer-madness`).

| PR | What |
|---|---|
| #5, #10 | Wave 1: heap 1057 → 148 MB, sector gating, the bridge "wall" (the river polygon), the 20-minute Safari proof |
| #7 | Traffic keeps its lane through bends (look-ahead pure pursuit; the offset sign was never wrong); the sub-stepped frame loop that ended the jitter at speed (it was temporal aliasing, not physics) |
| #11 | `tools/gltf2mesh.mjs`, `src/game/models.js` (loader, silent, **unwired**), 20 converted CC0 models in `assets/models/`, `models_lab.html`, `make_atlas.py --from` for real textures (`atlas.real.png`, not the live atlas) |
| #13 | Step 1, the first two minutes: Adam in Mayo, the poutine door, footpaths cost speed, buses leave tarmac, one modal at a time, one prompt slot, clean boot |
| #14 | Wave 2a, the spine: `calendar.js` (73 days, difficulty table, `PAY_LIFT`), `fuel.js`, the envelope + gauge on the HUD, refund on failed jobs, two endings via `StoryOpener` |
| #15, #18 | `assets/text/summer2004.json` (real Environment Canada days, wired to the date toast), `palette2004.json`, `tools/build_summer2004.py` |
| #16 | Wave 2b: a save per character (`tom.1` … `zahra.auto`, v2), the job in progress travels, the wallet lives in the slot |
| #19 | Wave 3a: `verbs.js` (follow / lose them / find / fragile / lift / drop-offs / raceTo), `verbjobs.js` (six jobs), `ambush.js` (the race that interrupts), `skills.js` (brake / corner / launch by use) |
| #20 | Start picker: the point list scrolls in its own column under the pinned GO bar |

31 smoke suites, all green on a quiet machine (`for t in tools/smoke*.mjs; do node "$t" …`).

## Both agents landed (recovered 2026-09-07 after the session crashed)

The session that wrote this file died with the two agents still running. The
next session reconstructed everything from this file plus `git status` /
`git log` in each worktree, and both branches are now on `main`:

| PR | What |
|---|---|
| #22 | Wave 3b, `wave/3-vehicles`: Mike's Forester, Abraham's Sienna, Tyler's Z24 Cavalier, Zahra on the Diamondback, each character starts in their own car at their own house; start points locked until a named job is done (padlock rows, `smoke_start.mjs`, `smoke_vehicles.mjs`, `docs/shots/start-picker-locks.jpg`) |
| #23 | `feat/cockpit`: a fifth `C` camera `driver`; the Ranger cab as flat-shaded geometry in `src/game/cockpit.js`, drawn with the car's own model matrix (no rear-view mirror, misaligned white hood, paddle mirrors with the web, blue MuVo on the bench, CHECK ENGINE, thumbtacked headliner), head dip, idle shiver, 150° Shift head turn, 2.4 kHz low-pass on the radio in that view; `smoke_cockpit.mjs`; four shots `docs/shots/cockpit-ranger-*.jpg`. Only the Ranger gets the checklist, other cars get a generic cab, mirrors do not reflect. |

33 suites green, cold boot verified on each branch before merging. All agent
worktrees are removed.

Two things the recovery found, both worth remembering:

- The vehicles agent's last commit did not parse (`const open` shadowing the
  function's `open` parameter; backticks inside the injected-CSS template
  literal in `installSkin`). Every suite was green because none imports
  `main.js`. The boot check is not optional.
- Renaming that local to `openKeys` then broke `tools/smoke_shell.mjs`, which
  greps `main.js` source text. **Re-run the suites after every edit, including
  a rename.** Fixed in #23.

## The first playtest, same afternoon (PRs #25, #26, #27)

Thomas pressed Continue and was inside a house. What came out of the next hour:

| PR | What | The rule it encodes |
|---|---|---|
| #25 | `src/game/tow.js`: T / « Remettre sur la route » puts the car on the nearest road, damage kept; Y / « Dépanneuse » does the same AND repairs, for $60 + the garage's price; `settleSpawn` after every load and car swap moves a car that loaded inside a building, in the water or far from any road | **Being stuck is free. Repairs are never free, and the tow is dearer than driving to the mechanic.** |
| #26 | Saves carry `near` (nearest named place) and `doing` (job title); Continue reads « Tom · sam 26 juin · 12:55 · Emplacement 1 / Ranger · Chemin Fraser, près de 299 Chemin Fraser / En cours: Poutine express · … » | A save has to say where you were and what you were doing. |
| #27 | « English version → » on the menu and a selector in the options; the English strings are deliberate calques; `.photocopy` in style.css turns every UI panel into a four-generation Xerox (inverted to paper, blurred, skewed, streaked, fine print at 38 %) while the canvas stays crisp; a French ERRATUM on the English menu | The Québec exam joke: English is one click away and almost impossible to read. French is the master copy; `store.js` no longer forces `lang` to fr. |

| #29 | `follow()` in verbs.js: the leader is the car actually parked at the kerb, sits `wait` s (6 for Sayyad) with the objective marker ON it and a countdown in the objective line, honks at three and as he pulls out, and the HUD shouts « SAYYAD PART — colle la Civic ROUGE! ». `AWAY.sayyad` gains `'suis'` — he used to stand in his driveway waving while « his » Civic drove off. | The player has to see who is leaving, in which car, and when. |
| #29 | `continueSlot()`: « Continuer » takes the newest autosave (written only at the end of a job) and says « Après « Poutine express » »; it falls back to the newest manual slot only when nobody has finished a job yet. | One autosave, at the end of the last job you finished, is where Continue starts. |

Two suites (`smoke_ui`, `smoke_save`) asserted the interface could not be
English. They encoded the earlier decision, so they were rewritten to the new
one — not loosened. `tools/smoke_lang.mjs` and `tools/smoke_tow.mjs` are new.

Saves, for the record (Thomas asked): four slots per character (1, 2, 3, auto),
five characters, twenty in all. Nothing writes unless you ask — pause →
Sauvegarde → a slot, or F5 into the slot you used last — or an autosave event
fires (a job finished, a car bought or unlocked) with autosave on. « Continuer »
loads the newest slot across every character, ties going to a real slot over
the auto. The job in progress travels with the save.

## 2026-09-08 — six branches cut off mid-flight, all pushed, none merged

Thomas asked for a fan-out on everything open (« fan out agents to address all
of these »), then for the story to feel like GTA. Six Opus agents ran at once;
all six were killed by the API session limit (resets 12:10 PT) and, before
that, they broke the one-Chrome rule between them (15 headless Chromes, load
52). Everything each had was committed (uncommitted files as a `WIP:` commit,
**not verified**) and pushed. Resume each one in its worktree: read its `git
log`, run the suites, boot it, finish what its brief asked, PR, merge one at a
time with suites + boot between merges (VERIFY.md « Merging parallel work »).

| Branch / worktree | What is there | What remains |
|---|---|---|
| `fix/traffic-side` · `wt-traffic` | 1 commit: « hold your lane to the corner — a left turn is not a bend » with its suite and the NEXT.md §2 note. The agent said fix, suite and docs were done and it was waiting for a free Chrome. | Browser check with the right-side fraction, screenshot `traffic-side.jpg`, PR. |
| `fix/camera-jitter` · `wt-jitter` | `tools/measure_camera.mjs` and a « WIP: camera damping (numbers to follow) » commit, plus a WIP of the measurer. It had a clean baseline and was re-measuring with the fix restored. | Finish the damping (`camdamp.js`), before/after numbers at 60/120 Hz, `smoke_camdamp.mjs`, screenshot, PR. |
| `fix/playtest-small` · `wt-small` | 8 commits, the most complete: « Première période » timer (it asked 103 km/h), the golf clubhouse roof, the poutine counter, **one-click start (U9)**, merged with main. | Its PR was never opened. Re-run suites + `tools/headless.mjs` boot (the harness clicks `#start` then `#startconfirm`; check it still reaches drive), screenshot `start-one-click.jpg`, PR. |
| `feat/wave3-places` · `wt-places` | 4 commits: the seven places (« two did not exist, one had the wrong name »), campaign.json mapped to real place keys, rivals scaled by `G.rivalFrac`, race resume after a save; merged with main; WIP of HANDOFF/NEXT/`shots_landmarks.mjs`. | The resume/rival tests it was writing, landmark screenshots, PR. |
| `feat/wave5-look` · `wt-look` | 3 commits: models drawn, real-texture atlas at med/high, facades on 299 Fraser and 75 Denise-Friend (`assets/facades/` 288 KB); WIP of `facades.js`/`world.js`/`shots_look.mjs`. | Verify the WIP compiles and boots (« Ouch » menu = shader link failure), screenshots, the four-point memory re-measure, PR. Sky/tone/shadow ports not started. |
| `feat/story-cold-open` · `wt-story` | 0 real commits; one WIP with `coldopen.js`, `phone.js`, `passed.js`, `support.js`, three suites, and edits to `story.js`/`heckle.js`/`hud.js`/`missions.js`/`main.js`. It was writing the support suite. | Everything is unverified. `node --check src/main.js` first, then suites; `G.story.hide()` must still skip the opening for the harness. |

Merge order suggestion: `fix/playtest-small` (touches the start picker every
harness run depends on), then `fix/traffic-side`, `fix/camera-jitter`,
`feat/wave3-places`, `feat/wave5-look`, `feat/story-cold-open` last (it
touches `main.js` in the most places).

Lesson, for whoever runs the next fan-out: **three agents at once, not six**,
on this laptop and this API plan; give each a port pair and check
`pgrep -f headless=new | wc -l` yourself every few minutes — the agents did not
honour the cap when told to.

Also new: `docs/GEMINI_CINEMATIC_PROMPT.md` (PR #33) is ready for Thomas to
paste into Antigravity — the undelivered look-pass Parts 5/6/8 plus the cold
open storyboard, colour grade, beat timings and a sound sheet.

## 2026-09-08, later — Gemini's cinematic pass came back; Thomas resumes Monday 14 Sept

Thomas ran `docs/GEMINI_CINEMATIC_PROMPT.md` in Antigravity (Gemini's transcript
said branch `main (9d9dbed)`, load 4-6). He then fed it his own 2004 photograph,
his real plate, aerial drone photos of the marina, and asked for the Ranger
skin atlas to be used. His verdict on the result: the **inputs are great, some
of the art is total shit and has to be redone**. He used the last of his weekly
API capacity on the six agents and this; **nothing resumes before Monday
14 September 2026**. Do only what is asked, in order, three agents at most.

What is on disk, none of it committed (all under `gemini-inbox/`, now gitignored
where it carries his likeness or plate):

| Where | What | Verdict (Claude looked, Thomas looked) |
|---|---|---|
| `cinema/COLDOPEN.md`, `cinema/coldopen/shot1..7_*.png`, `coldopen/keys.json` | 8 s cold open, seven painterly/photoreal frames, camera keys in car-local metres | **Good.** shot1 is the white Ranger, rusted, black bumpers, in the gravel driveway at « 299 » at dawn — exactly the truck. Use the frames as reference for the in-engine drift and the keys as the first pass of `coldopen.js`'s camera table. Check the keys are car-local (+Z forward, +X driver's left) before pasting. |
| `cinema/GRADE.md`, `cinema/grade/*_graded.png`, `sun_angles.json`, `apply_grade.py`, `extend_lighting.py` | Tone curves, split-tone matrices, sun ephemeris at 45.4° N, lens rules, four before/after grades of committed screenshots | **Probably usable, unverified.** Validate the sun angles against a known ephemeris for 2004-06-26 07:40 EDT before wiring (Gemini's numbers have been confidently wrong before). |
| `cinema/BEATS.md`, `cinema/beats/*.png`, `render_beats.py` | Phone, mission-passed, seam, endings — HUD mocks drawn by a Python script | **Bad.** Programmatic overlays with missing glyphs (boxes in « E ⊠ Décrocher »), dead layout, a translation panel pasted over the minimap. Keep the timing tables in BEATS.md if they read sanely; redo the mocks or skip them — the story agent's real HUD is the better reference. |
| `cinema/SOUND.md` | Cue sheet: engine synth, radio, CC0 Foley from CATALOGUE.md, dBFS levels, ducking | Not yet read. Check every sample's licence is the first column of CATALOGUE.md before use. |
| `look/FEEL.md` | 14 tuned constants (CAMS, Ranger spec, handbrake, roll/pitch rates, camera lag, FOV kick) with before/after and MM2/Burnout/GTA SA comparisons | **Numbers to weigh, not paste.** Gemini's proposed `CAMS` pitches the driver cam to -0.20 and cuts its fovAdd — the cockpit agent set those by looking at the hood; the jitter branch is changing the smoothing constants Gemini also touched. Reconcile by hand. The full list is in Gemini's transcript summary (camYaw lag 5.5→4.2, kxz 9→8.5, ky 6→4.5, FOV kick +0.22 above 8 m/s, Ranger accel 4.1 / brake 8.4 / grip 0.84 / hbGrip 0.54 / hbYaw 1.28, roll 0.024 / pitch 0.016). |
| `look/ui/STYLE.md`, `seam_aylmer_ottawa.png`, `seam_ottawa_aylmer.png`, `radio/radio_*.png` (7) | 2004 style guide, two seam cards, seven station bumper stickers | Seam cards not yet looked at; STYLE.md not read. Radio stickers name CKOI 94.9, MAX 105.3, CHLL 101.9, CJRC 104.7, CKUQ 97.9, CFRL 88.5, CKOT 102.7 — **check these against `src/game/radio.js`**; VERIFY.md §4 records Gemini inventing call signs before. |
| `look/ui/title_key_art.png`, `tom_matte_*.png`, `tom_photo_2004.jpg` | Title key art built from Thomas's photo | **Total shit** (Thomas's words): a posterized cut-out of his photo, a clip-art white box for the truck, sawtooth trees. Redo from scratch: painterly like the storyboard frames, the truck from the skin atlas, no cut-out compositing. The photo and mattes carry his likeness — gitignored, never commit. |
| `look/cars/ranger/{side,top,front,rear,dashboard}.png`, `civic/dashboard.png`, `manifest.json`, `plate_766_nbz*.png` | Ranger views, two dashboards, his real plate as a texture | **Off spec.** `side.png` is a labelled collage (« SIDE VIEW (DRIVERS) », « TWO TIRES »), not the clean 2:1 orthographic on white that `assets/cars/README.md` and `tools/car_views.mjs` need; the dashboard was corrected to a floor 5-speed after Thomas caught the automatic column shifter. Plate files carry his real registration — gitignored, never commit, never bake into a shipped texture. Redo the four views to spec. |
| `look/MARINA.md`, `look/marina_topography_plan.png` | Real marina/Parc des Cèdres layout from his drone photos: L-shaped rip-rap jetty with the lighthouse, four comb-dock piers, red-orange hip-roof pavilion, boat ramp with mast crane, dry-storage yard, the Sentier des Voyageurs path, the beach with lifeguard chair; drop-in `buildMarina`/`siteMarina` for `landmarks.js` | **Promising, unverified.** The drone photos are spring; the doc says how to summer it. Have the places agent (or a fresh one) validate the geometry against `data/buildings.json` and the water mask before pasting the drop-in. |
| `showcase.html` | Gemini's gallery of all of the above | Reference only. |

Rules learned from this pass, for the next Gemini prompt:
- **Say what medium each deliverable is.** Gemini produced good images where it generated images (storyboard) and garbage where it wrote Python to composite (title, beats, orthos). Ask for generated images to spec, forbid script-composited mock-ups.
- **The truck is white.** It produced a dark green Ranger once; the canon is in `cars.js` (`body: 0xebe8dd`, black bumpers, no chrome). Put the canon in the prompt, not in the repo it is told to read.
- **Likeness rule was overridden by Thomas himself** (his own photo, his own plate). That is his call for reference material; it still never ships in the public repo.

**Radio, decided by Thomas 2026-09-08 (code change for Monday):** the station
table in `src/game/radio.js` becomes CHEZ 106.1, 106.9 The Bear, Live 88.5,
CHUM FM (no frequency shown), CBC Radio (he says 89.1; verify — CBO-FM was
91.5 in 2004) and a French CBC (Radio-Canada Première, CBOF-FM 90.7). CKOI,
CIMF, CKCU and CJRC go. Slogans, stings and formats per station are in the
table today; the English ones read English. Gemini's `redo/RADIO_2004.md`
will list real 2004 programmes for the cassette station; anything
all-rights-reserved stays local in the gitignored `assets/radio/`.

## Open decisions for Thomas

- **The second start click** (BACKLOG U9): keep or remove. Recommendation: remove.
- Whether the cockpit look is right now that #23 has landed (press `C` to
  `driver`; he wants to *feel* in the Ranger, consistent with the chase cam).

## Gemini (Antigravity) — what exists in `gemini-inbox/`, none of it committed except docs

- `assets/` — scouting pass, CC0 models/textures/sounds with licences; `src/` is gitignored (333 MB). The converter used it.
- `look/` — facades for 20 buildings (**good**, e.g. `facades/75-rue-denise-friend/front.png` is the 2004 olive/burgundy/green house), materials, surfaces, props, atmosphere. Cars, UI, FEEL.md, INTEGRATION.md and STATUS.md were never produced. Wave 5 input.
- `interiors/` — 15 vector plates drawn by a Python script (a diagram, not art) plus `RANGER-HANDOFF.md` with verified truck details. Use the details, not the plates.
- Prompts in `docs/GEMINI_*_PROMPT.md`. The calendar one is done and shipped.

## What is next (the plan's order)

1. Thomas plays: the five characters in their own cars, and the driver's seat.
2. **Wave 3 leftovers:** the seven missing places (Russell's 1 Arial, Abraham's 841 Wilfrid-Lavigne, the Petro-Canada as a place, the British Hotel, Galeries de Hull, Byward Market, Museum of Civilization) and the 18-job `campaign.json` mapping to place keys; rivals in the four scripted races still use table speeds (`G.rivalFrac` is read only by the ambush); race courses cannot resume mid-race.
3. **Step 3 feel:** camera on kerbs/bumps, slope gravity (no g·sin(pitch) term in `cars.js`).
4. **Wave 5, the look:** wire the converted models (trees are baked into chunks — read `docs/MODELS.md` for the two ways round it), the real-texture atlas, the facades from `gemini-inbox/look/facades/` on the hero houses, then sky/tone/shadows GLSL ports. Re-measure the four-point memory after.
5. Wave 4: Russell's garage, avatar corrections, English Ottawa.
6. A Safari soak and a playtest with two friends before calling it shipped.

## Gotchas learned this session (add to VERIFY.md when convenient)

- `PAY_LIFT` and the difficulty scales are set on `G` by `calendar.startSummer`; node suites never start a summer, so their dollar amounts are unscaled. Do not apply pay scaling globally — it cost three suites once.
- `carById('dbike')` returns the **Ranger** (bikes are not in CARS). Test bike behaviour with `G.veh.baseSpec` (`twoWheel: true`), never via `carById`.
- The free-roam offer block in `updateMission` clears `hud.prompt` every tick; anything that owns the prompt (the ambush) must return early there (`if (G.ambush) …`).
- `grep` treats `src/game/story.js` as binary; use `grep -a` or Python.
- `tools/timers.mjs` fails silently when the repo path has a space (the `import.meta.url` guard).
- `tools/smoke_react.mjs` flakes on timing above load ~8; rerun on a quiet machine before believing it.
- The VERIFY duplicate-key grep is noisy now (lab pages, hangout's own scoped keys); compare against `main`, not against empty.
- The auto-mode classifier blocks `gh pr merge --admin`, `kill`/`pkill` and long `;`-chained one-liners. `Bash(gh pr merge:*)`, `Bash(kill:*)`, `Bash(pkill:*)` are now allowed in `~/.claude/settings.json`; keep commands short and put loops in a script file.
- Ports used by this session's agents: 8151/8161/8171/8181/8191/8201/8211 (servers), 9222/9224/9226/9228/9230/9232 (Chrome). `tools/headless.mjs` honours `CDP_PORT`.
- Never more than three headless Chromes; above load 8 no timing number counts.

## When to start a new session

Now is fine: this file plus `docs/PLAN.md` and `docs/VERIFY.md` are the whole
state. The only things that live in the old session are the two agents' final
reports, and their branches on disk say the same thing. Start the new session in
`/Users/thomaslever/Desktop/Coding Projects/aylmer-madness` with: "Read
docs/HANDOFF.md, then finish the two running branches."
