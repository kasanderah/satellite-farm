// 田间阶段配置。工坊编辑，主进程只读。
//
// 本文件不跑农时循环，不派农机，不写存档。主进程以后可以这样读：
//
//   import { parseFieldStageDoc, FIELD_STAGE_SCHEMA } from './field-stages.js';
//   const doc = parseFieldStageDoc(JSON.parse(text));
//
// 或者直接读 data/field-stages/<cropId>.json，结构和 parse 之后的文档一样。
// 浏览器工坊另外把同一份文档放在 localStorage `ringsheaf.assetlab.fieldStages.v1`。
//
// 阶段时钟、蒙版和扫田在 createSim / stepSim / startJob 里，给工坊预览和测试用。
// 玩法要取消进行中的扫田，调用 cancelWorkOrder(sim)。这里没有工单队列。
//
// edges 是显式边表。默认有一条启用的 E→O（via clear）。
// 同时留着 E→A（via resow，enabled: false）。不要在主进程里写死「收获后只能回空地」。

export const FIELD_STAGE_SCHEMA = 'ringsheaf.field-stage/1';
export const FIELD_STAGE_STORE = 'ringsheaf.assetlab.fieldStages.v1';

// 1× 播放：1 游戏日 = 1 真实秒。加速只乘这个比例。
export const FIELD_STAGE_SECONDS_PER_DAY = 1;

const GROWTH_KEEP = new Set(['A', 'D']);

