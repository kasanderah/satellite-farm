// 表层四作物。玩法只读田间文档：总周期、阶段对齐、阶段内作业窗口。调度只吃窗口。
// 出苗要等该田的播种/移栽写完蒙版才画，逻辑在 fieldVisual。
import { parseFieldStageDoc, placeholderFieldDoc, alignFieldCalendar, jobWindows, sampleRidge } from './field-stages.js';

export const JOB_PENALTY = 0.15;
export const UNLOAD_WHILE_MOVING = false;
export const BIN_LANES = 4;
export const UNLOAD_SECONDS = 3.5;
export const TRAILER_CARGO_CAP = 2;

const soil = '#6f6a61';
const POTATO_NAME = '中熟商品薯';
const RIDGE_N = 8;

function stageLook(stage, fallbackRidge) {
  const ridge = stage && Array.isArray(stage.ridge) && stage.ridge.length >= 2 ? stage.ridge : fallbackRidge;
  const color = (stage && stage.color) || soil;
  return {
    color,
    canopy: (stage && stage.canopy) || color,
    roughness: Number.isFinite(+stage?.roughness) ? +stage.roughness : 0.92,
    cover: Number.isFinite(+stage?.cover) ? +stage.cover : 0,
    plantScale: Number.isFinite(+stage?.plantScale) ? +stage.plantScale : 0,
    ridge: Array.from({ length: RIDGE_N }, (_, i) => sampleRidge(ridge, i / (RIDGE_N - 1))),
  };
}

const MACHINE_JOB = {
  impl_fertilizer: { cap: 'fertilize', load: 'fertilizer' },
  impl_rotavator: { cap: 'till_rotary' },
  impl_cultivator: { cap: 'cultivate' },
  impl_sprayer: { cap: 'spray' },
  impl_seeder: { cap: 'seed' },
  impl_potato_planter: { cap: 'plant_potato' },
  impl_bedder: { cap: 'bed' },
  impl_haulm: { cap: 'haulm' },
  transplanter: { cap: 'transplant' },
  harvester_potato: { cap: 'harvest_potato' },
  harvester_combine: { cap: 'harvest_combine' },
  harvester_cabbage: { cap: 'harvest_cabbage' },
  drone_scout: { cap: 'scout', drone: true },
  drone_treat: { cap: 'pest_treat', load: 'pest', drone: true },
};

// 工序里的 machine id → 调度能力。农机编辑器的标签跟这份对齐，不另起一套词。
export const MACHINE_CAP_BY_ID = Object.fromEntries(
  Object.entries(MACHINE_JOB).map(([id, row]) => [id, row.cap]),
);

function faceStage(row, from, to, doc, extra = {}) {
  const days = extra.days ?? (to - from);
  return {
    id: row.id,
    name: row.name || row.id,
    from, to, days,
    color: row.color || soil,
    effect: row.effect || '',
    look: stageLook(row, doc.ridge),
    preplant: !!extra.preplant,
    after: !!extra.after,
  };
}

