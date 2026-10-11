import test from 'node:test';
import assert from 'node:assert/strict';
import { LAB_CLASSES, LAB_ENTRIES, CULT_EMPTY, CULT_EMPTY_NOTES, CULT_B_NOTES, GRUB_TROUGH_NOTES, planGrubColumns, GRUB_DEMO_GANTRIES, GRUB_WORK_MPS, GRUB_GANTRY_OPTIONS } from '../src/lab-catalog.js';
import {
  CROPS, L, PLOT, FIELD_HA, fields, fieldAt, fieldAtWorld, focus, rigs,
  plantField, step, economy, quote, log, exportSnapshot, applySnapshot, RING,
  stores, worldDay, cropWatch, fieldVisual, setPaused, setTimeScale,
  DAY_SECONDS, MACHINE_MPS, WORLD_MIN_PER_REAL_MIN, warehouse, sellLot, sellStack, warehouseCapacity, placeBuilding, removeBuilding, buildings, rigReadout,
  SHOP, buySeed, buyItem, SEED_PER_FIELD, resetGame, paused, onHubParcel, HUB_SITES, POTATO_STAGES, POTATO_ROT_AT, POTATO_DAYS, cropDef, cropDossier,
  seasonAllowsSow, fieldOps,
  BATT_RANGE, BATT_LEAVE, MACHINE_SHOP, buyMachine, DRONE_SHOP, workDrones, buyDrone, droneBase, BUILDING_KINDS,
  CULTURES, tanks, startCulture, harvestCulture, CULTURE_CELLS, inPlotBlock, fieldOrigin,
  devices, potatoStock, fertPlan, cultureFeedPlan, millWatch, startMill, orderProcess, removeMill,
} from '../src/_shared.js';
import { productById, recipeById, deviceById, flowModel, LOOP_OFFSETS } from '../src/products.js';

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

