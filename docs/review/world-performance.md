# World, visual and performance review

29 September 2026. Branch `claude/quality-review-2026-09-29`. This pass is read-only. The code was read and checked with Node smoke suites and throwaway Node probes (kept outside the repo). No browser was launched. Section 4 is the browser measurement plan for the lead to run later.

Severity: **S1** blocks the release or badly breaks what the player sees. **S2** is clearly visible or expensive. **S3** is minor. **S4** is tooling or hygiene.
Confidence: **High** means the code path is certain and a Node probe reproduced it. **Medium** means the code path is certain but the size of the effect still needs measuring. **Low** is a plausible hypothesis.

---

## 0. What was run

The load average was 3.3 at the start, so the Node timings are usable.

| Suite | Result | Notes |
|---|---|---|
| smoke_ground | 15/15 | decode 5 ms |
| smoke_terrain | 75/75 | `groundAt` 84 ns/call with the hill, 1.42x flat |
| smoke_street_surface | PASS | only **4 sample points** at one crossing, tolerance 0.15 m |
| smoke_landmarks / smoke_landmark_ground | PASS | 32 sites, 65,877 tris |
| smoke_walls | 24/24 | |
| smoke_world | 23/23 | two sectors: 888k near + 230k far house tris, **327 MB vertex data** |
| smoke_topography_mesh | PASS | mesh vs physics max 0.084 m in the one 24 m window it checks; full map 5.80M tris, 9.53M verts, 8,096 uploads, **12.2 s** build (loaded machine) |
| smoke_camclip | 37/37 | tests `clipCamera()` alone: no landmark case, and not the smoothing in main.js |
| smoke_prototype | PASS | the adapter without WebGL; it *asserts* that the vertex arrays stay readable |
| smoke_sectors | 12/12 | Aylmer bake 4.2 s, Hull 2.7 s, Chelsea 1.7 s, Ottawa 1.1–1.3 s (Node) |
| smoke_principale / smoke_homeparking | PASS | |

Scratch probes, in the session scratchpad and not committed:
- `probe_surface.mjs`: drawn road top surface against `groundAt` at 24,226 centreline samples, and every archetype driveway slab against `baseAt`.
- `probe_camclip.mjs`: `clipCamera()` against real landmark collider walls, after `installLandmarks`.
- `probe_sign.mjs` / `probe_sign2.mjs`: storefront board heights before and after `primeSignage`, with the real `assets/text/storefronts.json`.
- `bench_upload.mjs`: the cost of the prototype `upload()` repack.

---

## 1. Proven defects

### D1 [S1, High] The chase camera goes inside all 32 hero landmarks, including every Principale model

**Observed.** A 7 m boom crosses a landmark collider wall and ends 4 m inside the building, with the focus 3 m outside. The camera is **not pulled in for 385 of 397 cases**. This covers every Principale site: solpfk, stone172, unitedchurch, church160, pizzagelato, mocaloca, garage143, oldlibrary, british, morin, clocklibrary, and also the Symmes inn, the Galeries and the arenas. In the probe output, `[key, tests, missed]` reads `["british",18,18]`, `["garage143",4,4]`, `["galeries",13,13]` and so on.

**Expected.** The camera stops 0.6 m short of the wall, as it does for ordinary houses.

**Cause.**
- `landmarks.js:1992-2001` wraps `world.querySegments` only. `world.buildingAt` is never wrapped.
- The OSM footprints under each site are collapsed to 2 cm stubs. smoke_landmarks prints "collapsed footprints are 2 cm stubs", so `buildingAt` returns false across the landmark.
- `camclip.js:83-88` treats a crossing with no footprint behind it as a fence. It ignores that fence when the ray is more than 1.9 m above the ground, and the chase camera sits at 3.7 m (`cockpit.js:30`).
- `marchOut` (`camclip.js:137-145`) relies on `buildingAt` too, so it cannot rescue the camera.
- The same blind spot affects `tow.js:46`: a T or Y reset can accept a spot inside a landmark.

