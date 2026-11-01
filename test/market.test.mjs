import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMarket, stepMarket, matchEntry, placeLimit, takeOrder, cancelOrder, quoteFromMarket, applyWarehouseDelta,
  traderDesire, TRADERS, regionQuote,
} from '../src/market-sim.js';

test('买价碰到卖价时按先挂单的价格成交', () => {
  const book = createMarket(1);
  const entry = book.regions.orbit.books.starch;
  entry.bids = [];
  entry.asks = [];
  entry.asks.push({ id: 1, seq: 1, side: 'ask', price: 40, qty: 3, who: '产地', player: false, goodId: 'starch' });
  entry.bids.push({ id: 2, seq: 2, side: 'bid', price: 45, qty: 5, who: '买盘', player: false, goodId: 'starch' });
  const trades = matchEntry(entry);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].price, 40);
  assert.equal(trades[0].qty, 3);
  assert.equal(entry.last, 40);
  assert.equal(entry.bids[0].qty, 2);
  assert.equal(entry.asks.length, 0);
});

test('吃单买入按卖盘价扣现金并增加库存', () => {
  const book = createMarket(2);
  const before = book.player.cash;
  const ask = book.regions.orbit.books.tuber.asks[0];
  const res = takeOrder(book, { regionId: 'orbit', goodId: 'tuber', side: 'buy', qty: 2 });
  assert.equal(res.ok, true);
  assert.ok(res.trades.length >= 1);
  assert.equal(res.trades[0].price, ask.price);
  assert.ok(book.player.cash < before);
  assert.ok(book.player.inv.tuber > 40);
});

test('挂单卖出先冻库存，撤单退回', () => {
  const book = createMarket(3);
  book.regions.orbit.books.tuber.bids = [];
  const res = placeLimit(book, { regionId: 'orbit', goodId: 'tuber', side: 'ask', price: 500, qty: 10, who: 'player' });
  assert.equal(res.ok, true);
  assert.equal(book.player.inv.tuber, 30);
  cancelOrder(book, 'orbit', res.order.id);
  assert.equal(book.player.inv.tuber, 40);
});

test('价差够大时会排出延迟货运', () => {
  const book = createMarket(5);
  book.regions.colony.books.tuber.last = 70;
  book.regions.orbit.books.tuber.last = 110;
  book.regions.colony.stock.tuber = 30;
  book.regions.luna.books.tuber.last = 80;
  stepMarket(book, 'tick');
  assert.ok(book.shipments.some(ship => ship.goodId === 'tuber' && ship.from === 'colony'));
  const waiting = book.shipments.find(ship => ship.goodId === 'tuber');
  assert.ok(waiting.left >= 1);
});

test('追高买卖者对高价货的兴趣更高', () => {
  const book = createMarket(1);
  const guild = TRADERS.find(item => item.id === 'guild');
  const hot = { ...book.regions.orbit.books.starch, id: 'starch', last: 80 };
  const cold = { ...book.regions.orbit.books.starch, id: 'starch', last: 30 };
  assert.ok(traderDesire(guild, hot) > traderDesire(guild, cold));
});

test('牌价读对接域，库存影子只改玩家仓', () => {
  const book = createMarket(4);
  book.dock = 'luna';
  book.regions.luna.books.feed.last = 22;
  assert.equal(quoteFromMarket(book, 'feed'), 22);
  assert.equal(regionQuote(book, 'orbit', 'feed') > 0, true);
  assert.equal(applyWarehouseDelta(book, 'feed', 15), 15);
  assert.equal(applyWarehouseDelta(book, 'feed', -100), 0);
  assert.equal(quoteFromMarket(book, 'nope'), 0);
});
