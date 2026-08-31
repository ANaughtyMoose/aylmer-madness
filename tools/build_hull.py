#!/usr/bin/env python3
"""Build the Highway to Hull expansion from real OpenStreetMap extracts.

The Aylmer map keeps its original origin and coordinates. Hull is projected into
that same frame and emitted as a separate module, then merged by
game/highway_to_hull.js. This keeps the expansion refreshable without touching
the assessment-roll-enriched Aylmer houses.

Input (Overpass JSON): data/hull_{roads,buildings,land,pois}.json
                       data/hull_water_relations.json
Output:                 src/game/hull_mapdata.js
"""
import json, math, os, sys

sys.path.insert(0, os.path.dirname(__file__))
import build_map as bm

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(ROOT, 'src', 'game', 'hull_mapdata.js')

# Route 148 / eastern Aylmer through central Hull, Heritage College, Gatineau
# Park's southern approaches and Chelsea village.
LAT0, LAT1 = 45.397, 45.525
LON0, LON1 = -75.803, -75.690

def proj(lat, lon):
    return (round((lon - bm.LONC) * bm.MX, 1), round(-(lat - bm.LATC) * bm.MZ, 1))

MINX, MINZ = proj(LAT1, LON0)
MAXX, MAXZ = proj(LAT0, LON1)

def load(kind):
    names = [f'hull_{kind}.json']
    if kind == 'buildings':
        names += ['hull_north_buildings_a.json', 'hull_north_buildings_b.json']
    else:
        names += [f'hull_north_{kind}.json']
    out, seen = [], set()
    for name in names:
        path = os.path.join(DATA, name)
        if not os.path.exists(path): continue
        with open(path) as f:
            elements = json.load(f)['elements']
        for e in elements:
            key = (e.get('type'), e.get('id'))
            if key in seen: continue
            seen.add(key); out.append(e)
    return out

def inside(p):
    return MINX <= p[0] <= MAXX and MINZ <= p[1] <= MAXZ

def clip_ring(points):
    """Sutherland-Hodgman clip against the expansion rectangle."""
    def edge(poly, axis, bound, keep_low):
        if not poly: return []
        out = []
        def within(p): return p[axis] >= bound if keep_low else p[axis] <= bound
        for a, b in zip(poly, poly[1:] + poly[:1]):
            ai, bi = within(a), within(b)
            if ai: out.append(a)
            if ai == bi: continue
            den = b[axis] - a[axis]
            t = (bound - a[axis]) / den if abs(den) > 1e-9 else 0
            q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
            q[axis] = bound; out.append(tuple(q))
        return out
    p = list(points)
    for axis, bound, low in ((0, MINX, True), (0, MAXX, False),
                             (1, MINZ, True), (1, MAXZ, False)):
        p = edge(p, axis, bound, low)
    return [(round(x, 1), round(z, 1)) for x, z in p]

def water_relations():
    """Assemble OSM multipolygon outer ways into clipped river surfaces."""
    path = os.path.join(DATA, 'hull_water_relations.json')
    if not os.path.exists(path): return []
    with open(path) as f: relations = json.load(f).get('elements', [])
    out = []
    for rel in relations:
        tags = rel.get('tags', {})
        if tags.get('natural') != 'water' and tags.get('waterway') != 'riverbank':
            continue
        segments = []
        for member in rel.get('members', []):
            geom = member.get('geometry') or []
            if member.get('role') != 'outer' or len(geom) < 2: continue
            segments.append([(p['lat'], p['lon']) for p in geom])
        rings = []
        while segments:
            ring = segments.pop()
            changed = True
            while changed and ring[0] != ring[-1]:
                changed = False
                for i, seg in enumerate(segments):
                    if ring[-1] == seg[0]: ring += seg[1:]
                    elif ring[-1] == seg[-1]: ring += list(reversed(seg[:-1]))
                    elif ring[0] == seg[-1]: ring = seg[:-1] + ring
                    elif ring[0] == seg[0]: ring = list(reversed(seg[1:])) + ring
                    else: continue
                    segments.pop(i); changed = True; break
            if len(ring) >= 4 and ring[0] == ring[-1]: rings.append(ring[:-1])
        for ring in rings:
            pts = clip_ring([proj(lat, lon) for lat, lon in ring])
            if len(pts) < 3: continue
            # River relations can contain thousands of sub-metre survey points;
            # eight-metre simplification is invisible at driving/map scale and
            # keeps the water meshes inside the expansion geometry budget.
            pts = bm.simplify(pts, 8.0)
            if len(pts) < 3 or abs(bm.area2(pts)) < 1000: continue
            tris = bm.ear_clip(pts)
            if not tris: continue
            a = {'k': 'water', 'p': pts, 't': [i for tri in tris for i in tri],
                 'relation': rel['id']}
            if tags.get('name'): a['name'] = tags['name']
            out.append(a)
    return out

