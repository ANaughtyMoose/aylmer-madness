#!/usr/bin/env python3
"""Difference today's OpenStreetMap streets against the 2006 census road file.

The game is set in the summer of 2004. OSM is current, so every subdivision and
every ramp built since is in the map and should not be. Statistics Canada's 2006
Road Network File is the closest thing to period truth that exists as open data:
real surveyed Canadian street centrelines, two years after the setting, with the
names people used then.

Its geometry is much worse than OSM's — generalised, sometimes offset by tens of
metres — so it is never used as geometry. It is used to answer two questions:

    did this street exist in 2004?      (OSM arc with no 2006 counterpart)
    what was it called then?            (name that differs between the two)

Matching is geometric, not by name: sample each centreline every 25 m and ask
whether any 2006 arc passes within MATCH_R. Names are only compared afterwards,
on pairs that already agree in space, which keeps the four separate Champlains
in this map from matching each other.

    python3 tools/period_diff.py            # full report to stdout
    python3 tools/period_diff.py --json X   # machine-readable, for period.py
"""
import json, math, os, sys, unicodedata, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_map as bm

MATCH_R = 45.0          # metres; generous, because the 2006 geometry wanders
SAMPLE = 25.0           # metres between samples along a centreline
COVER = 0.35            # fraction of samples that must match to count as "existed"
MIN_LEN = 40.0          # ignore stubs shorter than this in both directions
CELL = 100.0

# Street-type words, both languages, so "Chemin Fraser" and "Fraser" compare
# equal. The 2006 file keeps the type in its own column; OSM writes it inline.
TYPES = {
    'ch', 'chemin', 'rue', 'av', 'ave', 'avenue', 'boul', 'boulevard', 'blvd',
    'prom', 'promenade', 'mtee', 'montee', 'rang', 'rg', 'imp', 'impasse',
    'place', 'pl', 'terrasse', 'terr', 'terrace', 'cercle', 'croissant',
    'street', 'st', 'road', 'rd', 'drive', 'dr', 'crescent', 'cres', 'court',
    'crt', 'ct', 'lane', 'ln', 'way', 'private', 'pvt', 'trail', 'path',
    'circle', 'cir', 'square', 'sq', 'parkway', 'pkwy', 'highway', 'hwy',
    'autoroute', 'aut', 'ridge', 'gate', 'walk', 'bridge', 'pont', 'allee',
    'allee', 'cote', 'ruelle', 'voie', 'link', 'loop', 'row', 'green', 'mews',
    'n', 's', 'e', 'w', 'north', 'south', 'east', 'west', 'nord', 'sud', 'est',
    'ouest', 'du', 'de', 'des', 'la', 'le', 'les', "d", "l", 'the', 'of',
}


def fold(s):
    """Lowercase, unaccent, strip punctuation — 'Chemin d’Aylmer' -> {aylmer}."""
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = ''.join(c if c.isalnum() else ' ' for c in s)
    return s


def core(s):
    """The identifying words of a street name, as a frozenset."""
    return frozenset(w for w in fold(s).split() if w and w not in TYPES)


def proj(lat, lon):
    return ((lon - bm.LONC) * bm.MX, -(lat - bm.LATC) * bm.MZ)


def load_rnf():
    """2006 arcs, projected, with a reconstructed full name."""
    with open(os.path.join(RAW, 'rnf_clip.json')) as f:
        arcs = json.load(f)
    out = []
    for a in arcs:
        pts = [proj(lat, lon) for lon, lat in a['pts']]
        if len(pts) < 2:
            continue
        out.append({'name': a['name'], 'type': a['type'], 'dir': a['dir'], 'pts': pts})
    return out


def load_osm():
    with open(os.path.join(RAW, 'osm_roads.json')) as f:
        return json.load(f)


