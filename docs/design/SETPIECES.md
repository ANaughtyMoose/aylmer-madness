# Set pieces: missions 6-9

Branch qr/setpieces. One module per mission under `src/game/setpieces/`; tests are `tools/smoke_sp_*.mjs` (picked up by `tools/run_smoke.mjs`).

## Exports for the restructure

- `golfcart`: `golfnuit` in `setpieces/golfnuit.js` (tuning table: `GOLFNUIT`), reached through `GOLF_MISSIONS` in `golfjob.js`.
- `stvincent`: `STVINCENT_MISSION` in `setpieces/sauna.js`, in `LIFE_MISSIONS`.
- `nuittim`: `NUITTIM_MISSION` in `setpieces/nuittim.js`. It is in `MISSIONS` and `ALL_MISSIONS` but NOT in `CAMPAIGN` yet: the restructure decides its place.
- `school`, `russellroyal`: `SCHOOL_MISSION` and `RUSSELL_MISSION` in `setpieces/royal.js` (school in CORE_MISSIONS, russellroyal in LIFE_MISSIONS).
- Shared cart kit: `setpieces/cartkit.js` (runtime ramps, checkpoint chains, airtime, cart swap, governor push).

# Mission 6: N'importe quelle petite clé (id `golfcart`)

Rewritten 6 Oct 2026 to Tom's account: "Sayyad started it, drove it around with Tom, the owners of the course came out and chased us, we had a brief high-speed golf cart chase, went back to our bikes, then biked away and hopped a fence." Same id, same export (`GOLF_MISSIONS` from `src/game/golfjob.js`), same giver (`golf`), night.

