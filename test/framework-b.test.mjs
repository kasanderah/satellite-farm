import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITIES, GROUNDS, JOBS, PREP_RECIPES, PLANT_CROPS, OMNI, TRACTOR, PLOW, MACHINE_CLASSES,
  GROW_DAYS, GROW_SECONDS, HUB_PLOT, plotAddress, lookG, fieldShader, hitchStub, workSweepLook,
  createFarm, addField, addMachine, mountHitch, chooseMachine, requestPrep, requestPlant, stepFarm, fieldWork, describeField,
} from '../src/framework-b.js';
import { installShippedLastika } from '../src/lastika-stage.js';
import { alignFieldCalendar, jobWindows, parseFieldStageDoc } from '../src/field-stages.js';
import lastikaRaw from '../data/field-stages/lastika.json' with { type: 'json' };
import { HUD_VERSION } from '../src/version.js';
import { fieldVisual, CROPS, roadRoute } from '../src/_shared.js';
import { DAY_SECONDS, WORLD_MIN_PER_REAL_MIN } from '../src/world-clock.js';

function slice() {
  const farm = createFarm();
  addMachine(farm, { ...OMNI, caps: OMNI.caps.slice(), energyLeft: OMNI.energyKwh });
  addField(farm, { id: 'a', length: 128, width: 128, ground: 'raw', look: 'raw', plot: 'P(3,-1)' });
  return farm;
}

function until(farm, pred, cap = 600, step = 1) {
  let t = 0;
  while (t < cap && !pred()) {
    stepFarm(farm, step);
    t += step;
  }
  assert.ok(t < cap, '超时');
  return t;
}

test('清地只有犁地，犁完是一般田地，田上不留进度', () => {
  const farm = slice();
  const field = farm.fields.get('a');
  assert.equal(PREP_RECIPES.clear_general.targetName, '一般田地');
  assert.deepEqual(PREP_RECIPES.clear_general.steps, ['plow']);
  assert.equal(JOBS.plow.kind, 'hard');
  assert.deepEqual(JOBS.plow.caps, ['犁田']);
  assert.equal(CAPABILITIES['犁田'].name, '犁田');
  const started = requestPrep(farm, 'a');
  assert.equal(started.ok, true);
  stepFarm(farm, 1);
  assert.match(describeField(farm, 'a').stat, /清地/);
  assert.match(describeField(farm, 'a').stat, /犁地/);
  const mid = fieldWork(farm, 'a');
  assert.equal(mid.jobId, 'plow');
  assert.equal(mid.width, OMNI.width);
  assert.equal(mid.origin, OMNI.origin);
  assert.ok(mid.progress > 0 && mid.progress < 1);
  assert.equal(field.look, 'raw');
  assert.equal(Object.hasOwn(field, 'mask'), false);
  assert.equal(Object.hasOwn(field, 'progress'), false);
  assert.equal(fieldWork(farm, 'a').progress, mid.progress);
  const again = requestPrep(farm, 'a');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'lock');
  until(farm, () => field.ground === 'general');
  assert.equal(field.ground, 'general');
  assert.equal(field.look, 'general');
  assert.equal(field.lock, null);
  assert.equal(fieldWork(farm, 'a'), null);
  assert.ok(farm.events.some(ev => ev.type === 'job-complete' && ev.jobId === 'plow' && ev.look === 'general'));
  assert.equal(GROUNDS.general.name, '一般田地');
  const skip = requestPrep(farm, 'a');
  assert.equal(skip.skipped, true);
});

test('整地目标来自配方表，已经是该田面就不派车', () => {
  const recipes = Object.values(PREP_RECIPES);
  assert.ok(recipes.length >= 1);
  assert.ok(recipes.every(recipe => GROUNDS[recipe.target] && recipe.targetName && recipe.steps.length));
  assert.equal(recipes.find(recipe => recipe.id === 'clear_general').targetName, '一般田地');
  const farm = slice();
  const field = farm.fields.get('a');
  field.ground = 'general';
  field.look = 'general';
  const skip = requestPrep(farm, 'a', 'clear_general');
  assert.equal(skip.ok, true);
  assert.equal(skip.skipped, true);
  assert.equal(farm.queue.length, 0);
  assert.equal(farm.orders.length, 0);
  assert.equal(field.ground, 'general');
});

