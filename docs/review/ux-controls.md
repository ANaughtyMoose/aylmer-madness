# UX, controls and accessibility review - 29 Sep 2026

Branch `claude/quality-review-2026-09-29`, read-only wave. Method: code reading of
`src/core/input.js`, `src/main.js` (key routing, pause, map, focus loss),
`src/game/ui.js`, `hud.js`, `options.js`, `i18n.js`, `store.js`, `story.js`,
`cinematic.js`, `modes.js`, `economy.js`, `bigmap.js`, `index.html`,
`prototype.html`, `style.css`, `src/prototype/boot.js` + `panel.js`; plus Node
probes. No browser was opened, so anything that depends on real focus or
default-action behaviour is marked "verify in browser".

Smoke tests run (Node 26): `smoke_ui` 102 ok, `smoke_shell` 624 ok,
`smoke_start` 91/0, `smoke_lang` 13/0, `smoke_modes` 116/0. All green. None of
them cover the keyboard routing below, because nothing in the suites imports
`main.js` or fires DOM key events.

Extra probes (scratch only, not committed):
- `probe_input.mjs` drives the real `Input` class with a fake `window`. Results:
  R auto-repeat does not re-fire the radio (pass). Shift+R gives `RadioNext`
  once and never `KeyR` (pass). Holding Shift+R with repeats does not churn stations
  (pass). A Shift tap gives `LookBackToggle` (pass). W typed in an INPUT is
  ignored (pass). Blur clears a held W (pass). Ctrl+W is ignored (pass). Other
  results: Space on a focused BUTTON still reaches the game. Tab is
  `preventDefault`ed everywhere, menus included. After a blur, a still-held W
  (repeat events only) stays released. Shift held before R counts as "look back"
  in hold mode.
- `probe_i18n.mjs` collects every `t('...')` key, every Options label and every
  KEYMAP label (135). None is missing in French. 13 fall back to French in
  English, and that fallback is deliberate (see J9).

Severity: **High** = blocks or badly misleads a normal player; **Medium** =
wrong behaviour a player will meet; **Low** = polish. Confidence is about
the diagnosis, not the fix.

---

## 1. Summary

| ID | Kind | Sev | One line |
|----|------|-----|----------|
| P1 | Proven bug | Medium | Esc on Kijiji / mechanic / Volkov closes it **and** opens the pause menu, even though the button says "Fermer (Échap)". |
| P2 | Proven bug | Medium | Unlock card ("CHAR DÉBLOQUÉ"): E / Enter / Space / Esc close it and also reach the game (take job, handbrake, pause). |
| P3 | Proven bug | Medium | After you click the legend button, Space and Enter toggle the legend instead of handbrake / take job. |
| P4 | Proven bug | Medium | Menus, the start picker, the pause menu and Options can't be used from the keyboard: Tab is always swallowed and no dialog takes focus. |
| P5 | Proven bug | Medium | A gamepad can only drive. It can't dismiss the opening cinematic, take a job, pause, open the map or use menus. |
| P6 | Proven bug | Low-Med | The "?" key is `e.code === 'Slash'`. On Canadian French / CSA keyboards that key types "é", and "?" is somewhere else. |
| P7 | Proven bug | Low | The Options "Le moteur monte avec la vitesse" (engineSpeed) toggle does nothing: `audio.engineFollowsSpeed` is written but never read. |
| P8 | Proven bug | Low | The drawn keyboard (pause > Touches, Options) shows T, Y, V, M as unused, though all four are bound and in the legend. |
| P9 | Proven bug | Low | C (camera) is not saved and the Options camera select goes stale. N (map size) is saved. |
| P10 | Proven bug | Low | In the prototype, V shows a "MÉTÉO" toast but the weather does not change. The legend still says it does. |
| P11 | Proven bug | Low | In the prototype, after you use the hour slider or a select in the side panel, W/A/S/D/Space are ignored until you click the scene. |
| P12 | Proven bug | Low | On a non-standard pad, a trigger axis reading exactly 0 (half pressed) is treated as released (`axes[3] \|\| -1`). |
| J1-J12 | Judgement | Low-Med | First-run flow, Backspace abandon with no confirmation, rear-view flash on Shift+R, tiny HUD type, colour-only map markers, toasts that time out, photocopy English, and more (section 3). |

