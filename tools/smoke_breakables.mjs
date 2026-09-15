import assert from 'node:assert/strict';
import { Vehicle, CARS, DAMAGE } from '../src/game/cars.js';
import { normalizeSettings, saveSettings, loadSettings } from '../src/game/store.js';
import { launchFragment, stepFragment, fragmentMatrix } from '../src/game/breakables.js';
import { Input } from '../src/core/input.js';

const car = new Vehicle(CARS.find(c => c.id === 'ranger'));
let snaps = 0;
function strike(speed = 30, dt = 1/60, lateral = 0) {
  car.reset(0,0,0); car.vz = speed; car.vLong = speed;
  const p = { x:lateral, z:2.3-speed*dt/2, dead:false };
  const world = { queryPoles:()=>[p], snapPole(p) { p.dead=true;snaps++; } };
  car.collidePoles(world,dt);
  return p;
}
for (let i=0;i<6;i++) assert.equal(strike().dead,true);
assert.ok(car.damage > 85 && car.damage < DAMAGE.DEAD, `six hits: ${car.damage}`);
strike(); assert.equal(car.damage,DAMAGE.DEAD);
car.repair();car.damageSensitivity=0;
assert.equal(strike().dead,true);assert.equal(car.damage,0);
car.damageSensitivity=2;strike();assert.ok(car.damage>29 && car.damage<30);
car.repair();car.damageSensitivity=1;
assert.equal(strike(70,.1).dead,true,'fast swept hit');
car.repair();assert.equal(strike(2).dead,false,'gentle contact holds');
assert.equal(strike(30,1/60,4).dead,false,'near miss');
assert.equal(normalizeSettings({damageSensitivity:99}).damageSensitivity,2);
assert.equal(normalizeSettings({damageSensitivity:NaN}).damageSensitivity,1);
const storage = new Map();
globalThis.localStorage={setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)??null,removeItem:k=>storage.delete(k)};
saveSettings({damageSensitivity:.4});assert.equal(loadSettings().damageSensitivity,.4);
const handlers={};
globalThis.window={addEventListener:(name,fn)=>handlers[name]=fn};
const input=new Input();let prevented=false;
handlers.keydown({code:'ArrowLeft',target:{tagName:'INPUT',type:'range'},preventDefault(){prevented=true;}});
assert.equal(prevented,false,'native slider keys remain available');
assert.equal(input.down('ArrowLeft'),false,'slider adjustment does not steer');
handlers.keydown({code:'ArrowLeft',target:{tagName:'CANVAS'},preventDefault(){prevented=true;}});
assert.equal(prevented,true);assert.equal(input.down('ArrowLeft'),true);
for (const [ux,uz] of [[1,0],[0,1],[-Math.SQRT1_2,Math.SQRT1_2]]) {
  const f=launchFragment({x:0,y:31,z:0,h:8,kind:'tree'},ux,uz,30);
  stepFragment(f,.2,()=>31);
  assert.ok(f.y>31 && Math.hypot(f.x,f.z)>1,'flies above elevated ground');
  for(let i=0;i<600;i++)stepFragment(f,1/60,()=>31);
  assert.ok(f.settled && f.y>=31,'settles on terrain');
  const m=fragmentMatrix(new Float32Array(16),f);
  assert.ok(Math.abs(m[5])<1e-6,'lies flat in diagonal impacts too');
  assert.ok(Math.abs(m[4]-ux)<1e-6 && Math.abs(m[6]-uz)<1e-6);
}
const tree=launchFragment({x:0,y:20,z:0,h:10,kind:'tree'},0,1,30);
tree.min=[-3,0,-3];tree.max=[3,10,3];
for(let i=0;i<600;i++)stepFragment(tree,1/60,()=>20);
assert.ok(tree.y>=23,'fallen canopy stays above ground');
console.log('Breakable impacts, six-hit balance, damage controls, terrain flight and settling passed');
