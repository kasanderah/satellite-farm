// 可玩页开局读工坊农机存档，盖到内置机具上。钥匙和信封见 machine-lab.js / docs/machine-lab-v1.md。
// 空档、坏 JSON、版本过新都清掉覆盖，调度继续用内置表。
import { libraryFromUnknown, MACHINE_LAB_KEY } from './machine-lab.js';
import { applyMachineOverlay, clearMachineOverlay } from './surface-crops.js';

export function bootWorkshopMachines(storage) {
  if (!storage) {
    clearMachineOverlay();
    return { applied: false, reason: 'nostore' };
  }
  let raw;
  try { raw = storage.getItem(MACHINE_LAB_KEY); }
  catch {
    clearMachineOverlay();
    return { applied: false, reason: 'nostore' };
  }
  if (!raw) {
    clearMachineOverlay();
    return { applied: false, reason: 'empty' };
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch {
    clearMachineOverlay();
    return { applied: false, reason: 'corrupt' };
  }
  const lib = libraryFromUnknown(parsed);
  if (!lib.ok || !lib.machines.length) {
    clearMachineOverlay();
    return { applied: false, reason: lib.ok ? 'empty' : 'corrupt', message: lib.message };
  }
  return { ...applyMachineOverlay(lib.machines), reason: 'workshop' };
}
