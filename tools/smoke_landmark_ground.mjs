#!/usr/bin/env node
import assert from 'node:assert/strict';
import {SITES,BUDGET,bakeSite,installLandmarks} from '../src/game/landmarks.js';
import STUB from '../src/game/materials_stub.js';
import {STRIDE} from '../src/core/mesh.js';
const realWorldModule=process.argv.includes('--real') ? await import('../src/game/world.js') : null;
const h=(x,z)=>18 + .025*(x+157)+.08*(z+290)+.0001*(z+290)**2;
const world={baseAt:(x,z)=>({h:h(x,z)}),groundAt:(x,z)=>({h:h(x,z)}),querySegments:()=>[],draw(){}};
const points=m=>Array.from({length:m.v.length/STRIDE},(_,i)=>m.v.slice(i*STRIDE,i*STRIDE+3));
const close=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-5,`${msg}: ${a} vs ${b}`);
const mall=SITES.find(s=>s.key==='galeries'), y0=h(mall.cx,mall.cz);
const flat=bakeSite(mall,STUB), b=bakeSite(mall,STUB,y0,world);
for(const lod of ['near','far']) {
 const roof=points(b[lod]).filter(p=>p[0]>=-195&&p[0]<=-119&&p[2]>=-327&&p[2]<=-253&&Math.abs(p[1]-h(-157,-253)-7.2)<1e-5);
 assert.ok(roof.length>=4,'wing level roof has actual samples');
 const skirt=points(b[lod]).filter(p=>p[0]>=-195&&p[0]<=-119&&p[2]>=-327&&p[2]<=-253&&p[1]<h(p[0],p[2])-.2);
 assert.ok(skirt.length>=40,'foundation reaches below perimeter terrain');
 const doors=points(b[lod]).filter(p=>Math.abs(p[0]+158.85)<.01&&Math.abs(p[2]+252.59)<.15);
 assert.ok(doors.length,'entrance samples exist');
 close(Math.min(...doors.map(p=>p[1])),h(-157,-253),'front door footing');
}
function pavementAt(mesh,x,z,field) {
 const hits=[];
 for(let i=0;i<mesh.i.length;i+=3) {
  const [a,b,c]=mesh.i.slice(i,i+3).map(k=>mesh.v.slice(k*STRIDE,k*STRIDE+3));
  if(![a,b,c].every(p=>Math.abs(p[1]-field(p[0],p[2])-.032)<1e-5))continue;
  const det=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(det)<1e-9)continue;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/det;
  const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/det;
  if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)hits.push(u*a[1]+v*b[1]+(1-u-v)*c[1]);
 }
 assert.ok(hits.length,'approach lies on actual pavement triangles');
 const error=Math.max(...hits.map(y=>Math.abs(y-field(x,z)-.032)));
 assert.ok(error<=.025,`approach interpolation ${error}`);return error;
}
pavementAt(b.site,-157,-236,h);
for(const s of SITES) {
 const terrain=bakeSite(s,STUB,h(s.cx,s.cz),world);
 for(const name of ['near','far','site']) {
  const m=terrain[name]; assert.ok(m.i.length/3<=BUDGET[s.key][name],`${s.key} runtime ${name} budget`);
  for(const value of m.v) assert.ok(Number.isFinite(value));
  if(!m.v.length)continue;
  for(const p of points(m))for(let k=0;k<3;k++)assert.ok(p[k]>=m.min[k]-1e-5&&p[k]<=m.max[k]+1e-5,'actual bounds contain geometry');
 }
}
// Independent synthetic parcel: validates all pavement vertices and diagonals,
// without assuming a nonempty mesh has valid bounds.
const probe={key:'probe',cx:-157,cz:-290,build(){},site(K){K.mb.flatRot(-157,-236,40,24,.032,0,[.2,.2,.2]);K.mb.box(-182,.5,-221,1,1,1,[1,0,0]);}};
const q=bakeSite(probe,STUB,h(-157,-290),world).site;
let paving=0;
for(let i=0;i<q.v.length;i+=STRIDE) if(q.v[i+6]===.2){paving++;close(q.v[i+1],h(q.v[i],q.v[i+2])+.032,'draped paving');}
assert.ok(paving>=4);
function surfaceError(mesh,field) {
 let worst=0,samples=0;
 for(let i=0;i<mesh.i.length;i+=3) {
  const t=mesh.i.slice(i,i+3).map(k=>mesh.v.slice(k*STRIDE,k*STRIDE+3));
  const offsets=t.map(p=>p[1]-field(...[p[0],p[2]]));
  if(!offsets.every(y=>y>=.0309&&y<=.0391))continue;
  const n=Math.max(2,Math.ceil(Math.max(...t.map((p,k)=>Math.hypot(p[0]-t[(k+1)%3][0],p[2]-t[(k+1)%3][2])))/2));
  for(let u=0;u<=n;u++)for(let v=0;v<=n-u;v++){
   const w=[u/n,v/n,1-(u+v)/n], p=[0,1,2].map(axis=>t.reduce((sum,q,k)=>sum+q[axis]*w[k],0));
   const offset=offsets.reduce((sum,y,k)=>sum+y*w[k],0);
   worst=Math.max(worst,Math.abs(p[1]-field(p[0],p[2])-offset));samples++;
  }
 }
 assert.ok(samples,'actual surface samples');return {worst,samples};
}
const measured=surfaceError(q,h);assert.ok(measured.worst<=.026,JSON.stringify(measured));
console.log(`independent paving interpolation error: ${measured.worst.toFixed(6)} m`);
const fixture=points(q).filter((_,i)=>q.v[i*STRIDE+6]===1);
assert.ok(fixture.length);close(Math.min(...fixture.map(p=>p[1])),h(-182,-221),'fixture base');
// Fake canvas/renderer exposes textured board vertices without GL or DOM.
globalThis.document={createElement:()=>({getContext:()=>new Proxy({}, {get:(o,k)=>o[k]??(()=>{})})})};
const uploads=[];const renderer={upload:m=>{m.finish();uploads.push(m);return {...m,count:m.i.length};},texture:()=>({})};
const stats=installLandmarks(world,renderer,STUB);
const sign=world.landmarks.signs.mesh;let index=0;
for(const s of SITES)for(const g of [s.sign,...(s.signs||[])].filter(Boolean)){
 const own=g.mount==='wall'||(g.y>3&&!(s.key==='galeries'&&g.z>-200));
 const expected=s.key==='galeries'&&g.x>=-195&&g.x<=-119&&g.z<-245?h(-157,-253):own?h(s.cx,s.cz):h(g.x,g.z);
 close(sign.v[index*STRIDE+1],g.y+expected,`${s.key} sign texture`);
 const frame=bakeSite(s,STUB,h(s.cx,s.cz),world).site;
 const candidates=points(frame).filter(p=>Math.hypot(p[0]-g.x,p[2]-g.z)<g.w/2+1&&Math.abs(p[1]-(g.y+expected-.06))<1e-5);
 // Plinth signs have a .15 m border; wall signs have a .06 m border.
 const plinth=points(frame).filter(p=>Math.hypot(p[0]-g.x,p[2]-g.z)<g.w/2+1&&Math.abs(p[1]-(g.y+expected-.15))<1e-5);
 assert.ok(candidates.length||plinth.length,`${s.key} actual frame aligned`);index+=8;
}
for(const s of SITES){const a=bakeSite(s,STUB),c=bakeSite(s,STUB,12);for(const name of ['near','far','site']){assert.equal(a[name].v.length,c[name].v.length);if(!a[name].v.length)continue;close(c[name].min[1]-a[name].min[1],12,'preview bounds');}}
console.log(`ground regression passed; runtime near=${stats.near}, far=${stats.far}, site=${stats.site}, total=${stats.tris}`);

