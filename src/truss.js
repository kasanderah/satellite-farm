// 喷灌桁架。列是环周（南北，x），行是轴向（东西，z）。
// 桁架沿行展开（梁在 z），沿列行进（在 x 上从地头扫过连续 4 个单元）。
// 一个地块四行，每行西端地头一台。没派活就停在地头，不进车库。
export const TRUSS_TRAVEL = 'x';
export const TRUSS_SPAN = 'z';
export const TRUSS_PRICE = 6000;
export const TRUSS_ROWS = 4;
export const TRUSS_SPEED = 6;
export const TRUSS_POWER = 12;
export const SPRAY_NEED = 1;
export const FERT_NEED = 1;

const bought = new Set();
const rigs = new Map();
const tips = [];
const tipped = new Set();

export function clearTruss() {
  bought.clear();
  rigs.clear();
  tips.length = 0;
  tipped.clear();
}

export function exportTruss() {
  return [...bought];
}

export function loadTruss(raw) {
  bought.clear();
  rigs.clear();
  if (!Array.isArray(raw)) return;
  for (const key of raw) if (typeof key === 'string') bought.add(key);
}

export function drainTips() {
  return tips.splice(0);
}

function say(key, text) {
  if (tipped.has(key)) return;
  tipped.add(key);
  tips.push(text);
}

export function slotKey(i, j, per) {
  const bi = Math.floor(i / per);
  const bj = Math.floor(j / per);
  return `${bi}:${bj}:${j - bj * per}`;
}

export function trussSlots(fields, bi, bj, per, fieldLen) {
  const slots = [];
  for (let row = 0; row < TRUSS_ROWS; row++) {
    const head = fields.find(item => item.i === bi * per && item.j === bj * per + row);
    if (!head) continue;
    const key = `${bi}:${bj}:${row}`;
    const len = fieldLen;
    slots.push({
      key,
      row,
      i: head.i,
      j: head.j,
      x0: head.x0,
      z0: head.z0,
      len,
      along: TRUSS_TRAVEL,
      travel: TRUSS_TRAVEL,
      span: TRUSS_SPAN,
      rot: 0,
      x: head.x0 - 8,
      z: head.z0 + len / 2,
      bought: bought.has(key),
    });
  }
  return slots;
}

function pose(rig, u) {
  rig.u = u;
  rig.x = rig.x0 + u;
  rig.z = rig.z0 + rig.len / 2;
  rig.rot = 0;
}

function remember(slot) {
  let rig = rigs.get(slot.key);
  if (!rig) {
    rig = { key: slot.key, phase: 'park', job: null, u: -8, x: slot.x, z: slot.z, rot: 0 };
    rigs.set(slot.key, rig);
  }
  rig.x0 = slot.x0;
  rig.z0 = slot.z0;
  rig.len = slot.len;
  rig.parkU = -8;
  if (rig.phase === 'park' && !rig.job) pose(rig, rig.parkU);
  return rig;
}

export function buyTruss(key, pay) {
  if (bought.has(key)) return { ok: false, reason: 'have' };
  if (typeof pay === 'function' && !pay()) return { ok: false, reason: 'money' };
  bought.add(key);
  return { ok: true, key };
}

export function syncSlots(slots) {
  for (const slot of slots) {
    if (!slot.bought) {
      rigs.delete(slot.key);
      continue;
    }
    remember(slot);
  }
}

export function listRigs() {
  return [...rigs.values()];
}

// 只有真正派上才算接住。没买、物料不够、电不够、这台还在忙，都要让调用方继续重试，不能当成已处理。
export function decideTrussClaim({ bought, stockOk, powerOk, parked, jobId, stockTip }) {
  if (!bought) {
    const name = jobId === 'topdress' ? '追肥' : jobId === 'irrigate' ? '喷灌' : '撒药';
    return { ok: false, reason: 'none', tip: `这行没有喷灌桁架，${name}派不出去` };
  }
  if (!stockOk) return { ok: false, reason: 'stock', tip: stockTip || '物料不够，桁架停在地头' };
  if (!powerOk) return { ok: false, reason: 'power', tip: '电不够，桁架停在地头' };
  if (!parked) return { ok: false, reason: 'busy', tip: '这行桁架还在干活' };
  return { ok: true, reason: 'go', tip: '' };
}

export function claimJob(key, job) {
  const rig = rigs.get(key);
  if (!rig || rig.phase !== 'park' || rig.job) return false;
  rig.job = job;
  rig.phase = 'go';
  return true;
}

export function tickTrusses(dt) {
  const done = [];
  const speed = TRUSS_SPEED * Math.max(0, dt);
  for (const rig of rigs.values()) {
    if (rig.phase === 'park' || (!rig.job && rig.phase !== 'return')) {
      rig.phase = 'park';
      rig.job = null;
      pose(rig, rig.parkU);
      continue;
    }
    if (rig.job && (rig.phase === 'go' || rig.phase === 'sweep')) {
      const goal = rig.job.goalU;
      const end = goal + rig.job.len;
      if (rig.phase === 'go') {
        if (rig.u < goal) pose(rig, Math.min(goal, rig.u + speed));
        if (rig.u >= goal - 0.05) rig.phase = 'sweep';
      }
      if (rig.phase === 'sweep') {
        pose(rig, Math.min(end, rig.u + speed));
        const span = Math.max(1, rig.job.len);
        rig.progress = Math.max(0, Math.min(1, (rig.u - goal) / span));
        if (rig.u >= end - 0.05) {
          done.push({ key: rig.key, fieldId: rig.job.fieldId, jobId: rig.job.jobId });
          rig.job = null;
          rig.phase = 'return';
          rig.progress = 1;
        }
      }
    }
    if (rig.phase === 'return') {
      if (rig.u > rig.parkU) pose(rig, Math.max(rig.parkU, rig.u - speed));
      if (rig.u <= rig.parkU + 0.05) {
        rig.phase = 'park';
        pose(rig, rig.parkU);
      }
    }
  }
  return done;
}

export { say as tipOnce };
