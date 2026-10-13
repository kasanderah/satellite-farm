// 试玩存档契约 v1。说明在 docs/save-contract-v1.md。
// schema 仍是 2，表示这份农场快照的形状。saveVersion 是给朋友试玩的整数版本，升版本时先迁再读。

export const SAVE_VERSION = 1;
export const SAVE_SCHEMA = 2;

function refuse(reason) {
  return { ok: false, data: null, wipedKeys: [], reason };
}

// raw 是 localStorage 里解析出来的对象。不改 raw。
// 缺 saveVersion、schema 仍是 2 的旧档：盖上 saveVersion 1，一个键都不删。
// saveVersion 比本构建新，或形状对不上：ok false。调用方不要写回，改走重开。
export function migrateSave(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return refuse('shape');
  const version = raw.saveVersion == null ? 0 : raw.saveVersion;
  if (version !== 0 && (!Number.isInteger(version) || version < 1)) return refuse('version');
  if (version > SAVE_VERSION) return refuse('future');
  if (raw.schema !== SAVE_SCHEMA || raw.kind !== 'farm-snapshot' || !Array.isArray(raw.fields)) return refuse('schema');
  if (version === SAVE_VERSION) return { ok: true, data: raw, wipedKeys: [] };
  return { ok: true, data: { ...raw, saveVersion: SAVE_VERSION }, wipedKeys: [] };
}
