# Aylmer compare and the visual-wave QA tools

Reference photo next to the game seen from the same spot, with feedback that exports for Claude; and, for the visual wave, the one-command-per-step QA loop (PLAN section 5).

Run everything with `node` from the repo root. Each tool starts its own static server (`node tools/serve.mjs`, never `python -m http.server`: that drops connections under this game's parallel module loads) and its own headless Chrome with a throwaway profile, pops no window, and closes both on exit, even on Ctrl-C or a crash. Ports come from the environment so agents can run side by side: `CMP_SRV_PORT` (default 8193) and `CMP_CDP_PORT` (default 9493); the visual-wave task table gives each task its own pair. References live in the main checkout (gitignored): `CMP_REF_ROOT`, default `../aylmer-madness`.

The machine is shared and is often loaded (load average 50+ seen). Boots take a minute or more then; every wait in the tools is generous. Nothing here is a timing source except `perf.mjs`.

## The loop, one line per step

```
node tools/qa/vis-check.mjs --task=V1-01 --tag=before            # capture the task's pose sets and environments, flag OFF
node tools/qa/vis-check.mjs --task=V1-01 --tag=after --full      # capture, then look-diff, smoke_world, perf, owned-files
node tools/qa/look-diff.mjs --task=V1-01 --a=before --b=after --scope=chase_lucerne_golden
node tools/aylmer-compare/capture.mjs --poses=core,chase --env=noon,golden,night --tag=t --look=-flag --out=dir
node tools/qa/perf.mjs --poses=perf8 --env=noon,night,rain --tier=low,med,high
node tools/qa/boot.mjs
node tools/qa/owned-files.mjs --task=V1-01 [--base=<ref>]
node tools/aylmer-compare/build_index.mjs --task=V1-01 --runs=before,after
```

Output goes to `references/places/_feedback/visual-wave/<task>/` in `CMP_REF_ROOT` (`_adhoc` without `--task`): `<tag>/<pose>__<env>.png` with a `.json` sidecar and a `manifest.json` per run, and `look-diff/<a>-vs-<b>/` for the diffs. Perf runs go to `docs/qa/perf/<stamp>.json`.

## Poses, sets and environments: `poses.json`

- 8 Street View eye poses (2.5 m eye, the reference heading and fov, no car): `fraser_front`, `mike_lawn`, `denise_friend`, `arial`, `principale_british`, `principale_strip`, `galeries_lot`, `marina_quay`. Each carries `x, y, z, yaw, pitch, fov` (`y: null, eye: 2.5` means ground height under x, z plus the eye height, worked out at capture), the reference image `ref` and `crop` (the reference aspect, the shot is cropped to it) and optional tagged `regions` for look-diff.
- 6 game-camera poses (the car drawn, the frame the player sees, full 1280x800): `chase_fraser`, `chase_principale`, `chase_lucerne_golden`, `chase_galeries`, `chase_chemin_aylmer`, `hood_hull_bridge` (camera `hood`). Their `x, z, yaw` are the car's.
- Sets: `core` (the 8 eye poses, noon), `chase` (the 6, noon golden night), `allday` (`fraser_front`, `principale_strip`, `chase_lucerne_golden` at all 9 environments), `perf8` (the 8 perf poses at noon, night, rain and tiers low, med, high). `--poses=` takes sets and single poses mixed; `--env=` overrides the sets' environments.
- Environments: `morning noon haze golden dusk night overcast rain storm`. The game's own clock has four phases (morning, day, dusk, night), so `phase` picks one, `clock` places `golden` inside the day, and `weather` sets the sky; the time is set instantly and re-asserted after the car has settled, so a shot does not depend on how long it took.
- `x` is east, `z` is SOUTH; an eye pose looking at compass heading h has `yaw = -h` (radians), a chase pose has the CAR's yaw, `forward = (sin yaw, cos yaw)`, so heading h is `yaw = PI - h`. Projection and conventions are written at the top of `capture.mjs`.

## What a capture does

`capture.mjs --poses=...` (any `--poses`) boots the real game on SwiftShader (software rendering: deterministic pixels, never for timing), finishes the cold open and every card, hides the HUD, pedestrians and the four real people, freezes ambient traffic, stops the game's own frame loop (every frame is one the tool asks for), and for each pose and environment places the car or the free eye, settles the sim with draws switched off, sets the environment, and screenshots. `--look=X` is passed to the game as `?look=X`. A shot is flagged if the frame is flat, a card or an overlay is up. Exit 1 if anything is flagged or logged as a console error.

The committed build has no `window.AYLMER.devCam` or `hideHud`: `tools/qa/lib/rig.mjs` installs the same thing from outside (on the renderer instance, with no change to the game). If those hooks are ever committed, the old reference mode below uses them and the shim stands aside.

## look-diff

`look-diff.mjs --a=before --b=after` writes, per shot, a contact sheet (before | after | 2009 reference), a pixel-diff mask (red = a channel moved by more than 1/255) and, per run, `thumbs.png` (every after shot at 160x100, the thumbnail test) and `look-diff.json`. It prints clipped-highlight % (any channel at 254 or more), crushed-black %, the mean colour of the pose's tagged regions against `assets/look/palette.json` once V0-05 lands it (lawn, road, wall, sky; plus or minus the entry's tolerance, default 8), and the share of pixels that changed. It fails when: highlights clip over 0.5 % at noon, a region is outside its palette tolerance, a pose outside `--scope` changed by more than 1 % of its pixels, or, with `--identity`, any pixel of any shot moved by more than 1/255 (the identity proof a tooling-only task owes: same poses before and after, SwiftShader).

