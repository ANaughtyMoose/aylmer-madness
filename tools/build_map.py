#!/usr/bin/env python3
"""Turn raw OpenStreetMap pulls (data/*.json) into src/game/mapdata.js.

Everything the game draws or drives on comes from here: real Aylmer roads,
real building footprints, the Ottawa River shoreline, parks and lots.
Coordinates are metres in a local frame: +X east, +Z south (GL right-handed
with +Y up), origin at the centre of the clip rectangle.
"""
import json, math, os, sys, hashlib, base64

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(ROOT, 'src', 'game', 'mapdata.js')

# Clip rectangle — old Aylmer, the Galeries, Deschênes, Wychwood, the marina.
LAT0, LAT1 = 45.378, 45.410
LON0, LON1 = -75.868, -75.803
LATC, LONC = (LAT0 + LAT1) / 2, (LON0 + LON1) / 2
MX = 111320 * math.cos(math.radians(LATC))
MZ = 110574

def proj(lat, lon):
    return (round((lon - LONC) * MX, 1), round(-(lat - LATC) * MZ, 1))

MINX, MINZ = proj(LAT1, LON0)
MAXX, MAXZ = proj(LAT0, LON1)

def load(name):
    with open(os.path.join(DATA, name)) as f:
        return json.load(f)['elements']

def inside(p):
    return MINX <= p[0] <= MAXX and MINZ <= p[1] <= MAXZ

# ------------------------------------------------------------------ geometry

def simplify(pts, tol):
    """Radial-distance + collinear removal. Keeps rings closed-agnostic."""
    out = [pts[0]]
    for p in pts[1:]:
        q = out[-1]
        if math.hypot(p[0] - q[0], p[1] - q[1]) >= tol:
            out.append(p)
    # drop nearly collinear middles
    if len(out) > 3:
        res = []
        n = len(out)
        for i in range(n):
            a, b, c = out[i - 1], out[i], out[(i + 1) % n]
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if abs(cross) > tol * 0.5:
                res.append(b)
        out = res if len(res) >= 3 else out
    return out

def area2(pts):
    s = 0
    for i in range(len(pts)):
        x1, z1 = pts[i]; x2, z2 = pts[(i + 1) % len(pts)]
        s += x1 * z2 - x2 * z1
    return s / 2

def ear_clip(pts):
    """Triangulate a simple polygon; returns index triples. Falls back to a fan."""
    n = len(pts)
    if n < 3:
        return []
    idx = list(range(n))
    if area2(pts) < 0:      # want CCW in (x,z) for the test below
        idx.reverse()
    tris = []
    def is_convex(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 1e-9
    def in_tri(p, a, b, c):
        d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1])
        d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1])
        d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1])
        neg = d1 < 0 or d2 < 0 or d3 < 0
        pos = d1 > 0 or d2 > 0 or d3 > 0
        return not (neg and pos)
    guard = 0
    while len(idx) > 3 and guard < 4 * n * n:
        guard += 1
        found = False
        m = len(idx)
        for i in range(m):
            ia, ib, ic = idx[i - 1], idx[i], idx[(i + 1) % m]
            a, b, c = pts[ia], pts[ib], pts[ic]
            if not is_convex(a, b, c):
                continue
            ok = True
            for j in idx:
                if j in (ia, ib, ic):
                    continue
                if in_tri(pts[j], a, b, c):
                    ok = False; break
            if ok:
                tris.append((ia, ib, ic))
                idx.pop(i)
                found = True
                break
        if not found:
            break
    if len(idx) == 3:
        tris.append((idx[0], idx[1], idx[2]))
    elif len(idx) > 3:  # degenerate input: fan it and move on
        for i in range(1, len(idx) - 1):
            tris.append((idx[0], idx[i], idx[i + 1]))
    return tris

def clip_rect(pts):
    """Sutherland–Hodgman against the map rectangle."""
    def clip_edge(poly, keep, isect):
        out = []
        for i in range(len(poly)):
            cur, prev = poly[i], poly[i - 1]
            if keep(cur):
                if not keep(prev):
                    out.append(isect(prev, cur))
                out.append(cur)
            elif keep(prev):
                out.append(isect(prev, cur))
        return out
    def lerp_x(a, b, x):
        t = (x - a[0]) / (b[0] - a[0]); return (x, a[1] + (b[1] - a[1]) * t)
    def lerp_z(a, b, z):
        t = (z - a[1]) / (b[1] - a[1]); return (a[0] + (b[0] - a[0]) * t, z)
    poly = pts
    poly = clip_edge(poly, lambda p: p[0] >= MINX, lambda a, b: lerp_x(a, b, MINX))
    if not poly: return []
    poly = clip_edge(poly, lambda p: p[0] <= MAXX, lambda a, b: lerp_x(a, b, MAXX))
    if not poly: return []
    poly = clip_edge(poly, lambda p: p[1] >= MINZ, lambda a, b: lerp_z(a, b, MINZ))
    if not poly: return []
    poly = clip_edge(poly, lambda p: p[1] <= MAXZ, lambda a, b: lerp_z(a, b, MAXZ))
    return [(round(p[0], 1), round(p[1], 1)) for p in poly]

