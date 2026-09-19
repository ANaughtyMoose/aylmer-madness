// Low ranch houses authored from Thomas's four Glenwood reference views.
// The photos guide geometry/materials; no screenshot pixels are shipped.
import {rgb} from '../core/mesh.js';
export function buildPhotoGlenwood(mb,variant,ctx){
 const {fw,D,mats,seed,lod}=ctx,y0=ctx.y0||0,W=fw.len,s=ctx.side;
 const detail=lod===0,mid=lod<=1;
 const P=(x,y,z)=>[fw.cx+fw.tx*x+fw.nx*z,y0+y,fw.cz+fw.tz*x+fw.nz*z];
 const N=(x,y,z)=>[fw.tx*x+fw.nx*z,y,fw.tz*x+fw.nz*z];
 const quad=(pts,n,c)=>{
  const p=pts.map(v=>P(...v)),normal=N(...n),a=p[0],b=p[1],d=p[3];
  const u=b.map((v,i)=>v-a[i]),v=d.map((v,i)=>v-a[i]);
  const dot=(u[1]*v[2]-u[2]*v[1])*normal[0]+(u[2]*v[0]-u[0]*v[2])*normal[1]+(u[0]*v[1]-u[1]*v[0])*normal[2];
  const i=mb.v.length/9;for(const q of p)mb.vert(...q,...normal,c);
  if(dot>=0){mb.tri(i,i+1,i+2);mb.tri(i,i+2,i+3);}else{mb.tri(i,i+2,i+1);mb.tri(i,i+3,i+2);}
 };
 const tri=(pts,n,c)=>{const p=pts.map(v=>P(...v)),normal=N(...n),a=p[0],b=p[1],d=p[2],u=b.map((v,i)=>v-a[i]),v=d.map((v,i)=>v-a[i]);const dot=(u[1]*v[2]-u[2]*v[1])*normal[0]+(u[2]*v[0]-u[0]*v[2])*normal[1]+(u[0]*v[1]-u[1]*v[0])*normal[2];const i=mb.v.length/9;for(const q of p)mb.vert(...q,...normal,c);if(dot>=0)mb.tri(i,i+1,i+2);else mb.tri(i,i+2,i+1);};
 const off=()=>mats.end(mb),arm=name=>mats.tile(mb,name,{ox:fw.cx,oy:y0,oz:fw.cz});
 const paint=rgb([0xb3b5ae,0xc5bfa7,0x7a919b,0xc1c5be][seed%4]);
 const trim=rgb(0xdfdfd5),shadow=rgb(0x424a49),glass=rgb(0x334b50),concrete=rgb(0xaaa99e);
 const F=.24,E=2.78,ov=.68,rise=variant==='glenwood_picture'?.72:.40;
 const hasCarport=W>=10.5,garage=hasCarport&&((seed>>>2)&1)===1;
 const cw=hasCarport?Math.min(3.35,W*.25):0;
 const outer=s*W/2,near=outer-s*cw,far=-outer;
 const left=Math.min(near,far),right=Math.max(near,far),bw=right-left;
 const bx=f=>near-s*f*bw;
 const rect=(a,b,y,h,z,c)=>quad([[a,y,z],[b,y,z],[b,y+h,z],[a,y+h,z]],[0,0,1],c);
 const side=(x,n,z0,z1,c)=>quad([[x,0,z0],[x,0,z1],[x,E,z1],[x,E,z0]],[n,0,0],c);
 const box=(x,y,z,w,d,h,c)=>{const p=P(x,y,z);off();mb.tower(p[0],p[1],p[2],w,d,h,c,{yaw:-Math.atan2(fw.tz,fw.tx),noBottom:true});};
 arm('vinyl_grey');rect(left,right,0,E,0,mats.tint('vinyl_grey',.98));side(left,-1,0,-D,mats.tint('vinyl_grey'));side(right,1,-D,0,mats.tint('vinyl_grey'));
 quad([[left,0,-D],[right,0,-D],[right,E,-D],[left,E,-D]],[0,0,-1],mats.tint('vinyl_grey'));
 off();rect(left,right,0,F,.01,concrete);
 // A broad street-parallel ridge for the low ranch; one front-gable variation.
 const xl=-W/2-ov,xr=W/2+ov,zf=ov,zb=-D-ov;
 const frontGable=variant==='glenwood_picture';
 const peak=frontGable?0:-D*.52;
 const height=(x,z)=>E+rise*(1-(frontGable?Math.abs(x)/(W/2+ov):Math.abs(z-peak)/(D*.52+ov)));
 const roof=[];
 if(frontGable){roof.push([[xl,E,zf],[0,E+rise,zf],[0,E+rise,zb],[xl,E,zb]]);roof.push([[0,E+rise,zf],[xr,E,zf],[xr,E,zb],[0,E+rise,zb]]);}
 else{roof.push([[xl,E,zf],[xr,E,zf],[xr,E+rise,peak],[xl,E+rise,peak]]);roof.push([[xl,E+rise,peak],[xr,E+rise,peak],[xr,E,zb],[xl,E,zb]]);}
 for(const pts of roof){
  const a=pts[0],b=pts[1],d=pts[3],u=b.map((x,i)=>x-a[i]),v=d.map((x,i)=>x-a[i]);let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(n[1]<0)n=n.map(x=>-x);const len=Math.hypot(...n);n=n.map(x=>x/len);
  arm('shingle_grey');quad(pts.map(p=>[p[0],p[1]+.16,p[2]]),n,mats.tint('shingle_grey',.94));off();quad(pts,n.map(x=>-x),rgb(0x8a8d86));
 }
 if(frontGable){for(const [z,n] of [[0,[0,0,1]],[-D,[0,0,-1]]]){tri([[left,E,z],[right,E,z],[0,E+rise,z]],n,paint);}}
 else{for(const [x,n] of [[left,[-1,0,0]],[right,[1,0,0]]])tri([[x,E,0],[x,E,-D],[x,E+rise,peak]],n,paint);}
 const edge=(a,b,n)=>quad([a,b,[b[0],b[1]+.16,b[2]],[a[0],a[1]+.16,a[2]]],n,trim);
 if(frontGable){for(const [z,n] of [[zf,[0,0,1]],[zb,[0,0,-1]]]){edge([xl,E,z],[0,E+rise,z],n);edge([0,E+rise,z],[xr,E,z],n);}edge([xl,E,zb],[xl,E,zf],[-1,0,0]);edge([xr,E,zf],[xr,E,zb],[1,0,0]);}
 else{edge([xl,E,zf],[xr,E,zf],[0,0,1]);edge([xr,E,zb],[xl,E,zb],[0,0,-1]);for(const [x,n] of [[xl,[-1,0,0]],[xr,[1,0,0]]]){edge([x,E,zf],[x,E+rise,peak],n);edge([x,E+rise,peak],[x,E,zb],n);}}
 if(!mid)return {height:E,ridgeHeight:E+rise+.16,clearance:hasCarport?E:Infinity,garage:garage?'attached':hasCarport?'carport':'none',porch:false};
 // Limestone around grouped windows, with a contrasting painted entry bay.
 const door=bx(.55),doorW=.92;
 arm('stone_grey');rect(left,right,F,E-F-.12,.025,mats.tint('stone_grey',.94));off();rect(door-.80,door+.80,F,E-F,.045,paint);
 // Window recesses, white casings, dark glass, slim mullions and a projecting sill.
 const window=(x,w,h,cy)=>{
  const a=x-w/2,b=x+w/2,y=cy-h/2,z=.068;
  rect(a-.065,b+.065,y-.065,h+.13,z,trim);rect(a,b,y,h,z+.007,glass);
  if(detail){
   const inset=.055;rect(a+.07,a+w*.24,y+.055,h-.11,z+.014,rgb(0x69726b));rect(b-w*.24,b-.07,y+.055,h-.11,z+.014,rgb(0x737a70));
   for(const f of [.26,.74])rect(a+w*f-.018,a+w*f+.018,y,h,z+.020,trim);
   quad([[a-.07,y-.07,z-.01],[b+.07,y-.07,z-.01],[b+.07,y-.07,z+.13],[a-.07,y-.07,z+.13]],[0,1,0],trim);
   // Reveals ground the opening without a large painted diagonal highlight.
   quad([[a,y,z+.035],[a,y+h,z+.035],[a+.04,y+h,z],[a+.04,y,z]],[-1,0,0],shadow);
  }
 };
 window(bx(.23),Math.min(3.0,bw*.32),1.48,1.63);
 window(bx(.82),Math.min(2.55,bw*.27),1.18,1.76);
 rect(door-doorW/2-.045,door+doorW/2+.045,F,2.1,.071,trim);rect(door-doorW/2,door+doorW/2,F+.04,2.02,.078,paint);
 if(detail){rect(door-.22,door+.22,1.22,.67,.085,glass);rect(door+.29,door+.32,1.14,.12,.09,rgb(0xbfb496));box(door,0,.36,1.55,.72,F,concrete);}
 if(hasCarport){const center=outer-s*cw/2;
  if(garage){
   rect(Math.min(outer,near),Math.max(outer,near),0,E,.025,paint);
   rect(center-cw*.41,center+cw*.41,.06,2.2,.045,trim);
   if(detail)for(let j=1;j<6;j++)rect(center-cw*.40,center+cw*.40,.06+j*.36,.014,.049,shadow);
  }else{
   for(const z of [-.25,-D+.25])box(outer-s*.16,0,z,.12,.12,E,trim);
   if(detail)rect(Math.min(outer,near)+.16,Math.max(outer,near)-.16,.45,1.75,-D+.2,paint);
  }
  const p=P(center,.025,(5-D)/2);off();mb.flatRot(p[0],p[2],cw-.05,D+5,p[1],-Math.atan2(fw.tz,fw.tx),rgb(0x555858));
 }
 if(detail){
  box(bx(.45),E,-D*.55,.45,.55,.88,rgb(0x92938a));
  // An occasional shallow striped awning; reference 1, restrained geometry.
  if((seed&3)===0){const x=bx(.82),w=Math.min(2.7,bw*.30);
   for(let i=0;i<8;i++){const a=x-w/2+w*i/8,b=a+w/8;quad([[a,2.43,.10],[b,2.43,.10],[b,2.24,.60],[a,2.24,.60]],[0,.94,.34],i%2?rgb(0x6b8c83):trim);}
  }
 }
 off();return {height:E,ridgeHeight:E+rise+.16,clearance:hasCarport?E:Infinity,garage:garage?'attached':hasCarport?'carport':'none',porch:false};
}
