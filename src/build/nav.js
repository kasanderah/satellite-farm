// 路线碰到建筑占地时，在这一段周围绕开。绕不过去就停在挡住之前。
// 只有已经停下的车才按这个间隔重试，行驶中不刷新路线。
export const NAV_RETRY_S = 5;
const RES = 4.2;
const WINDOW = 52;

function sampleLine(ax, az, bx, bz, out) {
  const dist = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(dist / 3));
  for (let i = 1; i <= n; i++) out.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]);
}

function samplesOf(x, z, ex, ez, base) {
  const pts = [[x, z]];
  sampleLine(x, z, base[0]?.[0] ?? ex, base[0]?.[1] ?? ez, pts);
  let px = base[0]?.[0] ?? x;
  let pz = base[0]?.[1] ?? z;
  for (let i = 1; i < base.length; i++) {
    sampleLine(px, pz, base[i][0], base[i][1], pts);
    px = base[i][0];
    pz = base[i][1];
  }
  if (!base.length) sampleLine(x, z, ex, ez, pts);
  else if (Math.hypot(px - ex, pz - ez) > 1) sampleLine(px, pz, ex, ez, pts);
  return pts;
}

function thin(pts) {
  const out = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev[0] - p[0], prev[1] - p[1]) < 1.2) continue;
    const a = out[out.length - 2];
    if (a && prev) {
      const c1 = (prev[0] - a[0]) * (p[1] - prev[1]) - (prev[1] - a[1]) * (p[0] - prev[0]);
      if (Math.abs(c1) < 1.5) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

function astar(ax, az, bx, bz, blocked, cheap) {
  const pad = 80;
  const nx = Math.min(WINDOW, Math.max(12, Math.ceil((Math.abs(bx - ax) + pad * 2) / RES)));
  const nz = Math.min(WINDOW, Math.max(12, Math.ceil((Math.abs(bz - az) + pad * 2) / RES)));
  const minX = (ax + bx) / 2 - nx * RES / 2;
  const minZ = (az + bz) / 2 - nz * RES / 2;
  const at = (px, pz) => [Math.round((px - minX) / RES), Math.round((pz - minZ) / RES)];
  const world = (ix, iz) => [minX + ix * RES, minZ + iz * RES];
  let [sx, sz] = at(ax, az);
  let [gx, gz] = at(bx, bz);
  const inside = (ix, iz) => ix >= 0 && iz >= 0 && ix < nx && iz < nz;
  const free = (ix, iz) => {
    if (!inside(ix, iz)) return false;
    const [px, pz] = world(ix, iz);
    return !blocked(px, pz);
  };
  const nearFree = (ix, iz) => {
    if (free(ix, iz)) return [ix, iz];
    for (let rad = 1; rad <= 6; rad++) {
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
        if (free(ix + dx, iz + dz)) return [ix + dx, iz + dz];
      }
    }
    return null;
  };
  const start = nearFree(sx, sz);
  const goal = nearFree(gx, gz);
  if (!start || !goal) return null;
  [sx, sz] = start;
  [gx, gz] = goal;
  const key = (ix, iz) => ix + iz * nx;
  const open = [[sx, sz]];
  const came = new Map();
  const gScore = new Map([[key(sx, sz), 0]]);
  const seen = new Set();
  const goalKey = key(gx, gz);
  while (open.length) {
    open.sort((a, b) => (gScore.get(key(a[0], a[1])) + Math.hypot(gx - a[0], gz - a[1])) - (gScore.get(key(b[0], b[1])) + Math.hypot(gx - b[0], gz - b[1])));
    const [ix, iz] = open.shift();
    const here = key(ix, iz);
    if (seen.has(here)) continue;
    seen.add(here);
    if (here === goalKey) {
      const path = [];
      let cur = here;
      while (cur != null) {
        const cx = cur % nx;
        const cz = (cur - cx) / nx;
        path.push(world(cx, cz));
        cur = came.get(cur);
      }
      path.reverse();
      return path;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = ix + dx;
      const jz = iz + dz;
      if (!free(jx, jz) || seen.has(key(jx, jz))) continue;
      const [px, pz] = world(jx, jz);
      const step = (cheap ? cheap(px, pz) : 1) * RES;
      const next = gScore.get(here) + step;
      const id = key(jx, jz);
      if (next + 1e-6 < (gScore.get(id) ?? Infinity)) {
        gScore.set(id, next);
        came.set(id, here);
        open.push([jx, jz]);
      }
    }
  }
  return null;
}

export function planRoute(x, z, ex, ez, base, blocked, cheap) {
  const pts = base && base.length ? base : [[ex, ez]];
  if (!blocked) return { pts, blocked: false };
  const samples = samplesOf(x, z, ex, ez, pts);
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.length; i++) {
    if (!blocked(samples[i][0], samples[i][1])) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0) return { pts, blocked: false };
  const before = samples.slice(0, Math.max(0, first));
  const after = samples.slice(last + 1);
  const from = before.length ? before[before.length - 1] : [x, z];
  const to = after.length ? after[0] : [ex, ez];
  const detour = astar(from[0], from[1], to[0], to[1], blocked, cheap);
  if (!detour) return { pts: thin(before.length ? before : [[x, z]]), blocked: true };
  return { pts: thin([...before, ...detour, ...after]), blocked: false };
}
