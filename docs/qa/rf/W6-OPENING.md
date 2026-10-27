# W6-OPENING: wiring B-11's W-list into main.js

Branch rf/w6-opening, base fix/look-on-qr 813b1a7. Stopped at the 11:57 hard stop (started 11:49, so about 8 minutes of work).

## Done
- 29079f5 W6: `openingDone` starts alternateur with `{ card: false }` always (a skip used to show the brief card), and calls `opening.cast.afterOpening({ skipped })` from main.js. Both inside `[w6-opening]` blocks. smoke_opening 269/0, the W6 check now reads "(already there)" while still PENDING (it only goes hard with the marker).
- d4038c5 then 54b2f75 (revert) W5: `opening.begin({ variant: null })` in newGame. Reverted because the pre-marker check "New Game is Tom from his own driveway" requires the literal `opening.begin();`, so W5 can only land in the same commit as the `[opening-v2]` marker. Reapply with the marker.

- W10 (commit after e3f61ee): buildMenu focuses `#btnContinue` when a save exists and G.mode is 'menu' (guarded so a buildMenu call during a drive never steals focus). smoke 269/0, W10 reads "(already there)". Browser check: on the menu with a save, Enter continues.

## Wave 7 (27 Oct): W2, W3, W4 done
Merged fix/look-on-qr twice (786acf4, then the head with races and records). Commit eeb81ba, all in main.js and opening.css inside `[w6-opening]` blocks.
- W2 first-launch gate: at boot, `!storySeen && !hasAnySave()` and no `?menu` in the address arms the gate: body class `first-launch`, #start reads `gateText(lang)` (applyMenuText re-applies it, so the English toggle keeps it right), no turntable. One listener for keydown and pointerdown on window, and pad A or Start in padOutsideDrive, call newGame(). It ignores modifiers, Tab, Escape (Escape is not a user activation, so the audio could not start), Cmd/Ctrl/Alt shortcuts, key repeats, and the English toggle. It only fires on the menu with no picker, options or load screen open. newGame() and startGame() disarm it (the QA rig's `btnFree.click()` path still works). CSS in opening.css (lead ruling): the painting and logo stay (first-hour.md section 5), every other door is hidden except English, and #start breathes on opacity only (off under prefers-reduced-motion).
- W3 `prebakeWorld()`: runs at the end of boot, on every launch. It makes the renderer, sets G.homeXZ to the likeliest start (the Continue slot's car if there is one and the gate is not up, else Tom's driveway) and runs the same worldStages() through a quiet runner (label, two frames, work, as Loading.run) with the loading screen hidden. The menu paints first (the first stage waits two frames and the atlas is a fetch).
- W4: startGame waits on `prebake.then(...)` while the world is not baked (`worldBaked` flag, because G.world is set halfway through the bake), showing the loading screen and tips as before; only with no prebake (no WebGL at load) does the click start one. `loadIntoGame` uses `worldBaked` too (it used to check G.world, which would have entered a half-built world during the prebake). A start in a sector the bake did not cover (a picked start across the seam, New Game with an Ottawa save) brings that sector in with prepareLocation before enterDrive.
- W5 NOT landed: the pre-marker check needs the literal `opening.begin();`, and the `[opening-v2]` marker turns all 11 checks hard, which needs W1, W7, W7b, W8, W9 (outside this task). opening.js already picks first or quick from storySeen, so W5 is cosmetic. It goes in with the marker in the W7/W8 pass.

## Not done
1. W5 and the `[opening-v2]` marker, with W1, W7, W7b, W8, W9 (a separate main.js pass).
2. The bar-1 numbers (first launch one key and under 40 s to the wheel, second launch under 15 s) can only be measured in a browser: see the cloud checks.

## Design risk to watch
- The prebake holds the main thread in long stretches (7 to 13 s on a quiet Air) right after the menu paints, on every launch. A key or click during a stretch is handled when the stretch ends. On a second launch the Continue click may feel late by up to one stage; it still beats starting the bake at the click. If the cloud run shows the menu itself janky before first paint, delay the prebake start by a further frame or two.
- The pad cannot start the audio context (a pad press is not a user activation); a pad-only first launch has a silent opening until a key or click. Same as before for pad A on New Game.

## Open issue for the lead
- W6 order: main.js's `afterOpening` call runs inside `onDone`, before opening.js's own call, so opening.js's second call returns [] and `stats.cards` no longer records Tom's (and Dad's) control card. If a beat reads `stats.cards`, either drop the main.js call (and the W6 regex) or have main.js push the returned ids into `opening.stats.cards`. Fixed in the next commit: main.js pushes the returned ids into `opening.stats.cards` as opening.js did. Still confirm with the opening beat in the cloud.

## Checks (wave 7, Colab VM via ct.py; nothing run on the Mac)
- smoke_opening on 52b1ff8: 269 passed, 0 failed, GREEN. W2, W3, W4, W6, W10 read "(already there)"; W1, W5, W7, W7b, W8, W9 still PENDING.
- Full suite on 0249a0a (ct.py, 484 s): 106/109, the 3 failures are the known VM-only ones (smoke_audio, smoke_harness_gate, smoke_models), so RESULT GREEN. Lead: rerun those 3 on the Mac at merge.

## Cloud checks for the lead
- Boot both entries (index, prototype) with 0 console errors, fresh profile and with a save.
- Fresh profile: the gate shows the painting, the logo and « Appuie sur une touche », no other door but English; one key starts the film; control at the first key <= 40 s on the Air (bar 1), and the world-ready time from the B-11 probe is near 0 s after the key when the page sat 15 s first.
- Second launch with a save: Continuer focused, Enter, wheel in under 15 s from page load.
- `?menu=1` on a fresh profile skips the gate (the rig path, btnFree then a start point, still drives).
- Esc on the gate does nothing; Cmd+R reloads without starting a game; English toggles the gate line.
- menuMs stays under about 1.6 s with the prebake running.

## Older checks (wave 6)
- node tools/smoke_opening.mjs: 269 passed, 0 failed at 54b2f75.
- npm test through qa-slot: started 11:51 but still queued for the RAM slot at the stop, and main.js changed while it waited, so it does NOT count. Lead: run npm test (bar 97/97) on the head of rf/w6-opening before merging.
- Browser checks for the cloud: boot of both entries with 0 console errors; the opening beat (`--only opening` or as the lead names it), first launch and skip, confirming no brief card after a skip and that Tom's card shows at control.
