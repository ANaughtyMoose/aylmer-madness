import assert from 'node:assert/strict';
import {updateRepairs,repairInvoice,REPAIR_SPOTS} from '../src/game/damage.js';
import {LIFE_MISSIONS} from '../src/game/lifejobs.js';
import {PLACES} from '../src/game/places.js';
const v={x:-514,z:-137,vLong:0,damage:50},state={},wallet={value:30,can(n){return this.value>=n},spend(n){if(!this.can(n))return false;this.value-=n;return true}};
const opts={places:PLACES,wallet,press:true};
assert.deepEqual(repairInvoice(50),{quote:10,extra:1,total:11});
assert.equal(REPAIR_SPOTS.filter(s=>!s.free).length,1);
assert.equal(updateRepairs(state,.1,v,opts).working,true);
opts.press=false;let r=updateRepairs(state,5,v,opts);assert.equal(r.done,true);assert.equal(wallet.value,19);assert.match(r.toast,/11/);
v.damage=0;assert.equal(updateRepairs(state,5,v,opts).done,false);assert.equal(wallet.value,19);
v.damage=50;opts.press=true;updateRepairs(state,.1,v,opts);wallet.value=3;opts.press=false;r=updateRepairs(state,5,v,opts);assert.equal(r.done,false);assert.equal(wallet.value,3);
wallet.value=30;opts.press=true;updateRepairs(state,.1,v,opts);v.x+=40;updateRepairs(state,2,v,opts);assert.equal(state.key,null);assert.equal(wallet.value,30);
v.x=-514;opts.press=true;updateRepairs(state,.1,v,opts);opts.press=false;const other={...v};r=updateRepairs(state,5,other,opts);assert.equal(r.done,false);assert.equal(wallet.value,30);
for(const id of ['margaretdental','solerrand']){const m=LIFE_MISSIONS.find(m=>m.id===id);assert.ok(m);const stages=m.build();assert.ok(stages.every(s=>PLACES[s.at]));assert.equal(stages[0].money,undefined);assert.ok(stages[1].money>0);}
console.log('PASS: quote/extra/final payment, insufficient funds, cancellation, vehicle swap, no repeat charge, dental and Sol stages');
