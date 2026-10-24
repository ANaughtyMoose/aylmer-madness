// « Rues d'Aylmer que tu connais »: the quiet counter (restructure, 29 Sept
// 2026; docs/design/MAIN-STORY-PROPOSAL.md, « the player does the theme »).
// The share of Aylmer's named streets you have actually driven on. Never on the
// driving HUD: the pause screen and the finale's card only.
//
// The street list is the Aylmer map's own (mapdata.js, OpenStreetMap): every
// named road that is not a service lane. Hull, Ottawa and Chelsea roads are not
// in it, so driving there does not move the number. G.streets is a Set of
// names, saved with the slot (save.js `streets`).
import { MAP } from './mapdata.js';

let NAMES = null;
/** The named streets of Aylmer, once. */
export function aylmerStreets() {
  if (NAMES) return NAMES;
  NAMES = new Set();
  for (const r of (MAP && MAP.roads) || []) {
    if (r && r.name && r.cls !== 'service') NAMES.add(r.name);
  }
  return NAMES;
}

/** A street you are driving on. True when it is new to you. */
export function noteStreet(G, name) {
  if (!G || !name || !aylmerStreets().has(name)) return false;
  if (!(G.streets instanceof Set)) G.streets = new Set(G.streets || []);
  if (G.streets.has(name)) return false;
  G.streets.add(name);
  return true;
}

/** Whole percent, 0..100. */
export function streetsPct(G) {
  const total = aylmerStreets().size;
  if (!total || !G || !G.streets) return 0;
  let n = 0;
  for (const s of G.streets) if (NAMES.has(s)) n++;
  return Math.min(100, Math.floor((100 * n) / total));
}

/** « Rues d'Aylmer que tu connais : 12 % » */
export function streetsLine(G) {
  return `Rues d’Aylmer que tu connais : ${streetsPct(G)} %`;
}
