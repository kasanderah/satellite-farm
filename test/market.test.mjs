import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMarket, stepMarket, seasonOf, quoteFromMarket, applyWarehouseDelta, priceParts, traderDesire, TRADERS,
} from '../src/market-sim.js';

test('缺货把短季薯目标价抬高，余货压低', () => {
  const short = createMarket(3);
  const plenty = createMarket(3);
  short.goods.tuber.stock = 2;
  plenty.goods.tuber.stock = 400;
  const a = priceParts(short, short.goods.tuber);
  const b = priceParts(plenty, plenty.goods.tuber);
  assert.ok(a.gapMul > b.gapMul);
  assert.ok(a.target > b.target);
});

test('冬储的短季薯比秋收紧', () => {
  const winter = createMarket(4);
  winter.day = 36;
  assert.equal(seasonOf(winter.day).id, 'winter');
  const autumn = createMarket(4);
  autumn.day = 24;
  assert.equal(seasonOf(autumn.day).id, 'autumn');
  winter.goods.tuber.stock = 80;
  autumn.goods.tuber.stock = 80;
  const cold = priceParts(winter, winter.goods.tuber);
  const harvest = priceParts(autumn, autumn.goods.tuber);
  assert.ok(cold.seasonMul > harvest.seasonMul);
});

test('寒潮抬高短季薯，一日后现价上升', () => {
  const calm = createMarket(9);
  const hit = createMarket(9);
  hit.events = [{ id: 'cold', name: '寒潮', days: 4, left: 4, supply: { tuber: 0.7, lastika: 0.75, grub: 0.8 }, demand: { feed: 1.25 } }];
  stepMarket(calm, 'day');
  stepMarket(hit, 'day');
  assert.ok(quoteFromMarket(hit, 'tuber') > quoteFromMarket(calm, 'tuber'));
});

test('追高的人在涨价商品上兴趣更高', () => {
  const book = createMarket(1);
  const guild = TRADERS.find(item => item.id === 'guild');
  const hot = { ...book.goods.starch, price: book.goods.starch.base * 1.4, tags: book.goods.starch.tags };
  const cold = { ...book.goods.starch, price: book.goods.starch.base * 0.7, tags: book.goods.starch.tags };
  assert.ok(traderDesire(guild, hot) > traderDesire(guild, cold));
});

test('库存影子只改仓储，不改主游戏', () => {
  const book = createMarket(2);
  const before = book.goods.grub.stock;
  assert.equal(applyWarehouseDelta(book, 'grub', 20), before + 20);
  assert.equal(applyWarehouseDelta(book, 'grub', -before - 100), 0);
  assert.equal(quoteFromMarket(book, 'missing'), 0);
});