---

## 2. Proven bugs

### P1 - Esc on a shop screen also pauses the game (Medium, confidence high)

- **Observed:** Kijiji (K), the mechanic's screen (U) and Carrosserie Volkov all
  show "Fermer (Échap)" (`kijiji.js:651`, `economy.js:343`, `economy.js:473`).
  Pressing Esc closes the overlay (`economy.js:688-692`), but nothing tells
  `Input` the key was used. `Input`'s own window listener already added
  `Escape` to `pressed` (`input.js:22-23`). None of these overlays is in the
  modal list (`ui.js:28-35`) or changes `G.mode`, so the drive loop is still
  running. On the next frame `handleKeys()` sees Esc and calls `pause(true)`
  (`main.js:1819`).
- **Expected:** Esc closes the overlay and play continues.
- **Repro:** Park at 299 Fraser, stop, press K, press Esc. The Kijiji closes and the
  pause menu opens.
- **Fix:** In `economy.js`'s keydown handler, after each close, add
  `G.input?.consume('Escape')`. `G.input` exists (`main.js:229`), and `modes.js:475`
  already does the same thing.
- **Validate:** In a headless CDP script, call `AYLMER` economy `openKijiji`, dispatch a
  `keydown` Escape, step 2 frames, then assert `G.mode === 'drive'` and that the pause
  is hidden. Repeat for `openShop` and `openVolkov`.

### P2 - The unlock card passes keys through (Medium, confidence high)

- **Observed:** `economy.js:693-695` hides the "CHAR DÉBLOQUÉ" card on Space, E,
  Enter or Esc. As in P1, `Input` keeps the same press. E sets `G.wantStart` (take the
  job if you are on a pillar, `main.js:1857`), Space is a frame of handbrake,
  and Esc opens the pause menu (`main.js:1819`).
- **Repro:** Earn a famous car (`AYLMER` economy `grant(id)`), then press Esc. The card
  closes and the pause menu opens.
- **Fix:** Call `G.input?.consume(e.code)` after `hideMoment()`. For Space, also
  clear the held key, because the handbrake reads `down('Space')`, not `hit`.
- **Validate:** Same harness as P1: grant, dispatch Escape, step, check the mode.

### P3 - The legend button steals Space and Enter (Medium, confidence high)

- **Observed:** `#legendhead` is a real `<button>` inside the HUD
  (`index.html:36`). Clicking it with the mouse leaves focus on it. Its keydown
  listener calls `e.stopPropagation()` for Enter and Space (`ui.js:121-123`), so
  the event never reaches `Input`'s window listener. The browser's default action
  then clicks the button. Result: while driving, Space toggles the legend and does
  not handbrake. Enter toggles the legend and does not take the job.
- **Repro:** New game, click "? - Afficher les commandes", drive at 30 km/h, press
  Space. The legend toggles and there is no handbrake.
- **Fix:** Don't let the button keep focus after a pointer click. Add
  `onpointerdown = e => e.preventDefault()` on the head, or `blur()` in its
  onclick. Delete the `stopPropagation`. Keyboard users who Tab to it (see P4)
  still get Enter / Space.
- **Validate:** Browser: click the head, press Space, and check
  `input.down('Space')` / handbrake. The legend should not change.

### P4 - Menus can't be used from the keyboard (Medium, confidence high)

- **Observed:** `input.js:29` calls `preventDefault()` on Tab (and on the arrows and
  Space) for every keydown that isn't in an input field, whatever the game mode.
  Focus never moves from `<body>`, so the main menu, start picker, Charger, Options
  and the pause menu are mouse-only. Also:
  - `pause(true)` (`main.js:2846-2861`) never moves focus into `#pause`, even
    though `#pause` is `role="dialog" aria-modal="true"`.
  - The menu has no keyboard shortcut to start ("GO").
  - Only `.cinema-go` and `#legendhead` have a `:focus-visible` style.
  The cinematic gets this right: it focuses its button and traps Tab
  (`cinematic.js:33-40, 70`).
