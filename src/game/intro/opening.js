// The opening (docs/design/OPENING.md): a cold open, the title, a crawl, then
// a dawn flight over the real map with freeze-frame name cards, Margaret at the
// door, Dad on the landline, and the hand-off into the Ranger, nose-in in the
// 299 Fraser driveway, about to back out.
//
// Two halves, because the world takes ten to twenty seconds to bake and that
// bake holds the main thread:
//   * 2D (cold open, title, crawl): DOM and CSS animations on the compositor,
//     sound scheduled on the audio clock. It plays OVER the bake, so the
//     opening never adds a wait; a stalled main thread does not stall it.
//   * 3D (the shots): the game's own renderer through a camera rail
//     (G.cineCam, read by render() in main.js). Each card freezes the frame;
//     a frozen frame is not redrawn, which is also the cheapest frame there is.
//
// Skippable everywhere: Enter / Space / click / pad A skips a beat, Escape /
// pad B / Start skips the lot. main.js owns the hooks (render, the clock, the
// chase pose, staging the Ranger); this file owns everything on screen.

import { LONG_SHOTS, CARDS, COLD_OPEN, TITLE, CRAWL, TITLE_AT, CRAWL_AT, CRAWL_END,
  railAt, aim, project, dawnHour, FILMS, LOWER, timeline, runningTime, castFor } from './shots.js';
import { Score } from './score.js';
import { readJSON, writeJSON } from '../store.js';

const LOCAL_ART = '/__local_opening/';
const isLocal = () => typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const TOTAL_3D = LONG_SHOTS.reduce((s, x) => s + x.dur, 0);
const SHOTS = LONG_SHOTS;   // the long film's path below reads these directly

/** True once the opening has played (or been skipped) on this machine. */
export function seenBefore(G) {
  try { if (typeof location !== 'undefined' && /[?&]intro=1\b/.test(location.search)) return false; } catch { /* no location */ }
  return !!(G && G.settings && G.settings.storySeen);
}

/**
 * B-11: which film a New Game plays. ?intro=long forces the director's cut,
 * ?intro=1 the first launch; once seen, the quick driveway settle.
 */
export function filmFor(G, { replay = false, variant = null } = {}) {
  if (replay) return 'long';
  if (variant && FILMS[variant]) return variant;
  try { if (typeof location !== 'undefined' && /[?&]intro=long\b/.test(location.search)) return 'long'; } catch { /* no location */ }
  return seenBefore(G) ? 'quick' : 'first';
}

/** The one line on the first-launch gate (B-12b sets #start to it). */
export function gateText(lang) { return lang === 'en' ? 'Press any key' : 'Appuie sur une touche'; }

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// One element, a few hundred box-shadows: a starfield that costs one layer.
function starShadows(n, seed, spread = 1) {
  let s = seed, out = [];
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const x = (rnd() * 100).toFixed(2), y = (rnd() * 78 * spread).toFixed(2);
    const a = (0.35 + rnd() * 0.65).toFixed(2);
    out.push(`${x}vw ${y}vh 0 ${rnd() < 0.08 ? 1 : 0}px rgba(255,248,230,${a})`);
  }
  return out.join(',');
}

export class Opening {
  /**
   * hooks: { G, audio, radio, hud, heckle, render(dt), setHour(h), restoreClock(),
   *          chasePose(), stage(), unstage(), groundY(x,z), onDone(kind) }
   */
  constructor(hooks) {
    this.h = hooks;
    this.active = false;
    this.phase = 'idle';          // 'title' -> 'hold' -> 'shots' -> 'done'
    this.root = null;
    this.score = new Score(hooks.audio);
    this.art = new Set();          // private portraits present on this machine
    this._keys = (e) => this.onKey(e);
    this._click = (e) => { if (this.active && !e.target.closest?.('button')) { e.preventDefault(); this.skipBeat(); } };
    this._raf = (t) => this.loop(t);
    // B-11: the ten name cards, live, the first time each person shows up.
    this.cast = new CastCards({ G: hooks.G, markSeen: hooks.markCastSeen });
    current = this.cast;
  }

  get lang() { return this.h.G.settings?.lang === 'en' ? 'en' : 'fr'; }
  tr(o) { return o == null ? '' : typeof o === 'string' ? o : (o[this.lang] ?? o.fr ?? ''); }

  // ---------------------------------------------------------------- DOM

  build() {
    if (this.root) return;
    const r = this.root = el('div', 'hidden');
    r.id = 'opening';
    r.setAttribute('role', 'dialog');
    r.setAttribute('aria-modal', 'true');
    r.setAttribute('aria-label', 'Aylmer Madness');
    r.innerHTML = `
      <div class="op-grade"></div><div class="op-vignette"></div>
      <div class="op-dip"></div>
      <div class="op-sky">
        <div class="op-stars a"></div><div class="op-stars b"></div><div class="op-horizon"></div>
      </div>
      <div class="op-cold"><p></p></div>
      <div class="op-title">
        <div class="op-logo"><span class="op-l1"></span><span class="op-l2"></span></div>
        <div class="op-tag"></div>
      </div>
      <div class="op-crawl"><div class="op-crawl-plane"><div class="op-crawl-text"></div></div></div>
      <div class="op-bar top"></div><div class="op-bar bottom"><div class="op-caption"></div></div>
      <div class="op-card"><div class="op-card-band"></div><div class="op-card-portrait"><img alt=""></div>
        <div class="op-card-body"><div class="op-card-kicker"></div><div class="op-card-name"></div>
        <div class="op-card-place"></div><div class="op-card-line"></div></div></div>
      <div class="op-phone">${PHONE_SVG}</div>
      <div class="op-bubbles"></div>
      <div class="op-flash"></div>
      <div class="op-load"><i></i><span></span></div>
      <div class="op-lower"></div>
      <div class="op-skip"></div>`;
    injectStyle();
    document.body.appendChild(r);
    const q = (s) => r.querySelector(s);
    this.$ = {
      cold: q('.op-cold p'), l1: q('.op-l1'), l2: q('.op-l2'), tag: q('.op-tag'),
      crawl: q('.op-crawl-text'), caption: q('.op-caption'), card: q('.op-card'),
      kicker: q('.op-card-kicker'), name: q('.op-card-name'), place: q('.op-card-place'),
      line: q('.op-card-line'), portrait: q('.op-card-portrait'), img: q('.op-card-portrait img'),
      phone: q('.op-phone'), bubbles: q('.op-bubbles'), flash: q('.op-flash'), dip: q('.op-dip'),
      load: q('.op-load'), loadBar: q('.op-load i'), loadText: q('.op-load span'), skip: q('.op-skip'),
      lower: q('.op-lower'), title: q('.op-title'),
    };
    q('.op-stars.a').style.boxShadow = starShadows(260, 7);
    q('.op-stars.b').style.boxShadow = starShadows(90, 91);
  }

