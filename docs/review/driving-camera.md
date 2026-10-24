# Driving and camera review - 29 Sep 2026

Branch `claude/quality-review-2026-09-29`. Read-only wave: nothing in `src/` was edited.
Evidence comes from reading the code, the existing smoke suites, and throwaway Node probes
in `/private/tmp/claude-501/` (`probe_*.mjs`). No browser was used, so every visual claim
is marked as needing the lead's browser check.

Existing suites, all green on this branch: smoke_driving 126/0, smoke_feel 30/0,
smoke_camclip 37/0, smoke_vehicles 203/0, smoke_vehicle_spec_layers PASS, smoke_jumps 74/0,
smoke_tow 38/0, smoke_upgrades 234/0, smoke_repair 53/0, smoke_cockpit 122/0,
smoke_street_surface PASS.

---

## A. Proven bugs

### A1 - MAJOR - The 8 m/s² direction-change brake floor cancels the wet-road brake penalty, the brake skill and most brake upgrades

**What happens now.** Holding S while rolling forward never uses the pedal branch. `want = -1`
and `rolling = +1`, so the code takes the `flip` branch, which brakes at
`Math.max(s.brake, DIR_BRAKE)`, with `DIR_BRAKE = 8.0`
(`src/game/cars.js:1998`, `:2203`, `:2208`). The graded pedal branch (`:2245`) only runs
when you hold W and S together. Weather (`weather.js:289`, WET_BRAKE 0.20), skills
(`skills.js:81`) and the Freins upgrade (`upgrades.js:223`) all scale `spec.brake`. Wherever
the scaled value ends up below 8, the floor wins and the scaling does nothing.

**What should happen.** Rain should lengthen stopping distances; the header in `weather.js`
says "Stopping distance is where wet roads bite hardest". Brakes you pay for should
shorten them.

**Reproduction.** `node /private/tmp/claude-501/probe_brake.mjs`. It runs upgrades.js
`brakeDist()`, which stops from 100 km/h on the pedal:

```
ranger     brake 8   dist freins0/1/2 45.5/40.2/36.0  wet 45.5   <- rain does nothing to the hero truck
civic      brake 9.6 dist freins0/1/2 38.4/33.8/30.2  wet 45.7   <- every wet car collapses onto the ~45.7 m floor
bus        brake 6   dist freins0/1/2 38.9/38.9/38.9  wet 38.9   <- $180 + $455 of brakes, zero effect
schoolbus  brake 6.2 dist 36.8/36.8/36.8
cart       brake 4.5 dist 2.6/2.6/2.6
benz       brake 7.2 dist 45.7/44.6/39.9                        <- level 1 is nearly worthless
cutlass/caravan/tempo (7.6-7.8): stock = floor, level 1 barely moves
```

`probe_price.mjs` confirms the shop sells these: bus Freins costs $180 then $455, and
`canFit` returns ok.

**Confidence.** High.

**Proposed fix.** Scale the floor by the same multipliers as `brake`, so it keeps its arcade
purpose and the modifiers still apply. The cleanest way is for `finalizeCar()` to write an
own property `c.dirBrake = Math.max(c.brake, DIR_BRAKE)` on the stock sheet, filled in only
if it is absent, the way `defaults()` already works. Weather, skills and upgrades then
multiply `dirBrake` wherever they multiply `brake`: add it to the Freins `mul` rows, to
`weather.specFor` and to `skills.specFor`. Vehicle reads
`s.dirBrake ?? Math.max(s.brake, DIR_BRAKE)`. Do not compute it as "brake / stock brake" in
`finalizeCar`. `tuned()` re-runs `finalizeCar` on the derived sheet, so that ratio would
come out as 1.

**How to validate.**
- Rerun `probe_brake.mjs`. Expect wet distance > dry distance for every car, and a strictly
  falling distance across Freins 0/1/2 for every car.
- Add those two assertions to `smoke_upgrades.mjs` or `smoke_vehicle_spec_layers.mjs`.
- `smoke_driving.mjs` must still pass, because stock dry numbers do not change.

### A2 - MAJOR - Analogue brake (gamepad LT) is on/off: 7 % trigger = full braking

**What happens now.** The flip branch (`cars.js:2203`) ignores `ctl.brake`. Anything above
the 0.05 intent threshold (`:2159`, `want = ... ctl.brake > 0.05 ? -1`) brakes at full
force. `core/input.js:112` passes the trigger value straight through.

**What should happen.** A trigger should give graded braking, which is the point of D6
gamepad support.

**Reproduction.** `node /private/tmp/claude-501/probe_analog.mjs`:

```
ranger brake pedal 0.07 / 0.3 / 1.0 : 80->0 in 29.2 m, 2.63 s  (identical)
civic  brake pedal 0.07 / 0.3 / 1.0 : 80->0 in 24.6 m, 2.22 s  (identical)
```

