// 预制件：所有硬表面资产都由「倒角盒 / 倒角圆柱 + 4 种共享材质」拼装（材质纪律借自 IXION，模块网格借自 Block'hood）
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './_shared.js';

const C = k => new THREE.Color(PALETTE[k] || k);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), V = (x, y, z) => new THREE.Vector3(x, y, z);

// 一个 Kit 收集若干零件，按材质组合并成 4 个几何体：light 浅漆金属 / dark 深漆金属 / glass 玻璃 / emis 发光体
export class Kit {
  constructor() { this.g = { light: [], dark: [], glass: [], emis: [] }; }
  add(mat, geo, p = [0, 0, 0], r = [0, 0, 0], col = null, s = [1, 1, 1]) {
    const g = geo.index ? geo.clone() : geo.clone();
    g.deleteAttribute('uv'); if (g.attributes.uv1) g.deleteAttribute('uv1');
    tmpQ.setFromEuler(tmpE.set(r[0], r[1], r[2]));
    g.applyMatrix4(tmpM.compose(V(...p), tmpQ, V(...s)));
    const c = col instanceof THREE.Color ? col : C(col || (mat === 'dark' ? 'metalDk' : mat === 'light' ? 'regoLt' : mat === 'glass' ? 'deep' : 'paper'));
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    (g.index ? g : g).userData.indexed = !!g.index;
    this.g[mat].push(g.index ? g.toNonIndexed() : g);
    return this;
  }
  // 倒角盒：倒角 ≈ 最短边 4%（接住边缘高光）
  box(mat, w, h, d, p, r, col, bev = 0.04) { return this.add(mat, new RoundedBoxGeometry(w, h, d, 2, Math.max(0.02, Math.min(w, h, d) * bev)), p, r, col); }
  // 无倒角的普通盒（用于数量很大的小零件，如地下培育架）
  pbox(mat, w, h, d, p, r, col) { return this.add(mat, new THREE.BoxGeometry(w, h, d), p, r, col); }
  cyl(mat, rt, rb, h, p, r, col, seg = 16) { return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg), p, r, col); }
  build() {
    const out = {};
    for (const k in this.g) out[k] = this.g[k].length ? mergeGeometries(this.g[k]) : null;
    return out;
  }
}
// 发光色（线性 HDR，>1 才会被 bloom 捕捉）
export const glow = (k, i) => C(k).multiplyScalar(i);

// ---------------- 自动收割机（约 10 m 长，割台宽 12 m） ----------------
export function harvesterKit() {
  const k = new Kit(), W = 12;
  // 底盘与车身
  k.box('dark', 6.6, 1.5, 2.9, [-0.6, 1.55, 0]);
  k.box('light', 5.4, 2.1, 3.2, [-1.2, 3.25, 0], [0, 0, 0], 'regoLt');
  k.box('light', 3.6, 1.15, 3.3, [-0.9, 4.85, 0], [0, 0, 0], 'haze');          // 粮箱
  k.box('dark', 3.3, 0.18, 3.0, [-0.9, 5.47, 0]);                              // 粮箱盖
  k.box('dark', 2.2, 1.6, 3.32, [-3.2, 3.3, 0]);                                // 发动机散热格栅
  for (let i = 0; i < 5; i++) k.box('light', 0.08, 1.3, 3.36, [-4.15 + i * 0.42, 3.3, 0]);
  // 传感舱（无人驾驶，保留驾驶室形体便于识别）
  k.box('glass', 2.0, 1.55, 2.3, [1.9, 4.35, 0]);
  k.box('light', 2.3, 0.22, 2.5, [1.85, 5.2, 0], [0, 0, 0], 'paper');
  k.box('dark', 0.25, 1.7, 2.4, [0.95, 4.3, 0]);
  k.cyl('dark', 0.32, 0.38, 0.35, [1.6, 5.48, 0]);                              // 激光雷达
  k.cyl('emis', 0.34, 0.34, 0.07, [1.6, 5.62, 0], [0, 0, 0], glow('data', 5));
  k.box('emis', 0.12, 0.12, 1.9, [3.0, 5.22, 0], [0, 0, 0], glow('paper', 9));   // 车顶工作灯条
  k.cyl('emis', 0.17, 0.17, 0.3, [-2.6, 5.75, 1.25], [0, 0, 0], glow('harvest', 14)); // 作业信标
  // 卸粮搅龙（折叠在左侧）
  k.cyl('light', 0.22, 0.22, 6.2, [-0.7, 5.2, -1.85], [0, 0, Math.PI / 2], 'regoLt', 10);
  k.box('dark', 0.5, 0.5, 0.5, [-3.6, 5.2, -1.85]);
  k.cyl('dark', 0.12, 0.12, 1.4, [-3.6, 4.6, -1.85]);
  // 排气管
  k.cyl('dark', 0.13, 0.13, 1.3, [-2.4, 5.0, 1.0], [0, 0, 0], null, 8);
  // 喂入室 + 割台（槽体、割刀、拨禾轮、分禾器）
  k.box('dark', 2.4, 1.15, 1.7, [2.75, 1.65, 0], [0, 0, -0.32]);
  k.box('light', 1.5, 0.9, W, [4.45, 0.95, 0], [0, 0, 0], 'regoLt', 0.06);
  k.box('dark', 1.2, 0.5, W - 0.3, [4.6, 1.05, 0]);                            // 槽内暗部
  k.box('dark', 0.35, 0.12, W, [5.25, 0.42, 0]);                                // 割刀
  k.cyl('light', 0.55, 0.55, W - 0.6, [5.0, 1.8, 0], [Math.PI / 2, 0, 0], 'haze', 7);
  for (const z of [-W / 2 + 0.2, W / 2 - 0.2]) {
    k.box('light', 1.9, 1.3, 0.14, [4.6, 1.2, z], [0, 0, 0], 'paper');
    k.box('light', 0.9, 0.5, 0.16, [5.7, 0.6, z], [0, 0, -0.35], 'harvest');      // 割台端头警示色
  }
  // 车轮：前大后小
  for (const s of [-1, 1]) {
    k.cyl('dark', 1.05, 1.05, 0.85, [1.4, 1.05, s * 1.75], [Math.PI / 2, 0, 0], null, 18);
    k.cyl('light', 0.5, 0.5, 0.88, [1.4, 1.05, s * 1.75], [Math.PI / 2, 0, 0], 'rego', 12);
    k.cyl('dark', 0.68, 0.68, 0.6, [-3.4, 0.68, s * 1.5], [Math.PI / 2, 0, 0], null, 14);
  }
  k.box('emis', 0.08, 0.25, 0.5, [-4.55, 2.7, 1.2], [0, 0, 0], glow('alert', 6));
  k.box('emis', 0.08, 0.25, 0.5, [-4.55, 2.7, -1.2], [0, 0, 0], glow('alert', 6));
  return k.build();
}

