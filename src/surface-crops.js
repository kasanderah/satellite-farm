// 表层四作物。阶段时长取区间中点（Math.round）。自然阶段跟世界钟，不等作业。
// 出苗的绿色要等该田的播种/移栽作业走完才画，逻辑在 fieldVisual。

export const JOB_PENALTY = 0.15;
export const UNLOAD_WHILE_MOVING = false;
export const BIN_LANES = 4;
export const UNLOAD_SECONDS = 3.5;
export const TRAILER_CARGO_CAP = 2;

export function span(lo, hi) {
  return Math.round((lo + hi) / 2);
}

function timed(rows) {
  let t = 0;
  const stages = rows.map(row => {
    const days = span(row.lo, row.hi);
    const stage = {
      id: row.id, name: row.name, from: t, to: t + days, days,
      color: row.color, effect: row.effect,
    };
    t += days;
    return { ...stage, jobDefs: row.jobs };
  });
  const jobs = [];
  let order = 0;
  for (const stage of stages) {
    for (const job of stage.jobDefs) {
      jobs.push({
        id: job.id, name: job.name, stage: stage.id, from: stage.from, to: stage.to, order: order++,
        required: !!job.required, plant: !!job.plant, harvest: !!job.harvest, spray: !!job.spray,
        auto: !!job.auto, afterHarvest: !!job.afterHarvest, drone: !!job.drone,
        impl: job.impl || null, implAny: job.implAny || null, self: job.self || null,
        mode: job.mode || null, penalty: job.required ? JOB_PENALTY : 0,
        cap: job.cap || null, caps: job.caps || null, load: job.load || null, disc: job.disc || null, tank: job.tank || null,
      });
    }
    delete stage.jobDefs;
  }
  const harvest = stages.find(s => jobs.some(j => j.harvest && j.stage === s.id));
  return {
    stages, jobs,
    maturity: harvest.from,
    hold: harvest.days,
    rotAt: harvest.to,
  };
}

const soil = '#6f6a61';
const soilDk = '#4a4844';
const young = '#51542c';
const canopy = '#787c32';
const flower = '#c4b0d4';
const straw = '#b59a63';
const rust = '#9e543a';
const ochre = '#81683f';
const sage = '#8fbbad';

