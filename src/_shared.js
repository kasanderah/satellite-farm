// =====================================================================
//  环穗 (Ringsheaf) · v3.1 「环带殖民卫星」（轨道制图 × 冷静工业）
//  _shared.js —— 色板 / 作物参数 / 农场布局 / 自动化模拟（纯数据与逻辑，不含渲染）
// =====================================================================

// ---------- ① 色板（来自 art-ref 报告 5.4 节，只允许使用这些键名） ----------
export const PALETTE = {
  // 环境中性色（画面约 70%）
  void: '#0a0c14', deep: '#17181c', metalDk: '#28292b', regoDk: '#4a4844',
  rego: '#6f6a61', regoLt: '#a2998a', haze: '#bcc3c4', paper: '#e8d8d0',
  // 作物色（约 25%，三个色相家族：黄绿 / 赭黄 / 灰青）
  oliveDp: '#51542c', olive: '#787c32', moss: '#3e7a37',
  ochre: '#81683f', straw: '#b59a63', rust: '#9e543a',
  sage: '#8fbbad', tealGy: '#52747e', steel: '#6f93a0',
  // 信号色（≤5%，只给会动或需要注意的东西）
  harvest: '#d8693c', zone: '#e49680', data: '#85eed9', skyRim: '#5995c7', alert: '#c8383a',
};

// ---------- ② 参数化作物 ----------
// family : 色相家族（只能是 grain 赭黄 / green 黄绿 / teal 灰青）
// young / ripe : 幼苗色 → 成熟色（同一家族里只沿明度/彩度移动）
// stub : 收割后残茬色    height : 株高(米)，决定长影长度与近景单株高度
// row  : 行距(米)        along : 株距(米)    tex : 远景田垄纹理    shape : 近景单株造型
// grow : 邻区定格冠层的参考相位（秒），不驱动玩家的世界钟。
// plantable : 这一切片只能种中熟商品薯。其余条目只给环带色块，名字不进播种界面。
// weight : 环带上的占比（邻区快照仍用全部 8 种纹理，色板才和美术小样一致）
// 商品薯：120 个世界日。yieldL / price 只作一茬营收的量级，不是百科条目。
export const CROPS = [
  { id: 'wheat',   name: '麦色冠层', analog: '小麦', family: 'grain', young: 'olive',   ripe: 'straw',  stub: 'regoLt', height: 1.0, row: 0.45, along: 0.30, tex: 'drill',  shape: 'ear',     grow: 260, season: 22, plantable: false, weight: 0.27 },
  { id: 'maize',   name: '高秆冠层', analog: '玉米', family: 'green', young: 'oliveDp', ripe: 'olive',  stub: 'ochre',  height: 2.6, row: 0.80, along: 0.32, tex: 'wide',   shape: 'stalk',   grow: 320, season: 26, plantable: false, weight: 0.17 },
  { id: 'soy',     name: '矮丛冠层', analog: '大豆', family: 'green', young: 'oliveDp', ripe: 'oliveDp',stub: 'regoDk', height: 0.8, row: 0.50, along: 0.30, tex: 'drill',  shape: 'bush',    grow: 240, season: 20, plantable: false, weight: 0.15 },
  { id: 'potato',  name: '中熟商品薯', analog: '商品薯', family: 'grain', young: 'oliveDp', ripe: 'ochre', stub: 'rust', height: 0.55, row: 0.90, along: 0.40, tex: 'ridges', shape: 'bush', grow: 280, season: 120, plantable: true, yieldL: 44000, price: 412, weight: 0.10, days: 120 },
  { id: 'rice',    name: '水田冠层', analog: '水稻', family: 'teal',  young: 'tealGy',  ripe: 'tealGy', stub: 'regoDk', height: 0.8, row: 0.40, along: 0.30, tex: 'paddy',  shape: 'tuft',    grow: 300, season: 24, plantable: false, weight: 0.08 },
  { id: 'cabbage', name: '霜甘蓝', analog: '甘蓝', family: 'teal',  young: 'tealGy',  ripe: 'sage',   stub: 'regoDk', height: 0.45,row: 0.70, along: 0.55, tex: 'beds',   shape: 'rosette', grow: 220, season: 22, plantable: false, weight: 0.08 },
  { id: 'alfalfa', name: '银叶苜', analog: '苜蓿', family: 'teal',  young: 'tealGy',  ripe: 'steel',  stub: 'regoDk', height: 0.7, row: 0.30, along: 0.25, tex: 'drill',  shape: 'tuft',    grow: 200, season: 18, plantable: false, weight: 0.10 },
  { id: 'sorghum', name: '锈穗粱', analog: '高粱', family: 'grain', young: 'olive',   ripe: 'rust',   stub: 'ochre',  height: 1.8, row: 0.75, along: 0.30, tex: 'wide',   shape: 'stalk',   grow: 300, season: 24, plantable: false, weight: 0.05 },
];
export const TEX_ID = { drill: 0, wide: 1, ridges: 2, paddy: 3, beds: 4 };

// ---------- ③ 色彩工具（OKLab 明度，用于相邻作物明度差检查） ----------
export function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function oklabL(hex) {
  const lin = hexToRgb(hex).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  const l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]);
  const m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]);
  const s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
  return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
}

