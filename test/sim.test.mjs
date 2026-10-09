import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CROPS, L, PLOT, FIELD_HA, fields, fieldAt, fieldAtWorld, focus, rigs,
  plantField, step, economy, quote, log, exportSnapshot, applySnapshot, RING,
  stores, worldDay, cropWatch, fieldVisual, setPaused, setTimeScale,
  DAY_SECONDS, MACHINE_MPS, warehouse, sellLot, placeBuilding, removeBuilding, buildings, rigReadout,
  SHOP, buySeed, buyItem, SEED_PER_FIELD, resetGame, paused, onHubParcel,
  CULTURES, tanks, startCulture, harvestCulture, CULTURE_CELLS, inPlotBlock, fieldOrigin,
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
  assert.equal(stores.fertilizer, 0);
  assert.equal(cropWatch(bare).phase, 'plant');
  assert.equal(rigs.find(r => r.kind === 'planter').busy, true);
  const days = (n, scale = 1) => step(n * DAY_SECONDS, 0, scale);
  step(50, 0, 1);
  const planterNow = rigs.find(r => r.kind === 'planter');
  assert.equal(planterNow.mode, 'turn', 'the first headland turn is underway just after one edge');
  assert.equal(planterNow.f, bare);
  assert.ok(Math.abs(fieldVisual(bare).s - 1) < 0.05, 'one 128 m edge is done at about 50 real seconds, and the turn does not skip the next lane');
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
  assert.equal(placeBuilding(bare.x0 + 20, bare.z0 + 20).reason, 'field');
  assert.equal(placeBuilding(neighbor.x0 + 20, neighbor.z0 + 20).ok, false);
  const hubPad = fieldAt(L.HUBX * L.PER + 3, L.HUBZ * L.PER);
  assert.equal(placeBuilding(hubPad.x0 + 48, hubPad.z0 + 48).ok, true);
  const snap = exportSnapshot();
  assert.equal(snap.schema, 2);
  assert.equal(snap.plotId, 'nongshen-viii/plot-01');
  assert.equal(snap.kind, 'farm-snapshot');
  assert.equal(snap.stores.seed, 5);
  assert.equal(snap.timeScale, 2.5);
  assert.equal(snap.warehouse.length, 0);
  assert.equal(snap.buildings.length, buildings.length);
  assert.ok(snap.buildings.some(b => b.kind === 'warehouse'));
  assert.ok(snap.fields.length > 400);
  economy.revenue = 0;
  stores.seed = 1;
  buildings.length = 0;
  assert.equal(applySnapshot(snap), true);
  assert.equal(economy.revenue, paid);
  assert.equal(stores.seed, 5);
  assert.equal(buildings.length, snap.buildings.length);
  assert.ok(buildings.every(b => b.kind !== 'shed' || Math.abs(b.x - (bare.x0 + 20)) > 2));
  assert.equal(economy.timeScale, 2.5);
  assert.equal(fieldAt(bare.i, bare.j).state, 0);
  assert.equal(applySnapshot({ schema: 2, plotId: 'other', fields: [] }), false);
});

