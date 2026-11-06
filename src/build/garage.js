// 车库车位。一座车库的车位数写在目录上。停机位在门口外侧，不占进建筑占地。
import { CELL } from '../modulus.js';
import { workSpec } from './catalog.js';

function garageOpen(piece) {
  return !!piece && (piece.progress == null || piece.progress >= 1 - 1e-6);
}

export function stallTotal(works) {
  let stalls = 0;
  for (const piece of works) {
    if (!garageOpen(piece)) continue;
    stalls += workSpec(piece.kind)?.stalls || 0;
  }
  return stalls;
}

export function stallPose(garage, index) {
  const stalls = workSpec(garage.kind)?.stalls || 1;
  const width = garage.w * CELL;
  const depth = garage.h * CELL;
  const step = Math.min(CELL, (width - 1.2) / Math.max(1, stalls));
  const lx = (index - (stalls - 1) / 2) * step;
  const lz = -depth / 2 - 2.4;
  const th = (garage.rot || 0) * Math.PI / 2;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  return {
    x: garage.x + lx * cos + lz * sin,
    z: garage.z - lx * sin + lz * cos,
    ang: Math.atan2(cos, sin),
  };
}

export function claimStall(works, rigs, preferId, preferStall) {
  const garages = works.filter(piece => garageOpen(piece) && (workSpec(piece.kind)?.stalls || 0) > 0);
  const used = (id, stall) => rigs.some(rig => rig.garageId === id && rig.stall === stall);
  const take = (garage, stall) => ({ garageId: garage.id, stall, ...stallPose(garage, stall) });
  if (preferId != null) {
    const garage = garages.find(piece => piece.id === preferId);
    if (!garage) return null;
    const stalls = workSpec(garage.kind).stalls || 0;
    if (Number.isInteger(preferStall) && preferStall < stalls && !used(garage.id, preferStall)) return take(garage, preferStall);
    for (let stall = 0; stall < stalls; stall++) if (!used(garage.id, stall)) return take(garage, stall);
    return null;
  }
  for (const garage of garages) {
    const stalls = workSpec(garage.kind).stalls || 0;
    for (let stall = 0; stall < stalls; stall++) if (!used(garage.id, stall)) return take(garage, stall);
  }
  return null;
}
