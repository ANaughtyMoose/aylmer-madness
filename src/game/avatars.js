// The people who are real people.
//
// Every other body in this game is a shape: peds.js has three outfits, and the
// passenger seat had a head-shaped box in it. But some of the people you drive
// around exist, and the owner is going to show them this. So they get faces.
//
// The rule for a caricature is that you pick the three things somebody's own
// mother would draw and then make them too big:
//
//   Sayyad    round wire glasses, grey at the temples, salt-and-pepper stubble,
//             and a maroon Hawaiian shirt with big magenta fronds worn WIDE
//             open over a bare chest. Caught mid-move, because he always is.
//             The Civic, 75 Denise-Friend.
//   Margaret  cropped white hair, a smile that takes up a third of her face,
//             a navy tee, and the grey fleece tied round her waist with the
//             little pouch on it. Waving before you have finished parking.
//             The Saturn, 299 Chemin Fraser.
//   Mike      hair pushed back with more volume than the rest of him, thin
//             dark rectangular frames, a white pinstripe shirt, and both hands
//             up in front of him mid-word. 129 avenue Frank-Robinson, and yes,
//             it is his couch in the tree.
//   Zahra     Sayyad's little sister, at Symmes in 2004: long dark hair, big
//             headphones, arms folded, entirely unimpressed. She waits at his
//             address and she is not getting in your truck.
//
// Same house style as cars.js and world.js: MeshBuilder primitives, flat vertex
// colours, no textures, a few hundred triangles each. Meshes per person: a
// standing body, a seated one for the passenger seat, and however many arms
// they wave — each arm's origin is its shoulder, so the gestures cost a draw
// call apiece and no skinning.
//
// They appear in two places:
//   * standing on their own lawn, whenever you are near it — which is also
//     exactly where the `gang` job sends you to collect them
//   * in the passenger seat once they are aboard (see riders(), which reads the
//     completed mission stages instead of asking missions.js for anything)
import { MeshBuilder, rgb } from '../core/mesh.js';
import { m4 } from '../core/math.js';
import { PLACES } from './places.js';
import { Vehicle } from './cars.js';
import { heckle } from './heckle.js';
import { greeting, personLine } from './story.js';

// ---------------------------------------------------------------- palette

const S = {   // Sayyad
  skin: 0xc48f61, skinDark: 0xa87850, stubble: 0x796251,
  hair: 0x2b2420, grey: 0xa9a49c,
  shirt: 0x331522, shirtLit: 0x401a2a, frond: 0xc4285f, frondLit: 0xe2568d,
  shorts: 0x8d1c22, band: 0xa8282e,
  eye: 0x241d19, wire: 0xd8d4cb, watch: 0x16171a,
};
const M = {   // Margaret
  skin: 0xf2bd95, skinDark: 0xdcaa83, cheek: 0xecb28c,
  hair: 0xffffff, hairDark: 0xf0eee9,
  tee: 0x1a2236, teeLit: 0x232c44,
  fleece: 0x596069, fleeceLit: 0x6d757f, pouch: 0x79826f,
  pants: 0xc6c8c5, shoe: 0xdcd9d2,
  eye: 0x3a2c24, mouth: 0x7a3630, teeth: 0xf7f3ea,
  shades: 0x53311f, lens: 0x2a1a12,
};

// The passenger seat is still main.js's buildHead() for everybody we do not
// know: a 0.30 x 0.34 x 0.28 skin box at the seat point with a 0.32 x 0.14 x
// 0.30 hair box on top. The seated meshes below deliberately swallow that
// volume whole — skull, jaw and hair cap all reach past it — so main.js can go
// on drawing the anonymous head without it poking out of Margaret's ear.
// smoke_avatars.mjs asserts the bounds, because it is not visible in the code.

// ---------------------------------------------------------------- helpers

// A flat annulus facing +Z, front and back — one lens of a pair of wire rims.
// Two quads a segment; eight segments is enough for a circle you read at three
// metres and cheap enough to spend on the one feature everybody names first.
function ring(b, cx, cy, cz, rIn, rOut, segs, c) {
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const P = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz];
    b.quad(P(a0, rIn), P(a0, rOut), P(a1, rOut), P(a1, rIn), c, [0, 0, 1]);
    b.quad(P(a1, rIn), P(a1, rOut), P(a0, rOut), P(a0, rIn), c, [0, 0, -1]);
  }
}

// Lay a CCW 2-D outline flat on one axis-aligned face, spun by `ang`. Every
// decal on these two goes through here — fronds, the smirk, the smile, the
// crescent eyes — so the winding is got right once instead of four times.
// `dir`: 'z' front, 'zb' back, 'xr' +X side, 'xl' -X side.
function decal(b, dir, cx, cy, cz, pts, ang, c) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const out = [];
  for (const [u, v] of pts) {
    const a = u * ca - v * sa, o = u * sa + v * ca;
    if (dir === 'z') out.push([cx + a, cy + o, cz]);
    else if (dir === 'zb') out.push([cx - a, cy + o, cz]);
    else if (dir === 'xr') out.push([cx, cy + o, cz - a]);
    else out.push([cx, cy + o, cz + a]);
  }
  const n = dir === 'z' ? [0, 0, 1] : dir === 'zb' ? [0, 0, -1]
    : dir === 'xr' ? [1, 0, 0] : [-1, 0, 0];
  b.quad(out[0], out[1], out[2], out[3], c, n);
}

// A rotated rectangle on a face: a brow, a bar of teeth, a crescent eye.
function bar(b, dir, cx, cy, cz, w, h, ang, c) {
  const hw = w / 2, hh = h / 2;
  decal(b, dir, cx, cy, cz, [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], ang, c);
}

// One bold palm frond. The print on the real shirt is enormous magenta leaves
// on near-black, so these are deliberately too big for the panel they sit on.
function frond(b, dir, cx, cy, cz, len, wid, ang, c) {
  const h = len / 2, w = wid / 2;
  decal(b, dir, cx, cy, cz, [[0, h], [-w, h * 0.1], [0, -h], [w, -h * 0.25]], ang, c);
}

// A band bent into a smile: `segs` overlapping bars walking a parabola that
// lifts `rise` metres at the corners. Three bars butted end to end leave gaps
// at the joins and the gaps read as missing teeth, so every bar is half again
// as wide as its share and the run overlaps itself the whole way round.
function arc(b, cx, cy, cz, w, h, rise, c, segs = 5) {
  const hw = w / 2;
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) / segs * 2 - 1;
    const x = t * hw;
    bar(b, 'z', cx + x, cy + rise * t * t, cz, (w / segs) * 1.5, h,
      Math.atan(2 * rise * t / hw), c);
  }
}

