// 环穗 · 资产工坊。设计沙盒。网格和预制件跟游戏同一套；培育层和中枢由 colony-art.js 提供，主进度也用这一套。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PALETTE, RING } from './_shared.js';
import { LAB_CLASSES, LAB_ENTRIES, CULT_EMPTY } from './lab-catalog.js';
import { makeColony } from './colony-art.js';
import {
  tractorKit, planterKit, hillerKit, topperKit, potatoLifterKit,
  cultureTankKit, warehouseKit, garageKit, processKit, armKit, irrigatorKit,
} from './prefabs.js';

const $ = id => document.getElementById(id);
const STORE = 'ringsheaf.assetlab.briefs';
const C = hex => new THREE.Color(hex);

const viewEl = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.7;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x0a0c14, 1);
viewEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(32, 1, 0.08, 8000);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const sun = new THREE.DirectionalLight('#ffd9b0', 3.2);
sun.position.set(48, 90, 36);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
const sc = sun.shadow.camera;
sc.left = sc.bottom = -90;
sc.right = sc.top = 90;
sc.near = 1;
sc.far = 280;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#5f7480', '#2a2622', 0.55);
scene.add(hemi);
const LIGHT0 = {
  sun: sun.intensity,
  sunColor: sun.color.clone(),
  env: scene.environmentIntensity,
  hemi: hemi.intensity,
  hemiColor: hemi.color.clone(),
  hemiGround: hemi.groundColor.clone(),
  exp: renderer.toneMappingExposure,
  bias: sun.shadow.bias,
};

const MAT = {
  light: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.55 }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.6, envMapIntensity: 1.4 }),
  emis: new THREE.MeshBasicMaterial({ vertexColors: true }),
};
const zoneMat = new THREE.MeshBasicMaterial({ color: PALETTE.zone });
const alertMat = new THREE.MeshBasicMaterial({ color: PALETTE.alert });
const dataMat = new THREE.MeshBasicMaterial({ color: PALETTE.data });
const soilMat = new THREE.MeshStandardMaterial({ color: PALETTE.regoDk, roughness: 0.92, metalness: 0 });
const shellMat = new THREE.MeshStandardMaterial({ color: PALETTE.metalDk, roughness: 0.62, metalness: 0.5 });
const curbMat = new THREE.MeshStandardMaterial({ color: PALETTE.regoLt, roughness: 0.8, metalness: 0.05 });
const padMat = new THREE.MeshStandardMaterial({ color: PALETTE.deep, roughness: 0.9, metalness: 0.15 });

const stage = new THREE.Group();
scene.add(stage);
const eye = { yaw: 0.85, pitch: 0.5, dist: 40, tx: 0, ty: 0, tz: 0 };
let curId = LAB_ENTRIES[0].id;
let state = 'idle';
let frozen = null;
let motion = null;
let shown = null;

function kitGroup(builder) {
  const g = new THREE.Group();
  const kit = builder();
  for (const k of ['light', 'dark', 'glass', 'emis']) {
    if (!kit[k]) continue;
    const mesh = new THREE.Mesh(kit[k], MAT[k]);
    mesh.castShadow = k !== 'emis';
    mesh.receiveShadow = k !== 'emis';
    g.add(mesh);
  }
  return g;
}

function salmonRing(w, d, y = 0.28) {
  const g = new THREE.Group();
  const t = Math.max(0.18, Math.min(w, d) * 0.012);
  const h = Math.max(0.06, t * 0.22);
  const add = (ww, dd, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ww, h, dd), zoneMat);
    m.position.set(x, y, z);
    g.add(m);
  };
  add(w + t, t, 0, -d / 2);
  add(w + t, t, 0, d / 2);
  add(t, d + t, -w / 2, 0);
  add(t, d + t, w / 2, 0);
  g.visible = false;
  return g;
}


