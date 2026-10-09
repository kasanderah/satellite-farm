// 环穗 · 资产工坊。设计沙盒，不接主进度。网格和预制件跟游戏同一套。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PALETTE } from './_shared.js';
import { LAB_CLASSES, LAB_ENTRIES, CULT_EMPTY } from './lab-catalog.js';
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

function box(w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
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

// 培育层空单元：一块地里 16 个抬缘白台。无设备、无作物。
function buildCultEmpty() {
  const U = CULT_EMPTY;
  const g = new THREE.Group();
  g.userData.alive = true;
  const mat = (opts) => {
    const m = new THREE.MeshStandardMaterial(opts);
    m.userData.dispose = true;
    return m;
  };
  const basic = (color) => {
    const m = new THREE.MeshBasicMaterial({ color });
    m.userData.dispose = true;
    return m;
  };
  const floorMat = mat({ color: '#5a6164', roughness: 0.94, metalness: 0.04 });
  const seamMat = mat({ color: '#1c2124', roughness: 0.96, metalness: 0.08 });
  const cableMat = mat({ color: '#3a4145', roughness: 0.72, metalness: 0.35 });
  const wallMat = mat({ color: '#2b3034', roughness: 0.84, metalness: 0.28 });
  const ceilMat = mat({ color: '#23272b', roughness: 0.9, metalness: 0.2 });
  const doorMat = mat({ color: '#8d9497', roughness: 0.78, metalness: 0.22 });
  const doorBackMat = mat({ color: '#16191c', roughness: 0.9, metalness: 0.1 });
  const apronMat = mat({ color: '#12151a', roughness: 0.96, metalness: 0.02 });
  const padMat = mat({ color: '#d8dad7', roughness: 0.93, metalness: 0.02, emissive: '#d8dad7', emissiveIntensity: 0 });
  const wearMat = mat({ color: '#6a645c', roughness: 1, metalness: 0 });
  const glowMat = basic('#9fcfc6');
  const stripMat = basic('#6e9c96');
  const slitMat = basic('#6f948f');
  const padBuilt = padGeometry(U.unit, U.raise, U.chamfer, U.bevel);
  const padTop = padBuilt.top;
  const core = 4 * U.unit + 3 * U.seam;
  const origin = -core / 2 + U.unit / 2;
  const centers = [0, 1, 2, 3].map(i => origin + i * (U.unit + U.seam));
  const pads = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) pads.push({ i, j, n: j * 4 + i + 1, x: centers[i], z: centers[j] });

  const apron = new THREE.Mesh(new THREE.PlaneGeometry(U.plot + 90, U.plot + 90).rotateX(-Math.PI / 2), apronMat);
  apron.position.y = -0.04;
  apron.receiveShadow = true;
  g.add(apron);
  const floor = box(U.plot, 0.5, U.plot, 0, -0.25, 0, floorMat);
  floor.castShadow = false;
  g.add(floor);

  const addStrip = (w, h, d, x, y, z, material) => {
    const m = box(w, h, d, x, y, z, material);
    m.castShadow = false;
    return m;
  };
  for (let k = 0; k < 3; k++) {
    const at = origin + U.unit / 2 + U.seam / 2 + k * (U.unit + U.seam);
    addStrip(U.seam * 0.98, 0.02, core, at, 0.012, 0, seamMat);
    addStrip(core, 0.02, U.seam * 0.98, 0, 0.016, at, seamMat);
    addStrip(0.62, 0.045, core - U.seam, at, 0.05, 0, cableMat);
    addStrip(core - U.seam, 0.045, 0.62, 0, 0.07, at, cableMat);
  }

  const glowW = 0.16;
  const glowLen = U.unit - U.chamfer * 2 - 1.4;
  const glowInset = 0.55;
  for (const p of pads) {
    const mesh = new THREE.Mesh(padBuilt.geo, padMat);
    mesh.position.set(p.x, 0, p.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.code = `${U.code}-U${String(p.n).padStart(2, '0')}`;
    g.add(mesh);
    const y = padTop + 0.018;
    const e = U.unit / 2 - glowInset;
    addStrip(glowLen, 0.012, glowW, p.x, y, p.z - e, glowMat);
    addStrip(glowLen, 0.012, glowW, p.x, y, p.z + e, glowMat);
    addStrip(glowW, 0.012, glowLen, p.x - e, y, p.z, glowMat);
    addStrip(glowW, 0.012, glowLen, p.x + e, y, p.z, glowMat);
  }

  const labels = [];
  const labelGeo = new THREE.PlaneGeometry(34, 6.4);
  const placeLabel = (text, x, z, yaw) => {
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    material.userData.dispose = true;
    const mesh = new THREE.Mesh(labelGeo, material);
    mesh.position.set(x, padTop + 0.04, z);
    mesh.renderOrder = 3;
    mesh.rotateX(-Math.PI / 2);
    mesh.rotateZ(yaw);
    g.add(mesh);
    labels.push({ mesh, text });
  };
  const textInset = 5.2;
  for (const p of pads) {
    const text = `${U.code}-U${String(p.n).padStart(2, '0')}`;
    const h = U.unit / 2 - textInset;
    placeLabel(text, p.x, p.z - h, 0);
    placeLabel(text, p.x, p.z + h, Math.PI);
    placeLabel(text, p.x + h, p.z, -Math.PI / 2);
    placeLabel(text, p.x - h, p.z, Math.PI / 2);
  }
  const paintLabels = () => {
    if (!g.userData.alive) return;
    for (const label of labels) {
      const prev = label.mesh.material.map;
      label.mesh.material.map = labelTexture(label.text);
      label.mesh.material.needsUpdate = true;
      if (prev) prev.dispose();
    }
  };
  paintLabels();
  if (document.fonts && document.fonts.load) document.fonts.load('500 72px BarlowSC').then(paintLabels);

  let doors = 0;
  const addWall = (horizontal, sign) => {
    const fixed = sign * (U.plot / 2 - U.wall / 2);
    const span0 = horizontal ? -U.plot / 2 : -(U.plot / 2 - U.wall);
    const span1 = -span0;
    const cuts = centers.map(c => [c - U.doorW / 2, c + U.doorW / 2]);
    const segment = (len, y0, y1, a0) => {
      if (len <= 0.04 || y1 - y0 <= 0.04) return;
      const midA = a0 + len / 2;
      const midY = (y0 + y1) / 2;
      const h = y1 - y0;
      const m = horizontal
        ? box(len, h, U.wall, midA, midY, fixed, wallMat)
        : box(U.wall, h, len, fixed, midY, midA, wallMat);
      m.castShadow = false;
      g.add(m);
    };
    let cursor = span0;
    for (const [a, b] of cuts) {
      segment(a - cursor, 0, U.clear, cursor);
      segment(b - a, U.doorH, U.clear, a);
      addDoor(horizontal, sign, (a + b) / 2, fixed);
      doors += 1;
      cursor = b;
    }
    segment(span1 - cursor, 0, U.clear, cursor);
  };
  const addDoor = (horizontal, sign, along, fixed) => {
    const outer = sign * (U.wall / 2 - 0.16);
    const x = horizontal ? along : fixed + outer;
    const z = horizontal ? fixed + outer : along;
    const back = -sign * (U.wall / 2 - 0.06);
    const bx = horizontal ? along : fixed + back;
    const bz = horizontal ? fixed + back : along;
    const plate = horizontal
      ? box(U.doorW - 0.08, U.doorH - 0.08, 0.06, bx, U.doorH / 2, bz, doorBackMat)
      : box(0.06, U.doorH - 0.08, U.doorW - 0.08, bx, U.doorH / 2, bz, doorBackMat);
    plate.castShadow = false;
    g.add(plate);
    const leafW = (U.doorW - 0.36) / 2;
    const leafH = U.doorH - 0.28;
    const y = 0.08 + leafH / 2;
    for (const s of [-1, 1]) {
      const off = s * (leafW / 2 + 0.06);
      const leaf = horizontal
        ? box(leafW, leafH, 0.1, x + off, y, z, doorMat)
        : box(0.1, leafH, leafW, x, y, z + off, doorMat);
      leaf.castShadow = false;
      g.add(leaf);
      const slit = horizontal
        ? box(leafW * 0.42, 0.04, 0.02, x + off, y + leafH * 0.16, z + sign * 0.07, slitMat)
        : box(0.02, 0.04, leafW * 0.42, x + sign * 0.07, y + leafH * 0.16, z + off, slitMat);
      slit.castShadow = false;
      g.add(slit);
    }
    const sillY = 0.03;
    const sillAt = fixed - sign * (U.wall / 2 + 0.78);
    const sill = horizontal
      ? box(U.doorW + 0.6, 0.04, 1.35, along, sillY, sillAt, floorMat)
      : box(1.35, 0.04, U.doorW + 0.6, sillAt, sillY, along, floorMat);
    sill.castShadow = false;
    g.add(sill);
  };
  addWall(true, -1);
  addWall(true, 1);
  addWall(false, -1);
  addWall(false, 1);

  const lip = 8;
  const lipH = 0.55;
  const lipY = U.clear - lipH / 2;
  const inner = U.plot / 2 - U.wall;
  for (const sign of [-1, 1]) {
    addStrip(U.plot - U.wall * 2, lipH, lip, 0, lipY, sign * (inner - lip / 2), ceilMat);
    addStrip(lip, lipH, U.plot - U.wall * 2 - lip * 2, sign * (inner - lip / 2), lipY, 0, ceilMat);
  }
  const stripY = U.clear - 1.15;
  const stripLen = core * 0.92;
  for (const c of centers) {
    const sx = addStrip(stripLen, 0.1, 0.42, 0, stripY, c, stripMat);
    const sz = addStrip(0.42, 0.1, stripLen, c, stripY, 0, stripMat);
    sx.material = stripMat;
    sz.material = stripMat;
  }
  stripMat.side = THREE.DoubleSide;
  glowMat.side = THREE.DoubleSide;

  const wear = new THREE.Group();
  wear.visible = false;
  const stains = [
    [0, 2, 14, -8, 22, 7, 0.35],
    [1, 0, -18, 12, 16, 9, -0.25],
    [3, 3, 6, 16, 26, 6, 0.12],
    [2, 1, -4, -14, 18, 8, 1.05],
    [0, 0, 20, 18, 14, 12, 0.6],
    [3, 1, -12, 6, 28, 2.2, 0.2],
    [1, 3, 10, -20, 12, 14, -0.4],
    [2, 2, -24, 8, 9, 20, 0.8],
  ];
  for (const [i, j, lx, lz, w, d, rot] of stains) {
    const p = pads[j * 4 + i];
    const m = box(w, 0.02, d, p.x + lx, padTop + 0.03, p.z + lz, wearMat);
    m.castShadow = false;
    m.rotation.y = rot;
    wear.add(m);
  }
  g.add(wear);

  const look = {
    idle: { pad: '#d8dad7', emis: 0, rough: 0.93, glow: '#8fbfb8', strip: '#5f8e88', wear: false },
    job: { pad: '#d8dad7', emis: 0.025, rough: 0.93, glow: '#b5e4dc', strip: '#8ecfc6', wear: false },
    sel: { pad: '#e7eae6', emis: 0.06, rough: 0.88, glow: '#e7fffa', strip: '#8fd0c8', wear: false },
    break: { pad: '#aea89f', emis: 0, rough: 1, glow: '#3e524f', strip: '#334845', wear: true },
  };
  g.userData.cult = { pads: pads.length, doors, labels: labels.length, unit: U.unit, plot: U.plot, seam: U.seam, lane: U.lane, raise: padTop };
  return {
    group: g,
    ring: new THREE.Group(),
    ownState: true,
    motion(_p, st) {
      const L = look[st] || look.idle;
      padMat.color.set(L.pad);
      padMat.emissive.set(L.pad);
      padMat.emissiveIntensity = L.emis;
      padMat.roughness = L.rough;
      glowMat.color.set(L.glow);
      stripMat.color.set(L.strip);
      wear.visible = L.wear;
    },
  };
}

function padGeometry(size, height, chamfer, bevel) {
  const h = size / 2;
  const c = Math.min(chamfer, h * 0.4);
  const sh = new THREE.Shape();
  sh.moveTo(-h + c, -h);
  sh.lineTo(h - c, -h);
  sh.lineTo(h, -h + c);
  sh.lineTo(h, h - c);
  sh.lineTo(h - c, h);
  sh.lineTo(-h + c, h);
  sh.lineTo(-h, h - c);
  sh.lineTo(-h, -h + c);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, {
    depth: Math.max(0.04, height - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.55,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const hh = geo.boundingBox.max.y - geo.boundingBox.min.y || 1;
  geo.translate(0, -geo.boundingBox.min.y, 0);
  geo.scale(1, height / hh, 1);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return { geo, top: geo.boundingBox.max.y };
}

function labelTexture(text) {
  const W = 2048, H = 320;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#24272c';
  g.font = '500 168px BarlowSC, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '14px';
  g.fillText(text, W / 2, H / 2 + 4);
  g.globalCompositeOperation = 'destination-out';
  g.fillRect(0, H / 2 - 5, W, 9);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function applyStageLight(entry) {
  const interior = entry && entry.id === 'cult-empty';
  sun.intensity = interior ? 0.9 : LIGHT0.sun;
  sun.color.copy(interior ? C('#e4eeef') : LIGHT0.sunColor);
  sun.shadow.bias = interior ? -0.0012 : LIGHT0.bias;
  sun.shadow.normalBias = interior ? 0.12 : 0;
  hemi.intensity = interior ? 0.62 : LIGHT0.hemi;
  hemi.color.copy(interior ? C('#d5e2e4') : LIGHT0.hemiColor);
  hemi.groundColor.copy(interior ? C('#3c4244') : LIGHT0.hemiGround);
  scene.environmentIntensity = interior ? 0.16 : LIGHT0.env;
  renderer.toneMappingExposure = interior ? 1.42 : LIGHT0.exp;
}

const BUILD = {
  'cult-empty': buildCultEmpty,
  field: () => buildUnit('field', 128),
  deck: () => buildUnit('deck', 128),
  hub: () => buildUnit('hub', 530),
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
  while (stage.children.length) {
    const o = stage.children.pop();
    o.userData.alive = false;
    stage.remove(o);
    o.traverse(m => {
      if (m.geometry) m.geometry.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mat of mats) {
        if (mat.map && mat.userData && mat.userData.dispose) mat.map.dispose();
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
  if (entry.id === 'cult-empty') {
    eye.yaw = 0.46;
    eye.pitch = 0.72;
    eye.ty = 0.6;
    eye.dist *= 0.94;
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
}

function applyPose(p) {
  if (!shown) return;
  if (shown.ownState) {
    if (motion) motion(p, state);
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
  if (entry.id === 'cult-empty' && !all[entry.id]) {
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
  eye.dist = Math.min(6000, Math.max(2.5, eye.dist * (e.deltaY > 0 ? 1.08 : 0.92)));
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
  get view() { return { yaw: eye.yaw, pitch: eye.pitch, dist: eye.dist }; },
  select(id) { show(id); },
  reframe() { frameSpan(LAB_ENTRIES.find(e => e.id === curId)); },
  setState,
  pose(p) { frozen = p; },
  look(part) { if (part) Object.assign(eye, part); },
  get cult() { return (shown && shown.group && shown.group.userData.cult) || null; },
  get brief() { return loadBriefs()[curId] || null; },
};
