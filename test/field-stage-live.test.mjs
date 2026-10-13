import test from 'node:test';
import assert from 'node:assert/strict';
import potatoB from '../data/field-stages/potato-b.json' with { type: 'json' };
import { cropDef, SURFACE_CROPS, potatoDrawLooks, resetSurfaceCrop, auditDispatch } from '../src/surface-crops.js';
import { CROPS, bindPotatoClock, bindSurfaceClock } from '../src/_shared.js';
import { placeholderFieldDoc } from '../src/field-stages.js';
import {
  applyStagePayload, revertPotatoStages, potatoDocFromPayload, bootFieldStageSource,
  writeStageStore, forgetPotatoStage, stageBadge, FIELD_STAGE_STORE, readStageStore,
} from '../src/field-stage-live.js';

function edited() {
  const doc = structuredClone(potatoB);
  const emerg = doc.stages.find(s => s.id === 'emerg');
  emerg.name = '出苗工坊';
  emerg.days = 20;
  doc.cycle = (Number(doc.cycle) || 88) + 5;
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
    assert.equal(def.stages.find(s => s.id === 'emerg').name, '出苗工坊');
    assert.equal(def.stages.find(s => s.id === 'emerg').days, 20);
    assert.equal(def.maturity, 82);
    assert.equal(def.rotAt, 105);
    const crop = CROPS.find(c => c.id === 'potato');
    assert.equal(crop.days, def.maturity);
    assert.equal(crop.stages.find(s => s.id === 'emerg').name, '出苗工坊');
    assert.equal(SURFACE_CROPS.soy.jobs, soyJobs);
    assert.equal(SURFACE_CROPS.soy.maturity, soyMaturity);
    assert.match(crop.yieldNote, /工坊覆写/);
  } finally {
    revertPotatoStages();
    bindPotatoClock();
  }
  assert.equal(cropDef('potato').maturity, 43);
  assert.equal(cropDef('potato').rotAt, 59);
  assert.equal(stageBadge(), '仓库默认');
  assert.equal(CROPS.find(c => c.id === 'potato').stages.find(s => s.id === 'B').name, '小植株');
  assert.equal(CROPS.find(c => c.id === 'potato').stages.some(s => s.id === 'potato_emerg'), false);
});

test('a workshop name and stage look reach the dock label and the field paint table', () => {
  const doc = edited();
  doc.cropName = '阿巴阿巴';
  doc.name = '阿巴阿巴';
  doc.rows = 16;
  const sown = doc.stages.find(s => s.id === 'A');
  sown.canopy = '#7a3ea8';
  sown.color = '#3a3538';
  sown.roughness = 0.41;
  sown.cover = 0.8;
  sown.plantScale = 0.9;
  sown.ridge = [{ x: 0, y: 0.02 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.02 }];
  const applied = applyStagePayload({ schema: 'ringsheaf.field-stage/1', cropId: 'potato', crops: { potato: doc } });
  try {
    assert.equal(applied.ok, true);
    bindPotatoClock();
    const crop = CROPS.find(c => c.id === 'potato');
    assert.equal(crop.name, '阿巴阿巴');
    assert.equal(cropDef('potato').planLabel, '种阿巴阿巴');
    assert.equal(cropDef('potato').displayName, '阿巴阿巴');
    assert.ok(crop.row < 0.5);
    const draw = potatoDrawLooks();
    assert.equal(draw.workshop, true);
    assert.equal(draw.displayName, '阿巴阿巴');
    assert.ok(draw.row < 0.5);
    const look = draw.slots[2];
    assert.equal(look.canopy, '#7a3ea8');
    assert.equal(look.color, '#3a3538');
    assert.equal(look.roughness, 0.41);
    assert.equal(look.cover, 0.8);
    assert.equal(look.plantScale, 0.9);
    assert.ok(look.ridge[4] > look.ridge[0]);
  } finally {
    revertPotatoStages();
    bindPotatoClock();
  }
  assert.equal(CROPS.find(c => c.id === 'potato').name, '中熟商品薯');
  assert.equal(cropDef('potato').planLabel, '种中熟商品薯');
  assert.ok(Math.abs(CROPS.find(c => c.id === 'potato').row - 0.9) < 0.05);
  assert.equal(potatoDrawLooks().workshop, false);
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
    assert.equal(cropDef('potato').stages.find(s => s.id === 'emerg').name, '出苗工坊');
  } finally {
    revertPotatoStages();
    bindPotatoClock();
  }
  forgetPotatoStage(store);
  assert.equal(store.getItem(FIELD_STAGE_STORE), null);
  const empty = bootFieldStageSource(store, null);
  assert.equal(empty.skipped, true);
});

test('a potato key still applies when cropId was overwritten with the display name', () => {
  const doc = edited();
  doc.cropName = '阿巴阿巴';
  doc.name = '阿巴阿巴';
  doc.cropId = '阿巴阿巴';
  delete doc.logicId;
  doc.profile = 'potato-b';
  const applied = applyStagePayload({ schema: 'ringsheaf.field-stage/1', cropId: 'potato', crops: { potato: doc } });
  try {
    assert.equal(applied.ok, true, applied.message);
    bindPotatoClock();
    assert.equal(CROPS.find(c => c.id === 'potato').name, '阿巴阿巴');
    assert.equal(stageBadge(), '工坊覆写');
  } finally {
    revertPotatoStages();
    bindPotatoClock();
  }
});

test('a store without a potato doc names what it found', () => {
  const applied = applyStagePayload({ crops: { soy: { cropId: 'soy', stages: [], edges: [] } } });
  assert.equal(applied.ok, false);
  assert.match(applied.message, /没有土豆/);
  assert.match(applied.message, /soy/);
});

