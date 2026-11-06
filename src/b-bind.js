// 把框架 B 接到环面上的一块田。旧的垄扫不读这里的工单。
import {
  OMNI, TRACTOR, PLOW, JOBS, TURN_SECONDS, createFarm, addField, addMachine, mountHitch,
  requestPrep, requestPlant, setNextCrop, stepFarm, describeField, plotAddress, growthAge, workSweepLook, paintGroundOf, PLANT_CROPS, FIELD_BLOCKS,
  cycleDays, installPlayerMachine, removePlayerMachine, recallMachine, releaseStandby, standbyClock,
  settleSoft,
} from './framework-b.js';
import { roadRoute, L, stores, economy } from './_shared.js';
import { NAV_RETRY_S } from './build/nav.js';
import { slotKey, claimJob, tickTrusses, syncSlots, trussSlots, tipOnce, listRigs, decideTrussClaim, SPRAY_NEED, FERT_NEED, TRUSS_POWER, TRUSS_SPEED } from './truss.js';

let farm = null;
let ctx = null;
const byKey = new Map();

export function fieldKey(f) {
  return f.i + ':' + f.j;
}

function driveRigs() {
  return ctx.rigs.filter(r => r.bDrive);
}

function rigFor(machineId) {
  return driveRigs().find(r => r.machineId === machineId) || null;
}

function machineOf(id) {
  return farm?.machines.find(m => m.id === id) || null;
}

function meshOf(id) {
  return byKey.get(id) || null;
}

export function rowHeading(f, along) {
  if (f.dir === 0) return along;
  return along === 0 ? Math.PI / 2 : -Math.PI / 2;
}

function worldPose(f, pose) {
  const [x, z] = ctx.toWorld(f, pose.u, pose.v);
  return { x, z, ang: rowHeading(f, pose.heading) };
}

function moveToward(unit, x, z, ang, speed, slice) {
  const dx = x - unit.x;
  const dz = z - unit.z;
  const dist = Math.hypot(dx, dz);
  const step = speed * slice;
  if (dist <= step || dist < 0.8) {
    unit.x = x;
    unit.z = z;
    unit.ang = ang;
    return 0;
  }
  unit.x += dx / dist * step;
  unit.z += dz / dist * step;
  unit.ang = Math.atan2(dz, dx);
  return dist - step;
}

function ensureRoad(unit, x, z) {
  const key = `${x.toFixed(1)},${z.toFixed(1)}`;
  if (unit.routeKey === key && unit.route) return;
  unit.routeKey = key;
  unit.route = roadRoute(unit.x, unit.z, x, z);
  unit.ri = 0;
}

function followRoad(unit, x, z, ang, speed, slice) {
  if (unit.navFail && !unit.navRetryDue) return;
  if (unit.navRetryDue) {
    unit.routeKey = '';
    unit.route = null;
    unit.ri = 0;
    unit.navRetryDue = false;
  }
  ensureRoad(unit, x, z);
  const pts = unit.route || [[x, z]];
  if (!pts.blocked) unit.navFail = '';
  let left = speed * slice;
  while (unit.ri < pts.length && left > 0) {
    const [px, pz] = pts[unit.ri];
    const dist = Math.hypot(px - unit.x, pz - unit.z);
    if (dist <= left || dist < 0.8) {
      left -= Math.min(left, dist);
      unit.x = px;
      unit.z = pz;
      unit.ri += 1;
      continue;
    }
    unit.x += (px - unit.x) / dist * left;
    unit.z += (pz - unit.z) / dist * left;
    unit.ang = Math.atan2(pz - unit.z, px - unit.x);
    return;
  }
  unit.ang = ang;
  if (unit.ri >= pts.length && pts.blocked && Math.hypot(unit.x - x, unit.z - z) > 6) {
    if (!unit.navFail) unit.navRetry = 0;
    unit.navFail = '路被建筑挡住，绕不过去';
  } else if (!(unit.navFail && unit.ri >= pts.length)) unit.navFail = '';
}

function roadLeft(unit, x, z) {
  ensureRoad(unit, x, z);
  const pts = unit.route || [[x, z]];
  let d = 0;
  let px = unit.x;
  let pz = unit.z;
  for (let i = unit.ri || 0; i < pts.length; i++) {
    d += Math.hypot(pts[i][0] - px, pts[i][1] - pz);
    px = pts[i][0];
    pz = pts[i][1];
  }
  return d;
}

