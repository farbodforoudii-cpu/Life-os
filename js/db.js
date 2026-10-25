// Small IndexedDB wrapper. Every record lives in one `items` store, told apart by `kind`.
const DB_NAME = 'life-os';
const VERSION = 2;

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = ev => {
      const db = req.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      // v1 kept entries in their own store; move them over.
      if (ev.oldVersion === 1 && db.objectStoreNames.contains('entries')) {
        const tx = req.transaction;
        const items = tx.objectStore('items');
        tx.objectStore('entries').openCursor().onsuccess = e => {
          const c = e.target.result;
          if (!c) { db.deleteObjectStore('entries'); return; }
          items.put({ kind: 'entry', ...c.value });
          c.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function run(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}

export const db = {
  allItems: () => run('items', 'readonly', s => s.getAll()),
  putItems: list => run('items', 'readwrite', s => { for (const it of list) s.put(it); }),
  get: key => run('kv', 'readonly', s => s.get(key)),
  set: (key, val) => run('kv', 'readwrite', s => { s.put(val, key); }),
};

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* not supported */ }
  return false;
}