def stitch(ways):
    """Join way geometries end-to-end into rings/chains by shared endpoints."""
    chains = [list(w) for w in ways if len(w) >= 2]
    changed = True
    while changed:
        changed = False
        for i in range(len(chains)):
            if changed: break
            for j in range(len(chains)):
                if i == j: continue
                a, b = chains[i], chains[j]
                if a[-1] == b[0]:
                    chains[i] = a + b[1:]; chains.pop(j); changed = True; break
                if a[-1] == b[-1]:
                    chains[i] = a + b[-2::-1]; chains.pop(j); changed = True; break
                if a[0] == b[-1]:
                    chains[i] = b + a[1:]; chains.pop(j); changed = True; break
                if a[0] == b[0]:
                    chains[i] = b[::-1] + a[1:]; chains.pop(j); changed = True; break
    return chains

def jitter(seed, lo, hi):
    h = int(hashlib.md5(str(seed).encode()).hexdigest()[:8], 16) / 0xffffffff
    return lo + (hi - lo) * h

# ------------------------------------------------------------------ roads

ROAD_CLASS = {
    'trunk': ('trunk', 15), 'trunk_link': ('trunk', 8), 'primary': ('primary', 14),
    'secondary': ('secondary', 12), 'secondary_link': ('secondary', 7),
    'tertiary': ('tertiary', 10), 'residential': ('residential', 8),
    'unclassified': ('residential', 8), 'service': ('service', 5),
}

def build_roads():
    roads = []
    for w in load('roads.json'):
        t = w.get('tags', {})
        cls = ROAD_CLASS.get(t.get('highway'))
        if not cls:
            continue
        if t.get('service') in ('driveway', 'parking_aisle') and t.get('highway') == 'service':
            kind, width = 'service', 4
        else:
            kind, width = cls
        pts, ids = [], []
        for g, nid in zip(w['geometry'], w['nodes']):
            p = proj(g['lat'], g['lon'])
            pts.append(p); ids.append(nid)
        # keep runs of points inside the rectangle (plus one outside to reach the edge)
        keep = [inside(p) for p in pts]
        if not any(keep):
            continue
        first = max(0, keep.index(True) - 1)
        last = min(len(pts) - 1, len(keep) - 1 - keep[::-1].index(True) + 1)
        pts, ids = pts[first:last + 1], ids[first:last + 1]
        if len(pts) < 2:
            continue
        lanes = t.get('lanes')
        try: lanes = int(lanes)
        except (TypeError, ValueError): lanes = None
        if lanes and kind != 'service':
            width = max(width, min(lanes * 3.4, 18))
        roads.append({
            'name': t.get('name', ''), 'cls': kind, 'w': width,
            'oneway': t.get('oneway') == 'yes',
            'pts': [[p[0], p[1]] for p in pts], 'ids': ids,
        })
    return roads

# ------------------------------------------------------------------ buildings

HOUSE = {'house', 'detached', 'residential', 'semidetached_house', 'bungalow', 'semi'}
def classify(t, area):
    b = t.get('building', 'yes')
    a = t.get('amenity', ''); s = t.get('shop', '')
    if s == 'mall': return 'mall'
    if b in ('church', 'chapel', 'cathedral', 'mosque') or a == 'place_of_worship': return 'church'
    if b in ('school', 'college', 'university', 'kindergarten') or a in ('school', 'college', 'university', 'kindergarten'): return 'school'
    if b in ('garage', 'garages', 'shed', 'roof', 'carport', 'hut', 'cabin'): return 'shed'
    if b in HOUSE: return 'house'
    if b == 'terrace': return 'terrace'
    if b == 'apartments' or b == 'dormitory': return 'apartments'
    if b in ('commercial', 'retail', 'office', 'supermarket', 'kiosk', 'restaurant') or s or a in ('restaurant', 'fast_food', 'cafe', 'bank', 'pharmacy', 'bar', 'fuel', 'car_repair'): return 'commercial'
    if b in ('industrial', 'warehouse', 'service'): return 'industrial'
    if b in ('public', 'civic', 'hospital', 'fire_station', 'government', 'community_centre') or a in ('community_centre', 'police', 'fire_station', 'clinic', 'hospital', 'arena', 'library', 'townhall', 'social_facility'): return 'public'
    if area < 180: return 'house'
    if area < 600: return 'commercial'
    return 'big'