function readout(order, unit) {
  const job = order ? JOBS[order.jobId] : null;
  const machine = order ? machineOf(order.machineId) : machineOf(unit?.machineId);
  const home = !order && unit && Math.hypot(unit.x - unit.parkX, unit.z - unit.parkZ) <= 1.2;
  let doing = '停在机库';
  if (unit?.navFail) doing = unit.navFail;
  else if (machine?.standby > 0) doing = `待机剩余 ${standbyClock(machine)}`;
  else if (machine?.recall === 'wait') doing = '等硬作业做完';
  else if (order?.phase === 'cruise') doing = '开往田块';
  else if (order?.phase === 'turn') doing = '地头转弯';
  else if (order?.phase === 'work') doing = job?.name || '作业';
  else if (!home) doing = '返回机库';
  const moving = (!!order || !home) && !unit?.navFail;
  const rated = order?.phase === 'work' ? (machine?.workSpeed || 0) : (machine?.cruiseSpeed || 0);
  return {
    speed: moving && !ctx.paused() ? rated : 0,
    doing,
    frac: order ? order.progress : 0,
    eta: order ? formatWallEta(orderSimSeconds(order)) : '',
    charge: unit?.charge ?? 1,
    job: order?.jobId || null,
    light: null,
  };
}

function turnArc(a, b, t) {
  const chord = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const handle = Math.max(8, chord * 0.55);
  const p1x = a.x + Math.cos(a.ang) * handle;
  const p1z = a.z + Math.sin(a.ang) * handle;
  const p2x = b.x - Math.cos(b.ang) * handle;
  const p2z = b.z - Math.sin(b.ang) * handle;
  const u = 1 - t;
  const x = u * u * u * a.x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * b.x;
  const z = u * u * u * a.z + 3 * u * u * t * p1z + 3 * u * t * t * p2z + t * t * t * b.z;
  const dx = 3 * u * u * (p1x - a.x) + 6 * u * t * (p2x - p1x) + 3 * t * t * (b.x - p2x);
  const dz = 3 * u * u * (p1z - a.z) + 6 * u * t * (p2z - p1z) + 3 * t * t * (b.z - p2z);
  return { x, z, ang: Math.atan2(dz, dx) };
}

function paintRig(order, unit) {
  if (!unit) return;
  unit.bWidth = order?.width || unit.bWidth;
  unit.busy = !!order;
  unit.bRead = readout(order, unit);
  const f = order ? meshOf(order.fieldId) : null;
  if (order?.phase === 'turn' && f && order.turnFrom && order.turnTo) {
    const a = worldPose(f, order.turnFrom);
    const b = worldPose(f, order.turnTo);
    const t = Math.max(0, Math.min(1, (order.turnT || 0) / TURN_SECONDS));
    const at = turnArc(a, b, t);
    unit.x = at.x;
    unit.z = at.z;
    unit.ang = at.ang;
    return;
  }
  if (order?.phase !== 'work') return;
  if (!f || !order.pose) return;
  const at = worldPose(f, order.pose);
  unit.x = at.x;
  unit.z = at.z;
  unit.ang = at.ang;
}

const SPECS = { omni: OMNI, tractor: TRACTOR };

function paintHitch(rig, hitchId) {
  if (!rig || rig.kind !== 'tractor') return;
  if (hitchId) {
    rig.impl = 'impl_subsoiler';
    rig.hitchId = hitchId;
    rig.role = '拖拉机+犁';
    rig.caps = PLOW.caps.slice();
    rig.bWidth = PLOW.width;
    return;
  }
  rig.impl = null;
  rig.hitchId = null;
  rig.role = '拖拉机';
  rig.caps = [];
  rig.bWidth = TRACTOR.width;
}

function refreshHitches() {
  if (!farm || !ctx) return;
  for (const rig of ctx.rigs) {
    if (rig.kind === 'tractor') {
      const machine = farm.machines.find(m => m.id === rig.machineId);
      paintHitch(rig, machine?.hitchId || null);
    } else if (rig.kind === 'plow') {
      const hitch = farm.machines.find(m => m.id === rig.machineId);
      rig.hitched = !!hitch?.hostId;
      rig.role = rig.hitched ? '挂在拖拉机上' : '还没有拖拉机';
    }
  }
}

