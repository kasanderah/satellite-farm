// 田块是整地做出来、还没种的地。工序在图上，和作物阶段图分开存。
// 主游戏把图编译成整地步骤。深垄是犁一遍再培土一遍。
// 行距和垄截面以田地类型为准。作物阶段文档里的 ridge 不再驱动主进程，只留给旧工坊预览。
import { CELL } from './modulus.js';

export const FIELD_BLOCK_STORE = 'ringsheaf.assetlab.fieldBlocks.v1';

// 行距必须整除建筑格，这样一格里是整数行。
export function rowFromCellCount(count) {
  const n = Math.max(2, Math.min(12, Math.round(count) || 6));
  return Math.round((CELL / n) * 1000) / 1000;
}

export function snapRow(meters) {
  const guess = Number(meters) > 0 ? CELL / Number(meters) : 6;
  const n = Math.max(2, Math.min(12, Math.round(guess)));
  return { rowsPerCell: n, row: rowFromCellCount(n) };
}

// 株距同样整除建筑格。每格株数可以比行数更密。
export function snapAlong(meters) {
  const guess = Number(meters) > 0 ? CELL / Number(meters) : 12;
  const n = Math.max(4, Math.min(24, Math.round(guess)));
  return { perCell: n, along: Math.round((CELL / n) * 1000) / 1000 };
}

export function ridgeAmp(points) {
  return (points || []).reduce((max, point) => Math.max(max, Number(point?.y) || 0), 0);
}

// 旧工坊档可能只有 ridgeWidth。打开时收成行距，缺的截面用仓库里同 id 的那条。
export function normalizeFieldBlock(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const seed = FIELD_BLOCK_LIST.find(item => item.id === doc.id);
  const raw = Number(doc.row) > 0 ? Number(doc.row) : Number(doc.ridgeWidth);
  const snapped = snapRow(raw > 0 ? raw : seed?.row || 0.7);
  doc.rowsPerCell = snapped.rowsPerCell;
  doc.row = snapped.row;
  doc.ridgeWidth = doc.row;
  if (!Array.isArray(doc.ridge) || doc.ridge.length < 2) doc.ridge = structuredClone(seed?.ridge || []);
  return doc;
}

// 一般田地垄矮。深垄沟更深、顶更高。软作业只在这个截面上乘一个抬高，不换类型。
export const RIDGE_GENERAL = [
  { x: 0, y: 0.03 },
  { x: 0.5, y: 0.16 },
  { x: 1, y: 0.03 },
];
export const RIDGE_DEEP = [
  { x: 0, y: 0.02 },
  { x: 0.22, y: 0.06 },
  { x: 0.5, y: 0.46 },
  { x: 0.78, y: 0.06 },
  { x: 1, y: 0.02 },
];

export const FIELD_BLOCK_LIST = [
  {
    id: 'general',
    recipeId: 'clear_general',
    recipeName: '清地',
    name: '一般田地',
    tip: '',
    groundColor: '#5c5348',
    rowsPerCell: 6,
    row: 0.7,
    ridgeWidth: 0.7,
    ridge: RIDGE_GENERAL.map(point => ({ ...point })),
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
    tip: '',
    groundColor: '#4a3b2a',
    rowsPerCell: 4,
    row: 1.05,
    ridgeWidth: 1.05,
    ridge: RIDGE_DEEP.map(point => ({ ...point })),
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

// 菜单文案跟当前行距走。存档里的 tip 是写下去那一刻的句子，主进程不拿它当数。
export function blockBlurb(doc) {
  const row = Number(doc?.row) > 0 ? Number(doc.row) : Number(doc?.ridgeWidth);
  const n = Number(doc?.rowsPerCell) > 0 ? Math.round(doc.rowsPerCell) : (row > 0 ? Math.max(1, Math.round(CELL / row)) : 0);
  const meters = row > 0 ? String(Math.round(row * 1000) / 1000) : '';
  const spacing = meters && n ? `行距 ${meters} m，一格 ${n} 行` : '行距未定';
  const steps = prepSteps(doc);
  const deep = doc?.id === 'deepridge' || steps.includes('hill');
  if (deep) {
    const mul = Number(doc?.yieldMul) > 0 ? Number(doc.yieldMul) : 1;
    const bonus = mul > 1 ? `土豆类产量再 ×${mul}，和株数、作业倍数相乘。` : '不另加成产量。';
    return `犁一遍，再培土一遍。${spacing}。垄比一般田地高。${bonus}`;
  }
  return `犁一遍，做成可以种的田块。垄较平，不加成产量。${spacing}。拉斯提卡和短季薯都能种。`;
}

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

for (const doc of FIELD_BLOCK_LIST) doc.tip = blockBlurb(doc);

export function cloneFieldBlocks(list = FIELD_BLOCK_LIST) {
  return list.map(doc => structuredClone(doc));
}
