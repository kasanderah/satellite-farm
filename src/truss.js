// 桁架第一版：一个地块 4 行，每行西端一个位，一位一台。
// 买下来只立架子。本行喷灌、打药、扣库存还不走阶段链，也不进车库。
export const TRUSS_PRICE = 6000;
export const TRUSS_ROWS = 4;

const bought = new Set();

export function clearTruss() {
  bought.clear();
}

export function exportTruss() {
  return [...bought];
}

export function loadTruss(raw) {
  bought.clear();
  if (!Array.isArray(raw)) return;
  for (const key of raw) if (typeof key === 'string') bought.add(key);
}

export function trussSlots(fields, bi, bj, per, fieldLen) {
  const slots = [];
  for (let row = 0; row < TRUSS_ROWS; row++) {
    const f = fields.find(item => item.i === bi * per + 0 && item.j === bj * per + row);
    if (!f) continue;
    const key = `${bi}:${bj}:${row}`;
    slots.push({
      key,
      row,
      i: f.i,
      j: f.j,
      x: f.x0 - 9,
      z: f.z0 + fieldLen / 2,
      bought: bought.has(key),
    });
  }
  return slots;
}

export function buyTruss(key, pay) {
  if (bought.has(key)) return { ok: false, reason: 'have' };
  if (typeof pay === 'function' && !pay()) return { ok: false, reason: 'money' };
  bought.add(key);
  return { ok: true, key };
}
