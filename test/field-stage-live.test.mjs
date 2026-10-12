import test from 'node:test';
import assert from 'node:assert/strict';
import potatoB from '../data/field-stages/potato-b.json' with { type: 'json' };
import { cropDef, SURFACE_CROPS } from '../src/surface-crops.js';
import { CROPS, bindPotatoClock } from '../src/_shared.js';
import {
  applyStagePayload, revertPotatoStages, potatoDocFromPayload, bootFieldStageSource,
  writeStageStore, forgetPotatoStage, stageBadge, FIELD_STAGE_STORE,
} from '../src/field-stage-live.js';

function edited() {
  const doc = structuredClone(potatoB);
  const emerg = doc.stages.find(s => s.id === 'emerg');
  emerg.name = '出苗工坊';
  emerg.days = 20;
  const d2 = doc.stages.find(s => s.id === 'D').variants.find(v => v.id === 'D2');
  d2.days = 8;
  return doc;
}

function memoryStore(seed) {
  const bag = new Map(seed || []);
  return {
    getItem(k) { return bag.has(k) ? bag.get(k) : null; },
    setItem(k, v) { bag.set(k, String(v)); },
    removeItem(k) { bag.delete(k); },
  };
}

test('a workshop potato doc renames the stage and moves the rot day', () => {
  const soyJobs = SURFACE_CROPS.soy.jobs;
  const soyMaturity = SURFACE_CROPS.soy.maturity;
  const doc = edited();
  const applied = applyStagePayload({ schema: 'ringsheaf.field-stage/1', cropId: 'potato', crops: { potato: doc, soy: { cropId: 'soy' } } });
  try {
    assert.equal(applied.ok, true);
    bindPotatoClock();
    const def = cropDef('potato');
    assert.equal(def.stageOrigin, 'workshop');
    assert.equal(stageBadge(), '工坊覆写');
    assert.equal(def.stages.find(s => s.id === 'potato_emerg').name, '出苗工坊');
    assert.equal(def.stages.find(s => s.id === 'potato_emerg').days, 20);
    assert.equal(def.maturity, 77 + 5);
    assert.equal(def.rotAt, 96 + 5 + 4);
    const crop = CROPS.find(c => c.id === 'potato');
    assert.equal(crop.days, def.maturity);
    assert.equal(crop.stages.find(s => s.id === 'potato_emerg').name, '出苗工坊');
    assert.equal(SURFACE_CROPS.soy.jobs, soyJobs);
    assert.equal(SURFACE_CROPS.soy.maturity, soyMaturity);
    assert.match(crop.yieldNote, /工坊覆写/);
  } finally {
    revertPotatoStages();
    bindPotatoClock();
  }
  assert.equal(cropDef('potato').maturity, 77);
  assert.equal(cropDef('potato').rotAt, 96);
  assert.equal(stageBadge(), '仓库默认');
  assert.equal(CROPS.find(c => c.id === 'potato').stages.find(s => s.id === 'potato_emerg').name, '出苗');
});

test('a downloaded field-stage file and a crop_potato logic id both count as potato', () => {
  const doc = edited();
  assert.equal(potatoDocFromPayload(doc).cropId, 'potato');
  const bare = structuredClone(doc);
  delete bare.cropId;
  bare.logicId = 'crop_potato';
  assert.equal(potatoDocFromPayload(bare).logicId, 'crop_potato');
  assert.equal(potatoDocFromPayload({ crops: { soy: { cropId: 'soy', stages: [], edges: [] } } }), null);
  const applied = applyStagePayload(doc);
  try {
    assert.equal(applied.ok, true);
    assert.equal(cropDef('potato').stageOrigin, 'workshop');
  } finally {
    revertPotatoStages();
    bindPotatoClock();
  }
});

test('boot reads the workshop store and repo skips it', () => {
  const store = memoryStore();
  writeStageStore(store, edited());
  assert.equal(store.getItem(FIELD_STAGE_STORE) != null, true);
  const skipped = bootFieldStageSource(store, 'repo');
  assert.equal(skipped.skipped, true);
  assert.equal(cropDef('potato').stageOrigin, 'repo');
  const booted = bootFieldStageSource(store, null);
  try {
    assert.equal(booted.ok, true);
    assert.equal(booted.origin, 'workshop');
    bindPotatoClock();
    assert.equal(cropDef('potato').stages.find(s => s.id === 'potato_emerg').name, '出苗工坊');
  } finally {
    revertPotatoStages();
    bindPotatoClock();
  }
  forgetPotatoStage(store);
  assert.equal(store.getItem(FIELD_STAGE_STORE), null);
  const empty = bootFieldStageSource(store, null);
  assert.equal(empty.skipped, true);
});

test('a broken workshop doc leaves the shipped potato in place', () => {
  const before = cropDef('potato').maturity;
  const applied = applyStagePayload({ crops: { potato: { cropId: 'potato', stages: [{ id: 'O' }] } } });
  assert.equal(applied.ok, false);
  assert.equal(cropDef('potato').maturity, before);
  assert.equal(cropDef('potato').stageOrigin, 'repo');
});
