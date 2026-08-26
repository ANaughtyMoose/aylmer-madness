#!/usr/bin/env python3
"""Address normalisation shared by fetch_roll.py and build_houses.py.

The Québec assessment roll stores a street as three separate fields:

    RL0101Ex  code de générique  ('RU' rue, 'CH' chemin, 'BO' boulevard, …)
    RL0101Fx  code de lien       (the particle: de / du / de la / des …)
    RL0101Gx  nom de la voie     ('FRASER', 'DENISE-FRIEND', 'TERRASSE-EARDLEY')

OSM stores one string: "Chemin Fraser", "Rue de la Terrasse-Eardley".  So the
join is asymmetric: we strip generic + particle off the *OSM* side and leave
the roll's RL0101Gx almost alone.  Stripping both sides symmetrically is what
breaks "Rue de la Terrasse-Eardley" (whose *name* legitimately starts with the
word "Terrasse") against plain "Chemin Eardley".

Matching runs in tiers so the loosest rules can never outrank the exact ones:

    tier 0  roll name as written                 (FRASER, TERRASSE-EARDLEY)
    tier 1  roll name minus a trailing English generic  (BRITANNIA ROAD → BRITANNIA)
    tier 2  roll name minus a leading French generic
    tier 3  roll name minus leading particles    (DE BRUYNE → BRUYNE)
    tier 4  OSM key is a hyphen-prefix of exactly one roll street with that
            house number  (OSM "Rue de la Terrasse" 54 → roll TERRASSE-DAVID 54)
"""
import re
import unicodedata

FR_GENERIC = {
    'rue', 'avenue', 'av', 'chemin', 'ch', 'boulevard', 'boul', 'bd', 'impasse',
    'place', 'promenade', 'montee', 'croissant', 'allee', 'ruelle', 'autoroute',
    'cote', 'rang', 'carre', 'cercle', 'voie', 'passage', 'chaussee', 'cours',
    'domaine', 'sentier', 'terrasse', 'esplanade', 'quai', 'chemins', 'route',
}
PARTICLE = {'de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'au', 'aux'}
EN_GENERIC = {
    'street', 'road', 'avenue', 'drive', 'lane', 'way', 'court', 'crescent',
    'boulevard', 'terrace', 'place', 'circle', 'row', 'close', 'gate', 'ridge',
}

# Générique codes seen in the Gatineau roll, for rebuilding a display name.
GENERIC_NAME = {
    'RU': 'Rue', 'CH': 'Chemin', 'BO': 'Boulevard', 'AV': 'Avenue',
    'IM': 'Impasse', 'PL': 'Place', 'PR': 'Promenade', 'MO': 'Montée',
    'CR': 'Croissant', 'AL': 'Allée', 'RL': 'Ruelle', 'AT': 'Autoroute',
    'TE': 'Terrasse', 'CA': 'Carré', 'RG': 'Rang', 'CO': 'Côte',
}


def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def norm_light(s):
    """Accents, case and punctuation only. Hyphens become spaces."""
    s = strip_accents(s or '').lower().replace("'", ' ').replace('’', ' ')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def osm_street_keys(street):
    """Ordered join candidates for an OSM addr:street value."""
    toks = norm_light(street).split()
    if not toks:
        return []
    out = []
    t = list(toks)
    if len(t) > 1 and t[0] in FR_GENERIC:
        t = t[1:]
    while len(t) > 1 and t[0] in PARTICLE:
        t = t[1:]
    def add(k):
        if k and k not in out:
            out.append(k)
    add(' '.join(t))
    if len(t) > 1 and t[-1] in EN_GENERIC:
        add(' '.join(t[:-1]))
    add(' '.join(toks))
    if len(t) > 1 and t[0] in FR_GENERIC:
        add(' '.join(t[1:]))
    return out


def roll_street_aliases(name):
    """Tiered aliases for a roll RL0101Gx value. Index == tier."""
    n = norm_light(name)
    if not n:
        return []
    t = n.split()
    al = [n]
    a1 = ' '.join(t[:-1]) if len(t) > 1 and t[-1] in EN_GENERIC else None
    al.append(a1)
    a2 = ' '.join(t[1:]) if len(t) > 1 and t[0] in FR_GENERIC else None
    al.append(a2)
    p = list(t)
    while len(p) > 1 and p[0] in PARTICLE:
        p = p[1:]
    a3 = ' '.join(p) if p != t else None
    al.append(a3)
    return al


def house_numbers(hn):
    """OSM addr:housenumber -> the civic numbers it stands for.

    '299' -> [299];  '19 - 23' -> [19,20,21,22,23];  '51(A)' -> [51]
    """
    if not hn:
        return []
    hn = hn.strip()
    m = re.match(r'^(\d+)\s*[-–]\s*(\d+)$', hn)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if a < b <= a + 60:
            return list(range(a, b + 1))
    m = re.match(r'^(\d+)', hn)
    return [int(m.group(1))] if m else []


def roll_numbers(lo, hi):
    """RL0101Ax / RL0101Cx -> the civic numbers the unit covers."""
    try:
        lo = int(lo)
    except (TypeError, ValueError):
        return []
    try:
        hi = int(hi) if hi else None
    except ValueError:
        hi = None
    if hi and lo < hi <= lo + 60:
        step = 2 if (hi - lo) % 2 == 0 else 1
        return list(range(lo, hi + 1, step))
    return [lo]


def display_street(generic_code, particle, name):
    """Best-effort human-readable street name from the roll's three fields."""
    parts = [GENERIC_NAME.get((generic_code or '').strip().upper(), '')]
    if particle:
        parts.append(particle)
    parts.append((name or '').title())
    return ' '.join(p for p in parts if p).strip()
