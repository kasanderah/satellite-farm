// 框架 B · 最小闭环
// 整地和种植是两条平行的阶段链。硬作业锁住整块田，做完才改地面样子。
// 作业进行中可以按幅宽扫过下一道样子；做完蒙版拿掉，整块定稿。
// 软作业挂在阶段上，只报完成或错过，不写下一阶段。窗口过了记过期，不锁田。
// 硬作业进行中按 look 扫过田面，做完才整块换成这个样子。
// brush.enabled 只给可选刷色，默认关。打开时，软作业做完留下一层刷色，再按世界日淡掉，不改阶段 look。
// 有时长的阶段用 display 的起止色，按本阶段成长时间插值，跨阶段接得上，不瞬切。
// 生长和软窗记世界日。stepFarm 仍收真实秒，只在钟的边界换算。

import { DAY_SECONDS } from './world-clock.js';

export const HUB_PLOT = 'C0';

export const MACHINE_CLASSES = {
  self: { id: 'self', name: '自走机', power: 'output' },
  hitch: { id: 'hitch', name: '拖挂', power: 'demand' },
  air: { id: 'air', name: '飞行机', power: 'output' },
};

// 能力键用中文名。以后的联合覆盖按这个表对齐，这一刀不排挂具顺序。
export const CAPABILITIES = {
  犁田: { id: '犁田', name: '犁田' },
  播种: { id: '播种', name: '播种' },
  收割: { id: '收割', name: '收割' },
  收拾: { id: '收拾', name: '收拾' },
  追肥: { id: '追肥', name: '追肥' },
  培土: { id: '培土', name: '培土' },
};

export const GROUNDS = {
  raw: { id: 'raw', name: '未整地' },
  general: { id: 'general', name: '一般田地' },
};

// look 为「不影响」时，这道作业自己不充当阶段样子。
// 硬作业的进行中扫色用 look，不看 brush.enabled。
// brush 是另外的可选刷色，默认关。关着时软作业不扫，做完也不写入田面。
const BRUSH_OFF = { enabled: false };
export const JOBS = {
  plow: { id: 'plow', name: '犁地', kind: 'hard', caps: ['犁田'], look: 'general', brush: { ...BRUSH_OFF, look: 'general' } },
  sow: { id: 'sow', name: '播种', kind: 'hard', caps: ['播种'], look: 'sown', brush: { ...BRUSH_OFF, look: 'sown' } },
  harvest: { id: 'harvest', name: '收割', kind: 'hard', caps: ['收割'], look: 'harvested', brush: { ...BRUSH_OFF, look: 'harvested' } },
  tidy: { id: 'tidy', name: '收拾', kind: 'hard', caps: ['收拾'], look: 'general', brush: { ...BRUSH_OFF, look: 'general' } },
  topdress: { id: 'topdress', name: '追肥', kind: 'soft', caps: ['追肥'], look: '不影响', brush: { ...BRUSH_OFF, look: 'mature' } },
  hill: { id: 'hill', name: '培土', kind: 'soft', caps: ['培土'], look: '不影响', brush: { ...BRUSH_OFF, look: 'mature' } },
};

export const PREP_RECIPES = {
  clear_general: {
    id: 'clear_general',
    name: '清地',
    target: 'general',
    targetName: '一般田地',
    steps: ['plow'],
  },
};

export const GROW_DAYS = 12;
// 1× 下的现实秒。12 世界日前段 × 720 现实秒/世界日。烂地和收获后不计入。
export const GROW_SECONDS = GROW_DAYS * DAY_SECONDS;
// 回库待机 1 世界日。和世界钟同一口：1× 下 1 世界日 = 12 现实分钟。
export const STANDBY_DAYS = 1;
export const STANDBY_SECONDS = STANDBY_DAYS * DAY_SECONDS;

export const PLANT_CROPS = {
  lastika: {
    id: 'lastika',
    name: '拉斯提卡',
    grounds: ['general'],
    growDays: GROW_DAYS,
    growSeconds: GROW_SECONDS,
    yieldBase: 100,
    qualityBase: 1,
    // 100% 跟收获硬窗起点走，不另记一条日数。超过 maxHarvest 不能开工收获。
    maturity: { maxHarvest: 120, rotLine: 120 },
    visual: { shape: 'bush', tex: 'ridges', height: 0.7, row: 0.75, along: 0.36 },
    graph: {
      entry: { job: 'sow', to: 'seedling' },
      edges: [
        { from: 'seedling', to: 'develop', kind: 'natural' },
        { from: 'develop', to: 'mature', kind: 'natural' },
        { from: 'mature', to: 'after', kind: 'hard', job: 'harvest' },
        { from: 'mature', to: 'rot', kind: 'natural' },
        { from: 'rot', to: 'exit', kind: 'hard', job: 'tidy' },
        { from: 'after', to: 'exit', kind: 'hard', job: 'tidy' },
      ],
    },
    stages: [
      { id: 'seedling', name: '青苗', role: 'head', kind: 'time', look: 'sown', days: 2, color: '#51542c', display: { from: { color: '#4a4844', cover: 0.16 }, to: { color: '#51542c', cover: 0.42 } }, jobs: [] },
      { id: 'develop', name: '发育', role: 'node', kind: 'time', look: 'sown', days: 6, color: '#6a7340', display: { from: { color: '#51542c', cover: 0.42 }, to: { color: '#6a7340', cover: 0.72 } }, jobs: [
        { job: 'topdress', kind: 'soft', name: '追肥', from: 5, to: 6, yieldMul: 2 },
      ] },
      { id: 'mature', name: '成熟', role: 'node', kind: 'time', look: 'mature', days: 4, color: '#787c32', display: { from: { color: '#6a7340', cover: 0.72 }, to: { color: '#787c32', cover: 0.95 } }, jobs: [
        { job: 'hill', kind: 'soft', name: '培土', from: 8, to: 10, qualityAdd: 1 },
        { job: 'harvest', kind: 'hard', name: '收获', from: 11, to: 12 },
      ] },
      { id: 'rot', name: '烂地', role: 'rot', kind: 'rot', look: 'rot', color: '#5c4636', jobs: [
        { job: 'tidy', kind: 'hard', name: '收拾', full: true },
      ] },
      { id: 'after', name: '收获后', role: 'tail', kind: 'tail', look: 'harvested', color: '#b59a63', jobs: [
        { job: 'tidy', kind: 'hard', name: '收拾', full: true },
      ] },
    ],
  },
};

export const OMNI = {
  id: 'omni',
  classId: 'self',
  className: '自走机',
  integral: true,
  name: '万能农机',
  caps: ['犁田', '播种', '收割', '收拾', '追肥', '培土'],
  origin: 3.2,
  width: 16,
  workSpeed: 18,
  cruiseSpeed: 28,
  powerOutKw: 80,
  energy: 'electric',
  energyKwh: 180,
};

// 拖拉机自己不带作业能力，犁挂上去才有犁田。幅宽乘速度低于一体机，一体机空闲时不会抢它的活。
export const TRACTOR = {
  id: 'tractor',
  classId: 'self',
  className: '自走机',
  integral: false,
  name: '拖拉机',
  caps: [],
  origin: 2.4,
  width: 3,
  workSpeed: 12,
  cruiseSpeed: 20,
  powerOutKw: 55,
  energy: 'electric',
  energyKwh: 140,
};

export const PLOW = {
  id: 'plow',
  classId: 'hitch',
  className: '拖挂',
  name: '犁',
  caps: ['犁田'],
  width: 12,
  origin: 1.8,
  powerNeedKw: 35,
};

export function plotAddress(i, j, originI, originJ) {
  const x = i - originI;
  const y = j - originJ;
  return { hub: HUB_PLOT, x, y, code: `P(${x},${y})` };
}

export const BRUSH_FADE_DAYS = 2;

function hexRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return [81, 84, 44];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mixHex(a, b, t) {
  const u = Math.min(1, Math.max(0, t));
  const A = hexRgb(a);
  const B = hexRgb(b);
  const n = i => Math.round(A[i] + (B[i] - A[i]) * u).toString(16).padStart(2, '0');
  return `#${n(0)}${n(1)}${n(2)}`;
}

// 有时长的阶段：起点接到上一段终点，终点是本段 color。返回着色器的三段累计日和四节颜色。
export function stageDisplayStops(crop) {
  const timed = (crop?.stages || []).filter(stage => Number(stage.days) > 0);
  const colors = [];
  const covers = [];
  const stops = [];
  let prevColor = null;
  let prevCover = null;
  let acc = 0;
  for (const stage of timed) {
    const fromColor = stage.display?.from?.color || prevColor || stage.color || '#51542c';
    const toColor = stage.display?.to?.color || stage.color || fromColor;
    const fromCover = stage.display?.from?.cover ?? prevCover ?? 0.16;
    const toCover = stage.display?.to?.cover ?? fromCover;
    if (!colors.length) {
      colors.push(fromColor);
      covers.push(fromCover);
    }
    colors.push(toColor);
    covers.push(toCover);
    acc += Number(stage.days);
    stops.push(acc);
    prevColor = toColor;
    prevCover = toCover;
  }
  while (stops.length < 3) {
    stops.push(stops.at(-1) || 1);
    colors.push(colors.at(-1) || '#51542c');
    covers.push(covers.at(-1) ?? 0.5);
  }
  return { stops: stops.slice(0, 3), colors: colors.slice(0, 4), covers: covers.slice(0, 4) };
}

export function stageTint(crop, age) {
  const { stops, colors, covers } = stageDisplayStops(crop);
  const day = Math.max(0, age || 0);
  let t = 0;
  let a = colors[0];
  let b = colors[1];
  let ca = covers[0];
  let cb = covers[1];
  if (day <= stops[0]) t = day / Math.max(stops[0], 1e-6);
  else if (day <= stops[1]) {
    t = (day - stops[0]) / Math.max(stops[1] - stops[0], 1e-6);
    a = colors[1]; b = colors[2]; ca = covers[1]; cb = covers[2];
  } else {
    t = (day - stops[1]) / Math.max(stops[2] - stops[1], 1e-6);
    a = colors[2]; b = colors[3]; ca = covers[2]; cb = covers[3];
  }
  t = Math.min(1, Math.max(0, t));
  return { color: mixHex(a, b, t), cover: ca + (cb - ca) * t };
}

export function stageShadeG(field) {
  const crop = cropOfPlant(field);
  const stage = stageOf(crop, field?.plant?.stageId);
  if (crop && stage && Number(stage.days) > 0) {
    const cycle = cycleDays(crop) || 1;
    const age = Math.min(cycle, Math.max(0, growthAge(field)));
    return 2 + Math.min(0.999, age / cycle) * 3;
  }
  return lookG(field?.look, field?.heldFrac || 0);
}

export function lookG(look, growFrac = 0) {
  if (look === 'raw') return 0;
  if (look === 'general') return 1;
  if (look === 'sown') return 2 + Math.min(0.999, Math.max(0, growFrac)) * 3;
  if (look === 'mature') return 5;
  if (look === 'harvested') return 7;
  if (look === 'rot') return 8;
  return null;
}

// 空闲和做完：mask -1，整块一个颜色。作业中 sweep 把机具幅宽和趟进度交给着色器，next 是扫过之后的样子。
// 没下过第一道活的田 look 是 hold，空闲仍留开局定格冠层。犁地开工不换底：keep 表示未扫过继续用那套填充，扫过才换成下一道。做完整块才定稿。
export function fieldShader(unit) {
  if (!unit) return null;
  const sweep = unit.sweep;
  const sweeping = !!(sweep && sweep.width > 0);
  const g = unit.timed
    ? 2 + Math.min(0.999, Math.max(0, (unit.age || 0) / (unit.cycle || 1))) * 3
    : lookG(unit.look, unit.growFrac || 0);
  if (g == null && !sweeping) return null;
  if (!sweeping && unit.stageFade && unit.stageFade.span > 0 && unit.stageFade.left > 0) {
    const amt = Math.min(1, unit.stageFade.left / unit.stageFade.span);
    return { g: unit.stageFade.toG, fromG: unit.stageFade.fromG, mask: -5 - amt, next: null };
  }
  if (!sweeping && unit.brushFade && unit.brushFade.span > 0 && unit.brushFade.left > 0) {
    const amt = Math.min(1, unit.brushFade.left / unit.brushFade.span);
    return { g: g == null ? 2 : g, mask: -2 - amt, next: null };
  }
  if (sweeping) {
    const widthDm = Math.max(1, Math.round(sweep.width * 10));
    const along = Math.max(0, Math.min(1, sweep.alongFrac || 0));
    const prog = (sweep.pass || 0) + along;
    const nextG = lookG(sweep.look, 0);
    const next = nextG == null ? (g == null ? 0 : g) : nextG;
    const mask = widthDm * 100 + prog;
    if (g == null) return { keep: true, mask, next };
    return { g, mask, next };
  }
  return { g, mask: -1 };
}

export const TURN_SECONDS = 1.35;

export function hitchStub() {
  return {
    id: 'hitch-stub',
    classId: 'hitch',
    className: '拖挂',
    name: '挂具占位',
    caps: [],
    powerNeedKw: 0,
  };
}

export function createFarm() {
  return {
    fields: new Map(),
    machines: [],
    orders: [],
    queue: [],
    events: [],
    seq: 1,
  };
}

export function addField(farm, spec) {
  const field = {
    id: spec.id,
    length: spec.length > 0 ? spec.length : 128,
    width: spec.width > 0 ? spec.width : 128,
    ground: spec.ground || 'raw',
    look: spec.look || 'raw',
    plot: spec.plot || null,
    prep: null,
    plant: null,
    lock: null,
  };
  farm.fields.set(field.id, field);
  return field;
}

export function addMachine(farm, spec) {
  const machine = {
    id: spec.id,
    classId: spec.classId,
    className: spec.className,
    integral: !!spec.integral,
    name: spec.name,
    caps: spec.caps.slice(),
    origin: spec.origin || 0,
    width: spec.width,
    workSpeed: spec.workSpeed,
    cruiseSpeed: spec.cruiseSpeed || spec.workSpeed,
    powerOutKw: spec.powerOutKw || 0,
    powerNeedKw: spec.powerNeedKw || 0,
    energy: spec.energy || null,
    energyKwh: spec.energyKwh || 0,
    energyLeft: spec.energyLeft != null ? spec.energyLeft : (spec.energyKwh || 0),
    hitchId: spec.hitchId || null,
    hostId: spec.hostId || null,
    busy: false,
  };
  farm.machines.push(machine);
  return machine;
}

export function mountHitch(farm, hitchId, hostId) {
  const hitch = farm.machines.find(m => m.id === hitchId);
  const host = farm.machines.find(m => m.id === hostId);
  if (!hitch || hitch.classId !== 'hitch') return { ok: false, reason: 'hitch' };
  if (!host || host.classId !== 'self') return { ok: false, reason: 'host' };
  if (hitch.hostId) return { ok: false, reason: 'mounted' };
  if ((host.powerOutKw || 0) < (hitch.powerNeedKw || 0)) return { ok: false, reason: 'power' };
  hitch.hostId = host.id;
  host.hitchId = hitch.id;
  return { ok: true };
}

function sparePlow(farm) {
  return farm.machines.find(m => m.classId === 'hitch' && m.caps.includes('犁田') && !m.hostId) || null;
}

function freeTractor(farm) {
  return farm.machines.find(m => m.classId === 'self' && !m.integral && !m.hitchId && (m.powerOutKw || 0) >= (PLOW.powerNeedKw || 0)) || null;
}

