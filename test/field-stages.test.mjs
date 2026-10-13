import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import {
  FIELD_STAGE_SCHEMA, placeholderFieldDoc, parseFieldStageDoc, createSim, stepSim,
  startJob, cancelWorkOrder, sampleRidge, ridgeCrestT, setGrowthChain, insertGrowthStage,
  removeGrowthStage, tally, appearanceOf, alignFieldCalendar, jobWindows,
} from '../src/field-stages.js';
import { compilePlayable, SURFACE_CROPS } from '../src/surface-crops.js';

const potato = {
  id: 'potato', name: '中熟商品薯', shape: 'bush',
  height: 0.55, row: 0.9, along: 0.4,
  young: '#51542c', ripe: '#81683f', stub: '#9e543a',
};

function doc() {
  const d = placeholderFieldDoc(potato);
  d.transition = { template: 'instant', span: 'window', windowDays: 0.5 };
  return d;
}

function finish(sim, d, opId, coverage = 1) {
  const started = startJob(sim, d, opId, coverage);
  assert.equal(started.ok, true, started.reason || opId);
  stepSim(sim, d, started.op.sweepDays + 0.05);
  assert.equal(sim.job, null);
  return started;
}

test('potato placeholder has the field chain, both harvest exits, and sweep points', () => {
  const d = placeholderFieldDoc(potato);
  assert.equal(d.schema, FIELD_STAGE_SCHEMA);
  assert.deepEqual(d.stages.map(s => s.id), ['O', 'A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(d.chain, ['A', 'B', 'C', 'D']);
  const eo = d.edges.find(e => e.from === 'E' && e.to === 'O' && e.via === 'clear');
  const ea = d.edges.find(e => e.from === 'E' && e.to === 'A' && e.via === 'resow');
  assert.equal(eo.enabled, true);
  assert.equal(ea.enabled, false);
  assert.ok(d.machines.impl_potato_planter.sweepHead > 0);
  assert.ok(d.machines.impl_potato_planter.sweepTail < 0);
  assert.equal(d.hooks.cancelWorkOrder, 'cancelWorkOrder');
  assert.equal(d.plant.shape, 'bush');
});

test('a new crop gets its own placeholder chain', () => {
  const d = placeholderFieldDoc({ id: 'custom1', name: '新作物', shape: 'ear', young: '#787c32', ripe: '#b59a63', stub: '#81683f' });
  assert.equal(d.logicId, 'crop_custom1');
  assert.equal(d.cropName, '新作物');
  assert.equal(d.name, '新作物');
  const renamed = parseFieldStageDoc({ cropId: 'custom1', name: '青贮玉米', stages: d.stages, edges: d.edges });
  assert.equal(renamed.cropName, '青贮玉米');
  assert.equal(renamed.name, '青贮玉米');
  assert.ok(d.stages.length >= 6);
  assert.equal(d.plant.shape, 'ear');
  assert.ok(d.edges.some(e => e.from === 'E' && e.to === 'A' && e.enabled === false));
});

test('parse keeps the reserved exit and rejects a document without edges', () => {
  assert.throws(() => parseFieldStageDoc({ stages: [{ id: 'O' }] }), /edges/);
  const d = parseFieldStageDoc({
    cropId: 'potato',
    stages: placeholderFieldDoc(potato).stages,
    edges: [{ from: 'E', fromVariant: '', to: 'O', toVariant: '', via: 'clear', when: 'process', enabled: true }],
    chain: ['A', 'D'],
  });
  assert.equal(d.schema, FIELD_STAGE_SCHEMA);
  assert.ok(d.edges.some(e => e.via === 'resow' && e.to === 'A' && e.enabled === false));
  assert.deepEqual(d.chain, ['A', 'D']);
  assert.ok(d.edges.some(e => e.when === 'natural' && e.from === 'A' && e.to === 'D'));
});

test('ridge crest phase is the highest sample', () => {
  assert.equal(ridgeCrestT([0.04, 0.06, 0.1, 0.2, 0.28, 0.1, 0.06, 0.04]), 4 / 7);
  assert.equal(ridgeCrestT([]), 0.5);
});

test('ridge samples stay on the control points', () => {
  const pts = [{ x: 0, y: 0.1 }, { x: 0.5, y: 0.4 }, { x: 1, y: 0.1 }];
  assert.equal(sampleRidge(pts, 0), 0.1);
  assert.equal(sampleRidge(pts, 1), 0.1);
  assert.ok(Math.abs(sampleRidge(pts, 0.5) - 0.4) < 1e-6);
  assert.ok(sampleRidge(pts, 0.25) > 0.1 && sampleRidge(pts, 0.25) < 0.4);
});

test('sowing writes a mask and locks the unswept half', () => {
  const d = doc();
  const sim = createSim(d);
  finish(sim, d, 'sow', 0.5);
  const info = tally(sim);
  assert.equal(info.mask, Math.round(info.total / 2));
  assert.equal(info.locked, info.total - info.mask);
  assert.equal(info.phases.A, info.mask);
  assert.equal(info.phases.O, info.total - info.mask);
  const again = startJob(sim, d, 'sow', 1);
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'empty');
});

test('masked cells grow on the clock and the outside stays out', () => {
  const d = doc();
  for (const s of d.stages) {
    if (s.id === 'A') s.days = 1;
    if (s.id === 'B') s.days = 30;
  }
  const sim = createSim(d);
  const sow = startJob(sim, d, 'sow', 0.5);
  stepSim(sim, d, sow.op.sweepDays + 1 + 0.2);
  const info = tally(sim);
  assert.equal(info.phases.B, info.mask);
  assert.equal(info.phases.O, info.total - info.mask);
  assert.ok(!info.phases.A);
});

test('optional work overwrites the variant and still advances', () => {
  const d = doc();
  d.stages.find(s => s.id === 'A').days = 8;
  d.stages.find(s => s.id === 'B').days = 20;
  const sim = createSim(d);
  finish(sim, d, 'sow', 1);
  finish(sim, d, 'water', 1);
  assert.equal(tally(sim).variants['A/A1'], sim.cells.length);
  finish(sim, d, 'fertilize', 1);
  assert.equal(tally(sim).variants['A/A2'], sim.cells.length);
  assert.ok(!tally(sim).variants['A/A1']);
  stepSim(sim, d, 6);
  assert.equal(tally(sim).phases.B, sim.cells.length);
});

test('idle ground becomes O3 and an unswept half does too', () => {
  const d = doc();
  const sim = createSim(d);
  stepSim(sim, d, d.stages.find(s => s.id === 'O').days + 0.3);
  assert.equal(tally(sim).variants['O/O3'], sim.cells.length);
  const look = appearanceOf(d, 'O', 'O3');
  assert.equal(look.name, '久置闲置');
  assert.ok(look.plantScale === 0);
});

test('D left standing becomes D1 then D2', () => {
  const d = doc();
  for (const s of d.stages) s.days = 0.25;
  const d1 = d.stages.find(s => s.id === 'D').variants.find(v => v.id === 'D1');
  d1.days = 0.25;
  const sim = createSim(d);
  for (const cell of sim.cells) {
    cell.phase = 'D';
    cell.mask = true;
    cell.age = 0;
    cell.variantAge = 0;
  }
  stepSim(sim, d, 0.4);
  assert.equal(tally(sim).variants['D/D1'], sim.cells.length);
  stepSim(sim, d, 0.4);
  assert.equal(tally(sim).variants['D/D2'], sim.cells.length);
});

test('harvest then clear follows the E→O edge and can be switched to E→A', () => {
  const d = doc();
  const sim = createSim(d);
  for (const cell of sim.cells) {
    cell.phase = 'D';
    cell.variant = 'D1';
    cell.mask = true;
  }
  finish(sim, d, 'harvest', 1);
  assert.equal(tally(sim).phases.E, sim.cells.length);
  assert.equal(tally(sim).mask, sim.cells.length);
  finish(sim, d, 'clear', 1);
  assert.equal(tally(sim).phases.O, sim.cells.length);
  assert.equal(tally(sim).mask, 0);

  const sim2 = createSim(d);
  for (const cell of sim2.cells) cell.phase = 'E';
  d.edges.find(e => e.via === 'clear').enabled = false;
  const stuck = startJob(sim2, d, 'clear', 1);
  assert.equal(stuck.ok, true);
  stepSim(sim2, d, 3);
  assert.equal(tally(sim2).phases.E, sim2.cells.length);

  d.edges.find(e => e.via === 'resow').enabled = true;
  finish(sim2, d, 'resow', 1);
  assert.equal(tally(sim2).phases.A, sim2.cells.length);
  assert.equal(tally(sim2).mask, sim2.cells.length);
});

test('till breaks the mask and cancel locks the rest of a sow', () => {
  const d = doc();
  const sim = createSim(d);
  finish(sim, d, 'sow', 1);
  finish(sim, d, 'till', 1);
  const after = tally(sim);
  assert.equal(after.mask, 0);
  assert.equal(after.locked, 0);
  assert.equal(after.variants['O/O1'], sim.cells.length);

  const sim2 = createSim(d);
  const started = startJob(sim2, d, 'sow', 1);
  stepSim(sim2, d, started.op.sweepDays * 0.35);
  assert.ok(sim2.job);
  assert.ok(tally(sim2).mask > 0);
  assert.ok(tally(sim2).mask < sim2.cells.length);
  const cancelled = cancelWorkOrder(sim2, d);
  assert.equal(cancelled.hook, 'cancelWorkOrder');
  assert.equal(sim2.job, null);
  const info = tally(sim2);
  assert.ok(info.mask > 0);
  assert.equal(info.locked, info.total - info.mask);
  assert.equal(startJob(sim2, d, 'sow', 1).reason, 'empty');
});

test('growth chain can drop B and accept an inserted stage', () => {
  const d = doc();
  setGrowthChain(d, ['C']);
  assert.deepEqual(d.chain, ['A', 'C', 'D']);
  assert.equal(d.cycle, 39);
  assert.equal(alignFieldCalendar(d).cycle, 39);
  assert.ok(d.edges.some(e => e.when === 'natural' && e.from === 'A' && e.to === 'C'));
  assert.ok(!d.edges.some(e => e.when === 'natural' && e.to === 'B'));
  assert.equal(jobWindows(d, alignFieldCalendar(d)).some(w => w.op.stage === 'B'), false);
  insertGrowthStage(d, 'A');
  assert.equal(d.chain[1], 'X1');
  assert.equal(d.cycle, 45);
  assert.ok(d.stages.some(s => s.id === 'X1'));
  removeGrowthStage(d, 'X1');
  assert.ok(!d.chain.includes('X1'));
  assert.equal(d.cycle, 39);
  removeGrowthStage(d, 'A');
  assert.ok(d.chain.includes('A'));
});

test('a cycle that does not match the stage sum is refused', () => {
  const d = doc();
  d.cycle = 40;
  assert.throws(() => alignFieldCalendar(d), /总周期和阶段加总对不上/);
  d.cycle = 51;
  assert.equal(alignFieldCalendar(d).cycle, 51);
});

test('an op whose stage was removed is not a window', () => {
  const d = doc();
  d.ops.push({ id: 'ghost', name: '杀秧', stage: 'no-such', machine: 'impl_haulm', kind: 'required' });
  const windows = jobWindows(d, alignFieldCalendar(d));
  assert.equal(windows.some(w => w.op.id === 'ghost'), false);
  assert.equal(windows.some(w => w.op.id === 'sow'), true);
});

test('dropping emerg and haulm keeps a savable potato calendar without those jobs', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../data/field-stages/potato-b.json', import.meta.url)));
  const d = parseFieldStageDoc(raw);
  assert.equal(d.cycle, 88);
  removeGrowthStage(d, 'emerg');
  removeGrowthStage(d, 'haulm');
  assert.equal(d.chain.includes('emerg'), false);
  assert.equal(d.chain.includes('haulm'), false);
  assert.equal(d.ops.some(op => op.stage === 'haulm' || op.stage === 'emerg'), false);
  assert.equal(d.cycle, 66);
  const play = compilePlayable(d, { id: 'potato', name: '中熟商品薯', seed: 'seed', slotted: true });
  assert.equal(play.cycle, 66);
  assert.equal(play.jobs.some(j => j.stage === 'emerg' || j.stage === 'haulm' || j.cap === 'haulm'), false);
  assert.equal(play.jobs.some(j => j.id === 'potato_plant' && j.window.when === 'before'), true);
  assert.equal(play.jobs.some(j => j.id === 'potato_harvest' && j.window.when === 'clock'), true);
});