test('没整地不能种；播种做完才开始生长', () => {
  const farm = slice();
  const denied = requestPlant(farm, 'a', 'lastika');
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'ground');
  assert.equal(farm.fields.get('a').plant, null);
  requestPrep(farm, 'a');
  until(farm, () => farm.fields.get('a').ground === 'general');
  const planted = requestPlant(farm, 'a');
  assert.equal(planted.ok, true);
  const field = farm.fields.get('a');
  stepFarm(farm, 0.2);
  assert.equal(field.plant.stageId, 'sow');
  assert.equal(field.plant.clock, false);
  assert.equal(field.plant.grow, 0);
  assert.equal(field.look, 'general');
  until(farm, () => field.plant.clock);
  assert.equal(field.look, 'sown');
  assert.equal(field.plant.stageId, 'seedling');
  assert.ok(farm.events.some(ev => ev.type === 'clock-start' && ev.fieldId === 'a'));
  const atStart = field.plant.grow;
  stepFarm(farm, 1);
  assert.ok(field.plant.grow > atStart);
  assert.ok(field.plant.grow - atStart < 1);
  assert.equal(field.plant.need, 2);
  assert.equal(PLANT_CROPS.lastika.name, '拉斯提卡');
  assert.deepEqual(PLANT_CROPS.lastika.grounds, ['general']);
  assert.deepEqual(PLANT_CROPS.lastika.stages.map(s => s.name), ['青苗', '发育', '成熟', '烂地', '收获后']);
  assert.equal(PLANT_CROPS.lastika.visual.shape, 'bush');
  assert.equal(PLANT_CROPS.lastika.visual.tex, 'ridges');
  assert.equal(PLANT_CROPS.lastika.visual.row, 0.75);
  assert.equal(PLANT_CROPS.lastika.visual.height, 0.7);
  assert.equal(PLANT_CROPS.lastika.visual.along, 0.36);
  assert.notEqual(PLANT_CROPS.lastika.visual.row, 0.9);
});

test('成熟后收割再收拾，回到可种的一般田地', () => {
  const farm = slice();
  requestPrep(farm, 'a');
  until(farm, () => farm.fields.get('a').ground === 'general');
  requestPlant(farm, 'a');
  const field = farm.fields.get('a');
  until(farm, () => field.plant?.stageId === 'mature' && field.plant.grow >= 2.2, GROW_SECONDS + DAY_SECONDS * 3, DAY_SECONDS);
  until(farm, () => field.plant?.stageId === 'after', 4000);
  assert.equal(field.look, 'harvested');
  assert.equal(field.plant.clock, false);
  until(farm, () => field.plant == null, 800);
  assert.equal(field.ground, 'general');
  assert.equal(field.look, 'general');
  assert.equal(field.lock, null);
  const again = requestPlant(farm, 'a');
  assert.equal(again.ok, true);
  assert.equal(JOBS.sow.kind, 'hard');
  assert.equal(JOBS.harvest.kind, 'hard');
  assert.equal(JOBS.tidy.kind, 'hard');
  assert.equal(JOBS.plow.kind, 'hard');
  assert.deepEqual(
    Object.values(JOBS).filter(job => job.kind === 'hard').map(job => job.id).sort(),
    ['harvest', 'plow', 'sow', 'tidy'],
  );
  for (const job of Object.values(JOBS)) {
    assert.equal(job.next, undefined);
    assert.equal(job.nextStage, undefined);
    assert.equal(job.stageId, undefined);
  }
});

