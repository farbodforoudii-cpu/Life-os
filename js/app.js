import { requestPersistence } from './db.js';
import { store } from './store.js';
import { sync } from './sync.js';
import { faDigits, WEEKDAYS } from './jalali.js';
import {
  CATS, CANCEL_REASONS, WEEK_ORDER, EVEN_DAYS, ODD_DAYS, uid, dayKey, fromDayKey, addDays, minutesNow, todayKey,
  weekStart, fmtTime, toMin, toHHMM, weekdayName, jDayMonth, jMonthYear, daysLabel,
  newEntry, logChange, liveStatus, isActive, byTime, entriesOn, ensureRange, applyTemplate,
  groups, seriesOf, sessionInfo, groupStatus, numberSessions, headcount, lastHeadcount, learnedPresets, isPaid, awaitingPayment,
} from './model.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fa = faDigits;
const state = { tab: 0, dayOff: 0, weekOff: 0, reportRange: 'month', lastNew: null, sheet: null };
const TABS = ['امروز', 'هفته', 'مراجع‌ها', 'گزارش'];
const ICONS = [
  '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M3 15h18"/>',
  '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/>',
  '<path d="M5 20V11M12 20V5M19 20v-6"/>',
];
const GEAR = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const H0 = 7 * 60, H1 = 24 * 60, END_OF_DAY = 24 * 60 - 1;
const pct = m => (Math.min(Math.max(m, H0), H1) - H0) / (H1 - H0) * 100;
const selDate = () => addDays(new Date(), state.dayOff);

// ---------- small shared pieces ----------
function metaLine(e) {
  const bits = [];
  if (e.groupId && isActive(e)) {
    const info = sessionInfo(e);
    bits.push(info && info.n ? `جلسهٔ ${fa(info.n)} از ${fa(info.size)}` : 'خارج از دوره');
  }
  const hc = headcount(e);
  if (hc != null) bits.push(`${fa(hc)} ${e.cat === 'shift' ? 'شاگرد' : 'نفر'}`);
  else if (e.cat === 'shift' && liveStatus(e) === 'done') bits.push('؟ شاگرد');
  if (!e.groupId && !bits.length) bits.push(CATS[e.cat]);
  if (e.status === 'cancelled' && e.reason) bits.push(e.reason);
  if (e.status === 'moved' && e.movedTo) { const t = store.get(e.movedTo); if (t) bits.push(`منتقل شد به ${weekdayName(fromDayKey(t.date))} ${fmtTime(t.start)}`); }
  if (e.note) bits.push(e.note);
  if (e.cat === 'client' && isActive(e) && liveStatus(e) === 'done' && !isPaid(e)) bits.push('منتظر پرداخت');
  return bits.join('، ');
}

function itemHTML(e, compact = false) {
  const st = liveStatus(e);
  const right = {
    done: '<span class="st">✓</span>',
    now: '<span class="st" style="color:var(--sage)"><i class="pulse"></i>الان</span>',
    cancelled: '<span class="st">لغو</span>',
    moved: '<span class="st">جابه‌جا</span>',
    planned: '',
  }[st];
  return `<button class="item ${st === 'moved' ? 'cancelled' : st} ${compact ? 'compact' : ''} ${e.id === state.lastNew ? 'new' : ''}" data-open="${e.id}">
    <i class="dot" style="background:var(--c-${e.cat})"></i>
    <span class="time">${fmtTime(e.start)}<small>${fmtTime(e.end)}</small></span>
    <span class="txt"><span class="title">${esc(e.title)}</span>${compact ? '' : `<span class="sub">${esc(metaLine(e))}</span>`}</span>${compact ? '' : right}</button>`;
}

const empty = (title, body) => `<div class="card empty"><b>${title}</b>${body}</div>`;

// ---------- screens ----------
function today() {
  const now = new Date(), d = selDate(), k = dayKey(d), isToday = state.dayOff === 0;
  const items = entriesOn(k), m = minutesNow(now);
  const hero = isToday && items.find(e => liveStatus(e, now) === 'now');
  const next = isToday && items.find(e => isActive(e) && e.start > m);
  const strip = Array.from({ length: 9 }, (_, i) => i - 1).map(off => {
    const dd = addDays(now, off);
    const n = entriesOn(dayKey(dd)).filter(isActive).length;
    return `<button class="day ${off === state.dayOff ? 'sel' : ''} ${off === 0 ? 'is-today' : ''}" data-day="${off}"><span>${off === 0 ? 'امروز' : off === 1 ? 'فردا' : off === -1 ? 'دیروز' : weekdayName(dd)}</span><b>${fa(fromJ(dd))}</b><i>${n ? fa(n) : ''}</i></button>`;
  }).join('');
  const heroH = hero ? `<div class="card hero">
      <div class="row"><div><div class="eyebrow" style="color:var(--sage);display:flex;align-items:center;gap:6px"><i class="pulse"></i>الان، تا ${fmtTime(hero.end)}</div>
        <div class="name">${esc(hero.title)}</div><div class="eyebrow">${esc(metaLine(hero))}</div></div>
      ${next ? `<div style="text-align:left"><div class="eyebrow">بعدی</div><div style="font-size:16px;font-weight:700">${esc(next.title)}</div><div class="eyebrow">${fmtTime(next.start)}</div></div>` : ''}</div>
      <div class="track"><i data-w="${Math.round((m - hero.start) / (hero.end - hero.start) * 100)}"></i></div></div>` : '';
  const nc = items.filter(e => !isActive(e)).length;
  const label = isToday ? 'امروز' : state.dayOff === 1 ? 'فردا' : state.dayOff === -1 ? 'دیروز' : '';
  const side = isToday ? entriesOn(dayKey(addDays(now, 1))) : null;
  return `<div class="head"><div><div class="eyebrow">${label ? label + '، ' : ''}${jMonthYear(d)}</div><h1 class="big">${weekdayName(d)} ${jDayMonth(d)}</h1></div>
      <div style="display:flex;align-items:center;gap:10px"><span class="eyebrow" style="text-align:left">${items.length ? `${fa(items.length)} برنامه${nc ? `، ${fa(nc)} لغو` : ''}` : ''}</span>
      <button class="icon-btn" data-act="settings" aria-label="تنظیمات و همگام‌سازی">${GEAR}<i class="sync-dot ${sync.state.status}"></i></button></div></div>
    <div class="days">${strip}</div>
    <div class="cols"><div class="main list stagger">${heroH}${isToday ? dayPath(items, now) : ''}${items.length ? items.map(e => itemHTML(e)).join('') : empty(isToday ? 'امروز برنامه‌ای نیست' : 'برای این روز هنوز چیزی نیست', 'با + اضافه کن. برای برنامهٔ ثابت، از تب «هفته» ← «الگوی هفته» استفاده کن.')}</div>
      ${side ? `<aside class="side"><div class="eyebrow" style="margin-bottom:8px">فردا، ${weekdayName(addDays(now, 1))} ${jDayMonth(addDays(now, 1))}</div>
        <div class="list stagger" style="opacity:.85">${side.length ? side.map(e => itemHTML(e, true)).join('') : '<div class="card empty" style="padding:18px">هنوز چیزی نیست</div>'}</div></aside>` : ''}</div>`;
}
const fromJ = d => jDayMonth(d).split(' ')[0];

