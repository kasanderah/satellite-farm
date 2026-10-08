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
import { PALETTE, CROPS, TEX_ID, L, fields, harvesters, haulers, drones, step, TRUNKS_X, TRUNKS_Z, depots, inCrater, ROADS, RING, LAYERS, CUT, wrapX, PLOT, economy, focus, signals, log, plantField, quote, setTimeScale, setPaused, paused, exportSnapshot, applySnapshot, fieldAtWorld, fieldAt, simTime, worldDay, stores, rigs, fieldVisual, cropWatch, POTATO_DAYS, warehouse, buildings, sellLot, placeBuilding, rigReadout, SHOP, buySeed, buyItem, SEED_PER_FIELD, FERT_PER_FIELD, resetGame, CULTURES, DECK_CLIMATE, tanks, cultureWatch, startCulture, tendCulture, harvestCulture, BUILDING_KINDS } from './_shared.js';
import { NOISE, FARM, CURVE_DECL, CURVE_PROJECT } from './glsl.js';
import { harvesterKit, haulerKit, droneKit, personKit, conveyorKit, depotKit, hubKit, plantGeometry, mastKit, irrigatorKit, growRackKit, tankKit, pumpKit, pipeRackKit, tractorKit, planterKit, hillerKit, topperKit, potatoLifterKit, shedKit, warehouseKit, garageKit, processKit, cultureTankKit, armKit } from './prefabs.js';

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
  uPlot: { value: new THREE.Vector4(PLOT.x0, PLOT.x1, PLOT.z0, PLOT.z1) },
};
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
  for (const f of fields) {
    const o = (f.j * NFX + f.i) * 4;
    const v = fieldVisual(f);
    fieldData[o] = v.crop; fieldData[o + 1] = v.g; fieldData[o + 2] = v.s; fieldData[o + 3] = v.dir;
  }
  fieldTex.needsUpdate = true;
}

