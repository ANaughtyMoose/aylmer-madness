// The style chain (plan v2, B-03; was C-01): driving well pays, live, on screen.
//
// Four things feed ONE chain, x1 to x3:
//   near       a traffic car passed within NEAR.gap metres of air at more than
//              NEAR.kmh closing (traffic.js's near-miss events, C-01 contract)
//   oncoming   metres held in the oncoming lane at speed, paid every
//              ONCOMING.every metres
//   slide      a handbrake slide (a big skid held at speed), paid when it ends
//   air        a flight of at least AIR.comboMin seconds (jumps.js pays the
//              jump itself; this is the tip on top, and the chain)
//
// Each event pays a tip of PAY[kind] x the chain's multiplier, with a toast
// request (« +12 $ FRÔLÉ x3 »). The chain lapses DECAY seconds after its last
// event; being in the oncoming lane keeps it alive. A chain held at x3 for
// FRIEND.hold seconds asks for one friend line, drawn only from the English
// lines of the main-cast friend riding along (FRIEND_LINES, checked against
// smoke_lang's speakerLines() by tools/smoke_style.mjs), never from a heckle,
// ambient or walk-on pool.
//
// AirScorer's chain is the model and its two numbers are reused by import:
// the ceiling is AIR.comboMax, the decay is half of AIR.comboWindow (a ramp
// chain has a ramp to find between links; a street chain does not).
//
// Pure logic: no DOM, no WebGL, no wallet. `tick()` returns what happened and
// the caller pays and shows it (reactive.js does, every drive tick).
import { AIR } from './jumps.js';

export const STYLE = {
  max: AIR.comboMax,              // x3
  decay: AIR.comboWindow * 0.5,   // 3 s without an event and the chain lapses
  // Events on the chain before each step up: 1-2 is x1, 3-5 is x2, 6+ is x3.
  steps: [3, 6],
};

// Dollars per event before the multiplier. Tuned so a clean alternateur or
// canot driven with some style pays 40 to 90 $ more than one driven without
// (tools/smoke_style.mjs, "pays by the table").
export const PAY = { near: 4, oncoming: 3, slide: 4, air: 3 };
export const LABEL = { near: 'FRÔLÉ', oncoming: 'CONTRESENS', slide: 'DÉRAPAGE', air: 'DANS LES AIRS' };

// What counts. NEAR.kmh is the closing speed, not the truck's.
export const NEAR = { gap: 1.5, kmh: 50 };
export const ONCOMING = {
  kmh: 50,          // your speed, at least
  // Where you are: left of the centreline of a two-way street (traffic.js's
  // road graph, read through laneSide()), by at least `roadMin` metres and no
  // further out than the far edge plus `roadEdge`.
  roadMin: 0.6,
  roadEdge: 1.0,
  query: 0.1,       // seconds between road lookups (it is the same street)
  grace: 2.0,       // seconds back in your own lane (a dodge) before the metres reset
  // What makes it count: an oncoming car down the road in front of you, or one
  // you passed less than `linger` seconds ago. An empty wrong side pays nothing.
  ahead: 90,        // metres down the road an oncoming car can be
  minAhead: 0,
  carLane: 3.5,     // metres either side of your line it can be
  cos: -0.7,        // its heading against yours: coming at you
  carKmh: 10,       // it is moving
  linger: 1.5,
  lane: 2.0,        // no road data (a bare test): IN the car's lane, centre to centre
  every: 40,        // metres per paid event
};
export const SLIDE = { skid: 0.35, release: 0.2, kmh: 25, min: 0.8, maxBonus: 2 };
export const FRIEND = { hold: 10, cooldown: 60 };

// The only lines a friend may say about a chain: each one is that friend's own,
// in English, already in the game (smoke_style checks every one against
// speakerLines(who, 'en')). New lines go to a *.proposed.json for Tom first.
export const FRIEND_LINES = {
  Sayyad: [
    'Again! Do that one faster!',
    'I’m gonna be sick. Again!',
  ],
};

const KMH = 3.6;
const HOLD = Object.freeze({ kind: 'hold' });
const KEYS = [];
// traffic.js buckets an edge by its midpoint, so the 3 x 3 cells around you can
// miss a long straight you are standing on. Edges longer than LONG_EDGE x the
// cell are kept in one list per road graph and always looked at.
const LONG_EDGE = 1.7;
const LONG = new WeakMap();
function longEdges(net, cell) {
  let list = LONG.get(net);
  if (!list) {
    list = [];
    const usable = new Set();
    for (const b of net.grid.values()) for (let i = 0; i < b.length; i++) usable.add(b[i]);
    for (const i of usable) if (net.edges[i].len > LONG_EDGE * cell) list.push(i);
    LONG.set(net, list);
  }
  return list;
}

