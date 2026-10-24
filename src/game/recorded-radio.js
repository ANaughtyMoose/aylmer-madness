import { STATIONS, RECORDINGS } from './radio-library.js';
import { loadRadio } from './store.js';

export const RADIO_KEY = 'aylmer.recorded-radio.v1';
// AUD-02: what the deck ducks to (x its level) under a voice and under your horn.
export const RECORDED_DUCK = { dialogue: 0.4, horn: 0.65 };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
// A file that failed is skipped, not banned: after this long it is tried again
// the next time its turn comes (a loopback-server hiccup is not a missing file).
export const FAILED_RETRY_MS = 120000;
const now = () => (globalThis.performance?.now?.() ?? Date.now());

// One owner for recorded playback. No generated station voices run beside it.
export class RecordedRadio {
  constructor(audio, { storage, mediaFactory = () => new globalThis.Audio(), fadeMs = 100 } = {}) {
    this.audio = audio;
    try { this.storage = storage === undefined ? window.localStorage : storage; } catch { this.storage = null; }
    let saved;
    try { saved = JSON.parse(this.storage?.getItem(RADIO_KEY) || 'null'); } catch { /* fresh state */ }
    if (saved?.version !== 1) saved = null;
    const legacy = loadRadio();
    this.wantOn = saved?.power ?? legacy.on;
    this.volume = clamp(saved?.volume ?? legacy.volume, 0, 1);
    // AUD-02: Énergie 104,1 is the first slot and the fresh-state default; with no
    // verified file it is not available() and ensureSelection() moves on to CHEZ.
    this.selectedStationId = saved?.selectedStationId || 'energie1041';
    this.positions = saved?.stations && typeof saved.stations === 'object' ? saved.stations : {};
    this.enabled = Object.fromEntries(STATIONS.map(s => [s.id, saved?.enabled?.[s.id] ?? s.enabled]));
    this.speechFriendly = !!saved?.speechFriendly;
    this.recordings = new Map(RECORDINGS.map(r => [r.id, { ...r }]));
    this.sources = new Map();
    // recordingId -> time it failed. See FAILED_RETRY_MS and forgive().
    this.failed = new Map();
    this.failures = 0;
    this.blocked = false;
    this.resumeGen = 0;
    this.listeners = new Set();
    this.mediaFactory = mediaFactory;
    this.fadeMs = fadeMs;
    this.suspended = true;
    this.hidden = false;
    this.on = false;
    this.request = 0;
    this.session = null;
    this.saveTime = 0;
    this.playbackError = '';
    this.storageError = '';
    this.notice = '';
    this.headlines = [];
    this.recorded = true;
    this.onChange = null;
    this.audio.setVolume?.({ radio: this.volume });
    // F2: when the browser suspends or wakes the context, the HUD hears about it.
    this.audio.onStateChange?.(() => this.emit());
  }
  get dial() { return STATIONS; }
  get station() { return STATIONS.findIndex(s => s.id === this.selectedStationId); }
  get def() { return STATIONS.find(s => s.id === this.selectedStationId) || STATIONS[0]; }
  get count() { return this.available().length; }
  tracks(id = this.selectedStationId) {
    const order = STATIONS.find(s => s.id === id)?.recordingIds || [];
    const rank = id => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
    this.expireFailures();
    return [...this.recordings.values()].filter(r => r.stationId === id && this.sources.has(r.id) && !this.failed.has(r.id))
      .sort((a,b) => rank(a.id) - rank(b.id));
  }
  available() { return STATIONS.filter(s => this.enabled[s.id] && this.tracks(s.id).length); }
  current() {
    if (!this.enabled[this.selectedStationId]) return undefined;
    const tracks = this.tracks();
    return tracks.find(r => r.id === this.positions[this.selectedStationId]?.recordingId) || tracks[0];
  }
  expireFailures(at = now()) {
    for (const [id, t] of this.failed) if (at - t >= FAILED_RETRY_MS) this.failed.delete(id);
  }
  // An explicit user action (power on) gives every failed file another go.
  // Still bounded: each file can fail at most once more before it is skipped.
  forgive() { this.failed.clear(); this.failures = 0; }
  // The session that belongs to the selected station. During the 100 ms fade
  // after a tune the outgoing one is still alive; it must not answer for the
  // new station (F12).
  live() { const s = this.session; return s && s.stationId === this.selectedStationId ? s : null; }
  get contextRunning() { return this.audio.running ?? (!this.audio.ctx?.state || this.audio.ctx.state === 'running'); }
  state() {
    const track = this.current(), s = this.live();
    // F2/F3: `on` means audible. A blocked play() or a context the browser
    // suspended is reported as an error, and the HUD line says so.
    const muted = this.on && !this.contextRunning;
    const error = this.playbackError || (muted ? 'Son suspendu par le navigateur. Clique ou appuie sur R.' : '');
    const title = track?.title || 'Importe les enregistrements dans la bibliothèque radio.';
    return { on: this.on && !muted, wantOn: this.wantOn, station: this.station, stationId: this.selectedStationId,
      stationName: this.def.name, track: this.wantOn && (this.blocked || muted) ? error : title, title,
      recordingId: track?.id, position: (s?.restored ? s.el.currentTime : undefined) ?? this.positions[this.selectedStationId]?.positionSeconds ?? 0,
      duration: s?.el.duration || track?.duration || 0, volume: this.volume, blocked: this.blocked || muted,
      available: this.count, suspended: this.suspended || this.hidden, error, notice: this.notice, slogan: '' };
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { const state = this.state(); this.onChange?.(state); for (const fn of this.listeners) fn(state); }
  remember() {
    const s = this.session;
    if (s?.restored && Number.isFinite(s.el.currentTime)) this.positions[s.stationId] = { recordingId: s.recordingId, positionSeconds: s.el.currentTime };
  }
  persist() {
    this.remember();
    try {
      this.storage?.setItem(RADIO_KEY, JSON.stringify({ version: 1, power: this.wantOn,
        selectedStationId: this.selectedStationId, stations: this.positions, volume: this.volume,
        enabled: this.enabled, speechFriendly: this.speechFriendly }));
    } catch { this.storageError = 'Réglages utilisables pour cette session; stockage indisponible.'; }
  }
  addSources(rows) {
    this.remember();
    for (const row of rows) {
      if (row.recording) this.recordings.set(row.id, { ...row.recording, id: row.id });
      this.sources.set(row.id, row.url);
      this.failed.delete(row.id);
    }
    this.ensureSelection();
    this.restart();
  }
  removeSource(id) {
    this.remember(); this.sources.delete(id); this.failed.delete(id);
    this.ensureSelection(); this.restart();
  }
  ensureSelection() {
    const list = this.available();
    if (!list.some(s => s.id === this.selectedStationId) && list.length) this.selectedStationId = list[0].id;
  }
  setEnabled(id, on) { this.remember(); this.enabled[id] = !!on; this.ensureSelection(); this.restart(); this.persist(); }
  // F3: after a blocked play() (autoplay policy) or a context the browser
  // suspended, the deck wants to be on but is silent. R then means "play",
  // not "off", so one press is enough.
  toggle() { return this.power(!this.wantOn || this.blocked || (this.on && !this.contextRunning)); }
  power(on) {
    this.wantOn = !!on;
    this.blocked = false;
    if (on) { this.audio.start(); this.audio.resume(); this.forgive(); }
    this.restart(); this.persist(); return this.state();
  }
  tune(id) {
    if (typeof id === 'number') id = STATIONS[id]?.id;
    if (!this.available().some(s => s.id === id)) return this.state();
    this.notice = '';
    this.remember(); this.selectedStationId = id; this.restart(); this.persist(); return this.state();
  }
  nextStation() {
    const list = this.available();
    if (list.length) this.tune(list[(list.findIndex(s => s.id === this.selectedStationId) + 1) % list.length].id);
    else { this.playbackError = 'Aucune station disponible. Importe les fichiers audio.'; this.emit(); }
    return this.state();
  }
  next() {
    const tracks = this.tracks(), current = this.current();
    if (!tracks.length) return;
    this.remember();
    const next = tracks[(tracks.findIndex(r => r.id === current?.id) + 1) % tracks.length];
    // Retire before changing the position so cleanup cannot overwrite it.
    this.stopNow();
    this.positions[this.selectedStationId] = { recordingId: next.id, positionSeconds: 0 };
    this.restart(); this.persist();
  }
  seek(seconds) {
    const s = this.session;
    if (!s || s.stationId !== this.selectedStationId) {
      const track = this.current(); if (!track) return false;
      this.positions[this.selectedStationId] = { recordingId: track.id, positionSeconds: clamp(seconds, 0, Math.max(0, (track.duration || 0) - 0.05)) };
      this.persist(); this.emit(); return true;
    }
    if (!Number.isFinite(s.el.duration)) return false;
    try { s.el.currentTime = clamp(seconds, 0, Math.max(0, s.el.duration - 0.05)); this.persist(); this.emit(); return true; }
    catch { return false; }
  }
  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    // Only the bus owns the user volume; per-file calibration is separate.
    this.audio.setVolume?.({ radio: this.volume }); this.persist(); return this.volume;
  }
  setSpeechFriendly(on) { this.speechFriendly = !!on; this.persist(); this.emit(); }
  suspend() { this.suspended = true; this.resumeGen++; this.persist(); this.stopNow(); this.emit(); }
  // F8: toMenu() calls pause(false) (which resumes) and then suspend() in the
  // same turn. Starting on a microtask means that pair never opens a file.
  resume() {
    this.suspended = false;
    const gen = ++this.resumeGen, req = this.request;
    // Skipped if anything else (power, tune) restarted the deck in between.
    queueMicrotask(() => { if (gen === this.resumeGen && req === this.request && !this.suspended) this.restart(); });
    this.emit();
  }
  setHidden(on) { this.hidden = !!on; this.persist(); if (on) this.stopNow(); else this.restart(); this.emit(); }
  setPos() {}
  setScene() {}
  async loadText() { return STATIONS.length; }
  async loadExtras() {} // Archive recordings keep their own DJs, ads and presentation.
  async loadTape() {} // Local library startup owns imports, never synthetic cassette labels.
  build() {
    if (this.out && this.el) return true;
    if (!this.audio.ok) return false;
    const ctx = this.audio.ctx;
    if (!this.out) {
      this.out = ctx.createGain(); this.out.gain.value = 0.8;
      this.out.connect(this.audio.radioBus);
    }
    // F1: one media element and one source node for the life of the radio.
    // A MediaElementAudioSourceNode lives as long as its context, so making
    // one per station change grew without bound. Tuning swaps `src` instead.
    this.el = this.mediaFactory();
    this.el.preload = 'metadata'; this.el.playbackRate = 1;
    this.node = ctx.createMediaElementSource(this.el);
    this.fade = ctx.createGain(); this.fade.gain.value = 0;
    this.node.connect(this.fade); this.fade.connect(this.out);
    return true;
  }
  retire(session, release = true) {
    if (!session) return;
    const el = session.el;
    el.onended = el.onerror = el.onloadedmetadata = null;
    el.pause();
    try { session.gain.gain.cancelScheduledValues(0); session.gain.gain.value = 0; } catch { /* mock */ }
    // Dropping the src releases the file (and its range request). Skipped when
    // the next track is about to be assigned to the same element anyway.
    if (release) { el.removeAttribute('src'); el.load(); }
  }
  stopNow() {
    ++this.request;
    clearTimeout(this.timer);
    this.remember();
    this.retire(this.session); this.session = null; this.on = false;
  }
  restart() {
    this.remember();
    const token = ++this.request;
    clearTimeout(this.timer);
    this.playbackError = ''; this.blocked = false;
    const old = this.session;
    if (old) {
      const t = this.audio.ctx.currentTime;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + this.fadeMs / 1000);
    }
    this.on = false;
    const begin = () => {
      if (token !== this.request) return;
      // Save the outgoing source under its own station before disposal.
      const go = this.wantOn && !this.suspended && !this.hidden && this.build();
      this.remember(); this.retire(old, !go); this.session = null;
      if (!go) { this.emit(); return; }
      this.ensureSelection();
      const track = this.current();
      if (!track) { this.retire({ el: this.el, gain: this.fade }); this.playbackError = 'Aucune station disponible. Importe les fichiers audio.'; this.emit(); return; }
      const el = this.el, ctx = this.audio.ctx, node = this.node, gain = this.fade;
      el.playbackRate = 1;
      const session = { el, node, gain, stationId: this.selectedStationId, recordingId: track.id };
      this.session = session;
      const active = () => token === this.request && this.session === session;
      const fail = () => {
        if (!active()) return;
        const station = session.stationId;
        this.failed.set(track.id, now());
        this.failures++;
        this.stopNow();
        this.notice = this.failures > 1
          ? `${this.failures} fichiers ignorés (indisponibles). Dernier : ${track.title}`
          : `Fichier ignoré (indisponible) : ${track.title}`;
        // F7: a station with nothing left moves on along the dial, not back to
        // the first preset. Every failure is excluded, so recovery is finite.
        if (!this.tracks(station).length) this.selectedStationId = this.after(station) || this.selectedStationId;
        this.emit();
        if (this.available().length) { this.ensureSelection(); this.restart(); }
      };
      el.onerror = fail;
      el.onended = () => { if (active() && this.wantOn && !this.suspended && !this.hidden) this.next(); };
      el.onloadedmetadata = () => {
        if (!active()) return;
        const pos = this.positions[session.stationId];
        const seconds = pos?.recordingId === track.id ? Number(pos.positionSeconds) || 0 : 0;
        try { el.currentTime = clamp(seconds, 0, Math.max(0, (el.duration || track.duration || 0) - 0.05)); }
        catch { this.playbackError = 'Position non restaurée; lecture au début du fichier.'; }
        session.restored = true;
        Promise.resolve(el.play()).then(() => {
          if (!active()) { el.pause(); return; }
          this.on = true; this.blocked = false;
          const at = ctx.currentTime;
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(10 ** (clamp(track.gainDb, -30, 12) / 20), at + this.fadeMs / 1000);
          this.persist(); this.emit();
        }).catch(e => {
          if (!active()) return;
          this.on = false;
          if (e?.name === 'NotAllowedError') { this.blocked = true; this.playbackError = 'Son bloqué par le navigateur. Appuie sur R ou clique Allumer.'; this.emit(); }
          else fail();
        });
      };
      el.src = this.sources.get(track.id); el.load(); this.emit();
    };
    if (old && this.fadeMs) this.timer = setTimeout(begin, this.fadeMs); else begin();
    this.emit();
  }
  // AUD-02: no duck under engine load any more (the radio sits over the engine,
  // not under it: audio.md finding 3). Horn and dialogue still duck it.
  update(dt, load = 0, horn = false, dialogue = false) {
    if (this.out) {
      const attenuation = dialogue ? RECORDED_DUCK.dialogue : horn ? RECORDED_DUCK.horn : 1;
      this.out.gain.setTargetAtTime(this.audio.enabled && this.on ? attenuation * (this.speechFriendly ? 1 : 0.8) : 0, this.audio.ctx.currentTime, horn ? 0.05 : 0.18);
    }
    this.saveTime += dt;
    if (this.saveTime >= 5) { this.saveTime = 0; this.persist(); }
  }
  // The next enabled station with something playable, in dial order.
  after(id) {
    const i = STATIONS.findIndex(s => s.id === id);
    for (let k = 1; k <= STATIONS.length; k++) {
      const s = STATIONS[(i + k) % STATIONS.length];
      if (this.enabled[s.id] && this.tracks(s.id).length) return s.id;
    }
    return null;
  }
  dispose() {
    this.persist(); this.stopNow();
    if (this.el) { this.el.onended = this.el.onerror = this.el.onloadedmetadata = null; this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
    this.node?.disconnect(); this.fade?.disconnect(); this.out?.disconnect();
    this.el = this.node = this.fade = this.out = null;
    this.listeners.clear();
  }
}
