import { build, preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { createHash } from 'node:crypto';

// Production app, with measurement-only instrumentation. Never changes MAX_ROWS
// in shipped source. 1000/2000 rows are explicitly unsupported stress cases.
const label = process.argv[2] || 'current';
if (!/^[\w-]+$/.test(label)) throw Error('Use an alphanumeric label');
const sizes = (process.env.BENCH_ROWS || '500,1000,2000').split(',').map(Number);
if (sizes.some(n => ![500, 1000, 2000].includes(n))) throw Error('Rows: 500, 1000 or 2000');
const samples = Number(process.env.BENCH_SAMPLES || 5);
if (!Number.isInteger(samples) || samples < 1 || samples > 20) throw Error('Samples: 1..20');
const pageMode = process.env.BENCH_PAGE_SIZE || '50';
if (!['50', '100', 'all'].includes(pageMode)) throw Error('Page size: 50, 100 or all (benchmark only)');
const root = process.cwd();
const modelPath = resolve(root, 'src/model.js').replaceAll('\\', '/');
const mainPath = resolve(root, 'src/main.js').replaceAll('\\', '/');
const persistencePath = resolve(root, 'src/persistence.js').replaceAll('\\', '/');
const sheetPath = resolve(root, 'src/sheet.js').replaceAll('\\', '/');
const measurements = [];
const modelSource = process.env.BENCH_MODEL_REF
  ? execFileSync('git', ['show', `${process.env.BENCH_MODEL_REF}:src/model.js`], { encoding: 'utf8' })
  : readFileSync(process.env.BENCH_MODEL || modelPath, 'utf8');
mkdirSync('.local', { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'chrome' : undefined });
try {
  for (const rows of sizes) {
    const renderedLimit = pageMode === 'all' ? rows : Number(pageMode);
    const outDir = `.local/perf-${label}-${rows}`;
    await build({ configFile: false, root, logLevel: 'warn',
      resolve: process.env.BENCH_GYOS ? { alias: { 'gyosjs/csp': resolve(process.env.BENCH_GYOS) } } : undefined,
      build: { outDir }, plugins: [{
      name: 'sumboard-measurement-only', enforce: 'pre',
      transform(source, id) {
        id = id.replaceAll('\\', '/').split('?')[0];
        if (id === mainPath) return source.replace('Gyos.scope(', 'window.__benchGyos = Gyos;\nGyos.scope(');
        if (id === sheetPath) {
          if (!source.includes('const pageSize = Gyos.signal(50);')) throw Error('Pagination transform no longer matches');
          return source.replace('const pageSize = Gyos.signal(50);', `const pageSize = Gyos.signal(${renderedLimit});`);
        }
        if (id === modelPath) {
          source = modelSource;
          source = source.replace('export const MAX_ROWS = 500;', `export const MAX_ROWS = ${rows};`);
          for (const name of ['summarize', 'visibleRows']) {
            source = source.replace(`export function ${name}(`, `function measured_${name}(`);
            source += `\nexport function ${name}(...args) { const t=performance.now(); try { return measured_${name}(...args); } finally { window.__benchTimes.push({name:'${name}',ms:performance.now()-t}); } }`;
          }
          source += `\nconst originalCommit = History.prototype.commit;
History.prototype.commit = function(...args) {
  const before=this.current, t=performance.now();
  try { return originalCommit.apply(this,args); }
  finally {
    window.__benchTimes.push({name:'commit',ms:performance.now()-t});
    window.__benchShared = this.current.rows.filter((row,i)=>row===before.rows[i]).length;
  }
};`;
          return source;
        }
        if (id === persistencePath) return source + `\nconst originalSave=Persistence.prototype.save;
Persistence.prototype.save=function(...args){const t=performance.now();try{return originalSave.apply(this,args);}finally{window.__benchTimes.push({name:'save',ms:performance.now()-t});}};`;
      }
    }] });
    const server = await preview({ configFile: false, root, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const doc = { format: 'sumboard', version: 1, title: 'Measured plan', budget: 10000000,
        rows: Array.from({ length: rows }, (_, i) => ({ id: `r_perf-${i}`, name: `Item ${String(i).padStart(4, '0')}`,
          category: `Group ${i % 10}`, quantity: 1, price: i + 1, included: true, paid: false })) };
      await context.addInitScript(doc => {
        localStorage.setItem('sumboard.document.v1', JSON.stringify(doc));
        window.__benchTimes = []; window.__benchShared = null; window.__valueWrites = 0;
        const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        Object.defineProperty(HTMLInputElement.prototype, 'value', { ...value, set(next) {
          if (this.closest('tbody')) window.__valueWrites++; value.set.call(this, next);
        } });
      }, doc);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      const url = `http://127.0.0.1:${server.httpServer.address().port}`;
      await page.goto(url);
      await expect(page.locator('tbody tr')).toHaveCount(Math.min(rows, renderedLimit), { timeout: 60000 });
      const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
      for (let iteration = -1; iteration < samples; iteration++) {
        // Keep the edited row on page one in every variant. This reset is outside
        // the measured operations; all/50/100 use the same operation sequence.
        await page.evaluate(async () => {
          const state = window.__benchGyos.mountedScopes().get(document.getElementById('app'));
          state.setQuery('sort', { target: { value: 'original' } });
          await new Promise(resolve => setTimeout(resolve, 0));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        for (const operation of ['edit', 'sort', 'filter', 'restore']) {
          const beforeMetrics = await metrics();
          const result = await page.evaluate(async ({ operation, rows, iteration, renderedLimit }) => {
            const state = window.__benchGyos.mountedScopes().get(document.getElementById('app'));
            const tbody = document.querySelector('tbody');
            const beforeRows = new Map([...tbody.querySelectorAll('tr')].map(row => [row.dataset.row, row]));
            const input = tbody.querySelector('[data-row="r_perf-0"] [data-field="price"]');
            if (operation === 'edit') { input.focus(); input.value = String(10000 + iteration + 1); }
            const counts = { rowAdds: 0, rowRemoves: 0, attributes: 0, text: 0 };
            const observer = new MutationObserver(records => {
              for (const r of records) {
                counts.attributes += r.type === 'attributes'; counts.text += r.type === 'characterData';
                counts.rowAdds += [...r.addedNodes].filter(n => n.nodeName === 'TR').length;
                counts.rowRemoves += [...r.removedNodes].filter(n => n.nodeName === 'TR').length;
              }
            });
            observer.observe(tbody, { childList: true, subtree: true, attributes: true, characterData: true });
            window.__benchTimes = []; window.__benchShared = null; window.__valueWrites = 0;
            const start = performance.now();
            if (operation === 'edit') input.dispatchEvent(new Event('change', { bubbles: true }));
            if (operation === 'sort') state.sort(state.sort() === 'amount-desc' ? 'amount-asc' : 'amount-desc');
            if (operation === 'filter') state.category('Group 0');
            if (operation === 'restore') state.category('');
            const handlerMs = performance.now() - start;
            // Include the queued reactive work; completion is checked below.
            await new Promise(resolve => setTimeout(resolve, 0));
            const flushMs = performance.now() - start;
            const layoutStart = performance.now();
            tbody.getBoundingClientRect();
            const forcedLayoutMs = performance.now() - layoutStart;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const twoRafMs = performance.now() - start;
            observer.disconnect();
            const after = [...tbody.querySelectorAll('tr')];
            const survivors = after.filter(row => beforeRows.has(row.dataset.row));
            const retained = survivors.filter(row => beforeRows.get(row.dataset.row) === row).length;
            const expectedCount = Math.min(operation === 'filter' ? rows / 10 : rows, renderedLimit);
            if (after.length !== expectedCount || retained !== survivors.length) throw Error('Row count/identity regression');
            const expectedTotal = rows * (rows + 1) / 2 - 1 + 10000 + iteration + 1;
            if (state.summary().total !== expectedTotal) throw Error('Incorrect total');
            if (operation === 'edit' && document.activeElement !== input) throw Error('Edit lost focus');
            if (operation === 'sort') {
              const prices = after.map(row => Number(row.querySelector('[data-field="price"]').value));
              const descending = state.sort() === 'amount-desc';
              if (prices.some((price,i)=>i && (descending ? price>prices[i-1] : price<prices[i-1]))) throw Error('Wrong sort');
            }
            return { handlerMs, flushMs, forcedLayoutMs, twoRafMs, counts, retained,
              rowCount: after.length, valueWrites: window.__valueWrites, sharedRows: window.__benchShared,
              model: window.__benchTimes.reduce((acc, item) => {
                acc[item.name] ||= { calls: 0, ms: 0 }; acc[item.name].calls++; acc[item.name].ms += item.ms; return acc;
              }, {}) };
          }, { operation, rows, iteration, renderedLimit });
          const afterMetrics = await metrics();
          result.browser = Object.fromEntries(['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'].map(name => [name + 'Ms', (afterMetrics[name] - beforeMetrics[name]) * 1000]));
          if (iteration >= 0) measurements.push({ rows, iteration, operation, ...result });
        }
      }
      if (errors.length) throw Error(errors.join('\n'));
      await context.close();
      console.log(`${rows} rows: ${samples} measured iterations + warmup passed`);
    } finally { await new Promise(resolve => server.httpServer.close(resolve)); }
  }
  const report = { date: new Date().toISOString(), label, node: process.version, browser: browser.version(),
    os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    pageMode, sequence: 'reset original sort outside measurement; edit row 0, descending sort, filter Group 0, restore',
    sourceOverride: Boolean(process.env.BENCH_MODEL || process.env.BENCH_MODEL_REF), coreOverride: Boolean(process.env.BENCH_GYOS), gyos: JSON.parse(readFileSync('node_modules/gyosjs/package.json')).version,
    sheetSha256: createHash('sha256').update(readFileSync(sheetPath)).digest('hex'),
    templateSha256: createHash('sha256').update(readFileSync('index.html')).digest('hex'),
    mainSha256: createHash('sha256').update(readFileSync(mainPath)).digest('hex'),
    modelSha256: createHash('sha256').update(modelSource).digest('hex'),
    runtimeSha256: createHash('sha256').update(readFileSync(process.env.BENCH_GYOS || 'node_modules/gyosjs/dist/gyos.csp.esm.js')).digest('hex'),
    note: 'Instrumented production build. Warmup excluded; no throttling. >500 rows stress-only. Times overlap: do not sum. twoRafMs is not paint completion. Input setter/MutationObserver add overhead. No timing pass thresholds.', measurements };
  writeFileSync(`.local/perf-${label}.json`, JSON.stringify(report, null, 2) + '\n');
} finally { await browser.close(); }
