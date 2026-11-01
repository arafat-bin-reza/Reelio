// IndexedDB wrapper. All video records (including uploaded Blobs) live in one object store.

const DB_NAME = 'videoPlayerDB';
const DB_VERSION = 1;
const STORE = 'videos';

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('addedAt', 'addedAt', { unique: false });
        store.createIndex('source', 'source', { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // If another tab upgrades the DB, close ours so it can proceed.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another open tab.'));
  });

  return dbPromise;
}

function run(mode, operation) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let request;
        try {
          request = operation(store);
        } catch (err) {
          reject(err);
          return;
        }
        tx.oncomplete = () => resolve(request ? request.result : undefined);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
      })
  );
}

export const addVideo = (record) => run('readwrite', (store) => store.add(record));
export const putVideo = (record) => run('readwrite', (store) => store.put(record));
export const getVideo = (id) => run('readonly', (store) => store.get(id));
export const getAllVideos = () => run('readonly', (store) => store.getAll());
export const deleteVideo = (id) => run('readwrite', (store) => store.delete(id));

export async function updateVideo(id, patch) {
  const existing = await getVideo(id);
  if (!existing) throw new Error(`Video ${id} not found.`);
  const updated = { ...existing, ...patch };
  await putVideo(updated);
  return updated;
}

export function isQuotaError(err) {
  return !!err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''));
}
