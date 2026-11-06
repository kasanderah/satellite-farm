import { flowModel, utilityCost } from './products.js';

const $ = id => document.getElementById(id);
const model = flowModel();
const money = n => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));

function utilLine(utilities, stub) {
  const parts = Object.entries(utilities || {}).map(([id, qty]) => {
    const p = model.products.find(x => x.id === id);
    return `${p ? p.nameZh : id} ${qty}`;
  });
  if (!parts.length) return '';
  const tail = stub ? '（田面这一笔先不扣，开局营收是 0 仍能播种）' : `共 ${money(utilityCost(utilities))}`;
  return parts.join(' · ') + ' ' + tail;
}

function chipHtml(c, role) {
  const price = role === 'out' && c.sellPrice != null
    ? `牌价 ${money(c.sellPrice)}`
    : role === 'in' && c.buyPrice != null
      ? `买价 ${money(c.buyPrice)}`
      : (c.tag || '');
  const qty = `${c.qty == null ? '' : c.qty}${c.unit ? ' ' + c.unit : ''}`.trim();
  return `<div class="chip ${role}"><b>${c.nameZh}</b><small>${qty}</small><em>${price}</em></div>`;
}

function stageHtml(stage) {
  const inputs = stage.inputs.map(c => chipHtml(c, 'in')).join('');
  const outputs = stage.outputs.map(c => chipHtml(c, 'out')).join('');
  const device = stage.device
    ? `<p class="dev">设备 ${stage.device.nameZh} · 培育层非中枢 · 建造 ${money(stage.device.buildCost)} · ${stage.device.buildDays} 日</p>`
    : '';
  const offsets = stage.offsets.map(o => `<p class="off">${o.note}</p>`).join('');
  const util = utilLine(stage.utilities, stage.stub);
  return `<section class="stage">
    <div class="col ins">${inputs}</div>
    <div class="arr" aria-hidden="true">→</div>
    <div class="col mid">
      <div class="proc"><b>${stage.nameZh}</b><small>${stage.timeDays} 世界日</small>${util ? `<em>${util}</em>` : ''}</div>
      ${device}
    </div>
    <div class="arr" aria-hidden="true">→</div>
    <div class="col outs">${outputs}</div>
    ${offsets}
  </section>`;
}

const notes = model.products.filter(p => p.note).map(p => `<li><b>${p.nameZh}</b> · ${p.note}</li>`).join('');
const offsetRows = model.offsets.map(o => {
  const from = model.products.find(p => p.id === o.from);
  const to = model.products.find(p => p.id === o.to);
  return `<li><b>${from?.nameZh || o.from}</b> → <b>${to?.nameZh || o.to}</b> · 最多抵 ${Math.round(o.maxFraction * 100)}% · ${o.note}</li>`;
}).join('');

$('board').innerHTML = model.stages.map(stageHtml).join('')
  + `<section class="caps"><h2>抵扣上限</h2><ul>${offsetRows}</ul>${notes ? `<ul>${notes}</ul>` : ''}<p class="note">蛋白砖（第三档）这一轮不做。黑水虻仍可养，不画进这条土豆环。</p></section>`;