export function hash01(row, along, salt = 0) {
  let n = (row + 1) * 374761393 + (along + 1) * 668265263 + (salt + 1) * 1442695041;
  n = (n ^ (n >>> 13)) * 1274126177;
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

// 8 个采样里最高的那一档，归一到 0–1。植株和垄顶色带都落在这个跨行相位上。
export function ridgeCrestT(samples) {
  const n = samples ? samples.length : 0;
  if (n < 2) return 0.5;
  let best = 0;
  let h = -1;
  for (let i = 0; i < n; i++) {
    const y = +samples[i] || 0;
    if (y > h) { h = y; best = i; }
  }
  return best / (n - 1);
}

export function sampleRidge(points, t) {
  const pts = (points || []).map(p => ({ x: Number(p.x), y: Number(p.y) })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  pts.sort((a, b) => a.x - b.x);
  if (!pts.length) return 0;
  if (pts.length === 1 || t <= pts[0].x) return Math.max(0, pts[0].y);
  const last = pts[pts.length - 1];
  if (t >= last.x) return Math.max(0, last.y);
  let i = 0;
  while (i < pts.length - 2 && pts[i + 1].x < t) i += 1;
  const a = pts[i];
  const b = pts[i + 1];
  const u = (t - a.x) / Math.max(1e-6, b.x - a.x);
  const s = u * u * (3 - 2 * u);
  return Math.max(0, a.y + (b.y - a.y) * s);
}

function ridge(pairs) {
  return pairs.map(([x, y]) => ({ x, y }));
}

const RIDGE_TILL = ridge([[0, 0.04], [0.18, 0.06], [0.5, 0.28], [0.82, 0.06], [1, 0.04]]);
const RIDGE_HILL = ridge([[0, 0.02], [0.22, 0.05], [0.5, 0.46], [0.78, 0.05], [1, 0.02]]);
const RIDGE_FLAT = ridge([[0, 0.03], [0.5, 0.08], [1, 0.03]]);
const RIDGE_SEED = ridge([[0, 0.05], [0.2, 0.07], [0.5, 0.22], [0.8, 0.07], [1, 0.05]]);

function stage(partial) {
  return {
    rows: null,
    ridge: null,
    color: '#6f6a61',
    canopy: '#51542c',
    roughness: 0.94,
    cover: 0,
    plantScale: 0,
    variants: [],
    ...partial,
  };
}

function variant(partial) {
  return {
    name: partial.id,
    days: 0,
    auto: false,
    color: null,
    canopy: null,
    roughness: null,
    cover: null,
    plantScale: null,
    ridge: null,
    ...partial,
  };
}

function machinesFor(crop) {
  const id = crop.id;
  const planter = id === 'potato' ? 'impl_potato_planter' : id === 'cabbage' ? 'transplanter' : 'impl_seeder';
  const harvester = id === 'potato' ? 'harvester_potato' : id === 'cabbage' ? 'harvester_cabbage' : 'harvester_combine';
  // sweepHead / sweepTail：相对车体原点、沿行进方向的米。正值在车头一侧。
  // 主进程以后用这两个点决定「扫过」从哪一截算，工坊只预留并让车头点触发变体。
  const row = (machineId, name, head, tail) => ({ id: machineId, name, sweepHead: head, sweepTail: tail });
  return {
    [planter]: row(planter, '播种', 1.8, -1.7),
    impl_sprayer: row('impl_sprayer', '喷雾', 1.4, -1.5),
    impl_fertilizer: row('impl_fertilizer', '施肥', 1.2, -1.6),
    impl_cultivator: row('impl_cultivator', '中耕', 1.5, -1.4),
    impl_rotavator: row('impl_rotavator', '旋耕', 1.6, -1.3),
    [harvester]: row(harvester, '收获', 2.4, -2.2),
  };
}

function opsFor(crop) {
  const planter = crop.id === 'potato' ? 'impl_potato_planter' : crop.id === 'cabbage' ? 'transplanter' : 'impl_seeder';
  const harvester = crop.id === 'potato' ? 'harvester_potato' : crop.id === 'cabbage' ? 'harvester_cabbage' : 'harvester_combine';
  const sowName = crop.id === 'cabbage' ? '定植' : '播种';
  return [
    { id: 'sow', name: sowName, kind: 'required', via: 'sow', stage: 'O', requiresMask: false, requiresUnlocked: true, writesMask: true, locksUnswept: true, sweepDays: 2, machine: planter },
    { id: 'weed', name: '中耕', kind: 'optional', via: null, stage: 'B', variant: null, requiresMask: true, requiresUnlocked: false, writesMask: false, locksUnswept: false, sweepDays: 1.6, machine: 'impl_cultivator' },
    { id: 'scout', name: '侦察', kind: 'optional', via: null, stage: 'C', variant: null, requiresMask: true, requiresUnlocked: false, writesMask: false, locksUnswept: false, sweepDays: 1, machine: 'drone_scout', drone: true },
    { id: 'treat', name: '植保', kind: 'optional', via: null, stage: 'C', variant: null, requiresMask: true, requiresUnlocked: false, writesMask: false, locksUnswept: false, sweepDays: 1, machine: 'drone_treat', drone: true },
    { id: 'water', name: '喷水', kind: 'optional', via: null, stage: 'A', variant: 'A1', requiresMask: true, requiresUnlocked: false, writesMask: false, locksUnswept: false, sweepDays: 1.4, machine: 'impl_sprayer' },
    { id: 'fertilize', name: '施肥', kind: 'optional', via: null, stage: 'A', variant: 'A2', requiresMask: true, requiresUnlocked: false, writesMask: false, locksUnswept: false, sweepDays: 1.4, machine: 'impl_fertilizer' },
    { id: 'spray', name: '喷药', kind: 'optional', via: null, stage: 'C', variant: 'C1', requiresMask: true, requiresUnlocked: false, writesMask: false, locksUnswept: false, sweepDays: 1.4, machine: 'impl_sprayer' },
    { id: 'harvest', name: '收割', kind: 'required', via: 'harvest', stage: 'D', requiresMask: true, requiresUnlocked: false, writesMask: false, locksUnswept: false, sweepDays: 2.2, machine: harvester },
    { id: 'cultivate', name: '中耕', kind: 'optional', via: null, stage: 'O', variant: 'O1', requiresMask: false, requiresUnlocked: false, writesMask: false, locksUnswept: false, sweepDays: 1.6, machine: 'impl_cultivator' },
    { id: 'lime', name: '撒石灰', kind: 'optional', via: null, stage: 'O', variant: 'O2', requiresMask: false, requiresUnlocked: false, writesMask: false, locksUnswept: false, sweepDays: 1.6, machine: 'impl_fertilizer' },
    { id: 'till', name: '翻地', kind: 'special', via: 'till', stage: '*', requiresMask: false, requiresUnlocked: false, writesMask: false, locksUnswept: false, breaksMask: true, sweepDays: 2, machine: 'impl_rotavator' },
    { id: 'clear', name: '清田', kind: 'special', via: 'clear', stage: 'E', requiresMask: false, requiresUnlocked: false, writesMask: false, locksUnswept: false, breaksMask: true, sweepDays: 1.8, machine: 'impl_cultivator' },
    { id: 'resow', name: '复播', kind: 'special', via: 'resow', stage: 'E', requiresMask: false, requiresUnlocked: false, writesMask: false, locksUnswept: false, breaksMask: false, sweepDays: 2, machine: planter, reserved: true },
  ];
}

function baseEdges() {
  return [
    { from: 'O', fromVariant: '', to: 'A', toVariant: '', via: 'sow', when: 'process', enabled: true },
    { from: 'D', fromVariant: '', to: 'E', toVariant: '', via: 'harvest', when: 'process', enabled: true },
    { from: '*', fromVariant: '', to: 'O', toVariant: 'O1', via: 'till', when: 'process', enabled: true, breaksMask: true },
    { from: 'E', fromVariant: '', to: 'O', toVariant: '', via: 'clear', when: 'process', enabled: true, breaksMask: true },
    // 预留。默认关掉。启用后复播走 E→A，不清掉「只能回空地」这条以外的路。
    { from: 'E', fromVariant: '', to: 'A', toVariant: '', via: 'resow', when: 'process', enabled: false, breaksMask: false },
    // fromVariant *：空地上一次作业之后再放满 O.days，仍进 O3。已经是 O3 则停住。
    { from: 'O', fromVariant: '*', to: 'O', toVariant: 'O3', via: 'idle', when: 'auto', enabled: true },
    { from: 'D', fromVariant: '', to: 'D', toVariant: 'D1', via: 'overstay', when: 'auto', enabled: true },
    { from: 'D', fromVariant: 'D1', to: 'D', toVariant: 'D2', via: 'overstay', when: 'auto', enabled: true },
  ];
}

export function placeholderFieldDoc(crop) {
  const c = crop || {};
  const id = c.id || 'crop';
  const young = c.young || '#51542c';
  const ripe = c.ripe || '#81683f';
  const stub = c.stub || '#9e543a';
  const doc = {
    schema: FIELD_STAGE_SCHEMA,
    readme: '主进程：import { parseFieldStageDoc } from "./src/field-stages.js"，或读取这份 JSON。字段说明见 data/field-stages/README.md。edges 决定阶段怎么走，不要写死 E→O。hooks.cancelWorkOrder 只是函数名，工坊不派单。',
    cropId: id,
    logicId: 'crop_' + id,
    cropName: c.name || id,
    name: c.name || id,
    timeUnit: 'gameDay',
    secondsPerDayAt1x: FIELD_STAGE_SECONDS_PER_DAY,
    rows: 8,
    grid: { along: 14 },
    plant: {
      shape: c.shape || 'bush',
      height: c.height ?? 0.55,
      row: c.row ?? 0.9,
      along: c.along ?? 0.4,
      young,
      ripe,
      stub,
    },
    ridge: RIDGE_TILL.map(p => ({ ...p })),
    transition: { template: 'scatter', span: 'window', windowDays: 1.2 },
    chain: ['A', 'B', 'C', 'D'],
    cycle: 51,
    stages: [
      stage({
        id: 'O', name: '空地', kind: 'idle', days: 5,
        color: '#6f6a61', canopy: '#4a4844', roughness: 0.97, cover: 0, plantScale: 0,
        variants: [
          variant({ id: 'O1', name: '中耕后', color: '#4a4844', roughness: 0.96, cover: 0, plantScale: 0, ridge: RIDGE_HILL.map(p => ({ x: p.x, y: p.y * 0.7 })) }),
          variant({ id: 'O2', name: '撒石灰', color: '#a2998a', canopy: '#bcc3c4', roughness: 0.9, cover: 0.08, plantScale: 0 }),
          variant({ id: 'O3', name: '久置闲置', auto: true, color: '#4a4844', roughness: 0.98, cover: 0, plantScale: 0, ridge: RIDGE_FLAT.map(p => ({ ...p })) }),
        ],
      }),
      stage({
        id: 'A', name: '播种后', kind: 'growth', days: 3,
        color: '#4a4844', canopy: young, roughness: 0.95, cover: 0.12, plantScale: 0.18,
        ridge: RIDGE_SEED.map(p => ({ ...p })),
        variants: [
          variant({ id: 'A1', name: '喷水', color: '#52747e', canopy: '#8fbbad', roughness: 0.72, cover: 0.2, plantScale: 0.2 }),
          variant({ id: 'A2', name: '施肥', color: '#81683f', canopy: '#b59a63', roughness: 0.9, cover: 0.16, plantScale: 0.22 }),
        ],
      }),
      stage({
        id: 'B', name: '小植株', kind: 'growth', days: 12, optional: true,
        color: '#6f6a61', canopy: young, roughness: 0.84, cover: 0.48, plantScale: 0.42,
      }),
      stage({
        id: 'C', name: '大植株', kind: 'growth', days: 28, optional: true,
        color: '#51542c', canopy: '#787c32', roughness: 0.68, cover: 0.86, plantScale: 0.92,
        ridge: RIDGE_HILL.map(p => ({ ...p })),
        variants: [
          variant({ id: 'C1', name: '喷药', color: '#3e7a37', canopy: '#787c32', roughness: 0.6, cover: 0.9, plantScale: 0.94 }),
        ],
      }),
      stage({
        id: 'D', name: '待收获', kind: 'growth', days: 8,
        color: '#81683f', canopy: ripe, roughness: 0.7, cover: 0.74, plantScale: 0.8,
        variants: [
          variant({ id: 'D1', name: '过熟', auto: true, days: 4, color: '#b59a63', canopy: '#81683f', roughness: 0.78, cover: 0.5, plantScale: 0.62 }),
          variant({ id: 'D2', name: '烂地', auto: true, days: 4, color: '#9e543a', canopy: '#4a4844', roughness: 0.96, cover: 0.22, plantScale: 0.16, ridge: RIDGE_FLAT.map(p => ({ ...p })) }),
        ],
      }),
      stage({
        id: 'E', name: '收获后', kind: 'post', days: 3,
        color: stub, canopy: '#6f6a61', roughness: 0.93, cover: 0.06, plantScale: 0.04,
        ridge: RIDGE_FLAT.map(p => ({ ...p })),
      }),
    ],
    ops: opsFor({ id, ...c }),
    edges: baseEdges(),
    machines: machinesFor({ id, ...c }),
    hooks: {
      // 玩法取消工单时调用 cancelWorkOrder(sim)。工坊不生成工单。
      cancelWorkOrder: 'cancelWorkOrder',
    },
  };
  return rebuildNaturalEdges(doc);
}

// 作物文档 → 总周期 → 阶段首尾相接。O、E 不进这口钟。对不齐就抛错，不另造一张旧日历。
export function alignFieldCalendar(doc) {
  if (!doc || !Array.isArray(doc.stages) || !Array.isArray(doc.chain)) {
    throw new Error('田间配置对不齐：缺阶段或生长链');
  }
  const byId = new Map(doc.stages.map(s => [s.id, s]));
  const chain = doc.chain;
  if (!chain.length || chain[0] !== 'A' || chain[chain.length - 1] !== 'D') {
    throw new Error('生长链要从 A 排到 D');
  }
  const seen = new Set();
  const placed = [];
  let cursor = 0;
  for (const id of chain) {
    if (seen.has(id)) throw new Error('生长链重复 ' + id);
    seen.add(id);
    const row = byId.get(id);
    if (!row) throw new Error('生长链缺 ' + id);
    const days = Number(row.days);
    if (!(days > 0)) throw new Error('阶段 ' + id + ' 没有时长');
    const from = cursor;
    cursor += days;
    placed.push({ id, from, to: cursor, days, row });
  }
  for (let i = 1; i < placed.length; i++) {
    if (placed[i].from !== placed[i - 1].to) throw new Error('阶段 ' + placed[i].id + ' 和上一段接不上');
  }
  const cycle = cursor;
  if (placed[0].from !== 0 || placed[placed.length - 1].to !== cycle) {
    throw new Error('总周期和阶段加总对不上');
  }
  if (Number.isFinite(+doc.cycle) && Math.abs(+doc.cycle - cycle) > 0.001) {
    throw new Error('总周期和阶段加总对不上');
  }
  const idle = byId.get('O');
  const post = byId.get('E');
  if (!idle) throw new Error('阶段缺 O');
  if (!post) throw new Error('阶段缺 E');
  const hold = placed[placed.length - 1];
  const variants = hold.row.variants || [];
  const d1 = variants.find(v => v.id === 'D1' && v.auto);
  const d2 = variants.find(v => v.id === 'D2' && v.auto);
  const over = d1 ? Math.max(0, Number(d1.days) || 0) : 0;
  const rotTail = d2 ? Math.max(0, Number(d2.days) || 0) : 0;
  return {
    cycle,
    placed,
    idle,
    post,
    maturity: hold.from,
    hold: hold.days,
    rotAt: hold.to + over + rotTail,
    d1,
    d2,
  };
}

// 每道工的窗口必须落在它的阶段里。收获窗可以盖住 D 的过熟和烂地，因为那仍是 D。
export function jobWindows(doc, aligned) {
  const stageOf = id => aligned.placed.find(s => s.id === id) || null;
  const hold = aligned.placed[aligned.placed.length - 1];
  const out = [];
  let fallback = 0;
  for (const op of doc.ops || []) {
    if (!op || op.reserved) continue;
    const ext = op.extensions || {};
    if (ext.framework) continue;
    if (op.stage === '*') continue;
    const writesMask = !!op.writesMask;
    const harvest = ext.harvest === true || op.via === 'harvest';
    let window;
    if (writesMask || op.stage === 'O') {
      window = { when: 'before', stage: 'O', from: 0, to: 0 };
    } else if (op.stage === 'E' || ext.afterHarvest === true) {
      const from = hold.to;
      const days = Number(aligned.post.days) || 0;
      window = { when: 'after', stage: 'E', from, to: from + days };
    } else {
      const placed = stageOf(op.stage);
      // 阶段已经删掉、或不在生长链上：这道工不进调度，也不把整份作物挡回去。
      if (!placed) continue;
      let from = placed.from;
      let to = placed.to;
      if (op.window && Number.isFinite(+op.window.from) && Number.isFinite(+op.window.to)) {
        from = placed.from + Number(op.window.from);
        to = placed.from + Number(op.window.to);
        if (from < placed.from || to > placed.to || !(to > from)) {
          throw new Error('作业窗口越出阶段 ' + (op.id || op.name || op.stage));
        }
      } else if (harvest && placed.id === hold.id) {
        to = aligned.rotAt;
      }
      if (!(to > from) || from < placed.from || (to > placed.to && !(harvest && placed.id === hold.id))) {
        throw new Error('作业窗口越出阶段 ' + (op.id || op.name || op.stage));
      }
      window = { when: 'clock', stage: placed.id, from, to };
    }
    const order = Number.isFinite(+ext.order) ? +ext.order : fallback;
    fallback += 1;
    out.push({ op, window, order });
  }
  const rank = { before: 0, clock: 1, after: 2 };
  out.sort((a, b) => rank[a.window.when] - rank[b.window.when] || a.window.from - b.window.from || a.order - b.order);
  return out;
}

export function rebuildNaturalEdges(doc) {
  const known = new Set(doc.stages.map(s => s.id));
  const middle = (doc.chain || []).filter(id => known.has(id) && !GROWTH_KEEP.has(id) && id !== 'O' && id !== 'E');
  doc.chain = ['A', ...middle, 'D'];
  const natural = [];
  for (let i = 0; i < doc.chain.length - 1; i++) {
    natural.push({
      from: doc.chain[i],
      fromVariant: '',
      to: doc.chain[i + 1],
      toVariant: '',
      via: 'clock',
      when: 'natural',
      enabled: true,
    });
  }
  doc.edges = [
    ...(doc.edges || []).filter(e => e.when !== 'natural'),
    ...natural,
  ];
  return doc;
}

function clampDays(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0.25, Math.min(400, Math.round(v * 100) / 100));
}

function copyRidge(points) {
  if (!points) return null;
  return points.map(p => ({ x: Number(p.x), y: Number(p.y) }));
}

export function parseFieldStageDoc(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('田间配置不是对象');
  if (!Array.isArray(input.stages) || !input.stages.length) throw new Error('田间配置缺少 stages');
  if (!Array.isArray(input.edges)) throw new Error('田间配置缺少 edges');
  const seed = placeholderFieldDoc({
    id: input.cropId || 'crop',
    name: input.cropName || input.name,
    shape: input.plant && input.plant.shape,
    height: input.plant && input.plant.height,
    row: input.plant && input.plant.row,
    along: input.plant && input.plant.along,
    young: input.plant && input.plant.young,
    ripe: input.plant && input.plant.ripe,
    stub: input.plant && input.plant.stub,
  });
  const doc = {
    ...seed,
    ...input,
    schema: FIELD_STAGE_SCHEMA,
    timeUnit: 'gameDay',
    secondsPerDayAt1x: FIELD_STAGE_SECONDS_PER_DAY,
    rows: Math.max(2, Math.min(24, Math.round(Number(input.rows) || seed.rows))),
    grid: { along: Math.max(4, Math.min(48, Math.round(Number(input.grid && input.grid.along) || seed.grid.along))) },
    plant: { ...seed.plant, ...(input.plant || {}) },
    ridge: copyRidge(input.ridge) || seed.ridge,
    cycle: Number.isFinite(+input.cycle) ? +input.cycle : undefined,
    transition: { ...seed.transition, ...(input.transition || {}) },
    stages: input.stages.map(raw => {
      const base = seed.stages.find(s => s.id === raw.id);
      const merged = stage({ ...(base || {}), ...raw, id: String(raw.id), name: raw.name || (base && base.name) || raw.id });
      merged.days = clampDays(raw.days, (base && base.days) || 1);
      merged.rows = raw.rows == null || raw.rows === '' ? null : Math.max(2, Math.min(24, Math.round(Number(raw.rows))));
      merged.ridge = raw.ridge == null ? (base ? base.ridge : null) : copyRidge(raw.ridge);
      merged.variants = (raw.variants || (base && base.variants) || []).map(v => variant({ ...v, ridge: v.ridge ? copyRidge(v.ridge) : null }));
      return merged;
    }),
    ops: (input.ops || seed.ops).map(op => ({ ...op })),
    machines: { ...seed.machines, ...(input.machines || {}) },
    hooks: { ...seed.hooks, ...(input.hooks || {}) },
    edges: input.edges.map(e => ({
      from: e.from,
      fromVariant: e.fromVariant || '',
      to: e.to,
      toVariant: e.toVariant || '',
      via: e.via,
      when: e.when,
      enabled: e.enabled !== false,
      breaksMask: !!e.breaksMask,
    })),
    chain: input.chain || seed.chain,
  };
  if (!doc.edges.some(e => e.via === 'resow' && e.from === 'E' && e.to === 'A')) {
    doc.edges.push({ from: 'E', fromVariant: '', to: 'A', toVariant: '', via: 'resow', when: 'process', enabled: false, breaksMask: false });
  }
  if (!doc.edges.some(e => e.via === 'clear' && e.from === 'E' && e.to === 'O')) {
    doc.edges.push({ from: 'E', fromVariant: '', to: 'O', toVariant: '', via: 'clear', when: 'process', enabled: true, breaksMask: true });
  }
  const shapes = new Set(['ear', 'stalk', 'bush', 'tuft', 'rosette']);
  if (!shapes.has(doc.plant.shape)) doc.plant.shape = 'bush';
  const templates = new Set(['instant', 'scatter', 'sweep']);
  if (!templates.has(doc.transition.template)) doc.transition.template = 'scatter';
  if (doc.transition.span !== 'full') doc.transition.span = 'window';
  doc.transition.windowDays = clampDays(doc.transition.windowDays, 1.2);
  const cropName = String(input.cropName || input.name || seed.cropName || doc.cropId).trim() || doc.cropId;
  doc.cropName = cropName;
  doc.name = cropName;
  exclusiveHarvestExits(doc);
  return rebuildNaturalEdges(doc);
}

// 主游戏目前只种这四槽。工坊可以另存作物，但不能拿显示名去占这四个 id。
export const PLANTABLE_CROP_IDS = ['potato', 'soy', 'cabbage', 'feed_barley'];

const CROP_ID_OK = /^[A-Za-z][A-Za-z0-9_-]{0,48}$/;

export function isStableCropId(id) {
  return CROP_ID_OK.test(String(id || ''));
}

export function allocateCropId(used) {
  const taken = used instanceof Set ? used : new Set(used || []);
  let n = 1;
  while (taken.has('custom' + n)) n += 1;
  return 'custom' + n;
}

export function cropOptionLabel(name, id) {
  const label = String(name || '').trim() || String(id || '');
  return label + ' · ' + id;
}

// 库的钥匙是稳定 id。显示名只留在 cropName。土豆槽保留 crop_potato；别的 id 丢掉土豆档案标记。
export function sealCropIdentity(doc, id) {
  doc.cropId = id;
  if (id === 'potato') doc.logicId = 'crop_potato';
  else {
    doc.logicId = 'crop_' + id;
    if (doc.profile === 'potato-b') delete doc.profile;
  }
  return doc;
}

export function renameCropDisplay(doc, name) {
  const next = String(name ?? '').trim();
  if (!next) return doc;
  doc.cropName = next;
  doc.name = next;
  return doc;
}

export function forkCropDocument(source, id) {
  const copy = structuredClone(source);
  sealCropIdentity(copy, id);
  const base = String(source.cropName || source.name || '新作物').trim() || '新作物';
  const name = /副本$/.test(base) ? base : base + ' 副本';
  copy.cropName = name;
  copy.name = name;
  return copy;
}

// 已经解析过的文档按信封钥匙归位。不稳定的钥匙（例如显示名）另起 custom id，不覆盖已占用的槽。
export function indexCropLibrary(pairs) {
  const docs = {};
  const used = new Set();
  const rest = [];
  for (const row of pairs || []) {
    const key = String(row.key || '');
    const doc = row.doc;
    if (!doc || typeof doc !== 'object') continue;
    if (isStableCropId(key) && !used.has(key)) {
      sealCropIdentity(doc, key);
      docs[key] = doc;
      used.add(key);
    } else rest.push(doc);
  }
  for (const doc of rest) {
    const wanted = isStableCropId(doc.cropId) && !used.has(doc.cropId) ? doc.cropId : allocateCropId(used);
    sealCropIdentity(doc, wanted);
    docs[wanted] = doc;
    used.add(wanted);
  }
  return docs;
}

function exclusiveHarvestExits(doc) {
  const clear = (doc.edges || []).filter(e => e.via === 'clear' && e.from === 'E' && e.to === 'O');
  const resow = (doc.edges || []).filter(e => e.via === 'resow' && e.from === 'E' && e.to === 'A');
  const clearOn = clear.some(e => e.enabled);
  const resowOn = resow.some(e => e.enabled);
  if (clearOn && resowOn) {
    for (const edge of resow) edge.enabled = false;
  } else if (!clearOn && !resowOn && clear.length) {
    for (const edge of clear) edge.enabled = true;
  }
  return doc;
}

// E→O（clear）和 E→A（resow）只留一条。via 为 resow 时走复播，否则走清田。
export function setHarvestExit(doc, via) {
  const want = via === 'resow' ? 'resow' : 'clear';
  for (const edge of doc.edges || []) {
    if (edge.via === 'clear' && edge.from === 'E' && edge.to === 'O') edge.enabled = want === 'clear';
    if (edge.via === 'resow' && edge.from === 'E' && edge.to === 'A') edge.enabled = want === 'resow';
  }
  return doc;
}

export const OP_MACHINE_CHOICES = [
  ['impl_potato_planter', '薯播'],
  ['impl_seeder', '条播'],
  ['transplanter', '移栽'],
  ['impl_cultivator', '中耕'],
  ['impl_rotavator', '旋耕'],
  ['impl_fertilizer', '施肥'],
  ['impl_sprayer', '喷雾'],
  ['impl_haulm', '杀秧'],
  ['impl_bedder', '起垄'],
  ['harvester_potato', '薯收获'],
  ['harvester_combine', '联合收割'],
  ['harvester_cabbage', '结球收获'],
  ['drone_scout', '侦察'],
  ['drone_treat', '植保'],
];

export function addStageOp(doc, stageId) {
  const stage = String(stageId || 'A');
  const ids = new Set((doc.ops || []).map(op => op.id));
  let n = 1;
  while (ids.has('job' + n)) n += 1;
  const op = {
    id: 'job' + n,
    name: '新作业',
    kind: 'optional',
    via: null,
    stage,
    variant: null,
    requiresMask: stage !== 'O',
    requiresUnlocked: false,
    writesMask: false,
    locksUnswept: false,
    sweepDays: 1.4,
    machine: stage === 'D' ? 'harvester_potato' : 'impl_cultivator',
    drone: false,
  };
  doc.ops = doc.ops || [];
  doc.ops.push(op);
  return op;
}

export function removeStageOp(doc, opId) {
  doc.ops = (doc.ops || []).filter(op => op.id !== opId);
  return doc;
}

export function patchStageOp(doc, opId, patch) {
  const op = (doc.ops || []).find(item => item.id === opId);
  if (!op || !patch) return null;
  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (name) op.name = name;
  }
  if (patch.machine != null) {
    op.machine = String(patch.machine);
    op.drone = op.machine === 'drone_scout' || op.machine === 'drone_treat';
  }
  if (patch.stage != null) op.stage = String(patch.stage);
  if (patch.kind === 'required' || patch.kind === 'optional' || patch.kind === 'special') {
    op.kind = patch.kind;
    const required = patch.kind === 'required';
    op.extensions = { ...(op.extensions || {}), required };
  }
  if (patch.window === null) delete op.window;
  else if (patch.window && Number.isFinite(+patch.window.from) && Number.isFinite(+patch.window.to)) {
    op.window = { from: +patch.window.from, to: +patch.window.to };
  }
  return op;
}

