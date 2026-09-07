# Borrowed models

Settled in `docs/PLAN.md`, "Borrow, don't build": CC0 glTF models enter the game
through a **build-time** converter, so the runtime stays plain ES modules with
no dependencies and no parser. By the time a model reaches the browser it is
already positions / normals / colours / indices in the engine's own layout.

Nothing here is wired into the game yet. `world.js`, `props.js`,
`streetprops.js` and `cars.js` are untouched on purpose — that integration is
Wave 2's, and the wiring points are written down below so it is a small job.

---

## The pieces

| file | what it is |
|---|---|
| `tools/gltf2mesh.mjs` | the converter. Node, no npm. Reads `.gltf` + `.bin` and `.glb`. |
| `tools/build_models.mjs` | the recipe table. One entry per model; writes `manifest.json` and `LICENSES.md`. |
| `tools/smoke_models.mjs` | the suite. Converter behaviour against hand-built fixtures, plus every shipped model. |
| `tools/fixtures/` | the fixtures, and `make_fixtures.mjs`, which is where their numbers came from. |
| `src/game/models.js` | the loader. Fetches the manifest, uploads, caches by slug. |
| `src/game/models_lab.html` + `.js` | the turntable. A 1 m grid, the game's lighting, today's geometry beside the borrowed one. |
| `tools/shots_models.mjs` | screenshots every model out of the lab, headless. |
| `assets/models/` | the converted `*.json`, the manifest, and `LICENSES.md`. |
| `assets/models/src/` | the originals. **Gitignored** — a build input, re-downloadable from `LICENSES.md`. |

---

## The format

`assets/models/<slug>.json`, one object:

```jsonc
{
  "format": "aylmer-mesh-1",     // models.js refuses anything else
  "slug": "tree-sugar-maple",
  "source": "tree_oak.glb",      // the file it was converted from
  "tris": 196,
  "verts": 648,
  "bounds": { "min": [-2.9, 0, -3.3], "max": [2.9, 11.0, 3.3] },
  "uv": false,                   // true when --uv kept TEXCOORD_0
  "license": { "pack": "...", "author": "...", "license": "CC0-1.0", ... },

  "positions": [ ... ],          // 3 per vertex, metres, +Y up
  "normals":   [ ... ],          // 3 per vertex, unit length
  "colors":    [ ... ],          // 3 per vertex, sRGB 0..1
  "indices":   [ ... ]           // 3 per triangle
}
```

Conventions, all of them the engine's own:

* **Metres, +Y up.** A prop stands on `y = 0`; the suite checks it.
* **A vehicle's nose points +Z, and +X is the car's LEFT** (`cars.js` line 2).
  A vehicle's mesh origin is the **midpoint between its axles**, because
  `cars.js` hangs the wheels at `±wheelbase/2` about that origin.
* **Colour is sRGB**, like every other colour in the game, because the one
  shader MULTIPLIES the texture by the vertex colour and untextured geometry
  wants a white texture. glTF's own colours are linear; the converter converts.
* **Winding is counter-clockwise seen from outside.** The renderer culls by
  winding, not by normal.

If the payload would exceed 1 MB of JSON the arrays move to a sibling
`<slug>.bin` — `positions`, `normals`, `colors`, `[uvs]`, `indices` in that
order, Float32 then Uint32 — and the `.json` keeps the header plus `"bin"`.
`loadModelDoc()` reads both forms; nothing shipped today needs it.

---

## Adding a model

1. **Find it.** CC0 only, and the licence has to be an explicit CC0 line in the
   pack's own licence file or on its page — not an assumption. Today's sources
   are Kenney, Quaternius and one OpenGameArt pole; Poly Haven is fine in
   principle but its models are photogrammetry (its CC0 fire hydrant is 86,000
   triangles).
2. **Put it in `assets/models/src/<source>/<pack>/`** with the pack's
   `LICENSE.txt` beside it. That directory is gitignored.
