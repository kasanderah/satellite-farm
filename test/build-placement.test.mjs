import test from 'node:test';
import assert from 'node:assert/strict';
import { cellsOf, tryPlace, footprint, worldCell, cellOrigin } from '../src/build/placement.js';
import { workSpec } from '../src/build/catalog.js';
import { CELL, inHubWedge } from '../src/modulus.js';
import { clearWorks, placeWork, listWorks, exportWorks, loadWorks, bindBuildZone, previewWork } from '../src/build/works.js';

test('朝向交换占地，格中心才算在建造区里', () => {
  assert.deepEqual(footprint(5, 1, 1), { w: 1, h: 5, rot: 1 });
  const cells = cellsOf(10, 20, 5, 1, 1);
  assert.equal(cells.length, 5);
  assert.deepEqual(cells[0], [10, 20]);
  assert.deepEqual(cells[4], [10, 24]);
  const spec = workSpec('shed_small');
  const zone = (x, z) => inHubWedge(x, z, 0);
  const outside = tryPlace([], spec, 0, 0, 0, zone);
  assert.equal(outside.ok, false);
  assert.equal(outside.reason, 'zone');
  const cell = worldCell(220, 0);
  const origin = cellOrigin(cell.gx, cell.gz);
  assert.ok(Math.abs((origin.x + CELL / 2) - (Math.floor((220 + spec.w) / CELL) * CELL)) < CELL * 4);
  const placed = tryPlace([], spec, cell.gx, cell.gz, 0, zone);
  assert.equal(placed.ok, true, placed.reason);
  const blocked = tryPlace([{ cells: placed.cells }], spec, cell.gx, cell.gz, 0, zone);
  assert.equal(blocked.reason, 'block');
});

test('预览标出冲突格，空地不标', () => {
  clearWorks();
  bindBuildZone((x, z) => inHubWedge(x, z, 0));
  const ok = placeWork('shed_small', 220, 0, 0);
  assert.equal(ok.ok, true, ok.reason);
  const blocked = previewWork('shed_small', 220, 0, 0);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.bad.length, 4);
  const shifted = previewWork('workshop', 220 + CELL, 0, 0);
  assert.equal(shifted.ok, false);
  assert.ok(shifted.bad.length > 0 && shifted.bad.length < shifted.cells.length);
  const free = previewWork('tank', 220, 40, 0);
  assert.equal(free.ok, true, free.reason);
  assert.equal(free.bad.length, 0);
});

test('放下的东西按格子记，缺记录就当空的', () => {
  clearWorks();
  bindBuildZone((x, z) => inHubWedge(x, z, 0));
  const miss = placeWork('hangar', 0, 0, 0);
  assert.equal(miss.ok, false);
  const ok = placeWork('link', 220, 4, 0);
  assert.equal(ok.ok, true, ok.reason);
  const saved = exportWorks();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].kind, 'link');
  clearWorks();
  loadWorks(saved);
  assert.equal(listWorks().length, 1);
  loadWorks(undefined);
  assert.equal(listWorks().length, 0);
});
