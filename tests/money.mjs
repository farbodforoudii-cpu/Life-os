// The day read from money, with made-up data: purchases placed during or after a session, gaps turned into
// suggestions, one accepted and learned. Run: python3 -m http.server 8767 (in the repo), then node tests/money.mjs
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const URL = process.env.URL || 'http://localhost:8767/', SHOTS = process.env.SHOTS || '';
const T = '2026-01-01T00:00:00.000Z';
const d = new Date(), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at = (h, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString();
const en = (id, s, e, title, cat) => ({ id, kind: 'entry', date: k, start: s, end: e, title, cat, status: 'planned', source: 'manual', history: [], createdAt: T, updatedAt: T });
const items = [en('e1', 450, 510, 'شیفت نمونه', 'shift'), en('e2', 540, 600, 'مراجع نمونه', 'client'), en('e3', 1080, 1140, 'کلاس نمونه', 'uni')];
const tx = (id, h, m, amount, cat, desc) => ({ id, ts: at(h, m), amount, dir: 'out', type: 'expense', cat, desc, cp: null });
const mirror = { cursor: null, tx: Object.fromEntries([
  tx('x1', 8, 40, 320000, 'food', 'کافه نمونه'), tx('x2', 9, 20, 60000, 'food', 'آب'), tx('x3', 13, 10, 900000, 'car', 'پمپ بنزین نمونه'),
  tx('x4', 13, 22, 150000, 'car', 'کارواش نمونه'), tx('x5', 20, 30, 450000, 'food', ''), tx('x6', 11, 0, 99000, 'digital', 'اشتراک'),
].map(t => [t.id, t])) };
const b = await chromium.launch(), errors = [], fails = [];
const check = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
for (const scheme of SHOTS ? ['light', 'dark'] : ['light']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1, colorScheme: scheme });
  await ctx.route('https://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('eco_push') ? '0' : '[]' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(URL); await p.waitForTimeout(500);
  await p.evaluate(async ([its, mirror]) => new Promise(res => { const r = indexedDB.open('life-os', 2); r.onsuccess = () => { const tx = r.result.transaction(['items', 'kv'], 'readwrite'); for (const it of its) tx.objectStore('items').put(it); tx.objectStore('kv').put('AAAAA-BBBBB-CCCCC-DDDDD-EEEEE', 'syncKey'); tx.objectStore('kv').put(mirror, 'moneyMirror'); tx.oncomplete = res; }; }), [items, mirror]);
  await p.reload(); await p.waitForTimeout(900);
  if (SHOTS) { await p.evaluate(() => document.querySelector('.ghost')?.scrollIntoView({ block: 'start' })); await p.evaluate(() => scrollBy(0, -260)); await p.waitForTimeout(400); await p.screenshot({ path: `${SHOTS}/money_day_${scheme}.png` }); }
  if (scheme === 'light') {
    const r = await p.evaluate(async k => {
      const m = await import('./js/model.js'), { sync } = await import('./js/sync.js');
      const x = m.dayMoney(k, sync.moneyTx());
      return { rows: x.rows.map(r => `${r.id}:${r.near ? r.near.rel + ' ' + r.near.e.title : '-'}`), guesses: x.guesses.map(g => `${g.title}:${g.tx.map(t => t.id).join('+')}`) };
    }, k);
    check('placed', r.rows, ['x1:after شیفت نمونه', 'x2:during مراجع نمونه', 'x3:-', 'x4:-', 'x5:-']);
    check('gaps', r.guesses, ['صبحانه:x1', 'بنزین و ماشین:x3+x4', 'شام:x5']);
    check('no money shown', await p.evaluate(() => { const t = document.querySelector('#app').innerText; return /هزار|میلیون|تومان|غذا|کافه نمونه/.test(t.replace(/کافه نمونه/g, 'PLACE')) || document.querySelectorAll('.mrow').length > 0; }), false);
    check('guess rows', await p.$$eval('.ghost .title', xs => xs.map(x => x.textContent)), ['صبحانه؟', 'بنزین و ماشین؟', 'شام؟']);
    await p.click('[data-gyes="tx|x1"]'); await p.waitForTimeout(400);
    const after = await p.evaluate(async k => {
      const m = await import('./js/model.js'), { sync } = await import('./js/sync.js'), { store } = await import('./js/store.js');
      const e = store.all('entry').find(e => e.source === 'money');
      return { entry: e && [e.title, e.start, e.fromTx], learned: m.learnedTitle('کافه نمونه'), left: m.dayMoney(k, sync.moneyTx()).guesses.length };
    }, k);
    check('accepted and learned', after, { entry: ['صبحانه', 520, ['x1']], learned: 'صبحانه', left: 2 });
  }
  await ctx.close();
}
await b.close();
const all = [...errors.map(e => `console: ${e}`), ...fails];
console.log(all.length ? `FAILED\n${all.join('\n')}` : 'all checks passed');
process.exit(all.length ? 1 : 0);
