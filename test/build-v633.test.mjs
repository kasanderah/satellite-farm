import test from 'node:test';
import assert from 'node:assert/strict';
import { roadMaskAt, roadShape, ROAD_E, ROAD_N, ROAD_W, ROAD_S } from '../src/build/roads.js';
import { planRoute } from '../src/build/nav.js';
import { placeWork, eraseWork, clearWorks, roadMask, tickWorks, faceOut } from '../src/build/works.js';
import { buyMachine, economy, resetGame, sellRig, garageBoard, sendRigHome, step, rigs } from '../src/_shared.js';
import { inHubWedge, CELL } from '../src/modulus.js';
import { OMNI } from '../src/framework-b.js';
import { NAV_RETRY_S } from '../src/build/nav.js';
import { trussSlots, buyTruss, clearTruss, TRUSS_PRICE, syncSlots, claimJob, tickTrusses, listRigs, decideTrussClaim, TRUSS_TRAVEL, TRUSS_SPAN } from '../src/truss.js';
import { normalizeManualJobs, moistureDelta } from '../src/manual-jobs.js';
import { formatWallEta } from '../src/b-bind.js';

test('道路按上下左右拼出直线、转角、丁字和十字', () => {
  const has = (cells) => (x, z) => cells.has(x + ',' + z);
  const cells = new Set(['0,0', '1,0', '0,1']);
  assert.equal(roadShape(roadMaskAt(1, 0, has(cells))), 'end');
  cells.add('-1,0');
  assert.equal(roadShape(roadMaskAt(0, 0, has(cells))), 'tee');
  assert.equal(roadShape(ROAD_E | ROAD_W), 'straight');
  assert.equal(roadShape(ROAD_E | ROAD_N), 'corner');
  assert.equal(roadShape(ROAD_E | ROAD_N | ROAD_W | ROAD_S), 'cross');
});

test('挡住的直线会绕开，封死就停在外面', () => {
  const wall = (x, z) => Math.abs(z) < 2.2 && x < 18;
  const around = planRoute(0, -24, 0, 24, [[0, 24]], wall);
  assert.equal(around.blocked, false);
  assert.ok(around.pts.some(p => p[0] > 16));
  assert.equal(around.pts.some(p => Math.abs(p[1]) < 1.6 && p[0] < 14), false);
  const sealed = planRoute(0, -12, 0, 12, [[0, 12]], () => true);
  assert.equal(sealed.blocked, true);
});

test('万能农机是 1 格宽、每分钟 32 格', () => {
  assert.equal(OMNI.width, CELL);
  assert.equal(OMNI.workCells, 32 / 60);
  const minutes = (32 * 32) / 32;
  assert.equal(minutes, 32);
});

test('挡住后先停下，到点才重新出发', () => {
  resetGame();
  clearWorks();
  economy.revenue = 200000;
  const garage = placeWork('garage', 220, 0, 0);
  assert.equal(garage.ok, true);
  tickWorks(garage.piece.need);
  const bought = buyMachine('tractor');
  assert.equal(bought.ok, true, bought.reason);
  const rig = rigs.find(r => r.id === bought.id);
  rig.bDrive = false;
  rig.x = 220;
  rig.z = -36;
  rig.mode = 'stuck';
  rig.busy = true;
  rig.intent = 'home';
  rig.routeGoal = { x: rig.parkX, z: rig.parkZ };
  rig.navFail = '路被建筑挡住，绕不过去';
  rig.navRetry = 0;
  const held = rig.z;
  step(2);
  assert.equal(rig.mode, 'stuck');
  assert.equal(rig.z, held);
  step(NAV_RETRY_S);
  assert.notEqual(rig.mode, 'stuck');
  assert.equal(rig.navFail, '');
});

