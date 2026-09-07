#!/usr/bin/env node
// Every borrowed model, and the exact conversion that produces it.
//
//   node tools/build_models.mjs            # convert everything
//   node tools/build_models.mjs tree-      # ...or just the slugs matching this
//
// Reads assets/models/src/ (gitignored — see assets/models/LICENSES.md for the
// URLs to re-download it from) and writes assets/models/<slug>.json plus
// manifest.json and LICENSES.md. Adding a model is one entry in RECIPES; that
// is the whole procedure, and docs/MODELS.md says so.
//
// Two things every recipe has to get right, because nothing downstream can:
//
//   SCALE. Kenney's kits are built on a 1-unit grid and Quaternius's are
//   stylised, so a borrowed model arrives in nobody's metres. Each `scale` here
//   is worked out from a real dimension, and the comment says which one. Where
//   one number could not serve two dimensions at once, the scale is per-axis
//   and the note says what was traded away.
//
//   COLOUR. Kenney's Nature Kit is deliberately turquoise-and-salmon and
//   Quaternius's bus is entirely #a3a3a3. What is borrowed is the GEOMETRY;
//   the palette is the game's own — world.js's LEAF / CONIFER / trunk, and
//   cars.js's GLASS / TRIM / AMBER.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run } from './gltf2mesh.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets/models/src');
const OUT = join(ROOT, 'assets/models');

// --------------------------------------------------------------- the palette
// Straight out of the game, so a borrowed tree stands next to a procedural one
// without announcing itself. world.js: LEAF, CONIFER, C.trunk. cars.js: GLASS,
// TRIM, AMBER, TIRE.
const P = {
  leaf: '#5d8a3a', leafPale: '#6a944a', leafDark: '#4f7a34',
  conifer: '#2f4f2e', coniferPale: '#36573a',
  trunk: '#5b4632', trunkDark: '#4a3927', birchBark: '#d9d5c9',
  glass: '#26313b', trim: '#2e3033', amber: '#f0a030', tire: '#17181a',
  steel: '#8b9197', galv: '#9aa0a6', creosote: '#584636',
  binGreen: '#2f6b3a', binMetal: '#7d858a',
  busWhite: '#e8e8e6', busRoof: '#dcdcde', busSkirt: '#3a3d42', busBumper: '#4a4d52',
  signRed: '#c4211c', signWhite: '#e6e4de', signPost: '#8a8f94',
  bodyWhite: '#ebe8dd', bodyFloor: '#d7d4c8', lamp: '#fff3c4', tail: '#c0332a',
  wood: '#7a5a38', binDark: '#3b4046', cladding: '#3a3c40',
  // The four cast bodies, straight out of cars.js's own specs, and two Wave 3
  // vehicles that have no spec yet (docs/PLAN.md, "Who drives what").
  saturnBlue: '#2f5fa8', civicRed: '#a8322b', sunfireTeal: '#1c8f83',
  foresterGreen: '#2f5b3a', siennaBeige: '#b9b2a4', policeWhite: '#e8e8e6',
  sbYellow: '#f2bf0d', sbBlack: '#16171a', sbRoof: '#e6e6e2',
};

