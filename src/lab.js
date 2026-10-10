// 环穗 · 资产工坊。设计沙盒，不接主进度。网格和预制件跟游戏同一套。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PALETTE, RING } from './_shared.js';
import { LAB_CLASSES, LAB_ENTRIES, CULT_EMPTY, planGrubColumns, GRUB_DEMO_GANTRIES, GRUB_WORK_MPS, GRUB_EMPTY_MPS } from './lab-catalog.js';
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

// 软光晕：灯心上的加法贴片，不产生点光或聚光。贴图整场共用。
const glowMap = (() => {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const r = s / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.14, 'rgba(255,255,255,0.82)');
  grd.addColorStop(0.32, 'rgba(255,255,255,0.34)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.1)');
  grd.addColorStop(0.78, 'rgba(255,255,255,0.02)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.userData.shared = true;
  return tex;
})();

function haloMaterial(color, opacity) {
  const m = new THREE.SpriteMaterial({
    map: glowMap,
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  m.userData.dispose = true;
  m.userData.base = opacity;
  return m;
}

// 两层光斑：内层是灯心，外层是淡晕。list 收到灯组里，关掉灯组时一起隐藏。
function addHalo(parent, list, color, size, x, y, z) {
  const made = [];
  for (const [k, o] of [[1, 0.72], [1.7, 0.2]]) {
    const sprite = new THREE.Sprite(haloMaterial(color, o));
    sprite.geometry.userData.shared = true;
    sprite.position.set(x, y, z);
    sprite.scale.set(size * k, size * k, 1);
    sprite.renderOrder = 8;
    sprite.userData.halo = true;
    sprite.userData.haloBase = o;
    parent.add(sprite);
    if (list) list.push(sprite);
    made.push(sprite);
  }
  return made;
}

function fadeHalos(list, mul) {
  if (!list) return;
  for (const m of list) {
    if (!m.userData.halo) continue;
    m.material.opacity = m.userData.haloBase * mul;
  }
}

// 同一盏长灯或一排小灯共用一个点云，面向镜头，仍然不照亮周围。
function addHaloPoints(parent, list, positions, color, worldSize, opacity = 0.5) {
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const m = new THREE.PointsMaterial({
    map: glowMap,
    color,
    size: worldSize * 3.5,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    alphaTest: 0.02,
    opacity,
  });
  m.userData.dispose = true;
  m.userData.base = opacity;
  const pts = new THREE.Points(geo, m);
  pts.userData.halo = true;
  pts.userData.haloBase = opacity;
  pts.renderOrder = 4;
  parent.add(pts);
  if (list) list.push(pts);
  return pts;
}

function fadeHaloMat(mat, mul) {
  if (mat) mat.opacity = mat.userData.base * mul;
}

function pushGlowLine(arr, x, y, z, len, alongZ, step) {
  const n = Math.max(1, Math.round(Math.abs(len) / step));
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n - 0.5) * len;
    if (alongZ) arr.push(x, y, z + t);
    else arr.push(x + t, y, z);
  }
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

// 培育地块。scheme a = 抬缘白台，b = 漆面绿。灯组挂在返回值上，工坊逐组开关。
function buildCultPlot(scheme, opts) {
  const marathon = scheme === 'b';
  const weak = scheme === 'a' && !!(opts && opts.weak);
  const U = CULT_EMPTY;
  const g = new THREE.Group();
  g.userData.alive = true;
  const mat = (opts) => {
    const m = new THREE.MeshStandardMaterial(opts);
    m.userData.dispose = true;
    return m;
  };
  const gloss = (opts) => {
    const m = new THREE.MeshPhysicalMaterial({ envMapIntensity: 1.05, ...opts });
    m.userData.dispose = true;
    return m;
  };
  const groups = {
    strip: { id: 'strip', label: '顶灯带', on: true, lights: [], meshes: [] },
    rim: { id: 'ground', label: marathon ? '台缘' : '地灯', on: true, lights: [], meshes: [] },
    door: { id: 'door', label: '门灯', on: true, lights: [], meshes: [] },
    wall: { id: 'wall', label: '墙灯', on: true, lights: [], meshes: [] },
  };
  if (marathon) {
    groups.accent = { id: 'accent', label: '紫灯', on: true, lights: [], meshes: [] };
    groups.accent.haloPos = [];
  }
  const stripHaloPos = [];
  const doorHaloPos = [];
  const wallHaloPos = [];
  const rimHaloPos = [];
  const floorMat = marathon
    ? gloss({ color: '#063318', roughness: 0.22, metalness: 0.08, clearcoat: 0.6, clearcoatRoughness: 0.25 })
    : mat({ color: '#5a6164', roughness: 0.94, metalness: 0.04 });
  const seamMat = mat({ color: marathon ? '#04150c' : '#1c2124', roughness: marathon ? 0.4 : 0.96, metalness: 0.08 });
  const cableMat = mat({ color: marathon ? '#0a2414' : '#3a4145', roughness: 0.72, metalness: 0.35 });
  const wallMat = marathon
    ? gloss({ color: '#128a32', roughness: 0.16, metalness: 0.06, clearcoat: 0.9, clearcoatRoughness: 0.14 })
    : mat({ color: '#2b3034', roughness: 0.84, metalness: 0.28 });
  const ceilMat = mat({ color: marathon ? '#0a3d1c' : '#23272b', roughness: marathon ? 0.35 : 0.9, metalness: 0.2 });
  const doorMat = marathon
    ? gloss({ color: '#0f7a2c', roughness: 0.18, metalness: 0.08, clearcoat: 0.85, clearcoatRoughness: 0.16 })
    : mat({ color: '#8d9497', roughness: 0.78, metalness: 0.22 });
  const doorBackMat = mat({ color: marathon ? '#06210f' : '#16191c', roughness: 0.9, metalness: 0.1 });
  const apronMat = mat({ color: marathon ? '#07140c' : '#12151a', roughness: 0.96, metalness: 0.02 });
  const padMat = marathon
    ? gloss({ color: '#16a33c', roughness: 0.14, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12 })
    : mat({ color: '#c5c9c6', roughness: 0.9, metalness: 0.04, emissive: '#000000', emissiveIntensity: 0 });
  const wearMat = mat({ color: marathon ? '#3a4a28' : '#6a645c', roughness: 1, metalness: 0 });
  const ribMat = marathon
    ? gloss({ color: '#0e6e2a', roughness: 0.18, metalness: 0.1, clearcoat: 0.75, clearcoatRoughness: 0.18 })
    : mat({ color: '#46525a', roughness: 0.58, metalness: 0.42 });
  const beamMat = marathon
    ? gloss({ color: '#149438', roughness: 0.16, metalness: 0.08, clearcoat: 0.8, clearcoatRoughness: 0.16 })
    : mat({ color: '#3c474e', roughness: 0.55, metalness: 0.48 });
  const lineMat = mat({ color: marathon ? '#063318' : '#1a1f23', roughness: 0.84, metalness: 0.16 });
  const redMat = gloss({ color: '#e10600', roughness: 0.2, metalness: 0.04, clearcoat: 0.7, clearcoatRoughness: 0.18, emissive: '#ff2a2a', emissiveIntensity: marathon ? 0.35 : 0 });
  const housingMat = mat({ color: marathon ? '#08301a' : '#171c20', roughness: 0.5, metalness: 0.55 });
  const glowMat = mat({ color: marathon ? '#3a1060' : '#06211e', emissive: marathon ? '#d28bff' : '#c8fff6', emissiveIntensity: 3.2, roughness: 0.32, metalness: 0 });
  const stripMat = mat({ color: marathon ? '#063318' : (weak ? '#14080c' : '#041614'), emissive: marathon ? '#b6ffc8' : (weak ? '#c01828' : '#b6fff4'), emissiveIntensity: 2.4, roughness: 0.28, metalness: 0 });
  const slitMat = mat({ color: marathon ? '#2a0848' : (weak ? '#2a1c08' : '#06302c'), emissive: marathon ? '#c060ff' : (weak ? '#ffcc66' : '#9ee8de'), emissiveIntensity: 1.4, roughness: 0.4, metalness: 0 });
  const accentMat = mat({ color: '#2a0844', emissive: '#d090ff', emissiveIntensity: 2.8, roughness: 0.3, metalness: 0 });
  const wallGlowMat = mat({ color: marathon ? '#0c2818' : '#041614', emissive: marathon ? '#b6ffc8' : (weak ? '#401018' : '#c8fff6'), emissiveIntensity: weak ? 0 : 1.8, roughness: 0.32, metalness: 0 });
  const gridMap = padGridTexture(marathon);
  const gridMat = marathon
    ? gloss({ map: gridMap, color: '#ffffff', roughness: 0.16, metalness: 0.04, clearcoat: 0.85, clearcoatRoughness: 0.16 })
    : mat({ map: gridMap, color: '#f2f4f2', roughness: 0.92, metalness: 0.03, emissive: '#000000', emissiveIntensity: 0 });
  const corner = marathon ? 16 : U.chamfer;
  const bevel = marathon ? 0.18 : U.bevel;
  const padBuilt = padGeometry(U.unit, U.raise, corner, bevel, marathon);
  const padTop = padBuilt.top;
  if (!marathon) {
    const pos = padBuilt.geo.attributes.position;
    const uv = padBuilt.geo.attributes.uv;
    const norm = padBuilt.geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      if (norm.getY(i) > 0.72) uv.setXY(i, pos.getX(i) / U.unit + 0.5, pos.getZ(i) / U.unit + 0.5);
      else uv.setXY(i, 0.008, 0.008);
    }
    uv.needsUpdate = true;
    padMat.map = gridMap;
    padMat.color.set('#ffffff');
  }
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

  const glowW = marathon ? 0.7 : 0.42;
  const glowLen = U.unit - corner * 2 - 1.6;
  const glowInset = marathon ? 1.35 : 0.72;
  const gridSize = U.unit - corner * 2 - 2.4;
  const gridGeo = new THREE.PlaneGeometry(gridSize, gridSize).rotateX(-Math.PI / 2);
  for (const p of pads) {
    const mesh = new THREE.Mesh(padBuilt.geo, padMat);
    mesh.position.set(p.x, 0, p.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.code = `${U.code}-U${String(p.n).padStart(2, '0')}`;
    g.add(mesh);
    if (marathon) {
      const grid = new THREE.Mesh(gridGeo, gridMat);
      grid.position.set(p.x, padTop + 0.012, p.z);
      grid.receiveShadow = true;
      grid.castShadow = false;
      g.add(grid);
    }
    if (marathon) {
      const y = padTop + 0.028;
      const e = U.unit / 2 - glowInset;
      for (const mesh of [
        addStrip(glowLen, 0.02, glowW, p.x, y, p.z - e, glowMat),
        addStrip(glowLen, 0.02, glowW, p.x, y, p.z + e, glowMat),
        addStrip(glowW, 0.02, glowLen, p.x - e, y, p.z, glowMat),
        addStrip(glowW, 0.02, glowLen, p.x + e, y, p.z, glowMat),
      ]) groups.rim.meshes.push(mesh);
      pushGlowLine(rimHaloPos, p.x, y + 0.08, p.z - e, glowLen, false, 12);
      pushGlowLine(rimHaloPos, p.x, y + 0.08, p.z + e, glowLen, false, 12);
      pushGlowLine(rimHaloPos, p.x - e, y + 0.08, p.z, glowLen, true, 12);
      pushGlowLine(rimHaloPos, p.x + e, y + 0.08, p.z, glowLen, true, 12);
      const band = addStrip(U.unit - corner * 2 - 8, 0.03, 0.7, p.x, y + 0.012, p.z, redMat);
      if (p.n % 2) band.rotation.y = Math.PI / 2;
    }
  }
  const markerMat = mat({ color: '#d7fff6', emissive: '#e9fff8', emissiveIntensity: 4.2, roughness: 0.22, metalness: 0 });
  let markerMesh = null;
  if (!marathon) {
    const markers = [];
    const half = U.unit / 2 - 6.2;
    const step = 15.5;
    const edge = U.unit / 2 - 1.25;
    for (const p of pads) {
      for (let t = -half; t <= half + 0.01; t += step) {
        markers.push([p.x + t, p.z - edge]);
        markers.push([p.x + t, p.z + edge]);
        markers.push([p.x - edge, p.z + t]);
        markers.push([p.x + edge, p.z + t]);
      }
    }
    const baseGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.06, 8);
    const postGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.46, 7);
    const headGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.16, 10);
    const postMat = mat({ color: '#2c3338', roughness: 0.48, metalness: 0.62 });
    const base = new THREE.InstancedMesh(baseGeo, postMat, markers.length);
    const post = new THREE.InstancedMesh(postGeo, postMat, markers.length);
    markerMesh = new THREE.InstancedMesh(headGeo, markerMat, markers.length);
    const dummy = new THREE.Object3D();
    markers.forEach(([x, z], i) => {
      dummy.position.set(x, padTop + 0.03, z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      base.setMatrixAt(i, dummy.matrix);
      dummy.position.y = padTop + 0.28;
      dummy.updateMatrix();
      post.setMatrixAt(i, dummy.matrix);
      dummy.position.y = padTop + 0.56;
      dummy.updateMatrix();
      markerMesh.setMatrixAt(i, dummy.matrix);
    });
    base.castShadow = post.castShadow = markerMesh.castShadow = false;
    g.add(base, post, markerMesh);
    groups.rim.meshes.push(base, post, markerMesh);
    for (const [x, z] of markers) rimHaloPos.push(x, padTop + 0.72, z);
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
    const shared = new Map();
    for (const label of labels) {
      let tex = shared.get(label.text);
      if (!tex) {
        tex = labelTexture(label.text, marathon ? '#f3fff4' : '#24272c');
        tex.userData.shared = true;
        shared.set(label.text, tex);
      }
      const prev = label.mesh.material.map;
      label.mesh.material.map = tex;
      label.mesh.material.needsUpdate = true;
      if (prev && prev !== tex) prev.dispose();
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
    const innerFace = -sign * (U.wall / 2 - 0.16);
    const x = horizontal ? along : fixed + innerFace;
    const z = horizontal ? fixed + innerFace : along;
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
        ? box(leafW * 0.55, 0.14, 0.04, x + off, y + leafH * 0.18, z - sign * 0.09, slitMat)
        : box(0.04, 0.14, leafW * 0.55, x - sign * 0.09, y + leafH * 0.18, z + off, slitMat);
      slit.castShadow = false;
      g.add(slit);
      groups.door.meshes.push(slit);
      doorHaloPos.push(slit.position.x, slit.position.y, slit.position.z);
      if (marathon) {
        const stripe = horizontal
          ? box(leafW * 0.92, 0.16, 0.03, x + off, y - leafH * 0.22, z - sign * 0.07, redMat)
          : box(0.03, 0.16, leafW * 0.92, x - sign * 0.07, y - leafH * 0.22, z + off, redMat);
        stripe.castShadow = false;
        g.add(stripe);
      }
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
  const wallKit = { beamMat, ribMat, lineMat, redMat, accentMat, marathon, groups };
  dressCultWall(g, true, -1, U, centers, wallKit);
  dressCultWall(g, true, 1, U, centers, wallKit);
  dressCultWall(g, false, -1, U, centers, wallKit);
  dressCultWall(g, false, 1, U, centers, wallKit);
  if (marathon) addCornerFillets(g, U, wallMat, redMat, accentMat, groups);

  const lip = 8;
  const lipH = 0.55;
  const lipY = U.clear - lipH / 2;
  const inner = U.plot / 2 - U.wall;
  for (const sign of [-1, 1]) {
    addStrip(U.plot - U.wall * 2, lipH, lip, 0, lipY, sign * (inner - lip / 2), ceilMat);
    addStrip(lip, lipH, U.plot - U.wall * 2 - lip * 2, sign * (inner - lip / 2), lipY, 0, ceilMat);
  }
  const stripY = U.clear - 1.05;
  const stripLen = core * 0.94;
  const rects = [];
  for (const c of centers) {
    for (const mesh of [
      addStrip(stripLen, 0.28, 1.35, 0, stripY + 0.12, c, housingMat),
      addStrip(stripLen, 0.07, 0.55, 0, stripY - 0.08, c, stripMat),
      addStrip(1.35, 0.28, stripLen, c, stripY + 0.18, 0, housingMat),
      addStrip(0.55, 0.07, stripLen, c, stripY - 0.02, 0, stripMat),
    ]) groups.strip.meshes.push(mesh);
    pushGlowLine(stripHaloPos, 0, stripY - 0.2, c, stripLen, false, 14);
    pushGlowLine(stripHaloPos, c, stripY - 0.14, 0, stripLen, true, 14);
  }
  const stripHalo = addHaloPoints(g, groups.strip.meshes, stripHaloPos, weak ? '#ff2b30' : marathon ? '#d7ffd8' : '#e7fff8', weak ? 3.4 : 2.8, weak ? 0.42 : 0.34);
  const rimHalo = addHaloPoints(g, groups.rim.meshes, rimHaloPos, marathon ? '#e4b6ff' : '#f4fffc', marathon ? 2.4 : 1.45, marathon ? 0.4 : 0.62);
  const doorHalo = addHaloPoints(g, groups.door.meshes, doorHaloPos, weak ? '#ffcc66' : marathon ? '#e2a8ff' : '#d2fff6', 1.5, 0.5);
  const wallHalo = addHaloPoints(g, groups.wall.meshes, wallHaloPos, marathon ? '#d8ffd4' : '#e7fff8', 2.2, 0.38);
  if (groups.accent && groups.accent.haloPos.length) {
    groups.accent.haloPts = addHaloPoints(g, groups.accent.meshes, groups.accent.haloPos, '#e7b6ff', 2.6, 0.48);
  }
  stripMat.side = THREE.DoubleSide;
  glowMat.side = THREE.DoubleSide;
  wallGlowMat.side = THREE.DoubleSide;
  const padColor = weak ? '#6a1420' : marathon ? '#e9ffe8' : '#e7f7f4';
  const padLights = [];
  for (const ix of [0, 2]) for (const iz of [0, 2]) {
    const L = new THREE.PointLight(padColor, 1, 0, 2);
    L.position.set((centers[ix] + centers[ix + 1]) / 2, U.clear - 3.2, (centers[iz] + centers[iz + 1]) / 2);
    g.add(L);
    groups.strip.lights.push(L);
    padLights.push(L);
  }
  const wallLights = [];
  for (const c of [centers[0], centers[3]]) {
    for (const sign of [-1, 1]) {
      const face = sign * (U.plot / 2 - U.wall - 0.04);
      for (const horiz of [true, false]) {
        const plate = horiz
          ? box(7.2, 0.28, 0.07, c, 8.2, face, wallGlowMat)
          : box(0.07, 0.28, 7.2, face, 8.2, c, wallGlowMat);
        plate.castShadow = false;
        g.add(plate);
        groups.wall.meshes.push(plate);
        wallHaloPos.push(plate.position.x, plate.position.y, plate.position.z);
      }
    }
  }

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

  // 满照度记为 1。空闲顶灯约两成。A 的地灯、B 的台缘都走 glowI。损坏收暗。
  // 灯组开关不写在这里：motion 先把该状态的照度铺上，applyLightGroups 再把关掉的组压成 0。
  const look = {
    idle: { hemi: 0.11, sun: 0.05, padL: 7000, wallL: 2800, rect: 0.16, glowI: 3.4, stripI: 2.2, doorL: 1400, accentL: 1800, wear: false, grid: '#e7e9e7' },
    job: { hemi: 0.14, sun: 0.06, padL: 16000, wallL: 5600, rect: 0.42, glowI: 5.2, stripI: 4.4, doorL: 2600, accentL: 2800, wear: false, grid: '#eceeed' },
    sel: { hemi: 0.12, sun: 0.05, padL: 9000, wallL: 3400, rect: 0.24, glowI: 11, stripI: 3.2, doorL: 2000, accentL: 4200, wear: false, grid: '#eef1ee' },
    break: { hemi: 0.06, sun: 0.03, padL: 1400, wallL: 600, rect: 0.03, glowI: 0.22, stripI: 0.16, doorL: 120, accentL: 80, wear: true, grid: '#b7b2aa' },
  };
  const lightGroups = [groups.strip, groups.rim, groups.door, groups.wall];
  if (groups.accent) lightGroups.push(groups.accent);
  if (weak) groups.wall.on = false;
  g.userData.cult = {
    pads: pads.length, doors, labels: labels.length, unit: U.unit, plot: U.plot,
    seam: U.seam, lane: U.lane, raise: padTop, padTop, scheme: marathon ? 'b' : 'a',
    padList: pads.map(p => ({ n: p.n, x: p.x, z: p.z })),
    weak,
    lights: padLights.length + wallLights.length + rects.length + groups.door.lights.length + (groups.accent ? groups.accent.lights.length : 0),
    groups: lightGroups.map(x => x.id),
  };
  return {
    group: g,
    ring: new THREE.Group(),
    ownState: true,
    lightGroups,
    motion(_p, st) {
      if (weak) {
        hemi.intensity = 0.02;
        hemi.color.set('#241014');
        hemi.groundColor.set('#0a0909');
        sun.intensity = 0;
        scene.environmentIntensity = 0.03;
        renderer.toneMappingExposure = 0.96;
        glowMat.emissiveIntensity = 0.1;
        markerMat.emissiveIntensity = 0.16;
        stripMat.emissiveIntensity = 2.2;
        wallGlowMat.emissiveIntensity = 0;
        slitMat.emissiveIntensity = 0.9;
        fadeHaloMat(stripHalo && stripHalo.material, 1);
        fadeHaloMat(rimHalo && rimHalo.material, 0.22);
        fadeHaloMat(doorHalo && doorHalo.material, 0.85);
        fadeHaloMat(wallHalo && wallHalo.material, 0);
        gridMat.color.set('#9aa09c');
        padMat.color.set('#ffffff');
        for (const light of padLights) light.intensity = 2600;
        for (const light of wallLights) light.intensity = 0;
        for (const light of rects) light.intensity = 0.09;
        for (const light of groups.door.lights) light.intensity = 520;
        return;
      }
      const L = look[st] || look.idle;
      hemi.intensity = L.hemi;
      sun.intensity = L.sun;
      glowMat.emissiveIntensity = L.glowI;
      markerMat.emissiveIntensity = L.glowI;
      fadeHaloMat(stripHalo && stripHalo.material, Math.min(1, L.stripI / 2.2));
      fadeHaloMat(rimHalo && rimHalo.material, Math.min(1, L.glowI / 3.4));
      fadeHaloMat(doorHalo && doorHalo.material, Math.min(1, (marathon ? L.stripI * 0.95 : L.stripI * 0.55) / 1.3));
      fadeHaloMat(wallHalo && wallHalo.material, Math.min(1, L.stripI / 2.2));
      if (markerMesh && markerMesh.userData.breakOn !== (st === 'break')) {
        const off = new THREE.Color('#4a433c');
        const on = new THREE.Color('#e9fff8');
        for (let i = 0; i < markerMesh.count; i++) markerMesh.setColorAt(i, st === 'break' && i % 4 === 0 ? off : on);
        if (markerMesh.instanceColor) markerMesh.instanceColor.needsUpdate = true;
        markerMesh.userData.breakOn = st === 'break';
      }
      stripMat.emissiveIntensity = L.stripI;
      wallGlowMat.emissiveIntensity = L.stripI * 0.75;
      slitMat.emissiveIntensity = marathon ? L.stripI * 0.95 : L.stripI * 0.55;
      gridMat.color.set(marathon ? (st === 'break' ? '#c8c2b4' : '#ffffff') : L.grid);
      if (!marathon) padMat.color.set(L.grid);
      for (const light of padLights) light.intensity = L.padL * 4;
      for (const light of wallLights) light.intensity = L.wallL;
      for (const light of rects) light.intensity = L.rect;
      for (const light of groups.door.lights) light.intensity = L.doorL;
      if (groups.accent) {
        accentMat.emissiveIntensity = st === 'sel' ? 5.6 : st === 'break' ? 0.18 : st === 'job' ? 3.8 : 2.7;
        for (const light of groups.accent.lights) light.intensity = L.accentL;
        fadeHaloMat(groups.accent.haloPts && groups.accent.haloPts.material, st === 'sel' ? 1 : st === 'break' ? 0.12 : st === 'job' ? 0.8 : 0.55);
      }
      wear.visible = L.wear;
    },
  };
}

// 地块四角的大圆角。只在 B 方案用，柱心略埋进墙，弧面朝房间里。
function addCornerFillets(g, U, wallMat, redMat, accentMat, groups) {
  const r = 8;
  const inner = U.plot / 2 - U.wall;
  const geo = new THREE.CylinderGeometry(r, r, U.clear, 18, 1, false, 0, Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    let rot = 0;
    if (sx > 0 && sz > 0) rot = 0;
    else if (sx < 0 && sz > 0) rot = -Math.PI / 2;
    else if (sx > 0 && sz < 0) rot = Math.PI / 2;
    else rot = Math.PI;
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(sx * (inner - r + 0.08), U.clear / 2, sz * (inner - r + 0.08));
    mesh.rotation.y = rot;
    mesh.castShadow = false;
    g.add(mesh);
    const inv = 1 / Math.SQRT2;
    const ux = sx * inv;
    const uz = sz * inv;
    for (const y of [6.6, 12.9]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(11, 0.22, 0.16), redMat);
      stripe.position.set(mesh.position.x + ux * (r - 0.02), y, mesh.position.z + uz * (r - 0.02));
      stripe.rotation.y = Math.atan2(-sx, -sz);
      stripe.castShadow = false;
      g.add(stripe);
    }
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), accentMat);
    orb.position.set(mesh.position.x + ux * (r - 0.15), 15.15, mesh.position.z + uz * (r - 0.15));
    orb.castShadow = false;
    g.add(orb);
    groups.accent.meshes.push(orb);
    groups.accent.haloPos.push(orb.position.x, orb.position.y, orb.position.z);
    const lamp = new THREE.PointLight('#c070ff', 1, 22, 2);
    lamp.position.copy(orb.position);
    g.add(lamp);
    groups.accent.lights.push(lamp);
  }
}

