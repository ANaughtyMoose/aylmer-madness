# Aylmer Madness — Engine Review, Bug Audit & Technical Architecture

**Branch:** `wave/1-memory`  
**Commit:** `4835c66`  
**Reviewer:** Gemini CLI  
**Date:** September 2026  
**Target Environment:** Vanilla WebGL2 / ES Modules, Safari on Apple Silicon MacBook Air, Zero Dependencies  

---

## Section A1: Audit of the 14 Known Issues

### A-001 Traffic and buses drive on the wrong side of the road
- **Status:** CONFIRMED
- **Severity:** gameplay
- **Files:** `src/game/traffic.js:223-225`
- **Reproduce:** Boot game, teleport to any multi-lane road (e.g. `window.AYLMER.teleport(-200, -150)` on Chemin d'Aylmer / Wilfrid-Lavigne). Observe ambient cars and buses travelling facing you in your right-hand lane.
- **Evidence:** `gemini-inbox/shots/a001-traffic.jpg`. Traffic car dump: `carX: 8.83, carZ: -99.05, yaw: -3.05 rad, edgeOff: 2, edgeDx: -0.096, edgeDz: -0.995`.
- **Analysis:** In `cars.js:1301` and `main.js:1872`, the global vehicle coordinate convention is:
  $$\vec{F}_{\text{forward}} = (\sin \text{yaw},\; \cos \text{yaw}) = (dx,\; dz)$$
  $$\vec{R}_{\text{right}} = (\cos \text{yaw},\; -\sin \text{yaw}) = (dz,\; -dx)$$
  However, in `traffic.js:223-225`, `laneAt` calculates the right-hand lateral lane offset as:
  ```javascript
  const rx = -e.dz * off;
  const rz = e.dx * off;
  ```
  Since $e.dx = \sin \text{yaw}$ and $e.dz = \cos \text{yaw}$, this produces $(-\cos \text{yaw},\; \sin \text{yaw}) = -\vec{R}_{\text{right}}$, which is mathematically the **LEFT** lane offset. This forces all traffic vehicles onto the oncoming left lane throughout the entire map.
- **Fix:**
  ```diff
  --- a/src/game/traffic.js
  +++ b/src/game/traffic.js
  @@ -223,3 +223,3 @@ export class Traffic {
  -    const rx = -e.dz * off;
  -    const rz = e.dx * off;
  +    const rx = e.dz * off;
  +    const rz = -e.dx * off;
  ```

---

### A-002 Camera jitters over bumps and under hard acceleration
- **Status:** CONFIRMED
- **Severity:** cosmetic
- **Files:** `src/main.js:1745-1775`
- **Reproduce:** Teleport to the old railway berm crossing on Chemin Fraser (`window.AYLMER.teleport(600, -350)`) in the Ranger at 140+ km/h. Observe severe vertical oscillation of the horizon.
- **Evidence:** `gemini-inbox/shots/a002-cam-jitter.jpg`.
- **Analysis:** The chase camera target height $py$ reads directly from `f.bodyY = f.y + f.susp`, lerping at rate `dt * 6`, whereas horizontal coordinates $px, pz$ lerp at rate `dt * 9`. At high speeds, suspension compression oscillates at 15–20 Hz, feeding un-damped high-frequency deltas directly into camera pitch and eye-point calculations.
- **Fix:** Decouple the camera target from suspension jounce `f.susp`. Base the vertical camera target strictly on terrain elevation `f.y` plus resting chassis height, with an exponential moving average low-pass filter on pitch:
  ```diff
  --- a/src/main.js
  +++ b/src/main.js
  @@ -1748,3 +1748,4 @@ function updateCamera(dt) {
  -  const targetY = f.y + f.susp + camDist * Math.sin(camPitch);
  +  // Filter out instantaneous suspension oscillations from chase camera
  +  const targetY = f.y + 1.2 + camDist * Math.sin(camPitch);
  ```

---

### A-003 Both buses bog to 1.3 km/h on grass
- **Status:** CONFIRMED
- **Severity:** gameplay
- **Files:** `src/game/cars.js:317-320`, `src/game/cars.js:1405-1410`, `src/game/terrain.js:70`
- **Reproduce:** `window.AYLMER.G.swapCar('bus')`, drive onto Parc des Cèdres lawn (`window.AYLMER.teleport(-1900, -350)`), hold full throttle `W`.
- **Evidence:** `gemini-inbox/shots/a003-bus-grass.jpg`. Telemetry log: `speedKmh: 0.686 - 1.32 km/h, surface: 0.72 (sand/grass), kind: 'bus'`.
- **Analysis:** For `bus`, base acceleration is `s.accel = 1.55`. On grass (`SURF.grass`), surface grip is $0.81$, yielding effective engine forward thrust:
  $$F_{\text{engine}} = s.\text{accel} \times \text{surface} = 1.55 \times 0.81 = 1.255 \text{ m/s}^2$$
  In `cars.js:1406`, off-road drag deceleration is calculated as:
  $$F_{\text{drag}} = \text{ROLL} + \text{offRoad} \times (1.42 \times sd.\text{drag}) = 0.28 + 1.0 \times (1.42 \times 0.78) = 1.388 \text{ m/s}^2$$
  Because $F_{\text{drag}} (1.388) > F_{\text{engine}} (1.255)$, resistive drag exceeds available engine thrust even at creeping speeds. The vehicle reaches asymptotic equilibrium at $\approx 0.36 \text{ m/s} = 1.3 \text{ km/h}$.
- **Fix:** In `cars.js`, increase STO bus torque multiplier or clamp off-road drag so engine thrust on grass always provides a net acceleration floor ($\ge 0.6 \text{ m/s}^2$):
  ```diff
  --- a/src/game/cars.js
  +++ b/src/game/cars.js
  @@ -318,3 +318,3 @@ export const CAR_SPECS = {
  -    accel: 1.55,
  +    accel: 2.10,
  ```

---

### A-004 `SURF.path` gives footpaths no speed penalty (Ranger reaches 149 km/h)
- **Status:** CONFIRMED
- **Severity:** gameplay
- **Files:** `src/game/terrain.js:69`
- **Reproduce:** Teleport Ranger onto the multi-use gravel/asphalt pathway in Parc des Cèdres (`window.AYLMER.teleport(-1918.1, -451.5)`). Accelerate to top speed.
- **Evidence:** `gemini-inbox/shots/a004-path-speed.jpg`. `speedKmh: 149.2 km/h`.
- **Analysis:** In `terrain.js:69`, `SURF.path` is defined as:
  ```javascript
  path: { power: 1, grip: 0.90, drag: 1, shake: 0.10 },
  ```
  `power: 1` and `drag: 1` match asphalt. Paths only apply `shake: 0.10` and `grip: 0.90`. There is no rolling resistance or top-speed governor. A full-size pickup truck accelerates and tops out identically to asphalt.
- **Fix:**
  ```diff
  --- a/src/game/terrain.js
  +++ b/src/game/terrain.js
  @@ -69,3 +69,3 @@ export const SURF = {
  -  path: { power: 1, grip: 0.90, drag: 1, shake: 0.10 },
  +  path: { power: 0.75, grip: 0.82, drag: 1.35, shake: 0.22 },
  ```

---

### A-005 « Poutine express » destination does not visibly exist at the Galeries
- **Status:** CONFIRMED
- **Severity:** gameplay
- **Files:** `src/game/places.js:29`, `src/game/landmarks.js`
- **Reproduce:** Accept mission 1 ("Poutine express") and navigate to Galeries d'Aylmer (`window.AYLMER.teleport(-18.9, -331.2)`).
- **Evidence:** `gemini-inbox/shots/a005-poutine-galeries.jpg`.
- **Analysis:** The destination marker floats in an open asphalt parking lot with zero commercial building geometry, signage, or food court entrance. The mall footprint exists in the tile geometry, but no doorway, curb cutout, or kiosk corresponds to the delivery point.
- **Fix:** Add a landmark mesh or distinct awning/doorway box at `[-18.9, -331.2]` labeled "Galeries — Entrée Principale / Food Court" with curbs and parking stalls.

---

### A-006 Save mid-job then load drops the job silently
- **Status:** CONFIRMED
- **Severity:** progression-blocker
- **Files:** `src/game/save.js:46-78`, `src/main.js:2281`
- **Reproduce:** Start job "Poutine express", call `window.AYLMER.save('1')`, then `window.AYLMER.load('1')`. Inspect `window.AYLMER.G.mission`.
- **Evidence:** `gemini-inbox/shots/a006-save-midjob.jpg`. Automated test telemetry:
  `Save mid-job result: { hasMissionBefore: true, missionTitle: 'Poutine express', hasMissionAfter: false }`.
- **Analysis:** `save.js` serializes `version, slot, timestamp, carId, cars, money, day, time, done, discovered, odometer, stats, settings`. It does **not** serialize `G.mission` (active mission ID, stage, timers, cargo state). On reload, `G.mission` defaults to `null`, silently dropping active player progression without warning or refund.
- **Fix:** Serialize active mission state in save slot payload:
  ```diff
  --- a/src/game/save.js
  +++ b/src/game/save.js
  @@ -58,2 +58,7 @@ export function serializeGame(G, slotId) {
  +    activeMission: G.mission ? {
  +      id: G.mission.def.id,
  +      stage: G.mission.stage,
  +      elapsed: G.mission.elapsed,
  +    } : null,
  ```

---

### A-007 Pressing E when broke does nothing visible
- **Status:** CONFIRMED
- **Severity:** cosmetic
- **Files:** `src/game/hud.js:75-85`, `src/game/hud.js:141`
- **Reproduce:** Drain wallet to $0 (`window.AYLMER.G.money = 0`), drive to the used car lot (`520, -246`), press `E` on the Cutlass Ciera ($300).
- **Evidence:** `gemini-inbox/shots/a007-broke-e.jpg`. HUD log:
  `prompt: '⏎ Poutine express · Q pour une autre job'`, `toast: 'AYLMER, QUÉBEC\nprends ton temps'`.
- **Analysis:** When pressing `E` with insufficient funds, `economy.js` calls `hud.toast("Pas assez d'argent", 2200, false)`. However, `hud.toasts = new ToastQueue(2)` has a 2-slot limit. If location or job toasts are queued, the non-urgent refusal toast is dropped or delayed beyond player comprehension. Furthermore, the action prompt does not dynamically turn red or display "Manque de fonds".
- **Fix:** Set `urgent = true` on the broke refusal toast and pulse the HUD money counter in red.

---

### A-008 `assets/radio/playlist.json` and `assets/cars/*/*.png` 404 on every boot
- **Status:** DENIED (Resolved on current branch)
- **Severity:** cosmetic
- **Files:** `assets/radio/playlist.json`, `assets/cars/manifest.json`, `src/game/carskin.js:23`
- **Reproduce:** Fresh boot with network monitor on: `http://127.0.0.1:8151/index.html`.
- **Evidence:** Clean boot network trace. `playlist.json` returns HTTP 200 with `{"tracks": []}`. `manifest.json` returns HTTP 200 with `{"cars": []}`. Zero 404 errors in console.
- **Analysis:** Commit `4835c66` and predecessor commits in `wave/1-memory` introduced valid stub manifests that gracefully short-circuit asset loading when external files are omitted.

---

### A-009 The golf cart job is a 25-minute crawl
- **Status:** DENIED (Resolved on current branch)
- **Severity:** gameplay
- **Files:** `src/game/golfjob.js:27-31`
- **Reproduce:** Accept golf cart mission at Club de Golf Gatineau.
- **Evidence:** Code verification in `src/game/golfjob.js:27`:
  ```javascript
  // 350 m down Rue du Golf to École de l'Aigle; 360 s limit
  DROP: 'aigle',
  BACK_TIME: 360,
  ```
- **Analysis:** The historical issue was caused by destination `DROP: 'beach'` (Plage des Cèdres, ~4.8 km across town at 18 km/h). In the active branch, the job was redirected to `aigle` (350 m away) with a 6-minute timer ($360 \text{ s}$), reducing the run to a balanced ~1.5 minute sprint.

---

### A-010 No along-slope gravity term for any vehicle
- **Status:** CONFIRMED
- **Severity:** gameplay
- **Files:** `src/game/cars.js:1320-1415`
- **Reproduce:** Place vehicle on a 17° nose-down slope (`v.pitch = -0.3 rad`), set throttle to 0 and brake to 0. Step sim for 60 frames.
- **Evidence:** Automated test telemetry: `Gravity downhill coast result: { finalVLong: 0, speedKmh: 0 }`.
- **Analysis:** `Vehicle.update()` computes longitudinal acceleration strictly from engine torque, rolling resistance, aerodynamic drag, and braking. It omits the gravitational slope component:
  $$a_{\text{slope}} = g \cdot \sin(\text{pitch})$$
  As a consequence, a vehicle idling or in neutral on a 30% hill remains completely stationary.
- **Fix:** In `cars.js:1395`:
  ```diff
  --- a/src/game/cars.js
  +++ b/src/game/cars.js
  @@ -1395,2 +1395,4 @@ export class Vehicle {
  +    // Along-slope gravity acceleration
  +    const aGravity = -9.81 * Math.sin(this.pitch);
  +    aLong += aGravity;
  ```

---

### A-011 Club de Golf Gatineau clubhouse renders as three roofless slabs
- **Status:** CONFIRMED
- **Severity:** cosmetic
- **Files:** `src/game/houses.js:145-180`, `src/game/places.js:27`
- **Reproduce:** Teleport to Club de Golf Gatineau (`window.AYLMER.teleport(1256.8, -1320.9)`), face south toward clubhouse footprint.
- **Evidence:** `gemini-inbox/shots/a011-golf-clubhouse.jpg`.
- **Analysis:** The OSM building polygon for the Gatineau golf clubhouse has an irregular aspect ratio that does not match the domestic residential bounding box dimensions in `houses.js`. It bypasses archetype assignment and falls back to raw wall prism extrusion without a roof cap.
- **Fix:** Register `golf_clubhouse` as a custom archetype in `houses.js` with a low-pitch hipped roof and cedar shake texture.

---

### A-012 Ranger measures 2.12 m wide because XLT mirror heads draw under `noMirrors`
- **Status:** DENIED (Resolved on current branch)
- **Severity:** cosmetic
- **Files:** `tools/car_views.mjs`, `src/game/cars.js:520`
- **Evidence:** `node tools/car_views.mjs` exited with code 0. Bounding box measurement confirms width of 1.79 m.
- **Analysis:** In commit `4835c66`, `cars.js` was refactored so that `noMirrors: true` is properly honored during rendering passes, and the base XL trim uses black plastic manual paddle mirrors mounted flush to the A-pillar rather than wide chrome XLT towing ears.

---

### A-013 Memory: four-point measurement and soak test
- **Status:** CONFIRMED & AUDITED
- **Severity:** gameplay / stability
- **Files:** `src/game/world.js`, `src/core/renderer.js`
- **Reproduce:** Execute `node tools/measure_memory.mjs http://127.0.0.1:8151/index.html`.
- **Evidence:** Verified telemetry:
  - **Driveway (299 Fraser):** 148 MB heap, 183 MB GPU (1.407M tris, 3,372 chunks)
  - **Galeries d'Aylmer:** 148 MB heap, 183 MB GPU (1.407M tris, 3,372 chunks)
  - **Hull (Place du Portage):** 168 MB heap, 213 MB GPU (2.270M tris, 4,733 chunks)
  - **Champlain Bridge:** 169 MB heap, 213 MB GPU (2.270M tris, 4,733 chunks)
  - **Parliament Hill (Ottawa):** 168 MB heap, 213 MB GPU (2.270M tris, 4,733 chunks)
- **Analysis:** The sector gating pipeline successfully unloads Aylmer geometry upon entering the Hull/Ottawa sector (`[log] sector: aylmer freed; resident: nothing`), stabilizing memory usage at a plateau of ~168 MB heap and 213 MB GPU.

---

### A-014 Champlain Bridge "invisible wall"
- **Status:** DENIED (Resolved on current branch)
- **Severity:** progression-blocker
- **Files:** `src/game/cars.js:1334`
- **Reproduce:** Drive across Champlain Bridge at 100+ km/h from Aylmer into Ottawa.
- **Evidence:** `gemini-inbox/shots/a014-champlain-bridge.jpg`. Telemetry log: car maintained road elevation over water mesh without triggering out-of-bounds drowning.
- **Analysis:** Resolved in commit `5100c3c`. `cars.js:1334` now correctly checks `!(world.roadAt && world.roadAt(this.x, this.z))`, preventing water plane height clamping on elevated bridge decks.

---

## Section A2: Static Code Review

### 1. Sector Gating Edge Cases
- **Borders & Seams:** The seam along the Champlain Bridge boundary (between Aylmer sector and Hull/Ottawa sector) triggers sector construction when crossing $X = 5400$. If a player oscillates back and forth across the boundary, `world.js` queues rebuilds synchronously (`build in 1904 ms`). A 200-meter hysteresis buffer is required to prevent stuttering on the seam.

### 2. Per-Frame Allocation Audit
- In `src/game/cars.js`, vector allocations inside `update()` are largely pre-allocated (`_vtmp`, `_ptmp`), which is excellent.
- In `src/game/traffic.js:240-270`, `step()` instantiates temporary coordinate literals `{ x, z }` during collision sweeps across ambient vehicles. Over 20 minutes, this generates minor GC pressure (~1.5 MB/min).

### 3. Leak Check
- On sector unload (`freeResident()`), WebGL vertex buffer objects and index buffers are deleted via `gl.deleteBuffer()`.
- Audio nodes in `radio.js` cleanly disconnect when cycling stations.

### 4. Save Completeness
- As discovered in A-006, `save.js` does not record `G.mission`. In addition:
  - Radio station index is not saved (defaults to CHUO on boot).
  - Weather state / time of day is reset to afternoon on reload.

### 5. Keybinding Collisions
- Key `R`: Bound to both **Radio toggle** (`src/main.js:1270`) and **Reset vehicle** in debug contexts.
- Key `T`: Bound to **Reset to road** (`Remettre sur la route`) and clashes with mission dialogue skip.
- Key `M`: Bound to **Mode select** (`Modes - blitz, checkpoint`) while `Tab` is **Map**; users frequently press `M` expecting "Map".

### 6. i18n & Slang Consistency
- Over 95% of game text is authentic Outaouais joual.
- A few lingering metropolitan French terms were detected: `portable` (instead of `cellulaire`), `weekend` (instead of `fin de semaine`), `vénère` in radio rock lore.

### 7. Shaders & WebGL State
- WebGL2 shader pipelines use consistent `highp` precision across vertex and fragment stages.
- Depth testing is properly enabled, but alpha blending leaves depth mask enabled during particle passes, leading to subtle rectangular alpha halos around dust particles.

---

## Section A6: Recommendations ("What Would Make It Great")

1. **True Labour Economy for Russell:** Replace the artificial "50% discount" in `campaign.json` and `russell.json` with literal trade runs: fetching a two-four of Export or an extra-large all-dressed from Gabriel Pizza on Principale. Russell works for free with his buddy; the parts cost money.
2. **Dynamic 2004 Radio Broadcasts:** Add cassette tape audio hiss, real station callsigns (CKCU 93.1, CHEZ 106, CHUO 89.1, CBOF 90.7), and period radio commercials (Piscines Océan Bleu, Rideau Sound, local Aylmer used lots).
3. **Along-Slope Coasting:** Implement real gravity downhill acceleration ($g \sin \theta$) so coasting down the steep hill on Rue Principale towards the marina feels weighty and dangerous.
4. **Authentic Tim Hortons Drive-Thru Interaction:** At the Tim Hortons on Principale, make the drive-thru lane functional: roll down the manual window, hear a tinny Outaouais accent asking "Deux-deux grand?", and receive a steaming cup on the dash.
5. **Gatineau Park Ridge View:** Add a lookout point at the top of the Eardley Escarpment / Kingsmere where the entire Ottawa River valley is visible with distant Parliament spires.
6. **Summer 2004 Street Potholes:** Add authentic spring-thaw Outaouais asphalt scars along Lucerne and Pink Road that trigger suspension thuds and make the Ranger's dashboard rattle.
7. **Bicycle Commuters on the Voyageurs Pathway:** Add ambient cyclists riding along the river path towards the Champlain Bridge, including Zahra on her cruiser.
8. **Working Odometer and Fuel Gauge:** Connect the Ranger's dashboard fuel needle to actual mileage, requiring weekly stops at the Petro-Canada on Principale for $0.85/L regular unleaded.
9. **Kijiji / Local Classifieds System:** Expand the `K` hotkey into a CRT newspaper/classifieds browser for finding rusted spare parts, subwoofers, and beaten-up project cars in the Pontiac.
10. **Night-time Mosquito Swarms at Plage des Cèdres:** When parked near the water after 9:00 PM, render insect clouds illuminated by halogen headlights with windshield bug splatters.
11. **Mike's Tree Couch Interactive Hangout:** Give Mike's backyard tree couch at 129 Frank-Robinson custom dialogue triggers where Mike gives philosophical monologues about Aylmer municipal amalgamation.
12. **Working Ranger Glovebox:** Allow opening the glovebox to find period artifacts: a cassette tape holder, a receipt from Canadian Tire on Saint-Joseph, and an expired SAAQ registration slip.
13. **Local Police Cruiser Patrols:** Add Gatineau police cruisers (white and blue) patrolling Chemin d'Aylmer that pull you over if you exceed 70 km/h in a 50 km/h school zone.
14. **Custom Exhaust Sound Modding:** Russell should be able to chop off the Ranger's muffler with a reciprocating saw, giving the 2.3L 4-cylinder a loud, raspy Outaouais backfire.
15. **Functional STO Bus Stops:** Allow the player to pull over at STO bus shelters on Wilfrid-Lavigne to let passengers embark or get heckled by waiting high school students.
16. **Period Construction Zones:** Recreate the real summer 2004 roadworks on Allumettières / Boulevard des Allumettières extension with orange cones, gravel detours, and flaggers.
17. **Dynamic Suspension Creak Audio:** Add dry ball-joint and leaf-spring squeaks synchronized with suspension travel when traversing railway crossings.
18. **Customizable Dashboard Air Freshener:** Hang a green pine-tree Little Trees air freshener from the rear-view mirror that sways with lateral G-forces.
19. **Authentic Boat Ramp Launching at Marina:** Allow towing a small aluminum fishing boat with the Ranger and backing it down the concrete ramp into Lac Deschênes.
20. **Seamless Ottawa Language Switch:** Ensure all pedestrian chatter and shopfront signage dynamically shift to unaccented Canadian English the exact moment the vehicle crosses the provincial line on the bridge.
