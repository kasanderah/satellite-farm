import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MACHINE_LAB_KEY, MACHINE_TAGS, allocateMachineId, defaultMachines, dropMachine, forkMachine,
  libraryFromUnknown, machineEnvelope, machineOptionLabel, passPreview, renameMachine,
} from '../src/machine-lab.js';

test('a new machine gets its own id and does not rename the source', () => {
  const list = defaultMachines();
  const source = list.find(item => item.id === 'impl_cultivator');
  const id = allocateMachineId(list.map(item => item.id));
  const copy = forkMachine(source, id);
  assert.equal(id, 'rig1');
  assert.equal(copy.id, 'rig1');
  assert.equal(source.id, 'impl_cultivator');
  assert.equal(source.name, '中耕');
  assert.match(copy.name, /副本/);
  assert.equal(machineOptionLabel(source), '中耕 · impl_cultivator');
  assert.notEqual(machineOptionLabel(copy), machineOptionLabel(source));
  renameMachine(source, '阿米阿米');
  assert.equal(source.id, 'impl_cultivator');
  assert.equal(source.name, '阿米阿米');
  assert.equal(machineOptionLabel(source), '阿米阿米 · impl_cultivator');
});

test('stage machine tags carry the dispatch cap, and width sets the lane count', () => {
  const hill = MACHINE_TAGS.find(tag => tag.id === 'impl_cultivator');
  assert.equal(hill.cap, 'cultivate');
  const potato = defaultMachines().find(item => item.id === 'impl_cultivator');
  assert.deepEqual(potato.tags, ['impl_cultivator']);
  assert.deepEqual(potato.caps, ['cultivate']);
  assert.equal(potato.workWidth, 6.4);
  const view = passPreview(6.4, 128);
  assert.equal(view.lanes, 20);
  assert.equal(view.lane, 6.4);
  const saved = machineEnvelope([potato]);
  assert.equal(saved.kind, 'ringsheaf.assetlab.machines');
  assert.equal(MACHINE_LAB_KEY, 'ringsheaf.assetlab.machines.v1');
  const back = libraryFromUnknown(JSON.parse(JSON.stringify(saved)));
  assert.equal(back.ok, true);
  assert.equal(back.machines[0].id, 'impl_cultivator');
  assert.equal(back.machines[0].role, 'implement');
  assert.equal(back.machines[0].hitch, null);
  assert.equal(back.machines[0].bin, null);
  assert.equal(back.machines[0].model.source, 'placeholder');
});

test('a newer machine file is refused and a copied potato harvester stays itself', () => {
  const refused = libraryFromUnknown({ version: 9, machines: [] });
  assert.equal(refused.ok, false);
  const lifter = defaultMachines().find(item => item.id === 'harvester_potato');
  assert.equal(lifter.role, 'self');
  assert.deepEqual(lifter.caps, ['harvest_potato']);
  const tagged = libraryFromUnknown({
    version: 1,
    machines: [{ id: 'custom1', name: '自定义', role: 'self', tags: ['nope', 'harvester_potato'], workWidth: 8, hitch: 'tractor_gen', bin: 1200, model: { source: 'file', fileName: 'a/b.glb' } }],
  });
  assert.equal(tagged.machines[0].id, 'custom1');
  assert.deepEqual(tagged.machines[0].tags, ['harvester_potato']);
  assert.deepEqual(tagged.machines[0].caps, ['harvest_potato']);
  assert.equal(tagged.machines[0].hitch, 'tractor_gen');
  assert.equal(tagged.machines[0].bin, 1200);
  assert.equal(tagged.machines[0].model.fileName, 'b.glb');
  assert.equal(tagged.machines[0].modes.length, 1);
  assert.equal(tagged.machines[0].modes[0].fn, 'harvester_potato');
  assert.equal(tagged.machines[0].modes[0].bin, 1200);
  assert.deepEqual(tagged.machines[0].modes[0].extra, {});
});

test('a v1 machine becomes one mode, and a synced width is shared', () => {
  const old = libraryFromUnknown({
    version: 1,
    machines: [{ id: 'impl_cultivator', name: '中耕', role: 'implement', tags: ['impl_cultivator'], workWidth: 6.4, speed: 10, power: 40 }],
  });
  assert.equal(old.ok, true);
  assert.equal(old.machines[0].modes.length, 1);
  assert.equal(old.machines[0].modes[0].fn, 'impl_cultivator');
  assert.equal(old.machines[0].modes[0].workWidth, 6.4);
  assert.equal(old.machines[0].sync.workWidth, false);
  assert.equal(old.machines[0].modes[0].extra.style, 'shallow');
  const machine = old.machines[0];
  machine.modes.push({ fn: 'impl_potato_planter', workWidth: 12.8, speed: 8, power: 50, bin: 400 });
  machine.sync.workWidth = true;
  machine.sync.power = true;
  const again = libraryFromUnknown(machineEnvelope([machine]));
  assert.equal(again.ok, true);
  assert.equal(again.machines[0].version, undefined);
  assert.equal(again.machines[0].modes.length, 2);
  assert.equal(again.machines[0].modes[0].workWidth, 6.4);
  assert.equal(again.machines[0].modes[1].workWidth, 6.4);
  assert.equal(again.machines[0].modes[1].power, 40);
  assert.equal(again.machines[0].modes[1].speed, 8);
  assert.equal(again.machines[0].modes[1].bin, 400);
  assert.equal(again.machines[0].modes[1].fn, 'impl_potato_planter');
  assert.deepEqual(again.machines[0].modes[1].extra, {});
  assert.deepEqual(again.machines[0].tags, ['impl_cultivator', 'impl_potato_planter']);
  const dropped = dropMachine(again.machines, 'impl_cultivator');
  assert.equal(dropped.length, 0);
});

test('a library placeholder is kept, and an unknown library id falls back', () => {
  const picked = libraryFromUnknown({
    version: 2,
    machines: [{
      id: 'rig3', name: '库选', role: 'self',
      model: { source: 'library', libraryId: 'kenney-tractor' },
      sync: { bin: true },
      modes: [
        { id: 'm1', fn: 'harvester_combine', workWidth: 8, speed: 6, power: 150, bin: 8000, extra: { header: 'grain' } },
        { id: 'm2', fn: 'impl_seeder', workWidth: 4, speed: 7, power: 80, bin: 100, extra: { disc: 'nope' } },
      ],
    }],
  });
  assert.equal(picked.machines[0].model.source, 'library');
  assert.equal(picked.machines[0].model.libraryId, 'kenney-tractor');
  assert.equal(picked.machines[0].model.fileName, '');
  assert.equal(picked.machines[0].modes[0].extra.header, 'grain');
  assert.equal(picked.machines[0].modes[1].extra.disc, 'bean');
  assert.equal(picked.machines[0].modes[1].bin, 8000);
  assert.equal(picked.machines[0].modes[1].workWidth, 4);
  const missing = libraryFromUnknown({
    version: 2,
    machines: [{ id: 'rig4', name: '空', role: 'tractor', model: { source: 'library', libraryId: 'nope' } }],
  });
  assert.equal(missing.machines[0].model.source, 'placeholder');
  assert.equal(missing.machines[0].model.libraryId, '');
  assert.equal(missing.machines[0].modes.length, 1);
  assert.equal(missing.machines[0].modes[0].fn, '');
});
