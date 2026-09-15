import {MeshBuilder,rgb} from '../core/mesh.js';
import {m4,clamp} from '../core/math.js';

export const SPARE={x:0.24,y:0.765,z:-1.30,maxLift:0.075};
function torus(mb,cx,cy,cz,r,tube,n,m,color,vertical=false) {
  const point=(a,b)=>{
    const rr=r+Math.cos(b)*tube;
    return vertical ? [cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,cz+Math.sin(b)*tube]
      : [cx+Math.cos(a)*rr,cy+Math.sin(b)*tube,cz+Math.sin(a)*rr];
  };
  for(let i=0;i<n;i++)for(let j=0;j<m;j++) {
    const a=i*2*Math.PI/n,b=j*2*Math.PI/m,aa=(i+1)*2*Math.PI/n,bb=(j+1)*2*Math.PI/m;
    if(vertical)mb.quad(point(a,b),point(aa,b),point(aa,bb),point(a,bb),color);
    else mb.quad(point(a,b),point(a,bb),point(aa,bb),point(aa,b),color);
  }
}
export function buildSpare() {
  const mb=new MeshBuilder();
  torus(mb,0,0.095,0,0.255,0.085,24,8,rgb(0x30312e));
  mb.cyl(0,0.095,0,0.195,0.105,24,rgb(0x76503a),'y',true);
  mb.cyl(0,0.155,0,0.075,0.025,12,rgb(0x4c4540),'y',true);
  for(let i=0;i<5;i++) {
    const a=i*2*Math.PI/5,x=Math.cos(a)*0.13,z=Math.sin(a)*0.13;
    mb.cyl(x,0.15,z,0.026,0.008,8,rgb(0x292b2a),'y',true);
  }
  for(let i=0;i<7;i++) {
    const a=i*0.79;
    mb.box(Math.cos(a)*0.16,0.151,Math.sin(a)*0.16,0.038,0.004,0.022,rgb(i%2?0x9d683e:0x544438),{yaw:a});
  }
  return mb;
}
export function buildSpareAnchor() {
  const mb=new MeshBuilder();
  mb.box(0.65,0.79,-0.87,0.09,0.035,0.11,rgb(0x565b58));
  torus(mb,0.65,0.825,-0.87,0.028,0.009,10,5,rgb(0x8a8273),true);
  return mb;
}
export function buildChainLink() {
  const mb=new MeshBuilder(),color=rgb(0x8b8170);
  for(let k=0;k<12;k++) {
    const t=k/11,y=-0.055*4*t*(1-t),z=-0.3+0.6*t;
    const P=(a,b)=>{const x=Math.cos(a)*(0.013+0.005*Math.cos(b)),h=0.005*Math.sin(b),zz=z+Math.sin(a)*(0.030+0.005*Math.cos(b));return k%2?[h,y+x,zz]:[x,y+h,zz];};
    for(let i=0;i<10;i++)for(let j=0;j<4;j++) {
      const a=i*2*Math.PI/10,b=j*Math.PI/2,aa=(i+1)*2*Math.PI/10,bb=(j+1)*Math.PI/2;
      const p=[P(a,b),P(a,bb),P(aa,bb),P(aa,b)];
      if(k%2)p.reverse();mb.quad(...p,color);
    }
  }
  return mb;
}
export function stepSpare(v,dt) {
  const previous=v.spareLastVy ?? v.vy ?? 0;
  const impulse=Math.abs((v.vy || 0)-previous);
  v.spareLastVy=v.vy || 0;
  let y=v.spareLift || 0,vel=v.spareVelocity || 0;
  // Landing/curb impulses only; decorative cracks never trigger physics.
  if(Math.abs(v.vLong)>3 && impulse>0.65)vel+=Math.min(0.65,impulse*0.16);
  vel+=(-110*y-17*vel)*dt;y+=vel*dt;
  if(y<0){y=0;vel=Math.max(0,-vel*0.15);}
  if(y>SPARE.maxLift){y=SPARE.maxLift;vel=Math.min(0,vel);}
  v.spareLift=y;v.spareVelocity=vel;
}
const local=new Float32Array(16),matrix=new Float32Array(16);
export function drawSpare(r,meshes,parent,lift=0) {
  lift=clamp(lift,0,SPARE.maxLift);
  r.draw(meshes.anchor,parent);
  m4.compose(local,SPARE.x,SPARE.y+lift,SPARE.z,0,0,0);
  m4.mul(matrix,parent,local);r.draw(meshes.tire,matrix);
  // Each link follows a sagging span between a fixed bed anchor and the rim.
  // The sag shrinks as the secured tire lifts; neither end can detach.
  const start=[0.65,0.825,-0.87],end=[SPARE.x,SPARE.y+0.175+lift,SPARE.z];
  const yaw=Math.atan2(end[0]-start[0],end[2]-start[2]);
  const dx=end[0]-start[0],dy=end[1]-start[1],dz=end[2]-start[2];
  m4.compose(local,(start[0]+end[0])/2,(start[1]+end[1])/2,(start[2]+end[2])/2,
    yaw,-Math.atan2(dy,Math.hypot(dx,dz)),0,1,Math.max(0.3,1-lift*6),Math.hypot(dx,dy,dz)/0.6);
  m4.mul(matrix,parent,local);r.draw(meshes.link,matrix);
}
