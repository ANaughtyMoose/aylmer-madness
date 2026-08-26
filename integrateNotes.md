# Wiring `buildHouse` into `world.js` (Phase 2 hand-off)

Everything below touches **only `src/game/world.js`** (plus one line in
`src/main.js` if you want distance LOD). Nothing in `houses.js`, `mesh.js` or
`materials_stub.js` needs to change to do any of it.

---

## 0. The headline numbers first, because they decide the plan

Whole map, all 10,368 `MAP.buildings`, measured with `node tools/smoke_houses.mjs`
and the totals script in this branch:

| | total triangles | worst 200 m chunk | bake time |
|---|---|---|---|
| today's extrude-and-cap | ~233 k | ~2.5 k | — |
| `buildHouse` lod **2** | 233 k | 2.5 k | 24 ms |
| `buildHouse` lod **1** | **271 k** | 2.7 k | 55 ms |
| `buildHouse` lod **0** | **840 k** | 9.5 k | 122 ms |

`world.js` says "the whole scene has to stay well under 450 k triangles", so
**lod 0 everywhere does not fit** — it is +600 k on its own. Two ways out, and
you can ship them in order:

* **Step 1 (10 minutes, do this first).** Bake **lod 1** globally. It costs
  +38 k triangles over today and already gets you: real per-storey wall heights
  (bungalows stop being 5.5 m tall), hip / gable / mansard / flat roofs on the
  real oriented footprint rectangles, garage wings with their own lower roof,
  driveways to the street, and the era colour recipes. What lod 1 drops is
  windows, doors, porches, chimneys and steps.
* **Step 2 (an hour).** Bake lod 0 and lod 2 house geometry into two *separate*
  meshes per chunk and pick one per frame by distance (§3). Per-frame cost then
  goes *down* versus today, because far chunks draw the 2.5 k version.

---

## 1. The minimal switch — replace the house branch

### 1a. Imports, at the top of `world.js` (currently lines 12–14)

```js
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { mulberry32, clamp, lerp } from '../core/math.js';
import { MAP } from './mapdata.js';
import { buildHouse, makeStreetYawIndex } from './houses.js';   // NEW
import MATS from './materials_stub.js';                          // NEW — see §4
```

### 1b. One index before the buildings section (insert above line 392, `// 5. buildings`)

`buildHouse` wants to know which way the street is so the door, the driveway and
the garage face the road. `nearestRoad` in this file is (a) defined *after* the
building loop, so calling it there is a TDZ error, and (b) O(all road segments),
which is 10 k × 20 k. `makeStreetYawIndex` is a grid; it costs ~15 ms to build
and ~1 µs per query.

```js
  // ------------------------------------------------------------ 5. buildings
  const streetYawAt = makeStreetYawIndex(MAP.roads);      // NEW
  const HOUSEY = { house: 1, terrace: 1 };                // NEW
  const HOUSE_LOD = 1;                                    // NEW — see §0 and §3
  const buildings = MAP.buildings;
```

### 1c. The branch itself, at the top of the loop body (currently lines 413–417)

Replace

```js
  for (let bi = 0; bi < buildings.length; bi++) {
    const b = buildings[bi];
    const p = b.p, n = p.length, h = b.h, c = b.c;
    const rnd = mulberry32((bi * 2654435761 + 0x9e3779b9) >>> 0);
    const bd = bAt(c[0], c[1]);
```

with

```js
  for (let bi = 0; bi < buildings.length; bi++) {
    const b = buildings[bi];
    const p = b.p, n = p.length, h = b.h, c = b.c;
    const rnd = mulberry32((bi * 2654435761 + 0x9e3779b9) >>> 0);
    const bd = bAt(c[0], c[1]);

    // ---- NEW: houses and terraces get the parametric archetypes
    if (HOUSEY[b.k] === 1) {
      buildHouse(bd, b, b.hs || null, MATS, rnd, {
        lod: HOUSE_LOD,
        index: bi,
        streetYaw: streetYawAt(c[0], c[1], -b.a),
        addSegment,                 // buildHouse calls this once per footprint edge
      });
      continue;
    }
```

That is the whole switch. Everything from the old `// wall colour` block down to
the sign board keeps running unchanged for `commercial` / `apartments` /
`church` / `school` / `big` / `mall` / `industrial` / `public` / `shed`.

**Do not delete** `extents()` (line 396), `shrunk` (line 412), the `SIDING` /
`ROOF` / `GABLE` tables or the window-band block — the non-house kinds still use
them. `GABLE` will no longer see `house` or `terrace`; leave `shed: 1` in it.

`b.hs` is Phase 1's attribute blob if `build_map.py` has started emitting it, and
`null` otherwise — `buildHouse` infers a full attribute set either way, and
`normalizeAttrs` fills in any field Phase 1 leaves out. No guard needed.

### 1d. Colliders are unchanged

`buildHouse` calls `opts.addSegment(ax, az, bx, bz)` for every edge of the real
footprint ring, in the same order as the loop it replaces, so the physics grid
comes out byte-identical. Two things that are *not* collidable and were not
before either: the front porch (projects ~2.1 m past the front wall on the `old`
and `cottage` archetypes) and the back shed. If you want them solid, the porch
deck's four corners are easy to add — say the word and I'll return a
`opts.addSegment` call for them.

---

## 2. What lands where the old code drew

