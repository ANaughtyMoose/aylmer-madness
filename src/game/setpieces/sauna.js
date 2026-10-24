// Mission 7, « Le sauna de cèdre » (id stvincent).
//
// As Tom told it (D31, 13 Oct 2026; docs/STORY-LEDGER.md): Tom and Sayyad drive
// to Tom's job as préposé aux repas at St. Vincent hospital, on Cambridge in
// Ottawa. Sayyad lays a piece of cedar from his fence across the dash and
// pours water on it. While Tom works his shift, Sayyad walks to NASA, the
// Indian grocery on Somerset (a public business), and gets samosas.
// Game invention Tom approved: the balance (too little water and the cab
// cooks, too much and steam everywhere, the electrics short out with sparks).
// Sayyad speaks English (Tom, 6 Oct and 20 Oct); his tic is « OK OK OK », his
// subject is Macs (story.js ledger).
//
// Stages:
//   0. Sayyad's fence: stop, E, the cedar goes on the dash. Sayyad gets in.
//   1. Leg 1, Aylmer (sauna_heat.js balance on F). Once the truck is within
//      CUT_CROW_M of the hospital, a 0.5 s fade to black: the long middle is
//      cut, and the truck comes back LEG2_M before the hospital on Booth.
//   2. Leg 2, Ottawa downtown, the same toy to the hospital lot. The sauna's
//      grade and bonus are paid on arrival.
//   3. The lot: E to go in. Sayyad walks off toward Somerset and NASA.
//   4. The meal service (mealshift.js), unchanged. 40 $.
//   5. The lot again: Sayyad is back with the samosas. E takes one.
//
// No clock. The toy never fails on a slip; the two fails are jokes with R to
// retry the leg at once: bone dry for COOK_FAIL_S (« Coup de chaleur »), or the
// SHORT_FAIL-th short circuit (the dash drowns). Both fail texts carry a word
// retry.js classifies as 'heat', so the card gets the sauna gag.
import { openMealShift } from '../mealshift.js';
import { resolveAt } from '../missionkit.js';
import { pointBeforeEnd } from './nuittim.js';
import {
  newSauna, saunaStep, pour, saunaResult, saunaBonus, saunaGrade, trafficNear, fogOf,
  openSaunaFx, listenPour, BAND_LO, DEEP_COOK, DEEP_FOG, SLUG_KMH, LIMP_S, LIMP_KMH,
  RADIO_OUT_S, COOK_FAIL_S, SHORT_FAIL, PINNED_S,
} from './sauna_heat.js';

// ---------------------------------------------------------------- tuning
// Seconds between two of Sayyad's zone lines (events may cut in after EVENT_GAP).
export const TALK_GAP = 8;
const EVENT_GAP = 2.5;
// Radius of the drive's finish circle at the hospital (m): the lot.
export const LOT_R = 40;
// The cut (measured on 2fb304c with Nav, smoke_sp_sauna checks the lengths):
// leg 1 ends at this crow distance from the hospital, about 1,290 m of route
// from Sayyad's, on Chemin d'Aylmer; leg 2 restarts this far of route before
// the hospital, on Booth Street, from where a fresh route is about 890 m.
export const CUT_CROW_M = 9900;
export const LEG2_M = 900;
const FADE_S = 0.5;
// The third short drowns the dash: this long of sparks before the fail card.
const DROWN_S = 1.2;

// ---------------------------------------------------------------- lines
// Sayyad, English, <= 12 words, as [who, text] so tools/smoke_lang.mjs sees
// every one. Played through heckle.line (one at a time, the story queue).
export const SAUNA_LINES = {
  plank: [['Sayyad', '« It’s one plank. The fence has like a hundred. Nobody counts. »']],
  ok: [
    ['Sayyad', '« Okay. That’s a sauna. That’s an actual Finnish sauna. »'],
    ['Sayyad', '« If Apple made a truck, it would smell like this. »'],
    ['Sayyad', '« This beats air conditioning. I’m serious. »'],
  ],
  cook: [
    ['Sayyad', '« Tom, I’m cooking. I’m actually cooking. Water. Water! »'],
    ['Sayyad', '« I can’t see straight. Is that the heat or the road? »'],
  ],
  pinned: [['Sayyad', '« My seat belt buckle is a branding iron now. »']],
  fog: [
    ['Sayyad', '« Too much! I can’t see the road. Can you see it? »'],
    ['Sayyad', '« That’s not a sauna anymore. That’s a car wash. »'],
  ],
  short1: [['Sayyad', '« OK OK OK. Was that the radio? That was the radio. »']],
  short2: [['Sayyad', '« Why is it honking? Why is it honking by itself? »']],
  spill: [['Sayyad', '« Easy! The jug is on my lap! »']],
  lot: [['Sayyad', '« Go feed people. I’m walking to NASA. The store, not space. »']],
  samosa: [['Sayyad', '« The cedar’s still dripping. Your truck smells like a cabin now. »']],
};

