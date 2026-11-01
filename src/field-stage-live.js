// 可玩页的种植阶段读拉斯提卡和短季薯。来源是工坊存档里的 crops.lastika / crops.tuber，
// 没有就用仓库 data/field-stages/lastika.json 和 tuber.json。
// 商品薯甘特不进这条路径。整地仍是旁边的清地，不写进种植链。
//
// 工坊「保存」写入 localStorage `ringsheaf.assetlab.fieldStages.v1`，形状是
// `{ schema, cropId, crops: { lastika: doc, tuber: doc } }`。旧档只有 lastika 时，短季薯仍用仓库默认。
// 同一来源（本地服务器上同时打开 asset-lab.html 和 index.html）两页共用这把钥匙。
// file:// 在 Chrome 里每个文件各算一个来源，两页的 localStorage 互不可见。
import { FIELD_STAGE_SCHEMA, FIELD_STAGE_STORE } from './field-stages.js';
import { PLANT_CROPS, installFieldBlocks } from './framework-b.js';
import { FIELD_BLOCK_STORE, cloneFieldBlocks } from './field-blocks.js';
import { installLastikaDoc, installShippedLastika, installTuberDoc, installShippedTuber } from './lastika-stage.js';

export { FIELD_BLOCK_STORE };

export function bootFieldBlocks(storage) {
  const shipped = cloneFieldBlocks();
  const byId = Object.fromEntries(shipped.map(doc => [doc.id, doc]));
  if (storage) {
    try {
      const raw = JSON.parse(storage.getItem(FIELD_BLOCK_STORE) || 'null');
      const blocks = raw?.blocks;
      if (blocks && typeof blocks === 'object') {
        for (const [id, doc] of Object.entries(blocks)) {
          if (doc && doc.graph && Array.isArray(doc.graph.stages)) byId[id] = doc;
        }
      }
    } catch { /* 坏档用仓库默认 */ }
  }
  installFieldBlocks(Object.values(byId));
  return byId;
}

export { FIELD_STAGE_STORE };

function isLastikaDoc(doc, key) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  const keyId = String(key || '');
  const id = String(doc.cropId || '');
  const logic = String(doc.logicId || '');
  const profile = String(doc.profile || '');
  if (keyId === 'lastika' || keyId === 'crop_lastika') return true;
  if (id === 'lastika' || id === 'crop_lastika' || logic === 'crop_lastika' || profile === 'lastika') return true;
  return false;
}

export function lastikaDocFromPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.crops && typeof raw.crops === 'object' && !Array.isArray(raw.crops)) {
    const slotted = raw.crops.lastika || raw.crops.crop_lastika;
    if (slotted && typeof slotted === 'object' && Array.isArray(slotted.stages)) return slotted;
    for (const [key, doc] of Object.entries(raw.crops)) {
      if (isLastikaDoc(doc, key) && Array.isArray(doc.stages)) return doc;
    }
    return null;
  }
  if (Array.isArray(raw.stages) && isLastikaDoc(raw, raw.cropId)) return raw;
  return null;
}

function potatoPayload(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.profile === 'potato-b' || raw.cropId === 'potato' || raw.logicId === 'crop_potato') return true;
  const crops = raw.crops;
  if (!crops || typeof crops !== 'object') return false;
  return !!(crops.potato || crops.crop_potato);
}

export function applyStagePayload(raw) {
  const doc = lastikaDocFromPayload(raw);
  if (!doc) {
    return {
      ok: false,
      reason: 'empty',
      message: potatoPayload(raw) ? '主游戏不读商品薯甘特。请贴拉斯提卡。' : '工坊存档里没有拉斯提卡',
    };
  }
  try {
    const crop = installLastikaDoc(doc, 'workshop');
    const tuber = tuberSlot(raw);
    if (tuber) {
      try { installTuberDoc(tuber, 'workshop'); } catch { /* 短季薯坏了就留仓库默认 */ }
    }
    return { ok: true, origin: 'workshop', doc, crop };
  } catch (err) {
    return { ok: false, reason: 'parse', message: err.message || '这份田间配置读不了' };
  }
}

export function stageBadge() {
  return PLANT_CROPS.lastika.origin === 'workshop' ? '工坊覆写' : '仓库默认';
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
  crops.lastika = doc;
  const payload = { schema: FIELD_STAGE_SCHEMA, cropId: 'lastika', crops };
  storage.setItem(FIELD_STAGE_STORE, JSON.stringify(payload));
  return payload;
}

