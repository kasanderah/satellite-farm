// 框架 B · 最小闭环
// 整地和种植是两条平行的阶段链。硬作业锁住整块田，做完才改地面样子。
// 作业进行中可以按幅宽扫过下一道样子；做完蒙版拿掉，整块定稿。软作业这一刀没有。

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
};

export const GROUNDS = {
  raw: { id: 'raw', name: '未整地' },
  general: { id: 'general', name: '一般田地' },
};

// look 为「不影响」时，做完也不改田面。阶段图负责往下一站走。
export const JOBS = {
  plow: { id: 'plow', name: '犁地', kind: 'hard', caps: ['犁田'], look: 'general' },
  sow: { id: 'sow', name: '播种', kind: 'hard', caps: ['播种'], look: 'sown' },
  harvest: { id: 'harvest', name: '收割', kind: 'hard', caps: ['收割'], look: 'harvested' },
  tidy: { id: 'tidy', name: '收拾', kind: 'hard', caps: ['收拾'], look: 'general' },
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

export const GROW_SECONDS = 36;

export const PLANT_CROPS = {
  lastika: {
    id: 'lastika',
    name: '拉斯提卡',
    grounds: ['general'],
    growSeconds: GROW_SECONDS,
    // 株高、垄距、株距只属于拉斯提卡。不要借商品薯的 0.55 / 0.90 / 0.40。
    visual: { shape: 'bush', tex: 'ridges', height: 0.7, row: 0.75, along: 0.36 },
    stages: [
      { id: 'sow', name: '播种', kind: 'hard', job: 'sow' },
      { id: 'mature', name: '成熟', kind: 'time' },
      { id: 'harvest', name: '收割', kind: 'hard', job: 'harvest' },
      { id: 'tidy', name: '收拾', kind: 'hard', job: 'tidy' },
    ],
  },
};

export const OMNI = {
  id: 'omni',
  classId: 'self',
  className: '自走机',
  integral: true,
  name: '万能农机',
  caps: ['犁田', '播种', '收割', '收拾'],
  origin: 3.2,
  width: 16,
  workSpeed: 18,
  cruiseSpeed: 28,
  powerOutKw: 80,
  energy: 'electric',
  energyKwh: 180,
};

export function plotAddress(i, j, originI, originJ) {
  const x = i - originI;
  const y = j - originJ;
  return { hub: HUB_PLOT, x, y, code: `P(${x},${y})` };
}

export function lookG(look, growFrac = 0) {
  if (look === 'raw') return 0;
  if (look === 'general') return 1;
  if (look === 'sown') return 2 + Math.min(0.999, Math.max(0, growFrac)) * 3;
  if (look === 'mature') return 5;
  if (look === 'harvested') return 7;
  return null;
}

// 空闲和做完：mask -1，整块一个颜色。作业中 sweep 把机具幅宽和趟进度交给着色器，next 是扫过之后的样子。
// 没下过第一道活的田 look 是 hold，空闲仍留开局定格冠层。犁地开工不换底：keep 表示未扫过继续用那套填充，扫过才换成下一道。做完整块才定稿。
export function fieldShader(unit) {
  if (!unit) return null;
  const sweep = unit.sweep;
  const sweeping = !!(sweep && sweep.width > 0);
  const g = lookG(unit.look, unit.growFrac || 0);
  if (g == null && !sweeping) return null;
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
    busy: false,
  };
  farm.machines.push(machine);
  return machine;
}

function pushEvent(farm, ev) {
  farm.events.push(ev);
  if (farm.events.length > 40) farm.events.shift();
}

function queued(farm, fieldId) {
  return farm.queue.some(item => item.fieldId === fieldId);
}

function fieldLocked(farm, field) {
  return !!field.lock || queued(farm, field.id);
}

export function requestPrep(farm, fieldId, recipeId = 'clear_general') {
  const field = farm.fields.get(fieldId);
  const recipe = PREP_RECIPES[recipeId];
  if (!field || !recipe) return { ok: false, reason: 'field' };
  if (field.plant) return { ok: false, reason: 'planting' };
  if (fieldLocked(farm, field)) return { ok: false, reason: 'lock' };
  if (field.ground === recipe.target) return { ok: true, skipped: true, ground: field.ground };
  field.prep = { recipeId: recipe.id, step: 0 };
  const job = JOBS[recipe.steps[0]];
  farm.queue.push({ id: farm.seq++, fieldId, jobId: job.id, caps: job.caps.slice(), lane: 'prep' });
  pushEvent(farm, { type: 'request', lane: 'prep', fieldId, recipeId: recipe.id, jobId: job.id });
  dispatch(farm);
  return { ok: true, queued: true, jobId: job.id };
}