// Narrator, Quebec French.
const NARR = {
  pinned: 'La cabine est un four. Le Ranger se traîne.',
  short1: 'PSSCHT, CRAC! Le dash fait des étincelles partout. La radio meurt. Le Ranger tousse.',
  short2: 'CRAC! Pis là, le klaxon part tout seul.',
  spill: 'La cruche se renverse sur le dash.',
  cut: 'Ottawa. Vingt minutes plus tard.',
  walk: 'Sayyad part à pied vers la rue Somerset, chez NASA.',
  back: 'Sayyad est revenu de chez NASA, sur Somerset. Un sac brun, déjà transparent de gras.',
};
export const FAIL_COOK = 'Coup de chaleur. Le cèdre est sec comme une toast, pis Sayyad aussi.';
export const FAIL_DROWN = 'Troisième court-circuit. Le dash est noyé, le Ranger s’éteint dans un nuage de vapeur.';

const closeMeal = (G) => { G.mealShift?.close(); G.mealShift = null; };
const toast = (G, text, ms = 2600) => G.hud?.toast?.(text, ms);
const audioOf = (G) => G.audio || (G.radio && G.radio.audio) || null;

/** Say one of Sayyad's lines of this class; rotates within the class. */
export function sayyad(G, cls) {
  const pool = SAUNA_LINES[cls];
  if (!pool || !pool.length) return null;
  const h = G.sauna;
  const n = h ? (h.said[cls] = (h.said[cls] || 0) + 1) - 1 : 0;
  const [who, text] = pool[n % pool.length];
  if (G.heckle && G.heckle.line) G.heckle.line(who, text, 3000, { group: 'sauna' });
  else toast(G, `${who}: ${text}`, 2600);
  if (h) h.lastTalk = h.t;
  return text;
}

// The toy's DOM, key listener, radio and timers live on G.sauna so cleanup can
// always reach them, whatever stage the job ends in.
export function stopHeat(G) {
  const h = G && G.sauna;
  if (!h) return;
  try { h.off?.(); } catch { /* already gone */ }
  try { h.fx?.close(); } catch { /* already gone */ }
  // Never leave a radio off that the sauna turned off; never resume one it did not.
  if (h.radioOff > 0 && G.radio && G.radio.resume) { try { G.radio.resume(); } catch { /* no radio */ } }
  try { G.heckle?.cancel?.('sauna'); } catch { /* no heckle */ }
  G.sauna = null;
}

function startHeat(G, m) {
  if (G.sauna) return G.sauna;
  const s = m.sauna || (m.sauna = newSauna());
  const h = {
    s, fx: openSaunaFx(), off: null, t: 0, lastTalk: -99, said: {},
    radioOff: 0, honks: [], sparks: 0, limp: 0, puffT: 0, drown: 0, cut: null, okSaid: 0,
  };
  h.off = listenPour(() => { s.wantPour = true; });
  G.sauna = h;
  h.fx.update(s);
  return h;
}