// ---------- ④ 环带布局（1 单位 = 1 米） ----------
// 第一块可耕地是一颗「环带殖民卫星」：农田铺在一条旋转环带的内表面上。
// 平面坐标约定：x = 沿环方向（周向，首尾相接），z = 跨环方向（环带宽度，两侧是环壁），y = 指向环轴的「上」。
// 渲染时顶点着色器把平面坐标卷成圆柱面（见 glsl.js 的 curveWorld），所以模拟和数据完全是平面的、好写好改。
// 田块 128 m，4×4 块组成一个「区」(sector)，区内 6 m 田间路，区之间 26 m 主干走廊（输送带 + 服务路）
export const L = { FIELD: 128, ROAD: 6, PER: 4, TRUNK: 26, NBX: 120, NBZ: 7, LANE: 12.8 };
L.LANES = Math.round(L.FIELD / L.LANE);
L.BLOCK = L.PER * L.FIELD + (L.PER - 1) * L.ROAD;
L.BP = L.BLOCK + L.TRUNK;
L.NFX = L.NBX * L.PER; L.NFZ = L.NBZ * L.PER;   // 480 × 28 = 13440 块田
L.HUBX = Math.floor(L.NBX / 2); L.HUBZ = Math.floor(L.NBZ / 2);   // 中枢区
// 让中枢区中心正好落在原点（x、z 两个方向的网格同相位 → 一张 ROADS 表两个方向通用）
L.X0 = -L.HUBX * L.BP - L.BLOCK / 2;
L.Z0 = -L.HUBZ * L.BP - L.BLOCK / 2;
// 环带几何
export const RING = {
  CIRC: L.NBX * L.BP,                  // 周长 66.7 km（田网格正好绕一圈首尾相接）
  R: L.NBX * L.BP / (2 * Math.PI),     // 半径约 10.6 km：从地面看，环带在前后两个方向升起，在头顶合拢
  APRON: 90,                           // 最外侧主干走廊到环壁之间的检修带
  WALL_H: 520,                         // 环壁高度（挡住大气）
  LIP: 70,                             // 环壁顶端向内悬挑
  HULL: 64,                            // 环带结构厚度（地下各层都在这里面）
};
RING.Z_IN = L.Z0 - L.TRUNK;                              // 农田区 z 下界
RING.Z_OUT = L.Z0 + L.NBZ * L.BP;                         // 农田区 z 上界
RING.WALL_A = RING.Z_IN - RING.APRON; RING.WALL_B = RING.Z_OUT + RING.APRON;   // 两侧环壁内表面
RING.W = RING.WALL_B - RING.WALL_A;
L.CURVE_R = RING.R;
// 这一切片只经营一个人的田区：环带宽约 4 km，沿环再取 7 个区 ≈ 3.9 km。
// 中枢落在这片田区里。环上其余田块是邻区的冻结快照（不生长、不入账），留给以后的异步多人。
export const PLOT = {
  id: 'nongshen-viii/plot-01',
  index: 1,
  bi0: L.HUBX - 3,
  bi1: L.HUBX + 3,
  bj0: 0,
  bj1: L.NBZ - 1,
};
PLOT.x0 = L.X0 + PLOT.bi0 * L.BP;
PLOT.x1 = L.X0 + (PLOT.bi1 + 1) * L.BP;
PLOT.z0 = L.Z0;
PLOT.z1 = L.Z0 + L.NBZ * L.BP;
PLOT.along = PLOT.x1 - PLOT.x0;
PLOT.across = L.NBZ * L.BP - L.TRUNK;
export const FIELD_HA = (L.FIELD * L.FIELD) / 10000;
export function inPlotBlock(bi, bj) { return bi >= PLOT.bi0 && bi <= PLOT.bi1 && bj >= PLOT.bj0 && bj <= PLOT.bj1; }
export function quote(crop) {
  const c = CROPS[crop];
  if (!c?.plantable) return 0;
  return Math.round(FIELD_HA * c.yieldL * c.price / 1000);
}
// ---------- ④b 垂直分层（地表 + 地下各层）。新增一层：在这里加一项，并在 main.js 的 DECK_BUILDERS 里给它写内容 ----------
// top / floor：该层顶板底面与地板面的高度（米，地表 = 0，向下为负）；slab：顶板厚度（含土层）
export const LAYERS = [
  { id: 'surface', name: '地表农田', en: 'SURFACE FIELDS', top: 0, floor: 0, slab: 0 },
  { id: 'grow', name: '地下培育层', en: 'GROW DECK', top: -4.5, floor: -17, slab: 4.5, content: 'racks' },
  { id: 'equip', name: '设备层', en: 'EQUIPMENT DECK', top: -21, floor: -40, slab: 4, content: 'machinery' },
  { id: 'hull', name: '承压外壳', en: 'PRESSURE HULL', top: -44, floor: -RING.HULL, slab: 4 },
];
// 剖面（cutaway）：在镜头所指处挖一个台阶状的「剖切盒」——外圈露出培育层，内圈再下一层露出设备层
export const CUT = { AX: 200, AZ: 136, IX: 96, IZ: 104 };
export const wrapX = x => L.X0 + ((((x - L.X0) % RING.CIRC) + RING.CIRC) % RING.CIRC);
export const fieldOrigin = (i, j) => [
  L.X0 + Math.floor(i / L.PER) * L.BP + (i % L.PER) * (L.FIELD + L.ROAD),
  L.Z0 + Math.floor(j / L.PER) * L.BP + (j % L.PER) * (L.FIELD + L.ROAD)];