export function dropDrive(machineId) {
  if (!farm || !machineId) return { ok: true };
  const gone = removePlayerMachine(farm, machineId);
  if (!gone.ok) return gone;
  refreshHitches();
  return gone;
}

export function adoptBought(rig) {
  if (!farm || !rig) return null;
  const linked = installPlayerMachine(farm, rig.kind, rig.id);
  if (!linked) return null;
  rig.machineId = linked.id;
  if (rig.kind === 'plow') {
    rig.bDrive = false;
    rig.label = '犁';
    rig.hitched = !!linked.mounted;
    rig.role = linked.mounted ? '挂在拖拉机上' : '还没有拖拉机';
    refreshHitches();
    return linked;
  }
  rig.bDrive = true;
  rig.label = rig.kind === 'tractor' ? '拖拉机' : '万能农机';
  rig.caps = linked.caps.slice();
  rig.role = linked.role;
  rig.bWidth = linked.width;
  rig.hitchId = linked.hitchId || null;
  if (rig.kind === 'tractor') paintHitch(rig, linked.hitchId);
  refreshHitches();
  return linked;
}

export function bootSlice(next) {
  ctx = next;
  farm = createFarm();
  byKey.clear();
  const keep = ctx.rigs.filter(r => r.bDrive || r.kind === 'plow');
  ctx.rigs.length = 0;
  for (const unit of keep) {
    if (!unit.bDrive) {
      ctx.rigs.push(unit);
      continue;
    }
    const spec = SPECS[unit.machineId] || SPECS[unit.kind] || OMNI;
    unit.machineId = spec.id;
    if (!farm.machines.some(m => m.id === spec.id)) {
      addMachine(farm, { ...spec, caps: spec.caps.slice(), energyLeft: spec.energyKwh });
    }
    unit.x = unit.parkX;
    unit.z = unit.parkZ;
    unit.ang = -Math.PI / 2;
    unit.busy = false;
    unit.mode = 'park';
    unit.bWidth = spec.width;
    unit.label = spec.name;
    unit.caps = spec.caps.slice();
    unit.role = spec.integral ? '自走一体' : '自走机';
    ctx.rigs.push(unit);
  }
  if (!farm.machines.some(m => m.id === PLOW.id) && farm.machines.some(m => m.id === TRACTOR.id)) {
    addMachine(farm, { ...PLOW, caps: PLOW.caps.slice() });
    mountHitch(farm, PLOW.id, TRACTOR.id);
    const tractor = rigFor(TRACTOR.id);
    if (tractor) {
      tractor.impl = 'impl_subsoiler';
      tractor.hitchId = PLOW.id;
      tractor.role = '拖拉机+犁';
      tractor.caps = PLOW.caps.slice();
      tractor.bWidth = PLOW.width;
    }
  }
  for (const f of ctx.fields) {
    if (!f.owned || f.equip) continue;
    const addr = plotAddress(f.i, f.j, ctx.originI, ctx.originJ);
    const focus = f.i === ctx.focus.i && f.j === ctx.focus.j;
    addField(farm, {
      id: fieldKey(f),
      length: ctx.length,
      width: ctx.width,
      ground: 'raw',
      look: focus ? 'raw' : 'hold',
      plot: addr.code,
    });
    byKey.set(fieldKey(f), f);
    f.live = false;
    f.hold = true;
    f.s = 0;
    delete f.jobS;
    delete f.laneW;
  }
  syncFields();
  for (const unit of driveRigs()) paintRig(null, unit);
  return farm;
}

// 买地之后把新拥有的田登记进农场。不在这里写购买规则。卖掉的空闲田从农场拿掉。
export function syncOwnedFields() {
  if (!farm || !ctx) return;
  for (const f of ctx.fields) {
    const id = fieldKey(f);
    if (f.owned && !f.equip && !farm.fields.has(id)) {
      const addr = plotAddress(f.i, f.j, ctx.originI, ctx.originJ);
      addField(farm, {
        id,
        length: ctx.length,
        width: ctx.width,
        ground: 'raw',
        look: 'hold',
        plot: addr.code,
      });
      byKey.set(id, f);
      f.live = false;
      f.hold = true;
      f.s = 0;
      delete f.jobS;
      delete f.laneW;
    } else if ((!f.owned || f.equip) && farm.fields.has(id)) {
      farm.queue = farm.queue.filter(item => item.fieldId !== id);
      for (const order of [...farm.orders]) if (order.fieldId === id) farm.orders.splice(farm.orders.indexOf(order), 1);
      farm.fields.delete(id);
      byKey.delete(id);
      delete f.bUnit;
    }
  }
  syncFields();
}

