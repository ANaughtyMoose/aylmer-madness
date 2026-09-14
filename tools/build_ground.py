#!/usr/bin/env python3
"""MTM9 ground raster -> game-frame height grid -> src/game/ground_data.js.

`lidar_roof.py --ground-only` rasterises class-2 LiDAR returns into
`data/raw/ground_8m.npy`, an 8 m float32 grid in MTM zone 9 (EPSG:32189):
row j increases NORTH, column i increases EAST, and the centre of cell (i, j)
sits at `x0 + (i + .5) * cell, y0 + (j + .5) * cell`. That is the surveyor's
frame. The game's frame is metres east and SOUTH of a lat/lon origin in the
middle of the Aylmer clip, and the two are not a translate-and-flip apart:
MTM 9 has about -0.47 deg of grid convergence here and its scale differs from
the game's crude equirectangular projection by 0.16 % east / 0.50 % north.
Resampling naively is roughly 20 m out at the corners of the clip, which on a
5 % slope is a metre of height error in the wrong place.

So every output node goes game (x, z) -> lat/lon (inverting build_map.proj)
-> qcgrid.to_mtm9 -> bilinear sample of the raster, clamped to the edge. That
absorbs the convergence and the scale difference exactly, at the cost of 283k
scalar calls into a pure-python projection: about two seconds, once, offline.

The output is a module rather than a field in mapdata.js so that re-running
build_map.py without the LiDAR on disk cannot silently drop the ground, and a
base64 Uint16 blob rather than a fetched binary so the README's "no assets to
download" promise survives — this is the same trick as the water mask
(build_map.py water_mask -> world.js waterAt).

    python tools/build_ground.py

Contract with src/game/ground.js (do not change one without the other):

    GROUND = { cell, w, h, x0, z0, min, datum, scale, b64 }

    node (i, j) is at game x = x0 + i * cell, z = z0 + j * cell
    value index      = j * w + i
    elevation metres = min + q * scale
    game y           = elevation - datum
"""
import base64
import datetime
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qcgrid import to_mtm9

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'raw', 'ground_8m')
OUT = os.path.join(ROOT, 'src', 'game', 'ground_data.js')

# Copied from tools/build_map.py:36-47 rather than imported: build_map.py reads
# data/*.json and writes mapdata.js at import time, so importing it here would
# be a side effect, not a dependency. These five numbers and the clip bounds
# they produce are the whole of the game's projection.
LAT0, LAT1 = 45.378, 45.410
LON0, LON1 = -75.868, -75.803
LATC, LONC = (LAT0 + LAT1) / 2, (LON0 + LON1) / 2   # 45.394, -75.8355
MX = 111320 * math.cos(math.radians(LATC))          # 78171.978 m per degree lon
MZ = 110574                                         # m per degree lat


def proj(lat, lon):
    """build_map.proj: lat/lon -> game metres, +X east, +Z south."""
    return (round((lon - LONC) * MX, 1), round(-(lat - LATC) * MZ, 1))


def unproj(x, z):
    """The inverse of proj, before its 0.1 m rounding."""
    return (LATC - z / MZ, LONC + x / MX)


MINX, MINZ = proj(LAT1, LON0)      # -2540.6, -1769.2
MAXX, MAXZ = proj(LAT0, LON1)      #  2540.6,  1769.2

CELL = 8.0
SCALE = 0.05                       # quantisation step, metres
DATUM_PCT = 2                      # the 2nd percentile is river-bank height
DATUM_DROP = 1.0                   # ... and the banks should sit 1 m above y=0


# ------------------------------------------------------------------ sampling

def sample(a, rx0, ry0, rcell, E, N):
    """Bilinear sample of `a` at MTM eastings E / northings N, clamp-to-edge.

    `a` is indexed [j, i] with the centre of (i, j) at rx0 + (i+.5)*rcell,
    ry0 + (j+.5)*rcell, so the continuous index of a point is offset by half a
    cell. Clamping the *index* rather than dropping out-of-range samples is
    what makes the grid defined over the whole clip even where the LiDAR does
    not reach; terrain.js fades the clamped edge value out over 400 m.
    """
    h, w = a.shape
    fi = np.clip((E - rx0) / rcell - 0.5, 0.0, w - 1.0)
    fj = np.clip((N - ry0) / rcell - 0.5, 0.0, h - 1.0)
    i0 = np.floor(fi).astype(np.int64).clip(0, w - 2 if w > 1 else 0)
    j0 = np.floor(fj).astype(np.int64).clip(0, h - 2 if h > 1 else 0)
    i1 = np.minimum(i0 + 1, w - 1)
    j1 = np.minimum(j0 + 1, h - 1)
    tx = fi - i0
    tz = fj - j0
    a = a.astype(np.float64)
    return ((a[j0, i0] * (1 - tx) + a[j0, i1] * tx) * (1 - tz)
            + (a[j1, i0] * (1 - tx) + a[j1, i1] * tx) * tz)


def project_nodes(w, h):
    """Game-frame node lattice -> MTM9 eastings/northings.

    to_mtm9 is scalar pure python, so this is the one slow loop in the script:
    w*h calls, a couple of seconds. Worth it — see the module docstring. lat
    depends only on the row and lon only on the column, so both are hoisted.
    """
    lats = np.array([unproj(0.0, MINZ + j * CELL)[0] for j in range(h)])
    lons = np.array([unproj(MINX + i * CELL, 0.0)[1] for i in range(w)])
    E = np.empty((h, w))
    N = np.empty((h, w))
    for j in range(h):
        lat = lats[j]
        rowE = E[j]
        rowN = N[j]
        for i in range(w):
            rowE[i], rowN[i] = to_mtm9(lat, lons[i])
    return E, N


