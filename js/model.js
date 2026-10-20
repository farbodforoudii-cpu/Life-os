// Domain model: entries, categories, dates and derived status.
import { toJalali, MONTHS, WEEKDAYS, faDigits } from './jalali.js';

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

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// A day is stored as its civil date "YYYY-MM-DD" (Gregorian); times as minutes from midnight.
export const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromDayKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const minutesNow = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

// The Iranian week starts on Saturday (getDay() === 6).
export const weekStart = d => addDays(d, -((d.getDay() + 1) % 7));

export const fmtTime = m => faDigits(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
export const weekdayName = d => WEEKDAYS[d.getDay()];
export const jDayMonth = d => { const j = toJalali(d); return `${faDigits(j.jd)} ${MONTHS[j.jm - 1]}`; };
export const jMonthYear = d => { const j = toJalali(d); return `${MONTHS[j.jm - 1]} ${faDigits(j.jy)}`; };

export function newEntry({ date, start, end, title, cat = 'personal', source = 'manual' }) {
  const now = new Date().toISOString();
  return { id: uid(), date, start, end, title, cat, status: 'planned', source, createdAt: now, updatedAt: now, history: [] };
}

export function setStatus(entry, status) {
  if (entry.status === status) return entry;
  entry.history.push({ at: new Date().toISOString(), from: entry.status, to: status });
  entry.status = status;
  entry.updatedAt = new Date().toISOString();
  return entry;
}

// Past planned entries count as done automatically; only cancellations are recorded by hand.
export function liveStatus(entry, now = new Date()) {
  if (entry.status === 'cancelled') return 'cancelled';
  const today = dayKey(now);
  if (entry.date < today) return 'done';
  if (entry.date > today) return 'planned';
  const m = minutesNow(now);
  if (entry.end <= m) return 'done';
  if (entry.start <= m) return 'now';
  return 'planned';
}

export const byStart = (a, b) => a.start - b.start || a.end - b.end;

// Frequent titles first, then the generic defaults that are not already in the list.
export function learnedPresets(entries, limit = 10) {
  const counts = new Map();
  for (const e of entries) {
    if (e.source !== 'manual') continue;
    const c = counts.get(e.title) || { title: e.title, cat: e.cat, n: 0 };
    c.n++;
    counts.set(e.title, c);
  }
  const learned = [...counts.values()].sort((a, b) => b.n - a.n);
  const seen = new Set(learned.map(p => p.title));
  return [...learned, ...DEFAULT_PRESETS.filter(p => !seen.has(p.title))].slice(0, limit);
}
