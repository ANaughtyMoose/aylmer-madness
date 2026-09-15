import assert from 'node:assert/strict';
import { Cinematic, missionClock } from '../src/game/cinematic.js';
import { placementReason, freeReset, callTow, roadSpot } from '../src/game/tow.js';
import { missionById } from '../src/game/missions.js';
import { stageSettle } from '../src/game/missionkit.js';

assert.equal(missionClock([{time:null}, {}]), null);
assert.deepEqual(missionClock([{time:null}, {time:40}], 1), [40]);
assert.deepEqual(missionClock([{time:40}], 1.5), [60]);
const world = {
  nearestRoad: (x,z) => ({x:0,z,yaw:0,name:'Test',dist:Math.abs(x)}),
  roadAt: x => Math.abs(x) < 4,
  buildingAt: (x,z) => x > 0.6 && z > 1 && z < 3,
  waterAt: () => false,
};
const spec = {wid:1.8,len:4.8};
assert.equal(world.buildingAt(0,0), false);
assert.equal(placementReason(world,{x:0,z:0,yaw:0},spec), 'building');
const recovered = roadSpot(world,0,0,spec);
assert.ok(recovered && Math.abs(recovered.z) >= 6);
assert.equal(placementReason(world,recovered,spec), null);
assert.equal(placementReason(world,{x:0,z:0,yaw:Math.PI/2},{wid:1,len:1}), null);
const blocked = {...world,buildingAt:()=>true};
let repairs=0,spent=0,resets=0;
const G={world:blocked,veh:{x:0,z:0,spec,damage:40,reset(){resets++;},repair(){repairs++;}},wallet:{can:()=>true,spend(){spent++;}}};
assert.equal(freeReset(G).ok,false);
assert.equal(callTow(G).ok,false);
assert.equal(spent+repairs+resets,0);

// The same finish path is used by mouse and keyboard; it consumes its callback.
const c=Object.create(Cinematic.prototype);
let finished=0,cleared=0;
c.active=true;c.onDone=()=>finished++;
c.clearInput=()=>cleared++;
assert.equal(c.finish(),true);
assert.equal(c.finish(),false);
assert.equal(finished,1);
assert.equal(cleared,1);
c.active=true;c.onDone=()=>finished++;c.hide();
assert.equal(c.finish(),false);
assert.equal(finished,1,'cancelled presentation must not run its follow-up');

// Real first-job settlement precedes presentation and cannot be repeated by it.
const def=missionById('alternateur');
const stages=def.build({carName:'Ranger'});
const mission={def,stages,idx:1};
let balance=80;
const state={wallet:{add(n){balance+=n;},spend(n){balance-=n;}},done:new Set()};
stageSettle(state,mission,stages[1]);
const earned=balance;
c.active=true;c.onDone=()=>{};c.finish();c.finish();
assert.equal(balance,earned);
assert.ok(earned>80);
console.log('Cinematic timing, single-use callbacks, settlement and footprint recovery: passed');
