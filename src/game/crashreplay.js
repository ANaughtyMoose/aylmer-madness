// [w7-crashnight] C-12, small: a big crash replays for a few seconds from a
// chase camera. Built on ReplayRing (replay-ring.js): the ring records the
// player and the nearest cars every 1/60 s of sim time; when G.feel.crash goes
// up (main.js fireSlowmo('crash'), the crash show), the 1.2 s before and the
// 0.8 s after are frozen into a clip, and « V : revoir » is offered for 5 s.
// V plays it back with the world frozen, from behind the car, slowed through
// the hit.
//
// Named crashreplay.js because replay.js is the medal/record module (w7-replay).
//
// The existing crash show comes first: while crashShowQuiet(G) is true (the
// side camera, the hitstop, the second after) the offer is not shown, does not
// count down, and play() refuses. The replay never competes with the show.
//
// No DOM at import, no GL, no main.js: node-tested by tools/smoke_crashreplay.mjs.
// No allocation per tick or per playback frame after construction.
import { ReplayRing, RING } from './replay-ring.js';
import { crashShowQuiet } from './mission-notifications.js';

export const CRASH_REPLAY = {
  radius: 70,          // m, cars recorded around the player
  offerSec: 5.0,       // real seconds « V : revoir » stays up
  nearM: 250,          // offered only while the live car is this close to the impact
  slowFrom: -0.3,      // s around the hit (clip time) played slow...
  slowTo: 0.45,
  slowRate: 0.35,      // ...at this rate
  baseRate: 1.0,       // the run-up
  tailRate: 0.7,       // the bounce
  holdEnd: 0.5,        // real seconds held on the last frame before handing back
  dist: 7.5, height: 2.4, look: 1.0, yawEase: 3.0, floor: 1.1,
  prompt: 'V : revoir',
  label: 'REPRISE',
  hint: 'V : passer · Échap : retour',
};

const P_FIELDS = 7;   // player stash: x, y, z, yaw, pitch, roll, vLong
const C_FIELDS = 4;   // car stash: x, y, z, yaw
// W8-BUGS: the speech layers the replay hides (see speech()).
export const SPEECH_IDS = ['heckles', 'slangpanel'];