// The day as a path from 7 in the morning (right) to midnight (left). It draws itself up to now and each
// stop lights up as the line reaches it: done ones get a tick, the current one pulses, the rest wait hollow.
function dayPath(items, now) {
  if (!items.some(isActive)) return '';
  const W = 340, m = minutesNow(now), X = min => W - 16 - pct(min) / 100 * (W - 32), Y = x => 40 + 11 * Math.sin((W - x) / W * Math.PI * 2.4);
  let d = ''; for (let x = W - 16; x >= 15; x -= 4) d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${Y(x).toFixed(1)}`;
  const live = items.filter(isActive), done = live.filter(e => liveStatus(e, now) === 'done').length;
  const stops = items.map(e => {
    const st0 = liveStatus(e, now), st = st0 === 'moved' ? 'cancelled' : st0, x = X(e.start), y = Y(x), delay = (pct(e.start) / 100 * 1.4).toFixed(2);
    const mark = st === 'done' ? `<path class="dp-tick" d="M${(x - 3.6).toFixed(1)} ${y.toFixed(1)}l2.6 2.6 5-5.2" pathLength="1"/>`
      : st === 'cancelled' ? `<path class="dp-x" d="M${(x - 3).toFixed(1)} ${(y - 3).toFixed(1)}l6 6m0-6l-6 6"/>` : '';
    return `<g class="dp-stop ${st}" style="--d:${delay}s;--c:var(--c-${e.cat})"><circle class="dp-ring" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8"/><circle class="dp-node" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8"/>${mark}<title>${esc(e.title)}، ${fmtTime(e.start)}</title></g>`;
  }).join('');
  const nx = X(m), np = pct(m);
  const ticks = [7, 12, 17, 22].map(h => `<text x="${X(h * 60).toFixed(1)}" y="78" text-anchor="middle">${faDigits(h)}</text>`).join('');
  return `<div class="card dpath"><div class="dp-head"><b>مسیر امروز</b><span>${faDigits(done)} از ${faDigits(live.length)} انجام شد</span></div>
    <svg viewBox="0 0 ${W} 84" class="dp-svg"><path class="dp-base" d="${d}"/><path class="dp-prog" d="${d}" pathLength="100" style="--p:${np.toFixed(1)}"/>
      ${stops}<g class="dp-now" style="--d:${(np / 100 * 1.4).toFixed(2)}s"><circle cx="${nx.toFixed(1)}" cy="${Y(nx).toFixed(1)}" r="4"/></g>${ticks}</svg></div>`;
}

function week() {
  const now = new Date(), s = addDays(weekStart(now), state.weekOff * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(s, i));
  const todayK = dayKey(now), m = minutesNow(now);
  const all = days.flatMap(d => entriesOn(dayKey(d)));
  const ok = c => all.filter(e => e.cat === c && isActive(e)).length;
  const sum = `${fa(ok('client'))} جلسه، ${fa(ok('shift'))} شیفت، ${fa(ok('uni'))} کلاس، ${fa(all.filter(e => !isActive(e)).length)} لغو`;
  const label = state.weekOff === 0 ? 'این هفته' : state.weekOff === -1 ? 'هفتهٔ قبل' : state.weekOff === 1 ? 'هفتهٔ بعد' : 'هفته';

  let ax = ''; for (let h = 7; h <= 24; h++) ax += `<span style="right:${pct(h * 60)}%">${fa(h)}</span>`;
  let grid = ''; for (let h = 8; h < 24; h++) grid += `<i class="gridline" style="right:${pct(h * 60)}%"></i>`;
  const table = days.map((d, ri) => {
    const k = dayKey(d), items = entriesOn(k), isT = k === todayK;
    const blocks = items.map(e => `<button class="blk ${isActive(e) ? '' : 'cancelled'}" data-open="${e.id}" title="${esc(e.title)}، ${fmtTime(e.start)} تا ${fmtTime(e.end)}"
      style="--mark:var(--c-${e.cat});background:var(--t-${e.cat});right:calc(${pct(e.start)}% + 2px);width:calc(${pct(e.end) - pct(e.start)}% - 4px);animation-delay:${ri * 45}ms"><span>${esc(e.title)}</span><small>${fmtTime(e.start)}${headcount(e) != null ? `، ${fa(headcount(e))} نفر` : ''}</small></button>`).join('');
    return `<div class="wk-row ${isT ? 'today' : ''}"><div class="wk-day"><b>${weekdayName(d)}</b><span>${jDayMonth(d)}${isT ? '، امروز' : ''}</span></div>
      <div class="wk-track">${grid}${items.length ? blocks : '<div class="free">آزاد</div>'}${isT ? `<i class="nowline" style="right:${pct(m)}%"></i>` : ''}</div></div>`;
  }).join('');

  let mwa = ''; [7, 11, 15, 19, 24].forEach(h => mwa += `<span style="position:absolute;right:${pct(h * 60)}%;transform:translateX(50%)">${fa(h)}</span>`);
  const mini = days.map((d, ri) => {
    const k = dayKey(d), items = entriesOn(k), isT = k === todayK;
    return `<button class="mw-row ${isT ? 'today' : ''}" data-mw="${ri}"><span class="mw-day"><b>${weekdayName(d)}</b><span>${jDayMonth(d)}</span></span>
      <span class="mw-track">${items.map(e => `<i class="mw-seg" style="right:${pct(e.start)}%;width:calc(${pct(e.end) - pct(e.start)}% - 2px);background:var(--c-${e.cat});${isActive(e) ? '' : 'opacity:.25;'}animation-delay:${ri * 50}ms"></i>`).join('')}${isT ? `<i class="nowline" style="right:${pct(m)}%"></i>` : ''}</span>
      <span class="mw-n">${items.length ? fa(items.length) : 'آزاد'}</span></button>
      <div class="mw-open" data-mwopen="${ri}"><div>${items.map(e => `<button class="mw-li ${isActive(e) ? '' : 'cancelled'}" data-open="${e.id}"><i class="dot" style="background:var(--c-${e.cat})"></i><b>${fmtTime(e.start)}</b><span>${esc(e.title)}</span></button>`).join('')}<div style="height:6px"></div></div></div>`;
  }).join('');

  return `<div class="head"><div><div class="eyebrow">${jDayMonth(days[0])} تا ${jDayMonth(days[6])}</div><h1 class="big">${label}</h1></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px"><div class="wnav"><button data-wk="-1" aria-label="هفتهٔ قبل">→</button><button data-wk="0">امروز</button><button data-wk="1" aria-label="هفتهٔ بعد">←</button><button data-act="templates" class="accent">الگوی هفته</button></div><div class="eyebrow">${sum}</div></div></div>
    <div class="wide-only"><div class="card wk"><div class="axis">${ax}</div>${table}</div>
      <div class="legend">${Object.entries(CATS).map(([c, l]) => `<span><i style="background:var(--c-${c})"></i>${l}</span>`).join('')}</div></div>
    <div class="narrow-only"><div class="eyebrow" style="font-weight:500;font-size:12px;margin:-8px 0 10px">روی هر روز بزن تا باز شود؛ با چرخاندن گوشی، جدول کامل نمایش داده می‌شود.</div>
      <div class="mw-axis"><span style="width:62px"></span><span style="position:relative;flex:1;height:14px">${mwa}</span><span style="width:30px"></span></div>
      <div class="card mw">${mini}</div></div>
    ${store.all('template').length ? '' : `<div class="card empty" style="margin-top:14px"><b>هنوز الگوی هفته نداری</b>«الگوی هفته» را بزن و برنامهٔ ثابتت را یک بار وارد کن؛ از آن به بعد هر هفته خودکار پر می‌شود.</div>`}`;
}

function clients() {
  const list = groups();
  const cards = list.map(g => {
    const st = groupStatus(g.id);
    const size = st.current ? st.current.size : 0;
    const warn = st.current && st.left <= 1;
    const unpaid = st.current && !st.current.paid;
    return `<button class="cl ${warn ? 'warn' : ''}" data-act="group" data-id="${g.id}">
      <div class="cl-top"><b>${esc(g.name)}</b><span>${st.current ? `${fa(st.done)}/${fa(size)}` : 'بدون دوره'}</span></div>
      ${st.current ? `<div class="prog">${Array.from({ length: size }, (_, i) => `<i class="${i < st.done ? 'f' : ''}"></i>`).join('')}</div>` : ''}
      <div class="cl-sub"><span>${!st.current ? 'دوره تعریف نشده' : st.left <= 0 ? 'دوره تمام شد؛ وقت تمدید' : warn ? '۱ جلسه مانده؛ وقت تمدید' : `${fa(st.left)} جلسه مانده`}${unpaid ? '، <em class="unpaid">پرداخت نشده</em>' : ''}${st.outside ? `، ${fa(st.outside)} جلسه خارج از دوره` : ''}</span>
      <span>${st.next ? `بعدی: ${weekdayName(fromDayKey(st.next.date))} ${fmtTime(st.next.start)}` : ''}</span></div>
      <div class="cl-sub"><span>${(g.members || []).length ? `${fa(g.members.length)} نفر: ${esc(g.members.join('، '))}` : ''}</span><span>${g.place ? esc(g.place) : ''}</span></div></button>`;
  }).join('');
  const waiting = awaitingPayment();
  return `<div class="head"><div><div class="eyebrow">${list.length ? `${fa(list.length)} گروه فعال` : 'دوره‌ها و جلسه‌ها'}${waiting.length ? `، <span style="color:var(--burg)">${fa(waiting.length)} جلسه منتظر پرداخت</span>` : ''}</div><h1 class="big">مراجع‌ها</h1></div>
      <button class="pill-btn" data-act="group-new">+ مراجع جدید</button></div>
    ${list.length ? `<div class="cl-grid stagger">${cards}</div>` : empty('هنوز مراجعی ثبت نشده', '«مراجع جدید» را بزن: نام گروه، اعضا و تعداد جلسه‌های دوره. شمارهٔ جلسه‌ها از آن به بعد خودکار حساب می‌شود.')}`;
}

function report() {
  const now = new Date(), tk = dayKey(now);
  let from, title;
  if (state.reportRange === 'week') { from = dayKey(weekStart(now)); title = 'این هفته'; }
  else if (state.reportRange === 'month') { const j = jMonthYear(now); from = null; title = j; }
  else { from = null; title = 'امسال'; }
  const inRange = e => {
    if (e.date > tk) return false;
    if (state.reportRange === 'week') return e.date >= from;
    if (state.reportRange === 'month') return jMonthYear(fromDayKey(e.date)) === title;
    return jMonthYear(fromDayKey(e.date)).split(' ')[1] === jMonthYear(now).split(' ')[1];
  };
  const all = store.all('entry').filter(inRange);
  const done = all.filter(e => liveStatus(e, now) === 'done' || liveStatus(e, now) === 'now');
  const cancelled = all.filter(e => e.status === 'cancelled');
  const cnt = c => done.filter(e => e.cat === c).length;
  const hours = c => done.filter(e => e.cat === c).reduce((s, e) => s + (e.end - e.start), 0) / 60;
  const fh = h => fa(Math.round(h * 10) / 10).replace('.', '٫');
  const shiftTitles = [...new Set(done.filter(e => e.cat === 'shift').map(e => e.title))];
  const perShift = shiftTitles.map(t => { const xs = done.filter(e => e.cat === 'shift' && e.title === t); const ppl = xs.reduce((s, e) => s + (e.headcount || 0), 0); return { t, n: xs.length, ppl }; });
  const perGroup = groups().map(g => ({ g, n: done.filter(e => e.groupId === g.id).length, c: cancelled.filter(e => e.groupId === g.id).length })).filter(x => x.n || x.c);
  const places = [...done.filter(e => e.cat === 'personal').reduce((m, e) => m.set(e.title, (m.get(e.title) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const seg = `<div class="seg">${[['week', 'هفته'], ['month', 'ماه'], ['year', 'سال']].map(([v, l]) => `<button class="${state.reportRange === v ? 'on' : ''}" data-range="${v}">${l}</button>`).join('')}</div>`;
  const head = `<div class="head"><div><div class="eyebrow">تا امروز</div><h1 class="big">گزارش ${title}</h1></div>${seg}</div>`;
  if (!all.length) return head + empty('هنوز داده‌ای برای این بازه نیست', 'گزارش فقط از ثبت‌های واقعی ساخته می‌شود.');
  const cats = Object.keys(CATS);
  const totalH = cats.reduce((s, c) => s + hours(c), 0);
  const N = reportNews(done, cancelled, all, perGroup, hours, fh);
  return head + `<div class="grid4 stagger">
      <div class="w"><h3>جلسهٔ مراجع</h3><div class="num" data-count="${cnt('client')}">۰</div><div class="note">${fh(hours('client'))} ساعت</div></div>
      <div class="w"><h3>شیفت</h3><div class="num" data-count="${cnt('shift')}">۰</div><div class="note">${perShift.map(x => `${esc(x.t)} ${fa(x.n)}`).join('، ') || '—'}</div></div>
      <div class="w"><h3>کلاس دانشگاه</h3><div class="num" data-count="${cnt('uni')}">۰</div><div class="note">${fh(hours('uni'))} ساعت</div></div>
      <div class="w"><h3>لغوها</h3><div class="num" data-count="${cancelled.length}" style="color:var(--burg)">۰</div><div class="note">${fa(cancelled.filter(e => e.cat === 'client').length)} مراجع، ${fa(cancelled.filter(e => e.cat !== 'client').length)} بقیه</div></div></div>
    ${N.length ? `<div class="eyebrow" style="margin:20px 2px 10px">خبرهای این بازه</div><div class="feed stagger">${N.map(x => `<div class="news"><span class="news-k ${x.tone || ''}">${x.k}</span><b>${esc(x.t)}</b><p>${esc(x.d)}</p></div>`).join('')}</div>` : ''}
    <div class="grid2">
      <div class="w"><h3>زمان کجا رفت</h3>
        <div class="stack" role="img" aria-label="${cats.map(c => `${CATS[c]} ${fh(hours(c))} ساعت`).join('، ')}">${cats.filter(c => hours(c) > 0).map((c, i) => `<div title="${CATS[c]}، ${fh(hours(c))} ساعت" style="flex:${hours(c)};background:var(--c-${c});animation-delay:${i * .1}s"></div>`).join('')}</div>
        <div class="lg2" style="margin-top:6px">${cats.map(c => `<span><i style="background:var(--c-${c})"></i>${CATS[c]}<b>${fh(hours(c))} ساعت</b></span>`).join('')}</div>
        <div class="note">مجموع ${fh(totalH)} ساعت ثبت‌شده</div></div>
      <div class="w"><h3>جلسه‌ها به تفکیک مراجع</h3>
        ${perGroup.length ? perGroup.map(x => `<div class="rrow"><span>${esc(x.g.name)}</span><b>${fa(x.n)}</b>${x.c ? `<em>${fa(x.c)} لغو</em>` : ''}</div>`).join('') : '<div class="note">—</div>'}</div>
      <div class="w"><h3>شاگردهای شیفت‌ها</h3>
        ${perShift.length ? perShift.map(x => `<div class="rrow"><span>${esc(x.t)}</span><b>${fa(x.ppl)} نفر</b><em>${fa(x.n)} شیفت${x.n ? `، میانگین ${fa(Math.round(x.ppl / x.n * 10) / 10).replace('.', '٫')}` : ''}</em></div>`).join('') : '<div class="note">—</div>'}</div>
      <div class="w"><h3>رفت‌وآمدها و کارهای شخصی</h3>
        ${places.length ? `<div class="chips">${places.map(([t, n]) => `<span class="chip" style="min-height:34px;padding:6px 12px;font-size:13px">${esc(t)}، ${fa(n)}</span>`).join('')}</div>` : '<div class="note">—</div>'}</div>
    </div>`;
}

// The range told as short news; every number says where it comes from.
function reportNews(done, cancelled, all, perGroup, hours, fh) {
  const N = [], wait = awaitingPayment().sort((a, b) => a.date.localeCompare(b.date));
  if (wait.length) N.push({ k: 'پرداخت', t: `${fa(wait.length)} جلسه منتظر پرداخت`, d: `قدیمی‌ترین: ${wait[0].title}، ${weekdayName(fromDayKey(wait[0].date))} ${jDayMonth(fromDayKey(wait[0].date))}.`, tone: 'r' });
  else if (done.some(e => e.cat === 'client')) N.push({ k: 'پرداخت', t: 'همهٔ جلسه‌ها تسویه شده', d: 'هیچ جلسهٔ تمام‌شده‌ای منتظر پرداخت نیست.', tone: 'g' });
  const top = perGroup.slice().sort((a, b) => b.n - a.n)[0];
  if (top && perGroup.length > 1) N.push({ k: 'مراجع', t: `${top.g.name}، بیشترین جلسه با ${fa(top.n)} بار`, d: `از ${fa(perGroup.length)} مراجع در این بازه.` });
  const wd = new Map(); for (const e of done.filter(e => e.cat === 'client' || e.cat === 'shift')) { const w = weekdayName(fromDayKey(e.date)); wd.set(w, (wd.get(w) || 0) + (e.end - e.start) / 60); }
  const busy = [...wd].sort((a, b) => b[1] - a[1])[0];
  if (busy && wd.size > 1) N.push({ k: 'زمان', t: `پرکارترین روز: ${busy[0]}‌ها`, d: `جمعاً ${fh(busy[1])} ساعت جلسه و شیفت.` });
  const work = hours('client') + hours('shift'), pers = hours('personal');
  if (work) N.push({ k: 'تعادل', t: `${fh(pers)} ساعت برای خودت`, d: `در برابر ${fh(work)} ساعت کار (جلسه + شیفت).` });
  if (cancelled.length >= 2) N.push({ k: 'لغو', t: `${fa(cancelled.length)} لغو`, d: `${fa(Math.round(cancelled.length / all.length * 100))}٪ برنامه‌ها = لغو ÷ همهٔ برنامه‌های این بازه.`, tone: 'r' });
  return N;
}

const SCREENS = [today, week, clients, report];

// ---------- render ----------
async function render(animate = true) {
  // Template sessions are created on demand for whatever range the screens show.
  const now = new Date();
  const ws = addDays(weekStart(now), state.weekOff * 7);
  const from = [dayKey(addDays(now, -1)), dayKey(ws)].sort()[0];
  const to = [dayKey(addDays(now, 8)), dayKey(addDays(ws, 6))].sort()[1];
  await ensureRange(from, to);
  const app = $('#app');
  app.innerHTML = `<div class="${animate ? 'scr' : ''}">${SCREENS[state.tab]()}</div>`;
  $('#fab').hidden = state.tab > 1;
  document.querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('on', i === state.tab));
  movePill();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    app.querySelectorAll('.hero .track i').forEach(e => { if (!animate) e.style.transition = 'none'; e.style.width = e.dataset.w + '%'; });
    app.querySelectorAll('[data-count]').forEach(el => animate ? countUp(el) : (el.textContent = fa(el.dataset.count)));
    const sel = app.querySelector('.day.sel'); if (sel && animate) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
  }));
}

function renderTabs() {
  $('#tabs').innerHTML = '<i class="pill"></i>' + TABS.map((l, i) =>
    `<button class="tab" data-tab="${i}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[i]}</svg>${l}</button>`).join('');
}

