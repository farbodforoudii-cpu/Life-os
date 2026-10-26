// In-memory store over IndexedDB. Deletes are tombstones so they can sync.
import { db } from './db.js';

const items = new Map();
const dirty = new Set();
const listeners = new Set();

export const store = {
  async load() {
    for (const it of (await db.allItems()) || []) items.set(it.id, it);
    for (const id of (await db.get('dirty')) || []) dirty.add(id);
  },
  get: id => { const it = items.get(id); return it && !it.deleted ? it : undefined; },
  raw: id => items.get(id),
  all: kind => [...items.values()].filter(it => it.kind === kind && !it.deleted),
  everything: () => [...items.values()],

  // Local change: stamp it and remember it for the next sync.
  async put(...list) {
    const now = new Date().toISOString();
    for (const it of list) {
      it.updatedAt = now;
      if (!it.createdAt) it.createdAt = now;
      items.set(it.id, it);
      dirty.add(it.id);
    }
    await db.putItems(list);
    await db.set('dirty', [...dirty]);
    emit();
  },
  async remove(...list) {
    for (const it of list) it.deleted = true;
    await store.put(...list);
  },

  // Remote or imported records: newest updatedAt wins, nothing is marked dirty.
  async merge(list) {
    const changed = [];
    for (const it of list) {
      const cur = items.get(it.id);
      if (cur && cur.updatedAt >= it.updatedAt) continue;
      items.set(it.id, it);
      dirty.delete(it.id);
      changed.push(it);
    }
    if (changed.length) {
      await db.putItems(changed);
      await db.set('dirty', [...dirty]);
      emit();
    }
    return changed.length;
  },
  dirtyItems: () => [...dirty].map(id => items.get(id)).filter(Boolean),
  // Joining a sync space (maybe a different one than before): everything here has to be sent again.
  async markAllDirty() {
    for (const id of items.keys()) dirty.add(id);
    await db.set('dirty', [...dirty]);
  },
  async clean(sent) {
    for (const { id, updatedAt } of sent) {
      // Only forget it if it did not change again while it was being sent.
      if (items.get(id)?.updatedAt === updatedAt) dirty.delete(id);
    }
    await db.set('dirty', [...dirty]);
  },
  onChange: fn => listeners.add(fn),
};

function emit() { for (const fn of listeners) fn(); }
