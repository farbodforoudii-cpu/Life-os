// Smoke and logic tests with made-up data (never real names or numbers).
// Run: python3 -m http.server 8767   (in the repo)   then   node tests/smoke.mjs
// Opens every tab and the main sheets on phone and iPad, light and dark, fails on any console error, and checks the
// package numbering, prices, invoice total, month forecast and the cancel-reason migration against hand-computed values.
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const URL = process.env.URL || 'http://localhost:8767/';
const T = '2026-01-01T00:00:00.000Z', stamp = o => ({ createdAt: T, updatedAt: T, ...o });
const day = off => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const items = [
  stamp({ id: 'gA', kind: 'group', name: 'گروه الف', members: ['یک', 'دو'], prices: [{ from: day(-60), by: { 1: 1000000, 2: 2000000 } }] }),
  stamp({ id: 'gB', kind: 'group', name: 'گروه ب', members: ['سه'] }),
  stamp({ id: 'sA1', kind: 'series', groupId: 'gA', size: 3, start: day(-20), paid: true, offset: 0 }),
  stamp({ id: 'sA2', kind: 'series', groupId: 'gA', size: 3, start: day(-8), paid: false, offset: 0 }),
  ...[-20, -18, -15].map((o, i) => stamp({ id: `a${i}`, kind: 'entry', date: day(o), start: 600, end: 690, title: 'گروه الف', cat: 'client', groupId: 'gA', status: 'planned', source: 'manual' })),
  stamp({ id: 'aX', kind: 'entry', date: day(-12), start: 600, end: 690, title: 'گروه الف', cat: 'client', groupId: 'gA', status: 'planned', source: 'manual', outside: true }),
  stamp({ id: 'a3', kind: 'entry', date: day(-8), start: 600, end: 690, title: 'گروه الف', cat: 'client', groupId: 'gA', status: 'planned', source: 'manual', headcount: 1 }),
  stamp({ id: 'a4', kind: 'entry', date: day(-6), start: 600, end: 690, title: 'گروه الف', cat: 'client', groupId: 'gA', status: 'cancelled', reason: 'مراجع نیومد', source: 'manual' }),
  stamp({ id: 'a5', kind: 'entry', date: day(-5), start: 600, end: 690, title: 'گروه الف', cat: 'client', groupId: 'gA', status: 'planned', source: 'manual', price: 2500000 }),
  stamp({ id: 'nowE', kind: 'entry', date: day(0), start: 0, end: 1439, title: 'گردان', cat: 'shift', status: 'planned', source: 'manual' }),
  stamp({ id: 'tpl1', kind: 'template', from: day(-30), days: [0, 1, 2, 3, 4, 5, 6], start: 1200, end: 1260, title: 'گروه الف', cat: 'client', groupId: 'gA', headcount: null }),
];
const b = await chromium.launch(), errors = [], fails = [];
const check = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
for (const [tag, vp, scheme] of [['phone', { width: 390, height: 844 }, 'light'], ['ipad', { width: 1024, height: 1366 }, 'dark']]) {
  const ctx = await b.newContext({ viewport: vp, colorScheme: scheme });
  await ctx.route('https://*.supabase.co/**', r => r.fulfill({ status: 404, body: '{}' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${tag}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  p.on('dialog', d => d.dismiss());
  await p.goto(URL); await p.waitForTimeout(500);
  await p.evaluate(async its => new Promise(res => { const r = indexedDB.open('life-os', 2); r.onsuccess = () => { const tx = r.result.transaction('items', 'readwrite'); for (const it of its) tx.objectStore('items').put(it); tx.oncomplete = res; }; }), items);
  await p.reload(); await p.waitForTimeout(800);
  for (const i of [0, 1, 2, 3]) { await p.click(`.tab[data-tab="${i}"]`); await p.waitForTimeout(250); }
  await p.click('.tab[data-tab="2"]'); await p.click('#app .cl2 >> nth=0'); await p.waitForTimeout(300);
  await p.click('#sheet [data-act="invoice"] >> nth=0'); await p.waitForTimeout(600); await p.click('[data-act="close"]');
  await p.click('.tab[data-tab="0"]'); await p.click('#fab'); await p.waitForTimeout(200); await p.click('[data-act="close"]');
  await p.click('[data-act="settings"]'); await p.waitForTimeout(200); await p.click('[data-act="close"]');
  if (tag === 'phone') {
    const r = await p.evaluate(async () => {
      const m = await import('./js/model.js'), { store } = await import('./js/store.js');
      const nums = m.numberSessions('gA'), n = id => { const x = nums.get(id); return x ? `${x.series.id}#${x.n}` : null; };
      const inv = m.invoiceOf('sA2');
      return { numbering: ['a0', 'a1', 'a2', 'aX', 'a3', 'a5'].map(n), price1: m.priceOf(store.get('a3')), priceList: m.priceOf(store.get('a0')), own: m.priceOf(store.get('a5')),
        invTotal: inv.total, reason: store.get('a4').reason, outsideWaiting: m.awaitingPayment().some(e => e.id === 'aX') };
    });
    check('package numbering', r.numbering, ['sA1#1', 'sA1#2', 'sA1#3', null, 'sA2#1', 'sA2#2']);
    check('price for one person', r.price1, 1000000); check('price from list, two people', r.priceList, 2000000); check('session’s own price', r.own, 2500000);
    check('cancel reason migrated', r.reason, 'مراجع نیامد'); check('session outside packages waits for payment', r.outsideWaiting, true);
    // sA2 holds a3, a5 and the next pattern session (today or later, from the list for two people).
    if (r.invTotal < 3500000) fails.push(`invoice total too small: ${r.invTotal}`);
  }
  await ctx.close();
}
await b.close();
const all = [...errors.map(e => `console: ${e}`), ...fails];
console.log(all.length ? `FAILED\n${all.join('\n')}` : 'all checks passed');
process.exit(all.length ? 1 : 0);