function movePill() {
  const bar = $('#tabs'), btn = bar.querySelectorAll('.tab')[state.tab], p = bar.querySelector('.pill');
  if (!btn || !p) return;
  const br = bar.getBoundingClientRect(), r = btn.getBoundingClientRect();
  p.style.right = (br.right - r.right) + 'px';
  p.style.width = r.width + 'px';
}

// Numbers roll in like an odometer, each digit on its own strip.
const DIG = '۰۱۲۳۴۵۶۷۸۹';
function countUp(el) {
  const text = fa(+el.dataset.count);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }
  el.innerHTML = [...text].map(ch => `<span class="odo"><span class="odo-w">${ch}</span><span class="odo-strip" data-d="${DIG.indexOf(ch)}">${[...DIG].map(d => `<span>${d}</span>`).join('')}</span></span>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('.odo-strip').forEach((st, i) => {
    st.style.transitionDelay = `${150 + i * 70}ms`; st.style.transform = `translateY(${-st.dataset.d * 10}%)`;
  })));
}

// Saved: a black pill grows from the top, draws a tick, says what happened, then shows a second line.
function island(a, as, right, b, bv) {
  document.querySelector('.island')?.remove();
  const el = document.createElement('div');
  el.className = 'island';
  el.innerHTML = `<svg class="is-tick" viewBox="0 0 52 52"><circle cx="26" cy="26" r="23" pathLength="1"/><path d="M16 27l7 7 14-15" pathLength="1"/></svg>
    <div class="is-txt"><div class="is-a"><b>${esc(a)}</b><small>${esc(as)}</small></div><div class="is-b"><small>${esc(b)}</small><b>${esc(bv)}</b></div></div><b class="is-r">${esc(right)}</b>`;
  document.body.appendChild(el);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  setTimeout(() => el.classList.add('two'), reduced ? 0 : 1300);
  setTimeout(() => el.classList.add('close'), 3400);
  setTimeout(() => el.remove(), 4000);
  el.onclick = () => el.classList.add('close');
}

// ---------- toast ----------
let toastTimer;
function toast(msg, undo) {
  const t = $('#toast');
  t.querySelector('.msg').textContent = msg;
  t.querySelector('.undo').hidden = !undo;
  t._undo = undo;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 3500);
}

// ---------- sheets ----------
// One bottom sheet (a centred card on iPad) whose content depends on what was opened.
function openSheet(kind, data = {}) {
  state.sheet = { kind, ...data };
  renderSheet();
  $('#sheet').classList.add('on');
  $('#scrim').classList.add('on');
  $('#fab').classList.toggle('open', kind === 'add');
}
function closeSheet() {
  state.sheet = null;
  $('#sheet').classList.remove('on');
  $('#scrim').classList.remove('on');
  $('#fab').classList.remove('open');
}
const sheetHead = (title, extra = '') => `<div class="grab"></div><div class="sh-head"><b>${title}</b><span style="display:flex;align-items:center;gap:10px">${extra}<button class="close" data-act="close" aria-label="بستن"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span></div>`;
const dayChips = (sel, attr = 'data-pickday') => `<div class="chips">${Array.from({ length: 8 }, (_, i) => i - 1).map(off => { const d = addDays(new Date(), off); return `<button class="chip ${off === sel ? 'sel' : ''}" ${attr}="${off}">${off === 0 ? 'امروز' : off === 1 ? 'فردا' : off === -1 ? 'دیروز' : weekdayName(d)} <span class="soft">${jDayMonth(d)}</span></button>`; }).join('')}</div>`;
const catChips = sel => `<div class="chips">${Object.entries(CATS).map(([c, l]) => `<button class="chip ${sel === c ? 'sel' : ''}" data-pickcat="${c}"><i class="dot" style="background:var(--c-${c})"></i>${l}</button>`).join('')}</div>`;
const timeInputs = (s, e) => `<div class="times"><label>شروع<input type="time" id="fStart" value="${toHHMM(s)}"></label><label>پایان<input type="time" id="fEnd" value="${toHHMM(e)}"></label></div>`;

const SHEETS = {
  add(s) {
    const now = new Date(), isToday = s.dayOff === 0, m = minutesNow(now);
    const d = addDays(now, s.dayOff);
    const start = s.start ?? (isToday ? Math.floor(m / 5) * 5 : 9 * 60);
    const end = s.end ?? Math.min(start + 60, END_OF_DAY);
    const gs = groups();
    return sheetHead('افزودن', `<span class="eyebrow">${isToday ? `الان ${fmtTime(m)}` : ''}</span>`) + `
      ${dayChips(s.dayOff)}
      ${timeInputs(start, end)}
      <div class="eyebrow">یه لمس = ثبت</div>
      <div class="chips">${learnedPresets().map(p => `<button class="chip" data-quick="${esc(p.title)}" data-cat="${p.cat}"><i class="dot" style="background:var(--c-${p.cat})"></i>${esc(p.title)}</button>`).join('')}</div>
      ${gs.length ? `<div class="eyebrow">جلسهٔ مراجع (مثلاً جبرانی)</div><div class="chips">${gs.map(g => `<button class="chip" data-quickgroup="${g.id}"><i class="dot" style="background:var(--c-client)"></i>${esc(g.name)}</button>`).join('')}</div>` : ''}
      <div class="eyebrow">چیز جدید</div>
      ${catChips(s.cat || 'personal')}
      <form class="inp" data-form="typed"><label for="typedIn" class="sr">عنوان</label><input id="typedIn" type="text" placeholder="مثلاً «دندانپزشکی» یا «خونه دیباجی»" autocomplete="off" enterkeyhint="done"><button type="submit">ثبت</button></form>`;
  },

  item(s) {
    const e = store.get(s.id);
    if (!e) return sheetHead('پیدا نشد');
    const st = liveStatus(e), d = fromDayKey(e.date);
    const g = e.groupId && store.get(e.groupId);
    const info = g ? sessionInfo(e) : null;
    const hc = headcount(e);
    const absent = new Set(e.absent || []);
    const stateLine = { done: 'انجام شد', now: 'الان در جریانه', planned: 'برنامه‌ریزی‌شده', cancelled: `لغو شد${e.reason ? `، ${e.reason}` : ''}`, moved: 'جابه‌جا شد' }[st];
    let body = `<div class="it-head"><i class="dot" style="background:var(--c-${e.cat});width:12px;height:12px;border-radius:6px"></i>
      <div><div class="it-title">${esc(e.title)}</div><div class="eyebrow">${weekdayName(d)} ${jDayMonth(d)}، ${fmtTime(e.start)} تا ${fmtTime(e.end)}، ${stateLine}</div>
      ${info ? `<div class="eyebrow" style="color:var(--sage)">${info.n ? `جلسهٔ ${fa(info.n)} از ${fa(info.size)}` : 'خارج از دوره؛ دورهٔ جدید لازم است'}</div>` : ''}</div></div>`;
    if (g && g.members && g.members.length) {
      body += `<div class="eyebrow">حاضرها (${fa(hc)} از ${fa(g.members.length)})؛ روی غایب‌ها بزن</div>
        <div class="chips">${g.members.map(n => `<button class="chip ${absent.has(n) ? 'off' : 'sel'}" data-absent="${esc(n)}">${esc(n)}</button>`).join('')}</div>`;
    } else if (e.cat === 'shift' || e.cat === 'client') {
      const guess = hc ?? lastHeadcount(e.title, e.date) ?? (e.templateId && store.get(e.templateId)?.headcount) ?? null;
      body += `<div class="eyebrow">تعداد ${e.cat === 'shift' ? 'شاگردها' : 'نفرات'}${hc == null && guess != null ? ` (دفعهٔ قبل ${fa(guess)})` : ''}</div>
        <div class="stepper"><button data-hc="-1" aria-label="کمتر">−</button><b>${hc == null ? '؟' : fa(hc)}</b><button data-hc="1" aria-label="بیشتر">+</button>${hc == null && guess != null ? `<button class="chip" data-hcset="${guess}">همون ${fa(guess)}</button>` : ''}</div>`;
    }
    if (e.cat === 'client' && isActive(e) && st === 'done') {
      const series = info && info.series;
      body += series && series.paid ? '<p class="hint">مبلغ این جلسه با دوره پرداخت شده است.</p>'
        : `<button class="wide-btn ${e.paidAt ? 'ghost' : ''}" data-act="toggle-paid">${e.paidAt ? 'پرداخت ثبت شده؛ برداشتن' : 'مبلغ این جلسه رسید'}</button>`;
    }
    if (isActive(e)) {
      body += `<div class="eyebrow">لغو شد؟ دلیلش را انتخاب کن</div>
        <div class="chips">${CANCEL_REASONS.filter(r => e.cat === 'uni' ? r !== 'مراجع نیومد' && r !== 'مراجع خبر داد' : r !== 'استاد نیومد').map(r => `<button class="chip cancel-chip" data-cancel="${r}">${r}</button>`).join('')}<button class="chip cancel-chip" data-cancel="">بدون دلیل</button></div>
        <div class="eyebrow">جابه‌جا شد؟ روز جدید</div>${dayChips(null, 'data-moveday')}`;
    } else {
      body += `<button class="wide-btn" data-act="restore">بازگرداندن به برنامه</button>`;
      if (e.movedTo) body += `<button class="wide-btn ghost" data-open="${e.movedTo}">دیدن جلسهٔ جدید</button>`;
    }
    body += `<details class="more"><summary>ویرایش</summary>
      <label class="fld">عنوان<input id="fTitle" value="${esc(e.title)}"></label>
      ${timeInputs(e.start, e.end)}
      ${catChips(e.cat)}
      <label class="fld">یادداشت<input id="fNote" value="${esc(e.note || '')}" placeholder="اختیاری"></label>
      <button class="wide-btn" data-act="save-item">ذخیره</button>
      <button class="wide-btn danger" data-act="delete-item">پاک کردن</button></details>`;
    return sheetHead(CATS[e.cat]) + body;
  },

  templates() {
    const tpls = store.all('template').sort((a, b) => a.start - b.start || daysLabel(a.days).localeCompare(daysLabel(b.days), 'fa'));
    const rows = WEEK_ORDER.map(dn => {
      const xs = tpls.filter(t => t.days.includes(dn));
      return `<div class="tp-day"><b>${WEEKDAYS[dn]}</b>${xs.length ? xs.map(t => `<button class="tp-row" data-act="tpl" data-id="${t.id}"><i class="dot" style="background:var(--c-${t.cat})"></i><span class="tp-time">${fmtTime(t.start)}–${fmtTime(t.end)}</span><span>${esc(t.title)}</span>${t.headcount ? `<em>${fa(t.headcount)} نفر</em>` : ''}</button>`).join('') : '<span class="soft" style="font-size:13px">آزاد</span>'}</div>`;
    }).join('');
    return sheetHead('الگوی هفته', '<button class="pill-btn" data-act="tpl-new">+ ردیف</button>') +
      `<p class="hint">برنامهٔ ثابت را یک بار این‌جا وارد کن. هر ردیف می‌تواند چند روز داشته باشد (مثلاً زوج‌ها ۷:۳۰). از امروز به بعد هر هفته خودکار پر می‌شود؛ روزهای گذشته دست نمی‌خورند.</p>${rows}`;
  },

  tpl(s) {
    const t = s.id ? store.get(s.id) : { days: s.days || EVEN_DAYS, start: 7 * 60 + 30, end: 9 * 60, title: '', cat: 'client', groupId: null, headcount: null };
    const draft = state.sheet.draft || (state.sheet.draft = { days: [...t.days], cat: t.cat, groupId: t.groupId || null });
    const gs = groups();
    return sheetHead(s.id ? 'ویرایش ردیف' : 'ردیف جدید') + `
      <div class="eyebrow">روزها</div>
      <div class="chips"><button class="chip ${sameDays(draft.days, EVEN_DAYS) ? 'sel' : ''}" data-days="even">زوج (شنبه، دوشنبه، چهارشنبه)</button><button class="chip ${sameDays(draft.days, ODD_DAYS) ? 'sel' : ''}" data-days="odd">فرد (یکشنبه، سه‌شنبه، پنجشنبه)</button></div>
      <div class="chips">${WEEK_ORDER.map(d => `<button class="chip small ${draft.days.includes(d) ? 'sel' : ''}" data-dayt="${d}">${WEEKDAYS[d]}</button>`).join('')}</div>
      ${timeInputs(t.start, t.end)}
      <div class="eyebrow">نوع</div>${catChips(draft.cat)}
      ${draft.cat === 'client' ? `<div class="eyebrow">کدوم مراجع؟</div><div class="chips">${gs.map(g => `<button class="chip ${draft.groupId === g.id ? 'sel' : ''}" data-tplgroup="${g.id}">${esc(g.name)}</button>`).join('')}<button class="chip" data-act="group-new" data-back="tpl">+ مراجع جدید</button></div>` : ''}
      <label class="fld">عنوان${draft.cat === 'client' ? ' (اگه خالی بمونه، اسم مراجع)' : ''}<input id="fTitle" value="${esc(t.title)}" placeholder="${draft.cat === 'shift' ? 'مثلاً گردان فرشته' : draft.cat === 'uni' ? 'مثلاً تفسیر قرآن' : ''}"></label>
      ${draft.cat === 'shift' ? `<label class="fld">تعداد معمول شاگردها (اختیاری)<input id="fHead" type="number" inputmode="numeric" min="0" value="${t.headcount ?? ''}"></label>` : ''}
      <button class="wide-btn" data-act="save-tpl">ذخیره</button>
      ${s.id ? '<button class="wide-btn danger" data-act="delete-tpl">حذف از الگو (از امروز به بعد)</button>' : ''}`;
  },

  group(s) {
    const g = store.get(s.id);
    if (!g) return sheetHead('پیدا نشد');
    const st = groupStatus(g.id);
    const series = seriesOf(g.id).reverse();
    const nums = numberSessions(g.id);
    const hist = store.all('entry').filter(e => e.groupId === g.id && e.date <= todayKey()).sort(byTime).reverse().slice(0, 12);
    return sheetHead(esc(g.name), '<button class="pill-btn" data-act="group-edit">ویرایش</button>') + `
      <div class="eyebrow">${(g.members || []).length ? `${fa(g.members.length)} نفر: ${esc(g.members.join('، '))}` : ''}${g.place ? `، ${esc(g.place)}` : ''}</div>
      <div class="cards-row"><div class="mini"><span>دورهٔ فعلی</span><b>${st.current ? `${fa(st.done)} از ${fa(st.current.size)}` : '—'}</b></div>
        <div class="mini"><span>جلسهٔ بعد</span><b>${st.next ? `${weekdayName(fromDayKey(st.next.date))} ${fmtTime(st.next.start)}` : '—'}</b></div>
        <div class="mini"><span>کل جلسه‌ها</span><b>${fa(st.total)}</b></div></div>
      <div class="sh-sub"><b>دوره‌ها</b><button class="pill-btn" data-act="series-new">+ دورهٔ جدید</button></div>
      ${series.length ? series.map(x => `<div class="sr-row"><span>${fa(x.size)} جلسه، از ${weekdayName(fromDayKey(x.start))} ${jDayMonth(fromDayKey(x.start))}</span>
        <button class="chip small ${x.paid ? 'sel' : 'warn-chip'}" data-paid="${x.id}">${x.paid ? 'پرداخت شده' : 'پرداخت نشده'}</button></div>`).join('') : '<p class="hint">هنوز دوره‌ای نیست. «دورهٔ جدید» را بزن.</p>'}
      <div class="sh-sub"><b>سابقه</b></div>
      ${hist.length ? hist.map(e => { const n = nums.get(e.id); return `<button class="hs-row ${isActive(e) ? '' : 'cancelled'}" data-open="${e.id}"><b>${isActive(e) ? (n ? fa(n.n) : '–') : '✕'}</b><span>${weekdayName(fromDayKey(e.date))} ${jDayMonth(fromDayKey(e.date))}</span><em>${isActive(e) ? `${fa(headcount(e) ?? '')} نفر` : (e.reason || 'لغو')}</em></button>`; }).join('') : '<p class="hint">هنوز جلسه‌ای ثبت نشده.</p>'}`;
  },

  groupEdit(s) {
    const g = s.id ? store.get(s.id) : { name: '', members: [], place: '' };
    return sheetHead(s.id ? 'ویرایش مراجع' : 'مراجع جدید') + `
      <label class="fld">اسم گروه<input id="fName" value="${esc(g.name)}" placeholder="مثلاً عباس آقا و خانم فروزنده"></label>
      <label class="fld">اعضا (با ویرگول جدا کن)<input id="fMembers" value="${esc((g.members || []).join('، '))}" placeholder="عباس، فروزنده"></label>
      <label class="fld">محل جلسه‌ها (اختیاری)<input id="fPlace" value="${esc(g.place || '')}"></label>
      ${s.id ? '' : `<label class="fld">تعداد جلسه‌های دورهٔ فعلی<input id="fSize" type="number" inputmode="numeric" min="1" value="8"></label>
      <label class="fld">چند جلسه از این دوره تا امروز رفته؟ (برای شروع وسط دوره)<input id="fDone" type="number" inputmode="numeric" min="0" value="0"></label>
      <label class="chk"><input type="checkbox" id="fPaid"> این دوره پرداخت شده</label>`}
      <button class="wide-btn" data-act="save-group">ذخیره</button>
      ${s.id ? '<button class="wide-btn danger" data-act="archive-group">بایگانی (دیگه نشون داده نشه)</button>' : ''}`;
  },

  seriesNew(s) {
    const last = seriesOf(s.groupId).pop();
    return sheetHead('دورهٔ جدید') + `
      <label class="fld">تعداد جلسه‌ها<input id="fSize" type="number" inputmode="numeric" min="1" value="${last ? last.size : 8}"></label>
      <div class="eyebrow">از کِی شروع می‌شود؟</div>${dayChips(0)}
      <label class="chk"><input type="checkbox" id="fPaid"> پرداخت شده</label>
      <button class="wide-btn" data-act="save-series">ذخیره</button>`;
  },

  settings() {
    const st = sync.state;
    const statusText = { off: 'خاموش', idle: st.lastSync ? `همگام، ${new Date(st.lastSync).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}` : 'آماده', syncing: 'در حال همگام‌سازی…', error: 'خطا', offline: 'آفلاین؛ بعداً همگام می‌شود' }[st.status];
    const dirty = store.dirtyItems().length;
    return sheetHead('تنظیمات') + `
      <div class="sh-sub"><b>همگام‌سازی iPad و آیفون</b><span class="sync-badge ${st.status}">${statusText}</span></div>
      ${st.session ? `<p class="hint">وارد شدی با ${esc(st.session.user.email)}.${dirty ? ` ${fa(dirty)} تغییر منتظر ارسال.` : ''}</p>
        ${st.error ? `<p class="err">${esc(st.error)}</p>` : ''}
        <button class="wide-btn" data-act="sync-now">همگام‌سازی الان</button>
        <button class="wide-btn ghost" data-act="sign-out">خروج از حساب</button>`
      : `<p class="hint">روی هر دو دستگاه با یک ایمیل و رمز وارد شو؛ از آن به بعد همه‌چیز خودکار یکی می‌شود. اپ بدون اینترنت هم کار می‌کند و بعداً همگام می‌شود.</p>
        ${st.error ? `<p class="err">${esc(st.error)}</p>` : ''}
        <form data-form="auth" class="auth"><label class="fld">ایمیل<input id="aEmail" type="email" autocomplete="username" inputmode="email" dir="ltr"></label>
        <label class="fld">رمز (حداقل ۶ حرف)<input id="aPass" type="password" autocomplete="current-password" dir="ltr"></label>
        <button class="wide-btn" type="submit" data-mode="in">ورود</button><button class="wide-btn ghost" type="submit" data-mode="up">ساختن حساب (بار اول)</button></form>`}
      <div class="sh-sub"><b>پشتیبان و سوابق</b></div>
      <button class="wide-btn ghost" data-act="export">گرفتن فایل پشتیبان</button>
      <label class="wide-btn ghost file">بازکردن فایل پشتیبان یا سوابق<input type="file" id="importFile" accept="application/json,.json"></label>
      <p class="hint">فایل سوابق (مثلاً تقویم ۱۴۰۵ که از Keynote تبدیل شده) هم از همین‌جا وارد می‌شود. چیزی حذف نمی‌شود؛ فقط اضافه یا به‌روز می‌شود.</p>`;
  },
};
const sameDays = (a, b) => a.length === b.length && b.every(d => a.includes(d));

function renderSheet() {
  if (!state.sheet) return;
  const fn = SHEETS[state.sheet.kind];
  $('#sheet').innerHTML = fn(state.sheet);
}

// ---------- actions ----------
async function addEntry(f) {
  const s = state.sheet;
  const k = dayKey(addDays(new Date(), s.dayOff));
  let start = toMin($('#fStart').value), end = toMin($('#fEnd').value);
  if (end <= start) end = Math.min(start + 60, END_OF_DAY);
  const e = newEntry({ date: k, start, end, ...f });
  await store.put(e);
  state.lastNew = e.id;
  closeSheet();
  if (state.tab > 1) state.tab = 0;
  state.dayOff = s.dayOff;
  await render(false);
  setTimeout(() => { state.lastNew = null; }, 700);
  island(e.title, CATS[e.cat], fmtTime(e.start), s.dayOff === 0 ? 'امروز' : weekdayName(fromDayKey(k)), `${fa(entriesOn(k).filter(isActive).length)} برنامه`);
  toast(`ثبت شد: ${e.title}، ${s.dayOff === 0 ? '' : weekdayName(fromDayKey(k)) + ' '}${fmtTime(e.start)}`, async () => { await store.remove(e); render(false); });
}

async function updateItem(e, fn, msg, undoFn) {
  const before = JSON.parse(JSON.stringify(e));
  fn(e);
  await store.put(e);
  await render(false);
  if (state.sheet) renderSheet();
  if (msg) toast(msg, async () => { Object.assign(e, before); await store.put(e); if (undoFn) await undoFn(); await render(false); if (state.sheet) renderSheet(); });
}

async function exportBackup() {
  const data = { app: 'life-os', version: 1, exportedAt: new Date().toISOString(), items: store.everything() };
  const name = `life-os-${dayKey(new Date())}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importFile(file) {
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(list)) throw new Error('format');
    const valid = list.filter(it => it && it.id && it.kind && it.updatedAt);
    const n = await store.merge(valid);
    // Imported records must also reach the server.
    if (n) await store.put(...valid.filter(it => store.raw(it.id) === it));
    toast(`${fa(n)} مورد وارد شد`);
    await render(false);
    renderSheet();
  } catch {
    toast('فایل خوانده نشد');
  }
}