  fill() {
    const $ = this.$, en = this.lang === 'en';
    $.cold.textContent = this.tr(COLD_OPEN);
    $.l1.textContent = TITLE.top;
    $.l2.textContent = TITLE.bottom;
    $.l1.dataset.text = TITLE.top;
    $.l2.dataset.text = TITLE.bottom;
    $.tag.textContent = this.tr(TITLE.tag);
    $.crawl.innerHTML = `<div class="op-ep">${esc(this.tr(CRAWL.episode))}</div>`
      + `<div class="op-ep-title">${esc(this.tr(CRAWL.title))}</div>`
      + CRAWL.paragraphs[en ? 'en' : 'fr'].map((p) => `<p>${esc(p)}</p>`).join('');
    $.skip.textContent = en ? 'Enter  skip   ·   Esc  skip the intro' : 'Entrée  passer   ·   Échap  passer l’intro';
  }

  /** Which private portraits exist (served by tools/serve.mjs only, on loopback). */
  probeArt() {
    if (!isLocal() || typeof fetch !== 'function') return;
    // tools/serve.mjs lists them on the radio library route, which every
    // version of it answers (an older one just has no `opening` field).
    fetch('/__local_radio/library.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => { for (const f of j.opening || []) this.art.add(f); })
      .catch(() => { /* a static host has no such route: in-engine only */ });
  }

  // ---------------------------------------------------------------- lifecycle

  /**
   * In the click that started it, so the audio context is allowed to start.
   * `replay`: watched from the menu, ends back on the menu, touches no save.
   */
  begin({ replay = false, variant = null } = {}) {
    this.build();
    this.fill();
    this.probeArt();
    this.replay = replay;
    this.variant = filmFor(this.h.G, { replay, variant });
    this.v2 = this.variant !== 'long';
    this.active = true;
    this.worldOk = false;
    this.skipToEnd = false;
    this.shotIdx = -1;
    this.shot = null;
    this.frozen = false;
    this.t0 = now();
    this.beganAt = this.t0;
    this.cast.armOpening();
    const r = this.root;
    r.classList.remove('hidden', 'shots', 'frozen', 'carding', 'phoning', 'done', 'holding', 'titles', 'run',
      'v2', 'flat', 'vamp', 'run2', 'film-first', 'film-quick');
    document.body.classList.add('opening-on');
    const a = this.h.audio;
    try { a.start(); a.resume(); } catch { /* no audio: silent opening */ }
    try { a.engine(0, 0); a.horn(false); a.skid(0); } catch { /* fine */ }
    // Seen once already (Sean, Lex, 6 Oct): every New Game after the first plays
    // the 3.5 s driveway settle (filmFor). A replay from the menu never skips.
    this.fast = false;
    if (!replay && seenBefore(this.h.G)) this.fast = this.variant === 'quick';
    if (this.v2) this.beginFilm();
    else {
      this.phase = 'title';
      r.classList.add('titles');
      this.restartTitles(0);
      this.sched2d(0);
    }
    window.addEventListener('keydown', this._keys, true);
    this.root.addEventListener('pointerdown', this._click);
    this.last = now();
    requestAnimationFrame(this._raf);
  }

  // ---------------------------------------------------------------- B-11: first and quick

  /**
   * The first launch (and the quick New Game): one clock in wall seconds from
   * the key press, so the picture, the CSS and the score scheduled on the
   * audio clock never drift apart, even when the bake holds the main thread.
   * Before the world exists the clock may run `film.pre` seconds over the 2D
   * sky (S1 and S2); past that it holds (the vamp) until the world arrives.
   */
  beginFilm() {
    const r = this.root, f = this.film = FILMS[this.variant];
    this.shots = f.shots;
    this.tl = timeline(this.variant);
    this.total = runningTime(this.variant);
    this.phase = 'shots';
    this.vamp = false;
    this.resumeAt = 0;
    this.T = 0;
    this.T0 = now();
    this.done2 = { cards: new Set(), says: new Set(), lower: new Set(), cues: new Set() };
    this.liveBubbles = [];
    this.cardUp = null;
    this.stats = { variant: this.variant, frames: 0, ms: 0, worst: 0, long: 0, by: {}, dts: [],
      gates: 1, cards: [], lines: [], shots: [], controlAt: null, worldReadyAt: null, p95: null, radioUpAt: null };
    r.classList.add('v2', 'shots', 'flat', 'film-' + this.variant);
    document.body.classList.add('opening-shots');
    this.$.lower.textContent = '';
    this.$.lower.classList.remove('in');
    this.$.caption.textContent = '';
    this.$.skip.textContent = this.lang === 'en' ? 'Esc  skip' : 'Échap  passer';
    this.clearBubbles();
    this.hideCard();
    if (this.variant === 'first') {
      this.line(this.tr(COLD_OPEN));
      this.line(TITLE.top + ' ' + TITLE.bottom);
      this.line(this.tr(TITLE.tag));
    }
    r.style.setProperty('--at', '0s');
    r.classList.remove('run2'); void r.offsetWidth; r.classList.add('run2');
    const s = this.score;
    if (s.ok) { this.busM = s.bus('music', 1); this.busFx = s.bus('fx', 1); }
    // What plays before the world exists is scheduled now, on the audio clock.
    this.schedCues(0, (c) => c.t < f.pre);
    if (f.pre <= 0) this.enterVamp();
  }

  /** A string the film put on screen, for the checks (every one is unique). */
  line(t) { if (t && this.stats && !this.stats.lines.includes(t)) this.stats.lines.push(t); }

  /** Schedule the score cues that pass `pick`, as seen from film time `from`. */
  schedCues(from, pick) {
    const s = this.score;
    for (const c of this.tl.cues) {
      if (!pick(c) || this.done2.cues.has(c)) continue;
      const late = from - c.t;
      const lasting = c.cue === 'dawn' || c.cue === 'shore' || c.cue === 'dawnChorus' || c.cue === 'pad';
      if (late > 0.25 && !(lasting && c.arg - late > 1)) { this.done2.cues.add(c); continue; }
      this.done2.cues.add(c);
      const at = (s.ok ? s.now : 0) + 0.02 + Math.max(0, -late);
      const arg = lasting && late > 0 ? c.arg - late : c.arg;
      this.playCue(c.cue, at, arg, c.bus, c.t);
    }
  }

  playCue(cue, at, arg, busKind, filmT = this.T) {
    const s = this.score;
    if (cue === 'radio') {
      this.stats.radioUpAt = filmT;
      try { this.h.radioUp?.(s.ok ? at : 0, arg); } catch { /* the game's own ramp still runs */ }
      return;
    }
    if (!s.ok) return;
    const bus = busKind === 'fx' ? this.busFx : this.busM;
    if (!bus) return;
    if (cue === 'release') {
      const ms = Math.max(0, (at - s.now) * 1000);
      setTimeout(() => { if (this.busM === bus) { s.release(bus, arg || 2); this.busM = null; } }, ms);
      return;
    }
    if (typeof s[cue] !== 'function') return;
    if (arg == null) s[cue](bus, at); else s[cue](bus, at, arg);
  }

  enterVamp() {
    this.vamp = true;
    this.root.classList.add('vamp', 'holding');
    const s = this.score;
    if (s.ok && this.busM && !this.vampPad) this.vampPad = s.pad(this.busM, s.now + 0.1, 12) || true;
  }

  /** The world arrived (or the vamp is over): T resumes from where it stands. */
  leaveVamp() {
    this.vamp = false;
    this.resumeAt = 0;
    this.T0 = now() - this.T * 1000;
    this.root.classList.remove('vamp', 'holding');
    this.$.dip.classList.remove('go'); void this.$.dip.offsetWidth; this.$.dip.classList.add('go');
  }

  tickFilm(dt) {
    const f = this.film, t = now();
    if (this.vamp) {
      this.T0 = t - this.T * 1000;           // the clock holds
      this.paintLoad();
      if (this.worldOk && !this.resumeAt) this.resumeAt = t + (this.variant === 'quick' ? 200 : 800);
      if (this.resumeAt && t >= this.resumeAt) this.leaveVamp();
      else return;
    }
    this.T = (t - this.T0) / 1000;
    if (!this.worldOk) {
      if (this.T >= f.pre) { this.T = f.pre; this.enterVamp(); }
      // The 2D shots count as played: their words and cues are on screen and in the air.
      this.tl.starts.forEach((t0, i) => { const id = this.shots[i].id; if (this.T >= t0 && t0 < f.pre && !this.stats.shots.includes(id)) this.stats.shots.push(id); });
      return;                                 // 2D over the sky: CSS and the audio clock carry it
    }
    if (this.T >= this.total) { this.finish(); return; }
    const starts = this.tl.starts;
    let i = 0;
    while (i < starts.length - 1 && this.T >= starts[i + 1]) i++;
    let rdt = dt;
    if (i !== this.shotIdx) {
      // A cut (or the first live frame) lands on a finished picture: one long-dt
      // draw snaps the world's fade-ins, as the long film's startShot does.
      if (this.shotIdx < 0 || !this.shots[i].join) rdt = 5;
      this.startFilmShot(i);
    }
    this.tickEvents();
    const t1 = now();
    this.renderPose(this.T - starts[i], rdt);
    const st = this.stats, ms = now() - t1;
    st.frames++; st.ms += ms; if (ms > st.worst) st.worst = ms; if (dt > 0.05) st.long++;
    if (dt > 0 && st.dts.length < 6000) st.dts.push(dt * 1000);
    const id = this.shot && this.shot.id;
    if (id && ms > (st.by[id] || 0)) st.by[id] = Math.round(ms);
  }

  paintLoad() {
    const bar = document.querySelector('#loading .lbar i');
    if (bar) this.$.loadBar.style.width = bar.style.width || '60%';
    const stage = document.querySelector('#loading .lstage');
    this.$.loadText.textContent = (this.lang === 'en' ? 'Building Aylmer… ' : 'On bâtit Aylmer… ') + (stage?.textContent || '');
  }

  startFilmShot(i, warm = false) {
    const shot = this.shots[i];
    if (!shot) { this.finish(); return; }
    const prev = this.shotIdx;
    this.shotIdx = i;
    this.shot = shot;
    this.applyShotWorld(shot);
    this.endKey = null;
    if (shot.handoff) {
      const c = this.h.chasePose();
      if (c) this.endKey = [1, c.x, c.agl, c.z, c.lx, c.lagl, c.lz, c.fov];
    }
    if (warm) { this.renderPose(this.T - this.tl.starts[i], 5); return; }
    if (!this.stats.shots.includes(shot.id)) this.stats.shots.push(shot.id);
    // A cut dips; a join (one move) does not; the shot the world arrived in fades up instead.
    if (!shot.join && prev >= 0) { this.$.dip.classList.remove('go'); void this.$.dip.offsetWidth; this.$.dip.classList.add('go'); }
    const cap = shot.caption ? this.tr(shot.caption) : '';
    if (cap || !shot.join) this.typeCaption(cap);
    this.line(cap);
    // Cues from here on are scheduled as each shot starts (a vamp may have moved them).
    this.schedCues(this.T, (c) => c.shot === i);
  }

  /** Moving cards, spoken lines and lower-thirds, on the film's own clock. */
  tickEvents() {
    const T = this.T, d = this.done2, tl = this.tl;
    for (const c of tl.cards) {
      if (T >= c.t && T < c.end && !d.cards.has(c) && this.cardUp !== c) {
        d.cards.add(c);
        this.cardUp = c;
        c.shownAt = T;
        c.shownPage = now();
        const card = CARDS[c.id];
        this.showCard(card);
        if (!this.stats.cards.includes(c.id)) this.stats.cards.push(c.id);
        for (const k of [this.tr(card.kicker), card.name, card.place, this.tr(card.line)]) this.line(k);
      }
      if (this.cardUp === c && T >= c.end) this.dropCard(c, T);
    }
    for (const b of tl.says) {
      if (T >= b.t && !d.says.has(b)) {
        d.says.add(b);
        // Older lines dim and step up, one bubble height per newer line, so a
        // speaker's lines stack instead of covering each other.
        for (const lb of this.liveBubbles) { lb.age = (lb.age || 0) + 1; lb.el.classList.add('old'); lb.el.style.setProperty('--age', lb.age); }
        const el = this.bubble(b.who, b.text, b.anchor);
        this.liveBubbles.push({ el, end: b.end });
        this.line(b.text);
      }
    }
    this.liveBubbles = this.liveBubbles.filter((lb) => { if (T < lb.end) return true; lb.el.remove(); return false; });
    let low = null;
    for (const l of tl.lower) if (T >= l.t && T < l.end) low = l;
    if (low !== this.lowUp) {
      this.lowUp = low;
      const e = this.$.lower;
      if (low) { const txt = this.tr(LOWER[low.key]); e.textContent = txt; this.line(txt); e.classList.remove('in'); void e.offsetWidth; e.classList.add('in'); }
      else e.classList.remove('in');
    }
  }

  /** A film card leaves; it counts as seen once it was up 1.5 s (never in a replay). */
  dropCard(c, T) {
    this.cardUp = null;
    this.hideCard();
    if (!this.replay && T - (c.shownAt ?? T) >= 1.5) this.cast.markSeen(c.id, { job: 'opening', phase: 'film', t0: c.shownPage });
  }

  /** The 2D timeline from `at` seconds: CSS restarted with a negative delay, sound rescheduled. */
  restartTitles(at) {
    const r = this.root;
    this.t0 = now() - at * 1000;
    r.style.setProperty('--at', `${-at}s`);
    r.classList.remove('run');
    void r.offsetWidth;            // restart every CSS animation from the new offset
    r.classList.add('run');
  }

  sched2d(at) {
    const s = this.score;
    if (!s.ok) return;
    if (this.bus2d) s.release(this.bus2d, 0.35);
    const bus = this.bus2d = s.bus('music', 1);
    const t = s.now + 0.05;
    if (at < TITLE_AT - 0.5) s.coldOpen(bus, t - at);
    if (at < TITLE_AT + 1) s.sting(bus, t + Math.max(0, TITLE_AT - at));
    if (at < CRAWL_END - 2) s.pad(bus, t + Math.max(0, CRAWL_AT - at), Math.max(4, CRAWL_END - Math.max(at, CRAWL_AT)));
  }

  /** main.js, when enterDrive has built the new game (or the replay stage is set). */
  worldReady() {
    const G = this.h.G;
    this.worldOk = true;
    G.mode = 'opening';
    this.saved = {
      dd: G.q.drawDist, cam: G.cam, focus: G.focus,
      couch: G.world?.landmarks?.flags?.couchInTree,
    };
    try { this.h.radio.suspend(); } catch { /* fine */ }
    this.h.hud.setVisible(false);
    this.h.hud.setModalOpen(true);
    this.h.hud.toasts?.clear?.();
    this.h.heckle?.clear?.();
    if (this.stats && this.v2) this.stats.worldReadyAt = +((now() - this.beganAt) / 1000).toFixed(2);
    if (this.skipToEnd) { this.finish(); return; }
    if (this.v2 && !this.vamp) {
      // Arrived during S1 or S2: one warm draw behind the sky, then the sky fades
      // (0.8 s, opacity only) onto the live shot at its current time.
      this.T = (now() - this.T0) / 1000;
      const starts = this.tl.starts;
      let i = 0;
      while (i < starts.length - 1 && this.T >= starts[i + 1]) i++;
      this.startFilmShot(i, true);
      this.shotIdx = -1;
    }
    this.root.classList.remove('flat');
  }

  // ---------------------------------------------------------------- input

  onKey(e) {
    if (!this.active) return;
    if (e.code === 'Tab') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    // The press that started it is consumed: no skip in the first half second.
    if (this.v2 && now() - this.beganAt < 500) return;
    if (e.code === 'Escape') this.skipAll();
    else if (['Enter', 'Space', 'KeyE', 'NumpadEnter'].includes(e.code)) this.skipBeat();
  }

  /** The pad, from main.js's padOutsideDrive (A = next beat, B / Start = all). */
  pad(button) { if (button === 'A') this.skipBeat(); else this.skipAll(); }

  skipBeat() {
    if (!this.active) return;
    if (this.v2) {
      if (now() - this.beganAt < 500 || this.vamp || !this.worldOk) return;
      const next = this.tl.starts.find((t) => t > this.T + 0.05);
      if (next == null) { this.finish(); return; }
      if (this.cardUp) this.dropCard(this.cardUp, this.T);
      this.T0 -= (next - this.T) * 1000;
      this.T = next;
      return;
    }
    if (this.phase === 'title') {
      const t = (now() - this.t0) / 1000;
      const next = t < TITLE_AT ? TITLE_AT : t < CRAWL_AT ? CRAWL_AT : CRAWL_END;
      this.restartTitles(next);
      this.sched2d(next);
      return;
    }
    if (this.phase === 'shots') {
      // A card up: drop it and carry on. A move: straight to the next shot.
      if (this.frozen) this.unfreeze(true);
      else this.nextShot();
    }
  }

  skipAll() {
    if (!this.active) return;
    if (this.worldOk) { this.finish(); return; }
    // Still baking: say so, and hand over the moment it is done.
    this.skipToEnd = true;
    if (this.v2) { this.root.classList.add('holding'); this.vamp = true; this.score.stopAll(0.4); return; }
    this.phase = 'hold';
    this.root.classList.add('holding');
    this.restartTitles(CRAWL_END + 30);
    if (this.bus2d) this.score.release(this.bus2d, 0.4);
  }

  // ---------------------------------------------------------------- the loop

  loop(t) {
    if (!this.active) return;
    requestAnimationFrame(this._raf);
    let dt = (t - (this.last || t)) / 1000;
    this.last = t;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    if (this.v2) { this.tickFilm(dt); return; }
    if (this.phase === 'title' || this.phase === 'hold') this.tickTitles();
    else if (this.phase === 'shots') {
      const t0 = now();
      this.tickShots(dt);
      // What the film costs, for the checks: frames drawn and the slowest one.
      const st = this.stats, ms = now() - t0;
      if (!this.frozen) {
        st.frames++; st.ms += ms; if (ms > st.worst) st.worst = ms; if (dt > 0.05) st.long++;
        const id = this.shot && this.shot.id;
        if (id && ms > (st.by[id] || 0)) st.by[id] = Math.round(ms);
      }
    }
  }

  tickTitles() {
    const t = (now() - this.t0) / 1000;
    // The bake's own progress bar, borrowed: show it only once the crawl is
    // over and the world still is not.
    const holding = !this.worldOk && t >= CRAWL_END - 0.5;
    this.root.classList.toggle('holding', holding || this.skipToEnd);
    if (holding || this.skipToEnd) {
      const bar = document.querySelector('#loading .lbar i');
      const stage = document.querySelector('#loading .lstage');
      if (bar) this.$.loadBar.style.width = bar.style.width || '60%';
      this.$.loadText.textContent = (this.lang === 'en' ? 'Building Aylmer… ' : 'On bâtit Aylmer… ') + (stage?.textContent || '');
    }
    if (this.worldOk && !this.skipToEnd) {
      // Warm the GPU behind the curtain: the first frame of the lake is drawn
      // while the crawl is still up, so its upload hitch is never seen.
      if (t >= CRAWL_END - 1.5 && !this.warmed) { this.warmed = true; this.startShot(0, true); }
      if (t >= CRAWL_END) this.startShots();
    }
  }

  startShots() {
    this.phase = 'shots';
    this.root.classList.remove('titles', 'holding');
    this.root.classList.add('shots');
    document.body.classList.add('opening-shots');
    if (this.bus2d) this.score.release(this.bus2d, 2.5);
    const s = this.score;
    if (s.ok) {
      this.bus3d = s.bus('music', 1);
      this.busFx = s.bus('fx', 1);
      s.dawn(this.bus3d, s.now + 0.2, TOTAL_3D + 4);
      s.shore(this.busFx, s.now + 0.5, 15);
    }
    this.s3d = 0;
    this.stats = { frames: 0, ms: 0, worst: 0, long: 0, by: {} };
    this.startShot(0);
  }

  // ---------------------------------------------------------------- shots

  startShot(i, warm = false) {
    const shot = SHOTS[i];
    if (!shot) { this.finish(); return; }
    this.shotIdx = i;
    this.shot = shot;
    this.shotT = 0;
    this.frozen = false;
    this.carded = false;
    this.cardGone = false;
    this.saidAt = 0;
    this.applyShotWorld(shot);
    this.endKey = null;
    if (shot.handoff) {
      // The last key is the chase camera's own pose, so play just continues.
      const c = this.h.chasePose();
      if (c) this.endKey = [1, c.x, c.agl, c.z, c.lx, c.lagl, c.lz, c.fov];
    }
    // A cut lands on a finished picture: the world fades new chunks and the
    // near houses in through fog over a second (world.js W2), which on a cut
    // reads as a ghostly slab in frame. One long-dt draw snaps every fade.
    if (warm) { this.renderPose(0, 5); return; }
    this.$.dip.classList.remove('go'); void this.$.dip.offsetWidth; this.$.dip.classList.add('go');
    this.typeCaption(shot.caption ? this.tr(shot.caption) : '');
    this.clearBubbles();
    const s = this.score;
    if (s.ok && this.busFx) {
      if (shot.ring) s.ring(this.busFx, s.now + 0.05, 2);
      if (shot.id === 'fraser' || shot.id === 'ranger') s.dawnChorus(this.busFx, s.now + 0.3, shot.dur + 2);
    }
    this.renderPose(0, 5);
  }

  nextShot() {
    this.hideCard();
    this.s3d += Math.max(0, this.shot.dur - this.shotT);
    this.startShot(this.shotIdx + 1);
  }

  keysFor(shot) {
    if (!this.endKey) return shot.keys;
    const k = shot.keys.slice(0, -1);
    k.push(this.endKey);
    return k;
  }

  /** The camera at `t` seconds into the current shot; draws a frame unless told not to. */
  renderPose(t, dt, draw = true) {
    const G = this.h.G, shot = this.shot;
    const p = railAt(this.keysFor(shot), shot.dur > 0 ? t / shot.dur : 1);
    if (!p) return;
    const gy = this.h.groundY;
    const y = Math.max(gy(p.x, p.z) + p.y, gy(p.x, p.z) + 0.9);
    const ly = gy(p.lx, p.lz) + p.ly;
    const a = aim(p.x, y, p.z, p.lx, ly, p.lz);
    // Framing: the subject sits at (sx, sy) of the frame instead of dead
    // centre, so a name card on the left never covers the person it names.
    const th = Math.tan(p.fov / 2), asp = (window.innerWidth || 16) / (window.innerHeight || 9);
    if (shot.sx != null) a.yaw += Math.atan((shot.sx - 0.5) * 2 * th * asp);
    if (shot.sy != null) a.pitch += Math.atan((shot.sy - 0.5) * 2 * th);
    const cam = this.cam = { x: p.x, y, z: p.z, yaw: a.yaw, pitch: a.pitch, fov: p.fov };
    G.cineCam = cam;
    // The world is drawn around a point a little behind the eye: everything in
    // view is inside the draw distance, and no avatar is close enough to the
    // « focus » to start saying hello.
    const back = 18;
    G.focus = { x: p.x + Math.sin(a.yaw) * back, z: p.z + Math.cos(a.yaw) * back, yaw: 0, vLong: 0, vLat: 0, bodyY: y };
    this.h.setHour(this.v2 ? dawnHour(this.T, this.total, this.film.dawn) : dawnHour(this.s3d + t, TOTAL_3D), shot.fog);
    if (draw) this.h.render(dt);
  }

  applyShotWorld(shot) {
    const G = this.h.G;
    // The aerials want to see the far shore; how far is a quality decision, so
    // a MacBook Air on « low » or « med » is not asked for a whole town at once.
    const cap = { low: 900, med: 1250, high: 1600 }[G.quality] || 1250;
    G.q.drawDist = Math.max(this.saved.dd, Math.min(shot.dd || 0, cap));
    const av = G.avatars;
    if (av) {
      av.spots = av.spots || {};
      // Back to their own spots, then the shot's exceptions.
      for (const k of ['sayyad', 'zahra', 'mike', 'margaret']) delete av.spots[k];
      for (const k of shot.hide || []) av.spots[k] = null;
      if (shot.margaret) {
        const d = this.h.doorstep && this.h.doorstep();
        if (d) av.spots.margaret = d;
      }
    }
    const flags = G.world?.landmarks?.flags;
    if (flags && this.saved.couch !== undefined) flags.couchInTree = shot.couch === false ? false : this.saved.couch;
  }

  tickShots(dt) {
    const shot = this.shot;
    if (!shot) return;
    if (this.frozen) {
      this.holdT += dt;
      this.tickBubbles(this.holdT);
      if (this.holdT >= (shot.hold || 0)) this.unfreeze(false);
      return;
    }
    this.shotT += dt;
    if (shot.says) this.tickShotSays(this.shotT);
    if (shot.card && shot.moving) {
      // A card on the move: it slides in and out while the camera keeps going.
      if (!this.carded && this.shotT >= shot.cardAt) { this.carded = true; this.showCard(CARDS[shot.card]); }
      else if (this.carded && !this.cardGone && this.shotT >= shot.cardAt + (shot.hold || 3)) { this.cardGone = true; this.hideCard(); }
    } else if (shot.card && !this.carded && this.shotT >= shot.cardAt) {
      this.shotT = shot.cardAt;
      this.renderPose(this.shotT, 5);
      this.freeze();
      return;
    }
    if (this.shotT >= shot.dur) {
      if (shot.handoff) { this.finish(); return; }
      this.s3d += shot.dur;
      this.startShot(this.shotIdx + 1);
      return;
    }
    this.renderPose(this.shotT, dt);
  }

  // ---------------------------------------------------------------- cards

  freeze() {
    const shot = this.shot, c = CARDS[shot.card];
    this.frozen = true;
    this.carded = true;
    this.holdT = 0;
    this.saidIdx = 0;
    this.clearBubbles();
    this.root.classList.add('frozen');
    document.body.classList.add('opening-frozen');
    this.$.flash.classList.remove('go'); void this.$.flash.offsetWidth; this.$.flash.classList.add('go');
    const s = this.score;
    if (s.ok && this.busFx) s.freeze(this.busFx, s.now + 0.02);
    this.showCard(c);
  }

  unfreeze(skipped) {
    const shot = this.shot;
    this.frozen = false;
    this.root.classList.remove('frozen');
    document.body.classList.remove('opening-frozen');
    this.hideCard();
    this.clearBubbles();
    if (shot.handoff) {
      // The key. Two grinds and a catch, while the camera settles behind the truck.
      const s = this.score;
      if (s.ok && this.busFx) s.crank(this.busFx, s.now + 0.1);
    }
    if (skipped && shot.cardAt >= shot.dur - 0.05) { this.nextShot(); return; }
  }

  showCard(c) {
    const $ = this.$;
    this.root.style.setProperty('--accent', c.accent || '#ffd23f');
    $.kicker.textContent = this.tr(c.kicker);
    $.name.textContent = c.name;
    $.name.dataset.text = c.name;
    $.place.textContent = c.place || '';
    $.line.textContent = this.tr(c.line);
    const art = c.portrait && this.art.has(c.portrait + '.png') ? c.portrait + '.png'
      : c.portrait && this.art.has(c.portrait + '.jpg') ? c.portrait + '.jpg' : null;
    $.card.classList.toggle('has-art', !!art);
    if (art) $.img.src = LOCAL_ART + art; else $.img.removeAttribute('src');
    $.card.dataset.who = c.id;
    this.root.classList.toggle('phoning', !!c.phone);
    $.card.classList.remove('in'); void $.card.offsetWidth; $.card.classList.add('in');
    this.root.classList.add('carding');
  }

  hideCard() {
    this.root.classList.remove('carding', 'phoning');
    this.$.card.classList.remove('in');
  }

  // ---------------------------------------------------------------- bubbles

  /** Lines said during the move, before the freeze (Margaret calling down). */
  tickShotSays(t) {
    const list = this.shot.says;
    for (let i = this.saidAt; i < list.length; i++) {
      if (t < list[i][0]) break;
      this.bubble(list[i][1], list[i][2], 'margaret');
      this.saidAt = i + 1;
    }
  }

  /** The card's own lines, one after another while it holds. */
  tickBubbles(t) {
    const c = CARDS[this.shot.card];
    const list = (c && c.says) || [];
    if (!list.length) return;
    const gap = Math.max(1.8, ((this.shot.hold || 3) - 0.6) / list.length);
    const due = Math.floor((t - 0.45) / gap);
    while (this.saidIdx <= due && this.saidIdx < list.length) {
      const [who, text, how] = list[this.saidIdx];
      if (this.saidIdx > 0 && c.phone) this.clearBubbles(true);
      this.bubble(who, text, c.id, how);
      this.saidIdx++;
    }
  }

  clearBubbles(keepLast = false) {
    const b = this.$.bubbles;
    if (!keepLast) { b.innerHTML = ''; return; }
    while (b.children.length > 1) b.removeChild(b.firstChild);
    if (b.firstChild) b.firstChild.classList.add('old');
  }

  /** A speech bubble, pointed at the speaker's head if we know where it is. */
  bubble(who, text, id, how = '') {
    const b = el('div', 'op-bubble' + (how ? ' ' + how : ''));
    b.innerHTML = `<b>${esc(who)}</b><span>${esc(text)}</span>`;
    const anchor = this.h.anchor && this.h.anchor(id);
    const W = window.innerWidth, H = window.innerHeight;
    let p = null;
    if (anchor && this.cam) p = project(this.cam, anchor.x, anchor.y, anchor.z, W / H);
    if (p && p.x > 0.04 && p.x < 0.96 && p.y > 0.08 && p.y < 0.9) {
      b.classList.add('pinned');
      b.style.left = `${Math.min(W - 340, Math.max(16, p.x * W - 40))}px`;
      b.style.top = `${Math.max(60, p.y * H - 96)}px`;
    } else {
      b.classList.add('voice');
    }
    this.$.bubbles.appendChild(b);
    return b;
  }

  // ---------------------------------------------------------------- captions

  typeCaption(text) {
    const c = this.$.caption;
    c.textContent = '';
    if (this._typeT) clearInterval(this._typeT);
    if (!text) return;
    let i = 0;
    this._typeT = setInterval(() => {
      i++;
      c.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(this._typeT); this._typeT = 0; }
    }, 34);
  }

