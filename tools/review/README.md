# tools/review: the review panel's play harness

Plays the real game headless and writes an evidence pack for the panel in `docs/review-panel/` (`PANEL.md` is who scores, `METHOD.md` is how).

```
node tools/review/harness.mjs --plan quick --rev HEAD
```

Node 22 or later (global `WebSocket`, `fetch`), Python 3, Google Chrome in `/Applications`. No npm packages.

## What it starts, and closes

- The game's own `node tools/serve.mjs` on `127.0.0.1:<port>`, default 8183, allowed 8180-8299, with `--audio-dir` for the private radio. It never uses python `http.server`, `serve.sh`, 8141, 8162 or 8170.
- Its own Chrome: `--headless=new --remote-debugging-port=<cdp-port>` (default 9480), a throwaway profile in the system temp dir, audio muted, Metal GPU. Tom's Chrome and profile are never touched, and nothing appears on screen (unless `--headed`).
- With `--rev`, a `git archive` export of that commit in the temp dir.

If `tools/serve.mjs` exits or does not answer within 15 s, the run stops before Chrome starts: exit 1, the server's stderr on the terminal and in `SERVER-FAILED.txt` (its stderr also goes to the pack's `console.log` on every run). Paths handed to it are made absolute first. A beat that throws sets exit 1; a failed first boot stops the plan, and SUMMARY.md opens with `Run FAILED` (self-test: `node tools/smoke_harness_gate.mjs`, part of `npm test`; `--browser` adds a real-Chrome case).

All of it is closed and deleted when the run ends, fails, or gets Ctrl-C. If either port is busy the run refuses to start. `CMP_SRV_PORT` and `CMP_CDP_PORT` set the defaults, the same variables `tools/qa/boot.mjs` reads.

Storage runs in the `?review=panel` namespace (tools/storage_guard.mjs), emptied at boot, so a player's saves are never read or written.

## Options

| Flag | Default | Meaning |
|---|---|---|
| `--plan <name or path>` | `quick` | `plans/<name>.json`, or a path to your own |
| `--rev <git rev>` | none (working tree) | serve a clean export of that commit; use it while other agents are editing `src/` |
| `--entry <html>` | the plan's, else `index.html` | `prototype.html` for the 2004 prototype build |
| `--only a,b` | all | run only beats whose `do` or `id` matches (boot always runs); course beats match by course id (`--only bz_vieux,cp_ruelles`). An `--only` that matches no beat exits 2 |
| `--list` | off | print the beats the run would play (after `--only`) and exit; nothing starts |
| `--warp <n>` | 1 | extra fixed sim steps per frame; above 1 the fps numbers are not honest |
| `--port <n>` | 8183 | 8180-8299 |
| `--cdp-port <n>` | 9480 | 9400-9599, Chrome's debug port |
| `--cdp-timeout <s>` | 120 | a CDP call with no answer by then fails its beat instead of hanging the run (a page frozen under load) |
| `--columns both\|played\|fresh` | the plan's, else `both` | which result columns to play (see below) |
| `--audio-dir <dir>` | `aylmer-madness-private/radio` | handed to serve.mjs |
| `--size WxH` | 1280x800 | viewport |
| `--out <dir>` | `~/Desktop/Coding Projects/aylmer-madness/references/review/<local time>-<plan>/` | where the pack goes |
| `--headed` | off | show the Chrome window (debugging only; agents never use it) |
| `--vehicle-observe` | off | record wrong-vehicle beats without failing the run (exit code) |
| `--stop-after <min>` | off | start no new beat once the run is that many minutes old; the pack is written with what was played and lists the skipped beats (cloud VMs have a hard deadline) |

Environment for a machine that is not Tom's Mac (a Linux cloud VM): `CMP_CHROME` is the Chrome or Chromium binary (for example `/usr/bin/chromium`), `CMP_CHROME_GL=swiftshader` swaps Metal for software GL (ANGLE on SwiftShader; the pack labels its fps as not honest performance numbers), `CMP_CHROME_NO_SANDBOX=1` adds `--no-sandbox`.

## Plans and beats

A plan is `{ name, about, entry, seed?, vehicle?, beats: [...] }`. Beats:

