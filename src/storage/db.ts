/* IndexedDB storage layer — local-first, no backend. Single source of truth lives
   in the journal; everything else is derived. */

export const STORES = [
  'settings',       // { key, value }
  'accounts',       // ChartOfAccount { id }
  'journalEntries', // JournalEntry { id } — lines embedded
  'customers',      // { id }
  'vendors',        // { id }
  'inventoryItems', // { id }
  'fixedAssets',    // { id }
  'auditLog',       // { id }
  'periods',        // { id } fiscal periods + lock state
  'docCounters',    // { key } document numbering
] as const;

export type StoreName = (typeof STORES)[number];

const DB_NAME = 'accountflow-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (db.objectStoreNames.contains(name)) continue;
        if (name === 'settings' || name === 'docCounters') {
          db.createObjectStore(name, { keyPath: 'key' });
        } else {
          const store = db.createObjectStore(name, { keyPath: 'id' });
          if (name === 'journalEntries') {
            store.createIndex('date', 'date', { unique: false });
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('entryNo', 'entryNo', { unique: false });
          }
          if (name === 'auditLog') store.createIndex('at', 'at', { unique: false });
          if (name === 'accounts') store.createIndex('code', 'code', { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade blocked. Please close other tabs.'));
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.onerror = () => reject(t.error);
      }),
  );
}

export function uid(prefix = ''): string {
  const r = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `${prefix}${t}${r}`;
}

// ---- change notifications ----
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((l) => l());
}

export const db = {
  async all<T>(store: StoreName): Promise<T[]> {
    return tx<T[]>(store, 'readonly', (s) => s.getAll());
  },
  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return tx<T | undefined>(store, 'readonly', (s) => s.get(key));
  },
  async put<T>(store: StoreName, value: T): Promise<void> {
    await tx(store, 'readwrite', (s) => s.put(value));
    notify();
  },
  async bulkPut<T>(store: StoreName, values: T[]): Promise<void> {
    const d = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      for (const v of values) s.put(v);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    notify();
  },
  async del(store: StoreName, key: string): Promise<void> {
    await tx(store, 'readwrite', (s) => s.delete(key));
    notify();
  },
  async clear(store: StoreName): Promise<void> {
    await tx(store, 'readwrite', (s) => s.clear());
    notify();
  },
  async byIndex<T>(store: StoreName, index: string, key: IDBValidKey): Promise<T[]> {
    const d = await openDb();
    return new Promise<T[]>((resolve, reject) => {
      const t = d.transaction(store, 'readonly');
      const req = t.objectStore(store).index(index).getAll(key);
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  },
  async count(store: StoreName): Promise<number> {
    return tx<number>(store, 'readonly', (s) => s.count());
  },
};