// 商店买进的拖拉机、犁、万能农机。拖拉机自己没有犁田，犁挂上才有。
export function installPlayerMachine(farm, kind, rigId) {
  if (!farm || rigId == null) return null;
  if (kind === 'omni') {
    const id = farm.machines.some(m => m.id === OMNI.id) ? `omni-${rigId}` : OMNI.id;
    addMachine(farm, { ...OMNI, id, caps: OMNI.caps.slice(), energyLeft: OMNI.energyKwh });
    return { id, role: '自走一体', caps: OMNI.caps.slice(), width: OMNI.width, hitchId: null, mounted: false };
  }
  if (kind === 'tractor') {
    const id = farm.machines.some(m => m.id === TRACTOR.id) ? `tractor-${rigId}` : TRACTOR.id;
    addMachine(farm, { ...TRACTOR, id, caps: TRACTOR.caps.slice(), energyLeft: TRACTOR.energyKwh });
    const plow = sparePlow(farm);
    if (plow && mountHitch(farm, plow.id, id).ok) {
      return { id, role: '拖拉机+犁', caps: PLOW.caps.slice(), width: PLOW.width, hitchId: plow.id, mounted: true };
    }
    return { id, role: '拖拉机', caps: [], width: TRACTOR.width, hitchId: null, mounted: false };
  }
  if (kind === 'plow') {
    const id = `plow-${rigId}`;
    addMachine(farm, { ...PLOW, id, caps: PLOW.caps.slice() });
    const host = freeTractor(farm);
    if (host && mountHitch(farm, id, host.id).ok) {
      return { id, role: '犁', caps: PLOW.caps.slice(), width: PLOW.width, hitchId: id, hostId: host.id, mounted: true };
    }
    return { id, role: '犁', caps: PLOW.caps.slice(), width: PLOW.width, hitchId: id, hostId: null, mounted: false };
  }
  return null;
}

export function removePlayerMachine(farm, machineId) {
  const machine = farm.machines.find(m => m.id === machineId);
  if (!machine) return { ok: true };
  if (machine.busy) return { ok: false, reason: 'busy' };
  if (machine.classId === 'hitch') {
    const host = farm.machines.find(m => m.hitchId === machine.id);
    if (host?.busy) return { ok: false, reason: 'busy' };
    if (host) host.hitchId = null;
    machine.hostId = null;
    farm.machines = farm.machines.filter(m => m.id !== machine.id);
    return { ok: true, hostId: host?.id || null };
  }
  if (farm.orders.some(order => order.machineId === machine.id || order.hitchId === machine.hitchId)) {
    return { ok: false, reason: 'busy' };
  }
  if (machine.hitchId) {
    const hitch = farm.machines.find(m => m.id === machine.hitchId);
    if (hitch) hitch.hostId = null;
    machine.hitchId = null;
  }
  farm.machines = farm.machines.filter(m => m.id !== machine.id);
  return { ok: true };
}

function pushEvent(farm, ev) {
  farm.events.push(ev);
  if (farm.events.length > 40) farm.events.shift();
}

// 入仓由外层接到现有 warehouse。框架 B 不直接持有仓库数组。
let harvestSink = null;
export function setHarvestSink(fn) {
  harvestSink = typeof fn === 'function' ? fn : null;
}

function queued(farm, fieldId) {
  return farm.queue.some(item => item.fieldId === fieldId);
}

function fieldLocked(farm, field) {
  return !!field.lock || queued(farm, field.id);
}

function clearCrop(farm, field) {
  const fullAt = PLANT_CROPS[field.plant?.cropId]?.maturity?.fullAt || 10;
  field.heldFrac = field.plant
    ? Math.min(0.999, Math.max(0, growthAge(field) / fullAt))
    : (field.heldFrac || 0);
  for (const order of [...farm.orders]) {
    if (order.fieldId === field.id) releaseOrder(farm, order);
  }
  farm.queue = farm.queue.filter(item => item.fieldId !== field.id);
  field.lock = null;
  field.plant = null;
  field.prep = null;
}

export function requestPrep(farm, fieldId, recipeId = 'clear_general') {
  const field = farm.fields.get(fieldId);
  const recipe = PREP_RECIPES[recipeId];
  if (!field || !recipe) return { ok: false, reason: 'field' };
  const clearing = !!field.plant;
  if (!clearing && field.ground === recipe.target) return { ok: true, skipped: true, ground: field.ground };
  const job = JOBS[recipe.steps[0]];
  if (capableCount(farm, job.caps) < 1) return { ok: false, reason: 'machine' };
  if (clearing) clearCrop(farm, field);
  if (fieldLocked(farm, field)) return { ok: false, reason: 'lock' };
  field.prep = { recipeId: recipe.id, step: 0 };
  farm.queue.push({ id: farm.seq++, fieldId, jobId: job.id, caps: job.caps.slice(), lane: 'prep' });
  pushEvent(farm, { type: 'request', lane: 'prep', fieldId, recipeId: recipe.id, jobId: job.id });
  dispatch(farm);
  return { ok: true, queued: true, jobId: job.id };
}

function planReady(farm, field, crop) {
  if (!field || !crop || field.plant || field.prep || field.lock) return false;
  if (queued(farm, field.id)) return false;
  if (farm.orders.some(order => order.fieldId === field.id)) return false;
  return crop.grounds.includes(field.ground);
}

// 种植计划层：只在已整好、或尾阶段收拾后的就绪空地上，把下一轮作物写成播种工单。
function issuePlant(farm, field, crop) {
  if (!field || !crop) return { ok: false, reason: 'crop' };
  if (field.plant) return { ok: false, reason: 'busy' };
  if (fieldLocked(farm, field)) return { ok: false, reason: 'lock' };
  if (!crop.grounds.includes(field.ground)) return { ok: false, reason: 'ground' };
  const job = JOBS[crop.graph.entry.job];
  if (!job) return { ok: false, reason: 'crop' };
  if (capableCount(farm, job.caps) < 1) return { ok: false, reason: 'machine' };
  field.plant = {
    cropId: crop.id,
    index: 0,
    stageId: crop.graph.entry.job,
    grow: 0,
    need: 0,
    clock: false,
    yieldMul: 1,
  };
  if (field.nextCrop === crop.id) field.nextCrop = null;
  farm.queue.push({ id: farm.seq++, fieldId: field.id, jobId: job.id, caps: job.caps.slice(), lane: 'plant' });
  pushEvent(farm, { type: 'request', lane: 'plant', fieldId: field.id, cropId: crop.id, jobId: job.id });
  dispatch(farm);
  return { ok: true, queued: true, jobId: job.id };
}

function applyPlans(farm) {
  const issued = [];
  for (const field of farm.fields.values()) {
    const crop = PLANT_CROPS[field.nextCrop];
    if (!crop || !planReady(farm, field, crop)) continue;
    const result = issuePlant(farm, field, crop);
    if (result.ok) issued.push(field.id);
  }
  return issued;
}

export function setNextCrop(farm, fieldId, cropId) {
  const field = farm.fields.get(fieldId);
  if (!field) return { ok: false, reason: 'field' };
  if (cropId == null || cropId === '') {
    field.nextCrop = null;
    return { ok: true, cleared: true };
  }
  const crop = PLANT_CROPS[cropId];
  if (!crop) return { ok: false, reason: 'crop' };
  field.nextCrop = crop.id;
  pushEvent(farm, { type: 'plan', fieldId, cropId: crop.id });
  const issued = applyPlans(farm);
  const queued = issued.includes(field.id);
  const waiting = !queued && !!field.nextCrop;
  return {
    ok: true,
    cropId: crop.id,
    queued,
    waiting,
    reason: waiting && planReady(farm, field, crop) ? 'machine' : null,
  };
}

export function requestPlant(farm, fieldId, cropId = 'lastika') {
  const field = farm.fields.get(fieldId);
  const crop = PLANT_CROPS[cropId];
  if (!field || !crop) return { ok: false, reason: 'crop' };
  return issuePlant(farm, field, crop);
}