# -------------------------------------------------------------------- report

def report(a, datum, nbytes, prov):
    """The four numbers docs/TOPOGRAPHY.md goes/no-goes on, over OUR grid.

    Same shape and the same 100 m span as lidar_roof.write_ground so the two
    can be compared line for line (that function also divides a 12-cell
    difference by a round 100 m rather than 96; kept, deliberately).
    """
    lo, hi = np.percentile(a, (2, 98))
    span = int(round(100 / CELL))
    gx = np.abs(a[:, span:] - a[:, :-span]) / 100
    gz = np.abs(a[span:, :] - a[:-span, :]) / 100
    steep = float(np.percentile(np.concatenate([gx.ravel(), gz.ravel()]), 99.5))
    verdict = ('FLAT: stop here, the height field is not worth building'
               if (hi - lo) < 10 and steep < 0.03 else
               'WORTH IT: build pieces 1 and 2, leave the roads flat, drive it')

    print('', file=sys.stderr)
    print(f'game ground   {a.shape[1]} x {a.shape[0]} @ {CELL:g} m nodes, '
          f'x {MINX:g}..{MAXX:g}  z {MINZ:g}..{MAXZ:g}', file=sys.stderr)
    print(f'  elevation     {a.min():.1f} to {a.max():.1f} m '
          f'(river is about 59)', file=sys.stderr)
    print(f'  relief        {hi - lo:.1f} m across the clip (2nd to 98th pct)',
          file=sys.stderr)
    print(f'  steepest      {steep * 100:.1f}% sustained over 100 m '
          f'(99.5th pct)', file=sys.stderr)
    print(f'  verdict       {verdict}', file=sys.stderr)
    print(f'  datum         {datum:.2f} m -> game y {a.min() - datum:.1f} to '
          f'{a.max() - datum:.1f} (water quad sits at 0.02)', file=sys.stderr)
    print(f'wrote {os.path.relpath(OUT, ROOT)}  {nbytes} bytes',
          file=sys.stderr)
    print(f'  source        {prov}', file=sys.stderr)


# ---------------------------------------------------------------------- main

def main():
    with open(SRC + '.json') as f:
        hd = json.load(f)
    raw = np.load(SRC + '.npy')
    if raw.shape != (hd['h'], hd['w']):
        sys.exit(f'header says {hd["w"]}x{hd["h"]}, npy is {raw.shape[1]}x{raw.shape[0]}')

    # How much of the raster is lidar_roof's median hole-fill? One constant
    # value repeated over most of the grid is the signature of a partial tile
    # download, and it is the single most important caveat about this build.
    vals, counts = np.unique(raw, return_counts=True)
    k = int(np.argmax(counts))
    fill_val, fill_frac = float(vals[k]), counts[k] / raw.size
    mtime = datetime.datetime.fromtimestamp(os.path.getmtime(SRC + '.npy'))
    prov = (f'data/raw/ground_8m.npy {hd["w"]}x{hd["h"]} @ {hd["cell"]:g} m '
            f'{hd["crs"]}, written {mtime:%Y-%m-%d %H:%M}, '
            f'{fill_frac * 100:.0f}% constant fill at {fill_val:.2f} m')

    w = int(math.ceil((MAXX - MINX) / CELL)) + 1     # 637
    h = int(math.ceil((MAXZ - MINZ) / CELL)) + 1     # 444
    E, N = project_nodes(w, h)
    elev = sample(raw, hd['x0'], hd['y0'], hd['cell'], E, N)

    emin = float(elev.min())
    datum = float(np.percentile(elev, DATUM_PCT)) - DATUM_DROP
    q = np.rint((elev - emin) / SCALE)
    if q.max() > 65535:
        sys.exit(f'{q.max() * SCALE:.1f} m of range will not fit in a uint16 at {SCALE} m')
    b64 = base64.b64encode(q.astype('<u2').tobytes()).decode()

    body = (
        f'// Generated by tools/build_ground.py — do not edit. {prov}.\n'
        f'// Node (i, j) is at game x = x0 + i * cell, z = z0 + j * cell; value\n'
        f'// index j * w + i; elevation m = min + q * scale; game y = elevation - datum.\n'
        f'export const GROUND = {{ cell: {CELL:g}, w: {w}, h: {h}, '
        f'x0: {MINX:g}, z0: {MINZ:g}, min: {emin:.9g}, datum: {datum:.9g}, '
        f"scale: {SCALE:g}, b64: '{b64}' }};\n")
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(body)

    report(elev, datum, len(body.encode('utf-8')), prov)
    if fill_frac > 0.02:
        print('', file=sys.stderr)
        print(f'  CAVEAT: {fill_frac * 100:.0f}% of the source raster is the constant '
              f'{fill_val:.2f} m median hole-fill, not measured ground.', file=sys.stderr)
        print('  The 30-tile LiDAR download is still running; rerun this script and',
              file=sys.stderr)
        print('  lidar_roof.py --ground-only when it lands. Numbers above are the',
              file=sys.stderr)
        print('  partial grid and will move.', file=sys.stderr)


if __name__ == '__main__':
    main()