// 道路中线（所有路贯穿全场，构成网格；x、z 同相位，所以同一张表两个方向都能用）
export const ROADS = (() => {
  const a = [];
  for (let b = 0; b <= L.NBX; b++) {
    a.push(L.X0 + b * L.BP - L.TRUNK + L.ROAD / 2);                  // 主干走廊靠田一侧的服务车道
    if (b < L.NBX) for (let k = 1; k < L.PER; k++) a.push(L.X0 + b * L.BP + k * (L.FIELD + L.ROAD) - L.ROAD / 2);
  }
  return a.sort((x, y) => x - y);
})();
export const TRUNKS_X = Array.from({ length: L.NBX + 1 }, (_, b) => L.X0 + b * L.BP - L.TRUNK / 2);   // 跨环方向的走廊（x 常数）
export const TRUNKS_Z = Array.from({ length: L.NBZ + 1 }, (_, b) => L.Z0 + b * L.BP - L.TRUNK / 2);   // 沿环方向的走廊（z 常数）
const nearestRoad = v => { let best = ROADS[0]; for (const r of ROADS) if (Math.abs(r - v) < Math.abs(best - v)) best = r; return best; };

// 环带是人造结构，没有陨坑；保留接口（一个远在环外的占位）以便以后加「自然保留地」之类的不可耕区域
const HUBX = 0;
export const CRATERS = [[0, 9e6, 1]];
export const inCrater = (x, z, pad = 0) => CRATERS.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + pad);
// ---------- ⑤ 随机数（固定种子，画面可复现） ----------
let seed = 20261008;
export const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---------- ⑥ 田块 ----------
// state: 0 翻耕裸土 / 1 生长中 / 2 成熟待收 / 3 收割中 / 4 残茬
export const fields = [];
const pickCrop = () => { let r = rnd(), acc = 0; for (let k = 0; k < CROPS.length; k++) { acc += CROPS[k].weight; if (r < acc) return k; } return 0; };
const LRIPE = CROPS.map(c => oklabL(PALETTE[c.ripe]));
// 每个区（4×4 田块）有一个主作物和一个副作物，生长相位沿大尺度的「波」分布 → 远看是成片的收获浪潮，而不是拼布
const blockPlan = [];
for (let b = 0; b < L.NBX * L.NBZ; b++) blockPlan.push([pickCrop(), pickCrop(), rnd()]);
const phaseAt = (x, z) => {
  const w = Math.sin(x / 2300 + 1.3) * 0.5 + Math.sin((x * 0.6 + z) / 1700) * 0.35 + Math.sin(z / 3100 - 0.4) * 0.4;
  return w * 0.45;
};
const PH0 = 0.7 - phaseAt(HUBX + 900, HUBX - 900);   // 让中枢附近正好处在收获期（演示时一打开就有作业）
const phaseOf = (x, z) => ((phaseAt(x, z) + PH0 + 10) % 1 + 1) % 1;
for (let j = 0; j < L.NFZ; j++) for (let i = 0; i < L.NFX; i++) {
  const bi = Math.floor(i / L.PER), bj = Math.floor(j / L.PER);
  const hub = bi === L.HUBX && bj === L.HUBZ;
  const depot = !hub && bi % 3 === 1 && bj % 3 === 1 && i % L.PER === 0 && j % L.PER === 0;   // 区站堆场
  let crop = -1;
  const [fx0, fz0] = fieldOrigin(i, j);
  const wild = inCrater(fx0 + L.FIELD / 2, fz0 + L.FIELD / 2, 40);
  const reservoir = !hub && !depot && !wild && blockPlan[bj * L.NBX + bi][2] < 0.05 && i % L.PER >= 2 && j % L.PER >= 2;   // 蓄水池
  if (wild) crop = -2; else if (reservoir) crop = -3;
  else if (!hub && !depot) {
    const [pc, sc] = blockPlan[bj * L.NBX + bi], k = rnd();
    crop = k < 0.62 ? pc : k < 0.88 ? sc : pickCrop();
  }
  const [x0, z0] = fieldOrigin(i, j);
  const f = { i, j, idx: j * L.NFX + i, x0, z0, crop, dir: (bi + bj) % 2 === 0 ? (rnd() < 0.8 ? 0 : 1) : (rnd() < 0.8 ? 1 : 0), state: 1, g: 0, s: 0, timer: 0, claimed: false, growT: crop >= 0 ? CROPS[crop].grow * (0.8 + rnd() * 0.5) : 1 };
  if (crop >= 0) {
    const ph = (phaseOf(x0, z0) + (rnd() - 0.5) * 0.12 + 1) % 1;
    if (ph < 0.5) { f.state = 1; f.g = 0.05 + ph / 0.5 * 0.94; }
    else if (ph < 0.68) { f.state = 2; f.g = 1; }
    else if (ph < 0.76) { f.state = 3; f.g = 1; }
    else if (ph < 0.9) { f.state = 4; f.g = 1; f.s = L.LANES; f.timer = rnd() * 40; }
    else { f.state = 0; f.g = 0; f.timer = rnd() * 25; }
  }
  fields.push(f);
}
export const depots = fields.filter(f => f.crop === -1 && !(Math.floor(f.i / L.PER) === L.HUBX && Math.floor(f.j / L.PER) === L.HUBZ)).map((f, id) => ({ id, x: f.x0 + L.FIELD / 2, z: f.z0 + L.FIELD / 2, bi: Math.floor(f.i / L.PER), bj: Math.floor(f.j / L.PER) }));
export const fieldAt = (i, j) => (i < 0 || j < 0 || i >= L.NFX || j >= L.NFZ) ? null : fields[j * L.NFX + i];

