// Dad's phone call: the money he offers when you are broke, and what it costs
// him that he does not say.
//
// THE HOOK (for the story agent and main.js):
//
//   * Trigger: maybeDadCall(G, v) runs once a tick from fuel.js tickFuel(),
//     which main.js already calls every tick, so there is no new main.js line.
//     Dad calls when ALL of these hold:
//       - the wallet is under DAD.broke ($15);
//       - there is something Tom HAS to pay for right now (needFor):
//           'gas'    the tank is at the reserve light or dry;
//           'repair' the truck is badly damaged (DAD.damage or more);
//           'stage'  a job is waiting on a cost he cannot pay (the canoe):
//                    the « Il te manque » prompt is up;
//       - Tom is AT HOME, stopped within DAD.homeRadius of 299 Fraser. It is
//         2004: the phone is the black corded one on the desk at 299 Fraser,
//         a landline, not a cell (Tom, 29 Sept). No call away from home;
//         away, at most one small HUD hint a game week that he could go home;
//       - no call yet this game week (G.day / 7), and fewer than DAD.max
//         calls this summer.
//   * Effect: the house phone rings (two blips; there is no ring sample) and
//     the HUD says so in French with the amount. Margaret calls out, in
//     English, that it is his father (DAD_PICKUP), then his lines play as
//     speech bubbles through heckle.line(), one at a time, in English: he
//     speaks English with Tom (docs/STORY-REBUILD.md s.5).
//     G.dadCalls = { n, week, log[] } records it; save.js persists it.
//   * Lines: story.js exports DAD_CALLS and dadCall(n); dadCall(n) is the
//     shape used here: { id, amount, who, bubbles: [[who, text], ...], toast }.
//     A list handed in with setDadCalls() may also use the older sketch,
//     { amount, lines: [[who, text], ...] } (a bare string line is Dad's).
//     Until story.js has loaded, PLACEHOLDER_CALLS below is used.

import { PLACES } from './places.js';

export const DAD = {
  broke: 15,          // dollars: under this, you are broke
  damage: 60,         // truck damage (0-100) that is a repair you must make
  max: 3,             // calls a summer, at most
  amounts: [60, 45, 85],
  stopped: 1.5,       // m/s: the car has to be stopped
  homeRadius: 30,     // m from PLACES.home (299 Fraser): the landline is in the house
};

// Margaret picks up and calls down to him. PROPOSAL wording; English, like
// everything she says to Tom. story.js's DAD_PICKUP replaces it when present.
export const PICKUP_FALLBACK = ['Margaret', '« Tom! Phone! It’s your father. »'];
let PICKUP = null;

// Plain on purpose: story.js's DAD_CALLS replaces this. Nothing here says what
// it cost him — that is the writers' to decide, and to keep off the screen.
// English: he speaks English with Tom.
export const PLACEHOLDER_CALLS = [
  { lines: [['Ton père, au téléphone', '« Your mother says money’s tight. Take this. We won’t talk about it. »']] },
  { lines: [['Ton père, au téléphone', '« It’s fine. Put it in the tank. »']] },
  { lines: [['Ton père, au téléphone', '« Take it. I’ll manage. »']] },
];

let STORY_CALLS = null;
let storyT = null;
/** Fire and forget: pick up story.js's DAD_CALLS when it exists. */
export function loadDadCalls() {
  if (storyT) return storyT;
  storyT = import('./story.js')
    .then((m) => {
      if (m && Array.isArray(m.DAD_CALLS) && m.DAD_CALLS.length) {
        // story.js's dadCall(i) is the canonical shape (bubbles + tell + cover).
        STORY_CALLS = typeof m.dadCall === 'function' ? m.DAD_CALLS.map((_, i) => m.dadCall(i)) : m.DAD_CALLS;
      }
      if (m && Array.isArray(m.DAD_PICKUP) && m.DAD_PICKUP[1]) PICKUP = m.DAD_PICKUP;
      return !!STORY_CALLS;
    })
    .catch(() => false);
  return storyT;
}
let OVERRIDE = null;
/** Tests: hand the lines in directly (or null to go back to story.js's, or the placeholders). */
export function setDadCalls(list) { OVERRIDE = Array.isArray(list) && list.length ? list : null; }
export function dadCalls() { return OVERRIDE || STORY_CALLS || PLACEHOLDER_CALLS; }

/** A call, in either shape, as [[who, text], ...] in the order they are said. */
export function callLines(call) {
  const raw = (call && (call.bubbles || call.lines)) || [];
  return raw.map((l) => (Array.isArray(l) ? l : [(call && call.who) || 'Ton père, au téléphone', l]))
    .filter(([, text]) => !!text);
}

/** What Tom has to pay for right now, or null. `gasLow`: fuel.js says the tank is at the light. */
export function needFor(G, v, gasLow = false) {
  if (G.mission && G.mission.stages) {
    const st = G.mission.stages[G.mission.idx];
    if (st && st.cost && G.wallet && !G.wallet.can(st.cost)) return 'stage';
  }
  if (gasLow) return 'gas';
  if (v && (v.damage || 0) >= DAD.damage) return 'repair';
  return null;
}

