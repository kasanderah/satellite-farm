// Headless check of the plant → grow → harvest → revenue loop, plus a few art frames.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const outDir = process.argv[2] || '/tmp/farm-shots';
fs.mkdirSync(outDir, { recursive: true });
const pageUrl = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), '../index.html')).href;
const url = (q) => pageUrl + q;

const b = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const errs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text().slice(0, 500)); });
page.on('pageerror', e => errs.push('pageerror: ' + (e.stack || e.message).slice(0, 1500)));

async function ready(q, ms = 8000) {
  await page.goto(url(q), { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 30000 });
  await new Promise(r => setTimeout(r, ms));
}

await ready('?fresh=1&rate=4', 2500);
const boot = await page.evaluate(() => {
  const f = window.__farm;
  const sel = f.selected;
  const scr = f.project(f.focus.x, 0, f.focus.z);
  const hit = scr ? f.pick(scr[0], scr[1]) : null;
  const picked = hit ? f.fieldAtWorld(hit.x, hit.z) : null;
  return {
    revenue: f.economy.revenue,
    focus: f.focus,
    sel: sel && { i: sel.i, j: sel.j, state: sel.state, crop: sel.crop, owned: sel.owned },
    scr, hit,
    pickMatch: !!(picked && sel && picked.i === sel.i && picked.j === sel.j),
    pickDist: hit && sel ? Math.hypot(hit.x - (sel.x0 + 64), hit.z - (sel.z0 + 64)) : null,
    fleet: f.harvesters.map(h => h.mode),
    dock: !!document.querySelector('#dock.on'),
    buttons: [...document.querySelectorAll('#selbtns button')].map(b => b.dataset.crop),
  };
});
console.log('BOOT', JSON.stringify(boot));
await page.screenshot({ path: outDir + '/play.png' });

// Real button, the way a reviewer plants.
await page.click('#selbtns button[data-crop="wheat"]');
const afterClick = await page.evaluate(() => {
  const s = window.__farm.selected;
  return { state: s.state, g: s.g, crop: window.__farm.CROPS[s.crop].id, live: s.live };
});
console.log('PLANTED', JSON.stringify(afterClick));

await page.evaluate(() => window.__farm.advance(3, 4));
await new Promise(r => setTimeout(r, 400));
const mid = await page.evaluate(() => {
  const s = window.__farm.selected;
  return { state: s.state, g: +s.g.toFixed(3), revenue: window.__farm.economy.revenue };
});
console.log('GROWING', JSON.stringify(mid));
await page.screenshot({ path: outDir + '/growing.png' });

const paid = await page.evaluate(() => {
  const s = window.__farm.selected;
  const id = { i: s.i, j: s.j };
  let guard = 0;
  while (!window.__farm.log.some(e => e.i === id.i && e.j === id.j) && guard++ < 80) window.__farm.advance(1, 4);
  const hit = window.__farm.log.filter(e => e.i === id.i && e.j === id.j);
  return { guard, revenue: window.__farm.economy.revenue, hit, state: window.__farm.selected.state };
});
console.log('PAID', JSON.stringify(paid));
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: outDir + '/paid.png' });

for (const [name, q] of [['far', '?view=far&fresh=1&nohud=1'], ['mid', '?view=mid&fresh=1&nohud=1'], ['near', '?view=near&fresh=1&nohud=1'], ['up', '?view=up&fresh=1&nohud=1']]) {
  await ready(q, 1800);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  const st = await page.evaluate(() => window.__stats);
  console.log(name, JSON.stringify(st));
}

if (errs.length) console.log('ERRS\n' + errs.slice(0, 20).join('\n'));
else console.log('NO ERRORS');
await b.close();
