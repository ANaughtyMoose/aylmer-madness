// The small stuff you can knock over: Canada Post relay boxes, mailboxes, the
// blue and green bins out for garbage day, newspaper boxes, hydrants, the
// terrasse furniture on Principale, shopping carts in the Galeries lot and the
// fruit stand outside the dep.
//
// Where they stand is decided in world.js section 9 (`world.propSpots`); this
// file turns that list into geometry and into something a car can hit.
//
// The rules are the world's own rules, because 1,500 of anything cannot be 1,500
// draw calls:
//   * every kind is emitted ONCE per spot into a per-chunk MeshBuilder, so the
//     whole population costs one draw per 200 m chunk that survives the cull;
//   * each prop remembers which slice of its chunk's index buffer it occupies,
//     so knocking it over is renderer.blankIndices() — the same O(1) trick
//     world.js uses on a snapped hydro pole — and nothing is ever rebuilt;
//   * the thing that flies off is a DEBRIS body (debris.js), drawn from a
//     per-kind mesh uploaded once here. At most 48 of those exist at a time.
//
// Coordinates are metres, +X east, +Z south, +Y up, and yaw turns the prop to
// face the road it stands beside.
import { MeshBuilder, rgb, shade } from '../core/mesh.js';

const CHUNK = 200;        // must match world.js so props line up with the town
const CELL = 16;          // broadphase cell for hitBy()

const C = {
  relay: 0x5d6b58, relayLid: 0x47523f, relayLeg: 0x3b3f38,
  mail: 0xb02a22, mailTop: 0x8c211a, post: 0x555a5e,
  recyc: 0x2b5fa6, garbage: 0x2f6b3a, lid: 0x232b26, wheel: 0x1a1c1e,
  news: 0x394e63, newsWin: 0xb9c6d2, newsLeg: 0x2a3642,
  hydrant: 0xc9b431, hydCap: 0xa3271e,
  tableTop: 0x9aa0a6, chair: 0x63744f,
  cart: 0xb6bcc2, cartFrame: 0x8b9197, cartHandle: 0xa33029,
  wood: 0x9a7343, crate: 0xb08a55, awning: 0x2f7a4a, fruitA: 0xd06a20, fruitB: 0x8fae3a,
  bag: 0x25272c, can: 0x9fa8ad, paper: 0xd8d3c4,
};

// yaw-aware local -> world, the same convention MeshBuilder.tower uses:
// local +X maps to (cos yaw, -sin yaw), local +Z to (sin yaw, cos yaw).
function frame(x, z, yaw) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return {
    X: (lx, lz) => x + lx * c + lz * s,
    Z: (lx, lz) => z - lx * s + lz * c,
    yaw,
  };
}