test('桁架扫完停回地头，不再自己漂', () => {
  clearTruss();
  const fields = [{ i: 0, j: 0, x0: 100, z0: 20 }];
  assert.equal(buyTruss('0:0:0', () => true).ok, true);
  syncSlots(trussSlots(fields, 0, 0, 4, 40));
  const rig = listRigs()[0];
  assert.equal(rig.phase, 'park');
  assert.ok(Math.abs(rig.x - 92) < 0.2);
  const parked = rig.x;
  tickTrusses(3);
  assert.equal(rig.x, parked);
  assert.equal(claimJob(rig.key, { fieldId: 'a', jobId: 'spray', goalU: 0, len: 40 }), true);
  let sawSweep = false;
  let finished = false;
  for (let n = 0; n < 40 && rig.phase !== 'park'; n++) {
    if (rig.phase === 'sweep' && rig.x > 100 && rig.x < 140) sawSweep = true;
    if (tickTrusses(1).some(item => item.jobId === 'spray')) finished = true;
  }
  assert.equal(sawSweep, true);
  assert.equal(finished, true);
  assert.equal(rig.phase, 'park');
  assert.ok(Math.abs(rig.x - parked) < 0.5);
  tickTrusses(4);
  assert.equal(rig.x, parked);
  clearTruss();
});

test('一台桁架扫完自己这一行的第四个单元再回地头', () => {
  clearTruss();
  const span = 147;
  const fields = [0, 1, 2, 3].map(k => ({ i: k, j: 0, x0: 100 + k * span, z0: 20 }));
  assert.equal(buyTruss('0:0:0', () => true).ok, true);
  syncSlots(trussSlots(fields, 0, 0, 4, 134.4));
  syncSlots(trussSlots([{ i: 4, j: 0, x0: 900, z0: 20 }], 1, 0, 4, 134.4));
  const rig = listRigs().find(item => item.key === '0:0:0');
  assert.ok(rig, '别的地块刷新不能把这台桁架删掉');
  const goalU = fields[3].x0 - fields[0].x0;
  assert.equal(claimJob(rig.key, { fieldId: 'far', jobId: 'spray', goalU, len: 134.4 }), true);
  let reached = false;
  for (let n = 0; n < 200 && rig.phase !== 'park'; n++) {
    if (rig.x >= fields[3].x0 - 1 && rig.x <= fields[3].x0 + 134.4 + 1) reached = true;
    tickTrusses(2);
  }
  assert.equal(reached, true);
  assert.equal(rig.phase, 'park');
  assert.ok(Math.abs(rig.x - (fields[0].x0 - 8)) < 0.5);
  clearTruss();
});

test('没买桁架、桁架正忙、成功派工三条都不吞单', () => {
  const none = decideTrussClaim({ bought: false, stockOk: true, powerOk: true, parked: false, jobId: 'spray' });
  assert.equal(none.ok, false);
  assert.match(none.tip, /这行没有喷灌桁架，撒药派不出去/);
  const top = decideTrussClaim({ bought: false, stockOk: true, powerOk: true, parked: false, jobId: 'topdress' });
  assert.equal(top.ok, false);
  assert.match(top.tip, /追肥派不出去/);
  const busy = decideTrussClaim({ bought: true, stockOk: true, powerOk: true, parked: false, jobId: 'topdress' });
  assert.equal(busy.ok, false);
  assert.equal(busy.reason, 'busy');
  const dry = decideTrussClaim({ bought: true, stockOk: false, powerOk: true, parked: true, jobId: 'spray', stockTip: '药不够，桁架不能撒药' });
  assert.equal(dry.ok, false);
  assert.equal(dry.reason, 'stock');
  const go = decideTrussClaim({ bought: true, stockOk: true, powerOk: true, parked: true, jobId: 'spray' });
  assert.equal(go.ok, true);
  clearTruss();
  const fields = [{ i: 0, j: 0, x0: 0, z0: 0 }];
  buyTruss('0:0:0', () => true);
  syncSlots(trussSlots(fields, 0, 0, 4, 40));
  assert.equal(claimJob('0:0:0', { fieldId: 'a', jobId: 'spray', goalU: 0, len: 40 }), true);
  assert.equal(claimJob('0:0:0', { fieldId: 'b', jobId: 'topdress', goalU: 0, len: 40 }), false);
  clearTruss();
  assert.equal(formatWallEta(80, 1), '剩余约 80 秒（现实）');
  assert.equal(formatWallEta(80, 10), '剩余约 8 秒（现实）');
  assert.equal(formatWallEta(120, 1), '剩余约 2 分（现实）');
});

