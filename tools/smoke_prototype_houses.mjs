import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Materials,prototypeManifest} from '../src/game/materials.js';
import {MeshBuilder} from '../src/core/mesh.js';
import {buildPhotoGlenwood} from '../src/prototype/glenwood-houses.js';
const mats=new Materials(prototypeManifest(JSON.parse(readFileSync('assets/materials/atlas.real.json'))),null);
const max=[0,0,0];
for(const variant of ['glenwood_carport','glenwood_picture','glenwood_porch'])for(const W of [9,13.5,16])for(const lod of [0,1,2])for(const side of [-1,1])for(let seed=0;seed<8;seed++){
 const b=new MeshBuilder(),fw={cx:100,cz:200,nx:0,nz:1,tx:1,tz:0,len:W};
 const res=buildPhotoGlenwood(b,variant,{fw,D:9,side,seed,lod,mats,y0:40});b.finish();
 assert.ok(b.v.every(Number.isFinite));assert.ok(b.i.every(i=>i>=0&&i<b.v.length/9));
 assert.ok(res.ridgeHeight<4,'low ranch roof');assert.ok(!Number.isFinite(res.clearance)||res.clearance>=2.35);
 max[lod]=Math.max(max[lod],b.i.length/3);
 assert.ok(b.i.length/3<=[160,80,48][lod],`lod ${lod} budget ${b.i.length/3}`);
}
console.log('PASS Glenwood photo geometry, mirrored plans, finite buffers, carport clearance and LOD budgets:',max);
