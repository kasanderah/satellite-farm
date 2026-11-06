// 手动作业。和阶段链上的软作业分开：玩家点了才进队，不看生长窗。
// 工坊可改，主游戏读 id=irrigate 的那一条来做喷灌。

export const MANUAL_JOB_STORE = 'ringsheaf.assetlab.manualJobs.v1';

export const MANUAL_EFFECTS = [
  { id: 'moisture', name: '含水率', unit: '%' },
];

export const MANUAL_MACHINES = [
  { id: 'truss', name: '喷灌桁架' },
  { id: 'omni', name: '万能农机' },
];

export function defaultManualJobs() {
  return [{
    id: 'irrigate',
    name: '喷灌',
    machines: ['truss', 'omni'],
    effect: 'moisture',
    delta: 8,
    stock: '',
    stockNeed: 0,
    note: '不论田面和生长阶段。做完含水率上升。窗内能派出去的撒药、追肥先做。',
  }];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function normalizeManualJobs(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of list) {
    const id = String(row?.id || '').trim().slice(0, 24);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const machines = Array.isArray(row.machines)
      ? row.machines.map(item => String(item)).filter(item => item === 'truss' || item === 'omni')
      : ['truss', 'omni'];
    out.push({
      id,
      name: String(row?.name || id).trim().slice(0, 16) || id,
      machines: machines.length ? machines : ['omni'],
      effect: row?.effect === 'moisture' ? 'moisture' : 'moisture',
      delta: clamp(Number(row?.delta) || 0, -40, 40),
      stock: String(row?.stock || '').trim().slice(0, 16),
      stockNeed: clamp(Math.round(Number(row?.stockNeed) || 0), 0, 99),
      note: String(row?.note || '').trim().slice(0, 80),
    });
  }
  if (!out.some(job => job.id === 'irrigate')) out.unshift(defaultManualJobs()[0]);
  return out.slice(0, 12);
}

export function readManualJobs(storage) {
  try {
    const text = storage?.getItem?.(MANUAL_JOB_STORE);
    if (!text) return defaultManualJobs();
    return normalizeManualJobs(JSON.parse(text));
  } catch {
    return defaultManualJobs();
  }
}

export function writeManualJobs(storage, jobs) {
  const next = normalizeManualJobs(jobs);
  storage?.setItem?.(MANUAL_JOB_STORE, JSON.stringify(next));
  live = next;
  return next;
}

let live = null;

export function bootManualJobs(storage) {
  live = readManualJobs(storage);
  return live;
}

export function manualJobs() {
  return live || defaultManualJobs();
}

export function manualJob(id) {
  return manualJobs().find(job => job.id === id) || null;
}

export function moistureDelta(id = 'irrigate') {
  const job = manualJob(id);
  const n = Number(job?.delta);
  return Number.isFinite(n) ? n : 8;
}
