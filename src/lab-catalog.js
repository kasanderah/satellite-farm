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
台面有一层很浅的分格线，亚光，没有噪点。台沿不铺一条发光带。每台四边有一排地灯，小型跑道边灯，冷白灯头，间距疏，不是光条。顶灯带在 ${CULT_EMPTY.clear} m 楼板下，空闲时大约两成，是真正的灯，不是贴图。环境光压暗，方便看清照度。

墙与门：
墙背是光板。肋柱、横梁、板缝和门框都在内皮，地块合并后背面几乎看不见。四面墙各 ${CULT_EMPTY.doorsPerWall} 扇农机门，一共 ${CULT_EMPTY.doorsPerWall * 4} 扇。门宽 ${m1(CULT_EMPTY.doorW)} m，高 ${m1(CULT_EMPTY.doorH)} m，农机进得去，不是机库大开口。门位对准外侧那一排单元。

灯组：顶灯带、地灯、门灯、墙灯。工坊里可以逐组开关。状态仍用 1–4。
空闲：环境偏暗，顶灯大约两成，地灯是小点。
作业：顶灯和地灯一起抬一点。
选中：地灯更亮，台面略亮。
损坏：顶灯和地灯变弱，台面有轻微磨损。

地块级照明：一个地块共用顶灯、门灯、墙灯。同一地块里，如果不同单元要的地块级照明不一样，后开始的那一单元说了算。光照不对会减产。
单元装上蛴螬培养槽之后，这一地块进入弱光：顶灯带变成很暗的暗房红，门灯改成低亮的黄，墙灯全部关掉。`;

export const CULT_B_NOTES = `培育地块B方案。同一套空地块，漆面马拉松绿，不是 A 的亚光白台。台上仍然没有设备，也没有作物。

尺度与 A 相同：农场 4×4 km，7×7=49 地块，正中是中枢。样例 ${CULT_EMPTY.code}。地块外边 ${m1(CULT_EMPTY.plot)} m。4×4=16 单元，净边 ${m1(CULT_EMPTY.unit)} m。单元之间 ${m1(CULT_EMPTY.seam)} m 电缆沟。贴墙环路 ${m1(CULT_EMPTY.lane)} m。净高 ${CULT_EMPTY.clear} m。

造型：高饱和凯利绿 / 森绿，清漆，高光。转角是大圆角，不是 A 的小倒角。亮红横带作结构强调。紫色发光点是点缀。墙背仍是光板，肋、梁、板缝、门框只在内皮。

灯组：顶灯带、台缘、门灯、墙灯、紫灯。可逐组开关。1–4 仍是空闲、作业、选中、损坏。空闲顶灯大约两成。`;

// 沙盒默认 2 台。2 和 4 都把槽列均分，台数以后做成升级项。
export const GRUB_GANTRY_OPTIONS = [2, 4];
export const GRUB_DEMO_GANTRIES = 2;
export const GRUB_WORK_MPS = 3;
export const GRUB_EMPTY_MPS = 12;

export function planGrubColumns(rowCount, gantryCount) {
  const n = gantryCount === 4 ? 4 : 2;
  const rows = Array.from({ length: Math.max(0, rowCount) }, (_, i) => i);
  const base = Math.floor(rows.length / n);
  let extra = rows.length % n;
  const out = [];
  let i = 0;
  for (let g = 0; g < n; g++) {
    const len = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    out.push(rows.slice(i, i + len));
    i += len;
  }
  return out;
}

export const GRUB_TROUGH_NOTES = `蛴螬培养槽。一整套设备，放在培育层的一个单元台上。

槽：每只约 4×15 m，开口培养槽，同一规格，整齐排开。槽里是蛴螬，成团堆在槽内，看得见。
一角不放槽。那里两扇地面门：A 出，装满的箱子从这里离开；B 进，空箱从这里上来。

龙门：默认 ${GRUB_DEMO_GANTRIES} 台。2 台或 4 台都能排进这一单元，几台就平分槽列，不抢同一列。台数以后做成升级项。
空闲：停在单元边上。
作业：沿槽的长边走，作业速度约 ${GRUB_WORK_MPS} m/s，和地表农机同一档。一列走完，在单元端头平移到下一列。空驶更快，约 ${GRUB_EMPTY_MPS} m/s。
每台龙门顶上有状态灯：停靠是琥珀，空驶是蓝，作业是绿。巡灯、状态灯、槽灯都在灯心上加一层软光晕，不往场景里打光。

