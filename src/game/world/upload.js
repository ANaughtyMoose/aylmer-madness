// Upload: every builder to the GPU, the furniture log flattened, the log line.
import { CHUNK } from './consts.js';
import { buildSignage } from '../signage.js';
import { baseHeightAt } from './groundgrid.js';

// Main-thread admission of one transferred mesh. The Worker waits for an ACK
// after this upload and its first draw, so only one packed mesh is in flight.
export function createWorldUpload(renderer) {
  const maps = Object.fromEntries(['land', 'near', 'far', 'water', 'night', 'distant'].map((k) => [k, new Map()]));
  let owned = true;
  function add(packet) {
    if (!owned) throw new Error('world upload is no longer pending');
    const map = maps[packet.kind];
    if (!map || map.has(packet.key)) throw new Error('duplicate or invalid world mesh');
    const mesh = renderer.upload(packet);
    map.set(packet.key, mesh); return mesh;
  }
  function cancel() {
    if (!owned) return;
    owned = false;
    for (const map of Object.values(maps)) { for (const mesh of map.values()) renderer.free?.(mesh); map.clear(); }
  }
  function finish(ctx) {
    const { B, NX } = ctx;
    const chunk = (k, mesh) => ({ mesh, min: mesh.min, max: mesh.max, fade: 0,
      cx: B.minX + ((k % NX) + 0.5) * CHUNK, cz: B.minZ + (Math.floor(k / NX) + 0.5) * CHUNK });
    ctx.landMesh = maps.land;
    ctx.chunks = [];
    for (const k of new Set([...maps.land.keys(), ...maps.near.keys(), ...maps.far.keys()])) {
      const mesh = maps.land.get(k) || null, near = maps.near.get(k) || null, far = maps.far.get(k) || null;
      ctx.chunks.push({ ...chunk(k, mesh || near || far), mesh, near, far });
    }
    ctx.waterChunks = [...maps.water].map(([k, mesh]) => chunk(k, mesh));
    ctx.nightChunks = [...maps.night].map(([k, mesh]) => chunk(k, mesh));
    ctx.distantMesh = maps.distant.get(null) || null;
    ctx.signage = null;
    ctx.tris = 0; ctx.nearTris = 0; ctx.farTris = 0;
    for (const [kind, map] of Object.entries(maps)) for (const mesh of map.values()) {
      ctx.tris += mesh.count / 3;
      if (kind === 'near') ctx.nearTris += mesh.count / 3;
      if (kind === 'far') ctx.farTris += mesh.count / 3;
    }
  }
  function release() { owned = false; }
  return { add, finish, cancel, release };
}

