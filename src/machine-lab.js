// 农机编辑器 v2。钥匙仍是 ringsheaf.assetlab.machines.v1。
// 一台农机有多个模式。每个模式选一个功能，再记功率、作业宽度、作业速度、仓容。
// 勾上同步属性时，这一项在该农机的所有模式里是同一个数。
// 可玩页开局读这份：按机具 id 盖宽度、速度和仓容，空档或坏档则继续用内置机具表。能力不收窄。
// 结构见 docs/machine-lab-v1.md。v1 的平铺字段读进来时收成一个模式。
import { OP_MACHINE_CHOICES } from './field-stages.js';
import { MACHINE_CAP_BY_ID, IMPLEMENTS, DEFAULT_WORK_WIDTH, lanesForWidth } from './surface-crops.js';

export const MACHINE_LAB_KEY = 'ringsheaf.assetlab.machines.v1';
export const MACHINE_LAB_KIND = 'ringsheaf.assetlab.machines';
export const MACHINE_LAB_VERSION = 2;
export const PREVIEW_FIELD_M = 128;

export const MACHINE_ROLES = [
  ['tractor', '拖拉机'],
  ['implement', '挂具'],
  ['self', '一体机'],
];

export const SYNC_KEYS = ['power', 'workWidth', 'speed', 'bin'];

// 只有这些功能带特有项。没列在这里的功能，模式里只显示通用属性。
export const FUNCTION_EXTRAS = {
  impl_cultivator: [{ id: 'style', name: '中耕方式', options: [['shallow', '浅耕'], ['weed', '除草'], ['hill', '培土'], ['residue', '碎秆']] }],
  impl_seeder: [{ id: 'disc', name: '排种盘', options: [['bean', '豆'], ['grain', '谷']] }],
  impl_sprayer: [{ id: 'mix', name: '药液', options: [['field', '大田']] }],
  harvester_combine: [{ id: 'header', name: '收获作物', options: [['bean', '豆'], ['grain', '谷']] }],
  drone_treat: [{ id: 'load', name: '药剂', options: [['pest', '植保']] }],
};

// 工坊和主游戏已经在用的剪影，加上 refs/machines 里的占位 glb。编辑器只记 id，不把字节写进存档。
export const PLACEHOLDER_LIBRARY = [
  { id: 'tractor_gen', name: '现用 · 拖拉机' },
  { id: 'harvester_combine', name: '现用 · 联合收割' },
  { id: 'harvester_potato', name: '现用 · 薯收获' },
  { id: 'harvester_cabbage', name: '现用 · 结球收获' },
  { id: 'transplanter', name: '现用 · 移栽' },
  { id: 'impl_potato_planter', name: '现用 · 薯播' },
  { id: 'impl_seeder', name: '现用 · 条播' },
  { id: 'impl_cultivator', name: '现用 · 中耕' },
  { id: 'impl_sprayer', name: '现用 · 喷雾' },
  { id: 'impl_fertilizer', name: '现用 · 施肥' },
  { id: 'impl_haulm', name: '现用 · 杀秧' },
  { id: 'impl_rotavator', name: '现用 · 旋耕' },
  { id: 'impl_subsoiler', name: '现用 · 深松' },
  { id: 'impl_bedder', name: '现用 · 起垄' },
  { id: 'impl_trailer', name: '现用 · 挂车' },
  { id: 'kenney-tractor', name: 'Kenney 拖拉机', file: 'kenney-tractor.glb' },
  { id: 'kenney-tractor-shovel', name: 'Kenney 铲', file: 'kenney-tractor-shovel.glb' },
  { id: 'pixor-library-tractor', name: 'Pixor 拖拉机', file: 'pixor-library-tractor.glb' },
  { id: 'low-poly-combine-harvestors', name: 'Sketchfab 收割机包', file: 'low-poly-combine-harvestors.glb' },
];

const ROLE_IDS = new Set(MACHINE_ROLES.map(([id]) => id));
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,48}$/;
const LIBRARY_IDS = new Set(PLACEHOLDER_LIBRARY.map(row => row.id));

