// 资产工坊里的外部低模。只给对照，不进田里的机队。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { surfaceKits } from './surface-kits.js';
import kenneyTractorUrl from '../refs/machines/kenney-tractor.glb';
import kenneyShovelUrl from '../refs/machines/kenney-tractor-shovel.glb';
import pixorTractorUrl from '../refs/machines/pixor-library-tractor.glb';
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

function markRef(root, label) {
  root.userData.refRoot = true;
  root.userData.refLabel = label;
  tagMaterials(root);
}

export function createRefShows(api) {
  const { salmonRing, padMat, kitClone } = api;

  function currentTractor() {
    const body = kitClone(surfaceKits.tractor_gen);
    const box = sit(body);
    return { body, length: Math.max(box.max.x - box.min.x, 0.001), height: box.max.y };
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

  function combineStub() {
    const g = new THREE.Group();
    g.userData.alive = true;
    const body = kitClone(surfaceKits.harvester_combine);
    const box = sit(body);
    g.add(body);
    const tag = nameTag('现用');
    tag.position.y = box.max.y + 0.9;
    g.add(tag);
    const card = stubCard();
    card.position.set(box.max.x + 4.2, Math.max(2.2, box.max.y * 0.42), 0);
    card.rotation.y = 0.55;
    g.add(card);
    const width = (box.max.x - box.min.x) + 10;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(width + 6, 16).rotateX(-Math.PI / 2), padMat);
    pad.position.y = -0.03;
    pad.receiveShadow = true;
    g.add(pad);
    const ring = salmonRing(width, 14, 0.08);
    g.add(ring);
    const shift = (box.min.x + (box.max.x + 8)) / 2;
    body.position.x -= shift;
    tag.position.x -= shift;
    card.position.x -= shift;
    return { group: g, ring, whenRefs: Promise.resolve(), motion() {} };
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
    combine: combineStub,
  };
}

function stubCard() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1280;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#14181c';
  ctx.fillRect(0, 0, 1024, 1280);
  ctx.strokeStyle = '#d8693c';
  ctx.lineWidth = 10;
  ctx.strokeRect(24, 24, 976, 1232);
  ctx.fillStyle = '#e8d8d0';
  ctx.textAlign = 'center';
  const font = '"WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif';
  const lines = [
    [150, '46px ' + font, 'Sketchfab'],
    [280, '54px ' + font, 'Low Poly Combine'],
    [360, '54px ' + font, 'Harvestors'],
    [500, '40px ' + font, 'iedalton · CC-BY'],
    [640, '64px ' + font, '未下载'],
    [760, '40px ' + font, '下载要登录'],
    [900, '32px ' + font, 'sketchfab.com'],
    [980, '28px ' + font, '84b8a341aabc421b'],
  ];
  for (const [y, face, text] of lines) {
    ctx.font = face;
    ctx.fillText(text, 512, y);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.dispose = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  mat.userData.dispose = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 6.5), mat);
  return mesh;
}