// 给世界材质加「地面弯曲」
function curved(mat, extra) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uCurve = U.uCurve;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + CURVE_DECL).replace('#include <project_vertex>', CURVE_PROJECT);
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
const SUN_EL = 21 * DEG, SUN_AZ = -38 * DEG; // 方位：镜头默认朝 -z，太阳在左前方 38°
const sunDir = new THREE.Vector3(Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), -Math.cos(SUN_AZ) * Math.cos(SUN_EL)).normalize();
U.uSunXZ.value.set(sunDir.x, sunDir.z).normalize(); U.uSunTan.value = Math.tan(SUN_EL);
const FOG_DAY = new THREE.Color('#868d8f'), FOG_FAR = new THREE.Color('#b4babb'), FOG_NIGHT = new THREE.Color('#1b1f27');
scene.fog = new THREE.FogExp2(FOG_DAY.clone(), 0.0002);
const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  uniforms: {
    uSun: { value: sunDir }, uFog: { value: scene.fog.color }, uNight: U.uNight,
    uZen: { value: C('deep') }, uVoid: { value: C('void') },
    // 母星（气态巨行星）：挂在左侧环壁上方，环带拱顶的旁边
    uPDir: { value: new THREE.Vector3(-0.80, 0.30, 0.52).normalize() },
    uPRad: { value: 0.125 }, uPA: { value: C('ochre') }, uPB: { value: C('haze') }, uRim: { value: C('skyRim') },
  },
  vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader: /* glsl */`
    varying vec3 vDir; uniform vec3 uSun, uFog, uZen, uVoid, uPDir, uPA, uPB, uRim; uniform float uPRad, uNight;
    ${NOISE}
    void main(){
      vec3 v = normalize(vDir);
      float el = asin(clamp(v.y, -1., 1.));
      // 环带内看出去就是太空：深色背景，只在环带平面附近有一层很淡的大气辉光（不再是一条白色地平线带）
      vec3 col = mix(uZen * 1.15, uVoid, smoothstep(0.0, 0.55, abs(el)));
      col += uFog * 0.16 * exp(-abs(el) * 7.);
      float sd = max(dot(v, uSun), 0.);
      col += vec3(1.0, 0.72, 0.5) * (pow(sd, 14.) * 0.28 + pow(sd, 900.) * 6.0) * (1. - uNight * 0.85);
      // 星星：很淡，环带下方（环壁外）也有
      vec2 sp = vec2(atan(v.z, v.x) * 260., el * 260.);
      float st = step(0.9972, hash12(floor(sp))) * (0.5 + 0.5 * hash12(floor(sp) + 3.));
      col += st * (0.16 + uNight * 0.8) * (1. - pow(sd, 6.));
      // 母星：不透明的实心球体（受光面 + 明暗交界 + 低彩度条纹），不再是半透明的白色剪影
      float D = 1.0, r = sin(uPRad);
      float b = dot(v, uPDir), h2 = b * b - (D * D - r * r);
      float tP = 1e9;
      vec3 pc = uPDir * D;
      vec3 axis = normalize(vec3(0.3, 1.0, 0.18));
      if (h2 > 0.) {
        tP = b - sqrt(h2);
        vec3 n = normalize(v * tP - pc);
        float lat = dot(n, axis);
        float band = fbm(vec2(lat * 8.0, lat * 2.0 + 3.1)) * 0.7 + 0.3 * (0.5 + 0.5 * sin(lat * 29.));
        vec3 pcol = mix(uPA * 0.62, uPB * 0.82, band);
        float ndl = dot(n, uSun);
        float lit = smoothstep(-0.06, 0.45, ndl);
        float limb = 1. - max(dot(n, -v), 0.);
        vec3 pl = pcol * (0.018 + 0.62 * lit) * (1. - 0.45 * limb * limb) + uRim * pow(limb, 3.) * 0.22 * smoothstep(-0.25, 0.25, ndl);
        // 环在星体上的影子：一条细暗带
        float rs = abs(dot(n * r, axis) / max(abs(dot(uSun, axis)), 0.2));
        pl *= 1. - 0.35 * smoothstep(0.02, 0.0, abs(dot(n, axis) - 0.06)) * lit;
        float edge = smoothstep(0.0, r * r * 0.03, h2);
        col = mix(col, pl * (1. - uNight * 0.6) + uFog * 0.03, edge);
      }
      // 环：与赤道面求交；受光强度随太阳与环面的夹角，被星体挡住的部分在阴影里
      float tR = dot(pc, axis) / dot(v, axis);
      if (tR > 0. && tR < tP) {
        vec3 rp = v * tR - pc; float rr = length(rp) / r;
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
uniform float uTime, uSunTan, uCarto, uMap, uNight, uCamDist, uCutOn, uSelOn; uniform vec2 uSunXZ; uniform vec4 uPlantWin, uCut, uSel, uPlot;
${Object.keys(GC).map(k => 'uniform vec3 g_' + k + ';').join('\n')}
${NOISE}
${FARM}
float gShadow = 1.0, gRough = 0.92; vec2 gTilt = vec2(0.); vec3 gOv = vec3(0.); float gOvA = 0.;
float aaLine(float x, float w){ float fw = fwidth(x); return 1. - smoothstep(w - fw, w + fw, abs(x)); }
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
    bool head = uv.x < 6. || uv.x > FIELD - 6.;      // 地头：作物行方向与田内垂直
    float across = head ? uv.x : uv.y;
    if (head) acrossW = acrossW.yx;
    float rowS = P.y * (tex == 4 ? 2.2 : 1.0);
    float ph = across / rowS;
    float fw = fwidth(ph);
    float rowVis = 1. - smoothstep(0.22, 0.55, fw);  // 行距小于约 2 像素时淡出，避免摩尔纹
    float prof = 0.5 + 0.5 * cos(6.2832 * ph);
    float slope = -sin(6.2832 * ph);
    float g = d.g;
    bool cut = laneCut(uv, d.b);
    float patchy = (n1 - 0.5) * 0.12 + (n2 - 0.5) * 0.05;
    float pst = floor(g + 0.001);
    if (pst >= 1.0 && tex == 2) {                    // 商品薯：与其它田块同一套行距和颗粒，只换阶段颜色
      bool worked = laneCut(uv, d.b);
      vec3 soil = g_soil * (0.78 + 0.1 * prof * rowVis) * (1. + patchy);
      float cover = pst < 1.5 ? 0.0 : pst < 2.5 ? 0.22 : pst < 3.5 ? 0.72 : pst < 4.5 ? 0.84 : 0.0;
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
      if (pst < 1.5) {
        col = soil;
        gTilt = acrossW * slope * (worked ? 0.85 : 0.35) * rowVis;
        gRough = 0.97;
      } else if (pst < 4.5) {
        col = pst < 3.5 ? canopy : bloom;
        gTilt = acrossW * slope * (pst < 2.5 ? 0.85 : 0.55) * rowVis;
        canopyHere = true;
        gRough = pst < 2.5 ? 0.9 : 0.68;
      } else if (pst < 5.5) {
        bool shredded = worked || d.b >= 9.5;
        if (shredded) { col = stub; gTilt = acrossW * slope * 0.35 * rowVis; gRough = 0.92; }
        else { col = bloom; gTilt = acrossW * slope * 0.55 * rowVis; canopyHere = true; gRough = 0.66; }
      } else if (worked) {
        float tub = smoothstep(0.78, 0.96, hash12(floor(rc * 0.65)));
        col = mix(soil * 1.05, g_straw * 1.15, mix(0.12, tub, nearS) * 0.9);
        gTilt = acrossW * slope * 0.18 * rowVis;
        gRough = 0.94;
      } else {
        col = stub;
        gTilt = acrossW * slope * 0.28 * rowVis;
        gRough = 0.92;
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
      float m = pst >= 1.0 ? growthVis(g) : (cut ? 0.0 : g);
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
 if (uCutOn > 0.5 && abs(vWP.x - uCut.x) < uCut.z && abs(vWP.z - uCut.y) < uCut.w) discard;
 vec3 albedo = farmAlbedo(vWP.xz);
 if (uSelOn > 0.5 && vWP.x >= uSel.x && vWP.x <= uSel.y && vWP.z >= uSel.z && vWP.z <= uSel.w) {
   float b = min(min(vWP.x - uSel.x, uSel.y - vWP.x), min(vWP.z - uSel.z, uSel.w - vWP.z));
   float px = max(fwidth(b) * 1.4, 1.2);
   albedo = mix(albedo, g_zone, (1.0 - smoothstep(px * 0.15, px * 1.8, b)) * 0.92);
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
    .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, gOv, gOvA);\n#include <opaque_fragment>');
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
const SHAPES = ['ear', 'stalk', 'bush', 'tuft', 'rosette'];
const PLANT_CAP = 60000;
function plantPatch(s, depth) {
  Object.assign(s.uniforms, U);
  s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
${CURVE_DECL}
${NOISE}
${FARM}
uniform float uTime, uCutOn; uniform vec4 uPlantWin, uCut;
varying vec3 vCropCol;`).replace('#include <begin_vertex>', `#include <begin_vertex>
  vec4 io = modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
  ivec2 fij; vec2 loc, bl; int kind = farmCell(io.xz, fij, loc, bl);
  float sc = 0.; int c = 0; float gg = 0.; vec4 d = vec4(0.); float stage = 0.;
  if (kind == 3) {
    d = texelFetch(uField, fij, 0); c = int(d.r + .5);
    vec2 uv = d.a > .5 ? loc.yx : loc;
    if (d.r >= 0.) {
      stage = floor(d.g + 0.001);
      bool opened = laneCut(uv, d.b);
      gg = growthVis(d.g);
      if (stage < 0.5 && opened) gg = 0.;
      if (stage > 4.5 && opened) gg = stage < 5.5 ? 0.08 : 0.;
      if (stage > 0.5 && stage < 1.5) gg = 0.;
      sc = gg;
    }
  }
  vec2 dw = abs(io.xz - uPlantWin.xy);
  float edge = 1. - smoothstep(uPlantWin.z * 0.72, uPlantWin.z, max(dw.x, dw.y));
  if (uCutOn > 0.5 && abs(io.x - uCut.x) < uCut.z + 0.5 && abs(io.z - uCut.y) < uCut.w + 0.5) edge = 0.;
  vec4 P = uCropP[c];
  float hs = P.x * pow(max(sc, 0.), 0.85) * edge, ws = P.w * 2.4 * (0.35 + 0.65 * sc) * edge;
  transformed.xz *= ws; transformed.y *= hs;
  float sw = sin(uTime * 1.6 + io.x * 0.31 + io.z * 0.17) + 0.5 * sin(uTime * 2.7 + io.x * 0.9);
  transformed.x += sw * 0.06 * position.y * hs; transformed.z += sw * 0.03 * position.y * hs;
  vCropCol = mix(uCropYoung[c], uCropRipe[c], smoothstep(0.45, 1.0, gg));
  if (stage > 3.5 && stage < 4.5 && position.y > 0.48) vCropCol = vec3(0.76, 0.64, 0.86);
  if (stage > 4.5 && stage < 5.5) vCropCol = uCropStub[c];`)
    .replace('#include <project_vertex>', CURVE_PROJECT);
  if (!depth) s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCropCol;')
    .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vCropCol * 1.08; { float lm = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = max(mix(vec3(lm), diffuseColor.rgb, 1.15), 0.); }');
}
MAT.crop.onBeforeCompile = s => plantPatch(s, false);
const cropDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
cropDepth.onBeforeCompile = s => {   // 阴影也要按生长度和收割状态缩放（不弯曲：阴影坐标用未弯曲的世界）
  Object.assign(s.uniforms, U);
  plantPatch(s, true);
  s.vertexShader = s.vertexShader.replace(CURVE_PROJECT, '#include <project_vertex>');
};
const plantMeshes = {};
for (const sh of SHAPES) {
  const im = new THREE.InstancedMesh(plantGeometry(sh), MAT.crop, PLANT_CAP);
  im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.customDepthMaterial = cropDepth;
  const col = new Float32Array(PLANT_CAP * 3); im.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
  scene.add(im); plantMeshes[sh] = im;
}
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
let hseed = 1; const hr = () => (hseed = (hseed * 16807) % 2147483647) / 2147483647;
let plantWin = { x: 1e9, z: 1e9, w: 0 };
function rebuildPlants(cx, cz, W) {
  plantWin = { x: cx, z: cz, w: W };
  const counts = {}; for (const s of SHAPES) counts[s] = 0;
  const fi0 = Math.max(0, Math.floor((cx - W - L.X0) / (L.BP / L.PER)) - 1), fi1 = Math.min(NFX - 1, Math.floor((cx + W - L.X0) / (L.BP / L.PER)) + 1);
  const fj0 = Math.max(0, Math.floor((cz - W - L.Z0) / (L.BP / L.PER)) - 1), fj1 = Math.min(NFZ - 1, Math.floor((cz + W - L.Z0) / (L.BP / L.PER)) + 1);
  for (let j = fj0; j <= fj1; j++) for (let i = fi0; i <= fi1; i++) {
    const f = fields[j * NFX + i]; if (f.crop < 0) continue;
    const cr = CROPS[f.crop], im = plantMeshes[cr.shape];
    const xa = Math.max(f.x0, cx - W), xb = Math.min(f.x0 + L.FIELD, cx + W), za = Math.max(f.z0, cz - W), zb = Math.min(f.z0 + L.FIELD, cz + W);
    if (xa >= xb || za >= zb) continue;
    const rowS = cr.row * (cr.tex === 'beds' ? 1.1 : 1), al = cr.along;
    // 田内：行沿 u；在世界坐标里按田垄方向铺
    const [ua, ub, va, vb] = f.dir === 0 ? [xa - f.x0, xb - f.x0, za - f.z0, zb - f.z0] : [za - f.z0, zb - f.z0, xa - f.x0, xb - f.x0];
    hseed = f.idx * 7919 + 1;
    for (let v = Math.ceil(va / rowS) * rowS + rowS * 0.5; v < vb; v += rowS) {
      if (cr.tex !== 'beds' && cr.tex !== 'paddy' && Math.abs(((v % 24) + 24) % 24 - 12) < 1.4) continue; // 拖拉机道
      for (let u = Math.ceil(ua / al) * al; u < ub; u += al) {
        if (u < 6 || u > L.FIELD - 6) continue;      // 地头留给地面纹理
        const n = counts[cr.shape]; if (n >= PLANT_CAP) break;
        const ju = u + (hr() - 0.5) * al * 0.6, jv = v + (hr() - 0.5) * rowS * 0.18;
        const x = f.dir === 0 ? f.x0 + ju : f.x0 + jv, z = f.dir === 0 ? f.z0 + jv : f.z0 + ju;
        const s = 0.8 + hr() * 0.4;
        tmpM.compose(tmpP.set(x, 0, z), tmpQ.setFromAxisAngle(UP, hr() * 6.283), tmpS.set(s, s * (0.85 + hr() * 0.3), s));
        im.setMatrixAt(n, tmpM);
        const j = 0.9 + hr() * 0.2; im.instanceColor.setXYZ(n, j, j * (0.97 + hr() * 0.06), j);
        counts[cr.shape] = n + 1;
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
function staticMesh(kit) { for (const k of ['light', 'dark', 'glass', 'emis']) if (kit[k]) { const m = new THREE.Mesh(kit[k], MAT[k]); m.castShadow = k !== 'emis'; m.receiveShadow = true; scene.add(m); } }

const HUBC = L.X0 + L.HUBX * L.BP + L.BLOCK / 2;  // 中枢区中心（= 0；z 方向同样是 0）
const HV = harvesterKit();
const H_NEAR = 80, PARKED = 14;
const harvSet = instanced(HV, H_NEAR + PARKED);
const rigMesh = {
  planter: instanced(planterKit(), 2),
  hiller: instanced(hillerKit(), 2),
  topper: instanced(topperKit(), 2),
  lifter: instanced(potatoLifterKit(), 2),
};
const buildingSets = {
  warehouse: instanced(warehouseKit(), 8),
  garage: instanced(garageKit(), 8),
  process: instanced(processKit(), 8),
  shed: instanced(shedKit(), 8),
};
const parked = Array.from({ length: PARKED }, (_, n) => ({ x: HUBC + 85 + (n % 7) * 14.6, z: HUBC + 150 + Math.floor(n / 7) * 22, ang: -Math.PI / 2 }));
const haulSet = instanced(haulerKit(), haulers.length);
const droneSet = instanced(droneKit(), drones.length, false);
// 小人：在中枢场地上散步
const people = Array.from({ length: 46 }, (_, n) => ({ x: HUBC - 120 + hr() * 260, z: HUBC - 60 + hr() * 200, a: hr() * 6.28, sp: 0.6 + hr() * 0.8 }));
const peopleSet = instanced(personKit(), people.length);
// 中枢
{ const hk = hubKit(hr); for (const k in hk) if (hk[k]) hk[k].translate(HUBC, 0, HUBC); staticMesh(hk); }
// 区站：每 3×3 区一座，位于主干走廊交叉口
{ const ds = instanced(depotKit(), depots.length); depots.forEach((d, i) => setInst(ds, i, d.x, 0, d.z, 0)); setCount(ds, depots.length); }
// 输送带走廊（中央 9×9 区内做成三维几何，外围只在地面着色器里画）
let convSegs = [], convSet = null, convAt = { x: 1e9, z: 1e9, on: false };
{
  const segs = [], R0 = 6;
  const near = (x, z) => Math.abs(x - HUBC) < L.BLOCK / 2 + 30 && Math.abs(z - HUBC) < L.BLOCK / 2 + 30;
  for (let t = 0; t <= L.NBZ; t++) for (let p = TRUNKS_X[L.HUBX - R0] + 20; p < TRUNKS_X[L.HUBX + R0 + 1] - 20; p += 40) if (!near(p, TRUNKS_Z[t])) segs.push([p, TRUNKS_Z[t], 0]);      // 沿环
  for (let t = L.HUBX - R0; t <= L.HUBX + R0 + 1; t++) for (let p = TRUNKS_Z[0] + 20; p < TRUNKS_Z[L.NBZ] - 20; p += 40) if (!near(TRUNKS_X[t], p)) segs.push([TRUNKS_X[t], p, Math.PI / 2]);   // 跨环
  convSegs = segs; convSet = instanced(conveyorKit(), segs.length);
}
// 只实例化镜头附近 1.8 km 内的段落；轨道层（>1800 m）完全不画，地面着色器里的输送带基座足够
function updateConveyors(d) {
  if (d > 1600) { if (convAt.on) { setCount(convSet, 0); convAt.on = false; } return; }
  if (convAt.on && Math.hypot(camS.x - convAt.x, camS.z - convAt.z) < Math.min(300, d * 0.4 + 60) && Math.abs(d - convAt.d) < d * 0.3) return;
  const W = Math.min(1100, d * 0.85 + 250);
  let n = 0; for (const [x, z, a] of convSegs) if (Math.abs(x - camS.x) < W && Math.abs(z - camS.z) < W && !inCut(x, z, 22)) setInst(convSet, n++, x, 0, z, a);
  setCount(convSet, n); convAt = { x: camS.x, z: camS.z, on: true, d };
}

// 传感灯杆（每个路口一根，14 m，低角度阳光下投出 30+ m 的细长影子）与平移式喷灌桁架（生长中的田）——只在镜头附近实例化
const MAST_CAP = 1600, IRR_CAP = 80;
const mastSet = instanced(mastKit(), MAST_CAP), irrSet = instanced(irrigatorKit(), IRR_CAP);
let infraAt = { x: 1e9, z: 1e9 }; const irrigs = [];
function rebuildInfra(cx, cz) {
  infraAt = { x: cx, z: cz }; let n = 0; const R0 = 1500;
  const xs = ROADS.filter(r => Math.abs(r - cx) < R0), zs = ROADS.filter(r => Math.abs(r - cz) < R0 && r > RING.Z_IN && r < RING.Z_OUT);
  for (const x of xs) for (const z of zs) { if (n >= MAST_CAP) break; if (inCut(x, z, 6) || (Math.abs(x - HUBC) < 270 && Math.abs(z - HUBC) < 270)) continue; setInst(mastSet, n++, x + 2.5, 0, z + 2.5, 0); }
  setCount(mastSet, n);
  irrigs.length = 0;
  for (const f of fields) { if (irrigs.length >= IRR_CAP) break; if (f.crop < 0 || Math.abs(f.x0 + 64 - cx) > R0 || Math.abs(f.z0 + 64 - cz) > R0 || inCut(f.x0 + 64, f.z0 + 64, 90)) continue; if (((f.i * 7 + f.j * 13) % 9) === 0 && !inCrater(f.x0 + 64, f.z0 + 64, 80)) irrigs.push({ f, ph: (f.i * 0.37 + f.j * 0.71) % 1 }); }
}
// ---------------- 剖面（C 键）：台阶状剖切盒，露出地下培育层与设备层 ----------------
// 每一层的内容由 DECK_BUILDERS[layer.content] 生成；以后加「水处理层」「仓储层」等，只需在 LAYERS 里加一项并在这里写一个函数
const RACK_CAP = 2600, MOD_CAP = 80, PIPE_CAP = 60, CART_CAP = 30, CREW_CAP = 60;
const rackSet = instanced(growRackKit(), RACK_CAP), tankSet = instanced(tankKit(), MOD_CAP), pumpSet = instanced(pumpKit(), MOD_CAP), pipeSet = instanced(pipeRackKit(), PIPE_CAP);
const cultureSet = instanced(cultureTankKit(), 8), armSet = instanced(armKit(), 1);
if (cultureSet.light) cultureSet.light.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(8 * 3), 3);
const DECK_SITE = { x: 980, z: -40 };
let tankPos = [], armX = DECK_SITE.x;
rackSet.light.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RACK_CAP * 3), 3);
const cartSet = instanced(haulerKit(), CART_CAP), crewSet = instanced(personKit(), CREW_CAP);
const deckSlabs = new THREE.Group(); scene.add(deckSlabs);
const RACK_COLS = ['sage', 'moss', 'oliveDp', 'tealGy', 'olive'].map(k => C(k).multiplyScalar(1.05));
const deckCarts = [], deckCrew = [];
const DECK_BUILDERS = {
  // 培育层：成排立体栽培架（12 m 一段），每 6 排一条 6 m 主通道，通道里有 AGV 小车和巡检人员
  protein(L0) {
    const y = L0.floor;
    tankPos = [];
    for (let i = 0; i < tanks.length; i++) {
      const x = cut.x + 40 + i * 12, z = cut.z;
      tankPos.push({ x, z, y });
      setInst(cultureSet, i, x, y, z, 0);
      const spec = CULTURES.find(c => c.id === tanks[i].species);
      const tint = !spec ? C('rego') : spec.id === 'bsf' ? C('sage') : C('ochre');
      if (cultureSet.light) cultureSet.light.setColorAt(i, tint);
    }
    if (cultureSet.light?.instanceColor) cultureSet.light.instanceColor.needsUpdate = true;
    setCount(cultureSet, tanks.length);
    armX = tankPos[0] ? tankPos[0].x : cut.x + 40;
    setInst(armSet, 0, armX, y, cut.z - 5, Math.PI / 2);
    setCount(armSet, 1);
  },
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
  const m = new THREE.Mesh(g, netMat); m.frustumCulled = false; m.renderOrder = 4; scene.add(m);
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
// 环带：拉远时镜头逐渐抬头、视角变宽 → 看到环带在前方升起、在天空中拱起，两侧是环壁，环壁外是太空与母星
function placeCamera() {
  if (camS.deck) {
    const yaw = camS.yaw, stand = Math.max(8, camS.d);
    cam.position.set(camS.x + Math.sin(yaw) * stand, camS.y + 2.6, camS.z + Math.cos(yaw) * stand);
    cam.lookAt(camS.x, camS.y + 1.05, camS.z);
    cam.fov = 46; cam.near = 0.15; cam.far = 220; cam.updateProjectionMatrix();
    return;
  }
  const p = pitchOf(camS.d) + camS.pOff;
  cam.position.set(camS.x + Math.sin(camS.yaw) * Math.cos(p) * camS.d, Math.sin(p) * camS.d, camS.z + Math.cos(camS.yaw) * Math.cos(p) * camS.d);
  cam.lookAt(camS.x, 0, camS.z);
  const far01 = THREE.MathUtils.smoothstep(camS.d, 1500, 5200);
  cam.rotateX((far01 * 25 + camS.lookUp) * DEG);
  cam.fov = 30 + 24 * far01 + camS.fovAdd;
  cam.near = Math.max(0.25, camS.d * 0.012); cam.far = 2.6 * RING.R + 6000; cam.updateProjectionMatrix();
}
// 交互：左键平移 / 右键旋转 / 滚轮缩放 / WASD / QE / N 昼夜 / M 地图模式 / H 隐藏界面
let drag = null, ptr = null, selected = null, selNote = '';
let mode = 'plan', watchRig = null, pickedLot = null, shopPick = 'seed', deckTank = 0;
const raycaster = new THREE.Raycaster();
function pickFlat(cx, cy) {
  const ndc = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, cam);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  const R0 = RING.R, ax = cam.position.x, ox = o.x - ax, oy = o.y - R0;
  const A = d.x * d.x + d.y * d.y;
  if (A < 1e-8) return null;
  const B = 2 * (ox * d.x + oy * d.y), Cq = ox * ox + oy * oy - R0 * R0, disc = B * B - 4 * A * Cq;
  if (disc < 0) return null;
  const sd = Math.sqrt(disc);
  let tHit = Infinity;
  for (const t of [(-B - sd) / (2 * A), (-B + sd) / (2 * A)]) if (t > 1) tHit = Math.min(tHit, t);
  if (!isFinite(tHit)) return null;
  const px = o.x + d.x * tHit, py = o.y + d.y * tHit, pz = o.z + d.z * tHit;
  const th = Math.atan2(px - ax, R0 - py);
  return { x: ax + th * R0, z: pz };
}
function selectField(f, why) { selected = f || null; selNote = why || ''; }
function onMapClick(cx, cy) {
  const p = pickFlat(cx, cy);
  if (mode === 'build') {
    if (!p) { toast('点在自己的田区里'); return; }
    const r = placeBuilding(p.x, p.z);
    if (!r.ok) toast(r.reason === 'field' ? '房子建在中枢地块上' : '只能建在自己的田区里');
    else { toast(`${r.building.name}已放下`); saveSoon(); paintSheet(); }
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
function doPlant(id) {
  if (!selected?.owned) { toast('不能播种'); return { ok: false, reason: 'plot' }; }
  const r = plantField(selected, id);
  if (!r.ok) {
    const why = r.reason === 'seed' ? '种薯不足' : r.reason === 'fertilizer' ? '肥料不足' : r.reason === 'busy' ? '这块田正在长' : '不能播种';
    toast(why);
    return r;
  }
  plantWin = { x: 1e9, z: 1e9, w: 0 };
  saveSoon();
  return r;
}
R.domElement.addEventListener('contextmenu', e => e.preventDefault());
R.domElement.addEventListener('pointerdown', e => {
  ptr = { x: e.clientX, y: e.clientY, b: e.button };
  drag = { b: e.button === 2 || e.shiftKey ? 'rot' : 'pan', x: e.clientX, y: e.clientY };
  R.domElement.setPointerCapture(e.pointerId);
});
addEventListener('pointerup', e => {
  if (ptr && ptr.b === 0 && Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) < 6) onMapClick(ptr.x, ptr.y);
  drag = null; ptr = null;
});
addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
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
  if (e.key === 'n' || e.key === 'N') nightT = nightT > 0.5 ? 0 : 1;
  if (e.key === 'm' || e.key === 'M') mapT = mapT > 0.5 ? 0 : 1;
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('nohud');
  if (e.key === 'c' || e.key === 'C') visitDeck(!camS.deck);
  if (e.key === 'F2' || e.key === '\\') { e.preventDefault(); toggleAdmin(); }
  if (e.key === 'v' || e.key === 'V') toggleViewer();
  if (e.key === 'Escape') { $('admin').classList.remove('on'); $('viewer').classList.remove('on'); }
  if ('1234'.includes(e.key)) gotoTier(+e.key);
});
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
let nightT = Q.has('night') ? 1 : 0, mapT = Q.has('map') ? 1 : 0;
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
  ['裸垄', PALETTE.regoDk, PALETTE.rego],
  ['出苗', PALETTE.regoDk, PALETTE.oliveDp],
  ['封垄', PALETTE.oliveDp, PALETTE.olive],
  ['开花', PALETTE.olive, '#c4b0d4'],
  ['碎秧', PALETTE.ochre, PALETTE.rust],
  ['起薯', PALETTE.straw, PALETTE.regoLt],
].map(([name, a, b]) => `<div class="lg"><i style="background:linear-gradient(90deg,${a},${b})"></i><span>${name}</span></div>`).join('');
const MODES = [['machines', '农机', 'FLEET'], ['plan', '区域', 'PLAN'], ['store', '仓库', 'STORE'], ['build', '建设', 'BUILD'], ['shop', '商店', 'SHOP']];
$('tiers').innerHTML = MODES.map(([id, zh, en]) => `<button type="button" data-mode="${id}"><b>${zh}</b><small>${en}</small></button>`).join('');
function gotoTier(n) { camT.d = [4800, 900, 160, 34][n - 1]; camT.pOff = 0; camT.lookUp = 0; camT.fovAdd = 0; }
function fieldCode(f) { return `F-${String(f.i).padStart(3, '0')}${String(f.j).padStart(2, '0')}`; }
function rigLine(r) {
  const info = rigReadout(r);
  if (!r.busy || !r.f) return '停在机库';
  return `${info.doing} · ${fieldCode(r.f)} · ${Math.round(info.frac * 100)}%`;
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
  el.innerHTML = `<b>${r.label}</b><small><em>${info.speed.toFixed(1)}</em> m/s</small><small>${info.doing}${where ? ' · ' + where : ''}</small><div id="rigbar"><i style="width:${pct}%"></i></div><small>本趟 ${pct}%</small>`;
}
function leaveDeck() {
  if (!camS.deck && !cut.on) return;
  camS.deck = camT.deck = false;
  camS.y = camT.y = 0;
  setCut(false);
}
function visitDeck(on) {
  if (!on) { leaveDeck(); showPlan(); return; }
  watchRig = null;
  setCut(true, DECK_SITE.x, DECK_SITE.z);
  const row = tankPos[1] || tankPos[0] || { x: cut.x + 58, z: cut.z, y: LAYERS[1].floor };
  camT.x = camS.x = row.x;
  camT.z = camS.z = row.z;
  camT.y = camS.y = row.y;
  camT.d = camS.d = 14;
  camT.yaw = camS.yaw = Math.PI;
  camT.pOff = camS.pOff = 0;
  camT.lookUp = camS.lookUp = 0;
  camT.fovAdd = camS.fovAdd = 0;
  camT.deck = camS.deck = true;
  mode = 'deck';
  paintModes();
  paintSheet();
}
function showPlan() {
  leaveDeck();
  watchRig = null;
  mode = 'plan';
  const f = selected?.owned ? selected : fieldAt(focus.i, focus.j);
  selectField(f, '');
  camT.x = camS.x = f.x0 + L.FIELD / 2;
  camT.z = camS.z = f.z0 + L.FIELD / 2;
  camT.d = camS.d = 720;
  camT.yaw = camS.yaw = 118 * DEG;
  camT.pOff = camS.pOff = -8 * DEG;
  camT.lookUp = camS.lookUp = 0;
  camT.fovAdd = camS.fovAdd = 6;
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
function paintSheet() {
  const el = $('sheet');
  if (mode === 'plan') { el.classList.remove('on'); el.innerHTML = ''; return; }
  el.classList.add('on');
  if (mode === 'machines') {
    el.innerHTML = `<div class="who"><b>农机</b><span>点一台，镜头跟着它</span></div>` + rigs.map(r => `<button type="button" class="rowbtn${watchRig && watchRig.id === r.id ? ' on' : ''}" data-rig="${r.id}"><b>${r.label}</b><small>${rigLine(r)}</small></button>`).join('');
  } else if (mode === 'store') {
    const potato = CROPS.find(c => c.id === 'potato');
    const price = quote(CROPS.indexOf(potato));
    const quotes = [`<div class="price"><span>${potato.name}</span><em>牌价 ${fmt(price)}</em></div>`].concat(CULTURES.map(c => `<div class="price"><span>${c.name}</span><em>牌价 ${fmt(c.price)}</em></div>`)).join('');
    const lots = warehouse.map(lot => {
      const where = lot.i == null || lot.j == null ? '培育层' : fieldCode(lot);
      return `<button type="button" class="rowbtn${pickedLot === lot.id ? ' on' : ''}" data-lot="${lot.id}"><b>${lot.name}</b><small>${where} · ${fmt(lot.liters)} ${lot.unit || 'L'}</small></button>`;
    }).join('');
    el.innerHTML = `<div class="who"><b>仓库</b><span>中枢仓库。选中一批，再出售。</span></div>${quotes}<p class="note">牌价是记账价。行情以后接在这里，现在不会变。</p>${lots || '<p class="note">仓里还是空的。</p>'}<button type="button" class="sell" id="sell"${pickedLot == null ? ' disabled' : ''}>出售</button>`;
  } else if (mode === 'shop') {
    const rows = SHOP.map(item => `<button type="button" class="rowbtn${shopPick === item.id ? ' on' : ''}" data-shop="${item.id}"><b>${item.name}</b><small>${fmt(item.price)} · 库存 ${stores[item.id]}</small></button>`).join('');
    const item = SHOP.find(s => s.id === shopPick) || SHOP[0];
    const use = item.id === 'seed' ? `种一块田用 ${SEED_PER_FIELD}。` : item.id === 'fertilizer' ? `种一块田用 ${FERT_PER_FIELD}。` : '开一槽用 1。';
    el.innerHTML = `<div class="who"><b>商店</b><span>用营收买。商品薯和蛋白仍在仓库出售。</span></div>${rows}<p class="note">${use}</p><div class="buyline"><input id="shop-qty" class="qty" type="text" inputmode="numeric" value="1" aria-label="购买数量" autocomplete="off"><button type="button" class="sell" id="buy">购买</button></div>`;
    const qty = $('shop-qty');
    qty.addEventListener('focus', ev => ev.target.select());
    qty.addEventListener('mouseup', ev => ev.preventDefault());
    qty.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); $('buy').click(); } });
  } else if (mode === 'build') {
    const placed = buildings.map(b => `<button type="button" class="rowbtn" data-shed="${b.id}"><b>${b.name}</b><small>中枢 · ${Math.round(b.x)}, ${Math.round(b.z)}</small></button>`).join('');
    el.innerHTML = `<div class="who"><b>建设</b><span>功能房只放在中枢地块上</span></div><p class="note">田里种薯。仓库、机库和加工棚落在中枢。</p>${placed || '<p class="note">中枢上还没有房子。</p>'}`;
  } else if (mode === 'deck') {
    const rows = tanks.map(t => {
      const w = cultureWatch(t);
      const line = w ? `${w.name} · 第 ${Math.floor(w.day)} / ${w.days} 日${w.tended ? ' · 臂已照料' : ''}${w.ready ? ' · 可收' : ''}` : '空槽';
      return `<button type="button" class="rowbtn${deckTank === t.id ? ' on' : ''}" data-tank="${t.id}"><b>槽 ${t.id + 1}</b><small>${line}</small></button>`;
    }).join('');
    el.innerHTML = `<div class="who"><b>培育层</b><span>${DECK_CLIMATE.temp}°C · 湿度 ${DECK_CLIMATE.rh}%</span></div><p class="note">设定值，不是天气。饲料 ${stores.feed}。选一种，臂去照料，到日再收。</p>${rows}<div class="buyline"><button type="button" class="sell" data-spawn="grub">养蛴螬</button><button type="button" class="sell" data-spawn="bsf">养黑水虻</button></div><div class="buyline"><button type="button" class="sell" id="tend">照料</button><button type="button" class="sell" id="harvest">收获</button></div>`;
  }
}
function setMode(id) {
  if (id !== 'deck' && camS.deck) {
    camS.deck = camT.deck = false;
    camS.y = camT.y = 0;
    camS.d = camT.d = 720;
    camS.pOff = camT.pOff = -8 * DEG;
    setCut(false);
  }
  mode = id;
  if (id === 'plan') { showPlan(); return; }
  if (id !== 'machines') watchRig = null;
  paintModes();
  paintSheet();
}
$('tiers').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  setMode(b.dataset.mode);
});
$('sheet').addEventListener('click', e => {
  const rig = e.target.closest('[data-rig]');
  if (rig) { lockRig(+rig.dataset.rig); return; }
  const lot = e.target.closest('[data-lot]');
  if (lot) { pickedLot = +lot.dataset.lot; paintSheet(); return; }
  const shed = e.target.closest('[data-shed]');
  if (shed) {
    const b = buildings.find(x => x.id === +shed.dataset.shed);
    if (!b) return;
    watchRig = null;
    if (camS.deck) leaveDeck();
    camT.x = camS.x = b.x; camT.z = camS.z = b.z; camT.d = camS.d = 80;
    if (b.kind === 'warehouse') setMode('store');
    return;
  }
  const shopRow = e.target.closest('[data-shop]');
  if (shopRow) { shopPick = shopRow.dataset.shop; paintSheet(); return; }
  const tankRow = e.target.closest('[data-tank]');
  if (tankRow) { deckTank = +tankRow.dataset.tank; paintSheet(); return; }
  const spawn = e.target.closest('[data-spawn]');
  if (spawn) {
    const started = startCulture(deckTank, spawn.dataset.spawn);
    if (!started.ok) toast(started.reason === 'feed' ? '饲料不足' : started.reason === 'busy' ? '这口槽已经在养' : '不能开始');
    else { toast(`${started.name}已入槽`); saveSoon(); if (cut.on) buildCut(); }
    paintSheet();
    return;
  }
  if (e.target.id === 'tend') {
    const tended = tendCulture(deckTank);
    if (!tended.ok) toast('这口槽是空的');
    else toast('机械臂过去照料');
    paintSheet();
    return;
  }
  if (e.target.id === 'harvest') {
    const got = harvestCulture(deckTank);
    if (!got.ok) toast(got.reason === 'early' ? '还没到收获日' : '这口槽是空的');
    else { toast(`<b>入仓</b>${got.lot.name}`); saveSoon(); if (cut.on) buildCut(); }
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
    if (pickedLot == null) return;
    const sold = sellLot(pickedLot);
    pickedLot = null;
    if (!sold) toast('这仓薯已经不在了');
    paintSheet();
    saveSoon();
  }
});
paintModes();
// 分层面板：列出 LAYERS（剖面打开时，被剖开的层高亮）
$('layers').innerHTML = `<div class="lh">分层 · LAYERS <em>C 下到培育层</em></div>` + LAYERS.map(l => `<div class="ly ly-${l.id}"${l.id === 'grow' ? ' data-deck="1"' : ''}><i></i><span>${l.name}</span><small>${l.en}</small><em>${l.floor === 0 ? '±0 m' : l.floor.toFixed(0) + ' m'}</em></div>`).join('');
$('layers').addEventListener('click', e => { if (e.target.closest('[data-deck]')) visitDeck(!camS.deck); });
const pv = new THREE.Vector3();
function project(x, y, z) {
  const cx = U.uCurve.value.x, R0 = RING.R, th = (x - cx) / R0, r = R0 - y;   // 与 curveWorld 相同的环带卷曲
  pv.set(cx + r * Math.sin(th), R0 - r * Math.cos(th), z).project(cam);
  return pv.z < 1 && pv.z > -1 ? [(pv.x * 0.5 + 0.5) * innerWidth, (-pv.y * 0.5 + 0.5) * innerHeight] : null;
}
const secName = (bi, bj) => `S-${String(bi).padStart(2, '0')}${String(bj).padStart(2, '0')}`;
function updateLabels(d) {
  const want = [];
  const far = d > 1500, mid = d > 260 && d <= 1500, ops = d <= 260 && d > 60;
  const aSec = Math.min(1, Math.max(0, (d - 1400) / 600)), aField = Math.min(1, Math.max(0, (d - 230) / 120)) * (1 - Math.min(1, Math.max(0, (d - 1300) / 300)));
  if (aSec > 0) for (let bj = 0; bj < L.NBZ; bj++) for (let bi = 0; bi < L.NBX; bi++) {
    const x = L.X0 + bi * L.BP + L.BLOCK / 2, z = L.Z0 + bj * L.BP + L.BLOCK / 2;
    if (Math.hypot(x - camS.x, z - camS.z) > d * 1.0) continue;
    const hub = bi === L.HUBX && bj === L.HUBZ; if (!hub && (bi % 3 !== 1 || bj % 3 !== 1)) continue;
    want.push({ x, z, pr: hub ? 0 : 1, a: aSec, html: hub ? `<b>中枢 · CENTRAL HUB</b><small>试验卫星 · 农神VIII</small>` : `<b>${secName(bi, bj)}</b><small>邻区</small>`, cls: hub ? 'hub' : 'sec' });
  }
  if (aField > 0) for (const f of fields) {
    if (f.crop < 0) continue; const x = f.x0 + 64, z = f.z0 + 64; if (Math.hypot(x - camS.x, z - camS.z) > Math.min(d * 1.15, 720) || inCut(x, z, 40)) continue;
    const watch = cropWatch(f);
    const st = watch ? `${watch.label} · 第 ${Math.floor(watch.day)} 日` : (f.state === 3 ? '作业' : '定格冠层');
    const sw = watch ? PALETTE.olive : PALETTE.rego;
    want.push({ x, z, pr: 2, a: aField, html: `<i style="background:${sw}"></i><b>F-${String(f.i).padStart(2, '0')}${String(f.j).padStart(2, '0')}</b><span>${st}</span>`, cls: 'fld' + ((f === selected || watch) ? ' act' : '') });
  }
  if (ops) for (const h of nearH.slice(0, 6)) if (h.mode === 'cut' || h.mode === 'turn') want.push({ x: h.x, z: h.z, y: 8, pr: 3, a: Math.min(1, (260 - d) / 60) * Math.min(1, (d - 60) / 30), html: `<b>H-${String(h.id).padStart(3, '0')}</b><span>作业</span>`, cls: 'veh' });
  for (const r of rigs) if (r.busy) want.push({ x: r.x, z: r.z, y: 6, pr: 3, a: Math.min(1, Math.max(0, (1400 - d) / 500)), html: `<b>${r.label}</b>`, cls: 'veh' });
  if (cut.on && d < 2200) {
    const I = cutInner(), a = 1 - Math.min(1, Math.max(0, (d - 1500) / 500));
    want.push({ x: cut.x + 58, z: cut.z, y: LAYERS[1].floor + 2, pr: -2, a, html: `<b>${LAYERS[1].name}</b><small>${DECK_CLIMATE.temp}°C · 湿度 ${DECK_CLIMATE.rh}% · 蛴螬 / 黑水虻</small>`, cls: 'hub deck' });
    want.push({ x: (I.x0 + I.x1) / 2, z: I.z0 + 20, y: LAYERS[2].floor, pr: -2, a, html: `<b>${LAYERS[2].name} · ${LAYERS[2].en}</b><small>${LAYERS[2].floor} m · 储液 / 泵站 / 管廊</small>`, cls: 'hub deck' });
  }
  want.push({ x: HUBC, z: HUBC, pr: -1, a: (d > 260 && d <= 1500) ? 1 : 0, html: `<b>中枢 · CENTRAL HUB</b><small>试验卫星 · 农神VIII</small>`, cls: 'hub' });
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
Object.assign(camT, camS); const follow = camS.follow; delete camT.follow;
if (Q.get('cx')) { camS.x = camT.x = HUBC + +Q.get('cx'); camS.z = camT.z = HUBC + +(Q.get('cz') || 0); camS.follow = camT.follow = null; }
if (Q.get('d')) camS.d = camT.d = +Q.get('d');
if (Q.get('yaw')) camS.yaw = camT.yaw = +Q.get('yaw') * DEG;
if (Q.get('po')) camS.pOff = camT.pOff = +Q.get('po') * DEG;
if (Q.get('lu')) camS.lookUp = camT.lookUp = +Q.get('lu');
if (Q.has('cut') || VIEW === 'cut') setCut(true, camS.x, camS.z);

const SAVE_KEY = 'ringsheaf.nongshen8.v1';
const fmt = n => Math.round(n).toLocaleString('en-US');
function saveNow() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(exportSnapshot())); } catch (e) { /* private mode */ } }
function saveSoon() { clearTimeout(saveSoon.t); saveSoon.t = setTimeout(saveNow, 400); }
function loadNow() { try { const raw = localStorage.getItem(SAVE_KEY); return raw ? applySnapshot(JSON.parse(raw)) : false; } catch (e) { return false; } }
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
  $('kpi-day').textContent = String(Math.floor(worldDay));
  $('kpi-seed').textContent = String(stores.seed);
  $('kpi-act').textContent = String(act);
  $('stores').textContent = `种薯 ${stores.seed} · 肥料 ${stores.fertilizer} · 干燥剂 ${stores.spray}`;
}
function updateDock() {
  const el = $('dock');
  if (!selected) { el.classList.remove('on'); return; }
  el.classList.add('on');
  const f = selected;
  const watch = cropWatch(f);
  let stat = selNote;
  if (!stat) {
    if (!f.owned) stat = '邻区快照 · 只读';
    else if (watch) stat = `中熟商品薯 · ${watch.label} · 播后 ${Math.floor(watch.day)} / ${watch.days} 日`;
    else if (stores.seed < SEED_PER_FIELD) stat = '种薯不足。打开商店买一份。';
    else if (stores.fertilizer < FERT_PER_FIELD) stat = '肥料不足。打开商店买一份。';
    else if (f.state === 0) stat = '裸地 · 点种薯，播种机起垄';
    else stat = '定格冠层 · 可改种商品薯';
  }
  $('selid').textContent = `F-${String(f.i).padStart(3, '0')}${String(f.j).padStart(2, '0')}`;
  $('selstat').textContent = stat;
  const p = watch ? Math.max(0, Math.min(1, watch.day / watch.days)) : 0;
  $('selbar').style.width = (p * 100).toFixed(1) + '%';
  document.querySelectorAll('#selbtns button').forEach(b => {
    b.disabled = !f.owned;
    b.classList.toggle('on', !!watch && stores.seed >= SEED_PER_FIELD);
  });
}
function paintRates() {
  document.querySelectorAll('#rates button').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.rate - economy.timeScale) < 1e-6));
  const input = $('rate-in');
  if (input && document.activeElement !== input) input.value = String(economy.timeScale);
}
$('kpi').innerHTML = `<div><small>营收</small><b class="hv" id="kpi-rev">0</b></div><div><small>世界日</small><b id="kpi-day">0</b></div><div><small>种薯</small><b id="kpi-seed">${stores.seed}</b></div><div><small>作业</small><b class="hv" id="kpi-act">0</b><em>/ ${rigs.length}</em></div>`;
$('dock').innerHTML = `<div class="who"><b id="selid"></b><span id="selstat"></span></div><div id="bar"><i id="selbar"></i></div><div class="row" id="selbtns"></div>`;
for (const c of CROPS) if (c.plantable) {
  const b = document.createElement('button');
  b.dataset.crop = c.id;
  b.innerHTML = `<b>${c.name}</b><small>种薯 ${SEED_PER_FIELD} · 肥料 1 · ${POTATO_DAYS} 日 · ${fmt(quote(CROPS.indexOf(c)))}</small>`;
  b.style.gridColumn = '1 / -1';
  b.addEventListener('click', () => doPlant(c.id));
  $('selbtns').appendChild(b);
}
$('rates').innerHTML = `<span>1× = 1 分/日</span>` + [1, 4, 12].map(r => `<button type="button" data-rate="${r}">${r}×</button>`).join('') + `<input id="rate-in" type="text" inputmode="decimal" value="1" aria-label="世界钟倍率" autocomplete="off">`;
function applyTypedRate() {
  const v = +$('rate-in').value;
  if (!(v > 0)) { paintRates(); return; }
  setTimeScale(v); paintRates(); saveSoon();
}
$('rates').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setTimeScale(+b.dataset.rate); paintRates(); saveSoon(); });
$('rate-in').addEventListener('focus', e => e.target.select());
$('rate-in').addEventListener('mouseup', e => e.preventDefault());
$('rate-in').addEventListener('change', applyTypedRate);
$('rate-in').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyTypedRate(); } });
paintRates();
function toggleAdmin() { $('admin').classList.toggle('on'); }
$('admin-toggle').addEventListener('click', toggleAdmin);
function paintPause() {
  $('pause').textContent = paused ? '继续' : '暂停';
  $('pause').classList.toggle('on', paused);
  $('clock').textContent = paused ? `第 ${Math.floor(worldDay)} 日 · 暂停` : `第 ${Math.floor(worldDay)} 日`;
}
$('pause').addEventListener('click', () => { setPaused(!paused); paintPause(); });
function askReset(on) { $('admin').classList.toggle('on-reset', on); }
$('reset').addEventListener('click', () => askReset(true));
$('reset-no').addEventListener('click', () => askReset(false));
$('reset-yes').addEventListener('click', () => {
  askReset(false);
  resetGame();
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* private mode */ }
  clearTimeout(saveSoon.t);
  seenLog = 0;
  shownRev = -1;
  watchRig = null;
  selectField(fieldAt(focus.i, focus.j), '');
  showPlan();
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
  for (const [name, g] of [['裸垄', 1.2], ['出苗', 2.2], ['封垄', 3.2], ['开花', 4.2], ['碎秧', 5.2], ['起薯', 6.2]]) {
    const el = assetCard(name); $('view-stages').appendChild(el);
    shootField(host, el.querySelector('canvas'), { crop: potato, g, s: L.LANES, dir: 0 });
  }
  for (const [name, kit] of [['拖拉机', tractorKit], ['播种机', planterKit], ['培土机', hillerKit], ['杀秧机', topperKit], ['收获机', potatoLifterKit]]) {
    const el = assetCard(name); $('view-machines').appendChild(el);
    shootMachine(kit, el.querySelector('canvas'));
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
if (!VIEW && !Q.has('fresh')) loadNow();
if (!VIEW) selectField(fieldAt(focus.i, focus.j));
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
  if (follow && !drag && !Q.has('nofollow')) { camT.x += (follow.x - camT.x) * 0.5; camT.z += (follow.z - camT.z) * 0.5; }
  const k = 1 - Math.exp(-dt * 7);
  for (const key of ['x', 'z', 'yaw', 'pOff', 'lookUp', 'fovAdd']) camS[key] += (camT[key] - camS[key]) * k;
  // 环向首尾相接：镜头绕环一圈后坐标回卷（画面不变）
  if (!follow) { const wx = wrapX(camS.x); if (wx !== camS.x) { camT.x += wx - camS.x; camS.x = wx; } }
  camT.z = Math.max(RING.WALL_A + 60, Math.min(RING.WALL_B - 60, camT.z));
  camS.d = Math.exp(Math.log(camS.d) + (Math.log(camT.d) - Math.log(camS.d)) * k);
  const d = camS.d; U.uCamDist.value = d;
  placeCamera();
  U.uCurve.value.set(cam.position.x, 0, RING.R);
  { const gx = Math.round(cam.position.x / (RING.CIRC / 760)) * (RING.CIRC / 760); ground.position.set(gx, 0, 0); walls.position.set(gx, 0, 0); }
  sky.position.copy(cam.position); sky.scale.setScalar(cam.far * 0.9);
  // 昼夜 / 地图模式过渡
  U.uNight.value += (nightT - U.uNight.value) * Math.min(1, dt * 2); U.uMap.value += (mapT - U.uMap.value) * Math.min(1, dt * 3);
  const nt = U.uNight.value;
  sun.color.set('#ffd9b0').lerp(new THREE.Color('#9fb4d0'), nt); sun.intensity = 3.6 * (1 - nt) + 0.35 * nt;
  hemi.intensity = 0.42 * (1 - nt) + 0.22 * nt; scene.environmentIntensity = 0.45 * (1 - nt) + 0.12 * nt;
  // 拉远时雾色变亮：被阳光照透的大气，让远处的环带拱顶发亮（远景的高光端主要来自这里）
  scene.fog.color.copy(FOG_DAY).lerp(FOG_FAR, THREE.MathUtils.smoothstep(d, 900, 4000)).lerp(FOG_NIGHT, nt);
  // 近中景沿用 v3 的空气透视；拉远后雾变薄，让环带拱顶隔着一层大气浮现在天空里
  scene.fog.density = (5.6e-5 + 0.29 / d * Math.pow(d / 4300, 0.3) * (1 - THREE.MathUtils.smoothstep(d, 120, 700))) * (1 + nt * 0.4);
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
  if (plantOn && (Math.hypot(camS.x - plantWin.x, camS.z - plantWin.z) > W * 0.2 || Math.abs(W - plantWin.w) > W * 0.25)) rebuildPlants(camS.x, camS.z, W);
  for (const s2 of SHAPES) plantMeshes[s2].visible = plantOn;
  U.uPlantWin.value.set(plantWin.x, plantWin.z, plantWin.w, plantOn ? 1 : 0);
  // 收割机：离镜头中心最近的 N 台用完整模型
  for (const h of harvesters) h._d = Math.hypot(h.x - camS.x, h.z - camS.z);
  nearH = harvesters.filter(h => h._d < Math.max(400, d * 2.2) && h.mode !== 'idle').sort((a, b) => a._d - b._d).slice(0, H_NEAR);
  let n = 0;
  for (const p of parked) setInst(harvSet, n++, p.x, 0, p.z, p.ang);
  for (const h of nearH) {
    if (inCut(h.x, h.z, 8)) continue;
    h.va = h.va === undefined ? h.ang : h.va + Math.atan2(Math.sin(h.ang - h.va), Math.cos(h.ang - h.va)) * Math.min(1, dt * 8);
    setInst(harvSet, n++, h.x, 0, h.z, h.va);
    if (h.mode === 'cut' && d < 600 && h._d < 300) for (let e = 0; e < 3; e++) emitDust(h.x, h.z, h.va);
  }
  setCount(harvSet, d < 1500 ? n : 0);
  for (const r of rigs) {
    const set = rigMesh[r.kind];
    if (!set || d >= 1500 || inCut(r.x, r.z, 8)) { if (set) setCount(set, 0); continue; }
    r.va = r.va === undefined ? r.ang : r.va + Math.atan2(Math.sin(r.ang - r.va), Math.cos(r.ang - r.va)) * Math.min(1, dt * 8);
    setInst(set, 0, r.x, 0, r.z, r.va, r.kind === 'lifter' ? 1.45 : 2.4);
    setCount(set, 1);
    if (r.busy && d < 700) for (let e = 0; e < 2; e++) emitDust(r.x, r.z, r.va);
  }
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
  composer.render();
  // HUD
  if (mode === 'machines') document.querySelectorAll('#sheet [data-rig] small').forEach(el => {
    const r = rigs.find(x => x.id === +el.parentElement.dataset.rig);
    if (r) el.textContent = rigLine(r);
  });
  if (mode === 'deck') document.querySelectorAll('#sheet [data-tank] small').forEach(el => {
    const tank = tanks[+el.parentElement.dataset.tank];
    const w = cultureWatch(tank);
    el.textContent = w ? `${w.name} · 第 ${Math.floor(w.day)} / ${w.days} 日${w.tended ? ' · 臂已照料' : ''}${w.ready ? ' · 可收' : ''}` : '空槽';
  });
  for (const kind of Object.keys(buildingSets)) {
    const list = buildings.filter(b => (b.kind || 'shed') === kind);
    const set = buildingSets[kind];
    const n = d < 2200 ? Math.min(list.length, 8) : 0;
    for (let i = 0; i < n; i++) setInst(set, i, list[i].x, 0, list[i].z, list[i].ang || 0);
    setCount(set, n);
  }
  if (cut.on && tankPos.length) {
    const focusTank = tanks[deckTank]?.species ? deckTank : tanks.findIndex(t => t.species);
    const goal = tankPos[focusTank >= 0 ? focusTank : 0];
    if (goal) {
      armX += (goal.x - armX) * Math.min(1, dt * 1.4);
      setInst(armSet, 0, armX, goal.y, goal.z - 5, Math.PI / 2);
      setCount(armSet, 1);
      for (let i = 0; i < tanks.length && i < tankPos.length; i++) {
        const spec = CULTURES.find(c => c.id === tanks[i].species);
        const tint = !spec ? C('rego') : spec.id === 'bsf' ? C('sage') : C('ochre');
        if (cultureSet.light) cultureSet.light.setColorAt(i, tint);
      }
      if (cultureSet.light?.instanceColor) cultureSet.light.instanceColor.needsUpdate = true;
    }
  }
  const mpp = d * 2 * Math.tan(15 * DEG) / innerHeight; const [m, px] = niceScale(mpp);
  $('scalebar').style.width = px.toFixed(0) + 'px'; $('scaletxt').textContent = m >= 1000 ? (m / 1000) + ' km' : m + ' m';
  updateLabels(d);
  paintKpi();
  updateDock();
  paintLock();
  if (selected && selected.crop >= 0) { U.uSelOn.value = 1; U.uSel.value.set(selected.x0, selected.x0 + L.FIELD, selected.z0, selected.z0 + L.FIELD); }
  else U.uSelOn.value = 0;
  drainLog();
  if (frames === 0) {
    $('clock').textContent = paused ? `第 ${Math.floor(worldDay)} 日 · 暂停` : `第 ${Math.floor(worldDay)} 日`;
    $('fps').textContent = `${fpsShow.toFixed(0)} FPS`;
  }
  window.__stats = { fps: fpsShow, t, sim: simTime, d, revenue: economy.revenue, g: selected && selected.g, state: selected && selected.state, plants: Object.values(plantMeshes).reduce((a, m) => a + (m.visible ? m.count : 0), 0), harvesters: harvesters.length, active: harvesters.filter(h => h.mode === 'cut').length, calls: R.info.render.calls, tris: R.info.render.triangles };
  requestAnimationFrame(frame);
}
if (SHOWFPS) document.body.classList.add('showfps');
window.__scene = scene;
if (Q.has('nohud')) document.body.classList.add('nohud');
requestAnimationFrame(frame);
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); R.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); gtao.setSize(innerWidth, innerHeight); });
window.__farm = {
  economy, stores, focus, fields, harvesters, rigs, log, CROPS, PLOT, quote, fieldAtWorld, project, pick: pickFlat,
  warehouse, buildings, sellLot, placeBuilding, buySeed, buyItem, resetGame, shop: SHOP,
  cultures: CULTURES, tanks, climate: DECK_CLIMATE, startCulture, tendCulture, harvestCulture, cultureWatch,
  deck(on) { visitDeck(on == null ? !camS.deck : !!on); },
  get onDeck() { return !!camS.deck; },
  snapshot: exportSnapshot, plant: doPlant, select: (i, j) => selectField(fieldAt(i, j)),
  setTimeScale, setPaused,
  get selected() { return selected; },
  get worldDay() { return worldDay; },
  get mode() { return mode; },
  get camera() { return { x: camS.x, z: camS.z, d: camS.d }; },
  watch: () => cropWatch(selected),
  lock(id) { setMode('machines'); lockRig(id); paintLock(); },
  aim(yawDeg, dist, pitch) {
    if (yawDeg != null) camT.yaw = camS.yaw = yawDeg * DEG;
    if (dist != null) camT.d = camS.d = dist;
    if (pitch != null) camT.pOff = camS.pOff = pitch * DEG;
  },
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
