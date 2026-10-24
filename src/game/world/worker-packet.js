// CPU-only transport helpers. No world bake, renderer or DOM is imported here.
// Packing owns fresh buffers; transferring a packet cannot detach a live builder.
export const WORKER_PACKET_VERSION = 1;
const MESH_KINDS = new Set(['land', 'near', 'far', 'water', 'night', 'distant']);

function assert(ok, message) {
  if (!ok) throw new Error(`world packet: ${message}`);
}

function vector(v) {
  assert(v?.length === 3 && Array.from(v).every(Number.isFinite), 'invalid bounds');
  return Array.from(v);
}

export function packMesh(builder, kind, key = null) {
  assert(MESH_KINDS.has(kind), 'unknown mesh kind');
  assert(key === null || Number.isSafeInteger(key), 'invalid chunk key');
  builder.finish?.();
  const n = builder.v.length / 9;
  assert(Number.isInteger(n), 'vertex stride is not nine');
  assert(builder.i.length % 3 === 0, 'indices must contain whole triangles');
  assert(!builder.uv?.length || builder.uv.length === n * 2, 'short UV attribute');
  assert(!builder.rect?.length || builder.rect.length === n * 4, 'short atlas attribute');
  for (const i of builder.i) assert(Number.isInteger(i) && i >= 0 && i < n, 'index outside mesh');
  return {
    kind, key,
    v: Float32Array.from(builder.v), i: Uint32Array.from(builder.i),
    uv: Float32Array.from(builder.uv || []), rect: Float32Array.from(builder.rect || []),
    min: vector(builder.min), max: vector(builder.max),
  };
}

// CSR-like storage keeps each bucket's original order and repeated members.
// Numeric keys stay Float64: generic world grid keys need not fit signed Int32.
export function packIndexGrid(grid, indexOf = (value) => value) {
  const keys = new Float64Array(grid.size), offsets = new Uint32Array(grid.size + 1);
  let size = 0, row = 0;
  for (const [key, values] of grid) {
    assert(Number.isSafeInteger(key), 'grid key must be a safe integer');
    keys[row] = key; offsets[row++] = size;
    size += values.length;
    assert(size <= 0xffffffff, 'grid is too large');
  }
  offsets[row] = size;
  const items = new Uint32Array(size);
  let at = 0;
  for (const values of grid.values()) for (const value of values) {
    const index = indexOf(value);
    assert(Number.isInteger(index) && index >= 0 && index <= 0xffffffff, 'invalid grid member');
    items[at++] = index;
  }
  return { keys, offsets, items };
}

export function unpackIndexGrid({ keys, offsets, items }, objects = null) {
  assert(keys instanceof Float64Array && offsets instanceof Uint32Array
    && items instanceof Uint32Array, 'invalid grid arrays');
  assert(offsets.length === keys.length + 1 && offsets[0] === 0
    && offsets[keys.length] === items.length, 'invalid grid offsets');
  const out = new Map();
  for (let i = 0; i < keys.length; i++) {
    assert(Number.isSafeInteger(keys[i]) && !out.has(keys[i]), 'invalid or duplicate grid key');
    assert(offsets[i] <= offsets[i + 1], 'grid offsets are not ordered');
    const view = items.subarray(offsets[i], offsets[i + 1]);
    const values = objects === null ? view : Array.from(view, (index) => {
      assert(index < objects.length, 'grid object is missing');
      return objects[index];
    });
    out.set(keys[i], values);
  }
  return out;
}

// Do not serialize planSignals() wholesale. Signals owns these live objects.
// Junction and pole/head coordinates survive deterministic approach reordering.
function signalEntries(signals) {
  const entries = [];
  for (const signal of signals) for (const approach of signal.approaches) {
    const key = JSON.stringify([signal.x, signal.z, approach.poleX, approach.poleZ,
      approach.headX, approach.headZ]);
    entries.push([key, approach]);
  }
  assert(new Set(entries.map(([key]) => key)).size === entries.length, 'duplicate signal identity');
  return entries;
}

function packFragment(fragment) {
  if (!fragment) return null;
  assert(fragment.v instanceof Float32Array && (fragment.i instanceof Uint16Array
    || fragment.i instanceof Uint32Array), 'invalid pole fragment');
  const out = { v: fragment.v.slice(), i: fragment.i.slice() };
  if (fragment.uv) out.uv = fragment.uv.slice();
  return out;
}

export function packPoles(poles, poleGrid, signals) {
  const identities = new Map(signalEntries(signals).map(([key, approach]) => [approach, key]));
  const indices = new Map(poles.map((pole, i) => [pole, i]));
  const records = poles.map((p) => {
    const signalKey = p.signal ? identities.get(p.signal) : null;
    assert(!p.signal || signalKey !== undefined, 'pole signal is not canonical');
    return {
      x: p.x, y: p.y, z: p.z, kind: p.kind, h: p.h, k: p.k,
      i0: p.i0, n: p.n, seg: p.seg, dead: !!p.dead,
      fragment: packFragment(p.fragment), signalKey,
      signalHeadY: p.signal?.headY ?? null,
    };
  });
  return { records, grid: packIndexGrid(poleGrid, (p) => indices.get(p)) };
}

export function restorePoles(packet, signals, meshByKey) {
  const approaches = new Map(signalEntries(signals));
  const poles = packet.records.map(({ signalKey, signalHeadY, ...record }) => {
    const p = { ...record, mesh: record.k == null ? null : meshByKey.get(record.k) };
    assert(record.k == null || p.mesh, 'pole mesh is missing');
    if (signalKey !== null) {
      p.signal = approaches.get(signalKey);
      assert(p.signal, 'main-thread signal is missing');
    }
    return p;
  });
  const poleGrid = unpackIndexGrid(packet.grid, poles);
  // Validate the complete packet before changing any live approach. Do not reset
  // broken state: the player may have hit a light while a Worker was running.
  for (let i = 0; i < poles.length; i++) {
    const y = packet.records[i].signalHeadY;
    if (poles[i].signal && y !== null) poles[i].signal.headY = y;
  }
  return { poles, poleGrid };
}

// A packet consists of plain data and typed buffers, including camera packets.
// Reject accidental runtime closures or class instances before postMessage.
// Return each backing buffer once, even when several views refer to it.
export function packetTransfer(packet) {
  const seen = new Set(), buffers = new Set();
  function visit(value) {
    if (value === null || value === undefined || typeof value === 'string'
      || typeof value === 'boolean' || typeof value === 'number') return;
    assert(typeof value === 'object', 'runtime value cannot be transferred');
    if (seen.has(value)) return;
    seen.add(value);
    if (value instanceof ArrayBuffer) { buffers.add(value); return; }
    if (ArrayBuffer.isView(value)) {
      assert(value.buffer instanceof ArrayBuffer, 'shared buffers are not owned packets');
      buffers.add(value.buffer); return;
    }
    assert(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null, 'packet contains a class instance');
    for (const item of Object.values(value)) visit(item);
  }
  visit(packet);
  return { transfer: [...buffers], bytes: [...buffers].reduce((sum, b) => sum + b.byteLength, 0) };
}