function hitchOf(farm, machine) {
  if (!machine?.hitchId) return null;
  return farm.machines.find(m => m.id === machine.hitchId) || null;
}

function coveredBy(farm, machine, caps) {
  if (!machine || machine.classId === 'hitch' || machine.classId === 'air') return null;
  const hitch = hitchOf(farm, machine);
  const have = new Set(machine.caps);
  if (hitch) for (const cap of hitch.caps) have.add(cap);
  if (!caps.every(cap => have.has(cap))) return null;
  const fromHitch = caps.some(cap => !machine.caps.includes(cap));
  const width = fromHitch ? hitch?.width : machine.width;
  const origin = fromHitch ? (hitch?.origin || 0) : (machine.origin || 0);
  if (!(width > 0) || !(machine.workSpeed > 0)) return null;
  return {
    hitch,
    fromHitch,
    width,
    origin,
    // 这一单需要的能力全在车身上，才算一体。不看机型名字。
    integral: caps.every(cap => machine.caps.includes(cap)),
  };
}

// 机队里有几台结构上能做这组能力。忙闲不算，稀缺按这个数排。
function capableCount(farm, caps) {
  let count = 0;
  for (const machine of farm.machines) {
    if (coveredBy(farm, machine, caps)) count += 1;
  }
  return count;
}

// 自走机身体上的能力，加上已经挂住的拖挂。拖挂和飞行机不能单独出工。
// travelOf(machineId) 是到田的空跑时间，只在幅宽×速度打平的时候用来拆开。
export function chooseMachine(farm, caps, travelOf = null) {
  const need = caps || [];
  let best = null;
  for (const machine of farm.machines) {
    if (machine.busy || machine.hold || machine.standby > 0 || machine.recall) continue;
    const covered = coveredBy(farm, machine, need);
    if (!covered) continue;
    if (covered.hitch?.busy) continue;
    if (machine.energyLeft <= 0 && machine.energy) continue;
    const travel = travelOf ? travelOf(machine.id) : 0;
    const offer = {
      id: machine.id,
      machine,
      hitchId: covered.fromHitch ? covered.hitch.id : null,
      width: covered.width,
      origin: covered.origin,
      score: covered.width * machine.workSpeed,
      integral: covered.integral,
      travel: Number.isFinite(travel) ? travel : 0,
    };
    if (!best) { best = offer; continue; }
    if (offer.integral !== best.integral) {
      if (offer.integral) best = offer;
      continue;
    }
    if (offer.score !== best.score) {
      if (offer.score > best.score) best = offer;
      continue;
    }
    if (offer.travel < best.travel) best = offer;
  }
  return best;
}

function dispatch(farm, env = null) {
  // 调度只派队列里已有的工单，不决定下一种什么。下一轮作物由种植计划写成播种工单后再进这里。
  // 队列只放各田的下一刀。每轮按能做的机越少越先配，不再按入队先后挑车。
  const live = [];
  for (const item of farm.queue) {
    const field = farm.fields.get(item.fieldId);
    if (!field || field.lock) continue;
    if (farm.orders.some(order => order.fieldId === item.fieldId)) continue;
    live.push(item);
  }
  live.sort((a, b) => {
    const diff = capableCount(farm, a.caps) - capableCount(farm, b.caps);
    if (diff) return diff;
    return a.id - b.id;
  });
  const waiting = [];
  for (const item of live) {
    const field = farm.fields.get(item.fieldId);
    if (farm.orders.some(order => order.fieldId === item.fieldId)) {
      waiting.push(item);
      continue;
    }
    const best = chooseMachine(farm, item.caps, (machineId) => {
      if (!env?.travel) return 0;
      const value = env.travel(farm, item.fieldId, machineId);
      return Number.isFinite(value) ? value : 0;
    });
    if (!best) {
      waiting.push(item);
      continue;
    }
    const job = JOBS[item.jobId];
    const soft = job?.kind === 'soft';
    const order = {
      id: farm.seq++,
      fieldId: field.id,
      jobId: item.jobId,
      machineId: best.id,
      hitchId: best.hitchId,
      lane: item.lane,
      width: best.width,
      origin: best.origin,
      progress: 0,
      phase: 'cruise',
      pose: null,
    };
    writePose(farm, order);
    if (!soft) field.lock = order.id;
    best.machine.busy = true;
    if (best.hitchId) {
      const hitch = farm.machines.find(m => m.id === best.hitchId);
      if (hitch) hitch.busy = true;
    }
    farm.orders.push(order);
    pushEvent(farm, { type: 'dispatch', fieldId: field.id, jobId: item.jobId, machineId: best.id, hitchId: best.hitchId, width: order.width, origin: order.origin });
  }
  farm.queue = waiting;
}

function passesOf(order, field) {
  const span = order.width > 0 ? order.width : field.width;
  return Math.max(1, Math.ceil(field.width / span));
}

function metersOf(order, field) {
  return passesOf(order, field) * field.length;
}

export function poseAlong(field, order, progress) {
  const span = order.width;
  const passes = passesOf(order, field);
  const travel = Math.max(0, Math.min(1, progress)) * metersOf(order, field);
  const pass = Math.min(passes - 1, Math.floor(travel / field.length + 1e-9));
  let along = travel - pass * field.length;
  if (along < 0) along = 0;
  if (along > field.length) along = field.length;
  const forward = pass % 2 === 0;
  const uWork = forward ? along : field.length - along;
  const u = forward ? uWork - order.origin : uWork + order.origin;
  const v = Math.min(field.width - span * 0.5, (pass + 0.5) * span);
  return {
    u, v, pass, passes, heading: forward ? 0 : Math.PI,
    progress, width: order.width, origin: order.origin,
    along, alongFrac: field.length > 0 ? along / field.length : 0,
  };
}

export function writePose(farm, order, progress = order.progress) {
  const field = farm.fields.get(order.fieldId);
  order.pose = poseAlong(field, order, progress);
  return order.pose;
}

function endOfPassPose(field, order, pass) {
  const span = order.width;
  const forward = pass % 2 === 0;
  const along = field.length;
  const uWork = forward ? along : 0;
  const u = forward ? uWork - order.origin : uWork + order.origin;
  const v = Math.min(field.width - span * 0.5, (pass + 0.5) * span);
  return {
    u, v, pass, passes: passesOf(order, field),
    heading: forward ? 0 : Math.PI,
    progress: ((pass + 1) * field.length) / metersOf(order, field),
    width: order.width, origin: order.origin,
    along, alongFrac: 1,
  };
}

function beginTurn(order, field, pass) {
  const boundary = (pass + 1) * field.length / metersOf(order, field);
  order.progress = boundary;
  order.turnFrom = endOfPassPose(field, order, pass);
  order.turnTo = poseAlong(field, order, boundary);
  order.pose = order.turnFrom;
  order.phase = 'turn';
  order.turnT = 0;
}

function passIndex(order, field) {
  const travel = order.progress * metersOf(order, field);
  const passes = passesOf(order, field);
  return Math.min(passes - 1, Math.floor(travel / field.length + 1e-9));
}

function orderMachine(farm, order) {
  return farm.machines.find(m => m.id === order.machineId);
}

function secondsLeft(farm, order) {
  const field = farm.fields.get(order.fieldId);
  const machine = orderMachine(farm, order);
  const remain = (1 - order.progress) * metersOf(order, field);
  return remain / machine.workSpeed;
}

function secondsToTurn(farm, order) {
  const field = farm.fields.get(order.fieldId);
  const machine = orderMachine(farm, order);
  if (!field || !machine || order.phase !== 'work') return Infinity;
  const passes = passesOf(order, field);
  const cur = passIndex(order, field);
  if (cur >= passes - 1) return Infinity;
  const remain = (cur + 1) * field.length - order.progress * metersOf(order, field);
  if (remain <= 1e-3) return 0;
  return remain / machine.workSpeed;
}

