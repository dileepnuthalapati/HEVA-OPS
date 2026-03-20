import { openDB } from 'idb';

const DB_NAME = 'swiftpos-db';
const DB_VERSION = 1;

export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('orders')) {
        const orderStore = db.createObjectStore('orders', { keyPath: 'id' });
        orderStore.createIndex('synced', 'synced');
        orderStore.createIndex('created_at', 'created_at');
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
};

export const saveToIndexedDB = async (storeName, data) => {
  const db = await initDB();
  const tx = db.transaction(storeName, 'readwrite');
  if (Array.isArray(data)) {
    await Promise.all(data.map(item => tx.store.put(item)));
  } else {
    await tx.store.put(data);
  }
  await tx.done;
};

export const getFromIndexedDB = async (storeName, key) => {
  const db = await initDB();
  return db.get(storeName, key);
};

export const getAllFromIndexedDB = async (storeName) => {
  const db = await initDB();
  return db.getAll(storeName);
};

export const deleteFromIndexedDB = async (storeName, key) => {
  const db = await initDB();
  return db.delete(storeName, key);
};

export const clearStore = async (storeName) => {
  const db = await initDB();
  return db.clear(storeName);
};

export const getUnsyncedOrders = async () => {
  const db = await initDB();
  const index = db.transaction('orders').store.index('synced');
  return index.getAll(false);
};