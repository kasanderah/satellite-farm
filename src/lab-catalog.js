// 资产工坊目录。只有名字和分类，不进主进度存档。
export const LAB_CLASSES = [
  { id: 'unit', label: '单元' },
  { id: 'machine', label: '农机' },
  { id: 'equip', label: '设备' },
  { id: 'rail', label: '轨道设备' },
];

// 培育层空单元。农场 4 km 切成 7×7 地块，和地表同一套地块边界；中枢占正中一格，不放台。
// 口头「约 143 m」是 570/4 的口算。缝、窄环路和墙从地块里扣掉，台面净边略小。
const m1 = n => (Math.round(n * 10) / 10).toString();
const m2 = n => (Math.round(n * 100) / 100).toString();
export const CULT_EMPTY = {
  farm: 4000,
  plots: 7,
  wall: 1.2,
  lane: 5,
  seam: 3,
  raise: 0.46,
  chamfer: 4.2,
  bevel: 0.1,
  clear: 17,
  doorW: 8,
  doorH: 5,
  doorsPerWall: 4,
  code: 'C-3,2',
};
CULT_EMPTY.plot = CULT_EMPTY.farm / CULT_EMPTY.plots;
CULT_EMPTY.unit = (CULT_EMPTY.plot - 2 * CULT_EMPTY.wall - 2 * CULT_EMPTY.lane - 3 * CULT_EMPTY.seam) / 4;

export const CULT_EMPTY_NOTES = `抬缘白台。培育层的空单元：台上没有设备，也没有作物。

尺度（对齐地表地块网格）：
农场 ${CULT_EMPTY.farm / 1000}×${CULT_EMPTY.farm / 1000} km，${CULT_EMPTY.plots}×${CULT_EMPTY.plots}=${CULT_EMPTY.plots * CULT_EMPTY.plots} 个地块。正中一格是中枢，单独留出，不放培育台。培育层与地表的地块边界对齐。本沙盒只摆一块非中枢样例，编号 ${CULT_EMPTY.code}。
地块外边 ${m1(CULT_EMPTY.plot)} m（4 km / 7，口头约 570 m）。每块 4×4=16 个单元。
单元净边 ${m1(CULT_EMPTY.unit)} m。口头约 143 m 是 570/4 的口算；${m1(CULT_EMPTY.seam)} m 电缆沟、贴墙环路和 ${m1(CULT_EMPTY.wall)} m 结构墙都从这 ${m1(CULT_EMPTY.plot)} m 里扣，所以台面略小于 143 m。
培育层净高 ${CULT_EMPTY.clear} m。顶是地表楼板的底面。

缝与路：
单元之间只留 ${m1(CULT_EMPTY.seam)} m 电缆沟（约定 2–4 m）。窄缝，不是公路。分隔不靠黄黑警示门，也不做霓虹满灌。
贴墙一圈环路宽 ${m1(CULT_EMPTY.lane)} m，比上一版概念窄，只够农机沿墙走。

台面（抬缘白台）：
亚光米白 / 浅灰。整台只抬高 ${m2(CULT_EMPTY.raise)} m，是低台阶，不是高基座。平面转角倒角 ${m1(CULT_EMPTY.chamfer)} m，比上一版小；顶缘倒棱 ${m2(CULT_EMPTY.bevel)} m。
每台四边都有平贴的小号工业编号，样例 ${CULT_EMPTY.code}-U01 到 U16。一台一个号，四边同一串，字躺在台面上。
台面有一层很浅的分格线，亚光，没有噪点。台缘是一条细的冷青白发光缘，会照到台沿。顶灯带在 ${CULT_EMPTY.clear} m 楼板下，空闲时大约两成，是真正的灯，不是贴图。环境光压暗，方便看清照度。

墙与门：
墙不是光板。外皮有竖向肋柱、横向梁和板缝，门洞带门框。四面墙各 ${CULT_EMPTY.doorsPerWall} 扇农机门，一共 ${CULT_EMPTY.doorsPerWall * 4} 扇。门宽 ${m1(CULT_EMPTY.doorW)} m，高 ${m1(CULT_EMPTY.doorH)} m，农机进得去，不是机库大开口。门位对准外侧那一排单元。

状态（灯会跟着变）：
空闲：环境偏暗，顶灯大约两成，缘光细。
作业：顶灯和缘光一起抬一点。
选中：缘光明显一些，台面略亮。
损坏：顶灯和缘光变弱，台面有轻微磨损。`;

// span：沙盒里把镜头框住的边长（米）。和游戏里的模数一致，只用于取景。
export const LAB_ENTRIES = [
  {
    id: 'cult-empty',
    cls: 'unit',
    name: '培育层·空单元',
    size: `${m1(CULT_EMPTY.unit)} × ${m1(CULT_EMPTY.unit)} m · 地块 ${m1(CULT_EMPTY.plot)} m`,
    span: 800,
    notes: CULT_EMPTY_NOTES,
  },
  { id: 'field', cls: 'unit', name: '地表田块', size: '128 × 128 m', span: 128, notes: '露天小格。地面是垄，四周是田埂。没有顶。' },
  { id: 'deck', cls: 'unit', name: '培育层地板', size: '128 × 128 m', span: 128, notes: '密封小格。金属地板、墙和顶缘。冷色缝灯。' },
  { id: 'hub', cls: 'unit', name: '中枢格', size: '530 × 530 m', span: 530, notes: '中枢地块。硬化板和 8 m 板缝。不种，不养。' },
  { id: 'tractor', cls: 'machine', name: '拖拉机', size: '约 4.5 m', span: 16, notes: '地表农机。自由行驶，后面可换农具。' },
  { id: 'planter', cls: 'machine', name: '播种机', size: '约 6 m', span: 18, notes: '拖拉机拖着覆土起垄器。' },
  { id: 'hiller', cls: 'machine', name: '培土机', size: '约 6 m', span: 18, notes: '圆盘把土抛回垄脊。' },
  { id: 'topper', cls: 'machine', name: '杀秧机', size: '约 6 m', span: 18, notes: '前挂甩刀罩，把藤蔓打碎。' },
  { id: 'harvester', cls: 'machine', name: '收获机', size: '约 10 m', span: 24, notes: '铲起垄，土从杆条网落下。' },
  { id: 'tank', cls: 'equip', name: '培养槽', size: '16 × 9 m', span: 28, notes: '放在培育层、中枢东侧的小格里。中枢格上不放。' },
  { id: 'warehouse', cls: 'equip', name: '仓库', size: '22 × 14 m', span: 40, notes: '中枢上的仓。只建在中枢。' },
  { id: 'garage', cls: 'equip', name: '车库', size: '28 × 16 m', span: 48, notes: '中枢上的机库。地表农机停在前面。' },
  { id: 'process', cls: 'equip', name: '加工棚', size: '12 × 8 m', span: 28, notes: '中枢上的加工。只建在中枢。' },
  { id: 'arm', cls: 'rail', name: '收获臂', size: '沿槽排', span: 42, notes: '龙门臂。沿轨道走，作业时探向槽。' },
  { id: 'irrigator', cls: 'rail', name: '喷灌桁架', size: '跨 124 m', span: 140, notes: '沿田块往返的桁架。' },
];
