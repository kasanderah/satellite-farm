// 建造区摆放。格子对齐、占地、朝向、冲突。不画网格，不碰农机。
import { CELL, PLOT } from '../modulus.js';

const H = PLOT / 2;

export function cellOrigin(gx, gz) {
  return { x: -H + gx * CELL, z: -H + gz * CELL };
}

export function worldCell(x, z) {
  return {
    gx: Math.floor((x + H) / CELL),
    gz: Math.floor((z + H) / CELL),
  };
}

export function footprint(w, h, rot) {
  const turn = ((rot % 4) + 4) % 4;
  if (turn % 2 === 1) return { w: h, h: w, rot: turn };
  return { w, h, rot: turn };
}

export function cellsOf(gx, gz, w, h, rot) {
  const box = footprint(w, h, rot);
  const cells = [];
  for (let dz = 0; dz < box.h; dz++) for (let dx = 0; dx < box.w; dx++) cells.push([gx + dx, gz + dz]);
  return cells;
}

function keyOf(gx, gz) { return gx + ',' + gz; }

export function takenKeys(pieces) {
  const taken = new Set();
  for (const piece of pieces) for (const cell of piece.cells) taken.add(keyOf(cell[0], cell[1]));
  return taken;
}

export function pieceAt(pieces, gx, gz) {
  const key = keyOf(gx, gz);
  return pieces.find(piece => piece.cells.some(cell => keyOf(cell[0], cell[1]) === key)) || null;
}

// zoneFn(x, z) 用格子中心判断是否落在建造区。
export function tryPlace(pieces, spec, gx, gz, rot, zoneFn) {
  if (!spec) return { ok: false, reason: 'kind' };
  const turn = footprint(spec.w, spec.h, rot).rot;
  const cells = cellsOf(gx, gz, spec.w, spec.h, turn);
  for (const [cx, cz] of cells) {
    const at = cellOrigin(cx, cz);
    const x = at.x + CELL / 2;
    const z = at.z + CELL / 2;
    if (!zoneFn(x, z)) return { ok: false, reason: 'zone', cells };
  }
  const taken = takenKeys(pieces);
  if (cells.some(cell => taken.has(keyOf(cell[0], cell[1])))) return { ok: false, reason: 'block', cells };
  return { ok: true, cells, rot: turn };
}

export function pieceRecord(id, spec, gx, gz, rot, cells) {
  const box = footprint(spec.w, spec.h, rot);
  const origin = cellOrigin(gx, gz);
  return {
    id,
    kind: spec.id,
    group: spec.group,
    gx,
    gz,
    rot,
    w: box.w,
    h: box.h,
    cells,
    x: +(origin.x + box.w * CELL / 2).toFixed(2),
    z: +(origin.z + box.h * CELL / 2).toFixed(2),
  };
}
