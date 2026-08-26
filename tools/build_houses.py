#!/usr/bin/env python3
"""Build data/houses.json — one record of legally-open attributes per house.

Three sources, in decreasing authority:

  roll   Québec rôle d'évaluation foncière 2026, Gatineau (MAMH, CC-BY 4.0).
         Année de construction, nombre d'étages, genre de construction, lien
         physique, nombre de logements.  See tools/fetch_roll.py.
  lidar  MRNF 2020 point cloud, single-return hard surfaces over the ground
         model.  Eave and ridge height, roof form, ridge direction, attached
         garage wing.  See tools/fetch_lidar.py + tools/lidar_roof.py.
  shape  Always available: footprint area, minimum-area rectangle, shared
         walls with neighbours, setback from the nearest road centreline,
         plus the neighbourhood priors in tools/houses_priors.py.

Anything the roll and the LiDAR do not answer is filled from shape + priors,
deterministically (seeded on the OSM way id) so neighbours differ but the file
is reproducible.  The 'src' flags on every record say which sources actually
contributed.

    python3 tools/fetch_roll.py
    python3 tools/fetch_lidar.py && data/raw/venv/bin/python3 tools/lidar_roof.py
    python3 tools/build_houses.py          # -> data/houses.json
"""
import collections
import hashlib
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_map as bm
import houses_priors as pri
from houses_addr import osm_street_keys, roll_street_aliases, house_numbers

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
RAW = os.path.join(DATA, 'raw')
OUT = os.path.join(DATA, 'houses.json')

# build_map.classify() calls any untagged 180-600 m² footprint 'commercial';
# in Aylmer 537 of those 727 are dwellings according to the roll's CUBF, so we
# also emit a house record whenever the roll says the unit is residential
# (code d'utilisation prédominante 1000-1999).
RESIDENTIAL = {'house', 'terrace', 'apartments'}
MAYBE_RESIDENTIAL = {'commercial', 'big'}

ERAS = (('old', 1945), ('midcentury', 1969), ('suburban', 1999), ('modern', 9999))
STOREY_STEPS = (1, 1.5, 2, 2.5, 3)


def era_of(year):
    for name, hi in ERAS:
        if year <= hi:
            return name
    return 'modern'


def rnd(wid, salt):
    """Deterministic 0..1 from an OSM way id."""
    h = hashlib.md5(f'{wid}:{salt}'.encode()).hexdigest()[:8]
    return int(h, 16) / 0xffffffff


# ------------------------------------------------------------------ geometry

def convex_hull(pts):
    p = sorted(set(pts))
    if len(p) < 3:
        return p
    def half(seq):
        out = []
        for q in seq:
            while len(out) >= 2:
                a, b = out[-2], out[-1]
                if (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) <= 0:
                    out.pop()
                else:
                    break
            out.append(q)
        return out
    return half(p)[:-1] + half(reversed(p))[:-1]


def min_area_rect(pts):
    """-> (length, width, angle of the long side) with length >= width."""
    hull = convex_hull(pts)
    if len(hull) < 3:
        return 0.0, 0.0, 0.0
    best = None
    n = len(hull)
    for i in range(n):
        ax, az = hull[i]
        bx, bz = hull[(i + 1) % n]
        ex, ez = bx - ax, bz - az
        ln = math.hypot(ex, ez)
        if ln < 1e-9:
            continue
        ex, ez = ex / ln, ez / ln
        us = [p[0] * ex + p[1] * ez for p in hull]
        vs = [-p[0] * ez + p[1] * ex for p in hull]
        w = max(us) - min(us)
        h = max(vs) - min(vs)
        if best is None or w * h < best[0]:
            best = (w * h, w, h, math.atan2(ez, ex))
    _, w, h, ang = best
    if w >= h:
        return w, h, ang
    return h, w, ang + math.pi / 2


def fold(a):
    """Fold a direction into [-pi/2, pi/2) — a ridge line has no head or tail."""
    while a < -math.pi / 2:
        a += math.pi
    while a >= math.pi / 2:
        a -= math.pi
    return a


def yaw3(a):
    """Fold, round to 3 dp, and fold again — rounding can push -pi/2 out."""
    return fold(round(fold(a), 3))


