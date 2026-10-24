import { db, requestPersistence } from './db.js';
import { faDigits } from './jalali.js';
import {
  CATS, dayKey, fromDayKey, addDays, minutesNow, weekStart, fmtTime, weekdayName, jDayMonth, jMonthYear,
  newEntry, setStatus, liveStatus, byStart, learnedPresets,
} from './model.js';

const $ = s => document.querySelector(s);
const state = { entries: [], tab: 0, weekOffset: 0, lastNew: null };
const TABS = ['امروز', 'هفته', 'مراجع‌ها', 'گزارش'];
const ICONS = [
  '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M3 15h18"/>',
  '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/>',
  '<path d="M5 20V11M12 20V5M19 20v-6"/>',
];
const H0 = 7 * 60, H1 = 24 * 60;
const pct = m => (Math.min(Math.max(m, H0), H1) - H0) / (H1 - H0) * 100;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const onDay = k => state.entries.filter(e => e.date === k).sort(byStart);

// A finished client session waits for payment until it is marked paid.
const payable = e => e.cat === 'client' && e.status !== 'cancelled' && liveStatus(e) === 'done';

// ---------- items ----------
function itemHTML(e, compact = false) {
  const st = liveStatus(e);
  const right = {
    done: '<span class="st">✓ انجام شد</span>',
    now: '<span class="st" style="color:var(--sage)"><i class="pulse"></i>الان</span>',
    cancelled: '<span class="st">لغو شد</span>',
    planned: '',
  }[st];
  return `<button class="item ${st} ${compact ? 'compact' : ''} ${e.id === state.lastNew ? 'new' : ''}" data-id="${e.id}">
    <i class="dot" style="background:var(--c-${e.cat})"></i>
    <span class="time">${fmtTime(e.start)}<small>${fmtTime(e.end)}</small></span>
    <span class="txt"><span class="title">${esc(e.title)}</span>${compact ? '' : `<span class="sub">${CATS[e.cat]}</span>`}</span>${compact ? '' : right}${!compact && payable(e) ? (e.paidAt ? '<span class="paid">پرداخت ثبت شد</span>' : `<span class="pay" data-pay="${e.id}" role="button">پرداخت شد؟</span>`) : ''}</button>`;
}

// ---------- screens ----------
function today() {
  const now = new Date(), k = dayKey(now), items = onDay(k), m = minutesNow(now);
  const hero = items.find(e => liveStatus(e, now) === 'now');
  const next = items.find(e => e.status !== 'cancelled' && e.start > m);
  const nc = items.filter(e => e.status === 'cancelled').length;
  const heroH = hero ? `<div class="card hero">
      <div class="row"><div><div class="eyebrow" style="color:var(--sage);display:flex;align-items:center;gap:6px"><i class="pulse"></i>الان، تا ${fmtTime(hero.end)}</div>
        <div class="name">${esc(hero.title)}</div><div class="eyebrow">${CATS[hero.cat]}</div></div>
      ${next ? `<div style="text-align:left"><div class="eyebrow">بعدی</div><div style="font-size:16px;font-weight:700">${esc(next.title)}</div><div class="eyebrow">${fmtTime(next.start)}</div></div>` : ''}</div>
      <div class="track"><i data-w="${Math.round((m - hero.start) / (hero.end - hero.start) * 100)}"></i></div></div>` : '';
  const tomorrow = onDay(dayKey(addDays(now, 1)));
  return `<div class="head"><div><div class="eyebrow">${jMonthYear(now)}</div><h1 class="big">${weekdayName(now)} ${jDayMonth(now)}</h1></div>
      <div class="eyebrow" style="text-align:left">${items.length ? `${faDigits(items.length)} برنامه${nc ? `، ${faDigits(nc)} لغو` : ''}<br><span style="font-weight:500;font-size:12px">برای لغو روی کار بزن</span>` : ''}</div></div>
    <div class="cols"><div class="main list stagger">${heroH}${items.length ? items.map(e => itemHTML(e)).join('') : `<div class="card empty"><b>امروز برنامه‌ای نیست</b>با دکمه‌ی + اضافه کن. الگوی ثابت هفته در مرحله‌ی بعد اضافه می‌شه.</div>`}</div>
      <aside class="side"><div class="eyebrow" style="margin-bottom:8px">فردا، ${weekdayName(addDays(now, 1))} ${jDayMonth(addDays(now, 1))}</div>
        <div class="list stagger" style="opacity:.85">${tomorrow.length ? tomorrow.map(e => itemHTML(e, true)).join('') : '<div class="card empty" style="padding:18px">هنوز چیزی نیست</div>'}</div></aside></div>`;
}