function lastikaSlot(payload) {
  const crops = payload?.crops;
  if (!crops || typeof crops !== 'object' || Array.isArray(crops)) return null;
  const slot = crops.lastika || crops.crop_lastika;
  if (slot && typeof slot === 'object' && Array.isArray(slot.stages)) return slot;
  return null;
}

// 「仓库默认」只停用这一轮的拉斯提卡覆写，不删 crops.lastika。
export function suspendLastikaStage(storage) {
  if (!storage) return { kept: false };
  const prev = readStageStore(storage);
  if (!prev || prev.__parseError || !prev.crops || typeof prev.crops !== 'object' || Array.isArray(prev.crops)) return { kept: false };
  const slot = lastikaSlot(prev);
  if (slot) prev.lastikaKeep = slot;
  const kept = !!(slot || (prev.lastikaKeep && Array.isArray(prev.lastikaKeep.stages)));
  prev.lastikaSuspended = true;
  storage.setItem(FIELD_STAGE_STORE, JSON.stringify(prev));
  return { kept };
}

export function resumeLastikaStage(storage) {
  if (!storage) return;
  const prev = readStageStore(storage);
  if (!prev || prev.__parseError || !prev.lastikaSuspended) return;
  if (!lastikaSlot(prev) && prev.lastikaKeep && Array.isArray(prev.lastikaKeep.stages)) {
    if (!prev.crops || typeof prev.crops !== 'object' || Array.isArray(prev.crops)) prev.crops = {};
    prev.crops.lastika = prev.lastikaKeep;
  }
  delete prev.lastikaSuspended;
  storage.setItem(FIELD_STAGE_STORE, JSON.stringify(prev));
}

function tuberSlot(payload) {
  const crops = payload?.crops;
  if (!crops || typeof crops !== 'object' || Array.isArray(crops)) return null;
  const slot = crops.tuber;
  if (slot && typeof slot === 'object' && slot.graph && Array.isArray(slot.graph.stages)) return slot;
  return null;
}

function bootTuber(storage, stagesParam) {
  if (stagesParam === 'repo') return { crop: installShippedTuber(), origin: 'repo', skipped: true };
  const payload = readStageStore(storage);
  if (!payload || payload.__parseError) return { crop: installShippedTuber(), origin: 'repo', skipped: true };
  const doc = tuberSlot(payload);
  if (!doc) return { crop: installShippedTuber(), origin: 'repo', skipped: true };
  try {
    return { ok: true, origin: 'workshop', crop: installTuberDoc(doc, 'workshop'), doc };
  } catch (err) {
    installShippedTuber();
    return { ok: false, reason: 'parse', message: err.message || '短季薯读不了', origin: 'repo' };
  }
}

function bootLastika(storage, stagesParam) {
  if (stagesParam === 'repo') return { crop: installShippedLastika(), origin: 'repo', skipped: true };
  const payload = readStageStore(storage);
  if (!payload) return { crop: installShippedLastika(), origin: 'repo', skipped: true };
  if (payload.__parseError) {
    installShippedLastika();
    return { ok: false, reason: 'json', message: '工坊存档不是 JSON：' + payload.__parseError, origin: 'repo' };
  }
  if (payload.lastikaSuspended) return { crop: installShippedLastika(), origin: 'repo', skipped: true, suspended: true };
  const doc = lastikaSlot(payload);
  if (!doc) return { crop: installShippedLastika(), origin: 'repo', skipped: true };
  try {
    return { ok: true, origin: 'workshop', crop: installLastikaDoc(doc, 'workshop'), doc };
  } catch (err) {
    installShippedLastika();
    return { ok: false, reason: 'parse', message: err.message || '拉斯提卡读不了', origin: 'repo' };
  }
}

// stagesParam 为 repo 时忽略浏览器里的工坊存档。不装商品薯。
export function bootFieldStageSource(storage, stagesParam) {
  const booted = bootLastika(storage, stagesParam);
  const tuber = bootTuber(storage, stagesParam);
  if (booted.ok === false) return booted;
  return { ok: true, ...booted, tuber: tuber.ok === false ? tuber.message : tuber.origin };
}
