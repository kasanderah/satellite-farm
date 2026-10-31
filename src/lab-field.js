// 田间阶段编辑器的工坊预览。地面着色沿用 farmAlbedo 田块那一支：
// 噪波土色、垄顶 / 垄沟、冠层盖住、粗糙度，再加蒙版。植株用 plantGeometry + InstancedMesh。
// 不读环带农场格子，也不改主循环。
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { plantGeometry } from './prefabs.js';
import { CROPS, PALETTE } from './_shared.js';
import {
  FIELD_STAGE_SCHEMA, FIELD_STAGE_STORE, FIELD_STAGE_SECONDS_PER_DAY, placeholderFieldDoc, parseFieldStageDoc,
  createSim, stepSim, startJob, cancelWorkOrder, sampleRidge, appearanceOf,
  stageById, stageByGroup, insertGrowthStage, removeGrowthStage, dominant, tally,
  renameStageId, renameStageName, setStageGroup, orderedStageOps, moveStageOp, stageJobStrip, SEQUENCE_GROUPS,
  alignFieldCalendar, jobWindows, PLANTABLE_CROP_IDS, allocateCropId, cropOptionLabel,
  indexCropLibrary, renameCropDisplay, forkCropDocument, setHarvestExit,
  OP_MACHINE_CHOICES, addStageOp, removeStageOp, patchStageOp,
} from './field-stages.js';
import potatoBRaw from '../data/field-stages/potato-b.json' with { type: 'json' };
import lastikaRaw from '../data/field-stages/lastika.json' with { type: 'json' };

const PREVIEW = { width: 36, length: 28 };
// 一条垄至少这么多段，陡壁和平顶才不会被 10 来个顶点收成圆丘。行数最多 16。
const RIDGE_SAMPLES = 64;
const ALONG_SAMPLES = 24;
const SPEEDS = [1, 4, 8, 16];
const SHAPES = ['bush', 'ear', 'stalk', 'tuft', 'rosette'];
const PLANT_CAP = 1400;
const REASON = {
  busy: '上一趟还没走完',
  op: '没有这道作业',
  edge: '这条边没有启用',
  empty: '现在没有可扫的格子',
};

const HELP = `打开：左侧「田间 / 阶段编辑器」。默认是拉斯提卡。主游戏只读这份的 graph。

节点图在中间。可以新建头、尾、一般阶段、软作业、硬作业。从阶段右侧端子拖到下一阶段左侧端子。软作业和硬作业挂在阶段下方。拖动节点改位置。点节点改天数、作业、产量和品质。

底栏仍按天数分格，给预览用。烂地和收获后不按天数占格。

序列 O、A、B、D、E 仍要有，给田面色和预览。主游戏不读这条按天条。保存钥匙仍是 ringsheaf.assetlab.fieldStages.v1。节点位置在 graph.layout，主游戏不读。

整地不在这条链里。主游戏的清地 → 一般田地是旁边的配方，不要写回 O 到 A。`;

function potatoDoc() {
  return parseFieldStageDoc(structuredClone(potatoBRaw));
}

function lastikaDoc() {
  return parseFieldStageDoc(structuredClone(lastikaRaw));
}

function cropVisual(crop) {
  const hex = (key) => PALETTE[key] || key || '#6f6a61';
  return {
    id: crop.id,
    name: crop.name,
    shape: crop.shape,
    height: crop.height,
    row: crop.row,
    along: crop.along,
    young: hex(crop.young),
    ripe: hex(crop.ripe),
    stub: hex(crop.stub),
  };
}

function batteryInk(hex) {
  const n = parseInt(String(hex || '').replace('#', ''), 16);
  if (!Number.isFinite(n)) return '#f4efe8';
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return l > 0.62 ? '#1a140f' : '#f4efe8';
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 100) / 100));
}

function isRotTail(variant) {
  if (!variant) return false;
  return variant.id === 'D2' || /烂/.test(variant.name || '');
}

function isInfiniteStage(stage) {
  if (!stage) return false;
  return stage.group === 'E' || stage.kind === 'post' || stage.kind === 'rot' || stage.role === 'rot' || stage.role === 'tail';
}

// 生长阶段按天数分格。烂地和收获后是无限尾段，不按天数占电量。
function batteryCells(doc) {
  const cells = [];
  const bare = stageByGroup(doc, 'O');
  if (bare) {
    cells.push({ id: bare.id, variant: '', name: bare.name, days: Math.max(0.25, Number(bare.days) || 0.25), color: bare.color || '#6f6a61', infinite: false });
  }
  for (const id of doc.chain || []) {
    const stage = stageById(doc, id);
    if (!stage || cells.some(cell => cell.id === stage.id && !cell.variant)) continue;
    if (isInfiniteStage(stage)) {
      cells.push({ id: stage.id, variant: '', name: stage.name, days: 0, color: stage.color || '#6f6a61', infinite: true });
    } else {
      cells.push({ id: stage.id, variant: '', name: stage.name, days: Math.max(0.25, Number(stage.days) || 0.25), color: stage.color || '#6f6a61', infinite: false });
    }
    if (stage.group === 'D') {
      for (const variant of (stage.variants || []).filter(item => item.auto)) {
        if (isRotTail(variant)) {
          cells.push({ id: stage.id, variant: variant.id, name: variant.name, days: 0, color: variant.color || stage.color || '#6f6a61', infinite: true });
        } else {
          cells.push({ id: stage.id, variant: variant.id, name: variant.name, days: Math.max(0.25, Number(variant.days) || 1), color: variant.color || stage.color || '#6f6a61', infinite: false });
        }
      }
    }
  }
  const post = stageByGroup(doc, 'E');
  if (post && !cells.some(cell => cell.id === post.id && !cell.variant)) {
    cells.push({ id: post.id, variant: '', name: post.name, days: 0, color: post.color || '#6f6a61', infinite: true });
  }
  return cells;
}

function cellWindows(doc, cell) {
  if (cell.variant) return [];
  const days = cell.infinite ? 1 : Math.max(0.25, cell.days);
  return (doc.ops || []).filter(op => op && op.stage === cell.id && !op.reserved && !op.extensions?.framework).map(op => {
    const soft = op.kind === 'optional';
    let from = 0;
    let to = 1;
    if (!cell.infinite && op.window && Number.isFinite(+op.window.from) && Number.isFinite(+op.window.to)) {
      from = Math.max(0, Math.min(1, Number(op.window.from) / days));
      to = Math.max(0, Math.min(1, Number(op.window.to) / days));
    }
    if (!(to > from)) return null;
    const span = op.window ? `${op.window.from}–${op.window.to}` : '整段';
    return { soft, from, to, title: `${op.name} ${span}` };
  }).filter(Boolean);
}

function groundMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.94, metalness: 0 });
  mat.userData.dispose = true;
  mat.customProgramCacheKey = () => 'field-stage-ground';
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aSoil;
attribute vec3 aCanopy;
attribute float aCover;
attribute float aRough;
attribute float aMask;
attribute float aLock;
varying vec3 vSoil;
varying vec3 vCanopy;
varying vec3 vWP;
varying float vCover;
varying float vRough;
varying float vMask;
varying float vLock;
varying float vH;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSoil = aSoil;
vCanopy = aCanopy;
vCover = aCover;
vRough = aRough;
vMask = aMask;
vLock = aLock;
vH = transformed.y;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSoil;
varying vec3 vCanopy;
varying vec3 vWP;
varying float vCover;
varying float vRough;
varying float vMask;
varying float vLock;
varying float vH;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float n1 = fbm(vWP.xz / 7.0);
float n2 = vnoise(vWP.xz / 2.4);
vec3 soil = vSoil * (1.28 + 0.16 * n1);
float crest = smoothstep(0.02, 0.18, vH);
vec3 furrow = soil * vec3(0.46, 0.42, 0.38);
vec3 top = soil * vec3(1.16, 1.06, 0.92);
vec3 col = mix(furrow, top, crest);
col *= clamp(0.82 + dFdx(vH) * 16.0, 0.48, 1.4);
vec3 canopy = vCanopy * (1.0 + (n2 - 0.5) * 0.25);
col = mix(col, canopy, crest * vCover);
if (vMask < 0.5) col *= 0.72;
if (vLock > 0.5 && vMask < 0.5) {
  float hatch = step(0.55, fract(vWP.x * 0.35 + vWP.z * 0.22));
  col *= 0.78;
  col = mix(col, vec3(0.42, 0.28, 0.24), hatch * 0.22);
}
diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(vRough, 0.04, 1.0);');
  };
  return mat;
}

function makeMachine() {
  const g = new THREE.Group();
  const mat = (hex, rough) => {
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0.35 });
    m.userData.dispose = true;
    return m;
  };
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 1.55), mat(PALETTE.paper, 0.55));
  body.position.set(0, 0.7, 0);
  body.castShadow = true;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.7, 1.25), mat(PALETTE.haze, 0.35));
  cab.position.set(-0.15, 1.35, 0);
  cab.castShadow = true;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.16), mat(PALETTE.harvest, 0.4));
  mast.position.set(-0.2, 2.2, 0);
  mast.castShadow = true;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.7), mat(PALETTE.zone, 0.4));
  nose.name = 'nose';
  nose.castShadow = true;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 1.7), mat(PALETTE.data, 0.35));
  tail.name = 'tail';
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 2.1), mat(PALETTE.harvest, 0.45));
  bar.name = 'bar';
  bar.position.y = 0.75;
  g.add(body, cab, mast, nose, tail, bar);
  g.scale.setScalar(1.7);
  g.visible = false;
  return g;
}

