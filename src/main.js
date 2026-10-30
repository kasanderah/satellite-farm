// =====================================================================
//  环穗 (Ringsheaf) · v3.1 环带版 渲染层（three.js r186，ES 模块，build.sh 打包成单文件 html）
// =====================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { PALETTE, CROPS, TEX_ID, L, fields, harvesters, haulers, drones, step, TRUNKS_X, TRUNKS_Z, depots, inCrater, ROADS, RING, LAYERS, CUT, wrapX, PLOT, economy, focus, signals, log, plantField, abandonField, quote, setTimeScale, setPaused, paused, exportSnapshot, applySnapshot, fieldAtWorld, fieldAt, toWorld, onAfterStep, fieldOrigin, simTime, worldDay, stores, rigs, fieldVisual, cropWatch, stageBoard, POTATO_DAYS, POTATO_STAGES, warehouse, buildings, sellLot, sellStack, warehouseStacks, warehouseCapacity, placeBuilding, removeBuilding, rigReadout, SHOP, buySeed, buyItem, SEED_PER_FIELD, FERT_PER_FIELD, resetGame, CULTURES, DECK_CLIMATE, tanks, cultureWatch, startCulture, tendCulture, harvestCulture, BUILDING_KINDS, CULTURE_CELLS, tankSite, devices, potatoStock, fertPlan, cultureFeedPlan, millWatch, startMill, removeMill, orderProcess, HUB_SITES, cropDossier, MACHINE_SHOP, buyMachine, cropDef, boomWatch, rigProfile, DRONE_SHOP, workDrones, buyDrone, sectorLight, sectorWord, dayCenter, setWorldDay, RING_OMEGA, bindPotatoClock, bindSurfaceClock, formatTimeScale } from './_shared.js';
import { applyStagePayload, bootFieldStageSource, writeStageStore, suspendLastikaStage, resumeLastikaStage, stageBadge } from './field-stage-live.js';
import { bootWorkshopMachines } from './machine-live.js';
import { potatoDrawLooks, POTATO_PAINT_SLOTS, workWidthOf } from './surface-crops.js';
import { ridgeCrestT } from './field-stages.js';
import { migrateSave } from './save-contract.js';
import { productById } from './products.js';
import { NOISE, FARM, CURVE_DECL, CURVE_PROJECT } from './glsl.js';
import { harvesterKit, haulerKit, droneKit, personKit, conveyorKit, depotKit, hubKit, plantGeometry, mastKit, irrigatorKit, growRackKit, tankKit, pumpKit, pipeRackKit, shedKit, warehouseKit, garageKit, processKit, cultureTankKit, armKit, deckLightKit } from './prefabs.js';
import { surfaceKits, hitchOffset } from './surface-kits.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CULT_EMPTY } from './lab-catalog.js';
import { makeColony } from './colony-art.js';
import { bootSlice, tickSlice, prepField, plantCrop, dockOf } from './b-bind.js';
import { PLANT_CROPS, PREP_RECIPES, JOBS } from './framework-b.js';
import { HUD_VERSION } from './version.js';
import { DAY_SECONDS } from './world-clock.js';

const Q = new URLSearchParams(location.search);
const VIEW = Q.get('view') || '', PREWARM = +Q.get('t') || 0, NOPOST = Q.has('nopost'), SHOWFPS = Q.has('fps');
if (Q.get('rate')) setTimeScale(+Q.get('rate'));
else if (Q.get('speed')) setTimeScale(+Q.get('speed'));
else if (VIEW) setTimeScale(1);
const C = k => new THREE.Color(PALETTE[k] || k);
const DEG = Math.PI / 180;

// ---------------- 渲染器 ----------------
const R = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
R.setPixelRatio(Math.min(devicePixelRatio, 1.5)); R.setSize(innerWidth, innerHeight);
R.toneMapping = THREE.AgXToneMapping; R.toneMappingExposure = 1.85; R.outputColorSpace = THREE.SRGBColorSpace;
R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(R.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 30000);

// ---------------- 共享 uniform ----------------
const NFX = L.NFX, NFZ = L.NFZ;
const fieldData = new Float32Array(NFX * NFZ * 4);
const fieldTex = new THREE.DataTexture(fieldData, NFX, NFZ, THREE.RGBAFormat, THREE.FloatType);
fieldTex.minFilter = fieldTex.magFilter = THREE.NearestFilter; fieldTex.needsUpdate = true;
const U = {
  uField: { value: fieldTex },
  uCropP: { value: CROPS.map(c => new THREE.Vector4(c.height, c.row, TEX_ID[c.tex], c.along)) },
  uCropRipe: { value: CROPS.map(c => C(c.ripe)) },
  uCropYoung: { value: CROPS.map(c => C(c.young)) },
  uCropStub: { value: CROPS.map(c => C(c.stub)) },
  uCurve: { value: new THREE.Vector3(0, 0, RING.R) },
  uCut: { value: new THREE.Vector4(0, 0, 0, 0) }, uCutOn: { value: 0 },
  uTime: { value: 0 },
  uSunXZ: { value: new THREE.Vector2(1, 0) }, uSunTan: { value: 0.38 },
  uCarto: { value: 0 }, uMap: { value: 0 }, uNight: { value: 0 },
  uPlantWin: { value: new THREE.Vector4(0, 0, 0, 0) },
  uCamDist: { value: 1000 },
  uSel: { value: new THREE.Vector4(0, 0, 0, 0) },
  uSelOn: { value: 0 },
  uOpen: { value: 0 },
  uPlot: { value: new THREE.Vector4(PLOT.x0, PLOT.x1, PLOT.z0, PLOT.z1) },
  uDayCenter: { value: 0 },
  uCirc: { value: RING.CIRC },
  uHalfDay: { value: Math.PI / 2 },
  uPenumbra: { value: 8 * DEG },
  uLocalDay: { value: 1 },
  uMirrorOn: { value: 1 },
  uLockDay: { value: 0 },
  // 和地面 B 冠层同一条：幼苗 mix(oliveDp, moss, 0.35)，成熟 mix(oliveDp, olive, 0.62)。
  uBRaw: { value: C('#6f6a61') },
  uBYoung: { value: C('#51542c') },
  uBRipe: { value: C('#787c32') },
  uBStraw: { value: C('#b59a63') },
  uBCrop: { value: CROPS.findIndex(c => c.id === 'lastika') },
};
const POT_SLOTS = POTATO_PAINT_SLOTS;
const potTintData = new Float32Array(POT_SLOTS * 3 * 4);
const potRidgeData = new Float32Array(POT_SLOTS * 2 * 4);
const potTintTex = new THREE.DataTexture(potTintData, 3, POT_SLOTS, THREE.RGBAFormat, THREE.FloatType);
const potRidgeTex = new THREE.DataTexture(potRidgeData, 2, POT_SLOTS, THREE.RGBAFormat, THREE.FloatType);
potTintTex.minFilter = potTintTex.magFilter = THREE.NearestFilter;
potRidgeTex.minFilter = potRidgeTex.magFilter = THREE.NearestFilter;
potTintTex.needsUpdate = true;
potRidgeTex.needsUpdate = true;
U.uPotTint = { value: potTintTex };
U.uPotRidge = { value: potRidgeTex };
U.uPotOn = { value: 0 };
const potColor = new THREE.Color();
function writePotColor(offset, hex) {
  potColor.set(hex || '#6f6a61');
  potTintData[offset] = potColor.r;
  potTintData[offset + 1] = potColor.g;
  potTintData[offset + 2] = potColor.b;
}
let potDrawNow = null;
// 行向占 d.a 的整数部分（>0.5 即横垄）。小数是作业槽：work/128 + base/4096，不超过 0.5。
// work 为 0 表示这会儿没有车在刷色。base 为 0 表示没有上一道变体。
// 没有正在扫的变体时，把留下的颜色放进 /128。单独的 base/4096 太小，硬刷后会掉成空地。
// 间隙（mask < 0）和收割前沿都走这条，不单给播种前。
function encodeDir(v) {
  const orient = v.dir > 0.5 ? 1 : 0;
  if (!potDrawNow || CROPS[v.crop]?.id !== 'potato') return orient;
  let workId = v.coat || '';
  let baseId = v.base || '';
  // 没变体、但车正在按机具幅宽扫（碎残、起薯）时，留下的颜色放在 base，扫过的垄另刷深色。
  const bareSweep = !workId && v.mask > 20;
  if (!workId && baseId && !bareSweep) {
    workId = baseId;
    baseId = '';
  }
  if (!workId && !baseId) return orient;
  const work = workId
    ? (workId === 'sow' ? potDrawNow.sowSlot : (potDrawNow.variantSlot[workId] || 0))
    : 0;
  const base = baseId ? (potDrawNow.variantSlot[baseId] || 0) : 0;
  if (work <= 0 && base <= 0) return orient;
  if (work === potDrawNow.sowSlot && base <= 0 && !(v.mask < 0)) return orient;
  return orient + work / 128 + base / 4096;
}
function syncPotatoPaint() {
  const draw = potatoDrawLooks();
  potDrawNow = draw;
  U.uPotOn.value = draw.workshop ? 1 : 0;
  const potato = CROPS.findIndex(c => c.id === 'potato');
  const packed = U.uCropP.value[potato];
  const src = CROPS[potato];
  if (draw.workshop) {
    packed.x = draw.height;
    packed.y = draw.row;
    packed.w = draw.along;
  } else {
    packed.x = src.height;
    packed.y = src.row;
    packed.w = src.along;
  }
  const lastika = CROPS.findIndex(c => c.id === 'lastika');
  const vis = PLANT_CROPS.lastika.visual;
  const packedL = U.uCropP.value[lastika];
  if (packedL) {
    packedL.x = vis.height;
    packedL.y = vis.row;
    packedL.w = vis.along;
    packedL.z = TEX_ID[vis.tex];
  }
  syncLastikaPaint();
  for (let s = 0; s < POT_SLOTS; s++) {
    const look = draw.slots[s] || draw.slots[1];
    const base = s * 12;
    writePotColor(base, look.color);
    potTintData[base + 3] = look.roughness;
    writePotColor(base + 4, look.canopy);
    potTintData[base + 7] = look.cover;
    potTintData[base + 8] = look.plantScale;
    potTintData[base + 9] = 0;
    potTintData[base + 10] = 0;
    potTintData[base + 11] = 0;
    const ridge = look.ridge || [];
    const rbase = s * 8;
    for (let i = 0; i < 8; i++) potRidgeData[rbase + i] = ridge[i] || 0;
  }
  potTintTex.needsUpdate = true;
  potRidgeTex.needsUpdate = true;
}
function syncLastikaPaint() {
  const paints = PLANT_CROPS.lastika.paints;
  if (!paints) return;
  if (paints.raw) U.uBRaw.value.set(paints.raw);
  if (paints.young) U.uBYoung.value.set(paints.young);
  if (paints.ripe) U.uBRipe.value.set(paints.ripe);
  if (paints.straw) U.uBStraw.value.set(paints.straw);
}
// 按期望法线确定三角形绕序（正面朝外，避免被背面剔除 / 双面材质翻转法线）
function pushQuad(pos, A, B, Cc, D, n) {
  const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]];
  const g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const ok = g[0] * n[0] + g[1] * n[1] + g[2] * n[2] >= 0;
  const tris = ok ? [A, B, Cc, A, Cc, D] : [A, Cc, B, A, D, Cc];
  for (const v of tris) pos.push(v);
  return tris;
}
// 剖面状态：剖切盒中心（平面坐标）。外圈盒 = 露出培育层，内圈盒（偏向 -x 一端）= 再下一层露出设备层
const cut = { on: false, x: 0, z: 0 };
const cutInner = () => ({ x0: cut.x - CUT.AX + 14, x1: cut.x - CUT.AX + 14 + 2 * CUT.IX, z0: cut.z - CUT.IZ, z1: cut.z + CUT.IZ });
const inCut = (x, z, pad = 0) => cut.on && Math.abs(x - cut.x) < CUT.AX + pad && Math.abs(z - cut.z) < CUT.AZ + pad;
function writeFields() {
  syncPotatoPaint();
  U.uPotOn.value = 0;
  for (const f of fields) {
    const o = (f.j * NFX + f.i) * 4;
    const v = fieldVisual(f);
    let alpha = encodeDir(v);
    if (v.holdSweep && v.mask > 20) {
      const orient = v.dir > 0.5 ? 1 : 0;
      const kept = Math.max(0, Math.min(0.015, (v.s || 0) / 1000));
      alpha = orient + 0.37 + kept;
    } else if (v.next != null && v.mask > 20 && CROPS[v.crop]?.id === 'lastika') {
      const orient = v.dir > 0.5 ? 1 : 0;
      alpha = orient + (Math.round(v.next) % 100) / 100;
    }
    fieldData[o] = v.crop; fieldData[o + 1] = v.g; fieldData[o + 2] = v.mask != null && v.mask !== 0 ? v.mask : v.s; fieldData[o + 3] = alpha;
  }
  fieldTex.needsUpdate = true;
}

// 给世界材质加「地面弯曲」
function curved(mat, extra) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uCurve = U.uCurve;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + CURVE_DECL)
      .replace('#include <project_vertex>', CURVE_PROJECT)
      // 剖面按平面高度切。卷曲后的视空间已经抬过刀面，中枢地板和井筒会被整段切掉。
      .replace('#include <clipping_planes_vertex>', `#include <clipping_planes_vertex>
#if NUM_CLIPPING_PLANES > 0
  vec4 flatClip = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    flatClip = instanceMatrix * flatClip;
  #endif
  flatClip = modelViewMatrix * flatClip;
  vClipPosition = - flatClip.xyz;
#endif`);
    if (extra) extra(s);
  };
  return mat;
}

// ---------------- 6 种世界材质（IXION 式材质纪律） ----------------
const MAT = {
  light: curved(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.35 })),
  dark: curved(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.55 })),
  glass: curved(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.6, envMapIntensity: 1.4 })),
  emis: curved(new THREE.MeshBasicMaterial({ vertexColors: true })),
};
// ⑤ 地面（田块 / 路网 / 荒地 / 制图覆盖层全部在一个着色器里）
MAT.ground = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, envMapIntensity: 0.3 });
// ⑥ 作物（实例化，顶点色存明暗，颜色由作物参数和生长度决定）
MAT.crop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.35 });

// ---------------- 天空 + 气态巨行星（压低彩度的背景天体） ----------------
// 田间补光来自南极镜组，方向钉在环架上，不跟自旋走。低角度是为了垄沟还有影子。
const SUN_EL = 21 * DEG, SUN_AZ = -38 * DEG;
const sunDir = new THREE.Vector3(Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), -Math.cos(SUN_AZ) * Math.cos(SUN_EL)).normalize();
U.uSunXZ.value.set(sunDir.x, sunDir.z).normalize(); U.uSunTan.value = Math.tan(SUN_EL);
// 轮轴大致朝日：太阳离北极约 28°，环一转它绕轴画一小圈。星星走满圈。
const AXIS_SUN = new THREE.Vector3(-Math.sin(28 * DEG), 0.12, Math.cos(28 * DEG)).normalize();
const FOG_DAY = new THREE.Color('#868d8f'), FOG_FAR = new THREE.Color('#b4babb'), FOG_NIGHT = new THREE.Color('#1b1f27'), FOG_DECK = new THREE.Color('#2a3138');
scene.fog = new THREE.FogExp2(FOG_DAY.clone(), 0.0002);
const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  uniforms: {
    uSun: { value: AXIS_SUN }, uSpin: { value: 0 }, uFog: { value: scene.fog.color }, uNight: U.uNight,
    uZen: { value: C('deep') }, uVoid: { value: C('void') },
    // 母星（气态巨行星）：挂在左侧环壁上方，环带拱顶的旁边
    uPDir: { value: new THREE.Vector3(-0.80, 0.30, 0.52).normalize() },
    uPRad: { value: 0.125 }, uPA: { value: C('ochre') }, uPB: { value: C('haze') }, uRim: { value: C('skyRim') },
  },
  vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader: /* glsl */`
    varying vec3 vDir; uniform vec3 uSun, uFog, uZen, uVoid, uPDir, uPA, uPB, uRim; uniform float uPRad, uNight, uSpin;
    ${NOISE}
    vec3 inertial(vec3 p){ float c = cos(uSpin), s = sin(uSpin); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
    void main(){
      vec3 v = normalize(vDir);
      vec3 iv = inertial(v);
      float el = asin(clamp(v.y, -1., 1.));
      // 环带内看出去就是太空：深色背景，只在环带平面附近有一层很淡的大气辉光（不再是一条白色地平线带）
      vec3 col = mix(uZen * 1.15, uVoid, smoothstep(0.0, 0.55, abs(el)));
      col += uFog * 0.16 * exp(-abs(el) * 7.);
      // 太阳和星星在惯性系里。环架自转时，它们相对田面转，地平线辉光留在环上。
      float sd = max(dot(iv, uSun), 0.);
      col += vec3(1.0, 0.72, 0.5) * (pow(sd, 14.) * 0.28 + pow(sd, 900.) * 6.0) * (1. - uNight * 0.85);
      float iel = asin(clamp(iv.y, -1., 1.));
      vec2 sp = vec2(atan(iv.z, iv.x) * 260., iel * 260.);
      float st = step(0.9972, hash12(floor(sp))) * (0.5 + 0.5 * hash12(floor(sp) + 3.));
      col += st * (0.16 + uNight * 0.8) * (1. - pow(sd, 6.));
      // 母星：不透明的实心球体（受光面 + 明暗交界 + 低彩度条纹），不再是半透明的白色剪影
      float D = 1.0, r = sin(uPRad);
      float b = dot(iv, uPDir), h2 = b * b - (D * D - r * r);
      float tP = 1e9;
      vec3 pc = uPDir * D;
      vec3 axis = normalize(vec3(0.3, 1.0, 0.18));
      if (h2 > 0.) {
        tP = b - sqrt(h2);
        vec3 n = normalize(iv * tP - pc);
        float lat = dot(n, axis);
        float band = fbm(vec2(lat * 8.0, lat * 2.0 + 3.1)) * 0.7 + 0.3 * (0.5 + 0.5 * sin(lat * 29.));
        vec3 pcol = mix(uPA * 0.62, uPB * 0.82, band);
        float ndl = dot(n, uSun);
        float lit = smoothstep(-0.06, 0.45, ndl);
        float limb = 1. - max(dot(n, -iv), 0.);
        vec3 pl = pcol * (0.018 + 0.62 * lit) * (1. - 0.45 * limb * limb) + uRim * pow(limb, 3.) * 0.22 * smoothstep(-0.25, 0.25, ndl);
        // 环在星体上的影子：一条细暗带
        float rs = abs(dot(n * r, axis) / max(abs(dot(uSun, axis)), 0.2));
        pl *= 1. - 0.35 * smoothstep(0.02, 0.0, abs(dot(n, axis) - 0.06)) * lit;
        float edge = smoothstep(0.0, r * r * 0.03, h2);
        col = mix(col, pl * (1. - uNight * 0.6) + uFog * 0.03, edge);
      }
      // 环：与赤道面求交；受光强度随太阳与环面的夹角，被星体挡住的部分在阴影里
      float tR = dot(pc, axis) / dot(iv, axis);
      if (tR > 0. && tR < tP) {
        vec3 rp = iv * tR - pc; float rr = length(rp) / r;
        float ring = smoothstep(1.42, 1.48, rr) * (1. - smoothstep(2.1, 2.2, rr)) * (0.35 + 0.65 * fbm(vec2(rr * 22., 1.)));
        ring *= 1. - 0.75 * smoothstep(1.72, 1.75, rr) * (1. - smoothstep(1.81, 1.84, rr));   // 卡西尼缝
        float shd = 1.; float ad = dot(rp, uSun); if (ad < 0.) shd = smoothstep(r * 0.92, r * 1.08, length(rp - uSun * ad));
        vec3 rc = mix(uPA, uPB, 0.55) * (0.08 + 0.42 * abs(dot(axis, uSun))) * (0.12 + 0.88 * shd);
        col = mix(col, rc * (1. - uNight * 0.6), ring * 0.5);
      }
      gl_FragColor = vec4(col * (1. - uNight * 0.6), 1.0);
    }`,
}));
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

// ---------------- 光照：低角度暖色主光 + 冷暖半球补光 + 环境反射 ----------------
const sun = new THREE.DirectionalLight('#ffd9b0', 3.6);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#5f7480', '#2a2622', 0.42); scene.add(hemi);
{ // 用天空本身生成一张 PMREM 环境图，给金属和玻璃一点天空反射
  const pm = new THREE.PMREMGenerator(R); const es = new THREE.Scene(); const sk = sky.clone(); sk.material = sky.material.clone(); es.add(sk);
  scene.environment = pm.fromScene(es, 0, 0.1, 1000).texture; scene.environmentIntensity = 0.45;
}

// ---------------- 地面（巨大平面，跟随镜头移动；田块全部在着色器里画） ----------------
// 环带内表面：一条整圈长（周长 + 重叠）、环壁到环壁宽的长条，沿环向跟随镜头；卷曲在顶点着色器里做
const ground = new THREE.Mesh(new THREE.PlaneGeometry(RING.CIRC + 400, RING.W, 760, 8).rotateX(-Math.PI / 2), MAT.ground);
ground.receiveShadow = true; ground.frustumCulled = false; scene.add(ground);
// 培育层地板：和地表同一套模数（跨环 7 个大格，每格 4×4 = 16 个小格）。只在下到培育层时露出来。
const deckMat = new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.42, color: PALETTE.haze });
deckMat.onBeforeCompile = (sh) => {
  sh.uniforms.uCurve = U.uCurve;
  sh.uniforms.uField = { value: L.FIELD };
  sh.uniforms.uRoad = { value: L.ROAD };
  sh.uniforms.uBP = { value: L.BP };
  sh.uniforms.uBlock = { value: L.BLOCK };
  sh.uniforms.uX0 = { value: L.X0 };
  sh.uniforms.uZ0 = { value: L.Z0 };
  sh.uniforms.uLane = { value: L.LANE };
  sh.uniforms.gDeep = { value: C('deep') };
  sh.uniforms.gMetal = { value: C('metalDk') };
  sh.uniforms.gHaze = { value: C('haze') };
  sh.uniforms.gData = { value: C('data') };
  sh.uniforms.gSteel = { value: C('steel') };
  sh.uniforms.gZone = { value: C('zone') };
  sh.uniforms.uSel = U.uSel;
  sh.uniforms.uSelOn = U.uSelOn;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + CURVE_DECL + '\nvarying vec3 vFlat;')
    .replace('#include <project_vertex>', 'vFlat = (modelMatrix * vec4(transformed, 1.0)).xyz;\n' + CURVE_PROJECT);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vFlat;
