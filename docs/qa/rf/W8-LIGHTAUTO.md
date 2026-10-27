# W8-LIGHTAUTO: Advanced lighting on by default, with a slow-frame card (27 Oct 2026)

Branch rf/w8-lightauto in /Users/thomaslever/Desktop/Coding Projects/wt-rf-w8-lightauto, from fix/look-on-qr f67dbd5.
Tom's ruling (27 Oct): Advanced lighting is DEFAULT ON. If the frame rate falls below 50 fps, a pop-up offers to turn it off.

## What changed

1. Default on, a choice is kept (src/game/look/advlight.js, src/game/store.js, src/game/options.js).
   - Two new keys in `aylmer.settings` (per browser, never in a save slot, not option rows):
     `advLightChosen` (the player set it, from Options or from the card) and `advLightNoAsk` (the card's « Garder »).
   - One rule, `resolveAdvLight(s)` in advlight.js, used by both advlight.js and store.normalizeSettings:
     chosen means the stored value; not chosen means the default. So an old W8-LIGHT browser that never touched
     the box (stored `advLight:false`, no `advLightChosen`) moves to the new default; anyone who ticks or unticks
     it keeps that whatever the default becomes later.
   - Options: changing the « Éclairage avancé » row sets `advLightChosen: true` before it is saved.
   - The default is on in a real page. Under node (no browser) an unchosen value stays off, so every other smoke,
     tool and pinned bake keeps today's numbers. `setBrowserDefault()` lets smoke_advlight test the browser rule.
     `DEFAULT_SETTINGS.advLight` is a getter for that same default, so `loadSettings()` on an empty store still
     equals `DEFAULT_SETTINGS` (smoke_save, smoke_ui).
   - The Worker still gets the main thread's resolved value in the bake message (unchanged).
2. The watch (new src/game/look/lightwatch.js, `createFpsWatch`): one `Float64Array(2048)` ring of real frame
   times. Each frame: if not driving, or a frame of 1 s or more (tab switch, stall), the window empties and a
   10 s grace restarts; during the grace nothing is counted; after it, frames go into the ring and the oldest
   drop while the rest still covers 8 s; once the window covers 8 s and its average is under 50 fps it fires once
   with that fps, then is spent for the session. No allocation (checked by source and by heap over 2 million frames).
3. "Driving" in main.js `lightWatchFrame`, fed once a frame from `frameLoop` after the game frame:
   `G.mode === 'drive'` and no opening film, no cinematic card, no story card, no sector card (`G.seamHold`, which
   covers every sector bake), no crash replay, no ending cards, no meal shift, no modal (`modalOpen()`: menus,
   pause, options, brief cards, garage, map...), tab visible. Any of those resets the window and the grace, so the
   card never comes during load, the film, cards, menus, pause, replay or the first ~10 s after control or a bake.
   Only armed when `advLight()` is on this session and `advLightNoAsk` is not set, and never in a suppressed page.
4. The card (`LightPrompt`): a small fixed card near the top centre, built the first time it shows, hidden whenever
   the player is not driving, folds away after 25 s of driving unanswered (nothing stored then).
   - Step 1: « Le jeu rame un peu (44 i/s). Éclairage avancé : le désactiver? » [1 / LB Désactiver] [2 / RB Garder];
     English when the game is in English: "The game is running a bit slow (44 fps). Turn off Advanced lighting?"
     [Turn off] [Keep].
   - Désactiver: saves `advLight:false, advLightChosen:true`, then step 2: « Éclairage avancé désactivé. Relancer le
     jeu maintenant? La partie est sauvegardée d'abord. » [Relancer maintenant] [Au prochain lancement].
     Relancer: `autosave('light')` (the existing autosave path, slot `<character>.auto`), then `location.reload()`;
     if the autosave did not happen (autosave off in Options, or storage refused) it does NOT reload and toasts
     « Sauvegarde impossible: l'éclairage change au prochain lancement ». Au prochain lancement: a toast.
   - Garder: saves `advLightNoAsk:true`; it never asks again on this browser.
   - Keys: 1 / 2 (and numpad 1 / 2), pad LB / RB, or the mouse. Never W A S D, the arrows, Space or Enter. Read in
     `frame()` before `handleKeys()` and consumed, so LB / RB do not also toggle the radio or the camera. The
     buttons have tabindex -1 and cancel pointerdown, so a click never leaves focus on them.
   - At most once per session (the watch is spent once fired).
5. Suppressed (`lightPromptSuppressed`): any `?light=` (an explicit choice for the run), `?review=` or
   `?audioReview=` (perf runs under `?review=perf&light=...`), a tools/ harness frame (`AYLMER_STORAGE.review`),
   `navigator.webdriver`, a HeadlessChrome user agent. `?light=` already wins over the setting and the default.
6. `AYLMER.lightAuto = { watch, prompt, quiet }` for cloud checks. main.js still names `advLight` only where it did.
7. i18n: 8 strings in FR and EN (`light.*`).
8. Smokes: new tools/smoke_lightauto.mjs (80 checks): fires on a steady 40 fps and 49 fps after grace plus window
   (~18 s), never at 51/60/144/240 fps, never on a 4 s dip, fires on a lasting dip, never while not driving,
   one excluded frame or a hitch restarts the grace, never when interrupted every 15 s, once per session,
   no allocation (source and heap), every suppression case, armed rules, the card's words FR/EN, its keys
   never touch driving keys, hidden outside driving, both steps and all four outcomes, a failed save never
   reloads, Garder persists and disarms, and main.js wiring. tools/smoke_advlight.mjs updated to the new default
   (fresh browser on, node off, chosen kept both ways, old unchosen off moves to on, option row checked by
   default and unchecked once chosen off). Its off-path checks are untouched: off shader hash still
   be2c1cd1ea2e8da5 / 16548b896e525cba, 27 uniforms, no new uniform writes, today's gradeLight, no AO.

## Checks

- VM, named smokes on 0167e79: GREEN (smoke_lightauto 80/80, smoke_advlight 52/52, smoke_save, smoke_ui,
  smoke_shell, smoke_lang, smoke_no_dashes, smoke_sky, smoke_shaders, smoke_sector_worker 26/26).
  One earlier run RED on my own smoke (it read the session value only after saving the choice), fixed.
- Full suite run 1 on 0167e79: 121/123, RED on smoke_specstack (it pins main.js's exact
  `try { frame(now); } finally { runEconomyPulse(); }` line, which I had extended). Fixed in main.js, not in the
  test: that line is back verbatim and `lightWatchFrame(now)` runs on the next line. The other FAIL was the known
  VM-only smoke_audio. smoke_specstack + smoke_lightauto on the fix: GREEN.
- Full suite run 2 on 6c7c13e: 122/123 suites, GREEN (the one FAIL is the known VM-only smoke_audio).

## Cloud checks for the lead

1. Fresh profile, no `?light=`: `AYLMER.advLight()` is true; Options > Vidéo shows « Éclairage avancé » ticked.
   Untick, reload: false and stays false; read `aylmer.settings`: `advLightChosen:true`.
2. Boots unchanged: `node tools/qa/boot.mjs --entries=index,prototype --light=off` and `--light=on`,
   0 console errors, 0 GL errors, W moves, and `AYLMER.lightAuto.quiet === true` (rig and ?light=).
3. Note: a rig boot WITHOUT `--light` now runs Advanced lighting on (fresh profile = new default). Camera,
   look-diff and capture tools that do not pass `?light=` will shoot the s5 look from now on (see For the lead).
4. The card in a real (non-driven) Chrome, no `?review`, no `?light`: drive, then force it with
   `AYLMER.lightAuto.prompt.show(42)`; check French text, the 1/2 keys and LB/RB, W/A/S/D/arrows still drive
   while it is up, Esc/pause hides it, it comes back on resume, clicking Garder sets `advLightNoAsk:true`.
   Désactiver then Relancer maintenant: an autosave line in the console, then a reload, then
   `AYLMER.advLight() === false`. Same with Options > autosave off: no reload, the toast says so. Repeat with the
   game in English.
5. The real trigger: on the Air with `?light` absent, drive 20 s or more in a heavy spot; the card appears only
   if the average stays under 50 fps; it never appears in the opening film, cards, menus or the first ~10 s.
6. Perf on the Air, per W8-LIGHT (unchanged commands, `--light=off` and `--light=on`): the card never shows (suppressed).

## For the lead

- Lead decision: QA tools that do not pass `?light=` now see the default (on). That is what players see, so it
  is the safe default for boot gates, but any baseline images taken with the old default (off) will differ.
  If you want shot tools pinned, pass `light=off` in their URLs; I did not touch them (not my task).
- Node keeps the old default (off) for unchosen settings so no other smoke or pinned bake moved. The browser
  rule is tested in smoke_advlight through `setBrowserDefault(true)`.
- Pad: LB / RB answer the card (consumed, so no radio or camera toggle). A pad X press would also honk, which
  is why X / Y were not used (Y also starts a job).
- Question only Tom can answer (safe default taken): should the card fold away by itself? Default: yes, after
  25 s on screen unanswered, nothing stored, not asked again this session.

## Where I stopped

Done: default on with kept choices, watch, card, suppression, smokes, report. Full suite run 2 GREEN on 6c7c13e (122/123, only VM-only smoke_audio). Not done here (Mac rule): the cloud checks above.