// The short circuit show (game invention, Tom 13 Oct): sparks everywhere, two
// flashes, crackles, the radio dies, the Ranger coughs; the second honks by itself.
function shortShow(G, h) {
  const n = h.s.shorts;
  h.fx.short();
  h.sparks = 14;
  h.limp = LIMP_S;
  const au = audioOf(G);
  if (au && au.blip) for (let i = 0; i < 6; i++) { try { au.blip(1600 + Math.random() * 900, 0.04, 'square', 0.10); } catch { /* no audio */ } }
  const r = G.radio;
  if (r && r.suspend && r.on && !r.suspended && h.radioOff <= 0) { try { r.suspend(); h.radioOff = RADIO_OUT_S; } catch { /* no radio */ } }
  else if (h.radioOff > 0) h.radioOff = RADIO_OUT_S;
  if (n === 2) h.honks = [0, 0.5, 1.0];
  if (n >= SHORT_FAIL) { toast(G, NARR.short1, 2200); h.drown = DROWN_S; return; }
  toast(G, n === 2 ? NARR.short2 : NARR.short1, 2600);
  sayyad(G, n === 2 ? 'short2' : 'short1');
}

// One tick of the toy for a drive leg. Returns { fail } for the two joke fails.
function driveTick(G, m, dt) {
  const h = G.sauna || startHeat(G, m);
  const s = h.s, v = G.veh || { x: 0, z: 0, speedKmh: 0 };
  h.t += dt;
  if (h.cut) { s.wantPour = false; return null; }   // black screen: nothing to juggle
  if (s.wantPour) {
    s.wantPour = false;
    if (pour(s)) h.fx.puff(s.w + s.pend > 0.7);
  }
  saunaStep(s, dt, { speedKmh: v.speedKmh, traffic: trafficNear(G.traffic?.cars, v.x, v.z), impact: v.impact || 0 });
  const canTalk = h.t - h.lastTalk > TALK_GAP, canEvent = h.t - h.lastTalk > EVENT_GAP;
  for (const e of s.events) {
    if (e === 'short') shortShow(G, h);
    else if (e === 'spill') { toast(G, NARR.spill, 2000); if (canEvent) sayyad(G, 'spill'); }
    else if (e === 'pinned') { toast(G, NARR.pinned, 2600); sayyad(G, 'pinned'); }
    else if (e === 'enter:ok' && canTalk && h.okSaid < 3 && s.driveT > 20) { h.okSaid++; sayyad(G, 'ok'); }
  }
  s.events.length = 0;
  // Deep in a zone: one line per entry.
  if (s.w < DEEP_COOK) { if (!h.deepCook && canTalk) { h.deepCook = true; sayyad(G, 'cook'); } } else if (s.w > BAND_LO) h.deepCook = false;
  if (s.w > DEEP_FOG) { if (!h.deepFog && canTalk) { h.deepFog = true; sayyad(G, 'fog'); } } else if (s.w < 0.75) h.deepFog = false;

  // Sparks spread over half a second, into the fixed spark pool.
  const deb = G.reactive && G.reactive.debris;
  if (h.sparks > 0) {
    const k = Math.min(h.sparks, Math.max(1, Math.ceil(14 * dt / 0.5)));
    h.sparks -= k;
    if (deb && deb.spark) for (let i = 0; i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      deb.spark(v.x + (Math.random() - 0.5) * 1.2, (v.bodyY ?? v.y ?? 0) + 1.1, v.z + (Math.random() - 0.5) * 1.2, Math.sin(a) * 3, Math.cos(a) * 3);
    }
  }
  // Steam out of the windows when it is really wet.
  h.puffT -= dt;
  if (fogOf(s.w) > 0.5 && h.puffT <= 0 && G.fx && G.fx.puffs && G.fx.puffs.emit) {
    h.puffT = 0.25;
    const len = (v.spec && v.spec.len) || 4.5, ht = (v.spec && v.spec.h) || 1.7;
    G.fx.puffs.emit(v.x + Math.sin(v.yaw || 0) * len * 0.2, (v.bodyY ?? v.y ?? 0) + ht * 0.9, v.z + Math.cos(v.yaw || 0) * len * 0.2, (v.vx || 0) * 0.4, (v.vz || 0) * 0.4);
  }
  // The horn going off by itself (the second short).
  if (h.honks.length) {
    for (let i = 0; i < h.honks.length; i++) h.honks[i] -= dt;
    while (h.honks.length && h.honks[0] <= 0) { h.honks.shift(); try { audioOf(G)?.honk?.(330, 0.45, 0.12); } catch { /* no audio */ } }
  }
  // The radio comes back after RADIO_OUT_S, only if the sauna turned it off.
  if (h.radioOff > 0) { h.radioOff -= dt; if (h.radioOff <= 0 && G.radio && G.radio.resume) { try { G.radio.resume(); } catch { /* no radio */ } } }
  // Sluggish when pinned bone dry, a crawl just after a short.
  if (h.limp > 0) h.limp -= dt;
  const cap = h.limp > 0 ? LIMP_KMH : s.pinned ? SLUG_KMH : Infinity;
  if (G.veh && typeof G.veh.vLong === 'number' && G.veh.speedKmh > cap) G.veh.vLong *= Math.max(0, 1 - 1.5 * dt);
  h.fx.update(s);
  // The two joke fails.
  if (h.drown > 0) { h.drown -= dt; if (h.drown <= 0) return { fail: FAIL_DROWN }; }
  if (s.zeroT >= COOK_FAIL_S) return { fail: FAIL_COOK };
  return null;
}

