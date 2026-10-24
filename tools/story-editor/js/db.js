// tools/story-editor/js/db.js
// Zero-dependency IndexedDB wrapper for Aylmer Story Editor.
// Persists state, photo blobs, audio blobs, and File System Access handles.

const DB_NAME = 'AylmerStoryEditorDB';
const DB_VERSION = 1;

let dbInstance = null;

export function getDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('state')) {
        db.createObjectStore('state');
      }
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos');
      }
      if (!db.objectStoreNames.contains('audio')) {
        db.createObjectStore('audio');
      }
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => {
      console.error('IndexedDB open error:', e);
      reject(e.target.error);
    };
  });
}

export async function loadState() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly');
    const store = tx.objectStore('state');
    const req = store.get('current');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveState(state) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    const store = tx.objectStore('state');
    const doc = {
      ...state,
      updated: new Date().toISOString()
    };
    const req = store.put(doc, 'current');
    req.onsuccess = () => resolve(doc);
    req.onerror = () => reject(req.error);
  });
}

export async function savePhotoBlob(id, blob) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    const store = tx.objectStore('photos');
    const req = store.put(blob, id);
    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error);
  });
}

export async function getPhotoBlob(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly');
    const store = tx.objectStore('photos');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePhotoBlob(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    const store = tx.objectStore('photos');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudioBlob(id, blob) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', 'readwrite');
    const store = tx.objectStore('audio');
    const req = store.put(blob, id);
    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error);
  });
}

export async function getAudioBlob(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', 'readonly');
    const store = tx.objectStore('audio');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAudioBlob(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', 'readwrite');
    const store = tx.objectStore('audio');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function saveDirectoryHandle(handle) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    const store = tx.objectStore('handles');
    const req = store.put(handle, 'repoDir');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getDirectoryHandle() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readonly');
    const store = tx.objectStore('handles');
    const req = store.get('repoDir');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAll() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['state', 'photos', 'audio'], 'readwrite');
    tx.objectStore('state').clear();
    tx.objectStore('photos').clear();
    tx.objectStore('audio').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
