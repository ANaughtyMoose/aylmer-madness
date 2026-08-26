#!/usr/bin/env python3
"""Measure real roofs from the Québec classified LiDAR point cloud.

Run with the venv python built by `tools/fetch_lidar.py --venv` (it needs
laspy + lazrs + numpy):

    data/raw/venv/bin/python3 tools/lidar_roof.py

Reads every 1 km LAZ tile in data/raw/lidar/, burns two rasters over the whole
map clip in MTM9 (EPSG:32189) metres:

    ground   2.0 m cells, minimum z of class 2 + 8 (ground, model key point)
    roof     0.5 m cells, maximum z of *single-return* class 1 points

Note on classes: despite the "DonneesClassifiees" name, this MRNF product only
separates ground from everything else — the tiles contain classes 1, 2, 7 and
8 and **no class 6**.  So the roof surface is recovered the classic way
instead: a point whose pulse came back exactly once hit something solid, which
over a footprint is the roof.  Tree canopy mostly gives multiple returns and is
further suppressed by clipping heights at the footprint median + 6 m.

then, per OSM footprint, slices the roof raster, subtracts the local ground,
and derives:

    eave      25th percentile of roof height above ground
    ridge     95th percentile
    form      flat / shed / mansard / hip / gable
    ridgeYaw  direction of the ridge line, in the *map* frame — the same
              convention as build_map.py's 'a': atan2(dz, dx), 0 = +X east,
              positive turning toward +Z south, folded into [-pi/2, pi/2)
    garage    a lower, attached wing of at least 14 m²

Result is cached to data/raw/lidar_roofs.json so build_houses.py (which runs on
the system python) never needs laspy.  If the cache is absent, build_houses.py
just falls back to roll + shape and says so in the coverage stats.
"""
import glob
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qcgrid import to_mtm9

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIDAR = os.path.join(ROOT, 'data', 'raw', 'lidar')
OUT = os.path.join(ROOT, 'data', 'raw', 'lidar_roofs.json')

LAT0, LAT1 = 45.378, 45.410
LON0, LON1 = -75.868, -75.803

ROOF_CELL = 0.5
GND_CELL = 2.0
NODATA = -9999.0

FLAT_RANGE = 0.45       # p95 - p25 below this and the roof is flat
# (histogram of p95-p25 over all 10 304 Aylmer footprints has a true-flat spike
#  at 0.0-0.1 m, a trough at 0.25-0.35, then the pitched-roof mode from 0.8 up)
MIN_CELLS = 12
MIN_COVER = 0.30


# ---------------------------------------------------------------- raster grid

class Grid:
    def __init__(self, x0, y0, x1, y1, cell, fill):
        self.cell = cell
        self.x0, self.y0 = x0, y0
        self.w = int(math.ceil((x1 - x0) / cell)) + 1
        self.h = int(math.ceil((y1 - y0) / cell)) + 1
        self.a = np.full((self.h, self.w), fill, dtype=np.float32)

    def idx(self, x, y):
        i = ((x - self.x0) / self.cell).astype(np.int64)
        j = ((y - self.y0) / self.cell).astype(np.int64)
        ok = (i >= 0) & (i < self.w) & (j >= 0) & (j < self.h)
        return i, j, ok

    def accum_max(self, x, y, z):
        i, j, ok = self.idx(x, y)
        if not ok.any():
            return
        flat = (j[ok] * self.w + i[ok]).astype(np.int64)
        np.maximum.at(self.a.reshape(-1), flat, z[ok].astype(np.float32))

    def accum_min(self, x, y, z):
        i, j, ok = self.idx(x, y)
        if not ok.any():
            return
        flat = (j[ok] * self.w + i[ok]).astype(np.int64)
        np.minimum.at(self.a.reshape(-1), flat, z[ok].astype(np.float32))


def fill_holes(a, nodata, passes=14):
    """Iteratively replace nodata cells by the mean of valid 4-neighbours."""
    out = a.copy()
    for _ in range(passes):
        bad = out == nodata
        if not bad.any():
            break
        s = np.zeros_like(out)
        c = np.zeros_like(out)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(out, dy, 0), dx, 1)
            v = sh != nodata
            s[v] += sh[v]
            c[v] += 1
        fix = bad & (c > 0)
        out[fix] = s[fix] / c[fix]
    return out