3. **Look at what is in it:**
   ```bash
   node tools/gltf2mesh.mjs assets/models/src/.../thing.glb --listColors --quiet
   ```
   That prints the colour clusters, which is what a `--recolor` palette is
   written from.
4. **Add one entry to `RECIPES` in `tools/build_models.mjs`.** Say in the
   comment which real dimension the scale came from.
5. `node tools/build_models.mjs` — it rewrites `manifest.json` and
   `LICENSES.md`.
6. `node tools/smoke_models.mjs` — the budget, the grounding, the licence and
   the bounds are all checked there.
7. **Look at it.** Serve the worktree, run `tools/shots_models.mjs`, and open
   the jpg. This step is not optional: scale, facing, floating and grey-blob are
   all invisible to every check above.

### The flags that matter

| flag | when |
|---|---|
| `--scale K` / `--scale SX,SY,SZ` | always. Kits are on a 1-unit grid; per-axis when one number cannot serve two dimensions (a stylised truck's wheelbase and its width). |
| `--center` | props. Grounds at `y = 0` and centres x/z. |
| `--offset X,Y,Z` | vehicles. Puts the origin on the axle midpoint, which `--center` cannot. |
| `--forward +x\|-x\|+z\|-z` | when the nose is not already +Z. A **rotation**, not a mirror. |
| `--up y\|z` | Z-up sources. Applied BEFORE `--forward`, so a Blender export with the nose on +Y wants `--up z --forward -z`. |
| `--node NAME` | take one node. `--node body` on a car kit vehicle drops its wheels, which the game supplies. |
| `--material NAME=#RRGGBB` | recolour by material name. Works when the source has real materials (Kenney's Nature Kit, Quaternius's bus). |
| `--recolor A=B` | recolour by colour, nearest key wins. Needed when one material (`colormap`) covers the whole model — every Kenney City and Car kit piece. |
| `--maxTris N` | always. Refuses rather than shipping. |
| `--uv` | only for a model that will sample the material atlas. Nothing does yet. |

### Why every model is repainted

Kenney's Nature Kit is deliberately **turquoise and salmon** (its `leafsGreen`
is `#29c9ab`); his City and Car kits are a bright toy palette on one shared
`colormap` texture; Quaternius's bus is entirely `#a3a3a3`. All fine looks, and
none of them Aylmer in 2004. **What is borrowed is the geometry.** The palette
in `tools/build_models.mjs` is the game's own — `world.js`'s `LEAF`, `CONIFER`
and `C.trunk`, `cars.js`'s `GLASS`, `TRIM` and `AMBER`.

---

## Memory

**A second instance of a model costs zero bytes on the GPU.** Instancing here is
what the game already does for cars and props: one uploaded mesh, many model
matrices, one `m4.compose` and one draw call per instance. Three thousand maples
are one 25 kB mesh.

What costs is the **mesh**, once. `Renderer.upload()` counts
`(verts × 9 + tris × 3) × 4` bytes — nine floats a vertex (position, normal,
colour) and a 32-bit index buffer — and adds it to `renderer.gpuBytes`, which is
the number `tools/measure_memory.mjs` reports.

| slug | tris | verts | GPU bytes per mesh | JSON on disk |
|---|---:|---:|---:|---:|
| `tree-sugar-maple` | 196 | 648 | 25.1 kB | 41 kB |
| `tree-white-pine` | 78 | 272 | 10.5 kB | 17 kB |
| `tree-white-cedar` | 204 | 632 | 24.6 kB | 38 kB |
| `tree-birch` | 228 | 784 | 30.2 kB | 50 kB |
| `tree-spruce` | 230 | 784 | 30.3 kB | 50 kB |
| `lamp-post` | 92 | 156 | 6.6 kB | 9 kB |
| `hydro-pole` | 280 | 146 | 8.4 kB | 13 kB |
| `stop-sign` | 300 | 479 | 20.4 kB | 29 kB |
| `garbage-can` | 68 | 232 | 9.0 kB | 14 kB |
| `dumpster` | 234 | 392 | 16.5 kB | 25 kB |
| `park-bench` | 84 | 320 | 12.2 kB | 18 kB |
| `pickup-ranger` | 754 | 1152 | 49.3 kB | 71 kB |
| `city-bus` | 1526 | 2613 | 109.7 kB | 169 kB |
| **all thirteen** | **4274** | **8610** | **353 kB** | **544 kB** |

