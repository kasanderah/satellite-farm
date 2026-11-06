// 买地 / 所有权。独立于种植、调度、农机工单。
// 那些系统只读「这块田本玩家是否已拥有、是否可操作」：
//   owns(i, j)      地权（含中枢四分）
//   operable(i, j)  可以整地 / 种植 / 派农机（不含中枢、不含他玩家）
// 单价是占位常数，以后换表只改 price()。

export const LOCAL_PLAYER = 0;
export const LAND_PRICE = 24000;

// 格子映射（相对中枢区，不跟手绘像素死对齐，改这里即可）：
// 本地田区是 7×7 个区。dx = bi - HUBX，dz = bj - HUBZ，都在 -3..3。
// 中枢区是 (0,0)，不进黄/蓝/红。四玩家各 12 个区，轴上的区划给伸出的那条臂，互不重叠。
//
//   dz\dx  -3  -2  -1   0  +1  +2  +3
//    +3    R2  R2  R2  R1  R1  R1  R1
//    +2    R2  R2  R2  B1  B1  R1  R1
//    +1    R2  B2  B2  Y1  B1  R1  R1
//     0    R2  B2  Y2  H   Y0  B0  R0     ← 玩家1（本地）在 +x，贴着中枢的东侧
//    -1    R3  R3  B3  Y3  B0  B0  R0
//    -2    R3  R3  B3  B3  R0  R0  R0
//    -3    R3  R3  R3  R3  R0  R0  R0
//
// 黄：贴中枢的那一个区。蓝：与黄共边、再向外的 L 形三区（长边朝红）。红：该玩家其余区。
// 中枢 4×4 田（fi、fj = 0..3）切成四块 2×2：
//   玩家1 fi>=2 && fj<=1（东南）  玩家2 fi>=2 && fj>=2（东北）
//   玩家3 fi<=1 && fj>=2（西北）  玩家4 fi<=1 && fj<=1（西南）
// 开局机库垫在 fi=3,fj=2，落在玩家2那一分。房子不搬，进出库不改。新建筑只许放在玩家1这一分。

const PER = 4;
let HUBX = 60;
let HUBZ = 3;

const QUADS = [
  { id: 0, name: '玩家1', has: (dx, dz) => dx >= 1 && dz <= 0, yellow: [[1, 0]], blue: [[2, 0], [1, -1], [2, -1]] },
  { id: 1, name: '玩家2', has: (dx, dz) => dx >= 0 && dz >= 1, yellow: [[0, 1]], blue: [[0, 2], [1, 1], [1, 2]] },
  { id: 2, name: '玩家3', has: (dx, dz) => dx <= -1 && dz >= 0, yellow: [[-1, 0]], blue: [[-2, 0], [-1, 1], [-2, 1]] },
  { id: 3, name: '玩家4', has: (dx, dz) => dx <= 0 && dz <= -1, yellow: [[0, -1]], blue: [[0, -2], [-1, -1], [-1, -2]] },
];

const bought = new Set();

export function bindGrid(L) {
  if (!L) return;
  HUBX = L.HUBX;
  HUBZ = L.HUBZ;
}

function keyOf(dx, dz) { return dx + ',' + dz; }

function quadAt(dx, dz) {
  return QUADS.find(q => q.has(dx, dz)) || null;
}

function listed(pairs, dx, dz) {
  return pairs.some(([x, z]) => x === dx && z === dz);
}

function zoneName(quad, dx, dz) {
  if (!quad) return 'out';
  if (listed(quad.yellow, dx, dz)) return 'yellow';
  if (listed(quad.blue, dx, dz)) return 'blue';
  return 'red';
}

function hubPlayer(fi, fj) {
  if (fi >= 2 && fj <= 1) return 0;
  if (fi >= 2 && fj >= 2) return 1;
  if (fi <= 1 && fj >= 2) return 2;
  return 3;
}

export function inspect(i, j) {
  const bi = Math.floor(i / PER);
  const bj = Math.floor(j / PER);
  const dx = bi - HUBX;
  const dz = bj - HUBZ;
  const fi = ((i % PER) + PER) % PER;
  const fj = ((j % PER) + PER) % PER;
  const inParcel = dx >= -3 && dx <= 3 && dz >= -3 && dz <= 3;
  if (!inParcel) return { dx, dz, fi, fj, player: -1, name: '', zone: 'out', hub: -1, operable: false, key: '' };
  if (dx === 0 && dz === 0) {
    const hub = hubPlayer(fi, fj);
    return { dx, dz, fi, fj, player: hub, name: QUADS[hub].name, zone: 'hub', hub, operable: false, key: 'hub:' + hub };
  }
  const quad = quadAt(dx, dz);
  const zone = zoneName(quad, dx, dz);
  const key = keyOf(dx, dz);
  const operable = !!quad && quad.id === LOCAL_PLAYER && (zone === 'yellow' || bought.has(key));
  return { dx, dz, fi, fj, player: quad ? quad.id : -1, name: quad ? quad.name : '', zone, hub: -1, operable, key };
}

