// Which localStorage the game is allowed to write, decided once, before any
// module reads a key.
//
// The dev harnesses in tools/*.html iframe the real game on the same origin as
// the player's own summer. Without this they started a new game, finished a job
// and autosaved over the player's real `<character>.auto` (review SR-01). So:
//
//   index.html?review=<name>      every key lives under `aylmer.review.<name>.`
//   index.html?audioReview=1      the same, under `aylmer.review.audio.`
//   index.html framed by a page   the same, under `aylmer.review.harness.`, even
//     under /tools/ on this origin  if the harness forgot the flag
//   index.html                    raw keys: the player's real saves
//
//   prototype.html                `aylmer2004.prototype.` (boot.js), or
//   prototype.html?audioReview=1  `aylmer2004.audio-review.`, or
//   prototype.html?review=<name>  `aylmer2004.review.<name>.`
//
// The view replaces `window.localStorage` itself, so every module that reads
// `globalThis.localStorage` (hangout, flavour, heckle, racejobs, modes, radio…)
// is isolated too, not only save.js. index.html loads storage-boot.js as its own
// module script ahead of main.js for exactly that reason: hangout.js and
// heckle.js read their keys while the module graph is still evaluating.
//
// When the browser blocks site data the localStorage getter itself throws.
// `memoryFallback` (prototype.html) swaps in a Map for the session so the game
// still boots; index.html keeps its own "no storage" behaviour and save.js
// reports it (storageHealth / onSaveFailure).

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

/** A review namespace name out of a query string, or null. `?review=1` → 'default'. */
export function reviewName(search = '') {
  let q;
  try { q = new URLSearchParams(search); } catch { return null; }
  if (q.has('review')) {
    const v = (q.get('review') || '').trim();
    if (!v || v === '1' || v === 'true') return 'default';
    return NAME_RE.test(v) ? v.toLowerCase() : 'default';
  }
  if (q.has('audioReview')) return 'audio';
  return null;
}

/** True when this window is iframed by a same-origin page under /tools/. */
export function framedByHarness(win = globalThis) {
  try {
    if (!win || !win.top || win.top === win) return false;
    const p = win.top.location.pathname || '';   // throws cross-origin: not a harness
    return /\/tools\//.test(p);
  } catch { return false; }
}

/** A Storage-shaped view of `real` in which every key is prefixed. */
export function namespacedStorage(real, prefix) {
  const mine = () => {
    const out = [];
    try {
      for (let i = 0; i < real.length; i++) {
        const k = real.key(i);
        if (k != null && k.startsWith(prefix)) out.push(k);
      }
    } catch { /* blocked mid-session */ }
    return out;
  };
  return {
    __aylmerNamespace: prefix,
    getItem: (k) => real.getItem(prefix + k),
    setItem: (k, v) => real.setItem(prefix + k, String(v)),
    removeItem: (k) => real.removeItem(prefix + k),
    key: (i) => mine()[i]?.slice(prefix.length) ?? null,
    get length() { return mine().length; },
    clear() { for (const k of mine()) real.removeItem(k); },
  };
}

/** A session-only Storage for a browser that refuses site data. */
export function memoryStorage() {
  const m = new Map();
  return {
    __aylmerNamespace: 'memory:',
    __aylmerMemory: true,
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    clear() { m.clear(); },
  };
}

/**
 * Put the right storage in place. Idempotent: a second call (or a page whose
 * boot script already installed one) changes nothing and returns the first
 * answer. Returns { prefix, review, blocked, memory }.
 *
 *   base         prefix with no review flag ('' = the raw player keys)
 *   reviewBase   prefix root for ?review=<name>
 *   audioPrefix  prefix for ?audioReview=1 (kept for the prototype's old keys)
 *   memoryFallback  swap in a Map when localStorage is blocked
 */
export function installStorageNamespace(opts = {}) {
  const g = globalThis;
  if (g.AYLMER_STORAGE && g.AYLMER_STORAGE.installed) return g.AYLMER_STORAGE;
  // Not a page (a node test): nothing to decide, and touching node's own
  // experimental localStorage getter only prints a warning.
  if (typeof g.location === 'undefined' || !g.location) return storageInfo();
  const { base = '', reviewBase = 'aylmer.review.', audioPrefix = null, memoryFallback = false } = opts;
  const search = (() => { try { return g.location ? g.location.search : ''; } catch { return ''; } })();
  let review = reviewName(search);
  if (!review && framedByHarness(g)) review = 'harness';
  const prefix = review
    ? (review === 'audio' && audioPrefix ? audioPrefix : `${reviewBase}${review}.`)
    : base;

  let real = null, blocked = false;
  try { real = g.localStorage || null; } catch { blocked = true; }
  // The getter can succeed and the first write still throw (Safari private
  // mode of old, a zero quota). That is not "blocked": save.js reports it.
  const info = { installed: true, prefix, review, blocked, memory: false };

  const define = (value) => {
    try { Object.defineProperty(g, 'localStorage', { value, configurable: true, writable: true }); return true; }
    catch { return false; }
  };
  if (blocked) {
    if (memoryFallback && define(memoryStorage())) info.memory = true;
  } else if (real && real.__aylmerNamespace) {
    // Somebody (boot.js) got here first; keep theirs.
    info.prefix = real.__aylmerNamespace;
  } else if (prefix && real) {
    define(namespacedStorage(real, prefix));
  }
  g.AYLMER_STORAGE = info;
  return info;
}

/** What was installed, or a best guess for a page that never called install. */
export function storageInfo() {
  const g = globalThis;
  if (g.AYLMER_STORAGE) return g.AYLMER_STORAGE;
  let review = null;
  try { review = g.location ? reviewName(g.location.search) : null; } catch { review = null; }
  return { installed: false, prefix: '', review, blocked: false, memory: false };
}
