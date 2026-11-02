// 占位建筑和道路。轨道制图的灰金属，不接供电和物流。
import * as THREE from 'three';
import { CELL } from '../modulus.js';
import { workSpec } from './catalog.js';

const METAL = 0x6f6a61;
const DARK = 0x3a3834;
const HAZE = 0xb7c0c2;
const WARM = 0xc4a882;

function box(w, h, d, x, y, z, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.42 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rt, rb, h, x, y, z, color) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.55 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function add(group, mesh) { group.add(mesh); return mesh; }

function shed(group, W, D, wall, roof) {
  add(group, box(W - 0.4, wall, D - 0.4, 0, wall / 2, 0, METAL));
  add(group, box(W, 0.28, D, 0, wall + 0.1, 0, DARK));
  add(group, box(W * 0.35, 0.12, 0.08, 0, wall * 0.45, D / 2, HAZE));
  add(group, box(W * 0.7, 0.08, 0.06, 0, wall + 0.28, 0, WARM));
}

export function createWorkMesh(kind) {
  const spec = workSpec(kind);
  const group = new THREE.Group();
  group.name = 'work-' + kind;
  if (!spec) return group;
  const W = spec.w * CELL;
  const D = spec.h * CELL;
  if (kind === 'shed_small') shed(group, W, D, 3.1, 0.3);
  else if (kind === 'workshop') {
    shed(group, W, D, 4.6, 0.35);
    add(group, box(W * 0.55, 0.7, 0.25, 0, 5.15, 0, HAZE));
    add(group, box(0.2, 1.4, D * 0.4, -W / 2 + 0.3, 2.2, 0, DARK));
  } else if (kind === 'tank') {
    add(group, cyl(1.5, 1.7, 11.5, 0, 6.2, 0, METAL));
    add(group, cyl(1.85, 1.85, 0.28, 0, 3.2, 0, DARK));
    add(group, cyl(1.85, 1.85, 0.28, 0, 8.4, 0, DARK));
    add(group, box(0.35, 2.2, 0.35, 1.3, 1.1, 1.3, DARK));
    add(group, box(0.35, 2.2, 0.35, -1.3, 1.1, -1.3, DARK));
    add(group, box(W * 0.7, 0.12, 0.12, 0, 9.6, 0, WARM));
  } else if (kind === 'hangar') {
    add(group, box(0.45, 6.2, D, -W / 2 + 0.3, 3.1, 0, METAL));
    add(group, box(0.45, 6.2, D, W / 2 - 0.3, 3.1, 0, METAL));
    add(group, box(W, 0.4, D, 0, 6.3, 0, DARK));
    add(group, box(W - 0.6, 5.4, 0.4, 0, 3.0, -D / 2 + 0.3, HAZE));
    add(group, box(W * 0.45, 0.1, 0.08, 0, 1.2, D / 2 - 0.1, WARM));
  } else if (kind === 'link') {
    add(group, box(W, 2.4, D * 0.72, 0, 1.35, 0, METAL));
    add(group, box(W, 0.16, D * 0.8, 0, 2.6, 0, DARK));
    add(group, box(W * 0.8, 0.06, 0.06, 0, 1.5, D * 0.28, WARM));
  } else if (kind === 'service') {
    // 路面底面离地约 8 cm，顶面约 20 cm，避免和地表共面闪烁。相对 4.2 m 格仍贴地。
    const deck = box(W * 0.9, 0.12, D * 0.9, 0, 0.14, 0, DARK);
    deck.material.polygonOffset = true;
    deck.material.polygonOffsetFactor = -2;
    deck.material.polygonOffsetUnits = -4;
    deck.renderOrder = 2;
    const stripe = box(W * 0.16, 0.03, D * 0.68, 0, 0.215, 0, HAZE);
    stripe.material.polygonOffset = true;
    stripe.material.polygonOffsetFactor = -3;
    stripe.material.polygonOffsetUnits = -4;
    stripe.renderOrder = 3;
  }
  return group;
}

export function ghostMaterial(group) {
  group.traverse(obj => {
    if (!obj.isMesh) return;
    obj.material = obj.material.clone();
    obj.material.transparent = true;
    obj.material.opacity = 0.55;
    obj.material.depthWrite = false;
    obj.castShadow = false;
  });
  return group;
}
