// 环穗市场原型 market-v0.1。不进主游戏循环。
//
// 预留接口（现在没有人调用）：
//   quoteFromMarket(book, id)           现价。以后可替换 _shared.quote 的常数牌价。
//   applyWarehouseDelta(book, id, delta) 收获入仓为正，出售出仓为负。下一刻进缺口。
// 成交、入仓、扣营收仍留在主进程的 warehouse / sellLot。这里只出价格、收库存影子。

export const MARKET_VERSION = 'market-v0.1';

export const SEASONS = [
  { id: 'spring', name: '春播' },
  { id: 'summer', name: '夏长' },
  { id: 'autumn', name: '秋收' },
  { id: 'winter', name: '冬储' },
];

const DAYS_PER_SEASON = 12;
const TICKS_PER_DAY = 4;
const HISTORY = 48;

export const GOODS = [
  { id: 'tuber', name: '短季薯', unit: 'L', base: 80, tags: ['薯类', '鲜食'], supply: 42, demand: 36 },
  { id: 'lastika', name: '拉斯提卡', unit: 'L', base: 120, tags: ['薯类', '鲜食'], supply: 28, demand: 26 },
  { id: 'starch', name: '土豆淀粉', unit: 'kg', base: 48, tags: ['加工', '淀粉'], supply: 18, demand: 16 },
  { id: 'grub', name: '蛴螬', unit: 'kg', base: 26, tags: ['蛋白', '活体'], supply: 22, demand: 18 },
  { id: 'protein', name: '蛋白粉', unit: 'kg', base: 36, tags: ['蛋白', '加工'], supply: 14, demand: 15 },
  { id: 'feed', name: '有机质饲料', unit: '份', base: 18, tags: ['投入', '饲料'], supply: 30, demand: 24 },
];

// 大于 1 表示这一季上市偏多。需求系数另表。
const SEASON_SUPPLY = {
  spring: { tuber: 0.72, lastika: 0.7, starch: 0.9, grub: 0.85, protein: 0.95, feed: 1.05 },
  summer: { tuber: 0.95, lastika: 1.2, starch: 1, grub: 1.25, protein: 1.05, feed: 0.9 },
  autumn: { tuber: 1.45, lastika: 1.35, starch: 1.2, grub: 1.05, protein: 0.95, feed: 1 },
  winter: { tuber: 0.62, lastika: 0.66, starch: 0.85, grub: 0.6, protein: 1.05, feed: 1.15 },
};
const SEASON_DEMAND = {
  spring: { tuber: 1.05, lastika: 1, starch: 0.95, grub: 0.9, protein: 1, feed: 1.15 },
  summer: { tuber: 1, lastika: 0.95, starch: 1, grub: 0.85, protein: 0.95, feed: 0.9 },
  autumn: { tuber: 0.9, lastika: 0.92, starch: 1.1, grub: 1, protein: 1, feed: 1 },
  winter: { tuber: 1.2, lastika: 1.18, starch: 1.15, grub: 1.1, protein: 1.25, feed: 1.3 },
};

export const TRADERS = [
  { id: 'guild', name: '环廊商会', style: 'chase', temperament: 'aggressive', tags: ['薯类', '淀粉'] },
  { id: 'cold', name: '冷库掌柜', style: 'quiet', temperament: 'calm', tags: ['鲜食'] },
  { id: 'protein', name: '蛋白作坊', style: 'chase', temperament: 'aggressive', tags: ['蛋白'] },
  { id: 'feed', name: '饲料船', style: 'quiet', temperament: 'calm', tags: ['饲料', '投入'] },
  { id: 'stall', name: '车站小贩', style: 'chase', temperament: 'calm', tags: ['鲜食', '薯类'] },
  { id: 'yard', name: '检修承包', style: 'quiet', temperament: 'aggressive', tags: ['加工'] },
];