// ---------------------------------------------------------------- Sayyad

// The head, centred on `hy`. Shared by the standing and the seated build so he
// is unmistakably the same man whether he is in the driveway or in your truck.
function sayyadHead(b, hy) {
  const skin = rgb(S.skin);
  b.box(0, hy + 0.06, 0, 0.37, 0.28, 0.35, skin, { noBottom: true });
  b.box(0, hy - 0.125, 0, 0.355, 0.17, 0.335, skin, { wTop: 0.372, dTop: 0.352 });
  for (const s of [-1, 1]) b.box(s * 0.192, hy + 0.005, -0.02, 0.035, 0.10, 0.08, skin);
  // Hair: dark on top, and SILVER at the temples. The grey is the second thing
  // anybody says about him, so it is its own geometry high on the sides of the
  // skull, not a lighter shade of the cap.
  b.box(0, hy + 0.245, 0, 0.39, 0.11, 0.37, rgb(S.hair));
  b.box(0, hy + 0.30, -0.02, 0.30, 0.045, 0.28, rgb(S.hair));
  for (const s of [-1, 1]) {
    b.box(s * 0.188, hy + 0.15, 0.02, 0.032, 0.15, 0.28, rgb(S.grey));
    b.box(s * 0.182, hy + 0.03, -0.095, 0.032, 0.13, 0.10, rgb(S.grey));   // sideburn
  }
  // Stubble as decals, not as a block. A jaw painted grey edge to edge reads as
  // a surgical mask; give it a shape — chin, cheeks, sides — and it reads as a
  // man who last shaved on a day he could not name.
  const st = rgb(S.stubble);
  bar(b, 'z', 0, hy - 0.155, 0.180, 0.37, 0.12, 0, st);              // chin and jaw
  for (const s of [-1, 1]) {
    bar(b, 'z', s * 0.135, hy - 0.070, 0.180, 0.105, 0.18, 0, st);   // up the cheeks
    bar(b, s > 0 ? 'xr' : 'xl', s * 0.187, hy - 0.10, 0.015, 0.22, 0.17, 0, st);
  }
  b.box(0, hy - 0.038, 0.191, 0.05, 0.078, 0.042, rgb(S.skinDark));  // nose
  for (const s of [-1, 1]) bar(b, 'z', s * 0.088, hy + 0.045, 0.178, 0.064, 0.054, 0, rgb(S.eye));
  // Brows above the frames, and the right one is up. That look of his is mostly
  // eyebrow: he has already decided what he is about to say.
  bar(b, 'z', -0.09, hy + 0.152, 0.179, 0.105, 0.028, 0.09, rgb(S.hair));
  bar(b, 'z', 0.09, hy + 0.182, 0.179, 0.105, 0.028, -0.17, rgb(S.hair));
  // The smirk: one corner up, and only one.
  bar(b, 'z', 0.012, hy - 0.128, 0.188, 0.125, 0.03, 0.20, rgb(0x4d3028));
  // Round thin wire frames.
  const wire = rgb(S.wire);
  for (const s of [-1, 1]) ring(b, s * 0.088, hy + 0.045, 0.197, 0.062, 0.078, 9, wire);
  b.box(0, hy + 0.045, 0.197, 0.034, 0.014, 0.014, wire);            // bridge
  for (const s of [-1, 1]) b.box(s * 0.186, hy + 0.052, 0.08, 0.014, 0.014, 0.235, wire);
}

// The open shirt: a back, two sides, and two narrow front panels swung out to
// leave a strip of chest showing. The comedy is the gap, so the gap is wide.
function sayyadShirt(b, y0, y1) {
  const dark = rgb(S.shirt), lit = rgb(S.shirtLit);
  const cy = (y0 + y1) / 2, h = y1 - y0;
  b.box(0, cy, -0.115, 0.46, h, 0.055, dark);                        // back
  for (const s of [-1, 1]) b.box(s * 0.222, cy, 0, 0.055, h, 0.24, dark);   // sides
  for (const s of [-1, 1]) {                                         // front panels
    b.box(s * 0.163, cy, 0.093, 0.155, h, 0.06, lit, { yaw: s * 0.20 });
  }
  // The yoke runs wider than the torso so the animated arm's shoulder is always
  // inside something: swing a limb off a 0.46 body and you open a hole.
  b.box(0, y1 - 0.03, 0, 0.56, 0.09, 0.27, dark);
  for (const s of [-1, 1]) {                                         // popped collar
    b.box(s * 0.098, y1 + 0.045, 0.085, 0.13, 0.085, 0.06, lit, { yaw: s * 0.5 });
  }
  // The print. Fronds on both panels, both sides and the back, at angles that
  // do not agree with each other, which is how the real shirt is drawn.
  const f1 = rgb(S.frond), f2 = rgb(S.frondLit);
  frond(b, 'z', -0.165, cy + 0.09, 0.126, 0.22, 0.12, 0.5, f1);
  frond(b, 'z', -0.155, cy - 0.11, 0.126, 0.18, 0.10, -0.9, f2);
  frond(b, 'z', 0.165, cy + 0.05, 0.126, 0.24, 0.12, -0.4, f2);
  frond(b, 'z', 0.158, cy - 0.15, 0.126, 0.17, 0.09, 1.1, f1);
  frond(b, 'xl', -0.251, cy + 0.06, 0.02, 0.24, 0.13, 0.35, f1);
  frond(b, 'xr', 0.251, cy - 0.02, -0.01, 0.26, 0.14, -0.6, f2);
  frond(b, 'zb', 0, cy + 0.04, -0.144, 0.28, 0.16, 0.25, f1);
  frond(b, 'zb', -0.14, cy - 0.12, -0.144, 0.20, 0.11, -0.8, f2);
}

/**
 * Sayyad. `mode` is 'stand' (origin between his feet) or 'seat' (origin at the
 * head centre, which is where main.js draws a passenger). The body only — his
 * left arm is buildSayyadArm(), so it can keep time.
 */
