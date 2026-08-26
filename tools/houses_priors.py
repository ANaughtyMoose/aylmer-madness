#!/usr/bin/env python3
"""Neighbourhood priors for Aylmer houses.

These only ever fill gaps.  The assessment roll gives a real année de
construction for ~98 % of the addressed footprints, so a prior is used for the
rest — chiefly the corner of the clip rectangle that falls across the river in
Ottawa (Britannia: Bradford, Cassels, Kirby, Rowatt Street, which will never be
in a Québec roll) plus a few new-build or renumbered addresses.
build_houses.py tries a *per-street median year* from the roll first; the
neighbourhood is the last resort.

A neighbourhood is matched by street name first (normalised the same way as the
address join), then by a lat/lon box, first match wins.

The street lists below were calibrated against the roll's own median years —
docs/HOUSES-REPORT.md prints them, so if a street ever looks wrong there, move
it.  A few of the names in the original Phase 1 brief did not survive contact
with the data:

    Denise-Friend   median 1946, not a 1970s street — it is an old infill
                    street off Principale, so it sits in vieux-aylmer
    Frank-Robinson  median 1911 — old, not midcentury
    Rue Front       median 1977 — the north-west end is a 1970s subdivision
    Victor-Beaudry  median 2002 — a modern subdivision, not Deschênes village

era bands, per docs/HOUSES.md:
    old         <= 1945
    midcentury  1946-1969
    suburban    1970-1999
    modern      >= 2000
    cottage     1-storey, footprint <= 75 m², in Deschênes / along the river
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from houses_addr import osm_street_keys


def _k(*names):
    out = set()
    for n in names:
        ks = osm_street_keys(n)
        if ks:
            out.add(ks[0])
    return out


# name, era, typical year, street keys, [ (lat0, lat1, lon0, lon1), ... ]
NEIGHBOURHOODS = [
    (
        'deschenes', 'cottage', 1952,
        _k('Rue Deschênes', 'Chemin Vanier', 'Rue Bellevue', 'Rue Queen',
           'Rue Jacques-Cartier', 'Rue Saint-Médard', 'Rue de la Rivière',
           "Rue de l'Hôtel-de-Ville", 'Rue Hanson'),
        [(45.3780, 45.3925, -75.8120, -75.8030)],
    ),
    (
        'wychwood-lakeview', 'midcentury', 1953,
        _k('Promenade Wychwood', 'Promenade Lakeview', 'Rue Lord-Aylmer',
           'Rue Belmont', 'Rue Kennedy', 'Rue Sunnyside', 'Rue Woodland',
           'Rue Elizabeth', 'Chemin Eardley', 'Rue Court', 'Rue Symmes',
           'Rue Parker', 'Rue Mary'),
        [(45.3880, 45.3945, -75.8460, -75.8330)],
    ),
    (
        'vieux-aylmer', 'old', 1918,
        _k('Rue Principale', 'Rue Bancroft', 'Rue Brook', 'Rue Park',
           'Avenue Frank-Robinson', 'Rue Denise-Friend', "Chemin d'Aylmer",
           'Rue Church', 'Rue Charles', 'Rue Lois', 'Rue Dalton', 'Rue Albert',
           'Rue Chamberlin', 'Rue Rothwell', 'Rue Cartier', 'Rue Wilson',
           'Rue Kent'),
        [(45.3930, 45.4000, -75.8520, -75.8420)],
    ),
    (
        'lucerne-champlain', 'suburban', 1980,
        _k('Boulevard de Lucerne', 'Rue Champlain', 'Rue de la Croisée',
           'Chemin Fraser', 'Rue John-Egan', 'Boulevard Wilfrid-Lavigne',
           'Chemin Cochrane', 'Chemin Foley', 'Rue Madaire', 'Rue Pine',
           'Rue Armour', 'Rue Glenholm', 'Rue Riverview', 'Rue Broad',
           'Rue Front', 'Rue North', 'Rue Bourgeau Nord', 'Rue Bourgeau Sud',
           'Rue Prentiss', 'Rue de la Terrasse-Eardley', 'Rue Raoul-Roy',
           'Rue Gérald-Dubois'),
        [(45.3840, 45.4060, -75.8330, -75.7960)],
    ),
    (
        'nord-allumettieres', 'modern', 2005,
        _k('Rue du Verger', 'Rue du Vison', 'Rue du Grand-Hunier',
           'Rue du Buzet', 'Rue Victor-Beaudry', 'Rue Arthur-Quesnel',
           'Rue du Golf', 'Rue des Grands-Châteaux', 'Rue Nancy-Elliott',
           'Rue Félix-Leclerc', 'Rue du Jockey', 'Rue Jean-De La Fontaine',
           'Chemin McConnell', 'Rue du Britannia', "Chemin Queen's Park"),
        [(45.4055, 45.4110, -75.8700, -75.8030)],
    ),
]

ALLUMETTIERES_LAT = 45.4055

DEFAULT = ('aylmer', 'suburban', 1978)


def lookup(street_key, lat, lon):
    """-> (neighbourhood, era, typical year). Never returns None."""
    if street_key:
        for name, era, year, streets, _boxes in NEIGHBOURHOODS:
            if street_key in streets:
                return name, era, year
    for name, era, year, _streets, boxes in NEIGHBOURHOODS:
        for lat0, lat1, lon0, lon1 in boxes:
            if lat0 <= lat <= lat1 and lon0 <= lon <= lon1:
                return name, era, year
    if lat >= ALLUMETTIERES_LAT:
        return 'nord-allumettieres', 'modern', 2005
    return DEFAULT


# Ottawa River bank, west to east, as (lon, lat). Aylmer is on the north side.
SHORE = [(-75.8680, 45.4020), (-75.8560, 45.4000), (-75.8480, 45.3985),
         (-75.8400, 45.3960), (-75.8300, 45.3930), (-75.8200, 45.3900),
         (-75.8120, 45.3878), (-75.8060, 45.3862), (-75.8030, 45.3850)]


def river_side(lat, lon, within=320.0):
    """True within `within` metres of the river bank — where cottages are."""
    best = 1e18
    for i in range(len(SHORE) - 1):
        x1, y1 = SHORE[i]
        x2, y2 = SHORE[i + 1]
        dx, dy = x2 - x1, y2 - y1
        d2 = dx * dx + dy * dy
        t = 0.0
        if d2 > 0:
            t = max(0.0, min(1.0, ((lon - x1) * dx + (lat - y1) * dy) / d2))
        px, py = x1 + t * dx, y1 + t * dy
        d = ((lon - px) * 78168) ** 2 + ((lat - py) * 111320) ** 2
        best = min(best, d)
    return best ** 0.5 < within
