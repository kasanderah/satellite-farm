// 单元自身的土性。按世界日走，不跟帧。
// 曲线是每天的增减。生长和作业影响先留接口，默认是 0，不改现有产量。

export const SOIL_STORE = 'ringsheaf.assetlab.soilCurves.v1';

export const SOIL_PROPS = [
  { id: 'loosen', name: '疏松度', min: 0, max: 100, base: 42, digits: 0 },
  { id: 'organic', name: '有机质', min: 0, max: 100, base: 28, digits: 0 },
  { id: 'moisture', name: '含水率', min: 0, max: 100, base: 36, digits: 0 },
  { id: 'ph', name: '酸碱值', min: 4, max: 9, base: 6.6, digits: 1 },
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function defaultSoilCurves() {
  return {
    loosen: { points: [{ t: 0, v: 0.15 }, { t: 0.45, v: -0.05 }, { t: 1, v: 0.15 }], crop: 0, work: 0.4 },
    organic: { points: [{ t: 0, v: -0.04 }, { t: 1, v: -0.04 }], crop: 0.02, work: 0 },
    moisture: { points: [{ t: 0, v: -0.35 }, { t: 0.35, v: 0.55 }, { t: 1, v: -0.35 }], crop: -0.05, work: 0 },
    ph: { points: [{ t: 0, v: 0 }, { t: 1, v: 0 }], crop: 0, work: 0 },
  };
}

export function freshSoil() {
  const soil = { day: -1 };
  for (const prop of SOIL_PROPS) soil[prop.id] = prop.base;
  return soil;
}

export function sampleCurve(points, t) {
  const pts = (points || []).map(p => ({ t: Number(p.t), v: Number(p.v) })).filter(p => Number.isFinite(p.t) && Number.isFinite(p.v));
  pts.sort((a, b) => a.t - b.t);
  if (!pts.length) return 0;
  const u = ((t % 1) + 1) % 1;
  if (pts.length === 1 || u <= pts[0].t) return pts[0].v;
  const last = pts[pts.length - 1];
  if (u >= last.t) return last.v;
  let i = 0;
  while (i < pts.length - 2 && pts[i + 1].t < u) i += 1;
  const a = pts[i];
  const b = pts[i + 1];
  const s = (u - a.t) / Math.max(1e-6, b.t - a.t);
  return a.v + (b.v - a.v) * s;
}

export function normalizeSoilCurves(input) {
  const base = defaultSoilCurves();
  const out = {};
  for (const prop of SOIL_PROPS) {
    const raw = input && input[prop.id];
    const points = Array.isArray(raw?.points) && raw.points.length
      ? raw.points.map(p => ({ t: clamp(Number(p.t) || 0, 0, 1), v: clamp(Number(p.v) || 0, -2, 2) })).slice(0, 8)
      : base[prop.id].points.map(p => ({ ...p }));
    points.sort((a, b) => a.t - b.t);
    out[prop.id] = {
      points,
      crop: clamp(Number(raw?.crop) || 0, -1, 1),
      work: clamp(Number(raw?.work) || 0, -1, 1),
    };
  }
  return out;
}

// 生长、作业以后从这里送进曲线。现在调用方可以传 0。
export function soilDrivers(source) {
  return {
    crop: source?.crop ? 1 : 0,
    work: source?.work ? 1 : 0,
  };
}

export function stepSoil(soil, curves, drivers = { crop: 0, work: 0 }) {
  const book = curves || defaultSoilCurves();
  const day = soil.day < 0 ? 0 : soil.day;
  const t = (day % 120) / 120;
  for (const prop of SOIL_PROPS) {
    const curve = book[prop.id] || defaultSoilCurves()[prop.id];
    let delta = sampleCurve(curve.points, t);
    delta += (drivers.crop || 0) * (curve.crop || 0);
    delta += (drivers.work || 0) * (curve.work || 0);
    soil[prop.id] = clamp((Number(soil[prop.id]) || prop.base) + delta, prop.min, prop.max);
  }
  soil.day = day + 1;
  return soil;
}

// 产量和品质以后读这里。本刀固定不改数，只把接口留住。
export function soilOutlook() {
  return { yieldMul: 1, qualityAdd: 0 };
}

export function soilText(soil) {
  const row = soil || freshSoil();
  return SOIL_PROPS.map(prop => {
    const n = Number(row[prop.id]);
    const text = Number.isFinite(n) ? n.toFixed(prop.digits) : '—';
    return `${prop.name} ${text}`;
  }).join(' · ');
}
