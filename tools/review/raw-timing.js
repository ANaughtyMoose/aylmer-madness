// Inject before navigation. Independent of the game and the learner bot.
// Every positive rAF gap contributes to streaming totals, including setup,
// hidden loading cards and gaps above five seconds. Only detail storage is capped.
(() => {
  if (window.__rawTiming) return;
  const windows = new Map();
  let previous = performance.now(), serial = 0;
  const DETAIL_LIMIT = 64;
  const make = (id) => ({ id, beginMs: performance.now(), n: 0, totalMs: 0,
    minMs: null, maxMs: 0, over33Count: 0, over250Count: 0, over5000Count: 0,
    crossingBeginCount: 0, worst: [], marks: [], droppedMarks: 0 });
  function begin(label) {
    const id = `${++serial}:${label}`;
    windows.set(id, make(id)); return id;
  }
  function mark(label) {
    const atMs = performance.now();
    for (const s of windows.values()) {
      if (s.marks.length < 256) s.marks.push({ label, atMs });
      else s.droppedMarks++;
    }
  }
  function frame(atMs) {
    const fromMs = previous, dt = atMs - previous;
    previous = atMs;
    if (Number.isFinite(dt) && dt > 0) {
      for (const s of windows.values()) {
        s.n++; s.totalMs += dt; s.minMs = s.minMs == null ? dt : Math.min(s.minMs, dt);
        s.maxMs = Math.max(s.maxMs, dt);
        if (dt > 33.4) s.over33Count++;
        if (dt > 250) s.over250Count++;
        if (dt >= 5000) s.over5000Count++;
        if (fromMs < s.beginMs) s.crossingBeginCount++;
        if (s.worst.length < DETAIL_LIMIT || dt > s.worst[s.worst.length - 1].dtMs) {
          s.worst.push({ fromMs, toMs: atMs, dtMs: dt });
          s.worst.sort((a, b) => b.dtMs - a.dtMs);
          if (s.worst.length > DETAIL_LIMIT) s.worst.pop();
        }
      }
    }
    requestAnimationFrame(frame);
  }
  function snapshot(id) {
    const s = windows.get(id); if (!s) return null;
    const endMs = performance.now();
    return { ...s, endMs, wallMs: endMs - s.beginMs,
      fpsMean: s.n ? 1000 * s.n / s.totalMs : null,
      over33Fraction: s.n ? s.over33Count / s.n : null,
      worst: s.worst.map((x) => ({ ...x })), marks: s.marks.map((x) => ({ ...x })),
      detailLimit: DETAIL_LIMIT, discardedPositiveGaps: 0,
      boundary: 'Full rAF gap crossing begin included; end waits for the next sampled frame.' };
  }
  function finish(id) { const result = snapshot(id); windows.delete(id); return result; }
  // Resolve after our next sampler callback so work immediately before end is
  // included even if it blocked the main thread until this CDP evaluation.
  function end(id) { return new Promise((resolve) => requestAnimationFrame(() => resolve(finish(id)))); }
  const documentId = begin('document');
  window.__rawTiming = { version: 1, begin, mark, snapshot, end, documentId };
  requestAnimationFrame(frame);
})();