export function owns(i, j) {
  const info = inspect(i, j);
  if (info.player !== LOCAL_PLAYER) return false;
  if (info.zone === 'hub') return info.hub === LOCAL_PLAYER;
  return info.operable;
}

export function operable(i, j) {
  return inspect(i, j).operable;
}

export function isLocalHub(i, j) {
  const info = inspect(i, j);
  return info.zone === 'hub' && info.hub === LOCAL_PLAYER;
}

function titled(dx, dz) {
  const quad = quadAt(dx, dz);
  if (!quad || quad.id !== LOCAL_PLAYER) return false;
  if (listed(quad.yellow, dx, dz)) return true;
  return bought.has(keyOf(dx, dz));
}

function allBlueOwned() {
  return QUADS[LOCAL_PLAYER].blue.every(([dx, dz]) => bought.has(keyOf(dx, dz)));
}

function touchesOwned(dx, dz) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => titled(dx + a, dz + b));
}

export function buyReason(dx, dz) {
  const info = inspect((HUBX + dx) * PER, (HUBZ + dz) * PER);
  if (info.zone === 'out') return 'out';
  if (info.player !== LOCAL_PLAYER) return 'locked';
  if (info.zone === 'hub') return 'hub';
  if (info.zone === 'yellow' || bought.has(info.key)) return 'owned';
  if (info.zone === 'red' && !allBlueOwned()) return 'blue';
  if (info.zone !== 'blue' && info.zone !== 'red') return 'zone';
  if (!touchesOwned(dx, dz)) return 'adj';
  return '';
}

export function canBuy(dx, dz) { return buyReason(dx, dz) === ''; }

export function price(dx, dz) {
  const info = inspect((HUBX + dx) * PER, (HUBZ + dz) * PER);
  if (info.player !== LOCAL_PLAYER) return 0;
  if (info.zone === 'blue' || info.zone === 'red') return LAND_PRICE;
  return 0;
}

export function sellPrice(dx, dz) { return Math.round(price(dx, dz) / 2); }

export function canSell(dx, dz) {
  const info = inspect((HUBX + dx) * PER, (HUBZ + dz) * PER);
  return info.player === LOCAL_PLAYER && bought.has(keyOf(dx, dz));
}

export function buy(dx, dz) {
  const reason = buyReason(dx, dz);
  if (reason) return { ok: false, reason };
  bought.add(keyOf(dx, dz));
  return { ok: true, price: price(dx, dz), dx, dz };
}

export function sell(dx, dz) {
  if (!canSell(dx, dz)) return { ok: false, reason: 'keep' };
  const pay = sellPrice(dx, dz);
  bought.delete(keyOf(dx, dz));
  return { ok: true, price: pay, dx, dz };
}

export function reset() { bought.clear(); }

export function exportState() {
  return { v: 1, blocks: [...bought] };
}

export function loadState(raw) {
  bought.clear();
  const blocks = raw && Array.isArray(raw.blocks) ? raw.blocks : [];
  for (const key of blocks) {
    if (typeof key !== 'string') continue;
    const [dx, dz] = key.split(',').map(Number);
    if (!Number.isInteger(dx) || !Number.isInteger(dz)) continue;
    const info = inspect((HUBX + dx) * PER, (HUBZ + dz) * PER);
    if (info.player !== LOCAL_PLAYER) continue;
    if (info.zone !== 'blue' && info.zone !== 'red') continue;
    bought.add(keyOf(dx, dz));
  }
}

export function overlayCells() {
  const cells = [];
  for (let dz = 3; dz >= -3; dz--) for (let dx = -3; dx <= 3; dx++) {
    if (dx === 0 && dz === 0) {
      for (let player = 0; player < 4; player++) cells.push({ hub: true, player, kind: 'hub' + player });
      continue;
    }
    const quad = quadAt(dx, dz);
    const zone = zoneName(quad, dx, dz);
    let kind = 'lock';
    if (quad && quad.id !== LOCAL_PLAYER && zone === 'yellow') kind = 'foreignYellow';
    if (quad && quad.id === LOCAL_PLAYER) {
      if (zone === 'yellow' || bought.has(keyOf(dx, dz))) kind = 'owned';
      else if (canBuy(dx, dz) && zone === 'blue') kind = 'blue';
      else if (canBuy(dx, dz) && zone === 'red') kind = 'red';
      else kind = 'wait';
    }
    cells.push({ dx, dz, player: quad ? quad.id : -1, zone, kind });
  }
  return cells;
}