function syncFields() {
  for (const [id, f] of byKey) {
    const unit = farm.fields.get(id);
    if (!unit) continue;
    const desc = describeField(farm, id);
    const crop = PLANT_CROPS[unit.plant?.cropId];
    const stage = crop?.stages.find(item => item.id === unit.plant?.stageId);
    const timed = !!(stage && Number(stage.days) > 0);
    const fullAt = crop?.maturity?.fullAt || 10;
    const frac = unit.plant
      ? Math.min(0.999, Math.max(0, growthAge(unit) / fullAt))
      : Math.min(0.999, unit.heldFrac || 0);
    const order = farm.orders.find(item => item.fieldId === id);
    const sweeping = order && (order.phase === 'work' || order.phase === 'turn') && order.pose;
    const shown = paintGroundOf(unit);
    const shownRow = FIELD_BLOCKS[shown]?.row || FIELD_BLOCKS[shown]?.ridgeWidth || FIELD_BLOCKS[unit.ground]?.row || FIELD_BLOCKS[unit.ground]?.ridgeWidth || 0;
    f.bUnit = {
      look: unit.look,
      growFrac: unit.look === 'sown' ? frac : 0,
      timed,
      age: timed ? growthAge(unit) : 0,
      cycle: timed ? (cycleDays(crop) || 1) : 1,
      brushFade: unit.brushFade ? { left: unit.brushFade.left, span: unit.brushFade.span, look: unit.brushFade.look } : null,
      stageFade: unit.stageFade ? { left: unit.stageFade.left, span: unit.stageFade.span, fromG: unit.stageFade.fromG, toG: unit.stageFade.toG } : null,
      text: desc?.stat || '',
      label: desc?.float || '',
      ground: unit.ground,
      paintGround: shown,
      plot: unit.plot,
      cropId: unit.plant?.cropId || '',
      row: shownRow,
      ridgeWidth: shownRow,
      ridgeScale: Number(unit.ridgeScale) > 0 ? Number(unit.ridgeScale) : 1,
    };
    const jobDef = order ? JOBS[order.jobId] : null;
    const spec = jobDef && stage ? (stage.jobs || []).find(item => item.job === order.jobId) : null;
    const sweepJob = jobDef && spec?.brush ? { ...jobDef, brush: { ...(jobDef.brush || {}), ...spec.brush } } : jobDef;
    const sweepLook = sweepJob ? workSweepLook(sweepJob) : null;
    if (sweeping && sweepLook) {
      f.bUnit.sweep = {
        width: order.width,
        pass: order.pose.pass,
        alongFrac: order.pose.alongFrac || 0,
        look: sweepLook,
      };
    }
  }
}

function stockFor(jobId) {
  if (jobId === 'spray') {
    if (stores.spray < SPRAY_NEED) return { ok: false, tip: '药不够，桁架不能撒药' };
    return { ok: true, take() { stores.spray -= SPRAY_NEED; } };
  }
  if (stores.fertilizer < FERT_NEED) return { ok: false, tip: '肥料不够，桁架不能追肥' };
  return { ok: true, take() { stores.fertilizer -= FERT_NEED; } };
}