| `do` | Fields | What it does |
|---|---|---|
| `boot` | | load, menu, real click on EMBARQUE and GO, each opening card shot and closed with a real Enter |
| `firstDrive` | `seconds` | real W held; throttle and move latency; which way A turns |
| `mission` | `id`, `stageTimeout`, `hour`, `seed`, `assist`, `maxSecs`, `maxKmh`, `handPlay` | seed the story up to `id` (or `seed: false` to drive to the giver for real), start it, let the learner bot play it, shoot every card and stage. `handPlay` (true or a reason) skips the bot and records the job as hand-play only |
| `tour` | `places`, `envs`, `weather` | teleport to each place and shoot each time of day x sky (HUD on only at day/clear) |
| `speedRun` | `seconds`, `frames` | floor it down the longest straight near the beach; a 10 fps frame sequence |
| `crash` | `seconds`, `place`, `side`, `steer` | from a place, aim square off the road and floor it; impacts shot, damage before and after |
| `cops` | `heat`, `seconds` | set heat, drive to Principale, read the cops state |
| `radio` | `taps` | real R presses; radio state after each |
| `modes` | | open the M picker, shoot it, list the courses |
| `course` | `id` (a course id, e.g. `bz_vieux`), else `index` or `mode` | start that Blitz or Checkpoint course and race it with the bot; a course beat with no `id` is keyed `course-<mode or index>` |
| `freeRoam` | `places`, `maxKmh` | drive the GPS route between places |
| `script` | `id` (or `file`), anything the script reads | runs `tools/review/beats/<id>.mjs` (see Script beats) |
| `jumps` | `ids`, `seconds` | every ramp in `src/game/jumps.js` (or `ids`) from its run-up point on a fresh truck at full throttle: take-off speed, air against the table's prediction, landing damage |

Shipped plans: `quick` (about 12 min, ends with the sample script beat), `full` (the shared pack, 60-120 min), `ranger-rerun` (the second half again for Ranger evidence: golf night, stvincent onward with the optional jobs and both races, speed, the ramps, two crashes, cops at 2 and 4 stars, both courses, free roam), `campaign` (unseeded summer), and one per persona: `max`, `lex`, `julie`, `jen`, `sean`.

## Vehicle truth (B-02)

Every beat asserts, at its start, that the player is in the job's intended vehicle: the beat's `vehicle` (an id, or `false` for no check), else the plan's `vehicle`, else `ranger`. Missions and courses check each column after the seed; other beats (speed, crash, jumps, cops, free roam, script) check before they run; a boot is never checked. A miss is printed as `harness: wrong vehicle`, the beat still plays (the evidence is kept), its result carries `vehicle: { want, got, ok }` and `harness`, SUMMARY.md lists it under "Vehicle truth" with a FAIL line, `metrics.json` counts it in `headline.wrongVehicleBeats` (as played) and `headline.wrongVehicleFresh`, and the run exits 1 (unless `--vehicle-observe`).