export const SURFACE_CROPS = {
  potato: timed([
    { id: 'potato_till', name: '整地空田', lo: 3, hi: 5, color: soil, effect: '基肥，加上旋耕或深松。这一段还是裸土。', jobs: [
      { id: 'potato_base_fert', name: '基肥', required: true, impl: 'impl_fertilizer' },
      { id: 'potato_rotavate', name: '旋耕', required: true, implAny: ['impl_rotavator', 'impl_subsoiler'] },
    ] },
    { id: 'potato_plant', name: '播种', lo: 2, hi: 4, color: soilDk, effect: '后挂薯播。这趟走完以前，田面保持裸土，不出绿点。', jobs: [
      { id: 'potato_plant', name: '薯播', required: true, impl: 'impl_potato_planter', plant: true },
    ] },
    { id: 'potato_emerg', name: '出苗', lo: 12, hi: 18, color: young, effect: '浅中耕。这一段不追肥。播种走完才开始出绿。', jobs: [
      { id: 'potato_shallow', name: '浅中耕', required: true, impl: 'impl_cultivator', mode: 'shallow' },
    ] },
    { id: 'potato_hill', name: '培土', lo: 10, hi: 14, color: canopy, effect: '培土，同时追肥。', jobs: [
      { id: 'potato_hill', name: '培土', required: true, impl: 'impl_cultivator', mode: 'hill' },
      { id: 'potato_topdress', name: '追肥', required: true, impl: 'impl_fertilizer' },
    ] },
    { id: 'potato_bulk', name: '膨大', lo: 35, hi: 45, color: flower, effect: '水网灌溉。侦察和虫害防治只派无人机，不追肥。地面喷雾留到病害。', jobs: [
      { id: 'potato_irrigate', name: '灌溉', required: true, auto: true },
      { id: 'potato_scout', name: '侦察', required: false, drone: true, cap: 'scout' },
      { id: 'potato_treat', name: '植保', required: false, drone: true, cap: 'pest_treat', load: 'pest' },
    ] },
    { id: 'potato_haulm', name: '杀秧', lo: 5, hi: 8, color: rust, effect: '后挂碎秧。', jobs: [
      { id: 'potato_haulm', name: '打秧', required: true, impl: 'impl_haulm' },
    ] },
    { id: 'potato_harvest', name: '成熟待收', lo: 8, hi: 14, color: ochre, effect: '自走薯收，仓满停车侧卸。窗口结束还没收就烂在地里。', jobs: [
      { id: 'potato_harvest', name: '起薯', required: true, harvest: true, self: 'harvester_potato' },
    ] },
    { id: 'potato_clear', name: '清田', lo: 2, hi: 4, color: straw, effect: '碎残。收获入仓之后就能做，不等这段日历。', jobs: [
      { id: 'potato_clear', name: '碎残', required: true, afterHarvest: true, implAny: ['impl_cultivator', 'impl_rotavator'], mode: 'residue' },
    ] },
  ]),
  soy: timed([
    { id: 'soy_till', name: '整地', lo: 3, hi: 5, color: soil, effect: '基肥和旋耕。', jobs: [
      { id: 'soy_base_fert', name: '基肥', required: true, impl: 'impl_fertilizer' },
      { id: 'soy_rotavate', name: '旋耕', required: true, impl: 'impl_rotavator' },
    ] },
    { id: 'soy_plant', name: '播种', lo: 2, hi: 3, color: soilDk, effect: '精播豆盘。走完才出苗。', jobs: [
      { id: 'soy_plant', name: '精播', required: true, impl: 'impl_seeder', mode: 'bean', plant: true },
    ] },
    { id: 'soy_veg', name: '分枝', lo: 18, hi: 25, color: young, effect: '中耕除草。', jobs: [
      { id: 'soy_weed', name: '除草', required: true, impl: 'impl_cultivator', mode: 'weed' },
    ] },
    { id: 'soy_flower', name: '结荚', lo: 25, hi: 35, color: canopy, effect: '追肥、灌溉。侦察和虫害防治只派无人机。', jobs: [
      { id: 'soy_topdress', name: '追肥', required: true, impl: 'impl_fertilizer' },
      { id: 'soy_irrigate', name: '灌溉', required: true, auto: true },
      { id: 'soy_scout', name: '侦察', required: false, drone: true, cap: 'scout' },
      { id: 'soy_treat', name: '植保', required: false, drone: true, cap: 'pest_treat', load: 'pest' },
    ] },
    { id: 'soy_fill', name: '鼓粒', lo: 15, hi: 20, color: flower, effect: '只灌溉，不追肥。', jobs: [
      { id: 'soy_irrigate_fill', name: '灌溉', required: true, auto: true },
    ] },
    { id: 'soy_harvest', name: '成熟待收', lo: 7, hi: 12, color: ochre, effect: '联合收割豆模式，停车侧卸。', jobs: [
      { id: 'soy_harvest', name: '联收', required: true, harvest: true, self: 'harvester_combine', mode: 'bean' },
    ] },
    { id: 'soy_clear', name: '清田', lo: 2, hi: 4, color: straw, effect: '碎秆。', jobs: [
      { id: 'soy_clear', name: '碎秆', required: true, afterHarvest: true, implAny: ['impl_cultivator', 'impl_rotavator'], mode: 'residue' },
    ] },
  ]),
  feed_barley: timed([
    { id: 'barley_till', name: '整地', lo: 2, hi: 4, color: soil, effect: '基肥和旋耕。', jobs: [
      { id: 'barley_base_fert', name: '基肥', required: true, impl: 'impl_fertilizer' },
      { id: 'barley_rotavate', name: '旋耕', required: true, impl: 'impl_rotavator' },
    ] },
    { id: 'barley_plant', name: '播种', lo: 1, hi: 3, color: soilDk, effect: '精播谷盘。走完才出苗。', jobs: [
      { id: 'barley_plant', name: '精播', required: true, impl: 'impl_seeder', mode: 'grain', plant: true },
    ] },
    { id: 'barley_tillering', name: '分蘖', lo: 20, hi: 28, color: young, effect: '追肥。浅中耕可选。', jobs: [
      { id: 'barley_topdress', name: '追肥', required: true, impl: 'impl_fertilizer' },
      { id: 'barley_shallow', name: '浅中耕', required: false, impl: 'impl_cultivator', mode: 'shallow' },
    ] },
    { id: 'barley_grain', name: '灌浆', lo: 25, hi: 30, color: straw, effect: '灌溉。侦察和虫害防治只派无人机，不追肥。', jobs: [
      { id: 'barley_irrigate', name: '灌溉', required: true, auto: true },
      { id: 'barley_scout', name: '侦察', required: false, drone: true, cap: 'scout' },
      { id: 'barley_treat', name: '植保', required: false, drone: true, cap: 'pest_treat', load: 'pest' },
    ] },
    { id: 'barley_harvest', name: '成熟待收', lo: 6, hi: 10, color: ochre, effect: '联合收割谷模式，停车侧卸。', jobs: [
      { id: 'barley_harvest', name: '联收', required: true, harvest: true, self: 'harvester_combine', mode: 'grain' },
    ] },
    { id: 'barley_clear', name: '清田', lo: 2, hi: 3, color: rust, effect: '碎秆。打捆以后再做。', jobs: [
      { id: 'barley_clear', name: '碎秆', required: true, afterHarvest: true, implAny: ['impl_cultivator', 'impl_rotavator'], mode: 'residue' },
    ] },
  ]),
  cabbage: timed([
    { id: 'cabbage_bed', name: '作畦', lo: 2, hi: 4, color: soil, effect: '基肥、旋耕、作畦。甘蓝苗从商店买，不在田里育。', jobs: [
      { id: 'cabbage_base_fert', name: '基肥', required: true, impl: 'impl_fertilizer' },
      { id: 'cabbage_rotavate', name: '旋耕', required: true, impl: 'impl_rotavator' },
      { id: 'cabbage_bed', name: '作畦', required: true, impl: 'impl_bedder' },
    ] },
    { id: 'cabbage_transplant', name: '定植', lo: 2, hi: 3, color: soilDk, effect: '移栽机。这趟走完才长叶。', jobs: [
      { id: 'cabbage_transplant', name: '移栽', required: true, self: 'transplanter', plant: true },
    ] },
    { id: 'cabbage_rosette', name: '莲座', lo: 25, hi: 35, color: sage, effect: '中耕、追肥、灌溉。', jobs: [
      { id: 'cabbage_cultivate', name: '中耕', required: true, impl: 'impl_cultivator', mode: 'weed' },
      { id: 'cabbage_topdress', name: '追肥', required: true, impl: 'impl_fertilizer' },
      { id: 'cabbage_irrigate', name: '灌溉', required: true, auto: true },
    ] },
    { id: 'cabbage_head', name: '结球', lo: 25, hi: 35, color: '#52747e', effect: '灌溉。侦察和虫害防治只派无人机，不追肥。', jobs: [
      { id: 'cabbage_irrigate_head', name: '灌溉', required: true, auto: true },
      { id: 'cabbage_scout', name: '侦察', required: false, drone: true, cap: 'scout' },
      { id: 'cabbage_treat', name: '植保', required: false, drone: true, cap: 'pest_treat', load: 'pest' },
    ] },
    { id: 'cabbage_harvest', name: '成熟待收', lo: 7, hi: 12, color: ochre, effect: '结球收获，停车侧卸。', jobs: [
      { id: 'cabbage_harvest', name: '收球', required: true, harvest: true, self: 'harvester_cabbage' },
    ] },
    { id: 'cabbage_clear', name: '清田', lo: 2, hi: 3, color: straw, effect: '碎茬。', jobs: [
      { id: 'cabbage_clear', name: '碎茬', required: true, afterHarvest: true, impl: 'impl_cultivator', mode: 'residue' },
    ] },
  ]),
};

