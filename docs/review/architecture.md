# Architecture review: state ownership, loops, simplification plan

Branch `claude/quality-review-2026-09-29` at `46e6eca`. Read-only wave: this file is the only edit.
Scope: `src/main.js` (3,104 lines), `src/game/economy.js` (743), the shared modules they write
through, and the two entry points (`index.html` loads `src/main.js`; `prototype.html` loads
`src/prototype/boot.js`, which imports the same `src/main.js` with `data-prototype="2004"` and swaps
`src/core/gl.js` for `src/prototype/renderer.js` through the import map).

Method: I read every line of main.js that owns state, all of economy.js, and grepped every writer of
each G field across `src/`, `tools/` and the HTML pages. Where a claim depends on data, I checked it in
node (owner tables, import graph, unused imports). Baseline `node tools/run_smoke.mjs` result is at the
end. No browser was used, so every browser step below is a check for the engineer to run, not
something I ran.

Severity: **High** = crash, softlock or lost progress on a reachable path. **Medium** = wrong
behaviour a player can hit, or a gap between tests and the real game. **Low** = a hazard or cleanup
with no observed failure.

---

## 0. The five things that matter

| # | Finding | Sev | Conf |
|---|---|---|---|
| F1 | Quitting to the menu (or loading a save) during the St. Vincent meal stage leaves `G.mealShift` set. The next drive is stuck in the meal overlay until the page is reloaded. Root cause: 5 mission-end paths, 2 of which skip `missionCleanup`. | High | High (static trace) |
| F2 | Wrecking Sara's SVX throws `TypeError` in `driveHooks`. main.js's `OWNER` has no `svx`. There are two owner tables, three modules mutate them, and they disagree on four cars. | High | High (node check of the tables) |
| F3 | The car's spec has four writers in three files, and one of them runs in economy.js's own rAF. The first tick after every load or car swap drives the stock sheet, the engine voice is rebuilt twice, and the car gets the wrong sheet if `G.carId` and `G.veh.spec.id` differ. They do differ after one fallback in `enterDrive`. | Medium | High |
| F4 | The Garage, Volkov and Kijiji screens do not pause the sim or consume their keys. Escape that closes a shop also opens the pause menu, mission clocks keep running under a shop, and E pressed on a shop or moment card also reaches the mission runner. | Medium | High (static trace) |
| F5 | `window.AYLMER.step()`, which every browser check drives, differs from `frame()` in five ways. It also has economy's pulse bolted on by monkey-patching. A check can pass on `step()` and fail in the real loop. | Medium | High |

Top-3 "do now" extractions (section 4): **E1 mission lifecycle**, **E2 car homes and owners**,
**E3 spec stack**. E4 (one `advance(dt)` for `frame` and `step`) is next and is the cheapest of the rest.

---

## 1. State ownership map

"Writers" means assignment or mutation. Line numbers are in `src/main.js` unless a file is named.

### 1.1 Per-field table