function week() {
  const now = new Date(), s = addDays(weekStart(now), state.weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(s, i));
  const todayK = dayKey(now), m = minutesNow(now);
  const all = days.flatMap(d => onDay(dayKey(d)));
  const ok = c => all.filter(e => e.cat === c && e.status !== 'cancelled').length;
  const sum = `${faDigits(ok('client'))} جلسه، ${faDigits(ok('shift'))} شیفت، ${faDigits(ok('uni'))} کلاس، ${faDigits(all.filter(e => e.status === 'cancelled').length)} لغو`;
  const label = state.weekOffset === 0 ? 'این هفته' : state.weekOffset === -1 ? 'هفته‌ی قبل' : state.weekOffset === 1 ? 'هفته‌ی بعد' : 'هفته';

  let ax = ''; for (let h = 7; h <= 24; h += 1) ax += `<span style="right:${pct(h * 60)}%">${faDigits(h)}</span>`;
  let grid = ''; for (let h = 8; h < 24; h++) grid += `<i class="gridline" style="right:${pct(h * 60)}%"></i>`;
  const table = days.map((d, ri) => {
    const k = dayKey(d), items = onDay(k), isT = k === todayK;
    const blocks = items.map(e => `<button class="blk ${e.status === 'cancelled' ? 'cancelled' : ''}" data-id="${e.id}" title="${esc(e.title)}، ${fmtTime(e.start)} تا ${fmtTime(e.end)}"
      style="--mark:var(--c-${e.cat});background:var(--t-${e.cat});right:calc(${pct(e.start)}% + 2px);width:calc(${pct(e.end) - pct(e.start)}% - 4px);animation-delay:${ri * 45}ms"><span>${esc(e.title)}</span><small>${fmtTime(e.start)}</small></button>`).join('');
    return `<div class="wk-row ${isT ? 'today' : ''}"><div class="wk-day"><b>${weekdayName(d)}</b><span>${jDayMonth(d)}${isT ? '، امروز' : ''}</span></div>
      <div class="wk-track">${grid}${items.length ? blocks : '<div class="free">آزاد</div>'}${isT ? `<i class="nowline" style="right:${pct(m)}%"></i>` : ''}</div></div>`;
  }).join('');

  let mwa = ''; [7, 11, 15, 19, 24].forEach(h => mwa += `<span style="position:absolute;right:${pct(h * 60)}%;transform:translateX(50%)">${faDigits(h)}</span>`);
  const mini = days.map((d, ri) => {
    const k = dayKey(d), items = onDay(k), isT = k === todayK;
    return `<button class="mw-row ${isT ? 'today' : ''}" data-day="${ri}"><span class="mw-day"><b>${weekdayName(d)}</b><span>${jDayMonth(d)}</span></span>
      <span class="mw-track">${items.map(e => `<i class="mw-seg" style="right:${pct(e.start)}%;width:calc(${pct(e.end) - pct(e.start)}% - 2px);background:var(--c-${e.cat});${e.status === 'cancelled' ? 'opacity:.25;' : ''}animation-delay:${ri * 50}ms"></i>`).join('')}${isT ? `<i class="nowline" style="right:${pct(m)}%"></i>` : ''}</span>
      <span class="mw-n">${items.length ? faDigits(items.length) : 'آزاد'}</span></button>
      <div class="mw-open" data-open="${ri}"><div>${items.map(e => `<div class="mw-li ${e.status === 'cancelled' ? 'cancelled' : ''}"><i class="dot" style="background:var(--c-${e.cat})"></i><b>${fmtTime(e.start)}</b><span>${esc(e.title)}</span></div>`).join('')}<div style="height:6px"></div></div></div>`;
  }).join('');

  return `<div class="head"><div><div class="eyebrow">${jDayMonth(days[0])} تا ${jDayMonth(days[6])}</div><h1 class="big">${label}</h1></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px"><div class="wnav"><button data-wk="-1" aria-label="هفته‌ی قبل">→</button><button data-wk="0">امروز</button><button data-wk="1" aria-label="هفته‌ی بعد">←</button></div><div class="eyebrow">${sum}</div></div></div>
    <div class="wide-only"><div class="card wk"><div class="axis">${ax}</div>${table}</div>
      <div class="legend">${Object.entries(CATS).map(([c, l]) => `<span><i style="background:var(--c-${c})"></i>${l}</span>`).join('')}</div></div>
    <div class="narrow-only"><div class="eyebrow" style="font-weight:500;font-size:12px;margin:-8px 0 10px">روی هر روز بزن تا باز بشه. گوشی رو بچرخونی، جدول کامل میاد.</div>
      <div class="mw-axis"><span style="width:62px"></span><span style="position:relative;flex:1;height:14px">${mwa}</span><span style="width:30px"></span></div>
      <div class="card mw">${mini}</div></div>`;
}