  // ---------------------------------------------------------------- the end

  finish() {
    if (!this.active) return;
    const G = this.h.G;
    this.active = false;
    this.phase = 'done';
    window.removeEventListener('keydown', this._keys, true);
    this.root.removeEventListener('pointerdown', this._click);
    if (this._typeT) { clearInterval(this._typeT); this._typeT = 0; }
    const handedOff = this.v2 ? !!(this.worldOk && !this.skipToEnd && this.T >= this.total - 0.05)
      : !!(this.shot && this.shot.handoff && !this.frozen);
    if (this.v2 && this.stats) {
      const st = this.stats;
      if (this.cardUp) this.dropCard(this.cardUp, this.T);
      for (const lb of this.liveBubbles || []) lb.el.remove();
      this.liveBubbles = [];
      this.$.lower.classList.remove('in');
      st.controlAt = +((now() - this.beganAt) / 1000).toFixed(2);
      st.controlPageT = +(now() / 1000).toFixed(2);
      const d = st.dts.slice().sort((a, b) => a - b);
      st.p95 = d.length ? +d[Math.min(d.length - 1, Math.floor(d.length * 0.95))].toFixed(1) : null;
      st.skipped = !handedOff;
    }
    this.score.stopAll(handedOff ? 2.2 : 0.5);
    if (!handedOff && !this.replay && this.score.ok) {
      // Skipped: the truck still has to start.
      const fx = this.score.bus('fx', 1);
      this.score.crank(fx, this.score.now + 0.15);
      setTimeout(() => this.score.release(fx, 0.5), 4200);
    }
    // Put the world back exactly as the game left it.
    if (this.saved) {
      G.q.drawDist = this.saved.dd;
      const flags = G.world?.landmarks?.flags;
      if (flags && this.saved.couch !== undefined) flags.couchInTree = this.saved.couch;
      G.focus = this.saved.focus || null;
    }
    const av = G.avatars;
    if (av && av.spots) for (const k of ['sayyad', 'zahra', 'mike', 'margaret']) delete av.spots[k];
    G.cineCam = null;
    this.root.classList.remove('frozen', 'carding', 'phoning');
    document.body.classList.remove('opening-frozen');
    this.root.classList.add('done');
    // Fade the curtain away rather than cut, then let go of it.
    setTimeout(() => {
      this.root.classList.add('hidden');
      this.root.classList.remove('done', 'shots', 'titles', 'run', 'holding');
      document.body.classList.remove('opening-on', 'opening-shots');
    }, 650);
    if (this.worldOk) {
      this.h.restoreClock(this.replay);
      this.h.hud.toasts?.clear?.();
      this.h.heckle?.clear?.();
      this.h.hud.setModalOpen(false);
    }
    this.root.classList.remove('v2', 'flat', 'vamp', 'run2', 'film-first', 'film-quick');
    this.h.onDone(this.replay ? 'replay' : 'new', { skipped: !handedOff, worldOk: this.worldOk });
    // B-11: Tom's card at control (and Dad's, if the film was skipped). Idempotent,
    // so main.js may also call it (B-12b W6). Live cards never stop the game.
    if (!this.replay && this.worldOk) {
      const ids = this.cast.afterOpening({ skipped: !handedOff });
      if (this.stats && this.v2) for (const id of ids) if (!this.stats.cards.includes(id)) this.stats.cards.push(id);
    }
  }
}

