# Aylmer Madness — Test Suite Audit & Verification Analysis

**Scope:** 27 smoke test suites in `tools/smoke*.mjs`  
**Execution:** All 27 suites run in Node.js; 100% pass rate recorded on commit `4835c66`.  
**Auditor:** Gemini CLI  
**Date:** September 2026  

---

## 1. Suite-by-Suite Assertion Analysis & Blind Spots

Every test suite runs in Node.js without a live DOM or real WebGL, relying on lightweight mock objects (`StubRenderer`, `FakeStorage`, `noopCtx`). While this makes the tests blazingly fast (< 2 seconds total runtime), it introduces significant blind spots where features appear green despite being broken in gameplay.

| Suite | Core Assertions | Blind Spots / False Confidence |
|---|---|---|
| `smoke.mjs` | Mapdata bounds, road count, POI counts, basic math functions. | Does not verify visual meshes or coordinate alignments. |
| `smoke_arc.mjs` | Campaign arc mission progression graph structure. | Verifies data structure, not whether missions can be accepted or completed in-game. |
| `smoke_atlas.mjs` | Texture atlas coordinates and packing dimensions. | Verifies rect math; doesn't verify mipmaps or texture wrapping modes. |
| `smoke_audio.mjs` | Web Audio node instantiation, gain curves, synthesizer param bounds. | Uses dummy audio context; cannot detect clipping, distortion, or phase cancellation. |
| `smoke_avatars.mjs` | Pixel avatar generation and canvas dimensions. | Asserts 2D canvas drawing calls without checking rendering fidelity. |
| `smoke_cart.mjs` | Golf cart torque curves, battery limits, turf traction factor. | Passes because golf cart physics pass in isolation; didn't catch 25-minute mission crawl. |
| `smoke_driving.mjs` | Car-vs-car collision impulses, damage ladder, off-road ramp arrival. | **Critical Blind Spot:** Tests that off-road penalty reaches `SURF.grass.power`, but never checks if that power stalls vehicles. Does not test along-slope gravity. |
| `smoke_garage.mjs` | Garage car purchase logic, money deduction, car unlocking. | Uses mock wallet; doesn't verify HUD money animation or store interaction UI. |
| `smoke_hangout.mjs` | Passenger dialogue triggers when entering character house zones. | Checks proximity radius; doesn't verify audio playback or text overflow. |
| `smoke_houses.mjs` | Archetype assignment for residential building footprints. | **Critical Blind Spot:** Only tests rectangular house footprints. Irregular commercial polygons (Golf clubhouse) bypass archetypes and render roofless slabs. |
| `smoke_jumps.mjs` | Stunt ramp triggers, jump distance calculations, landing bonus. | Verifies landing math; doesn't check vehicle physics tumbling in WebGL. |
| `smoke_landmarks.mjs` | Landmark coordinate presence in `places.js` and model mesh uploads. | Checks landmark array presence; doesn't check if delivery targets (e.g. Galeries food court) have visual models. |
| `smoke_modes.mjs` | Mode transitions between drive, paused, map, garage, race. | Verifies mode state string; doesn't test DOM modal visibility or focus traps. |
| `smoke_ottawa.mjs` | Hull/Ottawa road connections, bilingual text toggles, bridge bounds. | Tests string toggles; didn't catch bridge deck water plane clipping. |
| `smoke_race.mjs` | Checkpoint sequence indexing, lap timers, high score storage. | Does not test off-track shortcut exploits or checkpoint trigger volumes. |
| `smoke_react.mjs` | Pedestrian reaction triggers and horn flee responses. | Verifies state changes on mock pedestrians; doesn't test 3D billboard rendering. |
| `smoke_repair.mjs` | Damage repair cost formulas, part degradation steps. | Asserts math formulas; does not check Russell vs Norm economy dialogue. |
| `smoke_save.mjs` | Round-tripping save slots, localStorage migration, settings persistence. | **Critical Blind Spot:** Asserts that `serializeGame` saves slot fields, but never checks for `G.mission`. Allowed Bug A-006 (loss of active mission on reload) to pass 100% green. |
| `smoke_sectors.mjs` | Sector bounding boxes and streaming radius triggers. | Uses synthetic coordinates; doesn't test frame drops or sync stutter during dynamic sector build. |
| `smoke_shell.mjs` | DOM structure of `index.html`, script tags, viewport meta. | Asserts tag presence; doesn't test CSS responsiveness on various window sizes. |
| `smoke_signs.mjs` | Sign text formatting and placement coordinates. | Verifies sign generation; does not verify whether signs face the correct traffic direction. |
| `smoke_story.mjs` | Story card queue, dialogue transitions, completion flags. | Verifies queue popping; does not verify keyboard event listener consumption. |
| `smoke_terrain.mjs` | Heightmap elevation queries, ground normals, surface classification. | **Critical Blind Spot:** Asserts `SURF.path` grip and shake, but misses that `power: 1` and `drag: 1` allow cars to do 149 km/h on footpaths. |
| `smoke_ui.mjs` | HUD speedometer needle rotation, minimap canvas sizing. | Verifies CSS transform strings; does not detect overlapping HUD text prompts. |
| `smoke_upgrades.mjs` | Performance part upgrades and car spec multipliers. | Checks dictionary math; does not test vehicle stability under modified physics. |
| `smoke_vehicles.mjs` | Bicycle sprinting, city bus specs, school bus dimensions. | **Critical Blind Spot:** Tests bicycles on grass, but never tests buses on grass. Allowed Bug A-003 to persist. |
| `smoke_world.mjs` | World chunk baking, mesh triangulation, vertex budget thresholds. | Triangle budgets were relaxed (from 500k to 2.5M) to accommodate Hull expansion without tightening chunk cull assertions. |

