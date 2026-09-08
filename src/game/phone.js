// Jobs arrive as calls.
//
// Before this, a job existed because a yellow pillar existed. You drove near a
// marker, a prompt said « ◈ Poutine express », and you pressed E. Nobody had
// asked you for anything: the town handed out errands the way a menu hands out
// levels. That is the difference between a map full of icons and a summer with
// people in it, and it is what Thomas meant by « make it feel like GTA a bit »
// — in those games the mission exists because somebody phoned you about it.
//
// So: when the next job in the opening order comes within earshot, the phone
// buzzes. Bottom right, a Nokia-ish strip — who is calling, one line of what
// they want, and « E ». The GPS line goes on the address, because a person just
// gave you one. Then it fades and the marker is where it always was.
//
// What this deliberately does NOT do:
//
//   * change job availability. MISSIONS, the pillars and the E prompt are
//     untouched; a call is a nudge, and the yellow pillar is still the fallback
//     for anybody who drove past the call or turned the phone off.
//   * take the prompt slot from anybody. It registers as hud.setPrompt's
//     lowest-ranked source (U8, one prompt slot), so standing on the pillar the
//     mission runner's own line wins and the phone is silent down there.
//   * open a modal. U7 — nothing about a call stops the world.
//
// assets/text/calls.json turned out not to be this file's corpus: its thirty
// entries are Kijiji sellers on the telephone (« Won't come down a dollar »,
// « Answering machine, large dog »), written for the classifieds and carrying
// no speaker and no job id. The job calls are written per job in story.js's
// CALL_LINES, beside the FRIEND_LINES they have to sound like.
import { callLine } from './story.js';

// How near the next job has to be before its giver bothers to call.
export const RING_M = 300;
// One call at a time, and a decent gap between two of them.
export const SHOW_S = 6.5;
export const CALL_GAP = 20;

/**
 * The phone. One per page; main.js binds it and calls consider() from the
 * free-roam refresh and update() from the tick.
 */
export class Phone {
  constructor() {
    this.root = undefined;    // built lazily, like heckle's slang panel
    this.el = {};
    this.t = 0;               // seconds, fed by update(dt)
    this.lastAt = -1e9;
    this.left = 0;            // seconds this call stays on screen
    this.call = null;         // { who, text, id, title, label }
    this.rung = new Set();    // job ids that have already called, this session
    this.hud = null;
    this.audio = null;
  }

  bind(hud, audio = null) { this.hud = hud || null; this.audio = audio || null; return this; }

  /** A new game, or a load: nobody has called you yet. */
  reset() {
    this.rung.clear();
    this.lastAt = -1e9;
    this._clear();
  }

  /** Options → Jeu → « Les gens gueulent » turns the whole voice of the town off. */
  enabled(G) {
    const s = G && G.settings;
    return !s || s.heckles !== false;
  }

  /**
   * Should this job phone you? `job` is what story.js's nearestJob() returned —
   * { def, place, dist }. Returns the call that went out, or null.
   *
   * The rule is narrow on purpose: only the job that is actually next in the
   * story's own order, only once, only in free roam, and only when you are
   * close enough that a marker was about to appear anyway. A phone that rings
   * for every errand in town is a notification tray.
   */
  consider(G, job, nextId = null) {
    if (!job || !job.def || !G || G.mission) return null;
    if (!this.enabled(G)) return null;
    if (G.coldOpen && G.coldOpen.active) return null;
    const def = job.def;
    if (nextId && def.id !== nextId) return null;
    if (this.rung.has(def.id)) return null;
    if (job.dist > RING_M) return null;
    if (this.t - this.lastAt < CALL_GAP) return null;
    const line = callLine(def.id);
    if (!line) return null;
    this.rung.add(def.id);
    this.lastAt = this.t;
    this.call = {
      who: line[0], text: line[1], id: def.id,
      title: def.title, label: (job.place && job.place.label) || '',
      x: job.place ? job.place.x : 0, z: job.place ? job.place.z : 0,
    };
    this.left = SHOW_S;
    this._paint();
    this._ring();
    // A person just gave you an address, so the GPS gets it — but never over a
    // waypoint the player set himself.
    if (!G.waypoint && job.place) { G.waypoint = { x: job.place.x, z: job.place.z }; G.routeKey = ''; }
    return this.call;
  }

