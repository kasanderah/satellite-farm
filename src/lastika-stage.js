// 框架 B 的拉斯提卡和阶段编辑器读同一份文档。
// 只取四段名字、成熟时长、植株尺寸。不把工坊蒙版扫进田里。
import { parseFieldStageDoc, stageByGroup } from './field-stages.js';
import { JOBS, PLANT_CROPS } from './framework-b.js';
import { DAY_SECONDS } from './world-clock.js';
import { compilePlayableGraph } from './stage-graph.js';
import lastikaRaw from '../data/field-stages/lastika.json' with { type: 'json' };
import tuberRaw from '../data/field-stages/tuber.json' with { type: 'json' };

// 阶段编辑器里没有单独的 soft 字段。可选作业加上阶段内窗口，就是软窗口。
function softJobsFromDoc(doc, stage) {
  if (!stage) return [];
  const days = Number(stage.days) || 0;
  return (doc.ops || []).flatMap(op => {
    if (!op || op.kind !== 'optional' || op.stage !== stage.id || !op.window) return [];
    const from = Number(op.window.from);
    const to = Number(op.window.to);
    if (!(to > from) || from < 0 || to > days + 1e-6) return [];
    if (!JOBS[op.id] || JOBS[op.id].kind !== 'soft') return [];
    return [{ job: op.id, name: op.name || JOBS[op.id].name, from, to }];
  });
}

