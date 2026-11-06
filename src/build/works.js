// 已放下的建筑和道路。存档只记格子坐标。调度不读这里。
import { CELL } from '../modulus.js';
import { DAY_SECONDS } from '../world-clock.js';
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
  lifted = null;
}

export function exportWorks() {
  return pieces.map(piece => ({
    id: piece.id,
    kind: piece.kind,
    gx: piece.gx,
    gz: piece.gz,
    rot: piece.rot,
    progress: piece.progress == null ? 1 : piece.progress,
    need: piece.need || 1,
  }));
}

export function workReady(piece) {
  return !!piece && (piece.progress == null || piece.progress >= 1 - 1e-6);
}

export function tickWorks(dt) {
  if (!(dt > 0)) return false;
  let changed = false;
  for (const piece of pieces) {
    if (workReady(piece)) continue;
    const prev = piece.progress || 0;
    const need = Math.max(1, piece.need || 1);
    piece.progress = Math.min(1, prev + dt / need);
    if (Math.floor(prev * 20) !== Math.floor(piece.progress * 20) || piece.progress >= 1) changed = true;
  }
  return changed;
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
    piece.progress = row.progress == null ? 1 : Math.max(0, Math.min(1, Number(row.progress) || 0));
    piece.need = Number(row.need) > 0 ? Number(row.need) : Math.max(1, (Number(spec.buildDays) || 0) * DAY_SECONDS);
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
    roads: roadMarks(kind, placed.cells || [], rot),
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
  const days = Number(spec.buildDays) || 0;
  piece.progress = days > 0 ? 0 : 1;
  piece.need = Math.max(1, days * DAY_SECONDS);
  pieces.push(piece);
  return { ok: true, piece };
}

let lifted = null;

export function liftedWork() {
  return lifted;
}

export function liftWork(id) {
  const piece = pieces.find(item => item.id === id);
  if (!piece) return { ok: false, reason: 'gone' };
  if ((occupyFn(piece) || 0) > 0) return { ok: false, reason: 'occupied' };
  pieces = pieces.filter(item => item.id !== id);
  lifted = piece;
  return { ok: true, piece };
}

export function restoreLifted() {
  if (!lifted) return { ok: false, reason: 'none' };
  const piece = lifted;
  lifted = null;
  if (pieces.some(item => item.id === piece.id)) return { ok: true, piece };
  const spec = workSpec(piece.kind);
  const placed = tryPlace(pieces, spec, piece.gx, piece.gz, piece.rot, () => true);
  if (!placed.ok) {
    pieces.push(piece);
    return { ok: true, piece, forced: true };
  }
  pieces.push(piece);
  return { ok: true, piece };
}

export function dropLifted(x, z, rot) {
  if (!lifted) return { ok: false, reason: 'none' };
  const spec = workSpec(lifted.kind);
  const cell = worldCell(x, z);
  const placed = tryPlace(pieces, spec, cell.gx, cell.gz, rot, zoneFn);
  if (!placed.ok) return placed;
  const piece = pieceRecord(lifted.id, spec, cell.gx, cell.gz, placed.rot, placed.cells);
  piece.progress = lifted.progress;
  piece.need = lifted.need;
  lifted = null;
  pieces.push(piece);
  return { ok: true, piece };
}

const LOCAL_FACE = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };

export function faceOut(rot, face) {
  const [lx, lz] = LOCAL_FACE[face] || LOCAL_FACE.s;
  const turn = ((rot % 4) + 4) % 4;
  const pair = turn === 1 ? [lz, -lx] : turn === 2 ? [-lx, -lz] : turn === 3 ? [-lz, lx] : [lx, lz];
  return pair.map(n => n === 0 ? 0 : n);
}

export function roadMarks(kind, cells, rot) {
  const spec = workSpec(kind);
  const faces = spec?.roadFaces || [];
  if (!faces.length || !cells?.length) return [];
  const marks = [];
  for (const face of faces) {
    const [dx, dz] = faceOut(rot, face);
    let edge = -Infinity;
    for (const [gx, gz] of cells) edge = Math.max(edge, gx * dx + gz * dz);
    const row = cells.filter(([gx, gz]) => gx * dx + gz * dz === edge);
    for (const [gx, gz] of row) {
      const nx = gx + dx;
      const nz = gz + dz;
      const at = cellOrigin(nx, nz);
      const inside = zoneFn(at.x + CELL / 2, at.z + CELL / 2);
      const there = pieceAt(pieces, nx, nz);
      let state = 'red';
      if (there?.kind === 'service') state = 'green';
      else if (!there && inside) state = 'yellow';
      marks.push({ face, dx, dz, gx: nx, gz: nz, state });
    }
  }
  return marks;
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