容器循环逻辑（以后可能换成别的）：龙门走到可收的槽上方，把箱子吊起，送到 A 门放下，再到 B 门接一只空箱，放回原位。
以后还会补这些作业动画，现在只留名字：补料、巡逻、翻堆。沙盒里作业键播的是容器循环。

暗房：蛴螬的每个阶段都要暗。槽灯是红的，龙门巡灯也是红的。空闲、作业、选中、损坏都停在这间暗房里，不把地块灯拉亮。
装进单元后，这一地块进入弱光。顶灯带改成很暗的暗房红，门灯是低亮黄，墙灯全关。工坊里看这套设备时，地块就是这套弱光。
同一地块里，若几个单元要的地块级照明不一样，后开始的单元为准。光照不对会减产。

灯组：槽灯、巡灯、状态灯；旁边是地块的顶灯带、地灯、门灯、墙灯。墙灯在弱光里关掉。可关。1–4 仍是空闲、作业、选中、损坏。
选中：整套有选中圈。损坏：龙门停偏，状态灯变红，部分槽变暗。

占地：一个培育单元，净边 ${m1(CULT_EMPTY.unit)} m。不占中枢，不放进地表田。`;

// span：沙盒里把镜头框住的边长（米）。和游戏里的模数一致，只用于取景。
export const LAB_ENTRIES = [
  {
    id: 'cult-a',
    cls: 'unit',
    name: '培育地块A方案',
    size: `${m1(CULT_EMPTY.unit)} × ${m1(CULT_EMPTY.unit)} m · 地块 ${m1(CULT_EMPTY.plot)} m`,
    span: 800,
    notes: CULT_EMPTY_NOTES,
  },
  {
    id: 'cult-b',
    cls: 'unit',
    name: '培育地块B方案',
    size: `${m1(CULT_EMPTY.unit)} × ${m1(CULT_EMPTY.unit)} m · 圆角 · 地块 ${m1(CULT_EMPTY.plot)} m`,
    span: 800,
    notes: CULT_B_NOTES,
  },
  { id: 'field', cls: 'unit', name: '地表田块', size: '128 × 128 m', span: 128, notes: '露天小格。地面是垄，四周是田埂。没有顶。' },
  { id: 'deck', cls: 'unit', name: '培育层地板', size: '128 × 128 m', span: 128, notes: '密封小格。金属地板、墙和顶缘。冷色缝灯。' },
  { id: 'hub', cls: 'unit', name: '中枢格', size: '530 × 530 m', span: 530, notes: '中枢地块。硬化板和 8 m 板缝。不种，不养。' },
  { id: 'tractor', cls: 'machine', name: '拖拉机', size: '约 4.5 m', span: 16, notes: '地表农机。自由行驶，后面可换农具。' },
  { id: 'planter', cls: 'machine', name: '播种机', size: '约 6 m', span: 18, notes: '拖拉机拖着覆土起垄器。' },
  { id: 'hiller', cls: 'machine', name: '培土机', size: '约 6 m', span: 18, notes: '圆盘把土抛回垄脊。' },
  { id: 'topper', cls: 'machine', name: '杀秧机', size: '约 6 m', span: 18, notes: '前挂甩刀罩，把藤蔓打碎。' },
  { id: 'harvester', cls: 'machine', name: '收获机', size: '约 10 m', span: 24, notes: '铲起垄，土从杆条网落下。' },
  {
    id: 'grub-trough',
    cls: 'equip',
    name: '蛴螬培养槽',
    size: `4 × 15 m 槽 · 占 1 单元 ${m1(CULT_EMPTY.unit)} m`,
    span: 168,
    notes: GRUB_TROUGH_NOTES,
  },
  { id: 'tank', cls: 'equip', name: '培养槽', size: '16 × 9 m', span: 28, notes: '放在培育层、中枢东侧的小格里。中枢格上不放。' },
  { id: 'warehouse', cls: 'equip', name: '仓库', size: '22 × 14 m', span: 40, notes: '中枢上的仓。只建在中枢。' },
  { id: 'garage', cls: 'equip', name: '车库', size: '28 × 16 m', span: 48, notes: '中枢上的机库。地表农机停在前面。' },
  { id: 'process', cls: 'equip', name: '加工棚', size: '12 × 8 m', span: 28, notes: '中枢上的加工。只建在中枢。' },
  { id: 'arm', cls: 'rail', name: '收获臂', size: '沿槽排', span: 42, notes: '龙门臂。沿轨道走，作业时探向槽。' },
  { id: 'irrigator', cls: 'rail', name: '喷灌桁架', size: '跨 124 m', span: 140, notes: '沿田块往返的桁架。' },
];
