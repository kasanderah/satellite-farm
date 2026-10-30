// 把框架 B 接到环面上的一块田。旧的垄扫不读这里的工单。
import {
  OMNI, TRACTOR, PLOW, JOBS, TURN_SECONDS, createFarm, addField, addMachine, mountHitch,
  requestPrep, requestPlant, stepFarm, describeField, plotAddress, growthAge, workSweepLook, PLANT_CROPS,
  cycleDays,
} from './framework-b.js';
import { roadRoute } from './_shared.js';

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
  ensureRoad(unit, x, z);
  const pts = unit.route || [[x, z]];
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
  if (order?.phase === 'cruise') doing = '开往田块';
  else if (order?.phase === 'turn') doing = '地头转弯';
  else if (order?.phase === 'work') doing = job?.name || '作业';
  else if (!home) doing = '返回机库';
  const moving = !!order || !home;
  const rated = order?.phase === 'work' ? (machine?.workSpeed || 0) : (machine?.cruiseSpeed || 0);
  return {
    speed: moving && !ctx.paused() ? rated : 0,
    doing,
    frac: order ? order.progress : 0,
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

export function bootSlice(next) {
  ctx = next;
  farm = createFarm();
  byKey.clear();
  const keep = ctx.rigs.filter(r => r.bDrive);
  ctx.rigs.length = 0;
  for (const unit of keep) {
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
    if (!f.owned) continue;
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
    f.bUnit = {
      look: unit.look,
      growFrac: unit.look === 'sown' ? frac : 0,
      timed,
      age: timed ? growthAge(unit) : 0,
      cycle: timed ? (cycleDays(crop) || 1) : 1,
      brushFade: unit.brushFade ? { left: unit.brushFade.left, span: unit.brushFade.span, look: unit.brushFade.look } : null,
      text: desc?.stat || '',
      label: desc?.float || '',
      ground: unit.ground,
      plot: unit.plot,
    };
    const sweepLook = order ? workSweepLook(JOBS[order.jobId]) : null;
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

export function tickSlice(dt) {
  if (!farm || !ctx || !(dt > 0)) return;
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
}

export function prepField(f, recipeId = 'clear_general') {
  if (!farm || !f) return { ok: false, reason: 'field' };
  return requestPrep(farm, fieldKey(f), recipeId);
}

export function plantCrop(f) {
  if (!farm || !f) return { ok: false, reason: 'field' };
  return requestPlant(farm, fieldKey(f), 'lastika');
}

export function dockOf(f) {
  if (!farm || !f?.owned) return null;
  return describeField(farm, fieldKey(f));
}