**Fix.** Make `installLandmarks` also wrap `world.buildingAt` with each site's footprint rings (`bakeColliders` already has them). Or tag landmark segments `solid: true` and have camclip treat them as opaque.

**Validation.**
- Rerun the probe and expect 0 misses.
- Add a landmark case to `smoke_camclip.mjs`.
- In the browser, run the camera-inside metric in section 4.4 along Principale.

### D2 [S1 for Principale and Galeries readability, High] Storefront signs are rebuilt at sea level and end up buried

**Observed.** `primeSignage` (`signage.js:353`) calls `buildSignage(renderer)` without the `yAt` height field. The first bake (`sectors.js:132`) passes `baseHeightAt`. `signage.js:363-367` warns about exactly this.

With the real storefronts.json, 10 of the 11 boards on the LiDAR raster end up **completely underground**:
- (-1073, -55), near Morin and Principale west, is 9.1 m under.
- (-66, -266), the Galeries, is 25.3 m under.
- (-219, -1526) is 41.6 m under.

The boards in Hull and Ottawa are unaffected, because the base there is zero.

The old mesh and its 2048x1024 canvas texture are also never freed (`signage.js:356`).

**Fix.** Pass the height field through: `primeSignage(r, G.world.signage, '', baseHeightAt)` at `main.js:874`, with `buildSignage(renderer, yAt)` at line 353. Free the old mesh and texture before swapping them in.

**Validation.** Use the in-page check in section 4.5, and add a Node test like `probe_sign2.mjs`.

### D3 [S2, High] Driveways are flat slabs at the house's footing height and float or sink on slopes

**Observed.**
- `houses.js:1373-1377` lays a single flat quad at `y0 + Y_DRIVE`, about 9 m long (`setback + 2`). `y0` is the median footing of the footprint.
- The same pattern is in `glenwood.js:280` and `:285` (the prototype carports), which the probe did not count.
- Probe over 4,541 archetype driveways, measuring the slab against `baseAt` at its four corners and centre:
  - **2,883 (63 %) have a corner more than 0.25 m in the air.** The worst floating corner is 0.35 m at p50, 0.74 m at p90 and 1.20 m at p99, with a maximum of **2.15 m at (-591.8, 850.5)**.
  - 752 have a corner buried more than 0.1 m under the lawn.
- Cars ride on `groundAt`, so a car on a floating slab visibly sinks into it.

**Expected.** The driveway follows the lawn, which is draped on `baseAt`, to within a few centimetres.

**Fix.** Drape the driveway as a strip subdivided along its length: `baseAt(x, z) + Y_DRIVE` at each vertex, with the house end clamped to `y0`. Or tilt one quad between the heights at its two ends.

**Validation.** Rerun `probe_surface.mjs` and expect the p99 float under 0.08 m. Take close-camera screenshots at the five worst coordinates the probe prints.

### D4 [S2, High on cause, Medium on size] The prototype renders a headlight shadow map every frame, even at noon

**Observed.**
- `renderer.js:65-67` gives the left SpotLight `castShadow = true` for good. By day its intensity is 0 (`renderer.js:163`), but three.js r170 still renders a shadow map for every visible light with `castShadow`. It only skips a light when `shadow.autoUpdate === false` and `needsUpdate === false`.
- The sun is gated this way (`renderer.js:158`). The headlights are not.
- The cost is an extra depth pass of every caster in a 65 m cone, into a 1024² map, with PCF soft filtering, all day.
- Separately, every lit fragment evaluates 1 directional light, 2 spots and 6 point lights at all hours. Three does not drop lights whose intensity is zero.

**Fix.** Set `l.shadow.autoUpdate = night > 0.02` for both headlights. This does not trigger a program recompile. Leave the light count constant, since changing it would force recompiles.

**Validation.** At a fixed noon pose, compare `engine.info.render.calls` and the frame time over 600 frames, with the fix and without it (section 4.6 A/B).

### D5 [S2, High on cause, Medium on size] The prototype keeps every vertex array in the JS heap