export function buildSayyad(mode = 'stand') {
  const b = new MeshBuilder();
  const skin = rgb(S.skin), dark = rgb(S.shirt), lit = rgb(S.shirtLit);
  if (mode === 'seat') {
    // Seated: head, neck, shoulders and the shirt, and one arm on the door.
    sayyadHead(b, 0.02);
    b.box(0, -0.245, 0, 0.14, 0.11, 0.14, skin);
    sayyadShirt(b, -0.60, -0.30);
    b.box(0, -0.45, 0.055, 0.20, 0.26, 0.055, skin);                 // the chest in the gap
    b.box(-0.295, -0.415, 0.03, 0.12, 0.18, 0.14, dark);             // sleeve, elbow out
    b.box(-0.325, -0.555, 0.10, 0.10, 0.18, 0.115, skin, { dx: 0.02 });
    b.box(0.295, -0.415, 0.03, 0.12, 0.18, 0.14, dark);
    b.box(0.315, -0.565, 0.12, 0.10, 0.18, 0.12, skin, { dx: -0.03 });
    b.box(0.315, -0.50, 0.12, 0.105, 0.035, 0.125, rgb(S.watch));    // the smartwatch
    return b;
  }

  // Standing, mid-move: weight on the back foot, front knee bent, hips turned.
  const hy = 1.52;
  sayyadHead(b, hy);
  b.box(0, hy - 0.255, 0, 0.14, 0.11, 0.14, skin);                   // neck
  b.box(0, 1.13, 0.055, 0.20, 0.40, 0.055, skin);                    // bare chest strip
  b.box(0, 1.10, 0, 0.30, 0.44, 0.19, skin, { noBottom: true });     // torso under the shirt
  sayyadShirt(b, 0.90, 1.34);

  // Right arm: down and forward, fingers pinched — the half of the move that is
  // not doing anything yet. Each joint overlaps the one above it by a couple of
  // centimetres, or the elbow opens up when you look at him from the side.
  b.box(0.285, 1.20, 0.03, 0.135, 0.22, 0.15, dark);                 // short sleeve
  b.box(0.315, 1.005, 0.11, 0.105, 0.23, 0.12, skin, { dx: -0.02, dz: 0.045 });
  b.box(0.30, 0.885, 0.17, 0.10, 0.085, 0.115, skin);                // hand
  b.box(0.315, 1.10, 0.10, 0.115, 0.035, 0.13, rgb(S.watch));        // smartwatch

  // Shorts: dark red terry, a lighter band at the waist.
  b.box(0, 0.83, 0, 0.385, 0.26, 0.27, rgb(S.shorts));
  b.box(0, 0.955, 0, 0.39, 0.05, 0.275, rgb(S.band));
  b.box(0, 0.70, 0, 0.40, 0.05, 0.28, rgb(S.shorts));                // the terry hem flares

  // Bare legs, barefoot. Back leg straight, front leg forward with the heel up:
  // the exact frame of the photograph, which is a man about to say something.
  b.box(-0.135, 0.38, -0.06, 0.14, 0.66, 0.165, skin, { dx: 0.025, dz: 0.06 });
  b.box(-0.115, 0.035, -0.10, 0.14, 0.07, 0.27, skin);
  b.box(0.145, 0.40, 0.10, 0.14, 0.62, 0.165, skin, { dx: -0.03, dz: -0.10 });
  b.box(0.155, 0.075, 0.235, 0.14, 0.15, 0.20, skin, { dz: 0.06 });  // up on the toes
  return b;
}

/**
 * His left arm, origin at the shoulder: bent up, hand pinched at his chest.
 * The cap at the top is a ball joint in all but name — it keeps the armhole
 * filled through the whole swing of the dance.
 */
export function buildSayyadArm() {
  const b = new MeshBuilder();
  const skin = rgb(S.skin);
  b.box(0, -0.015, 0.01, 0.155, 0.16, 0.17, rgb(S.shirt));           // shoulder cap
  b.box(0, -0.135, 0.01, 0.135, 0.22, 0.15, rgb(S.shirt));           // sleeve
  b.box(-0.045, -0.315, 0.10, 0.105, 0.24, 0.12, skin, { dx: 0.06, dz: 0.05 });
  b.box(0.02, -0.43, 0.165, 0.10, 0.09, 0.115, skin);                // the pinch
  return b;
}

// ---------------------------------------------------------------- Margaret

function margaretHead(b, hy) {
  const skin = rgb(M.skin);
  b.box(0, hy + 0.06, 0, 0.37, 0.28, 0.35, skin, { noBottom: true });
  b.box(0, hy - 0.125, 0, 0.35, 0.17, 0.335, skin, { wTop: 0.372, dTop: 0.352 });
  for (const s of [-1, 1]) b.box(s * 0.192, hy + 0.005, -0.02, 0.035, 0.10, 0.08, skin);
  // The hair: short, cropped, and BRIGHT white — a cap over the top, short
  // sides, and the back a half-tone down so the silhouette still has a back.
  const w = rgb(M.hair), wd = rgb(M.hairDark);
  b.box(0, hy + 0.245, 0, 0.40, 0.115, 0.38, w);
  b.box(0, hy + 0.305, -0.01, 0.33, 0.055, 0.32, w);
  // A swept fringe, not a straight helmet edge: the front of the cap dips on
  // one side, which is the whole difference between cropped and bowl-cut.
  b.box(-0.10, hy + 0.198, 0.10, 0.185, 0.07, 0.19, w);
  for (const s of [-1, 1]) b.box(s * 0.194, hy + 0.175, -0.02, 0.04, 0.16, 0.33, w);
  b.box(0, hy + 0.10, -0.187, 0.38, 0.30, 0.045, wd);
  // Eyes: two short bars each, apex in the middle. A single slanted bar reads
  // as a scowl no matter which way you slant it; a shallow ^ is a smile that
  // has got as far as the eyes, which is the only expression she has.
  for (const s of [-1, 1]) {
    for (const k of [-1, 1]) {
      bar(b, 'z', s * 0.093 + k * 0.026, hy + 0.060, 0.178, 0.056, 0.014, -k * 0.34, rgb(M.eye));
      bar(b, 'z', s * 0.096 + k * 0.028, hy + 0.140, 0.177, 0.062, 0.015, -k * 0.22, rgb(0xd9cdbe));
    }
    bar(b, 'z', s * 0.093, hy + 0.034, 0.178, 0.05, 0.026, 0, rgb(M.eye));
  }
  b.box(0, hy - 0.04, 0.188, 0.042, 0.058, 0.03, rgb(M.skinDark), { wTop: 0.05, dTop: 0.036 });
  // Two laugh lines and no rouge. Cheek blocks read as a clown's spots from a
  // metre away; a pair of creases beside the mouth is what the smile does to a
  // face that has been doing it for seventy years.
  for (const s of [-1, 1]) {
    bar(b, 'z', s * 0.118, hy - 0.115, 0.178, 0.02, 0.085, s * 0.22, rgb(M.cheek));
  }
  // The smile. It is a third of her face and it is the whole point of her: a
  // dark arc with a wider one of teeth sitting inside it.
  arc(b, 0, hy - 0.138, 0.180, 0.175, 0.055, 0.028, rgb(M.mouth));
  arc(b, 0, hy - 0.126, 0.187, 0.155, 0.033, 0.025, rgb(M.teeth));
}