The fresh column is a fresh Ranger: a job that started in the wrong vehicle is always rerun fresh, and the rerun puts the player in the intended vehicle where the truck stands (the game's own `G.swapCar`, as the E prompt does, so its swap toast lands in the transcript). After the rerun the played vehicle and every parked car go back, so the next beat still carries what the played run left. `jumps` uses the same fresh Ranger for every ramp and puts the carried vehicle back at the end.

Each job's `bot.vehicle` (outcomes.json, metrics.json) is every vehicle the bot drove in it, in order (`ranger>cart` when it changed), with `bot.vehicleSecs` the seconds in each.

## Script beats (B-02)

`{ "do": "script", "id": "<name>" }` imports `tools/review/beats/<name>.mjs` and calls its `run(page, assert)`. New beats are new files; harness.mjs is not edited. `page` holds the harness's helpers: `evaluate`, `send`, `state`, `shot`, `sequence`, `sleep`, `say`, `tap` and `key` (real CDP keys), `click`, `runTask` (a page-agent task), `carState`, `setCar`, `seedFor`, `frameStats`, `vehicle`, plus `beat` (the plan entry) and `plan`. `assert(cond, msg)`, `assert.equal(a, b, msg)` and `assert.near(a, b, tol, msg)` record checks without stopping the beat; any failed assert marks the result `ok: false` and fails the run. What `run` returns lands in the beat's result. `beats/sample.mjs` is the template.

## Audio log (B-02)

The pack carries no sound files, so the sound is written down. page-agent.js wraps the game's audio methods on the instance (each still runs exactly as before) and writes one row a second: the vehicle, km/h, the engine (mean rpm main.js asked for that second, its firing pitch in Hz, mean load), the AudioContext state, cab or not, the siren, the radio (off, blocked, or the station name with music or talk) and the cues fired that second (horn, siren, skid and whoosh on their rise; blip, chime, crash, honk, land, misfire, heille, thud, wrench on every call). The radio is named by station only, never a track, title or file. Each beat's rows follow its texts in `transcript.txt` under `### audio <beat>`, and `audio.csv` has them all.

## Dead air

```
node tools/review/gaps.mjs --pack=20261013-002218-full [--over 45] [--all] [--json]
```

The longest gap between on-screen events per job (each transcript section), and the gaps over `--over` seconds (60 by default). Any overlay text is an event except the street name and the date line (`--all` keeps them); audio rows never are. Writes `<pack>/GAPS.md`. On the 13 Oct pack canot's worst gap is 112.8 s, with three over 60 s.

## Two columns and fail causes

Every `mission` and `course` beat reports two columns:

- **As played**: damage and money carry from the beat before, the way a summer would.
- **Fresh car**: the same job at damage 0 (money and story as they were before the played run). It is rerun only when the played start had 1 damage point or more; otherwise the played run is the fresh one too (`sameAsPlayed`). After a rerun the truck, money and done-list go back to what the played run left, so the next beat still carries.

The fresh-car column is the game's own fail rate; the gap between the columns is what the summer carried in. Each result has a `cause` (`tools/review/verdict.mjs`): done, wrecked, clock, caught, lost-race, abandoned, bot-abandon, harness-timeout, hand-play, missing, other. SUMMARY.md tallies both columns by cause; `metrics.json` has them in `headline.asPlayed` and `headline.freshCar`.

## Comparing two packs

```
node tools/review/compare.mjs --a=20261006-025529-full,20261006-034217-full-rest --b=<new pack>
```

A pack is a folder under `references/review/` or a path; a comma list is read as one pack. Prints one table (every job, both columns, better/worse/same) plus the totals, and writes it to `<b>/COMPARE-vs-<a>.md` (or `--out`). It reads `metrics.json` only, so it works on packs that stopped early. A vehicle table follows (B-02): per job, the vehicle in each column and the wrong-vehicle flag; packs from before B-02 show `-` and say no vehicle was recorded. `tools/smoke_review.mjs` tests the causes and the table; `tools/smoke_review_vehicle.mjs` the vehicle table, the gaps, the script beats and the ranger-rerun plan.

## The pack

`SUMMARY.md`, `metrics.json` (build, per-beat results, `headline`), `outcomes.json` (per mission), `shots/` + `shots.json`, `shots/*-seq-*/` frame sequences, `traces/*.csv` (position, speed, damage, stage, distance to target and the bot's state every 2 s), `transcript.txt` (every overlay text the player saw, then each beat's audio log), `audio.csv` (the audio log, one row a second), `console.log`.

## The bot

`page-agent.js` is injected into the page. It drives the game's own GPS route (`G.nav.route`) with WASD as `KeyboardEvent`s on `window`, slows for corners and traffic, reverses when stuck, re-plans after 12 s without progress, stops in a target and taps E. A lost bot is teleported near the target after `stageTimeout` seconds or four failed re-plans, and that is logged as an **assist** with the stage and time. After 3.2 x `stageTimeout` in one stage it abandons the job (logged). Read the trace before blaming the game for an assist.

It looks 70 m ahead on the route: the sharpest turn there sets the speed it brakes to (30 km/h for over 60 degrees, 42 over 35, 58 over 17), so it cruises at up to 72 km/h in missions on straights (a stage's own speed limit wins). On a corner over 60 degrees taken above 24 km/h it pulls the handbrake (Space) for 0.35 s; the count is in each result's `bot.handbrakes`.

Known limits: it does not take shortcuts and cannot read set-piece mini-games beyond "press E" (the finale is `handPlay` in the shipped plans).
