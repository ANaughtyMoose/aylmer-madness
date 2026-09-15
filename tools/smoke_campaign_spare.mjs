import assert from 'node:assert/strict';
import {ALL_MISSIONS,nextMission,missionAvailable} from '../src/game/missions.js';
import {SPARE,stepSpare,buildSpare,buildChainLink,drawSpare} from '../src/game/spare.js';
import {m4} from '../src/core/math.js';
const G={done:new Set()};let count=0;
assert.equal(nextMission(G).id,'alternateur');
while(nextMission(G)) {
 const next=nextMission(G),fresh=ALL_MISSIONS.filter(d=>!G.done.has(d.id)&&missionAvailable(G,d));
 assert.deepEqual(fresh.map(d=>d.id),[next.id]);G.done.add(next.id);
 assert.ok(++count<=ALL_MISSIONS.length,'campaign loops');
}
assert.equal(count,ALL_MISSIONS.length);
const legacy={done:new Set(['poutine','gang'])};
assert.ok(!legacy.done.has(nextMission(legacy).id),'legacy completion is preserved and next unfinished beat is offered');
assert.ok(missionAvailable(legacy,ALL_MISSIONS.find(d=>d.id==='poutine')),'completed legacy job replayable');
const v={vy:0,vLong:15};for(let i=0;i<600;i++)stepSpare(v,1/60);assert.equal(v.spareLift,0,'no constant idle bounce');
v.vy=-4;stepSpare(v,1/60);assert.ok(v.spareLift>0,'meaningful impact moves tire');
for(let i=0;i<600;i++){v.vy=i<60?(i%2?12:-12):0;stepSpare(v,1/60);assert.ok(v.spareLift>=0&&v.spareLift<=SPARE.maxLift);}
assert.ok(v.spareLift<0.001,'spring settles');
for(const b of [buildSpare(),buildChainLink()]){assert.ok(b.v.every(Number.isFinite));assert.ok(b.i.every(i=>i>=0&&i<b.v.length/9));}
for(const lift of [0,SPARE.maxLift]) {
 const matrices=[];drawSpare({draw:(mesh,m)=>matrices.push(Array.from(m))},{anchor:0,tire:1,link:2},m4.identity(new Float32Array(16)),lift);
 assert.equal(matrices.length,3,'spare uses only three draw calls');
 const m=matrices[2],point=z=>[m[12]+m[8]*z,m[13]+m[9]*z,m[14]+m[10]*z];
 assert.ok(Math.hypot(...point(-0.3).map((v,i)=>v-[0.65,0.825,-0.87][i]))<1e-6,'chain stays at bed anchor');
 assert.ok(Math.hypot(...point(0.3).map((v,i)=>v-[SPARE.x,SPARE.y+0.175+lift,SPARE.z][i]))<1e-6,'chain follows rim');
}
console.log('PASS entire campaign order, legacy replay, spare impact and bounds');
