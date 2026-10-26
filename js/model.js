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
// Reads a typed number in Persian, Arabic or Latin digits («۱۲»، «١٢»، «12»); empty or invalid gives `fallback`.
export const toNum = (v, fallback = null) => {
  const s = String(v ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
  return s === '' ? fallback : parseInt(s, 10);
};
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
// Imported history: `untimed` entries had no hour written (kept in order, never counted as hours);
// `estimated` ones got the usual hour of that session or shift.
export const minutesOf = e => e.untimed ? 0 : e.end - e.start;
export const timeLabel = e => e.untimed ? '—' : (e.estimated ? '≈' : '') + fmtTime(e.start);
export const timeRange = e => e.untimed ? 'ساعت ثبت نشده' : `${e.estimated ? 'حدود ' : ''}${fmtTime(e.start)} تا ${fmtTime(e.end)}`;
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
  // `offset` = sessions of a package that happened before the app was used.
  // A session pinned to a package (`seriesId`, e.g. from an invoice) stays there; `outside` keeps it out of all.
  const series = seriesOf(gid).map(s => ({ s, room: s.size - (s.offset || 0), list: [] }));
  const byId = new Map(series.map(x => [x.s.id, x]));
  const sessions = sessionsOf(gid);
  for (const e of sessions) { const x = e.seriesId && byId.get(e.seriesId); if (x) x.room--; }
  const out = new Map();
  for (const e of sessions) {
    let x = e.outside ? null : e.seriesId && byId.get(e.seriesId);
    if (!x && !e.outside) { x = series.find(y => y.s.start <= e.date && y.room > 0); if (x) x.room--; }
    if (x) x.list.push(e); else out.set(e.id, null);
  }
  for (const x of series) x.list.forEach((e, i) => out.set(e.id, { series: x.s, n: (x.s.offset || 0) + i + 1, size: x.s.size }));
  return out;
}