export function stageById(doc, id) {
  return doc.stages.find(s => s.id === id) || null;
}

export function variantById(stage, id) {
  if (!stage || !id) return null;
  return stage.variants.find(v => v.id === id) || null;
}

export function appearanceOf(doc, phase, variantId) {
  const st = stageById(doc, phase) || doc.stages[0];
  const v = variantById(st, variantId);
  const ridgePts = (v && v.ridge) || st.ridge || doc.ridge;
  return {
    phase: st.id,
    variant: variantId || '',
    name: v ? v.name : st.name,
    color: (v && v.color) || st.color,
    canopy: (v && v.canopy) || st.canopy,
    roughness: (v && v.roughness != null) ? v.roughness : st.roughness,
    cover: (v && v.cover != null) ? v.cover : st.cover,
    plantScale: (v && v.plantScale != null) ? v.plantScale : st.plantScale,
    ridge: ridgePts,
  };
}

function durationOf(doc, cell) {
  const st = stageById(doc, cell.phase);
  if (!st) return 1;
  if (cell.variant) {
    const v = variantById(st, cell.variant);
    if (v && v.auto) return Math.max(0.25, Number(v.days) || 0.25);
  }
  return st.days;
}

function transitionU(age, dur, transition) {
  const mode = transition.template;
  if (mode === 'instant') return age >= dur ? 1 : 0;
  const windowDays = transition.span === 'full' ? dur : Math.min(dur, transition.windowDays);
  const start = dur - windowDays;
  if (age <= start) return 0;
  if (age >= dur) return 1;
  return (age - start) / Math.max(1e-6, dur - start);
}