// --------------------------------------------------------------- the catalogue
// r    collision radius, metres
// cy   height of the centre of mass — where a debris body floats and settles
// kick how far the car's velocity carries it (light things fly further)
// snd  which thud() the audio makes
// spill how many bags/cans come out of it when it goes over
export const KINDS = {
  relaybox: {
    r: 0.62, cy: 0.72, kick: 0.55, snd: 'metal', spill: 0, dmg: 1.25,
    emit(b, x, y, z, yaw) {
      const f = frame(x, z, yaw);
      b.tower(x, y + 0.18, z, 1.05, 0.62, 1.02, rgb(C.relay), { yaw, noBottom: true, top: rgb(C.relayLid) });
      b.tower(x, y + 1.20, z, 1.05, 0.62, 0.16, rgb(C.relayLid), { yaw, dz: -0.10, noBottom: true });
      for (const lx of [-0.42, 0.42]) {
        b.box(f.X(lx, 0), y + 0.09, f.Z(lx, 0), 0.10, 0.18, 0.46, rgb(C.relayLeg), { yaw, noBottom: true });
      }
    },
  },
  mailbox: {
    r: 0.34, cy: 0.92, kick: 0.85, snd: 'metal', spill: 2, dmg: 0.9,
    emit(b, x, y, z, yaw) {
      b.cyl(x, y + 0.35, z, 0.07, 0.70, 5, rgb(C.post), 'y', false);
      b.tower(x, y + 0.70, z, 0.52, 0.40, 0.50, rgb(C.mail), { yaw, noBottom: true, top: rgb(C.mailTop) });
      b.tower(x, y + 1.20, z, 0.52, 0.40, 0.12, rgb(C.mailTop), { yaw, wTop: 0.30, noBottom: true });
    },
  },
  recyc: {
    r: 0.42, cy: 0.52, kick: 1.25, snd: 'bin', spill: 4, dmg: 0.7,
    emit(b, x, y, z, yaw) { bin(b, x, y, z, yaw, C.recyc); },
  },
  garbage: {
    r: 0.42, cy: 0.52, kick: 1.25, snd: 'bin', spill: 4, dmg: 0.7,
    emit(b, x, y, z, yaw) { bin(b, x, y, z, yaw, C.garbage); },
  },
  newsbox: {
    r: 0.32, cy: 0.62, kick: 0.95, snd: 'metal', spill: 3, dmg: 0.9,
    emit(b, x, y, z, yaw) {
      const f = frame(x, z, yaw);
      b.tower(x, y + 0.26, z, 0.46, 0.40, 0.82, rgb(C.news), { yaw, noBottom: true });
      b.box(f.X(0, -0.21), y + 0.80, f.Z(0, -0.21), 0.32, 0.26, 0.03, rgb(C.newsWin), { yaw, noBottom: true });
      for (const lx of [-0.17, 0.17]) {
        b.box(f.X(lx, 0), y + 0.13, f.Z(lx, 0), 0.05, 0.26, 0.05, rgb(C.newsLeg), { yaw, noBottom: true });
      }
    },
  },
  hydrant: {
    r: 0.26, cy: 0.38, kick: 0.35, snd: 'metal', spill: 0, dmg: 1.8, water: true,
    emit(b, x, y, z, yaw) {
      const f = frame(x, z, yaw);
      b.cyl(x, y + 0.06, z, 0.24, 0.12, 6, rgb(C.hydCap), 'y', false);
      b.cyl(x, y + 0.36, z, 0.15, 0.56, 6, rgb(C.hydrant), 'y', false);
      b.cyl(x, y + 0.68, z, 0.19, 0.10, 6, rgb(C.hydCap), 'y', true);
      for (const lx of [-0.17, 0.17]) {
        b.box(f.X(lx, 0), y + 0.42, f.Z(lx, 0), 0.12, 0.14, 0.14, rgb(C.hydCap), { yaw, noBottom: true });
      }
    },
  },
  cafetable: {
    r: 0.40, cy: 0.40, kick: 1.0, snd: 'wood', spill: 0, dmg: 0.6,
    emit(b, x, y, z, yaw) {
      b.cyl(x, y + 0.05, z, 0.24, 0.06, 6, rgb(C.post), 'y', false);
      b.cyl(x, y + 0.36, z, 0.045, 0.62, 4, rgb(C.post), 'y', false);
      b.cyl(x, y + 0.71, z, 0.38, 0.05, 8, rgb(C.tableTop), 'y', true);
    },
  },
  cafechair: {
    r: 0.30, cy: 0.42, kick: 1.5, snd: 'wood', spill: 0, dmg: 0.45,
    emit(b, x, y, z, yaw) {
      const f = frame(x, z, yaw);
      b.box(x, y + 0.44, z, 0.42, 0.05, 0.42, rgb(C.chair), { yaw, noBottom: true });
      b.box(f.X(0, -0.19), y + 0.66, f.Z(0, -0.19), 0.40, 0.40, 0.05, rgb(C.chair), { yaw, noBottom: true });
      for (const lx of [-0.16, 0.16]) for (const lz of [-0.16, 0.16]) {
        b.box(f.X(lx, lz), y + 0.21, f.Z(lx, lz), 0.04, 0.42, 0.04, rgb(C.post), { yaw, noBottom: true });
      }
    },
  },
  cart: {
    r: 0.44, cy: 0.52, kick: 1.8, snd: 'metal', spill: 0, dmg: 0.5,
    emit(b, x, y, z, yaw) {
      const f = frame(x, z, yaw);
      b.tower(x, y + 0.42, z, 0.56, 0.86, 0.52, rgb(C.cart),
        { yaw, wTop: 0.68, dTop: 1.02, noBottom: true, top: shade(C.cart, 0.8) });
      b.box(f.X(0, 0.44), y + 1.02, f.Z(0, 0.44), 0.56, 0.05, 0.05, rgb(C.cartHandle), { yaw, noBottom: true });
      for (const lx of [-0.22, 0.22]) for (const lz of [-0.34, 0.34]) {
        b.box(f.X(lx, lz), y + 0.09, f.Z(lx, lz), 0.05, 0.18, 0.05, rgb(C.cartFrame), { yaw, noBottom: true });
      }
    },
  },
  fruitstand: {
    r: 0.95, cy: 0.60, kick: 0.4, snd: 'wood', spill: 5, dmg: 1.1,
    emit(b, x, y, z, yaw) {
      const f = frame(x, z, yaw);
      b.box(x, y + 0.74, z, 1.9, 0.06, 0.80, rgb(C.wood), { yaw, noBottom: true });
      for (const lx of [-0.85, 0.85]) for (const lz of [-0.32, 0.32]) {
        b.box(f.X(lx, lz), y + 0.36, f.Z(lx, lz), 0.06, 0.72, 0.06, rgb(C.post), { yaw, noBottom: true });
      }
      for (const lx of [-0.55, 0.05, 0.62]) {
        b.tower(f.X(lx, 0), y + 0.77, f.Z(lx, 0), 0.48, 0.44, 0.22, rgb(C.crate), { yaw, noBottom: true });
        b.cyl(f.X(lx - 0.08, -0.06), y + 1.04, f.Z(lx - 0.08, -0.06), 0.09, 0.10, 5,
          rgb(lx < 0 ? C.fruitA : C.fruitB), 'y', true);
        b.cyl(f.X(lx + 0.10, 0.05), y + 1.04, f.Z(lx + 0.10, 0.05), 0.09, 0.10, 5,
          rgb(lx < 0 ? C.fruitB : C.fruitA), 'y', true);
      }
      b.tower(x, y + 1.66, z, 2.1, 0.95, 0.08, rgb(C.awning), { yaw, dz: -0.18, noBottom: true });
      for (const lx of [-0.92, 0.92]) {
        b.box(f.X(lx, -0.34), y + 1.20, f.Z(lx, -0.34), 0.05, 0.92, 0.05, rgb(C.post), { yaw, noBottom: true });
      }
    },
  },
  // Spill: these are never baked into a chunk, only ever thrown as debris.
  bag: {
    r: 0.22, cy: 0.20, kick: 2.2, snd: 'bin', spill: 0, dmg: 0, loose: true,
    emit(b, x, y, z, yaw) {
      b.tower(x, y + 0.02, z, 0.40, 0.34, 0.34, rgb(C.bag), { yaw, wTop: 0.26, dTop: 0.22, noBottom: true });
    },
  },
  can: {
    r: 0.10, cy: 0.07, kick: 2.6, snd: 'metal', spill: 0, dmg: 0, loose: true,
    emit(b, x, y, z, yaw) {
      b.cyl(x, y + 0.07, z, 0.055, 0.13, 5, rgb(C.can), 'y', true);
    },
  },
  paper: {
    r: 0.14, cy: 0.03, kick: 3.0, snd: 'wood', spill: 0, dmg: 0, loose: true,
    emit(b, x, y, z, yaw) {
      b.box(x, y + 0.03, z, 0.28, 0.03, 0.22, rgb(C.paper), { yaw, noBottom: true });
    },
  },
};

