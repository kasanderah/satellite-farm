// 资产工坊里的外部低模。只给对照，不进田里的机队。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { surfaceKits } from './surface-kits.js';
import kenneyTractorUrl from '../refs/machines/kenney-tractor.glb';
import kenneyShovelUrl from '../refs/machines/kenney-tractor-shovel.glb';
import pixorTractorUrl from '../refs/machines/pixor-library-tractor.glb';
import combinePackUrl from '../refs/machines/low-poly-combine-harvestors.glb';
import kenneyMapUrl from '../refs/machines/kenney-textures/colormap.png';

// Kenney 和 Pixor 的车头都在 +Z。现用 tractor_gen 的车头在 +X。
const FACE_X = Math.PI / 2;

function decodeDataUrl(url) {
  const comma = url.indexOf(',');
  const meta = url.slice(0, comma);
  const data = url.slice(comma + 1);
  if (/;base64/i.test(meta)) {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  return new TextEncoder().encode(decodeURIComponent(data)).buffer;
}

let kenneyMapBlob = null;
function kenneyMapBlobUrl() {
  if (!kenneyMapBlob) {
    const blob = new Blob([decodeDataUrl(kenneyMapUrl)], { type: 'image/png' });
    kenneyMapBlob = URL.createObjectURL(blob);
  }
  return kenneyMapBlob;
}

function loadGltf(glbUrl, remapTexture) {
  const buf = decodeDataUrl(glbUrl);
  const loader = new GLTFLoader();
  if (remapTexture) {
    loader.manager.setURLModifier(url => (url.includes('colormap.png') ? kenneyMapBlobUrl() : url));
  }
  return new Promise((ok, fail) => loader.parse(buf, '', ok, fail));
}

function disposeObject(root) {
  root.traverse(m => {
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      if (mat.map && mat.userData && mat.userData.dispose) mat.map.dispose();
      if (mat.userData && mat.userData.dispose) mat.dispose();
    }
  });
}

function tagMaterials(root) {
  root.traverse(m => {
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.userData.dispose = true;
      if (mat.map) mat.map.userData.dispose = true;
    }
  });
}

function nameTag(text) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 640, 160);
  ctx.fillStyle = 'rgba(10,12,20,0.84)';
  ctx.fillRect(12, 36, 616, 88);
  ctx.strokeStyle = 'rgba(212,105,60,0.9)';
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 36, 616, 88);
  ctx.fillStyle = '#e8d8d0';
  ctx.font = '52px "WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 320, 80);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.dispose = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  mat.userData.dispose = true;
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.8, 1.2, 1);
  sprite.userData.tag = true;
  return sprite;
}

function worldBox(obj) {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}

function sit(obj) {
  const box = worldBox(obj);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= box.min.y;
  return worldBox(obj);
}

function fitRef(scene, targetLen) {
  const root = scene;
  root.rotation.y = FACE_X;
  root.updateMatrixWorld(true);
  const raw = worldBox(root);
  const len = Math.max(raw.max.x - raw.min.x, 0.001);
  root.scale.multiplyScalar(targetLen / len);
  root.updateMatrixWorld(true);
  return sit(root);
}

// 旋转放在内层，位移放在没有旋转的外层，整包原点偏了也能落到垫上。不拆子网格。
function fitUpright(scene, targetLen) {
  const holder = new THREE.Group();
  scene.rotation.y = FACE_X;
  holder.add(scene);
  holder.updateMatrixWorld(true);
  const raw = worldBox(holder);
  const len = Math.max(raw.max.x - raw.min.x, 0.001);
  holder.scale.setScalar(targetLen / len);
  holder.updateMatrixWorld(true);
  return { holder, box: sit(holder) };
}

function markRef(root, label) {
  root.userData.refRoot = true;
  root.userData.refLabel = label;
  tagMaterials(root);
}

