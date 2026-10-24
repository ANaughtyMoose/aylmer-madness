// Automation must never wipe a real player's saves (review SR-02).
//
// The headless tools attach to whatever Chrome owns :9222 and used to call
// Storage.clearDataForOrigin {storageTypes:'all'} on the page origin: every
// save slot and the imported MP3 library of anyone who plays on that origin.
// Now:
//
//   - by default a tool loads the game under its own review namespace
//     (index.html?review=<tool>, see src/game/storage-ns.js) and "fresh" means
//     clearing THAT namespace only, before the page's scripts run;
//   - clearing the whole origin needs --wipe-origin, and is refused unless the
//     port is a dedicated test port (8137-8199, or AYLMER_TEST_PORTS) or the
//     command also says --i-mean-it.
//
// 8123 (serve.sh / README) and 8136 (the MacBook handoff) are play ports.

export const PLAY_PORTS = new Set(['8123', '8136']);
export const TEST_PORT_MIN = 8137, TEST_PORT_MAX = 8199;

export function portOf(url) {
  const u = new URL(url);
  return u.port || (u.protocol === 'https:' ? '443' : '80');
}

export function isTestPort(url, env = process.env) {
  const port = portOf(url);
  const extra = String(env.AYLMER_TEST_PORTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (extra.includes(port)) return true;
  if (PLAY_PORTS.has(port)) return false;
  const n = Number(port);
  return n >= TEST_PORT_MIN && n <= TEST_PORT_MAX;
}

/** The url with ?review=<name> added (kept if it already has one). */
export function reviewUrl(url, name) {
  const u = new URL(url);
  if (!u.searchParams.has('review') && !u.searchParams.has('audioReview')) u.searchParams.set('review', name);
  return u.href;
}

/** The namespace the page will use, mirroring storage-ns.js. */
export function reviewNameOf(url) {
  const q = new URL(url).searchParams;
  if (q.has('review')) {
    const v = (q.get('review') || '').trim();
    if (!v || v === '1' || v === 'true') return 'default';
    return /^[a-z0-9][a-z0-9_-]{0,31}$/i.test(v) ? v.toLowerCase() : 'default';
  }
  if (q.has('audioReview')) return 'audio';
  return null;
}

/**
 * JS to run before the page's own scripts (Page.addScriptToEvaluateOnNewDocument)
 * that empties this review namespace and nothing else: its localStorage keys on
 * both index.html and prototype.html, and its radio IndexedDB copy.
 */
export function clearNamespaceScript(name) {
  const safe = JSON.stringify(String(name));
  return `(() => { try {
    const n = ${safe};
    const pre = n === 'audio' ? ['aylmer.review.audio.', 'aylmer2004.audio-review.'] : ['aylmer.review.' + n + '.', 'aylmer2004.review.' + n + '.'];
    const flag = '__aylmer_ns_cleared_' + n;
    if (sessionStorage.getItem(flag)) return;       // once per tab, not on every reload
    sessionStorage.setItem(flag, '1');
    const ls = window.localStorage, doomed = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (pre.some((p) => k.startsWith(p))) doomed.push(k); }
    for (const k of doomed) ls.removeItem(k);
    const db = 'aylmer2004-local-radio-v1-review' + (n === 'audio' ? '' : '-' + n);
    try { indexedDB.deleteDatabase(db); } catch {}
  } catch {} })();`;
}

/**
 * Decide what a tool may do. Returns { url, name, wipeOrigin }. Throws with a
 * readable message when a whole-origin wipe is asked for on a play port.
 *   argv    process.argv
 *   tool    the default review namespace name (e.g. 'measure-memory')
 */
export function planStorage(url, argv, tool, env = process.env) {
  const wantWipe = argv.includes('--wipe-origin');
  const iMeanIt = argv.includes('--i-mean-it');
  const shared = argv.includes('--player-storage');     // opt out of the namespace, read-only
  if (wantWipe && !isTestPort(url, env) && !iMeanIt) {
    throw new Error(`refusing to clear all site data for ${new URL(url).origin}: port ${portOf(url)} is not a dedicated test port `
      + `(${TEST_PORT_MIN}-${TEST_PORT_MAX}, or AYLMER_TEST_PORTS). That origin may hold a player's saves and radio library. `
      + 'Serve the game on a test port, or add --i-mean-it.');
  }
  const out = shared || wantWipe ? url : reviewUrl(url, tool);
  return { url: out, name: reviewNameOf(out), wipeOrigin: wantWipe };
}

/**
 * Do what the plan allows, through a CDP `send(method, params)`. `fresh`
 * means "start from no saves": the review namespace is emptied (before any
 * page script runs), or, only with an allowed --wipe-origin, the origin is.
 */
export async function prepareStorage(send, plan, fresh = true) {
  if (plan.wipeOrigin) {
    await send('Storage.clearDataForOrigin', { origin: new URL(plan.url).origin, storageTypes: 'all' });
    return 'origin';
  }
  if (fresh && plan.name) {
    try { await send('Page.enable'); } catch { /* already on */ }
    await send('Page.addScriptToEvaluateOnNewDocument', { source: clearNamespaceScript(plan.name) });
    return 'namespace';
  }
  return 'none';
}