function clients() {
  const now = new Date(), j = jMonthYear(now);
  const done = state.entries.filter(e => payable(e) && jMonthYear(fromDayKey(e.date)) === j);
  const waitingAll = state.entries.filter(e => payable(e) && !e.paidAt);
  const by = new Map();
  for (const e of done) { const r = by.get(e.title) || { title: e.title, n: 0, unpaid: [] }; r.n++; if (!e.paidAt) r.unpaid.push(e); by.set(e.title, r); }
  const rows = [...by.values()].sort((a, b) => b.unpaid.length - a.unpaid.length || b.n - a.n);
  const head = `<div class="head"><div><div class="eyebrow">${j}</div><h1 class="big">مراجع‌ها</h1></div>
    <div class="eyebrow" style="text-align:left">${faDigits(done.length)} جلسه برگزار شد<br>${waitingAll.length ? `<span style="color:var(--burg)">${faDigits(waitingAll.length)} منتظر پرداخت</span>` : 'همه پرداخت شده'}</div></div>`;
  if (!rows.length && !waitingAll.length) return head + `<div class="card empty"><b>هنوز جلسه‌ای تموم نشده</b>جلسه‌هایی که با دسته‌ی «مراجع» ثبت کنی و تموم بشن، این‌جا با وضعیت پرداخت میان.</div>`;
  const old = waitingAll.filter(e => jMonthYear(fromDayKey(e.date)) !== j);
  return head + `<div class="list stagger">${rows.map(r => `<div class="card crow">
      <div><b>${esc(r.title)}</b><div class="eyebrow">${faDigits(r.n)} جلسه این ماه${r.unpaid.length ? `، <span style="color:var(--burg)">${faDigits(r.unpaid.length)} پرداخت‌نشده</span>` : '، تسویه'}</div></div>
      ${r.unpaid.length ? `<button class="pay" data-pay="${r.unpaid[0].id}">پرداخت شد</button>` : '<span class="paid">✓</span>'}</div>`).join('')}
    ${old.length ? `<div class="eyebrow" style="margin:14px 2px 6px">از ماه‌های قبل، هنوز منتظر پرداخت</div>${old.map(e => `<div class="card crow"><div><b>${esc(e.title)}</b><div class="eyebrow">${weekdayName(fromDayKey(e.date))} ${jDayMonth(fromDayKey(e.date))}</div></div><button class="pay" data-pay="${e.id}">پرداخت شد</button></div>`).join('')}` : ''}
    </div>
    <div class="note" style="margin-top:12px">وقتی پول جلسه رسید، «پرداخت شد» رو بزن و مبلغ رو تو «حساب من» ثبت کن. اگه اشتباهی زدی، روی «پرداخت ثبت شد» نگه دار تا برگرده.</div>`;
}