export function requestPlant(farm, fieldId, cropId = 'lastika') {
  const field = farm.fields.get(fieldId);
  const crop = PLANT_CROPS[cropId];
  if (!field || !crop) return { ok: false, reason: 'crop' };
  if (field.plant) return { ok: false, reason: 'busy' };
  if (fieldLocked(farm, field)) return { ok: false, reason: 'lock' };
  if (!crop.grounds.includes(field.ground)) return { ok: false, reason: 'ground' };
  field.plant = {
    cropId: crop.id,
    index: 0,
    stageId: crop.stages[0].id,
    grow: 0,
    need: crop.growSeconds,
    clock: false,
  };
  const job = JOBS[crop.stages[0].job];
  farm.queue.push({ id: farm.seq++, fieldId, jobId: job.id, caps: job.caps.slice(), lane: 'plant' });
  pushEvent(farm, { type: 'request', lane: 'plant', fieldId, cropId: crop.id, jobId: job.id });
  dispatch(farm);
  return { ok: true, queued: true, jobId: job.id };
}

function machineScore(machine, caps) {
  if (machine.busy) return null;
  if (machine.classId === 'hitch') return null;
  if (!caps.every(cap => machine.caps.includes(cap))) return null;
  if (machine.energyLeft <= 0 && machine.energy) return null;
  return machine.width * machine.workSpeed;
}

function dispatch(farm) {
  let guard = 0;
  while (farm.queue.length && guard++ < 8) {
    const item = farm.queue[0];
    const field = farm.fields.get(item.fieldId);
    if (!field || field.lock) {
      farm.queue.shift();
      continue;
    }
    let best = null;
    let bestScore = -1;
    for (const machine of farm.machines) {
      const score = machineScore(machine, item.caps);
      if (score == null || score <= bestScore) continue;
      best = machine;
      bestScore = score;
    }
    if (!best) return;
    farm.queue.shift();
    const order = {
      id: farm.seq++,
      fieldId: field.id,
      jobId: item.jobId,
      machineId: best.id,
      lane: item.lane,
      width: best.width,
      origin: best.origin,
      progress: 0,
      phase: 'cruise',
      pose: null,
    };
    writePose(farm, order);
    field.lock = order.id;
    best.busy = true;
    farm.orders.push(order);
    pushEvent(farm, { type: 'dispatch', fieldId: field.id, jobId: item.jobId, machineId: best.id, width: order.width, origin: order.origin });
  }
}

function passesOf(order, field) {
  return Math.max(1, Math.ceil(field.width / order.width));
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

function applyLook(field, job) {
  if (!job || !job.look || job.look === '不影响') return false;
  field.look = job.look;
  return true;
}

function finishOrder(farm, order) {
  const field = farm.fields.get(order.fieldId);
  const job = JOBS[order.jobId];
  const machine = orderMachine(farm, order);
  farm.orders = farm.orders.filter(item => item !== order);
  if (machine) machine.busy = false;
  if (field) field.lock = null;
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
    const crop = PLANT_CROPS[field.plant.cropId];
    const stage = crop.stages[field.plant.index];
    if (stage && stage.job === job.id) {
      if (stage.id === 'tidy') {
        field.ground = 'general';
        field.plant = null;
        field.look = 'general';
        pushEvent(farm, { type: 'ground', fieldId: field.id, ground: 'general' });
      } else {
        field.plant.index += 1;
        const next = crop.stages[field.plant.index];
        field.plant.stageId = next.id;
        if (next.kind === 'time') {
          field.plant.grow = 0;
          field.plant.clock = true;
          pushEvent(farm, { type: 'clock-start', fieldId: field.id, stageId: next.id });
        } else if (next.kind === 'hard') {
          const nextJob = JOBS[next.job];
          farm.queue.push({ id: farm.seq++, fieldId: field.id, jobId: nextJob.id, caps: nextJob.caps.slice(), lane: 'plant' });
        }
      }
    }
  }
}

function growthLeft(field) {
  if (!field.plant?.clock || field.lock) return null;
  return Math.max(0, field.plant.need - field.plant.grow);
}

function applyGrowth(farm, slice, skipId) {
  for (const field of farm.fields.values()) {
    if (field.id === skipId) continue;
    if (!field.plant?.clock || field.lock) continue;
    field.plant.grow += slice;
  }
}

function finishGrowth(farm) {
  for (const field of farm.fields.values()) {
    if (!field.plant?.clock || field.lock) continue;
    if (field.plant.grow + 1e-6 < field.plant.need) continue;
    const crop = PLANT_CROPS[field.plant.cropId];
    field.plant.grow = field.plant.need;
    field.plant.clock = false;
    field.plant.index += 1;
    const next = crop.stages[field.plant.index];
    field.plant.stageId = next.id;
    field.look = 'mature';
    pushEvent(farm, { type: 'stage', fieldId: field.id, stageId: next.id });
    if (next.kind === 'hard') {
      const job = JOBS[next.job];
      farm.queue.push({ id: farm.seq++, fieldId: field.id, jobId: job.id, caps: job.caps.slice(), lane: 'plant' });
    }
  }
}

