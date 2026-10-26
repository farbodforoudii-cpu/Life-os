// Two-way sync with Supabase over plain REST: push local changes, pull anything newer.
// Each record is stored whole as JSON; the newest updatedAt wins on both sides.
// The table is shared with hesab-man (app = 'hesab'); this app only reads its own rows.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { db } from './db.js';
import { store } from './store.js';

const state = { session: null, status: 'off', error: '', lastSync: null, cursor: null, busy: false };
const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(state); };
const set = patch => { Object.assign(state, patch); emit(); };

async function call(path, { method = 'GET', body, auth = true, prefer } = {}) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (auth && state.session) headers.Authorization = `Bearer ${state.session.access_token}`;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(SUPABASE_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) {
    const msg = (data && (data.msg || data.message || data.error_description || data.error)) || res.statusText;
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return data;
}

async function saveSession(s) {
  state.session = s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Date.now() + (s.expires_in - 60) * 1000, user: { id: s.user.id, email: s.user.email } } : null;
  await db.set('session', state.session);
}

async function fresh() {
  if (!state.session) return false;
  if (Date.now() < state.session.expires_at) return true;
  const s = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: state.session.refresh_token } });
  await saveSession(s);
  return true;
}

const PERSIAN_ERRORS = [
  [/invalid login credentials/i, 'ایمیل یا رمز اشتباهه.'],
  [/email not confirmed/i, 'اول ایمیلت رو تأیید کن (لینک داخل ایمیل)، بعد دوباره وارد شو.'],
  [/already registered/i, 'این ایمیل قبلاً ثبت شده؛ «ورود» رو بزن.'],
  [/password should be at least/i, 'رمز باید حداقل ۶ حرف باشه.'],
  [/failed to fetch|network|load failed/i, 'به سرور وصل نشد. اینترنت یا VPN رو چک کن.'],
];
const persian = e => (PERSIAN_ERRORS.find(([re]) => re.test(e.message)) || [0, e.message])[1];

export const sync = {
  state,
  onChange: fn => listeners.add(fn),

  async init() {
    state.session = (await db.get('session')) || null;
    state.cursor = (await db.get('syncCursor')) || null;
    state.lastSync = (await db.get('lastSync')) || null;
    set({ status: state.session ? 'idle' : 'off' });
  },

  async signUp(email, password) {
    const s = await call('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password } }).catch(e => { throw new Error(persian(e)); });
    if (s && s.access_token) { await saveSession(s); set({ status: 'idle' }); return 'in'; }
    return 'confirm';
  },

  async signIn(email, password) {
    const s = await call('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } }).catch(e => { throw new Error(persian(e)); });
    await saveSession(s);
    state.cursor = null;
    await db.set('syncCursor', null);
    set({ status: 'idle', error: '' });
  },

  async signOut() {
    await saveSession(null);
    set({ status: 'off', error: '' });
  },

  async run() {
    if (!state.session || state.busy) return;
    if (!navigator.onLine) { set({ status: 'offline' }); return; }
    state.busy = true;
    set({ status: 'syncing', error: '' });
    try {
      await fresh();
      // Pull first so a newer remote copy is never overwritten by an older local one.
      let more = true;
      while (more) {
        const q = `/rest/v1/life_items?select=data,server_updated_at&app=eq.life&order=server_updated_at.asc&limit=500${state.cursor ? `&server_updated_at=gt.${encodeURIComponent(state.cursor)}` : ''}`;
        const rows = await call(q);
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
        await call('/rest/v1/life_items?on_conflict=user_id,id', {
          method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
          body: chunk.map(it => ({ user_id: state.session.user.id, id: it.id, kind: it.kind, app: 'life', data: it })),
        });
        await store.clean(chunk.map(it => ({ id: it.id, updatedAt: it.updatedAt })));
      }
      state.lastSync = new Date().toISOString();
      await db.set('lastSync', state.lastSync);
      set({ status: 'idle' });
    } catch (e) {
      if (e.status === 401) { await saveSession(null); set({ status: 'off', error: 'نشست تموم شده؛ دوباره وارد شو.' }); }
      else set({ status: navigator.onLine ? 'error' : 'offline', error: persian(e) });
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
