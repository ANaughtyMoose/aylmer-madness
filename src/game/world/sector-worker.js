// Dedicated CPU bake. Terminating this Worker is the cancellation mechanism
// during synchronous geometry generation; a cancel message could not run then.
import { packMesh, packetTransfer, WORKER_PACKET_VERSION } from './worker-packet.js';

let request = null, acknowledge = null;
async function sendPacket(kind, packet) {
  const sequence = ++request.sequence;
  const { transfer, bytes } = packetTransfer(packet);
  const waiting = new Promise((resolve) => { acknowledge = { sequence, resolve }; });
  self.postMessage({ version: WORKER_PACKET_VERSION, id: request.id, sequence, kind, packet, bytes }, transfer);
  await waiting;
}
async function bake(message) {
  // W8-LIGHT: a Worker has no localStorage; it bakes with the main thread's
  // Advanced lighting choice (glow tags, vertex AO), set before any builder runs.
  (await import('../look/advlight.js')).setAdvLight(!!message.advLight);
  // Match main's side-effect order exactly before any cached signal plan or
  // geometry is requested. Both modules mutate MAP at module initialization.
  await import('../landmarks.js');
  await import('../ottawa.js');
  // S3-JUMPS: main.js pushes the ramps into terrain.js's FEATURES at module
  // load; this Worker has its own copy of terrain.js, so without this the land
  // it bakes has no ramps on it and the truck flies off flat-looking ground.
  (await import('../jumps.js')).installJumps();
  const [{ bakeWorld, packWorldQueries }, { sectorAt }, { Materials, setMaterials }, { default: STUB }] = await Promise.all([
    import('../world.js'), import('../sectors.js'), import('../materials.js'), import('../materials_stub.js'),
  ]);
  const mats = message.materials ? new Materials(message.materials, null) : STUB;
  if (message.materials) mats.prototypeStyle = !!message.prototypeStyle;
  setMaterials(mats);
  self.postMessage({ version: WORKER_PACKET_VERSION, id: request.id, sequence: ++request.sequence, kind: 'bake-start' });
  const started = performance.now();
  const ctx = bakeWorld({ isPrototype: !!message.prototype }, mats, {
    inside: (x, z) => sectorAt(x, z) === message.sector,
    distant: message.distant, signage: false,
  });
  const bakeMs = performance.now() - started;
  const sets = [['land', ctx.builders], ['near', ctx.houseNearB], ['far', ctx.houseFarB],
    ['water', ctx.waterB], ['night', ctx.nightB], ['distant', new Map([[null, ctx.distant]])]];
  for (const [kind, map] of sets) {
    for (const [key, builder] of map) {
      if (!builder.empty) {
        const packet = packMesh(builder, kind, key);
        // No retained boxed vertex copy after the packet is made. Releasing
        // it is safe now: fragments and camera surfaces already own buffers.
        builder.v.length = builder.i.length = builder.uv.length = 0;
        if (builder.rect) builder.rect.length = 0;
        map.delete(key);
        await sendPacket('mesh', packet);
      } else map.delete(key);
    }
  }
  const packet = packWorldQueries(ctx);
  packet.bakeMs = bakeMs;
  await sendPacket('queries', packet);
  self.postMessage({ version: WORKER_PACKET_VERSION, id: request.id, sequence: ++request.sequence, kind: 'done' });
}
self.onmessage = ({ data }) => {
  if (data.kind === 'ack') {
    if (request && data.id === request.id && acknowledge?.sequence === data.sequence) {
      const done = acknowledge.resolve; acknowledge = null; done();
    }
    return;
  }
  if (data.kind !== 'bake' || request) return;
  request = { id: data.id, sequence: 0 };
  bake(data).catch((error) => self.postMessage({ version: WORKER_PACKET_VERSION, id: data.id,
    kind: 'error', message: error.stack || error.message }));
};