export function stepFarm(farm, dt, env = null) {
  if (!(dt > 0)) return farm;
  let left = dt;
  for (let guard = 0; guard < 48 && left > 1e-6; guard++) {
    dispatch(farm);
    const order = farm.orders[0] || null;
    if (order?.phase === 'work') {
      const field = farm.fields.get(order.fieldId);
      const passes = passesOf(order, field);
      const cur = passIndex(order, field);
      if (cur < passes - 1) {
        const remain = (cur + 1) * field.length - order.progress * metersOf(order, field);
        if (remain <= 1e-3) beginTurn(order, field, cur);
      }
    }
    if (order?.phase === 'cruise') {
      const eta = env?.eta ? env.eta(farm, order) : 0;
      if (!(eta > 1e-4)) {
        order.phase = 'work';
        writePose(farm, order);
      }
    }
    let horizon = Infinity;
    if (order?.phase === 'cruise') horizon = env.eta(farm, order);
    if (order?.phase === 'work') horizon = Math.min(horizon, secondsLeft(farm, order), secondsToTurn(farm, order));
    if (order?.phase === 'turn') horizon = Math.min(horizon, Math.max(0, TURN_SECONDS - (order.turnT || 0)));
    for (const field of farm.fields.values()) {
      const wait = growthLeft(field);
      if (wait != null) horizon = Math.min(horizon, wait);
    }
    if (!isFinite(horizon)) {
      applyGrowth(farm, left, null);
      if (env?.idle) env.idle(farm, left);
      break;
    }
    const slice = Math.min(left, Math.max(horizon, 0));
    if (!(slice > 1e-8)) break;
    if (order?.phase === 'cruise' && env?.cruise) env.cruise(farm, order, slice);
    const skip = order && (order.phase === 'work' || order.phase === 'cruise') ? order.fieldId : null;
    if (order?.phase === 'work') advanceWork(farm, order, slice);
    if (order?.phase === 'turn') {
      order.turnT = (order.turnT || 0) + slice;
      if (order.turnT >= TURN_SECONDS - 1e-6) {
        order.phase = 'work';
        order.pose = order.turnTo;
        order.turnT = 0;
      }
    }
    applyGrowth(farm, slice, skip);
    left -= slice;
    if (order?.phase === 'work' && order.progress >= 1 - 1e-9) finishOrder(farm, order);
    finishGrowth(farm);
  }
  dispatch(farm);
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
  };
}

export function describeField(farm, fieldId) {
  const field = farm.fields.get(fieldId);
  if (!field) return null;
  const work = fieldWork(farm, fieldId);
  const job = work ? JOBS[work.jobId] : null;
  const pct = work ? Math.round(work.progress * 100) : 0;
  const crop = field.plant ? PLANT_CROPS[field.plant.cropId] : null;
  let stat = GROUNDS[field.ground]?.name || field.ground;
  if (field.look === 'raw' && !work) stat = '未整地 · 整地后成为一般田地';
  else if (field.ground === 'general' && !field.plant && !work) stat = '一般田地 · 可以种植拉斯提卡';
  if (work && job) {
    const name = crop ? crop.name + ' · ' : (work.lane === 'prep' ? '清地 · ' : '');
    const where = work.phase === 'cruise' ? '农机正在开来' : work.phase === 'turn' ? '地头转弯' : `${job.name} ${pct}%`;
    stat = `${name}${where}`;
  } else if (field.plant?.clock) {
    const sec = Math.floor(field.plant.grow);
    stat = `${crop.name} · 播种已完成 · 生长 ${sec} / ${field.plant.need} 秒`;
  } else if (field.plant && !work) {
    const stage = crop.stages[field.plant.index];
    stat = `${crop.name} · ${stage?.name || ''}`;
  }
  const jobs = [];
  if (work && job) jobs.push({ id: job.id, name: job.name, status: work.phase === 'cruise' ? '开来' : work.phase === 'turn' ? '转弯' : '执行中', pct });
  else if (field.plant?.clock) jobs.push({ id: 'mature', name: '成熟', status: '生长', pct: Math.round(field.plant.grow / field.plant.need * 100) });
  const chips = crop
    ? crop.stages.map((s, i) => ({ name: s.name, on: i === field.plant.index }))
    : [{ name: field.ground === 'general' ? '一般田地' : '未整地', on: true }];
  const bar = work ? work.progress : (field.plant?.clock ? field.plant.grow / field.plant.need : 0);
  return {
    plot: field.plot,
    ground: field.ground,
    groundName: GROUNDS[field.ground]?.name || field.ground,
    look: field.look,
    stat,
    jobs,
    chips,
    bar,
    canPrep: !field.plant && !fieldLocked(farm, field) && field.ground !== 'general',
    canPlant: !field.plant && !fieldLocked(farm, field) && field.ground === 'general',
    crop: crop ? crop.name : null,
  };
}
