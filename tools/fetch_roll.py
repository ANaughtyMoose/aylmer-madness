#!/usr/bin/env python3
"""Fetch the Québec assessment roll (rôle d'évaluation foncière) for Gatineau
and clip it to the Aylmer streets the game map covers.

Source: Ministère des Affaires municipales et de l'Habitation, published as
open data (CC-BY 4.0) on Données Québec:

  dataset  https://www.donneesquebec.ca/recherche/dataset/roles-d-evaluation-fonciere-du-quebec
  index    https://donneesouvertes.affmunqc.net/role/indexRole2026.csv
  Gatineau https://donneesouvertes.affmunqc.net/role/RL81017_2026.xml   (~132 MB)

Ville de Gatineau itself does NOT publish the roll on its own portal (see
docs/HOUSES.md); the provincial file is the bulk source and it is per
municipality, not per bbox — so "clipping" here means keeping only the
evaluation units whose street matches a street that appears in
data/buildings.json.

Fields we keep (see the MAMH "Répertoire des renseignements prescrits" v2.5):

  RL0101Ax/Cx  numéro civique inférieur / supérieur
  RL0101Ex/Fx/Gx  générique / lien / nom de la voie publique
  RL0105A      code d'utilisation prédominante (CUBF; 1000 = logement)
  RL0306A      nombre maximal d'étages
  RL0307A/B    année de construction originale / réelle ou estimée
  RL0308A      aire d'étages (m²)
  RL0309A      lien physique  1 détaché · 2 jumelé · 3 rangée 1 côté
                              4 rangée >1 côté · 5 intégré (condo)
  RL0310A      genre de construction  1 plain-pied · 2 niveaux décalés
                              3 unimodulaire · 4 étage mansardé · 5 étages entiers
  RL0311A      nombre de logements

Usage:
    python3 tools/fetch_roll.py            # download if missing, then clip
    python3 tools/fetch_roll.py --force    # re-download the XML
"""
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from houses_addr import norm_light, osm_street_keys, roll_street_aliases, roll_numbers

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw')

ROLL_YEAR = 2026
MUNI = '81017'                      # code géographique — Gatineau
INDEX_URL = f'https://donneesouvertes.affmunqc.net/role/indexRole{ROLL_YEAR}.csv'
ROLL_URL = f'https://donneesouvertes.affmunqc.net/role/RL{MUNI}_{ROLL_YEAR}.xml'
XML = os.path.join(RAW, f'RL{MUNI}_{ROLL_YEAR}.xml')
INDEX = os.path.join(RAW, f'indexRole{ROLL_YEAR}.csv')
OUT = os.path.join(RAW, 'roll_aylmer.json')

FIELDS = ('RL0105A', 'RL0306A', 'RL0307A', 'RL0307B', 'RL0308A',
          'RL0309A', 'RL0310A', 'RL0311A', 'RL0302A', 'RL0403A')


def download(url, path, force=False):
    if os.path.exists(path) and not force:
        print(f'have {os.path.relpath(path, ROOT)} '
              f'({os.path.getsize(path) / 1e6:.1f} MB)', file=sys.stderr)
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print(f'GET {url}', file=sys.stderr)
    req = urllib.request.Request(url, headers={'User-Agent': 'aylmer-madness/1.0'})
    with urllib.request.urlopen(req, timeout=600) as r, open(path + '.part', 'wb') as f:
        n = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            n += len(chunk)
            print(f'\r  {n / 1e6:7.1f} MB', end='', file=sys.stderr)
    print('', file=sys.stderr)
    os.replace(path + '.part', path)


def aylmer_street_keys():
    """Every normalised street key that appears in the OSM clip."""
    keys = set()
    with open(os.path.join(ROOT, 'data', 'buildings.json')) as f:
        for e in json.load(f)['elements']:
            st = e.get('tags', {}).get('addr:street')
            if st:
                keys.update(osm_street_keys(st))
    return keys


def clip():
    want = aylmer_street_keys()
    units = []
    total = 0
    for _, el in ET.iterparse(XML, events=('end',)):
        if el.tag != 'RLUEx':
            continue
        total += 1
        addrs = []
        for a in el.findall('RL0101/RL0101x'):
            name = a.findtext('RL0101Gx')
            if not name:
                continue
            if not any(al and al in want for al in roll_street_aliases(name)):
                continue
            nums = roll_numbers(a.findtext('RL0101Ax'), a.findtext('RL0101Cx'))
            if not nums:
                continue
            addrs.append({
                'g': a.findtext('RL0101Ex') or '',
                'l': a.findtext('RL0101Fx') or '',
                'n': name,
                'nums': nums,
                'apt': a.findtext('RL0101Ix') or '',
            })
        if addrs:
            u = {'a': addrs}
            for f in FIELDS:
                v = el.findtext(f)
                if v:
                    u[f] = v
            units.append(u)
        el.clear()
    print(f'roll: {total} evaluation units in Gatineau, '
          f'{len(units)} on streets present in the Aylmer clip', file=sys.stderr)
    os.makedirs(RAW, exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump({'muni': MUNI, 'year': ROLL_YEAR, 'source': ROLL_URL,
                   'units': units}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'wrote {os.path.relpath(OUT, ROOT)} '
          f'({os.path.getsize(OUT) / 1e6:.1f} MB)', file=sys.stderr)


def main():
    force = '--force' in sys.argv
    download(INDEX_URL, INDEX, force)
    download(ROLL_URL, XML, force)
    clip()


if __name__ == '__main__':
    main()
