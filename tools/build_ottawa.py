#!/usr/bin/env python3
"""Build the downtown-Ottawa sector that sits east of the Hull seam.

tools/build_hull.py stops at lon -75.690. That line runs straight through the
Rideau Centre (whose footprint spans -75.6932..-75.6893, so the all-points-inside
building test dropped it entirely) and clips the ByWard Market's eastern blocks
mid-street. This module carries the strip from that seam east to Nicholas /
King Edward, which is far enough that every named destination the game cares
about has real street on all four sides of it.

Same frame, same projection, same clip logic as build_hull.py — the sector is
merged at runtime by src/game/ottawa.js exactly the way Hull is merged by
highway_to_hull.js, and because the OSM node ids are shared the road graph
stays one connected component across the seam and across every bridge.

Input (Overpass JSON, tools/fetch_ottawa.py): data/raw/ottawa_*.json
Output:                                        src/game/ottawa_mapdata.js
"""
import json, math, os, sys

sys.path.insert(0, os.path.dirname(__file__))
import build_map as bm

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw')
OUT = os.path.join(ROOT, 'src', 'game', 'ottawa_mapdata.js')

# The clip rectangle.
#
# West edge is the Hull seam exactly, so the two sectors abut without a gap.
# East edge -75.680 puts Nicholas Street, King Edward Avenue and the first
# blocks of Sandy Hill beyond the Rideau Centre's east face (-75.6893), which
# is roughly 730 m of spare street: nothing that matters is cut mid-block.
# Stopping short of the Rideau River and the University of Ottawa is deliberate
# — they would roughly double the building count for no named destination.
# North edge takes in Rideau Falls and the Ottawa River shore; New Edinburgh and
# Rockcliffe beyond it are suburb, and cost more than they are worth.
LAT0, LAT1 = 45.3970, 45.4460
LON0, LON1 = -75.6900, -75.6800

# Buildings whose footprint straddles the seam are dropped by BOTH extracts'
# all-points-inside test — 402 of them, per the survey that prompted this work.
# Reaching this far west of the seam recovers them; src/game/ottawa.js drops
# any whose OSM way id is already in MAP, so nothing is drawn twice.
BLD_LON0 = -75.6980

# Downtown Ottawa's backyards are full of two-metre garden sheds and bin
# shelters that cost a draw call each and are invisible from a car. Everything
# in build_hull's shed archetype under this footprint goes.
SHED_MIN_AREA = 26


def proj(lat, lon):
    return (round((lon - bm.LONC) * bm.MX, 1), round(-(lat - bm.LATC) * bm.MZ, 1))


MINX, MINZ = proj(LAT1, LON0)
MAXX, MAXZ = proj(LAT0, LON1)
BLD_MINX = proj(LAT1, BLD_LON0)[0]


def load(kind):
    path = os.path.join(RAW, f'ottawa_{kind}.json')
    if not os.path.exists(path):
        print(f'  (missing {path}, skipping)', file=sys.stderr)
        return []
    with open(path) as f:
        return json.load(f)['elements']


def inside(p):
    return MINX <= p[0] <= MAXX and MINZ <= p[1] <= MAXZ


def clip_ring(points, minx=None):
    """Sutherland-Hodgman against the sector rectangle."""
    minx = MINX if minx is None else minx

    def edge(poly, axis, bound, keep_low):
        if not poly:
            return []
        out = []

        def within(p):
            return p[axis] >= bound if keep_low else p[axis] <= bound
        for a, b in zip(poly, poly[1:] + poly[:1]):
            ai, bi = within(a), within(b)
            if ai:
                out.append(a)
            if ai == bi:
                continue
            den = b[axis] - a[axis]
            t = (bound - a[axis]) / den if abs(den) > 1e-9 else 0
            q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
            q[axis] = bound
            out.append(tuple(q))
        return out
    p = list(points)
    for axis, bound, low in ((0, minx, True), (0, MAXX, False),
                             (1, MINZ, True), (1, MAXZ, False)):
        p = edge(p, axis, bound, low)
    return [(round(x, 1), round(z, 1)) for x, z in p]


def roads():
    """Roads clipped to the sector, extended one node past every world edge.

    The west edge is NOT extended: it is the Hull seam, and build_hull.py
    already carries one node east of it. Sharing that single node — same OSM id
    — joins the two graphs without drawing the segment twice.
    """
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
        # Un-extend across the seam only.
        if pts[first][0] < MINX:
            first += 1
        if pts[last][0] < MINX:
            last -= 1
        if last - first < 1:
            continue
        pts, nodes = pts[first:last + 1], nodes[first:last + 1]
        try:
            lanes = int(tags.get('lanes'))
        except (TypeError, ValueError):
            lanes = 0
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
        if pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3:
            continue
        if not all(BLD_MINX <= p[0] <= MAXX and MINZ <= p[1] <= MAXZ for p in pts):
            continue
        pts = bm.simplify(pts, 0.6)
        area = abs(bm.area2(pts))
        if len(pts) < 3 or area < 12:
            continue
        kind = bm.classify(tags, area)
        if kind == 'shed' and area < SHED_MIN_AREA:
            continue
        # Same trade as Hull: exact footprints, cheap extruded archetype. The
        # hero buildings in src/game/ottawa_landmarks.js replace the handful
        # that anyone actually looks at.
        if kind in ('house', 'terrace'):
            kind = 'big'
        lo, hi = bm.HEIGHT[kind]
        h = bm.jitter(way['id'], lo, hi)
        try:
            h = max(2.6, float(tags['building:levels']) * 3.1)
        except (KeyError, ValueError):
            pass
        try:
            h = max(2.6, float(str(tags['height']).split()[0]))
        except (KeyError, ValueError, IndexError):
            pass
        best, ang = 0, 0
        for i, p in enumerate(pts):
            q = pts[(i + 1) % len(pts)]
            length = math.hypot(q[0] - p[0], q[1] - p[1])
            if length > best:
                best, ang = length, math.atan2(q[1] - p[1], q[0] - p[0])
        tris = bm.ear_clip(pts)
        if not tris:
            continue
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        b = {'id': way['id'], 'k': kind, 'h': round(h, 1), 'a': round(ang, 3),
             'c': [round(cx, 1), round(cz, 1)], 'p': pts,
             't': [i for tri in tris for i in tri]}
        if tags.get('name'):
            b['name'] = tags['name']
        if tags.get('addr:housenumber') and tags.get('addr:street'):
            b['addr'] = f"{tags['addr:housenumber']} {tags['addr:street']}"
        out.append(b)
    return out


