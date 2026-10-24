# Aylmer Madness: the visual wave

Written 6 Oct 2026 by Claude (art director) for Tom. Machine-readable copy: `docs/visual-wave/tasks.json`. Keep the two in step.

Tom, 6 Oct: "I dont care if you have to spin up 50 agents to refine the textures, shadows, etc. Make it look fucking fantastic like midtown madness for a game of that era."

This plan turns that into 43 agent tasks in 7 waves. Every task owns an exact list of files, and no two tasks in one wave share a file. Each one proves its change with before/after captures at named poses, a budget check and `npm test` before it asks to merge. It sits under `docs/ROADMAP.md`: section 2 there (visual direction, palette, colour script, pillars) is the art bible, and this document is how we build it. Roadmap ids (V1 to V12, P2.x, P3.x, P6.x) are given on each task.

---

## 1. Where the look stands today (verified 6 Oct on `fix/look-on-qr`)

There are two renderers, and that is the single most important fact for this plan.

- **The ship renderer** (`index.html`, `src/core/gl.js`) is still the one-shader engine: vertex colour times an optional atlas, Lambert sun plus a hemispheric ambient, exp2 fog, a 16x6 two-colour sky dome with a sun disc, 28 flat octagon cloud puffs (`src/game/sky.js`), and a black alpha quad as the car shadow (`main.js drawCar`). There is no linear light, no tone curve, no post-process, no reflections, no AO, no wires and no lamp glow. Trees are 5-sided double cones 7 to 11 m tall (`world.js` section 6). The Phase 0 agent's `gradeLight()` (uncommitted in this worktree) removes the lime grass and blue road, and the "after" shots confirm it: olive lawn, mid-grey road, off-white walk. But the scene is still flat, toy-like and empty. Night is a uniform blue wash with no lamp pools.
- **The three.js prototype** (`prototype.html`, `src/prototype/renderer.js`, `nature.js`, `facade.js`, `siding.js`) already has most of the look: ACES plus a grade, sun-tinted haze, fbm cumulus, procedural brick, shingles and clapboard, windows with reveals, curtains and night lighting, storefront glazing, leaf-card trees, ground variation, sodium pools and near shadows (`docs/design/VISUAL-PLAN.md` sections 7a and 7b). It costs a 1.3 GB heap and shader stalls, and roadmap decision D1 recommends retiring it after porting.

**So most of this wave is a port, not an invention.** The prototype GLSL is the reference implementation for lighting, haze, sky, facades and glass. Each task ports one idea into the one-program `gl.js` pipeline, at a 2004 budget, behind a flag.

**Checked against the older look analysis** (`aylmer-madness/references/places/_feedback/analysis/_OVERALL-FEEL.md`, written on an older build):

| Finding | Status in the ship renderer today |
|---|---|
| 1 Lighting over-exposes, no tone map | Half fixed: `gradeLight()` (P0.1) is in flight. Still no linear light or tone curve, and white siding is close to clipping |
| 2 No wires, bare poles | Still true: grep finds no wire, catenary or crossarm code in `world.js` |
| 3 Canopy too small and sparse | Still true in `gl.js` (cones). Fixed only in the prototype (`vegetation.js`) |
| 4 Roads, curbs, walks flat | Partly better: mid-grey asphalt, but no texture, no wear and no rolled curb. Tom's street note 3 (dead-end walks) is still open |
| 5 Yards empty, no parked cars | Still true (bins and porch lamps landed with the buildings pass, prototype only) |
| 6 Sky flat, octagon clouds | Still true in `gl.js` |
| 7 Flat windows, plain boxes | Fixed in the prototype only (`FACADE_GLSL`). `gl.js` ignores the facade codes |
| 8 Fog and horizon | Still exp2 with a constant colour |
| 9 People and traffic | Unchanged |

**Budgets as measured today** (`tools/smoke_world.mjs`, whole map, no sector filter):

- town triangles under 4.76 M;
- resident house triangles (near plus far) under 1.3 M;
- vertex buffers under 345 MB. The measurement is 341 MB, so there is **only 4 MB of headroom**. Task V1-05 (vertex packing) is a hard prerequisite for anything that adds geometry.

Roadmap per-frame bars:

