#!/usr/bin/env python3
"""Render src/game/mapdata.js to data/preview.svg for eyeballing."""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'src/game/mapdata.js')).read()
M = json.loads(re.search(r'export const MAP = (.*?);\n', src, re.S).group(1))
b = M['bounds']; S = 0.28
W = (b['maxX'] - b['minX']) * S; H = (b['maxZ'] - b['minZ']) * S
def P(p): return f"{(p[0]-b['minX'])*S:.1f},{(p[1]-b['minZ'])*S:.1f}"
o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.0f}" height="{H:.0f}" viewBox="0 0 {W:.0f} {H:.0f}"><rect width="100%" height="100%" fill="#6f8a4e"/>']
COL = {'water':'#2f5d78','sand':'#d9cba4','wood':'#3f5f33','park':'#5f8a45','parking':'#4a4a50','pitch':'#6a9a4a','pool':'#7fc7e0','school':'#7f9a5a','cemetery':'#6a8a5a'}
for a in M['areas']: o.append(f'<polygon points="{" ".join(P(p) for p in a["p"])}" fill="{COL[a["k"]]}"/>')
for w in M['water']: o.append(f'<polygon points="{" ".join(P(p) for p in w["p"])}" fill="#2f5d78"/>')
RC = {'trunk':'#e0c060','primary':'#e0c060','secondary':'#d8d8d8','tertiary':'#c8c8c8','residential':'#b0b0b0','service':'#8a8a8a'}
for r in M['roads']: o.append(f'<polyline points="{" ".join(P(p) for p in r["pts"])}" fill="none" stroke="{RC[r["cls"]]}" stroke-width="{max(0.6, r["w"]*S)}" stroke-linecap="round"/>')
BC = {'house':'#b08a6a','terrace':'#a07a5a','apartments':'#8a7a9a','commercial':'#9a6a5a','industrial':'#7a7a7a','church':'#e0d0b0','school':'#c0a060','shed':'#8a7a6a','public':'#c09060','big':'#9a8a7a','mall':'#d0a050'}
for bd in M['buildings']: o.append(f'<polygon points="{" ".join(P(p) for p in bd["p"])}" fill="{BC[bd["k"]]}"/>')
for bd in M['buildings']:
    if bd.get('addr') in ('299 Chemin Fraser','75 Rue Denise-Friend') or bd.get('name') in ("Galeries d'Aylmer",'Arena Frank-Robinson','Chalet de services Plage des Cèdres'):
        x,y = P(bd['c']).split(','); o.append(f'<circle cx="{x}" cy="{y}" r="9" fill="none" stroke="#ff2a2a" stroke-width="3"/><text x="{float(x)+12}" y="{float(y)+4}" font-size="13" fill="#fff" font-family="Helvetica">{bd.get("addr") or bd.get("name")}</text>')
o.append('</svg>')
open(os.path.join(ROOT,'data/preview.svg'),'w').write('\n'.join(o))
print('data/preview.svg', f'{W:.0f}x{H:.0f}')