export const MACHINE_TAGS = OP_MACHINE_CHOICES.map(([id, name]) => ({
  id,
  name,
  cap: MACHINE_CAP_BY_ID[id] || null,
}));
const TAG_IDS = new Set(MACHINE_TAGS.map(tag => tag.id));
const CAP_IDS = new Set(MACHINE_TAGS.map(tag => tag.cap).filter(Boolean));

export function isMachineId(id) {
  return ID_RE.test(String(id || ''));
}

export function allocateMachineId(ids) {
  const used = new Set(ids);
  let n = 1;
  while (used.has(`rig${n}`)) n += 1;
  return `rig${n}`;
}

export function machineOptionLabel(machine) {
  const name = String(machine?.name || machine?.id || '').trim() || machine?.id || '';
  return `${name} · ${machine?.id || ''}`;
}

export function functionExtras(fn) {
  return FUNCTION_EXTRAS[fn] || [];
}

function clamp(n, lo, hi, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

function cleanTags(raw) {
  const out = [];
  const seen = new Set();
  for (const tag of Array.isArray(raw) ? raw : []) {
    const id = String(tag || '');
    if (!TAG_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function capsForTags(tags) {
  const out = [];
  const seen = new Set();
  for (const tag of tags) {
    const cap = MACHINE_CAP_BY_ID[tag];
    if (!cap || !CAP_IDS.has(cap) || seen.has(cap)) continue;
    seen.add(cap);
    out.push(cap);
  }
  return out;
}

function cleanModel(raw) {
  const asked = raw && (raw.source === 'file' || raw.source === 'library') ? raw.source : 'placeholder';
  const fileName = String(raw && raw.fileName || '').split(/[\\/]/).pop().slice(0, 180);
  const libraryId = String(raw && raw.libraryId || '');
  if (asked === 'library' && LIBRARY_IDS.has(libraryId)) {
    return { source: 'library', fileName: '', libraryId };
  }
  if (asked === 'file') return { source: 'file', fileName, libraryId: '' };
  return { source: 'placeholder', fileName: '', libraryId: '' };
}

function cleanHook(raw) {
  if (raw == null || raw === '') return null;
  const text = String(raw).trim().slice(0, 48);
  return text || null;
}

function cleanBin(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(1e6, Math.round(n * 10) / 10);
}

function cleanExtra(fn, raw) {
  const spec = functionExtras(fn);
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const field of spec) {
    const ids = new Set(field.options.map(([id]) => id));
    out[field.id] = ids.has(src[field.id]) ? src[field.id] : field.options[0][0];
  }
  return out;
}

function cleanMode(raw, index, fallback) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const base = fallback || {};
  const fn = TAG_IDS.has(src.fn) ? src.fn : '';
  const knownWidth = fn && IMPLEMENTS[fn]?.workWidth;
  return {
    id: `m${index + 1}`,
    fn,
    power: clamp(src.power != null ? src.power : base.power, 0, 2000, 0),
    workWidth: clamp(src.workWidth != null ? src.workWidth : base.workWidth, 0.4, 64, knownWidth || DEFAULT_WORK_WIDTH),
    speed: clamp(src.speed != null ? src.speed : base.speed, 0.2, 40, 10),
    bin: cleanBin(src.bin != null ? src.bin : base.bin),
    extra: cleanExtra(fn, src.extra),
  };
}

function modesFromRaw(src) {
  const flat = {
    power: src.power,
    workWidth: src.workWidth,
    speed: src.speed,
    bin: src.bin,
  };
  if (Array.isArray(src.modes) && src.modes.length) {
    return src.modes.map((mode, i) => cleanMode(mode, i, flat));
  }
  const tags = cleanTags(src.tags);
  const seeds = tags.length ? tags.map(fn => ({ ...flat, fn })) : [{ ...flat, fn: '' }];
  return seeds.map((mode, i) => cleanMode(mode, i, flat));
}

function cleanSync(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of SYNC_KEYS) out[key] = src[key] === true;
  return out;
}

function applySync(modes, sync) {
  const first = modes[0];
  for (const key of SYNC_KEYS) {
    if (!sync[key]) continue;
    for (const mode of modes) mode[key] = first[key];
  }
}

export function normalizeMachine(raw, fallbackId = 'rig1') {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = isMachineId(src.id) ? String(src.id) : (isMachineId(fallbackId) ? fallbackId : 'rig1');
  const role = ROLE_IDS.has(src.role) ? src.role : 'implement';
  const modes = modesFromRaw(src);
  const sync = cleanSync(src.sync);
  applySync(modes, sync);
  const tags = cleanTags(modes.map(mode => mode.fn));
  const name = String(src.name || '').trim().slice(0, 48) || id;
  const head = modes[0];
  return {
    id,
    name,
    role,
    tags,
    caps: capsForTags(tags),
    workWidth: head.workWidth,
    speed: head.speed,
    power: head.power,
    hitch: cleanHook(src.hitch),
    bin: head.bin,
    sync,
    modes,
    model: cleanModel(src.model),
  };
}

function blank(id, name, role, tags, workWidth, speed, power) {
  return normalizeMachine({ id, name, role, tags, workWidth, speed, power, model: { source: 'placeholder' } });
}

export function defaultMachines() {
  return [
    blank('tractor_gen', '拖拉机', 'tractor', [], 12.8, 10, 75),
    blank('impl_cultivator', '中耕', 'implement', ['impl_cultivator'], IMPLEMENTS.impl_cultivator.workWidth, 10, 40),
    blank('impl_potato_planter', '薯播', 'implement', ['impl_potato_planter'], IMPLEMENTS.impl_potato_planter.workWidth, 10, 45),
    blank('harvester_potato', '薯收获', 'self', ['harvester_potato'], 12.8, 10, 120),
  ];
}

export function forkMachine(source, id) {
  const copy = normalizeMachine(source, id);
  copy.id = id;
  const base = String(source?.name || source?.id || id);
  copy.name = base.endsWith('副本') ? base : `${base} 副本`;
  copy.model = { source: 'placeholder', fileName: '', libraryId: '' };
  return copy;
}

export function renameMachine(machine, name) {
  const next = String(name || '').trim();
  if (!next) return machine;
  machine.name = next.slice(0, 48);
  return machine;
}

export function dropMachine(list, id) {
  return (Array.isArray(list) ? list : []).filter(item => item && item.id !== id);
}

function indexMachines(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const machine = normalizeMachine(raw);
    if (seen.has(machine.id)) continue;
    seen.add(machine.id);
    out.push(machine);
  }
  return out;
}

export function libraryFromUnknown(raw) {
  if (raw == null) return { ok: false, machines: [], message: '没有农机存档' };
  if (Array.isArray(raw)) return { ok: true, machines: indexMachines(raw), message: '' };
  if (typeof raw !== 'object') return { ok: false, machines: [], message: '农机存档不是 JSON 对象' };
  if (raw.version != null && Number(raw.version) > MACHINE_LAB_VERSION) {
    return { ok: false, machines: [], message: '农机存档版本比这个工坊新' };
  }
  if (!Array.isArray(raw.machines)) return { ok: false, machines: [], message: '农机存档里没有 machines' };
  return { ok: true, machines: indexMachines(raw.machines), message: '' };
}

export function machineEnvelope(list) {
  return {
    kind: MACHINE_LAB_KIND,
    version: MACHINE_LAB_VERSION,
    machines: indexMachines(list),
  };
}

export function passPreview(workWidth, field = PREVIEW_FIELD_M) {
  const width = clamp(workWidth, 0.4, 64, DEFAULT_WORK_WIDTH);
  const length = field > 0 ? field : PREVIEW_FIELD_M;
  return { field: length, width, lanes: lanesForWidth(width, length), lane: length / lanesForWidth(width, length) };
}
