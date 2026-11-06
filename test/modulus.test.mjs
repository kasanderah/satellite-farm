import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MICRO, CELL, UNIT, ROAD, PLOT, SECTOR, RING_CIRC, RING_CIRC_NOMINAL, RING_R, RING_SECTORS,
  inHubWedge, hubGridSegments, MODULUS_ID, OBSIDIAN_MAX,
} from '../src/modulus.js';
import { L, RING, exportSnapshot, applySnapshot, resetGame, toggleEquip, plantField, fields } from '../src/_shared.js';

test('模数闭合：单元、路、地块、区段', () => {
  assert.equal(MICRO, 1.4);
  assert.equal(CELL, 4.2);
  assert.ok(Math.abs(UNIT - 134.4) < 1e-9);
  assert.ok(Math.abs(ROAD - 12.6) < 1e-9);
  assert.ok(Math.abs(PLOT - 575.4) < 1e-6);
  assert.ok(Math.abs(SECTOR - 4128.6) < 1e-6);
  assert.ok(Math.abs(OBSIDIAN_MAX - 67.2) < 1e-9);
  assert.equal(RING_SECTORS, 16);
  assert.ok(Math.abs(RING_CIRC_NOMINAL - 66057.6) < 1e-6);
  assert.ok(RING_R > 10000 && RING_R < 11000);
  assert.ok(Math.abs(L.FIELD - UNIT) < 1e-9);
  assert.ok(Math.abs(L.ROAD - ROAD) < 1e-9);
  assert.ok(Math.abs(L.BLOCK - PLOT) < 1e-6);
  assert.ok(Math.abs(RING.CIRC - L.NBX * L.BP) < 1e-4);
  assert.ok(Math.abs(RING.CIRC - RING_CIRC) < 1e-4);
});

test('中枢可建区是外缘梯形，不是中心，也不是整块', () => {
  assert.equal(inHubWedge(0, 0, 0), false);
  assert.equal(inHubWedge(220, 0, 0), true);
  assert.equal(inHubWedge(220, 0, 1), false);
  assert.equal(inHubWedge(-220, 0, 2), true);
  assert.equal(inHubWedge(0, 220, 1), true);
  assert.equal(inHubWedge(0, -220, 3), true);
  const lines = hubGridSegments(0);
  assert.ok(lines.length > 40 && lines.length < 200, lines.length);
});

test('设备单元不再播种，旧档没有模数就拒绝', () => {
  resetGame();
  const f = fields.find(item => item.owned && !item.live && item.crop >= 0);
  assert.equal(toggleEquip(f).equip, true);
  assert.equal(plantField(f, 'soy').reason, 'equip');
  assert.equal(toggleEquip(f).equip, false);
  const snap = exportSnapshot();
  assert.equal(snap.modulus, MODULUS_ID);
  const stale = { ...snap, modulus: 'ringsheaf.modulus/0' };
  assert.equal(applySnapshot(stale), false);
  resetGame();
});
