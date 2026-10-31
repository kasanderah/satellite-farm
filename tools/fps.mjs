// 真实帧率测量（墙钟 10 秒内 requestAnimationFrame 次数）：node tools/fps.mjs "<query>" [warmSec]
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
const pageUrl = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), '../index.html')).href;
const [, , q = '?view=far', warm = '40'] = process.argv;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
await p.goto(pageUrl + q);
await new Promise(r => setTimeout(r, +warm * 1000));
const r = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 10000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
console.log(q, 'fps', r.toFixed(1));
await b.close();
