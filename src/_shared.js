// =====================================================================
//  环穗 (Ringsheaf) · v3.1 「环带殖民卫星」（轨道制图 × 冷静工业）
//  _shared.js —— 色板 / 作物参数 / 农场布局 / 自动化模拟（纯数据与逻辑，不含渲染）
// =====================================================================
import { productById, recipeById, deviceById, shopRows, utilityCost, LOOP_OFFSETS } from './products.js';
import { cropDef, rigProfile, rigCan, rigHas, hitchPlan, hitchHasModes, droneCan, JOB_PENALTY, UNLOAD_WHILE_MOVING, BIN_LANES, UNLOAD_SECONDS, TRAILER_CARGO_CAP, HITCH_SWAP_S, RELOAD_S, MODE_SWITCH_S, SURFACE_CROPS } from './surface-crops.js';
export { cropDef, rigProfile, JOB_PENALTY, UNLOAD_WHILE_MOVING, BIN_LANES, SURFACE_CROPS };

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
// plantable : 表层四作物可种。其余条目只给环带色块。饲料大麦加在末尾，权重 0，不进邻区抽选，旧存档的作物下标不变。
// weight : 环带上的占比（邻区快照仍用原来的纹理，色板才和美术小样一致）
// 商品薯阶段中点加总后，成熟待收从第 81 日开始。yieldL / price 只作一茬营收的量级。
export const CROPS = [
  { id: 'wheat',   name: '麦色冠层', analog: '小麦', family: 'grain', young: 'olive',   ripe: 'straw',  stub: 'regoLt', height: 1.0, row: 0.45, along: 0.30, tex: 'drill',  shape: 'ear',     grow: 260, season: 22, plantable: false, weight: 0.27 },
  { id: 'maize',   name: '高秆冠层', analog: '玉米', family: 'green', young: 'oliveDp', ripe: 'olive',  stub: 'ochre',  height: 2.6, row: 0.80, along: 0.32, tex: 'wide',   shape: 'stalk',   grow: 320, season: 26, plantable: false, weight: 0.17 },
  { id: 'soy',     name: '大豆', analog: '大豆', family: 'green', young: 'oliveDp', ripe: 'oliveDp',stub: 'regoDk', height: 0.8, row: 0.50, along: 0.30, tex: 'drill',  shape: 'bush',    grow: 240, season: 87, plantable: true, yieldL: 3200, price: 520, weight: 0.15, days: 77 },
  { id: 'potato',  name: '中熟商品薯', analog: '商品薯', family: 'grain', young: 'oliveDp', ripe: 'ochre', stub: 'rust', height: 0.55, row: 0.90, along: 0.40, tex: 'ridges', shape: 'bush', grow: 280, season: 92, plantable: true, yieldL: 44000, price: 412, weight: 0.10, days: 81 },
  { id: 'rice',    name: '水田冠层', analog: '水稻', family: 'teal',  young: 'tealGy',  ripe: 'tealGy', stub: 'regoDk', height: 0.8, row: 0.40, along: 0.30, tex: 'paddy',  shape: 'tuft',    grow: 300, season: 24, plantable: false, weight: 0.08 },
  { id: 'cabbage', name: '结球甘蓝', analog: '甘蓝', family: 'teal',  young: 'tealGy',  ripe: 'sage',   stub: 'regoDk', height: 0.45,row: 0.70, along: 0.55, tex: 'beds',   shape: 'rosette', grow: 220, season: 76, plantable: true, yieldL: 48000, price: 96, weight: 0.08, days: 66 },
  { id: 'alfalfa', name: '银叶苜', analog: '苜蓿', family: 'teal',  young: 'tealGy',  ripe: 'steel',  stub: 'regoDk', height: 0.7, row: 0.30, along: 0.25, tex: 'drill',  shape: 'tuft',    grow: 200, season: 18, plantable: false, weight: 0.10 },
  { id: 'sorghum', name: '锈穗粱', analog: '高粱', family: 'grain', young: 'olive',   ripe: 'rust',   stub: 'ochre',  height: 1.8, row: 0.75, along: 0.30, tex: 'wide',   shape: 'stalk',   grow: 300, season: 24, plantable: false, weight: 0.05 },
  { id: 'feed_barley', name: '饲料大麦', analog: '大麦', family: 'grain', young: 'olive', ripe: 'straw', stub: 'ochre', height: 0.9, row: 0.4, along: 0.28, tex: 'drill', shape: 'ear', grow: 240, season: 65, plantable: true, yieldL: 5200, price: 180, weight: 0, days: 57 },
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
// 1g 自旋。镜头钉在环架上，所以转的是星空和轴端太阳，不是脚下的田。
// ω²R ≈ g：0.29 rpm × RING.R。一天的日照不靠这次自旋，靠下面的扇区镜。
export const RING_RPM = 0.29;
export const RING_OMEGA = RING_RPM * 2 * Math.PI / 60;
// 南极轴端镜组相对环带一天扫一圈。昼区 180°，晨昏各 8°（落在 5–10° 半影里）。
export const DAY_SECTOR = Math.PI;
export const PENUMBRA = 8 * Math.PI / 180;
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
// 每个玩家一块 7 区宽的田，中枢在正中。环上隔 7 个区再立一座中枢。120 区不能整除，最后一隙是 8 区。
export const HUB_SITES = (() => {
  const span = 7;
  const n = Math.floor(L.NBX / span);
  const sites = [];
  for (let k = 0; k < n; k++) {
    const bi = (L.HUBX + k * span) % L.NBX;
    sites.push({ bi, bj: L.HUBZ, local: bi === L.HUBX });
  }
  return sites;
})();
export function quote(crop) {
  const c = CROPS[crop];
  if (!c?.plantable) return 0;
  const listed = productById(c.id)?.sellPrice;
  if (listed != null) return listed;
  return Math.round(FIELD_HA * c.yieldL * c.price / 1000);
}
// ---------- ④b 垂直分层（地表 + 地下各层）。新增一层：在这里加一项，并在 main.js 的 DECK_BUILDERS 里给它写内容 ----------
// top / floor：该层顶板底面与地板面的高度（米，地表 = 0，向下为负）；slab：顶板厚度（含土层）
export const LAYERS = [
  { id: 'surface', name: '地表农田', en: 'SURFACE FIELDS', top: 0, floor: 0, slab: 0 },
  { id: 'grow', name: '地下培育层', en: 'GROW DECK', top: -4.5, floor: -17, slab: 4.5, content: 'protein' },
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
// 1×：一真实分钟 = 120 世界分钟（2 世界时）。一世界日 = 12 真实分钟。一真实日约 120 世界日。
// 倍率仍同时加快这口钟和农机。暂停把两者都停住。
// 农机按田里约 3 km/h，乘上这口钟的 120 倍，再 ÷10，画面上约 10 m/s。不要按 1440 去乘。
export const WORLD_MIN_PER_REAL_MIN = 120;
export const DAY_SECONDS = (1440 / WORLD_MIN_PER_REAL_MIN) * 60;
export const MACHINE_MPS = (3000 / 3600) * WORLD_MIN_PER_REAL_MIN / 10;
export const SIM = { CUT: MACHINE_MPS, MOVE: MACHINE_MPS, STUBBLE: 8, TILL: 0 };
const potatoDef = cropDef('potato');
export const POTATO_DAYS = potatoDef.maturity;
// 成熟之后留在田里等收获。过了这扇窗口还没人收，就算烂在地里，不入仓。
export const POTATO_HOLD = potatoDef.hold;
export const POTATO_ROT_AT = potatoDef.rotAt;
// 满电能走的米数，是原先 4200 的五倍。一趟田加来回路程只占几个百分点。
// 出库门槛是满电。人已经在田上、电还够走，就接着去下一块，不回库补满。
export const BATT_RANGE = 21000;
export const BATT_LEAVE = 1;
export const RECHARGE_S = 24;
// 软上限。maxSlots / maxLiters 为 null 时不拒收。以后把这两个数填上，warehouseCanStore 就会拦住。
export const WAREHOUSE_CAP = { maxSlots: null, maxLiters: null };
export function passWorldDays() {
  return (L.LANES * L.FIELD) / (MACHINE_MPS * DAY_SECONDS);
}
// 重开和没有存档的新局都从这一笔营收开始，早期买得起基站和无人机。
export const START_REVENUE = 1000000;
export const economy = { revenue: START_REVENUE, timeScale: 1 };
// 一块田用一份种薯、一份肥料。新游戏只带这一份，之后到商店买。价格是占位，和营收同一记账单位。
const fieldRecipe = recipeById('potato-field');
export const SEED_PER_FIELD = fieldRecipe.inputs.find(i => i.id === 'seed').qty;
export const FERT_PER_FIELD = fieldRecipe.inputs.find(i => i.id === 'fertilizer').qty;
export const SHOP = shopRows();
const START_FERTILIZER = FERT_PER_FIELD;
const START_SPRAY = 6;
const START_FEED = 2;
export const stores = { seed: SEED_PER_FIELD, fertilizer: START_FERTILIZER, spray: START_SPRAY, feed: START_FEED, peel: 0, frass: 0, seed_soy: 0, seed_barley: 0, seedling_cabbage: 0 };
// 培育层两种蛋白。天数取自发表的幼虫历期，牌价读产品表。
// 蛴螬：白星花金龟 Protaetia brevitarsis 幼虫，30°C 发酵基质上幼虫期 64.8 日，这里记 65 日。
// 黑水虻：Hermetia illucens，30°C 配方饲料上幼虫期 12.8 日，这里记 13 日。
export const CULTURES = [
  { id: 'grub', name: productById('grub').nameZh, days: recipeById('grub-culture').timeDays, price: productById('grub').sellPrice },
  { id: 'bsf', name: productById('bsf').nameZh, days: 13, price: productById('bsf').sellPrice },
];
export const DECK_CLIMATE = { temp: 30, rh: 70 };
export const TANK_COUNT = 4;
export const tanks = Array.from({ length: TANK_COUNT }, (_, id) => ({ id, species: null, startedAt: 0, tended: false }));
// 培育槽不放在中枢。四口槽排在中枢东侧那一区、同一排小格上，臂沿这排走。中枢只留设备。
export const CULTURE_CELLS = Array.from({ length: TANK_COUNT }, (_, i) => ({ bi: L.HUBX + 1, bj: L.HUBZ, fi: i, fj: 1 }));
export const BUILDING_KINDS = {
  warehouse: { id: 'warehouse', name: '仓库' },
  garage: { id: 'garage', name: '机库' },
  process: { id: 'process', name: '加工棚' },
  shed: { id: 'shed', name: '仓棚' },
  drone_base: { id: 'drone_base', name: '无人机基站', price: 8000 },
};
export const warehouse = [];
export const buildings = [];
export const devices = [];
let nextLot = 1;
let nextBuilding = 1;
let nextDevice = 1;
let planSeq = 1;
export let paused = false;
export function setPaused(v) { paused = !!v; }
export let simTime = 0;
export let worldDay = 0;
export function setWorldDay(day) {
  worldDay = +day || 0;
  simTime = worldDay;
}
// 昼区中心在环向上的角。一世界日走一整圈，加速时跟这口钟，不跟墙钟。
export function dayCenter(day = worldDay) {
  const tau = Math.PI * 2;
  let a = (day % 1) * tau;
  if (a < 0) a += tau;
  return a;
}
// 地块日照 0–1。圆心角 DAY_SECTOR 为昼，边界两侧各 PENUMBRA 是晨昏。
export function sectorLight(x, day = worldDay) {
  const tau = Math.PI * 2;
  const circ = RING.CIRC;
  let u = x % circ;
  if (u < 0) u += circ;
  const ang = (u / circ) * tau;
  let d = Math.abs(ang - dayCenter(day));
  if (d > Math.PI) d = tau - d;
  const half = DAY_SECTOR * 0.5;
  const inner = half - PENUMBRA;
  const outer = half + PENUMBRA;
  if (d <= inner) return 1;
  if (d >= outer) return 0;
  const t = (d - inner) / (outer - inner);
  const s = t * t * (3 - 2 * t);
  return 1 - s;
}
export function sectorWord(x, day = worldDay) {
  const light = sectorLight(x, day);
  if (light > 0.82) return '昼';
  if (light < 0.18) return '夜';
  return '晨昏';
}
export const log = [];
export const focus = { x: 0, z: 0, i: 0, j: 0 };
export const signals = [];
export const harvesters = [];
export const rigs = [];
let nextRigId = 0;
let garageOrigin = { x: 0, z: 0 };
export function setTimeScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return;
  economy.timeScale = Math.min(10000, n);
}
export const PHASE_LABEL = { plan: '待播种', rot: '烂在地里' };
function decorateStages(def) {
  return def.stages.map(s => {
    const mine = def.jobs.filter(j => j.stage === s.id);
    const named = mine.filter(j => !j.auto).map(j => j.name);
    const machine = named.join('、') || (mine.some(j => j.auto) ? '水网' : null);
    return { ...s, machine, machineAt: machine ? s.from : null };
  });
}
for (const c of CROPS) {
  const def = cropDef(c.id);
  if (!def) {
    c.stages = [];
    c.yieldNote = `邻区色块。这一季不能种。参考季长 ${c.season} 日。`;
    continue;
  }
  c.days = def.maturity;
  c.season = def.rotAt;
  c.stages = decorateStages(def);
  for (const s of c.stages) PHASE_LABEL[s.id] = s.name;
  const seedName = productById(def.seed)?.nameZh || '种子';
  c.yieldNote = `第 ${def.maturity} 日进入成熟待收，第 ${def.rotAt} 日还没收就烂在地里。${seedName}只从商店来。钟自己往前走。播种或移栽走完以前，田面保持裸土。`;
}
// 进度条和「作物」页共用。入仓量仍是整块，再乘漏做的惩罚。
export const POTATO_STAGES = CROPS.find(c => c.id === 'potato').stages;
const FIELD_RECIPE = { potato: 'potato-field', soy: 'soy-field', feed_barley: 'barley-field', cabbage: 'cabbage-field' };
// 农机店。拖拉机进库后按作业回库换挂。联合收割、结球收、移栽是自走平台，侧卸另派有挂车的拖拉机。
export const MACHINE_SHOP = [
  { id: 'tractor', name: '拖拉机', price: 12000 },
  { id: 'planter', name: '播种机', price: 9000 },
  { id: 'hiller', name: '培土机', price: 7000 },
  { id: 'topper', name: '杀秧机', price: 7000 },
  { id: 'lifter', name: '收获机', price: 14000 },
  { id: 'harvester_combine', name: '联合收割机', price: 16000 },
  { id: 'harvester_cabbage', name: '结球收获机', price: 15000 },
  { id: 'transplanter', name: '移栽机', price: 11000 },
];
// 无人机不进机库。基站在中枢买下之后，侦察和植保从基站起飞。
export const DRONE_SHOP = [
  { id: 'drone_scout', name: '侦察无人机', price: 4500 },
  { id: 'drone_treat', name: '植保无人机', price: 5200 },
];
export const DRONE_MPS = 18;
export const DRONE_PARK_Y = 0.28;
export const DRONE_WORK_Y = 8;
export const DRONE_CRUISE_Y = 12;
export const workDrones = [];
let nextDroneId = 1;
export function droneBase() {
  return buildings.find(b => b.kind === 'drone_base') || null;
}
export function potatoPhase(day) {
  const stages = POTATO_STAGES;
  if (day >= POTATO_ROT_AT) return 'rot';
  for (const s of stages) if (day < s.to) return s.id;
  return 'rot';
}
export function stageNum(day) {
  if (day >= POTATO_ROT_AT) return 8;
  const i = POTATO_STAGES.findIndex(s => day < s.to);
  return i < 0 ? 8 : i + 1;
}
export function cropDossier(id) {
  const c = typeof id === 'number' ? CROPS[id] : CROPS.find(x => x.id === id);
  if (!c) return null;
  const stages = (c.stages || []).map(s => ({
    id: s.id, name: s.name, from: s.from, to: s.to, days: s.to - s.from, color: s.color,
    machine: s.machine, machineAt: s.machineAt, effect: s.effect,
  }));
  const recipe = FIELD_RECIPE[c.id] ? recipeById(FIELD_RECIPE[c.id]) : null;
  const inputs = [];
  const outputs = [];
  if (recipe) {
    for (const row of recipe.inputs) {
      const p = productById(row.id);
      inputs.push({ id: row.id, name: p?.nameZh || row.id, qty: row.qty, unit: row.unit || p?.unit || '', charged: true });
    }
    for (const key of Object.keys(recipe.utilities || {})) {
      const p = productById(key);
      inputs.push({ id: key, name: p?.nameZh || key, qty: recipe.utilities[key], unit: p?.unit || '', charged: !recipe.stub });
    }
    outputs.push({
      id: c.id, name: c.name, liters: Math.round(FIELD_HA * (c.yieldL || 0)), unit: 'L',
      price: quote(CROPS.indexOf(c)), batch: recipe.outputs[0]?.unit || '',
    });
  }
  return {
    id: c.id, name: c.name, analog: c.analog, plantable: !!c.plantable,
    days: c.days || c.season, family: c.family, stages, yieldNote: c.yieldNote || '',
    inputs, outputs,
  };
}
function cropOf(f) {
  if (!f || f.crop < 0) return null;
  return cropDef(CROPS[f.crop]?.id);
}
function fieldDay(f) {
  if (!f || f.plantedAt == null) return 0;
  return Math.max(0, worldDay - f.plantedAt);
}
function blankJobs(f) {
  const jobs = {};
  const def = f ? cropOf(f) : null;
  if (def) for (const j of def.jobs) jobs[j.id] = 0;
  return jobs;
}
function ensureJobs(f) {
  if (!f.jobS) f.jobS = blankJobs(f);
  const def = cropOf(f);
  if (!def) return;
  for (const j of def.jobs) if (f.jobS[j.id] == null) f.jobS[j.id] = 0;
}
function jobDone(f, id) {
  return (f?.jobS?.[id] || 0) >= L.LANES - 1e-3;
}
function plantJob(f) {
  return cropOf(f)?.jobs.find(j => j.plant) || null;
}
function plantJobDone(f) {
  const job = plantJob(f);
  if (!job) return true;
  return jobDone(f, job.id);
}
// 作业前沿只跟着真正在走的那一趟。灌溉和水网不算，免得整块被涂成已收。
function visualFront(f) {
  if (f.plantedAt == null) return 0;
  const def = cropOf(f);
  if (!def) return 0;
  ensureJobs(f);
  const day = fieldDay(f);
  let front = 0;
  for (const job of def.jobs) {
    if (job.auto || job.spray || job.drone) continue;
    if (job.afterHarvest) {
      if (!f.harvested) break;
    } else if (day < job.from) break;
    const prog = f.jobS[job.id] || 0;
    if (prog < L.LANES - 1e-3) return prog;
    front = prog;
  }
  return front;
}
function stageBlend(def, day) {
  const row = def.stages.find(s => day < s.to) || def.stages[def.stages.length - 1];
  const st = def.stages.indexOf(row) + 1;
  if (!row || row.to <= row.from || day >= def.rotAt) return day >= def.rotAt ? 8 : st;
  const frac = Math.min(0.999, Math.max(0, (day - row.from) / (row.to - row.from)));
  return st + frac;
}
export function fieldVisual(f) {
  const id = f && f.crop >= 0 ? CROPS[f.crop]?.id : null;
  const potato = id === 'potato';
  if (f?.failed === 'rot') {
    return { crop: f.crop, g: potato ? 8.05 : 0, s: 0, dir: f.dir };
  }
  const def = cropOf(f);
  if (f && f.live && !f.paid && def) {
    if (f.plantedAt == null) return { crop: f.crop, g: 0, s: 0, dir: f.dir };
    // 播种或移栽没走完：整块保持裸土。机器走过的垄仍由 s 画出来。
    if (!plantJobDone(f)) return { crop: f.crop, g: potato ? 1 : 0, s: visualFront(f), dir: f.dir };
    const day = fieldDay(f);
    if (potato) return { crop: f.crop, g: stageBlend(def, day), s: visualFront(f), dir: f.dir };
    const g = Math.min(0.95, def.maturity > 0 ? day / def.maturity : 0.5);
    return { crop: f.crop, g, s: visualFront(f), dir: f.dir };
  }
  return { crop: f.crop, g: f.state === 0 ? 0 : f.g, s: (f.state === 3 || f.state === 4) ? f.s : 0, dir: f.dir };
}
export function cropWatch(f) {
  const def = cropOf(f);
  if (f?.failed === 'rot') {
    const days = def?.rotAt || POTATO_ROT_AT;
    return { day: days, phase: 'rot', label: '烂在地里', front: 0, days, waiting: false, failed: true };
  }
  if (!f?.live || f.paid || !def) return null;
  const days = def.rotAt;
  if (f.plantedAt == null) return { day: 0, phase: 'plan', label: '待播种', front: 0, days, waiting: true };
  const day = fieldDay(f);
  let phase = 'rot';
  if (day < def.rotAt) {
    const row = def.stages.find(s => day < s.to);
    phase = row ? row.id : 'rot';
  }
  return { day, phase, label: PHASE_LABEL[phase] || phase, front: visualFront(f), days, waiting: false, planted: plantJobDone(f) };
}
// 农时。这一站没有季节，播种窗口始终开着。以后接到地球历，在这里按日拦住。
export function seasonAllowsSow(_field, _day = worldDay) {
  return true;
}
// 中耕弃作、改土这一季没做。
export function fieldOps() {
  return { cultivate: false, amend: false, note: '中耕弃作和改土还没接上' };
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
// 偶数行朝 +u，奇数行朝 −u。车头是模型的 +X，ang 0 朝世界 +X。
function laneForward(f, dirp) {
  const along = dirp ? 0 : Math.PI;
  return f.dir === 0 ? along : (dirp ? Math.PI / 2 : -Math.PI / 2);
}
function workPose(f, lane, u) {
  const [x, z] = toWorld(f, u, laneV(lane));
  return { x, z, ang: laneForward(f, lane % 2 === 0) };
}
// 地头 U 形：从这一行的尽头绕到下一行，车头跟着弯道，结束时正对下一行。a 为 0–1。
function headlandSample(f, lane, a) {
  const dirp = lane % 2 === 0;
  const radius = L.LANE / 2;
  const sweep = Math.min(1, Math.max(0, a)) * Math.PI;
  const bulge = dirp ? 1 : -1;
  const u0 = dirp ? L.FIELD : 0;
  const v0 = laneV(lane);
  const cv = v0 + radius;
  const u = u0 + bulge * Math.sin(sweep) * radius;
  const v = cv - Math.cos(sweep) * radius;
  const [x, z] = toWorld(f, u, v);
  let heading;
  if (a >= 1 - 1e-6) heading = laneForward(f, !dirp);
  else if (a <= 1e-6) heading = laneForward(f, dirp);
  else {
    const du = bulge * Math.cos(sweep) * radius;
    const dv = Math.sin(sweep) * radius;
    const dx = f.dir === 0 ? du : dv;
    const dz = f.dir === 0 ? dv : du;
    heading = Math.atan2(dz, dx);
  }
  return { x, z, ang: heading };
}
const potatoLive = [];
function syncPotatoLive() {
  potatoLive.length = 0;
  for (const f of fields) if (f.live && !f.paid && cropOf(f)) potatoLive.push(f);
}
function trackPotato(f) { if (!potatoLive.includes(f)) potatoLive.push(f); }
function dropPotato(f) {
  const i = potatoLive.indexOf(f);
  if (i >= 0) potatoLive.splice(i, 1);
}
function jobOpen(f, job) {
  if (!f?.live || f.paid || f.failed === 'rot' || !job) return false;
  ensureJobs(f);
  if (jobDone(f, job.id)) return false;
  if (job.afterHarvest) return !!f.harvested;
  // 整地从第 0 日开始，钟还没走也能派出去。钟一旦记上，窗口结束就关掉，不能一直占到成熟待收。
  if (job.from <= 0 && f.plantedAt == null) return true;
  if (f.plantedAt == null) return false;
  const day = fieldDay(f);
  return day >= job.from && day < job.to;
}
function rankBetter(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}
function fieldBusy(f, self) {
  for (const r of rigs) {
    if (r === self || r.f !== f) continue;
    if (r.intent === 'unload' || r.intent === 'deliver') continue;
    if (r.mode === 'work' || r.mode === 'turn' || r.mode === 'travel' || r.mode === 'need_unload' || r.mode === 'unload') return true;
  }
  return false;
}
function pickAssignment(r) {
  if (!rigProfile(r.kind)) return null;
  let best = null;
  let bestKey = null;
  for (const f of potatoLive) {
    if (fieldBusy(f, r)) continue;
    const def = cropOf(f);
    if (!def) continue;
    for (const job of def.jobs) {
      if (!jobOpen(f, job) || !rigCan(r.kind, job)) continue;
      if (job.spray && f.boomBusy) continue;
      const plan = hitchPlan(r.kind, r.hitch, job);
      if (!plan) continue;
      const key = [
        r.f === f ? 0 : 1,
        f.plantedAt == null ? 1 : 0,
        f.plantedAt == null ? (f.planSeq || f.idx) : f.plantedAt,
        job.from,
        job.required ? 0 : 1,
        job.order,
        f.idx,
        plan.swap || (job.load && r.load !== job.load) ? 1 : 0,
        Math.hypot((f.x0 + L.FIELD / 2) - r.x, (f.z0 + L.FIELD / 2) - r.z),
      ];
      if (!best || rankBetter(key, bestKey)) { best = { f, job }; bestKey = key; }
    }
  }
  return best;
}
function bootRig(r) {
  const profile = rigProfile(r.kind);
  r.hitch = profile?.defaultHitch || null;
  r.load = profile?.defaultLoad || null;
  r.modeParam = profile?.defaultMode || null;
  r.tank = null;
  r.pending = null;
  r.serviceT = 0;
  r.switchT = 0;
}
function parkRig(r, refill = false) {
  r.busy = false; r.f = null; r.intent = null; r.route = null; r.ri = 0; r.partner = null;
  r.x = r.parkX; r.z = r.parkZ; r.ang = -Math.PI / 2;
  if (refill || r.charge == null) r.charge = 1;
  if (refill) bootRig(r);
  r.mode = r.charge < 1 ? 'charge' : 'park';
}
function workTarget(f, jobId) {
  ensureJobs(f);
  const s = Math.min(Math.max(f.jobS[jobId] || 0, 0), L.LANES - 1e-4);
  const lane = Math.floor(s);
  const frac = s - lane;
  const dirp = lane % 2 === 0;
  const u = dirp ? frac * L.FIELD : (1 - frac) * L.FIELD;
  return workPose(f, lane, u);
}
function beginJob(r, f, job) {
  const def = cropOf(f);
  job = job || def?.jobs.find(j => j.id === r.job);
  if (!f || !job) { goHome(r); return; }
  ensureJobs(f);
  r.job = job.id;
  if (f.plantedAt == null) f.plantedAt = worldDay;
  const s = Math.min(Math.max(f.jobS[job.id] || 0, 0), L.LANES - 1e-4);
  const lane = Math.floor(s);
  const frac = s - lane;
  const dirp = lane % 2 === 0;
  r.f = f; r.busy = true; r.mode = 'work'; r.intent = 'job'; r.lane = lane;
  r.u = dirp ? frac * L.FIELD : (1 - frac) * L.FIELD;
  const pose = workPose(f, lane, r.u);
  r.x = pose.x; r.z = pose.z; r.ang = pose.ang;
  r.route = null; r.ri = 0;
}
function roadRoute(x, z, ex, ez) {
  const sx = nearestRoad(x), sz = nearestRoad(z);
  const startVert = Math.abs(sx - x) <= Math.abs(sz - z);
  const exr = nearestRoad(ex), ezr = nearestRoad(ez);
  const endVert = Math.abs(exr - ex) <= Math.abs(ezr - ez);
  const ax = startVert ? sx : x;
  const az = startVert ? z : sz;
  const bx = endVert ? exr : ex;
  const bz = endVert ? ez : ezr;
  const pts = [];
  if (Math.hypot(ax - x, az - z) > 1.2) pts.push([ax, az]);
  for (const c of manhattan(ax, az, startVert, bx, bz, endVert)) pts.push(c);
  if (Math.hypot((pts.length ? pts[pts.length - 1][0] : bx) - ex, (pts.length ? pts[pts.length - 1][1] : bz) - ez) > 1.2) pts.push([ex, ez]);
  const out = [];
  let px = x, pz = z;
  for (const p of pts) {
    if (Math.hypot(p[0] - px, p[1] - pz) < 1.2) continue;
    out.push(p);
    px = p[0]; pz = p[1];
  }
  if (!out.length) out.push([ex, ez]);
  return out;
}
function shiftRoute(r, pts) {
  const bias = ((r.id % 5) - 2) * 1.15;
  if (!pts || pts.length < 2 || Math.abs(bias) < 0.1) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === pts.length - 1) { out.push(pts[i]); continue; }
    const nxt = pts[Math.min(i + 1, pts.length - 1)];
    const dx = nxt[0] - pts[i][0], dz = nxt[1] - pts[i][1];
    const len = Math.hypot(dx, dz) || 1;
    out.push([pts[i][0] + (-dz / len) * bias, pts[i][1] + (dx / len) * bias]);
  }
  return out;
}
function routeTo(r, ex, ez, intent, f) {
  r.intent = intent;
  r.f = f || null;
  r.busy = true;
  r.mode = 'travel';
  const dist = Math.hypot(r.x - ex, r.z - ez);
  const route = dist < 36 ? [[ex, ez]] : roadRoute(r.x, r.z, ex, ez);
  r.route = shiftRoute(r, route);
  r.ri = 0;
}
function routeToJob(r, f, job) {
  r.job = job.id;
  const pose = workTarget(f, job.id);
  routeTo(r, pose.x, pose.z, 'job', f);
}
function dispatchJob(r, f, job) {
  const plan = hitchPlan(r.kind, r.hitch, job);
  if (!plan) return false;
  const reload = !!(job.load && r.load !== job.load);
  const tankBlock = !!(job.tank && r.tank && r.tank !== job.tank && (r.bin || 0) > 0);
  if (tankBlock) {
    enterNeedUnload(r);
    return true;
  }
  if (plan.swap || reload) {
    r.pending = { f, job: job.id, hitch: plan.hitch, load: job.load || r.load || null, mode: job.mode || null, tank: job.tank || null };
    r.job = job.id;
    r.serviceKind = plan.swap ? 'hitch' : 'reload';
    routeTo(r, r.parkX, r.parkZ, 'service', f);
    return true;
  }
  if (job.tank) r.tank = job.tank;
  routeToJob(r, f, job);
  return true;
}
function dispatchUnload(r, waiting) {
  if (r.hitch !== 'impl_trailer') {
    r.pending = { f: waiting.f, job: null, hitch: 'impl_trailer', load: r.load || null, mode: null, tank: null, unload: waiting.id };
    r.partner = waiting.id;
    r.serviceKind = 'hitch';
    r.job = null;
    routeTo(r, r.parkX, r.parkZ, 'service', waiting.f);
    return;
  }
  r.partner = waiting.id;
  const p = sidePoint(waiting);
  routeTo(r, p.x, p.z, 'unload', waiting.f);
}
function considerUnload(r) {
  if (!rigHas(r.kind, 'impl_trailer')) return false;
  const waiting = waitingHarvester();
  if (!waiting || waiting === r) return false;
  dispatchUnload(r, waiting);
  return true;
}
function afterWork(r) {
  if (considerUnload(r)) return;
  if ((r.charge ?? 1) <= 0) { goHome(r); return; }
  const nxt = pickAssignment(r);
  if (!nxt) { goHome(r); return; }
  dispatchJob(r, nxt.f, nxt.job);
}
function goHome(r) {
  const dist = Math.hypot(r.x - r.parkX, r.z - r.parkZ);
  if (dist < 1.5) { parkRig(r, false); return; }
  routeTo(r, r.parkX, r.parkZ, 'home', null);
}
function useCharge(r, meters) {
  r.charge = Math.max(0, (r.charge ?? 1) - meters / BATT_RANGE);
  return r.intent !== 'home' && r.intent !== 'deliver' && r.charge <= 0;
}
function atGarage(r) {
  return Math.hypot(r.x - r.parkX, r.z - r.parkZ) < 2;
}
function sidePoint(h) {
  const side = h.ang + Math.PI / 2;
  return { x: h.x + Math.cos(side) * 7, z: h.z + Math.sin(side) * 7 };
}
function waitingHarvester() {
  return rigs.find(h => h.mode === 'need_unload' && !rigs.some(t => t.partner === h.id && (t.mode === 'unload' || t.intent === 'unload')));
}
function deliverTrailer(r) {
  routeTo(r, r.parkX, r.parkZ, 'deliver', null);
}
function assignIdleRigs() {
  for (const r of rigs) {
    if (r.mode === 'work' || r.mode === 'turn' || r.mode === 'travel' || r.mode === 'need_unload' || r.mode === 'unload' || r.mode === 'service' || r.mode === 'switch') continue;
    const home = atGarage(r);
    if (home && (r.charge ?? 1) < BATT_LEAVE) {
      r.mode = 'charge'; r.busy = false; r.f = null; r.intent = null;
      continue;
    }
    if (rigHas(r.kind, 'impl_trailer') && (r.cargo || 0) >= TRAILER_CARGO_CAP) {
      deliverTrailer(r);
      continue;
    }
    if (considerUnload(r)) continue;
    const next = pickAssignment(r);
    if (!next) {
      if (!home) goHome(r);
      else r.mode = (r.charge ?? 1) < 1 ? 'charge' : 'park';
      continue;
    }
    dispatchJob(r, next.f, next.job);
  }
}
function enterNeedUnload(r) {
  r.mode = 'need_unload';
  r.busy = true;
  r.intent = 'unload_wait';
  r.route = null;
}
function resumeHarvest(r) {
  r.bin = 0;
  r.partner = null;
  const f = r.f;
  const key = r.job;
  if (!f || !key || !f.live) { goHome(r); return; }
  if (jobDone(f, key)) {
    storeHarvest(f);
    maybeRelease(f);
    if (!f.live) { goHome(r); return; }
    afterWork(r);
    return;
  }
  const s = f.jobS[key] || 0;
  const lane = Math.min(L.LANES - 1, Math.floor(s + 1e-6));
  const dirp = lane % 2 === 0;
  r.lane = lane;
  r.u = dirp ? 0 : L.FIELD;
  r.mode = 'work';
  r.intent = 'job';
  r.busy = true;
  const pose = workPose(f, lane, r.u);
  r.x = pose.x; r.z = pose.z; r.ang = pose.ang;
}
function finishPass(r) {
  const f = r.f;
  const key = r.job;
  const job = f && key ? cropOf(f)?.jobs.find(j => j.id === key) : null;
  if (f?.jobS && key) f.jobS[key] = L.LANES;
  if (job?.spray && f && !f.sprayed) {
    f.sprayed = true;
    if (stores.spray > 0) stores.spray -= 1;
  }
  if (job?.harvest) {
    if ((r.bin || 0) > 0 && !UNLOAD_WHILE_MOVING) { enterNeedUnload(r); return; }
    storeHarvest(f);
    maybeRelease(f);
  }
  if (job?.afterHarvest) releaseField(f);
  if (!f?.live) { goHome(r); return; }
  afterWork(r);
}
function assignmentLegal(r) {
  const f = r.f;
  const job = f && r.job ? cropOf(f)?.jobs.find(j => j.id === r.job) : null;
  if (!job) return false;
  return jobOpen(f, job) && rigCan(r.kind, job);
}
// 已经出门的机器也要重新核对。窗口关掉、或者这台机器根本没有这项能力，就停下，不能把培土机留在成熟待收的田里。
function releaseIllegal(r) {
  if (r.intent === 'home' || r.intent === 'unload' || r.intent === 'deliver' || r.intent === 'service') return false;
  if (assignmentLegal(r)) return false;
  r.job = null;
  afterWork(r);
  return true;
}
function stepWork(r, dt) {
  if (releaseIllegal(r)) return;
  const f = r.f;
  const key = r.job;
  if (!f || !key || !f.live || f.paid) { goHome(r); return; }
  if ((r.charge ?? 1) <= 0) { goHome(r); return; }
  ensureJobs(f);
  const job = cropOf(f)?.jobs.find(j => j.id === key);
  const pace = hitchPlan(r.kind, r.hitch, job)?.speed || 1;
  let rem = MACHINE_MPS * pace * dt;
  const dirp = r.lane % 2 === 0;
  const dest = dirp ? L.FIELD : 0;
  const room = Math.abs(dest - r.u);
  const leg = Math.min(rem, room);
  const write = () => {
    f.jobS[key] = r.lane + (dirp ? r.u / L.FIELD : (L.FIELD - r.u) / L.FIELD);
    const pose = workPose(f, r.lane, r.u);
    r.x = pose.x; r.z = pose.z; r.ang = pose.ang;
  };
  if (useCharge(r, leg)) {
    r.u += (dirp ? 1 : -1) * leg;
    write();
    goHome(r);
    return;
  }
  if (rem < room - 1e-8) {
    r.u += (dirp ? 1 : -1) * rem;
    write();
    return;
  }
  r.u = dest;
  f.jobS[key] = r.lane + 1;
  rem -= room;
  if (job?.harvest && !UNLOAD_WHILE_MOVING) {
    r.bin = (r.bin || 0) + 1;
    if (r.bin >= BIN_LANES || r.lane + 1 >= L.LANES) {
      enterNeedUnload(r);
      return;
    }
  }
  if (r.lane + 1 >= L.LANES) {
    finishPass(r);
    if (r.mode === 'travel' && rem > 0) stepTravel(r, rem / MACHINE_MPS);
    return;
  }
  r.mode = 'turn'; r.turnDist = 0; r.turnLen = Math.PI * (L.LANE / 2);
  const pose = headlandSample(f, r.lane, 0);
  r.x = pose.x; r.z = pose.z; r.ang = pose.ang;
  if (rem > 0) stepTurn(r, rem / MACHINE_MPS);
}
function stepTurn(r, dt) {
  if (releaseIllegal(r)) return;
  const f = r.f;
  const key = r.job;
  if (!f || !key || !f.live || f.paid) { goHome(r); return; }
  if ((r.charge ?? 1) <= 0) { goHome(r); return; }
  let rem = MACHINE_MPS * dt;
  const left = r.turnLen - r.turnDist;
  const leg = Math.min(rem, Math.max(0, left));
  if (useCharge(r, leg)) { goHome(r); return; }
  if (rem < left - 1e-8) {
    r.turnDist += rem;
    const pose = headlandSample(f, r.lane, r.turnDist / r.turnLen);
    r.x = pose.x; r.z = pose.z; r.ang = pose.ang;
    return;
  }
  rem -= Math.max(0, left);
  r.lane += 1;
  const dirp = r.lane % 2 === 0;
  r.u = dirp ? 0 : L.FIELD;
  r.mode = 'work';
  f.jobS[key] = r.lane;
  const pose = workPose(f, r.lane, r.u);
  r.x = pose.x; r.z = pose.z; r.ang = pose.ang;
  if (rem > 0) stepWork(r, rem / MACHINE_MPS);
}
function crowded(r) {
  for (const o of rigs) {
    if (o === r || o.id > r.id) continue;
    if (o.mode !== 'travel' && o.mode !== 'turn' && o.mode !== 'work') continue;
    if (Math.hypot(o.x - r.x, o.z - r.z) < 1.6) return true;
  }
  return false;
}
function arriveTravel(r) {
  if (r.intent === 'home') { parkRig(r, false); return; }
  if (r.intent === 'deliver') { r.cargo = 0; parkRig(r, false); return; }
  if (r.intent === 'service') {
    const pending = r.pending || {};
    const swap = !!(pending.hitch && pending.hitch !== r.hitch);
    const reload = !!(pending.load && pending.load !== r.load);
    r.mode = 'service';
    r.serviceT = (swap ? HITCH_SWAP_S : 0) + (reload ? RELOAD_S : 0);
    if (r.serviceT <= 0) r.serviceT = HITCH_SWAP_S;
    r.x = r.parkX; r.z = r.parkZ; r.ang = -Math.PI / 2;
    r.busy = true;
    r.route = null;
    return;
  }
  if (r.intent === 'unload') {
    const h = rigs.find(x => x.id === r.partner);
    if (!h || h.mode !== 'need_unload') { r.partner = null; goHome(r); return; }
    r.mode = 'unload';
    r.unloadT = UNLOAD_SECONDS;
    r.ang = h.ang;
    h.mode = 'unload';
    h.unloadT = UNLOAD_SECONDS;
    h.partner = r.id;
    return;
  }
  const job = r.f && cropOf(r.f)?.jobs.find(j => j.id === r.job);
  if (job?.mode && hitchHasModes(r.hitch) && r.modeParam !== job.mode) {
    r.mode = 'switch';
    r.switchT = MODE_SWITCH_S;
    r.busy = true;
    return;
  }
  if (job?.tank) r.tank = job.tank;
  beginJob(r, r.f);
}
function stepService(r, dt) {
  r.serviceT = (r.serviceT || 0) - dt;
  r.x = r.parkX; r.z = r.parkZ; r.ang = -Math.PI / 2;
  if (r.serviceT > 0) return;
  const pending = r.pending;
  if (pending?.hitch) r.hitch = pending.hitch;
  if (pending?.load) r.load = pending.load;
  if (pending?.mode && hitchHasModes(r.hitch)) r.modeParam = pending.mode;
  if (pending?.tank) r.tank = pending.tank;
  r.pending = null;
  r.mode = 'park';
  r.busy = false;
  r.intent = null;
  r.route = null;
  r.job = null;
  r.f = null;
  r.partner = null;
}
function stepSwitch(r, dt) {
  if (releaseIllegal(r)) return;
  r.switchT = (r.switchT || 0) - dt;
  if (r.switchT > 0) return;
  const job = r.f && cropOf(r.f)?.jobs.find(j => j.id === r.job);
  if (job?.mode) r.modeParam = job.mode;
  beginJob(r, r.f);
}
function stepTravel(r, dt) {
  if (crowded(r)) return;
  if (r.intent === 'job' && !assignmentLegal(r)) {
    r.job = null;
    const nxt = (r.charge ?? 1) > 0 ? pickAssignment(r) : null;
    if (!nxt) { goHome(r); return; }
    routeToJob(r, nxt.f, nxt.job);
    return;
  }
  if ((r.charge ?? 1) <= 0 && r.intent !== 'home' && r.intent !== 'deliver') { goHome(r); return; }
  if (!r.route || r.ri >= r.route.length) { arriveTravel(r); return; }
  const [tx, tz] = r.route[r.ri];
  const dx = tx - r.x, dz = tz - r.z;
  const dist = Math.hypot(dx, dz);
  const step = MACHINE_MPS * dt;
  const leg = Math.min(step, dist);
  if (useCharge(r, leg)) {
    if (dist > 1e-6) {
      r.x += dx / dist * leg; r.z += dz / dist * leg; r.ang = Math.atan2(dz, dx);
    }
    goHome(r);
    return;
  }
  if (dist < 1.1 || step >= dist - 1e-6) {
    r.x = tx; r.z = tz; r.ri++;
    const extra = step > dist ? (step - dist) / MACHINE_MPS : 0;
    if (r.ri >= r.route.length) {
      arriveTravel(r);
      if (extra > 0 && r.mode === 'work') stepWork(r, extra);
      return;
    }
    if (extra > 0) stepTravel(r, extra);
    return;
  }
  r.x += dx / dist * step; r.z += dz / dist * step; r.ang = Math.atan2(dz, dx);
}
function stepUnload(r, dt) {
  if (r.unloadT == null) return;
  r.unloadT -= dt;
  if (r.unloadT > 0) return;
  if (!rigHas(r.kind, 'impl_trailer')) return;
  const h = rigs.find(x => x.id === r.partner);
  r.cargo = (r.cargo || 0) + 1;
  r.partner = null;
  r.unloadT = 0;
  log.push({ type: 'unload', pay: 0, name: '侧卸', i: h?.f?.i ?? null, j: h?.f?.j ?? null, t: worldDay });
  if (h) resumeHarvest(h);
  if (r.cargo >= TRAILER_CARGO_CAP) deliverTrailer(r);
  else {
    const more = waitingHarvester();
    if (more) {
      r.partner = more.id;
      const p = sidePoint(more);
      routeTo(r, p.x, p.z, 'unload', more.f);
    } else goHome(r);
  }
}
let boom = null;
function stepBoom(dt) {
  for (const f of potatoLive) if (!boom || f !== boom.f) f.boomBusy = false;
  if (boom) {
    const still = boom.f.live && jobOpen(boom.f, boom.job);
    if (!still) { boom.f.boomBusy = false; boom = null; }
    else if (fieldBusy(boom.f, null)) { boom.f.boomBusy = false; return; }
  }
  if (!boom) {
    for (const f of potatoLive) {
      if (fieldBusy(f, null)) continue;
      const job = cropOf(f)?.jobs.find(j => j.spray && jobOpen(f, j) && !rigs.some(r => r.f === f && r.job === j.id && (r.mode === 'work' || r.mode === 'turn' || r.mode === 'travel')));
      if (job) { boom = { f, job }; break; }
    }
  }
  if (!boom) return;
  boom.f.boomBusy = true;
  const key = boom.job.id;
  boom.f.jobS[key] = Math.min(L.LANES, (boom.f.jobS[key] || 0) + (MACHINE_MPS * dt) / L.FIELD);
  if (boom.f.jobS[key] >= L.LANES - 1e-3) {
    boom.f.jobS[key] = L.LANES;
    boom.f.boomBusy = false;
    if (!boom.f.sprayed) {
      boom.f.sprayed = true;
      if (stores.spray > 0) stores.spray -= 1;
    }
    boom = null;
  }
}
export function boomWatch() {
  if (!boom?.f) return null;
  const key = boom.job?.id;
  const s = key ? (boom.f.jobS?.[key] || 0) : 0;
  const lane = Math.min(L.LANES - 1, Math.max(0, Math.floor(s)));
  const frac = Math.max(0, s - lane);
  const pose = workPose(boom.f, lane, frac * L.FIELD);
  return { x: pose.x, z: pose.z, ang: pose.ang, f: boom.f };
}
const DRONE_MARKS = [[-2.15, 0.45], [2.15, 0.45], [-2.15, 1.55], [2.15, 1.55], [0, 1.55], [0, 0.45], [-3.2, 0.45], [3.2, 0.45]];
function canonDroneKind(kind) {
  return kind === 'drone_spray' ? 'drone_treat' : kind;
}
function dronePad(d) {
  const base = droneBase();
  const i = Math.max(0, workDrones.indexOf(d));
  if (!base) return { x: d.homeX ?? d.x, z: d.homeZ ?? d.z };
  const [ox, oz] = DRONE_MARKS[i % DRONE_MARKS.length];
  const ang = base.ang || 0;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: base.x + ox * c - oz * s, z: base.z + ox * s + oz * c };
}
function parkDrone(d) {
  const pad = dronePad(d);
  d.homeX = pad.x; d.homeZ = pad.z;
  d.x = pad.x; d.z = pad.z; d.y = DRONE_PARK_Y; d.ang = d.kind === 'drone_treat' ? -0.35 : 0.4;
  d.mode = 'park'; d.busy = false; d.f = null; d.job = null; d.intent = null;
}
export function buyDrone(kind) {
  const item = DRONE_SHOP.find(s => s.id === kind);
  if (!item) return { ok: false, reason: 'kind' };
  if (!droneBase()) return { ok: false, reason: 'base' };
  if (workDrones.length >= 8) return { ok: false, reason: 'full' };
  if (!(economy.revenue >= item.price)) return { ok: false, reason: 'money', cost: item.price };
  economy.revenue -= item.price;
  const d = {
    id: nextDroneId++, kind, label: item.name, logicId: kind,
    load: kind === 'drone_treat' ? 'pest' : null,
    mode: 'park', busy: false, f: null, job: null, intent: null,
    lane: 0, u: 0, x: 0, y: DRONE_PARK_Y, z: 0, ang: 0, charge: 1,
  };
  workDrones.push(d);
  parkDrone(d);
  return { ok: true, cost: item.price, name: item.name, drone: d };
}
function restoreWorkDrones(list) {
  workDrones.length = 0;
  nextDroneId = 1;
  if (!Array.isArray(list)) return;
  for (const item of list) {
    const kind = canonDroneKind(item?.kind);
    if (!DRONE_SHOP.some(s => s.id === kind)) continue;
    const spec = DRONE_SHOP.find(s => s.id === kind);
    const d = {
      id: nextDroneId++, kind: spec.id, label: spec.name, logicId: spec.id,
      load: spec.id === 'drone_treat' ? 'pest' : null,
      mode: 'park', busy: false, f: null, job: null, intent: null,
      lane: 0, u: 0, x: 0, y: DRONE_PARK_Y, z: 0, ang: 0, charge: 1,
    };
    workDrones.push(d);
    parkDrone(d);
  }
}
function droneFieldBusy(f, self) {
  return workDrones.some(o => o !== self && o.f === f && (o.mode === 'work' || o.mode === 'travel' || o.mode === 'reload'));
}
function pickDroneAssignment(d) {
  let best = null;
  let bestKey = null;
  for (const f of potatoLive) {
    if (droneFieldBusy(f, d)) continue;
    const def = cropOf(f);
    if (!def) continue;
    for (const job of def.jobs) {
      if (!job.drone || !jobOpen(f, job) || !droneCan(d.kind, job)) continue;
      const key = [d.f === f ? 0 : 1, job.order, f.idx];
      if (!best || rankBetter(key, bestKey)) { best = { f, job }; bestKey = key; }
    }
  }
  return best;
}
function launchDrone(d, f, job) {
  d.f = f;
  d.job = job.id;
  d.busy = true;
  d.mode = 'travel';
  if (job.load && d.load !== job.load) {
    d.intent = 'reload';
    d.pendingLoad = job.load;
    return;
  }
  d.intent = 'job';
  const pose = workTarget(f, job.id);
  d.tx = pose.x; d.tz = pose.z;
}
function stepDroneFly(d, dt, x, z) {
  const dx = x - d.x, dz = z - d.z;
  const dist = Math.hypot(dx, dz);
  const leg = DRONE_MPS * dt;
  d.y = dist < 4 && (d.intent === 'reload' || d.intent === 'home') ? DRONE_PARK_Y : DRONE_CRUISE_Y;
  if (dist < 1.4 || leg >= dist - 1e-6) {
    d.x = x; d.z = z;
    if (dist > 0.2) d.ang = Math.atan2(dz, dx);
    return true;
  }
  d.x += dx / dist * leg;
  d.z += dz / dist * leg;
  d.ang = Math.atan2(dz, dx);
  return false;
}
function beginDronePass(d) {
  const f = d.f;
  const job = f && cropOf(f)?.jobs.find(j => j.id === d.job);
  if (!f || !job || !jobOpen(f, job)) { d.intent = 'home'; d.mode = 'travel'; return; }
  const s = Math.min(Math.max(f.jobS[job.id] || 0, 0), L.LANES - 1e-4);
  d.lane = Math.floor(s);
  const frac = s - d.lane;
  const dirp = d.lane % 2 === 0;
  d.u = dirp ? frac * L.FIELD : (1 - frac) * L.FIELD;
  d.mode = 'work';
  d.intent = 'job';
  const pose = workPose(f, d.lane, d.u);
  d.x = pose.x; d.z = pose.z; d.ang = pose.ang; d.y = DRONE_WORK_Y;
}
// 田块是齐的模块，机具幅宽盖得住，不做地边地角补喷。
function stepDroneWork(d, dt) {
  const f = d.f;
  const key = d.job;
  const job = f && cropOf(f)?.jobs.find(j => j.id === key);
  if (!f || !job || !jobOpen(f, job)) { d.mode = 'travel'; d.intent = 'home'; return; }
  ensureJobs(f);
  const dirp = d.lane % 2 === 0;
  const dest = dirp ? L.FIELD : 0;
  const room = Math.abs(dest - d.u);
  const leg = Math.min(DRONE_MPS * dt, room);
  d.u += (dirp ? 1 : -1) * leg;
  const pose = workPose(f, d.lane, d.u);
  d.x = pose.x; d.z = pose.z; d.ang = pose.ang; d.y = DRONE_WORK_Y;
  f.jobS[key] = d.lane + (dirp ? d.u / L.FIELD : (L.FIELD - d.u) / L.FIELD);
  if (leg < room - 1e-6) return;
  f.jobS[key] = d.lane + 1;
  if (d.lane + 1 >= L.LANES) {
    f.jobS[key] = L.LANES;
    d.mode = 'travel';
    d.intent = 'home';
    return;
  }
  d.lane += 1;
  d.u = d.lane % 2 === 0 ? 0 : L.FIELD;
  const next = workPose(f, d.lane, d.u);
  d.x = next.x; d.z = next.z; d.ang = next.ang;
}
function stepWorkDrones(dt) {
  if (!droneBase()) {
    for (const d of workDrones) if (d.mode !== 'park') parkDrone(d);
    return;
  }
  for (const d of workDrones) {
    if (d.mode !== 'park') continue;
    const next = pickDroneAssignment(d);
    if (next) launchDrone(d, next.f, next.job);
  }
  for (const d of workDrones) {
    if (d.mode === 'reload') {
      d.serviceT -= dt;
      d.y = DRONE_PARK_Y;
      const pad = dronePad(d);
      d.x = pad.x; d.z = pad.z;
      if (d.serviceT > 0) continue;
      if (d.pendingLoad) d.load = d.pendingLoad;
      d.mode = 'travel';
      d.intent = 'job';
      const pose = d.f && d.job ? workTarget(d.f, d.job) : null;
      if (!pose) { d.intent = 'home'; continue; }
      d.tx = pose.x; d.tz = pose.z;
    } else if (d.mode === 'travel') {
      if (d.intent === 'job' && d.tx == null && d.f && d.job) {
        const pose = workTarget(d.f, d.job);
        d.tx = pose.x; d.tz = pose.z;
      }
      const pad = dronePad(d);
      const dest = d.intent === 'job' ? { x: d.tx, z: d.tz } : pad;
      if (!stepDroneFly(d, dt, dest.x, dest.z)) continue;
      if (d.intent === 'reload') { d.mode = 'reload'; d.serviceT = RELOAD_S; continue; }
      if (d.intent === 'home') {
        const nxt = pickDroneAssignment(d);
        if (nxt && (!nxt.job.load || d.load === nxt.job.load)) launchDrone(d, nxt.f, nxt.job);
        else parkDrone(d);
        continue;
      }
      beginDronePass(d);
    } else if (d.mode === 'work') stepDroneWork(d, dt);
  }
}
function stepRigs(dt) {
  for (const r of rigs) {
    if ((r.mode === 'work' || r.mode === 'turn') && r.f && (!r.f.live || r.f.paid)) goHome(r);
    if ((r.mode === 'park' || r.mode === 'charge') && atGarage(r) && (r.charge ?? 1) < 1) {
      r.charge = Math.min(1, (r.charge ?? 1) + dt / RECHARGE_S);
      r.mode = r.charge >= 1 ? 'park' : 'charge';
      r.x = r.parkX; r.z = r.parkZ; r.ang = -Math.PI / 2;
    }
  }
  assignIdleRigs();
  for (const r of rigs) {
    if (r.mode === 'work') stepWork(r, dt);
    else if (r.mode === 'turn') stepTurn(r, dt);
    else if (r.mode === 'travel') stepTravel(r, dt);
    else if (r.mode === 'service') stepService(r, dt);
    else if (r.mode === 'switch') stepSwitch(r, dt);
    else if (r.mode === 'unload' && rigHas(r.kind, 'impl_trailer')) stepUnload(r, dt);
  }
  stepBoom(dt);
  stepWorkDrones(dt);
}
function settlePotatoCalendar() {
  for (let i = potatoLive.length - 1; i >= 0; i--) {
    const f = potatoLive[i];
    if (!f.live || f.paid) { potatoLive.splice(i, 1); continue; }
    const def = cropOf(f);
    if (!def || f.plantedAt == null) continue;
    ensureJobs(f);
    if (!f.penalized) f.penalized = {};
    if (f.yieldFactor == null) f.yieldFactor = 1;
    const day = fieldDay(f);
    for (const job of def.jobs) {
      if (job.auto && day >= job.from) f.jobS[job.id] = L.LANES;
    }
    for (const job of def.jobs) {
      if (!job.required || job.auto || f.penalized[job.id]) continue;
      const due = job.afterHarvest ? (f.harvested && day >= job.to) : day >= job.to;
      if (!due) continue;
      f.penalized[job.id] = true;
      if (!jobDone(f, job.id)) f.yieldFactor = Math.max(0, f.yieldFactor - (job.penalty || JOB_PENALTY));
    }
    if (!f.queued) f.queued = {};
    for (const job of def.jobs) {
    if (job.auto || job.spray || !jobOpen(f, job) || f.queued[job.id]) continue;
    const covered = job.drone ? workDrones.some(d => droneCan(d.kind, job)) : rigs.some(r => rigCan(r.kind, job));
    if (covered) continue;
      f.queued[job.id] = true;
      log.push({ type: 'queue', pay: 0, name: job.name, i: f.i, j: f.j, t: worldDay });
    }
    const harvest = def.jobs.find(j => j.harvest);
    if (!f.harvested && harvest && day >= def.rotAt && !jobDone(f, harvest.id)) {
      markRot(f);
      potatoLive.splice(i, 1);
    }
  }
}
function maybeRelease(f) {
  if (!f?.live || !f.stored || f.failed === 'rot') return;
  const def = cropOf(f);
  if (!def) return;
  if (def.jobs.some(j => j.afterHarvest && !jobDone(f, j.id))) return;
  releaseField(f);
}
function storeHarvest(f) {
  if (!f?.live || f.failed === 'rot' || f.stored) return;
  const def = cropOf(f);
  if (def && fieldDay(f) >= def.rotAt) { markRot(f); dropPotato(f); return; }
  const crop = CROPS[f.crop];
  const factor = f.yieldFactor == null ? 1 : f.yieldFactor;
  const lot = {
    id: nextLot++, crop: crop.id, name: crop.name,
    liters: Math.max(0, Math.round(FIELD_HA * crop.yieldL * factor)),
    listPrice: Math.max(0, Math.round(quote(f.crop) * factor)),
    quality: factor,
    i: f.i, j: f.j, t: worldDay,
  };
  warehouse.push(lot);
  log.push({ type: 'store', pay: 0, listPrice: lot.listPrice, crop: crop.id, name: crop.name, i: f.i, j: f.j, t: worldDay });
  f.stored = true;
  f.harvested = true;
}
function markRot(f) {
  f.paid = false;
  f.live = false;
  f.hold = true;
  f.state = 0;
  f.g = 0;
  f.s = 0;
  f.claimed = false;
  f.plantedAt = null;
  f.failed = 'rot';
  f.cycle = false;
  delete f.jobS;
  log.push({ type: 'rot', pay: 0, name: '烂在地里', i: f.i, j: f.j, t: worldDay });
}
function fillCycleSupplies(f, autoBuy) {
  const def = (f && cropOf(f)) || cropDef('potato');
  const seedId = def?.seed || 'seed';
  const qty = def?.seedQty || SEED_PER_FIELD;
  const seedNeed = Math.max(0, qty - (stores[seedId] || 0));
  const fertNeed = Math.max(0, Math.ceil(fertPlan().fromFert - stores.fertilizer - 1e-9));
  if ((seedNeed > 0 || fertNeed > 0) && !autoBuy) return false;
  if (seedNeed > 0 && !buyItem(seedId, seedNeed).ok) return false;
  if (fertNeed > 0 && !buyItem('fertilizer', fertNeed).ok) return false;
  return (stores[seedId] || 0) >= qty && stores.fertilizer + 1e-9 >= fertPlan().fromFert;
}
function releaseField(f) {
  if (!f?.live || f.failed === 'rot') return;
  const cycle = !!f.cycle;
  const autoBuy = !!f.autoBuy;
  const cropId = CROPS[f.crop]?.id || 'potato';
  f.paid = true;
  f.live = false;
  f.hold = true;
  f.state = 0;
  f.g = 0;
  f.s = 0;
  f.claimed = false;
  f.plantedAt = null;
  f.failed = null;
  f.harvested = false;
  f.stored = false;
  delete f.jobS;
  dropPotato(f);
  f.cycle = cycle;
  f.autoBuy = autoBuy;
  if (cycle && seasonAllowsSow(f)) {
    if (!fillCycleSupplies(f, autoBuy)) return;
    plantField(f, cropId, { cycle, autoBuy });
  }
}
export function rigReadout(r) {
  if (!r) return null;
  const aerial = r.kind === 'drone_scout' || r.kind === 'drone_treat';
  const light = aerial ? sectorLight(r.x, worldDay) : null;
  const moving = !paused && (r.mode === 'work' || r.mode === 'turn' || r.mode === 'travel');
  const speed = moving ? (aerial ? DRONE_MPS : MACHINE_MPS) * economy.timeScale : 0;
  let doing = aerial ? '停在基站' : '停在机库';
  if (aerial && r.mode === 'reload') doing = '在基站装药';
  else if (r.mode === 'turn') doing = '地头转弯';
  else if (r.mode === 'need_unload') doing = '等侧卸';
  else if (r.mode === 'unload') doing = '侧卸';
  else if (r.mode === 'service') doing = r.serviceKind === 'reload' ? '装料' : '换挂具';
  else if (r.mode === 'switch') doing = '换模式';
  else if (r.mode === 'travel') {
    if (r.intent === 'home') doing = aerial ? '返回基站' : '返回机库';
    else if (r.intent === 'reload') doing = '回基站装药';
    else if (r.intent === 'service') doing = '回库换装';
    else if (r.intent === 'unload') doing = '去侧卸';
    else if (r.intent === 'deliver') doing = '运往机库';
    else doing = '开往田块';
  } else if (r.mode === 'charge') doing = '充电';
  else if (r.mode === 'work') {
    const job = r.f && cropOf(r.f)?.jobs.find(j => j.id === r.job);
    doing = job?.name || '作业';
  }
  let frac = 0;
  if (r.f?.jobS && r.job) frac = Math.max(0, Math.min(1, (r.f.jobS[r.job] || 0) / L.LANES));
  return { speed, doing, frac, charge: r.charge ?? 1, job: r.job || null, light };
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
  const hubPad = (di, dj) => {
    const f = fieldAt(L.HUBX * L.PER + di, L.HUBZ * L.PER + dj);
    return { x: f.x0 + L.FIELD / 2, z: f.z0 + L.FIELD / 2 };
  };
  const garageAt = hubPad(3, 2);
  garageOrigin = { x: garageAt.x, z: garageAt.z };
  ['planter', 'hiller', 'topper', 'lifter'].forEach((kind, n) => {
    const x = garageAt.x - 18 + n * 12, z = garageAt.z + 22;
    const profile = rigProfile(kind);
    const rig = { id: n, kind, label: profile.label, logicId: profile.logicId, busy: false, f: null, job: null, mode: 'park', intent: null, route: null, ri: 0, charge: 1, lane: 0, u: 0, bin: 0, cargo: 0, parkX: x, parkZ: z, x, z, ang: -Math.PI / 2 };
    bootRig(rig);
    rigs.push(rig);
  });
  nextRigId = rigs.length;
  for (const [di, dj, kind] of [[3, 1, 'warehouse'], [3, 2, 'garage'], [3, 3, 'process']]) {
    const at = hubPad(di, dj);
    const spec = BUILDING_KINDS[kind];
    buildings.push({ id: nextBuilding++, kind, name: spec.name, x: at.x, z: at.z, ang: 0, starter: true });
  }
  for (const f of fields) {
    if (signals.length >= 56) break;
    if (f.owned || f.crop < 0 || f.state < 2 || f.state > 3) continue;
    if ((f.idx % 23) !== 0) continue;
    signals.push({ x: f.x0 + L.FIELD / 2, z: f.z0 + L.FIELD / 2 });
  }
}
// 开局田块和中枢上的三栋功能房。重开时回到这里，田上的仓棚不留下来。
const starterBuildings = buildings.filter(b => b.starter).map(b => ({ kind: b.kind, name: b.name, x: b.x, z: b.z, ang: b.ang || 0 }));
const openingFields = fields.filter(f => f.owned).map(f => ({
  idx: f.idx, crop: f.crop, state: f.state, g: f.g, s: f.s, timer: f.timer || 0,
  live: !!f.live, hold: !!f.hold, frozen: !!f.frozen, paid: !!f.paid, sprayed: !!f.sprayed, claimed: !!f.claimed,
}));