for (const [id, def] of Object.entries(SURFACE_CROPS)) {
  def.id = id;
  def.logicId = 'crop_' + id;
}

SURFACE_CROPS.potato.seed = 'seed';
SURFACE_CROPS.potato.seedQty = 1;
SURFACE_CROPS.potato.planLabel = '种中熟商品薯';
SURFACE_CROPS.soy.seed = 'seed_soy';
SURFACE_CROPS.soy.seedQty = 1;
SURFACE_CROPS.soy.planLabel = '种大豆';
SURFACE_CROPS.feed_barley.seed = 'seed_barley';
SURFACE_CROPS.feed_barley.seedQty = 1;
SURFACE_CROPS.feed_barley.planLabel = '种饲料大麦';
SURFACE_CROPS.cabbage.seed = 'seedling_cabbage';
SURFACE_CROPS.cabbage.seedQty = 1;
SURFACE_CROPS.cabbage.planLabel = '种结球甘蓝';

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
  lifter: { logicId: 'harvester_potato', label: '收获机', mesh: 'harvester_potato', kit: [] },
  tractor: { logicId: 'tractor_gen', label: '拖拉机', mesh: 'tractor_gen', kit: [] },
  harvester_combine: { logicId: 'harvester_combine', label: '联合收割机', mesh: 'harvester_combine', kit: [] },
  harvester_cabbage: { logicId: 'harvester_cabbage', label: '结球收获机', mesh: 'harvester_cabbage', kit: [] },
  transplanter: { logicId: 'transplanter', label: '移栽机', mesh: 'transplanter', kit: [] },
};

// 能力是调度用的。同一类挂具可以只覆盖其中几项，参数里带速度和模式。
export const HITCH_SWAP_S = 8;
export const RELOAD_S = 6;
export const MODE_SWITCH_S = 2.5;

