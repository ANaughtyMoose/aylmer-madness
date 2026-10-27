# W6-SHORTCUTS report (wave 7, 27 Oct)

Branch rf/w6-shortcuts, worktree wt-rf-w6-shortcuts. Wave 6 stopped at b6f5ec9 (data and tracker only). Wave 7 merged fix/look-on-qr twice (786acf4, then the head with races, medals, records, ghost and cop escape; both merges clean, no conflict in main.js).

## What changed (wave 7)
- **Live in the game (main.js, blocks marked `[w6-shortcuts]`, 5 lines):** `import * as shortcuts`; in `tick()` right after `flavour.update`, `shortcuts.tick(G, dt, v)` and `hud.toast(sc.text, 2600)` on a find; the pause `jobshint` line gets « Raccourcis n/4 » (« Shortcuts n/4 » in English); `mapState()` passes `shortcuts: shortcuts.mapLines(G)`; `window.AYLMER.shortcuts()` returns the metric bag.
- **The toast:** « Raccourci trouvé! 2/4 » plus the cut's name on a second line, narrator text (English: "Shortcut found! 2/4", the name stays French). Once per cut per summer.
- **Saved through save.js:** found ids go to `G.stats.shortcuts = { v: 1, found: [...] }`, which save.js snapshots and restores with the summer (no save.js edit needed; `getExtra`/`setExtra` are used instead when save.js grows them). Restored whenever `G.stats` is a new object (load, new summer), unknown ids dropped. Lost on a quit without saving, like money.
- **On the map:** bigmap.js draws every found cut as a dashed orange line with a dark outline, and its name above the middle once zoomed in (z > 0.3). Unfound cuts are not shown. Only the big map; the minimap is unchanged.
- **The church cut (Tom 14 Oct), the 4th, ships as a real shortcut, not a fun route:** `sc_eglise`, « En arrière de l’église », the lot of the church St. Mark on the north side of rue Principale, the church nearest the friends' street. From avenue Frank-Robinson along the church lane, across the back of the lot and out at the end of rue Valencia. The GPS goes round by Frank-Robinson, du Barsac and Valencia (511 m). Cut 177 m. Margin 21.3 s at 50 km/h with the grass penalty; the pace car does the road in 28.3 s and the cut in 10.4 s. Nearest building to the off-street part 7.8 m. The earlier Saint-Paul probe (rear lot, 0.8 to 3.2 s) was the wrong church: it is 680 m from that street.
- **Arena cut moved round the gravel pile:** the old line ran 1.5 m from `arenaPile` (a 2.4 m gravel mound); one vertex added and the middle pass point and seal moved 4 m, now 5.5 m clear. Margin 19.7 s.
- **Optional hooks, live when their tasks merge:** registration through `MODES.registerMode` (C-02a) for the Checkpoint gate pairs and the Blitz `noGpsBonus` 0.06, and `breakables.seal`/`onUnseal` (V4-03) for the sawhorses. Neither exists on this head, so `debug().registered` is false and nothing is sealed; both are called through optional checks and a try/catch, so the boot cannot fail on them.
- Teleport guard: a jump of more than 30 m between two 10 Hz samples resets the trackers, so a teleport or a respawn across a cut never counts.
- `docs/qa/rf/C-06.places.json`: 59 points (every vertex, pass point, seal and gate end of the 4 cuts, labelled by cut and role). `node tools/qa/public-place.mjs --task=C-06`: **all 59 public**.

## Frozen numbers (Colab VM, 27 Oct)
| cut | road m | cut m | margin at 50 km/h | pace car road | pace car cut | gate |
|---|---|---|---|---|---|---|
| sc_galeries | 787 | 559 | 7.2 s | 38.1 s | 39.7 s | no (see below) |
| sc_arena | 633 | 306 | 19.7 s | 38.1 s | 17.1 s | cp_sc_arena |
| sc_piste | 988 | 196 | 54.6 s | 48.2 s | 11.6 s | cp_sc_piste |
| sc_eglise | 511 | 177 | 21.3 s | 28.3 s | 10.4 s | cp_sc_eglise |