function advanceWork(farm, order, slice) {
  const field = farm.fields.get(order.fieldId);
  const machine = orderMachine(farm, order);
  const total = metersOf(order, field);
  const travel0 = order.progress * total;
  const travel1 = Math.min(total, travel0 + machine.workSpeed * slice);
  const passes = passesOf(order, field);
  const cur = Math.min(passes - 1, Math.floor(travel0 / field.length + 1e-9));
  if (cur < passes - 1) {
    const boundaryTravel = (cur + 1) * field.length;
    if (travel1 >= boundaryTravel - 1e-3) {
      beginTurn(order, field, cur);
      if (machine.powerOutKw > 0) machine.energyLeft = Math.max(0, machine.energyLeft - machine.powerOutKw * slice / 3600);
      return;
    }
  }
  order.progress = travel1 / total;
  writePose(farm, order);
  if (machine.powerOutKw > 0) machine.energyLeft = Math.max(0, machine.energyLeft - machine.powerOutKw * slice / 3600);
}

export function workSweepLook(job) {
  if (!job) return null;
  if (job.kind === 'hard' && job.look && job.look !== '不影响') return job.look;
  const brush = job.brush;
  if (brush?.enabled && brush.look && brush.look !== '不影响') return brush.look;
  return null;
}

function applyLook(field, job) {
  if (!job || !job.look || job.look === '不影响') return false;
  field.look = job.look;
  field.heldFrac = 0;
  field.brushFade = null;
  return true;
}

// 只有 brush.enabled 时才留下软刷色。不改阶段 look，残留按世界日淡出。
function commitSweep(field, job) {
  const brush = job?.brush;
  if (!field || !brush?.enabled || !brush.look || brush.look === '不影响') return null;
  if (lookG(brush.look) == null) return null;
  field.brushFade = { look: brush.look, left: BRUSH_FADE_DAYS, span: BRUSH_FADE_DAYS };
  return brush.look;
}

function fadeBrush(farm, dt) {
  const days = dt / DAY_SECONDS;
  if (!(days > 0)) return;
  for (const field of farm.fields.values()) {
    if (!field.brushFade) continue;
    field.brushFade.left -= days;
    if (!(field.brushFade.left > 1e-4)) field.brushFade = null;
  }
}

// 自然进阶段后的第一世界日。和软刷色不是一条：刷色仍只在 brush.enabled 时写。
function fadeStage(farm, dt) {
  const days = dt / DAY_SECONDS;
  if (!(days > 0)) return;
  for (const field of farm.fields.values()) {
    if (!field.stageFade) continue;
    field.stageFade.left -= days;
    if (!(field.stageFade.left > 1e-4)) field.stageFade = null;
  }
}

function cropOfPlant(field) {
  return field?.plant ? PLANT_CROPS[field.plant.cropId] : null;
}

function stageOf(crop, id) {
  return crop?.stages.find(stage => stage.id === id) || null;
}

function edgesFrom(crop, id) {
  return (crop?.graph?.edges || []).filter(edge => edge.from === id);
}

export function cycleDays(crop) {
  return (crop?.stages || []).reduce((sum, stage) => sum + (Number(stage.days) > 0 ? Number(stage.days) : 0), 0);
}

function stageOrigin(crop, stageId) {
  let age = 0;
  for (const stage of crop?.stages || []) {
    if (stage.id === stageId) return age;
    if (Number(stage.days) > 0) age += Number(stage.days);
  }
  return age;
}

export function growthAge(field) {
  const crop = cropOfPlant(field);
  const stage = stageOf(crop, field?.plant?.stageId);
  if (!crop || !stage) return 0;
  if (!(Number(stage.days) > 0)) return cycleDays(crop);
  return stageOrigin(crop, stage.id) + (field.plant.grow || 0);
}

export function harvestWindow(crop) {
  for (const stage of crop?.stages || []) {
    const job = (stage.jobs || []).find(item => item.kind === 'hard' && item.job === 'harvest' && item.from != null && item.to != null);
    if (job) return { from: Number(job.from), to: Number(job.to) };
  }
  return null;
}

export function maturityPercent(crop, age) {
  const win = harvestWindow(crop);
  const start = win && win.from > 0 ? win.from : 1;
  const end = win && win.to > start ? win.to : start + 1;
  const max = crop?.maturity?.maxHarvest > 0 ? crop.maturity.maxHarvest : 120;
  const day = Math.max(0, age || 0);
  if (day <= start) return (day / start) * 100;
  return 100 + ((day - start) / (end - start)) * (max - 100);
}

export function harvestAllowed(crop, age) {
  const max = crop?.maturity?.maxHarvest > 0 ? crop.maturity.maxHarvest : 120;
  return maturityPercent(crop, age) <= max + 1e-6;
}

export function qualityNow(crop, field) {
  const base = crop?.qualityBase ?? crop?.quality ?? 1;
  if (field?.plant && field.plant.quality != null) return field.plant.quality;
  return base;
}

function windowOpen(spec, age) {
  if (spec.full) return true;
  return age + 1e-6 >= spec.from && age < spec.to - 1e-6;
}

function windowOver(spec, age) {
  if (spec.full) return false;
  return age + 1e-4 >= spec.to;
}

function queueJob(farm, field, jobId, lane) {
  const job = JOBS[jobId];
  if (!job) return;
  if (farm.queue.some(item => item.fieldId === field.id && item.jobId === jobId)) return;
  if (farm.orders.some(item => item.fieldId === field.id && item.jobId === jobId)) return;
  farm.queue.push({ id: farm.seq++, fieldId: field.id, jobId, caps: job.caps.slice(), lane });
}

function enterStage(farm, field, stageId, how) {
  if (!field?.plant) return;
  if (stageId === 'exit') {
    field.ground = 'general';
    field.plant = null;
    field.look = 'general';
    field.lock = null;
    field.stageFade = null;
    pushEvent(farm, { type: 'stage', fieldId: field.id, stageId: 'exit' });
    pushEvent(farm, { type: 'ground', fieldId: field.id, ground: 'general' });
    return;
  }
  const crop = cropOfPlant(field);
  const stage = stageOf(crop, stageId);
  if (!stage) return;
  const fromG = how === 'natural' ? (stageShadeG(field) ?? lookG(field.look, 0)) : null;
  field.plant.stageId = stage.id;
  field.plant.soft = null;
  field.plant.clock = false;
  field.plant.grow = 0;
  field.plant.need = 0;
  field.brushFade = null;
  if (stage.look) field.look = stage.look;
  const toG = how === 'natural'
    ? (Number(stage.days) > 0 ? stageShadeG(field) : lookG(stage.look, 0))
    : null;
  if (how === 'natural' && fromG != null && toG != null && Math.abs(toG - fromG) > 0.35) {
    field.stageFade = { fromG, toG, left: 1, span: 1 };
  } else {
    field.stageFade = null;
  }
  pushEvent(farm, { type: 'stage', fieldId: field.id, stageId: stage.id });
  const days = Number(stage.days);
  if (days > 0) {
    field.plant.need = days;
    field.plant.clock = true;
    pushEvent(farm, { type: 'clock-start', fieldId: field.id, stageId: stage.id });
  }
  bindSoft(field);
  openHard(farm);
}

function leaveByNatural(farm, field) {
  const crop = cropOfPlant(field);
  const natural = edgesFrom(crop, field.plant.stageId).find(edge => edge.kind === 'natural');
  if (!natural) {
    field.plant.clock = false;
    return;
  }
  const hard = edgesFrom(crop, field.plant.stageId).find(edge => edge.kind === 'hard');
  const started = hard && farm.orders.some(order => order.fieldId === field.id && order.jobId === hard.job);
  if (started) {
    field.plant.clock = false;
    return;
  }
  if (hard) farm.queue = farm.queue.filter(item => !(item.fieldId === field.id && item.jobId === hard.job));
  enterStage(farm, field, natural.to, 'natural');
}