function transitionOpen(doc, cell, u) {
  if (u <= 0) return false;
  if (u >= 1) return true;
  if (doc.transition.template === 'scatter') {
    return hash01(cell.row, cell.along, cell.phase.charCodeAt(0) + cell.variant.length) < u;
  }
  if (doc.transition.template === 'sweep') {
    return (cell.along + 0.5) / doc.grid.along <= u;
  }
  return false;
}

function autoEdge(doc, cell) {
  return doc.edges.find(e => {
    if (!e.enabled || e.when !== 'auto' || e.from !== cell.phase) return false;
    if (e.to === cell.phase && (e.toVariant || '') === (cell.variant || '')) return false;
    if (e.fromVariant === '*') return true;
    return (e.fromVariant || '') === (cell.variant || '');
  });
}

function naturalEdge(doc, cell) {
  if (cell.phase === 'D' || cell.phase === 'O' || cell.phase === 'E') return null;
  return doc.edges.find(e => e.enabled && e.when === 'natural' && e.from === cell.phase);
}

function commit(cell, edge, overflow, phaseChange) {
  if (phaseChange) {
    cell.phase = edge.to;
    cell.variant = edge.toVariant || '';
    cell.age = overflow;
    cell.variantAge = 0;
    return;
  }
  cell.variant = edge.toVariant || '';
  cell.variantAge = overflow;
}

