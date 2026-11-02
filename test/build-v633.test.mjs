import test from 'node:test';
import assert from 'node:assert/strict';
import { roadMaskAt, roadShape, ROAD_E, ROAD_N, ROAD_W, ROAD_S } from '../src/build/roads.js';
import { planRoute } from '../src/build/nav.js';
import { placeWork, eraseWork, clearWorks, roadMask } from '../src/build/works.js';
import { buyMachine, economy, resetGame, sellRig, garageBoard } from '../src/_shared.js';
import { inHubWedge } from '../src/modulus.js';

test('道路按上下左右拼出直线、转角、丁字和十字', () => {
  const has = (cells) => (x, z) => cells.has(x + ',' + z);
  const cells = new Set(['0,0', '1,0', '0,1']);
  assert.equal(roadShape(roadMaskAt(1, 0, has(cells))), 'end');
  cells.add('-1,0');
  assert.equal(roadShape(roadMaskAt(0, 0, has(cells))), 'tee');
  assert.equal(roadShape(ROAD_E | ROAD_W), 'straight');
  assert.equal(roadShape(ROAD_E | ROAD_N), 'corner');
  assert.equal(roadShape(ROAD_E | ROAD_N | ROAD_W | ROAD_S), 'cross');
});

test('挡住的直线会绕开，封死就停在外面', () => {
  const wall = (x, z) => Math.abs(z) < 2.2 && x < 18;
  const around = planRoute(0, -24, 0, 24, [[0, 24]], wall);
  assert.equal(around.blocked, false);
  assert.ok(around.pts.some(p => p[0] > 16));
  assert.equal(around.pts.some(p => Math.abs(p[1]) < 1.6 && p[0] < 14), false);
  const sealed = planRoute(0, -12, 0, 12, [[0, 12]], () => true);
  assert.equal(sealed.blocked, true);
});

test('车库车位不够不能买，有农机不能拆', () => {
  resetGame();
  clearWorks();
  economy.revenue = 100000;
  const none = buyMachine('tractor');
  assert.equal(none.ok, false);
  assert.equal(none.reason, 'stall');
  assert.equal(garageBoard().stalls, 0);
  const spot = { x: 220, z: 0 };
  assert.equal(inHubWedge(spot.x, spot.z, 0), true);
  const garage = placeWork('garage', spot.x, spot.z, 0);
  assert.equal(garage.ok, true, garage.reason);
  assert.equal(garageBoard().stalls, 3);
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const bought = buyMachine('tractor');
    assert.equal(bought.ok, true, bought.reason);
    ids.push(bought.id);
  }
  assert.equal(garageBoard().free, 0);
  const full = buyMachine('omni');
  assert.equal(full.reason, 'stall');
  const blocked = eraseWork(spot.x, spot.z);
  assert.equal(blocked.reason, 'occupied');
  assert.equal(sellRig(ids[0]).ok, true);
  assert.equal(garageBoard().free, 1);
  assert.equal(eraseWork(spot.x, spot.z).reason, 'occupied');
  sellRig(ids[1]);
  sellRig(ids[2]);
  assert.equal(eraseWork(spot.x, spot.z).ok, true);
  clearWorks();
  const east = placeWork('service', 230, 8, 0);
  const north = placeWork('service', 230 + 4.2, 8 + 4.2, 0);
  assert.equal(east.ok && north.ok, true);
  placeWork('service', 230 + 4.2, 8, 0);
  const mask = roadMask(east.piece.gx + 1, east.piece.gz);
  assert.equal(roadShape(mask), 'corner');
  clearWorks();
});