function fieldUnder(x, z, includeHub) {
  let qx = x - L.X0;
  qx = ((qx % RING.CIRC) + RING.CIRC) % RING.CIRC;
  const qy = z - L.Z0;
  if (qy > -L.TRUNK && qy < 0) return null;
  const bx = Math.floor(qx / L.BP), by = Math.floor(qy / L.BP);
  if (by < 0 || by >= L.NBZ || bx < 0 || bx >= L.NBX) return null;
  const blx = qx - bx * L.BP, bly = qy - by * L.BP;
  if (blx > L.BLOCK || bly > L.BLOCK) return null;
  if (!includeHub && bx === L.HUBX && by === L.HUBZ) return null;
  const fi = Math.floor(blx / (L.FIELD + L.ROAD)), fj = Math.floor(bly / (L.FIELD + L.ROAD));
  const locx = blx - fi * (L.FIELD + L.ROAD), locz = bly - fj * (L.FIELD + L.ROAD);
  if (locx < 0 || locz < 0 || locx > L.FIELD || locz > L.FIELD) return null;
  return fieldAt(bx * L.PER + fi, by * L.PER + fj);
}
export function fieldAtWorld(x, z) {
  return fieldUnder(x, z, false);
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
      // 地头 U 形掉头。结束时车头对准下一行，不停在横着或倒着的角度上。
      h.turnT += dt * SIM.CUT / (Math.PI * L.LANE / 2);
      const pose = headlandSample(f, h.lane, Math.min(1, h.turnT));
      h.x = pose.x; h.z = pose.z; h.ang = pose.ang;
      if (h.turnT >= 1) {
        h.lane++; h.mode = 'cut';
        const next = h.lane % 2 === 0;
        h.u = next ? 0 : L.FIELD;
        h.ang = laneForward(f, next);
      }
    }
  }
}
export function inPlayerPlot(x, z) {
  const wx = wrapX(x);
  return wx >= PLOT.x0 && wx <= PLOT.x1 && z >= PLOT.z0 && z <= PLOT.z1;
}
export function onHubParcel(x, z) {
  if (!inPlayerPlot(x, z)) return false;
  const f = fieldUnder(x, z, true);
  if (!f || f.crop >= 0) return false;
  return Math.floor(f.i / L.PER) === L.HUBX && Math.floor(f.j / L.PER) === L.HUBZ;
}
function blankTanks() {
  for (const t of tanks) { t.species = null; t.startedAt = 0; t.tended = false; t.bi = null; t.bj = null; }
}
export function tankSite(tank) {
  if (!tank) return null;
  if (Number.isInteger(tank.bi) && Number.isInteger(tank.bj)) return { bi: tank.bi, bj: tank.bj };
  if (!tank.species) return null;
  const home = CULTURE_CELLS[tank.id] || CULTURE_CELLS[0];
  return { bi: home.bi, bj: home.bj };
}
function blockCulturing(bi, bj) {
  return tanks.some(t => t.species && tankSite(t)?.bi === bi && tankSite(t)?.bj === bj);
}
function potatoLiters() {
  let n = 0;
  for (const lot of warehouse) if (lot.crop === 'potato') n += +lot.liters || 0;
  return n;
}
export function potatoStock() { return potatoLiters(); }
function takePotato(liters) {
  let left = liters;
  for (let i = warehouse.length - 1; i >= 0 && left > 1e-6; i--) {
    const lot = warehouse[i];
    if (lot.crop !== 'potato' || !(lot.liters > 0)) continue;
    const take = Math.min(lot.liters, left);
    const value = lot.listPrice * (take / lot.liters);
    lot.liters -= take;
    lot.listPrice = Math.max(0, Math.round(lot.listPrice - value));
    left -= take;
    if (lot.liters <= 1e-3) warehouse.splice(i, 1);
  }
}
function payUtility(utilities, block) {
  const cost = utilityCost(utilities);
  if (!(cost > 0)) return { ok: true, cost: 0 };
  if (!(economy.revenue >= cost)) {
    if (block) return { ok: false, reason: 'money', cost };
    return { ok: true, cost: 0, deferred: true, listed: cost };
  }
  economy.revenue -= cost;
  log.push({ type: 'utility', pay: cost, t: worldDay });
  return { ok: true, cost };
}
export function fertPlan() {
  const offset = LOOP_OFFSETS.frassToFert;
  const need = FERT_PER_FIELD;
  const use = Math.min(stores.frass, offset.frassPerFullOffset);
  const cover = offset.frassPerFullOffset > 0 ? (use / offset.frassPerFullOffset) * offset.maxFraction : 0;
  return { fromFert: need - cover, frass: use, cover, cap: offset.maxFraction };
}
export function cultureFeedPlan(speciesId) {
  if (speciesId !== 'grub') return { fromShop: 1, peel: 0, cover: 0, cap: 0, utility: 0 };
  const offset = LOOP_OFFSETS.peelToFeed;
  const recipe = recipeById('grub-culture');
  const need = recipe.inputs.find(i => i.id === 'feed').qty;
  const use = Math.min(stores.peel, offset.peelPerFullOffset);
  const cover = offset.peelPerFullOffset > 0 ? (use / offset.peelPerFullOffset) * offset.maxFraction : 0;
  return { fromShop: need - cover, peel: use, cover, cap: offset.maxFraction, utility: utilityCost(recipe.utilities) };
}
export function millWatch() {
  const dev = deviceById('mill');
  const recipe = recipeById(dev.recipe);
  const mill = devices.find(d => d.kind === 'mill') || null;
  if (!mill) return { state: 'none', cost: dev.buildCost, days: dev.buildDays, name: dev.nameZh, recipe };
  if (mill.job) return { state: 'job', mill, left: Math.max(0, mill.job.doneAt - worldDay), cost: dev.buildCost, days: dev.buildDays, name: dev.nameZh, recipe };
  if (worldDay + 1e-9 < mill.readyAt) return { state: 'build', mill, left: mill.readyAt - worldDay, cost: dev.buildCost, days: dev.buildDays, name: dev.nameZh, recipe };
  return { state: 'ready', mill, left: 0, cost: dev.buildCost, days: dev.buildDays, name: dev.nameZh, recipe };
}
export function startMill(cell) {
  if (devices.some(d => d.kind === 'mill')) return { ok: false, reason: 'have' };
  if (!cell || cell.hub) return { ok: false, reason: 'hub' };
  if (blockCulturing(cell.bi, cell.bj)) return { ok: false, reason: 'grub' };
  const dev = deviceById('mill');
  if (!(economy.revenue >= dev.buildCost)) return { ok: false, reason: 'money', cost: dev.buildCost };
  economy.revenue -= dev.buildCost;
  const mill = {
    id: nextDevice++, kind: 'mill', name: dev.nameZh,
    x: +cell.x || 0, z: +cell.z || 0, bi: cell.bi, bj: cell.bj, fi: cell.fi, fj: cell.fj,
    startedAt: worldDay, readyAt: worldDay + dev.buildDays, job: null,
  };
  devices.push(mill);
  log.push({ type: 'build', pay: dev.buildCost, name: mill.name, t: worldDay });
  return { ok: true, mill, cost: dev.buildCost };
}
export function removeMill() {
  const i = devices.findIndex(d => d.kind === 'mill');
  if (i < 0) return { ok: false, reason: 'none' };
  if (devices[i].job) return { ok: false, reason: 'busy' };
  const mill = devices.splice(i, 1)[0];
  return { ok: true, mill };
}
export function orderProcess() {
  const watch = millWatch();
  if (watch.state === 'none') return { ok: false, reason: 'none' };
  if (watch.state === 'build') return { ok: false, reason: 'building', left: watch.left };
  if (watch.state === 'job') return { ok: false, reason: 'busy' };
  const recipe = watch.recipe;
  const need = recipe.inputs.find(i => i.id === 'potato').qty;
  const have = potatoLiters();
  if (have + 1e-6 < need) return { ok: false, reason: 'potato', need, have };
  const util = payUtility(recipe.utilities, true);
  if (!util.ok) return util;
  takePotato(need);
  watch.mill.job = { startedAt: worldDay, doneAt: worldDay + recipe.timeDays, potato: need };
  return { ok: true, doneAt: watch.mill.job.doneAt, cost: util.cost };
}
function settleDevices() {
  const recipe = recipeById('starch-mill');
  const starch = productById('starch');
  const peelOut = recipe.outputs.find(o => o.id === 'peel');
  const starchOut = recipe.outputs.find(o => o.id === 'starch');
  for (const mill of devices) {
    if (mill.kind !== 'mill' || !mill.job || worldDay + 1e-9 < mill.job.doneAt) continue;
    const lot = {
      id: nextLot++, crop: 'starch', name: starch.nameZh, kind: 'starch',
      liters: starchOut.qty, unit: starchOut.unit || starch.unit,
      listPrice: starch.sellPrice, i: null, j: null, t: worldDay,
    };
    warehouse.push(lot);
    stores.peel += peelOut.qty;
    log.push({ type: 'store', pay: 0, listPrice: lot.listPrice, crop: 'starch', name: lot.name, i: null, j: null, t: worldDay });
    mill.job = null;
  }
}
function restoreStarters() {
  buildings.length = 0;
  nextBuilding = 1;
  for (const s of starterBuildings) buildings.push({ id: nextBuilding++, kind: s.kind, name: s.name, x: s.x, z: s.z, ang: s.ang || 0, starter: true });
}
function ensureStarters() {
  for (const s of starterBuildings) {
    if (buildings.some(b => b.kind === s.kind)) continue;
    buildings.push({ id: nextBuilding++, kind: s.kind, name: s.name, x: s.x, z: s.z, ang: s.ang || 0, starter: true });
  }
}
function movedOntoHub(x, z) {
  if (onHubParcel(x, z)) return { x, z };
  const pad = starterBuildings[buildings.length % Math.max(1, starterBuildings.length)] || { x: 0, z: 0 };
  return { x: pad.x + 16, z: pad.z + 14 };
}
export function placeBuilding(x, z, kind = 'process') {
  if (!inPlayerPlot(x, z)) return { ok: false, reason: 'plot' };
  if (!onHubParcel(x, z)) return { ok: false, reason: 'field' };
  const spec = BUILDING_KINDS[kind] || BUILDING_KINDS.process;
  const cost = spec.price || 0;
  if (cost && !(economy.revenue >= cost)) return { ok: false, reason: 'money', cost };
  if (cost) economy.revenue -= cost;
  const b = { id: nextBuilding++, kind: spec.id, name: spec.name, x, z, ang: 0 };
  buildings.push(b);
  if (spec.id === 'drone_base') for (const d of workDrones) if (d.mode === 'park') parkDrone(d);
  return { ok: true, building: b, cost };
}
export function removeBuilding(id) {
  const i = buildings.findIndex(b => b.id === id);
  if (i < 0) return { ok: false, reason: 'missing' };
  const building = buildings.splice(i, 1)[0];
  return { ok: true, building };
}
export function cultureWatch(tank) {
  if (!tank?.species) return null;
  const spec = CULTURES.find(c => c.id === tank.species);
  if (!spec) return null;
  const day = Math.max(0, worldDay - (tank.startedAt || 0));
  return { day, days: spec.days, ready: day >= spec.days - 1e-9, name: spec.name, id: spec.id, tended: !!tank.tended };
}
export function startCulture(tankId, speciesId, block) {
  const tank = tanks[tankId];
  const spec = CULTURES.find(c => c.id === speciesId);
  if (!tank || !spec) return { ok: false, reason: 'tank' };
  if (tank.species) return { ok: false, reason: 'busy' };
  const site = block || tankSite(tank) || CULTURE_CELLS[tank.id] || CULTURE_CELLS[0];
  if (site.hub || (site.bi === L.HUBX && site.bj === L.HUBZ)) return { ok: false, reason: 'hub' };
  const mill = devices.find(d => d.kind === 'mill');
  if (mill && mill.bi === site.bi && mill.bj === site.bj) return { ok: false, reason: 'mill' };
  if (tanks.some(t => t !== tank && t.species && t.bi === site.bi && t.bj === site.bj)) return { ok: false, reason: 'busy' };
  const plan = cultureFeedPlan(spec.id);
  if (stores.feed + 1e-9 < plan.fromShop) return { ok: false, reason: 'feed', need: plan.fromShop };
  const recipe = spec.id === 'grub' ? recipeById('grub-culture') : null;
  // 营收够就扣水电。不够仍可开槽，避免开局和旧存档被挡住。加工厂那一批则必须先付。
  const util = recipe ? payUtility(recipe.utilities, false) : { ok: true, cost: 0 };
  stores.feed -= plan.fromShop;
  stores.peel -= plan.peel;
  tank.species = spec.id;
  tank.startedAt = worldDay;
  tank.tended = false;
  tank.bi = site.bi;
  tank.bj = site.bj;
  return { ok: true, name: spec.name, day: worldDay, feed: plan.fromShop, peel: plan.peel, utility: util.cost || 0, deferred: !!util.deferred };
}
export function tendCulture(tankId) {
  const tank = tanks[tankId];
  if (!tank?.species) return { ok: false, reason: 'empty' };
  tank.tended = true;
  return { ok: true, tank: tank.id };
}
export function harvestCulture(tankId) {
  const tank = tanks[tankId];
  const watch = cultureWatch(tank);
  if (!tank?.species || !watch) return { ok: false, reason: 'empty' };
  if (!watch.ready) return { ok: false, reason: 'early' };
  const spec = CULTURES.find(c => c.id === tank.species);
  const product = productById(spec.id);
  // TODO: 同一地块的顶灯、门灯、墙灯跟最近一次开始的单元。光照不对或弱光应减产。
  // 蛴螬培养槽会把所在地块画成弱光，但这里的公斤数仍是固定值，还没有乘光照。
  const lot = {
    id: nextLot++, crop: spec.id, name: spec.name, kind: 'protein',
    liters: product.lotKg, unit: product.unit || 'kg',
    listPrice: product.sellPrice, i: null, j: null, t: worldDay,
  };
  warehouse.push(lot);
  if (spec.id === 'grub') {
    const frass = recipeById('grub-culture').outputs.find(o => o.id === 'frass');
    stores.frass += frass.qty;
  }
  log.push({ type: 'store', pay: 0, listPrice: lot.listPrice, crop: spec.id, name: spec.name, i: null, j: null, t: worldDay });
  tank.species = null;
  tank.startedAt = 0;
  tank.tended = false;
  tank.bi = null;
  tank.bj = null;
  return { ok: true, lot };
}
export function resetGame() {
  const by = new Map(openingFields.map(s => [s.idx, s]));
  for (const f of fields) {
    const s = by.get(f.idx);
    if (!s) continue;
    f.crop = s.crop; f.state = s.state; f.g = s.g; f.s = s.s; f.timer = s.timer;
    f.live = s.live; f.hold = s.hold; f.frozen = s.frozen; f.paid = s.paid; f.sprayed = s.sprayed; f.claimed = s.claimed;
    f.plantedAt = 0;
    f.cycle = false;
    f.autoBuy = false;
    f.failed = null;
    f.harvested = false;
    f.stored = false;
    f.yieldFactor = 1;
    f.boomBusy = false;
    delete f.jobS;
    delete f.penalized;
    delete f.queued;
  }
  warehouse.length = 0;
  log.length = 0;
  economy.revenue = START_REVENUE;
  paused = false;
  worldDay = 0;
  simTime = 0;
  setTimeScale(1);
  stores.seed = SEED_PER_FIELD;
  stores.fertilizer = START_FERTILIZER;
  stores.spray = START_SPRAY;
  stores.feed = START_FEED;
  stores.peel = 0;
  stores.frass = 0;
  stores.seed_soy = 0;
  stores.seed_barley = 0;
  stores.seedling_cabbage = 0;
  boom = null;
  workDrones.length = 0;
  nextDroneId = 1;
  devices.length = 0;
  nextLot = 1;
  nextDevice = 1;
  blankTanks();
  restoreStarters();
  restoreFleet();
  for (const r of rigs) { r.bin = 0; r.cargo = 0; r.job = null; parkRig(r, true); }
  syncPotatoLive();
  rebuildDemo();
  assignIdleRigs();
}
function parkSpot(n) {
  const col = n % 6;
  const row = Math.floor(n / 6);
  let x = garageOrigin.x - 30 + col * 12;
  let z = garageOrigin.z + 22 + row * 9;
  while (rigs.some(r => Math.hypot(r.parkX - x, r.parkZ - z) < 3)) z += 9;
  return { x, z };
}
function addRig(kind) {
  const spec = MACHINE_SHOP.find(m => m.id === kind);
  if (!spec) return null;
  const spot = parkSpot(rigs.length);
  const r = {
    id: nextRigId++, kind, label: rigProfile(kind)?.label || spec.name, logicId: rigProfile(kind)?.logicId || kind,
    busy: false, f: null, job: null, mode: 'park', intent: null, route: null, ri: 0,
    charge: 1, lane: 0, u: 0, bin: 0, cargo: 0, parkX: spot.x, parkZ: spot.z, x: spot.x, z: spot.z, ang: -Math.PI / 2,
  };
  bootRig(r);
  rigs.push(r);
  return r;
}
function restoreFleet(list) {
  while (rigs.length > 4) rigs.pop();
  nextRigId = 4;
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (item && MACHINE_SHOP.some(m => m.id === item.kind)) addRig(item.kind);
  }
}
export function buyMachine(kind) {
  const item = MACHINE_SHOP.find(m => m.id === kind);
  if (!item) return { ok: false, reason: 'kind' };
  if (!(economy.revenue >= item.price)) return { ok: false, reason: 'money', cost: item.price };
  economy.revenue -= item.price;
  const r = addRig(kind);
  log.push({ type: 'buy', pay: item.price, name: item.name, n: 1, t: worldDay });
  return { ok: true, cost: item.price, name: item.name, id: r.id, kind };
}
export function buyItem(id, qty) {
  const item = SHOP.find(s => s.id === id);
  const n = Math.floor(Number(qty));
  if (!item || !Number.isFinite(n) || n < 1 || n > 999) return { ok: false, reason: 'qty' };
  const cost = item.price * n;
  if (!(economy.revenue >= cost)) return { ok: false, reason: 'money', cost };
  economy.revenue -= cost;
  stores[item.id] += n;
  log.push({ type: 'buy', pay: cost, name: item.name, n, t: worldDay });
  return { ok: true, cost, n, id: item.id, name: item.name, stock: stores[item.id] };
}
export function buySeed(qty) {
  const bought = buyItem('seed', qty);
  if (bought.ok) bought.seed = bought.stock;
  return bought;
}
export function warehouseStacks() {
  const map = new Map();
  for (const lot of warehouse) {
    const unit = lot.unit || 'L';
    const key = lot.crop + '|' + unit;
    let s = map.get(key);
    if (!s) {
      s = { key, crop: lot.crop, name: lot.name, unit, liters: 0, listPrice: 0, n: 0 };
      map.set(key, s);
    }
    s.liters += +lot.liters || 0;
    s.listPrice += +lot.listPrice || 0;
    s.n += 1;
  }
  return [...map.values()];
}
export function warehouseCapacity() {
  const stacks = warehouseStacks();
  const usedLiters = stacks.reduce((sum, s) => sum + s.liters, 0);
  return {
    maxSlots: WAREHOUSE_CAP.maxSlots,
    maxLiters: WAREHOUSE_CAP.maxLiters,
    usedSlots: stacks.length,
    usedLiters,
    soft: WAREHOUSE_CAP.maxSlots == null && WAREHOUSE_CAP.maxLiters == null,
  };
}
export function warehouseCanStore(liters = 0, cropId = null) {
  const cap = warehouseCapacity();
  if (cap.soft) return true;
  if (cap.maxLiters != null && cap.usedLiters + liters > cap.maxLiters + 1e-6) return false;
  const stacks = cropId && warehouse.some(lot => lot.crop === cropId);
  if (cap.maxSlots != null && !stacks && cap.usedSlots >= cap.maxSlots) return false;
  return true;
}
export function sellLot(id) {
  const i = warehouse.findIndex(lot => lot.id === id);
  if (i < 0) return null;
  const lot = warehouse.splice(i, 1)[0];
  economy.revenue += lot.listPrice;
  log.push({ type: 'sale', pay: lot.listPrice, crop: lot.crop, name: lot.name, i: lot.i, j: lot.j, t: worldDay });
  return lot;
}
export function sellStack(cropId, fraction = 1) {
  const frac = Math.min(1, Math.max(0, Number(fraction)));
  if (!(frac > 0)) return null;
  const lots = warehouse.filter(lot => lot.crop === cropId);
  if (!lots.length) return null;
  let pay = 0;
  let liters = 0;
  const name = lots[0].name;
  for (let i = warehouse.length - 1; i >= 0; i--) {
    const lot = warehouse[i];
    if (lot.crop !== cropId) continue;
    const cut = frac >= 0.999 ? 1 : frac;
    const partPay = lot.listPrice * cut;
    const partL = (lot.liters || 0) * cut;
    pay += partPay;
    liters += partL;
    if (cut >= 0.999 || (lot.liters || 0) - partL <= 1e-3) warehouse.splice(i, 1);
    else { lot.listPrice -= partPay; lot.liters -= partL; }
  }
  economy.revenue += pay;
  log.push({ type: 'sale', pay, crop: cropId, name, i: null, j: null, t: worldDay });
  return { crop: cropId, name, listPrice: pay, liters };
}
export function plantField(f, cropId, opts = {}) {
  if (!f?.owned) return { ok: false, reason: 'plot' };
  if (!seasonAllowsSow(f)) return { ok: false, reason: 'season' };
  if (f.state === 3 || f.live) return { ok: false, reason: 'busy' };
  const crop = typeof cropId === 'number' ? cropId : CROPS.findIndex(c => c.id === cropId);
  if (crop < 0 || !CROPS[crop].plantable) return { ok: false, reason: 'crop' };
  const def = cropDef(CROPS[crop].id);
  const seedId = def?.seed || 'seed';
  const seedQty = def?.seedQty || SEED_PER_FIELD;
  if ((stores[seedId] || 0) < seedQty) return { ok: false, reason: 'seed' };
  const fert = fertPlan();
  if (stores.fertilizer + 1e-9 < fert.fromFert) return { ok: false, reason: 'fertilizer' };
  const recipe = recipeById(FIELD_RECIPE[CROPS[crop].id] || '');
  if (recipe && !recipe.stub) payUtility(recipe.utilities, false);
  stores[seedId] -= seedQty;
  stores.fertilizer -= fert.fromFert;
  stores.frass -= fert.frass;
  f.crop = crop; f.state = 1; f.g = 0; f.s = 0; f.timer = 0;
  f.live = true; f.hold = false; f.frozen = false;
  // 规划不算钟。第一趟作业开工才记 plantedAt。出苗要等播种走完。
  f.plantedAt = null; f.paid = false; f.sprayed = false; f.claimed = false; f.failed = null;
  f.cycle = !!opts.cycle;
  f.autoBuy = !!opts.autoBuy;
  f.planSeq = planSeq++;
  f.yieldFactor = 1;
  f.penalized = {};
  f.harvested = false;
  f.stored = false;
  f.boomBusy = false;
  f.jobS = blankJobs(f);
  trackPotato(f);
  assignIdleRigs();
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
    stores: { seed: stores.seed, fertilizer: stores.fertilizer, spray: stores.spray, feed: stores.feed, peel: stores.peel, frass: stores.frass, seed_soy: stores.seed_soy || 0, seed_barley: stores.seed_barley || 0, seedling_cabbage: stores.seedling_cabbage || 0 },
    warehouse: warehouse.map(lot => ({ ...lot })),
    keepBuildings: true,
    buildings: buildings.map(b => ({ id: b.id, kind: b.kind, name: b.name, x: +b.x.toFixed(2), z: +b.z.toFixed(2), ang: b.ang || 0 })),
    devices: devices.map(d => ({
      id: d.id, kind: d.kind, name: d.name, x: +d.x.toFixed(2), z: +d.z.toFixed(2),
      bi: d.bi, bj: d.bj, fi: d.fi, fj: d.fj, startedAt: d.startedAt || 0, readyAt: d.readyAt || 0,
      job: d.job ? { startedAt: d.job.startedAt, doneAt: d.job.doneAt, potato: d.job.potato } : null,
    })),
    tanks: tanks.map(t => ({
      id: t.id, species: t.species, startedAt: t.startedAt || 0, tended: !!t.tended,
      bi: Number.isInteger(t.bi) ? t.bi : null, bj: Number.isInteger(t.bj) ? t.bj : null,
    })),
    fields: fields.filter(f => f.owned).map(f => ({
      i: f.i, j: f.j, crop: f.crop, dir: f.dir, state: f.state,
      g: +f.g.toFixed(4), s: +f.s.toFixed(4), timer: +(+f.timer || 0).toFixed(3),
      growT: f.growT, live: !!f.live, hold: !!f.hold, plantedAt: f.plantedAt == null ? null : f.plantedAt, planSeq: f.planSeq || 0,
      paid: !!f.paid, sprayed: !!f.sprayed,
      cycle: !!f.cycle, autoBuy: !!f.autoBuy, failed: f.failed || null,
      harvested: !!f.harvested, stored: !!f.stored, yieldFactor: f.yieldFactor == null ? 1 : f.yieldFactor,
      jobs: f.jobS ? Object.fromEntries(Object.entries(f.jobS).map(([k, v]) => [k, +v || 0])) : undefined,
    })),
    fleet: rigs.slice(4).map(r => ({ kind: r.kind })),
    workDrones: workDrones.map(d => ({ kind: d.kind })),
    harvesters: harvesters.map(h => ({
      id: h.id, mode: h.mode, lane: h.lane, u: +h.u.toFixed(2),
      x: +h.x.toFixed(2), z: +h.z.toFixed(2), ang: +h.ang.toFixed(4),
      i: h.f ? h.f.i : null, j: h.f ? h.f.j : null,
    })),
  };
}
function rebuildDemo() {
  harvesters.length = 0;
  // 只把开局那一台演示收割机接回来。环上其余 state 3 是冻结的邻区画面，不能各配一台，否则信号点缓冲越界，整帧画不出来。
  for (const f of fields) {
    if (!f.demo || f.state !== 3 || f.crop < 0 || CROPS[f.crop].id === 'potato') continue;
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
    f.growT = s.growT || f.growT; f.live = !!s.live; f.hold = !!s.hold;
    f.plantedAt = s.plantedAt == null ? null : +s.plantedAt;
    if (s.planSeq) f.planSeq = +s.planSeq;
    f.paid = !!s.paid; f.sprayed = !!s.sprayed;
    f.cycle = !!s.cycle; f.autoBuy = !!s.autoBuy; f.failed = s.failed || null;
    f.harvested = !!s.harvested; f.stored = !!s.stored;
    f.yieldFactor = Number.isFinite(+s.yieldFactor) ? +s.yieldFactor : 1;
    f.claimed = false; f.frozen = false; f.owned = true;
    if (s.jobs && typeof s.jobs === 'object') {
      f.jobS = {};
      for (const k of Object.keys(s.jobs)) f.jobS[k] = +s.jobs[k] || 0;
      ensureJobs(f);
    } else if (f.live) f.jobS = blankJobs(f);
  }
  economy.revenue = +data.revenue || 0;
  if (data.stores) {
    stores.seed = Number.isFinite(+data.stores.seed) ? +data.stores.seed : 0;
    stores.fertilizer = +data.stores.fertilizer || 0;
    stores.spray = +data.stores.spray || 0;
    stores.feed = Number.isFinite(+data.stores.feed) ? +data.stores.feed : START_FEED;
    stores.peel = Number.isFinite(+data.stores.peel) ? +data.stores.peel : 0;
    stores.frass = Number.isFinite(+data.stores.frass) ? +data.stores.frass : 0;
    stores.seed_soy = Number.isFinite(+data.stores.seed_soy) ? +data.stores.seed_soy : 0;
    stores.seed_barley = Number.isFinite(+data.stores.seed_barley) ? +data.stores.seed_barley : 0;
    stores.seedling_cabbage = Number.isFinite(+data.stores.seedling_cabbage) ? +data.stores.seedling_cabbage : 0;
  }
  boom = null;
  if (data.timeScale) setTimeScale(data.timeScale);
  warehouse.length = 0;
  for (const lot of data.warehouse || []) {
    warehouse.push({ ...lot, id: +lot.id || nextLot++ });
    nextLot = Math.max(nextLot, (+lot.id || 0) + 1);
  }
  buildings.length = 0;
  for (const b of data.buildings || []) {
    const kind = BUILDING_KINDS[b.kind] ? b.kind : 'shed';
    const at = movedOntoHub(+b.x || 0, +b.z || 0);
    buildings.push({ id: +b.id || nextBuilding++, kind, name: b.name || BUILDING_KINDS[kind].name, x: at.x, z: at.z, ang: +b.ang || 0 });
    nextBuilding = Math.max(nextBuilding, (+b.id || 0) + 1);
  }
  if (!data.keepBuildings) ensureStarters();
  devices.length = 0;
  nextDevice = 1;
  for (const d of data.devices || []) {
    if (d.kind !== 'mill') continue;
    if (d.bi === L.HUBX && d.bj === L.HUBZ) continue;
    devices.push({
      id: +d.id || nextDevice++, kind: 'mill', name: d.name || deviceById('mill').nameZh,
      x: +d.x || 0, z: +d.z || 0, bi: d.bi, bj: d.bj, fi: d.fi, fj: d.fj,
      startedAt: +d.startedAt || 0, readyAt: +d.readyAt || 0,
      job: d.job ? { startedAt: +d.job.startedAt || 0, doneAt: +d.job.doneAt || 0, potato: +d.job.potato || 0 } : null,
    });
    nextDevice = Math.max(nextDevice, (+d.id || 0) + 1);
  }
  if (Array.isArray(data.tanks)) {
    blankTanks();
    for (const t of data.tanks) {
      const tank = tanks[t.id];
      if (!tank) continue;
      const spec = CULTURES.find(c => c.id === t.species);
      tank.species = spec ? spec.id : null;
      tank.startedAt = +t.startedAt || 0;
      tank.tended = !!t.tended;
      tank.bi = Number.isInteger(+t.bi) && t.bi != null && t.bi !== '' ? +t.bi : null;
      tank.bj = Number.isInteger(+t.bj) && t.bj != null && t.bj !== '' ? +t.bj : null;
    }
  } else blankTanks();
  worldDay = +(data.worldDay ?? data.simTime) || 0;
  simTime = worldDay;
  rebuildDemo();
  restoreFleet(data.fleet);
  restoreWorkDrones(data.workDrones);
  for (const r of rigs) { r.bin = 0; r.cargo = 0; r.job = null; parkRig(r, true); }
  syncPotatoLive();
  assignIdleRigs();
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
  const total = dt * sc;
  const days = total / DAY_SECONDS;
  const start = worldDay;
  stepFields(days);
  // 窗口在这一步中间打开时，机器只走打开之后的那段路，不会把整步都算进去。
  let used = 0;
  const SLICE = 0.25;
  if (total > 0) {
    while (used < total - 1e-9) {
      const slice = Math.min(SLICE, total - used);
      used += slice;
      worldDay = start + used / DAY_SECONDS;
      simTime = worldDay;
      settlePotatoCalendar();
      stepRigs(slice);
      stepHarvesters(slice);
    }
  }
  worldDay = start + days;
  simTime = worldDay;
  settleDevices();
  stepHaulers(dt);
  stepDrones(t);
}