function bin(b, x, y, z, yaw, hex) {
  const f = frame(x, z, yaw);
  b.tower(x, y + 0.04, z, 0.56, 0.62, 0.88, rgb(hex),
    { yaw, wTop: 0.64, dTop: 0.70, noBottom: true, top: rgb(C.lid) });
  b.tower(x, y + 0.92, z, 0.66, 0.72, 0.10, rgb(C.lid), { yaw, dz: -0.06, noBottom: true });
  for (const lx of [-0.28, 0.28]) {
    b.box(f.X(lx, 0.26), y + 0.06, f.Z(lx, 0.26), 0.06, 0.12, 0.12, rgb(C.wheel), { yaw, noBottom: true });
  }
}

// What a bin coughs up when it goes over.
const SPILL_OF = { recyc: ['can', 'paper', 'can'], garbage: ['bag', 'bag', 'paper'], default: ['paper', 'can'] };

// --------------------------------------------------------------- the bake

/**
 * Bake world.propSpots into per-chunk meshes and a hit grid.
 * Returns the object main.js hands to Reactive: chunks to draw, items to hit,
 * and one uploaded mesh per kind for the debris that flies off.
 */
export function buildStreetProps(renderer, world) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const B = world.bounds;
  const NX = Math.ceil((B.maxX - B.minX) / CHUNK);
  const NZ = Math.ceil((B.maxZ - B.minZ) / CHUNK);
  const spots = world.propSpots || [];

  const builders = new Map();
  const items = [];
  const grid = new Map();
  const gkey = (i, j) => i * 73856093 ^ j * 19349663;

  for (let n = 0; n < spots.length; n++) {
    const sp = spots[n];
    const K = KINDS[sp.kind];
    if (!K || K.loose) continue;
    const cx = Math.min(NX - 1, Math.max(0, Math.floor((sp.x - B.minX) / CHUNK)));
    const cz = Math.min(NZ - 1, Math.max(0, Math.floor((sp.z - B.minZ) / CHUNK)));
    const key = cz * NX + cx;
    let b = builders.get(key);
    if (!b) { b = new MeshBuilder(); builders.set(key, b); }
    const i0 = b.i.length;
    K.emit(b, sp.x, 0, sp.z, sp.yaw);
    const it = {
      x: sp.x, z: sp.z, yaw: sp.yaw, kind: sp.kind,
      k: key, i0, n: b.i.length - i0, mesh: null, dead: false,
    };
    items.push(it);
    const gk = gkey(Math.floor(sp.x / CELL), Math.floor(sp.z / CELL));
    const arr = grid.get(gk);
    if (arr) arr.push(it); else grid.set(gk, [it]);
  }

  // Upload: one mesh per chunk, plus one small mesh per kind for the debris.
  let tris = 0;
  const meshByKey = new Map();
  const chunks = [];
  for (const [k, b] of builders) {
    if (b.empty) continue;
    tris += b.i.length / 3;
    const mesh = renderer.upload(b);
    meshByKey.set(k, mesh);
    chunks.push({
      mesh, min: mesh.min, max: mesh.max,
      cx: B.minX + ((k % NX) + 0.5) * CHUNK,
      cz: B.minZ + (Math.floor(k / NX) + 0.5) * CHUNK,
    });
  }
  for (let i = 0; i < items.length; i++) items[i].mesh = meshByKey.get(items[i].k) || null;

  const kindMesh = {};
  for (const name of Object.keys(KINDS)) {
    const K = KINDS[name];
    const b = new MeshBuilder();
    K.emit(b, 0, -K.cy, 0, 0);        // origin at the centre of mass, so it tumbles
    kindMesh[name] = renderer.upload(b);
    tris += b.i.length / 3;
  }

  // ------------------------------------------------------------- queries

  const hitOut = [];
  function query(x, z, r) {
    hitOut.length = 0;
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    const r2 = r * r;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = grid.get(gkey(i, j));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const it = arr[k];
          if (it.dead) continue;
          const dx = it.x - x, dz = it.z - z;
          if (dx * dx + dz * dz <= r2) hitOut.push(it);
        }
      }
    }
    return hitOut;
  }

  let knocked = 0;
  // Take one out of the baked mesh. Same two writes as world.js snapPole():
  // the indices go degenerate on the GPU and the item stops answering queries.
  function knock(it) {
    if (it.dead) return false;
    it.dead = true;
    knocked++;
    if (it.mesh && renderer.blankIndices) renderer.blankIndices(it.mesh, it.i0, it.n);
    return true;
  }

  // ------------------------------------------------------------- drawing

  const noOpts = {};
  const stats = { draws: 0, tris: 0 };
  function draw(r, model, x, z, drawDist) {
    const dd = Math.min(drawDist || 420, 420);
    const dd2 = dd * dd;
    stats.draws = 0; stats.tris = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const dx = c.cx - x, dz = c.cz - z;
      if (dx * dx + dz * dz > dd2) continue;
      if (!r.visible(c.mesh)) continue;
      r.draw(c.mesh, model, noOpts);
      stats.draws++; stats.tris += c.mesh.count / 3;
    }
  }

  const ms = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) | 0;
  console.log(`streetprops: ${items.length} props in ${chunks.length} chunks, ${tris | 0} tris — ${ms} ms`);

  return {
    items, chunks, meshes: kindMesh, query, knock, draw, stats,
    count: items.length, tris, buildMs: ms,
    get knocked() { return knocked; },
    spillOf(kind) { return SPILL_OF[kind] || SPILL_OF.default; },
  };
}