// A black corded desk phone, 2004, drawn rather than photographed: the base
// with its twelve buttons, the handset in the cradle, the coiled cord.
const KEYS = [0, 1, 2, 3].map((r) => [0, 1, 2].map((c) =>
  `<rect x="${112 + c * 27 + r * 1.5}" y="${128 + r * 15}" width="21" height="10" rx="3"/>`).join('')).join('');
const PHONE_SVG = `<svg viewBox="0 0 300 230" aria-hidden="true">
  <defs>
    <linearGradient id="opph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a505a"/><stop offset=".45" stop-color="#1d2026"/><stop offset="1" stop-color="#08090b"/></linearGradient>
    <linearGradient id="ophs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a616c"/><stop offset="1" stop-color="#121418"/></linearGradient>
  </defs>
  <path d="M44 212 L74 112 Q80 100 96 100 L204 100 Q220 100 226 112 L256 212 Q258 220 248 220 L52 220 Q42 220 44 212 Z" fill="url(#opph)" stroke="#000" stroke-width="6" stroke-linejoin="round"/>
  <path d="M60 205 L240 205" stroke="#000" stroke-width="3" opacity=".5"/>
  <g fill="#d8dce2" stroke="#000" stroke-width="2">${KEYS}</g>
  <rect x="86" y="92" width="34" height="14" rx="6" fill="#0c0d10" stroke="#000" stroke-width="4"/>
  <rect x="180" y="92" width="34" height="14" rx="6" fill="#0c0d10" stroke="#000" stroke-width="4"/>
  <g class="op-handset">
    <path d="M22 86 C18 52 58 44 84 60 L216 60 C242 44 282 52 278 86 C276 104 250 110 236 96 L64 96 C50 110 24 104 22 86 Z" fill="url(#ophs)" stroke="#000" stroke-width="6" stroke-linejoin="round"/>
    <path d="M86 70 L214 70" stroke="#7d8591" stroke-width="3" stroke-linecap="round" opacity=".7"/>
  </g>
  <path d="M30 100 c-14 8 10 14 -2 22 c-12 8 12 14 0 22 c-12 8 12 14 0 22 c-10 7 8 12 20 16" fill="none" stroke="#050506" stroke-width="5" stroke-linecap="round"/>
</svg>`;

