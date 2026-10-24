// AUD-02: the private radio library, when tools/serve.mjs offers one.
//
// Only on a loopback host (the public build never asks), one fetch with a
// 1.5 s abort, quiet on any failure. Returns the rows of
// /__local_radio/library.json: { id, url, recording? }. No file name is in
// them; serve.mjs keeps names and paths to itself.
export const isLoopback = () => typeof location !== 'undefined'
  && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export async function fetchLocalLibrary({ timeoutMs = 1500 } = {}) {
  if (!isLoopback() || typeof fetch !== 'function') return [];
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
  try {
    const res = await fetch('/__local_radio/library.json', { cache: 'no-store', signal: ac ? ac.signal : undefined });
    if (!res.ok) return [];
    const j = await res.json();
    const rows = Array.isArray(j && j.recordings) ? j.recordings : [];
    return rows.filter((r) => r && typeof r.id === 'string' && typeof r.url === 'string')
      .map((r) => (r.recording && typeof r.recording === 'object'
        ? { id: r.id, url: r.url, recording: r.recording } : { id: r.id, url: r.url }));
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}