**Observed.**
- `renderer.js:106-111` builds position, normal and colour arrays (plus optional uv, atlasRect and a Uint32 index) and hands them to `THREE.BufferAttribute`. Three keeps `.array` for the whole session.
- The original renderer drops the CPU copy right after `bufferData` (`gl.js:174-199`). The prototype heap should therefore be roughly the original's plus all resident geometry.
- For scale, smoke_world reports 327 MB of vertex data for two sectors. The session log estimates 270 MiB of prototype geometry.
- VERIFY's bar is a heap under about 500 MB and no Safari reload banner. At the last recorded measurement (commit `29d8333`), the original renderer's heap was 148–169 MB.

**Fix.** After the first upload, release the attribute arrays: `attr.onUpload(function(){ this.array = null; })` for position, normal, colour, uv and atlasRect. Keep the index, which `blankIndices` needs, and keep the bounding boxes, which are computed first. `smoke_prototype.mjs` reads `color.array[0]` and would need the assertion adjusted; say which side was wrong in the commit, as VERIFY rule 3 asks.

**Validation.** Run `measure_memory.mjs` against prototype.html and index.html (section 4.7). The prototype heap should fall to within about 50 MB of the original.

### D6 [S3, High] Repainting a car leaks its old mesh

`economy.js:197` sets `G.meshes.cars[id] = G.renderer.upload(buildCarBody(spec))` without freeing the previous handle. Each repaint leaks the old GPU buffers. In the prototype it also leaks the Mesh nodes and their materials. The fix is `G.renderer.free(G.meshes.cars[id])` first.

### D7 [S3, High] The prototype has a second, full Three renderer for the menu turntable, and it is never disposed

- `turntable.js:6` and `:33` import `../core/gl.js`, which the prototype.html import map (line 197) points at the prototype renderer.
- So the menu gets a second `THREE.WebGLRenderer` and WebGL context. It carries a 2048² sun shadow map (about 16 MB), a 1024² spot shadow map, a PMREM environment, three JPG surface textures, and every car body and wheel uploaded.
- `turntable.stop()` (`main.js:826`, `:845`) only halts the rAF loop, so all of this stays resident while driving.
- While the menu is up, it also does a synchronous `readPixels` per card at 12 fps.

**Fix.** Dispose it on the way into drive (`engine.dispose()` plus `forceContextLoss()`), or give the turntable a small unlit, shadowless path.

### D8 [S3, High on cause, Medium on size] Every sector's map data is parsed at boot

- `mapdata.js:1` imports `highway_to_hull.js`, which imports `hull_mapdata.js` (**15.8 MB**).
- `main.js:468` imports `ottawa.js`, which imports `ottawa_mapdata.js` (2.2 MB).
- With mapdata.js (4.5 MB), ground_data.js (0.75 MB) and three.module.min.js (0.69 MB), about **24 MB of JS** is downloaded, parsed and evaluated before the menu responds. Yet only the start sector is baked; the rest bake lazily.
- `boot.js:16` also awaits `calendar.loadSummer()` before it even starts importing main.js, which serialises one more fetch in front of the 24 MB.

**Fix.** Load `hull_mapdata` and `ottawa_mapdata` with `import()` inside `sectors.load`, where the seam card already hides the wait. Start `loadSummer()` in parallel with `import('../main.js')`.

**Validation.** Section 4.3 (Resource Timing and time-to-`window.AYLMER`).

### D9 [S4, High] The measurement tooling hides stalls, reports nothing for build time, and can wipe Tom's data

- `renderer.js:198` records only frame intervals under 250 ms. `main.js:1760` clamps dt to 0.25. So the prototype's "Mesurer les performances" p95 **cannot show a long stall**. The backlog already notes this.
- `G.buildMs` is never assigned anywhere; only bigmap and streetprops have their own. `measure_memory.mjs:72` therefore always prints `buildMs: null`.
- VERIFY.md:147's `&ua=safari` is read by no code.
- `headless.mjs --fresh` and `measure_memory.mjs` (which always runs `Storage.clearDataForOrigin` with `all`) clear the **whole origin**. Pointed at port 8140 or 8141, they would delete Tom's prototype saves and his IndexedDB local-radio library. `?audioReview` only changes the key prefix, not the origin.
- `headless.mjs` clicks `#start` 1.5 s after navigation. The prototype's boot has to import 24 MB of JS first (D8), so on a loaded machine the click can land before `main.js` has bound it. That ends in "mode=menu".

