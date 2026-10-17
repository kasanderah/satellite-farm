// 把框架 B 接到环面上的一块田。旧的垄扫不读这里的工单。
import {
  OMNI, JOBS, createFarm, addField, addMachine, requestPrep, requestPlant,
  stepFarm, describeField, plotAddress,
} from './framework-b.js';

let farm = null;
let ctx = null;
const byKey = new Map();

export function fieldKey(f) {
  return f.i + ':' + f.j;
}

function rig() {
  return ctx.rigs.find(r => r.bDrive) || null;
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

function readout(order, unit) {
  const job = order ? JOBS[order.jobId] : null;
  const home = !order && unit && Math.hypot(unit.x - unit.parkX, unit.z - unit.parkZ) <= 1.2;
  let doing = '停在机库';
  if (order?.phase === 'cruise') doing = '开往田块';
  else if (order?.phase === 'work') doing = job?.name || '作业';
  else if (!home) doing = '返回机库';
  const moving = !!order || !home;
  const rated = order?.phase === 'work' ? OMNI.workSpeed : OMNI.cruiseSpeed;
  return {
    speed: moving && !ctx.paused() ? rated : 0,
    doing,
    frac: order ? order.progress : 0,
    charge: unit?.charge ?? 1,
    job: order?.jobId || null,
    light: null,
  };
}

function paintRig(order) {
  const unit = rig();
  if (!unit) return;
  unit.bWidth = OMNI.width;
  unit.busy = !!order;
  unit.bRead = readout(order, unit);
  if (order?.phase !== 'work') return;
  const f = meshOf(order.fieldId);
  if (!f || !order.pose) return;
  const at = worldPose(f, order.pose);
  unit.x = at.x;
  unit.z = at.z;
  unit.ang = at.ang;
}

export function bootSlice(next) {
  ctx = next;
  farm = createFarm();
  byKey.clear();
  addMachine(farm, { ...OMNI, caps: OMNI.caps.slice(), energyLeft: OMNI.energyKwh });
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
  const keep = ctx.rigs.filter(r => r.bDrive);
  ctx.rigs.length = 0;
  const unit = keep[0];
  if (unit) {
    unit.x = unit.parkX;
    unit.z = unit.parkZ;
    unit.ang = -Math.PI / 2;
    unit.busy = false;
    unit.mode = 'park';
    unit.bWidth = OMNI.width;
    unit.label = OMNI.name;
    ctx.rigs.push(unit);
  }
  syncFields();
  paintRig(null);
  return farm;
}

function syncFields() {
  for (const [id, f] of byKey) {
    const unit = farm.fields.get(id);
    if (!unit) continue;
    const desc = describeField(farm, id);
    const frac = unit.plant?.clock ? unit.plant.grow / unit.plant.need : 0;
    f.bUnit = {
      look: unit.look,
      growFrac: unit.look === 'sown' ? frac : 0,
      text: desc?.stat || '',
      ground: unit.ground,
      plot: unit.plot,
    };
  }
}

export function tickSlice(dt) {
  if (!farm || !ctx || !(dt > 0)) return;
  stepFarm(farm, dt, {
    eta(_farm, order) {
      const f = meshOf(order.fieldId);
      const unit = rig();
      if (!f || !unit || !order.pose) return 0;
      const at = worldPose(f, order.pose);
      const dist = Math.hypot(at.x - unit.x, at.z - unit.z);
      if (dist < 1.5) return 0;
      return dist / OMNI.cruiseSpeed;
    },
    cruise(_farm, order, slice) {
      const f = meshOf(order.fieldId);
      const unit = rig();
      if (!f || !unit || !order.pose) return;
      const at = worldPose(f, order.pose);
      moveToward(unit, at.x, at.z, at.ang, OMNI.cruiseSpeed, slice);
    },
  });
  syncFields();
  const order = farm.orders.find(item => item.machineId === OMNI.id) || null;
  if (!order) {
    const unit = rig();
    if (unit) moveToward(unit, unit.parkX, unit.parkZ, -Math.PI / 2, OMNI.cruiseSpeed, dt);
  }
  paintRig(order);
}

export function prepField(f) {
  if (!farm || !f) return { ok: false, reason: 'field' };
  return requestPrep(farm, fieldKey(f));
}

export function plantCrop(f) {
  if (!farm || !f) return { ok: false, reason: 'field' };
  return requestPlant(farm, fieldKey(f), 'lastika');
}

export function dockOf(f) {
  if (!farm || !f?.owned) return null;
  return describeField(farm, fieldKey(f));
}
