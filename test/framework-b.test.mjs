import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITIES, GROUNDS, JOBS, PREP_RECIPES, PLANT_CROPS, OMNI, TRACTOR, PLOW, MACHINE_CLASSES,
  GROW_SECONDS, HUB_PLOT, plotAddress, lookG, fieldShader, hitchStub,
  createFarm, addField, addMachine, mountHitch, chooseMachine, requestPrep, requestPlant, stepFarm, fieldWork, describeField,
} from '../src/framework-b.js';
import { installShippedLastika } from '../src/lastika-stage.js';
import { alignFieldCalendar, jobWindows, parseFieldStageDoc } from '../src/field-stages.js';
import lastikaRaw from '../data/field-stages/lastika.json' with { type: 'json' };
import { HUD_VERSION } from '../src/version.js';
import { fieldVisual, CROPS } from '../src/_shared.js';

function slice() {
  const farm = createFarm();
  addMachine(farm, { ...OMNI, caps: OMNI.caps.slice(), energyLeft: OMNI.energyKwh });
  addField(farm, { id: 'a', length: 128, width: 128, ground: 'raw', look: 'raw', plot: 'P(3,-1)' });
  return farm;
}

function until(farm, pred, cap = 600) {
  let t = 0;
  while (t < cap && !pred()) {
    stepFarm(farm, 1);
    t += 1;
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
  assert.ok(farm.events.some(ev => ev.type === 'clock-start' && ev.fieldId === 'a'));
  const atStart = field.plant.grow;
  stepFarm(farm, 1);
  assert.ok(field.plant.grow > atStart);
  assert.equal(field.plant.need, GROW_SECONDS);
  assert.equal(PLANT_CROPS.lastika.name, '拉斯提卡');
  assert.deepEqual(PLANT_CROPS.lastika.grounds, ['general']);
  assert.deepEqual(PLANT_CROPS.lastika.stages.map(s => s.name), ['播种', '成熟', '收割', '收拾']);
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
  until(farm, () => field.look === 'mature');
  assert.equal(field.plant.stageId, 'harvest');
  assert.equal(field.plant.clock, false);
  until(farm, () => field.look === 'harvested');
  assert.equal(field.plant.stageId, 'tidy');
  until(farm, () => field.plant == null);
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

test('成熟段软作业记完成度，窗口过了挂起，不锁田也不改阶段', () => {
  const farm = slice();
  requestPrep(farm, 'a');
  until(farm, () => farm.fields.get('a').ground === 'general');
  requestPlant(farm, 'a');
  const field = farm.fields.get('a');
  until(farm, () => field.plant?.clock);
  assert.equal(field.lock, null);
  assert.equal(field.plant.stageId, 'mature');
  assert.equal(field.plant.soft.topdress.status, '未执行');
  assert.equal(field.plant.soft.hill.status, '未执行');
  assert.equal(describeField(farm, 'a').suspend, null);
  until(farm, () => field.plant.soft.topdress.status === '执行中' && field.plant.soft.topdress.progress > 0.05);
  assert.equal(field.lock, null);
  assert.equal(field.look, 'sown');
  assert.equal(field.plant.stageId, 'mature');
  const softOrder = farm.orders.find(order => order.jobId === 'topdress');
  assert.equal(softOrder.passCap, 1);
  assert.equal(softOrder.pose.passes, 1);
  assert.equal(JOBS.topdress.look, '不影响');
  assert.equal(JOBS.topdress.sweep, 'mature');
  assert.equal(JOBS.topdress.passes, 1);
  const stripe = fieldShader({
    look: 'sown',
    growFrac: field.plant.grow / field.plant.need,
    sweep: { width: softOrder.width, pass: softOrder.pose.pass, alongFrac: softOrder.pose.alongFrac, look: 'mature' },
  });
  assert.equal(stripe.next, lookG('mature'));
  assert.ok(Math.abs(stripe.g - lookG('sown', field.plant.grow / field.plant.need)) < 1e-6);
  assert.notEqual(Math.round(stripe.next), Math.round(stripe.g));
  assert.ok(stripe.mask > 20);
  const live = describeField(farm, 'a').jobs.find(job => job.id === 'topdress');
  assert.equal(live.status, '执行中');
  assert.ok(live.pct > 0 && live.pct < 100, live.pct);
  until(farm, () => field.plant.soft.topdress.status === '执行完');
  assert.equal(field.plant.soft.topdress.progress, 1);
  assert.equal(field.plant.stageId, 'mature');
  const done = farm.events.find(ev => ev.type === 'job-complete' && ev.jobId === 'topdress');
  assert.equal(done.look, '不影响');
  assert.equal('stageId' in done, false);
  assert.equal('next' in done, false);
  until(farm, () => field.plant.soft.hill.status === '过期');
  assert.ok(field.plant.soft.hill.progress > 0 && field.plant.soft.hill.progress < 1);
  assert.equal(field.lock, null);
  assert.equal(field.look, 'sown');
  assert.equal(field.plant.stageId, 'mature');
  const hung = describeField(farm, 'a');
  assert.equal(hung.suspend.title, '工单挂起提示');
  const hill = hung.jobs.find(job => job.id === 'hill');
  assert.equal(hill.status, '过期');
  assert.ok(hill.pct > 0 && hill.pct < 100, hill.pct);
  const missed = farm.events.find(ev => ev.type === 'job-missed' && ev.jobId === 'hill');
  assert.equal('stageId' in missed, false);
  assert.equal('next' in missed, false);
  assert.ok(missed.progress > 0 && missed.progress < 1);
  until(farm, () => field.look === 'mature');
  assert.equal(field.plant.stageId, 'harvest');
  assert.equal(fieldWork(farm, 'a')?.jobId, 'harvest');
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

test('拉斯提卡阶段和版本戳来自同一份定义', () => {
  assert.equal(HUD_VERSION, '环穗 v4');
  const doc = parseFieldStageDoc(structuredClone(lastikaRaw));
  const windows = jobWindows(doc, alignFieldCalendar(doc)).filter(item => item.op.kind === 'optional');
  assert.deepEqual(windows.map(item => item.op.id), ['topdress', 'hill']);
  const crop = installShippedLastika();
  assert.equal(crop.name, '拉斯提卡');
  assert.deepEqual(crop.stages.map(s => s.name), ['播种', '成熟', '收割', '收拾']);
  assert.deepEqual(crop.stages.map(s => s.kind), ['hard', 'time', 'hard', 'hard']);
  const mature = crop.stages.find(stage => stage.id === 'mature');
  assert.deepEqual(mature.soft, [
    { job: 'topdress', name: '追肥', from: 4, to: 30 },
    { job: 'hill', name: '培土', from: 20, to: 26 },
  ]);
  assert.equal(crop.growSeconds, 36);
  assert.equal(crop.visual.row, 0.75);
  assert.equal(crop.visual.height, 0.7);
  assert.equal(crop.visual.along, 0.36);
  assert.equal(crop.visual.tex, 'ridges');
});