test('追肥在第5到6日，做完加倍产量，不改田面色', () => {
  const farm = slice();
  requestPrep(farm, 'a');
  until(farm, () => farm.fields.get('a').ground === 'general');
  requestPlant(farm, 'a');
  const field = farm.fields.get('a');
  until(farm, () => field.plant?.stageId === 'develop' && field.plant.grow >= 2.5, GROW_SECONDS, DAY_SECONDS);
  assert.equal(field.plant.soft.topdress.from, 5);
  assert.equal(field.plant.soft.topdress.to, 6);
  assert.equal(field.plant.soft.topdress.status, '未执行');
  until(farm, () => field.plant.soft.topdress.status === '执行中' && field.plant.soft.topdress.progress > 0.05);
  assert.equal(field.lock, null);
  assert.equal(field.look, 'sown');
  assert.equal(field.plant.stageId, 'develop');
  const softOrder = farm.orders.find(order => order.jobId === 'topdress');
  assert.ok(softOrder.pose.passes > 1);
  assert.equal(softOrder.pose.passes, Math.ceil(field.width / softOrder.width));
  assert.equal(JOBS.topdress.brush.enabled, false);
  assert.equal(JOBS.topdress.look, '不影响');
  assert.equal(workSweepLook(JOBS.sow), 'sown');
  assert.equal(workSweepLook(JOBS.plow), 'general');
  assert.equal(workSweepLook(JOBS.topdress), null);
  assert.equal(workSweepLook(JOBS.hill), null);
  until(farm, () => field.plant.soft.topdress.status === '执行完', 800);
  assert.equal(field.plant.yieldMul, 2);
  assert.equal(field.look, 'sown');
  assert.equal(field.plant.stageId, 'develop');
  const view = describeField(farm, 'a');
  assert.equal(view.yieldValue, 200);
  assert.equal(view.jobs.find(job => job.id === 'topdress').status, '执行完');
  assert.equal(view.barStages.at(-1).name, '烂地');
});

test('调度优先更快的自走一体机，拖挂单独派不出去', () => {
  const farm = createFarm();
  addMachine(farm, hitchStub());
  addMachine(farm, {
    id: 'slow', classId: 'self', className: '自走机', integral: true, name: '窄机',
    caps: ['犁田', '播种', '收割', '收拾'], origin: 1, width: 4, workSpeed: 2, cruiseSpeed: 4,
    powerOutKw: 20, energy: 'electric', energyKwh: 40, energyLeft: 40,
  });
  addMachine(farm, { ...OMNI, caps: OMNI.caps.slice(), energyLeft: OMNI.energyKwh });
  addField(farm, { id: 'a', length: 128, width: 128 });
  requestPrep(farm, 'a');
  const work = fieldWork(farm, 'a');
  assert.equal(work.width, OMNI.width);
  assert.ok(farm.orders[0].machineId === 'omni');
  assert.equal(MACHINE_CLASSES.hitch.power, 'demand');
  assert.equal(MACHINE_CLASSES.self.name, '自走机');
  assert.equal(MACHINE_CLASSES.air.name, '飞行机');
  assert.equal(hitchStub().powerNeedKw, 0);
  assert.equal(OMNI.energy, 'electric');
  stepFarm(farm, 2);
  const omni = farm.machines.find(m => m.id === 'omni');
  assert.ok(omni.energyLeft < omni.energyKwh);
});