// 一份田间文档编译成玩法用的阶段和窗口。能力来自作业自己的 extensions，没有再查旧工单号。
export function compilePlayable(raw, meta = {}) {
  const doc = raw && raw.stages && raw.edges ? parseFieldStageDoc(raw) : raw;
  const aligned = alignFieldCalendar(doc);
  const windows = jobWindows(doc, aligned);
  const stages = [];
  if (aligned.idle) stages.push(faceStage(aligned.idle, 0, Number(aligned.idle.days) || 0, doc, { preplant: true }));
  for (const placed of aligned.placed) stages.push(faceStage(placed.row, placed.from, placed.to, doc));
  const hold = aligned.placed[aligned.placed.length - 1];
  let tail = hold.to;
  for (const variant of [aligned.d1, aligned.d2]) {
    if (!variant) continue;
    const days = Math.max(0, Number(variant.days) || 0);
    stages.push(faceStage({ ...hold.row, ...variant, id: variant.id, name: variant.name || variant.id }, tail, tail + days, doc));
    tail += days;
  }
  if (aligned.post) {
    const days = Number(aligned.post.days) || 0;
    stages.push(faceStage(aligned.post, hold.to, hold.to + days, doc, { after: true }));
  }
  const jobs = windows.map(({ op, window, order }) => {
    const ext = op.extensions || {};
    const machine = op.machine || null;
    const inferred = MACHINE_JOB[machine] || {};
    const writesMask = !!op.writesMask;
    const required = typeof ext.required === 'boolean' ? ext.required : op.kind === 'required';
    const plant = typeof ext.plant === 'boolean' ? ext.plant : writesMask;
    const harvest = typeof ext.harvest === 'boolean' ? ext.harvest : op.via === 'harvest';
    const drone = !!(op.drone || ext.drone || inferred.drone);
    const seeder = machine === 'impl_seeder' || machine === 'impl_potato_planter' || machine === 'transplanter';
    const combine = machine === 'harvester_combine';
    return {
      id: op.id,
      name: op.name || op.id,
      stage: window.stage,
      from: window.from,
      to: window.to,
      window,
      order,
      required,
      plant,
      harvest,
      spray: !!ext.spray,
      auto: !!ext.auto,
      afterHarvest: window.when === 'after',
      drone,
      preplant: window.when === 'before' && !writesMask,
      writesMask,
      impl: ext.impl || (machine && String(machine).startsWith('impl_') ? machine : null),
      implAny: ext.implAny || null,
      self: ext.self || (machine && !String(machine).startsWith('impl_') && !drone ? machine : null),
      mode: ext.mode || null,
      penalty: required ? (Number.isFinite(+ext.penalty) ? +ext.penalty : JOB_PENALTY) : 0,
      cap: ext.cap || inferred.cap || null,
      caps: ext.caps || null,
      load: ext.load || (seeder ? (meta.seed || null) : (inferred.load || null)),
      disc: ext.disc || (machine === 'impl_seeder' ? (meta.disc || null) : null),
      tank: ext.tank || (combine ? (meta.tank || null) : null),
      note: ext.note || '',
    };
  });
  const displayName = String(doc.cropName || doc.name || meta.name || doc.cropId || '').trim() || meta.name || doc.cropId;
  return {
    id: meta.id || doc.cropId,
    logicId: doc.logicId || ('crop_' + (meta.id || doc.cropId)),
    stages,
    jobs,
    cycle: aligned.cycle,
    maturity: aligned.maturity,
    hold: aligned.hold,
    rotAt: aligned.rotAt,
    profile: doc.profile || null,
    displayName,
    seed: meta.seed || null,
    seedQty: meta.seedQty || 1,
    planLabel: '种' + displayName,
    slotted: !!meta.slotted,
    visual: {
      rows: Math.max(4, Math.min(16, Math.round(+doc.rows) || 8)),
      plantRow: Number.isFinite(+doc.plant?.row) ? +doc.plant.row : (meta.row ?? 0.9),
      plantAlong: Number.isFinite(+doc.plant?.along) ? +doc.plant.along : (meta.along ?? 0.4),
      plantHeight: Number.isFinite(+doc.plant?.height) ? +doc.plant.height : (meta.height ?? 0.55),
    },
  };
}

const CROP_META = {
  potato: { id: 'potato', name: POTATO_NAME, shape: 'bush', young: '#51542c', ripe: '#81683f', stub: '#9e543a', height: 0.55, row: 0.9, along: 0.4, seed: 'seed', slotted: true },
  soy: { id: 'soy', name: '大豆', shape: 'bush', young: '#51542c', ripe: '#787c32', stub: '#6f6a61', height: 0.8, row: 0.5, along: 0.3, seed: 'seed_soy', disc: 'bean', tank: 'bean' },
  feed_barley: { id: 'feed_barley', name: '饲料大麦', shape: 'ear', young: '#8a8f45', ripe: '#b59a63', stub: '#81683f', height: 0.9, row: 0.4, along: 0.28, seed: 'seed_barley', disc: 'grain', tank: 'grain' },
  cabbage: { id: 'cabbage', name: '结球甘蓝', shape: 'rosette', young: '#8fbbad', ripe: '#52747e', stub: '#6f6a61', height: 0.45, row: 0.7, along: 0.55, seed: 'seedling_cabbage' },
};

function playableFromMeta(meta) {
  const doc = placeholderFieldDoc(meta);
  const play = compilePlayable(doc, meta);
  play.stageOrigin = 'repo';
  return play;
}

