// 框架 B 的拉斯提卡和阶段编辑器读同一份文档。
// 只取四段名字、成熟时长、植株尺寸。不把工坊蒙版扫进田里。
import { parseFieldStageDoc, stageByGroup } from './field-stages.js';
import { JOBS, PLANT_CROPS } from './framework-b.js';
import { DAY_SECONDS } from './world-clock.js';
import lastikaRaw from '../data/field-stages/lastika.json' with { type: 'json' };

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

function compileGraph(doc, growSource) {
  const graph = doc.graph;
  if (!graph || !graph.entry || !Array.isArray(graph.stages) || !Array.isArray(graph.edges)) {
    throw new Error('拉斯提卡缺少阶段图');
  }
  const stages = graph.stages.map(stage => ({ ...stage }));
  const edges = graph.edges.map(edge => ({ ...edge }));
  if (edges.some(edge => edge.kind !== 'hard' && edge.kind !== 'natural')) {
    throw new Error('阶段图的边只能是 hard 或 natural');
  }
  const heads = stages.filter(stage => stage.role === 'head');
  const tails = stages.filter(stage => stage.role === 'tail');
  const rots = stages.filter(stage => stage.role === 'rot');
  if (heads.length !== 1 || !tails.length || !rots.length) throw new Error('阶段图要有一个头、一个可再种尾，以及腐烂尽头');
  const head = heads[0];
  if (edges.some(edge => edge.to === head.id)) throw new Error('头阶段不能从作物阶段进来');
  for (const tail of tails) {
    if (edges.some(edge => edge.from === tail.id)) throw new Error('可再种尾不能再有后继');
    if (Number(tail.days) > 0) throw new Error('可再种尾没有时长');
  }
  for (const rot of rots) {
    if (edges.some(edge => edge.from === rot.id)) throw new Error('腐烂尽头不能再有后继');
  }
  const mature = stages.find(stage => stage.id === 'mature');
  if (!mature || mature.role === 'tail' || mature.role === 'rot') throw new Error('成熟不是尾阶段');
  if (!edges.some(edge => edge.from === 'mature' && edge.kind === 'natural')) throw new Error('成熟到点要能进腐烂');
  const days = Number(growSource?.days);
  if (days > 0) head.days = days;
  if (growSource?.name) {
    const named = stages.find(stage => stage.id === 'mature');
    if (named) named.name = growSource.name;
  }
  head.soft = softJobsFromDoc(doc, growSource);
  if (graph.entry.job !== 'sow' || graph.entry.to !== head.id) throw new Error('作物图从播种进入头阶段，整地不在图里');
  return { entry: { ...graph.entry }, edges, stages };
}

export function lastikaSpecFromDoc(doc) {
  const bare = stageByGroup(doc, 'O');
  const sow = stageByGroup(doc, 'A');
  const mature = stageByGroup(doc, 'B');
  const harvest = stageByGroup(doc, 'D');
  const tidy = stageByGroup(doc, 'E');
  if (!sow || !mature || !harvest || !tidy) throw new Error('拉斯提卡缺少播种、成熟、收割或收拾');
  const plant = doc.plant || {};
  const graph = compileGraph(doc, mature);
  const head = graph.stages.find(stage => stage.role === 'head');
  const growDays = Number(head.days) > 0 ? Number(head.days) : PLANT_CROPS.lastika.growDays;
  return {
    name: doc.cropName || doc.name || '拉斯提卡',
    growDays,
    growSeconds: growDays * DAY_SECONDS,
    visual: {
      shape: plant.shape || 'bush',
      tex: 'ridges',
      height: Number(plant.height) > 0 ? Number(plant.height) : PLANT_CROPS.lastika.visual.height,
      row: Number(plant.row) > 0 ? Number(plant.row) : PLANT_CROPS.lastika.visual.row,
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
  };
}

export function applyLastikaSpec(spec, origin = 'repo') {
  const crop = PLANT_CROPS.lastika;
  crop.name = spec.name;
  crop.growDays = spec.growDays;
  crop.growSeconds = spec.growSeconds;
  crop.graph = spec.graph;
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