// ---------------------------------------------------------------- B-11: live cast cards

let current = null;

/**
 * Show one name card live, once per machine (B-12b calls it, or queueForJob,
 * at mission start). False when that card was already seen or is queued.
 */
export function showCastCardOnce(id) { return current ? current.showOnce(id) : false; }

const CAST_KEY = 'aylmer.castseen';
const DRIVE_KEYS = new Set(['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'Space']);

/** Anything that must hide a live card at once: a pause, the menu, a brief card. */
function blockedNow(doc) {
  if (!doc) return false;
  const up = (id) => { const e = doc.getElementById(id); return !!e && !e.classList.contains('hidden') && !e.hidden && e.getClientRects().length > 0; };
  return up('pause') || up('menu') || up('cinematic') || !!doc.body?.classList.contains('opening-on');
}

/**
 * The ten name cards as live cards: the same art as the film's, in their own
 * layer (#castcard) outside #opening, sliding in bottom-left. They never stop
 * the game and swallow no input. Timers only, no rAF: 0 ms per frame in play.
 * Seen ids persist in their own key (store.js, so the review namespace
 * applies), or through `markSeen` when main.js lends one.
 */
export class CastCards {
  constructor({ G = null, doc = typeof document !== 'undefined' ? document : null, timers = null,
    clock = null, markSeen = null, blocked = null } = {}) {
    this.G = G;
    this.doc = doc;
    this.timers = timers || { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h) };
    this.clock = clock || now;
    this.hookSeen = markSeen;
    this.blocked = blocked || (() => blockedNow(this.doc));
    this.queue = [];
    this.cur = null;
    this.idle = [];
    this.log = [];
    this.seenIds = new Set((readJSON(CAST_KEY, { ids: [] }).ids || []).filter((x) => typeof x === 'string'));
    this.root = null;
    this._key = (e) => { if (this.cur && this.cur.leaveOnDrive && DRIVE_KEYS.has(e.code)) this.hide(true); };
  }

  get lang() { return this.G?.settings?.lang === 'en' ? 'en' : 'fr'; }
  get active() { return !!this.cur || this.queue.length > 0; }

  seen() {
    const s = new Set(this.seenIds);
    for (const id of this.G?.settings?.castSeen || []) s.add(id);
    return s;
  }
  pending() { const s = new Set(this.queue.map((q) => q.id)); if (this.cur) s.add(this.cur.id); return s; }

  markSeen(id, meta = {}) {
    if (!this.seenIds.has(id)) {
      this.seenIds.add(id);
      writeJSON(CAST_KEY, { ids: [...this.seenIds] });
      try { this.hookSeen?.(id); } catch { /* persisted above anyway */ }
    }
    if (!this.log.some((l) => l.id === id)) {
      this.log.push({ id, job: meta.job || null, phase: meta.phase || null,
        shownT: meta.t0 != null ? +(meta.t0 / 1000).toFixed(2) : null, t: +(this.clock() / 1000).toFixed(2) });
    }
  }

  /** Cards due when job `jobId` starts ('start') or before its end lines ('end'). Returns how many. */
  queueForJob(jobId, phase = 'start') {
    const skip = this.seen();
    for (const id of this.pending()) skip.add(id);
    const ids = castFor(jobId, skip, phase);
    for (const id of ids) this.queue.push({ id, job: jobId, phase });
    this.pump();
    return ids.length;
  }

  showOnce(id, meta = {}) {
    if (!CARDS[id] || this.seen().has(id) || this.pending().has(id)) return false;
    this.queue.push({ id, job: meta.job || null, phase: meta.phase || 'start' });
    this.pump();
    return true;
  }

  /** Once per opening (Opening.begin re-arms it). */
  armOpening() { this.openingDone = false; }

  /** At control: TOM, and TON PÈRE first if the film was skipped. Returns the ids queued. */
  afterOpening({ skipped = false } = {}) {
    if (this.openingDone) return [];
    this.openingDone = true;
    const want = skipped ? ['dad', 'tom'] : ['tom'];
    const skip = this.seen(); for (const id of this.pending()) skip.add(id);
    const ids = want.filter((id) => !skip.has(id));
    for (const id of ids) this.queue.push({ id, job: 'control', phase: 'start', leaveOnDrive: id === 'tom' });
    if (ids.length) this.timers.set(() => this.pump(), 300);
    return ids;
  }

  onIdle(fn) { if (!this.active) fn(); else this.idle.push(fn); }

  /** A job closed: lines still waiting on a card for it are moot (main.js closeMission). */
  dropIdle() { this.idle.length = 0; }

  /** A pause, the menu or a fail: hide at once; under 1.5 s up, it goes back in the queue. */
  interrupt() {
    if (!this.cur) return;
    const c = this.cur, up = (this.clock() - c.t0) / 1000;
    this.dropDom();
    this.timers.clear(c.hideT);
    this.timers.clear(c.watchT);
    this.cur = null;
    if (up >= 1.5) this.markSeen(c.id, c);
    else this.queue.unshift(c);
    this.timers.set(() => this.pump(), 250);
  }

  pump() {
    if (this.cur) return;
    if (!this.queue.length) { this.flushIdle(); return; }
    if (this.blocked()) { if (!this.waitT) this.waitT = this.timers.set(() => { this.waitT = 0; this.pump(); }, 250); return; }
    const c = this.queue.shift();
    const card = CARDS[c.id];
    const says = (card && card.says) || [];
    c.dur = Math.max(3.5, 1.2 + 1.6 * says.length);
    c.t0 = this.clock();
    this.cur = c;
    this.paint(card, says);
    c.hideT = this.timers.set(() => this.hide(false), c.dur * 1000);
    const watch = () => { if (this.cur !== c) return; if (this.blocked()) this.interrupt(); else c.watchT = this.timers.set(watch, 250); };
    c.watchT = this.timers.set(watch, 250);
  }

  hide() {
    const c = this.cur;
    if (!c) return;
    this.timers.clear(c.hideT);
    this.timers.clear(c.watchT);
    this.dropDom();
    this.cur = null;
    this.markSeen(c.id, c);
    if (this.queue.length) this.timers.set(() => this.pump(), 600);
    else this.flushIdle();
  }

  flushIdle() { const f = this.idle; this.idle = []; for (const fn of f) { try { fn(); } catch (e) { console.error(e); } } }

  // ---------------------------------------------------------------- DOM

  paint(card, says) {
    const d = this.doc;
    if (!d || !d.body || !card) return;
    injectStyle();
    if (!this.root) {
      const r = this.root = d.createElement('div');
      r.id = 'castcard';
      r.setAttribute('aria-live', 'polite');
      d.body.appendChild(r);
      if (typeof window !== 'undefined') window.addEventListener('keydown', this._key, { passive: true });
    }
    const tr = (o) => (o == null ? '' : typeof o === 'string' ? o : (o[this.lang] ?? o.fr ?? ''));
    const r = this.root;
    r.style.setProperty('--accent', card.accent || '#ffd23f');
    r.dataset.who = card.id;
    r.innerHTML = `<div class="cc-says"></div><div class="op-card in${card.phone ? ' phone' : ''}"><div class="op-card-band"></div>
      <div class="op-card-body"><div class="op-card-kicker">${esc(tr(card.kicker))}</div>
      <div class="op-card-name" data-text="${esc(card.name)}">${esc(card.name)}</div>
      <div class="op-card-place">${esc(card.place || '')}</div><div class="op-card-line">${esc(tr(card.line))}</div></div></div>`;
    r.classList.remove('out'); r.classList.add('on');
    const box = r.querySelector('.cc-says');
    says.forEach(([who, text, how], i) => this.timers.set(() => {
      if (!this.cur || this.cur.id !== card.id) return;
      for (const o of box.children) o.classList.add('old');
      const b = d.createElement('div');
      b.className = 'op-bubble voice' + (how ? ' ' + how : '');
      b.innerHTML = `<b>${esc(who)}</b><span>${esc(text)}</span>`;
      box.appendChild(b);
    }, 450 + i * 1600));
  }

  dropDom() { if (this.root) { this.root.classList.remove('on'); this.root.classList.add('out'); } }
}

// ---------------------------------------------------------------- B-11: style

// opening.css is not B-11's file in shift B2, so the rules the first film, the
// lower-thirds and the live cards need are injected once (design 6b fallback).
// Every keyframe animates opacity and transform only (compositor, bake-proof).
export const V2_CSS = `
#opening.v2 .op-sky{transition:opacity .8s ease}
#opening.v2.flat .op-sky{opacity:1}
#opening.v2.flat .op-horizon{opacity:.7}
#opening.v2 .op-crawl{display:none}
#opening.v2 .op-cold{background:transparent;opacity:1;align-items:flex-end;justify-content:flex-start;padding:0 0 calc(var(--op-bar) + 7vh) 7vw}
#opening.v2 .op-cold p{opacity:0;max-width:min(58vw,820px);text-shadow:0 2px 14px rgba(0,0,0,.85)}
#opening.v2.film-first.run2 .op-cold p{animation:op2-cold 4.5s ease both;animation-delay:var(--at,0s)}
#opening.v2.film-first.run2 .op-title{animation:op2-title 4.8s cubic-bezier(.12,.3,.3,1) both;animation-delay:calc(4.5s + var(--at,0s))}
#opening.v2.film-quick .op-title,#opening.v2.film-quick .op-cold{display:none}
#opening.v2.vamp .op-title{animation:none;opacity:.9;transform:translate(-38vw,-36vh) scale(.14)}
#opening.v2.film-first.vamp .op-title{opacity:.9}
#opening.v2.run2 .op-bar.top{animation:op2-bar-top .6s ease-out both}
#opening.v2.run2 .op-bar.bottom{animation:op2-bar-bottom .6s ease-out both}
#opening.v2 .op-skip{opacity:0}
#opening.v2.run2 .op-skip{animation:op2-skip 4.5s ease both;animation-delay:calc(1.5s + var(--at,0s))}
#opening.v2 .op-phone{width:min(10vw,140px);right:auto;left:5.5vw;bottom:calc(var(--op-bar) + 34vh)}
#opening.v2.phoning .op-bubble.voice{bottom:calc(var(--op-bar) + 8vh)}
#opening.v2 .op-bubble.old{animation:none;opacity:.5;transform:translateY(calc(-112% * var(--age,1))) scale(.94);transition:transform .3s,opacity .3s}
#opening .op-lower{left:auto;right:5vw;bottom:calc(var(--op-bar) + 4vh);max-width:min(40vw,560px);opacity:0;z-index:5;
  font-size:clamp(14px,1.35vw,21px);line-height:1.35;font-weight:700;color:#fff7e6;background:rgba(7,8,12,.82);
  padding:.55em .9em;border-right:.3em solid var(--op-crawl);text-align:right}
#opening .op-lower.in{animation:op2-lower-in .45s ease-out both}
@keyframes op2-cold{0%,6%{opacity:0}18%,86%{opacity:1}100%{opacity:0}}
@keyframes op2-title{0%{opacity:0;transform:scale(1.08)}3%{opacity:1;transform:scale(1)}73%{opacity:1;transform:scale(1)}100%{opacity:0;transform:translate(-38vw,-36vh) scale(.12)}}
@keyframes op2-bar-top{from{transform:translateY(-100%)}to{transform:none}}
@keyframes op2-bar-bottom{from{transform:translateY(100%)}to{transform:none}}
@keyframes op2-skip{0%{opacity:0}10%,85%{opacity:1}100%{opacity:0}}
@keyframes op2-lower-in{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
#castcard{position:fixed;left:24px;bottom:300px;z-index:8;max-height:26vh;pointer-events:none;opacity:0;
  transform:scale(.5);transform-origin:0 100%;width:min(60vw,820px)}
#castcard.on{animation:op2-cast-in .35s cubic-bezier(.2,.9,.3,1.1) both}
#castcard.out{animation:op2-cast-out .3s ease-in both}
#castcard .op-card{position:relative;left:auto;bottom:auto;width:auto;opacity:1}
#castcard .op-card-band{position:absolute}
#castcard .cc-says{display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin:0 0 14px 1vw}
#castcard .op-bubble{position:relative;left:auto;right:auto;top:auto;bottom:auto;max-width:min(52vw,640px);font-size:clamp(22px,2.2vw,34px)}
#castcard .op-bubble.old{opacity:.5;transform:none}
@keyframes op2-cast-in{from{opacity:0;transform:scale(.5) translateX(-40px)}to{opacity:1;transform:scale(.5)}}
@keyframes op2-cast-out{from{opacity:1;transform:scale(.5)}to{opacity:0;transform:scale(.5) translateX(-40px)}}
`;

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById('op-v2')) return;
  const st = document.createElement('style');
  st.id = 'op-v2';
  st.textContent = V2_CSS;
  document.head.appendChild(st);
}