function drivePrompt(G, m) {
  const s = m.sauna, h = G.sauna;
  if (!s) return null;
  if (h && h.cutHeld) return 'Sème la police avant';
  if (s.w > DEEP_FOG) return 'Pas d’eau! Ça va sauter.';
  if (s.pinned) return `F! Sayyad cuit! (${Math.max(0, Math.ceil(COOK_FAIL_S - s.zeroT))} s)`;
  if (s.w + s.pend < BAND_LO + 0.05) return 'F - de l’eau sur le cèdre';
  return null;
}

// The cut at the end of leg 1: fade, relocate onto Booth Street, hand over.
function cutTick(G, m, dt) {
  const h = G.sauna;
  const v = G.veh;
  if (!h || !v) return null;
  const H = resolveAt('stvincent', G);
  if (!H) return null;
  if (!h.cut) {
    if (Math.hypot(v.x - H.x, v.z - H.z) > CUT_CROW_M) { h.cutHeld = false; return null; }
    if (G.cops && G.cops.heat > 0) { h.cutHeld = true; return null; }
    h.cutHeld = false;
    h.cut = { t: 0 };
    h.fx.fade(1);
    return null;
  }
  h.cut.t += dt;
  if (h.cut.t < FADE_S) return null;
  if (G.nav && G.nav.route && typeof v.reset === 'function') {
    const p = pointBeforeEnd(G.nav.route(v.x, v.z, H.x, H.z), LEG2_M);
    if (p) {
      v.reset(p.x, p.z, p.yaw, G.phys && G.phys.groundY ? G.phys.groundY(p.x, p.z) : 0);
      v.syncFrame?.();
      G.route = null; G.routeKey = '';
      G.camSnap?.();
    }
  }
  const s = h.s;
  s.w = Math.max(0.30, Math.min(0.80, s.w)); s.pend = 0; s.zeroT = 0; s.pinned = false;
  // The harness reads this so the relocation is not counted as a bot assist.
  G.sceneCut = { id: 'stvincent', at: typeof performance !== 'undefined' ? performance.now() : Date.now() };
  h.cut = null;
  return 'done';
}

function lotCard(s) {
  const res = saunaResult(s);
  const bonus = saunaBonus(res);
  const c = res.shorts;
  return {
    bonus,
    text: `${saunaGrade(res)} · ${Math.round(res.inBand * 100)} % dans le vert · ${c} court${c > 1 ? 's' : ''}-circuit${c > 1 ? 's' : ''} · sauna +${bonus} $`,
  };
}