| State | Writers | Readers of note | Verdict |
|---|---|---|---|
| `G.mission` (create) | `startMission` 1383, `resumeMission` 1433 | missionkit, save.missionSnapshot, cops, modes, hangout, economy.pulse | Two builders that copy each other: the def.build args, the `G.mission` literal, waypoint, passengers, setEnv, applyStage, stuck (1378-1386 vs 1426-1447). |
| `G.mission` (end) | complete 1615-1666, `failMission` 1487-1507, restart button 2929-2934, `toMenu` 2881, `enterDrive` 1022 | | **5 paths, all different** (table 1.2). |
| `G.mealShift` | lifejobs.js:24 (onEnter), lifejobs.js:2 (`close`, via onExit/cleanup) | `frame()` 1774-1787 | Only cleared through `missionCleanup`, which 2 of the 5 end paths skip → **F1**. |
| `G.wallet` | created once 1028. `.value =` 1031. add/spend in main 1636, 1903; missionkit (3), economy (2), fuel (2), upgrades (2), hangout (2), tow, cops, garage, jumps, kijiji, damage | calendar.envelopeText, checkReached | Many callers, but all go through `Wallet` methods except the load (1031). Explicit and fine. Leave it. |
| `G.veh` | `enterDrive` 954, `swapCar` 1257 | everything | Two builders with the same 6-line tail (assist, reset, restoreDamage, settle, engine profile, gearbox). |
| `G.veh.spec` / `baseSpec` | main tick 2031, 2033, 2044 (fuel's dry clone); economy.js:186-187 (`retune`, own rAF); cars.js:2005 (ctor) | cars.js physics, fuel, audio | **4 writers, 3 files, 2 loops** → **F3**. |
| `G.carId` | 299, 586, 737 (menu card), 805, 807, 950-951, 966, 1256, 2960 | economy `wanted()` (keys the tune on it), homeParked, save | 9 writers. 805/807 are overwritten by 950-951. 737 (menu car card) is overwritten for every new game by 951, so the card highlight does nothing. 966 changes `G.carId` **after** `G.veh` was built from the old id (953-954) → F3.c. |
| `G.character` | 796, 945-946, 2961 | save, garage | Set twice per start (startGame then enterDrive). Harmless, but it is a duplicated transition. |
| `G.done` | 958, **995**, 1617 | garage, missions, economy | 995 replaces the Set that line 961 handed to `garage.setProgress`. `G.done` and `garage.done` are different objects until the first job completes (1620 realigns them). |
| garage unlocks | `garage.restore` at **960 and 1009** | | Restored twice per load. |
| `G.day`, `G.target`, `G.summerOver`, `G.reached` | 1004-1008, then calendar.js:56-77 (`restoreSummer`, 1039), calendar.js:90 (`spendDay`), calendar-clock.js:8 (prototype midnight), 1041-1042 (prototype), `runEnding` 1471 | save, HUD | 1004-1008 are dead writes: `restoreSummer` overwrites all four 35 lines later with different clamping. |
| `G.fuel` | 1005, fuel.js `initFuel` (1046), `onSwap`, `tickFuel`, `fill`, `jerrycan` | HUD, save | 1005 is a dead write (overwritten at 1046). fuel.js otherwise owns it cleanly. |
| `G.dayClock` / env | 1020, 1041, 1093, 1354, calendar-clock.js:6, `AYLMER.visualClock` 3005, `AYLMER.env` 3032; env via `setEnv`/`setCycleEnv`/`stepEnv` | render, weather, save (`visualHour`, save.js:499) | 18 `VISUAL_PROTOTYPE` branches pick one of two clock models. save.js:499 finds out which model is running from `G.renderer?.isPrototype` and hardcodes `600` for `DAY_NIGHT_CYCLE`. That is a second flag and a second copy of the constant. |
| `G.settings` | options.js:292 (`applySettings`), **1947** (`cycleMapSize`, bypasses `onSettings`) | everything | Two writers. Map size is persisted twice, as `G.settings.mapSize` and `G.mapPrefs.size` (options.js:338-339 and 1943-1947 keep them in sync by hand). |
| `G.difficulty` → pay/timer scales | options.js:317 (live); calendar.js:56-66 bakes `payScale`/`timerScale` only on `restoreSummer` (1039) | missionkit.scaledPay, applyStage | A mid-game difficulty change takes effect at once for `dayCost` (`diff(G)` is live in spendDay) but not for pay or timers until the next load. |
| `G.parked` | main 968-975, 1205-1208, 1253-1254, 1628; economy.js:224; racejobs.js:112,133; golfjob.js:61; verbs.js:34,50,51 | save, mapState, tick collisions | Each writer computes its own "next slot at this address". main 1624-1628 and economy.js:218-224 are the same algorithm. economy's comment says so. |
| `G.health` | main 989, 1210, 1252, 1883, 1912, 1933; economy 394-395, 517-518, 580; arc.js 192, 258; tow.js 136 | save | "Repair this car" is written 5 times: main 1911-1915 and 1932-1935, tow.js:134-137, economy.js:394-397 and 517-520 (`repair()`, `health=0`, reset `repairHints`, clear the hint). |
| car owner/home | main `OWNER` 257-276 (+ `VEHICLE_OWNERS`), mutated by economy.js:153; save.js `OWNER` 92-99, mutated by vehicles.js:30 and fortiercars.js:59; `homeParked`/`homeSpot`/`curbSpot` in **both** main (1164-1192) and save.js (141-179) | tow on wreck (1901), save.normalizeSave (save.js:300), economy.deliver | **F2** (section 2). |
| mode (`G.mode`) | main 1058, 1711, 1721, 2850, 2864, 2880; modes.js:470, 473 | frame, economy.pulse, economy keydown | Clean for pause, map and modes. The economy screens, meal shift, cinema and seam hold do **not** use it, so there are three overlay mechanisms (F4). |
| audio "silence the car" (`engine(0,0)`, `skid(0)`, `horn(false)`) | 244, 1717, 1778, 2859-2860, 2879; economy.js:433, 536, 596 | | 8 copies. The 3 in economy do nothing, because the next tick sets the engine again (the sim is not paused under a shop). |
| radio lifecycle | `pause` 2861/2868, `toMenu` 2877, `enterDrive` 1075, `toggleRadio` 316, tick 2199-2206 | | `toMenu` calls `pause(false)`, which **resumes** the radio, then suspends it again (2876-2877). |
| exposed callbacks for modules | `G.swapCar` 1272, `G.failMission` 1510, `G.autosave` 2729 (module scope); `G.startMission` **inside `tick()`** 2151; `installModes(G, {startMission})` 3074; `installEconomy({...})` 3097 | ambush.js:110, hangout.js:696, cops.js:489, modes.js | 4 styles. `G.startMission` does not exist until the first tick, although ambush.tick (2142) already runs before that line inside the same tick. |

### 1.2 The five mission-end paths (root of F1)

| Step | complete 1615 | `failMission` 1487 | restart btn 2929 | `toMenu` 2873 | `enterDrive` 1022 |
|---|---|---|---|---|---|
| refund paid stages | n/a | yes | yes | **no** | **no** |
| `missionCleanup` (stage onExit + def.cleanup; clears boat/focus) | yes (false) | yes (true) | yes (true) | **no** | **no** |
| spend a day | yes | if idx>0 or >45 s | **no** | no | no |
| `G.mission = null` | yes | yes | yes | yes | yes |
| passengers = 0 | yes | yes | yes | no | (new Vehicle) |
| `setCycleEnv()` (give the sky back) | yes | yes | no (startMission re-pins) | no | yes (1021) |
| `hud.setTimer(null)`, `G.stuck=null`, `refreshFreeRoam` | yes | yes | no | no | partly |
| `hud.prompt(null)` | yes (1608) | yes | no | no | no |
| hide cinema/intro | no | yes | no | yes | yes (modal loop 1061) |
| autosave | yes | no | no | no | n/a |

Cleanup hooks that the two bare paths skip: lifejobs.js:20/24 (`close` → the meal-shift overlay),
golfjob.js:71 (`giveItBack`, puts you back in your own car), racejobs.js:334 (`endRace`),
sidejobs.js:63/251/354 (`clearJob`), ambush.js:93.

---

## 2. Findings

Format: severity · evidence · confidence · fix · validation.

### F1. Meal-shift softlock after menu/load mid-job (High)
- **Evidence.** The meal stage sets `G.mealShift` (lifejobs.js:24), and only `close` clears it (lifejobs.js:2), which is reached through `missionCleanup` → onExit/cleanup. `toMenu` (2881) and `enterDrive` (1022) null `G.mission` without calling it. After that, `frame()` takes the `if (G.mealShift)` branch (1774) on every frame: no `handleKeys`, no `tick`. Backspace calls `failMission` (1776), which calls `missionCleanup(G, null)`, and that returns at once (missionkit.js:190). Escape → pause → resume lands back in the branch. `draw()` sets `visibility='visible'` (mealshift.js:33), so the overlay returns. `enterDrive` never resets `G.mealShift`.
- **Path.** Take « Une bouchée à la fois » → reach the meal → Esc → Menu → Continuer. Loading any slot from the pause menu mid-meal does the same.
- **Confidence.** High from the static trace. Not run in a browser.
- **Fix.** E1: one `closeMission(outcome)` that every path calls, plus `G.mealShift = null` in the per-run reset.
- **Validation.** Browser: start `stvincent` with `AYLMER.start('stvincent')`, move to the meal stage, call `AYLMER.pause(true)`, click `#garage`, then `AYLMER.load(<slot>)`. Assert `!AYLMER.G.mealShift` and `!document.getElementById('mealshift')`, and that `AYLMER.step()` moves the car. Smoke: `smoke_save`, `smoke_spine`, `smoke.mjs`.

### F2. Wrecked SVX throws; two owner tables (High)
- **Evidence.** 1901: `const home = PLACES[OWNER[v.spec.id]]`, then 1910 `home.x`. In node, main's combined table (`OWNER` + `VEHICLE_OWNERS` + famouscars `OWNERS`) is missing exactly `svx`. fortiercars.js:59 adds `svx` only to **save.js's** `OWNER`. save.js's table is missing `tempo, sicivic, crownvic, firebird, leone`, because economy.js:153 adds those only to main's. The two tables disagree on `cutlass, caravan, bus, benz` (`usedlot` vs `home`). `G.towed = true` is set before the throw (1900), so the rest of the tick is skipped once and the SVX stays wrecked where it stopped. The wallet has already been charged (1903) and the mission already failed (1904).
- **Confidence.** High on the tables (checked in node) and on the dereference. The SVX takes damage like any car (cars.js:2550-2553).
- **Fix.** E2: one owner table, and the wreck tow goes through `tow.js`.
- **Validation.** Browser, `tools/fortier-check.html`: take the SVX, then `a.G.veh.damage = 100; a.step(1/60)`. Expect no exception, the car reset and `damage === 0`. Smoke: `smoke_fortier`, `smoke_save`, `smoke_vehicles`, `smoke_tow`, `smoke_cart`.

### F3. Spec has four writers across two loops (Medium)
- **Evidence.** main.js:2031 `if (!v.baseSpec) v.baseSpec = v.spec`, then 2033 `v.spec = skills(weather(baseSpec))`, then 2044 `v.spec = dry` (fuel.js:112). economy.js:179-190 `retune()` sets `baseSpec` **and** `spec` to the tuned sheet and calls `audio.setEngineProfile`. It runs from economy's own rAF (672-676), which fires after `frame()` and so after the tick.
  - a. After `enterDrive` or `swapCar`, the first tick captures the **stock** sheet as `baseSpec` (2031), and the car drives it for a frame before economy swaps the tuned one in.
  - b. `setEngineProfile` runs twice per load or swap: once with the stock sound (993 in `enterDrive`, 1262 in `swapCar`), then again with the tuned sound from economy.js:188 a frame later. economy.js:182-184 records that an engine voice rebuilt every frame once left the engine silent.
  - c. `wanted()` keys on `G.carId` (economy.js:165-168). `enterDrive` 966 can change `G.carId` after building `G.veh` from another id (953-954). The Vehicle then gets another car's sheet, and a parked copy of the car you are sitting in is left in `G.parked`, because 969-973 skip only the new `G.carId`.
  - d. Watching for jump feats (economy.js:618) samples once per display frame, not once per sim step.
- **Confidence.** High (a-c are direct reads of the code). Impact on feel is small but real (d is low).
- **Fix.** E3.
- **Validation.** `smoke_vehicle_spec_layers`, `smoke_upgrades`, `smoke_driving`, `smoke_garage`. Browser: fit a part with `AYLMER.economy.fit('moteur')`, swap car and back, then call `AYLMER.step()` once and assert `G.veh.baseSpec` is the tuned sheet on the **first** step. Count `setEngineProfile` calls with a wrapper: expect one per swap.

### F4. Economy screens are overlays without a mode (Medium)
- **Evidence.** `Input` records every keydown into `pressed` (core/input.js:16-23). economy.js:687-692 closes the shop on Escape (preventDefault, but no `input.consume`), and the next `frame()` → `handleKeys` 1819 → `pause(true)`. modes.js does this right: it sets `G.mode='modes'` (modes.js:470) and consumes Escape (475). The shops keep `G.mode === 'drive'`, so `tick()` keeps running under them: mission clocks (1595-1598), cops, fuel, and E reaching `G.wantStart` (1857). The code states this on purpose ("Neither screen pauses the game — that is main.js's business", economy.js:601-604), and the only guard is to close the screens when the car rolls. K/U also open over a cinema card, because economy checks only `G.mode` (696).
- **Confidence.** High for the Escape leak and the running sim. Whether a timed stage is reachable at a shop is unverified.
- **Fix.** Include this in E4/E5: open the screens through `setModal` plus a mode, the same door modes.js uses, and consume Escape/E/K/U.
- **Validation.** Browser: park at `norm`, run `AYLMER.economy.openShop()`, dispatch an Escape keydown, then `AYLMER.step()`. Assert `G.mode === 'drive'` and the pause modal is closed. Smoke: `smoke_upgrades`, `smoke_ui`, `smoke_shell`.

### F5. `AYLMER.step` is not the real loop (Medium)
- **Evidence.** `frame()` 1750-1807 compared with `step` 3008:
  - `step` ignores `G.seamHold`, while frame holds at 1771.
  - `step` ignores `G.mealShift`, while frame branches at 1774.
  - `step` does not re-check `G.mode` after `handleKeys`, so it ticks even when Escape just paused. Frame re-checks at 1789.
  - `step` does not sub-step. `step(0.1)` is one 0.1 s tick, and principale-check.html and life-check.html use `a.step(.1)`. Frame caps each step at `STEP` (1800-1802).
  - `step` does not call `syncModal`.
  - economy.js:680-683 patches `step` to run `pulse()`.
- **Confidence.** High.
- **Fix.** E4: `advance(dt)` used by both `frame` and `step`, with economy's pulse inside `tick`.
- **Validation.** `smoke_walls` pins the dt clamp and sub-step regex (smoke_walls.mjs:226-228), so keep those lines verbatim inside `advance`. Re-run tools/first-drive-check.html, principale-check.html, life-check.html and fortier-check.html.

### F6. Two tow implementations (Medium)
- **Evidence.** The wreck tow (1899-1916) charges a flat `REPAIR.TOW` and drops the car on the owner's raw PLACES point with no `placementReason` or `settleSpawn`, and does not set `lastSafe`. The Y tow (tow.js:126-139) charges `towCost(damage)`, places the car on a checked road spot, and resets repair state. The two also clear repair state differently: the wreck path clears `repair.key` and hints, and 1932-1935 do not clear `repair.key`.
- **Confidence.** High that the two paths differ. Whether a PLACES point can sit in a footprint: medium.
- **Fix.** Part of E2: the wreck calls `tow.towHome(G, ownerPlace)`, built on `roadSpot` and `place`.
- **Validation.** `smoke_tow`, `smoke_repair`. Browser: `G.veh.damage=100; step()` in each of 3 cars.

### F7. Per-run reset is scattered (Low-Medium)
- **Evidence.** `enterDrive` resets about 30 fields inline (942-1096), and duplicates some: `G.done` 958/995, `garage.restore` 960/1009, `G.day`/`G.fuel` 1004-1008 vs 1039/1046. It never resets `G.mealShift`, `G.offer`, `G.lastDone` (so a new game's autosave says « après <last session's job> »), `G.repairHints`, `G.repair.key`, `G.wantStart`, `G.relayOn` or `G.camShake`. The G literal defines `stats` three times (184, 212, 226), so only the last survives.
- **Confidence.** High.
- **Fix.** E6: a `resetRun(G, save)` in one place that names every per-run field.
- **Validation.** `smoke_save`, `smoke_spine`, `smoke_start`. Browser: finish a job, go to the menu, start a new game, and check `G.lastDone === undefined` and `G.offer === null`.

### F8. Pause, menu and blur lifecycle (Low-Medium)
- **Evidence.**
  - `toMenu` reuses `pause(false)` (2876), which un-pauses audio, resumes the radio, sets mode `drive` and resets `last`, and then undoes most of that.
  - `pauseOnFocusLoss` (3099-3101) acts only in `drive` without cinema, story, ending or seam. A hidden tab with the map, the modes picker or a cinema card up keeps the classic `Radio` playing. Only the prototype wires `setHidden` (local-radio.js:111).
  - `openMap` suspends weather but not the radio (1718).
- **Confidence.** High on the code. Audible impact not verified.
- **Fix.** E8: explicit `holdWorld(reason)` and `releaseWorld()`. `toMenu` calls its own teardown. `visibilitychange` suspends audio in every mode.
- **Validation.** `smoke_radio_resume`, `smoke_recorded_radio`, `smoke_audio`. Browser: open the map, fire `visibilitychange` (hidden), and check `radio.state().on === false`.

### F9. Sub-step semantics (Low)
- **Evidence.**
  - `tick` runs up to 8 times a frame (1800-1802) but does per-frame DOM work each time: `hud.setFuel`, `setEnvelope` and the tow buttons (2047-2053), and `setCycleEnv` allocates (1359).
  - `roadContext` counts down a fixed `1/60` per call, whatever dt is (2274).
  - `sectorTick` sets `G.seamHold` mid-frame, but the rest of that tick and the remaining sub-steps keep simulating. `frame` checks the hold only before the loop.
  - `G.cockpit` is created lazily in `render` (2334) and updated in `tick` (2195), so a step-only headless run never ticks the cockpit.
- **Fix.** Move the per-frame HUD writes to after the sub-step loop (in `advance`), pass `dt` to `roadContext`, break the sub-step loop when `G.seamHold` flips, and build the cockpit in `worldStages`.
- **Validation.** `smoke_walls`, `smoke_cockpit`, `smoke_sectors`.

### F10. Menu car card and dead writes (Low)
- **Evidence.** Clicking a car card writes `G.carId` (737), but `enterDrive` 951 replaces it for every new game. startGame 805-807 is overwritten by 950-966. `if (!garage.has(G.carId, G.done)) G.carId = 'ranger'` at 299 runs before any save is read.
- **Fix.** Decide whether the card picks the start car. If it does not, drop the `onclick`. Delete 805/807.
- **Validation.** `smoke_start`, `smoke_shell`, `smoke_garage`.

### F11. Other duplication worth folding (Low)
- The difficulty scales are baked at load but `dayCost` is live (options.js:317, calendar.js:56-66, 90). Fix: read `diff(G)` live in `scaledPay`/`applyStage`, or re-run `startSummer`'s scale lines in `onSettings`.
- Map size lives in two stores (1942-1949, options.js:335-339). Fix: `cycleMapSize` → `onSettings(saveSettings({...G.settings, mapSize}))` and drop `mapPrefs.size`.
- save.js:499 hardcodes `600` and re-detects the prototype. Fix: pass `DAY_NIGHT_CYCLE` and the flag in `opts`, or export the constant from a clock module (E7).
- `startMission` has no guard against an active mission (1372). Fix: `closeMission('replaced')` first (E1).

---

## 3. Update loops

| # | Loop | File:line | Updates | Order vs main | Runs while paused / menu / hidden | Hazards |
|---|---|---|---|---|---|---|
| L1 | `frame` rAF | main 1750 | modal sync, input, map or meal branch, `handleKeys`, 1-8 × `tick`, `stepEnv`, `render` | Main. Registered first (2990). | Returns early unless `drive` (1769). Held by seam/cinema (1771). Not while hidden (rAF). | F5, F9. |
| L2 | economy `loop` rAF | economy.js:672-676 | `retune`, auto-close shops, jump feats, famous-car claims (deliver + autosave), shop prompt | After L1 every frame (registered second). | Returns unless `drive`. **Runs during cinema and seam holds**, because those keep `drive`, so a famous-car moment and autosave can fire under a seam card. | F3; claims under a hold; once per display frame, not per sim step. |
| L3 | `AYLMER.step` | main 3008, wrapped by economy.js:680-683 | input, handleKeys, 1 tick, stepEnv, then pulse | Manual. | Ticks even if `handleKeys` just paused. | F5. |
| L4 | seam: double rAF + setTimeout | main 1987-1991 | bakes a sector, then clears `seamHold` after ≥1.8 s | Asynchronous to L1. | The timeout fires while hidden. Blur during a hold does not pause (3101), so the game resumes unpaused. | Low. |
| L5 | loading tip `setInterval` 5.5 s | main 832 | loading tip | none | Cleared on success (837), **not on a load failure** (839-842), so it keeps rotating behind the "Ouch" screen. | Low. Clear it in `catch`. |
| L6 | zoom save debounce | main 1960 | `saveMapPrefs` | none | yes | none |
| L7 | turntable rAF | turntable.js:70-83 | menu car cards (own GL) | Independent. Stopped by `startGame`, started by `toMenu`. | Menu only. | none |
| L8 | prototype panel `setInterval` 300 ms | prototype/panel.js:35 | reads clock, date and weather into the panel | independent | Always on, including the menu and a hidden tab (read-only). | Low. |
| L9 | local radio `setInterval` 500 ms | prototype/local-radio.js:109 | library refresh while its section is open | independent | yes | Low. |
| L10 | autopilot rAF (`?drive=`) | autopilot.js:36-44 | dev chauffeur | independent | dev only | none |
| L11 | toast, heckle and hud one-shot timers | hud.js:309, 753; heckle.js:505, 524; ui.js:218, 439; audio.js:223, 242, 296; radio.js:1310; recorded-radio.js:234 | DOM/audio teardown | none | Toasts freeze under a modal (251). recorded-radio is token-guarded (recorded-radio.js:168-186). | none found |
| L12 | glenwood-review rAF | prototype/glenwood-review.js:100 | separate page | n/a | n/a | none |

Summary: the only loop that changes simulation state outside `frame` is L2 (economy). L4 flips a
gate. Everything else is display or teardown.

---

## 4. Proposed extractions, ranked by harm removed

Ground rules:
- No event bus. Modules receive plain objects and return results, and main.js keeps the calls in `tick`.
- Several smoke suites read `src/main.js` as text, so an extraction must either leave the pinned strings in main.js or update the suite to read the new file in the same commit. The pinned strings:
  - smoke_walls.mjs:226-228: dt clamp and sub-step lines
  - smoke_save.mjs:360-363, 644: `function resumeMission`, « Job reprise », « Job perdue », the autosave slot template
  - smoke_shell.mjs:100-212, 567, 813-817: `syncModal();`, `onModal(`, `phaseClock`, `G.dayClock = phaseClock(savedTime)`, `DAY_HOLD`, the heckle trigger names, `flavour.update(dt, G, landEvent)`, `landedInWater`, `flavour.showTip`, `showPause()`, `reset()`
  - smoke_start.mjs and smoke_firstjob.mjs:139: `START_POINTS`, `START_UNLOCKS`
  - smoke_benz.mjs:298: the mapState label filter
- Always run `node tools/run_smoke.mjs` (all suites, serial) and `node tools/check-prototype.mjs`.

### E1 (DO NOW). Mission lifecycle → one close path, then `src/game/missionrun.js`
**Harm removed:** F1 softlock; missing cleanup on menu and load (golf cart not returned, race and side-job leftovers); unequal HUD, sky and timer resets; restart path gaps; `startMission` over an active job; `smoke.mjs`/`smoke_race.mjs` testing a hand-copied runner ("cut-down copy of main.js's runner", smoke.mjs:411) instead of the real one.

**Seam.** State: `G.mission`, `G.mealShift`, `G.offer`, `G.near`, `G.wantStart`, `G.wantCycle`, `G.stuck`, `G.best`, `G.done`. Functions: `startMission`, `resumeMission`, `applyStage`, `updateMission`, `failMission`, the completion block, the restart onclick, and the mission lines of `toMenu` and `enterDrive`. Main-owned dependencies, passed in as an explicit `deps` object: `hud`, `audio`, `cinema`, `garage`, `setEnv`, `setCycleEnv`, `refreshFreeRoam`, `endOfJob`, `autosave`, `sayFriend`, `swapCar`, `homeKey`, `curbSpot`, `homeOf`.

**Steps.** Each is its own commit, with the suite run after each.
1. In main.js, add `function closeMission(outcome)` next to `failMission`, with `outcome ∈ {'done','fail','restart','quit'}`. Its body is the union of table 1.2 in this order:
   - `const m = G.mission; if (!m) { closeMealShift(); return; }`
   - if `outcome !== 'done'`: `refundJob(G, m)`
   - `missionCleanup(G, m, outcome !== 'done')`
   - `G.mission = null; G.mealShift = null` (the defensive null covers a def with no onExit)
   - `hud.prompt(null); hud.setTimer(null); G.stuck = null; G.veh && (G.veh.passengers = 0)`
   - `introCard.hide()`, then `cinema.hide()` except for 'done'
   - `setCycleEnv()`
   - `refreshFreeRoam()`
   
   Return `m`. Leave the day cost, autosave, toasts and sayFriend with the callers, because they differ on purpose.
2. Make `failMission` call `closeMission('fail')` after its toast and `endOfJob` check. Delete its duplicated lines (1496-1506).
3. In the completion block, replace 1640-1648 with `closeMission('done')` and keep `sayFriend`, `endOfJob`, `autosave` and the cinema show as they are. Watch the order: `missionCleanup` must still run **before** `endOfJob()`, as it does today at 1640 then 1649.
4. The restart onclick (2929-2934) becomes `const def = G.mission?.def; if (!def) return; closeMission('restart'); G.offer = null; pause(false); startMission(def);`.
5. `toMenu` (2881-2884) calls `closeMission('quit')` **before** `pause(false)`/mode changes. `enterDrive` replaces 1022 with `closeMission('quit')` at the **top** of the function, before `G.veh` is replaced, so a stage's onExit that reads `G.veh` still sees the old car.
6. At the top of `startMission`: `if (G.mission) closeMission('quit');`.
7. Only after 1-6 are green: move `startMission`, `resumeMission`, `applyStage`, `updateMission`, `failMission` and `closeMission` into `src/game/missionrun.js` as `createMissionRunner(G, deps)` returning `{ start, resume, update, fail, close }`. Assign `G.startMission`, `G.failMission` and the modes `api` **once at module scope** (removes the lazy assignment at 2151). Keep a one-line `function resumeMission(saved) { return runner.resume(saved); }` in main.js and the « Job reprise » and « Job perdue » strings where smoke_save expects them, or update smoke_save.mjs:356-363 to read missionrun.js in the same commit.
8. Point smoke.mjs `play()` and smoke_race.mjs's runner at `createMissionRunner` with fake deps, and delete the copies.

**Risk.** Moderate. Cleanup order changes for `toMenu` and `enterDrive` (they now run onExit hooks they never ran). golfjob's `giveItBack` swaps cars, so in `enterDrive` it must run before the new Vehicle is built. That is why step 5 puts it at the top.

**Validation.**
- Smoke: `smoke.mjs`, `smoke_save`, `smoke_spine`, `smoke_race`, `smoke_modes`, `smoke_hangout`, `smoke_firstjob`, `smoke_cart`, `smoke_arc`, `smoke_verbs`, `smoke_vehicle_life`.
- Browser:
  - (a) The F1 repro.
  - (b) tools/life-check.html full run.
  - (c) Golf job → Esc → Menu → Continue: you are in your own car and the cart is on the apron.
  - (d) Restart mid-job: wallet equals the value before the job, and the clock restarts.
  - (e) Cop bust mid-course (`AYLMER.heat(5)`) → free roam with the sky unpinned.

### E2 (DO NOW). Car homes and owners → `src/game/homes.js`
**Harm removed:** F2 crash; the four-car `usedlot`/`home` disagreement; three modules mutating two tables at import time; two `homeParked`, `homeSpot` and `curbSpot` implementations; three "next slot at this address" loops (main 1624-1628, economy.js:218-224, main 1181-1182); F6 two tow paths.

**Seam.** Move save.js:141-179 (`curbSpot`, `apronSpot`, `homeParked`, `homeSpot`), main.js 257-279 (`OWNER`, `homeKey`, `homeOf`), 1151-1192 (`lotSpot`, `curbSpot`, `homeParked`, `homeSpot`), and one `nextFreeSlot(G, id)` into `homes.js`. It has one `OWNER` built at import time from cars.js ids, `VEHICLE_OWNERS`, famouscars `OWNERS` and `svx: 'heritage'`, with no later `Object.assign`. `homeParked(world, garage, done, currentId)` takes its inputs instead of reading `G`. save.js re-exports the helpers so the tests and tools that import `save.homeParked` keep working (smoke_save:535-682, smoke_vehicles:56, 476, 558, smoke_cart:251).

**Steps.**
1. Add `homes.js` with main's semantics: `usedlot` for unsold beaters, and `homeKey` maps `usedlot` to `home` for sold ones. Add `svx`.
2. Add a node assertion to `smoke_save` (or a new `smoke_homes`): every `CARS` id has an owner, and `PLACES[homeKey(id)]` exists after `resolvePlaces` on a fake world.
3. Switch main.js to import from homes.js, and delete its copies. Keep `installEconomy({... OWNER ...})` passing the same object for one commit, then change economy.js:153 and 218-228 to call `homes.nextFreeSlot` / `homes.deliver`.
4. Remove the `Object.assign(SAVE_OWNER, …)` at vehicles.js:30 and `OWNER.svx=` at fortiercars.js:59. Before deleting `save.homeParked` (currently used by `normalizeSave` at save.js:300), decide whether a normalized save should use the lot spots (main semantics) or the home curb (save semantics). **Ask the owner.** It changes where unsold beaters appear in an old save.
5. The wreck path (1899-1916) calls a new `tow.towHome(G, PLACES[homeKey(id)])` that uses `roadSpot` + `place` + the shared repair reset. Keep the flat `REPAIR.TOW` price unless the owner rules otherwise.

**Risk.** Low-moderate. Step 4's semantic choice is the only behaviour change.

**Validation.**
- Smoke: `smoke_save`, `smoke_vehicles`, `smoke_cart`, `smoke_homeparking`, `smoke_garage`, `smoke_fortier`, `smoke_tow`, `smoke_upgrades`.
- Browser:
  - fortier-check.html plus `a.G.veh.damage=100; a.step(1/60)` in the SVX, the Ranger and the cart;
  - « Remettre les chars chez eux » from the pause menu, then compare `mapState().parked` before and after;
  - buy a Kijiji car and check it appears at the right curb slot.

### E3 (DO NOW). Spec stack → `src/game/specstack.js`, economy stops writing the car
**Harm removed:** F3 a-d; economy's rAF loop (its only simulation duty is `retune`; the rest of `pulse` joins the tick in E4); the double engine-voice rebuild.

**Seam.** `export function driveSpec(G, v, { weather, skills, fuel, garage, carById, tuned, tunedSound })` returns `{ base, spec, sound, soundChanged }`, where:
- `base = tunedFor(v.carId)`: the tuned sheet for the Vehicle's own car, cached on (car id, mods). It is keyed on `v.carId` (set at the two `new Vehicle` sites), not `G.carId`;
- `spec = fuelDry(skills.specFor(weather.specFor(base), G))`.

main.js `tick` 2031-2044 becomes one call. `audio.setEngineProfile` is called only when `sound` changes, and main.js stops calling it at 993 and 1262. economy.js keeps `wanted()`/the cache as exported helpers, and `retune()` becomes "invalidate cache" (`cache.key = ''`), which fit, paint and restore already do.

**Steps.**
1. Add `v.carId = spec.id` where `enterDrive` and `swapCar` construct the Vehicle. Fix the `enterDrive` order: resolve the final car id (the 966 fallback) **before** `carById`/`new Vehicle` (953-954).
2. Create specstack.js containing the tuned cache moved out of economy.js:163-174. Keep `tickFuel`'s signature; pass it `v` with `baseSpec` already set.
3. Replace main 2031-2044 with `const s = driveSpec(...); v.baseSpec = s.base; v.spec = s.spec; if (s.soundChanged) audio.setEngineProfile(s.sound);`. Keep `G.fuelTank`, `hud.setFuel` and the other lines of that block where they are.
4. In economy.js, delete the `G.veh.baseSpec`/`G.veh.spec` writes (186-187) and the per-frame `retune()` in `pulse` (609). After a fit, paint or restore, call `specstack.invalidate()`.
5. Extend `smoke_vehicle_spec_layers.mjs`:
   - `driveSpec` returns the tuned base on the first call after a swap;
   - it returns the same object on repeated calls (no allocation);
   - `soundChanged` fires once per swap.

**Risk.** Low-moderate. The subtle part is the cache identity, because weather and skills cache on `hit.base === spec` (weather.js:305, skills.js:79). The stack must hand them the same `base` object every tick, which a keyed cache does.

**Validation.**
- Smoke: `smoke_vehicle_spec_layers`, `smoke_upgrades`, `smoke_driving`, `smoke_garage`, `smoke_feel`, `smoke_audio`, `smoke_spine`.
- Browser:
  - integration-vehicle-audio.html: the engine note is present after load and after a swap, with one `setEngineProfile` per event (wrap it and count);
  - fit `moteur` 3, swap to the Saturn and back, and the 0-100 from `AYLMER.economy.measure()` matches the drive;
  - run the tank dry (`G.fuel = 0; step()`) and check `G.veh.spec.accel === 0` while `baseSpec` stays tuned.

### E4. One `advance(dt)` for `frame` and `AYLMER.step`; economy pulse joins `tick`
**Harm removed:** F5 (tests diverging from the game); L2's second loop; claims and autosave under a seam or cinema hold; frame-rate-dependent jump sampling (F3.d); part of F9.

**Seam.** Extract `advance(dt, { substep = true })` from `frame` lines 1769-1806: mode, hold and meal checks, `input.update`, `handleKeys`, the post-key mode check, the sub-step loop (breaking if `G.seamHold` or the mode changes), per-frame HUD writes, and `stepEnv`. Leave `syncModal()`, the dt clamp and `render` in `frame`, and keep the smoke_walls regex text verbatim. `step(dt)` becomes `advance(dt)`. economy's `pulse` splits into `economy.tick(dt)` (feats, famous claims), called in `tick` after `updateMission`, and `economy.prompt()`, called once per frame in `advance`. Delete economy.js:669-683.

**Risk.** Moderate. Browser checks that call `a.step(.1)` will now sub-step (6 × 1/60) instead of doing one 0.1 s tick. That is closer to the real game, but a check tuned to the old behaviour could change result. Re-run all of tools/*.html that call `a.step` (listed in section 3's sources).

**Validation.**
- Smoke: `smoke_walls` (regex), `smoke_sectors`, `smoke_upgrades`, `smoke_jumps`.
- Browser:
  - first-drive-check, principale-check, life-check, fortier-check, repair-review (it asserts `timeFrozen` while paused);
  - `AYLMER.step()` during a seam hold must not move `G.time`.

### E5. Overlay ownership: shops use the same door as pause, map and modes
**Harm removed:** F4 (Escape opens pause, sim runs under a shop, E leaks to missions, K/U over cinema).

**Seam.**
- Add `mecano`, `volkov`, `kijiji` and `moment` to ui.js `MODALS`.
- economy's `openShop`/`openVolkov`/`openKijiji`/`showMoment` set `G.prevMode = G.mode; G.mode = 'shop'` and call `setModal`.
- The close functions restore `G.mode` and call `G.input.consume('Escape','KeyE','Enter','Space')`. This is modes.js's pattern, lines 465-475.
- Delete the rolling auto-close (economy.js:605-615), which exists only because the sim ran.
- The economy keydown gate (696) also checks `!G.cinema?.active`.

**Risk.** Low-moderate. With the sim held under a shop, the "car starts rolling" close disappears. That is a design change, so **confirm with the owner.**

**Validation.** `smoke_upgrades`, `smoke_ui`, `smoke_shell` (the modal door assertions at smoke_shell.mjs:100-110). Browser: the F4 repro; open the shop mid-timed-job and check `m.timeLeft` does not change across 60 `step()`s.

### E6. `resetRun(G, save)` in `src/game/run.js`
**Harm removed:** F7 (stale `mealShift`, `offer`, `lastDone`, `repairHints` and `repair.key` across sessions; the double `G.done`, double `garage.restore` and dead day/fuel writes).

**Seam.** Everything in `enterDrive` 956-1057 that sets a G field from `save` or a default, as one function listing every per-run field. `enterDrive` keeps the Vehicle and world placement, the HUD and audio start, and the story. Delete 995, 1009 and 1004-1008 (restoreSummer and initFuel own those). Delete the G literal's first two `stats:` keys (184, 212).

**Risk.** Low. `garage.setProgress(G.done)` must run after the single `G.done` assignment.

**Validation.** `smoke_save`, `smoke_spine`, `smoke_start`, `smoke_arc` (smoke_arc.mjs:129 relies on "a new game hands main.js a brand-new Set"). Browser: load slot A, then B, then a new game, and compare `G.done`, `G.garage.done`, `G.day` and `G.fuel` against each save.

### E7. Clock strategy → `src/game/clock.js`
**Harm removed:** 18 `VISUAL_PROTOTYPE` branches; two prototype flags (main 12 vs save.js:499 `isPrototype`); the duplicated `600`; `setEnv` silently doing nothing in the prototype.

**Seam.** `DAY_NIGHT_CYCLE`, `DAY_KEYS`, `DAY_WEIGHT`, `DAY_PHASE`, `DAY_HOLD`, `phaseClock`, `cloneEnv`, `cycleEnv`, `setEnv`, `setCycleEnv`, `updateDayNight`, `stepEnv` and `endOfJob`'s day spend become `createClock({ prototype, weather, calendar })` with `jobClock` and `summerClock` variants. save.js gets the cycle and the flag from `opts`.

**Risk.** Moderate, because smoke_shell pins `phaseClock`, `DAY_HOLD` and `G.dayClock = phaseClock(savedTime)` in main.js text. Update smoke_shell.mjs:188-212 to read clock.js in the same commit.

**Validation.** `smoke_shell`, `smoke_prototype`, `smoke_prototype_calendar`, `check-prototype.mjs`, `smoke_spine`. Browser: `AYLMER.env('night')` on index.html; `AYLMER.visualClock(19.5)` on prototype.html; save and load keep the hour in both.

### E8. Hold/release world, and `toMenu` stops reusing `pause(false)`
**Harm removed:** F8. Seam: `pause`, `toMenu`, `openMap`, `pauseOnFocusLoss`, and the 8 "silence the car" copies become `silenceCar()`. Risk: low. Validation: `smoke_radio_resume`, `smoke_recorded_radio`, `smoke_audio`; browser tools/integration-audio-game.html, plus map open + tab hidden → radio off.

### E9 and E10. Size-only moves (do last)
Save/load UI (2654-2765) → `src/game/savescreen.js`. Start picker and menu (334-790) → `src/game/menu.js`. These remove no failure mode. smoke_start, smoke_shell and smoke_firstjob pin `START_POINTS`, `START_UNLOCKS`, `DEFAULT_START` and picker lines in main.js text, so those suites must be repointed.

---

## 5. Dead code (with proof only)

| Item | Proof | Action |
|---|---|---|
| `G.introUntil` hold | Every write is `= 0` (205, 1405, 1445, 1499, 1642, 2882). No module writes it (`grep -rn introUntil src tools`: only principale-check.html:11, which also sets 0). So the guard at 1586 is always false. | Delete the field, the 6 writes and the 1586 guard. Drop `a.G.introUntil=0` from principale-check.html. |
| `introCard` / `IntroCard` | `introCard.show` is never called. Only `.hide()` (1500, 2883). The class is ui.js:416, and the `#intro` DOM is in index.html:146 and prototype.html:147. | Delete the instance and calls. Removing the class, the DOM and the `['intro','intro']` MODALS row needs a smoke_ui/smoke_shell check first (medium confidence). |
| `G.near` | Written at 1529. No reader anywhere in `src/` or `tools/`. | Delete. |
| imports `routeLength` (33), `DRIVER_CAM` (116) | Not referenced in main.js (checked in node). | Delete from the import lists. |
| G literal `stats` keys at 184 and 212 | Duplicate keys: the object literal keeps only 226. `enterDrive` then replaces it (1000). | Delete 184 and 212. |
| second `G.done` (995), second `garage.restore` (1009), `G.day/fuel/target/summerOver/reached` at 1004-1008, `G.carId` at 805/807 | Overwritten unconditionally later in the same call (961/1039/1046/950-966). | Delete (E6). |
| economy `onClose: () => {}` (594) | A no-op callback. | Optional. |

Not dead, despite looking it:
- save.js `homeParked`/`homeSpot`: used by `normalizeSave` (save.js:300) and 4 smoke suites.
- All the unreachable lab modules (`*_lab.js`, `houses_demo.js`, `models.js`, `ottawa_hero_rings.js`, `core/audition.js`, `prototype/glenwood-review.js`, `renderer.js`, `siding.js`): each is referenced from an HTML page, a tools/ script or the prototype import map.
- The `window.AYLMER` members with no in-repo caller (`quickSave`, `freeRoam`, `openModes`, `resetJumps`): they are console conveniences. Keep them unless the owner says otherwise.

---

## 6. Baseline

`node tools/run_smoke.mjs` on `46e6eca`, 29 Sep 2026: **58/59 suites passed**. The failure was
`smoke_react.mjs` (47 passed, 1 failed). Running it alone straight afterwards gave 48 passed, 0 failed,
so treat it as flaky. Run it twice before blaming an extraction. Every extraction above should leave
59/59 green, plus `node tools/check-prototype.mjs`.