function ageCell(doc, cell) {
  for (let guard = 0; guard < 6; guard++) {
    const edge = autoEdge(doc, cell) || naturalEdge(doc, cell);
    if (!edge) return;
    const phaseChange = edge.when === 'natural';
    const dur = durationOf(doc, cell);
    const time = phaseChange ? cell.age : (cell.variant ? cell.variantAge : cell.age);
    const u = transitionU(time, dur, doc.transition);
    if (!transitionOpen(doc, cell, u)) return;
    const overflow = time >= dur ? time - dur : 0;
    commit(cell, edge, overflow, phaseChange);
    if (edge.breaksMask) {
      cell.mask = false;
      cell.locked = false;
    }
  }
}

export function createSim(doc) {
  const rows = doc.rows;
  const along = doc.grid.along;
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let a = 0; a < along; a++) {
      cells.push({
        row, along: a, mask: false, locked: false,
        phase: 'O', variant: '', age: 0, variantAge: 0,
      });
    }
  }
  return { day: 0, cells, job: null, rows, along };
}

function eligibleCells(sim, doc, op) {
  const list = [];
  for (let row = 0; row < sim.rows; row++) {
    const cols = [];
    for (let a = 0; a < sim.along; a++) cols.push(sim.cells[row * sim.along + a]);
    if (row % 2 === 1) cols.reverse();
    for (const cell of cols) {
      if (op.stage !== '*' && cell.phase !== op.stage) continue;
      if (op.requiresMask && !cell.mask) continue;
      if (op.requiresUnlocked && (cell.locked || cell.mask)) continue;
      list.push(cell);
    }
  }
  return list;
}

