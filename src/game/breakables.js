import { MeshBuilder } from '../core/mesh.js';

// Retain only this object's vertices, not the whole town chunk. GPU upload is
// deferred until impact; standing scenery still uses the single chunk draw.
export function captureFragment(b, first, end, x, y, z) {
  const ids = new Map(), vertices = [], indices = [];
  for (let j = first; j < end; j++) {
    const source = b.i[j];
    if (!ids.has(source)) {
      ids.set(source, ids.size);
      const n = source * 9;
      vertices.push(b.v[n] - x, b.v[n + 1] - y, b.v[n + 2] - z,
        ...b.v.slice(n + 3, n + 9));
    }
    indices.push(ids.get(source));
  }
  return { v: new Float32Array(vertices), i: new Uint16Array(indices) };
}

export function fragmentBuilder(fragment) {
  const b = new MeshBuilder();
  for (let n = 0; n < fragment.v.length; n += 9) {
    const v = fragment.v;
    b.vert(v[n], v[n+1], v[n+2], v[n+3], v[n+4], v[n+5], v.subarray(n+6,n+9));
  }
  b.i = Array.from(fragment.i);
  return b;
}

export function launchFragment(p, ux, uz, speed = 12) {
  const kick = Math.min(18, Math.max(3, speed * .38));
  return { x: p.x, y: p.y, z: p.z, kind: p.kind, h: p.h,
    yaw: 0, pitch: 0, roll: 0, t: 0, age: 0,
    vx: ux * kick, vz: uz * kick, vy: Math.min(8, 2 + speed * .13),
    ux, uz, ground: p.y, settled: false };
}

export function stepFragment(f, dt, groundAt) {
  if (f.settled) return;
  // Substeps keep the bounce stable when a browser drops a frame.
  const steps = Math.max(1, Math.ceil(dt / .02)), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    f.age += h;
    f.t = Math.min(1, f.age / .65);
    const angle = f.t * Math.PI * .5;
    // The original geometry keeps its world orientation at impact. Tilt its
    // vertical axis in the travel direction without spinning the signal arm.
    f.pitch = f.uz * angle;
    f.roll = -f.ux * angle;
    f.x += f.vx * h; f.z += f.vz * h;
    f.vy -= 13 * h; f.y += f.vy * h;
    const g = groundAt ? groundAt(f.x, f.z) : f.ground;
    let clearance = .35;
    if (f.min && f.max) {
      const cy = [-f.ux*Math.sin(angle), Math.cos(angle), -f.uz*Math.sin(angle)];
      const lowest = cy.reduce((sum,k,j)=>sum+k*(k>=0?f.min[j]:f.max[j]),0);
      clearance = .08-lowest;
    }
    const floor = (typeof g === 'number' ? g : g?.h ?? f.ground) + clearance;
    if (f.y < floor) {
      f.y = floor;
      if (f.vy < -1.2) f.vy *= -.22; else f.vy = 0;
      const drag = Math.exp(-4 * h);
      f.vx *= drag; f.vz *= drag;
      if (f.t === 1 && Math.hypot(f.vx, f.vz, f.vy) < .2) f.settled = true;
    }
  }
}

// Rodrigues rotation around the horizontal axis perpendicular to the impact.
// This preserves the original arm/crown orientation and lies flat diagonally.
export function fragmentMatrix(m, f) {
  const a = f.uz, b = -f.ux, angle = f.t * Math.PI * .5;
  const c = Math.cos(angle), s = Math.sin(angle), k = 1-c;
  m[0]=c+a*a*k; m[1]=b*s; m[2]=a*b*k; m[3]=0;
  m[4]=-b*s; m[5]=c; m[6]=a*s; m[7]=0;
  m[8]=a*b*k; m[9]=-a*s; m[10]=c+b*b*k; m[11]=0;
  m[12]=f.x; m[13]=f.y; m[14]=f.z; m[15]=1;
  return m;
}