// A package is finished once all its sessions are behind us.
export function seriesDone(s, now = new Date()) {
  const nums = numberSessions(s.groupId);
  const done = sessionsOf(s.groupId).filter(e => nums.get(e.id)?.series === s && liveStatus(e, now) === 'done').length;
  return (s.offset || 0) + done >= s.size;
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

// ---------- prices & invoices ----------
// A group's price list has rows that hold from a given day, one price per number of people present.
// A session's own `price` (as billed) wins; otherwise the row in force on its date, for its headcount.
export function priceRow(g, date) {
  return (g && g.prices || []).filter(p => p.from <= date).sort((a, b) => a.from.localeCompare(b.from)).pop() || null;
}
export function priceOf(e) {
  if (e.price != null) return e.price;
  const g = e.groupId && store.get(e.groupId), n = headcount(e), row = priceRow(g, e.date);
  return row && n != null && row.by[n] != null ? row.by[n] : null;
}
export const sessionKind = e => headcount(e) === 1 ? 'خصوصی' : `گروهی${headcount(e) ? `، ${faDigits(headcount(e))} نفر` : ''}`;
export const money = n => n == null ? '—' : Number(n).toLocaleString('fa-IR');
// Every session a package holds, in order, with what it costs.
export function invoiceOf(seriesId) {
  const s = store.get(seriesId);
  if (!s) return null;
  const nums = numberSessions(s.groupId);
  const rows = sessionsOf(s.groupId).filter(e => nums.get(e.id)?.series === s).map(e => ({ e, n: nums.get(e.id).n, price: priceOf(e), done: liveStatus(e) === 'done' }));
  return { s, g: store.get(s.groupId), rows, total: rows.reduce((a, r) => a + (r.price || 0), 0), missing: rows.filter(r => r.price == null).length };
}
export const profile = () => store.get('profile') || { id: 'profile', kind: 'profile' };

// ---------- link with «حساب من» ----------
// A finished package leaves a bill (`bill_<package id>`) that «حساب من» shows in its inbox. Money is recorded
// there only when the user confirms; the answer comes back as a payment record (`pay_<package id>`, written by
// «حساب من») and marks the package paid here. Only this app writes bills and packages, only «حساب من» writes
// payments, so the two never overwrite each other.
const BILL_KEYS = ['groupId', 'name', 'total', 'count', 'missing', 'from', 'to', 'period', 'paid'];
const periodOf = rows => {
  const ms = [...new Set(rows.map(r => jMonthYear(fromDayKey(r.e.date))))];
  return ms.length > 1 ? `${ms[0].split(' ')[0]}–${ms[ms.length - 1]}` : ms[0] || '';
};
let billing = false;
export async function refreshBills(now = new Date()) {
  if (billing) return;
  billing = true;
  try {
    const put = [];
    for (const p of store.all('payment')) {
      const s = store.get(p.seriesId);
      if (!s) continue;
      if ((p.how === 'tx' || p.how === 'existing') && !s.paid) { s.paid = true; s.paidAt = p.at; s.paidVia = 'hesab'; put.push(s); }
      if (p.how === 'undo' && s.paid && s.paidVia === 'hesab' && s.paidAt <= p.at) { s.paid = false; delete s.paidAt; delete s.paidVia; put.push(s); }
    }
    if (put.length) await store.put(...put);
    const bills = [];
    for (const s of store.all('series')) {
      const g = store.get(s.groupId), id = `bill_${s.id}`, old = store.get(id);
      if (!g || (!old && (s.paid || !seriesDone(s, now)))) continue;
      const v = invoiceOf(s.id);
      const want = { groupId: g.id, name: g.name, total: v.total, count: v.rows.length, missing: v.missing,
        from: v.rows[0]?.e.date || s.start, to: v.rows[v.rows.length - 1]?.e.date || s.start, period: periodOf(v.rows), paid: !!s.paid };
      if (old && BILL_KEYS.every(k => old[k] === want[k])) continue;
      bills.push({ ...(old || { id, kind: 'bill', seriesId: s.id, issuedAt: now.toISOString() }), ...want });
    }
    for (const b of store.all('bill')) if (!store.get(b.seriesId)) { b.deleted = true; bills.push(b); }
    if (bills.length) await store.put(...bills);
  } finally {
    billing = false;
  }
}

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

// One-tap counts for a shift: the counts it usually has (most frequent of the last ten), else around the
// weekly pattern's usual count, else a plain small range.
export function headcountChoices(e) {
  const prev = store.all('entry').filter(x => x.title === e.title && x.id !== e.id && x.headcount != null && x.date <= e.date).sort(byTime).slice(-10);
  if (prev.length) {
    const c = new Map(); for (const x of prev) c.set(x.headcount, (c.get(x.headcount) || 0) + 1);
    const top = [...c].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    return [...new Set([...top.slice(0, 3), top[0] - 1, top[0] + 1])].filter(n => n > 0).slice(0, 5).sort((a, b) => a - b);
  }
  const usual = e.templateId && store.get(e.templateId)?.headcount;
  return usual ? [usual - 1, usual, usual + 1].filter(n => n > 0) : [2, 3, 4, 5, 6];
}

// How long a new item usually lasts: the most common length of earlier timed items with the same client
// or title, then the weekly pattern, then a plain default per category.
const DEFAULT_MINUTES = { client: 90, shift: 90, uni: 60, personal: 60 };
export function usualMinutes({ title, cat, groupId }) {
  const same = x => (groupId ? x.groupId === groupId : x.title === title);
  const counts = new Map();
  for (const e of store.all('entry')) if (same(e) && !e.untimed && e.end > e.start) counts.set(e.end - e.start, (counts.get(e.end - e.start) || 0) + 1);
  if (counts.size) return [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const tpl = store.all('template').find(x => !x.deleted && same(x));
  return tpl ? tpl.end - tpl.start : DEFAULT_MINUTES[cat] || 60;
}

// Frequent titles first, then the generic defaults that are not already in the list.
// With a day and a minute, what usually happens on that weekday around that time comes first.
export function learnedPresets(limit = 10, ctx = null) {
  // What was actually done in the last three months, typed by hand or brought in from the old schedule.
  const counts = new Map(), since = dayKey(addDays(new Date(), -90));
  for (const e of store.all('entry')) {
    if ((e.source !== 'manual' && e.source !== 'import') || e.groupId || e.movedFrom || e.date < since) continue;
    const c = counts.get(e.title) || { title: e.title, cat: e.cat, n: 0, fit: 0 };
    c.n++;
    if (ctx && fromDayKey(e.date).getDay() === ctx.weekday) c.fit += e.untimed || Math.abs(e.start - ctx.minute) <= 120 ? 1 : 0;
    counts.set(e.title, c);
  }
  const taken = new Set(ctx ? entriesOn(ctx.date).filter(isActive).map(e => e.title) : []);
  const learned = [...counts.values()].filter(p => !taken.has(p.title)).sort((a, b) => b.fit - a.fit || b.n - a.n);
  learned.forEach((p, i) => { p.suggested = i < 3 && p.fit >= 2; });
  const seen = new Set(learned.map(p => p.title));
  return [...learned, ...DEFAULT_PRESETS.filter(p => !seen.has(p.title))].slice(0, limit);
}