- **Expected:** Tab moves between controls outside driving, Enter activates, and
  opening a dialog focuses its first action.
- **Fix:** Only `preventDefault` Tab and the arrows while `G.mode === 'drive'`, or
  have `main.js` tell `Input` the mode. In `pause(true)`, `openOptions`,
  `openLoadScreen` and `openStartPicker`, focus the primary button
  (`#resume`, `#optback`, `#startconfirm`). Add one `button:focus-visible` rule.
- **Validate:** Browser, keyboard only: load, Tab to GO, Enter, Tab to EMBARQUE,
  Enter. In game, Esc, then Tab through the pause buttons and Enter on "Continuer".

### P5 - A gamepad can drive but can't play (Medium, confidence high)

- **What exists** (`input.js:94-120`): the first connected pad is read, W3C
  standard mapping. Left stick X steers, with a per-axis 0.14 deadzone rescaled to
  0..1. RT/LT (buttons 7/6) are throttle and brake with a 0.06 threshold, not
  rescaled. A is handbrake, B or X is horn, the d-pad drives. Non-standard pads with
  fewer than 7 buttons fall back to trigger axes 2/3. Rumble works through
  `vibrationActuator` and the Options toggle.
- **Missing:** `input.update()` is the only place the pad is read, and it runs
  only in drive mode (`main.js:1773`). There is no pad input for: the opening and
  mission cinematics (they need keys or a click), E/Enter take-job,
  pause/Start, map, camera, radio, reset (T), the modes picker, or any menu. A
  pad-only player is stuck at the first cinematic. The pad hint
  (`i18n.js:197`) doesn't mention the horn.
- **Fix, smallest useful set:** Map pad button *edges* into `pressed`, so every
  existing `hit()` reader gets them for free: Start→`Escape`, A→`Enter` while a
  card or cinematic is up (and keep A = handbrake while driving), Y→`KeyE`,
  Back/View→`Tab`, RB→`KeyC`, LB→`KeyR`, d-pad in menus → focus moves (needs P4).
  Poll the pad in `frame()` before the mode branches, not only in `update()`.
- **Validate:** Node probe with a fake `navigator.getGamepads()` that returns a
  pad with button 9 pressed, then `hit('Escape')`. Then a real pad in the browser.

### P6 - "?" is the wrong key on Quebec keyboards (Low-Medium, confidence medium)

- **Observed:** The legend toggle is `input.hit('Slash', 'NumpadDivide')`
  (`main.js:1867`) and `e.code === 'Slash'` (`main.js:2950`). The legend, the
  first mission's sub ("? affiche les commandes", `missions.js:68`) and the button
  label all say "?". On the Canadian French and CSA layouts, the key at the US
  "/" position types "é", and "?" is Shift plus a number key. A Quebec player who
  types "?" as shown gets nothing. Everything else uses `e.code`, which is the
  right choice for WASD (it also gives ZQSD on AZERTY), but the labels are
  QWERTY (see J11).
- **Fix:** Also accept `e.key === '?'` (and `'/'`) for the legend toggle, for
  example by putting a synthetic `'Legend'` into `pressed` from `input.js`.
- **Validate:** Browser with the macOS "Canadian - CSA" input source: press
  Shift+6 ("?") and check that the legend toggles.

### P7 - The engineSpeed option does nothing (Low, confidence high)

`options.js:329` sets `a.engineFollowsSpeed = s.engineSpeed`. A grep of `src/`
finds no reader. The Options row "Le moteur monte avec la vitesse" changes
nothing. **Fix:** wire it into `audio.engine()`, or remove the row.
**Validate:** `grep -rn engineFollowsSpeed src` should find a reader.

### P8 - The drawn keyboard says bound keys are unused (Low, confidence high)