/**
 * Which side of the street you are on, from traffic.js's road graph (a Traffic
 * or anything with its nodes, edges, grid and cellKey). Looks at the edges in
 * your cell and the eight around it, keeps the nearest one running your way or
 * against it (within about 37 degrees), and returns `{ lateral, off, oneway }`:
 * `lateral` metres right (+) or left (-) of its centreline as you travel,
 * `off` the lane offset traffic drives at (about a quarter of the road width),
 * `oneway` true on a one-way, `against` true when you are going against
 * that edge (on a one-way, that is the wrong way). Null off the graph. Read-only: never moves a car.
 */
export function laneSide(net, x, z, ux, uz, out = { lateral: 0, off: 0, oneway: false, against: false }) {
  if (!net || !net.grid || !net.edges || !net.nodes || typeof net.cellKey !== 'function') return null;
  const cell = net.cellSize || 100;
  let best = null, bestD = 12;   // further than 12 m from any centreline: not on a street
  const look = (bucket) => {
    for (let i = 0; i < bucket.length; i++) {
      const e = net.edges[bucket[i]];
      const align = ux * e.dx + uz * e.dz;
      if (align < 0.8 && align > -0.8) continue;
      const A = net.nodes[e.a];
      const rx = x - A.x, rz = z - A.z;
      const t = rx * e.dx + rz * e.dz;
      if (t < -2 || t > e.len + 2) continue;
      const right = rx * -e.dz + rz * e.dx;     // + is the edge's right, where its traffic drives
      const d = right < 0 ? -right : right;
      if (d < bestD) { bestD = d; best = e; out.lateral = align > 0 ? right : -right; out.against = align < 0; }
    }
  };
  KEYS.length = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const k = net.cellKey(x + dx * cell, z + dz * cell);
    if (KEYS.indexOf(k) >= 0) continue;   // cellKey clamps at the map edge
    KEYS.push(k);
    const bucket = net.grid.get(k);
    if (bucket) look(bucket);
  }
  look(longEdges(net, cell));
  if (!best) return null;
  out.off = best.off;
  out.oneway = !!best.oneway;
  return out;
}

function multFor(n) {
  let m = 1;
  for (const s of STYLE.steps) if (n >= s) m++;
  return Math.min(STYLE.max, m);
}

export class StyleChain {
  constructor() { this.reset(); }

  reset() {
    this.n = 0;            // events on the current chain
    this.mult = 1;
    this.t = 0;            // seconds left before it lapses
    this.x3T = 0;          // seconds held at the ceiling, this chain
    this.asked = false;    // this chain has had its friend line
    this.friendCool = 0;
    this.lineI = 0;
    this.best = 1;         // best multiplier this session
    this.total = 0;        // dollars of tips paid this session
    this.counts = { near: 0, oncoming: 0, slide: 0, air: 0 };
    this.oncomingM = 0;    // metres held in the oncoming lane, session
    this._onM = 0;         // ...toward the next paid ONCOMING.every
    this.onNow = false;
    this._dangerT = 0;     // seconds of an oncoming car still counting
    this._outT = 99;       // seconds since you were last on the wrong side
    this._laneT = 0; this._lane = null; this._laneOut = { lateral: 0, off: 0, oneway: false, against: false };
    this.slideT = 0; this.sliding = false; this._relT = 0;
    this.last = null;      // the last event paid, for the HUD
    this.lastAt = -1;
    this.clock = 0;
  }