### D10 [S3, High] Per-frame allocations and O(n) scans in the hot paths

At 60 fps with one sim step per frame. "Draws" means renderer draw calls, estimated at 200–400 per frame until measured.

| file:line | What | Cost |
|---|---|---|
| `src/prototype/renderer.js:187` | `color(opts.colorMul \|\| WHITE)` makes a new `THREE.Color` and `setRGB` per draw | about 12k–24k objects/s. The largest item. Cache one linear colour per `colorMul` array (WeakMap) and skip the copy when unchanged. |
| `src/prototype/renderer.js:142` | `new THREE.Matrix4()` per frame | 1 per frame |
| `src/prototype/renderer.js:144-150` | about 7 `color()` calls, 2 `new THREE.Color(hex)`, `e.sun.map`, `Math.max(...e.sun)` | about 11 per frame |
| `src/prototype/renderer.js:153`, `:162` | 3 `new THREE.Vector3` | 3 per frame |
| `src/prototype/renderer.js:164` | every 30 frames: `filter` plus `sort` with the distance recomputed in the comparator, over `G.world.poles` (up to 2,500 with all sectors) | 2 arrays and about 25k comparator calls every 0.5 s, roughly 0.1–0.3 ms. Use a partial top-6 selection over `queryPoles(x, z, 120)`. |
| `main.js:1330-1335` and `daylight.js:19-38` (prototype only) | `setCycleEnv()` runs every **tick** from `updateDayNight`. `environmentAt` builds about 15 arrays (`rgb`, `mix`), then 3 `.map` calls plus a spread | about 20–25 arrays per tick, 1–8 ticks per frame. Recompute 4 times a second or write into a scratch env. |
| `economy.js:169` | `G.carId + ':' + JSON.stringify(mods)` per rAF | 1–2 strings per frame |
| `main.js:2511`, `:2521` | `drawCar`: an opts object plus the `[1,-1]` and `[-1,1]` literals per car | about 3 objects × cars drawn (about 15–25) |
| `main.js:2459`, `:2123` | `Object.keys(G.parked)` per frame and per tick | 1 array plus `asBody` per parked car per tick |
| `main.js:2548-2560` | `markerList()`: array, objects, `availableMissions(G)`, `Object.keys().filter` per frame, plus the `hud.draw({...})` literal | about 10–30 objects per frame |
| `core/gl.js:356` (original renderer) | every transparent draw pushes `[mesh, new Float32Array(model), opts]` | lamp pools within 330 m at night plus the blob shadows: about 20–40 per frame |
| `world.js:2637` | linear pass over every chunk of every loaded sector (3,344 for Aylmer, about 10k with all four) | about 10–40 µs per frame. Fine. |
| three.js scene traversal | Nodes are never removed from `scene`, only hidden (`renderer.js:137`, `:176`). The scene grows to one Mesh per handle-use seen this session. Three walks every node in the colour pass and in each shadow pass (sun, plus the headlight from D4). | O(nodes seen) × 3 per frame. Hypothesis H10. |

Total: on the order of 10⁴ short-lived objects per second, which is minor-GC material. Section 4.8 measures it.

`camclip.js`, `terrain.groundAt`, `world.draw` and `sectors.querySegments` were confirmed allocation-free.

---

## 2. Hypotheses (need the browser)