function claimSoft(_farm, field, job) {
  if (job.id !== 'spray' && job.id !== 'topdress') return false;
  const book = field.plant?.soft?.[job.id];
  const note = (text) => { if (book) book.note = text || ''; };
  const mesh = meshOf(field.id);
  if (!mesh) {
    const missed = decideTrussClaim({ bought: false, stockOk: true, powerOk: true, parked: false, jobId: job.id });
    note(missed.tip);
    return false;
  }
  const key = slotKey(mesh.i, mesh.j, L.PER);
  const slots = trussSlots(ctx.fields, Math.floor(mesh.i / L.PER), Math.floor(mesh.j / L.PER), L.PER, ctx.length);
  syncSlots(slots);
  const slot = slots.find(item => item.key === key);
  const rig = listRigs().find(item => item.key === key);
  const stock = stockFor(job.id);
  const decision = decideTrussClaim({
    bought: !!slot?.bought,
    stockOk: !slot?.bought || stock.ok,
    stockTip: stock.tip,
    powerOk: economy.revenue >= TRUSS_POWER,
    parked: !!(rig && rig.phase === 'park' && !rig.job),
    jobId: job.id,
  });
  if (!decision.ok) {
    if (decision.tip) tipOnce(`${key}:${decision.reason}:${job.id}`, decision.tip);
    note(decision.reason === 'none' && job.id === 'topdress' ? '' : decision.tip);
    return false;
  }
  const head = ctx.fields.find(item => item.i === Math.floor(mesh.i / L.PER) * L.PER && item.j === mesh.j);
  const goalU = head ? (mesh.x0 - head.x0) : 0;
  if (!claimJob(key, { fieldId: field.id, jobId: job.id, goalU, len: ctx.length })) {
    note('这行桁架还在干活');
    tipOnce(`${key}:busy:${job.id}`, '这行桁架还在干活');
    return false;
  }
  stock.take();
  economy.revenue -= TRUSS_POWER;
  note('');
  settleSoft(_farm, field.id, job.id, 0);
  return true;
}

export function formatWallEta(simSeconds, timeScale = economy.timeScale) {
  const scale = Number(timeScale) > 0 ? Number(timeScale) : 1;
  if (!(simSeconds >= 0) || !Number.isFinite(simSeconds)) return '';
  const wall = simSeconds / scale;
  if (wall < 1) return '剩余不足 1 秒（现实）';
  if (wall < 90) return `剩余约 ${Math.round(wall)} 秒（现实）`;
  const mins = wall / 60;
  if (mins < 90) return `剩余约 ${Math.max(1, Math.round(mins))} 分（现实）`;
  return `剩余约 ${Math.round(mins / 60)} 小时（现实）`;
}

function orderSimSeconds(order) {
  const field = farm?.fields.get(order.fieldId);
  const machine = machineOf(order.machineId);
  if (!field || !machine) return null;
  if (order.phase === 'turn') return Math.max(0, TURN_SECONDS - (order.turnT || 0));
  if (order.phase === 'work') {
    const span = order.width > 0 ? order.width : field.width;
    const passes = Math.max(1, Math.ceil(field.width / span));
    const remain = Math.max(0, 1 - (order.progress || 0)) * passes * field.length;
    return machine.workSpeed > 0 ? remain / machine.workSpeed : null;
  }
  if (order.phase === 'cruise') {
    const mesh = meshOf(order.fieldId);
    const unit = rigFor(order.machineId);
    if (!mesh || !unit || !(machine.cruiseSpeed > 0) || !order.pose) return null;
    const at = worldPose(mesh, order.pose);
    return roadLeft(unit, at.x, at.z) / machine.cruiseSpeed;
  }
  return null;
}

function trussSimSeconds(rig) {
  if (!rig?.job || !(TRUSS_SPEED > 0)) return null;
  const goal = Number(rig.job.goalU) || 0;
  const len = Number(rig.job.len) || 0;
  const here = Number(rig.u) || 0;
  const left = rig.phase === 'go' ? Math.max(0, goal - here) + len : Math.max(0, goal + len - here);
  return left / TRUSS_SPEED;
}

export function trussWallEta(rig) {
  return formatWallEta(trussSimSeconds(rig));
}

function etaForFieldJob(mesh, job) {
  if (!farm || !mesh) return '';
  const id = fieldKey(mesh);
  const order = farm.orders.find(item => item.fieldId === id && item.jobId === job.id);
  if (order) return formatWallEta(orderSimSeconds(order));
  const truss = listRigs().find(rig => rig.job && rig.job.fieldId === id && rig.job.jobId === job.id);
  if (truss) return formatWallEta(trussSimSeconds(truss));
  if (job.status === '未执行' || job.status === '排队' || job.status === '等待' || job.status === '可派') {
    return job.status === '未执行' && job.note ? '' : '待派';
  }
  return '';
}