export const SURFACE_CROPS = {
  potato: playableFromMeta(CROP_META.potato),
  soy: playableFromMeta(CROP_META.soy),
  feed_barley: playableFromMeta(CROP_META.feed_barley),
  cabbage: playableFromMeta(CROP_META.cabbage),
};

// 工坊覆写和仓库默认都走这一份。stages / jobs 就地换掉，已经拿着这两条数组的钟不用重新取对象。
export function installPotatoProfile(profile, origin) {
  const dest = SURFACE_CROPS.potato;
  dest.stages.splice(0, dest.stages.length, ...profile.stages);
  dest.jobs.splice(0, dest.jobs.length, ...profile.jobs);
  dest.maturity = profile.maturity;
  dest.hold = profile.hold;
  dest.rotAt = profile.rotAt;
  dest.cycle = profile.cycle;
  dest.profile = profile.profile || null;
  dest.displayName = profile.displayName || POTATO_NAME;
  dest.planLabel = '种' + dest.displayName;
  dest.visual = profile.visual;
  dest.slotted = true;
  dest.stageOrigin = origin === 'workshop' ? 'workshop' : 'repo';
  return dest;
}

export function surfaceProfileFromRaw(id, raw) {
  const meta = CROP_META[id];
  if (!meta) throw new Error('没有这作物');
  const play = compilePlayable(raw, meta);
  if (id === 'potato') play.slotted = true;
  return play;
}

export function installSurfaceProfile(id, profile, origin) {
  if (id === 'potato') return installPotatoProfile(profile, origin);
  const dest = SURFACE_CROPS[id];
  if (!dest) return null;
  dest.stages.splice(0, dest.stages.length, ...profile.stages);
  dest.jobs.splice(0, dest.jobs.length, ...profile.jobs);
  dest.maturity = profile.maturity;
  dest.hold = profile.hold;
  dest.rotAt = profile.rotAt;
  dest.cycle = profile.cycle;
  dest.displayName = profile.displayName || dest.displayName;
  dest.planLabel = '种' + (dest.displayName || '');
  dest.visual = profile.visual;
  dest.stageOrigin = origin === 'workshop' ? 'workshop' : 'repo';
  return dest;
}

export function resetSurfaceCrop(id) {
  if (id === 'potato') return installPotatoProfile(playableFromMeta(CROP_META.potato), 'repo');
  const meta = CROP_META[id];
  if (!meta) return null;
  return installSurfaceProfile(id, playableFromMeta(meta), 'repo');
}

// 画面阶段下标和 fieldVisual 的 g 对齐：1 是整地裸土，2 起是生长链。
export function potatoDrawLooks() {
  const def = SURFACE_CROPS.potato;
  const clock = def.stages.filter(s => !s.preplant && !s.after);
  const till = def.stages.find(s => s.preplant) || clock[0];
  const blank = till.look;
  const slots = Array.from({ length: 10 }, () => blank);
  slots[1] = blank;
  clock.forEach((stage, i) => {
    if (i + 2 < slots.length && stage.look) slots[i + 2] = stage.look;
  });
  const visual = def.visual || {};
  const rows = visual.rows || 8;
  return {
    workshop: def.stageOrigin === 'workshop',
    displayName: def.displayName || POTATO_NAME,
    row: (visual.plantRow || 0.9) * (8 / rows),
    along: visual.plantAlong || 0.4,
    height: visual.plantHeight || 0.55,
    slots,
  };
}
export function potatoProfileFromRaw(raw) {
  const play = compilePlayable(raw, CROP_META.potato);
  play.slotted = true;
  return play;
}
export function shippedPotatoProfile() {
  return playableFromMeta(CROP_META.potato);
}

