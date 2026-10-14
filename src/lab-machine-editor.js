// 工坊农机编辑器的面板和顶视一趟。几何只在打开这一项时建。
import * as THREE from 'three';
import {
  MACHINE_LAB_KEY, MACHINE_ROLES, MACHINE_TAGS, PREVIEW_FIELD_M,
  allocateMachineId, defaultMachines, forkMachine, libraryFromUnknown, machineEnvelope,
  machineOptionLabel, normalizeMachine, passPreview, renameMachine,
} from './machine-lab.js';

const C = hex => new THREE.Color(hex);

export function createMachineWorkshop(els) {
  const { panel } = els;
  let list = defaultMachines();
  let currentId = list[0].id;
  let active = false;
  let preview = null;
  let formSig = '';
  const laneMat = new THREE.MeshBasicMaterial({ color: C('#e8d8d0'), transparent: true, opacity: 0.35 });
  const swathMat = new THREE.MeshBasicMaterial({ color: C('#e49680'), transparent: true, opacity: 0.72 });
  const rigMat = new THREE.MeshStandardMaterial({ color: C('#d8693c'), roughness: 0.42, metalness: 0.25 });
  const soilMat = new THREE.MeshStandardMaterial({ color: C('#3c342c'), roughness: 0.96, metalness: 0 });

  function current() {
    return list.find(item => item.id === currentId) || list[0];
  }

  function note(text) {
    const el = panel.querySelector('#me-status');
    if (el) el.textContent = text || '';
  }

  function esc(text) {
    return String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }

  function loadStore() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(MACHINE_LAB_KEY) || 'null'); }
    catch { note('农机存档不是 JSON，先用占位机具'); list = defaultMachines(); currentId = list[0].id; return; }
    if (raw == null) { list = defaultMachines(); currentId = list[0].id; return; }
    const parsed = libraryFromUnknown(raw);
    if (!parsed.ok || !parsed.machines.length) {
      list = defaultMachines();
      currentId = list[0].id;
      note(parsed.message || '农机存档读不了，先用占位机具');
      return;
    }
    list = parsed.machines;
    currentId = list[0].id;
  }

  function persist() {
    const env = machineEnvelope(list);
    try { localStorage.setItem(MACHINE_LAB_KEY, JSON.stringify(env)); }
    catch { note('这台浏览器写不进农机存档'); return false; }
    note('已写入这台浏览器。主游戏本轮不读这份。');
    return true;
  }

  function paintChoices() {
    const sel = panel.querySelector('#me-pick');
    if (!sel) return;
    const sig = list.map(item => `${item.id}:${item.name}`).join('|');
    if (sel.dataset.sig !== sig) {
      sel.dataset.sig = sig;
      sel.innerHTML = list.map(item => `<option value="${esc(item.id)}">${esc(machineOptionLabel(item))}</option>`).join('');
    }
    sel.value = current().id;
  }

  function paintForm() {
    const machine = current();
    paintChoices();
    const editing = panel.querySelector('#me-editing');
    if (editing) editing.textContent = `正在编辑 ${machine.id}。显示名不改 id。主游戏本轮不读这份。`;
    const name = panel.querySelector('#me-name');
    if (name && document.activeElement !== name) name.value = machine.name;
    const role = panel.querySelector('#me-role');
    if (role) role.value = machine.role;
    for (const box of panel.querySelectorAll('#me-tags input')) {
      box.checked = machine.tags.includes(box.value);
    }
    const width = panel.querySelector('#me-width');
    if (width && document.activeElement !== width) width.value = String(machine.workWidth);
    const speed = panel.querySelector('#me-speed');
    if (speed && document.activeElement !== speed) speed.value = String(machine.speed);
    const power = panel.querySelector('#me-power');
    if (power && document.activeElement !== power) power.value = String(machine.power);
    const hitch = panel.querySelector('#me-hitch');
    if (hitch && document.activeElement !== hitch) hitch.value = machine.hitch || '';
    const bin = panel.querySelector('#me-bin');
    if (bin && document.activeElement !== bin) bin.value = machine.bin == null ? '' : String(machine.bin);
    const model = panel.querySelector('#me-model');
    if (model) {
      model.textContent = machine.model.source === 'file' && machine.model.fileName
        ? `已记下文件名 ${machine.model.fileName}。预览仍是按宽度的一趟，文件不进主游戏。`
        : '占位。预览按工作宽度画一趟。正式外形以后向环穗资产要新下载再接入。';
    }
    paintPass();
  }

  function paintPass() {
    const el = panel.querySelector('#me-pass');
    const view = passPreview(current().workWidth, PREVIEW_FIELD_M);
    if (el) el.textContent = `${view.field} m 田上这一趟 ${view.width} m，大约 ${view.lanes} 趟。巷距按这个宽度算。`;
    syncPreview();
  }

  function syncPreview() {
    if (!preview) return;
    const view = passPreview(current().workWidth, PREVIEW_FIELD_M);
    const swath = preview.getObjectByName('swath');
    swath.visible = false;
    const lanes = preview.getObjectByName('lanes');
    while (lanes.children.length) {
      const child = lanes.children.pop();
      if (child.geometry && !child.geometry.userData.shared) child.geometry.dispose();
      lanes.remove(child);
    }
    const gap = Math.min(0.7, view.lane * 0.14);
    const bar = Math.max(0.35, view.lane - gap);
    for (let i = 0; i < view.lanes; i++) {
      const active = i === 0;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(bar, active ? 0.16 : 0.05, view.field * 0.96),
        active ? swathMat : laneMat,
      );
      mesh.position.set(-view.field / 2 + (i + 0.5) * view.lane, active ? 0.1 : 0.04, 0);
      lanes.add(mesh);
    }
    const rig = preview.getObjectByName('rig');
    rig.position.x = -view.field / 2 + view.lane * 0.5;
    rig.scale.set(Math.max(1.1, Math.min(bar * 0.72, 5)), 1, 1);
  }

  function readNumber(sel, key, label) {
    const el = panel.querySelector(sel);
    const raw = el ? el.value.trim() : '';
    if (!raw) { note(`${label}要填数字`); return false; }
    const n = Number(raw);
    if (!Number.isFinite(n)) { note(`${label}要填数字`); return false; }
    current()[key] = n;
    const fixed = normalizeMachine(current());
    Object.assign(current(), fixed);
    return true;
  }

  function paintShell() {
    panel.innerHTML = `<h3>农机编辑器</h3>
<p class="fs-help">先选农机，再改显示名。新农机另起 id。顶视只画一趟，宽度就是巷距。占位用 refs/machines 里已有的低模。正式模型以后向「环穗资产」要新下载再接入。</p>
<label>农机<select id="me-pick"></select></label>
<p id="me-editing" class="fs-note"></p>
<label>显示名<input id="me-name" autocomplete="off"></label>
<label>类别<select id="me-role">${MACHINE_ROLES.map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select></label>
<div class="me-tags" id="me-tags">${MACHINE_TAGS.map(tag => `<label><input type="checkbox" value="${esc(tag.id)}">${esc(tag.name)} <small>${esc(tag.cap || tag.id)}</small></label>`).join('')}</div>
<div class="fs-split">
  <label>工作宽度 m<input id="me-width" inputmode="decimal" autocomplete="off"></label>
  <label>作业速度 m/s<input id="me-speed" inputmode="decimal" autocomplete="off"></label>
</div>
<div class="fs-split">
  <label>功率 kW<input id="me-power" inputmode="decimal" autocomplete="off"></label>
  <label>仓容 L（先留着）<input id="me-bin" inputmode="decimal" autocomplete="off"></label>
</div>
<label>挂接（先留着）<input id="me-hitch" autocomplete="off" placeholder="空着表示还没接"></label>
<div class="fs-row">
  <button type="button" id="me-ph">占位</button>
  <label>导入模型<input id="me-file" type="file" accept=".glb,.gltf,model/gltf-binary"></label>
</div>
<p id="me-model" class="fs-note"></p>
<p id="me-pass" class="fs-note"></p>
<div class="fs-row">
  <button type="button" id="me-save">保存</button>
  <button type="button" id="me-down">下载 JSON</button>
  <button type="button" id="me-new">新农机</button>
</div>
<p class="fs-note">新农机复制当前这一台，id 另起。保存只写工坊钥匙。主游戏的机具表和派单不动。</p>
<p id="me-status"></p>`;
    panel.querySelector('#me-pick').addEventListener('change', (e) => {
      currentId = e.target.value;
      paintForm();
    });
    panel.querySelector('#me-name').addEventListener('change', (e) => {
      renameMachine(current(), e.target.value);
      paintForm();
    });
    panel.querySelector('#me-role').addEventListener('change', (e) => {
      current().role = e.target.value;
      Object.assign(current(), normalizeMachine(current()));
      paintForm();
    });
    panel.querySelector('#me-tags').addEventListener('change', () => {
      current().tags = [...panel.querySelectorAll('#me-tags input:checked')].map(box => box.value);
      Object.assign(current(), normalizeMachine(current()));
      paintForm();
    });
    for (const [sel, key, label] of [['#me-width', 'workWidth', '工作宽度'], ['#me-speed', 'speed', '作业速度'], ['#me-power', 'power', '功率']]) {
      panel.querySelector(sel).addEventListener('change', () => {
        if (!readNumber(sel, key, label)) return;
        paintForm();
      });
    }
    panel.querySelector('#me-width').addEventListener('input', () => {
      const n = Number(panel.querySelector('#me-width').value);
      if (!(n > 0)) return;
      current().workWidth = n;
      Object.assign(current(), normalizeMachine(current()));
      paintPass();
    });
    panel.querySelector('#me-hitch').addEventListener('change', (e) => {
      current().hitch = e.target.value;
      Object.assign(current(), normalizeMachine(current()));
    });
    panel.querySelector('#me-bin').addEventListener('change', (e) => {
      current().bin = e.target.value;
      Object.assign(current(), normalizeMachine(current()));
      paintForm();
    });
    panel.querySelector('#me-ph').addEventListener('click', () => {
      current().model = { source: 'placeholder', fileName: '' };
      paintForm();
    });
    panel.querySelector('#me-file').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      current().model = { source: file ? 'file' : 'placeholder', fileName: file ? file.name : '' };
      paintForm();
    });
    panel.querySelector('#me-save').addEventListener('click', () => { persist(); });
    panel.querySelector('#me-down').addEventListener('click', download);
    panel.querySelector('#me-new').addEventListener('click', () => {
      const id = allocateMachineId(list.map(item => item.id));
      const next = forkMachine(current(), id);
      list.push(next);
      currentId = id;
      paintForm();
      note(`已另起 ${id}。点保存才写入浏览器。`);
    });
    formSig = 'ready';
    paintForm();
  }

  function download() {
    const blob = new Blob([JSON.stringify(machineEnvelope(list), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ringsheaf-machines.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function build() {
    const group = new THREE.Group();
    const soil = new THREE.Mesh(new THREE.PlaneGeometry(PREVIEW_FIELD_M, PREVIEW_FIELD_M), soilMat);
    soil.rotation.x = -Math.PI / 2;
    group.add(soil);
    const lanes = new THREE.Group();
    lanes.name = 'lanes';
    group.add(lanes);
    const swath = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, PREVIEW_FIELD_M * 0.94), swathMat);
    swath.name = 'swath';
    swath.position.y = 0.05;
    group.add(swath);
    const rig = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 5), rigMat);
    rig.name = 'rig';
    rig.position.y = 0.45;
    rig.position.z = PREVIEW_FIELD_M * 0.22;
    group.add(rig);
    preview = group;
    syncPreview();
    return { group, ownState: true, ring: { visible: false, children: [] } };
  }

  function setActive(on) {
    active = on;
    preview = null;
    if (panel) panel.hidden = !on;
    if (on) {
      if (!formSig) paintShell();
      paintForm();
    }
  }

  loadStore();
  if (panel) paintShell();

  const api = {
    get active() { return active; },
    get id() { return current().id; },
    get machine() { return current(); },
    ids() { return list.map(item => item.id); },
    labels() { return list.map(machineOptionLabel); },
    select(id) { if (list.some(item => item.id === id)) currentId = id; paintForm(); },
    pass() { return passPreview(current().workWidth); },
    save: persist,
    envelope() { return machineEnvelope(list); },
  };

  return { build, setActive, api, get active() { return active; } };
}
