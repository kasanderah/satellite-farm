// 打包：esbuild 把入口和 three.js 合成一个 IIFE，再连同字体内联进单个 html（双击即可打开，不需要服务器）
import { build } from 'esbuild';
import fs from 'fs';
const b64 = f => fs.readFileSync(f).toString('base64');
const fonts = { r: b64('fonts/barlow-Regular.woff'), m: b64('fonts/barlow-Medium.woff') };
async function pack(entry, template, out) {
  const r = await build({ entryPoints: [entry], bundle: true, format: 'iife', minify: !process.env.DEV, write: false, target: 'es2020', legalComments: 'none' });
  const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  const html = fs.readFileSync(template, 'utf8')
    .replace('__FONT_R__', fonts.r).replace('__FONT_M__', fonts.m)
    .split('__BUNDLE__').join(js);
  fs.writeFileSync(out, html);
  console.log(out, (html.length / 1024).toFixed(0) + ' KB');
}
await pack('src/main.js', 'src/template.html', 'index.html');
await pack('src/lab.js', 'src/lab-template.html', 'asset-lab.html');
await pack('src/flow.js', 'src/flow-template.html', 'flow.html');