// 拖拉机底盘（约 4.5 m），后面换农具。材质仍是那四套共享材质。
function tractorBase(k) {
  k.box('dark', 2.6, 0.7, 1.7, [0.1, 0.95, 0]);
  k.box('light', 1.45, 1.25, 1.55, [-0.15, 1.9, 0], [0, 0, 0], 'haze');
  k.box('glass', 1.2, 0.72, 1.35, [-0.1, 2.15, 0]);
  k.box('dark', 0.9, 0.55, 1.5, [1.15, 1.35, 0]);
  k.cyl('emis', 0.14, 0.14, 0.22, [0.15, 2.75, 0], [0, 0, 0], glow('harvest', 12), 8);
  k.box('emis', 0.08, 0.16, 0.4, [1.55, 1.15, 0.55], [0, 0, 0], glow('paper', 8));
  k.box('emis', 0.08, 0.16, 0.4, [1.55, 1.15, -0.55], [0, 0, 0], glow('paper', 8));
  for (const x of [1.05, -1.05]) for (const s of [-1, 1]) {
    k.cyl('dark', 0.52, 0.52, 0.32, [x, 0.52, s * 1.05], [Math.PI / 2, 0, 0], null, 12);
    k.cyl('light', 0.24, 0.24, 0.34, [x, 0.52, s * 1.05], [Math.PI / 2, 0, 0], 'rego', 8);
  }
}
// 仓棚：玩家在自己田区里放下的一栋小平房，材质仍是那四套共享材质。
export function shedKit() {
  const k = new Kit();
  k.box('dark', 9.4, 0.32, 6.4, [0, 0.16, 0]);
  k.box('light', 8.8, 3.1, 5.8, [0, 1.85, 0], [0, 0, 0], 'haze');
  k.box('dark', 9.1, 0.22, 6.1, [0, 3.5, 0]);
  k.box('light', 9.6, 0.4, 6.6, [0, 3.8, 0], [0, 0, 0], 'regoLt');
  k.box('glass', 1.5, 1.7, 0.12, [4.46, 1.8, 0.4]);
  k.box('emis', 0.08, 0.14, 0.46, [4.5, 2.85, 1.7], [0, 0, 0], glow('paper', 6));
  return k.build();
}
export function tractorKit() {
  const k = new Kit();
  tractorBase(k);
  return k.build();
}
// 播种机：拖拉机拖着覆土起垄器，种薯落下后垄脊合上
export function planterKit() {
  const k = new Kit();
  tractorBase(k);
  k.box('dark', 0.8, 0.28, 3.4, [-2.15, 0.85, 0]);
  k.box('light', 1.3, 0.7, 1.1, [-1.7, 1.35, 0], [0, 0, 0], 'regoLt'); // 种箱
  for (const z of [-1.2, -0.4, 0.4, 1.2]) {
    k.box('dark', 0.55, 0.16, 0.16, [-2.55, 0.42, z]);
    k.box('light', 0.7, 0.32, 0.28, [-2.85, 0.4, z], [0.55, 0, 0], 'paper'); // 覆土板
  }
  return k.build();
}
// 培土机：圆盘把土重新抛回垄脊，薯块不见光
export function hillerKit() {
  const k = new Kit();
  tractorBase(k);
  k.box('dark', 0.5, 0.3, 3.6, [-2.2, 0.9, 0]);
  for (const z of [-1.35, -0.45, 0.45, 1.35]) {
    k.cyl('light', 0.42, 0.42, 0.1, [-2.15, 0.55, z], [0.4, 0, Math.PI / 2], 'haze', 10);
    k.box('dark', 0.35, 0.5, 0.12, [-2.55, 0.4, z], [0.2, 0, 0]);
  }
  return k.build();
}
// 杀秧机：前挂甩刀罩，把藤蔓打碎，不是慢慢变黄
export function topperKit() {
  const k = new Kit();
  tractorBase(k);
  k.box('dark', 1.5, 0.55, 3.6, [2.55, 0.85, 0]);
  k.box('light', 1.2, 0.22, 3.7, [2.7, 1.2, 0], [0, 0, 0], 'regoLt');
  k.cyl('dark', 0.18, 0.18, 3.3, [2.7, 0.62, 0], [Math.PI / 2, 0, 0], null, 8);
  for (let i = 0; i < 9; i++) k.box('light', 0.28, 0.16, 0.08, [2.7, 0.48, -1.5 + i * 0.38], [0.8, 0, 0], 'rust');
  return k.build();
}
// 收获机：铲起垄，土从杆条网落下，薯块进料仓
export function potatoLifterKit() {
  const k = new Kit();
  k.box('dark', 6.4, 1.15, 2.5, [-0.2, 1.25, 0]);
  k.box('light', 2.8, 1.35, 2.35, [-1.5, 2.4, 0], [0, 0, 0], 'regoLt'); // 料仓
  k.box('dark', 2.7, 0.12, 2.2, [-1.5, 3.1, 0]);
  k.box('glass', 1.5, 1.15, 1.9, [1.35, 2.25, 0]);
  k.cyl('emis', 0.15, 0.15, 0.24, [1.1, 3.05, 0], [0, 0, 0], glow('harvest', 14), 8);
  k.box('dark', 1.6, 0.28, 3.1, [3.35, 0.42, 0]); // 铲
  k.box('light', 0.18, 0.42, 3.2, [4.05, 0.5, 0], [0.6, 0, 0], 'paper');
  for (let i = 0; i < 7; i++) k.box('light', 0.1, 0.08, 2.3, [2.55 - i * 0.32, 0.85 + i * 0.1, 0], [0.35, 0, 0], 'haze'); // 杆条网
  for (const s of [-1, 1]) {
    k.cyl('dark', 0.72, 0.72, 0.4, [1.3, 0.72, s * 1.45], [Math.PI / 2, 0, 0], null, 14);
    k.cyl('dark', 0.48, 0.48, 0.34, [-2.5, 0.48, s * 1.25], [Math.PI / 2, 0, 0], null, 12);
  }
  k.box('emis', 0.08, 0.2, 0.4, [-3.4, 1.5, 0.9], [0, 0, 0], glow('alert', 6));
  k.box('emis', 0.08, 0.2, 0.4, [-3.4, 1.5, -0.9], [0, 0, 0], glow('alert', 6));
  return k.build();
}

