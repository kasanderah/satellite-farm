// 建造区资产目录。占地以建筑格（modulus.CELL）计。
// 本刀不接造价、供电、物流。机库空位和进出库以后再接，不要塞进拖拉机调度。
import { CELL } from '../modulus.js';

export const BUILDINGS = [
  { id: 'shed_small', name: '小仓', group: '建筑', w: 2, h: 2, kind: 'building' },
  { id: 'workshop', name: '工棚', group: '建筑', w: 4, h: 3, kind: 'building' },
  { id: 'tank', name: '高罐', group: '建筑', w: 2, h: 2, kind: 'building' },
  { id: 'hangar', name: '机库壳', group: '建筑', w: 6, h: 4, kind: 'building' },
  { id: 'link', name: '连廊', group: '建筑', w: 5, h: 1, kind: 'building' },
];

export const ROADS = [
  { id: 'service', name: '服务路', group: '道路', w: 1, h: 1, kind: 'road' },
];

const ALL = [...BUILDINGS, ...ROADS];

export function workSpec(id) {
  return ALL.find(item => item.id === id) || null;
}

export function workSize(id) {
  const spec = workSpec(id);
  if (!spec) return null;
  return { w: spec.w * CELL, h: spec.h * CELL, cells: spec.w * spec.h };
}