---

## 2. Loosened Golden Tables & Tolerance Drift

1. **`smoke_world.mjs:315-330` — Triangle and Memory Budgets:**
   - The original Aylmer world budget was capped at 500,000 triangles and 60 MB vertex data.
   - When Hull and Ottawa sectors were merged, the assertion was relaxed to `< 2,500,000` triangles and `< 280 MB` vertex buffers. This is appropriate for the expanded territory, but it lacks per-sector density checks, allowing unoptimized chunks to pass unnoticed.
2. **`smoke_driving.mjs:11-14` — Surface Penalty Decoupling:**
   - The test states: *"this file tests the SHAPE of the ramp — how fast it arrives — not the number it arrives at."* By reading `SURF.grass.power` dynamically rather than asserting an absolute physical floor, it enabled grass drag tuning changes to break vehicle mobility without breaking the test.
3. **`smoke_vehicles.mjs:195-205` — Bike Turf vs Bus Mobility:**
   - The test checks `flatOut('dbike', 'grass')` and asserts tolerance `< 0.6 km/h` against asphalt, but completely skips testing `flatOut('bus', 'grass')`.
4. **`smoke_signs.mjs` — Sign Collision Volumes:**
   - Sign post collisions were relaxed to prevent vehicle bounce-backs on sidewalks, but this inadvertently allowed vehicles to clip through speed limit signs without registering contacts.

---

## 3. The Complete Absence of `smoke_traffic.mjs`

The single biggest blind spot in the entire test harness is that **there is no smoke test for ambient traffic lanes or directional flow**.
- Ambient traffic is implemented in `src/game/traffic.js`.
- It defines graph traversal, edge following, speed control, collision with the player, and lateral lane offsets (`laneAt`).
- Because not a single line of test code existed to verify traffic lane offset vectors, Bug A-001 (traffic driving in the left lane on every road in Aylmer) remained completely unnoticed by automated CI.

---

## 4. Top 10 Missing Tests (Ranked by Bug-Finding Power)