test('能力调度：一体机优先于更快的拖挂，忙了才派拖拉机', () => {
  const farm = createFarm();
  addMachine(farm, { ...OMNI, caps: OMNI.caps.slice(), energyLeft: OMNI.energyKwh });
  addMachine(farm, { ...TRACTOR, caps: [], workSpeed: 30, cruiseSpeed: 30, energyLeft: TRACTOR.energyKwh });
  addMachine(farm, { ...PLOW, caps: PLOW.caps.slice(), width: 30 });
  assert.equal(mountHitch(farm, PLOW.id, TRACTOR.id).ok, true);
  addMachine(farm, {
    id: 'wing', classId: 'air', className: '飞行机', integral: false, name: '飞机',
    caps: ['追肥'], origin: 0, width: 40, workSpeed: 40, cruiseSpeed: 40,
    powerOutKw: 10, energy: 'electric', energyKwh: 10, energyLeft: 10,
  });
  addField(farm, { id: 'a', length: 128, width: 128, ground: 'raw', look: 'raw' });
  addField(farm, { id: 'b', length: 128, width: 128, ground: 'raw', look: 'raw' });
  for (const cap of ['犁田', '播种', '收割', '收拾', '追肥', '培土']) {
    assert.equal(chooseMachine(farm, [cap]).id, 'omni', cap);
  }
  assert.equal(chooseMachine(farm, ['没有这种能力']), null);
  assert.ok(chooseMachine(farm, ['犁田']).score < 30 * 30);
  requestPrep(farm, 'a');
  assert.equal(fieldWork(farm, 'a').machineId, 'omni');
  assert.equal(fieldWork(farm, 'a').hitchId, null);
  requestPrep(farm, 'b');
  const backup = fieldWork(farm, 'b');
  assert.equal(backup.machineId, 'tractor');
  assert.equal(backup.hitchId, 'plow');
  assert.equal(backup.width, 30);
  assert.equal(farm.machines.find(m => m.id === 'plow').busy, true);
  assert.equal(mountHitch(farm, 'plow', 'omni').reason, 'mounted');
  const weak = createFarm();
  addMachine(weak, { ...TRACTOR, caps: [], powerOutKw: 10, energyLeft: 10 });
  addMachine(weak, { ...PLOW, caps: ['犁田'], powerNeedKw: 80 });
  assert.equal(mountHitch(weak, 'plow', 'tractor').reason, 'power');
  assert.equal(chooseMachine(weak, ['犁田']), null);
  assert.equal(MACHINE_CLASSES.air.id, 'air');
});

test('第二块田排队，等第一块解锁', () => {
  const farm = slice();
  addField(farm, { id: 'b', length: 128, width: 128, ground: 'raw', look: 'raw' });
  assert.equal(requestPrep(farm, 'a').ok, true);
  assert.equal(requestPrep(farm, 'b').ok, true);
  assert.equal(fieldWork(farm, 'b'), null);
  until(farm, () => farm.fields.get('a').ground === 'general');
  stepFarm(farm, 0.05);
  assert.equal(fieldWork(farm, 'b')?.jobId, 'plow');
});

test('整块颜色和地块编号', () => {
  assert.equal(lookG('raw'), 0);
  assert.equal(lookG('general'), 1);
  assert.equal(lookG('mature'), 5);
  assert.equal(lookG('harvested'), 7);
  assert.ok(lookG('sown', 0) === 2);
  assert.ok(lookG('sown', 1) > 4);
  assert.equal(fieldShader({ look: 'general' }).mask, -1);
  assert.equal(fieldShader({ look: 'hold' }), null);
  const prepSweep = fieldShader({
    look: 'hold',
    sweep: { width: 16, pass: 2, alongFrac: 0.4, look: 'general' },
  });
  assert.equal(prepSweep.keep, true);
  assert.equal(prepSweep.g, undefined);
  assert.equal(prepSweep.next, 1);
  assert.ok(Math.abs(prepSweep.mask - (160 * 100 + 2.4)) < 1e-6, prepSweep.mask);
  const wheat = CROPS.findIndex(c => c.id === 'wheat');
  const held = fieldVisual({
    crop: wheat,
    dir: 0,
    state: 2,
    g: 1,
    s: 0,
    live: false,
    bUnit: { look: 'hold', sweep: { width: 16, pass: 2, alongFrac: 0.4, look: 'general' } },
  });
  assert.equal(held.holdSweep, true);
  assert.equal(held.crop, wheat);
  assert.equal(held.g, 1);
  assert.equal(held.next, 1);
  assert.notEqual(CROPS[held.crop].id, 'lastika');
  const addr = plotAddress(13, 9, 10, 10);
  assert.equal(addr.hub, HUB_PLOT);
  assert.equal(addr.code, 'P(3,-1)');
  const farm = slice();
  assert.match(describeField(farm, 'a').stat, /未整地/);
  requestPrep(farm, 'a');
  until(farm, () => farm.fields.get('a').ground === 'general');
  assert.match(describeField(farm, 'a').stat, /一般田地/);
  assert.match(describeField(farm, 'a').stat, /拉斯提卡/);
});