| Bar | Target |
|---|---|
| qb-frame (p95 frame interval) | 16.7 ms or less |
| qb-headroom (GPU plus CPU per frame) | 12 ms or less |
| qb-tris (triangles drawn, worst pose) | 450k or less |
| qb-draws (draw calls, worst pose) | 400 or less |
| qb-clip (clipped pixels at noon) | under 0.5 % |

---

## 2. What made the 2000 to 2004 city games read great, and what we take from each

Research via Gemini search (6 Oct), with the cited pages opened where they exist. GTA SA `timecyc.dat` was confirmed at gtamods.com. Midtown Madness 3's developer (DICE, Xbox, 2003, Paris and Washington) was confirmed at Wikipedia. Texture sizes for MM2 come from Gemini and modding lore and are approximate.

| Game | What it did | Why it read great | What we take |
|---|---|---|---|
| **Midtown Madness 2** (Angel Studios, AGE, 2000) | Mostly 128 to 256 px textures, 16-bit. Baked per-vertex lighting on city geometry. A textured sky dome with horizon and cloud bands. A sphere-mapped "chrome" texture on car paint. City in a grid of streamed cells with discrete LODs and fog | Clean, high-contrast textures and strong silhouettes. Every street has a rhythm (lamps, signs, trees). Cars gleam | Silhouettes before detail; prelit vertex colour (V1-02, V2-07); a sphere-map car reflection (V3-05); dense, rhythmic street furniture (V2-06, V2-09) |
| **Midtown Madness 3** (DICE, Xbox, 2003) | 256 to 512 px DXT textures, baked lightmaps for soft GI and AO, multi-layer cloud planes, sun flare, cube-map car reflections | Grounded buildings (baked AO under eaves and at wall bases); a believable sky | Baked AO and contact strips (V2-07); a layered sky (V1-03); cheap but convincing car env-maps |
| **GTA Vice City and San Andreas** (RenderWare, 2002 to 2004) | `timecyc.dat`: 8 keyframes a day (SA: 00, 05, 06, 07, 12, 19, 20, 22 h) times weather, each row holding ambient (static and for objects), directional light, sky top and bottom, sun core and corona, sprite brightness, shadow intensity, fog start, clouds, water colour. Day and night prelit vertex colours. Additive camera-facing coronas with occlusion fade. A PS2 colour filter and "trails" blur. Fog hides streaming | The light IS the mood: Los Santos smog, golden hour, sodium nights. Coronas make night magical for nearly nothing | A timecycle with SA-style fields (V1-02); coronas with depth fade (V4-01); a warm grade (V1-01); night window emissives (V3-02) |
| **Midnight Club 3 DUB** (Rockstar San Diego, 2005) and **Burnout 3** (Criterion, 2004) | Env-mapped clear-coat with Fresnel, low-res bright-pass bloom, framebuffer-feedback motion blur at speed, emissive window masks, wet-look asphalt specular at night | Speed and gloss: the car is the hero object, and night streets sparkle | Fresnel clear-coat (V3-05); bloom-lite on the high tier only (V5-01); wet roads with a sky sheen (V5-02); speed is shown by the FOV the game already has, with blur as an optional extra (Tom input T7) |
| **Mafia** (Illusion Softworks, LS3D, 2002) | Radiosity lightmaps on a period town, restrained palette, dynamic lights on cars and people only | A period town that feels lived-in and true. Restraint | Remembered realism: true materials, a calm grade, period props, never grimy (ROADMAP 2.1) |

**The common recipe, which is the spine of this plan:**

1. Light first: timecycle, tone curve and warm haze.
2. Grounding: baked AO, contact shading and blob or decal shadows. Real-time shadows are an option, not the base.
3. Clean, honest textures at a consistent texel density: 2004-sized tiles with large-scale variation, never photo-noise.
4. Density and rhythm of street furniture: poles, wires, lamps, signs, hedges, parked cars.
5. A hero car that gleams.
6. A night built from coronas, lamp pools and lit windows.
7. A few cheap full-screen tricks, for the high tier only.

**Texel density targets** (ours, set a little above 2004 because Tom plays at Retina resolution):

| Surface | Texels per metre (near) |
|---|---|
| Walls (siding, brick) | 128 |
| Roofs | 96 |
| Road and walk | 96 to 128, plus large-scale vertex-colour variation every 20 to 50 m |
| Lawn | 64, plus a variation map |
| Car body | 256 (car lofts are procedural; decals only) |

Mips are built by successive halving (H2).

---

