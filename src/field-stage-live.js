// 可玩页读工坊存下的田间阶段。解析和派工都走同一份编译：阶段对齐，作业窗口。
// 土豆、大豆、饲料大麦、结球甘蓝都能从这里换表。土豆没有工坊档时用仓库里的土豆B。其余作物留占位链。
//
// 工坊「保存」写入 localStorage `ringsheaf.assetlab.fieldStages.v1`，形状是
// `{ schema, cropId, crops: { potato: doc } }`。工坊「下载」是单份 doc。
// 同一来源（本地服务器上同时打开 asset-lab.html 和 index.html）两页共用这把钥匙。
// file:// 在 Chrome 里每个文件各算一个来源，两页的 localStorage 互不可见。
// 那种打开方式用管理里的粘贴或导入文件，或地址栏 `?stages=repo` 强制仓库默认。
import { FIELD_STAGE_SCHEMA, FIELD_STAGE_STORE } from './field-stages.js';
import { cropDef, installPotatoProfile, potatoProfileFromRaw, shippedPotatoProfile, surfaceProfileFromRaw, installSurfaceProfile } from './surface-crops.js';
import potatoBRaw from '../data/field-stages/potato-b.json' with { type: 'json' };
import { installLastikaDoc, installShippedLastika } from './lastika-stage.js';

export { FIELD_STAGE_STORE };

function isPotatoDoc(doc, key) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  const keyId = String(key || '');
  const id = String(doc.cropId || '');
  const logic = String(doc.logicId || '');
  const profile = String(doc.profile || '');
  // 信封钥匙是土豆槽时认下来，哪怕 cropId 曾被写成显示名。
  if (keyId === 'potato' || keyId === 'crop_potato') return true;
  if (id === 'potato' || id === 'crop_potato') return true;
  // 单份下载没有库钥匙。工坊里另起的作物即使复制过土豆档案，也不能靠 profile / logicId 顶替土豆槽。
  if (!keyId && (logic === 'crop_potato' || logic === 'potato' || profile === 'potato-b')) return true;
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
    const slotted = raw.crops.potato || raw.crops.crop_potato;
    if (slotted && typeof slotted === 'object' && Array.isArray(slotted.stages)) return slotted;
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

const SURFACE_IDS = ['soy', 'feed_barley', 'cabbage'];

export function applyStoredCrops(raw) {
  const notes = [];
  const crops = raw?.crops;
  if (!crops || typeof crops !== 'object' || Array.isArray(crops)) return notes;
  for (const id of SURFACE_IDS) {
    const doc = crops[id];
    if (!doc || !Array.isArray(doc.stages)) continue;
    try {
      installSurfaceProfile(id, surfaceProfileFromRaw(id, doc), 'workshop');
    } catch (err) {
      notes.push((doc.cropName || id) + '：' + (err.message || '读不了'));
    }
  }
  return notes;
}

export function applyStagePayload(raw) {
  const siblingNotes = applyStoredCrops(raw);
  const doc = potatoDocFromPayload(raw);
  if (!doc) return { ok: false, reason: 'empty', message: payloadNote(raw), siblingNotes };
  let profile;
  try { profile = potatoProfileFromRaw(doc); }
  catch (err) { return { ok: false, reason: 'parse', message: err.message || '这份田间配置读不了', siblingNotes }; }
  installPotatoProfile(profile, 'workshop');
  return { ok: true, origin: 'workshop', maturity: profile.maturity, rotAt: profile.rotAt, doc, siblingNotes };
}

export function revertPotatoStages() {
  const profile = shippedPotatoProfile();
  installPotatoProfile(profile, 'repo');
  return { ok: true, origin: 'repo', maturity: profile.maturity, rotAt: profile.rotAt };
}