test('scatter opens some cells before the stage ends and all of them at the end', () => {
  const d = doc();
  d.transition = { template: 'scatter', span: 'window', windowDays: 1 };
  d.stages.find(s => s.id === 'A').days = 2;
  d.stages.find(s => s.id === 'B').days = 12;
  const sim = createSim(d);
  for (const cell of sim.cells) {
    cell.phase = 'A';
    cell.mask = true;
    cell.age = 0;
  }
  stepSim(sim, d, 1.5);
  const mid = tally(sim);
  assert.ok(mid.phases.A > 0 && mid.phases.B > 0);
  stepSim(sim, d, 1);
  const done = tally(sim);
  assert.equal(done.phases.B, sim.cells.length);
  assert.ok(!done.phases.C);
});

test('potato B and the four placeholders compile through stage windows', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../data/field-stages/potato-b.json', import.meta.url)));
  assert.equal(JSON.stringify(raw).includes('legacyJob'), false);
  assert.equal(JSON.stringify(raw).includes('legacyStage'), false);
  const d = parseFieldStageDoc(raw);
  assert.equal(d.profile, 'potato-b');
  assert.equal(d.logicId, 'crop_potato');
  assert.equal(d.cropId, 'potato');
  assert.deepEqual(d.chain, ['A', 'emerg', 'hill', 'bulk', 'haulm', 'D']);
  assert.equal(d.stages.find(s => s.id === 'O').days, 4);
  assert.equal(d.stages.find(s => s.id === 'A').days, 3);
  assert.equal(d.stages.find(s => s.id === 'emerg').days, 15);
  assert.equal(d.stages.find(s => s.id === 'hill').days, 12);
  assert.equal(d.stages.find(s => s.id === 'bulk').days, 40);
  assert.equal(d.stages.find(s => s.id === 'haulm').days, 7);
  assert.equal(d.stages.find(s => s.id === 'D').days, 11);
  assert.equal(d.stages.find(s => s.id === 'E').days, 3);
  const beforeD = ['A', 'emerg', 'hill', 'bulk', 'haulm'].reduce((sum, id) => sum + d.stages.find(s => s.id === id).days, 0);
  assert.equal(beforeD, 77);
  const play = compilePlayable(raw, { id: 'potato', name: '中熟商品薯', seed: 'seed', slotted: true });
  assert.equal(play.profile, 'potato-b');
  assert.equal(play.maturity, beforeD);
  assert.equal(play.cycle, beforeD + 11);
  assert.equal(play.rotAt, 96);
  assert.equal(play.jobs.some(j => j.legacyJob || j.id === 'potato_till'), false);
  const hill = play.jobs.filter(j => j.stage === 'hill' && j.required);
  assert.deepEqual(hill.map(j => j.id), ['potato_hill', 'potato_topdress']);
  assert.equal(hill[0].window.from, hill[1].window.from);
  assert.equal(hill[0].window.to, hill[1].window.to);
  assert.equal(hill[0].window.when, 'clock');
  assert.ok(!play.jobs.some(j => j.id === 'lime' || j.id === 'till' || j.id === 'resow'));
  const harvest = play.jobs.find(j => j.id === 'potato_harvest');
  assert.match(harvest.note, /收获机侧/);
  assert.match(harvest.note, /侧卸/);
  assert.equal(harvest.harvest, true);
  assert.equal(harvest.self, 'harvester_potato');
  assert.equal(harvest.window.when, 'clock');
  assert.equal(harvest.window.to, play.rotAt);
  assert.ok(!d.stages.some(s => /侧卸|unload/i.test(s.id + s.name)));
  const scout = play.jobs.find(j => j.id === 'potato_scout');
  const treat = play.jobs.find(j => j.id === 'potato_treat');
  const water = play.jobs.find(j => j.id === 'potato_irrigate');
  assert.equal(scout.drone, true);
  assert.equal(scout.required, false);
  assert.equal(scout.cap, 'scout');
  assert.equal(treat.drone, true);
  assert.equal(treat.load, 'pest');
  assert.equal(water.auto, true);
  assert.equal(play.jobs.find(j => j.id === 'potato_plant').plant, true);
  assert.equal(play.jobs.find(j => j.id === 'potato_plant').window.when, 'before');
  assert.equal(play.jobs.find(j => j.id === 'potato_clear').window.when, 'after');
  assert.equal(d.ops.find(op => op.id === 'potato_rotavate').extensions.implAny.length, 2);
  assert.equal(SURFACE_CROPS.potato.profile, null);
  assert.equal(SURFACE_CROPS.potato.maturity, 43);
  assert.equal(SURFACE_CROPS.potato.rotAt, 59);
  for (const id of ['potato', 'soy', 'feed_barley', 'cabbage']) {
    assert.equal(SURFACE_CROPS[id].cycle, 51, id);
    assert.equal(SURFACE_CROPS[id].maturity, 43, id);
    assert.equal(SURFACE_CROPS[id].rotAt, 59, id);
    assert.equal(SURFACE_CROPS[id].jobs.some(j => j.id === 'sow' && j.window.when === 'before'), true, id);
    assert.equal(SURFACE_CROPS[id].jobs.some(j => j.id === 'harvest' && j.window.when === 'clock'), true, id);
  }
  assert.equal(d.edges.find(e => e.via === 'clear' && e.from === 'E' && e.to === 'O').enabled, true);
  assert.equal(d.edges.find(e => e.via === 'resow' && e.from === 'E' && e.to === 'A').enabled, false);
  assert.ok(d.edges.some(e => e.when === 'natural' && e.from === 'haulm' && e.to === 'D'));
  assert.ok(d.edges.some(e => e.when === 'auto' && e.toVariant === 'O3'));
  assert.ok(d.edges.some(e => e.when === 'auto' && e.toVariant === 'D2'));
  assert.ok(d.stages.find(s => s.id === 'O').variants.some(v => v.id === 'O1'));
  assert.ok(d.stages.find(s => s.id === 'O').variants.some(v => v.id === 'O2'));
  assert.ok(d.stages.find(s => s.id === 'O').variants.some(v => v.id === 'O3'));

  d.transition = { template: 'instant', span: 'window', windowDays: 0.5 };
  const sim = createSim(d);
  const sow = d.ops.find(op => op.id === 'potato_plant');
  sow.sweepDays = 0.2;
  finish(sim, d, 'potato_plant');
  assert.equal(tally(sim).phases.A, sim.cells.length);
  stepSim(sim, d, d.stages.find(s => s.id === 'A').days);
  assert.equal(tally(sim).phases.emerg, sim.cells.length);
  stepSim(sim, d, d.stages.find(s => s.id === 'emerg').days);
  assert.equal(tally(sim).phases.hill, sim.cells.length);
  assert.equal(sim.cells.every(c => !c.variant), true);
});
