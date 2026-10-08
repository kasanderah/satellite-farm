import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CROPS, L, PLOT, FIELD_HA, fields, fieldAt, fieldAtWorld, focus, harvesters,
  plantField, step, economy, quote, log, exportSnapshot, applySnapshot, RING,
} from '../src/_shared.js';

test('one colonist plot is about 4 km on the ring', () => {
  assert.ok(PLOT.along > 3500 && PLOT.along < 4500, PLOT.along);
  assert.ok(PLOT.across > 3500 && PLOT.across < 4500, PLOT.across);
  assert.ok(RING.R > 9000, 'ring radius stays at colony scale');
  const owned = fields.filter(f => f.owned);
  assert.ok(owned.length > 400 && owned.length < 900, owned.length);
  assert.equal(fields.length, L.NFX * L.NFZ);
});

test('field lookup matches the flat map, including the ring seam', () => {
  let checked = 0;
  for (const f of fields) {
    if (f.crop < 0) continue;
    const hit = fieldAtWorld(f.x0 + 12, f.z0 + 12);
    assert.equal(hit, f, `miss ${f.i},${f.j}`);
    assert.equal(fieldAtWorld(f.x0 + RING.CIRC + 12, f.z0 + 12), f);
    if (++checked > 400) break;
  }
  const bare = fieldAt(focus.i, focus.j);
  assert.equal(fieldAtWorld(bare.x0 + 20, bare.z0 + 20), bare);
  assert.equal(fieldAtWorld(bare.x0 + L.FIELD + 2, bare.z0 + 20), null);
});

test('plantable quotes use yield and price, not a flat bonus', () => {
  const wheat = CROPS.findIndex(c => c.id === 'wheat');
  const expect = Math.round(FIELD_HA * 17800 * 1011 / 1000);
  assert.equal(quote(wheat), expect);
  assert.ok(expect > 20000);
  const rice = CROPS.findIndex(c => c.id === 'rice');
  assert.ok(quote(rice) > quote(wheat));
  assert.equal(CROPS.filter(c => c.plantable).length, 4);
});

test('a planted crop grows, a harvester pays it, and the snapshot round-trips', () => {
  const bare = fieldAt(focus.i, focus.j);
  assert.equal(bare.state, 0);
  assert.equal(bare.owned, true);
  const neighbor = fields.find(f => !f.inPlot && f.crop >= 0);
  assert.equal(plantField(neighbor, 'wheat').ok, false);
  const planted = plantField(bare, 'wheat');
  assert.equal(planted.ok, true);
  const g0 = bare.g;
  step(1, 1, 4);
  assert.ok(bare.g > g0, 'growth should be visible after one accelerated second');
  assert.equal(bare.state, 1);
  const before = economy.revenue;
  let guard = 0;
  while (!log.some(e => e.i === bare.i && e.j === bare.j) && guard++ < 2000) step(0.25, guard, 8);
  assert.ok(guard < 2000, 'harvester never finished the planted field');
  assert.ok(economy.revenue >= before + quote(CROPS.findIndex(c => c.id === 'wheat')));
  assert.ok(harvesters.length >= 2);
  const snap = exportSnapshot();
  assert.equal(snap.schema, 1);
  assert.equal(snap.plotId, PLOT.id);
  assert.equal(snap.kind, 'farm-snapshot');
  assert.ok(snap.fields.length > 400);
  assert.ok(Array.isArray(snap.harvesters));
  const saved = snap.revenue;
  const savedG = snap.fields.find(s => s.i === bare.i && s.j === bare.j);
  economy.revenue = 0;
  bare.g = 0.2;
  bare.state = 1;
  assert.equal(applySnapshot(snap), true);
  assert.equal(economy.revenue, saved);
  const again = fieldAt(bare.i, bare.j);
  assert.equal(again.state, savedG.state);
  assert.equal(again.g, savedG.g);
  const bad = applySnapshot({ schema: 1, plotId: 'other', fields: [] });
  assert.equal(bad, false);
});
