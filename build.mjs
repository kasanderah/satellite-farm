// 打包：esbuild 把 src/*.js 和 three.js 合成一个 IIFE，再连同字体内联进单个 html（双击即可打开，不需要服务器）
import { build } from 'esbuild';
import fs from 'fs';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: !process.env.DEV, write: false, target: 'es2020', legalComments: 'none' });
const js = r.outputFiles[0].text;
const b64 = f => fs.readFileSync(f).toString('base64');
const html = fs.readFileSync('src/template.html', 'utf8')
  .replace('__FONT_R__', b64('fonts/barlow-Regular.woff')).replace('__FONT_M__', b64('fonts/barlow-Medium.woff'))
  .split('__BUNDLE__').join(js.replace(/<\/script/g, '<\\/script'));
fs.writeFileSync('index.html', html);
console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');