/**
 * Margaret. Same two modes as Sayyad; her right arm is buildMargaretArm(),
 * already half raised, because she starts waving before you have parked.
 */
export function buildMargaret(mode = 'stand') {
  const b = new MeshBuilder();
  const skin = rgb(M.skin), tee = rgb(M.tee), fl = rgb(M.fleece);
  if (mode === 'seat') {
    margaretHead(b, 0.02);
    b.box(0, -0.245, 0, 0.135, 0.11, 0.135, skin);
    b.box(0, -0.47, 0, 0.47, 0.38, 0.30, tee, { noBottom: true });
    b.box(0, -0.305, 0, 0.42, 0.08, 0.285, rgb(M.teeLit));
    b.box(-0.285, -0.40, 0, 0.12, 0.18, 0.26, tee);                  // sleeve
    b.box(-0.315, -0.565, 0.075, 0.10, 0.21, 0.13, skin, { dx: 0.03 });
    b.box(0.285, -0.40, 0, 0.12, 0.18, 0.26, tee);
    b.box(0.315, -0.565, 0.075, 0.10, 0.21, 0.13, skin, { dx: -0.03 });
    // Sunglasses hooked on the collar, slightly crooked. They live there.
    b.box(0.055, -0.325, 0.15, 0.13, 0.028, 0.03, rgb(M.shades), { yaw: 0.25 });
    for (const s of [-1, 1]) b.box(0.055 + s * 0.055, -0.365, 0.15, 0.055, 0.055, 0.025, rgb(M.lens));
    return b;
  }

  const hy = 1.40;
  margaretHead(b, hy);
  b.box(0, hy - 0.255, 0, 0.135, 0.11, 0.135, skin);
  b.box(0, 1.00, 0, 0.46, 0.40, 0.29, tee, { noBottom: true });      // navy tee
  b.box(0, 1.17, 0, 0.53, 0.08, 0.285, rgb(M.teeLit));               // shoulders, and the armhole
  b.box(-0.285, 1.10, 0, 0.125, 0.18, 0.26, tee);                    // left short sleeve
  b.box(-0.305, 0.90, 0.045, 0.10, 0.24, 0.13, skin, { dx: 0.02 });  // bare forearm
  b.box(-0.29, 0.765, 0.065, 0.10, 0.085, 0.115, skin);              // hand
  b.box(0.055, 1.145, 0.15, 0.13, 0.028, 0.03, rgb(M.shades), { yaw: 0.25 });
  for (const s of [-1, 1]) b.box(0.055 + s * 0.055, 1.105, 0.15, 0.055, 0.055, 0.025, rgb(M.lens));

  // The fleece round the waist. Not an accessory: it is most of her silhouette
  // from the hips down, a grey drape with the sleeves knotted at the front.
  b.box(0, 0.71, -0.01, 0.525, 0.32, 0.355, fl, { noBottom: true });
  b.box(0, 0.845, 0, 0.545, 0.10, 0.37, rgb(M.fleeceLit));           // the rolled top edge
  b.box(0.02, 0.835, 0.195, 0.15, 0.14, 0.11, rgb(M.fleeceLit));     // the knot
  b.box(-0.095, 0.645, 0.185, 0.11, 0.32, 0.085, fl, { dx: -0.05 }); // sleeves hanging down
  b.box(0.115, 0.615, 0.185, 0.115, 0.36, 0.085, fl, { dx: 0.05 });
  b.box(0.185, 0.725, 0.21, 0.13, 0.155, 0.085, rgb(M.pouch));       // the little pouch
  b.box(0.185, 0.79, 0.217, 0.135, 0.022, 0.08, rgb(0x555c50));      // its zip

  // Pale grey sweatpants and a pair of white sneakers.
  for (const s of [-1, 1]) {
    b.box(s * 0.115, 0.36, 0, 0.175, 0.60, 0.20, rgb(M.pants), { noBottom: true });
    b.box(s * 0.115, 0.045, 0.03, 0.165, 0.09, 0.27, rgb(M.shoe));
  }
  return b;
}

/** Her right arm, origin at the shoulder: up, hand open, already waving. */
export function buildMargaretArm() {
  const b = new MeshBuilder();
  const skin = rgb(M.skin), tee = rgb(M.tee);
  b.box(0.015, -0.02, 0, 0.16, 0.17, 0.28, tee);                     // shoulder cap
  b.box(0.08, 0.08, 0, 0.13, 0.23, 0.155, tee, { dx: 0.04 });        // short sleeve
  b.box(0.15, 0.31, 0.01, 0.11, 0.30, 0.13, skin, { dx: 0.02 });     // forearm
  b.box(0.185, 0.525, 0.015, 0.155, 0.16, 0.13, skin);               // open hand
  return b;
}

// ---------------------------------------------------------------- Mike

// Mike McDonald, 129 avenue Frank-Robinson, who owns the couch that ends up in
// the tree. Both photographs of him are the same photograph: mid-word, leaning
// in, both hands up and open in front of him, three points into an argument
// nobody asked for. So that is the model — the gesture is the man, and the idle
// animation is his hands doing the talking.
//
// The rest: mid-length wavy brown hair pushed back off the forehead (it is the
// tallest thing about him), thin dark rectangular frames — the anti-Sayyad —
// clean-shaven, and a white shirt with fine brown pinstripes tucked into dark
// trousers.
const K = {
  skin: 0xe9bd9b, skinDark: 0xd3a687,
  hair: 0x5a4230, hairLit: 0x6d5340,
  shirt: 0xeeeae2, shirtLit: 0xf6f3ed, stripe: 0x8a7360,
  pants: 0x30323a, shoe: 0x1e1c1a,
  eye: 0x241f1d, frame: 0x211d1c, mouth: 0x6d3c34,
};

// Fine vertical pinstripes on one face of the shirt. Six or seven of them at
// two centimetres reads, from the driver's seat, as exactly the shirt in the
// photograph; drawing the real dozen would just be moiré.
function pinstripes(b, dir, cx, cy, cz, w, h, n, c) {
  for (let i = 0; i < n; i++) {
    bar(b, dir, cx + ((i + 0.5) / n - 0.5) * w, cy, cz, 0.016, h, 0, c);
  }
}

