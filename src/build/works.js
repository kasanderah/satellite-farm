// 已放下的建筑和道路。存档只记格子坐标。调度不读这里。
import { CELL } from '../modulus.js';
import { workSpec } from './catalog.js';
import { roadMaskAt } from './roads.js';
import { tryPlace, pieceRecord, pieceAt, worldCell, cellOrigin, takenKeys } from './placement.js';

let pieces = [];
let nextId = 1;
let zoneFn = () => false;
let occupyFn = () => 0;

export function bindOccupy(fn) {
  occupyFn = typeof fn === 'function' ? fn : () => 0;
}

export function bindBuildZone(fn) {
  zoneFn = typeof fn === 'function' ? fn : () => false;
}

export function listWorks() { return pieces; }

export function clearWorks() {
  pieces = [];
  nextId = 1;
}

export function exportWorks() {
  return pieces.map(piece => ({
    id: piece.id,
    kind: piece.kind,
    gx: piece.gx,
    gz: piece.gz,
    rot: piece.rot,
  }));
}

export function loadWorks(raw) {
  pieces = [];
  nextId = 1;
  if (!Array.isArray(raw)) return;
  for (const row of raw) {
    const spec = workSpec(row.kind);
    if (!spec) continue;
    const placed = tryPlace(pieces, spec, row.gx | 0, row.gz | 0, row.rot | 0, () => true);
    if (!placed.ok) continue;
    const piece = pieceRecord(row.id || nextId, spec, row.gx | 0, row.gz | 0, placed.rot, placed.cells);
    pieces.push(piece);
    nextId = Math.max(nextId, piece.id + 1);
  }
}

function conflictCells(cells) {
  const taken = takenKeys(pieces);
  const bad = [];
  for (const [cx, cz] of cells || []) {
    const at = cellOrigin(cx, cz);
    const inside = zoneFn(at.x + CELL / 2, at.z + CELL / 2);
    if (!inside || taken.has(cx + ',' + cz)) bad.push([cx, cz]);
  }
  return bad;
}

export function previewWork(kind, x, z, rot) {
  const spec = workSpec(kind);
  const cell = worldCell(x, z);
  const placed = tryPlace(pieces, spec, cell.gx, cell.gz, rot, zoneFn);
  return {
    ...placed,
    gx: cell.gx,
    gz: cell.gz,
    bad: placed.ok ? [] : conflictCells(placed.cells),
  };
}

export function pieceUnder(x, z) {
  const cell = worldCell(x, z);
  return pieceAt(pieces, cell.gx, cell.gz);
}

export function roadMask(gx, gz) {
  return roadMaskAt(gx, gz, (x, z) => {
    const piece = pieceAt(pieces, x, z);
    return !!(piece && piece.kind === 'service');
  });
}

export function placeWork(kind, x, z, rot) {
  const spec = workSpec(kind);
  const cell = worldCell(x, z);
  const placed = tryPlace(pieces, spec, cell.gx, cell.gz, rot, zoneFn);
  if (!placed.ok) return placed;
  const piece = pieceRecord(nextId++, spec, cell.gx, cell.gz, placed.rot, placed.cells);
  pieces.push(piece);
  return { ok: true, piece };
}

export function eraseWork(x, z) {
  const cell = worldCell(x, z);
  const piece = pieceAt(pieces, cell.gx, cell.gz);
  if (!piece) return { ok: false, reason: 'empty' };
  const used = occupyFn(piece) || 0;
  if (used > 0) return { ok: false, reason: 'occupied', used, piece };
  pieces = pieces.filter(item => item.id !== piece.id);
  return { ok: true, piece };
}
