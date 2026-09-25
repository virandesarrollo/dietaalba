const DATABASE_NAME = 'alba-offline-diet-v1';
let sharedStore;

const clone = (value) => structuredClone(value);

function createMemoryStore(memory) {
  const queueKey = (userId) => `queue:${userId}`;
  const snapshotKey = (userId, date) => `snapshot:${userId}:${date}`;
  const nextId = () => {
    const id = (memory.get('next-id') ?? 0) + 1;
    memory.set('next-id', id);
    return id;
  };
  return {
    async enqueue(userId, operation) {
      const item = { id: nextId(), userId, createdAt: Date.now(), ...clone(operation) };
      const items = memory.get(queueKey(userId)) ?? [];
      memory.set(queueKey(userId), [...items, item]);
      return clone(item);
    },
    async list(userId) { return clone((memory.get(queueKey(userId)) ?? []).sort((a, b) => a.id - b.id)); },
    async remove(userId, id) { memory.set(queueKey(userId), (memory.get(queueKey(userId)) ?? []).filter((item) => item.id !== id)); },
    async clear(userId) {
      memory.delete(queueKey(userId));
      for (const key of [...memory.keys()]) if (key.startsWith(`snapshot:${userId}:`)) memory.delete(key);
    },
    async saveSnapshot(userId, date, data) { memory.set(snapshotKey(userId, date), clone(data)); },
    async loadSnapshot(userId, date) { const value = memory.get(snapshotKey(userId, date)); return value ? clone(value) : null; },
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      const operations = db.createObjectStore('operations', { keyPath: 'id', autoIncrement: true });
      operations.createIndex('userId', 'userId');
      const snapshots = db.createObjectStore('snapshots', { keyPath: 'key' });
      snapshots.createIndex('userId', 'userId');
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function createIndexedDbStore() {
  const database = openDatabase();
  const transact = async (storeName, mode, callback) => {
    const db = await database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = callback(store);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(request?.result);
    });
  };
  const byUser = async (storeName, userId) => transact(storeName, 'readonly', (store) => store.index('userId').getAll(userId));
  return {
    async enqueue(userId, operation) {
      const item = { userId, createdAt: Date.now(), ...clone(operation) };
      const id = await transact('operations', 'readwrite', (store) => store.add(item));
      return { ...item, id };
    },
    async list(userId) { return (await byUser('operations', userId)).sort((a, b) => a.id - b.id); },
    async remove(userId, id) {
      const items = await byUser('operations', userId);
      if (items.some((item) => item.id === id)) await transact('operations', 'readwrite', (store) => store.delete(id));
    },
    async clear(userId) {
      for (const item of await byUser('operations', userId)) await transact('operations', 'readwrite', (store) => store.delete(item.id));
      for (const item of await byUser('snapshots', userId)) await transact('snapshots', 'readwrite', (store) => store.delete(item.key));
    },
    async saveSnapshot(userId, date, data) { await transact('snapshots', 'readwrite', (store) => store.put({ key: `${userId}:${date}`, userId, data: clone(data) })); },
    async loadSnapshot(userId, date) {
      const item = await transact('snapshots', 'readonly', (store) => store.get(`${userId}:${date}`));
      return item?.data ? clone(item.data) : null;
    },
  };
}

export function createOfflineDietStore(memory) {
  return memory instanceof Map ? createMemoryStore(memory) : createIndexedDbStore();
}

export function getOfflineDietStore() {
  if (!sharedStore) sharedStore = createOfflineDietStore(typeof indexedDB === 'undefined' ? new Map() : undefined);
  return sharedStore;
}