def water_relations():
    """Assemble OSM multipolygon outer ways into clipped river surfaces."""
    elements = load('water_relations')
    out = []
    for rel in elements:
        tags = rel.get('tags', {})
        if tags.get('natural') != 'water' and tags.get('waterway') != 'riverbank':
            continue
        segments = []
        for member in rel.get('members', []):
            geom = member.get('geometry') or []
            if member.get('role') != 'outer' or len(geom) < 2:
                continue
            segments.append([(p['lat'], p['lon']) for p in geom])
        rings = []
        while segments:
            ring = segments.pop()
            changed = True
            while changed and ring[0] != ring[-1]:
                changed = False
                for i, seg in enumerate(segments):
                    if ring[-1] == seg[0]:
                        ring += seg[1:]
                    elif ring[-1] == seg[-1]:
                        ring += list(reversed(seg[:-1]))
                    elif ring[0] == seg[-1]:
                        ring = seg[:-1] + ring
                    elif ring[0] == seg[0]:
                        ring = list(reversed(seg[1:])) + ring
                    else:
                        continue
                    segments.pop(i)
                    changed = True
                    break
            if len(ring) >= 4 and ring[0] == ring[-1]:
                rings.append(ring[:-1])
        for ring in rings:
            pts = clip_ring([proj(lat, lon) for lat, lon in ring])
            if len(pts) < 3:
                continue
            pts = bm.simplify(pts, 8.0)
            if len(pts) < 3 or abs(bm.area2(pts)) < 1000:
                continue
            tris = bm.ear_clip(pts)
            if not tris:
                continue
            a = {'k': 'water', 'p': pts, 't': [i for tri in tris for i in tri],
                 'relation': rel['id']}
            if tags.get('name'):
                a['name'] = tags['name']
            out.append(a)
    return out


def areas():
    out = []
    for way in load('land'):
        tags = way.get('tags', {})
        kind = bm.area_kind(tags)
        pts = [proj(p['lat'], p['lon']) for p in way.get('geometry') or []]
        if not kind or len(pts) < 4:
            continue
        if pts[0] == pts[-1]:
            pts = pts[:-1]
        pts = clip_ring(pts)
        if len(pts) < 3:
            continue
        pts = bm.simplify(pts, 1.0 if kind in ('wood', 'park', 'water') else 0.6)
        if len(pts) < 3 or abs(bm.area2(pts)) < 20:
            continue
        tris = bm.ear_clip(pts)
        if not tris:
            continue
        a = {'k': kind, 'p': pts, 't': [i for tri in tris for i in tri]}
        if tags.get('name'):
            a['name'] = tags['name']
        out.append(a)
    out.extend(water_relations())
    return out


def pois():
    out, seen = [], set()
    for e in load('pois'):
        tags = e.get('tags', {})
        name = tags.get('name')
        if not name or name in seen:
            continue
        point = e.get('center') or e
        if 'lat' not in point or 'lon' not in point:
            continue
        x, z = proj(point['lat'], point['lon'])
        if not inside((x, z)):
            continue
        kind = (tags.get('amenity') or tags.get('shop') or tags.get('tourism')
                or tags.get('leisure') or tags.get('historic') or 'place')
        out.append({'name': name, 'k': kind, 'x': x, 'z': z})
        seen.add(name)
    return out


def main():
    # No period edits here: the 2004 rollback runs at import time in
    # src/game/period2004.js so it can reach the Aylmer and Hull sectors too,
    # whose generated modules this tool has no business rewriting.
    data = {'bounds': {'minX': MINX, 'maxX': MAXX, 'minZ': MINZ, 'maxZ': MAXZ},
            'roads': roads(), 'buildings': buildings(),
            'areas': areas(), 'pois': pois()}
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(OUT, 'w') as f:
        f.write('// GENERATED by tools/build_ottawa.py from OpenStreetMap data (ODbL),\n')
        f.write('// then rolled back to 2004 against the 2006 Census Road Network File.\n')
        f.write('// Downtown Ottawa east of the Hull seam: Parliament Hill, the canal,\n')
        f.write('// the Rideau Centre, the ByWard Market, the National Gallery.\n')
        f.write('export const OTTAWA_MAP = ' + text + ';\n')
    tri = sum(len(b['t']) for b in data['buildings']) // 3 * 2 \
        + sum(len(b['p']) for b in data['buildings']) * 2 \
        + sum(len(a['t']) for a in data['areas']) // 3
    print(f"Ottawa: {len(data['roads'])} roads, {len(data['buildings'])} buildings, "
          f"{len(data['areas'])} areas, {len(data['pois'])} POIs; "
          f"~{tri/1000:.0f}k tris; {len(text)/1e6:.1f} MB")



if __name__ == '__main__':
    main()