function mikeHead(b, hy) {
  const skin = rgb(K.skin);
  b.box(0, hy + 0.06, 0, 0.36, 0.28, 0.34, skin, { noBottom: true });
  b.box(0, hy - 0.13, 0, 0.335, 0.18, 0.325, skin, { wTop: 0.352, dTop: 0.342 });
  for (const s of [-1, 1]) b.box(s * 0.187, hy + 0.005, -0.02, 0.035, 0.10, 0.08, skin);
  // The hair. It has more volume than anything else on him and it is all
  // pushed back, so the mass sits high and behind: a cap, a swept crest that
  // overhangs the back of the skull, and a wave over each ear.
  const h = rgb(K.hair), hl = rgb(K.hairLit);
  b.box(0, hy + 0.265, 0, 0.385, 0.115, 0.37, hl);
  b.box(0, hy + 0.345, -0.02, 0.36, 0.09, 0.34, h, { dz: -0.06 });
  b.box(0, hy + 0.16, -0.185, 0.36, 0.30, 0.06, h);
  for (const s of [-1, 1]) b.box(s * 0.192, hy + 0.135, -0.03, 0.045, 0.24, 0.32, hl);
  // Thin dark rectangular frames, drawn flat on the face and standing off it
  // by a millimetre — four bars and a bridge, plus real arms back to the ears
  // so they survive being looked at from the side.
  const fr = rgb(K.frame);
  for (const s of [-1, 1]) {
    const cx = s * 0.093, cy = hy + 0.042, lw = 0.115, lh = 0.062;
    bar(b, 'z', cx, cy + lh / 2, 0.184, lw, 0.012, 0, fr);
    bar(b, 'z', cx, cy - lh / 2, 0.184, lw, 0.012, 0, fr);
    bar(b, 'z', cx - lw / 2, cy, 0.184, 0.012, lh, 0, fr);
    bar(b, 'z', cx + lw / 2, cy, 0.184, 0.012, lh, 0, fr);
    b.box(s * 0.182, hy + 0.048, 0.07, 0.012, 0.012, 0.24, fr);
    bar(b, 'z', s * 0.093, hy + 0.042, 0.180, 0.055, 0.038, 0, rgb(K.eye));
  }
  b.box(0, hy + 0.042, 0.185, 0.045, 0.012, 0.012, fr);              // bridge
  // Brows up: he is making the point, not receiving it.
  for (const s of [-1, 1]) bar(b, 'z', s * 0.092, hy + 0.113, 0.178, 0.10, 0.022, -s * 0.10, rgb(K.hair));
  b.box(0, hy - 0.035, 0.188, 0.045, 0.075, 0.036, rgb(K.skinDark));
  // Mouth open, mid-word. Taller than it is wide at the middle, which is what
  // separates « talking » from « smiling » in four triangles.
  bar(b, 'z', 0, hy - 0.128, 0.177, 0.088, 0.058, 0, rgb(K.mouth));
  bar(b, 'z', 0, hy - 0.107, 0.180, 0.074, 0.017, 0, rgb(0xf2ece1));
}

/**
 * Mike. Body only, standing or seated; his two arms are buildMikeArm(side) and
 * they are the whole point of him.
 */
export function buildMike(mode = 'stand') {
  const b = new MeshBuilder();
  const shirt = rgb(K.shirt), st = rgb(K.stripe);
  const torso = (cy, h) => {
    b.box(0, cy, 0, 0.42, h, 0.25, shirt, { noBottom: true });
    b.box(0, cy + h / 2 - 0.03, 0, 0.50, 0.08, 0.26, shirt);         // shoulders
    pinstripes(b, 'z', 0, cy, 0.127, 0.36, h - 0.02, 7, st);
    pinstripes(b, 'zb', 0, cy, -0.127, 0.36, h - 0.02, 6, st);
    pinstripes(b, 'xr', 0.211, cy, 0, 0.20, h - 0.02, 3, st);
    pinstripes(b, 'xl', -0.211, cy, 0, 0.20, h - 0.02, 3, st);
    bar(b, 'z', 0, cy, 0.128, 0.012, h - 0.02, 0, rgb(0xcfc8bc));    // the button placket
    for (const s of [-1, 1]) {                                       // open collar
      b.box(s * 0.085, cy + h / 2 + 0.035, 0.085, 0.12, 0.07, 0.055,
        rgb(K.shirtLit), { yaw: s * 0.45 });
    }
  };

  if (mode === 'seat') {
    mikeHead(b, 0.02);
    b.box(0, -0.25, 0, 0.13, 0.12, 0.13, rgb(K.skin));
    torso(-0.50, 0.44);
    // Seated, the gesture is baked in: both forearms up and forward over the
    // dashboard, because he has not stopped talking since Frank-Robinson.
    for (const s of [-1, 1]) {
      b.box(s * 0.235, -0.42, 0.01, 0.115, 0.24, 0.14, shirt, { dz: -0.03 });
      b.box(s * 0.215, -0.50, 0.155, 0.10, 0.115, 0.28, shirt);
      mikeHand(b, s, s * 0.185, -0.48, 0.325);
    }
    return b;
  }

  const hy = 1.50;
  mikeHead(b, hy);
  b.box(0, hy - 0.255, 0, 0.13, 0.12, 0.13, rgb(K.skin));            // neck
  torso(1.14, 0.42);
  // Dark trousers, shirt tucked in, and a pair of shoes he lectures in.
  b.box(0, 0.88, 0, 0.375, 0.20, 0.255, rgb(K.pants));
  for (const s of [-1, 1]) {
    b.box(s * 0.118, 0.46, 0, 0.155, 0.66, 0.20, rgb(K.pants), { noBottom: true });
    b.box(s * 0.12, 0.045, 0.02, 0.16, 0.09, 0.265, rgb(K.shoe));
  }
  return b;
}

// An open hand, palm out, fingers spread: three fingers and a thumb splayed off
// a flat palm. It is sixty triangles and it is the reason anybody will know who
// this is.
function mikeHand(b, s, cx, cy, cz) {
  const skin = rgb(K.skin);
  b.box(cx, cy, cz, 0.115, 0.115, 0.05, skin);
  for (let k = 0; k < 3; k++) {
    b.box(cx + (k - 1) * 0.036, cy + 0.10, cz, 0.028, 0.10, 0.042, skin,
      { dx: (k - 1) * 0.028 });
  }
  b.box(cx - s * 0.075, cy - 0.015, cz, 0.075, 0.032, 0.046, skin, { dx: -s * 0.03 });
}

/** One of Mike's arms, origin at the shoulder, forearm up and hand open. */
export function buildMikeArm(side = 1) {
  const b = new MeshBuilder();
  const shirt = rgb(K.shirt);
  b.box(0, -0.02, 0, 0.14, 0.15, 0.19, shirt);                       // shoulder cap
  b.box(side * 0.015, -0.155, 0.01, 0.115, 0.25, 0.14, shirt, { dz: 0.035 });
  b.box(side * 0.05, -0.235, 0.155, 0.105, 0.115, 0.30, shirt);      // forearm, forward
  mikeHand(b, side, side * 0.045, -0.215, 0.335);
  pinstripes(b, 'z', side * 0.015, -0.155, 0.083, 0.09, 0.22, 3, rgb(K.stripe));
  return b;
}

