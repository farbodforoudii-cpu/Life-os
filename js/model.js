// Domain model: entries, weekly templates, client groups and their packages (series).
import { toJalali, MONTHS, WEEKDAYS, faDigits, monthRange } from './jalali.js';
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

export const CANCEL_REASONS = ['مراجع نیامد', 'مراجع خبر داد', 'خودم نتوانستم', 'تعطیلی', 'استاد نیامد'];
// Earlier, colloquial wording of the same reasons; stored entries are moved to the new wording once.
export const OLD_REASONS = { 'مراجع نیومد': 'مراجع نیامد', 'خودم نتونستم': 'خودم نتوانستم', 'استاد نیومد': 'استاد نیامد' };

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
  // Sessions the row dropped earlier (an end date that was later moved or removed) come back when it covers them again.
  for (const e of store.everything()) {
    if (!e.deleted || e.kind !== 'entry' || e.templateId !== tpl.id || e.date <= today || (e.history && e.history.length) || !tplCovers(tpl, e.date, fromDayKey(e.date))) continue;
    delete e.deleted; Object.assign(e, { start: tpl.start, end: tpl.end, title: tpl.title, cat: tpl.cat, groupId: tpl.groupId || null });
    changed.push(e);
  }
  if (removed.length) await store.remove(...removed);
  if (changed.length) await store.put(...changed);
}