// 田块局部坐标（u 沿作物行，v 跨行）→ 世界坐标
export const toWorld = (f, u, v) => f.dir === 0 ? [f.x0 + u, f.z0 + v] : [f.x0 + v, f.z0 + u];

// ---------- ⑦ 玩家田区：一口世界钟上的中熟商品薯 ----------
// 1×：一真实分钟 = 一个世界日。播种到起薯仍是 120 个世界日。倍率同时加快这口钟和农机。
// 农机在 1× 下约 2.8 m/s，走过一条 128 m 田边大约 46 个真实秒。
export const DAY_SECONDS = 60;
export const MACHINE_MPS = 2.8;
export const SIM = { CUT: MACHINE_MPS, MOVE: MACHINE_MPS, STUBBLE: 8, TILL: 0 };
export const POTATO_DAYS = 120;
export function passWorldDays() {
  return (L.LANES * L.FIELD) / (MACHINE_MPS * DAY_SECONDS);
}
export const economy = { revenue: 0, timeScale: 1 };
export const stores = { seed: 6, fertilizer: 6, spray: 6 };
export const warehouse = [];
export const buildings = [];
let nextLot = 1;
let nextBuilding = 1;
export let paused = false;
export function setPaused(v) { paused = !!v; }
export let simTime = 0;
export let worldDay = 0;
export const log = [];
export const focus = { x: 0, z: 0, i: 0, j: 0 };
export const signals = [];
export const harvesters = [];
export const rigs = [];
export function setTimeScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return;
  economy.timeScale = Math.min(10000, n);
}
export const PHASE_LABEL = {
  plant: '播种起垄', ridge: '裸垄', shoot: '出苗', hill: '培土',
  canopy: '封垄', flower: '开花', top: '杀秧', haulm: '碎秧', lift: '起薯',
};
const JOBS = {
  planter: { at: 0, label: '播种机' },
  hiller: { at: 20, label: '培土机' },
  topper: { at: 100, label: '杀秧机' },
  lifter: { at: 114, label: '收获机' },
};
export function potatoPhase(day) {
  if (day < 6) return 'plant';
  if (day < 18) return 'ridge';
  if (day < 20) return 'shoot';
  if (day < 26) return 'hill';
  if (day < 46) return 'shoot';
  if (day < 72) return 'canopy';
  if (day < 100) return 'flower';
  if (day < 106) return 'top';
  if (day < 114) return 'haulm';
  return 'lift';
}
export function stageNum(day) {
  if (day < 18) return 1;
  if (day < 46) return 2;
  if (day < 72) return 3;
  if (day < 100) return 4;
  if (day < 114) return 5;
  return 6;
}
function passProgress(day, at) {
  const dur = passWorldDays();
  const u = day - at;
  if (u < 0) return null;
  if (u >= dur) return L.LANES;
  return (u / dur) * L.LANES;
}
export function workFront(day) {
  const jobs = [0, 20, 100, 114];
  let front = 0;
  for (const at of jobs) {
    if (day < at) break;
    const p = passProgress(day, at);
    if (p != null) front = p;
  }
  return front;
}
export function fieldVisual(f) {
  if (f && f.live && !f.paid && f.crop >= 0 && CROPS[f.crop].id === 'potato') {
    const day = Math.max(0, worldDay - f.plantedAt);
    if (day < POTATO_DAYS) return { crop: f.crop, g: stageNum(day) + 0.2, s: workFront(day), dir: f.dir };
  }
  return { crop: f.crop, g: f.state === 0 ? 0 : f.g, s: (f.state === 3 || f.state === 4) ? f.s : 0, dir: f.dir };
}
export function cropWatch(f) {
  if (!f?.live || f.paid || f.crop < 0 || CROPS[f.crop].id !== 'potato') return null;
  const day = Math.max(0, worldDay - f.plantedAt);
  const phase = potatoPhase(Math.min(day, POTATO_DAYS - 0.001));
  return { day, phase, label: PHASE_LABEL[phase], front: workFront(day), days: POTATO_DAYS };
}

// 与 v3.1 相同次数的随机数，好让后面的运输车 / 无人机还落在原来的位置上
for (const f of fields) if (f.state === 3) { rnd(); rnd(); }

