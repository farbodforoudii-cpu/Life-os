// Domain model: entries, weekly templates, client groups and their packages (series).
import { toJalali, MONTHS, WEEKDAYS, faDigits } from './jalali.js';
import { store } from './store.js';

export const CATS = {
  client: 'مراجع',
  shift: 'شیفت',
  uni: 'دانشگاه',
  personal: 'شخصی',
};

// Generic quick-add buttons; the user's own frequent titles are learned on top of these.
export const DEFAULT_PRESETS = [
  { title: 'استراحت', cat: 'personal' },
  { title: 'دورهمی', cat: 'personal' },
  { title: 'سفر', cat: 'personal' },
  { title: 'خرید', cat: 'personal' },
];

export const CANCEL_REASONS = ['مراجع نیومد', 'مراجع خبر داد', 'خودم نتونستم', 'تعطیلی', 'استاد نیومد'];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// A day is stored as its civil date "YYYY-MM-DD" (Gregorian); times as minutes from midnight.
export const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromDayKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const minutesNow = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
export const todayKey = () => dayKey(new Date());

// The Iranian week starts on Saturday (getDay() === 6).
export const weekStart = d => addDays(d, -((d.getDay() + 1) % 7));
// Week order Saturday..Friday as getDay() numbers.
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
export const EVEN_DAYS = [6, 1, 3]; // شنبه، دوشنبه، چهارشنبه
export const ODD_DAYS = [0, 2, 4];  // یکشنبه، سه‌شنبه، پنجشنبه