// ---------------- 运输车（8 m） ----------------
export function haulerKit() {
  const k = new Kit();
  k.box('dark', 7.6, 0.6, 2.4, [0, 0.95, 0]);
  k.box('light', 1.8, 1.7, 2.4, [3.0, 2.1, 0], [0, 0, 0], 'haze');
  k.box('glass', 0.3, 0.7, 2.0, [3.92, 2.4, 0]);
  k.box('light', 5.2, 1.9, 2.45, [-0.9, 2.25, 0], [0, 0, 0], 'regoLt');
  k.box('dark', 5.25, 0.12, 2.5, [-0.9, 2.8, 0]);
  for (const x of [2.8, -1.4, -2.8]) for (const s of [-1, 1]) k.cyl('dark', 0.55, 0.55, 0.45, [x, 0.55, s * 1.1], [Math.PI / 2, 0, 0], null, 12);
  k.box('emis', 0.06, 0.18, 0.5, [3.93, 1.3, 0.8], [0, 0, 0], glow('paper', 10));
  k.box('emis', 0.06, 0.18, 0.5, [3.93, 1.3, -0.8], [0, 0, 0], glow('paper', 10));
  return k.build();
}

// ---------------- 巡检无人机（1.4 m） ----------------
export function droneKit() {
  const k = new Kit();
  k.box('light', 0.7, 0.22, 0.7, [0, 0, 0], [0, 0, 0], 'haze');
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    k.box('dark', 0.55, 0.06, 0.08, [x * 0.3, 0, z * 0.3], [0, Math.atan2(z, x) * -1, 0]);
    k.cyl('dark', 0.26, 0.26, 0.03, [x * 0.55, 0.09, z * 0.55], [0, 0, 0], null, 10);
  }
  k.cyl('emis', 0.09, 0.09, 0.05, [0, -0.14, 0], [0, 0, 0], glow('data', 12));
  return k.build();
}