const week = (G) => Math.floor(Math.max(0, Number.isFinite(G.day) ? G.day : 0) / 7);

/** Is Tom at 299 Fraser, where the phone is? */
export function atHome(G, v) {
  const h = PLACES.home;
  if (!v || !h || !Number.isFinite(v.x) || !Number.isFinite(v.z)) return false;
  return Math.hypot(v.x - h.x, v.z - h.z) <= DAD.homeRadius;
}

/**
 * Could Dad help right now, wherever Tom is? The reason, or null. Pure. The
 * phone is at home, so dadWouldCall() adds « at home and stopped » on top.
 */
export function dadCouldHelp(G, v, gasLow = false) {
  if (!G || !G.wallet || G.summerOver) return null;
  if (G.wallet.value >= DAD.broke) return null;
  const rec = G.dadCalls || { n: 0, week: null };
  if (rec.n >= DAD.max) return null;
  if (rec.week != null && rec.week === week(G)) return null;
  return needFor(G, v, gasLow);
}

/** Would Dad call right now? Returns the reason, or null. Pure. */
export function dadWouldCall(G, v, gasLow = false) {
  if (v && Math.abs(v.vLong || 0) > DAD.stopped) return null;
  if (!atHome(G, v)) return null;
  return dadCouldHelp(G, v, gasLow);
}

/**
 * Away from home, broke with a bill: one quiet HUD line a game week that the
 * house is where the phone is. Never a call. Returns true when it hinted.
 */
export function maybeHomeHint(G, v, gasLow = false) {
  if (!G || !G.hud || !G.hud.toast || atHome(G, v)) return false;
  if (!dadCouldHelp(G, v, gasLow)) return false;
  const w = week(G);
  if (G.dadHintWeek === w) return false;
  G.dadHintWeek = w;
  G.hud.toast('Cassé. Le téléphone, c’est à la maison.', 2600);
  return true;
}

/**
 * Once a tick. Returns the call it just made ({ amount, why, lines }) or null.
 */
export function maybeDadCall(G, v, gasLow = false) {
  if (!storyT) loadDadCalls();
  const why = dadWouldCall(G, v, gasLow);
  if (!why) { maybeHomeHint(G, v, gasLow); return null; }
  const rec = G.dadCalls || (G.dadCalls = { n: 0, week: null, log: [] });
  const list = dadCalls();
  const call = list[Math.min(rec.n, list.length - 1)] || {};
  const amount = Math.max(40, Math.min(85, Math.round(call.amount || DAD.amounts[rec.n % DAD.amounts.length])));
  rec.n++;
  rec.week = week(G);
  (rec.log || (rec.log = [])).push({ day: Math.floor(G.day || 0), amount, why });
  G.wallet.add(amount);
  const pairs = callLines(call);
  const lines = pairs.map(([who, text]) => `${who}: ${text}`);
  // His lines are speech, so they go where speech goes: the bubble queue, one
  // at a time, never under a card. Without a heckle (node) they ride the toast.
  // Margaret answers the house phone first, then hands it to him.
  const pickup = PICKUP || PICKUP_FALLBACK;
  const bubbles = !!(G.heckle && G.heckle.line);
  const money = call.toast || `Ton père t’envoie ${amount} $.`;
  // QA F10: the money lands after he has spoken, not with the ring. The real
  // heckle queue (it has storyBusy) runs `then` when his last line leaves the
  // screen. A queue without it (no DOM, a test stub) and the no-bubble node
  // path keep the one toast with the ring and the amount.
  const queued = bubbles && typeof G.heckle.storyBusy === 'function';
  const all = [pickup, ...pairs];
  const toastMoney = () => { if (G.hud && G.hud.toast) G.hud.toast(`${money}  +${amount} $`, 3600); };
  if (bubbles) {
    all.forEach(([who, text], i) => G.heckle.line(who, text, 3400,
      { group: 'dad', ...(queued && i === all.length - 1 ? { then: toastMoney } : {}) }));
  }
  if (G.hud && G.hud.toast) {
    if (queued) G.hud.toast('Le téléphone sonne dans la maison.', 3600);
    else G.hud.toast(['Le téléphone sonne dans la maison.', ...(bubbles ? [] : [`${pickup[0]}: ${pickup[1]}`, ...lines]), `${money}  +${amount} $`].join('\n'), bubbles ? 3600 : 6000);
  }
  // The ring: no sample exists, so two short tones at the North American
  // ring pitches (440 + 480 Hz), through the same blip every HUD cue uses.
  if (G.audio && G.audio.blip) { G.audio.blip(440, 0.5, 'sine', 0.1); G.audio.blip(480, 0.5, 'sine', 0.1); }
  return { amount, why, lines, pickup, id: call.id || null };
}