// 开局四台机器仍用原来的 kind，好让机库存档和分田测试不用改下标。
// 画面用 logicId 和当前挂具，网格是工坊锁定的低模剪影。
export const RIG_PROFILE = {
  planter: {
    logicId: 'tractor_gen', label: '播种机', mesh: 'tractor_gen',
    defaultHitch: 'impl_fertilizer', defaultLoad: 'fertilizer',
    kit: ['impl_rotavator', 'impl_fertilizer', 'impl_potato_planter', 'impl_sprayer', 'impl_seeder', 'impl_trailer', 'impl_bedder'],
  },
  hiller: { logicId: 'tractor_gen', label: '培土机', mesh: 'tractor_gen', defaultHitch: 'impl_cultivator', defaultMode: 'hill', kit: ['impl_cultivator'] },
  topper: { logicId: 'tractor_gen', label: '杀秧机', mesh: 'tractor_gen', defaultHitch: 'impl_haulm', kit: ['impl_haulm'] },
  lifter: { logicId: 'harvester_potato', label: '收获机', mesh: 'harvester_potato', workWidth: 12.8, kit: [] },
  // 买来的拖拉机要能换上这些后挂，否则整地、播种、碎秆和侧卸都没人做。
  tractor: {
    logicId: 'tractor_gen', label: '拖拉机', mesh: 'tractor_gen',
    kit: ['impl_rotavator', 'impl_subsoiler', 'impl_cultivator', 'impl_fertilizer', 'impl_sprayer', 'impl_seeder', 'impl_potato_planter', 'impl_haulm', 'impl_trailer', 'impl_bedder'],
  },
  harvester_combine: { logicId: 'harvester_combine', label: '联合收割机', mesh: 'harvester_combine', workWidth: 8, kit: [] },
  harvester_cabbage: { logicId: 'harvester_cabbage', label: '结球收获机', mesh: 'harvester_cabbage', workWidth: 4, kit: [] },
  transplanter: { logicId: 'transplanter', label: '移栽机', mesh: 'transplanter', workWidth: 4, kit: [] },
};

// 能力是调度用的。同一类挂具可以只覆盖其中几项，参数里带速度和模式。
export const HITCH_SWAP_S = 8;
export const RELOAD_S = 6;
export const MODE_SWITCH_S = 2.5;

// 工作宽度是机具自己的米数，路径按它分趟。12.8 是原来的固定巷距。
export const DEFAULT_WORK_WIDTH = 12.8;

export const IMPLEMENTS = {
  impl_rotavator: { workWidth: 3.2, caps: [{ id: 'till_rotary' }] },
  impl_subsoiler: { workWidth: 2.4, caps: [{ id: 'till_subsoil' }] },
  impl_cultivator: { workWidth: 6.4, caps: [{ id: 'cultivate', modes: ['shallow', 'weed', 'hill', 'residue'] }] },
  impl_fertilizer: { workWidth: 12.8, caps: [{ id: 'fertilize' }] },
  impl_sprayer: { workWidth: 16, caps: [{ id: 'spray', mix: 'field' }] },
  impl_seeder: { workWidth: 4, caps: [{ id: 'seed', disc: 'bean', speed: 1 }, { id: 'seed', disc: 'grain', speed: 0.85 }] },
  impl_potato_planter: { workWidth: 12.8, caps: [{ id: 'plant_potato' }] },
  impl_haulm: { workWidth: 3.2, caps: [{ id: 'haulm' }] },
  impl_trailer: { workWidth: 12.8, caps: [{ id: 'haul' }] },
  impl_bedder: { workWidth: 3.2, caps: [{ id: 'bed' }] },
};

export const PLATFORM_CAPS = {
  harvester_potato: [{ id: 'harvest_potato' }],
  harvester_combine: [{ id: 'harvest_combine', mode: 'bean' }, { id: 'harvest_combine', mode: 'grain' }],
  harvester_cabbage: [{ id: 'harvest_cabbage' }],
  transplanter: [{ id: 'transplant' }],
  orbit_boom: [{ id: 'spray_boom' }],
};

function wantedCaps(job) {
  if (!job) return null;
  if (job.caps?.length) return job.caps;
  if (job.cap) return [job.cap];
  return null;
}

function capFits(cap, job) {
  if (!cap || !wantedCaps(job)?.includes(cap.id)) return false;
  if (job.mode && cap.modes && !cap.modes.includes(job.mode)) return false;
  if (cap.mode && job.mode && cap.mode !== job.mode) return false;
  if (cap.mode && job.tank && cap.mode !== job.tank) return false;
  const disc = job.disc || (job.mode === 'bean' || job.mode === 'grain' ? job.mode : null);
  if (cap.disc && disc && cap.disc !== disc) return false;
  return true;
}

function capsOfHitch(hitch) {
  return IMPLEMENTS[hitch]?.caps || [];
}