## Files
- `src/game/setpieces/golfnuit.js` - mission def `golfnuit`, tuning `GOLFNUIT`, course data (`COURSE`, `TEE`, `SAYYAD_PATH`, `JOYRIDE`, `CHASE`, `FENCE`), pure `tryKey`, `sayyadSteer`, `fenceStep`, `courseRamps`/`allRamps`, `jumpBonus`, `bikeOut`, the line tables (`SAYYAD`, `SAY_JUMP`, `OWNERS_*`).
- `src/game/setpieces/cartkit.js` - the shared cart kit (unchanged).
- `src/game/bikes.js` - `topUpLegs(min)`: the fence stage keeps a hop in your legs (adrenaline). bikes.js is loaded lazily from golfnuit.js, because importing it registers the bicycles into CARS.
- Reuses `royal_mech.js` `chaseStep` (with its own numbers, `CHASE_K`), `royal_fx.js` for the gap tag, and `verbs.js` `spawnRival` for the owners' cart.
- Tests: `tools/smoke_sp_golfnuit.mjs`, `tools/smoke_cart.mjs` section 3, `tools/smoke_canon.mjs` (« Tom's true beats »).

## Stages (in a car: 12; on a bike already: 11)
1. **velo** - in the club lot, stopped, E: the bikes come out of the truck (`bikeOut` picks a clear spot). The truck stays in the lot. Skipped if you came on a bike.
2. **keys** - the cart waits at the first tee (`TEE`, east of the clubhouse; `G.parked.cart` is moved there and goes back to the apron at cleanup). Stopped next to it, E hands Sayyad a key; he tries it. The third (glovebox) works and you are in the cart, the bike parked where you stood.
3. **sayyad** - Sayyad drives the first stretch (`sayyadSteer` overrides the pedals after the physics step, ~10 s down `SAYYAD_PATH`), then hands over.
4. **cp1..cp3** - Tom's joyride down the west fairway, a kicker before each flag, governor at 34 km/h, jump yells.
5. **chase1..chase4, bikes** - the clubhouse lights come on; the owners (« Le proprio », French) come after you in their own cart with flashlights. One 100 s clock over four flags and the run back to the bikes. The gap is `chaseStep` (owners at 28 km/h, never more than 55 m back); a near-catch costs 6 s, never the job. Their cart (a `spawnRival` cart) is kept on your tail; Shift looks back at it. At the bikes, stopped, E: the cart stays, keys in it.
6. **fence** - pedal to the fence on the rue du Golf side (a runtime prop, `buildFenceMesh`) and press Espace a few metres before it. `fenceStep` gives the hop enough air to clear the wire at your speed; riding into it bounces you back. Over and down: the job ends. Pay is the jump bonus only.

A bot run in headless Chrome (6 Oct): the chase plus the run to the bikes took 78-80 s of the 100; the whole night is about 3 minutes. Screenshots: `references/review/story-beats/golf-*.jpg`.

Cleanup (success, fail, Backspace): ramps, lights, fence and the owners' cart removed; back on your bike if you are next to it; the cart goes home to the apron unless you are still in it.

## Known limits
- The owners are a gap plus a rival cart; nobody gets out on foot. Their flashlights are words, not light.
- jumps.js's own stunt toasts (« CROCHE », « la transmission... ») still fire on the cart's landings, as they did before. The landing damage itself is refunded.
- The scripted Sayyad stretch overrides your pedals but the camera is yours.

# Mission 7: « Le sauna de cèdre » (id `stvincent`)

Real (STORY-LEDGER): the heat wave. Tom and Sayyad put a cedar plank from Sayyad's fence on the Ranger's dash and poured water on it on the way to St. Vincent (Cambridge St N, Ottawa) for Tom's job. Sayyad came along and waits in the truck during the shift (canon 28 Sept).

## Files and exports
- `src/game/setpieces/sauna.js`: `STVINCENT_MISSION` (id `stvincent`, giver `home`, day), `stopHeat(G)`. Imported by `lifejobs.js` (unchanged).
- `src/game/setpieces/sauna_heat.js`: the mechanic. Pure: `newHeat()`, `heatStep(state, dt, {speedKmh, traffic, shade})`, `pour(state)`, `refill(state)`, `overheated(state)`, `trafficNear(cars, x, z)`, `nearestRefill(resolve, x, z)`, `fxLook(heat, over)`. DOM: `openSaunaFx()` (canvas effect + meter + steam), `listenPour(fn)` (window keydown for F). All tuning constants exported at the top.
- `tools/smoke_sp_sauna.mjs`: 63 checks. `tools/smoke_vehicle_life.mjs` now finds the meal stage by `kind === 'meal'` instead of `build()[1]`.

## Stages
1. `plank`: at `sayyad` (75 Denise-Friend), radius 16, stop + E. Toast: plank on the dash, Sayyad line. `passengers: 1`.
2. `heat`: drive to `stvincent`, finish circle radius 40 (the lot). The heat runs (below). Prompt shows F when hot, the nearest dépanneur and its distance when the jug is empty, « E - remplir la cruche » when stopped at one.
3. `enter`: at `stvincent`, radius 22, stop + E. The cab cools in the shade (meter falls); the effect is removed on exit.
4. `meal`: the existing `openMealShift()` minigame, unchanged and gentle. Pays 40 $.

## Heat mechanic
- Meter 0..1. `HEAT_BASE` 1/240 per s at or above 15 km/h, `HEAT_SLOW` 1/70 per s under it, plus `HEAT_TRAFFIC` 1/300 per traffic car within 25 m (max 3, read from `G.traffic.cars`).
- F pours: meter minus `POUR_DROP` 0.4, jug of `JUG_MAX` 4, 1.2 s cooldown. Steam puff over the dash area and a Sayyad line.
- Refill: stop (under 6 km/h) within 32 m of a `REFILL_SPOTS` place and press E: `dep` (Palmyra, next to Sayyad's), `mcdo` (chemin d'Aylmer), `hulldowntown`. These are not on the GPS line; the prompt names the nearest with its distance.
- At max: truck capped near 55 km/h (vLong damped), meter pulses red, blur jumps. After `OVERHEAT_GRACE` 25 s pinned at max (time below max pays it back at 2x), the job fails: « Coup de chaleur. Sayyad te fait arrêter à l'ombre. La job attendra. »
- Screen: CSS on `#gl` (fallback first `canvas`): blur (0 until 30 % heat, about 3.2 px at max, more when overheating), sepia/saturate/brightness, and a skew/scale wobble keyframe driven by `--sauna-amp`. An overlay div inserted right after the canvas (under `#hud`) adds an orange glow and moving shimmer bands. Meter `#saunaMeter` at left 20 px, bottom 232 px (above the minimap): « Chaleur NN % », bar, « Cruche: 3/4 · F pour verser ». All of it restored/removed by `stopHeat` (stage 3 exit, meal enter, mission `cleanup`).

## Key
F (`KeyF`) is bound nowhere in main.js or core/input.js, so the mission owns it with its own window listener while stages 2-3 run. E for refills is `G.wantStart`, read in `onTick`.

## arcsurchauffe relation (coordinate by id only)
`arcsurchauffe` (arc.js, « La surchauffe du pont », gated `after: 'arcbache'`, fromDay 14 = 10 juillet) is the heat-wave setup: the couch, the Champlain bridge, the radiator hose. Suggest: `arcsurchauffe` first (the canicule arrives, the Ranger overheats), `stvincent` right after it as the payoff of the same week (now the people overheat, and the fix is a plank and a jug). If the restructure gates missions, give `stvincent` `after: 'arcsurchauffe'`. They share no code.

## Known limits / for the restructure agent
- story.js `FRIEND_LINES.stvincent` start lines (Tom parks, Sayyad « I'll be asleep ») predate the plank; they still read fine but could mention the cedar. Not my file.
- Refill spots are real PLACES keys, not true dépanneurs in Hull; `hulldowntown` is Place du Portage.
- Heat does not tick while paused (onTick does not run); the CSS wobble keeps animating under a pause menu.
- Tuning is estimated for a roughly 10-minute drive; needs a playtest.
- Mission is written for the Ranger (toast uses `ctx.carName`); in another car it still works.


# Mission 8: La nuit du Tim (id `nuittim`)

Files: `src/game/setpieces/nuittim.js` (exports `NUITTIM_MISSION`, plus pure helpers), `src/game/setpieces/nuittim_fx.js` (screen effects, `createNuitFx`, `FX`), test `tools/smoke_sp_nuittim.mjs` (110 checks).
Giver: `mike` (129 Frank-Robinson). timeOfDay: `night`. Pay: none (a bag of yesterday's muffins).

Tom's framing: funny in hindsight AND serious. Sam is black-out drunk; Tom, Sayyad and Mike are not drinking (Tom never drank). No Margaret anywhere in this mission (Tom's 29 Sept ruling). Nobody mocks Sam.

## Stages

1. **arrive** - Chez Mike, 129 Frank-Robinson. GPS, stop, E to call the Centre antipoison.
2. **call** - six short phone lines (calm, practical: on his side, check his breathing, 911 if he stops responding). One line every 2.6 s, E skips ahead. Truck frozen.
3. **watch** - clock card top-centre runs 23 h 40 to 3 h 10 over 26 s, only while the truck is stopped. E checks on Sam (a calm line each time). Five scheduled lines from Mike, Sayyad, Tom. No fail. On exit Sayyad gets in (passengers +1): "J'ai faim, man. Le Tim?"
4. **tim** - GPS to the Tim Hortons on Principale (`tims`). TODO radio: "My Immortal" is NOT in the private radio library; comment left, no file.
5. **bag** - stop behind, E to take the bag of old muffins and doughnuts the friends who work there leave out back.
6. **stranger** - "T'aurais-tu un beigne?" E to give one ("Ben oui. Tiens."), 0.45 s later a full-screen black div goes up in one frame (no fade) and holds 2.2 s. Truck frozen. Audio not muted (see limits).
7. **walk** - dazed walk toward 299 Fraser: speed clamped to 11 km/h, heading drifts by itself (`dazeSteer`), player fights it with A/D. Double vision + vignette on the canvas. A red tag, right side: "Le gars: NN m derrière" (the stranger following; closes when you stop, falls back when you walk, never catches up). Sayyad's seven lines, one every 24 m walked: the garage-sale sign, the wooden stake, "Toé, le piquet, lui. Fini." / Tom: "Non, Sayyad." / "Ok ok. Mais c'est un bon piquet." Done after 170 m and all lines.
8. **school** - "Un gars de l'école" (unnamed): "Heille, t'es Tom? Viens, j'te ramène." After 4.5 s (or E after 1 s) Tom is placed 150 m short of 299 Fraser along the nav route (`handOff`, uses `G.nav.route` + `v.reset`). Sayyad goes home (passengers -1). The stranger stops following.
9. **home** - last metres alone, lighter daze, stop at 299 Fraser. All effects torn down on exit. The stage toast is the closing line, which main.js puts on the JOB TERMINÉE card: **« Sayyad maintient encore que le piquet aurait marché. »** (Tom picked option A, 29 Sept; final).

## Decisions

- **Start at Mike's** (PROPOSAL, TOM TO CONFIRM whose place): a friend's house, not 299 Fraser (Margaret is there, and she is ruled out); Mike naturally stays with Sam; about 600 m from the Tim so the drive is short and the weight sits on the watch and the walk.
- **On foot:** the game has no on-foot player (peds.js is ambient only). Most feasible faithful version: player keeps control at a clamped walking pace with steering drift. Applied in onTick after physics (main.js runs `updateMission` after `v.update`): rotates `v.yaw` and `v.vx/v.vz` together (drift, not skid) and scales velocity to the cap.
- **Double vision:** gl.js does not use `preserveDrawingBuffer`, so a drawImage copy of the WebGL canvas is unreliable. Instead an inline SVG filter (`#nuittim-dv`: blur, offset copy at 50% alpha, merged) applied as `canvas#gl { filter: url(#nuittim-dv) }`, offset swimming each tick. Fallback `FX.mode = 'css'`: CSS blur + slight scale/rotate sway.
- **Stranger following:** no hookable ped/avatar spawn without editing main.js render, so it is lines + an on-screen distance tag (no map dot).
- **Walk compressed:** the Tim to 299 Fraser is ~1.3 km; at walking pace that is 7+ minutes. The gars de l'école "most of the way" is a hand-off teleport instead.

## Tuning (`TUNE` at the top of nuittim.js; `FX` in nuittim_fx.js)

lineGap 2.6 s; watchSeconds 26; watchFrom/watchTo 23 h 40 / 3 h 10; blackHold 2.2 s; walkKmh 11; walkMeters 170; driftRadS 0.55; dazeFade 70 s; dazeFloor 0.45; schoolLevel 0.35; handoffMeters 150; schoolCard 4.5 s; followNear/Far 22/60 m; stakeEvery 24 m. FX: mode 'svg'|'css', maxBlurPx 2.2, maxGhostPx 16, ghostAlpha 0.5, vignette 0.75.

## Exports

`NUITTIM_MISSION`, `TUNE`, `clockText`, `watchInit`, `watchStep(state, dt, {check, moving})`, `dazeInit`, `dazeSteer(state, dt, {speedKmh, floor})`, `followerStep(gap, dt, kmh)`, `pointBeforeEnd(path, m)`, `applyWalk(v, nudge, capKmh)`, `handOff(G)`, line tables (`CALL_LINES`, `WATCH_LINES`, `CHECK_LINES`, `WALK_LINES`, `SCHOOL_LINES`, `STRANGER_ASK`, `TOM_SURE`, `CLOSING`). fx: `createNuitFx()` -> `{clock, black, tag, daze, undaze, teardown}`, `FX`.

## Teardown

Mission `cleanup(G, m)` calls `m.nuitFx.teardown()`: removes every node it made and restores the canvas's own `filter`/`transform` exactly. Stage onExits also drop their own piece (clock, black, tag). Tested with a fake DOM: success, and abort during watch / stranger (mid-black) / walk / school.

## Known limits

- The "walk" is the truck at 11 km/h; the text says you are walking. The Ranger ends up at 299 Fraser, not left at the Tim.
- No audio mute on the cut: main.js keeps `audio` module-local (no G.audio). A hook would need a main.js edit.
- SVG filter on a full-screen WebGL canvas: needs a browser check for cost; flip `FX.mode = 'css'` if it drops frames.
- story.js's stuck detector may re-toast the watch hint while you sit still (you are supposed to).
- Suggested placement: after mission 7 (sauna), before 9 (royal): "the biggest laugh right after the darkest night". Gate: night hours only; not replay-paid (it pays nothing anyway).


# Mission 9, « 5 h 45 au Royal Ottawa » (school + russellroyal)

Files: `src/game/setpieces/royal.js` (SCHOOL_MISSION, RUSSELL_MISSION, course data), `royal_mech.js` (pure mechanics + ROYAL tuning), `royal_fx.js` (DOM tag, ski card, Space listener, canvas shake), `tools/smoke_sp_royal.mjs` (237 checks). No shared files edited. story.js FRIEND_LINES left as they were.

## school (morning)
One timed drive home -> `royalottawa`, 420 s, $20. Brief says « 5 h 32 » and « 5 h 45 ». First stage `at === 'royalottawa'`, so smoke_canon holds unchanged.

## russellroyal (day), 13 stages
1. **pickup**: at `royalottawa`, stop, E. Blocked on a bike or in the cart (Russell needs a seat home).
2. **chase1..6**: you are swapped into a cart at CART_SPOT (cartkit swapIntoCart; G.parked.cart is moved there first and the original Gatineau spot is saved in `m.cartHome`). Russell drives his own cart as a real race.js Rival (verbs.spawnRival 'cart', governed to 30 km/h) along the flags. The marshal is a gap (chaseStep): he closes at 21 km/h. A near-catch costs 6 s and is never an instant fail. There is one 150 s clock across all six flags (m.chaseLeft carried over). A kicker sits before every flag, and your cart is governed to 34 km/h.
3. **hill**: a runtime big hill (cartkit ramp driven backwards: 9 m high, 56 m steep face, 36 m wide). The marker goes to the top, then moves to the bottom. You need 2 s of screech (Espace held, or a slide of more than 2.6 m/s) on the way down. Holding Espace on the steep face adds a push down the hill (hillAssist), so the lever makes you screech instead of stalling. Reaching the bottom short on screech sends you back up; it does not fail. Russell's cart is removed at the end of this stage.
4. **string**: stop, then press E 5 times (stringStep). No marker.
5. **launch**: stop on the pad facing west and press E (the ball goes in), then hold W. It sputters for 1.4 s, then a push to 58 km/h runs until takeoff off a 1.4 m kicker (about 1.5 s of air in a cars.js test).
6. **ski**: skiStep. Tom swings on a 5.5 m rope, and a turn throws him outward. Carve points come from swinging wide at speed; 30 points finish the section (about 25 s of zigzag at 26 km/h). A hard turn at 30 km/h or more with a swing over 4.6 m is a fall (-3 points, 2.2 s down). A jump is worth +4. The DOM card at bottom-left shows a top-down cart, the rope, Tom and the score.
7. **back**: drive to your parked car, stop, E. You swap back, the cart returns to its Gatineau apron, and passengers +1 is set after the swap.
8. **home**: drive to `home`. Russell's 11-line English rant plays every 5.5 s. At home: passengers -1, $15 (`K.gas`; was $14, raised to fit the campaign pay band, Tom can ask for $14 back), and the toast says it does not cover the gas.

Cleanup (on success, fail or Backspace) removes the ramps, Russell's rival, the overlays, the Space listener and the shake. If you are within 25 m of your car you are put back in it, and the cart goes home. Farther away, you stay in the cart and your car stays parked (same contract as golfnuit).

## Tuning
The knobs are in `ROYAL` (royal_mech.js) and `K` (royal.js). Course points are exported constants; the smoke test checks each one is inside the club polygon, not in water or woods, and more than 25 m from any building.

## Known limits (unverified without a browser)
- The pickup pillar resolves to the road/lot spot (5395, -2502) in Node; CART_SPOT is 43 m from it. Check in game that the real lot snap is close.
- Russell's Rival cart on grass and ramps is untested in the real loop (updateRivals). If he gets stuck, race.js unsticks him.
- The hill has vertical side walls in physics (rampAt stops at its width). Climb from the east.
- The skier is drawn in the DOM card only, not in the 3D world.
- On the flat test ground the hill run tops out around 30 km/h.

## Playtest
`AYLMER.start('school')`, then drive to the pillar. `AYLMER.start('russellroyal')`, drive to the Royal Ottawa, then E. Chase: W plus A/D over the kickers. Hill: climb from the east, hold Espace going down. Stop, then E x5. On the pad facing west: E, then hold W. Ski: zigzag with A/D around 25 km/h. Drive back to your car, then E. Drive home, then E. Try Backspace in each stage.

## Status / next steps (29 Sept, end of session)

Done
- All four missions are built as self-contained modules with Node tests: smoke_sp_golfnuit, smoke_sp_sauna, smoke_sp_nuittim, smoke_sp_royal. canon, cart, story, spine, econ, missionclose, vehicle_life, jumps and driving all pass.
- Golf night (golfcart) was played end to end in headless Chrome on index.html: key 3 works, ramps give about 1.5 s of air, the lights come on, the escape works, and Backspace cleans up. Five browser fixes are in golfnuit.js.
- Sauna (stvincent) was partly played on index.html: the plank, the heat blur, and F pouring water with a steam puff all work.
- Screenshots: docs/design/shots/setpiece-golf-{keys,jump,lights}.jpg, setpiece-sauna-{heat,steam}.jpg.

Not done
- Nuit du Tim (nuittim) and Royal Ottawa (school, russellroyal) have never been run in a browser. Neither has any mission on prototype.html.
- Not verified in a browser: the sauna refill, enter, meal and abort cleanup.
- Missing screenshots: sauna meal, the four Tim shots, and the Royal set pieces.
- The full `npm test` run was not done this session. The suites listed above were run one by one.
- nuittim is outside CAMPAIGN. The restructure has to place it and gate it (the current test counts assume +1 job).

Known issues and likely breakage
- save.js `homeParked` uses `apronSpot(PLACES.golf)` at the default 12 m, which is inside the clubhouse. It should be about 24 m. This is a shared file and was not changed.
- The sauna steam puff is too faint. Make `.saunaPuff` about 200px and whiter. The wobble keeps running under the pause menu.
- Nuit du Tim: the SVG ghost filter on the full-screen canvas may cost frames (fallback: `FX.mode = 'css'`). There is no audio mute on the punch. The "walk" is the Ranger clamped to 11 km/h. The stuck detector may repeat the watch hint.
- Royal: the hill has vertical side walls in the physics, so it must be climbed from the east. The skier is shown only in the DOM card. The pickup pillar and cart spawn are unverified.
- Canon questions for Tom: is the Club de Golf Gatineau the course between the Loblaws and the cemetery? Was Sam's night at Mike's? The closing card is settled (Tom, 29 Sept: « Sayyad maintient encore que le piquet aurait marché. »).
- The first E after a teleport was sometimes ignored in the headless harness. The cause is unknown.