| # | Sev | Hypothesis | Evidence | How to validate |
|---|---|---|---|---|
| H1 | S2 | **The camera can still sit inside a wall for a few frames.** The clip is applied to the *target* (`main.js:2369-2375`), then `camPos` is smoothed toward it with k = 1 − exp(−9 dt) (`main.js:2377-2381`). The rendered eye lags the clipped target by about speed × 0.11 s, which is about 1.5 m at 50 km/h, against a 0.6 m margin. smoke_camclip never tests the combined pipeline. | code | Section 4.4: the per-frame camera-inside-footprint count. Fix: after smoothing, rerun `marchOut` or the segment test from the focus to `camPos` and snap. |
| H2 | S2 | **Mip shimmer on the house atlas.** `renderer.js:122-124` builds each mip level with a single `drawImage` from full resolution. There is no successive halving and `imageSmoothingQuality` is not set, so levels 3–4 alias. `maxLevel` is 4, so there is nothing coarser. | code | Section 4.9: frame-to-frame differences on house walls 60–200 m away while moving. Fix: halve step by step from the previous level with `imageSmoothingQuality = 'high'`. |
| H3 | S3 | **Ground grain repeats visibly.** Asphalt, grass and concrete photos are tiled at fixed 5, 5.5 and 4 m world repeats (`renderer.js:34-36`) with one octave, so large lawns and parking lots may show a grid. | code | Screenshots of the Galeries lot at (0, -284) and a park at grazing angles. Fix: add a second octave at another scale and rotation. |
| H4 | S3 | **Streetlight popping at night.** The 6 point lights are reassigned to the nearest lamps every 30 frames with a hard 0 → night×30 switch (`renderer.js:164-165`). At 50 km/h the set changes every few hundred metres. The lights also shine through walls (backlog). | code | A 60 s night drive, logging when `nearPoles` changes and the frame luminance. Fix: fade the intensity over 0.5 s. |
| H5 | S3 | **Shadows appear and vanish on one-sided meshes.** `shadowSide = BackSide` for every node (`renderer.js:192`), so single-sided surfaces (signs, fences, decals, the car loft with `noBottom`) only cast when their back faces the sun. | code | The same fence or sign at 10:00 and 17:00. |
| H6 | S2 | **Shader-compile stalls** on the first drive frame, the first dusk (the transparent unlit pool material appears), the first time a fading chunk or rain alpha appears, and every **Ombres** toggle (`shadowMap.enabled` recompiles every program). | three.js behaviour | Section 4.2: long-animation-frame entries at those moments. Fix: `engine.compileAsync(scene, camera)` during the loading screen, with a pool node forced visible. |
| H7 | S2 | **The shadow pass is large.** Every chunk mesh casts shadows, the ground and roads included (`renderer.js:191`). `visible()` also admits every handle within 180 m of the eye whether or not it is in view (`renderer.js:133-134`). | code | Section 4.6: draws and triangles with shadows on and off. Fix: split ground from buildings, or mark ground chunks `castShadow = false`. |
| H8 | S3 | **A few road points sit high.** Roads agree with physics along centrelines: drawn minus `groundAt` is p50 **+0.050 m** (exactly `Y.road`), p95 +0.089, p99 +0.118, with no grass on top in 24,226 samples. But **27 samples are more than 0.30 m off** (max +0.60), for example Rue de Fronsac (388.7, 1300.3), Arthur-Graveline (2378.4, -968.4) and Charles-Symmes (-397.7, -1451.6). No terrain feature is present at these points, so the likely causes are junction hulls kept planar at their centroid (TOPOGRAPHY piece 3) or overlapping driveway slabs (D3). | probe | Hood-cam screenshots at those coordinates. |
| H9 | S2 | **Principale façade recognisability** cannot be judged from code. principale-photo-pass.md and the backlog both say the original Principale photos are not recovered. Separately, D1 and D2 remove two strong recognition cues: you cannot frame the buildings, and there are no signs. | docs | The screenshot set in section 4.9, for Thomas to judge. |
| H10 | S3 | **The scene graph grows over a long session.** Nodes and materials are only removed when a sector unloads, so `scene.children.length` climbs with exploration and Three walks all of them about 3 times per frame. | code | Log `scene.children.length` against frame time over the 5-minute drive. |
| H11 | S3 | **Night fill may flatten contrast.** Hemi intensity is a fixed 2.1, lerped to blue, and ACES is on. Readability is probably fine, but mean luminance on the road against the façades should be recorded at 00:00 and 21:00. | code | Section 4.9 luminance. |

