import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CROPS, L, PLOT, FIELD_HA, fields, fieldAt, fieldAtWorld, focus, rigs,
  plantField, step, economy, quote, log, exportSnapshot, applySnapshot, RING,
  stores, worldDay, cropWatch, fieldVisual, setPaused, setTimeScale,
  DAY_SECONDS, MACHINE_MPS, warehouse, sellLot, placeBuilding, buildings,
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
  const days = (n, scale = 1) => step(n * DAY_SECONDS, 0, scale);
  step(50, 0, 1);
  const edge = 50 * MACHINE_MPS / L.FIELD;
  assert.ok(Math.abs(fieldVisual(bare).s - edge) < 0.05, 'one edge takes about 50 real seconds at 1×');
  assert.equal(cropWatch(bare).phase, 'plant');
  days(3 - cropWatch(bare).day);
  assert.equal(cropWatch(bare).phase, 'plant');
  assert.ok(fieldVisual(bare).g < 2, 'still bare ridges, not a canopy');
  days(10);
  assert.equal(cropWatch(bare).phase, 'ridge');
  days(10);
  assert.equal(cropWatch(bare).phase, 'hill');
  assert.equal(rigs.find(r => r.kind === 'hiller').busy, true);
  days(20);
  assert.equal(cropWatch(bare).phase, 'shoot');
  days(20);
  assert.equal(cropWatch(bare).phase, 'canopy');
  assert.ok(fieldVisual(bare).g >= 3 && fieldVisual(bare).g < 4);
  days(20);
  assert.equal(cropWatch(bare).phase, 'flower');
  days(20);
  assert.equal(cropWatch(bare).phase, 'top');
  assert.equal(stores.spray, 5);
  assert.equal(rigs.find(r => r.kind === 'topper').busy, true);
  days(8);
  assert.equal(cropWatch(bare).phase, 'haulm');
  assert.ok(fieldVisual(bare).g >= 5 && fieldVisual(bare).g < 6);
  days(6);
  assert.equal(cropWatch(bare).phase, 'lift');
  assert.equal(economy.revenue, 0);
  assert.equal(rigs.find(r => r.kind === 'lifter').busy, true);
  days(4);
  const pay = quote(CROPS.findIndex(c => c.id === 'potato'));
  assert.equal(economy.revenue, 0, 'harvest stores the potatoes');
  assert.equal(warehouse.length, 1);
  assert.equal(warehouse[0].listPrice, pay);
  assert.equal(warehouse[0].crop, 'potato');
  assert.equal(sellLot(warehouse[0].id).listPrice, pay);
  assert.equal(economy.revenue, pay);
  assert.equal(warehouse.length, 0);
  assert.equal(sellLot(99), null);
  assert.equal(log.some(e => e.type === 'store' && e.i === bare.i), true);
  assert.equal(log.some(e => e.type === 'sale' && e.pay === pay), true);
  assert.equal(bare.live, false);
  assert.equal(bare.state, 0);
  const paid = economy.revenue;
  days(5);
  assert.equal(economy.revenue, paid, 'a sale pays once');
  const day = worldDay;
  days(2, 4);
  assert.ok(Math.abs(worldDay - day - 8) < 1e-6, '4× moves the same world clock');
  setTimeScale(2.5);
  assert.equal(economy.timeScale, 2.5);
  setTimeScale(0);
  assert.equal(economy.timeScale, 2.5);
  setPaused(true);
  const held = worldDay;
  step(3 * DAY_SECONDS, 0, 12);
  assert.equal(worldDay, held, 'pause holds the world clock');
  setPaused(false);
  assert.equal(placeBuilding(bare.x0 + 20, bare.z0 + 20).ok, true);
  assert.equal(placeBuilding(neighbor.x0 + 20, neighbor.z0 + 20).ok, false);
  const snap = exportSnapshot();
  assert.equal(snap.schema, 2);
  assert.equal(snap.plotId, 'nongshen-viii/plot-01');
  assert.equal(snap.kind, 'farm-snapshot');
  assert.equal(snap.stores.seed, 5);
  assert.equal(snap.timeScale, 2.5);
  assert.equal(snap.warehouse.length, 0);
  assert.equal(snap.buildings.length, 1);
  assert.ok(snap.fields.length > 400);
  economy.revenue = 0;
  stores.seed = 1;
  buildings.length = 0;
  assert.equal(applySnapshot(snap), true);
  assert.equal(economy.revenue, paid);
  assert.equal(stores.seed, 5);
  assert.equal(buildings.length, 1);
  assert.equal(economy.timeScale, 2.5);
  assert.equal(fieldAt(bare.i, bare.j).state, 0);
  assert.equal(applySnapshot({ schema: 2, plotId: 'other', fields: [] }), false);
});