  /**
   * One step. `events` is an array of { kind, ... } for this step: kind 'near'
   * ({ gap, speed } in m and m/s, traffic.js's shape), 'oncoming' ({ metres }),
   * 'slide' ({ seconds }), 'air' ({ air } seconds), or 'hold' (keeps the chain
   * alive, pays nothing; sense() sends it while you are in the oncoming lane).
   * `opts.paying` false still counts and shows the chain but pays 0 $ (free
   * roam, replays). `opts.friend` is who rides along, for the friend line.
   * Returns { pay, toasts: [{ text, ms }], friend: { who, line } | null }.
   */
  tick(dt, events, opts = {}) {
    this.clock += dt;
    // One result object for the session: read it before the next tick.
    const out = this._out || (this._out = { pay: 0, toasts: [], friend: null });
    out.pay = 0; out.toasts.length = 0; out.friend = null;
    let hold = false;
    if (events) for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e) continue;
      if (e.kind === 'hold') { hold = true; continue; }
      const base = this.value(e);
      if (!(base > 0)) continue;
      this.n++;
      this.mult = multFor(this.n);
      if (this.mult > this.best) this.best = this.mult;
      this.t = STYLE.decay;
      this.counts[e.kind]++;
      const tip = opts.paying === false ? 0 : base * this.mult;
      out.pay += tip;
      this.total += tip;
      this.last = { kind: e.kind, tip, mult: this.mult };
      this.lastAt = this.clock;
      out.toasts.push({ text: (tip > 0 ? `+${tip} $ ` : '') + `${LABEL[e.kind]} x${this.mult}`, ms: 1100, kind: e.kind });
    }
    if (hold && this.n > 0) this.t = STYLE.decay;
    if (this.n > 0 && !(out.toasts.length || hold)) {
      this.t -= dt;
      if (this.t <= 0) this.lapse();
    }
    // The friend line: x3 held FRIEND.hold seconds, once per chain, and not
    // twice a minute.
    if (this.friendCool > 0) this.friendCool -= dt;
    if (this.mult >= STYLE.max && this.n > 0) {
      this.x3T += dt;
      if (!this.asked && this.x3T >= FRIEND.hold && this.friendCool <= 0) {
        const line = friendLine(opts.friend, this.lineI);
        if (line) {
          out.friend = { who: opts.friend, line };
          this.lineI++;
          this.asked = true;
          this.friendCool = FRIEND.cooldown;
        }
      }
    }
    return out;
  }

  lapse() {
    this.n = 0; this.mult = 1; this.t = 0; this.x3T = 0; this.asked = false;
  }

  /** What one event is worth before the multiplier, or 0 if it does not count. */
  value(e) {
    switch (e.kind) {
      case 'near':
        if (!(e.gap <= NEAR.gap) || !(e.speed * KMH > NEAR.kmh)) return 0;
        return PAY.near;
      case 'oncoming': return PAY.oncoming;
      case 'slide': {
        if (!(e.seconds >= SLIDE.min)) return 0;
        return PAY.slide + Math.min(SLIDE.maxBonus, Math.floor(e.seconds - SLIDE.min));
      }
      case 'air': return e.air >= AIR.comboMin ? PAY.air : 0;
      default: return 0;
    }
  }

  /**
   * Turn one drive step's raw state into events. `v` is the player's Vehicle
   * after its update (x, z, vx, vz, yaw, skid, vLong, landed, lastAir),
   * `nearList` traffic.js's near misses for this step (`traffic.nearMisses`,
   * the per-frame list, so drainNearMisses() stays free for another reader),
   * `cars` the traffic cars, `handbrake` the lever if the caller knows it
   * (undefined: a big skid alone counts as the slide), `net` the road graph
   * (a Traffic: nodes, edges, grid, cellKey) for which side of the street you
   * are on; without it, being in an oncoming car's lane is the test.
   * The returned array is reused on the next call.
   */
  sense(dt, v, nearList, cars, handbrake, net) {
    const ev = this._ev || (this._ev = []);
    ev.length = 0;
    if (nearList) for (let i = 0; i < nearList.length; i++) ev.push({ kind: 'near', gap: nearList[i].gap, speed: nearList[i].speed });
    if (!v) return ev;
    const speed = Math.hypot(v.vx || 0, v.vz || 0);
    // ---- the oncoming lane
    this.onNow = false;
    const fastOn = speed * KMH >= ONCOMING.kmh && !v.inAir;
    let wrong = false, near = false;
    if (fastOn) {
      const ux = (v.vx || 0) / speed, uz = (v.vz || 0) / speed;
      // Which side of the street: the road graph, a few times a second.
      if (net && net.grid) {
        this._laneT -= dt;
        if (this._laneT <= 0 || !this._lane) { this._laneT = ONCOMING.query; this._lane = laneSide(net, v.x, v.z, ux, uz, this._laneOut); }
        const L = this._lane;
        if (L && (L.oneway ? L.against
          : L.lateral <= -ONCOMING.roadMin && L.lateral >= -(2 * L.off + ONCOMING.roadEdge))) wrong = true;
      }
      // Who is coming: an oncoming car down the road in front of you.
      if (cars) {
        const a2 = ONCOMING.ahead * ONCOMING.ahead;
        const band = net && net.grid ? ONCOMING.carLane : ONCOMING.lane;
        for (let i = 0; i < cars.length; i++) {
          const c = cars[i];
          const rx = c.x - v.x, rz = c.z - v.z;
          if (rx * rx + rz * rz > a2) continue;
          const along = rx * ux + rz * uz;
          if (along < ONCOMING.minAhead) continue;
          if (Math.abs(rx * uz - rz * ux) > band) continue;
          const cs = Math.hypot(c.vx || 0, c.vz || 0);
          if (cs * KMH < ONCOMING.carKmh) continue;
          if (((c.vx || 0) * ux + (c.vz || 0) * uz) / cs > ONCOMING.cos) continue;
          near = true;
          break;
        }
      }
      // A bare test with no road data: being in that car's lane is the wrong side.
      if (!(net && net.grid) && near) wrong = true;
    }
    if (near) this._dangerT = ONCOMING.linger; else if (this._dangerT > 0) this._dangerT -= dt;
    if (wrong) this._outT = 0; else this._outT += dt;
    if (wrong && this._dangerT > 0) {
      this.onNow = true;
      const m = speed * dt;
      this.oncomingM += m;
      this._onM += m;
      ev.push(HOLD);
      while (this._onM >= ONCOMING.every) { this._onM -= ONCOMING.every; ev.push({ kind: 'oncoming', metres: ONCOMING.every }); }
    } else if (this._outT >= ONCOMING.grace) this._onM = 0;
    // ---- the slide
    const fast = Math.abs(v.vLong || 0) * KMH >= SLIDE.kmh;
    const skid = v.skid || 0;
    if (!this.sliding) {
      if (skid >= SLIDE.skid && fast && handbrake !== false) { this.sliding = true; this.slideT = 0; this._relT = 0; }
    }
    if (this.sliding) {
      this.slideT += dt;
      if (skid < SLIDE.release || !fast) this._relT += dt; else this._relT = 0;
      if (this._relT >= 0.15) {
        this.sliding = false;
        const s = this.slideT - this._relT;
        if (s >= SLIDE.min) ev.push({ kind: 'slide', seconds: s });
      }
    }
    // ---- a landing
    if (v.landed > 0 && v.lastAir >= AIR.comboMin) ev.push({ kind: 'air', air: v.lastAir });
    return ev;
  }

  /**
   * Point the session counters at a stats object (call before a step's events,
   * so none is lost). A new G.stats object is a new game or a load: the live
   * chain and the session best do not carry over into it (code review B-03,
   * minor 6).
   */
  attach(s) {
    if (!s || this._statsObj === s) return;
    if (this._statsObj) this.reset();
    this._statsObj = s;
    const z = () => ({ styleTips: 0, styleNear: 0, styleSlides: 0, styleAir: 0, styleOncomingM: 0 });
    this._seen = this._seen || z(); this._now = this._now || z();
    const seen = this._seen;
    seen.styleTips = this.total; seen.styleNear = this.counts.near; seen.styleSlides = this.counts.slide;
    seen.styleAir = this.counts.air; seen.styleOncomingM = this.oncomingM;
  }

  /** Session counters for G.stats and the harness's metrics.json. */
  // Adds what happened since the last call, so a stats object that came out of
  // a save keeps its totals, and a new G.stats (a new game) starts from here.
  statsInto(s) {
    if (!s) return;
    this.attach(s);
    const seen = this._seen, now = this._now;
    now.styleTips = this.total; now.styleNear = this.counts.near; now.styleSlides = this.counts.slide;
    now.styleAir = this.counts.air; now.styleOncomingM = this.oncomingM;
    for (const k in now) {
      s[k] = (Number.isFinite(s[k]) ? s[k] : 0) + (now[k] - seen[k]);
      seen[k] = now[k];
    }
    s.styleBestChain = Math.max(Number.isFinite(s.styleBestChain) ? s.styleBestChain : 1, this.best);
  }

  /**
   * For hud.js: the chain right now. `fade` runs 1 -> 0 over the decay, so a
   * meter can drain; `x3T` is the seconds held at the top.
   */
  hudState() {
    return {
      on: this.n > 0,
      mult: this.mult,
      events: this.n,
      fade: this.n > 0 ? Math.max(0, Math.min(1, this.t / STYLE.decay)) : 0,
      x3T: this.x3T,
      oncoming: this.onNow,
      last: this.last,
      lastAgo: this.lastAt < 0 ? null : this.clock - this.lastAt,
      total: this.total,
      text: this.n > 0 ? `STYLE x${this.mult}` : '',
    };
  }
}

/** One of `who`'s chain lines, rotating; null for anyone without a pool. */
export function friendLine(who, i = 0) {
  const pool = who && FRIEND_LINES[who];
  if (!pool || !pool.length) return null;
  return pool[((i % pool.length) + pool.length) % pool.length];
}

/** Every line the chain can ever put in a friend's mouth, as [who, line]. */
export function allFriendLines() {
  const out = [];
  for (const [who, pool] of Object.entries(FRIEND_LINES)) for (const l of pool) out.push([who, l]);
  return out;
}

// The module-level instance the game uses (reactive.js ticks it).
export const style = new StyleChain();
