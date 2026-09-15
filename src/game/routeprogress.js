// All GPS views share this remaining polyline; completed segments are discarded.
export function remainingRoute(route, x, z) {
  if (!route || route.length < 2) return route;
  let best = Infinity, index = 0, point = route[0];
  for (let i = 0; i + 1 < route.length; i++) {
    const [ax,az] = route[i], [bx,bz] = route[i+1];
    const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz;
    const t=l2 ? Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)) : 0;
    const p=[ax+dx*t,az+dz*t],d=(x-p[0])**2+(z-p[1])**2;
    // Prefer the earlier segment at crossings and overlapping return legs.
    if(d < best - .01){best=d;index=i;point=p;}
  }
  // Keep the route intact while off-road so the caller can detect/replan it.
  if(best>45*45)return route;
  return [point,...route.slice(index+1)];
}
