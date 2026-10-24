import { WORKER_PACKET_VERSION } from './worker-packet.js';
import { createWorldUpload } from './upload.js';
import { restoreWorldQueries, finishWorld } from '../world.js';

const scheduleFrame = globalThis.requestAnimationFrame?.bind(globalThis);
const nextFrame = () => new Promise((resolve) => scheduleFrame(resolve));
let requestSerial = 0;

// Exactly one request per client. A request owns all pending GPU handles until
// the final ready result is returned. Resident slices are owned by sectors.js.
export function createSectorClient(renderer, mats, options = {}) {
  let active = null;
  const history = [];
  function cancel() {
    if (!active) return false;
    const work = active; active = null;
    work.worker.terminate(); work.upload.cancel(); work.ctx.cameraColliders?.free();
    work.stats.cancelled = true;
    work.reject(new DOMException('Sector preparation cancelled', 'AbortError'));
    return true;
  }
  function prepare(sector, opts = {}) {
    cancel();
    const worker = options.workerFactory ? options.workerFactory() : new Worker(new URL('./sector-worker.js', import.meta.url), { type: 'module' });
    const upload = createWorldUpload(renderer);
    const id = ++requestSerial, started = performance.now();
    const stats = { id, sector, meshes: 0, packetBytes: 0, maxPacketBytes: 0,
      maxUploadMs: 0, maxPrewarmMs: 0, maxRestoreMs: 0, bakeMs: 0, elapsedMs: 0, cancelled: false, phase: 'imports',
      prewarmedMeshes: 0, submittedDraws: 0 };
    const ctx = { renderer, mats, opts, PROTO_NATURE: !!renderer.isPrototype };
    let lastYield = performance.now(), restoreStart = lastYield;
    const alive = () => { if (active?.id !== id) throw new DOMException('Stale sector request', 'AbortError'); };
    const yieldTask = async () => {
      stats.maxRestoreMs = Math.max(stats.maxRestoreMs, performance.now() - restoreStart);
      await (options.nextFrame || nextFrame)(); alive();
      restoreStart = lastYield = performance.now();
    };
    const promise = new Promise((resolve, reject) => {
      active = { id, worker, upload, ctx, reject, stats };
      function fail(error) {
        if (active?.id !== id) return;
        active = null; worker.terminate(); upload.cancel(); ctx.cameraColliders?.free(); reject(error);
      }
      worker.onerror = (event) => fail(new Error(event.message || 'Sector Worker failed'));
      let expected = 1, queries = false;
      worker.onmessage = async ({ data }) => {
        if (active?.id !== id || data.id !== id) return;
        try {
          if (data.version !== WORKER_PACKET_VERSION) throw new Error('Sector Worker version mismatch');
          if (data.kind === 'error') throw new Error(data.message);
          if (data.sequence !== expected++) throw new Error('Sector Worker packet order mismatch');
          stats.packetBytes += data.bytes || 0; stats.maxPacketBytes = Math.max(stats.maxPacketBytes, data.bytes || 0);
          if (data.kind === 'bake-start') {
            stats.phase = 'bake';
          } else if (data.kind === 'mesh') {
            stats.phase = 'upload';
            if (queries) throw new Error('Sector mesh arrived after queries');
            let at = performance.now();
            const mesh = upload.add(data.packet);
            stats.maxUploadMs = Math.max(stats.maxUploadMs, performance.now() - at); stats.meshes++;
            at = performance.now();
            const warm = await options.prewarm?.(mesh, data.packet.kind, mats);
            if (warm?.submitted > 0) { stats.prewarmedMeshes++; stats.submittedDraws += warm.submitted; }
            stats.maxPrewarmMs = Math.max(stats.maxPrewarmMs, performance.now() - at);
            alive();
            if (performance.now() - lastYield >= 8) { await (options.nextFrame || nextFrame)(); alive(); lastYield = performance.now(); }
          } else if (data.kind === 'queries') {
            stats.phase = 'queries';
            if (queries) throw new Error('Duplicate sector queries');
            queries = true; stats.bakeMs = data.packet.bakeMs;
            Object.assign(ctx, { B: data.packet.bounds, NX: data.packet.NX });
            upload.finish(ctx);
            restoreStart = performance.now();
            await restoreWorldQueries(ctx, data.packet, yieldTask);
          } else if (data.kind === 'done') {
            if (!queries) throw new Error('Sector ended without queries');
            const world = finishWorld(ctx);
            stats.phase = 'ready';
            stats.elapsedMs = performance.now() - started;
            world.loadingStats = stats;
            history.push(stats); if (history.length > 16) history.shift();
            upload.release(); worker.terminate(); active = null;
            resolve(world); return;
          } else throw new Error('Unknown sector packet');
          alive(); worker.postMessage({ kind: 'ack', id, sequence: data.sequence });
        } catch (error) { fail(error); }
      };
      try {
        worker.postMessage({ kind: 'bake', id, sector, distant: !!opts.distant, prototype: !!renderer.isPrototype,
          prototypeStyle: !!mats?.prototypeStyle, materials: mats?.atlas ? { size: mats.size, tiles: mats.tiles } : null });
      } catch (error) { fail(error); }
    });
    return promise;
  }
  return { prepare, cancel, history, get pending() { return active?.stats || null; } };
}