// 硬收获做完、田面已是收获后，才入仓一次。升数等于信息框产量值 round(yieldBase × yieldMul)。
// 旧薯田是 FIELD_HA × yieldL × yieldFactor，因为 yieldL 按公顷计。这里的 yieldBase 已是一整块田的产量，不再乘面积。
// 品质用解耦后的田块品质，不写成熟度。烂地走自然边，不经过这里。
function storePlantHarvest(farm, field, crop) {
  const plant = field?.plant;
  if (!plant || plant.stored || !crop) return;
  const stage = stageOf(crop, plant.stageId);
  if (stage?.role !== 'tail' || field.look !== 'harvested') return;
  const yieldMul = plant.yieldMul || 1;
  const liters = Math.round((crop.yieldBase || 0) * yieldMul);
  if (!(liters > 0)) return;
  const quality = qualityNow(crop, field);
  plant.stored = true;
  const spec = {
    crop: crop.id,
    name: crop.name,
    liters,
    yieldBase: crop.yieldBase || liters,
    quality,
    fieldId: field.id,
  };
  pushEvent(farm, { type: 'harvest-store', fieldId: field.id, crop: crop.id, liters, quality });
  if (harvestSink) harvestSink(spec);
}

function abandonOrder(farm, order) {
  const field = farm.fields.get(order.fieldId);
  const job = JOBS[order.jobId];
  if (job?.kind === 'soft') {
    const row = field?.plant?.soft?.[order.jobId];
    if (row && row.status !== '执行完' && row.status !== '过期') {
      row.status = '未执行';
      row.progress = 0;
    }
  }
  const lane = order.lane;
  const fieldId = order.fieldId;
  const jobId = order.jobId;
  releaseOrder(farm, order);
  if (job && job.kind !== 'soft' && field && !farm.queue.some(item => item.fieldId === fieldId && item.jobId === jobId) && !farm.orders.some(item => item.fieldId === fieldId && item.jobId === jobId)) {
    farm.queue.push({ id: farm.seq++, fieldId, jobId, caps: job.caps.slice(), lane: lane || 'plant' });
  }
}

function beginStandby(machine) {
  machine.recall = null;
  machine.hold = true;
  machine.busy = false;
  machine.standby = STANDBY_SECONDS;
}

function maybeStandby(farm, machine) {
  if (!machine || machine.recall !== 'wait') return;
  const still = farm.orders.some(order => order.machineId === machine.id && (order.phase === 'work' || order.phase === 'turn') && JOBS[order.jobId]?.kind === 'hard');
  if (still) return;
  beginStandby(machine);
}

export function standbyClock(machine) {
  if (!(machine?.standby > 0)) return '';
  const minutes = machine.standby / DAY_SECONDS * 1440;
  const hours = minutes / 60;
  if (hours > 22) return `${Math.max(1, Math.round(hours / 24))} d`;
  if (hours >= 1) return `${Math.ceil(hours)} h`;
  return `${Math.max(1, Math.ceil(minutes))} min`;
}

// 放弃软作业和还没开工的硬作业。正在做的硬作业做完才开始 1 世界日待机。
export function recallMachine(farm, machineId) {
  const machine = farm.machines.find(m => m.id === machineId);
  if (!machine || machine.classId === 'hitch' || machine.classId === 'air') return { ok: false, reason: 'machine' };
  if (machine.standby > 0) {
    machine.standby += STANDBY_SECONDS;
    return { ok: true, extended: true, waiting: false };
  }
  machine.hold = true;
  const mine = farm.orders.filter(order => order.machineId === machine.id);
  let waiting = false;
  for (const order of [...mine]) {
    const job = JOBS[order.jobId];
    if (job?.kind === 'hard' && (order.phase === 'work' || order.phase === 'turn')) {
      waiting = true;
      continue;
    }
    abandonOrder(farm, order);
  }
  if (waiting) {
    machine.recall = 'wait';
    machine.busy = true;
    return { ok: true, waiting: true };
  }
  beginStandby(machine);
  return { ok: true, waiting: false };
}

export function releaseStandby(farm, machineId) {
  const machine = farm.machines.find(m => m.id === machineId);
  if (!machine || !(machine.standby > 0)) return { ok: false, reason: 'idle' };
  machine.standby = 0;
  machine.hold = false;
  machine.recall = null;
  return { ok: true };
}

function tickStandby(farm, dt) {
  for (const machine of farm.machines) {
    if (!(machine.standby > 0)) continue;
    machine.standby -= dt;
    if (machine.standby <= 0) {
      machine.standby = 0;
      machine.hold = false;
      machine.recall = null;
    }
  }
}

function releaseOrder(farm, order) {
  const field = farm.fields.get(order.fieldId);
  const machine = orderMachine(farm, order);
  farm.orders = farm.orders.filter(item => item !== order);
  if (machine) machine.busy = false;
  if (order.hitchId) {
    const hitch = farm.machines.find(m => m.id === order.hitchId);
    if (hitch) hitch.busy = false;
  }
  if (field && field.lock === order.id) field.lock = null;
}

function finishOrder(farm, order) {
  const field = farm.fields.get(order.fieldId);
  const job = JOBS[order.jobId];
  const machine = orderMachine(farm, order);
  if (job?.kind === 'soft') {
    const row = field?.plant?.soft?.[order.jobId];
    let painted = null;
    if (row && row.status !== '过期') {
      row.progress = 1;
      row.status = '执行完';
      if (row.yieldMul > 1) field.plant.yieldMul = Math.max(field.plant.yieldMul || 1, row.yieldMul);
      if (row.qualityAdd) {
        const base = field.plant.quality ?? cropOfPlant(field)?.qualityBase ?? 1;
        field.plant.quality = base + row.qualityAdd;
      }
      painted = commitSweep(field, job);
    }
    releaseOrder(farm, order);
    pushEvent(farm, {
      type: 'job-complete',
      fieldId: field?.id,
      jobId: job.id,
      look: painted || job.look,
      lane: order.lane,
      progress: row ? row.progress : 1,
    });
    maybeStandby(farm, machine);
    return;
  }
  releaseOrder(farm, order);
  pushEvent(farm, { type: 'job-complete', fieldId: field?.id, jobId: job.id, look: job.look, lane: order.lane });
  if (field) applyLook(field, job);
  if (field?.prep && order.lane === 'prep') {
    const recipe = PREP_RECIPES[field.prep.recipeId];
    field.prep.step += 1;
    const nextId = recipe.steps[field.prep.step];
    if (!nextId) {
      field.ground = recipe.target;
      field.prep = null;
      pushEvent(farm, { type: 'ground', fieldId: field.id, ground: field.ground });
    } else {
      const next = JOBS[nextId];
      farm.queue.push({ id: farm.seq++, fieldId: field.id, jobId: next.id, caps: next.caps.slice(), lane: 'prep' });
    }
  }
  if (field?.plant && order.lane === 'plant') {
    const crop = cropOfPlant(field);
    const entry = crop?.graph?.entry;
    if (entry && job.id === entry.job && field.plant.stageId === entry.job) {
      enterStage(farm, field, entry.to);
    } else {
      const edge = edgesFrom(crop, field.plant.stageId).find(item => item.kind === 'hard' && item.job === job.id);
      if (edge) {
        enterStage(farm, field, edge.to);
        if (job.kind === 'hard' && job.look === 'harvested') storePlantHarvest(farm, field, crop);
      }
    }
  }
  maybeStandby(farm, machine);
}

function growthLeft(field) {
  if (!field.plant?.clock || field.lock) return null;
  return Math.max(0, field.plant.need - field.plant.grow);
}

function applyGrowth(farm, slice, skip) {
  for (const field of farm.fields.values()) {
    if (skip instanceof Set ? skip.has(field.id) : field.id === skip) continue;
    if (!field.plant?.clock || field.lock) continue;
    field.plant.grow += slice / DAY_SECONDS;
  }
}

function stageRow(field) {
  if (!field.plant) return null;
  return stageOf(cropOfPlant(field), field.plant.stageId);
}