def poly_dist2(a, b):
    """Squared distance between two small polygons (vertex-to-segment)."""
    best = 1e18
    for pa, pb in ((a, b), (b, a)):
        for p in pa:
            for i in range(len(pb)):
                q, r = pb[i], pb[(i + 1) % len(pb)]
                dx, dz = r[0] - q[0], r[1] - q[1]
                d2 = dx * dx + dz * dz
                t = 0.0
                if d2 > 0:
                    t = max(0.0, min(1.0, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dz) / d2))
                ex, ez = p[0] - (q[0] + t * dx), p[1] - (q[1] + t * dz)
                best = min(best, ex * ex + ez * ez)
    return best


class Hash:
    """Uniform grid bucket index."""
    def __init__(self, cell):
        self.cell = cell
        self.g = collections.defaultdict(list)

    def add(self, x0, z0, x1, z1, item):
        for i in range(int(x0 // self.cell), int(x1 // self.cell) + 1):
            for j in range(int(z0 // self.cell), int(z1 // self.cell) + 1):
                self.g[(i, j)].append(item)

    def near(self, x, z, r=0):
        out = []
        i0, i1 = int((x - r) // self.cell), int((x + r) // self.cell)
        j0, j1 = int((z - r) // self.cell), int((z + r) // self.cell)
        for i in range(i0, i1 + 1):
            for j in range(j0, j1 + 1):
                out.extend(self.g.get((i, j), ()))
        return out


# ------------------------------------------------------------------ the roll

def load_roll():
    path = os.path.join(RAW, 'roll_aylmer.json')
    if not os.path.exists(path):
        print('! data/raw/roll_aylmer.json missing — run tools/fetch_roll.py',
              file=sys.stderr)
        return {}
    with open(path) as f:
        units = json.load(f)['units']
    idx = collections.defaultdict(list)
    for u in units:
        for a in u['a']:
            for tier, alias in enumerate(roll_street_aliases(a['n'])):
                if not alias:
                    continue
                for num in a['nums']:
                    idx[(tier, alias, num)].append(u)
    # tier 4: street-name prefix, for OSM's truncated "Rue de la Terrasse"
    prefix = collections.defaultdict(set)
    for (tier, alias, num), us in list(idx.items()):
        if tier:
            continue
        head = alias.split(' ')[0]
        if head != alias:
            prefix[(head, num)].add(alias)
    return {'idx': idx, 'prefix': prefix}


def _score(u):
    """Prefer the main residential unit when several share an address."""
    s = 0
    if u.get('RL0105A') == '1000':
        s += 4
    if u.get('RL0309A') != '5':
        s += 2
    if u.get('RL0307A'):
        s += 1
    return s


def roll_lookup(roll, street, housenumber):
    if not roll or not street or not housenumber:
        return None
    keys = osm_street_keys(street)
    nums = house_numbers(housenumber)
    if not keys or not nums:
        return None
    for tier in range(4):
        for k in keys:
            for n in nums:
                hit = roll['idx'].get((tier, k, n))
                if hit:
                    return max(hit, key=_score)
    for k in keys:
        for n in nums:
            cand = roll['prefix'].get((k, n))
            if cand and len(cand) == 1:
                hit = roll['idx'].get((0, next(iter(cand)), n))
                if hit:
                    return max(hit, key=_score)
    return None


def roll_storeys(u):
    """Roll genre de construction + nombre d'étages -> our storey ladder."""
    try:
        n = int(u.get('RL0306A') or 0)
    except ValueError:
        n = 0
    genre = u.get('RL0310A')
    if genre == '1' or genre == '3':          # plain-pied / unimodulaire
        return 1
    if genre == '2':                          # à niveaux décalés (split-level)
        return 1.5
    if genre == '4':                          # à étage mansardé (storey-and-a-half)
        return 1.5 if n <= 2 else 2.5
    if genre == '5':                          # à étages entiers
        return min(3, max(1, n)) if n else 2
    if n:
        return min(3, max(1, n))
    return None


ROLL_LINK = {'1': 'detached', '2': 'semi', '3': 'row', '4': 'row', '5': 'apartment'}


# ------------------------------------------------------------------ main

def main():
    roll = load_roll()
    lidar = {}
    lpath = os.path.join(RAW, 'lidar_roofs.json')
    if os.path.exists(lpath):
        with open(lpath) as f:
            lidar = json.load(f)['roofs']
    else:
        print('! data/raw/lidar_roofs.json missing — run tools/fetch_lidar.py '
              'then data/raw/venv/bin/python3 tools/lidar_roof.py', file=sys.stderr)

    # --- footprints, filtered exactly the way build_map.build_buildings does
    feats = []
    for w in bm.load('buildings.json'):
        t = w.get('tags', {})
        pts = [bm.proj(g['lat'], g['lon']) for g in w['geometry']]
        if pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3 or not all(bm.inside(p) for p in pts):
            continue
        pts = bm.simplify(pts, 0.6)
        if len(pts) < 3:
            continue
        area = abs(bm.area2(pts))
        if area < 9:
            continue
        kind = bm.classify(t, area)
        if kind == 'shed' and area < 14:
            continue
        lat = sum(g['lat'] for g in w['geometry']) / len(w['geometry'])
        lon = sum(g['lon'] for g in w['geometry']) / len(w['geometry'])
        feats.append({
            'id': w['id'], 'kind': kind, 'pts': pts, 'area': area, 'tags': t,
            'cx': sum(p[0] for p in pts) / len(pts),
            'cz': sum(p[1] for p in pts) / len(pts),
            'lat': lat, 'lon': lon,
        })
    print(f'footprints: {len(feats)}', file=sys.stderr)

    # --- shared walls
    fh = Hash(30)
    for f in feats:
        xs = [p[0] for p in f['pts']]
        zs = [p[1] for p in f['pts']]
        f['bb'] = (min(xs), min(zs), max(xs), max(zs))
        fh.add(*f['bb'], f)
    for f in feats:
        f['adj'] = 0
        f['near_shed'] = False
        f['row_dir'] = None
        rowv = [0.0, 0.0]           # doubled-angle sum, so a line averages right
        x0, z0, x1, z1 = f['bb']
        for g in fh.near(f['cx'], f['cz'], 30):
            if g is f:
                continue
            gx0, gz0, gx1, gz1 = g['bb']
            if gx0 > x1 + 1.2 or gx1 < x0 - 1.2 or gz0 > z1 + 1.2 or gz1 < z0 - 1.2:
                if (g['area'] < 75 and g['kind'] in ('shed', 'house')
                        and not g['tags'].get('addr:housenumber')
                        and math.hypot(g['cx'] - f['cx'], g['cz'] - f['cz']) < 26):
                    f['near_shed'] = True
                continue
            if poly_dist2(f['pts'], g['pts']) < 0.36:
                f['adj'] += 1
                # A neighbour you share a wall with sits beside you *along the
                # row*, and a terrace's ridge runs along the row — which is
                # 90 deg from each unit's own longest edge.  The LiDAR shows
                # this is what really happens on 645 of 780 Aylmer semis.
                a = 2 * math.atan2(g['cz'] - f['cz'], g['cx'] - f['cx'])
                rowv[0] += math.cos(a)
                rowv[1] += math.sin(a)
            elif (g['area'] < 75 and not g['tags'].get('addr:housenumber')
                  and g['kind'] in ('shed', 'house')):
                f['near_shed'] = True
        if f['adj'] and math.hypot(*rowv) > 0.4:
            f['row_dir'] = fold(0.5 * math.atan2(rowv[1], rowv[0]))

    # --- setback from the nearest road centreline
    rh = Hash(60)
    for w in bm.load('roads.json'):
        tg = w.get('tags', {})
        if not bm.ROAD_CLASS.get(tg.get('highway')):
            continue
        if tg.get('service') in ('driveway', 'parking_aisle'):
            continue
        pts = [bm.proj(g['lat'], g['lon']) for g in w['geometry']]
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            rh.add(min(a[0], b[0]), min(a[1], b[1]),
                   max(a[0], b[0]), max(a[1], b[1]), (a, b))
    for f in feats:
        best = 1e18
        for a, b in rh.near(f['cx'], f['cz'], 60):
            dx, dz = b[0] - a[0], b[1] - a[1]
            d2 = dx * dx + dz * dz
            t = 0.0
            if d2 > 0:
                t = max(0.0, min(1.0, ((f['cx'] - a[0]) * dx + (f['cz'] - a[1]) * dz) / d2))
            ex = f['cx'] - (a[0] + t * dx)
            ez = f['cz'] - (a[1] + t * dz)
            best = min(best, ex * ex + ez * ez)
        f['setback'] = round(math.sqrt(best), 1) if best < 1e17 else 999.0

    # --- pass 1: what the roll says about each street, so an unmatched house
    #     inherits its own street's median year rather than a whole
    #     neighbourhood's.  This is what actually rescues the odd new-build.
    street_years = collections.defaultdict(list)
    for f in feats:
        st = f['tags'].get('addr:street')
        if not st:
            continue
        u = roll_lookup(roll, st, f['tags'].get('addr:housenumber'))
        f['roll'] = u
        if u and u.get('RL0307A'):
            try:
                y = int(u['RL0307A'])
                if 1600 <= y <= 2050:
                    street_years[osm_street_keys(st)[0]].append(y)
            except ValueError:
                pass
    street_year = {k: sorted(v)[len(v) // 2]
                   for k, v in street_years.items() if len(v) >= 3}

    # --- compose
    houses = {}
    cov = collections.Counter()
    for f in feats:
        wid = f['id']
        tags = f['tags']
        street = tags.get('addr:street')
        hn = tags.get('addr:housenumber')
        u = f.get('roll') if 'roll' in f else roll_lookup(roll, street, hn)
        if f['kind'] not in RESIDENTIAL:
            cubf = (u or {}).get('RL0105A') or ''
            if not (f['kind'] in MAYBE_RESIDENTIAL and cubf[:1] == '1'):
                continue
        lid = lidar.get(str(wid))
        L, W, ang = min_area_rect(f['pts'])
        area = f['area']
        skey = osm_street_keys(street)[0] if street else ''
        hood, prior_era, prior_year = pri.lookup(skey, f['lat'], f['lon'])

        # -- year / era
        year = None
        if u and u.get('RL0307A'):
            try:
                y = int(u['RL0307A'])
                if 1600 <= y <= 2050:
                    year = y
            except ValueError:
                pass
        if year:
            era = era_of(year)
        elif skey in street_year:
            era = era_of(street_year[skey])
            cov['street_year'] += 1
        else:
            era = prior_era

        # -- storeys
        storeys = roll_storeys(u) if u else None
        if storeys is None and lid:
            e = lid['eave']
            storeys = 1 if e <= 4 else 1.5 if e <= 5.5 else 2 if e <= 7.5 else 3
        if storeys is None:
            storeys = 2 if f['kind'] != 'house' else (
                1 if era in ('cottage', 'midcentury') else 2)
        storeys = min(STOREY_STEPS, key=lambda s: abs(s - storeys))

        # -- cottage override (docs/HOUSES.md): small 1-storey by the river
        if (storeys == 1 and area <= 75
                and (hood == 'deschenes' or pri.river_side(f['lat'], f['lon']))):
            era = 'cottage'

        # -- link
        link = None
        if u and u.get('RL0309A') in ROLL_LINK:
            link = ROLL_LINK[u['RL0309A']]
            if link == 'apartment' and f['adj'] >= 1 and storeys <= 2:
                link = 'row'          # stacked-title townhouse, not a walk-up
        if f['kind'] == 'apartments':
            link = 'apartment'
        elif f['kind'] == 'terrace':
            link = 'row'
        if link is None:
            link = 'detached' if f['adj'] == 0 else 'semi' if f['adj'] == 1 else 'row'

        # -- roof, ridge direction, heights
        src_lidar = False
        if lid and lid.get('form'):
            roof = lid['form']
            ridge_yaw = lid['yaw']
            eave = max(2.4, min(40.0, lid['eave']))
            # The eave is the 25th percentile of the roof surface, so a low
            # attached wing (garage, sunroom, rear addition) drags it down —
            # 11 % of the roll's two-storey houses came out under 4.4 m.  The
            # roll knows the storey count, so let it veto the clear outliers
            # while keeping the measured ridge.
            if u and eave < storeys * 2.2:
                eave = storeys * 2.85 + 0.55
                cov['eave_from_storeys'] += 1
            ridge_h = None if roof == 'flat' else max(eave + 0.3,
                                                      min(45.0, lid['ridge']))
            src_lidar = True
        else:
            if link in ('semi', 'row') and f['row_dir'] is not None:
                ridge_yaw = round(f['row_dir'], 3)
            else:
                ridge_yaw = round(fold(ang), 3)
            roof = pick_roof(wid, era, link, storeys, area)
            eave = round(storeys * 2.85 + 0.55, 2)
            ridge_h = None
            if roof != 'flat':
                pitch = 0.75 if roof == 'mansard' else 0.30 if roof == 'shed' else 0.52
                ridge_h = round(eave + min(W, 13.0) * 0.5 * pitch, 2)
            eave = round(eave, 2)

        # -- garage
        garage = 'none'
        if lid and lid.get('garage') and link in ('detached', 'semi'):
            garage = 'attached'
        elif f['near_shed'] and link != 'apartment':
            garage = 'detached'
        elif link in ('detached', 'semi'):
            r = rnd(wid, 'g')
            fill = area / (L * W) if L * W > 1 else 1.0
            if era in ('suburban', 'modern'):
                garage = 'attached' if (area >= 105 or fill < 0.86 or r < 0.55) else 'none'
            elif era == 'midcentury':
                garage = 'carport' if r < 0.22 else 'attached' if r < 0.42 else 'none'
            elif era == 'old':
                garage = 'detached' if r < 0.28 else 'none'
        elif link == 'row' and era == 'modern':
            garage = 'attached' if rnd(wid, 'g') < 0.6 else 'none'

        # -- porch
        pr = {'old': 0.85, 'cottage': 0.62, 'midcentury': 0.32,
              'suburban': 0.28, 'modern': 0.42}[era]
        if link == 'apartment':
            pr = 0.1
        porch = rnd(wid, 'p') < pr

        houses[str(wid)] = {
            'era': era,
            'year': year,
            'storeys': storeys,
            'link': link,
            'roof': roof,
            'ridgeYaw': yaw3(ridge_yaw),
            'height': round(eave, 2),
            'ridgeHeight': None if ridge_h is None else round(ridge_h, 2),
            'garage': garage,
            'porch': bool(porch),
            'src': {'roll': bool(u), 'lidar': src_lidar, 'shape': True},
        }
        cov['total'] += 1
        if u:
            cov['roll'] += 1
        if year:
            cov['roll_year'] += 1
        if src_lidar:
            cov['lidar'] += 1
        if not u and not src_lidar:
            cov['shape_only'] += 1
        cov['hood:' + hood] += 1
        cov['era:' + era] += 1
        cov['roof:' + roof] += 1
        cov['link:' + link] += 1
        cov['garage:' + garage] += 1

    with open(OUT, 'w') as f:
        json.dump(houses, f, ensure_ascii=False, separators=(',', ':'),
                  sort_keys=True)

    t = cov['total'] or 1
    print(f'houses: {t}', file=sys.stderr)
    print(f'  roll        {cov["roll"]:6d}  {cov["roll"] / t:6.1%}'
          f'   (with a real year: {cov["roll_year"]}, {cov["roll_year"] / t:.1%})',
          file=sys.stderr)
    print(f'  lidar       {cov["lidar"]:6d}  {cov["lidar"] / t:6.1%}', file=sys.stderr)
    print(f'  shape only  {cov["shape_only"]:6d}  {cov["shape_only"] / t:6.1%}',
          file=sys.stderr)
    print(f'  era from the street median (no roll hit): {cov["street_year"]}; '
          f'lidar eave overruled by the roll storeys: {cov["eave_from_storeys"]}',
          file=sys.stderr)
    for pfx in ('era', 'link', 'roof', 'garage', 'hood'):
        row = sorted(((k.split(':', 1)[1], v) for k, v in cov.items()
                      if k.startswith(pfx + ':')), key=lambda kv: -kv[1])
        print(f'  {pfx:7s} ' + '  '.join(f'{k}={v}' for k, v in row), file=sys.stderr)
    print(f'wrote {os.path.relpath(OUT, ROOT)} '
          f'({os.path.getsize(OUT) / 1e6:.2f} MB)', file=sys.stderr)


def pick_roof(wid, era, link, storeys, area):
    if link == 'apartment' or area > 600 or storeys >= 3:
        return 'flat'
    r = rnd(wid, 'roof')
    if era == 'old':
        return 'mansard' if r < 0.07 else 'hip' if r < 0.24 else 'gable'
    if era == 'midcentury':
        return 'gable' if r < 0.28 else 'hip'
    if era == 'cottage':
        return 'gable' if r < 0.88 else 'hip'
    if era == 'suburban':
        return 'hip' if r < 0.33 else 'gable'
    return 'hip' if r < 0.38 else 'gable'


if __name__ == '__main__':
    main()