// ---------------- 小人（1.8 m，尺度参照） ----------------
export function personKit() {
  const k = new Kit();
  k.cyl('light', 0.2, 0.17, 1.1, [0, 0.95, 0], [0, 0, 0], 'paper', 8);
  k.cyl('dark', 0.13, 0.13, 0.75, [0, 0.38, 0], [0, 0, 0], null, 6);
  k.add('light', new THREE.SphereGeometry(0.14, 8, 6), [0, 1.66, 0], [0, 0, 0], 'paper');
  return k.build();
}

// ---------------- 输送带走廊段（40 m） ----------------
export function conveyorKit() {
  const k = new Kit(), Lg = 40;
  k.box('dark', Lg, 0.7, 3.2, [0, 2.6, -1.8], [0, 0, 0], null, 0.08);
  k.box('light', Lg, 0.12, 2.6, [0, 3.0, -1.8], [0, 0, 0], 'rego');
  k.cyl('light', 0.7, 0.7, Lg, [0, 1.5, 2.0], [0, 0, Math.PI / 2], 'regoLt', 12);   // 管道
  k.cyl('dark', 0.45, 0.45, Lg, [0, 1.0, 3.6], [0, 0, Math.PI / 2], null, 10);
  for (const x of [-Lg / 2 + 1, 0]) {
    k.box('dark', 0.5, 2.3, 0.5, [x, 1.15, -3.2]); k.box('dark', 0.5, 2.3, 0.5, [x, 1.15, -0.4]);
    k.box('dark', 0.6, 1.0, 5.6, [x, 0.5, 2.6]);
  }
  return k.build();
}

// ---------------- 区站（每 3×3 区一座：两座筒仓 + 一个模块楼 + 天线） ----------------
export function depotKit() {
  const k = new Kit();
  k.box('dark', 46, 0.5, 34, [0, 0.25, 0], [0, 0, 0], 'deep', 0.02);
  for (const [x, h] of [[-12, 22], [0, 26]]) {
    k.cyl('light', 5, 5, h, [x, h / 2, -6], [0, 0, 0], 'regoLt', 24);
    k.cyl('dark', 5.15, 5.15, 0.6, [x, h * 0.35, -6], [0, 0, 0], null, 24);
    k.cyl('dark', 5.15, 5.15, 0.6, [x, h * 0.7, -6], [0, 0, 0], null, 24);
    k.cyl('light', 5, 1.2, 2.2, [x, h + 1.1, -6], [0, 0, 0], 'haze', 24);
  }
  k.box('dark', 16, 2, 2.4, [-6, 27, -6]);
  k.box('light', 16, 8, 12, [12, 4, 6], [0, 0, 0], 'haze');
  k.box('light', 8, 8, 12, [8, 12, 6], [0, 0, 0], 'regoLt');
  k.box('dark', 16.1, 0.5, 12.1, [12, 8, 6]);
  k.box('emis', 0.1, 0.8, 9, [20.06, 5, 6], [0, 0, 0], glow('paper', 5));
  k.box('emis', 0.1, 0.8, 9, [4.06, 13, 6], [0, 0, 0], glow('paper', 4));
  k.cyl('dark', 0.25, 0.4, 30, [18, 15, -10], [0, 0, 0], null, 6);
  k.cyl('emis', 0.45, 0.45, 0.6, [18, 30.3, -10], [0, 0, 0], glow('alert', 16));
  return k.build();
}