function bindSoft(field) {
  const stage = stageRow(field);
  const specs = (stage?.jobs || []).filter(spec => spec.kind === 'soft' && JOBS[spec.job]?.kind === 'soft');
  if (!specs.length) return;
  if (!field.plant.soft) field.plant.soft = {};
  for (const spec of specs) {
    const job = JOBS[spec.job];
    if (field.plant.soft[spec.job]) continue;
    field.plant.soft[spec.job] = {
      name: spec.name || job.name,
      from: spec.from,
      to: spec.to,
      full: !!spec.full,
      yieldMul: spec.yieldMul || 1,
      qualityAdd: spec.qualityAdd || 0,
      progress: 0,
      status: '未执行',
    };
  }
}

function expireSoft(farm, field, jobId, row) {
  if (row.status === '执行完' || row.status === '过期') return;
  const order = farm.orders.find(item => item.fieldId === field.id && item.jobId === jobId);
  if (order) {
    row.progress = order.progress;
    releaseOrder(farm, order);
  }
  farm.queue = farm.queue.filter(item => !(item.fieldId === field.id && item.jobId === jobId));
  row.status = '过期';
  pushEvent(farm, { type: 'job-missed', fieldId: field.id, jobId, progress: row.progress });
}

function touchSoft(farm) {
  for (const field of farm.fields.values()) {
    bindSoft(field);
    const book = field.plant?.soft;
    if (!book) continue;
    const age = growthAge(field);
    for (const [jobId, row] of Object.entries(book)) {
      if (row.status === '执行完' || row.status === '过期') continue;
      if (windowOver(row, age)) expireSoft(farm, field, jobId, row);
    }
    const order = farm.orders.find(item => item.fieldId === field.id && item.lane === 'soft');
    if (!order) continue;
    const row = book[order.jobId];
    if (!row || row.status === '过期' || row.status === '执行完') continue;
    row.status = '执行中';
    row.progress = order.progress;
  }
}

function queueSoft(farm) {
  for (const field of farm.fields.values()) {
    const book = field.plant?.soft;
    if (!book || !field.plant.clock || field.lock) continue;
    if (farm.orders.some(item => item.fieldId === field.id)) continue;
    if (farm.queue.some(item => item.fieldId === field.id)) continue;
    const age = growthAge(field);
    const open = Object.entries(book).find(([, row]) => row.status === '未执行' && windowOpen(row, age));
    if (!open) continue;
    const job = JOBS[open[0]];
    if (!job) continue;
    farm.queue.push({
      id: farm.seq++,
      fieldId: field.id,
      jobId: job.id,
      caps: job.caps.slice(),
      lane: 'soft',
    });
  }
}

function softHorizon(field) {
  const book = field.plant?.soft;
  if (!field.plant || !book) return Infinity;
  const age = growthAge(field);
  let wait = Infinity;
  for (const row of Object.values(book)) {
    if (row.status === '执行完' || row.status === '过期' || row.full) continue;
    if (age < row.from) wait = Math.min(wait, row.from - age);
    if (age < row.to) wait = Math.min(wait, row.to - age);
  }
  return wait;
}

function hardSpecs(field) {
  return (stageRow(field)?.jobs || []).filter(spec => spec.kind === 'hard' && JOBS[spec.job]);
}

function openHard(farm) {
  for (const field of farm.fields.values()) {
    if (!field.plant || field.lock) continue;
    if (farm.orders.some(item => item.fieldId === field.id && item.lane !== 'soft')) continue;
    const age = growthAge(field);
    const crop = cropOfPlant(field);
    const spec = hardSpecs(field).find(item => {
      if (item.job === 'harvest' && !harvestAllowed(crop, age)) return false;
      return windowOpen(item, age);
    });
    if (!spec) continue;
    if (farm.queue.some(item => item.fieldId === field.id)) continue;
    queueJob(farm, field, spec.job, 'plant');
  }
}

function hardHorizon(field) {
  if (!field.plant) return Infinity;
  const age = growthAge(field);
  let wait = Infinity;
  for (const spec of hardSpecs(field)) {
    if (spec.full) continue;
    if (age < spec.from) wait = Math.min(wait, spec.from - age);
    if (age < spec.to) wait = Math.min(wait, spec.to - age);
  }
  return wait;
}

function finishGrowth(farm) {
  for (const field of farm.fields.values()) {
    if (!field.plant?.clock || field.lock) continue;
    if (field.plant.grow + 1e-6 < field.plant.need) continue;
    field.plant.grow = field.plant.need;
    leaveByNatural(farm, field);
  }
}

export function stepFarm(farm, dt, env = null) {
  if (!(dt > 0)) return farm;
  tickStandby(farm, dt);
  fadeBrush(farm, dt);
  fadeStage(farm, dt);
  let left = dt;
  for (let guard = 0; guard < 48 && left > 1e-6; guard++) {
    applyPlans(farm);
    touchSoft(farm);
    queueSoft(farm);
    openHard(farm);
    dispatch(farm, env);
    touchSoft(farm);
    for (const order of farm.orders) {
      if (order.phase === 'work') {
        const field = farm.fields.get(order.fieldId);
        const passes = passesOf(order, field);
        const cur = passIndex(order, field);
        if (cur < passes - 1) {
          const remain = (cur + 1) * field.length - order.progress * metersOf(order, field);
          if (remain <= 1e-3) beginTurn(order, field, cur);
        }
      }
      if (order.phase === 'cruise') {
        const eta = env?.eta ? env.eta(farm, order) : 0;
        if (!(eta > 1e-4)) {
          order.phase = 'work';
          writePose(farm, order);
        }
      }
    }
    let horizon = Infinity;
    for (const order of farm.orders) {
      if (order.phase === 'cruise') horizon = Math.min(horizon, env.eta(farm, order));
      if (order.phase === 'work') horizon = Math.min(horizon, secondsLeft(farm, order), secondsToTurn(farm, order));
      if (order.phase === 'turn') horizon = Math.min(horizon, Math.max(0, TURN_SECONDS - (order.turnT || 0)));
    }
    for (const field of farm.fields.values()) {
      const wait = growthLeft(field);
      if (wait != null) horizon = Math.min(horizon, wait * DAY_SECONDS);
      horizon = Math.min(horizon, softHorizon(field) * DAY_SECONDS, hardHorizon(field) * DAY_SECONDS);
    }
    if (!isFinite(horizon)) {
      applyGrowth(farm, left, null);
      if (env?.idle) env.idle(farm, left);
      break;
    }
    const slice = Math.min(left, Math.max(horizon, 0));
    if (!(slice > 1e-8)) break;
    const skip = new Set();
    for (const order of [...farm.orders]) {
      if (order.phase === 'cruise' && env?.cruise) env.cruise(farm, order, slice);
      if (order.lane !== 'soft' && (order.phase === 'work' || order.phase === 'cruise')) skip.add(order.fieldId);
      if (order.phase === 'work') advanceWork(farm, order, slice);
      if (order.phase === 'turn') {
        order.turnT = (order.turnT || 0) + slice;
        if (order.turnT >= TURN_SECONDS - 1e-6) {
          order.phase = 'work';
          order.pose = order.turnTo;
          order.turnT = 0;
        }
      }
    }
    applyGrowth(farm, slice, skip);
    left -= slice;
    for (const order of [...farm.orders]) {
      if (order.phase === 'work' && order.progress >= 1 - 1e-9) finishOrder(farm, order);
    }
    finishGrowth(farm);
  }
  applyPlans(farm);
  touchSoft(farm);
  queueSoft(farm);
  openHard(farm);
  dispatch(farm, env);
  return farm;
}

export function fieldWork(farm, fieldId) {
  const order = farm.orders.find(item => item.fieldId === fieldId);
  if (!order) return null;
  return {
    jobId: order.jobId,
    phase: order.phase,
    lane: order.lane,
    width: order.width,
    origin: order.origin,
    progress: order.progress,
    pose: order.pose,
    machineId: order.machineId,
    hitchId: order.hitchId || null,
  };
}