Galeries road grew from 762 to 787 m since the spec (map or nav change on the head; within the 5 % drift check).

## Tests
`tools/smoke_shortcuts.mjs` rewritten, 75/75 green on the Colab VM (run by name). Groups: 1 data real and public (ends on streets, 3 m from buildings, 4 m from raised pads and mounds, no water, no number or name in text), 2 each beats the road by 4 s at 50 km/h, 3 the pace car (Rival, SKILL.pace, real road bake) on the road and on the cut, frozen pace within 8 %, gold reachable through the cut, 5 found once either way and never on the GPS road, cancels, 150 km/h, 120 Hz, teleport, English toast, 6 seal only what is not found (stub), 7 save round trip, 11 cost (10k ticks 1.3 ms, cap 5).

Full suite on the Colab VM (0fd951a): 107/111. The 3 VM-only failures (smoke_audio, smoke_harness_gate, smoke_models) count as green. smoke_shortcuts showed 75 ok and 0 failures but was marked failed, because run_smoke.mjs flags any output containing the word FAIL and the summary line read "0 FAIL". The summary line now says FAIL only on a failure (370b708), and smoke_shortcuts reran on its own GREEN, 75/75. I did not run the full suite a third time (the brief allows two, and an earlier run lost its VM connection before any test ran). The only change since the full run is that console line, so the expected full result is 108/111 with the 3 VM-only failures. The lead should confirm this in their next full run.

## Decisions for the lead (and Tom)
1. **Galeries is a shortcut but not a gate.** At 50 km/h it saves 7.2 s, but the pace car is faster on the road (38.1 s) than through the lot (39.7 s): the lot is grass to the driving model and the line bends 8 times. A gate pair whose gold comes from the road pace could not be won through the cut, so `gate: false` keeps it out of `gateDefs()`. It still counts, toasts and shows on the map. If the lot gets a `track` or asphalt surface (terrain.js, not mine), flip it back.
2. Spec deviation in group 1: flat pads (`H` 0) are not counted as obstacles. `canadianTireLot` is a flat asphalt pad that is the Galeries lot itself; the rule is there to keep cuts off ramps and mounds (mallDock, arenaPile), which it still does.
3. bigmap.js and main.js are outside C-06's owned list; both edits are what the goal asked for (shown on the map, toast and counter live) and are marked `[w6-shortcuts]`.
4. The church: Tom said "near [his friend's] on Principale a bit". The church nearest that house and on Principale is St. Mark (190 m away, 40 m off Principale). The name in the game is the church's public name only; no friend is named in code or text. If Tom meant another church, the row changes, nothing else.

## Not done (out of this task's goal)
- nav.js `setRouteVisible`/`routeVisible` (Sans GPS) and its smoke group 8, the no-GPS medal group 9: need C-09b's wiring and C-02a's `medalFor`.
- flavour.js hiding the 13 dormant achievements (group 10).
- Gate registration (group 4) waits for C-02a's `registerMode` on the head; the call is already in shortcuts.js.
- Sawhorses wait for V4-03's `breakables.seal`.
- `tools/review/beats/C-06.mjs` (browser beat).

## Cloud checks for the lead
- Boot both entries: `node tools/qa/boot.mjs --entries=index,prototype`: 0 console errors, truck moves >= 10 m in 10 s (shortcuts.js is now imported by main.js and imports modes.js, save.js and breakables.js).
- In a browser: teleport to `sc_eglise.from` (-415,-27, a 1.667) with `window.AYLMER.teleport`, drive the cut to the end of rue Valencia: one toast « Raccourci trouvé! 1/4 / En arrière de l’église »; `window.AYLMER.shortcuts().found` has `sc_eglise`; open the big map (Tab): dashed orange line behind the church; pause: « Raccourcis 1/4 »; save, reload, load: still 1/4 and the line still drawn; drive it again: no toast.
- Drive the arena cut in a real truck once to feel the gravel pile is clear.
- perf8 is not needed for this change (no draw in the world, map drawing only while the map is open, no per-frame allocation in `tick`), but it runs in every 60 fps check anyway.
