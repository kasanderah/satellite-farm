// 把工坊剪影收成和别的农机一样的四套共享材质，好放进实例网格。
// 垫圈、鲑鱼色选中环和光晕留在沙盒里，不进田。
import * as THREE from 'three';
import { createSurfaceBuilders } from './lab-surface.js';
import { Kit, omniKit } from './prefabs.js';

const IDS = [
  'tractor_gen', 'harvester_combine', 'harvester_potato', 'harvester_cabbage', 'transplanter',
  'impl_rotavator', 'impl_subsoiler', 'impl_cultivator', 'impl_fertilizer', 'impl_sprayer',
  'impl_seeder', 'impl_potato_planter', 'impl_haulm', 'impl_trailer', 'impl_bedder', 'orbit_boom',
  'drone_scout', 'drone_treat', 'device_drone_base',
];

function studioApi() {
  const padMat = new THREE.MeshStandardMaterial({ color: '#111418' });
  function box(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
  function salmonRing() {
    const g = new THREE.Group();
    g.userData.skip = true;
    return g;
  }
  function addHalo() { return []; }
  function fadeHalos() {}
  return { box, salmonRing, padMat, addHalo, fadeHalos };
}

function roleOf(material) {
  const emissive = material?.emissive;
  if (emissive && emissive.r + emissive.g + emissive.b > 0.04) return 'emis';
  const hex = material?.color?.getHexString?.() || '';
  if (hex === '1b262c') return 'glass';
  if (hex === '9aa19e' || hex === 'a6843e') return 'light';
  return 'dark';
}

function colorOf(material, role) {
  if (role === 'emis') return material.emissive.clone().multiplyScalar(4);
  return material.color.clone();
}

function stripCraft(group) {
  const doomed = [];
  group.traverse(obj => { if (obj.userData?.kind) doomed.push(obj); });
  for (const obj of doomed) {
    obj.parent?.remove(obj);
    obj.traverse(child => {
      if (child.geometry && !child.geometry.userData.shared) child.geometry.dispose();
    });
  }
}

function bakeOne(build, opts = {}) {
  const made = build();
  if (opts.stripCraft) stripCraft(made.group);
  if (made.ring?.parent) made.ring.parent.remove(made.ring);
  made.group.updateMatrixWorld(true);
  const kit = new Kit();
  const drop = [];
  made.group.traverse(obj => {
    if (!obj.isMesh || obj.userData.halo) return;
    if (obj.geometry?.type === 'CircleGeometry') return;
    let skip = false;
    obj.traverseAncestors(parent => { if (parent.userData?.skip) skip = true; });
    if (skip) return;
    const role = roleOf(obj.material);
    const geo = obj.geometry.clone();
    geo.applyMatrix4(obj.matrixWorld);
    kit.add(role, geo, [0, 0, 0], [0, 0, 0], colorOf(obj.material, role));
    drop.push(geo);
  });
  const built = kit.build();
  for (const geo of drop) geo.dispose();
  made.group.traverse(obj => {
    if (obj.geometry && !obj.geometry.userData.shared) obj.geometry.dispose();
    if (obj.material?.userData?.dispose) obj.material.dispose();
  });
  return built;
}

function spanOf(built) {
  const box = new THREE.Box3();
  for (const key of ['light', 'dark', 'glass', 'emis']) {
    if (!built[key]) continue;
    built[key].computeBoundingBox();
    box.union(built[key].boundingBox);
  }
  return box;
}

const builders = createSurfaceBuilders(studioApi());
export const surfaceKits = {};
const span = {};
for (const id of IDS) {
  surfaceKits[id] = bakeOne(builders[id], { stripCraft: id === 'device_drone_base' });
  span[id] = spanOf(surfaceKits[id]);
}
surfaceKits.omni = omniKit();

const tractorRear = span.tractor_gen.min.x;
export const hitchOffset = {};
for (const id of IDS) {
  if (!id.startsWith('impl_')) continue;
  hitchOffset[id] = tractorRear - span[id].max.x - 0.12;
}

export const SURFACE_KIT_IDS = IDS;
