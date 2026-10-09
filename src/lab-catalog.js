// 资产工坊目录。只有名字和分类，不进主进度存档。
export const LAB_CLASSES = [
  { id: 'unit', label: '单元' },
  { id: 'machine', label: '农机' },
  { id: 'equip', label: '设备' },
  { id: 'rail', label: '轨道设备' },
];

// span：沙盒里把镜头框住的边长（米）。和游戏里的模数一致，只用于取景。
export const LAB_ENTRIES = [
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
