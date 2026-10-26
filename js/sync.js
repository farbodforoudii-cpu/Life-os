// Two-way sync with the ecosystem's Supabase project, joined by a sync code (no accounts).
// Each record is stored whole as JSON; the newest updatedAt wins on both sides.
// The space is shared with hesab-man (app = 'hesab'); this app only reads its own rows.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { db } from './db.js';
import { store } from './store.js';

const APP = 'life';
const state = { key: null, status: 'off', error: '', lastSync: null, cursor: null, busy: false };
const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(state); };
const set = patch => { Object.assign(state, patch); emit(); };

// The sync code is the only secret: whoever has it shares this space. The server keeps only its hash.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(25));
  return [...bytes].map(b => ALPHABET[b % 32]).join('').match(/.{5}/g).join('-');
}
// Accepts the code however it was pasted (spaces, lower case).
export function normalizeCode(v) {
  const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 25 ? s.match(/.{5}/g).join('-') : null;
}

async function rpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) throw Object.assign(new Error((data && (data.message || data.error)) || res.statusText), { status: res.status });
  return data;
}

const PERSIAN_ERRORS = [
  [/unknown sync key/i, 'این کد پیدا نشد. کد را دوباره از دستگاه اول کپی کنید.'],
  [/failed to fetch|network|load failed/i, 'اتصال به سرور برقرار نشد. اینترنت یا VPN را بررسی کنید.'],
];
const persian = e => (PERSIAN_ERRORS.find(([re]) => re.test(e.message)) || [0, e.message])[1];

export const sync = {
  state,
  onChange: fn => listeners.add(fn),

  async init() {
    state.key = (await db.get('syncKey')) || null;
    state.cursor = (await db.get('syncCursor')) || null;
    state.lastSync = (await db.get('lastSync')) || null;
    set({ status: state.key ? 'idle' : 'off' });
  },

  // First device: make a new code and a space for it on the server.
  async create() {
    const key = newCode();
    await rpc('eco_create_space', { p_key: key }).catch(e => { throw new Error(persian(e)); });
    await sync.start(key);
    return key;
  },

  // Any other device (or hesab-man's code): join with the copied code.
  async join(input) {
    const key = normalizeCode(input);
    if (!key) throw new Error('کد کامل نیست؛ باید ۲۵ نویسه باشد.');
    await rpc('eco_pull', { p_key: key, p_app: APP, p_limit: 1 }).catch(e => { throw new Error(persian(e)); });
    await sync.start(key);
  },

  async start(key) {
    state.key = key;
    await db.set('syncKey', key);
    await store.markAllDirty();
    state.cursor = null;
    await db.set('syncCursor', null);
    set({ status: 'idle', error: '' });
    await sync.run();
  },

  // Switching off keeps the data on this device; it just stops travelling.
  async signOut() {
    state.key = null;
    await db.set('syncKey', null);
    await db.set('syncCursor', null);
    set({ status: 'off', error: '', cursor: null });
  },

  async run() {
    if (!state.key || state.busy) return;
    if (!navigator.onLine) { set({ status: 'offline' }); return; }
    state.busy = true;
    set({ status: 'syncing', error: '' });
    try {
      // Pull first so a newer remote copy is never overwritten by an older local one.
      let more = true;
      while (more) {
        const rows = await rpc('eco_pull', { p_key: state.key, p_app: APP, p_after: state.cursor, p_limit: 500 });
        if (rows.length) {
          await store.merge(rows.map(r => r.data));
          state.cursor = rows[rows.length - 1].server_updated_at;
          await db.set('syncCursor', state.cursor);
        }
        more = rows.length === 500;
      }
      const out = store.dirtyItems();
      for (let i = 0; i < out.length; i += 200) {
        const chunk = out.slice(i, i + 200);
        await rpc('eco_push', { p_key: state.key, p_app: APP, p_rows: chunk });
        await store.clean(chunk.map(it => ({ id: it.id, updatedAt: it.updatedAt })));
      }
      state.lastSync = new Date().toISOString();
      await db.set('lastSync', state.lastSync);
      set({ status: 'idle' });
    } catch (e) {
      set({ status: navigator.onLine ? 'error' : 'offline', error: persian(e) });
    } finally {
      state.busy = false;
    }
  },
};

// Push changes shortly after they happen, and catch up whenever the app comes back.
let timer;
store.onChange(() => { clearTimeout(timer); timer = setTimeout(() => sync.run(), 2500); });
addEventListener('online', () => sync.run());
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync.run(); });