# ---------------------------------------------------------------- footprints

def load_footprints():
    """OSM way id -> polygon in MTM9 metres (and its map-frame twin)."""
    with open(os.path.join(ROOT, 'data', 'buildings.json')) as f:
        els = json.load(f)['elements']
    out = []
    for w in els:
        g = w.get('geometry')
        if not g or len(g) < 4:
            continue
        if not all(LAT0 <= p['lat'] <= LAT1 and LON0 <= p['lon'] <= LON1 for p in g):
            continue
        pts = [to_mtm9(p['lat'], p['lon']) for p in g]
        if pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3:
            continue
        out.append((w['id'], pts))
    return out


def poly_mask(pts, x0, y0, cell, w, h):
    """Even-odd scanline fill of a polygon into a w x h boolean array."""
    m = np.zeros((h, w), dtype=bool)
    n = len(pts)
    for j in range(h):
        yc = y0 + (j + 0.5) * cell
        xs = []
        for i in range(n):
            ax, ay = pts[i]
            bx, by = pts[(i + 1) % n]
            if (ay <= yc < by) or (by <= yc < ay):
                xs.append(ax + (yc - ay) * (bx - ax) / (by - ay))
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            i0 = int(math.ceil((xs[k] - x0) / cell - 0.5))
            i1 = int(math.floor((xs[k + 1] - x0) / cell - 0.5))
            if i1 < 0 or i0 >= w:
                continue
            m[j, max(0, i0):min(w - 1, i1) + 1] = True
    return m


# ---------------------------------------------------------------- roof shape

def analyse(hx, hy, hz, area):
    """hx, hy: MTM9 metres of each valid cell centre. hz: height above ground."""
    n = len(hz)
    eave = float(np.percentile(hz, 25))
    ridge = float(np.percentile(hz, 95))
    rng = ridge - eave

    cx, cy = hx.mean(), hy.mean()
    ux, uy = hx - cx, hy - cy

    # Footprint principal axis (used as the ridge fallback and for the hip test)
    cov = np.cov(np.vstack([ux, uy]))
    _, evec = np.linalg.eigh(cov)
    ax, ay = evec[:, -1]                       # long axis of the footprint
    long_t = ux * ax + uy * ay

    res = {'n': n, 'eave': round(eave, 2), 'ridge': round(ridge, 2)}

    if rng < FLAT_RANGE:
        res['form'] = 'flat'
        res['yaw'] = _yaw(ax, ay)
        return res

    # Mono-pitch (shed): a single plane explains almost everything.
    A = np.vstack([ux, uy, np.ones(n)]).T
    coef, *_ = np.linalg.lstsq(A, hz, rcond=None)
    pred = A @ coef
    ss_res = float(((hz - pred) ** 2).sum())
    ss_tot = float(((hz - hz.mean()) ** 2).sum()) or 1.0
    slope = math.hypot(coef[0], coef[1])
    if 1 - ss_res / ss_tot > 0.72 and slope > 0.08:
        res['form'] = 'shed'
        # ridge runs across the slope
        res['yaw'] = _yaw(-coef[1], coef[0])
        return res

    # Ridge line: principal axis of the points near the top.  The band has to
    # be narrow — take the whole upper half and a hip's "ridge" reaches the
    # short ends too, and everything reads as a gable.
    hi = hz >= ridge - 0.28 * rng
    if hi.sum() >= 6:
        rx, ry = ux[hi], uy[hi]
        rcov = np.cov(np.vstack([rx - rx.mean(), ry - ry.mean()]))
        rev, rvec = np.linalg.eigh(rcov)
        # a genuine ridge is a line: one eigenvalue dominates
        if rev[-1] > 1e-6 and rev[0] / rev[-1] < 0.35:
            ax, ay = rvec[:, -1]
            long_t = ux * ax + uy * ay
    res['yaw'] = _yaw(ax, ay)

    # Mansard: a broad flat deck on top of steep sides.
    p50, p75 = (float(np.percentile(hz, q)) for q in (50, 75))
    if (ridge - p75) < 0.35 * rng and (p75 - p50) > 0.45 * rng and area > 90:
        res['form'] = 'mansard'
        return res

    # Hip vs gable: does the ridge reach the short ends of the footprint?
    # A gable's ridge runs the full length, so the shortfall is ~0.  A hip's
    # ends slope in by about half the building's width each, so the shortfall
    # is ~ width/length — which is why the test is scaled by the aspect ratio
    # instead of a fixed fraction (a 6 x 18 m terrace and a 10 x 11 m bungalow
    # do not have the same "short" end).
    if hi.sum() >= 6:
        cross_t = -ux * ay + uy * ax
        span = long_t.max() - long_t.min()
        cross = cross_t.max() - cross_t.min()
        shortfall = ((long_t[hi].min() - long_t.min())
                     + (long_t.max() - long_t[hi].max()))
        if span > 1e-6:
            res['form'] = 'hip' if shortfall / span > 0.5 * (cross / span) \
                else 'gable'
        else:
            res['form'] = 'gable'
    else:
        res['form'] = 'gable'
    return res