**Confidence.** High.

**Proposed fix.** Multiply the flip deceleration by `ctl.brake` when it is used as a brake:
`a -= rolling * floorBrake * surface * ctl.brake` when `rolling > 0`, and by `ctl.throttle`
when `rolling < 0`. Keyboard input is 1.0, so keyboard feel is unchanged.

**How to validate.** Rerun the probe and expect distance to fall monotonically with pedal
value. `smoke_feel` and `smoke_driving` must stay green.

### A3 - MAJOR (needs browser confirmation of how bad it looks) - Hood cam trails 1.6-3.9 m behind its mount at speed

**What happens now.** The hood-cam target is 0.2 m behind the car's centre
(`main.js:2357-2359`, `CAMS.hood.dist = -0.2`). It is then fed through the same positional
low-pass as the chase cam: `G.camPos = lerp(..., 1-exp(-9*dt))` at `main.js:2377-2381`.
A first-order filter chasing a target moving at v sits v/9 metres behind it.

**What should happen.** The eye stays on the bonnet ("the hood cam sits on the bonnet",
`main.js:2366`).

**Reproduction.** The last three lines of `node /private/tmp/claude-501/probe_cam.mjs`,
which replicate the main.js arithmetic:

```
hood cam @50 km/h:  eye sits 1.63 m behind car centre (target 0.20)
hood cam @100 km/h: eye sits 3.06 m behind car centre (target 0.20)
hood cam @130 km/h: eye sits 3.92 m behind car centre (target 0.20)
```

At 100 km/h the eye is about at the Ranger's tailgate, 1.55 m up, looking forward over the
cab. The player car is drawn in hood cam (`main.js:2436`).

**Browser check for the lead.** Press C to get the hood cam, hold 100 km/h on the 148, and
screenshot.

**Confidence.** High on the maths, medium on the visual impact.

**Proposed fix.** For `cam.name === 'hood'`, compose the eye from the car's own position
every frame with no positional smoothing, the way the driver cam does. Keep the y
smoothing, or none at all. Keep the revBlend swing.

**How to validate.** Rerun the probe with the hood branch unsmoothed. Then run a browser
screenshot at 0, 50 and 130 km/h.

### A4 - MINOR - Engine upgrades on capped cars advertise top speed they cannot reach, and feed it to mission pacing

**What happens now.** `tuned()` re-applies `mul.topSpeed` after `finalizeCar()` has clamped
to `speedCap` (`upgrades.js:245-248`). The spec therefore says 149.5 km/h for a Moteur 3
Ranger, but the limiter holds it at 130 (`cars.js:2279`). The same happens to the SVX,
Si Civic and Firebird. `verbs.cruiseFor()` reads `baseSpec.topSpeed` (`verbs.js:71`), so
follow/chase leaders speed up for an upgrade that did not make you faster.

**Reproduction.** `node /private/tmp/claude-501/probe_ranger.mjs`:

```
ranger moteur 3 spec.topSpeed 149.5 cap 130 bench top 130.0
svx    moteur 3 spec.topSpeed 266.8 cap 232 bench top 232.0
```

The shop bench is honest (130 → 130). The spec field is not.

**Confidence.** High.

**Proposed fix.** `if (mul.topSpeed && out.topSpeed !== wasTop) out.topSpeed = Math.min(out.topSpeed * mul.topSpeed, out.speedCap ?? Infinity);`

Separately, decide whether the Ranger's 130 limiter should rise with the engine. That is a
design ruling for Tom: today Moteur 1-3 buys acceleration only (0-100 goes from 10.9 s to
7.8 s).

**How to validate.** Rerun the probe and expect spec top ≤ cap.

### A5 - MINOR - Dry tank: the engine note and the physics gearbox still rev under throttle

**What happens now.** `fuel.tickFuel` returns a sheet with `accel: 0` (`fuel.js:110`), so the
car coasts. The audio gearbox, however, is fed `ctl.throttle` regardless of fuel
(`main.js:2185-2188`), and so is the physics box on feel cars (`cars.js:2186`). Flooring W
with an empty tank sounds exactly like accelerating.

**What should happen.** A dead or stalled engine. At the least, no revving or load, so
"Panne sèche" is audible.

**Reproduction.** Read `main.js:2185`. `drivePedal` has no fuel term.

**Confidence.** High on the code path. The audible effect is untested (no browser).

**Proposed fix.** `const drivePedal = G.fuel <= 0 && fuel.hasTank(v.baseSpec) ? 0 : (...)`,
and optionally `audio.engine(0, 0)` for a stall. Pass the same 0 into the Vehicle's
`ctl.throttle` for the box only, not for the car's integration.

