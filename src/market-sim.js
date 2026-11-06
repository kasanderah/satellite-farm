// 环穗市场 market-v0.2。限价盘撮合，不追公式目标价。不进主游戏循环。
//
// 预留（主进程现在不调用）：
//   quoteFromMarket(book, id)            玩家对接域的最近成交价。
//   applyWarehouseDelta(book, id, delta) 收获为正、出售为负，改玩家在对接域的库存。
// 成交记账以后仍可由主游戏 warehouse / sellLot 负责；这里只演示盘口。

export const MARKET_VERSION = 'market-v0.2';

export const SEASONS = [
  { id: 'spring', name: '春播' },
  { id: 'summer', name: '夏长' },
  { id: 'autumn', name: '秋收' },
  { id: 'winter', name: '冬储' },
];

export const DAYS_PER_SEASON = 12;
export const TICKS_PER_DAY = 4;

export const GOODS = [
  { id: 'tuber', name: '短季薯', unit: 'L', base: 80, tags: ['薯类', '鲜食'], supply: 36, demand: 30 },
  { id: 'lastika', name: '拉斯提卡', unit: 'L', base: 120, tags: ['薯类', '鲜食'], supply: 24, demand: 22 },
  { id: 'starch', name: '土豆淀粉', unit: 'kg', base: 48, tags: ['加工', '淀粉'], supply: 16, demand: 14 },
  { id: 'grub', name: '蛴螬', unit: 'kg', base: 26, tags: ['蛋白', '活体'], supply: 20, demand: 16 },
  { id: 'protein', name: '蛋白粉', unit: 'kg', base: 36, tags: ['蛋白', '加工'], supply: 12, demand: 14 },
  { id: 'feed', name: '有机质饲料', unit: '份', base: 18, tags: ['投入', '饲料'], supply: 26, demand: 22 },
];

export const REGIONS = [
  { id: 'orbit', name: '轨道站', quota: 16 },
  { id: 'luna', name: '月面城', quota: 12 },
  { id: 'colony', name: '殖民地合约池', quota: 20 },
];

const FREIGHT = {
  'orbit>luna': { delay: 2, loss: 0.06 },
  'luna>orbit': { delay: 2, loss: 0.06 },
  'orbit>colony': { delay: 4, loss: 0.1 },
  'colony>orbit': { delay: 4, loss: 0.1 },
  'luna>colony': { delay: 3, loss: 0.08 },
  'colony>luna': { delay: 3, loss: 0.08 },
};

const REGION_SUPPLY = {
  orbit: { tuber: 0.7, lastika: 0.65, starch: 1.3, grub: 0.75, protein: 1.25, feed: 0.8 },
  luna: { tuber: 0.85, lastika: 0.8, starch: 0.9, grub: 1.25, protein: 0.9, feed: 1.3 },
  colony: { tuber: 1.4, lastika: 1.45, starch: 0.75, grub: 0.85, protein: 0.7, feed: 1.05 },
};

const SEASON_SUPPLY = {
  spring: { tuber: 0.75, lastika: 0.72, starch: 0.9, grub: 0.85, protein: 0.95, feed: 1.05 },
  summer: { tuber: 0.95, lastika: 1.2, starch: 1, grub: 1.25, protein: 1.05, feed: 0.9 },
  autumn: { tuber: 1.4, lastika: 1.3, starch: 1.15, grub: 1.05, protein: 0.95, feed: 1 },
  winter: { tuber: 0.62, lastika: 0.66, starch: 0.85, grub: 0.6, protein: 1.05, feed: 1.15 },
};
const SEASON_DEMAND = {
  spring: { tuber: 1.05, lastika: 1, starch: 0.95, grub: 0.9, protein: 1, feed: 1.15 },
  summer: { tuber: 1, lastika: 0.95, starch: 1, grub: 0.85, protein: 0.95, feed: 0.9 },
  autumn: { tuber: 0.92, lastika: 0.9, starch: 1.12, grub: 1, protein: 1, feed: 1 },
  winter: { tuber: 1.22, lastika: 1.18, starch: 1.12, grub: 1.1, protein: 1.28, feed: 1.25 },
};