export function startJob(sim, doc, opId, coverage = 1) {
  if (sim.job) return { ok: false, reason: 'busy' };
  const op = (doc.ops || []).find(item => item.id === opId);
  if (!op) return { ok: false, reason: 'op' };
  if (op.reserved) {
    const edge = doc.edges.find(e => e.enabled && e.via === op.via);
    if (!edge) return { ok: false, reason: 'edge' };
  }
  const pool = eligibleCells(sim, doc, op);
  const frac = Math.max(0, Math.min(1, Number(coverage) || 0));
  const n = frac <= 0 ? 0 : Math.max(1, Math.round(pool.length * frac));
  const chosen = pool.slice(0, Math.min(pool.length, n));
  if (!chosen.length) return { ok: false, reason: 'empty', op };
  const machine = doc.machines[op.machine] || { id: op.machine, name: op.machine, sweepHead: 1.2, sweepTail: -1.2 };
  sim.job = {
    opId: op.id,
    op,
    machine,
    queue: chosen.map(cell => cell.row * sim.along + cell.along),
    applied: 0,
    elapsed: 0,
    sweepDays: Math.max(0.2, Number(op.sweepDays) || 1),
    p: 0,
    cancelled: false,
  };
  return { ok: true, op, count: chosen.length };
}

function processEdge(doc, op, cell) {
  return doc.edges.find(e => e.enabled && e.when === 'process' && e.via === op.via && (e.from === '*' || e.from === cell.phase));
}