const BADGE = {
  plow: { wait: '等待整地', cruise: '整地中', run: '犁地中' },
  sow: { wait: '等待播种', cruise: '播种中', run: '播种中' },
  harvest: { wait: '等待收割', cruise: '收割中', run: '收割中' },
  tidy: { wait: '等待收拾', cruise: '收拾中', run: '收拾中' },
  topdress: { wait: '等待追肥', cruise: '追肥中', run: '追肥中' },
  hill: { wait: '等待培土', cruise: '培土中', run: '培土中' },
};

// 名称旁的短状态。没有工单就返回 null，田面和阶段仍走原来的 stat。
export function fieldBadge(farm, fieldId) {
  const field = farm.fields.get(fieldId);
  if (!field) return null;
  const work = fieldWork(farm, fieldId);
  const row = work ? BADGE[work.jobId] : null;
  if (row) return work.phase === 'work' || work.phase === 'turn' ? row.run : row.cruise;
  const queued = farm.queue.find(item => item.fieldId === fieldId);
  if (queued && BADGE[queued.jobId]) return BADGE[queued.jobId].wait;
  const hung = field.plant?.soft && Object.values(field.plant.soft).some(item => item.status === '过期');
  return hung ? '工单挂起提示' : null;
}

// 田块浮标只写短状态。有工单时与信息框名称旁的 badge 相同；空闲不把操作说明拼进浮标。
export function fieldFloat(farm, fieldId) {
  const badge = fieldBadge(farm, fieldId);
  if (badge) return badge;
  const field = farm.fields.get(fieldId);
  if (!field) return '';
  if (field.look === 'hold') return '定格冠层';
  const crop = field.plant ? PLANT_CROPS[field.plant.cropId] : null;
  if (crop) {
    const stage = stageOf(crop, field.plant.stageId);
    const name = stage?.name || (field.plant.stageId === crop.graph?.entry?.job ? '播种' : '');
    return name ? `${crop.name} · ${name}` : crop.name;
  }
  if (field.ground === 'general') return '一般田地 · 可以种植拉斯提卡';
  return '未整地';
}

export function describeField(farm, fieldId) {
  const field = farm.fields.get(fieldId);
  if (!field) return null;
  const work = fieldWork(farm, fieldId);
  const job = work ? JOBS[work.jobId] : null;
  const pct = work ? Math.round(work.progress * 100) : 0;
  const machine = work ? farm.machines.find(m => m.id === work.machineId) : null;
  const crop = field.plant ? PLANT_CROPS[field.plant.cropId] : null;
  let stat = GROUNDS[field.ground]?.name || field.ground;
  if (field.look === 'raw' && !work) stat = '未整地 · 整地后成为一般田地';
  else if (field.ground === 'general' && !field.plant && !work) stat = '一般田地 · 可以种植拉斯提卡';
  if (work && job) {
    const name = crop ? crop.name + ' · ' : (work.lane === 'prep' ? '清地 · ' : '');
    const who = machine ? machine.name + ' · ' : '';
    const where = work.phase === 'cruise' ? '正在开来' : work.phase === 'turn' ? '地头转弯' : `${job.name} ${pct}%`;
    stat = `${name}${who}${where}`;
  }
  const stage = crop && field.plant ? stageOf(crop, field.plant.stageId) : null;
  const age = crop ? growthAge(field) : 0;
  const cycle = crop ? cycleDays(crop) : 0;
  if (field.plant?.clock) {
    stat = `${crop.name} · ${stage?.name || ''} · ${age.toFixed(1)} / ${cycle} 世界日`;
  } else if (field.plant && !work) {
    const name = stage?.name || (field.plant.stageId === crop.graph?.entry?.job ? '播种' : '');
    stat = `${crop.name} · ${name}`;
  }
  const jobs = (stage?.jobs || []).map(spec => {
    if (spec.kind === 'soft') {
      const row = field.plant.soft?.[spec.job];
      const active = work && work.jobId === spec.job && row && row.status !== '过期' && row.status !== '执行完';
      return {
        id: spec.job, name: spec.name, kind: 'soft',
        from: spec.from, to: spec.to, full: !!spec.full,
        status: active ? (work.phase === 'cruise' ? '开来' : work.phase === 'turn' ? '转弯' : '执行中') : (row?.status || '未执行'),
        pct: active ? pct : Math.round((row?.progress || 0) * 100),
      };
    }
    const order = farm.orders.find(item => item.fieldId === field.id && item.jobId === spec.job);
    const queued = farm.queue.some(item => item.fieldId === field.id && item.jobId === spec.job);
    let status = '未到';
    let rowPct = 0;
    if (order) {
      status = order.phase === 'cruise' ? '开来' : order.phase === 'turn' ? '转弯' : '执行中';
      rowPct = Math.round(order.progress * 100);
    } else if (queued) status = '等待';
    else if (windowOver(spec, age)) status = '过期';
    else if (windowOpen(spec, age)) status = '可派';
    return { id: spec.job, name: spec.name, kind: 'hard', from: spec.from, to: spec.to, full: !!spec.full, status, pct: rowPct };
  });
  const expired = jobs.find(item => item.status === '过期');
  const suspend = expired ? { title: '工单挂起提示' } : null;
  const showingAfter = stage?.role === 'tail';
  const finite = crop ? crop.stages.filter(item => Number(item.days) > 0) : [];
  const tail = crop
    ? (showingAfter ? crop.stages.find(item => item.role === 'tail') : crop.stages.find(item => item.role === 'rot'))
    : null;
  const barStages = [...finite, tail].filter(Boolean).map(item => ({
    id: item.id,
    name: item.name,
    color: item.color || '#6f6a61',
    days: Number(item.days) > 0 ? Number(item.days) : 0,
    infinite: !(Number(item.days) > 0),
    on: item.id === field.plant?.stageId,
    jobs: (item.jobs || []).map(spec => {
      const live = item.id === field.plant?.stageId ? jobs.find(row => row.id === spec.job) : null;
      return {
        id: spec.job,
        name: spec.name,
        kind: spec.kind,
        from: spec.from,
        to: spec.to,
        full: !!spec.full,
        status: live?.status || '窗口',
        pct: live?.pct || 0,
      };
    }),
  }));
  const rotten = stage?.role === 'rot';
  const maturity = !crop || rotten ? null : maturityPercent(crop, Math.min(age, cycle || age));
  const yieldValue = crop ? Math.round((crop.yieldBase || 0) * (field.plant?.yieldMul || 1)) : 0;
  const quality = crop && field.plant ? qualityNow(crop, field) : null;
  const locked = fieldLocked(farm, field);
  const next = field.nextCrop ? PLANT_CROPS[field.nextCrop] : null;
  const actions = [
    { id: 'prep', name: '整地', enabled: !locked },
    { id: 'plant', name: '种植', enabled: !locked && !field.plant && field.ground === 'general' },
  ];
  const chips = barStages.map(item => ({ name: item.name, on: item.on }));
  const bar = work ? work.progress : (field.plant?.clock && field.plant.need ? field.plant.grow / field.plant.need : 0);
  return {
    plot: field.plot,
    ground: field.ground,
    groundName: GROUNDS[field.ground]?.name || field.ground,
    look: field.look,
    stat,
    badge: fieldBadge(farm, fieldId),
    float: fieldFloat(farm, fieldId),
    jobs,
    suspend,
    chips,
    bar,
    age,
    cycle,
    maturity,
    yieldValue,
    quality,
    showMaturity: maturity != null,
    stageName: stage?.name || '',
    barStages,
    actions,
    canPrep: !locked && (field.ground !== 'general' || !!field.plant),
    canPlant: !field.plant && !locked && field.ground === 'general',
    crop: crop ? crop.name : null,
    nextCrop: next?.id || null,
    nextName: next?.name || null,
  };
}