function hexOf(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function compileGraph(doc) {
  if (!doc?.graph) throw new Error('缺少阶段图');
  return compilePlayableGraph(doc.graph);
}

export function lastikaSpecFromDoc(doc) {
  const bare = stageByGroup(doc, 'O');
  const sow = stageByGroup(doc, 'A');
  const mature = stageByGroup(doc, 'B');
  const harvest = stageByGroup(doc, 'D');
  const tidy = stageByGroup(doc, 'E');
  if (!sow || !mature || !harvest || !tidy) throw new Error('拉斯提卡缺少播种、成熟、收割或收拾');
  const plant = doc.plant || {};
  const graph = compileGraph(doc);
  const growDays = graph.growDays > 0 ? graph.growDays : PLANT_CROPS.lastika.growDays;
  return {
    name: doc.cropName || doc.name || '拉斯提卡',
    growDays,
    growSeconds: growDays * DAY_SECONDS,
    visual: {
      shape: plant.shape || 'bush',
      tex: 'ridges',
      height: Number(plant.height) > 0 ? Number(plant.height) : PLANT_CROPS.lastika.visual.height,
      // 阶段文档的 plant.row 不再写回。行距属于田地类型。
      row: PLANT_CROPS.lastika.visual.row,
      along: Number(plant.along) > 0 ? Number(plant.along) : PLANT_CROPS.lastika.visual.along,
    },
    paints: {
      raw: hexOf(bare?.color, '#6f6a61'),
      young: hexOf(plant.young, hexOf(sow.canopy, '#51542c')),
      ripe: hexOf(plant.ripe, hexOf(mature.canopy, '#787c32')),
      straw: hexOf(plant.stub, hexOf(harvest.color, '#b59a63')),
      sown: hexOf(sow.color, '#4a4844'),
      mature: hexOf(mature.color, '#51542c'),
      harvest: hexOf(harvest.color, '#b59a63'),
    },
    graph: { entry: graph.entry, edges: graph.edges },
    stages: graph.stages,
    maturity: doc.maturity || PLANT_CROPS.lastika.maturity,
    yieldBase: Number(doc.yieldBase) > 0 ? Number(doc.yieldBase) : PLANT_CROPS.lastika.yieldBase,
    quality: doc.quality == null ? null : doc.quality,
    qualityBase: Number(doc.qualityBase) > 0 ? Number(doc.qualityBase) : 1,
  };
}

export function applyLastikaSpec(spec, origin = 'repo') {
  const crop = PLANT_CROPS.lastika;
  crop.name = spec.name;
  crop.growDays = spec.growDays;
  crop.growSeconds = spec.growSeconds;
  crop.graph = spec.graph;
  crop.maturity = spec.maturity;
  crop.yieldBase = spec.yieldBase;
  crop.quality = spec.quality;
  crop.qualityBase = spec.qualityBase;
  crop.visual = { ...crop.visual, ...spec.visual, tex: 'ridges' };
  crop.stages.splice(0, crop.stages.length, ...spec.stages);
  crop.paints = { ...spec.paints };
  crop.origin = origin === 'workshop' ? 'workshop' : 'repo';
  return crop;
}

export function installLastikaDoc(raw, origin = 'workshop') {
  const doc = parseFieldStageDoc(structuredClone(raw));
  return applyLastikaSpec(lastikaSpecFromDoc(doc), origin);
}

export function installShippedLastika() {
  return installLastikaDoc(lastikaRaw, 'repo');
}

function paintOf(doc, fallback) {
  const bare = stageByGroup(doc, 'O');
  const sow = stageByGroup(doc, 'A');
  const mature = stageByGroup(doc, 'B');
  const harvest = stageByGroup(doc, 'D');
  const plant = doc.plant || {};
  return {
    raw: hexOf(bare?.color, fallback.raw),
    young: hexOf(plant.young, hexOf(sow?.canopy, fallback.young)),
    ripe: hexOf(plant.ripe, hexOf(mature?.canopy, fallback.ripe)),
    straw: hexOf(plant.stub, hexOf(harvest?.color, fallback.straw)),
    sown: hexOf(sow?.color, fallback.sown),
    mature: hexOf(mature?.color, fallback.mature),
    harvest: hexOf(harvest?.color, fallback.harvest),
  };
}

export function tuberSpecFromDoc(doc) {
  const graph = compileGraph(doc);
  const plant = doc.plant || {};
  const fallback = PLANT_CROPS.tuber;
  return {
    name: doc.cropName || doc.name || fallback.name,
    growDays: graph.growDays > 0 ? graph.growDays : fallback.growDays,
    growSeconds: (graph.growDays > 0 ? graph.growDays : fallback.growDays) * DAY_SECONDS,
    visual: {
      shape: plant.shape || fallback.visual.shape,
      tex: 'ridges',
      height: Number(plant.height) > 0 ? Number(plant.height) : fallback.visual.height,
      row: Number(plant.row) > 0 ? Number(plant.row) : fallback.visual.row,
      along: Number(plant.along) > 0 ? Number(plant.along) : fallback.visual.along,
    },
    paints: paintOf(doc, fallback.paints),
    graph: { entry: graph.entry, edges: graph.edges },
    stages: graph.stages,
    maturity: doc.maturity || fallback.maturity,
    yieldBase: Number(doc.yieldBase) > 0 ? Number(doc.yieldBase) : fallback.yieldBase,
    quality: doc.quality == null ? null : doc.quality,
    qualityBase: Number(doc.qualityBase) > 0 ? Number(doc.qualityBase) : 1,
  };
}

export function applyTuberSpec(spec, origin = 'repo') {
  const crop = PLANT_CROPS.tuber;
  crop.name = spec.name;
  crop.growDays = spec.growDays;
  crop.growSeconds = spec.growSeconds;
  crop.graph = spec.graph;
  crop.maturity = spec.maturity;
  crop.yieldBase = spec.yieldBase;
  crop.quality = spec.quality;
  crop.qualityBase = spec.qualityBase;
  crop.visual = { ...crop.visual, ...spec.visual, tex: 'ridges' };
  crop.stages.splice(0, crop.stages.length, ...spec.stages);
  crop.paints = { ...spec.paints };
  crop.origin = origin === 'workshop' ? 'workshop' : 'repo';
  return crop;
}

export function installTuberDoc(raw, origin = 'workshop') {
  const doc = parseFieldStageDoc(structuredClone(raw));
  return applyTuberSpec(tuberSpecFromDoc(doc), origin);
}

export function installShippedTuber() {
  return installTuberDoc(tuberRaw, 'repo');
}
