# W8-LIGHT: the s5 lighting behind one option (27 Oct 2026)

Branch rf/w8-light in /Users/thomaslever/Desktop/Coding Projects/wt-rf-w8-light, from fix/look-on-qr c2928ca.
Tom's ruling (27 Oct): put the new lighting in now, as a toggle, default off. He plays with it ON on the
Mac mini (M6) and OFF on the M4 Air, so the choice is per device and never travels in a save.

## What changed

1. `git merge rf/s5-light-cuts` (03772be): clean, no conflicts.
2. One option, « Éclairage avancé (au prochain lancement) » / "Advanced lighting (next launch)", a checkbox
   in Options > Vidéo (src/game/options.js). Saved as `advLight` in `aylmer.settings` (src/game/store.js),
   the per-browser settings key. DEFAULT OFF. Settings are not progress (not in PROGRESS_KEYS) and a save
   slot drops unknown keys (normalizeSave), so a summer saved on the mini never carries the choice to the Air.
3. src/game/look/advlight.js: `advLight()` reads the setting once (first call, at renderer start-up) and caches
   it for the session. Overrides: URL `?light=on|off`; `setAdvLight()` for the sector Worker and smokes.
   Switching is "next launch": the program is compiled once and the world baked once, so a live switch would
   mean a shader recompile and a world rebuild (not cheap). The label says so.
4. Off = fix/look-on-qr exactly:
   - Shader: each chunk s5 changed (common, light, tonemap, fog, sky, glass, water + reflect, wet) keeps
     fix/look-on-qr's source verbatim as CLASSIC_* and s5's as ADV_*; `shaders/index.js assemble()` points
     every chunk at one side (`lightMode`) and picks the matching main(). Off, vs and fs are byte-identical
     to c2928ca (sha256 pinned in the smoke, 27 uniforms); on, byte-identical to rf/s5-light-cuts 03772be
     (51 uniforms). So off has no new per-pixel work, no new uniform, no new pass.
   - CPU: grade.js and glow.js return before touching anything; game/sky.js keeps the puffs and skyOpts sets
     no uniform; the timecycle table is not fetched nor used (envcycle); stepEnv skips the extra-field loops;
     gl.js only decodes uSunSkyLin when the program declares it; gradeLight is today's display grade;
     no vertex AO bake (aobake aoOn), no car body AO, no glow tags on house/shop windows, no lamp lens quad.
   - Look flags: the table is untouched (the option is not a flag), so `AYLMER.look()` reads as today.
   - Worker: sector-client sends `advLight` in the bake message; sector-worker sets it before importing world.js.
5. Not lighting, kept regardless: flags.js `documentElement?.dataset?.` guard (s5); skyOpts reuses one object
   instead of allocating per frame (same three fields as today). The timecycle coverDay no-allocation fix
   (d08fa6e) and the sky Math.hypot fold (8105c88) are inside s5-only code, so they apply whenever that code runs (on).
6. Tools: `tools/qa/perf.mjs --light=on|off` (default off, recorded in params) and `tools/qa/boot.mjs --light=on|off`.
   perf runs under `?review=perf`, an isolated storage namespace, so it can never see Tom's own setting.
   `AYLMER.advLight()` reads back the session's value.
7. Smokes: new tools/smoke_advlight.mjs (default off; saved and loaded; session keeps its start value; a save
   slot drops advLight; loading the mini's summer leaves the Air off; option row and both labels; off shader
   hash equals c2928ca and on equals s5; back off after on; today's gradeLight for every time of day; no AO;
   grade, glow and skyOpts write no uniform with off; Worker hand-off). tools/smoke_sky.mjs turns the option
   on at its top (it tests s5 code).

## Checks

- Classic and advanced hashes checked locally with a pure shader-only node script (no world): off vs/fs
  be2c1cd1ea2e8da5 / 16548b896e525cba = c2928ca; on dc667ec2d542405f / 621f3daf352520a2 = s5 03772be.
- VM, named smokes on 8cb7ab8: GREEN (smoke_advlight 42/42, smoke_sky, smoke_shaders, smoke_timecycle 60/60,
  smoke_save, smoke_ui, smoke_sector_worker 26/26, smoke_world). Two earlier tries died on a closed Colab
  websocket before the run started (transport, not tests); one run was RED on my own smoke's wrong premise
  (save.js keeps unknown fields by design, SR-05), fixed: the smoke now checks that no save is written with
  the choice and that the switch never reads a save.
- Full suite run 1 on 8cb7ab8: 119/121 suites, GREEN; the two FAILs are the known VM-only smoke_audio and
  smoke_models (the lead reruns smoke_audio, smoke_harness_gate and smoke_models on the Mac at merge).
- Full suite run 2 on 1c0ce3a: never started. Three tries, and each time the Colab websocket closed before the run began. 1c0ce3a and the head after it change only this report next to 8cb7ab8, so run 1 covers every line of code. The lead can rerun `ct.py test rf/w8-light` once the VM is back.

## Perf on Tom's Air (the lead or Tom runs it; nothing heavy on the Mac from agents)

Option off (must match today's fix/look-on-qr numbers):

    node tools/qa/perf.mjs --poses=perf8 --env=noon,golden,night --tier=med --fresh --frames=300 --display=air --light=off --out=docs/qa/perf/w8-light-off.json

Option on (the s5 look; this is the number that was unmeasured, one hot run 13.92 ms vs the 12 ms bar):

    node tools/qa/perf.mjs --poses=perf8 --env=noon,golden,night --tier=med --fresh --frames=300 --display=air --light=on --out=docs/qa/perf/w8-light-on.json

Run them in a quiet window, one at a time. If "on" misses 12 ms on the Air that is expected and fine under
Tom's ruling (the Air plays with it off); the bar for the Air is the "off" run.

## Cloud checks for the lead

Boot both entries with each value, 0 console errors, 0 GL errors, W moves:

    node tools/qa/boot.mjs --entries=index,prototype --light=off
    node tools/qa/boot.mjs --entries=index,prototype --light=on

Plus in each page: `AYLMER.advLight()` returns the asked value. Optional: a menu check that the
« Éclairage avancé (au prochain lancement) » checkbox is unchecked on a fresh profile, and that ticking it,
reloading and reading `AYLMER.advLight()` gives true (that one uses the real setting, so no `?light=`).

## For the lead

- Merging later shader work: a change on fix/look-on-qr to any of common, light, tonemap, fog, sky, glass,
  water, reflect, wet or index.js FRAG_MAIN must go into the CLASSIC_ side (and the ADV_ side if it should
  also apply with the option on), then update the two hashes in smoke_advlight.mjs. The smoke goes red
  otherwise, on purpose.
- Question only Tom can answer (safe default taken): should the option also appear on the first-launch
  screen of the mini? Default: no, Options only.

## Where I stopped

Done: merge, option, gating, tools flags, smoke, report. Full suite GREEN on 8cb7ab8 (the last code commit). Not done here (Mac rule): perf on the Air and the
cloud boots; commands above.