function applyOp(doc, cell, op) {
  if (op.kind === 'optional') {
    if (op.stage !== '*' && cell.phase !== op.stage) return false;
    if (op.requiresMask && !cell.mask) return false;
    cell.variant = op.variant || '';
    cell.variantAge = 0;
    return true;
  }
  const edge = processEdge(doc, op, cell);
  if (!edge) return false;
  cell.phase = edge.to;
  cell.variant = edge.toVariant || '';
  cell.age = 0;
  cell.variantAge = 0;
  if (op.writesMask || edge.to === 'A') cell.mask = true;
  if (edge.breaksMask || op.breaksMask) {
    cell.mask = edge.to === 'A';
    cell.locked = false;
  }
  if (op.writesMask) cell.locked = false;
  return true;
}

function finishJob(sim, doc) {
  const job = sim.job;
  if (!job) return;
  if (job.op.locksUnswept) {
    for (const cell of sim.cells) {
      if (!cell.mask) cell.locked = true;
    }
  }
  sim.job = null;
}

// 玩法取消工单的钩子。扫过的格子保留，播种会把没扫到的锁在蒙版外。
export function cancelWorkOrder(sim, doc) {
  if (!sim.job) return { ok: false, reason: 'idle' };
  sim.job.cancelled = true;
  const opId = sim.job.opId;
  finishJob(sim, doc || { ops: [] });
  return { ok: true, opId, hook: 'cancelWorkOrder' };
}

