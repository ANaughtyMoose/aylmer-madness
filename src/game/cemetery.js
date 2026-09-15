import {rgb} from '../core/mesh.js';

// OSM cemetery outlines can coincide with road centrelines. Offset a complete
// straight run, rather than independently nudging posts into a crooked fence.
export function buildCemeteryFences(areas,{clear,baseAt,bAt,addSegment,inside}) {
  const result=[],color=rgb(0x495550);
  for(const area of areas.filter(a=>a.k==='cemetery')) {
    const p=area.p;
    let cx=0,cz=0;for(const v of p){cx+=v[0];cz+=v[1];}cx/=p.length;cz/=p.length;
    if(inside && !inside(cx,cz))continue;
    for(let e=0;e<p.length;e++) {
      const a=p[e],b=p[(e+1)%p.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(L<2)continue;
      const dx=(b[0]-a[0])/L,dz=(b[1]-a[1])/L;
      let nx=-dz,nz=dx;
      if(nx*(cx-(a[0]+b[0])/2)+nz*(cz-(a[1]+b[1])/2)<0){nx=-nx;nz=-nz;}
      const n=Math.ceil(L/2);
      let inset=0.8;
      for(;inset<18;inset+=0.4) {
        let free=true;
        for(let k=0;k<=n;k++)if(!clear(a[0]+dx*L*k/n+nx*inset,a[1]+dz*L*k/n+nz*inset)){free=false;break;}
        if(free)break;
      }
      if(inset>=18)continue;
      for(let k=0;k<n;k++) {
        if(L>35 && Math.abs((k+0.5)/n-0.5)*L<3)continue; // pedestrian entrance
        const x=a[0]+dx*L*k/n+nx*inset,z=a[1]+dz*L*k/n+nz*inset;
        const xx=a[0]+dx*L*(k+1)/n+nx*inset,zz=a[1]+dz*L*(k+1)/n+nz*inset;
        const h=baseAt(x,z).h,hh=baseAt(xx,zz).h,bd=bAt(x,z);
        bd.box(x,h+0.57,z,0.075,1.14,0.075,color,{noBottom:true});
        for(const dy of [0.35,0.92]) {
          bd.quad([x,h+dy,z],[xx,hh+dy,zz],[xx,hh+dy+0.055,zz],[x,h+dy+0.055,z],color);
          bd.quad([xx,hh+dy,zz],[x,h+dy,z],[x,h+dy+0.055,z],[xx,hh+dy+0.055,zz],color);
        }
        addSegment(x,z,xx,zz);result.push([x,z,xx,zz]);
      }
    }
  }
  return result;
}