// ---------- groups & series ----------
export const groups = () => store.all('group').filter(g => !g.archived).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
export const seriesOf = gid => {
  if (!seriesCache.has(gid)) seriesCache.set(gid, store.all('series').filter(s => s.groupId === gid).sort((a, b) => a.start.localeCompare(b.start)));
  return [...seriesCache.get(gid)];
};
// A group's sessions and packages are read many times per screen; both are cached until anything changes.
const sessCache = new Map(), seriesCache = new Map();
store.onChange(() => { sessCache.clear(); seriesCache.clear(); });
export const sessionsOf = gid => {
  if (!sessCache.has(gid)) sessCache.set(gid, store.all('entry').filter(e => e.groupId === gid && isActive(e)).sort(byTime));
  return sessCache.get(gid);
};

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
// With `project`, a package not yet full is completed from the weekly pattern (sessions not in the calendar yet,
// priced from the list): what a proforma for the whole package shows before it is held.
export function invoiceOf(seriesId, { project = false } = {}) {
  const s = store.get(seriesId);
  if (!s) return null;
  const nums = numberSessions(s.groupId);
  const rows = sessionsOf(s.groupId).filter(e => nums.get(e.id)?.series === s).map(e => ({ e, n: nums.get(e.id).n, price: priceOf(e), done: liveStatus(e) === 'done' }));
  let unplanned = 0;
  if (project) {
    const want = s.size - (s.offset || 0), tpls = store.all('template').filter(t => t.groupId === s.groupId && !t.deleted);
    const last = rows.length ? rows[rows.length - 1].e.date : null;
    const from = [last, dayKey(addDays(fromDayKey(s.start), -1)), todayKey()].filter(Boolean).sort().pop();
    let n = rows.length ? rows[rows.length - 1].n : s.offset || 0;
    for (let d = addDays(fromDayKey(from), 1), i = 0; rows.length < want && tpls.length && i < 366; d = addDays(d, 1), i++) {
      const k = dayKey(d);
      for (const tpl of tpls) {
        if (rows.length >= want || !tplCovers(tpl, k, d) || store.raw(tplEntryId(tpl, k))) continue;
        const e = fromTemplate(tpl, k);
        rows.push({ e, n: ++n, price: priceOf(e), done: false, projected: true });
      }
    }
    unplanned = Math.max(0, want - rows.length);
  }
  return { s, g: store.get(s.groupId), rows, total: rows.reduce((a, r) => a + (r.price || 0), 0), missing: rows.filter(r => r.price == null).length,
    pro: rows.some(r => !r.done) || unplanned > 0, projected: rows.filter(r => r.projected).length, unplanned };
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
// ---------- shared monthly report ----------
// Each app publishes a summary of its own month: this one `month_<YYYY-MM>` (hours, sessions, value of the sessions
// held), «حساب من» `money_<YYYY-MM>` (work income received). Both apps show the same card from the two.
export const monthKeyOf = k => { const j = toJalali(fromDayKey(k)); return `${j.jy}-${String(j.jm).padStart(2, '0')}`; };
const MONTH_KEYS = ['workMin', 'clientMin', 'shiftMin', 'estMin', 'sessions', 'shifts', 'earned', 'unpriced', 'shiftEarned',
  'fcValue', 'fcSessions', 'fcShifts', 'fcPlanned', 'fcUnpriced', 'fcShiftsUnpriced'];

// Gordan pays per student: each attendee of a Gordan shift counts at an average share (180,000 by default, editable),
// and what Gordan actually paid for each month is written down next to it (it pays around the 17th of the next month).
export const GORDAN_RE = /گردان/;
export const gordan = () => store.get('gordan') || { id: 'gordan', kind: 'gordanpay', perHead: 180000, paid: {} };
const usualShiftHeads = title => {
  const xs = store.all('entry').filter(e => e.title === title && e.headcount != null).sort(byTime).slice(-10);
  return xs.length ? xs.reduce((s, e) => s + e.headcount, 0) / xs.length : null;
};
// Students of Gordan shifts in a month: counted ones, and an estimate for uncounted shifts from that shift's average.
export function gordanMonth(k, now = new Date()) {
  const { start, end } = monthRange(k), a = dayKey(start), b = dayKey(end);
  const xs = store.all('entry').filter(e => e.cat === 'shift' && GORDAN_RE.test(e.title) && isActive(e) && e.date >= a && e.date < b && ['done', 'now'].includes(liveStatus(e, now)));
  const known = xs.filter(e => e.headcount != null), heads = known.reduce((s, e) => s + e.headcount, 0);
  let est = heads;
  for (const e of xs) if (e.headcount == null) est += usualShiftHeads(e.title) || 0;
  // A month counted from Gordan's own figures (total students of both branches) wins over the shifts' counts.
  const total = gordan().heads?.[k];
  if (total != null) return { shifts: xs.length, counted: xs.length, heads: total, est: total, paid: gordan().paid[k] ?? null, total: true };
  return { shifts: xs.length, counted: known.length, heads, est: Math.round(est), paid: gordan().paid[k] ?? null };
}

// What a shift pays, per shift title (optional; entered on the clients page). Missing = not counted as income.
export const shiftPay = () => store.get('shiftpay') || { id: 'shiftpay', kind: 'shiftpay', by: {} };
export const shiftRate = title => shiftPay().by[title] ?? null;
// One shift's income: Gordan by its students (counted, else the usual count) × the average share; others by their pay.
export function shiftIncome(title, heads) {
  if (GORDAN_RE.test(title)) { const n = heads ?? usualShiftHeads(title); return n != null ? n * gordan().perHead : null; }
  return shiftRate(title);
}
// The usual number of people in a group's session: the most common of its last eight, else all members.
function usualHeadcount(gid) {
  const c = new Map();
  for (const e of sessionsOf(gid).filter(x => liveStatus(x) === 'done').slice(-8)) { const n = headcount(e); if (n != null) c.set(n, (c.get(n) || 0) + 1); }
  if (c.size) return [...c].sort((a, b) => b[1] - a[1])[0][0];
  const g = store.get(gid); return g && g.members && g.members.length ? g.members.length : null;
}

// The month ahead if the weekly pattern holds: sessions and shifts already held, plus what is planned for the rest
// of the month — entries already on the calendar and pattern days not created yet. Each planned session is priced
// from its group's list for the usual number of people; a shift by its pay, when entered.
export function monthForecast(k, now = new Date()) {
  const { start, end } = monthRange(k), a = dayKey(start), b = dayKey(end), today = dayKey(now);
  const f = { planned: 0, sessions: 0, shifts: 0, unpriced: 0, shiftsUnpriced: 0 };
  const add = (cat, groupId, title, date, n) => {
    if (cat === 'client') {
      f.sessions++;
      const g = groupId && store.get(groupId), row = priceRow(g, date), hc = n ?? (groupId ? usualHeadcount(groupId) : null);
      const p = row && hc != null ? row.by[hc] : null;
      if (p == null) f.unpriced++; else f.planned += p;
    } else if (cat === 'shift') { f.shifts++; const p = shiftIncome(title, n); if (p == null) f.shiftsUnpriced++; else f.planned += p; }
  };
  for (const e of store.all('entry')) {
    if (e.date < a || e.date >= b || !isActive(e) || liveStatus(e, now) !== 'planned') continue;
    add(e.cat, e.groupId, e.title, e.date, e.headcount ?? null);
  }
  for (let d = addDays(fromDayKey(today), 1); dayKey(d) < b; d = addDays(d, 1)) {
    const k2 = dayKey(d);
    if (k2 < a) continue;
    for (const tpl of store.all('template')) if (tplCovers(tpl, k2, d) && !store.raw(tplEntryId(tpl, k2))) add(tpl.cat, tpl.groupId, tpl.title, k2, tpl.cat === 'shift' ? tpl.headcount : null);
  }
  return f;
}
export function monthStats(now = new Date()) {
  const out = {};
  for (const e of store.all('entry')) {
    if (!isActive(e) || (e.cat !== 'client' && e.cat !== 'shift')) continue;
    const st = liveStatus(e, now);
    if (st !== 'done' && st !== 'now') continue;
    const k = monthKeyOf(e.date), m = out[k] || (out[k] = { workMin: 0, clientMin: 0, shiftMin: 0, estMin: 0, sessions: 0, shifts: 0, earned: 0, unpriced: 0, shiftEarned: 0 });
    const min = minutesOf(e);
    m.workMin += min; if (e.estimated) m.estMin += min;
    if (e.cat === 'client') { m.clientMin += min; m.sessions++; const p = priceOf(e); if (p == null) m.unpriced++; else m.earned += p; }
    else { m.shiftMin += min; m.shifts++; m.shiftEarned += shiftIncome(e.title, e.headcount ?? null) || 0; }
  }
  // The running month also carries its forecast: held so far + planned for the rest.
  const cur = monthKeyOf(dayKey(now)), m = out[cur] || (out[cur] = { workMin: 0, clientMin: 0, shiftMin: 0, estMin: 0, sessions: 0, shifts: 0, earned: 0, unpriced: 0, shiftEarned: 0 });
  const fc = monthForecast(cur, now);
  Object.assign(m, { fcPlanned: fc.planned, fcValue: m.earned + m.shiftEarned + fc.planned, fcSessions: fc.sessions, fcShifts: fc.shifts, fcUnpriced: fc.unpriced, fcShiftsUnpriced: fc.shiftsUnpriced });
  return out;
}
function monthRows(now) {
  const rows = [];
  for (const [k, m] of Object.entries(monthStats(now))) {
    const id = `month_${k}`, old = store.get(id);
    if (old && MONTH_KEYS.every(f => old[f] === m[f])) continue;
    rows.push({ ...(old || { id, kind: 'monthsum', month: k }), ...m });
  }
  const open = awaitingPayment(now), st = { open: open.reduce((s, e) => s + (priceOf(e) || 0), 0), openSessions: open.length };
  const old = store.get('life_status');
  if (!old || old.open !== st.open || old.openSessions !== st.openSessions) rows.push({ ...(old || { id: 'life_status', kind: 'lifestatus' }), ...st });
  return rows;
}

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
    bills.push(...monthRows(now));
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
// The usual length is what the last few times actually took (the most frequent of the last six, ties to the newest),
// so a change of habit shows up within a week instead of being outvoted by months of history.
export function usualMinutes({ title, cat, groupId }) {
  const same = x => (groupId ? x.groupId === groupId : x.title === title), today = todayKey();
  const xs = store.all('entry').filter(e => same(e) && isActive(e) && !e.untimed && e.end > e.start && e.date <= today).sort(byTime).slice(-6);
  if (xs.length) {
    const c = new Map(); xs.forEach((e, i) => { const m = e.end - e.start, v = c.get(m) || { n: 0, last: 0 }; c.set(m, { n: v.n + 1, last: i }); });
    return [...c].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)[0][0];
  }
  const tpl = store.all('template').find(x => !x.deleted && same(x));
  return tpl ? tpl.end - tpl.start : DEFAULT_MINUTES[cat] || 60;
}