export function uploadWorld(ctx) {
  const { renderer, B, NX, builders, houseNearB, houseFarB, waterB, nightB, poles, distant, opts, furn, t0,
    buildings, mats, roads, SIGNALS, STOPS, segs } = ctx;
  const cnt = ctx.count;
  // ------------------------------------------------------------ upload
  let tris = 0;
  const meshByKey = new Map();
  function uploadSet(map, record) {
    const out = [];
    for (const [k, b] of map) {
      if (b.empty) continue;
      tris += b.i.length / 3;
      const mesh = renderer.upload(b);
      if (record) meshByKey.set(k, mesh);
      const cx = B.minX + ((k % NX) + 0.5) * CHUNK;
      const cz = B.minZ + (Math.floor(k / NX) + 0.5) * CHUNK;
      out.push({ mesh, min: mesh.min, max: mesh.max, cx, cz, fade: 0 });
    }
    return out;
  }
  // Land chunks carry three meshes: the town (roads, ground, trees, everything
  // that is not a house) plus the near and far house bakes. A chunk can exist
  // with only houses in it, so the record list is the union of the three keys.
  function uploadMap(map) {
    const out = new Map();
    for (const [k, b] of map) {
      if (b.empty) continue;
      tris += b.i.length / 3;
      out.set(k, renderer.upload(b));
    }
    return out;
  }
  const landMesh = uploadMap(builders);
  const nearMesh = uploadMap(houseNearB);
  const farMesh = uploadMap(houseFarB);
  for (const [k, m] of landMesh) meshByKey.set(k, m);
  let nearTris = 0, farTris = 0;
  for (const m of nearMesh.values()) nearTris += m.count / 3;
  for (const m of farMesh.values()) farTris += m.count / 3;
  const chunks = [];
  for (const k of new Set([...landMesh.keys(), ...nearMesh.keys(), ...farMesh.keys()])) {
    const mesh = landMesh.get(k) || null;
    const near = nearMesh.get(k) || null;
    const far = farMesh.get(k) || null;
    const any = mesh || near || far;
    chunks.push({
      mesh, near, far, min: any.min, max: any.max, fade: 0,
      cx: B.minX + ((k % NX) + 0.5) * CHUNK,
      cz: B.minZ + (Math.floor(k / NX) + 0.5) * CHUNK,
    });
  }
  const waterChunks = uploadSet(waterB);
  const nightChunks = uploadSet(nightB);
  for (let i = 0; i < poles.length; i++) poles[i].mesh = poles[i].k == null ? null : (meshByKey.get(poles[i].k) || null);
  const distantMesh = distant.empty ? null : renderer.upload(distant);
  tris += distant.i.length / 3;
  // The builders have done their job: every vertex is on the GPU now, and
  // nothing below reads them again. But bAt() and friends are closures over
  // these Maps, and the returned draw()/query functions keep the whole scope
  // alive, so without this the 3.8 M triangles stay resident TWICE - once as
  // GPU buffers and once as ~870 MB of boxed doubles that Safari eventually
  // kills the tab over. Measured: 1057 MB heap before, 182 MB after.
  builders.clear(); houseNearB.clear(); houseFarB.clear(); waterB.clear(); nightB.clear();
  distant.v.length = 0; distant.i.length = 0;
  const signage = opts.signage === false ? null : buildSignage(renderer, baseHeightAt);

  // Flatten the furniture log: a few hundred thousand samples as loose numbers
  // would be a megabyte of boxed doubles hanging off the world for the whole
  // session, and the only reader is the smoke test.
  const furniture = {
    n: furn.x.length,
    x: Float64Array.from(furn.x), z: Float64Array.from(furn.z),
    road: Int32Array.from(furn.road), dropped: Uint8Array.from(furn.dropped),
    kind: furn.kind,
    droppedCount: cnt.furnDropped,
  };
  furn.x.length = 0; furn.z.length = 0; furn.road.length = 0; furn.dropped.length = 0;

  const dt = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) | 0;
  console.log(`world: ${chunks.length} chunks (+${waterChunks.length} water, ${nightChunks.length} night), `
    + `${tris | 0} tris, ${buildings.length} buildings (${cnt.houseCount} archetype houses, `
    + `${cnt.houseTris | 0} near + ${cnt.houseFarTris | 0} far tris, atlas ${mats && mats.tex ? 'on' : 'OFF'}), `
    + `${roads.length} roads (${cnt.interCount} intersections, ${cnt.cornerCount} kerb corners, `
    + `${cnt.jointCount} joints, ${cnt.dashCount} dashes, ${cnt.sidewalkCount} walks, ${cnt.wallsOffRoad} walls off the asphalt, ${cnt.stopLineCount} stop lines, `
    + `${cnt.furnDropped} pieces kept off the asphalt), `
    + `${SIGNALS.length} signals, ${STOPS.length} stop signs, ${cnt.treeCount} trees, ${cnt.plantingCount} shrubs, ${cnt.poleCount} poles, `
    + `${cnt.groundQuads} ground quads, ${cnt.skirtCount} skirts, `
    + `${cnt.shoreCount} shore, ${cnt.rockCount} rocks, ${cnt.dockCount} docks, ${cnt.marinaBoats} boats, ${cnt.poolCount} lamp pools, `
    + `${segs.length >> 2} collider segments, ${cnt.signCount} boards, `
    + `${signage ? signage.names.length : 0} storefronts, ${cnt.winQuads} windows — ${dt} ms`);

  Object.assign(ctx, { tris, nearTris, farTris, chunks, waterChunks, nightChunks, distantMesh, signage,
    furniture });
}