## perf

`perf.mjs` takes `tools/qa/.perf.lock` (it waits, and takes over a lock whose process is gone), launches Chrome on ANGLE/Metal and refuses to run if the renderer is software. It holds each pose for 600 frames per environment per tier and records p50, p95, p99 of the frame interval (headless has no vsync, so this is the uncapped frame time: 16.7 ms or under means 60 fps is reachable), the GPU time from an `EXT_disjoint_timer_query_webgl2` query around `r.begin..r.end` (also exposed as `r.gpuMs` when the game does not provide one), the CPU time of the same span, their sum, triangles, draw calls, JS heap and GPU buffer MB. The budgets are PLAN section 5: p95 interval 16.7 ms, p95 GPU plus CPU 12 ms (`--gpu-bar=8` on a faster machine), 450k triangles, 400 draws. The machine load is recorded; a loaded machine gives noisy numbers, so rerun when `loadavg` is high.

## boot

`boot.mjs` loads `index.html` and `prototype.html`, presses DRIVE, holds W for 10 s of game time, and passes only with 0 console errors (console.error, uncaught exceptions, failed loads) and at least 10 m moved.

## owned-files

`owned-files.mjs --task=ID` fails if the working tree (staged, unstaged, untracked; with `--base=<ref>` also the commits since) touches a path outside the task's `files` in `docs/visual-wave/tasks.json`. Its report, its status in `tasks.json` and `docs/qa/perf/**` are always allowed.

## Reference mode (the original)

1. Start the server: `./serve.sh`, then open http://localhost:8123/tools/aylmer-compare/index.html (always this address: feedback is kept per address in the browser).
2. New shots: `node tools/aylmer-compare/capture.mjs [--only=slug,slug]` (no `--poses`), then `node tools/aylmer-compare/build_index.mjs`. `capture_lighting.mjs` is the same with `CMP_OUT`, `--files=` and `--envs=day:clear,dusk:clear,...`.
3. Check the page: `node tools/aylmer-compare/selftest.mjs`.
4. Input: `references/places/_manifest/core-refs.json` (verified refs with pose). Output: `references/places/<slug>/game-shots-v3/` (`CMP_SHOTS_DIR` to change) and `references/places/_feedback/compare-index.json`.
5. Feedback: "Save to project" writes `references/places/_feedback/feedback-<stamp>.md` and `.json` and `LATEST.md`; "Copy for Claude" puts the same Markdown on the clipboard.

Reference poses may carry `free: true` (trust the pose point, no road snap), `eye` (eye height, m) and `alt` (an aerial: the eye is `alt` m above the ground, looking down at a point 120 m ahead unless a pitch is recorded).

Boot: new builds play an opening on EMBARQUE and keep the start picker behind "Balade libre"; every tool here takes that door when it exists and the old EMBARQUE flow otherwise.

Camera hooks (dev only): `window.AYLMER.devCam({x,y,z,yaw,pitch,fov})` and `window.AYLMER.hideHud(true)`. Projection and heading convention are documented at the top of capture.mjs. The old Antigravity version is in `_previous/`.