353 kB against the 183 MB of GPU memory the sector-gated build holds at the
driveway (`docs/VERIFY.md`). **Loading every model is free. Baking them is not**
— see the warning under "Trees" below.

The budgets the suite enforces — 600 triangles a prop, 6,000 a vehicle — are
about the *drawn* scene, not about this table: the whole town has to stay under
450k triangles (`world.js`, `CAP`).

---

## Wiring points

### Trees — `world.js`, not `props.js`

The ~3,200 street, park and wood trees are **baked into per-chunk meshes**, not
instanced: `world.js` `tree(x, z, scale, conifer)` (line ~1558) emits cones
straight into `bAt(x, z)`, the builder for the 200 m chunk that point falls in.
Counts are capped at `world.js` line 108:
`{ woodTrees: 900, parkTrees: 500, roadTrees: 1800, shrubs: 950, poles: 2500 }`.

So wiring a borrowed tree in means **appending it into that chunk builder**, not
drawing it:

```js
import { loadModels, appendModel } from './models.js';
// ...once, before the world bake:
const models = await loadModels(null, {});     // no renderer: geometry only
// ...inside tree():
const m = models.get(conifer ? 'tree-spruce' : 'tree-sugar-maple');
if (m) appendModel(bAt(x, z), m, { x, y: 0, z, yaw: tr() * Math.PI * 2, scale });
else { /* the cones below, unchanged */ }
```

`appendModel(mb, model, { x, y, z, yaw, scale })` is in `models.js` and uses the
same yaw convention as `MeshBuilder.tower()`.

> **This is where the memory budget can break.** Baked geometry is NOT
> instanced: 1,800 road trees at 196 triangles each is 353k triangles and
> 44 MB of vertex buffer, against a whole-town cap of 450k triangles — the
> trees alone would eat it. 2,500 hydro poles at 280 would be another 700k.
> Today's cone tree is 18-23 triangles and today's pole is 8. **Either drop the caps hard, or draw trees as instances
> (one uploaded mesh, a matrix per tree, culled per chunk) instead of baking
> them.** Re-measure with `tools/measure_memory.mjs` at all four points either
> way; a number taken above load 8 is not a number.

`props.js` owns only the hand-placed trees, and those are already one-mesh-per-
instance and therefore free:

* `buildBigTree()` (line 217) — the maple on Mike's lawn, uploaded once in
  `buildPropMeshes()` (line 260) as `bigtree`. Swapping in `tree-sugar-maple`
  is one line.
* `islandTree()` (line 202) — the eight on Île Aylmer, baked into the island
  mesh, so the same caution applies at a much smaller scale.

### Street furniture — `streetprops.js`

Every knock-over-able prop is a `KINDS` entry (line 55) with
`emit(b, x, y, z, yaw)`, baked per 200 m chunk by `buildStreetProps()`
(line 199), which also remembers each item's slice of the index buffer so
knocking it over is one `blankIndices()` call. A borrowed model slots straight
into an `emit`:

```js
dumpster: {
  r: 0.9, cy: 0.52, kick: 0.2, snd: 'metal', spill: 0, dmg: 2.0,
  emit(b, x, y, z, yaw) {
    const m = MODELS && MODELS.get('dumpster');
    if (m) appendModel(b, m, { x, y, z, yaw });
    else { /* the boxes, unchanged */ }
  },
},
```

Two things to keep: the `r` / `cy` / `kick` numbers are physics and must be
re-derived from the model's real bounds, and `emit` is also called once per kind
at the origin with `y = -K.cy` to build the debris mesh, so it must work
anywhere, not only where a prop stands.

**Poles are not here.** Streetlights and hydro poles live in `world.js` section
5 and go into `world.poles`; they are baked like the trees and carry the same
warning, at 2,500 of them.