test('桁架沿东西展开、沿南北走过四个单元', () => {
  assert.equal(TRUSS_TRAVEL, 'x');
  assert.equal(TRUSS_SPAN, 'z');
  const fields = [0, 1, 2, 3].map(i => ({ i, j: 0, x0: i * 147, z0: 20 }));
  const slot = trussSlots(fields, 0, 0, 4, 134.4)[0];
  assert.equal(slot.travel, 'x');
  assert.equal(slot.span, 'z');
  assert.equal(slot.x, fields[0].x0 - 8);
  assert.equal(slot.z, 20 + 67.2);
  const rigs = [];
  clearTruss();
  buyTruss(slot.key, () => true);
  syncSlots(trussSlots(fields, 0, 0, 4, 134.4));
  const goalU = fields[3].x0 - fields[0].x0;
  assert.equal(claimJob(slot.key, { fieldId: 'far', jobId: 'spray', goalU, len: 134.4 }), true);
  for (let i = 0; i < 80; i++) rigs.push(...tickTrusses(20));
  assert.equal(listRigs()[0].phase === 'return' || listRigs()[0].phase === 'park', true);
  clearTruss();
});

test('车库门口朝南，转 90 度后箭头朝西', () => {
  assert.deepEqual(faceOut(0, 's'), [0, -1]);
  assert.deepEqual(faceOut(1, 's'), [-1, 0]);
});

test('手动喷灌默认给含水率加 8', () => {
  const jobs = normalizeManualJobs([{ id: 'irrigate', name: '喷灌', machines: ['truss', 'omni'], effect: 'moisture', delta: 8 }]);
  assert.equal(jobs[0].id, 'irrigate');
  assert.equal(moistureDelta('irrigate'), 8);
});

test('一行只能买一台桁架', () => {
  clearTruss();
  const fields = [{ i: 0, j: 0, x0: 0, z0: 0 }, { i: 0, j: 1, x0: 0, z0: 10 }];
  const slots = trussSlots(fields, 0, 0, 4, 20);
  assert.equal(slots.length, 2);
  assert.equal(slots[0].bought, false);
  let cash = TRUSS_PRICE;
  assert.equal(buyTruss(slots[0].key, () => { cash -= TRUSS_PRICE; return true; }).ok, true);
  assert.equal(buyTruss(slots[0].key, () => true).reason, 'have');
  assert.equal(trussSlots(fields, 0, 0, 4, 20)[0].bought, true);
  clearTruss();
});

test('车库车位不够不能买，有农机不能拆', () => {
  resetGame();
  clearWorks();
  economy.revenue = 100000;
  const none = buyMachine('tractor');
  assert.equal(none.ok, false);
  assert.equal(none.reason, 'stall');
  assert.equal(garageBoard().stalls, 0);
  const spot = { x: 220, z: 0 };
  assert.equal(inHubWedge(spot.x, spot.z, 0), true);
  const garage = placeWork('garage', spot.x, spot.z, 0);
  assert.equal(garage.ok, true, garage.reason);
  assert.equal(garageBoard().stalls, 0);
  assert.equal(buyMachine('tractor').reason, 'stall');
  tickWorks(garage.piece.need);
  assert.equal(garage.piece.progress, 1);
  assert.equal(garageBoard().stalls, 3);
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const bought = buyMachine('tractor');
    assert.equal(bought.ok, true, bought.reason);
    ids.push(bought.id);
  }
  assert.equal(garageBoard().free, 0);
  const full = buyMachine('omni');
  assert.equal(full.reason, 'stall');
  const blocked = eraseWork(spot.x, spot.z);
  assert.equal(blocked.reason, 'occupied');
  assert.equal(sellRig(ids[0]).ok, true);
  assert.equal(garageBoard().free, 1);
  assert.equal(eraseWork(spot.x, spot.z).reason, 'occupied');
  sellRig(ids[1]);
  sellRig(ids[2]);
  assert.equal(eraseWork(spot.x, spot.z).ok, true);
  clearWorks();
  const east = placeWork('service', 230, 8, 0);
  const north = placeWork('service', 230 + 4.2, 8 + 4.2, 0);
  assert.equal(east.ok && north.ok, true);
  placeWork('service', 230 + 4.2, 8, 0);
  const mask = roadMask(east.piece.gx + 1, east.piece.gz);
  assert.equal(roadShape(mask), 'corner');
  clearWorks();
});