Hygiene with no user impact:
- The economy pulse (`economy.js:672-676`) is gated only on `G.mode === 'drive'`. It also runs under the seam card and cinematics, so the famous-car "moment" card can pop over them.
- The rAF order is stable: main `frame`, then the economy pulse, then autopilot. The pulse sees the post-render state, one frame late, which does no harm.
- `panel.js` still carries stale fallback coordinates (principale -448,477 and marina -730,1000). They are unused while `PLACES` resolves.

---

## 3. What is solid

- The terrain is C0 in height and normal. The ground mesh matches the height field to 1.8 mm at the median.
- The road drape is correct along centrelines: p50 is exactly the +0.05 m decal offset.
- Sector free returns every byte (in the Node harness).
- `groundAt`, `baseAt` and camclip are allocation-free by test.
- The prototype `upload()` repack is cheap: 279 ms against 172 ms for the original, over 5.6M verts in Node.
- Recorded radio streams through media elements and never decodes whole MP3s.
- Audio noise buffers are cached.

---

## 4. Measurement plan for the lead (run serially, one Chrome at a time)

### 4.1 Setup

1. `uptime`: the load must be under 4, or the numbers are void (VERIFY rule 2).
2. Serve on a **dedicated port that Tom never uses**, so that clearing storage cannot touch his data (D9):
   `node tools/serve.mjs 8151`
   Never use 8140 or 8141 with `--fresh` or `measure_memory`.
3. Launch Chrome for **timing** on a real GPU (SwiftShader timings are meaningless):
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/cr-perf --use-angle=metal --ignore-gpu-blocklist --enable-precise-memory-info --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --window-size=1280,800`
   - Confirm the GPU in the page. This must not return SwiftShader:
     `(()=>{const g=document.createElement('canvas').getContext('webgl2');const e=g.getExtension('WEBGL_debug_renderer_info');return g.getParameter(e.UNMASKED_RENDERER_WEBGL)})()`
   - If headless will not give Metal, run the same command headed, without `--headless=new`. Close it afterwards; nothing may be left on screen.
   - For the **boot-correctness** check only, use VERIFY's SwiftShader flags.
4. Viewport 1280×800 (`--size=1280x800` for headless.mjs), device scale factor 1, quality **med**, which is the default: scale 0.85, dpr 1.5, drawDist 720, 14 traffic.

### 4.2 Conditions, one cold load each, fresh storage on port 8151

| Run | URL | Set in page before the drive |
|---|---|---|
| P-noon | `http://localhost:8151/prototype.html` | `AYLMER_VISUAL.clockRate=0; AYLMER.visualClock(13)` |
| P-night | same | `AYLMER_VISUAL.clockRate=0; AYLMER.visualClock(0)` |
| P-noon-noshadow | same | as P-noon, plus `AYLMER.G.renderer.shadows=false` set **before** the timed window, because it recompiles |
| P-rain | same | as P-noon, plus `AYLMER.weather('rain')`. It sticks until midnight, because `applyRecordedWeather` only reapplies on a date change. |
| O-noon | `http://localhost:8151/index.html` | `AYLMER.env('day')` (original renderer baseline) |

### 4.3 Load time (every run)

- From Node: `Page.navigate` time (t0), then poll `!!window.AYLMER` every 50 ms (t_module), then click `#start` and `#startconfirm` and poll `G.mode==='drive'` (t_drive).
- In the page, record:
  - `performance.getEntriesByType('navigation')[0]`
  - `performance.getEntriesByType('resource').map(r=>[r.name.split('/').pop(), Math.round(r.duration), r.transferSize])` for mapdata, hull_mapdata, ottawa_mapdata, ground_data, three.module.min, atlas.real.png and the three `*_color.jpg` textures
  - the first 5 s of long-animation-frame entries after drive, which cover the first frame and shader compiles
- Report t_module − t0, t_drive − click, and the longest single frame in the first 3 s of drive.

### 4.4 Route and driver (5 minutes of real time)

