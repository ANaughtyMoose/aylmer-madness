// 299 is the left half of this duplex, viewed from the street. Authored from
// Thomas's circa-2009 photos, with his corrections for summer 2004.
import { rgb } from '../core/mesh.js';
import { protoTree, protoShrub, protoHedge } from './vegetation.js';
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

export function buildFraser(mb, baseY = 0, groundY = () => baseY, opts = {}) {
  const nature = !!opts.nature;
  // opts.proto: the prototype renderer draws real brick courses on walls tagged
  // with the masonry code (src/prototype/facade.js), hips the roofs like the menu
  // art, and gets sills, fascia, downspouts and roof vents.
  const proto = !!opts.proto;
  const brick=rgb(0x854633),mortar=rgb(0x986753),trim=rgb(0xd5d2bd),roof=rgb(0x414446),glass=rgb(0x334c57),concrete=rgb(0x93948c);
  const box=(x,y,z,w,h,d,color)=>{const [px,pz]=fraserPoint(x,z);mb.box(px,y + (y < 0.15 ? groundY(px,pz) : baseY),pz,w,h,d,color,{yaw:FRASER.yaw});};
  const cap=(x,z,w,d,y,h)=>{const [px,pz]=fraserPoint(x,z);mb.roof(px,y+baseY,pz,w,d,h,roof,FRASER.yaw,0.25);};
  const hip=(x,z,w,d,y,h)=>{const [px,pz]=fraserPoint(x,z);if(proto)mb.hip(px,y+baseY,pz,w,d,h,roof,FRASER.yaw,0.4);else mb.roof(px,y+baseY,pz,w,d,h,roof,FRASER.yaw,0.25);};
  const brickBox=(x,y,z,w,h,d)=>{if(proto)mb.curRect=[0,0,-5000,0];box(x,y,z,w,h,d,brick);mb.curRect=null;};
  box(0,0.35,0,14,0.7,11,concrete);
  brickBox(0,3.65,0,14,5.9,11);hip(0,0,14,11,6.6,1.7);
  // Quiet masonry courses make the broad facade read as brick at driving scale
  // (the prototype shader draws the real courses instead).
  if(!proto)for(let y=0.85;y<6.6;y+=0.22)box(0,y,5.51,14,0.018,0.015,mortar);
  if(proto){
    box(0,6.5,0,14.8,0.2,11.8,trim);                       // fascia + soffit
    for(const x of [-6.93,6.93])box(x,3.35,5.6,0.09,6.3,0.09,trim);   // downspouts
    for(const x of [-5,-1.6,1.6,5])box(x,7.72,2.1,0.34,0.3,0.34,rgb(0x2a2b2c)); // roof vents
  }
  for(const x of [-9,9]){
    brickBox(x,1.6,1.5,4,3.2,8);hip(x,1.5,4,8,3.2,1.2);
    if(proto){
      box(x,3.1,1.5,4.8,0.2,8.8,trim);
      box(x+Math.sign(x)*1.93,1.6,5.6,0.08,3.0,0.08,trim);
      for(const dx of [-0.8,0,0.8])box(x+dx,1.42,5.605,0.025,2.5,0.02,concrete);
    }
    box(x,1.4,5.54,3.25,2.65,0.08,trim);
    for(let y=0.4;y<2.7;y+=0.42)box(x,y,5.60,3.18,0.025,0.025,concrete);
    box(x,3.22,5.6,4.45,0.16,0.18,trim);
  }
  const window=(x,y,w,h,bars=true)=>{
    box(x,y,5.56,w+0.18,h+0.18,0.13,trim);
    box(x,y,5.65,w,h,0.04,glass);
    if(bars){box(x,y,5.69,0.055,h,0.025,trim);box(x,y,5.70,w,0.04,0.025,trim);}
    if(proto)box(x,y-h/2-0.13,5.63,w+0.34,0.07,0.24,trim);   // sill
  };
  for(const x of [-5.3,-1.8,1.8,5.3])window(x,5.05,1.05,1.6);
  // Ground-floor windows are plain panes: no cross-members (Tom, 29 Sep).
  window(-4.7,2.25,2.6,1.65,false);window(4.7,2.25,2.6,1.65,false);
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
  // The camera keeps the rendered house and porch surfaces, before gravel and foliage.
  opts.cameraEnd?.(mb.i.length);
  // Gravel belongs to 299 (Tom: the drive is GRAVEL). A darker, warmer bed
  // than the concrete walk and twice the stones, so it cannot read as a slab.
  // The other unit's apron stays visibly separate.
  box(-9,0.035,11.3,4.4,0.035,11.6,rgb(0x726a5a));
  box(9,0.035,11.3,4.3,0.035,11.6,rgb(0x777a77));
  let seed=37;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<210;i++)box(-11+random()*4,0.065,5.8+random()*10.7,0.07+random()*0.1,0.035,0.10,rgb(i%2?0xa39c8c:0x6d6b61));
  // The second 210 stones on their own seed, so the hedge and shrubs below
  // keep exactly the heights and spots they had.
  {let s2=91;const r2=()=>{s2=(s2*1664525+1013904223)>>>0;return s2/4294967296;};
  for(let i=0;i<210;i++)box(-11+r2()*4,0.065,5.8+r2()*10.7,0.07+r2()*0.1,0.035,0.10,rgb([0x5e5b53,0x8e8676,0xa39c8c][i%3]));}
  // A tall, irregular cedar hedge, no ornamental trees along the driveway.
  for(let i=0;i<8;i++){
    const h=(i>5?1.55:2.0)+random()*0.25;
    if(nature){const [x0,z0]=fraserPoint(-12,6+i*1.1-0.62),[x1,z1]=fraserPoint(-12,6+i*1.1+0.62);protoHedge(mb,x0,z0,x1,z1,1.1,h,groundY);}
    else box(-12, h/2,6+i*1.1,1.0,h,1.25,rgb(i%2?0x40503a:0x47583e));
  }
  // Simple galvanized chain-link beside the garage. Thin crossed wires.
  for(let i=0;i<=8;i++)box(-11.5,0.8,-2+i,0.045,1.6,0.045,concrete);
  for(let i=0;i<8;i++)for(let j=0;j<4;j++){
    const a=fraserPoint(-11.49,-2+i),b=fraserPoint(-11.49,-1+i);
    const y=baseY+j*0.36+0.1;
    mb.quad([a[0],y,a[1]],[b[0],y+0.34,b[1]],[b[0],y+0.36,b[1]],[a[0],y+0.02,a[1]],concrete);
    mb.quad([a[0],y+0.34,a[1]],[b[0],y,b[1]],[b[0],y+0.02,b[1]],[a[0],y+0.36,a[1]],concrete);
  }
  // Lawn trees, as seen from the street: the spruce on the LEFT (Tom's
  // ruling), the red-leaved tree to its right. Same two spots as before, swapped.
  const [rx,rz]=fraserPoint(-0.9,11.2), ry=groundY(rx,rz);
  const [fx,fz]=fraserPoint(-4.3,12.6), fy=groundY(fx,fz);
  if(nature){
    // Lit prototype (vegetation.js): the same two trees as leaf-card models, a
    // small red-leaved maple and a young spruce, about as tall as before.
    protoTree(mb,rx,ry,rz,0.62,false,{species:'maple',leaf:0x7a3038});
    protoTree(mb,fx,fy,fz,0.5,true,{species:'spruce',leaf:0x3a5a3c});
  }else{
    mb.cyl(rx,ry+1.15,rz,0.12,2.3,6,rgb(0x6d513f));
    for(let i=0;i<4;i++)mb.cone(rx,ry+2.3+i*0.62,rz,1.45-i*0.23,1.9,7,rgb(i%2?0x713c40:0x87414a));
    for(let i=0;i<4;i++)mb.cone(fx,fy+1.1+i*0.75,fz,1.45-i*0.25,2.0,7,rgb(i%2?0x365239:0x405e3f));
  }
  for(let i=0;i<18;i++){
    const x=-6.5+random()*13,z=7.7+random()*1.6,c=i%3?0x556d3d:0xaa9859;
    if(nature&&i%3){const [px,pz]=fraserPoint(x,z);protoShrub(mb,px,groundY(px,pz),pz,0.5,false);}
    else box(x,0.25,z,0.45,0.45,0.4,rgb(c));
  }
}