export function createRefShows(api) {
  const { salmonRing, padMat, kitClone } = api;

  function currentKit(id) {
    const body = kitClone(surfaceKits[id]);
    const box = sit(body);
    return {
      body,
      length: Math.max(box.max.x - box.min.x, 0.001),
      depth: Math.max(box.max.z - box.min.z, 0.001),
      height: box.max.y,
    };
  }

  function currentTractor() {
    return currentKit('tractor_gen');
  }

  function lineup(stations, gap) {
    const g = new THREE.Group();
    g.userData.alive = true;
    const tractor = currentTractor();
    const xs = stations.map((_, i) => (i - (stations.length - 1) / 2) * gap);
    const padW = gap * (stations.length - 1) + tractor.length + 6;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(padW, 12).rotateX(-Math.PI / 2), padMat);
    pad.position.y = -0.03;
    pad.receiveShadow = true;
    g.add(pad);
    const ring = salmonRing(padW * 0.96, 11, 0.08);
    g.add(ring);
    const jobs = [];
    stations.forEach((st, i) => {
      const slot = new THREE.Group();
      slot.position.x = xs[i];
      g.add(slot);
      if (st.kit) {
        slot.add(tractor.body);
        const tag = nameTag(st.label);
        tag.position.y = tractor.height + 0.85;
        slot.add(tag);
        return;
      }
      const job = loadGltf(st.url, st.texture).then(gltf => {
        if (g.userData.alive === false) {
          disposeObject(gltf.scene);
          return;
        }
        const box = fitRef(gltf.scene, tractor.length);
        markRef(gltf.scene, st.label);
        slot.add(gltf.scene);
        const tag = nameTag(st.label);
        tag.position.y = box.max.y + 0.85;
        slot.add(tag);
      }).catch(err => {
        g.userData.refError = String(err && err.message || err);
        if (g.userData.alive === false) return;
        const miss = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), api.alertMat);
        miss.position.y = 0.6;
        miss.userData.refRoot = true;
        miss.userData.refLabel = st.label + ' 失败';
        slot.add(miss);
      });
      jobs.push(job);
    });
    const whenRefs = Promise.all(jobs);
    return {
      group: g,
      ring,
      whenRefs,
      motion() {},
    };
  }

  // 整包 GLB，不拆 RootNode 里的多台。fitRef 把整包的车长缩到现用联合收割机。
  function combinePack() {
    const g = new THREE.Group();
    g.userData.alive = true;
    const rig = currentKit('harvester_combine');
    const left = new THREE.Group();
    const right = new THREE.Group();
    g.add(left, right);
    left.add(rig.body);
    const tagL = nameTag('现用');
    tagL.position.y = rig.height + 0.9;
    left.add(tagL);
    const guessW = rig.length * 3.4;
    const guessD = rig.length * 2.6;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), padMat);
    pad.scale.set(guessW, 1, guessD);
    pad.position.y = -0.03;
    pad.receiveShadow = true;
    g.add(pad);
    const ring = salmonRing(guessW * 0.96, guessD * 0.92, 0.08);
    g.add(ring);
    const job = loadGltf(combinePackUrl, false).then(gltf => {
      if (g.userData.alive === false) {
        disposeObject(gltf.scene);
        return;
      }
      const fitted = fitUpright(gltf.scene, rig.length);
      const box = fitted.box;
      markRef(gltf.scene, 'iedalton');
      right.add(fitted.holder);
      const tag = nameTag('iedalton · CC BY');
      tag.position.y = box.max.y + 0.9;
      right.add(tag);
      const refLen = Math.max(box.max.x - box.min.x, 0.001);
      const refDep = Math.max(box.max.z - box.min.z, 0.001);
      const dist = rig.length / 2 + refLen / 2 + 3;
      left.position.x = -dist / 2;
      right.position.x = dist / 2;
      const width = dist + rig.length / 2 + refLen / 2 + 4;
      const depth = Math.max(rig.depth, refDep) + 4;
      pad.scale.set(width, 1, depth);
      ring.scale.set(width / guessW, 1, depth / guessD);
    }).catch(err => {
      g.userData.refError = String(err && err.message || err);
      if (g.userData.alive === false) return;
      const miss = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), api.alertMat);
      miss.position.set(rig.length + 2, 0.6, 0);
      miss.userData.refRoot = true;
      miss.userData.refLabel = 'iedalton 失败';
      right.add(miss);
    });
    return { group: g, ring, whenRefs: job, motion() {} };
  }

  return {
    tractors: () => lineup([
      { kit: true, label: '现用' },
      { url: kenneyTractorUrl, texture: true, label: 'Kenney' },
      { url: pixorTractorUrl, texture: false, label: 'Pixor' },
    ], 8.6),
    shovel: () => lineup([
      { kit: true, label: '现用' },
      { url: kenneyShovelUrl, texture: true, label: 'Kenney 铲' },
    ], 9),
    combine: combinePack,
  };
}