uniform float uField, uRoad, uBP, uBlock, uX0, uZ0, uLane;
uniform vec3 gDeep, gMetal, gHaze, gData, gSteel, gZone;
uniform vec4 uSel; uniform float uSelOn;
float aaAt(float x, float w){ float fw = max(fwidth(x), 0.02); return 1. - smoothstep(w, w + fw, x); }
vec3 deckEmis = vec3(0.);
vec3 deckAlbedo(){
  vec2 p = vFlat.xz;
  float pitch = uField + uRoad;
  float bx = mod(p.x - uX0, uBP);
  float bz = mod(p.y - uZ0, uBP);
  float trunk = max(step(uBlock, bx), step(uBlock, bz));
  float sx = mod(bx, pitch);
  float sz = mod(bz, pitch);
  float plate = (1. - trunk) * step(sx, uField) * step(sz, uField);
  float seam = max(aaAt(min(sx, pitch - sx), 0.35), aaAt(min(sz, pitch - sz), 0.35));
  float big = max(aaAt(min(bx, abs(bx - uBlock)), 0.9), aaAt(min(bz, abs(bz - uBlock)), 0.9));
  vec3 col = mix(gMetal * 1.35, gHaze * 0.42, plate);
  col = mix(col, gHaze * 0.62, (1. - plate) * (1. - trunk));
  col = mix(col, gDeep * 0.85, trunk);
  col = mix(col, gSteel, seam * 0.45 + big * 0.7);
  float lane = plate * aaAt(abs(mod(sx + uLane * 0.5, uLane) - uLane * 0.5), 0.18);
  deckEmis = gData * lane * 2.4 + gData * big * 1.6 + gSteel * seam * 0.35;
  if (uSelOn > 0.5 && p.x >= uSel.x && p.x <= uSel.y && p.y >= uSel.z && p.y <= uSel.w) {
    float b = min(min(p.x - uSel.x, uSel.y - p.x), min(p.y - uSel.z, uSel.w - p.y));
    float px = max(fwidth(b) * 2.2, 3.6);
    float edge = 1.0 - smoothstep(px * 0.12, px * 1.35, b);
    col = mix(col, gZone, max(edge * 0.96, 0.28));
    deckEmis += gZone * (edge * 1.35 + 0.22);
  }
  return col;
}`).replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = deckAlbedo();')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += deckEmis;');
};
const deckFloor = new THREE.Mesh(new THREE.PlaneGeometry(PLOT.x1 - PLOT.x0, PLOT.z1 - PLOT.z0, 48, 48).rotateX(-Math.PI / 2), deckMat);
deckFloor.position.set((PLOT.x0 + PLOT.x1) / 2, LAYERS[1].floor, (PLOT.z0 + PLOT.z1) / 2);
deckFloor.receiveShadow = false; deckFloor.frustumCulled = false; deckFloor.visible = false; scene.add(deckFloor);
const GC = { soil: C('regoDk').multiplyScalar(0.62), rego: C('rego'), regoDk: C('regoDk'), regoLt: C('regoLt'), haze: C('haze'), paper: C('paper'), metalDk: C('metalDk'), deep: C('deep'), tealGy: C('tealGy'), zone: C('zone'), data: C('data'), harvest: C('harvest'), void: C('void'), alert: C('alert'), oliveDp: C('oliveDp'), olive: C('olive'), moss: C('moss'), ochre: C('ochre'), straw: C('straw'), rust: C('rust') };
MAT.ground.onBeforeCompile = (s) => {
  Object.assign(s.uniforms, U);
  for (const k in GC) s.uniforms['g_' + k] = { value: GC[k] };
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\n' + CURVE_DECL + '\nvarying vec3 vWP;')
    .replace('#include <project_vertex>', CURVE_PROJECT + '\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vWP;
uniform float uTime, uSunTan, uCarto, uMap, uNight, uCamDist, uCutOn, uSelOn, uOpen, uDayCenter, uCirc, uHalfDay, uPenumbra, uLocalDay, uMirrorOn, uLockDay; uniform vec2 uSunXZ; uniform vec4 uPlantWin, uCut, uSel, uPlot;
${Object.keys(GC).map(k => 'uniform vec3 g_' + k + ';').join('\n')}
${NOISE}
${FARM}
uniform sampler2D uPotTint;
uniform sampler2D uPotRidge;
uniform float uPotOn;
uniform vec3 uBRaw, uBYoung, uBRipe, uBStraw;
float potRidgeAt(int slot, int i) {
  int pix = i < 4 ? 0 : 1;
  vec4 v = texelFetch(uPotRidge, ivec2(pix, slot), 0);
  int k = i - pix * 4;
  if (k == 0) return v.r;
  if (k == 1) return v.g;
  if (k == 2) return v.b;
  return v.a;
}
float potRidgeH(int slot, float t) {
  float x = clamp(t, 0.0, 0.999) * 7.0;
  int i = int(floor(x));
  float f = fract(x);
  float a = potRidgeAt(slot, i);
  float b = potRidgeAt(slot, min(i + 1, 7));
  float u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u);
}
vec3 potPaint(int slot, float phase, float along, float spacing, float patchy, float rowFw, out float rough, out float crest, out float slopeH) {
  vec4 soilPx = texelFetch(uPotTint, ivec2(0, slot), 0);
  vec4 canPx = texelFetch(uPotTint, ivec2(1, slot), 0);
  float pscale = texelFetch(uPotTint, ivec2(2, slot), 0).r;
  float h0 = potRidgeH(slot, phase);
  float h1 = potRidgeH(slot, fract(phase + 0.04));
  slopeH = (h1 - h0) / 0.04;
  crest = smoothstep(0.02, 0.16, h0);
  rough = clamp(soilPx.a, 0.05, 1.0);
  vec3 soilC = soilPx.rgb * (0.72 + 0.35 * crest) * (1.0 + patchy);
  vec3 canC = canPx.rgb * (1.0 + patchy * 1.2);
  float cover = clamp(canPx.a, 0.0, 1.0);
  float plant = smoothstep(0.03, 0.22, pscale);
  float amt = crest * clamp(cover + plant * 0.85, 0.0, 1.0);
  float al = along / max(spacing, 0.05);
  float clump = smoothstep(0.12, 0.42, abs(fract(al) - 0.5));
  float alongVis = 1.0 - smoothstep(0.2, 0.65, fwidth(al));
  // 株距缺口只打在垄顶。整条跨行都乘 clump 时，蓝沟会连成和垄垂直的色带，植株行就拧过去了。
  float gap = mix(1.0, clump, alongVis * plant * crest);
  amt *= gap;
  // 远看仍按垄相留色带，沟里留地面色。盖度再高也不把整块涂成冠层。
  float far = smoothstep(0.16, 0.48, rowFw);
  float aerial = clamp(cover * 0.55, 0.0, 0.62);
  float farAmt = aerial * mix(0.28, 1.0, crest);
  amt = mix(amt, farAmt, far);
  return mix(soilC, canC, amt);
}
// d.a 的小数是作业槽。0 表示播种后盖在空地上。有标记时 x 是上一道，y 是正在扫的一道；0 表示这侧没有变体色。
vec2 jobSlots(float dirA) {
  float marker = fract(dirA);
  if (marker <= 0.0004) return vec2(0.0, 0.0);
  float scaled = marker * 128.0;
  float workSlot = floor(scaled + 0.001);
  float baseSlot = floor((scaled - workSlot) * 32.0 + 0.5);
  return vec2(clamp(baseSlot, 0.0, 31.0), clamp(workSlot, 0.0, 31.0));
}
float gShadow = 1.0, gRough = 0.92; vec2 gTilt = vec2(0.); vec3 gOv = vec3(0.); float gOvA = 0.;
float aaLine(float x, float w){ float fw = fwidth(x); return 1. - smoothstep(w - fw, w + fw, abs(x)); }
float mirrorDay(float x){
  float ang = mod(x, uCirc) / uCirc * 6.2831853;
  if (ang < 0.0) ang += 6.2831853;
  float d = abs(ang - uDayCenter); d = min(d, 6.2831853 - d);
  float inner = uHalfDay - uPenumbra, outer = uHalfDay + uPenumbra;
  float t = clamp((d - inner) / max(outer - inner, 1e-4), 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  return 1.0 - t;
}
// 作物冠层颜色（随生长度沿明度渐变：幼苗 → 成熟）
vec3 cropCol(int c, float g){ return mix(uCropYoung[c], uCropRipe[c], smoothstep(0.45, 1.0, g)); }
vec3 farmAlbedo(vec2 p){
  ivec2 fij; vec2 loc, bl; int kind = farmCell(p, fij, loc, bl);
  float n1 = fbm(p / 55.), n2 = vnoise(p / 6.), n3 = fbm(p / 380. + 7.);
  vec3 rego = mix(g_regoDk, g_rego, smoothstep(0.25, 0.75, n3)) * (0.9 + 0.2 * n1);
  bool canopyHere = false;
  vec3 col;
  if (kind == 0) {                                   // 环壁下的检修带：浅色混凝土板 + 墙脚排水沟 + 服务路
    float dw = -bl.y;
    col = mix(g_regoLt, g_haze, 0.22) * (0.86 + 0.06 * n2 + 0.06 * n1);
    vec2 jl = mod(p, 8.) - 4.;
    col *= 1. - 0.1 * max(aaLine(abs(jl.x) - 4., 0.08), aaLine(abs(jl.y) - 4., 0.08));
    if (dw < 7.) col = mix(g_metalDk, g_deep, 0.4) * (0.9 + 0.1 * n2);
    else if (dw > 26. && dw < 42.) { col = mix(g_metalDk, g_regoDk, 0.6) * (0.95 + 0.05 * n2); col = mix(col, g_paper * 0.8, aaLine(dw - 34., 0.15) * step(0.5, fract(p.x / 12.))); }
    col *= 1. - 0.25 * aaLine(dw - 7., 0.3);
    gRough = 0.85;
  } else if (kind == -1) {
    vec2 cc = floor(p / 900.); vec2 cp = (cc + 0.5 + (vec2(hash12(cc), hash12(cc + 9.)) - .5) * .7) * 900.;
    float cr = 60. + 220. * hash12(cc + 3.), d = length(p - cp) / cr;
    float rim = smoothstep(0.75, 1.0, d) * (1. - smoothstep(1.0, 1.35, d)), bowl = 1. - smoothstep(0.0, 0.95, d);
    col = rego * (1. - bowl * 0.28 + rim * 0.22);
    gTilt = normalize(p - cp + 1e-3) * (rim * 0.5 - bowl * 0.35) * step(d, 1.4);
    // 大陨坑：坑壁朝向决定明暗（低角度阳光下一侧亮一侧暗），坑底更深
    vec3 bc; float D = craterD(p, bc);
    if (D < 1.6) {
      vec2 rd = normalize(p - bc.xy + 1e-3);
      float wall = smoothstep(0.55, 0.95, D) * (1. - smoothstep(0.95, 1.0, D));
      float outer = smoothstep(1.0, 1.04, D) * (1. - smoothstep(1.04, 1.5, D));
      gTilt = rd * (-wall * 1.6 + outer * 0.5) + (vec2(fbm(p / 60.), fbm(p / 60. + 5.)) - .5) * 0.6;
      col = mix(rego * 1.15, g_regoDk, (1. - smoothstep(0.0, 0.7, D)) * 0.35) * (0.8 + 0.35 * fbm(p / 25.));
      // 碎石与小坑（中近景的细节）
      vec2 rc = floor(p / 14.); vec2 rp = (rc + .5 + (vec2(hash12(rc), hash12(rc + 4.)) - .5) * .8) * 14.;
      float rr = length(p - rp) / (1.2 + 3. * hash12(rc + 7.));
      if (hash12(rc + 2.) > 0.55) { col *= 1. - 0.35 * (1. - smoothstep(0.6, 1.0, rr)); gTilt += normalize(p - rp + 1e-3) * (1. - smoothstep(0.5, 1., rr)) * 0.8; }
      vec2 sc2 = floor(p / 70.); vec2 sp2 = (sc2 + .5) * 70. + (vec2(hash12(sc2 + 1.), hash12(sc2 + 8.)) - .5) * 40.; float sd2 = length(p - sp2) / (6. + 14. * hash12(sc2));
      gTilt += normalize(p - sp2 + 1e-3) * (smoothstep(0.7, 1.0, sd2) * (1. - smoothstep(1.0, 1.25, sd2)) * 0.7 - (1. - smoothstep(0., 0.9, sd2)) * 0.5);
      col *= 1. + 0.25 * aaLine(D - 1.0, 0.004) ;
    }
    gRough = 0.95;
  } else if (kind == 1) {                            // 田间路：压实的浅色路面
    float across = (loc.x > FIELD) ? loc.x - FIELD : loc.y - FIELD;
    col = mix(g_rego, g_regoLt, 0.3) * (0.9 + 0.1 * n2) * (0.92 + 0.16 * n1);
    col *= 1. - 0.3 * (1. - smoothstep(0.0, 0.9, min(across, ROAD - across)));
    col = mix(col, g_rego * 0.8, smoothstep(0.8, 2.6, fwidth(p.x) + fwidth(p.y)) * 0.75);   // 远景里细路不再抢眼
    gRough = 0.9;
  } else if (kind == 2) {                            // 主干走廊：服务路 + 碎石 + 输送带基座
    float a = bl.x > BLOCK ? bl.x - BLOCK : bl.y - BLOCK;
    if (bl.x > BLOCK && bl.y > BLOCK) a = 0.;
    col = mix(g_regoLt, g_rego, 0.45) * (0.95 + 0.08 * n2);
    if (a > 7. && a < 19.) col = mix(g_regoDk, g_metalDk, 0.5) * (0.9 + 0.1 * n2);
    if (a > 10.5 && a < 15.5) col = g_metalDk * 1.1;
    col *= 1. - 0.18 * aaLine(a - 7., 0.25) - 0.18 * aaLine(a - 19., 0.25);
  } else if (kind == 4) {                            // 中枢硬化场地：浅色混凝土 + 8 m 板缝
    col = mix(g_regoLt, g_haze, 0.35) * (0.92 + 0.06 * n2 + 0.05 * n1);
    vec2 jl = mod(bl, 8.) - 4.;
    col *= 1. - 0.12 * max(aaLine(abs(jl.x) - 4., 0.08), aaLine(abs(jl.y) - 4., 0.08));
    gRough = 0.8;
    vec2 hp = bl - BLOCK * 0.5; float cheb = max(abs(hp.x), abs(hp.y));
    float axis = min(abs(hp.x), abs(hp.y));
    // 十字主通道：深色路面 + 虚线
    if (axis < 7.) { col = mix(g_metalDk, g_regoDk, 0.6) * (0.95 + 0.05 * n2); float dsh = step(0.5, fract((abs(hp.x) > abs(hp.y) ? hp.x : hp.y) / 12.)); col = mix(col, g_paper * 0.8, aaLine(axis, 0.18) * dsh); gRough = 0.75; }
    // 外圈：光伏 / 散热板阵列（成排深色面板，低粗糙度 → 低角度阳光下有掠射高光）
    else if (cheb > 196. && cheb < 256.) {
      vec2 q2 = hp; float along = abs(hp.x) > abs(hp.y) ? q2.y : q2.x; float acr = cheb - 196.;
      float row = fract(acr / 6.); float seg = fract((along + 300.) / 44.);
      float panel = step(0.12, row) * step(row, 0.7) * step(0.04, seg) * step(seg, 0.96);
      if (panel > 0.5) { col = mix(g_deep, g_metalDk, 0.55) * (0.9 + 0.12 * hash12(floor(vec2(along / 2.2, acr / 6.)))); gRough = 0.22; gTilt = (abs(hp.x) > abs(hp.y) ? vec2(sign(hp.x), 0.) : vec2(0., sign(hp.y))) * 0.35; col *= 1. - 0.25 * aaLine(fract(along / 2.2) - 0.5, 0.02); }
      else col *= 0.86;
    }
    col *= 1. - 0.2 * aaLine(cheb - 196., 0.4) - 0.2 * aaLine(cheb - 258., 0.6);
  } else {                                           // 田块
    vec4 d = texelFetch(uField, fij, 0);
    if (d.r < -2.5) {                                // 蓄水池：深色水面，低粗糙度 → 反射天空与太阳高光
      vec2 e = min(loc, FIELD - loc); float edge = min(e.x, e.y);
      col = mix(g_deep, g_tealGy, 0.18) * 0.55;
      gRough = 0.05 + 0.04 * n2;
      gTilt = (vec2(vnoise(p / 3. + uTime * .3), vnoise(p / 3. + 9. - uTime * .3)) - .5) * 0.05;
      if (edge < 4.) { col = mix(g_regoLt, g_haze, 0.3) * 0.85; gRough = 0.8; gTilt = vec2(0.); }
      return col;
    }
    if (d.r < -0.5) {                                // 区站堆场
      col = mix(g_regoLt, g_haze, 0.25) * (0.9 + 0.06 * n2);
      vec2 jl = mod(loc, 8.) - 4.;
      col *= 1. - 0.12 * max(aaLine(abs(jl.x) - 4., 0.08), aaLine(abs(jl.y) - 4., 0.08));
      return col;
    }
    int c = int(d.r + .5);
    vec4 P = uCropP[c];
    int tex = int(P.z + .5);
    vec2 uv = d.a > .5 ? loc.yx : loc;              // u 沿作物行，v 跨行
    vec2 acrossW = d.a > .5 ? vec2(1., 0.) : vec2(0., 1.);
    // 拉斯提卡按作物号认。空闲整块一色；作业中 d.b 是幅宽进度，扫过的部分换成下一道，不进商品薯阶梯。
    bool bField = abs(d.r - uBCrop) < 0.25;
    bool bWhole = bField && d.b < -0.5 && fract(d.a) < 0.0004;
    bool bSweep = bField && d.b >= 20.0;
    float visG = d.g;
    if (bSweep && jobSwept(uv, d.b)) visG = floor(fract(d.a) * 100.0 + 0.5);
    bool head = !bField && (uv.x < 6. || uv.x > FIELD - 6.);      // 地头：作物行方向与田内垂直
    float across = head ? uv.x : uv.y;
    if (head) acrossW = acrossW.yx;
    float rowS = P.y * (tex == 4 ? 2.2 : 1.0);
    float ph = across / rowS;
    float fw = fwidth(ph);
    float rowVis = 1. - smoothstep(0.22, 0.55, fw);  // 行距小于约 2 像素时淡出，避免摩尔纹
    float prof = 0.5 + 0.5 * cos(6.2832 * ph);
    float slope = -sin(6.2832 * ph);
    float g = d.g;
    bool cut = d.b >= 0.0 && d.b < 20.0 && laneCut(uv, d.b);
      float patchy = (n1 - 0.5) * 0.12 + (n2 - 0.5) * 0.05;
      float pst = floor(g + 0.001);
      // hold 犁地：0.37 只是哨兵。未扫过清掉蒙版，继续走开局那套填充；扫过的条才涂成一般田地。
      bool holdPlow = abs(d.r - uBCrop) > 0.25 && d.b >= 20.0 && abs(fract(d.a) - 0.37) < 0.02;
      bool holdSwept = holdPlow && jobSwept(uv, d.b);
      if (holdPlow && !holdSwept) {
        float keptS = max(fract(d.a) - 0.37, 0.0) * 1000.0;
        d.b = keptS > 0.2 ? keptS : 0.0;
        d.a = d.a > 0.5 ? 1.0 : 0.0;
        cut = d.b > 0.0 && d.b < 20.0 && laneCut(uv, d.b);
      }
      if (holdSwept) {
        float edgeInH = min(min(loc.x, FIELD - loc.x), min(loc.y, FIELD - loc.y));
        float edgeFadeH = smoothstep(0.0, 1.8, edgeInH);
        float rowPhH = uv.y / 0.75;
        float rowSeeH = (1.0 - smoothstep(0.22, 0.55, fwidth(rowPhH))) * edgeFadeH;
        float profH = 0.5 + 0.5 * cos(6.2832 * rowPhH);
        float slopeH = -sin(6.2832 * rowPhH);
        col = g_soil * (0.86 + 0.08 * profH * rowSeeH) * (1.0 + patchy);
        gTilt = acrossW * slopeH * 0.72 * rowSeeH;
        gRough = 0.94;
        canopyHere = false;
      } else if ((bWhole || bSweep) && tex == 2) {
      // 扫过的格子用下一道。做完以后蒙版回到 -1，整块回到同一个 g。
      float edgeIn = min(min(loc.x, FIELD - loc.x), min(loc.y, FIELD - loc.y));
      float edgeFade = smoothstep(0.0, 1.8, edgeIn);
      float rowSpB = max(P.y, 0.05);
      float rowPhB = uv.y / rowSpB;
      float rowSeeB = (1.0 - smoothstep(0.22, 0.55, fwidth(rowPhB))) * edgeFade;
      float profB = 0.5 + 0.5 * cos(6.2832 * rowPhB);
      float slopeB = -sin(6.2832 * rowPhB);
      vec3 soilB = g_soil * (0.86 + 0.08 * profB * rowSeeB) * (1.0 + patchy);
      // 未整地、幼苗、成熟、残茬读拉斯提卡文档。一般田地仍是犁地后的深土，不从种植链里取。
      vec3 rawSoil = uBRaw * (0.98 + 0.04 * profB * rowSeeB) * (1.0 + patchy * 0.35);
      float growB = clamp((visG - 2.0) / 3.0, 0.0, 1.0);
      vec3 youngB = uBYoung;
      vec3 ripeB = uBRipe;
      vec3 cropB = mix(youngB, ripeB, smoothstep(0.12, 0.9, growB)) * (1.0 + patchy * 0.35);
      if (visG < 0.5) {
        col = rawSoil;
        gTilt = acrossW * slopeB * 0.18 * rowSeeB;
        gRough = 0.98;
        canopyHere = false;
      } else if (visG < 1.5) {
        col = soilB;
        gTilt = acrossW * slopeB * 0.72 * rowSeeB;
        gRough = 0.94;
        canopyHere = false;
      } else if (visG < 6.5) {
        float coverB = smoothstep(0.0, 0.28, growB);
        float wB = mix(0.16, 0.62, coverB);
        vec3 gapB = mix(soilB, cropB * 0.55, coverB * 0.35);
        float bandB = smoothstep(1.0 - wB - 0.12, 1.0 - wB + 0.12, profB);
        col = mix(mix(gapB, cropB, wB), mix(gapB, cropB, bandB), rowSeeB);
        gTilt = acrossW * slopeB * mix(0.28, 0.62, coverB) * rowSeeB;
        gRough = mix(0.92, 0.66, coverB);
        canopyHere = coverB > 0.45;
      } else {
        col = mix(soilB, uBStraw, 0.38) * (1.0 + patchy * 0.25);
        gTilt = acrossW * slopeB * 0.1 * rowSeeB;
        gRough = 0.9;
        canopyHere = false;
      }
    } else if (pst >= 1.0 && tex == 2) {                    // 商品薯。工坊覆写时垄色、冠层、行距都读阶段表。
      bool worked = jobSwept(uv, d.b);
      if (uPotOn > 0.5) {
        // 地头不再把跨行轴拧 90°。垄法线、地面色、冠层色带都跟田内行距走同一条 uv.y。
        float rowAcross = uv.y;
        vec2 rowAcrossW = d.a > 0.5 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        float rowSp = max(P.y, 0.05);
        float rowPh = rowAcross / rowSp;
        float rowFw = fwidth(rowPh);
        float rowSee = 1.0 - smoothstep(0.22, 0.55, rowFw);
        float phase = fract(rowPh);
        int slot = int(clamp(pst, 1.0, 9.0));
        int nxtSlot = int(min(float(slot) + 1.0, 9.0));
        float roughA, crestA, slopeA;
        float roughB, crestB, slopeB;
        vec3 colA = potPaint(slot, phase, uv.x, P.w, patchy, rowFw, roughA, crestA, slopeA);
        vec3 colB = potPaint(nxtSlot, phase, uv.x, P.w, patchy, rowFw, roughB, crestB, slopeB);
        col = colA;
        gRough = roughA;
        gTilt = rowAcrossW * slopeA * rowSee;
        canopyHere = crestA > 0.35;
        // 钟没起（g 停在 1）不散点。钟一起，每一档都往下一档散点，培土→膨大和杀秧→待收同一条，不看阶段号。
        float fracW = clamp(g - pst, 0.0, 0.999);
        float blendDotW = step(hash12(floor(uv * vec2(0.58, 0.47)) + pst), fracW);
        bool clockOn = pst >= 1.5;
        vec2 slots = jobSlots(d.a);
        bool marked = fract(d.a) > 0.0004;
        bool gap = d.b < -0.5;
        bool harvestBand = d.b >= 0.0 && d.b < 20.0;
        bool swept = !gap && worked;
        if (!clockOn) {
          float baseSlot = marked ? (slots.x < 0.5 ? 1.0 : slots.x) : 1.0;
          float workSlot = marked ? slots.y : 2.0;
          int useSlot = 1;
          if (gap && marked && slots.y >= 1.0) useSlot = int(clamp(slots.y, 1.0, 31.0));
          else if (swept && workSlot >= 1.0) useSlot = int(clamp(workSlot, 1.0, 31.0));
          else useSlot = int(clamp(baseSlot, 1.0, 31.0));
          float roughW, crestW, slopeW;
          col = potPaint(useSlot, phase, uv.x, P.w, patchy, rowFw, roughW, crestW, slopeW);
          gRough = roughW;
          gTilt = rowAcrossW * slopeW * rowSee;
          canopyHere = crestW > 0.35;
          if (swept && marked && slots.y < 1.0) {
            col = g_soil * 0.5;
            gRough = 0.94;
            gTilt *= 0.15;
            canopyHere = false;
          }
        } else if (harvestBand && swept) {
          vec3 soilLane = texelFetch(uPotTint, ivec2(0, slot), 0).rgb;
          col = mix(col, soilLane * 0.72, 0.62);
          gRough = max(gRough, 0.9);
          gTilt *= 0.35;
          canopyHere = false;
        } else if (swept && !(marked && slots.y >= 1.0)) {
          col = g_soil * 0.5;
          gRough = 0.94;
          gTilt *= 0.15;
          canopyHere = false;
        } else {
          int coat = 0;
          if (swept && marked && slots.y >= 1.0) coat = int(slots.y);
          else if (!swept && marked && slots.x > 1.0) coat = int(slots.x);
          else if (gap && marked && slots.y >= 1.0) coat = int(slots.y);
          if (coat > 0) {
            float roughW, crestW, slopeW;
            col = potPaint(coat, phase, uv.x, P.w, patchy, rowFw, roughW, crestW, slopeW);
            gRough = roughW;
            gTilt = rowAcrossW * slopeW * rowSee;
            canopyHere = crestW > 0.35;
          }
          col = mix(col, colB, blendDotW);
          if (blendDotW > 0.5) {
            gRough = roughB;
            gTilt = rowAcrossW * slopeB * rowSee;
            canopyHere = crestB > 0.35;
          }
        }
      } else {
      vec3 soil = g_soil * (0.78 + 0.1 * prof * rowVis) * (1. + patchy);
      float cover = pst < 1.5 ? 0.0 : pst < 2.5 ? 0.18 : pst < 3.5 ? 0.55 : pst < 4.5 ? 0.78 : pst < 5.5 ? 0.9 : 0.0;
      vec3 young = mix(g_oliveDp, g_moss, 0.35);
      vec3 ripe = mix(g_oliveDp, g_olive, 0.55);
      vec3 crop = mix(young, ripe, smoothstep(1.5, 3.5, pst)) * (1. + patchy * 1.4);
      float w = mix(0.12, 0.6, cover);
      vec3 gap = mix(soil, crop * 0.55, cover * 0.45);
      float mask = smoothstep(1. - w - 0.12, 1. - w + 0.12, prof);
      vec3 canopy = mix(mix(gap, crop, w), mix(gap, crop, mask), rowVis);
      float al = uv.x / max(P.w, 0.05);
      float nearF = 1. - smoothstep(0.22, 0.65, max(fwidth(al), fwidth(ph)));
      float flk = smoothstep(0.72, 0.94, hash12(floor(vec2(al, ph))));
      vec3 flower = vec3(0.73, 0.60, 0.82);
      vec3 bloom = mix(canopy, flower, flk * nearF * 0.85 + 0.08 * (1. - nearF));
      float lane = floor(uv.y / LANE), lv = mod(uv.y, LANE) - LANE * 0.5;
      vec3 stub = mix(soil, mix(g_ochre, g_rust, 0.45), 0.62) * (1. + patchy);
      stub *= mod(lane, 2.) < 0.5 ? 1.05 : 0.9;
      float fine = 0.5 + 0.5 * cos(6.2832 * uv.y / 0.6);
      float nearS = 1. - smoothstep(0.2, 0.55, fwidth(uv.y / 0.6));
      stub *= 1. - 0.1 * fine * nearS;
      vec2 rc = uv * vec2(2.2, 7.0);
      float speck = smoothstep(0.62, 0.95, hash12(floor(rc)));
      float swath = (1. - smoothstep(1.2, 3.4, abs(lv))) * (0.55 + 0.45 * n1);
      stub = mix(stub, mix(g_ochre, g_rust, 0.35), clamp(mix(0.2, speck * 0.7 + swath * 0.45, nearS), 0., 0.75));
      vec2 slots = jobSlots(d.a);
      bool marked = fract(d.a) > 0.0004;
      bool restFill = d.b < -0.5;
      bool harvestBand = d.b >= 0.0 && d.b < 20.0;
      bool sweptNow = !restFill && worked;
      if (pst < 1.5) {
        float baseSlot = marked ? (slots.x < 0.5 ? 1.0 : slots.x) : 1.0;
        float workSlot = marked ? slots.y : 2.0;
        int useSlot = 1;
        if (restFill && marked && slots.y >= 1.0) useSlot = int(clamp(slots.y, 1.0, 31.0));
        else if (sweptNow && workSlot >= 1.0) useSlot = int(clamp(workSlot, 1.0, 31.0));
        else useSlot = int(clamp(baseSlot, 1.0, 31.0));
        float roughW, crestW, slopeW;
        float phaseW = fract(uv.y / max(P.y, 0.05));
        col = potPaint(useSlot, phaseW, uv.x, P.w, patchy, fwidth(uv.y / max(P.y, 0.05)), roughW, crestW, slopeW);
        gTilt = acrossW * slopeW * (sweptNow ? 0.85 : 0.35) * rowVis;
        gRough = roughW;
        canopyHere = crestW > 0.35;
      } else if (pst < 5.5) {
        col = pst < 2.5 ? mix(soil, young, 0.55) : pst < 4.5 ? canopy : bloom;
        gTilt = acrossW * slope * (pst < 2.5 ? 0.7 : 0.5) * rowVis;
        canopyHere = pst >= 2.5;
        gRough = pst < 2.5 ? 0.92 : 0.68;
      } else if (pst < 6.5) {
        bool shredded = worked || (d.b >= 9.5 && d.b < 20.0);
        if (shredded) { col = stub; gTilt = acrossW * slope * 0.35 * rowVis; gRough = 0.92; }
        else { col = bloom; gTilt = acrossW * slope * 0.55 * rowVis; canopyHere = true; gRough = 0.66; }
      } else if (pst < 7.5) {
        if (worked) {
          float tub = smoothstep(0.78, 0.96, hash12(floor(rc * 0.65)));
          col = mix(soil * 1.05, g_straw * 1.15, mix(0.12, tub, nearS) * 0.9);
          gTilt = acrossW * slope * 0.18 * rowVis;
          gRough = 0.94;
        } else {
          col = mix(bloom, mix(soil, g_straw, 0.55), 0.35);
          gTilt = acrossW * slope * 0.4 * rowVis;
          canopyHere = true;
          gRough = 0.72;
        }
      } else if (pst < 8.5) {
        col = mix(mix(soil, g_straw, 0.55), g_rust, 0.42) * (0.9 + patchy);
        gTilt = acrossW * slope * 0.22 * rowVis;
        gRough = 0.84;
      } else {
        col = mix(g_deep, g_rust, 0.62) * (0.85 + patchy);
        gTilt = acrossW * slope * 0.12 * rowVis;
        gRough = 0.96;
      }
      // 仓库默认的色阶也按同一条：钟起之后每一档都散点。间隙先铺上一道变体，散点盖在上面。收割前沿扫过的垄才挖开，不按阶段号整田关掉散点。
      float frac = clamp(g - pst, 0.0, 0.999);
      float blendDot = step(hash12(floor(uv * vec2(0.58, 0.47)) + pst), frac);
      vec3 nxt = pst < 1.5 ? soil : pst < 2.5 ? young : pst < 3.5 ? canopy : pst < 4.5 ? bloom : pst < 5.5 ? mix(bloom, stub, 0.45) : pst < 6.5 ? stub : pst < 7.5 ? mix(soil, g_straw, 0.62) : pst < 8.5 ? mix(g_straw, g_rust, 0.55) : mix(g_deep, g_rust, 0.72);
      if (pst >= 1.5 && !(harvestBand && sweptNow)) {
        int coat = 0;
        if (sweptNow && marked && slots.y >= 1.0) coat = int(slots.y);
        else if (!sweptNow && marked && slots.x > 1.0) coat = int(slots.x);
        else if (restFill && marked && slots.y >= 1.0) coat = int(slots.y);
        bool bareLane = sweptNow && coat == 0;
        if (coat > 0) {
          float roughW, crestW, slopeW;
          float phaseW = fract(uv.y / max(P.y, 0.05));
          col = potPaint(coat, phaseW, uv.x, P.w, patchy, fwidth(uv.y / max(P.y, 0.05)), roughW, crestW, slopeW);
          gTilt = acrossW * slopeW * rowVis;
          gRough = roughW;
          canopyHere = crestW > 0.35;
        }
        if (bareLane) {
          col = g_soil * 0.5;
          gRough = 0.94;
          gTilt *= 0.15;
          canopyHere = false;
        } else {
          col = mix(col, nxt, blendDot);
        }
      }
      }
    } else if (cut) {                                       // 残茬：作业带一深一浅（收割方向不同），带车辙
      float lane = floor(uv.y / LANE), lv = mod(uv.y, LANE) - LANE * .5;
      col = mix(g_soil, uCropStub[c], 0.6) * (1. + patchy);
      col *= mod(lane, 2.) < .5 ? 1.06 : 0.9;
      float trk = max(aaLine(abs(lv) - 1.9, 0.35), 0.);
      col *= 1. - 0.18 * trk;
      float fine = 0.5 + 0.5 * cos(6.2832 * uv.y / 0.6);
      col *= 1. - 0.08 * fine * (1. - smoothstep(0.2, 0.5, fwidth(uv.y / 0.6)));
      // 秸秆残留：近看是一条条浅色碎草带（割台后抛撒）+ 稀疏亮点残茬；远看平均成略亮的色调
      vec2 rc = uv * vec2(2.2, 7.0);
      float nearF = 1. - smoothstep(0.25, 0.7, fwidth(rc.y));
      float speck = smoothstep(0.62, 0.95, hash12(floor(rc)));
      float swath = (1. - smoothstep(1.2, 3.4, abs(lv))) * (0.55 + 0.45 * n1);
      float res = mix(0.22, speck * 0.75 + swath * 0.5, nearF);
      col = mix(col, uCropRipe[c] * 0.92, clamp(res, 0., 0.8) * 0.55);
      gTilt = acrossW * slope * 0.12 * rowVis;
    } else if (g < 0.01) {                           // 翻耕裸土：深色 + 垄沟
      col = g_soil * (0.78 + 0.1 * prof * rowVis) * (1. + patchy);
      gTilt = acrossW * slope * 0.45 * rowVis;
      gRough = 0.97;
    } else {                                         // 冠层
      canopyHere = true;
      vec3 crop = cropCol(c, g) * (1. + patchy * 1.4);
      float cover = smoothstep(0.02, 0.85, g);
      float wMax = tex == 0 ? 0.95 : tex == 1 ? 0.72 : tex == 2 ? 0.6 : tex == 3 ? 0.55 : 0.7;
      float w = mix(0.12, wMax, cover);
      vec3 gap = tex == 3 ? mix(g_deep, g_tealGy, 0.25) : mix(g_soil * 0.7, crop * 0.42, cover * 0.6);
      float mask = smoothstep(1. - w - 0.12, 1. - w + 0.12, prof);
      if (tex == 4) {                                // 菜畦：每畦两行，株与株之间有空隙
        float al = uv.x / P.w; float pa = 0.5 + 0.5 * cos(6.2832 * al) * cos(6.2832 * ph * 2.);
        mask = smoothstep(0.35, 0.6, pa) * step(0.18, prof) ;
        rowVis *= 1. - smoothstep(0.2, 0.5, fwidth(al));
      }
      vec3 avg = mix(gap, crop, w * (tex == 4 ? 0.65 : 1.0));
      col = mix(avg, mix(gap, crop, mask), rowVis);
      float amp = tex == 0 ? 0.22 : tex == 1 ? 0.45 : tex == 2 ? 0.85 : tex == 3 ? 0.18 : 0.35;
      gTilt = acrossW * slope * amp * rowVis;
      gRough = mix(0.88, 0.62, smoothstep(0.7, 1.0, g));                        // 成熟冠层在逆光下有一层柔光
      if (tex == 3) gRough = mix(0.12, 0.85, mask * rowVis + (1. - rowVis) * 0.55);   // 水田：行间水面反光
      // 喷药机的「拖拉机道」：每 24 m 两条细线
      if (tex < 3 && !head) { float tl = mod(uv.y, 24.) - 12.; col *= 1. - 0.32 * max(aaLine(tl - 0.9, 0.22), aaLine(tl + 0.9, 0.22)) * cover; }
    }
    // 制图层的地图模式：成熟度用单一色相渐变
    if (uMap > 0.) {
      float m = bField ? bGrowthVis(visG) : (pst >= 1.0 ? growthVis(g) : (cut ? 0.0 : g));
      vec3 mc = mix(g_deep * 1.6, g_zone, m) * (cut ? 0.6 : 1.0);
      col = mix(col, mc, uMap * 0.92);
    }
  }
  // 解析式长影：沿太阳方向回看，若冠层（或田边）比视线高就被遮住 → 收割前沿、田边投下可读的长影
  if (!canopyHere) {
    float sh = 0.;
    for (int k = 1; k <= 4; k++) {
      float t = float(k) * 1.75;
      float hc = canopyAt(p + uSunXZ * t);
      sh = max(sh, step(t * uSunTan, hc) * (1. - float(k) * 0.12));
    }
    vec2 dw = uPlantWin.xy - p; float inWin = step(max(abs(dw.x), abs(dw.y)), uPlantWin.z) * uPlantWin.w;
    gShadow = 1. - sh * 0.82 * (1. - inWin);
  }
  // 大尺度地形起伏（只改法线）：让整片农场在低角度阳光下有明暗起伏，而不是一张平板
  { vec2 q = p / 1400.; float e = 0.04; float h0 = fbm(q), hx = fbm(q + vec2(e, 0.)), hz = fbm(q + vec2(0., e));
    gTilt += vec2(h0 - hx, h0 - hz) / e * 0.11; }
  // 制图覆盖层：1 km 网格 + 区界，远景淡入
  if (uCarto > 0.) {
    vec2 km = p / 1000.;
    float gl = max(aaLine(fract(km.x + .5) - .5, 0.0), aaLine(fract(km.y + .5) - .5, 0.0));
    vec2 q = (p - vec2(X0, Z0) + TRUNK * .5) / BP; vec2 qq = fract(q) - .5;
    float bl2 = max(aaLine(abs(qq.x) - .5, 0.0), aaLine(abs(qq.y) - .5, 0.0));
    gOv = g_haze * 0.75; gOvA = uCarto * max(gl * 0.4, bl2 * 0.0);
  }
  return col;
}
`)
    .replace('#include <color_fragment>', `#include <color_fragment>
 if (uOpen > 0.5 && vWP.x >= uPlot.x && vWP.x <= uPlot.y && vWP.z >= uPlot.z && vWP.z <= uPlot.w) discard;
 if (uCutOn > 0.5 && abs(vWP.x - uCut.x) < uCut.z && abs(vWP.z - uCut.y) < uCut.w) discard;
 vec3 albedo = farmAlbedo(vWP.xz);
 if (uSelOn > 0.5 && vWP.x >= uSel.x && vWP.x <= uSel.y && vWP.z >= uSel.z && vWP.z <= uSel.w) {
   float b = min(min(vWP.x - uSel.x, uSel.y - vWP.x), min(vWP.z - uSel.z, uSel.w - vWP.z));
   float px = max(fwidth(b) * 1.1, 0.45);
   albedo = mix(albedo, g_zone, (1.0 - smoothstep(0.0, px, b)) * 0.92);
 }
 float ex = min(abs(vWP.x - uPlot.x), abs(vWP.x - uPlot.y));
 float ez = min(abs(vWP.z - uPlot.z), abs(vWP.z - uPlot.w));
 float inZ = step(uPlot.z - 30.0, vWP.z) * step(vWP.z, uPlot.w + 30.0);
 float inX = step(uPlot.x - 30.0, vWP.x) * step(vWP.x, uPlot.y + 30.0);
 float pxX = max(fwidth(ex) * 2.4, 3.2);
 float pxZ = max(fwidth(ez) * 2.4, 3.2);
 float plotEdge = max((1.0 - smoothstep(pxX * 0.15, pxX * 1.8, ex)) * inZ, (1.0 - smoothstep(pxZ * 0.15, pxZ * 1.8, ez)) * inX);
 albedo = mix(albedo, g_zone, plotEdge * 0.96);
 diffuseColor.rgb = albedo;
 { float lm = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = max(mix(vec3(lm), diffuseColor.rgb, 1.15), 0.); }
`)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
    .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(normal + (viewMatrix * vec4(gTilt.x, 0., gTilt.y, 0.)).xyz);')
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n directLight.color *= gShadow;'))
    .replace('#include <opaque_fragment>', `outgoingLight = mix(outgoingLight, gOv, gOvA);
 if (uMirrorOn > 0.5 && uLockDay < 0.5) {
   float band = mix(0.1, 1.0, mirrorDay(vWP.x));
   outgoingLight *= band / max(uLocalDay, 0.1);
 }
#include <opaque_fragment>`);
};