export class CrashReplay {
  constructor(cfg = CRASH_REPLAY) {
    this.cfg = cfg;
    this.ring = new ReplayRing();
    this.clip = new ReplayRing();
    const max = this.ring.maxCars;
    this.pool = [];
    for (let i = 0; i < max; i++) this.pool.push({ id: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0 });
    this.list = new Array(max).fill(null);
    this.list.length = 0;
    this.candD = new Float64Array(max);
    this.candO = new Array(max).fill(null);
    this.candI = new Int32Array(max);
    this.groundY = null;
    this.seen = null;              // last G.feel.crash we saw
    this.pending = null;           // { crashT, x, z } while the post-roll records
    this.have = null;              // frozen clip window
    this._have = { t0: 0, t1: 0, crashT: 0, x: 0, z: 0, kmh: 0, serial: 0 };
    this._pending = { crashT: 0, x: 0, z: 0, kmh: 0 };
    this.offerLeft = 0;
    this.offerMission = null;
    this.playing = false;
    this.head = 0; this.holdLeft = 0; this.crashed = false; this.first = false;
    this.yawS = 0;
    this.pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0 };
    this.tmp = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0 };
    this.cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 1.15 };
    this.saved = { camPos: new Float64Array(3), camYaw: 0, cineCam: null, focus: null };
    this.out = { playing: false, label: cfg.label, hint: cfg.hint, timecode: '', cut: false, crash: 0 };
    this.pStash = new Float64Array(P_FIELDS);
    this.pStashed = null;
    this.cStashObj = new Array(max).fill(null);
    this.cStash = new Float64Array(max * C_FIELDS);
    this.cStashN = 0;
    this.counts = { freezes: 0, offers: 0, plays: 0, refused: 0 };
    this.lastPlay = null;
    this.el = null;
  }

  /** Once from main.js after the world is built. */
  init({ groundY } = {}) { this.groundY = groundY || null; }

  reset() {
    this.ring.reset(); this.clip.reset();
    this.seen = null; this.pending = null; this.have = null;
    this.offerLeft = 0; this.offerMission = null; this.playing = false;
  }

  bytes() {
    const b = (r) => r.t.byteLength + r.n.byteLength + r.ids.byteLength + r.s.byteLength;
    return b(this.ring) + b(this.clip);
  }

  // ------------------------------------------------------------- recording

  // Every tick, after G.time has moved on. Samples on 1/60 s of sim time.
  record(G, dt) {
    if (this.playing) return;
    const feel = G.feel ? (G.feel.crash | 0) : 0;
    if (this.seen == null) this.seen = feel;
    const rose = feel > this.seen;
    this.seen = feel;
    const v = G.veh;
    if (!v || G.mode !== 'drive' || G.focus) return;
    const t = G.time;
    // A teleport (tow, mission start, try reset) during the post-roll: keep
    // what is there before the ring forgets it.
    if (this.pending && this.ring.len) {
      const last = this.ring.slot(this.ring.len - 1), o = last * this.ring.maxCars * 7;
      const dx = v.x - this.ring.s[o], dz = v.z - this.ring.s[o + 2];
      if (dx * dx + dz * dz > this.ring.teleport * this.ring.teleport) this.freeze(G);
    }
    if (rose && !this.pending) {
      const p = this._pending;
      p.crashT = t; p.x = v.x; p.z = v.z; p.kmh = Math.abs(v.vLong || 0) * 3.6;
      this.pending = p;
    }
    if (t >= this.ring.nextT) {
      this.gather(G);
      this.ring.record(t, this.list);
    }
    if (this.pending && t >= this.pending.crashT + RING.post) this.freeze(G);
  }

  // Player in slot 0, then the nearest traffic cars and rivals within radius.
  gather(G) {
    const v = G.veh, R2 = this.cfg.radius * this.cfg.radius, max = this.ring.maxCars - 1;
    const list = this.list, pool = this.pool;
    list.length = 0;
    const p = pool[0];
    p.id = 0; p.x = v.x; p.y = v.y || 0; p.z = v.z; p.yaw = v.yaw || 0;
    p.pitch = v.pitch || 0; p.roll = v.roll || 0; p.speed = v.vLong || 0;
    list.push(p);
    let n = 0;
    const consider = (o, id) => {
      const dx = o.x - v.x, dz = o.z - v.z, d = dx * dx + dz * dz;
      if (d > R2) return;
      // insertion into a sorted fixed-size candidate list (no allocation)
      let i = n < max ? n++ : max;
      if (i === max && d >= this.candD[max - 1]) return;
      if (i === max) i = max - 1;
      while (i > 0 && this.candD[i - 1] > d) {
        this.candD[i] = this.candD[i - 1]; this.candO[i] = this.candO[i - 1]; this.candI[i] = this.candI[i - 1]; i--;
      }
      this.candD[i] = d; this.candO[i] = o; this.candI[i] = id;
    };
    const cars = G.traffic && G.traffic.cars;
    if (cars) for (let i = 0; i < cars.length; i++) consider(cars[i], i + 1);
    const rv = G.rivals;
    if (rv) for (let i = 0; i < rv.length; i++) if (rv[i] && rv[i].veh) consider(rv[i].veh, 1000 + i);
    for (let k = 0; k < n; k++) {
      const o = this.candO[k], q = pool[k + 1];
      q.id = this.candI[k]; q.x = o.x; q.y = o.y || 0; q.z = o.z; q.yaw = o.yaw || 0;
      q.pitch = o.pitch || 0; q.roll = o.roll || 0; q.speed = o.speed || o.vLong || 0;
      list.push(q);
      this.candO[k] = null;
    }
  }

  // Copy the ring into the clip and open the offer.
  freeze(G) {
    const p = this.pending;
    this.pending = null;
    if (!p || !this.ring.len) return false;
    const a = this.ring, c = this.clip;
    c.t.set(a.t); c.n.set(a.n); c.ids.set(a.ids); c.s.set(a.s);
    c.head = a.head; c.len = a.len; c.nextT = a.nextT;
    const w = c.clip(p.crashT);
    if (!w || w.t1 - w.t0 < 0.5) return false;
    const h = this._have;
    h.t0 = w.t0; h.t1 = w.t1; h.crashT = p.crashT; h.x = p.x; h.z = p.z; h.kmh = p.kmh; h.serial++;
    this.have = h;
    this.offerLeft = this.cfg.offerSec;
    this.offerMission = (G && G.mission) || null;
    this.counts.freezes++;
    return true;
  }

  // ------------------------------------------------------------- the offer

  // Once a real drive frame. Returns the prompt text or null; counts down.
  offerText(G, realDt, blocked = false) {
    if (!this.have || this.offerLeft <= 0 || this.playing) return null;
    if (blocked || (G.mission || null) !== this.offerMission || G.mode !== 'drive' || !this.near(G)) {
      this.cancelOffer(); return null;
    }
    // The crash show owns the screen: hold the offer until it is quiet.
    if (crashShowQuiet(G)) return null;
    if (this.offerLeft === this.cfg.offerSec) this.counts.offers++;
    this.offerLeft -= Math.max(0, realDt || 0);
    if (this.offerLeft <= 0) { this.offerLeft = 0; return null; }
    return this.cfg.prompt;
  }
  near(G) {
    const v = G.veh, h = this.have;
    return !!(v && h && Math.hypot(v.x - h.x, v.z - h.z) <= this.cfg.nearM);
  }
  cancelOffer() { this.offerLeft = 0; }
  offered(G) {
    return !!(this.have && this.offerLeft > 0 && !this.playing && !(G && crashShowQuiet(G)));
  }
  lastClip() { return this.have; }

  // ------------------------------------------------------------- playback

  play(G, { blocked = false } = {}) {
    const h = this.have;
    if (!h || this.playing || blocked || this.offerLeft <= 0 || G.mode !== 'drive'
      || crashShowQuiet(G) || !this.near(G)) { this.counts.refused++; return false; }
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const s = this.saved;
    if (G.camPos) { s.camPos[0] = G.camPos[0]; s.camPos[1] = G.camPos[1]; s.camPos[2] = G.camPos[2]; }
    s.camYaw = G.camYaw; s.cineCam = G.cineCam || null; s.focus = G.focus || null;
    this.playing = true;
    this.offerLeft = 0;
    this.head = h.t0; this.holdLeft = this.cfg.holdEnd; this.crashed = false; this.first = true;
    if (this.clip.poseAt(h.t0, 0, this.pose)) this.yawS = this.pose.yaw;
    this.cam.fov = ((G.q && G.q.fov) || 1.15) + ((G.settings && G.settings.fov) || 0);
    G.cineCam = this.cam;
    this.counts.plays++;
    this.step(G, 0);
    this.lastPlay = { startMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0, dur: h.t1 - h.t0 };
    this.overlay(true);
    return true;
  }

  rateAt(rel) {
    const c = this.cfg;
    if (rel < c.slowFrom) return c.baseRate;
    if (rel < c.slowTo) return c.slowRate;
    return c.tailRate;
  }

  // Advances the playhead by real seconds; writes G.cineCam. Returns a shared
  // { playing, label, hint, timecode, cut, crash }.
  step(G, realDt) {
    const o = this.out, h = this.have;
    o.cut = this.first; this.first = false; o.crash = 0;
    if (!this.playing || !h) { o.playing = false; return o; }
    const was = this.head;
    if (this.head < h.t1) {
      this.head = Math.min(h.t1, this.head + Math.max(0, realDt) * this.rateAt(this.head - h.crashT));
    } else {
      this.holdLeft -= Math.max(0, realDt);
    }
    if (!this.crashed && was <= h.crashT && this.head >= h.crashT && (realDt > 0 || this.head > was)) {
      this.crashed = true; o.crash = Math.min(1, Math.max(0.6, h.kmh / 90));
    }
    if (this.holdLeft <= 0) { o.playing = false; return o; }
    const P = this.pose;
    if (!this.clip.poseAt(this.head, 0, P)) { o.playing = false; return o; }
    const k = 1 - Math.exp(-this.cfg.yawEase * Math.max(0, realDt));
    let dy = P.yaw - this.yawS;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yawS += dy * k;
    const c = this.cam, cfg = this.cfg;
    c.x = P.x - Math.sin(this.yawS) * cfg.dist;
    c.z = P.z - Math.cos(this.yawS) * cfg.dist;
    let y = P.y + cfg.height;
    if (this.groundY) y = Math.max(y, this.groundY(c.x, c.z) + cfg.floor);
    c.y = y;
    c.yaw = this.yawS + Math.PI;
    c.pitch = Math.atan2(P.y + cfg.look - y, cfg.dist);
    o.playing = true;
    const rel = this.head - h.t0;
    o.timecode = '0:00:0' + rel.toFixed(1);
    return o;
  }

  next(G) { if (this.playing) this.stop(G); }

  stop(G) {
    if (!this.playing) return;
    this.playing = false;
    const s = this.saved;
    if (G.camPos) { G.camPos[0] = s.camPos[0]; G.camPos[1] = s.camPos[1]; G.camPos[2] = s.camPos[2]; }
    G.camYaw = s.camYaw; G.cineCam = s.cineCam; G.focus = s.focus;
    s.cineCam = null; s.focus = null;
    this.overlay(false);
  }

  // Around render() only: the live player, traffic and rivals take their
  // recorded pose at the playhead, and get their own back straight after.
  applyPoses(G) {
    if (!this.playing || this.pStashed) return;
    const v = G.veh, P = this.pose, ps = this.pStash;
    if (v) {
      ps[0] = v.x; ps[1] = v.y; ps[2] = v.z; ps[3] = v.yaw; ps[4] = v.pitch; ps[5] = v.roll; ps[6] = v.vLong;
      v.x = P.x; v.y = P.y; v.z = P.z; v.yaw = P.yaw; v.pitch = P.pitch; v.roll = P.roll; v.vLong = P.speed;
      this.pStashed = v;
    }
    const c = this.clip, slot = this.slotAt(this.head);
    this.cStashN = 0;
    if (slot < 0) return;
    const base = slot * c.maxCars, n = c.n[slot], T = this.tmp, cs = this.cStash;
    for (let i = 1; i < n; i++) {
      const id = c.ids[base + i];
      const obj = id >= 1000 ? (G.rivals && G.rivals[id - 1000] && G.rivals[id - 1000].veh)
        : (G.traffic && G.traffic.cars[id - 1]);
      if (!obj || !c.poseAt(this.head, id, T)) continue;
      const j = this.cStashN++, o = j * C_FIELDS;
      this.cStashObj[j] = obj;
      cs[o] = obj.x; cs[o + 1] = obj.y; cs[o + 2] = obj.z; cs[o + 3] = obj.yaw;
      obj.x = T.x; obj.y = T.y; obj.z = T.z; obj.yaw = T.yaw;
    }
  }
  restorePoses() {
    const v = this.pStashed, ps = this.pStash;
    if (v) {
      v.x = ps[0]; v.y = ps[1]; v.z = ps[2]; v.yaw = ps[3]; v.pitch = ps[4]; v.roll = ps[5]; v.vLong = ps[6];
      this.pStashed = null;
    }
    const cs = this.cStash;
    for (let j = this.cStashN - 1; j >= 0; j--) {
      const obj = this.cStashObj[j], o = j * C_FIELDS;
      obj.x = cs[o]; obj.y = cs[o + 1]; obj.z = cs[o + 2]; obj.yaw = cs[o + 3];
      this.cStashObj[j] = null;
    }
    this.cStashN = 0;
  }
  // Ring slot of the sample at or before t in the clip, -1 if none.
  slotAt(t) {
    const c = this.clip;
    if (!c.len || t < c.firstT()) return -1;
    let lo = 0, hi = c.len - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.t[c.slot(m)] <= t) lo = m; else hi = m; }
    return c.slot(c.t[c.slot(hi)] <= t ? hi : lo);
  }

  stats() {
    const h = this.have;
    return {
      samples: this.ring.len, bytes: this.bytes(), playing: this.playing,
      offerLeft: this.offerLeft, ...this.counts, lastPlay: this.lastPlay,
      clip: h ? { serial: h.serial, dur: h.t1 - h.t0, crashAt: h.crashT - h.t0, kmh: Math.round(h.kmh) } : null,
    };
  }

  // Letterbox bars and a « ● REPRISE » tag, outside the HUD root. Built once.
  overlay(on) {
    if (typeof document === 'undefined' || !document.createElement || !document.body) return;
    if (!this.el) {
      if (!on) return;
      const el = document.createElement('div');
      el.id = 'crashreplay';
      el.innerHTML = '<div style="position:fixed;left:0;right:0;top:0;height:9vh;background:#000"></div>'
        + '<div style="position:fixed;left:0;right:0;bottom:0;height:9vh;background:#000"></div>'
        + `<div style="position:fixed;left:3vw;top:2.4vh;font:600 15px/1 ui-monospace,Menlo,monospace;color:#ffb000;text-shadow:0 1px 0 #000">● ${this.cfg.label}</div>`
        + `<div style="position:fixed;left:0;right:0;bottom:3vh;text-align:center;font:13px/1 ui-monospace,Menlo,monospace;color:#ffb000;text-shadow:0 1px 0 #000">${this.cfg.hint}</div>`;
      el.style.cssText = 'position:fixed;inset:0;z-index:60;pointer-events:none';
      document.body.appendChild(el);
      this.el = el;
    }
    this.el.style.display = on ? '' : 'none';
    this.speech(on);
  }

  // W8-BUGS: the speech bubbles (#heckles) and the slang panel are outside the
  // HUD root, so they stayed over the REPRISE letterbox (cloud run 27 Oct:
  // Margaret's line on the replay). Hidden for the replay and put back as they
  // were after; the story queue does not run during the replay, so no line is lost.
  speech(on) {
    if (typeof document === 'undefined' || !document.getElementById) return;
    if (!this._speechWas) this._speechWas = {};
    for (const id of SPEECH_IDS) {
      const el = document.getElementById(id);
      if (!el || !el.style) continue;
      if (on) {
        if (!(id in this._speechWas)) this._speechWas[id] = el.style.visibility || '';
        el.style.visibility = 'hidden';
      } else if (id in this._speechWas) {
        el.style.visibility = this._speechWas[id];
        delete this._speechWas[id];
      }
    }
  }
}

export const crashReplay = new CrashReplay();