test('a potato op pointing at a missing stage is left out of the clock', () => {
  const doc = structuredClone(potatoB);
  const op = doc.ops.find(o => o.id === 'potato_shallow');
  op.stage = 'no-such';
  const applied = applyStagePayload(doc);
  try {
    assert.equal(applied.ok, true, applied.message);
    assert.equal(cropDef('potato').stageOrigin, 'workshop');
    assert.equal(cropDef('potato').jobs.some(j => j.id === 'potato_shallow'), false);
    assert.equal(cropDef('potato').jobs.some(j => j.id === 'potato_haulm'), true);
  } finally {
    revertPotatoStages();
    bindPotatoClock();
  }
});

test('deleting emerg and haulm stops the topper without keeping the old clock', () => {
  const doc = structuredClone(potatoB);
  const emerg = doc.stages.find(s => s.id === 'emerg');
  const haulm = doc.stages.find(s => s.id === 'haulm');
  doc.cycle = doc.cycle - emerg.days - haulm.days;
  doc.stages = doc.stages.filter(s => s.id !== 'emerg' && s.id !== 'haulm');
  doc.chain = doc.chain.filter(id => id !== 'emerg' && id !== 'haulm');
  const applied = applyStagePayload(doc);
  try {
    assert.equal(applied.ok, true, applied.message);
    bindPotatoClock();
    const jobs = cropDef('potato').jobs;
    assert.equal(jobs.some(j => j.stage === 'emerg' || j.stage === 'haulm' || j.cap === 'haulm'), false);
    for (let day = 0; day <= cropDef('potato').rotAt; day++) {
      const rows = auditDispatch('potato', day, { planted: true });
      assert.equal(rows.some(row => row.cap === 'haulm' || row.kinds.includes('topper')), false, 'day ' + day);
    }
  } finally {
    revertPotatoStages();
    bindPotatoClock();
  }
});

test('soy barley and cabbage can be replaced from the same store', () => {
  const soy = placeholderFieldDoc({ id: 'soy', name: '大豆' });
  soy.stages.find(s => s.id === 'B').name = '大豆苗';
  soy.stages.find(s => s.id === 'B').days = 20;
  soy.cycle = 59;
  const barley = placeholderFieldDoc({ id: 'feed_barley', name: '饲料大麦' });
  barley.cycle = 10;
  const applied = applyStagePayload({ crops: { soy, feed_barley: barley } });
  try {
    assert.equal(applied.ok, false);
    assert.match(applied.message, /没有土豆/);
    assert.match(applied.siblingNotes.join(''), /总周期/);
    assert.equal(cropDef('soy').stageOrigin, 'workshop');
    assert.equal(cropDef('soy').cycle, 59);
    assert.equal(cropDef('soy').stages.find(s => s.id === 'B').name, '大豆苗');
    assert.equal(cropDef('feed_barley').cycle, 51);
    assert.equal(cropDef('feed_barley').stageOrigin, 'repo');
    bindSurfaceClock('soy');
    assert.equal(CROPS.find(c => c.id === 'soy').name, '大豆');
    assert.equal(CROPS.find(c => c.id === 'soy').stages.find(s => s.id === 'B').name, '大豆苗');
    for (const id of ['soy', 'cabbage']) {
      const sow = auditDispatch(id, 0, { planted: false });
      assert.equal(sow.some(row => row.id === 'sow'), true, id);
      const harvest = auditDispatch(id, cropDef(id).maturity, { planted: true });
      assert.equal(harvest.some(row => row.id === 'harvest'), true, id);
    }
    assert.ok(auditDispatch('cabbage', 0, { planted: false }).some(row => row.id === 'sow' && row.kinds.includes('transplanter')));
    assert.ok(auditDispatch('feed_barley', cropDef('feed_barley').maturity, { planted: true }).some(row => row.id === 'harvest' && row.kinds.includes('harvester_combine')));
  } finally {
    resetSurfaceCrop('soy');
    resetSurfaceCrop('feed_barley');
    resetSurfaceCrop('cabbage');
    bindSurfaceClock('soy');
    bindSurfaceClock('feed_barley');
    bindSurfaceClock('cabbage');
  }
});

test('broken JSON is not treated as an empty browser', () => {
  const store = memoryStore();
  store.setItem(FIELD_STAGE_STORE, '{');
  const booted = bootFieldStageSource(store, null);
  assert.equal(booted.ok, false);
  assert.match(booted.message, /JSON/);
  assert.equal(booted.skipped, undefined);
});

test('a string-wrapped workshop save still loads', () => {
  const store = memoryStore();
  const doc = edited();
  doc.cropName = '阿巴阿巴';
  doc.name = '阿巴阿巴';
  writeStageStore(store, doc);
  store.setItem(FIELD_STAGE_STORE, JSON.stringify(store.getItem(FIELD_STAGE_STORE)));
  assert.equal(typeof readStageStore(store).crops, 'object');
  const booted = bootFieldStageSource(store, null);
  try {
    assert.equal(booted.ok, true, booted.message);
    bindPotatoClock();
    assert.equal(CROPS.find(c => c.id === 'potato').name, '阿巴阿巴');
  } finally {
    revertPotatoStages();
    bindPotatoClock();
  }
});

test('a broken workshop doc leaves the shipped potato in place', () => {
  const before = cropDef('potato').maturity;
  const applied = applyStagePayload({ crops: { potato: { cropId: 'potato', stages: [{ id: 'O' }] } } });
  assert.equal(applied.ok, false);
  assert.equal(cropDef('potato').maturity, before);
  assert.equal(cropDef('potato').stageOrigin, 'repo');
});