test('a working machine stays on its field, and the next machine starts from that field’s own progress', () => {
  setTimeScale(1);
  setPaused(false);
  stores.seed = 6;
  stores.fertilizer = 6;
  const a = fieldAt(focus.i, focus.j);
  const b = fields.find(f => f.owned && f !== a && !f.live && f.state !== 3);
  assert.ok(b, 'a second plot field');
  assert.equal(plantField(a, 'potato').ok, true);
  const planter = rigs.find(r => r.kind === 'planter');
  const laneTime = L.FIELD / MACHINE_MPS;
  const turnTime = Math.PI * (L.LANE / 2) / MACHINE_MPS;
  const along = a.dir === 0 ? [1, 0] : [0, 1];
  const across = a.dir === 0 ? [0, 1] : [1, 0];
  const head = (ang, v) => Math.cos(ang) * v[0] + Math.sin(ang) * v[1];
  step(laneTime - 0.15, 0, 1);
  assert.equal(planter.mode, 'work');
  assert.equal(planter.lane, 0);
  assert.ok(head(planter.ang, along) > 0.98, 'still facing down the first lane');
  const first = [];
  for (let i = 0; i < 30 && !(planter.mode === 'work' && planter.lane === 1); i++) {
    step(turnTime / 12, 0, 1);
    if (planter.mode === 'turn') first.push(planter.ang);
  }
  assert.ok(first.length > 4, 'the headland turn is visible');
  assert.equal(planter.lane, 1);
  assert.ok(head(planter.ang, [-along[0], -along[1]]) > 0.98, 'the turn ends facing down the next lane');
  const mid = first[Math.floor(first.length / 2)];
  assert.ok(head(mid, across) > 0.5, `mid-turn noses toward the next lane (${head(mid, across)})`);
  step(Math.max(0, laneTime - 1), 0, 1);
  const second = [];
  for (let i = 0; i < 30 && !(planter.mode === 'work' && planter.lane === 2); i++) {
    step(turnTime / 12, 0, 1);
    if (planter.mode === 'turn') second.push(planter.ang);
  }
  assert.equal(planter.lane, 2);
  assert.ok(head(planter.ang, along) > 0.98, 'the return turn also ends facing the next lane');
  const mid2 = second[Math.floor(second.length / 2)];
  assert.ok(head(mid2, across) > 0.5, `return turn noses toward the next lane (${head(mid2, across)})`);
  step(laneTime * 3, 0, 1);
  const progressed = a.jobS.planter;
  assert.ok(progressed > 3 && progressed < 8, progressed);
  assert.equal(planter.f, a);
  assert.equal(plantField(b, 'potato').ok, true);
  assert.equal(planter.f, a, 'planting a second field does not pull the machine off');
  assert.ok(Math.abs(a.jobS.planter - progressed) < 0.02, 'the current step is not marked done');
  assert.equal(b.jobS.planter, 0, 'the new field does not inherit the other field’s progress');
  planter.mode = 'park';
  planter.f = null;
  planter.busy = false;
  const held = a.jobS.planter;
  step(0.05, 0, 1);
  assert.equal(planter.f, a, 'the machine comes back to the unfinished field');
  assert.ok(a.jobS.planter < L.LANES - 0.5, 'leaving early does not complete the step');
  assert.ok(Math.abs(a.jobS.planter - held) < 0.05, 'it resumes from the stored progress');
  let guard = 0;
  while (a.jobS.planter < L.LANES - 0.01 && guard < 500) { step(2, 0, 1); guard++; }
  assert.ok(a.jobS.planter >= L.LANES - 0.01, a.jobS.planter);
  assert.ok(planter.f === b, 'after the pass it takes the next field');
  assert.ok(b.jobS.planter < 0.35, b.jobS.planter);
  const hiller = rigs.find(r => r.kind === 'hiller');
  const wait = (a.plantedAt + 20) - worldDay;
  assert.ok(wait > 1, wait);
  step(wait * DAY_SECONDS, 0, 1);
  assert.equal(hiller.f, a, 'the hiller starts on the older field');
  assert.ok(a.jobS.hiller < 0.05, a.jobS.hiller);
  const read = rigReadout(hiller);
  assert.ok(read.speed > 2 && read.speed < 3, read.speed);
  assert.equal(read.doing, '培土');
  assert.ok(read.frac < 0.05, read.frac);
});