export const IMPLEMENTS = {
  impl_rotavator: { caps: [{ id: 'till_rotary' }] },
  impl_subsoiler: { caps: [{ id: 'till_subsoil' }] },
  impl_cultivator: { caps: [{ id: 'cultivate', modes: ['shallow', 'weed', 'hill', 'residue'] }] },
  impl_fertilizer: { caps: [{ id: 'fertilize' }] },
  impl_sprayer: { caps: [{ id: 'spray', mix: 'field' }] },
  impl_seeder: { caps: [{ id: 'seed', disc: 'bean', speed: 1 }, { id: 'seed', disc: 'grain', speed: 0.85 }] },
  impl_potato_planter: { caps: [{ id: 'plant_potato' }] },
  impl_haulm: { caps: [{ id: 'haulm' }] },
  impl_trailer: { caps: [{ id: 'haul' }] },
  impl_bedder: { caps: [{ id: 'bed' }] },
};

export const PLATFORM_CAPS = {
  harvester_potato: [{ id: 'harvest_potato' }],
  harvester_combine: [{ id: 'harvest_combine', mode: 'bean' }, { id: 'harvest_combine', mode: 'grain' }],
  harvester_cabbage: [{ id: 'harvest_cabbage' }],
  transplanter: [{ id: 'transplant' }],
  orbit_boom: [{ id: 'spray_boom' }],
};

const JOB_CAP = {
  potato_base_fert: { cap: 'fertilize', load: 'fertilizer' },
  potato_rotavate: { caps: ['till_rotary', 'till_subsoil'] },
  potato_plant: { cap: 'plant_potato', load: 'seed' },
  potato_shallow: { cap: 'cultivate' },
  potato_hill: { cap: 'cultivate' },
  potato_topdress: { cap: 'fertilize', load: 'fertilizer' },
  potato_scout: { cap: 'scout' },
  potato_treat: { cap: 'pest_treat', load: 'pest' },
  potato_haulm: { cap: 'haulm' },
  potato_harvest: { cap: 'harvest_potato' },
  potato_clear: { caps: ['cultivate', 'till_rotary'] },
  soy_base_fert: { cap: 'fertilize', load: 'fertilizer' },
  soy_rotavate: { cap: 'till_rotary' },
  soy_plant: { cap: 'seed', disc: 'bean', load: 'seed_soy' },
  soy_weed: { cap: 'cultivate' },
  soy_topdress: { cap: 'fertilize', load: 'fertilizer' },
  soy_scout: { cap: 'scout' },
  soy_treat: { cap: 'pest_treat', load: 'pest' },
  soy_harvest: { cap: 'harvest_combine', tank: 'bean' },
  soy_clear: { caps: ['cultivate', 'till_rotary'] },
  barley_base_fert: { cap: 'fertilize', load: 'fertilizer' },
  barley_rotavate: { cap: 'till_rotary' },
  barley_plant: { cap: 'seed', disc: 'grain', load: 'seed_barley' },
  barley_topdress: { cap: 'fertilize', load: 'fertilizer' },
  barley_shallow: { cap: 'cultivate' },
  barley_scout: { cap: 'scout' },
  barley_treat: { cap: 'pest_treat', load: 'pest' },
  barley_harvest: { cap: 'harvest_combine', tank: 'grain' },
  barley_clear: { caps: ['cultivate', 'till_rotary'] },
  cabbage_base_fert: { cap: 'fertilize', load: 'fertilizer' },
  cabbage_rotavate: { cap: 'till_rotary' },
  cabbage_bed: { cap: 'bed' },
  cabbage_transplant: { cap: 'transplant', load: 'seedling_cabbage' },
  cabbage_cultivate: { cap: 'cultivate' },
  cabbage_topdress: { cap: 'fertilize', load: 'fertilizer' },
  cabbage_scout: { cap: 'scout' },
  cabbage_treat: { cap: 'pest_treat', load: 'pest' },
  cabbage_harvest: { cap: 'harvest_cabbage' },
  cabbage_clear: { cap: 'cultivate' },
};

for (const def of Object.values(SURFACE_CROPS)) {
  for (const job of def.jobs) {
    const extra = JOB_CAP[job.id];
    if (!extra) continue;
    if (extra.cap) job.cap = extra.cap;
    if (extra.caps) job.caps = extra.caps;
    if (extra.load) job.load = extra.load;
    if (extra.disc) job.disc = extra.disc;
    if (extra.tank) job.tank = extra.tank;
  }
}

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
  drone_scout: { logicId: 'drone_scout', label: '侦察无人机', caps: [{ id: 'scout' }] },
  drone_treat: { logicId: 'drone_treat', label: '植保无人机', caps: [{ id: 'pest_treat' }] },
};

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
