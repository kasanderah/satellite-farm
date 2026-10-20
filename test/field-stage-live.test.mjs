import test from 'node:test';
import assert from 'node:assert/strict';
import lastika from '../data/field-stages/lastika.json' with { type: 'json' };
import { cropDef } from '../src/surface-crops.js';
import { PLANT_CROPS } from '../src/framework-b.js';
import { installShippedLastika } from '../src/lastika-stage.js';
import {
  applyStagePayload, lastikaDocFromPayload, bootFieldStageSource,
  writeStageStore, suspendLastikaStage, resumeLastikaStage, stageBadge, FIELD_STAGE_STORE, readStageStore,
} from '../src/field-stage-live.js';

function edited() {
  const doc = structuredClone(lastika);
  const mature = doc.stages.find(s => s.group === 'B');
  mature.name = '熟透';
  const topdress = doc.ops.find(op => op.id === 'topdress');
  topdress.window = { from: 6, to: 12 };
  doc.cropName = '拉斯提卡工坊';
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

test('editor lastika replaces the playable stages, windows, and paints', () => {
  const potatoProfile = cropDef('potato').profile;
  const doc = edited();
  const applied = applyStagePayload({ schema: 'ringsheaf.field-stage/1', cropId: 'lastika', crops: { lastika: doc, potato: { cropId: 'potato', profile: 'potato-b', stages: [] } } });
  try {
    assert.equal(applied.ok, true, applied.message);
    assert.equal(stageBadge(), '工坊覆写');
    const crop = PLANT_CROPS.lastika;
    assert.equal(crop.name, '拉斯提卡工坊');
    assert.equal(crop.growSeconds, 36);
    assert.equal(crop.stages.find(s => s.id === 'mature').name, '熟透');
    assert.deepEqual(crop.stages.find(s => s.id === 'mature').soft, [
      { job: 'topdress', name: '追肥', from: 6, to: 12 },
      { job: 'hill', name: '培土', from: 20, to: 26 },
    ]);
    assert.equal(crop.paints.ripe, doc.plant.ripe);
    assert.equal(crop.paints.raw, doc.stages.find(s => s.group === 'O').color);
    assert.equal(cropDef('potato').profile, potatoProfile);
    assert.notEqual(cropDef('potato').profile, 'potato-b');
  } finally {
    installShippedLastika();
  }
  assert.equal(stageBadge(), '仓库默认');
  assert.equal(PLANT_CROPS.lastika.stages.find(s => s.id === 'mature').name, '成熟');
  assert.equal(PLANT_CROPS.lastika.growSeconds, 36);
});

test('a potato gantt payload is not the playable stage source', () => {
  const before = PLANT_CROPS.lastika.stages.find(s => s.id === 'mature').name;
  const applied = applyStagePayload({
    schema: 'ringsheaf.field-stage/1',
    cropId: 'potato',
    profile: 'potato-b',
    crops: { potato: { cropId: 'potato', profile: 'potato-b', stages: [{ id: 'A', name: '出苗' }] } },
  });
  assert.equal(applied.ok, false);
  assert.match(applied.message, /商品薯/);
  assert.equal(PLANT_CROPS.lastika.stages.find(s => s.id === 'mature').name, before);
  assert.equal(applied.doc, undefined);
  assert.equal(lastikaDocFromPayload({ cropId: 'potato', profile: 'potato-b', stages: [{ id: 'A' }] }), null);
});

test('boot reads crops.lastika and repo ignores the workshop slot', () => {
  const store = memoryStore();
  writeStageStore(store, edited());
  const saved = readStageStore(store);
  assert.equal(saved.cropId, 'lastika');
  assert.equal(saved.schema, 'ringsheaf.field-stage/1');
  assert.equal(FIELD_STAGE_STORE, 'ringsheaf.assetlab.fieldStages.v1');
  try {
    const booted = bootFieldStageSource(store, null);
    assert.equal(booted.ok, true);
    assert.equal(booted.origin, 'workshop');
    assert.equal(PLANT_CROPS.lastika.stages.find(s => s.id === 'mature').name, '熟透');
    assert.equal(PLANT_CROPS.lastika.stages.find(s => s.id === 'mature').soft[0].from, 6);
    const skipped = bootFieldStageSource(store, 'repo');
    assert.equal(skipped.origin, 'repo');
    assert.equal(skipped.skipped, true);
    assert.equal(PLANT_CROPS.lastika.stages.find(s => s.id === 'mature').name, '成熟');
    assert.equal(PLANT_CROPS.lastika.growSeconds, 36);
    const again = bootFieldStageSource(store, null);
    assert.equal(again.origin, 'workshop');
    assert.equal(PLANT_CROPS.lastika.name, '拉斯提卡工坊');
  } finally {
    installShippedLastika();
  }
});

test('repo default keeps the workshop doc for a later reread', () => {
  const store = memoryStore();
  writeStageStore(store, edited());
  try {
    const held = suspendLastikaStage(store);
    assert.equal(held.kept, true);
    const skipped = bootFieldStageSource(store, null);
    assert.equal(skipped.suspended, true);
    assert.equal(PLANT_CROPS.lastika.origin, 'repo');
    resumeLastikaStage(store);
    const booted = bootFieldStageSource(store, null);
    assert.equal(booted.origin, 'workshop');
    assert.equal(stageBadge(), '工坊覆写');
    assert.equal(PLANT_CROPS.lastika.stages.find(s => s.id === 'mature').name, '熟透');
  } finally {
    installShippedLastika();
  }
});

test('an empty browser boots the shipped lastika document', () => {
  const store = memoryStore();
  try {
    const booted = bootFieldStageSource(store, null);
    assert.equal(booted.origin, 'repo');
    assert.equal(booted.skipped, true);
    assert.equal(PLANT_CROPS.lastika.name, '拉斯提卡');
    assert.equal(PLANT_CROPS.lastika.paints.young, '#51542c');
    assert.equal(PLANT_CROPS.lastika.paints.ripe, '#787c32');
    assert.notEqual(cropDef('potato').profile, 'potato-b');
  } finally {
    installShippedLastika();
  }
});