// ---------------- 环壁：两侧各一道，随环带卷曲（内侧面板 + 扶壁节奏 + 顶部悬挑灯带；外侧面能看到地下各层的窗带） ----------------
// 截面轮廓 (o = 向环外的偏移, y)：墙脚斜坡 → 内立面 → 悬挑底面 → 悬挑端面 → 顶面 → 外立面（一直到环带结构底部）
const WALL_PROFILE = [[-38, 0], [0, 64], [0, RING.WALL_H], [-RING.LIP, RING.WALL_H + 8], [-RING.LIP, RING.WALL_H + 28], [34, RING.WALL_H + 28], [34, -RING.HULL]];
const walls = (() => {
  const pos = [], nor = [], fid = [], NXs = 760, X = RING.CIRC + 400;
  for (const side of [-1, 1]) {
    const zw = side > 0 ? RING.WALL_B : RING.WALL_A;
    for (let k = 0; k < WALL_PROFILE.length - 1; k++) {
      const [o0, y0] = WALL_PROFILE[k], [o1, y1] = WALL_PROFILE[k + 1];
      const z0 = zw + side * o0, z1 = zw + side * o1, dz = z1 - z0, dy = y1 - y0, len = Math.hypot(dz, dy);
      const nz = (side > 0 ? -dy : dy) / len, ny = (side > 0 ? dz : -dz) / len;
      for (let i = 0; i < NXs; i++) {
        const xa = -X / 2 + X * i / NXs, xb = -X / 2 + X * (i + 1) / NXs;
        const q = pushQuad([], [xa, y0, z0], [xb, y0, z0], [xb, y1, z1], [xa, y1, z1], [0, ny, nz]);
        for (const v of q) { pos.push(...v); nor.push(0, ny, nz); fid.push(k + (side > 0 ? 10 : 0)); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('wf', new THREE.Float32BufferAttribute(fid, 1));
  // dark 材质的程序化变体：面板、扶壁、灯带都在着色器里画
  const m = new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.45, envMapIntensity: 0.6 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCurve = U.uCurve; sh.uniforms.uNight = U.uNight;
    for (const k in GC) sh.uniforms['g_' + k] = { value: GC[k] };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + CURVE_DECL + '\nattribute float wf; varying float vWf; varying vec3 vWP;')
      .replace('#include <project_vertex>', CURVE_PROJECT + '\nvWf = wf; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vWf; varying vec3 vWP; uniform float uNight;
${Object.keys(GC).map(k => 'uniform vec3 g_' + k + ';').join('\n')}
${NOISE}
#define WALL_H ${RING.WALL_H.toFixed(1)}
#define BP ${L.BP.toFixed(1)}
#define X0 ${L.X0.toFixed(1)}
float aaL(float x, float w){ float fw = fwidth(x); return 1. - smoothstep(w - fw, w + fw, abs(x)); }
vec3 wEm = vec3(0.);
vec3 wallAlbedo(){
  float f = mod(floor(vWf + .5), 10.), sd = vWf > 9.5 ? 1. : -1.;
  float u = vWP.x, h = vWP.y;
  float rib = mod(u - X0 + 13., BP);                              // 扶壁与主干走廊对齐（556 m 一道）
  vec3 col = g_metalDk;
  if (f < 0.5) { col = mix(g_rego, g_regoLt, 0.35) * (0.8 + 0.15 * vnoise(vec2(u / 9., h / 3.))); col *= 1. - 0.25 * aaL(fract(u / 16.) - .5, 0.02); }
  else if (f < 1.5) {                                             // 内立面：24 × 26 m 面板，明度交错；扶壁更浅
    vec2 pc = vec2(u / 24., h / 26.); vec2 ce = floor(pc), fr = fract(pc) - .5;
    float tone = hash12(ce + sd * 17.);
    col = mix(mix(g_rego, g_regoLt, 0.4), mix(g_regoLt, g_haze, 0.5), 0.2 + 0.6 * tone * tone);
    col *= 1. - 0.4 * max(aaL(abs(fr.x) - .5, 0.012), aaL(abs(fr.y) - .5, 0.014));
    float rb = 1. - smoothstep(9., 10.5, min(rib, BP - rib));
    col = mix(col, mix(g_regoLt, g_haze, 0.3) * (0.85 + 0.1 * vnoise(vec2(u, h / 6.))), rb);
    col *= 1. - 0.3 * aaL(h - 64., 0.6) - 0.25 * aaL(h - 300., 0.8);
    // 工作灯：墙顶下一排暖白灯；每道扶壁顶一盏航标红灯
    float lamp = aaL(fract(u / 36.) - .5, 0.012) * aaL(h - (WALL_H - 16.), 0.7);
    wEm += g_paper * lamp * (2.2 + 4. * uNight);
    wEm += g_alert * aaL(min(rib, BP - rib), 1.4) * aaL(h - (WALL_H - 4.), 1.4) * 6.;
    // 竖向「服务竖井」窗带（暗示墙体内有设施），夜里亮
    float shaft = (1. - smoothstep(1.2, 1.6, abs(min(rib, BP - rib) - 26.))) * step(70., h) * step(h, WALL_H - 30.) * step(0.4, fract(h / 9.));
    col = mix(col, g_deep, shaft * 0.7); wEm += g_paper * shaft * (0.15 + 0.9 * uNight);
  }
  else if (f < 3.5) { col = mix(g_metalDk, g_regoDk, 0.5); if (f > 2.5) wEm += g_paper * aaL(h - (WALL_H + 18.), 0.8) * (1.6 + 2. * uNight); }
  else if (f < 4.5) { col = mix(g_rego, g_regoLt, 0.3); }
  else {                                                          // 外立面：地下各层的窗带（培育层暖白 / 设备层冷青点）
    col = g_metalDk * (0.8 + 0.2 * hash12(floor(vec2(u / 30., h / 20.))));
    if (h < -4.5 && h > -17.) { float w = step(0.35, fract(u / 7.)) * aaL(h + 10.5, 3.2); col = mix(col, g_deep, w); wEm += g_paper * w * (0.8 + 1.4 * uNight); }
    if (h < -21. && h > -40.) { float w = aaL(fract(u / 22.) - .5, 0.03) * aaL(h + 30., 1.); wEm += g_data * w * 1.5; }
  }
  return col;
}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = wallAlbedo();')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += wEm;');
  };
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.receiveShadow = true; scene.add(mesh);
  return mesh;
})();

// ---------------- 近景单株（只在镜头附近的窗口里实例化；生长 / 收割由着色器读田块纹理决定） ----------------
const SHAPES = ['ear', 'stalk', 'bush', 'tuft', 'rosette', 'stubble'];
const PLANT_CAP = 60000;
function plantPatch(s, depth, stub) {
  Object.assign(s.uniforms, U);
  // 残茬和冠层各编一份。不能靠共享 uniform 在 onBeforeRender 里切换：同材质只在第一次绑定上传 uniform。
  const gate = stub
    ? 'gg = straw ? 1.0 : 0.0;'
    : 'gg = (straw || visG < 1.5) ? 0.0 : smoothstep(1.6, 4.2, visG);';
  const stubScale = stub ? 'hs = 1.0 * sc * edge; ws = 1.15 * sc * edge;' : '';
  const strawTint = stub ? 'vec3(0.86, 0.68, 0.32)' : 'mix(uBStraw, vec3(0.93, 0.86, 0.62), 0.45)';
  const sway = stub ? '' : `float sw = sin(uTime * 1.6 + io.x * 0.31 + io.z * 0.17) + 0.5 * sin(uTime * 2.7 + io.x * 0.9);
  transformed.x += sw * 0.06 * position.y * hs; transformed.z += sw * 0.03 * position.y * hs;`;
  s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
${CURVE_DECL}
${NOISE}
${FARM}
uniform float uTime, uCutOn, uPotOn; uniform vec4 uPlantWin, uCut; uniform vec3 uBYoung, uBRipe, uBStraw;
uniform sampler2D uPotTint;
varying vec3 vCropCol;`).replace('#include <begin_vertex>', `#include <begin_vertex>
  vec4 io = modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
  ivec2 fij; vec2 loc, bl; int kind = farmCell(io.xz, fij, loc, bl);
  float sc = 0.; int c = 0; float gg = 0.; vec4 d = vec4(0.); float stage = 0.; float speck = 0.; vec2 uv = vec2(0.);
  if (kind == 3) {
    d = texelFetch(uField, fij, 0); c = int(d.r + .5);
    uv = d.a > .5 ? loc.yx : loc;
    if (d.r >= 0.) {
      bool holdPlow = abs(d.r - uBCrop) > 0.25 && d.b >= 20.0 && abs(fract(d.a) - 0.37) < 0.02;
      bool holdSwept = holdPlow && jobSwept(uv, d.b);
      if (holdPlow && !holdSwept) {
        float keptS = max(fract(d.a) - 0.37, 0.0) * 1000.0;
        d.b = keptS > 0.2 ? keptS : 0.0;
        d.a = d.a > 0.5 ? 1.0 : 0.0;
      }
      stage = floor(d.g + 0.001);
      bool bField = abs(d.r - uBCrop) < 0.25;
      bool bSweep = bField && d.b >= 20.0;
      float visG = d.g;
      if (bSweep && jobSwept(uv, d.b)) visG = floor(fract(d.a) * 100.0 + 0.5);
      bool straw = bField && visG >= 6.5 && visG < 8.5;
      bool opened = !bField && harvestFront(d.b) > 0.0 && laneCut(uv, harvestFront(d.b));
      float frac = clamp(d.g - stage, 0.0, 0.999);
      speck = bField ? 0.0 : step(hash12(floor(io.xz * 0.45)), frac);
      if (bField) {
        // 残茬网格只在秸秆档长出来。冠层网格在扫过收割带后藏起来，不涂锈色。
        ${gate}
      } else {
        gg = mix(growthVis(stage + 0.2), growthVis(stage + 1.2), speck);
        if (stage < 1.5) gg = 0.;
        if (uPotOn > 0.5 && stage >= 1.5 && stage < 8.5 && !opened) {
          if (int(uCropP[c].z + 0.5) == 2) gg = 1.;
        }
        if (opened) gg = 0.;
        if (stage > 8.5) gg = 0.04;
      }
      if (holdSwept) gg = 0.;
      sc = gg;
    }
  }
  vec2 dw = abs(io.xz - uPlantWin.xy);
  float edge = 1. - smoothstep(uPlantWin.z * 0.72, uPlantWin.z, max(dw.x, dw.y));
  if (uCutOn > 0.5 && abs(io.x - uCut.x) < uCut.z + 0.5 && abs(io.z - uCut.y) < uCut.w + 0.5) edge = 0.;
  vec4 P = uCropP[c];
  float hs = P.x * pow(max(sc, 0.), 0.85) * edge, ws = P.w * 2.4 * (0.35 + 0.65 * sc) * edge;
  ${stubScale}
  transformed.xz *= ws; transformed.y *= hs;
  bool bPlant = abs(d.r - uBCrop) < 0.25;
  float visCol = d.g;
  if (bPlant && d.b >= 20.0 && jobSwept(uv, d.b)) visCol = floor(fract(d.a) * 100.0 + 0.5);
  bool strawCol = bPlant && visCol >= 6.5 && visCol < 8.5;
  float growB = clamp((visCol - 2.0) / 3.0, 0.0, 1.0);
  vCropCol = bPlant
    ? (strawCol ? ${strawTint} : mix(uBYoung, uBRipe, smoothstep(0.12, 0.9, growB)))
    : mix(uCropYoung[c], uCropRipe[c], smoothstep(0.45, 1.0, gg));
  if (bPlant) {
    // 冠层色已经按拉斯提卡写好。不要再掉进下面的杀秧锈色，也不混商品薯赭黄。
  } else if (uPotOn > 0.5 && int(P.z + 0.5) == 2 && stage >= 1.0) {
    int slot = int(clamp(stage, 1.0, 9.0));
    int nxt = int(min(float(slot) + 1.0, 9.0));
    float p0 = texelFetch(uPotTint, ivec2(2, slot), 0).r;
    float p1 = texelFetch(uPotTint, ivec2(2, nxt), 0).r;
    float pscale = stage < 1.5 ? 0.0 : mix(max(p0, 0.0), max(p1, 0.0), speck);
    transformed *= pscale;
    vCropCol = texelFetch(uPotTint, ivec2(1, speck > 0.5 && stage >= 1.5 ? nxt : slot), 0).rgb;
  } else {
    if (stage > 3.5 && stage < 4.5 && position.y > 0.48) vCropCol = vec3(0.76, 0.64, 0.86);
    if (stage > 4.5 && stage < 5.5) vCropCol = uCropStub[c];
  }
  ${sway}`)
    .replace('#include <project_vertex>', CURVE_PROJECT);
  if (!depth) s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCropCol;')
    .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vCropCol * 1.08; { float lm = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = max(mix(vec3(lm), diffuseColor.rgb, 1.15), 0.); }');
}
MAT.crop.onBeforeCompile = s => plantPatch(s, false, false);
const cropDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
cropDepth.onBeforeCompile = s => {   // 阴影也要按生长度和收割状态缩放（不弯曲：阴影坐标用未弯曲的世界）
  Object.assign(s.uniforms, U);
  plantPatch(s, true, false);
  s.vertexShader = s.vertexShader.replace(CURVE_PROJECT, '#include <project_vertex>');
};
const stubMat = MAT.crop.clone();
stubMat.onBeforeCompile = s => plantPatch(s, false, true);
const stubDepth = cropDepth.clone();
stubDepth.onBeforeCompile = s => {
  Object.assign(s.uniforms, U);
  plantPatch(s, true, true);
  s.vertexShader = s.vertexShader.replace(CURVE_PROJECT, '#include <project_vertex>');
};
const plantMeshes = {};
for (const sh of SHAPES) {
  const stub = sh === 'stubble';
  const im = new THREE.InstancedMesh(plantGeometry(sh), stub ? stubMat : MAT.crop, PLANT_CAP);
  im.count = 0; im.castShadow = !stub; im.receiveShadow = true; im.frustumCulled = false; im.customDepthMaterial = stub ? stubDepth : cropDepth;
  const col = new Float32Array(PLANT_CAP * 3); im.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
  scene.add(im); plantMeshes[sh] = im;
  im.userData.shape = sh;
}
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
let hseed = 1; const hr = () => (hseed = (hseed * 16807) % 2147483647) / 2147483647;
let plantWin = { x: 1e9, z: 1e9, w: 0, sig: '' };
function ownedLookSig() {
  let s = '';
  for (const f of fields) {
    if (!f.bUnit || (f.bUnit.look === 'hold' && !f.bUnit.sweep)) continue;
    s += f.idx + ':' + f.bUnit.look + ':' + (f.bUnit.sweep ? f.bUnit.sweep.look : '') + '|';
  }
  return s;
}
function rebuildPlants(cx, cz, W) {
  plantWin = { x: cx, z: cz, w: W, sig: ownedLookSig() };
  const counts = {}; for (const s of SHAPES) counts[s] = 0;
  const fi0 = Math.max(0, Math.floor((cx - W - L.X0) / (L.BP / L.PER)) - 1), fi1 = Math.min(NFX - 1, Math.floor((cx + W - L.X0) / (L.BP / L.PER)) + 1);
  const fj0 = Math.max(0, Math.floor((cz - W - L.Z0) / (L.BP / L.PER)) - 1), fj1 = Math.min(NFZ - 1, Math.floor((cz + W - L.Z0) / (L.BP / L.PER)) + 1);
  const potDraw = potatoDrawLooks();
  for (let j = fj0; j <= fj1; j++) for (let i = fi0; i <= fi1; i++) {
    const f = fields[j * NFX + i]; if (f.crop < 0) continue;
    if (viewLayer !== 'surface' && f.inPlot) continue;
    // hold 仍用生成时的旧作物，犁地扫过也不换成拉斯提卡株型。已经离开 hold 的田改用拉斯提卡的网格和株行距。
    const bActive = !!(f.bUnit && f.bUnit.look && f.bUnit.look !== 'hold');
    const vis = PLANT_CROPS.lastika.visual;
    const sweepLook = f.bUnit?.sweep?.look;
    // 残茬跟垄走：沿行距（跨行）和株距（沿垄，与收割趟同一条）铺。收割扫过才显示，没割的地方仍是冠层。
    const shapes = [];
    if (bActive) {
      if (f.bUnit.look === 'harvested' || sweepLook === 'harvested') shapes.push('stubble');
      if (f.bUnit.look === 'sown' || f.bUnit.look === 'mature' || sweepLook === 'sown') shapes.push('bush');
      if (!shapes.length) continue;
    } else shapes.push(CROPS[f.crop].shape);
    const xa = Math.max(f.x0, cx - W), xb = Math.min(f.x0 + L.FIELD, cx + W), za = Math.max(f.z0, cz - W), zb = Math.min(f.z0 + L.FIELD, cz + W);
    if (xa >= xb || za >= zb) continue;
    for (const shape of shapes) {
      const cr = bActive
        ? { id: 'lastika', shape, tex: vis.tex, row: potDraw.workshop ? potDraw.row : vis.row, along: potDraw.workshop ? potDraw.along : vis.along }
        : CROPS[f.crop];
      const im = plantMeshes[cr.shape];
      if (!im) continue;
      const rowS = cr.row * (cr.tex === 'beds' ? 1.1 : 1), al = cr.along;
      const potRow = cr.id === 'potato' && potDraw.workshop;
      const bWhole = bActive;
      let crestT = 0.5;
      if (potRow) {
        const slot = Math.max(1, Math.min(9, Math.floor(fieldVisual(f).g + 0.001)));
        const look = potDraw.slots[slot] || potDraw.slots[1];
        crestT = ridgeCrestT(look && look.ridge);
      }
      // 田内：u 沿垄（收割趟），v 跨行。世界坐标按田垄方向铺，残茬和冠层落在同一条垄顶上。
      const [ua, ub, va, vb] = f.dir === 0 ? [xa - f.x0, xb - f.x0, za - f.z0, zb - f.z0] : [za - f.z0, zb - f.z0, xa - f.x0, xb - f.x0];
      let v0 = Math.ceil(va / rowS) * rowS + rowS * 0.5;
      if (bWhole) {
        v0 = Math.ceil((va - 1e-4) / rowS) * rowS;
        if (v0 < va - 1e-4) v0 += rowS;
      } else if (potRow) {
        v0 = Math.ceil((va - crestT * rowS) / rowS) * rowS + crestT * rowS;
        if (v0 < va) v0 += rowS;
      }
      const alongJit = bWhole ? 0.12 : potRow ? 0.22 : 0.6;
      const acrossJit = bWhole ? 0.08 : potRow ? 0.06 : 0.18;
      hseed = f.idx * 7919 + 1;
      for (let v = v0; v < vb; v += rowS) {
        if (!bWhole && cr.tex !== 'beds' && cr.tex !== 'paddy' && Math.abs(((v % 24) + 24) % 24 - 12) < 1.4) continue; // 拖拉机道
        for (let u = Math.ceil(ua / al) * al; u < ub; u += al) {
          if (bWhole) {
            if (u < 1.6 || u > L.FIELD - 1.6 || v < 1.6 || v > L.FIELD - 1.6) continue;
          } else if (u < 6 || u > L.FIELD - 6) continue;      // 地头留给地面纹理
          const n = counts[cr.shape]; if (n >= PLANT_CAP) break;
          const ju = u + (hr() - 0.5) * al * alongJit, jv = v + (hr() - 0.5) * rowS * acrossJit;
          const x = f.dir === 0 ? f.x0 + ju : f.x0 + jv, z = f.dir === 0 ? f.z0 + jv : f.z0 + ju;
          const s = 0.8 + hr() * 0.4;
          const yj = 0.85 + hr() * 0.3;
          const rowAng = f.dir === 0 ? 0 : Math.PI / 2;
          const scv = shape === 'stubble' ? 1 : s;
          const scy = shape === 'stubble' ? 1 : s * yj;
          tmpM.compose(tmpP.set(x, 0, z), tmpQ.setFromAxisAngle(UP, bWhole ? rowAng : hr() * 6.283), tmpS.set(scv, scy, scv));
          im.setMatrixAt(n, tmpM);
          if (shape === 'stubble') im.instanceColor.setXYZ(n, 1, 0.94, 0.72);
          else { const j = 0.9 + hr() * 0.2; im.instanceColor.setXYZ(n, j, j * (0.97 + hr() * 0.06), j); }
          counts[cr.shape] = n + 1;
        }
      }
    }
  }
  for (const s of SHAPES) { const im = plantMeshes[s]; im.count = counts[s]; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

// ---------------- 硬表面资产：实例化 ----------------
function instanced(kit, cap, cast = true) {
  const out = {};
  for (const k of ['light', 'dark', 'glass', 'emis']) if (kit[k]) {
    const im = new THREE.InstancedMesh(kit[k], MAT[k], cap); im.count = 0; im.castShadow = cast && k !== 'emis'; im.receiveShadow = k !== 'emis'; im.frustumCulled = false;
    scene.add(im); out[k] = im;
  }
  return out;
}
function setInst(set, i, x, y, z, ang, s = 1) { tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromAxisAngle(UP, -ang), tmpS.set(s, s, s)); for (const k in set) set[k].setMatrixAt(i, tmpM); }
function setCount(set, n) { for (const k in set) { set[k].count = n; set[k].instanceMatrix.needsUpdate = true; } }
function staticMesh(kit) {
  const meshes = [];
  for (const k of ['light', 'dark', 'glass', 'emis']) if (kit[k]) {
    const m = new THREE.Mesh(kit[k], MAT[k]); m.castShadow = k !== 'emis'; m.receiveShadow = true; scene.add(m); meshes.push(m);
  }
  return meshes;
}

const HUBC = L.X0 + L.HUBX * L.BP + L.BLOCK / 2;  // 中枢区中心（= 0；z 方向同样是 0）
const HV = harvesterKit();
const H_NEAR = 80, PARKED = 14;
const harvSet = instanced(HV, H_NEAR + PARKED);
const RIG_CAP = 8;
const RIG_SKIP = new Set(['orbit_boom', 'drone_scout', 'drone_treat', 'device_drone_base']);
const rigMesh = {};
for (const id of Object.keys(surfaceKits)) {
  if (RIG_SKIP.has(id)) continue;
  rigMesh[id] = instanced(surfaceKits[id], RIG_CAP);
}
const boomSet = instanced(surfaceKits.orbit_boom, 1);
const edgeMat = curved(new THREE.MeshBasicMaterial({ color: C('harvest'), toneMapped: false, fog: false }));
edgeMat.polygonOffset = true; edgeMat.polygonOffsetFactor = -4; edgeMat.polygonOffsetUnits = -4;
const edgeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), edgeMat, 2048);
edgeMesh.count = 0; edgeMesh.frustumCulled = false; edgeMesh.castShadow = false; edgeMesh.receiveShadow = false;
edgeMesh.renderOrder = 3;
scene.add(edgeMesh);
const buildingSets = {
  warehouse: instanced(warehouseKit(), 8),
  garage: instanced(garageKit(), 8),
  process: instanced(processKit(), 8),
  shed: instanced(shedKit(), 8),
  drone_base: instanced(surfaceKits.device_drone_base, 4),
};
const millSet = instanced(processKit(), 2);
const parked = Array.from({ length: PARKED }, (_, n) => ({ x: HUBC + 85 + (n % 7) * 14.6, z: HUBC + 150 + Math.floor(n / 7) * 22, ang: -Math.PI / 2 }));
const haulSet = instanced(haulerKit(), haulers.length);
const droneSet = instanced(droneKit(), drones.length, false);
const workDroneMesh = {
  drone_scout: instanced(surfaceKits.drone_scout, 8, false),
  drone_treat: instanced(surfaceKits.drone_treat, 8, false),
};
// 小人：在中枢场地上散步
const people = Array.from({ length: 46 }, (_, n) => ({ x: HUBC - 120 + hr() * 260, z: HUBC - 60 + hr() * 200, a: hr() * 6.28, sp: 0.6 + hr() * 0.8 }));
const peopleSet = instanced(personKit(), people.length);
// 中枢雕塑换成工坊定稿的中枢地块。旧网格留在场景里但不再显示，仓棚仍是另一套实例。
const hubMeshes = (() => { const hk = hubKit(hr); for (const k in hk) if (hk[k]) hk[k].translate(HUBC, 0, HUBC); return staticMesh(hk); })();
for (const m of hubMeshes) m.visible = false;

const colony = makeColony({
  hemi, sun, scene, renderer: R, cam,
  zoneMat: new THREE.MeshBasicMaterial({ color: PALETTE.zone }),
  alertMat: new THREE.MeshBasicMaterial({ color: PALETTE.alert }),
  frozen: null,
  play: true,
});
const cultScale = L.BP / CULT_EMPTY.plot;
function blockCenter(bi, bj) {
  return { x: L.X0 + bi * L.BP + L.BLOCK / 2, z: L.Z0 + bj * L.BP + L.BLOCK / 2 };
}
function curveObject(root) {
  root.traverse(obj => {
    const list = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
    for (const m of list) {
      // 光晕点云以前不卷。镜头拉远、环带拱起来之后，点还停在平面坐标里，空地上会浮出一簇亮点。
      // 精灵没有这份 project_vertex，不能用同一套弯曲。
      if (!m || m.userData.colonyCurve || m.isSpriteMaterial) continue;
      m.userData.colonyCurve = true;
      curved(m);
    }
    if (obj.isMesh) obj.castShadow = obj.receiveShadow = false;
  });
}
function shareLabelMaterials(group) {
  const by = new Map();
  group.traverse(obj => {
    if (!obj.isMesh || obj.isInstancedMesh || !obj.material || Array.isArray(obj.material) || !obj.material.map) return;
    if (obj.material.type !== 'MeshBasicMaterial') return;
    const hit = by.get(obj.material.map.uuid);
    if (!hit) by.set(obj.material.map.uuid, obj.material);
    else obj.material = hit;
  });
}
function hiddenInTree(obj) {
  for (let p = obj; p; p = p.parent) if (!p.visible) return true;
  return false;
}
// 一个空单元有几百个网格。合成后再复制到其余地块，远处的地块可以整块剔除。
function packStatic(group) {
  shareLabelMaterials(group);
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse(obj => {
    if (!obj.isMesh || obj.isInstancedMesh || hiddenInTree(obj)) return;
    const mat = obj.material;
    if (!mat || Array.isArray(mat) || !obj.geometry) return;
    const geo = obj.geometry.clone();
    obj.updateWorldMatrix(true, false);
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, obj.matrixWorld));
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push({ geo, obj });
  });
  for (const [mat, items] of buckets) {
    const merged = mergeGeometries(items.map(i => i.geo), false);
    for (const i of items) i.geo.dispose();
    if (!merged) continue;
    for (const i of items) if (i.obj.parent) i.obj.parent.remove(i.obj);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mesh.receiveShadow = false;
    group.add(mesh);
  }
}
function seatPlot(group, bi, bj, y) {
  group.scale.set(cultScale, 1, cultScale);
  const at = blockCenter(bi, bj);
  group.position.set(at.x, y, at.z);
  curveObject(group);
  return at;
}

const hubArt = colony.buildHubPlot({ game: true });
hubArt.group.scale.set(cultScale, 1, cultScale);
hubArt.group.position.set(0, 0.15, 0);
hubArt.group.traverse(obj => { obj.frustumCulled = false; });
curveObject(hubArt.group);
scene.add(hubArt.group);
const elevatorProto = colony.buildTransferElevator();
const neighborShafts = [];
for (const site of HUB_SITES) {
  if (site.local) continue;
  const g = elevatorProto.clone(true);
  const at = seatPlot(g, site.bi, site.bj, 0.15);
  g.traverse(obj => { obj.frustumCulled = false; });
  scene.add(g);
  neighborShafts.push({ g, ...site, ...at });
}
function syncHubSection() {
  const sec = hubArt.sections.find(s => s.id === viewLayer) || hubArt.sections[0];
  hubArt.applySection(sec);
}

const cultRoot = new THREE.Group();
cultRoot.name = 'cult-deck';
cultRoot.visible = false;
scene.add(cultRoot);
const emptyArt = colony.buildCultPlot('a', { game: true });
packStatic(emptyArt.group);
const emptyGroups = new Map();
const grubInstalled = new Map();
let cultureSig = '';
const deckArtInfo = { grub: null, grubs: [], empty: null };
let seatedEmpty = false;
for (let bj = PLOT.bj0; bj <= PLOT.bj1; bj++) {
  for (let bi = PLOT.bi0; bi <= PLOT.bi1; bi++) {
    if (bi === L.HUBX && bj === L.HUBZ) continue;
    const group = seatedEmpty ? emptyArt.group.clone(true) : emptyArt.group;
    seatedEmpty = true;
    const at = seatPlot(group, bi, bj, LAYERS[1].floor);
    cultRoot.add(group);
    emptyGroups.set(bi + ':' + bj, group);
    if (!deckArtInfo.empty) deckArtInfo.empty = { ...at, bi, bj };
  }
}
function cultureKey(bi, bj) { return bi + ':' + bj; }
function syncCultureArt() {
  const live = new Set();
  for (const t of tanks) {
    if (!t.species) continue;
    const site = tankSite(t);
    if (!site || (site.bi === L.HUBX && site.bj === L.HUBZ)) continue;
    live.add(cultureKey(site.bi, site.bj));
  }
  for (const [key, group] of emptyGroups) group.visible = !live.has(key);
  for (const [key, art] of grubInstalled) art.group.visible = live.has(key);
  deckArtInfo.grubs = [];
  for (const key of live) {
    let art = grubInstalled.get(key);
    if (!art) {
      const [bi, bj] = key.split(':').map(Number);
      art = colony.buildGrubTrough({ game: true });
      const at = seatPlot(art.group, bi, bj, LAYERS[1].floor);
      art.group.traverse(obj => { obj.frustumCulled = false; });
      cultRoot.add(art.group);
      art.at = at;
      art.bi = bi;
      art.bj = bj;
      grubInstalled.set(key, art);
    }
    art.group.visible = true;
    const occ = art.group.userData.cult.occupied;
    const info = {
      ...art.at, bi: art.bi, bj: art.bj,
      pad: { n: occ.n, x: art.at.x + occ.x * cultScale, z: art.at.z + occ.z * cultScale },
      gantries: art.group.userData.grub.gantries,
      troughs: art.group.userData.grub.n,
    };
    deckArtInfo.grubs.push(info);
  }
  deckArtInfo.grub = deckArtInfo.grubs[0] || null;
}
// TODO: 门框照料机（龙门）台数是升级项。现在固定沙盒默认的 2 台。商店不卖 4 台这一档。
// TODO: 地块级照明跟最近一次开始的单元；弱光减产。见 harvestCulture。这里只把蛴螬地块画成弱光。
// 区站：每 3×3 区一座，位于主干走廊交叉口
let depotSet;
{ depotSet = instanced(depotKit(), depots.length); depots.forEach((d, i) => setInst(depotSet, i, d.x, 0, d.z, 0)); setCount(depotSet, depots.length); }
// 输送带走廊（中央 9×9 区内做成三维几何，外围只在地面着色器里画）
let convSegs = [], convSet = null, convAt = { x: 1e9, z: 1e9, on: false };
{
  const segs = [], R0 = 6;
  const near = (x, z) => Math.abs(x - HUBC) < L.BLOCK / 2 + 30 && Math.abs(z - HUBC) < L.BLOCK / 2 + 30;
  for (let t = 0; t <= L.NBZ; t++) for (let p = TRUNKS_X[L.HUBX - R0] + 20; p < TRUNKS_X[L.HUBX + R0 + 1] - 20; p += 40) if (!near(p, TRUNKS_Z[t])) segs.push([p, TRUNKS_Z[t], 0]);      // 沿环
  for (let t = L.HUBX - R0; t <= L.HUBX + R0 + 1; t++) for (let p = TRUNKS_Z[0] + 20; p < TRUNKS_Z[L.NBZ] - 20; p += 40) if (!near(TRUNKS_X[t], p)) segs.push([TRUNKS_X[t], p, Math.PI / 2]);   // 跨环
  convSegs = segs; convSet = instanced(conveyorKit(), segs.length);
}
function inOwnPlot(x, z) {
  const wx = wrapX(x);
  return wx >= PLOT.x0 && wx <= PLOT.x1 && z >= PLOT.z0 && z <= PLOT.z1;
}
function syncDepots() {
  const open = viewLayer !== 'surface';
  let n = 0;
  for (const d of depots) {
    if (open && inOwnPlot(d.x, d.z)) continue;
    setInst(depotSet, n++, d.x, 0, d.z, 0);
  }
  setCount(depotSet, n);
}
// 只实例化镜头附近 1.8 km 内的段落；轨道层（>1800 m）完全不画，地面着色器里的输送带基座足够
function updateConveyors(d) {
  if (d > 1600) { if (convAt.on) { setCount(convSet, 0); convAt.on = false; } return; }
  if (convAt.on && Math.hypot(camS.x - convAt.x, camS.z - convAt.z) < Math.min(300, d * 0.4 + 60) && Math.abs(d - convAt.d) < d * 0.3) return;
  const W = Math.min(1100, d * 0.85 + 250);
  let n = 0; for (const [x, z, a] of convSegs) if (Math.abs(x - camS.x) < W && Math.abs(z - camS.z) < W && !inCut(x, z, 22) && !(viewLayer !== 'surface' && inOwnPlot(x, z))) setInst(convSet, n++, x, 0, z, a);
  setCount(convSet, n); convAt = { x: camS.x, z: camS.z, on: true, d };
}

// 传感灯杆（每个路口一根，14 m，低角度阳光下投出 30+ m 的细长影子）与平移式喷灌桁架（生长中的田）——只在镜头附近实例化
const MAST_CAP = 1600, IRR_CAP = 80;
const mastSet = instanced(mastKit(), MAST_CAP), irrSet = instanced(irrigatorKit(), IRR_CAP);
let infraAt = { x: 1e9, z: 1e9 }; const irrigs = [];
function rebuildInfra(cx, cz) {
  infraAt = { x: cx, z: cz }; let n = 0; const R0 = 1500;
  const xs = ROADS.filter(r => Math.abs(r - cx) < R0), zs = ROADS.filter(r => Math.abs(r - cz) < R0 && r > RING.Z_IN && r < RING.Z_OUT);
  for (const x of xs) for (const z of zs) { if (n >= MAST_CAP) break; if (inCut(x, z, 6) || (Math.abs(x - HUBC) < 270 && Math.abs(z - HUBC) < 270) || (viewLayer !== 'surface' && inOwnPlot(x, z))) continue; setInst(mastSet, n++, x + 2.5, 0, z + 2.5, 0); }
  setCount(mastSet, n);
  irrigs.length = 0;
  for (const f of fields) { if (irrigs.length >= IRR_CAP) break; if (f.crop < 0 || Math.abs(f.x0 + 64 - cx) > R0 || Math.abs(f.z0 + 64 - cz) > R0 || inCut(f.x0 + 64, f.z0 + 64, 90)) continue; if (viewLayer !== 'surface' && f.inPlot) continue; if (((f.i * 7 + f.j * 13) % 9) === 0 && !inCrater(f.x0 + 64, f.z0 + 64, 80)) irrigs.push({ f, ph: (f.i * 0.37 + f.j * 0.71) % 1 }); }
}
// ---------------- 剖面（C 键）：台阶状剖切盒，露出地下培育层与设备层 ----------------
// 每一层的内容由 DECK_BUILDERS[layer.content] 生成；以后加「水处理层」「仓储层」等，只需在 LAYERS 里加一项并在这里写一个函数
const RACK_CAP = 2600, MOD_CAP = 80, PIPE_CAP = 60, CART_CAP = 30, CREW_CAP = 60;
const rackSet = instanced(growRackKit(), RACK_CAP), tankSet = instanced(tankKit(), MOD_CAP), pumpSet = instanced(pumpKit(), MOD_CAP), pipeSet = instanced(pipeRackKit(), PIPE_CAP);
const cultureSet = instanced(cultureTankKit(), 8), armSet = instanced(armKit(), 1), deckLightSet = instanced(deckLightKit(), 8);
for (const set of [cultureSet, armSet, deckLightSet]) for (const k in set) set[k].receiveShadow = false;
if (cultureSet.light) cultureSet.light.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(8 * 3), 3);
let tankPos = [], armX = 0, armReady = false, armOrder = null;
const railGeo = new THREE.BoxGeometry(1, 0.16, 0.22);
{ const c = C('haze'), n = railGeo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); railGeo.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
const railMesh = new THREE.Mesh(railGeo, MAT.light); railMesh.castShadow = true; railMesh.visible = false; railMesh.frustumCulled = false; scene.add(railMesh);
const cableGeo = new THREE.BoxGeometry(1, 0.1, 0.12);
{ const c = C('metalDk'), n = cableGeo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); cableGeo.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
const cableMesh = new THREE.Mesh(cableGeo, MAT.dark); cableMesh.visible = false; cableMesh.frustumCulled = false; scene.add(cableMesh);
function cellCenter(bi, bj, fi, fj) {
  const [x0, z0] = fieldOrigin(bi * L.PER + fi, bj * L.PER + fj);
  return { x: x0 + L.FIELD / 2, z: z0 + L.FIELD / 2, y: LAYERS[1].floor };
}
function placeTanks() {
  const y = LAYERS[1].floor;
  tankPos = [];
  for (let i = 0; i < tanks.length; i++) {
    const c = tankSite(tanks[i]) || { bi: L.HUBX + 1, bj: L.HUBZ, fi: 1, fj: 1 };
    const at = tanks[i].species || Number.isInteger(tanks[i].bi) ? cellCenter(c.bi, c.bj, c.fi ?? 1, c.fj ?? 1) : { x: 1e9, z: 1e9, y };
    tankPos.push(at);
    setInst(cultureSet, i, at.x, y, at.z, 0);
    const spec = CULTURES.find(c => c.id === tanks[i].species);
    const tint = !spec ? C('rego') : spec.id === 'bsf' ? C('sage') : C('ochre');
    if (cultureSet.light) cultureSet.light.setColorAt(i, tint);
    setInst(deckLightSet, i, at.x, y, at.z - L.FIELD / 2 - L.ROAD / 2, 0);
  }
  if (cultureSet.light?.instanceColor) cultureSet.light.instanceColor.needsUpdate = true;
  setCount(cultureSet, tanks.length);
  setCount(deckLightSet, tanks.length);
  if (!armReady && tankPos[0]) { armX = tankPos[0].x; armReady = true; }
  if (tankPos.length > 1) {
    const z = tankPos[0].z - L.FIELD / 2 - L.ROAD / 2;
    const span = Math.abs(tankPos[tankPos.length - 1].x - tankPos[0].x) + 18;
    const mid = (tankPos[0].x + tankPos[tankPos.length - 1].x) / 2;
    railMesh.scale.set(span, 1, 1);
    railMesh.position.set(mid, y + 4.62, z);
    cableMesh.scale.set(span, 1, 1);
    cableMesh.position.set(mid, y + 0.2, z);
  }
  setInst(armSet, 0, armX, y, (tankPos[0] ? tankPos[0].z - L.FIELD / 2 - L.ROAD / 2 : 0), Math.PI / 2);
  setCount(armSet, tankPos.length ? 1 : 0);
}
function cellAt(x, z) {
  const qx = wrapX(x) - L.X0, qy = z - L.Z0;
  const bx = Math.floor(qx / L.BP), by = Math.floor(qy / L.BP);
  if (by < 0 || by >= L.NBZ || bx < 0 || bx >= L.NBX) return null;
  if (bx < PLOT.bi0 || bx > PLOT.bi1 || by < PLOT.bj0 || by > PLOT.bj1) return null;
  const blx = qx - bx * L.BP, bly = qy - by * L.BP;
  if (blx < 0 || bly < 0 || blx > L.BLOCK || bly > L.BLOCK) return null;
  const pitch = L.FIELD + L.ROAD;
  const fi = Math.floor(blx / pitch), fj = Math.floor(bly / pitch);
  if (fi < 0 || fi >= L.PER || fj < 0 || fj >= L.PER) return null;
  if (blx - fi * pitch > L.FIELD || bly - fj * pitch > L.FIELD) return null;
  const i = bx * L.PER + fi, j = by * L.PER + fj;
  const [x0, z0] = fieldOrigin(i, j);
  let tank = -1;
  const cx = x0 + L.FIELD / 2, cz = z0 + L.FIELD / 2;
  for (let t = 0; t < tankPos.length; t++) if (Math.abs(tankPos[t].x - cx) < 2 && Math.abs(tankPos[t].z - cz) < 2) tank = t;
  return { i, j, x0, z0, x1: x0 + L.FIELD, z1: z0 + L.FIELD, hub: bx === L.HUBX && by === L.HUBZ, bi: bx, bj: by, tank };
}
placeTanks();
function orderArm(id, job) {
  if (!tankPos[id]) return;
  const near = Math.abs(armX - tankPos[id].x) < 1.2;
  armOrder = { id, job, t: 0, phase: near ? 'act' : 'move' };
}
rackSet.light.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RACK_CAP * 3), 3);
const cartSet = instanced(haulerKit(), CART_CAP), crewSet = instanced(personKit(), CREW_CAP);
const deckSlabs = new THREE.Group(); scene.add(deckSlabs);
const RACK_COLS = ['sage', 'moss', 'oliveDp', 'tealGy', 'olive'].map(k => C(k).multiplyScalar(1.05));
const deckCarts = [], deckCrew = [];
const DECK_BUILDERS = {
  // 培育层：成排立体栽培架（12 m 一段），每 6 排一条 6 m 主通道，通道里有 AGV 小车和巡检人员
  protein() { placeTanks(); },
  racks(L0, rects) {
    let n = 0; const y = L0.floor;
    for (const [x0, x1, z0, z1] of rects) {
      let row = 0;
      for (let z = z0 + 3.2; z < z1 - 2; z += 3.4, row++) {
        if (row % 7 === 6) { if (deckCarts.length < CART_CAP && x1 - x0 > 60) deckCarts.push({ x0: x0 + 6, x1: x1 - 6, z: z - 0.4, y, p: Math.random(), sp: 0.02 + Math.random() * 0.02 }); z += 2.6; continue; }
        const col = RACK_COLS[Math.floor(Math.abs(Math.sin(z * 0.37 + x0 * 0.11)) * 4.99)];
        for (let x = x0 + 8; x < x1 - 7; x += 12) { if (n >= RACK_CAP) break; setInst(rackSet, n, x, y, z, 0); rackSet.light.setColorAt(n, col); n++; }
      }
      for (let k = 0; k < 10 && deckCrew.length < CREW_CAP; k++) deckCrew.push({ x: x0 + 10 + Math.random() * (x1 - x0 - 20), z: z0 + 4 + Math.random() * (z1 - z0 - 8), y, a: Math.random() * 6.28 });
    }
    setCount(rackSet, n); rackSet.light.instanceColor.needsUpdate = true;
  },
  // 设备层：储液罐组与泵站交错排布，中间是沿环向的管廊
  machinery(L0, rects) {
    let nt = 0, np = 0, nq = 0; const y = L0.floor;
    for (const [x0, x1, z0, z1] of rects) {
      let r = 0;
      for (let z = z0 + 16; z < z1 - 12; z += 34, r++) {
        for (let x = x0 + 14, c = 0; x < x1 - 10; x += 26, c++) {
          if ((c + r) % 3 === 2) { if (np < MOD_CAP) setInst(pumpSet, np++, x, y, z, ((c * 7 + r) % 2) * Math.PI); }
          else if (nt < MOD_CAP) setInst(tankSet, nt++, x, y, z, 0);
        }
        for (let x = x0 + 14; x < x1 - 10 && z + 17 < z1 - 6; x += 26) if (nq < PIPE_CAP) setInst(pipeSet, nq++, x, y, z + 17, 0);
      }
      for (let k = 0; k < 8 && deckCrew.length < CREW_CAP; k++) deckCrew.push({ x: x0 + 8 + Math.random() * (x1 - x0 - 16), z: z0 + 6 + Math.random() * (z1 - z0 - 12), y, a: Math.random() * 6.28 });
    }
    setCount(tankSet, nt); setCount(pumpSet, np); setCount(pipeSet, nq);
  },
};
// 剖切面材质：按深度画出地层——表土 / 结构板（建筑剖面式斜线填充）/ 层内空间（透出层里的设备与灯）
const secMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide });
secMat.onBeforeCompile = (sh) => {
  sh.uniforms.uCurve = U.uCurve; sh.uniforms.uNight = U.uNight;
  for (const k in GC) sh.uniforms['g_' + k] = { value: GC[k] };
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + CURVE_DECL + '\nattribute float sa; varying float vSa; varying vec3 vWP;')
    .replace('#include <project_vertex>', CURVE_PROJECT + '\nvSa = sa; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vSa; varying vec3 vWP; uniform float uNight;
${Object.keys(GC).map(k => 'uniform vec3 g_' + k + ';').join('\n')}
${NOISE}
float aaL(float x, float w){ float fw = fwidth(x); return 1. - smoothstep(w - fw, w + fw, abs(x)); }
vec3 sEm = vec3(0.);
vec3 secAlbedo(){
  float y = vWP.y, a = vSa;
  vec3 col;
  float hat = aaL(fract((a + y) / 1.4) - .5, 0.07);
  if (y > -1.3) { col = g_soil * (0.75 + 0.5 * vnoise(vec2(a * 1.3, y * 5.))); }
  else if (y > ${LAYERS[1].top.toFixed(2)} || (y < ${LAYERS[1].floor.toFixed(2)} && y > ${LAYERS[2].top.toFixed(2)})) { col = mix(g_regoLt, g_haze, 0.35) * (1. - 0.32 * hat); }
  else if (y > ${LAYERS[1].floor.toFixed(2)}) {                  // 培育层空间：架子端头 + 每层灯带
    col = g_deep * 0.6; float sl = fract(a / 3.4); float rack = step(0.18, sl) * step(sl, 0.56);
    float yy = y - ${LAYERS[1].floor.toFixed(2)}; float tier = fract((yy - 0.45) / 1.05);
    if (rack > 0.5 && yy < 6.8) { col = mix(g_metalDk, g_tealGy * 1.2, step(tier, 0.35)); sEm += g_paper * step(0.86, tier) * step(tier, 0.93) * 1.8; }
  } else {                                                       // 设备层空间：管线 + 指示灯
    col = g_deep * 0.55; float yy = y - ${LAYERS[2].floor.toFixed(2)};
    col = mix(col, g_metalDk * 1.3, max(aaL(yy - 8.8, 0.7), aaL(yy - 6., 0.4)));
    sEm += g_data * aaL(fract(a / 18.) - .5, 0.02) * aaL(yy - 3., 0.3) * 2.;
  }
  col *= 1. - 0.45 * max(aaL(y + 1.3, 0.06), max(aaL(y - ${LAYERS[1].top.toFixed(2)}, 0.08), aaL(y - ${LAYERS[2].top.toFixed(2)}, 0.08)));
  return col;
}`)
    .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = secAlbedo();')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += sEm;');
};
const floorMat = MAT.dark;
function buildCut() {
  deckSlabs.clear(); deckCarts.length = 0; deckCrew.length = 0;
  for (const s2 of [rackSet, tankSet, pumpSet, pipeSet, cultureSet, armSet]) setCount(s2, 0);
  if (!cut.on) return;
  const ax0 = cut.x - CUT.AX, ax1 = cut.x + CUT.AX, az0 = cut.z - CUT.AZ, az1 = cut.z + CUT.AZ, I = cutInner();
  const G = LAYERS[1], E = LAYERS[2];
  // 剖切面（四周竖直面，朝向坑内）
  const pos = [], nor = [], sa = [];
  const wall = (xa, za, xb, zb, y0, y1, nx, nz) => { const len = Math.hypot(xb - xa, zb - za), o = nx !== 0 ? za : xa;
    const q = pushQuad([], [xa, y0, za, 0], [xb, y0, zb, len], [xb, y1, zb, len], [xa, y1, za, 0], [nx, 0, nz]);
    for (const [px, py, pz, s3] of q) { pos.push(px, py, pz); nor.push(nx, 0, nz); sa.push(s3 + o); } };
  const box = (x0, x1, z0, z1, y0, y1) => { wall(x0, z0, x1, z0, y0, y1, 0, 1); wall(x0, z1, x1, z1, y0, y1, 0, -1); wall(x0, z0, x0, z1, y0, y1, 1, 0); wall(x1, z0, x1, z1, y0, y1, -1, 0); };
  box(ax0, ax1, az0, az1, 0, G.floor);
  box(I.x0, I.x1, I.z0, I.z1, G.floor, E.floor);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); sg.setAttribute('sa', new THREE.Float32BufferAttribute(sa, 1));
  const sm = new THREE.Mesh(sg, secMat); sm.castShadow = sm.receiveShadow = true; sm.frustumCulled = false; deckSlabs.add(sm);
  // 地板：培育层 = 外圈盒减去内圈盒（4 块），设备层 = 内圈盒
  const growRects = [[ax0, I.x0, az0, az1], [I.x1, ax1, az0, az1], [I.x0, I.x1, az0, I.z0], [I.x0, I.x1, I.z1, az1]].filter(r => r[1] - r[0] > 1 && r[3] - r[2] > 1);
  const slab = (x0, x1, z0, z1, y, col) => { const g = new THREE.BoxGeometry(x1 - x0, 0.6, z1 - z0); const c = C(col), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); const m = new THREE.Mesh(g, floorMat); m.position.set((x0 + x1) / 2, y - 0.3, (z0 + z1) / 2); m.receiveShadow = true; m.frustumCulled = false; deckSlabs.add(m); };
  for (const r of growRects) slab(...r, G.floor, 'regoDk');
  slab(I.x0, I.x1, I.z0, I.z1, E.floor, 'metalDk');
  DECK_BUILDERS[G.content](G, growRects);
  DECK_BUILDERS[E.content](E, [[I.x0, I.x1, I.z0, I.z1]]);
}
function setCut(on, x, z) {
  cut.on = on;
  if (on) {
    cut.x = Math.round(x / 2) * 2; cut.z = Math.max(RING.Z_IN + CUT.AZ + 10, Math.min(RING.Z_OUT - CUT.AZ - 10, Math.round(z / 2) * 2));
    if (Math.abs(cut.x - HUBC) < 300 + CUT.AX && Math.abs(cut.z - HUBC) < 300 + CUT.AZ) cut.x = HUBC + 300 + CUT.AX + 40;   // 不挖中枢
  }
  U.uCut.value.set(cut.x, cut.z, CUT.AX, CUT.AZ); U.uCutOn.value = on ? 1 : 0;
  buildCut(); infraAt = { x: 1e9, z: 1e9 }; convAt.on = false; plantWin = { x: 1e9, z: 1e9, w: 0 };
  document.body.classList.toggle('cutaway', on);
}
// 下到培育层时，只揭开玩家自己这块地表。断面沿田区四边，从地表落到当前层的地板。
const plotSection = new THREE.Group(); plotSection.visible = false; scene.add(plotSection);
function buildPlotSection() {
  plotSection.clear();
  const y1 = 0.05, yLip = -2.05, y0 = layerFloor() - 0.15;
  if (!(y0 < -1)) return;
  const x0 = PLOT.x0, x1 = PLOT.x1, z0 = PLOT.z0, z1 = PLOT.z1;
  const T = 22;
  const pos = [], nor = [], sa = [];
  const push = (verts, nrm) => {
    const q = pushQuad([], ...verts, nrm);
    for (const [px, py, pz, s3] of q) { pos.push(px, py, pz); nor.push(nrm[0], nrm[1], nrm[2]); sa.push(s3); }
  };
  const run = (xa, za, xb, zb, nx, nz) => {
    const len = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.ceil(len / 64));
    const ix = nx, iz = nz;
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n;
      const ax = xa + (xb - xa) * a, az = za + (zb - za) * a;
      const bx = xa + (xb - xa) * b, bz = za + (zb - za) * b;
      const sA = a * len, sB = b * len;
      push([[ax, y0, az, sA], [bx, y0, bz, sB], [bx, y1, bz, sB], [ax, y1, az, sA]], [nx, 0, nz]);
      const ax2 = ax + ix * T, az2 = az + iz * T, bx2 = bx + ix * T, bz2 = bz + iz * T;
      push([[ax2, yLip, az2, sA], [bx2, yLip, bz2, sB], [bx, yLip, bz, sB], [ax, yLip, az, sA]], [0, 1, 0]);
    }
  };
  run(x0, z0, x1, z0, 0, 1);
  run(x1, z1, x0, z1, 0, -1);
  run(x0, z1, x0, z0, 1, 0);
  run(x1, z0, x1, z1, -1, 0);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  sg.setAttribute('sa', new THREE.Float32BufferAttribute(sa, 1));
  const sm = new THREE.Mesh(sg, secMat);
  sm.castShadow = sm.receiveShadow = true; sm.frustumCulled = false;
  plotSection.add(sm);
}