`ui.js:238-244`: `'T'`, `'Y'`, `'V'` and `'M'` have no `*`, so they draw grey,
but KEYMAP (`i18n.js:454-463`) binds reset, tow, weather and modes to them. F5
and F9 are missing, and digits 1-9 (the modes overlay) are not marked. **Fix:** build
the lit set from `KEYMAP[].caps` instead of hand-marked stars. **Validate:** a
smoke assertion that every KEYMAP cap has the `used` class in `keyboardHTML()`.

### P9 - The C camera choice isn't saved (Low, confidence high)

`main.js:1821` changes `G.cam` only. The Options "Caméra" select still shows
`settings.cam`, and the next session starts on the old camera. `cycleMapSize()`
(N) saves its value (`main.js:1942-1949`). **Fix:** do the same:
`G.settings = saveSettings({...G.settings, cam: G.cam})`. **Validate:** press
C, reopen Options, and check that the select matches.

### P10 - Prototype: V says the weather changed when it didn't (Low, confidence high)

`main.js:1851-1854`: in the prototype, `weather.advance()` is skipped but the
"MÉTÉO" toast still shows, and the legend row "La météo - pousse au prochain
front" is still listed. **Fix:** in the prototype, say "Météo d'archives -
fixe" or drop the V row from the prototype legend.

### P11 - Prototype side panel keeps keyboard focus (Low, confidence high)

`panel.js` adds a range slider, selects and a checkbox that stay visible while
driving. After you use one, focus stays on it, and `Input` ignores every key whose target is
an INPUT or SELECT (`input.js:18`). The car stops answering W/A/S/D, and the arrows
move the slider. The place buttons try `document.querySelector('#gl').focus()`
(`panel.js:28`), but the canvas has no `tabindex`, so that does nothing. **Fix:**
`#gl` gets `tabindex="-1"`, and the panel controls call `blur()` on `change`.
**Validate:** browser: drag the hour slider, then press W.

### P12 - Half-pressed trigger reads as released on a non-standard pad (Low, confidence high)

`input.js:108-109`: `((p.axes[3] || -1) + 1) / 2`. An axis at exactly `0`
(mid-travel on a -1..1 trigger) becomes `-1`, so throttle is 0. **Fix:**
`(p.axes[3] ?? -1)`.

---

## 3. Judgements (not bugs; ranked)

- **J1 First-run flow (Medium).** From load to driving: menu → "GO ▸ NOUVELLE
  PARTIE" → start picker (character + start point, home preselected) →
  loading ("ON BÂTIT AYLMER") → cinematic "Été 2004" → "Embarquer" → a
  **second** cinematic straight away ("L'alternateur", `main.js:1398`) →
  "Commencer la job" → driving, with the objective top-left, the tutorial pill
  ("W pour avancer") and the collapsed legend button. The objective is always clear:
  the stage sub names W, S and E (`missions.js:68`), and free roam always names E
  (`story.js freeRoamLines`). Issues:
  1. Two cards in a row for one idea.
  2. The "AYLMER, QUÉBEC / prends ton temps" toast (`main.js:1071`) fires under
     the cinematic, which hides the HUD, so nobody sees it.
  3. The tutorial's last step "E sur un marqueur jaune" completes by itself,
     because the first job is started for you (`main.js:1406`). E is never
     actually taught.
  4. `tut.hand` says "20 km/h+" but the check is 12 km/h (`ui.js:171`).
  5. "marqueur jaune" (tutorial) vs "pilier jaune" (objective): pick one word.
  6. `playStory()` runs on every new game; `storySeen` is written but never read
     (the `main.js:1081` comment says "once ever").
  7. The four-card `STORY_CARDS` opener (incl. "LES COMMANDES") is dead code for
     the opener. Only `EndingCards` uses the class.
  Suggestion: merge the two cards (brief + task on one card), and move the welcome
  toast to after `onDone`.
- **J2 Backspace abandons with no confirmation (Medium).** `main.js:1822` fails
  the job on one press, and Backspace sits next to Enter (take job). In meal
  shift it quits the service (`main.js:1776`). Suggest hold-to-abandon (0.8 s,
  with a fill on the prompt) or press twice within 2 s, like the in-place
  delete confirmation the game already uses.