test('作业中按幅宽刷下一道，地头有转弯，做完整块定稿', () => {
  const farm = slice();
  requestPrep(farm, 'a');
  let turns = 0;
  let sawWork = false;
  for (let i = 0; i < 900 && farm.fields.get('a').look === 'raw'; i++) {
    stepFarm(farm, 0.25);
    const order = farm.orders.find(item => item.fieldId === 'a');
    if (!order) break;
    if (order.phase === 'turn') {
      turns += 1;
      assert.equal(farm.fields.get('a').look, 'raw');
      assert.notEqual(order.turnFrom.heading, order.turnTo.heading);
      assert.equal(order.pose, order.turnFrom);
      assert.equal(order.pose.alongFrac, 1);
      assert.match(describeField(farm, 'a').stat, /地头转弯/);
      const shade = fieldShader({
        look: 'raw',
        sweep: { width: order.width, pass: order.pose.pass, alongFrac: 1, look: 'general' },
      });
      assert.equal(shade.keep, undefined);
      assert.equal(shade.g, 0);
      assert.equal(shade.next, 1);
      assert.ok(Math.abs(shade.mask - (160 * 100 + order.pose.pass + 1)) < 1e-6, shade.mask);
      stepFarm(farm, 2);
    } else if (order.phase === 'work' && order.pose && order.progress < 1) {
      sawWork = true;
      const shade = fieldShader({
        look: 'raw',
        sweep: { width: order.width, pass: order.pose.pass, alongFrac: order.pose.alongFrac, look: 'general' },
      });
      assert.equal(shade.keep, undefined);
      assert.equal(shade.next, 1);
      assert.ok(shade.mask > 20);
      assert.equal(farm.fields.get('a').look, 'raw');
    }
  }
  assert.equal(turns, 7);
  assert.equal(sawWork, true);
  assert.equal(farm.fields.get('a').look, 'general');
  assert.equal(farm.fields.get('a').lock, null);
  const done = fieldShader({ look: 'general' });
  assert.equal(done.mask, -1);
  assert.equal(done.next, undefined);
});

