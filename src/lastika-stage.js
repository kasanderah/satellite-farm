// 框架 B 的拉斯提卡和阶段编辑器读同一份文档。
// 只取四段名字、成熟时长、植株尺寸。不把工坊蒙版扫进田里。
import { parseFieldStageDoc, stageByGroup } from './field-stages.js';
import { PLANT_CROPS } from './framework-b.js';
import lastikaRaw from '../data/field-stages/lastika.json' with { type: 'json' };

export function lastikaSpecFromDoc(doc) {
  const sow = stageByGroup(doc, 'A');
  const mature = stageByGroup(doc, 'B');
  const harvest = stageByGroup(doc, 'D');
  const tidy = stageByGroup(doc, 'E');
  if (!sow || !mature || !harvest || !tidy) throw new Error('拉斯提卡缺少播种、成熟、收割或收拾');
  const plant = doc.plant || {};
  const days = Number(mature.days);
  return {
    name: doc.cropName || doc.name || '拉斯提卡',
    growSeconds: days > 0 ? days : PLANT_CROPS.lastika.growSeconds,
    visual: {
      shape: plant.shape || 'bush',
      tex: 'ridges',
      height: Number(plant.height) > 0 ? Number(plant.height) : PLANT_CROPS.lastika.visual.height,
      row: Number(plant.row) > 0 ? Number(plant.row) : PLANT_CROPS.lastika.visual.row,
      along: Number(plant.along) > 0 ? Number(plant.along) : PLANT_CROPS.lastika.visual.along,
    },
    stages: [
      { id: 'sow', name: sow.name || '播种', kind: 'hard', job: 'sow' },
      { id: 'mature', name: mature.name || '成熟', kind: 'time' },
      { id: 'harvest', name: harvest.name || '收割', kind: 'hard', job: 'harvest' },
      { id: 'tidy', name: tidy.name || '收拾', kind: 'hard', job: 'tidy' },
    ],
  };
}

export function applyLastikaSpec(spec) {
  const crop = PLANT_CROPS.lastika;
  crop.name = spec.name;
  crop.growSeconds = spec.growSeconds;
  crop.visual = { ...crop.visual, ...spec.visual, tex: 'ridges' };
  crop.stages.splice(0, crop.stages.length, ...spec.stages);
  return crop;
}

export function installLastikaDoc(raw) {
  const doc = parseFieldStageDoc(structuredClone(raw));
  return applyLastikaSpec(lastikaSpecFromDoc(doc));
}

export function installShippedLastika() {
  return installLastikaDoc(lastikaRaw);
}