// ---------------- 远景：信号点（收割机 = 橙，无人机 = 青）、区站图标、网络线 ----------------
const dotGeo = new THREE.BufferGeometry();
const DOTN = harvesters.length + drones.length + signals.length;
const dotPos = new Float32Array(DOTN * 3), dotCol = new Float32Array(DOTN * 3);
dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3)); dotGeo.setAttribute('color', new THREE.BufferAttribute(dotCol, 3));
{ const ch = C('harvest').multiplyScalar(4), cd = C('data').multiplyScalar(1.6); const sig0 = harvesters.length + drones.length; for (let i = 0; i < DOTN; i++) { const c = (i < harvesters.length || i >= sig0) ? ch : cd; dotCol.set([c.r, c.g, c.b], i * 3); } }
signals.forEach((s, i) => dotPos.set([s.x, 4, s.z], (harvesters.length + drones.length + i) * 3));
const pointMat = (size) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false,
  uniforms: { uCurve: U.uCurve, uA: { value: 0 }, uSize: { value: size }, uPR: { value: R.getPixelRatio() } },
  vertexShader: `${CURVE_DECL} uniform float uSize, uPR; varying vec3 vC; varying float vF; attribute vec3 color;
    void main(){ vC = color; vec4 w = curveWorld(modelMatrix * vec4(position, 1.)); vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv; gl_PointSize = uSize * uPR; vF = exp(-pow(-mv.z * 0.00011, 2.)); }`,
  fragmentShader: `uniform float uA; varying vec3 vC; varying float vF; void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = smoothstep(1., .2, d); gl_FragColor = vec4(vC, a * uA * vF); }`,
});
const dots = new THREE.Points(dotGeo, pointMat(3.2)); dots.frustumCulled = false; dots.renderOrder = 5; scene.add(dots);
// 区站图标：细圆环 + 鲑鱼粉光晕（Per Aspera 式「图标 + 影响范围」）
const iconGeo = new THREE.BufferGeometry();
{ const a = new Float32Array((depots.length + 1) * 3); depots.forEach((d, i) => a.set([d.x, 2, d.z], i * 3)); a.set([HUBC, 2, HUBC], depots.length * 3); iconGeo.setAttribute('position', new THREE.BufferAttribute(a, 3)); }
const iconMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false, fog: false,
  uniforms: { uCurve: U.uCurve, uA: { value: 0 }, uPR: { value: R.getPixelRatio() }, uRing: { value: C('paper').multiplyScalar(1.4) }, uHalo: { value: C('zone') } },
  vertexShader: `${CURVE_DECL} uniform float uPR; void main(){ vec4 w = curveWorld(modelMatrix * vec4(position, 1.)); gl_Position = projectionMatrix * viewMatrix * w; gl_PointSize = 26. * uPR; }`,
  fragmentShader: `uniform float uA; uniform vec3 uRing, uHalo; void main(){ float d = length(gl_PointCoord - .5) * 2.;
    float ring = smoothstep(0.06, 0.0, abs(d - 0.36)) ; float core = smoothstep(0.14, 0.08, d); float halo = (1. - smoothstep(0.3, 1.0, d)) * 0.22;
    vec3 c = uHalo * halo + uRing * (ring + core); float a = max(max(ring, core), halo); gl_FragColor = vec4(c / max(a, 1e-3), a * uA); }`,
});
const icons = new THREE.Points(iconGeo, iconMat); icons.frustumCulled = false; icons.renderOrder = 6; scene.add(icons);
let netMesh = null;
// 物流网络线：区站 → 中枢沿主干走廊，宽度按屏幕像素恒定，带流动的虚线
const netMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false,
  uniforms: { uCurve: U.uCurve, uA: { value: 0 }, uW: { value: 1 }, uTime: U.uTime, uCol: { value: C('zone').multiplyScalar(1.1) }, uCol2: { value: C('haze') } },
  vertexShader: `${CURVE_DECL} uniform float uW; attribute vec2 side; attribute float along; attribute float kind; varying float vAl; varying float vK; varying float vS;
    void main(){ vec3 p = position; p.xz += side * uW * (kind > .5 ? 1.0 : 0.55); vAl = along; vK = kind; vS = sign(side.x + side.y);
      vec4 w = curveWorld(modelMatrix * vec4(p, 1.)); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uA, uTime; uniform vec3 uCol, uCol2; varying float vAl; varying float vK;
    void main(){ float dash = step(0.45, fract(vAl / 120. - uTime * 0.5)); vec3 c = vK > .5 ? uCol : uCol2;
      float a = vK > .5 ? (0.55 + 0.45 * dash) : 0.38; gl_FragColor = vec4(c, a * uA); }`,
});
{
  const pos = [], side = [], along = [], kind = [];
  const seg = (x1, z1, x2, z2, k) => {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len;
    const steps = Math.max(1, Math.ceil(len / 200));
    for (let s = 0; s < steps; s++) {
      const a = s / steps, b = (s + 1) / steps, ax = x1 + dx * a, az = z1 + dz * a, bx = x1 + dx * b, bz = z1 + dz * b;
      for (const [px, pz, sd, al] of [[ax, az, 1, a], [ax, az, -1, a], [bx, bz, 1, b], [ax, az, -1, a], [bx, bz, -1, b], [bx, bz, 1, b]]) { pos.push(px, 3, pz); side.push(nx * sd, nz * sd); along.push(al * len); kind.push(k); }
    }
  };
  // 环形主干：沿中枢旁的环向走廊绕环一整圈（远景里能看到它顺着环带拱顶爬上天空）；各区站沿跨环走廊接入
  const spine = TRUNKS_Z[L.HUBZ], x0 = L.X0, x1 = L.X0 + RING.CIRC;
  seg(x0, spine, x1, spine, 1);
  for (const d of depots) seg(d.x, d.z, d.x, spine, 1);
  seg(HUBC, HUBC, HUBC, spine, 1);
  for (const z of [TRUNKS_Z[0], TRUNKS_Z[L.NBZ]]) seg(x0, z, x1, z, 0);
  for (let a = 0; a <= L.NBX; a += 6) seg(TRUNKS_X[a], TRUNKS_Z[0], TRUNKS_X[a], TRUNKS_Z[L.NBZ], 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('side', new THREE.Float32BufferAttribute(side, 2));
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1)); g.setAttribute('kind', new THREE.Float32BufferAttribute(kind, 1));
  const m = new THREE.Mesh(g, netMat); m.frustumCulled = false; m.renderOrder = 4; scene.add(m); netMesh = m;
}
// 收割尾迹：谷壳 / 尘土（只给近处的收割机）
const DUSTN = 2400, dustPos = new Float32Array(DUSTN * 3), dustLife = new Float32Array(DUSTN), dustVel = new Float32Array(DUSTN * 3);
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3)); dustGeo.setAttribute('life', new THREE.BufferAttribute(dustLife, 1));
const dustMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uCurve: U.uCurve, uCol: { value: C('straw') }, uPR: { value: R.getPixelRatio() }, uSun: { value: 3.0 } },
  vertexShader: `${CURVE_DECL} attribute float life; uniform float uPR; varying float vL; void main(){ vL = life; vec4 mv = viewMatrix * curveWorld(modelMatrix * vec4(position, 1.)); gl_Position = projectionMatrix * mv; gl_PointSize = uPR * (1.2 + (1. - life) * 7.) * 60. / -mv.z; }`,
  fragmentShader: `uniform vec3 uCol; uniform float uSun; varying float vL; void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = smoothstep(1., .0, d) * vL * vL * 0.55; gl_FragColor = vec4(uCol * uSun * 0.4, a); }`,
});
const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; scene.add(dust);
let dustI = 0;
function emitDust(x, z, ang) {
  const i = dustI; dustI = (dustI + 1) % DUSTN;
  const bx = -Math.cos(ang), bz = -Math.sin(ang);
  dustPos.set([x + bx * 5 + (Math.random() - 0.5) * 2, 1.5 + Math.random(), z + bz * 5 + (Math.random() - 0.5) * 2], i * 3);
  dustVel.set([bx * 3 + (Math.random() - 0.5) * 3, 1.2 + Math.random() * 1.5, bz * 3 + (Math.random() - 0.5) * 3], i * 3);
  dustLife[i] = 1;
}