if(process.argv.includes('--real')) {
 delete globalThis.document;
 const {buildWorld}=realWorldModule;
 const real=buildWorld({upload:m=>({min:m.min,max:m.max,count:m.i.length}),env:{sky:[.4,.6,.9],fog:[.7,.8,.9],sun:[1,1,1]}});
 let total=0;
 for(const s of SITES) {
  const field=(x,z)=>(s.ground?real.groundAt(x,z):real.baseAt(x,z)).h;
  const b=bakeSite(s,STUB,field(s.cx,s.cz),real);total+=b.site.i.length/3;
  assert.ok(b.site.i.length/3<=BUDGET[s.key].site,`${s.key} real paving budget ${b.site.i.length/3}`);
  if(['pwhs','heritage','galeries'].includes(s.key)) {
   const error=surfaceError(b.site,field);assert.ok(error.worst<=.026,`${s.key} interpolation ${error.worst}`);
   console.log(`${s.key}: ${b.site.i.length/3}/${BUDGET[s.key].site} paving tris; sampled error ${error.worst.toFixed(6)} m (${error.samples} samples)`);
  }
  if(s.key==='galeries') {
   for(const lod of ['near','far']) {
    const doors=points(b[lod]).filter(p=>Math.abs(p[0]+158.85)<.01&&Math.abs(p[2]+252.59)<.15);
    assert.ok(doors.length);close(Math.min(...doors.map(p=>p[1])),field(-157,-253),'real doorway floor');
    const skirt=points(b[lod]).filter(p=>p[0]>=-195&&p[0]<=-119&&p[2]>=-327&&p[2]<=-253&&p[1]<field(p[0],p[2])-.2);
    assert.ok(skirt.length>=40,'real foundation skirt samples');
   }
   close(real.groundAt(-157,-236).h,real.baseAt(-157,-236).h,'approach agrees with road terrain field');
   console.log(`customer approach error=${pavementAt(b.site,-157,-236,field).toFixed(6)} m`);
   console.log(`west wing doorway floor=${field(-157,-253).toFixed(6)} m; near/far skirt verified`);
  }
 }
 console.log(`real runtime paving total=${total}`);
}