function stepJob(sim, doc, dt) {
  const job = sim.job;
  if (!job) return;
  job.elapsed += dt;
  const p = Math.min(job.queue.length, (job.elapsed / job.sweepDays) * job.queue.length);
  job.p = p;
  while (job.applied < job.queue.length && job.applied + 0.5 <= p + 1e-6) {
    const cell = sim.cells[job.queue[job.applied]];
    applyOp(doc, cell, job.op);
    job.applied += 1;
  }
  if (job.applied >= job.queue.length) finishJob(sim, doc);
}

function stepOnce(sim, doc, dt) {
  sim.day += dt;
  stepJob(sim, doc, dt);
  for (const cell of sim.cells) {
    cell.age += dt;
    cell.variantAge += dt;
    ageCell(doc, cell);
  }
}

export function stepSim(sim, doc, dtDays) {
  let left = Math.max(0, Number(dtDays) || 0);
  while (left > 1e-8) {
    const dt = Math.min(0.05, left);
    stepOnce(sim, doc, dt);
    left -= dt;
  }
  return sim;
}

export function dominant(sim) {
  const info = tally(sim);
  let phase = 'O';
  let n = -1;
  for (const [key, count] of Object.entries(info.phases)) {
    if (count > n) { phase = key; n = count; }
  }
  let variant = '';
  let vn = -1;
  for (const [key, count] of Object.entries(info.variants)) {
    const hit = key.startsWith(phase + '/') || key === phase;
    if (!hit || count <= vn) continue;
    vn = count;
    variant = key.includes('/') ? key.slice(phase.length + 1) : '';
  }
  return { phase, variant, ...info };
}

export function tally(sim) {
  const phases = {};
  const variants = {};
  let mask = 0;
  let locked = 0;
  for (const cell of sim.cells) {
    phases[cell.phase] = (phases[cell.phase] || 0) + 1;
    const key = cell.variant ? cell.phase + '/' + cell.variant : cell.phase;
    variants[key] = (variants[key] || 0) + 1;
    if (cell.mask) mask += 1;
    if (cell.locked) locked += 1;
  }
  return { phases, variants, mask, locked, total: sim.cells.length, day: sim.day, job: sim.job ? { opId: sim.job.opId, applied: sim.job.applied, count: sim.job.queue.length, p: sim.job.p } : null };
}

export function setGrowthChain(doc, middleIds) {
  const prev = new Set(doc.chain || []);
  const nextMiddle = middleIds || [];
  const next = new Set(['A', ...nextMiddle, 'D']);
  if (Number.isFinite(+doc.cycle)) {
    let delta = 0;
    for (const id of prev) {
      if (next.has(id) || id === 'O' || id === 'E') continue;
      delta -= Number(stageById(doc, id)?.days) || 0;
    }
    for (const id of next) {
      if (prev.has(id) || id === 'O' || id === 'E') continue;
      delta += Number(stageById(doc, id)?.days) || 0;
    }
    doc.cycle = Math.round((+doc.cycle + delta) * 100) / 100;
  }
  doc.chain = ['A', ...nextMiddle, 'D'];
  return rebuildNaturalEdges(doc);
}

export function insertGrowthStage(doc, afterId) {
  let n = 1;
  while (doc.stages.some(s => s.id === 'X' + n)) n += 1;
  const id = 'X' + n;
  const after = stageById(doc, afterId) || stageById(doc, 'A');
  const atStage = Math.max(0, doc.stages.findIndex(s => s.id === 'D'));
  if (Number.isFinite(+doc.cycle)) doc.cycle = Math.round((+doc.cycle + 6) * 100) / 100;
  doc.stages.splice(atStage, 0, stage({
    id, name: '插入阶段', kind: 'growth', days: 6, optional: true, inserted: true,
    color: after.color, canopy: after.canopy, roughness: after.roughness,
    cover: Math.min(1, after.cover + 0.1), plantScale: Math.min(1.2, after.plantScale + 0.1),
  }));
  const mid = doc.chain.slice(1, -1);
  if (afterId === 'A') mid.unshift(id);
  else {
    const at = mid.indexOf(afterId);
    if (at >= 0) mid.splice(at + 1, 0, id);
    else mid.push(id);
  }
  doc.chain = ['A', ...mid, 'D'];
  return rebuildNaturalEdges(doc);
}

export function removeGrowthStage(doc, id) {
  if (id === 'A' || id === 'D' || id === 'O' || id === 'E') return doc;
  const gone = stageById(doc, id);
  const days = gone ? Number(gone.days) || 0 : 0;
  const onChain = (doc.chain || []).includes(id);
  doc.stages = doc.stages.filter(s => s.id !== id);
  doc.chain = doc.chain.filter(x => x !== id);
  doc.ops = (doc.ops || []).filter(op => op.stage !== id);
  if (onChain && Number.isFinite(+doc.cycle)) doc.cycle = Math.round((+doc.cycle - days) * 100) / 100;
  return rebuildNaturalEdges(doc);
}