// 结构只做在内皮。墙背是光板：地块合并后背面几乎看不见。
function dressCultWall(g, horizontal, sign, U, centers, kit) {
  const { beamMat, ribMat, lineMat, redMat, accentMat, marathon, groups } = kit;
  const fixed = sign * (U.plot / 2 - U.wall / 2);
  const span0 = horizontal ? -U.plot / 2 : -(U.plot / 2 - U.wall);
  const span1 = -span0;
  const length = span1 - span0;
  const put = (along, y, len, h, depth, material, proud = 0) => {
    if (len <= 0.04 || h <= 0.04 || depth <= 0.01) return null;
    const side = -sign * (U.wall / 2 + proud + depth / 2);
    const x = horizontal ? along : fixed + side;
    const z = horizontal ? fixed + side : along;
    const m = horizontal
      ? box(len, h, depth, x, y, z, material)
      : box(depth, h, len, x, y, z, material);
    m.castShadow = false;
    g.add(m);
    return m;
  };
  const blocked = (a, pad = 1.1) => centers.some(c => Math.abs(a - c) < U.doorW / 2 + pad);
  const addColumn = (along, y0, h, radius) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.06, h, marathon ? 20 : 8), ribMat);
    const side = -sign * (U.wall / 2 + radius);
    mesh.position.set(horizontal ? along : fixed + side, y0 + h / 2, horizontal ? fixed + side : along);
    mesh.castShadow = false;
    g.add(mesh);
    return mesh;
  };
  const addBand = (along, y, radius) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.05, 0.1, 8, 18), redMat);
    const side = -sign * (U.wall / 2 + radius);
    mesh.position.set(horizontal ? along : fixed + side, y, horizontal ? fixed + side : along);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = false;
    g.add(mesh);
  };
  const addAccent = (along, y, radius, withLamp) => {
    if (!groups.accent) return;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), accentMat);
    const side = -sign * (U.wall / 2 + radius + 0.05);
    mesh.position.set(horizontal ? along : fixed + side, y, horizontal ? fixed + side : along);
    mesh.castShadow = false;
    g.add(mesh);
    groups.accent.meshes.push(mesh);
    groups.accent.haloPos.push(mesh.position.x, mesh.position.y, mesh.position.z);
    if (!withLamp) return;
    const lamp = new THREE.PointLight('#c070ff', 1, 26, 2);
    lamp.position.copy(mesh.position);
    g.add(lamp);
    groups.accent.lights.push(lamp);
  };

  put(0, 16.15, length, marathon ? 0.85 : 1.15, marathon ? 0.62 : 0.72, beamMat, 0);
  if (marathon) {
    put(0, 13.35, length, 0.22, 0.08, redMat, 0.64);
    put(0, 6.35, length, 0.18, 0.07, redMat, 0.02);
  } else {
    put(0, 11.5, length, 0.36, 0.34, beamMat, 0);
    put(0, 8.15, length, 0.32, 0.3, beamMat, 0);
  }
  const gaps = centers.map(c => [c - U.doorW / 2 - 1.15, c + U.doorW / 2 + 1.15]);
  let rail = span0;
  for (const [a, b] of gaps) {
    if (a - rail > 3) put((rail + a) / 2, 0.42, a - rail - 0.3, 0.55, marathon ? 0.42 : 0.36, beamMat, 0);
    rail = b;
  }
  if (span1 - rail > 3) put((rail + span1) / 2, 0.42, span1 - rail - 0.3, 0.55, marathon ? 0.42 : 0.36, beamMat, 0);
  const step = marathon ? 36 : 22;
  const colR = marathon ? 1.15 : 0.62;
  const midWall = (span0 + span1) / 2;
  for (let a = span0 + step * 0.55; a < span1 - 8; a += step) {
    if (blocked(a, marathon ? 2.4 : 1.4)) continue;
    if (marathon) {
      const h = U.clear - 1.35;
      addColumn(a, 0.55, h, colR);
      addBand(a, 6.35, colR);
      addBand(a, 12.55, colR);
      addAccent(a, 14.7, colR, Math.abs(a - midWall) < step);
    } else {
      put(a, U.clear * 0.48, 1.2, U.clear - 1.7, 0.64, ribMat, 0);
    }
  }
  if (!marathon) {
    for (let a = span0 + 5; a < span1 - 3; a += 7.4) {
      if (blocked(a, 0.2)) continue;
      put(a, 8.4, 0.07, 12.6, 0.045, lineMat, 0.02);
    }
  }
  for (const c of centers) {
    if (marathon) {
      for (const s of [-1, 1]) addColumn(c + s * (U.doorW / 2 + 1.05), 0.2, U.doorH + 1.35, 0.48);
      put(c, U.doorH + 0.72, U.doorW + 2.6, 0.2, 0.08, redMat, 0.55);
    } else {
      for (const s of [-1, 1]) {
        const a = c + s * (U.doorW / 2 + 0.62);
        put(a, U.doorH * 0.55, 0.7, U.doorH + 1.15, 0.52, ribMat, 0);
      }
      put(c, U.doorH + 0.55, U.doorW + 2.1, 0.72, 0.48, beamMat, 0);
      put(c, U.doorH * 0.5, U.doorW + 0.2, 0.07, 0.05, lineMat, 0.5);
    }
  }
}