// ---------------- 控制中枢（Block'hood 式模块堆叠 + IXION 式倒角硬表面） ----------------
export function hubKit(rnd) {
  const k = new Kit(), U = 8;
  // 模块楼群：8 m 网格，高低错落，悬挑
  const plan = [
    [0, 0, 4], [1, 0, 3], [2, 0, 3], [3, 0, 2], [0, 1, 3], [1, 1, 5], [2, 1, 2], [3, 1, 2], [4, 1, 1],
    [0, 2, 2], [1, 2, 3], [2, 2, 4], [3, 2, 1], [-1, 1, 1], [1, 3, 2], [2, 3, 1], [0, 3, 1]];
  const ox = -150, oz = -40;
  for (const [i, j, h] of plan) for (let y = 0; y < h; y++) {
    const glassy = (i + j + y) % 4 === 1, x = ox + i * U, z = oz + j * U, yy = y * U + U / 2;
    k.box(glassy ? 'light' : 'light', U - 0.3, U - 0.3, U - 0.3, [x, yy, z], [0, 0, 0], (i * 3 + j + y) % 3 === 0 ? 'haze' : 'regoLt');
    k.box('dark', U + 0.05, 0.4, U + 0.05, [x, y * U + 0.2, z]);
    if (glassy) { k.box('glass', U - 1.2, U * 0.5, 0.2, [x, yy, z + U / 2 - 0.05]); k.box('emis', U - 1.6, 0.25, 0.1, [x, yy - 1.2, z + U / 2 + 0.1], [0, 0, 0], glow('paper', 4)); }
    else if ((i + y) % 2 === 0) k.box('emis', 0.1, 0.35, U - 2, [x + U / 2 + 0.05, yy + 1.5, z], [0, 0, 0], glow('paper', 3.5));
  }
  // 悬挑模块 + 屋顶设备（小构件层级）
  k.box('light', U * 2 - 0.3, U - 0.3, U - 0.3, [ox + 1.5 * U + 3, 5 * U + U / 2, oz + U], [0, 0, 0], 'haze');
  for (let n = 0; n < 9; n++) k.box('dark', 1.6, 1.2, 1.6, [ox + (n % 3) * 3 - 2, 4 * U + 0.6, oz + Math.floor(n / 3) * 3 - 3]);
  // 控制塔（竖向地标）
  const tx = -60, tz = -90;
  k.cyl('light', 5, 6, 64, [tx, 32, tz], [0, 0, 0], 'regoLt', 24);
  for (let y = 8; y < 64; y += 8) k.cyl('dark', 6.1 - y * 0.015, 6.1 - y * 0.015, 0.5, [tx, y, tz], [0, 0, 0], null, 24);
  k.cyl('dark', 11, 9, 4, [tx, 66, tz], [0, 0, 0], null, 24);
  k.cyl('glass', 10.6, 10.6, 3, [tx, 69.5, tz], [0, 0, 0], null, 24);
  k.cyl('emis', 10.7, 10.7, 0.3, [tx, 68.2, tz], [0, 0, 0], glow('paper', 5), 24);
  k.cyl('light', 11.5, 10.5, 1.4, [tx, 71.6, tz], [0, 0, 0], 'paper', 24);
  k.cyl('dark', 0.4, 0.8, 26, [tx, 85, tz], [0, 0, 0], null, 8);
  k.cyl('emis', 0.7, 0.7, 0.9, [tx, 98.5, tz], [0, 0, 0], glow('alert', 20));
  // 筒仓列（8 座）+ 顶部输送廊桥
  for (let n = 0; n < 8; n++) {
    const x = 20 + n * 15, z = -150;
    k.cyl('light', 6.5, 6.5, 34, [x, 17, z], [0, 0, 0], n % 3 === 1 ? 'haze' : 'regoLt', 28);
    for (const y of [8, 17, 26]) k.cyl('dark', 6.65, 6.65, 0.6, [x, y, z], [0, 0, 0], null, 28);
    k.cyl('light', 6.5, 1.5, 3, [x, 35.5, z], [0, 0, 0], 'haze', 28);
    k.box('emis', 0.12, 0.6, 2.2, [x + 6.55, 3, z], [0, 0, 0], glow('paper', 3));
  }
  k.box('dark', 8 * 15, 2.4, 3, [20 + 3.5 * 15, 38, -150]);
  k.box('dark', 3, 2.4, 60, [20 + 7 * 15 + 10, 38, -120]); k.box('dark', 3, 40, 3, [20 + 7 * 15 + 10, 20, -92]);
  // 加压温室（3 座拱形长厅，内部补光）
  for (let n = 0; n < 3; n++) {
    const x = 60 + n * 26, z = 20, Lh = 70;
    k.add('glass', new THREE.CylinderGeometry(10, 10, Lh, 20, 1, false, 0, Math.PI), [x, 0, z], [Math.PI / 2, Math.PI / 2, 0], 'deep');
    for (let r = 0; r <= 7; r++) k.add('light', new THREE.TorusGeometry(10.1, 0.25, 6, 20, Math.PI), [x, 0, z - Lh / 2 + r * Lh / 7], [0, 0, 0], 'haze');
    k.box('emis', 12, 0.2, Lh - 4, [x, 0.4, z], [0, 0, 0], new THREE.Color(PALETTE.olive).multiplyScalar(2.2));
    k.box('emis', 0.3, 0.3, Lh - 6, [x, 8.5, z], [0, 0, 0], glow('paper', 3));
  }
  // 散热板阵列
  for (let n = 0; n < 12; n++) k.box('dark', 0.4, 9, 14, [-150 + n * 4.5, 4.5, 110], [0, 0, 0], 'metalDk', 0.02);
  for (let n = 0; n < 12; n++) k.box('light', 0.2, 0.3, 14.2, [-150 + n * 4.5, 9.1, 110], [0, 0, 0], 'haze');
  // 机库（收割机停放）
  k.box('light', 90, 14, 30, [120, 7, 120], [0, 0, 0], 'regoLt', 0.03);
  k.box('dark', 90.2, 1.0, 30.2, [120, 14.2, 120]);
  for (let n = 0; n < 6; n++) { k.box('dark', 13, 11, 0.4, [83 + n * 14.8, 5.5, 105]); k.box('emis', 12, 0.3, 0.2, [83 + n * 14.8, 11.5, 104.6], [0, 0, 0], glow('harvest', 3)); }
  // 着陆坪
  k.cyl('dark', 22, 23, 1.2, [-110, 0.6, 120], [0, 0, 0], 'deep', 40);
  k.add('light', new THREE.TorusGeometry(17, 0.5, 4, 48), [-110, 1.25, 120], [Math.PI / 2, 0, 0], 'paper');
  for (let n = 0; n < 8; n++) { const a = n / 8 * 6.283; k.cyl('emis', 0.4, 0.4, 0.3, [-110 + Math.cos(a) * 21, 1.3, 120 + Math.sin(a) * 21], [0, 0, 0], glow('harvest', 10), 8); }
  // 通讯天线
  k.cyl('dark', 0.5, 1.2, 40, [-200, 20, -150], [0, 0, 0], null, 8);
  k.add('light', new THREE.SphereGeometry(7, 20, 8, 0, 6.283, 0, 1.1), [-200, 42, -150], [0.8, 0.3, 0], 'haze');
  k.cyl('emis', 0.5, 0.5, 0.8, [-200, 40.6, -150], [0, 0, 0], glow('alert', 16));
  return k.build();
}

