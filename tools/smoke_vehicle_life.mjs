import assert from 'node:assert/strict';
import {CARS,buildCarBody,buildWheel} from '../src/game/cars.js';
import '../src/game/vehicles.js';
import '../src/game/famouscars.js';
import {CRUISER,installCopMeshes} from '../src/game/cops.js';
import {remainingRoute} from '../src/game/routeprogress.js';
import {MealShift} from '../src/game/mealshift.js';
import {LIFE_MISSIONS} from '../src/game/lifejobs.js';
import {stageEnter,stageStep,stageExit,missionCleanup} from '../src/game/missionkit.js';
import {Traffic} from '../src/game/traffic.js';
const hashes=new Set();
for(const s of CARS){const b=(s.buildBody||buildCarBody)(s);assert(b.v.every(Number.isFinite),s.id);assert(b.i.length>100,s.id);const sig=JSON.stringify(b.v);assert(!hashes.has(sig),`duplicate ${s.id}`);hashes.add(sig);assert((s.buildWheel||buildWheel)(s).i.length>0);}
assert(!CARS.some(s=>s.id===CRUISER.id),'police ID must not overwrite any selectable vehicle');
const traffic=new Traffic(20,3),cycle=traffic.cars.find(c=>c.kind==='bike');
const edge=traffic.edges[cycle.edge],end=traffic.nodes[edge.b];
cycle.next=traffic.nextEdge(cycle);const next=cycle.next;
cycle.x=end.x+edge.dx*5-edge.dz*(edge.off+cycle.lane+5);
cycle.z=end.z+edge.dz*5+edge.dx*(edge.off+cycle.lane+5);
const player={x:cycle.x+50,z:cycle.z+50,spec:{wid:1.8},nudge(){}};
traffic.update(.01,player);assert.equal(cycle.edge,next,'a cyclist past the endpoint advances instead of circling');
const bike=CARS.find(s=>s.id==='cruiser');const meshes={cars:{cruiser:bike},wheels:{}};installCopMeshes({upload:b=>b},meshes);assert.equal(meshes.cars.cruiser,bike);assert(meshes.cars.police_cruiser);
let route=[[0,0],[10,0],[10,10],[20,10]];route=remainingRoute(route,10,5);assert.deepEqual(route,[[10,5],[10,10],[20,10]]);route=remainingRoute(route,15,10);assert.deepEqual(route,[[15,10],[20,10]]);assert.deepEqual(remainingRoute(route,-100,100),route);
assert.deepEqual(remainingRoute([[0,0],[10,0],[0,0]],5,0),[[5,0],[10,0],[0,0]],'do not jump to overlapping return leg');
const shift=new MealShift();shift.x=450;shift.y=440;shift.step(1,{y:-1});assert.equal(shift.y,280);
shift.x=shift.chairs[0].x;shift.y=shift.chairs[0].y;shift.step(0);assert(shift.cool>0,'wheelchairs obstruct the corridor');
for(let i=0;i<3;i++){shift.x=shift.beds[i].x;shift.y=shift.beds[i].y;for(let n=0;n<3;n++){shift.cool=0;shift.time=(Math.PI/2-i*1.7+Math.PI*4)/1.6;shift.step(0,{feed:true});}}
assert(shift.done,'nine correctly timed spoonfuls finish the shift');
const G={veh:{speedKmh:0},hud:{prompt(){}},wantStart:false},def=LIFE_MISSIONS.find(m=>m.id==='stvincent'),st=def.build()[1],m={def,stages:[st],idx:0,target:null};stageEnter(G,m,st);assert.equal(stageStep(G,m,st,.1),null);G.mealShift.state.served=[3,3,3];assert.equal(stageStep(G,m,st,.1),'done');stageExit(G,m,st);assert.equal(G.mealShift,null);stageEnter(G,m,st);missionCleanup(G,m,true);assert.equal(G.mealShift,null);
console.log(`PASS ${CARS.length} unique model bodies, police isolation, remaining GPS, meal controls/completion/cleanup`);