test('the shop sells seed potatoes, and an empty stock does not start a field', () => {
  assert.equal(SHOP.length, 3);
  assert.equal(SHOP[0].name, '种薯');
  assert.equal(SHOP[0].id, 'seed');
  const price = SHOP[0].price;
  assert.equal(price, 1800);
  const fert = SHOP.find(s => s.id === 'fertilizer');
  assert.equal(fert.name, '肥料');
  assert.equal(fert.price, 900);
  const feedItem = SHOP.find(s => s.id === 'feed');
  assert.equal(feedItem.name, '饲料');
  assert.equal(feedItem.price, 800);
  assert.equal(SEED_PER_FIELD, 1);
  economy.revenue = 0;
  const broke = buySeed(1);
  assert.equal(broke.ok, false);
  assert.equal(broke.reason, 'money');
  assert.equal(economy.revenue, 0);
  const before = stores.seed;
  economy.revenue = price * 2 + 10;
  const bought = buySeed(2);
  assert.equal(bought.ok, true);
  assert.equal(stores.seed, before + 2);
  assert.equal(economy.revenue, 10);
  assert.equal(buySeed(1).ok, false);
  assert.equal(economy.revenue, 10);
  assert.equal(stores.seed, before + 2);
  assert.equal(buySeed(0).reason, 'qty');
  const plot = fields.find(f => f.owned && !f.live && f.state !== 3);
  assert.ok(plot);
  stores.seed = 0;
  stores.fertilizer = 6;
  assert.equal(plantField(plot, 'potato').reason, 'seed');
  assert.equal(plot.live, false);
  stores.seed = SEED_PER_FIELD;
  assert.equal(plantField(plot, 'potato').ok, true);
  assert.equal(stores.seed, 0);
  const snap = exportSnapshot();
  delete snap.stores.seed;
  assert.equal(applySnapshot(snap), true);
  assert.equal(stores.seed, 0);
  const bareSave = exportSnapshot();
  delete bareSave.stores;
  stores.seed = 4;
  assert.equal(applySnapshot(bareSave), true);
  assert.equal(stores.seed, 4);
});

test('reset drops the shed and returns a field that can be planted', () => {
  const bare = fieldAt(focus.i, focus.j);
  const open = fields.find(f => f.owned && !f.live && f.state !== 3);
  stores.seed = 0;
  stores.fertilizer = 6;
  if (open) assert.equal(plantField(open, 'potato').reason, 'seed');
  assert.equal(placeBuilding(bare.x0 + 24, bare.z0 + 24).reason, 'field');
  economy.revenue = 500;
  setTimeScale(4);
  setPaused(true);
  resetGame();
  assert.equal(paused, false);
  assert.equal(economy.timeScale, 1);
  assert.equal(economy.revenue, 0);
  assert.equal(worldDay, 0);
  assert.equal(stores.seed, 1);
  assert.equal(stores.fertilizer, 1);
  assert.equal(warehouse.length, 0);
  assert.ok(buildings.some(b => b.kind === 'warehouse'));
  assert.ok(buildings.some(b => b.kind === 'garage'));
  assert.ok(buildings.some(b => b.kind === 'process'));
  assert.equal(buildings.some(b => Math.hypot(b.x - (bare.x0 + 24), b.z - (bare.z0 + 24)) < 8), false);
  assert.equal(bare.live, false);
  assert.equal(bare.state, 0);
  assert.equal(rigs.every(r => !r.busy), true);
  assert.equal(plantField(bare, 'potato').ok, true);
  assert.equal(stores.seed, 0);
});

test('fertilizer can be bought and then used to plant', () => {
  const plot = fields.find(f => f.owned && !f.live && f.state !== 3);
  assert.ok(plot);
  stores.seed = 1;
  stores.fertilizer = 0;
  economy.revenue = 0;
  assert.equal(plantField(plot, 'potato').reason, 'fertilizer');
  assert.equal(buyItem('fertilizer', 1).reason, 'money');
  assert.equal(stores.fertilizer, 0);
  economy.revenue = SHOP.find(s => s.id === 'fertilizer').price;
  const bought = buyItem('fertilizer', 1);
  assert.equal(bought.ok, true);
  assert.equal(bought.stock, 1);
  assert.equal(economy.revenue, 0);
  assert.equal(plantField(plot, 'potato').ok, true);
  assert.equal(stores.fertilizer, 0);
});

test('a shed saved on a crop field is moved onto the hub', () => {
  const bare = fieldAt(focus.i, focus.j);
  const snap = exportSnapshot();
  delete snap.keepBuildings;
  snap.buildings = [{ id: 50, kind: 'shed', name: '仓棚', x: bare.x0 + 30, z: bare.z0 + 30, ang: 0 }];
  assert.equal(applySnapshot(snap), true);
  const shed = buildings.find(b => b.kind === 'shed');
  assert.ok(shed);
  assert.equal(onHubParcel(shed.x, shed.z), true);
  assert.equal(onHubParcel(bare.x0 + 30, bare.z0 + 30), false);
  assert.ok(buildings.some(b => b.kind === 'warehouse'));
  assert.ok(buildings.some(b => b.kind === 'garage'));
  assert.ok(buildings.some(b => b.kind === 'process'));
});