The route is 299 Fraser (932.9, 143.9) → rue Principale (-877, -102) → Marina (-1766, -88) → Principale → Marina, and so on until 300 s. `autopilot.js` drives between two legs from start to finish, so give it a 2-entry place map. The truck starts at home and drives Fraser → Principale first. Paste this as the `--script` file for `node tools/headless.mjs http://localhost:8151/prototype.html 0 /tmp/p-noon.jpg --fresh --size=1280x800 --script /tmp/perf_drive.js` (write it to /tmp, not into the repo):

```js
const A = window.AYLMER, G = A.G, R = G.renderer, T = R.engine;              // T undefined on index.html
const { PLACES } = await import('/src/game/places.js');
const { segCross } = await import('/src/core/math.js');
// condition set-up goes here (see 4.2)
(await import('/src/game/autopilot.js')).start(A, { principale: PLACES.principale, home: PLACES.marina }, 'principale');
const iv = [], samples = [], loaf = [], lt = [];
new PerformanceObserver(l => { for (const e of l.getEntries()) loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration),
  s: (e.scripts || []).slice(0, 3).map(s => `${s.sourceURL?.split('/').pop()}:${s.sourceFunctionName}:${Math.round(s.duration)}`) }); })
  .observe({ type: 'long-animation-frame', buffered: false });
new PerformanceObserver(l => { for (const e of l.getEntries()) lt.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
let last = performance.now(), camIn = 0, camLandmark = 0, camLow = 0, frames = 0, seam = 0;
const t0 = performance.now();
await new Promise(done => { (function f(now) {
  iv.push(now - last); last = now; frames++;
  if (G.seamHold) seam++;
  const c = G.camPos, v = G.veh;
  if (G.world.buildingAt(c[0], c[2], 0)) camIn++;                          // D1 / H1
  if (c[1] < G.phys.groundY(c[0], c[2]) + 0.45) camLow++;
  for (const s of (G.world.landmarks?.sites || [])) {                      // boom through a landmark wall
    if ((s.cx - v.x) ** 2 + (s.cz - v.z) ** 2 > (s.r + 30) ** 2) continue;
    const segs = []; s.col.into(segs, v.x, v.z, 40);
    if (segs.some(g => { const t = segCross(v.x, v.z, c[0], c[2], g.ax, g.az, g.bx, g.bz); return t >= 0 && t < 1; })) { camLandmark++; break; }
  }
  if (now - t0 < 300000) requestAnimationFrame(f); else done(); })(performance.now()); });
// sampler: run a setInterval(5000) alongside the rAF loop above, collecting:
//   { t, heapMB: performance.memory.usedJSHeapSize/1e6, x: G.veh.x|0, z: G.veh.z|0, kmh: G.veh.speedKmh|0,
//     sector: G.world.sectors?.loaded(), draws: R.stats.draws, tris: R.stats.tris, gpuMB: R.gpuBytes/1e6,
//     geo: T?.info.memory.geometries, tex: T?.info.memory.textures, programs: T?.info.programs.length,
//     nodes: R.scene?.children.length, laps: window.AUTOPILOT.laps, tows: window.AUTOPILOT.tows|0 }
const s = [...iv].sort((a, b) => a - b), q = p => +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1);
return { frames, median: q(.5), p95: q(.95), p99: q(.99), max: q(1), over50: s.filter(x => x > 50).length,
  over250: s.filter(x => x > 250).length, longtasks: lt.length, loafTop: loaf.sort((a, b) => b.d - a.d).slice(0, 12),
  camInsideFootprint: camIn, camThroughLandmark: camLandmark, camNearGround: camLow, seamFrames: seam, samples };
```

**Record per run:**
- median, p95, p99 and max frame interval over the **whole** 300 s, *without* dropping ≥ 250 ms intervals
- the count over 50 ms and over 250 ms
- the top 12 long-animation-frame entries, with their script attribution
- the JS heap series every 5 s: start, end, maximum, and the slope in MB/min after the first 30 s
- `R.stats.draws` and `R.stats.tris` (in the prototype these include the shadow passes)
- `engine.info.memory.geometries` and `textures`, `info.programs.length`, `scene.children.length`
- `camInsideFootprint`, `camThroughLandmark` and `camNearGround` frame counts
- the laps and tows

