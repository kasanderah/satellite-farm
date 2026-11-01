// 田块编辑器和阶段编辑器同一套壳：上进度、中节点图、右上资产、右中预览、右下细节。
import { analyzeGraph, hangSlots, jobKey } from './stage-graph.js';
import { FIELD_BLOCK_STORE, cloneFieldBlocks, prepSteps } from './field-blocks.js';
import { installFieldBlocks } from './framework-b.js';
import { mountSoilEditor } from './lab-field.js';

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export function createBlockWorkshop(els) {
  const { viewEl, panel } = els;
  let docs = Object.fromEntries(cloneFieldBlocks().map(doc => [doc.id, doc]));
  let blockId = 'deepridge';
  let active = false;
  let pick = null;
  let sig = '';
  let propSig = '';
  let drag = null;
  let wire = null;

  function current() {
    return docs[blockId];
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(FIELD_BLOCK_STORE) || 'null');
      if (raw?.blocks) {
        for (const [id, doc] of Object.entries(raw.blocks)) {
          if (doc?.graph?.stages) docs[id] = doc;
        }
      }
    } catch { /* 空浏览器 */ }
    for (const doc of cloneFieldBlocks()) if (!docs[doc.id]) docs[doc.id] = doc;
  }

  function persist() {
    const doc = current();
    const report = analyzeGraph(doc.graph);
    const note = panel.querySelector('#fb-note');
    if (report.errors.length) {
      if (note) note.textContent = report.errors[0] + '。没写入。';
      return false;
    }
    const blocks = { ...docs };
    localStorage.setItem(FIELD_BLOCK_STORE, JSON.stringify({ schema: 'ringsheaf.field-block/1', blocks }));
    installFieldBlocks(Object.values(blocks).concat(cloneFieldBlocks().filter(item => !blocks[item.id])));
    installFieldBlocks(Object.values(blocks));
    if (note) note.textContent = '已存。主游戏重读后，整地按这张工序图派车。';
    return true;
  }

  function ensureLayout(graph) {
    graph.layout = graph.layout || { nodes: {} };
    const nodes = graph.layout.nodes;
    if (!nodes.entry) nodes.entry = { x: 24, y: 72 };
    if (!nodes.exit) nodes.exit = { x: 420, y: 72 };
    graph.stages.forEach((stage, i) => {
      if (!nodes[stage.id]) nodes[stage.id] = { x: 150 + i * 170, y: 48 };
      (stage.jobs || []).forEach((job, index) => {
        const key = jobKey(stage.id, index);
        if (!nodes[key]) nodes[key] = { x: nodes[stage.id].x, y: nodes[stage.id].y + 150 };
      });
    });
    return nodes;
  }

  function shell() {
    panel.innerHTML = `<div id="fb-blue">
<div class="fs-zone">田块</div>
<label>当前田块<select id="fb-pick"></select></label>
<label>名称<input id="fb-name" type="text" maxlength="16"></label>
<div class="fs-split">
<label>垄宽 m<input id="fb-width" type="number" min="0.4" max="2.4" step="0.05"></label>
<label>垄数<input id="fb-count" type="number" min="2" max="24" step="1"></label>
</div>
<label>地面颜色<input id="fb-color" type="color"></label>
<label>产量倍率<input id="fb-mul" type="number" min="1" max="3" step="0.05"></label>
<p class="fs-note">倍率只给土豆类，和作物作业的产量倍数相乘。0 到 1 以下按 1 记。</p>
<button type="button" id="fb-save">保存</button>
<p id="fb-note" class="fs-note"></p>
</div>
<div id="fb-stageview"></div>
<div id="fb-purple">
<div class="fs-zone">节点</div>
<div id="fb-prop"></div>
<details class="fs-legacy"><summary>土性曲线</summary><div id="fb-soil"></div></details>
</div>`;
    panel.querySelector('#fb-pick').addEventListener('change', (e) => {
      blockId = e.target.value;
      pick = null;
      sig = '';
      paint();
    });
    panel.querySelector('#fb-name').addEventListener('input', (e) => { current().name = e.target.value; persist(); });
    panel.querySelector('#fb-width').addEventListener('change', (e) => {
      current().ridgeWidth = Math.max(0.4, Math.min(2.4, Number(e.target.value) || 0.75));
      persist();
    });
    panel.querySelector('#fb-count').addEventListener('change', (e) => {
      const count = Math.max(2, Math.min(24, Math.round(Number(e.target.value) || 8)));
      const doc = current();
      doc.ridgeCount = count;
      doc.ridgeWidth = Math.round((128 / count) * 100) / 100;
      const width = panel.querySelector('#fb-width');
      if (width) width.value = doc.ridgeWidth;
      persist();
    });
    panel.querySelector('#fb-color').addEventListener('input', (e) => { current().groundColor = e.target.value; persist(); });
    panel.querySelector('#fb-mul').addEventListener('change', (e) => {
      current().yieldMul = Math.max(1, Math.min(3, Number(e.target.value) || 1));
      persist();
    });
    panel.querySelector('#fb-save').addEventListener('click', persist);
    mountSoilEditor(panel.querySelector('#fb-soil'));
  }

  function paintFields() {
    const doc = current();
    const sel = panel.querySelector('#fb-pick');
    sel.innerHTML = Object.values(docs).map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
    sel.value = blockId;
    const set = (id, value) => {
      const el = panel.querySelector(id);
      if (el && document.activeElement !== el) el.value = value;
    };
    set('#fb-name', doc.name || '');
    set('#fb-width', doc.ridgeWidth ?? 0.75);
    set('#fb-count', doc.ridgeCount ?? 8);
    set('#fb-color', doc.groundColor || '#5c5348');
    set('#fb-mul', doc.yieldMul ?? 1);
    const bar = document.getElementById('fb-bar');
    if (bar) {
      const steps = prepSteps(doc);
      bar.innerHTML = `<div class="fs-zone">工序</div><p class="fs-note">${esc(doc.name)} · ${steps.map(id => id === 'plow' ? '犁地' : id === 'hill' ? '培土' : id).join(' → ') || '还没有工序'}</p>`;
    }
  }

  function boardEl() {
    let el = document.getElementById('fb-board');
    if (!el && viewEl) {
      const bar = document.createElement('div');
      bar.id = 'fb-bar';
      bar.className = 'fs';
      viewEl.appendChild(bar);
      el = document.createElement('div');
      el.id = 'fb-board';
      el.innerHTML = `<div class="fs-board-tools"><span class="fs-note">制造田块。左入右出。硬作业右口接下一段。</span></div><div id="fb-graph"><div id="fb-canvas"><svg id="fb-wires"></svg><div id="fb-nodes"></div></div></div>`;
      viewEl.appendChild(el);
      bind(el);
    }
    return el;
  }

  function nodeHtml(id, cls, pos, role, name, meta, ports) {
    return `<div class="fs-node ${cls}${pick === id ? ' on' : ''}" data-nid="${esc(id)}" style="left:${pos.x}px;top:${pos.y}px">${ports}<small>${esc(role)}</small><b>${esc(name)}</b><em>${esc(meta)}</em></div>`;
  }

  function render(doc, nodes) {
    const cards = doc.graph.stages.map(stage => {
      const pack = hangSlots(stage.jobs || []);
      const hangs = (stage.jobs || []).map((job, index) => `<i class="fs-port hang ${job.kind === 'hard' ? 'hard' : 'soft'}" data-ji="${index}" style="left:${18 + (pack.slots[index] || 0)}px"></i>`).join('');
      const meta = stage.role === 'tail' || stage.role === 'rot' ? '∞' : ((stage.days || 1) + ' 日');
      return nodeHtml(stage.id, stage.role || 'node', nodes[stage.id], stage.role === 'head' ? '头' : (stage.role === 'tail' || stage.role === 'rot' ? '尾' : '一般'), stage.name, meta, `<i class="fs-port in"></i><i class="fs-port out flow"></i>${hangs}`);
    });
    for (const stage of doc.graph.stages) {
      (stage.jobs || []).forEach((job, index) => {
        const key = jobKey(stage.id, index);
        const tone = job.kind === 'hard' ? 'hard' : 'soft';
        const out = job.kind === 'hard' ? '<i class="fs-port out"></i>' : '';
        cards.push(nodeHtml(key, tone, nodes[key], job.kind === 'hard' ? '硬作业' : '软作业', job.name || job.job, job.full ? '整段' : '', `<i class="fs-port up ${tone}"></i>${out}`));
      });
    }
    cards.push(nodeHtml('entry', 'entry', nodes.entry, '入口', '入口', doc.graph.entry.job === 'plow' ? '犁地' : doc.graph.entry.job, '<i class="fs-port out flow"></i>'));
    cards.push(nodeHtml('exit', 'exit', nodes.exit, '出口', '出口', '田块做成', '<i class="fs-port in"></i>'));
    return cards.join('');
  }

  function paintProp() {
    const host = panel.querySelector('#fb-prop');
    if (!host) return;
    const mark = blockId + '|' + (pick || '');
    if (mark === propSig && host.childElementCount) return;
    propSig = mark;
    const doc = current();
    if (!pick) {
      host.innerHTML = `<p class="fs-note">${esc(doc.tip || '')}</p><p class="fs-note">点一个节点。入口是第一趟，硬作业右口接下一趟，出口表示田块做成。</p>`;
      return;
    }
    if (pick === 'entry') {
      host.innerHTML = `<p class="fs-note">入口</p><p class="fs-note">第一趟是${doc.graph.entry.job === 'plow' ? '犁地' : esc(doc.graph.entry.job)}，接到头阶段。</p>`;
      return;
    }
    if (pick === 'exit') {
      host.innerHTML = '<p class="fs-note">出口</p><p class="fs-note">工序走到这里，地写成这种田块，之后才允许种植。</p>';
      return;
    }
    const jobHit = /^job:(.+):(\d+)$/.exec(pick);
    if (jobHit) {
      const stage = doc.graph.stages.find(item => item.id === jobHit[1]);
      const job = stage?.jobs[+jobHit[2]];
      if (!job) { host.innerHTML = ''; return; }
      host.innerHTML = `<p class="fs-note">${job.kind === 'hard' ? '硬作业' : '软作业'}</p><label>名称<input id="fb-job-name" type="text" value="${esc(job.name || '')}"></label><p class="fs-note">能力 ${esc(job.job === 'hill' ? '培土' : job.job === 'plow' ? '犁田' : job.job)}</p>`;
      host.querySelector('#fb-job-name').addEventListener('input', (e) => { job.name = e.target.value; sig = ''; paint(); persist(); });
      return;
    }
    const stage = doc.graph.stages.find(item => item.id === pick);
    if (!stage) { host.innerHTML = ''; return; }
    host.innerHTML = `<p class="fs-note">${stage.role === 'head' ? '头' : '阶段'} · ${esc(stage.name)}</p><label>名称<input id="fb-stage-name" type="text" value="${esc(stage.name || '')}"></label>`;
    host.querySelector('#fb-stage-name').addEventListener('input', (e) => { stage.name = e.target.value; sig = ''; paint(); persist(); });
  }

  function paint() {
    const board = boardEl();
    if (!board) return;
    board.hidden = !active;
    const bar = document.getElementById('fb-bar');
    if (bar) bar.hidden = !active;
    if (!active) return;
    paintFields();
    const doc = current();
    const nodes = ensureLayout(doc.graph);
    const structural = blockId + JSON.stringify(doc.graph.stages) + JSON.stringify(doc.graph.edges) + (pick || '');
    const host = document.getElementById('fb-nodes');
    if (structural !== sig) {
      sig = structural;
      propSig = '';
      host.innerHTML = render(doc, nodes);
    }
    draw(doc);
    paintProp();
  }

  function portPoint(nid, selector) {
    const canvas = document.getElementById('fb-canvas');
    const el = document.querySelector(`#fb-nodes [data-nid="${CSS.escape(nid)}"]`);
    if (!canvas || !el) return null;
    const port = el.querySelector(selector) || el;
    const root = canvas.getBoundingClientRect();
    const box = port.getBoundingClientRect();
    return { x: box.left + box.width / 2 - root.left, y: box.top + box.height / 2 - root.top };
  }

  function curve(a, b) {
    const dx = Math.max(36, Math.abs(b.x - a.x) * 0.45);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  function draw(doc) {
    const svg = document.getElementById('fb-wires');
    const canvas = document.getElementById('fb-canvas');
    if (!svg || !canvas) return;
    let w = 760;
    let h = 420;
    for (const pos of Object.values(doc.graph.layout.nodes)) {
      w = Math.max(w, (pos.x || 0) + 200);
      h = Math.max(h, (pos.y || 0) + 140);
    }
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    const paths = [];
    const push = (a, b, color, dash) => {
      if (!a || !b) return;
      paths.push(`<path d="${curve(a, b)}" fill="none" stroke="${color}" stroke-width="1.5"${dash ? ' stroke-dasharray="4 3"' : ''}/>`);
    };
    push(portPoint('entry', '.out'), portPoint(doc.graph.entry.to, '.in'), '#a2998a', true);
    for (const edge of doc.graph.edges) {
      if (edge.kind === 'hard') {
        const stage = doc.graph.stages.find(item => item.id === edge.from);
        const index = (stage?.jobs || []).findIndex(job => job.job === edge.job && job.kind === 'hard');
        const from = index >= 0 ? jobKey(edge.from, index) : edge.from;
        push(portPoint(from, '.fs-port.out'), portPoint(edge.to, '.in'), '#c4503a', false);
      } else push(portPoint(edge.from, '.out.flow'), portPoint(edge.to, '.in'), '#a2998a', false);
    }
    for (const stage of doc.graph.stages) {
      (stage.jobs || []).forEach((job, index) => {
        push(portPoint(stage.id, `.hang[data-ji="${index}"]`), portPoint(jobKey(stage.id, index), '.up'), job.kind === 'hard' ? '#c4503a' : '#7eb6d6', false);
      });
    }
    svg.innerHTML = paths.join('');
  }

  function bind(board) {
    board.addEventListener('pointerdown', (e) => {
      const node = e.target.closest('.fs-node');
      if (!node) return;
      e.preventDefault();
      pick = node.dataset.nid;
      const pos = current().graph.layout.nodes[pick] || { x: 0, y: 0 };
      const canvas = document.getElementById('fb-canvas').getBoundingClientRect();
      drag = { id: pick, ox: e.clientX - canvas.left - pos.x, oy: e.clientY - canvas.top - pos.y };
      propSig = '';
      sig = '';
      paint();
    });
    board.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const canvas = document.getElementById('fb-canvas').getBoundingClientRect();
      const x = Math.max(8, e.clientX - canvas.left - drag.ox);
      const y = Math.max(8, e.clientY - canvas.top - drag.oy);
      current().graph.layout.nodes[drag.id] = { x, y };
      const el = document.querySelector(`#fb-nodes [data-nid="${CSS.escape(drag.id)}"]`);
      if (el) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
      draw(current());
    });
    board.addEventListener('pointerup', () => {
      if (drag) persist();
      drag = null;
      wire = null;
    });
  }

  load();
  shell();

  return {
    get active() { return active; },
    setActive(on) {
      active = !!on;
      if (panel) panel.hidden = !on;
      sig = '';
      propSig = '';
      if (on) paint();
      else {
        const board = document.getElementById('fb-board');
        const bar = document.getElementById('fb-bar');
        if (board) board.hidden = true;
        if (bar) bar.hidden = true;
      }
    },
  };
}