test('名称旁状态跟着工单走，犁地不被播种队头挡住', () => {
  const farm = createFarm();
  addMachine(farm, { ...OMNI, caps: OMNI.caps.slice(), energyLeft: OMNI.energyKwh });
  addMachine(farm, { ...TRACTOR, caps: [], energyLeft: TRACTOR.energyKwh });
  addMachine(farm, { ...PLOW, caps: PLOW.caps.slice() });
  assert.equal(mountHitch(farm, PLOW.id, TRACTOR.id).ok, true);
  addField(farm, { id: 'a', length: 128, width: 128, ground: 'raw', look: 'raw' });
  addField(farm, { id: 'b', length: 128, width: 128, ground: 'general', look: 'general' });
  addField(farm, { id: 'c', length: 128, width: 128, ground: 'raw', look: 'raw' });
  addField(farm, { id: 'd', length: 128, width: 128, ground: 'raw', look: 'raw' });
  assert.equal(describeField(farm, 'a').badge, null);
  assert.match(describeField(farm, 'a').stat, /未整地/);
  requestPrep(farm, 'a');
  assert.equal(fieldWork(farm, 'a').machineId, 'omni');
  assert.equal(describeField(farm, 'a').badge, '整地中');
  assert.equal(requestPlant(farm, 'b').queued, true);
  assert.equal(describeField(farm, 'b').badge, '等待播种');
  requestPrep(farm, 'c');
  assert.equal(fieldWork(farm, 'c').machineId, 'tractor');
  assert.equal(fieldWork(farm, 'c').hitchId, 'plow');
  assert.equal(describeField(farm, 'c').badge, '整地中');
  assert.equal(farm.queue.some(item => item.fieldId === 'b' && item.jobId === 'sow'), true);
  requestPrep(farm, 'd');
  assert.equal(fieldWork(farm, 'd'), null);
  assert.equal(describeField(farm, 'd').badge, '等待整地');
  const pos = { omni: { x: 0, z: 0 }, tractor: { x: 0, z: 18 } };
  const targets = { a: { x: 280, z: 0 }, c: { x: 0, z: 400 } };
  const eta = (live, order) => {
    const at = targets[order.fieldId];
    const spot = pos[order.machineId];
    const machine = live.machines.find(item => item.id === order.machineId);
    const dist = Math.hypot(at.x - spot.x, at.z - spot.z);
    return dist < 1.5 ? 0 : dist / machine.cruiseSpeed;
  };
  const cruise = (live, order, slice) => {
    const at = targets[order.fieldId];
    const spot = pos[order.machineId];
    const machine = live.machines.find(item => item.id === order.machineId);
    const dx = at.x - spot.x;
    const dz = at.z - spot.z;
    const dist = Math.hypot(dx, dz);
    const step = machine.cruiseSpeed * slice;
    if (dist <= step || dist < 0.8) { spot.x = at.x; spot.z = at.z; return; }
    spot.x += (dx / dist) * step;
    spot.z += (dz / dist) * step;
  };
  stepFarm(farm, 1, { eta, cruise });
  assert.ok(pos.omni.x > 20, `一体机应马上开出，实际 x=${pos.omni.x}`);
  assert.ok(pos.tractor.z > 30, `拖拉机应马上开出，实际 z=${pos.tractor.z}`);
  assert.equal(describeField(farm, 'a').badge, '整地中');
  assert.equal(describeField(farm, 'c').badge, '整地中');
  until(farm, () => fieldWork(farm, 'a')?.phase === 'work');
  assert.equal(describeField(farm, 'a').badge, '犁地中');
  const hung = slice();
  const field = hung.fields.get('a');
  field.ground = 'general';
  field.look = 'mature';
  field.plant = {
    cropId: 'lastika', index: 1, stageId: 'mature', grow: 30, need: 36, clock: false,
    soft: { hill: { name: '培土', from: 20, to: 26, progress: 0.4, status: '过期' } },
  };
  assert.equal(describeField(hung, 'a').badge, '工单挂起提示');
  assert.equal(describeField(hung, 'a').suspend.title, '工单挂起提示');
  assert.match(describeField(hung, 'a').stat, /拉斯提卡/);
});

test('浮标空闲用短文案，有工单时与名称旁状态相同', () => {
  const farm = slice();
  addField(farm, { id: 'h', length: 128, width: 128, ground: 'raw', look: 'hold' });
  addField(farm, { id: 'g', length: 128, width: 128, ground: 'general', look: 'general' });
  assert.equal(describeField(farm, 'a').float, '未整地');
  assert.equal(describeField(farm, 'a').float.includes('整地后'), false);
  assert.match(describeField(farm, 'a').stat, /未整地/);
  assert.equal(describeField(farm, 'h').float, '定格冠层');
  assert.equal(describeField(farm, 'g').float, '一般田地 · 可以种植拉斯提卡');
  requestPrep(farm, 'a');
  assert.equal(describeField(farm, 'a').badge, '整地中');
  assert.equal(describeField(farm, 'a').float, describeField(farm, 'a').badge);
  requestPrep(farm, 'h');
  assert.equal(describeField(farm, 'h').float, '等待整地');
  stepFarm(farm, 1);
  assert.equal(describeField(farm, 'a').float, '犁地中');
  until(farm, () => farm.fields.get('a').ground === 'general');
  assert.equal(describeField(farm, 'a').float, '一般田地 · 可以种植拉斯提卡');
});