// ---------------------------------------------------------------- Zahra

// Sayyad's younger sister, who was at Symmes Junior High in 2004 and who has
// heard every one of her brother's stories. Same family as him — same skin,
// the same dark hair — and everything else is the opposite: long hair instead
// of a crop, arms folded instead of dancing, and a face that has already
// decided this is not interesting. She does not wave and she does not get in
// anybody's truck; she stands on the same lawn and waits for you to leave.
const Z = {
  skin: 0xc9976b, skinDark: 0xac7f56,
  hair: 0x241d1a, hairLit: 0x33291f,
  tee: 0x2f6f68, teeLit: 0x3c8880, print: 0xe9e2d4,
  jeans: 0x38455c, jeansLit: 0x475673, belt: 0x1b1a18, stud: 0xb9b4ab,
  shoe: 0xe6e2d8, sole: 0x2a2724, cans: 0x2c3036, cansPad: 0x777d86,
  eye: 0x241d19, mouth: 0x6b4237,
};

function zahraHead(b, hy) {
  const skin = rgb(Z.skin);
  b.box(0, hy + 0.06, 0, 0.36, 0.28, 0.34, skin, { noBottom: true });
  b.box(0, hy - 0.125, 0, 0.335, 0.17, 0.325, skin, { wTop: 0.362, dTop: 0.342 });
  // Long straight dark hair: a cap, a curtain down each side of the face and a
  // slab down the back past the shoulder blades. It is the whole silhouette —
  // at thirty metres she is the one with hair.
  const h = rgb(Z.hair), hl = rgb(Z.hairLit);
  b.box(0, hy + 0.235, 0, 0.385, 0.115, 0.365, hl);
  for (const s of [-1, 1]) b.box(s * 0.196, hy + 0.06, -0.02, 0.05, 0.42, 0.34, h);
  b.box(0, hy - 0.10, -0.19, 0.37, 0.72, 0.06, h);
  b.box(-0.08, hy + 0.20, 0.16, 0.20, 0.09, 0.06, hl);               // a fringe, swept
  // Eyes half shut, one brow up, and a mouth that is a flat line. Every part
  // of this is « ...ouais ».
  for (const s of [-1, 1]) bar(b, 'z', s * 0.088, hy + 0.045, 0.174, 0.062, 0.032, 0, rgb(Z.eye));
  bar(b, 'z', -0.09, hy + 0.115, 0.175, 0.095, 0.02, 0.05, rgb(Z.hair));
  bar(b, 'z', 0.09, hy + 0.142, 0.175, 0.095, 0.02, -0.20, rgb(Z.hair));
  b.box(0, hy - 0.04, 0.184, 0.042, 0.062, 0.032, rgb(Z.skinDark));
  bar(b, 'z', -0.005, hy - 0.135, 0.176, 0.105, 0.022, 0.04, rgb(Z.mouth));
  // The headphones. 2004: big cans over the ears, cable down the front, and
  // she is not taking them off for this conversation.
  // They have to sit OUTSIDE the curtain of hair and they have to be a grey
  // that is not her hair, or the one prop that dates her to 2004 is invisible.
  for (const s of [-1, 1]) {
    b.box(s * 0.248, hy + 0.03, -0.01, 0.07, 0.17, 0.16, rgb(Z.cans));
    b.box(s * 0.207, hy + 0.03, -0.01, 0.025, 0.125, 0.115, rgb(Z.cansPad));
    b.box(s * 0.245, hy + 0.16, -0.01, 0.035, 0.26, 0.06, rgb(Z.cans));
  }
  // The band sits ON the hair, not above it: she is the shortest of the four
  // and a headphone arch that clears her own head takes that away.
  b.box(0, hy + 0.285, -0.01, 0.50, 0.05, 0.08, rgb(Z.cansPad));
}

/** Zahra. Standing only: she is never a passenger, so there is no seated build. */
export function buildZahra() {
  const b = new MeshBuilder();
  const skin = rgb(Z.skin), tee = rgb(Z.tee);
  const hy = 1.36;
  zahraHead(b, hy);
  b.box(0, hy - 0.25, 0, 0.125, 0.10, 0.125, skin);                  // neck
  b.box(0, 0.98, 0, 0.40, 0.36, 0.235, tee, { noBottom: true });     // tee
  b.box(0, 1.135, 0, 0.44, 0.075, 0.245, rgb(Z.teeLit));
  bar(b, 'z', 0, 1.00, 0.121, 0.16, 0.10, 0, rgb(Z.print));          // whatever band it is
  // Arms folded. The fold is two forearms crossing in front of the tee, which
  // is a pose you can build out of four boxes and cannot mistake for anything.
  for (const s of [-1, 1]) {
    b.box(s * 0.245, 1.07, 0, 0.105, 0.24, 0.20, tee);               // upper arm
  }
  b.box(-0.055, 0.945, 0.155, 0.40, 0.10, 0.105, skin, { yaw: 0.10 });
  b.box(0.055, 0.862, 0.145, 0.40, 0.10, 0.105, skin, { yaw: -0.10 });
  b.box(-0.245, 0.868, 0.135, 0.10, 0.115, 0.115, skin);             // hands tucked
  b.box(0.245, 0.95, 0.145, 0.10, 0.115, 0.115, skin);
  // Low-rise bootcut jeans with the studded belt of the year, and a pair of
  // white sneakers she is not allowed to wear in the house.
  b.box(0, 0.80, 0, 0.385, 0.10, 0.255, rgb(Z.belt));
  for (let i = -2; i <= 2; i++) b.box(i * 0.065, 0.80, 0.132, 0.03, 0.03, 0.02, rgb(Z.stud));
  b.box(0, 0.62, 0, 0.39, 0.28, 0.26, rgb(Z.jeansLit));
  for (const s of [-1, 1]) {
    b.box(s * 0.105, 0.30, 0, 0.165, 0.42, 0.19, rgb(Z.jeans), { wTop: 0.185, dTop: 0.21 });
    b.box(s * 0.11, 0.075, 0.015, 0.175, 0.09, 0.255, rgb(Z.shoe));
    b.box(s * 0.11, 0.02, 0.015, 0.18, 0.04, 0.26, rgb(Z.sole));
  }
  return b;
}

// ---------------------------------------------------------------- the cast

