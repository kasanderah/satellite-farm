import {
  MARKET_VERSION, SEASONS, GOODS, TRADERS, createMarket, stepMarket, seasonOf, traderDesire, heatOf,
} from './market-sim.js';

const book = createMarket(7);
let selected = 'tuber';
let timer = 0;

const $ = id => document.getElementById(id);

function fmt(n) {
  return (Math.round(n * 10) / 10).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function signed(n) {
  const v = Math.round(n * 10) / 10;
  if (v > 0) return '+' + fmt(v);
  return fmt(v);
}

function paintClock() {
  const season = seasonOf(book.day);
  $('day').textContent = String(book.day);
  $('season').textContent = season.name;
  $('tick').textContent = `${book.tick + 1}/4`;
  $('auto').classList.toggle('on', timer !== 0);
}

function paintGoods() {
  const host = $('goods');
  host.innerHTML = GOODS.map(spec => {
    const good = book.goods[spec.id];
    const delta = good.price - good.prev;
    const cls = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : '';
    const season = seasonOf(book.day).name;
    return `<button type="button" class="row${selected === spec.id ? ' on' : ''}" data-good="${spec.id}">
      <b>${good.name}</b>
      <span class="px ${cls}">${fmt(good.price)}</span>
      <span class="${cls}">${signed(delta)}</span>
      <span>${Math.round(good.stock)}</span>
      <span>${good.gap > 0 ? '缺 ' + good.gap : '余 ' + Math.abs(good.gap)}</span>
      <em>${season}</em>
    </button>`;
  }).join('');
}

function paintChart() {
  const good = book.goods[selected];
  const canvas = $('chart');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(188,195,196,.25)';
  ctx.beginPath();
  ctx.moveTo(8, h / 2);
  ctx.lineTo(w - 8, h / 2);
  ctx.stroke();
  const pts = good.history.length ? good.history : [good.price];
  const lo = Math.min(...pts, good.base) * 0.92;
  const hi = Math.max(...pts, good.base) * 1.08;
  const xOf = i => 8 + (pts.length < 2 ? 0 : i / (pts.length - 1)) * (w - 16);
  const yOf = v => h - 10 - ((v - lo) / Math.max(0.001, hi - lo)) * (h - 20);
  ctx.strokeStyle = '#d8693c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pts.forEach((v, i) => {
    const x = xOf(i);
    const y = yOf(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#e8d8d0';
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(xOf(pts.length - 1), yOf(last), 3, 0, Math.PI * 2);
  ctx.fill();
  $('chart-cap').textContent = `${good.name} · 近 ${pts.length} 日 · 基准 ${fmt(good.base)}`;
}

function paintDetail() {
  const good = book.goods[selected];
  const liveSeason = seasonOf(book.day).name;
  const parts = good.parts || { seasonMul: 1, gapMul: 1, npcMul: 1, target: good.base, season: liveSeason };
  parts.season = liveSeason;
  $('detail-name').textContent = good.name;
  $('detail-meta').textContent = `${good.tags.join(' · ')} · ${good.unit}`;
  $('factors').innerHTML = [
    ['基准', fmt(good.base)],
    ['季节 ' + parts.season, '×' + fmt(parts.seasonMul)],
    ['仓储缺口', '×' + fmt(parts.gapMul)],
    ['买卖者', '×' + fmt(parts.npcMul)],
    ['目标价', fmt(parts.target)],
  ].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  paintChart();
}

function paintTraders() {
  const good = book.goods[selected];
  $('traders').innerHTML = TRADERS.map(trader => {
    const desire = traderDesire(trader, good);
    const heat = heatOf(good);
    const lean = trader.style === 'chase' ? '追高' : '冷门';
    const temper = trader.temperament === 'aggressive' ? '激进' : '保守';
    return `<article>
      <b>${trader.name}</b>
      <small>${lean} · ${temper} · ${trader.tags.join('、')}</small>
      <em>对${good.name}兴趣 ${fmt(desire)} · 热度 ${signed(heat)}</em>
    </article>`;
  }).join('');
}

function paintEvents() {
  const host = $('events');
  if (!book.events.length) {
    host.innerHTML = '<p class="muted">眼下没有宏观事件。</p>';
  } else {
    host.innerHTML = book.events.map(ev => `<article><b>${ev.name}</b><small>还剩 ${ev.left} 日</small><em>${ev.blurb}</em></article>`).join('');
  }
  $('log').innerHTML = book.log.map(row => `<li><span>第 ${row.day} 日</span>${row.text}</li>`).join('');
}

function paint() {
  paintClock();
  paintGoods();
  paintDetail();
  paintTraders();
  paintEvents();
}

function go(kind) {
  stepMarket(book, kind);
  paint();
}

$('goods').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-good]');
  if (!btn) return;
  selected = btn.dataset.good;
  paint();
});
$('tick-btn').addEventListener('click', () => go('tick'));
$('day-btn').addEventListener('click', () => go('day'));
$('season-btn').addEventListener('click', () => go('season'));
$('auto').addEventListener('click', () => {
  if (timer) {
    clearInterval(timer);
    timer = 0;
  } else {
    timer = setInterval(() => go('tick'), 700);
  }
  paintClock();
});

$('rev').textContent = MARKET_VERSION;
paint();

window.__market = { book, SEASONS, go, get selected() { return selected; } };