test('方案2：播种还在等一体机时犁地照样派拖拉机，一体机腾出来先接播种', () => {
  const farm = createFarm();
  addMachine(farm, { ...OMNI, caps: OMNI.caps.slice(), energyLeft: OMNI.energyKwh });
  addMachine(farm, { ...TRACTOR, caps: [], energyLeft: TRACTOR.energyKwh });
  addMachine(farm, { ...PLOW, caps: PLOW.caps.slice() });
  assert.equal(mountHitch(farm, PLOW.id, TRACTOR.id).ok, true);
  addField(farm, { id: 'a', length: 128, width: 128, ground: 'raw', look: 'raw' });
  addField(farm, { id: 'b', length: 128, width: 128, ground: 'raw', look: 'raw' });
  addField(farm, { id: 'c', length: 128, width: 128, ground: 'general', look: 'general' });
  addField(farm, { id: 'd', length: 128, width: 128, ground: 'raw', look: 'raw' });
  assert.equal(chooseMachine(farm, ['犁田'], (id) => (id === 'omni' ? 80 : 1)).id, 'omni');
  requestPrep(farm, 'a');
  requestPrep(farm, 'b');
  assert.equal(fieldWork(farm, 'a').machineId, 'omni');
  assert.equal(fieldWork(farm, 'b').machineId, 'tractor');
  requestPlant(farm, 'c');
  requestPrep(farm, 'd');
  assert.equal(fieldWork(farm, 'c'), null);
  assert.equal(describeField(farm, 'c').float, '等待播种');
  assert.equal(fieldWork(farm, 'd'), null);
  assert.equal(describeField(farm, 'd').float, '等待整地');
  until(farm, () => fieldWork(farm, 'c')?.machineId === 'omni');
  assert.equal(fieldWork(farm, 'b').machineId, 'tractor');
  assert.equal(fieldWork(farm, 'd'), null);
  assert.equal(describeField(farm, 'c').float, '播种中');
  assert.equal(describeField(farm, 'd').float, '等待整地');
  const ties = createFarm();
  addMachine(ties, {
    id: 'near', classId: 'self', integral: false, name: '近',
    caps: ['犁田'], origin: 1, width: 10, workSpeed: 10, cruiseSpeed: 10,
    powerOutKw: 40, energy: 'electric', energyKwh: 40, energyLeft: 40,
  });
  addMachine(ties, {
    id: 'far', classId: 'self', integral: false, name: '远',
    caps: ['犁田'], origin: 1, width: 10, workSpeed: 10, cruiseSpeed: 10,
    powerOutKw: 40, energy: 'electric', energyKwh: 40, energyLeft: 40,
  });
  assert.equal(chooseMachine(ties, ['犁田'], (id) => (id === 'far' ? 30 : 4)).id, 'near');
});

test('种着的地可以整地清掉', () => {
  const farm = slice();
  requestPrep(farm, 'a');
  until(farm, () => farm.fields.get('a').ground === 'general');
  requestPlant(farm, 'a');
  const field = farm.fields.get('a');
  until(farm, () => field.plant?.clock);
  const again = requestPrep(farm, 'a');
  assert.equal(again.ok, true);
  assert.equal(again.queued, true);
  assert.equal(field.plant, null);
  assert.equal(field.look, 'raw');
  assert.equal(fieldWork(farm, 'a')?.jobId, 'plow');
  until(farm, () => fieldWork(farm, 'a') == null);
  assert.equal(field.ground, 'general');
  assert.equal(field.look, 'general');
  const view = describeField(farm, 'a');
  assert.deepEqual(view.actions.map(act => act.id), ['prep', 'plant']);
});

test('农机巡航沿田路折线，不斜穿田块', () => {
  const path = roadRoute(0, 0, 500, 380);
  assert.ok(path.length >= 2);
  for (let i = 1; i < path.length; i++) {
    const dx = Math.abs(path[i][0] - path[i - 1][0]);
    const dz = Math.abs(path[i][1] - path[i - 1][1]);
    assert.ok(dx < 1.2 || dz < 1.2);
  }
});

