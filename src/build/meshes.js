// 占位建筑和道路。轨道制图的灰金属，不接供电和物流。
// 每类是多体块：裙边、窗带、设备凸起、烟囱或罐脚。尺寸仍按目录占地。
import * as THREE from 'three';
import { CELL } from '../modulus.js';
import { workSpec } from './catalog.js';
import { ROAD_E, ROAD_N, ROAD_W, ROAD_S, roadDirs } from './roads.js';

const METAL = 0x6f6a61;
const DARK = 0x3a3834;
const HAZE = 0xb7c0c2;
const WARM = 0xc4a882;
const GLASS = 0x8d9896;
const OK_TINT = new THREE.Color(0x9aaa62);
const BAD_TINT = new THREE.Color(0xb5523a);

function box(w, h, d, x, y, z, color, rough = 0.62, metal = 0.42) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rt, rb, h, x, y, z, color, segs = 16) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, segs),
    new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.55 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function add(group, mesh) { group.add(mesh); return mesh; }

function lamp(w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color: WARM, emissive: WARM, emissiveIntensity: 0.55,
      roughness: 0.42, metalness: 0.15,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  return mesh;
}

function skirt(group, W, D) {
  add(group, box(W * 0.94, 0.16, D * 0.94, 0, 0.08, 0, DARK, 0.78, 0.28));
}

function shedSmall(group, W, D) {
  skirt(group, W, D);
  add(group, box(W * 0.72, 2.55, D * 0.62, -0.15, 1.44, -0.2, METAL));
  add(group, box(W * 0.76, 0.22, D * 0.66, -0.15, 2.82, -0.2, DARK));
  add(group, box(W * 0.8, 0.12, D * 0.7, -0.15, 2.98, -0.2, HAZE, 0.5, 0.35));
  add(group, box(W * 0.28, 0.55, D * 0.38, W * 0.28, 0.85, 0.35, DARK));
  add(group, box(W * 0.42, 0.42, 0.08, -0.2, 1.7, D * 0.31, GLASS, 0.18, 0.62));
  add(group, box(0.9, 1.55, 0.1, -W * 0.22, 0.95, D * 0.31, DARK));
  add(group, box(1.15, 0.42, 0.85, W * 0.12, 3.22, -0.55, DARK));
  add(group, cyl(0.11, 0.14, 0.85, W * 0.22, 3.4, 0.45, DARK, 8));
  add(group, box(0.55, 0.9, 0.4, W * 0.32, 0.62, -D * 0.22, METAL));
  add(group, lamp(W * 0.5, 0.05, 0.05, -0.15, 2.7, D * 0.31));
}

function workshop(group, W, D) {
  skirt(group, W, D);
  add(group, box(W * 0.62, 3.9, D * 0.7, -W * 0.08, 2.12, -0.15, METAL));
  add(group, box(W * 0.64, 0.22, D * 0.74, -W * 0.08, 4.18, -0.15, DARK));
  add(group, box(W * 0.22, 2.15, D * 0.48, W * 0.32, 1.24, 0.35, DARK));
  add(group, box(W * 0.2, 0.16, D * 0.5, W * 0.32, 2.4, 0.35, HAZE, 0.5, 0.3));
  add(group, box(W * 0.46, 0.55, 0.08, -W * 0.08, 2.55, D * 0.35, GLASS, 0.16, 0.64));
  add(group, box(1.6, 1.7, 0.12, -W * 0.22, 1.05, D * 0.35, DARK));
  add(group, box(W * 0.18, 0.35, D * 0.22, -W * 0.02, 4.5, -D * 0.12, HAZE, 0.45, 0.4));
  add(group, box(0.7, 1.7, 0.7, W * 0.16, 5.15, -D * 0.18, DARK));
  add(group, box(0.95, 0.12, 0.95, W * 0.16, 6.05, -D * 0.18, METAL));
  add(group, cyl(0.16, 0.2, 0.7, W * 0.16, 6.45, -D * 0.18, DARK, 8));
  add(group, box(1.4, 0.55, 0.85, -W * 0.28, 4.55, D * 0.12, DARK));
  add(group, box(0.45, 0.7, D * 0.35, -W * 0.38, 0.55, -D * 0.1, METAL));
  add(group, lamp(W * 0.4, 0.05, 0.05, -W * 0.08, 3.95, D * 0.36));
  add(group, lamp(0.08, 0.08, 0.08, W * 0.32, 2.55, D * 0.22));
}

