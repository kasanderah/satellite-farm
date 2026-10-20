// 无头 Chrome 截图：node tools/shoot.mjs <query> <out.png> [waitSec] [laterSec out2.png]
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
const pageUrl = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), '../index.html')).href;
const [, , q, out, wait = '6', later, out2] = process.argv;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const errs = []; p.on('console', m => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text().slice(0, 400)); }); p.on('pageerror', e => errs.push('pageerror: ' + (e.stack||e.message).slice(0, 1500)));
await p.goto(pageUrl + (q || ''));
await new Promise(r => setTimeout(r, +wait * 1000));
const s1 = await p.evaluate(() => window.__stats);
await p.screenshot({ path: out });
console.log(JSON.stringify(s1));
if (later) { await new Promise(r => setTimeout(r, +later * 1000)); const s2 = await p.evaluate(() => window.__stats); await p.screenshot({ path: out2 }); console.log(JSON.stringify(s2)); }
if (errs.length) console.log(errs.slice(0, 12).join('\n'));
await b.close();