// ---------- events ----------
document.addEventListener('click', async ev => {
  const t = ev.target;
  const s = state.sheet;
  const tab = t.closest('.tab');
  if (tab) { const i = +tab.dataset.tab; if (i !== state.tab) { state.tab = i; render(); } else { state.dayOff = 0; state.weekOff = 0; render(); } return; }
  if (t.closest('#fab')) { if (s && s.kind === 'add') closeSheet(); else openSheet('add', { dayOff: state.tab === 0 ? state.dayOff : 0 }); return; }
  if (t.closest('#scrim') || t.closest('[data-act="close"]')) { closeSheet(); return; }
  if (t.closest('.undo')) { const to = $('#toast'); to._undo && to._undo(); to.classList.remove('on'); return; }

  const day = t.closest('[data-day]'); if (day) { state.dayOff = +day.dataset.day; render(); return; }
  const wk = t.closest('[data-wk]'); if (wk) { const d = +wk.dataset.wk; state.weekOff = d === 0 ? 0 : state.weekOff + d; render(); return; }
  const mw = t.closest('[data-mw]'); if (mw) { document.querySelector(`[data-mwopen="${mw.dataset.mw}"]`).classList.toggle('on'); return; }
  const range = t.closest('[data-range]'); if (range) { state.reportRange = range.dataset.range; render(); return; }
  const open = t.closest('[data-open]'); if (open) { openSheet('item', { id: open.dataset.open }); return; }

  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'settings') { openSheet('settings'); sync.run(); return; }
  if (act === 'templates') { openSheet('templates'); return; }
  if (act === 'tpl-new') { openSheet('tpl', {}); return; }
  if (act === 'tpl') { openSheet('tpl', { id: t.closest('[data-act]').dataset.id }); return; }
  if (act === 'group') { openSheet('group', { id: t.closest('[data-act]').dataset.id }); return; }
  if (act === 'group-new') { openSheet('groupEdit', { back: t.closest('[data-act]').dataset.back ? { ...s } : null }); return; }
  if (act === 'group-edit') { openSheet('groupEdit', { id: s.id }); return; }
  if (act === 'series-new') { openSheet('seriesNew', { groupId: s.id, dayOff: 0 }); return; }
  if (act === 'export') { exportBackup(); return; }
  if (act === 'sync-now') { await sync.run(); renderSheet(); return; }
  if (act === 'sign-out') { await sync.signOut(); renderSheet(); return; }

  if (!s) return;

  // add sheet
  if (s.kind === 'add') {
    const pd = t.closest('[data-pickday]'); if (pd) { s.dayOff = +pd.dataset.pickday; s.start = toMin($('#fStart').value); s.end = toMin($('#fEnd').value); renderSheet(); return; }
    const pc = t.closest('[data-pickcat]'); if (pc) { s.cat = pc.dataset.pickcat; pc.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', c === pc)); return; }
    const q = t.closest('[data-quick]'); if (q) { addEntry({ title: q.dataset.quick, cat: q.dataset.cat }); return; }
    const qg = t.closest('[data-quickgroup]'); if (qg) { const g = store.get(qg.dataset.quickgroup); addEntry({ title: g.name, cat: 'client', groupId: g.id }); return; }
  }

  // item sheet
  if (s.kind === 'item') {
    const e = store.get(s.id); if (!e) return;
    const ab = t.closest('[data-absent]');
    if (ab) { const n = ab.dataset.absent; await updateItem(e, x => { const set = new Set(x.absent || []); set.has(n) ? set.delete(n) : set.add(n); x.absent = [...set]; x.headcount = null; logChange(x, { absent: x.absent }); }); return; }
    const hc = t.closest('[data-hc]');
    if (hc) { await updateItem(e, x => { const cur = headcount(x) ?? lastHeadcount(x.title, x.date) ?? 0; x.headcount = Math.max(0, cur + +hc.dataset.hc); logChange(x, { headcount: x.headcount }); }); return; }
    const hs = t.closest('[data-hcset]');
    if (hs) { await updateItem(e, x => { x.headcount = +hs.dataset.hcset; logChange(x, { headcount: x.headcount }); }); return; }
    const cc = t.closest('[data-cancel]');
    if (cc) { await updateItem(e, x => { x.status = 'cancelled'; x.reason = cc.dataset.cancel || null; logChange(x, { status: 'cancelled', reason: x.reason }); }, `لغو شد: ${e.title}`); closeSheet(); return; }
    const md = t.closest('[data-moveday]');
    if (md) {
      const k = dayKey(addDays(new Date(), +md.dataset.moveday));
      const moved = newEntry({ date: k, start: e.start, end: e.end, title: e.title, cat: e.cat, groupId: e.groupId || null, movedFrom: e.id, absent: e.absent, note: e.note });
      await store.put(moved);
      await updateItem(e, x => { x.status = 'moved'; x.movedTo = moved.id; logChange(x, { status: 'moved', to: k }); }, `منتقل شد به ${weekdayName(fromDayKey(k))}`, async () => { await store.remove(moved); });
      openSheet('item', { id: moved.id });
      return;
    }
    if (act === 'toggle-paid') {
      const was = !!e.paidAt, btn = t.closest('[data-act="toggle-paid"]');
      if (!was && btn) { btn.classList.add('ok'); btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" pathLength="1"/></svg>'; await new Promise(r => setTimeout(r, 600)); }
      await updateItem(e, x => { x.paidAt = was ? null : new Date().toISOString(); logChange(x, { paid: !was }); }, was ? `پرداخت ${e.title} برداشته شد` : `پرداخت ${e.title} ثبت شد`);
      if (!was) { const left = awaitingPayment().length; island('پرداخت ثبت شد', e.title, '', 'منتظر پرداخت', left ? `${fa(left)} جلسه` : 'همه تسویه شد'); }
      return;
    }
    if (act === 'restore') {
      const target = e.movedTo && store.get(e.movedTo);
      await updateItem(e, x => { x.status = 'planned'; x.reason = null; x.movedTo = null; logChange(x, { status: 'planned' }); });
      if (target) await store.remove(target);
      await render(false); renderSheet();
      return;
    }
    const pc = t.closest('[data-pickcat]'); if (pc) { pc.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', c === pc)); s.cat = pc.dataset.pickcat; return; }
    if (act === 'save-item') {
      const start = toMin($('#fStart').value), end = Math.max(toMin($('#fEnd').value), start + 5);
      await updateItem(e, x => { x.title = $('#fTitle').value.trim() || x.title; x.start = start; x.end = end; x.cat = s.cat || x.cat; x.note = $('#fNote').value.trim() || null; logChange(x, { edit: true }); });
      toast('ذخیره شد'); closeSheet(); return;
    }
    if (act === 'delete-item') {
      if (!confirm(`«${e.title}» کامل حذف شود؟ (برای لغو، از دکمه‌های لغو استفاده کن)`)) return;
      await store.remove(e); closeSheet(); await render(false);
      toast(`حذف شد: ${e.title}`, async () => { e.deleted = false; await store.put(e); render(false); });
      return;
    }
  }

  // template row editor
  if (s.kind === 'tpl') {
    const d = s.draft;
    const keep = () => { s.keep = { title: $('#fTitle').value, start: $('#fStart').value, end: $('#fEnd').value, head: $('#fHead')?.value }; };
    const restore = () => { if (!s.keep) return; $('#fTitle').value = s.keep.title; $('#fStart').value = s.keep.start; $('#fEnd').value = s.keep.end; if ($('#fHead') && s.keep.head != null) $('#fHead').value = s.keep.head; };
    const dd = t.closest('[data-days]'); if (dd) { keep(); d.days = dd.dataset.days === 'even' ? [...EVEN_DAYS] : [...ODD_DAYS]; renderSheet(); restore(); return; }
    const dt = t.closest('[data-dayt]'); if (dt) { keep(); const n = +dt.dataset.dayt; d.days = d.days.includes(n) ? d.days.filter(x => x !== n) : [...d.days, n]; renderSheet(); restore(); return; }
    const pc = t.closest('[data-pickcat]'); if (pc) { keep(); d.cat = pc.dataset.pickcat; renderSheet(); restore(); return; }
    const tg = t.closest('[data-tplgroup]'); if (tg) { keep(); d.groupId = tg.dataset.tplgroup; renderSheet(); restore(); return; }
    if (act === 'save-tpl') {
      if (!d.days.length) { toast('حداقل یک روز انتخاب کن'); return; }
      const g = d.cat === 'client' && d.groupId ? store.get(d.groupId) : null;
      const title = $('#fTitle').value.trim() || (g ? g.name : '');
      if (!title) { toast('عنوان را بنویس'); return; }
      const start = toMin($('#fStart').value), end = Math.max(toMin($('#fEnd').value), start + 15);
      const tpl = s.id ? store.get(s.id) : { id: uid(), kind: 'template', from: todayKey() };
      Object.assign(tpl, { days: [...d.days], start, end, title, cat: d.cat, groupId: d.cat === 'client' ? d.groupId : null, headcount: $('#fHead') && $('#fHead').value !== '' ? +$('#fHead').value : null });
      await store.put(tpl);
      if (s.id) await applyTemplate(tpl);
      openSheet('templates');
      await render(false);
      toast(`${title}، ${daysLabel(tpl.days)} ${fmtTime(start)}`);
      return;
    }
    if (act === 'delete-tpl') {
      const tpl = store.get(s.id);
      if (!confirm(`«${tpl.title}» از الگو حذف شود؟ جلسه‌های گذشته می‌مانند.`)) return;
      tpl.until = dayKey(addDays(new Date(), 0));
      await store.put(tpl);
      await applyTemplate(tpl);
      openSheet('templates'); await render(false);
      return;
    }
  }

  if (s.kind === 'group') {
    const pd = t.closest('[data-paid]');
    if (pd) { const x = store.get(pd.dataset.paid); x.paid = !x.paid; await store.put(x); renderSheet(); await render(false); return; }
  }

  if (s.kind === 'groupEdit' && act === 'save-group') {
    const name = $('#fName').value.trim();
    if (!name) { toast('نام را بنویس'); return; }
    const members = $('#fMembers').value.split(/[,،]/).map(x => x.trim()).filter(Boolean);
    const g = s.id ? store.get(s.id) : { id: uid(), kind: 'group' };
    Object.assign(g, { name, members, place: $('#fPlace').value.trim() || null });
    await store.put(g);
    if (!s.id) {
      const size = Math.max(1, +$('#fSize').value || 8), doneBefore = Math.max(0, +$('#fDone').value || 0);
      // Starting mid-package: shrink the first package so numbering continues from where it is.
      await store.put({ id: uid(), kind: 'series', groupId: g.id, size, start: todayKey(), paid: $('#fPaid').checked, offset: doneBefore });
    }
    await render(false);
    if (s.back) { openSheet(s.back.kind, { ...s.back, draft: { ...s.back.draft, cat: 'client', groupId: g.id } }); return; }
    openSheet('group', { id: g.id });
    return;
  }
  if (s.kind === 'groupEdit' && act === 'archive-group') {
    const g = store.get(s.id);
    if (!confirm(`«${g.name}» بایگانی شود؟ سابقه‌اش می‌ماند.`)) return;
    g.archived = true; await store.put(g); closeSheet(); await render(false); return;
  }

  if (s.kind === 'seriesNew') {
    const pd = t.closest('[data-pickday]'); if (pd) { s.dayOff = +pd.dataset.pickday; pd.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', c === pd)); return; }
    if (act === 'save-series') {
      await store.put({ id: uid(), kind: 'series', groupId: s.groupId, size: Math.max(1, +$('#fSize').value || 8), start: dayKey(addDays(new Date(), s.dayOff)), paid: $('#fPaid').checked });
      openSheet('group', { id: s.groupId }); await render(false); return;
    }
  }
});

document.addEventListener('submit', async ev => {
  const f = ev.target.dataset.form;
  if (!f) return;
  ev.preventDefault();
  if (f === 'typed') {
    const title = $('#typedIn').value.trim();
    if (title) addEntry({ title, cat: state.sheet.cat || 'personal' });
  }
  if (f === 'auth') {
    const mode = ev.submitter?.dataset.mode || 'in';
    const email = $('#aEmail').value.trim(), pass = $('#aPass').value;
    try {
      if (mode === 'up') {
        const r = await sync.signUp(email, pass);
        if (r === 'confirm') { toast('ایمیل تأیید فرستاده شد؛ لینکش را بزن و بعد «ورود»'); renderSheet(); return; }
      } else await sync.signIn(email, pass);
      renderSheet();
      await sync.run();
      await render(false);
      renderSheet();
    } catch (e) { sync.state.error = e.message; renderSheet(); }
  }
});

document.addEventListener('change', ev => {
  if (ev.target.id === 'importFile' && ev.target.files[0]) importFile(ev.target.files[0]);
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeSheet(); });
addEventListener('resize', movePill);

// Keep "now" honest: refresh every minute and when the app comes back.
setInterval(() => { if (!state.sheet && state.tab < 2) render(false); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !state.sheet) render(false); });
// Remote changes arriving from sync redraw what is on screen.
let redraw;
store.onChange(() => { clearTimeout(redraw); redraw = setTimeout(() => { render(false); }, 150); });
sync.onChange(() => { const dot = document.querySelector('.sync-dot'); if (dot) dot.className = `sync-dot ${sync.state.status}`; if (state.sheet?.kind === 'settings') renderSheet(); });

// ---------- boot ----------
(async function boot() {
  renderTabs();
  try { await store.load(); } catch { /* start empty */ }
  await sync.init();
  await render();
  requestPersistence();
  sync.run();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