HEIGHT = {'house': (4.8, 6.2), 'terrace': (6.0, 7.0), 'apartments': (10, 16), 'commercial': (5, 6.5),
          'industrial': (6.5, 8.5), 'church': (10, 13), 'school': (6.5, 8), 'shed': (2.4, 3.0),
          'public': (7, 9), 'big': (7, 9), 'mall': (8, 9)}

def build_buildings():
    out = []
    dropped = 0
    for w in load('buildings.json'):
        t = w.get('tags', {})
        pts = [proj(g['lat'], g['lon']) for g in w['geometry']]
        if pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3 or not all(inside(p) for p in pts):
            continue
        pts = simplify(pts, 0.6)
        if len(pts) < 3:
            continue
        a = abs(area2(pts))
        if a < 9:
            dropped += 1
            continue
        kind = classify(t, a)
        if kind == 'shed' and a < 14:
            dropped += 1
            continue
        lo, hi = HEIGHT[kind]
        h = jitter(w['id'], lo, hi)
        try:
            lv = float(t['building:levels'])
            h = max(2.6, lv * 3.1 + (0.8 if kind in ('house', 'terrace') else 0))
        except (KeyError, ValueError):
            pass
        # principal axis: direction of the longest edge (for gable ridges)
        best, ang = 0, 0
        for i in range(len(pts)):
            p, q = pts[i], pts[(i + 1) % len(pts)]
            l = math.hypot(q[0] - p[0], q[1] - p[1])
            if l > best:
                best, ang = l, math.atan2(q[1] - p[1], q[0] - p[0])
        tris = ear_clip(pts)
        if not tris:
            continue
        cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
        b = {
            'k': kind, 'h': round(h, 1), 'a': round(ang, 3), 'c': [round(cx, 1), round(cz, 1)],
            'p': [[p[0], p[1]] for p in pts], 't': [i for tri in tris for i in tri],
        }
        if t.get('name'): b['name'] = t['name']
        if t.get('addr:housenumber') and t.get('addr:street'):
            b['addr'] = f"{t['addr:housenumber']} {t['addr:street']}"
        out.append(b)
    print(f'buildings: {len(out)} kept, {dropped} tiny dropped', file=sys.stderr)
    return out

# ------------------------------------------------------------------ areas + water

def area_kind(t):
    n, l, lu, a = t.get('natural'), t.get('leisure'), t.get('landuse'), t.get('amenity')
    if n == 'water' or t.get('waterway') == 'riverbank': return 'water'
    if n in ('beach', 'sand'): return 'sand'
    if n in ('wood', 'scrub') or lu == 'forest': return 'wood'
    if l in ('park', 'playground', 'golf_course', 'sports_centre', 'garden') or lu in ('grass', 'meadow', 'recreation_ground', 'village_green'): return 'park'
    if a == 'parking': return 'parking'
    if l in ('pitch', 'track'): return 'pitch'
    if l == 'swimming_pool': return 'pool'
    if a in ('school', 'college', 'university'): return 'school'
    if lu == 'cemetery': return 'cemetery'
    return None

def build_areas():
    areas, river = [], None
    for e in load('land.json'):
        t = e.get('tags', {})
        if e['type'] == 'relation':
            if t.get('natural') == 'water' and t.get('type') == 'multipolygon':
                river = e
            continue
        kind = area_kind(t)
        if not kind:
            continue
        pts = [proj(g['lat'], g['lon']) for g in e['geometry']]
        if pts[0] == pts[-1]: pts = pts[:-1]
        pts = clip_rect(pts)
        if len(pts) < 3: continue
        pts = simplify(pts, 1.0 if kind in ('wood', 'park', 'water') else 0.6)
        if len(pts) < 3 or abs(area2(pts)) < 20: continue
        tris = ear_clip(pts)
        if not tris: continue
        a = {'k': kind, 'p': [[p[0], p[1]] for p in pts], 't': [i for tri in tris for i in tri]}
        if t.get('name'): a['name'] = t['name']
        areas.append(a)

    water = []
    if river:
        outers = [[proj(g['lat'], g['lon']) for g in m['geometry']]
                  for m in river['members'] if m.get('role') == 'outer' and 'geometry' in m]
        for ring in stitch(outers):
            closed = ring[0] == ring[-1]
            if closed: ring = ring[:-1]
            if not any(inside(p) for p in ring):
                continue
            poly = clip_rect(ring) if closed else close_shore(ring)
            if len(poly) < 3: continue
            poly = simplify(poly, 1.5)
            tris = ear_clip(poly)
            if tris:
                water.append({'p': [[p[0], p[1]] for p in poly], 't': [i for tri in tris for i in tri]})
        print(f'river: {len(water)} polygon(s) from {len(outers)} outer ways', file=sys.stderr)
    return areas, water