function tank(group, W, D) {
  skirt(group, W * 0.86, D * 0.86);
  const foot = 0.42;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(group, box(0.48, 1.15, 0.48, sx * 1.35, 0.7, sz * 1.35, DARK));
  }
  add(group, cyl(1.85, 2.05, 7.4, 0, 4.85, 0, METAL, 18));
  add(group, cyl(2.15, 2.15, 0.22, 0, 2.15, 0, DARK, 18));
  add(group, cyl(2.15, 2.15, 0.18, 0, 6.4, 0, DARK, 18));
  add(group, cyl(1.35, 1.55, 1.15, 0, 9.05, 0, HAZE, 16));
  add(group, box(0.22, 2.4, 0.16, 2.05, 3.4, 0, DARK));
  add(group, box(0.85, 0.7, 0.7, 1.7, 1.15, 1.55, METAL));
  add(group, cyl(0.12, 0.16, 1.3, 0.55, 9.7, 0.35, DARK, 8));
  add(group, box(1.6, 0.08, 0.35, 0, 7.15, 2.05, HAZE, 0.45, 0.4));
  add(group, lamp(0.55, 0.05, 0.05, 0, 8.55, 1.15));
}

function hangar(group, W, D) {
  skirt(group, W, D);
  add(group, box(W * 0.96, 0.12, D * 0.92, 0, 0.22, 0, 0x4a4742, 0.84, 0.18));
  add(group, box(0.55, 5.6, D * 0.88, -W / 2 + 0.55, 3.0, 0, METAL));
  add(group, box(0.55, 5.6, D * 0.88, W / 2 - 0.55, 3.0, 0, METAL));
  add(group, box(W * 0.9, 4.8, 0.45, 0, 2.6, -D / 2 + 0.5, DARK));
  add(group, box(W * 0.92, 0.38, D * 0.9, 0, 5.95, -0.15, DARK));
  add(group, box(W * 0.2, 0.55, 0.35, -W * 0.22, 6.4, 0.2, HAZE, 0.45, 0.35));
  add(group, box(W * 0.2, 0.55, 0.35, W * 0.18, 6.4, -0.4, HAZE, 0.45, 0.35));
  for (const x of [-W * 0.28, 0, W * 0.28]) add(group, box(0.28, 0.45, D * 0.82, x, 5.55, -0.1, METAL));
  add(group, box(W * 0.55, 0.7, 0.1, 0, 4.3, D / 2 - 0.28, GLASS, 0.16, 0.6));
  add(group, box(W * 0.72, 0.28, 0.22, 0, 5.15, D / 2 - 0.28, DARK));
  add(group, box(1.1, 2.2, 1.1, -W / 2 + 1.0, 6.7, -D / 2 + 1.1, DARK));
  add(group, box(1.1, 2.2, 1.1, W / 2 - 1.0, 6.7, -D / 2 + 1.1, DARK));
  add(group, cyl(0.18, 0.22, 1.1, -W / 2 + 1.0, 8.3, -D / 2 + 1.1, METAL, 8));
  add(group, box(2.2, 0.45, 0.7, W * 0.22, 0.45, D / 2 - 1.1, DARK));
  add(group, lamp(W * 0.35, 0.06, 0.06, 0, 5.35, D / 2 - 0.42));
}

function link(group, W, D) {
  skirt(group, W, D * 0.9);
  add(group, box(W * 0.9, 2.05, D * 0.62, 0, 1.2, 0, METAL));
  add(group, box(W * 0.92, 0.16, D * 0.68, 0, 2.3, 0, DARK));
  add(group, box(0.7, 2.25, D * 0.74, -W / 2 + 0.55, 1.25, 0, DARK));
  add(group, box(0.7, 2.25, D * 0.74, W / 2 - 0.55, 1.25, 0, DARK));
  for (const x of [-W * 0.28, -W * 0.08, W * 0.12, W * 0.32]) {
    add(group, box(0.16, 2.05, D * 0.66, x, 1.2, 0, DARK));
  }
  add(group, box(W * 0.55, 0.42, 0.08, 0, 1.45, D * 0.32, GLASS, 0.18, 0.6));
  add(group, box(W * 0.7, 0.12, 0.28, 0, 2.48, 0, HAZE, 0.5, 0.3));
  add(group, box(0.8, 0.35, 0.45, -W * 0.12, 2.6, 0, DARK));
  add(group, lamp(W * 0.4, 0.045, 0.045, 0, 1.15, D * 0.32));
}

function raised(mesh, order, factor) {
  mesh.material.polygonOffset = true;
  mesh.material.polygonOffsetFactor = factor;
  mesh.material.polygonOffsetUnits = -4;
  mesh.renderOrder = order;
  return mesh;
}

function garageBay(group, W, D) {
  const stalls = 3;
  skirt(group, W, D);
  add(group, box(W * 0.92, 3.4, D * 0.62, 0, 1.85, -D * 0.08, METAL));
  add(group, box(W * 0.94, 0.28, D * 0.7, 0, 3.65, -D * 0.06, DARK));
  add(group, box(W * 0.28, 2.6, D * 0.34, W * 0.3, 1.5, D * 0.22, DARK));
  for (let i = 0; i < stalls; i++) {
    const x = (i - (stalls - 1) / 2) * (W * 0.28);
    add(group, box(W * 0.22, 2.15, 0.12, x, 1.25, -D * 0.38, 0x2a2927, 0.7, 0.25));
    add(group, lamp(W * 0.18, 0.05, 0.05, x, 2.4, -D * 0.4));
  }
  add(group, box(W * 0.36, 0.45, 0.08, -W * 0.22, 2.5, D * 0.22, GLASS, 0.16, 0.6));
  add(group, box(0.7, 1.15, 0.7, W * 0.34, 4.3, -D * 0.05, DARK));
}

