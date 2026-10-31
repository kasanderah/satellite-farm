import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_VERSION, migrateSave } from '../src/save-contract.js';
import { exportSnapshot, applySnapshot, resetGame, economy } from '../src/_shared.js';

test('a new snapshot is saveVersion 1 and an unversioned schema-2 save migrates without dropping keys', () => {
  resetGame();
  economy.revenue = 123456;
  const snap = exportSnapshot();
  assert.equal(SAVE_VERSION, 1);
  assert.equal(snap.saveVersion, 1);
  assert.equal(snap.schema, 2);
  const legacy = { ...snap };
  delete legacy.saveVersion;
  const migrated = migrateSave(legacy);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.data.saveVersion, 1);
  assert.deepEqual(migrated.wipedKeys, []);
  assert.equal(legacy.saveVersion, undefined);
  assert.equal(migrated.data.revenue, 123456);
  assert.equal(migrated.data.worldDay, snap.worldDay);
  assert.equal(applySnapshot(migrated.data), true);
  assert.equal(economy.revenue, 123456);
  const again = migrateSave(exportSnapshot());
  assert.equal(again.ok, true);
  assert.equal(again.data.saveVersion, 1);
  assert.deepEqual(again.wipedKeys, []);
});

test('a newer or unreadable save is refused without throwing', () => {
  const future = exportSnapshot();
  future.saveVersion = 2;
  const refused = migrateSave(future);
  assert.equal(refused.ok, false);
  assert.equal(refused.data, null);
  assert.deepEqual(refused.wipedKeys, []);
  assert.equal(future.saveVersion, 2);
  assert.equal(migrateSave(null).ok, false);
  assert.equal(migrateSave('nope').ok, false);
  assert.equal(migrateSave([]).ok, false);
  assert.equal(migrateSave({ saveVersion: 1.5, schema: 2, kind: 'farm-snapshot', fields: [] }).ok, false);
  assert.equal(migrateSave({ saveVersion: '1', schema: 2, kind: 'farm-snapshot', fields: [] }).ok, false);
  assert.equal(migrateSave({ schema: 2, kind: 'other', fields: [] }).ok, false);
  assert.equal(migrateSave({ schema: 1, kind: 'farm-snapshot', fields: [] }).ok, false);
});