test('four surface crops are plantable, and the potato quote uses yield and price', () => {
  assert.deepEqual(CROPS.filter(c => c.plantable).map(c => c.id), ['soy', 'potato', 'cabbage', 'feed_barley']);
  const potato = CROPS.findIndex(c => c.id === 'potato');
  const expect = Math.round(FIELD_HA * 44000 * 412 / 1000);
  assert.equal(quote(potato), expect);
  assert.equal(quote(CROPS.findIndex(c => c.id === 'wheat')), 0);
  assert.equal(CROPS.find(c => c.id === 'potato').days, POTATO_DAYS);
  assert.equal(POTATO_DAYS, 81);
  assert.equal(POTATO_ROT_AT, 92);
  assert.equal(cropDef('soy').seed, 'seed_soy');
  assert.equal(cropDef('cabbage').seed, 'seedling_cabbage');
  assert.equal(cropDef('feed_barley').maturity, 57);
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
  assert.equal(bare.plantedAt, null, 'planning does not start the clock');
  const planter0 = rigs.find(r => r.kind === 'planter');
  assert.equal(planter0.mode, 'travel');
  assert.equal(planter0.intent, 'job');
  assert.equal(planter0.busy, true);
  let arrive = 0;
  while (planter0.mode !== 'work' && arrive < 8000) { step(0.5, 0, 1); arrive++; }
  assert.equal(planter0.mode, 'work');
  assert.equal(cropWatch(bare).phase, 'potato_till');
  assert.equal(fieldVisual(bare).g, 1, 'sowing has not finished, so the field stays bare');
  assert.ok((bare.jobS.potato_plant || 0) < 1);
  const days = (n, scale = 1) => step(n * DAY_SECONDS, 0, scale);
  const edge = L.FIELD / MACHINE_MPS;
  step(Math.max(0.05, edge - 0.35), 0, 1);
  const planterNow = rigs.find(r => r.kind === 'planter');
  assert.equal(planterNow.mode, 'work');
  let spun = 0;
  while (planterNow.mode !== 'turn' && spun < 40) { step(0.05, 0, 1); spun++; }
  assert.equal(planterNow.mode, 'turn', 'the first headland turn starts as the 128 m edge finishes');
  assert.equal(planterNow.f, bare);
  assert.ok(Math.abs(fieldVisual(bare).s - 1) < 0.08, fieldVisual(bare).s);
  assert.equal(cropWatch(bare).phase, 'potato_till');
  assert.equal(fieldVisual(bare).g, 1);
  const lifterHold = rigs.find(r => r.kind === 'lifter');
  lifterHold.kind = 'held';
  try {
  const jump = (target) => {
    const left = target - cropWatch(bare).day;
    if (left > 0.02) step(left * DAY_SECONDS, 0, 1);
  };
  jump(3);
  assert.equal(cropWatch(bare).phase, 'potato_till');
  assert.equal(fieldVisual(bare).g, 1, 'still bare until the potato planter finishes');
  jump(10);
  assert.equal(cropWatch(bare).phase, 'potato_emerg');
  assert.ok(bare.jobS.potato_plant >= L.LANES - 0.05, bare.jobS.potato_plant);
  assert.ok(fieldVisual(bare).g >= 3 && fieldVisual(bare).g < 4, fieldVisual(bare).g);
  jump(28);
  assert.equal(cropWatch(bare).phase, 'potato_hill');
  jump(50);
  assert.equal(cropWatch(bare).phase, 'potato_bulk');
  assert.ok(fieldVisual(bare).g >= 5 && fieldVisual(bare).g < 6, fieldVisual(bare).g);
  jump(76);
  assert.equal(cropWatch(bare).phase, 'potato_haulm');
  jump(85);
  assert.equal(cropWatch(bare).phase, 'potato_harvest');
  assert.equal(cropWatch(bare).label, '成熟待收');
  assert.equal(economy.revenue, 0);
  assert.equal(warehouse.length, 0, 'maturity does not store the field');
  assert.equal(bare.live, true);
  assert.ok(fieldVisual(bare).g > 7 && fieldVisual(bare).g < 8, fieldVisual(bare).g);
  assert.equal(bare.yieldFactor ?? 1, 1);
  } finally {
    lifterHold.kind = 'lifter';
  }
  lifterHold.charge = 1;
  lifterHold.mode = 'park';
  lifterHold.busy = false;
  lifterHold.f = null;
  let lifted = 0;
  while (warehouse.length < 1 && lifted < 8000) { step(0.5, 0, 1); lifted++; }
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
  while (bare.live && lifted < 16000) { step(0.5, 0, 1); lifted++; }
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
  assert.equal(planter.mode, 'travel');
  assert.equal(a.plantedAt, null);
  let arrive = 0;
  while (planter.mode !== 'work' && arrive < 8000) { step(0.25, 0, 1); arrive++; }
  assert.equal(planter.mode, 'work');
  const laneTime = L.FIELD / MACHINE_MPS;
  const turnTime = Math.PI * (L.LANE / 2) / MACHINE_MPS;
  const along = a.dir === 0 ? [1, 0] : [0, 1];
  const across = a.dir === 0 ? [0, 1] : [1, 0];
  const head = (ang, v) => Math.cos(ang) * v[0] + Math.sin(ang) * v[1];
  const remain = Math.abs((planter.lane % 2 === 0 ? L.FIELD : 0) - planter.u);
  step(Math.max(0.05, remain / MACHINE_MPS - 0.2), 0, 1);
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
  const job = planter.job;
  const progressed = a.jobS[job];
  assert.ok(progressed > 3 && progressed < 8, progressed);
  assert.equal(planter.f, a);
  assert.equal(plantField(b, 'potato').ok, true);
  assert.equal(b.plantedAt, null, 'assigning the crop does not start the clock');
  assert.equal(cropWatch(b).waiting, true);
  assert.equal(planter.f, a, 'planting a second field does not pull the machine off');
  assert.ok(Math.abs(a.jobS[job] - progressed) < 0.02, 'the current step is not marked done');
  assert.equal(b.jobS.potato_base_fert, 0, 'the new field does not inherit the other field’s progress');
  planter.mode = 'park';
  planter.f = null;
  planter.busy = false;
  const held = a.jobS[job];
  step(0.05, 0, 1);
  assert.equal(planter.f, a, 'the machine comes back to the unfinished field');
  assert.ok(a.jobS[job] < L.LANES - 0.5, 'leaving early does not complete the step');
  assert.ok(Math.abs(a.jobS[job] - held) < 0.05, 'it resumes from the stored progress');
  let guard = 0;
  while (a.jobS[job] < L.LANES - 0.01 && guard < 500) { step(2, 0, 1); guard++; }
  assert.ok(a.jobS[job] >= L.LANES - 0.01, a.jobS[job]);
  let stay = 0;
  while (!(planter.f === a && planter.job === 'potato_rotavate') && stay < 800) { step(0.25, 0, 1); stay++; }
  assert.equal(planter.f, a, 'the next tillage job stays on the older field');
  assert.equal(planter.job, 'potato_rotavate');
  guard = 0;
  while ((a.jobS.potato_rotavate || 0) < L.LANES - 0.01 && guard < 500) { step(2, 0, 1); guard++; }
  let hop = 0;
  while (!(planter.f === b && (planter.mode === 'travel' || planter.mode === 'work')) && hop < 12000) {
    step(0.5, 0, 1); hop++;
  }
  assert.equal(planter.f, b, 'after the open till jobs it takes the next field');
  assert.ok((b.jobS[planter.job] || 0) < 0.35, b.jobS[planter.job]);
  const hiller = rigs.find(r => r.kind === 'hiller');
  const hillFrom = cropDef('potato').stages.find(s => s.id === 'potato_hill').from;
  a.plantedAt = worldDay - hillFrom - 0.05;
  for (const id of ['potato_base_fert', 'potato_rotavate', 'potato_plant', 'potato_shallow']) a.jobS[id] = L.LANES;
  a.jobS.potato_hill = 0;
  a.jobS.potato_topdress = 0;
  planter.kind = 'held';
  hiller.mode = 'park';
  hiller.f = null;
  hiller.busy = false;
  hiller.charge = 1;
  hiller.x = hiller.parkX;
  hiller.z = hiller.parkZ;
  try {
    let hill = 0;
    while (hiller.mode !== 'work' && hill < 8000) { step(0.5, 0, 1); hill++; }
    assert.equal(hiller.mode, 'work');
    assert.equal(hiller.f, a, 'the hiller starts on the older field');
    assert.equal(hiller.job, 'potato_hill');
    assert.ok(a.jobS.potato_hill < 0.2, a.jobS.potato_hill);
    const read = rigReadout(hiller);
    assert.ok(Math.abs(read.speed - MACHINE_MPS) < 0.05, read.speed);
    assert.equal(read.doing, '培土');
    assert.ok(read.frac < 0.05, read.frac);
  } finally {
    planter.kind = 'planter';
  }
});