export function createFieldWorkshop(els) {
  const { panel, bar, viewEl } = els;
  const builtin = CROPS.filter(c => c.plantable).map(cropVisual);
  let docs = { lastika: lastikaDoc() };
  let cropId = 'lastika';
  let sim = null;
  let playing = false;
  let speed = 1;
  let inspect = null;
  let selected = 'O';
  let demo = null;
  let note = '';
  let dirty = true;
  let curveDirty = true;
  let listSig = '';
  let editorSig = '';
  let jobsSig = '';
  let ganttHtml = '';
  let graphPick = null;
  let graphSig = '';
  let propSig = '';
  let nodeDrag = null;
  let wireDrag = null;
  let dragPt = null;
  let view = null;
  let lastNow = 0;
  let active = false;

  function current() {
    if (!docs[cropId]) {
      if (cropId === 'potato') docs.potato = potatoDoc();
      else {
        const seed = builtin.find(c => c.id === cropId) || { id: cropId, name: cropId, shape: 'bush', height: 0.5, row: 0.8, along: 0.4, young: PALETTE.oliveDp, ripe: PALETTE.ochre, stub: PALETTE.rust };
        docs[cropId] = placeholderFieldDoc(seed);
      }
    }
    return docs[cropId];
  }

  function loadStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(FIELD_STAGE_STORE) || 'null');
      if (!raw || !raw.crops) return;
      const pairs = [];
      for (const [key, doc] of Object.entries(raw.crops)) {
        try { pairs.push({ key, doc: parseFieldStageDoc(doc) }); } catch { /* 坏档跳过，用占位 */ }
      }
      const indexed = indexCropLibrary(pairs);
      if (!indexed.lastika) indexed.lastika = lastikaDoc();
      docs = indexed;
      cropId = 'lastika';
    } catch { /* 空浏览器 */ }
  }

  function esc(text) {
    return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function chainDays(doc) {
    let sum = 0;
    for (const id of doc.chain || []) {
      const st = stageById(doc, id);
      if (st) sum += Number(st.days) || 0;
    }
    return Math.round(sum * 100) / 100;
  }

  function calendarError(doc) {
    try {
      const aligned = alignFieldCalendar(doc);
      jobWindows(doc, aligned);
      return '';
    } catch (err) {
      return err.message || '阶段对不齐';
    }
  }

  function graphError(doc) {
    if ((doc.cropId || cropId) !== 'lastika') return '';
    const graph = doc.graph;
    if (!graph || !graph.entry || !Array.isArray(graph.stages) || !Array.isArray(graph.edges)) return '拉斯提卡缺少阶段图';
    if (graph.edges.some(edge => edge.kind !== 'hard' && edge.kind !== 'natural')) return '阶段图的边只能是 hard 或 natural';
    const heads = graph.stages.filter(stage => stage.role === 'head');
    const tails = graph.stages.filter(stage => stage.role === 'tail');
    const rots = graph.stages.filter(stage => stage.role === 'rot');
    if (heads.length !== 1 || tails.length !== 1 || rots.length !== 1) return '阶段图要有一个头、烂地、以及收获后';
    if (graph.edges.some(edge => edge.to === heads[0].id)) return '头阶段不能从作物阶段进来';
    for (const end of [...tails, ...rots]) {
      if (Number(end.days) > 0) return '尾阶段没有时长';
      const out = graph.edges.filter(edge => edge.from === end.id);
      if (!out.length || out.some(edge => edge.kind !== 'hard' || edge.to !== 'exit')) return '尾阶段只留收拾硬边';
    }
    const mature = graph.stages.find(stage => stage.id === 'mature');
    if (!mature || mature.role === 'tail' || mature.role === 'rot') return '成熟不是尾阶段';
    if (!graph.edges.some(edge => edge.from === 'mature' && edge.kind === 'natural' && edge.to === rots[0].id)) return '成熟到点要能进烂地';
    if (graph.entry.job !== 'sow' || graph.entry.to !== heads[0].id) return '作物图从播种进入头阶段';
    return '';
  }

  function persist() {
    const doc = current();
    const err = calendarError(doc);
    if (err) {
      note = err + '。没写入。阶段合计 ' + chainDays(doc) + ' 日，总周期 ' + (Number.isFinite(+doc.cycle) ? doc.cycle : '未定') + ' 日。';
      paintStatus();
      return false;
    }
    const gerr = graphError(doc);
    if (gerr) {
      note = gerr + '。没写入。';
      paintStatus();
      return false;
    }
    const crops = { ...docs };
    const payload = { schema: FIELD_STAGE_SCHEMA, cropId: 'lastika', crops };
    localStorage.setItem(FIELD_STAGE_STORE, JSON.stringify(payload));
    note = '已存进这台浏览器';
    return true;
  }

  function ensureSim() {
    const doc = current();
    if (!sim || sim.rows !== doc.rows || sim.along !== doc.grid.along) {
      sim = createSim(doc);
      dirty = true;
    }
    return sim;
  }

  function resetSim() {
    sim = createSim(current());
    demo = null;
    inspect = null;
    playing = false;
    note = '';
    dirty = true;
  }

  function runOp(opId, coverage = 1) {
    inspect = null;
    const doc = current();
    const started = startJob(ensureSim(), doc, opId, coverage);
    if (!started.ok) {
      note = REASON[started.reason] || '没开始';
      return started;
    }
    playing = true;
    note = started.op.name + ' · ' + started.count + ' 格';
    dirty = true;
    return started;
  }

  function driveDemo() {
    if (!demo || !sim || sim.job) return;
    const doc = current();
    const info = tally(sim);
    const go = (opId, coverage, step) => {
      const started = startJob(sim, doc, opId, coverage);
      if (started.ok) demo.step = step;
      else demo.step = step;
      dirty = true;
    };
    const findOp = (pred) => doc.ops.find(pred);
    if (demo.kind === 'lastika') {
      const sow = findOp(op => op.via === 'sow');
      const harvest = findOp(op => op.via === 'harvest');
      const clear = findOp(op => op.via === 'clear');
      const ripeId = stageByGroup(doc, 'D')?.id;
      if (demo.step === 'sow') {
        if (sow) go(sow.id, 1, 'grow');
      } else if (demo.step === 'grow') {
        if (ripeId && (info.phases[ripeId] || 0) > info.total * 0.45 && harvest) go(harvest.id, 1, 'harvest');
      } else if (demo.step === 'harvest') {
        if (clear) go(clear.id, 1, 'clear');
      } else if (demo.step === 'clear') {
        demo = null;
        playing = false;
        note = '拉斯提卡走完：播种、成熟、收割、收拾。整地不在这条链里。';
      }
      return;
    }
    const till = findOp(op => op.via === 'till') || findOp(op => op.kind === 'special' && op.breaksMask);
    const sow = findOp(op => op.writesMask);
    const touch = findOp(op => op.kind === 'optional' && op.requiresMask);
    const harvest = findOp(op => op.via === 'harvest');
    const clear = findOp(op => op.via === 'clear');
    if (demo.step === 'o3') {
      if ((info.variants['O/O3'] || 0) > info.total * 0.55 && till) go(till.id, 1, 'till');
    } else if (demo.step === 'till') {
      if (sow) go(sow.id, 0.5, 'sow');
    } else if (demo.step === 'sow') {
      if (touch) go(touch.id, 1, 'water');
      else demo.step = 'grow';
    } else if (demo.step === 'water') demo.step = 'grow';
    else if (demo.step === 'grow') {
      const ripe = (info.variants['D/D1'] || 0) + (info.variants['D/D2'] || 0);
      if (info.mask > 0 && ripe > info.mask * 0.4 && harvest) go(harvest.id, 1, 'harvest');
    } else if (demo.step === 'harvest') {
      if (clear) go(clear.id, 1, 'clear');
    }
    else if (demo.step === 'clear') {
      demo = null;
      playing = false;
      note = '整链走完：半田、O3、D1，再清回空地';
    }
  }

  function paintShell() {
    panel.innerHTML = `<h3>田间阶段</h3>
<label>作物<select id="fs-crop"></select></label>
<p id="fs-editing" class="fs-note"></p>
<label>显示名<input id="fs-name" type="text" maxlength="24" placeholder="显示名"></label>
<p id="fs-now" class="fs-note"></p>
<p class="fs-note">节点图在中间。拖节点，从右侧端子接到下一阶段。软作业和硬作业挂在阶段下方。底栏仍按天数分格。</p>
<div id="fs-gantt" class="fs-gantt" hidden></div>
<div id="fs-stages"></div>
<div id="fs-edit"></div>
<div id="fs-jobs"></div>
<canvas id="fs-curve"></canvas>
<p class="fs-note">横轴 垄宽 · 纵轴 高度。拖点。双击加点，右键删点。</p>
<div id="fs-chain"></div>
<div class="fs-split">
<label>过渡<select id="fs-trans">
<option value="instant|window">瞬间</option>
<option value="scatter|window">散点 · 窗内</option>
<option value="scatter|full">散点 · 全周期</option>
<option value="sweep|window">推进 · 窗内</option>
<option value="sweep|full">推进 · 全周期</option>
</select></label>
<label>窗口（游戏日）<input id="fs-window" type="number" min="0.25" max="80" step="0.25"></label>
<label>总周期（游戏日）<input id="fs-cycle" type="number" min="1" max="800" step="0.25"></label>
</div>
<div class="fs-split">
<label>行数（全阶段连锁）<input id="fs-rows" type="number" min="4" max="16" step="1"></label>
<label>沿行格数<input id="fs-along" type="number" min="6" max="28" step="1"></label>
</div>
<div class="fs-split">
<label>植株模型<select id="fs-shape">${SHAPES.map(s => `<option value="${s}">${s}</option>`).join('')}</select></label>
<label>株高 m<input id="fs-height" type="number" min="0.1" max="3" step="0.05"></label>
</div>
<label>株距 m<input id="fs-plant-along" type="number" min="0.25" max="1.4" step="0.05"></label>
<div id="fs-edges"></div>
<p id="fs-mach" class="fs-note"></p>
<div class="fs-row">
<button type="button" id="fs-save">保存</button>
<button type="button" id="fs-dl">下载 JSON</button>
<button type="button" id="fs-reset-doc">恢复占位</button>
<button type="button" id="fs-new">新作物</button>
</div>
<p class="fs-note">新作物复制当前阶段链，另起 id。主游戏种植只读拉斯提卡。整地不写进这条链。</p>
<p id="fs-note" class="fs-note"></p>
<p class="fs-help">${HELP.replace(/\n/g, '<br>')}</p>`;

    bar.innerHTML = `<div id="fs-status"></div>
<div id="fs-bar-gantt" class="fs-gantt"></div>
<div class="fs-row" id="fs-transport"></div>
<div class="fs-row" id="fs-opbar"></div>`;

    const speeds = SPEEDS.map(n => `<button type="button" data-speed="${n}">${n}×</button>`).join('');
    bar.querySelector('#fs-transport').innerHTML = `<button type="button" data-act="play">播放</button>
<button type="button" data-act="pause">暂停</button>
<button type="button" data-act="reset">重置</button>
<button type="button" data-act="demo">整链演示</button>${speeds}`;
    paintOps();

    panel.querySelector('#fs-crop').addEventListener('change', (e) => {
      cropId = e.target.value;
      selected = 'O';
      resetSim();
      paintDynamic(true);
      persist();
    });
    panel.querySelector('#fs-name').addEventListener('input', (e) => {
      const name = e.target.value.trim();
      if (!name) return;
      renameCropDisplay(current(), name);
      const opt = panel.querySelector('#fs-crop option[value="' + cropId + '"]');
      if (opt) opt.textContent = cropOptionLabel(name, cropId);
      persist();
    });
    panel.querySelector('#fs-trans').addEventListener('change', (e) => {
      const [template, span] = e.target.value.split('|');
      current().transition.template = template;
      current().transition.span = span;
      persist();
    });
    panel.querySelector('#fs-window').addEventListener('input', (e) => {
      current().transition.windowDays = clampNum(e.target.value, 0.25, 80, 1.2);
      persist();
    });
    panel.querySelector('#fs-cycle').addEventListener('input', (e) => {
      current().cycle = clampNum(e.target.value, 0.25, 800, chainDays(current()));
      persist();
    });
    panel.querySelector('#fs-rows').addEventListener('change', (e) => {
      current().rows = clampNum(e.target.value, 4, 16, 8);
      resetSim();
      persist();
    });
    panel.querySelector('#fs-along').addEventListener('change', (e) => {
      current().grid.along = clampNum(e.target.value, 6, 28, 14);
      resetSim();
      persist();
    });
    panel.querySelector('#fs-shape').addEventListener('change', (e) => {
      current().plant.shape = e.target.value;
      dirty = true;
      persist();
    });
    panel.querySelector('#fs-height').addEventListener('input', (e) => {
      current().plant.height = clampNum(e.target.value, 0.1, 3, 0.55);
      dirty = true;
      persist();
    });
    panel.querySelector('#fs-plant-along').addEventListener('input', (e) => {
      current().plant.along = clampNum(e.target.value, 0.25, 1.4, 0.4);
      dirty = true;
      persist();
    });
    panel.querySelector('#fs-save').addEventListener('click', persist);
    panel.querySelector('#fs-dl').addEventListener('click', download);
    panel.querySelector('#fs-reset-doc').addEventListener('click', () => {
      if (cropId === 'lastika') docs.lastika = lastikaDoc();
      else if (cropId === 'potato') docs.potato = potatoDoc();
      else {
        const seed = builtin.find(c => c.id === cropId) || cropVisual({ id: cropId, name: current().cropName, shape: current().plant.shape, height: current().plant.height, row: current().plant.row, along: current().plant.along, young: current().plant.young, ripe: current().plant.ripe, stub: current().plant.stub });
        docs[cropId] = placeholderFieldDoc({ ...seed, id: cropId, name: seed.name || current().cropName });
      }
      resetSim();
      paintDynamic(true);
      persist();
      note = cropId === 'lastika' ? '已恢复仓库里的拉斯提卡' : '已恢复占位链';
    });
    panel.querySelector('#fs-new').addEventListener('click', () => {
      const source = current();
      const sourceId = source.cropId || cropId;
      const id = allocateCropId(Object.keys(docs));
      docs[id] = forkCropDocument(source, id);
      cropId = id;
      selected = 'O';
      resetSim();
      paintDynamic(true);
      if (persist()) {
        note = '已新建 ' + id + '，从 ' + sourceId + ' 复制阶段。主游戏种植菜单不会出现 ' + id + '。';
        paintStatus();
      }
    });
    panel.querySelector('#fs-stages').addEventListener('click', (e) => {
      const b = e.target.closest('[data-stage]');
      if (!b) return;
      selectStage(b.dataset.stage, '');
    });
    panel.querySelector('#fs-stages').addEventListener('input', (e) => {
      const id = e.target.dataset.days;
      if (!id) return;
      const st = stageById(current(), id);
      st.days = clampNum(e.target.value, 0.25, 400, st.days);
      dirty = true;
      paintGantt();
      persist();
    });
    panel.querySelector('#fs-gantt').addEventListener('click', onGantt);
    bar.querySelector('#fs-bar-gantt').addEventListener('click', onGantt);
    bar.addEventListener('click', (e) => {
      const speedBtn = e.target.closest('[data-speed]');
      if (speedBtn) { speed = Number(speedBtn.dataset.speed); paintTransport(); return; }
      const opBtn = e.target.closest('[data-op]');
      if (opBtn) { runOp(opBtn.dataset.op, Number(opBtn.dataset.cov)); paintTransport(); return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'play') play();
      if (act.dataset.act === 'pause') { playing = false; demo = null; }
      if (act.dataset.act === 'reset') resetSim();
      if (act.dataset.act === 'demo') startDemo();
      if (act.dataset.act === 'cancel') {
        const res = cancelWorkOrder(ensureSim(), current());
        note = res.ok ? '已取消这一趟扫田' : '现在没有在扫的作业';
        dirty = true;
      }
      paintTransport();
    });
    const canvas = panel.querySelector('#fs-curve');
    canvas.addEventListener('pointerdown', onCurveDown);
    canvas.addEventListener('pointermove', onCurveMove);
    canvas.addEventListener('pointerup', () => {
      if (dragPt != null) persist();
      dragPt = null;
    });
    canvas.addEventListener('dblclick', onCurveAdd);
    canvas.addEventListener('contextmenu', onCurveRemove);
  }

  function onGantt(e) {
    const b = e.target.closest('[data-stage]');
    if (!b) return;
    selectStage(b.dataset.stage, b.dataset.variant || '');
  }

  function selectStage(id, variant) {
    selected = id;
    inspect = { phase: id, variant: variant || '' };
    playing = false;
    demo = null;
    dirty = true;
    curveDirty = true;
    editorSig = '';
    jobsSig = '';
    paintDynamic(false);
  }

  function play() {
    inspect = null;
    playing = true;
    dirty = true;
    note = '';
  }

  function startDemo() {
    resetSim();
    speed = 4;
    playing = true;
    if (cropId === 'lastika') {
      demo = { kind: 'lastika', step: 'sow' };
      note = '拉斯提卡：播种，等到成熟，再收割、收拾。整地不在这条链里。';
    } else {
      demo = { kind: 'archive', step: 'o3' };
      note = '归档链演示。主游戏不读这份。';
    }
    paintTransport();
  }

  function cropOptions() {
    const ids = [];
    if (docs.lastika) ids.push('lastika');
    for (const id of PLANTABLE_CROP_IDS) {
      if (!ids.includes(id) && (builtin.some(c => c.id === id) || docs[id])) ids.push(id);
    }
    const extra = Object.keys(docs).filter(id => !ids.includes(id)).sort();
    ids.push(...extra);
    const sel = panel.querySelector('#fs-crop');
    const prev = cropId;
    sel.innerHTML = ids.map(id => {
      const doc = docs[id];
      const known = builtin.find(c => c.id === id);
      const name = (doc && (doc.cropName || doc.name)) || (known && known.name) || id;
      const tag = id === 'potato' ? '归档 · 主游戏不用' : cropOptionLabel(name, id);
      return `<option value="${esc(id)}">${esc(id === 'potato' ? name + ' · ' + tag : tag)}</option>`;
    }).join('');
    if (ids.includes(prev)) sel.value = prev;
  }

  function paintEditing() {
    const el = panel.querySelector('#fs-editing');
    if (!el) return;
    const plantable = PLANTABLE_CROP_IDS.includes(cropId);
    el.textContent = cropId === 'lastika'
      ? '正在编辑拉斯提卡。主游戏只读这份：阶段名、软窗、田面色、生长钟。成熟天数和软窗都是世界日。1× 下一世界日约 12 现实分钟。整地不在这条链里。'
      : cropId === 'potato'
      ? '商品薯 B 是归档。主游戏不用。'
      : plantable
      ? '正在编辑 ' + cropId + '。主游戏种植不读这份。'
      : '正在编辑 ' + cropId + '。主游戏种植不读这份。';
  }

  function paintTransport() {
    bar.querySelectorAll('[data-act="play"]').forEach(b => b.classList.toggle('on', playing));
    bar.querySelectorAll('[data-act="pause"]').forEach(b => b.classList.toggle('on', !playing));
    bar.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', Number(b.dataset.speed) === speed));
    paintOps();
  }

  function paintOps() {
    const host = bar.querySelector('#fs-opbar');
    if (!host) return;
    const doc = current();
    const buttons = [];
    for (const op of doc.ops) {
      if (op.reserved) {
        const edge = doc.edges.find(e => e.enabled && e.via === op.via);
        if (!edge) continue;
      }
      buttons.push(`<button type="button" data-op="${op.id}" data-cov="1">${op.name}</button>`);
      if (op.writesMask) buttons.push(`<button type="button" data-op="${op.id}" data-cov="0.5">半田</button>`);
    }
    host.innerHTML = buttons.join('') + '<button type="button" data-act="cancel">取消扫田</button>';
  }

  const GRAPH_JOBS = [
    { job: 'topdress', kind: 'soft', name: '追肥' },
    { job: 'hill', kind: 'soft', name: '培土' },
    { job: 'harvest', kind: 'hard', name: '收获' },
    { job: 'tidy', kind: 'hard', name: '收拾' },
    { job: 'sow', kind: 'hard', name: '播种' },
  ];

  function roleLabel(stage) {
    if (!stage) return '';
    if (stage.role === 'head') return '头';
    if (stage.role === 'rot') return '尾 · 烂地';
    if (stage.role === 'tail') return '尾 · 收获后';
    return '阶段';
  }

  function jobKey(stageId, index) {
    return 'job:' + stageId + ':' + index;
  }

  function parseJobKey(id) {
    const m = /^job:(.+):(\d+)$/.exec(id || '');
    if (!m) return null;
    return { stageId: m[1], index: +m[2] };
  }

  function graphStage(id) {
    const graph = current().graph;
    if (!graph) return null;
    return graph.stages.find(stage => stage.id === id) || null;
  }

  function freshGraphId(graph, base) {
    const ids = new Set(graph.stages.map(stage => stage.id));
    if (!ids.has(base)) return base;
    let n = 2;
    while (ids.has(base + n)) n += 1;
    return base + n;
  }

  function ensureLayout(graph) {
    if (!graph.layout || typeof graph.layout !== 'object' || Array.isArray(graph.layout)) graph.layout = { nodes: {} };
    const nodes = graph.layout.nodes || (graph.layout.nodes = {});
    const seen = new Set();
    const order = [];
    let cur = graph.stages.find(stage => stage.role === 'head')?.id || null;
    let guard = 0;
    while (cur && !seen.has(cur) && guard < 24) {
      guard += 1;
      seen.add(cur);
      order.push(cur);
      const next = (graph.edges || []).find(edge => edge.from === cur && edge.to !== 'exit' && !seen.has(edge.to));
      cur = next ? next.to : null;
    }
    for (const stage of graph.stages) if (!seen.has(stage.id)) order.push(stage.id);
    order.forEach((id, i) => {
      if (!nodes[id]) nodes[id] = { x: 12 + i * 118, y: 36 };
    });
    if (!nodes.exit) nodes.exit = { x: 12 + order.length * 118, y: 36 };
    for (const stage of graph.stages) {
      (stage.jobs || []).forEach((job, index) => {
        const key = jobKey(stage.id, index);
        if (!nodes[key]) {
          const host = nodes[stage.id] || { x: 12, y: 36 };
          nodes[key] = { x: host.x, y: host.y + 108 + index * 74 };
        }
      });
    }
    return nodes;
  }

  function graphStructuralSig(doc) {
    const graph = doc.graph;
    if (!graph) return cropId + ':none';
    const stages = (graph.stages || []).map(stage => stage.id + '/' + stage.role + '/' + (stage.jobs || []).map(job => job.job + ':' + job.kind).join(',')).join(';');
    const edges = (graph.edges || []).map(edge => edge.from + '>' + edge.to + ':' + edge.kind).join(';');
    return cropId + '|' + (graphPick || '') + '|' + stages + '|' + edges;
  }

  function boardEl() {
    if (!viewEl) return null;
    let el = document.getElementById('fs-board');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fs-board';
      el.hidden = true;
      el.innerHTML = `<div class="fs-board-tools"><button type="button" data-gadd="head">头</button><button type="button" data-gadd="tail">尾</button><button type="button" data-gadd="node">一般阶段</button><button type="button" data-gadd="soft">软作业</button><button type="button" data-gadd="hard">硬作业</button><button type="button" data-gadd="drop">删除</button></div><div id="fs-graph"><div id="fs-canvas"><svg id="fs-wires"></svg><div id="fs-nodes"></div></div></div><div id="fs-prop"></div>`;
      viewEl.appendChild(el);
      bindBoard(el);
    }
    return el;
  }

  function nodeHtml(id, cls, pos, role, name, meta, ports) {
    const on = graphPick === id ? ' on' : '';
    return `<div class="fs-node ${cls}${on}" data-nid="${esc(id)}" style="left:${pos.x}px;top:${pos.y}px">${ports}<small>${esc(role)}</small><b>${esc(name)}</b><em>${esc(meta)}</em></div>`;
  }

  function renderNodes(graph, nodes) {
    const cards = graph.stages.map(stage => {
      const pos = nodes[stage.id] || { x: 16, y: 28 };
      const meta = stage.role === 'rot' || stage.role === 'tail' ? '∞' : (stage.days + ' 日');
      const inn = stage.role === 'head' ? '' : '<i class="fs-port in"></i>';
      return nodeHtml(stage.id, stage.role || 'node', pos, roleLabel(stage), stage.name || stage.id, meta, inn + '<i class="fs-port out"></i><i class="fs-port hang"></i>');
    });
    for (const stage of graph.stages) {
      (stage.jobs || []).forEach((job, index) => {
        const key = jobKey(stage.id, index);
        const pos = nodes[key] || { x: 16, y: 160 };
        const meta = job.full ? '整段' : ((job.from ?? 0) + '–' + (job.to ?? 0));
        cards.push(nodeHtml(key, job.kind === 'hard' ? 'hard' : 'soft', pos, job.kind === 'hard' ? '硬作业' : '软作业', job.name || job.job, meta, '<i class="fs-port up"></i>'));
      });
    }
    const exit = nodes.exit || { x: 16, y: 28 };
    cards.push(nodeHtml('exit', 'exit', exit, '出口', '出口', '', '<i class="fs-port in"></i>'));
    return cards.join('');
  }

  function syncNodeText(graph, nodes) {
    const host = document.getElementById('fs-nodes');
    if (!host) return;
    const apply = (id, name, meta) => {
      const el = host.querySelector(`[data-nid="${CSS.escape(id)}"]`);
      if (!el) return;
      const pos = nodes[id];
      if (pos) { el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px'; }
      const b = el.querySelector('b');
      const em = el.querySelector('em');
      if (b && b.textContent !== name) b.textContent = name;
      if (em && em.textContent !== meta) em.textContent = meta;
      el.classList.toggle('on', graphPick === id);
    };
    for (const stage of graph.stages) {
      const meta = stage.role === 'rot' || stage.role === 'tail' ? '∞' : (stage.days + ' 日');
      apply(stage.id, stage.name || stage.id, meta);
    }
    for (const stage of graph.stages) {
      (stage.jobs || []).forEach((job, index) => {
        const meta = job.full ? '整段' : ((job.from ?? 0) + '–' + (job.to ?? 0));
        apply(jobKey(stage.id, index), job.name || job.job, meta);
      });
    }
    apply('exit', '出口', '');
  }

  function canvasPoint(clientX, clientY) {
    const canvas = document.getElementById('fs-canvas');
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function portPoint(nid, selector) {
    const host = document.getElementById('fs-nodes');
    const canvas = document.getElementById('fs-canvas');
    if (!host || !canvas) return null;
    const el = host.querySelector(`[data-nid="${CSS.escape(nid)}"]`);
    if (!el) return null;
    const port = el.querySelector(selector) || el;
    const root = canvas.getBoundingClientRect();
    const box = port.getBoundingClientRect();
    return { x: box.left + box.width / 2 - root.left, y: box.top + box.height / 2 - root.top };
  }

  function wirePath(a, b, vertical) {
    if (vertical) {
      const dy = Math.max(28, Math.abs(b.y - a.y) * 0.45);
      return `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`;
    }
    const dx = Math.max(36, Math.abs(b.x - a.x) * 0.45);
    const dir = b.x >= a.x ? 1 : -1;
    return `M ${a.x} ${a.y} C ${a.x + dx * dir} ${a.y}, ${b.x - dx * dir} ${b.y}, ${b.x} ${b.y}`;
  }

  function drawWires(graph) {
    const svg = document.getElementById('fs-wires');
    const canvas = document.getElementById('fs-canvas');
    if (!svg || !canvas || !graph) return;
    const nodes = graph.layout.nodes;
    let w = 960;
    let h = 560;
    for (const id of Object.keys(nodes)) {
      w = Math.max(w, (nodes[id].x || 0) + 220);
      h = Math.max(h, (nodes[id].y || 0) + 150);
    }
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.style.width = w + 'px';
    svg.style.height = h + 'px';
    const paths = [];
    for (const edge of graph.edges || []) {
      const a = portPoint(edge.from, '.out');
      const b = portPoint(edge.to, '.in');
      if (!a || !b) continue;
      const color = edge.kind === 'hard' ? '#c4503a' : '#a2998a';
      paths.push(`<path d="${wirePath(a, b, false)}" fill="none" stroke="${color}" stroke-width="1.5"/>`);
    }
    for (const stage of graph.stages) {
      (stage.jobs || []).forEach((job, index) => {
        const a = portPoint(stage.id, '.hang');
        const b = portPoint(jobKey(stage.id, index), '.up');
        if (!a || !b) return;
        const color = job.kind === 'hard' ? '#c4503a' : '#7eb6d6';
        paths.push(`<path d="${wirePath(a, b, true)}" fill="none" stroke="${color}" stroke-width="1.5"/>`);
      });
    }
    if (wireDrag) {
      const fromSel = wireDrag.kind === 'hang' ? '.hang' : '.out';
      const a = portPoint(wireDrag.from, fromSel);
      const b = canvasPoint(wireDrag.x, wireDrag.y);
      if (a) paths.push(`<path d="${wirePath(a, b, wireDrag.kind === 'hang')}" fill="none" stroke="#d8693c" stroke-width="1.5" stroke-dasharray="4 3"/>`);
    }
    svg.innerHTML = paths.join('');
  }

  function paintProp() {
    const host = document.getElementById('fs-prop');
    if (!host) return;
    const sig = cropId + '|' + (graphPick || '');
    if (sig === propSig && host.childElementCount) return;
    propSig = sig;
    const graph = current().graph;
    if (!graph || !graphPick || graphPick === 'exit') {
      host.innerHTML = '';
      return;
    }
    const located = parseJobKey(graphPick);
    if (located) {
      const stage = graphStage(located.stageId);
      const job = stage && stage.jobs[located.index];
      if (!job) { host.innerHTML = ''; return; }
      const options = GRAPH_JOBS.map(item => `<option value="${item.job}"${item.job === job.job ? ' selected' : ''}>${item.name}</option>`).join('');
      const windowed = job.full ? '' : `<label>起<input id="gp-from" type="number" step="0.25" value="${job.from ?? 0}"></label><label>止<input id="gp-to" type="number" step="0.25" value="${job.to ?? 0}"></label>`;
      host.innerHTML = `<label>作业<select id="gp-job">${options}</select></label>${windowed}<label>产量倍数<input id="gp-yield" type="number" step="0.1" value="${job.yieldMul ?? ''}"></label><label>品质加<input id="gp-qual" type="number" step="1" value="${job.qualityAdd ?? ''}"></label>`;
      const touchJob = () => { graphSig = ''; paintGraph(); persist(); };
      host.querySelector('#gp-job').addEventListener('change', (e) => {
        const preset = GRAPH_JOBS.find(item => item.job === e.target.value);
        if (!preset) return;
        job.job = preset.job;
        job.kind = preset.kind;
        job.name = preset.name;
        propSig = '';
        touchJob();
      });
      const from = host.querySelector('#gp-from');
      const to = host.querySelector('#gp-to');
      if (from) from.addEventListener('input', () => { job.from = clampNum(from.value, 0, 400, job.from ?? 0); syncNodeText(graph, graph.layout.nodes); persist(); });
      if (to) to.addEventListener('input', () => { job.to = clampNum(to.value, 0, 400, job.to ?? 0); syncNodeText(graph, graph.layout.nodes); persist(); });
      host.querySelector('#gp-yield').addEventListener('input', (e) => {
        const n = Number(e.target.value);
        if (e.target.value === '' || !Number.isFinite(n)) delete job.yieldMul;
        else job.yieldMul = Math.round(n * 100) / 100;
        persist();
      });
      host.querySelector('#gp-qual').addEventListener('input', (e) => {
        const n = Number(e.target.value);
        if (e.target.value === '' || !Number.isFinite(n)) delete job.qualityAdd;
        else job.qualityAdd = Math.round(n);
        persist();
      });
      return;
    }
    const stage = graphStage(graphPick);
    if (!stage) { host.innerHTML = ''; return; }
    const days = stage.role === 'rot' || stage.role === 'tail' ? '' : `<label>天数<input id="gp-days" type="number" min="0.25" max="400" step="0.25" value="${stage.days}"></label>`;
    const cuts = (graph.edges || []).map((edge, index) => {
      if (edge.from !== stage.id) return '';
      const where = edge.to === 'exit' ? '出口' : (graphStage(edge.to)?.name || edge.to);
      const kind = edge.kind === 'hard' ? '硬' : '自然';
      return `<div class="fs-cut"><span>到 ${esc(where)} · ${kind}</span><button type="button" data-gcut="${index}">断开</button></div>`;
    }).join('');
    host.innerHTML = `<p class="fs-note">${esc(roleLabel(stage))}</p><label>名称<input id="gp-name" type="text" maxlength="24" value="${esc(stage.name || '')}"></label>${days}${cuts}`;
    host.querySelector('#gp-name').addEventListener('input', (e) => {
      stage.name = e.target.value;
      syncNodeText(graph, graph.layout.nodes);
      persist();
    });
    const daysInput = host.querySelector('#gp-days');
    if (daysInput) daysInput.addEventListener('input', () => {
      stage.days = clampNum(daysInput.value, 0.25, 400, stage.days);
      syncNodeText(graph, graph.layout.nodes);
      persist();
    });
  }

  function paintGraph() {
    const board = boardEl();
    if (!board) return;
    board.hidden = !active;
    if (!active) return;
    const doc = current();
    const graph = doc.graph;
    const nodesHost = document.getElementById('fs-nodes');
    if (!graph || !Array.isArray(graph.stages)) {
      const sig = cropId + ':none';
      if (sig !== graphSig) {
        graphSig = sig;
        propSig = '';
        nodesHost.innerHTML = '<div class="fs-empty">这份作物没有阶段图。主游戏只读拉斯提卡的图。</div>';
        document.getElementById('fs-wires').innerHTML = '';
        document.getElementById('fs-prop').innerHTML = '';
      }
      return;
    }
    const nodes = ensureLayout(graph);
    const sig = graphStructuralSig(doc);
    if (sig !== graphSig) {
      graphSig = sig;
      propSig = '';
      nodesHost.innerHTML = renderNodes(graph, nodes);
    } else syncNodeText(graph, nodes);
    drawWires(graph);
    paintProp();
  }

  function addGraphStage(role) {
    const doc = current();
    if (!doc.graph) { note = '这份没有阶段图'; paintStatus(); return; }
    const graph = doc.graph;
    let next = role;
    if (role === 'head' && graph.stages.some(stage => stage.role === 'head')) { note = '已经有头阶段'; paintStatus(); return; }
    if (role === 'tail') {
      if (!graph.stages.some(stage => stage.role === 'rot')) next = 'rot';
      else if (!graph.stages.some(stage => stage.role === 'tail')) next = 'tail';
      else { note = '烂地和收获后都已经在图上'; paintStatus(); return; }
    }
    const made = {
      head: { id: freshGraphId(graph, 'head'), name: '头', role: 'head', kind: 'time', look: 'sown', days: 2, color: '#51542c', jobs: [] },
      node: { id: freshGraphId(graph, 'stage'), name: '阶段', role: 'node', kind: 'time', look: 'sown', days: 2, color: '#6a7340', jobs: [] },
      rot: { id: freshGraphId(graph, 'rot'), name: '烂地', role: 'rot', kind: 'rot', look: 'rot', color: '#5c4636', jobs: [{ job: 'tidy', kind: 'hard', name: '收拾', full: true }] },
      tail: { id: freshGraphId(graph, 'after'), name: '收获后', role: 'tail', kind: 'tail', look: 'harvested', color: '#b59a63', jobs: [{ job: 'tidy', kind: 'hard', name: '收拾', full: true }] },
    }[next];
    graph.stages.push(made);
    if (next === 'head') graph.entry = { job: 'sow', to: made.id };
    if (next === 'rot' || next === 'tail') graph.edges.push({ from: made.id, to: 'exit', kind: 'hard', job: 'tidy' });
    if (next === 'rot' && graph.stages.some(stage => stage.id === 'mature') && !graph.edges.some(edge => edge.from === 'mature' && edge.to === made.id)) {
      graph.edges.push({ from: 'mature', to: made.id, kind: 'natural' });
    }
    graphPick = made.id;
    graphSig = '';
    propSig = '';
    note = '';
    paintGraph();
    persist();
  }

  function addGraphJob(kind) {
    const graph = current().graph;
    if (!graph) { note = '这份没有阶段图'; paintStatus(); return; }
    const stage = graphStage(graphPick) || graph.stages.find(item => item.role === 'node') || graph.stages.find(item => item.role === 'head');
    if (!stage) { note = '先点一个阶段，再挂作业'; paintStatus(); return; }
    const job = kind === 'hard'
      ? { job: 'harvest', kind: 'hard', name: '收获', from: 0, to: 1 }
      : { job: 'topdress', kind: 'soft', name: '追肥', from: 0, to: 1, yieldMul: 1 };
    stage.jobs = stage.jobs || [];
    stage.jobs.push(job);
    graphPick = jobKey(stage.id, stage.jobs.length - 1);
    graphSig = '';
    propSig = '';
    note = '';
    paintGraph();
    persist();
  }

  function deleteGraphPick() {
    const graph = current().graph;
    if (!graph || !graphPick || graphPick === 'exit') return;
    const located = parseJobKey(graphPick);
    if (located) {
      const stage = graphStage(located.stageId);
      if (stage) stage.jobs.splice(located.index, 1);
      if (graph.layout && graph.layout.nodes) delete graph.layout.nodes[graphPick];
    } else {
      const stage = graphStage(graphPick);
      if (!stage) return;
      if (stage.role === 'head' || stage.role === 'rot' || stage.role === 'tail') {
        note = '头、烂地、收获后各留一个，主游戏才读得了';
        paintStatus();
        return;
      }
      graph.stages = graph.stages.filter(item => item.id !== stage.id);
      graph.edges = graph.edges.filter(edge => edge.from !== stage.id && edge.to !== stage.id);
    }
    graphPick = null;
    graphSig = '';
    propSig = '';
    paintGraph();
    persist();
  }

  function connectGraph(fromId, toId, kind) {
    const graph = current().graph;
    if (!graph || fromId === toId) return;
    if (kind === 'hang') {
      const located = parseJobKey(toId);
      const stage = graphStage(fromId);
      if (!located || !stage) { note = '把作业挂到阶段下方的端子上'; paintStatus(); return; }
      if (located.stageId === stage.id) return;
      const src = graphStage(located.stageId);
      if (!src || !src.jobs[located.index]) return;
      const [job] = src.jobs.splice(located.index, 1);
      stage.jobs = stage.jobs || [];
      stage.jobs.push(job);
      graphPick = jobKey(stage.id, stage.jobs.length - 1);
      note = '';
      return;
    }
    const src = graphStage(fromId);
    if (!src) return;
    if (toId === 'exit') {
      if (src.role !== 'tail' && src.role !== 'rot') { note = '只有尾阶段接到出口'; paintStatus(); return; }
      graph.edges = graph.edges.filter(edge => edge.from !== fromId);
      graph.edges.push({ from: fromId, to: 'exit', kind: 'hard', job: 'tidy' });
      note = '';
      return;
    }
    const dst = graphStage(toId);
    if (!dst) { note = '接到下一个阶段的左侧端子'; paintStatus(); return; }
    if (dst.role === 'head') { note = '头阶段不能从作物阶段进来'; paintStatus(); return; }
    if (src.role === 'tail' || src.role === 'rot') { note = '尾阶段只接到出口'; paintStatus(); return; }
    const edgeKind = dst.role === 'tail' ? 'hard' : 'natural';
    const job = dst.role === 'tail' ? 'harvest' : undefined;
    graph.edges = graph.edges.filter(edge => !(edge.from === fromId && edge.to === toId));
    graph.edges.push({ from: fromId, to: toId, kind: edgeKind, ...(job ? { job } : {}) });
    note = '';
  }

  function bindBoard(board) {
    board.addEventListener('pointerdown', (e) => {
      const add = e.target.closest('[data-gadd]');
      if (add) {
        e.preventDefault();
        e.stopPropagation();
        if (add.dataset.gadd === 'head') addGraphStage('head');
        else if (add.dataset.gadd === 'tail') addGraphStage('tail');
        else if (add.dataset.gadd === 'node') addGraphStage('node');
        else if (add.dataset.gadd === 'soft') addGraphJob('soft');
        else if (add.dataset.gadd === 'hard') addGraphJob('hard');
        else deleteGraphPick();
        return;
      }
      const cut = e.target.closest('[data-gcut]');
      if (cut) {
        e.preventDefault();
        e.stopPropagation();
        const graph = current().graph;
        const index = +cut.dataset.gcut;
        if (graph && graph.edges[index]) graph.edges.splice(index, 1);
        graphSig = '';
        propSig = '';
        paintGraph();
        persist();
        return;
      }
      if (e.target.closest('#fs-prop')) return;
      const port = e.target.closest('.fs-port');
      const node = e.target.closest('.fs-node');
      if (!node) return;
      e.preventDefault();
      e.stopPropagation();
      board.setPointerCapture(e.pointerId);
      if (port && (port.classList.contains('out') || port.classList.contains('hang'))) {
        wireDrag = { from: node.dataset.nid, kind: port.classList.contains('hang') ? 'hang' : 'flow', x: e.clientX, y: e.clientY };
        return;
      }
      graphPick = node.dataset.nid;
      const pos = canvasPoint(e.clientX, e.clientY);
      const laid = current().graph?.layout?.nodes?.[graphPick] || { x: 0, y: 0 };
      nodeDrag = { id: graphPick, ox: pos.x - laid.x, oy: pos.y - laid.y };
      propSig = '';
      paintGraph();
    });
    board.addEventListener('pointermove', (e) => {
      if (wireDrag) {
        wireDrag.x = e.clientX;
        wireDrag.y = e.clientY;
        drawWires(current().graph);
        return;
      }
      if (!nodeDrag) return;
      const graph = current().graph;
      if (!graph) return;
      const pos = canvasPoint(e.clientX, e.clientY);
      const x = Math.max(8, pos.x - nodeDrag.ox);
      const y = Math.max(8, pos.y - nodeDrag.oy);
      graph.layout.nodes[nodeDrag.id] = { x, y };
      const el = document.querySelector(`#fs-nodes [data-nid="${CSS.escape(nodeDrag.id)}"]`);
      if (el) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
      drawWires(graph);
    });
    const endDrag = (e) => {
      if (wireDrag) {
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const node = under && under.closest ? under.closest('.fs-node') : null;
        if (node) connectGraph(wireDrag.from, node.dataset.nid, wireDrag.kind);
        wireDrag = null;
        graphSig = '';
        propSig = '';
        paintGraph();
        persist();
      }
      if (nodeDrag) {
        nodeDrag = null;
        persist();
      }
    };
    board.addEventListener('pointerup', endDrag);
    board.addEventListener('pointercancel', () => { wireDrag = null; nodeDrag = null; });
  }

  function paintGantt() {
    paintGraph();
    const doc = current();
    const cells = batteryCells(doc);
    const finite = cells.reduce((sum, cell) => sum + (cell.infinite ? 0 : cell.days), 0) || 1;
    const tail = Math.max(1, finite * 0.12);
    const picked = inspect?.variant || '';
    const html = `<div class="fs-battery">${cells.map(cell => {
      const on = selected === cell.id && picked === (cell.variant || '');
      const flex = cell.infinite ? tail : cell.days;
      const ink = batteryInk(cell.color);
      const wins = cellWindows(doc, cell).map(win => `<i class="fs-win ${win.soft ? 'soft' : 'hard'}" style="left:${(win.from * 100).toFixed(2)}%;width:${((win.to - win.from) * 100).toFixed(2)}%" title="${esc(win.title)}"></i>`).join('');
      const mark = cell.infinite ? '∞' : `${cell.days} 日`;
      return `<button type="button" data-stage="${esc(cell.id)}" data-variant="${esc(cell.variant)}" class="${on ? 'on' : ''} ${cell.infinite ? 'inf' : ''}" style="flex:${flex} 1 0;background:${esc(cell.color)};color:${ink}" title="${esc(cell.name)} ${mark}"><span class="fs-wins">${wins}</span><b>${esc(cell.name)}</b><small>${cell.infinite ? '∞ →' : esc(String(cell.days))}</small></button>`;
    }).join('')}</div>`;
    if (html === ganttHtml) return;
    ganttHtml = html;
    const host = bar.querySelector('#fs-bar-gantt');
    if (host) host.innerHTML = html;
  }

  function paintStages() {
    const doc = current();
    const sig = doc.stages.map(s => s.id).join(',') + '|' + doc.chain.join(',') + '|' + selected;
    if (sig === listSig) return;
    listSig = sig;
    panel.querySelector('#fs-stages').innerHTML = doc.stages.map(st => `<div class="fs-stage">
<button type="button" data-stage="${st.id}" class="${st.id === selected ? 'on' : ''}">${st.id} ${st.name}</button>
<input data-days="${st.id}" type="number" min="0.25" max="400" step="0.25" value="${st.days}" aria-label="${st.name} 游戏日">
</div>`).join('');
  }

  function paintEditor() {
    const doc = current();
    const st = stageById(doc, selected) || doc.stages[0];
    const sig = selected + ':' + st.variants.map(v => v.id).join(',') + ':' + (st.ridge ? 1 : 0);
    if (sig === editorSig) return;
    editorSig = sig;
    const variants = st.variants.map(v => `<div class="fs-split">
<label>${v.id} ${v.name}${v.auto ? ' · 自动' : ''}<input data-vcolor="${v.id}" type="color" value="${v.color || st.color}"></label>
${v.auto ? `<label>停留日<input data-vdays="${v.id}" type="number" min="0.25" max="80" step="0.25" value="${v.days || 1}"></label>` : '<span></span>'}
</div>`).join('');
    const groupOptions = SEQUENCE_GROUPS.map(group => {
      const label = group === 'M' ? '中间' : group;
      return `<option value="${group}"${st.group === group ? ' selected' : ''}>${label}</option>`;
    }).join('');
    panel.querySelector('#fs-edit').innerHTML = `<div class="fs-split">
<label>名称<input id="fs-name" type="text" maxlength="24" value="${esc(st.name)}"></label>
<label>id<input id="fs-id" type="text" maxlength="48" value="${esc(st.id)}" spellcheck="false"></label>
</div>
<label>序列组<select id="fs-group">${groupOptions}</select></label>
<div class="fs-split">
<label><span class="fs-lab">色<button type="button" class="qmark" title="色：这一阶段的土色。主游戏未整地、生长底色和收割后的田面读阶段色。">?</button></span><input id="fs-color" type="color" value="${st.color}"></label>
<label><span class="fs-lab">植株<button type="button" class="qmark" title="植株：冠层色和植株比例。主游戏长出来的拉斯提卡读幼苗色和成熟色。">?</button></span><input id="fs-canopy" type="color" value="${st.canopy}"></label>
</div>
<div class="fs-split">
<label>粗糙度<input id="fs-rough" type="number" min="0.04" max="1" step="0.02" value="${st.roughness}"></label>
<label>盖度<input id="fs-cover" type="number" min="0" max="1" step="0.02" value="${st.cover}"></label>
</div>
<label>植株比例<input id="fs-pscale" type="number" min="0" max="1.4" step="0.02" value="${st.plantScale}"></label>
<label class="fs-row"><input id="fs-own" type="checkbox" ${st.ridge ? 'checked' : ''}> 只改这一阶段的截面 <button type="button" class="qmark" title="垄截面：横轴是垄宽，纵轴是高度。不勾时各阶段共用文档上的连锁截面。">?</button></label>
${variants}
<div class="fs-row">
<button type="button" id="fs-insert">在此后插入</button>
<button type="button" id="fs-drop">移出此阶段</button>
</div>`;
    const edit = panel.querySelector('#fs-edit');
    const touch = () => { dirty = true; curveDirty = true; persist(); };
    edit.querySelector('#fs-name').addEventListener('input', (e) => {
      renameStageName(doc, st.id, e.target.value);
      listSig = '';
      touch();
    });
    edit.querySelector('#fs-id').addEventListener('change', (e) => {
      const next = renameStageId(doc, st.id, e.target.value);
      if (!next) e.target.value = st.id;
      else selected = stageById(doc, e.target.value.trim())?.id || st.id;
      listSig = '';
      editorSig = '';
      jobsSig = '';
      touch();
      paintDynamic(false);
    });
    edit.querySelector('#fs-group').addEventListener('change', (e) => {
      setStageGroup(doc, st.id, e.target.value);
      listSig = '';
      editorSig = '';
      touch();
      paintDynamic(false);
    });
    edit.querySelector('#fs-color').addEventListener('input', (e) => { st.color = e.target.value; touch(); });
    edit.querySelector('#fs-canopy').addEventListener('input', (e) => { st.canopy = e.target.value; touch(); });
    edit.querySelector('#fs-rough').addEventListener('input', (e) => { st.roughness = clampNum(e.target.value, 0.04, 1, st.roughness); touch(); });
    edit.querySelector('#fs-cover').addEventListener('input', (e) => { st.cover = clampNum(e.target.value, 0, 1, st.cover); touch(); });
    edit.querySelector('#fs-pscale').addEventListener('input', (e) => { st.plantScale = clampNum(e.target.value, 0, 1.4, st.plantScale); touch(); });
    edit.querySelector('#fs-own').addEventListener('change', (e) => {
      if (e.target.checked) st.ridge = (st.ridge || doc.ridge).map(p => ({ ...p }));
      else st.ridge = null;
      editorSig = '';
      touch();
      paintEditor();
    });
    edit.querySelectorAll('[data-vcolor]').forEach(input => {
      input.addEventListener('input', () => {
        const v = st.variants.find(item => item.id === input.dataset.vcolor);
        if (v) v.color = input.value;
        touch();
      });
    });
    edit.querySelectorAll('[data-vdays]').forEach(input => {
      input.addEventListener('input', () => {
        const v = st.variants.find(item => item.id === input.dataset.vdays);
        if (v) v.days = clampNum(input.value, 0.25, 80, v.days || 1);
        paintGantt();
        touch();
      });
    });
    edit.querySelector('#fs-insert').addEventListener('click', () => {
      insertGrowthStage(doc, selected);
      listSig = '';
      editorSig = '';
      dirty = true;
      paintDynamic(false);
      persist();
    });
    edit.querySelector('#fs-drop').addEventListener('click', () => {
      removeGrowthStage(doc, selected);
      if (!stageById(doc, selected)) selected = stageByGroup(doc, 'A')?.id || doc.stages[0].id;
      listSig = '';
      editorSig = '';
      dirty = true;
      paintDynamic(false);
      persist();
    });
  }

  function paintChain() {
    const doc = current();
    const ordered = [
      stageByGroup(doc, 'O'),
      ...doc.chain.map(id => stageById(doc, id)),
      stageByGroup(doc, 'E'),
    ].filter(Boolean);
    const line = ordered.map(s => `${s.group === 'M' ? '中间' : s.group} ${s.name}`).join(' → ');
    panel.querySelector('#fs-chain').innerHTML = `<p class="fs-note">序列 ${line}。必有 O、A、B、D、E。C 和中间段可删，插在 B 与 C 之间。</p>`;
  }

  function paintEdges() {
    const doc = current();
    const lines = doc.edges.map(e => {
      const label = `${e.from}${e.fromVariant && e.fromVariant !== '*' ? e.fromVariant : ''} → ${e.to}${e.toVariant || ''} · ${e.via} · ${e.when}`;
      if (e.via === 'clear' || e.via === 'resow') {
        return `<label class="fs-row"><input type="checkbox" data-edge="${e.via}" ${e.enabled ? 'checked' : ''}> ${label}</label>`;
      }
      return `<div class="fs-note">${label}${e.enabled ? '' : ' · 关'}</div>`;
    }).join('');
    panel.querySelector('#fs-edges').innerHTML = lines;
    panel.querySelectorAll('[data-edge]').forEach(input => {
      input.addEventListener('change', () => {
        const via = input.dataset.edge;
        if (via === 'clear' || via === 'resow') setHarvestExit(doc, input.checked ? via : (via === 'clear' ? 'resow' : 'clear'));
        paintEdges();
        paintTransport();
        persist();
      });
    });
    const sowOp = doc.ops.find(op => op.writesMask || op.via === 'sow');
    const mach = sowOp && doc.machines[sowOp.machine];
    panel.querySelector('#fs-mach').textContent = mach
      ? `播种机 ${mach.id}：车头 ${mach.sweepHead} m，车尾 ${mach.sweepTail} m。改面点写在 machines 上，扫过以车头为准。`
      : '';
  }

  function paintJobs() {
    const host = panel.querySelector('#fs-jobs');
    if (!host) return;
    const doc = current();
    const ops = orderedStageOps(doc, selected);
    const strip = stageJobStrip(doc, selected);
    const sig = selected + '|' + strip.map(row => row.id + ':' + row.color).join(',');
    if (sig === jobsSig && host.childElementCount) return;
    jobsSig = sig;
    const stageIds = doc.stages.map(st => st.id);
    const onChain = stageById(doc, selected)?.group === 'O' || stageById(doc, selected)?.group === 'E' || (doc.chain || []).includes(selected);
    const machines = OP_MACHINE_CHOICES.map(([id, name]) => ({ id, name }));
    for (const op of doc.ops || []) {
      if (op.machine && !machines.some(row => row.id === op.machine)) machines.push({ id: op.machine, name: op.machine });
    }
    const machineOptions = (currentId) => machines.map(row => `<option value="${esc(row.id)}"${row.id === currentId ? ' selected' : ''}>${esc(row.name)} · ${esc(row.id)}</option>`).join('');
    const stageOptions = (currentId) => stageIds.map(id => `<option value="${esc(id)}"${id === currentId ? ' selected' : ''}>${esc(id)}</option>`).join('');
    const kindOptions = (op) => {
      const rows = [['required', '硬'], ['optional', '软']];
      if (op.kind === 'special') rows.push(['special', '特殊']);
      return rows.map(([id, name]) => `<option value="${id}"${op.kind === id ? ' selected' : ''}>${name}</option>`).join('');
    };
    const surfaceOf = (op) => {
      if (op.surface === 'none' || op.surface === 'color' || op.surface === 'plant' || op.surface === 'ridge') return op.surface;
      if (op.kind === 'optional') return 'none';
      if (op.via === 'sow' || op.via === 'harvest') return 'plant';
      return 'color';
    };
    const surfaceOptions = (op) => [['none', '不影响'], ['color', '色'], ['plant', '植株'], ['ridge', '垄截面']]
      .map(([id, name]) => `<option value="${id}"${surfaceOf(op) === id ? ' selected' : ''}>${name}</option>`).join('');
    const cards = ops.map(op => `<div class="fs-job" data-job="${esc(op.id)}">
<div class="fs-row"><b>${esc(op.name)}</b><span class="fs-note">${esc(op.id)}</span>${op.extensions?.framework || op.reserved ? '<span class="fs-note">预留，不派</span>' : ''}<button type="button" data-up-job="${esc(op.id)}">上移</button><button type="button" data-down-job="${esc(op.id)}">下移</button><button type="button" data-drop-job="${esc(op.id)}">删除</button></div>
<div class="fs-split">
<label>名称<input data-job-name="${esc(op.id)}" type="text" maxlength="24" value="${esc(op.name)}"></label>
<label>机具<select data-job-machine="${esc(op.id)}">${machineOptions(op.machine)}</select></label>
</div>
<div class="fs-split">
<label>阶段<select data-job-stage="${esc(op.id)}">${stageOptions(op.stage)}</select></label>
<label>硬 / 软<select data-job-kind="${esc(op.id)}">${kindOptions(op)}</select></label>
</div>
<label><span class="fs-lab">田面<button type="button" class="qmark" title="色改土色，植株改冠层，垄截面改垄高低。不影响：这道作业做完不改田面。软作业过窗可挂起；硬作业锁到做完。">?</button></span><select data-job-surface="${esc(op.id)}">${surfaceOptions(op)}</select></label>
<div class="fs-split">
<label>窗口起（日）<input data-job-from="${esc(op.id)}" type="number" min="0" max="400" step="0.25" placeholder="整段" value="${op.window ? op.window.from : ''}"></label>
<label>窗口止（日）<input data-job-to="${esc(op.id)}" type="number" min="0" max="400" step="0.25" placeholder="整段" value="${op.window ? op.window.to : ''}"></label>
</div>
</div>`).join('');
    const hint = (onChain ? '留空表示这一阶段整段都可派。' : '这阶段不在生长链上，进游戏不派这里的作业。') + ' 色条从上到下是执行顺序。软作业带窗口，过窗可挂起。硬作业锁到做完。';
    const bars = strip.map(row => `<div class="fs-jobbar"><i style="background:${esc(row.color)}"></i><span>${esc(row.name)}</span></div>`).join('');
    host.innerHTML = `<div class="fs-jobs"><h4>作业色条</h4><div class="fs-jobbars">${bars}</div><h4>执行顺序</h4><p class="fs-note">${hint}</p>${cards}<div class="fs-row"><button type="button" id="fs-add-job">增加作业</button></div></div>`;
    const touchJob = (opId, patch) => {
      patchStageOp(doc, opId, patch);
      dirty = true;
      persist();
      paintGantt();
    };
    host.querySelector('#fs-add-job').addEventListener('click', () => {
      addStageOp(doc, selected);
      jobsSig = '';
      paintJobs();
      paintTransport();
      persist();
    });
    const shiftJob = (opId, dir) => {
      moveStageOp(doc, opId, dir);
      jobsSig = '';
      dirty = true;
      paintJobs();
      persist();
    };
    host.querySelectorAll('[data-up-job]').forEach(btn => {
      btn.addEventListener('click', () => shiftJob(btn.dataset.upJob, -1));
    });
    host.querySelectorAll('[data-down-job]').forEach(btn => {
      btn.addEventListener('click', () => shiftJob(btn.dataset.downJob, 1));
    });
    host.querySelectorAll('[data-drop-job]').forEach(btn => {
      btn.addEventListener('click', () => {
        removeStageOp(doc, btn.dataset.dropJob);
        jobsSig = '';
        paintJobs();
        paintTransport();
        persist();
      });
    });
    host.querySelectorAll('[data-job-name]').forEach(input => {
      input.addEventListener('input', () => touchJob(input.dataset.jobName, { name: input.value }));
    });
    host.querySelectorAll('[data-job-machine]').forEach(input => {
      input.addEventListener('change', () => touchJob(input.dataset.jobMachine, { machine: input.value }));
    });
    host.querySelectorAll('[data-job-stage]').forEach(input => {
      input.addEventListener('change', () => {
        patchStageOp(doc, input.dataset.jobStage, { stage: input.value });
        jobsSig = '';
        paintJobs();
        paintTransport();
        persist();
      });
    });
    host.querySelectorAll('[data-job-kind]').forEach(input => {
      input.addEventListener('change', () => touchJob(input.dataset.jobKind, { kind: input.value }));
    });
    host.querySelectorAll('[data-job-surface]').forEach(input => {
      input.addEventListener('change', () => touchJob(input.dataset.jobSurface, { surface: input.value }));
    });
    const readWindow = (opId) => {
      const fromEl = host.querySelector('[data-job-from="' + opId + '"]');
      const toEl = host.querySelector('[data-job-to="' + opId + '"]');
      if (!fromEl || !toEl) return;
      const fromBlank = fromEl.value.trim() === '';
      const toBlank = toEl.value.trim() === '';
      if (fromBlank && toBlank) {
        patchStageOp(doc, opId, { window: null });
        note = '';
        persist();
        paintGantt();
        return;
      }
      const from = Number(fromEl.value);
      const to = Number(toEl.value);
      if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) {
        note = '窗口止要大于起，或两格都留空表示整段。没写入。';
        paintStatus();
        return;
      }
      patchStageOp(doc, opId, { window: { from, to } });
      note = '';
      persist();
      paintGantt();
    };
    host.querySelectorAll('[data-job-from],[data-job-to]').forEach(input => {
      const opId = input.dataset.jobFrom || input.dataset.jobTo;
      input.addEventListener('change', () => readWindow(opId));
    });
  }

  function paintNumbers() {
    const doc = current();
    const set = (id, value) => {
      const el = panel.querySelector(id);
      if (el && document.activeElement !== el) el.value = value;
    };
    set('#fs-window', doc.transition.windowDays);
    set('#fs-cycle', Number.isFinite(+doc.cycle) ? doc.cycle : chainDays(doc));
    set('#fs-rows', doc.rows);
    set('#fs-along', doc.grid.along);
    set('#fs-height', doc.plant.height);
    set('#fs-plant-along', doc.plant.along);
    set('#fs-name', doc.cropName || doc.name || '');
    const shape = panel.querySelector('#fs-shape');
    if (shape) shape.value = doc.plant.shape;
    const trans = panel.querySelector('#fs-trans');
    if (trans) trans.value = doc.transition.template + '|' + doc.transition.span;
  }

  function paintDynamic(rebuildLists) {
    if (rebuildLists) {
      listSig = '';
      editorSig = '';
      jobsSig = '';
    }
    cropOptions();
    paintEditing();
    paintStages();
    paintEditor();
    paintJobs();
    paintChain();
    paintEdges();
    paintNumbers();
    paintGantt();
    paintTransport();
    curveDirty = true;
  }

  function paintStatus() {
    const doc = current();
    const info = sim ? dominant(sim) : null;
    const look = info ? appearanceOf(doc, inspect ? inspect.phase : info.phase, inspect ? inspect.variant : info.variant) : null;
    const maskPct = info ? Math.round(100 * info.mask / info.total) : 0;
    const where = look ? `${look.phase}${look.variant || ''} ${look.name}` : '—';
    const clock = info ? info.day.toFixed(1) : '0.0';
    const job = sim && sim.job ? ` · ${sim.job.op.name} ${sim.job.applied}/${sim.job.queue.length}` : '';
    const mode = inspect ? ' · 查看这一阶段' : (playing ? ' · 播放' : ' · 暂停');
    const sum = chainDays(doc);
    const cycle = Number.isFinite(+doc.cycle) ? doc.cycle : '未定';
    const text = `${where} · 蒙版 ${maskPct}% · 第 ${clock} 日 · 阶段合计 ${sum} / 总周期 ${cycle}${job}${mode}${note ? ' · ' + note : ''}`;
    const status = bar.querySelector('#fs-status');
    const now = panel.querySelector('#fs-now');
    const foot = panel.querySelector('#fs-note');
    if (status) status.textContent = text;
    if (now) now.textContent = text;
    if (foot) foot.textContent = note;
  }

  function ridgePoints() {
    const doc = current();
    const st = stageById(doc, selected) || doc.stages[0];
    return st.ridge || doc.ridge;
  }

  function drawCurve() {
    const canvas = panel.querySelector('#fs-curve');
    if (!canvas) return;
    const w = canvas.clientWidth || 280;
    const h = 148;
    if (!w) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(188,195,196,.35)';
    ctx.lineWidth = 1;
    const pad = 16;
    const maxH = 0.8;
    const xOf = (x) => pad + x * (w - pad * 2);
    const yOf = (y) => h - pad - (y / maxH) * (h - pad * 2);
    for (let i = 0; i <= 4; i++) {
      const y = yOf((maxH / 4) * i);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    }
    const pts = ridgePoints();
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const y = sampleRidge(pts, t);
      const px = xOf(t);
      const py = yOf(y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = '#e49680';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (const p of pts) {
      ctx.fillStyle = '#e8d8d0';
      ctx.fillRect(xOf(p.x) - 4, yOf(p.y) - 4, 8, 8);
    }
    curveDirty = false;
  }

  function curveSpace(canvas, ev) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const pad = 16;
    const maxH = 0.8;
    const x = (ev.clientX - rect.left - pad) / (w - pad * 2);
    const y = ((h - pad - (ev.clientY - rect.top)) / (h - pad * 2)) * maxH;
    return { x, y: Math.max(0, Math.min(maxH, y)) };
  }

  function hitPoint(canvas, ev) {
    const pts = ridgePoints();
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const pad = 16;
    const maxH = 0.8;
    const xOf = (x) => pad + x * (w - pad * 2);
    const yOf = (y) => h - pad - (y / maxH) * (h - pad * 2);
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    let best = -1;
    let bestD = 14;
    pts.forEach((p, i) => {
      const d = Math.hypot(xOf(p.x) - px, yOf(p.y) - py);
      if (d < bestD) { best = i; bestD = d; }
    });
    return best;
  }

  function onCurveDown(ev) {
    const canvas = panel.querySelector('#fs-curve');
    const i = hitPoint(canvas, ev);
    if (i < 0) return;
    dragPt = i;
    canvas.setPointerCapture(ev.pointerId);
  }

  function onCurveMove(ev) {
    if (dragPt == null) return;
    const canvas = panel.querySelector('#fs-curve');
    const p = curveSpace(canvas, ev);
    const doc = current();
    const st = stageById(doc, selected);
    const live = (st && st.ridge) || doc.ridge;
    if (dragPt === 0) live[0].x = 0;
    else if (dragPt === live.length - 1) live[dragPt].x = 1;
    else {
      const lo = live[dragPt - 1].x + 0.02;
      const hi = live[dragPt + 1].x - 0.02;
      live[dragPt].x = Math.max(lo, Math.min(hi, p.x));
    }
    live[dragPt].y = p.y;
    dirty = true;
    curveDirty = true;
    drawCurve();
  }

  function onCurveAdd(ev) {
    const canvas = panel.querySelector('#fs-curve');
    const doc = current();
    const st = stageById(doc, selected);
    const live = (st && st.ridge) || doc.ridge;
    const p = curveSpace(canvas, ev);
    if (p.x <= 0.02 || p.x >= 0.98) return;
    live.push({ x: p.x, y: p.y });
    live.sort((a, b) => a.x - b.x);
    dirty = true;
    curveDirty = true;
    persist();
    drawCurve();
  }

  function onCurveRemove(ev) {
    ev.preventDefault();
    const canvas = panel.querySelector('#fs-curve');
    const i = hitPoint(canvas, ev);
    const doc = current();
    const st = stageById(doc, selected);
    const live = (st && st.ridge) || doc.ridge;
    if (i <= 0 || i < 0 || i >= live.length - 1 || live.length <= 2) return;
    live.splice(i, 1);
    dirty = true;
    curveDirty = true;
    persist();
    drawCurve();
  }

  function download() {
    const doc = current();
    const blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `field-stage-${doc.cropId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    note = '已下载 field-stage-' + doc.cropId + '.json';
  }

  function cellLook(doc, cell) {
    if (inspect) return { ...appearanceOf(doc, inspect.phase, inspect.variant), mask: true, locked: false };
    return { ...appearanceOf(doc, cell.phase, cell.variant), mask: cell.mask, locked: cell.locked };
  }

  function syncWorld() {
    if (!view) return;
    const doc = current();
    ensureSim();
    const { geo, pos, soil, canopy, cover, rough, mask, lock, plants, machine, swath } = view;
    const rows = doc.rows;
    const alongN = doc.grid.along;
    const pitch = PREVIEW.width / rows;
    const color = new THREE.Color();
    const can = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const fx = (x + PREVIEW.width / 2) / pitch;
      let row = Math.floor(fx);
      if (row < 0) row = 0;
      if (row > rows - 1) row = rows - 1;
      let frac = fx - row;
      if (frac < 0) frac = 0;
      if (frac > 0.999) frac = 0.999;
      const fz = (z + PREVIEW.length / 2) / PREVIEW.length;
      let along = Math.floor(fz * alongN);
      if (along < 0) along = 0;
      if (along > alongN - 1) along = alongN - 1;
      const cell = sim.cells[row * alongN + along];
      const look = cellLook(doc, cell);
      const h = sampleRidge(look.ridge, frac);
      pos.setY(i, h);
      color.set(look.color);
      can.set(look.canopy);
      soil.setXYZ(i, color.r, color.g, color.b);
      canopy.setXYZ(i, can.r, can.g, can.b);
      cover.setX(i, look.cover);
      rough.setX(i, look.roughness);
      mask.setX(i, look.mask ? 1 : 0);
      lock.setX(i, look.locked ? 1 : 0);
    }
    pos.needsUpdate = true;
    soil.needsUpdate = true;
    canopy.needsUpdate = true;
    cover.needsUpdate = true;
    rough.needsUpdate = true;
    mask.needsUpdate = true;
    lock.needsUpdate = true;
    geo.computeVertexNormals();

    const shape = SHAPES.includes(doc.plant.shape) ? doc.plant.shape : 'bush';
    let n = 0;
    const mesh = plants[shape];
    const step = Math.max(0.28, doc.plant.along);
    const inset = 0.9;
    const tmpM = view.tmpM;
    const tmpP = view.tmpP;
    const tmpQ = view.tmpQ;
    const tmpS = view.tmpS;
    for (let row = 0; row < rows; row++) {
      const x = -PREVIEW.width / 2 + (row + 0.5) * pitch;
      for (let z = -PREVIEW.length / 2 + inset; z < PREVIEW.length / 2 - inset; z += step) {
        if (n >= PLANT_CAP) break;
        let along = Math.floor(((z + PREVIEW.length / 2) / PREVIEW.length) * alongN);
        if (along < 0) along = 0;
        if (along > alongN - 1) along = alongN - 1;
        const look = cellLook(doc, sim.cells[row * alongN + along]);
        if (look.plantScale < 0.04) continue;
        const s = doc.plant.height * look.plantScale * (0.84 + ((row * 17 + along * 13) % 10) / 40);
        const y = sampleRidge(look.ridge, 0.5);
        const jx = (((row * 3 + along) % 5) - 2) * 0.04;
        tmpM.compose(
          tmpP.set(x + jx, y, z),
          tmpQ.setFromAxisAngle(view.up, ((row * 9 + along) % 16) / 16 * Math.PI * 2),
          tmpS.set(s, s * (0.9 + ((row + along) % 4) * 0.04), s),
        );
        mesh.setMatrixAt(n, tmpM);
        can.set(look.canopy);
        mesh.instanceColor.setXYZ(n, can.r, can.g, can.b);
        n += 1;
      }
    }
    for (const key of SHAPES) {
      plants[key].count = key === shape ? n : 0;
      plants[key].instanceMatrix.needsUpdate = true;
      if (plants[key].instanceColor) plants[key].instanceColor.needsUpdate = true;
    }

    const job = sim.job;
    machine.visible = !!job;
    swath.visible = !!job;
    if (job) {
      const idx = Math.min(job.queue.length - 1, Math.max(0, Math.floor(job.p)));
      const frac = job.queue.length ? Math.min(1, Math.max(0, job.p - idx)) : 0;
      const cell = sim.cells[job.queue[idx]];
      const dir = cell.row % 2 === 0 ? 1 : -1;
      const cellLen = PREVIEW.length / alongN;
      const zc = -PREVIEW.length / 2 + (cell.along + 0.5) * cellLen;
      const zHead = zc - dir * cellLen * 0.5 + dir * cellLen * frac;
      const head = job.machine.sweepHead || 1.2;
      const tail = job.machine.sweepTail || -1.2;
      const x = -PREVIEW.width / 2 + (cell.row + 0.5) * pitch;
      machine.position.set(x, 0.2, zHead - dir * head);
      machine.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      const nose = machine.getObjectByName('nose');
      const tailMark = machine.getObjectByName('tail');
      const bar = machine.getObjectByName('bar');
      nose.position.set(head, 0.85, 0);
      tailMark.position.set(tail, 0.7, 0);
      bar.position.set((head + tail) * 0.5, 0.55, 0);
      const tone = job.op.kind === 'optional' ? PALETTE.data : job.op.kind === 'special' ? PALETTE.alert : PALETTE.harvest;
      bar.material.color.set(tone);
      swath.scale.set(pitch * 0.92, 1, cellLen * 0.92);
      swath.position.set(x, sampleRidge(cellLook(doc, cell).ridge, 0.5) + 0.03, zc);
    }
    dirty = false;
  }

  function build() {
    const group = new THREE.Group();
    const geo = new THREE.PlaneGeometry(PREVIEW.width, PREVIEW.length, 16 * RIDGE_SAMPLES, ALONG_SAMPLES);
    geo.rotateX(-Math.PI / 2);
    const count = geo.attributes.position.count;
    const soil = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    const canopy = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    const cover = new THREE.BufferAttribute(new Float32Array(count), 1);
    const rough = new THREE.BufferAttribute(new Float32Array(count), 1);
    const mask = new THREE.BufferAttribute(new Float32Array(count), 1);
    const lock = new THREE.BufferAttribute(new Float32Array(count), 1);
    geo.setAttribute('aSoil', soil);
    geo.setAttribute('aCanopy', canopy);
    geo.setAttribute('aCover', cover);
    geo.setAttribute('aRough', rough);
    geo.setAttribute('aMask', mask);
    geo.setAttribute('aLock', lock);
    const ground = new THREE.Mesh(geo, groundMaterial());
    ground.castShadow = true;
    ground.receiveShadow = true;
    group.add(ground);

    const plantMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
    plantMat.userData.dispose = true;
    const plants = {};
    for (const shape of SHAPES) {
      const im = new THREE.InstancedMesh(plantGeometry(shape), plantMat, PLANT_CAP);
      im.count = 0;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PLANT_CAP * 3), 3);
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      group.add(im);
      plants[shape] = im;
    }
    const machine = makeMachine();
    group.add(machine);
    const swathMat = new THREE.MeshBasicMaterial({ color: PALETTE.zone, transparent: true, opacity: 0.55, depthWrite: false });
    swathMat.userData.dispose = true;
    const swath = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 1), swathMat);
    swath.visible = false;
    group.add(swath);
    const curbMat = new THREE.MeshStandardMaterial({ color: PALETTE.regoLt, roughness: 0.8 });
    curbMat.userData.dispose = true;
    const curb = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), curbMat);
      m.position.set(x, 0.06, z);
      m.receiveShadow = true;
      group.add(m);
    };
    const hw = PREVIEW.width / 2;
    const hl = PREVIEW.length / 2;
    curb(PREVIEW.width + 0.4, 0.18, 0, -hl - 0.1);
    curb(PREVIEW.width + 0.4, 0.18, 0, hl + 0.1);
    curb(0.18, PREVIEW.length + 0.4, -hw - 0.1, 0);
    curb(0.18, PREVIEW.length + 0.4, hw + 0.1, 0);

    view = {
      group, geo, pos: geo.attributes.position, soil, canopy, cover, rough, mask, lock, plants, machine, swath,
      tmpM: new THREE.Matrix4(), tmpP: new THREE.Vector3(), tmpQ: new THREE.Quaternion(), tmpS: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
    };
    ensureSim();
    dirty = true;
    syncWorld();
    const ring = new THREE.Group();
    group.add(ring);
    return {
      group,
      ring,
      ownState: true,
      motion() {},
      tick(now) {
        if (!group.parent) return;
        const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
        lastNow = now;
        if (playing && dt > 0) {
          stepSim(ensureSim(), current(), (dt * speed) / FIELD_STAGE_SECONDS_PER_DAY);
          driveDemo();
          dirty = true;
        }
        if (dirty) syncWorld();
        if (curveDirty) drawCurve();
        paintStatus();
        paintGantt();
      },
    };
  }

  function setActive(on) {
    active = on;
    if (panel) panel.hidden = !on;
    if (bar) bar.hidden = !on;
    const board = document.getElementById('fs-board');
    if (board) board.hidden = !on;
    if (on) {
      graphSig = '';
      propSig = '';
      paintDynamic(true);
      curveDirty = true;
      lastNow = 0;
    }
  }

  loadStore();
  paintShell();

  const api = {
    get active() { return active; },
    togglePlay() { if (playing) { playing = false; demo = null; } else play(); paintTransport(); },
    play,
    pause() { playing = false; demo = null; paintTransport(); },
    reset: resetSim,
    demo: startDemo,
    setSpeed(n) { speed = SPEEDS.includes(n) ? n : n; paintTransport(); },
    setDays(id, days) {
      const st = stageById(current(), id);
      if (!st) return;
      st.days = clampNum(days, 0.25, 400, st.days);
      const input = panel.querySelector(`[data-days="${id}"]`);
      if (input) input.value = st.days;
      paintGantt();
      persist();
    },
    setRidge(id, points, own = true) {
      const st = stageById(current(), id);
      if (!st) return;
      const copy = points.map(p => ({ x: p.x, y: p.y }));
      if (own) st.ridge = copy;
      else current().ridge = copy;
      selected = id;
      dirty = true;
      curveDirty = true;
      editorSig = '';
      syncWorld();
      drawCurve();
    },
    op: runOp,
    cancel() { return cancelWorkOrder(ensureSim(), current()); },
    inspect(id, variant = '') { selectStage(id, variant); if (view) syncWorld(); },
    advance(days) {
      playing = false;
      stepSim(ensureSim(), current(), days);
      dirty = true;
      syncWorld();
      paintStatus();
    },
    status() {
      ensureSim();
      const info = dominant(sim);
      return {
        cropId,
        phase: inspect ? inspect.phase : info.phase,
        variant: inspect ? inspect.variant : info.variant,
        mask: info.mask,
        locked: info.locked,
        total: info.total,
        day: info.day,
        playing,
        speed,
        job: info.job,
        inspect,
        note,
        plants: view ? view.plants[current().plant.shape].count : 0,
        maxY: view ? maxHeight() : 0,
      };
    },
    doc() { return current(); },
    tally() { return tally(ensureSim()); },
    sample(id, variant, t) { return sampleRidge(appearanceOf(current(), id, variant).ridge, t); },
    exportJson() { return JSON.stringify(current(), null, 2); },
    save: persist,
  };

  function maxHeight() {
    const arr = view.pos;
    let m = 0;
    for (let i = 0; i < arr.count; i++) m = Math.max(m, arr.getY(i));
    return m;
  }

  return { build, setActive, api, get active() { return active; }, togglePlay() { api.togglePlay(); } };
}