export const STVINCENT_MISSION = {
  id: 'stvincent',
  title: 'Le sauna de cèdre',
  giver: 'sayyad',
  timeOfDay: 'day',
  brief: 'Canicule. Ta job de préposé aux repas à l’hôpital St. Vincent, sur Cambridge, à Ottawa. Sayyad vient avec toi, pis une planche de cèdre de sa clôture aussi.',
  cleanup(G) { stopHeat(G); closeMeal(G); },
  metrics(m) { return m && m.sauna ? saunaResult(m.sauna) : null; },
  build(ctx = {}) {
    const car = (ctx && ctx.carName) || 'Ranger';
    const legHint = 'Trop sec, la cabine cuit. Trop d’eau, le dash fait des étincelles. Dans le trafic, ça sèche plus vite.';
    return [
      {
        kind: 'plank',
        text: 'Chez Sayyad - la clôture de cèdre',
        sub: 'Arrête-toi dans le cercle, pis E pour arracher une planche de cèdre',
        hint: 'Chez Sayyad. Arrêté dans le cercle, E.',
        at: 'sayyad', radius: 16, hold: true,
        holdText: 'E - une planche de cèdre pour le dash',
        passengers: 1,
        onExit(G) { sayyad(G, 'plank'); },
        toast: `La planche de cèdre est sur le dash du ${car}. Sayyad a une cruche d’eau entre les genoux.`,
      },
      {
        kind: 'heat',
        text: 'Direction Ottawa, par le chemin d’Aylmer',
        sub: 'Suis le GPS. F verse de l’eau sur le cèdre. Garde l’aiguille dans le vert.',
        hint: legHint,
        at: 'stvincent', radius: LOT_R,
        onEnter(G, m) { if (m.sauna) m.sauna.wantPour = false; startHeat(G, m); },
        onTick(G, m, st, dt) { return driveTick(G, m, dt) || cutTick(G, m, dt); },
        prompt(G, m) { return drivePrompt(G, m); },
        failWhy: FAIL_COOK,
        toast: NARR.cut,
      },
      {
        kind: 'heat',
        text: 'Hôpital St. Vincent, sur Cambridge',
        sub: 'Suis le GPS. F sur le cèdre, l’aiguille dans le vert.',
        hint: legHint,
        at: 'stvincent', radius: LOT_R,
        onEnter(G, m) { startHeat(G, m); G.sauna?.fx?.fade(0); },
        onTick(G, m, st, dt) {
          const r = driveTick(G, m, dt);
          // The grade card and the bonus are paid on arrival (st.money and
          // st.toast are read when the stage completes).
          const c = lotCard(m.sauna);
          st.money = c.bonus;
          st.toast = 'Le stationnement de St. Vincent. De l’ombre, enfin.\n' + c.text;
          return r;
        },
        prompt(G, m) { return drivePrompt(G, m); },
        failWhy: FAIL_COOK,
        toast: 'Le stationnement de St. Vincent. De l’ombre, enfin.',
      },
      {
        kind: 'enter',
        text: 'Hôpital St. Vincent - entre travailler',
        sub: 'Arrête-toi dans le stationnement, pis E pour entrer',
        hint: 'Arrêté dans le cercle du stationnement, E.',
        at: 'stvincent', radius: 22, hold: true,
        holdText: 'E - entrer. Le service du dîner t’attend.',
        onEnter(G) { stopHeat(G); sayyad(G, 'lot'); },
        toast: NARR.walk,
      },
      {
        kind: 'meal',
        text: 'Le service du repas',
        sub: 'WASD pour marcher, Espace au signal vert',
        hint: 'Approche un lit, attends le vert, Espace. Une bouchée à la fois.',
        noTarget: true, noRoute: true, condition: () => false,
        onEnter(G) { stopHeat(G); G.mealShift = openMealShift(); },
        onTick(G) { if (G.mealShift?.state.done) return 'done'; },
        onExit: closeMeal,
        money: 40,
        toast: 'Les plateaux sont ramassés. Le service est terminé. 40 $.',
      },
      {
        kind: 'samosas',
        text: 'Le stationnement - Sayyad est revenu',
        sub: 'E pour prendre un samosa',
        hint: 'Sayyad attend au truck avec le sac. Arrêté dans le cercle, E.',
        at: 'stvincent', radius: 22, hold: true,
        holdText: 'E - prendre un samosa',
        onEnter(G) { toast(G, NARR.back, 3000); sayyad(G, 'samosa'); },
        toast: 'Des samosas chauds, une planche de cèdre mouillée pis 40 $. Pas pire, comme journée.',
      },
    ];
  },
};

// For tests and the bot: the cut's numbers and the dry-out timings.
export const SAUNA_TUNE = { TALK_GAP, LOT_R, CUT_CROW_M, LEG2_M, FADE_S, DROWN_S, PINNED_S };
