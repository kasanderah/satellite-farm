// 环穗尺寸框架。地表网格、道路、环半径、镜头距离都从这里读。
// 换站或换图只改下面的格数，不要在别处再写死米。
//
// 小格 1.4 m（黑曜协议）。格子 = 3×3 小格 = 4.2 m，是建筑和速度的基础尺度。
// 田面单元 = 32×32 格 = 134.4 m。单元间道路 = 3 格 = 12.6 m。
// 地块 = 4×4 单元 + 内部 3 条路 = 575.4 m。
// 区段 = 7×7 地块 + 含外包道的 8 条路 = 4128.6 m。
// 黑曜最大图 16×16 格 = 67.2 m，只记在这里，不进环穗玩法。
//
// 环上约 16 个区段。区段外边 4128.6 m 含两侧外包道；拼一周时相邻区段共用一条路，
// 所以网格周长是 16×(7×地块 + 7×路) = 65856 m，不是 16×4128.6 = 66057.6 m。
// 后者把 16 条共用路算了两次（多 201.6 m）。半径用网格周长，环才闭合。
//
// 旧存档没有 modulus，或模数对不上：整份快照拒绝读入，游戏走清档。
// 尺度变了，旧的世界坐标对不上新网格，不做按比例硬搬。

const MM = 1000;
const MICRO_MM = 1400;
const CELL_MM = MICRO_MM * 3;
const UNIT_MM = CELL_MM * 32;
const ROAD_MM = CELL_MM * 3;
const PLOT_MM = 4 * UNIT_MM + 3 * ROAD_MM;
const SECTOR_MM = 7 * PLOT_MM + 8 * ROAD_MM;

export const MODULUS_ID = 'ringsheaf.modulus/1';

export const MICRO = MICRO_MM / MM;
export const CELL = CELL_MM / MM;
export const UNIT = UNIT_MM / MM;
export const ROAD = ROAD_MM / MM;
export const PLOT = PLOT_MM / MM;
export const SECTOR = SECTOR_MM / MM;

export const UNIT_CELLS = 32;
export const ROAD_CELLS = 3;
export const PLOT_UNITS = 4;
export const SECTOR_PLOTS = 7;
export const SECTOR_ROADS = 8;
export const RING_SECTORS = 16;
export const PLOTS_ALONG = RING_SECTORS * SECTOR_PLOTS;
export const PLOT_PITCH = (PLOT_MM + ROAD_MM) / MM;
export const RING_CIRC = PLOTS_ALONG * PLOT_PITCH;
export const RING_R = RING_CIRC / (2 * Math.PI);
export const RING_CIRC_NOMINAL = RING_SECTORS * SECTOR;

export const OBSIDIAN_MAX_CELLS = 16;
export const OBSIDIAN_MAX = OBSIDIAN_MAX_CELLS * CELL;

// 换尺前的田面。只用来把旧镜头距离迁到新单元上，保持同样的取景比例。
const LEGACY_UNIT = 128;
export function legacyView(meters) {
  return meters * (UNIT / LEGACY_UNIT);
}

export const GROUND_PAD = CELL * 96;

// 农艺垄距仍是换尺前的巷宽，不是建筑格。下一刀再收到整格上。
export const WORK_LANE = 12.8;

export const SHELL = {
  apron: CELL * 21,
  wall: 520,
  lip: 70,
  hull: 64,
};

export function cellsFromLegacyMps(mps) {
  return mps / CELL;
}
export function mpsFromCells(cellsPerSec) {
  return cellsPerSec * CELL;
}

// 可建梯形：对角扇形贴外缘的一半。横截线在三角高的中点（离外缘 PLOT/4）。
// 外缘全宽，内边约半宽。不是整只三角，也不是整块中枢。
export const HUB_WEDGE_DEPTH = PLOT / 4;

const H = PLOT / 2;

export function hubWedgePolygon(player) {
  const inner = H - HUB_WEDGE_DEPTH;
  if (player === 0) return [[H, -H], [H, H], [inner, inner], [inner, -inner]];
  if (player === 1) return [[-H, H], [H, H], [inner, inner], [-inner, inner]];
  if (player === 2) return [[-H, H], [-H, -H], [-inner, -inner], [-inner, inner]];
  return [[H, -H], [-H, -H], [-inner, -inner], [inner, -inner]];
}

export function inHubWedge(x, z, player) {
  const inner = H - HUB_WEDGE_DEPTH;
  if (player === 0) return x >= inner - 1e-6 && x <= H + 1e-6 && Math.abs(z) <= x + 1e-6;
  if (player === 2) return -x >= inner - 1e-6 && -x <= H + 1e-6 && Math.abs(z) <= -x + 1e-6;
  if (player === 1) return z >= inner - 1e-6 && z <= H + 1e-6 && Math.abs(x) <= z + 1e-6;
  return -z >= inner - 1e-6 && -z <= H + 1e-6 && Math.abs(x) <= -z + 1e-6;
}

function wedgeSeg(player, u1, v1, u2, v2) {
  const a = fromWedge(player, u1, v1);
  const b = fromWedge(player, u2, v2);
  return [a[0], a[1], b[0], b[1]];
}

export function hubGridSegments(player = 0) {
  const inner = H - HUB_WEDGE_DEPTH;
  const n = Math.round(PLOT / CELL);
  const segs = [];
  for (let k = 0; k <= n; k++) {
    const t = -H + k * CELL;
    if (t >= inner - 1e-6 && t <= H + 1e-6) {
      const u = Math.min(H, t);
      segs.push(wedgeSeg(player, u, -u, u, u));
    }
    if (Math.abs(t) <= H + 1e-6) {
      const u0 = Math.max(inner, Math.abs(t));
      if (H > u0 + 1e-4) segs.push(wedgeSeg(player, u0, t, H, t));
    }
  }
  return segs;
}

function fromWedge(player, u, v) {
  if (player === 0) return [u, v];
  if (player === 2) return [-u, v];
  if (player === 1) return [v, u];
  return [v, -u];
}

export function fieldCellSegments(x0, z0, size = UNIT) {
  const n = Math.round(size / CELL);
  const segs = [];
  for (let k = 0; k <= n; k++) {
    const x = x0 + k * CELL;
    const z = z0 + k * CELL;
    segs.push([x, z0, x, z0 + size]);
    segs.push([x0, z, x0 + size, z]);
  }
  return segs;
}
