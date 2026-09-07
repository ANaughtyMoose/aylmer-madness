// Borrowed models, converted at build time (tools/gltf2mesh.mjs) and loaded
// here. Nothing in this file parses glTF: by the time a model reaches the
// browser it is already positions / normals / colours / indices in the engine's
// own layout, which is the whole reason the runtime still has no dependencies.
//
// The optional-asset rule, same as carskin.js: assets/models/manifest.json is
// the ONE file that is always fetched, and it is committed even when empty.
// Everything else is only asked for because the manifest said it exists, so a
// checkout with no models makes no noise and a boot console stays useful for
// real errors. `console` here is warnings only — a missing model is a missing
// prop, not a broken game.
//
// Instancing is the same instancing the game already does for cars and props:
// one uploaded mesh, many model matrices. A second copy of a tree costs a
// m4.compose and a draw call and NOT ONE BYTE of GPU memory.
import { MeshBuilder, STRIDE } from '../core/mesh.js';

const BASE = 'assets/models/';

/**
 * Turn a converted document into typed arrays. `fetchBin(name)` is only called
 * for the spilled-payload form (a mesh too big to keep readable as JSON); it
 * must resolve to an ArrayBuffer. Injected rather than assumed so the smoke
 * suite can run this in node with no server.
 */
export async function loadModelDoc(doc, fetchBin) {
  if (!doc || doc.format !== 'aylmer-mesh-1') {
    throw new Error(`unknown model format ${doc && doc.format}`);
  }
  const verts = doc.verts, tris = doc.tris;
  let positions, normals, colors, uvs = null, indices;
  if (doc.bin) {
    // The .bin is written in exactly this order by tools/gltf2mesh.mjs:
    // positions, normals, colours, [uvs], indices — nothing self-describing,
    // because the header beside it already says how long each run is.
    const ab = await fetchBin(doc.bin);
    let off = 0;
    const take = (Ctor, n) => {
      // The buffer is 4-byte aligned by construction, so a subarray view would
      // do; a copy keeps the model independent of the fetch buffer's lifetime.
      const a = new Ctor(ab, off, n);
      off += n * Ctor.BYTES_PER_ELEMENT;
      return a;
    };
    positions = take(Float32Array, verts * 3);
    normals = take(Float32Array, verts * 3);
    colors = take(Float32Array, verts * 3);
    if (doc.uv) uvs = take(Float32Array, verts * 2);
    indices = take(Uint32Array, tris * 3);
  } else {
    positions = new Float32Array(doc.positions);
    normals = new Float32Array(doc.normals);
    colors = new Float32Array(doc.colors);
    if (doc.uv && doc.uvs) uvs = new Float32Array(doc.uvs);
    indices = new Uint32Array(doc.indices);
  }
  if (positions.length !== verts * 3 || indices.length !== tris * 3) {
    throw new Error(`${doc.slug}: header says ${verts} verts / ${tris} tris, `
      + `payload has ${positions.length / 3} / ${indices.length / 3}`);
  }
  return {
    slug: doc.slug, tris, verts, uvs, positions, normals, colors, indices,
    min: doc.bounds.min.slice(), max: doc.bounds.max.slice(),
    license: doc.license || null,
  };
}

/**
 * The interleaved vertex buffer Renderer.upload() wants, without going through
 * MeshBuilder.vert() a hundred thousand times. It quacks like a MeshBuilder
 * because upload() only ever touches v / i / uv / rect / min / max / finish.
 */
export function modelMeshData(m) {
  const v = new Float32Array(m.verts * STRIDE);
  for (let i = 0, o = 0; i < m.verts; i++, o += STRIDE) {
    const p = i * 3;
    v[o] = m.positions[p]; v[o + 1] = m.positions[p + 1]; v[o + 2] = m.positions[p + 2];
    v[o + 3] = m.normals[p]; v[o + 4] = m.normals[p + 1]; v[o + 5] = m.normals[p + 2];
    v[o + 6] = m.colors[p]; v[o + 7] = m.colors[p + 1]; v[o + 8] = m.colors[p + 2];
  }
  return {
    v, i: m.indices, uv: m.uvs || [], rect: [],
    min: m.min.slice(), max: m.max.slice(),
    finish() { return this; },
  };
}