function report() {
  const now = new Date();
  // Only what is actually recorded: entries from the start of this Jalali month until now.
  const j = jMonthYear(now);
  const monthEntries = state.entries.filter(e => jMonthYear(fromDayKey(e.date)) === j && e.date <= dayKey(now));
  const live = monthEntries.filter(e => e.status !== 'cancelled' && liveStatus(e, now) !== 'planned');
  const count = c => live.filter(e => e.cat === c).length;
  const hours = c => live.filter(e => e.cat === c).reduce((s, e) => s + (e.end - e.start), 0) / 60;
  const totalH = Object.keys(CATS).reduce((s, c) => s + hours(c), 0);
  const fh = h => faDigits(Math.round(h * 10) / 10).replace('.', '٫');
  if (!monthEntries.length) return `<div class="head"><div><div class="eyebrow">تا امروز</div><h1 class="big">گزارش ${j}</h1></div></div>
    <div class="card empty"><b>هنوز داده‌ای نیست</b>گزارش فقط از چیزهایی ساخته می‌شه که واقعاً ثبت کردی.</div>`;
  return `<div class="head"><div><div class="eyebrow">تا امروز</div><h1 class="big">گزارش ${j}</h1></div></div>
    <div class="grid4 stagger">
      <div class="w"><h3>جلسه‌ی مراجع</h3><div class="num" data-count="${count('client')}">۰</div></div>
      <div class="w"><h3>شیفت</h3><div class="num" data-count="${count('shift')}">۰</div></div>
      <div class="w"><h3>کلاس</h3><div class="num" data-count="${count('uni')}">۰</div></div>
      <div class="w"><h3>لغوها</h3><div class="num" data-count="${monthEntries.filter(e => e.status === 'cancelled').length}" style="color:var(--burg)">۰</div></div></div>
    <div class="grid2"><div class="w"><h3>زمان کجا رفت</h3>
      <div class="stack" role="img" aria-label="${Object.entries(CATS).map(([c, l]) => `${l} ${fh(hours(c))} ساعت`).join('، ')}">${Object.keys(CATS).filter(c => hours(c) > 0).map((c, i) => `<div title="${CATS[c]}، ${fh(hours(c))} ساعت" style="flex:${hours(c)};background:var(--c-${c});animation-delay:${i * .1}s"></div>`).join('')}</div>
      <div class="lg2" style="margin-top:6px">${Object.entries(CATS).map(([c, l]) => `<span><i style="background:var(--c-${c})"></i>${l}<b>${fh(hours(c))} ساعت</b></span>`).join('')}</div>
      <div class="note">مجموع ${fh(totalH)} ساعت</div></div></div>`;
}

const SCREENS = [today, week, clients, report];

// ---------- render ----------
function render(animate = true) {
  const app = $('#app');
  app.innerHTML = `<div class="${animate ? 'scr' : ''}">${SCREENS[state.tab]()}</div>`;
  $('#fab').hidden = state.tab > 1;
  document.querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('on', i === state.tab));
  movePill();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    app.querySelectorAll('.hero .track i').forEach(e => { if (!animate) e.style.transition = 'none'; e.style.width = e.dataset.w + '%'; });
    app.querySelectorAll('[data-count]').forEach(countUp);
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