**How to validate.** Run `tools/integration-vehicle-audio.html` (browser, lead) with
`G.fuel = 0` and throttle held. Expect engine RMS at idle level.

### A6 - MINOR - Unowned car in a save: enterDrive falls back on `G.carId` after it has built the Vehicle

**What happens now.** `main.js:953-954` builds `G.veh` from `carById(G.carId)`. `main.js:966`
can then change `G.carId` to the character's car or the Ranger without rebuilding. After
that, economy's `retune()` (`economy.js:179-190`) puts the fallback car's sheet onto a
Vehicle built for the other car. The Vehicle's `box` belongs to the old car, `G.gearbox`
uses the old car's ratios (`main.js:977`), fuel comes from the old tank, and the spawn
position is the old car's.

**Reproduction.** Code order only. It needs a hand-edited save whose `carId` is not in the
garage.

**Confidence.** High that the order is wrong, low that players will hit it.

**Proposed fix.** Move the `garage.has` fallback above `const spec = carById(G.carId)`.

**How to validate.** Add a smoke check that loads a save with an unowned `carId` and asserts
`G.veh.spec.id === G.carId`.

### A7 - POLISH - Camera-shake yaw is injected per render frame, so its size scales with refresh rate

`main.js:2409` adds `sin(G.time*9.1)*k*0.5` straight into the persistent `G.camYaw` once per
`render()`. At 144 Hz that is 2.4 times as much yaw input per second as at 60 Hz, and it
leaves residual drift that the chase cam's 5.5/s ease has to remove.

**Fix.** Keep a separate `shakeYaw` offset that is passed to `r.begin` and never written
into `G.camYaw`.

**Validate.** Compare the amplitude at 60 and 144 Hz in the browser.

### A8 - POLISH - Sub-stepping exceeds the 1/60 step it claims to guarantee

`main.js:1800` caps `n` at 8 while `dt` is capped at 0.25. On a hitch of more than 133 ms,
`h` = `dt/8` goes up to 31 ms, and the comment at `:1797` says "at or below the 1/60".

**Fix.** Either `n = ceil(dt/STEP)` with dt capped at 8/60, or drop the surplus time.

A related hypothesis, untested in a browser: `last = performance.now()` on unpause
(`main.js:1721`, `:2866`) can be later than the next rAF timestamp, which gives a small
negative `dt`. `probe_dt.mjs` shows that one negative step with S held stops the car dead
from 22 km/h, and it also adds fuel back. A guard of `if (dt < 0) dt = 0` costs nothing.

---

## B. Design judgements for Tom (not bugs)

1. **Slopes do nothing to longitudinal speed.** `probe_slope.mjs` shows the Ranger reaches
   94.7 km/h in 10 s on 0 %, +10 % and -10 % grades, and a car left in neutral on a 10 %
   grade never rolls. The height field changes attitude, landings and jumps only.
   Midtown Madness did pull you back on hills. Adding `-g·sin(grade)` to `a` in
   `cars.js` (around `:2250`) would change the balance on the hill, so it needs a ruling
   and a smoke_driving re-baseline.
2. **Race rivals ignore rain.** `race.js` Rival builds a plain `new Vehicle(spec)`, and
   nothing in race/rivals/traffic/cops calls `weather.specFor`. In a storm the player loses
   24 % grip and 20 % brake (20 % only once A1 is fixed) and the rivals lose nothing.
3. **Moteur 3 makes the Firebird slower off the line** (0-100 goes from 7.29 s to 7.35 s,
   `probe_mono.mjs`). That comes from the feel wheelspin cap and is realistic, but the work
   order will show a red arrow on a $685 part. Engine upgrades on vehicles that cannot reach
   100 km/h (buses, cart, bikes) show a longer "brake distance", because `brakeDist()`
   brakes from whatever speed they top out at (`upgrades.js:316`). Either print "from X
   km/h" or brake from a fixed speed the car can reach.
4. **Look-back is asymmetric.** `probe_lookback.mjs`: pressing Shift swings the camera round
   in 117 ms, while the camera position lags and passes about 3 m from the car centre.
   Releasing Shift takes 517 ms, because the rate drops from 22 to 5.5 (`main.js:2351`).
   Midtown's look-back is a cut. Suggest snapping both `camYaw` and `camPos` on press and
   release.
5. **Hood cam plus Shift** looks backwards from the bonnet through the player's own truck,
   because `hd` depends only on `revBlend`, not `lookBack` (`main.js:2358`). Shift while
   reversing in hood cam does not flip to look forward. Needs a browser look.
6. **Mods on bicycles and the cart.** Moteur/Freins can be bought for them (no `canFit`
   gate). Probably intended as a joke, but worth a ruling.

## C. Hypotheses tested and not confirmed