## 3. Architecture moves that make 43 parallel agents possible

Today three files gate almost all visual work: `src/core/gl.js` (the only shader), `src/game/world.js` (a 2,700-line `buildWorld`) and `src/main.js` (render, env, drawCar). Forty agents cannot share them. **Wave 0 cuts them into seams first, with zero visual change**, and pre-creates a stub file for every later task, so no later task ever edits those three files.

1. **Shader modules (V0-01).** `gl.js` assembles one program from `src/core/shaders/*.js`, one chunk per concern: `common`, `light`, `tonemap`, `fog`, `sky`, `water`, `material`, `glass`, `car`, `decal`, `wire`, `corona`, `dynlights`, `wet`, `post`, `digicam`, `shadow`. Each chunk exports its GLSL and its own uniforms (`UNIFORMS` table, set via `r.uniform(name, value)`). Draw options route by `opts.material` (`world`, `sky`, `water`, `car`, `decal`, `wire`, `sprite`, `particle`) to a `uMaterial` int.
   - Still one program, so there is no mid-drive compile (ROADMAP 2.4).
   - A second sampler (`uTex2`, the ground atlas) is selected per face by a rect sentinel (`aRect.x >= 2.0`).
   - New renderer APIs: dynamic meshes (`uploadDynamic` / `updateDynamic`) and GPU timing (`r.gpuMs` via `EXT_disjoint_timer_query_webgl2`).
2. **World seams (V0-02).** The sections of `buildWorld` move into `src/game/world/*.js`, each a function over a shared build context (`ctx`: builders, `baseAt`, `roadAt`, `poles`, `trees`, the colliders and the furniture log):
   - `roads`, `walks`, `landcover`, `water`, `trees`, `furniture`, `distant`, `commercial`, `headlights`;
   - plus stubs for `wires`, `contact`, `shadowdecals` and `yards`, registered in `world/emitters.js`;
   - a `postBuild(ctx)` hook for bake passes.
   - The proof is identical vertex and triangle counts in `smoke_world` and pixel-identical captures.
3. **Look hooks (V0-03).** `main.js` hands its environment code to `src/game/look/envcycle.js` and calls a fixed set of hooks in `src/game/look/frame.js`: `beforeSky`, `afterWorld`, `perCar` (blob shadow, paint opts), `afterTransparent` and `post`. Per-frame callers come from stubs: `particles`, `coronas`, `headlights`, `parkedfleet`, `photomode`, `tiers`, `aobake`, `season`.
   - Feature flags live in `src/game/look/flags.js`. A URL `?look=-ao,-wires` turns any feature off, so **before and after can be shot from one build**.
   - The flags are also exposed as `AYLMER.look(flags)`. A new `AYLMER.time(hour)` sets the clock, so captures can pin any time of day.
4. **Tooling (V0-04).**
   - Named poses (`tools/aylmer-compare/poses.json`).
   - One capture command with `--poses --env --look --tag`.
   - `look-diff.mjs`: contact sheets, clipped-pixel %, region means against the palette, and a pixel diff.
   - `perf.mjs`: real Metal GPU, fixed poses, timer query, tris and draws, a machine lock.
   - `boot.mjs`.
   - `owned-files.mjs`: fails a commit that touches a file the task does not own.
   - `vis-check.mjs`: the whole self-check in one command.

**Memory rule:** no new per-vertex attributes. AO and prelight are baked into vertex colour, the way MM2 and GTA did it. Material codes ride in the existing `aRect` sentinel. V1-05 packs the vertex format (normals snorm8, colour unorm8, and so on) to buy back roughly 35 to 45 % of the 341 MB.

---

## 4. Named poses and environments

V0-04 writes these into `tools/aylmer-compare/poses.json`. Until it lands, use `tools/aylmer-compare/capture_lighting.mjs --envs=` with the core-refs poses.

**Street View eye poses** (2.5 m eye, the reference heading and FOV, no car), used for the look loop against the 2009 refs:

| id | Place | Reference |
|---|---|---|
| `fraser_front` | 299 chemin Fraser | `60b6f207_299_fraser_2009_east_front` |
| `mike_lawn` | 129 Frank-Robinson | `129_frank_from_south_300` |
| `denise_friend` | 75 Denise-Friend | its 2009 crop |
| `arial` | 1 rue Arial | its 2009 crop |
| `principale_british` | British Hotel, Principale | `comm_13_north` |
| `principale_strip` | Principale looking east | `strip_02_east_street` |
| `galeries_lot` | Les Galeries | `galeries_2009_parking_east` |
| `marina_quay` | Marina, Parc des Cèdres | marina 2009 ref |