### 1. `tools/smoke_traffic_lanes.mjs`
- **What it asserts:** For every directed edge in the road graph, vehicles spawn on the **right-hand side** of the road centerline ($(\vec{R} \cdot \vec{N}_{\text{lane}}) > 0$). In multi-lane segments, vehicles must stay strictly within their positive lateral lane bounds.
- **Runner:** Node.js.
- **Bug it would have caught:** **Bug A-001** (Traffic wrong-way driving).

### 2. `tools/smoke_bus_mobility.mjs`
- **What it asserts:** Every vehicle in `CARS` (including `bus` and `schoolbus`) must achieve a steady-state forward speed of at least $15 \text{ km/h}$ under full throttle on every defined surface (`asphalt`, `gravel`, `grass`, `sand`).
- **Runner:** Node.js.
- **Bug it would have caught:** **Bug A-003** (Buses stalling to 1.3 km/h on grass).

### 3. `tools/smoke_path_penalty.mjs`
- **What it asserts:** Road vehicles driving on pedestrian walkways and park paths (`SURF.path`) must experience higher drag ($F_{\text{drag}} > 1.2$) and lower top speed ($v_{\text{max}} \le 60\% \text{ asphalt top speed}$).
- **Runner:** Node.js.
- **Bug it would have caught:** **Bug A-004** (Ranger doing 149 km/h on footpaths).

### 4. `tools/smoke_save_mission.mjs`
- **What it asserts:** Starting any mission, setting elapsed time and stage, calling `serializeGame(G)`, and restoring via `deserializeGame()` must yield an active mission with identical ID, stage, and remaining timer.
- **Runner:** Node.js.
- **Bug it would have caught:** **Bug A-006** (Mid-job save dropping active mission).

### 5. `tools/smoke_gravity_slope.mjs`
- **What it asserts:** A vehicle placed on an inclined plane ($\text{pitch} \ne 0$) with 0 throttle and 0 brake must experience non-zero longitudinal acceleration equal to $g \sin(\text{pitch})$ and begin rolling downhill.
- **Runner:** Node.js.
- **Bug it would have caught:** **Bug A-010** (Lack of along-slope gravity).

### 6. `tools/smoke_building_archetypes.mjs`
- **What it asserts:** 100% of building polygons in `mapdata.js` must match a recognized building archetype in `houses.js` and produce a fully closed 3D mesh with a roof cap (zero roofless open prism shells).
- **Runner:** Node.js.
- **Bug it would have caught:** **Bug A-011** (Golf clubhouse three roofless slabs).

### 7. `tools/smoke_bridge_elevations.mjs`
- **What it asserts:** A ground raycast at any coordinate along the Champlain Bridge deck, Portage Bridge, or Alexandra Bridge must return a road surface at bridge deck altitude ($Y \ge 8.0 \text{ m}$) and must never trigger `inWater: true`.
- **Runner:** Node.js.
- **Bug it would have caught:** **Bug A-014** (Champlain Bridge invisible wall/water trap).

### 8. `tools/smoke_mission_destinations.mjs`
- **What it asserts:** Every `.from` and `.to` entry in `assets/text/campaign.json` and `missions.js` must resolve to a valid POI coordinate in `src/game/places.js` that has an associated physical visual mesh.
- **Runner:** Node.js.
- **Bug it would have caught:** **Bug A-005** (Galeries poutine delivery marker floating in empty lot).

### 9. `tools/smoke_camera_stability.mjs`
- **What it asserts:** Traversing a simulated 10 cm vertical terrain bump at 120 km/h must not induce high-frequency vertical camera oscillations ($\Delta \text{camPitch} < 0.02 \text{ rad/frame}$).
- **Runner:** Node.js.
- **Bug it would have caught:** **Bug A-002** (Camera jitter over railway berm).

### 10. `tools/smoke_hud_toast_priority.mjs`
- **What it asserts:** An urgent refusal toast (e.g. attempting to purchase a car with insufficient funds) must displace non-urgent ambient/location toasts and render immediately in the active HUD toast slot.
- **Runner:** Headless Browser.
- **Bug it would have caught:** **Bug A-007** (Pressing E when broke showing no feedback).
