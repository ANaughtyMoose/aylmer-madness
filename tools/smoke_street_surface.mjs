import assert from 'node:assert/strict';
import {buildWorld} from '../src/game/world.js';
const samples=[[616.16,-369.41],[615,-380],[617,-360],[612,-400]],hits=samples.map(()=>[]);
const r={upload(b){for(let j=0;j<b.i.length;j+=3){const ids=b.i.slice(j,j+3),p=ids.map(k=>b.v.slice(k*9,k*9+3));
for(let k=0;k<samples.length;k++){const [x,z]=samples[k],a=p[0],u=p[1],v=p[2],den=(u[2]-v[2])*(a[0]-v[0])+(v[0]-u[0])*(a[2]-v[2]);if(Math.abs(den)<1e-7)continue;
const w0=((u[2]-v[2])*(x-v[0])+(v[0]-u[0])*(z-v[2]))/den,w1=((v[2]-a[2])*(x-v[0])+(a[0]-v[0])*(z-v[2]))/den,w2=1-w0-w1;
if(Math.min(w0,w1,w2)<-1e-5)continue;hits[k].push({h:a[1]*w0+u[1]*w1+v[1]*w2,c:b.v.slice(ids[0]*9+6,ids[0]*9+9)});}}
return {count:b.i.length,min:b.min,max:b.max};},texture(){return{};}};
const w=buildWorld(r,undefined,{inside:(x,z)=>x<2540&&z>-8500,signage:false,distant:false});
for(let i=0;i<samples.length;i++) {
 const green=hits[i].filter(v=>v.c[1]>v.c[0]*1.15&&v.c[1]>v.c[2]*1.15);
 const asphalt=hits[i].filter(v=>Math.abs(v.c[0]-v.c[1])<0.005&&v.c[2]>v.c[0]);
 assert.ok(green.length&&asphalt.length,'sample must contain both terrain and road');
 const road=Math.max(...asphalt.map(v=>v.h)),grass=Math.max(...green.map(v=>v.h));
 assert.ok(road>grass+0.025,`grass pierces road at ${samples[i]}: ${grass} >= ${road}`);
 assert.ok(Math.abs(road-w.groundAt(...samples[i]).h)<0.15,'road/physics disagreement');
}
assert.ok(w.cemeteryFences.length>100,'missing Saint-Paul perimeter');
for(const [x,z,xx,zz] of w.cemeteryFences)for(let t=0;t<=1;t+=0.1)
 assert.ok(w.streetClear(x+(xx-x)*t,z+(zz-z)*t),'fence intrudes road or sidewalk');
console.log('PASS uploaded crossing surfaces above grass, physics alignment, Saint-Paul fence clearance');