export function hitchHasModes(hitch) {
  return capsOfHitch(hitch).some(cap => cap.modes?.length);
}

export function hitchPlan(kind, currentHitch, job) {
  const profile = rigProfile(kind);
  if (!profile || !job) return null;
  const platform = (PLATFORM_CAPS[profile.logicId] || []).find(cap => capFits(cap, job));
  if (platform) return { platform: true, hitch: null, swap: false, speed: platform.speed || 1 };
  const kit = profile.kit || [];
  const owned = kit.filter(id => capsOfHitch(id).some(cap => capFits(cap, job)));
  if (!owned.length) return null;
  const hitch = owned.includes(currentHitch) ? currentHitch : owned[0];
  const cap = capsOfHitch(hitch).find(item => capFits(item, job));
  return { platform: false, hitch, swap: hitch !== currentHitch, speed: cap?.speed || 1 };
}

export function cropDef(id) {
  if (!id) return null;
  if (SURFACE_CROPS[id]) return SURFACE_CROPS[id];
  if (typeof id === 'string' && id.startsWith('crop_')) return SURFACE_CROPS[id.slice(5)] || null;
  return null;
}

export function rigProfile(kind) {
  return RIG_PROFILE[kind] || null;
}

// 侦察和虫害防治不进机库。病害喷雾以后才交给 impl_sprayer / orbit_boom。
export const DRONE_PROFILE = {
  drone_scout: { logicId: 'drone_scout', label: '侦察无人机', workWidth: 32, caps: [{ id: 'scout' }] },
  drone_treat: { logicId: 'drone_treat', label: '植保无人机', workWidth: 16, caps: [{ id: 'pest_treat' }] },
};

export function lanesForWidth(width, field = 128) {
  const span = Number(width) > 0.4 ? Number(width) : DEFAULT_WORK_WIDTH;
  const length = field > 0 ? field : 128;
  return Math.max(1, Math.round(length / span));
}

export function workWidthOf(kind, hitch) {
  const impl = hitch && IMPLEMENTS[hitch];
  if (impl?.workWidth > 0) return impl.workWidth;
  const profile = rigProfile(kind);
  if (profile?.workWidth > 0) return profile.workWidth;
  const drone = kind && DRONE_PROFILE[kind];
  if (drone?.workWidth > 0) return drone.workWidth;
  return DEFAULT_WORK_WIDTH;
}

export function droneCan(kind, job) {
  if (!job?.drone) return false;
  const profile = DRONE_PROFILE[kind];
  if (!profile) return false;
  return profile.caps.some(cap => capFits(cap, job));
}

export function rigCan(kind, job) {
  const profile = rigProfile(kind);
  if (!profile || !job || job.auto || job.drone) return false;
  if (wantedCaps(job)) return !!hitchPlan(kind, null, job);
  if (job.self) return profile.logicId === job.self;
  const kit = profile.kit || [];
  if (job.implAny) return job.implAny.some(id => kit.includes(id));
  if (job.impl) return kit.includes(job.impl);
  return false;
}

export function rigHas(kind, impl) {
  const profile = rigProfile(kind);
  return !!profile && (profile.kit || []).includes(impl);
}

// 某一作物、某一天，地上作业会派给哪些 kind。自动灌溉和无人机不在这张表里。
// 收获行的 kinds 必须是对应自走收获机，培土机、播种机、拖拉机不能出现。
export function auditDispatch(cropId, day, opts = {}) {
  const def = cropDef(cropId);
  if (!def) return [];
  const harvested = !!opts.harvested;
  const planted = opts.planted !== false;
  const done = opts.done || null;
  return def.jobs.filter(job => {
    if (job.auto || job.drone || job.spray) return false;
    if (done && done[job.id]) return false;
    if (job.window?.when === 'after') return harvested;
    if (job.window?.when === 'before') return !planted;
    if (!planted) return false;
    return day >= job.window.from && day < job.window.to;
  }).map(job => ({
    id: job.id,
    name: job.name,
    stage: job.stage,
    harvest: !!job.harvest,
    cap: job.cap || (job.caps ? job.caps.join('|') : null),
    mode: job.mode || null,
    tank: job.tank || null,
    self: job.self || null,
    kinds: Object.keys(RIG_PROFILE).filter(kind => rigCan(kind, job)),
  }));
}