def _yaw(dx, dy):
    """MTM9 direction vector -> map-frame yaw, atan2(dz, dx), folded to a line.

    The map frame is +X east, +Z south; MTM9 is +E east, +N north.  So a
    direction (dE, dN) becomes (dx, dz) = (dE, -dN).  Grid convergence between
    MTM 9 and true north is under 0.5 deg over Aylmer, ignored.
    """
    a = math.atan2(-dy, dx)
    for _ in range(2):                      # rounding can push -pi/2 back out
        while a < -math.pi / 2:
            a += math.pi
        while a >= math.pi / 2:
            a -= math.pi
        a = round(a, 3)
    return a


def garage_wing(mask, hz_grid, eave, ridge):
    """A contiguous lower block of >= 14 m^2 attached to the main mass."""
    low = mask & (hz_grid > 0.8) & (hz_grid < max(2.6, eave * 0.78))
    cells = int(low.sum())
    if cells * ROOF_CELL * ROOF_CELL < 14:
        return False
    # must be a block, not scattered fringe cells: erode once and see if it lives
    er = low.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        er &= np.roll(np.roll(low, dy, 0), dx, 1)
    return int(er.sum()) * ROOF_CELL * ROOF_CELL >= 8


# ---------------------------------------------------------------- main

def main():
    tiles = sorted(glob.glob(os.path.join(LIDAR, '*.laz')))
    if not tiles:
        print(f'no LAZ tiles in {os.path.relpath(LIDAR, ROOT)} — '
              f'run tools/fetch_lidar.py first', file=sys.stderr)
        return 1
    import laspy

    xs, ys = [], []
    for lat in (LAT0, LAT1):
        for lon in (LON0, LON1):
            x, y = to_mtm9(lat, lon)
            xs.append(x)
            ys.append(y)
    x0, x1 = min(xs) - 20, max(xs) + 20
    y0, y1 = min(ys) - 20, max(ys) + 20

    roof = Grid(x0, y0, x1, y1, ROOF_CELL, NODATA)
    gnd = Grid(x0, y0, x1, y1, GND_CELL, 1e9)
    print(f'roof grid {roof.w}x{roof.h} @ {ROOF_CELL} m '
          f'({roof.a.nbytes / 1e6:.0f} MB), ground {gnd.w}x{gnd.h}', file=sys.stderr)

    nb = ng = 0
    for t in tiles:
        with laspy.open(t) as fh:
            for pts in fh.chunk_iterator(4_000_000):
                cls = np.asarray(pts.classification)
                px = np.asarray(pts.x)
                py = np.asarray(pts.y)
                pz = np.asarray(pts.z)
                m = (cls == 1) & (np.asarray(pts.number_of_returns) == 1)
                if m.any():
                    roof.accum_max(px[m], py[m], pz[m])
                    nb += int(m.sum())
                m = (cls == 2) | (cls == 8)
                if m.any():
                    gnd.accum_min(px[m], py[m], pz[m])
                    ng += int(m.sum())
        print(f'  {os.path.basename(t)}  building {nb / 1e6:.1f}M  '
              f'ground {ng / 1e6:.1f}M', file=sys.stderr)

    gnd.a[gnd.a > 1e8] = NODATA
    gnd.a = fill_holes(gnd.a, NODATA)
    gnd.a[gnd.a == NODATA] = float(np.median(gnd.a[gnd.a != NODATA]))

    out = {}
    fps = load_footprints()
    stats = {'flat': 0, 'shed': 0, 'gable': 0, 'hip': 0, 'mansard': 0}
    for wid, pts in fps:
        pxs = [p[0] for p in pts]
        pys = [p[1] for p in pts]
        bx0, bx1 = min(pxs), max(pxs)
        by0, by1 = min(pys), max(pys)
        i0 = max(0, int((bx0 - roof.x0) / ROOF_CELL) - 1)
        j0 = max(0, int((by0 - roof.y0) / ROOF_CELL) - 1)
        i1 = min(roof.w, int((bx1 - roof.x0) / ROOF_CELL) + 2)
        j1 = min(roof.h, int((by1 - roof.y0) / ROOF_CELL) + 2)
        if i1 - i0 < 2 or j1 - j0 < 2:
            continue
        sub = roof.a[j0:j1, i0:i1]
        ox = roof.x0 + i0 * ROOF_CELL
        oy = roof.y0 + j0 * ROOF_CELL
        mask = poly_mask(pts, ox, oy, ROOF_CELL, i1 - i0, j1 - j0)
        ncell = int(mask.sum())
        if ncell < MIN_CELLS:
            continue
        valid = mask & (sub > NODATA + 1)
        nvalid = int(valid.sum())
        if nvalid < MIN_CELLS or nvalid / ncell < MIN_COVER:
            continue

        gi0 = max(0, int((bx0 - 8 - gnd.x0) / GND_CELL))
        gj0 = max(0, int((by0 - 8 - gnd.y0) / GND_CELL))
        gi1 = min(gnd.w, int((bx1 + 8 - gnd.x0) / GND_CELL) + 1)
        gj1 = min(gnd.h, int((by1 + 8 - gnd.y0) / GND_CELL) + 1)
        gsub = gnd.a[gj0:gj1, gi0:gi1]
        ground = float(np.median(gsub)) if gsub.size else float(np.median(gnd.a))

        jj, ii = np.nonzero(valid)
        hx = ox + (ii + 0.5) * ROOF_CELL
        hy = oy + (jj + 0.5) * ROOF_CELL
        hz = sub[valid].astype(np.float64) - ground
        keep = (hz > 1.2) & (hz < 60)
        if keep.sum() < MIN_CELLS:
            continue
        hx, hy, hz = hx[keep], hy[keep], hz[keep]
        # Overhanging canopy: a roof never rises 6 m above its own median.
        med = float(np.median(hz))
        keep = hz <= med + 6.0
        if keep.sum() < MIN_CELLS:
            continue
        hx, hy, hz = hx[keep], hy[keep], hz[keep]

        area = ncell * ROOF_CELL * ROOF_CELL
        r = analyse(hx, hy, hz, area)
        hgrid = np.zeros_like(sub, dtype=np.float64)
        hgrid[valid] = sub[valid].astype(np.float64) - ground
        r['garage'] = bool(garage_wing(valid, hgrid, r['eave'], r['ridge']))
        r['cover'] = round(nvalid / ncell, 2)
        stats[r['form']] += 1
        out[str(wid)] = r

    with open(OUT, 'w') as f:
        json.dump({'cell': ROOF_CELL, 'tiles': len(tiles), 'roofs': out}, f,
                  separators=(',', ':'))
    print(f'lidar: {len(out)} of {len(fps)} footprints measured; {stats}',
          file=sys.stderr)
    print(f'wrote {os.path.relpath(OUT, ROOT)}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
