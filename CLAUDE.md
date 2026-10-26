# Life OS («زندگی من») — notes for Claude

Farbod's personal planner and log: sessions with clients (coaching / rehab), gym shifts, university classes and
personal time. Persian, Jalali dates, week starts Saturday. iPhone for everything; iPad mostly for reading.
Sister app: **hesab-man** («حساب من», personal finance) in `farbodforoudii-cpu/hesab-man`. Both follow the same
design and working rules below; hesab-man is the reference when in doubt.

## Stack and release
- Vanilla JS ES modules, no build step, no framework. Offline PWA. Font: Vazirmatn (`fonts/`).
- Files: `js/app.js` (all screens, sheets, events), `js/model.js` (dates, status, groups/series, presets),
  `js/store.js` (in-memory store over IndexedDB, tombstone deletes), `js/db.js` (IndexedDB `life-os` v2, stores
  `items`, `kv`), `js/sync.js` + `js/config.js` (optional two-way Supabase sync, table `life_items`, RLS),
  `js/jalali.js`, `sw.js` (cache-first shell).
- Item kinds in the store: `entry` (one block of time), `template` (weekly pattern, even/odd days), `group`
  (a client or class group with members), `series` (a package of N sessions for a group, `paid` flag).
- **Every release: bump `VERSION` in `sw.js`**, push `main`. GitHub Pages serves from `main`
  (repo was renamed `Life-os`; the remote URL is `https://github.com/farbodforoudii-cpu/Life-os.git`).
- Never put client names or any personal data in the repo. Names live only on the device / in the user's own
  Supabase rows.

## How Farbod wants to work
- **Before publishing anything visual: send a screenshot and a short explanation, publish only after his OK.**
- Change only what was asked. Do not re-ask things he already explained; read earlier context first.
- Challenge his ideas when there is a better way, briefly, with a recommendation.
- Replies in Persian, structured, concise. No filler.

## Design rules (apply everywhere)
- **Wording: elegant but warm — «شیک باش ولی خشک نه».** No colloquial forms in UI text (no «اومد/رفت»,
  «رو»، «می‌شه»، «نیومد»، «تموم»، «اگه»). Use «را»، «می‌شود»، «تمام شد». Ezafe as «هٔ» (جلسهٔ), not «ه‌ی».
- Understanding order: **logic → numbers → trend.** Few colours (sage, burgundy, neutrals). Simple, modern, fast.
- **Every percentage or formula must be explained** next to it (what divided by what), and every suggested
  number must say where it comes from.
- **Keep it live:** pulsing "now" dot, the day path drawing up to now, rolling (odometer) numbers, island
  confirmation, staggered entrances, spring press. Respect `prefers-reduced-motion`.
- Separators: use «،» — never «·» (in this font it looks like the digit zero).
- Numbers next to units: wrap the number in Unicode isolates `⁦ … ⁩` (see `fh` in report) so the
  unit word can never land between digits (Safari bug seen as «۵۴میلیون۲»). Containers holding number+unit
  stay `direction: rtl`; only digit-by-digit odometers use `ltr`.
- Light and dark both supported (follows system). Test both.

## Testing (do this before every screenshot)
- Chromium + Playwright are preinstalled: `require('playwright')`, `chromium.launch()`.
- Serve locally: `python3 -m http.server 8767` in the repo.
- Seed realistic data straight into IndexedDB (`life-os` v2, store `items`, objects with `kind`), then reload.
  Include groups with members, series, a cancelled entry, an entry happening "now", unpaid finished sessions.
- Check phone (390×844) and iPad (1024×1366), light and dark, every tab and every sheet; zero console errors.
- Read the screenshots yourself and fix what looks wrong before showing Farbod.

## Plan agreed on 1405/08/03

### Phase 1 — review and polish (no new features)
1. Full page-by-page QA as above; fix every visual or logic bug found.
2. Cancel reasons in `model.js` (`CANCEL_REASONS`) are colloquial («مراجع نیومد»، «خودم نتونستم»، «استاد نیومد»).
   Rename to refined text (e.g. «مراجع نیامد»، «مراجع خبر داد»، «خودم نتوانستم»، «تعطیلی»، «استاد نیامد») **and
   migrate stored `reason` values once** (map old → new, flag in `kv`), and update the filter in the item sheet
   that compares against these strings.
3. Remaining colloquial strings anywhere in `app.js` / `model.js`.

### Phase 2 — smarter and more alive
4. **Weekly goals as three rings** (like hesab-man's month goals): sessions this week, work hours (a ceiling,
   against burnout), personal time (a floor). Ring centre = number on one line, unit under it. Goals sheet shows
   the arithmetic and a suggestion from the last 4 weeks with its reasoning; «استفاده» applies it.
5. **TradingView chart in the report** using TradingView Lightweight Charts (Apache-2.0). Vendor the same file
   hesab-man uses (`vendor/lightweight-charts.mjs`, v5.2.1, keep `attributionLogo: true` — licence requirement)
   and add it to the `sw.js` shell. Week by week: work hours, sessions, personal hours; on-chart legend with
   «+ مقایسه», «×», a «٪» mode (each line relative to its first non-zero value, formula shown), small point
   markers with value labels. See `trendCard` / `bindTrend` in hesab-man `js/app.js` for a working version.
6. **Client page** (tap a group in «مراجع‌ها»): sessions on a timeline, package progress, attendance rate
   (present ÷ planned, explained), payment status, «وقت تمدید» alert also surfacing in the report news.
7. **Prices (Farbod will enter them):** add optional `price` (per session) on `group` and `price` on `series`
   (package price). Inputs in the group / series sheets. Where a price is missing show a quiet placeholder
   «قیمت وارد نشده — بزن تا وارد کنی». With prices: income per client, unpaid amount, month total. Ask Farbod to
   enter prices once this ships.

### Phase 3 — link with hesab-man (decided 1405/08/04: two separate apps, one shared server)
Farbod chose to keep the two apps separate and link them through the shared Supabase project instead of merging
them into one PWA (which the iOS storage limit would otherwise require).
- Both apps sync into `public.life_items`; column `app` = `life` | `hesab`. Each app pulls only its own rows today.
  hesab-man sync lives on its branch `claude/daily-schedule-web-app-xucjy8` until Farbod merges it.
- Next steps, in order: (a) prices on groups/series in life-os; (b) life-os writes «طلب» / expense drafts that
  hesab-man shows in an inbox for **one-tap confirmation** (money is never recorded silently); (c) a payment
  confirmed in hesab-man marks the package/session paid in life-os; (d) a shared monthly report (hours, sessions,
  income, income per hour, open receivables).
- Details of the sync format: hesab-man `docs/ECOSYSTEM.md`.
