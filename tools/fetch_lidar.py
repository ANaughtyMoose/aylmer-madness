#!/usr/bin/env python3
"""Fetch the Québec classified LiDAR point cloud covering the Aylmer clip.

Source: Ministère des Ressources naturelles et des Forêts, open data, no login.
Project 2020_Outaouaisgatineau, density 10 pts/m² (measured ~18), classified
(class 2 = ground, class 6 = building), delivered as 1 km² LAZ tiles in
NAD83 / MTM zone 9 (EPSG:32189):

  listing  https://diffusion.mern.gouv.qc.ca/diffusion/RGQ/Lidar/
  tiles    https://diffusion.mern.gouv.qc.ca/diffusion/RGQ/Lidar/
           2020_Outaouaisgatineau_Lidar_Den10_DonneesClassifiees/Mtm9/Laz/
           20_<E_km><N_km>F09_DC.laz

The map clip (lat 45.378-45.410, lon -75.868 - -75.803) is MTM9
E 354297-359357, N 5026645-5030243, so tiles E 354..359 km x N 5026..5030 km:
30 tiles, ~2.2 GB, of which one (the south-west corner, in the river) 404s.

Everything lands in data/raw/lidar/ which is gitignored.

Reading LAZ needs laspy + lazrs; there is no pure-python path.  --venv builds
one at data/raw/venv rather than touching the system python.

Usage:
    python3 tools/fetch_lidar.py --venv       # create data/raw/venv + laspy
    python3 tools/fetch_lidar.py              # download the tiles
    python3 tools/fetch_lidar.py --core       # just the 4 dense-Aylmer tiles
    python3 tools/fetch_lidar.py --list       # print the URLs and exit
"""
import math
import os
import subprocess
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qcgrid import to_mtm9

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw')
LIDAR = os.path.join(RAW, 'lidar')
VENV = os.path.join(RAW, 'venv')

BASE = ('https://diffusion.mern.gouv.qc.ca/diffusion/RGQ/Lidar/'
        '2020_Outaouaisgatineau_Lidar_Den10_DonneesClassifiees/Mtm9/Laz/')

LAT0, LAT1 = 45.378, 45.410
LON0, LON1 = -75.868, -75.803

# The four tiles over the densest part of old Aylmer / Wychwood, if you want a
# quick partial run (~330 MB).
CORE = [(356, 5028), (357, 5028), (356, 5029), (357, 5029)]


def tiles():
    """1 km MTM9 tiles (E_km, N_km) whose square intersects the clip."""
    xs, ys = [], []
    for lat in (LAT0, LAT1):
        for lon in (LON0, LON1):
            x, y = to_mtm9(lat, lon)
            xs.append(x)
            ys.append(y)
    e0, e1 = int(math.floor(min(xs) / 1000)), int(math.floor(max(xs) / 1000))
    n0, n1 = int(math.floor(min(ys) / 1000)), int(math.floor(max(ys) / 1000))
    return [(e, n) for e in range(e0, e1 + 1) for n in range(n0, n1 + 1)]


def name(e, n):
    return f'20_{e:03d}{n:04d}F09_DC.laz'


def fetch(e, n):
    fn = name(e, n)
    path = os.path.join(LIDAR, fn)
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return 'have'
    url = BASE + fn
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'aylmer-madness/1.0'})
        with urllib.request.urlopen(req, timeout=900) as r, open(path + '.part', 'wb') as f:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
        os.replace(path + '.part', path)
        return 'ok'
    except urllib.error.HTTPError as ex:
        if os.path.exists(path + '.part'):
            os.remove(path + '.part')
        return f'HTTP {ex.code}'          # 404 = tile is all water / out of project


def make_venv():
    if not os.path.exists(os.path.join(VENV, 'bin', 'python3')):
        subprocess.check_call([sys.executable, '-m', 'venv', VENV])
    pip = os.path.join(VENV, 'bin', 'pip')
    subprocess.check_call([pip, 'install', '-q', '--upgrade', 'pip'])
    subprocess.check_call([pip, 'install', '-q', 'numpy', 'laspy[lazrs]'])
    print(f'venv ready: {os.path.relpath(VENV, ROOT)}/bin/python3', file=sys.stderr)


def main():
    args = sys.argv[1:]
    if '--venv' in args:
        os.makedirs(RAW, exist_ok=True)
        make_venv()
        return
    want = CORE if '--core' in args else tiles()
    if '--list' in args:
        for e, n in want:
            print(BASE + name(e, n))
        return
    os.makedirs(LIDAR, exist_ok=True)
    # The server gives ~270 kB/s per connection; eight at once makes 2.2 GB
    # a twenty-minute job instead of a two-hour one.
    from concurrent.futures import ThreadPoolExecutor
    done = 0
    total = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(fetch, e, n): (e, n) for e, n in want}
        for fu in futs:
            pass
        for fu, (e, n) in futs.items():
            st = fu.result()
            done += 1
            p = os.path.join(LIDAR, name(e, n))
            sz = os.path.getsize(p) if os.path.exists(p) else 0
            total += sz
            print(f'[{done}/{len(want)}] {name(e, n)} {st} {sz / 1e6:.0f} MB',
                  file=sys.stderr)
    print(f'lidar: {total / 1e6:.0f} MB in {os.path.relpath(LIDAR, ROOT)}', file=sys.stderr)


if __name__ == '__main__':
    main()