function bulk(group, W, D, wall) {
  skirt(group, W, D);
  add(group, box(W * 0.9, wall, D * 0.86, 0, wall / 2 + 0.1, 0, METAL));
  add(group, box(W * 0.92, 0.28, D * 0.9, 0, wall + 0.3, 0, DARK));
  add(group, box(W * 0.55, 0.55, 0.08, 0, wall * 0.55, D * 0.43, GLASS, 0.16, 0.55));
  add(group, box(W * 0.18, 0.7, D * 0.22, -W * 0.28, wall + 0.7, 0, DARK));
  add(group, lamp(W * 0.4, 0.05, 0.05, 0, wall * 0.35, D * 0.44));
}

export function createRoadMesh(mask) {
  const group = new THREE.Group();
  group.name = 'work-service';
  const H = CELL / 2 - 0.02;
  const off = 0.42;
  raised(add(group, box(CELL * 0.98, 0.08, CELL * 0.98, 0, 0.07, 0, 0x3a3834, 0.86, 0.18)), 2, -2);
  let dirs = roadDirs(mask);
  const bare = !dirs.length;
  if (bare) dirs = [[1, 0]];
  const straight = mask === (ROAD_E | ROAD_W) || mask === (ROAD_N | ROAD_S);
  const endOnly = bare || roadDirs(mask).length === 1;
  const rail = (x, z, w, d) => raised(add(group, box(w, 0.055, d, x, 0.13, z, 0xcfc6b8, 0.42, 0.38)), 3, -4);
  for (const [dx, dz] of dirs) {
    const px = -dz;
    const pz = dx;
    const inner = endOnly ? -0.5 : 0;
    for (const side of [-1, 1]) {
      const ox = px * off * side;
      const oz = pz * off * side;
      const x0 = dx * inner + ox;
      const z0 = dz * inner + oz;
      const x1 = dx * H + ox;
      const z1 = dz * H + oz;
      rail((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(dx) ? Math.abs(x1 - x0) : 0.15, Math.abs(dz) ? Math.abs(z1 - z0) : 0.15);
    }
    const span = Math.abs(H - inner);
    const mid = (inner + H) / 2;
    const lx = dx * mid + px * (off + 0.62);
    const lz = dz * mid + pz * (off + 0.62);
    const strip = add(group, lamp(Math.abs(dx) ? span : 0.05, 0.035, Math.abs(dz) ? span : 0.05, lx, 0.15, lz));
    strip.renderOrder = 4;
  }
  if (!straight) raised(add(group, box(1.2, 0.04, 1.2, 0, 0.145, 0, 0xb7b0a4, 0.48, 0.32)), 3, -5);
  if (endOnly) {
    const [dx, dz] = dirs[0];
    raised(add(group, box(Math.abs(dz) ? 1.2 : 0.14, 0.07, Math.abs(dx) ? 1.2 : 0.14, -dx * 0.62, 0.14, -dz * 0.62, 0x5e5954, 0.62, 0.3)), 3, -4);
  }
  return group;
}

export function createWorkMesh(kind) {
  const spec = workSpec(kind);
  const group = new THREE.Group();
  group.name = 'work-' + kind;
  if (!spec) return group;
  const W = spec.w * CELL;
  const D = spec.h * CELL;
  if (kind === 'shed_small') shedSmall(group, W, D);
  else if (kind === 'workshop') workshop(group, W, D);
  else if (kind === 'tank') tank(group, W, D);
  else if (kind === 'hangar') hangar(group, W, D);
  else if (kind === 'link') link(group, W, D);
  else if (kind === 'garage') garageBay(group, W, D);
  else if (kind === 'block_hall') bulk(group, W, D, 4.8);
  else if (kind === 'block_yard') bulk(group, W, D, 2.4);
  else if (kind === 'block_wall') bulk(group, W, D, 6.2);
  else if (kind === 'service') return createRoadMesh(ROAD_E | ROAD_W);
  return group;
}

export function ghostMaterial(group) {
  group.traverse(obj => {
    if (!obj.isMesh) return;
    obj.material = obj.material.clone();
    obj.material.transparent = true;
    obj.material.opacity = 0.72;
    obj.material.depthWrite = false;
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
  return group;
}

export function applyGhostTint(group, ok) {
  const tint = ok ? OK_TINT : BAD_TINT;
  group.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat.color) continue;
      if (!mat.userData.ghostBase) mat.userData.ghostBase = mat.color.clone();
      mat.color.copy(mat.userData.ghostBase).lerp(tint, 0.72);
      if (mat.emissive) {
        mat.emissive.copy(tint);
        mat.emissiveIntensity = ok ? 0.22 : 0.38;
      }
    }
  });
}