export const EVENTS = [
  { id: 'cold', name: '寒潮', days: 4, blurb: '环带外侧降温，鲜货收不上来。', supply: { tuber: 0.7, lastika: 0.75, grub: 0.8 }, demand: { feed: 1.25, protein: 1.1 }, next: 'feed-ration', root: true },
  { id: 'feed-ration', name: '饲料配给', days: 3, blurb: '养殖槽加餐，饲料变紧。', demand: { feed: 1.45 }, next: null, root: false },
  { id: 'harvest-rumor', name: '丰收传闻', days: 3, blurb: '薯类将集中上市。', supply: { tuber: 1.35, lastika: 1.3 }, next: 'starch-order', root: true },
  { id: 'starch-order', name: '淀粉订单', days: 4, blurb: '加工棚接到外站淀粉单。', demand: { starch: 1.5, tuber: 1.15 }, next: null, root: false },
  { id: 'protein-gap', name: '蛋白短缺', days: 4, blurb: '蛋白粉库存告急。', demand: { protein: 1.4, grub: 1.35 }, next: 'warehouse', root: true },
  { id: 'warehouse', name: '仓储检修', days: 3, blurb: '一部分仓位停用，账面存货按七成计。', stockFeel: 0.72, next: null, root: false },
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

function eventById(id) {
  return EVENTS.find(item => item.id === id) || null;
}

export function seasonOf(day) {
  const index = Math.floor(((day % (DAYS_PER_SEASON * 4)) + DAYS_PER_SEASON * 4) % (DAYS_PER_SEASON * 4) / DAYS_PER_SEASON);
  return SEASONS[index];
}

function factor(table, seasonId, goodId) {
  return table[seasonId]?.[goodId] ?? 1;
}

function eventSupply(events, id) {
  let mul = 1;
  for (const ev of events) if (ev.supply?.[id]) mul *= ev.supply[id];
  return mul;
}

function eventDemand(events, id) {
  let mul = 1;
  for (const ev of events) if (ev.demand?.[id]) mul *= ev.demand[id];
  return mul;
}

function stockFeel(events) {
  let mul = 1;
  for (const ev of events) if (ev.stockFeel) mul *= ev.stockFeel;
  return mul;
}

export function createMarket(seed = 7) {
  const rand = mulberry32(seed);
  const goods = {};
  for (const spec of GOODS) {
    const stock = Math.round(spec.demand * (2.2 + rand() * 1.4));
    goods[spec.id] = {
      id: spec.id,
      name: spec.name,
      unit: spec.unit,
      base: spec.base,
      tags: spec.tags.slice(),
      supply: spec.supply,
      demand: spec.demand,
      price: spec.base,
      prev: spec.base,
      stock,
      gap: spec.demand - stock,
      history: [spec.base],
    };
  }
  return {
    version: MARKET_VERSION,
    seed,
    rand,
    day: 0,
    tick: 0,
    goods,
    events: [],
    log: [{ day: 0, text: '市场开板。牌价从基准价起算，还没有宏观事件。' }],
  };
}

export function heatOf(good) {
  if (!(good.base > 0)) return 0;
  return clamp((good.price - good.base) / good.base, -1, 1);
}

export function traderDesire(trader, good) {
  const tagged = trader.tags.some(tag => good.tags.includes(tag));
  const tagScore = tagged ? 1 : 0.28;
  const heat = heatOf(good);
  const lean = trader.style === 'chase' ? 0.55 + heat * 0.7 : 0.55 - heat * 0.7;
  const temper = trader.temperament === 'aggressive' ? 1.35 : 0.72;
  return clamp(tagScore * lean * temper, 0, 2.2);
}

function npcFlow(book, good) {
  let buy = 0;
  let sell = 0;
  const notes = [];
  for (const trader of TRADERS) {
    const desire = traderDesire(trader, good);
    const jitter = 0.85 + book.rand() * 0.3;
    const lots = desire * jitter * (good.demand * 0.08);
    buy += lots;
    sell += (1.15 - Math.min(desire, 1.15)) * jitter * (good.supply * 0.05);
    if (desire > 1.05) notes.push(trader.name);
  }
  return { buy, sell, notes };
}

export function priceParts(book, good) {
  const season = seasonOf(book.day);
  const supplyMul = factor(SEASON_SUPPLY, season.id, good.id) * eventSupply(book.events, good.id);
  const demandMul = factor(SEASON_DEMAND, season.id, good.id) * eventDemand(book.events, good.id);
  const felt = Math.max(0, good.stock) * stockFeel(book.events);
  const need = good.demand * demandMul;
  const gapMul = clamp((need + 24) / (felt + 24), 0.72, 1.55);
  const flow = npcFlow(book, good);
  const npcMul = clamp(1 + (flow.buy - flow.sell) / Math.max(40, good.demand * 6), 0.9, 1.16);
  const seasonMul = clamp(demandMul / Math.max(0.35, supplyMul), 0.55, 1.85);
  const target = good.base * seasonMul * gapMul * npcMul;
  return {
    season: season.name,
    seasonMul,
    supplyMul,
    demandMul,
    gapMul,
    npcMul,
    gap: need - felt,
    target,
    flow,
  };
}

function pushLog(book, text) {
  book.log.unshift({ day: book.day, text });
  if (book.log.length > 14) book.log.length = 14;
}

function maybeOpenEvent(book) {
  if (book.events.length >= 2) return;
  if (book.rand() > 0.22) return;
  const roots = EVENTS.filter(item => item.root && !book.events.some(ev => ev.id === item.id));
  if (!roots.length) return;
  const pick = roots[Math.floor(book.rand() * roots.length)];
  book.events.push({ ...pick, left: pick.days });
  pushLog(book, `事件开始：${pick.name}。${pick.blurb}`);
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
    if (ev.next && book.rand() < 0.62 && !book.events.some(item => item.id === ev.next) && !next.some(item => item.id === ev.next)) {
      const follow = eventById(ev.next);
      if (follow) {
        next.push({ ...follow, left: follow.days });
        pushLog(book, `事件接上：${follow.name}。${follow.blurb}`);
      }
    }
  }
  book.events = next;
}

