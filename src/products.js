// 环穗 · 产品与配方。商店价、牌价、加工和抵扣都读这里，玩法里不再各写一份。
// 土豆牌价 29701 = round(1.6384 ha × 44000 L/ha × 412 / 1000)，和田块 quote 是同一个数。

export const PRODUCTS = [
  { id: 'potato', nameZh: '土豆', tier: 1, tag: '商品', sellPrice: 29701, buyPrice: null, unit: 'L' },
  { id: 'seed', nameZh: '种薯', tier: 1, tag: '投入品', sellPrice: null, buyPrice: 1800, shop: true, unit: '份' },
  { id: 'fertilizer', nameZh: '肥料', tier: 1, tag: '投入品', sellPrice: null, buyPrice: 900, shop: true, unit: '份' },
  { id: 'water', nameZh: '水', tier: 1, tag: '投入品', sellPrice: null, buyPrice: null, utility: true, unit: '记' },
  { id: 'power', nameZh: '电', tier: 1, tag: '投入品', sellPrice: null, buyPrice: null, utility: true, unit: '记' },
  { id: 'starch', nameZh: '土豆淀粉', tier: 2, tag: '商品', sellPrice: 4800, buyPrice: null, unit: 'kg' },
  { id: 'peel', nameZh: '土豆皮', tier: 2, tag: '中间体', sellPrice: null, buyPrice: null, unit: '份' },
  { id: 'feed', nameZh: '有机质饲料', shopName: '饲料', tier: 1, tag: '投入品', sellPrice: null, buyPrice: 800, shop: true, unit: '份' },
  { id: 'grub', nameZh: '蛴螬', tier: 2, tag: '商品', sellPrice: 2600, buyPrice: null, lotKg: 180, unit: 'kg' },
  { id: 'frass', nameZh: '虫粪沙', tier: 2, tag: '中间体', sellPrice: null, buyPrice: null, unit: '份' },
  { id: 'media', nameZh: '虫卵/培养基', tier: 1, tag: '投入品', sellPrice: null, buyPrice: null, note: '本切片不另收费，开槽仍只耗饲料', unit: '份' },
  { id: 'bsf', nameZh: '黑水虻', tier: 2, tag: '商品', sellPrice: 1400, buyPrice: null, lotKg: 420, unit: 'kg', flow: false },
];

export const LOOP_OFFSETS = {
  peelToFeed: {
    id: 'peelToFeed',
    from: 'peel',
    to: 'feed',
    maxFraction: 0.4,
    peelPerFullOffset: 4,
    note: '土豆皮最多抵四成饲料，其余仍买饲料',
  },
  frassToFert: {
    id: 'frassToFert',
    from: 'frass',
    to: 'fertilizer',
    maxFraction: 0.5,
    frassPerFullOffset: 1,
    note: '虫粪沙最多抵一半肥料，不能把肥料买成零',
  },
};

export const RECIPES = [
  {
    id: 'potato-field',
    nameZh: '商品薯一茬',
    device: 'field',
    timeDays: 120,
    stub: true,
    utilities: { water: 40 },
    inputs: [
      { id: 'seed', qty: 1 },
      { id: 'fertilizer', qty: 1 },
    ],
    outputs: [{ id: 'potato', qty: 1, unit: '仓批' }],
    offsets: ['frassToFert'],
  },
  {
    id: 'starch-mill',
    nameZh: '土豆制淀粉',
    device: 'mill',
    timeDays: 2,
    utilities: { water: 150, power: 150 },
    inputs: [{ id: 'potato', qty: 18000, unit: 'L' }],
    outputs: [
      { id: 'starch', qty: 4000, unit: 'kg' },
      { id: 'peel', qty: 4, unit: '份' },
    ],
  },
  {
    id: 'grub-culture',
    nameZh: '蛴螬培养',
    device: 'grub-tank',
    timeDays: 65,
    utilities: { water: 80, power: 80 },
    inputs: [{ id: 'feed', qty: 1 }],
    outputs: [
      { id: 'grub', qty: 180, unit: 'kg' },
      { id: 'frass', qty: 1, unit: '份' },
    ],
    offsets: ['peelToFeed'],
  },
];

export const DEVICES = [
  {
    id: 'mill',
    nameZh: '加工厂',
    layer: 'grow',
    hub: false,
    buildCost: 6000,
    buildDays: 3,
    recipe: 'starch-mill',
  },
];

export function productById(id) {
  return PRODUCTS.find(p => p.id === id) || null;
}
export function recipeById(id) {
  return RECIPES.find(r => r.id === id) || null;
}
export function deviceById(id) {
  return DEVICES.find(d => d.id === id) || null;
}
export function shopRows() {
  return PRODUCTS.filter(p => p.shop).map(p => ({ id: p.id, name: p.shopName || p.nameZh, price: p.buyPrice }));
}
export function utilityCost(utilities) {
  if (!utilities) return 0;
  let n = 0;
  for (const k of Object.keys(utilities)) n += +utilities[k] || 0;
  return n;
}
function chip(row) {
  const p = productById(row.id);
  return {
    id: row.id,
    nameZh: p ? p.nameZh : row.id,
    qty: row.qty,
    unit: row.unit || p?.unit || '',
    sellPrice: p?.sellPrice ?? null,
    buyPrice: p?.buyPrice ?? null,
    tag: p?.tag || '',
    note: p?.note || '',
  };
}
export function flowModel() {
  const stages = RECIPES.map(recipe => ({
    id: recipe.id,
    nameZh: recipe.nameZh,
    timeDays: recipe.timeDays,
    stub: !!recipe.stub,
    utilities: { ...recipe.utilities },
    utilityCost: utilityCost(recipe.utilities),
    inputs: recipe.inputs.map(chip),
    outputs: recipe.outputs.map(chip),
    offsets: (recipe.offsets || []).map(id => LOOP_OFFSETS[id]).filter(Boolean),
    device: deviceById(recipe.device),
  }));
  return {
    products: PRODUCTS.filter(p => p.flow !== false),
    stages,
    offsets: Object.values(LOOP_OFFSETS),
    devices: DEVICES,
  };
}
