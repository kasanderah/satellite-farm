import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CROPS, L, PLOT, FIELD_HA, fields, fieldAt, fieldAtWorld, focus, rigs,
  plantField, step, economy, quote, log, exportSnapshot, applySnapshot, RING,
  stores, worldDay, cropWatch, fieldVisual,
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

test('only the ware potato is plantable, and its quote uses yield and price', () => {
  assert.deepEqual(CROPS.filter(c => c.plantable).map(c => c.id), ['potato']);
  const potato = CROPS.findIndex(c => c.id === 'potato');
  const expect = Math.round(FIELD_HA * 44000 * 412 / 1000);
  assert.equal(quote(potato), expect);
  assert.equal(quote(CROPS.findIndex(c => c.id === 'wheat')), 0);
  assert.equal(CROPS.find(c => c.id === 'potato').days, 120);
});

test('a potato follows one 120-day clock through ridges, vines, vine-kill, and paid harvest', () => {
  const bare = fieldAt(focus.i, focus.j);
  assert.equal(bare.state, 0);
  assert.equal(bare.owned, true);
  const neighbor = fields.find(f => !f.inPlot && f.crop >= 0);
  assert.equal(plantField(neighbor, 'potato').ok, false);
  stores.seed = 0;
  assert.equal(plantField(bare, 'potato').reason, 'seed');
  stores.seed = 6;
  const planted = plantField(bare, 'potato');
  assert.equal(planted.ok, true);
  assert.equal(stores.seed, 5);
  assert.equal(stores.fertilizer, 5);
  assert.equal(cropWatch(bare).phase, 'plant');
  assert.equal(rigs.find(r => r.kind === 'planter').busy, true);
  step(3, 0, 1);
  assert.equal(cropWatch(bare).phase, 'plant');
  assert.ok(fieldVisual(bare).s > 2, 'ridges form behind the planter');
  assert.ok(fieldVisual(bare).g < 2, 'still bare ridges, not a canopy');
  step(10, 0, 1);
  assert.equal(cropWatch(bare).phase, 'ridge');
  step(10, 0, 1);
  assert.equal(cropWatch(bare).phase, 'hill');
  assert.equal(rigs.find(r => r.kind === 'hiller').busy, true);
  step(20, 0, 1);
  assert.equal(cropWatch(bare).phase, 'shoot');
  step(20, 0, 1);
  assert.equal(cropWatch(bare).phase, 'canopy');
  assert.ok(fieldVisual(bare).g >= 3 && fieldVisual(bare).g < 4);
  step(20, 0, 1);
  assert.equal(cropWatch(bare).phase, 'flower');
  step(20, 0, 1);
  assert.equal(cropWatch(bare).phase, 'top');
  assert.equal(stores.spray, 5);
  assert.equal(rigs.find(r => r.kind === 'topper').busy, true);
  step(8, 0, 1);
  assert.equal(cropWatch(bare).phase, 'haulm');
  assert.ok(fieldVisual(bare).g >= 5 && fieldVisual(bare).g < 6);
  step(6, 0, 1);
  assert.equal(cropWatch(bare).phase, 'lift');
  assert.equal(economy.revenue, 0);
  assert.equal(rigs.find(r => r.kind === 'lifter').busy, true);
  step(4, 0, 1);
  const pay = quote(CROPS.findIndex(c => c.id === 'potato'));
  assert.ok(economy.revenue >= pay);
  assert.equal(log.some(e => e.type === 'harvest' && e.i === bare.i && e.pay === pay), true);
  assert.equal(bare.live, false);
  assert.equal(bare.state, 0);
  const paid = economy.revenue;
  step(5, 0, 1);
  assert.equal(economy.revenue, paid, 'harvest pays once');
  const day = worldDay;
  step(2, 0, 4);
  assert.ok(Math.abs(worldDay - day - 8) < 1e-6, '4× moves the same world clock');
  const snap = exportSnapshot();
  assert.equal(snap.schema, 2);
  assert.equal(snap.plotId, 'nongshen-viii/plot-01');
  assert.equal(snap.kind, 'farm-snapshot');
  assert.equal(snap.stores.seed, 5);
  assert.ok(snap.fields.length > 400);
  economy.revenue = 0;
  stores.seed = 1;
  assert.equal(applySnapshot(snap), true);
  assert.equal(economy.revenue, paid);
  assert.equal(stores.seed, 5);
  assert.equal(fieldAt(bare.i, bare.j).state, 0);
  assert.equal(applySnapshot({ schema: 2, plotId: 'other', fields: [] }), false);
});