export const TRADERS = [
  { id: 'guild', name: '环廊商会', home: 'orbit', style: 'chase', temperament: 'aggressive', tags: ['薯类', '淀粉'] },
  { id: 'cold', name: '冷库掌柜', home: 'orbit', style: 'quiet', temperament: 'calm', tags: ['鲜食'] },
  { id: 'protein', name: '蛋白作坊', home: 'luna', style: 'chase', temperament: 'aggressive', tags: ['蛋白'] },
  { id: 'feed', name: '饲料船', home: 'luna', style: 'quiet', temperament: 'calm', tags: ['饲料', '投入'] },
  { id: 'stall', name: '车站小贩', home: 'colony', style: 'chase', temperament: 'calm', tags: ['鲜食', '薯类'] },
  { id: 'yard', name: '检修承包', home: 'colony', style: 'quiet', temperament: 'aggressive', tags: ['加工'] },
];

export const EVENTS = [
  { id: 'cold', name: '寒潮', days: 4, blurb: '环带外侧降温，鲜货挂卖减少、买盘上移。', bid: { tuber: 1.08, lastika: 1.06 }, ask: { tuber: 1.12, lastika: 1.1, grub: 1.08 }, next: 'feed-ration', root: true },
  { id: 'feed-ration', name: '饲料配给', days: 3, blurb: '养殖槽加餐，饲料买盘变厚。', bid: { feed: 1.18 }, ask: { feed: 1.06 }, next: null, root: false },
  { id: 'harvest-rumor', name: '丰收传闻', days: 3, blurb: '薯类卖盘压低。', bid: { tuber: 0.94, lastika: 0.95 }, ask: { tuber: 0.86, lastika: 0.88 }, next: 'starch-order', root: true },
  { id: 'starch-order', name: '淀粉订单', days: 4, blurb: '外站淀粉单把买盘抬高。', bid: { starch: 1.2, tuber: 1.06 }, ask: { starch: 1.08 }, next: null, root: false },
  { id: 'protein-gap', name: '蛋白短缺', days: 4, blurb: '蛋白粉和蛴螬的买盘变急。', bid: { protein: 1.18, grub: 1.14 }, ask: { protein: 1.1 }, next: 'warehouse', root: true },
  { id: 'warehouse', name: '仓储检修', days: 3, blurb: '仓位停用，卖盘变薄。', askQty: 0.55, next: null, root: false },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function seasonOf(day) {
  const span = DAYS_PER_SEASON * SEASONS.length;
  const index = Math.floor((((day % span) + span) % span) / DAYS_PER_SEASON);
  return SEASONS[index];
}

function goodSpec(id) {
  return GOODS.find(item => item.id === id);
}

function regionBook(book, regionId, goodId) {
  return book.regions[regionId].books[goodId];
}

function pushLog(book, text) {
  book.log.unshift({ day: book.day, text });
  if (book.log.length > 16) book.log.length = 16;
}

function heatOf(entry) {
  const base = goodSpec(entry.id).base;
  return clamp((entry.last - base) / base, -1, 1);
}

export function traderDesire(trader, entry) {
  const good = goodSpec(entry.id);
  const tagged = trader.tags.some(tag => good.tags.includes(tag));
  const tagScore = tagged ? 1 : 0.3;
  const heat = heatOf(entry);
  const lean = trader.style === 'chase' ? 0.55 + heat * 0.65 : 0.55 - heat * 0.65;
  const temper = trader.temperament === 'aggressive' ? 1.3 : 0.75;
  return clamp(tagScore * lean * temper, 0.05, 2.2);
}

function eventBid(events, id) {
  let mul = 1;
  for (const ev of events) if (ev.bid?.[id]) mul *= ev.bid[id];
  return mul;
}
function eventAsk(events, id) {
  let mul = 1;
  for (const ev of events) if (ev.ask?.[id]) mul *= ev.ask[id];
  return mul;
}
function eventAskQty(events) {
  let mul = 1;
  for (const ev of events) if (ev.askQty) mul *= ev.askQty;
  return mul;
}

export function createMarket(seed = 7) {
  const rand = mulberry32(seed);
  const regions = {};
  for (const region of REGIONS) {
    const books = {};
    const stock = {};
    for (const spec of GOODS) {
      stock[spec.id] = Math.round(spec.demand * (1.4 + rand()));
      books[spec.id] = {
        id: spec.id,
        bids: [],
        asks: [],
        last: spec.base,
        prev: spec.base,
        history: [spec.base],
      };
    }
    regions[region.id] = { id: region.id, name: region.name, quota: region.quota, quotaLeft: region.quota, books, stock };
  }
  const inv = {};
  for (const spec of GOODS) inv[spec.id] = spec.id === 'tuber' ? 40 : 0;
  const book = {
    version: MARKET_VERSION,
    rand,
    day: 0,
    tick: 0,
    seq: 1,
    dock: 'orbit',
    player: { cash: 24000, inv },
    regions,
    shipments: [],
    events: [],
    log: [{ day: 0, text: '三个域开板。玩家对接轨道站。最近成交从基准价起算。' }],
  };
  for (const region of REGIONS) seedBook(book, region.id);
  return book;
}

function seedBook(book, regionId) {
  for (const spec of GOODS) {
    const entry = regionBook(book, regionId, spec.id);
    const anchor = spec.base;
    for (let i = 1; i <= 4; i++) {
      entry.bids.push(makeOrder(book, { side: 'bid', price: roundPx(anchor * (1 - 0.03 * i)), qty: 4 + i * 2, who: '开板', regionId, goodId: spec.id }));
      entry.asks.push(makeOrder(book, { side: 'ask', price: roundPx(anchor * (1 + 0.03 * i)), qty: 4 + i * 2, who: '开板', regionId, goodId: spec.id }));
    }
    sortBook(entry);
  }
}

function roundPx(n) {
  return Math.round(n * 10) / 10;
}

function makeOrder(book, spec) {
  return {
    id: book.seq++,
    seq: book.seq,
    side: spec.side,
    price: roundPx(spec.price),
    qty: Math.round(spec.qty * 10) / 10,
    who: spec.who,
    player: spec.who === 'player',
    regionId: spec.regionId,
    goodId: spec.goodId,
    backed: !!spec.backed,
  };
}

function sortBook(entry) {
  entry.bids.sort((a, b) => b.price - a.price || a.seq - b.seq);
  entry.asks.sort((a, b) => a.price - b.price || a.seq - b.seq);
}

export function depth(entry, n = 6) {
  const fold = (rows) => {
    const out = [];
    for (const row of rows) {
      const hit = out.find(item => item.price === row.price);
      if (hit) hit.qty += row.qty;
      else out.push({ price: row.price, qty: row.qty });
      if (out.length >= n) break;
    }
    return out;
  };
  return { bids: fold(entry.bids), asks: fold(entry.asks) };
}

export function matchEntry(entry) {
  sortBook(entry);
  const trades = [];
  while (entry.bids.length && entry.asks.length && entry.bids[0].price >= entry.asks[0].price - 1e-9) {
    const bid = entry.bids[0];
    const ask = entry.asks[0];
    const qty = Math.round(Math.min(bid.qty, ask.qty) * 10) / 10;
    if (!(qty > 0)) break;
    const price = bid.seq < ask.seq ? bid.price : ask.price;
    trades.push({
      price,
      qty,
      buyer: bid.who,
      seller: ask.who,
      buyerPlayer: !!bid.player,
      sellerPlayer: !!ask.player,
      bidPrice: bid.price,
      goodId: entry.id,
    });
    bid.qty = Math.round((bid.qty - qty) * 10) / 10;
    ask.qty = Math.round((ask.qty - qty) * 10) / 10;
    if (bid.qty <= 0.05) entry.bids.shift();
    if (ask.qty <= 0.05) entry.asks.shift();
  }
  if (trades.length) {
    entry.prev = entry.last;
    entry.last = trades[trades.length - 1].price;
    for (const trade of trades) entry.history.push(trade.price);
    if (entry.history.length > 72) entry.history.splice(0, entry.history.length - 72);
  }
  return trades;
}

function settle(book, trade) {
  if (trade.buyerPlayer) {
    book.player.cash += (trade.bidPrice - trade.price) * trade.qty;
    book.player.inv[trade.goodId] = (book.player.inv[trade.goodId] || 0) + trade.qty;
    book.player.cash = Math.round(book.player.cash * 10) / 10;
  }
  if (trade.sellerPlayer) {
    book.player.cash += trade.price * trade.qty;
    book.player.cash = Math.round(book.player.cash * 10) / 10;
  }
  if (trade.buyerPlayer || trade.sellerPlayer) {
    const side = trade.buyerPlayer ? '买入' : '卖出';
    pushLog(book, `${side} ${goodSpec(trade.goodId).name} ${trade.qty} @ ${trade.price}`);
  }
}

export function placeLimit(book, order) {
  const region = book.regions[order.regionId];
  const entry = region.books[order.goodId];
  let qty = Math.round(Number(order.qty) * 10) / 10;
  let price = roundPx(Number(order.price));
  if (!(qty > 0) || !(price > 0)) return { ok: false, reason: '数量或价格不对' };
  const who = order.who || 'player';
  if (who === 'player' && order.side === 'bid') {
    const afford = Math.floor((book.player.cash / price) * 10) / 10;
    if (afford <= 0) return { ok: false, reason: '现金不够' };
    qty = Math.min(qty, afford);
    book.player.cash = Math.round((book.player.cash - price * qty) * 10) / 10;
  }
  if (who === 'player' && order.side === 'ask') {
    const have = book.player.inv[order.goodId] || 0;
    if (have <= 0) return { ok: false, reason: '库存不够' };
    qty = Math.min(qty, Math.round(have * 10) / 10);
    book.player.inv[order.goodId] = Math.round((have - qty) * 10) / 10;
  }
  const made = makeOrder(book, { ...order, price, qty, who });
  (order.side === 'bid' ? entry.bids : entry.asks).push(made);
  const trades = matchEntry(entry);
  for (const trade of trades) settle(book, trade);
  if (order.rest === false) cancelOrder(book, order.regionId, made.id);
  return { ok: true, trades, order: made };
}

function refund(book, order) {
  if (!order.player || !(order.qty > 0)) return;
  if (order.side === 'bid') book.player.cash = Math.round((book.player.cash + order.price * order.qty) * 10) / 10;
  else book.player.inv[order.goodId] = Math.round(((book.player.inv[order.goodId] || 0) + order.qty) * 10) / 10;
}

export function cancelOrder(book, regionId, orderId) {
  const region = book.regions[regionId];
  if (!region) return { ok: false, reason: '域' };
  for (const good of GOODS) {
    const entry = region.books[good.id];
    for (const side of ['bids', 'asks']) {
      const index = entry[side].findIndex(order => order.id === orderId);
      if (index < 0) continue;
      const [order] = entry[side].splice(index, 1);
      if (order.backed) region.stock[good.id] += order.qty;
      refund(book, order);
      return { ok: true };
    }
  }
  return { ok: false, reason: '没有这张单' };
}

export function takeOrder(book, { regionId, goodId, side, qty }) {
  const entry = regionBook(book, regionId, goodId);
  sortBook(entry);
  if (side === 'buy') {
    if (!entry.asks.length) return { ok: false, reason: '卖盘是空的' };
    return placeLimit(book, { regionId, goodId, side: 'bid', price: entry.asks[0].price * 5 + 1, qty, who: 'player', rest: false });
  }
  if (!entry.bids.length) return { ok: false, reason: '买盘是空的' };
  return placeLimit(book, { regionId, goodId, side: 'ask', price: 0.1, qty, who: 'player', rest: false });
}

function dropNpc(book, regionId) {
  const region = book.regions[regionId];
  for (const spec of GOODS) {
    const entry = region.books[spec.id];
    for (const side of ['bids', 'asks']) {
      const keep = [];
      for (const order of entry[side]) {
        if (order.player) keep.push(order);
        else if (order.backed) region.stock[spec.id] += order.qty;
      }
      entry[side] = keep;
    }
  }
}

function postLiquidity(book, regionId) {
  const season = seasonOf(book.day);
  const region = book.regions[regionId];
  for (const spec of GOODS) {
    const entry = region.books[spec.id];
    const supplyMul = (SEASON_SUPPLY[season.id][spec.id] || 1) * (REGION_SUPPLY[regionId][spec.id] || 1) * eventAsk(book.events, spec.id);
    const demandMul = (SEASON_DEMAND[season.id][spec.id] || 1) * eventBid(book.events, spec.id);
    const made = spec.supply * supplyMul * 0.22;
    region.stock[spec.id] += made;
    const askShift = eventAsk(book.events, spec.id);
    const bidShift = eventBid(book.events, spec.id);
    const sellQty = Math.min(region.stock[spec.id], spec.supply * 0.35 * eventAskQty(book.events));
    if (sellQty > 0.5) {
      const slices = 3;
      const each = sellQty / slices;
      for (let i = 0; i < slices; i++) {
        const price = roundPx(entry.last * askShift * (0.99 + i * 0.025));
        entry.asks.push(makeOrder(book, { side: 'ask', price, qty: each, who: '产地', regionId, goodId: spec.id, backed: true }));
        region.stock[spec.id] -= each;
      }
    }
    const locals = TRADERS.filter(trader => trader.home === regionId);
    const desire = locals.reduce((sum, trader) => sum + traderDesire(trader, entry), 0) || 0.4;
    const buyQty = spec.demand * demandMul * 0.18 * clamp(desire, 0.35, 1.8);
    for (let i = 0; i < 3; i++) {
      const aggressive = locals.some(trader => trader.temperament === 'aggressive');
      const gap = aggressive ? 0.01 : 0.03;
      const price = roundPx(entry.last * bidShift * (1.01 - gap * i));
      const who = locals[i % Math.max(locals.length, 1)]?.name || '买盘';
      entry.bids.push(makeOrder(book, { side: 'bid', price, qty: buyQty / 3, who, regionId, goodId: spec.id }));
    }
    const trades = matchEntry(entry);
    for (const trade of trades) settle(book, trade);
  }
}

function considerFreight(book) {
  for (const spec of GOODS) {
    const ranked = REGIONS.map(region => ({
      id: region.id,
      last: book.regions[region.id].books[spec.id].last,
      stock: book.regions[region.id].stock[spec.id],
    })).sort((a, b) => a.last - b.last);
    const cheap = ranked[0];
    const dear = ranked[ranked.length - 1];
    const route = FREIGHT[cheap.id + '>' + dear.id];
    if (!route || dear.last < cheap.last * 1.07) continue;
    const from = book.regions[cheap.id];
    const qty = Math.min(6, from.quotaLeft, from.stock[spec.id]);
    if (qty < 1) continue;
    from.stock[spec.id] -= qty;
    from.quotaLeft -= qty;
    book.shipments.push({ from: cheap.id, to: dear.id, goodId: spec.id, qty, left: route.delay, loss: route.loss });
    pushLog(book, `${regionName(cheap.id)} → ${regionName(dear.id)} 发出${spec.name} ${Math.round(qty)}，${route.delay} 刻后到，损耗 ${Math.round(route.loss * 100)}%。`);
  }
}

function regionName(id) {
  return REGIONS.find(item => item.id === id)?.name || id;
}

function arriveFreight(book) {
  const pending = [];
  for (const ship of book.shipments) {
    ship.left -= 1;
    if (ship.left > 0) {
      pending.push(ship);
      continue;
    }
    const landed = Math.round(ship.qty * (1 - ship.loss) * 10) / 10;
    const entry = regionBook(book, ship.to, ship.goodId);
    const hit = Math.max(0.5, landed * 0.55);
    const rest = Math.max(0, landed - hit);
    book.regions[ship.to].stock[ship.goodId] += rest;
    if (entry.bids.length) {
      placeLimit(book, {
        regionId: ship.to,
        goodId: ship.goodId,
        side: 'ask',
        price: entry.bids[0].price,
        qty: hit,
        who: '货运',
        rest: false,
      });
    } else book.regions[ship.to].stock[ship.goodId] += hit;
    pushLog(book, `${regionName(ship.to)} 收到${goodSpec(ship.goodId).name} ${landed}（已扣损耗）。`);
  }
  book.shipments = pending;
}

function ageEvents(book) {
  const next = [];
  for (const ev of book.events) {
    ev.left -= 1;
    if (ev.left > 0) {
      next.push(ev);
      continue;
    }
    pushLog(book, `事件结束：${ev.name}。`);
    if (ev.next && book.rand() < 0.62 && !next.some(item => item.id === ev.next)) {
      const follow = EVENTS.find(item => item.id === ev.next);
      if (follow) {
        next.push({ ...follow, left: follow.days });
        pushLog(book, `事件接上：${follow.name}。${follow.blurb}`);
      }
    }
  }
  book.events = next;
  if (book.events.length < 2 && book.rand() < 0.2) {
    const roots = EVENTS.filter(item => item.root && !book.events.some(ev => ev.id === item.id));
    if (roots.length) {
      const pick = roots[Math.floor(book.rand() * roots.length)];
      book.events.push({ ...pick, left: pick.days });
      pushLog(book, `事件开始：${pick.name}。${pick.blurb}`);
    }
  }
}

export function stepTick(book) {
  for (const region of REGIONS) book.regions[region.id].quotaLeft = book.regions[region.id].quota;
  arriveFreight(book);
  for (const region of REGIONS) {
    dropNpc(book, region.id);
    postLiquidity(book, region.id);
  }
  considerFreight(book);
  book.tick += 1;
  if (book.tick >= TICKS_PER_DAY) {
    book.tick = 0;
    book.day += 1;
    ageEvents(book);
  }
  return book;
}

export function stepMarket(book, kind) {
  if (kind === 'season') {
    const span = DAYS_PER_SEASON * SEASONS.length;
    const index = SEASONS.findIndex(item => item.id === seasonOf(book.day).id);
    const target = ((index + 1) % SEASONS.length) * DAYS_PER_SEASON;
    const forward = (target - (book.day % span) + span) % span || span;
    for (let i = 0; i < forward * TICKS_PER_DAY; i++) stepTick(book);
    pushLog(book, `换季，进入${seasonOf(book.day).name}。`);
    return book;
  }
  const n = kind === 'day' ? TICKS_PER_DAY : 1;
  for (let i = 0; i < n; i++) stepTick(book);
  return book;
}

export function quoteFromMarket(book, id) {
  const region = book?.regions?.[book.dock || 'orbit'];
  const entry = region?.books?.[id];
  return entry ? entry.last : 0;
}

export function applyWarehouseDelta(book, id, delta) {
  if (!book?.player || !Number.isFinite(delta) || !goodSpec(id)) return null;
  const next = Math.max(0, (book.player.inv[id] || 0) + delta);
  book.player.inv[id] = Math.round(next * 10) / 10;
  return book.player.inv[id];
}

export function regionQuote(book, regionId, goodId) {
  return book.regions[regionId]?.books[goodId]?.last || 0;
}