export const fmtTime = m => faDigits(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
export const toMin = v => { const [h, m] = String(v || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const toHHMM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const weekdayName = d => WEEKDAYS[d.getDay()];
export const jDayMonth = d => { const j = toJalali(d); return `${faDigits(j.jd)} ${MONTHS[j.jm - 1]}`; };
export const jMonthYear = d => { const j = toJalali(d); return `${MONTHS[j.jm - 1]} ${faDigits(j.jy)}`; };
export const daysLabel = days => {
  const s = [...days].sort().join();
  if (s === [...EVEN_DAYS].sort().join()) return 'روزهای زوج';
  if (s === [...ODD_DAYS].sort().join()) return 'روزهای فرد';
  return WEEK_ORDER.filter(d => days.includes(d)).map(d => WEEKDAYS[d]).join('، ');
};

// ---------- entries ----------
export function newEntry(f) {
  return {
    id: uid(), kind: 'entry', status: 'planned', source: 'manual', cat: 'personal', history: [],
    ...f,
  };
}

export function logChange(entry, what) {
  entry.history = entry.history || [];
  entry.history.push({ at: new Date().toISOString(), ...what });
}

// Past planned entries count as done automatically; cancellations and moves are recorded by hand.
export function liveStatus(e, now = new Date()) {
  if (e.status === 'cancelled' || e.status === 'moved') return e.status;
  const today = dayKey(now);
  if (e.date < today) return 'done';
  if (e.date > today) return 'planned';
  const m = minutesNow(now);
  if (e.end <= m) return 'done';
  if (e.start <= m) return 'now';
  return 'planned';
}
export const isActive = e => e.status !== 'cancelled' && e.status !== 'moved';
export const byTime = (a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.end - b.end;
export const entriesOn = k => store.all('entry').filter(e => e.date === k).sort(byTime);

// ---------- weekly templates ----------
const tplEntryId = (tpl, k) => `t_${tpl.id}_${k}`;
const tplCovers = (tpl, k, d) => !tpl.deleted && tpl.days.includes(d.getDay()) && k >= tpl.from && (!tpl.until || k <= tpl.until);

function fromTemplate(tpl, k) {
  return newEntry({
    id: tplEntryId(tpl, k), date: k, start: tpl.start, end: tpl.end, title: tpl.title, cat: tpl.cat,
    groupId: tpl.groupId || null, source: 'template', templateId: tpl.id,
  });
}

// Make sure template sessions exist as real entries for every day in [from, to].
// Ids are deterministic, so two devices doing this never duplicate a session.
export async function ensureRange(fromK, toK) {
  const tpls = store.all('template');
  if (!tpls.length) return;
  const created = [];
  for (let d = fromDayKey(fromK); dayKey(d) <= toK; d = addDays(d, 1)) {
    const k = dayKey(d);
    for (const tpl of tpls) {
      if (!tplCovers(tpl, k, d) || store.raw(tplEntryId(tpl, k))) continue;
      created.push(fromTemplate(tpl, k));
    }
  }
  if (created.length) await store.put(...created);
}

// After a template changes: future sessions the user never touched follow it.
export async function applyTemplate(tpl) {
  const today = todayKey();
  const changed = [], removed = [];
  for (const e of store.all('entry')) {
    if (e.templateId !== tpl.id || e.date <= today || (e.history && e.history.length) || e.headcount != null) continue;
    if (!tplCovers(tpl, e.date, fromDayKey(e.date))) { removed.push(e); continue; }
    Object.assign(e, { start: tpl.start, end: tpl.end, title: tpl.title, cat: tpl.cat, groupId: tpl.groupId || null });
    changed.push(e);
  }
  if (removed.length) await store.remove(...removed);
  if (changed.length) await store.put(...changed);
}

// ---------- groups & series ----------
export const groups = () => store.all('group').filter(g => !g.archived).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
export const seriesOf = gid => store.all('series').filter(s => s.groupId === gid).sort((a, b) => a.start.localeCompare(b.start));
export const sessionsOf = gid => store.all('entry').filter(e => e.groupId === gid && isActive(e)).sort(byTime);

// Each session takes the earliest package that has started by its date and still has room.
// Cancelled or moved sessions never use up a package.
const numCache = new Map();
store.onChange(() => numCache.clear());
export function numberSessions(gid) {
  if (!numCache.has(gid)) numCache.set(gid, computeNumbers(gid));
  return numCache.get(gid);
}
function computeNumbers(gid) {
  // `offset` = sessions of the first package that happened before the app was used.
  const series = seriesOf(gid).map(s => ({ s, used: s.offset || 0 }));
  const out = new Map();
  for (const e of sessionsOf(gid)) {
    const slot = series.find(x => x.s.start <= e.date && x.used < x.s.size);
    if (slot) { slot.used++; out.set(e.id, { series: slot.s, n: slot.used, size: slot.s.size }); }
    else out.set(e.id, null);
  }
  return out;
}

export function sessionInfo(e) {
  if (!e.groupId) return null;
  return numberSessions(e.groupId).get(e.id) || { series: null, n: null, size: null };
}

// Where a group stands right now.
export function groupStatus(gid, now = new Date()) {
  const nums = numberSessions(gid);
  const sessions = sessionsOf(gid);
  const series = seriesOf(gid);
  const today = dayKey(now);
  const current = [...series].reverse().find(s => s.start <= today) || series[0] || null;
  let done = current ? current.offset || 0 : 0, booked = done;
  for (const e of sessions) {
    const n = nums.get(e.id);
    if (!n || n.series !== current) continue;
    booked++;
    if (liveStatus(e, now) === 'done') done++;
  }
  const next = sessions.find(e => e.date > today || (e.date === today && e.start > minutesNow(now)));
  const last = [...sessions].reverse().find(e => liveStatus(e, now) === 'done');
  const outside = sessions.filter(e => nums.get(e.id) === null && liveStatus(e, now) === 'done').length;
  return { current, done, booked, left: current ? current.size - done : 0, next, last, outside, total: sessions.filter(e => liveStatus(e, now) === 'done').length + series.reduce((s, x) => s + (x.offset || 0), 0) };
}

// A finished client session is paid if its package was paid or it was marked paid on its own.
export function isPaid(e) {
  if (e.paidAt) return true;
  const info = e.groupId ? numberSessions(e.groupId).get(e.id) : null;
  return !!(info && info.series && info.series.paid);
}
export const awaitingPayment = (now = new Date()) =>
  store.all('entry').filter(e => e.cat === 'client' && isActive(e) && liveStatus(e, now) === 'done' && !isPaid(e)).sort(byTime);

// Who is expected: all members minus those marked absent; a manual count wins.
export function headcount(e) {
  if (e.headcount != null) return e.headcount;
  const g = e.groupId && store.get(e.groupId);
  if (g && g.members && g.members.length) return g.members.length - (e.absent || []).length;
  return null;
}

// For shifts the usual count is whatever the last session of the same title had.
export function lastHeadcount(title, beforeKey) {
  const prev = store.all('entry').filter(x => x.title === title && x.headcount != null && x.date < beforeKey).sort(byTime).pop();
  return prev ? prev.headcount : null;
}

// Frequent titles first, then the generic defaults that are not already in the list.
export function learnedPresets(limit = 10) {
  const counts = new Map();
  for (const e of store.all('entry')) {
    if (e.source !== 'manual' || e.groupId || e.movedFrom) continue;
    const c = counts.get(e.title) || { title: e.title, cat: e.cat, n: 0 };
    c.n++;
    counts.set(e.title, c);
  }
  const learned = [...counts.values()].sort((a, b) => b.n - a.n);
  const seen = new Set(learned.map(p => p.title));
  return [...learned, ...DEFAULT_PRESETS.filter(p => !seen.has(p.title))].slice(0, limit);
}
