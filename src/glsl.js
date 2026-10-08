// GLSL 片段：农场网格查询（地面着色器与单株实例共用）、地面弯曲、噪声
import { L, CROPS, CRATERS, RING } from './_shared.js';
const f = v => (Number.isInteger(v) ? v.toFixed(1) : String(v));

const NOISE_BODY = /* glsl */`
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p),u=fract(p); u=u*u*(3.-2.*u);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+1.),u.x),u.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+17.1; a*=.5; } return s; }
`;
export const NOISE = `\n#ifndef HAS_NOISE\n#define HAS_NOISE\n${NOISE_BODY}\n#endif\n`;

export const FARM = /* glsl */`
#ifndef HAS_NOISE
#define HAS_NOISE
${NOISE_BODY}
#endif
#define NBX ${f(L.NBX)}
#define NBZ ${f(L.NBZ)}
#define Z0 ${f(L.Z0)}
#define CIRC ${f(RING.CIRC)}
#define WALL_A ${f(RING.WALL_A)}
#define WALL_B ${f(RING.WALL_B)}
#define PER ${f(L.PER)}
#define FIELD ${f(L.FIELD)}
#define ROAD ${f(L.ROAD)}
#define TRUNK ${f(L.TRUNK)}
#define BLOCK ${f(L.BLOCK)}
#define BP ${f(L.BP)}
#define X0 ${f(L.X0)}
#define HUBX ${f(L.HUBX)}
#define HUBZ ${f(L.HUBZ)}
#define LANE ${f(L.LANE)}
#define NCROP ${CROPS.length}
uniform sampler2D uField;          // 每个田块一个像素：r 作物 / g 生长度 / b 收割进度 / a 田垄方向
uniform vec4 uCropP[NCROP];        // x 株高 / y 行距 / z 纹理类型 / w 株距
uniform vec3 uCropRipe[NCROP];
uniform vec3 uCropYoung[NCROP];
uniform vec3 uCropStub[NCROP];
// kind: 0 环壁下的检修带 / 1 田间路 / 2 主干走廊 / 3 田块 / 4 中枢硬化场地
const vec3 CRATERS[${CRATERS.length}] = vec3[](${CRATERS.map(c => `vec3(${c.map(v => v.toFixed(1)).join(',')})`).join(',')});
float craterD(vec2 p, out vec3 cr){ float best = 1e9; for (int i = 0; i < ${CRATERS.length}; i++){ float d = length(p - CRATERS[i].xy) / CRATERS[i].z; if (d < best){ best = d; cr = CRATERS[i]; } }
  if (best < 1.4) { vec2 q = p / 260.; best += (vnoise(q) + 0.5 * vnoise(q * 2.7) - 0.75) * 0.22; }   // 不规则的坑缘
  return best; }
int farmCell(vec2 p, out ivec2 fij, out vec2 loc, out vec2 bl){
  vec3 crx; if (craterD(p, crx) < 1.0) { fij = ivec2(-1); loc = vec2(0.); bl = vec2(0.); return 0; }
  vec2 q = p - vec2(X0, Z0);
  q.x = mod(q.x, CIRC);                      // 环向首尾相接
  vec2 b = floor(q / BP);
  fij = ivec2(-1); loc = vec2(0.); bl = q - b*BP;
  if (q.y > -TRUNK && q.y < 0.) { bl.y = BLOCK + TRUNK + q.y; return 2; }   // 最外侧的主干走廊
  if (b.y < 0. || b.y >= NBZ) { bl = vec2(q.x, q.y < 0. ? WALL_A - p.y : p.y - WALL_B); return 0; }   // 检修带：bl.y = 到环壁的距离（负值）
  if (bl.x > BLOCK || bl.y > BLOCK) return 2;
  if (b.x == HUBX && b.y == HUBZ) return 4;
  vec2 fi = floor(bl / (FIELD + ROAD));
  loc = bl - fi * (FIELD + ROAD);
  if (loc.x > FIELD || loc.y > FIELD) return 1;
  fij = ivec2(b * PER + fi);
  return 3;
}
bool laneCut(vec2 uv, float s){
  float lane = floor(uv.y / LANE), fs = floor(s);
  if (lane < fs) return true;
  if (lane > fs) return false;
  float fr = (s - fs) * FIELD;
  return mod(lane, 2.) < .5 ? uv.x < fr : uv.x > FIELD - fr;
}
// g < 1：邻区冠层沿用生长度。g >= 1：商品薯阶段（1 裸垄 2 出苗 3 封垄 4 开花 5 碎秧 6 起薯）
float growthVis(float g){
  float stage = floor(g + 0.001);
  if (stage < 0.5) return g;
  if (stage < 1.5) return 0.0;
  if (stage < 2.5) return 0.34;
  if (stage < 3.5) return 0.74;
  if (stage < 4.5) return 0.9;
  if (stage < 5.5) return 0.14;
  return 0.0;
}
// 某点的冠层高度（已割 / 非田块 = 0）
float canopyAt(vec2 p){
  ivec2 fij; vec2 loc, bl; int k = farmCell(p, fij, loc, bl);
  if (k != 3) return 0.;
  vec4 d = texelFetch(uField, fij, 0);
  if (d.r < 0.) return 0.;
  vec2 uv = d.a > .5 ? loc.yx : loc;
  float stage = floor(d.g + 0.001);
  if (laneCut(uv, d.b) && stage < 0.5) return 0.;
  if (laneCut(uv, d.b) && stage > 4.5) return 0.;
  return growthVis(d.g) * uCropP[int(d.r + .5)].x;
}
`;

// 环带卷曲：平面坐标 (x 沿环, y 向轴, z 跨环) → 圆柱内表面。以镜头所在的 x 为基准（那里不变形），
// 前后两个方向都向上卷起，在头顶 (θ = ±π) 合拢。只改投影位置；光照与阴影仍在平面坐标里算（整条环带受光一致）。
export const CURVE_DECL = /* glsl */`
uniform vec3 uCurve; // x 镜头所在的环向坐标，z = 环半径 R
vec4 curveWorld(vec4 w){ float th = (w.x - uCurve.x) / uCurve.z; float r = uCurve.z - w.y; w.x = uCurve.x + r * sin(th); w.y = uCurve.z - r * cos(th); return w; }
`;
export const CURVE_PROJECT = /* glsl */`
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 cwPos = curveWorld( modelMatrix * mvPosition );
mvPosition = viewMatrix * cwPos;
gl_Position = projectionMatrix * mvPosition;
`;
