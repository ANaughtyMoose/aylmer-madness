#!/usr/bin/env python3
"""Pull the downtown-Ottawa strip east of the Hull seam from the Overpass API.

The Highway to Hull extract stops dead at lon -75.690 (tools/build_hull.py),
which slices the Rideau Centre and the ByWard Market in half. This fetches the
same five query shapes the data/hull_*.json files came from, for the strip that
carries Parliament Hill's east flank, the canal, the market and Sandy Hill's
western blocks.

Output lands in data/raw/ (gitignored). tools/build_ottawa.py turns it into the
committed src/game/ottawa_mapdata.js; nothing here needs to be kept in git.
"""
import json, os, sys, time, urllib.request, urllib.error, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw')

# The download strip. Slightly wider than the clip rectangle in build_ottawa.py
# on every side so ways crossing the seam arrive whole and the clipper — not the
# server — decides where the world ends.
LAT0, LAT1 = 45.3930, 45.4560
LON0, LON1 = -75.6920, -75.6580
BBOX = f'{LAT0},{LON0},{LAT1},{LON1}'

ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]

QUERIES = {
    'ottawa_roads': f"""[out:json][timeout:300];
way["highway"]({BBOX});
out geom;""",

    'ottawa_buildings': f"""[out:json][timeout:300];
way["building"]({BBOX});
out geom;""",

    'ottawa_land': f"""[out:json][timeout:300];
(
  way["natural"]({BBOX});
  way["landuse"]({BBOX});
  way["leisure"]({BBOX});
  way["waterway"="riverbank"]({BBOX});
  way["amenity"="parking"]({BBOX});
  way["amenity"~"^(school|college|university)$"]({BBOX});
);
out geom;""",

    'ottawa_pois': f"""[out:json][timeout:300];
(
  nwr["amenity"]["name"]({BBOX});
  nwr["shop"]["name"]({BBOX});
  nwr["tourism"]["name"]({BBOX});
  nwr["leisure"]["name"]({BBOX});
  nwr["office"]["name"]({BBOX});
  nwr["historic"]["name"]({BBOX});
);
out center;""",

    'ottawa_water_relations': f"""[out:json][timeout:300];
(
  relation["natural"="water"]({BBOX});
  relation["waterway"="riverbank"]({BBOX});
);
out geom;""",
}


def fetch(name, query):
    """One query, politely. Overpass answers 429 (slot busy) and 504 (timeout)
    under load; both mean "come back later", so back off rather than retry hard.
    """
    path = os.path.join(RAW, name + '.json')
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        print(f'{name}: already downloaded ({os.path.getsize(path)/1e6:.1f} MB), skipping')
        return
    body = urllib.parse.urlencode({'data': query}).encode()
    delay = 20
    for attempt in range(6):
        url = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(
                url, data=body,
                headers={'User-Agent': 'aylmer-madness/1.0 (hobby game map build)'})
            with urllib.request.urlopen(req, timeout=420) as r:
                raw = r.read()
            data = json.loads(raw)
            if 'elements' not in data:
                raise ValueError('no elements in response')
            with open(path, 'wb') as f:
                f.write(raw)
            print(f'{name}: {len(data["elements"])} elements, {len(raw)/1e6:.1f} MB')
            return
        except (urllib.error.HTTPError, urllib.error.URLError, ValueError, TimeoutError) as e:
            code = getattr(e, 'code', None)
            print(f'{name}: attempt {attempt+1} failed ({code or e}); sleeping {delay}s',
                  file=sys.stderr)
            time.sleep(delay)
            delay = min(delay * 2, 180)
    raise SystemExit(f'{name}: gave up after 6 attempts')


def main():
    os.makedirs(RAW, exist_ok=True)
    want = sys.argv[1:] or list(QUERIES)
    for name in want:
        fetch(name, QUERIES[name])
        time.sleep(8)   # one query in flight at a time, and a gap between them


if __name__ == '__main__':
    main()