for (const f of fields) {
  const bi = Math.floor(f.i / L.PER), bj = Math.floor(f.j / L.PER);
  f.inPlot = inPlotBlock(bi, bj);
  f.owned = f.inPlot && f.crop >= 0;
  f.frozen = !f.owned;
  f.live = false;
  f.hold = true;
  f.plantedAt = 0;
  f.claimed = false;
  // 没有机器跟着的半截收割，收成完整冠层，避免邻区或定格田永远缺一角
  if (f.owned && f.state === 3) { f.state = 2; f.s = 0; f.g = 1; }
}

function laneV(l) { return (l + 0.5) * L.LANE; }
function placeRig(h) {
  const dirp = h.lane % 2 === 0;
  const [x, z] = toWorld(h.f, h.u, laneV(h.lane));
  h.x = x; h.z = z;
  const ua = dirp ? 0 : Math.PI;
  h.ang = h.f.dir === 0 ? ua : (dirp ? Math.PI / 2 : -Math.PI / 2);
  h.vert = h.f.dir === 0;
}
function armCutter(f, lane, u) {
  if (!f) return null;
  f.claimed = true; f.state = 3; f.g = 1; f.live = true; f.hold = false; f.frozen = false;
  f.s = lane + Math.min(0.95, Math.max(0, u / L.FIELD));
  const h = { id: harvesters.length, f, mode: 'cut', lane, u, path: null, x: 0, z: 0, ang: 0, turnT: 0, prog: 0.4, idleT: 0 };
  placeRig(h);
  harvesters.push(h);
  return h;
}
function poseOn(f, s) {
  const capped = Math.min(Math.max(s, 0), L.LANES - 0.001);
  const lane = Math.floor(capped);
  const frac = capped - lane;
  const dirp = lane % 2 === 0;
  const u = dirp ? frac * L.FIELD : (1 - frac) * L.FIELD;
  const [x, z] = toWorld(f, u, laneV(lane));
  const along = dirp ? 0 : Math.PI;
  const ang = f.dir === 0 ? along : (dirp ? Math.PI / 2 : -Math.PI / 2);
  return { x, z, ang };
}
function placeRigs() {
  const live = [];
  for (const f of fields) if (f.live && !f.paid && f.crop >= 0 && CROPS[f.crop].id === 'potato') live.push(f);
  for (const r of rigs) {
    const spec = JOBS[r.kind];
    const dur = passWorldDays();
    let best = null, bestU = 1e9;
    for (const f of live) {
      const u = worldDay - f.plantedAt - spec.at;
      if (u < 0 || u >= dur) continue;
      if (u < bestU) { bestU = u; best = f; }
    }
    if (!best) { r.busy = false; r.f = null; r.x = r.parkX; r.z = r.parkZ; r.ang = -Math.PI / 2; continue; }
    const pose = poseOn(best, ((worldDay - best.plantedAt - spec.at) / dur) * L.LANES);
    r.busy = true; r.f = best; r.x = pose.x; r.z = pose.z; r.ang = pose.ang;
  }
}
function settlePotatoes() {
  for (const f of fields) {
    if (!f.live || f.paid || f.crop < 0 || CROPS[f.crop].id !== 'potato') continue;
    const day = worldDay - f.plantedAt;
    if (!f.sprayed && day >= JOBS.topper.at) {
      f.sprayed = true;
      if (stores.spray > 0) stores.spray -= 1;
    }
    if (day >= POTATO_DAYS) {
      f.paid = true;
      const crop = CROPS[f.crop];
      const lot = {
        id: nextLot++, crop: crop.id, name: crop.name,
        liters: Math.round(FIELD_HA * crop.yieldL),
        listPrice: quote(f.crop),
        i: f.i, j: f.j, t: worldDay,
      };
      warehouse.push(lot);
      log.push({ type: 'store', pay: 0, listPrice: lot.listPrice, crop: crop.id, name: crop.name, i: f.i, j: f.j, t: worldDay });
      f.live = false; f.hold = true; f.state = 0; f.g = 0; f.s = 0; f.claimed = false;
    }
  }
  placeRigs();
}

// 镜头落在中枢旁一块可播种的裸地上。远处留一台不入账的收割机，近景镜头仍有机器可读。
{
  const bare = fieldAt((L.HUBX + 1) * L.PER + 1, L.HUBZ * L.PER + 1);
  bare.state = 0; bare.g = 0; bare.s = 0; bare.timer = 0; bare.owned = true; bare.live = false; bare.hold = true; bare.frozen = false; bare.paid = false; bare.sprayed = false;
  focus.x = bare.x0 + L.FIELD / 2; focus.z = bare.z0 + L.FIELD / 2; focus.i = bare.i; focus.j = bare.j;
  let maize = null, best = 1e9;
  for (const f of fields) {
    if (!f.owned || f === bare) continue;
    const d = Math.hypot(f.x0 + L.FIELD / 2, f.z0 + L.FIELD / 2);
    if (d < 620 || d > 1400) continue;
    const score = d + (CROPS[f.crop]?.id === 'maize' ? 0 : 4000);
    if (score < best) { best = score; maize = f; }
  }
  if (maize) { maize.crop = CROPS.findIndex(c => c.id === 'maize'); maize.demo = true; armCutter(maize, 3, 48); }
  ['planter', 'hiller', 'topper', 'lifter'].forEach((kind, n) => {
    const x = 36 + n * 22, z = 176;
    rigs.push({ id: n, kind, label: JOBS[kind].label, busy: false, f: null, parkX: x, parkZ: z, x, z, ang: -Math.PI / 2 });
  });
  for (const f of fields) {
    if (signals.length >= 56) break;
    if (f.owned || f.crop < 0 || f.state < 2 || f.state > 3) continue;
    if ((f.idx % 23) !== 0) continue;
    signals.push({ x: f.x0 + L.FIELD / 2, z: f.z0 + L.FIELD / 2 });
  }
}

