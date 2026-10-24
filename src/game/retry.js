// Failing is a joke, retry is free (refine plan A-03).
//
// A failed job used to be a grey « RATÉ » toast, the pay clawed back and a day
// gone. Now the fail card carries one gag line for the reason it failed
// (assets/text/fails.json: narrator lines in Quebec French, main-cast bubbles
// in English) and, for RETRY_WINDOW seconds, R puts you back at the start of
// the stage that failed. The first retry of a job is free: the day the fail
// would have cost is deferred (calendar.deferDay) and forgiven when you take
// the retry, and the pay the earlier stages earned goes back in your pocket.
// A second fail of the same job still offers R, but costs the day like before.
//
// main.js owns the wiring (A-06 this wave). The whole contract:
//
//   failMission(why):
//     const back = refundJob(G, m);
//     const offer = offerRetry({ G, mission: m, why, refunded: back });
//     hud.toast(offer ? retryCard(offer) : 'RATÉ\n' + why, offer ? RETRY_CARD_MS : 3000);
//     if (failCostsDay(m) && !(offer && offer.deferred)) endOfJob();
//     closeMission('fail');
//   each drive frame, BEFORE the radio reads KeyR:
//     const r = tickRetry(G, dt, input);          // consumes KeyR when it acts
//     if (r && r.take) { resumeMission(r.take.saved); applyRetry(G, r.take); }
//     if (r && r.expired && calendar.isOver(G.day)) runEnding();
//   startMission(def) for any job: cancelRetry(G) first (settles a deferred day).
//   boot: loadFails().catch(() => {});
//
// B-07 (fair fails): a fail on a main story mission (campaign.js MAIN, and the
// finale) never costs a day, first fail or tenth, quit included. Paid jobs and
// races keep the day cost above. offerRetry marks the story job's day as kept
// (calendar.keepDay), so main.js's endOfJob() right after it spends nothing;
// no main.js change is needed for that. failSpendsDay(m) is the same rule for
// a caller that wants to ask first.
//
// B-07 also keeps the fail card's toast state here: offerRetry sets it,
// failToast() is what hud.js renders, and clearFailToast() (also run by
// cancelRetry, so by every startMission) empties it, so no fail line from the
// last job sits over the next job's card.
//
// Pure apart from G: no DOM, no imports from main.js, so tools/smoke_retry.mjs
// runs it in Node.
import { failCostsDay } from './missionkit.js';
import { deferDay, forgiveDay, settleDay, keepDay, unkeepDay } from './calendar.js';
import { isMain, FINALE } from './campaign.js';

/** Seconds the R prompt stays on offer after a fail. */
export const RETRY_WINDOW = 45;
/** How long the fail card toast stays up, in ms. */
export const RETRY_CARD_MS = 4200;
/** Every reason classifyFail can return. 'quit' never gets an offer. */
export const REASONS = ['tow', 'late', 'police', 'clock', 'rival', 'lost', 'caught', 'broke', 'heat', 'other'];

// Built-in fallback so the card still reads when fails.json is missing
// (file:// or a checkout without assets/text). One line, the narrator's.
const FALLBACK = {
  card: {
    title: 'RATÉ',
    free: 'R : on recommence l’étape, gratis ({s} s)',
    paid: 'R : on recommence l’étape ({s} s). Ça coûte la journée.',
    story: 'R : on recommence l’étape ({s} s). La journée reste.',
    back: 'Retour à l’étape : {stage}',
    kept: 'La paye d’avant reste dans tes poches.',
  },
  reasons: { other: [{ fr: 'On va mettre ça sur le compte de l’expérience.' }] },
};
let TEXT = FALLBACK;

/** Replace the gag table (tests, or loadFails). Bad input keeps the fallback. */
export function setFails(json) {
  if (json && json.reasons && typeof json.reasons === 'object') {
    TEXT = { card: { ...FALLBACK.card, ...(json.card || {}) }, reasons: json.reasons };
  }
  return TEXT;
}
export function fails() { return TEXT; }

/** Browser boot: fetch assets/text/fails.json. Fails quietly to the fallback. */
export async function loadFails(fetchImpl = globalThis.fetch, url = 'assets/text/fails.json') {
  if (!fetchImpl) return TEXT;
  const r = await fetchImpl(url);
  if (!r.ok) throw new Error('fails.json ' + r.status);
  return setFails(await r.json());
}