| old behaviour (world.js) | new behaviour |
|---|---|
| `b.h` (a random 4.8–6.2) as wall height for every house | eave height from the storey count: 3.05 / 3.7 / 5.75 / 6.5 / 8.4 m |
| gable along the longest edge, always | gable / hip / mansard / flat / shed, per era and roof attribute |
| roof prism over the whole bounding box | one roof per rect of a 1–2 rect decomposition of the real footprint (L-plans get a house roof and a lower garage-wing roof) |
| pastel from `SIDING[]` | era-appropriate tile name + seeded colour jitter (`materials_stub.TILES`) |
| window bands only when `h >= 8` (never on houses) | window / door / garage-door decal quads by storey and wall length, walls under 3 m skipped |
| nothing | driveway strip to the street side, front steps, porch, chimney, dormers, bay and picture windows, detached shed |

---

## 3. Distance LOD (step 2)

Chunk meshes are baked once at load, so `lod` **cannot** be a per-frame decision
on a single mesh. Bake both and pick:

**In `world.js`,** give each chunk a second builder for the house geometry:

```js
  const builders = new Map();     // existing: everything
  const farHouses = new Map();    // NEW: the same houses at lod 2
  function fAt(x, z) { /* same body as bAt, against farHouses */ }
```

then in the branch from §1c, build twice:

```js
    if (HOUSEY[b.k] === 1) {
      const o = { index: bi, streetYaw: streetYawAt(c[0], c[1], -b.a) };
      buildHouse(bd, b, b.hs || null, MATS, mulberry32(seed), { ...o, lod: 0, addSegment });
      buildHouse(fAt(c[0], c[1]), b, b.hs || null, MATS, mulberry32(seed), { ...o, lod: 2 });
      continue;
    }
```

(reseed `mulberry32` identically for both calls so the two LODs agree on colour).
In the upload block at line 763, push `near` and `far` meshes onto the same chunk
record, then **in `src/main.js` line 517**:

```js
  const NEAR2 = 240 * 240;                       // NEW
  for (const c of G.world.chunks) {
    const dx = c.cx - v.x, dz = c.cz - v.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > dd2) continue;
    if (!r.visible(c.mesh)) continue;
    r.draw(c.mesh, mm);                          // roads, ground, trees, non-houses
    const hm = d2 < NEAR2 ? c.housesNear : c.housesFar;   // NEW
    if (hm) r.draw(hm, mm);                                // NEW
  }
```

With `drawDist` 720 m (medium) that is roughly 4–9 chunks at lod 0 (~25 k tris)
and ~30 at lod 2 (~20 k tris) — cheaper per frame than what ships today. The cost
is bake time (~150 ms) and VRAM (~1.07 M triangles of house geometry resident).

`lod: 1` is the middle option if you would rather have one mesh per chunk and no
`main.js` change: set `HOUSE_LOD = G.quality === 'high' ? 0 : 1` at bake time.

---

## 4. When Phase 3's `materials.js` lands

`houses.js` never imports a material provider — it takes one as its fourth
argument — so the swap is one import line and one call site in `world.js`:

```js
-import MATS from './materials_stub.js';
+import { loadMaterials } from './materials.js';
```

and in `buildWorld` (it will need to become async, or take the provider as an
argument — `buildWorld(renderer, mats)` is the smaller change):

```js
-export function buildWorld(renderer) {
+export function buildWorld(renderer, mats = MATS) {
```
…then pass `mats` instead of `MATS` in the §1c call, and in `src/main.js` do
`G.world = buildWorld(r, await loadMaterials(r))`.

The provider contract `houses.js` actually uses is three members — the header of
`src/game/materials_stub.js` states it in full:

```
tex                                    GL texture, or null
uv(name)   -> {u0,v0,u1,v1} | null     null == "no atlas, use vertex colours"
color(name)-> [r,g,b]                  the tint / fallback colour
```

`houses.js` already routes every UV through `MeshBuilder.texQuad(...)` →
`vert(..., u, v)` → **`MeshBuilder.pushUV(u, v)`**, which is the single funnel
added to `src/core/mesh.js` in this branch. If Phase 3 changes how UVs reach the
buffer, `pushUV` is the only method to touch — nothing else pushes into
`this.uv`. `pushUV` is a no-op until a mesh is textured or a non-zero pair is
offered, so the untextured path costs nothing.

One thing to check when the atlas exists: the shader does
`base = mix(vCol, tx.rgb, uUseTex)` — a texture **replaces** the vertex colour, it
does not tint it. So the per-house colour jitter in `houses.js` only shows on the
untextured path; with the atlas, variety has to come from the tile names
(`brick_red` vs `brick_brown` vs `brick_buff`, five vinyls, three shingles),
which is exactly how the recipes in `SPECS` are written. Chunk meshes are drawn
untextured today, so the whole chunk needs `{ tex }` on its `r.draw` once the
atlas is in — meaning the atlas must also cover roads, grass and trees, or houses
have to move into their own per-chunk mesh. Worth deciding with Phase 3 before
they bake the atlas.

---

## 5. What to look at in the lab before merging

`./serve.sh` then <http://localhost:8123/src/game/houses_lab.html>.

* "random Aylmer street" → **Rue Denise-Friend** (suburban), **Avenue
  Frank-Robinson** (midcentury), **Rue Bancroft** / **Rue Principale** (old),
  **Promenade Wychwood** (midcentury), **Rue Deschênes** (cottages). The era
  fallback picks those five correctly today; that is the thing to sanity-check.
* Single archetype → the "13 x 9 L-plan" footprint, to see the garage wing step
  down and get its own roof.
* The `lod` dropdown, on both modes: lod 2 should look exactly like today's game.