**Game-camera poses** (chase cam behind the Ranger, car drawn, the frame the player actually sees: this is where Midtown Madness is judged):

| id | Place |
|---|---|
| `chase_fraser` | leaving 299 Fraser, westbound |
| `chase_principale` | eastbound at the British |
| `chase_lucerne_golden` | westbound on Lucerne toward Lac Deschênes |
| `chase_galeries` | in the Galeries lot |
| `chase_chemin_aylmer` | the long view east |
| `hood_hull_bridge` | hood cam on the Champlain Bridge approach |

**perf8** (the roadmap's fixed perf poses): Fraser drive, Mike's lawn, Principale at the British, Principale east, the Galeries lot, the marina, the Chemin d'Aylmer long view, the Hull bridge.

**Environments:**

| id | Setting |
|---|---|
| `morning` | 07:00 clear |
| `noon` | 13:00 clear |
| `haze` | 14:00 haze |
| `golden` | 19:30 clear |
| `dusk` | 20:45 clear |
| `night` | 23:30 clear |
| `overcast` | 12:00 overcast |
| `rain` | 16:00 rain |
| `storm` | 16:30 storm |

**Pose sets used in acceptance criteria:**

| Set | Poses | Environments |
|---|---|---|
| `core` | the 8 eye poses | noon |
| `chase` | the 6 chase poses | noon, golden, night |
| `allday` | `fraser_front`, `principale_strip`, `chase_lucerne_golden` | all 9 environments |
| `perf8` | the 8 perf poses | noon, night, rain, at tiers low, med, high |

---

## 5. The self-verification loop every task runs

Every task's acceptance criteria end with this loop. The agent iterates until every item passes, then writes `docs/visual-wave/reports/<task-id>.md` with the numbers and image paths. It never claims "done" from code alone.

1. **Before.** On the task's branch, with its flag OFF:
   `node tools/qa/vis-check.mjs --task=<id> --tag=before`
   This runs `capture.mjs --poses=<task sets> --env=<task envs> --look=-<flag>`.
   Until V0-04 lands, use `node tools/aylmer-compare/capture_lighting.mjs --envs=day:clear,dusk:clear,night:clear` with `CMP_OUT` set to the task's scratch folder.
2. **Build behind the flag.** Default ON, and `?look=-<flag>` restores the old look exactly.
3. **After.** `node tools/qa/vis-check.mjs --task=<id> --tag=after`, then `node tools/qa/look-diff.mjs --a=before --b=after`.
   - Contact sheets: before | after | 2009 ref.
   - Clipped-pixel % at noon (under 0.5 %).
   - Lawn, road, wall and sky region means within plus or minus 8 per channel of `assets/look/palette.json`.
   - A pixel diff on poses the task should NOT have changed (any change over 1 % of pixels outside the task's scope is a bug).
4. **Look at it.** The agent opens every contact sheet and scores the rubric lines its task affects (ROADMAP 5.3), including the 160x90 thumbnail test. For any task that changes colour or light, get a second opinion from Gemini via `mcp__gemini__gemini_analyze`, starting the prompt with "Do not run any commands or tools." If either score drops on any line, fix it before moving on.
5. **Budgets.**
   - `node tools/smoke_world.mjs`: town tris under 4.76 M, houses under 1.3 M, vertex MB under the current ceiling (345, or the new ceiling V1-05 sets).
   - `node tools/qa/perf.mjs --poses=perf8 --env=noon,night,rain --tier=med`, taken under the perf lock, on the MacBook Air when possible. Pass: p95 interval 16.7 ms or less; p95 GPU plus CPU (timer query) 12 ms or less; tris 450k or less; draws 400 or less; and the task's own declared delta (`budget` in tasks.json) not exceeded.
   - On a faster machine (the Mac mini), the GPU bar becomes 8 ms as an Air proxy. The lead re-measures on the Air at merge.
   - Never use the SwiftShader capture run for timing: SwiftShader is software rendering, kept for deterministic pixels.
6. **Tests.**
   - `npm test`: every suite passes. Never loosen a test. Golden numbers move only for an intended change, in the same commit, with the reason.
   - `node tools/qa/boot.mjs`: 0 console errors on `index.html` and `prototype.html`.
   - `node tools/qa/owned-files.mjs --task=<id>`: only owned files are changed.
7. **Report.** Write the report, set the task's status in `tasks.json`, commit (one commit per logical change, attribution lines per house rule), and hand back to the lead with the contact-sheet paths.

**Machine discipline (many agents, one machine):**

- Each task uses its own ports: `CMP_SRV_PORT = 8200 + n` and `CMP_CDP_PORT = 9400 + n`, where n is the task's index in tasks.json.
- Captures may run in parallel. Perf runs never do: `perf.mjs` takes `tools/qa/.perf.lock` and waits.
- Headless and closed afterwards. Nothing is left on Tom's screen. Throwaway Chrome profiles only; never Tom's browser data.

---

## 6. Waves

The waves run in order. Inside a wave, every task runs in parallel in its own worktree. The `files` lists in tasks.json are disjoint within a wave. Later waves may own a file that an earlier wave owned.

| Wave | Theme | Tasks | Runs after |
|---|---|---|---|
| 0 | Seams and tools (no visual change) | 5 | Phase 0 merged, P1.1 compare tool committed |
| 1 | Light, air, sky and the texture sources | 7 | wave 0 |
| 2 | The street: ground, roads, walks, canopy, wires, grounding, furniture, parked cars | 10 | wave 1 |
| 3 | Buildings, glass, Principale, landmarks, car paint, water, colour tune 1 | 7 | wave 2 |
| 4 | Night lights, headlights, particles, car details | 4 | wave 3 |
| 5 | Post, rain and storm, HUD, menu, tiers | 5 | wave 4 |
| 6 | Optional high tier and final polish (shadows, digicam, final colour script, perf, season) | 5 | wave 5 (and Tom's answers) |

**Sequencing inside a wave.** Tasks in a wave run in parallel, with three exceptions, all marked in `depends`:

- **Contracts published at wave start.** V3-04 needs V3-02's glass material code, and V4-02 needs V4-01's corona API. The owning task commits the interface (a constant or a function signature with a stub) in its first hour. The dependent task builds against it.
- **V3-07 runs last in wave 3**, on the merged tree.
- **Wave 6 has a short tail.** V6-01, V6-02 and V6-05 run in parallel. V6-04 follows V6-01, and V6-03 is last.

**Globs in `files`** use gitignore rules: `*` never crosses a `/`, and `**` means everything below a folder. `owned-files.mjs` enforces them.

Total: **43 tasks**, about 28 agent-days of effort (S = under 1 h, counted as 0.15 day; M = a few hours, 0.5; L = a day or more, 1.5).

**Models:**

- Opus for anything in the shader or renderer, any bake, the world geometry where budgets are tight, and the colour tuning.
- Sonnet for texture generation scripts, props, tooling, HUD and menu, and mechanical wiring.

### Wave 0: seams and tools (all parallel, no visual change)

- **V0-01 Shader modules** (`gl.js`, `src/core/shaders/**`): split the program into chunks; add the uniform registry, material routing, a second sampler, dynamic meshes and the GPU timer. Pixel-identical. Opus, L.
- **V0-02 World seams** (`world.js`, `src/game/world/**`): `buildWorld` into section modules, stubs for future emitters, and a postBuild hook. Identical counts and pixels. Opus, L.
- **V0-03 Look hooks** (`main.js`, `src/game/look/**`): env code into `envcycle.js`; frame hooks, flags, `AYLMER.time` and `AYLMER.look`; stubs for every later look module; the blob shadow moved unchanged. Opus, M.
- **V0-04 QA tools** (`tools/aylmer-compare/*`, `tools/qa/**`): named poses, one capture command, look-diff, Metal perf with lock and timer, boot, owned-files and vis-check. Sonnet, M.
- **V0-05 Palette and art bible data** (`assets/look/**`, `docs/visual-wave/ART-BIBLE.md`): sample the 2009 refs at matching poses into `palette.json` (linear albedos and on-screen targets), plus a material reference board (gitignored crops). Sonnet, M.

### Wave 1: light, air, sky, texture sources

- **V1-01 Linear light and filmic curve** (V2): sRGB decode, lighting and fog in linear, a filmic curve plus grade uniforms, sky dither, an albedo ceiling. Port from the prototype's ACES and grade.
- **V1-02 Timecycle** (V3): `assets/look/timecycle.json` with SA-style fields, 9 keys a day times 6 weather types; an interpolator 4 times a second; `weather.js` reads rows instead of tinting.
- **V1-03 Sky and clouds** (V4): per-pixel gradient, Mie glow, an fbm cloud deck plus cirrus, the sun corona, stars, the town glow.
- **V1-04 Aerial perspective** (V5): fog takes the horizon colour plus sun inscatter, with a height falloff; forest-edge rings on the Gatineau hills and the Ontario shore.
- **V1-05 Vertex packing**: the packed vertex layout; `smoke_world` measures real bytes. Target: 341 MB to 220 MB or less, which gives every later task geometry room.
- **V1-06 Facade atlas v2**: the house atlas at 128 texels per metre, CC0 or procedural tiles, per-tile tint variance, successive-halving mips.
- **V1-07 Ground atlas**: a new second atlas for asphalt (3 wear grades), crack seal, patches, concrete walk with joints, curb, Principale pavers, grass, dry grass, gravel, dirt, sand, stall lines, manholes and grates, worn paint.

### Wave 2: the street

- **V2-01 Road surface** (P3.7): roads on the ground atlas; wheel tracks, crack seal, a patch per block, salt-faded paint, crosswalks on commercial streets, manholes and grates. The Principale rule (no centre dashes) is kept.
- **V2-02 Walks and curbs**: rolled curbs, joints every 1.5 m, the Principale paver walk at 4.5 m, slabs continuous across drives (Tom's note 3).
- **V2-03 Lawns and land cover**: tiled grass with large-scale variation, dry edges, darker under crowns, mower stripes on kept lawns, gravel shoulders, beach sand.
- **V2-04 Tree kit** (P3.2, P3.3):
  - species: maples and ash with opaque lump crowns in 3 colour families, spruce tiers, cedar, white pine, birch;
  - street trees every 12 to 16 m on every housed road class;
  - a back-yard canopy behind residential frontages;
  - a cheap far LOD.
- **V2-05 Hedges, fences, drives** (P3.4, P3.9): cedar hedges on lot lines, fences on real lot lines only, gravel and cracked drives, yard props.
- **V2-06 Hydro poles and wires** (P3.1): cedar poles with crossarms, pale insulators and transformer cans; 3 to 6 sagging lines with a minimum on-screen width of 1.2 px; cobra-head lamps; snapping still works.
- **V2-07 Baked AO and contact** (V6, P3.5): per-vertex AO baked into vertex colour on walls, eaves and corners; contact strips at wall bases, curbs, poles and hedges.
- **V2-08 Shadow decals** (V7, P3.6): a soft ellipse per tree and a skewed footprint per house, both moving with the sun.
- **V2-09 Street furniture**: Canada Post boxes, galvanised mailboxes, hydrants, bins, newspaper boxes, ARRÊT signs, signal housings, STO stops, benches.
- **V2-10 Parked fleet** (P3.8): period cars in 60 % of drives, one per 40 m of curb, lots 30 % full with stall lines; instanced and distance-culled.

### Wave 3: buildings, cars, water

- **V3-01 House facades, roofs, trim** (P3.11): the atlas v2 in use; fascia, corner boards, chimneys on about 1 in 3 gables, 0.1 m window reveals, roof tint variance. The cheap prototype ideas are ported.
- **V3-02 Glass and windows** (V8, P3.10): sky reflection with Fresnel, curtains and blinds, night rooms (incandescent, about 45 % lit), TV flicker, fake storefront interiors.
- **V3-03 Principale and commercial** (P4.1 visual half): `FACADE_GLSL` storefronts ported, awnings, sign boards with 2004 names, parapets, lamp standards per Tom's D13.
- **V3-04 Landmark materials pass**: the hero buildings get the new materials, AO and windows (the British, the Symmes, 299 Fraser, Mike's, Glenwood, Saint-Paul if built).
- **V3-05 Car paint** (MM2 and MC3 gloss): a runtime sphere map built from the timecycle sky and a skyline band, a Fresnel clear-coat, a sun specular, an age and dirt factor per car (the Ranger a little yellowed).
- **V3-06 Water**: Lac Deschênes takes the sky by view angle, a sun glitter path at golden hour, tea-brown shallows at the beach, a wet shore band, marina mast and dock polish.
- **V3-07 Colour script tune 1** (P2.6): tune `timecycle.json` and `palette.json` at all 9 environments now that the materials exist; Gemini plus Claude scoring.

### Wave 4: night, lights, particles, car details

- **V4-01 Sodium night and coronas** (P6.1): cobra-head glow, sodium pools, GTA-style corona sprites with an occlusion fade, the town glow.
- **V4-02 Headlights and tail lights**: a projected ground wash for up to 6 cars, lens coronas, red tails and brake lights, and the hood-cam rule kept (no wash over the screen).
- **V4-03 Particles**: one dynamic pool: tyre smoke, gravel and grass dust, scrape sparks, damage smoke and steam, cold-morning exhaust.
- **V4-04 Car details**: wheels (rims, sidewalls, hubcaps), Quebec plates ("Je me souviens"), tinted glass with interior silhouettes, the Ranger's wear, trim chrome.

### Wave 5: post, weather, UI, tiers

- **V5-01 Post pipeline** (V10): an offscreen MSAA target and blit; dual-Kawase bloom-lite, vignette and grain on the high tier.
- **V5-02 Rain and storm** (P6.2): wet roads with a sky sheen and puddles, rain streaks in 3D, spray via the particle API, lightning (2-frame flash), a green-grey storm row.
- **V5-03 HUD polish**: a period-true speedo, minimap and toast styling; legible at 60 km/h; French first.
- **V5-04 Menu and title art**: a golden-hour hero shot over Lac Deschênes for the menu (D4), the logo, the garage turntable lighting.
- **V5-05 Performance tiers** (V9): every look flag mapped to low, med and high; auto-detect; the options row.

### Wave 6: optional high tier and final polish

- **V6-01 Near sun shadows** (V11, D15): one stabilised 2048 px map, 60 to 80 m, high tier only, 2 ms or less, or it ships off.
- **V6-02 2004 digicam photo mode** (V12, D6).
- **V6-03 Final colour script**: all 9 environments times all poses, a Tom review pack.
- **V6-04 Final perf and tier tuning** (P8.2): the Air, the Mac mini, one older laptop.
- **V6-05 Season shift** (P3.12, D3): June to August lawn and leaf drift (only if Tom says yes).

---

## 7. Merge and integration protocol

**Branches and worktrees:**

- The base is the review branch after Phase 0 is merged: `claude/quality-review-2026-09-29`, or whatever the checkpoint names then.
- Per wave, the lead creates `visual/wave-<N>` from the base, and one worktree per task: `~/Desktop/Coding Projects/wt-vis-<id>` on branch `vis/<id>`, from `visual/wave-<N>`.
- Agents commit only their owned files. `tools/qa/owned-files.mjs` is run before every commit.
- Wave 0 is the exception: before V0-04 exists, the lead checks ownership by hand with `git diff --stat`.

**Lead merges, one task at a time, in the wave's listed order:**

1. Read the task's report and contact sheets. A task without a report does not merge.
2. `git merge --no-ff vis/<id>` into `visual/wave-<N>`.
3. Run, on the merged tree:
   - `npm test`;
   - `node tools/qa/boot.mjs`;
   - `node tools/smoke_world.mjs`;
   - the look loop on the `core` and `chase` sets (`vis-check.mjs --all --tag=merge-<id>`);
   - a pixel diff against the previous merge.
   Anything that changed outside the task's declared scope is a bug: revert the merge, and return it to the agent.
4. After the last merge of the wave, run the full loop:
   - `allday` and `perf8` on the Air at all tiers;
   - Claude plus Gemini rubric scores (`look-score.mjs` once P1.6 exists).
   - Write `docs/visual-wave/reports/WAVE-<N>.md`: the score table versus the last wave, the perf table, and any regressions.
5. **Tom review gate:**
   - Build the compare page for the wave (`build_index.mjs`) and publish a private review artifact with the before/after pairs and a comments box.
   - Tom looks and comments. His feedback lands in `references/places/_feedback/LATEST.md` (or the artifact's comments), and `tom-gate.mjs` maps it to tasks.
   - Anything Tom marks wrong becomes a fix task in the next wave, or a flag turned off. Nothing merges into the review branch until Tom has seen its pair (qb-tom).
   - Waves may keep moving while Tom is away: wave N+1 may start from `visual/wave-<N>` before Tom's gate, but `visual/wave-<N>` merges into the review branch only after it.
6. Merge `visual/wave-<N>` into the review branch. Update `docs/REVIEW-CHECKPOINT.md`, `docs/roadmap.json` statuses and `PROJECT.md`. Push to GitHub (ANaughtyMoose) once Tom has said yes to D7.

**Rules that hold throughout:**

- Every visual change sits behind a look flag, ON by default once merged and revertible by URL. A flag that fails its tier budget is switched off for that tier, never shipped "for later".
- No new shader programs, no per-frame allocations, no `discard` on foliage, no new per-vertex attributes.
- Realism over invention: places, names and props from the references and Tom's memory. Texture sources are CC0 (ambientCG, Poly Haven, Kenney) or generated, never copied from Street View, because the repo is public.
- No em dashes in any new text, code comment or doc.
- Vendors are never swapped: Claude builds, Gemini gives second opinions.
- If a session dies, a task resumes from its report and its last commit; each finished unit is committed as it lands.

---

## 8. What needs Tom (one line each, plain decisions)

| id | Question | Blocks |
|---|---|---|
| T1 (D1) | Ship `index.html` / `gl.js` as the one renderer, port the prototype's look into it, and retire `prototype.html` after wave 3? | wave 0 start |
| T2 (D2) | "Remembered realism with 2004-game discipline" as the art direction? | wave 1 grade |
| T3 (D8) | Review the Phase 0 pairs so Phase 0 can merge (the wave base) | wave 0 start |
| T4 | Approve running about 43 agent tasks (about 28 agent-days of Claude usage) across 7 waves | wave 0 start |
| T5 (D4) | Golden hour over Lac Deschênes as the signature look for the menu and finale? | V5-04, V3-07 |
| T6 (D5) | Nights readable (blue fill plus sodium) or truly dark? | V4-01, V1-02 night rows |
| T7 | Speed blur at high speed (Burnout style) on the high tier: yes or no? | V5-01 |
| T8 (D6) | Bloom-lite, grain and the 2004 digicam photo mode on the high tier: yes or no? | V5-01, V6-02 |
| T9 (D15) | Real-time near sun shadows on the high tier if they cost 2 ms or less? | V6-01 |
| T10 (D3) | Lawns and leaves drift from June green to August dry over the summer? | V6-05 |
| T11 (D13) | Principale in 2004: heritage lamps or cobra heads, parking on both curbs, and the shop names you remember on the strip | V3-03, V4-01 |
| T12 | Car paint: showroom gleam (MM2) or period-dull with age (the Ranger yellowed, sun-faded paint)? | V3-05 |
| T13 | HUD and menu style: 2004 retail-box energy (bold, chrome, orange) or quiet and modern? | V5-03, V5-04 |
| T14 | Review gate after each wave: about 15 minutes in the compare page or the artifact | every wave |

Recommended answers, so Tom can just say yes:

| Question | Recommendation |
|---|---|
| T1 | yes |
| T2 | yes |
| T5 | yes |
| T6 | readable |
| T7 | no, the FOV already says speed |
| T8 | bloom-lite yes on high only; digicam as a photo mode only |
| T9 | yes if it meets 2 ms |
| T10 | yes, subtle |
| T12 | gleam on the paint, age in the decals |
| T13 | 2004 energy, but restrained |

---

## 9. Risks and how the plan handles them

- **Vertex memory (4 MB headroom).** V1-05 runs in wave 1, before any geometry task in wave 2. If it delivers less than 25 %, wave 2 tasks get halved geometry caps (written in each task's `budget`), and the lead decides which features win.
- **One shader growing too big for the Air.** Each chunk branches on a uniform that is constant per draw (coherent). V0-01 records ALU and instruction counts. Any task that adds more than 0.3 ms GPU at perf8 must justify it in its report.
- **The prototype path.** Every wave keeps `prototype.html` booting with 0 errors (`boot.mjs`) until T1 says to retire it. No task edits `src/prototype/**` except to read it.
- **Taste drift across 43 agents.** One palette (`assets/look/palette.json`), one timecycle and one rubric. Colour tune passes in waves 3 and 6, plus Tom's gate per wave.
- **Phase 0 agents are editing `src/` right now.** Wave 0 starts only after Phase 0 merges. Its seam tasks re-run their identity proofs on the final base.