def seg_grid(arcs):
    """Bucket every segment into a coarse grid for radius queries."""
    g = collections.defaultdict(list)
    for a in arcs:
        for p, q in zip(a['pts'], a['pts'][1:]):
            x0, x1 = sorted((p[0], q[0]))
            z0, z1 = sorted((p[1], q[1]))
            for i in range(int((x0 - MATCH_R) // CELL), int((x1 + MATCH_R) // CELL) + 1):
                for j in range(int((z0 - MATCH_R) // CELL), int((z1 + MATCH_R) // CELL) + 1):
                    g[(i, j)].append((p, q, a))
    return g


def near(grid, x, z, r):
    """Closest segment within r, and its arc. (distance, arc) or (inf, None)."""
    bd, ba = r * r, None
    for i in (int((x - r) // CELL), int(x // CELL), int((x + r) // CELL)):
        for j in (int((z - r) // CELL), int(z // CELL), int((z + r) // CELL)):
            for p, q, a in grid.get((i, j), ()):
                ex, ez = q[0] - p[0], q[1] - p[1]
                l2 = ex * ex + ez * ez or 1e-9
                t = max(0.0, min(1.0, ((x - p[0]) * ex + (z - p[1]) * ez) / l2))
                dx, dz = p[0] + ex * t - x, p[1] + ez * t - z
                d = dx * dx + dz * dz
                if d < bd:
                    bd, ba = d, a
    return math.sqrt(bd) if ba else math.inf, ba


def samples(pts):
    """Points every SAMPLE metres along a polyline, plus total length."""
    out, total, carry = [], 0.0, 0.0
    for p, q in zip(pts, pts[1:]):
        L = math.hypot(q[0] - p[0], q[1] - p[1])
        total += L
        while carry < L:
            t = carry / L if L else 0
            out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
            carry += SAMPLE
        carry -= L
    if not out and pts:
        out.append(pts[0])
    return out, total


def coverage(pts, grid):
    """Fraction of this line covered by the other era, and the arc it matched."""
    pts = [tuple(p) for p in pts]
    ss, total = samples(pts)
    hits, votes, byid = 0, collections.Counter(), {}
    for x, z in ss:
        _, a = near(grid, x, z, MATCH_R)
        if a is not None:
            hits += 1
            votes[id(a)] += 1
            byid[id(a)] = a
    best = byid[votes.most_common(1)[0][0]] if votes else None
    return (hits / len(ss) if ss else 0.0), total, best


def main():
    osm = load_osm()
    rnf = load_rnf()
    print(f'OSM roads: {len(osm)}    2006 arcs: {len(rnf)}', file=sys.stderr)

    grid_rnf = seg_grid(rnf)
    grid_osm = seg_grid([{'pts': [tuple(p) for p in r['p']], 'name': r['n']} for r in osm])

    # ---- OSM streets with no 2006 counterpart: built since ------------------
    # Tracked per name as flagged-vs-total metres. A street that the 2006 file
    # matches along most of its length but loses for one segment is a geometry
    # artefact, not a new street; only a name flagged along nearly all of its
    # length is evidence that it did not exist. Rue Principale in Aylmer trips
    # the per-segment test once and the per-name test never.
    stat = collections.defaultdict(
        lambda: {'len': 0.0, 'flag': 0.0, 'n': 0, 'nflag': 0, 'cls': set(), 'at': None})
    name_changed = {}
    for r in osm:
        # Parking aisles and driveways are not streets and the census never had
        # them; comparing them only generates noise.
        if r['c'] == 'service':
            continue
        cov, total, hit = coverage(r['p'], grid_rnf)
        if total < MIN_LEN:
            continue
        e = stat[r['n'] or '(unnamed)']
        e['len'] += total
        e['n'] += 1
        e['cls'].add(r['c'])
        if cov < COVER:
            e['flag'] += total
            e['nflag'] += 1
            e['at'] = e['at'] or [round(r['p'][0][0]), round(r['p'][0][1])]
        elif hit is not None and r['n']:
            a, b = core(r['n']), core(hit['name'])
            if a and b and a != b and not (a & b):
                key = (r['n'], hit['name'], hit['type'])
                name_changed.setdefault(key, [round(r['p'][0][0]), round(r['p'][0][1])])

    built_since = {k: v for k, v in stat.items() if v['nflag']}

    # ---- 2006 streets with no OSM counterpart: gone since -------------------
    # Only inside the OSM download footprint. Beyond it every 2006 arc is
    # trivially "missing", which says nothing about 2004 — Riverside Drive and
    # the Queensway are absent because we never downloaded them.
    xs = [p[0] for r in osm for p in r['p']]
    zs = [p[1] for r in osm for p in r['p']]
    bx0, bx1, bz0, bz1 = min(xs) + 300, max(xs) - 300, min(zs) + 300, max(zs) - 300
    gone_since = collections.defaultdict(lambda: {'len': 0.0, 'n': 0, 'at': None})
    for a in rnf:
        if not all(bx0 <= x <= bx1 and bz0 <= z <= bz1 for x, z in a['pts']):
            continue
        cov, total, _ = coverage(a['pts'], grid_osm)
        if total < MIN_LEN:
            continue
        if cov < COVER:
            nm = (a['name'] + ' ' + a['type']).strip() or '(unnamed)'
            e = gone_since[nm]
            e['len'] += total
            e['n'] += 1
            e['at'] = e['at'] or [round(a['pts'][0][0]), round(a['pts'][0][1])]

    print(f'\n=== IN OSM, NOT IN 2006 — built since ({len(built_since)} names) ===')
    print('   flagged/total metres; "all" means every segment of that name is new')
    for k, v in sorted(built_since.items(), key=lambda kv: -kv[1]['flag'])[:80]:
        frac = v['flag'] / v['len'] if v['len'] else 0
        tag = 'ALL ' if frac > 0.9 else '    '
        print(f"  {tag}{v['flag']:7.0f}/{v['len']:-7.0f} m  {str(k)[:46]:48s}"
              f" {','.join(sorted(v['cls']))[:22]:23s} at {v['at']}")

    print(f'\n=== IN 2006, NOT IN OSM — removed since ({len(gone_since)} names) ===')
    for k, v in sorted(gone_since.items(), key=lambda kv: -kv[1]['len'])[:40]:
        print(f"  {v['len']:8.0f} m  x{v['n']:<3} {str(k)[:52]:54s} at {v['at']}")

    print(f'\n=== NAME DIFFERS ({len(name_changed)}) ===')
    for (o, n, t), at in sorted(name_changed.items())[:80]:
        print(f'  OSM "{o}"  <-  2006 "{n} {t}"  at {at}')

    if '--json' in sys.argv:
        path = sys.argv[sys.argv.index('--json') + 1]
        with open(path, 'w') as f:
            json.dump({'built_since': {k: {**v, 'cls': sorted(v['cls'])}
                                       for k, v in built_since.items()},
                       'gone_since': dict(gone_since),
                       'name_changed': [{'osm': o, 'rnf': f'{n} {t}', 'at': at}
                                        for (o, n, t), at in name_changed.items()]},
                      f, indent=1, ensure_ascii=False)
        print(f'\nwrote {path}', file=sys.stderr)


if __name__ == '__main__':
    main()


# ---------------------------------------------------------------- deletion set

def deletions(osm, grid_rnf, exclude=()):
    """Per-way keys for streets confidently built after 2004.

    Emitted as (name, first point) so a partially-new street — Boulevard des
    Allumettières runs 20 km, of which 5.9 km is a 2007 alignment — loses only
    the segments the census file has never heard of, and keeps the older ones it
    was built over. A whole name is only dropped when every metre of it is new.
    """
    per = collections.defaultdict(lambda: {'len': 0.0, 'flag': 0.0, 'cls': set(), 'keys': []})
    for r in osm:
        if r['c'] == 'service':
            continue
        cov, total, _ = coverage(r['p'], grid_rnf)
        if total < MIN_LEN:
            continue
        e = per[r['n']]
        e['len'] += total
        e['cls'].add(r['c'])
        if cov < COVER:
            e['flag'] += total
            e['keys'].append([r['n'], round(r['p'][0][0], 1), round(r['p'][0][1], 1),
                              round(total)])
    out = []
    for name, e in per.items():
        if not name or name in exclude or not e['keys']:
            continue
        # Whole-name rule: every metre new, minor road, long enough to be a real
        # street rather than a survey artefact.
        if e['flag'] / e['len'] > 0.995 and e['cls'] <= {'residential', 'tertiary'} \
                and e['flag'] >= 150:
            out += e['keys']
    return out