// 可玩页的仓库默认是土豆B，不是四作物共用的占位链。占位链仍由 revertPotatoStages 装回。
export function installShippedPotato() {
  const profile = potatoProfileFromRaw(structuredClone(potatoBRaw));
  installPotatoProfile(profile, 'repo');
  return { ok: true, origin: 'repo', maturity: profile.maturity, rotAt: profile.rotAt, profile: profile.profile };
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

function potatoSlot(payload) {
  const crops = payload?.crops;
  if (!crops || typeof crops !== 'object' || Array.isArray(crops)) return null;
  const slot = crops.potato || crops.crop_potato;
  if (slot && typeof slot === 'object' && Array.isArray(slot.stages)) return slot;
  return null;
}

// 土豆档丢了时，用上次成功读到的副本填回 potato 槽。custom1 不能来顶这个槽。
function reinstatePotato(payload) {
  if (potatoSlot(payload)) return false;
  const keep = payload?.potatoKeep;
  if (!keep || typeof keep !== 'object' || !Array.isArray(keep.stages)) return false;
  if (!payload.crops || typeof payload.crops !== 'object' || Array.isArray(payload.crops)) payload.crops = {};
  payload.crops.potato = keep;
  return true;
}

function rememberPotato(storage, doc) {
  if (!storage || !doc || !Array.isArray(doc.stages)) return;
  const prev = readStageStore(storage);
  if (!prev || prev.__parseError) return;
  if (!prev.crops || typeof prev.crops !== 'object' || Array.isArray(prev.crops)) prev.crops = {};
  prev.potatoKeep = doc;
  if (!potatoSlot(prev)) prev.crops.potato = doc;
  try { storage.setItem(FIELD_STAGE_STORE, JSON.stringify(prev)); } catch { /* 无痕模式 */ }
}

// 仓库默认只停用这一轮的土豆覆写，不删 crops.potato。另存 potatoKeep，就算槽被旧页面清掉，重读也能找回来。
// 旁边的 custom1 留在库里，但不能冒充土豆槽。
export function suspendPotatoStage(storage) {
  if (!storage) return { kept: false };
  const prev = readStageStore(storage);
  if (!prev || prev.__parseError || !prev.crops || typeof prev.crops !== 'object' || Array.isArray(prev.crops)) return { kept: false };
  const slot = potatoSlot(prev);
  if (slot) prev.potatoKeep = slot;
  const kept = !!(slot || (prev.potatoKeep && Array.isArray(prev.potatoKeep.stages)));
  prev.potatoSuspended = true;
  storage.setItem(FIELD_STAGE_STORE, JSON.stringify(prev));
  return { kept };
}

export function resumePotatoStage(storage) {
  if (!storage) return;
  const prev = readStageStore(storage);
  if (!prev || prev.__parseError || !prev.potatoSuspended) return;
  reinstatePotato(prev);
  delete prev.potatoSuspended;
  storage.setItem(FIELD_STAGE_STORE, JSON.stringify(prev));
}

// stagesParam 为 repo 时忽略浏览器里的工坊存档。其余值留给地址栏上的 JSON 地址，由页面自己去取。
// potatoSuspended 是「仓库默认」留下的：土豆文档还在，这一轮先不套上。重读会先清掉这个标记。
// 这三条都装仓库里的土豆B。坏掉的 JSON 同样退回土豆B，避免可玩页停在占位链上。
function bootLastika(storage, stagesParam) {
  if (stagesParam === 'repo') return installShippedLastika();
  const payload = readStageStore(storage);
  const doc = payload && !payload.__parseError ? payload.crops?.lastika : null;
  if (!doc || !Array.isArray(doc.stages)) return installShippedLastika();
  try { return installLastikaDoc(doc); }
  catch { return installShippedLastika(); }
}

export function bootFieldStageSource(storage, stagesParam) {
  bootLastika(storage, stagesParam);
  if (stagesParam === 'repo') {
    installShippedPotato();
    return { ok: true, origin: 'repo', skipped: true };
  }
  const payload = readStageStore(storage);
  if (!payload) {
    installShippedPotato();
    return { ok: true, origin: 'repo', skipped: true };
  }
  if (payload.__parseError) {
    installShippedPotato();
    return { ok: false, reason: 'json', message: '工坊存档不是 JSON：' + payload.__parseError };
  }
  if (payload.potatoSuspended) {
    installShippedPotato();
    return { ok: true, origin: 'repo', skipped: true, suspended: true };
  }
  if (reinstatePotato(payload)) {
    try { storage.setItem(FIELD_STAGE_STORE, JSON.stringify(payload)); } catch { /* 无痕模式 */ }
  }
  const applied = applyStagePayload(payload);
  if (!applied.ok) return { ...applied, origin: cropDef('potato')?.stageOrigin === 'workshop' ? 'workshop' : 'repo' };
  rememberPotato(storage, applied.doc);
  return applied;
}