- **J3 Rear-view flash on Shift+R (Low).** In hold mode, `G.lookBack` is true
  from Shift down until R arrives (`main.js:1826`; probe: true). Every station
  change flashes the rear camera for a few frames. Also, in toggle mode, Shift+R
  cancels a latched rear view (`main.js:1827`). Suggest a ~120 ms delay before
  hold-mode lookback starts.
- **J4 Held keys are dropped on refocus and card close (Low).** `input.js:20`
  ignores `e.repeat`, so a key cleared by blur or `clearCinemaInput()`
  (`main.js:237`) stays released even while it is physically held. That is safe (the car
  never runs away), but "I'm holding W and nothing happens" after a card is
  confusing. Option: on a repeat for a code missing from `keys`, add it to `keys`
  only (not to `pressed`).
- **J5 Shop overlays don't pause (Low, by design).** Shop, Volkov and Kijiji leave the
  sim running. W drives under them, and they close themselves above 3 m/s
  (`economy.js:605-612`). Arrow keys can't scroll the Kijiji list because
  `Input` swallows them. Tab and M open the map and the modes picker on top of
  the shop. The K/U handler doesn't check `story`/`cinema`, `e.repeat` or the
  focus target. Recommend adding these three to `MODALS` (`ui.js:28`) or setting
  `G.mode = 'shop'`. That also fixes P1 and P2.
- **J6 HUD legibility (Medium for readability).** The objective is 19 px and the sub is
  13 px at `opacity:.8`. Both sit top-left, over the sky, with only a text shadow
  and no backing plate (`style.css:9-10`). Bright midday or snow scenes will wash
  them out. Many labels are 9.5-11 px at 0.42-0.65 opacity (legend `.alt`,
  `kbd`, `#carname`, `.hint`, `#fuel span`, `#dmglabel`, `#repairhint` 10px).
  Suggest a translucent dark plate behind `#topleft` (as `#prompt` already has),
  a 12 px minimum, 0.7 minimum opacity, and a "HUD size" slider.
- **J7 Colour-only signals (Low).** Minimap: the objective is yellow `#ffc94d`
  and a rival is orange `#ff8a3d` (`hud.js:27-32`). These are hard to tell apart with
  deuteranopia; use shape or outline. Damage bar, fuel warning, timer warning and
  envelope-reached all have a number or length alongside the colour, so they are fine.
- **J8 Short-lived toasts (Low).** Important instructions ("Arrête-toi d'abord",
  the garage directions, tow cost) disappear after 1.4-3.6 s of real time. There is
  no message log in the pause menu. Suggest a "last 10 messages" list in the
  pause Jobs tab.
- **J9 English is a deliberate "photocopy" (owner ruling, 2026-09-07).** The
  literal translation, the fall-through to French (13 keys), and the
  invert/blur/rotate filters (`style.css:434-461`) are intentional. So are
  mission text, toasts and place names staying French (`i18n.js:1-2`). Two notes
  that respect the ruling: key caps are chrome and stay French in English (`Espace`,
  `Esc`, `⌫` in `i18n.js:445`, `ui.js:171`). And the playStory body is French while its
  button is English (`main.js:1104-1107`). If the photocopy is meant to be hard
  to read, keep the *key names* crisp: `.photocopy button{filter:none}` already
  protects buttons, and `#tuto .cap` and `kbd` could get the same treatment.
- **J10 No reduced-motion handling (Low).** There is a camera-shake slider (good).
  There is no `prefers-reduced-motion` rule for the toast fade, objective pulse
  or cinematic art, and the photocopy blur ignores `prefers-contrast`.
- **J11 Key labels assume QWERTY (Low).** `e.code` gives the right physical
  positions on AZERTY (ZQSD), but the legend says W/A/S/D. Quebec layouts are
  QWERTY, so this is low. `navigator.keyboard.getLayoutMap()` (Chromium) could
  relabel.
- **J12 F5 has no repeat guard (Low).** `main.js:2948` quick-saves on every
  auto-repeat while F5 is held. Add `!e.repeat`.

---

## 4. Input map (drive mode unless stated)