// ------------------------------------------------------------- the licences
// Every line here was read off the LICENSE.txt shipped beside the source files
// or off the source page itself. Nothing ships without an explicit CC0 line —
// see the check at the foot of tools/smoke_models.mjs.
const LIC = {
  kenneyNature: {
    pack: 'Nature Kit (2.1)', author: 'Kenney',
    source: 'https://kenney.nl/assets/nature-kit',
    license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  kenneyRoads: {
    pack: 'City Kit (Roads)', author: 'Kenney',
    source: 'https://kenney.nl/assets/city-kit-roads',
    license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  kenneyCar: {
    pack: 'Car Kit (3.1)', author: 'Kenney',
    source: 'https://kenney.nl/assets/car-kit',
    license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  kenneyFurniture: {
    pack: 'Furniture Kit (2.0)', author: 'Kenney',
    source: 'https://kenney.nl/assets/furniture-kit',
    license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  kenneyRetro: {
    pack: 'Retro Urban Kit (2.0)', author: 'Kenney',
    source: 'https://kenney.nl/assets/retro-urban-kit',
    license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  quatTransport: {
    pack: 'Public Transport Pack', author: 'Quaternius',
    source: 'https://quaternius.com/packs/publictransport.html',
    license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    note: 'The pack ships Blend / FBX / OBJ only; the .glb converted from its OBJ is a '
      + 'format change and nothing else.',
  },
  quatStreets: {
    pack: 'Modular Streets Pack', author: 'Quaternius',
    source: 'https://quaternius.com/packs/modularstreets.html',
    license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  ogaPole: {
    pack: 'telephone pole', author: 'carlosjorgereis',
    source: 'https://opengameart.org/content/telephone-pole',
    license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
};


// Every Kenney Car Kit vehicle is painted from the SAME `colormap` swatches —
// one green body, one cream, one grey-purple, the same two blues — so one
// palette does for all of them and only the body colour differs. The keys came
// from `--node body --listColors`; nearest wins, which is what absorbs the
// couple of units of drift inside each swatch.
const carKitPaint = (body) => [
  // Three body families — Kenney paints a vehicle in a green, a grey-purple and
  // an orange-brown — all of which are BODY and all of which go to one colour,
  // because a 1993 Ranger XL and a 1997 Saturn are each one colour of paint.
  '--recolor', `#4db681=${body}`, '--recolor', `#20896b=${body}`,
  '--recolor', `#74778c=${body}`, '--recolor', `#d27d58=${body}`,
  '--recolor', `#fadbb8=${P.cladding}`,
  '--recolor', `#c5dffb=${P.glass}`, '--recolor', `#759fde=${P.glass}`,
  '--recolor', `#ad77e8=${P.lamp}`,
  // No tail-lamp key. The one that was here (#e86147) is a couple of pixels
  // apart from the orange-brown BODY family, and nearest-wins handed it 692 of
  // the police car's vertices: a cruiser painted fire-engine red down one whole
  // flank. cars.js draws its own lamp meshes proud of the body anyway.
];

// A Kenney car body scaled to a real car. The three multipliers are width,
// height and WHEELBASE — never overall length. The game hangs its own wheels at
// +-wheelbase/2 about the mesh origin, so the wheelbase is the one dimension
// that MUST agree or the tyres sit outside the arches; the length then falls
// where the kit's proportions put it, and docs/MODELS.md records the delta.
const carKit = (slug, name, src, body, sx, sy, sz, offsetZ, note) => ({
  slug, kind: 'vehicle', name, src: `kenney/car-kit/${src}.glb`, lic: LIC.kenneyCar,
  note,
  args: ['--node', 'body', '--forward', '+z',
    '--scale', `${sx},${sy},${sz}`, '--offset', `0,0,${offsetZ}`, ...carKitPaint(body)],
});

// ---------------------------------------------------------------- the models
// `kind` decides the triangle budget the suite enforces: 600 for a prop (there
// are ~3200 trees and 2500 poles in the town), 6000 for a vehicle.
const RECIPES = [
  // ------------------------------------------------------------- five trees
  // Heights are what these species actually reach on an Aylmer street, and the
  // scale is that height over the source model's own. All five come from a kit
  // whose palette is turquoise, hence the repaint.
  {
    slug: 'tree-sugar-maple', kind: 'prop', name: 'Érable à sucre',
    src: 'kenney/nature-kit/tree_oak.glb', lic: LIC.kenneyNature,
    note: 'Broad rounded crown on a short bole — the street maple silhouette. 11 m.',
    args: ['--scale', '8.94', '--center',
      '--material', `leafsGreen=${P.leaf}`, '--material', `woodBark=${P.trunk}`],
  },
  {
    slug: 'tree-white-pine', kind: 'prop', name: 'Pin blanc',
    src: 'kenney/nature-kit/tree_pineTallA.glb', lic: LIC.kenneyNature,
    note: 'Tall and open, layered whorls. 16 m — the tallest thing on a residential street.',
    args: ['--scale', '10.46', '--center',
      '--material', `leafsDark=${P.coniferPale}`, '--material', `woodBarkDark=${P.trunkDark}`],
  },
  {
    slug: 'tree-white-cedar', kind: 'prop', name: 'Cèdre blanc',
    src: 'kenney/nature-kit/tree_pineRoundA.glb', lic: LIC.kenneyNature,
    note: 'Dense narrow column. 6.5 m — the hedge tree, planted in rows along a lot line.',
    args: ['--scale', '4.74', '--center',
      '--material', `leafsDark=${P.conifer}`, '--material', `woodBarkDark=${P.trunkDark}`],
  },
  {
    slug: 'tree-birch', kind: 'prop', name: 'Bouleau à papier',
    src: 'kenney/nature-kit/tree_thin.glb', lic: LIC.kenneyNature,
    note: 'Slender, light crown, WHITE bark — the one tree here whose trunk is not brown. 13 m.',
    args: ['--scale', '8.72', '--center',
      '--material', `leafsGreen=${P.leafPale}`, '--material', `woodBark=${P.birchBark}`],
  },
  {
    slug: 'tree-spruce', kind: 'prop', name: 'Épinette',
    src: 'kenney/nature-kit/tree_pineDefaultA.glb', lic: LIC.kenneyNature,
    note: 'Dense conical, dark. 13.5 m.',
    args: ['--scale', '8.71', '--center',
      '--material', `leafsDark=${P.conifer}`, '--material', `woodBarkDark=${P.trunkDark}`],
  },
  // NO HEDGE. Kenney's bushes are crossed leaf-BLADE cards, not solid shapes:
  // stretched into a 2 m segment they read as a dark spiky V and not as clipped
  // cedar (docs/shots/models-hedge-cedar.jpg, before it was withdrawn). Nothing
  // in the allowed CC0 packs is a hedge, and world.js's own procedural shrub —
  // a tapered box — is already closer than anything borrowable. Left as a gap
  // on purpose: shipping the bush would have been worse than shipping nothing.


  // --------------------------------------------------------- street furniture
  {
    // Uniform in x and z (an elliptical pole is worse than a fat one), taller
    // in y: 8 m to the arm, 0.30 m pole, which is a cobra-head street light.
    slug: 'lamp-post', kind: 'prop', name: 'Lampadaire',
    src: 'kenney/city-kit-roads/light-curved.glb', lic: LIC.kenneyRoads,
    note: 'Cobra-head street light, 8 m to the arm, 1.4 m reach over the kerb.',
    // The kit's pole is bright orange; the lens is the small cluster.
    args: ['--scale', '6,12,6', '--center',
      '--recolor', `#ff7544=${P.galv}`, '--recolor', `#cf534f=${P.lamp}`],
  },
  {
    // Z-up source, so --up z first; --forward then names the axis in the
    // already-corrected frame (see gltf2mesh.mjs).
    slug: 'hydro-pole', kind: 'prop', name: 'Poteau d’Hydro',
    src: 'opengameart/telephone-pole/telephone_pole.glb', lic: LIC.ogaPole,
    note: 'Creosoted wood pole with one crossarm, 11 m. Z-up in the source.',
    args: ['--up', 'z', '--scale', '1.3,1.76,1.3', '--center',
      '--material', `default=${P.creosote}`],
  },
  {
    // The plate's normal is the source +X (its thinnest axis), so --forward +x
    // turns it to face +Z and a prop's own yaw does the rest.
    slug: 'stop-sign', kind: 'prop', name: 'Panneau ARRÊT',
    src: 'quaternius/modular-streets/stopsign.glb', lic: LIC.quatStreets,
    note: 'Octagonal plate on a post, 2.4 m to the top. Faces +Z.',
    args: ['--forward', '+x', '--scale', '4.44', '--center',
      '--material', `Red=${P.signRed}`, '--material', `White=${P.signWhite}`,
      '--material', `Pole=${P.signPost}`],
  },
  {
    slug: 'garbage-can', kind: 'prop', name: 'Poubelle',
    src: 'kenney/furniture-kit/trashcan.glb', lic: LIC.kenneyFurniture,
    note: 'Kerbside bin, 0.95 m tall.',
    args: ['--scale', '2.2', '--center',
      '--material', `metal=${P.binGreen}`, '--material', `metalDark=${P.trim}`],
  },
  {
    slug: 'dumpster', kind: 'prop', name: 'Conteneur à déchets',
    src: 'kenney/city-kit-roads/dumpster.glb', lic: LIC.kenneyRoads,
    note: 'Behind the dep and the Galeries. 1.85 m long.',
    // Kenney's colormap makes this bin PINK. One material covers the whole
    // model, so the palette is snapped by colour, not by material name.
    args: ['--scale', '5', '--center',
      '--recolor', `#f2c3ee=${P.binGreen}`, '--recolor', `#82879d=${P.binDark}`],
  },
  {
    slug: 'park-bench', kind: 'prop', name: 'Banc de parc',
    src: 'kenney/retro-urban-kit/detail-bench.glb', lic: LIC.kenneyRetro,
    note: 'Slatted bench, 1.75 m long. Parc des Cèdres and the Marina.',
    // Grey frame is right; the slats come out near-black and want to be wood.
    args: ['--scale', '2.9,2.0,1.9', '--center',
      '--recolor', `#acb2b8=${P.steel}`, '--recolor', `#1f1914=${P.wood}`],
  },

  // ---------------------------------------------------------------- vehicles
  {
    // The Ranger stand-in. Scaled per axis to the REAL Ranger, and the origin
    // pushed onto the axle midpoint, because cars.js hangs the wheels at
    // +-wheelbase/2 about the mesh origin and nothing else will line up.
    // See docs/MODELS.md: the arches do NOT come out where the game's wheels
    // go, and that is a spec change, not a scale.
    slug: 'pickup-ranger', kind: 'vehicle', name: 'Camionnette (Ranger)',
    src: 'kenney/car-kit/truck.glb', lic: LIC.kenneyCar,
    note: 'Body only — the game supplies its own wheels. 1993 Ford Ranger XL dimensions.',
    args: ['--node', 'body', '--forward', '+z',
      // 1.77 / 1.50 wide, 1.64 / 1.30 tall, 2.75 / 1.62 wheelbase.
      '--scale', '1.18,1.262,1.6975',
      // Source axle midpoint sits at z = +0.05 before scaling.
      '--offset', '0,0,-0.0849',
      // Kenney's truck is a mint-green toy. One material (`colormap`) covers the
      // whole thing, so --material could only flatten it; these keys come from
      // `--node body --listColors` and every vertex snaps to its nearest.
      // The XL is ONE colour of white over the whole body with black bumpers
      // (cars.js's own note on the trim), so the two big body clusters — the
      // lower flanks and the upper cab — both go white and the cladding is what
      // stays dark.
      '--recolor', `#4db681=${P.bodyWhite}`, '--recolor', `#20896b=${P.bodyWhite}`,
      '--recolor', `#74778c=${P.bodyWhite}`,
      '--recolor', `#fadbb8=${P.cladding}`,
      '--recolor', `#c5dffb=${P.glass}`, '--recolor', `#759fde=${P.glass}`,
      '--recolor', `#eb78ef=${P.lamp}`, '--recolor', `#ad77e8=${P.lamp}`,
      '--recolor', `#d27d58=${P.bodyWhite}`],
  },
  carKit('sedan-saturn', 'Berline (Saturn SL)', 'sedan', P.saturnBlue,
    1.1333, 1.0692, 1.9697, 0,
    '1997 Saturn SL, Margaret’s. Wheelbase 2.60 m; the body then comes out '
    + '5.02 m against the spec’s 4.49 — see docs/MODELS.md.'),
  carKit('hatch-civic', 'Hatchback (Civic Si)', 'hatchback-sports', P.civicRed,
    1.2846, 1.2091, 1.5432, 0,
    '1988 Honda Civic Si, Sayyad’s. Wheelbase 2.50 m, body 4.40 m against 3.99.'),
  carKit('coupe-sunfire', 'Coupé (Sunfire)', 'sedan-sports', P.sunfireTeal,
    1.3231, 1.2273, 2.0000, 0,
    '1997 Pontiac Sunfire, Adam’s — and the same shell serves the Cavalier. '
    + 'Wheelbase 2.64 m, body 5.10 m against 4.60.'),
  carKit('wagon-forester', 'Familiale (Forester)', 'suv', P.foresterGreen,
    1.1567, 1.2154, 1.3923, 0.2019,
    'Mike’s green 1998 Subaru Forester (Wave 3, no spec yet). Wheelbase 2.52 m, '
    + 'and the body then comes out only 3.76 m: Kenney’s SUV is unusually '
    + 'long-wheelbase for its length, so this one wants its spec length cut '
    + 'rather than the model stretched.'),
  carKit('van-sienna', 'Minifourgonnette (Sienna)', 'van', P.siennaBeige,
    1.2200, 1.2741, 1.9079, 0,
    'Abraham’s beaten-up ~1999 Toyota Sienna (Wave 3, no spec yet). '
    + 'Wheelbase 2.90 m, body 5.25 m against a real 4.85.'),
  carKit('police-cruiser', 'Auto-patrouille', 'police', P.policeWhite,
    1.3200, 1.1154, 1.8025, 0,
    'A Crown Victoria stand-in for the SPVG. Wheelbase 2.92 m, body 5.59 m '
    + 'against a real 5.40. No spec in cars.js yet.'),
  {
    // Quaternius's school bus is the same shape of problem as its city bus, and
    // takes the same answer: scale to the real overall LENGTH, because a bus
    // that is 3 m short reads as a toy, and record the wheelbase delta instead.
    slug: 'school-bus', kind: 'vehicle', name: 'Autobus scolaire',
    src: 'quaternius/public-transport/schoolbus.glb', lic: LIC.quatTransport,
    note: '11.6 x 2.44 x 3.08 m, the game’s own schoolbus spec. Wheelbase comes '
      + 'out 8.96 m against the spec’s 6.93 — see docs/MODELS.md.',
    args: ['--forward', '-x',
      // 11.60 / 4.61 long, 3.08 / 2.19 tall, 2.44 / 1.88 wide.
      '--scale', '1.298,1.406,2.516', '--center',
      '--material', `Yellow=${P.sbYellow}`, '--material', `Windows=${P.glass}`,
      '--material', `Details=${P.sbBlack}`, '--material', `Bumper=${P.sbBlack}`,
      '--material', `Lights=${P.amber}`, '--material', `Wheel=${P.tire}`],
  },
  {
    // Quaternius's bus is stubby (4.09 : 1.74 long : wide, where a real transit
    // bus is 4.7 : 1), so the length multiplier is the biggest of the three and
    // the stretch is deliberate. Everything is #a3a3a3 in the source.
    slug: 'city-bus', kind: 'vehicle', name: 'Autobus STO',
    src: 'quaternius/public-transport/citybus.glb', lic: LIC.quatTransport,
    note: '12.0 x 2.59 x 3.10 m, the game’s own bus spec. Body and wheels both, '
      + 'because its wheelbase does not match the spec’s (see docs/MODELS.md).',
    args: ['--forward', '-x',
      // 12.00 / 4.09 long, 3.10 / 1.67 tall, 2.59 / 1.74 wide.
      '--scale', '1.489,1.856,2.934', '--center',
      '--material', `Material=${P.busWhite}`, '--material', `Top=${P.busRoof}`,
      '--material', `Bottom=${P.busSkirt}`, '--material', `Windows=${P.glass}`,
      '--material', `Details=${P.trim}`, '--material', `Bumper=${P.busBumper}`,
      '--material', `Lights=${P.amber}`],
  },
];

// ------------------------------------------------------------------ the build

const filter = process.argv[2];
const budget = { prop: 600, vehicle: 6000 };
mkdirSync(OUT, { recursive: true });

const built = [];
let failed = 0;
for (const r of RECIPES) {
  if (filter && !r.slug.includes(filter)) continue;
  const src = join(SRC, r.src);
  if (!existsSync(src)) {
    console.error(`SKIP ${r.slug}: ${r.src} is not in assets/models/src/ `
      + '(it is gitignored — see assets/models/LICENSES.md for where it came from)');
    failed++;
    continue;
  }
  // The licence block is handed to the converter through a sidecar, the same
  // path a one-off conversion takes, so there is only one way a licence gets
  // into a model.
  const sidecar = join(SRC, `${r.slug}.license.json`);
  writeFileSync(sidecar, JSON.stringify({ ...r.lic, model: r.name, note: r.note }, null, 1));
  try {
    const m = run([src, '--out', join(OUT, `${r.slug}.json`), '--slug', r.slug,
      '--license', sidecar, '--maxTris', String(budget[r.kind]), '--quiet', ...r.args]);
    const size = [0, 1, 2].map((k) => (m.max[k] - m.min[k]).toFixed(2)).join(' x ');
    console.log(`${r.slug.padEnd(18)} ${String(m.tris).padStart(5)} tris  ${size} m  `
      + `${(m.bytes / 1024).toFixed(0)} kB`);
    built.push({ ...r, tris: m.tris, verts: m.verts, bytes: m.bytes, min: m.min, max: m.max });
  } catch (e) {
    console.error(`FAIL ${r.slug}: ${e.message}`);
    failed++;
  }
}

// Only rewrite the manifest on a full build; a filtered run is for iterating on
// one model and must not quietly drop the other thirteen out of the game.
if (!filter) {
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
    // Kept in step with src/game/models.js, which refuses anything else.
    format: 'aylmer-mesh-1',
    models: built.map((b) => ({ slug: b.slug, kind: b.kind, name: b.name })),
  }, null, 1) + '\n');

  const rows = built.map((b) => `| \`${b.slug}\` | ${b.tris} | ${b.src} | ${b.lic.pack} | `
    + `${b.lic.author} | [${b.lic.license}](${b.lic.source}) |`).join('\n');
  const packs = [...new Map(built.map((b) => [b.lic.source, b.lic])).values()];
  writeFileSync(join(OUT, 'LICENSES.md'), `# Borrowed models — where every one came from

Generated by \`node tools/build_models.mjs\`. **Every model here is CC0.** Nothing
without an explicit CC0 line in the pack's own licence file may be added; the
check at the foot of \`tools/smoke_models.mjs\` refuses a model whose licence
block does not say so.

The originals live in \`assets/models/src/\`, which is **gitignored** — they are a
build input, re-downloadable from the URLs below, and there is no reason to
carry them in git. The converted \`*.json\` beside this file is what the game
loads. Colours are the game's own (see \`tools/build_models.mjs\`); what is
borrowed is the geometry.

## Models

| slug | tris | source file | pack | author | licence |
|---|---|---|---|---|---|
${rows}

## Packs

${packs.map((p) => `### ${p.pack} — ${p.author}\n\n- Source: ${p.source}\n- Licence: `
    + `**${p.license}** — ${p.licenseUrl}\n${p.note ? `- Note: ${p.note}\n` : ''}`).join('\n')}
## Crediting

None of these licences require attribution. Kenney and Quaternius both ask for a
credit as a courtesy and neither makes it a condition; this file is that credit,
and the game's own credits screen should carry "Kenney (kenney.nl)" and
"Quaternius (quaternius.com)" when there is one.
`);
  console.log(`\n${built.length} models, ${built.reduce((s, b) => s + b.tris, 0)} tris, `
    + `${(built.reduce((s, b) => s + b.bytes, 0) / 1024).toFixed(0)} kB of JSON`);
}
if (failed) process.exit(1);
