// The ground quads (section 0) and the landuse areas (section 3).
import { mulberry32 } from '../../core/math.js';
import { CHUNK, C, Y } from './consts.js';
import { shade, rgb } from '../../core/mesh.js';

export function buildGround(ctx) {
  const { NZ, NX, B, inside, bAt, cover, surface } = ctx;
  const cnt = ctx.count;
  // Grass and every pavement layer use identical terrain triangles.
  const gr=mulberry32(0x51ee7);
  for(let cz=0;cz<NZ;cz++) for(let cx=0;cx<NX;cx++) {
    const x0=B.minX+cx*CHUNK,x1=Math.min(x0+CHUNK,B.maxX);
    const z0=B.minZ+cz*CHUNK,z1=Math.min(z0+CHUNK,B.maxZ);
    if(x1<=x0||z1<=z0)continue;
    if(inside && !inside((x0+x1)/2,(z0+z1)/2))continue;
    const bd=bAt((x0+x1)/2,(z0+z1)/2),col=shade(C.grassLo,1+gr()*0.16);
    cover([[x0,z0],[x0,z1],[x1,z1],[x1,z0]],Y.grass,col,()=>bd,new Map());
    cnt.groundQuads++;
  }
  const groundMeshStats={...surface.stats};

  Object.assign(ctx, { groundMeshStats });
}

export function buildAreas(ctx) {
  const { areas, triScatter, wAt, drapeTri, bAt } = ctx;
  // ------------------------------------------------------------ 3. areas
  // colour, decal height, and how finely the polygon is cut when it is draped.
  //
  // The third number is a budget, not a preference. mapdata's ear-clipper hands
  // over a wood as a few hundred triangles up to 200 m across, and splitting
  // those to the 8 m raster cell turns 43k landuse triangles into 3.0 M - nine
  // million vertices for ground tint. So the two things you stand or drive on
  // (the beach, the car parks) are cut fine, and the big green washes under the
  // trees are cut at four cells, where a 32 m span is about 15 cm off the true
  // surface on Aylmer's steepest slope and invisible on the rest.
  const AREA = {
    park: [C.park, Y.park, 32], school: [C.school, Y.park, 32], cemetery: [C.cemetery, Y.park, 32],
    sand: [C.sand, Y.sand, 8], wood: [C.wood, Y.wood, 32], parking: [C.parking, Y.parking, 8],
    pitch: [C.pitch, Y.pitch, 8], pool: [C.pool, Y.pool, 8], water: [C.water, Y.water, 0],
  };
  // Landuse is draped; water is not. The datum in ground_data.js was chosen so
  // the river bed sits UNDER the water quad and the banks about a metre over
  // it, which only works if the river surface stays the flat sheet it is.
  for (const a of areas) {
    const spec = AREA[a.k];
    if (!spec) continue;
    if (a.k === 'water') { triScatter(a.p, a.t, spec[1], rgb(spec[0]), wAt); continue; }
    const col = rgb(spec[0]);
    for (let i = 0; i < a.t.length; i += 3) {
      const p0 = a.p[a.t[i]], p1 = a.p[a.t[i + 1]], p2 = a.p[a.t[i + 2]];
      drapeTri(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], spec[1], col, bAt, spec[2]);
    }
  }
}