// ---------- learning from what was actually done ----------
// A past day counts less the older it is: this week ≈ 1, a month ago ≈ 0.37, three months ago ≈ 0.04.
const ageWeight = (k, now = new Date()) => Math.exp(-Math.max(0, (fromDayKey(dayKey(now)) - fromDayKey(k)) / 864e5) / 28);
// What usually happens on this weekday around this minute, best first. Every past session counts (typed, from the
// weekly pattern, client sessions), weighted by how recent and how close in time it was.
export function guessAt(date, minute, now = new Date()) {
  const wd = fromDayKey(date).getDay(), today = dayKey(now), since = dayKey(addDays(now, -120));
  const taken = entriesOn(date).filter(e => isActive(e) && Math.abs(e.start - minute) < 30);
  const m = new Map();
  for (const e of store.all('entry')) {
    if (!isActive(e) || e.untimed || e.date > today || e.date < since || fromDayKey(e.date).getDay() !== wd) continue;
    const gap = Math.abs(e.start - minute);
    if (gap > 30) continue;
    const key = e.groupId || e.title;
    if (taken.some(x => (x.groupId || x.title) === key)) continue;
    const c = m.get(key) || { title: e.groupId ? (store.get(e.groupId)?.name || e.title) : e.title, cat: e.cat, groupId: e.groupId || null, score: 0, weeks: new Set(), starts: [] };
    c.score += ageWeight(e.date, now) * (1 - gap / 45);
    c.weeks.add(e.date); c.starts.push(e.start);
    m.set(key, c);
  }
  const out = [...m.values()].map(c => ({ ...c, times: c.weeks.size })).sort((a, b) => b.score - a.score);
  // Confident: seen at least twice lately and clearly ahead of the next guess.
  if (out[0]) out[0].sure = out[0].score >= 0.9 && out[0].times >= 2 && (!out[1] || out[0].score >= 2 * out[1].score);
  return out;
}