// Everything the draw loop needs to know about a person, in one place. `home`
// is a PLACES key: they stand on the lawn side of it, facing the road, which is
// also the circle the `gang` job sends you to.
// `arms` are the pieces that move: each is a builder plus the shoulder it hangs
// from, in body-local metres. `idle(t, o)` writes this frame's pose into a
// scratch record — body bob / roll / yaw, then two numbers per arm — so the
// personality of the animation lives beside the person instead of in an
// if-chain halfway down the draw loop.
export const CAST = {
  sayyad: {
    name: 'Sayyad', home: 'steph', off: 4.6,
    body: buildSayyad,
    arms: [{ build: buildSayyadArm, at: [-0.268, 1.288, 0.01] }],
    idle(t, o) {
      const k = t * 4.4;
      o.bob = Math.abs(Math.sin(k)) * 0.045;      // on the balls of his feet
      o.roll = Math.sin(k * 0.5) * 0.075;
      o.yaw = Math.sin(k * 0.25) * 0.16;
      o.arm[0] = Math.sin(k + 1) * 0.35;
      o.arm[1] = -0.5 + Math.sin(k) * 0.45;
    },
  },
  margaret: {
    name: 'Margaret', home: 'margaret',
    body: buildMargaret,
    arms: [{ build: buildMargaretArm, at: [0.245, 1.165, 0] }],
    idle(t, o) {
      const k = t * 2.9;
      o.bob = Math.sin(k) * 0.008;
      o.roll = 0; o.yaw = 0;
      o.arm[0] = 0;
      o.arm[1] = Math.sin(k * 1.6) * 0.42;       // the wave
    },
  },
  // Mike stands seven metres up his own kerb from nothing in particular, and
  // both hands go the whole time. The two arms run a beat apart so they never
  // move as one block, which is the difference between gesturing and semaphore.
  mike: {
    name: 'Mike', home: 'mike',
    body: buildMike,
    arms: [
      { build: () => buildMikeArm(-1), at: [-0.235, 1.29, 0.02] },
      { build: () => buildMikeArm(1), at: [0.235, 1.29, 0.02] },
    ],
    idle(t, o) {
      const k = t * 3.3;
      o.bob = Math.sin(k * 0.5) * 0.012;
      o.roll = 0;
      o.yaw = Math.sin(k * 0.31) * 0.10;         // turning to whoever is listening
      o.arm[0] = Math.sin(k) * 0.30;
      o.arm[1] = Math.sin(k * 0.7) * 0.16;
      o.arm[2] = Math.sin(k + 1.9) * 0.30;
      o.arm[3] = Math.sin(k * 0.7 + 1.1) * 0.16;
    },
  },
  // Zahra stands at her brother's, five metres up the kerb so the two of them
  // are not in each other's mesh. No arms: folded arms do not move, which is
  // the point of them.
  zahra: {
    name: 'Zahra', home: 'steph', off: 4.6, along: 5.0, seatless: true,
    body: buildZahra, arms: [],
    idle(t, o) {
      const k = t * 0.9;
      o.bob = 0;
      o.roll = Math.sin(k * 0.31) * 0.045;       // one weight shift a minute
      o.yaw = Math.sin(k * 0.17) * 0.30;
    },
  },
};

// Jobs during which somebody is not on their own lawn, because the job says so:
// « Réveiller Sayyad » only works if he is asleep inside, he spends both of his
// races in the Civic, and Mike spends « Le divan dans l'arbre » round the back.
const AWAY = {
  sayyad: ['sayyad', 'racecivic', 'blitz'], margaret: [], mike: ['divan'], zahra: [],
};

// Which pickup circle belongs to whom. The `steph` / `marc` keys in missions.js
// and places.js are historical placeholder ids and never reach the player; this
// is the one table that maps them onto the people they turned into.
export const FRIEND_AT = {
  steph: 'sayyad', sayyad: 'sayyad',
  home: 'margaret', margaret: 'margaret',
  mike: 'mike',
};

/**
 * Who is in the car right now, in seat order. Read off the mission's completed
 * stages rather than stored anywhere: a stage with `passengers: +1` at a known
 * address puts that person aboard, and a negative one empties the front of the
 * list, which is the order they get out at the beach. Anyone we do not have a
 * face for rides as null and main.js's anonymous head covers them.
 */
export function riders(G, out = []) {
  out.length = 0;
  const m = G && G.mission;
  if (!m || !m.stages) return out;
  const n = Math.min(m.idx || 0, m.stages.length);
  for (let i = 0; i < n; i++) {
    const st = m.stages[i] || {};
    const p = st.passengers || 0;
    if (p > 0) {
      const who = typeof st.at === 'string' ? (FRIEND_AT[st.at] || null) : null;
      for (let k = 0; k < p; k++) out.push(k === 0 ? who : null);
    } else if (p < 0) {
      out.splice(0, Math.min(out.length, -p));
    }
  }
  return out;
}

/**
 * Where somebody stands when they are waiting for you: LAWN metres off the road
 * toward their own house, facing the road. Same trick as main.js's lotSpot —
 * `bx`/`bz` is where the building actually is, `x`/`z` where the kerb is.
 * Returns null before resolvePlaces() has run.
 */
export function standSpot(who) {
  const c = CAST[who];
  const p = c && PLACES[c.home];
  if (!p) return null;
  let dx = (p.bx == null ? p.x : p.bx) - p.x, dz = (p.bz == null ? p.z : p.bz) - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) { const a = p.a || 0; dx = Math.cos(a); dz = -Math.sin(a); }
  else { dx /= d; dz /= d; }
  // `along` slides them up the kerb: the tangent is the road direction, which
  // is the inward normal turned a quarter.
  const a = c.along || 0;
  const off = c.off || LAWN;
  return {
    x: p.x + dx * off - dz * a,
    z: p.z + dz * off + dx * a,
    yaw: Math.atan2(-dx, -dz),
  };
}

// How far off the snapped kerb point somebody waits, unless CAST gives them
// their own `off`. Four metres left Margaret standing on the centre line of
// Chemin Fraser, which is four lanes wide where she lives; six and a half
// clears it and is still well inside the thirteen-metre pickup circle. Denise-
// Friend is one lane each way and six and a half put Sayyad on his own porch,
// so the two of them at that address get a shorter one.
const LAWN = 6.5;

// ---------------------------------------------------------------- draw

const DRAW_R = 150;          // past this you would not know it was them anyway
const HELLO_R = 16;          // ...and inside this, standing still, they talk
const HELLO_GAP = 25;        // seconds before the same person says another line

