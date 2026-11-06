// 服务路四向邻接。东 1、北 2、西 4、南 8。只看格子，不画模型。
export const ROAD_E = 1;
export const ROAD_N = 2;
export const ROAD_W = 4;
export const ROAD_S = 8;

const DIRS = [[1, 0, ROAD_E], [0, 1, ROAD_N], [-1, 0, ROAD_W], [0, -1, ROAD_S]];

export function roadMaskAt(gx, gz, hasRoad) {
  let mask = 0;
  for (const [dx, dz, bit] of DIRS) if (hasRoad(gx + dx, gz + dz)) mask |= bit;
  return mask;
}

export function roadShape(mask) {
  const bits = DIRS.reduce((n, dir) => n + ((mask & dir[2]) ? 1 : 0), 0);
  if (bits <= 1) return 'end';
  if (mask === (ROAD_E | ROAD_W) || mask === (ROAD_N | ROAD_S)) return 'straight';
  if (bits === 2) return 'corner';
  if (bits === 3) return 'tee';
  return 'cross';
}

export function roadDirs(mask) {
  return DIRS.filter(dir => mask & dir[2]).map(dir => [dir[0], dir[1]]);
}