function padGridTexture(marathon) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const margin = marathon ? 28 : 36;
  g.fillStyle = marathon ? '#14943a' : '#e6e8e6';
  g.fillRect(0, 0, S, S);
  if (marathon) {
    g.strokeStyle = '#e10600';
    g.lineWidth = 14;
    g.strokeRect(margin, margin, S - margin * 2, S - margin * 2);
    g.strokeStyle = 'rgba(4, 48, 18, 0.72)';
  } else {
    g.strokeStyle = 'rgba(92, 100, 104, 0.55)';
    g.lineWidth = 4;
    g.strokeRect(margin, margin, S - margin * 2, S - margin * 2);
    g.strokeStyle = 'rgba(110, 118, 120, 0.42)';
    g.lineWidth = 2;
    g.strokeRect(margin + 18, margin + 18, S - (margin + 18) * 2, S - (margin + 18) * 2);
    g.strokeStyle = 'rgba(86, 94, 98, 0.38)';
  }
  const cells = 4;
  const inner = S - margin * 2;
  g.lineWidth = marathon ? 4 : 2;
  for (let i = 1; i < cells; i++) {
    const p = margin + inner * i / cells;
    g.beginPath();
    g.moveTo(margin, p);
    g.lineTo(S - margin, p);
    g.stroke();
    g.beginPath();
    g.moveTo(p, margin);
    g.lineTo(p, S - margin);
    g.stroke();
  }
  g.strokeStyle = marathon ? 'rgba(6, 70, 24, 0.55)' : 'rgba(120, 128, 130, 0.22)';
  g.lineWidth = marathon ? 2 : 1;
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const x = margin + inner * i / cells + 22;
    const y = margin + inner * j / cells + 22;
    const w = inner / cells - 44;
    g.strokeRect(x, y, w, w);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function padGeometry(size, height, chamfer, bevel, rounded) {
  const h = size / 2;
  const c = Math.min(chamfer, h * 0.45);
  const sh = new THREE.Shape();
  if (rounded) {
    const r = c;
    sh.moveTo(-h + r, -h);
    sh.lineTo(h - r, -h);
    sh.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
    sh.lineTo(h, h - r);
    sh.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
    sh.lineTo(-h + r, h);
    sh.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
    sh.lineTo(-h, -h + r);
    sh.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  } else {
    sh.moveTo(-h + c, -h);
    sh.lineTo(h - c, -h);
    sh.lineTo(h, -h + c);
    sh.lineTo(h, h - c);
    sh.lineTo(h - c, h);
    sh.lineTo(-h + c, h);
    sh.lineTo(-h, h - c);
    sh.lineTo(-h, -h + c);
  }
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, {
    depth: Math.max(0.04, height - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: rounded ? bevel : bevel * 0.55,
    bevelSegments: rounded ? 3 : 1,
    curveSegments: rounded ? 12 : 1,
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

function labelTexture(text, ink) {
  const W = 512, H = 96;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = ink || '#24272c';
  g.font = '500 42px BarlowSC, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '14px';
  g.fillText(text, W / 2, H / 2 + 4);
  g.globalCompositeOperation = 'destination-out';
  g.fillRect(0, H / 2 - 2, W, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
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

function grubTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#c6a56a';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const len = 6 + Math.random() * 15;
    const fat = 2.6 + Math.random() * 4.2;
    g.save();
    g.translate(x, y);
    g.rotate(Math.random() * Math.PI);
    g.fillStyle = i % 7 === 0 ? '#8a7044' : i % 3 === 0 ? '#f6ead0' : '#e4d0a2';
    g.beginPath();
    g.ellipse(0, 0, len, fat, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(42, 30, 16, 0.62)';
    g.beginPath();
    g.arc(len * 0.58, 0, Math.max(1.2, fat * 0.42), 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// 一整套蛴螬培养槽：占一个培育单元，槽排之间走龙门。
function buildGrubTrough() {
  const U = CULT_EMPTY;
  const plot = buildCultPlot('a', { weak: true });
  const host = plot.group;
  const pad = host.userData.cult.padList[0];
  host.userData.cult.occupied = { n: pad.n, x: pad.x, z: pad.z };
  host.userData.cult.dim = '弱光';
  const g = new THREE.Group();
  g.position.set(pad.x, 0, pad.z);
  host.add(g);
  const y0 = host.userData.cult.padTop;
  const mat = (opts) => {
    const m = new THREE.MeshStandardMaterial(opts);
    m.userData.dispose = true;
    return m;
  };
  const shellMat = mat({ color: '#8a9296', roughness: 0.62, metalness: 0.28 });
  const wallMat = mat({ color: '#6e777c', roughness: 0.55, metalness: 0.34 });
  const railMat = mat({ color: '#3c4448', roughness: 0.7, metalness: 0.4 });
  const steelMat = mat({ color: '#9aa3a6', roughness: 0.42, metalness: 0.55 });
  const darkMat = mat({ color: '#2a3136', roughness: 0.58, metalness: 0.45 });
  const grubMap = grubTexture();
  const grubMat = mat({ map: grubMap, color: '#f3e6c8', roughness: 0.86, metalness: 0 });
  const vatMat = mat({ color: '#2a1014', emissive: '#ff2b30', emissiveIntensity: 2.2, roughness: 0.35, metalness: 0 });
  const rigMat = mat({ color: '#2a1014', emissive: '#ff2b30', emissiveIntensity: 3.2, roughness: 0.3, metalness: 0 });
  const groups = {
    vat: { id: 'vat', label: '槽灯', on: true, lights: [], meshes: [] },
    rig: { id: 'rig', label: '巡灯', on: true, lights: [], meshes: [] },
    status: { id: 'status', label: '状态灯', on: true, lights: [], meshes: [] },
  };

  const troughL = 15;
  const troughW = 4;
  const endGap = 1.15;
  const aisle = 3.15;
  const usable = U.unit - 16;
  const nLong = Math.floor((usable + endGap) / (troughL + endGap));
  const nRows = Math.floor((usable + aisle) / (troughW + aisle));
  const spanX = nLong * troughL + (nLong - 1) * endGap;
  const spanZ = nRows * troughW + (nRows - 1) * aisle;
  const x0 = -spanX / 2 + troughL / 2;
  const z0 = -spanZ / 2 + troughW / 2;
  const pitchX = troughL + endGap;
  const pitch = troughW + aisle;
  const slots = [];
  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nLong; col++) {
      if (col === 0 && row < 2) continue;
      slots.push({ col, row, i: slots.length, x: x0 + col * pitchX, z: z0 + row * pitch });
    }
  }
  const n = slots.length;
  const doorA = { x: x0, z: z0, name: 'A' };
  const doorB = { x: x0, z: z0 + pitch, name: 'B' };

  const placeAll = (mesh, y) => {
    const dummy = new THREE.Object3D();
    for (const s of slots) {
      dummy.position.set(s.x, y0 + y, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(s.i, dummy.matrix);
    }
    mesh.castShadow = false;
    g.add(mesh);
    return mesh;
  };
  placeAll(new THREE.InstancedMesh(new THREE.BoxGeometry(troughL, 0.1, troughW), shellMat, n), 0.05);
  const longGeo = new THREE.BoxGeometry(troughL, 0.78, 0.12);
  for (const side of [-1, 1]) {
    const mesh = new THREE.InstancedMesh(longGeo, wallMat, n);
    const dummy = new THREE.Object3D();
    for (const s of slots) {
      dummy.position.set(s.x, y0 + 0.49, s.z + side * (troughW / 2 - 0.06));
      dummy.updateMatrix();
      mesh.setMatrixAt(s.i, dummy.matrix);
    }
    mesh.castShadow = false;
    g.add(mesh);
  }
  const shortGeo = new THREE.BoxGeometry(0.12, 0.78, troughW - 0.24);
  for (const side of [-1, 1]) {
    const mesh = new THREE.InstancedMesh(shortGeo, wallMat, n);
    const dummy = new THREE.Object3D();
    for (const s of slots) {
      dummy.position.set(s.x + side * (troughL / 2 - 0.06), y0 + 0.49, s.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(s.i, dummy.matrix);
    }
    mesh.castShadow = false;
    g.add(mesh);
  }
  const grubMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(troughL - 0.46, 0.5, troughW - 0.42), grubMat, n);
  const grubDummy = new THREE.Object3D();
  const grubBase = [];
  for (const s of slots) {
    grubDummy.position.set(s.x, y0 + 0.38, s.z);
    grubDummy.scale.set(1, 1, 1);
    grubDummy.updateMatrix();
    grubBase[s.i] = grubDummy.matrix.clone();
    grubMesh.setMatrixAt(s.i, grubDummy.matrix);
    grubMesh.setColorAt(s.i, new THREE.Color('#ffffff'));
  }
  grubMesh.castShadow = false;
  g.add(grubMesh);
  const vatMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(troughL - 0.8, 0.06, 0.08), vatMat, n);
  const vatDummy = new THREE.Object3D();
  for (const s of slots) {
    vatDummy.position.set(s.x, y0 + 0.9, s.z + troughW / 2 - 0.16);
    vatDummy.updateMatrix();
    vatMesh.setMatrixAt(s.i, vatDummy.matrix);
  }
  vatMesh.castShadow = false;
  g.add(vatMesh);
  groups.vat.meshes.push(vatMesh);
  const vatHaloPos = [];
  for (const s of slots) {
    pushGlowLine(vatHaloPos, s.x, y0 + 0.98, s.z + troughW / 2 - 0.16, troughL - 1.6, false, 4.6);
  }
  const vatHalo = addHaloPoints(g, groups.vat.meshes, vatHaloPos, '#ff2b30', 2.7, 0.55);

  for (let r = 0; r < nRows - 1; r++) {
    const z = z0 + r * pitch + troughW / 2 + aisle / 2;
    const xMin = r < 1 ? x0 + pitchX - troughL / 2 : -spanX / 2 - 1;
    const xMax = spanX / 2 + 1;
    const rail = box(xMax - xMin, 0.045, 0.12, (xMin + xMax) / 2, y0 + 0.03, z, railMat);
    rail.castShadow = false;
    g.add(rail);
  }
  const signTex = (text) => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 160;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 160);
    ctx.fillStyle = '#f7f4ee';
    ctx.font = '500 92px BarlowSC, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 84);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  const addDoor = (door, title, rimHex) => {
    const pit = box(14.4, 0.42, 3.55, door.x, y0 - 0.16, door.z, darkMat);
    pit.castShadow = false;
    g.add(pit);
    const rimMat = mat({ color: '#14181c', emissive: rimHex, emissiveIntensity: 1.8, roughness: 0.4, metalness: 0.2 });
    for (const [w, d, zof, xof] of [[14.6, 0.12, 1.85, 0], [14.6, 0.12, -1.85, 0], [0.12, 3.7, 0, 7.3], [0.12, 3.7, 0, -7.3]]) {
      const rim = box(w, 0.08, d, door.x + xof, y0 + 0.06, door.z + zof, rimMat);
      rim.castShadow = false;
      g.add(rim);
    }
    const face = new THREE.MeshBasicMaterial({ map: signTex(title), transparent: true, depthWrite: false });
    face.userData.dispose = true;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2), face);
    label.position.set(door.x, y0 + 0.08, door.z);
    label.rotation.x = -Math.PI / 2;
    g.add(label);
    addHalo(g, null, rimHex, 4.2, door.x, y0 + 0.4, door.z);
  };
  addDoor(doorA, 'A 出', '#ffb25a');
  addDoor(doorB, 'B 进', '#8fd0ff');

  const xStart = x0 - troughL / 2 + 1.2;
  const xEnd = x0 + (nLong - 1) * pitchX + troughL / 2 - 1.2;
  const parkX = xEnd + 3.2;
  const legZ = troughW / 2 + aisle / 2;
  const legH = 4.55;
  const WORK = GRUB_WORK_MPS;
  const EMPTY = GRUB_EMPTY_MPS;
  const futureJobs = { feed() {}, patrol() {}, stir() {} };
  const phaseTex = (text) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = '#f4efe6';
    ctx.font = '500 36px BarlowSC, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  const PHASE = { rest: '停靠', empty: '空驶', work: '作业', lift: '起箱', carry: '送出', drop: '交出', pick: '取箱', return: '回位', place: '落箱', sel: '选中', break: '损坏' };
  const statusColor = { rest: '#e2b15c', empty: '#6eb6ff', work: '#3dff7a', break: '#ff5a4a' };

  const makeGantry = () => {
    const gantry = new THREE.Group();
    gantry.position.y = y0;
    const addG = (w, h, d, x, y, z, material) => {
      const m = box(w, h, d, x, y, z, material);
      m.castShadow = false;
      gantry.add(m);
      return m;
    };
    for (const s of [-1, 1]) {
      addG(0.34, legH, 0.34, 0, legH / 2, s * legZ, steelMat);
      addG(0.85, 0.2, 0.62, 0, 0.12, s * legZ, darkMat);
    }
    addG(0.46, 0.34, legZ * 2 + 0.7, 0, legH, 0, steelMat);
    addG(0.16, 0.12, legZ * 2 - 0.4, 0, legH - 0.72, 0, steelMat);
    addG(1.25, 0.62, 0.9, 0, legH + 0.46, 0, darkMat);
    const head = new THREE.Group();
    gantry.add(head);
    const headBody = box(0.62, 0.28, 0.62, 0, 0, 0, steelMat);
    headBody.castShadow = false;
    head.add(headBody);
    const nozzle = box(0.2, 0.85, 0.2, 0, -0.52, 0, steelMat);
    nozzle.castShadow = false;
    head.add(nozzle);
    const tip = box(0.32, 0.08, 0.32, 0, -0.98, 0, rigMat);
    tip.castShadow = false;
    head.add(tip);
    const carried = new THREE.Group();
    carried.position.y = -1.2;
    head.add(carried);
    const shell = box(14.2, 0.55, 3.35, 0, 0, 0, shellMat);
    shell.castShadow = false;
    const fill = box(13.5, 0.28, 2.85, 0, 0.22, 0, grubMat);
    fill.castShadow = false;
    carried.add(shell, fill);
    carried.visible = false;
    head.position.y = 3.35;
    const lamp = addG(0.7, 0.1, 0.18, 1.05, legH - 0.32, 0, rigMat);
    // 巡灯只在灯心上加软光晕，不往场景里打光。
    const lampHalo = addHalo(gantry, groups.rig.meshes, '#ff2b30', 2.15, 1.05, legH - 0.32, 0);
    const tipHalo = addHalo(head, groups.rig.meshes, '#ff2b30', 1.45, 0, -0.98, 0);
    const statusMat = mat({ color: '#2a2418', emissive: statusColor.rest, emissiveIntensity: 3.4, roughness: 0.3, metalness: 0 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), statusMat);
    beacon.position.set(0, legH + 1.02, 0);
    beacon.castShadow = false;
    gantry.add(beacon);
    // 状态灯同样只靠光晕，颜色跟相位走。
    const statusHalo = addHalo(gantry, groups.status.meshes, statusColor.rest, 2.7, 0, legH + 1.02, 0);
    const labelMat = new THREE.MeshBasicMaterial({ map: phaseTex('停靠'), transparent: true, depthWrite: false });
    labelMat.userData.dispose = true;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), labelMat);
    label.position.set(0, legH + 1.85, 0);
    label.renderOrder = 10;
    gantry.add(label);
    groups.rig.meshes.push(lamp, tip);
    groups.status.meshes.push(beacon, label);
    g.add(gantry);
    return { gantry, head, carried, fill, statusMat, label, labelMat, labelText: '停靠', lampHalo, tipHalo, statusHalo };
  };

  const westOf = (row) => (row < 2 ? x0 + pitchX - troughL / 2 + 1.4 : xStart);
  const rowZ = (row) => z0 + row * pitch;
  const durOf = (seg) => seg.dur != null ? seg.dur : Math.max(0.08, Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0) / seg.speed);
  const makeScript = (rowList) => {
    const segs = [];
    const parkZ = rowZ(rowList[0]);
    let x = parkX;
    let z = parkZ;
    let dir = -1;
    const pushMove = (kind, x1, z1, speed, mode, extra) => {
      segs.push({ kind, x0: x, x1, z0: z, z1, speed, mode, ...extra });
      x = x1;
      z = z1;
    };
    // 西端头廊在槽和地面门外面。换列、送箱、回位只在这里改 Z，其余只沿槽的长边走。
    const westRail = (x0 - troughL / 2) - 7.6;
    const axisTo = (kind, x1, z1, speed, mode, extra) => {
      if (Math.abs(z - z1) <= 0.04) {
        if (Math.abs(x - x1) > 0.05) pushMove(kind, x1, z, speed, mode, extra);
        return;
      }
      if (Math.abs(x - westRail) > 0.05) pushMove(kind, westRail, z, speed, mode, extra);
      if (Math.abs(z - z1) > 0.04) pushMove(kind, westRail, z1, speed, mode, extra);
      if (Math.abs(x - x1) > 0.05) pushMove(kind, x1, z1, speed, mode, extra);
    };
    for (let i = 0; i < rowList.length; i++) {
      const row = rowList[i];
      const zRow = rowZ(row);
      if (Math.abs(z - zRow) > 0.04) pushMove('shift', x, zRow, EMPTY, 'empty');
      const dest = dir < 0 ? westOf(row) : xEnd;
      const harvest = i === 0 ? slots.find(s => s.row === row && s.col === nLong - 2) : null;
      const hx = harvest ? harvest.x : null;
      const passes = harvest && ((dir < 0 && hx <= x + 0.01 && hx >= dest - 0.01) || (dir > 0 && hx >= x - 0.01 && hx <= dest + 0.01));
      if (passes) {
        pushMove('work', hx, z, WORK, 'work');
        segs.push({ kind: 'lift', x0: hx, x1: hx, z0: z, z1: z, dur: 1.6, mode: 'work', slot: harvest.i });
        axisTo('carry', doorA.x, doorA.z, EMPTY, 'work', { slot: harvest.i });
        segs.push({ kind: 'drop', x0: doorA.x, x1: doorA.x, z0: doorA.z, z1: doorA.z, dur: 1.25, mode: 'work', slot: harvest.i });
        axisTo('fetch', doorB.x, doorB.z, EMPTY, 'empty');
        segs.push({ kind: 'pick', x0: doorB.x, x1: doorB.x, z0: doorB.z, z1: doorB.z, dur: 1.25, mode: 'work' });
        axisTo('return', hx, zRow, EMPTY, 'work', { slot: harvest.i });
        segs.push({ kind: 'place', x0: hx, x1: hx, z0: zRow, z1: zRow, dur: 1.25, mode: 'work', slot: harvest.i });
      }
      if (Math.abs(x - dest) > 0.05) pushMove('work', dest, z, WORK, 'work');
      dir *= -1;
    }
    if (Math.abs(z - parkZ) > 0.04) pushMove('shift', x, parkZ, EMPTY, 'empty');
    if (Math.abs(x - parkX) > 0.05) pushMove('home', parkX, parkZ, EMPTY, 'empty');
    let t = 0;
    let liftAt = 0;
    for (const seg of segs) {
      seg.dur = durOf(seg);
      seg.t0 = t;
      if (seg.kind === 'lift' && !liftAt) liftAt = t;
      t += seg.dur;
    }
    return { segs, total: Math.max(1, t), liftAt, parkZ };
  };

  const columns = planGrubColumns(nRows, GRUB_DEMO_GANTRIES);
  const rigs = columns.map((rows, gi) => {
    const rig = makeGantry();
    const script = makeScript(rows);
    rig.rows = rows;
    rig.script = script;
    rig.offset = gi * 22;
    return rig;
  });

  const ring = salmonRing(U.unit * 1.01, U.unit * 1.01, y0 + 0.2);
  g.add(ring);
  const bad = new Set();
  for (let i = 0; i < n; i++) if (i % 11 === 4) bad.add(i);
  let jobAnchor = null;

  const sample = (script, time) => {
    const local = ((time % script.total) + script.total) % script.total;
    for (let i = 0; i < script.segs.length; i++) {
      const seg = script.segs[i];
      if (local <= seg.t0 + seg.dur || i === script.segs.length - 1) {
        const u = seg.dur <= 1e-4 ? 1 : Math.min(1, Math.max(0, (local - seg.t0) / seg.dur));
        return { seg, u, index: i };
      }
    }
    return { seg: script.segs[0], u: 0, index: 0 };
  };
  const lerp = (a, b, u) => a + (b - a) * u;
  const headY = (kind, u) => {
    const up = 3.35, low = 2.15, down = 1.22, carry = 3.6;
    if (kind === 'work') return low;
    if (kind === 'lift') return u < 0.35 ? lerp(low, down, u / 0.35) : lerp(down, carry, (u - 0.35) / 0.65);
    if (kind === 'carry' || kind === 'return') return carry;
    if (kind === 'drop') return lerp(carry, down, u);
    if (kind === 'pick') return lerp(down, carry, u);
    if (kind === 'place') return lerp(carry, down, Math.min(1, u / 0.7));
    return up;
  };
  const showingBox = (kind, u) => {
    if (kind === 'lift') return u >= 0.35;
    if (kind === 'carry' || kind === 'drop' || kind === 'return') return true;
    if (kind === 'pick') return u >= 0.15;
    if (kind === 'place') return u < 0.82;
    return false;
  };
  const fullBox = (kind) => kind === 'lift' || kind === 'carry' || kind === 'drop';
  const setLabel = (rig, text) => {
    if (rig.labelText === text) return;
    const prev = rig.labelMat.map;
    rig.labelMat.map = phaseTex(text);
    rig.labelMat.needsUpdate = true;
    if (prev) prev.dispose();
    rig.labelText = text;
  };

  host.userData.grub = {
    n, nLong, nRows, troughL, troughW, aisle,
    gantries: rigs.length,
    options: [2, 4],
    workMps: WORK,
    emptyMps: EMPTY,
    jobs: ['feed', 'patrol', 'stir', 'cycle'],
    activeJob: 'cycle',
    cycle: rigs[0].script.total,
    liftAt: rigs[0].script.liftAt,
    phases: [],
    dim: '弱光',
    vatColor: '#ff2b30',
    rigColor: '#ff2b30',
    plotDim: { strip: '#8a1824', door: '#ffcc66', wall: 'off' },
    lamp: { type: 'emissive', distance: 0, halo: 'sprite' },
    castLights: groups.rig.lights.length + groups.status.lights.length,
    beacon: { x: pad.x + parkX, y: y0 + legH + 1.02, z: pad.z + rigs[0].script.parkZ },
    diagonals: rigs.reduce((n, rig) => n + rig.script.segs.filter(s => Math.abs(s.x1 - s.x0) > 0.08 && Math.abs(s.z1 - s.z0) > 0.08).length, 0),
    doorCuts: rigs.reduce((n, rig) => n + rig.script.segs.filter(s => Math.abs(s.x0 - doorA.x) < 0.4 && Math.abs(s.x1 - doorA.x) < 0.4 && Math.abs(s.z1 - s.z0) > 1).length, 0),
  };
  return {
    group: host,
    ring,
    ownState: true,
    lightGroups: [...plot.lightGroups, groups.vat, groups.rig, groups.status],
    motion(_p, st) {
      plot.motion(_p, st);
      if (st !== 'job') jobAnchor = null;
      else if (frozen == null && jobAnchor == null) {
        jobAnchor = performance.now() / 1000;
        futureJobs.patrol();
      }
      const live = jobAnchor == null ? 0 : performance.now() / 1000 - jobAnchor;
      const t0 = frozen != null && st === 'job' ? ((frozen % 1) + 1) % 1 * rigs[0].script.total : live;
      const hidden = new Set();
      const phases = [];
      for (const rig of rigs) {
        const { gantry, head, carried, fill, statusMat } = rig;
        gantry.rotation.z = 0;
        let kind = 'rest';
        let mode = 'rest';
        let pose = { x: parkX, z: rig.script.parkZ, u: 0 };
        if (st === 'job') {
          const hit = sample(rig.script, t0 + rig.offset);
          kind = hit.seg.kind;
          mode = hit.seg.mode;
          pose = { x: lerp(hit.seg.x0, hit.seg.x1, hit.u), z: lerp(hit.seg.z0, hit.seg.z1, hit.u), u: hit.u, index: hit.index, slot: hit.seg.slot };
          if (hit.seg.slot != null && (hit.index > rig.script.segs.findIndex(s => s.kind === 'lift') || (kind === 'lift' && hit.u >= 0.35))) hidden.add(hit.seg.slot);
          carried.visible = showingBox(kind, hit.u);
          fill.visible = fullBox(kind);
          head.position.y = headY(kind, hit.u);
        } else if (st === 'break') {
          const row = rig.rows[0];
          gantry.rotation.z = rig.rows[0] % 2 ? 0.04 : -0.04;
          pose = { x: lerp(parkX, westOf(row), 0.42), z: rowZ(row), u: 0 };
          carried.visible = false;
          head.position.y = 2.4;
          kind = 'break';
        } else {
          pose = { x: parkX, z: rig.script.parkZ, u: 0 };
          carried.visible = false;
          head.position.y = 3.35;
          kind = st === 'sel' ? 'sel' : 'rest';
        }
        gantry.position.x = pose.x;
        gantry.position.z = pose.z;
        const key = st === 'break' ? 'break' : st !== 'job' ? 'rest' : (mode === 'empty' ? 'empty' : 'work');
        statusMat.emissive.set(statusColor[key]);
        statusMat.emissiveIntensity = key === 'break' ? 1.4 : key === 'rest' ? 2.6 : 4.6;
        for (const s of rig.statusHalo) s.material.color.set(statusColor[key]);
        fadeHalos(rig.statusHalo, key === 'break' ? 0.4 : key === 'rest' ? 0.72 : 1);
        fadeHalos(rig.lampHalo, st === 'break' ? 0.16 : 1);
        fadeHalos(rig.tipHalo, st === 'break' ? 0.16 : 1);
        const caption = PHASE[kind] || (mode === 'empty' ? '空驶' : '作业');
        setLabel(rig, caption);
        rig.label.lookAt(cam.position);
        phases.push(caption);
      }
      host.userData.grub.phases = phases;
      host.userData.grub.t0 = t0;
      host.userData.grub.live = rigs.map((rig, i) => ({
        x: pad.x + rig.gantry.position.x,
        y: y0 + legH + 1.02,
        z: pad.z + rig.gantry.position.z,
        phase: phases[i],
      }));
      vatMat.emissiveIntensity = st === 'break' ? 0.35 : 2.5;
      rigMat.emissiveIntensity = st === 'job' ? 4.4 : st === 'sel' ? 3.2 : st === 'break' ? 0.25 : 2.2;
      fadeHaloMat(vatHalo && vatHalo.material, st === 'break' ? 0.22 : 1);
      ring.visible = st === 'sel' || st === 'break';
      for (const m of ring.children) m.material = st === 'break' ? alertMat : zoneMat;
      const sig = st + ':' + [...hidden].join(',');
      if (grubMesh.userData.sig !== sig) {
        const pale = new THREE.Color('#ffffff');
        const dead = new THREE.Color('#6d6254');
        for (let i = 0; i < n; i++) {
          const sunk = st === 'break' && bad.has(i);
          grubMesh.setColorAt(i, sunk ? dead : pale);
          if (hidden.has(i)) {
            grubDummy.matrix.copy(grubBase[i]);
            grubDummy.matrix.elements[0] = 0.001;
            grubDummy.matrix.elements[5] = 0.001;
            grubDummy.matrix.elements[10] = 0.001;
            grubMesh.setMatrixAt(i, grubDummy.matrix);
          } else if (sunk) {
            grubDummy.matrix.copy(grubBase[i]);
            grubDummy.matrix.elements[5] = 0.42;
            grubDummy.matrix.elements[13] = y0 + 0.22;
            grubMesh.setMatrixAt(i, grubDummy.matrix);
          } else grubMesh.setMatrixAt(i, grubBase[i]);
        }
        grubMesh.instanceMatrix.needsUpdate = true;
        if (grubMesh.instanceColor) grubMesh.instanceColor.needsUpdate = true;
        grubMesh.userData.sig = sig;
      }
    },
  };
}