def close_shore(chain):
    """An open shoreline chain: clip to the rect and close along the south edge.
    Aylmer is on the north bank, so the water is always the +Z side."""
    inside_pts = [p for p in chain if inside(p)]
    if len(inside_pts) < 2: return []
    # extend the chain to the rect edges by clipping a wide polygon: the chain + a far-south return
    poly = list(chain) + [(chain[-1][0], MAXZ + 5000), (chain[0][0], MAXZ + 5000)]
    return clip_rect(poly)

def water_mask(water, cell=8):
    """Scanline-rasterise the river so the game can ask 'is this water?' cheaply."""
    w = int(math.ceil((MAXX - MINX) / cell)); h = int(math.ceil((MAXZ - MINZ) / cell))
    rows = bytearray(w * h)
    for poly in water:
        pts = poly['p']; n = len(pts)
        for j in range(h):
            z = MINZ + (j + 0.5) * cell
            xs = []
            for i in range(n):
                (x1, z1), (x2, z2) = pts[i], pts[(i + 1) % n]
                if (z1 <= z < z2) or (z2 <= z < z1):
                    xs.append(x1 + (z - z1) * (x2 - x1) / (z2 - z1))
            xs.sort()
            for k in range(0, len(xs) - 1, 2):
                i0 = max(0, int((xs[k] - MINX) / cell)); i1 = min(w - 1, int((xs[k + 1] - MINX) / cell))
                for i in range(i0, i1 + 1):
                    rows[j * w + i] = 1
    return {'cell': cell, 'w': w, 'h': h, 'b64': base64.b64encode(bytes(rows)).decode()}

# ------------------------------------------------------------------ pois

def build_pois(buildings):
    pois = []
    seen = set()
    for e in load('pois.json'):
        t = e.get('tags', {})
        if e['type'] != 'node' or not t.get('name'): continue
        kind = t.get('amenity') or t.get('shop') or t.get('tourism') or t.get('leisure')
        if not kind: continue
        p = proj(e['lat'], e['lon'])
        if not inside(p): continue
        pois.append({'name': t['name'], 'k': kind, 'x': p[0], 'z': p[1]})
        seen.add(t['name'])
    for b in buildings:
        if b.get('name') and b['name'] not in seen:
            pois.append({'name': b['name'], 'k': b['k'], 'x': b['c'][0], 'z': b['c'][1]})
    return pois

# ------------------------------------------------------------------ main

def main():
    roads = build_roads()
    buildings = build_buildings()
    areas, water = build_areas()
    mask = water_mask(water)
    pois = build_pois(buildings)
    named = [r['name'] for r in roads if r['name']]
    print(f'roads: {len(roads)} ways, {len(set(named))} distinct names', file=sys.stderr)
    print(f'areas: {len(areas)}; pois: {len(pois)}', file=sys.stderr)
    tris = sum(len(b['t']) // 3 for b in buildings)
    print(f'building footprint tris: {tris}', file=sys.stderr)
    data = {
        'origin': {'lat': LATC, 'lon': LONC},
        'bounds': {'minX': MINX, 'maxX': MAXX, 'minZ': MINZ, 'maxZ': MAXZ},
        'roads': roads, 'buildings': buildings, 'areas': areas, 'water': water,
        'waterMask': mask, 'pois': pois,
    }
    js = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(OUT, 'w') as f:
        f.write('// GENERATED by tools/build_map.py from OpenStreetMap data (ODbL).\n')
        f.write('// Real Aylmer, Québec: roads, building footprints, the Ottawa River, parks.\n')
        f.write('// Do not edit by hand — re-run the script.\n')
        f.write('export const MAP = ' + js + ';\n')
        f.write('export function latLonToXZ(lat, lon) {\n')
        f.write(f'  return [(lon - ({LONC})) * {MX:.3f}, -(lat - ({LATC})) * {MZ}];\n}}\n')
    print(f'wrote {OUT} ({len(js) / 1e6:.1f} MB)', file=sys.stderr)

if __name__ == '__main__':
    main()