function releaseUnlinkedCruise() {
  if (!farm) return;
  for (const order of [...farm.orders]) {
    if (order.phase !== 'cruise') continue;
    if (rigFor(order.machineId)) continue;
    const machine = machineOf(order.machineId);
    if (machine) {
      machine.busy = false;
      if (order.hitchId) {
        const hitch = farm.machines.find(item => item.id === order.hitchId);
        if (hitch) hitch.busy = false;
      }
    }
    const field = farm.fields.get(order.fieldId);
    if (field && field.lock === order.id) field.lock = null;
    farm.orders = farm.orders.filter(item => item !== order);
    const job = JOBS[order.jobId];
    farm.queue.push({
      id: farm.seq++,
      fieldId: order.fieldId,
      jobId: order.jobId,
      caps: job?.caps ? job.caps.slice() : [],
      lane: order.lane || 'plant',
    });
  }
}

export function tickSlice(dt) {
  if (!farm || !ctx || !(dt > 0)) return;
  for (const unit of driveRigs()) {
    if (!unit.navFail) continue;
    unit.navRetry = (unit.navRetry || 0) + dt;
    if (unit.navRetry >= NAV_RETRY_S) {
      unit.navRetry = 0;
      unit.navRetryDue = true;
    }
  }
  releaseUnlinkedCruise();
  stepFarm(farm, dt, {
    eta(_farm, order) {
      const f = meshOf(order.fieldId);
      const unit = rigFor(order.machineId);
      const machine = machineOf(order.machineId);
      if (!f || !unit || !order.pose || !machine) return 0;
      const at = worldPose(f, order.pose);
      const dist = roadLeft(unit, at.x, at.z);
      if (dist < 1.5) return 0;
      return dist / machine.cruiseSpeed;
    },
    cruise(_farm, order, slice) {
      const f = meshOf(order.fieldId);
      const unit = rigFor(order.machineId);
      const machine = machineOf(order.machineId);
      if (!f || !unit || !order.pose || !machine) return;
      const at = worldPose(f, order.pose);
      followRoad(unit, at.x, at.z, at.ang, machine.cruiseSpeed, slice);
    },
    claimSoft,
    travel(_farm, fieldId, machineId) {
      const f = meshOf(fieldId);
      const unit = rigFor(machineId);
      const machine = machineOf(machineId);
      if (!f || !unit || !(machine?.cruiseSpeed > 0)) return 0;
      const dist = Math.hypot((f.x0 + ctx.length / 2) - unit.x, (f.z0 + ctx.width / 2) - unit.z);
      return dist / machine.cruiseSpeed;
    },
  });
  syncFields();
  for (const unit of driveRigs()) {
    const order = farm.orders.find(item => item.machineId === unit.machineId) || null;
    const machine = machineOf(unit.machineId);
    if (!order) {
      followRoad(unit, unit.parkX, unit.parkZ, -Math.PI / 2, machine?.cruiseSpeed || 20, dt);
      paintRig(null, unit);
      continue;
    }
    paintRig(order, unit);
  }
  const plots = new Set();
  for (const rig of listRigs()) {
    const [bi, bj] = rig.key.split(':');
    plots.add(bi + ':' + bj);
  }
  if (ctx.focus) plots.add(`${Math.floor(ctx.focus.i / L.PER)}:${Math.floor(ctx.focus.j / L.PER)}`);
  for (const id of plots) {
    const [bi, bj] = id.split(':').map(Number);
    syncSlots(trussSlots(ctx.fields, bi, bj, L.PER, ctx.length));
  }
  const finished = tickTrusses(dt);
  for (const rig of listRigs()) {
    if (rig.phase === 'sweep' && rig.job) settleSoft(farm, rig.job.fieldId, rig.job.jobId, rig.progress || 0);
  }
  for (const item of finished) settleSoft(farm, item.fieldId, item.jobId, 1);
  for (const field of farm.fields.values()) {
    const book = field.plant?.soft;
    if (!book) continue;
    for (const [jobId, row] of Object.entries(book)) {
      if (row.status !== '执行中' || row.progress >= 1) continue;
      const live = listRigs().some(rig => rig.job && rig.job.fieldId === field.id && rig.job.jobId === jobId);
      if (!live) row.status = '未执行';
    }
  }
}

