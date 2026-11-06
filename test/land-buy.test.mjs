import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reset, canBuy, buy, sell, buyReason, inspect, overlayCells, LAND_PRICE, sellPrice, owns, operable,
} from '../src/land-buy.js';
import {
  L, fields, economy, buyLandAt, sellLandAt, exportSnapshot, applySnapshot, resetGame, plantField, START_REVENUE, placeBuilding, fieldAt,
} from '../src/_shared.js';

const HUBI = L.HUBX * L.PER;
const HUBJ = L.HUBZ * L.PER;
const at = (dx, dz, fi = 0, fj = 0) => ({ i: (L.HUBX + dx) * L.PER + fi, j: (L.HUBZ + dz) * L.PER + fj });

test('四象限不重叠，黄蓝红和中枢四分按表切开', () => {
  reset();
  const count = [0, 0, 0, 0];
  const seen = new Set();
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    if (dx === 0 && dz === 0) continue;
    const a = inspect(at(dx, dz).i, at(dx, dz).j);
    const b = inspect(at(dx, dz, 3, 3).i, at(dx, dz, 3, 3).j);
    assert.equal(a.player, b.player);
    assert.equal(a.zone, b.zone);
    assert.ok(a.player >= 0 && a.player <= 3);
    const key = dx + ',' + dz;
    assert.equal(seen.has(key), false);
    seen.add(key);
    count[a.player] += 1;
    if (a.player === 0 && a.zone === 'yellow') assert.deepEqual([dx, dz], [1, 0]);
  }
  assert.deepEqual(count, [12, 12, 12, 12]);
  const hub = [0, 0, 0, 0];
  for (let fj = 0; fj < 4; fj++) for (let fi = 0; fi < 4; fi++) {
    const info = inspect(HUBI + fi, HUBJ + fj);
    assert.equal(info.zone, 'hub');
    hub[info.hub] += 1;
  }
  assert.deepEqual(hub, [4, 4, 4, 4]);
  assert.equal(inspect(HUBI + 3, HUBJ + 1).hub, 0);
  assert.equal(inspect(HUBI + 3, HUBJ + 2).hub, 1);
});

test('蓝要挨着已有的地，红要等蓝买完再从蓝的边往外', () => {
  reset();
  assert.equal(buyReason(2, 0), '');
  assert.equal(buyReason(1, -1), '');
  assert.equal(buyReason(2, -1), 'adj');
  assert.equal(buyReason(3, 0), 'blue');
  assert.equal(buyReason(-2, 0), 'locked');
  assert.equal(buyReason(1, 0), 'owned');
  assert.equal(canBuy(0, 0), false);
  buy(2, 0);
  assert.equal(buyReason(2, -1), '');
  assert.equal(buyReason(3, 0), 'blue');
  buy(1, -1);
  buy(2, -1);
  assert.equal(buyReason(3, 0), '');
  assert.equal(buyReason(3, -3), 'adj');
  assert.equal(buy(3, 0).ok, true);
  assert.equal(sell(2, 0).price, LAND_PRICE / 2);
  assert.equal(sellPrice(2, 0), 12000);
  assert.equal(buyReason(3, -1), 'blue');
  const marks = overlayCells();
  assert.equal(marks.filter(c => c.kind === 'hub0').length, 1);
  assert.equal(marks.filter(c => /^hub[1-3]$/.test(c.kind)).length, 3);
});

test('开局只有本地黄区可耕，买地扣钱进存档，清档回到黄区', () => {
  resetGame();
  const owned = fields.filter(f => f.owned);
  assert.ok(owned.length > 8 && owned.length < 20, owned.length);
  assert.ok(owned.every(f => f.landPlayer === 0 && f.landZone === 'yellow'));
  const yellow = at(1, 0);
  const blue = at(2, 0);
  const red = at(3, 0);
  const other = at(-1, 0);
  const hub = at(0, 0, 2, 0);
  assert.equal(fields.find(f => f.i === yellow.i && f.j === yellow.j).owned, true);
  assert.equal(owns(yellow.i, yellow.j), true);
  assert.equal(operable(yellow.i, yellow.j), true);
  const blueField = fields.find(f => f.i === blue.i && f.j === blue.j);
  assert.equal(blueField.owned, false);
  assert.equal(plantField(blueField, 'soy').reason, 'plot');
  assert.equal(fields.find(f => f.i === other.i && f.j === other.j).owned, false);
  assert.equal(fields.find(f => f.i === other.i && f.j === other.j).landPlayer, 2);
  assert.equal(buyLandAt(other.i, other.j).reason, 'locked');
  const localHub = fields.find(f => f.i === hub.i && f.j === hub.j);
  assert.equal(localHub.landHub, 0);
  assert.equal(localHub.owned, false);
  assert.equal(owns(hub.i, hub.j), true);
  assert.equal(placeBuilding(localHub.x0 + 40, localHub.z0 + 40, 'warehouse').ok, true);
  const foreignHub = fieldAt(HUBI + 2, HUBJ + 2);
  assert.equal(placeBuilding(foreignHub.x0 + 40, foreignHub.z0 + 40, 'warehouse').reason, 'hub');
  const start = economy.revenue;
  assert.equal(start, START_REVENUE);
  assert.equal(buyLandAt(red.i, red.j).reason, 'blue');
  const bought = buyLandAt(blue.i, blue.j);
  assert.equal(bought.ok, true);
  assert.equal(bought.price, LAND_PRICE);
  assert.equal(economy.revenue, start - LAND_PRICE);
  assert.equal(fields.find(f => f.i === blue.i && f.j === blue.j).owned, true);
  assert.equal(fields.filter(f => f.landZone === 'blue' && f.landPlayer === 0 && f.crop >= 0 && !f.owned).length > 0, true);
  const snap = exportSnapshot();
  assert.deepEqual(snap.land.blocks, ['2,0']);
  resetGame();
  assert.equal(economy.revenue, START_REVENUE);
  assert.equal(fields.find(f => f.i === blue.i && f.j === blue.j).owned, false);
  assert.equal(applySnapshot(snap), true);
  assert.equal(economy.revenue, start - LAND_PRICE);
  assert.equal(fields.find(f => f.i === blue.i && f.j === blue.j).owned, true);
  assert.equal(fields.find(f => f.landPlayer === 1 && f.crop >= 0).owned, false);
  const back = sellLandAt(blue.i, blue.j);
  assert.equal(back.ok, true);
  assert.equal(back.price, LAND_PRICE / 2);
  assert.equal(fields.find(f => f.i === blue.i && f.j === blue.j).owned, false);
  assert.equal(buyLandAt(blue.i, blue.j).ok, true);
  resetGame();
});