export function fieldAtWorld(x, z) {
  let qx = x - L.X0;
  qx = ((qx % RING.CIRC) + RING.CIRC) % RING.CIRC;
  const qy = z - L.Z0;
  if (qy > -L.TRUNK && qy < 0) return null;
  const bx = Math.floor(qx / L.BP), by = Math.floor(qy / L.BP);
  if (by < 0 || by >= L.NBZ || bx < 0 || bx >= L.NBX) return null;
  const blx = qx - bx * L.BP, bly = qy - by * L.BP;
  if (blx > L.BLOCK || bly > L.BLOCK) return null;
  if (bx === L.HUBX && by === L.HUBZ) return null;
  const fi = Math.floor(blx / (L.FIELD + L.ROAD)), fj = Math.floor(bly / (L.FIELD + L.ROAD));
  const locx = blx - fi * (L.FIELD + L.ROAD), locz = bly - fj * (L.FIELD + L.ROAD);
  if (locx < 0 || locz < 0 || locx > L.FIELD || locz > L.FIELD) return null;
  return fieldAt(bx * L.PER + fi, by * L.PER + fj);
}

function manhattan(ax, az, aVert, ex, ez, eVert) {
  if (aVert && !eVert) return [[ax, ez], [ex, ez]];
  if (!aVert && eVert) return [[ex, az], [ex, ez]];
  if (aVert && eVert) { const zr = nearestRoad((az + ez) / 2); return [[ax, zr], [ex, zr], [ex, ez]]; }
  const xr = nearestRoad((ax + ex) / 2); return [[xr, az], [xr, ez], [ex, ez]];
}
function dispatch(h) {
  let best = null, bd = 1e18;
  const ci = Math.floor((h.x - L.X0) / (L.BP / L.PER)), cj = Math.floor((h.z - L.Z0) / (L.BP / L.PER));
  const R = 64;
  {
    for (let j = Math.max(0, cj - R); j <= Math.min(L.NFZ - 1, cj + R); j++) for (let i = Math.max(0, ci - R); i <= Math.min(L.NFX - 1, ci + R); i++) {
      const f = fields[j * L.NFX + i];
      if (!f.owned || !f.live || f.hold || f.state !== 2 || f.claimed) continue;
      const pri = f.plantedAt ? 0 : 1;
      const d = pri * 1e7 + Math.abs(f.x0 - h.x) + Math.abs(f.z0 - h.z) + rnd() * 30;
      if (d < bd) { bd = d; best = f; }
    }
  }
  if (!best) { h.mode = 'idle'; h.f = null; return; }
  best.claimed = true; h.f = best; h.lane = 0;
  const [ex, ez] = toWorld(best, -L.ROAD / 2, laneV(0));
  const aVert = h.vert !== undefined ? h.vert : Math.abs(nearestRoad(h.x) - h.x) < 0.5;
  const eVert = best.dir === 0;
  h.path = manhattan(h.x, h.z, aVert, ex, ez, eVert); h.mode = 'travel';
}
export function stepFields(days) {
  for (const f of fields) {
    if (f.live && f.crop >= 0 && CROPS[f.crop].id === 'potato') continue;
    if (f.state === 4) {
      f.timer -= days;
      if (f.timer < 0) { f.state = 0; f.s = 0; f.g = 0; f.live = false; f.hold = true; f.timer = 0; f.plantedAt = 0; }
    }
  }
}
export function stepHarvesters(dt) {
  for (const h of harvesters) {
    if (h.mode === 'idle') { h.idleT = (h.idleT || 0) + dt; if (h.idleT > 0.4) { h.idleT = 0; dispatch(h); } continue; }
    if (h.mode === 'travel') {
      let rem = SIM.MOVE * dt;
      while (rem > 0 && h.path.length) {
        const [tx, tz] = h.path[0], dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz);
        if (d < 1e-3) { h.path.shift(); continue; }
        const s = Math.min(d, rem); h.x += dx / d * s; h.z += dz / d * s; rem -= s; h.ang = Math.atan2(dz, dx);
        if (s >= d) h.path.shift();
      }
      if (!h.path.length) { h.mode = 'cut'; h.lane = 0; h.u = -L.ROAD / 2; h.f.state = 3; }
      continue;
    }
    const f = h.f, dirp = h.lane % 2 === 0;
    if (h.mode === 'cut') {
      h.u += (dirp ? 1 : -1) * SIM.CUT * dt;
      const front = dirp ? h.u + 5.2 : L.FIELD - (h.u - 5.2);
      f.s = Math.max(f.s, h.lane + Math.min(1, Math.max(0, front / L.FIELD)));
      const [x, z] = toWorld(f, h.u, laneV(h.lane)); h.x = x; h.z = z;
      const ua = dirp ? 0 : Math.PI; h.ang = f.dir === 0 ? ua : (dirp ? Math.PI / 2 : -Math.PI / 2);
      if (dirp ? h.u > L.FIELD + L.ROAD / 2 : h.u < -L.ROAD / 2) {
        f.s = h.lane + 1;
        if (h.lane + 1 >= L.LANES) {
          h.vert = f.dir === 0; f.state = 4; f.s = L.LANES; f.g = 1; f.timer = SIM.STUBBLE; f.claimed = false; f.plantedAt = 0;
          h.f = null; dispatch(h);
        }
        else { h.mode = 'turn'; h.turnT = 0; }
      }
    } else if (h.mode === 'turn') {
      // 在田头路上做半径 = 半个作业带宽度的 U 形掉头
      h.turnT += dt * SIM.CUT / (Math.PI * L.LANE / 2);
      const a = Math.min(1, h.turnT) * Math.PI, r = L.LANE / 2, cu = dirp ? L.FIELD + L.ROAD / 2 : -L.ROAD / 2, cv = laneV(h.lane) + r;
      const u = cu + (dirp ? 1 : -1) * Math.sin(a) * r * 0.55, v = cv - Math.cos(a) * r;
      const [x, z] = toWorld(f, u, v); const nx = x - h.x, nz = z - h.z; if (Math.hypot(nx, nz) > 1e-4) h.ang = Math.atan2(nz, nx); h.x = x; h.z = z;
      if (h.turnT >= 1) { h.lane++; h.mode = 'cut'; h.u = cu; }
    }
  }
}
export function inPlayerPlot(x, z) {
  const wx = wrapX(x);
  return wx >= PLOT.x0 && wx <= PLOT.x1 && z >= PLOT.z0 && z <= PLOT.z1;
}
export function placeBuilding(x, z) {
  if (!inPlayerPlot(x, z)) return { ok: false, reason: 'plot' };
  const b = { id: nextBuilding++, kind: 'shed', name: '仓棚', x, z, ang: 0 };
  buildings.push(b);
  return { ok: true, building: b };
}
export function sellLot(id) {
  const i = warehouse.findIndex(lot => lot.id === id);
  if (i < 0) return null;
  const lot = warehouse.splice(i, 1)[0];
  economy.revenue += lot.listPrice;
  log.push({ type: 'sale', pay: lot.listPrice, crop: lot.crop, name: lot.name, i: lot.i, j: lot.j, t: worldDay });
  return lot;
}
export function plantField(f, cropId) {
  if (!f?.owned) return { ok: false, reason: 'plot' };
  if (f.state === 3 || f.live) return { ok: false, reason: 'busy' };
  const crop = typeof cropId === 'number' ? cropId : CROPS.findIndex(c => c.id === cropId);
  if (crop < 0 || !CROPS[crop].plantable) return { ok: false, reason: 'crop' };
  if (stores.seed < 1) return { ok: false, reason: 'seed' };
  if (stores.fertilizer < 1) return { ok: false, reason: 'fertilizer' };
  stores.seed -= 1;
  stores.fertilizer -= 1;
  f.crop = crop; f.state = 1; f.g = 0; f.s = 0; f.timer = 0;
  f.live = true; f.hold = false; f.frozen = false;
  f.plantedAt = worldDay; f.paid = false; f.sprayed = false; f.claimed = false;
  placeRigs();
  return { ok: true, payout: quote(crop), name: CROPS[crop].name, day: worldDay };
}
export function exportSnapshot() {
  return {
    schema: 2,
    kind: 'farm-snapshot',
    plotId: PLOT.id,
    simTime: worldDay,
    worldDay,
    revenue: economy.revenue,
    timeScale: economy.timeScale,
    stores: { seed: stores.seed, fertilizer: stores.fertilizer, spray: stores.spray },
    warehouse: warehouse.map(lot => ({ ...lot })),
    buildings: buildings.map(b => ({ id: b.id, kind: b.kind, name: b.name, x: +b.x.toFixed(2), z: +b.z.toFixed(2), ang: b.ang || 0 })),
    fields: fields.filter(f => f.owned).map(f => ({
      i: f.i, j: f.j, crop: f.crop, dir: f.dir, state: f.state,
      g: +f.g.toFixed(4), s: +f.s.toFixed(4), timer: +(+f.timer || 0).toFixed(3),
      growT: f.growT, live: !!f.live, hold: !!f.hold, plantedAt: f.plantedAt || 0,
      paid: !!f.paid, sprayed: !!f.sprayed,
    })),
    harvesters: harvesters.map(h => ({
      id: h.id, mode: h.mode, lane: h.lane, u: +h.u.toFixed(2),
      x: +h.x.toFixed(2), z: +h.z.toFixed(2), ang: +h.ang.toFixed(4),
      i: h.f ? h.f.i : null, j: h.f ? h.f.j : null,
    })),
  };
}
function rebuildDemo() {
  harvesters.length = 0;
  for (const f of fields) {
    if (f.state !== 3 || f.crop < 0 || CROPS[f.crop].id === 'potato') continue;
    f.claimed = false;
    armCutter(f, 3, 48);
  }
}
export function applySnapshot(data) {
  if (!data || data.schema !== 2 || data.plotId !== PLOT.id || !Array.isArray(data.fields)) return false;
  const by = new Map(data.fields.map(s => [s.i + ':' + s.j, s]));
  for (const f of fields) {
    if (!f.owned) continue;
    const s = by.get(f.i + ':' + f.j);
    if (!s) continue;
    if (s.crop >= 0 && s.crop < CROPS.length) f.crop = s.crop;
    if (s.dir === 0 || s.dir === 1) f.dir = s.dir;
    f.state = s.state; f.g = +s.g || 0; f.s = +s.s || 0; f.timer = +s.timer || 0;
    f.growT = s.growT || f.growT; f.live = !!s.live; f.hold = !!s.hold; f.plantedAt = s.plantedAt || 0;
    f.paid = !!s.paid; f.sprayed = !!s.sprayed;
    f.claimed = false; f.frozen = false; f.owned = true;
  }
  economy.revenue = +data.revenue || 0;
  if (data.stores) {
    stores.seed = +data.stores.seed || 0;
    stores.fertilizer = +data.stores.fertilizer || 0;
    stores.spray = +data.stores.spray || 0;
  }
  if (data.timeScale) setTimeScale(data.timeScale);
  warehouse.length = 0;
  for (const lot of data.warehouse || []) {
    warehouse.push({ ...lot, id: +lot.id || nextLot++ });
    nextLot = Math.max(nextLot, (+lot.id || 0) + 1);
  }
  buildings.length = 0;
  for (const b of data.buildings || []) {
    buildings.push({ id: +b.id || nextBuilding++, kind: b.kind || 'shed', name: b.name || '仓棚', x: +b.x || 0, z: +b.z || 0, ang: +b.ang || 0 });
    nextBuilding = Math.max(nextBuilding, (+b.id || 0) + 1);
  }
  worldDay = +(data.worldDay ?? data.simTime) || 0;
  simTime = worldDay;
  rebuildDemo();
  placeRigs();
  return true;
}