// Ordered: the first rule that matches wins. Texts are the failWhy and fail
// strings the jobs already write (verbs.js, racejobs.js, verbjobs.js, the set
// pieces) plus main.js's own tow, police and quit lines.
const RULES = [
  ['quit', /abandonn|service quitt/i],
  ['tow', /remorqu|char est fini/i],
  ['police', /police|contravention|ticket/i],
  ['heat', /chaleur|nuage de vapeur/i],   // S4-SAUNA: the cedar sauna's two joke fails
  ['clock', /chrono/i],
  ['rival', /avant toi|passe la ligne|déjà stationné|sur le capot|t’a battu|t'a battu/i],
  ['lost', /t’a perdu|t'a perdu|perdu de vue/i],
  ['caught', /pogn|t’ont eu|t'ont eu|noter la plaque/i],
  ['broke', /cass|un bruit|au fond|décollé/i],
  ['late', /trop tard|couché|est parti|déjà donné|a appelé/i],
];
// Stage kinds that settle a reason the text alone may not name.
const KIND = { follow: 'lost', escape: 'caught', fragile: 'broke' };

/**
 * Why did this job fail? `why` is the text failMission got; `mission` is the
 * job as it stood (its current stage tells a race from an errand). Returns a
 * key from REASONS, or 'quit' for a fail the player chose.
 */
export function classifyFail(why, mission) {
  const s = String(why || '');
  for (const [key, re] of RULES) if (re.test(s)) return key;
  const st = mission && mission.stages ? mission.stages[mission.idx] : null;
  const timedOut = mission && mission.timeLeft != null && mission.timeLeft <= 0;
  if (st && (st.kind === 'race' || st.kind === 'grid')) return timedOut ? 'clock' : 'rival';
  if (st && KIND[st.kind]) return KIND[st.kind];
  if (timedOut) return 'late';
  return 'other';
}

/** The gag for a reason: rotates through its pool, never another reason's. */
export function gagFor(reason, n = 0) {
  const pool = (TEXT.reasons[reason] && TEXT.reasons[reason].length ? TEXT.reasons[reason] : null)
    || TEXT.reasons.other || FALLBACK.reasons.other;
  const g = pool[Math.abs(n | 0) % pool.length];
  return g.who ? `${g.who}: ${g.en}` : g.fr;
}

/**
 * A job just failed. Call after refundJob and before closeMission. Returns the
 * offer (also left on G.retry), or null when there is nothing to retry (no
 * job, or a quit). `reason` overrides the classifier; `stage` overrides the
 * stage to retry (default: the one that failed); `refunded` is what refundJob
 * clawed back, handed back on a free retry.
 *
 * offer.deferred is true when this fail would have cost a day and the retry is
 * free: the day is on the slate (calendar.deferDay) and the caller must NOT
 * also call endOfJob.
 */
export function offerRetry({ G, mission, reason, stage, why, refunded = 0 } = {}) {
  const m = mission || (G && G.mission);
  if (!G || !m || !m.def) return null;
  const story = storyFail(m);
  // main.js spends the day right after this call when failCostsDay(m) says so
  // and nothing was deferred: for a story job that day is kept.
  if (story && failCostsDay(m)) keepDay(G, m.def.id);
  const key = reason && (REASONS.includes(reason) || reason === 'quit') ? reason : classifyFail(why, m);
  if (key === 'quit') { G.retry = null; clearFailToast(); return null; }
  const tries = Math.max(0, m.retries | 0);
  const free = tries === 0;
  const idx = Math.max(0, Math.min((m.stages ? m.stages.length : 1) - 1, stage != null ? stage | 0 : m.idx | 0));
  const seen = (G.retrySeen = G.retrySeen || {});
  const gag = gagFor(key, seen[key] = (seen[key] || 0) + 1);
  const deferred = free && failSpendsDay(m);
  if (deferred) deferDay(G);
  const offer = {
    reason: key, gag, why: String(why || ''), free, deferred, story, left: RETRY_WINDOW,
    stage: idx, stageText: (m.stages && m.stages[idx] && m.stages[idx].text) || '',
    refunded: free ? Math.max(0, refunded || 0) : 0, retries: tries,
    // The shape main.js's resumeMission(saved) already takes: the job, the
    // stage, the minutes already spent and who was in the truck. No timeLeft
    // and no stage state: the stage starts over with a full clock.
    saved: {
      id: m.def.id, stage: idx, elapsed: m.elapsed || 0,
      passengers: (G.veh && G.veh.passengers) || 0,
    },
  };
  G.retry = offer;
  setFailToast(retryCard(offer), RETRY_CARD_MS, m.def.id);
  return offer;
}

/** Is this job part of the main story (the ten, or the finale)? */
export function storyFail(m) {
  const id = m && m.def ? m.def.id : (m && m.id);
  return !!id && (isMain(id) || id === FINALE);
}

/** Does a fail of this job spend a day? Never for the story; else missionkit's rule. */
export function failSpendsDay(m) {
  return !storyFail(m) && failCostsDay(m);
}

// ------------------------------------------------------------ the fail toast
//
// One fail card at a time. hud.js renders failToast() while `left` > 0 and
// nothing else; retry.js decides when it starts and when it is gone.
let FAIL_TOAST = null;

/** Put a fail card up: { text, ms, left (s), id (the job that failed) }. */
export function setFailToast(text, ms = RETRY_CARD_MS, id = null) {
  FAIL_TOAST = { text: String(text || ''), ms, left: Math.max(0, ms) / 1000, id };
  return FAIL_TOAST;
}
/** The fail card on screen now, or null. */
export function failToast() {
  return FAIL_TOAST && FAIL_TOAST.left > 0 ? FAIL_TOAST : null;
}
/** Run the card's clock down; drops it when its time is up. */
export function tickFailToast(dt) {
  if (!FAIL_TOAST) return null;
  FAIL_TOAST.left -= Math.max(0, dt || 0);
  if (FAIL_TOAST.left <= 0) FAIL_TOAST = null;
  return FAIL_TOAST;
}
/** Empty the fail toast state. Returns true when there was a card to drop. */
export function clearFailToast() {
  const had = !!FAIL_TOAST;
  FAIL_TOAST = null;
  return had;
}

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (a, k) => (vars[k] != null ? vars[k] : a));

/** The fail card text: RATÉ, the job's own line, the gag, and the R prompt. */
export function retryCard(offer, opts = {}) {
  if (!offer) return TEXT.card.title;
  const c = TEXT.card;
  const lines = [c.title];
  if (offer.why) lines.push(offer.why);
  lines.push(offer.gag);
  const s = Math.ceil(opts.left != null ? opts.left : offer.left);
  lines.push(fill(offer.free ? c.free : offer.story ? c.story : c.paid, { s }));
  if (offer.free && offer.refunded > 0) lines.push(c.kept);
  return lines.join('\n');
}

/** The one-line prompt while the window is open (for hud.prompt), or null. */
export function retryPrompt(G) {
  const o = G && G.retry;
  if (!o || o.left <= 0) return null;
  return fill(o.free ? TEXT.card.free : o.story ? TEXT.card.story : TEXT.card.paid, { s: Math.ceil(o.left) });
}

/**
 * One frame of the retry window. `input` is core/input.js (hit/consume) or
 * anything with the same two methods; pass pressed=true instead to drive it by
 * hand. Returns null, { take } when R was pressed (KeyR is consumed so the
 * radio does not also toggle), or { expired, dayChanged } when the window ran
 * out and a deferred day was settled.
 */
export function tickRetry(G, dt, input, pressed) {
  tickFailToast(dt);
  const o = G && G.retry;
  if (!o) return null;
  if (G.mission) { cancelRetry(G); return { expired: true, dayChanged: false, superseded: true }; }
  const hit = pressed != null ? !!pressed : !!(input && input.hit && input.hit('KeyR'));
  if (hit) {
    if (input && input.consume) input.consume('KeyR');
    return { take: takeRetry(G) };
  }
  o.left -= Math.max(0, dt || 0);
  if (o.left > 0) return null;
  G.retry = null;
  const dayChanged = o.deferred ? settleDay(G) : false;
  return { expired: true, dayChanged };
}

/** Take the offer now: forgive the deferred day; returns what applyRetry needs. */
export function takeRetry(G) {
  const o = G && G.retry;
  if (!o) return null;
  G.retry = null;
  clearFailToast();
  if (G) unkeepDay(G);
  if (o.deferred) forgiveDay(G);
  return { ...o, saved: { ...o.saved }, retries: o.retries + 1 };
}

/**
 * After resumeMission(take.saved) has rebuilt the job: mark it as retried (so
 * the next fail is not free) and, on a free retry, put back the pay the
 * earlier stages earned so finishing still pays the whole job once.
 */
export function applyRetry(G, take) {
  if (!G || !take) return false;
  const m = G.mission;
  if (!m) return false;
  m.retries = take.retries;
  if (take.free && take.refunded > 0) {
    if (G.wallet && G.wallet.add) G.wallet.add(take.refunded);
    m.paid = (m.paid || 0) + take.refunded;
  }
  return true;
}

/** Drop a pending offer (another job started, a load, the menu). Settles the day. */
export function cancelRetry(G) {
  clearFailToast();
  if (G) unkeepDay(G);
  const o = G && G.retry;
  if (!o) return false;
  G.retry = null;
  if (o.deferred) settleDay(G);
  return true;
}
