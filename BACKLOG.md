# Aylmer Madness — backlog

Priority: **P1** next session · **P2** soon · **P3** when it matters. Effort: S (< 1 h), M (half day), L (day+).
Updated 2026-08-25 after the first agent pass: ✅ = merged on master. W1 (houses) Phases 1–3 are in (docs/HOUSES.md). Second pass (2026-08-26): pedestrians + props, races + cops, unlocks + radio + real engine synth, terrain/jumps, save slots + options. Third pass (2026-08-27): reverse/forward as one press, discoverable repairs, story opener + per-stage guidance, Québécois heckles, the golf cart, a 38-step playtest (docs/PLAYTEST.md — open items: mid-job saves don't carry the job, clubhouse has no roof, tutorial timer margin).

## Requested

| # | Item | Pri | Eff | Notes |
|---|------|-----|-----|-------|
| ~~R1~~ | ✅ **Controls easier to see** | P1 | S | Always-visible key legend (bottom-right, collapsible with `?`), a first-drive tutorial toast sequence ("W to go… Tab for the map…"), and a Controls tab in the pause menu with a diagram of the keyboard. Menu screen currently buries the keys in one grey line. |
| ~~R2~~ | ✅ **Expandable map** | P1 | M | Minimap in three sizes (small / large corner / full-screen) cycled with `M`-style key; `+`/`-` zoom on the minimap while driving; large mode keeps rotating with the car, full-screen stays north-up. Remember the choice in localStorage. Move mute off `M`. |
| ~~R3~~ | ✅ **Collision mechanism** | P1 | L | Real car-vs-car response (both directions: traffic and parked cars are currently only "shoved"): impulse from relative velocity along the contact normal, spin on off-centre hits, traffic reacts (stops, honks, pulls over). Car-vs-pole/hydrant: poles snap and fall (cheap: rotate the mesh over 0.5 s, remove collider). Wall hits already work. |
| ~~R4~~ | ✅ **Vehicle health** | P1 | M | Per-car damage 0–100 from impact force (walls, cars, poles). Effects at thresholds: cosmetic (headlight out, crumpled bumper box displacement, steam particles), then performance (top speed −15%, pull to one side, engine misfire in audio), then "dead" at 0 → mission fails, car towed back to owner's house, repaired. HUD damage bar next to the speedo; repairs at the Ultramar/Petro-Canada (drive in, stop, 5 s). Health persists per car for the session. |

## Driving feel

| # | Item | Pri | Eff | Notes |
|---|------|-----|-----|-------|
| ~~D1~~ | ✅ Wheels don't turn with steering on the skinned model until the loft is re-lofted | P2 | S | Visible on `garage.html`; also front wheels should steer in the garage. **Done:** garage wheels steer; skinned-model wheel loft still pending |
| ~~D2~~ | ✅ Handbrake turns are too easy to spin out without assists | P2 | S | Tune `grip` multiplier under handbrake per car (Ranger should just plough). |
| ~~D3~~ | ✅ Curb/sidewalk: no bump when climbing it | P2 | M | Sidewalk is a 0.15 m tower with no collider; add a small vertical hop + speed scrub on transition. **Done properly: real kerb step, launches above 30 km/h (terrain.js).** |
| ~~D4~~ | ✅ Grass slows too abruptly (`surface 0.72`) | P3 | S | Ramp the penalty over 0.5 s; keep the slip. |
| ~~D5~~ | ✅ Reverse camera / reverse gear indicator | P3 | S | Show `R` on the speedo; hood cam swings when reversing. |
| ~~D6~~ | ✅ Gamepad mapping untested on a real pad | P2 | S | Verify Xbox/PS layouts in Chrome, add rumble on impact. **Done:** mapping verified against the spec + rumble; untested on a real pad |

## World / look

| # | Item | Pri | Eff | Notes |
|---|------|-----|-----|-------|
| ~~W1~~ | ✅ **Houses look generic** | P1 | L | See the Street-View-free plan (assessment roll + LiDAR archetypes + material atlas). Phases 1 and 3 first. **Done:** Phases 1–3 shipped (roll + LiDAR join, archetypes, atlas, near/far LOD). Left: porch colliders, textured far bake, 16 px atlas bleed, Phases 4–5 — see docs/HOUSES.md Status. |
| ~~W2~~ | ✅ Draw-distance pop-in on High | P2 | S | Chunk cutoff is visible when fog is thin; fade chunks in over 0.4 s (alpha via `opts.alpha`) or raise `fogMul` on High. |
| ~~W3~~ | ✅ Intersections: markings overlap, sidewalk gaps, joint discs visible | P2 | M | Build proper intersection polygons from the graph (union of road quads), clip markings to segment interiors, stop lines. |
| ~~W4~~ | ✅ No traffic lights / stop signs | P2 | M | Traffic already has "stop nodes"; add sign meshes, red/green light at the 6–8 major intersections (Chemin d'Aylmer × Wilfrid-Lavigne, × Vanier, × Principale…), and make traffic obey. Player gets a "brûlé un feu rouge" toast. |
| ~~W5~~ | ✅ Storefront signage on Principale | P2 | M | Canvas-rendered text textures from OSM names (Cafe British, Cassis, Depanneur Palmyra…). Engine already supports textures. |
| ~~W6~~ | ✅ Water looks flat; no shoreline detail | P3 | M | Animated UV/vertex wobble on the river, rocks/sand strip at the shore, docks at the marina (no OSM marina polygon — hand-place). |
| ~~W7~~ | ✅ Night: streetlights don't light anything | P2 | M | Add a few point lights to the shader (nearest 8 lamps) or fake light pools (unlit discs on the road under each lamp). Headlight cones for the player at night. **Done:** fake light pools + headlight cones, no shader point lights |
| ~~W8~~ | ✅ Sky clouds are static | P3 | S | Drift with time; hide below horizon properly. |
| W9 | Distant hills: real Gatineau Park profile | P3 | S | Use the MRNF DEM to make the ridge silhouette match. |
| ~~W10~~ | ✅ Minimap building fill still too dominant vs roads | P3 | S | Lower alpha or skip houses at small ranges. |

## Missions / game loop

| # | Item | Pri | Eff | Notes |
|---|------|-----|-----|-------|
| ~~G1~~ | ✅ Mission timers never tuned by a real player | P1 | S | Drive each job once, set timers at ~1.3× my time. `tour` checkpoints and `dep` are the tight ones. **Done:** tour/curfew retimed from the route table; still to be driven by a human |
| ~~G2~~ | ✅ Fail states are only "too late" | P2 | M | Add: damage kills the poutine ("sauce partout dans le char"), passengers bail if you crash > N times, cops after 3 red lights (see W4). **Partly: damage fails the canoe/couch stages, cops fail the job on a bust; passengers bailing not done.** |
| ~~G3~~ | ✅ More jobs | P2 | M | Ideas: drive-in at the Aylmer cinema, Sunday hockey at the arena, the ferry-less run to Quyon, snow tires at Canadian Tire, "return the Sunfire before Dave's dad gets home". **Done:** three side jobs shipped (canoe, Sayyad, couch); the other ideas remain **Done: three side jobs + four races.** |
| ~~G4~~ | ✅ Cops (Midtown Madness staple) | P3 | L | One cruiser spawns after reckless driving; chases on the road graph; lose it out of sight for 10 s. **Done: wanted meter, cruisers, roadblocks, tickets (src/game/cops.js).** |
| G5 | Passengers visible are just heads | P3 | S | Small torsos, and they lean in corners. |
| ~~G6~~ | ✅ Mission intro card | P2 | S | 2-second card with title, brief, timer, and a route preview on the map before the timer starts. |
| ~~G7~~ | ✅ Parked-car positions and current car don't persist across reloads | P2 | S | Save `G.parked` + `G.carId` + damage to localStorage. |
| G8 | Heritage College is an exit marker | P3 | L | Extend the map east along Lucerne to Cité-des-Jeunes with a low-detail corridor (roads + trees, no houses) so the drive is real. Cost: OSM refetch, ~4k more buildings if Plateau is included — probably cull those. |

## UI / polish

| # | Item | Pri | Eff | Notes |
|---|------|-----|-----|-------|
| ~~U1~~ | ✅ Speedo in km/h only | P3 | S | Add a real gauge (needle) and gear indicator. |
| ~~U2~~ | ✅ Toasts overlap when several fire | P2 | S | Queue them. |
| ~~U3~~ | ✅ Pause job list: click a job to set a waypoint to its start | P2 | S | |
| ~~U4~~ | ✅ Menu: car cards should show the actual 3D model (turntable) | P2 | M | Reuse `garage.html` logic inside the menu. |
| ~~U5~~ | ✅ Settings: invert look-back, steering sensitivity, FOV, French/English toggle | P3 | M | Copy is currently mixed FR/EN. |
| ~~U6~~ | ✅ Loading screen with the map building progress | P3 | S | Build takes 250 ms; only matters on old Intel Airs. |

## Cars

| # | Item | Pri | Eff | Notes |
|---|------|-----|-----|-------|
| C1 | Generate the four photo skins with Gemini and check them in `garage.html` | P1 | S | Prompts ready in `assets/cars/GEMINI-PROMPTS.md`. Expect 1–2 regenerations per view. |
| ~~C2~~ | ✅ Skinned model: end caps use the side texture if front/rear are missing — looks smeared | P2 | S | Fall back to flat body colour instead. |
| C3 | Interior visible through glass | P3 | M | Needs alpha glass + a dashboard/seat block. |
| ~~C4~~ | ✅ Brake lights, reversing lights, turn signals, headlights at night | P2 | S | Swap the lamp box colour multiplier by state; unlit glow discs at night. |
| ~~C5~~ | ✅ Engine audio per car | P3 | S | Ranger 4-cyl drone, Civic high-rev, Saturn buzzy, Sunfire with one blown speaker rattling above 40 km/h. |

## Tech / performance

| # | Item | Pri | Eff | Notes |
|---|------|-----|-----|-------|
| T1 | Measure real FPS on the Air (foreground window) and set quality defaults from `navigator.hardwareConcurrency` / GPU string | P1 | S | Not measurable from the throttled MCP tab. |
| T2 | Chunk meshes are one draw each (~100 draws/frame) | P3 | M | Merge into fewer VAOs per quality tier; not needed unless T1 says so. **Status:** skipped: chunk merge would defeat culling; measured 43–57 draws |
| T3 | `mapdata.js` is 3.2 MB | P2 | S | Gzip via the server, or split water/areas into a lazy chunk; quantise coords to int16. **Status:** skipped: gzip in serve.sh gets the same win for free |
| ~~T4~~ | ✅ Unit tests: `smoke2.mjs` lives in the scratchpad | P2 | S | Move to `tools/smoke.mjs` and add `npm test`-style script. |
| ~~T5~~ | ✅ Traffic ignores oneway when respawning | P3 | S | |
| ~~T6~~ | ✅ `hud.js` still has the old `places.js`-era colour names | P3 | S | Cosmetic cleanup. |
