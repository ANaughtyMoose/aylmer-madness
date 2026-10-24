// The old files/playlist entry is retained during migration. No media upload.
//
// Which database: the player's own library, or an isolated `-review` copy for
// ?audioReview=1 (and `-review-<name>` for ?review=<name>, see storage-ns.js),
// so a test page can never touch the MP3s somebody actually imported. Decided
// per call, not at import, so it follows whatever the page installed.
import { reviewName, storageInfo } from './storage-ns.js';

const BASE = 'aylmer2004-local-radio-v1';
const RECORD = 'station-library-v1';
export function databaseName() {
  let review = storageInfo().review || null;
  if (!review) { try { review = typeof location !== 'undefined' ? reviewName(location.search) : null; } catch { review = null; } }
  if (!review) return BASE;
  return review === 'audio' ? `${BASE}-review` : `${BASE}-review-${review}`;
}
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(databaseName(), 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function access(mode, action) {
  const db = await openDB();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode); let result;
    const request = action(tx.objectStore('files')); if (request) request.onsuccess = () => result = request.result;
    tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}

// SR-12: the import UI is live before the first read of the library has come
// back. A write in that window used to replace the whole record with just the
// new file, and the read then dropped the new file from memory. Now:
//   - until this page has read the library once, a write is a MERGE (stored
//     rows, then the new ones by id) inside one readwrite transaction;
//   - a read that saw such a write land while it was in flight reads again,
//     so the page's list includes what was imported meanwhile.
// After the first read the page's own list is the truth, so « Retirer » still
// removes.
let readOnce = false;
let writeGen = 0;
let pending = Promise.resolve();
export function mergeRows(stored, rows) {
  const out = Array.isArray(stored) ? stored.slice() : [];
  for (const r of rows || []) {
    const i = out.findIndex((o) => o && r && o.id === r.id);
    if (i < 0) out.push(r); else out[i] = r;
  }
  return out;
}

async function readOnceRaw() {
  const current = await access('readonly', s => s.get(RECORD));
  if (current) return current;
  const old = await access('readonly', s => s.get('playlist'));
  return (old || []).map((file, i) => ({ id: `personal-${file.name}-${file.size}-${file.lastModified || i}`, file, stationId: 'personal-cassette' }));
}

export async function readLibrary() {
  let rows;
  for (let tries = 0; tries < 4; tries++) {
    const gen = writeGen;
    rows = await readOnceRaw();
    await pending.catch(() => {});
    if (gen === writeGen) break;           // nothing was written meanwhile
  }
  readOnce = true;
  return rows;
}

export function writeLibrary(rows) {
  if (readOnce) return access('readwrite', s => s.put(rows, RECORD));
  writeGen++;
  // get + put inside ONE readwrite transaction, so nothing can land between.
  const p = access('readwrite', (s) => {
    const get = s.get(RECORD);
    get.onsuccess = () => { s.put(mergeRows(get.result, rows), RECORD); };
    return null;
  });
  pending = pending.then(() => p, () => p);
  return p;
}

/** For tests: forget that this page has read the library. */
export function _resetReadState() { readOnce = false; writeGen = 0; pending = Promise.resolve(); }
