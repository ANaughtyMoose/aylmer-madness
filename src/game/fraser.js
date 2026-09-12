// 299 is the left half of this duplex, viewed from the street. Authored from
// Thomas's circa-2009 photos, with his corrections for summer 2004.
import { rgb } from '../core/mesh.js';
export const FRASER = { x: 933, z: 149.8, yaw: -1.469401057314501,
  ids: [460808559, 460808159] };
export function fraserPoint(x, z) {
  const c=Math.cos(FRASER.yaw),s=Math.sin(FRASER.yaw);
  return [FRASER.x+x*c+z*s, FRASER.z-x*s+z*c];
}
export function fraserFootprint(b) {
  const unit=FRASER.ids.indexOf(b.id);
  if(unit<0)return b;
  const side=unit===0?-1:1;
  const p=[[0,-5.5],[7*side,-5.5],[7*side,-2.5],[11*side,-2.5],[11*side,5.5],[0,5.5]].map(q=>fraserPoint(...q));
  return {...b,p,c:fraserPoint(side*5,0),k:'fraser',hs:null,h:6.7};
}

export function buildFraser(mb) {
  const brick=rgb(0x854633),mortar=rgb(0x986753),trim=rgb(0xd5d2bd),roof=rgb(0x414446),glass=rgb(0x334c57),concrete=rgb(0x93948c);
  const box=(x,y,z,w,h,d,color)=>{const [px,pz]=fraserPoint(x,z);mb.box(px,y,pz,w,h,d,color,{yaw:FRASER.yaw});};
  const cap=(x,z,w,d,y,h)=>{const [px,pz]=fraserPoint(x,z);mb.roof(px,y,pz,w,d,h,roof,FRASER.yaw,0.25);};
  box(0,0.35,0,14,0.7,11,concrete);
  box(0,3.65,0,14,5.9,11,brick);cap(0,0,14,11,6.6,1.7);
  // Quiet masonry courses make the broad facade read as brick at driving scale.
  for(let y=0.85;y<6.6;y+=0.22)box(0,y,5.51,14,0.018,0.015,mortar);
  for(const x of [-9,9]){
    box(x,1.6,1.5,4,3.2,8,brick);cap(x,1.5,4,8,3.2,1.2);
    box(x,1.4,5.54,3.25,2.65,0.08,trim);
    for(let y=0.4;y<2.7;y+=0.42)box(x,y,5.60,3.18,0.025,0.025,concrete);
    box(x,3.22,5.6,4.45,0.16,0.18,trim);
  }
  const window=(x,y,w,h)=>{
    box(x,y,5.56,w+0.18,h+0.18,0.13,trim);
    box(x,y,5.65,w,h,0.04,glass);
    box(x,y,5.69,0.055,h,0.025,trim);
    box(x,y,5.70,w,0.04,0.025,trim);
  };
  for(const x of [-5.3,-1.8,1.8,5.3])window(x,5.05,1.05,1.6);
  window(-4.7,2.25,2.6,1.65);window(4.7,2.25,2.6,1.65);
  for(const x of [-1.25,1.25]){
    box(x,1.82,5.59,1.05,2.1,0.14,trim);
    box(x,2.18,5.69,0.48,0.95,0.035,glass);
    box(x+0.35,1.7,5.73,0.07,0.09,0.08,rgb(0xa7975d));
  }
  box(0,0.43,6.1,5.5,0.86,1.2,concrete);
  for(let i=0;i<3;i++)box(0,0.12*(3-i),6.95+i*0.38,5.5,0.24*(3-i),0.4,concrete);
  cap(0,6,5.9,2,3.3,0.4);
  for(const x of [-2.65,2.65])box(x,2,6.8,0.13,2.5,0.13,trim);
  box(0,6.6,5.58,14.5,0.18,0.16,trim);
  // Gravel belongs to 299. The other unit's apron stays visibly separate.
  box(-9,0.035,11.3,4.4,0.035,11.6,rgb(0x898578));
  box(9,0.035,11.3,4.3,0.035,11.6,rgb(0x777a77));
  let seed=37;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<210;i++)box(-11+random()*4,0.065,5.8+random()*10.7,0.07+random()*0.1,0.035,0.10,rgb(i%2?0xa39c8c:0x6d6b61));
  // A tall, irregular cedar hedge, no ornamental trees along the driveway.
  for(let i=0;i<8;i++){
    const h=(i>5?1.55:2.0)+random()*0.25;box(-12, h/2,6+i*1.1,1.0,h,1.25,rgb(i%2?0x40503a:0x47583e));
  }
  // Simple galvanized chain-link beside the garage. Thin crossed wires.
  for(let i=0;i<=8;i++)box(-11.5,0.8,-2+i,0.045,1.6,0.045,concrete);
  for(let i=0;i<8;i++)for(let j=0;j<4;j++){
    const a=fraserPoint(-11.49,-2+i),b=fraserPoint(-11.49,-1+i);
    const y=j*0.36+0.1;
    mb.quad([a[0],y,a[1]],[b[0],y+0.34,b[1]],[b[0],y+0.36,b[1]],[a[0],y+0.02,a[1]],concrete);
    mb.quad([a[0],y+0.34,a[1]],[b[0],y,b[1]],[b[0],y+0.02,b[1]],[a[0],y+0.36,a[1]],concrete);
  }
  // Lawn trees: red tree one quarter across from the left drive; younger fir.
  const [rx,rz]=fraserPoint(-4.3,12.6);mb.cyl(rx,1.15,rz,0.12,2.3,6,rgb(0x6d513f));
  for(let i=0;i<4;i++)mb.cone(rx,2.3+i*0.62,rz,1.45-i*0.23,1.9,7,rgb(i%2?0x713c40:0x87414a));
  const [fx,fz]=fraserPoint(-0.9,11.2);
  for(let i=0;i<4;i++)mb.cone(fx,1.1+i*0.75,fz,1.45-i*0.25,2.0,7,rgb(i%2?0x365239:0x405e3f));
  for(let i=0;i<18;i++)box(-6.5+random()*13,0.25,7.7+random()*1.6,0.45,0.45,0.4,rgb(i%3?0x556d3d:0xaa9859));
}
