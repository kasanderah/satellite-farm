// 建造区资产目录。占地以建筑格（modulus.CELL）计。
// 车库的 stalls 是车位数。挡路建筑只占地，不接造价和供电。
import { CELL } from '../modulus.js';

// roadFaces 用本地朝向：s 是 -Z，车库进出车子的那一面。旋转后箭头跟着这面走。
// buildDays 是世界日。0 表示放下即完工（道路）。费用和板材在放下时扣。
const plate = (n) => [{ id: 'plate', name: '板材', n }];

export const BUILDINGS = [
  { id: 'shed_small', name: '小仓', group: '建筑', w: 2, h: 2, kind: 'building', buildDays: 1.2, cost: 2400, materials: plate(2), roadFaces: ['s'], blurb: '小库房。南面门口要能接上服务路。' },
  { id: 'workshop', name: '工棚', group: '建筑', w: 4, h: 3, kind: 'building', buildDays: 1.5, cost: 6400, materials: plate(4), roadFaces: ['s'], blurb: '检修棚。南面门口要能接上服务路。' },
  { id: 'tank', name: '高罐', group: '建筑', w: 2, h: 2, kind: 'building', buildDays: 1.4, cost: 5200, materials: plate(3), roadFaces: ['s'], blurb: '立罐。南面检修口要能接上服务路。' },
  { id: 'hangar', name: '机库壳', group: '建筑', w: 6, h: 4, kind: 'building', buildDays: 2, cost: 12000, materials: plate(6), roadFaces: ['s'], blurb: '大跨机库壳。南面大门要能接上服务路。' },
  { id: 'link', name: '连廊', group: '建筑', w: 5, h: 1, kind: 'building', buildDays: 1, cost: 1800, materials: plate(1), roadFaces: ['s'], blurb: '连廊。南侧要留出一条服务路。' },
  { id: 'garage', name: '车库', group: '建筑', w: 4, h: 3, kind: 'building', stalls: 3, role: 'garage', buildDays: 1.6, cost: 8000, materials: plate(4), roadFaces: ['s'], blurb: '三车位。只有进出车子的那一面要道路。没完工不能买车、不能回库。' },
  { id: 'block_hall', name: '挡路厅', group: '建筑', w: 8, h: 5, kind: 'building', role: 'block', buildDays: 1.8, cost: 9000, materials: plate(5), roadFaces: ['s'], blurb: '大块挡路厅。南面要能接上服务路。' },
  { id: 'block_yard', name: '堆场', group: '建筑', w: 6, h: 6, kind: 'building', role: 'block', buildDays: 1.3, cost: 4200, materials: plate(3), roadFaces: ['s'], blurb: '露天堆场。南面要能接上服务路。' },
  { id: 'block_wall', name: '联仓', group: '建筑', w: 10, h: 3, kind: 'building', role: 'block', buildDays: 1.7, cost: 7600, materials: plate(4), roadFaces: ['s'], blurb: '一长排仓。南面要能接上服务路。' },
];

export const ROADS = [
  { id: 'service', name: '服务路', group: '道路', w: 1, h: 1, kind: 'road', buildDays: 0, cost: 200, materials: plate(0), roadFaces: [], blurb: '一格服务路。放下就能走。' },
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