// Suggestions for the weekly pattern, read from the last four weeks. Nothing changes until the user taps «اعمال».
export function patternTips(now = new Date()) {
  const today = dayKey(now), since = dayKey(addDays(now, -28)), tips = [];
  const live = store.all('template').filter(t => !t.deleted && (!t.until || t.until >= today));
  const weekOf = k => dayKey(addDays(fromDayKey(k), -((fromDayKey(k).getDay() + 1) % 7)));
  // 1) The same thing typed by hand on the same weekday and time in three of the last four weeks.
  const rep = new Map();
  for (const e of store.all('entry')) {
    if (!isActive(e) || e.untimed || e.templateId || e.source === 'import' || e.movedFrom || e.date < since || e.date > today) continue;
    const wd = fromDayKey(e.date).getDay(), slot = Math.round(e.start / 15) * 15, key = `${e.groupId || e.title}|${wd}|${slot}`;
    const r = rep.get(key) || { title: e.title, cat: e.cat, groupId: e.groupId || null, wd, starts: [], weeks: new Set(), last: e.date };
    r.starts.push(e.start); r.weeks.add(weekOf(e.date)); if (e.date > r.last) r.last = e.date;
    rep.set(key, r);
  }
  for (const r of rep.values()) {
    if (r.weeks.size < 3) continue;
    const start = r.starts.sort((a, b) => a - b)[r.starts.length >> 1];
    if (live.some(t => t.days.includes(r.wd) && (t.groupId ? t.groupId === r.groupId : t.title === r.title) && Math.abs(t.start - start) <= 20)) continue;
    const mins = usualMinutes(r);
    tips.push({ key: `add|${r.groupId || r.title}|${r.wd}|${start}`, kind: 'add', title: r.title, cat: r.cat, groupId: r.groupId, wd: r.wd, start, end: Math.min(start + mins, 24 * 60 - 1), after: r.last,
      why: `در ${faDigits(r.weeks.size)} هفته از ۴ هفتهٔ اخیر، همین ساعت را دستی اضافه کرده‌اید.` });
  }
  // 2) A pattern row whose sessions keep being given another length.
  for (const t of live) {
    const xs = store.all('entry').filter(e => e.templateId === t.id && isActive(e) && !e.untimed && e.date <= today && e.date >= since).sort(byTime).slice(-4);
    if (xs.length < 3) continue;
    const c = new Map(); for (const e of xs) c.set(e.end - e.start, (c.get(e.end - e.start) || 0) + 1);
    const [len, n] = [...c].sort((a, b) => b[1] - a[1])[0];
    if (n < 3 || len === t.end - t.start) continue;
    tips.push({ key: `len|${t.id}|${len}`, kind: 'len', tplId: t.id, title: t.title, cat: t.cat, start: t.start, end: Math.min(t.start + len, 24 * 60 - 1), from: t.end - t.start, len,
      why: `${faDigits(n)} جلسه از ۴ جلسهٔ آخر ${faDigits(len)} دقیقه بود، نه ${faDigits(t.end - t.start)} دقیقه.` });
  }
  // 3) A pattern row cancelled or moved the last three times.
  for (const t of live) {
    if (t.until) continue;
    const xs = store.all('entry').filter(e => e.templateId === t.id && e.date <= today).sort(byTime).slice(-3);
    if (xs.length < 3 || xs.some(isActive)) continue;
    tips.push({ key: `end|${t.id}|${xs[2].date}`, kind: 'end', tplId: t.id, title: t.title, cat: t.cat, why: 'سه بار آخر لغو یا جابه‌جا شد.' });
  }
  const off = store.get('tips')?.dismissed || {};
  return tips.filter(x => !off[x.key]);
}

export function learnedPresets(limit = 10, ctx = null) {
  // What was actually done in the last three months (typed, imported or from the weekly pattern), recent weeks first.
  const counts = new Map(), since = dayKey(addDays(new Date(), -90)), today = todayKey();
  for (const e of store.all('entry')) {
    if (e.groupId || e.movedFrom || !isActive(e) || e.date < since || e.date > today) continue;
    const c = counts.get(e.title) || { title: e.title, cat: e.cat, n: 0, fit: 0 };
    c.n += ageWeight(e.date);
    if (ctx && fromDayKey(e.date).getDay() === ctx.weekday) c.fit += e.untimed || Math.abs(e.start - ctx.minute) <= 120 ? 1 : 0;
    counts.set(e.title, c);
  }
  const taken = new Set(ctx ? entriesOn(ctx.date).filter(isActive).map(e => e.title) : []);
  const learned = [...counts.values()].filter(p => !taken.has(p.title)).sort((a, b) => b.fit - a.fit || b.n - a.n);
  learned.forEach((p, i) => { p.suggested = i < 3 && p.fit >= 2; });
  const seen = new Set(learned.map(p => p.title));
  return [...learned, ...DEFAULT_PRESETS.filter(p => !seen.has(p.title))].slice(0, limit);
}