/**
 * A REAL MeshBuilder holding the model, optionally placed. This is the door
 * into the baked world: world.js's trees and streetprops.js's furniture are
 * emitted into a per-chunk builder, not drawn per instance, so wiring a model
 * into either of those means appending it here rather than uploading it.
 * `at` is { x, y, z, yaw, scale }.
 */
export function appendModel(mb, m, at = {}) {
  const { x = 0, y = 0, z = 0, yaw = 0, scale = 1 } = at;
  const co = Math.cos(yaw), si = Math.sin(yaw);
  const base = mb.vertCount;
  // Same yaw convention as MeshBuilder.tower(): local +X maps to map-angle -yaw.
  for (let i = 0; i < m.verts; i++) {
    const p = i * 3;
    const px = m.positions[p] * scale, py = m.positions[p + 1] * scale, pz = m.positions[p + 2] * scale;
    const nx = m.normals[p], ny = m.normals[p + 1], nz = m.normals[p + 2];
    mb.vert(
      x + px * co + pz * si, y + py, z - px * si + pz * co,
      nx * co + nz * si, ny, -nx * si + nz * co,
      [m.colors[p], m.colors[p + 1], m.colors[p + 2]],
      m.uvs ? m.uvs[i * 2] : 0, m.uvs ? m.uvs[i * 2 + 1] : 0);
  }
  for (let i = 0; i < m.indices.length; i += 3) {
    mb.tri(base + m.indices[i], base + m.indices[i + 1], base + m.indices[i + 2]);
  }
  return m.tris;
}

/**
 * Load every model the manifest lists and upload each once.
 *
 * Returns a registry that is USABLE WHEN EMPTY: `get` and `mesh` return null
 * for anything absent, so a caller never has to know whether the assets are
 * installed. `opts.base` moves the directory (the lab is two levels down);
 * `opts.only` loads a subset; `opts.manifest` skips the fetch entirely.
 */
export async function loadModels(renderer, opts = {}) {
  const base = opts.base || BASE;
  const reg = {
    base, models: new Map(), meshes: new Map(), list: [], entries: [], tris: 0, bytes: 0,
    get(slug) { return this.models.get(slug) || null; },
    entry(slug) { return this.entries.find((e) => e.slug === slug) || null; },
    mesh(slug) { return this.meshes.get(slug) || null; },
    has(slug) { return this.models.has(slug); },
  };
  let manifest = opts.manifest || null;
  if (!manifest) {
    // Absent manifest is a NORMAL state and must be quiet: no throw, no warn.
    // (It is committed even when empty precisely so this fetch never 404s.)
    manifest = await fetch(base + 'manifest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  if (!manifest || !Array.isArray(manifest.models)) return reg;

  const wanted = manifest.models.filter((e) => !opts.only || opts.only.includes(e.slug));
  const docs = await Promise.all(wanted.map((e) =>
    fetch(`${base}${e.slug}.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)));

  for (let k = 0; k < wanted.length; k++) {
    const e = wanted[k], doc = docs[k];
    if (!doc) { console.warn(`models: ${e.slug} is in the manifest but did not load`); continue; }
    let m;
    try {
      m = await loadModelDoc(doc, (name) =>
        fetch(base + name, { cache: 'no-cache' }).then((r) => {
          if (!r.ok) throw new Error(`${name} ${r.status}`);
          return r.arrayBuffer();
        }));
    } catch (err) { console.warn(`models: ${e.slug} —`, err.message); continue; }
    reg.models.set(e.slug, m);
    reg.entries.push(e);
    reg.list.push(e.slug);
    reg.tris += m.tris;
    if (renderer) {
      const mesh = renderer.upload(modelMeshData(m));
      reg.meshes.set(e.slug, mesh);
      reg.bytes += mesh.bytes;
    }
  }
  return reg;
}
