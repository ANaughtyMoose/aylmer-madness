// All ground-cover polygons share one triangulation. Independent draping makes
// grass and asphalt cross between their vertices on a saddle or raster seam.
// Clip each convex polygon into the SAME small terrain triangles, then sample
// that triangle's plane. Offsets remain constant over the entire overlap.
export function clipHalf(poly, distance) {
  const out = [];
  if (!poly.length) return out;
  let a = poly[poly.length - 1], da = distance(a);
  for (const b of poly) {
    const db = distance(b);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    if (db >= 0) out.push(b);
    a = b; da = db;
  }
  return out;
}

export function makeSurface(baseAt, rect, cell = 8) {
  const cache = new Map();
  const stats = { cells: 0, refinedCells: 0, extraVertices: 0, extraTriangles: 0, maxDivisions: 1 };
  const ox = rect?.x0 || 0, oz = rect?.z0 || 0;
  function tile(i, j) {
    const key = `${i},${j}`;
    let t = cache.get(key);
    if (t) return t;
    const x = ox + i * cell, z = oz + j * cell;
    const h00 = baseAt(x,z).h, h10 = baseAt(x+cell,z).h;
    const h01 = baseAt(x,z+cell).h, h11 = baseAt(x+cell,z+cell).h;
    let n = 1;
    const error = Math.abs(h00 + h11 - h10 - h01) / 4;
    while (error / (n*n) > 0.09) n *= 2;
    t = { x,z,n,step:cell/n };
    cache.set(key,t);
    stats.cells++;
    if(n>1) { stats.refinedCells++; stats.extraTriangles += 2*(n*n-1); stats.extraVertices += (n+1)*(n+1)-4; }
    stats.maxDivisions = Math.max(stats.maxDivisions,n);
    return t;
  }
  function flat(poly, offset, emit) {
    emit(poly.map(p=>[p[0],offset,p[1]]));
  }
  function drape(poly, offset, emit) {
    if(poly.length<3) return;
    let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
    for(const [x,z] of poly) { x0=Math.min(x0,x);z0=Math.min(z0,z);x1=Math.max(x1,x);z1=Math.max(z1,z); }
    if(!rect || x1<rect.x0-rect.fade || x0>rect.x1+rect.fade || z1<rect.z0-rect.fade || z0>rect.z1+rect.fade) {
      flat(poly,offset,emit); return;
    }
    // A large woodland polygon can span the entire expansion. Only its part
    // over actual terrain needs raster triangles; the flat exterior stays a fan.
    const bounds = [p=>p[0]-(rect.x0-rect.fade),p=>rect.x1+rect.fade-p[0],
      p=>p[1]-(rect.z0-rect.fade),p=>rect.z1+rect.fade-p[1]];
    for(const side of bounds) {
      const outside=clipHalf(poly,p=>-side(p));
      if(outside.length>=3)flat(outside,offset,emit);
      poly=clipHalf(poly,side);
      if(poly.length<3)return;
    }
    x0=Math.max(x0,rect.x0-rect.fade);x1=Math.min(x1,rect.x1+rect.fade);
    z0=Math.max(z0,rect.z0-rect.fade);z1=Math.min(z1,rect.z1+rect.fade);
    const i0=Math.floor((x0-ox)/cell),i1=Math.floor((x1-ox-1e-8)/cell);
    const j0=Math.floor((z0-oz)/cell),j1=Math.floor((z1-oz-1e-8)/cell);
    for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++) {
      const t=tile(i,j),s=t.step;
      for(let v=0;v<t.n;v++) for(let u=0;u<t.n;u++) {
        const x=t.x+u*s,z=t.z+v*s;
        if(x>x1 || x+s<x0 || z>z1 || z+s<z0) continue;
        let q=clipHalf(poly,p=>p[0]-x);
        q=clipHalf(q,p=>x+s-p[0]);q=clipHalf(q,p=>p[1]-z);q=clipHalf(q,p=>z+s-p[1]);
        if(q.length<3) continue;
        const a=baseAt(x,z).h,b=baseAt(x+s,z).h,c=baseAt(x,z+s).h,d=baseAt(x+s,z+s).h;
        if(Math.abs(a+d-b-c)<1e-7) {
          emit(q.map(p=>[p[0],a+(b-a)*(p[0]-x)/s+(c-a)*(p[1]-z)/s+offset,p[1]]));
          continue;
        }
        for(const upper of [false,true]) {
          const r=clipHalf(q,p=>upper ? (p[0]-x)-(p[1]-z) : (p[1]-z)-(p[0]-x));
          if(r.length<3) continue;
          emit(r.map(p=>{
            const fx=(p[0]-x)/s,fz=(p[1]-z)/s;
            const h=upper ? a+(b-a)*fx+(d-b)*fz : a+(d-c)*fx+(c-a)*fz;
            return [p[0],h+offset,p[1]];
          }));
        }
      }
    }
  }
  return { drape, stats };
}