// 中枢地块。正中一格，四层，主井收到环心。每层整板封住，只在井筒里留口。下层用剖面藏起上面。
function buildHubPlot() {
  const plot = CULT_EMPTY.plot;
  const H = plot / 2;
  const g = new THREE.Group();
  g.userData.alive = true;
  const mat = (opts) => {
    const m = new THREE.MeshStandardMaterial(opts);
    m.userData.dispose = true;
    return m;
  };
  const groups = {
    shaft: { id: 'shaft', label: '井灯', on: true, lights: [], meshes: [] },
    deck: { id: 'deck', label: '层灯', on: true, lights: [], meshes: [] },
    energy: { id: 'energy', label: '能源', on: true, lights: [], meshes: [] },
    store: { id: 'store', label: '仓储', on: true, lights: [], meshes: [] },
    alarm: { id: 'alarm', label: '警示', on: true, lights: [], meshes: [] },
  };
  const shellMat = mat({ color: '#d5d8d6', roughness: 0.78, metalness: 0.12 });
  const charMat = mat({ color: '#2a3034', roughness: 0.64, metalness: 0.38 });
  const padMat = mat({ color: '#c4c6c1', roughness: 0.92, metalness: 0.04 });
  const deckMat = mat({ color: '#8b9196', roughness: 0.88, metalness: 0.1 });
  const equipMat = mat({ color: '#6d7378', roughness: 0.84, metalness: 0.16 });
  const hullMat = mat({ color: '#4e5459', roughness: 0.8, metalness: 0.22 });
  const hallMat = mat({ color: '#b7bbb8', roughness: 0.82, metalness: 0.08 });
  const yelMat = mat({ color: '#3a3014', emissive: '#e2b15c', emissiveIntensity: 1.8, roughness: 0.42, metalness: 0 });
  const redMat = mat({ color: '#3a1416', emissive: '#e23b3b', emissiveIntensity: 0.85, roughness: 0.46, metalness: 0 });
  const coolMat = mat({ color: '#1c3332', emissive: '#c8fff4', emissiveIntensity: 1.35, roughness: 0.4, metalness: 0 });
  const deckGlow = mat({ color: '#1a2428', emissive: '#d5e4ea', emissiveIntensity: 1.15, roughness: 0.4, metalness: 0 });
  const curbMat = mat({ color: '#9aa09c', roughness: 0.86, metalness: 0.08 });
  const trunkMat = mat({ color: '#d5d8d6', emissive: '#9aa19e', emissiveIntensity: 0.42, roughness: 0.7, metalness: 0.14 });

  const F = 44;
  // 井口留在六边形内壁里。板的其余部分铺满地块，东北角不再挖掉。
  const opening = 16;
  const floors = [
    { id: 'surface', name: '地表', y: 0, mat: padMat },
    { id: 'grow', name: '培育层', y: -17, mat: deckMat },
    { id: 'equip', name: '设备层', y: -40, mat: equipMat },
    { id: 'hull', name: '承压壳', y: -64, mat: hullMat },
  ];
  const put = (mesh) => {
    mesh.castShadow = mesh.receiveShadow = false;
    g.add(mesh);
    return mesh;
  };
  const addSlab = (y, material) => {
    const t = 1.5;
    const yc = y - t / 2;
    const side = H - opening;
    put(box(side, t, plot, -(H + opening) / 2, yc, 0, material));
    put(box(side, t, plot, (H + opening) / 2, yc, 0, material));
    const ns = H - opening;
    put(box(opening * 2, t, ns, 0, yc, -(H + opening) / 2, material));
    put(box(opening * 2, t, ns, 0, yc, (H + opening) / 2, material));
  };
  for (const f of floors) addSlab(f.y, f.mat);

  const curbH = 1.15;
  const curbT = 2.4;
  put(box(plot, curbH, curbT, 0, curbH / 2, -H + curbT / 2, curbMat));
  put(box(plot, curbH, curbT, 0, curbH / 2, H - curbT / 2, curbMat));
  put(box(curbT, curbH, plot - curbT * 2, -H + curbT / 2, curbH / 2, 0, curbMat));
  put(box(curbT, curbH, plot - curbT * 2, H - curbT / 2, curbH / 2, 0, curbMat));

  const sideLen = F / Math.sqrt(3);
  const up = new THREE.Vector3(0, 1, 0);
  const outward = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const addHexStack = (flat, yLo, nLevel, modH, halo) => {
    const panelW = sideLen * (flat / F) * 0.62;
    const panelT = 1.35;
    const faceDist = flat / 2 - panelT / 2;
    const panelGeo = new THREE.BoxGeometry(panelW, modH * 0.68, panelT);
    const panels = new THREE.InstancedMesh(panelGeo, shellMat, nLevel * 6);
    const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(panelW * 1.04, 0.5, panelT + 0.4), charMat, nLevel * 6);
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, modH * 0.38, 0.22), yelMat, nLevel * 6);
    const ports = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.7 * flat / F, 1.7 * flat / F, 0.26, 14), charMat, Math.ceil(nLevel / 2) * 6);
    const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 0.32, 0.16), redMat, nLevel * 2);
    let pi = 0;
    let oi = 0;
    let mi = 0;
    for (let lv = 0; lv < nLevel; lv++) {
      const y = yLo + (lv + 0.5) * modH;
      const dark = lv % 3 === 1;
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        dummy.position.set(Math.cos(a) * faceDist, y, Math.sin(a) * faceDist);
        dummy.rotation.set(0, Math.PI / 2 - a, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        panels.setMatrixAt(pi, dummy.matrix);
        panels.setColorAt(pi, new THREE.Color(dark ? '#9aa1a6' : '#ffffff'));
        dummy.position.y = y - modH * 0.4;
        dummy.updateMatrix();
        bands.setMatrixAt(pi, dummy.matrix);
        dummy.position.set(
          Math.cos(a) * (faceDist + 0.45) + Math.cos(a + Math.PI / 2) * panelW * 0.32,
          y + modH * 0.08,
          Math.sin(a) * (faceDist + 0.45) + Math.sin(a + Math.PI / 2) * panelW * 0.32,
        );
        dummy.updateMatrix();
        ticks.setMatrixAt(pi, dummy.matrix);
        if (lv % 2 === 0) {
          outward.set(Math.cos(a), 0, Math.sin(a));
          dummy.position.set(Math.cos(a) * (faceDist + 0.85), y, Math.sin(a) * (faceDist + 0.85));
          dummy.quaternion.setFromUnitVectors(up, outward);
          dummy.updateMatrix();
          ports.setMatrixAt(oi++, dummy.matrix);
          dummy.rotation.set(0, Math.PI / 2 - a, 0);
        }
        if (i % 3 === 0) {
          dummy.position.set(Math.cos(a) * (faceDist + 0.8), y - modH * 0.2, Math.sin(a) * (faceDist + 0.8));
          dummy.rotation.set(0, Math.PI / 2 - a, 0);
          dummy.updateMatrix();
          marks.setMatrixAt(mi++, dummy.matrix);
          halo.alarm.push(dummy.position.x, dummy.position.y, dummy.position.z);
        }
        if (i === 0) halo.shaft.push(Math.cos(a) * (faceDist + 1.4), y, Math.sin(a) * (faceDist + 1.4));
        pi++;
      }
    }
    ports.count = oi;
    marks.count = mi;
    for (const mesh of [panels, bands, ticks, ports, marks]) {
      mesh.castShadow = mesh.receiveShadow = false;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      g.add(mesh);
    }
    groups.shaft.meshes.push(ticks);
    groups.alarm.meshes.push(marks);
    const postH = nLevel * modH;
    const postY = yLo + postH / 2;
    const rv = (flat / Math.sqrt(3)) * 0.72;
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      put(box(1.15, postH, 1.15, Math.cos(a) * rv, postY, Math.sin(a) * rv, charMat));
    }
    return yLo + nLevel * modH;
  };

  // 地块以上的主井：同一口径的六边形筒，一直收到环半径处的中轴。
  const addRise = (flat, y0, y1) => {
    const panelT = 1.35;
    const side = flat / Math.sqrt(3);
    const panelW = side * 0.62;
    const faceDist = flat / 2 - panelT / 2;
    const h = y1 - y0;
    const yc = (y0 + y1) / 2;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const m = put(box(panelW, h, panelT, Math.cos(a) * faceDist, yc, Math.sin(a) * faceDist, trunkMat));
      m.rotation.y = Math.PI / 2 - a;
    }
    const rv = side * 0.72;
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      put(box(1.2, h, 1.2, Math.cos(a) * rv, yc, Math.sin(a) * rv, charMat));
    }
    const step = 92;
    const n = Math.max(1, Math.floor(h / step));
    const pitch = h / n;
    const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(panelW * 1.06, 0.8, panelT + 0.55), charMat, n * 6);
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, pitch * 0.55, 0.3), yelMat, n);
    bands.frustumCulled = false;
    ticks.frustumCulled = false;
    let bi = 0;
    for (let lv = 0; lv < n; lv++) {
      const y = y0 + (lv + 0.5) * pitch;
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        dummy.position.set(Math.cos(a) * faceDist, y, Math.sin(a) * faceDist);
        dummy.rotation.set(0, Math.PI / 2 - a, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bands.setMatrixAt(bi++, dummy.matrix);
      }
      dummy.position.set(faceDist + 0.55, y, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      ticks.setMatrixAt(lv, dummy.matrix);
      if (lv % 6 === 0) halo.shaft.push(faceDist + 2.2, y, 0);
    }
    for (const mesh of [bands, ticks]) {
      mesh.castShadow = mesh.receiveShadow = false;
      g.add(mesh);
    }
    groups.shaft.meshes.push(ticks);
  };

  const halo = { shaft: [], deck: [], energy: [], store: [], alarm: [] };
  const yStack = addHexStack(F, -58, 16, 9.2, halo);
  const axisY = RING.R;
  addRise(F, yStack, axisY);
  addHexStack(F * 1.22, axisY - 16, 1, 16, halo);
  put(box(16, 16, 2200, 0, axisY, 0, trunkMat));
  const axisKnot = put(box(40, 6.5, 40, 0, axisY, 0, yelMat));
  groups.shaft.meshes.push(axisKnot);

  const land = (y) => {
    const dist = F / 2 + 8;
    const w = sideLen * 0.95;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const m = put(box(w, 0.55, 14, Math.cos(a) * dist, y + 0.4, Math.sin(a) * dist, charMat));
      m.rotation.y = Math.PI / 2 - a;
    }
  };
  for (const f of floors) land(f.y);

  const halls = [];
  for (const z of [-86, 48]) {
    const hall = put(box(92, 14, 36, -158, 7.1, z, hallMat));
    halls.push(hall);
    const strip = put(box(80, 0.45, 1.1, -158, 14.5, z, yelMat));
    groups.energy.meshes.push(strip);
    halo.energy.push(-158, 16.2, z);
  }
  const finGeo = new THREE.BoxGeometry(0.7, 12, 18);
  const fins = new THREE.InstancedMesh(finGeo, charMat, 8);
  for (let i = 0; i < 8; i++) {
    dummy.position.set(-236, 6.2, -16 + i * 10);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    fins.setMatrixAt(i, dummy.matrix);
    halo.energy.push(-236, 13, -16 + i * 10);
  }
  fins.castShadow = false;
  g.add(fins);
  const finCap = put(box(2.2, 0.35, 78, -236, 12.5, 19, yelMat));
  groups.energy.meshes.push(finCap);

  for (let i = 0; i < 4; i++) {
    const x = -130 + i * 78;
    put(box(62, 16, 30, x, 8.2, -178, hallMat));
    const mark = put(box(10, 0.4, 0.45, x, 16.6, -163, coolMat));
    groups.store.meshes.push(mark);
    halo.store.push(x, 18, -163);
  }
  const siloGeo = new THREE.CylinderGeometry(7.2, 7.2, 24, 16);
  const silos = new THREE.InstancedMesh(siloGeo, shellMat, 7);
  for (let i = 0; i < 7; i++) {
    dummy.position.set(-150 + i * 28, 12.2, -236);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    silos.setMatrixAt(i, dummy.matrix);
  }
  silos.castShadow = false;
  g.add(silos);

  const tankGeo = new THREE.CylinderGeometry(6.4, 6.4, 8, 14);
  const tanks = new THREE.InstancedMesh(tankGeo, shellMat, 5);
  for (let i = 0; i < 5; i++) {
    dummy.position.set(-130 - (i % 2) * 26, -12.6, -20 + i * 34);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    tanks.setMatrixAt(i, dummy.matrix);
  }
  tanks.castShadow = false;
  g.add(tanks);
  put(box(46, 7.5, 20, -188, -12.8, 92, hallMat));
  const growPow = put(box(36, 0.35, 0.8, -188, -8.6, 92, yelMat));
  groups.energy.meshes.push(growPow);
  halo.energy.push(-188, -7.2, 92);
  const growCold = put(box(8, 0.35, 0.4, -150, -8.2, 48, coolMat));
  groups.store.meshes.push(growCold);
  halo.store.push(-150, -7, 48);

  put(box(130, 11, 24, 20, -34.2, -150, hallMat));
  const bus = put(box(110, 0.4, 1.1, 20, -28.4, -150, yelMat));
  groups.energy.meshes.push(bus);
  halo.energy.push(20, -26.5, -150);
  put(box(48, 9, 22, -70, -35.2, -96, hallMat));
  put(box(40, 8, 18, 90, -35.6, -210, hallMat));
  const partsMark = put(box(8, 0.35, 0.4, 90, -31.3, -201, coolMat));
  groups.store.meshes.push(partsMark);
  halo.store.push(90, -30, -201);

  for (const [x, z] of [[-78, -48], [-78, 36], [-46, -88]]) {
    put(box(24, 6, 16, x, -60.7, z, charMat));
    const pip = put(box(1.2, 1.6, 0.3, x + 8, -57.2, z, redMat));
    groups.alarm.meshes.push(pip);
    halo.alarm.push(x + 8, -55.5, z);
  }
  put(box(18, 7, 18, -40, -60.2, -150, hullMat));
  const ballast = put(box(6, 0.3, 0.35, -40, -56.4, -141, coolMat));
  groups.store.meshes.push(ballast);
  halo.store.push(-40, -55, -141);

  const deckR = F / 2 + 10;
  for (const f of floors) {
    const y = f.y + 0.42;
    const t = 0.5;
    const span = deckR * 2;
    groups.deck.meshes.push(
      put(box(span, 0.28, t, 0, y, -deckR, deckGlow)),
      put(box(span, 0.28, t, 0, y, deckR, deckGlow)),
      put(box(t, 0.28, span - t * 2, -deckR, y, 0, deckGlow)),
      put(box(t, 0.28, span - t * 2, deckR, y, 0, deckGlow)),
    );
    const hy = f.y + 1.15;
    halo.deck.push(0, hy, -deckR, 0, hy, deckR, -deckR, hy, 0, deckR, hy, 0);
  }

  const car = new THREE.Group();
  const carBody = new THREE.Mesh(new THREE.CylinderGeometry(F * 0.26, F * 0.24, 2.4, 6), shellMat);
  carBody.castShadow = false;
  const carBand = new THREE.Mesh(new THREE.CylinderGeometry(F * 0.28, F * 0.28, 0.32, 6), yelMat);
  carBand.position.y = 0.85;
  carBand.castShadow = false;
  car.add(carBody, carBand);
  g.add(car);
  groups.shaft.meshes.push(carBand);

  const shaftHalo = addHaloPoints(g, groups.shaft.meshes, halo.shaft, '#e2b15c', 3.4, 0.5);
  const deckHalo = addHaloPoints(g, groups.deck.meshes, halo.deck, '#d5e4ea', 4.2, 0.42);
  const energyHalo = addHaloPoints(g, groups.energy.meshes, halo.energy, '#e2b15c', 4.6, 0.48);
  const storeHalo = addHaloPoints(g, groups.store.meshes, halo.store, '#c8fff4', 3.8, 0.45);
  const alarmHalo = addHaloPoints(g, groups.alarm.meshes, halo.alarm, '#e23b3b', 3.2, 0.4);

  const ring = salmonRing(plot * 1.012, plot * 1.012, 0.55);
  g.add(ring);
  const sections = floors.map((f, i) => ({
    id: f.id,
    label: f.name,
    floor: f.y,
    clip: i === 0 ? null : floors[i - 1].y - 1.55,
  }));
  const clipMats = [shellMat, charMat, padMat, deckMat, equipMat, hullMat, hallMat, yelMat, redMat, coolMat, deckGlow, curbMat, trunkMat];
  for (const pts of [shaftHalo, deckHalo, energyHalo, storeHalo, alarmHalo]) {
    if (pts && pts.material) clipMats.push(pts.material);
  }
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  let clipOn = false;
  g.userData.hub = { plot, layers: floors.map(f => f.name), shaft: 'hex', top: axisY, axis: axisY, stack: yStack, section: 'surface' };
  const applySection = (sec) => {
    const on = sec.clip != null;
    if (on !== clipOn) {
      renderer.localClippingEnabled = on;
      for (const m of clipMats) {
        m.clippingPlanes = on ? [clipPlane] : null;
        m.clipShadows = false;
        m.needsUpdate = true;
      }
      clipOn = on;
    }
    if (on) clipPlane.constant = sec.clip;
    ring.position.y = sec.floor;
    g.userData.hub.section = sec.id;
  };
  return {
    group: g,
    ring,
    ownState: true,
    lightGroups: [groups.shaft, groups.deck, groups.energy, groups.store, groups.alarm],
    sections,
    section: 'surface',
    applySection,
    motion(p, st) {
      const job = st === 'job';
      const br = st === 'break';
      car.position.y = job ? -46 + p * (yStack - 8 + 46) : br ? -36 : 8;
      yelMat.emissiveIntensity = br ? 0.22 : job ? 4.4 : st === 'sel' ? 3.2 : 1.7;
      deckGlow.emissiveIntensity = br ? 0.18 : job ? 2.8 : st === 'sel' ? 2.2 : 1.05;
      coolMat.emissiveIntensity = br ? 0.2 : job ? 2.6 : st === 'sel' ? 3.1 : 1.25;
      redMat.emissiveIntensity = br ? 4.6 : 0.7;
      fadeHaloMat(shaftHalo && shaftHalo.material, br ? 0.2 : job ? 1 : 0.62);
      fadeHaloMat(deckHalo && deckHalo.material, br ? 0.16 : job ? 1 : 0.55);
      fadeHaloMat(energyHalo && energyHalo.material, br ? 0.12 : job ? 1 : st === 'sel' ? 0.9 : 0.5);
      fadeHaloMat(storeHalo && storeHalo.material, br ? 0.2 : job ? 0.9 : st === 'sel' ? 1 : 0.55);
      fadeHaloMat(alarmHalo && alarmHalo.material, br ? 1 : 0.35);
      if (halls[0]) halls[0].rotation.z = br ? 0.012 : 0;
      ring.visible = st === 'sel' || br;
      for (const m of ring.children) m.material = br ? alertMat : zoneMat;
    },
  };
}

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
