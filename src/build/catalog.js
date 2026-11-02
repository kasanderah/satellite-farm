// 建造区资产目录。占地以建筑格（modulus.CELL）计。
// 车库的 stalls 是车位数。挡路建筑只占地，不接造价和供电。
import { CELL } from '../modulus.js';

export const BUILDINGS = [
  { id: 'shed_small', name: '小仓', group: '建筑', w: 2, h: 2, kind: 'building' },
  { id: 'workshop', name: '工棚', group: '建筑', w: 4, h: 3, kind: 'building' },
  { id: 'tank', name: '高罐', group: '建筑', w: 2, h: 2, kind: 'building' },
  { id: 'hangar', name: '机库壳', group: '建筑', w: 6, h: 4, kind: 'building' },
  { id: 'link', name: '连廊', group: '建筑', w: 5, h: 1, kind: 'building' },
  { id: 'garage', name: '车库', group: '建筑', w: 4, h: 3, kind: 'building', stalls: 3, role: 'garage' },
  { id: 'block_hall', name: '挡路厅', group: '建筑', w: 8, h: 5, kind: 'building', role: 'block' },
  { id: 'block_yard', name: '堆场', group: '建筑', w: 6, h: 6, kind: 'building', role: 'block' },
  { id: 'block_wall', name: '联仓', group: '建筑', w: 10, h: 3, kind: 'building', role: 'block' },
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