**Bars.**
- p95 ≤ 20 ms at med.
- No interval over 250 ms outside a seam card. The route stays in the Aylmer sector, so `seamFrames` should be 0.
- The heap slope is about 0 MB/min after warm-up.
- `camThroughLandmark` is 0 after the D1 fix. Expect it to be clearly above 0 before.

### 4.5 Signage check (D2), after reaching drive, prototype only

```js
const { baseAt } = AYLMER.G.world, p = AYLMER.G.world.signage.mesh.geometry.attributes.position.array;
let under = 0, n = 0; for (let i = 0; i < p.length; i += 12) { n++; if (p[i + 7] < baseAt(p[i], p[i + 2]).h) under++; } return { boards: n, underground: under };
```

Run it 2 s after drive, once storefronts.json has loaded. Expect `underground ≈ 10` before the fix and 0 after.

### 4.6 A/B at one pose (D4, H7), prototype, 600 frames each

1. Teleport to the Principale/British frontage: `A.teleport(-905, -100, Math.PI/2)`, then `A.visualClock(13)` with `clockRate=0`.
2. Let it settle for 2 s.
3. Record 600 rAF intervals, `R.stats.draws` and `R.stats.tris` for each of these, in order:
   - (a) the default
   - (b) `R.headlights.forEach(l => l.shadow.autoUpdate = false)` (D4)
   - (c) `R.shadows = false`. This recompiles, so discard the first 60 frames. This gives the shadow-pass share (H7).
4. Repeat (a) at `visualClock(0)`.

### 4.7 Memory (D5, D7, D8)

Run `node tools/measure_memory.mjs http://localhost:8151/index.html`, then the same against `/prototype.html`. It clears the origin's storage, which is why the port is 8151.

Compare heap and GPU at the driveway, the Galeries, Hull, Champlain and Parliament. Then add one row for the menu-only heap: navigate, wait 5 s, force GC and read `Runtime.getHeapUsage`. That isolates the D8 parse cost and the D7 turntable.

### 4.8 Allocation rate (D10)

Only if time allows. During 60 s of P-noon driving, call CDP `HeapProfiler.startSampling({samplingInterval: 16384})`, then `stopSampling`. Aggregate `selfSize` by `callFrame.url:lineNumber`. The expected top entries are `renderer.js:187`, `renderer.js:142-163`, `daylight.js:36` and `main.js:1333-1335`.

Do the same for O-noon. That needs a small CDP harness, which is the same pattern as measure_memory.

### 4.9 Visual set (H2, H3, H4, H5, H8, H9, H11 and D3), prototype, 1280×800 JPEG

- **Positions:** stone172 (-176, -113), church160 (-327, -100), pizzagelato (-402, -102), garage143 (-514, -152), british (-916, -112), symmesinn (-1517, -58), marina (-1766, -88), the Galeries lot (0, -284).
- **Driveways:** the worst floating one (-591.8, 850.5), plus two from the `probe_surface.mjs` "worst floating" list.
- **Road points:** the H8 road points.

For each position:
1. `A.teleport(x, z, yaw)` to the nearest road via `G.world.nearestRoad`.
2. Take the chase camera at hours 13, 20.5 and 0.

For shimmer, drive at 30 km/h past a row of houses. Capture 10 consecutive frames and compute the mean absolute luminance difference in the region above the roofline minus the road region. Record it before and after any mip fix.

Look at every image yourself (VERIFY rule 1).

---

## 5. Priority order

Order for fixes, all small and local:

1. D2 (thread `yAt` into `primeSignage`)
2. D1 (landmark `buildingAt`)
3. D4 (headlight `shadow.autoUpdate`)
4. D3 (drape driveways)
5. D5 (release attribute arrays), after 4.7 confirms the heap difference
6. The D10 top three allocations
7. D6 and D7 (disposal)
8. D8 (lazy sector data)
9. H1 (camera clip after smoothing)
10. H2 (mip generation)
