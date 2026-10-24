// World smoke test — runs the whole bake under node with a stubbed GL.
//
//   node tools/smoke_world.mjs
//
// There is no WebGL and no DOM here, so Renderer.upload is replaced with a
// vertex counter and document.createElement with a canvas that draws nothing.
// Everything else — mapdata, the road graph, intersections, signals, signage —
// is the real code the browser runs.
import { strict as assert } from 'node:assert';

// ---------------------------------------------------------------- stubs
const ctx2d = {
  clearRect() {}, fillRect() {}, fillText() {}, drawImage() {},
  measureText() { return { width: 40 }; },
  getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
  putImageData() {},
};
globalThis.document = {
  createElement() {
    return { width: 0, height: 0, getContext() { return ctx2d; } };
  },
};

class StubRenderer {
  constructor() {
    this.uploads = 0; this.verts = 0; this.tris = 0; this.draws = 0; this.texVerts = 0;
    this.textures = 0; this.time = 0;
    this.env = { sky: [0.42, 0.62, 0.95], fog: [0.72, 0.8, 0.92], sun: [1, 1, 1] };
  }
  upload(b) {
    this.uploads++;
    if (b.finish) b.finish();          // the real Renderer.upload does this
    this.verts += b.v.length / 9;
    if (b.rect.length) this.texVerts += b.v.length / 9;
    this.tris += b.i.length / 3;
    assert.equal(b.i.length % 3, 0, 'index buffer is not whole triangles');
    if (b.uv.length) assert.equal(b.uv.length, (b.v.length / 9) * 2, 'uv array out of step');
    return { vao: null, count: b.i.length, min: b.min.slice(), max: b.max.slice() };
  }
  texture() { this.textures++; return { stub: true }; }
  visible() { return true; }
  draw() { this.draws++; }
}


const { buildWorld } = await import('../src/game/world.js');
const { resolvePlaces, PLACES } = await import('../src/game/places.js');
const { placementReason } = await import('../src/game/tow.js');
const { carById } = await import('../src/game/cars.js');
const world=buildWorld(new StubRenderer());resolvePlaces(world);

const { fraserParking } = await import('../src/game/homeparking.js');
const ranger=fraserParking(world,PLACES.home,carById('ranger'),0);
const saturn=fraserParking(world,PLACES.home,carById('saturn'),1);
assert.equal(placementReason(world,ranger,carById('ranger')),null);
assert.equal(placementReason(world,saturn,carById('saturn')),null);
assert.ok(Math.hypot(ranger.x-saturn.x,ranger.z-saturn.z)>5.5);
// Tom backs out of the driveway (6 Oct): the Ranger is parked nose-in, toward the
// house. Reversing to the street stays clear of the Saturn and every building.
// (A stray W may tap the Saturn: Tom, 6 Oct, a feature.)
{
  const { FRASER } = await import('../src/game/fraser.js');
  const R=carById('ranger'), S=carById('saturn');
  // Separating-axis test on two oriented rectangles.
  const corners=(c,sp)=>{const hw=sp.wid/2,hl=sp.len/2,s=Math.sin(c.yaw),k=Math.cos(c.yaw);
    return [[-hw,-hl],[hw,-hl],[hw,hl],[-hw,hl]].map(([a,b])=>[c.x+a*k+b*s,c.z-a*s+b*k]);};
  const overlap=(A,B)=>{
    for (const P of [A,B]) for (let i=0;i<4;i++){
      const [x1,z1]=P[i],[x2,z2]=P[(i+1)%4],nx=z2-z1,nz=x1-x2;
      const pa=A.map(([x,z])=>x*nx+z*nz), pb=B.map(([x,z])=>x*nx+z*nz);
      if (Math.max(...pa)<Math.min(...pb)||Math.max(...pb)<Math.min(...pa)) return false;
    }
    return true;
  };
  const fwd=[Math.sin(ranger.yaw),Math.cos(ranger.yaw)];
  const toHouse=[-Math.sin(FRASER.yaw),-Math.cos(FRASER.yaw)];
  assert.ok(fwd[0]*toHouse[0]+fwd[1]*toHouse[1]>0.99,'the Ranger is parked nose-in, forward points at the house');
  assert.ok(!overlap(corners(ranger,R),corners(saturn,S)),'Ranger and Saturn do not overlap at spawn');
  // Reverse toward the street (i metres backwards), checked while still on the lot.
  for (let i=0;i<=8;i++){
    const spot={...ranger,x:ranger.x-fwd[0]*i,z:ranger.z-fwd[1]*i};
    assert.ok(!overlap(corners(spot,R),corners(saturn,S)),`reversing ${i} m does not touch the Saturn`);
    assert.ok(!(placementReason(world,spot,R)||'').includes('building'),`reversing ${i} m does not touch a building`);
  }
  // A stray W may tap the Saturn (a joke, not a bug), so there is no clearance
  // assertion forward. The Saturn sits behind the truck, toward the house.
  const toSat=[saturn.x-ranger.x,saturn.z-ranger.z];
  assert.ok(toSat[0]*fwd[0]+toSat[1]*fwd[1]>3,'the Saturn is ahead of the nose, up the drive');
}
const bike=fraserParking(world,PLACES.home,carById('dbike') || {id:'dbike',wid:0.6,len:1.8},0);
assert.ok(!world.roadAt(bike.x,bike.z), "Bicycle is off the road");
const { fraserPoint } = await import('../src/game/fraser.js');
for(const x of [-11.2,-6.8,6.85,11.15,-12.5]) { const q=fraserPoint(x,17.1); assert.ok(!world.roadAt(...q), 'Aprons and hedge stop outside road'); }
console.log('299 Fraser: both car footprints and driveway exit clear in the real map.');
