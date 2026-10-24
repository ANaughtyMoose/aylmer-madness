// Section 0: the height field and the drape helpers every later section lays
// its flat geometry with (moved out of world.js, V0-02).
import { buildTerrain, FEATURES } from '../terrain.js';
import { groundGrid } from './groundgrid.js';
import { makeSurface } from '../surface.js';

export function installDrape(ctx) {
  const { bAt, inside } = ctx;
  // ------------------------------------------------------ 0. the height field
  // Built HERE, before the first quad, because from this line down every piece
  // of geometry in the file has to ask how high the ground is under it.
  //
  // Two layers (terrain.js). The BASE is the LiDAR raster: the real shape of
  // Aylmer, sampled bilinearly, fading to exactly zero 400 m outside its own
  // rectangle so Hull, Ottawa and the 148 are the flat ground they have always
  // been. On top of it sit the hand-written FEATURES - the rail berm, the boat
  // launch, the mall's loading dock - whose heights are offsets above whatever
  // ground they stand on. `groundAt` is both together, which is what the car
  // drives on; `baseAt` is the raster alone.
  //
  // Almost everything below drapes on `baseAt`, not `groundAt`, and the reason
  // is worth stating: section 5c emits each feature's own surface as separate
  // geometry laid over the town, exactly as it did when the town was flat and
  // the roads were at y = 0.05. Draping a road on `groundAt` would make the
  // asphalt climb the rail berm AND the berm's own mesh sit on top of it. The
  // level crossings at the end of 5c are the deliberate exception.
  const terrain = buildTerrain(FEATURES, groundGrid());
  const groundAt = terrain.groundAt;
  const baseAt = terrain.baseAt;
  const baseRect = terrain.baseRect;
  // The raster's own cell. Nothing flat is allowed to span more than one of
  // these: a quad that bridges two cells draws the chord and misses the kink,
  // and a road decal 5 cm over the lawn loses that fight on every ridge.
  const DRAPE = terrain.base ? terrain.base.cell : 8;

  // Fast gate: is any of this rectangle over the raster, or in its fade band?
  // Outside it `baseAt` returns exactly 0, so every drape below is `+ 0` and
  // the only thing subdividing would buy is vertices. Everything that can be
  // expensive checks this first and takes the old flat path when it answers no,
  // which is why the Hull and Ottawa sectors cost nothing for a hill that is
  // not under them.
  function overBase(x0, z0, x1, z1) {
    if (baseRect === null) return false;
    const f = baseRect.fade;
    return x1 >= baseRect.x0 - f && x0 <= baseRect.x1 + f
      && z1 >= baseRect.z0 - f && z0 <= baseRect.z1 + f;
  }

  // The node lines of one axis of a rectangle: both edges, plus every raster
  // grid line strictly between them. Aligning the cuts to the raster instead of
  // simply chopping into equal pieces is what makes the drawn hillside the same
  // surface the car drives on - a node that landed halfway between two raster
  // nodes would draw the chord across the cell and sit up to a quarter of the
  // local second difference away from the height the physics reports.
  function gridLines(a, b, origin, cell) {
    const out = [a];
    for (let k = Math.floor((a - origin) / cell) + 1; ; k++) {
      const v = origin + k * cell;
      if (v >= b - 1e-6) break;
      if (v > a + 1e-6) out.push(v);
    }
    out.push(b);
    return out;
  }

  const surface = makeSurface(baseAt, baseRect, DRAPE);
  const surfaceVertices = new WeakMap();
  const DN = [0,1,0];
  function drapeNormal(x,z) { const b=baseAt(x,z); DN[0]=b.nx;DN[1]=b.ny;DN[2]=b.nz;return b.h; }
  function cover(poly,y,col,get=bAt,reuse=null) {
    surface.drape(poly,y,points=>{
      // Remove clip-generated duplicates and collinear vertices before fanning.
      let changed=true;
      while(changed && points.length>3) {
        changed=false;
        for(let i=0;i<points.length;i++) {
          const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];
          if(Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))<1e-8) {
            points.splice(i,1);changed=true;break;
          }
        }
      }
      let mx=0,mz=0;for(const p of points){mx+=p[0];mz+=p[2];}mx/=points.length;mz/=points.length;
      if(inside && !inside(mx,mz))return;
      const bd=get(mx,mz);drapeNormal(mx,mz);
      let shared=reuse;
      if(!shared) { shared=surfaceVertices.get(bd);if(!shared){shared=new Map();surfaceVertices.set(bd,shared);} }
      const colorKey=col.map(v=>v.toFixed(5)).join(',');
      const ids=points.map(p=>{
        const key=p[0].toFixed(6)+','+p[1].toFixed(6)+','+p[2].toFixed(6)+','+colorKey;
        if(shared.has(key))return shared.get(key);
        drapeNormal(p[0],p[2]);
        const k=bd.vert(p[0],p[1],p[2],DN[0],DN[1],DN[2],col);
        shared.set(key,k);return k;
      });
      for(let i=1;i+1<points.length;i++) {
        const a=points[0],b=points[i],c=points[i+1];
        const cr=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
        if(Math.abs(cr)<1e-9)continue;
        if(cr<0)bd.tri(ids[0],ids[i],ids[i+1]);else bd.tri(ids[0],ids[i+1],ids[i]);
      }
    });
  }
  function rectPoints(cx,cz,w,len,yaw) {
    const s=Math.sin(yaw),c=Math.cos(yaw);
    return [[-w/2,-len/2],[-w/2,len/2],[w/2,len/2],[w/2,-len/2]].map(([u,t])=>[cx+c*u+s*t,cz-s*u+c*t]);
  }
  function stripe(cx,cz,w,len,y,yaw,col) { cover(rectPoints(cx,cz,w,len,yaw),y,col); }
  function slab(cx,cz,w,len,thick,yaw,col) {
    const ring=rectPoints(cx,cz,w,len,yaw);
    if(!overBase(cx-w-len,cz-w-len,cx+w+len,cz+w+len)) {
      const bd=bAt(cx,cz);bd.flatRot(cx,cz,w,len,thick,yaw,col);
      for(const e of [0,2]) { const a=ring[e],b=ring[(e+1)%4];bd.quad([a[0],0,a[1]],[b[0],0,b[1]],[b[0],thick,b[1]],[a[0],thick,a[1]],col); }
      return;
    }
    cover(ring,thick,col);
    for(const e of [0,2]) {
      const a=ring[e],b=ring[(e+1)%4],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/DRAPE));
      for(let i=0;i<n;i++) {
        const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n;
        const xx=a[0]+(b[0]-a[0])*(i+1)/n,zz=a[1]+(b[1]-a[1])*(i+1)/n;
        const h=baseAt(x,z).h,hh=baseAt(xx,zz).h;
        bAt(x,z).quad([x,h,z],[xx,hh,zz],[xx,hh+thick,zz],[x,h+thick,z],col);
      }
    }
  }
  function interDeck(bd,ring,y,col) { cover(ring,y,col); }
  function drapeTri(ax,az,bx,bz,cx,cz,y,col,get,step) { cover([[ax,az],[bx,bz],[cx,cz]],y,col,get); }

  // A four-corner ground patch, cut into cell-sized pieces on both axes with
  // every corner lifted onto the ground under it. (This replaced a `flatQuad`
  // that laid the whole patch at one absolute y.) The shoreline is what wants
  // the cutting - one river edge can run 140 m, and a 140 m beach laid flat
  // across a bank is a ramp into the water. The ring is reordered per piece if
  // its shoelace comes out positive, so a caller does not have to know which way
  // round its corners are.
  const dq = [null, null, null, null];
  function drapeQuad(q, y, col) {
    const a = q[0], b = q[1], c2 = q[2], d = q[3];
    const over = overBase(
      Math.min(a[0], b[0], c2[0], d[0]), Math.min(a[1], b[1], c2[1], d[1]),
      Math.max(a[0], b[0], c2[0], d[0]), Math.max(a[1], b[1], c2[1], d[1]));
    const nu = !over ? 1 : Math.max(1, Math.ceil(Math.max(
      Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c2[0] - d[0], c2[1] - d[1])) / DRAPE));
    const nv = !over ? 1 : Math.max(1, Math.ceil(Math.max(
      Math.hypot(d[0] - a[0], d[1] - a[1]), Math.hypot(c2[0] - b[0], c2[1] - b[1])) / DRAPE));
    // Bilinear in (u along a->b, v along a->d), so the piece grid follows the
    // patch even where the two long edges are not parallel.
    const P = (u, v) => {
      const lx = a[0] + (d[0] - a[0]) * v, lz = a[1] + (d[1] - a[1]) * v;
      const rx2 = b[0] + (c2[0] - b[0]) * v, rz2 = b[1] + (c2[1] - b[1]) * v;
      const x = lx + (rx2 - lx) * u, z = lz + (rz2 - lz) * u;
      return [x, z];
    };
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
        dq[0] = P(u0, v0); dq[1] = P(u1, v0); dq[2] = P(u1, v1); dq[3] = P(u0, v1);
        const mx = (dq[0][0] + dq[2][0]) / 2, mz = (dq[0][1] + dq[2][1]) / 2;
        const cr = (dq[1][0] - dq[0][0]) * (dq[2][1] - dq[0][1])
          - (dq[1][1] - dq[0][1]) * (dq[2][0] - dq[0][0]);
        const o = cr > 0 ? [dq[0], dq[3], dq[2], dq[1]] : dq;
        drapeNormal(mx, mz);
        bAt(mx, mz).quad(
          [o[0][0], baseAt(o[0][0], o[0][1]).h + y, o[0][1]],
          [o[1][0], baseAt(o[1][0], o[1][1]).h + y, o[1][1]],
          [o[2][0], baseAt(o[2][0], o[2][1]).h + y, o[2][1]],
          [o[3][0], baseAt(o[3][0], o[3][1]).h + y, o[3][1]], col, DN);
      }
    }
  }

  Object.assign(ctx, { terrain, groundAt, baseAt, DRAPE, overBase, surface, cover, rectPoints, stripe, slab,
    interDeck, drapeTri, drapeQuad });
}