test('a protein culture advances on the world clock and sells from the warehouse', () => {
  assert.equal(CULTURES.find(c => c.id === 'grub').days, 65);
  assert.equal(CULTURES.find(c => c.id === 'bsf').days, 13);
  assert.equal(CULTURES.find(c => c.id === 'grub').name, '蛴螬');
  assert.equal(CULTURES.find(c => c.id === 'bsf').name, '黑水虻');
  stores.feed = 0;
  assert.equal(startCulture(0, 'bsf').reason, 'feed');
  stores.feed = 1;
  assert.equal(startCulture(0, 'bsf').ok, true);
  assert.equal(startCulture(0, 'grub').reason, 'busy');
  assert.equal(harvestCulture(0).reason, 'early');
  step(12 * DAY_SECONDS, 0, 1);
  assert.equal(harvestCulture(0).reason, 'early');
  step(DAY_SECONDS, 0, 1);
  const got = harvestCulture(0);
  assert.equal(got.ok, true);
  assert.equal(got.lot.name, '黑水虻');
  assert.equal(got.lot.kind, 'protein');
  assert.equal(got.lot.listPrice, CULTURES.find(c => c.id === 'bsf').price);
  const before = economy.revenue;
  assert.equal(sellLot(got.lot.id).listPrice, got.lot.listPrice);
  assert.equal(economy.revenue, before + got.lot.listPrice);
  stores.feed = 1;
  assert.equal(startCulture(1, 'grub').ok, true);
  step(64 * DAY_SECONDS, 0, 1);
  assert.equal(harvestCulture(1).reason, 'early');
  step(DAY_SECONDS, 0, 1);
  const grub = harvestCulture(1);
  assert.equal(grub.ok, true);
  assert.equal(grub.lot.name, '蛴螬');
});

test('feed can be bought and then used to start a culture', () => {
  const empty = tanks.findIndex(t => !t.species);
  assert.ok(empty >= 0);
  stores.feed = 0;
  economy.revenue = 0;
  assert.equal(startCulture(empty, 'bsf').reason, 'feed');
  assert.equal(buyItem('feed', 1).reason, 'money');
  assert.equal(stores.feed, 0);
  const price = SHOP.find(s => s.id === 'feed').price;
  economy.revenue = price;
  const bought = buyItem('feed', 1);
  assert.equal(bought.ok, true);
  assert.equal(bought.stock, 1);
  assert.equal(economy.revenue, 0);
  assert.equal(startCulture(empty, 'grub').ok, true);
  assert.equal(stores.feed, 0);
});

test('a deleted starter stays gone in a new save and comes back on reset', () => {
  const warehouse = buildings.find(b => b.kind === 'warehouse');
  assert.ok(warehouse);
  assert.equal(removeBuilding(warehouse.id).ok, true);
  assert.equal(buildings.some(b => b.kind === 'warehouse'), false);
  const snap = exportSnapshot();
  assert.equal(snap.keepBuildings, true);
  assert.equal(applySnapshot(snap), true);
  assert.equal(buildings.some(b => b.kind === 'warehouse'), false);
  assert.ok(buildings.some(b => b.kind === 'garage'));
  assert.ok(buildings.some(b => b.kind === 'process'));
  resetGame();
  assert.ok(buildings.some(b => b.kind === 'warehouse'));
  assert.ok(buildings.some(b => b.kind === 'garage'));
  assert.ok(buildings.some(b => b.kind === 'process'));
});

test('culture tanks sit in one row off the hub and inside the plot', () => {
  assert.equal(CULTURE_CELLS.length, 4);
  const row = CULTURE_CELLS[0];
  for (const c of CULTURE_CELLS) {
    assert.equal(c.bj, row.bj);
    assert.equal(c.fj, row.fj);
    assert.ok(inPlotBlock(c.bi, c.bj));
    assert.ok(!(c.bi === L.HUBX && c.bj === L.HUBZ));
    const [x, z] = fieldOrigin(c.bi * L.PER + c.fi, c.bj * L.PER + c.fj);
    const cx = x + L.FIELD / 2, cz = z + L.FIELD / 2;
    assert.ok(Math.hypot(cx, cz) > L.BLOCK / 2);
  }
});