`stop-sign` says **STOP**, not **ARRÊT**. Québec signs say ARRÊT, and the plate
is geometry with a baked-in colour, not a texture. Either accept it as a
low-poly abstraction at a distance or put the word on with `MeshBuilder`'s
`panel()` and an atlas decal.

### Vehicles — `cars.js` and `vehiclekit.js`

`main.js` line 619 builds a car's body once:
`G.meshes.cars[c.id] = r.upload(buildCarBody(c))`. `vehiclekit.js` already
provides the seam — a spec may carry its own `buildBody(spec)` instead of
`loft()` + `addDetails()`, which is how the buses and bicycles work. So a
converted body is:

```js
// after the models have loaded
const m = MODELS.get('pickup-ranger');
if (m) carById('ranger').buildBody = () => { const b = new MeshBuilder(); appendModel(b, m); return b; };
```

Everything else about the car keeps working, because the body is the only thing
that changed: `buildWheel()` still makes the wheels, `carLampBoxes()` still
places the lamps, the physics still reads `len` / `wid` / `mass` / `grip`, and
the damage model still deforms the mesh it is given.

**The pickup fits the Ranger spec as it stands.** Kenney's wheel *nodes* sit at
±0.30 in model units, which reads as a fatal mismatch against the Ranger's
±0.83 track — but the wheel *arches* are cut into the flanks at the body's own
half width, so scaling the body to 1.77 m wide puts them exactly where the game
hangs its wheels. `docs/shots/models-pickup-ranger.jpg` has the game's own
wheels bolted on. The scale is per-axis (`1.18, 1.262, 1.6975`) and the origin
is offset onto the axle midpoint; both are in the recipe with the arithmetic.

**The city bus needs a spec change.** The bus is scaled to the game's own
`len: 12.00, wid: 2.59, h: 3.10`, and its axles then land at:

| | spec today | this model |
|---|---:|---:|
| wheelbase | 6.20 m | **8.35 m** |
| front overhang | 2.00 m | 1.82 m |

The model's geometry is the more realistic of the two — a 12 m two-axle transit
bus has a wheelbase near 8 m, and 6.20 m is short for that length. **Change the
spec, not the model**, and re-run `tools/smoke_vehicles.mjs`: `wheelbase` and
`overhangF` are what `finalizeCar()` derives `axleZ` and `track` from, so the
turning circle and the wheel positions both move with them.

While there: `cars.js` declares `track: 1.67` on the Ranger and
`finalizeCar()` recomputes `track` from the `plan` profile on import, so the
effective value is **1.66** and the declared one is dead. Not this branch's to
fix, but anything matching a model to the spec has to use the effective number.

---

## What is not here, and why

Nothing below exists CC0, at a low-poly budget, in the packs we may draw on.
Each was looked for and each is a deliberate gap, not an oversight.

| wanted | why not |
|---|---|
| **hedge segment** | Kenney's bushes are crossed leaf-BLADE cards, not solid shapes; stretched into a 2 m segment they read as a dark spiky V. `world.js`'s own procedural shrub — a tapered box — is already closer to clipped cedar. Three boxes of hand geometry if it is wanted. |
| **fire hydrant** | Poly Haven's is CC0 and **86,000 triangles**; `--maxTris` refuses it, correctly. No low-poly CC0 hydrant in Kenney or Quaternius. `streetprops.js` already has a procedural one (`KINDS.hydrant`). |
| **bus shelter** | Nothing closer than a Kenney awning (`detail-overhang-wide`, 64 tris), which is a roof and no shelter. |
| **picnic table** | Poly Haven's is CC0 and 10,200 triangles. Kenney's Furniture Kit has an indoor table and a bench, neither of which is a picnic table. The park bench shipped instead. |
| **hockey net** | Does not exist on quaternius.com (the whole site index was searched), nor in any Kenney kit, nor on Poly Haven. |

`gemini-inbox/assets/GAPS.md` reached the same five conclusions independently
and carries hand-building specifications for them.