  /** One tick. */
  update(dt, G = null) {
    const d = Number.isFinite(dt) ? dt : 0;
    this.t += d;
    if (!this.call) return;
    // A call that was answered (the job started) hangs up.
    if (G && G.mission) { this._clear(); return; }
    this.left -= d;
    if (this.left <= 0) { this._clear(); return; }
    this._claimPrompt();
  }

  /** What the strip is saying right now, for the tests. */
  get showing() { return this.call ? this.call.id : null; }

  _clear() {
    this.call = null;
    this.left = 0;
    if (this.hud && this.hud.setPrompt) this.hud.setPrompt('phone', null);
    this._paint();
  }

  // The lowest-ranked prompt source: away from the pillar it says where the
  // call is sending you; standing on the pillar `mission` outranks it and this
  // never reaches the screen.
  _claimPrompt() {
    if (!this.hud || !this.hud.setPrompt || !this.call) return;
    this.hud.setPrompt('phone', `◈  ${this.call.title}${this.call.label ? '   ·   ' + this.call.label : ''}`);
  }

  _ring() {
    const a = this.audio;
    if (!a || !a.blip) return;
    try {
      a.blip(1318, 0.07, 'square', 0.09);
      if (typeof setTimeout === 'function') {
        setTimeout(() => { try { a.blip(1568, 0.07, 'square', 0.09); } catch { /* muted */ } }, 110);
        setTimeout(() => { try { a.blip(1318, 0.09, 'square', 0.08); } catch { /* muted */ } }, 240);
      }
    } catch { /* no audio context yet: a silent phone is still a phone */ }
  }

  // ---- the handset -------------------------------------------------------
  //
  // Built here rather than in index.html for the same reason heckle.js builds
  // its slang panel here: five agents are editing that file and style.css this
  // wave, and a screen element nobody else has to know about should not cost
  // anybody a merge conflict.

  _mount() {
    if (this.root !== undefined) return this.root;
    this.root = null;
    if (typeof document === 'undefined' || !document.createElement || !document.body) return null;
    const el = document.createElement('div');
    el.id = 'phone';
    // Above the legend (bottom:170px, 322px tall when open) and clear of the
    // speedo, which owns the corner itself.
    el.style.cssText = 'position:fixed;right:20px;bottom:330px;z-index:8;width:268px;'
      + 'pointer-events:none;opacity:0;transform:translateY(8px);'
      + 'transition:opacity .18s ease,transform .18s ease;'
      + 'background:linear-gradient(#243026,#161d18);border:1px solid rgba(160,220,150,.30);'
      + 'border-radius:9px;padding:8px 11px 9px;'
      + 'box-shadow:0 10px 26px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);'
      + 'font:13px/1.35 Helvetica,Arial,sans-serif;color:#cfe9c4';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;'
      + 'font-size:9px;letter-spacing:2px;text-transform:uppercase;opacity:.55;margin-bottom:3px';
    const tag = document.createElement('span');
    tag.textContent = 'Appel';
    const bars = document.createElement('span');
    bars.textContent = '▂▄▆';
    head.appendChild(tag); head.appendChild(bars);
    const who = document.createElement('div');
    who.style.cssText = 'font-weight:800;letter-spacing:.6px;font-size:14px;color:#e8f7dd';
    const txt = document.createElement('div');
    txt.style.cssText = 'margin-top:3px;opacity:.9;font-size:12.5px';
    const key = document.createElement('div');
    key.style.cssText = 'margin-top:6px;font-size:10px;letter-spacing:1.6px;opacity:.6;'
      + 'text-transform:uppercase;border-top:1px solid rgba(160,220,150,.2);padding-top:5px';
    el.appendChild(head); el.appendChild(who); el.appendChild(txt); el.appendChild(key);
    document.body.appendChild(el);
    this.el = { who, txt, key };
    this.root = el;
    return el;
  }

  _paint() {
    const el = this._mount();
    if (!el) return;
    if (!this.call) { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; return; }
    this.el.who.textContent = this.call.who;
    this.el.txt.textContent = this.call.text;
    this.el.key.textContent = 'E  —  ' + this.call.title;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  }
}

export const phone = new Phone();
export default phone;