// ---------- ⑧ 运输车（沿主干走廊随机游走）与巡检无人机 ----------
export const haulers = Array.from({ length: 160 }, (_, k) => {
  // 沿环方向的走廊跑长途（绕环），跨环方向的走廊只在环带宽度内往返
  const vert = rnd() < 0.3, T = vert ? TRUNKS_X : TRUNKS_Z;
  // 跨环走廊：集中在中枢 ±20 区
  const line = (vert ? TRUNKS_X[L.HUBX - 20 + Math.floor(rnd() * 41)] : T[Math.floor(rnd() * T.length)]) + (rnd() < 0.5 ? 7 : -7);
  return { vert, line, p: vert ? L.Z0 + rnd() * L.NBZ * L.BP : L.X0 + (0.5 + (rnd() - 0.5) * 0.25) * RING.CIRC, sp: (rnd() < 0.5 ? 1 : -1) * (18 + rnd() * 8), x: 0, z: 0, ang: 0 };
});
export function stepHaulers(dt) {
  for (const h of haulers) {
    h.p += h.sp * dt;
    if (h.vert) { const lo = L.Z0 - L.TRUNK / 2, hi = L.Z0 + L.NBZ * L.BP - L.TRUNK / 2; if (h.p < lo || h.p > hi) { h.sp = -h.sp; h.p = Math.max(lo, Math.min(hi, h.p)); } }
    else h.p = wrapX(h.p);   // 环向：首尾相接
    if (h.vert) { h.x = h.line; h.z = h.p; h.ang = h.sp > 0 ? Math.PI / 2 : -Math.PI / 2; } else { h.x = h.p; h.z = h.line; h.ang = h.sp > 0 ? 0 : Math.PI; }
  }
}
export const drones = Array.from({ length: 90 }, () => {
  const r = 300 + rnd() * 3200, a = rnd() * 6.283;
  return { cx: Math.cos(a) * r * 1.6, cz: Math.max(-1700, Math.min(1700, Math.sin(a) * r * 0.5)), R: 40 + rnd() * 90, sp: 0.12 + rnd() * 0.15, ph: rnd() * 6.283, h: 22 + rnd() * 18, x: 0, y: 0, z: 0, ang: 0 };
});
export function stepDrones(t) {
  for (const d of drones) { const a = t * d.sp + d.ph; d.x = d.cx + Math.cos(a) * d.R; d.z = d.cz + Math.sin(a * 2) * d.R * 0.5; d.y = d.h + Math.sin(t * 1.3 + d.ph) * 0.8; d.ang = Math.atan2(Math.cos(a * 2) * d.R, -Math.sin(a) * d.R); }
}
export function step(dt, t, scale = 1) {
  if (paused) { simTime = worldDay; return; }
  const sc = scale > 0 ? scale : 0;
  const days = dt * sc / DAY_SECONDS;
  worldDay += days;
  simTime = worldDay;
  stepFields(days);
  settlePotatoes();
  stepHarvesters(dt * sc);
  stepHaulers(dt);
  stepDrones(t);
}