test('the shop sells seed potatoes, and an empty stock does not start a field', () => {
  assert.equal(SHOP.length, 6);
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
  assert.equal(SHOP.find(s => s.id === 'seed_soy').price, 900);
  assert.equal(SHOP.find(s => s.id === 'seed_barley').price, 700);
  assert.equal(SHOP.find(s => s.id === 'seedling_cabbage').name, '甘蓝苗');
  assert.equal(SHOP.find(s => s.id === 'seedling_cabbage').price, 1400);
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

test('asset lab lists the four classes and the live placeholders', () => {
  assert.deepEqual(LAB_CLASSES.map(c => c.id), ['unit', 'machine', 'equip', 'rail']);
  assert.deepEqual(LAB_CLASSES.map(c => c.label), ['单元', '农机', '设备', '轨道设备']);
  const ids = new Set(LAB_ENTRIES.map(e => e.id));
  for (const id of ['field', 'deck', 'hub', 'tank', 'arm', 'tractor']) assert.ok(ids.has(id), id);
  const cls = new Set(LAB_CLASSES.map(c => c.id));
  for (const e of LAB_ENTRIES) {
    assert.ok(cls.has(e.cls), e.id);
    assert.ok(e.name && e.size && e.notes, e.id);
  }
  assert.equal(LAB_ENTRIES.find(e => e.id === 'hub').cls, 'unit');
  assert.equal(LAB_ENTRIES.find(e => e.id === 'hub').name, '中枢地块');
  assert.match(LAB_ENTRIES.find(e => e.id === 'hub').notes, /主井/);
  assert.match(LAB_ENTRIES.find(e => e.id === 'hub').notes, /能源/);
  assert.match(LAB_ENTRIES.find(e => e.id === 'hub').notes, /仓储/);
  assert.match(LAB_ENTRIES.find(e => e.id === 'hub').notes, /571\.4/);
  assert.match(LAB_ENTRIES.find(e => e.id === 'hub').notes, /剖面/);
  assert.match(LAB_ENTRIES.find(e => e.id === 'hub').notes, /环心/);
  assert.match(LAB_ENTRIES.find(e => e.id === 'hub').notes, /整层/);
  assert.doesNotMatch(LAB_ENTRIES.find(e => e.id === 'hub').notes, /东北角/);
  assert.equal(LAB_ENTRIES.find(e => e.id === 'tank').cls, 'equip');
  assert.equal(LAB_ENTRIES.find(e => e.id === 'arm').cls, 'rail');
  assert.equal(LAB_ENTRIES.find(e => e.id === 'tractor').cls, 'machine');
});

test('empty cultivation unit matches the 4 km plot grid', () => {
  const e = LAB_ENTRIES.find(x => x.id === 'cult-a');
  const b = LAB_ENTRIES.find(x => x.id === 'cult-b');
  assert.ok(e);
  assert.ok(b);
  assert.equal(e.cls, 'unit');
  assert.equal(b.cls, 'unit');
  assert.equal(LAB_ENTRIES[0].id, 'cult-a');
  assert.equal(e.name, '培育地块A方案');
  assert.equal(b.name, '培育地块B方案');
  assert.equal(e.notes, CULT_EMPTY_NOTES);
  assert.equal(b.notes, CULT_B_NOTES);
  assert.match(e.notes, /抬缘白台/);
  assert.match(e.notes, /地灯/);
  assert.match(e.notes, /内皮/);
  assert.match(b.notes, /漆面/);
  assert.match(b.notes, /紫灯/);
  assert.match(e.notes, /C-3,2-U01/);
  assert.match(e.notes, /两成/);
  assert.match(e.notes, /弱光/);
  assert.match(e.notes, /后开始/);
  assert.match(e.notes, /减产/);
  assert.match(e.notes, /暗房红/);
  assert.equal(CULT_EMPTY.plots, 7);
  assert.equal(CULT_EMPTY.farm, 4000);
  assert.ok(Math.abs(CULT_EMPTY.plot * CULT_EMPTY.plots - CULT_EMPTY.farm) < 1e-6);
  assert.ok(CULT_EMPTY.seam >= 2 && CULT_EMPTY.seam <= 4);
  assert.ok(CULT_EMPTY.lane <= 6);
  assert.ok(CULT_EMPTY.raise < 0.8);
  assert.equal(CULT_EMPTY.clear, 17);
  assert.equal(CULT_EMPTY.doorsPerWall, 4);
  assert.ok(CULT_EMPTY.unit > 130 && CULT_EMPTY.unit < 145);
  assert.ok(e.notes.includes(String(CULT_EMPTY.doorW)));
  assert.ok(e.notes.includes('16'));
  const grub = LAB_ENTRIES.find(x => x.id === 'grub-trough');
  assert.equal(grub.cls, 'equip');
  assert.equal(grub.name, '蛴螬培养槽');
  assert.equal(grub.notes, GRUB_TROUGH_NOTES);
  assert.match(grub.notes, /4×15/);
  assert.match(grub.notes, /龙门/);
  assert.match(grub.notes, /槽灯/);
  assert.match(grub.notes, /容器循环逻辑/);
  assert.match(grub.notes, /升级/);
  assert.match(grub.notes, /3 m\/s/);
  assert.match(grub.notes, /弱光/);
  assert.match(grub.notes, /槽灯是红的/);
  assert.match(grub.notes, /巡灯也是红的/);
  assert.match(grub.notes, /后开始/);
  assert.match(grub.notes, /减产/);
  assert.doesNotMatch(CULT_B_NOTES, /弱光/);
  assert.deepEqual(GRUB_GANTRY_OPTIONS, [2, 4]);
  assert.equal(GRUB_DEMO_GANTRIES, 2);
  assert.equal(GRUB_WORK_MPS, 3);
  const two = planGrubColumns(17, 2);
  const four = planGrubColumns(17, 4);
  assert.equal(two.length, 2);
  assert.equal(four.length, 4);
  assert.deepEqual(two.flat(), [...Array(17).keys()]);
  assert.deepEqual(four.flat(), [...Array(17).keys()]);
  for (const part of four) assert.ok(part.length >= 4);
});

test('the potato loop reads prices from the product table and closes peel and frass', () => {
  const potato = CROPS.findIndex(c => c.id === 'potato');
  const listed = Math.round(FIELD_HA * 44000 * 412 / 1000);
  assert.equal(productById('potato').sellPrice, listed);
  assert.equal(quote(potato), listed);
  assert.equal(SHOP.find(s => s.id === 'seed').price, productById('seed').buyPrice);
  assert.equal(SHOP.find(s => s.id === 'fertilizer').price, 900);
  assert.equal(SHOP.find(s => s.id === 'feed').price, 800);
  assert.equal(SHOP.find(s => s.id === 'feed').name, '饲料');
  assert.equal(deviceById('mill').buildCost, 6000);
  assert.equal(deviceById('mill').hub, false);
  assert.equal(recipeById('starch-mill').timeDays, 2);
  assert.equal(recipeById('potato-field').stub, true);
  assert.equal(LOOP_OFFSETS.peelToFeed.maxFraction, 0.4);
  assert.equal(LOOP_OFFSETS.frassToFert.maxFraction, 0.5);
  const flow = flowModel();
  assert.deepEqual(flow.stages.map(s => s.id), ['potato-field', 'soy-field', 'barley-field', 'cabbage-field', 'starch-mill', 'grub-culture']);
  assert.ok(flow.stages.find(s => s.id === 'starch-mill').outputs.some(o => o.id === 'peel'));
  assert.ok(flow.offsets.some(o => o.id === 'peelToFeed'));
  assert.equal(flow.products.some(p => p.id === 'bsf'), false);

  resetGame();
  assert.equal(WORLD_MIN_PER_REAL_MIN, 120);
  assert.equal(DAY_SECONDS, 720);
  assert.equal(MACHINE_MPS, 10);
  const west = { hub: false, bi: L.HUBX - 1, bj: L.HUBZ, fi: 1, fj: 1, x: -400, z: 40 };
  economy.revenue = 0;
  assert.equal(startMill(west).reason, 'money');
  assert.equal(startMill({ hub: true, bi: L.HUBX, bj: L.HUBZ, x: 0, z: 0 }).reason, 'hub');
  assert.equal(startMill({ hub: false, bi: L.HUBX + 1, bj: L.HUBZ, x: 500, z: 0 }).reason, 'money');
  stores.feed = 1;
  assert.equal(startCulture(0, 'grub', { bi: L.HUBX + 1, bj: L.HUBZ }).ok, true);
  assert.equal(startMill({ hub: false, bi: L.HUBX + 1, bj: L.HUBZ, x: 500, z: 0 }).reason, 'grub');
  assert.equal(startCulture(1, 'grub', { bi: L.HUBX, bj: L.HUBZ, hub: true }).reason, 'hub');
  tanks[0].species = null; tanks[0].bi = null; tanks[0].bj = null;
  stores.feed = 0; stores.peel = 0;
  const cost = deviceById('mill').buildCost;
  const util = recipeById('starch-mill').utilities.water + recipeById('starch-mill').utilities.power;
  economy.revenue = cost + util;
  assert.equal(startMill(west).ok, true);
  assert.equal(economy.revenue, util);
  assert.equal(millWatch().state, 'build');
  assert.equal(orderProcess().reason, 'building');
  step(deviceById('mill').buildDays * DAY_SECONDS, 0, 1);
  assert.equal(millWatch().state, 'ready');
  assert.equal(orderProcess().reason, 'potato');
  const liters = Math.round(FIELD_HA * 44000);
  warehouse.push({ id: 80, crop: 'potato', name: '中熟商品薯', liters, listPrice: listed, unit: 'L', i: 1, j: 1, t: 0 });
  const batch = recipeById('starch-mill').inputs.find(i => i.id === 'potato').qty;
  assert.equal(orderProcess().ok, true);
  assert.equal(economy.revenue, 0);
  assert.equal(potatoStock(), liters - batch);
  assert.equal(millWatch().state, 'job');
  step(recipeById('starch-mill').timeDays * DAY_SECONDS, 0, 1);
  const starch = warehouse.find(lot => lot.crop === 'starch');
  assert.ok(starch);
  assert.equal(starch.listPrice, productById('starch').sellPrice);
  assert.equal(starch.name, '土豆淀粉');
  assert.equal(stores.peel, recipeById('starch-mill').outputs.find(o => o.id === 'peel').qty);
  assert.equal(sellLot(starch.id).listPrice, productById('starch').sellPrice);
  assert.equal(economy.revenue, productById('starch').sellPrice);

  stores.feed = 0;
  stores.peel = 4;
  assert.equal(startCulture(0, 'grub').reason, 'feed');
  assert.equal(stores.peel, 4);
  stores.feed = 0.6;
  const beforeRev = economy.revenue;
  const started = startCulture(0, 'grub');
  assert.equal(started.ok, true);
  assert.ok(Math.abs(stores.feed) < 1e-9, stores.feed);
  assert.equal(stores.peel, 0);
  assert.ok(economy.revenue < beforeRev, 'grub utilities burn when the purse can pay');
  step(65 * DAY_SECONDS, 0, 1);
  const grub = harvestCulture(0);
  assert.equal(grub.ok, true);
  assert.equal(grub.lot.listPrice, 2600);
  assert.equal(stores.frass, 1);
  assert.equal(sellLot(grub.lot.id).name, '蛴螬');

  const bare = fieldAt(focus.i, focus.j);
  stores.seed = 1;
  stores.fertilizer = 0;
  assert.equal(plantField(bare, 'potato').reason, 'fertilizer');
  stores.fertilizer = 0.5;
  assert.equal(fertPlan().fromFert, 0.5);
  assert.equal(plantField(bare, 'potato').ok, true);
  assert.ok(Math.abs(stores.fertilizer) < 1e-9);
  assert.ok(Math.abs(stores.frass) < 1e-9);
  stores.frass = 5;
  stores.fertilizer = 0;
  stores.seed = 1;
  const other = fields.find(f => f.owned && f !== bare && !f.live && f.state !== 3);
  assert.equal(plantField(other, 'potato').reason, 'fertilizer');

  const snap = exportSnapshot();
  assert.equal(snap.schema, 2);
  assert.equal(snap.devices.length, 1);
  assert.equal(snap.devices[0].kind, 'mill');
  delete snap.devices;
  delete snap.stores.peel;
  delete snap.stores.frass;
  stores.peel = 3;
  assert.equal(applySnapshot(snap), true);
  assert.equal(devices.length, 0);
  assert.equal(stores.peel, 0);
  assert.equal(stores.frass, 0);
  assert.equal(removeMill().reason, 'none');
});

test('planning a potato does not start the growth clock until the planter begins', () => {
  resetGame();
  setPaused(false);
  setTimeScale(1);
  stores.seed = 4;
  stores.fertilizer = 4;
  const a = fieldAt(focus.i, focus.j);
  const b = fields.find(f => f.owned && f !== a && !f.live && f.state !== 3);
  assert.equal(plantField(a, 'potato').ok, true);
  assert.equal(a.plantedAt, null);
  assert.equal(cropWatch(a).waiting, true);
  const planter = rigs.find(r => r.kind === 'planter');
  let arrive = 0;
  while (a.plantedAt == null && arrive < 8000) { step(0.5, 0, 1); arrive++; }
  assert.equal(planter.mode, 'work');
  assert.equal(typeof a.plantedAt, 'number');
  assert.equal(cropWatch(a).waiting, false);
  assert.equal(plantField(b, 'potato').ok, true);
  assert.equal(b.plantedAt, null);
  assert.equal(cropWatch(b).waiting, true);
  assert.equal(cropWatch(b).day, 0);
  assert.equal(fieldVisual(b).g, 0);
  const held = worldDay;
  const kind = planter.kind;
  planter.kind = 'held';
  try {
    step(2 * DAY_SECONDS, 0, 1);
    assert.equal(b.plantedAt, null);
    assert.equal(cropWatch(b).day, 0);
    assert.ok(cropWatch(a).day >= 2);
    assert.ok(worldDay > held);
  } finally {
    planter.kind = kind;
  }
  const snap = exportSnapshot();
  const saved = snap.fields.find(f => f.i === b.i && f.j === b.j);
  assert.equal(saved.plantedAt, null);
  b.plantedAt = 4;
  assert.equal(applySnapshot(snap), true);
  assert.equal(fieldAt(b.i, b.j).plantedAt, null);
  assert.equal(typeof fieldAt(a.i, a.j).plantedAt, 'number');
});

test('an empty machine returns to the garage and recharges before the next job', () => {
  resetGame();
  setPaused(false);
  setTimeScale(1);
  stores.seed = 2;
  stores.fertilizer = 2;
  const a = fieldAt(focus.i, focus.j);
  assert.equal(plantField(a, 'potato').ok, true);
  const planter = rigs.find(r => r.kind === 'planter');
  assert.notEqual(Math.hypot(planter.x - a.x0, planter.z - a.z0), 0);
  assert.equal(planter.mode, 'travel');
  let n = 0;
  while (planter.mode !== 'work' && n < 8000) { step(0.5, 0, 1); n++; }
  assert.equal(planter.mode, 'work');
  assert.equal(typeof a.plantedAt, 'number');
  assert.ok(planter.charge < 1, planter.charge);
  const heldKey = planter.job;
  const held = a.jobS[heldKey];
  planter.charge = 0;
  step(0.3, 0, 1);
  assert.equal(planter.intent, 'home');
  assert.equal(planter.mode, 'travel');
  assert.ok(Math.abs(a.jobS[heldKey] - held) < 0.05);
  n = 0;
  while (planter.mode !== 'charge' && planter.mode !== 'park' && n < 8000) { step(0.5, 0, 1); n++; }
  assert.ok(planter.mode === 'charge' || planter.mode === 'park');
  const atGarage = Math.hypot(planter.x - planter.parkX, planter.z - planter.parkZ);
  assert.ok(atGarage < 2, atGarage);
  const before = planter.charge;
  step(6, 0, 1);
  assert.ok(planter.charge > before, planter.charge);
  assert.ok(planter.charge < 1, planter.charge);
  assert.ok(planter.mode === 'charge' || planter.mode === 'park');
  assert.notEqual(planter.mode, 'travel');
});

test('a machine stays in the garage until the battery is full', () => {
  resetGame();
  setPaused(false);
  setTimeScale(1);
  assert.equal(BATT_RANGE, 21000);
  assert.equal(BATT_LEAVE, 1);
  stores.seed = 2;
  stores.fertilizer = 2;
  const a = fieldAt(focus.i, focus.j);
  const planter = rigs.find(r => r.kind === 'planter');
  planter.charge = 0.5;
  planter.mode = 'charge';
  assert.equal(plantField(a, 'potato').ok, true);
  step(0.2, 0, 1);
  assert.notEqual(planter.mode, 'travel');
  assert.ok(Math.hypot(planter.x - planter.parkX, planter.z - planter.parkZ) < 2);
  planter.x = a.x0 + 20;
  planter.z = a.z0 + 20;
  planter.charge = 0.5;
  planter.mode = 'park';
  planter.busy = false;
  planter.f = null;
  step(0.05, 0, 1);
  assert.equal(planter.f, a, 'partial charge outside the garage still resumes the field');
  assert.equal(planter.mode, 'travel');
});

test('warehouse stacks lots and keeps a soft capacity', () => {
  resetGame();
  warehouse.push(
    { id: 901, crop: 'potato', name: '中熟商品薯', liters: 1000, listPrice: 400, i: 1, j: 1, t: 0 },
    { id: 902, crop: 'potato', name: '中熟商品薯', liters: 500, listPrice: 200, i: 2, j: 1, t: 0 },
  );
  const cap = warehouseCapacity();
  assert.equal(cap.soft, true);
  assert.equal(cap.maxSlots, null);
  assert.equal(cap.usedSlots, 1);
  assert.equal(cap.usedLiters, 1500);
  const sold = sellStack('potato', 0.5);
  assert.equal(sold.listPrice, 300);
  assert.equal(warehouseCapacity().usedLiters, 750);
  assert.equal(sellStack('potato', 1).listPrice, 300);
  assert.equal(warehouse.filter(lot => lot.crop === 'potato').length, 0);
  const dossier = cropDossier('potato');
  assert.equal(dossier.plantable, true);
  assert.equal(dossier.stages.length, POTATO_STAGES.length);
  assert.ok(dossier.stages.every(s => s.color && s.days > 0));
  assert.equal(dossier.stages.filter(s => s.id !== 'potato_clear').reduce((sum, s) => sum + s.days, 0), POTATO_ROT_AT);
  assert.equal(dossier.stages.find(s => s.id === 'potato_clear').days, 3);
  const hold = dossier.stages.find(s => s.id === 'potato_harvest');
  assert.equal(hold.name, '成熟待收');
  assert.equal(hold.from, POTATO_DAYS);
  assert.equal(hold.to, POTATO_ROT_AT);
  assert.equal(cropDossier('soy').plantable, true);
  assert.equal(cropDossier('feed_barley').stages.length, 6);
  assert.equal(cropDossier('cabbage').inputs.some(i => i.id === 'seedling_cabbage'), true);
  assert.equal(dossier.inputs.find(i => i.id === 'seed').qty, 1);
  assert.equal(dossier.inputs.find(i => i.id === 'fertilizer').qty, 1);
  const water = dossier.inputs.find(i => i.id === 'water');
  assert.equal(water.qty, 40);
  assert.equal(water.charged, false);
  assert.equal(dossier.outputs[0].liters, Math.round(FIELD_HA * 44000));
  assert.equal(dossier.outputs[0].price, quote(CROPS.findIndex(c => c.id === 'potato')));
  const wheat = cropDossier('wheat');
  assert.equal(wheat.plantable, false);
  assert.equal(wheat.inputs.length, 0);
  assert.equal(wheat.outputs.length, 0);
  assert.equal(HUB_SITES.filter(s => s.local).length, 1);
  assert.equal(HUB_SITES.length, Math.floor(L.NBX / 7));
  assert.ok(HUB_SITES.every(s => s.bj === L.HUBZ));
});

test('the machine shop spends revenue and a reload keeps the extra rigs', () => {
  resetGame();
  const before = rigs.length;
  assert.equal(before, 4);
  assert.equal(SHOP.length, 6);
  assert.ok(MACHINE_SHOP.length >= 5);
  assert.ok(MACHINE_SHOP.some(m => m.id === 'tractor' && m.name === '拖拉机'));
  assert.ok(MACHINE_SHOP.some(m => m.id === 'planter'));
  assert.ok(MACHINE_SHOP.some(m => m.id === 'hiller'));
  assert.ok(MACHINE_SHOP.some(m => m.id === 'topper'));
  assert.ok(MACHINE_SHOP.some(m => m.id === 'lifter'));
  economy.revenue = 0;
  const broke = buyMachine('planter');
  assert.equal(broke.ok, false);
  assert.equal(broke.reason, 'money');
  assert.equal(rigs.length, before);
  economy.revenue = 9000;
  const bought = buyMachine('planter');
  assert.equal(bought.ok, true);
  assert.equal(economy.revenue, 0);
  assert.equal(rigs.filter(r => r.kind === 'planter').length, 2);
  economy.revenue = 12000;
  const tractor = buyMachine('tractor');
  assert.equal(tractor.ok, true);
  assert.equal(rigs.filter(r => r.kind === 'tractor').length, 1);
  const snap = exportSnapshot();
  assert.equal(snap.schema, 2);
  assert.deepEqual(snap.fleet.map(x => x.kind).sort(), ['planter', 'tractor']);
  resetGame();
  assert.equal(rigs.length, before);
  assert.equal(rigs.some(r => r.kind === 'tractor'), false);
  assert.equal(applySnapshot(snap), true);
  assert.equal(rigs.filter(r => r.kind === 'tractor').length, 1);
  assert.equal(rigs.filter(r => r.kind === 'planter').length, 2);
  assert.equal(applySnapshot(snap), true);
  assert.equal(rigs.filter(r => r.kind === 'tractor').length, 1);
  assert.equal(rigs.filter(r => r.kind === 'planter').length, 2);
  const starters = rigs.slice(0, 4);
  assert.deepEqual(starters.map(r => r.kind), ['planter', 'hiller', 'topper', 'lifter']);
  resetGame();
});

test('two planters take different fields and a spare stays home', () => {
  resetGame();
  setPaused(false);
  setTimeScale(1);
  stores.seed = 4;
  stores.fertilizer = 4;
  economy.revenue = 9000;
  assert.equal(buyMachine('planter').ok, true);
  const planters = rigs.filter(r => r.kind === 'planter');
  assert.equal(planters.length, 2);
  const a = fieldAt(focus.i, focus.j);
  assert.equal(plantField(a, 'potato').ok, true);
  const claimed = planters.filter(p => p.f === a);
  assert.equal(claimed.length, 1);
  assert.ok(claimed[0].mode === 'travel' || claimed[0].mode === 'work');
  const spare = planters.find(p => p !== claimed[0]);
  assert.ok(spare.mode === 'park' || spare.mode === 'charge');
  assert.equal(spare.f, null);
  const b = fields.find(f => f.owned && f !== a && !f.live && f.state !== 3);
  assert.ok(b);
  assert.equal(plantField(b, 'potato').ok, true);
  assert.equal(new Set(planters.map(p => p.f)).size, 2);
  assert.ok(planters.every(p => p.mode === 'travel' || p.mode === 'work'));
  const x0 = planters.map(p => p.x);
  const z0 = planters.map(p => p.z);
  step(1, 0, 1);
  assert.equal(planters[0].f === planters[1].f, false);
  const d = Math.hypot(planters[0].x - planters[1].x, planters[0].z - planters[1].z);
  assert.ok(d > 3, d);
  const moved = planters.some((p, i) => Math.hypot(p.x - x0[i], p.z - z0[i]) > 1);
  assert.equal(moved, true);
  resetGame();
});

test('one real minute is two world hours, and pause still holds the clock', () => {
  resetGame();
  setPaused(false);
  setTimeScale(1);
  const t0 = worldDay;
  step(60, 0, 1);
  assert.ok(Math.abs(worldDay - t0 - 60 / DAY_SECONDS) < 1e-9, worldDay - t0);
  assert.ok(Math.abs(60 / DAY_SECONDS - 1 / 12) < 1e-12);
  setPaused(true);
  const held = worldDay;
  step(60, 0, 12);
  assert.equal(worldDay, held);
  setPaused(false);
  const t1 = worldDay;
  step(60, 0, 4);
  assert.ok(Math.abs(worldDay - t1 - 240 / DAY_SECONDS) < 1e-9);
  setTimeScale(1);
});

function armLifter(f, day) {
  f.plantedAt = worldDay - day;
  f.jobS = {};
  for (const j of cropDef('potato').jobs) f.jobS[j.id] = L.LANES;
  f.jobS.potato_harvest = L.LANES - 0.02;
  f.yieldFactor = 1;
  f.penalized = {};
  f.harvested = false;
  f.stored = false;
  f.sprayed = true;
  const lifter = rigs.find(r => r.kind === 'lifter');
  lifter.kind = 'lifter';
  lifter.charge = 1;
  lifter.bin = 0;
  lifter.mode = 'park';
  lifter.busy = false;
  lifter.job = null;
  lifter.f = null;
  lifter.x = lifter.parkX;
  lifter.z = lifter.parkZ;
  return lifter;
}

test('a mature field waits, then rots if nobody lifts it', () => {
  resetGame();
  setPaused(false);
  stores.seed = 2;
  stores.fertilizer = 2;
  const f = fieldAt(focus.i, focus.j);
  assert.equal(plantField(f, 'potato').ok, true);
  f.plantedAt = worldDay - 12;
  f.jobS.potato_plant = 0;
  assert.equal(fieldVisual(f).g, 1, 'emergence stays off until the planter finishes');
  f.jobS.potato_plant = L.LANES;
  const mid = fieldVisual(f);
  assert.ok(mid.g > 3.2 && mid.g < 3.5, mid.g);
  assert.equal(cropWatch(f).phase, 'potato_emerg');
  f.plantedAt = worldDay - 50;
  for (const id of Object.keys(f.jobS)) f.jobS[id] = id === 'potato_plant' ? L.LANES : 0;
  assert.equal(cropWatch(f).phase, 'potato_bulk');
  assert.equal(fieldVisual(f).s, 0);
  const lifter = rigs.find(r => r.kind === 'lifter');
  lifter.kind = 'held';
  try {
    f.plantedAt = worldDay - 85;
    f.jobS.potato_plant = L.LANES;
    step(1, 0, 1);
    assert.equal(cropWatch(f).phase, 'potato_harvest');
    assert.equal(cropWatch(f).label, '成熟待收');
    assert.equal(f.live, true);
    assert.equal(warehouse.length, 0);
    f.plantedAt = worldDay - POTATO_ROT_AT;
    step(1, 0, 1);
    assert.equal(f.failed, 'rot');
    assert.equal(f.live, false);
    assert.equal(f.cycle, false);
    assert.equal(warehouse.length, 0);
    assert.equal(cropWatch(f).phase, 'rot');
    assert.equal(cropWatch(f).label, '烂在地里');
    assert.ok(fieldVisual(f).g > 8);
    assert.equal(log.some(e => e.type === 'rot' && e.i === f.i), true);
  } finally {
    lifter.kind = 'lifter';
  }
});

test('the lifter stores the field, and a cycle replants only when supplies are there', () => {
  resetGame();
  setPaused(false);
  setTimeScale(1);
  stores.seed = 1;
  stores.fertilizer = 1;
  economy.revenue = 0;
  const f = fieldAt(focus.i, focus.j);
  assert.equal(plantField(f, 'potato', { cycle: true, autoBuy: false }).ok, true);
  assert.equal(f.cycle, true);
  assert.equal(f.autoBuy, false);
  armLifter(f, 83);
  let n = 0;
  while (warehouse.length < 1 && n < 8000) { step(0.5, 0, 1); n++; }
  assert.equal(warehouse.length, 1);
  assert.equal(f.live, false);
  assert.equal(f.cycle, true);
  assert.equal(f.autoBuy, false);
  assert.equal(stores.seed, 0);
  assert.equal(economy.revenue, 0);

  resetGame();
  stores.seed = 1;
  stores.fertilizer = 1;
  economy.revenue = 5000;
  const g = fieldAt(focus.i, focus.j);
  assert.equal(plantField(g, 'potato', { cycle: true, autoBuy: true }).ok, true);
  assert.equal(stores.seed, 0);
  armLifter(g, 83);
  n = 0;
  while (warehouse.length < 1 && n < 8000) { step(0.5, 0, 1); n++; }
  assert.equal(warehouse.length, 1);
  assert.equal(g.live, true);
  assert.equal(g.plantedAt, null);
  assert.equal(g.cycle, true);
  assert.equal(g.autoBuy, true);
  assert.equal(stores.seed, 0);
  assert.equal(economy.revenue, 5000 - 1800 - 900);
  const snap = exportSnapshot();
  const row = snap.fields.find(s => s.i === g.i && s.j === g.j);
  assert.equal(snap.schema, 2);
  assert.equal(row.cycle, true);
  assert.equal(row.autoBuy, true);
  assert.equal(row.failed, null);
  g.cycle = false;
  g.autoBuy = false;
  assert.equal(applySnapshot(snap), true);
  assert.equal(fieldAt(g.i, g.j).cycle, true);
  assert.equal(fieldAt(g.i, g.j).autoBuy, true);
  delete row.cycle;
  delete row.autoBuy;
  delete row.failed;
  assert.equal(applySnapshot(snap), true);
  assert.equal(fieldAt(g.i, g.j).cycle, false);
  assert.equal(fieldAt(g.i, g.j).autoBuy, false);
  assert.equal(fieldAt(g.i, g.j).failed, null);
  assert.equal(seasonAllowsSow(g), true);
  assert.equal(fieldOps().cultivate, false);
  assert.equal(fieldOps().amend, false);
  assert.match(fieldOps().note, /中耕弃作/);
});

test('drones scout and treat from a base, not the machine garage', () => {
  resetGame();
  setPaused(false);
  assert.equal(BUILDING_KINDS.drone_base.name, '无人机基站');
  assert.equal(DRONE_SHOP.map(d => d.id).join(','), 'drone_scout,drone_spray');
  assert.equal(buyDrone('drone_scout').reason, 'base');
  assert.equal(workDrones.length, 0);
  assert.equal(rigs.length, 4);
  economy.revenue = 0;
  const hub = fieldAt(L.HUBX * L.PER + 2, L.HUBZ * L.PER + 2);
  assert.equal(placeBuilding(hub.x0 + 40, hub.z0 + 40, 'drone_base').reason, 'money');
  economy.revenue = 8000 + 4500 + 5200;
  const placed = placeBuilding(hub.x0 + 40, hub.z0 + 40, 'drone_base');
  assert.equal(placed.ok, true);
  assert.equal(placed.cost, 8000);
  assert.equal(droneBase().kind, 'drone_base');
  assert.equal(buyDrone('drone_scout').ok, true);
  assert.equal(buyDrone('drone_spray').ok, true);
  assert.equal(workDrones.length, 2);
  assert.equal(rigs.length, 4);
  assert.ok(workDrones.every(d => Math.hypot(d.x - droneBase().x, d.z - droneBase().z) < 20));
  const scout = workDrones.find(d => d.kind === 'drone_scout');
  const spray = workDrones.find(d => d.kind === 'drone_spray');
  stores.seed = 2;
  stores.fertilizer = 2;
  const f = fieldAt(focus.i, focus.j);
  assert.equal(plantField(f, 'potato').ok, true);
  const jobs = cropDef('potato').jobs;
  assert.equal(jobs.some(j => j.id === 'potato_scout' && j.drone && j.cap === 'scout' && !j.required), true);
  assert.equal(jobs.some(j => j.id === 'potato_treat' && j.drone && j.cap === 'pest_treat' && !j.required), true);
  assert.equal(jobs.some(j => j.spray), false);
  f.plantedAt = worldDay - 40;
  for (const j of jobs) f.jobS[j.id] = j.id === 'potato_scout' || j.id === 'potato_treat' ? 0 : L.LANES;
  const starterKinds = rigs.slice(0, 4).map(r => r.kind);
  for (const r of rigs) r.kind = 'held';
  try {
    step(1, 0, 1);
    assert.equal(rigs.some(r => r.job === 'potato_scout' || r.job === 'potato_treat'), false);
    let n = 0;
    while (scout.job !== 'potato_scout' && n < 40) { step(0.5, 0, 1); n++; }
    assert.equal(scout.job, 'potato_scout');
    assert.equal(spray.job, null);
    assert.notEqual(scout.mode, 'park');
  } finally {
    rigs.slice(0, 4).forEach((r, i) => { r.kind = starterKinds[i]; });
    resetGame();
  }
});