function countUp(el) {
  const end = +el.dataset.count;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = faDigits(end); return; }
  const t0 = performance.now();
  (function f(now) {
    const k = Math.min(1, (now - t0) / 900);
    el.textContent = faDigits(Math.round(end * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(f);
  })(t0);
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

// ---------- add sheet ----------
const sheet = { when: 'now', cat: 'personal', dayOff: 0 };
function openSheet(on) {
  $('#sheet').classList.toggle('on', on);
  $('#scrim').classList.toggle('on', on);
  $('#fab').classList.toggle('open', on);
  if (on) renderSheet();
}

function renderSheet() {
  const presets = learnedPresets(state.entries);
  const now = new Date();
  $('#sheet').innerHTML = `<div class="grab"></div>
    <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:19px">افزودن</b><span style="display:flex;align-items:center;gap:10px"><span class="eyebrow">الان ${fmtTime(minutesNow(now))}</span><button class="close" aria-label="بستن"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span></div>
    <div class="chips">${presets.map(p => `<button class="chip" data-add="${esc(p.title)}" data-cat="${p.cat}"><i class="dot" style="background:var(--c-${p.cat})"></i>${esc(p.title)}</button>`).join('')}</div>
    <div class="eyebrow">کِی؟</div>
    <div class="chips" data-group="when">${[['now', 'الان'], ['evening', 'امروز عصر'], ['tomorrow', 'فردا صبح'], ['pick', 'انتخاب…']].map(([v, l]) => `<button class="chip ${sheet.when === v ? 'sel' : ''}" data-when="${v}">${l}</button>`).join('')}</div>
    <div class="pick ${sheet.when === 'pick' ? 'on' : ''}" style="flex-direction:column">
      <div class="chips" data-group="day">${Array.from({ length: 7 }, (_, i) => addDays(now, i)).map((d, i) => `<button class="chip ${i === sheet.dayOff ? 'sel' : ''}" data-dayoff="${i}">${i === 0 ? 'امروز' : i === 1 ? 'فردا' : weekdayName(d)} <span style="font-weight:500;opacity:.7">${jDayMonth(d)}</span></button>`).join('')}</div>
      <div style="display:flex;gap:8px">
      <label>شروع<input type="time" id="pStart" value="${String(now.getHours()).padStart(2, '0')}:00"></label>
      <label>پایان<input type="time" id="pEnd" value="${String(Math.min(23, now.getHours() + 1)).padStart(2, '0')}:00"></label></div></div>
    <div class="eyebrow">چیز جدید</div>
    <div class="chips" data-group="cat">${Object.entries(CATS).map(([c, l]) => `<button class="chip ${sheet.cat === c ? 'sel' : ''}" data-catpick="${c}"><i class="dot" style="background:var(--c-${c})"></i>${l}</button>`).join('')}</div>
    <form class="inp" id="typed"><label for="typedIn" class="sr">عنوان</label><input id="typedIn" type="text" placeholder="مثلاً «دندانپزشکی»" autocomplete="off" enterkeyhint="done"><button type="submit">ثبت</button></form>`;
}

const END_OF_DAY = 24 * 60 - 1;
function slot() {
  const now = new Date(), m = minutesNow(now);
  if (sheet.when === 'evening') { const s = Math.max(Math.floor(m / 5) * 5, 18 * 60); return { date: dayKey(now), start: s, end: Math.min(s + 60, END_OF_DAY) }; }
  if (sheet.when === 'tomorrow') return { date: dayKey(addDays(now, 1)), start: 9 * 60, end: 10 * 60 };
  if (sheet.when === 'pick') {
    const toM = v => { const [h, mm] = (v || '0:0').split(':').map(Number); return h * 60 + mm; };
    const start = toM($('#pStart').value), end = Math.max(start + 15, toM($('#pEnd').value));
    return { date: dayKey(addDays(now, sheet.dayOff)), start, end: Math.min(end, END_OF_DAY) };
  }
  const start = Math.floor(m / 5) * 5;
  return { date: dayKey(now), start, end: Math.min(start + 60, END_OF_DAY) };
}

async function addEntry(title, cat) {
  title = title.trim();
  if (!title) return;
  const e = newEntry({ ...slot(), title, cat });
  state.entries.push(e);
  state.lastNew = e.id;
  await db.putEntry(e);
  openSheet(false);
  if (state.tab > 1) state.tab = 0;
  render(false);
  setTimeout(() => { state.lastNew = null; }, 700);
  const when = e.date === dayKey(new Date()) ? '' : ` ${weekdayName(fromDayKey(e.date))}`;
  toast(`ثبت شد: ${e.title}${when}، ${fmtTime(e.start)}`, async () => {
    state.entries = state.entries.filter(x => x.id !== e.id);
    await db.deleteEntry(e.id);
    render(false);
  });
}

async function toggleCancel(id, el) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return;
  const was = e.status === 'cancelled';
  setStatus(e, was ? 'planned' : 'cancelled');
  await db.putEntry(e);
  el.classList.toggle('cancelled', !was);
  setTimeout(() => render(false), 380);
  toast(was ? `برگشت: ${e.title}` : `لغو شد: ${e.title}`, async () => {
    setStatus(e, was ? 'cancelled' : 'planned');
    await db.putEntry(e);
    render(false);
  });
}

// Long-press deletes a hand-added entry (for typos); everything else is kept with its history.
let pressTimer = null, pressed = false;
document.addEventListener('pointerdown', ev => {
  if (ev.target.closest('.paid')) {
    const host = ev.target.closest('.item[data-id]');
    pressTimer = setTimeout(async () => { const e = host && state.entries.find(x => x.id === host.dataset.id); if (!e) return; pressed = true; delete e.paidAt; await db.putEntry(e); render(false); toast(`پرداخت ${e.title} برداشته شد`); }, 650);
    return;
  }
  const it = ev.target.closest('.item[data-id], .blk[data-id]');
  pressed = false;
  if (!it) return;
  pressTimer = setTimeout(async () => {
    const e = state.entries.find(x => x.id === it.dataset.id);
    if (!e || e.source !== 'manual') return;
    pressed = true;
    if (!confirm(`«${e.title}» پاک بشه؟`)) return;
    state.entries = state.entries.filter(x => x.id !== e.id);
    await db.deleteEntry(e.id);
    render(false);
    toast(`پاک شد: ${e.title}`, async () => { state.entries.push(e); await db.putEntry(e); render(false); });
  }, 650);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => document.addEventListener(t, () => clearTimeout(pressTimer)));

// ---------- events ----------
document.addEventListener('click', ev => {
  const t = ev.target;
  const tab = t.closest('.tab');
  if (tab) { const i = +tab.dataset.tab; if (i !== state.tab) { state.tab = i; render(); } else if (i === 1 && state.weekOffset) { state.weekOffset = 0; render(); } return; }
  if (t.closest('#fab')) { openSheet(!$('#sheet').classList.contains('on')); return; }
  if (t.closest('#scrim') || t.closest('.close')) { openSheet(false); return; }
  const add = t.closest('[data-add]');
  if (add) { addEntry(add.dataset.add, add.dataset.cat); return; }
  const w = t.closest('[data-when]');
  if (w) { sheet.when = w.dataset.when; w.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', c === w)); $('.pick').classList.toggle('on', sheet.when === 'pick'); return; }
  const dof = t.closest('[data-dayoff]');
  if (dof) { sheet.dayOff = +dof.dataset.dayoff; dof.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', c === dof)); return; }
  const cp = t.closest('[data-catpick]');
  if (cp) { sheet.cat = cp.dataset.catpick; cp.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', c === cp)); $('#typedIn').focus(); return; }
  if (t.closest('.undo')) { const to = $('#toast'); to._undo && to._undo(); to.classList.remove('on'); return; }
  const wk = t.closest('[data-wk]');
  if (wk) { const d = +wk.dataset.wk; state.weekOffset = d === 0 ? 0 : state.weekOffset + d; render(); return; }
  const day = t.closest('[data-day]');
  if (day) { document.querySelector(`[data-open="${day.dataset.day}"]`).classList.toggle('on'); return; }
  const pay = t.closest('[data-pay]');
  if (pay) { markPaid(pay.dataset.pay); return; }
  const it = t.closest('.item[data-id], .blk[data-id]');
  if (it && !pressed) toggleCancel(it.dataset.id, it);
});

// Remembers the session as paid (undo from the toast or by holding the label).
async function markPaid(id) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return;
  e.paidAt = new Date().toISOString(); e.updatedAt = e.paidAt;
  await db.putEntry(e);
  render(false);
  toast(`پرداخت ${e.title} علامت خورد`, async () => { delete e.paidAt; await db.putEntry(e); render(false); });
}
document.addEventListener('submit', ev => {
  if (ev.target.id !== 'typed') return;
  ev.preventDefault();
  addEntry($('#typedIn').value, sheet.cat);
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') openSheet(false); });
addEventListener('resize', movePill);

// Keep "now" honest: refresh the visible screen every minute and when the app comes back.
setInterval(() => { if (state.tab < 2 && !$('#sheet').classList.contains('on')) render(false); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(false); });

// ---------- boot ----------
(async function boot() {
  renderTabs();
  try { state.entries = (await db.allEntries()) || []; } catch { state.entries = []; }
  render();
  requestPersistence();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
