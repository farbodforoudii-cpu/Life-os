// The learning core with made-up data: a shift typed by hand three Tuesdays running, client sessions shortened to an
// hour, a pattern row cancelled three times. Run: python3 -m http.server 8767 (in the repo), then node tests/learning.mjs
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const URL = process.env.URL || 'http://localhost:8767/';
const T = '2026-01-01T00:00:00.000Z', st = o => ({ createdAt: T, updatedAt: T, history: [], status: 'planned', ...o });
const D = (off, base = new Date()) => { const d = new Date(base); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// The last three Tuesdays before today, and the next Tuesday.
const now = new Date(), back = (now.getDay() - 2 + 7) % 7 || 7, tue = [3, 2, 1].map(w => D(-back - 7 * (w - 1))), nextTue = D(7 - back);
const mon = [3, 2, 1, 0].map(w => D(-((now.getDay() - 1 + 7) % 7 || 7) - 7 * w)); // last four Mondays
const items = [
  { id: 'tS', kind: 'template', days: [2], start: 1110, end: 1200, title: 'شیفت نمونه', cat: 'shift', from: D(-60), createdAt: T, updatedAt: T },
  ...tue.map((k, i) => st({ id: `m${i}`, kind: 'entry', date: k, start: 1035, end: 1095, title: 'شیفت نمونه', cat: 'shift', source: 'manual' })),
  { id: 'gC', kind: 'group', name: 'مراجع نمونه', members: ['الف'], createdAt: T, updatedAt: T },
  { id: 'tC', kind: 'template', days: [1], start: 540, end: 630, title: 'مراجع نمونه', cat: 'client', groupId: 'gC', from: D(-60), createdAt: T, updatedAt: T },
  ...mon.map((k, i) => st({ id: `t_tC_${k}`, kind: 'entry', date: k, start: 540, end: i ? 600 : 630, title: 'مراجع نمونه', cat: 'client', groupId: 'gC', source: 'template', templateId: 'tC' })),
  { id: 'tW', kind: 'template', days: [4], start: 780, end: 1170, title: 'کارگاه نمونه', cat: 'personal', from: D(-60), createdAt: T, updatedAt: T },
  ...[3, 2, 1].map(w => { const k = D(-((now.getDay() - 4 + 7) % 7 || 7) - 7 * (w - 1)); return st({ id: `t_tW_${k}`, kind: 'entry', date: k, start: 780, end: 1170, title: 'کارگاه نمونه', cat: 'personal', source: 'template', templateId: 'tW', status: 'cancelled' }); }),
];
const b = await chromium.launch(), errors = [], fails = [];
const check = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('https://*.supabase.co/**', r => r.fulfill({ status: 404, body: '{}' }));
const p = await ctx.newPage();
p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(URL); await p.waitForTimeout(500);
await p.evaluate(async its => new Promise(res => { const r = indexedDB.open('life-os', 2); r.onsuccess = () => { const tx = r.result.transaction('items', 'readwrite'); for (const it of its) tx.objectStore('items').put(it); tx.oncomplete = res; }; }), items);
await p.reload(); await p.waitForTimeout(800);
const r = await p.evaluate(async ([nextTue]) => {
  const m = await import('./js/model.js');
  const g = m.guessAt(nextTue, 1035);
  return { guess: g[0] && [g[0].title, g[0].sure], len: m.usualMinutes({ title: 'مراجع نمونه', cat: 'client', groupId: 'gC' }), tips: m.patternTips().map(t => t.kind + ':' + t.title).sort() };
}, [nextTue]);
check('17:15 on a Tuesday is recognised', r.guess, ['شیفت نمونه', true]);
check('length follows the recent sessions', r.len, 60);
check('pattern tips', r.tips, ['add:شیفت نمونه', 'end:کارگاه نمونه', 'len:مراجع نمونه']);
await p.screenshot({ path: process.env.SHOT || '/dev/null' }).catch(() => {});
// Apply all three, then nothing is left to suggest.
for (let i = 0; i < 3; i++) { await p.click('[data-tip] >> nth=0'); await p.waitForTimeout(400); }
const after = await p.evaluate(async () => {
  const m = await import('./js/model.js'), { store } = await import('./js/store.js');
  const tC = store.get('tC'), tW = store.get('tW'), added = store.all('template').find(t => t.title === 'شیفت نمونه' && t.start === 1035);
  return { tips: m.patternTips().length, len: tC.end - tC.start, ended: !!tW.until, added: added && [added.days, added.end - added.start] };
});
check('after applying', after, { tips: 0, len: 60, ended: true, added: [[2], 60] });
await b.close();
const all = [...errors.map(e => `console: ${e}`), ...fails];
console.log(all.length ? `FAILED\n${all.join('\n')}` : 'all checks passed');
process.exit(all.length ? 1 : 0);
