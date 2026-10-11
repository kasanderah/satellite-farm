// 资产工坊目录。只有名字和分类，不进主进度存档。
export const LAB_CLASSES = [
  { id: 'unit', label: '单元' },
  { id: 'machine', label: '农机' },
  { id: 'hitch', label: '后挂' },
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

export const HUB_PLOT_NOTES = `中枢地块。农场 7×7 的正中一格。不种，不养，培育台不进这一格。

尺度：地块外边 ${m1(CULT_EMPTY.plot)} m（4 km / 7），和培育地块同一条网格。工坊里这一格就是样例，不是 ${CULT_EMPTY.code}。四层都是整层封住的，只在正中留主井井口。

四层的中心是同一口主井，井道朝空间站中轴接上去：
地表：硬化坪。井口在正中。西侧是这一农场的能源场，南侧是仓储。
培育层：井穿过去。四周是冷藏和料罐，不放培育台。
设备层：变电和机厅围着井。
承压壳：井的根。电池和结构环停在这一层，再往下不挖。

主井：六边形模块叠起来，浅灰壳体，炭黑接缝，黄条和红标。井从承压壳一直升到环心，顶在空间站中轴上，不再停在地块上方。作业时轿厢沿井在这几层里走。井灯、层灯、能源、仓储、警示都是灯心上的光晕，不往场景里打光。

剖面：跟别的地块一样，要看下面就切到那一层，上面的板和房子藏起来。默认是地表。培育层、设备层、承压壳各看各的整层。

灯组可逐组开关。1–4 仍是空闲、作业、选中、损坏。
空闲：灯大约两成，轿厢停在井口附近。
作业：轿厢沿井上下，井灯和层灯抬亮。
选中：地块有选中圈，指示更亮。
损坏：警示变红，能源收暗，轿厢停在设备层。`;

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
  {
    id: 'hub',
    cls: 'unit',
    name: '中枢地块',
    size: `${m1(CULT_EMPTY.plot)} × ${m1(CULT_EMPTY.plot)} m · 四层`,
    span: 640,
    notes: HUB_PLOT_NOTES,
  },
  { id: 'tractor', cls: 'machine', name: '拖拉机', size: '约 4.5 m', span: 16, notes: '地表农机。自由行驶，后面可换农具。' },
  { id: 'planter', cls: 'machine', name: '播种机', size: '约 6 m', span: 18, notes: '拖拉机拖着覆土起垄器。' },
  { id: 'hiller', cls: 'machine', name: '培土机', size: '约 6 m', span: 18, notes: '圆盘把土抛回垄脊。' },
  { id: 'topper', cls: 'machine', name: '杀秧机', size: '约 6 m', span: 18, notes: '前挂甩刀罩，把藤蔓打碎。' },
  { id: 'harvester', cls: 'machine', name: '收获机', size: '约 10 m', span: 24, notes: '铲起垄，土从杆条网落下。' },
  {
    id: 'tractor_gen',
    cls: 'machine',
    name: '通用拖拉机',
    size: '约 5.4 × 2.4 m',
    span: 16,
    notes: `编号 tractor_gen。通用拖拉机。地表自走底盘，密封驾驶舱，亚光金属壳体。

后部是三点悬挂。后挂农具挂在这里，本机不带固定农具。自由行驶，作业速度和现有地表农机同一档。

灯组：工作灯、信标。可关。1–4 仍是空闲、作业、选中、损坏。
空闲：灯大约两成，停在坪上。
作业：沿坪绕行，工作灯抬亮，轮子转。
选中：有选中圈，灯再抬一点。
损坏：信标变红，车身偏一点，灯收暗。`,
  },
  {
    id: 'harvester_combine',
    cls: 'machine',
    name: '联合收割机',
    size: '约 10 × 7 m',
    span: 24,
    notes: `编号 harvester_combine。联合收割机。自走，不是拖拉机后挂。密封舱，亚光壳体。割台在前，粮箱在中，卸粮搅龙折在一侧。

大豆和谷物不各做一台。模式记在这一台剪影上：
大豆：挠性低割台，贴矮冠层。
谷物：拨禾轮割台，收麦类和高秆。
沙盒先共用这一副割台外形。

灯组：工作灯、信标。作业时拨禾轮转。损坏：信标红，搅龙停着。`,
  },
  {
    id: 'harvester_potato',
    cls: 'machine',
    name: '土豆收获机',
    size: '约 9 × 3.2 m',
    span: 22,
    notes: `编号 harvester_potato。土豆收获机。自走。前部铲起垄，杆条网把土筛下去，块茎进料仓。密封舱，亚光壳体。

不是后挂种薯播种机，也不是目录里那台旧收获机剪影。这一台是地表土豆收获的自走机。

灯组：工作灯、信标。作业时筛网往上走。损坏：料仓灯灭，信标红。`,
  },
  {
    id: 'harvester_cabbage',
    cls: 'machine',
    name: '结球收获机',
    size: '约 8 × 3.4 m',
    span: 20,
    notes: `编号 harvester_cabbage。结球收获机。自走，收结球叶菜。前部归拢，圆盘切断，升运进仓。密封舱，亚光壳体。

不是谷物联合收割机。割台低、仓浅，读得出是收叶球，不是收穗。

灯组：工作灯、信标。作业时升运辊在转。损坏：信标红，升运停。`,
  },
  {
    id: 'transplanter',
    cls: 'machine',
    name: '移栽机',
    size: '约 6.5 × 2.6 m',
    span: 18,
    notes: `编号 transplanter。移栽机。自走。苗盘架在舱后，一行栽植器贴地。密封舱，亚光壳体。

不做成拖拉机后挂。苗在盘里，不是条播的种子，也不是种薯。

灯组：工作灯、信标。作业时栽植器上下。损坏：信标红，栽植器停在低位。`,
  },
  {
    id: 'drone_scout',
    cls: 'machine',
    name: '巡视无人机',
    size: '约 1.8 m',
    span: 9,
    notes: `编号 drone_scout。巡视无人机。自由飞行的农机，从无人机基站的坪面出击，不进入机库。

密封短舱，亚光金属，炭黑接缝，四旋翼。腹下探头用来发现病虫害。不带药罐，也不做处理。不是病虫处理无人机。

不做田边补喷。授粉、驱鸟、温度感知以后再说，这一阶段不做。

灯组：航行灯、探头。可关。1–4 仍是空闲、作业、选中、损坏。
空闲：停在落点上，旋翼不动，灯大约两成。
作业：离坪巡视，探头亮，绕一圈再落回原位。
选中：有选中圈，航行灯再抬一点。
损坏：探头灭，航行灯转红，机体停偏在落点上。`,
  },
  {
    id: 'drone_treat',
    cls: 'machine',
    name: '病虫处理无人机',
    size: '约 2.4 m',
    span: 10,
    notes: `编号 drone_treat。病虫处理无人机。自由飞行的农机，从无人机基站的坪面出击，不进入机库。

比巡视机略大。密封药舱在腹下，一支短喷头朝下，对当前已经发现的病虫害做点处理。不展开喷杆。发现仍由巡视无人机负责。

不做田边补喷。授粉、驱鸟、温度感知以后再说，这一阶段不做。

灯组：航行灯、处理灯。可关。1–4 仍是空闲、作业、选中、损坏。
空闲：停在落点上，旋翼不动，处理灯暗。
作业：离坪飞到处理点悬停，处理灯亮，然后落回原位。
选中：有选中圈。
损坏：处理灯灭，航行灯转红，机体停偏在落点上。`,
  },
  {
    id: 'impl_rotavator',
    cls: 'hitch',
    name: '旋耕机',
    size: '约 1.8 × 2.4 m',
    span: 12,
    notes: `编号 impl_rotavator。旋耕机。后挂，挂在通用拖拉机的三点悬挂上，自己不走。

罩壳盖住刀轴。亚光金属罩，不是农舍木架。

灯组：示廓灯。作业时刀轴转。损坏：示廓转红，刀轴停。`,
  },
  {
    id: 'impl_subsoiler',
    cls: 'hitch',
    name: '深松机',
    size: '约 2.2 × 3 m',
    span: 12,
    notes: `编号 impl_subsoiler。深松机。后挂。横梁下几支深松铲，铲尖低于其他后挂，读得出是往下松土，不是平地耙。

灯组：示廓灯。作业时整机轻轻起伏。损坏：示廓转红。`,
  },
  {
    id: 'impl_cultivator',
    cls: 'hitch',
    name: '中耕机',
    size: '约 1.8 × 3.6 m',
    span: 14,
    notes: `编号 impl_cultivator。中耕机。后挂。一排铲齿挂在横梁上。沙盒只摆这一副剪影，四种作业记在这里，不另做四台：
浅耕：铲齿浅。
除草：齿密，走行间。
培土：齿把土推向垄。
清垄：齿稀，把垄沟清开。

灯组：示廓灯。作业时横梁轻轻起伏。损坏：示廓转红。`,
  },
  {
    id: 'impl_fertilizer',
    cls: 'hitch',
    name: '施肥机',
    size: '约 2.4 × 3.2 m',
    span: 14,
    notes: `编号 impl_fertilizer。施肥机。后挂。料斗是封口金属仓，下方一排落肥管，仓下有撒肥盘。不是敞口木箱。

灯组：示廓灯、料位灯。作业时撒肥盘转，料位灯抬亮。损坏：料位灯灭，示廓转红。`,
  },
  {
    id: 'impl_sprayer',
    cls: 'hitch',
    name: '喷雾机',
    size: '约 3 × 8 m（展开）',
    span: 18,
    notes: `编号 impl_sprayer。喷雾机。后挂。药罐在中，两侧喷杆。空闲时喷杆折起，作业时展开。

不是轨道喷洒桁架。这一台跟在拖拉机后面。

灯组：示廓灯、喷头。作业时喷杆展开，喷头亮，表示在喷。损坏：喷杆折着，喷头灭，示廓转红。`,
  },
  {
    id: 'impl_seeder',
    cls: 'hitch',
    name: '条播机',
    size: '约 2.2 × 3.6 m',
    span: 14,
    notes: `编号 impl_seeder。条播机。后挂。种箱在上，下面是圆盘开沟器。

大豆圆盘：行距宽一点，盘径略大。
谷物圆盘：行距密，盘径略小。
沙盒共用这一副剪影，两种盘记在这里，不分成两台。

灯组：示廓灯。作业时圆盘转。损坏：示廓转红，圆盘停。`,
  },
  {
    id: 'impl_potato_planter',
    cls: 'hitch',
    name: '种薯播种机',
    size: '约 2.8 × 2.8 m',
    span: 14,
    notes: `编号 impl_potato_planter。种薯播种机。后挂，挂在拖拉机后面。种箱、开沟、覆土盘都在这一挂上。

不做自走种薯播种机。和移栽机也不是一台：这一台落的是种薯，不是苗盘。

灯组：示廓灯。作业时覆土盘转。损坏：示廓转红。`,
  },
  {
    id: 'impl_haulm',
    cls: 'hitch',
    name: '碎秧机',
    size: '约 1.6 × 2.6 m',
    span: 12,
    notes: `编号 impl_haulm。碎秧机。后挂甩刀罩，挂在拖拉机后面，把秧打碎。

不做自走杀秧机，也不做前挂产品线。目录里已有的杀秧机是旧剪影，这一台是后挂。

灯组：示廓灯。作业时甩刀转。损坏：示廓转红，甩刀停。`,
  },
  {
    id: 'impl_trailer',
    cls: 'hitch',
    name: '挂车',
    size: '约 6.5 × 2.4 m',
    span: 16,
    notes: `编号 impl_trailer。挂车。后挂牵引，拖杆在前。厢体是封口金属厢，亚光，不是木板车。

灯组：尾灯。作业时跟着牵引轻轻起伏。损坏：尾灯变红，厢体偏一点。`,
  },
  {
    id: 'impl_bedder',
    cls: 'hitch',
    name: '起垄机',
    size: '约 2 × 2.8 m',
    span: 12,
    notes: `编号 impl_bedder。起垄机。后挂。两只成形罩把土收成垄床。读得出是做床，不是中耕那一排齿。

灯组：示廓灯。作业时成形罩轻轻起伏。损坏：示廓转红。`,
  },
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
  {
    id: 'device_drone_base',
    cls: 'equip',
    name: '无人机基站',
    size: '约 8.4 × 5.6 m',
    span: 20,
    notes: `编号 device_drone_base。无人机基站。可建造、可购买的展开坪站，放在地表。不是培育层设备，也不是中枢机库。

坪是一块低矮的密封金属台，底下有撬座，亚光壳体，炭黑接缝。一端是封口的勤务柜和信标桅。没有机库门，也没有能把无人机收进去的舱。巡视无人机和病虫处理无人机停在坪面的两个落点上，从这里出击，做完落回原位，不进入机库。

不做田边补喷。授粉、驱鸟、温度感知以后再说，这一阶段不做。

灯组：坪灯、信标。可关。1–4 仍是空闲、作业、选中、损坏。
空闲：两架停在落点上，灯大约两成。
作业：两架离坪出击，巡视的绕飞，处理的到点悬停，然后都落回。坪灯和信标抬亮。
选中：有选中圈。
损坏：信标变红，勤务柜偏一点，两架都停在坪上，不起飞。`,
  },
  { id: 'arm', cls: 'rail', name: '收获臂', size: '沿槽排', span: 42, notes: '龙门臂。沿轨道走，作业时探向槽。' },
  { id: 'irrigator', cls: 'rail', name: '喷灌桁架', size: '跨 124 m', span: 140, notes: '沿田块往返的桁架。' },
  {
    id: 'orbit_boom',
    cls: 'rail',
    name: '轨道喷洒桁架',
    size: '轨 32 m · 桁架 14 m',
    span: 44,
    notes: `编号 orbit_boom。轨道喷洒桁架。车厢封在轨道上，桁架伸出一排喷嘴。药罐在车厢上。

不是田里那座喷灌桁架，也不是拖拉机后挂的喷雾机。沿轨道走，不在土里开。

灯组：桁架灯、喷头。可关。1–4 仍是空闲、作业、选中、损坏。
空闲：车厢停在轨中，喷头暗。
作业：车厢沿轨走，喷头亮。
选中：有选中圈。
损坏：车厢停偏，喷头灭，桁架灯转红。`,
  },
];
