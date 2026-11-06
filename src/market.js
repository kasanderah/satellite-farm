import {
  MARKET_VERSION, GOODS, REGIONS, TRADERS, createMarket, stepMarket, seasonOf,
  placeLimit, takeOrder, cancelOrder, depth, traderDesire, regionQuote,
} from './market-sim.js';

const book = createMarket(7);
let selected = 'tuber';
let timer = 0;
const $ = id => document.getElementById(id);

function fmt(n) {
  const v = Math.round(Number(n) * 10) / 10;
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function signed(n) {
  const v = Math.round(n * 10) / 10;
  return (v > 0 ? '+' : '') + fmt(v);
}
function entry() {
  return book.regions[book.dock].books[selected];
}

function paintChrome() {
  const season = seasonOf(book.day);
  $('day').textContent = String(book.day);
  $('season').textContent = season.name;
  $('tick').textContent = `${book.tick + 1}/4`;
  $('cash').textContent = fmt(book.player.cash);
  $('dock').value = book.dock;
  $('auto').classList.toggle('on', timer !== 0);
  const good = GOODS.find(item => item.id === selected);
  $('held').textContent = `${fmt(book.player.inv[selected] || 0)} ${good.unit}`;
}

function paintGoods() {
  $('goods').innerHTML = GOODS.map(spec => {
    const row = book.regions[book.dock].books[spec.id];
    const delta = row.last - row.prev;
    const cls = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : '';
    return `<button type="button" class="row${selected === spec.id ? ' on' : ''}" data-good="${spec.id}">
      <b>${spec.name}</b>
      <span class="px ${cls}">${fmt(row.last)}</span>
      <span class="${cls}">${signed(delta)}</span>
      <span>${fmt(book.player.inv[spec.id] || 0)}</span>
    </button>`;
  }).join('');
}

function paintBook() {
  const row = entry();
  const fold = depth(row, 6);
  const max = Math.max(1, ...fold.bids.map(item => item.qty), ...fold.asks.map(item => item.qty));
  const line = (item, side) => `<div class="lvl ${side}"><i style="width:${Math.max(8, item.qty / max * 100)}%"></i><span>${fmt(item.price)}</span><em>${fmt(item.qty)}</em></div>`;
  $('asks').innerHTML = fold.asks.slice().reverse().map(item => line(item, 'ask')).join('') || '<p class="muted">卖盘空</p>';
  $('bids').innerHTML = fold.bids.map(item => line(item, 'bid')).join('') || '<p class="muted">买盘空</p>';
  const bestAsk = fold.asks[0];
  const bestBid = fold.bids[0];
  $('spread').textContent = bestAsk && bestBid ? `价差 ${fmt(bestAsk.price - bestBid.price)}` : '价差 —';
  $('last').textContent = fmt(row.last);
  paintChart(row);
}

function paintChart(row) {
  const canvas = $('chart');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const pts = row.history.length ? row.history : [row.last];
  const lo = Math.min(...pts) * 0.96;
  const hi = Math.max(...pts) * 1.04;
  const xOf = i => 10 + (pts.length < 2 ? 0 : i / (pts.length - 1)) * (w - 20);
  const yOf = v => h - 12 - ((v - lo) / Math.max(0.001, hi - lo)) * (h - 24);
  ctx.strokeStyle = 'rgba(188,195,196,.2)';
  ctx.beginPath();
  ctx.moveTo(8, yOf(row.last));
  ctx.lineTo(w - 8, yOf(row.last));
  ctx.stroke();
  ctx.strokeStyle = '#d8693c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pts.forEach((v, i) => {
    const x = xOf(i);
    const y = yOf(v);
    if (i === 0) ctx.moveTo(x, y);
    else {
      ctx.lineTo(x, yOf(pts[i - 1]));
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  $('chart-cap').textContent = `${GOODS.find(item => item.id === selected).name} · ${book.regions[book.dock].name} · ${pts.length} 笔`;
}

function paintSpread() {
  const spec = GOODS.find(item => item.id === selected);
  const here = regionQuote(book, book.dock, selected);
  $('gaps').innerHTML = REGIONS.map(region => {
    const px = regionQuote(book, region.id, selected);
    const gap = px - here;
    return `<div><small>${region.name}</small><b>${fmt(px)}</b><em class="${gap > 0.05 ? 'up' : gap < -0.05 ? 'down' : ''}">${region.id === book.dock ? '对接' : signed(gap)}</em></div>`;
  }).join('') + `<p class="muted">${spec.name}。跨域货运有延迟、配额和损耗，玩家不运货。</p>`;
}

function paintTrade() {
  const mine = [];
  for (const spec of GOODS) {
    const row = book.regions[book.dock].books[spec.id];
    for (const order of [...row.bids, ...row.asks]) {
      if (!order.player) continue;
      mine.push(`<button type="button" data-cancel="${order.id}">${order.side === 'bid' ? '买' : '卖'} ${spec.name} ${fmt(order.qty)} @ ${fmt(order.price)} · 撤</button>`);
    }
  }
  $('mine').innerHTML = mine.join('') || '<p class="muted">这个域没有你的挂单。</p>';
  const ships = book.shipments.filter(ship => ship.goodId === selected);
  $('ships').textContent = ships.length
    ? ships.map(ship => `${book.regions[ship.from].name}→${book.regions[ship.to].name} ${fmt(ship.qty)} · ${ship.left} 刻`).join('；')
    : '这条货没有在途。';
}

function paintTraders() {
  const row = entry();
  $('traders').innerHTML = TRADERS.map(trader => {
    const desire = traderDesire(trader, row);
    const home = REGIONS.find(item => item.id === trader.home).name;
    return `<article><b>${trader.name}</b><small>${home} · ${trader.style === 'chase' ? '追高' : '冷门'} · ${trader.temperament === 'aggressive' ? '激进' : '保守'} · ${trader.tags.join('、')}</small><em>对当前货兴趣 ${fmt(desire)}</em></article>`;
  }).join('');
}

function paintEvents() {
  $('events').innerHTML = book.events.length
    ? book.events.map(ev => `<article><b>${ev.name}</b><small>还剩 ${ev.left} 日</small><em>${ev.blurb}</em></article>`).join('')
    : '<p class="muted">眼下没有宏观事件。</p>';
  $('log').innerHTML = book.log.map(item => `<li><span>第 ${item.day} 日</span>${item.text}</li>`).join('');
}

function paint() {
  paintChrome();
  paintGoods();
  paintBook();
  paintSpread();
  paintTrade();
  paintTraders();
  paintEvents();
}

function go(kind) {
  stepMarket(book, kind);
  paint();
}

function qty() {
  return Number($('qty').value);
}
function px() {
  return Number($('px').value);
}
function note(text) {
  $('trade-note').textContent = text || '';
}

$('goods').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-good]');
  if (!btn) return;
  selected = btn.dataset.good;
  const row = entry();
  $('px').value = String(row.last);
  paint();
});
$('dock').addEventListener('change', (e) => {
  book.dock = e.target.value;
  $('px').value = String(entry().last);
  paint();
});
$('tick-btn').addEventListener('click', () => go('tick'));
$('day-btn').addEventListener('click', () => go('day'));
$('season-btn').addEventListener('click', () => go('season'));
$('auto').addEventListener('click', () => {
  if (timer) {
    clearInterval(timer);
    timer = 0;
  } else timer = setInterval(() => go('tick'), 800);
  paint();
});
$('buy-take').addEventListener('click', () => {
  const res = takeOrder(book, { regionId: book.dock, goodId: selected, side: 'buy', qty: qty() });
  note(res.ok ? `吃单买入 ${res.trades?.length || 0} 笔` : res.reason);
  paint();
});
$('sell-take').addEventListener('click', () => {
  const res = takeOrder(book, { regionId: book.dock, goodId: selected, side: 'sell', qty: qty() });
  note(res.ok ? `吃单卖出 ${res.trades?.length || 0} 笔` : res.reason);
  paint();
});
$('buy-limit').addEventListener('click', () => {
  const res = placeLimit(book, { regionId: book.dock, goodId: selected, side: 'bid', price: px(), qty: qty(), who: 'player' });
  note(res.ok ? '买单已挂上，穿过盘口的部分会立刻成交' : res.reason);
  paint();
});
$('sell-limit').addEventListener('click', () => {
  const res = placeLimit(book, { regionId: book.dock, goodId: selected, side: 'ask', price: px(), qty: qty(), who: 'player' });
  note(res.ok ? '卖单已挂上，穿过盘口的部分会立刻成交' : res.reason);
  paint();
});
$('mine').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cancel]');
  if (!btn) return;
  cancelOrder(book, book.dock, Number(btn.dataset.cancel));
  note('已撤单');
  paint();
});

$('rev').textContent = MARKET_VERSION;
$('px').value = String(entry().last);
paint();
window.__market = { book, go, get selected() { return selected; } };
