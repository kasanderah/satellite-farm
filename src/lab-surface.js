// 地表作物农机剪影。工坊占位已锁定，主进度按同样的盒子拼进共享材质。
// 密封舱、亚光金属、炭黑接缝，对齐中枢和培育层，不是田园农机。
import * as THREE from 'three';

const AXLE = [Math.PI / 2, 0, 0];
const ALONG_X = [0, 0, Math.PI / 2];

export function createSurfaceBuilders(api) {
  const { box, salmonRing, padMat, addHalo, fadeHalos } = api;

  function mat(opts) {
    const m = new THREE.MeshStandardMaterial(opts);
    m.userData.dispose = true;
    return m;
  }

  function palette() {
    return {
      body: mat({ color: '#9aa19e', roughness: 0.84, metalness: 0.16 }),
      dark: mat({ color: '#2a3034', roughness: 0.72, metalness: 0.4 }),
      steel: mat({ color: '#6d7378', roughness: 0.58, metalness: 0.46 }),
      glass: mat({ color: '#1b262c', roughness: 0.08, metalness: 0.58, envMapIntensity: 1.15 }),
      rubber: mat({ color: '#16181a', roughness: 0.94, metalness: 0.04 }),
      tick: mat({ color: '#a6843e', roughness: 0.72, metalness: 0.1 }),
      lamp: mat({ color: '#3a3014', emissive: '#e2b15c', emissiveIntensity: 0.55, roughness: 0.42, metalness: 0 }),
      beacon: mat({ color: '#3a2414', emissive: '#e2b15c', emissiveIntensity: 1.05, roughness: 0.4, metalness: 0 }),
      nozzle: mat({ color: '#1c3332', emissive: '#c8fff4', emissiveIntensity: 0.25, roughness: 0.36, metalness: 0 }),
      scan: mat({ color: '#1a2836', emissive: '#8fcaff', emissiveIntensity: 0.28, roughness: 0.34, metalness: 0 }),
      level: mat({ color: '#1c3332', emissive: '#9ad7cf', emissiveIntensity: 0.4, roughness: 0.4, metalness: 0 }),
    };
  }

  function addBox(parent, w, h, d, x, y, z, material, rot, list, glow) {
    const mesh = box(w, h, d, x, y, z, material);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    if (glow) mesh.castShadow = mesh.receiveShadow = false;
    parent.add(mesh);
    if (list) list.push(mesh);
    return mesh;
  }

  function addCyl(parent, material, rt, rb, h, x, y, z, rot, seg = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function wheel(parent, M, x, y, z, r, w) {
    const hub = new THREE.Group();
    hub.position.set(x, y, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), M.rubber);
    tire.rotation.x = Math.PI / 2;
    tire.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r * 0.4, w + 0.05, 8), M.steel);
    cap.rotation.x = Math.PI / 2;
    hub.add(tire, cap);
    parent.add(hub);
    return hub;
  }

  function axle(parent, M, x, r, track, w) {
    return [-1, 1].map(s => wheel(parent, M, x, r, s * track, r, w));
  }

  function stage(len, wid) {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CircleGeometry(Math.max(len, wid) * 0.58, 48), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -0.02;
    pad.receiveShadow = true;
    g.add(pad);
    const body = new THREE.Group();
    g.add(body);
    const ring = salmonRing(len, wid, 0.08);
    g.add(ring);
    return { g, body, ring };
  }

  function lightGroups(spec) {
    const groups = {};
    for (const [id, label] of spec) groups[id] = { id, label, on: true, lights: [], meshes: [] };
    return groups;
  }

  function cab(parent, M, x, y, z, w, h, d) {
    addBox(parent, w, h, d, x, y, z, M.body);
    addBox(parent, w * 0.7, h * 0.42, d + 0.04, x + w * 0.08, y + 0.02, z, M.glass);
    addBox(parent, 0.06, h * 0.42, d + 0.07, x + w * 0.08, y + 0.02, z, M.dark);
    addBox(parent, w * 1.04, 0.07, d * 1.06, x, y + h * 0.52, z, M.dark);
    addBox(parent, w * 0.72, 0.045, 0.05, x + w * 0.08, y + h * 0.16, d * 0.52 + 0.02, M.tick);
  }

  function workBar(parent, G, M, x, y, z, w) {
    const list = G.work.meshes;
    addBox(parent, w, 0.07, 0.1, x, y, z, M.lamp, null, list, true);
    addHalo(parent, list, '#e2b15c', Math.max(0.65, w * 0.4), x, y, z);
  }

  function beaconMast(parent, G, M, x, y, z) {
    const list = G.beacon.meshes;
    const mast = addCyl(parent, M.beacon, 0.09, 0.12, 0.2, x, y, z, null, 8);
    mast.castShadow = false;
    list.push(mast);
    return addHalo(parent, list, '#e2b15c', 0.62, x, y, z);
  }

  function markerLamps(parent, G, M, spots) {
    const list = G.mark.meshes;
    const halos = [];
    for (const [x, y, z] of spots) {
      addBox(parent, 0.08, 0.08, 0.1, x, y, z, M.beacon, null, list, true);
      halos.push(...addHalo(parent, list, '#e2b15c', 0.42, x, y, z));
    }
    return halos;
  }

  function hitchFrame(parent, M, y, half) {
    addBox(parent, 0.9, 0.08, 0.08, 0.78, y, half, M.steel);
    addBox(parent, 0.9, 0.08, 0.08, 0.78, y, -half, M.steel);
    addBox(parent, 0.08, 0.42, half * 2 + 0.15, 1.18, y + 0.16, 0, M.dark);
    addBox(parent, 0.7, 0.08, 0.08, 0.72, y - 0.28, 0, M.steel);
    addBox(parent, 0.14, 0.14, 0.14, 1.28, y - 0.02, 0, M.tick);
  }

  function paint(M, halos, st) {
    const br = st === 'break';
    const job = st === 'job';
    M.lamp.emissiveIntensity = br ? 0.08 : job ? 2.7 : st === 'sel' ? 1.45 : 0.48;
    const col = br ? '#e23b3b' : job ? '#d8693c' : '#e2b15c';
    M.beacon.emissive.set(col);
    M.beacon.emissiveIntensity = br ? 1.7 : job ? 3.2 : st === 'sel' ? 2.15 : 0.95;
    M.nozzle.emissiveIntensity = br ? 0.02 : job ? 2.35 : 0.22;
    M.level.emissiveIntensity = br ? 0.04 : job ? 1.9 : st === 'sel' ? 1.05 : 0.38;
    M.body.color.set(br ? '#6e7572' : '#9aa19e');
    for (const s of halos) if (s.material && s.material.color) s.material.color.set(col);
    fadeHalos(halos, br ? 0.25 : job ? 1 : st === 'sel' ? 0.72 : 0.42);
  }

  function spinWheels(wheels, st, p) {
    const a = st === 'job' ? p * Math.PI * 12 : 0;
    for (const w of wheels) w.rotation.z = a;
  }

  function cruise(body, wheels, M, halos, radius, extra) {
    return (p, st) => {
      if (st === 'job') {
        const a = p * Math.PI * 2;
        body.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius * 0.62);
        body.rotation.y = -a + 0.2;
      } else {
        body.position.set(0, 0, 0);
        body.rotation.y = 0.62;
      }
      spinWheels(wheels, st, p);
      paint(M, halos, st);
      if (extra) extra(p, st);
    };
  }

  function parked(body, M, halos, extra) {
    return (p, st) => {
      body.position.y = st === 'job' ? Math.sin(p * Math.PI * 2) * 0.03 : 0;
      body.rotation.y = 0.55;
      paint(M, halos, st);
      if (extra) extra(p, st);
    };
  }

  function finish(g, ring, groups, motion) {
    return { group: g, ring, lightGroups: Object.values(groups), motion };
  }

  function tractorGen() {
    const M = palette();
    const { g, body, ring } = stage(6.6, 3.4);
    const G = lightGroups([['work', '工作灯'], ['beacon', '信标']]);
    const wheels = [
      ...axle(body, M, -1.05, 0.78, 1.08, 0.38),
      ...axle(body, M, 1.55, 0.44, 0.92, 0.24),
    ];
    addBox(body, 3.2, 0.36, 1.2, 0.15, 1.08, 0, M.dark);
    addBox(body, 1.65, 0.88, 1.15, 1.15, 1.42, 0, M.body);
    addBox(body, 0.08, 0.62, 1.0, 2.0, 1.38, 0, M.dark);
    for (let i = 0; i < 4; i++) addBox(body, 0.03, 0.48, 0.05, 2.06, 1.36, -0.33 + i * 0.22, M.steel);
    addBox(body, 1.05, 0.05, 0.06, 1.15, 1.62, 0.58, M.tick);
    cab(body, M, -0.55, 1.78, 0, 1.32, 1.12, 1.38);
    addBox(body, 0.85, 0.1, 0.7, -1.05, 1.48, 1.08, M.body);
    addBox(body, 0.85, 0.1, 0.7, -1.05, 1.48, -1.08, M.body);
    addCyl(body, M.dark, 0.07, 0.07, 0.65, 0.4, 2.2, 0.4, null, 8);
    addBox(body, 0.72, 0.07, 0.07, -1.85, 0.95, 0.34, M.steel);
    addBox(body, 0.72, 0.07, 0.07, -1.85, 0.95, -0.34, M.steel);
    addBox(body, 0.08, 0.4, 0.72, -2.18, 1.05, 0, M.dark);
    addBox(body, 0.55, 0.07, 0.07, -1.95, 0.52, 0, M.steel);
    workBar(body, G, M, -0.55, 2.48, 0, 1.1);
    addBox(body, 0.1, 0.07, 0.14, 1.95, 1.15, 0.38, M.lamp, null, G.work.meshes, true);
    addBox(body, 0.1, 0.07, 0.14, 1.95, 1.15, -0.38, M.lamp, null, G.work.meshes, true);
    const halos = beaconMast(body, G, M, 0.05, 2.62, 0);
    return finish(g, ring, G, cruise(body, wheels, M, halos, 1.65));
  }

  function combine() {
    const M = palette();
    const { g, body, ring } = stage(11.4, 8.2);
    const G = lightGroups([['work', '工作灯'], ['beacon', '信标']]);
    const wheels = [
      ...axle(body, M, 1.05, 0.92, 1.55, 0.5),
      ...axle(body, M, -2.35, 0.5, 1.15, 0.32),
    ];
    addBox(body, 1.15, 0.58, 7.0, 4.35, 0.82, 0, M.body);
    addBox(body, 1.0, 0.12, 6.7, 4.55, 0.46, 0, M.dark);
    addBox(body, 0.1, 0.85, 0.1, 4.75, 1.15, 3.42, M.tick);
    addBox(body, 0.1, 0.85, 0.1, 4.75, 1.15, -3.42, M.tick);
    const reel = new THREE.Group();
    reel.position.set(4.9, 1.7, 0);
    body.add(reel);
    addCyl(reel, M.steel, 0.4, 0.4, 6.5, 0, 0, 0, AXLE, 12);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const bat = addBox(reel, 0.05, 0.14, 6.3, Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0, M.dark);
      bat.rotation.z = a;
    }
    addBox(body, 1.65, 0.46, 1.2, 3.05, 1.42, 0, M.dark, [-0.28, 0, 0]);
    addBox(body, 4.5, 1.65, 2.6, 0.1, 2.15, 0, M.body);
    addBox(body, 4.35, 0.08, 2.65, 0.1, 1.4, 0, M.dark);
    addBox(body, 2.4, 1.1, 2.4, -0.4, 3.45, 0, M.body);
    addBox(body, 2.25, 0.07, 2.25, -0.4, 4.02, 0, M.dark);
    cab(body, M, 1.75, 2.85, 0, 1.2, 1.12, 2.1);
    const auger = new THREE.Group();
    auger.position.set(-0.45, 4.15, 1.2);
    body.add(auger);
    addCyl(auger, M.steel, 0.15, 0.15, 4.2, 0, 0, -1.9, AXLE, 8);
    addBox(auger, 0.26, 0.26, 0.26, 0, 0, -3.95, M.dark);
    addBox(body, 0.65, 0.4, 2.15, -2.5, 0.85, 0, M.dark);
    workBar(body, G, M, 1.75, 3.55, 0, 1.45);
    const halos = beaconMast(body, G, M, 1.2, 3.7, 0.72);
    return finish(g, ring, G, cruise(body, wheels, M, halos, 2.1, (p, st) => {
      reel.rotation.z = st === 'job' ? p * Math.PI * 8 : 0.25;
      auger.rotation.y = st === 'break' ? 0.18 : st === 'job' ? Math.sin(p * Math.PI * 2) * 0.05 : 0;
    }));
  }

  function potatoHarvester() {
    const M = palette();
    const { g, body, ring } = stage(9.6, 4.4);
    const G = lightGroups([['work', '工作灯'], ['beacon', '信标']]);
    const wheels = [
      ...axle(body, M, 0.75, 0.7, 1.35, 0.4),
      ...axle(body, M, -2.35, 0.46, 1.15, 0.28),
    ];
    addBox(body, 1.15, 0.1, 2.6, 3.55, 0.32, 0, M.steel, [-0.4, 0, 0]);
    addBox(body, 0.65, 0.32, 2.4, 2.85, 0.55, 0, M.dark);
    const web = new THREE.Group();
    body.add(web);
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      addBox(web, 0.07, 0.07, 2.1, 2.45 - t * 2.2, 0.72 + t * 1.15, 0, M.steel);
    }
    addBox(body, 0.1, 1.15, 0.1, 2.4, 1.15, 1.12, M.dark);
    addBox(body, 0.1, 1.15, 0.1, 2.4, 1.15, -1.12, M.dark);
    addBox(body, 2.55, 1.3, 2.2, -0.85, 2.15, 0, M.body);
    addBox(body, 2.4, 0.07, 2.05, -0.85, 2.82, 0, M.dark);
    cab(body, M, 1.25, 2.05, 0, 1.15, 1.0, 1.65);
    addBox(body, 0.32, 0.85, 1.15, -2.15, 1.7, 1.2, M.steel);
    workBar(body, G, M, 1.25, 2.68, 0, 1.0);
    const halos = beaconMast(body, G, M, 0.75, 2.82, 0.55);
    return finish(g, ring, G, cruise(body, wheels, M, halos, 1.75, (p, st) => {
      const slide = st === 'job' ? (p % 0.16) / 0.16 : 0;
      web.position.set(-slide * 0.2, slide * 0.1, 0);
    }));
  }

  function cabbageHarvester() {
    const M = palette();
    const { g, body, ring } = stage(8.8, 4.6);
    const G = lightGroups([['work', '工作灯'], ['beacon', '信标']]);
    const wheels = [
      ...axle(body, M, 0.85, 0.58, 1.4, 0.34),
      ...axle(body, M, -2.1, 0.44, 1.18, 0.26),
    ];
    addBox(body, 1.45, 0.62, 0.08, 2.85, 0.82, 0.9, M.body, [0, 0.42, 0]);
    addBox(body, 1.45, 0.62, 0.08, 2.85, 0.82, -0.9, M.body, [0, -0.42, 0]);
    const discs = new THREE.Group();
    body.add(discs);
    for (const z of [-0.55, 0, 0.55]) addCyl(discs, M.steel, 0.26, 0.26, 0.05, 2.45, 0.28, z, null, 12);
    const lift = new THREE.Group();
    body.add(lift);
    addBox(lift, 2.1, 0.1, 0.85, 1.1, 1.2, 0, M.dark, [-0.32, 0, 0]);
    for (let i = 0; i < 5; i++) addBox(lift, 0.07, 0.12, 0.75, 1.85 - i * 0.38, 1.02 + i * 0.14, 0, M.steel);
    addBox(body, 2.15, 1.05, 2.25, -1.15, 1.5, 0, M.body);
    addBox(body, 2.0, 0.07, 0.07, -1.15, 2.08, 1.02, M.dark);
    addBox(body, 2.0, 0.07, 0.07, -1.15, 2.08, -1.02, M.dark);
    addBox(body, 0.07, 0.07, 2.05, -2.15, 2.08, 0, M.dark);
    cab(body, M, 0.25, 1.75, 1.15, 1.0, 0.9, 0.9);
    workBar(body, G, M, 0.25, 2.32, 1.15, 0.7);
    const halos = beaconMast(body, G, M, -0.2, 2.46, 1.15);
    return finish(g, ring, G, cruise(body, wheels, M, halos, 1.55, (p, st) => {
      discs.rotation.y = st === 'job' ? p * Math.PI * 10 : 0;
      lift.position.y = st === 'job' ? Math.sin(p * Math.PI * 4) * 0.035 : 0;
    }));
  }

  function transplanter() {
    const M = palette();
    const { g, body, ring } = stage(7.4, 3.6);
    const G = lightGroups([['work', '工作灯'], ['beacon', '信标']]);
    const wheels = [
      ...axle(body, M, 1.35, 0.4, 1.12, 0.22),
      ...axle(body, M, -0.35, 0.46, 1.18, 0.26),
      ...axle(body, M, -1.95, 0.4, 1.12, 0.22),
    ];
    addBox(body, 4.5, 0.26, 1.45, -0.05, 0.72, 0, M.dark);
    cab(body, M, -1.65, 1.38, 0, 1.12, 0.98, 1.22);
    addBox(body, 2.15, 0.07, 1.65, 0.45, 1.52, 0, M.steel);
    addBox(body, 0.06, 0.4, 1.65, -0.58, 1.74, 0, M.dark);
    addBox(body, 0.06, 0.4, 1.65, 1.48, 1.74, 0, M.dark);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      addBox(body, 0.4, 0.05, 0.58, -0.15 + i * 0.46, 1.62, -0.38 + j * 0.76, M.body);
    }
    const shoes = new THREE.Group();
    body.add(shoes);
    for (let i = 0; i < 5; i++) {
      const z = -0.8 + i * 0.4;
      addBox(shoes, 0.26, 0.28, 0.08, 1.85, 0.3, z, M.steel, [0.45, 0, 0]);
      addBox(shoes, 0.08, 0.32, 0.06, 1.55, 0.82, z, M.dark);
    }
    workBar(body, G, M, -1.65, 1.98, 0, 0.8);
    const halos = beaconMast(body, G, M, -1.15, 2.12, 0);
    return finish(g, ring, G, cruise(body, wheels, M, halos, 1.45, (p, st) => {
      shoes.position.y = st === 'job' ? Math.abs(Math.sin(p * Math.PI * 4)) * 0.07 : st === 'break' ? -0.05 : 0;
    }));
  }

  function rotavator() {
    const M = palette();
    const { g, body, ring } = stage(3.8, 3.3);
    const G = lightGroups([['mark', '示廓灯']]);
    hitchFrame(body, M, 0.85, 0.55);
    addBox(body, 1.15, 0.62, 2.3, -0.28, 0.86, 0, M.body);
    addBox(body, 1.05, 0.06, 2.15, -0.28, 1.18, 0, M.dark);
    const rotor = new THREE.Group();
    rotor.position.set(-0.28, 0.4, 0);
    body.add(rotor);
    addCyl(rotor, M.steel, 0.2, 0.2, 2.05, 0, 0, 0, AXLE, 12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const blade = addBox(rotor, 0.04, 0.26, 1.85, Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0, M.dark);
      blade.rotation.z = a;
    }
    addBox(body, 0.08, 0.16, 0.4, -0.72, 0.16, 0.95, M.steel);
    addBox(body, 0.08, 0.16, 0.4, -0.72, 0.16, -0.95, M.steel);
    const halos = markerLamps(body, G, M, [[1.15, 1.15, 0.4], [-0.75, 1.15, -1.05]]);
    return finish(g, ring, G, parked(body, M, halos, (p, st) => {
      rotor.rotation.z = st === 'job' ? p * Math.PI * 14 : 0;
    }));
  }

  function subsoiler() {
    const M = palette();
    const { g, body, ring } = stage(3.8, 3.8);
    const G = lightGroups([['mark', '示廓灯']]);
    hitchFrame(body, M, 0.95, 0.48);
    addBox(body, 0.32, 0.24, 2.7, -0.15, 0.95, 0, M.body);
    addBox(body, 0.16, 0.1, 2.5, -0.15, 0.78, 0, M.dark);
    for (const z of [-1.05, -0.52, 0, 0.52, 1.05]) {
      addBox(body, 0.08, 0.7, 0.08, -0.22, 0.55, z, M.steel);
      addBox(body, 0.14, 0.4, 0.07, -0.46, 0.22, z, M.dark, [0, 0, 0.55]);
    }
    const halos = markerLamps(body, G, M, [[1.18, 1.2, 0.32], [-0.15, 1.15, 1.25]]);
    return finish(g, ring, G, parked(body, M, halos));
  }

  function cultivator() {
    const M = palette();
    const { g, body, ring } = stage(3.6, 4.4);
    const G = lightGroups([['mark', '示廓灯']]);
    hitchFrame(body, M, 0.78, 0.42);
    const bar = new THREE.Group();
    body.add(bar);
    addBox(bar, 0.2, 0.16, 3.35, -0.35, 0.62, 0, M.body);
    for (let i = 0; i < 11; i++) {
      addBox(bar, 0.05, 0.36, 0.05, -0.48, 0.38, -1.5 + i * 0.3, M.steel, [0, 0, 0.22]);
    }
    addCyl(body, M.rubber, 0.16, 0.16, 0.1, -0.1, 0.16, 1.55, AXLE, 10);
    addCyl(body, M.rubber, 0.16, 0.16, 0.1, -0.1, 0.16, -1.55, AXLE, 10);
    const halos = markerLamps(body, G, M, [[1.12, 1.02, 0.28], [-0.35, 0.78, 1.6]]);
    return finish(g, ring, G, parked(body, M, halos, (p, st) => {
      bar.position.y = st === 'job' ? Math.sin(p * Math.PI * 2) * 0.04 : 0;
    }));
  }

  function fertilizer() {
    const M = palette();
    const { g, body, ring } = stage(4.2, 4.0);
    const G = lightGroups([['mark', '示廓灯'], ['level', '料位灯']]);
    hitchFrame(body, M, 0.9, 0.5);
    addBox(body, 1.25, 0.85, 1.45, -0.15, 1.4, 0, M.body);
    addBox(body, 1.05, 0.32, 1.25, -0.15, 0.9, 0, M.body);
    addBox(body, 1.15, 0.06, 1.35, -0.15, 1.85, 0, M.dark);
    const disc = new THREE.Group();
    disc.position.set(-0.9, 0.4, 0);
    body.add(disc);
    addCyl(disc, M.steel, 0.4, 0.4, 0.05, 0, 0, 0, null, 14);
    for (let i = 0; i < 7; i++) addBox(body, 0.06, 0.42, 0.06, -0.35, 0.48, -0.9 + i * 0.3, M.dark);
    const level = G.level.meshes;
    addBox(body, 0.08, 0.26, 0.05, -0.15, 1.45, 0.76, M.level, null, level, true);
    addHalo(body, level, '#9ad7cf', 0.38, -0.15, 1.45, 0.76);
    const halos = markerLamps(body, G, M, [[1.18, 1.15, 0.32], [-0.7, 1.75, -0.65]]);
    return finish(g, ring, G, parked(body, M, halos, (p, st) => {
      disc.rotation.y = st === 'job' ? p * Math.PI * 10 : 0;
    }));
  }

  function sprayer() {
    const M = palette();
    const { g, body, ring } = stage(4.4, 9.2);
    const G = lightGroups([['mark', '示廓灯'], ['nozzle', '喷头']]);
    hitchFrame(body, M, 1.05, 0.48);
    addCyl(body, M.body, 0.62, 0.62, 1.45, -0.15, 1.15, 0, ALONG_X, 16);
    addCyl(body, M.dark, 0.64, 0.64, 0.08, 0.35, 1.15, 0, ALONG_X, 16);
    addBox(body, 1.2, 0.14, 1.25, -0.15, 0.48, 0, M.dark);
    const nozzles = G.nozzle.meshes;
    const wing = (sign) => {
      const w = new THREE.Group();
      w.position.set(-0.15, 1.22, sign * 0.8);
      body.add(w);
      addBox(w, 0.1, 0.1, 3.2, 0, 0, sign * 1.6, M.steel);
      addBox(w, 0.08, 0.2, 0.08, 0, -0.12, sign * 3.1, M.dark);
      for (let i = 0; i < 5; i++) {
        const z = sign * (0.5 + i * 0.58);
        addBox(w, 0.05, 0.08, 0.05, 0, -0.1, z, M.nozzle, null, nozzles, true);
        addHalo(w, nozzles, '#c8fff4', 0.26, 0, -0.14, z);
      }
      return w;
    };
    const left = wing(1);
    const right = wing(-1);
    const halos = markerLamps(body, G, M, [[1.2, 1.35, 0.28], [-0.85, 1.65, 0]]);
    return finish(g, ring, G, parked(body, M, halos, (p, st) => {
      const fold = st === 'job' ? 0.04 + Math.sin(p * Math.PI * 2) * 0.02 : 1.12;
      left.rotation.x = -fold;
      right.rotation.x = fold;
    }));
  }

  function seeder() {
    const M = palette();
    const { g, body, ring } = stage(4.0, 4.4);
    const G = lightGroups([['mark', '示廓灯']]);
    hitchFrame(body, M, 0.95, 0.4);
    addBox(body, 0.7, 0.62, 3.25, -0.1, 1.25, 0, M.body);
    addBox(body, 0.6, 0.05, 3.1, -0.1, 1.58, 0, M.dark);
    const hubs = [];
    for (let i = 0; i < 8; i++) {
      const z = -1.26 + i * 0.36;
      addBox(body, 0.05, 0.38, 0.05, -0.15, 0.78, z, M.dark);
      const hub = new THREE.Group();
      hub.position.set(-0.55, 0.28, z);
      hub.rotation.z = i % 2 ? 0.4 : -0.4;
      body.add(hub);
      addCyl(hub, M.steel, 0.2, 0.2, 0.04, 0, 0, 0, null, 10);
      hubs.push(hub);
    }
    const halos = markerLamps(body, G, M, [[1.16, 1.18, 0.24], [-0.1, 1.55, 1.55]]);
    return finish(g, ring, G, parked(body, M, halos, (p, st) => {
      const a = st === 'job' ? p * Math.PI * 8 : 0;
      for (const h of hubs) h.rotation.y = a;
    }));
  }

  function potatoPlanter() {
    const M = palette();
    const { g, body, ring } = stage(4.8, 3.6);
    const G = lightGroups([['mark', '示廓灯']]);
    hitchFrame(body, M, 1.05, 0.46);
    addBox(body, 1.15, 1.1, 1.65, -0.05, 1.5, 0, M.body);
    addBox(body, 1.02, 0.06, 1.5, -0.05, 2.07, 0, M.dark);
    addBox(body, 0.4, 0.55, 1.4, -0.2, 0.72, 0, M.dark);
    for (const z of [-0.72, -0.24, 0.24, 0.72]) {
      addBox(body, 0.48, 0.08, 0.1, -0.85, 0.24, z, M.steel, [0, 0, -0.45]);
    }
    const discs = [];
    for (const z of [-0.95, -0.42, 0.42, 0.95]) {
      const hub = new THREE.Group();
      hub.position.set(-1.35, 0.32, z);
      hub.rotation.z = z > 0 ? -0.5 : 0.5;
      body.add(hub);
      addCyl(hub, M.steel, 0.22, 0.22, 0.045, 0, 0, 0, null, 10);
      discs.push(hub);
    }
    const halos = markerLamps(body, G, M, [[1.2, 1.28, 0.28], [-0.05, 2.02, 0.72]]);
    return finish(g, ring, G, parked(body, M, halos, (p, st) => {
      const a = st === 'job' ? p * Math.PI * 8 : 0;
      for (const d of discs) d.rotation.y = a;
    }));
  }

  function haulm() {
    const M = palette();
    const { g, body, ring } = stage(3.6, 3.4);
    const G = lightGroups([['mark', '示廓灯']]);
    hitchFrame(body, M, 0.8, 0.58);
    addBox(body, 1.15, 0.5, 2.4, -0.35, 0.78, 0, M.body);
    addBox(body, 1.05, 0.06, 2.25, -0.35, 1.05, 0, M.dark);
    const rotor = new THREE.Group();
    rotor.position.set(-0.35, 0.4, 0);
    body.add(rotor);
    addCyl(rotor, M.steel, 0.12, 0.12, 2.15, 0, 0, 0, AXLE, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const flail = addBox(rotor, 0.04, 0.2, 0.14, Math.cos(a) * 0.2, Math.sin(a) * 0.2, -0.85 + (i % 4) * 0.55, M.dark);
      flail.rotation.z = a;
    }
    const halos = markerLamps(body, G, M, [[1.12, 1.05, 0.34], [-0.8, 1.02, -1.1]]);
    return finish(g, ring, G, parked(body, M, halos, (p, st) => {
      rotor.rotation.z = st === 'job' ? p * Math.PI * 16 : 0;
    }));
  }

  function trailer() {
    const M = palette();
    const { g, body, ring } = stage(7.8, 3.4);
    const G = lightGroups([['tail', '尾灯']]);
    addBox(body, 1.45, 0.08, 0.08, 2.2, 0.62, 0, M.steel);
    addBox(body, 0.14, 0.14, 0.14, 2.9, 0.58, 0, M.tick);
    addBox(body, 4.3, 0.24, 2.05, -0.3, 0.88, 0, M.dark);
    addBox(body, 4.0, 1.25, 1.95, -0.35, 1.62, 0, M.body);
    addBox(body, 4.05, 0.06, 2.0, -0.35, 2.26, 0, M.dark);
    addBox(body, 3.9, 0.06, 1.98, -0.35, 1.15, 0, M.dark);
    const wheels = [
      ...axle(body, M, 0.65, 0.46, 1.15, 0.28),
      ...axle(body, M, -1.3, 0.46, 1.15, 0.28),
    ];
    const tails = G.tail.meshes;
    addBox(body, 0.05, 0.12, 0.26, -2.38, 1.15, 0.68, M.beacon, null, tails, true);
    addBox(body, 0.05, 0.12, 0.26, -2.38, 1.15, -0.68, M.beacon, null, tails, true);
    const halos = [
      ...addHalo(body, tails, '#e2b15c', 0.38, -2.38, 1.15, 0.68),
      ...addHalo(body, tails, '#e2b15c', 0.38, -2.38, 1.15, -0.68),
    ];
    return finish(g, ring, G, parked(body, M, halos, (p, st) => spinWheels(wheels, st, p)));
  }

  function bedder() {
    const M = palette();
    const { g, body, ring } = stage(3.8, 3.6);
    const G = lightGroups([['mark', '示廓灯']]);
    hitchFrame(body, M, 0.82, 0.5);
    addBox(body, 0.26, 0.18, 2.4, -0.2, 0.7, 0, M.body);
    const shells = new THREE.Group();
    body.add(shells);
    for (const z of [-0.62, 0.62]) {
      addBox(shells, 0.85, 0.38, 0.62, -0.75, 0.42, z, M.steel);
      addBox(shells, 0.65, 0.28, 0.07, -0.85, 0.4, z + Math.sign(z) * 0.36, M.dark, [0, Math.sign(z) * 0.5, 0]);
    }
    const halos = markerLamps(body, G, M, [[1.16, 1.08, 0.28], [-0.95, 0.68, 1.0]]);
    return finish(g, ring, G, parked(body, M, halos, (p, st) => {
      shells.position.y = st === 'job' ? Math.sin(p * Math.PI * 2) * 0.03 : 0;
    }));
  }

  function orbitBoom() {
    const M = palette();
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CircleGeometry(20, 48), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -0.02;
    pad.receiveShadow = true;
    g.add(pad);
    addBox(g, 32, 0.1, 0.14, 0, 1.35, 0.32, M.steel);
    addBox(g, 32, 0.1, 0.14, 0, 1.35, -0.32, M.steel);
    for (let i = 0; i <= 4; i++) {
      const x = -16 + i * 8;
      addBox(g, 0.14, 1.3, 0.14, x, 0.65, 0.5, M.dark);
      addBox(g, 0.14, 1.3, 0.14, x, 0.65, -0.5, M.dark);
      addBox(g, 0.1, 0.1, 1.2, x, 0.42, 0, M.dark);
    }
    const G = lightGroups([['truss', '桁架灯'], ['nozzle', '喷头']]);
    const car = new THREE.Group();
    g.add(car);
    addBox(car, 2.3, 1.35, 1.5, 0, 2.15, 0, M.body);
    addBox(car, 2.15, 0.07, 1.4, 0, 2.85, 0, M.dark);
    addCyl(car, M.steel, 0.34, 0.38, 0.85, -0.75, 2.35, 0, null, 12);
    addBox(car, 0.08, 0.55, 1.15, 1.18, 2.15, 0, M.glass);
    addBox(car, 0.1, 0.1, 14, 0, 2.55, 0, M.steel);
    addBox(car, 0.08, 0.08, 14, 0, 2.15, 0, M.dark);
    for (let i = 0; i <= 6; i++) addBox(car, 0.06, 0.4, 0.06, 0, 2.35, -6 + i * 2, M.dark);
    const truss = G.truss.meshes;
    addBox(car, 7.5, 0.05, 0.05, 0, 2.64, 0, M.lamp, null, truss, true);
    addHalo(car, truss, '#e2b15c', 1.3, 0, 2.64, 0);
    const beacon = addCyl(car, M.beacon, 0.09, 0.11, 0.18, 0, 3.08, 0, null, 8);
    beacon.castShadow = false;
    truss.push(beacon);
    const halos = addHalo(car, truss, '#e2b15c', 0.65, 0, 3.08, 0);
    const nozzles = G.nozzle.meshes;
    for (let i = 0; i < 9; i++) {
      const z = -5.6 + i * 1.4;
      addBox(car, 0.07, 0.1, 0.07, 0, 2.02, z, M.nozzle, null, nozzles, true);
      addHalo(car, nozzles, '#c8fff4', 0.32, 0, 1.92, z);
    }
    const ring = salmonRing(34, 16, 0.1);
    g.add(ring);
    return finish(g, ring, G, (p, st) => {
      const job = st === 'job';
      const br = st === 'break';
      car.position.x = job ? -11 + p * 22 : br ? 4.5 : 0;
      car.position.z = br ? 0.3 : 0;
      car.rotation.z = br ? 0.05 : 0;
      paint(M, halos, st);
    });
  }

  // 无人机从坪面出击再落回。不进机库，也不做田边补喷。
  function ease(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  function heading(x, z, x2, z2, fallback) {
    const dx = x2 - x;
    const dz = z2 - z;
    if (dx * dx + dz * dz < 1e-8) return fallback;
    return Math.atan2(dx, dz);
  }

  function rotor(parent, M, x, y, z, r) {
    const hub = new THREE.Group();
    hub.position.set(x, y, z);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.06, 8), M.dark);
    can.castShadow = true;
    hub.add(can);
    addBox(hub, r * 1.65, 0.016, 0.05, 0, 0.04, 0, M.steel);
    addBox(hub, 0.05, 0.016, r * 1.65, 0, 0.046, 0, M.steel);
    parent.add(hub);
    return hub;
  }

  function makeDrone(M, kind, navList, bellyList) {
    const treat = kind === 'treat';
    const root = new THREE.Group();
    root.userData.kind = kind;
    const bodyW = treat ? 0.96 : 0.72;
    const bodyH = treat ? 0.24 : 0.2;
    const bodyD = treat ? 0.52 : 0.42;
    const bodyY = treat ? 0.46 : 0.34;
    const armR = treat ? 0.98 : 0.74;
    const blade = treat ? 0.28 : 0.22;
    for (const s of [-1, 1]) {
      const z = s * (treat ? 0.24 : 0.18);
      addBox(root, bodyW * 0.72, 0.04, 0.045, 0, 0.07, z, M.dark);
      addBox(root, 0.04, 0.16, 0.04, bodyW * 0.22, 0.16, z, M.steel);
      addBox(root, 0.04, 0.16, 0.04, -bodyW * 0.22, 0.16, z, M.steel);
    }
    addBox(root, bodyW, bodyH, bodyD, 0, bodyY, 0, M.body);
    addBox(root, bodyW * 1.04, 0.03, bodyD * 1.06, 0, bodyY - bodyH * 0.46, 0, M.dark);
    addBox(root, bodyW * 0.42, bodyH * 0.55, bodyD * 0.62, bodyW * 0.58, bodyY - 0.01, 0, M.body);
    addBox(root, bodyW * 0.46, bodyH * 0.34, 0.04, 0.02, bodyY + 0.02, bodyD * 0.52, M.tick);
    addBox(root, bodyW * 0.36, bodyH * 0.28, bodyD * 0.7, 0, bodyY + bodyH * 0.48, 0, M.glass);
    addBox(root, 0.028, bodyH * 0.28, bodyD * 0.72, 0, bodyY + bodyH * 0.48, 0, M.dark);
    addCyl(root, M.dark, 0.025, 0.03, 0.22, -bodyW * 0.08, bodyY + bodyH * 0.62, -bodyD * 0.12, null, 6);
    const rotors = [];
    const armNear = treat ? 0.34 : 0.26;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = sx * armR * Math.SQRT1_2;
      const z = sz * armR * Math.SQRT1_2;
      const mid = (armR + armNear) / 2;
      addBox(root, armR - armNear, 0.04, 0.055, sx * mid * Math.SQRT1_2, bodyY + 0.02, sz * mid * Math.SQRT1_2, M.dark, [0, -Math.atan2(sz, sx), 0]);
      rotors.push(rotor(root, M, x, bodyY + 0.1, z, blade));
    }
    const navHalos = [];
    navHalos.push(...addHalo(root, navList, '#e2b15c', 0.3, bodyW * 0.62, bodyY, 0));
    navHalos.push(...addHalo(root, navList, '#e2b15c', 0.26, -bodyW * 0.5, bodyY, 0));
    addBox(root, 0.06, 0.05, 0.07, bodyW * 0.62, bodyY, 0, M.beacon, null, navList, true);
    addBox(root, 0.05, 0.045, 0.06, -bodyW * 0.5, bodyY, 0, M.beacon, null, navList, true);
    const bellyHalos = [];
    if (treat) {
      addCyl(root, M.steel, 0.16, 0.18, 0.28, -0.04, 0.28, 0, null, 12);
      addBox(root, 0.3, 0.04, 0.3, -0.04, 0.43, 0, M.dark);
      addBox(root, 0.22, 0.025, 0.035, -0.04, 0.3, 0.16, M.tick);
      const tip = addBox(root, 0.08, 0.1, 0.08, -0.04, 0.12, 0, M.nozzle, null, bellyList, true);
      tip.castShadow = false;
      bellyHalos.push(...addHalo(root, bellyList, '#c8fff4', 0.34, -0.04, 0.06, 0));
    } else {
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.09, 10), M.scan);
      eye.position.set(0.12, 0.2, 0);
      eye.castShadow = false;
      root.add(eye);
      if (bellyList) bellyList.push(eye);
      addBox(root, 0.22, 0.04, 0.18, 0.12, 0.26, 0, M.dark);
      bellyHalos.push(...addHalo(root, bellyList, '#8fcaff', 0.38, 0.12, 0.12, 0));
    }
    return { root, rotors, navHalos, bellyHalos };
  }

  function setDrone(drone, pose, spin) {
    drone.root.position.set(pose.x, pose.y, pose.z);
    drone.root.rotation.set(pose.roll || 0, pose.yaw, pose.pitch || 0);
    for (const hub of drone.rotors) hub.rotation.y = spin;
  }

  function parkDroneMesh(drone, st, home) {
    if (st === 'break') setDrone(drone, { x: home.x, y: home.y, z: home.z, yaw: home.yaw + 0.4, roll: 0.22 }, 0.2);
    else setDrone(drone, home, 0);
  }

  function scoutPose(u, home, reach) {
    const liftEnd = 0.14;
    const cruiseEnd = 0.84;
    if (u < liftEnd) {
      const e = ease(u / liftEnd);
      return { x: home.x, y: home.y + e * home.hop, z: home.z, yaw: home.yaw, spin: e };
    }
    if (u < cruiseEnd) {
      const t = (u - liftEnd) / (cruiseEnd - liftEnd);
      const ang = t * Math.PI * 2;
      const out = (1 - Math.cos(ang)) * 0.5;
      const side = Math.sin(ang) * 0.38;
      const x = home.x + Math.sin(home.phase) * reach * out + Math.cos(home.phase) * reach * side;
      const z = home.z + Math.cos(home.phase) * reach * out - Math.sin(home.phase) * reach * side;
      const ang2 = ang + 0.08;
      const out2 = (1 - Math.cos(ang2)) * 0.5;
      const side2 = Math.sin(ang2) * 0.38;
      const x2 = home.x + Math.sin(home.phase) * reach * out2 + Math.cos(home.phase) * reach * side2;
      const z2 = home.z + Math.cos(home.phase) * reach * out2 - Math.sin(home.phase) * reach * side2;
      return { x, y: home.y + home.hop, z, yaw: heading(x, z, x2, z2, home.phase), spin: 1 };
    }
    const e = ease((u - cruiseEnd) / (1 - cruiseEnd));
    return { x: home.x, y: home.y + (1 - e) * home.hop, z: home.z, yaw: home.yaw, spin: 1 - e };
  }

  function treatPose(u, home, reach) {
    const depart = 0.24;
    const dwell = 0.72;
    const ox = Math.sin(home.phase) * reach;
    const oz = Math.cos(home.phase) * reach;
    if (u < depart) {
      const e = ease(u / depart);
      return { x: home.x + ox * e, y: home.y + home.hop * ease(Math.min(1, u / 0.16)), z: home.z + oz * e, yaw: home.phase, spin: 1 };
    }
    if (u < dwell) {
      return { x: home.x + ox, y: home.y + home.hop, z: home.z + oz, yaw: home.phase, spin: 1, dwell: true };
    }
    const e = ease((u - dwell) / (1 - dwell));
    const lift = 1 - ease(Math.max(0, (u - 0.88) / 0.12));
    return { x: home.x + ox * (1 - e), y: home.y + home.hop * lift, z: home.z + oz * (1 - e), yaw: home.phase + Math.PI, spin: Math.max(lift, 0.15) };
  }

  function flyDrone(drone, st, p, home, reach, kind) {
    if (st !== 'job') {
      parkDroneMesh(drone, st, home);
      return null;
    }
    const pose = kind === 'treat' ? treatPose(p, home, reach) : scoutPose(p, home, reach);
    setDrone(drone, pose, pose.spin * p * Math.PI * 26);
    return pose;
  }

  function landingMark(parent, M, x, y, z, r) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 18), M.dark);
    disc.position.set(x, y, z);
    disc.receiveShadow = true;
    parent.add(disc);
    addBox(parent, r * 0.42, 0.012, 0.045, x - r * 0.16, y + 0.02, z + r * 0.28, M.tick, [0, 0.45, 0]);
    addBox(parent, r * 0.42, 0.012, 0.045, x + r * 0.16, y + 0.02, z + r * 0.28, M.tick, [0, -0.45, 0]);
  }

  function droneScout() {
    const M = palette();
    const { g, body, ring } = stage(3.6, 3.6);
    const G = lightGroups([['nav', '航行灯'], ['scan', '探头']]);
    landingMark(g, M, 0, 0.02, 0, 0.85);
    const drone = makeDrone(M, 'scout', G.nav.meshes, G.scan.meshes);
    body.add(drone.root);
    const home = { x: 0, y: 0.03, z: 0, yaw: 0.55, hop: 1.55, phase: 0.7 };
    return finish(g, ring, G, (p, st) => {
      paint(M, drone.navHalos, st);
      const pose = flyDrone(drone, st, p, home, 2.15, 'scout');
      const pulse = st === 'break' ? 0.04 : st === 'job' ? 0.7 + Math.sin(p * Math.PI * 8) * 0.3 : st === 'sel' ? 0.72 : 0.34;
      if (pose && !pose.dwell) M.scan.emissiveIntensity = 1.5 + Math.sin(p * Math.PI * 10) * 0.9;
      fadeHalos(drone.bellyHalos, pulse);
    });
  }

  function droneTreat() {
    const M = palette();
    const { g, body, ring } = stage(4.2, 4.2);
    const G = lightGroups([['nav', '航行灯'], ['treat', '处理灯']]);
    landingMark(g, M, 0, 0.02, 0, 1.05);
    const drone = makeDrone(M, 'treat', G.nav.meshes, G.treat.meshes);
    body.add(drone.root);
    const home = { x: 0, y: 0.03, z: 0, yaw: 0.45, hop: 1.45, phase: 0.55 };
    return finish(g, ring, G, (p, st) => {
      paint(M, drone.navHalos, st);
      const pose = flyDrone(drone, st, p, home, 2.35, 'treat');
      if (pose && pose.dwell) M.nozzle.emissiveIntensity = 1.3 + Math.sin(p * Math.PI * 16) * 1.15;
      fadeHalos(drone.bellyHalos, st === 'break' ? 0.04 : st === 'job' ? (pose && pose.dwell ? 1 : 0.28) : st === 'sel' ? 0.6 : 0.22);
    });
  }

  function droneBase() {
    const M = palette();
    const g = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9.4, 48), padMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    g.add(ground);
    const deck = new THREE.Group();
    g.add(deck);
    addBox(deck, 7.4, 0.08, 0.18, 0, 0.05, -2.05, M.dark);
    addBox(deck, 7.4, 0.08, 0.18, 0, 0.05, 2.35, M.dark);
    addBox(deck, 8.4, 0.14, 5.6, 0, 0.16, 0.2, M.body);
    addBox(deck, 8.55, 0.035, 5.75, 0, 0.07, 0.2, M.dark);
    addBox(deck, 6.4, 0.02, 0.05, 0, 0.25, 2.88, M.tick);
    landingMark(deck, M, -2.15, 0.25, 0.45, 1.05);
    landingMark(deck, M, 2.15, 0.25, 0.45, 1.05);
    const cabinet = new THREE.Group();
    deck.add(cabinet);
    addBox(cabinet, 1.7, 1.28, 0.82, 0, 0.92, -1.85, M.body);
    addBox(cabinet, 1.78, 0.06, 0.9, 0, 1.58, -1.85, M.dark);
    addBox(cabinet, 1.74, 0.045, 0.86, 0, 0.32, -1.85, M.dark);
    addBox(cabinet, 0.06, 0.38, 0.52, 0.86, 1.12, -1.85, M.glass);
    addBox(cabinet, 0.72, 0.04, 0.035, 0, 1.02, -1.43, M.tick);
    addBox(cabinet, 0.48, 0.62, 0.02, -0.28, 0.9, -1.43, M.dark);
    addCyl(cabinet, M.steel, 0.035, 0.045, 0.7, 0.42, 1.95, -1.85, null, 6);
    const G = lightGroups([['pad', '坪灯'], ['beacon', '信标']]);
    for (const [x, z] of [[-3.85, 2.65], [3.85, 2.65], [-3.85, -2.15], [3.85, -2.15]]) {
      addBox(deck, 0.1, 0.06, 0.1, x, 0.28, z, M.lamp, null, G.pad.meshes, true);
      addHalo(deck, G.pad.meshes, '#e2b15c', 0.42, x, 0.3, z);
    }
    for (const x of [-2.15, 2.15]) {
      addBox(deck, 0.07, 0.42, 0.07, x, 0.5, -0.7, M.steel);
      addBox(deck, 0.12, 0.045, 0.12, x, 0.74, -0.7, M.lamp, null, G.pad.meshes, true);
      addHalo(deck, G.pad.meshes, '#e2b15c', 0.3, x, 0.76, -0.7);
    }
    const beaconHalos = beaconMast(cabinet, G, M, 0.42, 2.42, -1.85);
    const scout = makeDrone(M, 'scout');
    const treat = makeDrone(M, 'treat');
    deck.add(scout.root, treat.root);
    const homes = {
      scout: { x: -2.15, y: 0.28, z: 0.45, yaw: 0.4, hop: 1.65, phase: -0.85 },
      treat: { x: 2.15, y: 0.28, z: 0.45, yaw: -0.35, hop: 1.5, phase: 0.85 },
    };
    const ring = salmonRing(10.6, 8.2, 0.12);
    g.add(ring);
    const navHalos = beaconHalos.concat(scout.navHalos, treat.navHalos);
    return finish(g, ring, G, (p, st) => {
      paint(M, navHalos, st);
      cabinet.rotation.z = st === 'break' ? 0.08 : 0;
      cabinet.position.x = st === 'break' ? 0.1 : 0;
      const scoutPoseNow = flyDrone(scout, st, p, homes.scout, 3.5, 'scout');
      const treatPoseNow = flyDrone(treat, st, p, homes.treat, 3.3, 'treat');
      if (st === 'job') {
        M.scan.emissiveIntensity = scoutPoseNow ? 1.6 + Math.sin(p * Math.PI * 10) * 0.8 : 0.28;
        M.nozzle.emissiveIntensity = treatPoseNow && treatPoseNow.dwell ? 1.4 + Math.sin(p * Math.PI * 16) * 1.1 : 0.45;
      }
      fadeHalos(scout.bellyHalos, st === 'break' ? 0.04 : st === 'job' ? 0.85 : 0.3);
      fadeHalos(treat.bellyHalos, st === 'break' ? 0.04 : st === 'job' && treatPoseNow && treatPoseNow.dwell ? 1 : 0.24);
    });
  }

  return {
    tractor_gen: tractorGen,
    harvester_combine: combine,
    harvester_potato: potatoHarvester,
    harvester_cabbage: cabbageHarvester,
    transplanter,
    impl_rotavator: rotavator,
    impl_subsoiler: subsoiler,
    impl_cultivator: cultivator,
    impl_fertilizer: fertilizer,
    impl_sprayer: sprayer,
    impl_seeder: seeder,
    impl_potato_planter: potatoPlanter,
    impl_haulm: haulm,
    impl_trailer: trailer,
    impl_bedder: bedder,
    orbit_boom: orbitBoom,
    drone_scout: droneScout,
    drone_treat: droneTreat,
    device_drone_base: droneBase,
  };
}