def roads():
    out = []
    for way in load('roads'):
        tags = way.get('tags', {})
        rc = bm.ROAD_CLASS.get(tags.get('highway'))
        geom, nodes = way.get('geometry') or [], way.get('nodes') or []
        if not rc or len(geom) < 2 or len(geom) != len(nodes):
            continue
        kind, width = rc
        if tags.get('service') in ('driveway', 'parking_aisle') and tags.get('highway') == 'service':
            kind, width = 'service', 4
        pts = [proj(p['lat'], p['lon']) for p in geom]
        keep = [inside(p) for p in pts]
        if not any(keep):
            continue
        first = max(0, keep.index(True) - 1)
        last = min(len(pts) - 1, len(keep) - 1 - keep[::-1].index(True) + 1)
        pts, nodes = pts[first:last + 1], nodes[first:last + 1]
        if len(pts) < 2:
            continue
        try: lanes = int(tags.get('lanes'))
        except (TypeError, ValueError): lanes = 0
        if lanes and kind != 'service':
            width = max(width, min(lanes * 3.4, 18))
        out.append({'name': tags.get('name', ''), 'cls': kind, 'w': width,
                    'oneway': tags.get('oneway') == 'yes', 'pts': pts, 'ids': nodes})
    return out

def buildings():
    out = []
    for way in load('buildings'):
        tags = way.get('tags', {})
        pts = [proj(p['lat'], p['lon']) for p in way.get('geometry') or []]
        if len(pts) < 4:
            continue
        if pts[0] == pts[-1]: pts = pts[:-1]
        if len(pts) < 3 or not all(inside(p) for p in pts):
            continue
        pts = bm.simplify(pts, 0.6)
        area = abs(bm.area2(pts))
        if len(pts) < 3 or area < 12:
            continue
        kind = bm.classify(tags, area)
        if kind == 'shed' and area < 20:
            continue
        # Exact footprints matter most here. Hull's 30k residential buildings
        # use the inexpensive extruded archetype so the expansion stays playable.
        if kind in ('house', 'terrace'):
            kind = 'big'
        lo, hi = bm.HEIGHT[kind]
        h = bm.jitter(way['id'], lo, hi)
        try: h = max(2.6, float(tags['building:levels']) * 3.1)
        except (KeyError, ValueError): pass
        best, ang = 0, 0
        for i, p in enumerate(pts):
            q = pts[(i + 1) % len(pts)]
            length = math.hypot(q[0] - p[0], q[1] - p[1])
            if length > best:
                best, ang = length, math.atan2(q[1] - p[1], q[0] - p[0])
        tris = bm.ear_clip(pts)
        if not tris: continue
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        b = {'id': way['id'], 'k': kind, 'h': round(h, 1), 'a': round(ang, 3),
             'c': [round(cx, 1), round(cz, 1)], 'p': pts,
             't': [i for tri in tris for i in tri]}
        if tags.get('name'): b['name'] = tags['name']
        if tags.get('addr:housenumber') and tags.get('addr:street'):
            b['addr'] = f"{tags['addr:housenumber']} {tags['addr:street']}"
        out.append(b)
    return out

def areas():
    out = []
    for way in load('land'):
        tags = way.get('tags', {})
        kind = bm.area_kind(tags)
        pts = [proj(p['lat'], p['lon']) for p in way.get('geometry') or []]
        if not kind or len(pts) < 4: continue
        if pts[0] == pts[-1]: pts = pts[:-1]
        if len(pts) < 3: continue
        pts = bm.simplify(pts, 1.0 if kind in ('wood', 'park', 'water') else 0.6)
        if len(pts) < 3 or abs(bm.area2(pts)) < 20: continue
        tris = bm.ear_clip(pts)
        if not tris: continue
        a = {'k': kind, 'p': pts, 't': [i for tri in tris for i in tri]}
        if tags.get('name'): a['name'] = tags['name']
        out.append(a)
    out.extend(water_relations())
    return out

def pois():
    out, seen = [], set()
    for e in load('pois'):
        tags = e.get('tags', {})
        name = tags.get('name')
        if not name or name in seen: continue
        point = e.get('center') or e
        if 'lat' not in point or 'lon' not in point: continue
        x, z = proj(point['lat'], point['lon'])
        kind = tags.get('amenity') or tags.get('shop') or tags.get('tourism') or tags.get('leisure') or 'place'
        out.append({'name': name, 'k': kind, 'x': x, 'z': z})
        seen.add(name)
    return out

def main():
    data = {'bounds': {'minX': MINX, 'maxX': MAXX, 'minZ': MINZ, 'maxZ': MAXZ},
            'roads': roads(), 'buildings': buildings(), 'areas': areas(), 'pois': pois()}
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(OUT, 'w') as f:
        f.write('// GENERATED by tools/build_hull.py from OpenStreetMap data (ODbL).\n')
        f.write('// Highway to Hull expansion: real roads, footprints, land use and POIs.\n')
        f.write('export const HULL_MAP = ' + text + ';\n')
    print(f"Hull: {len(data['roads'])} roads, {len(data['buildings'])} buildings, "
          f"{len(data['areas'])} areas, {len(data['pois'])} POIs; {len(text)/1e6:.1f} MB")

if __name__ == '__main__': main()