| Key | Handler | Notes / other contexts |
|-----|---------|------------------------|
| W/↑, S/↓, A/←, D/→ | `input.update` | Pan in the map (`bigmap.js:62-65`), move in meal shift (`main.js:1780`). Arrows change the mode in the modes overlay (`modes.js:543`). Separate contexts, no conflict. |
| Space | handbrake (`down`) | Feed in meal shift. Advances the story card and cinematic. Closes the unlock card (P2 leak). |
| Shift (L/R) | hold / toggle rear view | Chord resolution for Shift+R in `input.js:24-36`. Probe: correct. J3 flash. |
| R / Shift+R | radio on-off / next station | Repeat-safe (probe). |
| E | take job / car (`wantStart`) | Repair spot takes E first (`main.js:1857, 1924`). Hangout reads and consumes E (`hangout.js:552-558`). Cinematic, story and unlock card also use it. Precedence is in the code. The only leak is P2. |
| Enter | take job | Same as E, except it still takes the job at a repair spot. |
| Q | next offer | |
| Tab | open map; closes the map in map mode | `preventDefault`ed everywhere (P4). |
| Esc | pause; closes the map, the pause menu, the start picker, Options, Charger, the modes picker, the shop overlays and cards | Every closer except `economy.js` consumes it (P1, P2). |
| C | camera cycle | Not saved (P9). |
| Backspace | abandon job / quit meal shift | No confirmation (J2). |
| T / Y | jerrycan-or-reset / tow | |
| G | slang gloss (tap latches, hold shows 3) | |
| V | weather next front | Prototype: toast only (P10). |
| H | horn (held) | Pad B/X. |
| M | modes picker (`modes.js:568`) | M or Esc closes it, 1-9 picks. |
| K / U | Kijiji / mechanic or Volkov (`economy.js:697-711`) | Needs < 1.5 m/s. No repeat, focus or cinema guard (J5). |
| N | minimap size (saved) | |
| + / − | minimap zoom (held, 70 ms throttle) | Map zoom in map mode. |
| 0 / Numpad0 / F9 | mute | |
| F5 | quick save (drive + paused) | J12. |
| / (Slash) | legend toggle, also in the menu and pause | P6. |

Blur and `visibilitychange` clear keys (`input.js:38-40`). They also pause from
drive, unless a cinematic, card or seam card is up (`main.js:3099-3104`). Focus
entering an input or select clears keys (`input.js:40`). Cinematics swallow keys
in the capture phase and ignore repeats (`cinematic.js:33-40`), so a held key
can't skip the next card. That part is solid.

## 5. Settings

Saved in `localStorage` through `saveSettings()`, and clamped on both read and
write by `normalizeSettings()` (`store.js:111-160`). Unknown keys are dropped.
The prototype keeps its settings apart with a key prefix (`boot.js:3-10`). Ranges
are reasonable: steering 0.5-1.6×, damage 0-2×, FOV -0.15..+0.2, shake 0-1.
Every option is applied live. The FOV slider shows a raw signed number
("+0.05"), not degrees, and the shake slider has no read-out format (`fmt`
missing, so it prints "0.7"). Both are Low. The dead engineSpeed toggle is P7. The
Options note says keys can't be rebound yet (`i18n.js:110`), which is honest.
Rebinding would help a lot with P6 and J11.

## 6. The two entry points

`index.html` and `prototype.html` share the same DOM and `main.js`. The
prototype adds `boot.js` (prefixed storage, summer calendar), a WebGL renderer
swap through the import map, and the side panel. Controls are the same except for P10
(V) and P11 (panel focus). The prototype's `data-prototype` attribute also turns
off live weather, so the V toast misleads there only. Both show the same first-run
cinematics.

## 7. Suggested order

P1+P2 (one-line consumes), P3, P9, P8, P7, P12 are small and safe. Next are P4
(keyboard menus) and P5 (pad edges), which are the larger accessibility wins.
Then J1 (merge the two opening cards) and J6 (HUD plate). Every P item above has a
validation step. P1-P5 need the CDP harness (`tools/headless.mjs`), which this
wave did not run.
