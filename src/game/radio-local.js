// AUD-02: the private radio library, when tools/serve.mjs offers one.
//
// On a loopback host: one fetch of /__local_radio/library.json with a 1.5 s
// abort, quiet on any failure. Returns its rows: { id, url, recording? }. No
// file name is in them; serve.mjs keeps names and paths to itself.
//
// Tom 27 Oct: the live link plays the real recordings too. They sit in a
// Cloudflare R2 bucket (never in this repo, so they can be taken down without
// rewriting history). REMOTE_LIBRARY is that bucket's library.json: ids and
// URLs only, same rows as serve.mjs. Empty string = synth dial on the web.
export const REMOTE_LIBRARY = '';

export const isLoopback = () => typeof location !== 'undefined'
  && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

const sameOrigin = (url, base) => {
  try { return new URL(url, base).origin === new URL(base).origin; } catch { return false; }
};

export async function fetchLocalLibrary({ timeoutMs = 1500, remote = REMOTE_LIBRARY } = {}) {
  if (typeof fetch !== 'function') return [];
  const local = isLoopback();
  const src = local ? '/__local_radio/library.json' : remote;
  if (!src) return [];
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), local ? timeoutMs : timeoutMs * 2) : null;
  try {
    const res = await fetch(src, { cache: 'no-store', signal: ac ? ac.signal : undefined });
    if (!res.ok) return [];
    const j = await res.json();
    const rows = Array.isArray(j && j.recordings) ? j.recordings : [];
    return rows.filter((r) => r && typeof r.id === 'string' && typeof r.url === 'string')
      // A remote row may only point back into its own bucket.
      .filter((r) => local || sameOrigin(r.url, src))
      .map((r) => {
        const url = local ? r.url : new URL(r.url, src).href;
        return r.recording && typeof r.recording === 'object'
          ? { id: r.id, url, recording: r.recording } : { id: r.id, url };
      });
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}
