// 可玩页读工坊存下的田间阶段。解析只走 parseFieldStageDoc，钟和派工仍是土豆 B 那条。
// 大豆、大麦、甘蓝不从这份存储里换表。
//
// 工坊「保存」写入 localStorage `ringsheaf.assetlab.fieldStages.v1`，形状是
// `{ schema, cropId, crops: { potato: doc } }`。工坊「下载」是单份 doc。
// 同一来源（本地服务器上同时打开 asset-lab.html 和 index.html）两页共用这把钥匙。
// file:// 在 Chrome 里每个文件各算一个来源，两页的 localStorage 互不可见。
// 那种打开方式用管理里的粘贴或导入文件，或地址栏 `?stages=repo` 强制仓库默认。
import { FIELD_STAGE_SCHEMA, FIELD_STAGE_STORE } from './field-stages.js';
import { cropDef, installPotatoProfile, potatoProfileFromRaw, shippedPotatoProfile } from './surface-crops.js';

export { FIELD_STAGE_STORE };

function isPotatoDoc(doc, key) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  const id = String(doc.cropId || key || '');
  const logic = String(doc.logicId || '');
  return id === 'potato' || id === 'crop_potato' || logic === 'crop_potato' || logic === 'potato';
}

export function potatoDocFromPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.crops && typeof raw.crops === 'object' && !Array.isArray(raw.crops)) {
    for (const [key, doc] of Object.entries(raw.crops)) {
      if (isPotatoDoc(doc, key)) return doc;
    }
    return null;
  }
  if (Array.isArray(raw.stages) && isPotatoDoc(raw, raw.cropId)) return raw;
  return null;
}

export function applyStagePayload(raw) {
  const doc = potatoDocFromPayload(raw);
  if (!doc) return { ok: false, reason: 'empty' };
  let profile;
  try { profile = potatoProfileFromRaw(doc); }
  catch (err) { return { ok: false, reason: 'parse', message: err.message || '这份田间配置读不了' }; }
  installPotatoProfile(profile, 'workshop');
  return { ok: true, origin: 'workshop', maturity: profile.maturity, rotAt: profile.rotAt, doc };
}

export function revertPotatoStages() {
  const profile = shippedPotatoProfile();
  installPotatoProfile(profile, 'repo');
  return { ok: true, origin: 'repo', maturity: profile.maturity, rotAt: profile.rotAt };
}

export function stageBadge() {
  return cropDef('potato')?.stageOrigin === 'workshop' ? '工坊覆写' : '仓库默认';
}

export function readStageStore(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FIELD_STAGE_STORE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeStageStore(storage, doc) {
  let crops = {};
  const prev = readStageStore(storage);
  if (prev?.crops && typeof prev.crops === 'object') crops = { ...prev.crops };
  crops.potato = doc;
  const payload = { schema: FIELD_STAGE_SCHEMA, cropId: 'potato', crops };
  storage.setItem(FIELD_STAGE_STORE, JSON.stringify(payload));
  return payload;
}

export function forgetPotatoStage(storage) {
  if (!storage) return;
  const prev = readStageStore(storage);
  if (!prev?.crops) {
    try { storage.removeItem(FIELD_STAGE_STORE); } catch { /* 空浏览器 */ }
    return;
  }
  delete prev.crops.potato;
  delete prev.crops.crop_potato;
  const left = Object.keys(prev.crops);
  if (!left.length) {
    try { storage.removeItem(FIELD_STAGE_STORE); } catch { /* 空浏览器 */ }
    return;
  }
  prev.cropId = left[0];
  storage.setItem(FIELD_STAGE_STORE, JSON.stringify(prev));
}

// stagesParam 为 repo 时忽略浏览器里的工坊存档。其余值留给地址栏上的 JSON 地址，由页面自己去取。
export function bootFieldStageSource(storage, stagesParam) {
  if (stagesParam === 'repo') return { ok: true, origin: 'repo', skipped: true };
  const payload = readStageStore(storage);
  if (!payload) return { ok: true, origin: 'repo', skipped: true };
  const applied = applyStagePayload(payload);
  if (!applied.ok) return { ...applied, origin: cropDef('potato')?.stageOrigin === 'workshop' ? 'workshop' : 'repo' };
  return applied;
}