- **Chase-cam clip defeated by positional smoothing.** `probe_cam.mjs` drove a right-angle
  turn around a building at 40/60/90 km/h at 60 and 144 fps. The clipped target was never
  inside the building, and neither was the rendered `camPos`. The gap between them reaches
  3 m at 90 km/h but stays on the road side. No bug found. Still worth one browser look at a
  tight downtown corner.
- **NaN from tuned sheets on any vehicle.** `probe_all.mjs` covers all 21 CARS entries,
  including svx, bikes, buses and famous cars. It built a fully tuned, wet and max-skill
  sheet and drove 40 s flat out plus 8 s of handbrake-and-full-lock. Every value stayed
  finite, including the gearbox rpm. Every car has hbYaw, hbGrip and vPow. Only the svx
  lacks `revTop`, and it falls back to REV_TOP safely.
- **Zero or negative dt in `Vehicle.update`.** Finite (`probe_dt.mjs`). See A8 for the
  negative-dt behaviour.
- **Car-on-car exact overlap** (`probe_overlap.mjs`): finite, separates.

## D. The baseSpec protection audit (the recent bug class)

Every place that derives or overrides a vehicle spec:

| Site | Pattern | Verdict |
|---|---|---|
| `upgrades.js:214` `tuned()` | `Object.create(spec)` plus own muls; stock returns the identical object | OK. Mul keys all exist on every car (probe). A4 is a cap issue, not an inheritance one. |
| `weather.js:305` `specFor` | `Object.create(spec)` cached by id+bucket+base identity | OK. Allocates only on a 5 % bucket change. |
| `skills.js:81` `specFor` | same pattern, cached | OK |
| `fuel.js:110` dry tank | `Object.create(v.spec)`, **new object every tick while dry** | Safe today, because nothing identity-compares `v.spec` except the two cases below. Suggest caching it anyway. |
| `main.js:2031-2033` | `baseSpec` captured lazily; `v.spec` re-derived each tick | OK. A swap builds a new Vehicle, so baseSpec heals. |
| `economy.js:185` `retune()` | compares `baseSpec === w.spec` | OK, the fix holds. `wanted()` still `JSON.stringify`s mods every frame (`economy.js:169`). That is a small per-frame allocation, polish. |
| `cars.js:971` `finalizeCar` / `defaults()` | fill-in with `in`, never overwrite | OK, and it is exactly what protects tuned hbYaw/hbGrip. Keep it. |
| `vehicles.js:73`, `bikes.js:517` | `spec === G.veh.spec` identity | OK only because the player bike is drawn with `v.spec` itself (`main.js:2436`). **Tripwire:** if anyone ever draws the player with `baseSpec` or `carById(id)`, the rider disappears in rain. Compare by `G.veh` ownership rather than spec identity. |
| `main.js:2517` spare tyre | `spec===G.veh.spec` | Same tripwire. |
| `traffic.js:196`, `carskin.js:160` | object spread | They only ever see stock CARS entries (own fields), so safe. Would break if handed a tuned sheet. |
| audio profile | `setEngineProfile` only in enterDrive, swapCar and retune-on-change | OK, no per-frame rebuild path found. |

**Suggested regression.** Extend `smoke_vehicle_spec_layers.mjs` to loop over **all** CARS
(not only the Ranger) with every part maxed, and assert the A1 monotonicity.

## E. What feels right and must be preserved

- **The arcade direction change** (`cars.js:2150-2175`): one continuous S press stops you
  and then drops into R after a per-car clunk (`REVERSE` table). The fix for A1/A2 must
  keep keyboard S at full strength, with no timer and no hysteresis.
- **Per-car handbrake character** (D2 ordering Ranger < Saturn < Civic): the Ranger
  ploughs, the Civic pivots, the Forester refuses. `defaults()` keeps the Posi-traction
  upgrade from being stamped over.
- **Kerb hops and step scrub, and the ballistic vertical model:** every ramp is a jump,
  landings squat and damage above LAND_SAFE, and walls are skipped above 1.6 m. The jumps
  smoke is 74/0.
- **Swept wall and pole collisions** (unbounded bites plus a ray guard): nothing tunnels at
  300 km/h at 20 fps.
- **Camera clip:** snap in, ease out, fences are not buildings, and the march out of
  footprints. The speed cue lives in FOV, not in shake. Chase smoothing is exponential and
  frame-rate independent (apart from A7).
- **The spec-layer pattern:** `Object.create`-based derivation, a stable `baseSpec`, and
  economy comparing the dry sheet. The tables above show it is now consistent everywhere.
- **Free reset (T) vs paid tow (Y)** (`tow.js`): the oriented-footprint placement check, the
  ≥6 m `lastSafe` rule, and settleSpawn on load. T with a dry tank buys a jerrycan first,
  which is a nice touch.