// Seated idle, per person: [rate, bob, roll, yaw].
const SEAT_IDLE = {
  sayyad: [5.2, 0.022, 0.07, 0],
  margaret: [1.1, 0.006, 0, 0.22],
  mike: [3.0, 0.010, 0.02, 0.16],
  default: [1.1, 0.006, 0, 0.06],
};

const mm = m4.create();

export class Avatars {
  constructor(renderer) {
    this.mesh = {};
    this.t = 0;
    this.hello = {};          // who -> when they last said something
    this.said = {};           // who -> which line is next, so the pool rotates
    this.riding = {};         // who was aboard last frame, so a change is a cue
    this.spoke = {};          // ...and which of their ride lines comes next
    this.spots = null;        // resolved lazily: PLACES is snapped after load
    this.aboard = [];         // scratch for riders(); draw() allocates nothing
    this.keys = Object.keys(CAST);
    // One pose record, refilled per person per frame by CAST[who].idle().
    // Four arm numbers is two arms, which is as many as anybody here has.
    this.pose = { bob: 0, roll: 0, yaw: 0, arm: [0, 0, 0, 0] };
    for (const key of this.keys) {
      const c = CAST[key];
      this.mesh[key] = renderer ? {
        stand: renderer.upload(c.body('stand')),
        seat: c.seatless ? null : renderer.upload(c.body('seat')),
        arms: (c.arms || []).map((a) => renderer.upload(a.build())),
      } : null;
    }
  }

  /** Cached stand positions. PLACES is snapped to the road once, at load. */
  spotFor(who) {
    if (!this.spots) this.spots = {};
    if (this.spots[who] === undefined) this.spots[who] = standSpot(who);
    return this.spots[who];
  }

  /**
   * One frame. Draws whoever is aboard in the passenger seats and whoever is
   * still waiting in their driveway, and lets the waiting ones say hello.
   */
  draw(r, focus, G, dt = 0) {
    if (!r || !focus) return 0;
    this.t += dt;
    let n = 0;
    const aboard = riders(G, this.aboard);

    // --- in the car ------------------------------------------------------
    const v = G && G.veh;
    if (v && v.spec && aboard.length) {
      const seats = Vehicle.prototype.seatPositions.call({ spec: v.spec });
      const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
      for (let i = 0; i < aboard.length && i < seats.length; i++) {
        const who = aboard[i];
        const mesh = who && this.mesh[who];
        if (!mesh || !mesh.seat) continue;
        const [lx, ly, lz] = seats[i];
        // Sayyad keeps time with whatever is on the radio, Margaret looks out
        // the window at what you nearly hit, Mike carries on talking. Three
        // numbers, and the +i keeps two passengers off the same beat.
        const p = SEAT_IDLE[who] || SEAT_IDLE.default;
        const beat = this.t * p[0] + i;
        m4.compose(mm, v.x + lx * cy + lz * sy,
          (v.bodyY || 0) + ly + Math.sin(beat) * p[1],
          v.z - lx * sy + lz * cy,
          v.yaw + Math.sin(beat * 0.7) * p[3], 0, Math.sin(beat * 0.5) * p[2]);
        r.draw(mesh.seat, mm);
        n++;
      }
    }

    // Somebody who was not aboard last frame and is now has just got in, and
    // somebody who was and is not has just got out. That is the whole cue for
    // the twelve start and twelve end lines each of them has in
    // assets/text/dialogue.json.
    for (const who of this.keys) {
      const now = aboard.indexOf(who) >= 0;
      if (now === !!this.riding[who]) continue;
      this.riding[who] = now;
      const k = this.spoke[who] = ((this.spoke[who] || 0) + 1);
      const line = personLine(CAST[who].name, now ? 'start' : 'end', k - 1);
      if (line) heckle.line(CAST[who].name, line, 3400);
    }

    // --- waiting in the driveway ----------------------------------------
    const job = (G && G.mission && G.mission.def && G.mission.def.id) || '';
    for (const who of this.keys) {
      if (aboard.indexOf(who) >= 0) continue;
      if (AWAY[who].indexOf(job) >= 0) continue;
      const s = this.spotFor(who);
      if (!s) continue;
      const dx = s.x - focus.x, dz = s.z - focus.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > DRAW_R * DRAW_R) continue;
      const gy = (G && G.phys && G.phys.groundY) ? G.phys.groundY(s.x, s.z) : 0;
      const mesh = this.mesh[who];
      if (!mesh) continue;

      const c = CAST[who];
      const o = this.pose;
      o.bob = 0; o.roll = 0; o.yaw = 0;
      for (let k = 0; k < o.arm.length; k++) o.arm[k] = 0;
      if (c.idle) c.idle(this.t, o);
      const yaw = s.yaw + o.yaw;
      m4.compose(mm, s.x, gy + o.bob, s.z, yaw, 0, o.roll);
      r.draw(mesh.stand, mm);
      n++;
      // The arms that move. Each one's origin is its shoulder, so the world
      // point is the shoulder offset turned by the body's own yaw — the same
      // trick peds.js uses to hang a leg off a hip. `idle` supplies two numbers
      // per arm: pitch swings it forward, roll swings it out.
      const ca = Math.cos(yaw), sa = Math.sin(yaw);
      for (let k = 0; k < mesh.arms.length; k++) {
        const [ax, ay, az] = c.arms[k].at;
        m4.compose(mm, s.x + ax * ca + az * sa, gy + o.bob + ay, s.z - ax * sa + az * ca,
          yaw, o.arm[k * 2], o.roll + o.arm[k * 2 + 1]);
        r.draw(mesh.arms[k], mm);
        n++;
      }

      // « Heille » from the lawn, once you are close and not still doing 60.
      if (d2 < HELLO_R * HELLO_R && Math.abs((G && G.veh && G.veh.vLong) || 0) < 8) {
        const last = this.hello[who];
        if (last === undefined || this.t - last > HELLO_GAP) {
          this.hello[who] = this.t;
          // Rotate the pool rather than rolling for it: four lines picked at
          // random repeat inside a minute and the repeat is what you notice.
          const k = this.said[who] = ((this.said[who] || 0) + 1);
          // Zahra never rides, so her twelve « start » lines would never be
          // heard and her eight about-her-brother ones only apply while he is
          // out here too. She alternates between the two rather than living off
          // the four written in this module.
          const line = (who === 'zahra'
            && (k % 2 === 0 && AWAY.sayyad.indexOf(job) < 0
              ? personLine('Zahra', 'about-sayyad', k / 2)
              : personLine('Zahra', 'start', (k - 1) >> 1)))
            || greeting(who, k - 1);
          if (line) heckle.line(CAST[who].name, line, 3200);
        }
      }
    }
    return n;
  }
}

export { DRAW_R, HELLO_R };
