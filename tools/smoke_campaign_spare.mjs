import assert from 'node:assert/strict';
import {ALL_MISSIONS,RETIRED_MISSIONS,nextMission,missionAvailable,missionLockReason} from '../src/game/missions.js';
import {nextMain,FINALE,OPTIONAL,QUIET_UNTIL} from '../src/game/campaign.js';
import {SPARE,stepSpare,buildSpare,buildChainLink,drawSpare} from '../src/game/spare.js';
import {m4} from '../src/core/math.js';
// Restructure (29 Sept 2026): the old walk asserted exactly ONE job was ever
// available (a strict chain over every job). Now exactly the next main
// mission, the finale once every main is done, and the optional jobs whose
// main mission is done are available; nothing else.
const G={done:new Set()};let count=0;
assert.equal(nextMission(G).id,'alternateur');
const expected=()=>ALL_MISSIONS.map(d=>d.id).filter(id=>!G.done.has(id)&&(
 id===nextMain(G.done)||(id===FINALE&&nextMain(G.done)===null)||(id in OPTIONAL&&G.done.has(OPTIONAL[id])&&G.done.has(QUIET_UNTIL)))).sort();
// W8-FIRST15: in index.html no optional job opens before Sayyad is awake (one « next » in the first driveway).
while(nextMission(G)) {
 const next=nextMission(G),fresh=ALL_MISSIONS.filter(d=>!G.done.has(d.id)&&missionAvailable(G,d));
 assert.deepEqual(fresh.map(d=>d.id).sort(),expected(),'available set after '+[...G.done].join(','));
 const nm=nextMain(G.done);
 assert.equal(next.id,nm||(G.done.has(FINALE)?next.id:FINALE),'the next main (then the finale) is always offered first');
 G.done.add(next.id);
 assert.ok(++count<=ALL_MISSIONS.length,'campaign loops');
}
// Every job is walked, « La nuit du Tim » (main mission 8) included.
assert.equal(count,ALL_MISSIONS.length);
assert.ok(ALL_MISSIONS.some(d=>d.id==='nuittim'),'nuittim is in the campaign');
const legacy={done:new Set(['poutine','gang'])};
assert.equal(nextMission(legacy).id,'alternateur','a legacy save still starts the story at the alternator');
assert.ok(!ALL_MISSIONS.some(d=>d.id==='poutine'),'poutine is retired');
assert.equal(missionLockReason(legacy,RETIRED_MISSIONS.find(d=>d.id==='poutine')),'Pas dans cet été-là','a retired job is never offered, even if done');
assert.ok(missionAvailable(legacy,ALL_MISSIONS.find(d=>d.id==='gang')),'completed live job replayable');
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
