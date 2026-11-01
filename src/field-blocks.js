// 田块是整地做出来、还没种的地。工序在图上，和作物阶段图分开存。
// 主游戏把图编译成整地步骤。深垄是犁一遍再培土一遍。

export const FIELD_BLOCK_STORE = 'ringsheaf.assetlab.fieldBlocks.v1';

export const FIELD_BLOCK_LIST = [
  {
    id: 'general',
    recipeId: 'clear_general',
    recipeName: '清地',
    name: '一般田地',
    tip: '犁一遍，做成可以种的田块。垄较平，不加成产量。拉斯提卡和短季薯都能种。',
    groundColor: '#5c5348',
    ridgeWidth: 0.75,
    ridgeCount: 8,
    yieldMul: 1,
    families: [],
    graph: {
      entry: { job: 'plow', to: 'bed' },
      stages: [
        { id: 'bed', name: '成垄', role: 'head', kind: 'time', look: 'general', days: 1, color: '#5c5348', jobs: [] },
      ],
      edges: [
        { from: 'bed', to: 'exit', kind: 'natural' },
      ],
      layout: {
        nodes: {
          entry: { x: 24, y: 80 },
          bed: { x: 180, y: 64 },
          exit: { x: 360, y: 80 },
        },
      },
    },
  },
  {
    id: 'deepridge',
    recipeId: 'deepridge',
    recipeName: '深垄',
    name: '深垄田地',
    tip: '犁一遍，再培土一遍。土豆类（短季薯、拉斯提卡）产量 ×1.2，和作物作业的产量倍数相乘。',
    groundColor: '#4a3b2a',
    ridgeWidth: 1.15,
    ridgeCount: 5,
    yieldMul: 1.2,
    families: ['potato'],
    graph: {
      entry: { job: 'plow', to: 'turned' },
      stages: [
        {
          id: 'turned', name: '犁过', role: 'head', kind: 'time', look: 'general', days: 1, color: '#5c5348',
          jobs: [{ job: 'hill', kind: 'hard', name: '培土', full: true }],
        },
        { id: 'ridged', name: '深垄', role: 'tail', kind: 'tail', look: 'general', color: '#4a3b2a', jobs: [] },
      ],
      edges: [
        { from: 'turned', to: 'ridged', kind: 'hard', job: 'hill' },
        { from: 'ridged', to: 'exit', kind: 'natural' },
      ],
      layout: {
        nodes: {
          entry: { x: 16, y: 78 },
          turned: { x: 160, y: 48 },
          ridged: { x: 380, y: 48 },
          exit: { x: 560, y: 78 },
          'job:turned:0': { x: 160, y: 200 },
        },
      },
    },
  },
];

export function prepSteps(doc) {
  const steps = [];
  const entry = doc?.graph?.entry;
  if (!entry?.job) return steps;
  steps.push(entry.job);
  let id = entry.to;
  const seen = new Set();
  const stages = doc.graph.stages || [];
  const edges = doc.graph.edges || [];
  while (id && id !== 'exit' && !seen.has(id)) {
    seen.add(id);
    const stage = stages.find(item => item.id === id);
    const hard = (stage?.jobs || []).find(job => job.kind === 'hard' && job.job);
    if (!hard) break;
    steps.push(hard.job);
    const edge = edges.find(item => item.from === id && item.kind === 'hard' && item.job === hard.job);
    if (!edge) break;
    id = edge.to;
  }
  return steps;
}

export function cloneFieldBlocks(list = FIELD_BLOCK_LIST) {
  return list.map(doc => structuredClone(doc));
}