const boxCache = new Map();
function box(w, h, d, x, y, z, mat) {
  const key = w.toFixed(3) + '|' + h.toFixed(3) + '|' + d.toFixed(3);
  let geo = boxCache.get(key);
  if (!geo) {
    geo = new THREE.BoxGeometry(w, h, d);
    geo.userData.shared = true;
    boxCache.set(key, geo);
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function unitMaterial(kind, w) {
  const u = {
    uKind: { value: kind === 'field' ? 0 : kind === 'deck' ? 1 : 2 },
    uJob: { value: 0 },
    uSel: { value: 0 },
    uHalf: { value: w * 0.5 },
    uSoil: { value: C(PALETTE.regoDk) },
    uOchre: { value: C(PALETTE.ochre) },
    uMetal: { value: C(PALETTE.metalDk) },
    uHaze: { value: C(PALETTE.haze) },
    uDeep: { value: C(PALETTE.deep) },
    uRego: { value: C(PALETTE.regoLt) },
    uData: { value: C(PALETTE.data) },
    uZone: { value: C(PALETTE.zone) },
    uSteel: { value: C(PALETTE.steel) },
  };
  const mat = new THREE.MeshStandardMaterial({
    roughness: kind === 'field' ? 0.92 : kind === 'hub' ? 0.8 : 0.58,
    metalness: kind === 'field' ? 0 : 0.42,
  });
  mat.userData.dispose = true;
  mat.userData.u = u;
  mat.customProgramCacheKey = () => 'unit-' + kind;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <project_vertex>', 'vP = position;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vP;
uniform float uKind, uJob, uSel, uHalf;
uniform vec3 uSoil, uOchre, uMetal, uHaze, uDeep, uRego, uData, uZone, uSteel;
vec3 unitAlbedo(){
  vec2 p = vP.xz;
  vec3 col = uSoil;
  if (uKind < 0.5) {
    float ridge = abs(fract((p.x + uHalf) / 4.0) - 0.5);
    col = mix(uSoil, uOchre, smoothstep(0.12, 0.38, ridge));
    float head = smoothstep(6.0, 2.0, uHalf - abs(p.y));
    col = mix(col, uSoil * 1.2, head * 0.7);
  } else if (uKind < 1.5) {
    float lane = 1.0 - smoothstep(0.06, 0.45, abs(mod(p.x + uHalf, 12.8) - 6.4));
    float edge = 1.0 - smoothstep(0.25, 1.3, min(uHalf - abs(p.x), uHalf - abs(p.y)));
    col = mix(uMetal * 1.3, uHaze * 0.45, 0.4);
    col = mix(col, uDeep, edge * 0.7);
    col = mix(col, uData, lane * 0.42);
  } else {
    vec2 jl = abs(mod(p + uHalf, 8.0) - 4.0);
    float seam = 1.0 - smoothstep(3.55, 3.95, max(jl.x, jl.y));
    col = mix(uRego, uHaze, 0.35) * (1.0 - seam * 0.2);
  }
  float sweep = 1.0 - smoothstep(0.0, max(1.2, uHalf * 0.06), abs(p.x - mix(-uHalf, uHalf, uJob)));
  col = mix(col, uZone, sweep * step(0.02, uJob) * 0.62);
  if (uSel > 0.5) {
    float b = min(uHalf - abs(p.x), uHalf - abs(p.y));
    float rim = 1.0 - smoothstep(0.5, max(2.2, uHalf * 0.018), b);
    col = mix(col, uZone, rim * 0.92);
  }
  return col;
}`).replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = unitAlbedo();');
  };
  return mat;
}

function addWalls(g, w, t, h, mat, y0 = 0) {
  const o = w / 2 - t / 2;
  const inner = w - t * 2;
  g.add(box(w, h, t, 0, y0 + h / 2, -o, mat));
  g.add(box(w, h, t, 0, y0 + h / 2, o, mat));
  g.add(box(t, h, inner, -o, y0 + h / 2, 0, mat));
  g.add(box(t, h, inner, o, y0 + h / 2, 0, mat));
}

function buildUnit(kind, w) {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, w).rotateX(-Math.PI / 2), unitMaterial(kind, w));
  floor.receiveShadow = true;
  g.add(floor);
  if (kind === 'field') addWalls(g, w - 1.2, 2.2, 1.15, soilMat);
  if (kind === 'deck') {
    addWalls(g, w, 0.55, 5.2, shellMat);
    const beam = 3.2, by = 5.15;
    const bo = w / 2 - beam / 2;
    const inner = w - beam * 2;
    g.add(box(w, 0.35, beam, 0, by, -bo, shellMat));
    g.add(box(w, 0.35, beam, 0, by, bo, shellMat));
    g.add(box(beam, 0.35, inner, -bo, by, 0, shellMat));
    g.add(box(beam, 0.35, inner, bo, by, 0, shellMat));
    g.add(box(w * 0.72, 0.08, 0.14, 0, by - 0.24, -bo + 0.8, dataMat));
  }
  if (kind === 'hub') addWalls(g, w, 1.4, 0.4, curbMat);
  const marker = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1.4, w * 0.028), 0.45, Math.max(1.4, w * 0.05)), zoneMat);
  marker.position.y = kind === 'field' ? 1.4 : 0.55;
  marker.visible = false;
  g.add(marker);
  const ring = salmonRing(w * 1.012, w * 1.012, kind === 'field' ? 1.35 : 0.22);
  g.add(ring);
  return {
    group: g,
    ring,
    motion(p, st) {
      marker.visible = st === 'job';
      marker.position.x = -w * 0.4 + p * w * 0.8;
      const u = floor.material.userData.u;
      if (u) {
        u.uJob.value = st === 'job' ? p : 0;
        u.uSel.value = st === 'sel' ? 1 : 0;
      }
    },
  };
}

function machine(builder, radius) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CircleGeometry(radius * 2.1, 48), padMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = -0.04;
  pad.receiveShadow = true;
  g.add(pad);
  const body = kitGroup(builder);
  g.add(body);
  const ring = salmonRing(radius * 2.4, radius * 2.4, 0.12);
  g.add(ring);
  return {
    group: g,
    ring,
    motion(p, st) {
      if (st !== 'job') {
        body.position.set(0, 0, 0);
        body.rotation.y = 0.5;
        return;
      }
      const a = p * Math.PI * 2;
      body.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius * 0.72);
      body.rotation.y = -a;
    },
  };
}

function equip(builder, fw, fd) {
  const g = new THREE.Group();
  const body = kitGroup(builder);
  g.add(body);
  const ring = salmonRing(fw, fd, 0.16);
  g.add(ring);
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.9, 0.45), dataMat);
  beacon.position.set(fw * 0.28, 0.5, fd * 0.28);
  beacon.visible = false;
  g.add(beacon);
  return {
    group: g,
    ring,
    motion(p, st) {
      const on = st === 'job' || st === 'break';
      beacon.visible = on;
      beacon.material = st === 'break' ? alertMat : dataMat;
      const pulse = st === 'job' ? 0.45 + Math.sin(p * Math.PI * 2) * 0.55 : 0;
      beacon.position.y = 0.45 + pulse * 2.2;
      beacon.scale.y = 0.6 + pulse;
    },
  };
}

function buildArm() {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(44, 14).rotateX(-Math.PI / 2), soilMat);
  pad.position.y = -0.02;
  pad.receiveShadow = true;
  g.add(pad);
  g.add(box(36, 0.18, 0.42, 0, 4.72, 0, shellMat));
  g.add(box(0.36, 4.7, 0.36, -16, 2.35, 0, shellMat));
  g.add(box(0.36, 4.7, 0.36, 16, 2.35, 0, shellMat));
  const body = kitGroup(armKit);
  g.add(body);
  const ring = salmonRing(38, 6, 0.12);
  g.add(ring);
  return {
    group: g,
    ring,
    motion(p, st) {
      if (st === 'job') {
        body.position.x = -14 + p * 28;
        body.rotation.z = -Math.sin(p * Math.PI) * 0.48;
      } else {
        body.position.set(0, 0, 0);
        body.rotation.z = 0;
      }
    },
  };
}

function buildIrrigator() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(kitGroup(irrigatorKit));
  const ring = salmonRing(6, 128, 0.2);
  body.add(ring);
  g.add(body);
  return {
    group: g,
    ring,
    motion(p, st) {
      body.position.x = st === 'job' ? -28 + p * 56 : 0;
    },
  };
}


function applyStageLight(entry) {
  const id = entry && entry.id;
  const interior = id === 'cult-a' || id === 'cult-b';
  const marathon = id === 'cult-b';
  sun.intensity = interior ? 0.08 : LIGHT0.sun;
  sun.color.copy(interior ? C(marathon ? '#e7ffe4' : '#d5e6e8') : LIGHT0.sunColor);
  sun.shadow.bias = interior ? -0.0012 : LIGHT0.bias;
  sun.shadow.normalBias = interior ? 0.12 : 0;
  hemi.intensity = interior ? 0.16 : LIGHT0.hemi;
  hemi.color.copy(interior ? C(marathon ? '#c6efd0' : '#c9ddd8') : LIGHT0.hemiColor);
  hemi.groundColor.copy(interior ? C(marathon ? '#0c2414' : '#1c2224') : LIGHT0.hemiGround);
  scene.environmentIntensity = interior ? (marathon ? 0.72 : 0.08) : LIGHT0.env;
  renderer.toneMappingExposure = interior ? (marathon ? 1.05 : 1.02) : LIGHT0.exp;
  sun.castShadow = !(interior || id === 'grub-trough' || id === 'hub');
  renderer.shadowMap.enabled = sun.castShadow;
  if (id === 'grub-trough') {
    sun.intensity = 0;
    sun.color.copy(C('#4a2024'));
    hemi.intensity = 0.02;
    hemi.color.copy(C('#241014'));
    hemi.groundColor.copy(C('#0a0909'));
    scene.environmentIntensity = 0.03;
    renderer.toneMappingExposure = 0.96;
  }
}


const colony = makeColony({
  hemi, sun, scene, renderer, zoneMat, alertMat,
  get frozen() { return frozen; },
  get cam() { return cam; },
});
const buildCultPlot = colony.buildCultPlot;
const buildGrubTrough = colony.buildGrubTrough;
const buildHubPlot = colony.buildHubPlot;

const BUILD = {
  'cult-a': () => buildCultPlot('a'),
  'cult-b': () => buildCultPlot('b'),
  'grub-trough': buildGrubTrough,
  field: () => buildUnit('field', 128),
  deck: () => buildUnit('deck', 128),
  hub: buildHubPlot,
  tractor: () => machine(tractorKit, 5),
  planter: () => machine(planterKit, 5.5),
  hiller: () => machine(hillerKit, 5.5),
  topper: () => machine(topperKit, 5.5),
  harvester: () => machine(potatoLifterKit, 7),
  tank: () => equip(cultureTankKit, 18, 12),
  warehouse: () => equip(warehouseKit, 24, 16),
  garage: () => equip(garageKit, 32, 18),
  process: () => equip(processKit, 14, 10),
  arm: buildArm,
  irrigator: buildIrrigator,
};

function disposeStage() {
  renderer.localClippingEnabled = false;
  while (stage.children.length) {
    const o = stage.children.pop();
    o.userData.alive = false;
    stage.remove(o);
    o.traverse(m => {
      if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mat of mats) {
        if (mat.map && mat.userData && mat.userData.dispose && !(mat.map.userData && mat.map.userData.shared)) mat.map.dispose();
        if (mat.userData && mat.userData.dispose) mat.dispose();
      }
    });
  }
}

function frameSpan(entry) {
  const vfov = cam.fov * Math.PI / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * Math.max(cam.aspect, 0.4));
  const half = entry.span * 0.56;
  eye.dist = Math.max(half / Math.tan(vfov / 2), half / Math.tan(hfov / 2)) * 1.12;
  eye.tx = 0;
  eye.ty = entry.cls === 'unit' ? 0 : Math.min(entry.span * 0.08, 5);
  eye.tz = 0;
  eye.yaw = entry.cls === 'rail' ? 0.7 : 0.85;
  eye.pitch = entry.cls === 'unit' ? 0.95 : entry.cls === 'rail' ? 0.42 : 0.46;
  if (entry.id === 'grub-trough') {
    const occ = shown && shown.group.userData.cult && shown.group.userData.cult.occupied;
    if (occ) {
      eye.tx = occ.x;
      eye.tz = occ.z;
    }
    eye.yaw = 0.78;
    eye.pitch = 0.04;
    eye.ty = 5.5;
    eye.dist = 72;
  }
  if (entry.id === 'hub') {
    const y0 = -RING.HULL;
    const y1 = RING.R;
    const mid = (y0 + y1) / 2;
    const half = (y1 - y0) / 2;
    const vfov = cam.fov * Math.PI / 180;
    eye.pitch = 0.18;
    eye.yaw = 0.9;
    eye.tx = 0;
    eye.ty = mid;
    eye.tz = 0;
    eye.dist = ((half / Math.cos(eye.pitch)) / Math.tan(vfov / 2)) * 1.35;
  }
  if (entry.id === 'cult-a' || entry.id === 'cult-b') {
    eye.yaw = entry.id === 'cult-b' ? 0.58 : 0.46;
    eye.pitch = entry.id === 'cult-b' ? 0.58 : 0.72;
    eye.ty = 0.6;
    eye.dist *= entry.id === 'cult-b' ? 0.82 : 0.94;
  }
}

function show(id) {
  const entry = LAB_ENTRIES.find(e => e.id === id) || LAB_ENTRIES[0];
  curId = entry.id;
  disposeStage();
  const built = BUILD[entry.id]();
  stage.add(built.group);
  shown = built;
  motion = built.motion;
  resize();
  frameSpan(entry);
  applyStageLight(entry);
  applyPose(frozen == null ? 0 : frozen);
  document.querySelectorAll('#catalog .ent').forEach(b => b.classList.toggle('on', b.dataset.id === entry.id));
  fillBrief(entry);
  paintLights();
  paintSection();
}

// 资产声明 lightGroups: [{ id, label, on, lights, meshes }]。没有灯组的资产不显示开关。
function applyLightGroups() {
  const groups = shown && shown.lightGroups;
  if (!groups) return;
  for (const g of groups) {
    if (!g.on) for (const L of g.lights) L.intensity = 0;
    for (const m of g.meshes) m.visible = !!g.on;
  }
}

function paintLights() {
  const bar = $('lights');
  if (!bar) return;
  bar.replaceChildren();
  const groups = shown && shown.lightGroups;
  if (!groups || !groups.length) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  const tag = document.createElement('i');
  tag.textContent = '灯组';
  bar.appendChild(tag);
  for (const g of groups) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.light = g.id;
    b.textContent = g.label;
    b.className = g.on ? 'on' : 'off';
    b.addEventListener('click', () => toggleLight(g.id));
    bar.appendChild(b);
  }
}

function paintSection() {
  const bar = $('section');
  if (!bar) return;
  bar.replaceChildren();
  const sections = shown && shown.sections;
  if (!sections || !sections.length) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  const tag = document.createElement('i');
  tag.textContent = '剖面';
  bar.appendChild(tag);
  const cur = shown.section || sections[0].id;
  for (const s of sections) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.section = s.id;
    b.textContent = s.label;
    b.className = s.id === cur ? 'on' : '';
    b.addEventListener('click', () => setHubSection(s.id));
    bar.appendChild(b);
  }
}

function setHubSection(id) {
  const sections = shown && shown.sections;
  if (!sections) return;
  const sec = sections.find(s => s.id === id) || sections[0];
  shown.section = sec.id;
  if (shown.applySection) shown.applySection(sec);
  eye.yaw = 0.72;
  eye.pitch = 0.58;
  eye.tx = -24;
  eye.tz = -36;
  eye.ty = sec.id === 'surface' ? -12 : sec.floor + 6;
  eye.dist = 430;
  paintSection();
}

function toggleLight(id, force) {
  const groups = shown && shown.lightGroups;
  if (!groups) return;
  const g = groups.find(x => x.id === id);
  if (!g) return;
  g.on = force == null ? !g.on : !!force;
  applyPose(frozen == null ? ((performance.now() % 4200) / 4200) : frozen);
  paintLights();
}

function applyPose(p) {
  if (!shown) return;
  if (shown.ownState) {
    if (motion) motion(p, state);
    applyLightGroups();
    return;
  }
  shown.ring.visible = state === 'sel';
  for (const m of shown.ring.children) m.material = zoneMat;
  shown.group.rotation.z = state === 'break' ? 0.045 : 0;
  if (state === 'break' && shown.ring) {
    shown.ring.visible = true;
    for (const m of shown.ring.children) m.material = alertMat;
  }
  if (motion) motion(p, state);
  applyLightGroups();
}

function resize() {
  const w = viewEl.clientWidth || 800;
  const h = viewEl.clientHeight || 600;
  renderer.setSize(w, h, false);
  cam.aspect = w / Math.max(h, 1);
  cam.updateProjectionMatrix();
}

function placeCam() {
  const cp = Math.cos(eye.pitch), sp = Math.sin(eye.pitch);
  cam.position.set(
    eye.tx + eye.dist * Math.sin(eye.yaw) * cp,
    eye.ty + eye.dist * sp,
    eye.tz + eye.dist * Math.cos(eye.yaw) * cp,
  );
  cam.lookAt(eye.tx, eye.ty, eye.tz);
  const near = Math.max(0.06, eye.dist / 500);
  const far = Math.max(8000, eye.dist * 8);
  if (Math.abs(cam.near - near) > near * 0.05 || Math.abs(cam.far - far) > 1) {
    cam.near = near;
    cam.far = far;
    cam.updateProjectionMatrix();
  }
  const interior = shown && shown.ownState;
  if (interior) {
    const r = CULT_EMPTY.plot;
    sun.position.set(eye.tx + r * 0.42, r * 0.72, eye.tz + r * 0.28);
    sc.left = sc.bottom = -r * 0.78;
    sc.right = sc.top = r * 0.78;
    sc.near = 8;
    sc.far = r * 3.2;
  } else {
    sun.position.set(eye.tx + 48, 90, eye.tz + 36);
    sc.left = sc.bottom = -90;
    sc.right = sc.top = 90;
    sc.near = 1;
    sc.far = 280;
  }
  sc.updateProjectionMatrix();
  sun.target.position.set(eye.tx, eye.ty, eye.tz);
}

function loadBriefs() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function classLabel(id) {
  return (LAB_CLASSES.find(c => c.id === id) || {}).label || id;
}
function fillBrief(entry) {
  const all = loadBriefs();
  const marker = entry.id === 'cult-b' ? '漆面' : entry.id === 'cult-a' ? '后开始' : entry.id === 'grub-trough' ? '光晕' : entry.id === 'hub' ? '环心' : '';
  if (marker && (!all[entry.id] || !String(all[entry.id].notes || '').includes(marker))) {
    all[entry.id] = {
      name: entry.name,
      cls: classLabel(entry.cls),
      size: entry.size,
      notes: entry.notes,
    };
    localStorage.setItem(STORE, JSON.stringify(all));
  }
  const saved = all[entry.id] || {};
  $('b-name').value = saved.name || entry.name;
  $('b-cls').value = saved.cls || classLabel(entry.cls);
  $('b-size').value = saved.size || entry.size;
  $('b-notes').value = saved.notes || entry.notes;
}
function saveBrief() {
  const all = loadBriefs();
  all[curId] = {
    name: $('b-name').value,
    cls: $('b-cls').value,
    size: $('b-size').value,
    notes: $('b-notes').value,
  };
  localStorage.setItem(STORE, JSON.stringify(all));
}

const STATES = { idle: '空闲', job: '作业', sel: '选中', break: '损坏' };
function setState(next) {
  if (!STATES[next]) return;
  state = next;
  document.querySelectorAll('#states button').forEach(b => b.classList.toggle('on', b.dataset.s === state));
  applyPose(frozen == null ? ((performance.now() % 4200) / 4200) : frozen);
}

function paintCatalog() {
  const nav = $('catalog');
  for (const c of LAB_CLASSES) {
    const h = document.createElement('div');
    h.className = 'cls';
    h.textContent = c.label;
    nav.appendChild(h);
    for (const e of LAB_ENTRIES) {
      if (e.cls !== c.id) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ent';
      b.dataset.id = e.id;
      b.textContent = e.name;
      b.addEventListener('click', () => show(e.id));
      nav.appendChild(b);
    }
  }
}

$('states').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setState(b.dataset.s);
});
for (const id of ['b-name', 'b-cls', 'b-size', 'b-notes']) $(id).addEventListener('input', saveBrief);
addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  const map = { 1: 'idle', 2: 'job', 3: 'sel', 4: 'break' };
  if (map[e.key]) setState(map[e.key]);
});
addEventListener('resize', resize);

const canvas = renderer.domElement;
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, yaw: eye.yaw, pitch: eye.pitch, tx: eye.tx, ty: eye.ty, tz: eye.tz, button: e.button };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (drag.button === 2 || e.shiftKey) {
    const cp = Math.cos(eye.pitch);
    const k = eye.dist * 0.0015;
    const rx = Math.cos(eye.yaw), rz = -Math.sin(eye.yaw);
    const fx = -Math.sin(eye.yaw), fz = -Math.cos(eye.yaw);
    eye.tx = drag.tx - dx * rx * k - dy * fx * cp * k;
    eye.tz = drag.tz - dx * rz * k - dy * fz * cp * k;
  } else {
    eye.yaw = drag.yaw - dx * 0.005;
    eye.pitch = Math.max(0.12, Math.min(1.25, drag.pitch + dy * 0.004));
  }
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const distCap = curId === 'hub' ? 90000 : 6000;
  eye.dist = Math.min(distCap, Math.max(2.5, eye.dist * (e.deltaY > 0 ? 1.08 : 0.92)));
}, { passive: false });

for (const e of LAB_ENTRIES) {
  if (!BUILD[e.id]) throw new Error('资产工坊缺少预制：' + e.id);
}
paintCatalog();
setState('idle');
show(curId);

let lastW = 0, lastH = 0, framed = false;
function tick() {
  const w = viewEl.clientWidth, h = viewEl.clientHeight;
  if (w && h && (w !== lastW || h !== lastH)) {
    const first = !framed;
    lastW = w; lastH = h;
    resize();
    if (first) {
      framed = true;
      frameSpan(LAB_ENTRIES.find(e => e.id === curId));
    }
  }
  const p = frozen == null ? (performance.now() % 4200) / 4200 : frozen;
  applyPose(p);
  placeCam();
  renderer.render(scene, cam);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.__lab = {
  ready: true,
  classes: LAB_CLASSES.map(c => c.label),
  entries: LAB_ENTRIES.map(e => e.id),
  get id() { return curId; },
  get state() { return state; },
  get view() { return { yaw: eye.yaw, pitch: eye.pitch, dist: eye.dist, tx: eye.tx, ty: eye.ty, tz: eye.tz }; },
  get section() { return (shown && shown.section) || null; },
  setSection(id) { setHubSection(id); },
  get hub() { return (shown && shown.group && shown.group.userData.hub) || null; },
  select(id) { show(id); },
  reframe() { frameSpan(LAB_ENTRIES.find(e => e.id === curId)); },
  setState,
  pose(p) { frozen = p; applyPose(p); },
  look(part) { if (part) Object.assign(eye, part); },
  get cult() { return (shown && shown.group && shown.group.userData.cult) || null; },
  get grub() { return (shown && shown.group && shown.group.userData.grub) || null; },
  get brief() { return loadBriefs()[curId] || null; },
  get lights() {
    return ((shown && shown.lightGroups) || []).map(g => ({ id: g.id, label: g.label, on: g.on }));
  },
  toggleLight(id) { toggleLight(id); },
  setLight(id, on) { toggleLight(id, on); },
};
