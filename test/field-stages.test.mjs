import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import {
  FIELD_STAGE_SCHEMA, placeholderFieldDoc, parseFieldStageDoc, createSim, stepSim,
  startJob, cancelWorkOrder, sampleRidge, setGrowthChain, insertGrowthStage,
  removeGrowthStage, tally, appearanceOf,
} from '../src/field-stages.js';
import { span, SURFACE_CROPS } from '../src/surface-crops.js';

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
  assert.ok(d.edges.some(e => e.when === 'natural' && e.from === 'A' && e.to === 'C'));
  assert.ok(!d.edges.some(e => e.when === 'natural' && e.to === 'B'));
  insertGrowthStage(d, 'A');
  assert.equal(d.chain[1], 'X1');
  assert.ok(d.stages.some(s => s.id === 'X1'));
  removeGrowthStage(d, 'X1');
  assert.ok(!d.chain.includes('X1'));
  removeGrowthStage(d, 'A');
  assert.ok(d.chain.includes('A'));
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

test('potato B maps the surface calendar into the field-stage graph', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../data/field-stages/potato-b.json', import.meta.url)));
  const d = parseFieldStageDoc(raw);
  assert.equal(d.profile, 'potato-b');
  assert.equal(d.logicId, 'crop_potato');
  assert.equal(d.cropId, 'potato');
  assert.deepEqual(d.chain, ['A', 'emerg', 'hill', 'bulk', 'haulm', 'D']);
  const days = Object.fromEntries(d.stages.map(s => [s.legacyId || s.id, s.days]));
  const windows = [
    ['potato_till', 3, 5], ['potato_plant', 2, 4], ['potato_emerg', 12, 18], ['potato_hill', 10, 14],
    ['potato_bulk', 35, 45], ['potato_haulm', 5, 8], ['potato_harvest', 8, 14], ['potato_clear', 2, 4],
  ];
  for (const [id, lo, hi] of windows) {
    const old = SURFACE_CROPS.potato.stages.find(s => s.id === id);
    assert.equal(old.days, span(lo, hi));
    assert.equal(days[id], old.days);
  }
  assert.equal(d.stages.find(s => s.id === 'O').days, 4);
  assert.equal(d.stages.find(s => s.id === 'D').days, 11);
  assert.equal(d.stages.find(s => s.id === 'E').days, 3);
  const beforeD = ['A', 'emerg', 'hill', 'bulk', 'haulm'].reduce((sum, id) => sum + d.stages.find(s => s.id === id).days, 0);
  assert.equal(beforeD, 77);
  assert.equal(beforeD, SURFACE_CROPS.potato.maturity - 4);
  const ids = d.ops.map(op => op.extensions.legacyJob).filter(Boolean);
  for (const job of SURFACE_CROPS.potato.jobs) assert.ok(ids.includes(job.id), job.id);
  const harvest = d.ops.find(op => op.id === 'potato_harvest');
  assert.match(harvest.extensions.note, /收获机侧/);
  assert.match(harvest.extensions.note, /侧卸/);
  assert.equal(harvest.extensions.harvest, true);
  assert.equal(harvest.extensions.self, 'harvester_potato');
  assert.ok(!d.stages.some(s => /侧卸|unload/i.test(s.id + s.name)));
  const scout = d.ops.find(op => op.id === 'potato_scout');
  const treat = d.ops.find(op => op.id === 'potato_treat');
  const water = d.ops.find(op => op.id === 'potato_irrigate');
  assert.equal(scout.extensions.drone, true);
  assert.equal(scout.extensions.required, false);
  assert.equal(scout.extensions.cap, 'scout');
  assert.equal(treat.extensions.drone, true);
  assert.equal(treat.extensions.load, 'pest');
  assert.equal(water.extensions.auto, true);
  assert.equal(d.ops.find(op => op.id === 'potato_plant').extensions.plant, true);
  assert.equal(d.ops.find(op => op.id === 'potato_clear').extensions.afterHarvest, true);
  assert.equal(d.ops.find(op => op.id === 'potato_rotavate').extensions.implAny.length, 2);
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