// ---------------- 单株作物（交叉面片 / 小簇；底部 y=0，高 1 m，宽约 1 m，后面按参数缩放） ----------------
// 顶点色存「明暗系数」：根部 0.4 → 叶尖 1.0（假 AO），穗/球 1.1
function leaf(w, h, bend, yaw, tilt, base = 0, shade0 = 0.4, shade1 = 1.0) {
  const segs = 3, pos = [], col = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, ww = w * (1 - t * 0.85) / 2, y = base + h * t, x = bend * t * t;
    pos.push(x, y, -ww, x, y, ww); const s = shade0 + (shade1 - shade0) * t; col.push(s, s, s, s, s, s);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.rotateZ(-tilt); g.rotateY(yaw);
  return g;
}
function blob(geo, s, y, shade) {
  geo.deleteAttribute('uv'); geo.scale(...s); geo.translate(0, y, 0);
  const n = geo.attributes.position.count; geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(shade), 3));
  return geo.index ? geo : geo;
}
function finish(parts) {
  const ps = parts.map(p => { p.deleteAttribute('normal'); return p.index ? p.toNonIndexed() : p; });
  const g = mergeGeometries(ps); g.computeVertexNormals();
  // 叶片法线向上偏，避免背面发黑（植被常用做法）
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { const v = V(n.getX(i), n.getY(i), n.getZ(i)); if (v.y < 0) v.negate(); v.lerp(V(0, 1, 0), 0.55).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return g;
}
export function plantGeometry(shape) {
  const P = [];
  if (shape === 'ear') {          // 麦：一簇细叶 + 3 根麦穗
    for (let i = 0; i < 5; i++) P.push(leaf(0.06, 0.75, 0.18, i * 1.26, 0.18 + (i % 2) * 0.15));
    for (let i = 0; i < 3; i++) { const a = i * 2.1, r = 0.08; P.push(blob(new THREE.CylinderGeometry(0.035, 0.03, 0.2, 5), [1, 1, 1], 0, 1.15).translate(Math.cos(a) * r, 0.88, Math.sin(a) * r)); P.push(leaf(0.015, 0.8, 0.02, a, 0.03, 0, 0.5, 0.9).translate(Math.cos(a) * r * 0.5, 0, Math.sin(a) * r * 0.5)); }
  } else if (shape === 'stalk') { // 玉米/高粱：茎 + 4 片下垂长叶 + 顶穗
    P.push(blob(new THREE.CylinderGeometry(0.025, 0.04, 1, 5), [1, 1, 1], 0.5, 0.75));
    for (let i = 0; i < 4; i++) P.push(leaf(0.09, 0.5, 0.35, i * 1.7 + 0.4, 0.5, 0.25 + i * 0.16, 0.5, 1.0));
    P.push(blob(new THREE.ConeGeometry(0.05, 0.16, 5), [1, 1, 1], 1.0, 1.15));
  } else if (shape === 'bush') {  // 豆/薯：低矮叶簇
    for (let i = 0; i < 7; i++) P.push(leaf(0.22, 0.45 + (i % 3) * 0.12, 0.25, i * 0.9, 0.7, 0.05, 0.45, 1.0));
    P.push(blob(new THREE.IcosahedronGeometry(0.22, 0), [1, 0.8, 1], 0.55, 0.85));
  } else if (shape === 'tuft') {  // 稻/苜蓿：直立细叶丛
    for (let i = 0; i < 6; i++) P.push(leaf(0.05, 0.9 + (i % 2) * 0.1, 0.12, i * 1.05, 0.12 + (i % 3) * 0.08));
  } else {                        // rosette 甘蓝：外叶杯 + 球心
    for (let i = 0; i < 6; i++) P.push(leaf(0.5, 0.55, 0.0, i * 1.047, 1.05, 0.05, 0.45, 0.95));
    P.push(blob(new THREE.IcosahedronGeometry(0.3, 1), [1, 0.85, 1], 0.38, 1.1));
  }
  return finish(P);
}

// ---------------- 传感灯杆（14 m） ----------------
export function mastKit() {
  const k = new Kit();
  k.cyl('dark', 0.16, 0.24, 14, [0, 7, 0], [0, 0, 0], null, 6);
  k.box('light', 1.6, 0.08, 1.0, [0.5, 12.6, 0], [0, 0, -0.5], 'haze');      // 小太阳能板
  k.box('dark', 0.5, 0.35, 0.35, [0, 13.6, 0]);
  k.cyl('emis', 0.13, 0.13, 0.12, [0, 14.05, 0], [0, 0, 0], glow('paper', 9), 6);
  return k.build();
}
// ---------------- 平移式喷灌桁架（跨整块田 128 m，沿作物行缓慢往返） ----------------
export function irrigatorKit() {
  const k = new Kit(), W = 124;
  k.box('light', 0.5, 0.5, W, [0, 4.2, 0], [0, 0, 0], 'regoLt', 0.1);
  k.box('dark', 0.25, 0.25, W, [0, 3.0, 0], [0, 0, 0], null, 0.1);
  for (let i = 0; i < 16; i++) { const z = -W / 2 + (i + 0.5) * W / 16; k.box('dark', 0.12, 1.5, 0.12, [0, 3.6, z], [i % 2 ? 0.7 : -0.7, 0, 0]); }
  for (let i = 0; i <= 4; i++) {
    const z = -W / 2 + i * W / 4;
    k.box('dark', 0.25, 4.3, 0.25, [0.9, 2.1, z], [0, 0, 0.2]); k.box('dark', 0.25, 4.3, 0.25, [-0.9, 2.1, z], [0, 0, -0.2]);
    k.cyl('dark', 0.55, 0.55, 0.35, [1.3, 0.55, z], [Math.PI / 2, 0, 0], null, 10); k.cyl('dark', 0.55, 0.55, 0.35, [-1.3, 0.55, z], [Math.PI / 2, 0, 0], null, 10);
  }
  k.box('light', 2.2, 2.0, 1.6, [0, 3.2, -W / 2 - 1.2], [0, 0, 0], 'haze');
  k.cyl('emis', 0.12, 0.12, 0.2, [0, 4.4, -W / 2 - 1.2], [0, 0, 0], glow('data', 8), 6);
  return k.build();
}

// ---------------- 地下培育层：多层立体栽培架（12 m 一段，6 层托盘，每层下方一条灯带） ----------------
// light 组只放作物条（顶点色为白，实例色 = 作物色板），这样同一个 kit 可以种不同作物
export function growRackKit() {
  const k = new Kit(), Lr = 11.2, Wr = 1.3, T = 6, dy = 1.05;
  for (const x of [-Lr / 2, 0, Lr / 2]) for (const z of [-Wr / 2, Wr / 2]) k.pbox('dark', 0.12, T * dy + 0.5, 0.12, [x, (T * dy + 0.5) / 2, z]);
  for (let t = 0; t < T; t++) {
    const y = 0.45 + t * dy;
    k.pbox('dark', Lr, 0.1, Wr, [0, y, 0]);
    k.pbox('light', Lr - 0.3, 0.28, Wr - 0.25, [0, y + 0.19, 0], [0, 0, 0], new THREE.Color(1, 1, 1));
    k.pbox('emis', Lr - 0.6, 0.05, 0.22, [0, y + dy - 0.12, 0], [0, 0, 0], glow('paper', 4.2));
  }
  k.pbox('dark', Lr + 0.2, 0.12, Wr + 0.1, [0, T * dy + 0.5, 0]);
  return k.build();
}
// ---------------- 设备层：储液罐组 / 泵站 / 管廊 ----------------
export function tankKit() {
  const k = new Kit();
  k.box('dark', 22, 0.6, 24, [0, 0.3, 0], [0, 0, 0], 'deep', 0.02);
  for (const z of [-5.4, 5.4]) {
    k.cyl('light', 4.4, 4.4, 12.5, [-2, 6.85, z], [0, 0, 0], 'regoLt', 28);
    k.cyl('light', 3.6, 4.4, 1.2, [-2, 13.7, z], [0, 0, 0], 'haze', 28);
    for (const y of [2.5, 7, 11.5]) k.cyl('dark', 4.5, 4.5, 0.35, [-2, y, z], [0, 0, 0], null, 28);
    k.cyl('emis', 0.25, 0.25, 0.2, [-2, 14.4, z], [0, 0, 0], glow('data', 5));
  }
  k.box('dark', 5, 5, 16, [6.5, 3.1, 0], [0, 0, 0], null, 0.04);
  k.cyl('light', 0.6, 0.6, 10, [3.5, 9, 0], [Math.PI / 2, 0, 0], 'steel', 12);
  k.box('emis', 0.15, 1.2, 0.15, [9.05, 4.2, 5], [0, 0, 0], glow('harvest', 8));
  return k.build();
}
export function pumpKit() {
  const k = new Kit();
  k.box('dark', 20, 0.6, 24, [0, 0.3, 0], [0, 0, 0], 'deep', 0.02);
  k.box('dark', 15, 6.5, 9, [0, 3.85, -5], [0, 0, 0], null, 0.03);
  k.box('light', 15.2, 0.4, 9.2, [0, 7.3, -5], [0, 0, 0], 'regoLt');
  for (const x of [-4.5, 0, 4.5]) { k.cyl('dark', 1.7, 1.7, 0.7, [x, 7.8, -5], [0, 0, 0], null, 20); k.cyl('light', 0.4, 0.4, 0.8, [x, 7.9, -5], [0, 0, 0], 'haze', 10); }
  for (let i = 0; i < 4; i++) k.box('light', 3.2, 4.8, 0.12, [-5.4 + i * 3.6, 3.4, -0.45], [0, 0, 0], 'rego');
  k.box('dark', 8, 3.6, 6, [-3, 2.4, 6.5], [0, 0, 0], null, 0.04);
  k.cyl('light', 1.4, 1.4, 6, [5, 2.0, 6.5], [Math.PI / 2, 0, 0], 'regoLt', 18);
  k.box('emis', 1.6, 0.18, 0.1, [-3, 3.2, 9.52], [0, 0, 0], glow('data', 4));
  k.box('emis', 0.2, 0.2, 0.2, [7, 7.6, -0.6], [0, 0, 0], glow('alert', 10));
  return k.build();
}
export function pipeRackKit() {
  const k = new Kit(), Lp = 26;
  for (const x of [-Lp / 2 + 1, 0]) { k.pbox('dark', 0.4, 8, 0.4, [x, 4, -2.2]); k.pbox('dark', 0.4, 8, 0.4, [x, 4, 2.2]); k.pbox('dark', 0.4, 0.4, 4.8, [x, 7.8, 0]); k.pbox('dark', 0.3, 0.3, 4.8, [x, 5.2, 0]); }
  k.cyl('light', 0.75, 0.75, Lp, [0, 8.8, -1.2], [0, 0, Math.PI / 2], 'regoLt', 12);
  k.cyl('light', 0.55, 0.55, Lp, [0, 8.6, 1.2], [0, 0, Math.PI / 2], 'steel', 10);
  k.cyl('dark', 0.4, 0.4, Lp, [0, 6.0, -1.4], [0, 0, Math.PI / 2], null, 8);
  k.cyl('light', 0.35, 0.35, Lp, [0, 6.0, 0.6], [0, 0, Math.PI / 2], 'haze', 8);
  return k.build();
}
