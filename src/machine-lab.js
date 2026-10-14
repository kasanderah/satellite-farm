// 农机编辑器 v1。只存在工坊这台浏览器，钥匙 ringsheaf.assetlab.machines.v1。
// 主游戏本轮不读这份，种植和派单仍用原来的机具表。
// 占位外形用 refs/machines 里已有的低模（Kenney、Pixor 和现用剪影）。
// 正式模型以后向「环穗资产」要新下载再接入。结构见 docs/machine-lab-v1.md。
import { OP_MACHINE_CHOICES } from './field-stages.js';
import { MACHINE_CAP_BY_ID, IMPLEMENTS, DEFAULT_WORK_WIDTH, lanesForWidth } from './surface-crops.js';

export const MACHINE_LAB_KEY = 'ringsheaf.assetlab.machines.v1';
export const MACHINE_LAB_KIND = 'ringsheaf.assetlab.machines';
export const MACHINE_LAB_VERSION = 1;
export const PREVIEW_FIELD_M = 128;

export const MACHINE_ROLES = [
  ['tractor', '拖拉机'],
  ['implement', '挂具'],
  ['self', '一体机'],
];

const ROLE_IDS = new Set(MACHINE_ROLES.map(([id]) => id));
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,48}$/;

// 工序下拉里的 machine id，加上调度用的 cap。编辑器只认这一份。
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
  const source = raw && raw.source === 'file' ? 'file' : 'placeholder';
  const fileName = String(raw && raw.fileName || '').split(/[\\/]/).pop().slice(0, 180);
  return { source, fileName: source === 'file' ? fileName : '' };
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

export function normalizeMachine(raw, fallbackId = 'rig1') {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = isMachineId(src.id) ? String(src.id) : (isMachineId(fallbackId) ? fallbackId : 'rig1');
  const role = ROLE_IDS.has(src.role) ? src.role : 'implement';
  const tags = cleanTags(src.tags);
  const name = String(src.name || '').trim().slice(0, 48) || id;
  const knownWidth = IMPLEMENTS[id]?.workWidth;
  return {
    id,
    name,
    role,
    tags,
    caps: capsForTags(tags),
    workWidth: clamp(src.workWidth, 0.4, 64, knownWidth || DEFAULT_WORK_WIDTH),
    speed: clamp(src.speed, 0.2, 40, 10),
    power: clamp(src.power, 0, 2000, 0),
    hitch: cleanHook(src.hitch),
    bin: cleanBin(src.bin),
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
  copy.model = { source: 'placeholder', fileName: '' };
  return copy;
}

export function renameMachine(machine, name) {
  const next = String(name || '').trim();
  if (!next) return machine;
  machine.name = next.slice(0, 48);
  return machine;
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
  const lanes = lanesForWidth(width, length);
  return { field: length, width, lanes, lane: length / lanes };
}
