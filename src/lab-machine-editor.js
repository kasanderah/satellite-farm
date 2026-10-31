// 工坊农机编辑器的面板和顶视一趟。几何只在打开这一项时建。
import * as THREE from 'three';
import {
  MACHINE_LAB_KEY, MACHINE_ROLES, MACHINE_TAGS, PLACEHOLDER_LIBRARY, PREVIEW_FIELD_M, SYNC_KEYS,
  allocateMachineId, defaultMachines, dropMachine, forkMachine, functionExtras, libraryFromUnknown,
  machineEnvelope, machineOptionLabel, normalizeMachine, passPreview, renameMachine,
} from './machine-lab.js';

const C = hex => new THREE.Color(hex);
const ATTRS = [
  ['power', '功率 kW'],
  ['workWidth', '作业宽度 m'],
  ['speed', '作业速度 m/s'],
  ['bin', '仓容 L'],
];

export function createMachineWorkshop(els) {
  const { panel } = els;
  let list = defaultMachines();
  let currentId = list[0].id;
  let previewModeId = '';
  let active = false;
  let preview = null;
  let formSig = '';
  const laneMat = new THREE.MeshBasicMaterial({ color: C('#e8d8d0'), transparent: true, opacity: 0.35 });
  const swathMat = new THREE.MeshBasicMaterial({ color: C('#e49680'), transparent: true, opacity: 0.72 });
  const rigMat = new THREE.MeshStandardMaterial({ color: C('#d8693c'), roughness: 0.42, metalness: 0.25 });
  const soilMat = new THREE.MeshStandardMaterial({ color: C('#3c342c'), roughness: 0.96, metalness: 0 });

  function current() {
    return list.find(item => item.id === currentId) || list[0] || null;
  }

  function previewMode() {
    const machine = current();
    if (!machine) return null;
    return machine.modes.find(mode => mode.id === previewModeId) || machine.modes[0];
  }

  function note(text) {
    const el = panel.querySelector('#me-status');
    if (el) el.textContent = text || '';
  }

  function esc(text) {
    return String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }

  function commit(machine) {
    const next = normalizeMachine(machine);
    const slot = list.findIndex(item => item.id === machine.id);
    if (slot >= 0) list[slot] = next;
    if (currentId === machine.id) currentId = next.id;
    return next;
  }

  function loadStore() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(MACHINE_LAB_KEY) || 'null'); }
    catch { note('农机存档不是 JSON，先用占位机具'); list = defaultMachines(); currentId = list[0].id; return; }
    if (raw == null) { list = defaultMachines(); currentId = list[0].id; return; }
    const parsed = libraryFromUnknown(raw);
    if (!parsed.ok) {
      list = defaultMachines();
      currentId = list[0].id;
      note(parsed.message || '农机存档读不了，先用占位机具');
      return;
    }
    list = parsed.machines;
    currentId = list[0] ? list[0].id : '';
  }

  function persist() {
    const env = machineEnvelope(list);
    try { localStorage.setItem(MACHINE_LAB_KEY, JSON.stringify(env)); }
    catch { note('这台浏览器写不进农机存档'); return false; }
    note(list.length ? '已写入这台浏览器。主游戏开局、以及回到页面时，读钥匙 ringsheaf.assetlab.machines.v1。' : '已写入空的农机列表。主游戏会清掉覆盖，改回内置机具。');
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
    if (current()) sel.value = current().id;
  }

  function attrValue(mode, key) {
    const value = mode[key];
    return value == null ? '' : String(value);
  }

  function paintModes(machine) {
    const host = panel.querySelector('#me-modes');
    if (!host) return;
    host.innerHTML = machine.modes.map((mode, index) => {
      const fns = [`<option value="">未选</option>`].concat(MACHINE_TAGS.map(tag => (
        `<option value="${esc(tag.id)}"${tag.id === mode.fn ? ' selected' : ''}>${esc(tag.name)}</option>`
      ))).join('');
      const extras = functionExtras(mode.fn).map(field => {
        const val = mode.extra[field.id];
        const opts = field.options.map(([id, name]) => `<option value="${esc(id)}"${id === val ? ' selected' : ''}>${esc(name)}</option>`).join('');
        return `<label>${esc(field.name)}<select data-role="extra" data-extra="${esc(field.id)}" data-mode="${esc(mode.id)}">${opts}</select></label>`;
      }).join('');
      const attrs = ATTRS.map(([key, label]) => `<div class="me-attr">
        <label>${label}<input data-attr="${key}" data-mode="${esc(mode.id)}" inputmode="decimal" autocomplete="off" value="${esc(attrValue(mode, key))}"></label>
        <label class="me-sync"><input type="checkbox" data-sync="${key}" data-mode="${esc(mode.id)}"${machine.sync[key] ? ' checked' : ''}>同步属性</label>
      </div>`).join('');
      return `<article class="me-mode">
        <div class="me-mode-h"><b>模式 ${index + 1}</b><button type="button" data-del-mode="${esc(mode.id)}">删除模式</button></div>
        <label>功能<select data-role="fn" data-mode="${esc(mode.id)}">${fns}</select></label>
        ${extras}
        ${attrs}
      </article>`;
    }).join('');
  }

  function modelNote(machine) {
    if (machine.model.source === 'file' && machine.model.fileName) {
      return `已记下文件名 ${machine.model.fileName}。预览仍按宽度画一趟，文件不进主游戏。`;
    }
    if (machine.model.source === 'library') {
      const row = PLACEHOLDER_LIBRARY.find(item => item.id === machine.model.libraryId);
      const file = row && row.file ? `（${row.file}）` : '';
      return `库里的占位：${row ? row.name : machine.model.libraryId}${file}。预览仍按宽度画一趟，主游戏本轮不换模型。`;
    }
    return '占位。预览按工作宽度画一趟。也可以从库里选现用剪影或已有 glb。';
  }

  function paintForm() {
    paintChoices();
    const machine = current();
    const editing = panel.querySelector('#me-editing');
    const modes = panel.querySelector('#me-modes');
    if (!machine) {
      if (editing) editing.textContent = '没有农机。点新农机再加一台。';
      if (modes) modes.innerHTML = '';
      const pass = panel.querySelector('#me-pass');
      if (pass) pass.textContent = '';
      syncPreview();
      return;
    }
    if (editing) editing.textContent = `正在编辑 ${machine.id}。显示名不改 id。保存后主游戏按这个 id 盖幅宽、速度和仓容。`;
    const name = panel.querySelector('#me-name');
    if (name && document.activeElement !== name) name.value = machine.name;
    const role = panel.querySelector('#me-role');
    if (role) role.value = machine.role;
    paintModes(machine);
    const hitch = panel.querySelector('#me-hitch');
    if (hitch && document.activeElement !== hitch) hitch.value = machine.hitch || '';
    const lib = panel.querySelector('#me-lib');
    if (lib) lib.value = machine.model.source === 'library' ? machine.model.libraryId : '';
    const model = panel.querySelector('#me-model');
    if (model) model.textContent = modelNote(machine);
    paintPass();
  }

  function paintPass() {
    const el = panel.querySelector('#me-pass');
    const mode = previewMode();
    if (!mode) {
      if (el) el.textContent = '';
      syncPreview();
      return;
    }
    const view = passPreview(mode.workWidth, PREVIEW_FIELD_M);
    if (el) el.textContent = `${view.field} m 田上这一趟 ${view.width} m，大约 ${view.lanes} 趟。巷距按这个宽度算。`;
    syncPreview();
  }

  function syncPreview() {
    if (!preview) return;
    const mode = previewMode();
    const view = passPreview(mode ? mode.workWidth : 12.8, PREVIEW_FIELD_M);
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
      const on = i === 0;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(bar, on ? 0.16 : 0.05, view.field * 0.96),
        on ? swathMat : laneMat,
      );
      mesh.position.set(-view.field / 2 + (i + 0.5) * view.lane, on ? 0.1 : 0.04, 0);
      lanes.add(mesh);
    }
    const rig = preview.getObjectByName('rig');
    rig.position.x = -view.field / 2 + view.lane * 0.5;
    rig.scale.set(Math.max(1.1, Math.min(bar * 0.72, 5)), 1, 1);
  }

  function writeAttr(machine, mode, key, raw) {
    const targets = machine.sync[key] ? machine.modes : [mode];
    for (const item of targets) item[key] = raw;
    previewModeId = mode.id;
    return commit(machine);
  }

  function paintShell() {
    panel.innerHTML = `<h3>农机编辑器</h3>
<p class="fs-help">类别下面是模式。一台农机可以有多个模式，每个模式选一个功能，再填这一模式的功率、作业宽度、作业速度和仓容。右边勾上同步属性，这一项就在所有模式里保持一致。顶视仍按当前模式的宽度画趟数。</p>
<label>农机<select id="me-pick"></select></label>
<p id="me-editing" class="fs-note"></p>
<label>显示名<input id="me-name" autocomplete="off"></label>
<label>类别<select id="me-role">${MACHINE_ROLES.map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select></label>
<div class="fs-row"><button type="button" id="me-add-mode">添加模式</button></div>
<div id="me-modes"></div>
<label>挂接（整机，先留着）<input id="me-hitch" autocomplete="off" placeholder="空着表示还没接"></label>
<div class="fs-row">
  <button type="button" id="me-ph">占位</button>
  <label>库里的占位<select id="me-lib"><option value="">不从库选</option>${PLACEHOLDER_LIBRARY.map(row => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('')}</select></label>
  <label>导入模型<input id="me-file" type="file" accept=".glb,.gltf,model/gltf-binary"></label>
</div>
<p id="me-model" class="fs-note"></p>
<p id="me-pass" class="fs-note"></p>
<div class="fs-row">
  <button type="button" id="me-save">保存</button>
  <button type="button" id="me-down">下载 JSON</button>
  <button type="button" id="me-new">新农机</button>
  <button type="button" id="me-drop">删除这台</button>
</div>
<p class="fs-note">新农机复制当前这一台，id 另起。删除这台会整机去掉。保存写 ringsheaf.assetlab.machines.v1。主游戏按 id 盖到内置机具上，不整表替换。模型文件仍不换进田里。</p>
<p id="me-status"></p>`;
    panel.querySelector('#me-pick').addEventListener('change', (e) => {
      currentId = e.target.value;
      previewModeId = '';
      paintForm();
    });
    panel.querySelector('#me-name').addEventListener('change', (e) => {
      const machine = current();
      if (!machine) return;
      renameMachine(machine, e.target.value);
      paintForm();
    });
    panel.querySelector('#me-role').addEventListener('change', (e) => {
      const machine = current();
      if (!machine) return;
      machine.role = e.target.value;
      commit(machine);
      paintForm();
    });
    panel.querySelector('#me-add-mode').addEventListener('click', () => {
      const machine = current();
      if (!machine) return;
      const src = previewMode();
      machine.modes.push({
        fn: '',
        power: src.power,
        workWidth: src.workWidth,
        speed: src.speed,
        bin: src.bin,
        extra: {},
      });
      const next = commit(machine);
      previewModeId = next.modes[next.modes.length - 1].id;
      paintForm();
      note(`已加模式 ${previewModeId}。点保存才写入浏览器。`);
    });
    panel.querySelector('#me-modes').addEventListener('change', (e) => {
      const machine = current();
      const t = e.target;
      if (!machine || !t.dataset) return;
      const mode = machine.modes.find(item => item.id === t.dataset.mode);
      if (t.dataset.sync) {
        const key = t.dataset.sync;
        if (!SYNC_KEYS.includes(key)) return;
        machine.sync[key] = t.checked;
        if (t.checked) {
          const from = machine.modes.find(item => item.id === t.dataset.mode) || previewMode();
          for (const item of machine.modes) item[key] = from[key];
        }
        commit(machine);
        paintForm();
        return;
      }
      if (!mode) return;
      if (t.dataset.role === 'fn') {
        mode.fn = t.value;
        previewModeId = mode.id;
        commit(machine);
        paintForm();
        return;
      }
      if (t.dataset.role === 'extra') {
        mode.extra[t.dataset.extra] = t.value;
        previewModeId = mode.id;
        commit(machine);
        paintForm();
        return;
      }
      if (t.dataset.attr) {
        writeAttr(machine, mode, t.dataset.attr, t.value);
        paintForm();
      }
    });
    panel.querySelector('#me-modes').addEventListener('input', (e) => {
      const t = e.target;
      const machine = current();
      if (!machine || t.dataset.attr !== 'workWidth') return;
      const n = Number(t.value);
      if (!(n > 0)) return;
      const mode = machine.modes.find(item => item.id === t.dataset.mode);
      if (!mode) return;
      writeAttr(machine, mode, 'workWidth', n);
      if (machine.sync.workWidth) {
        for (const input of panel.querySelectorAll('[data-attr="workWidth"]')) {
          if (input !== t) input.value = String(current().modes[0].workWidth);
        }
      }
      paintPass();
    });
    panel.querySelector('#me-modes').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del-mode]');
      const machine = current();
      if (!btn || !machine) return;
      if (machine.modes.length < 2) {
        note('至少留一个模式。整台删掉用下面的按钮。');
        return;
      }
      machine.modes = machine.modes.filter(mode => mode.id !== btn.dataset.delMode);
      const next = commit(machine);
      previewModeId = next.modes[0].id;
      paintForm();
    });
    panel.querySelector('#me-hitch').addEventListener('change', (e) => {
      const machine = current();
      if (!machine) return;
      machine.hitch = e.target.value;
      commit(machine);
    });
    panel.querySelector('#me-ph').addEventListener('click', () => {
      const machine = current();
      if (!machine) return;
      machine.model = { source: 'placeholder', fileName: '', libraryId: '' };
      commit(machine);
      paintForm();
    });
    panel.querySelector('#me-lib').addEventListener('change', (e) => {
      const machine = current();
      if (!machine) return;
      const libraryId = e.target.value;
      machine.model = libraryId
        ? { source: 'library', fileName: '', libraryId }
        : { source: 'placeholder', fileName: '', libraryId: '' };
      commit(machine);
      paintForm();
    });
    panel.querySelector('#me-file').addEventListener('change', (e) => {
      const machine = current();
      if (!machine) return;
      const file = e.target.files && e.target.files[0];
      machine.model = { source: file ? 'file' : 'placeholder', fileName: file ? file.name : '', libraryId: '' };
      commit(machine);
      paintForm();
    });
    panel.querySelector('#me-save').addEventListener('click', () => { persist(); });
    panel.querySelector('#me-down').addEventListener('click', download);
    panel.querySelector('#me-new').addEventListener('click', () => {
      const id = allocateMachineId(list.map(item => item.id));
      const next = forkMachine(current() || defaultMachines()[0], id);
      list.push(next);
      currentId = id;
      previewModeId = '';
      paintForm();
      note(`已另起 ${id}。点保存才写入浏览器。`);
    });
    panel.querySelector('#me-drop').addEventListener('click', () => {
      const machine = current();
      if (!machine) return;
      const id = machine.id;
      list = dropMachine(list, id);
      currentId = list[0] ? list[0].id : '';
      previewModeId = '';
      paintForm();
      note(list.length ? `已删 ${id}。点保存才写入浏览器。` : '已删掉最后一台。点保存会写下空列表。');
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
    get id() { return current() ? current().id : ''; },
    get machine() { return current(); },
    ids() { return list.map(item => item.id); },
    labels() { return list.map(machineOptionLabel); },
    select(id) { if (list.some(item => item.id === id)) { currentId = id; previewModeId = ''; } paintForm(); },
    pass() { return passPreview(previewMode() ? previewMode().workWidth : 12.8); },
    save: persist,
    envelope() { return machineEnvelope(list); },
  };

  return { build, setActive, api, get active() { return active; } };
}