// ---------------- 镜头：连续缩放，俯角随距离变化（近 35° → 中 55° → 远处压低露出地平线） ----------------
const PITCH = [[22, 33], [70, 40], [260, 52], [900, 56], [2000, 46], [4500, 21], [9000, 16]];
function pitchOf(d) {
  const ld = Math.log(d);
  for (let i = 0; i < PITCH.length - 1; i++) { const [d0, p0] = PITCH[i], [d1, p1] = PITCH[i + 1]; if (d <= d1) { const t = Math.min(1, Math.max(0, (ld - Math.log(d0)) / (Math.log(d1) - Math.log(d0)))); const s = t * t * (3 - 2 * t); return (p0 + (p1 - p0) * s) * DEG; } }
  return PITCH[PITCH.length - 1][1] * DEG;
}
const camS = { x: HUBC, z: HUBC, y: 0, d: 4200, yaw: 0, pOff: 0, lookUp: 0, fovAdd: 0, deck: false }, camT = { ...camS };
let viewLayer = 'surface';
let poseLock = null;
let followLock = null;
buildPlotSection();
function layerNow() { return LAYERS.find(l => l.id === viewLayer) || LAYERS[0]; }
function layerFloor() { return layerNow().floor; }
// 环带：拉远时镜头逐渐抬头、视角变宽 → 看到环带在前方升起、在天空中拱起，两侧是环壁，环壁外是太空与母星
function placeCamera() {
  if (poseLock) {
    cam.up.set(0, 1, 0);
    cam.position.set(poseLock.x, poseLock.y, poseLock.z);
    cam.lookAt(poseLock.lx, poseLock.ly, poseLock.lz);
    cam.fov = poseLock.fov ?? 32;
    cam.near = poseLock.near ?? 0.5;
    cam.far = poseLock.far ?? (2.6 * RING.R + 6000);
    cam.updateProjectionMatrix();
    return;
  }
  const baseY = layerFloor();
  const p = pitchOf(camS.d) + camS.pOff;
  cam.position.set(camS.x + Math.sin(camS.yaw) * Math.cos(p) * camS.d, baseY + Math.sin(p) * camS.d, camS.z + Math.cos(camS.yaw) * Math.cos(p) * camS.d);
  cam.lookAt(camS.x, baseY, camS.z);
  const far01 = THREE.MathUtils.smoothstep(camS.d, 1500, 5200);
  cam.rotateX((far01 * 25 + camS.lookUp) * DEG);
  cam.fov = 30 + 24 * far01 + camS.fovAdd;
  cam.near = Math.max(0.25, camS.d * 0.012); cam.far = 2.6 * RING.R + 6000; cam.updateProjectionMatrix();
}
function setShown(obj, on) {
  if (!obj) return;
  if (obj.isObject3D) { obj.visible = on; return; }
  for (const k in obj) if (obj[k] && obj[k].isObject3D) obj[k].visible = on;
}
function applyDeckView() {
  const on = viewLayer !== 'surface';
  const grow = viewLayer === 'grow';
  camS.deck = camT.deck = on;
  ground.visible = true;
  U.uOpen.value = on ? 1 : 0;
  plotSection.visible = on;
  deckFloor.visible = on && viewLayer !== 'grow';
  deckFloor.position.y = layerFloor();
  for (const m of hubMeshes) m.visible = false;
  setShown(peopleSet, !on);
  for (const k in buildingSets) setShown(buildingSets[k], !on);
  setShown(millSet, grow);
  for (const k in rigMesh) setShown(rigMesh[k], !on);
  setShown(boomSet, !on);
  setShown(workDroneMesh, !on);
  setShown(edgeMesh, !on);
  if (netMesh) netMesh.visible = !on;
  icons.visible = !on;
  deckSlabs.visible = !on && !!cut.on;
  setShown(cultureSet, false);
  setShown(armSet, !!cut.on && !grow);
  setShown(deckLightSet, false);
  railMesh.visible = false;
  cableMesh.visible = false;
  cultRoot.visible = grow;
  syncHubSection();
  document.body.classList.toggle('underground', on);
}
// 交互：左键平移 / 右键旋转 / 滚轮缩放 / WASD / QE / N 昼夜 / M 地图模式 / H 隐藏界面
let drag = null, ptr = null, selected = null, selNote = '', plantOpen = false, prepOpen = false;
let mode = 'look', watchRig = null, pickedLot = null, pickedStack = null, shopPick = 'seed', rigPick = 'planter', cropPick = 'potato', deckTank = 0, deckBlock = null, deckHub = false, buildAct = 'place', buildKind = 'warehouse', buildPick = null, millPlace = false;
let planCycle = false, planBuy = false;
const pickedFields = new Set();
const raycaster = new THREE.Raycaster();
function pickFlat(cx, cy) {
  const ndc = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, cam);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  const R0 = RING.R, rad = R0 - layerFloor(), ax = cam.position.x, ox = o.x - ax, oy = o.y - R0;
  const A = d.x * d.x + d.y * d.y;
  if (A < 1e-8) return null;
  const B = 2 * (ox * d.x + oy * d.y), Cq = ox * ox + oy * oy - rad * rad, disc = B * B - 4 * A * Cq;
  if (disc < 0) return null;
  const sd = Math.sqrt(disc);
  let tHit = Infinity;
  for (const t of [(-B - sd) / (2 * A), (-B + sd) / (2 * A)]) if (t > 1) tHit = Math.min(tHit, t);
  if (!isFinite(tHit)) return null;
  const px = o.x + d.x * tHit, py = o.y + d.y * tHit, pz = o.z + d.z * tHit;
  const th = Math.atan2(px - ax, R0 - py);
  return { x: ax + th * R0, z: pz };
}
function selectField(f, why) { selected = f || null; selNote = why || ''; plantOpen = false; prepOpen = false; }
function onMapClick(cx, cy) {
  const p = pickFlat(cx, cy);
  if (viewLayer !== 'surface' && mode !== 'build') {
    const cell = p ? cellAt(p.x, p.z) : null;
    if (millPlace && viewLayer === 'grow') {
      millPlace = false;
      if (!cell) { toast('点在培育层的单元上'); paintSheet(); return; }
      const r = startMill({ ...cell, x: (cell.x0 + cell.x1) / 2, z: (cell.z0 + cell.z1) / 2 });
      if (!r.ok) toast(r.reason === 'hub' ? '加工厂不建在中枢地块上' : r.reason === 'grub' ? '这块是蛴螬培养槽' : r.reason === 'have' ? '已经有一座加工厂' : r.reason === 'money' ? '营收不够' : '不能建在这里');
      else { toast(`<b>−${fmt(r.cost)}</b>加工厂开工`); saveSoon(); }
      paintSheet();
      paintKpi();
      return;
    }
    if (cell && viewLayer === 'grow') {
      if (cell.hub) { deckBlock = null; deckHub = true; }
      else {
        deckBlock = { bi: cell.bi, bj: cell.bj };
        deckHub = false;
        const here = tanks.find(t => t.species && t.bi === cell.bi && t.bj === cell.bj);
        if (here) deckTank = here.id;
        else if (cell.tank >= 0) deckTank = cell.tank;
      }
      paintSheet();
    }
    return;
  }
  if (mode === 'build') {
    if (buildAct === 'watch') return;
    if (!p) { toast('点在自己的田区里'); return; }
    if (buildAct === 'delete') {
      let best = null, bd = 48;
      for (const b of buildings) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = b; } }
      if (!best) { toast('点中枢上的一栋'); return; }
      buildPick = best.id; paintSheet(); return;
    }
    const r = placeBuilding(p.x, p.z, buildKind);
    if (!r.ok) toast(r.reason === 'field' ? '房子建在中枢地块上' : r.reason === 'money' ? '营收不够' : '只能建在自己的田区里');
    else { toast(r.cost ? `<b>−${fmt(r.cost)}</b>${r.building.name}` : `${r.building.name}已放下`); saveSoon(); paintSheet(); }
    return;
  }
  if (!p) { selectField(null); return; }
  const f = fieldAtWorld(p.x, p.z);
  if (!f) { selectField(null); return; }
  if (!f.inPlot) { selectField(f, '邻区快照 · 只读'); return; }
  if (!f.owned) { selectField(f, f.crop === -3 ? '蓄水池' : '设施用地'); return; }
  selectField(f, '');
}
function toast(html) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.innerHTML = html;
  $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 4800);
}
function planWhy(reason) {
  if (reason === 'seed') return '种子不足';
  if (reason === 'fertilizer') return '肥料不足';
  if (reason === 'busy') return '这块田正在长';
  if (reason === 'season') return '现在不在农时里';
  return '不能播种';
}
function readPlanFlags(root) {
  if (!root) return;
  const cycle = root.querySelector('[data-flag="cycle"]');
  const buy = root.querySelector('[data-flag="buy"]');
  if (cycle) planCycle = cycle.checked;
  if (buy) planBuy = buy.checked;
}
function planOpts() {
  return { cycle: planCycle, autoBuy: planBuy };
}
function planCropButtons(disabled) {
  return `<button type="button" class="sell" data-plan="lastika"${disabled ? ' disabled' : ''}>拉斯提卡</button>`;
}
function planTicks() {
  return '<p class="note">先整地，清地的目标是一般田地。再种拉斯提卡。播种做完才开始生长。这一季不扣种薯。</p>';
}
function plantWhy(reason) {
  if (reason === 'ground') return '要先整地。清地的目标是一般田地。';
  if (reason === 'lock') return '这块田还在作业';
  if (reason === 'busy' || reason === 'planting') return '这块正在种拉斯提卡';
  return '不能播种';
}
function prepWhy(reason) {
  if (reason === 'lock') return '这块田还在作业';
  if (reason === 'planting' || reason === 'busy') return '这块正在种，不能整地';
  if (reason === 'recipe') return '没有这种田面';
  return '不能整地';
}
function closeToolMenus() {
  plantOpen = false;
  prepOpen = false;
}
function doPrep(recipeId = 'clear_general') {
  if (!selected?.owned) { toast('不能整地'); return { ok: false, reason: 'plot' }; }
  const recipe = PREP_RECIPES[recipeId];
  if (!recipe) { toast(prepWhy('recipe')); return { ok: false, reason: 'recipe' }; }
  const r = prepField(selected, recipe.id);
  if (!r.ok) { toast(prepWhy(r.reason)); return r; }
  closeToolMenus();
  const jobName = JOBS[recipe.steps[0]]?.name || '犁地';
  toast(r.skipped ? `已经是${recipe.targetName}，不用再整` : `${recipe.name} · ${jobName}`);
  updateDock();
  return r;
}
function doPlant() {
  if (!selected?.owned) { toast('不能播种'); return { ok: false, reason: 'plot' }; }
  const r = plantCrop(selected);
  if (!r.ok) { toast(plantWhy(r.reason)); return r; }
  closeToolMenus();
  plantWin = { x: 1e9, z: 1e9, w: 0 };
  toast('拉斯提卡 · 播种');
  updateDock();
  return r;
}
function closePlanMenu() {
  const menu = $('planmenu');
  if (!menu) return;
  menu.classList.remove('on');
  menu.innerHTML = '';
}
function applyFieldPick(list, shift) {
  if (!shift) pickedFields.clear();
  for (const f of list) if (f?.owned) pickedFields.add(f.idx);
  const last = list.filter(f => f?.owned).pop();
  if (last) selectField(last, '');
  else if (!pickedFields.size) selectField(null);
  if (mode === 'scheme') paintSheet();
}
function planSelected() {
  closePlanMenu();
  let n = 0;
  let why = '';
  for (const idx of pickedFields) {
    const f = fields[idx];
    if (!f?.owned) continue;
    const r = plantCrop(f);
    if (r.ok) n++;
    else if (!why) why = plantWhy(r.reason);
  }
  if (n) toast(`已种 ${n} 块拉斯提卡`);
  else toast(why || '没有种上');
  paintSheet();
}
function openPlanMenu(x, y) {
  const menu = $('planmenu');
  if (!menu || !pickedFields.size) { closePlanMenu(); return; }
  menu.classList.add('on');
  menu.style.left = Math.min(x, innerWidth - 220) + 'px';
  menu.style.top = Math.min(y, innerHeight - 140) + 'px';
  menu.innerHTML = `<div class="who"><b>规划 ${pickedFields.size} 块</b><span>钟从第一趟作业起算</span></div>${planTicks()}${planCropButtons(false)}`;
}
document.getElementById('planmenu').addEventListener('change', e => { if (e.target.dataset.flag) readPlanFlags($('planmenu')); });
document.getElementById('planmenu').addEventListener('click', e => {
  const plan = e.target.closest('[data-plan]');
  if (plan) planSelected(plan.dataset.plan);
});
R.domElement.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault(), true);
R.domElement.addEventListener('pointerdown', e => {
  ptr = { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey };
  if (mode === 'scheme' && viewLayer === 'surface' && e.button === 0) {
    drag = { b: 'box', x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, shift: e.shiftKey };
    closePlanMenu();
    R.domElement.setPointerCapture(e.pointerId);
    return;
  }
  if (mode === 'scheme' && viewLayer === 'surface' && e.button === 2) {
    drag = { b: 'rmb', x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
    R.domElement.setPointerCapture(e.pointerId);
    return;
  }
  drag = { b: e.button === 2 || e.shiftKey ? 'rot' : 'pan', x: e.clientX, y: e.clientY };
  R.domElement.setPointerCapture(e.pointerId);
});
addEventListener('pointerup', e => {
  if (drag && drag.b === 'box') {
    const moved = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) >= 6;
    $('marquee').classList.remove('on');
    if (!moved) {
      const p = pickFlat(drag.x0, drag.y0);
      const f = p ? fieldAtWorld(p.x, p.z) : null;
      if (f?.owned && drag.shift) {
        if (pickedFields.has(f.idx)) pickedFields.delete(f.idx);
        else pickedFields.add(f.idx);
        selectField(f, '');
        paintSheet();
      } else if (f?.owned) applyFieldPick([f], false);
      else if (!drag.shift) { pickedFields.clear(); selectField(null); paintSheet(); }
    } else {
      const left = Math.min(drag.x0, e.clientX), right = Math.max(drag.x0, e.clientX);
      const top = Math.min(drag.y0, e.clientY), bot = Math.max(drag.y0, e.clientY);
      const hit = [];
      for (const f of fields) {
        if (!f.owned || !f.inPlot) continue;
        const s = project(f.x0 + L.FIELD / 2, 0, f.z0 + L.FIELD / 2);
        if (!s || s[0] < left || s[0] > right || s[1] < top || s[1] > bot) continue;
        hit.push(f);
      }
      applyFieldPick(hit, drag.shift);
    }
    drag = null; ptr = null;
    return;
  }
  if (drag && drag.b === 'rmb') {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) {
      const p = pickFlat(e.clientX, e.clientY);
      const f = p ? fieldAtWorld(p.x, p.z) : null;
      if (f?.owned && !pickedFields.has(f.idx)) pickedFields.add(f.idx);
      if (f?.owned) selectField(f, '');
      openPlanMenu(e.clientX, e.clientY);
      if (mode === 'scheme') paintSheet();
    }
    drag = null; ptr = null;
    return;
  }
  if (ptr && ptr.b === 0 && Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) < 6) onMapClick(ptr.x, ptr.y);
  drag = null; ptr = null;
});
let hoverPtr = null, deckHover = null;
addEventListener('pointermove', e => {
  hoverPtr = { x: e.clientX, y: e.clientY };
  if (!drag) return;
  if (drag.b === 'box') {
    const m = $('marquee');
    m.style.left = Math.min(drag.x0, e.clientX) + 'px';
    m.style.top = Math.min(drag.y0, e.clientY) + 'px';
    m.style.width = Math.abs(e.clientX - drag.x0) + 'px';
    m.style.height = Math.abs(e.clientY - drag.y0) + 'px';
    m.classList.add('on');
    return;
  }
  if (drag.b === 'rmb') return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.b === 'pan') {
    const k = camT.d * 2 * Math.tan(15 * DEG) / innerHeight, s = Math.sin(camT.yaw), c = Math.cos(camT.yaw);
    camT.x -= (dx * c + dy * s / Math.sin(pitchOf(camT.d))) * k; camT.z -= (-dx * s + dy * c / Math.sin(pitchOf(camT.d))) * k;
  } else { camT.yaw -= dx * 0.005; camT.pOff = Math.max(-18 * DEG, Math.min(50 * DEG, camT.pOff + dy * 0.003)); }
});
R.domElement.addEventListener('wheel', e => { e.preventDefault(); camT.d = Math.max(22, Math.min(8000, camT.d * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
const keys = {};
addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'p' || e.key === 'P') { setPaused(!paused); paintPause(); }
  if (e.key === '[' || e.key === '【' || (e.code === 'BracketLeft' && e.key !== '{')) stepRate(-1);
  if (e.key === ']' || e.key === '】' || (e.code === 'BracketRight' && e.key !== '}')) stepRate(1);
  if (e.key === 'n' || e.key === 'N') nightT = nightT > 0.5 ? 0 : 1;
  if (e.key === 'm' || e.key === 'M') mapT = mapT > 0.5 ? 0 : 1;
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('nohud');
  if (e.key === 'c' || e.key === 'C') visitDeck(!camS.deck);
  if (e.key === 'F2' || e.key === '\\') { e.preventDefault(); toggleAdmin(); }
  if (e.key === 'v' || e.key === 'V') toggleViewer();
  if (e.key === 'Escape') {
    if (prepOpen || plantOpen) { closeToolMenus(); updateDock(); return; }
    $('admin').classList.remove('on');
    $('viewer').classList.remove('on');
    returnToLook();
  }
  if ('1234'.includes(e.key)) gotoTier(+e.key);
});
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
let nightT = Q.has('night') ? 1 : 0, mapT = Q.has('map') ? 1 : 0, lockDay = false;
U.uNight.value = nightT; U.uMap.value = mapT;

// ---------------- 后期：Render → GTAO → Bloom → 移轴 → Output(AgX) → SMAA → 暗角/颗粒 ----------------
const rt = new THREE.WebGLRenderTarget(innerWidth * R.getPixelRatio(), innerHeight * R.getPixelRatio(), { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture() });
const composer = new EffectComposer(R, rt);
const renderPass = new RenderPass(scene, cam); composer.addPass(renderPass);
const gtao = new GTAOPass(scene, cam, innerWidth, innerHeight);
gtao.setGBuffer(composer.renderTarget2.depthTexture);   // 复用主渲染的深度（法线由深度重建），自定义顶点变形也能得到正确 AO
composer.setSize(innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.5, thickness: 2, scale: 1.25, samples: 12, distanceFallOff: 1 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
gtao.blendIntensity = 1.0;
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.42, 0.6, 2.2); composer.addPass(bloom);
const tiltH = new ShaderPass(HorizontalTiltShiftShader), tiltV = new ShaderPass(VerticalTiltShiftShader);
tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.5; composer.addPass(tiltH); composer.addPass(tiltV);
composer.addPass(new OutputPass());
const smaa = new SMAAPass(); composer.addPass(smaa);
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.28 }, uGrain: { value: 0.022 }, uSat: { value: 1.12 }, uCon: { value: 1.14 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    uniform float uSat, uCon;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      // AgX 之后的「Punchy」式风格化：轻微提彩度 + 中间调对比（类似 Blender AgX Punchy look）
      float lm = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); c.rgb = mix(vec3(lm), c.rgb, uSat);
      c.rgb = clamp(c.rgb, 0., 1.); c.rgb = mix(c.rgb, c.rgb * c.rgb * (3. - 2. * c.rgb), uCon - 1.) ;
      vec2 q = vUv - .5; q.x *= 1.25; float v = 1. - uVig * smoothstep(0.25, 0.85, length(q));
      c.rgb *= v; c.rgb += (h(vUv * 1000. + fract(uTime)) - .5) * uGrain; gl_FragColor = c; }`,
});
composer.addPass(finalPass);
function setPost(on) { gtao.enabled = bloom.enabled = smaa.enabled = finalPass.enabled = on; if (!on) tiltH.enabled = tiltV.enabled = false; }
if (NOPOST) setPost(false);

// ---------------- HUD 与地表标注 ----------------
const $ = id => document.getElementById(id);
const labelLayer = $('labels'); const LBL = [];
for (let i = 0; i < 70; i++) { const d = document.createElement('div'); d.className = 'lbl'; labelLayer.appendChild(d); LBL.push(d); }
const legend = $('legend');
legend.innerHTML = [
  ['未整地', PALETTE.deep, PALETTE.regoDk],
  ['一般田地', PALETTE.regoDk, PALETTE.rego],
  ['播种', PALETTE.rego, PALETTE.oliveDp],
  ['成熟', PALETTE.oliveDp, PALETTE.olive],
  ['收割', PALETTE.ochre, PALETTE.straw],
  ['收拾', PALETTE.rego, PALETTE.regoLt],
].map(([name, a, b]) => `<div class="lg"><i style="background:linear-gradient(90deg,${a},${b})"></i><span>${name}</span></div>`).join('');
const MODES = [['machines', '农机', 'FLEET'], ['rigshop', '农机店', 'BUY'], ['plan', '区域', 'PLAN'], ['crops', '作物', 'CROP'], ['scheme', '规划', 'ASSIGN'], ['store', '仓库', 'STORE'], ['build', '建设', 'BUILD'], ['shop', '商店', 'SHOP']];
$('tiers').innerHTML = MODES.map(([id, zh, en]) => `<button type="button" data-mode="${id}"><b>${zh}</b><small>${en}</small></button>`).join('');
function gotoTier(n) { camT.d = [4800, 900, 160, 34][n - 1]; camT.pOff = 0; camT.lookUp = 0; camT.fovAdd = 0; }
function fieldCode(f) { return `F-${String(f.i).padStart(3, '0')}${String(f.j).padStart(2, '0')}`; }
function rigTitle(r) {
  const same = rigs.filter(x => x.kind === r.kind);
  if (same.length < 2) return r.label;
  return `${r.label} ${same.indexOf(r) + 1}`;
}
function fleetWidth(r) {
  if (r.bDrive) {
    const w = r.bWidth || 16;
    const text = Math.abs(w - Math.round(w)) < 0.05 ? String(Math.round(w)) : String(Math.round(w * 10) / 10);
    return ` · 幅宽 ${text} m`;
  }
  const w = workWidthOf(r.kind, r.hitch);
  if (!(w > 0)) return '';
  const text = Math.abs(w - Math.round(w)) < 0.05 ? String(Math.round(w)) : String(Math.round(w * 10) / 10);
  return ` · 幅宽 ${text} m`;
}
function rigLine(r) {
  const info = rigReadout(r);
  const aerial = r.kind === 'drone_scout' || r.kind === 'drone_treat';
  if (aerial) {
    const where = r.f ? ' · ' + fieldCode(r.f) : '';
    const band = info.light == null ? '' : ` · ${info.light > 0.82 ? '昼' : info.light < 0.18 ? '夜' : '晨昏'}`;
    if (!r.busy) return `停在基站${band}`;
    return `${info.doing}${where}${band}`;
  }
  const pct = Math.round((info.charge ?? 1) * 100);
  const width = fleetWidth(r);
  const role = r.bDrive && r.role ? `${r.role} · ` : '';
  const caps = r.bDrive && r.caps?.length ? ` · ${r.caps.join('、')}` : '';
  if (!r.busy && r.mode !== 'charge') return `${role}停在机库 · 电 ${pct}%${width}${caps}`;
  const where = r.f ? ' · ' + fieldCode(r.f) : '';
  return `${role}${info.doing}${where} · 电 ${pct}%${width}${caps}`;
}
function paintLock() {
  const el = $('rigread');
  if (!el) return;
  if (!watchRig) { el.classList.remove('on'); return; }
  const r = watchRig;
  const info = rigReadout(r);
  const pct = Math.round(info.frac * 100);
  const where = r.f ? fieldCode(r.f) : '';
  el.classList.add('on');
  const batt = Math.round((info.charge ?? 1) * 100);
  el.innerHTML = `<b>${rigTitle(r)}</b><small><em>${info.speed.toFixed(1)}</em> m/s · 电 ${batt}%${fleetWidth(r)}</small><small>${info.doing}${where ? ' · ' + where : ''}</small><div id="rigbar"><i style="width:${pct}%"></i></div><small>本趟 ${pct}%</small>`;
}
function refreshLayerProps() {
  buildPlotSection();
  syncDepots();
  plantWin = { x: 1e9, z: 1e9, w: 0 };
  infraAt = { x: 1e9, z: 1e9 };
  convAt.on = false;
}
function leaveDeck() {
  if (viewLayer === 'surface' && !cut.on) return;
  viewLayer = 'surface';
  camS.deck = camT.deck = false;
  camS.y = camT.y = 0;
  setCut(false);
  refreshLayerProps();
  if (typeof paintLayers === 'function') paintLayers();
}
function holdCamera() {
  watchRig = null;
  followLock = null;
  camT.x = camS.x; camT.z = camS.z; camT.d = camS.d;
  camT.yaw = camS.yaw; camT.pOff = camS.pOff; camT.lookUp = camS.lookUp; camT.fovAdd = camS.fovAdd;
}
function showLayer(id) {
  const next = LAYERS.some(l => l.id === id) ? id : 'surface';
  if (next === viewLayer && !cut.on) { paintLayers(); return; }
  holdCamera();
  if (cut.on) setCut(false);
  viewLayer = next;
  camS.deck = camT.deck = next !== 'surface';
  refreshLayerProps();
  if (next === 'grow') placeTanks();
  if (next === 'grow') mode = 'deck';
  else if (mode === 'deck') mode = 'look';
  paintModes();
  paintSheet();
  paintLayers();
  paintLock();
}
function visitDeck(on) {
  const want = on == null ? viewLayer === 'surface' : !!on;
  showLayer(want ? 'grow' : 'surface');
}
function frameFocus(f) {
  f = f || fieldAt(focus.i, focus.j);
  camT.x = camS.x = f.x0 + L.FIELD / 2;
  camT.z = camS.z = f.z0 + L.FIELD / 2;
  camT.d = camS.d = 720;
  camT.yaw = camS.yaw = 118 * DEG;
  camT.pOff = camS.pOff = -8 * DEG;
  camT.lookUp = camS.lookUp = 0;
  camT.fovAdd = camS.fovAdd = 6;
  return f;
}
function showPlan() {
  leaveDeck();
  watchRig = null;
  mode = 'plan';
  const f = frameFocus(selected?.owned ? selected : fieldAt(focus.i, focus.j));
  selectField(f, '');
  paintModes();
  paintSheet();
}
function lockRig(id) {
  const r = rigs.find(x => x.id === id);
  if (!r) return;
  watchRig = r;
  camT.d = camS.d = 110;
  camT.x = camS.x = r.x;
  camT.z = camS.z = r.z;
  document.querySelectorAll('#sheet [data-rig]').forEach(b => b.classList.toggle('on', +b.dataset.rig === id));
}
function paintModes() {
  document.querySelectorAll('#tiers button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
}
function stackSlots(list, pick, attr) {
  if (!list.length) return '<p class="note">这里还是空的。</p>';
  return `<div class="slots">${list.map(item => `<button type="button" class="slot${pick === item.key ? ' on' : ''}" ${attr}="${item.key}"><b>${item.name}</b><small>${item.sub}</small></button>`).join('')}</div>`;
}
function paintSheet() {
  const el = $('sheet');
  el.classList.toggle('wide', mode === 'crops' || mode === 'store' || mode === 'shop' || mode === 'scheme' || mode === 'rigshop');
  if (mode === 'plan' || mode === 'look') { el.classList.remove('on'); el.innerHTML = ''; return; }
  el.classList.add('on');
  if (mode === 'crops') {
    const rows = CROPS.map(c => ({ key: c.id, name: c.name, sub: c.plantable ? '可种' : '邻区' }));
    const d = cropDossier(cropPick) || cropDossier('potato');
    const stages = d.stages.length
      ? d.stages.map(s => `<div class="stage"><span><i style="background:${s.color}"></i>${s.name}</span><span>${s.days} 日${s.machine ? ' · ' + s.machine + ' 第 ' + s.machineAt + ' 日' : ''}</span></div><p class="note">${s.effect}</p>`).join('')
      : `<p class="note">${d.yieldNote}</p>`;
    const head = d.plantable
      ? `<div class="who"><b>${d.name}</b><span>${d.analog} · ${d.days} 日</span></div><p class="note">${d.yieldNote}</p>${stages}`
      : `<div class="who"><b>${d.name}</b><span>${d.analog} · 参考 ${d.days} 日</span></div><p class="note">${d.yieldNote}</p>`;
    el.innerHTML = `<div class="split"><div><div class="who"><b>作物</b><span>点一种看阶段</span></div>${stackSlots(rows, d.id, 'data-cropid')}</div><div>${head}</div></div>`;
  } else if (mode === 'scheme') {
    const n = pickedFields.size;
    el.innerHTML = `<div class="who"><b>规划</b><span>已选 ${n} 块田</span></div><p class="note">拖出方框选田。按住 Shift 再点，加选。右键已选的田，种拉斯提卡。田要先整成一般田地。</p>${planTicks()}${planCropButtons(!n)}`;
  } else if (mode === 'machines') {
    const fleetRows = rigs.map(r => `<button type="button" class="rowbtn${watchRig === r ? ' on' : ''}" data-rig="${r.id}"><b>${rigTitle(r)}</b><small>${rigLine(r)}</small></button>`).join('')
      + workDrones.map(d => `<button type="button" class="rowbtn${watchRig === d ? ' on' : ''}" data-drone="${d.id}"><b>${d.label}</b><small>${rigLine(d)}</small></button>`).join('');
    el.innerHTML = `<div class="who"><b>农机</b><span>点一台，镜头跟着它</span></div>` + (fleetRows || '<p class="note">机库是空的。</p>');
  } else if (mode === 'rigshop') {
    const rows = MACHINE_SHOP.map(item => {
      const n = rigs.filter(r => r.kind === item.id).length;
      return { key: item.id, name: item.name, sub: `${fmt(item.price)} · 已有 ${n}` };
    }).concat(DRONE_SHOP.map(item => {
      const n = workDrones.filter(d => d.kind === item.id).length;
      return { key: item.id, name: item.name, sub: `${fmt(item.price)} · 已有 ${n}` };
    }));
    const item = MACHINE_SHOP.find(s => s.id === rigPick) || DRONE_SHOP.find(s => s.id === rigPick) || MACHINE_SHOP[0];
    const n = DRONE_SHOP.some(s => s.id === item.id) ? workDrones.filter(d => d.kind === item.id).length : rigs.filter(r => r.kind === item.id).length;
    const note = item.id === 'tractor'
      ? '停在机库，能看见。没有后挂，不接作业。'
      : item.id === 'planter'
        ? '通用拖拉机。按作业自动换挂：旋耕、施肥、薯播、精播、作畦、运输挂车。喷雾挂具留到病害。'
        : item.id === 'drone_scout'
          ? '从无人机基站起飞，只做田间侦察。没有基站不能买，也不进机库。'
          : item.id === 'drone_treat'
            ? '从基站起飞，只做虫害防治。病害以后才用地喷和轨道喷杆。田是齐模块，不补边角。'
        : item.id === 'harvester_combine' || item.id === 'harvester_cabbage' || item.id === 'transplanter'
          ? '工坊锁定的低模剪影，买来就能按能力派单。'
          : '买来就停进机库，充满再出库。';
    el.innerHTML = `<div class="split"><div><div class="who"><b>农机店</b><span>用营收买</span></div>${stackSlots(rows, item.id, 'data-rigshop')}</div><div><div class="who"><b>${item.name}</b><span>单价 ${fmt(item.price)} · 已有 ${n}</span></div><p class="note">${note}</p><button type="button" class="sell" id="buy-rig">购买</button></div></div>`;
  } else if (mode === 'store') {
    const cap = warehouseCapacity();
    const stacks = warehouseStacks();
    if (pickedStack && !stacks.some(s => s.key === pickedStack)) pickedStack = stacks[0]?.key || null;
    if (!pickedStack && stacks[0]) pickedStack = stacks[0].key;
    const slots = stacks.map(s => ({ key: s.key, name: s.name, sub: `${fmt(s.liters)} ${s.unit}` }));
    const cur = stacks.find(s => s.key === pickedStack);
    const capLine = cap.soft ? `已用 ${cap.usedSlots} 格 · ${fmt(cap.usedLiters)} L · 容量未封顶` : `已用 ${cap.usedSlots}/${cap.maxSlots ?? '—'} 格`;
    const right = cur
      ? `<div class="who"><b>${cur.name}</b><span>${fmt(cur.liters)} ${cur.unit} · 牌价 ${fmt(cur.listPrice)}</span></div><p class="note">${cur.n} 批叠在这一格。拖百分比，按这个比例出售。</p><input id="sell-pct" type="range" min="1" max="100" value="100" aria-label="出售比例"><div class="who"><span id="sell-pct-lab">100%</span></div><button type="button" class="sell" id="sell">出售</button>`
      : `<p class="note">仓里还是空的。收获的薯和蛋白会叠到左边。</p>`;
    el.innerHTML = `<div class="split"><div><div class="who"><b>仓库</b><span>${capLine}</span></div>${stackSlots(slots, pickedStack, 'data-stack')}</div><div>${right}</div></div>`;
    const pct = $('sell-pct');
    if (pct) pct.addEventListener('input', () => { const lab = $('sell-pct-lab'); if (lab) lab.textContent = pct.value + '%'; });
  } else if (mode === 'shop') {
    const rows = SHOP.map(item => ({ key: item.id, name: item.name, sub: `${fmt(item.price)} · 库存 ${stores[item.id]}` }));
    const item = SHOP.find(s => s.id === shopPick) || SHOP[0];
    const seeded = CROPS.find(c => cropDef(c.id)?.seed === item.id);
    const use = seeded
      ? `种一块${seeded.name}用 ${cropDef(seeded.id).seedQty}。只从商店买，田里不育苗。`
      : item.id === 'fertilizer' ? `种一块田用 ${FERT_PER_FIELD}。` : '开一槽用 1。';
    el.innerHTML = `<div class="split"><div><div class="who"><b>商店</b><span>用营收买</span></div>${stackSlots(rows, item.id, 'data-shop')}</div><div><div class="who"><b>${item.name}</b><span>单价 ${fmt(item.price)} · 库存 ${stores[item.id]}</span></div><p class="note">${use}商品薯和蛋白仍在仓库出售。</p><div class="buyline"><input id="shop-qty" class="qty" type="text" inputmode="numeric" value="1" aria-label="购买数量" autocomplete="off"><button type="button" class="sell" id="buy">购买</button></div></div></div>`;
    const qty = $('shop-qty');
    qty.addEventListener('focus', ev => ev.target.select());
    qty.addEventListener('mouseup', ev => ev.preventDefault());
    qty.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); $('buy').click(); } });
  } else if (mode === 'build') {
    const acts = [['place', '放下'], ['delete', '拆除'], ['watch', '查看']].map(([id, name]) => `<button type="button" class="sell${buildAct === id ? ' on' : ''}" data-bact="${id}">${name}</button>`).join('');
    let body = '';
    if (buildAct === 'place') {
      body = `<p class="note">先选一种，再点中枢地块。田里种薯。无人机从基站起飞，不进机库。</p>` + ['warehouse', 'garage', 'process', 'drone_base'].map(id => {
        const spec = BUILDING_KINDS[id];
        const sub = spec.price ? `${fmt(spec.price)} · 点中枢放下` : '点中枢放下';
        return `<button type="button" class="rowbtn${buildKind === id ? ' on' : ''}" data-bkind="${id}"><b>${spec.name}</b><small>${sub}</small></button>`;
      }).join('');
    } else if (buildAct === 'delete') {
      const rows = buildings.map(b => `<button type="button" class="rowbtn${buildPick === b.id ? ' on' : ''}" data-bdel="${b.id}"><b>${b.name}</b><small>中枢 · ${Math.round(b.x)}, ${Math.round(b.z)}</small></button>`).join('');
      body = `<p class="note">选中一栋再拆除。查看不在这一档。</p>${rows || '<p class="note">中枢上没有房子。</p>'}<button type="button" class="sell" id="bremove"${buildPick == null ? ' disabled' : ''}>拆除所选</button>`;
    } else {
      const rows = buildings.map(b => `<button type="button" class="rowbtn" data-bwatch="${b.id}"><b>${b.name}</b><small>中枢 · ${Math.round(b.x)}, ${Math.round(b.z)}</small></button>`).join('');
      body = `<p class="note">已建的房子。点一行看位置。放下和拆除是另外两档。</p>${rows || '<p class="note">中枢上没有房子。</p>'}`;
    }
    el.innerHTML = `<div class="who"><b>建设</b><span>放下、拆除、查看分开</span></div><div class="buyline">${acts}</div>${body}`;
  } else if (mode === 'deck') {
    const rows = tanks.map(t => {
      const w = cultureWatch(t);
      const where = Number.isInteger(t.bi) ? secName(t.bi, t.bj) : '';
      const line = w ? `${w.name}${where ? ' · ' + where : ''} · 第 ${Math.floor(w.day)} / ${w.days} 日${w.tended ? ' · 臂已照料' : ''}${w.ready ? ' · 可收' : ''}` : '空槽';
      return `<button type="button" class="rowbtn${deckTank === t.id ? ' on' : ''}" data-tank="${t.id}"><b>槽 ${t.id + 1}</b><small>${line}</small></button>`;
    }).join('');
    const { mill, line: millLine } = millStatusText();
    const feed = cultureFeedPlan('grub');
    const millBtns = mill.state === 'none'
      ? `<button type="button" class="sell${millPlace ? ' on' : ''}" id="mill-arm">${millPlace ? '取消选址' : '选址建造'}</button>`
      : `<button type="button" class="sell" id="mill-run"${mill.state === 'ready' ? '' : ' disabled'}>加工一批</button><button type="button" class="sell" id="mill-del"${mill.state === 'job' ? ' disabled' : ''}>拆除</button>`;
    const feedLine = `开蛴螬：饲料 ${stockText(feed.fromShop)}（皮最多抵 ${Math.round(feed.cap * 100)}%）· 现有皮 ${stockText(stores.peel)} · 饲料 ${stockText(stores.feed)}`;
    const picked = deckBlock ? secName(deckBlock.bi, deckBlock.bj) : '先点一块非中枢单元';
    el.innerHTML = `<div class="who"><b>培育层</b><span>${DECK_CLIMATE.temp}°C · 湿度 ${DECK_CLIMATE.rh}%</span></div><p class="note">设定值，不是天气。${feedLine}</p><p class="note">养殖装在点中的单元上。当前 ${picked}。中枢不装培养槽。</p><div class="who"><b>加工厂</b><span data-mill>${millLine}</span></div><p class="note">土豆进，土豆淀粉和土豆皮出。皮可以抵一部分饲料。建造 ${fmt(mill.cost)} · ${mill.days} 日。水电在加工时从营收扣。</p><div class="buyline">${millBtns}</div>${rows}<div class="buyline"><button type="button" class="sell" data-spawn="grub">养蛴螬</button><button type="button" class="sell" data-spawn="bsf">养黑水虻</button></div><div class="buyline"><button type="button" class="sell" id="tend">照料</button><button type="button" class="sell" id="harvest">收获</button></div>`;
  }
}
function returnToLook() {
  mode = 'look';
  watchRig = null;
  millPlace = false;
  closePlanMenu();
  pickedFields.clear();
  selectField(null);
  paintModes();
  paintSheet();
  paintLock();
}
function setMode(id) {
  if (id !== 'deck' && viewLayer !== 'surface') {
    holdCamera();
    viewLayer = 'surface';
    camS.deck = camT.deck = false;
    if (cut.on) setCut(false);
    refreshLayerProps();
    paintLayers();
  }
  mode = id;
  if (id === 'plan') { showPlan(); return; }
  if (id !== 'machines') watchRig = null;
  if (id !== 'scheme') closePlanMenu();
  paintModes();
  paintSheet();
}
function toggleMode(id) {
  if (mode === id) { returnToLook(); return; }
  setMode(id);
}
$('tiers').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  toggleMode(b.dataset.mode);
});
$('sheet').addEventListener('change', e => { if (e.target.dataset?.flag) readPlanFlags($('sheet')); });
$('sheet').addEventListener('click', e => {
  const rig = e.target.closest('[data-rig]');
  if (rig) { lockRig(+rig.dataset.rig); return; }
  const droneBtn = e.target.closest('[data-drone]');
  if (droneBtn) {
    const d = workDrones.find(x => x.id === +droneBtn.dataset.drone);
    if (!d) return;
    watchRig = d;
    camT.d = camS.d = 80;
    camT.x = camS.x = d.x;
    camT.z = camS.z = d.z;
    paintSheet();
    return;
  }
  const cropId = e.target.closest('[data-cropid]');
  if (cropId) { cropPick = cropId.dataset.cropid; paintSheet(); return; }
  const stack = e.target.closest('[data-stack]');
  if (stack) { pickedStack = stack.dataset.stack; paintSheet(); return; }
  if (e.target.dataset.flag) { readPlanFlags($('sheet')); return; }
  const plan = e.target.closest('[data-plan]');
  if (plan) { planSelected(plan.dataset.plan); return; }
  const bact = e.target.closest('[data-bact]');
  if (bact) { buildAct = bact.dataset.bact; paintSheet(); return; }
  const bkind = e.target.closest('[data-bkind]');
  if (bkind) { buildKind = bkind.dataset.bkind; buildAct = 'place'; paintSheet(); return; }
  const bdel = e.target.closest('[data-bdel]');
  if (bdel) { buildPick = +bdel.dataset.bdel; paintSheet(); return; }
  if (e.target.id === 'bremove') {
    if (buildPick == null) return;
    const gone = removeBuilding(buildPick);
    buildPick = null;
    if (!gone.ok) toast('这栋已经不在了');
    else { toast(`${gone.building.name}已拆除`); saveSoon(); }
    paintSheet();
    return;
  }
  const bwatch = e.target.closest('[data-bwatch]');
  if (bwatch) {
    const b = buildings.find(x => x.id === +bwatch.dataset.bwatch);
    if (!b) return;
    watchRig = null;
    if (camS.deck) leaveDeck();
    camT.x = camS.x = b.x; camT.z = camS.z = b.z; camT.d = camS.d = 80;
    if (b.kind === 'warehouse') setMode('store');
    return;
  }
  const shopRow = e.target.closest('[data-shop]');
  if (shopRow) { shopPick = shopRow.dataset.shop; paintSheet(); return; }
  const rigRow = e.target.closest('[data-rigshop]');
  if (rigRow) { rigPick = rigRow.dataset.rigshop; paintSheet(); return; }
  if (e.target.id === 'buy-rig') {
    const bought = DRONE_SHOP.some(s => s.id === rigPick) ? buyDrone(rigPick) : buyMachine(rigPick);
    if (!bought.ok && bought.reason === 'money') toast('营收不够');
    else if (!bought.ok && bought.reason === 'base') toast('先在中枢建无人机基站');
    else if (!bought.ok && bought.reason === 'full') toast('基站已经停满');
    else if (!bought.ok) toast('这台不卖');
    else toast(`<b>−${fmt(bought.cost)}</b>${bought.name}`);
    paintSheet();
    paintKpi();
    saveSoon();
    return;
  }
  const tankRow = e.target.closest('[data-tank]');
  if (tankRow) { deckTank = +tankRow.dataset.tank; paintSheet(); return; }
  const spawn = e.target.closest('[data-spawn]');
  if (e.target.id === 'mill-arm') {
    millPlace = !millPlace;
    if (millPlace) toast('点一块非中枢的培育层单元');
    paintSheet();
    return;
  }
  if (e.target.id === 'mill-run') {
    const ran = orderProcess();
    if (!ran.ok) {
      const why = ran.reason === 'money' ? '营收不够' : ran.reason === 'potato' ? '仓库土豆不够一批' : ran.reason === 'building' ? '加工厂还在施工' : ran.reason === 'busy' ? '这一批还在加工' : '先建加工厂';
      toast(why);
    } else { toast(`<b>−${fmt(ran.cost)}</b>开始加工`); saveSoon(); }
    paintSheet();
    paintKpi();
    return;
  }
  if (e.target.id === 'mill-del') {
    const gone = removeMill();
    if (!gone.ok) toast(gone.reason === 'busy' ? '这一批还在加工' : '没有加工厂');
    else { toast('加工厂已拆除'); saveSoon(); }
    paintSheet();
    return;
  }
  if (spawn) {
    if (!deckBlock) { toast(deckHub ? '中枢不养殖' : '先点一块非中枢的培育单元'); paintSheet(); return; }
    const here = tanks.find(t => t.species && t.bi === deckBlock.bi && t.bj === deckBlock.bj);
    if (here) { deckTank = here.id; toast('这块已经在养'); paintSheet(); return; }
    const free = tanks.find(t => !t.species);
    if (!free) { toast('四个槽都在用'); paintSheet(); return; }
    deckTank = free.id;
    const started = startCulture(free.id, spawn.dataset.spawn, deckBlock);
    if (!started.ok) toast(started.reason === 'feed' ? '饲料不足' : started.reason === 'hub' ? '中枢不养殖' : started.reason === 'mill' ? '这块是加工厂' : started.reason === 'busy' ? '这块已经在养' : '不能开始');
    else {
      const extra = started.peel ? ` · 皮 −${stockText(started.peel)}` : '';
      const bill = started.utility ? ` · 水电 −${fmt(started.utility)}` : '';
      toast(`${started.name}已装上 ${secName(deckBlock.bi, deckBlock.bj)}${extra}${bill}`);
      saveSoon();
    }
    syncCultureArt();
    placeTanks();
    paintSheet();
    paintKpi();
    return;
  }
  if (e.target.id === 'tend') {
    const tended = tendCulture(deckTank);
    if (!tended.ok) toast('这口槽是空的');
    else { orderArm(deckTank, 'tend'); toast('机械臂过去照料'); }
    paintSheet();
    return;
  }
  if (e.target.id === 'harvest') {
    orderArm(deckTank, 'harvest');
    const got = harvestCulture(deckTank);
    if (!got.ok) toast(got.reason === 'early' ? '还没到收获日' : '这口槽是空的');
    else { toast(`<b>入仓</b>${got.lot.name}`); syncCultureArt(); placeTanks(); saveSoon(); }
    paintSheet();
    return;
  }
  if (e.target.id === 'buy') {
    const bought = buyItem(shopPick, $('shop-qty')?.value);
    if (!bought.ok && bought.reason === 'money') toast('营收不够');
    else if (!bought.ok) toast('请填购买数量');
    else toast(`<b>−${fmt(bought.cost)}</b>${bought.name} ${bought.n}`);
    paintSheet();
    paintKpi();
    saveSoon();
    return;
  }
  if (e.target.id === 'sell') {
    if (!pickedStack) return;
    const cropId = pickedStack.split('|')[0];
    const frac = (+$('sell-pct')?.value || 100) / 100;
    const sold = sellStack(cropId, frac);
    if (!sold) toast('这仓已经不在了');
    else toast(`<b>+${fmt(sold.listPrice)}</b>${sold.name}`);
    paintSheet();
    saveSoon();
  }
});
paintModes();
// 分层面板：列出 LAYERS（剖面打开时，被剖开的层高亮）
$('layers').innerHTML = `<div class="lh">分层 · LAYERS <em>点一层 · C</em></div>` + LAYERS.map(l => `<div class="ly ly-${l.id}" data-layer="${l.id}"><i></i><span>${l.name}</span><small>${l.en}</small><em>${l.floor === 0 ? '±0 m' : l.floor.toFixed(0) + ' m'}</em></div>`).join('');
function paintLayers() {
  document.querySelectorAll('#layers .ly').forEach(el => el.classList.toggle('on', el.dataset.layer === viewLayer));
  document.body.classList.toggle('underground', viewLayer !== 'surface');
}
paintLayers();
$('layers').addEventListener('click', e => {
  const row = e.target.closest('[data-layer]');
  if (row) showLayer(row.dataset.layer);
});
const pv = new THREE.Vector3();
function project(x, y, z) {
  const cx = U.uCurve.value.x, R0 = RING.R, th = (x - cx) / R0, r = R0 - y;   // 与 curveWorld 相同的环带卷曲
  pv.set(cx + r * Math.sin(th), R0 - r * Math.cos(th), z).project(cam);
  return pv.z < 1 && pv.z > -1 ? [(pv.x * 0.5 + 0.5) * innerWidth, (-pv.y * 0.5 + 0.5) * innerHeight] : null;
}
const secName = (bi, bj) => `S-${String(bi).padStart(2, '0')}${String(bj).padStart(2, '0')}`;
const cellCode = (i, j) => `G-${String(i).padStart(3, '0')}${String(j).padStart(2, '0')}`;
function fillDeckLabels(want, d) {
  const y = layerFloor() + 2;
  const aSec = Math.min(1, Math.max(0, (d - 500) / 400));
  if (aSec > 0) for (let bj = PLOT.bj0; bj <= PLOT.bj1; bj++) for (let bi = PLOT.bi0; bi <= PLOT.bi1; bi++) {
    const x = L.X0 + bi * L.BP + L.BLOCK / 2, z = L.Z0 + bj * L.BP + L.BLOCK / 2;
    if (Math.hypot(x - camS.x, z - camS.z) > d * 1.05) continue;
    const hub = bi === L.HUBX && bj === L.HUBZ;
    const name = hub ? '中枢' : secName(bi, bj);
    const sub = hub ? `${layerNow().name} · 与地表中枢对齐` : '大格';
    want.push({ x, z, y, pr: hub ? 0 : 1, a: aSec, html: `<b>${name}</b><small>${sub}</small>`, cls: hub ? 'hub' : 'sec' });
  }
  const aCell = Math.min(1, Math.max(0, (1100 - d) / 500));
  if (aCell > 0) for (const f of fields) {
    if (!f.inPlot) continue;
    const x = f.x0 + L.FIELD / 2, z = f.z0 + L.FIELD / 2;
    if (Math.hypot(x - camS.x, z - camS.z) > Math.min(d * 1.1, 780)) continue;
    const hit = deckHover && deckHover.i === f.i && deckHover.j === f.j;
    let tank = -1;
    if (viewLayer === 'grow') for (let t = 0; t < tankPos.length; t++) if (Math.abs(tankPos[t].x - x) < 2 && Math.abs(tankPos[t].z - z) < 2) tank = t;
    const hub = Math.floor(f.i / L.PER) === L.HUBX && Math.floor(f.j / L.PER) === L.HUBZ;
    let title = cellCode(f.i, f.j), sub = hub ? '中枢格' : '空格';
    const mill = devices.find(d => d.kind === 'mill');
    const millHere = !!(mill && Math.abs(mill.x - x) < 2 && Math.abs(mill.z - z) < 2);
    if (millHere) {
      const w = millWatch();
      title = '加工厂';
      sub = w.state === 'build' ? '施工中' : w.state === 'job' ? '加工中' : '可加工';
    }
    if (tank >= 0) {
      const w = cultureWatch(tanks[tank]);
      title = `槽 ${tank + 1}`;
      sub = w ? `${w.name} · 第 ${Math.floor(w.day)} 日` : '空槽';
    }
    want.push({ x, z, y, pr: tank >= 0 ? 0 : 2, a: aCell, html: `<b>${title}</b><span>${sub}</span>`, cls: 'fld' + (hit || tank === deckTank && tank >= 0 ? ' act' : '') });
  }
}
let pickSig = '';
function paintPickEdges() {
  const on = mode === 'scheme' && viewLayer === 'surface' && pickedFields.size > 0;
  edgeMesh.visible = on;
  if (!on) {
    if (edgeMesh.count) edgeMesh.count = 0;
    pickSig = '';
    return;
  }
  const sig = [...pickedFields].join(',');
  if (sig === pickSig) return;
  pickSig = sig;
  const w = 1.15, y = 0.38, h = 0.28, inset = 2.2;
  let n = 0;
  for (const idx of pickedFields) {
    const f = fields[idx];
    if (!f || n + 4 > edgeMesh.instanceMatrix.count) continue;
    const x0 = f.x0, z0 = f.z0, x1 = x0 + L.FIELD, z1 = z0 + L.FIELD;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const span = L.FIELD - inset * 2;
    const place = (x, z, sx, sz) => {
      tmpM.compose(tmpP.set(x, y, z), tmpQ.identity(), tmpS.set(sx, h, sz));
      edgeMesh.setMatrixAt(n++, tmpM);
    };
    place(mx, z0 + inset, span, w);
    place(mx, z1 - inset, span, w);
    place(x0 + inset, mz, w, span);
    place(x1 - inset, mz, w, span);
  }
  edgeMesh.count = n;
  edgeMesh.instanceMatrix.needsUpdate = true;
}
function paintPicks() {
  const host = $('picks');
  if (host && host.childElementCount) host.innerHTML = '';
  paintPickEdges();
}
function updateLabels(d) {
  const want = [];
  if (camS.deck) { fillDeckLabels(want, d); }
  const far = !camS.deck && d > 1500, mid = !camS.deck && d > 260 && d <= 1500, ops = !camS.deck && d <= 260 && d > 60;
  const aSec = !camS.deck ? Math.min(1, Math.max(0, (d - 1400) / 600)) : 0, aField = !camS.deck ? Math.min(1, Math.max(0, (d - 230) / 120)) * (1 - Math.min(1, Math.max(0, (d - 1300) / 300))) : 0;
  if (aSec > 0) for (let bj = 0; bj < L.NBZ; bj++) for (let bi = 0; bi < L.NBX; bi++) {
    const x = L.X0 + bi * L.BP + L.BLOCK / 2, z = L.Z0 + bj * L.BP + L.BLOCK / 2;
    if (Math.hypot(x - camS.x, z - camS.z) > d * 1.0) continue;
    const hub = bi === L.HUBX && bj === L.HUBZ; if (!hub && (bi % 3 !== 1 || bj % 3 !== 1)) continue;
    want.push({ x, z, pr: hub ? 0 : 1, a: aSec, html: hub ? `<b>中枢 · CENTRAL HUB</b><small>试验卫星 · 农神VIII</small>` : `<b>${secName(bi, bj)}</b><small>邻区</small>`, cls: hub ? 'hub' : 'sec' });
  }
  if (aField > 0) for (const f of fields) {
    if (f.crop < 0) continue; const x = f.x0 + 64, z = f.z0 + 64; if (Math.hypot(x - camS.x, z - camS.z) > Math.min(d * 1.15, 720) || inCut(x, z, 40)) continue;
    const watch = cropWatch(f);
    const st = f.bUnit?.label || (watch ? `${watch.label} · 第 ${Math.floor(watch.day)} 日` : (f.state === 3 ? '作业' : '定格冠层'));
    const sw = watch ? PALETTE.olive : PALETTE.rego;
    want.push({ x, z, pr: 2, a: aField, html: `<i style="background:${sw}"></i><b>F-${String(f.i).padStart(2, '0')}${String(f.j).padStart(2, '0')}</b><span>${st}</span>`, cls: 'fld' + ((f === selected || watch) ? ' act' : '') });
  }
  if (ops) for (const h of nearH.slice(0, 6)) if (h.mode === 'cut' || h.mode === 'turn') want.push({ x: h.x, z: h.z, y: 8, pr: 3, a: Math.min(1, (260 - d) / 60) * Math.min(1, (d - 60) / 30), html: `<b>H-${String(h.id).padStart(3, '0')}</b><span>作业</span>`, cls: 'veh' });
  if (!camS.deck) for (const r of rigs) if (r.busy) want.push({ x: r.x, z: r.z, y: 6, pr: 3, a: Math.min(1, Math.max(0, (1400 - d) / 500)), html: `<b>${r.label}</b>`, cls: 'veh' });
  if (cut.on && d < 2200) {
    const I = cutInner(), a = 1 - Math.min(1, Math.max(0, (d - 1500) / 500));
    want.push({ x: cut.x + 58, z: cut.z, y: LAYERS[1].floor + 2, pr: -2, a, html: `<b>${LAYERS[1].name}</b><small>${DECK_CLIMATE.temp}°C · 湿度 ${DECK_CLIMATE.rh}% · 蛴螬 / 黑水虻</small>`, cls: 'hub deck' });
    want.push({ x: (I.x0 + I.x1) / 2, z: I.z0 + 20, y: LAYERS[2].floor, pr: -2, a, html: `<b>${LAYERS[2].name} · ${LAYERS[2].en}</b><small>${LAYERS[2].floor} m · 储液 / 泵站 / 管廊</small>`, cls: 'hub deck' });
  }
  if (!camS.deck) want.push({ x: HUBC, z: HUBC, pr: -1, a: (d > 260 && d <= 1500) ? 1 : 0, html: `<b>中枢 · CENTRAL HUB</b><small>试验卫星 · 农神VIII</small>`, cls: 'hub' });
  // 屏幕上贪心去重：间距不足就不显示
  const placed = []; let n = 0;
  want.sort((a, b) => a.pr - b.pr);
  for (const w of want) {
    if (w.a <= 0.01 || n >= LBL.length) continue;
    const s = project(w.x, w.y || 0, w.z); if (!s || s[0] < 30 || s[0] > innerWidth - 160 || s[1] < 70 || s[1] > innerHeight - 90) continue;
    const minD = w.cls === 'sec' ? 170 : 175;
    if (placed.some(p => Math.abs(p[0] - s[0]) < minD && Math.abs(p[1] - s[1]) < 46)) continue;
    placed.push(s); const el = LBL[n++];
    if (el._h !== w.html) { el.innerHTML = w.html; el._h = w.html; }
    el.className = 'lbl ' + w.cls; el.style.transform = `translate(${s[0].toFixed(1)}px,${s[1].toFixed(1)}px)`; el.style.opacity = w.a.toFixed(2);
  }
  for (; n < LBL.length; n++) LBL[n].style.opacity = 0;
}
function niceScale(mpp) { const target = mpp * 110; const p = Math.pow(10, Math.floor(Math.log10(target))); const m = [1, 2, 5, 10].find(v => v * p >= target * 0.6) * p; return [m, m / mpp]; }

// ---------------- 主循环 ----------------
let t = 0, last = performance.now(), fps = 60, frames = 0, fpsAcc = 0, fpsShow = 0;
const dt0 = 1 / 15; for (let s = 0; s < PREWARM * 15; s++) { t += dt0; step(dt0, t, economy.timeScale); }
let nearH = [];
// 预设视角（截图用）
function pickHarvester(minD = 400, maxD = 2500, want = 'maize') {
  let best = null, bs = -1e9;
  for (const h of harvesters) if (h.mode === 'cut' && h.f && Math.abs(h.u - 50) < 25 && (!want || CROPS[h.f.crop].id === want)) {
    const dd = Math.hypot(h.x - HUBC, h.z - HUBC); if (dd < minD || dd > maxD || inCrater(h.x, h.z, 250)) continue;
    const company = harvesters.filter(o => o !== h && Math.hypot(o.x - h.x, o.z - h.z) < 420).length;
    const sc = company * 10 - dd / 300 + 0; if (sc > bs) { bs = sc; best = h; }
  }
  return best || (maxD < 9000 ? pickHarvester(minD, maxD * 1.6, want) : want ? pickHarvester(400, 2500, null) : harvesters[0]);
}
if (VIEW === 'near') { const h = pickHarvester(); Object.assign(camS, { x: h.x + Math.cos(h.ang) * 6, z: h.z + Math.sin(h.ang) * 6, d: 48, yaw: Math.atan2(-Math.cos(h.ang), -Math.sin(h.ang)) + (+Q.get("ny") || 2.45) }); camS.follow = h; }
else if (VIEW === 'mid') Object.assign(camS, { x: HUBC - 260, z: HUBC + 60, d: 1300, yaw: 95 * DEG, pOff: -27 * DEG, lookUp: 21, fovAdd: 19 });
else if (VIEW === 'sector') Object.assign(camS, { x: HUBC + 240, z: HUBC - 260, d: 820, yaw: -20 * DEG });
else if (VIEW === 'cut') Object.assign(camS, { x: HUBC + 880, z: HUBC - 400, d: 560, yaw: 222 * DEG, pOff: -24 * DEG });
else if (VIEW === 'up') Object.assign(camS, { x: HUBC + 2600, z: HUBC - 700, d: 700, yaw: 104 * DEG, pOff: -30 * DEG, lookUp: 58, fovAdd: 34 });
else if (VIEW === 'ops') { const h = pickHarvester(); Object.assign(camS, { x: h.x, z: h.z - 40, d: 560, yaw: -0.3 }); }
else if (VIEW === 'hub') Object.assign(camS, { x: HUBC - 20, z: HUBC, d: 620, yaw: 0.5 });
else if (VIEW === 'far') Object.assign(camS, { x: HUBC + 500, z: HUBC + 250, d: 4800, yaw: 96 * DEG });
else Object.assign(camS, { x: focus.x, z: focus.z, d: 720, yaw: 118 * DEG, pOff: -8 * DEG, lookUp: 0, fovAdd: 6 });
Object.assign(camT, camS); followLock = camS.follow || null; delete camT.follow;
if (Q.get('cx')) { camS.x = camT.x = HUBC + +Q.get('cx'); camS.z = camT.z = HUBC + +(Q.get('cz') || 0); camS.follow = camT.follow = null; }
if (Q.get('d')) camS.d = camT.d = +Q.get('d');
if (Q.get('yaw')) camS.yaw = camT.yaw = +Q.get('yaw') * DEG;
if (Q.get('po')) camS.pOff = camT.pOff = +Q.get('po') * DEG;
if (Q.get('lu')) camS.lookUp = camT.lookUp = +Q.get('lu');
if (Q.has('cut') || VIEW === 'cut') setCut(true, camS.x, camS.z);

const SAVE_KEY = 'ringsheaf.nongshen8.v1';
const fmt = n => Math.round(n).toLocaleString('en-US');
function stockText(n) {
  const r = Math.round((+n || 0) * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
function millStatusText() {
  const mill = millWatch();
  const potatoL = Math.round(potatoStock());
  const need = mill.recipe.inputs.find(i => i.id === 'potato').qty;
  const starchN = warehouse.filter(lot => lot.crop === 'starch').length;
  let line = '还没建。点选址，再点一块非中枢的单元。';
  if (mill.state === 'build') line = `施工中 · 还要 ${Math.ceil(mill.left)} 日`;
  else if (mill.state === 'job') line = `正在加工 · 还要 ${Math.ceil(mill.left)} 日`;
  else if (mill.state === 'ready') line = `可以加工 · 仓库土豆 ${potatoL.toLocaleString('en-US')} L · 一批 ${need.toLocaleString('en-US')} L · 皮 ${stockText(stores.peel)} · 淀粉 ${starchN} 批`;
  return { mill, line };
}
const RESET_ASK = '清空本机存档，回到开局？仓棚和仓库都会去掉。';
const UNREADABLE_ASK = '这份存档的版本比现在的游戏新，或者读不了。清空本机存档，回到开局？仓棚和仓库都会去掉。留下则不改浏览器里的那份。';
let holdSave = false;
function saveNow() {
  if (holdSave) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(exportSnapshot())); } catch (e) { /* private mode */ }
}
function saveSoon() { clearTimeout(saveSoon.t); saveSoon.t = setTimeout(saveNow, 400); }
function loadNow() {
  let text = null;
  try { text = localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  if (!text) return false;
  let raw;
  try { raw = JSON.parse(text); } catch (e) { holdSave = true; return false; }
  const migrated = migrateSave(raw);
  if (!migrated.ok || !applySnapshot(migrated.data)) { holdSave = true; return false; }
  return true;
}
function offerUnreadableSave() {
  const ask = $('reset-ask');
  if (ask) ask.textContent = UNREADABLE_ASK;
  $('admin').classList.add('on');
  askReset(true);
}
let seenLog = 0, shownRev = -1;
function drainLog() {
  for (; seenLog < log.length; seenLog++) {
    const e = log[seenLog];
    if (e.type !== 'store' && e.type !== 'sale') continue;
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = e.type === 'sale' ? `<b>+${fmt(e.pay)}</b>${e.name}` : `<b>入仓</b>${e.name}`;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 4800);
    saveSoon();
  }
}
function paintKpi() {
  let act = 0;
  for (const r of rigs) if (r.busy) act++;
  const el = $('kpi-rev');
  el.textContent = fmt(economy.revenue);
  if (economy.revenue !== shownRev) {
    if (shownRev >= 0) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
    shownRev = economy.revenue;
  }
  $('kpi-act').textContent = String(act);
  paintWorldClock();
  const fleetN = $('kpi').querySelector('em');
  if (fleetN) fleetN.textContent = `/ ${rigs.length}`;
  $('stores').textContent = `种薯 ${stores.seed} · 豆种 ${stores.seed_soy || 0} · 麦种 ${stores.seed_barley || 0} · 甘蓝苗 ${stores.seedling_cabbage || 0} · 肥料 ${stockText(stores.fertilizer)} · 干燥剂 ${stores.spray}`;
}
function worldClockParts() {
  const day = Math.floor(worldDay);
  const mins = Math.floor((worldDay - day) * 1440 + 1e-6);
  const hh = Math.floor(mins / 60) % 24;
  const mm = mins % 60;
  return { day, hh, mm, hm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}
function paintWorldClock() {
  const c = worldClockParts();
  const dayEl = $('kpi-day');
  if (dayEl) dayEl.textContent = String(c.day);
  const hm = $('kpi-hm');
  if (hm) hm.textContent = c.hm;
  const hour = $('kpi-hh');
  const minute = $('kpi-mh');
  if (hour) hour.style.transform = `rotate(${((c.hh % 12) + c.mm / 60) * 30}deg)`;
  if (minute) minute.style.transform = `rotate(${c.mm * 6}deg)`;
  const rate = $('kpi-rate');
  if (rate) rate.textContent = formatTimeScale(economy.timeScale);
  paintRates();
  const clock = $('clock');
  if (clock) {
    const band = viewLayer === 'surface' && !camS.deck ? ` · ${sectorWord(camS.x, worldDay)}` : '';
    clock.textContent = paused ? `第 ${c.day} 日 · ${c.hm}${band} · 暂停` : `第 ${c.day} 日 · ${c.hm}${band}`;
  }
}
let dockHover = null;
let dockBarSig = '';
function jobRow(job) {
  const hot = job.status === '执行中' || job.status === '开来' || job.status === '转弯' || job.status === '等待' || job.status === '可派';
  const miss = job.status === '过期';
  const kind = job.kind === 'soft' ? '软' : job.kind === 'hard' ? '硬' : '';
  const span = job.full ? '全阶段' : (job.from != null && job.to != null ? `第 ${job.from}–${job.to} 日` : '');
  return `<div class="jb${hot ? ' run' : ''}${miss ? ' miss' : ''}"><b>${kind ? kind + ' ' : ''}${job.name}</b><span>${job.status}${job.pct ? ' ' + job.pct + '%' : ''}${span ? ' · ' + span : ''}</span></div>`;
}
function paintStageBar(desc) {
  const host = $('stagebar');
  if (!host) return;
  const stages = desc?.barStages || [];
  if (!stages.length) { host.innerHTML = '<span>还没有作物</span>'; dockBarSig = ''; return; }
  const cycle = desc.cycle || 1;
  const tailVis = Math.max(1, cycle * 0.12);
  const total = cycle + tailVis;
  const sig = stages.map(s => `${s.id}:${s.days}:${s.infinite}`).join('|');
  if (sig !== dockBarSig) {
    dockBarSig = sig;
    const names = stages.map(s => {
      const flex = s.infinite ? tailVis : s.days;
      return `<b class="${s.on ? 'on' : ''}" data-stage="${s.id}" style="flex:${flex} 1 0">${s.name}${s.infinite ? ' →' : ''}</b>`;
    }).join('');
    const segs = stages.map(s => {
      const flex = s.infinite ? tailVis : s.days;
      const wins = (s.jobs || []).map(job => {
        if (job.full || s.infinite) {
          return `<i class="win ${job.kind === 'soft' ? 'soft' : 'hard'}" style="left:0;right:0"></i>`;
        }
        if (!(s.days > 0) || job.from == null) return '';
        const origin = stages.filter(item => item !== s && stages.indexOf(item) < stages.indexOf(s) && !item.infinite).reduce((n, item) => n + item.days, 0);
        const a = Math.max(0, (job.from - origin) / s.days);
        const b = Math.min(1, (job.to - origin) / s.days);
        if (!(b > a)) return '';
        return `<i class="win ${job.kind === 'soft' ? 'soft' : 'hard'}" style="left:${(a * 100).toFixed(2)}%;width:${((b - a) * 100).toFixed(2)}%"></i>`;
      }).join('');
      const arrow = s.infinite ? `<i class="arrow" style="color:${s.color}"></i>` : '';
      return `<i class="seg${s.on ? ' on' : ''}" data-stage="${s.id}" style="flex:${flex} 1 0;background:${s.color}">${wins}${arrow}</i>`;
    }).join('');
    const finitePct = (cycle / total) * 100;
    const fullPct = (desc && PLANT_CROPS.lastika.maturity ? (PLANT_CROPS.lastika.maturity.fullAt / cycle) : (10 / cycle)) * finitePct;
    host.innerHTML = `<div class="names">${names}</div><div class="track">${segs}<i class="cursor"></i></div><div class="mature"><i style="left:0;width:${fullPct.toFixed(2)}%;background:linear-gradient(90deg,#51542c,#787c32)"></i><i style="left:${fullPct.toFixed(2)}%;width:${(finitePct - fullPct).toFixed(2)}%;background:#d8c36a"></i></div>`;
  }
  const cursor = host.querySelector('.cursor');
  if (cursor) {
    const age = Math.max(0, Math.min(desc.age || 0, cycle));
    cursor.style.left = `${(age / total) * 100}%`;
  }
}
function updateDock() {
  const el = $('dock');
  const desc = selected?.owned ? dockOf(selected) : null;
  const chip = $('suspend');
  if (chip) {
    const title = desc?.suspend?.title || '';
    chip.classList.toggle('on', !!title);
    chip.textContent = title;
  }
  const show = viewLayer === 'surface' && selected && (mode === 'look' || mode === 'plan');
  if (!show) { el.classList.remove('on'); dockHover = null; return; }
  el.classList.add('on');
  const f = selected;
  const addr = desc?.plot || '';
  $('selid').textContent = addr ? `C0 · ${addr}` : `F-${String(f.i).padStart(3, '0')}${String(f.j).padStart(2, '0')}`;
  const workEl = $('selwork');
  if (workEl) {
    const badge = !selNote && f.owned ? (desc?.badge || '') : '';
    workEl.hidden = !badge;
    workEl.textContent = badge;
  }
  const sum = $('crop-sum');
  if (sum) {
    if (!f.owned) sum.textContent = selNote || '邻区快照 · 只读';
    else if (!desc?.crop) sum.textContent = desc?.stat || '未整地';
    else {
      const quality = desc.quality == null ? '—' : desc.quality;
      sum.innerHTML = `<b>${desc.crop}</b> · ${desc.stageName || '播种'} · ${(desc.age || 0).toFixed(1)} / ${desc.cycle || 0} 世界日<br><span>成熟度 ${Math.round(desc.maturity || 0)}% · 产量值 ${desc.yieldValue ?? '—'} · 品质值 ${quality}</span>`;
    }
  }
  const jobsHost = $('dock-jobs');
  if (jobsHost) {
    const hover = dockHover && desc?.barStages?.find(s => s.id === dockHover);
    const rows = hover ? hover.jobs : (desc?.jobs || []);
    const label = $('dock-jobs-lab');
    if (label) label.textContent = hover ? `当前阶段作业监控 · ${hover.name}` : '当前阶段作业监控';
    jobsHost.innerHTML = rows.length ? rows.map(jobRow).join('') : '<div class="jb"><b>无</b><span>这一阶段没有作业</span></div>';
  }
  paintStageBar(desc);
  const ops = $('dock-ops');
  if (ops) {
    const actions = desc?.actions || [];
    ops.style.gridTemplateColumns = `repeat(${Math.max(actions.length, 1)}, minmax(0, 1fr))`;
    ops.innerHTML = actions.map(act => `<button type="button" data-act="${act.id}"${act.enabled ? '' : ' disabled'}><b>${act.name}</b></button>`).join('');
  }
}
function paintRates() {
  document.querySelectorAll('#rates button').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.rate - economy.timeScale) < 1e-6));
  const input = $('rate-in');
  if (input && document.activeElement !== input) input.value = String(economy.timeScale);
}
function paintStageChrome(note) {
  const label = $('stage-src-label');
  if (label) label.innerHTML = `拉斯提卡 · <b>${stageBadge()}</b>`;
  const err = $('stage-src-err');
  if (err) err.textContent = note || '';
  plantWin = { x: 1e9, z: 1e9, w: 0 };
  document.querySelectorAll('#selbtns button').forEach(b => {
    const def = cropDef(b.dataset.crop);
    const crop = CROPS.find(c => c.id === b.dataset.crop);
    const name = b.querySelector('b');
    if (name && crop) name.textContent = crop.name;
    const small = b.querySelector('small');
    if (!small || !def || !crop) return;
    const seedName = productById(def.seed)?.nameZh || '种子';
    small.textContent = `${seedName} ${def.seedQty} · 肥料 1 · ${crop.days} 日`;
  });
  if ($('admin')?.classList.contains('crop')) paintCropBook();
  updateDock();
}
function adoptStageText(text, persist) {
  let raw;
  try { raw = JSON.parse(text); }
  catch { paintStageChrome('这份不是 JSON'); return { ok: false }; }
  const applied = applyStagePayload(raw);
  if (!applied.ok) {
    paintStageChrome(applied.message || '里面没有拉斯提卡');
    return applied;
  }
  if (persist) {
    try { writeStageStore(localStorage, applied.doc); }
    catch { /* 无痕模式仍可用这一次 */ }
  }
  bindPlayableClocks();
  const extra = applied.siblingNotes?.length ? applied.siblingNotes.join('；') : '';
  paintStageChrome(extra);
  return applied;
}
function reloadStageStore() {
  try { resumeLastikaStage(localStorage); } catch { /* 无痕模式 */ }
  const booted = bootFieldStageSource(localStorage, null);
  bindPlayableClocks();
  if (!booted.ok) {
    paintStageChrome(booted.message || '工坊存档读不了');
    return booted;
  }
  paintStageChrome(booted.skipped ? '这台浏览器里没有拉斯提卡工坊档，仍用仓库默认' : '');
  return booted;
}
function useRepoStages() {
  let kept = false;
  try { kept = suspendLastikaStage(localStorage).kept; } catch { /* 无痕模式 */ }
  bootFieldStageSource(localStorage, 'repo');
  bindPlayableClocks();
  paintStageChrome(kept ? '已改用仓库里的拉斯提卡。工坊档还在这台浏览器里，重读即可恢复。' : '');
}
function bindPlayableClocks() {
  bindPotatoClock();
  for (const id of ['soy', 'feed_barley', 'cabbage']) bindSurfaceClock(id);
}
function stageParamIsUrl(param) {
  return !!param && param !== 'repo' && param !== 'workshop' && /^(https?:|data:|\.\/|\/|data\/)/.test(param);
}
function reloadWorkshopMachines() {
  bootWorkshopMachines(localStorage);
}
reloadWorkshopMachines();
addEventListener('focus', reloadWorkshopMachines);
addEventListener('pageshow', reloadWorkshopMachines);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') reloadWorkshopMachines();
});
function bootStagesSync() {
  const param = Q.get('stages');
  if (stageParamIsUrl(param)) return '';
  const booted = bootFieldStageSource(localStorage, param === 'repo' ? 'repo' : null);
  bindPlayableClocks();
  if (booted.origin === 'workshop') return '';
  if (!booted.ok) return booted.message || '工坊存档读不了，仍用仓库默认';
  return '';
}
const bootStageNote = bootStagesSync();
$('kpi').innerHTML = `<div class="k-rev"><small>营收</small><b class="hv" id="kpi-rev">0</b></div><div class="k-day"><small>世界日</small><b id="kpi-day">0</b></div><div class="k-time"><small>时刻</small><span class="clk"><i class="face" id="kpi-face" aria-hidden="true"><i id="kpi-hh"></i><i id="kpi-mh"></i></i><b id="kpi-hm">00:00</b><b id="kpi-rate">1×</b></span></div><div class="k-act"><small>作业</small><b class="hv" id="kpi-act">0</b><em>/ ${rigs.length}</em></div>`;
$('dock').innerHTML = `<div class="drow"><div class="dlab">单元信息</div><div class="who"><div class="name"><b id="selid"></b><em id="selwork" hidden></em></div></div></div><div class="drow"><div class="dlab">作物概况</div><div class="sum" id="crop-sum"></div></div><div class="drow"><div class="dlab" id="dock-jobs-lab">当前阶段作业监控</div><div id="dock-jobs" class="jobs"></div></div><div class="drow"><div class="dlab">生长阶段监控</div><div id="stagebar"></div></div><div class="drow"><div class="dlab">操作按钮</div><div class="ops" id="dock-ops"></div></div>`;
$('dock').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  if (btn.dataset.act === 'prep') doPrep();
  if (btn.dataset.act === 'plant') doPlant();
});
$('dock').addEventListener('pointerover', (e) => {
  const seg = e.target.closest('[data-stage]');
  const id = seg?.dataset.stage || null;
  if (id === dockHover) return;
  dockHover = id;
  updateDock();
});
$('dock').addEventListener('pointerout', (e) => {
  if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#stagebar')) return;
  if (!dockHover) return;
  dockHover = null;
  updateDock();
});
const RATE_STOPS = [1, 4, 12, 120, 1000];
$('rates').innerHTML = `<span>1×：1 分 = 2 世界时</span>` + RATE_STOPS.map(r => `<button type="button" data-rate="${r}">${r}×</button>`).join('') + `<input id="rate-in" type="text" inputmode="decimal" value="1" aria-label="世界钟倍率" autocomplete="off">`;
function stepRate(dir) {
  const cur = economy.timeScale;
  let i;
  if (dir > 0) {
    i = RATE_STOPS.findIndex(r => r > cur + 1e-6);
    if (i < 0) i = 0;
  } else {
    i = -1;
    for (let k = 0; k < RATE_STOPS.length; k++) if (RATE_STOPS[k] < cur - 1e-6) i = k;
    if (i < 0) i = RATE_STOPS.length - 1;
  }
  setTimeScale(RATE_STOPS[i]);
  paintWorldClock();
  saveSoon();
}
function applyTypedRate() {
  const v = +$('rate-in').value;
  if (!(v > 0)) { paintWorldClock(); return; }
  setTimeScale(v); paintWorldClock(); saveSoon();
}
$('rates').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setTimeScale(+b.dataset.rate); paintWorldClock(); saveSoon(); });
$('stage-help')?.addEventListener('click', () => {
  const note = $('stage-help-note');
  if (!note) return;
  const open = note.hidden;
  note.hidden = !open;
  $('stage-help').setAttribute('aria-expanded', open ? 'true' : 'false');
});
$('rate-in').addEventListener('focus', e => e.target.select());
$('rate-in').addEventListener('mouseup', e => e.preventDefault());
$('rate-in').addEventListener('change', applyTypedRate);
$('rate-in').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyTypedRate(); } });
paintRates();
const ADMIN_POS_KEY = 'ringsheaf.admin.pos';
function placeAdmin(x, y) {
  const el = $('admin');
  const w = el.offsetWidth || 228;
  x = Math.max(8, Math.min(innerWidth - w - 8, x));
  y = Math.max(8, Math.min(innerHeight - 48, y));
  el.style.left = Math.round(x) + 'px';
  el.style.top = Math.round(y) + 'px';
}
function restoreAdminPos() {
  try {
    const raw = localStorage.getItem(ADMIN_POS_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) placeAdmin(p.x, p.y);
  } catch (e) { /* private mode */ }
}
function toggleAdmin() {
  const el = $('admin');
  const open = el.classList.toggle('on');
  if (open) restoreAdminPos();
}
$('admin-toggle').addEventListener('click', toggleAdmin);
$('admin').querySelector('.ah').addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('button')) return;
  const el = $('admin');
  const bar = e.currentTarget;
  const r = el.getBoundingClientRect();
  const ox = e.clientX - r.left, oy = e.clientY - r.top;
  bar.setPointerCapture(e.pointerId);
  const move = ev => placeAdmin(ev.clientX - ox, ev.clientY - oy);
  const up = () => {
    bar.removeEventListener('pointermove', move);
    bar.removeEventListener('pointerup', up);
    try {
      const box = el.getBoundingClientRect();
      localStorage.setItem(ADMIN_POS_KEY, JSON.stringify({ x: Math.round(box.left), y: Math.round(box.top) }));
    } catch (err) { /* private mode */ }
  };
  bar.addEventListener('pointermove', move);
  bar.addEventListener('pointerup', up);
  e.preventDefault();
});
restoreAdminPos();
function paintCropBook() {
  const host = $('cropbook');
  if (!host) return;
  const gantt = stages => {
    if (!stages.length) return '';
    const growth = stages.map(s => `<i style="flex:${s.days} 1 0;background:${s.color}" title="${s.name} 第 ${s.from}–${s.to} 日"><em>${s.name}</em></i>`).join('');
    const jobs = stages.map(s => `<i style="flex:${s.days} 1 0;background:${s.machine ? s.color : 'transparent'}" title="${s.machine ? s.machine + ' 第 ' + s.machineAt + ' 日 · ' + s.effect : '这一段没有农机'}"><em>${s.machine || ''}</em></i>`).join('');
    return `<div class="meta">生长阶段 · 同一时间只在一段里</div><div class="gantt">${growth}</div><div class="meta">作业窗口 · 机器和效果写在阶段上</div><div class="gantt jobs">${jobs}</div><p class="note">下面是旧作物表，主游戏种植不读。拉斯提卡在上面。</p>`;
  };
  const bCrop = PLANT_CROPS.lastika;
  const bPaints = bCrop.paints || {};
  const matureMinutes = Math.round((bCrop.growDays * DAY_SECONDS) / 60);
  const bStages = bCrop.stages.map(s => {
    const soft = (s.soft || []).map(j => `${j.name} 第 ${j.from}–${j.to} 世界日`).join('，');
    const kind = s.days > 0 ? `${s.days} 世界日` : (s.role === 'tail' ? '可再种尾' : s.role === 'rot' ? '腐烂尽头' : '等到硬作业');
    return `<div class="io"><span>${s.name}</span><span>${kind}${soft ? ' · ' + soft : ''}</span></div>`;
  }).join('');
  host.innerHTML = `<p class="lead">拉斯提卡 · ${stageBadge()}。阶段图只读工坊或仓库 lastika.json。整地不在图里。生长到点进成熟，错过收获窗进腐烂，收拾后才可再种。软作业默认不改田面色。</p><div class="crop"><b>${bCrop.name}</b><div class="meta">生长 ${bCrop.growDays} 世界日 · 1× 约 ${matureMinutes} 现实分钟 · 田面 ${bPaints.raw || ''} / ${bPaints.young || ''} / ${bPaints.ripe || ''}</div>${bStages}</div>` + CROPS.map(c => {
    const d = cropDossier(c.id);
    const stages = d.stages.length
      ? d.stages.map(s => `<div class="io"><span><i style="background:${s.color}"></i>${s.name}</span><span>第 ${s.from}–${s.to} 日 · ${s.days} 日${s.machine ? ' · ' + s.machine : ''}</span></div>`).join('')
      : `<div class="io"><span>阶段</span><span>无</span></div>`;
    const inputs = d.inputs.length
      ? d.inputs.map(i => `<div class="io"><span>${i.name}</span><span>${i.qty} ${i.unit}${i.charged ? '' : ' · 列出，不扣'}</span></div>`).join('')
      : `<div class="io"><span>投入</span><span>这一季不种</span></div>`;
    const outputs = d.outputs.length
      ? d.outputs.map(o => `<div class="io"><span>${o.name}</span><span>${fmt(o.liters)} ${o.unit} · 牌价 ${fmt(o.price)}</span></div>`).join('')
      : `<div class="io"><span>产出</span><span>这一季不入仓</span></div>`;
    const span = d.plantable ? `${d.days} 日` : `参考 ${d.days} 日`;
    return `<div class="crop"><b>${d.name}</b><div class="meta">${d.analog} · ${span}</div><div class="meta">${d.yieldNote}</div>${gantt(d.stages)}<div class="meta">阶段</div>${stages}<div class="meta">投入</div>${inputs}<div class="meta">产出</div>${outputs}</div>`;
  }).join('');
}
function setAdminTab(which) {
  const crop = which === 'crops';
  $('admin').classList.toggle('crop', crop);
  $('tab-clock').classList.toggle('on', !crop);
  $('tab-crops').classList.toggle('on', crop);
  if (crop) paintCropBook();
}
$('tab-clock').addEventListener('click', () => setAdminTab('clock'));
$('tab-crops').addEventListener('click', () => setAdminTab('crops'));
$('stage-reload').addEventListener('click', reloadStageStore);
$('stage-repo').addEventListener('click', useRepoStages);
$('stage-apply').addEventListener('click', () => adoptStageText($('stage-paste').value, true));
$('stage-file').addEventListener('change', () => {
  const file = $('stage-file').files && $('stage-file').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => adoptStageText(String(reader.result || ''), true);
  reader.readAsText(file);
});
paintStageChrome(bootStageNote);
if (stageParamIsUrl(Q.get('stages'))) {
  fetch(Q.get('stages')).then(res => {
    if (!res.ok) throw new Error('取不到阶段文件');
    return res.text();
  }).then(text => adoptStageText(text, true)).catch(() => {
    const booted = bootFieldStageSource(localStorage, null);
    bindPlayableClocks();
    paintStageChrome(booted.origin === 'workshop' ? '地址栏上的阶段没取到，改用浏览器里的工坊存档' : '地址栏上的阶段没取到，仍用仓库默认');
  });
}
function paintPause() {
  $('pause').textContent = paused ? '继续' : '暂停';
  $('pause').classList.toggle('on', paused);
  paintWorldClock();
}
function paintLockDay() {
  const btn = $('lock-day');
  if (!btn) return;
  btn.textContent = lockDay ? '已锁白天' : '锁定白天';
  btn.classList.toggle('on', lockDay);
  btn.setAttribute('aria-pressed', lockDay ? 'true' : 'false');
}
$('lock-day').addEventListener('click', () => { lockDay = !lockDay; paintLockDay(); });
paintLockDay();
$('pause').addEventListener('click', () => { setPaused(!paused); paintPause(); });
function askReset(on) { $('admin').classList.toggle('on-reset', on); }
$('reset').addEventListener('click', () => { $('reset-ask').textContent = RESET_ASK; askReset(true); });
$('reset-no').addEventListener('click', () => {
  askReset(false);
  $('reset-ask').textContent = RESET_ASK;
  if (holdSave) toast('浏览器里的存档留着，这一局不会写回去。');
});
$('reset-yes').addEventListener('click', () => {
  askReset(false);
  $('reset-ask').textContent = RESET_ASK;
  holdSave = false;
  millPlace = false;
  planCycle = false;
  planBuy = false;
  resetGame();
  bindSlice();
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* private mode */ }
  clearTimeout(saveSoon.t);
  seenLog = 0;
  shownRev = -1;
  watchRig = null;
  if (viewLayer !== 'surface' || cut.on) showLayer('surface');
  returnToLook();
  frameFocus();
  paintKpi();
  paintRates();
  paintPause();
  updateDock();
  saveNow();
});
$('assets-open').addEventListener('click', () => { $('admin').classList.remove('on'); toggleViewer(); });
paintPause();
let viewerBuilt = false;
const THW = 220, THH = 140;
let thumbRT = null;
function thumbTarget() {
  if (!thumbRT) thumbRT = new THREE.WebGLRenderTarget(THW, THH, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
  return thumbRT;
}
function blitThumb(canvas) {
  const buf = new Uint8Array(THW * THH * 4);
  R.readRenderTargetPixels(thumbTarget(), 0, 0, THW, THH, buf);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(THW, THH);
  for (let y = 0; y < THH; y++) img.data.set(buf.subarray((THH - 1 - y) * THW * 4, (THH - y) * THW * 4), y * THW * 4);
  ctx.putImageData(img, 0, 0);
}
function shoot(cam, canvas, keep, prepare) {
  const vis = scene.children.map(c => [c, c.visible]);
  const curve = U.uCurve.value.clone();
  const gpos = ground.position.clone();
  const clear = R.getClearColor(new THREE.Color());
  const alpha = R.getClearAlpha();
  const target = R.getRenderTarget();
  const shadows = R.shadowMap.enabled;
  for (const c of scene.children) c.visible = keep.has(c);
  R.shadowMap.enabled = false;
  try {
    if (prepare) prepare();
    R.setRenderTarget(thumbTarget());
    R.setClearColor(0x12141c, 1);
    R.clear(true, true, true);
    R.render(scene, cam);
    blitThumb(canvas);
  } finally {
    for (const [c, v] of vis) c.visible = v;
    U.uCurve.value.copy(curve);
    ground.position.copy(gpos);
    R.setClearColor(clear, alpha);
    R.setRenderTarget(target);
    R.shadowMap.enabled = shadows;
  }
}
function shootField(f, canvas, poke) {
  const o = (f.j * NFX + f.i) * 4;
  const prev = poke ? fieldData.slice(o, o + 4) : null;
  if (poke) {
    fieldData[o] = poke.crop; fieldData[o + 1] = poke.g; fieldData[o + 2] = poke.s; fieldData[o + 3] = poke.dir;
    fieldTex.needsUpdate = true;
  }
  const cx = f.x0 + L.FIELD * 0.5, cz = f.z0 + L.FIELD * 0.5;
  const cam = new THREE.OrthographicCamera(-9, 9, 9 * THH / THW, -9 * THH / THW, 0.1, 90);
  cam.position.set(cx, 28, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz);
  shoot(cam, canvas, new Set([ground, sun, sun.target, hemi]), () => {
    U.uCurve.value.set(cx, 0, RING.R);
    ground.position.set(Math.round(cx / (RING.CIRC / 760)) * (RING.CIRC / 760), 0, 0);
  });
  if (prev) { fieldData.set(prev, o); fieldTex.needsUpdate = true; }
}
function shootMachine(builder, canvas) {
  const group = new THREE.Group();
  const kit = builder();
  for (const k of ['light', 'dark', 'glass', 'emis']) if (kit[k]) group.add(new THREE.Mesh(kit[k], MAT[k]));
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const ax = U.uCurve.value.x;
  group.position.set(ax - center.x, -box.min.y, -center.z);
  scene.add(group);
  const look = new THREE.Vector3(ax, Math.max(size.y, 1) * 0.42, 0);
  const dist = Math.max(size.x, size.y, size.z, 3.5) * 1.5;
  const cam = new THREE.PerspectiveCamera(32, THW / THH, 0.05, 400);
  cam.position.set(look.x + dist * 0.95, look.y + dist * 0.46, look.z + dist * 0.72);
  cam.lookAt(look);
  shoot(cam, canvas, new Set([group, sun, sun.target, hemi]));
  scene.remove(group);
  group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
}
function assetCard(name) {
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'card';
  el.innerHTML = '<b></b><canvas width="220" height="140"></canvas>';
  el.querySelector('b').textContent = name;
  el.addEventListener('click', () => {
    document.querySelectorAll('#viewer .card').forEach(c => c.classList.remove('on'));
    el.classList.add('on');
  });
  return el;
}
function buildViewer() {
  if (viewerBuilt) return;
  for (const id of ['view-stages', 'view-machines', 'view-tiles']) $(id).replaceChildren();
  const potato = CROPS.findIndex(c => c.id === 'potato');
  const host = fieldAt(focus.i, focus.j);
  for (const [name, g] of [['整地', 1], ['播种', 2.1], ['出苗', 3.2], ['培土', 4.2], ['膨大', 5.2], ['杀秧', 6.2], ['待收', 7.2]]) {
    const el = assetCard(name); $('view-stages').appendChild(el);
    shootField(host, el.querySelector('canvas'), { crop: potato, g, s: L.LANES, dir: 0 });
  }
  const kitName = {
    tractor_gen: '通用拖拉机', harvester_combine: '联合收割机', harvester_potato: '薯类收获机', harvester_cabbage: '结球收获机', transplanter: '移栽机',
    impl_rotavator: '旋耕机', impl_subsoiler: '深松机', impl_cultivator: '中耕机', impl_fertilizer: '施肥机', impl_sprayer: '喷雾机',
    impl_seeder: '精量播种机', impl_potato_planter: '薯类播种机', impl_haulm: '打秧机', impl_trailer: '运输挂车', impl_bedder: '作畦机', orbit_boom: '轨道喷杆',
    device_drone_base: '无人机基站', drone_scout: '侦察无人机', drone_treat: '植保无人机',
  };
  for (const id of Object.keys(kitName)) {
    const el = assetCard(kitName[id]); $('view-machines').appendChild(el);
    shootMachine(() => surfaceKits[id], el.querySelector('canvas'));
  }
  const tileName = { drill: '条播田块', wide: '宽行田块', ridges: '垄作田块', paddy: '水田', beds: '菜畦' };
  for (const tex of Object.keys(tileName)) {
    const f = fields.find(ff => ff.crop >= 0 && CROPS[ff.crop].tex === tex && ff.g > 0.35 && ff.state !== 0 && ff.state !== 3);
    if (!f) continue;
    const el = assetCard(tileName[tex]); $('view-tiles').appendChild(el);
    shootField(f, el.querySelector('canvas'));
  }
  viewerBuilt = true;
}
function toggleViewer() {
  const open = $('viewer').classList.toggle('on');
  if (open) buildViewer();
}
$('viewer-close').addEventListener('click', () => $('viewer').classList.remove('on'));
if (!VIEW && !Q.has('fresh')) {
  loadNow();
  if (holdSave) offerUnreadableSave();
}
function bindSlice() {
  onAfterStep(tickSlice);
  bootSlice({
    fields, rigs, focus,
    length: L.FIELD, width: L.FIELD,
    originI: L.HUBX * L.PER + Math.floor(L.PER / 2),
    originJ: L.HUBZ * L.PER + Math.floor(L.PER / 2),
    toWorld,
    timeScale: () => economy.timeScale,
    paused: () => paused,
  });
}
bindSlice();
{
  const opening = fieldAt(focus.i, focus.j);
  if (opening?.owned) selectField(opening, '');
}
paintRates();
paintWorldClock();
addEventListener('beforeunload', saveNow);
writeFields();
function frame(now) {
  const raw = Math.max(0, (now - last) / 1000), rdt = Math.min(raw, 0.1); last = now;
  R.info.autoReset = false; R.info.reset();   // 统计整帧（含全部后期 pass）的 draw call 与三角形
  frames++; fpsAcc += raw; if (fpsAcc > 0.5) { fpsShow = frames / fpsAcc; frames = 0; fpsAcc = 0; }
  const dt = Math.min(rdt, 0.1); t += dt; U.uTime.value = t;
  step(dt, t, economy.timeScale); writeFields();
  // 镜头
  const ks = camT.d * 0.6 * dt; const s = Math.sin(camT.yaw), c = Math.cos(camT.yaw);
  if (keys.w || keys.arrowup) { camT.x -= s * ks; camT.z -= c * ks; } if (keys.s || keys.arrowdown) { camT.x += s * ks; camT.z += c * ks; }
  if (keys.a || keys.arrowleft) { camT.x -= c * ks; camT.z += s * ks; } if (keys.d || keys.arrowright) { camT.x += c * ks; camT.z -= s * ks; }
  if (keys.q) camT.yaw += dt; if (keys.e) camT.yaw -= dt;
  if (watchRig && !drag) { camT.x = camS.x = watchRig.x; camT.z = camS.z = watchRig.z; }
  if (followLock && !drag && !Q.has('nofollow')) { camT.x += (followLock.x - camT.x) * 0.5; camT.z += (followLock.z - camT.z) * 0.5; }
  const k = 1 - Math.exp(-dt * 7);
  for (const key of ['x', 'z', 'yaw', 'pOff', 'lookUp', 'fovAdd']) camS[key] += (camT[key] - camS[key]) * k;
  // 环向首尾相接：镜头绕环一圈后坐标回卷（画面不变）
  if (!followLock) { const wx = wrapX(camS.x); if (wx !== camS.x) { camT.x += wx - camS.x; camS.x = wx; } }
  camT.z = Math.max(RING.WALL_A + 60, Math.min(RING.WALL_B - 60, camT.z));
  camS.d = Math.exp(Math.log(camS.d) + (Math.log(camT.d) - Math.log(camS.d)) * k);
  const d = camS.d; U.uCamDist.value = d;
  placeCamera();
  U.uCurve.value.set(cam.position.x, 0, RING.R);
  { const gx = Math.round(cam.position.x / (RING.CIRC / 760)) * (RING.CIRC / 760); ground.position.set(gx, 0, 0); walls.position.set(gx, 0, 0); }
  sky.position.copy(cam.position); sky.scale.setScalar(cam.far * 0.9);
  // 环架自旋只转天空。扇区镜的明带跟世界钟走，培育层不跟。
  sky.material.uniforms.uSpin.value = t * RING_OMEGA;
  const insideDeck = camS.deck && cam.position.y < 2;
  const mirrorOn = viewLayer === 'surface' && !insideDeck;
  const sector = (nightT > 0.5) ? 0 : sectorLight(camS.x, worldDay);
  const dayAmt = mirrorOn ? (lockDay ? 1 : sector) : 1;
  U.uDayCenter.value = dayCenter(worldDay);
  U.uMirrorOn.value = mirrorOn ? 1 : 0;
  U.uLockDay.value = lockDay ? 1 : 0;
  U.uNight.value += ((mirrorOn ? 1 - dayAmt : 0) - U.uNight.value) * Math.min(1, dt * 2);
  U.uMap.value += (mapT - U.uMap.value) * Math.min(1, dt * 3);
  const nt = U.uNight.value;
  const lit = mirrorOn ? (1 - nt) : 1;
  U.uLocalDay.value = Math.max(0.1, lit);
  sun.color.set('#ffd9b0').lerp(new THREE.Color('#9fb4d0'), nt); sun.intensity = 0.22 + 3.38 * lit;
  hemi.color.set('#5f7480'); hemi.groundColor.set('#2a2622');
  hemi.intensity = 0.14 + 0.28 * lit; scene.environmentIntensity = 0.12 + 0.33 * lit;
  if (insideDeck) {
    sun.color.lerp(new THREE.Color('#d5dee8'), 0.8);
    sun.intensity = 1.7;
    hemi.color.set('#d0d8e0'); hemi.groundColor.set('#3a4148'); hemi.intensity = 0.95;
    scene.environmentIntensity = 0.4;
  }
  // 拉远时雾色变亮：被阳光照透的大气，让远处的环带拱顶发亮（远景的高光端主要来自这里）
  scene.fog.color.copy(FOG_DAY).lerp(FOG_FAR, THREE.MathUtils.smoothstep(d, 900, 4000)).lerp(FOG_NIGHT, nt);
  if (insideDeck) scene.fog.color.lerp(FOG_DECK, 0.42);
  // 近中景沿用 v3 的空气透视；拉远后雾变薄，让环带拱顶隔着一层大气浮现在天空里
  scene.fog.density = (5.6e-5 + 0.29 / d * Math.pow(d / 4300, 0.3) * (1 - THREE.MathUtils.smoothstep(d, 120, 700))) * (1 + nt * 0.4);
  if (insideDeck) scene.fog.density *= 0.38;
  // 阴影相机跟随视野
  const sz = Math.min(1800, Math.max(70, d * 1.15));
  sun.target.position.set(camS.x, 0, camS.z); sun.position.copy(sun.target.position).addScaledVector(sunDir, Math.max(800, sz * 2));
  Object.assign(sun.shadow.camera, { left: -sz, right: sz, top: sz, bottom: -sz, near: 1, far: Math.max(1600, sz * 4) }); sun.shadow.camera.updateProjectionMatrix();
  // 细节层级（LOD）：
  // 轨道 (>1800)：田块色块 + 网格 + 图标 + 网络线 + 信号点
  // 区域 (450–1800)：田垄纹理 + 田块标注 + 信号点
  // 作业 (70–450)：收割机 / 运输车 / 无人机模型 + 尾迹
  // 单株 (<70)：实例化单株 + 移轴
  const carto = Math.min(1, Math.max(0, (d - 1500) / 1100));
  U.uCarto.value = carto; iconMat.uniforms.uA.value = carto; netMat.uniforms.uA.value = carto * 0.9; netMat.uniforms.uW.value = d * 0.0011;
  dots.material.uniforms.uA.value = Math.min(1, Math.max(0, (d - 380) / 500));
  // 单株窗口
  const W = Math.min(64, Math.max(30, d * 1.1));
  const plantOn = d < 95;
  const lookSig = ownedLookSig();
  if (plantOn && (Math.hypot(camS.x - plantWin.x, camS.z - plantWin.z) > W * 0.2 || Math.abs(W - plantWin.w) > W * 0.25 || lookSig !== plantWin.sig)) rebuildPlants(camS.x, camS.z, W);
  for (const s2 of SHAPES) plantMeshes[s2].visible = plantOn;
  U.uPlantWin.value.set(plantWin.x, plantWin.z, plantWin.w, plantOn ? 1 : 0);
  // 收割机：离镜头中心最近的 N 台用完整模型
  for (const h of harvesters) h._d = Math.hypot(h.x - camS.x, h.z - camS.z);
  nearH = harvesters.filter(h => h._d < Math.max(400, d * 2.2) && h.mode !== 'idle').sort((a, b) => a._d - b._d).slice(0, H_NEAR);
  let n = 0;
  if (viewLayer === 'surface') for (const p of parked) setInst(harvSet, n++, p.x, 0, p.z, p.ang);
  for (const h of nearH) {
    if (inCut(h.x, h.z, 8) || (viewLayer !== 'surface' && inOwnPlot(h.x, h.z))) continue;
    h.va = h.ang;
    setInst(harvSet, n++, h.x, 0, h.z, h.va);
    if (h.mode === 'cut' && d < 600 && h._d < 300) for (let e = 0; e < 3; e++) emitDust(h.x, h.z, h.va);
  }
  setCount(harvSet, d < 1500 ? n : 0);
  const rigShown = viewLayer === 'surface' && d < 1500;
  const rigCounts = {};
  const showRig = (id, x, z, ang) => {
    const set = rigMesh[id];
    if (!set) return;
    const i = rigCounts[id] || 0;
    if (i >= RIG_CAP) return;
    setInst(set, i, x, 0, z, ang, 1);
    rigCounts[id] = i + 1;
  };
  if (rigShown) for (const r of rigs) {
    if (inCut(r.x, r.z, 8)) continue;
    if (r.bDrive) {
      r.va = r.ang;
      const mesh = r.kind === 'tractor' ? 'tractor_gen' : 'omni';
      showRig(mesh, r.x, r.z, r.va);
      if (mesh === 'tractor_gen' && r.impl && hitchOffset[r.impl] != null) {
        const ox = hitchOffset[r.impl];
        showRig(r.impl, r.x + ox * Math.cos(r.va), r.z + ox * Math.sin(r.va), r.va);
      }
      if (r.busy && d < 700) for (let e = 0; e < 2; e++) emitDust(r.x, r.z, r.va);
      continue;
    }
    const profile = rigProfile(r.kind);
    const platform = profile?.logicId && rigMesh[profile.logicId] ? profile.logicId : 'tractor_gen';
    r.va = r.ang;
    showRig(platform, r.x, r.z, r.va);
    const hauling = r.intent === 'unload' || r.intent === 'deliver' || r.mode === 'unload';
    const hitch = platform === 'tractor_gen' ? (hauling && profile?.kit?.includes('impl_trailer') ? 'impl_trailer' : (r.hitch || profile?.defaultHitch || null)) : null;
    if (hitch != null && hitchOffset[hitch] != null) {
      const ox = hitchOffset[hitch];
      showRig(hitch, r.x + ox * Math.cos(r.va), r.z + ox * Math.sin(r.va), r.va);
    }
    if (r.busy && d < 700) for (let e = 0; e < 2; e++) emitDust(r.x, r.z, r.va);
  }
  const workCounts = { drone_scout: 0, drone_treat: 0 };
  if (rigShown) for (const unit of workDrones) {
    const id = unit.kind === 'drone_treat' ? 'drone_treat' : 'drone_scout';
    const i = workCounts[id];
    if (i >= 8 || inCut(unit.x, unit.z, 6)) continue;
    setInst(workDroneMesh[id], i, unit.x, unit.y, unit.z, unit.ang || 0, 1);
    workCounts[id] = i + 1;
  }
  for (const id of Object.keys(workDroneMesh)) setCount(workDroneMesh[id], rigShown ? workCounts[id] : 0);
  const boomNow = rigShown ? boomWatch() : null;
  if (boomNow) setInst(boomSet, 0, boomNow.x, 0, boomNow.z, boomNow.ang + Math.PI / 2, 1);
  for (const k in rigMesh) setCount(rigMesh[k], rigShown ? (rigCounts[k] || 0) : 0);
  setCount(boomSet, boomNow ? 1 : 0);
  haulers.forEach((h, i) => setInst(haulSet, i, h.x, 0, h.z, h.ang)); setCount(haulSet, d < 1500 ? haulers.length : 0);
  drones.forEach((dr, i) => setInst(droneSet, i, dr.x, dr.y, dr.z, dr.ang)); setCount(droneSet, d < 1200 ? drones.length : 0);
  people.forEach((p, i) => { p.a += (Math.sin(t * 0.3 + i) * 0.5) * dt; p.x += Math.cos(p.a) * p.sp * dt; p.z += Math.sin(p.a) * p.sp * dt; setInst(peopleSet, i, p.x, 0, p.z, p.a); }); setCount(peopleSet, d < 700 ? people.length : 0);
  updateConveyors(d);
  // 灯杆 / 喷灌桁架
  if (d < 2500 && Math.hypot(camS.x - infraAt.x, camS.z - infraAt.z) > 400) rebuildInfra(camS.x, camS.z);
  for (const k in mastSet) mastSet[k].visible = d < 2500;
  // 剖面里的 AGV 小车与巡检人员
  deckCarts.forEach((c2, i) => { c2.p = (c2.p + c2.sp * dt) % 2; const u = c2.p < 1 ? c2.p : 2 - c2.p; setInst(cartSet, i, c2.x0 + (c2.x1 - c2.x0) * u, c2.y, c2.z, c2.p < 1 ? 0 : Math.PI, 0.32); }); setCount(cartSet, cut.on ? deckCarts.length : 0);
  deckCrew.forEach((p2, i) => { p2.a += Math.sin(t * 0.4 + i) * dt * 0.6; setInst(crewSet, i, p2.x, p2.y, p2.z, p2.a); }); setCount(crewSet, cut.on && d < 1200 ? deckCrew.length : 0);
  irrigs.forEach((ir, i) => { const f = ir.f, u = 8 + (Math.sin(t * 0.02 + ir.ph * 6.283) * 0.5 + 0.5) * (L.FIELD - 16); const [x, z] = f.dir === 0 ? [f.x0 + u, f.z0 + 64] : [f.x0 + 64, f.z0 + u]; setInst(irrSet, i, x, 0, z, f.dir === 0 ? 0 : Math.PI / 2); });
  setCount(irrSet, d < 2500 ? irrigs.length : 0);
  // 远景信号点
  harvesters.forEach((h, i) => { if ((i + 1) * 3 <= dotPos.length) dotPos.set([h.x, 4, h.z], i * 3); });
  drones.forEach((dr, i) => { const o = (harvesters.length + i) * 3; if (o + 3 <= dotPos.length) dotPos.set([dr.x, dr.y, dr.z], o); });
  dotGeo.attributes.position.needsUpdate = true;
  // 尘土粒子
  for (let i = 0; i < DUSTN; i++) if (dustLife[i] > 0) { dustLife[i] -= dt * 0.55; dustPos[i * 3] += dustVel[i * 3] * dt; dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt; dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt; dustVel[i * 3 + 1] *= 0.98; if (dustLife[i] < 0) { dustLife[i] = 0; dustPos[i * 3 + 1] = -999; } }
  dustGeo.attributes.position.needsUpdate = true; dustGeo.attributes.life.needsUpdate = true;
  // 后期参数随缩放变化
  if (!NOPOST) {
    const tilt = Math.max(0, Math.min(1, (130 - d) / 80));
    tiltH.enabled = tiltV.enabled = tilt > 0.02;
    tiltH.uniforms.h.value = 2.2 * tilt / innerWidth; tiltV.uniforms.v.value = 2.2 * tilt / innerHeight;
    gtao.updateGtaoMaterial({ radius: Math.min(30, Math.max(1.5, d * 0.045)) });
  }
  finalPass.uniforms.uTime.value = t;
  for (const kind of Object.keys(buildingSets)) {
    const list = buildings.filter(b => (b.kind || 'shed') === kind);
    const set = buildingSets[kind];
    const n = d < 2200 ? Math.min(list.length, 8) : 0;
    for (let i = 0; i < n; i++) setInst(set, i, list[i].x, 0, list[i].z, list[i].ang || 0);
    setCount(set, n);
  }
  const mill = devices.find(x => x.kind === 'mill');
  if (viewLayer === 'grow' && mill) setInst(millSet, 0, mill.x, LAYERS[1].floor, mill.z, 0, 2.4);
  setCount(millSet, viewLayer === 'grow' && mill ? 1 : 0);
  if (viewLayer !== 'surface' && hoverPtr && !drag) {
    const hp = pickFlat(hoverPtr.x, hoverPtr.y);
    deckHover = hp ? cellAt(hp.x, hp.z) : null;
  } else if (!hoverPtr || drag) deckHover = null;
  if (viewLayer !== 'surface' && deckHover) { U.uSelOn.value = 1; U.uSel.value.set(deckHover.x0, deckHover.x1, deckHover.z0, deckHover.z1); }
  else if (viewLayer === 'surface' && selected && selected.crop >= 0) { U.uSelOn.value = 1; U.uSel.value.set(selected.x0, selected.x0 + L.FIELD, selected.z0, selected.z0 + L.FIELD); }
  else U.uSelOn.value = 0;
  if ((viewLayer === 'grow' || cut.on) && tankPos.length) {
    let reach = 0;
    const home = tankPos[Math.min(deckTank, tankPos.length - 1)] || tankPos[0];
    let z = home.z - L.FIELD / 2 - L.ROAD / 2;
    if (armOrder && tankPos[armOrder.id]) {
      const goal = tankPos[armOrder.id];
      z = goal.z - L.FIELD / 2 - L.ROAD / 2;
      const dx = goal.x - armX;
      const motion = Math.min(Math.max(raw, dt), 1.5);
      if (armOrder.phase === 'move' && Math.abs(dx) > 0.35) armX += Math.sign(dx) * Math.min(Math.abs(dx), 64 * motion);
      else {
        armX += dx * Math.min(1, motion * 8);
        if (armOrder.phase === 'move') { armOrder.phase = 'act'; armOrder.t = 0; }
        armOrder.t += motion;
        const u = Math.min(1, armOrder.t / 0.7);
        reach = Math.sin(u * Math.PI) * (armOrder.job === 'harvest' ? 1 : 0.35);
        if (u >= 1) armOrder = null;
      }
    }
    setInst(armSet, 0, armX, home.y, z + reach * 2.4, Math.PI / 2);
    setCount(armSet, 1);
    for (let i = 0; i < tanks.length && i < tankPos.length; i++) {
      const spec = CULTURES.find(c => c.id === tanks[i].species);
      const tint = !spec ? C('rego') : spec.id === 'bsf' ? C('sage') : C('ochre');
      if (cultureSet.light) cultureSet.light.setColorAt(i, tint);
    }
    if (cultureSet.light?.instanceColor) cultureSet.light.instanceColor.needsUpdate = true;
  }
  {
    const sig = tanks.map(t => `${t.species || ''}:${t.bi ?? 'x'}:${t.bj ?? 'x'}`).join('|');
    if (sig !== cultureSig) { cultureSig = sig; syncCultureArt(); placeTanks(); }
  }
  if (viewLayer === 'grow') {
    for (const art of grubInstalled.values()) if (art.group.visible) art.motion(0, 'job');
  }
  applyDeckView();
  paintPicks();
  composer.render();
  // HUD
  if (mode === 'machines') {
    document.querySelectorAll('#sheet [data-rig] small').forEach(el => {
      const r = rigs.find(x => x.id === +el.parentElement.dataset.rig);
      if (r) el.textContent = rigLine(r);
    });
    document.querySelectorAll('#sheet [data-drone] small').forEach(el => {
      const d = workDrones.find(x => x.id === +el.parentElement.dataset.drone);
      if (d) el.textContent = rigLine(d);
    });
  }
  if (mode === 'deck') {
    document.querySelectorAll('#sheet [data-tank] small').forEach(el => {
      const tank = tanks[+el.parentElement.dataset.tank];
      const w = cultureWatch(tank);
      el.textContent = w ? `${w.name} · 第 ${Math.floor(w.day)} / ${w.days} 日${w.tended ? ' · 臂已照料' : ''}${w.ready ? ' · 可收' : ''}` : '空槽';
    });
    const millEl = document.querySelector('#sheet [data-mill]');
    if (millEl) {
      const w = millStatusText();
      if (millEl.textContent !== w.line) {
        const was = millEl.textContent;
        millEl.textContent = w.line;
        const run = document.getElementById('mill-run');
        if (run) run.disabled = w.mill.state !== 'ready';
        if ((was.startsWith('正在加工') || was.startsWith('施工中')) && w.mill.state === 'ready') paintSheet();
      }
    }
  }
  const mpp = d * 2 * Math.tan(15 * DEG) / innerHeight; const [m, px] = niceScale(mpp);
  $('scalebar').style.width = px.toFixed(0) + 'px'; $('scaletxt').textContent = m >= 1000 ? (m / 1000) + ' km' : m + ' m';
  updateLabels(d);
  paintKpi();
  updateDock();
  paintLock();
  drainLog();
  if (frames === 0) $('fps').textContent = `${fpsShow.toFixed(0)} FPS`;
  window.__stats = { fps: fpsShow, t, sim: simTime, d, revenue: economy.revenue, g: selected && selected.g, state: selected && selected.state, plants: Object.values(plantMeshes).reduce((a, m) => a + (m.visible ? m.count : 0), 0), harvesters: harvesters.length, active: harvesters.filter(h => h.mode === 'cut').length, calls: R.info.render.calls, tris: R.info.render.triangles };
  requestAnimationFrame(frame);
}
if (SHOWFPS) document.body.classList.add('showfps');
{ const rev = document.getElementById('buildrev'); if (rev) rev.textContent = HUD_VERSION; }
window.__scene = scene;
if (Q.has('nohud')) document.body.classList.add('nohud');
requestAnimationFrame(frame);
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); R.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); gtao.setSize(innerWidth, innerHeight); });
window.__farm = {
  economy, stores, focus, fields, harvesters, rigs, log, CROPS, PLOT, quote, fieldAtWorld, project, pick: pickFlat,
  warehouse, buildings, sellLot, placeBuilding, removeBuilding, buySeed, buyItem, buyMachine, resetGame, shop: SHOP, machines: MACHINE_SHOP,
  workDrones, buyDrone, droneShop: DRONE_SHOP,
  cultures: CULTURES, tanks, climate: DECK_CLIMATE, startCulture, tendCulture, harvestCulture, cultureWatch,
  devices, potatoStock, fertPlan, cultureFeedPlan, millWatch, startMill, removeMill, orderProcess, products: productById,
  deck(on) { visitDeck(on == null ? !camS.deck : !!on); },
  get onDeck() { return !!camS.deck; },
  snapshot: exportSnapshot, plant: () => doPlant(), prep: () => doPrep(), select: (i, j) => selectField(fieldAt(i, j)),
  b() {
    const f = selected;
    const rig = rigs.find(r => r.bDrive && r.busy) || rigs.find(r => r.bDrive) || null;
    const vis = f ? fieldVisual(f) : null;
    return {
      dock: f ? dockOf(f) : null,
      i: f?.i, j: f?.j,
      look: f?.bUnit?.look || null,
      g: vis?.g, mask: vis?.mask, next: vis?.next ?? null,
      crop: vis?.crop ?? null, hold: !!vis?.holdSweep,
      rig: rig && { x: rig.x, z: rig.z, ang: rig.ang, busy: !!rig.busy, doing: rig.bRead?.doing || '', frac: rig.bRead?.frac || 0 },
    };
  },
  setTimeScale, setPaused,
  setLockDay(on) { lockDay = !!on; paintLockDay(); },
  get lockDay() { return lockDay; },
  get selected() { return selected; },
  get worldDay() { return worldDay; },
  setWorldDay,
  sectorLight: (x) => sectorLight(x == null ? camS.x : x, worldDay),
  get spin() { return t * RING_OMEGA; },
  get mode() { return mode; },
  get camera() { return { x: camS.x, z: camS.z, y: cam.position.y, d: camS.d, yaw: camS.yaw, pOff: camS.pOff, deck: !!camS.deck, ground: ground.visible, layer: viewLayer }; },
  get layer() { return viewLayer; },
  get section() { return plotSection.visible ? plotSection.children.length : 0; },
  get hover() { return deckHover && { i: deckHover.i, j: deckHover.j, tank: deckHover.tank, x0: deckHover.x0, x1: deckHover.x1, z0: deckHover.z0, z1: deckHover.z1 }; },
  showLayer,
  get arm() {
    return {
      x: armX,
      order: armOrder && { id: armOrder.id, phase: armOrder.phase, t: armOrder.t, job: armOrder.job },
      tanks: tankPos.map(p => p.x),
    };
  },
  watch: () => cropWatch(selected),
  stageBadge,
  reloadStages: reloadStageStore,
  lock(id) { setMode('machines'); lockRig(id); paintLock(); },
  setMode,
  get picked() { return pickedFields.size; },
  aim(yawDeg, dist, pitch) {
    if (yawDeg != null) camT.yaw = camS.yaw = yawDeg * DEG;
    if (dist != null) camT.d = camS.d = dist;
    if (pitch != null) camT.pOff = camS.pOff = pitch * DEG;
  },
  pose(p) { poseLock = p || null; },
  get hubShaft() {
    const h = hubArt.group.userData.hub;
    return { top: h.top, y: hubArt.group.position.y, worldTop: hubArt.group.position.y + h.top, section: h.section, axis: RING.R };
  },
  get deckArt() { return deckArtInfo; },
  look(x, z) {
    if (Number.isFinite(x)) camT.x = camS.x = x;
    if (Number.isFinite(z)) camT.z = camS.z = z;
  },
  get locked() { return watchRig; },
  advance(seconds, scale = economy.timeScale) {
    const n = Math.max(1, Math.round(seconds / 0.05));
    for (let i = 0; i < n; i++) step(seconds / n, t, scale);
    writeFields();
  },
};
window.__ready = true;