export function prepField(f, recipeId = 'clear_general') {
  if (!farm || !f) return { ok: false, reason: 'field' };
  return requestPrep(farm, fieldKey(f), recipeId);
}

export function plantCrop(f, cropId = 'lastika') {
  if (!farm || !f) return { ok: false, reason: 'field' };
  return requestPlant(farm, fieldKey(f), cropId);
}

export function planNext(f, cropId) {
  if (!farm || !f) return { ok: false, reason: 'field' };
  return setNextCrop(farm, fieldKey(f), cropId);
}

export function dockOf(f) {
  if (!farm || !f?.owned) return null;
  const desc = describeField(farm, fieldKey(f));
  if (!desc?.jobs) return desc;
  desc.jobs = desc.jobs.map(job => ({ ...job, eta: etaForFieldJob(f, job) }));
  return desc;
}

export function recallRig(rig) {
  if (!farm || !rig?.machineId) return { ok: false, reason: 'machine' };
  return recallMachine(farm, rig.machineId);
}

export function resumeRig(rig) {
  if (!farm || !rig?.machineId) return { ok: false, reason: 'machine' };
  return releaseStandby(farm, rig.machineId);
}

export function rigStandby(rig) {
  const machine = machineOf(rig?.machineId);
  if (!machine) return null;
  return {
    waiting: machine.recall === 'wait',
    standby: machine.standby > 0,
    clock: standbyClock(machine),
  };
}

export function dispatchBoard() {
  if (!farm || !ctx) return { orders: [], queue: [], machines: [] };
  const jobName = (id) => JOBS[id]?.name || id || '—';
  const kindOf = (id) => (JOBS[id]?.kind === 'soft' ? '软' : '硬');
  const fieldName = (id) => {
    const mesh = byKey.get(id);
    if (mesh) return `F-${String(mesh.i).padStart(2, '0')}${String(mesh.j).padStart(2, '0')}`;
    return farm.fields.get(id)?.plot || id;
  };
  const cropName = (id) => {
    const field = farm.fields.get(id);
    if (field?.plant?.cropId) return PLANT_CROPS[field.plant.cropId]?.name || field.plant.cropId;
    if (field?.prep) return '整地';
    return '—';
  };
  const phaseName = (order) => {
    const rig = rigFor(order.machineId);
    if (order.phase === 'cruise' && !rig) return '待派';
    if (order.phase === 'cruise' && rig?.navFail) return '绕不过去';
    if (order.phase === 'cruise') return '开往';
    if (order.phase === 'turn') return '转弯';
    if (order.phase === 'work') return '作业中';
    return order.phase || '—';
  };
  const orders = farm.orders.map(order => ({
    id: order.id,
    crop: cropName(order.fieldId),
    job: jobName(order.jobId),
    kind: kindOf(order.jobId),
    field: fieldName(order.fieldId),
    machine: rigFor(order.machineId)?.label || '待派',
    status: phaseName(order),
    eta: formatWallEta(orderSimSeconds(order)),
    bucket: 'run',
  }));
  const queue = farm.queue.map(item => ({
    id: item.id,
    crop: cropName(item.fieldId),
    job: jobName(item.jobId),
    kind: kindOf(item.jobId),
    field: fieldName(item.fieldId),
    machine: '待派',
    status: '排队',
    eta: '待派',
    bucket: 'queue',
  }));
  const machines = driveRigs().map(rig => {
    const machine = machineOf(rig.machineId);
    const order = farm.orders.find(item => item.machineId === rig.machineId);
    let state = '空闲';
    let tone = 'idle';
    if (machine?.standby > 0) {
      state = `待机剩余 ${standbyClock(machine)}`;
      tone = 'wait';
    } else if (machine?.recall === 'wait') {
      state = '等硬作业做完';
      tone = 'hard';
    } else if (order) {
      state = '作业中';
      tone = 'run';
    } else if (machine?.energy && machine.energyLeft <= 0) {
      state = '没电';
      tone = 'wait';
    } else if (rig.bRead?.doing === '返回机库') {
      state = '回库中';
      tone = 'home';
    }
    return { id: rig.id, name: rig.label, state, tone, job: order ? jobName(order.jobId) : '' };
  });
  return { orders, queue, machines };
}
