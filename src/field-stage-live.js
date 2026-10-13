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
  const keyId = String(key || '');
  const id = String(doc.cropId || '');
  const logic = String(doc.logicId || '');
  const profile = String(doc.profile || '');
  // 显示名有时被写进 cropId。钥匙或 profile 仍是土豆时要认下来。
  if (keyId === 'potato' || keyId === 'crop_potato') return true;
  if (id === 'potato' || id === 'crop_potato') return true;
  if (logic === 'crop_potato' || logic === 'potato') return true;
  if (profile === 'potato-b') return true;
  return false;
}

function payloadNote(raw) {
  if (typeof raw === 'string') return '工坊存档多包了一层字符串';
  if (!raw || typeof raw !== 'object') return '工坊存档不是对象';
  if (raw.crops && typeof raw.crops === 'object' && !Array.isArray(raw.crops)) {
    const found = Object.entries(raw.crops).map(([key, doc]) => {
      if (!doc || typeof doc !== 'object') return key;
      return key + ':' + (doc.cropId || doc.logicId || doc.profile || '无 id');
    });
    return '工坊存档里没有土豆。看到 ' + (found.join('、') || '空表');
  }
  if (Array.isArray(raw.stages)) {
    return '这份田间配置认不出土豆。cropId=' + (raw.cropId || '空') + ' logicId=' + (raw.logicId || '空') + ' profile=' + (raw.profile || '空');
  }
  return '工坊存档里没有 crops，也没有 stages';
}

export function potatoDocFromPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.crops && typeof raw.crops === 'object' && !Array.isArray(raw.crops)) {
    for (const [key, doc] of Object.entries(raw.crops)) {
      if (doc && typeof doc === 'object' && doc.crops && !Array.isArray(doc.stages)) {
        const inner = potatoDocFromPayload(doc);
        if (inner) return inner;
      }
      if (isPotatoDoc(doc, key)) return doc;
    }
    return null;
  }
  if (Array.isArray(raw.stages) && isPotatoDoc(raw, raw.cropId)) return raw;
  return null;
}

export function applyStagePayload(raw) {
  const doc = potatoDocFromPayload(raw);
  if (!doc) return { ok: false, reason: 'empty', message: payloadNote(raw) };
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

function unwrapStore(parsed) {
  let value = parsed;
  for (let i = 0; i < 2 && typeof value === 'string'; i++) value = JSON.parse(value);
  return value;
}

export function readStageStore(storage) {
  if (!storage) return null;
  let raw;
  try { raw = storage.getItem(FIELD_STAGE_STORE); }
  catch { return null; }
  if (!raw) return null;
  try { return unwrapStore(JSON.parse(raw)); }
  catch (err) { return { __parseError: err.message || 'JSON 读不了' }; }
}

export function writeStageStore(storage, doc) {
  let crops = {};
  const prev = readStageStore(storage);
  if (prev?.crops && typeof prev.crops === 'object' && !prev.__parseError) crops = { ...prev.crops };
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
  if (payload.__parseError) return { ok: false, reason: 'json', message: '工坊存档不是 JSON：' + payload.__parseError };
  const applied = applyStagePayload(payload);
  if (!applied.ok) return { ...applied, origin: cropDef('potato')?.stageOrigin === 'workshop' ? 'workshop' : 'repo' };
  return applied;
}