export function stepTick(book) {
  const season = seasonOf(book.day);
  for (const spec of GOODS) {
    const good = book.goods[spec.id];
    const parts = priceParts(book, good);
    const produced = good.supply * parts.supplyMul / TICKS_PER_DAY;
    const consumed = good.demand * parts.demandMul / TICKS_PER_DAY;
    const traded = (parts.flow.buy - parts.flow.sell) / TICKS_PER_DAY;
    good.stock = Math.max(0, good.stock + produced - consumed - traded);
    good.prev = good.price;
    good.price = Math.max(good.base * 0.35, good.price + (parts.target - good.price) * 0.42);
    good.price = Math.round(good.price * 10) / 10;
    good.gap = Math.round(parts.gap);
    good.parts = {
      season: season.name,
      seasonMul: parts.seasonMul,
      gapMul: parts.gapMul,
      npcMul: parts.npcMul,
      target: parts.target,
    };
  }
  book.tick += 1;
  if (book.tick >= TICKS_PER_DAY) {
    book.tick = 0;
    book.day += 1;
    for (const good of Object.values(book.goods)) {
      good.history.push(good.price);
      if (good.history.length > HISTORY) good.history.shift();
    }
    ageEvents(book);
    maybeOpenEvent(book);
  }
  return book;
}

export function stepMarket(book, kind) {
  if (kind === 'season') {
    const index = SEASONS.findIndex(item => item.id === seasonOf(book.day).id);
    const target = (index + 1) % SEASONS.length * DAYS_PER_SEASON;
    const forward = (target - (book.day % (DAYS_PER_SEASON * 4)) + DAYS_PER_SEASON * 4) % (DAYS_PER_SEASON * 4) || DAYS_PER_SEASON * 4;
    for (let i = 0; i < forward * TICKS_PER_DAY; i++) stepTick(book);
    if (book.tick === 0) stepTick(book);
    pushLog(book, `换季，进入${seasonOf(book.day).name}。`);
    return book;
  }
  const n = kind === 'day' ? TICKS_PER_DAY : 1;
  for (let i = 0; i < n; i++) stepTick(book);
  return book;
}

export function quoteFromMarket(book, id) {
  const good = book?.goods?.[id];
  return good ? good.price : 0;
}

export function applyWarehouseDelta(book, id, delta) {
  const good = book?.goods?.[id];
  if (!good || !Number.isFinite(delta)) return null;
  good.stock = Math.max(0, good.stock + delta);
  return good.stock;
}

export { DAYS_PER_SEASON, TICKS_PER_DAY };