test('生长钟按世界日走', () => {
  assert.equal(WORLD_MIN_PER_REAL_MIN, 120);
  assert.equal(DAY_SECONDS, 720);
  assert.equal(GROW_DAYS, 12);
  assert.equal(GROW_SECONDS, 12 * 720);
  assert.equal(lastikaRaw.secondsPerDayAt1x, 720);
  const farm = slice();
  requestPrep(farm, 'a');
  until(farm, () => farm.fields.get('a').ground === 'general');
  requestPlant(farm, 'a');
  const field = farm.fields.get('a');
  until(farm, () => field.plant.clock);
  const before = field.plant.grow;
  stepFarm(farm, DAY_SECONDS);
  assert.ok(Math.abs(field.plant.grow - before - 1) < 1e-6);
  assert.equal(field.plant.need, 2);
  assert.match(describeField(farm, 'a').stat, /青苗 · 1\.0 \/ 12 世界日/);
  assert.equal(field.look, 'sown');
});

test('错过成熟窗进腐烂，没有农机开工就不会收', () => {
  const farm = slice();
  requestPrep(farm, 'a');
  until(farm, () => farm.fields.get('a').ground === 'general');
  requestPlant(farm, 'a');
  const field = farm.fields.get('a');
  until(farm, () => field.plant?.stageId === 'mature' && field.plant.grow >= 2.2, GROW_SECONDS + DAY_SECONDS * 2, DAY_SECONDS);
  farm.machines.splice(0, farm.machines.length);
  farm.orders.splice(0, farm.orders.length);
  farm.queue.splice(0, farm.queue.length);
  assert.equal(farm.orders.length, 0);
  assert.equal(field.look, 'mature');
  const hold = field.plant.need;
  until(farm, () => field.plant.stageId === 'rot', (hold + 2) * DAY_SECONDS, DAY_SECONDS);
  assert.equal(field.look, 'rot');
  assert.equal(field.plant.clock, false);
  assert.equal(lookG('rot'), 8);
  stepFarm(farm, DAY_SECONDS * 3);
  assert.equal(field.plant.stageId, 'rot');
  assert.equal(field.ground, 'general');
});

test('拉斯提卡阶段和版本戳来自同一份定义', () => {
  assert.equal(HUD_VERSION, '环穗 v6.7');
  const doc = parseFieldStageDoc(structuredClone(lastikaRaw));
  const windows = jobWindows(doc, alignFieldCalendar(doc)).filter(item => item.op.kind === 'optional');
  assert.deepEqual(windows.map(item => item.op.id), ['topdress', 'hill']);
  const crop = installShippedLastika();
  assert.equal(crop.name, '拉斯提卡');
  assert.equal(crop.graph.entry.job, 'sow');
  assert.equal(crop.graph.entry.to, 'seedling');
  assert.deepEqual(crop.graph.edges.map(edge => edge.kind), ['natural', 'natural', 'hard', 'natural', 'hard', 'hard']);
  assert.deepEqual(crop.stages.map(s => [s.id, s.role, s.name]), [
    ['seedling', 'head', '青苗'],
    ['develop', 'node', '发育'],
    ['mature', 'node', '成熟'],
    ['rot', 'rot', '烂地'],
    ['after', 'tail', '收获后'],
  ]);
  const mature = crop.stages.find(stage => stage.id === 'mature');
  assert.equal(mature.role === 'tail', false);
  assert.equal(mature.days, 4);
  assert.deepEqual(mature.jobs, [{ job: 'harvest', kind: 'hard', name: '收获', from: 11, to: 12 }]);
  assert.equal(crop.stages.find(stage => stage.id === 'rot').days, undefined);
  assert.equal(crop.stages.find(stage => stage.id === 'after').days, undefined);
  assert.deepEqual(crop.stages.find(stage => stage.id === 'develop').jobs, [
    { job: 'topdress', kind: 'soft', name: '追肥', from: 5, to: 6, yieldMul: 2 },
  ]);
  assert.equal(crop.growDays, 12);
  assert.equal(crop.maturity.fullAt, 10);
  assert.equal(crop.maturity.maxHarvest, 120);
  assert.equal(crop.maturity.rotLine, 120);
  assert.equal(crop.growSeconds, 12 * DAY_SECONDS);
  assert.equal(crop.visual.row, 0.75);
  assert.equal(crop.visual.height, 0.7);
  assert.equal(crop.visual.along, 0.36);
  assert.equal(crop.visual.tex, 'ridges');
});
